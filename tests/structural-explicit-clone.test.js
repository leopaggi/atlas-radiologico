'use strict';

// Pedido EDITADO nomeia o clone, mas o pacote não o trazia: o matcher só
// achava nome inteiro como substring do pedido (forma longa) e o score frágil
// podia excluir. findExplicitCloneMatches resolve "clone: X" (forma longa OU
// curta) para o ID REAL — nunca inventa; o veto anatômico de órgãos continua
// valendo e a prévia humana decide. Fixture: SEED real do index.html.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function fn(name) {
  const re = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html); assert.ok(m, name + ' ausente');
  const open = html.indexOf('{', m.index + m[0].length);
  let depth = 0, quote = '', esc = false, line = false, block = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i], n = html[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++; else if (c === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error('função não fechada ' + name);
}

const names = ['normalizeExternalTitle', 'normalizeRadiopaediaCaseTitle', 'tokenizeExternalTitle', 'externalTokenOverlap', 'levNormSimilarity', 'externalMatchBand',
  'structuralReviewPick', 'structuralReviewImageMeta', 'structuralSectionOf', 'structuralSiteOf', 'hasStrongAnatomicConflict',
  'structuralReviewRecord', 'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'findExplicitCloneMatches', 'findStructuralReviewCandidates'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));

// SEED real, ids posicionais como no boot.
const seedLine = html.split('\n').find((l) => l.startsWith('const SEED = '));
const SEED_RAW = JSON.parse(seedLine.slice('const SEED = '.length).replace(/;\s*$/, ''));
SEED_RAW.forEach((e, i) => { e.id = 'seed_' + i; });

function ctxFixture() {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW));
  const ctx = vm.createContext({ DATA, LESION_MERGES: {}, APPROVED_CLINICAL_MERGES_091C: [], console });
  vm.runInContext(consts + '\n' + mapping + '\n' + names.map(fn).join('\n'), ctx, { filename: 'explicit-clone-test.js' });
  return ctx;
}
const mkReview = (id, lesionId, requestText) => ({ id, lesionId, status: 'manual_action_required',
  requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1, updatedAt: 1 });
const srcOf = (ctx, id) => ctx.DATA.find((e) => e.id === id);

test('1+2+3. placenta: pedido nomeia clone real, fora da heurística, exatamente um', () => {
  const ctx = ctxFixture();
  const r = mkReview('lrev_muhqttye_tvd2bt', 'seed_530',
    'remover - duplicada, mesclar com dados do clone (caso sejam relevantes e nao repetidos) clone: Acretismo placentário (placenta acreta/increta/percreta)');
  const res = ctx.findExplicitCloneMatches(r, srcOf(ctx, 'seed_530'));
  assert.equal(res.status, 'FOUND');
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].id, 'seed_846', 'ID real, nunca inventado');
  assert.equal(res.matches[0].name, 'Acretismo placentário (placenta acreta/increta/percreta)');
});

test('citação curta (sem parênteses) também resolve', () => {
  const ctx = ctxFixture();
  const r = mkReview('R', 'seed_530', 'duplicada, fundir com o clone: Acretismo placentário');
  const res = ctx.findExplicitCloneMatches(r, srcOf(ctx, 'seed_530'));
  assert.equal(res.status, 'FOUND');
  assert.equal(res.matches[0].id, 'seed_846');
});

test('4. veto anatômico de órgãos continua valendo no finder', () => {
  const ctx = ctxFixture();
  const r = mkReview('R', 'seed_530',
    'remover - duplicada, mesclar com dados do clone (caso sejam relevantes e nao repetidos) clone: Acretismo placentário (placenta acreta/increta/percreta)');
  const cands = ctx.findStructuralReviewCandidates(r, srcOf(ctx, 'seed_530'));
  // Placenta/útero não formam par incompatível (ovário×pâncreas etc.) → incluído.
  assert.ok(cands.some((c) => c.id === 'seed_846'));
  // Contraponto: citar o homônimo pancreático para review ovariana NÃO entra.
  const ro = mkReview('R2', 'seed_207', 'duplicada, fundir com o clone: Cistoadenoma seroso');
  const co = ctx.findStructuralReviewCandidates(ro, srcOf(ctx, 'seed_207'));
  assert.ok(!co.some((c) => c.id === 'seed_156'), 'seed_156 pancreático vetado mesmo citado');
});

