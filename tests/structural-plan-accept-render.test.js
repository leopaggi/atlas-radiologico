'use strict';

// BUG REAL DE PRODUÇÃO (Fase 3): ao aceitar um plano estrutural, o caminho
// para Executar sumia — sem botão de prévia no card e sem re-render da lista
// ao fechar a prévia; além disso o aceite não carimbava updatedAt, permitindo
// ao merge 084 reverter accepted→imported num sync/reload.
// Este teste impede a regressão: accepted NUNCA sai das ações manuais.

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
  'pushLesionReviewHistory', 'genDidacticId',
  'structuralPlanLesion', 'structuralPlanResolveImage',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots',
  'executeStructuralPlan', 'structuralApplyAddCases',
  'rollbackStructuralExecution',
  'acceptStructuralPlan', 'rejectStructuralPlan',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'mergeOneLesionReviewPair', 'mergeLesionRevisions', 'resolveReviewManually',
  'structuralPlanLiveView', 'structuralDryRunSummaryHtml',
  'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml'
];
const src = names.map(fn).join('\n');
const execConsts = html.slice(
  html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '),
  html.indexOf('function structuralExecutionId(')
);
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";
const snapshotStoreConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));

function lesion(id, over) {
  return Object.assign({
    id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [],
    links: [], clinicalCases: [], radiologicSigns: [], classificationSchemes: [],
    _userUpdatedAt: 100
  }, over || {});
}

function ctxFixture() {
  const DATA = [
    lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)' }),
    lesion('seed_575', { name: 'Teratoma cístico maduro' })
  ];
  const LESION_REVISIONS = {
    RTER: {
      id: 'RTER', lesionId: 'seed_575', status: 'manual_action_required',
      requestText: 'Teratoma duplicado — fundir clone',
      manualAction: { type: 'duplicate_merge', description: 'Localizar clone' },
      history: [], createdAt: 1000, updatedAt: 1000
    }
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
    toast: () => {}, console
  });
  ctx.calls = calls;
  vm.runInContext(execConsts + '\n' + statusesConst + snapshotStoreConst + src, ctx, { filename: 'accept-render-test.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', ctx); // Fase 6: cobre o legado inline
  return ctx;
}

function importTeratoma(ctx) {
  const r = ctx.LESION_REVISIONS['RTER'];
  const resolution = {
    reviewId: 'RTER', valid: true, type: 'merge_duplicates',
    keeperId: 'seed_206', removeId: 'seed_575',
    keeperName: 'Teratoma maduro (cisto dermoide)', removeName: 'Teratoma cístico maduro',
    merge: {}, reasoning: 'teste'
  };
  r.structuralPlan = {
    status: 'imported', importedAt: '2026-09-27T00:00:00.000Z',
    type: 'merge_duplicates', resolution,
    snapshot: ctx.buildStructuralPlanSnapshot(resolution)
  };
}

test('aceitar: structuralPlan vai a accepted e review continua manual', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  const before = ctx.LESION_REVISIONS['RTER'].updatedAt;
  const res = await ctx.acceptStructuralPlan('RTER');
  assert.equal(res.ok, true);
  assert.equal(ctx.LESION_REVISIONS['RTER'].structuralPlan.status, 'accepted');
  assert.equal(ctx.LESION_REVISIONS['RTER'].status, 'manual_action_required', 'aceitar NÃO resolve a revisão');
  assert.ok(ctx.LESION_REVISIONS['RTER'].updatedAt >= before, 'aceite carimba updatedAt (merge 084 determinístico)');
});

test('aceito continua nas ações manuais (card NÃO some)', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  await ctx.acceptStructuralPlan('RTER');
  const list = ctx.getManualActionSolutions().map(r => r.id);
  assert.ok(list.includes('RTER'), 'accepted permanece em manual_action_required');
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS['RTER']), /Plano aprovado/);
  assert.match(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['RTER']), /Executar/);
});

test('prévia pode ser reaberta do estado vivo sem reimportar', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  await ctx.acceptStructuralPlan('RTER');
  const v = ctx.structuralPlanLiveView('RTER');
  assert.ok(v, 'live view existe para plano aceito');
  assert.equal(v.type, 'merge_duplicates');
  assert.equal(v.keeperId, 'seed_206');
  assert.equal(ctx.LESION_REVISIONS['RTER'].structuralPlan.status, 'accepted', 'reabrir não altera estado');
});

test('reload: plano aceito sobrevive a serialize/restore', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  await ctx.acceptStructuralPlan('RTER');
  // Simula reload: tudo passa por JSON (IndexedDB) e volta.
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  ctx.LESION_REVISIONS['RTER'] = undefined;
  delete ctx.LESION_REVISIONS['RTER'];
  Object.assign(ctx.LESION_REVISIONS, restored);
  const r = ctx.LESION_REVISIONS['RTER'];
  assert.equal(r.structuralPlan.status, 'accepted');
  assert.equal(r.status, 'manual_action_required');
  assert.ok(ctx.getManualActionSolutions().some(x => x.id === 'RTER'), 'card continua após reload');
  assert.match(ctx.structuralPlanCardButtonsHtml(r), /Executar/);
});

test('sync: cópia remota desatualizada NÃO reverte o aceite', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  await ctx.acceptStructuralPlan('RTER');
  const local = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  // Remoto parou no tempo: plano ainda imported, updatedAt antigo.
  const remote = JSON.parse(JSON.stringify(local));
  remote['RTER'].structuralPlan.status = 'imported';
  remote['RTER'].updatedAt = 1000;
  delete remote['RTER'].structuralPlan.decidedAt;
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.equal(merged['RTER'].structuralPlan.status, 'accepted', 'aceite local (mais novo) vence no merge 084');
  assert.ok(merged['RTER'].history.some(h => h.action === 'structural_plan_accepted'), 'histórico preservado');
});

