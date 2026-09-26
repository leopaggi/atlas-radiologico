'use strict';

// PROTEÇÃO 089 — estado MANUAL de estudo (REVIEW: 0 Não revisado /
// 1 Revisando / 2 Dominado). Só muda por ação explícita do usuário
// (setReview). Quiz/SRS, boot e render não o tocam; conflito entre PCs é
// decidido pela mudança manual mais recente (REVIEW_STAMPS), não por
// Math.max. Funções reais extraídas do index.html. Cenários ponta a ponta
// entre dispositivos ficam em tests/multi-device-sync.test.js.

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

function makeCtx() {
  const backing = {};
  const calls = { dirty: 0, push: 0, srsSaved: 0 };
  const c = vm.createContext({
    Date, Math, JSON, Object, Number, console, calls, __backing: backing,
    storage: {
      get: async (k) => { if (k in backing) return { value: backing[k] }; throw new Error('nf'); },
      set: async (k, v) => { backing[k] = v; }
    },
    markSyncDirty: async () => { calls.dirty += 1; },
    pushToFirebase: () => { calls.push += 1; },
    saveSRS: () => { calls.srsSaved += 1; },
    // quarentena 075 simulada: seed_1282 nunca entra
    quarantineIndexedByLesionId: (o) => { const out = {}; for (const [k, v] of Object.entries(o || {})) if (k !== 'seed_1282') out[k] = v; return out; }
  });
  // PROTEÇÃO 090: setReview virou override manual — o harness inclui as
  // funções reais de histórico/override usadas por ela.
  vm.runInContext("const REVIEW_KEY = 'atlas:review'; const REVIEW_STAMPS_KEY = 'atlas:reviewUpdatedAt';\n" +
    "const REVIEW_PROGRESS_KEY = 'atlas:reviewProgress'; const REVIEW_OVERRIDE_KEY = 'atlas:reviewOverride'; const REVIEW_ATTEMPTS_MAX = 8;\n" +
    "const REVIEW_LABELS = {0:'Não revisado',1:'Revisando',2:'Dominado'};\n" +
    'let REVIEW = {}; let REVIEW_STAMPS = {}; let SRS = {}; let REVIEW_PROGRESS = {}; let REVIEW_OVERRIDE = {};\n' +
    'function __get(){ return { REVIEW, REVIEW_STAMPS, SRS }; }\n' +
    'function __set(r, s){ REVIEW = r; REVIEW_STAMPS = s || {}; REVIEW_PROGRESS = {}; REVIEW_OVERRIDE = {}; }\n' +
    ['getReview', 'setReview', 'cycleReview', 'saveReview', 'normalizeReviewStamps', 'loadReviewStamps', 'saveReviewStamps',
      'stampRestoredReview', 'mergeReviewByRecency', 'consolidateReviewOnMerge', 'srsGradeLevel', 'srsGrade',
      'reviewPromotionReached', 'reviewDemotionTriggered', 'replayAutoReview', 'normalizeReviewAttempts', 'foldReviewProgress',
      'normalizeReviewProgressEntry', 'normalizeReviewProgress', 'normalizeReviewOverrides', 'mergeReviewProgress',
      'mergeReviewOverrides', 'isReviewManual', 'computeAutomaticReviewState', 'effectiveReviewState', 'ensureReviewProgressBase',
      'saveReviewProgressState']
      .map((n) => extractFunction(html, n)).join('\n'), c);
  return c;
}
const state = (c) => plain(c.__get());

test('089-1: default = Não revisado (0), sem carimbo', () => {
  const c = makeCtx();
  assert.equal(c.getReview('seed_1'), 0);
  assert.deepEqual(state(c).REVIEW_STAMPS, {});
});

test('089-2..5: usuário escolhe Revisando/Dominado e pode voltar (inclusive para Não revisado); cada mudança carimba, persiste e sincroniza', async () => {
  const c = makeCtx();
  for (const st of [1, 2, 1, 0]) {
    c.setReview('seed_1', st);
    await new Promise((r) => setImmediate(r));
    assert.equal(c.getReview('seed_1'), st);
    assert.ok(state(c).REVIEW_STAMPS.seed_1 > 0);
  }
  assert.equal(JSON.parse(c.__backing['atlas:review']).seed_1, 0);
  assert.ok(JSON.parse(c.__backing['atlas:reviewUpdatedAt']).seed_1 > 0, 'carimbo persistido');
  assert.equal(c.calls.dirty, 4);
  assert.equal(c.calls.push, 4);
});

