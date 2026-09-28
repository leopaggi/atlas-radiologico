'use strict';

// Override humano RESTRITO para fusão cross-section (placenta: Obstetrícia ×
// Pelve — artefato de taxonomia, não conflito real). Regras: flag explícita
// no plano + keeper citado no pedido ATUAL (match único) + SEM par
// incompatível de órgãos + prévia + aceite obrigatórios. O veto global
// (ovário×pâncreas etc.) continua intacto. Sem autoexecução.

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
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'isCrossSectionOverrideValid',
  'structuralReviewRecord', 'findExplicitCloneMatches', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash',
  'acceptStructuralPlan', 'rejectStructuralPlan',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots', 'executeStructuralPlan',
  'structuralApplyMerge', 'resolveReviewManually',
  'lesionMergeLinkKey', 'mergeClinicalCasesForFold', 'mergeDidacticItems',
  'mergeReviewProgress', 'mergeReviewOverrides', 'clinicalCaseIdentityKey',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership',
  'getEffectiveStructuralStatus', 'structuralPlanPreviewHtml'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const execConsts = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const ownershipConst = "const IMAGE_OWNERSHIP_MANUAL = { manual:true };\n";
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";

// SEED real, ids posicionais como no boot.
const seedLine = html.split('\n').find((l) => l.startsWith('const SEED = '));
const SEED_RAW = JSON.parse(seedLine.slice('const SEED = '.length).replace(/;\s*$/, ''));
SEED_RAW.forEach((e, i) => { e.id = 'seed_' + i; });

function ctxFixture(keepIds) {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW.filter((e) => keepIds.includes(e.id))));
  const mkrev = (id, lesionId, requestText) => ({ id, lesionId, status: 'manual_action_required',
    requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = {
    RP: mkrev('RP', 'seed_530', 'remover - duplicada, mesclar com dados do clone clone: Acretismo placentário (placenta acreta/increta/percreta)')
  };
  const calls = { saves: 0, badges: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS,
    REVIEW: {}, REVIEW_STAMPS: {}, REVIEW_PROGRESS: {}, REVIEW_OVERRIDE: {},
    SRS: {}, LESION_MERGES: {}, PENDING_LOCAL_IMAGE_ADDS: {},
    saveData: async () => { calls.saves++; },
    saveLesionRevisions: async () => { calls.saves++; },
    saveLesionMerges: async () => { calls.saves++; },
    saveReview: async () => { calls.saves++; },
    saveSRS: async () => { calls.saves++; },
    saveReviewStamps: async () => { calls.saves++; },
    saveReviewProgressState: async () => { calls.saves++; },
    savePendingLocalImageAdds: async () => { calls.saves++; },
    updateReviewCenterBadges: () => { calls.badges++; },
    registerImageOwnershipConflict: (c) => ({ id: 'conflict_test', conflict: c || null }),
    toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + execConsts + '\n' + ownershipConst + statusesConst + names.map(fn).join('\n'), ctx, { filename: 'override-test.js' });
  return ctx;
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, resolutions });
const placentaMerge = (over) => Object.assign({ reviewId: 'RP', resolutionType: 'merge_duplicates',
  keeperId: 'seed_846', removeId: 'seed_530', merge: {}, reasoning: 'placenta',
  crossSectionOverride: true }, over || {});

test('1. seed_530→seed_846 permitido com override explícito (import+dry+execute)', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  const imp = await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  assert.equal(imp.ok, true, 'import: ' + imp.reason);
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'imported');
  assert.equal((await ctx.acceptStructuralPlan('RP')).ok, true);
  const dry = ctx.dryRunStructuralPlan('RP');
  assert.equal(dry.ok, true, 'dry: ' + dry.reason);
  assert.equal(dry.executes, true);
  assert.ok(dry.warnings.some((w) => w.kind === 'cross_section_override'));
  assert.ok(!dry.conflicts.some((c) => c.kind === 'anatomic_conflict'));
  const ex = await ctx.executeStructuralPlan('RP');
  assert.equal(ex.ok, true, 'execute: ' + ex.reason);
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'executed');
  assert.equal(ctx.LESION_MERGES['seed_530'].into, 'seed_846');
  assert.ok(ctx.DATA.some((e) => e.id === 'seed_846'));
  assert.ok(!ctx.DATA.some((e) => e.id === 'seed_530'));
});

