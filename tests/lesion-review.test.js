'use strict';

/* Testes essenciais da Central de Revisões + Soluções (LESION_REVISIONS),
 * incluindo a máquina de estados de dois aceites (proposta -> autorizar ->
 * aplicar -> aprovar/desfazer). Carrega o trecho REAL do index.html (não
 * uma cópia reescrita das funções) num contexto `vm` isolado, com um
 * `storage` falso em memória no lugar do IndexedDB real, um array `DATA`
 * de teste e um `saveData` falso (só registra chamadas). Nenhum teste aqui
 * acessa IndexedDB, Firebase, Firestore, Cloudinary ou rede.
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

test('PARSE LOTE: JSON completo com results, BOM, bordas invisíveis e code fence', () => {
  const ctx = buildTestContext();
  const json = '{"results":[]}';
  for (const text of [json, '\uFEFF'+json, '\u200B\u200C '+json+' \u200D\u2060',
    '```json\n'+json+'\n```', '```\r\n'+json+'\r\n```',
    '\u200B\uFEFF ```JSON\n\u200B'+json+'\u2060\n``` \u200D']) {
    const result = ctx.importReviewAiBatch(text);
    assert.equal(result.ok, true, 'deve aceitar somente a moldura externa: '+JSON.stringify(text));
    assert.equal(result.summary.processed, 0);
  }
});

test('PARSE LOTE: JSON inválido devolve diagnóstico de posição SEM expor o conteúdo', () => {
  const ctx = buildTestContext();
  const res = ctx.importReviewAiBatch('{"results":[{"reviewId":"lrev_segredo_do_usuario",}]}');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid_json');
  assert.ok(res.parseError, 'precisa devolver parseError');
  assert.ok(res.parseError.position > 0 || res.parseError.kind === 'syntax');
  const msg = ctx.formatReviewAiBatchParseError(res.parseError);
  assert.match(msg, /Não foi possível interpretar o JSON/);
  assert.match(msg, /Nenhuma revisão foi processada/);
  assert.doesNotMatch(msg, /segredo_do_usuario/, 'a mensagem não pode vazar o texto colado');
  assert.doesNotMatch(JSON.stringify(res.parseError), /segredo_do_usuario/);
});

test('PARSE LOTE: documento truncado e vazio são detectados', () => {
  const ctx = buildTestContext();
  const trunc = ctx.importReviewAiBatch('{"results":[');
  assert.equal(trunc.reason, 'invalid_json');
  assert.equal(trunc.parseError.kind, 'incomplete');
  const empty = ctx.importReviewAiBatch('   ');
  assert.equal(empty.reason, 'invalid_json');
  assert.equal(empty.parseError.kind, 'empty');
});

test('PARSE LOTE: só a moldura externa é tratada — conteúdo INTERNO é preservado', () => {
  const ctx = buildTestContext();
  // Uma string interna com BOM, newlines e ``` NÃO pode ser alterada/removida.
  const parsed = ctx.parseReviewAiBatchJson('```json\n{"results":[{"reviewId":"a","summary":"linha1\\n```\\nlinha2"}]}\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.results[0].summary, 'linha1\n```\nlinha2');
});

test('PARSE LOTE: não faz extração "do primeiro { ao último }" (texto ao redor continua inválido)', () => {
  const ctx = buildTestContext();
  const withProse = ctx.importReviewAiBatch('Claro! Aqui está:\n{"results":[]}\nEspero ter ajudado.');
  assert.equal(withProse.ok, false, 'texto fora do JSON não pode ser aceito por recorte');
  const fenceWithProse = ctx.importReviewAiBatch('```json\n{"results":[]}\n```\nqualquer coisa');
  assert.equal(fenceWithProse.ok, false, 'fechamento com texto depois não é moldura pura');
});

test('PARSE LOTE: validação semântica NÃO foi afrouxada (campo proibido continua rejeitado)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const r = ctx.createLesionReview('seed_1', 'x').review;
  const doc = '```json\n' + JSON.stringify({ results: [{ reviewId: r.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { images: [] } }] }) + '\n```';
  const res = ctx.importReviewAiBatch(doc);
  assert.equal(res.ok, true, 'a moldura é aceita');
  assert.equal(res.summary.failed, 1, 'mas o campo proibido continua falhando o item');
  assert.equal(res.items[0].detail, 'forbidden_field:images');
  assert.equal(r.status, 'pending');
});

test('PARSE LOTE: lote válido dentro de code fence é processado normalmente', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const r = ctx.createLesionReview('seed_1', 'x').review;
  const doc = '```json\n' + JSON.stringify({ results: [{ reviewId: r.id, result: 'no_change', summary: 'ok', reasoning: 'ok', proposedChanges: {} }] }) + '\n```';
  const res = ctx.importReviewAiBatch(doc);
  assert.equal(res.ok, true);
  assert.deepEqual(serialize(res.summary), { processed: 1, applied: 0, manual: 0, noChange: 1, failed: 0 });
});

const quizReviewModalSource = extractFn(html, 'openQuizReviewModal');
const renderQuizCardSource = extractFn(html, 'renderQuizCardIntegrated');

/* Este módulo NUNCA deve tocar REVIEW/SRS nem chamar pushToFirebase
 * diretamente — é uma fila própria, local. DATA agora É legitimamente lido
 * e escrito, mas só dentro de authorizeAndApplyReviewSolution() e
 * rollbackAppliedReviewSolution() (via saveData(), o mesmo caminho de
 * persistência já usado pelo resto do app) — nunca nas demais funções. */
test('SEGURANÇA ESTÁTICA: o módulo não lê/escreve REVIEW/SRS nem chama Firebase diretamente', () => {
  assert.doesNotMatch(moduleSource, /\bREVIEW\s*(=[^=]|\.\w|\[)/, 'não deve ler/escrever REVIEW (fluxo de estudo)');
  assert.doesNotMatch(moduleSource, /\bSRS\s*(=[^=]|\.\w|\[)/, 'não deve ler/escrever SRS (quiz)');
  // PROTEÇÃO 084 — a fila agora sincroniza, mas SÓ pelo mesmo contrato de
  // saveReview/saveSRS: saveLesionRevisions() (sem `internal`) marca dirty e
  // agenda pushToFirebase(); nenhuma outra função do módulo chama Firebase,
  // e nada no módulo acessa Firestore diretamente.
  const saveFn = extractFn(moduleSource, 'saveLesionRevisions');
  assert.doesNotMatch(moduleSource.replace(saveFn, ''), /pushToFirebase/, 'só saveLesionRevisions() pode agendar o push — usa saveData() já existente quando muta DATA');
  assert.match(saveFn, /if\(internal\) return;\s*await markSyncDirty\(\);\s*pushToFirebase\(\);/, 'push só depois do guard `internal`, com dirty marcado antes');
  assert.doesNotMatch(moduleSource, /\bfbDb\b|runTransaction|FB_META_REF|writeShardedState/, 'o módulo nunca acessa Firestore diretamente');
});

function extractFn(source, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
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

test('SEGURANÇA ESTÁTICA: só authorizeAndApplyReviewSolution/rollbackAppliedReviewSolution/applyReviewAiSuggestedPlacement tocam DATA', () => {
  const dataTouchers = ['authorizeAndApplyReviewSolution', 'rollbackAppliedReviewSolution', 'applyReviewAiSuggestedPlacement'];
  const untouched = [
    'createLesionReview', 'getPendingReviews', 'getProposedSolutions',
    'getAppliedSolutionsAwaitingValidation', 'getReadySolutions', 'getReviewHistory',
    'validateProposedChanges', 'setReviewSolution', 'rejectProposedReviewSolution',
    'approveAppliedReviewSolution', 'updateReviewCenterBadges', 'cancelLesionReview',
    'importReviewAiSolution', 'flagManualActionRequired', 'reopenManualActionReview',
    'getManualActionSolutions', 'getBatchEligibleReviews', 'buildReviewAiBatchPacket',
    'buildReviewAiBatchPrompt', 'processReviewAiBatchItem', 'importReviewAiBatch',
    'pushHumanFeedback', 'buildReviewAiAttempts', 'resolveLatestHumanFeedback',
    'normalizeReviewAltPlacementKey', 'normalizeReviewAiBatchJson',
    'parseReviewAiBatchJson', 'formatReviewAiBatchParseError'
  ];
  for (const name of untouched) {
    const body = extractFn(moduleSource, name);
    assert.doesNotMatch(body, /\bDATA\b/, `${name}() não deveria referenciar DATA`);
  }
  for (const name of dataTouchers) {
    const body = extractFn(moduleSource, name);
    assert.match(body, /\bDATA\b/, `${name}() deveria referenciar DATA (é exatamente quem aplica/desfaz)`);
    assert.match(body, /\bsaveData\(\)/, `${name}() precisa persistir via saveData() já existente, não reescrever a persistência`);
  }
});

test('REGRA FUNDAMENTAL DA IA: nenhuma função de processamento cria uma revisão nova (createLesionReview é exclusiva da UI)', () => {
  const processingFns = [
    'setReviewSolution', 'rejectProposedReviewSolution', 'authorizeAndApplyReviewSolution',
    'approveAppliedReviewSolution', 'rollbackAppliedReviewSolution', 'importReviewAiSolution',
    'flagManualActionRequired', 'reopenManualActionReview', 'processReviewAiBatchItem',
    'importReviewAiBatch', 'pushHumanFeedback', 'buildReviewAiAttempts',
    'reviewAiKnownSections', 'reviewAiPlacementCatalog', 'validateReviewAiPlacement',
    'normalizeReviewAltPlacementKey', 'applyReviewAiSuggestedPlacement'
  ];
  for (const name of processingFns) {
    const body = extractFn(moduleSource, name);
    assert.doesNotMatch(body, /createLesionReview\(/, `${name}() não pode chamar createLesionReview()`);
  }
});

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
  // PROTEÇÃO 084 — stubs do contrato de sync (dirty + push debounced).
  context.syncDirtyCalls = 0;
  context.pushCalls = 0;
  context.markSyncDirty = async () => { context.syncDirtyCalls += 1; };
  context.pushToFirebase = () => { context.pushCalls += 1; };
  if (opts.dom) {
    const makeBtn = () => ({ textContent: '', classList: { emptyState: null, toggle(cls, isEmpty) { this.emptyState = isEmpty; } } });
    const elements = {
      'pending-reviews-btn': makeBtn(),
      'pending-reviews-badge': { textContent: '' },
      'ready-solutions-btn': makeBtn(),
      'ready-solutions-badge': { textContent: '' }
    };
    context.document = { getElementById: (id) => elements[id] || null };
    context.__elements = elements;
  }
  vm.createContext(context);
  vm.runInContext(moduleSource, context, { filename: 'lesion-review-module.js' });
  return context;
}

// `let LESION_REVISIONS = {}` no topo do módulo NÃO vira uma propriedade do
// objeto de contexto (declarações top-level com let/const não se tornam
// propriedades do global object, diferente de var/function). Para
// inspecionar seu valor real, avaliamos o identificador no MESMO contexto.
function readGlobal(context, name) {
  return vm.runInContext(name, context);
}
// Normaliza um valor vindo do realm da vm (arrays/objetos criados lá têm
// Array.prototype/Object.prototype de outro realm, o que faz
// assert.deepEqual/deepStrictEqual reportar "mesma estrutura mas não
// referência-iguais") para um valor plano do realm do Node.
function serialize(x) {
  return JSON.parse(JSON.stringify(x));
}
function makeLesion(overrides) {
  return Object.assign({
    id: 'seed_1', name: 'Adamantinoma', s: 'Musculoesquelético', site: 'Tíbia',
    tags: ['lítica', 'excêntrica'], notes: 'lesão óssea benigna clássica',
    classification: null, enTerm: 'adamantinoma', img: '', images: [], links: []
  }, overrides || {});
}

test('criar revisão: createLesionReview() cria uma revisão pending vinculada à lesão', () => {
  const ctx = buildTestContext();
  const result = ctx.createLesionReview('seed_1', 'otimizar diagnósticos diferenciais');
  assert.equal(result.created, true);
  assert.equal(result.review.lesionId, 'seed_1');
  assert.equal(result.review.status, 'pending');
  assert.equal(result.review.requestText, 'otimizar diagnósticos diferenciais');
  assert.equal(result.review.solution, null);
  assert.deepEqual(serialize(result.review.attempts), []);
  assert.equal(result.review.history.length, 1);
  assert.equal(result.review.history[0].action, 'created');
  assert.equal(Object.keys(readGlobal(ctx, 'LESION_REVISIONS')).length, 1);
});

test('criar revisão: exige lesionId e texto do pedido', () => {
  const ctx = buildTestContext();
  assert.equal(ctx.createLesionReview('', 'algo').created, false);
  assert.equal(ctx.createLesionReview('seed_1', '   ').created, false);
});

test('SEGURANÇA: não duplica a mesma revisão pending para a mesma lesão com o mesmo texto', () => {
  const ctx = buildTestContext();
  const first = ctx.createLesionReview('seed_1', 'possível lesão duplicada');
  const second = ctx.createLesionReview('seed_1', 'possível lesão duplicada');
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, 'duplicate');
  assert.equal(second.review.id, first.review.id);
  assert.equal(Object.keys(readGlobal(ctx, 'LESION_REVISIONS')).length, 1, 'não pode ter criado uma segunda revisão');

  const third = ctx.createLesionReview('seed_1', 'corrigir classificação');
  assert.equal(third.created, true);
  assert.equal(Object.keys(readGlobal(ctx, 'LESION_REVISIONS')).length, 2);
});

test('persistência: saveLesionRevisions()/loadLesionRevisions() sobrevivem a um "reload" simulado (inclusive attempts/snapshots)', async () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  await ctx.saveLesionRevisions();
  assert.ok(ctx.__backing['atlas:lesionRevisions'], 'nada foi persistido no storage');

  const before = serialize(readGlobal(ctx, 'LESION_REVISIONS'));
  assert.equal(Object.keys(before).length, 1);
  assert.equal(before[review.id].attempts.length, 1, 'o snapshot/tentativa precisa estar no dado salvo');

  // Simula F5: novo contexto de execução (módulo carregado do zero), mas
  // apontando o storage falso pro MESMO "disco" (mesmo objeto __backing).
  const sharedBacking = ctx.__backing;
  const ctx2 = {
    console, Date, Math, JSON, Object, Array,
    DATA: [], saveDataCalls: [],
    __backing: sharedBacking,
    storage: {
      async get(key) {
        if (Object.prototype.hasOwnProperty.call(sharedBacking, key)) return { value: sharedBacking[key] };
        throw new Error('not found: ' + key);
      },
      async set(key, value) { sharedBacking[key] = value; }
    }
  };
  ctx2.saveData = () => { ctx2.saveDataCalls.push(Date.now()); };
  vm.createContext(ctx2);
  vm.runInContext(moduleSource, ctx2, { filename: 'lesion-review-module-reload.js' });

  assert.equal(Object.keys(readGlobal(ctx2, 'LESION_REVISIONS')).length, 0, 'estado inicial deve ser vazio antes de carregar');
  await ctx2.loadLesionRevisions();
  assert.deepEqual(serialize(readGlobal(ctx2, 'LESION_REVISIONS')), before, 'estado recarregado (incluindo attempts/snapshots) precisa ser idêntico ao salvo antes do reload');
});

test('contador de pendências: getPendingReviews()/countPendingLesionReviews() contam pending e rejected', () => {
  const ctx = buildTestContext();
  ctx.createLesionReview('seed_1', 'pedido A');
  ctx.createLesionReview('seed_2', 'pedido B');
  assert.equal(ctx.countPendingLesionReviews(), 2);
  const pending = ctx.getPendingReviews();
  assert.equal(pending.length, 2);
  assert.ok(pending[0].updatedAt >= pending[1].updatedAt, 'mais recentes primeiro');
});

// ===========================================================================
// Cenários essenciais da seção 11 do pedido: manual -> proposta -> recusar,
// e manual -> proposta -> autorizar -> aprovar / desfazer.
// ===========================================================================

test('1) MANUAL: pending -> 🔔=1 💡=0', () => {
  const ctx = buildTestContext();
  ctx.createLesionReview('seed_1', 'corrigir classificação');
  assert.equal(ctx.countPendingLesionReviews(), 1);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
});

test('2) PROPOSTA: setReviewSolution() -> proposed -> 🔔=0 💡=1, DATA intocado', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  const res = ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'proposed');
  assert.deepEqual(serialize(res.review.solution.proposedChanges), { classification: 'BIRADS' });
  assert.equal(ctx.countPendingLesionReviews(), 0);
  assert.equal(ctx.countReadyLesionSolutions(), 1);
  assert.deepEqual(ctx.DATA[0], lesion, 'DATA não pode mudar só por propor');
  assert.equal(ctx.saveDataCalls.length, 0, 'propor não deve chamar saveData()');
});

