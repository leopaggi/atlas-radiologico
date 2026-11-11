'use strict';

/* Filtro por TAGS CLÍNICAS (painel laranja ao lado das tags de radiologia).
 * Extrai o trecho REAL do index.html e roda num `vm` isolado. Sem rede/Firebase.
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

test('1. rótulo renomeado e botão laranja TAGS CLÍNICAS existe', () => {
  const tagbar = extractBlock(html, 'function renderTagbar(){', '\nfunction renderReviewBar(){');
  assert.match(tagbar, /'TAGS DE RADIOLOGIA'/);
  assert.doesNotMatch(tagbar, /'CARACTERÍSTICAS'/);
  assert.match(tagbar, /clinical-toggle/);
  assert.match(tagbar, /renderClinicalTagbar\(\)/);
});

test('2. painel clínico é oculto por padrão', () => {
  assert.match(html, /let clinicalPanelOpen = false;/);
  assert.match(html, /#tagbar-clinical\{display:none;/);
  assert.match(html, /#tagbars\.clinical-open #tagbar-clinical\{display:flex;\}/);
});

test('3. filteredEntries filtra por clinicalTags (AND) e a busca textual inclui clinicalTags', () => {
  const SRC = extractBlock(html, 'const entryClinicalTags =', '\nlet ') ;
  const fn = extractBlock(html, 'function filteredEntries(){', '\nfunction renderTagbar(){');
  const entries = [
    { id: 'a', name: 'A', notes: '', tags: ['sólido'], clinicalTags: ['emergência', 'dor'] },
    { id: 'b', name: 'B', notes: '', tags: ['sólido'], clinicalTags: ['dor'] },
    { id: 'c', name: 'C', notes: '', tags: ['cístico'] },
  ];
  const ctx = vm.createContext({
    activeTags: new Set(), activeClinicalTags: new Set(['emergência']), searchTerm: '', reviewFilter: null,
    IMG_TAG: '__img', NO_IMG_TAG: '__noimg', scopedEntries: () => entries, hasEntryImgs: () => false, getReview: () => 0,
  });
  vm.runInContext(SRC.replace(/^const entryClinicalTags/, 'var entryClinicalTags') + '\n' + fn + '\nthis.filteredEntries = filteredEntries;', ctx);
  assert.deepEqual(ctx.filteredEntries().map(e => e.id), ['a']);
  ctx.activeClinicalTags = new Set(['dor']);
  assert.deepEqual(ctx.filteredEntries().map(e => e.id), ['a', 'b']);
  ctx.activeClinicalTags = new Set(); ctx.searchTerm = 'emerg';
  assert.deepEqual(ctx.filteredEntries().map(e => e.id), ['a']);
  ctx.searchTerm = ''; ctx.activeTags = new Set(['sólido']); ctx.activeClinicalTags = new Set(['dor']);
  assert.deepEqual(ctx.filteredEntries().map(e => e.id), ['a', 'b']);
});

test('4. limpar filtros zera também as tags clínicas, sem tocar em dados', () => {
  const tagbar = extractBlock(html, 'function renderTagbar(){', '\nfunction renderReviewBar(){');
  assert.match(tagbar, /activeClinicalTags\.clear\(\)/);
  assert.match(tagbar, /activeTags\.size \+ activeClinicalTags\.size/);
  assert.doesNotMatch(tagbar, /saveData|pushToFirebase|storage\.set\(/);
});
