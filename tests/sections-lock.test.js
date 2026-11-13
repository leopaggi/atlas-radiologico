'use strict';

/* Cadeado da organização das seções (ao lado do título "Todas as seções").
 * Bloqueado por padrão: sem arraste, sem setas ▲▼, e as funções de reordenação
 * ignoram a chamada. Lê o index.html real (sem rede/Firebase).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function extractBlock(source, a, b) {
  const s = source.indexOf(a); assert.notEqual(s, -1, 'marcador inicial: ' + a);
  const e = source.indexOf(b, s); assert.notEqual(e, -1, 'marcador final: ' + b);
  return source.slice(s, e);
}

test('1. botão do cadeado existe ao lado do título e começa bloqueado', () => {
  assert.match(html, /<div id="scope-title-wrap">[\s\S]*?id="scope-name">Todas as seções<\/div><\/div><button id="sections-lock-btn"/);
  assert.match(html, /let sectionsLocked = true;/);
  assert.match(html, /aria-pressed="true"/);
});

test('2. bloqueado: itens não são arrastáveis e dragstart é cancelado', () => {
  const tree = extractBlock(html, 'function renderTree(){', '\n/* ====');
  assert.match(tree, /head\.draggable = !sectionsLocked;/);
  assert.match(tree, /sEl\.draggable = !sectionsLocked;/);
  assert.match(tree, /tree\.classList\.toggle\('sections-locked', sectionsLocked\)/);
  assert.equal((tree.match(/if\(sectionsLocked\)\{ ev\.preventDefault\(\); return; \}/g) || []).length, 2);
});

test('3. reorderSite / moveSection / reorderSectionDrag ignoram a chamada quando bloqueado', async () => {
  const src = extractBlock(html, 'function reorderSite(sectionName, fromIdx, toIdx){', '\n/* ====');
  let saves = 0;
  const ctx = vm.createContext({
    sectionsLocked: true, sectionOrder: ['A', 'B', 'C'], siteOrder: { A: ['x', 'y'] },
    markSiteOrderManual() {}, markSectionOrderManual() {}, saveSiteOrder() { saves++; }, saveOrder: async () => { saves++; }, renderTree() {},
  });
  vm.runInContext(src + '\nthis.reorderSite=reorderSite;this.moveSection=moveSection;this.reorderSectionDrag=reorderSectionDrag;', ctx);
  ctx.reorderSite('A', 0, 1); await ctx.moveSection('A', 1); await ctx.reorderSectionDrag('A', 'C');
  assert.deepEqual(ctx.sectionOrder, ['A', 'B', 'C']);
  assert.deepEqual(ctx.siteOrder.A, ['x', 'y']);
  assert.equal(saves, 0);
  ctx.sectionsLocked = false;
  ctx.reorderSite('A', 0, 1); await ctx.moveSection('A', 1);
  assert.deepEqual(ctx.siteOrder.A, ['y', 'x']);
  assert.deepEqual(ctx.sectionOrder, ['B', 'A', 'C']);
  assert.ok(saves >= 2);
});

test('4. clicar no cadeado alterna o estado e re-renderiza a árvore; não persiste', () => {
  const init = extractBlock(html, '(function initSectionsLockBtn(){', '\nfunction renderHeader(){');
  assert.match(init, /sectionsLocked = !sectionsLocked; renderSectionsLockBtn\(\); renderTree\(\);/);
  assert.doesNotMatch(init, /storage\.set|localStorage|saveData|pushToFirebase/);
  assert.match(html, /bloqueado por padrão|sempre começa bloqueado/);
});
