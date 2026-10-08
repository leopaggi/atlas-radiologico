'use strict';

/* Testes do PIPELINE AUTOMÁTICO DE PROPOSTAS (IA) — V1, limite 20.
 * Carrega o trecho REAL do módulo LESION_REVISIONS do index.html (mesmo
 * span/markers de tests/lesion-review.test.js) num contexto `vm` isolado,
 * com storage falso em memória e saveData/saveLesionRevisions reais do
 * próprio módulo (saveData é um stub que só registra chamadas — é esse
 * registro que prova que nenhuma mutação de DATA ocorreu).
 *
 * REGRA TESTADA EM TODO TESTE DESTE ARQUIVO: o pipeline PODE gravar uma
 * proposta (setReviewSolution/setReviewNoChangeSolution/
 * flagManualActionRequired); o pipeline NUNCA executa
 * (authorizeAndApplyReviewSolution/approveAppliedReviewSolution/
 * rollbackAppliedReviewSolution/executeStructuralPlan/
 * rollbackStructuralExecution) e NUNCA toca DATA.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

const MODULE_START_MARKER = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END_MARKER = '/* termos de busca em inglês para as lesões da base padrão';

function extractLesionReviewModule(source) {
  const start = source.indexOf(MODULE_START_MARKER);
  assert.notEqual(start, -1, 'Módulo LESION_REVISIONS não encontrado no index.html');
  const end = source.indexOf(MODULE_END_MARKER, start);
  assert.notEqual(end, -1, 'Fim do módulo LESION_REVISIONS (comentário EN_TERMS) não encontrado');
  return source.slice(start, end);
}

const moduleSource = extractLesionReviewModule(html);

// Mesma técnica (brace counting) de tests/lesion-review.test.js — usada aqui
// pras checagens estáticas de segurança (nenhum caminho do pipeline referencia
// funções de execução/DATA).
function extractFn(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada no módulo extraído');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}

function buildTestContext(opts) {
  opts = opts || {};
  const backing = {};
  const storage = {
    async get(key) {
      if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] };
      throw new Error('not found: ' + key);
    },
    async set(key, value) { backing[key] = value; }
  };
  const context = {
    console, Date, Math, JSON, Object, Array,
    storage, __backing: backing,
    DATA: opts.data || [],
    saveDataCalls: []
  };
  context.saveData = () => { context.saveDataCalls.push(Date.now()); };
  context.markSyncDirty = async () => {};
  context.pushToFirebase = () => {};
  // Bloco B — saveLesionRevisions() (dentro do moduleSource) chama estas 3
  // funções (dirty-tracking/push incremental); vivem fora deste slice do
  // módulo — stub no-op, mesmo espírito de markSyncDirty acima.
  context.markLesionReviewDirty = () => {};
  context.persistDirtyLesionReviewIds = async () => {};
  context.pushLesionReviewsIncremental = () => {};
  vm.createContext(context);
  vm.runInContext(moduleSource, context, { filename: 'ai-solution-pipeline-module.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', context);
  return context;
}

function readGlobal(context, name) {
  return vm.runInContext(name, context);
}
function serialize(x) {
  return JSON.parse(JSON.stringify(x));
}
function makeLesion(overrides) {
  return Object.assign({
    id: 'seed_1', name: 'Adamantinoma', s: 'Musculoesquelético', site: 'Tíbia',
    tags: ['lítica', 'excêntrica'], notes: 'lesão óssea benigna clássica',
    classification: null, enTerm: 'adamantinoma', clinicalTags: [], img: '', images: [], links: []
  }, overrides || {});
}
// Fingerprint canônico de DATA (chaves ordenadas; arrays mantêm ordem) — mesma
// técnica usada pelo resto do projeto (ver computeDeterministicFingerprint em
// index.html) pra provar "nenhuma mudança semântica", sem reinventar outra.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}
function dataFingerprint(ctx) {
  return JSON.stringify(canonicalize(readGlobal(ctx, 'DATA')));
}

// Provider determinístico de teste: um mapa reviewId -> resultado completo
// (ou uma função reviewId -> resultado), nunca inventa nada fora do script do
// teste. Serve de "provider real" simulado — mesma interface
// (analyzeBatch(packet) -> Promise<{results}>) que um adapter de verdade usaria.
function scriptedProvider(mapOrFn, opts) {
  opts = opts || {};
  return {
    async analyzeBatch(packet) {
      if (opts.throwOnCall) throw new Error(opts.throwOnCall);
      const reviews = (packet && Array.isArray(packet.reviews)) ? packet.reviews : [];
      const results = [];
      for (const r of reviews) {
        const spec = typeof mapOrFn === 'function' ? mapOrFn(r.reviewId, r) : mapOrFn[r.reviewId];
        if (spec === undefined) continue; // simula provider que "esquece" uma revisão
        if (Array.isArray(spec)) results.push(...spec); // permite duplicar/forjar de propósito no teste
        else results.push(spec);
      }
      if (opts.extraRaw) results.push(...opts.extraRaw);
      return { results };
    }
  };
}

// ===========================================================================
// SEGURANÇA ESTÁTICA — nenhuma função do pipeline referencia execução/DATA.
// ===========================================================================
test('SEGURANÇA ESTÁTICA: pipeline nunca referencia funções de execução nem DATA', () => {
  const forbiddenCalls = [
    'authorizeAndApplyReviewSolution(', 'approveAppliedReviewSolution(',
    'rollbackAppliedReviewSolution(', 'executeStructuralPlan(', 'rollbackStructuralExecution(',
    'createLesionReview(', 'importReviewAiSolution(', 'processReviewAiBatchItem('
  ];
  const pipelineFns = [
    'runAiSolutionPipeline', 'applyAiPipelineResultToReview',
    'selectEligibleReviewsForAiPipeline', 'setReviewNoChangeSolution', 'confirmNoChangeReviewSolution'
  ];
  for (const name of pipelineFns) {
    const body = extractFn(moduleSource, name);
    assert.doesNotMatch(body, /\bDATA\b/, name + '() não deveria referenciar DATA');
    for (const forbidden of forbiddenCalls) {
      assert.ok(!body.includes(forbidden), name + '() não pode chamar ' + forbidden);
    }
  }
});

// ===========================================================================
// A) APPLY: pending -> proposed; DATA idêntico.
// ===========================================================================
test('A) APPLY: pending -> proposed via setReviewSolution (nunca authorize); DATA idêntico antes/depois', async () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const created = ctx.createLesionReview('seed_1', 'tags incompletas');
  const before = dataFingerprint(ctx);

  const provider = scriptedProvider({
    [created.review.id]: { reviewId: created.review.id, result: 'apply', summary: 's', reasoning: 'r', proposedChanges: { tags: ['lítica', 'excêntrica', 'expansiva'] } }
  });
  const res = await ctx.runAiSolutionPipeline({ provider });

  assert.equal(res.ok, true);
  assert.equal(res.total, 1);
  assert.equal(res.proposed, 1);
  const review = readGlobal(ctx, 'LESION_REVISIONS')[created.review.id];
  assert.equal(review.status, 'proposed');
  assert.deepEqual(serialize(review.solution.proposedChanges), { tags: ['lítica', 'excêntrica', 'expansiva'] });
  assert.equal(review.solution.kind, undefined, 'apply normal não carrega kind no_change');
  assert.equal(dataFingerprint(ctx), before, 'DATA não pode ter mudado');
  assert.equal(ctx.saveDataCalls.length, 0, 'saveData() nunca deveria ter sido chamado — nenhuma rota de execução foi acionada');
});

// ===========================================================================
// B) NO_CHANGE: pending -> proposed (kind no_change); aparece em SOLUÇÕES; DATA idêntico.
// ===========================================================================
test('B) NO_CHANGE: pending -> proposed (kind no_change), aparece em getProposedSolutions(); DATA idêntico', async () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const created = ctx.createLesionReview('seed_1', 'possível lacuna');
  const before = dataFingerprint(ctx);

  const provider = scriptedProvider({
    [created.review.id]: { reviewId: created.review.id, result: 'no_change', summary: 'sem lacuna real', reasoning: 'notas já completas' }
  });
  const res = await ctx.runAiSolutionPipeline({ provider });

  assert.equal(res.noChange, 1);
  const review = readGlobal(ctx, 'LESION_REVISIONS')[created.review.id];
  assert.equal(review.status, 'proposed');
  assert.equal(review.solution.kind, 'no_change');
  assert.deepEqual(serialize(review.solution.proposedChanges), {});
  const proposed = ctx.getProposedSolutions();
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].id, created.review.id);
  assert.equal(dataFingerprint(ctx), before);
  assert.equal(ctx.saveDataCalls.length, 0);
});

// ===========================================================================
// C) Confirmação HUMANA de NO_CHANGE: encerra a revisão; DATA continua idêntico.
// ===========================================================================
test('C) confirmação humana de NO_CHANGE encerra a revisão (accepted); rejeição reabre pendente; DATA idêntico nos dois casos', async () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const created = ctx.createLesionReview('seed_1', 'possível lacuna');
  ctx.setReviewNoChangeSolution(created.review.id, 'sem lacuna', { summary: 's', reasoning: 'r' });
  const before = dataFingerprint(ctx);

  const confirmed = ctx.confirmNoChangeReviewSolution(created.review.id);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.review.status, 'accepted');
  assert.equal(dataFingerprint(ctx), before);
  assert.equal(ctx.saveDataCalls.length, 0, 'confirmar no_change nunca pode chamar saveData()');

  // Caminho de rejeição (reutiliza rejectProposedReviewSolution já existente): volta pra pendentes.
  const ctx2 = buildTestContext({ data: [makeLesion()] });
  const created2 = ctx2.createLesionReview('seed_1', 'possível lacuna');
  ctx2.setReviewNoChangeSolution(created2.review.id, 'sem lacuna', { summary: 's', reasoning: 'r' });
  const rejected = ctx2.rejectProposedReviewSolution(created2.review.id, 'quero reavaliar');
  assert.equal(rejected.ok, true);
  assert.equal(rejected.review.status, 'rejected');
  assert.equal(ctx2.getPendingReviews().some(r => r.id === created2.review.id), true, 'rejected volta pra fila de pendentes');
  assert.equal(ctx2.saveDataCalls.length, 0);
});

// Confirmar só funciona em proposta kind no_change — nunca em proposta normal nem em qualquer outro status.
test('C2) confirmNoChangeReviewSolution recusa proposta normal e qualquer status fora de "proposed/no_change"', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(created.review.id, 'troca de tag', { tags: ['a'] });
  const res = ctx.confirmNoChangeReviewSolution(created.review.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_no_change_proposal');
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[created.review.id].status, 'proposed', 'proposta normal não pode ser afetada');
});

// ===========================================================================
// D) MANUAL_ACTION_REQUIRED: fica disponível pra decisão humana; DATA idêntico.
// ===========================================================================
test('D) MANUAL_ACTION_REQUIRED: fica em getManualActionSolutions(), nunca executa; DATA idêntico', async () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const created = ctx.createLesionReview('seed_1', 'precisa mover de seção');
  const before = dataFingerprint(ctx);

  const provider = scriptedProvider({
    [created.review.id]: { reviewId: created.review.id, result: 'manual_action_required', summary: 's', reasoning: 'r', manualAction: { type: 'other', description: 'exige edição manual' } }
  });
  const res = await ctx.runAiSolutionPipeline({ provider });

  assert.equal(res.needsHumanReview, 1);
  const review = readGlobal(ctx, 'LESION_REVISIONS')[created.review.id];
  assert.equal(review.status, 'manual_action_required');
  assert.equal(ctx.getManualActionSolutions().some(r => r.id === created.review.id), true);
  assert.equal(dataFingerprint(ctx), before);
  assert.equal(ctx.saveDataCalls.length, 0);
});

// ===========================================================================
// E) Geração de (até) 20 propostas: nenhuma chamada a execução, nenhuma
//    mutação de DATA — prova comportamental (não só estática).
// ===========================================================================
test('E) lote de 20: nenhuma chamada a authorize/execução estrutural; nenhuma mutação de DATA (fingerprint idêntico)', async () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const reviews = [];
  for (let i = 0; i < 20; i++) reviews.push(ctx.createLesionReview('seed_1', 'pedido ' + i).review);
  const before = dataFingerprint(ctx);

  let calls = 0;
  const provider = scriptedProvider((reviewId) => {
    calls++;
    const mod = calls % 3;
    if (mod === 0) return { reviewId, result: 'apply', summary: 's', reasoning: 'r', proposedChanges: { notes: 'nota revisada ' + calls } };
    if (mod === 1) return { reviewId, result: 'no_change', summary: 's', reasoning: 'r' };
    return { reviewId, result: 'manual_action_required', summary: 's', reasoning: 'r', manualAction: { type: 'other' } };
  });
  const res = await ctx.runAiSolutionPipeline({ provider });

  assert.equal(res.total, 20);
  assert.equal(res.proposed + res.noChange + res.needsHumanReview + res.errors, 20);
  assert.equal(dataFingerprint(ctx), before, 'DATA precisa estar byte-a-byte idêntico');
  assert.equal(ctx.saveDataCalls.length, 0, 'nenhuma chamada a saveData() — prova que nenhuma rota de execução/DATA foi acionada');
  // nenhuma revisão chegou a applied_pending_validation/accepted (só authorize/approve levam lá)
  const statuses = reviews.map(r => readGlobal(ctx, 'LESION_REVISIONS')[r.id].status);
  assert.ok(statuses.every(s => s === 'proposed' || s === 'manual_action_required'));
});

test('E2) 25 elegíveis -> no máximo 20 propostas nesta rodada; as 5 restantes continuam pending', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const reviews = [];
  for (let i = 0; i < 25; i++) reviews.push(ctx.createLesionReview('seed_1', 'pedido ' + i).review);
  const provider = scriptedProvider((reviewId) => ({ reviewId, result: 'no_change', summary: 's', reasoning: 'r' }));
  const res = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(res.total, 20, 'limite absoluto de 20 mesmo com 25 elegíveis');
  const stillPending = ctx.getPendingReviews().filter(r => r.status === 'pending');
  assert.equal(stillPending.length, 5, 'as 5 que não entraram no lote continuam pending, intocadas');
});

// ===========================================================================
// Reprocessamento: não duplica, idempotente.
// ===========================================================================
test('G) reprocessamento: revisão já com proposta não é selecionada de novo (sem duplicar)', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x');
  const provider = scriptedProvider({ [created.review.id]: { reviewId: created.review.id, result: 'no_change', summary: 's', reasoning: 'r' } });

  const first = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(first.total, 1);
  const afterFirst = serialize(readGlobal(ctx, 'LESION_REVISIONS')[created.review.id].solution);

  const second = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(second.total, 0, 'já está "proposed" — não é elegível de novo, não duplica processamento');
  const afterSecond = serialize(readGlobal(ctx, 'LESION_REVISIONS')[created.review.id].solution);
  assert.deepEqual(afterFirst, afterSecond, 'rodar de novo não deveria alterar a proposta já registrada');
  assert.equal(Object.keys(readGlobal(ctx, 'LESION_REVISIONS')).length, 1, 'nenhuma revisão nova foi criada');
});

// ===========================================================================
// Erro em uma revisão não bloqueia as outras; preserva pendente p/ retry.
// ===========================================================================
test('erro em uma revisão não bloqueia as outras; revisão com erro continua pending (retry futuro)', async () => {
  const ctx = buildTestContext({ data: [makeLesion({ id: 'seed_1' }), makeLesion({ id: 'seed_2', name: 'Outra' })] });
  const r1 = ctx.createLesionReview('seed_1', 'x').review;
  const r2 = ctx.createLesionReview('seed_2', 'y').review;
  const provider = scriptedProvider({
    [r1.id]: { reviewId: r1.id, result: 'apply', summary: 's', reasoning: 'r', proposedChanges: { images: [] } }, // campo proibido -> erro
    [r2.id]: { reviewId: r2.id, result: 'no_change', summary: 's', reasoning: 'r' }
  });
  const res = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(res.errors, 1);
  assert.equal(res.noChange, 1);
  const rev1 = readGlobal(ctx, 'LESION_REVISIONS')[r1.id];
  assert.equal(rev1.status, 'pending', 'erro preserva a revisão pendente pra uma tentativa futura');
  assert.equal(rev1.aiPipeline.state, 'ai_error');
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[r2.id].status, 'proposed', 'a outra não foi bloqueada pelo erro da primeira');
});

test('provider que lança excessão: todas as elegíveis ficam ai_error, nenhuma trava, DATA idêntico', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const r1 = ctx.createLesionReview('seed_1', 'x').review;
  const before = dataFingerprint(ctx);
  const provider = scriptedProvider({}, { throwOnCall: 'provider indisponível' });
  const res = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'provider_error');
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[r1.id].status, 'pending');
  assert.equal(dataFingerprint(ctx), before);
  assert.equal(ctx.saveDataCalls.length, 0);
});

// ===========================================================================
// resposta com reviewId desconhecido -> rejeitada; duplicada -> normalizada.
// ===========================================================================
test('resposta com reviewId desconhecido é rejeitada e não afeta nenhuma revisão real', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const r1 = ctx.createLesionReview('seed_1', 'x').review;
  const provider = scriptedProvider({ [r1.id]: { reviewId: r1.id, result: 'no_change', summary: 's', reasoning: 'r' } },
    { extraRaw: [{ reviewId: 'lrev_nao_existe_999', result: 'apply', proposedChanges: { notes: 'forjado' } }] });
  const res = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(res.noChange, 1);
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')['lrev_nao_existe_999'], undefined, 'reviewId desconhecido nunca pode criar uma revisão');
  assert.ok(res.results.some(x => x.reviewId === 'lrev_nao_existe_999' && x.outcome === 'rejected' && x.reason === 'review_id_not_in_batch'));
});

test('resposta duplicada para o mesmo reviewId: só a 1ª é honrada, a 2ª é rejeitada', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const r1 = ctx.createLesionReview('seed_1', 'x').review;
  const provider = scriptedProvider({
    [r1.id]: [
      { reviewId: r1.id, result: 'no_change', summary: 'primeira', reasoning: 'r' },
      { reviewId: r1.id, result: 'apply', summary: 'segunda', reasoning: 'r', proposedChanges: { notes: 'não deveria aplicar' } }
    ]
  });
  const res = await ctx.runAiSolutionPipeline({ provider });
  const review = readGlobal(ctx, 'LESION_REVISIONS')[r1.id];
  assert.equal(review.status, 'proposed');
  assert.equal(review.solution.kind, 'no_change', 'a 1ª resposta (no_change) venceu; a 2ª foi rejeitada');
  assert.ok(res.results.some(x => x.outcome === 'rejected' && x.reason === 'duplicate_review_id'));
});

// ===========================================================================
// F) reload e "segundo PC": propostas sobrevivem e sincronizam via
//    LESION_REVISIONS (mesmo mecanismo já usado por REVIEW/SRS).
// ===========================================================================
test('F) reload: propostas geradas pelo pipeline sobrevivem a salvar + recarregar o módulo do zero', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x').review;
  const provider = scriptedProvider({ [created.id]: { reviewId: created.id, result: 'no_change', summary: 's', reasoning: 'r' } });
  await ctx.runAiSolutionPipeline({ provider });
  await ctx.saveLesionRevisions();
  assert.ok(ctx.__backing['atlas:lesionRevisions']);

  const sharedBacking = ctx.__backing;
  const ctx2 = {
    console, Date, Math, JSON, Object, Array,
    DATA: [], saveDataCalls: [], __backing: sharedBacking,
    storage: {
      async get(key) { if (Object.prototype.hasOwnProperty.call(sharedBacking, key)) return { value: sharedBacking[key] }; throw new Error('not found: ' + key); },
      async set(key, value) { sharedBacking[key] = value; }
    }
  };
  ctx2.saveData = () => { ctx2.saveDataCalls.push(Date.now()); };
  vm.createContext(ctx2);
  vm.runInContext(moduleSource, ctx2, { filename: 'ai-solution-pipeline-module-reload.js' });
  await ctx2.loadLesionRevisions();

  const reloaded = readGlobal(ctx2, 'LESION_REVISIONS')[created.id];
  assert.equal(reloaded.status, 'proposed');
  assert.equal(reloaded.solution.kind, 'no_change');
  assert.equal(ctx2.getProposedSolutions().length, 1, '"segundo PC" (mesmo storage) vê a proposta sem reprocessar nada');
});

// ===========================================================================
// nenhuma chamada à execução estrutural durante geração/importação (checagem
// comportamental complementar à estática do topo do arquivo).
// ===========================================================================
test('nenhuma chamada à execução estrutural durante a geração (executeStructuralPlan/rollbackStructuralExecution nunca são necessárias no contexto)', async () => {
  // Contexto SEM essas funções: se o pipeline as chamasse, o run lançaria
  // ReferenceError e o teste falharia.
  const ctx = buildTestContext({ data: [makeLesion()] });
  assert.equal(readGlobal(ctx, 'typeof executeStructuralPlan'), 'undefined');
  const created = ctx.createLesionReview('seed_1', 'x').review;
  const provider = scriptedProvider({ [created.id]: { reviewId: created.id, result: 'apply', summary: 's', reasoning: 'r', proposedChanges: { notes: 'ok' } } });
  const res = await ctx.runAiSolutionPipeline({ provider });
  assert.equal(res.ok, true, 'rodou sem precisar de nenhuma função de execução estrutural no contexto');
});

// ===========================================================================
// ETAPA H — mock NUNCA é o default de produção; provider real é opt-in puro.
// ===========================================================================
test('H1) REVIEW_AI_PIPELINE_PROVIDER é null por padrão (mock nunca ligado em produção)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  assert.equal(readGlobal(ctx, 'REVIEW_AI_PIPELINE_PROVIDER'), null);
  assert.equal(ctx.isAiPipelineProviderConfigured(), false);
});

test('H2) sem provider configurado (nem default, nem opts.provider): recusa sem tocar em nada', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x').review;
  const before = dataFingerprint(ctx);
  const res = await ctx.runAiSolutionPipeline({}); // nenhum provider passado, default é null
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_provider_configured');
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[created.id].status, 'pending', 'nada foi selecionado/processado');
  assert.equal(dataFingerprint(ctx), before);
  assert.equal(ctx.saveDataCalls.length, 0);
});

test('H3) provider mock (REVIEW_AI_MOCK_PROVIDER), passado EXPLICITAMENTE (uso de teste/dev), nunca inventa conteúdo clínico', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x').review;
  const res = await ctx.runAiSolutionPipeline({ provider: readGlobal(ctx, 'REVIEW_AI_MOCK_PROVIDER') });
  assert.equal(res.ok, true);
  assert.equal(res.noChange, 1);
  const review = readGlobal(ctx, 'LESION_REVISIONS')[created.id];
  assert.match(review.solution.reasoning, /sem IA real|nenhuma mudança foi inventada/i);
});

test('H4) reentrância: uma 2ª chamada enquanto a 1ª ainda está em voo é recusada (sem reprocessar/duplicar)', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x').review;
  let releaseFirst;
  const slowProvider = {
    analyzeBatch: (packet) => new Promise((resolve) => {
      releaseFirst = () => resolve({ results: packet.reviews.map(r => ({ reviewId: r.reviewId, result: 'no_change', summary: 's', reasoning: 'r' })) });
    })
  };
  const firstCall = ctx.runAiSolutionPipeline({ provider: slowProvider });
  // dá tempo da 1ª chamada marcar "processing" e travar a reentrância antes da 2ª.
  await new Promise((r) => setTimeout(r, 10));
  const second = await ctx.runAiSolutionPipeline({ provider: slowProvider });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_running');
  releaseFirst();
  const first = await firstCall;
  assert.equal(first.ok, true);
  assert.equal(first.noChange, 1);
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[created.id].status, 'proposed', 'só a 1ª chamada processou a revisão, nunca duas vezes');
});

test('H5) revisão com aiPipeline.state="processing" (lote anterior inacabado) não é reselecionada', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const created = ctx.createLesionReview('seed_1', 'x').review;
  const review = readGlobal(ctx, 'LESION_REVISIONS')[created.id];
  review.aiPipeline = { state: 'processing', batchId: 'aibatch_antigo' };
  const eligible = ctx.selectEligibleReviewsForAiPipeline(20);
  assert.ok(eligible.every(r => r.id !== created.id), 'revisão marcada como em andamento não pode ser reprocessada');
});

// ===========================================================================
// Escopo V1: pendência global nunca é selecionada (fora de escopo desta etapa).
// ===========================================================================
test('escopo V1: pendência GLOBAL nunca é selecionada pelo pipeline automático', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const global = ctx.createReviewRequest({ scope: 'global', requestText: 'auditoria geral' });
  const lesionReview = ctx.createLesionReview('seed_1', 'x').review;
  const eligible = ctx.selectEligibleReviewsForAiPipeline(20);
  assert.ok(eligible.every(r => r.id !== global.review.id));
  assert.ok(eligible.some(r => r.id === lesionReview.id));
});
