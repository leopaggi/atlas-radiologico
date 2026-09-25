'use strict';

// PROTEÇÃO 085 — ordem de seções (sectionOrder) e de sítios por seção
// (siteOrder) entre dispositivos. Cobre o merge PURO (funções reais extraídas
// do index.html) e as amarrações estáticas do pipeline de sync. Cenários
// multi-dispositivo ponta a ponta (nuvem falsa compartilhada, loadData/
// syncFromFirebase/writeShardedState reais) ficam em
// tests/multi-device-sync.test.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada no index.html');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}

const DEFAULTS = ['Neuro', 'Tórax', 'Abdome'];
const ctx = vm.createContext({});
vm.runInContext('const DEFAULT_SECTION_ORDER = ' + JSON.stringify(DEFAULTS) + ';\n' +
  ['normalizeOrderStamps', 'dedupeOrderList', 'isAutoSectionOrder', 'isAutoSiteList', 'mergeOrderList', 'mergeOrderState']
    .map((n) => extractFunction(html, n)).join('\n'), ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));
const merge = (local, remote) => plain(ctx.mergeOrderState(local, remote));
const st = (section, sites) => ({ section: section || 0, sites: sites || {} });

test('085: remoto com carimbo mais novo é adotado integralmente (seções e sítios)', () => {
  const out = merge(
    { sectionOrder: DEFAULTS, siteOrder: { Neuro: ['a', 'b'] }, stamps: st() },
    { sectionOrder: ['Abdome', 'Neuro', 'Tórax'], siteOrder: { Neuro: ['b', 'a'], Tórax: ['y', 'x'] }, stamps: st(100, { Neuro: 100, Tórax: 90 }) });
  assert.deepEqual(out.sectionOrder, ['Abdome', 'Neuro', 'Tórax']);
  assert.deepEqual(out.siteOrder, { Neuro: ['b', 'a'], Tórax: ['y', 'x'] });
  assert.deepEqual(out.stamps, st(100, { Neuro: 100, Tórax: 90 }));
});

test('085: local com carimbo mais novo vence o remoto; carimbo é por seção (não destrói outras seções)', () => {
  const out = merge(
    { sectionOrder: ['Tórax', 'Neuro', 'Abdome'], siteOrder: { Neuro: ['a', 'b'], Tórax: ['x', 'y'] }, stamps: st(200, { Neuro: 50 }) },
    { sectionOrder: ['Abdome', 'Neuro', 'Tórax'], siteOrder: { Neuro: ['b', 'a'], Tórax: ['y', 'x'] }, stamps: st(100, { Neuro: 100, Tórax: 90 }) });
  assert.deepEqual(out.sectionOrder, ['Tórax', 'Neuro', 'Abdome'], 'seções: local (200) > remoto (100)');
  assert.deepEqual(out.siteOrder.Neuro, ['b', 'a'], 'Neuro: remoto (100) > local (50)');
  assert.deepEqual(out.siteOrder.Tórax, ['y', 'x'], 'Tórax: só o remoto tem carimbo');
});

test('085 legado (sem carimbo nos dois lados): default automático local cede ao remoto; ordem personalizada local é preservada', () => {
  const remote = { sectionOrder: ['Abdome', 'Neuro', 'Tórax'], siteOrder: { Neuro: ['b', 'a'] }, stamps: undefined };
  const fromAuto = merge({ sectionOrder: [...DEFAULTS, 'Extra A', 'Extra B'], siteOrder: { Neuro: ['a', 'b'] }, stamps: st() }, remote);
  assert.deepEqual(fromAuto.sectionOrder, ['Abdome', 'Neuro', 'Tórax', 'Extra A', 'Extra B'], 'default local cede; extras locais no FIM');
  assert.deepEqual(fromAuto.siteOrder.Neuro, ['b', 'a'], 'lista alfabética automática cede');
  const fromCustom = merge({ sectionOrder: ['Tórax', 'Abdome', 'Neuro'], siteOrder: { Neuro: ['c', 'a', 'b'] }, stamps: st() }, remote);
  assert.deepEqual(fromCustom.sectionOrder, ['Tórax', 'Abdome', 'Neuro'], 'personalização legada local não é perdida');
  assert.deepEqual(fromCustom.siteOrder.Neuro, ['c', 'a', 'b']);
});

