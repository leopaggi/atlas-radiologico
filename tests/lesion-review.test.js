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
  assert.doesNotMatch(moduleSource, /pushToFirebase/, 'não deve chamar Firebase diretamente — usa saveData() já existente quando muta DATA');
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

test('SEGURANÇA ESTÁTICA: só authorizeAndApplyReviewSolution/rollbackAppliedReviewSolution tocam DATA', () => {
  const dataTouchers = ['authorizeAndApplyReviewSolution', 'rollbackAppliedReviewSolution'];
  const untouched = [
    'createLesionReview', 'getPendingReviews', 'getProposedSolutions',
    'getAppliedSolutionsAwaitingValidation', 'getReadySolutions', 'getReviewHistory',
    'validateProposedChanges', 'setReviewSolution', 'rejectProposedReviewSolution',
    'approveAppliedReviewSolution', 'updateReviewCenterBadges'
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
    'approveAppliedReviewSolution', 'rollbackAppliedReviewSolution'
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
  const answerHandlerIdx = renderQuizCardSource.indexOf(".querySelectorAll('.quiz-mcq-option').forEach(btn=>btn.onclick=()=>{");
  const reviewButtonIdx = renderQuizCardSource.indexOf('id="quiz-review-btn"');
  const reviewHandlerIdx = renderQuizCardSource.indexOf('openQuizReviewModal(e.id)');
  assert.notEqual(answerHandlerIdx, -1);
  assert.ok(reviewButtonIdx > answerHandlerIdx);
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
  const importBlock = html.slice(start, start + 4000);
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
  const nextFunctionIdx = html.indexOf('\nasync function saveData(){', loadDataStart);
  assert.ok(loadLesionRevisionsIdx < nextFunctionIdx, 'a chamada precisa estar dentro do corpo de loadData()');
});
