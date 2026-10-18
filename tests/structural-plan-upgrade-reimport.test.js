'use strict';

// UPGRADE IDEMPOTENTE: mesmo JSON reimportado NÃO pode ser pulado quando o
// plano atual é rejected/unresolved/ausente e o interpretador agora suporta a
// ponte estrutural. O skip same-content só vale com plano equivalente válido
// (imported/accepted). Terminais (executed/rolledback) nunca reinterpretados.
// Sem duplicar attempts, sem apagar histórico, sem autoaceite/autoexecução.

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
  'structuralReviewRecord', 'findExplicitCloneMatches', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'persistValidatedStructuralPlan', 'importStructuralResolutionBatch',
  'structuralBatchKey', 'structuralResolutionHash',
  'reviewAcceptsAiProposal', 'flagManualActionRequired', 'reviewAiManualActionReason',
  'validateReviewAiPlacement', 'reviewAiKnownSections',
  'bridgeManualActionToStructuralPlan', 'importReviewAiSolution', 'rejectStructuralPlan',
  'reviewRequestFlaggedMissingDifferentials', 'reviewAiAddressedDifferentialsGap',
  'reviewDifferentialsSection', 'hasStructuredDifferentials', 'hasLegacyGenericDifferentials', 'reviewAiDifferentialsGate',
  'getEffectiveStructuralStatus', 'getManualActionSolutions',
  'structuralPlanCardDecideHtml', 'structuralPlanPreviewHtml', 'structuralPlanStatusRowHtml',
  'mergeOneLesionReviewPair', 'mergeLesionRevisions'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const bridgeTypes = html.slice(html.indexOf('const STRUCTURAL_BRIDGE_ACTION_TYPES = '), html.indexOf('function bridgeManualActionToStructuralPlan('));
const manualRe = html.slice(html.indexOf('const REVIEW_AI_MANUAL_ACTION_RE = '), html.indexOf('function reviewAiManualActionReason('));
const diffGapRe = html.slice(html.indexOf('const TRIAGE_DIFFERENTIALS_GAP_MARKER_RE = '), html.indexOf('function reviewAiAddressedDifferentialsGap('));

