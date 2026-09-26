'use strict';

// PROTEÇÃO 090 — estado de estudo AUTOMÁTICO pelo Quiz (padrão) com override
// MANUAL opcional. Funções reais extraídas do index.html. Cenários entre
// dispositivos (sync, conflito, F5, PC novo) ficam em
// tests/multi-device-sync.test.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada no index.html');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const FNS = ['getReview', 'setReview', 'setReviewAuto', 'markLesionForReviewAgain', 'saveReview', 'normalizeReviewStamps',
  'saveReviewStamps', 'reviewPromotionReached', 'reviewDemotionTriggered', 'replayAutoReview', 'normalizeReviewAttempts',
  'foldReviewProgress', 'autoReviewBase', 'hasRealReviewAttempts', 'autoReviewStateFromProgress', 'normalizeReviewProgressEntry', 'normalizeReviewProgress', 'normalizeReviewOverrides',
  'mergeReviewProgress', 'mergeReviewOverrides', 'materializeReviewState', 'isReviewManual', 'computeAutomaticReviewState',
  'effectiveReviewState', 'ensureReviewProgressBase', 'recordReviewAttempt', 'gradeReviewAttempt', 'getReviewStateExplanation',
  'loadReviewProgressState', 'saveReviewProgressState', 'stampRestoredReviewOverrides', 'srsGradeLevel'];

function makeCtx() {
  const backing = {};
  const calls = { dirty: 0, push: 0 };
  const c = vm.createContext({
    Date, Math, JSON, Object, Number, console, calls, __backing: backing,
    storage: {
      get: async (k) => { if (k in backing) return { value: backing[k] }; throw new Error('nf'); },
      set: async (k, v) => { backing[k] = v; }
    },
    markSyncDirty: async () => { calls.dirty += 1; },
    pushToFirebase: () => { calls.push += 1; },
    saveSRS: () => {}
  });
  vm.runInContext("const REVIEW_KEY = 'atlas:review'; const REVIEW_STAMPS_KEY = 'atlas:reviewUpdatedAt';\n" +
    "const REVIEW_PROGRESS_KEY = 'atlas:reviewProgress'; const REVIEW_OVERRIDE_KEY = 'atlas:reviewOverride';\n" +
    'const REVIEW_ATTEMPTS_MAX = ' + /const REVIEW_ATTEMPTS_MAX = (\d+);/.exec(html)[1] + ';\n' +
    "const REVIEW_LABELS = {0:'Não revisado',1:'Revisando',2:'Dominado'};\n" +
    'let REVIEW = {}; let REVIEW_STAMPS = {}; let REVIEW_PROGRESS = {}; let REVIEW_OVERRIDE = {}; let SRS = {};\n' +
    'function __get(){ return { REVIEW, REVIEW_STAMPS, REVIEW_PROGRESS, REVIEW_OVERRIDE, SRS }; }\n' +
    'function __set(r){ REVIEW = r || {}; REVIEW_STAMPS = {}; REVIEW_PROGRESS = {}; REVIEW_OVERRIDE = {}; }\n' +
    FNS.map((n) => extractFunction(html, n)).join('\n'), c);
  return c;
}
const st = (c) => plain(c.__get());
// sequência de respostas do Quiz: 'C' correta, 'F' errada, 'N' correta mas graduada "Não sei"
function answer(c, id, seq) {
  for (const ch of seq) {
    const t = c.recordReviewAttempt(id, ch !== 'F');
    if (ch === 'N') c.gradeReviewAttempt(id, t, 'again');
    else c.gradeReviewAttempt(id, t, ch === 'C' ? 'medium' : 'hard');
  }
  return c.getReview(id);
}

test('090-1 (090b): sem tentativas reais -> Não revisado; REVIEW legado NÃO conta no AUTO', () => {
  const c = makeCtx();
  assert.equal(c.effectiveReviewState('x'), 0);
  c.__set({ legado: 2 });
  assert.equal(c.effectiveReviewState('legado'), 0, '090b: legado sem tentativa real = Não revisado');
  assert.equal(c.computeAutomaticReviewState('legado'), 0);
});

test('090-2/3: primeira tentativa (certa ou errada) -> Revisando; várias sem critério -> Revisando', () => {
  const c = makeCtx();
  assert.equal(answer(c, 'a', 'C'), 1);
  assert.equal(answer(c, 'b', 'F'), 1);
  assert.equal(answer(c, 'c', 'CCFC'), 1, '75% nas últimas 4');
});

test('090-4/5: 4 tentativas com critério -> Dominado; 80% nas últimas 5 também', () => {
  const c = makeCtx();
  assert.equal(answer(c, 'a', 'CCC'), 1, '3 tentativas ainda não bastam');
  assert.equal(answer(c, 'a', 'C'), 2, '4/4 + 2 últimas corretas');
  assert.equal(answer(c, 'b', 'FCCCC'), 2, '4/5 = 80% + 2 últimas corretas');
});

