'use strict';

// Override humano RESTRITO para fusão cross-section (placenta: Obstetrícia ×
// Pelve — artefato de taxonomia, não conflito real). Regras: flag explícita
// no plano + keeper citado no pedido ATUAL (match único) + SEM par
// incompatível de órgãos + prévia + aceite obrigatórios. O veto global
// (ovário×pâncreas etc.) continua intacto. Sem autoexecução.

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
  'validateStructuralResolutionBatch', 'persistValidatedStructuralPlan', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash',
  'acceptStructuralPlan', 'rejectStructuralPlan',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots', 'executeStructuralPlan',
  'structuralApplyMerge', 'resolveReviewManually',
  'lesionMergeLinkKey', 'mergeClinicalCasesForFold', 'mergeDidacticItems',
  'mergeReviewProgress', 'mergeReviewOverrides', 'clinicalCaseIdentityKey',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership',
  'getEffectiveStructuralStatus', 'structuralPlanPreviewHtml'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const execConsts = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const ownershipConst = "const IMAGE_OWNERSHIP_MANUAL = { manual:true };\n";
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";
const snapshotStoreConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));

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

function ctxFixture(keepIds) {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW.filter((e) => keepIds.includes(e.id))));
  const mkrev = (id, lesionId, requestText) => ({ id, lesionId, status: 'manual_action_required',
    requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = {
    RP: mkrev('RP', 'seed_530', 'remover - duplicada, mesclar com dados do clone clone: Acretismo placentário (placenta acreta/increta/percreta)')
  };
  const calls = { saves: 0, badges: 0 };
  const ctx = vm.createContext({ DATA, LESION_REVISIONS,
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
    toast: () => {}, console });
  ctx.calls = calls;
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + execConsts + '\n' + ownershipConst + statusesConst + snapshotStoreConst + names.map(fn).join('\n'), ctx, { filename: 'override-test.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', ctx); // Fase 6: cobre o legado inline
  return ctx;
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, resolutions });
const placentaMerge = (over) => Object.assign({ reviewId: 'RP', resolutionType: 'merge_duplicates',
  keeperId: 'seed_846', removeId: 'seed_530', merge: {}, reasoning: 'placenta',
  crossSectionOverride: true }, over || {});

test('1. seed_530→seed_846 permitido com override explícito (import+dry+execute)', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  const imp = await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  assert.equal(imp.ok, true, 'import: ' + imp.reason);
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'imported');
  assert.equal((await ctx.acceptStructuralPlan('RP')).ok, true);
  const dry = ctx.dryRunStructuralPlan('RP');
  assert.equal(dry.ok, true, 'dry: ' + dry.reason);
  assert.equal(dry.executes, true);
  assert.ok(dry.warnings.some((w) => w.kind === 'cross_section_override'));
  assert.ok(!dry.conflicts.some((c) => c.kind === 'anatomic_conflict'));
  const ex = await ctx.executeStructuralPlan('RP');
  assert.equal(ex.ok, true, 'execute: ' + ex.reason);
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'executed');
  assert.equal(ctx.LESION_MERGES['seed_530'].into, 'seed_846');
  assert.ok(ctx.DATA.some((e) => e.id === 'seed_846'));
  assert.ok(!ctx.DATA.some((e) => e.id === 'seed_530'));
});

test('2. mesmo par sem override continua bloqueado', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  const imp = await ctx.importStructuralResolutionBatch(batch([placentaMerge({ crossSectionOverride: false })]));
  assert.equal(imp.ok, false);
  assert.equal(imp.reason, 'anatomic_conflict');
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan, undefined, 'nada persiste');
});

