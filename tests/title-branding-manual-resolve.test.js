'use strict';

/* PROTEÇÃO 091f — (A) título do Radiopaedia sem branding (userscript E
 * Atlas, mesma regra) + alias "Paraovarian cyst"; (B) "✓ Marcar como
 * resolvida" para revisão ativa (lesão ou geral), sem tocar DATA; fusão
 * clínica (091c) NÃO conclui revisão. Funções REAIS em `vm`; sem rede.
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
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start.slice(0, 40));
  return html.slice(a, b);
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const BRANDED = 'Paraovarian cyst | Radiology Case | Radiopaedia.org';

// ---------------------------------------------------------------- A: título
function userscriptTitleCtx(page) {
  const names = ['cleanText', 'firstText', 'extractSourceUrl', 'normalizeRadiopaediaCaseTitle', 'stripSiteSuffix', 'titleTokens', 'slugTitleFromUrl', 'authorNames', 'extractTitle', 'buildExternalPayload'];
  const src = /var MAX_FIELD\s*=\s*\d+;/.exec(userscript)[0] + '\n' + names.map((n) => extractFunction(userscript, n)).join('\n');
  const el = (text, attrs) => ({ innerText: text || '', getAttribute: (k) => (attrs && k in attrs ? attrs[k] : null) });
  const sel = page.selectors || {};
  const document = { title: page.documentTitle || '', querySelector: (s) => (sel[s] && sel[s][0]) || null, querySelectorAll: (s) => sel[s] || [] };
  sel['link[rel="canonical"]'] = [el('', { href: page.url })];
  const ctx = vm.createContext({ document, window: { location: { href: page.url } }, URL });
  vm.runInContext(src + '\nthis.__us = { extractTitle, normalizeRadiopaediaCaseTitle, buildExternalPayload };', ctx);
  return { us: ctx.__us, el, sel };
}
const atlasNorm = (() => {
  const ctx = vm.createContext({});
  vm.runInContext(extractFunction(html, 'normalizeRadiopaediaCaseTitle') + '\nthis.__n = normalizeRadiopaediaCaseTitle;', ctx);
  return ctx.__n;
})();
const URL_CASE = 'https://radiopaedia.org/cases/paraovarian-cyst-12';

test('091f 1-3: remove "| Radiology Case | Radiopaedia.org" e "| Radiopaedia.org"; título clínico limpo fica intacto (userscript = Atlas)', () => {
  const { us } = userscriptTitleCtx({ url: URL_CASE });
  const cases = [
    [BRANDED, 'Paraovarian cyst'],
    ['Paraovarian cyst | Radiopaedia.org', 'Paraovarian cyst'],
    ['Paraovarian cyst - Radiology Case | Radiopaedia.org', 'Paraovarian cyst'],
    ['Paraovarian cyst | Radiology case | Radiopaedia', 'Paraovarian cyst'],
    ['Paraovarian cyst ｜ Radiology Case ｜ Radiopaedia.org​ ', 'Paraovarian cyst'],
    ['Paraovarian cyst | Radiology Case | Radiopaedia.org', 'Paraovarian cyst'],
    ['Paraovarian cyst', 'Paraovarian cyst'],
    ['Paraovarian cyst - left side', 'Paraovarian cyst - left side'],
    ['Radiopaedia sign in fibrous dysplasia', 'Radiopaedia sign in fibrous dysplasia'],
    ['Appendicitis in pregnancy', 'Appendicitis in pregnancy']
  ];
  for (const [input, want] of cases) {
    assert.equal(us.normalizeRadiopaediaCaseTitle(input), want, 'userscript: ' + input);
    assert.equal(atlasNorm(input), want, 'Atlas: ' + input);
  }
});

test('091f 4-5: og:title, título do caso e document.title passam pela normalização; o payload nunca leva o branding', () => {
  const og = userscriptTitleCtx({ url: URL_CASE });
  og.sel['meta[property="og:title"]'] = [og.el('', { content: BRANDED })];
  assert.equal(og.us.extractTitle(), 'Paraovarian cyst');
  const h1 = userscriptTitleCtx({ url: URL_CASE });
  h1.sel['h1.case-title'] = [h1.el('Paraovarian cyst | Radiopaedia.org')];
  assert.equal(h1.us.extractTitle(), 'Paraovarian cyst');
  const dt = userscriptTitleCtx({ url: URL_CASE, documentTitle: BRANDED });
  assert.equal(dt.us.extractTitle(), 'Paraovarian cyst');
  const p = plain(og.us.buildExternalPayload({ title: BRANDED, sourceUrl: URL_CASE }));
  assert.equal(p.title, 'Paraovarian cyst', 'guarda final no payload');
  assert.doesNotMatch(JSON.stringify(p), /Radiology Case|Radiopaedia\.org/);
});

function importerCtx() {
  const fns = ['normalizeRadiopaediaCaseTitle', 'externalCaseSlugTitle', 'reconcileExternalImportTitle', 'normalizeExternalTitle', 'tokenizeExternalTitle', 'externalEnTermsIndex',
    'suggestPortugueseLesionName', 'suggestExternalEnTerm', 'canonicalTagVocabulary', 'suggestExternalTags', 'suggestExternalDescription', 'buildExternalSuggestion'];
  const src = [sliceBetween('const EXTERNAL_IMPORT_STOPWORDS = ', '\n'), sliceBetween('const EXTERNAL_IMPORT_TRANSLATIONS = {', '// PROTEÇÃO 091d — ordem: 1) lesão do catálogo'),
    sliceBetween('const EN_TERMS = {', '\n};') + '\n};', 'let EXTERNAL_EN_TERMS_INDEX = null;', fns.map((n) => extractFunction(html, n)).join('\n'),
    'this.__api = { reconcileExternalImportTitle, buildExternalSuggestion };'].join('\n');
  const ctx = vm.createContext({ URL });
  vm.runInContext(src, ctx);
  return ctx.__api;
}

test('091f 6-8: payload com branding (userscript antigo) chega limpo: nome "Cisto paraovariano", enTerm "Paraovarian cyst", descrição sem branding', () => {
  const api = importerCtx();
  const draft = plain(api.reconcileExternalImportTitle({ source: 'Radiopaedia', sourceUrl: URL_CASE, title: BRANDED, presentation: 'Dor pélvica' }));
  assert.equal(draft.title, 'Paraovarian cyst', 'o Atlas remove o branding ao receber');
  const sug = plain(api.buildExternalSuggestion(draft, [], []));
  assert.equal(sug.name, 'Cisto paraovariano');
  assert.equal(sug.nameSource, 'glossario');
  assert.equal(sug.enTerm, 'Paraovarian cyst');
  assert.doesNotMatch(sug.description, /Radiology Case|Radiopaedia\.org|\|/);
  assert.ok(sug.description.startsWith('Cisto paraovariano.'));
  const pt = plain(api.buildExternalSuggestion({ source: 'Radiopaedia', sourceUrl: 'https://radiopaedia.org/cases/paratubal-cyst-3', title: 'Paratubal cyst' }, [], []));
  assert.deepEqual([pt.name, pt.enTerm], ['Cisto paratubário', 'Paratubal cyst'], 'termo próximo mantém o próprio nome e o enTerm original');
  const clean = { source: 'Radiopaedia', sourceUrl: URL_CASE, title: 'Paraovarian cyst' };
  assert.equal(api.reconcileExternalImportTitle(clean), clean, 'título já limpo: objeto intacto');
});

test('091f 9: reuso da aba (091e) preservado — alvo nomeado, focus e hashchange intactos', () => {
  assert.match(extractFunction(userscript, 'openAtlasWindow'), /window\.open\(url, ATLAS_WINDOW_NAME\)/);
  assert.match(extractFunction(userscript, 'openAtlasWindow'), /atlasWindow\.focus\(\)/);
  assert.match(userscript, /var ATLAS_WINDOW_NAME = 'atlas-radiologico';/);
  assert.doesNotMatch(userscript, /window\.open\([^)]*(_blank|noopener)/);
  assert.match(html, /const ATLAS_WINDOW_NAME = 'atlas-radiologico';/);
  assert.match(html, /window\.addEventListener\('hashchange'/);
  assert.match(userscript, /@version\s+1\.3\.0/);
});

// ------------------------------------------------- B: conclusão manual
const reviewModule = sliceBetween("const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';", '/* termos de busca em inglês para as lesões da base padrão');
const mergeModule = sliceBetween("const LESION_MERGES_KEY = 'atlas:lesionMerges';", '/* Plano APROVADO pelo usuário (091c).');
function reviewCtx(data) {
  const makeBtn = () => ({ classList: { toggle() {} } });
  const els = { 'pending-reviews-btn': makeBtn(), 'pending-reviews-badge': { textContent: '' }, 'ready-solutions-btn': makeBtn(), 'ready-solutions-badge': { textContent: '' } };
  const ctx = {
    console, Date, Math, JSON, Object, Array,
    storage: { async get() { throw new Error('nf'); }, async set() {} },
    DATA: data || [], saveData: () => { ctx.saveDataCalls += 1; }, saveDataCalls: 0,
    markSyncDirty: async () => {}, pushToFirebase: () => {},
    document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] }
  };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(html, 'canonicalJsonString') + '\n' + extractFunction(html, 'imageIdentityKeys') + '\n' + reviewModule + '\n' + mergeModule
    + '\nthis.__setRevs = (v) => { LESION_REVISIONS = v; }; this.__revs = () => LESION_REVISIONS;', ctx);
  return { ctx, els };
}
const rev = (id, over) => Object.assign({ id, lesionId: 'seed_1', createdAt: 1, updatedAt: 1, status: 'pending', requestText: 'possível duplicata', solution: null, attempts: [], humanFeedback: [], history: [{ timestamp: 1, action: 'created', details: null }] }, over || {});

test('091f 10-14: revisão pending concluída manualmente -> accepted, histórico "Concluída manualmente pelo usuário", DATA intacto, 🔔 cai exatamente 1', () => {
  const lesion = { id: 'seed_1', name: 'Cisto paraovariano', notes: 'n', tags: ['t'] };
  const { ctx, els } = reviewCtx([lesion]);
  ctx.__setRevs({ A: rev('A'), B: rev('B', { lesionId: 'seed_2' }), C: rev('C', { status: 'rejected', lesionId: 'seed_3' }) });
  const dataBefore = JSON.stringify(ctx.DATA);
  ctx.updateReviewCenterBadges();
  const before = ctx.countPendingLesionReviews();
  const res = ctx.resolveReviewManually('A');
  assert.equal(res.ok, true);
  const r = ctx.__revs().A;
  assert.equal(r.status, 'accepted');
  assert.equal(r.resolvedManually, true);
  assert.equal(r.history.length, 2, 'histórico preservado + nova entrada');
  assert.equal(r.history[1].action, 'manually_resolved');
  assert.equal(r.history[1].details.previousStatus, 'pending');
  assert.match(html, /manually_resolved:'Concluída manualmente pelo usuário'/);
  assert.equal(r.requestText, 'possível duplicata');
  assert.equal(JSON.stringify(ctx.DATA), dataBefore, 'nenhum dado da lesão alterado');
  assert.equal(ctx.saveDataCalls, 0);
  assert.equal(ctx.countPendingLesionReviews(), before - 1, 'contador cai exatamente 1');
  assert.equal(els['pending-reviews-badge'].textContent, String(before - 1));
  assert.equal(ctx.hasActiveLesionReview('seed_1'), false, '⚠ some');
  // todos os status ativos podem; finais não
  for (const st of ['rejected', 'proposed', 'applied_pending_validation', 'manual_action_required']) {
    ctx.__setRevs({ X: rev('X', { status: st }) });
    assert.equal(ctx.resolveReviewManually('X').ok, true, st);
  }
  for (const st of ['accepted', 'cancelled']) {
    ctx.__setRevs({ X: rev('X', { status: st }) });
    assert.equal(ctx.resolveReviewManually('X').reason, 'not_active', st);
  }
  assert.equal(ctx.resolveReviewManually('nada').reason, 'not_found');
});

test('091f 15: pendência GERAL ativa ("auditar possíveis duplicatas em fígado") também pode ser marcada como resolvida', () => {
  const { ctx } = reviewCtx([]);
  const g = ctx.createReviewRequest({ scope: 'global', requestText: 'auditar possíveis duplicatas em fígado', category: 'duplicates' });
  assert.equal(g.created, true);
  const res = ctx.resolveReviewManually(g.review.id);
  assert.equal(res.ok, true);
  const r = ctx.__revs()[g.review.id];
  assert.deepEqual([r.status, r.scope, r.lesionId], ['accepted', 'global', null]);
  assert.equal(ctx.countPendingLesionReviews(), 0);
});

test('091f 16: fusão clínica por si só NÃO conclui a revisão — ela segue ativa no keeper até o ✓ humano', () => {
  const { ctx } = reviewCtx([]);
  const st = { data: [{ id: 'keep', name: 'Metástases hepáticas', images: [], tags: [], links: [] }, { id: 'drop', name: 'Metástase hepática', images: [], tags: [], links: [] }],
    lesionRevisions: { R: rev('R', { lesionId: 'drop', requestText: 'duplicata: fundir com Metástases hepáticas' }) } };
  ctx.foldLesionMergesIntoState(st, { drop: { into: 'keep', at: 5 } }, { explicit: true });
  const r = st.lesionRevisions.R;
  assert.equal(r.lesionId, 'keep', 'redirecionada ao keeper');
  assert.equal(r.status, 'pending', 'continua ativa');
  ctx.__setRevs(st.lesionRevisions);
  assert.equal(ctx.hasActiveLesionReview('keep'), true);
  assert.equal(ctx.resolveReviewManually('R').ok, true, 'só a ação humana conclui');
  assert.equal(ctx.hasActiveLesionReview('keep'), false);
  assert.doesNotMatch(extractFunction(html, 'foldLesionMergesIntoState'), /status\s*=\s*'accepted'|resolveReviewManually/);
});

test('091f UI: "✓ Marcar como resolvida" com confirmação curta nas listas da Central e no resumo do ⚠ (sem duplicar o ✓ Concluir da pendência geral)', () => {
  assert.match(html, /const REVIEW_MANUAL_RESOLVE_CONFIRM = 'Marcar esta revisão como resolvida\?\\nNenhum dado da lesão será alterado\.';/);
  const c = extractFunction(html, 'confirmAndResolveReviewManually');
  assert.match(c, /if\(!confirm\(REVIEW_MANUAL_RESOLVE_CONFIRM\)\) return \{ ok:false, reason:'cancelled' \};/);
  assert.doesNotMatch(c, /DATA|saveData\(/);
  assert.equal((html.match(/\$\{reviewResolveButtonHtml\(r\)\}/g) || []).length, 5, 'pendentes, geral proposta, proposta, aplicada, ação manual');
  assert.equal((html.match(/wireReviewResolveButton\((?:row|grow), r\.id, render(?:List|BothLists)\); \/\/ PROTEÇÃO 091f/g) || []).length, 5);
  const btn = extractFunction(html, 'reviewResolveButtonHtml');
  assert.match(btn, /isGlobalReview\(r\) && \(r\.status==='proposed' \|\| r\.status==='manual_action_required'\)\) return '';/);
  assert.match(extractFunction(html, 'openReviewSummaryModal'), /✓ Marcar como resolvida/);
  const resolve = extractFunction(html, 'resolveReviewManually');
  assert.doesNotMatch(resolve, /DATA|saveData\(/, 'nunca toca DATA');
});
