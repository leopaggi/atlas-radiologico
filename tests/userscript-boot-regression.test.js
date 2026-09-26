'use strict';

/* Regressão de boot da 091g (userscript 1.4.2). Executa o userscript
 * COMPLETO (o arquivo inteiro, como o Tampermonkey faz) num DOM simulado em
 * `vm`, nas URLs reais de caso do Radiopaedia, e confere que o botão
 * "📥 Enviar ao Atlas" SEMPRE existe — com ponte, sem BroadcastChannel, sem
 * GM_*, com GM_* lançando erro, com o Atlas fechado — e que o clique
 * reutiliza a aba aberta (ponte) ou cai no fallback (window.open nomeado).
 * O Atlas aberto é OUTRA execução do mesmo arquivo completo na URL do Atlas
 * (ponte) + uma página do Atlas simulada no BroadcastChannel da origem.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js'), 'utf8');
const RP_URLS = ['https://radiopaedia.org/cases/acute-appendicitis-170', 'https://www.radiopaedia.org/cases/acute-appendicitis-170'];
const ATLAS_URL = 'https://leopaggi.github.io/atlas-radiologico/';
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 20));

function makeGM(mode) {
  const store = {}; const listeners = []; let seq = 1;
  return (owner) => {
    if (mode === 'none') return {};
    if (mode === 'throws') return { GM_setValue() { throw new Error('gm'); }, GM_addValueChangeListener() { throw new Error('gm'); }, GM_removeValueChangeListener() { throw new Error('gm'); } };
    return {
      GM_setValue(k, v) { const old = store[k]; store[k] = structuredClone(v); for (const l of listeners.slice()) if (l.k === k) setTimeout(() => l.fn(k, old, structuredClone(v), l.owner !== owner), 0); },
      GM_addValueChangeListener(k, fn) { const id = seq++; listeners.push({ id, k, fn, owner }); return id; },
      GM_removeValueChangeListener(id) { const i = listeners.findIndex((l) => l.id === id); if (i >= 0) listeners.splice(i, 1); }
    };
  };
}
function makeBCHub() {
  const members = new Set();
  return class FakeBC {
    constructor(name) { this.name = name; this.onmessage = null; members.add(this); }
    postMessage(d) { const c = structuredClone(d); for (const m of members) if (m !== this && m.name === this.name) setTimeout(() => m.onmessage && m.onmessage({ data: structuredClone(c) }), 0); }
    close() { members.delete(this); }
  };
}

// DOM mínimo e FIEL ao que o userscript usa (querySelector/All, createElement,
// getElementById, body.appendChild, readyState/DOMContentLoaded, remove()).
function fakePage(url, opts) {
  const o = opts || {};
  const els = [];
  const meta = { 'meta[property="og:title"]': { getAttribute: (k) => (k === 'content' ? 'Acute appendicitis | Radiology Case | Radiopaedia.org' : null) },
    'link[rel="canonical"]': { getAttribute: (k) => (k === 'href' ? 'https://radiopaedia.org/cases/acute-appendicitis-170' : null) },
    'h1.case-title': { innerText: 'Acute appendicitis' } };
  const listeners = {};
  const body = {
    innerText: 'Presentation RLQ pain Patient Data Age: 25 years Gender: Female MRI',
    appendChild(el) { el.parentNode = body; els.push(el); return el; }
  };
  const document = {
    readyState: o.readyState || 'complete', title: 'Acute appendicitis | Radiology Case | Radiopaedia.org', body, documentElement: body,
    getElementById: (id) => els.find((e) => e.id === id) || null,
    querySelector: (sel) => meta[sel] || null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    createElement: (tag) => {
      const el = { tagName: String(tag).toUpperCase(), id: '', style: {}, textContent: '', _l: {},
        addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
        click() { (this._l.click || []).forEach((fn) => fn({})); },
        remove() { const i = els.indexOf(this); if (i >= 0) els.splice(i, 1); } };
      return el;
    }
  };
  return { document, els, fire: (ev) => (listeners[ev] || []).forEach((fn) => fn()), url };
}

function runUserscript(url, opts) {
  const o = opts || {};
  const page = fakePage(url, o);
  const intervals = [];
  const opened = [];
  const ctx = {
    document: page.document,
    window: { location: { href: url }, open: (u, name) => { opened.push([u, name]); return { focus() {} }; } },
    alert: (m) => { throw new Error('alert inesperado: ' + m); },
    setTimeout, clearTimeout, setInterval: (fn, ms) => { intervals.push([fn, ms]); return intervals.length; },
    TextEncoder, btoa, encodeURIComponent, decodeURIComponent, URL, console
  };
  if (o.BroadcastChannel) ctx.BroadcastChannel = o.BroadcastChannel;
  Object.assign(ctx, o.gm || {});
  vm.createContext(ctx);
  let error = null;
  try { vm.runInContext(SRC, ctx, { filename: 'radiopaedia-to-atlas.user.js' }); } catch (e) { error = e; }
  return { page, intervals, opened, error, button: () => page.document.getElementById('atlas-send-btn') };
}

test('1-5: o botão existe nos DOIS hosts com ponte, sem BroadcastChannel, sem GM_*, com GM_* lançando erro e com o Atlas fechado', () => {
  const variants = {
    'ponte disponível': { gm: makeGM('ok')('rp'), BroadcastChannel: makeBCHub() },
    'sem BroadcastChannel': { gm: makeGM('ok')('rp') },
    'GM_* indisponível': { gm: makeGM('none')('rp'), BroadcastChannel: makeBCHub() },
    'GM_* lançando exceção': { gm: makeGM('throws')('rp'), BroadcastChannel: makeBCHub() },
    'Atlas fechado (nenhuma ponte)': { gm: makeGM('ok')('rp'), BroadcastChannel: makeBCHub() },
    'página ainda carregando': { gm: makeGM('ok')('rp'), readyState: 'loading' }
  };
  for (const url of RP_URLS) {
    for (const [name, opts] of Object.entries(variants)) {
      const r = runUserscript(url, opts);
      assert.equal(r.error, null, name + ': o script não pode lançar');
      if (opts.readyState === 'loading') { assert.equal(r.button(), null); r.page.fire('DOMContentLoaded'); }
      assert.notEqual(r.button(), null, url + ' — ' + name + ': document.getElementById("atlas-send-btn") !== null');
      assert.equal(r.button().textContent, '📥 Enviar ao Atlas');
      assert.deepEqual(r.intervals.map((i) => i[1]), [5000], 'setInterval(mountButton, 5000) como na 1.3.0');
    }
  }
});

test('10: o botão reaparece depois de removido do DOM (setInterval da 1.3.0)', () => {
  const r = runUserscript(RP_URLS[0], { gm: makeGM('ok')('rp') });
  r.button().remove();
  assert.equal(r.button(), null);
  r.intervals[0][0]();
  assert.notEqual(r.button(), null);
  r.intervals[0][0]();
  assert.equal(r.page.els.filter((e) => e.id === 'atlas-send-btn').length, 1, 'nunca duplica');
});

test('na página do Atlas o script é SÓ ponte: sem botão, sem setInterval, sem erro (mesmo com GM_* lançando)', () => {
  for (const gm of ['ok', 'none', 'throws']) {
    const r = runUserscript(ATLAS_URL, { gm: makeGM(gm)('atlas'), BroadcastChannel: makeBCHub() });
    assert.equal(r.error, null, gm);
    assert.equal(r.button(), null, gm);
    assert.equal(r.intervals.length, 0, gm);
  }
});

function decode(url) {
  const b64 = decodeURIComponent(url.slice(url.indexOf('#external-import=') + '#external-import='.length));
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

test('6/9: com o Atlas ABERTO, o clique reutiliza a aba (ponte real) — nenhum window.open; payload idêntico ao do fallback', async () => {
  const gm = makeGM('ok');
  const BC = makeBCHub();
  // aba do Atlas: o MESMO arquivo completo (ponte) + a página do Atlas no canal da origem
  const atlasBridge = runUserscript(ATLAS_URL, { gm: gm('atlas'), BroadcastChannel: BC });
  assert.equal(atlasBridge.error, null);
  const atlasPage = new BC('atlas-radiologico-import');
  const imports = [];
  atlasPage.onmessage = (ev) => {
    const d = ev.data;
    if (d.type === 'ping') atlasPage.postMessage({ type: 'pong', requestId: d.requestId, tabId: 'atlas_tab_1', ready: true });
    if (d.type === 'external-import' && d.tabId === 'atlas_tab_1') imports.push(d.payload);
  };
  const rp = runUserscript(RP_URLS[1], { gm: gm('rp'), BroadcastChannel: BC });
  rp.button().click();
  rp.button().click();
  await tick(1000);
  assert.deepEqual(rp.opened, [], 'aba reutilizada: nenhum window.open');
  assert.equal(imports.length, 2, 'os dois envios chegaram à MESMA aba');
  // mesmo caso, sem ponte: o payload do fallback é idêntico ao entregue pela ponte
  const fb = runUserscript(RP_URLS[1], { gm: makeGM('none')('rp') });
  fb.button().click();
  assert.equal(fb.opened.length, 1);
  assert.deepEqual(decode(fb.opened[0][0]), imports[0], 'payload idêntico');
  assert.deepEqual(imports[0], { source: 'Radiopaedia', title: 'Acute appendicitis', sourceUrl: 'https://radiopaedia.org/cases/acute-appendicitis-170', patientAge: '25', patientSex: 'Female', modality: 'MRI' });
});

test('7: sem resposta (Atlas fechado) o clique abre o fallback — alvo nomeado, uma vez; GM_* lançando também cai no fallback na hora', async () => {
  const rp = runUserscript(RP_URLS[0], { gm: makeGM('ok')('rp'), BroadcastChannel: makeBCHub() });
  rp.button().click();
  await tick(100);
  assert.deepEqual(rp.opened, [], 'espera a resposta da ponte (timeout curto)');
  await tick(800);
  assert.equal(rp.opened.length, 1);
  assert.equal(rp.opened[0][1], 'atlas-radiologico');
  assert.ok(rp.opened[0][0].startsWith(ATLAS_URL + '#external-import='));
  const bad = runUserscript(RP_URLS[0], { gm: makeGM('throws')('rp') });
  bad.button().click();
  assert.equal(bad.opened.length, 1, 'erro da ponte -> fallback imediato');
  const none = runUserscript(RP_URLS[0], { gm: makeGM('none')('rp') });
  none.button().click();
  assert.equal(none.opened.length, 1, 'sem GM_* -> fallback imediato');
});

test('8: título sem branding (091f) no payload enviado', () => {
  const r = runUserscript(RP_URLS[0], { gm: makeGM('none')('rp') });
  r.button().click();
  const p = decode(r.opened[0][0]);
  assert.equal(p.title, 'Acute appendicitis');
  assert.doesNotMatch(JSON.stringify(p), /Radiology Case|Radiopaedia\.org"/);
});

test('boot 1.4.2 = boot da 1.3.0: nada da ponte roda antes do botão; ponte só no Atlas ou no clique', () => {
  const bootIdx = SRC.indexOf("if (!onAtlasPage) {");
  const bridgeStartIdx = SRC.indexOf('try { startAtlasBridge(defaultBridgeEnv()); } catch (_) {}');
  assert.ok(bootIdx > 0 && bridgeStartIdx > bootIdx, 'boot do botão vem antes da ponte');
  assert.match(SRC, /if \(!onAtlasPage\) \{\s*if \(document\.readyState === 'loading'\) \{\s*document\.addEventListener\('DOMContentLoaded', mountButton\);\s*\} else \{\s*mountButton\(\);\s*\}\s*\/\/ Radiopaedia usa navegação parcial em alguns fluxos — reinsere se sumir\.\s*setInterval\(mountButton, 5000\);\s*\}/);
  assert.match(SRC, /try \{\s*sendToAtlasViaBridge\(payload, url, defaultBridgeEnv\(\)\);\s*\} catch \(e\) \{\s*openAtlasWindow\(url\);\s*\}/);
  assert.equal((SRC.match(/GM_setValue\(|GM_addValueChangeListener\(|new env\.BroadcastChannel\(/g) || []).length, 3, 'GM/BC só dentro das funções da ponte');
  assert.doesNotMatch(SRC, /[̀-ͯ]/, 'sem caracteres combinantes invisíveis no arquivo');
  assert.match(SRC, /@version\s+1\.4\.2\b/);
});