test('3) RECUSAR PROPOSTA: rejectProposedReviewSolution() -> rejected -> 🔔=1 💡=0, DATA intocado', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  const res = ctx.rejectProposedReviewSolution(review.id, 'sistema errado pro órgão');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'rejected');
  assert.equal(ctx.countPendingLesionReviews(), 1);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
  assert.deepEqual(ctx.DATA[0], lesion, 'DATA precisa continuar intocado — nunca chegou a ser autorizado');
  assert.equal(ctx.saveDataCalls.length, 0);
  // nada apagado
  assert.equal(res.review.solution.proposedChanges.classification, 'BIRADS');
  const entry = res.review.history.find(h => h.action === 'proposal_rejected');
  assert.equal(entry.details.reason, 'sistema errado pro órgão');
});

test('4) AUTORIZAR: snapshot criado ANTES, alteração estruturada aplicada, applied_pending_validation -> 🔔=0 💡=1', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  const res = ctx.authorizeAndApplyReviewSolution(review.id);

  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'applied_pending_validation');
  assert.equal(res.attempt.beforeSnapshot.classification, null, 'snapshot precisa ser o estado ANTES da alteração');
  assert.equal(ctx.DATA[0].classification, 'BIRADS', 'a mudança estruturada precisa estar em DATA de verdade');
  assert.equal(ctx.DATA[0].name, lesion.name, 'só o campo autorizado muda — o resto da lesão continua igual');
  assert.equal(ctx.countPendingLesionReviews(), 0);
  assert.equal(ctx.countReadyLesionSolutions(), 1);
  assert.equal(ctx.saveDataCalls.length, 1, 'aplicar precisa persistir via saveData()');

  const historyOrder = res.review.history.map(h => h.action);
  const authIdx = historyOrder.indexOf('application_authorized');
  const snapIdx = historyOrder.indexOf('before_snapshot_created');
  const appliedIdx = historyOrder.indexOf('changes_applied');
  assert.ok(authIdx < snapIdx && snapIdx < appliedIdx, 'ordem precisa ser: autorizado -> snapshot -> aplicado');
});

test('5) APROVAR: approveAppliedReviewSolution() -> accepted -> 🔔=0 💡=0, DATA modificado permanece', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  const res = ctx.approveAppliedReviewSolution(review.id);

  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'accepted');
  assert.equal(ctx.countPendingLesionReviews(), 0);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
  assert.equal(ctx.DATA[0].classification, 'BIRADS', 'alteração aprovada continua valendo em DATA');
  assert.ok(res.review.attempts[0].approvedAt, 'a tentativa precisa registrar quando foi aprovada');
});

test('6) DESFAZER: rollbackAppliedReviewSolution() restaura EXATAMENTE o beforeSnapshot -> rejected -> 🔔=1 💡=0', () => {
  const lesion = makeLesion();
  // authorizeAndApplyReviewSolution() muta a lesão em DATA IN PLACE (mesma
  // referência de `lesion`) — por isso guardamos uma cópia congelada do
  // estado original ANTES de autorizar, pra comparar depois do rollback.
  const originalLesionSnapshot = JSON.parse(JSON.stringify(lesion));
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(ctx.DATA[0].classification, 'BIRADS');

  const res = ctx.rollbackAppliedReviewSolution(review.id, 'classificação errada mesmo assim');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'rejected');
  assert.deepEqual(serialize(ctx.DATA[0]), originalLesionSnapshot, 'a lesão precisa voltar EXATAMENTE ao estado do snapshot');
  assert.equal(ctx.countPendingLesionReviews(), 1);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
  assert.equal(ctx.saveDataCalls.length, 2, 'aplicar + desfazer, os dois persistem via saveData()');

  const rejEntry = res.review.history.find(h => h.action === 'application_rejected');
  assert.equal(rejEntry.details.reason, 'classificação errada mesmo assim');
  assert.ok(res.review.history.some(h => h.action === 'rollback_completed'));
  assert.ok(res.review.attempts[0].rolledBackAt, 'a tentativa precisa registrar quando foi desfeita');
});

test('7) NOVA TENTATIVA após rollback: novo snapshot independente do anterior', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.rollbackAppliedReviewSolution(review.id, 'não serviu');

  // Segunda proposta sobre a MESMA revisão reaberta (rejected -> proposed).
  const proposeAgain = ctx.setReviewSolution(review.id, 'aplicar TIRADS', { classification: 'TIRADS' });
  assert.equal(proposeAgain.ok, true);
  assert.equal(proposeAgain.review.status, 'proposed');
  assert.ok(proposeAgain.review.history.some(h => h.action === 'reopened'));

  const secondApply = ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(secondApply.ok, true);
  assert.equal(ctx.DATA[0].classification, 'TIRADS');
  assert.equal(secondApply.review.attempts.length, 2, 'precisa ter DUAS tentativas registradas');
  assert.notEqual(secondApply.review.attempts[0].id, secondApply.review.attempts[1].id);
  assert.equal(secondApply.review.attempts[1].beforeSnapshot.classification, null, 'o segundo snapshot reflete o estado (já restaurado) ANTES da segunda aplicação, não o snapshot da primeira tentativa');
});

test('SEGURANÇA: proposedChanges inválido não é aceito e não altera DATA', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido qualquer');

  assert.equal(ctx.setReviewSolution(review.id, 'x', null).ok, false);
  assert.equal(ctx.setReviewSolution(review.id, 'x', 'string não é objeto').ok, false);
  assert.equal(ctx.setReviewSolution(review.id, 'x', []).ok, false);
  assert.equal(ctx.setReviewSolution(review.id, 'x', {}).ok, false, 'objeto vazio não é uma proposta válida');
  assert.equal(ctx.setReviewSolution(review.id, 'x', { name: 123 }).ok, false, 'tipo errado pro campo');
  assert.equal(ctx.setReviewSolution(review.id, 'x', { name: '   ' }).ok, false, 'nome vazio não é válido');
  assert.equal(ctx.setReviewSolution(review.id, 'x', { tags: 'não é array' }).ok, false);

  assert.deepEqual(ctx.DATA[0], lesion, 'nenhuma tentativa inválida pode ter alterado DATA');
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[review.id].status, 'pending', 'proposta inválida não muda o status');
});

test('SEGURANÇA: campo fora da allowlist (operação proibida) não altera DATA', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido qualquer');

  const forbidden = [
    { id: 'outro_id' }, { images: [] }, { img: 'x' }, { s: 'Outra Seção' },
    { site: 'Outro Sítio' }, { altPlacements: [] }, { localImg: true }
  ];
  for (const attempt of forbidden) {
    const res = ctx.setReviewSolution(review.id, 'x', attempt);
    assert.equal(res.ok, false, JSON.stringify(attempt) + ' deveria ser recusado');
    assert.equal(res.reason.startsWith('forbidden_field'), true);
  }
  assert.deepEqual(ctx.DATA[0], lesion);

  // Mesmo se alguém corrompesse manualmente o objeto da revisão pra burlar
  // a checagem de setReviewSolution, authorizeAndApplyReviewSolution()
  // valida DE NOVO antes de tocar DATA (defesa em profundidade).
  const raw = readGlobal(ctx, 'LESION_REVISIONS')[review.id];
  raw.status = 'proposed';
  raw.solution = { text: 'x', proposedChanges: { images: [{malicious: true}] }, createdAt: Date.now() };
  const applyRes = ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(applyRes.ok, false);
  assert.deepEqual(ctx.DATA[0], lesion, 'DATA precisa continuar intocado mesmo com estado corrompido manualmente');
});

test('SEGURANÇA: falha ao aplicar (lesão não existe mais em DATA) não deixa DATA parcialmente modificado', () => {
  const ctx = buildTestContext({ data: [] }); // lesão "seed_1" não existe em DATA
  const { review } = ctx.createLesionReview('seed_1', 'pedido qualquer');
  ctx.setReviewSolution(review.id, 'x', { notes: 'novo texto' });
  const res = ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'lesion_not_found');
  assert.deepEqual(ctx.DATA, [], 'DATA precisa continuar vazio, sem nenhum registro parcial');
  assert.equal(readGlobal(ctx, 'LESION_REVISIONS')[review.id].status, 'proposed', 'status não deve avançar numa aplicação que falhou');
  assert.equal(ctx.saveDataCalls.length, 0);
});

test('autorizar: só é permitido quando existe uma proposta (status "proposed")', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido sem proposta ainda');
  const res = ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_proposed');
});

test('aprovar/desfazer: só são permitidos quando existe uma correção aplicada aguardando validação', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  assert.equal(ctx.approveAppliedReviewSolution(review.id).ok, false);
  assert.equal(ctx.rollbackAppliedReviewSolution(review.id).ok, false);
  ctx.setReviewSolution(review.id, 'x', { notes: 'y' });
  // ainda em "proposed", não "applied_pending_validation"
  assert.equal(ctx.approveAppliedReviewSolution(review.id).ok, false);
  assert.equal(ctx.rollbackAppliedReviewSolution(review.id).ok, false);
});

test('setReviewSolution não pode reabrir proposta enquanto uma correção está aplicada aguardando validação', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  ctx.setReviewSolution(review.id, 'x', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  const res = ctx.setReviewSolution(review.id, 'nova proposta', { notes: 'z' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'awaiting_validation');
});

test('funções com id inexistente não quebram', () => {
  const ctx = buildTestContext({ data: [] });
  assert.equal(ctx.setReviewSolution('nao-existe', 'x', { notes: 'y' }).ok, false);
  assert.equal(ctx.rejectProposedReviewSolution('nao-existe').ok, false);
  assert.equal(ctx.authorizeAndApplyReviewSolution('nao-existe').ok, false);
  assert.equal(ctx.approveAppliedReviewSolution('nao-existe').ok, false);
  assert.equal(ctx.rollbackAppliedReviewSolution('nao-existe').ok, false);
});

test('histórico completo preservado: criada → proposta → autorizada → snapshot → aplicada → desfeita → reaberta → nova proposta → autorizada → aprovada', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'diagnósticos diferenciais incompletos');
  ctx.setReviewSolution(review.id, 'primeira proposta', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.rollbackAppliedReviewSolution(review.id, 'sistema errado');
  ctx.setReviewSolution(review.id, 'segunda proposta', { classification: 'TIRADS' });
  const finalRes = ctx.authorizeAndApplyReviewSolution(review.id);
  const approveRes = ctx.approveAppliedReviewSolution(review.id);

  assert.equal(approveRes.ok, true);
  const actions = serialize(ctx.getReviewHistory(review.id)).map(h => h.action);
  assert.deepEqual(actions, [
    'created',
    'solution_proposed',
    'application_authorized', 'before_snapshot_created', 'changes_applied',
    'application_rejected', 'rollback_completed',
    'reopened', 'solution_proposed',
    'application_authorized', 'before_snapshot_created', 'changes_applied',
    'application_approved'
  ]);
  assert.equal(finalRes.review.solution.text, 'segunda proposta');
});

test('getReviewHistory() retorna em ordem cronológica e não apaga nada', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'y', { notes: 'z' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo');
  const hist = ctx.getReviewHistory(review.id);
  for (let i = 1; i < hist.length; i += 1) {
    assert.ok(hist[i].timestamp >= hist[i - 1].timestamp);
  }
  assert.equal(hist.length, 3);
});

