'use strict';

// LOTE ESTRUTURAL PERSISTENTE: um batch importado uma vez serve todas as
// revisões até cada uma chegar ao estado terminal — sem reimportar.
// Garantias: ops individuais não tocam os demais planos; reimport do mesmo
// lote é idempotente; executed/rolledback nunca são sobrescritos; a visão do
// lote é DERIVADA do estado vivo (reload/sync preservam).

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
  'structuralReviewRecord', 'findExplicitCloneMatches', 'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'persistValidatedStructuralPlan', 'importStructuralResolutionBatch', 'acceptStructuralPlan', 'rejectStructuralPlan',
  'structuralPlanPreviewHtml', 'structuralBatchKey', 'structuralResolutionHash',
  'getStructuralPlanBatches', 'structuralBatchCounts',
  'structuralBatchEntryHtml', 'structuralBatchModalHtml', 'structuralBatchSummaryHtml',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots', 'executeStructuralPlan',
  'structuralApplyAddCases', 'rollbackStructuralExecution', 'genDidacticId', 'resolveReviewManually',
  'structuralPlanLiveView', 'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions', 'mergeLesionRevisions'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const execConsts = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";
const snapshotStoreConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));

function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '', classification: null,
    tags: [], enTerm: '', images: [], altPlacements: [], links: [], clinicalCases: [], radiologicSigns: [],
    classificationSchemes: [], _userUpdatedAt: 100 }, over || {});
}

function ctxFixture() {
  const DATA = [lesion('L1'), lesion('L2'), lesion('L3'), lesion('L4'),
    lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)' })];
  const manual = (id, lesionId) => ({ id, lesionId, status: 'manual_action_required',
    requestText: 'ação ' + id, manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = { R1: manual('R1', 'L1'), R2: manual('R2', 'L2'), R3: manual('R3', 'L3'), R4: manual('R4', 'L4') };
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
    toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + execConsts + '\n' + statusesConst + snapshotStoreConst + names.map(fn).join('\n'), ctx, { filename: 'batch-test.js' });
  return ctx;
}

const plain = o => JSON.parse(JSON.stringify(o));
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, generatedAt: '2026-09-27T00:00:00.000Z', resolutions });
const addCases = (reviewId, lesionId) => ({ reviewId, resolutionType: 'add_clinical_cases', lesionId,
  clinicalCases: [{ title: 'caso ' + reviewId }], reasoning: 'x' });
const BATCH4 = () => batch([addCases('R1', 'L1'), addCases('R2', 'L2'),
  { reviewId: 'R3', resolutionType: 'unresolved', reason: 'sem candidato', reasoning: 'x' },
  addCases('R4', 'L4')]);
const planOf = (ctx, id) => ctx.LESION_REVISIONS[id].structuralPlan;

async function import4(ctx) {
  const res = await ctx.importStructuralResolutionBatch(BATCH4());
  assert.equal(res.ok, true, 'batch de 4 deve importar: ' + res.reason);
  return res;
}

test('1. batch com várias resolutions persiste todas', async () => {
  const ctx = ctxFixture();
  const res = await import4(ctx);
  assert.equal(res.imported.length, 4);
  for (const id of ['R1', 'R2', 'R3', 'R4']) assert.equal(planOf(ctx, id).status, 'imported');
  const key = planOf(ctx, 'R1').batchKey;
  assert.ok(key && key.startsWith('sb_'));
  for (const id of ['R2', 'R3', 'R4']) assert.equal(planOf(ctx, id).batchKey, key, 'mesmo lote');
  assert.match(ctx.structuralBatchSummaryHtml(), /4 revisões no lote/);
});

test('2. executar uma não remove as demais', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  assert.equal((await ctx.acceptStructuralPlan('R1')).ok, true);
  assert.equal((await ctx.executeStructuralPlan('R1')).ok, true);
  assert.equal(planOf(ctx, 'R1').status, 'executed');
  for (const id of ['R2', 'R3', 'R4']) {
    assert.ok(planOf(ctx, id), id + ' mantém plano');
    assert.equal(planOf(ctx, id).status, 'imported', id + ' continua importado');
    assert.ok(planOf(ctx, id).resolutionHash, id + ' mantém hash');
  }
});

