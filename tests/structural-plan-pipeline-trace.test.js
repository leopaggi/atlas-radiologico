'use strict';

// TRACE END-TO-END do "sumiço" do keeper na prévia:
// requestText atual → findExplicitCloneMatches → candidateRecords (export) →
// import da resolução da IA → structuralPlan → preview.
// Prova: o app NUNCA gera no_safe_candidate (a string nem existe no
// index.html) — o rótulo vem do JSON da IA. Com o export corrigido, o
// candidate viaja no pacote; merge válido vira plano com keeper real; merge
// vetado falha com anatomic_conflict explícito (nunca silencioso).
// Fixture: SEED real + reviewIds reais (cervix lrev_muhq25u5_ijyqgq,
// placenta lrev_muhqttye_tvd2bt).

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
  'reviewScope', 'isGlobalReview', 'buildReviewAiAttempts', 'resolveLatestHumanFeedback',
  'structuralReviewPick', 'structuralReviewImageMeta', 'structuralSectionOf', 'structuralSiteOf', 'hasStrongAnatomicConflict',
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy',
  'structuralReviewRecord', 'findExplicitCloneMatches', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'isCrossSectionOverrideValid',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions',
  'structuralPlanPreviewHtml', 'structuralPlanStatusRowHtml', 'buildManualActionAiBatch'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));

// SEED real, ids posicionais como no boot.
const seedLine = html.split('\n').find((l) => l.startsWith('const SEED = '));
const SEED_RAW = JSON.parse(seedLine.slice('const SEED = '.length).replace(/;\s*$/, ''));
SEED_RAW.forEach((e, i) => { e.id = 'seed_' + i; });

const RID_CERVIX = 'lrev_muhq25u5_ijyqgq';
const RID_PLACENTA = 'lrev_muhqttye_tvd2bt';

function ctxFixture() {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW));
  const mkrev = (id, lesionId, requestText) => ({ id, lesionId, status: 'manual_action_required',
    requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = {
    [RID_CERVIX]: mkrev(RID_CERVIX, 'seed_600', 'no caso o clone que deve ser mantido é este Carcinoma de colo do útero'),
    [RID_PLACENTA]: mkrev(RID_PLACENTA, 'seed_530', 'remover - duplicada, mesclar com dados do clone (caso sejam relevantes e nao repetidos) clone: Acretismo placentário (placenta acreta/increta/percreta)')
  };
  const calls = { saves: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS, REVIEW: {}, SRS: {},
    APPROVED_CLINICAL_MERGES_091C: [], LESION_MERGES: {},
    saveLesionRevisions: async () => { calls.saves++; }, toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + names.map(fn).join('\n'), ctx, { filename: 'pipeline-trace-test.js' });
  return ctx;
}
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, resolutions });
const inList = (ctx, listFn, id) => listFn.call(ctx).some((x) => x.id === id);

test('CERVIX FINDER: requestText atual resolve seed_218', () => {
  const ctx = ctxFixture();
  const r = ctx.LESION_REVISIONS[RID_CERVIX];
  const found = ctx.findExplicitCloneMatches(r, ctx.DATA.find((e) => e.id === 'seed_600'));
  assert.equal(found.status, 'FOUND');
  assert.equal(found.matches[0].id, 'seed_218');
});

test('CERVIX CANDIDATE RECORDS: pacote de exportação carrega seed_218', () => {
  const ctx = ctxFixture();
  const pkg = ctx.buildManualActionAiBatch([RID_CERVIX]);
  const action = pkg.actions.find((a) => a.reviewId === RID_CERVIX);
  assert.ok(action, 'ação exportada');
  const cand = action.candidateRecords.find((c) => c.id === 'seed_218');
  assert.ok(cand, 'candidateRecords contém o keeper real');
  assert.ok(cand.candidateReason.includes('explicit_name_in_review'));
});

test('CERVIX PLAN: merge da IA vira plano com keeper seed_218 (nunca unresolved)', async () => {
  const ctx = ctxFixture();
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_CERVIX, resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600',
      merge: {}, reasoning: 'IA', humanOverride: true }]));
  assert.equal(res.ok, true, 'import: ' + res.reason);
  const p = ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan;
  assert.equal(p.status, 'imported');
  assert.equal(p.resolution.keeperId, 'seed_218', 'keeper real, não inventado');
  assert.equal(p.type, 'merge_duplicates');
});

test('CERVIX PREVIEW: MANTER seed_218, REMOVER seed_600, Aceitar disponível', async () => {
  const ctx = ctxFixture();
  await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_CERVIX, resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600',
      merge: {}, reasoning: 'IA', humanOverride: true }]));
  const r = ctx.LESION_REVISIONS[RID_CERVIX];
  const prev = ctx.structuralPlanPreviewHtml(r.structuralPlan.resolution);
  assert.match(prev, /seed_218/);
  assert.match(prev, /Carcinoma de colo do útero/);
  assert.match(prev, /seed_600/);
  assert.ok(!prev.includes('no_safe_candidate'), 'prévia de merge nunca mostra no_safe_candidate');
  const row = ctx.structuralPlanStatusRowHtml(RID_CERVIX);
  assert.match(row, /Aceitar plano/);
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'imported');
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID_CERVIX), true);
});

test('no_safe_candidate só existe em JSON externo (app nunca gera)', async () => {
  const ctx = ctxFixture();
  assert.equal(html.includes('no_safe_candidate'), false, 'app não produz esse rótulo');
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_CERVIX, resolutionType: 'unresolved', reason: 'qualquer_coisa_da_ia', reasoning: 'IA' }]));
  assert.equal(res.ok, true);
  const prev = ctx.structuralPlanPreviewHtml(ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan.resolution);
  assert.match(prev, /Sem resolução estrutural segura/, 'prévia reflete o JSON da IA fielmente');
});

test('PLACENTA FINDER: requestText atual resolve seed_846', () => {
  const ctx = ctxFixture();
  const r = ctx.LESION_REVISIONS[RID_PLACENTA];
  const found = ctx.findExplicitCloneMatches(r, ctx.DATA.find((e) => e.id === 'seed_530'));
  assert.equal(found.status, 'FOUND');
  assert.equal(found.matches[0].id, 'seed_846');
});

test('PLACENTA CANDIDATE RECORDS: pacote carrega seed_846', () => {
  const ctx = ctxFixture();
  const pkg = ctx.buildManualActionAiBatch([RID_PLACENTA]);
  const action = pkg.actions.find((a) => a.reviewId === RID_PLACENTA);
  assert.ok(action.candidateRecords.some((c) => c.id === 'seed_846'), 'candidateRecords contém seed_846');
});

test('PLACENTA BLOCK REASON: merge cross-section falha com anatomic_conflict (nunca silencioso)', async () => {
  const ctx = ctxFixture();
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_PLACENTA, resolutionType: 'merge_duplicates', keeperId: 'seed_846', removeId: 'seed_530',
      merge: {}, reasoning: 'IA', humanOverride: true }]));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'anatomic_conflict');
  assert.equal(ctx.LESION_REVISIONS[RID_PLACENTA].structuralPlan, undefined, 'nada persiste no bloqueio');
});
