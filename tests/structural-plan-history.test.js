'use strict';

// UX PÓS-EXECUÇÃO: executed/resolved saía das pendências e sumia da interface
// (sem acesso a ✅/executionId/detalhes/rollback).
// Correção: aba "🧾 Histórico estrutural" lista executed/rolledback com card,
// detalhes e rollback — sem devolver pendência. Sem tocar executor/merge/sync.

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

const names = ['canonicalJsonString', 'pushLesionReviewHistory',
  'structuralPlanLesion', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'structuralSnapshotLesions', 'structuralSnapshotMaps', 'structuralRestoreSnapshots',
  'rollbackStructuralExecution', 'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions',
  'structuralHistoryCardHtml', 'structuralExecutionDetailsHtml', 'mergeLesionRevisions'];
const src = names.map(fn).join('\n');
const execConsts = html.slice(
  html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '),
  html.indexOf('function structuralExecutionId(')
);
const snapshotStoreConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));

function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [], links: [],
    clinicalCases: [], radiologicSigns: [], classificationSchemes: [], _userUpdatedAt: 100 }, over || {});
}

// Teratoma já executado (estado persistido real, sem reimportar/reexecutar).
const RID = 'lrev_muhmzdmv_6rak3k';
function ctxFixture() {
  const DATA = [
    lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)',
      images: [{ assetId: 'A206', data: 'https://res.cloudinary.com/x/A206.jpg', source: 'cloudinary', lesionId: 'seed_206', lesionName: 'Teratoma maduro (cisto dermoide)' }] })
  ];
  const LESION_REVISIONS = {};
  const calls = { saves: 0 };
  const ctx = vm.createContext({
    DATA, LESION_REVISIONS,
    REVIEW: {}, REVIEW_STAMPS: {}, REVIEW_PROGRESS: {}, REVIEW_OVERRIDE: {},
    SRS: {}, LESION_MERGES: { seed_575: { into: 'seed_206', at: 5, group: 'structural:' + RID, finalName: 'Teratoma maduro (cisto dermoide)' } },
    PENDING_LOCAL_IMAGE_ADDS: {},
    saveData: async () => { calls.saves++; },
    saveLesionRevisions: async () => { calls.saves++; },
    saveLesionMerges: async () => { calls.saves++; },
    toast: () => {}, console
  });
  ctx.calls = calls;
  vm.runInContext(execConsts + '\n' + snapshotStoreConst + src, ctx, { filename: 'history-test.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', ctx); // Fase 6: cobre o legado inline
  return ctx;
}

function executedReview(ctx, id, status) {
  ctx.LESION_REVISIONS[id || RID] = {
    id: id || RID, lesionId: 'seed_206', status: status || 'accepted',
    requestText: 'Teratoma', manualAction: { type: 'duplicate_merge', description: 'x' },
    createdAt: 1000, updatedAt: 3000, completedAt: 3000, resolvedManually: true, history: [],
    structuralPlan: { status: 'executed', importedAt: '2026-09-27T00:00:00.000Z', decidedAt: '2026-09-27T00:02:00.000Z',
      type: 'merge_duplicates',
      resolution: { reviewId: id || RID, valid: true, type: 'merge_duplicates',
        keeperId: 'seed_206', removeId: 'seed_575',
        keeperName: 'Teratoma maduro (cisto dermoide)', removeName: 'Teratoma cístico maduro',
        merge: {}, reasoning: 'x' },
      snapshot: { createdAt: 'x', lesions: {} } },
    structuralExecution: { executionId: 'exec_t1', status: 'executed', type: 'merge_duplicates', at: '2026-09-27T00:03:00.000Z',
      affectedIds: ['seed_206', 'seed_575'], operations: ['transfer_data_to_keeper'],
      tombstone: { removeId: 'seed_575', keeperId: 'seed_206', previousName: 'Teratoma cístico maduro', timestamp: '2026-09-27T00:03:00.000Z', reviewId: id || RID },
      beforeSnapshot: { lesions: { seed_206: { index: 0, lesion: lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)' }) },
          seed_575: { index: 1, lesion: lesion('seed_575', { name: 'Teratoma cístico maduro' }) } },
        maps: { review: {}, reviewStamps: {}, reviewProgress: {}, reviewOverride: {}, srs: {}, merges: {}, pendingAdds: {} },
        reviewLesionIds: [{ reviewId: id || RID, lesionId: 'seed_575' }] },
      afterSnapshot: { lesions: { seed_206: { index: 0, lesion: lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)' }) } } },
      executorVersion: 'fase3-v1' }
  };
}
function manualReview(ctx, id, extra) {
  ctx.LESION_REVISIONS[id] = Object.assign({ id, lesionId: 'seed_206', status: 'manual_action_required',
    requestText: 'pendência', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1, updatedAt: 1 }, extra || {});
}
const inList = (ctx, listFn, id) => listFn.call(ctx).some((r) => r.id === id);

test('1. executed não aparece em Ações manuais', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), false);
});