test('REGRESSÃO: updateReviewCenterBadges() nunca lança erro sem document (headless/futura IA)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'algo');
  ctx.setReviewSolution(review.id, 'proposta', { notes: 'x' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.approveAppliedReviewSolution(review.id);
  assert.doesNotThrow(() => ctx.updateReviewCenterBadges());
});

test('REGRESSÃO: os badges do header reagem IMEDIATAMENTE em cada transição da máquina de 2 aceites', () => {
  const lesion = makeLesion();
  const lesion2 = makeLesion({ id: 'seed_2', name: 'Osteocondroma' });
  const ctx = buildTestContext({ data: [lesion, lesion2], dom: true });
  const els = ctx.__elements;

  assert.equal(els['pending-reviews-badge'].textContent, '');
  assert.equal(els['ready-solutions-badge'].textContent, '');

  const { review } = ctx.createLesionReview('seed_1', 'classificado como BIRADS');
  assert.equal(els['pending-reviews-badge'].textContent, '1');
  assert.equal(els['pending-reviews-btn'].classList.emptyState, false);

  ctx.setReviewSolution(review.id, 'reclassificar', { classification: 'BIRADS' });
  assert.equal(els['pending-reviews-badge'].textContent, '', 'pendências zera ao propor');
  assert.equal(els['ready-solutions-badge'].textContent, '1', 'soluções mostra 1 (aba propostas)');

  ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(els['pending-reviews-badge'].textContent, '', 'autorizar não reabre pendências');
  assert.equal(els['ready-solutions-badge'].textContent, '1', 'soluções continua 1 (agora aba validar correções)');

  ctx.approveAppliedReviewSolution(review.id);
  assert.equal(els['ready-solutions-badge'].textContent, '', 'aprovar zera soluções');
  assert.equal(els['pending-reviews-badge'].textContent, '', 'aprovar não reabre pendências');

  // Segundo cenário: autorizar e desfazer devolve pra pendentes.
  const second = ctx.createLesionReview('seed_2', 'outro pedido').review;
  ctx.setReviewSolution(second.id, 'proposta 2', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(second.id);
  assert.equal(els['ready-solutions-badge'].textContent, '1');
  ctx.rollbackAppliedReviewSolution(second.id, 'não funcionou');
  assert.equal(els['pending-reviews-badge'].textContent, '1', 'desfazer devolve pra pendentes imediatamente');
  assert.equal(els['ready-solutions-badge'].textContent, '', 'desfazer some do badge de soluções imediatamente');
});

test('Quiz: botão de marcar revisão aparece somente dentro do fluxo pós-resposta', () => {
  const fbStart = renderQuizCardSource.indexOf('function renderAnsweredFeedback(){');
  const reviewButtonIdx = renderQuizCardSource.indexOf('id="quiz-review-btn"');
  const reviewHandlerIdx = renderQuizCardSource.indexOf('openQuizReviewModal(e.id)');
  assert.notEqual(fbStart, -1, 'renderAnsweredFeedback() não encontrado');
  assert.ok(reviewButtonIdx > fbStart, 'o botão de revisão precisa existir apenas no feedback respondido');
  assert.ok(reviewHandlerIdx > reviewButtonIdx);
});

test('Quiz: modal mostra a lesão atual e salva pelo createLesionReview() existente com lesionId correto', () => {
  assert.match(quizReviewModalSource, /DATA\.find\(x=>x\.id===lesionId\)/);
  assert.match(quizReviewModalSource, /\$\{esc\(lesion\.name\)\}/);
  assert.match(quizReviewModalSource, /createLesionReview\(lesion\.id,\s*requestText\)/);
});

test('Quiz: texto livre é passado sem reescrita e o placeholder orienta problemas de imagem/classificação', () => {
  assert.match(quizReviewModalSource, /const requestText = requestEl\.value;/);
  assert.match(quizReviewModalSource, /Imagem incompatível com a lesão; classificação incorreta;/);
  assert.doesNotMatch(quizReviewModalSource, /createLesionReview\([^,]+,\s*requestText\.trim\(\)\)/);
});

test('Quiz: cancelar fecha somente o pequeno modal e não cria revisão', () => {
  assert.match(quizReviewModalSource, /querySelector\(['"]#quiz-review-cancel['"]\)\.onclick\s*=\s*close/);
  assert.doesNotMatch(quizReviewModalSource, /closeOverlay\(/);
  const cancelIdx = quizReviewModalSource.indexOf("querySelector('#quiz-review-cancel')");
  const saveIdx = quizReviewModalSource.indexOf("querySelector('#quiz-review-save')");
  assert.ok(cancelIdx !== -1 && saveIdx > cancelIdx, 'createLesionReview só pode estar no handler de salvar, depois do cancelar');
});

test('Quiz: criação/duplicata atualiza badge pela API central e mantém o feedback aberto', () => {
  assert.match(quizReviewModalSource, /result\.reason!==['"]duplicate['"]/);
  assert.match(extractFn(moduleSource, 'createLesionReview'), /updateReviewCenterBadges\(\)/);
  assert.doesNotMatch(quizReviewModalSource, /renderQuizCardIntegrated|openProgressDashboard|getStudyOverlay/);
});

test('Quiz: marcar revisão não altera SESSIONLOG, pontuação, progresso ou SRS', () => {
  for (const source of [quizReviewModalSource]) {
    assert.doesNotMatch(source, /\bSESSIONLOG\b/);
    assert.doesNotMatch(source, /\bquizStats\b/);
    assert.doesNotMatch(source, /\bquizIndex\b/);
    assert.doesNotMatch(source, /\bSRS\b/);
    assert.doesNotMatch(source, /recordQuizAnswerToday|srsGradeLevel|logSessionResult/);
  }
});

test('backup/export inclui LESION_REVISIONS (estaticamente, no botão de exportar backup)', () => {
  const idx = html.indexOf("appVersion: 'v193'");
  assert.notEqual(idx, -1, 'bloco de export do backup completo (btn-export) não encontrado');
  const exportBlock = html.slice(idx, html.indexOf('};', idx));
  assert.match(exportBlock, /lesionRevisions:\s*LESION_REVISIONS/, 'o backup exportado precisa incluir lesionRevisions (inclui attempts/snapshots, é o mesmo objeto)');
});

test('backup/import restaura LESION_REVISIONS (estaticamente, no handler de importação)', () => {
  const marker = "document.getElementById('import-file').addEventListener('change', async (ev)=>";
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'handler de importação não encontrado');
  const importBlock = html.slice(start, start + 5000); // 079: comentário de quarentena empurrou o marcador; 091c: união do mapa de fusão (+141)
  assert.match(
    importBlock,
    /LESION_REVISIONS\s*=\s*\(parsed\.lesionRevisions/,
    'a importação de backup completo precisa restaurar lesionRevisions'
  );
  assert.match(importBlock, /await saveLesionRevisions\(\);/, 'a importação precisa persistir lesionRevisions restaurado');
});

test('loadData() carrega LESION_REVISIONS no boot (estaticamente)', () => {
  const loadDataStart = html.indexOf('async function loadData(){');
  assert.notEqual(loadDataStart, -1);
  const loadLesionRevisionsIdx = html.indexOf('await loadLesionRevisions();', loadDataStart);
  assert.notEqual(loadLesionRevisionsIdx, -1, 'loadData precisa carregar as revisões salvas ao abrir o app');
  // (marcador sem o ')' final: desde a Alteração 072 a assinatura é saveData(internal))
  const nextFunctionIdx = html.indexOf('\nasync function saveData(', loadDataStart);
  assert.ok(loadLesionRevisionsIdx < nextFunctionIdx, 'a chamada precisa estar dentro do corpo de loadData()');
});

// ===========================================================================
// CANCELAMENTO MANUAL DO PEDIDO (cancelLesionReview)
// ===========================================================================

test('CANCELAR pending: pending -> cancelled, marca cancelledAt/cancelledBy e sai de getPendingReviews()', () => {
  const ctx = buildTestContext();
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  assert.equal(ctx.countPendingLesionReviews(), 1);
  const before = Date.now();
  const res = ctx.cancelLesionReview(review.id, 'corrigi manualmente');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'cancelled');
  assert.equal(res.review.cancelledBy, 'user');
  assert.ok(res.review.cancelledAt >= before, 'cancelledAt precisa ser criado');
  assert.equal(res.review.cancelReason, 'corrigi manualmente');
  assert.equal(ctx.countPendingLesionReviews(), 0, '🔔 precisa cair imediatamente');
  assert.equal(ctx.getPendingReviews().length, 0);
});

test('CANCELAR proposed: proposed -> cancelled, sai de getProposedSolutions() e nenhuma alteração é aplicada', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  assert.equal(ctx.countReadyLesionSolutions(), 1);
  const res = ctx.cancelLesionReview(review.id, '');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'cancelled');
  assert.equal(ctx.getProposedSolutions().length, 0, '💡 precisa cair imediatamente');
  assert.equal(ctx.countReadyLesionSolutions(), 0);
  assert.deepEqual(ctx.DATA[0], lesion, 'cancelar NUNCA pode alterar DATA');
  assert.equal(ctx.saveDataCalls.length, 0, 'cancelar NUNCA chama saveData()');
  assert.equal(res.review.solution.proposedChanges.classification, 'BIRADS', 'a proposta precisa continuar preservada no histórico');
});

test('CANCELAR: sem motivo informado guarda cancelReason null e o histórico registra o evento', () => {
  const ctx = buildTestContext();
  const { review } = ctx.createLesionReview('seed_1', 'marcado por engano');
  const res = ctx.cancelLesionReview(review.id, '   ');
  assert.equal(res.review.cancelReason, null);
  const entry = res.review.history.find(h => h.action === 'cancelled');
  assert.ok(entry, 'precisa registrar o evento cancelled no histórico');
  assert.equal(entry.details.previousStatus, 'pending');
});

test('NÃO CANCELAR applied_pending_validation (tem o fluxo próprio manter/desfazer)', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  const res = ctx.cancelLesionReview(review.id, 'não quero mais');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_cancellable');
  assert.equal(res.review.status, 'applied_pending_validation', 'o status não pode mudar');
  assert.equal(ctx.DATA[0].classification, 'BIRADS', 'nada em DATA pode ser desfeito por tentativa de cancelamento');
  assert.equal(ctx.getAppliedSolutionsAwaitingValidation().length, 1);
});

test('NÃO CANCELAR accepted', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.approveAppliedReviewSolution(review.id);
  const res = ctx.cancelLesionReview(review.id, 'tarde demais');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_cancellable');
  assert.equal(res.review.status, 'accepted');
});

test('NÃO CANCELAR cancelled novamente', () => {
  const ctx = buildTestContext();
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  assert.equal(ctx.cancelLesionReview(review.id, 'primeiro').ok, true);
  const res = ctx.cancelLesionReview(review.id, 'segundo');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_cancellable');
  assert.equal(res.review.status, 'cancelled');
  assert.equal(res.review.cancelReason, 'primeiro', 'o motivo original não pode ser sobrescrito');
});

test('cancelLesionReview() em id inexistente devolve not_found sem lançar erro', () => {
  const ctx = buildTestContext();
  const res = ctx.cancelLesionReview('lrev_inexistente', 'x');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_found');
});

test('cancelled NÃO entra em nenhuma fila ativa (pending/proposed/applied) nem em getReadySolutions()', () => {
  const ctx = buildTestContext();
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.cancelLesionReview(review.id, 'ok');
  assert.equal(ctx.getPendingReviews().length, 0);
  assert.equal(ctx.getProposedSolutions().length, 0);
  assert.equal(ctx.getAppliedSolutionsAwaitingValidation().length, 0);
  assert.equal(ctx.getReadySolutions().length, 0);
  assert.equal(ctx.countPendingLesionReviews(), 0);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
});

test('cancelled continua acessível pelo histórico (getReviewHistory), com o motivo preservado', () => {
  const ctx = buildTestContext();
  const { review } = ctx.createLesionReview('seed_1', 'revisar referências');
  ctx.cancelLesionReview(review.id, 'já resolvi');
  const history = ctx.getReviewHistory(review.id);
  assert.ok(history.some(h => h.action === 'cancelled'));
  const entry = history.find(h => h.action === 'cancelled');
  assert.equal(entry.details.reason, 'já resolvi');
});

test('F5/reload: revisão cancelada continua cancelada e fora das filas ativas', async () => {
  const ctx = buildTestContext();
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.cancelLesionReview(review.id, 'corrigi manualmente');
  await ctx.saveLesionRevisions();

  const sharedBacking = ctx.__backing;
  const ctx2 = {
    console, Date, Math, JSON, Object, Array,
    DATA: [], saveDataCalls: [],
    __backing: sharedBacking,
    storage: {
      async get(key) {
        if (Object.prototype.hasOwnProperty.call(sharedBacking, key)) return { value: sharedBacking[key] };
        throw new Error('not found: ' + key);
      },
      async set(key, value) { sharedBacking[key] = value; }
    }
  };
  ctx2.saveData = () => { ctx2.saveDataCalls.push(Date.now()); };
  vm.createContext(ctx2);
  vm.runInContext(moduleSource, ctx2, { filename: 'lesion-review-module-reload-cancel.js' });
  await ctx2.loadLesionRevisions();

  assert.equal(ctx2.getPendingReviews().length, 0, 'não pode voltar para 🔔');
  assert.equal(ctx2.getProposedSolutions().length, 0, 'não pode voltar para 💡');
  assert.equal(ctx2.getReadySolutions().length, 0);
  const reloaded = serialize(readGlobal(ctx2, 'LESION_REVISIONS'))[review.id];
  assert.equal(reloaded.status, 'cancelled');
  assert.equal(reloaded.cancelledBy, 'user');
  assert.equal(reloaded.cancelReason, 'corrigi manualmente');
  assert.equal(reloaded.requestText, 'corrigir classificação', 'requestText precisa ser preservado');
  assert.equal(reloaded.solution.proposedChanges.classification, 'BIRADS', 'proposedChanges precisa ser preservado no histórico');
});

test('cancelar NÃO apaga requestText, createdAt, attempts[] nem histórico anterior', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  const createdAt = review.createdAt;
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.rollbackAppliedReviewSolution(review.id, 'não funcionou');
  // rejected -> proposed -> autorizar de novo -> aplicado, para ter attempts[]
  ctx.setReviewSolution(review.id, 'aplicar TIRADS', { classification: 'TIRADS' });
  const historyBefore = review.history.length;
  const attemptsBefore = review.attempts.length;

  // volta pra proposed (rollback deixou em rejected; nova proposta reabre)
  const res = ctx.cancelLesionReview(review.id, 'resolvido fora do fluxo');
  assert.equal(res.ok, true);
  assert.equal(res.review.requestText, 'corrigir classificação');
  assert.equal(res.review.createdAt, createdAt);
  assert.equal(res.review.attempts.length, attemptsBefore, 'attempts[] precisa ser preservado');
  assert.ok(res.review.history.length > historyBefore, 'o histórico anterior é mantido e o evento cancelled é acrescentado');
  assert.ok(res.review.history.some(h => h.action === 'changes_applied'));
  assert.ok(res.review.history.some(h => h.action === 'rollback_completed'));
});

test('badges do header: cancelar atualiza 🔔 e 💡 imediatamente (sem F5)', () => {
  const ctx = buildTestContext({ dom: true });
  const els = ctx.__elements;
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  assert.equal(els['pending-reviews-badge'].textContent, '1');
  assert.equal(els['pending-reviews-btn'].classList.emptyState, false);

  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  assert.equal(els['ready-solutions-badge'].textContent, '1');

  ctx.cancelLesionReview(review.id, 'ok');
  assert.equal(els['ready-solutions-badge'].textContent, '', '💡 precisa zerar imediatamente');
  assert.equal(els['ready-solutions-btn'].classList.emptyState, true);
  assert.equal(els['pending-reviews-badge'].textContent, '', '🔔 precisa continuar zerado');
});

test('ESTÁTICO: cancelLesionReview() é a função central e a UI não implementa a lógica no botão', () => {
  assert.match(moduleSource, /function cancelLesionReview\(reviewId, reason\)\{/);
  assert.match(moduleSource, /const CANCELLABLE_REVIEW_STATUSES = \['pending', 'proposed', 'rejected', 'manual_action_required'\];/);
  // a UI de confirmação chama a função central
  const modalStart = html.indexOf('function openCancelReviewModal(');
  assert.notEqual(modalStart, -1);
  const modalEnd = html.indexOf('\nfunction openPendingReviewsModal(', modalStart);
  assert.notEqual(modalEnd, -1);
  const modalBlock = html.slice(modalStart, modalEnd);
  assert.match(modalBlock, /cancelLesionReview\(reviewId, reason\)/);
  assert.doesNotMatch(modalBlock, /\bDATA\b/);
  // botão aparece na Central de Revisões e na aba Propostas
  assert.match(html, /review-cancel-request">✕ Cancelar pedido/);
});

// ===========================================================================
// CANCELAMENTO DE REVISÃO rejected (volta ao 🔔 e também pode ser encerrada)
// ===========================================================================

test('CANCELAR rejected: rejected -> cancelled, sai de getPendingReviews() e preserva o histórico da rejeição', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.rejectProposedReviewSolution(review.id, 'sistema errado pro órgão');
  // rejected volta para o 🔔
  assert.equal(ctx.getPendingReviews().length, 1);
  assert.equal(ctx.countPendingLesionReviews(), 1);
  assert.equal(review.status, 'rejected');

  const historyBefore = review.history.length;
  const res = ctx.cancelLesionReview(review.id, 'resolvi manualmente');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'cancelled');
  assert.equal(res.review.cancelledBy, 'user');
  assert.equal(res.review.cancelReason, 'resolvi manualmente');
  assert.ok(res.review.cancelledAt, 'cancelledAt precisa ser criado');
  assert.equal(ctx.getPendingReviews().length, 0, 'rejected cancelada precisa sair do 🔔');
  assert.equal(ctx.countPendingLesionReviews(), 0);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
  // histórico da rejeição anterior preservado + evento cancelled acrescentado
  assert.ok(res.review.history.length > historyBefore);
  assert.ok(res.review.history.some(h => h.action === 'proposal_rejected'), 'o histórico da rejeição precisa continuar lá');
  assert.ok(res.review.history.some(h => h.action === 'cancelled'));
  assert.equal(res.review.solution.proposedChanges.classification, 'BIRADS', 'a proposta recusada precisa continuar preservada');
});

test('CANCELAR rejected: NÃO altera DATA, NÃO refaz rollback, NÃO aplica solução e preserva attempts[]', () => {
  const lesion = makeLesion();
  const originalSnapshot = JSON.parse(JSON.stringify(lesion));
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);   // aplica + cria attempts[0]
  ctx.rollbackAppliedReviewSolution(review.id, 'não funcionou'); // desfaz -> rejected
  assert.equal(ctx.DATA[0].classification, null, 'rollback já devolveu a lesão ao estado original');
  const attemptsBefore = serialize(review.attempts);
  const saveDataBefore = ctx.saveDataCalls.length;

  const res = ctx.cancelLesionReview(review.id, 'já resolvi por fora');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'cancelled');
  assert.deepEqual(serialize(res.review.attempts), attemptsBefore, 'attempts[] precisa ficar intacto');
  assert.deepEqual(serialize(ctx.DATA[0]), originalSnapshot, 'cancelar rejected NUNCA altera DATA');
  assert.equal(ctx.saveDataCalls.length, saveDataBefore, 'cancelar NUNCA chama saveData()');
  assert.ok(res.review.history.some(h => h.action === 'rollback_completed'), 'o rollback anterior precisa continuar no histórico');
});

