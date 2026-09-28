'use strict';

// Rejected/unresolved NÃO são terminais permanentes: nova importação válida
// substitui o plano (histórico preservado), executed/rolledback nunca.
// Auditoria: não existe gate `previousOutcome === rejected` nem status
// rejected imutável — o mecanismo de reopen já funciona; este teste trava o
// contrato. Casos reais: placenta (lrev_muhqttye_tvd2bt) e cervix
// (lrev_muhq25u5_ijyqgq) com SEED real.

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
  'structuralReviewRecord', 'findExplicitCloneMatches', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash',
  'acceptStructuralPlan', 'rejectStructuralPlan',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions',
  'getStructuralPlanBatches', 'structuralBatchCounts',
  'structuralPlanCardDecideHtml', 'mergeLesionRevisions'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));

// SEED real, ids posicionais como no boot.
const seedLine = html.split('\n').find((l) => l.startsWith('const SEED = '));
const SEED_RAW = JSON.parse(seedLine.slice('const SEED = '.length).replace(/;\s*$/, ''));
SEED_RAW.forEach((e, i) => { e.id = 'seed_' + i; });

function ctxFixture(keepIds) {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW.filter((e) => keepIds.includes(e.id))));
  const mkrev = (id, lesionId, requestText) => ({ id, lesionId, status: 'manual_action_required',
    requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = {
    RP: mkrev('RP', 'seed_530', 'remover - duplicada, mesclar com dados do clone clone: Acretismo placentário (placenta acreta/increta/percreta)'),
    RC: mkrev('RC', 'seed_600', 'no caso o clone que deve ser mantido é este Carcinoma de colo do útero')
  };
  const calls = { saves: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS,
    REVIEW: {}, SRS: {}, APPROVED_CLINICAL_MERGES_091C: [], LESION_MERGES: {},
    saveLesionRevisions: async () => { calls.saves++; }, toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + names.map(fn).join('\n'), ctx, { filename: 'reopen-test.js' });
  return ctx;
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, resolutions });
const unres = (reviewId) => ({ reviewId, resolutionType: 'unresolved', reason: 'no_safe_candidate', reasoning: 'x' });
const planOf = (ctx, id) => ctx.LESION_REVISIONS[id].structuralPlan;
const inList = (ctx, listFn, id) => listFn.call(ctx).some((x) => x.id === id);

test('1+2+3+4. rejected -> novo imported: atual substitui, histórico preserva, UI libera', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  assert.equal((await ctx.importStructuralResolutionBatch(batch([unres('RC')]))).ok, true);
  assert.equal((await ctx.rejectStructuralPlan('RC')).ok, true);
  assert.equal(planOf(ctx, 'RC').status, 'rejected');
  ctx.LESION_REVISIONS['RC'].requestText = 'no caso o clone que deve ser mantido é este Carcinoma de colo do útero (revisado)';
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'nova', humanOverride: true }]));
  assert.equal(res.ok, true, 'nova importação válida reabre: ' + res.reason);
  assert.equal(planOf(ctx, 'RC').status, 'imported', 'estado atual = imported');
  assert.equal(planOf(ctx, 'RC').type, 'merge_duplicates');
  assert.equal(ctx.getEffectiveStructuralStatus(ctx.LESION_REVISIONS['RC']), 'imported');
  const acts = ctx.LESION_REVISIONS['RC'].history.map((h) => h.action);
  assert.ok(acts.includes('structural_plan_rejected'), 'rejeição antiga no histórico');
  assert.equal(acts.filter((a) => a === 'structural_plan_imported').length, 2, 'duas importações registradas');
  const decide = ctx.structuralPlanCardDecideHtml(ctx.LESION_REVISIONS['RC']);
  assert.match(decide, /Aceitar plano/, 'Aceitar visível no novo plano');
  assert.match(decide, /Rejeitar plano/);
  assert.equal(inList(ctx, ctx.getManualActionSolutions, 'RC'), true, 'permanece nas manuais');
});

test('5. executed não pode ser reaberto', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  ctx.LESION_REVISIONS['RC'].structuralPlan = { status: 'executed', importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
    batchKey: 'sb', batchImportedAt: 'x', resolutionHash: 'h',
    resolution: { reviewId: 'RC', valid: true, type: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  ctx.LESION_REVISIONS['RC'].structuralExecution = { executionId: 'exec_x', status: 'executed', at: 'y' };
  ctx.LESION_REVISIONS['RC'].status = 'accepted';
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: { name: 'Outro' }, reasoning: 'nova', humanOverride: true }]));
  assert.equal(res.ok, false, 'revisão resolvida barra na validação');
  assert.equal(res.reason, 'review_not_manual');
  assert.equal(planOf(ctx, 'RC').status, 'executed', 'executed intacto');
  // Borda manual+executed (sync divergente): guard terminal barra no loop.
  ctx.LESION_REVISIONS['RC'].status = 'manual_action_required';
  const res2 = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: { name: 'Outro' }, reasoning: 'nova', humanOverride: true }]));
  assert.equal(res2.ok, true);
  assert.equal(res2.imported.length, 0);
  assert.equal(res2.skipped[0].reason, 'terminal_state_preserved');
  assert.equal(planOf(ctx, 'RC').status, 'executed');
});

