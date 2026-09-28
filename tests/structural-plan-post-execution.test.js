'use strict';

// BUG REAL PÓS-EXECUÇÃO: após executed, a prévia mostrava
// "executed · ⚠ PLANO DESATUALIZADO (lesions_changed)" + Aceitar/Rejeitar.
// Causa: stale pré-execução (snapshot pré-merge vs DATA) aplicado a um plano
// executed — mas keeper/remove mudarem É o efeito esperado do merge.
// Correção: executed usa isStructuralExecutionStale (current vs
// afterSnapshot) e a prévia segue a máquina de estados (só Reverter).

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

const names = [
  'normalizeExternalTitle', 'canonicalJsonString',
  'structuralSectionOf', 'structuralSiteOf',
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'isCrossSectionOverrideValid', 'findExplicitCloneMatches',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'lesionMergeLinkKey', 'mergeClinicalCasesForFold', 'mergeDidacticItems',
  'mergeReviewProgress', 'mergeReviewOverrides', 'clinicalCaseIdentityKey',
  'structuralPlanLesion', 'structuralPlanResolveImage',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale', 'isStructuralExecutionStale',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots', 'executeStructuralPlan',
  'structuralApplyMerge', 'structuralPlanPreviewHtml', 'structuralPlanLiveView',
  'structuralPlanStatusRowHtml', 'structuralDryRunSummaryHtml',
  'getEffectiveStructuralStatus', 'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml',
  'resolveReviewManually', 'mergeLesionRevisions',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership'
];
const src = names.map(fn).join('\n');
const execConsts = html.slice(
  html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '),
  html.indexOf('function structuralExecutionId(')
);
const ownershipConst = "const IMAGE_OWNERSHIP_MANUAL = { manual:true };\n";
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";

function lesion(id, over) {
  return Object.assign({
    id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [],
    links: [], clinicalCases: [], radiologicSigns: [], classificationSchemes: [],
    _userUpdatedAt: 100
  }, over || {});
}
const IMG = (assetId, lesionId, lesionName) => ({ assetId, data: 'https://res.cloudinary.com/x/' + assetId + '.jpg', source: 'cloudinary', label: 'img', lesionId, lesionName });

// Teratoma real: keeper seed_206, remove seed_575.
function ctxFixture() {
  const DATA = [
    lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)', images: [IMG('A206', 'seed_206', 'Teratoma maduro (cisto dermoide)')] }),
    lesion('seed_575', { name: 'Teratoma cístico maduro', images: [IMG('A575', 'seed_575', 'Teratoma cístico maduro')] })
  ];
  const LESION_REVISIONS = {
    RTER: { id: 'RTER', lesionId: 'seed_575', status: 'manual_action_required',
      requestText: 'Teratoma duplicado — fundir clone',
      manualAction: { type: 'duplicate_merge', description: 'Localizar clone' },
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
  vm.runInContext(execConsts + '\n' + ownershipConst + statusesConst + src, ctx, { filename: 'postexec-test.js' });
  return ctx;
}

async function executeTeratoma(ctx) {
  const r = ctx.LESION_REVISIONS['RTER'];
  const resolution = { reviewId: 'RTER', valid: true, type: 'merge_duplicates',
    keeperId: 'seed_206', removeId: 'seed_575',
    keeperName: 'Teratoma maduro (cisto dermoide)', removeName: 'Teratoma cístico maduro',
    merge: {}, reasoning: 'teste' };
  r.structuralPlan = { status: 'accepted', importedAt: '2026-09-27T00:00:00.000Z',
    type: 'merge_duplicates', resolution, snapshot: ctx.buildStructuralPlanSnapshot(resolution) };
  const res = await ctx.executeStructuralPlan('RTER');
  assert.equal(res.ok, true, 'execução do Teratoma deve funcionar: ' + res.reason);
  return res;
}

const ids = (ctx) => ctx.DATA.map(e => e.id).sort();

test('1+2. executa seed_575 → seed_206 e status = executed', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  assert.equal(ctx.LESION_REVISIONS['RTER'].structuralPlan.status, 'executed');
  assert.equal(ctx.LESION_REVISIONS['RTER'].structuralExecution.status, 'executed');
});

test('3+4. DATA com keeper, sem remove; tombstone referencia remove', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  assert.ok(ids(ctx).includes('seed_206'), 'keeper ativo');
  assert.ok(!ids(ctx).includes('seed_575'), 'remove fora do DATA ativo');
  assert.equal(ctx.LESION_MERGES['seed_575'].into, 'seed_206', 'mapa anti-ressurreição');
  assert.equal(ctx.LESION_REVISIONS['RTER'].structuralExecution.tombstone.removeId, 'seed_575');
});