test('085: remoto sem sectionOrder / sem siteOrder / inválido mantém o local', () => {
  const local = { sectionOrder: ['Tórax', 'Neuro'], siteOrder: { Neuro: ['b', 'a'] }, stamps: st(10, { Neuro: 10 }) };
  for (const remote of [{}, undefined, null, { sectionOrder: [], siteOrder: {} }, { sectionOrder: 'x', siteOrder: [] }]) {
    const out = merge(local, remote);
    assert.deepEqual(out.sectionOrder, ['Tórax', 'Neuro']);
    assert.deepEqual(out.siteOrder, { Neuro: ['b', 'a'] });
  }
});

test('085: ordem remota parcial — conhecidos na ordem remota, itens novos do outro lado no FIM (sem reordenar alfabeticamente)', () => {
  const out = merge(
    { sectionOrder: ['Zeta', 'Neuro', 'Alfa', 'Tórax'], siteOrder: { Neuro: ['z', 'a', 'm'] }, stamps: st() },
    { sectionOrder: ['Tórax', 'Neuro'], siteOrder: { Neuro: ['m', 'a'] }, stamps: st(5, { Neuro: 5 }) });
  assert.deepEqual(out.sectionOrder, ['Tórax', 'Neuro', 'Zeta', 'Alfa']);
  assert.deepEqual(out.siteOrder.Neuro, ['m', 'a', 'z']);
});

test('085: duplicatas na ordem remota são removidas (primeira ocorrência vale)', () => {
  const out = merge({ sectionOrder: [], siteOrder: {}, stamps: null },
    { sectionOrder: ['Tórax', 'Neuro', 'Tórax', '', null, 'Neuro'], siteOrder: { Neuro: ['b', 'a', 'b'] }, stamps: st(1) });
  assert.deepEqual(out.sectionOrder, ['Tórax', 'Neuro']);
  assert.deepEqual(out.siteOrder.Neuro, ['b', 'a']);
});

test('085: item removido do catálogo continua na ordem guardada (render o ignora) — nada é descartado no merge', () => {
  const out = merge({ sectionOrder: ['Neuro'], siteOrder: {}, stamps: st() },
    { sectionOrder: ['Antiga', 'Neuro', 'Tórax'], siteOrder: {}, stamps: st(3) });
  assert.deepEqual(out.sectionOrder, ['Antiga', 'Neuro', 'Tórax']);
  const orderedSectionNames = extractFunction(html, 'orderedSectionNames');
  const c = vm.createContext({ sectionOrder: out.sectionOrder, saveOrder: async () => {} });
  vm.runInContext(orderedSectionNames, c);
  assert.deepEqual(plain(c.orderedSectionNames({ Neuro: 1, Tórax: 1 })), ['Neuro', 'Tórax'], 'render mostra só as existentes, na mesma ordem');
});

test('085: merge é determinístico e convergente (A×B = B×A) e idempotente', () => {
  const a = { sectionOrder: ['Tórax', 'Neuro'], siteOrder: { Neuro: ['a', 'b'] }, stamps: st(7, { Neuro: 7 }) };
  const b = { sectionOrder: ['Neuro', 'Tórax'], siteOrder: { Neuro: ['b', 'a'] }, stamps: st(7, { Neuro: 7 }) };
  assert.deepEqual(merge(a, b), merge(b, a), 'empate de carimbo: desempate fixo, igual nos dois PCs');
  const m = merge(a, b);
  assert.deepEqual(merge({ ...m }, m), m);
});

test('085: sítio só de um lado é preservado; entradas não-array são ignoradas', () => {
  const out = merge({ sectionOrder: [], siteOrder: { Neuro: ['a'], Ruim: 'x' }, stamps: null },
    { sectionOrder: [], siteOrder: { Tórax: ['y'], Pior: { a: 1 } }, stamps: null });
  assert.deepEqual(out.siteOrder, { Neuro: ['a'], Tórax: ['y'] });
});

