'use strict';

/* PROTEÇÃO 091g — reuso da aba do Atlas via canal. BroadcastChannel só liga
 * abas da MESMA origem; por isso a aba do Radiopaedia fala com a ponte do
 * userscript que roda na aba do Atlas (armazenamento compartilhado do
 * Tampermonkey: GM_setValue/GM_addValueChangeListener) e a ponte repassa pelo
 * BroadcastChannel 'atlas-radiologico-import' da origem do Atlas, que o
 * index.html escuta. Aqui: funções REAIS do userscript (cliente + ponte) e do
 * index.html (canal + pipeline), com GM e BroadcastChannel simulados
 * (entrega assíncrona, cópia estruturada, isolamento por origem).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const userscript = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
function sliceBetween(src, start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start.slice(0, 40));
  return src.slice(a, b);
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));

// ------------------------------------------------ simulações do navegador
// BroadcastChannel: cada origem tem o seu "hub" (isolamento real do navegador).
function makeOriginBC() {
  const members = new Set();
  return class FakeBroadcastChannel {
    constructor(name) { this.name = name; this.onmessage = null; members.add(this); }
    postMessage(data) {
      const copy = structuredClone(data);
      for (const m of members) if (m !== this && m.name === this.name) setTimeout(() => { if (m.onmessage) m.onmessage({ data: structuredClone(copy) }); }, 0);
    }
    close() { members.delete(this); }
  };
}
// Armazenamento do Tampermonkey compartilhado entre abas (listeners em todas).
function makeGMStore() {
  const store = {};
  const listeners = [];
  let seq = 1;
  return {
    env(owner, extra) {
      return Object.assign({
        available: true,
        setValue: (k, v) => {
          const old = store[k]; store[k] = structuredClone(v);
          for (const l of listeners.slice()) if (l.key === k) setTimeout(() => l.fn(k, old, structuredClone(v), l.owner !== owner), 0);
        },
        addListener: (k, fn) => { const id = seq++; listeners.push({ id, key: k, fn, owner }); return id; },
        removeListener: (id) => { const i = listeners.findIndex((l) => l.id === id); if (i >= 0) listeners.splice(i, 1); },
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        timeoutMs: 150
      }, extra || {});
    }
  };
}

// ------------------------------------------------ userscript real
const USERSCRIPT_BRIDGE = [
  ...['ATLAS_URL', 'BRIDGE_PING_KEY', 'BRIDGE_PONG_KEY', 'BRIDGE_IMPORT_KEY', 'ATLAS_IMPORT_CHANNEL', 'BRIDGE_TIMEOUT_MS', 'MAX_FIELD'].map((k) => new RegExp('var ' + k + ' = [^;]+;').exec(userscript)[0]),
  ...['newRequestId', 'sendToAtlasViaBridge', 'startAtlasBridge', 'encodePayload', 'normalizeRadiopaediaCaseTitle', 'buildExternalPayload'].map((n) => extractFunction(userscript, n))
].join('\n');
function userscriptCtx() {
  const ctx = vm.createContext({ Date, Math, JSON, TextEncoder, btoa, encodeURIComponent, openAtlasWindow: () => { throw new Error('usar env.openWindow'); } });
  vm.runInContext(USERSCRIPT_BRIDGE + '\nthis.__us = { sendToAtlasViaBridge, startAtlasBridge, encodePayload, buildExternalPayload };', ctx);
  return ctx.__us;
}

// ------------------------------------------------ Atlas real (canal + pipeline)
const ATLAS_CHANNEL = sliceBetween(html, '/* PROTEÇÃO 091g — canal de importação da aba JÁ ABERTA', '// Gancho pós-boot SEM editar loadData()');
const ATLAS_PIPELINE = [
  /const EXTERNAL_IMPORT_ALLOWED_HOSTS = [^;]+;/.exec(html)[0],
  sliceBetween(html, 'const EXTERNAL_IMPORT_STOPWORDS = ', '\n'),
  ...['validateExternalImportPayload', 'normalizeExternalTitle', 'tokenizeExternalTitle', 'externalCaseSlugTitle', 'normalizeRadiopaediaCaseTitle',
    'reconcileExternalImportTitle', 'processExternalImportPayload', 'externalImportFormBlocked'].map((n) => extractFunction(html, n))
].join('\n');
function atlasTab(BC, opts) {
  const o = opts || {};
  const log = { modals: [], toasts: [], removed: 0 };
  const doc = {
    hidden: !!o.hidden, title: 'Atlas Radiológico',
    querySelector: (sel) => (sel === '.lesion-form-overlay' && log.formOpen ? {} : null),
    querySelectorAll: () => [{ remove() { log.removed += 1; } }],
    addEventListener: () => {}
  };
  log.formOpen = !!o.formOpen;
  const ctx = vm.createContext({
    URL, console: { warn() {}, log() {}, error() {} }, Date, Math, JSON, Set,
    BroadcastChannel: BC, document: doc, window: { focus: () => { log.focus = (log.focus || 0) + 1; } },
    appStateReady: o.ready !== false,
    toast: (m) => log.toasts.push(m),
    openExternalImportModal: (draft) => log.modals.push(structuredClone(draft))
  });
  vm.runInContext(ATLAS_PIPELINE + '\n' + ATLAS_CHANNEL + '\nthis.__atlas = { handleAtlasImportChannelMessage, ATLAS_TAB_ID, ATLAS_IMPORT_BC, startAtlasImportChannel, deliverExternalImportPayload, pending: () => pendingBroadcastImport };', ctx);
  return { api: ctx.__atlas, ctx, log, doc };
}

const PAYLOAD = { source: 'Radiopaedia', sourceUrl: 'https://radiopaedia.org/cases/paraovarian-cyst-12', title: 'Paraovarian cyst', modality: 'MRI', presentation: 'Dor pélvica' };
const URL_FALLBACK = 'https://leopaggi.github.io/atlas-radiologico/#external-import=X';

// Monta o cenário: 1 aba do Radiopaedia + N abas do Atlas (cada uma com página + ponte).
function scenario(opts) {
  const o = opts || {};
  const gm = makeGMStore();
  const atlasOriginBC = makeOriginBC();
  const us = userscriptCtx();
  const tabs = [];
  for (let i = 0; i < (o.atlasTabs == null ? 1 : o.atlasTabs); i++) {
    const tab = atlasTab(atlasOriginBC, o.tab);
    tab.bridge = us.startAtlasBridge(gm.env('atlas' + i, { BroadcastChannel: o.bridgeNoBC ? null : atlasOriginBC }));
    tabs.push(tab);
  }
  const opened = [];
  const notices = [];
  const rpEnv = gm.env('radiopaedia', { openWindow: (u) => opened.push(u), notify: (t) => notices.push(t) }, o.rpEnv);
  return { us, tabs, opened, notices, send: (payload, url) => us.sendToAtlasViaBridge(payload, url || URL_FALLBACK, Object.assign(rpEnv, o.rpEnvOverride || {})) };
}

test('091g 1: a aba do Atlas responde ping com pong (tabId + ready) pelo canal real', () => {
  const t = atlasTab(makeOriginBC());
  const replies = [];
  const res = plain(t.api.handleAtlasImportChannelMessage({ type: 'ping', requestId: 'r1' }, (m) => replies.push(m)));
  assert.equal(res.status, 'pong');
  assert.deepEqual(plain(replies), [{ type: 'pong', requestId: 'r1', tabId: t.api.ATLAS_TAB_ID, ready: true }]);
  assert.match(t.api.ATLAS_TAB_ID, /^atlas_/);
  assert.ok(t.api.ATLAS_IMPORT_BC, 'canal aberto no carregamento');
  assert.match(html, /const ATLAS_IMPORT_CHANNEL = 'atlas-radiologico-import';/);
  assert.match(userscript, /var ATLAS_IMPORT_CHANNEL = 'atlas-radiologico-import';/);
});

test('091g 2-5/10: com a aba do Atlas aberta o userscript recebe pong, NÃO abre aba e o caso chega idêntico ao pipeline real', async () => {
  const sc = scenario();
  assert.equal(sc.send(PAYLOAD), 'pending');
  await tick(80);
  assert.deepEqual(sc.opened, [], 'nenhum window.open');
  assert.equal(sc.notices.length, 1);
  assert.match(sc.notices[0], /Caso enviado para a aba do Atlas já aberta/);
  const modals = sc.tabs[0].log.modals;
  assert.equal(modals.length, 1, 'modal de importação aberto pelo pipeline real');
  for (const [k, v] of Object.entries(PAYLOAD)) assert.equal(modals[0][k], v, 'campo ' + k + ' idêntico ao enviado');
  for (const k of Object.keys(modals[0]).filter((x) => !(x in PAYLOAD))) assert.equal(modals[0][k], '', 'só os padrões vazios do validador existente (' + k + ')');
  await tick(250);
  assert.deepEqual(sc.opened, [], 'o timeout não dispara depois do pong');
});

test('091g 6: envios seguidos usam SEMPRE a mesma aba (nenhuma aba nova)', async () => {
  const sc = scenario();
  for (const t of ['Paraovarian cyst', 'Appendicitis in pregnancy', 'Paratubal cyst']) {
    sc.send(Object.assign({}, PAYLOAD, { title: t, sourceUrl: 'https://radiopaedia.org/cases/' + t.toLowerCase().replace(/ /g, '-') + '-1' }));
    await tick(80);
  }
  await tick(200);
  assert.deepEqual(sc.opened, []);
  assert.deepEqual(sc.tabs[0].log.modals.map((d) => d.title), ['Paraovarian cyst', 'Appendicitis in pregnancy', 'Paratubal cyst']);
  assert.equal(sc.tabs[0].log.removed >= 2, true, 'modal anterior substituído pelo novo caso');
});

test('091g: com DUAS abas do Atlas abertas, o caso é importado em UMA só (a primeira que respondeu)', async () => {
  const sc = scenario({ atlasTabs: 2 });
  sc.send(PAYLOAD);
  await tick(120);
  const counts = sc.tabs.map((t) => t.log.modals.length);
  assert.equal(counts[0] + counts[1], 1, 'nunca importa nas duas');
  assert.deepEqual(sc.opened, []);
  // mensagem endereçada a outra aba é ignorada; requestId repetido também
  const t = sc.tabs[0];
  assert.equal(plain(t.api.handleAtlasImportChannelMessage({ type: 'external-import', requestId: 'z', tabId: 'atlas_outro', payload: PAYLOAD })).status, 'outra_aba');
  assert.equal(plain(t.api.handleAtlasImportChannelMessage({ type: 'external-import', requestId: 'dup', tabId: t.api.ATLAS_TAB_ID, payload: PAYLOAD })).status, 'modal');
  assert.equal(plain(t.api.handleAtlasImportChannelMessage({ type: 'external-import', requestId: 'dup', tabId: t.api.ATLAS_TAB_ID, payload: PAYLOAD })).status, 'duplicado');
});

test('091g 7: formulário de lesão aberto bloqueia a importação (não fecha, avisa, não abre aba nova)', async () => {
  const sc = scenario({ tab: { formOpen: true } });
  sc.send(PAYLOAD);
  await tick(100);
  const log = sc.tabs[0].log;
  assert.equal(log.modals.length, 0);
  assert.equal(log.removed, 0, 'nada é removido com formulário aberto');
  assert.match(log.toasts[0], /Caso não importado: salve ou feche o formulário aberto/);
  await tick(200);
  assert.deepEqual(sc.opened, [], 'a aba existe: não abre outra');
});

test('091g 8: sem aba do Atlas aberta (nenhum pong) abre o Atlas normalmente — uma vez', async () => {
  const sc = scenario({ atlasTabs: 0 });
  sc.send(PAYLOAD);
  await tick(60);
  assert.deepEqual(sc.opened, [], 'espera o timeout curto');
  await tick(200);
  assert.deepEqual(sc.opened, [URL_FALLBACK]);
});

test('091g 9: sem BroadcastChannel / sem GM_* / erro -> fallback (window.open nomeado da 091e)', async () => {
  // Atlas sem BroadcastChannel: o canal não abre e a ponte não responde
  const noBC = atlasTab(undefined);
  assert.equal(noBC.api.ATLAS_IMPORT_BC, null);
  const sc = scenario({ bridgeNoBC: true });
  sc.send(PAYLOAD);
  await tick(250);
  assert.deepEqual(sc.opened, [URL_FALLBACK]);
  // Gerenciador sem GM_addValueChangeListener: fallback imediato, síncrono
  const us = userscriptCtx();
  const opened = [];
  assert.equal(us.sendToAtlasViaBridge(PAYLOAD, URL_FALLBACK, { available: false, openWindow: (u) => opened.push(u) }), 'fallback');
  assert.deepEqual(opened, [URL_FALLBACK]);
  // GM que lança erro: fallback imediato
  const opened2 = [];
  const bad = { available: true, addListener: () => { throw new Error('x'); }, removeListener() {}, setValue() {}, setTimeout, timeoutMs: 10, openWindow: (u) => opened2.push(u), notify() {} };
  assert.equal(us.sendToAtlasViaBridge(PAYLOAD, URL_FALLBACK, bad), 'fallback');
  assert.deepEqual(opened2, [URL_FALLBACK]);
  // fallback = alvo nomeado da 091e (sem _blank/noopener)
  assert.match(extractFunction(userscript, 'openAtlasWindow'), /window\.open\(url, ATLAS_WINDOW_NAME\)/);
  assert.match(extractFunction(userscript, 'sendToAtlas'), /sendToAtlasViaBridge\(payload, url, defaultBridgeEnv\(\)\)/);
});

test('091g: caso recebido durante o boot fica na fila e é processado pelo gancho do loadData', () => {
  const t = atlasTab(makeOriginBC(), { ready: false });
  assert.equal(plain(t.api.deliverExternalImportPayload(PAYLOAD)).status, 'aguardando_boot');
  assert.deepEqual(plain(t.api.pending()), PAYLOAD);
  assert.equal(t.log.modals.length, 0);
  assert.match(html, /if \(pendingBroadcastImport\) \{ \/\/ PROTEÇÃO 091g[\s\S]{0,200}deliverExternalImportPayload\(queued\)/);
});

test('091g foco: tenta window.focus() e, com a aba em segundo plano, marca o título até ser vista (sem abrir aba para focar)', async () => {
  const sc = scenario({ tab: { hidden: true } });
  sc.send(PAYLOAD);
  await tick(100);
  const t = sc.tabs[0];
  assert.ok(t.log.focus >= 1, 'tentativa de foco (o navegador pode ignorar)');
  assert.match(t.doc.title, /^📥 Novo caso — Atlas Radiológico$/);
  await tick(200);
  assert.deepEqual(sc.opened, [], 'nunca abre aba nova só para obter foco');
  assert.match(html, /document\.addEventListener\('visibilitychange', clearAtlasTabAttention\);/);
});

test('091g 11-12: branding continua removido e a tradução continua funcionando no caso recebido pelo canal', async () => {
  const us = userscriptCtx();
  const payload = plain(us.buildExternalPayload({ title: 'Paraovarian cyst | Radiology Case | Radiopaedia.org', sourceUrl: PAYLOAD.sourceUrl }));
  assert.equal(payload.title, 'Paraovarian cyst', 'userscript remove o branding antes de enviar');
  const sc = scenario();
  sc.send(Object.assign({}, payload, { title: 'Paraovarian cyst | Radiopaedia.org' })); // mesmo que chegue com branding, o Atlas limpa
  await tick(100);
  const draft = sc.tabs[0].log.modals[0];
  assert.equal(draft.title, 'Paraovarian cyst');
  const ctx = vm.createContext({ URL });
  vm.runInContext([sliceBetween(html, 'const EXTERNAL_IMPORT_STOPWORDS = ', '\n'), sliceBetween(html, 'const EXTERNAL_IMPORT_TRANSLATIONS = {', '// PROTEÇÃO 091d — ordem: 1) lesão do catálogo'),
    'const EN_TERMS = {};', 'let EXTERNAL_EN_TERMS_INDEX = null;',
    ...['normalizeExternalTitle', 'tokenizeExternalTitle', 'externalEnTermsIndex', 'suggestPortugueseLesionName', 'suggestExternalEnTerm', 'canonicalTagVocabulary', 'suggestExternalTags', 'suggestExternalDescription', 'buildExternalSuggestion'].map((n) => extractFunction(html, n)),
    'this.__b = buildExternalSuggestion;'].join('\n'), ctx);
  const sug = plain(ctx.__b(draft, [], []));
  assert.deepEqual([sug.name, sug.enTerm], ['Cisto paraovariano', 'Paraovarian cyst']);
});

test('091g userscript: roda também na página do Atlas SÓ como ponte (sem botão) e declara as permissões GM necessárias', () => {
  assert.match(userscript, /@match\s+https:\/\/radiopaedia\.org\/cases\/\*/);
  assert.match(userscript, /@match\s+https:\/\/leopaggi\.github\.io\/atlas-radiologico\/\*/);
  for (const g of ['GM_setValue', 'GM_addValueChangeListener', 'GM_removeValueChangeListener']) assert.match(userscript, new RegExp('@grant\\s+' + g));
  assert.match(userscript, /@version\s+1\.4\.\d+/);
  assert.match(userscript, /if \(isAtlasPage\(\)\) \{\s*startAtlasBridge\(defaultBridgeEnv\(\)\);\s*return;\s*\}/);
  assert.doesNotMatch(userscript, /window\.open\([^)]*(_blank|noopener)/);
  assert.doesNotMatch(html + userscript, /openai|anthropic\.com|generativelanguage/i);
});
