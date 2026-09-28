'use strict';

// BUG REAL: mucinoso executado continuava amarelo ("Plano importado").
// Causa: DIVERGÊNCIA — reimport (pré-idempotência) recolocou structuralPlan em
// imported (importedAt mais novo) com structuralExecution em executed.
// Correção: getEffectiveStructuralStatus (terminal da execução sempre vence)
// usado em TODA a UI; guards already_executed em accept/reject/execute;
// import terminal protege também pela execution.
// Fixture exata: lrev_muhnyp9a_jwivjs, seed_208 keeper, seed_698 remove.

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
  'structuralReviewRecord', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanKnownIds',
  'validateStructuralResolution',
  'lesionMergeLinkKey', 'mergeClinicalCasesForFold', 'mergeDidacticItems',
  'mergeReviewProgress', 'mergeReviewOverrides', 'clinicalCaseIdentityKey',
  'structuralPlanLesion', 'structuralPlanResolveImage',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots', 'executeStructuralPlan',
  'structuralApplyMerge', 'rollbackStructuralExecution',
  'acceptStructuralPlan', 'rejectStructuralPlan',
  'validateStructuralResolutionBatch', 'persistValidatedStructuralPlan', 'importStructuralResolutionBatch',
  'structuralBatchKey', 'structuralResolutionHash',
  'getStructuralPlanBatches', 'structuralBatchCounts',
  'structuralBatchEntryHtml', 'structuralBatchModalHtml', 'structuralBatchSummaryHtml',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions',
  'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml', 'structuralPlanStatusRowHtml',
  'structuralPlanPreviewHtml', 'structuralPlanLiveView', 'resolveReviewManually',
  'mergeLesionRevisions',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership'];
const src = names.map(fn).join('\n');
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const execConsts = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const ownershipConst = "const IMAGE_OWNERSHIP_MANUAL = { manual:true };\n";
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";

const RID = 'lrev_muhnyp9a_jwivjs';
function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [], links: [],
    clinicalCases: [], radiologicSigns: [], classificationSchemes: [], _userUpdatedAt: 100 }, over || {});
}
const IMG = (assetId, lesionId, lesionName) => ({ assetId, data: 'https://res.cloudinary.com/x/' + assetId + '.jpg', source: 'cloudinary', label: 'img', lesionId, lesionName });

function ctxFixture() {
  const DATA = [
    lesion('seed_208', { name: 'Cistoadenoma mucinoso', classification: 'O-RADS', images: [IMG('A208', 'seed_208', 'Cistoadenoma mucinoso')] }),
    lesion('seed_698', { name: 'Cistadenoma mucinoso ovariano', classification: 'O-RADS', images: [IMG('A698', 'seed_698', 'Cistadenoma mucinoso ovariano')] })
  ];
  const LESION_REVISIONS = {
    [RID]: { id: RID, lesionId: 'seed_698', status: 'manual_action_required',
      requestText: 'Mucinoso duplicado — fundir clone', manualAction: { type: 'duplicate_merge', description: 'Localizar clone' },
      history: [], createdAt: 1000, updatedAt: 1000 }
  };
  const calls = { saves: 0, badges: 0 };
  const ctx = vm.createContext({
    DATA, LESION_REVISIONS,
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
    toast: () => {}, console
  });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + execConsts + '\n' + ownershipConst + statusesConst + src, ctx, { filename: 'mucinoso-test.js' });
  return ctx;
}

function mucinosoResolution() {
  return { reviewId: RID, resolutionType: 'merge_duplicates', keeperId: 'seed_208', removeId: 'seed_698',
    merge: {}, reasoning: 'teste', humanOverride: true };
}

async function importAcceptExecute(ctx) {
  const imp = await ctx.importStructuralResolutionBatch({ type: 'atlas_structural_resolution_batch', version: 1, resolutions: [mucinosoResolution()] });
  assert.equal(imp.ok, true, 'import: ' + imp.reason);
  assert.equal((await ctx.acceptStructuralPlan(RID)).ok, true);
  const ex = await ctx.executeStructuralPlan(RID);
  assert.equal(ex.ok, true, 'execute: ' + ex.reason);
  return ex;
}
const ids = (ctx) => ctx.DATA.map((e) => e.id).sort();
const inList = (ctx, listFn, id) => listFn.call(ctx).some((r) => r.id === id);

test('ciclo real: imported→accepted→execute do mucinoso', async () => {
  const ctx = ctxFixture();
  await importAcceptExecute(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  assert.equal(r.structuralPlan.status, 'executed');
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'executed');
  assert.deepEqual(ids(ctx), ['seed_208']);
  assert.equal(ctx.LESION_MERGES['seed_698'].into, 'seed_208');
});

