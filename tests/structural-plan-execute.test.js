'use strict';

// PONTE ESTRUTURAL — FASE 3: executor unitário controlado (UMA revisão por vez).
// dry-run puro + stale check + snapshot + apply atômico + rollback.
// Nenhum teste aqui toca Cloudinary, rede ou lote: tudo em memória via vm.

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
  'normalizeExternalTitle', 'tokenizeExternalTitle',
  'structuralSectionOf', 'structuralSiteOf', 'hasStrongAnatomicConflict',
  'canonicalJsonString', 'stableImageKeyV208', 'imageIdentityKeys',
  'pushLesionReviewHistory', 'lesionMergeLinkKey',
  'mergeClinicalCasesForFold', 'mergeDidacticItems', 'genDidacticId',
  'mergeReviewProgress', 'mergeReviewOverrides',
  'structuralPlanLesion', 'structuralPlanResolveImage',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots',
  'executeStructuralPlan',
  'structuralApplyMerge', 'structuralApplyRemovePlacement',
  'structuralApplyTransferImages', 'structuralApplyAddCases',
  'rollbackStructuralExecution',
  'structuralDryRunSummaryHtml', 'getEffectiveStructuralStatus', 'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml',
  'resolveReviewManually',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership',
  'clinicalCaseIdentityKey'
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
const IMG = (assetId) => ({ assetId, data: 'https://res.cloudinary.com/x/' + assetId + '.jpg', source: 'cloudinary', label: 'img ' + assetId, lesionId: 'seed_698', lesionName: 'clone' });

function ctxFixture() {
  const DATA = [
    lesion('seed_208', { name: 'Cistoadenoma mucinoso', classification: 'O-RADS', tags: ['mucinoso'], images: [IMG('A208')] }),
    lesion('seed_698', { name: 'Cistadenoma mucinoso ovariano', classification: 'O-RADS', images: [IMG('A698')], clinicalCases: [{ id: 'c1', title: 'caso 1' }] }),
    lesion('seed_207', { name: 'Cistoadenoma seroso', images: [IMG('A207')] }),
    lesion('seed_156', { name: 'Cistoadenoma seroso', s: 'Abdômen Superior', site: 'Pâncreas', enTerm: 'serous cystadenoma pancreas', classification: 'LIRADS' })
  ];
  const manual = (id, lesionId, extra) => Object.assign({
    id, lesionId, status: 'manual_action_required', requestText: 'duplicada — fundir clone',
    manualAction: { type: 'duplicate_merge', description: 'Localizar clone' },
    history: [], createdAt: 1, updatedAt: 2
  }, extra || {});
  const mergeResolution = {
    reviewId: 'R208', valid: true, type: 'merge_duplicates',
    keeperId: 'seed_208', removeId: 'seed_698',
    keeperName: 'Cistoadenoma mucinoso', removeName: 'Cistadenoma mucinoso ovariano',
    merge: {}, reasoning: 'teste'
  };
  const LESION_REVISIONS = { R208: manual('R208', 'seed_698') };
  const calls = { saves: 0, badges: 0 };
  const ctx = vm.createContext({
    DATA, LESION_REVISIONS,
    REVIEW: {}, REVIEW_STAMPS: {}, REVIEW_PROGRESS: {}, REVIEW_OVERRIDE: {},
    SRS: {}, LESION_MERGES: {}, PENDING_LOCAL_IMAGE_ADDS: {},
    saveData: async () => { calls.saves++; },
    saveLesionRevisions: async () => { calls.saves++; },
    registerImageOwnershipConflict: (c) => ({ id: 'conflict_test', conflict: c || null }),
    saveLesionMerges: async () => { calls.saves++; },
    saveReview: async () => { calls.saves++; },
    saveSRS: async () => { calls.saves++; },
    saveReviewStamps: async () => { calls.saves++; },
    saveReviewProgressState: async () => { calls.saves++; },
    savePendingLocalImageAdds: async () => { calls.saves++; },
    updateReviewCenterBadges: () => { calls.badges++; },
    markSyncDirty: async () => { calls.saves++; },
    pushToFirebaseNow: async () => {},
    toast: () => {}, document: undefined, console
  });
  ctx.calls = calls;
  ctx.mergeResolution = mergeResolution;
  vm.runInContext(execConsts + '\n' + ownershipConst + statusesConst + src, ctx, { filename: 'fase3-test.js' });
  return ctx;
}

function acceptPlan(ctx, reviewId, resolution) {
  const r = ctx.LESION_REVISIONS[reviewId];
  const res = resolution || ctx.mergeResolution;
  r.structuralPlan = {
    status: 'accepted', importedAt: '2026-09-27T00:00:00.000Z',
    type: res.type, resolution: res,
    snapshot: ctx.buildStructuralPlanSnapshot(res)
  };
}

