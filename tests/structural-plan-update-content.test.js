'use strict';

// PONTE ESTRUTURAL — resolutionType "update_content": permite resolver em
// lote ações manuais puramente editoriais (name/notes/classification/tags/
// enTerm/clinicalTags) SEM merge_duplicates (que exige remover uma segunda
// lesão real) e SEM clinicalTags (que nenhum tipo antigo suportava).
//
// GUARDA SEMÂNTICA OBRIGATÓRIA: seed_N sozinho nunca é identidade estável
// entre SEED local e DATA vivo publicado (caso real documentado:
// seed_1030/seed_500 localmente eram seed_968/seed_483 no publicado).
// expectedIdentity {name,section,site} é validado contra a lesão resolvida
// por lesionId tanto na importação quanto, de novo, imediatamente antes da
// mutação na execução — humanOverride NUNCA contorna esta checagem.

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

const names = ['normalizeExternalTitle', 'tokenizeExternalTitle',
  'structuralSectionOf', 'structuralSiteOf', 'hasStrongAnatomicConflict',
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'isCrossSectionOverrideValid', 'findExplicitCloneMatches',
  'canonicalJsonString', 'stableImageKeyV208', 'imageIdentityKeys',
  'pushLesionReviewHistory', 'lesionMergeLinkKey',
  'mergeClinicalCasesForFold', 'mergeDidacticItems', 'genDidacticId',
  'structuralPlanError', 'structuralPlanString', 'structuralPlanStringArray',
  'structuralPlanLesion', 'structuralPlanResolveImage', 'structuralPlanKnownIds', 'structuralPlanIdentityMismatch',
  'validateProposedChanges',
  'validateStructuralResolution', 'validateStructuralResolutionBatch',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale', 'isStructuralExecutionStale',
  'structuralResolutionToRaw', 'refreshStructuralPlan',
  'structuralBatchKey', 'structuralResolutionHash', 'persistValidatedStructuralPlan',
  'importStructuralResolutionBatch', 'acceptStructuralPlan', 'rejectStructuralPlan',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots',
  'executeStructuralPlan',
  'structuralApplyMerge', 'structuralApplyRemovePlacement',
  'structuralApplyTransferImages', 'structuralApplyAddCases', 'structuralApplyUpdateContent',
  'rollbackStructuralExecution', 'resolveReviewManually',
  'structuralPlanPreviewHtml', 'structuralHistoryCardHtml', 'getEffectiveStructuralStatus',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership', 'clinicalCaseIdentityKey'
];
const src = names.map(fn).join('\n');
const planTypesConst = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const editableFieldsConst = html.slice(html.indexOf("const LESION_REVIEW_EDITABLE_FIELDS = "), html.indexOf('function validateProposedChanges('));
const execConsts = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const ownershipConst = "const IMAGE_OWNERSHIP_MANUAL = { manual:true };\n";
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";
const anatomicGuardConst = html.slice(html.indexOf('const SECTION_ANATOMIC_SYSTEM = {'), html.indexOf('function validateReviewAiPlacement(suggested, sourceSection){'));
const snapshotStoreConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));
const schemaVersionConst = html.slice(html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '), html.indexOf('function structuralSnapshotLocalCacheKey('));

function lesion(id, over) {
  return Object.assign({
    id, name: 'Lesão ' + id, s: 'Coluna Vertebral', site: 'Sacro', notes: 'notas antigas',
    classification: 'OLD', tags: ['antigo'], clinicalTags: [], enTerm: 'old term',
    images: [{ assetId: 'A_' + id, data: 'https://x/' + id + '.jpg', source: 'cloudinary', label: 'img', lesionId: id, lesionName: 'x' }],
    altPlacements: [{ s: 'Outra Seção', site: 'Outro Sítio' }],
    links: [{ label: 'ref', url: 'https://x' }], clinicalCases: [{ id: 'c1', title: 'caso 1' }],
    radiologicSigns: ['sinal 1'], classificationSchemes: ['esquema 1'],
    _userUpdatedAt: 100
  }, over || {});
}
const ID900 = { name: 'Lesão seed_900', section: 'Coluna Vertebral', site: 'Sacro' };

function ctxFixture() {
  const DATA = [
    lesion('seed_900', { name: 'Lesão seed_900' }),
    lesion('seed_901', { name: 'Lesão seed_901' })
  ];
  const manual = (id, lesionId) => ({ id, lesionId, status: 'manual_action_required',
    requestText: 'corrigir conteúdo', manualAction: { type: 'content_fix', description: 'x' },
    history: [], createdAt: 1000, updatedAt: 1000 });
  const LESION_REVISIONS = { RA: manual('RA', 'seed_900'), RB: manual('RB', 'seed_901') };
  const calls = { saves: 0, badges: 0 };
  const backing = {};
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
    async set(key, value) { backing[key] = value; }
  };
  const ctx = vm.createContext({
    DATA, LESION_REVISIONS, storage,
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
  ctx.__backing = backing;
  vm.runInContext(planTypesConst + '\n' + editableFieldsConst + '\n' + execConsts + '\n' + ownershipConst + statusesConst + anatomicGuardConst + snapshotStoreConst + '\n' + schemaVersionConst + src, ctx, { filename: 'update-content-test.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', ctx);
  return ctx;
}

const batch = (resolutions) => ({ type: 'atlas_structural_resolution_batch', version: 1, generatedAt: '2026-10-07T00:00:00.000Z', resolutions });
const updateContent = (reviewId, lesionId, identity, fields, extra) => Object.assign({
  reviewId, resolutionType: 'update_content', lesionId, expectedIdentity: identity, fields, reasoning: 'teste'
}, extra || {});
const addCases = (reviewId, lesionId) => ({ reviewId, resolutionType: 'add_clinical_cases', lesionId,
  clinicalCases: [{ title: 'caso ' + reviewId }], reasoning: 'x' });

async function importAcceptExecute(ctx, reviewId, resolution) {
  const imp = await ctx.importStructuralResolutionBatch(batch([resolution]));
  if (!imp.ok) return imp;
  const acc = await ctx.acceptStructuralPlan(reviewId);
  if (!acc.ok) return acc;
  return await ctx.executeStructuralPlan(reviewId);
}

// ===========================================================================
// A-E — resoluções válidas realmente alteram o conteúdo esperado
// ===========================================================================
test('A. update_content válido altera notes', async () => {
  const ctx = ctxFixture();
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900, { notes: 'nova nota clínica' }));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'nova nota clínica');
});

test('B. altera tags por OVERWRITE, nunca união', async () => {
  const ctx = ctxFixture();
  assert.deepEqual(ctx.DATA.find(e => e.id === 'seed_900').tags, ['antigo']);
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900, { tags: ['novo1', 'novo2'] }));
  assert.equal(res.ok, true);
  assert.deepEqual(ctx.DATA.find(e => e.id === 'seed_900').tags, ['novo1', 'novo2'], 'overwrite — "antigo" não pode sobreviver junto');
});