test('3. rejeitar uma não remove as demais', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  assert.equal((await ctx.rejectStructuralPlan('R2')).ok, true);
  assert.equal(planOf(ctx, 'R2').status, 'rejected');
  for (const id of ['R1', 'R3', 'R4']) assert.equal(planOf(ctx, id).status, 'imported');
});

test('4. rollback de uma não remove as demais', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  await ctx.acceptStructuralPlan('R1');
  await ctx.executeStructuralPlan('R1');
  const rb = await ctx.rollbackStructuralExecution('R1');
  assert.equal(rb.ok, true);
  assert.equal(planOf(ctx, 'R1').status, 'rolledback');
  for (const id of ['R2', 'R3', 'R4']) assert.equal(planOf(ctx, id).status, 'imported', id + ' intacto após rollback de R1');
});

test('5. reload preserva lote', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  const fresh = { groups: null };
  ctx.LESION_REVISIONS = restored;
  fresh.groups = ctx.getStructuralPlanBatches();
  assert.equal(fresh.groups.length, 1);
  assert.equal(fresh.groups[0].reviewIds.length, 4);
  assert.match(ctx.structuralBatchSummaryHtml(), /4 revisões no lote/);
});

test('6. sync preserva lote', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  const local = plain(ctx.LESION_REVISIONS);
  const remote = plain(local);
  for (const id of ['R1', 'R2', 'R3', 'R4']) { delete remote[id].structuralPlan; remote[id].updatedAt = 500; }
  const merged = ctx.mergeLesionRevisions(local, remote);
  ctx.LESION_REVISIONS = merged;
  for (const id of ['R1', 'R2', 'R3', 'R4']) assert.equal(planOf(ctx, id).status, 'imported', id + ' sobrevive ao sync');
  assert.equal(ctx.getStructuralPlanBatches()[0].reviewIds.length, 4);
});

test('7. mesmo batch reimportado é idempotente', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  await ctx.acceptStructuralPlan('R2');
  const histBefore = plain(ctx.LESION_REVISIONS['R2'].history);
  const res = await ctx.importStructuralResolutionBatch(BATCH4());
  assert.equal(res.ok, true);
  assert.equal(res.imported.length, 0, 'nada novo');
  assert.equal(res.skipped.length, 4, 'tudo pulado');
  assert.equal(planOf(ctx, 'R2').status, 'accepted', 'aceito não reseta');
  assert.deepEqual(plain(ctx.LESION_REVISIONS['R2'].history), histBefore, 'sem histórico duplicado');
});

test('8. executed/rolledback nunca voltam para imported', async () => {
  const ctx = ctxFixture();
  const termPlan = (st, hash) => ({ status: st, importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
    batchKey: 'sb_RT', batchImportedAt: 'x', resolutionHash: hash,
    resolution: { reviewId: 'RT', valid: true, type: 'merge_duplicates', keeperId: 'seed_206', removeId: 'seed_575', merge: {}, reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } });
  // Revisão ainda manual mas com plano terminal (borda real: rollback reabre
  // a revisão; sync pode trazer executed). Reimportar NÃO pode regredir.
  ctx.LESION_REVISIONS['RT'] = { id: 'RT', lesionId: 'seed_206', status: 'manual_action_required',
    requestText: 't', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1, updatedAt: 2000,
    structuralPlan: termPlan('rolledback', 'h-old'),
    structuralExecution: { executionId: 'exec_rt', status: 'rolledback', at: 'y', rolledbackAt: 'z' } };
  // Revisão resolvida normalmente nem passa da validação (review_not_manual);
  // o guard terminal protege os estados manuais acima e abaixo.
  let res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RT', resolutionType: 'add_clinical_cases', lesionId: 'seed_206', clinicalCases: [{ title: 'outro' }], reasoning: 'x' }]));
  assert.equal(res.ok, true);
  assert.equal(res.imported.length, 0, 'terminal não sobrescrito');
  assert.equal(res.skipped[0].reason, 'terminal_state_preserved');
  assert.equal(planOf(ctx, 'RT').status, 'rolledback');
  assert.equal(planOf(ctx, 'RT').resolutionHash, 'h-old');
  // executed + manual: mesmo guard.
  ctx.LESION_REVISIONS['RT'].structuralPlan = termPlan('executed', 'h-old');
  ctx.LESION_REVISIONS['RT'].structuralExecution.status = 'executed';
  res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RT', resolutionType: 'add_clinical_cases', lesionId: 'seed_206', clinicalCases: [{ title: 'outro' }], reasoning: 'x' }]));
  assert.equal(res.ok, true);
  assert.equal(res.imported.length, 0);
  assert.equal(planOf(ctx, 'RT').status, 'executed');
});