test('090-6: as 2 últimas corretas são exigidas', () => {
  const c = makeCtx();
  assert.equal(answer(c, 'a', 'CCCFC'), 1, '80% mas penúltima errada');
  assert.equal(answer(c, 'a', 'C'), 2, 'agora as 2 últimas corretas');
});

test('090-7/8: erro isolado não derruba Dominado; 2 falhas nas últimas 3 -> Revisando', () => {
  const c = makeCtx();
  assert.equal(answer(c, 'a', 'CCCC'), 2);
  assert.equal(answer(c, 'a', 'F'), 2, 'erro isolado');
  assert.equal(answer(c, 'a', 'C'), 2, 'últimas 3 = C F C: 1 falha');
  assert.equal(answer(c, 'a', 'F'), 1, 'últimas 3 = F C F: 2 falhas -> Revisando');
  assert.equal(answer(c, 'b', 'CCCCFF'), 1, '2 falhas seguidas');
  assert.equal(answer(c, 'c', 'CCCCFCC'), 2, 'erro isolado seguido de acertos continua Dominado');
});

test('090: "Não sei" (again) conta como falha mesmo com acerto objetivo', () => {
  const c = makeCtx();
  assert.equal(answer(c, 'a', 'CCCC'), 2);
  assert.equal(answer(c, 'a', 'NN'), 1, 'duas respostas certas no chute ("Não sei") derrubam');
  const a = st(c).REVIEW_PROGRESS.a.a;
  assert.deepEqual(a.slice(-2).map((x) => [x[1], x[2]]), [[0, 1], [0, 1]]);
});

test('090-9/10: Quiz atualiza o estado AUTO; nunca altera o MANUAL (mas registra o histórico)', () => {
  const c = makeCtx();
  answer(c, 'a', 'C');
  assert.equal(c.getReview('a'), 1);
  c.setReview('b', 0);
  assert.equal(answer(c, 'b', 'CCCCC'), 0, 'manual Não revisado mantido');
  assert.equal(st(c).REVIEW_PROGRESS.b.a.length, 5, 'histórico continua sendo registrado');
  assert.equal(c.isReviewManual('b'), true);
});

test('090-11/12/13: manual Não revisado / Revisando / Dominado funcionam', () => {
  const c = makeCtx();
  answer(c, 'a', 'CCCC');
  for (const s of [0, 1, 2, 1]) {
    c.setReview('a', s);
    assert.equal(c.getReview('a'), s);
    assert.equal(c.isReviewManual('a'), true);
    assert.equal(st(c).REVIEW_OVERRIDE.a.s, s);
  }
});

test('090-14: voltar para Automático recalcula imediatamente com os dados atuais do Quiz', () => {
  const c = makeCtx();
  c.setReview('a', 0);
  answer(c, 'a', 'CCCC');
  assert.equal(c.getReview('a'), 0);
  c.setReviewAuto('a');
  assert.equal(c.getReview('a'), 2);
  assert.equal(c.isReviewManual('a'), false);
  assert.equal(st(c).REVIEW_OVERRIDE.a.m, 0, 'volta ao auto é registrada (vence override antigo no sync)');
});

test('090-14b (090b): voltar ao Automático sem tentativas reais -> Não revisado (a base legada não volta)', () => {
  const c = makeCtx();
  c.__set({ legado: 2 });
  c.setReview('legado', 2);
  assert.equal(c.getReview('legado'), 2);
  c.setReviewAuto('legado');
  assert.equal(c.getReview('legado'), 0);
});

test('090-15: "Marcar para revisar novamente" = manual Revisando, sem apagar histórico nem SRS', () => {
  const c = makeCtx();
  answer(c, 'a', 'CCCC');
  c.srsGradeLevel('a', 'easy');
  const before = st(c);
  c.markLesionForReviewAgain('a');
  const after = st(c);
  assert.equal(c.getReview('a'), 1);
  assert.equal(c.isReviewManual('a'), true);
  assert.deepEqual(after.REVIEW_PROGRESS.a.a, before.REVIEW_PROGRESS.a.a, 'histórico intacto');
  assert.deepEqual(after.SRS, before.SRS, 'SRS intacto');
});

