'use strict';

/* Semântica de VENCIDAS x PRÓXIMAS revisões (SRS) e atualização do painel.
 * Extrai o trecho REAL do index.html e roda num `vm` isolado. Nenhum teste
 * acessa IndexedDB, Firebase, Cloudinary ou rede.
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
  return { source: source.slice(m.index, end + 1), body: source.slice(ob + 1, end) };
}

const FUTURE_FN = extractFunction(html, 'fmtReviewFuture');
const PAST_FN = extractFunction(html, 'fmtReviewPast');
const SCHED_FN = extractFunction(html, 'scheduledReviewEntries');
const PART_FN = extractFunction(html, 'partitionScheduledReviews');
const PANEL_FN = extractFunction(html, 'reviewPanelModel');

function buildCtx(data, srs) {
  const ctx = { console, JSON, Object, Array, String, Number, Math, Date, DATA: data || [], SRS: srs || {} };
  vm.createContext(ctx);
  vm.runInContext([FUTURE_FN.source, PAST_FN.source, SCHED_FN.source, PART_FN.source, PANEL_FN.source].join('\n'), ctx, { filename: 'srs-dashboard.js' });
  return ctx;
}

const HOUR = 3600000, DAY = 86400000;

test('SRS: dueAt no PASSADO é classificado como VENCIDA', () => {
  const now = Date.now();
  const data = [{ id: 'a', name: 'A', s: 'S', site: 'T' }, { id: 'b', name: 'B', s: 'S', site: 'T' }];
  const srs = { a: { due: now - 2 * HOUR }, b: { due: now + 3 * HOUR } };
  const ctx = buildCtx(data, srs);
  const p = ctx.partitionScheduledReviews(now);
  assert.equal(p.overdue.length, 1);
  assert.equal(p.overdue[0].id, 'a');
  assert.equal(p.upcoming.length, 1);
  assert.equal(p.upcoming[0].id, 'b');
});

test('SRS: dueAt no FUTURO é classificado como PRÓXIMA (não vencida)', () => {
  const now = Date.now();
  const ctx = buildCtx([{ id: 'a', name: 'A', s: 'S', site: 'T' }], { a: { due: now + DAY } });
  const p = ctx.partitionScheduledReviews(now);
  assert.equal(p.overdue.length, 0);
  assert.equal(p.upcoming.length, 1);
});

test('SRS: "nunca estudada" (sem SRS) NÃO entra em vencidas nem próximas', () => {
  const now = Date.now();
  const ctx = buildCtx([{ id: 'a', name: 'A', s: 'S', site: 'T' }], {});
  const p = ctx.partitionScheduledReviews(now);
  assert.equal(p.overdue.length, 0);
  assert.equal(p.upcoming.length, 0);
  assert.equal(ctx.scheduledReviewEntries().length, 0);
});

test('SRS: item VENCIDO usa "vencida há …" e NUNCA "em …"', () => {
  const ctx = buildCtx();
  assert.equal(ctx.fmtReviewPast(Date.now() - 2 * HOUR), 'vencida há 2 h');
  assert.equal(ctx.fmtReviewPast(Date.now() - 3 * DAY), 'vencida há 3 dias');
  assert.equal(ctx.fmtReviewPast(Date.now() - 30 * 60000), 'vencida há < 1 h');
  assert.doesNotMatch(ctx.fmtReviewPast(Date.now() - 2 * HOUR), /^em /);
});

test('SRS: item FUTURO usa "em …" e NUNCA "vencida"', () => {
  const ctx = buildCtx();
  assert.equal(ctx.fmtReviewFuture(Date.now() + 11 * HOUR), 'em 11 h');
  assert.equal(ctx.fmtReviewFuture(Date.now() + 30 * 60000), 'em < 1 h');
  assert.doesNotMatch(ctx.fmtReviewFuture(Date.now() + 11 * HOUR), /vencida/);
});

test('SRS: lista ordenada por dueAt crescente em vencidas e próximas', () => {
  const now = Date.now();
  const data = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const srs = { a: { due: now + 5 * HOUR }, b: { due: now - 1 * HOUR }, c: { due: now + 2 * HOUR }, d: { due: now - 4 * HOUR } };
  const ctx = buildCtx(data, srs);
  const p = ctx.partitionScheduledReviews(now);
  assert.deepEqual(p.overdue.map(e => e.id), ['d', 'b']);
  assert.deepEqual(p.upcoming.map(e => e.id), ['c', 'a']);
});

test('SRS: reagendar uma vencida para o futuro REDUZ o contador de vencidas', () => {
  const now = Date.now();
  const data = [{ id: 'a' }];
  const srs = { a: { due: now - 1 * HOUR } };
  const ctx = buildCtx(data, srs);
  assert.equal(ctx.partitionScheduledReviews(now).overdue.length, 1);
  // simula responder e reagendar (como srsGradeLevel faria)
  ctx.SRS.a.due = now + 3 * DAY;
  assert.equal(ctx.partitionScheduledReviews(now).overdue.length, 0);
  assert.equal(ctx.partitionScheduledReviews(now).upcoming.length, 1);
});

// ---------------------------------------------------------------------------
// UM ÚNICO PAINEL: vencidas têm prioridade; sem vencidas, próximas.
// ---------------------------------------------------------------------------

test('PAINEL ÚNICO: com vencidas mostra "Revisões vencidas" e NÃO "Próximas revisões"', () => {
  const now = Date.now();
  const ctx = buildCtx([{ id: 'a' }, { id: 'b' }], { a: { due: now - 2 * HOUR }, b: { due: now + 5 * HOUR } });
  const m = ctx.reviewPanelModel(now);
  assert.equal(m.mode, 'overdue');
  assert.equal(m.head.title, 'Revisões vencidas');
  assert.equal(m.head.sub, 'SRS · já passaram do vencimento');
  assert.notEqual(m.head.title, 'Próximas revisões');
  assert.deepEqual(m.list.map(e => e.id), ['a'], 'a lista é só de vencidas');
});

test('PAINEL ÚNICO: sem vencidas mostra "Próximas revisões"', () => {
  const now = Date.now();
  const ctx = buildCtx([{ id: 'a' }, { id: 'b' }], { a: { due: now + 5 * HOUR }, b: { due: now + 2 * DAY } });
  const m = ctx.reviewPanelModel(now);
  assert.equal(m.mode, 'upcoming');
  assert.equal(m.head.title, 'Próximas revisões');
  assert.equal(m.head.sub, 'SRS · casos clínicos agendados');
  assert.deepEqual(m.list.map(e => e.id), ['a', 'b'], 'ordenado por due');
});

test('PAINEL ÚNICO: badge mostra o TOTAL real de vencidas (mesmo com lista limitada a 5)', () => {
  const now = Date.now();
  const data = []; const srs = {};
  for (let i = 0; i < 8; i++) { data.push({ id: 'x' + i }); srs['x' + i] = { due: now - (i + 1) * HOUR }; }
  const ctx = buildCtx(data, srs);
  const m = ctx.reviewPanelModel(now);
  assert.equal(m.overdueCount, 8);
  assert.equal(m.head.badge, '8 vencidas');
  assert.equal(m.list.length, 8, 'o modelo devolve todas; a UI corta em 5 na hora de renderizar');
});

test('PAINEL ÚNICO: resolver a ÚLTIMA vencida troca automaticamente para "Próximas revisões"', () => {
  const now = Date.now();
  const ctx = buildCtx([{ id: 'a' }, { id: 'b' }], { a: { due: now - 1 * HOUR }, b: { due: now + 4 * HOUR } });
  assert.equal(ctx.reviewPanelModel(now).mode, 'overdue');
  // reagenda a única vencida (como srsGradeLevel faria ao responder)
  ctx.SRS.a.due = now + 3 * DAY;
  const m = ctx.reviewPanelModel(now);
  assert.equal(m.mode, 'upcoming');
  assert.equal(m.head.title, 'Próximas revisões');
  assert.equal(m.overdueCount, 0);
});

test('PAINEL ÚNICO: "em dia" quando não há vencidas nem futuras', () => {
  const now = Date.now();
  const ctx = buildCtx([{ id: 'a' }], {});
  const m = ctx.reviewPanelModel(now);
  assert.equal(m.mode, 'upcoming');
  assert.equal(m.head.badge, 'em dia');
});

// ---------------------------------------------------------------------------
// ATUALIZAÇÃO PÓS-RESPOSTA E NÃO-DUPLICAÇÃO (estático)
// ---------------------------------------------------------------------------

test('PAINEL: o refresh ao vivo re-renderiza o painel único (sem fechar/reabrir)', () => {
  const refresh = extractFunction(html, 'refreshStudyDashboardLive');
  assert.match(refresh.body, /renderReviewPanels\(ov\)/, 'o painel precisa ser atualizado ao vivo');
  const render = extractFunction(html, 'renderReviewPanels');
  assert.match(render.body, /reviewPanelModel\(Date\.now\(\)\)/);
  assert.match(render.body, /#study-review-panel/);
});

test('PAINEL: responder chama srsGradeLevel + refreshStudyDashboardLive (atualiza na hora)', () => {
  const apply = extractFunction(html, 'applyGrade');
  assert.match(apply.body, /if\(st\.grade\) return;/, 'não duplica ao classificar de novo');
  assert.match(apply.body, /srsGradeLevel\(e\.id,g\)/);
  assert.match(apply.body, /refreshStudyDashboardLive\(\)/);
});

test('PAINEL: dashboard tem UM ÚNICO container de revisões e os dois títulos no modelo', () => {
  assert.match(html, /id="study-review-panel"/);
  assert.doesNotMatch(html, /id="study-overdue"/, 'não há mais bloco separado de vencidas');
  assert.match(html, /Revisões vencidas/);
  assert.match(html, /Próximas revisões/);
  const model = extractFunction(html, 'reviewPanelModel');
  assert.match(model.body, /mode: useOverdue\?'overdue':'upcoming'/);
  assert.match(model.body, /list = useOverdue \? overdue : upcoming/);
});

test('PAINEL: sem duplicar SRS/score/SESSIONLOG ao responder', () => {
  const apply = extractFunction(html, 'applyGrade');
  assert.equal((apply.body.match(/srsGradeLevel\(/g) || []).length, 1);
  assert.equal((apply.body.match(/quizStats\[g\]\+\+/g) || []).length, 1);
  assert.equal((apply.body.match(/recordQuizAnswerToday\(/g) || []).length, 1);
  const rec = extractFunction(html, 'recordQuizAnswerToday');
  assert.match(rec.body, /rec\.reviewed=\(Number\(rec\.reviewed\)\|\|0\)\+1/);
  assert.match(rec.body, /SESSIONLOG\[key\]=rec/);
});

test('PAINEL: clique em revisão usa o mesmo fluxo (não cria segunda revisão)', () => {
  const render = extractFunction(html, 'renderReviewPanels');
  assert.match(render.body, /startQuizInsideDashboard\(\[target,/);
  assert.doesNotMatch(render.body, /createLesionReview|setReviewSolution/, 'não mexe em revisões de conteúdo');
});