test('Fase 3: dry-run é puro e descreve a fusão', () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  const before = JSON.stringify(ctx.DATA);
  const dry = ctx.dryRunStructuralPlan('R208');
  assert.equal(dry.ok, true);
  assert.equal(dry.executes, true);
  assert.equal(JSON.stringify(dry.affectedLesionIds), JSON.stringify(['seed_208', 'seed_698']));
  assert.equal(dry.imagesToTransfer.length, 1);
  assert.equal(dry.casesToTransfer, 1);
  assert.ok(dry.tombstonePreview);
  assert.equal(dry.tombstonePreview.removeId, 'seed_698');
  assert.equal(JSON.stringify(ctx.DATA), before, 'dry-run não pode tocar DATA');
  assert.equal(ctx.calls.saves, 0, 'dry-run não pode persistir');
});

test('Fase 3: execute funde, registra execução e resolve a revisão', async () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  const res = await ctx.executeStructuralPlan('R208');
  assert.equal(res.ok, true);
  assert.match(res.executionId, /^exec_/);
  const keeper = ctx.DATA.find(e => e.id === 'seed_208');
  assert.ok(keeper, 'keeper preservado');
  assert.equal(ctx.DATA.some(e => e.id === 'seed_698'), false, 'remove sai do catálogo');
  assert.equal(keeper.images.length, 2, 'imagens somadas sem duplicar');
  assert.equal(keeper.clinicalCases.length, 1, 'caso clínico transferido');
  assert.deepEqual(ctx.LESION_MERGES['seed_698'].into, 'seed_208');
  const r = ctx.LESION_REVISIONS['R208'];
  assert.equal(r.structuralPlan.status, 'executed');
  assert.equal(r.structuralExecution.status, 'executed');
  assert.equal(r.structuralExecution.executionId, res.executionId);
  assert.ok(r.structuralExecution.beforeSnapshot, 'snapshot guardado para rollback');
  assert.equal(r.status, 'accepted', 'revisão resolvida após sucesso');
  assert.ok(r.history.some(h => h.action === 'structural_plan_executed'));
});

test('Fase 3: stale nunca executa', async () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  ctx.DATA.find(e => e.id === 'seed_698').name = 'Nome alterado por outro PC';
  const res = await ctx.executeStructuralPlan('R208');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'stale_plan');
  assert.equal(ctx.LESION_REVISIONS['R208'].structuralPlan.status, 'accepted', 'status intacto');
  assert.equal(ctx.DATA.some(e => e.id === 'seed_698'), true, 'nada removido');
});

test('Fase 3: unresolved nunca executa', async () => {
  const ctx = ctxFixture();
  const r = ctx.LESION_REVISIONS['R208'];
  const resolution = { reviewId: 'R208', valid: true, type: 'unresolved', reason: 'sem candidato seguro', reasoning: 'x' };
  r.structuralPlan = { status: 'accepted', importedAt: 'x', type: 'unresolved', resolution, snapshot: { createdAt: 'x', lesions: {} } };
  const res = await ctx.executeStructuralPlan('R208');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'nothing_to_execute');
});

test('Fase 3: segunda execução é bloqueada (sem duplo apply)', async () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  const first = await ctx.executeStructuralPlan('R208');
  assert.equal(first.ok, true);
  const second = await ctx.executeStructuralPlan('R208');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'plan_not_accepted');
  assert.equal(ctx.DATA.filter(e => e.id === 'seed_208').length, 1);
});

test('Fase 3: execução concorrente retorna already_running', async () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  // const/let do vm não vazam para o objeto do contexto: trava por dentro do realm.
  vm.runInContext("STRUCTURAL_EXEC_IN_FLIGHT['R208'] = true;", ctx);
  const res = await ctx.executeStructuralPlan('R208');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'already_running');
  vm.runInContext('delete STRUCTURAL_EXEC_IN_FLIGHT["R208"];', ctx);
});

test('Fase 3: rollback restaura DATA e reabre a revisão', async () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  const before = JSON.stringify(ctx.DATA.map(e => ({ id: e.id, name: e.name, images: e.images.length, clinicalCases: e.clinicalCases.length })));
  const exec = await ctx.executeStructuralPlan('R208');
  assert.equal(exec.ok, true);
  const rb = await ctx.rollbackStructuralExecution('R208');
  assert.equal(rb.ok, true);
  assert.equal(rb.executionId, exec.executionId);
  const after = JSON.stringify(ctx.DATA.map(e => ({ id: e.id, name: e.name, images: e.images.length, clinicalCases: e.clinicalCases.length })));
  assert.equal(after, before, 'rollback restaura lesões, imagens e casos');
  const r = ctx.LESION_REVISIONS['R208'];
  assert.equal(r.structuralExecution.status, 'rolledback');
  assert.equal(r.structuralPlan.status, 'rolledback');
  assert.equal(r.status, 'manual_action_required', 'revisão reaberta');
  assert.ok(r.history.some(h => h.action === 'structural_plan_rolled_back'), 'rollback registrado; execução preservada no histórico');
});