test('090-16: SRS continua funcionando e não mexe no estado; o Quiz grava tentativa e grau', () => {
  const c = makeCtx();
  c.srsGradeLevel('a', 'easy');
  assert.ok(st(c).SRS.a.interval > 0);
  assert.equal(c.getReview('a'), 0);
  const quiz = extractFunction(html, 'renderQuizCardIntegrated');
  assert.match(quiz, /st\.reviewAttemptAt = recordReviewAttempt\(e\.id, st\.objectiveCorrect\);/);
  assert.match(quiz, /if\(st\.reviewAttemptAt\) gradeReviewAttempt\(e\.id, st\.reviewAttemptAt, g\);/);
  assert.match(quiz, /srsGradeLevel\(e\.id,g\);quizStats\[g\]\+\+;recordQuizAnswerToday\(st\.objectiveCorrect,g\);/, 'SRS/estatística/SESSIONLOG intactos');
  assert.doesNotMatch(extractFunction(html, 'srsGradeLevel'), /setReview|REVIEW\[|recordReviewAttempt/);
});

test('090-17: histórico limitado (janela de REVIEW_ATTEMPTS_MAX) não cresce indefinidamente e mantém o estado', () => {
  const c = makeCtx();
  answer(c, 'a', 'CCCC' + 'CFCC'.repeat(10));
  const p = st(c).REVIEW_PROGRESS.a;
  assert.equal(p.a.length, 8);
  assert.ok(p.f > 0 && p.a[0][0] > p.f, 'tentativas antigas dobradas na base');
  assert.equal(c.getReview('a'), 2);
});

test('090-24/25: explicação coerente (AUTO) e indicador MANUAL', () => {
  const c = makeCtx();
  answer(c, 'a', 'CCCC');
  assert.equal(c.getReviewStateExplanation('a'), 'Estado calculado pelo Quiz — 4/4 acertos recentes · 2 últimas corretas · 4 tentativa(s) na janela');
  answer(c, 'b', 'CCFCF');
  assert.match(c.getReviewStateExplanation('b'), /3\/5 acertos recentes · última com falha/);
  c.setReview('b', 2);
  assert.equal(c.getReviewStateExplanation('b'), 'Estado definido manualmente (Dominado) — o Quiz não o altera');
  assert.match(c.getReviewStateExplanation('zzz'), /nenhuma tentativa ainda/);
  const card = extractFunction(html, 'renderResults');
  assert.match(card, /<span class="review-mode-tag">\$\{rvManual \? 'MANUAL' : 'AUTO'\}<\/span>/);
  assert.match(card, /'Estado calculado pelo desempenho no Quiz'/);
  assert.match(card, /autoOpt\.onclick = \(e2\)=>\{ e2\.stopPropagation\(\); if\(isReviewManual\(e\.id\)\) setReviewAuto\(e\.id\);/);
  const detail = extractFunction(html, 'openDetail');
  assert.match(detail, /'↺ Marcar para revisar novamente'/);
  assert.match(detail, /markLesionForReviewAgain\(e\.id\)/);
  assert.match(detail, /'⚙ Automático pelo Quiz'/);
});

test('090 MERGE: tentativas unidas por t sem duplicar (versão graduada vence); override mais recente vence (inclusive volta ao auto)', () => {
  const c = makeCtx();
  const p = plain(c.mergeReviewProgress(
    { a: { b: 0, f: 0, a: [[10, 1, 0], [20, 1, 1]] } },
    { a: { b: 0, f: 0, a: [[10, 0, 1], [30, 1, 1]] }, z: { b: 2, f: 0, a: [] } }));
  assert.deepEqual(p.a.a, [[10, 0, 1], [20, 1, 1], [30, 1, 1]]);
  assert.deepEqual(p.z, { b: 2, f: 0, a: [] });
  const o = plain(c.mergeReviewOverrides({ a: { m: 1, s: 2, at: 100 }, b: { m: 1, s: 0, at: 500 } }, { a: { m: 0, at: 200 }, b: { m: 1, s: 2, at: 400 } }));
  assert.deepEqual(o.a, { m: 0, at: 200 }, 'volta ao auto mais recente vence manual antigo');
  assert.deepEqual(o.b, { m: 1, s: 0, at: 500 }, 'manual mais recente vence, mesmo menor (sem Math.max)');
  assert.deepEqual(plain(c.mergeReviewProgress(p, p)), p, 'idempotente');
  const r = plain(c.materializeReviewState({ a: 1, b: 2, legado: 2 }, p, o));
  // a: auto (3 tentativas, sem critério) = Revisando; b: manual Não revisado;
  // 090b: legado sem tentativa real = 0; z: base 2 SEM tentativa real (f=0) = 0.
  assert.deepEqual(r, { a: 1, b: 0, legado: 0, z: 0 });
});

test('090 MIGRAÇÃO da 089 (090b): carimbos da 089 NÃO viram override manual; no AUTO, sem tentativa real = Não revisado', () => {
  const c = makeCtx();
  c.__set({ a: 2, b: 1 });
  vm.runInContext('REVIEW_STAMPS = { a: 123, b: 456 };', c);
  assert.equal(c.isReviewManual('a'), false);
  assert.equal(c.effectiveReviewState('a'), 0);
  assert.equal(c.effectiveReviewState('b'), 0);
  assert.doesNotMatch(extractFunction(html, 'loadData'), /REVIEW_OVERRIDE\s*=/, 'nenhuma conversão automática em boot');
});

test('090 F5: histórico e override persistem e recarregam', async () => {
  const c = makeCtx();
  answer(c, 'a', 'CC');
  c.setReview('b', 2);
  await new Promise((r) => setImmediate(r));
  const saved = st(c);
  vm.runInContext('REVIEW_PROGRESS = {}; REVIEW_OVERRIDE = {};', c);
  await c.loadReviewProgressState();
  assert.deepEqual(st(c).REVIEW_PROGRESS, saved.REVIEW_PROGRESS);
  assert.deepEqual(st(c).REVIEW_OVERRIDE, saved.REVIEW_OVERRIDE);
  assert.match(extractFunction(html, 'loadData'), /await loadReviewProgressState\(\);/);
});

test('090 PIPELINE: write (merge na transação + REVIEW materializado), read, reconcile, no-op, adoção, backup e snapshot', () => {
  const w = extractFunction(html, 'writeShardedState');
  assert.match(w, /const writeProgress = mergeReviewProgress\((?:metaPayloadBase|txBase)\.reviewProgress, remoteMeta\.reviewProgress\);/);
  assert.match(w, /const writeOverride = mergeReviewOverrides\((?:metaPayloadBase|txBase)\.reviewOverride, remoteMeta\.reviewOverride\);/);
  assert.match(w, /review: stripUndefinedDeep\(materializeReviewState\(writeReview\.review, writeProgress, writeOverride\)\)/);
  assert.match(extractFunction(html, 'readShardedState'), /reviewProgress: normalizeReviewProgress\(meta\.reviewProgress\), reviewOverride: normalizeReviewOverrides\(meta\.reviewOverride\)/);
  const rec = extractFunction(html, 'reconcileStateWithRemote');
  assert.match(rec, /REVIEW = materializeReviewState\(REVIEW, REVIEW_PROGRESS, REVIEW_OVERRIDE\);/);
  const pre = extractFunction(html, 'reconcileBeforePush');
  assert.match(pre, /reviewProgress: normalizeReviewProgress\(quarantineIndexedByLesionId\(remote\.reviewProgress\|\|\{\}\)\)/);
  const adopt = extractFunction(html, 'adoptRemoteStateForNewDevice');
  assert.match(adopt, /REVIEW_OVERRIDE = normalizeReviewOverrides\(remote\.reviewOverride\);/);
  assert.match(html, /reviewProgress: REVIEW_PROGRESS, reviewOverride: REVIEW_OVERRIDE, \/\/ PROTEÇÃO 090/, 'backup exporta');
  assert.match(extractFunction(html, 'restoreSafetySnapshot'), /REVIEW_OVERRIDE = normalizeReviewOverrides\(snapshot\.reviewOverride\); stampRestoredReviewOverrides\(\);/);
});

test('091b UX: botões "Automático pelo Quiz" e "Marcar para revisar novamente" com classe de contraste e mesmos handlers', () => {
  const detail = extractFunction(html, 'openDetail');
  assert.match(detail, /autoBtn\.className = 'review-set-btn review-secondary-btn' \+ \(!manual \? ' active' : ''\);/);
  assert.match(detail, /againBtn\.className = 'review-set-btn review-secondary-btn review-again-btn';/);
  assert.match(detail, /autoBtn\.onclick = \(\)=>\{ if\(isReviewManual\(e\.id\)\) setReviewAuto\(e\.id\); renderReviewButtons\(\);/);
  assert.match(detail, /againBtn\.onclick = \(\)=>\{ markLesionForReviewAgain\(e\.id\); renderReviewButtons\(\);/);
  const btnCss = /\.review-set-btn\.review-secondary-btn\{([^}]*)\}/.exec(html);
  assert.ok(btnCss);
  assert.match(btnCss[1], /color:var\(--text\)/);
  assert.match(btnCss[1], /background:var\(--panel-2\)/);
  assert.match(/\.review-set-btn\.review-secondary-btn:hover\{([^}]*)\}/.exec(html)[1], /border-color:var\(--teal\)/);
  assert.match(/\.review-mode-info\{([^}]*)\}/.exec(html)[1], /color:var\(--muted\)/, 'explicação legível (antes --muted-2)');
  assert.match(/\.review-mode-info \.review-mode-tag\{([^}]*)\}/.exec(html)[1], /color:var\(--text\)/);
});
