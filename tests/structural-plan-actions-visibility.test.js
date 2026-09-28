'use strict';

// UX: planos imported mostravam badge 🟡 mas o card não tinha Aceitar/Rejeitar
// (só dentro da prévia) — beco sem saída para execução.
// Correção: structuralPlanCardDecideHtml no card (imported: Aceitar+Rejeitar;
// accepted: Rejeitar) com handlers que chamam accept/reject + re-render.
// Fixture real: lrev_muhnyxy4_fjea71, Cistadenoma seroso ovariano, seed_697,
// keeper seed_207.

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

const names = ['canonicalJsonString', 'stableImageKeyV208', 'pushLesionReviewHistory',
  'structuralPlanLesion', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'hasStrongAnatomicConflict', 'structuralSectionOf', 'structuralSiteOf', 'normalizeExternalTitle',
  'dryRunStructuralPlan', 'structuralClone',
  'acceptStructuralPlan', 'rejectStructuralPlan',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions',
  'structuralPlanCardDecideHtml', 'structuralPlanCardButtonsHtml', 'structuralPlanCardBadgeHtml'];
const src = names.map(fn).join('\n');

const RID = 'lrev_muhnyxy4_fjea71';
function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [], links: [],
    clinicalCases: [], radiologicSigns: [], classificationSchemes: [], _userUpdatedAt: 100 }, over || {});
}

function ctxFixture() {
  const DATA = [
    lesion('seed_207', { name: 'Cistoadenoma seroso' }),
    lesion('seed_697', { name: 'Cistadenoma seroso ovariano' }),
    lesion('seed_930', { name: 'Riedel', s: 'Cabeça e Pescoço', site: 'Tireoide', altPlacements: [{ s: 'Abdômen Superior', site: 'Rim' }] })
  ];
  const LESION_REVISIONS = {
    [RID]: { id: RID, lesionId: 'seed_697', status: 'manual_action_required',
      requestText: 'Seroso duplicado — fundir clone', manualAction: { type: 'duplicate_merge', description: 'x' },
      history: [], createdAt: 1000, updatedAt: 1000 }
  };
  const calls = { saves: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS,
    saveLesionRevisions: async () => { calls.saves++; }, toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(src, ctx, { filename: 'actions-visibility-test.js' });
  return ctx;
}

function serosoResolution() {
  return { reviewId: RID, valid: true, type: 'merge_duplicates',
    keeperId: 'seed_207', removeId: 'seed_697',
    keeperName: 'Cistoadenoma seroso', removeName: 'Cistadenoma seroso ovariano',
    merge: {}, reasoning: 'x' };
}
function importSeroso(ctx, status) {
  const r = ctx.LESION_REVISIONS[RID];
  const v = serosoResolution();
  r.structuralPlan = { status: status || 'imported', importedAt: '2026-09-27T00:00:00.000Z',
    type: 'merge_duplicates', resolution: v, snapshot: ctx.buildStructuralPlanSnapshot(v) };
}
const inList = (ctx, listFn, id) => listFn.call(ctx).some((x) => x.id === id);

test('SEROSO imported: Preview + Aceitar + Rejeitar visíveis, Executar oculto', () => {
  const ctx = ctxFixture();
  importSeroso(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'imported');
  const decide = ctx.structuralPlanCardDecideHtml(r);
  assert.match(decide, /Aceitar plano/);
  assert.match(decide, /Rejeitar plano/);
  assert.equal(ctx.structuralPlanCardButtonsHtml(r), '', 'imported nunca mostra Executar');
  assert.match(ctx.structuralPlanCardBadgeHtml(r), /Plano importado/);
});

test('SEROSO: aceitar pelo card funciona; Aceitar some, Executar aparece, sem auto-executar', async () => {
  const ctx = ctxFixture();
  importSeroso(ctx);
  const beforeKeeper = JSON.stringify(ctx.DATA.find((e) => e.id === 'seed_207'));
  const beforeData = JSON.stringify(ctx.DATA);
  const res = await ctx.acceptStructuralPlan(RID);
  assert.equal(res.ok, true, 'aceite: ' + res.reason);
  const r = ctx.LESION_REVISIONS[RID];
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'accepted');
  const decide = ctx.structuralPlanCardDecideHtml(r);
  assert.ok(!decide.includes('Aceitar plano'), 'Aceitar desaparece após aceite');
  assert.match(decide, /Rejeitar plano/);
  assert.match(ctx.structuralPlanCardButtonsHtml(r), /Executar/, 'Executar aparece após aceite');
  assert.equal(JSON.stringify(ctx.DATA), beforeData, 'nenhuma execução automática');
  assert.ok(ctx.DATA.some((e) => e.id === 'seed_697'), 'seed_697 permanece até execução');
  assert.equal(JSON.stringify(ctx.DATA.find((e) => e.id === 'seed_207')), beforeKeeper, 'seed_207 intacto antes da execução');
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), true, 'aceito continua nas manuais');
});

