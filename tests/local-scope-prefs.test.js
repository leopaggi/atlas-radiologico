'use strict';

/* Preferências LOCAIS de navegação (localStorage) — sidebar e Quiz,
 * independentes. Extrai o trecho REAL do index.html e roda num `vm` isolado
 * com um `localStorage` falso em memória. Nenhum teste acessa IndexedDB,
 * Firebase, Firestore, Cloudinary ou rede.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
}

const PREFS_SOURCE = extractBlock(html, "const SIDEBAR_SCOPE_KEY = 'atlas:v1:lastSidebarScope';", 'function quizScopeEntries(){');

function makeStorage() {
  const backing = {};
  return {
    backing,
    getItem(key) { return Object.prototype.hasOwnProperty.call(backing, key) ? backing[key] : null; },
    setItem(key, value) { backing[key] = String(value); },
    removeItem(key) { delete backing[key]; }
  };
}

function buildCtx(opts) {
  opts = opts || {};
  const ls = opts.storage === undefined ? makeStorage() : opts.storage;
  const data = opts.data || [
    { id: 'a', s: 'Neurorradiologia', site: 'Encéfalo' },
    { id: 'b', s: 'Neurorradiologia', site: 'Medula' },
    { id: 'c', s: 'Tórax', site: 'Pulmão' }
  ];
  const ctx = { console, JSON, Object, Array, String, DATA: data, localStorage: ls, scope: { section: null, site: null } };
  vm.createContext(ctx);
  vm.runInContext(PREFS_SOURCE, ctx, { filename: 'local-scope-prefs.js' });
  // `let quizScope` é binding lexical (não vira propriedade do contexto): usa vm.
  ctx.setQuizScope = (sc) => vm.runInContext('quizScope = ' + JSON.stringify(sc) + ';', ctx);
  return ctx;
}

test('PREFS: chaves independentes e versionadas para sidebar e Quiz', () => {
  assert.match(html, /const SIDEBAR_SCOPE_KEY = 'atlas:v1:lastSidebarScope';/);
  assert.match(html, /const QUIZ_SCOPE_KEY = 'atlas:v1:lastQuizScope';/);
  assert.notEqual('atlas:v1:lastSidebarScope', 'atlas:v1:lastQuizScope');
});

test('PREFS: sidebar salva e restaura section/site', () => {
  const ctx = buildCtx();
  ctx.scope = { section: 'Tórax', site: 'Pulmão' };
  ctx.saveSidebarScopePref();
  assert.equal(ctx.localStorage.backing['atlas:v1:lastSidebarScope'], JSON.stringify({ section: 'Tórax', site: 'Pulmão' }));
  const restored = ctx.loadSidebarScopePref();
  assert.equal(restored.section, 'Tórax');
  assert.equal(restored.site, 'Pulmão');
});

test('PREFS: Quiz salva e restaura section/site em chave SEPARADA', () => {
  const ctx = buildCtx();
  ctx.setQuizScope({ section: 'Neurorradiologia', site: 'Medula' });
  ctx.saveQuizScopePref();
  assert.equal(ctx.localStorage.backing['atlas:v1:lastQuizScope'], JSON.stringify({ section: 'Neurorradiologia', site: 'Medula' }));
  const restored = ctx.loadQuizScopePref();
  assert.equal(restored.section, 'Neurorradiologia');
  assert.equal(restored.site, 'Medula');
});

test('PREFS: alterar o Quiz NÃO muda a preferência da sidebar (e vice-versa)', () => {
  const ctx = buildCtx();
  ctx.scope = { section: 'Tórax', site: 'Pulmão' };
  ctx.saveSidebarScopePref();
  ctx.setQuizScope({ section: 'Neurorradiologia', site: 'Encéfalo' });
  ctx.saveQuizScopePref();
  // muda só o Quiz
  ctx.setQuizScope({ section: 'Neurorradiologia', site: 'Medula' });
  ctx.saveQuizScopePref();
  assert.equal(ctx.loadSidebarScopePref().site, 'Pulmão', 'sidebar intacta');
  assert.equal(ctx.loadQuizScopePref().site, 'Medula');
  // muda só a sidebar
  ctx.scope = { section: null, site: null };
  ctx.saveSidebarScopePref();
  assert.equal(ctx.loadQuizScopePref().section, 'Neurorradiologia', 'quiz intacto');
});

test('PREFS: section inexistente é ignorada (volta ao padrão)', () => {
  const ctx = buildCtx();
  ctx.localStorage.setItem('atlas:v1:lastSidebarScope', JSON.stringify({ section: 'Seção Fantasma', site: 'X' }));
  const restored = ctx.loadSidebarScopePref();
  assert.equal(restored.section, null);
  assert.equal(restored.site, null);
});

test('PREFS: site inexistente cai em fallback seguro (mantém a seção, zera o site)', () => {
  const ctx = buildCtx();
  ctx.localStorage.setItem('atlas:v1:lastQuizScope', JSON.stringify({ section: 'Neurorradiologia', site: 'Site Fantasma' }));
  const restored = ctx.loadQuizScopePref();
  assert.equal(restored.section, 'Neurorradiologia');
  assert.equal(restored.site, null);
});

test('PREFS: JSON inválido/corrompido não quebra (ignora e segue no padrão)', () => {
  const ctx = buildCtx();
  ctx.localStorage.setItem('atlas:v1:lastSidebarScope', '{ isso não é json');
  ctx.localStorage.setItem('atlas:v1:lastQuizScope', '[1,2,3]');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.loadSidebarScopePref())), { section: null, site: null });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.loadQuizScopePref())), { section: null, site: null });
});

test('PREFS: localStorage indisponível/erro não quebra a aplicação', () => {
  const throwing = {
    getItem() { throw new Error('localStorage bloqueado'); },
    setItem() { throw new Error('localStorage bloqueado'); },
    removeItem() {}
  };
  const ctx = buildCtx({ storage: throwing });
  assert.doesNotThrow(() => { ctx.scope = { section: 'Tórax', site: 'Pulmão' }; ctx.saveSidebarScopePref(); });
  const restored = ctx.loadSidebarScopePref();
  assert.equal(restored.section, null);
  assert.equal(restored.site, null);
});

test('PREFS: NÃO usa Firebase/Firestore/IndexedDB/DATA para persistir', () => {
  // ignora comentários (a doc menciona Firebase/IndexedDB para dizer que NÃO usa)
  const code = PREFS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /firebase|firestore|fbDb|pushToFirebase|indexedDB|IDB_|storage\.set\(/i);
  assert.doesNotMatch(code, /\bDATA\s*=/);
  assert.match(code, /localStorage\.setItem/);
});

test('PREFS: só grava em mudança MANUAL (render/F5/sync/import não escrevem)', () => {
  // a única escrita é via saveSidebarScopePref/saveQuizScopePref, chamadas nos
  // handlers manuais (sidebar) e nos seletores do Quiz — não em renderAll/loadData.
  const renderAll = extractBlock(html, 'function renderAll(){', '\n}');
  assert.doesNotMatch(renderAll, /saveSidebarScopePref|saveQuizScopePref|writeScopePref/);
  const loadData = extractBlock(html, 'async function loadData(){', '\nasync function saveData(');
  // Estado padrão de fábrica (2026-09-22): o boot NÃO lê mais a preferência
  // de seção/sítio — seção/site nascem limpos; só o Quiz restaura a sua.
  assert.doesNotMatch(loadData, /scope = loadSidebarScopePref\(\)/, 'boot ignora seção/sítio antigos');
  assert.match(loadData, /scope\s*=\s*\{section:null,\s*site:null\}/);
  assert.match(loadData, /quizScope = loadQuizScopePref\(\)/);
  assert.doesNotMatch(loadData, /saveSidebarScopePref|saveQuizScopePref|writeScopePref/, 'F5/boot não ESCREVE preferência');
});

test('FILTROS-RESET: reload nasce em Todas as seções, sem tags, Revisões=Todas', () => {
  const loadData = extractBlock(html, 'async function loadData(){', '\nasync function saveData(');
  assert.match(loadData, /scope\s*=\s*\{section:null,\s*site:null\}/, '1. Todas as seções');
  assert.match(html, /let activeTags = new Set\(\);/, '2. sem tags (conjunto nasce vazio)');
  assert.match(html, /let reviewFilter = null;/, '3. Revisões=Todas (null)');
  assert.match(loadData, /bootSearch\.value = ''/, 'busca textual limpa no boot');
});

test('FILTROS-RESET: Limpar filtros restaura o mesmo estado de fábrica', () => {
  const tagbar = extractBlock(html, 'function renderTagbar(){', '\nfunction renderReviewBar(){');
  assert.match(tagbar, /activeTags\.clear\(\)/, '4. limpa tags (e sítio via scope abaixo)');
  assert.match(tagbar, /scope\s*=\s*\{section:null,\s*site:null\}/, '5. remove sítio/escopo específico');
  assert.match(tagbar, /reviewFilter = null;/, 'Revisões volta para Todas');
  assert.match(tagbar, /searchTerm = '';/, '6. busca textual limpa');
  assert.match(tagbar, /renderAll\(\)/, 're-renderiza tudo');
  assert.doesNotMatch(tagbar, /saveData|pushToFirebase|storage\.set\(/, 'não toca em dados');
});

test('FILTROS-RESET: botão aparece com qualquer filtro ativo, não só com tags', () => {
  const tagbar = extractBlock(html, 'function renderTagbar(){', '\nfunction renderReviewBar(){');
  assert.match(tagbar, /activeFilterCount/, 'conta todas as facetas ativas');
  assert.match(tagbar, /reviewFilter!==null\?1:0/);
  assert.match(tagbar, /limpar filtros/);
});

test('FILTROS-RESET: tags antigas nunca reaparecem (sem hidratação de storage)', () => {
  assert.match(html, /let activeTags = new Set\(\);/);
  assert.doesNotMatch(html, /activeTags\s*=\s*new Set\(JSON/, '7. nunca reconstruído de valor guardado');
});

test('FILTROS-RESET: seção/sítio/tags/Revisões nunca são relidos do localStorage no boot', () => {
  const raw = extractBlock(html, 'async function loadData(){', '\nasync function saveData(');
  const loadData = raw.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(loadData, /loadSidebarScopePref/, '8. valor antigo não restaura filtros');
  assert.doesNotMatch(loadData, /localStorage\.getItem/, 'nenhuma leitura de preferência de filtro no boot');
});

test('FILTROS-RESET: outras preferências locais continuam intactas', () => {
  const loadData = extractBlock(html, 'async function loadData(){', '\nasync function saveData(');
  assert.match(loadData, /quizScope = loadQuizScopePref\(\)/, '9. Quiz restaura a sua');
  assert.match(html, /function saveCloudinaryConfig|CLOUDINARY_CONFIG_LOCAL/, 'Cloudinary e demais prefs intocados');
});

test('PREFS: import de backup e sync NÃO sobrescrevem as preferências', () => {
  const importHandler = html.slice(html.indexOf("document.getElementById('import-file').addEventListener"), html.indexOf("document.getElementById('btn-cloudinary')"));
  assert.doesNotMatch(importHandler, /saveSidebarScopePref|saveQuizScopePref|writeScopePref/);
  const syncFn = extractBlock(html, 'async function syncFromFirebase(){', '\n/* ============================================================');
  assert.doesNotMatch(syncFn, /saveSidebarScopePref|saveQuizScopePref|writeScopePref/);
});

test('PREFS: sidebar grava em cada mudança manual (Todas/seção/sítio/limpar tags)', () => {
  const tree = extractBlock(html, 'function renderTree(){', 'function entryMatchesScope(');
  assert.match(tree, /scope\s*=\s*\{section:null,\s*site:null\}; saveSidebarScopePref\(\)/);
  assert.match(tree, /scope = \{section:sectionName, site:null\};\s*saveSidebarScopePref\(\)/);
  assert.match(tree, /scope = \{section:sectionName, site:siteName\}; saveSidebarScopePref\(\)/);
  assert.match(html, /scope\s*=\s*\{section:null,\s*site:null\};\s*saveSidebarScopePref\(\)/);
});

test('PREFS: Quiz grava a seção escolhida ao praticar uma área e tem seletores próprios', () => {
  assert.match(html, /quizScope=\{section:sec,site:null\};saveQuizScopePref\(\)/);
  assert.match(html, /id="quiz-scope-section"/);
  assert.match(html, /id="quiz-scope-site"/);
  assert.match(html, /saveQuizScopePref\(\);/);
});

test('PREFS: seleção do Quiz usa quizScope (não a sidebar)', () => {
  assert.match(html, /function quizScopeEntries\(\)\{ return DATA\.filter\(e=> entryMatchesScope\(e, quizScope\.section, quizScope\.site\)\); \}/);
  const custom = extractBlock(html, 'function renderCustomSetupInside(){', '\nfunction openProgressDashboard(){');
  assert.match(custom, /quizScopeEntries\(\)/);
  assert.doesNotMatch(custom, /scopedEntries\(\)/, 'a sessão personalizada não deve mais depender da sidebar');
});
