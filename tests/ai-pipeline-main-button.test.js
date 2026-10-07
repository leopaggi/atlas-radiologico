'use strict';

/* Etapa H — prova de que o botão PRINCIPAL "🤖 Analisar pendências com IA"
 * (modal de Pendentes) e o botão da aba Soluções chamam SEMPRE o pipeline
 * automático (runAiSolutionPipeline via wireAiPipelineRunButton), NUNCA o
 * modal manual antigo (openReviewAiBatchModal) — que continua existindo
 * só no botão secundário "📋 preparar manualmente" (fallback, não apagado).
 *
 * Duas camadas, como o resto do projeto:
 *  1) ESTÁTICA — no corpo real de openPendingReviewsModal extraído do
 *     index.html: o botão principal (#ai-pipeline-run) é ligado por
 *     wireAiPipelineRunButton(); openReviewAiBatchModal só aparece colado
 *     ao botão secundário (#pending-reviews-batch-ai-manual); o fallback
 *     manual continua presente (nada foi apagado).
 *  2) COMPORTAMENTAL — wireAiPipelineRunButton() real, executado com um
 *     botão/status falsos mínimos: clicar chama runAiSolutionPipeline
 *     (nunca abre o modal manual), gera proposta real em LESION_REVISIONS,
 *     e DATA permanece idêntico (fingerprint + saveDataCalls===0).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  let depth = 0;
  let i = source.indexOf('{', m.index);
  const start = i;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return { source: source.slice(m.index < start ? m.index : start, i + 1), body: source.slice(start + 1, i) };
}

// ===========================================================================
// 1) ESTÁTICA
// ===========================================================================
const pendingModalFn = extractFn(html, 'openPendingReviewsModal');

test('ESTÁTICO: botão principal usa wireAiPipelineRunButton (pipeline automático), nunca abre o modal manual diretamente', () => {
  const body = pendingModalFn.body;
  assert.match(body, /wireAiPipelineRunButton\(\s*batchBtn\s*,/, 'o botão principal (batchBtn, #ai-pipeline-run) precisa ser ligado por wireAiPipelineRunButton');
  // openReviewAiBatchModal só pode aparecer associado ao botão SECUNDÁRIO (manualBtn).
  const batchBtnBlockMatches = body.match(/batchBtn\.onclick\s*=[^;]*;/g) || [];
  for (const line of batchBtnBlockMatches) {
    assert.doesNotMatch(line, /openReviewAiBatchModal/, 'o botão principal não pode abrir o modal manual: ' + line);
  }
  assert.match(body, /manualBtn\.onclick\s*=\s*\(\)\s*=>\s*openReviewAiBatchModal\(renderList\)/,
    'o fluxo manual antigo precisa continuar existindo, só no botão secundário');
});

test('ESTÁTICO: fallback manual não foi apagado (botão "preparar manualmente" presente, com aviso de fallback)', () => {
  assert.match(html, /id="pending-reviews-batch-ai-manual"/);
  const i = html.indexOf('id="pending-reviews-batch-ai-manual"');
  const around = html.slice(Math.max(0, i - 200), i + 300);
  assert.match(around, /preparar manualmente/);
});

test('ESTÁTICO: botão principal usa o id compartilhado com Soluções (ai-pipeline-run) — mesma disponibilidade/health-check', () => {
  assert.match(pendingModalFn.body, /ov\.querySelector\('#ai-pipeline-run'\)/);
});

// ===========================================================================
// 2) COMPORTAMENTAL — wireAiPipelineRunButton() real + runAiSolutionPipeline() real.
// ===========================================================================
const MODULE_START = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSource = html.slice(html.indexOf(MODULE_START), html.indexOf(MODULE_END, html.indexOf(MODULE_START)));
const wireFn = extractFn(html, 'wireAiPipelineRunButton');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function buildCtx(lesions) {
  const backing = {};
  const storage = {
    async get(k) { if (Object.prototype.hasOwnProperty.call(backing, k)) return { value: backing[k] }; throw new Error('nf'); },
    async set(k, v) { backing[k] = v; }
  };
  let openReviewAiBatchModalCalls = 0;
  const context = {
    console, Date, Math, JSON, Object, Array,
    storage, DATA: lesions, saveDataCalls: [],
    openReviewAiBatchModalCalls: 0,
    // Espião: a função manual existe no index.html real; aqui é só um espião
    // puro (o teste ESTÁTICO acima já prova que o botão principal nunca a
    // referencia — isto só confirma dinamicamente que ela não é acionada).
    openReviewAiBatchModal: null
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
  vm.runInContext(moduleSource, context, { filename: 'module.js' });
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', context);
  context.openReviewAiBatchModal = () => { context.openReviewAiBatchModalCalls++; };
  vm.runInContext(wireFn.source, context, { filename: 'wire-button.js' });
  return context;
}
function readGlobal(ctx, name) { return vm.runInContext(name, ctx); }
function dataFingerprint(ctx) { return JSON.stringify(canonicalize(readGlobal(ctx, 'DATA'))); }
function makeFakeBtn() { return { disabled: false, title: '', onclick: null }; }
function makeFakeStatusEl() { return { hidden: true, textContent: '', innerHTML: '', querySelector: () => null }; }
function scriptedProvider(mapOrFn) {
  return { async analyzeBatch(packet) {
    return { results: packet.reviews.map((r) => (typeof mapOrFn === 'function' ? mapOrFn(r.reviewId) : mapOrFn[r.reviewId])) };
  } };
}
function makeLesion() {
  return { id: 'seed_1', name: 'Entidade', s: 'S', site: 'T', notes: 'n', tags: [], classification: null, enTerm: '', clinicalTags: [], img: '', images: [], links: [] };
}

test('COMPORTAMENTAL: clicar no handler principal NUNCA abre o modal manual; chama runAiSolutionPipeline; proposta aparece; DATA idêntico', async () => {
  const ctx = buildCtx([makeLesion()]);
  const created = ctx.createLesionReview('seed_1', 'pedido real').review;
  // injeta o provider real no contexto (precisa existir como global antes do clique)
  ctx.__test_provider__ = scriptedProvider({ [created.id]: { reviewId: created.id, result: 'no_change', summary: 'sem lacuna', reasoning: 'ok' } });
  vm.runInContext('REVIEW_AI_PIPELINE_PROVIDER = __test_provider__;', ctx);

  const before = dataFingerprint(ctx);
  const btn = makeFakeBtn();
  const statusEl = makeFakeStatusEl();
  let openSolutionsCalls = 0, proposedCalls = 0;
  ctx.wireAiPipelineRunButton(btn, statusEl, {
    onOpenSolutions: () => { openSolutionsCalls++; },
    onProposed: () => { proposedCalls++; }
  });

  assert.equal(typeof btn.onclick, 'function', 'o clique precisa ter sido ligado');
  await btn.onclick();

  assert.equal(ctx.openReviewAiBatchModalCalls, 0, 'o modal manual antigo NUNCA pode ser aberto pelo handler principal');
  const review = readGlobal(ctx, 'LESION_REVISIONS')[created.id];
  assert.equal(review.status, 'proposed', 'a proposta real precisa ter sido gravada via runAiSolutionPipeline');
  assert.equal(review.solution.kind, 'no_change');
  assert.equal(proposedCalls, 1, 'onProposed precisa ter sido chamado após o lote');
  assert.match(statusEl.innerHTML, /solução\(ões\) proposta|sem alteração/, 'resumo final precisa aparecer no status');
  assert.equal(dataFingerprint(ctx), before, 'DATA precisa permanecer byte-a-byte idêntico');
  assert.equal(ctx.saveDataCalls.length, 0, 'nenhuma chamada a saveData() — nenhuma rota de execução foi acionada');
});

test('COMPORTAMENTAL: sem provider configurado, o handler recusa sem abrir o modal manual e sem tocar nada', async () => {
  const ctx = buildCtx([makeLesion()]);
  const created = ctx.createLesionReview('seed_1', 'pedido real').review;
  const before = dataFingerprint(ctx);
  const btn = makeFakeBtn();
  const statusEl = makeFakeStatusEl();
  ctx.wireAiPipelineRunButton(btn, statusEl, {});
  assert.equal(btn.disabled, true, 'sem provider, nasce desabilitado');
  assert.match(btn.title, /Servidor IA local não iniciado/);
  await btn.onclick();
  assert.equal(ctx.openReviewAiBatchModalCalls, 0);
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[created.id].status, 'pending');
  assert.equal(dataFingerprint(ctx), before);
  assert.equal(ctx.saveDataCalls.length, 0);
});