test('3. ovário→pâncreas continua bloqueado mesmo com texto parecido + override', async () => {
  const ctx = ctxFixture(['seed_207', 'seed_156']);
  ctx.LESION_REVISIONS['RO'] = { id: 'RO', lesionId: 'seed_156', status: 'manual_action_required',
    requestText: 'duplicada, fundir com o clone: Cistoadenoma seroso',
    manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1, updatedAt: 1 };
  // Citação resolve para seed_207 (source excluída), mas o par de órgãos
  // ovário×pâncreas veta de todo jeito. Dupla barreira.
  const imp = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RO', resolutionType: 'merge_duplicates', keeperId: 'seed_207', removeId: 'seed_156',
      merge: {}, reasoning: 'x', humanOverride: true, crossSectionOverride: true }]));
  assert.equal(imp.ok, false);
  assert.equal(imp.reason, 'anatomic_conflict');
  assert.ok(ctx.hasIncompatibleOrganAnatomy(
    ctx.DATA.find((e) => e.id === 'seed_207'), ctx.DATA.find((e) => e.id === 'seed_156')));
  assert.ok(!ctx.hasIncompatibleOrganAnatomy(
    ctx.DATA.find((e) => e.id === 'seed_530'), ctx.DATA.find((e) => e.id === 'seed_846')));
});

test('4. override não vale para outro keeper', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846', 'seed_444']);
  const imp = await ctx.importStructuralResolutionBatch(batch([
    { reviewId: 'RP', resolutionType: 'merge_duplicates', keeperId: 'seed_444', removeId: 'seed_530',
      merge: {}, reasoning: 'x', humanOverride: true, crossSectionOverride: true }]));
  assert.equal(imp.ok, false, 'citado seed_846 mas keeper seed_444');
  assert.equal(imp.reason, 'anatomic_conflict');
});

test('5. preview obrigatória mostra o override', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  const prev = ctx.structuralPlanPreviewHtml(ctx.LESION_REVISIONS['RP'].structuralPlan.resolution);
  assert.match(prev, /cross-section aprovada manualmente/);
});

test('6. accept obrigatório (sem autoexecução)', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'imported', 'import não executa');
  assert.equal((await ctx.acceptStructuralPlan('RP')).ok, true);
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'accepted');
  assert.ok(ctx.DATA.some((e) => e.id === 'seed_530'), 'nada fundido no aceite');
});

test('7. executed/rolledback continuam terminais', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  await ctx.acceptStructuralPlan('RP');
  await ctx.executeStructuralPlan('RP');
  assert.equal((await ctx.acceptStructuralPlan('RP')).reason, 'already_executed');
  assert.equal(ctx.LESION_REVISIONS['RP'].structuralPlan.status, 'executed');
});

test('8. histórico registra uso do override', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846']);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  const h = ctx.LESION_REVISIONS['RP'].history;
  assert.ok(h.some((x) => x.action === 'structural_plan_imported' && x.details && x.details.crossSectionOverride === true));
  await ctx.acceptStructuralPlan('RP');
  const h2 = ctx.LESION_REVISIONS['RP'].history;
  assert.ok(h2.some((x) => x.action === 'structural_plan_accepted' && x.details && x.details.crossSectionOverride === true));
});

test('9. outros planos intocados', async () => {
  const ctx = ctxFixture(['seed_530', 'seed_846', 'seed_600', 'seed_218']);
  ctx.LESION_REVISIONS['RC'] = { id: 'RC', lesionId: 'seed_600', status: 'manual_action_required',
    requestText: 'x', manualAction: { type: 'x', description: 'y' }, history: [], createdAt: 1, updatedAt: 1,
    structuralPlan: { status: 'imported', importedAt: 'x', type: 'unresolved',
      resolution: { reviewId: 'RC', valid: true, type: 'unresolved', reason: 'r', reasoning: 'x' },
      snapshot: { createdAt: 'x', lesions: {} } } };
  const before = JSON.stringify(ctx.LESION_REVISIONS['RC'].structuralPlan);
  await ctx.importStructuralResolutionBatch(batch([placentaMerge()]));
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS['RC'].structuralPlan), before);
});
