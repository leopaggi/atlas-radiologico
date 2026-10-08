'use strict';

/* AJUSTE VISUAL — FORMATAÇÃO DA FICHA "✨ proposta" (2026-10-08).
 *
 * Bug relatado: notes no formato
 *   "Padrão: <texto>\n\nDiferenciais-chave:\n— Nome: critério\n— ..."
 * (travessão "—" como MARCADOR DE LISTA no início da linha, seguido de
 * "Nome: critério") renderizava pobre dentro de .lesion-hover-preview:
 * "Padrão:" só ficava em negrito por acidente de CSS (::first-line, que
 * bold(e)ava a linha inteira dependendo de onde o texto quebrava
 * visualmente) e cada diferencial saía em texto corrido, sem negrito algum
 * — porque o parser de separador (notesDifferentialsHtml) procurava "(" ou
 * "—" como SEPARADOR dentro do item, e um item que começa com "—" tem
 * dashIdx===0, produzindo um "nome" vazio (sem('').trim()==='') que caía no
 * fallback sem negrito.
 *
 * Correção: reaproveita o MESMO renderer canônico de notes já usado em toda
 * parte (notesDifferentialsHtml → lesionHoverPreviewHtml, openDetail, Quiz,
 * diff de proposta) — nenhum formatador paralelo novo. Dentro dele:
 *   - boldLeadingPadraoLabelHtml: "Padrão:" ganha <strong> semântico
 *     (substituindo o hack ::first-line, removido).
 *   - formatDifferentialItemHtml: reconhece "— Nome: critério" como um 3º
 *     formato (além de "Nome (explicação)" e "Nome — explicação" como
 *     separador no meio do item, ambos preservados sem nenhuma mudança).
 *
 * `notes` em DATA nunca é alterado — é só apresentação (HTML gerado na
 * hora de renderizar, a partir da string salva, sempre escapada primeiro).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(source); assert.ok(m, 'função não encontrada: ' + name);
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
function extractLineFunction(source, name) {
  // escAttr contém replace(/"/g,...) — uma regex literal com uma única
  // aspa dupla, que confunde o contador de chaves por quote do
  // extractFunction (mesmo problema documentado em outras suítes do
  // projeto). escAttr/esc são funções de UMA linha, então basta casar até
  // o fim da linha, sem depth-counting.
  const re = new RegExp('^function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^\\n\\r]*\\}', 'm');
  const m = re.exec(source); assert.ok(m, 'helper de uma linha não encontrado: ' + name);
  return m[0];
}

const ESC_SRC = ['escAttr', 'esc'].map((n) => extractLineFunction(html, n)).join('\n');
const DEPS_SRC = ['splitDifferentialItems', 'boldLeadingPadraoLabelHtml', 'formatDifferentialItemHtml', 'notesDifferentialsHtml']
  .map((n) => extractFunction(html, n)).join('\n');

function makeCtx() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(ESC_SRC + '\n' + DEPS_SRC, context, { filename: 'notes-differential-bullet-format.js' });
  return context;
}
function render(notes) {
  const ctx = makeCtx();
  return vm.runInContext(`notesDifferentialsHtml(${JSON.stringify(notes)})`, ctx);
}

const NOTES_BULLET = 'Padrão: cratera ou nicho ulceroso gástrico; pregas que convergem suavemente.\n\n' +
  'Diferenciais-chave:\n' +
  '— Adenocarcinoma gástrico ulcerado: espessamento mural irregular ou massa.\n' +
  '— GIST gástrico ulcerado: massa subepitelial predominantemente exofítica.\n' +
  '— Linfoma gástrico: espessamento mural volumoso relativamente homogêneo.';

// ===========================================================================
// 1. "Padrão:" fica em <strong>.
// ===========================================================================
test('1. "Padrão:" fica em <strong> (negrito semântico, não mais só CSS ::first-line)', () => {
  const out = render(NOTES_BULLET);
  assert.match(out, /<strong class="notes-lead-label">Padrão:<\/strong> cratera ou nicho ulceroso gástrico/);
});

// ===========================================================================
// 2. "Diferenciais-chave:" fica em <strong>.
// ===========================================================================
test('2. "Diferenciais-chave:" fica em <strong>', () => {
  const out = render(NOTES_BULLET);
  assert.match(out, /<strong class="notes-section-label">Diferenciais-chave:<\/strong>/);
});

// ===========================================================================
// 3-4. Só "Nome:" (incluindo os dois-pontos) em <strong>; critério normal.
// ===========================================================================
test('3. em "— Adenocarcinoma gástrico ulcerado: espessamento...", somente "Adenocarcinoma gástrico ulcerado:" fica em <strong>', () => {
  const out = render(NOTES_BULLET);
  assert.match(out, /<strong>Adenocarcinoma gástrico ulcerado:<\/strong>/, 'nome + dois-pontos em negrito');
  assert.doesNotMatch(out, /<strong>Adenocarcinoma gástrico ulcerado: espessamento/, 'o critério não pode entrar dentro do mesmo <strong>');
});

test('4. o critério depois do ":" não fica em negrito (fica fora do <strong>, peso normal)', () => {
  const out = render(NOTES_BULLET);
  assert.match(out, /<strong>Adenocarcinoma gástrico ulcerado:<\/strong> espessamento mural irregular ou massa\./);
  assert.match(out, /<strong>GIST gástrico ulcerado:<\/strong> massa subepitelial predominantemente exofítica\./);
  assert.match(out, /<strong>Linfoma gástrico:<\/strong> espessamento mural volumoso relativamente homogêneo\./);
});

test('o travessão inicial ("— ") permanece literal, fora do <strong> (é só marcador de lista, não nome)', () => {
  const out = render(NOTES_BULLET);
  assert.match(out, /<div class="notes-differential-item">— <strong>Adenocarcinoma/);
});

// ===========================================================================
// 5. Cada diferencial em linha/bloco próprio.
// ===========================================================================
test('5. os três diferenciais permanecem em três blocos separados (um <div class="notes-differential-item"> cada)', () => {
  const out = render(NOTES_BULLET);
  const items = out.match(/<div class="notes-differential-item">/g) || [];
  assert.equal(items.length, 3);
});

// ===========================================================================
// 6. Texto sem formato especial continua renderizando normal.
// ===========================================================================
test('6a. notes sem "Diferenciais-chave:" continua só escapado, sem nenhuma marcação nova', () => {
  const out = render('achado isolado, sem padrão estruturado.');
  assert.doesNotMatch(out, /<strong>/);
  assert.equal(out, 'achado isolado, sem padrão estruturado.');
});

test('6b. um diferencial em formato "— " SEM ":" (fora do padrão "Nome: critério") não inventa negrito — só escapa o item, preserva o travessão', () => {
  const out = render('Diferenciais-chave:\n— só um comentário livre sem dois-pontos.');
  assert.doesNotMatch(out, /<strong>/);
  assert.match(out, /<div class="notes-differential-item">— só um comentário livre sem dois-pontos\.<\/div>/);
});

test('6c. formatos legados — "Nome (explicação)" e "Nome — explicação" (separador no meio) — continuam funcionando sem nenhuma mudança', () => {
  const legacyParen = render('Diferenciais-chave:\nMeningioma (extra-axial, realce intenso).');
  assert.match(legacyParen, /<strong>Meningioma<\/strong> \(extra-axial, realce intenso\)\./);
  const legacyDash = render('Diferenciais-chave:\nDiagnóstico A — descrição breve; Diagnóstico B — outra descrição.');
  assert.match(legacyDash, /<div class="notes-differential-item"><strong>Diagnóstico A<\/strong> — descrição breve<\/div>/);
  assert.match(legacyDash, /<div class="notes-differential-item"><strong>Diagnóstico B<\/strong> — outra descrição\.<\/div>/);
});

test('6d. notes que não começam com "Padrão:" continuam só escapadas nessa parte (nenhum rótulo inventado)', () => {
  const out = render('Achado incidental.\n\nDiferenciais-chave:\nMeningioma (extra-axial).');
  assert.doesNotMatch(out, /<strong class="notes-lead-label">/, 'sem "Padrão:" no início, nenhum rótulo é bold(e)ado');
  assert.match(out, /^Achado incidental\./);
});

// ===========================================================================
// 7. HTML malicioso dentro de notes é escapado, nunca executado.
// ===========================================================================
test('7a. HTML malicioso em "Padrão:" é escapado, nunca executado', () => {
  const out = render('Padrão: <img src=x onerror=alert(1)>\n\nDiferenciais-chave:\nA (b).');
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('7b. HTML malicioso dentro de um diferencial ("— Nome: critério") é escapado, nunca executado', () => {
  const out = render('Diferenciais-chave:\n— <script>alert(1)</script>: critério malicioso.');
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('7c. HTML malicioso no critério após ":" é escapado, nunca executado', () => {
  const out = render('Diferenciais-chave:\n— Nome: <img src=x onerror=alert(1)> critério.');
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /<strong>Nome:<\/strong> &lt;img src=x onerror=alert\(1\)&gt; critério\./);
});

// ===========================================================================
// 8. Não altera o objeto lesion nem `notes` — função pura (string) -> (string).
// ===========================================================================
test('8. notesDifferentialsHtml é pura: mesma entrada produz sempre a mesma saída, nunca referencia DATA/saveData/localStorage/Firestore', () => {
  assert.doesNotMatch(DEPS_SRC, /\bDATA\b|\bsaveData\b|\blocalStorage\b|\bFirestore\b/, 'nenhuma das funções usadas referencia estado global/persistência');
  const a = render(NOTES_BULLET);
  const b = render(NOTES_BULLET);
  assert.equal(a, b, 'idempotente — chamar de novo produz exatamente a mesma string');
});

test('8b. a lesão/objeto de entrada nunca é mutado (a função só recebe uma STRING, nunca um objeto lesion)', () => {
  const lesion = { id: 'seed_1', notes: NOTES_BULLET };
  const before = JSON.stringify(lesion);
  render(lesion.notes);
  assert.equal(JSON.stringify(lesion), before, 'objeto lesion intocado — a função nem recebe referência a ele, só a string notes');
});

// ===========================================================================
// Reuso do renderer canônico (nenhum formatador paralelo) — auditoria pedida.
// ===========================================================================
test('AUDITORIA: lesionHoverPreviewHtml ("✨ proposta", reusada também pelo preview de update_content — ver tests/structural-plan-update-content-proposal-preview.test.js) chama o MESMO notesDifferentialsHtml — nenhum parser duplicado', () => {
  const previewBody = extractFunction(html, 'lesionHoverPreviewHtml');
  assert.match(previewBody, /notesDifferentialsHtml\(e\.notes\)/);
});