test('2. executed aparece em Histórico estrutural', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
});

test('3. botão Reverter aparece no card', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  const card = ctx.structuralHistoryCardHtml(ctx.LESION_REVISIONS[RID]);
  assert.match(card, /Executado/);
  assert.match(card, /exec_t1/);
  assert.match(card, /seed_206/);
  assert.match(card, /seed_575/);
  assert.match(card, /Reverter execução/);
  assert.match(card, /Ver detalhes/);
});

test('4. reload mantém item no histórico', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  delete ctx.LESION_REVISIONS[RID];
  Object.assign(ctx.LESION_REVISIONS, restored);
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), false);
});

test('5. sync mantém item no histórico', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  const local = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  const remote = JSON.parse(JSON.stringify(local));
  remote[RID].structuralPlan.status = 'accepted';
  remote[RID].structuralPlan.decidedAt = '2026-09-27T00:01:00.000Z';
  delete remote[RID].structuralExecution;
  remote[RID].updatedAt = Date.now() + 100000;
  const merged = ctx.mergeLesionRevisions(local, remote);
  ctx.LESION_REVISIONS[RID] = merged[RID];
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
});

test('6. Teratoma fixture aparece sem reimportar', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  const card = ctx.structuralHistoryCardHtml(ctx.LESION_REVISIONS[RID]);
  assert.match(card, /Teratoma maduro/);
  const det = ctx.structuralExecutionDetailsHtml(RID);
  assert.match(det, new RegExp(RID));
  assert.match(det, /exec_t1/);
  assert.match(det, /seed_206/);
  assert.match(det, /seed_575/);
});

test('7+8. rollback muda para rolledback e continua no histórico', async () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  const rb = await ctx.rollbackStructuralExecution(RID);
  assert.equal(rb.ok, true);
  assert.equal(ctx.LESION_REVISIONS[RID].structuralPlan.status, 'rolledback');
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
  const card = ctx.structuralHistoryCardHtml(ctx.LESION_REVISIONS[RID]);
  assert.match(card, /Revertid/);
  assert.equal(card.includes('review-history-rollback'), false, 'sem segundo rollback');
  assert.equal(ctx.LESION_REVISIONS[RID].status, 'manual_action_required', 'revisão reaberta nas pendências');
});

test('9+10+11. pendências só nas manuais; importado/aceito/não-resolvido fora do histórico', () => {
  const ctx = ctxFixture();
  manualReview(ctx, 'R1');
  manualReview(ctx, 'R2', { structuralPlan: { status: 'imported', type: 'merge_duplicates', resolution: {}, snapshot: {} } });
  manualReview(ctx, 'R3', { structuralPlan: { status: 'accepted', type: 'merge_duplicates', resolution: {}, snapshot: {} } });
  manualReview(ctx, 'R4', { structuralPlan: { status: 'imported', type: 'unresolved', resolution: {}, snapshot: {} } });
  for (const id of ['R1', 'R2', 'R3', 'R4']) {
    assert.equal(inList(ctx, ctx.getManualActionSolutions, id), true, id + ' nas manuais');
    assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, id), false, id + ' fora do histórico');
  }
  assert.equal(ctx.structuralHistoryCardHtml(ctx.LESION_REVISIONS['R1']), '');
});

test('12+13. histórico não ressuscita removeId nem altera catálogo', () => {
  const ctx = ctxFixture();
  executedReview(ctx);
  const beforeData = JSON.stringify(ctx.DATA.map((e) => e.id));
  const beforeFull = JSON.stringify(ctx.DATA);
  ctx.structuralHistoryCardHtml(ctx.LESION_REVISIONS[RID]);
  ctx.structuralExecutionDetailsHtml(RID);
  assert.equal(JSON.stringify(ctx.DATA.map((e) => e.id)), beforeData);
  assert.equal(JSON.stringify(ctx.DATA), beforeFull, 'render é só leitura');
});

test('aba existe no Soluções disponíveis com render dedicado', () => {
  const src = fn('openReadySolutionsModal');
  assert.match(src, /tab-btn-history/);
  assert.match(src, /Histórico estrutural/);
  assert.match(src, /history-list/);
  assert.match(src, /renderHistoryList/);
  assert.match(src, /getStructuralHistorySolutions/);
  assert.match(src, /structuralHistoryCardHtml/);
  assert.match(src, /openStructuralExecutionDetailsModal/);
});