test('badge 🔔: cancelar uma revisão rejected diminui o contador imediatamente', () => {
  const ctx = buildTestContext({ dom: true });
  const els = ctx.__elements;
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'aplicar BIRADS', { classification: 'BIRADS' });
  ctx.rejectProposedReviewSolution(review.id, 'não serve');
  assert.equal(els['pending-reviews-badge'].textContent, '1', 'rejected volta a contar no 🔔');
  ctx.cancelLesionReview(review.id, 'ok');
  assert.equal(els['pending-reviews-badge'].textContent, '', '🔔 precisa cair imediatamente');
  assert.equal(els['pending-reviews-btn'].classList.emptyState, true);
});

// ===========================================================================
// PONTE SEGURA PARA IA (manual-assistida) — buildReviewAiPacket/Prompt +
// importReviewAiSolution
// ===========================================================================

test('IA (pacote): pending gera um pacote estruturado com reviewId/lesionId/campos permitidos', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'otimizar diagnósticos diferenciais');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.ok, true);
  assert.equal(built.packet.reviewId, review.id);
  assert.equal(built.packet.lesionId, 'seed_1');
  assert.equal(built.packet.lesionName, lesion.name);
  assert.equal(built.packet.requestText, 'otimizar diagnósticos diferenciais');
  assert.deepEqual(JSON.parse(JSON.stringify(built.packet.currentFields)), {
    name: lesion.name, notes: lesion.notes, classification: null, tags: lesion.tags, enTerm: lesion.enTerm
  });
  assert.deepEqual(JSON.parse(JSON.stringify(built.packet.allowedFields)), ['name', 'notes', 'classification', 'tags', 'enTerm']);
  assert.ok(built.packet.forbiddenFields.includes('images'));
  assert.ok(built.packet.forbiddenFields.includes('lesionId'));
});

test('IA (pacote): NÃO altera DATA nem o status da revisão; só metadados de imagem (sem blob)', () => {
  const lesion = makeLesion({ images: [{ data: 'https://res.cloudinary.com/x/y.jpg', publicId: 'atlas-radiologico/y', assetId: 'A1', label: 'T2', lesionId: 'seed_1', lesionName: 'Adamantinoma' }] });
  const ctx = buildTestContext({ data: [lesion] });
  const before = JSON.stringify(ctx.DATA);
  const { review } = ctx.createLesionReview('seed_1', 'bug de imagem');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.ok, true);
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA não pode mudar ao preparar o pacote');
  assert.equal(review.status, 'pending', 'status não muda ao preparar');
  assert.equal(built.packet.images.length, 1);
  assert.equal(built.packet.images[0].publicId, 'atlas-radiologico/y');
  assert.equal(built.packet.images[0].data, undefined, 'não pode embutir blob/dados da imagem');
});

test('IA (pacote): buildReviewAiPrompt explica a ponte e manda devolver só o JSON', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'revisar referências');
  const built = ctx.buildReviewAiPrompt(review.id);
  assert.equal(built.ok, true);
  assert.match(built.text, /PONTE MANUAL/);
  assert.match(built.text, /NÃO aplique nada/);
  assert.match(built.text, /proposedChanges aceita SOMENTE: name, notes, classification, tags, enTerm/);
  assert.match(built.text, new RegExp('"reviewId":"' + review.id + '"'));
});

test('IA (importar): JSON válido APLICA PROVISORIAMENTE direto -> applied_pending_validation, 🔔=0 💡=1', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  const beforeSnapshot = JSON.parse(JSON.stringify(lesion));
  const json = JSON.stringify({ reviewId: review.id, summary: 'Trocar a classificação', reasoning: 'sistema errado', proposedChanges: { classification: 'BIRADS' } });
  const res = ctx.importReviewAiSolution(review.id, json);
  assert.equal(res.ok, true);
  assert.equal(res.applied, true);
  assert.equal(res.review.status, 'applied_pending_validation', 'vai DIRETO para aguardando validação — sem etapa de autorizar');
  assert.equal(ctx.getProposedSolutions().length, 0, 'não fica parado em proposta');
  assert.equal(ctx.getAppliedSolutionsAwaitingValidation().length, 1);
  assert.equal(ctx.countPendingLesionReviews(), 0, '🔔 diminui');
  assert.equal(ctx.countReadyLesionSolutions(), 1, '💡 passa a representar a correção aguardando validação');
  assert.equal(ctx.DATA[0].classification, 'BIRADS', 'a correção provisória está em DATA');
  assert.equal(ctx.DATA[0].name, lesion.name, 'só o campo permitido mudou');
  assert.equal(ctx.saveDataCalls.length, 1, 'persistiu via saveData()');
  const attempt = res.review.attempts[res.review.attempts.length - 1];
  assert.ok(attempt.beforeSnapshot, 'beforeSnapshot precisa existir');
  assert.deepEqual(serialize(attempt.beforeSnapshot), beforeSnapshot, 'snapshot = estado ANTES da importação');
});

test('IA (importar): NÃO existe etapa intermediária de "autorizar correção" (nunca fica em proposed)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'a', reasoning: 'b', proposedChanges: { notes: 'novo' } }));
  assert.equal(res.ok, true);
  assert.equal(review.status, 'applied_pending_validation');
  assert.equal(ctx.getProposedSolutions().length, 0, 'nenhuma proposta fica aguardando autorização');
  const actions = serialize(ctx.getReviewHistory(review.id)).map(h => h.action);
  assert.ok(actions.includes('solution_proposed'));
  assert.ok(actions.includes('before_snapshot_created'));
  assert.ok(actions.includes('changes_applied'));
  const auth = ctx.getReviewHistory(review.id).find(h => h.action === 'application_authorized');
  assert.equal(auth.details.origin, 'import', 'a autorização é registrada como vinda da importação humana');
});

test('IA (importar) + DESFAZER: rollback EXATO restaura o estado anterior e volta para rejected', () => {
  const lesion = makeLesion();
  const original = JSON.parse(JSON.stringify(lesion));
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'a', reasoning: 'b', proposedChanges: { classification: 'BIRADS', notes: 'mudou' } }));
  assert.equal(ctx.DATA[0].classification, 'BIRADS');
  const res = ctx.rollbackAppliedReviewSolution(review.id, 'não serviu');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'rejected');
  assert.deepEqual(serialize(ctx.DATA[0]), original, 'rollback restaura EXATAMENTE o beforeSnapshot');
  assert.equal(ctx.countPendingLesionReviews(), 1, 'volta para pendentes (permite nova tentativa)');
  assert.equal(ctx.countReadyLesionSolutions(), 0);
  assert.equal(ctx.saveDataCalls.length, 2, 'aplicar + desfazer persistem via saveData()');
});

test('IA (importar) + MANTER: approveAppliedReviewSolution -> accepted e encerra a revisão', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'a', reasoning: 'b', proposedChanges: { notes: 'novo' } }));
  const res = ctx.approveAppliedReviewSolution(review.id);
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'accepted');
  assert.ok(res.review.attempts[res.review.attempts.length - 1].approvedAt, 'registra acceptedAt na tentativa');
  assert.equal(ctx.countPendingLesionReviews(), 0);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
});

test('IA (importar): rejected (após desfazer) permite NOVA tentativa com novo snapshot', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'a', reasoning: 'b', proposedChanges: { classification: 'BIRADS' } }));
  ctx.rollbackAppliedReviewSolution(review.id, 'não');
  assert.equal(review.status, 'rejected');
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'c', reasoning: 'd', proposedChanges: { classification: 'TIRADS' } }));
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'applied_pending_validation');
  assert.equal(ctx.DATA[0].classification, 'TIRADS');
  assert.equal(res.review.attempts.length, 2, 'duas tentativas, cada uma com seu snapshot');
  assert.equal(res.review.attempts[1].beforeSnapshot.classification, null, '2º snapshot = estado restaurado ANTES da 2ª aplicação');
});

test('IA (importar): NÃO duplica aplicação — 2ª importação com correção já aplicada é bloqueada', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  const first = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'a', reasoning: 'b', proposedChanges: { classification: 'BIRADS' } }));
  assert.equal(first.ok, true);
  const second = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'c', reasoning: 'd', proposedChanges: { classification: 'TIRADS' } }));
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'not_proposable');
  assert.equal(review.attempts.length, 1, 'não cria tentativa/aplicação duplicada');
  assert.equal(ctx.DATA[0].classification, 'BIRADS', 'a primeira aplicação permanece intacta');
  assert.equal(ctx.saveDataCalls.length, 1);
});

