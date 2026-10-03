'use strict';

/* Triagem PROATIVA de conteúdo — fila de revisão manual zerada; próxima
 * frente é identificar candidatas a revisão SEM alterar nada. Esta suíte
 * prova, extraindo o código REAL do index.html (mesmo padrão de
 * classification-integrity.test.js — vm isolado, nunca reimplementação):
 *  - cada critério objetivo dispara exatamente o motivo esperado;
 *  - scanCatalogForTriage nunca grava em DATA/LESION_REVISIONS e exclui
 *    lesões com revisão ativa;
 *  - createTriageReviewBatch só persiste quando o usuário manda (reaproveita
 *    createLesionReview — a MESMA função chamada pela UI manual, PROTEÇÃO
 *    091) e nunca cria proposedChanges/autoriza nada;
 *  - compatibilidade com a fila/central de revisões já existente
 *    (ACTIVE_LESION_REVIEW_STATUSES, allowedFields do pacote da IA).
 * Nenhum teste toca IndexedDB/Firestore/Cloudinary reais.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'função não encontrada: ' + name);
  const ob = source.indexOf('{', m.index + m[0].length);
  let depth = 0, q = null, esc = false, end = -1;
  for (let i = ob; i < source.length; i += 1) {
    const c = source[i];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, 'bloco sem fechamento: ' + name);
  return source.slice(m.index, end + 1);
}
function extractConst(source, name) {
  const re = new RegExp('\\bconst\\s+' + name + '\\s*=');
  const m = re.exec(source);
  assert.ok(m, 'constante não encontrada: ' + name);
  const eq = source.indexOf('=', m.index);
  let i = eq + 1;
  while (/\s/.test(source[i])) i += 1;
  if (source[i] === '{' || source[i] === '[') {
    const open = source[i], close = open === '{' ? '}' : ']';
    let depth = 0, q = null, esc = false, end = -1;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === open) depth += 1;
      else if (c === close) { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    assert.notEqual(end, -1, 'bloco sem fechamento: ' + name);
    return source.slice(m.index, end + 1) + ';';
  }
  const semi = source.indexOf(';', i);
  return source.slice(m.index, semi + 1);
}

const FN_NAMES = [
  'triageReasonLabel', 'triageNormalize', 'triageNotesReasons', 'triageTagsReasons', 'triageEnTermReasons',
  'triageClassificationApplicable', 'triageClassificationReasons', 'triageClinicalTagsReasons', 'triageRichImagesWeakNotesReasons',
  'evaluateLesionForTriage', 'scanCatalogForTriage', 'createTriageReviewBatch',
  'tokenizeExternalTitle', 'normalizeExternalTitle', 'classifyClassificationCompatibility',
  'hasActiveLesionReview', 'reviewScope', 'createLesionReview', 'genLesionReviewId', 'pushLesionReviewHistory'
];
const CONST_NAMES = [
  'TRIAGE_MIN_TAGS', 'TRIAGE_MIN_NOTES_CHARS', 'TRIAGE_MIN_NOTES_REMAINDER_TOKENS', 'TRIAGE_RICH_IMAGES_MIN',
  'TRIAGE_MIN_NOTES_CHARS_FOR_DIFFERENTIALS', 'TRIAGE_CLASSIFICATION_TRAUMA_SYSTEMS', 'TRIAGE_CLASSIFICATION_TRAUMA_HINT',
  'TRIAGE_CLASSIFICATION_BENIGN_EXCLUSIONS', 'TRIAGE_CLASSIFICATION_REQUIRED_HINTS',
  'TRIAGE_REASON_LABELS', 'TRIAGE_REASON_WEIGHTS', 'EXTERNAL_IMPORT_STOPWORDS', 'CLASSIFICATION_CONTEXT_RULES',
  'ACTIVE_LESION_REVIEW_STATUSES'
];

function buildCtx(opts) {
  const o = opts || {};
  const calls = { savedLesionRevisions: 0, badgeUpdates: 0 };
  const ctx = {
    console, JSON, Object, Array, String, Number, Map, Set,
    DATA: o.data || [],
    LESION_REVISIONS: o.lesionRevisions || {},
    // Stubs: storage/sync/UI não fazem parte da lógica pura sendo testada
    // (mesmo princípio de classification-integrity.test.js).
    saveLesionRevisions: async () => { calls.savedLesionRevisions += 1; },
    updateReviewCenterBadges: () => { calls.badgeUpdates += 1; },
    __calls: calls
  };
  vm.createContext(ctx);
  const src = CONST_NAMES.map(n => extractConst(html, n)).concat(FN_NAMES.map(n => extractFunction(html, n))).join('\n');
  // Top-level `const` não vira propriedade do objeto global do vm (só
  // `function` vira) — precisa de uma ponte explícita pros testes lerem
  // TRIAGE_REASON_WEIGHTS/TRIAGE_REASON_LABELS/ACTIVE_LESION_REVIEW_STATUSES
  // de fora. Mesmo padrão de "this.__api = {...}" já usado noutras suítes.
  vm.runInContext(src + '\nthis.__consts = { TRIAGE_REASON_LABELS, TRIAGE_REASON_WEIGHTS, ACTIVE_LESION_REVIEW_STATUSES, TRIAGE_MIN_NOTES_CHARS, TRIAGE_MIN_NOTES_CHARS_FOR_DIFFERENTIALS };', ctx, { filename: 'proactive-content-triage.js' });
  return ctx;
}
function lesion(overrides) {
  return Object.assign({ id: 'l1', name: 'Hemangioma hepático', s: 'Abdômen Superior', site: 'Fígado', notes: '', tags: [], images: [] }, overrides);
}
// Objetos/arrays devolvidos pelo vm vêm de outro realm — deepEqual estrito
// compara [[Prototype]] e falha mesmo com conteúdo idêntico. JSON.parse/
// stringify "reimporta" o valor pro realm local antes de comparar.
function plain(v){ return JSON.parse(JSON.stringify(v)); }

/* ===================== 1. critérios individuais (motivos objetivos) ===================== */

