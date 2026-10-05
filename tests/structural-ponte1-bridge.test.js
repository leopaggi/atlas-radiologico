'use strict';

// PONTE 1 → PONTE 2: resposta manual com manualAction.type=merge_duplicates e
// exatamente um clone seguro resolvido constrói structuralPlan REAL (imported)
// em vez de morrer como texto. Cobre revisão manual (import Ponte 1 recusava
// com not_proposable) e pending/rejected (vira manual + plano de uma vez).
// Sem autoaceite, sem autoexecução, sem ID inventado.

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
  'validateStructuralResolutionBatch', 'importStructuralResolutionBatch', 'structuralBatchKey', 'structuralResolutionHash',
  'persistValidatedStructuralPlan',
  'getEffectiveStructuralStatus', 'getManualActionSolutions',
  'structuralPlanCardDecideHtml', 'structuralPlanPreviewHtml', 'structuralPlanStatusRowHtml',
  'reviewAcceptsAiProposal', 'flagManualActionRequired', 'reviewAiManualActionReason',
  'validateReviewAiPlacement', 'reviewAiKnownSections',
  'bridgeManualActionToStructuralPlan', 'importReviewAiSolution',
  'reviewRequestFlaggedMissingDifferentials', 'reviewAiAddressedDifferentialsGap',
  'reviewDifferentialsSection', 'hasStructuredDifferentials', 'hasLegacyGenericDifferentials', 'reviewAiDifferentialsGate'];
const consts = html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '), html.indexOf('// Tokens relevantes:', html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping = html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '), html.indexOf('function structuralReviewPick('));
const planTypes = html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '), html.indexOf('function structuralPlanError('));
const bridgeTypes = html.slice(html.indexOf('const STRUCTURAL_BRIDGE_ACTION_TYPES = '), html.indexOf('function bridgeManualActionToStructuralPlan('));
const manualRe = html.slice(html.indexOf('const REVIEW_AI_MANUAL_ACTION_RE = '), html.indexOf('function reviewAiManualActionReason('));
const diffGapRe = html.slice(html.indexOf('const TRIAGE_DIFFERENTIALS_GAP_MARKER_RE = '), html.indexOf('function reviewAiAddressedDifferentialsGap('));

// SEED real, ids posicionais como no boot.
const seedLine = html.split('\n').find((l) => l.startsWith('const SEED = '));
const SEED_RAW = JSON.parse(seedLine.slice('const SEED = '.length).replace(/;\s*$/, ''));
SEED_RAW.forEach((e, i) => { e.id = 'seed_' + i; });

const RID_CERVIX = 'lrev_muhq25u5_ijyqgq';
const RID_PLACENTA = 'lrev_muhqttye_tvd2bt';

function ctxFixture() {
  const DATA = JSON.parse(JSON.stringify(SEED_RAW));
  const mkrev = (id, lesionId, requestText, status) => ({ id, lesionId, status: status || 'manual_action_required',
    requestText, manualAction: { type: 'duplicate_merge', description: '' }, history: [], createdAt: 1000, updatedAt: 1000 });
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
  vm.runInContext(consts + '\n' + mapping + '\n' + planTypes + '\n' + bridgeTypes + '\n' + manualRe + '\n' + diffGapRe + '\n' + names.map(fn).join('\n'), ctx, { filename: 'bridge-test.js' });
  return ctx;
}
// Formato EXATO que o ChatGPT devolve hoje.
const gpt = (reviewId, type, description, summary) => JSON.stringify({ reviewId, result: 'manual_action_required',
  summary: summary || 'Análise da IA', reasoning: 'Justificativa da IA',
  manualAction: { type, description }, proposedChanges: {} });
const inList = (ctx, listFn, id) => listFn.call(ctx).some((x) => x.id === id);

test('CERVIX: JSON Ponte 1 constrói plano imported com keeper seed_218', () => {
  const ctx = ctxFixture();
  const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'merge_duplicates', 'fundir clone do colo'));
  assert.equal(res.ok, true, 'import: ' + res.reason);
  assert.equal(res.outcome, 'manual_action_required');
  assert.ok(res.structuralPlan, 'ponte construiu plano');
  assert.equal(res.structuralPlan.status, 'imported');
  assert.equal(res.structuralPlan.keeperId, 'seed_218', 'keeper real');
  assert.equal(res.structuralPlan.removeId, 'seed_600');
  const p = ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan;
  assert.equal(p.status, 'imported');
  assert.equal(p.resolution.keeperId, 'seed_218');
  assert.equal(ctx.getEffectiveStructuralStatus(ctx.LESION_REVISIONS[RID_CERVIX]), 'imported');
  const prev = ctx.structuralPlanPreviewHtml(p.resolution);
  assert.match(prev, /seed_218/);
  assert.match(prev, /MANTER/);
  assert.match(prev, /seed_600/);
  assert.match(ctx.structuralPlanStatusRowHtml(RID_CERVIX), /Aceitar plano/);
  assert.equal(inList(ctx, ctx.getManualActionSolutions, RID_CERVIX), true);
});

