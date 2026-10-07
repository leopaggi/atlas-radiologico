'use strict';

/* Processamento AUTOMÁTICO em lote da triagem proativa (runAutomaticTriagePipeline).
 * Existe pra resolver ~1000+ candidatas sem travar o navegador: nunca
 * renderiza/seleciona elementos DOM, opera direto sobre
 * scanCatalogForTriage(DATA) e processa em fatias de até
 * AI_PIPELINE_BATCH_LIMIT (20), criando os pedidos (createTriageReviewBatch)
 * e só então chamando runAiSolutionPipeline pra cada fatia — nunca
 * authorizeAndApplyReviewSolution/aprova/rollback/executa, nunca toca DATA.
 *
 * Carrega DOIS trechos reais do index.html no MESMO contexto vm: o módulo
 * LESION_REVISIONS (mesmo span de tests/ai-solution-pipeline.test.js) e o
 * trecho da Triagem proativa (TRIAGE_MIN_TAGS .. fim de
 * runAutomaticTriagePipeline, logo antes de openProactiveTriageModal — que é
 * puro DOM e não entra aqui). Lesões sintéticas usam notes:'' (dispara
 * notes_empty sem precisar de tokenizeExternalTitle) e classification
 * truthy (evita todo o branch de CLASSIFICATION_CONTEXT_RULES) — assim o
 * trecho da triagem funciona sem nenhuma dependência externa ao que foi
 * carregado.
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
function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador de início não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador de fim não encontrado: ' + endMarker);
  return source.slice(start, end);
}
const lesionReviewModuleSource = sliceBetween(html, MODULE_START_MARKER, MODULE_END_MARKER);
const triageModuleSource = sliceBetween(html, 'const TRIAGE_MIN_TAGS', 'function openProactiveTriageModal');
const moduleSource = lesionReviewModuleSource + '\n' + triageModuleSource;

function extractFn(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
const runAutomaticTriagePipelineSrc = extractFn(triageModuleSource, 'runAutomaticTriagePipeline');

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
  vm.createContext(context);
  vm.runInContext(moduleSource, context, { filename: 'automatic-triage-pipeline-module.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', context);
  return context;
}
function readGlobal(context, name) { return vm.runInContext(name, context); }
function serialize(x) { return JSON.parse(JSON.stringify(x)); }

function makeGappyLesion(id, overrides) {
  return Object.assign({
    id, name: 'Lesão sintética ' + id, s: 'Seção T', site: 'Sítio T',
    tags: [], notes: '', classification: 'NAO_APLICAVEL', enTerm: 'synthetic term ' + id,
    clinicalTags: [], images: []
  }, overrides);
}
function makeLesions(n) { return Array.from({ length: n }, (_v, i) => makeGappyLesion('seed_' + (i + 1))); }

// Provider determinístico — nunca inventa clinicamente, só devolve no_change
// (mesma honestidade do REVIEW_AI_MOCK_PROVIDER real); registra cada packet
// enviado pra testes de não-duplicação/limite.
function makeFakeProvider(sentPackets, opts) {
  opts = opts || {};
  let calls = 0;
  return {
    async analyzeBatch(packet) {
      calls++;
      sentPackets.push(packet.reviews.map(r => r.reviewId));
      if (opts.failOnCall === calls) throw new Error('provider falhou de propósito (teste)');
      return { results: packet.reviews.map(r => ({
        reviewId: r.reviewId, result: 'no_change',
        summary: 'Provider de teste — sem IA real.', reasoning: 'Determinístico, nunca inventa conteúdo.',
        proposedChanges: null, manualAction: null
      })) };
    }
  };
}

test('45 candidatas => processa em 20 + 20 + 5 (3 lotes, respeitando o limite de 20 por chamada)', async () => {
  const ctx = buildTestContext({ data: makeLesions(45) });
  const sentPackets = [];
  const provider = makeFakeProvider(sentPackets);
  const res = await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider });
  assert.equal(res.ok, true);
  assert.equal(res.total, 45);
  assert.equal(res.processed, 45);
  assert.deepEqual(sentPackets.map(p => p.length), [20, 20, 5]);
  assert.equal(res.batches.length, 3);
  assert.equal(res.noChange, 45);
  assert.equal(res.errors, 0);
});

test('não duplica revisões: candidata já com revisão ativa nunca entra em dois lotes nem é reprocessada numa 2ª chamada', async () => {
  const ctx = buildTestContext({ data: makeLesions(25) });
  const sentPackets = [];
  await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets) });
  const allSentIds = sentPackets.flat();
  assert.equal(new Set(allSentIds).size, allSentIds.length, 'nenhum reviewId repetido dentro da 1ª execução');
  assert.equal(allSentIds.length, 25);
  // 2ª chamada sobre o MESMO catálogo: nada mais a processar (todas já em revisão).
  const res2 = await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets) });
  assert.equal(res2.total, 0);
  assert.equal(sentPackets.flat().length, 25, 'nenhuma chamada nova ao provider na 2ª execução');
  const revisions = readGlobal(ctx, 'LESION_REVISIONS');
  assert.equal(Object.keys(revisions).length, 25, 'uma revisão por lesão, nunca duplicada');
});

test('pausa após o primeiro lote: shouldPause só é checado ENTRE lotes, nunca no meio de uma gravação', async () => {
  const ctx = buildTestContext({ data: makeLesions(45) });
  const sentPackets = [];
  let batchesSeen = 0;
  const res = await readGlobal(ctx, 'runAutomaticTriagePipeline')({
    provider: makeFakeProvider(sentPackets),
    shouldPause: () => batchesSeen >= 1,
    onProgress: (p) => { if (p.phase === 'batch_done') batchesSeen++; }
  });
  assert.equal(res.paused, true);
  assert.equal(res.processed, 20, 'só o 1º lote (20) foi processado antes da pausa');
  assert.deepEqual(sentPackets.map(p => p.length), [20]);
  const revisions = readGlobal(ctx, 'LESION_REVISIONS');
  assert.equal(Object.keys(revisions).length, 20, '1º lote ficou com revisão criada/persistida; o resto nunca foi tocado');
});

test('retoma sem repetir lote concluído: 2ª chamada após pausa processa só o restante', async () => {
  const ctx = buildTestContext({ data: makeLesions(45) });
  const sentPackets = [];
  let batchesSeen = 0;
  await readGlobal(ctx, 'runAutomaticTriagePipeline')({
    provider: makeFakeProvider(sentPackets),
    shouldPause: () => batchesSeen >= 1,
    onProgress: (p) => { if (p.phase === 'batch_done') batchesSeen++; }
  });
  const res2 = await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets) });
  assert.equal(res2.paused, false);
  assert.equal(res2.total, 25, 'só as 25 restantes (45-20) aparecem como candidatas na retomada');
  assert.deepEqual(sentPackets.map(p => p.length), [20, 20, 5], 'retomada processa 20+5, nunca repete o lote 1 de 20');
  const allSentIds = sentPackets.flat();
  assert.equal(new Set(allSentIds).size, 45, 'as 45 lesões são cobertas uma única vez cada, somando as duas chamadas');
});

test('erro no lote 2 preserva o lote 1 (propostas/no_change já persistidas) e não tenta reprocessar automaticamente', async () => {
  const ctx = buildTestContext({ data: makeLesions(45) });
  const sentPackets = [];
  const res = await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets, { failOnCall: 2 }) });
  assert.equal(res.ok, true);
  assert.equal(res.stoppedOnError, true);
  assert.equal(res.processed, 40, 'lote 1 (20) concluído + lote 2 (20) com pedidos criados antes do erro do provider');
  assert.equal(res.batches.length, 2);
  assert.equal(res.batches[0].ai.ok, true);
  assert.equal(res.batches[1].ai.ok, false);
  const revisions = readGlobal(ctx, 'LESION_REVISIONS');
  const statuses = Object.values(revisions).map(r => r.status);
  assert.equal(statuses.filter(s => s === 'proposed').length, 20, 'lote 1 inteiro ficou "proposed" (no_change vira proposed+kind no_change)');
  assert.equal(statuses.filter(s => s === 'pending').length, 20, 'lote 2 teve os PEDIDOS criados (pending), mas a IA nunca rodou neles — preservados, não perdidos');
  // nova chamada não dispara automaticamente o reprocessamento do lote 2 sozinha fora deste teste;
  // aqui só confirmamos que esta execução parou e não tentou de novo em loop.
  assert.equal(sentPackets.length, 2, 'só 2 chamadas ao provider nesta execução — nunca tentativa repetida do lote que falhou');
});

test('DATA permanece bit-a-bit idêntica durante e depois do processamento automático', async () => {
  const data = makeLesions(45);
  const ctx = buildTestContext({ data });
  const before = serialize(readGlobal(ctx, 'DATA'));
  await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider([]) });
  const after = serialize(readGlobal(ctx, 'DATA'));
  assert.deepEqual(after, before);
  assert.equal(ctx.saveDataCalls.length, 0, 'saveData nunca é chamado pelo pipeline automático — só LESION_REVISIONS muda');
});

test('nenhuma autorização automática: a execução real nunca autoriza/aplica/executa — resultado fica em "proposed"/"pending", nunca "applied_pending_validation" nem lesão alterada', async () => {
  const ctx = buildTestContext({ data: makeLesions(5) });
  await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider([]) });
  const revisions = readGlobal(ctx, 'LESION_REVISIONS');
  for (const r of Object.values(revisions)) {
    assert.notEqual(r.status, 'applied_pending_validation');
    assert.notEqual(r.status, 'accepted');
  }
});

test('ESTÁTICO: runAutomaticTriagePipeline nunca referencia execução/autorização/DATA/SEED no código-fonte', () => {
  for (const forbidden of ['authorizeAndApplyReviewSolution', 'approveAppliedReviewSolution', 'rollbackAppliedReviewSolution',
    'executeStructuralPlan', 'rollbackStructuralExecution', 'importReviewAiSolution', 'processReviewAiBatchItem']) {
    assert.doesNotMatch(runAutomaticTriagePipelineSrc, new RegExp(forbidden));
  }
  assert.doesNotMatch(runAutomaticTriagePipelineSrc, /\bDATA\s*[.\[]/, 'nunca referencia DATA diretamente (só via scanCatalogForTriage(DATA) recebido de fora)');
  assert.doesNotMatch(runAutomaticTriagePipelineSrc, /\bSEED\b/);
});

test('ESTÁTICO: nenhuma identidade seed_N é usada para controle de progresso (checkpoint é só LESION_REVISIONS persistido)', () => {
  assert.doesNotMatch(runAutomaticTriagePipelineSrc, /seed_\d/i);
  assert.doesNotMatch(runAutomaticTriagePipelineSrc, /localStorage|sessionStorage/, 'nenhum estado de progresso novo fora de LESION_REVISIONS');
});

test('nenhuma chamada duplicada de provider para revisão já proposed/no_change — cada reviewId aparece em no máximo 1 packet em toda a execução', async () => {
  const ctx = buildTestContext({ data: makeLesions(45) });
  const sentPackets = [];
  await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets) });
  const seen = new Set();
  for (const ids of sentPackets) {
    for (const id of ids) {
      assert.ok(!seen.has(id), 'reviewId enviado duas vezes ao provider: ' + id);
      seen.add(id);
    }
  }
  assert.equal(seen.size, 45);
});

test('limite de 20 por chamada ao provider é respeitado mesmo pedindo um batchSize maior', async () => {
  const ctx = buildTestContext({ data: makeLesions(25) });
  const sentPackets = [];
  const res = await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets), batchSize: 999 });
  assert.equal(res.ok, true);
  assert.deepEqual(sentPackets.map(p => p.length), [20, 5], 'batchSize pedido (999) é sempre limitado a AI_PIPELINE_BATCH_LIMIT (20)');
});

test('reentrância: duas chamadas concorrentes — a 2ª é recusada sem tocar nada enquanto a 1ª está em voo', async () => {
  const ctx = buildTestContext({ data: makeLesions(25) });
  const sentPackets = [];
  const p1 = readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets) });
  const res2 = await readGlobal(ctx, 'runAutomaticTriagePipeline')({ provider: makeFakeProvider(sentPackets) });
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'already_running');
  const res1 = await p1;
  assert.equal(res1.ok, true);
});

// ===========================================================================
// UI leve (openAutomaticTriagePipelineModal) — nunca cria 1000+ elementos DOM.
// Só verificação ESTÁTICA do código-fonte real (função fortemente dependente
// de document/overlay; mesma técnica já usada pra funções de UI pesadas em
// tests/manual-action-ai-export.test.js).
// ===========================================================================
const uiModalSrc = extractFn(html, 'openAutomaticTriagePipelineModal');

test('ESTÁTICO: openAutomaticTriagePipelineModal nunca monta um elemento por candidata (DOM fixo, O(1) independente do total)', () => {
  assert.doesNotMatch(uiModalSrc, /\.map\(\s*c\s*=>/, 'nenhum .map sobre candidatas construindo HTML/linhas');
  assert.doesNotMatch(uiModalSrc, /candidates\s*\.\s*(map|forEach)/, 'nunca itera a lista de candidatas pra criar nós');
  assert.match(uiModalSrc, /scanCatalogForTriage\(DATA\)\.length/, 'só lê o total (número), nunca a lista inteira pra renderizar');
  assert.match(uiModalSrc, /runAutomaticTriagePipeline\(/, 'aciona o orquestrador de dados, não reimplementa nada');
});

test('ESTÁTICO: botão "Pausar" só sinaliza shouldPause (nunca interrompe no meio de um lote) e nunca chama runAiSolutionPipeline/createTriageReviewBatch diretamente', () => {
  assert.match(uiModalSrc, /pausedRequested\s*=\s*true/);
  assert.doesNotMatch(uiModalSrc, /runAiSolutionPipeline\(|createTriageReviewBatch\(/, 'só runAutomaticTriagePipeline orquestra isso — a UI nunca chama as peças internas direto');
});

test('ESTÁTICO: openProactiveTriageModal (fluxo manual) continua existindo e intacta — nenhuma função duplicada criada', () => {
  assert.match(html, /function openProactiveTriageModal\(onCreated\)\{/);
  assert.match(html, /id="pending-reviews-auto-triage"/, 'novo botão foi adicionado ao lado do manual, não substituindo-o');
  assert.match(html, /id="pending-reviews-triage"/, 'botão manual "Triagem proativa" continua existindo');
});