test('1. notes_empty: notes vazia/só espaço -> motivo único, nada mais é avaliado', () => {
  const ctx = buildCtx({});
  assert.deepEqual(plain(ctx.triageNotesReasons(lesion({ notes: '' }))), ['notes_empty']);
  assert.deepEqual(plain(ctx.triageNotesReasons(lesion({ notes: '   ' }))), ['notes_empty']);
});

test('2. notes_too_short: notes curta (abaixo do limiar) -> motivo', () => {
  const ctx = buildCtx({});
  const reasons = ctx.triageNotesReasons(lesion({ notes: 'Lesão hepática benigna comum.' }));
  assert.ok(reasons.includes('notes_too_short'));
});

test('3. notes_repeats_name_only: quase só repete o nome da lesão (tokens fora do nome < limiar)', () => {
  const ctx = buildCtx({});
  const reasons = ctx.triageNotesReasons(lesion({ name: 'Hemangioma hepático', notes: 'Hemangioma hepático típico, hemangioma.' }));
  assert.ok(reasons.includes('notes_repeats_name_only'));
});

test('4. notes_missing_differentials: heurística CONSERVADORA — só dispara em notes bem longa (3x o limiar de "curta"), nunca pela mera ausência da palavra', () => {
  const ctx = buildCtx({});
  // lrev — moderadamente longa (passaria do limiar ANTIGO de 80 chars) sem
  // menção a diferencial: NÃO dispara mais — a ausência da palavra sozinha
  // não é prova de deficiência (nem toda entidade precisa de diferencial).
  const moderateNoDiff = 'Lesão nodular bem definida, homogênea, com realce discreto e progressivo após a administração do meio de contraste.';
  assert.ok(moderateNoDiff.length > ctx.__consts.TRIAGE_MIN_NOTES_CHARS, 'passaria do limiar antigo de "curta"');
  assert.ok(!ctx.triageNotesReasons(lesion({ notes: moderateNoDiff })).includes('notes_missing_differentials'), 'notes moderadamente longa sem "diferencial" não é mais motivo isolado');
  const longNoDiff = 'Lesão nodular bem definida, homogênea, com realce progressivo centrípeto característico em fase tardia após contraste, sem lavagem, compatível com diagnóstico típico, sem sinais de invasão ou comportamento agressivo, achados estáveis em todo o acompanhamento por imagem disponível até o momento.';
  assert.ok(longNoDiff.length >= ctx.__consts.TRIAGE_MIN_NOTES_CHARS_FOR_DIFFERENTIALS, 'fixture precisa passar do novo limiar conservador (3x)');
  const reasons = ctx.triageNotesReasons(lesion({ notes: longNoDiff }));
  assert.ok(reasons.includes('notes_missing_differentials'));
  const withDiff = longNoDiff + ' Diferenciais-chave: metástase hipervascular e adenoma.';
  const reasons2 = ctx.triageNotesReasons(lesion({ notes: withDiff }));
  assert.ok(!reasons2.includes('notes_missing_differentials'), 'com "Diferenciais-chave" presente, o motivo não dispara');
});