test('085: serialização/deserialização (JSON, como no IndexedDB/Firestore) mantém a estrutura', () => {
  const out = merge({ sectionOrder: ['Tórax', 'Neuro'], siteOrder: { Neuro: ['b', 'a'] }, stamps: st(9, { Neuro: 9 }) }, {});
  const round = JSON.parse(JSON.stringify(out));
  assert.deepEqual(round, out);
  assert.deepEqual(plain(ctx.normalizeOrderStamps(JSON.parse(JSON.stringify(out.stamps)))), st(9, { Neuro: 9 }));
  assert.deepEqual(plain(ctx.normalizeOrderStamps('lixo')), st(), 'carimbo inválido = sem carimbo');
  assert.deepEqual(plain(ctx.normalizeOrderStamps({ section: '5', sites: { A: 0, B: -1, C: 4 } })), st(5, { C: 4 }));
});

test('085: isAutoSectionOrder/isAutoSiteList reconhecem só o que o próprio app geraria', () => {
  assert.equal(ctx.isAutoSectionOrder(DEFAULTS), true);
  assert.equal(ctx.isAutoSectionOrder(['Neuro', 'Abdome', 'Alfa', 'Beta']), true, 'defaults existentes + extras alfabéticos');
  assert.equal(ctx.isAutoSectionOrder(['Tórax', 'Neuro']), false);
  assert.equal(ctx.isAutoSectionOrder(['Neuro', 'Beta', 'Alfa']), false);
  assert.equal(ctx.isAutoSiteList(['a', 'b', 'c']), true);
  assert.equal(ctx.isAutoSiteList(['b', 'a']), false);
});

// ---------------------------------------------------------------------------
// Amarrações estáticas do pipeline
// ---------------------------------------------------------------------------