test('C. adiciona clinicalTags (campo não suportado por nenhum tipo antigo)', async () => {
  const ctx = ctxFixture();
  assert.deepEqual(ctx.DATA.find(e => e.id === 'seed_900').clinicalTags, []);
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900, { clinicalTags: ['sinal clínico x'] }));
  assert.equal(res.ok, true);
  assert.deepEqual(ctx.DATA.find(e => e.id === 'seed_900').clinicalTags, ['sinal clínico x']);
});

test('D. classification aceita null', async () => {
  const ctx = ctxFixture();
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').classification, 'OLD');
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900, { classification: null }));
  assert.equal(res.ok, true);
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').classification, null);
});

test('E. múltiplos campos alterados na mesma resolução', async () => {
  const ctx = ctxFixture();
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900,
    { notes: 'n2', tags: ['t2'], enTerm: 'e2', classification: 'NEW', clinicalTags: ['ct2'], name: 'Nome novo' }));
  assert.equal(res.ok, true);
  const l = ctx.DATA.find(e => e.id === 'seed_900');
  assert.equal(l.notes, 'n2'); assert.deepEqual(l.tags, ['t2']); assert.equal(l.enTerm, 'e2');
  assert.equal(l.classification, 'NEW'); assert.deepEqual(l.clinicalTags, ['ct2']); assert.equal(l.name, 'Nome novo');
});

// ===========================================================================
// F-M — validação rejeita (nunca toca DATA)
// ===========================================================================
test('F. campo proibido faz o plano/validação ser rejeitado', () => {
  const ctx = ctxFixture();
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_900', ID900, { notes: 'x', images: [] }));
  assert.equal(v.valid, false);
  assert.match(v.reason, /forbidden_field/);
});

test('G. fields vazio é rejeitado', () => {
  const ctx = ctxFixture();
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_900', ID900, {}));
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'empty_changes');
});