test('5. tags_empty / tags_insufficient', () => {
  const ctx = buildCtx({});
  assert.deepEqual(plain(ctx.triageTagsReasons(lesion({ tags: [] }))), ['tags_empty']);
  assert.deepEqual(plain(ctx.triageTagsReasons(lesion({ tags: ['hepático'] }))), ['tags_insufficient']);
  assert.deepEqual(plain(ctx.triageTagsReasons(lesion({ tags: ['a', 'b', 'c'] }))), []);
});

test('6. enterm_empty / enterm_equals_name', () => {
  const ctx = buildCtx({});
  assert.deepEqual(plain(ctx.triageEnTermReasons(lesion({ enTerm: '' }))), ['enterm_empty']);
  assert.deepEqual(plain(ctx.triageEnTermReasons(lesion({ name: 'Hemangioma hepático', enTerm: 'Hemangioma hepático' }))), ['enterm_equals_name']);
  assert.deepEqual(plain(ctx.triageEnTermReasons(lesion({ name: 'Hemangioma hepático', enTerm: 'Hepatic hemangioma' }))), []);
});

test('7. classification_missing_applicable: reaproveita CLASSIFICATION_CONTEXT_RULES/classifyClassificationCompatibility, sem duplicar regex', () => {
  const ctx = buildCtx({});
  // AVC isquêmico em Neurorradiologia: contexto bate com ASPECTS (mesma regra do auditor real).
  const avc = lesion({ id: 'l2', name: 'AVC isquêmico agudo', s: 'Neurorradiologia', site: 'Território da ACM', classification: null });
  assert.deepEqual(plain(ctx.triageClassificationReasons(avc)), ['classification_missing_applicable']);
  // já tem classification -> nunca sugere de novo.
  assert.deepEqual(plain(ctx.triageClassificationReasons(Object.assign({}, avc, { classification: 'ASPECTS' }))), []);
  // contexto sem nenhum sistema batendo -> nada.
  const generic = lesion({ id: 'l3', name: 'Lesão inespecífica', s: 'Tórax', site: 'Mediastino' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(generic)), []);
});

test('7b. classification_missing_applicable é CONSERVADOR — exclusão de entidade benigna conhecida (hemangioma hepático nunca é LI-RADS)', () => {
  const ctx = buildCtx({});
  // lrev — este é o falso-positivo real corrigido: antes, "hepático" no
  // nome batia LIRADS (seção+palavra-chave) mesmo sendo um hemangioma, que
  // NUNCA recebe LI-RADS (sistema de risco de CHC, não de achado benigno).
  const hemangioma = lesion({ id: 'l4', name: 'Hemangioma hepático', s: 'Abdômen Superior', site: 'Fígado' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(hemangioma)), [], 'nunca sugere LI-RADS pra hemangioma, mesmo batendo seção+palavra-chave');
  // mesma seção/palavra, mas SEM a exclusão (não é um hemangioma) -> continua sinalizando normalmente.
  const nodule = lesion({ id: 'l5', name: 'Nódulo hepático em paciente cirrótico', s: 'Abdômen Superior', site: 'Fígado' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(nodule)), ['classification_missing_applicable']);
});