test('IA (importar): images/ownership continuam bloqueados e não alteram DATA nem a imagem', () => {
  const img = { publicId: 'atlas-radiologico/x', assetId: 'A1', label: 'T2', lesionId: 'seed_1', lesionName: 'Adamantinoma', data: 'https://res.cloudinary.com/x/y.jpg' };
  const lesion = makeLesion({ images: [img] });
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'problema de imagem');
  const before = JSON.stringify(ctx.DATA);
  for (const changes of [{ images: [] }, { img: '' }, { lesionId: 'seed_2' }, { lesionName: 'outra' }]) {
    const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'a', reasoning: 'b', proposedChanges: changes }));
    assert.equal(res.ok, false, 'campo proibido rejeitado: ' + Object.keys(changes)[0]);
  }
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA intocada');
  assert.equal(ctx.DATA[0].images.length, 1);
  assert.equal(ctx.DATA[0].images[0].lesionId, 'seed_1', 'ownership preservado');
  assert.equal(review.status, 'pending');
});

test('IA (importar): campos proibidos (images, lesionId) e reviewId errado são REJEITADOS sem alterar nada', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  const before = JSON.stringify(ctx.DATA);
  const bads = [
    { reviewId: review.id, summary: 'x', reasoning: 'y', proposedChanges: { images: [] } },
    { reviewId: review.id, summary: 'x', reasoning: 'y', proposedChanges: { lesionId: 'seed_2' } },
    { reviewId: review.id, summary: 'x', reasoning: 'y', proposedChanges: { tags: 'não é array' } },
    { reviewId: 'lrev_errado', summary: 'x', reasoning: 'y', proposedChanges: { notes: 'ok' } }
  ];
  for (const bad of bads) {
    const res = ctx.importReviewAiSolution(review.id, JSON.stringify(bad));
    assert.equal(res.ok, false);
  }
  assert.equal(review.status, 'pending', 'nada muda em importação inválida');
  assert.equal(JSON.stringify(ctx.DATA), before);
  assert.equal(ctx.countPendingLesionReviews(), 1);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
});

test('IA (importar): JSON inválido é rejeitado', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  const res = ctx.importReviewAiSolution(review.id, '{ isso não é json');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid_json');
  assert.equal(review.status, 'pending');
});

test('IA (importar): rejected (proposta recusada) permite NOVA tentativa (histórico preservado)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  ctx.setReviewSolution(review.id, 'primeira', { classification: 'BIRADS' });
  ctx.rejectProposedReviewSolution(review.id, 'não serve');
  assert.equal(review.status, 'rejected');
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'segunda', reasoning: 'agora vai', proposedChanges: { classification: 'TIRADS' } }));
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'applied_pending_validation', 'nova tentativa também aplica provisoriamente');
  assert.equal(res.review.solution.proposedChanges.classification, 'TIRADS');
  assert.ok(res.review.history.some(h => h.action === 'proposal_rejected'), 'histórico anterior preservado');
});

test('IA (importar): applied_pending_validation, accepted e cancelled BLOQUEIAM nova proposta', () => {
  // applied_pending_validation
  const ctx1 = buildTestContext({ data: [makeLesion()] });
  const r1 = ctx1.createLesionReview('seed_1', 'x').review;
  ctx1.setReviewSolution(r1.id, 'a', { classification: 'BIRADS' });
  ctx1.authorizeAndApplyReviewSolution(r1.id);
  assert.equal(ctx1.importReviewAiSolution(r1.id, JSON.stringify({ reviewId: r1.id, summary: 'b', reasoning: 'c', proposedChanges: { notes: 'z' } })).ok, false);
  assert.equal(ctx1.buildReviewAiPacket(r1.id).ok, false);
  // accepted
  const ctx2 = buildTestContext({ data: [makeLesion()] });
  const r2 = ctx2.createLesionReview('seed_1', 'x').review;
  ctx2.setReviewSolution(r2.id, 'a', { classification: 'BIRADS' });
  ctx2.authorizeAndApplyReviewSolution(r2.id);
  ctx2.approveAppliedReviewSolution(r2.id);
  assert.equal(ctx2.importReviewAiSolution(r2.id, JSON.stringify({ reviewId: r2.id, summary: 'b', reasoning: 'c', proposedChanges: { notes: 'z' } })).ok, false);
  // cancelled
  const ctx3 = buildTestContext({ data: [makeLesion()] });
  const r3 = ctx3.createLesionReview('seed_1', 'x').review;
  ctx3.cancelLesionReview(r3.id, 'ok');
  assert.equal(ctx3.importReviewAiSolution(r3.id, JSON.stringify({ reviewId: r3.id, summary: 'b', reasoning: 'c', proposedChanges: { notes: 'z' } })).ok, false);
});

test('IA (regra): a ponte NÃO cria revisão, NÃO marca accepted, NÃO desfaz e não toca DATA diretamente', () => {
  const packet = extractFn(moduleSource, 'buildReviewAiPacket');
  const prompt = extractFn(moduleSource, 'buildReviewAiPrompt');
  const importer = extractFn(moduleSource, 'importReviewAiSolution');
  for (const src of [packet, prompt, importer]) {
    assert.doesNotMatch(src, /createLesionReview\(/, 'a IA nunca cria revisão');
    assert.doesNotMatch(src, /approveAppliedReviewSolution|rollbackAppliedReviewSolution/, 'a IA nunca mantém (accepted) nem desfaz');
    assert.doesNotMatch(src, /lesionId\s*=|lesionName\s*=/, 'a IA nunca reatribui ownership');
    assert.doesNotMatch(src, /\.images\s*=/, 'a IA nunca altera imagens');
  }
  // A aplicação provisória é DELEGADA à função auditada (única que toca DATA),
  // sempre marcada como origin 'import' — a ação humana de colar/importar.
  assert.match(importer, /authorizeAndApplyReviewSolution\(reviewId, \{ origin:'import' \}\)/);
  assert.match(importer, /flagManualActionRequired\(reviewId,/);
  assert.doesNotMatch(importer, /\bDATA\b/, 'o importador não toca DATA diretamente');
  // ownership segue protegido no código (guarda central)
  assert.match(html, /function canChangeImageOwnership\(image, newLesionId, context\)\{/);
  assert.match(html, /function assertManualImageOwnershipChange\(image, newLesionId, context\)\{/);
});

// ===========================================================================
// PONTE DE IA — RESPOSTAS SEM CAMPOS APLICÁVEIS ({} -> nenhuma alteração ou
// ação manual). Não confundir com "campos inválidos".
// ===========================================================================

test('IA ({}): proposedChanges = {} é resposta VÁLIDA — não é "campos inválidos", não aplica, não altera DATA', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir classificação');
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'Nada a alterar', reasoning: 'está correto', proposedChanges: {} }));
  assert.equal(res.ok, true, '{} NÃO é erro');
  assert.equal(res.applied, false);
  assert.equal(res.outcome, 'no_applicable_changes');
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA intocada');
  assert.equal(ctx.saveDataCalls.length, 0, 'nada persistido');
  assert.equal(review.status, 'pending', 'não vira applied_pending_validation nem accepted');
  assert.notEqual(review.status, 'accepted');
  assert.notEqual(review.status, 'applied_pending_validation');
});

test('IA ({}): missing/null proposedChanges também é tratado como vazio (não quebra)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'revisar texto');
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'ok', reasoning: 'ok' }));
  assert.equal(res.ok, true);
  assert.equal(res.outcome, 'no_applicable_changes');
  assert.equal(ctx.DATA.length, 1);
  assert.equal(ctx.saveDataCalls.length, 0);
});

test('IA ({}): pedido de REMOÇÃO DE IMAGEM vira manual_action_required (sem tocar DATA/ownership)', () => {
  const img = { publicId: 'atlas-radiologico/x', assetId: 'A1', label: 'T2', lesionId: 'seed_1', lesionName: 'Adamantinoma', data: 'https://res.cloudinary.com/x/y.jpg' };
  const lesion = makeLesion({ images: [img] });
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'remover imagem que adicionei para teste');
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'Não é possível remover imagem pela IA', reasoning: 'images é proibido', proposedChanges: {} }));
  assert.equal(res.ok, true);
  assert.equal(res.applied, false);
  assert.equal(res.outcome, 'manual_action_required');
  assert.equal(res.review.status, 'manual_action_required');
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA intocada');
  assert.equal(ctx.DATA[0].images.length, 1, 'imagem continua lá');
  assert.equal(ctx.DATA[0].images[0].lesionId, 'seed_1', 'ownership preservado');
  assert.equal(ctx.countPendingLesionReviews(), 0, 'sai da fila de pendentes (não fica travado)');
  assert.equal(ctx.getManualActionSolutions().length, 1);
  assert.equal(ctx.countReadyLesionSolutions(), 1, 'aparece no 💡');
  assert.ok(res.review.solution.text.length > 0, 'guarda o resumo da IA');
  assert.ok(res.review.history.some(h => h.action === 'manual_action_required'));
});

test('IA ({}): pedido com ownership/estrutura também vira manual_action_required', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'corrigir o lesionId estrutural do registro');
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'depende de ownership', reasoning: 'não é campo permitido', proposedChanges: {} }));
  assert.equal(res.outcome, 'manual_action_required');
  assert.equal(res.review.status, 'manual_action_required');
  assert.equal(ctx.DATA[0].lesionId, undefined, 'nada estrutural foi alterado');
});

test('IA (manual): NÃO conta como accepted nem applied_pending_validation e não altera DATA', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'remover imagem');
  const before = JSON.stringify(ctx.DATA);
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'só manual', reasoning: 'imagem', proposedChanges: {} }));
  assert.notEqual(review.status, 'accepted');
  assert.notEqual(review.status, 'applied_pending_validation');
  assert.equal(ctx.getAppliedSolutionsAwaitingValidation().length, 0);
  assert.equal(ctx.getProposedSolutions().length, 0);
  assert.equal(JSON.stringify(ctx.DATA), before);
  assert.equal(ctx.saveDataCalls.length, 0, 'marcar ação manual não persiste DATA');
});

test('IA (manual): "Voltar para revisões" reabre em pending e permite nova tentativa', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'remover imagem');
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'x', reasoning: 'imagem', proposedChanges: {} }));
  assert.equal(review.status, 'manual_action_required');
  const res = ctx.reopenManualActionReview(review.id);
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'pending');
  assert.equal(ctx.countPendingLesionReviews(), 1);
  assert.equal(ctx.getManualActionSolutions().length, 0);
  assert.ok(res.review.history.some(h => h.action === 'manual_action_reopened'));
});

test('IA (manual): cancelar continua funcionando em manual_action_required', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'remover imagem');
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'x', reasoning: 'imagem', proposedChanges: {} }));
  const res = ctx.cancelLesionReview(review.id, 'resolvi na mão');
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'cancelled');
  assert.equal(ctx.getManualActionSolutions().length, 0);
  assert.equal(ctx.countReadyLesionSolutions(), 0);
});

test('IA (manual): flagManualActionRequired não aplica proposta nem cria revisão', () => {
  const src = extractFn(moduleSource, 'flagManualActionRequired');
  assert.doesNotMatch(src, /createLesionReview\(/);
  assert.doesNotMatch(src, /\bDATA\b/);
  assert.doesNotMatch(src, /authorizeAndApplyReviewSolution|approveAppliedReviewSolution|rollbackAppliedReviewSolution/);
  assert.doesNotMatch(src, /\.images\s*=/);
});

test('IA (UI): há botão para abrir a lesão na correção manual e ele NÃO remove imagem automaticamente', () => {
  const manualModal = extractFn(html, 'openManualActionModal');
  assert.match(manualModal, /Abrir lesão/);
  assert.match(manualModal, /openDetail\(meta\.lesion\.id\)/);
  assert.doesNotMatch(manualModal, /removeImage|deleteImage|splice\(|\.images\s*=/, 'abrir a lesão não remove/mexe em imagem');
  const solutionsModal = extractFn(html, 'openReadySolutionsModal');
  assert.match(solutionsModal, /Abrir lesão/);
});

test('IA (normal): proposta com notes/tags continua aplicando provisoriamente', () => {
  const lesion = makeLesion();
  const ctx = buildTestContext({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'ajustar texto');
  const res = ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'ajuste', reasoning: 'clareza', proposedChanges: { notes: 'novo texto', tags: ['a', 'b'] } }));
  assert.equal(res.ok, true);
  assert.equal(res.applied, true);
  assert.equal(res.review.status, 'applied_pending_validation');
  assert.equal(ctx.DATA[0].notes, 'novo texto');
  assert.deepEqual(serialize(ctx.DATA[0].tags), ['a', 'b']);
  assert.equal(ctx.DATA[0].name, lesion.name, 'campos não citados ficam iguais');
  assert.equal(ctx.saveDataCalls.length, 1);
});


// ===========================================================================
// FLUXO EM LOTE (várias revisões em UM prompt / UM JSON)
// ===========================================================================

function makeBatchCtx(){
  const lesions = [
    makeLesion({ id: 'seed_1', name: 'Adamantinoma' }),
    makeLesion({ id: 'seed_2', name: 'Osteocondroma' }),
    makeLesion({ id: 'seed_3', name: 'Osteoma osteoide' })
  ];
  const ctx = buildTestContext({ data: lesions });
  const r1 = ctx.createLesionReview('seed_1', 'corrigir classificação').review;
  const r2 = ctx.createLesionReview('seed_2', 'remover imagem que adicionei para teste').review;
  const r3 = ctx.createLesionReview('seed_3', 'revisar descrição').review;
  return { ctx, r1, r2, r3 };
}

