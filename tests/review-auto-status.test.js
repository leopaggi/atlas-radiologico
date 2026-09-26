'use strict';

// PROTEÇÃO 090b — status AUTO baseado EXCLUSIVAMENTE em tentativas reais do
// Quiz (REVIEW_PROGRESS[id].a, criadas só por recordReviewAttempt). REVIEW
// legado/pré-090, base sintética (b com f=0), SRS, abrir/editar/importar/
// sync nunca contam. Override MANUAL preservado. Funções REAIS do index.html.
// O cenário entre PCs (boot/F5 derivam sem publicar; 1ª escrita converge a
// nuvem) está em multi-device-sync.test.js ("PROTEÇÃO 089/090b").

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
  'foldReviewProgress', 'autoReviewBase', 'hasRealReviewAttempts', 'autoReviewStateFromProgress', 'normalizeReviewProgressEntry',
  'normalizeReviewProgress', 'normalizeReviewOverrides', 'mergeReviewProgress', 'mergeReviewOverrides', 'materializeReviewState',
  'isReviewManual', 'computeAutomaticReviewState', 'effectiveReviewState', 'ensureReviewProgressBase', 'recordReviewAttempt',
  'gradeReviewAttempt', 'getReviewStateExplanation', 'loadReviewProgressState', 'saveReviewProgressState', 'srsGradeLevel',
  'auditReviewAutoStatus'];

function makeCtx(seed) {
  const backing = {};
  const c = vm.createContext({
    Date, Math, JSON, Object, Number, console, __backing: backing,
    storage: { get: async (k) => { if (k in backing) return { value: backing[k] }; throw new Error('nf'); }, set: async (k, v) => { backing[k] = v; } },
    markSyncDirty: async () => {}, pushToFirebase: () => {}, saveSRS: () => {}
  });
  vm.runInContext("const REVIEW_KEY = 'atlas:review'; const REVIEW_STAMPS_KEY = 'atlas:reviewUpdatedAt';\n" +
    "const REVIEW_PROGRESS_KEY = 'atlas:reviewProgress'; const REVIEW_OVERRIDE_KEY = 'atlas:reviewOverride';\n" +
    'const REVIEW_ATTEMPTS_MAX = ' + /const REVIEW_ATTEMPTS_MAX = (\d+);/.exec(html)[1] + ';\n' +
    "const REVIEW_LABELS = {0:'Não revisado',1:'Revisando',2:'Dominado'};\n" +
    'let REVIEW = {}; let REVIEW_STAMPS = {}; let REVIEW_PROGRESS = {}; let REVIEW_OVERRIDE = {}; let SRS = {};\n' +
    'function __get(){ return { REVIEW, REVIEW_STAMPS, REVIEW_PROGRESS, REVIEW_OVERRIDE, SRS }; }\n' +
    'function __load(s){ REVIEW = s.review || {}; REVIEW_PROGRESS = normalizeReviewProgress(s.progress); REVIEW_OVERRIDE = normalizeReviewOverrides(s.override); SRS = s.srs || {};\n' +
    '  REVIEW = materializeReviewState(REVIEW, REVIEW_PROGRESS, REVIEW_OVERRIDE); }\n' + // exatamente o que o boot (loadData) faz
    FNS.map((n) => extractFunction(html, n)).join('\n'), c);
  if (seed) c.__load(seed);
  return c;
}
const answer = (c, id, seq) => { for (const ch of seq) { const t = c.recordReviewAttempt(id, ch !== 'F'); c.gradeReviewAttempt(id, t, ch === 'C' ? 'medium' : 'hard'); } return c.getReview(id); };
const att = (seq, t0) => seq.split('').map((ch, i) => [(t0 || 1000) + i, ch === 'C' ? 1 : 0, 1]);

test('090b 1-4: sem REVIEW_PROGRESS / REVIEW legado Revisando ou Dominado / base pré-090 => Não revisado (AUTO)', () => {
  const c = makeCtx({ review: { nada: 0, legRev: 1, legDom: 2 }, progress: { baseSinteticaRev: { b: 1, f: 0, a: [] }, baseSinteticaDom: { b: 2, f: 0, a: [] } } });
  for (const id of ['semNada', 'nada', 'legRev', 'legDom', 'baseSinteticaRev', 'baseSinteticaDom']) {
    assert.equal(c.getReview(id), 0, id);
    assert.equal(c.effectiveReviewState(id), 0, id);
    assert.equal(c.isReviewManual(id), false);
  }
  assert.equal(c.hasRealReviewAttempts({ b: 2, f: 0, a: [] }), false, 'base com f=0 é legado, não tentativa');
  assert.match(c.getReviewStateExplanation('legDom'), /nenhuma tentativa ainda \(Não revisado\)/);
  // dado bruto não é apagado (compatibilidade): a base continua no REVIEW_PROGRESS
  assert.deepEqual(plain(c.__get().REVIEW_PROGRESS.baseSinteticaDom), { b: 2, f: 0, a: [] });
});