test('7c. classification_missing_applicable é CONSERVADOR — AAST (trauma) exige contexto de trauma explícito, nunca só a região anatômica', () => {
  const ctx = buildCtx({});
  // lrev — antes, QUALQUER lesão esplênica/renal/hepática batia AAST_* só
  // pela região; AAST (American Association for the Surgery of Trauma) só
  // existe pra grading de TRAUMA — nunca pra achado incidental/tumoral.
  const incidental = lesion({ id: 'l6', name: 'Cisto esplênico simples', s: 'Abdômen Superior', site: 'Baço' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(incidental)), [], 'cisto esplênico incidental nunca sugere AAST');
  const trauma = lesion({ id: 'l7', name: 'Laceração esplênica por trauma abdominal fechado', s: 'Abdômen Superior', site: 'Baço' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(trauma)), ['classification_missing_applicable'], 'com contexto de trauma explícito, continua sinalizando AAST normalmente');
});

test('7d. classification_missing_applicable é CONSERVADOR — C-RADS exige contexto colônico/colonográfico real, nunca só a palavra "apêndice"', () => {
  const ctx = buildCtx({});
  // lrev — caso real reportado: "Apendicite aguda" batia C-RADS (regra
  // compartilhada inclui ap[eê]ndic pra cobrir achado apendicular VISTO em
  // colonografia) mesmo sem nenhum contexto de colonografia/cólon.
  const apendicite = lesion({ id: 'l8', name: 'Apendicite aguda', s: 'Abdômen Superior', site: 'Intestino / cólon' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(apendicite)), [], 'apendicite aguda nunca sugere C-RADS');
  assert.equal(ctx.triageClassificationApplicable('CRADS', apendicite), false);
  // contexto colônico real -> continua sinalizando C-RADS normalmente.
  const polipo = lesion({ id: 'l9', name: 'Pólipo colônico', s: 'Abdômen Superior', site: 'Intestino / cólon' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(polipo)), ['classification_missing_applicable'], 'contexto colônico real continua sugerindo C-RADS');
  assert.equal(ctx.triageClassificationApplicable('CRADS', polipo), true);
});

test('7e. classification_missing_applicable é CONSERVADOR — Bosniak exige contexto RENAL real, nunca só a substring "cisto"', () => {
  const ctx = buildCtx({});
  // lrev — caso real reportado: "Pseudocisto pancreático" batia Bosniak só
  // pela substring "cisto"; Bosniak é EXCLUSIVO de cisto renal.
  const pseudocisto = lesion({ id: 'l10', name: 'Pseudocisto pancreático', s: 'Abdômen Superior', site: 'Pâncreas' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(pseudocisto)), [], 'pseudocisto pancreático nunca sugere Bosniak');
  assert.equal(ctx.triageClassificationApplicable('BOSNIAK', pseudocisto), false);
  // contexto renal real -> continua sinalizando Bosniak normalmente.
  const renal = lesion({ id: 'l11', name: 'Cisto renal complexo', s: 'Abdômen Superior', site: 'Rim' });
  assert.deepEqual(plain(ctx.triageClassificationReasons(renal)), ['classification_missing_applicable'], 'contexto renal real continua sugerindo Bosniak');
  assert.equal(ctx.triageClassificationApplicable('BOSNIAK', renal), true);
  // outros órgãos/sítios com "cisto"/"cístic" nunca sugerem Bosniak — testado
  // direto na função (o pipeline completo pode legitimamente sugerir OUTRO
  // sistema, ex. O-RADS pra cisto ovariano — isso não é um bug a corrigir).
  assert.equal(ctx.triageClassificationApplicable('BOSNIAK', { name: 'Cisto ovariano', site: 'Ovário' }), false);
  assert.equal(ctx.triageClassificationApplicable('BOSNIAK', { name: 'Cisto hepático', site: 'Fígado' }), false);
});