test('LOTE: getBatchEligibleReviews() coleta só pending/rejected e exclui applied/accepted/cancelled/manual', () => {
  const { ctx, r1, r2, r3 } = makeBatchCtx();
  assert.equal(ctx.getBatchEligibleReviews().length, 3);
  // applied
  ctx.setReviewSolution(r1.id, 'x', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(r1.id);
  // accepted
  ctx.setReviewSolution(r3.id, 'x', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(r3.id);
  ctx.approveAppliedReviewSolution(r3.id);
  // manual
  ctx.importReviewAiSolution(r2.id, JSON.stringify({ reviewId: r2.id, summary: 'x', reasoning: 'imagem', proposedChanges: {} }));
  const eligible = ctx.getBatchEligibleReviews();
  assert.equal(eligible.length, 0, 'nada elegível quando todos saíram de pending/rejected');
  // rejected volta a ser elegível
  const r4 = ctx.createLesionReview('seed_1', 'outro pedido').review;
  ctx.setReviewSolution(r4.id, 'x', { notes: 'y' });
  ctx.rejectProposedReviewSolution(r4.id, 'não serve');
  assert.equal(ctx.getBatchEligibleReviews().length, 1);
  assert.equal(ctx.getBatchEligibleReviews()[0].status, 'rejected');
});

test('LOTE: seleção parcial gera pacote só com os reviewIds escolhidos', () => {
  const { ctx, r1, r2 } = makeBatchCtx();
  const built = ctx.buildReviewAiBatchPacket([r1.id, r2.id]);
  assert.equal(built.ok, true);
  assert.equal(built.packet.count, 2);
  assert.deepEqual(serialize(built.packet.reviews.map(p => p.reviewId)).sort(), [r1.id, r2.id].sort());
});

test('LOTE: pacote com várias revisões contém reviewId/lesionId/requestText/currentFields sem blobs', () => {
  const img = { publicId: 'atlas-radiologico/x', assetId: 'A1', label: 'T2', lesionId: 'seed_1', lesionName: 'Adamantinoma', data: 'https://res.cloudinary.com/x/y.jpg' };
  const lesions = [makeLesion({ id: 'seed_1', name: 'Adamantinoma', images: [img] }), makeLesion({ id: 'seed_2', name: 'Osteocondroma' })];
  const ctx = buildTestContext({ data: lesions });
  const a = ctx.createLesionReview('seed_1', 'pedido A').review;
  const b = ctx.createLesionReview('seed_2', 'pedido B').review;
  const built = ctx.buildReviewAiBatchPacket([a.id, b.id]);
  assert.equal(built.packet.reviews.length, 2);
  const p1 = built.packet.reviews.find(p => p.reviewId === a.id);
  assert.equal(p1.lesionId, 'seed_1');
  assert.equal(p1.requestText, 'pedido A');
  assert.deepEqual(serialize(p1.allowedFields), ['name', 'notes', 'classification', 'tags', 'enTerm']);
  assert.equal(p1.images[0].publicId, 'atlas-radiologico/x');
  assert.equal(p1.images[0].data, undefined, 'sem blob/binário');
});

test('LOTE: prompt em lote explica o formato e manda devolver TODOS os reviewIds', () => {
  const { ctx, r1, r2 } = makeBatchCtx();
  const built = ctx.buildReviewAiBatchPrompt([r1.id, r2.id]);
  assert.equal(built.ok, true);
  assert.match(built.text, /result": "apply|"apply"/);
  assert.match(built.text, /manual_action_required/);
  assert.match(built.text, /no_change/);
  assert.match(built.text, /Retorne TODOS os reviewIds/);
  assert.match(built.text, /SOMENTE com JSON válido/);
  assert.match(built.text, new RegExp(r1.id));
  assert.match(built.text, new RegExp(r2.id));
});

test('LOTE: importação de vários resultados processa cada um independentemente', () => {
  const { ctx, r1, r2, r3 } = makeBatchCtx();
  const before = JSON.stringify(ctx.DATA);
  const payload = {
    results: [
      { reviewId: r1.id, result: 'apply', summary: 'ok', reasoning: 'clareza', proposedChanges: { notes: 'novo texto' } },
      { reviewId: r2.id, result: 'manual_action_required', summary: 'só manual', reasoning: 'imagem', manualAction: { type: 'image_removal', description: 'Remover imagem de teste' }, proposedChanges: {} },
      { reviewId: r3.id, result: 'no_change', summary: 'está ok', reasoning: 'nada a fazer', proposedChanges: {} }
    ]
  };
  const res = ctx.importReviewAiBatch(JSON.stringify(payload));
  assert.equal(res.ok, true);
  assert.deepEqual(serialize(res.summary), { processed: 3, applied: 1, manual: 1, noChange: 1, failed: 0 });
  assert.equal(r1.status, 'applied_pending_validation');
  assert.equal(ctx.DATA[0].notes, 'novo texto', 'apply escreveu o campo permitido');
  assert.equal(r2.status, 'manual_action_required');
  assert.equal(r3.status, 'pending', 'no_change NÃO altera status');
  // DATA só mudou no campo do apply
  assert.equal(ctx.DATA[1].notes, before ? JSON.parse(before)[1].notes : ctx.DATA[1].notes);
  assert.equal(ctx.DATA[1].images.length, 0);
  assert.equal(ctx.DATA[2].notes, JSON.parse(before)[2].notes);
});

test('LOTE: cada apply cria o SEU beforeSnapshot (independentes) e aplica provisoriamente', () => {
  const { ctx, r1, r3 } = makeBatchCtx();
  const payload = {
    results: [
      { reviewId: r1.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { classification: 'BIRADS' } },
      { reviewId: r3.id, result: 'apply', summary: 'c', reasoning: 'd', proposedChanges: { tags: ['x'] } }
    ]
  };
  const res = ctx.importReviewAiBatch(JSON.stringify(payload));
  assert.equal(res.summary.applied, 2);
  assert.equal(r1.attempts.length, 1);
  assert.equal(r3.attempts.length, 1);
  assert.equal(r1.attempts[0].beforeSnapshot.classification, null);
  assert.equal(r3.attempts[0].beforeSnapshot.tags.join(','), 'lítica,excêntrica');
  assert.notEqual(r1.attempts[0].id, r3.attempts[0].id, 'snapshots/tentativas independentes');
  assert.equal(ctx.DATA[0].classification, 'BIRADS');
  assert.equal(ctx.countReadyLesionSolutions(), 2, 'as duas aparecem em Validar correções');
  assert.equal(ctx.countPendingLesionReviews(), 1, 'só a manual saiu... (r2 não estava no lote)');
});

test('LOTE: manual_action_required e no_change NÃO alteram DATA', () => {
  const { ctx, r2, r3 } = makeBatchCtx();
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: r2.id, result: 'manual_action_required', summary: 'x', reasoning: 'imagem', manualAction: { type: 'image_removal', description: 'remover' }, proposedChanges: {} },
    { reviewId: r3.id, result: 'no_change', summary: 'y', reasoning: 'ok', proposedChanges: {} }
  ] }));
  assert.equal(res.summary.applied, 0);
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA intocada');
  assert.equal(ctx.saveDataCalls.length, 0, 'nenhum apply => nenhum saveData');
  assert.equal(ctx.getManualActionSolutions().length, 1);
});

test('LOTE: um item inválido NÃO bloqueia os outros (parcial)', () => {
  const { ctx, r1, r2, r3 } = makeBatchCtx();
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: r1.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { notes: 'ok' } },
    { reviewId: 'lrev_inexistente', result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { notes: 'x' } },
    { reviewId: r2.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { images: [] } },
    { reviewId: r3.id, result: 'no_change', summary: 'a', reasoning: 'b', proposedChanges: {} }
  ] }));
  assert.deepEqual(serialize(res.summary), { processed: 4, applied: 1, manual: 0, noChange: 1, failed: 2 });
  assert.equal(r1.status, 'applied_pending_validation', 'item válido continua aplicado');
  assert.equal(r2.status, 'pending', 'campo proibido falha apenas naquele item');
  assert.equal(r3.status, 'pending');
  const failed = res.items.filter(i => i.status === 'failed');
  assert.equal(failed[0].reason, 'not_found');
  assert.equal(failed[1].reason, 'invalid_changes');
  assert.equal(failed[1].detail, 'forbidden_field:images');
  assert.equal(ctx.DATA[0].notes, 'ok');
  assert.equal(ctx.DATA[1].images.length, 0, 'images não foi tocado');
});

test('LOTE: ownership/lesionId continua protegido e images proibido', () => {
  const img = { publicId: 'atlas-radiologico/x', assetId: 'A1', lesionId: 'seed_1', lesionName: 'Adamantinoma', data: 'u' };
  const lesions = [makeLesion({ id: 'seed_1', images: [img] }), makeLesion({ id: 'seed_2', name: 'Osteocondroma' })];
  const ctx = buildTestContext({ data: lesions });
  const a = ctx.createLesionReview('seed_1', 'x').review;
  const b = ctx.createLesionReview('seed_2', 'y').review;
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: a.id, result: 'apply', summary: 's', reasoning: 'r', proposedChanges: { lesionId: 'seed_2' } },
    { reviewId: b.id, result: 'apply', summary: 's', reasoning: 'r', proposedChanges: { images: [] } }
  ] }));
  assert.equal(res.summary.applied, 0);
  assert.equal(res.summary.failed, 2);
  assert.equal(JSON.stringify(ctx.DATA), before);
  assert.equal(ctx.DATA[0].images[0].lesionId, 'seed_1', 'ownership preservado');
});

test('LOTE: reimportar o MESMO JSON não duplica aplicação (detecta já processado)', () => {
  const { ctx, r1 } = makeBatchCtx();
  const json = JSON.stringify({ results: [
    { reviewId: r1.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { notes: 'ok' } }
  ] });
  const first = ctx.importReviewAiBatch(json);
  assert.equal(first.summary.applied, 1);
  assert.equal(r1.attempts.length, 1);
  const second = ctx.importReviewAiBatch(json);
  assert.equal(second.summary.applied, 0);
  assert.equal(second.summary.failed, 1);
  assert.equal(second.items[0].reason, 'not_proposable');
  assert.equal(r1.attempts.length, 1, 'não cria tentativa duplicada');
  assert.equal(ctx.saveDataCalls.length, 1);
});

test('LOTE: reviewId duplicado dentro do mesmo lote falha no segundo (sem duplicar)', () => {
  const { ctx, r1 } = makeBatchCtx();
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: r1.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: { notes: 'ok' } },
    { reviewId: r1.id, result: 'apply', summary: 'c', reasoning: 'd', proposedChanges: { notes: 'outro' } }
  ] }));
  assert.equal(res.summary.applied, 1);
  assert.equal(res.summary.failed, 1);
  assert.equal(res.items[1].reason, 'duplicate_review_id');
  assert.equal(r1.attempts.length, 1);
});

test('LOTE: JSON geral inválido / results não-array é rejeitado sem tocar nada', () => {
  const { ctx } = makeBatchCtx();
  const before = JSON.stringify(ctx.DATA);
  assert.equal(ctx.importReviewAiBatch('{ nao eh json').ok, false);
  assert.equal(ctx.importReviewAiBatch('{ nao eh json').reason, 'invalid_json');
  const bad = ctx.importReviewAiBatch(JSON.stringify({ results: 'nope' }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'invalid_shape');
  assert.equal(JSON.stringify(ctx.DATA), before);
});

test('LOTE: result desconhecido falha apenas naquele item', () => {
  const { ctx, r1, r3 } = makeBatchCtx();
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: r1.id, result: 'destroy_everything', summary: 'a', reasoning: 'b', proposedChanges: { notes: 'x' } },
    { reviewId: r3.id, result: 'no_change', summary: 'a', reasoning: 'b', proposedChanges: {} }
  ] }));
  assert.equal(res.summary.failed, 1);
  assert.equal(res.summary.noChange, 1);
  assert.equal(res.items[0].reason, 'invalid_result');
  assert.equal(r1.status, 'pending');
});

test('LOTE: fila Ações manuais funciona (aparece em getManualActionSolutions e pode reabrir)', () => {
  const { ctx, r2 } = makeBatchCtx();
  ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: r2.id, result: 'manual_action_required', summary: 's', reasoning: 'r', manualAction: { type: 'image_removal', description: 'Remover imagem de teste' }, proposedChanges: {} }
  ] }));
  const manual = ctx.getManualActionSolutions();
  assert.equal(manual.length, 1);
  assert.equal(manual[0].status, 'manual_action_required');
  assert.equal(manual[0].manualActionReason, 'Remover imagem de teste');
  assert.equal(ctx.countReadyLesionSolutions(), 1, 'entra no 💡 (aba Ações manuais)');
  assert.equal(ctx.reopenManualActionReview(r2.id).ok, true);
  assert.equal(ctx.getManualActionSolutions().length, 0);
});

test('LOTE: apply sem campos permitidos falha naquele item (não vira no_change)', () => {
  const { ctx, r1 } = makeBatchCtx();
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: r1.id, result: 'apply', summary: 'a', reasoning: 'b', proposedChanges: {} }
  ] }));
  assert.equal(res.summary.failed, 1);
  assert.equal(res.items[0].reason, 'invalid_changes');
  assert.equal(res.items[0].detail, 'empty_changes');
  assert.equal(r1.status, 'pending');
});

test('LOTE: buildReviewAiBatchPrompt falha graciosamente sem revisões elegíveis', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const res = ctx.buildReviewAiBatchPrompt([]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_eligible_reviews');
});

test('LOTE: fluxo individual continua funcionando (fallback preservado)', () => {
  const { ctx, r1 } = makeBatchCtx();
  const built = ctx.buildReviewAiPrompt(r1.id);
  assert.equal(built.ok, true);
  const res = ctx.importReviewAiSolution(r1.id, JSON.stringify({ reviewId: r1.id, summary: 'a', reasoning: 'b', proposedChanges: { notes: 'individual' } }));
  assert.equal(res.ok, true);
  assert.equal(res.applied, true);
  assert.equal(r1.status, 'applied_pending_validation');
});


// ===========================================================================
// FEEDBACK HUMANO NAS PRÓXIMAS TENTATIVAS DA IA
// ===========================================================================

test('FEEDBACK: motivo de recusa é persistido (rejectionReason + humanFeedback) e aparece no histórico', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta', { notes: 'y' });
  const res = ctx.rejectProposedReviewSolution(review.id, 'continua incompleto, falta diferenciar de lesão Y');
  assert.equal(res.ok, true);
  assert.equal(review.rejectionReason, 'continua incompleto, falta diferenciar de lesão Y');
  assert.equal(review.lastHumanFeedback, 'continua incompleto, falta diferenciar de lesão Y');
  assert.equal(review.humanFeedback.length, 1);
  assert.equal(review.humanFeedback[0].kind, 'proposal_rejected');
  assert.equal(review.humanFeedback[0].text, 'continua incompleto, falta diferenciar de lesão Y');
  const h = ctx.getReviewHistory(review.id).find(x => x.action === 'proposal_rejected');
  assert.equal(h.details.reason, 'continua incompleto, falta diferenciar de lesão Y');
});