// [FIXTURE PIN] Lesoes historicas exercitadas por este teste foram consolidadas/
// renumeradas na nuvem (duplicatas mescladas). Fixamos o conteudo original aqui
// para validar o MECANISMO de merge de forma deterministica, sem depender do SEED vivo.
const SEED_RAW = [
  {
    "name": "Cistoadenoma seroso",
    "links": [
      {
        "label": "Radiopaedia \u2014 buscar casos",
        "url": "https://radiopaedia.org/search?lang=us&q=serous%20cystadenoma%20pancreas"
      }
    ],
    "notes": "Aspecto em 'favo de mel' com cicatriz central estrelada calcificada.",
    "_userUpdatedAt": 1789591708231,
    "tags": [
      "multisseptado",
      "cicatriz central",
      "calcifica\u00e7\u00f5es"
    ],
    "inc": 3,
    "localImg": false,
    "images": [],
    "img": "",
    "id": "seed_156",
    "s": "Abd\u00f4men Superior",
    "site": "P\u00e2ncreas",
    "enTerm": "serous cystadenoma pancreas"
  },
  {
    "tags": [
      "c\u00edstico",
      "parede fina",
      "aus\u00eancia de realce"
    ],
    "name": "Cistoadenoma seroso",
    "images": [],
    "classification": "ORADS",
    "id": "seed_207",
    "_userUpdatedAt": 1789591708231,
    "localImg": false,
    "img": "",
    "inc": 2,
    "links": [
      {
        "label": "Radiopaedia \u2014 buscar casos",
        "url": "https://radiopaedia.org/search?lang=us&q=serous%20cystadenoma%20pancreas"
      }
    ],
    "enTerm": "serous cystadenoma pancreas",
    "site": "Ov\u00e1rio",
    "notes": "Uni/multilocular, paredes finas, conte\u00fado simples.",
    "s": "Pelve Feminina"
  },
  {
    "enTerm": "cervical cancer MRI",
    "name": "Carcinoma de colo do \u00fatero",
    "tags": [
      "restri\u00e7\u00e3o \u00e0 difus\u00e3o",
      "realce heterog\u00eaneo",
      "margens irregulares"
    ],
    "links": [
      {
        "label": "Radiopaedia \u2014 buscar casos",
        "url": "https://radiopaedia.org/search?lang=us&q=cervical%20cancer%20MRI"
      }
    ],
    "img": "",
    "notes": "Massa cervical com invas\u00e3o estromal; avaliar extens\u00e3o parametrial, essencial para o estadiamento.",
    "inc": 2,
    "_userUpdatedAt": 1789591708231,
    "id": "seed_218",
    "images": [],
    "localImg": false,
    "site": "Colo uterino",
    "s": "Pelve Feminina"
  },
  {
    "notes": "Padr\u00e3o: perda do hilo gorduroso, necrose central c\u00edstica, formato arredondado; o prim\u00e1rio mais comum \u00e9 carcinoma espinocelular de cabe\u00e7a e pesco\u00e7o.\nDiferenciais-chave: Met\u00e1stase cervical de s\u00edtio prim\u00e1rio desconhecido, Linfoma cervical e Tuberculose ganglionar cervical (escrofulose). Favorecem este diagn\u00f3stico, quando presentes no contexto adequado, necr\u00f3tico, c\u00edstico e margens irregulares. A distin\u00e7\u00e3o deve integrar origem anat\u00f4mica, composi\u00e7\u00e3o, padr\u00e3o de sinal/densidade, realce e contexto cl\u00ednico.",
    "site": "Linfonodos cervicais",
    "links": [
      {
        "url": "https://radiopaedia.org/search?lang=us&q=metastatic%20cervical%20lymph%20node%20squamous%20cell%20carcinoma",
        "label": "Radiopaedia \u2014 buscar casos"
      }
    ],
    "id": "seed_444",
    "s": "Cabe\u00e7a e Pesco\u00e7o",
    "classification": "NODERADS",
    "_userUpdatedAt": 1789591708231,
    "images": [],
    "localImg": false,
    "name": "Linfonodo metast\u00e1tico cervical (carcinoma espinocelular)",
    "inc": 2,
    "enTerm": "metastatic cervical lymph node squamous cell carcinoma",
    "tags": [
      "margens irregulares",
      "necr\u00f3tico",
      "c\u00edstico"
    ],
    "img": ""
  },
  {
    "img": "",
    "localImg": false,
    "inc": 3,
    "tags": [
      "hipervascular",
      "margens irregulares",
      "idade pedi\u00e1trica"
    ],
    "enTerm": "Placenta acreta spectrum",
    "id": "seed_530",
    "name": "Placenta acreta spectrum",
    "s": "Pelve Feminina",
    "site": "\u00datero",
    "_userUpdatedAt": 1789591708231,
    "notes": "Padr\u00e3o: perda da interface miometrial, lacunas vasculares e vasos de ponte; aplica-se \u00e0 gesta\u00e7\u00e3o e pode exigir RM complementar.\nDiferenciais-chave: Mola hidatiforme, Endometriose profunda infiltrativa e Leiomiossarcoma uterino. Favorecem este diagn\u00f3stico, quando presentes no contexto adequado, margens irregulares e hipervascular. A distin\u00e7\u00e3o deve integrar origem anat\u00f4mica, composi\u00e7\u00e3o, padr\u00e3o de sinal/densidade, realce e contexto cl\u00ednico.",
    "images": [],
    "links": [
      {
        "label": "Radiopaedia \u2014 buscar casos",
        "url": "https://radiopaedia.org/search?lang=us&q=Placenta%20acreta%20spectrum"
      }
    ]
  },
  {
    "s": "Pelve Feminina",
    "site": "Colo uterino",
    "img": "",
    "localImg": false,
    "enTerm": "cervical squamous cell carcinoma",
    "id": "seed_600",
    "inc": 1,
    "_userUpdatedAt": 1789591708231,
    "name": "Carcinoma espinocelular do colo uterino",
    "tags": [
      "infiltrativa",
      "restri\u00e7\u00e3o \u00e0 difus\u00e3o",
      "realce heterog\u00eaneo"
    ],
    "links": [
      {
        "url": "https://radiopaedia.org/search?lang=us&q=cervical%20squamous%20cell%20carcinoma",
        "label": "Radiopaedia \u2014 buscar casos"
      }
    ],
    "images": [],
    "notes": "Padr\u00e3o: massa cervical com restri\u00e7\u00e3o; RM avalia param\u00e9trios, vagina, parede p\u00e9lvica e \u00f3rg\u00e3os adjacentes.\nDiferenciais-chave: Carcinoma de colo do \u00fatero, Adenocarcinoma cervical e P\u00f3lipo endocervical. Favorecem este diagn\u00f3stico, quando presentes no contexto adequado, restri\u00e7\u00e3o \u00e0 difus\u00e3o, realce heterog\u00eaneo e infiltrativa. A distin\u00e7\u00e3o deve integrar origem anat\u00f4mica, composi\u00e7\u00e3o, padr\u00e3o de sinal/densidade, realce e contexto cl\u00ednico."
  },
  {
    "inc": 3,
    "enTerm": "placenta accreta spectrum",
    "img": "",
    "classification": null,
    "_userUpdatedAt": 1789487830593,
    "site": "Placenta e anexos ovulares",
    "localImg": false,
    "tags": [
      "margens irregulares",
      "engloba vasos"
    ],
    "links": [
      {
        "url": "https://radiopaedia.org/search?lang=us&q=placenta%20accreta%20spectrum",
        "label": "Radiopaedia \u2014 buscar casos"
      }
    ],
    "name": "Acretismo placent\u00e1rio (placenta acreta/increta/percreta)",
    "images": [],
    "id": "seed_846",
    "notes": "Padr\u00e3o: perda do plano hipoecog\u00eanico retroplacent\u00e1rio normal com lacunas vasculares intraplacent\u00e1rias ('queijo su\u00ed\u00e7o'); risco de hemorragia maci\u00e7a no parto.\nDiferenciais-chave: Inser\u00e7\u00e3o velamentosa do cord\u00e3o umbilical, Vasa pr\u00e9via e Trombose do seio marginal placent\u00e1rio. Favorecem este diagn\u00f3stico, quando presentes no contexto adequado, margens irregulares e engloba vasos. A distin\u00e7\u00e3o deve integrar origem anat\u00f4mica, composi\u00e7\u00e3o, padr\u00e3o de sinal/densidade, realce e contexto cl\u00ednico.",
    "s": "Obstetr\u00edcia"
  }
];