test('090b 5-7: 1 tentativa real => Revisando; 3 corretas => Revisando; 4 válidas + critérios => Dominado', () => {
  const c = makeCtx({ review: { a: 2 }, progress: {} }); // legado Dominado não ajuda
  assert.equal(answer(c, 'a', 'C'), 1, '1 tentativa real');
  assert.equal(answer(c, 'b', 'CCC'), 1, '3 corretas ainda Revisando');
  assert.equal(answer(c, 'b', 'C'), 2, '4 corretas: Dominado');
  assert.equal(answer(c, 'x', 'F'), 1, 'uma tentativa errada também tira de Não revisado');
  // legado Dominado + base sintética: 1 acerto real NÃO vira Dominado (base legada não é ponto de partida)
  const d = makeCtx({ review: { l: 2 }, progress: { l: { b: 2, f: 0, a: [] } } });
  assert.equal(answer(d, 'l', 'C'), 1);
});

test('090b 8-9: Dominado + 1 erro isolado continua Dominado; 2 erros nas últimas 3 => Revisando (critérios da 090 intactos)', () => {
  const c = makeCtx({});
  assert.equal(answer(c, 'a', 'CCCC'), 2);
  assert.equal(answer(c, 'a', 'F'), 2, 'erro isolado não derruba');
  assert.equal(answer(c, 'a', 'C'), 2);
  assert.equal(answer(c, 'a', 'FF'), 1, '2 falhas nas últimas 3');
  const src = extractFunction(html, 'reviewPromotionReached') + extractFunction(html, 'reviewDemotionTriggered');
  assert.match(src, /att\.length < 4/);
  assert.match(src, />= 0\.8 && last2\.every/);
  assert.match(src, /slice\(-3\)\.filter\(x=>x\[1\]!==1\)\.length >= 2/);
});

test('090b 10-12: MANUAL Revisando/Dominado sem tentativas permanece; voltar ao AUTO sem tentativas => Não revisado; "revisar novamente" = MANUAL Revisando', () => {
  const c = makeCtx({ review: { r: 1, d: 2 }, override: { r: { m: 1, s: 1, at: 10 }, d: { m: 1, s: 2, at: 10 } } });
  assert.deepEqual([c.getReview('r'), c.isReviewManual('r')], [1, true]);
  assert.deepEqual([c.getReview('d'), c.isReviewManual('d')], [2, true]);
  c.setReviewAuto('d');
  assert.deepEqual([c.getReview('d'), c.isReviewManual('d')], [0, false], 'remover override recalcula só com tentativas reais');
  answer(c, 'q', 'CCCC');
  c.markLesionForReviewAgain('q');
  assert.deepEqual([c.getReview('q'), c.isReviewManual('q')], [1, true]);
  assert.equal(plain(c.__get().REVIEW_PROGRESS.q).a.length, 4, 'histórico preservado');
  c.setReviewAuto('q');
  assert.equal(c.getReview('q'), 2, 'volta ao AUTO recalcula pelas tentativas reais');
});