test('FEEDBACK: motivo de rollback é persistido (rollbackReason + tentativa + humanFeedback)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta', { classification: 'BIRADS' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  const res = ctx.rollbackAppliedReviewSolution(review.id, 'classificação errada pro órgão');
  assert.equal(res.ok, true);
  assert.equal(review.rollbackReason, 'classificação errada pro órgão');
  assert.equal(review.lastHumanFeedback, 'classificação errada pro órgão');
  assert.equal(review.attempts[0].rollbackReason, 'classificação errada pro órgão');
  assert.equal(review.humanFeedback[0].kind, 'rollback');
  assert.equal(review.humanFeedback[0].attemptId, review.attempts[0].id);
});

test('FEEDBACK: recusa sem motivo não cria feedback vazio', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta', { notes: 'y' });
  ctx.rejectProposedReviewSolution(review.id, '   ');
  assert.equal(review.rejectionReason, null);
  assert.deepEqual(serialize(review.humanFeedback), []);
  assert.equal(review.lastHumanFeedback, undefined);
});

test('FEEDBACK: motivo de recusa sobrevive a reload/F5', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta', { notes: 'y' });
  ctx.rejectProposedReviewSolution(review.id, 'continua incompleto');
  await ctx.loadLesionRevisions();
  const reloaded = readGlobal(ctx, 'LESION_REVISIONS');
  assert.equal(reloaded[review.id].rejectionReason, 'continua incompleto');
  assert.equal(reloaded[review.id].lastHumanFeedback, 'continua incompleto');
  assert.equal(reloaded[review.id].humanFeedback[0].text, 'continua incompleto');
  assert.equal(reloaded[review.id].status, 'rejected');
});

test('FEEDBACK: buildReviewAiPacket inclui humanFeedback/latestHumanFeedback/previousOutcome', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta X', { notes: 'y' }, { summary: 'resumo X', reasoning: 'porque X' });
  ctx.rejectProposedReviewSolution(review.id, 'continua incompleto, falta diferenciar de lesão Y');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.ok, true);
  assert.equal(built.packet.latestHumanFeedback, 'continua incompleto, falta diferenciar de lesão Y');
  assert.equal(built.packet.previousOutcome, 'rejected');
  assert.equal(built.packet.previousAttempts.length, 1);
  assert.equal(built.packet.previousAttempts[0].outcome, 'rejected');
  assert.equal(built.packet.previousAttempts[0].humanFeedback, 'continua incompleto, falta diferenciar de lesão Y');
  assert.equal(built.packet.previousAttempts[0].summary, 'resumo X');
  assert.equal(built.packet.previousAttempts[0].reasoning, 'porque X');
  assert.equal(built.packet.previousAttempts[0].proposedChanges.notes, 'y');
  assert.equal(built.packet.previousSolution.summary, 'resumo X');
});

test('FEEDBACK: buildReviewAiPrompt inclui o feedback humano e manda NÃO repetir a solução recusada', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta X', { notes: 'y' }, { summary: 'resumo X', reasoning: 'porque X' });
  ctx.rejectProposedReviewSolution(review.id, 'continua incompleto, falta diferenciar de lesão Y');
  const built = ctx.buildReviewAiPrompt(review.id);
  assert.equal(built.ok, true);
  assert.match(built.text, /continua incompleto, falta diferenciar de lesão Y/);
  assert.match(built.text, /JÁ TEVE TENTATIVA/);
  assert.match(built.text, /NÃO repita uma solução que já foi recusada/);
  assert.match(built.text, /feedback humano/);
});

test('FEEDBACK: previousAttempts preserva TODAS as propostas anteriores em ordem', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'primeira', { notes: '1' }, { summary: 's1', reasoning: 'r1' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo 1');
  ctx.setReviewSolution(review.id, 'segunda', { classification: 'BIRADS' }, { summary: 's2', reasoning: 'r2' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.rollbackAppliedReviewSolution(review.id, 'motivo 2');
  const built = ctx.buildReviewAiPacket(review.id);
  const at = built.packet.previousAttempts;
  assert.equal(at.length, 2);
  assert.equal(at[0].attempt, 1);
  assert.equal(at[0].outcome, 'rejected');
  assert.equal(at[0].humanFeedback, 'motivo 1');
  assert.equal(at[0].summary, 's1');
  assert.equal(at[1].attempt, 2);
  assert.equal(at[1].outcome, 'rolledback');
  assert.equal(at[1].humanFeedback, 'motivo 2');
  assert.equal(at[1].proposedChanges.classification, 'BIRADS');
  assert.equal(built.packet.previousOutcome, 'rolledback');
  assert.equal(built.packet.latestHumanFeedback, 'motivo 2');
});

test('FEEDBACK: gerar pacote/prompt é READ-ONLY (não cria tentativa nem histórico)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'proposta', { notes: 'y' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo');
  const hLen = review.history.length;
  const aLen = review.attempts.length;
  ctx.buildReviewAiPacket(review.id);
  ctx.buildReviewAiPrompt(review.id);
  ctx.buildReviewAiPacket(review.id);
  assert.equal(review.history.length, hLen, 'gerar pacote não adiciona histórico');
  assert.equal(review.attempts.length, aLen, 'gerar pacote não cria tentativa');
});

test('FEEDBACK: revisão rejected gera nova tentativa com o contexto anterior no pacote', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'diferenciar de lesão Y');
  ctx.setReviewSolution(review.id, 'X', { notes: 'X' }, { summary: 'X', reasoning: 'X' });
  ctx.rejectProposedReviewSolution(review.id, 'continua incompleto, falta diferenciar de lesão Y');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.ok, true, 'rejected é elegível para nova tentativa');
  assert.equal(built.packet.previousAttempts[0].summary, 'X');
  assert.equal(built.packet.previousAttempts[0].outcome, 'rejected');
  assert.equal(built.packet.latestHumanFeedback, 'continua incompleto, falta diferenciar de lesão Y');
});

test('FEEDBACK: fluxo em LOTE inclui o feedback de cada revisão e instrução global', () => {
  const ctx = buildTestContext({ data: [makeLesion({ id: 'seed_1' }), makeLesion({ id: 'seed_2', name: 'Osteocondroma' })] });
  const a = ctx.createLesionReview('seed_1', 'pedido A').review;
  const b = ctx.createLesionReview('seed_2', 'pedido B').review;
  ctx.setReviewSolution(a.id, 'X', { notes: 'X' }, { summary: 'sX', reasoning: 'rX' });
  ctx.rejectProposedReviewSolution(a.id, 'não serve, falta Y');
  const built = ctx.buildReviewAiBatchPacket([a.id, b.id]);
  assert.equal(built.ok, true);
  const pa = built.packet.reviews.find(p => p.reviewId === a.id);
  assert.equal(pa.previousAttempts.length, 1);
  assert.equal(pa.previousAttempts[0].humanFeedback, 'não serve, falta Y');
  assert.equal(pa.latestHumanFeedback, 'não serve, falta Y');
  assert.equal(pa.previousOutcome, 'rejected');
  const prompt = ctx.buildReviewAiBatchPrompt([a.id, b.id]);
  assert.match(prompt.text, /feedback humano/);
  assert.match(prompt.text, /Não repita uma solução já recusada/);
  assert.match(prompt.text, /não serve, falta Y/);
});

test('FEEDBACK: accepted/cancelled não entram em nova tentativa (pacote bloqueado e fora do lote)', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const accepted = ctx.createLesionReview('seed_1', 'x').review;
  ctx.setReviewSolution(accepted.id, 'a', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(accepted.id);
  ctx.approveAppliedReviewSolution(accepted.id);
  assert.equal(ctx.buildReviewAiPacket(accepted.id).ok, false);
  const cancelled = ctx.createLesionReview('seed_1', 'outro').review;
  ctx.cancelLesionReview(cancelled.id, 'resolvido');
  assert.equal(ctx.buildReviewAiPacket(cancelled.id).ok, false);
  const eligibleIds = ctx.getBatchEligibleReviews().map(r => r.id);
  assert.ok(!eligibleIds.includes(accepted.id));
  assert.ok(!eligibleIds.includes(cancelled.id));
});

test('FEEDBACK: importar a solução da IA guarda summary/reasoning para a próxima tentativa', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.importReviewAiSolution(review.id, JSON.stringify({ reviewId: review.id, summary: 'resumo IA', reasoning: 'raciocínio IA', proposedChanges: { notes: 'novo' } }));
  ctx.rollbackAppliedReviewSolution(review.id, 'não funcionou');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.previousAttempts[0].summary, 'resumo IA');
  assert.equal(built.packet.previousAttempts[0].reasoning, 'raciocínio IA');
  assert.equal(built.packet.previousAttempts[0].humanFeedback, 'não funcionou');
});


// ===========================================================================
// CONSISTÊNCIA DO CONTEXTO: latestHumanFeedback derivado + texto legado
// ===========================================================================

test('CONTEXTO: latestHumanFeedback null mas previousAttempts com feedback -> deriva o mais recente não vazio', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'X', { notes: 'y' }, { summary: 's', reasoning: 'r' });
  ctx.rejectProposedReviewSolution(review.id, 'nao gostei das tags, ta praticamente falando o diagnostico');
  delete review.lastHumanFeedback; // simula registro histórico (campo direto ausente)
  assert.equal(review.lastHumanFeedback, undefined);
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.latestHumanFeedback, 'nao gostei das tags, ta praticamente falando o diagnostico');
  assert.equal(built.packet.previousAttempts[0].humanFeedback, 'nao gostei das tags, ta praticamente falando o diagnostico');
});

test('CONTEXTO: rolledback histórico sem campo direto -> latestHumanFeedback derivado', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'X', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(review.id);
  ctx.rollbackAppliedReviewSolution(review.id, 'teste de rollback');
  delete review.lastHumanFeedback;
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.latestHumanFeedback, 'teste de rollback');
  assert.equal(built.packet.previousOutcome, 'rolledback');
});

test('CONTEXTO: múltiplas tentativas -> usa o feedback NÃO VAZIO mais recente', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'A', { notes: '1' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo 1');
  ctx.setReviewSolution(review.id, 'B', { notes: '2' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo 2');
  delete review.lastHumanFeedback;
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.previousAttempts.length, 2);
  assert.equal(built.packet.latestHumanFeedback, 'motivo 2');
});

test('CONTEXTO: tentativa mais recente sem feedback -> procura o último feedback não vazio anterior', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'A', { notes: '1' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo 1');
  ctx.setReviewSolution(review.id, 'B', { notes: '2' });
  ctx.rejectProposedReviewSolution(review.id, ''); // sem feedback
  delete review.lastHumanFeedback;
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.previousAttempts.length, 2);
  assert.equal(built.packet.previousAttempts[1].humanFeedback, null);
  assert.equal(built.packet.latestHumanFeedback, 'motivo 1', 'cai no feedback não vazio anterior');
});

test('CONTEXTO: campo direto lastHumanFeedback tem PRIORIDADE sobre previousAttempts', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'A', { notes: '1' });
  ctx.rejectProposedReviewSolution(review.id, 'feedback antigo da tentativa');
  review.lastHumanFeedback = 'feedback direto mais novo';
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.latestHumanFeedback, 'feedback direto mais novo');
});

test('CONTEXTO: sem nenhuma informação de feedback -> continua null', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido sem tentativa');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.previousAttempts.length, 0);
  assert.equal(built.packet.latestHumanFeedback, null);
  assert.equal(built.packet.previousOutcome, null);
});

test('CONTEXTO: pacote em LOTE herda a mesma normalização por revisão', () => {
  const ctx = buildTestContext({ data: [makeLesion({ id: 'seed_1' }), makeLesion({ id: 'seed_2', name: 'Osteocondroma' })] });
  const a = ctx.createLesionReview('seed_1', 'A').review;
  const b = ctx.createLesionReview('seed_2', 'B').review;
  ctx.setReviewSolution(a.id, 'X', { notes: 'y' });
  ctx.authorizeAndApplyReviewSolution(a.id);
  ctx.rollbackAppliedReviewSolution(a.id, 'teste de rollback');
  delete a.lastHumanFeedback;
  ctx.setReviewSolution(b.id, 'Z', { notes: 'w' });
  ctx.rejectProposedReviewSolution(b.id, 'nao gostei das tags');
  delete b.lastHumanFeedback;
  const built = ctx.buildReviewAiBatchPacket([a.id, b.id]);
  const pa = built.packet.reviews.find(p => p.reviewId === a.id);
  const pb = built.packet.reviews.find(p => p.reviewId === b.id);
  assert.equal(pa.latestHumanFeedback, 'teste de rollback');
  assert.equal(pb.latestHumanFeedback, 'nao gostei das tags');
});

test('CONTEXTO: derivação é READ-ONLY (não altera a revisão nem grava no storage)', async () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'X', { notes: 'y' });
  ctx.rejectProposedReviewSolution(review.id, 'motivo historico');
  delete review.lastHumanFeedback;
  const before = JSON.stringify(readGlobal(ctx, 'LESION_REVISIONS'));
  const hLen = review.history.length;
  ctx.buildReviewAiPacket(review.id);
  ctx.buildReviewAiBatchPacket([review.id]);
  ctx.buildReviewAiPrompt(review.id);
  assert.equal(JSON.stringify(readGlobal(ctx, 'LESION_REVISIONS')), before, 'não escreve de volta');
  assert.equal(review.history.length, hLen, 'não cria histórico');
  assert.equal(review.lastHumanFeedback, undefined, 'não grava o campo derivado');
  assert.equal(ctx.saveDataCalls.length, 0);
});

test('CONTEXTO: summary/reasoning vazios com previousSolution.text legado -> mantém text, sem inventar summary', () => {
  const ctx = buildTestContext({ data: [makeLesion()] });
  const { review } = ctx.createLesionReview('seed_1', 'x');
  ctx.setReviewSolution(review.id, 'texto legado da proposta anterior', { notes: 'y' }); // sem meta
  ctx.rejectProposedReviewSolution(review.id, 'motivo');
  const built = ctx.buildReviewAiPacket(review.id);
  assert.equal(built.packet.previousAttempts[0].summary, '');
  assert.equal(built.packet.previousAttempts[0].reasoning, '');
  assert.equal(built.packet.previousAttempts[0].text, 'texto legado da proposta anterior');
  assert.equal(built.packet.previousSolution.text, 'texto legado da proposta anterior');
});