test('H. expectedIdentity ausente é rejeitado', () => {
  const ctx = ctxFixture();
  const raw = { reviewId: 'RA', resolutionType: 'update_content', lesionId: 'seed_900', fields: { notes: 'x' }, reasoning: 'y' };
  const v = ctx.validateStructuralResolution(raw);
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'expectedIdentity_missing');
});

test('I. name divergente é rejeitado', () => {
  const ctx = ctxFixture();
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_900', { name: 'Nome errado', section: ID900.section, site: ID900.site }, { notes: 'x' }));
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'identity_mismatch');
});

test('J. section divergente é rejeitado', () => {
  const ctx = ctxFixture();
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_900', { name: ID900.name, section: 'Seção errada', site: ID900.site }, { notes: 'x' }));
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'identity_mismatch');
});

test('K. site divergente é rejeitado', () => {
  const ctx = ctxFixture();
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_900', { name: ID900.name, section: ID900.section, site: 'Sítio errado' }, { notes: 'x' }));
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'identity_mismatch');
});

test('L. lesionId inexistente é rejeitado', () => {
  const ctx = ctxFixture();
  // review.lesionId precisa apontar pro MESMO id inexistente, senão o
  // cross-check review_lesion_mismatch (também obrigatório) dispara antes.
  ctx.LESION_REVISIONS.RA.lesionId = 'seed_does_not_exist';
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_does_not_exist', ID900, { notes: 'x' }));
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'lesion_not_found');
});

test('L2. reviewId cujo lesionId não coincide com o lesionId do plano é rejeitado (cross-check revisão × plano)', () => {
  const ctx = ctxFixture();
  // RA.lesionId é 'seed_900' no fixture; apontar o plano pra outra lesão
  // (mesmo que ela exista e tenha identidade válida) precisa ser rejeitado.
  const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_901',
    { name: 'Lesão seed_901', section: 'Coluna Vertebral', site: 'Sacro' }, { notes: 'x' }));
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'review_lesion_mismatch');
});

test('M. humanOverride:true NÃO ignora divergência semântica (nome/seção/site)', () => {
  const ctx = ctxFixture();
  for (const bad of [
    { name: 'Nome errado', section: ID900.section, site: ID900.site },
    { name: ID900.name, section: 'Seção errada', site: ID900.site },
    { name: ID900.name, section: ID900.section, site: 'Sítio errado' }
  ]) {
    const v = ctx.validateStructuralResolution(updateContent('RA', 'seed_900', bad, { notes: 'x' }, { humanOverride: true }));
    assert.equal(v.valid, false, 'humanOverride não pode contornar: ' + JSON.stringify(bad));
    assert.equal(v.reason, 'identity_mismatch');
  }
});

test('N. nenhuma mutação ocorre quando a identidade diverge (import inteiro falha, DATA intocado)', async () => {
  const ctx = ctxFixture();
  const before = JSON.stringify(ctx.DATA);
  const res = await ctx.importStructuralResolutionBatch(batch([
    updateContent('RA', 'seed_900', { name: 'Nome errado', section: ID900.section, site: ID900.site }, { notes: 'x' })
  ]));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'identity_mismatch');
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA não pode mudar quando a identidade diverge');
  assert.equal(ctx.calls.saves, 0, 'nada pode ser persistido');
  assert.equal(ctx.LESION_REVISIONS.RA.structuralPlan, undefined, 'plano nunca é gravado na revisão');
});

// ===========================================================================
// O — campos fora da allowlist permanecem byte-equivalentes
// ===========================================================================
test('O. imagens/links/clinicalCases/radiologicSigns/classificationSchemes/altPlacements permanecem byte-equivalentes', async () => {
  const ctx = ctxFixture();
  const before = ctx.structuralClone(ctx.DATA.find(e => e.id === 'seed_900'));
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900, { notes: 'mudou só isso' }));
  assert.equal(res.ok, true);
  const after = ctx.DATA.find(e => e.id === 'seed_900');
  for (const k of ['images', 'links', 'clinicalCases', 'radiologicSigns', 'classificationSchemes', 'altPlacements', 's', 'site', 'id']) {
    // Comparação via JSON.stringify: assert.deepEqual pode reportar objetos
    // estruturalmente idênticos como diferentes quando um lado veio de um
    // JSON.parse/stringify executado dentro do contexto vm (outro realm).
    assert.equal(JSON.stringify(after[k]), JSON.stringify(before[k]), k + ' precisa continuar byte-equivalente');
  }
  assert.equal(after.notes, 'mudou só isso');
});

