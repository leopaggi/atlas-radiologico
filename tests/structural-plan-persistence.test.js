'use strict';

// BUG REAL: no_imported_plan no accept.
// Causa: import gravava r.structuralPlan SEM carimbar updatedAt; o merge 084
// (winner = updatedAt maior, empate = JSON canônico) elegia a cópia remota
// pré-import e SUBSTITUÍA o objeto vivo — a prévia (cópia em memória)
// continuava exibindo, mas o accept não achava o plano.
// Correção: import carimba updatedAt + merge preserva structuralPlan/
// structuralExecution pelo carimbo próprio da decisão (precedente 091d).
// Fixture real do caso: lrev_muhmzdmv_6rak3k, seed_206 keeper, seed_575 remove.

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
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash', 'acceptStructuralPlan', 'rejectStructuralPlan',
  'structuralPlanPreviewHtml', 'structuralExecutionId', 'structuralClone',
  'dryRunStructuralPlan', 'structuralPlanLiveView',
  'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'mergeLesionRevisions'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));

function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '', classification: null, tags: [], enTerm: '',
    images: [], altPlacements: [], links: [], clinicalCases: [], radiologicSigns: [], classificationSchemes: [], _userUpdatedAt: 100 }, over || {});
}

function ctxFixture() {
  const DATA = [
    lesion('seed_206', { name: 'Teratoma maduro (cisto dermoide)', images: [{ assetId: 'A206', data: 'https://res.cloudinary.com/x/A206.jpg', source: 'cloudinary', label: 'TC', lesionId: 'seed_206', lesionName: 'Teratoma maduro (cisto dermoide)' }] }),
    lesion('seed_575', { name: 'Teratoma cístico maduro' })
  ];
  const LESION_REVISIONS = {
    lrev_muhmzdmv_6rak3k: {
      id: 'lrev_muhmzdmv_6rak3k', lesionId: 'seed_575', status: 'manual_action_required',
      requestText: 'Teratoma duplicado — fundir clone Teratoma maduro (cisto dermoide)',
      manualAction: { type: 'duplicate_merge', description: 'Localizar clone Teratoma maduro (cisto dermoide)' },
      history: [], createdAt: 1000, updatedAt: 1000
    }
  };
  const calls = { saves: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS, REVIEW: {}, SRS: {},
    APPROVED_CLINICAL_MERGES_091C: [], LESION_MERGES: {},
    saveLesionRevisions: async () => { calls.saves++; },
    toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + names.map(fn).join('\n'), ctx, { filename: 'persistence-test.js' });
  return ctx;
}

const plain = o => JSON.parse(JSON.stringify(o));
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, generatedAt: '2026-09-27T00:00:00.000Z', resolutions });
const teratomaMerge = (over) => Object.assign({ reviewId: 'lrev_muhmzdmv_6rak3k', resolutionType: 'merge_duplicates',
  keeperId: 'seed_206', removeId: 'seed_575',
  merge: { name: 'Teratoma maduro (cisto dermoide)', transferImages: true }, reasoning: 'Análise da IA' }, over || {});
const RID = 'lrev_muhmzdmv_6rak3k';

async function importTeratoma(ctx) {
  const res = await ctx.importStructuralResolutionBatch(batch([teratomaMerge()]));
  assert.equal(res.ok, true, 'fixture Teratoma deve importar: ' + res.reason);
  return res;
}

test('1. batch válido importa', async () => {
  const ctx = ctxFixture();
  const res = await importTeratoma(ctx);
  assert.equal(JSON.stringify(res.imported), JSON.stringify([RID]));
});

test('2. review.structuralPlan existe após import', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  assert.ok(r.structuralPlan, 'plano associado à revisão viva');
  assert.ok(r.structuralPlan.resolution, 'resolution persistida');
  assert.ok(r.structuralPlan.snapshot, 'snapshot persistido');
  assert.equal(r.structuralPlan.type, 'merge_duplicates');
});

test('3. status = imported + updatedAt carimbado', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  const r = ctx.LESION_REVISIONS[RID];
  assert.equal(r.structuralPlan.status, 'imported');
  assert.ok(r.updatedAt > 1000, 'import carimba updatedAt (merge 084 determinístico)');
  assert.ok(r.structuralPlan.importedAt);
});

test('4. fechar preview não apaga plano (estado vive na revisão)', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  // Fechar modal = apenas descartar a cópia de visualização; nada toca a revisão.
  assert.equal(ctx.LESION_REVISIONS[RID].structuralPlan.status, 'imported');
});

test('5. rerender não apaga plano (badge lê estado vivo)', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  for (let i = 0; i < 3; i++) ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS[RID]);
  assert.equal(ctx.LESION_REVISIONS[RID].structuralPlan.status, 'imported');
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS[RID]), /Plano importado/);
});

