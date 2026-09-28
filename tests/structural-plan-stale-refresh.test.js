'use strict';

// UX STALE: plano desatualizado exibia Aceitar aparentemente operacional
// (sem estilo disabled) e não havia como atualizar só aquela revisão.
// Correção: .btn:disabled visível + refreshStructuralPlan (revalida contra o
// DATA atual, reconstrói snapshot, volta a imported) por revisão — sem
// reimportar o lote, sem tocar executados/válidos.

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
  'structuralReviewRecord', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanKnownIds',
  'validateStructuralResolution',
  'structuralPlanLesion', 'structuralPlanResolveImage',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'structuralResolutionToRaw', 'refreshStructuralPlan', 'structuralResolutionHash',
  'getEffectiveStructuralStatus', 'getManualActionSolutions',
  'structuralPlanCardDecideHtml', 'structuralPlanCardButtonsHtml'];
const src = names.map(fn).join('\n');
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));

function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [], links: [],
    clinicalCases: [], radiologicSigns: [], classificationSchemes: [], _userUpdatedAt: 100 }, over || {});
}

function ctxFixture() {
  const DATA = [lesion('K1', { name: 'Keeper' }), lesion('D1', { name: 'Drop' }), lesion('L2', { name: 'Outra' })];
  const manual = (id, lesionId) => ({ id, lesionId, status: 'manual_action_required',
    requestText: 'x', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = { R1: manual('R1', 'D1'), R2: manual('R2', 'L2') };
  const calls = { saves: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS,
    saveLesionRevisions: async () => { calls.saves++; }, toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + src, ctx, { filename: 'stale-refresh-test.js' });
  return ctx;
}

function mergeRes(reviewId) {
  return { reviewId, valid: true, type: 'merge_duplicates', keeperId: 'K1', removeId: 'D1',
    keeperName: 'Keeper', removeName: 'Drop', merge: {}, reasoning: 'x' };
}
function importPlan(ctx, id) {
  const v = mergeRes(id);
  ctx.LESION_REVISIONS[id].structuralPlan = { status: 'imported', importedAt: '2026-09-27T00:00:00.000Z',
    type: 'merge_duplicates', resolution: v, snapshot: ctx.buildStructuralPlanSnapshot(v),
    batchKey: 'sb_t', batchImportedAt: '2026-09-27T00:00:00.000Z', resolutionHash: ctx.structuralResolutionHash
      ? ctx.structuralResolutionHash(v) : 'h' };
}
const planOf = (ctx, id) => ctx.LESION_REVISIONS[id].structuralPlan;

test('A. plano imported válido (fresco)', () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  assert.equal(ctx.isStructuralPlanStale(ctx.LESION_REVISIONS['R1']).stale, false);
});

test('B+C. keeper muda por outra fusão → stale lesions_changed', () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  ctx.DATA.find((e) => e.id === 'K1').name = 'Keeper renomeado por outra fusão';
  ctx.DATA.find((e) => e.id === 'K1').tags.push('nova-tag');
  const st = ctx.isStructuralPlanStale(ctx.LESION_REVISIONS['R1']);
  assert.equal(st.stale, true);
  assert.equal(st.reason, 'lesions_changed');
  assert.ok(st.changedIds.includes('K1'));
});

test('D+E. Aceitar desabilitado visualmente; Executar indisponível', () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  ctx.DATA.find((e) => e.id === 'K1').name = 'Keeper mudou';
  const decide = ctx.structuralPlanCardDecideHtml(ctx.LESION_REVISIONS['R1']);
  assert.match(decide, /Aceitar plano/);
  assert.match(decide, /disabled/, 'Aceitar visivelmente desabilitado');
  assert.match(decide, /Atualizar plano/, 'ação explícita de atualização');
  assert.equal(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['R1']), '', 'sem Executar em stale');
});

test('F+G. Atualizar gera plano fresco só dessa revisão, do keeper atual', async () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  importPlan(ctx, 'R2');
  ctx.DATA.find((e) => e.id === 'K1').name = 'Keeper atualizado';
  const before2 = JSON.stringify(planOf(ctx, 'R2'));
  const updatedBefore = ctx.LESION_REVISIONS['R1'].updatedAt;
  const res = await ctx.refreshStructuralPlan('R1');
  assert.equal(res.ok, true, 'refresh: ' + res.reason);
  const p = planOf(ctx, 'R1');
  assert.equal(p.status, 'imported', 'volta a imported (exige novo aceite)');
  assert.ok(p.snapshot, 'snapshot reconstruído');
  assert.equal(JSON.stringify(p.snapshot.lesions['K1']), JSON.stringify(ctx.DATA.find((e) => e.id === 'K1')), 'snapshot = keeper atual');
  assert.ok(ctx.LESION_REVISIONS['R1'].updatedAt >= updatedBefore);
  assert.ok(ctx.LESION_REVISIONS['R1'].history.some((h) => h.action === 'structural_plan_refreshed'));
  assert.equal(ctx.isStructuralPlanStale(ctx.LESION_REVISIONS['R1']).stale, false, 'fresco após refresh');
  assert.equal(p.batchKey, 'sb_t', 'lote preservado');
});

test('H. outros planos não são resetados', async () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  importPlan(ctx, 'R2');
  ctx.DATA.find((e) => e.id === 'K1').name = 'Keeper atualizado';
  const before2 = JSON.stringify(planOf(ctx, 'R2'));
  await ctx.refreshStructuralPlan('R1');
  assert.equal(JSON.stringify(planOf(ctx, 'R2')), before2, 'R2 byte-idêntico');
});

test('I. executados permanecem executed', async () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  const r = ctx.LESION_REVISIONS['R1'];
  r.structuralPlan.status = 'executed';
  r.structuralExecution = { executionId: 'exec_x', status: 'executed', at: 'x' };
  const res = await ctx.refreshStructuralPlan('R1');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'terminal_state_preserved');
  assert.equal(planOf(ctx, 'R1').status, 'executed');
});

test('stale em accepted volta a imported (novo aceite exigido)', async () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  planOf(ctx, 'R1').status = 'accepted';
  ctx.DATA.find((e) => e.id === 'K1').name = 'Keeper mudou de novo';
  const res = await ctx.refreshStructuralPlan('R1');
  assert.equal(res.ok, true);
  assert.equal(planOf(ctx, 'R1').status, 'imported', 'aceite anterior não é reaproveitado');
});

test('lesão sumida não ressuscita: refresh falha sem tocar nada', async () => {
  const ctx = ctxFixture();
  importPlan(ctx, 'R1');
  const before = JSON.stringify(planOf(ctx, 'R1'));
  ctx.DATA = ctx.DATA.filter((e) => e.id !== 'D1');
  const res = await ctx.refreshStructuralPlan('R1');
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(planOf(ctx, 'R1')), before, 'plano intacto');
  assert.ok(!ctx.DATA.some((e) => e.id === 'D1'), 'nada rematerializado');
});

test('wire: botão Atualizar no card e na prévia + CSS disabled', () => {
  const srcModal = fn('openReadySolutionsModal');
  assert.match(srcModal, /review-structural-refresh/);
  assert.match(srcModal, /refreshStructuralPlan\(r\.id\)/);
  const srcRow = fn('structuralPlanStatusRowHtml');
  assert.match(srcRow, /data-plan-act="refresh"/);
  assert.match(srcRow, /Atualizar plano/);
  assert.match(html, /\.btn:disabled\{[^}]*opacity/, 'desabilitado visível no CSS');
});