test('Fase 3: rollback sem execução é bloqueado', async () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  const rb = await ctx.rollbackStructuralExecution('R208');
  assert.equal(rb.ok, false);
  assert.equal(rb.reason, 'no_executed_plan');
});

test('Fase 3: conflito anatômico (seed_156 x ovário) bloqueia no dry-run', () => {
  const ctx = ctxFixture();
  const resolution = {
    reviewId: 'R208', valid: true, type: 'merge_duplicates',
    keeperId: 'seed_156', removeId: 'seed_208',
    keeperName: 'x', removeName: 'y', merge: {}, reasoning: 't'
  };
  const r = ctx.LESION_REVISIONS['R208'];
  r.structuralPlan = { status: 'accepted', importedAt: 'x', type: 'merge_duplicates', resolution, snapshot: ctx.buildStructuralPlanSnapshot(resolution) };
  const dry = ctx.dryRunStructuralPlan('R208');
  assert.equal(dry.ok, false);
  assert.equal(dry.reason, 'dry_conflicts');
  assert.ok(dry.conflicts.some(c => c.kind === 'anatomic_conflict'));
});

test('Fase 3: falha de ownership restaura o snapshot (sem estado parcial)', async () => {
  const ctx = ctxFixture();
  const resolution = {
    reviewId: 'RIMG', valid: true, type: 'transfer_images',
    fromLesionId: 'seed_698', toLesionId: 'seed_208',
    fromLesionName: 'c', toLesionName: 'k', imageIds: ['A698'], reasoning: 't'
  };
  ctx.LESION_REVISIONS['RIMG'] = {
    id: 'RIMG', lesionId: 'seed_698', status: 'manual_action_required',
    requestText: 'transferir', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1, updatedAt: 2,
    structuralPlan: { status: 'accepted', importedAt: 'x', type: 'transfer_images', resolution, snapshot: ctx.buildStructuralPlanSnapshot(resolution) }
  };
  ctx.assertManualImageOwnershipChange = () => ({ ok: false, reason: 'ownership_protegido' });
  const before = JSON.stringify(ctx.DATA);
  const res = await ctx.executeStructuralPlan('RIMG');
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(ctx.DATA), before, 'snapshot restaurado após falha');
  assert.equal(ctx.LESION_REVISIONS['RIMG'].structuralPlan.status, 'accepted', 'não marca executed na falha');
});

test('Fase 3: UI do card/badge só oferece executar para accepted fresco', () => {
  const ctx = ctxFixture();
  acceptPlan(ctx, 'R208');
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS['R208']), /Plano aprovado/);
  assert.match(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['R208']), /Executar/);
  // imported: sem executar
  ctx.LESION_REVISIONS['R208'].structuralPlan.status = 'imported';
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS['R208']), /Plano importado/);
  assert.equal(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['R208']), '');
  // rejected: sem executar
  ctx.LESION_REVISIONS['R208'].structuralPlan.status = 'rejected';
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS['R208']), /rejeitado/);
  assert.equal(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['R208']), '');
  // stale: sem executar + aviso
  ctx.LESION_REVISIONS['R208'].structuralPlan.status = 'accepted';
  ctx.DATA.find(e => e.id === 'seed_208').notes = 'mudou';
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS['R208']), /desatualizado/);
  assert.equal(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['R208']), '');
  // executed: só reverter
  ctx.LESION_REVISIONS['R208'].structuralPlan.status = 'executed';
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS['R208']), /Executado/);
  assert.match(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['R208']), /Reverter/);
});

test('Fase 3: sem Cloudinary delete e sem execução em lote no código', () => {
  const rawFns = ['executeStructuralPlan', 'rollbackStructuralExecution', 'structuralApplyMerge',
    'structuralApplyRemovePlacement', 'structuralApplyTransferImages', 'structuralApplyAddCases',
    'structuralRestoreSnapshots'].map(fn).join('\n');
  // Comentários de segurança citam Cloudinary ("nunca toca"); o que vale é o
  // código executável: remove comentários antes de procurar chamadas remotas.
  const fns = rawFns.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1').toLowerCase();
  assert.ok(!/cloudinary/.test(fns), 'executor/rollback nunca tocam Cloudinary');
  assert.ok(!/deleteimage|destroy\(|api\.cloudinary/.test(fns), 'sem delete remoto');
  assert.ok(!/function\s+executeStructuralPlans|executeAll|forEach\s*\(\s*\w+\s*=>\s*execute/.test(html), 'nenhuma execução em lote');
  assert.ok(html.includes('STRUCTURAL_EXEC_IN_FLIGHT'), 'trava de concorrência presente');
});
