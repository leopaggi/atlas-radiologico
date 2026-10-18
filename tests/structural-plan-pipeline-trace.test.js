'use strict';

// TRACE END-TO-END do "sumiço" do keeper na prévia:
// requestText atual → findExplicitCloneMatches → candidateRecords (export) →
// import da resolução da IA → structuralPlan → preview.
// Prova: o app NUNCA gera no_safe_candidate (a string nem existe no
// index.html) — o rótulo vem do JSON da IA. Com o export corrigido, o
// candidate viaja no pacote; merge válido vira plano com keeper real; merge
// vetado falha com anatomic_conflict explícito (nunca silencioso).
// Fixture: SEED real + reviewIds reais (cervix lrev_muhq25u5_ijyqgq,
// placenta lrev_muhqttye_tvd2bt).

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
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy',
  'structuralReviewRecord', 'findExplicitCloneMatches', 'findStructuralReviewCandidates', 'canonicalJsonString',
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'isCrossSectionOverrideValid',
  'stableImageKeyV208', 'imageIdentityKeys', 'pushLesionReviewHistory',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray', 'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds',
  'validateStructuralResolution', 'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'validateStructuralResolutionBatch', 'persistValidatedStructuralPlan', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash',
  'getEffectiveStructuralStatus', 'getManualActionSolutions', 'getStructuralHistorySolutions',
  'structuralPlanPreviewHtml', 'structuralPlanStatusRowHtml', 'buildManualActionAiBatch'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));

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
    requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = {
    [RID_CERVIX]: mkrev(RID_CERVIX, 'seed_600', 'no caso o clone que deve ser mantido é este Carcinoma de colo do útero'),
    [RID_PLACENTA]: mkrev(RID_PLACENTA, 'seed_530', 'remover - duplicada, mesclar com dados do clone (caso sejam relevantes e nao repetidos) clone: Acretismo placentário (placenta acreta/increta/percreta)')
  };
  const calls = { saves: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS, REVIEW: {}, SRS: {},
    APPROVED_CLINICAL_MERGES_091C: [], LESION_MERGES: {},
    saveLesionRevisions: async () => { calls.saves++; }, toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + names.map(fn).join('\n'), ctx, { filename: 'pipeline-trace-test.js' });
  return ctx;
}
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, resolutions });
const inList = (ctx, listFn, id) => listFn.call(ctx).some((x) => x.id === id);

test('CERVIX FINDER: requestText atual resolve seed_218', () => {
  const ctx = ctxFixture();
  const r = ctx.LESION_REVISIONS[RID_CERVIX];
  const found = ctx.findExplicitCloneMatches(r, ctx.DATA.find((e) => e.id === 'seed_600'));
  assert.equal(found.status, 'FOUND');
  assert.equal(found.matches[0].id, 'seed_218');
});

test('CERVIX CANDIDATE RECORDS: pacote de exportação carrega seed_218', () => {
  const ctx = ctxFixture();
  const pkg = ctx.buildManualActionAiBatch([RID_CERVIX]);
  const action = pkg.actions.find((a) => a.reviewId === RID_CERVIX);
  assert.ok(action, 'ação exportada');
  const cand = action.candidateRecords.find((c) => c.id === 'seed_218');
  assert.ok(cand, 'candidateRecords contém o keeper real');
  assert.ok(cand.candidateReason.includes('explicit_name_in_review'));
});

test('CERVIX PLAN: merge da IA vira plano com keeper seed_218 (nunca unresolved)', async () => {
  const ctx = ctxFixture();
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_CERVIX, resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600',
      merge: {}, reasoning: 'IA', humanOverride: true }]));
  assert.equal(res.ok, true, 'import: ' + res.reason);
  const p = ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan;
  assert.equal(p.status, 'imported');
  assert.equal(p.resolution.keeperId, 'seed_218', 'keeper real, não inventado');
  assert.equal(p.type, 'merge_duplicates');
});

test('CERVIX PREVIEW: MANTER seed_218, REMOVER seed_600, Aceitar disponível', async () => {
  const ctx = ctxFixture();
  await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_CERVIX, resolutionType: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600',
      merge: {}, reasoning: 'IA', humanOverride: true }]));
  const r = ctx.LESION_REVISIONS[RID_CERVIX];
  const prev = ctx.structuralPlanPreviewHtml(r.structuralPlan.resolution);
  assert.match(prev, /seed_218/);
  assert.match(prev, /Carcinoma de colo do útero/);
  assert.match(prev, /seed_600/);
  assert.ok(!prev.includes('no_safe_candidate'), 'prévia de merge nunca mostra no_safe_candidate');
  const row = ctx.structuralPlanStatusRowHtml(RID_CERVIX);
  assert.match(row, /Aceitar plano/);
  assert.equal(ctx.getEffectiveStructuralStatus(r), 'imported');
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID_CERVIX), true);
});

test('no_safe_candidate só existe em JSON externo (app nunca gera na prévia)', async () => {
  const ctx = ctxFixture();
  // A string existe só como reason de máquina do bridge; nenhum gerador de
  // plano/prévia a produz — a prévia reflete o tipo vindo da IA.
  assert.ok(!fn('structuralPlanPreviewHtml').includes('no_safe_candidate'), 'prévia nunca gera o rótulo');
  assert.ok(!fn('importStructuralResolutionBatch').includes('no_safe_candidate'), 'import nunca gera o rótulo');
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_CERVIX, resolutionType: 'unresolved', reason: 'qualquer_coisa_da_ia', reasoning: 'IA' }]));
  assert.equal(res.ok, true);
  const prev = ctx.structuralPlanPreviewHtml(ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan.resolution);
  assert.match(prev, /Sem resolução estrutural segura/, 'prévia reflete o JSON da IA fielmente');
});

test('PLACENTA FINDER: requestText atual resolve seed_846', () => {
  const ctx = ctxFixture();
  const r = ctx.LESION_REVISIONS[RID_PLACENTA];
  const found = ctx.findExplicitCloneMatches(r, ctx.DATA.find((e) => e.id === 'seed_530'));
  assert.equal(found.status, 'FOUND');
  assert.equal(found.matches[0].id, 'seed_846');
});

test('PLACENTA CANDIDATE RECORDS: pacote carrega seed_846', () => {
  const ctx = ctxFixture();
  const pkg = ctx.buildManualActionAiBatch([RID_PLACENTA]);
  const action = pkg.actions.find((a) => a.reviewId === RID_PLACENTA);
  assert.ok(action.candidateRecords.some((c) => c.id === 'seed_846'), 'candidateRecords contém seed_846');
});

test('PLACENTA BLOCK REASON: merge cross-section falha com anatomic_conflict (nunca silencioso)', async () => {
  const ctx = ctxFixture();
  const res = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: RID_PLACENTA, resolutionType: 'merge_duplicates', keeperId: 'seed_846', removeId: 'seed_530',
      merge: {}, reasoning: 'IA', humanOverride: true }]));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'anatomic_conflict');
  assert.equal(ctx.LESION_REVISIONS[RID_PLACENTA].structuralPlan, undefined, 'nada persiste no bloqueio');
});