test('9. lote mostra status individual', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  await ctx.acceptStructuralPlan('R1');
  await ctx.executeStructuralPlan('R1');
  await ctx.rejectStructuralPlan('R2');
  const modal = ctx.structuralBatchModalHtml();
  assert.match(modal, /Executado/);
  assert.match(modal, /Rejeitado/);
  assert.match(modal, /Aguardando aprovação/);
  assert.match(modal, /Sem resolução segura/);
  assert.match(modal, /Abrir plano/);
});

test('10. Teratoma executed aparece no lote e no histórico', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  const key = planOf(ctx, 'R1').batchKey;
  ctx.LESION_REVISIONS['lrev_muhmzdmv_6rak3k'] = { id: 'lrev_muhmzdmv_6rak3k', lesionId: 'seed_206', status: 'accepted',
    requestText: 'Teratoma', manualAction: { type: 'duplicate_merge', description: 'x' },
    history: [], createdAt: 1, updatedAt: 4000, completedAt: 4000, resolvedManually: true,
    structuralPlan: { status: 'executed', importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
      batchKey: key, batchImportedAt: 'x', resolutionHash: 'h-t',
      resolution: { reviewId: 'lrev_muhmzdmv_6rak3k', valid: true, type: 'merge_duplicates',
        keeperId: 'seed_206', removeId: 'seed_575', keeperName: 'Teratoma maduro (cisto dermoide)',
        removeName: 'Teratoma cístico maduro', merge: {}, reasoning: 'x' },
      snapshot: { createdAt: 'x', lesions: {} } },
    structuralExecution: { executionId: 'exec_t1', status: 'executed', at: 'z' } };
  const groups = ctx.getStructuralPlanBatches();
  const g = groups.find((x) => x.batchKey === key);
  assert.ok(g.reviewIds.includes('lrev_muhmzdmv_6rak3k'), 'Teratoma no lote');
  assert.ok(g.reviews.some((r) => r.structuralPlan.status === 'executed'), 'lote marca executed');
  assert.ok(ctx.getStructuralHistorySolutions().some((r) => r.id === 'lrev_muhmzdmv_6rak3k'), 'Teratoma no histórico');
  assert.match(ctx.structuralBatchModalHtml(), /Teratoma maduro/);
  assert.match(ctx.structuralBatchModalHtml(), /seed_575 → seed_206/);
});

test('11. demais planos permanecem pré-visualizáveis', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  await ctx.acceptStructuralPlan('R1');
  assert.equal((await ctx.executeStructuralPlan('R1')).ok, true);
  for (const id of ['R2', 'R3', 'R4']) {
    const v = ctx.structuralPlanLiveView(id);
    assert.ok(v, id + ' reabre sem reimportar');
  }
});

test('12+13. render do lote não altera DATA nem ressuscita removeId', async () => {
  const ctx = ctxFixture();
  await import4(ctx);
  const before = JSON.stringify(ctx.DATA);
  ctx.structuralBatchSummaryHtml();
  ctx.structuralBatchModalHtml();
  ctx.getStructuralPlanBatches().forEach((g) => g.reviews.forEach((r) => ctx.structuralBatchEntryHtml(r)));
  assert.equal(JSON.stringify(ctx.DATA), before, 'render é só leitura');
  assert.ok(!ctx.DATA.some((e) => e.id === 'seed_575'), 'removeId inexistente continua inexistente');
});