test('SEROSO executed: fora das manuais, no histórico', () => {
  const ctx = ctxFixture();
  importSeroso(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  r.structuralPlan.status = 'executed';
  r.structuralExecution = { executionId: 'exec_s', status: 'executed', at: 'x' };
  r.status = 'accepted';
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), false);
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true);
  assert.equal(ctx.structuralPlanCardDecideHtml(r), '', 'sem Aceitar/Rejeitar em executed');
});

test('SEROSO rolledback: volta ao fluxo (preview, sem decidir)', () => {
  const ctx = ctxFixture();
  importSeroso(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  r.structuralPlan.status = 'rolledback';
  r.structuralExecution = { executionId: 'exec_s', status: 'rolledback', at: 'x', rolledbackAt: 'y' };
  r.status = 'manual_action_required';
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'rolledback');
  assert.equal(ctx.structuralPlanCardDecideHtml(r), '', 'sem botões de decisão em rolledback');
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID), true, 'reaberto nas manuais');
  assert.equal(inList(ctx, ctx.getStructuralHistorySolutions, RID), true, 'visível no histórico');
});

test('todos os tipos imported exibem Aceitar (unresolved incluso, sem mudar regra)', () => {
  const ctx = ctxFixture();
  const mk = (id, type, extra) => {
    const v = Object.assign({ reviewId: id, valid: true, type }, extra || {});
    ctx.LESION_REVISIONS[id] = { id, lesionId: 'seed_697', status: 'manual_action_required',
      requestText: 'x', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1, updatedAt: 1,
      structuralPlan: { status: 'imported', importedAt: 'x', type, resolution: v, snapshot: { createdAt: 'x', lesions: {} } } };
  };
  mk('M1', 'merge_duplicates', { keeperId: 'seed_207', removeId: 'seed_697', merge: {}, reasoning: 'x' });
  mk('T1', 'transfer_images', { fromLesionId: 'seed_697', toLesionId: 'seed_207', imageIds: ['a'], reasoning: 'x' });
  mk('C1', 'add_clinical_cases', { lesionId: 'seed_697', clinicalCases: [{ title: 'c' }], reasoning: 'x' });
  mk('P1', 'remove_additional_section_placement', { lesionId: 'seed_930', placement: { section: 'Abdômen Superior', site: 'Rim' }, reasoning: 'x' });
  mk('U1', 'unresolved', { reason: 'sem candidato', reasoning: 'x' });
  for (const id of ['M1', 'T1', 'C1', 'P1', 'U1']) {
    const d = ctx.structuralPlanCardDecideHtml(ctx.LESION_REVISIONS[id]);
    assert.match(d, /Aceitar plano/, id + ' exibe Aceitar');
    assert.match(d, /Rejeitar plano/, id + ' exibe Rejeitar');
  }
  // accepted + unresolved: sem Executar, sem Aceitar, com Rejeitar.
  ctx.LESION_REVISIONS['U1'].structuralPlan.status = 'accepted';
  const du = ctx.structuralPlanCardDecideHtml(ctx.LESION_REVISIONS['U1']);
  assert.ok(!du.includes('Aceitar plano'));
  assert.match(du, /Rejeitar plano/);
  assert.equal(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['U1']), '');
});

test('card wire: Aceitar/Rejeitar chamam accept/reject + re-render', () => {
  const srcModal = fn('openReadySolutionsModal');
  assert.match(srcModal, /review-structural-preview/);
  assert.match(srcModal, /review-structural-accept/);
  assert.match(srcModal, /review-structural-reject/);
  assert.match(srcModal, /acceptStructuralPlan\(r\.id\)/);
  assert.match(srcModal, /rejectStructuralPlan\(r\.id\)/);
  assert.match(srcModal, /structuralPlanCardDecideHtml\(r\)/);
});