test('8. clinical_tags_missing_with_context: caso clínico didático vinculado, mas sem clinicalTags', () => {
  const ctx = buildCtx({});
  const withCase = lesion({ clinicalCases: [{ id: 'c1', title: 'Caso 1' }], clinicalTags: [] });
  assert.deepEqual(plain(ctx.triageClinicalTagsReasons(withCase)), ['clinical_tags_missing_with_context']);
  const withCaseAndTags = lesion({ clinicalCases: [{ id: 'c1' }], clinicalTags: ['dor lombar'] });
  assert.deepEqual(plain(ctx.triageClinicalTagsReasons(withCaseAndTags)), []);
  const withoutCase = lesion({ clinicalCases: [], clinicalTags: [] });
  assert.deepEqual(plain(ctx.triageClinicalTagsReasons(withoutCase)), []);
});

test('9. rich_images_weak_notes: várias imagens + notes fraca -> motivo próprio', () => {
  const ctx = buildCtx({});
  const images = [{ data: 'a' }, { data: 'b' }, { data: 'c' }];
  const weak = ctx.triageNotesReasons(lesion({ notes: '' }));
  assert.deepEqual(plain(ctx.triageRichImagesWeakNotesReasons(lesion({ images }), weak)), ['rich_images_weak_notes']);
  const strongNotesReasons = [];
  assert.deepEqual(plain(ctx.triageRichImagesWeakNotesReasons(lesion({ images }), strongNotesReasons)), []);
  assert.deepEqual(plain(ctx.triageRichImagesWeakNotesReasons(lesion({ images: [{ data: 'a' }] }), weak)), [], 'poucas imagens não dispara, mesmo com notes fraca');
});

/* ===================== 2. evaluateLesionForTriage (central, pura) ===================== */

test('10. lesão "perfeita" (todos os campos preenchidos, sem lacuna) -> reasons vazio, score 0', () => {
  const ctx = buildCtx({});
  // classification preenchida de propósito: com Abdômen Superior/Fígado +
  // "hepático" no nome, LIRADS bateria como "compatible" (mesma regra do
  // auditor real) e geraria classification_missing_applicable — não é uma
  // lacuna de verdade quando a classificação já existe.
  const perfect = lesion({
    name: 'Hemangioma hepático', enTerm: 'Hepatic hemangioma', classification: 'LIRADS',
    notes: 'Lesão nodular hipervascular com realce centrípeto progressivo e preenchimento tardio completo, achado característico. Diferenciais-chave: metástase hipervascular, adenoma e CHC em fígado cirrótico.',
    tags: ['realce centrípeto', 'hipervascular', 'benigno'], images: [{ data: 'a' }]
  });
  const r = ctx.evaluateLesionForTriage(perfect);
  assert.deepEqual(plain(r.reasons), []);
  assert.equal(r.score, 0);
});

test('11. lesão com várias lacunas -> reasons acumula TODOS os motivos aplicáveis, score soma os pesos', () => {
  const ctx = buildCtx({});
  const bad = lesion({ name: 'Doença Y', notes: '', tags: [], enTerm: '' });
  const r = plain(ctx.evaluateLesionForTriage(bad));
  assert.ok(r.reasons.includes('notes_empty'));
  assert.ok(r.reasons.includes('tags_empty'));
  assert.ok(r.reasons.includes('enterm_empty'));
  const weights = ctx.__consts.TRIAGE_REASON_WEIGHTS;
  const expectedScore = r.reasons.reduce((s, code) => s + (weights[code] || 1), 0);
  assert.equal(r.score, expectedScore);
  assert.ok(r.score > 0);
});

test('12. entrada inválida (sem id) -> reasons vazio, score 0, nunca lança', () => {
  const ctx = buildCtx({});
  assert.deepEqual(plain(ctx.evaluateLesionForTriage(null)), { reasons: [], score: 0 });
  assert.deepEqual(plain(ctx.evaluateLesionForTriage({})), { reasons: [], score: 0 });
});

/* ===================== 3. scanCatalogForTriage (varredura, read-only) ===================== */