test('089-6/7 (ajustado na 090): o SRS (srsGradeLevel/srsGrade, todos os graus) NÃO altera REVIEW nem carimbo — o estado AUTO vem só do histórico de tentativas (review-auto-mode.test.js)', () => {
  const c = makeCtx();
  c.__set({ seed_1: 2, seed_2: 0 }, { seed_1: 111 });
  for (const g of ['easy', 'medium', 'hard', 'again']) { c.srsGradeLevel('seed_1', g); c.srsGradeLevel('seed_2', g); }
  c.srsGrade('seed_1', false); c.srsGrade('seed_2', true);
  for (let i = 0; i < 10; i++) c.srsGradeLevel('seed_2', 'easy'); // intervalo passa de 30 dias
  const s = state(c);
  assert.deepEqual(s.REVIEW, { seed_1: 2, seed_2: 0 }, 'Dominado não vira Revisando ao errar; Não revisado não vira Dominado');
  assert.deepEqual(s.REVIEW_STAMPS, { seed_1: 111 });
  assert.ok(s.SRS.seed_2.interval >= 30, 'SRS continua funcionando');
  assert.ok(c.calls.srsSaved > 0);
  assert.doesNotMatch(extractFunction(html, 'srsGradeLevel'), /setReview|REVIEW\[/);
});

test('089-8/9: boot e render não escrevem REVIEW; setReview só dentro de handlers de clique', () => {
  const load = extractFunction(html, 'loadData');
  assert.doesNotMatch(load, /setReview\(|cycleReview\(|REVIEW\[[^\]]+\]\s*=[^=]/);
  for (const fn of ['renderResults', 'renderReviewBar', 'openDetail', 'renderAll']) {
    const src = extractFunction(html, fn);
    const lines = src.split('\n').filter((l) => /setReview\(|cycleReview\(/.test(l));
    for (const l of lines) assert.match(l, /onclick/, fn + ': setReview fora de clique: ' + l.trim());
  }
  // Inventário completo das chamadas reais de setReview (sem definição/comentários).
  const callers = html.split('\n').filter((l) => /[^.\w]setReview\(/.test(l) && !/^\s*\/\//.test(l) && !/function setReview\(/.test(l)).map((l) => l.trim());
  // PROTEÇÃO 090: + markLesionForReviewAgain ("Marcar para revisar novamente").
  assert.equal(callers.length, 4, callers.join('\n'));
  assert.ok(callers.some((l) => l.startsWith('function markLesionForReviewAgain(')));
  assert.ok(callers.some((l) => l.startsWith('function cycleReview(')), 'cycleReview (não usado pelo card)');
  assert.ok(callers.some((l) => /^b\.onclick = \(e2\)=>/.test(l)), 'seletor do card');
  assert.match(html, /b\.onclick = \(\)=>\{ setReview\(e\.id, st\); renderReviewButtons\(\);/, 'botões explícitos do detalhe');
});

test('089 UI: card abre escolha EXPLÍCITA (○ ◐ ●) em vez de ciclo cego; tooltip "Estado manual de estudo"', () => {
  const src = extractFunction(html, 'renderResults');
  // PROTEÇÃO 090: tooltip AUTO/MANUAL + explicação; opção "Automático pelo Quiz" no seletor.
  assert.match(src, /reviewBtn\.title = \(rvManual \? 'Estado definido manualmente' : 'Estado calculado pelo desempenho no Quiz'\)/);
  assert.match(src, /autoOpt\.textContent = '⚙ Automático pelo Quiz';/);
  assert.match(src, /picker\.className = 'card-review-picker';/);
  assert.match(src, /\[0,1,2\]\.forEach\(st=>\{/);
  assert.match(src, /if\(!\(isReviewManual\(e\.id\) && st===getReview\(e\.id\)\)\) setReview\(e\.id, st\);/);
  assert.doesNotMatch(src, /cycleReview\(/, 'o card não cicla mais às cegas');
  assert.match(html, /\.card-review-picker\{/);
});

test('089-10: pull sem conflito preserva (os dois lados iguais / só um lado tem)', () => {
  const c = makeCtx();
  const r = plain(c.mergeReviewByRecency({ a: 2, b: 1 }, { a: 2, c: 1 }, { a: 5 }, { a: 5, c: 7 }));
  assert.deepEqual(r.review, { a: 2, b: 1, c: 1 });
  assert.deepEqual(r.stamps, { a: 5, c: 7 });
});

test('089-11/12: conflito entre PCs — vence a mudança MANUAL mais recente, mesmo sendo estágio menor (Math.max não sobrescreve)', () => {
  const c = makeCtx();
  // PC A ontem: Dominado. PC B hoje: rebaixou para Revisando.
  const out = plain(c.mergeReviewByRecency({ seed_1: 2 }, { seed_1: 1 }, { seed_1: 1000 }, { seed_1: 2000 }));
  assert.deepEqual(out.review, { seed_1: 1 });
  assert.deepEqual(out.stamps, { seed_1: 2000 });
  // simétrico (convergente)
  assert.deepEqual(plain(c.mergeReviewByRecency({ seed_1: 1 }, { seed_1: 2 }, { seed_1: 2000 }, { seed_1: 1000 })).review, { seed_1: 1 });
  // mudança manual para "Não revisado" também vale
  assert.deepEqual(plain(c.mergeReviewByRecency({ seed_1: 2 }, { seed_1: 0 }, { seed_1: 10 }, { seed_1: 20 })).review, { seed_1: 0 });
  // carimbado vence legado sem carimbo, mesmo menor
  assert.deepEqual(plain(c.mergeReviewByRecency({ seed_1: 2 }, { seed_1: 1 }, {}, { seed_1: 5 })).review, { seed_1: 1 });
  // empate de carimbo: determinístico (maior)
  assert.deepEqual(plain(c.mergeReviewByRecency({ x: 1 }, { x: 2 }, { x: 9 }, { x: 9 })), plain(c.mergeReviewByRecency({ x: 2 }, { x: 1 }, { x: 9 }, { x: 9 })));
});

test('089-15: estado antigo sem carimbo nos dois lados continua válido (regra legada: maior estágio) e quarentena 075 é respeitada', () => {
  const c = makeCtx();
  const out = plain(c.mergeReviewByRecency({ a: 1, seed_1282: 2 }, { a: 2, b: 1 }, undefined, null));
  assert.deepEqual(out.review, { a: 2, b: 1 });
  assert.deepEqual(out.stamps, {});
  assert.deepEqual(plain(c.normalizeReviewStamps({ a: '5', b: 0, c: -1, d: 'x' })), { a: 5 });
  assert.deepEqual(plain(c.normalizeReviewStamps('lixo')), {});
});

test('089-13/14: consolidação de duplicata preserva sem promover indevidamente', () => {
  const c = makeCtx();
  // keeper Revisando, duplicata Dominado (sem carimbo): NÃO promove
  c.__set({ keep: 1, drop: 2 }, {});
  assert.equal(c.consolidateReviewOnMerge('keep', 'drop'), false);
  assert.equal(state(c).REVIEW.keep, 1);
  // keeper sem estado: herda o da duplicata (preserva progresso)
  c.__set({ drop: 2 }, {});
  assert.equal(c.consolidateReviewOnMerge('keep', 'drop'), true);
  assert.equal(state(c).REVIEW.keep, 2);
  // duplicata com mudança manual mais recente: vale a mais recente (valor + carimbo)
  c.__set({ keep: 2, drop: 1 }, { keep: 10, drop: 20 });
  assert.equal(c.consolidateReviewOnMerge('keep', 'drop'), true);
  assert.deepEqual(state(c).REVIEW.keep, 1);
  assert.equal(state(c).REVIEW_STAMPS.keep, 20);
  // keeper mais recente: fica
  c.__set({ keep: 0, drop: 2 }, { keep: 30, drop: 20 });
  assert.equal(c.consolidateReviewOnMerge('keep', 'drop'), false);
  assert.equal(state(c).REVIEW.keep, 0, 'Não revisado escolhido manualmente não é promovido');
  const dup = extractFunction(html, 'runDuplicateCleanup');
  assert.match(dup, /consolidateReviewOnMerge\(keeper\.id, o\.id\)/);
  assert.doesNotMatch(dup, /\(REVIEW\[o\.id\]\|\|0\) > \(REVIEW\[keeper\.id\]\|\|0\)/);
  const v171 = extractFunction(html, 'deduplicateV171');
  assert.match(v171, /consolidateReviewOnMerge\(keepId, dropId\)/);
  assert.doesNotMatch(v171, /if\(dropReview>keepReview\)/);
});

test('089-17: F5 — carimbos persistem e recarregam', async () => {
  const c = makeCtx();
  c.setReview('seed_9', 2);
  await new Promise((r) => setImmediate(r));
  const saved = state(c).REVIEW_STAMPS;
  c.__set(state(c).REVIEW, {});
  await c.loadReviewStamps();
  assert.deepEqual(state(c).REVIEW_STAMPS, saved);
  assert.match(extractFunction(html, 'loadData'), /await loadReviewStamps\(\);/);
});

test('089: restauração/importação explícita carimba o estado restaurado (vale sobre a nuvem, como antes)', () => {
  const c = makeCtx();
  c.__set({ a: 2, b: 0 }, { a: 1 });
  c.stampRestoredReview();
  const s = state(c);
  assert.ok(s.REVIEW_STAMPS.a > 1 && s.REVIEW_STAMPS.b > 1);
  assert.match(extractFunction(html, 'restoreSafetySnapshot'), /stampRestoredReview\(\);/);
  assert.match(html, /REVIEW = quarantineIndexedByLesionId\(\(parsed\.review[^\n]*\n\s*stampRestoredReview\(\); await saveReviewStamps\(\);/);
  assert.match(html, /reviewUpdatedAt: REVIEW_STAMPS, \/\/ PROTEÇÃO 089/, 'backup exporta os carimbos');
});

test('089 PIPELINE: write (com merge na transação), read, reconcile, no-op, pull, persist e adoção de PC novo usam os carimbos', () => {
  const w = extractFunction(html, 'writeShardedState');
  assert.match(w, /reviewUpdatedAt: normalizeReviewStamps\(quarantineIndexedByLesionId\(REVIEW_STAMPS\)\)/);
  assert.match(w, /const writeReview = mergeReviewByRecency\(metaPayloadBase\.review, remoteMeta\.review, metaPayloadBase\.reviewUpdatedAt, remoteMeta\.reviewUpdatedAt\);/);
  assert.match(extractFunction(html, 'readShardedState'), /reviewUpdatedAt: normalizeReviewStamps\(meta\.reviewUpdatedAt\)/);
  const rec = extractFunction(html, 'reconcileStateWithRemote');
  assert.match(rec, /mergeReviewByRecency\(REVIEW, remote && remote\.review, REVIEW_STAMPS, remote && remote\.reviewUpdatedAt\)/);
  assert.doesNotMatch(rec, /mergeReviewPreservingProgress/);
  const pre = extractFunction(html, 'reconcileBeforePush');
  assert.match(pre, /reviewUpdatedAt: normalizeReviewStamps\(quarantineIndexedByLesionId\(REVIEW_STAMPS\)\)/);
  assert.match(pre, /reviewUpdatedAt: normalizeReviewStamps\(quarantineIndexedByLesionId\(remote\.reviewUpdatedAt\|\|\{\}\)\)/);
  assert.match(extractFunction(html, 'syncFromFirebase'), /await saveReviewStamps\(\);/);
  assert.match(extractFunction(html, 'persistLocalStateNow'), /await saveReviewStamps\(\);/);
  const adopt = extractFunction(html, 'adoptRemoteStateForNewDevice');
  assert.match(adopt, /REVIEW_STAMPS = normalizeReviewStamps\(remote\.reviewUpdatedAt\);/);
  assert.match(adopt, /await saveReviewStamps\(\);/);
});