// ===========================================================================
// LOCALIZAÇÃO ADICIONAL sugerida pela IA (altPlacements)
// ===========================================================================

function makePlacementCtx(){
  const lesions = [
    makeLesion({ id: 'seed_1', name: 'Holoprosencefalia', s: 'Medicina Fetal', site: 'Anomalias fetais estruturais' }),
    makeLesion({ id: 'seed_2', name: 'Agenesia do corpo caloso', s: 'Medicina Fetal', site: 'Anomalias fetais estruturais' }),
    makeLesion({ id: 'seed_9', name: 'Outra', s: 'Neurorradiologia', site: 'Encéfalo' })
  ];
  const ctx = buildTestContext({ data: lesions });
  return { ctx, lesions };
}
function placementJson(reviewId, section, site){
  return JSON.stringify({ reviewId, result: 'manual_action_required', summary: 'adicionar seção', reasoning: 'também aparece em neurorradio', manualAction: { type: 'additional_section_placement', description: 'também deve aparecer em Neurorradiologia', suggestedPlacement: { section, site } }, proposedChanges: {} });
}

test('LOCAL: IA pode sugerir additional_section_placement e a sugestão é armazenada SEM alterar DATA', () => {
  const { ctx, lesions } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'também deve aparecer em neurorradio').review;
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Encéfalo'))] }));
  assert.equal(res.summary.manual, 1);
  assert.equal(r.status, 'manual_action_required');
  assert.equal(r.manualAction.type, 'additional_section_placement');
  assert.deepEqual(serialize(r.manualAction.suggestedPlacement), { section: 'Neurorradiologia', site: 'Encéfalo' });
  assert.equal(JSON.stringify(ctx.DATA), before, 'DATA intocada ao apenas sugerir');
  assert.equal(lesions[0].altPlacements, undefined);
  assert.equal(ctx.saveDataCalls.length, 0);
});

test('LOCAL: site null é aceito (aplicação pedirá o sítio depois)', () => {
  const { ctx } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', null))] }));
  assert.equal(res.summary.manual, 1);
  assert.equal(r.manualAction.suggestedPlacement.site, null);
});

test('LOCAL: seção inexistente é REJEITADA (item falha, nada muda)', () => {
  const { ctx } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Seção Que Não Existe', null))] }));
  assert.equal(res.summary.failed, 1);
  assert.equal(res.items[0].reason, 'invalid_placement');
  assert.equal(res.items[0].detail, 'unknown_section');
  assert.equal(r.status, 'pending');
  assert.equal(JSON.stringify(ctx.DATA), before);
});

test('LOCAL: sítio inexistente dentro da seção é REJEITADO', () => {
  const { ctx } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  const res = ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Sítio Fantasma'))] }));
  assert.equal(res.summary.failed, 1);
  assert.equal(res.items[0].detail, 'unknown_site');
  assert.equal(r.status, 'pending');
});

test('LOCAL: fluxo INDIVIDUAL também aceita a sugestão (sem alterar DATA)', () => {
  const { ctx } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  const before = JSON.stringify(ctx.DATA);
  const res = ctx.importReviewAiSolution(r.id, JSON.stringify({ reviewId: r.id, summary: 's', reasoning: 'r', manualAction: { type: 'additional_section_placement', description: 'neurorradio', suggestedPlacement: { section: 'Neurorradiologia', site: 'Encéfalo' } }, proposedChanges: {} }));
  assert.equal(res.ok, true);
  assert.equal(res.outcome, 'manual_action_required');
  assert.equal(r.manualAction.type, 'additional_section_placement');
  assert.equal(JSON.stringify(ctx.DATA), before);
});

test('LOCAL: aplicar adiciona altPlacement na MESMA lesão (mesmo id/imagens, sem duplicar)', () => {
  const img = { publicId: 'atlas-radiologico/x', assetId: 'A1', lesionId: 'seed_1', lesionName: 'Holoprosencefalia', data: 'https://res.cloudinary.com/x/y.jpg' };
  const lesion = makeLesion({ id: 'seed_1', name: 'Holoprosencefalia', s: 'Medicina Fetal', site: 'Anomalias fetais estruturais', images: [img] });
  const ctx = buildTestContext({ data: [lesion, makeLesion({ id: 'seed_9', s: 'Neurorradiologia', site: 'Encéfalo' })] });
  const r = ctx.createLesionReview('seed_1', 'x').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Encéfalo'))] }));
  const beforeCount = ctx.DATA.length;
  const res = ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(res.ok, true);
  assert.equal(res.review.status, 'applied_pending_validation', 'não marca accepted automático');
  assert.deepEqual(serialize(lesion.altPlacements), [{ s: 'Neurorradiologia', site: 'Encéfalo' }]);
  assert.equal(lesion.s, 'Medicina Fetal', 'seção principal preservada');
  assert.equal(lesion.site, 'Anomalias fetais estruturais');
  assert.equal(lesion.id, 'seed_1', 'mesmo lesionId');
  assert.equal(lesion.images.length, 1, 'imagem não duplicada');
  assert.equal(lesion.images[0].lesionId, 'seed_1', 'ownership preservado');
  assert.equal(ctx.DATA.length, beforeCount, 'não cria novo registro');
  assert.equal(ctx.saveDataCalls.length, 1, 'persistiu via saveData');
  assert.equal(res.attempt.beforeAltPlacements.length, 0, 'snapshot anterior dos altPlacements guardado');
  assert.equal(res.attempt.kind, 'alt_placement');
});

test('LOCAL: aplicar exige confirmação/estado certo — image_removal e status errado NÃO aplicam', () => {
  const { ctx, lesions } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'remover imagem').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [{ reviewId: r.id, result: 'manual_action_required', summary: 's', reasoning: 'imagem', manualAction: { type: 'image_removal', description: 'remover imagem' }, proposedChanges: {} }] }));
  const before = JSON.stringify(ctx.DATA);
  assert.equal(r.manualAction.type, 'image_removal');
  const res = ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_placement_action', 'image_removal continua sem aplicação automática');
  assert.equal(JSON.stringify(ctx.DATA), before);
  assert.equal(lesions[0].altPlacements, undefined);
  // status errado
  const r2 = ctx.createLesionReview('seed_2', 'x').review;
  assert.equal(ctx.applyReviewAiSuggestedPlacement(r2.id).ok, false);
  assert.equal(ctx.applyReviewAiSuggestedPlacement(r2.id).reason, 'not_manual_action');
});

test('LOCAL: aplicar duas vezes não duplica (already_placed)', () => {
  const { ctx, lesions } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Encéfalo'))] }));
  const first = ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(first.ok, true);
  // reabre a mesma revisão para permitir nova tentativa e tenta de novo
  r.status = 'manual_action_required';
  const second = ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_placed');
  assert.equal(lesions[0].altPlacements.length, 1);
});

test('LOCAL: alvo igual à localização principal é recusado (already_primary)', () => {
  const { ctx } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Medicina Fetal', 'Anomalias fetais estruturais'))] }));
  const res = ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'already_primary');
});

test('LOCAL: rollback remove SÓ a localização adicionada e restaura o estado anterior', () => {
  const lesion = makeLesion({ id: 'seed_1', name: 'Holoprosencefalia', s: 'Medicina Fetal', site: 'Anomalias fetais estruturais' });
  const ctx = buildTestContext({ data: [lesion, makeLesion({ id: 'seed_9', s: 'Neurorradiologia', site: 'Encéfalo' })] });
  const original = JSON.parse(JSON.stringify(lesion));
  const r = ctx.createLesionReview('seed_1', 'x').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Encéfalo'))] }));
  ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(lesion.altPlacements.length, 1);
  const res = ctx.rollbackAppliedReviewSolution(r.id, 'não serviu');
  assert.equal(res.ok, true);
  assert.equal(r.status, 'rejected');
  assert.deepEqual(serialize(ctx.DATA[0]), original, 'lesão volta EXATAMENTE ao estado anterior');
  assert.equal(ctx.DATA[0].s, 'Medicina Fetal', 'seção principal intacta');
  assert.equal(ctx.DATA[0].images.length, 0);
});

test('LOCAL: manter -> accepted mantendo o altPlacement; e F5 preserva o altPlacement', async () => {
  const { ctx, lesions } = makePlacementCtx();
  const r = ctx.createLesionReview('seed_1', 'x').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Encéfalo'))] }));
  ctx.applyReviewAiSuggestedPlacement(r.id);
  const res = ctx.approveAppliedReviewSolution(r.id);
  assert.equal(res.ok, true);
  assert.equal(r.status, 'accepted');
  assert.equal(lesions[0].altPlacements.length, 1, 'altPlacement mantido');
  // persistência da revisão (attempt com beforeAltPlacements) sobrevive a reload
  await ctx.loadLesionRevisions();
  const reloaded = readGlobal(ctx, 'LESION_REVISIONS');
  assert.equal(reloaded[r.id].status, 'accepted');
  assert.equal(reloaded[r.id].attempts[0].kind, 'alt_placement');
  assert.equal(reloaded[r.id].attempts[0].placement.s, 'Neurorradiologia');
  // e a lesão em DATA continua com o altPlacement (mesmo objeto persistido por saveData)
  assert.deepEqual(serialize(ctx.DATA[0].altPlacements), [{ s: 'Neurorradiologia', site: 'Encéfalo' }]);
});

test('LOCAL: não duplica contagem global nem questão de Quiz (DATA.length e id inalterados)', () => {
  const { ctx, lesions } = makePlacementCtx();
  const totalBefore = ctx.DATA.length;
  const r = ctx.createLesionReview('seed_1', 'x').review;
  ctx.importReviewAiBatch(JSON.stringify({ results: [JSON.parse(placementJson(r.id, 'Neurorradiologia', 'Encéfalo'))] }));
  ctx.applyReviewAiSuggestedPlacement(r.id);
  assert.equal(ctx.DATA.length, totalBefore, 'nenhum registro novo');
  const ids = ctx.DATA.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'sem ids duplicados');
  assert.equal(lesions[0].id, 'seed_1');
  assert.equal(lesions[0].images.length, 0, 'sem imagem duplicada');
});

test('LOCAL (UI): botão "Aplicar localização sugerida" aparece e exige confirmação', () => {
  const solutionsModal = extractFn(html, 'openReadySolutionsModal');
  assert.match(solutionsModal, /Aplicar localização sugerida/);
  assert.match(solutionsModal, /openApplyPlacementConfirmModal/);
  const confirmModal = extractFn(html, 'openApplyPlacementConfirmModal');
  assert.match(confirmModal, /a localização principal será preservada/i);
  assert.match(confirmModal, /#placement-confirm/);
  assert.match(confirmModal, /applyReviewAiSuggestedPlacement\(reviewId, siteOverride\)/, 'só aplica no clique de confirmação');
  const manualModal = extractFn(html, 'openManualActionModal');
  assert.match(manualModal, /Aplicar localização sugerida/);
  const editor = extractFn(html, 'openForm');
  assert.match(editor, /Também aparece em/);
  assert.match(editor, /\+ Adicionar localização/);
});


// ===========================================================================
// LAYOUT RESPONSIVO DA CENTRAL DE SOLUÇÕES (aba Ações manuais e afins)
// ===========================================================================

function cssRuleBody(selector){
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(escaped + '\\{([^}]*)\\}').exec(html);
  return m ? m[1] : '';
}

test('LAYOUT: card de revisão aceita largura total e min-width:0 (sem overflow horizontal)', () => {
  const row = cssRuleBody('.review-center-row');
  assert.ok(row, 'regra .review-center-row precisa existir');
  assert.match(row, /max-width:100%/);
  assert.match(row, /min-width:0/);
  assert.match(row, /box-sizing:border-box/);
  assert.match(row, /flex-wrap:wrap/, 'a linha precisa poder quebrar');
  const main = cssRuleBody('.review-center-row-main');
  assert.match(main, /min-width:0/, 'o bloco de texto precisa poder encolher');
});

test('LAYOUT: linha de ações usa flex-wrap e NÃO usa flex-shrink:0/nowrap', () => {
  const actions = cssRuleBody('.review-center-row-actions');
  assert.ok(actions, 'regra .review-center-row-actions precisa existir');
  assert.match(actions, /flex-wrap:wrap/);
  assert.match(actions, /min-width:0/);
  assert.doesNotMatch(actions, /flex-shrink:0/, 'não pode travar a largura do bloco de ações');
  assert.doesNotMatch(actions, /nowrap/);
  const btn = cssRuleBody('.review-center-row-actions .btn');
  assert.match(btn, /max-width:100%/);
  assert.match(btn, /white-space:normal/);
});

test('LAYOUT: textos longos quebram (overflow-wrap/word-break) e o modal não depende de scroll horizontal', () => {
  for (const sel of ['.review-center-row-title', '.review-center-row-meta', '.review-center-row-request', '.review-center-row-solution']){
    const body = cssRuleBody(sel);
    assert.match(body, /overflow-wrap:anywhere/, sel + ' precisa quebrar texto longo');
  }
  const modal = cssRuleBody('.review-center-modal');
  assert.match(modal, /overflow-x:hidden/);
  assert.match(modal, /overflow-y:auto/, 'scroll vertical continua normal');
  const tabs = cssRuleBody('.review-tabs');
  assert.match(tabs, /flex-wrap:wrap/, 'abas podem quebrar em telas estreitas');
});

test('LAYOUT: botões da aba Ações manuais continuam presentes', () => {
  const solutions = extractFn(html, 'openReadySolutionsModal');
  for (const cls of ['review-manual-open', 'review-manual-reopen', 'review-cancel-request', 'review-open-history']){
    assert.match(solutions, new RegExp(cls), 'botão ausente: ' + cls);
  }
  assert.match(solutions, /Abrir lesão/, 'botão de abrir lesão precisa continuar');
  assert.match(solutions, /Voltar para revisões/);
  assert.match(solutions, /Cancelar pedido/);
});