test('PLACENTA: ponte usa override restrito, preview exige aprovação', () => {
  const ctx = ctxFixture();
  const res = ctx.importReviewAiSolution(RID_PLACENTA, gpt(RID_PLACENTA, 'merge_duplicates', 'fundir clone placenta'));
  assert.equal(res.ok, true, 'import: ' + res.reason);
  assert.ok(res.structuralPlan, 'ponte construiu plano cross-section');
  assert.equal(res.structuralPlan.crossSectionOverride, true);
  const p = ctx.LESION_REVISIONS[RID_PLACENTA].structuralPlan;
  assert.equal(p.status, 'imported');
  assert.equal(p.resolution.keeperId, 'seed_846');
  assert.match(ctx.structuralPlanPreviewHtml(p.resolution), /cross-section aprovada manualmente/);
  assert.match(ctx.structuralPlanStatusRowHtml(RID_PLACENTA), /Aceitar plano/);
});

test('sem candidato seguro: texto salva, sem plano', () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].requestText = 'duplicada, ver clone';
  const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'merge_duplicates', 'x'));
  assert.equal(res.ok, true);
  assert.equal(res.structuralPlan, null);
  assert.equal(res.bridgeReason, 'no_safe_candidate');
  assert.equal(ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan, undefined, 'nada inventado');
});

test('ambíguo: sem plano, sem travar revisão', () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].requestText = 'duplicada, fundir com o clone: Cistoadenoma seroso';
  const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'merge_duplicates', 'x'));
  assert.equal(res.ok, true);
  assert.equal(res.structuralPlan, null);
  assert.equal(res.bridgeReason, 'ambiguous_clone');
});

test('tipo não estrutural: fluxo antigo intacto', () => {
  const ctx = ctxFixture();
  const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'revisar_descricao', 'x'));
  assert.equal(res.ok, false, 'manual + tipo comum segue recusado como antes');
  assert.equal(res.reason, 'not_proposable');
});

test('terminal: executed não é reconstruído', () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan = { status: 'executed', importedAt: 'x', decidedAt: 'y', type: 'merge_duplicates',
    resolution: { reviewId: RID_CERVIX, valid: true, type: 'merge_duplicates', keeperId: 'seed_218', removeId: 'seed_600', merge: {}, reasoning: 'x' },
    snapshot: { createdAt: 'x', lesions: {} } };
  ctx.LESION_REVISIONS[RID_CERVIX].structuralExecution = { executionId: 'exec_x', status: 'executed', at: 'y' };
  const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'merge_duplicates', 'x'));
  assert.equal(res.ok, true);
  assert.equal(res.structuralPlan, null);
  assert.equal(res.bridgeReason, 'terminal_state_preserved');
  assert.equal(ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan.status, 'executed');
});

test('pending + resposta estrutural: vira manual E ganha plano de uma vez', () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS[RID_CERVIX].status = 'pending';
  const res = ctx.importReviewAiSolution(RID_CERVIX, gpt(RID_CERVIX, 'merge_duplicates', 'x', 'Fusão estrutural necessária'));
  assert.equal(res.ok, true);
  assert.equal(ctx.LESION_REVISIONS[RID_CERVIX].status, 'manual_action_required');
  assert.ok(res.structuralPlan, 'plano junto');
  assert.equal(ctx.LESION_REVISIONS[RID_CERVIX].structuralPlan.status, 'imported');
});

test('idempotente: mesmo JSON não duplica plano nem histórico', () => {
  const ctx = ctxFixture();
  const j = gpt(RID_CERVIX, 'merge_duplicates', 'x');
  assert.ok(ctx.importReviewAiSolution(RID_CERVIX, j).structuralPlan);
  const histLen = ctx.LESION_REVISIONS[RID_CERVIX].history.length;
  const res2 = ctx.importReviewAiSolution(RID_CERVIX, j);
  assert.equal(res2.ok, true);
  assert.equal(res2.structuralPlan, null, 'segunda vez pula (already_imported)');
  assert.equal(res2.bridgeReason, 'already_imported');
  assert.equal(ctx.LESION_REVISIONS[RID_CERVIX].history.length, histLen + 2, 'só o texto novo (2 eventos), sem plano duplicado');
});