test('5+6. beforeSnapshot e afterSnapshot preservados', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const ex = ctx.LESION_REVISIONS['RTER'].structuralExecution;
  assert.ok(ex.beforeSnapshot && ex.beforeSnapshot.lesions['seed_206'] && ex.beforeSnapshot.lesions['seed_575'], 'before tem keeper+remove');
  assert.ok(ex.afterSnapshot && ex.afterSnapshot.lesions['seed_206'], 'after tem keeper');
  assert.ok(!ex.afterSnapshot.lesions['seed_575'], 'after NÃO tem remove (sumiu no merge — esperado)');
});

test('7. stale pré-exec NÃO vira stale pós-exec', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const r = ctx.LESION_REVISIONS['RTER'];
  const pre = ctx.isStructuralPlanStale(r);
  assert.equal(pre.stale, true, 'pré-snapshot diverge (efeito do próprio merge)');
  assert.equal(JSON.stringify(pre.changedIds.sort()), JSON.stringify(['seed_206', 'seed_575']));
  const post = ctx.isStructuralExecutionStale(r);
  assert.equal(post.stale, false, 'pós-execução compara com afterSnapshot: nada mudou depois');
  assert.equal(post.postExecution, true);
  const row = ctx.structuralPlanStatusRowHtml('RTER');
  assert.doesNotMatch(row, /DESATUALIZADO/, 'prévia de executed sem aviso stale');
  assert.doesNotMatch(row, /reimporte antes de aprovar/);
});

test('8+9+10. executed não mostra Aceitar/Rejeitar/Executar', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const row = ctx.structuralPlanStatusRowHtml('RTER');
  assert.doesNotMatch(row, /Aceitar plano/);
  assert.doesNotMatch(row, /Rejeitar plano/);
  assert.doesNotMatch(row, /data-plan-act="execute"/);
  assert.doesNotMatch(row, /Executar esta ação/);
});

test('11. executed mostra Reverter (+ card ✅/↩️)', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const row = ctx.structuralPlanStatusRowHtml('RTER');
  assert.match(row, /data-plan-act="rollback"/);
  assert.match(row, /Reverter execução/);
  assert.match(row, /Executado/);
  const r = ctx.LESION_REVISIONS['RTER'];
  assert.match(ctx.structuralPlanCardBadgeHtml(r), /Executado/);
  assert.match(ctx.structuralPlanCardButtonsHtml(r), /Reverter/);
  assert.equal(ctx.structuralPlanCardButtonsHtml(r).includes('Executar</button>'), false);
});

test('12. reload mantém executed', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const restored = JSON.parse(JSON.stringify({ revs: ctx.LESION_REVISIONS, data: ctx.DATA, merges: ctx.LESION_MERGES }));
  assert.equal(restored.revs['RTER'].structuralPlan.status, 'executed');
  assert.ok(restored.data.some(e => e.id === 'seed_206'));
  assert.ok(!restored.data.some(e => e.id === 'seed_575'));
});

test('13. sync mantém executed (decisão mais nova vence)', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const local = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  // Remoto parou no accepted (decidedAt antigo), com updatedAt MAIOR (edição concorrente).
  const remote = JSON.parse(JSON.stringify(local));
  remote['RTER'].structuralPlan.status = 'accepted';
  remote['RTER'].structuralPlan.decidedAt = '2026-09-27T00:00:00.000Z';
  delete remote['RTER'].structuralExecution;
  remote['RTER'].updatedAt = Date.now() + 100000;
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.equal(merged['RTER'].structuralPlan.status, 'executed', 'executed vence no merge');
  assert.equal(merged['RTER'].structuralExecution.status, 'executed', 'metadados de execução preservados');
});

test('14. render não ressuscita seed_575', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  const r = ctx.LESION_REVISIONS['RTER'];
  ctx.structuralPlanCardBadgeHtml(r);
  ctx.structuralPlanCardButtonsHtml(r);
  ctx.structuralPlanPreviewHtml(r.structuralPlan.resolution);
  ctx.structuralPlanLiveView('RTER');
  ctx.structuralPlanStatusRowHtml('RTER');
  ctx.structuralDryRunSummaryHtml({ ok: false, reason: 'x', conflicts: [], warnings: [] });
  assert.deepEqual(ids(ctx), ['seed_206'], 'nenhum render rematerializa o removeId');
});

test('15. alteração externa APÓS execução é detectada (current vs after)', async () => {
  const ctx = ctxFixture();
  await executeTeratoma(ctx);
  ctx.DATA.find(e => e.id === 'seed_206').notes = 'editado por outro PC após execução';
  const post = ctx.isStructuralExecutionStale(ctx.LESION_REVISIONS['RTER']);
  assert.equal(post.stale, true);
  assert.equal(post.reason, 'changed_after_execution');
  assert.equal(JSON.stringify(post.changedIds), JSON.stringify(['seed_206']));
  const row = ctx.structuralPlanStatusRowHtml('RTER');
  assert.match(row, /Alterado após a execução/, 'aviso pós-execução (sem "reimporte antes de aprovar")');
  assert.match(row, /data-plan-act="rollback"/, 'reversão continua disponível');
});