test('090b 13-15: SRS isolado, abrir/editar lesão e sync NÃO criam tentativa nem mudam o estado AUTO', () => {
  const c = makeCtx({ review: { s: 1 }, srs: { s: { interval: 30, due: 1, streak: 5 } } });
  assert.equal(c.getReview('s'), 0, 'SRS isolado não conta');
  c.srsGradeLevel('s', 'easy');
  assert.equal(c.getReview('s'), 0);
  assert.equal(c.__get().REVIEW_PROGRESS.s, undefined, 'SRS não cria REVIEW_PROGRESS');
  // abrir/editar: openDetail/openForm não chamam recordReviewAttempt nem gravam REVIEW
  for (const fn of ['openDetail', 'openForm']) assert.doesNotMatch(extractFunction(html, fn), /recordReviewAttempt|REVIEW\[/, fn);
  // única origem de tentativa real: a resposta do Quiz
  assert.equal((html.match(/recordReviewAttempt\(/g) || []).length, 2, 'definição + 1 chamada');
  assert.match(extractFunction(html, 'renderQuizCardIntegrated'), /st\.reviewAttemptAt = recordReviewAttempt\(e\.id, st\.objectiveCorrect\);/);
  // sync: merge une tentativas reais, nunca cria; base sintética não vira tentativa
  const m = plain(c.mergeReviewProgress({ a: { b: 2, f: 0, a: [] } }, { a: { b: 1, f: 0, a: [] } }));
  assert.deepEqual(m.a.a, []);
  assert.equal(c.autoReviewStateFromProgress(m.a), 0);
});

test('090b 16: contadores globais batem com os estados calculados; auditoria (somente leitura) aponta o que foi corrigido', () => {
  // fixture com o bug real: lesões nunca estudadas marcadas pelo REVIEW legado
  const review = { n1: 1, n2: 1, n3: 2, n4: 1, n5: 0, q1: 1, q2: 1, m1: 1, m2: 2 };
  const progress = { q1: { b: 0, f: 0, a: att('C') }, q2: { b: 1, f: 0, a: att('CCCC') }, n4: { b: 1, f: 0, a: [] } };
  const override = { m1: { m: 1, s: 1, at: 5 }, m2: { m: 1, s: 2, at: 5 } };
  const c = makeCtx();
  const audit = plain(c.auditReviewAutoStatus(review, progress, override));
  assert.deepEqual(audit, { total: 9, manual: 2, auto: 7, autoWithoutRealAttempts: 5, autoRevisandoWithoutAttempts: 3, autoDominadoWithoutAttempts: 1, corrected: 5, final: { 0: 5, 1: 2, 2: 2 } });
  c.__load({ review, progress, override });
  const ids = Object.keys(review);
  const counts = { 0: 0, 1: 0, 2: 0 };
  ids.forEach((id) => { counts[c.getReview(id)] += 1; });
  assert.deepEqual(counts, { 0: 5, 1: 2, 2: 2 }, 'Não revisado / Revisando / Dominado = derivados');
  assert.deepEqual(ids.filter((id) => c.getReview(id) === 1), ['q1', 'm1']);
  assert.deepEqual(ids.filter((id) => c.getReview(id) === 2), ['q2', 'm2']);
  // os contadores do app leem getReview (REVIEW materializado)
  assert.match(extractFunction(html, 'getReview'), /return REVIEW\[id\] \|\| 0;/);
  assert.match(extractFunction(html, 'loadData'), /REVIEW = materializeReviewState\(REVIEW, REVIEW_PROGRESS, REVIEW_OVERRIDE\); \/\/ 090b/);
  assert.match(html, /async function auditReviewAutoStatusNow\(\)/);
  assert.doesNotMatch(extractFunction(html, 'auditReviewAutoStatusNow'), /storage\.set|saveReview|REVIEW\s*=/, 'auditoria nunca grava');
});

test('090b REGRESSÃO: REVIEW_PROGRESS real existente não se perde (normalize/merge/fold/materialize), e histórico dobrado real (f>0) continua valendo', () => {
  const real = { a: { b: 0, f: 0, a: att('CCCCC') }, folded: { b: 2, f: 500, a: att('C', 600) } };
  const c = makeCtx({ progress: real });
  assert.deepEqual(plain(c.__get().REVIEW_PROGRESS), plain(c.normalizeReviewProgress(real)));
  assert.equal(c.getReview('a'), 2);
  assert.equal(c.getReview('folded'), 2, 'base de tentativas reais que saíram da janela (f>0) conta');
  const merged = plain(c.mergeReviewProgress(real, { a: { b: 0, f: 0, a: att('F', 2000) } }));
  assert.equal(merged.a.a.length, 6, 'união das tentativas reais dos dois PCs');
  // janela: mais de 8 tentativas dobra em b a partir de base 0 (nunca do legado)
  const d = makeCtx({ review: { z: 2 }, progress: { z: { b: 2, f: 0, a: [] } } });
  answer(d, 'z', 'FFFFFFFFF');
  const pz = plain(d.__get().REVIEW_PROGRESS.z);
  assert.equal(pz.a.length, 8);
  assert.ok(pz.f > 0);
  assert.equal(pz.b, 1, 'dobra da 1ª tentativa real a partir de 0 (legado Dominado não entra)');
  assert.equal(d.getReview('z'), 1);
});