test('6. JSON roundtrip mantém plano (IndexedDB)', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  assert.equal(restored[RID].structuralPlan.status, 'imported');
  assert.equal(restored[RID].structuralPlan.resolution.keeperId, 'seed_206');
});

test('7. reload simulado mantém plano e card', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  const snapshotDisk = JSON.stringify(ctx.LESION_REVISIONS);
  const fresh = { DATA: ctx.DATA, LESION_REVISIONS: JSON.parse(snapshotDisk) };
  assert.equal(fresh.LESION_REVISIONS[RID].structuralPlan.status, 'imported');
});

test('8. accept encontra structuralPlan (adeus no_imported_plan)', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  const res = await ctx.acceptStructuralPlan(RID);
  assert.equal(res.ok, true, 'accept deve achar o plano: ' + res.reason);
});

test('9. accept muda para accepted', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  await ctx.acceptStructuralPlan(RID);
  const r = ctx.LESION_REVISIONS[RID];
  assert.equal(r.structuralPlan.status, 'accepted');
  assert.equal(r.status, 'manual_action_required');
  assert.ok(ctx.getManualActionSolutions().some(x => x.id === RID));
});

test('10. reload mantém accepted', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  await ctx.acceptStructuralPlan(RID);
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  assert.equal(restored[RID].structuralPlan.status, 'accepted');
  assert.equal(restored[RID].status, 'manual_action_required');
});

test('11. botão preview aparece em imported', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS[RID]), /Plano importado/);
  const v = ctx.structuralPlanLiveView(RID);
  assert.ok(v, 'prévia reabre do estado vivo');
  assert.equal(v.keeperId, 'seed_206');
});

test('12. botão executar aparece em accepted', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  await ctx.acceptStructuralPlan(RID);
  assert.match(ctx.structuralPlanCardBadgeHtml(ctx.LESION_REVISIONS[RID]), /Plano aprovado/);
  assert.match(ctx.structuralPlanCardButtonsHtml(ctx.LESION_REVISIONS[RID]), /Executar/);
});

test('13. sync com cópia remota velha não apaga plano (empate updatedAt)', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  const local = plain(ctx.LESION_REVISIONS);
  // Remoto pré-import: sem plano, MESMO updatedAt de antes do import.
  const remote = plain(local);
  remote[RID].updatedAt = 1000;
  delete remote[RID].structuralPlan;
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.ok(merged[RID].structuralPlan, 'plano sobrevive ao empate no merge 084');
  assert.equal(merged[RID].structuralPlan.status, 'imported');
});

test('14. import tudo-ou-nada continua funcionando', async () => {
  const ctx = ctxFixture();
  const res = await ctx.importStructuralResolutionBatch(batch([teratomaMerge(), teratomaMerge({ reviewId: 'NOPE' })]));
  assert.equal(res.ok, false);
  assert.equal(ctx.LESION_REVISIONS[RID].structuralPlan, undefined, 'nada foi importado');
});

test('15. erro no meio do batch não persiste parcial', async () => {
  const ctx = ctxFixture();
  const before = plain(ctx.LESION_REVISIONS);
  const res = await ctx.importStructuralResolutionBatch(batch([teratomaMerge({ keeperId: 'seed_206', removeId: 'seed_206' })]));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'keeper_equals_remove');
  assert.deepEqual(plain(ctx.LESION_REVISIONS), before);
});

test('16. plano não fica só em variável local do modal', () => {
  // Estático: import grava r.structuralPlan + persiste; accept lê o vivo.
  const importSrc = fn('importStructuralResolutionBatch');
  assert.match(importSrc, /r\.structuralPlan = \{/);
  assert.match(importSrc, /await saveLesionRevisions\(\)/);
  assert.match(importSrc, /r\.updatedAt = /);
  const acceptSrc = fn('acceptStructuralPlan');
  assert.match(acceptSrc, /LESION_REVISIONS\[reviewId\]/);
  assert.match(acceptSrc, /missing_structural_plan_for_review/);
});

test('17. decisão de plano vence edição concorrente no merge (carimbo próprio)', async () => {
  const ctx = ctxFixture();
  await importTeratoma(ctx);
  await ctx.acceptStructuralPlan(RID);
  const local = plain(ctx.LESION_REVISIONS);
  // Outro PC editou requestText DEPOIS (updatedAt maior) mas não conhece o plano.
  const remote = plain(local);
  remote[RID].updatedAt = Date.now() + 100000;
  remote[RID].requestText = 'texto editado no outro PC';
  delete remote[RID].structuralPlan;
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.equal(merged[RID].structuralPlan.status, 'accepted', 'plano aceito sobrevive a edição concorrente');
  assert.equal(merged[RID].requestText, 'texto editado no outro PC', 'edição concorrente também preservada');
});