// ===========================================================================
// P — rollback estrutural
// ===========================================================================
test('P. rollback estrutural restaura o conteúdo anterior', async () => {
  const ctx = ctxFixture();
  const before = ctx.structuralClone(ctx.DATA.find(e => e.id === 'seed_900'));
  const res = await importAcceptExecute(ctx, 'RA', updateContent('RA', 'seed_900', ID900, { notes: 'alterado', tags: ['x'] }));
  assert.equal(res.ok, true);
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'alterado');
  const rb = await ctx.rollbackStructuralExecution('RA');
  assert.equal(rb.ok, true);
  const restored = ctx.DATA.find(e => e.id === 'seed_900');
  const { _userUpdatedAt, ...restoredRest } = restored;
  const { _userUpdatedAt: _o, ...beforeRest } = before;
  assert.deepEqual(restoredRest, beforeRest, 'conteúdo restaurado precisa ser idêntico ao estado anterior (exceto o recarimbo)');
  assert.equal(ctx.LESION_REVISIONS.RA.structuralExecution.status, 'rolledback');
  assert.equal(ctx.LESION_REVISIONS.RA.status, 'manual_action_required', 'revisão reaberta para nova tentativa');
});

// ===========================================================================
// Q/R — lote misto e múltiplos update_content no mesmo lote
// ===========================================================================
test('Q. lote misto update_content + add_clinical_cases continua funcionando', async () => {
  const ctx = ctxFixture();
  const imp = await ctx.importStructuralResolutionBatch(batch([
    updateContent('RA', 'seed_900', ID900, { notes: 'misto' }),
    addCases('RB', 'seed_901')
  ]));
  assert.equal(imp.ok, true, JSON.stringify(imp));
  assert.equal(imp.imported.length, 2);
  assert.equal((await ctx.acceptStructuralPlan('RA')).ok, true);
  assert.equal((await ctx.acceptStructuralPlan('RB')).ok, true);
  assert.equal((await ctx.executeStructuralPlan('RA')).ok, true);
  assert.equal((await ctx.executeStructuralPlan('RB')).ok, true);
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'misto');
  assert.equal(ctx.DATA.find(e => e.id === 'seed_901').clinicalCases.length, 2, '1 original + 1 adicionado');
});

test('R. duas resoluções update_content no mesmo lote funcionam independentemente', async () => {
  const ctx = ctxFixture();
  const imp = await ctx.importStructuralResolutionBatch(batch([
    updateContent('RA', 'seed_900', ID900, { notes: 'A mudou' }),
    updateContent('RB', 'seed_901', { name: 'Lesão seed_901', section: 'Coluna Vertebral', site: 'Sacro' }, { notes: 'B mudou' })
  ]));
  assert.equal(imp.ok, true, JSON.stringify(imp));
  assert.equal((await ctx.acceptStructuralPlan('RA')).ok, true);
  assert.equal((await ctx.acceptStructuralPlan('RB')).ok, true);
  assert.equal((await ctx.executeStructuralPlan('RA')).ok, true);
  assert.equal((await ctx.executeStructuralPlan('RB')).ok, true);
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'A mudou');
  assert.equal(ctx.DATA.find(e => e.id === 'seed_901').notes, 'B mudou');
});