const RID_CERVIX = 'lrev_muhq25u5_ijyqgq';
const RID_PLACENTA = 'lrev_muhqttye_tvd2bt';

function ctxFixture() {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW));
  const mkrev = (id, lesionId, requestText) => ({ id, lesionId, status: 'manual_action_required',
    requestText, manualAction: { type: 'merge_duplicates', description: 'ponte' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = {
    [RID_CERVIX]: mkrev(RID_CERVIX, 'seed_600', 'no caso o clone que deve ser mantido é este Carcinoma de colo do útero'),
    [RID_PLACENTA]: mkrev(RID_PLACENTA, 'seed_530', 'remover - duplicada, mesclar com dados do clone (caso sejam relevantes e nao repetidos) clone: Acretismo placentário (placenta acreta/increta/percreta)')
  };
  const calls = { saves: 0, badges: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS, REVIEW: {}, SRS: {},
    APPROVED_CLINICAL_MERGES_091C: [], LESION_MERGES: {},
    saveLesionRevisions: async () => { calls.saves++; },
    updateReviewCenterBadges: () => { calls.badges++; },
    toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + bridgeTypes + '\n' + manualRe + '\n' + diffGapRe + '\n' + names.map(fn).join('\n'), ctx, { filename: 'upgrade-test.js' });
  return ctx;
}
const gpt = (reviewId, description) => JSON.stringify({ reviewId, result: 'manual_action_required',
  summary: 'Análise da IA', reasoning: 'Justificativa da IA',
  manualAction: { type: 'merge_duplicates', description }, proposedChanges: {} });
const planOf = (ctx, id) => ctx.LESION_REVISIONS[id].structuralPlan;
const inList = (ctx, listFn, id) => listFn.call(ctx).some((x) => x.id === id);

test('CERVIX: mesmo JSON após rejected constrói plano (upgrade, não skip)', async () => {
  const ctx = ctxFixture();
  const j = gpt(RID_CERVIX, 'fundir clone do colo');
  assert.ok(ctx.importReviewAiSolution(RID_CERVIX, j).structuralPlan, 'primeiro import constrói');
  assert.equal((await ctx.rejectStructuralPlan(RID_CERVIX)).ok, true, 'rejeita');
  assert.equal(planOf(ctx, RID_CERVIX).status, 'rejected');
  const histBefore = ctx.LESION_REVISIONS[RID_CERVIX].history.length;
  const res = ctx.importReviewAiSolution(RID_CERVIX, j);
  assert.equal(res.ok, true, 'reimport: ' + res.reason);
  assert.ok(res.structuralPlan, 'upgrade construiu plano (não skip)');
  assert.equal(res.structuralPlan.keeperId, 'seed_218');
  assert.equal(res.structuralPlan.removeId, 'seed_600');
  assert.equal(planOf(ctx, RID_CERVIX).status, 'imported');
  assert.equal(planOf(ctx, RID_CERVIX).resolution.keeperId, 'seed_218');
  assert.equal(ctx.getEffectiveStructuralStatus(ctx.LESION_REVISIONS[RID_CERVIX]), 'imported');
  assert.match(ctx.structuralPlanStatusRowHtml(RID_CERVIX), /Aceitar plano/);
  assert.ok(!ctx.structuralPlanStatusRowHtml(RID_CERVIX).includes('Plano rejeitado'));
  const acts = ctx.LESION_REVISIONS[RID_CERVIX].history.map((h) => h.action);
  assert.ok(acts.includes('structural_plan_upgraded_from_prior_resolution'), 'upgrade auditável');
  assert.ok(acts.includes('structural_plan_rejected'), 'rejeição antiga preservada');
  assert.ok(ctx.LESION_REVISIONS[RID_CERVIX].history.length >= histBefore, 'sem apagar histórico');
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID_CERVIX), true);
});

