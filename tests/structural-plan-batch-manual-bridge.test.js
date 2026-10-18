'use strict';

// BUG REAL EM PRODUÇÃO: o card continuava mostrando "🔴 Plano rejeitado
// (unresolved)" mesmo depois de editar o pedido, gerar nova resolução e
// reimportar — porque o caminho REAL que a UI usa para colar o JSON
// {"results":[...]} é `importReviewAiBatch` → `processReviewAiBatchItem`
// (botão "Processar lote", em "🤖 Analisar pendências com IA"), e essa função
// NUNCA chamava a ponte Ponte 1→2 (`bridgeManualActionToStructuralPlan`).
// Todos os testes anteriores da ponte (`structural-ponte1-bridge`,
// `structural-plan-upgrade-reimport`) só exercitavam `importReviewAiSolution`
// (o fluxo de UMA revisão por vez, "🤖 Preparar para IA" → "Colar solução da
// IA"), que sempre chamou a ponte corretamente — por isso passavam mesmo com
// o bug real presente. Este teste reproduz o caminho de LOTE de ponta a
// ponta com o JSON exato relatado pelo usuário.

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
  'mergeOneLesionReviewPair', 'mergeLesionRevisions',
  // Caminho REAL do lote (o que estava faltando a ponte):
  'normalizeReviewAiBatchJson', 'parseReviewAiBatchJson', 'processReviewAiBatchItem', 'importReviewAiBatch'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const bridgeTypes = html.slice(html.indexOf('const STRUCTURAL_BRIDGE_ACTION_TYPES = '), html.indexOf('function bridgeManualActionToStructuralPlan('));
const manualRe = html.slice(html.indexOf('const REVIEW_AI_MANUAL_ACTION_RE = '), html.indexOf('function reviewAiManualActionReason('));
const diffGapRe = html.slice(html.indexOf('const TRIAGE_DIFFERENTIALS_GAP_MARKER_RE = '), html.indexOf('function reviewAiAddressedDifferentialsGap('));
const batchResultsLine = html.split('\n').find((l) => l.trim().startsWith('const REVIEW_AI_BATCH_RESULTS = '));
assert.ok(batchResultsLine, 'REVIEW_AI_BATCH_RESULTS ausente');
const batchResultsConst = batchResultsLine.split('//')[0];

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
  // Estado de partida EXATO do bug relatado: revisão já reaberta (pending,
  // após "↩ Voltar para revisões") com um plano estrutural ANTIGO travado em
  // rejected/unresolved (o "🔴 Plano rejeitado (unresolved)" visto na UI).
  const mkrev = (id, lesionId, requestText, oldPlan) => ({ id, lesionId, status: 'pending',
    requestText, history: [], createdAt: 1000, updatedAt: 1000, structuralPlan: oldPlan });
  const oldRejectedUnresolved = (reviewId) => ({
    status: 'rejected', importedAt: '2026-09-20T00:00:00.000Z', decidedAt: '2026-09-20T00:01:00.000Z',
    type: 'unresolved',
    resolution: { reviewId, valid: true, type: 'unresolved', reason: 'no_safe_candidate', reasoning: 'tentativa antiga sem clone seguro' },
    snapshot: { createdAt: 'x', lesions: {} }
  });
  const LESION_REVISIONS = {
    [RID_CERVIX]: mkrev(RID_CERVIX, 'seed_600', 'LESÃO DUPLICADA, manter o clone "Carcinoma de colo do útero"', oldRejectedUnresolved(RID_CERVIX)),
    [RID_PLACENTA]: mkrev(RID_PLACENTA, 'seed_530', 'manter clone "Acretismo placentário (placenta acreta/increta/percreta)"', oldRejectedUnresolved(RID_PLACENTA))
  };
  const calls = { saves: 0, badges: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS, REVIEW: {}, SRS: {},
    APPROVED_CLINICAL_MERGES_091C: [], LESION_MERGES: {},
    saveLesionRevisions: async () => { calls.saves++; },
    updateReviewCenterBadges: () => { calls.badges++; },
    toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + bridgeTypes + '\n' + manualRe + '\n' + diffGapRe + '\n' + batchResultsConst + '\n' + names.map(fn).join('\n'), ctx, { filename: 'batch-bridge-test.js' });
  return ctx;
}
const planOf = (ctx, id) => ctx.LESION_REVISIONS[id].structuralPlan;

// JSON EXATO do relato do usuário (formato de lote "results", como colado em
// "🤖 Analisar pendências com IA" → "Colar respostas da IA" → "Processar lote").
function realUserBatchJson(reviewId, description) {
  return JSON.stringify({
    results: [{
      reviewId,
      result: 'manual_action_required',
      summary: 'Lesão duplicada identificada.',
      reasoning: 'O clone citado no pedido corresponde a um registro real do acervo.',
      manualAction: { type: 'merge_duplicates', description },
      proposedChanges: {}
    }]
  });
}