test('renders: manual exclui, lote+histórico mostram Executado, sem amarelo', async () => {
  const ctx = ctxFixture();
  await importAcceptExecute(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), false, 'sai das manuais');
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true, 'entra no histórico');
  const groups = ctx.getStructuralPlanBatches();
  assert.equal(groups.length, 1, 'lote com o plano');
  assert.equal(ctx.structuralBatchCounts(groups[0]).executed, 1, 'lote conta executed');
  assert.equal(ctx.structuralBatchCounts(groups[0]).awaiting, 0, 'nada como aguardando');
  const modal = ctx.structuralBatchModalHtml();
  assert.match(modal, /Executado/);
  assert.ok(!modal.includes('Plano importado'), 'sem amarelo no lote para este review');
  const row = ctx.structuralPlanStatusRowHtml(RID);
  assert.match(row, /Executado/);
  assert.ok(!row.includes('Plano importado'));
  assert.ok(!row.includes('data-plan-act="accept"'));
  assert.ok(!row.includes('data-plan-act="execute"'));
  assert.match(row, /data-plan-act="rollback"/);
  assert.match(ctx.structuralPlanCardBadgeHtml(r), /Executado/);
});

test('DIVERGÊNCIA (reimport recolocou imported): efetivo segue executed', async () => {
  const ctx = ctxFixture();
  await importAcceptExecute(ctx);
  // Simula o clobber pré-idempotência: plano regredido, execução intacta.
  const r = ctx.LESION_REVISIONS[RID];
  r.structuralPlan.status = 'imported';
  r.structuralPlan.importedAt = new Date(Date.now() + 60000).toISOString();
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'executed', 'terminal vence');
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), false);
  const modal = ctx.structuralBatchModalHtml();
  assert.match(modal, /Executado/);
  assert.ok(!modal.includes('Plano importado'), 'lote sem amarelo mesmo divergido');
  const row = ctx.structuralPlanStatusRowHtml(RID);
  assert.match(row, /data-plan-act="rollback"/);
  assert.ok(!row.includes('data-plan-act="accept"'));
});

test('divergido: accept/reject/execute bloqueiam (already_executed)', async () => {
  const ctx = ctxFixture();
  await importAcceptExecute(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  r.structuralPlan.status = 'imported';
  assert.equal((await ctx.acceptStructuralPlan(RID)).reason, 'already_executed');
  assert.equal((await ctx.rejectStructuralPlan(RID)).reason, 'already_executed');
  assert.equal((await ctx.executeStructuralPlan(RID)).reason, 'plan_not_accepted');
  assert.equal(r.structuralPlan.status, 'imported', 'bloqueios não mutam nada');
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'executed', 'segue executed');
});

test('reimport não rebaixa executed (idempotente + terminal)', async () => {
  const ctx = ctxFixture();
  await importAcceptExecute(ctx);
  // Revisão resolvida: a validação barra na porta (review_not_manual) sem
  // tocar em nada — tudo-ou-nada preserva o executed.
  const res = await ctx.importStructuralResolutionBatch({ type: 'atlas_structural_resolution_batch', version: 1, resolutions: [mucinosoResolution()] });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'review_not_manual');
  assert.equal(ctx.LESION_REVISIONS[RID].structuralPlan.status, 'executed');
  assert.equal(ctx.getEffectiveStructuralStatus(ctx.LESION_REVISIONS[RID]), 'executed');
});

test('reload/sync mantêm executed e renders', async () => {
  const ctx = ctxFixture();
  await importAcceptExecute(ctx);
  const restored = JSON.parse(JSON.stringify({ revs: ctx.LESION_REVISIONS, data: ctx.DATA, merges: ctx.LESION_MERGES }));
  assert.equal(restored.revs[RID].structuralPlan.status, 'executed');
  assert.ok(!restored.data.some((e) => e.id === 'seed_698'));
  assert.ok(restored.data.some((e) => e.id === 'seed_208'));
  const local = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  const remote = JSON.parse(JSON.stringify(local));
  remote[RID].structuralPlan.status = 'imported';
  remote[RID].structuralPlan.decidedAt = '2026-01-01T00:00:00.000Z';
  delete remote[RID].structuralExecution;
  remote[RID].updatedAt = Date.now() + 100000;
  const merged = ctx.mergeLesionRevisions(local, remote);
  ctx.LESION_REVISIONS[RID] = merged[RID];
  assert.equal(ctx.getEffectiveStructuralStatus(merged[RID]), 'executed', 'sync mantém executed');
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
});