test('13. varre o catálogo, ordena por score desc (empate -> nome) e nunca grava em DATA', () => {
  const data = [
    lesion({ id: 'a', name: 'Zebra', notes: '', tags: [] }),       // notes_empty+tags_empty
    lesion({ id: 'b', name: 'Abacate', notes: 'Texto curtinho.', tags: ['x', 'y', 'z'] }), // só notes_too_short
    lesion({ id: 'c', name: 'Perfeita', notes: 'Diferenciais-chave: nada a corrigir aqui mesmo, texto longo o suficiente pra passar do limiar mínimo definido.', tags: ['a', 'b', 'c'], enTerm: 'perfect term' })
  ];
  const snapshot = JSON.parse(JSON.stringify(data));
  const ctx = buildCtx({ data });
  const out = ctx.scanCatalogForTriage(data);
  assert.deepEqual(data, snapshot, 'scanCatalogForTriage nunca muta as lesões');
  assert.ok(out.every(c => c.id !== 'c'), 'lesão sem lacunas não aparece na fila');
  assert.equal(out[0].id, 'a', 'maior score primeiro');
  assert.ok(out[0].score > out[1].score);
});

test('14. lesão com revisão ativa NUNCA aparece como candidata (nunca duplica pedido)', () => {
  const data = [lesion({ id: 'a', name: 'Zebra', notes: '', tags: [] })];
  const lesionRevisions = { r1: { id: 'r1', scope: 'lesion', lesionId: 'a', status: 'pending' } };
  const ctx = buildCtx({ data, lesionRevisions });
  const out = ctx.scanCatalogForTriage(data);
  assert.equal(out.length, 0);
});

test('15. cada motivo é explicável: todo código de reasons tem um label em TRIAGE_REASON_LABELS', () => {
  const data = [lesion({ id: 'a', notes: '', tags: [], enTerm: '' })];
  const ctx = buildCtx({ data });
  const out = ctx.scanCatalogForTriage(data);
  const labels = ctx.__consts.TRIAGE_REASON_LABELS;
  out.forEach(c => c.reasons.forEach(code => {
    assert.ok(Object.prototype.hasOwnProperty.call(labels, code), 'motivo sem label: ' + code);
    assert.notEqual(ctx.triageReasonLabel(code), code, 'label deve ser texto explicativo, não o código bruto');
  }));
});

/* ===================== 4. createTriageReviewBatch (única ação que persiste) ===================== */

test('16. só persiste quando chamado: scan isolado nunca grava em LESION_REVISIONS', () => {
  const data = [lesion({ id: 'a', notes: '', tags: [] })];
  const lesionRevisions = {};
  const ctx = buildCtx({ data, lesionRevisions });
  ctx.scanCatalogForTriage(data);
  assert.deepEqual(ctx.LESION_REVISIONS, {}, 'nenhum pedido criado só de escanear/listar candidatas');
});

test('17. lote selecionado cria um pedido POR lesão via createLesionReview (mesma função da UI manual)', () => {
  const ctx = buildCtx({ lesionRevisions: {} });
  const candidates = [
    { id: 'a', name: 'Lesão A', reasons: ['notes_empty', 'tags_empty'] },
    { id: 'b', name: 'Lesão B', reasons: ['enterm_empty'] }
  ];
  const res = ctx.createTriageReviewBatch(candidates);
  assert.equal(res.created.length, 2);
  assert.equal(res.skipped.length, 0);
  const ids = Object.keys(ctx.LESION_REVISIONS);
  assert.equal(ids.length, 2);
  ids.forEach(id => {
    const review = ctx.LESION_REVISIONS[id];
    assert.equal(review.status, 'pending');
    assert.equal(review.solution, null);
    assert.deepEqual(plain(review.attempts), []);
  });
});

test('18. requestText do pedido criado é texto explicável (motivos), nunca proposedChanges/autorização', () => {
  const ctx = buildCtx({ lesionRevisions: {} });
  const res = ctx.createTriageReviewBatch([{ id: 'a', name: 'Lesão A', reasons: ['notes_empty', 'tags_insufficient'] }]);
  const review = ctx.LESION_REVISIONS[res.created[0]];
  assert.match(review.requestText, /descrição ausente/);
  assert.match(review.requestText, /poucas tags/);
  assert.equal(review.solution, null, 'nenhuma proposedChanges é criada automaticamente');
  assert.equal(review.status, 'pending', 'nunca entra como aplicada/autorizada automaticamente');
});