test('CERVIX via LOTE REAL: rejected/unresolved → imported (keeper seed_218, remove seed_600)', async () => {
  const ctx = ctxFixture();
  assert.equal(planOf(ctx, RID_CERVIX).status, 'rejected', 'estado de partida é o bug relatado');
  assert.equal(planOf(ctx, RID_CERVIX).type, 'unresolved');

  const json = realUserBatchJson(RID_CERVIX, 'Manter Carcinoma de colo do útero — clone duplicado seguro.');
  const res = ctx.importReviewAiBatch(json);
  assert.equal(res.ok, true, 'lote válido: ' + res.reason);
  assert.equal(res.items[0].status, 'manual_action_required');
  assert.ok(res.items[0].structuralPlan, 'a ponte 1→2 tem que rodar DENTRO do lote e construir o plano');
  assert.equal(res.items[0].structuralPlan.keeperId, 'seed_218');
  assert.equal(res.items[0].structuralPlan.removeId, 'seed_600');

  const plan = planOf(ctx, RID_CERVIX);
  assert.equal(plan.status, 'imported', 'plano tem que estar imported, não mais rejected/unresolved');
  assert.equal(plan.type, 'merge_duplicates');
  assert.equal(plan.resolution.keeperId, 'seed_218');
  assert.equal(plan.resolution.removeId, 'seed_600');
  assert.equal(ctx.getEffectiveStructuralStatus(ctx.LESION_REVISIONS[RID_CERVIX]), 'imported');
  assert.match(ctx.structuralPlanStatusRowHtml(RID_CERVIX), /Aceitar plano/);
  assert.ok(!ctx.structuralPlanStatusRowHtml(RID_CERVIX).includes('Plano rejeitado'));

  // save + reload: o objeto persistido é o mesmo que o render lê (sem cópia paralela).
  const reloaded = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  assert.equal(reloaded[RID_CERVIX].structuralPlan.status, 'imported');

  // sync/merge: decisão local (updatedAt novo) não pode regredir para o rejected antigo.
  const local = JSON.parse(JSON.stringify(ctx.LESION_REVISIONS));
  const remote = JSON.parse(JSON.stringify(local));
  remote[RID_CERVIX].structuralPlan = { status: 'rejected', importedAt: '2026-09-20T00:00:00.000Z',
    decidedAt: '2026-09-20T00:01:00.000Z', type: 'unresolved',
    resolution: { reviewId: RID_CERVIX, valid: true, type: 'unresolved', reason: 'no_safe_candidate', reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  remote[RID_CERVIX].updatedAt = 500; // mais antigo que o import local
  const merged = ctx.mergeLesionRevisions(local, remote);
  assert.equal(merged[RID_CERVIX].structuralPlan.status, 'imported', 'sync não pode restaurar o rejected antigo');
  assert.equal(merged[RID_CERVIX].structuralPlan.resolution.keeperId, 'seed_218');
});

test('PLACENTA via LOTE REAL: rejected/unresolved → imported (keeper seed_846, remove seed_530), override cross-section', async () => {
  const ctx = ctxFixture();
  assert.equal(planOf(ctx, RID_PLACENTA).status, 'rejected');

  const json = realUserBatchJson(RID_PLACENTA, 'Acretismo placentário (placenta acreta/increta/percreta)');
  const res = ctx.importReviewAiBatch(json);
  assert.equal(res.ok, true, 'lote válido: ' + res.reason);
  assert.ok(res.items[0].structuralPlan, 'ponte tem que construir o plano da placenta dentro do lote');
  assert.equal(res.items[0].structuralPlan.keeperId, 'seed_846');
  assert.equal(res.items[0].structuralPlan.removeId, 'seed_530');

  const plan = planOf(ctx, RID_PLACENTA);
  assert.equal(plan.status, 'imported');
  assert.equal(plan.resolution.keeperId, 'seed_846');
  assert.equal(plan.resolution.removeId, 'seed_530');
  assert.match(ctx.structuralPlanPreviewHtml(plan.resolution), /cross-section aprovada manualmente/);
  assert.match(ctx.structuralPlanStatusRowHtml(RID_PLACENTA), /Aceitar plano/);
});

test('LOTE REAL: sem clone citado no pedido → continua unresolved (sem regressão de segurança)', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].requestText = 'lesão duplicada, mas sem citar qual clone manter';
  const json = realUserBatchJson(RID_CERVIX, 'ação manual necessária');
  const res = ctx.importReviewAiBatch(json);
  assert.equal(res.ok, true);
  assert.equal(res.items[0].structuralPlan, null, 'sem citação explícita, a ponte não deve inventar keeper');
  assert.equal(res.items[0].bridgeReason, 'no_safe_candidate');
  // O plano antigo (rejected/unresolved) permanece — não é apagado por um bridge falho.
  assert.equal(planOf(ctx, RID_CERVIX).status, 'rejected');
});

test('LOTE REAL: terminal executed nunca é reinterpretado pelo lote', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan = { status: 'executed', importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
    batchKey: 'sb', batchImportedAt: 'x', resolutionHash: 'h',
    resolution: { reviewId: RID_CERVIX, valid: true, type: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  ctx.LESION_REVISIONS[RID_CERVIX].structuralExecution = { executionId: 'exec_x', status: 'executed', at: 'y' };
  const json = realUserBatchJson(RID_CERVIX, 'Manter Carcinoma de colo do útero');
  const res = ctx.importReviewAiBatch(json);
  assert.equal(res.ok, true);
  assert.equal(res.items[0].structuralPlan, null);
  assert.equal(res.items[0].bridgeReason, 'terminal_state_preserved');
  assert.equal(planOf(ctx, RID_CERVIX).status, 'executed', 'terminal nunca regride');
});