test('accepted (plano) não entra em resolvidos; executed segue a regra', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  await ctx.acceptStructuralPlan('RTER');
  assert.notEqual(ctx.LESION_REVISIONS['RTER'].status, 'accepted', 'review.status accepted = resolvida; plano aceito NÃO pode usá-lo');
  // Ciclo completo de um plano add_clinical_cases: só APÓS execução a revisão resolve.
  const r2id = 'RCASE';
  ctx.LESION_REVISIONS[r2id] = {
    id: r2id, lesionId: 'seed_206', status: 'manual_action_required',
    requestText: 'adicionar caso', manualAction: { type: 'x', description: 'y' },
    history: [], createdAt: 1000, updatedAt: 1000
  };
  const resolution = {
    reviewId: r2id, valid: true, type: 'add_clinical_cases',
    lesionId: 'seed_206', lesionName: 'Teratoma maduro (cisto dermoide)',
    clinicalCases: [{ title: 'caso novo' }], reasoning: 't'
  };
  ctx.LESION_REVISIONS[r2id].structuralPlan = {
    status: 'accepted', importedAt: 'x', type: 'add_clinical_cases', resolution,
    snapshot: ctx.buildStructuralPlanSnapshot(resolution)
  };
  assert.ok(ctx.getManualActionSolutions().some(x => x.id === r2id), 'pré-execução ainda manual');
  const exec = await ctx.executeStructuralPlan(r2id);
  assert.equal(exec.ok, true);
  assert.equal(ctx.LESION_REVISIONS[r2id].status, 'accepted', 'APÓS execução a revisão resolve');
  assert.equal(ctx.getManualActionSolutions().some(x => x.id === r2id), false, 'resolvida sai das manuais (regra Fase 3)');
});

test('rejeitar carimba updatedAt e remove o Executar', async () => {
  const ctx = ctxFixture();
  importTeratoma(ctx);
  const before = ctx.LESION_REVISIONS['RTER'].updatedAt;
  const res = await ctx.rejectStructuralPlan('RTER');
  assert.equal(res.ok, true);
  assert.equal(ctx.LESION_REVISIONS['RTER'].structuralPlan.status, 'rejected');
  assert.ok(ctx.LESION_REVISIONS['RTER'].updatedAt >= before);
  assert.equal(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS['RTER']), '');
  assert.ok(ctx.getManualActionSolutions().some(x => x.id === 'RTER'), 'rejeitado continua manual (nada executado)');
});

test('card tem botão de prévia e modal re-renderiza ao fechar', () => {
  // Estático: o caminho de volta existe no HTML e o close() chama onDone.
  assert.match(html, /review-structural-preview/);
  assert.match(html, /openStructuralPlanPreviewModalForReview/);
  assert.match(html, /function openStructuralPlanPreviewModal\(validated,\s*onDone\)/);
  assert.match(html, /if\(typeof onDone==='function'\) onDone\(\)/);
  assert.doesNotMatch(html, /renderBothListsRef = null/);
});

test('overlay da prévia estrutural tem z-index acima do modal pai (sem alterar a classe global .overlay)', () => {
  // Bug real: "Soluções disponíveis" (.overlay, z-index 50) permanece aberto
  // atrás da prévia estrutural; a prévia também recebia z-index 50 da classe
  // global e ficava encoberta. Correção mínima: só este overlay recebe um
  // z-index maior via style inline — a classe .overlay global não muda.
  // fn() não serve aqui: o corpo contém replace(/"/g,...) cuja regex literal
  // (uma única aspa dupla) confunde o contador de chaves por quote. Como esta
  // função é a última antes de </script>, basta um corte direto entre marcos.
  const fnStart = html.indexOf('function openStructuralPlanPreviewModal(validated, onDone){');
  assert.ok(fnStart !== -1, 'openStructuralPlanPreviewModal existe');
  const overlayPreviewFn = html.slice(fnStart, html.indexOf('</script>', fnStart));
  const zIndexMatch = overlayPreviewFn.match(/ov\.style\.zIndex\s*=\s*['"](\d+)['"]/);
  assert.ok(zIndexMatch, 'openStructuralPlanPreviewModal define ov.style.zIndex');
  const previewZIndex = Number(zIndexMatch[1]);

  const overlayClassMatch = html.match(/\.overlay\{[^}]*z-index:\s*(\d+)/);
  assert.ok(overlayClassMatch, 'classe global .overlay define z-index base');
  const baseZIndex = Number(overlayClassMatch[1]);

  assert.ok(previewZIndex > baseZIndex, 'prévia estrutural fica visualmente por cima do modal pai');

  // A prévia não fecha nenhum outro overlay existente — ela só cria e anexa
  // o seu próprio, nunca busca/mexe em outros `.overlay` já abertos.
  assert.doesNotMatch(overlayPreviewFn, /document\.body\.querySelectorAll\(['"]\.overlay['"]\)/);

  // openStructuralPlanPreviewModalForReview não fecha nada antes de abrir a
  // prévia (preserva "Soluções disponíveis" por trás).
  const forReviewFn = fn('openStructuralPlanPreviewModalForReview');
  assert.doesNotMatch(forReviewFn, /close\(\)/, 'abrir a prévia a partir da revisão não fecha o modal pai');
});