test('5+6. candidateRecord incluído; plano deixa de ser vazio', () => {
  const ctx = ctxFixture();
  const r = mkReview('lrev_muhqttye_tvd2bt', 'seed_530',
    'remover - duplicada, mesclar com dados do clone (caso sejam relevantes e nao repetidos) clone: Acretismo placentário (placenta acreta/increta/percreta)');
  const cands = ctx.findStructuralReviewCandidates(r, srcOf(ctx, 'seed_530'));
  const keeper = cands.find((c) => c.id === 'seed_846');
  assert.ok(keeper, 'candidateRecord real presente');
  assert.ok(keeper.candidateReason.includes('explicit_name_in_review'));
  assert.ok(cands.length >= 1, 'não é mais no_safe_candidate por falta de candidato');
});

test('CASO 2: cervix encontra seed_218 exato e compatível', () => {
  const ctx = ctxFixture();
  const r = mkReview('lrev_muhq25u5_ijyqgq', 'seed_600',
    'no caso o clone que deve ser mantido é este Carcinoma de colo do útero');
  const res = ctx.findExplicitCloneMatches(r, srcOf(ctx, 'seed_600'));
  assert.equal(res.status, 'FOUND');
  assert.equal(res.matches[0].id, 'seed_218');
  const cands = ctx.findStructuralReviewCandidates(r, srcOf(ctx, 'seed_600'));
  assert.ok(cands.some((c) => c.id === 'seed_218'));
});

test('7. prévia humana continua obrigatória (só export carrega candidato)', () => {
  // O finder só alimenta candidateRecords do pacote de exportação; não há
  // apply automático: nenhum caminho chama merge/execute a partir daqui.
  assert.match(fn('findStructuralReviewCandidates'), /candidateReason/);
  assert.doesNotMatch(fn('findExplicitCloneMatches'), /executeStructuralPlan|structuralApplyMerge|saveData/);
  assert.match(html, /candidateRecords:scope==='lesion'\?findStructuralReviewCandidates\(r,source\):\[\]/);
});

test('8. nenhum candidato inventado (todo id existe no DATA)', () => {
  const ctx = ctxFixture();
  const ids = new Set(ctx.DATA.map((e) => e.id));
  const r = mkReview('R', 'seed_530', 'clone: Acretismo placentário (placenta acreta/increta/percreta)');
  for (const c of ctx.findStructuralReviewCandidates(r, srcOf(ctx, 'seed_530'))) assert.ok(ids.has(c.id), c.id);
});

test('9. nome inexistente → NOT_FOUND', () => {
  const ctx = ctxFixture();
  const r = mkReview('R', 'seed_530', 'duplicada, fundir com o clone: Xyzq Lesão Inexistente Zz');
  const res = ctx.findExplicitCloneMatches(r, srcOf(ctx, 'seed_530'));
  assert.equal(res.status, 'NOT_FOUND');
  assert.equal(res.matches.length, 0);
});

test('10. múltiplos matches → AMBIGUOUS com IDs', () => {
  const ctx = ctxFixture();
  const r = mkReview('R', 'seed_600', 'duplicada, fundir com o clone: Cistoadenoma seroso');
  const res = ctx.findExplicitCloneMatches(r, srcOf(ctx, 'seed_600'));
  assert.equal(res.status, 'AMBIGUOUS');
  const got = res.matches.map((e) => e.id).sort();
  assert.ok(got.includes('seed_207') && got.includes('seed_156'), 'homônimos listados: ' + got.join(','));
  assert.ok(!got.includes('seed_600'), 'source nunca é o próprio match');
});