test('19. revalida hasActiveLesionReview no momento da criação (defesa contra lista desatualizada)', () => {
  const lesionRevisions = { r1: { id: 'r1', scope: 'lesion', lesionId: 'a', status: 'pending' } };
  const ctx = buildCtx({ lesionRevisions });
  const res = ctx.createTriageReviewBatch([{ id: 'a', name: 'Lesão A', reasons: ['notes_empty'] }]);
  assert.equal(res.created.length, 0);
  assert.equal(res.skipped[0].reason, 'already_in_review');
});

test('20. lote vazio/inválido não cria nada e não lança', () => {
  const ctx = buildCtx({ lesionRevisions: {} });
  assert.deepEqual(plain(ctx.createTriageReviewBatch([])), { created: [], skipped: [] });
  const res = ctx.createTriageReviewBatch([{ reasons: ['notes_empty'] }]); // sem id
  assert.equal(res.created.length, 0);
  assert.equal(res.skipped[0].reason, 'invalid_candidate');
});

/* ===================== 5. compatibilidade com a fila/central já existente ===================== */

test('21. reviewIds criados são únicos (genLesionReviewId real) mesmo em lote grande', () => {
  const ctx = buildCtx({ lesionRevisions: {} });
  const candidates = Array.from({ length: 12 }, (_, i) => ({ id: 'lesion' + i, name: 'Lesão ' + i, reasons: ['notes_empty'] }));
  const res = ctx.createTriageReviewBatch(candidates);
  assert.equal(res.created.length, 12);
  assert.equal(new Set(res.created).size, 12, 'nenhum reviewId duplicado');
});

test('22. revisões criadas pela triagem são indistinguíveis de uma revisão manual para o resto da fila (mesmo scope/status/ACTIVE_LESION_REVIEW_STATUSES)', () => {
  const ctx = buildCtx({ lesionRevisions: {} });
  const res = ctx.createTriageReviewBatch([{ id: 'a', name: 'Lesão A', reasons: ['notes_empty'] }]);
  const review = ctx.LESION_REVISIONS[res.created[0]];
  assert.equal(ctx.reviewScope(review), 'lesion');
  assert.ok(ctx.__consts.ACTIVE_LESION_REVIEW_STATUSES.includes(review.status), 'aparece em pending/batch como qualquer revisão manual');
  assert.ok(ctx.hasActiveLesionReview('a'), 'já é detectada como revisão ativa pela própria infraestrutura existente');
});

test('23. allowedFields da ponte com IA (buildReviewAiPacket) continua cobrindo os campos que a triagem usa como critério', () => {
  const allowed = extractConst(html, 'REVIEW_AI_ALLOWED_FIELDS');
  assert.match(allowed, /'notes'/);
  assert.match(allowed, /'tags'/);
  assert.match(allowed, /'enTerm'/);
  assert.match(allowed, /'classification'/);
});

/* ===================== 6. regressão — infraestrutura de revisão não foi tocada ===================== */

test('24. createLesionReview continua igual (mesma dedup/estrutura usada pela UI manual) — nenhuma lógica nova duplicada', () => {
  const src = extractFunction(html, 'createLesionReview');
  assert.match(src, /genLesionReviewId\(\)/);
  assert.match(src, /status: 'pending'/);
  assert.doesNotMatch(src, /triage/i, 'createLesionReview não sabe nada sobre triagem — só recebe lesionId+texto, como sempre');
});

test('25. nenhuma função de triagem referencia Firestore/localStorage/Cloudinary diretamente', () => {
  ['scanCatalogForTriage', 'evaluateLesionForTriage', 'createTriageReviewBatch'].forEach(name => {
    const src = extractFunction(html, name);
    assert.ok(!/firebase\.firestore|fbDb\.|localStorage\.(setItem|removeItem)|cloudinary/i.test(src), name + ' não deveria tocar infraestrutura externa');
  });
});