// ===========================================================================
// S — atomicidade: falha de uma resolução não deixa estado parcial inseguro
// ===========================================================================
test('S. falha na execução de UMA resolução não afeta a outra já executada, e não deixa estado parcial inseguro', async () => {
  const ctx = ctxFixture();
  const imp = await ctx.importStructuralResolutionBatch(batch([
    updateContent('RA', 'seed_900', ID900, { notes: 'A executado com sucesso' }),
    updateContent('RB', 'seed_901', { name: 'Lesão seed_901', section: 'Coluna Vertebral', site: 'Sacro' }, { notes: 'B não deveria aplicar' })
  ]));
  assert.equal(imp.ok, true);
  assert.equal((await ctx.acceptStructuralPlan('RA')).ok, true);
  assert.equal((await ctx.acceptStructuralPlan('RB')).ok, true);

  assert.equal((await ctx.executeStructuralPlan('RA')).ok, true);
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'A executado com sucesso');

  // Simula uma mudança externa em seed_901 ENTRE o aceite e a execução
  // (ex.: outra aba/dispositivo editou a lesão). A checagem de "plano obsoleto"
  // (isStructuralPlanStale, uma comparação do OBJETO INTEIRO contra o snapshot
  // tirado na importação) é estritamente mais ampla que a guarda de identidade
  // e intercepta ANTES de dryRun/execução — então a resolução é recusada com
  // 'stale_plan' sem que structuralExecution chegue a ser gravado para RB.
  const before901 = ctx.structuralClone(ctx.DATA.find(e => e.id === 'seed_901'));
  ctx.DATA.find(e => e.id === 'seed_901').name = 'Nome mudou externamente';

  const resB = await ctx.executeStructuralPlan('RB');
  assert.equal(resB.ok, false);
  assert.equal(resB.reason, 'stale_plan');
  const after901 = ctx.DATA.find(e => e.id === 'seed_901');
  assert.equal(after901.notes, before901.notes, 'notes de B NUNCA deveria ter sido alterado — execução abortou antes de qualquer write em fields');
  assert.notEqual(after901.notes, 'B não deveria aplicar');
  assert.equal(ctx.LESION_REVISIONS.RB.structuralExecution, undefined, 'nenhum estado parcial: execução recusada antes mesmo de abrir a tentativa');

  // A execução de A permanece intacta — falha de B nunca afeta A.
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'A executado com sucesso');
  assert.equal(ctx.LESION_REVISIONS.RA.structuralExecution.status, 'executed');
});

test('S2. ESTÁTICO: structuralApplyUpdateContent verifica identidade ANTES de escrever qualquer campo (guarda vem antes do loop de overwrite)', () => {
  const body = fn('structuralApplyUpdateContent');
  const guardIdx = body.indexOf('structuralPlanIdentityMismatch');
  const writeIdx = body.indexOf('Object.keys(fields)');
  assert.ok(guardIdx >= 0 && writeIdx >= 0 && guardIdx < writeIdx, 'a guarda semântica precisa vir antes do overwrite dos campos');
});

// ===========================================================================
// T — parser antigo continua aceitando os tipos já existentes (regressão)
// ===========================================================================
test('T. add_clinical_cases (tipo antigo) continua funcionando sem nenhuma regressão', async () => {
  const ctx = ctxFixture();
  const res = await importAcceptExecute(ctx, 'RB', addCases('RB', 'seed_901'));
  assert.equal(res.ok, true);
  assert.equal(ctx.DATA.find(e => e.id === 'seed_901').clinicalCases.length, 2);
});

// ===========================================================================
// Segurança geral — sem auto-approve, sem tocar nos fluxos de IA
// ===========================================================================
test('SEGURANÇA: importStructuralResolutionBatch nunca aceita/executa — só valida e persiste como "imported"', async () => {
  const ctx = ctxFixture();
  await ctx.importStructuralResolutionBatch(batch([updateContent('RA', 'seed_900', ID900, { notes: 'x' })]));
  assert.equal(ctx.LESION_REVISIONS.RA.structuralPlan.status, 'imported');
  assert.equal(ctx.DATA.find(e => e.id === 'seed_900').notes, 'notas antigas', 'importar nunca aplica — só acceptStructuralPlan + executeStructuralPlan aplicam');
});

test('ESTÁTICO: validateStructuralResolution/structuralApplyUpdateContent nunca chamam importReviewAiSolution/processReviewAiBatchItem', () => {
  const validateBody = fn('validateStructuralResolution');
  const applyBody = fn('structuralApplyUpdateContent');
  for (const forbidden of ['importReviewAiSolution', 'processReviewAiBatchItem']) {
    assert.doesNotMatch(validateBody, new RegExp(forbidden));
    assert.doesNotMatch(applyBody, new RegExp(forbidden));
  }
});

test('ESTÁTICO: a guarda de identidade nunca lê humanOverride (não existe forma de contorná-la por este campo)', () => {
  const validateBody = fn('validateStructuralResolution');
  const updateBranch = validateBody.slice(validateBody.indexOf("type==='update_content'"), validateBody.indexOf("type==='unresolved'"));
  assert.doesNotMatch(updateBranch, /humanOverride[^)]*\?|if\([^)]*humanOverride[^)]*\)\s*\{\s*(?:return|$)/, 'nenhum "if(humanOverride)" controlando o fluxo da guarda de identidade');
  const applyBody = fn('structuralApplyUpdateContent');
  assert.doesNotMatch(applyBody, /humanOverride/);
});