test('085 PIPELINE: reconcile usa mergeOrderState (a regra antiga "remoto só preenche ausência" saiu)', () => {
  const src = extractFunction(html, 'reconcileStateWithRemote');
  assert.match(src, /mergeOrderState\(\s*\{ sectionOrder, siteOrder, stamps: ORDER_STAMPS \}/);
  assert.doesNotMatch(src, /sectionOrder = remote\.sectionOrder;/);
  assert.doesNotMatch(src, /siteOrder = remote\.siteOrder;/);
  const img = extractFunction(html, 'mergeThisDeviceImagesToCloud');
  assert.match(img, /mergeOrderState\(/);
  assert.doesNotMatch(img, /sectionOrder = remote\.sectionOrder;/);
});

test('085 PIPELINE: write grava orderUpdatedAt e faz o merge de ordem DENTRO da transação; read devolve o carimbo', () => {
  const w = extractFunction(html, 'writeShardedState');
  assert.match(w, /orderUpdatedAt: normalizeOrderStamps\(ORDER_STAMPS\)/);
  assert.match(w, /const writeOrder = stripUndefinedDeep\(mergeOrderState\(/);
  assert.match(w, /sectionOrder: writeOrder\.sectionOrder, siteOrder: writeOrder\.siteOrder, orderUpdatedAt: writeOrder\.stamps/);
  assert.match(extractFunction(html, 'readShardedState'), /orderUpdatedAt: normalizeOrderStamps\(meta\.orderUpdatedAt\)/);
  const pre = extractFunction(html, 'reconcileBeforePush');
  assert.match(pre, /orderUpdatedAt: normalizeOrderStamps\(ORDER_STAMPS\)/);
  assert.match(pre, /orderUpdatedAt: normalizeOrderStamps\(remote\.orderUpdatedAt\)/);
});

test('085 PIPELINE: pull/persist/adoção persistem o carimbo sem marcar dirty; loadData carrega o carimbo antes dos saves de boot', () => {
  assert.match(extractFunction(html, 'persistLocalStateNow'), /await saveOrderStamps\(\)/);
  const pull = extractFunction(html, 'syncFromFirebase');
  assert.match(pull, /await saveOrderStamps\(\)/);
  assert.doesNotMatch(pull, /saveOrder\(\)|saveSiteOrder\(\)|markSyncDirty/);
  const adopt = extractFunction(html, 'adoptRemoteStateForNewDevice');
  assert.match(adopt, /mergeOrderState\(\{ sectionOrder: \[\], siteOrder: \{\}, stamps: null \}/);
  assert.match(adopt, /await saveOrderStamps\(\)/);
  assert.doesNotMatch(adopt, /markSyncDirty|pushToFirebase/);
  const load = extractFunction(html, 'loadData');
  const iStamps = load.indexOf('await loadOrderStamps()');
  assert.ok(iStamps > 0 && iStamps < load.indexOf('await saveOrder(true)') && iStamps < load.indexOf('await saveSiteOrder(true)'));
  assert.doesNotMatch(load, /await saveOrder\(\);|await saveSiteOrder\(\);/, 'default de boot nunca é edição');
});

test('085 PIPELINE: normalização do render é interna; reordenação manual carimba, marca dirty e publica', () => {
  assert.match(extractFunction(html, 'orderedSectionNames'), /saveOrder\(true\)/);
  assert.match(extractFunction(html, 'orderedSiteNames'), /saveSiteOrder\(true\)/);
  assert.match(extractFunction(html, 'moveSection'), /markSectionOrderManual\(\);[\s\S]*await saveOrder\(\);/);
  assert.match(extractFunction(html, 'reorderSectionDrag'), /markSectionOrderManual\(\);[\s\S]*await saveOrder\(\);/);
  assert.match(extractFunction(html, 'reorderSite'), /markSiteOrderManual\(sectionName\);[\s\S]*saveSiteOrder\(\);/);
  for (const fn of ['saveOrder', 'saveSiteOrder']) {
    assert.match(extractFunction(html, fn), /await saveOrderStamps\(\);\s*if\(internal\) return;\s*await markSyncDirty\(\);\s*pushToFirebase\(\);/, fn);
  }
});

test('085 PIPELINE: saveOrder/saveSiteOrder reais — internal só persiste; ação do usuário marca dirty e agenda push', async () => {
  const calls = { dirty: 0, push: 0 };
  const backing = {};
  const c = vm.createContext({
    sectionOrder: ['Tórax'], siteOrder: { Tórax: ['x'] }, ORDER_STAMPS: { section: 0, sites: {} },
    ORDER_KEY: 'order', SITEORDER_KEY: 'site-order',
    storage: { set: async (k, v) => { backing[k] = v; } },
    markSyncDirty: async () => { calls.dirty += 1; },
    pushToFirebase: () => { calls.push += 1; },
    console
  });
  vm.runInContext("const ORDER_STAMPS_KEY = 'atlas:orderUpdatedAt';\n" +
    ['normalizeOrderStamps', 'saveOrderStamps', 'markSectionOrderManual', 'markSiteOrderManual', 'saveOrder', 'saveSiteOrder']
      .map((n) => extractFunction(html, n)).join('\n'), c);
  await c.saveOrder(true); await c.saveSiteOrder(true);
  assert.deepEqual(calls, { dirty: 0, push: 0 });
  assert.equal(backing.order, '["Tórax"]');
  c.markSectionOrderManual(); c.markSiteOrderManual('Tórax');
  await c.saveOrder(); await c.saveSiteOrder();
  assert.deepEqual(calls, { dirty: 2, push: 2 });
  const stamps = JSON.parse(backing['atlas:orderUpdatedAt']);
  assert.ok(stamps.section > 0 && stamps.sites['Tórax'] > 0, 'carimbo persistido (sobrevive ao F5)');
});

test('085 PIPELINE: restauração manual (backup/snapshot) carimba a ordem restaurada', () => {
  assert.match(extractFunction(html, 'restoreSafetySnapshot'), /markRestoredOrderManual\(\);[\s\S]*await saveOrderStamps\(\)/);
  assert.match(html, /siteOrder = \(parsed\.siteOrder && typeof parsed\.siteOrder==='object'\) \? parsed\.siteOrder : \{\};\n\s*markRestoredOrderManual\(\);/);
});