test('2. mesmo par sem override continua bloqueado', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  const imp = await ctx.importStructuralResolutionBatch(batch([placentaMerge({ crossSectionOverride: false })]));
  assert.equal(imp.ok, false);
  assert.equal(imp.reason, 'anatomic_conflict');
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan, undefined, 'nada persiste');
});

test('3. ovário→pâncreas continua bloqueado mesmo com texto parecido + override', async () => {
  const ctx = ctxFixture(['seed_207', 'seed_156']);
  ctx.LESION_REVISIONS['RO'] = { id: 'RO', lesionId: 'seed_156', status: 'manual_action_required',
    requestText: 'duplicada, fundir com o clone: Cistoadenoma seroso',
    manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1, updatedAt: 1 };
  // Citação resolve para seed_207 (source excluída), mas o par de órgãos
  // ovário×pâncreas veta de todo jeito. Dupla barreira.
  const imp = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RO', resolutionType: 'merge_duplicates', keeperId: 'seed_207', removeId: 'seed_156',
      merge: {}, reasoning: 'x', humanOverride: true, crossSectionOverride: true }]));
  assert.equal(imp.ok, false);
  assert.equal(imp.reason, 'anatomic_conflict');
  assert.ok(ctx.hasIncompatibleOrganAnatomy(
    ctx.DATA.find((e) => e.id === 'seed_207'), ctx.DATA.find((e) => e.id === 'seed_156')));
  assert.ok(!ctx.hasIncompatibleOrganAnatomy(
    ctx.DATA.find((e) => e.id === 'seed_530'), ctx.DATA.find((e) => e.id === 'seed_846')));
});

test('4. override não vale para outro keeper', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846', 'seed_444']);
  const imp = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RP', resolutionType: 'merge_duplicates', keeperId: 'seed_444', removeId: 'seed_530',
      merge: {}, reasoning: 'x', humanOverride: true, crossSectionOverride: true }]));
  assert.equal(imp.ok, false, 'citado seed_846 mas keeper seed_444');
  assert.equal(imp.reason, 'anatomic_conflict');
});

test('5. preview obrigatória mostra o override', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  const prev = ctx.structuralPlanPreviewHtml(ctx.LESION_REVISIONS['RP'].structuralPlan.resolution);
  assert.match(prev, /cross-section aprovada manualmente/);
});

test('6. accept obrigatório (sem autoexecução)', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'imported', 'import não executa');
  assert.equal((await ctx.acceptStructuralPlan('RP')).ok, true);
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'accepted');
  assert.ok(ctx.DATA.some((e) => e.id === 'seed_530'), 'nada fundido no aceite');
});

test('7. executed/rolledback continuam terminais', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  await ctx.acceptStructuralPlan('RP');
  await ctx.executeStructuralPlan('RP');
  assert.equal((await ctx.acceptStructuralPlan('RP')).reason, 'already_executed');
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'executed');
});

test('8. histórico registra uso do override', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  const h = ctx.LESION_REVISIONS['RP'].history;
  assert.ok(h.some((x) => x.action === 'structural_plan_imported' && x.details && x.details.crossSectionOverride === true));
  await ctx.acceptStructuralPlan('RP');
  const h2 = ctx.LESION_REVISIONS['RP'].history;
  assert.ok(h2.some((x) => x.action === 'structural_plan_accepted' && x.details && x.details.crossSectionOverride === true));
});

test('9. outros planos intocados', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846', 'seed_600', 'seed_218']);
  ctx.LESION_REVISIONS['RC'] = { id: 'RC', lesionId: 'seed_600', status: 'manual_action_required',
    requestText: 'x', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1, updatedAt: 1,
    structuralPlan: { status: 'imported', importedAt: 'x', type: 'unresolved',
      resolution: { reviewId: 'RC', valid: true, type: 'unresolved', reason: 'r', reasoning: 'x' },
      snapshot: { createdAt: 'x', lesions: {} } } };
  const before = JSON.stringify(ctx.LESION_REVISIONS['RC'].structuralPlan);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS['RC'].structuralPlan), before);
});