test('PLACENTA: mesmo JSON após rejected constrói com override restrito', () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_PLACENTA].structuralPlan = { status: 'rejected', importedAt: '2026-09-20T00:00:00.000Z',
    decidedAt: '2026-09-20T00:01:00.000Z', type: 'unresolved',
    resolution: { reviewId: RID_PLACENTA, valid: true, type: 'unresolved', reason: 'no_safe_candidate', reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  const res = ctx.importReviewAiSolution(RID_PLACENTA, gpt(RID_PLACENTA, 'fundir clone placenta'));
  assert.equal(res.ok, true, 'import: ' + res.reason);
  assert.ok(res.structuralPlan, 'upgrade construiu plano');
  assert.equal(res.structuralPlan.crossSectionOverride, true);
  assert.equal(planOf(ctx, RID_PLACENTA).resolution.keeperId, 'seed_846');
  assert.equal(planOf(ctx, RID_PLACENTA).resolution.removeId, 'seed_530');
  assert.match(ctx.structuralPlanPreviewHtml(planOf(ctx, RID_PLACENTA).resolution), /cross-section aprovada manualmente/);
  assert.match(ctx.structuralPlanStatusRowHtml(RID_PLACENTA), /Aceitar plano/);
});

test('TERCEIRO import idêntico: agora sim no-op (plano equivalente existe)', () => {
  const ctx = ctxFixture();
  const j = gpt(RID_CERVIX, 'fundir clone do colo');
  const r1 = ctx.importReviewAiSolution(RID_CERVIX, j);
  assert.ok(r1.structuralPlan, 'primeiro import constrói (sem plano anterior)');
  const histLen = ctx.LESION_REVISIONS[RID_CERVIX].history.length;
  const r2 = ctx.importReviewAiSolution(RID_CERVIX, j);
  assert.equal(r2.ok, true);
  assert.equal(r2.structuralPlan, null, 'segundo é no-op');
  assert.equal(r2.bridgeReason, 'already_imported');
  assert.equal(ctx.LESION_REVISIONS[RID_CERVIX].history.filter((h) => h.action === 'structural_plan_upgraded_from_prior_resolution').length, 0, 'sem upgrade quando já existe equivalente');
  assert.ok(ctx.LESION_REVISIONS[RID_CERVIX].history.length >= histLen, 'só texto novo, sem plano duplicado');
});

test('TERMINAIS: executed/rolledback nunca reinterpretados', () => {
  const ctx = ctxFixture();
  for (const st of ['executed', 'rolledback']) {
    ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan = { status: st, importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
      batchKey: 'sb', batchImportedAt: 'x', resolutionHash: 'h',
      resolution: { reviewId: RID_CERVIX, valid: true, type: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'x' },
      snapshot: { createdAt: 'x', lesions: {} } };
    ctx.LESION_REVISIONS[RID_CERVIX].structuralExecution = { executionId: 'exec_x', status: st === 'executed' ? 'executed' : 'rolledback', at: 'y' };
    const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'x'));
    assert.equal(res.ok, true);
    assert.equal(res.structuralPlan, null, st + ' intacto');
    assert.equal(res.bridgeReason, 'terminal_state_preserved');
    assert.equal(planOf(ctx, RID_CERVIX).status, st);
  }
});

test('HISTORY: sem duplicar attempts, sem apagar; reload/sync preservam upgrade', () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan = { status: 'rejected', importedAt: 'x', decidedAt: 'x', type: 'unresolved',
    resolution: { reviewId: RID_CERVIX, valid: true, type: 'unresolved', reason: 'no_safe_candidate', reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  ctx.LESION_REVISIONS[RID_CERVIX].attempts = [{ id: 'att1', outcome: 'manual_action_required' }];
  ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'x'));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.LESION_REVISIONS[RID_CERVIX].attempts)), [{ id: 'att1', outcome: 'manual_action_required' }], 'attempts intactos');
  const restored = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  assert.equal(restored[RID_CERVIX].structuralPlan.status, 'imported', 'reload preserva upgrade');
  const local = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  const remote = JSON.parse(JSON.stringify(local));
  remote[RID_CERVIX].structuralPlan.status = 'rejected';
  remote[RID_CERVIX].updatedAt = 500;
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.equal(merged[RID_CERVIX].structuralPlan.status, 'imported', 'sync preserva upgrade');
});
