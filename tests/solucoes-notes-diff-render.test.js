'use strict';

/* Correção da arquitetura de notes estruturadas (pattern/differentials no
 * backend — ver functions/review-analysis.js) na ponta do FRONTEND: o card
 * de proposta em 💡 Soluções (openReadySolutionsModal/renderProposedList)
 * mostrava o diff de "notes" numa única linha "de → para", colapsando as
 * quebras de "Padrão:"/"Diferenciais-chave:" (bug relatado: card
 * "colapsa/representa mal as quebras"). Correção: renderFieldChangesHtml
 * agora reaproveita o MESMO renderer do detalhe da lesão
 * (notesDifferentialsHtml) para o campo notes — nenhum parser novo.
 *
 * Harness: extrai as funções REAIS do index.html (mesma técnica de
 * tests/lesion-hover-preview.test.js) e roda num vm context mínimo.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\(', 'm');
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
function extractLineFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^\\n\\r]*\\}', 'm');
  const m = re.exec(source); assert.ok(m, 'helper de uma linha não encontrado: ' + name);
  return m[0];
}

const FNS = ['splitDifferentialItems', 'notesDifferentialsHtml', 'formatLesionReviewFieldValue',
  'describeLesionReviewFieldChanges', 'renderFieldChangesHtml'];
const FN_SRC = FNS.map((n) => extractFunction(html, n).source).join('\n');
const ESC_SRC = ['esc', 'escAttr'].map((n) => extractLineFunction(html, n)).join('\n');
const LABELS_SRC = html.slice(html.indexOf('const LESION_REVIEW_FIELD_LABELS'), html.indexOf('const LESION_REVIEW_FIELD_LABELS') + 200).split('\n')[0];

function makeCtx() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(ESC_SRC + '\n' + LABELS_SRC + '\n' + FN_SRC, context, { filename: 'solucoes-notes-diff.js' });
  return context;
}

const LESION_ATUAL = { notes: 'Padrão: achado antigo genérico.' };
const NOTES_PROPOSTA = 'Padrão: massa sólida bem circunscrita na região selar/suprasselar.\n\n'
  + 'Diferenciais-chave:\n'
  + 'Craniofaringioma adamantinomatoso — maior componente cístico.\n'
  + 'Meningioma do tubérculo selar — implantação dural ampla.\n'
  + 'Cisto de Rathke — parede fina, sem componente sólido.';

test('ESTÁTICO: renderFieldChangesHtml chama notesDifferentialsHtml para o campo notes (renderer compartilhado, nenhum parser novo)', () => {
  const src = extractFunction(html, 'renderFieldChangesHtml').body;
  assert.match(src, /notesDifferentialsHtml\(r\.to\)/);
});

test('diff de notes na proposta usa notesDifferentialsHtml: "Padrão:"/"Diferenciais-chave:" preservados, cada diferencial em bloco próprio', () => {
  const ctx = makeCtx();
  const rows = vm.runInContext(
    `describeLesionReviewFieldChanges(${JSON.stringify(LESION_ATUAL)}, {notes:${JSON.stringify(NOTES_PROPOSTA)}}, ['notes'])`, ctx);
  const out = vm.runInContext(`renderFieldChangesHtml(${JSON.stringify(rows)})`, ctx);
  assert.match(out, /<strong>Diferenciais-chave:<\/strong>/, '"Diferenciais-chave:" preservado e destacado, não colapsado numa linha');
  const items = out.match(/<div class="notes-differential-item">/g) || [];
  assert.equal(items.length, 3, 'os 3 diferenciais aparecem em blocos próprios, nunca numa única linha "de → para"');
});

test('nome de cada diferencial da proposta aparece em <strong> (mesma hierarquia visual do detalhe da lesão)', () => {
  const ctx = makeCtx();
  const rows = vm.runInContext(
    `describeLesionReviewFieldChanges(${JSON.stringify(LESION_ATUAL)}, {notes:${JSON.stringify(NOTES_PROPOSTA)}}, ['notes'])`, ctx);
  const out = vm.runInContext(`renderFieldChangesHtml(${JSON.stringify(rows)})`, ctx);
  assert.match(out, /<strong>Craniofaringioma adamantinomatoso<\/strong> — maior componente cístico\./);
  assert.match(out, /<strong>Meningioma do tubérculo selar<\/strong> — implantação dural ampla\./);
  assert.match(out, /<strong>Cisto de Rathke<\/strong> — parede fina, sem componente sólido\./);
});

test('a notes ATUAL (não a proposta) continua visível, de forma compacta — nunca escondida', () => {
  const ctx = makeCtx();
  const rows = vm.runInContext(
    `describeLesionReviewFieldChanges(${JSON.stringify(LESION_ATUAL)}, {notes:${JSON.stringify(NOTES_PROPOSTA)}}, ['notes'])`, ctx);
  const out = vm.runInContext(`renderFieldChangesHtml(${JSON.stringify(rows)})`, ctx);
  assert.match(out, /descrição atual:<\/b> <span class="review-fields-diff-from">Padrão: achado antigo genérico\.<\/span>/);
});

test('campos que não são notes (ex.: tags) continuam no formato "de → para" de sempre — sem mudança de comportamento', () => {
  const ctx = makeCtx();
  const rows = vm.runInContext(`describeLesionReviewFieldChanges({tags:['a','b']}, {tags:['a','b','c']}, ['tags'])`, ctx);
  const out = vm.runInContext(`renderFieldChangesHtml(${JSON.stringify(rows)})`, ctx);
  assert.match(out, /<span class="review-fields-diff-from">a, b<\/span> → <span class="review-fields-diff-to">a, b, c<\/span>/);
  assert.doesNotMatch(out, /notes-differential-item/);
});

test('notes sem "Diferenciais-chave:" (texto simples antigo) continua renderizando normal, só escapado — compatibilidade total', () => {
  const ctx = makeCtx();
  const rows = vm.runInContext(
    `describeLesionReviewFieldChanges({notes:'antiga'}, {notes:'Correção pontual de um erro de digitação.'}, ['notes'])`, ctx);
  const out = vm.runInContext(`renderFieldChangesHtml(${JSON.stringify(rows)})`, ctx);
  assert.match(out, /Correção pontual de um erro de digitação\./);
  assert.doesNotMatch(out, /notes-differential-item|<strong>/);
});

test('notes vazio ("—") no diff nunca chama notesDifferentialsHtml com texto inválido', () => {
  const ctx = makeCtx();
  const rows = vm.runInContext(`describeLesionReviewFieldChanges({}, {}, ['notes'])`, ctx);
  const out = vm.runInContext(`renderFieldChangesHtml(${JSON.stringify(rows)})`, ctx);
  assert.match(out, />—<\/div>/);
});

test('ESTÁTICO: renderFieldChangesHtml nunca referencia DATA/saveData/autorização — é só apresentação de um diff já calculado', () => {
  const src = extractFunction(html, 'renderFieldChangesHtml').body;
  for (const forbidden of ['DATA', 'saveData', 'authorizeAndApplyReviewSolution', 'setReviewSolution']) {
    assert.doesNotMatch(src, new RegExp('\\b' + forbidden + '\\b'));
  }
});
