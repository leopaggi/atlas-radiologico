'use strict';

/* PROTEÇÃO 091e — "Enviar ao Atlas" (userscript do Radiopaedia) REUTILIZA a
 * aba já aberta do Atlas: alvo nomeado 'atlas-radiologico' (o Atlas define o
 * mesmo window.name no boot) e, na aba reutilizada, o hashchange processa o
 * novo #external-import pelo mesmo caminho do boot. Funções REAIS do
 * userscript e do index.html em `vm`; sem rede/DOM real.
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
const PAYLOAD = { source: 'Radiopaedia', sourceUrl: 'https://radiopaedia.org/cases/appendicitis-in-pregnancy-1', title: 'Appendicitis in pregnancy', modality: 'MRI' };

// userscript real: sendToAtlas + openAtlasWindow + encodePayload, com collectCase estubado.
function loadUserscript(windowOpen) {
  const calls = [];
  const ctx = vm.createContext({
    TextEncoder, btoa, encodeURIComponent, JSON, alert: () => { throw new Error('não deveria alertar'); },
    window: { open: (...args) => { calls.push(args); return windowOpen ? windowOpen(...args) : null; } }
  });
  const src = [/var ATLAS_URL = '[^']*';/.exec(userscript)[0], /var ATLAS_WINDOW_NAME = '[^']*';/.exec(userscript)[0],
    extractFunction(userscript, 'encodePayload'), extractFunction(userscript, 'openAtlasWindow'), extractFunction(userscript, 'sendToAtlas'),
    'function collectCase(){ return ' + JSON.stringify(PAYLOAD) + '; }',
    'this.__us = { sendToAtlas, encodePayload, ATLAS_WINDOW_NAME };'].join('\n');
  vm.runInContext(src, ctx);
  return { us: ctx.__us, calls };
}

test('091e 1: o Atlas define window.name = "atlas-radiologico" no boot (sem quebrar se o acesso falhar)', () => {
  assert.match(html, /const ATLAS_WINDOW_NAME = 'atlas-radiologico';/);
  assert.match(html, /\nensureAtlasWindowName\(\);\n/, 'chamado no nível do script (boot)');
  const fn = extractFunction(html, 'ensureAtlasWindowName');
  const win = { name: '' };
  const ctx = vm.createContext({ window: win });
  vm.runInContext("const ATLAS_WINDOW_NAME = 'atlas-radiologico';\n" + fn + '\nthis.__ok = ensureAtlasWindowName();', ctx);
  assert.equal(win.name, 'atlas-radiologico');
  assert.equal(ctx.__ok, true);
  const hostile = vm.createContext({ window: { get name() { throw new Error('bloqueado'); } } });
  vm.runInContext("const ATLAS_WINDOW_NAME = 'atlas-radiologico';\n" + fn + '\nthis.__ok = ensureAtlasWindowName();', hostile);
  assert.equal(hostile.__ok, false, 'falha isolada — não derruba o boot');
});

test('091e 2-3: o userscript não usa mais _blank/noopener e abre o alvo nomeado igual ao do Atlas', () => {
  assert.doesNotMatch(userscript, /window\.open\([^)]*_blank/);
  assert.doesNotMatch(userscript, /window\.open\([^)]*noopener/);
  const { us, calls } = loadUserscript();
  us.sendToAtlas();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'atlas-radiologico');
  assert.equal(calls[0].length, 2, 'sem features (noopener impediria reencontrar/focar a aba)');
  const atlasName = /const ATLAS_WINDOW_NAME = '([^']*)';/.exec(html)[1];
  assert.equal(us.ATLAS_WINDOW_NAME, atlasName, 'mesmo nome nos dois lados');
});

test('091e 4 e 6: continua passando o MESMO #external-import (payload inalterado, decodificável pelo Atlas)', () => {
  const { us, calls } = loadUserscript();
  us.sendToAtlas();
  const url = calls[0][0];
  assert.ok(url.startsWith('https://leopaggi.github.io/atlas-radiologico/#external-import='));
  assert.equal(url.slice(url.indexOf('#')), '#external-import=' + us.encodePayload(PAYLOAD));
  const ctx = vm.createContext({ atob, TextDecoder, decodeURIComponent, JSON, Uint8Array });
  vm.runInContext(["const EXTERNAL_IMPORT_PREFIX = '#external-import=';", /const EXTERNAL_IMPORT_MAX_BYTES = [^;]+;/.exec(html)[0], extractFunction(html, 'parseExternalImportHash'), 'this.__p = parseExternalImportHash;'].join('\n'), ctx);
  const parsed = JSON.parse(JSON.stringify(ctx.__p(url.slice(url.indexOf('#')))));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payload, PAYLOAD);
});

test('091e 5: chama focus() quando obtém a janela; sem janela (popup bloqueado) não quebra', () => {
  let focused = 0;
  const a = loadUserscript(() => ({ focus: () => { focused += 1; } }));
  a.us.sendToAtlas(); a.us.sendToAtlas(); // envios seguidos: mesmo alvo nomeado
  assert.equal(focused, 2);
  assert.deepEqual(a.calls.map((c) => c[1]), ['atlas-radiologico', 'atlas-radiologico']);
  const b = loadUserscript(() => null);
  assert.doesNotThrow(() => b.us.sendToAtlas());
  const c = loadUserscript(() => ({ focus: () => { throw new Error('cross-origin'); } }));
  assert.doesNotThrow(() => c.us.sendToAtlas(), 'focus que falha é ignorado');
});

function loadAtlasHashHandler(opts) {
  const o = opts || {};
  const log = { modal: 0, removed: 0, toasts: [], cleared: 0 };
  const loc = { hash: o.hash || '' };
  const ctx = vm.createContext({
    location: loc, appStateReady: o.ready !== false, console,
    toast: (m) => log.toasts.push(m),
    document: {
      querySelector: (sel) => (sel === '.lesion-form-overlay' && o.formOpen ? {} : null),
      querySelectorAll: (sel) => (sel === '.external-import-overlay, .external-ai-overlay' ? [{ remove() { log.removed += 1; } }] : [])
    },
    clearExternalImportHash: () => { log.cleared += 1; loc.hash = ''; },
    maybeHandleExternalImport: async () => { log.modal += 1; loc.hash = ''; return { status: 'modal' }; }
  });
  vm.runInContext("const EXTERNAL_IMPORT_PREFIX = '#external-import=';\n" + extractFunction(html, 'handleExternalImportHashChange') + '\nthis.__h = handleExternalImportHashChange;', ctx);
  return { h: ctx.__h, log, loc };
}

test('091e aba reutilizada: hashchange processa o novo caso pelo MESMO caminho do boot', async () => {
  assert.match(html, /window\.addEventListener\('hashchange', \(\) => \{\s*handleExternalImportHashChange\(\)/);
  const a = loadAtlasHashHandler({ hash: '#external-import=abc' });
  assert.deepEqual(JSON.parse(JSON.stringify(await a.h())), { status: 'modal' });
  assert.equal(a.log.modal, 1);
  assert.equal(a.log.removed, 1, 'modal de importação anterior (não salvo) é substituído');
  const none = loadAtlasHashHandler({ hash: '#outra-coisa' });
  assert.equal(await none.h(), null);
  assert.equal(none.log.modal, 0);
  const booting = loadAtlasHashHandler({ hash: '#external-import=abc', ready: false });
  assert.equal((await booting.h()).status, 'aguardando_boot', 'durante o boot, o gancho do loadData processa');
  assert.equal(booting.log.modal, 0);
  assert.equal(booting.loc.hash, '#external-import=abc', 'hash preservado para o boot');
});

test('091e: formulário de lesão aberto (dados não salvos) nunca é derrubado — envio adiado com aviso claro', async () => {
  const f = loadAtlasHashHandler({ hash: '#external-import=abc', formOpen: true });
  assert.equal((await f.h()).status, 'adiado_formulario_aberto');
  assert.equal(f.log.modal, 0);
  assert.equal(f.log.removed, 0);
  assert.equal(f.log.cleared, 1, 'hash limpo (F5 não reimporta)');
  assert.match(f.log.toasts[0], /Caso não importado: salve ou feche o formulário aberto/);
});

test('091e: boot continua processando #external-import (gancho do loadData intacto) e nada mais mudou no fluxo', () => {
  assert.match(html, /loadData = async function\(\)\{\s*const result = await _loadDataSemImport\.apply\(this, arguments\);\s*try \{ await maybeHandleExternalImport\(\); \}/);
  const m = extractFunction(html, 'maybeHandleExternalImport');
  assert.match(m, /clearExternalImportHash\(\);/);
  assert.match(m, /openExternalImportModal\(reconcileExternalImportTitle\(checked\.value\)\)/);
});