test('6. rolledback segue regra atual (terminal preservado em manual)', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  ctx.LESION_REVISIONS['RC'].structuralPlan = { status: 'rolledback', importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
    batchKey: 'sb', batchImportedAt: 'x', resolutionHash: 'h',
    resolution: { reviewId: 'RC', valid: true, type: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: { name: 'Outro' }, reasoning: 'nova', humanOverride: true }]));
  assert.equal(res.ok, true);
  assert.equal(res.imported.length, 0, 'nada sobrescrito');
  assert.equal(res.skipped[0].reason, 'terminal_state_preserved');
  assert.equal(planOf(ctx, 'RC').status, 'rolledback');
});

test('7+10. reload preserva novo plano; histórico mostra tentativa antiga', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  await ctx.importStructuralResolutionBatch(batch([unres('RC')]));
  await ctx.rejectStructuralPlan('RC');
  await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'nova', humanOverride: true }]));
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  assert.equal(restored['RC'].structuralPlan.status, 'imported', 'reload: atual é o novo plano');
  assert.ok(restored['RC'].history.some((h) => h.action === 'structural_plan_rejected'), 'reload: tentativa antiga no histórico');
});

test('8. sync não restaura rejected antigo', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  await ctx.importStructuralResolutionBatch(batch([unres('RC')]));
  await ctx.rejectStructuralPlan('RC');
  await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'nova', humanOverride: true }]));
  const local = plain(ctx.LESION_REVISIONS);
  const remote = plain(local);
  remote['RC'].structuralPlan.status = 'rejected';
  remote['RC'].structuralPlan.decidedAt = '2026-01-01T00:00:00.000Z';
  remote['RC'].updatedAt = 500;
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.equal(merged['RC'].structuralPlan.status, 'imported', 'novo plano (mais novo) vence');
});

test('9. batch counters usam estado atual', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  await ctx.importStructuralResolutionBatch(batch([unres('RC')]));
  await ctx.rejectStructuralPlan('RC');
  await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'nova', humanOverride: true }]));
  const groups = ctx.getStructuralPlanBatches();
  assert.equal(groups.length, 1);
  const c = ctx.structuralBatchCounts(groups[0]);
  assert.equal(c.rejected, 0, 'rejected antigo não conta');
  assert.equal(c.awaiting, 1, 'novo plano conta como aguardando');
});

test('PLACENTA lrev_muhqttye_tvd2bt: merge cross-section barrado pelo veto (plano antigo intacto)', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  assert.equal((await ctx.importStructuralResolutionBatch(batch([unres('RP')]))).ok, true);
  assert.equal((await ctx.rejectStructuralPlan('RP')).ok, true);
  const before = plain(planOf(ctx, 'RP'));
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RP', resolutionType: 'merge_duplicates', keeperId: 'seed_846', removeId: 'seed_530', merge: {}, reasoning: 'nova', humanOverride: true }]));
  assert.equal(res.ok, false, 'veto anatômico barra merge cross-section mesmo com override');
  assert.equal(res.reason, 'anatomic_conflict');
  assert.deepEqual(plain(planOf(ctx, 'RP')), before, 'plano antigo intacto (tudo-ou-nada)');
  assert.equal(planOf(ctx, 'RP').status, 'rejected');
});

test('CERVIX lrev_muhq25u5_ijyqgq: reopen completo com keeper seed_218', async () => {
  const ctx = ctxFixture(['seed_218', 'seed_600']);
  assert.equal((await ctx.importStructuralResolutionBatch(batch([unres('RC')]))).ok, true);
  assert.equal((await ctx.rejectStructuralPlan('RC')).ok, true);
  ctx.LESION_REVISIONS['RC'].requestText = 'no caso o clone que deve ser mantido é este Carcinoma de colo do útero';
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RC', resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'nova', humanOverride: true }]));
  assert.equal(res.ok, true, 'mesma seção/sítio, sem conflito: ' + res.reason);
  assert.equal(planOf(ctx, 'RC').status, 'imported');
  assert.equal(planOf(ctx, 'RC').resolution.keeperId, 'seed_218', 'keeper real');
  assert.equal(ctx.getEffectiveStructuralStatus(ctx.LESION_REVISIONS['RC']), 'imported');
  assert.match(ctx.structuralPlanCardDecideHtml(ctx.LESION_REVISIONS['RC']), /Aceitar plano/);
});
