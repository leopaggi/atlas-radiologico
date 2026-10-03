'use strict';

// UX — realce visual do bloco "Diferenciais-chave:" dentro de `notes`: cada
// diagnóstico passa a ocupar linha própria, só o NOME (texto antes do
// primeiro "(") em negrito, explicação entre parênteses em peso normal.
// SÓ apresentação: `notes` continua exatamente a mesma string em DATA —
// nenhum HTML/Markdown é salvo, nenhum schema novo. Helper único
// (notesDifferentialsHtml) reaproveitado nos dois lugares reais que
// renderizam `notes` como HTML (detalhe da lesão e Quiz pós-resposta); o
// lightbox NUNCA mostra `notes` da lesão (só a legenda da imagem), por
// isso não está entre os pontos de aplicação. Mesmo padrão de extração de
// código-fonte real + vm das demais suítes do projeto — nenhuma
// reimplementação da lógica real.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) return source.slice(openingBrace, index + 1); }
  }
  throw new Error('Bloco sem fechamento');
}
function extractFunction(name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = html.indexOf('{', declaration.index + declaration[0].length);
  return html.slice(declaration.index, openingBrace) + extractBlock(html, openingBrace);
}

const HELPER_SRC = extractFunction('notesDifferentialsHtml');
const DETAIL_SRC = extractFunction('openDetail');
const QUIZ_CARD_SRC = extractFunction('renderQuizCardIntegrated');

function loadApi() {
  const ctx = vm.createContext({ console });
  const src = [extractFunction('escAttr'), extractFunction('esc'), extractFunction('splitDifferentialItems'), HELPER_SRC].join('\n');
  vm.runInContext(src + '\nthis.__api = { notesDifferentialsHtml, escAttr };', ctx);
  return ctx.__api;
}

/* ===================== 1. auditoria — onde `notes` é renderizado ===================== */

test('1. auditoria: os dois pontos reais que renderizam `notes` como HTML usam o helper único', () => {
  assert.match(DETAIL_SRC, /notesDifferentialsHtml\(e\.notes\)/, 'detalhe da lesão usa o helper');
  assert.match(QUIZ_CARD_SRC, /notesDifferentialsHtml\(e\.notes\)/, 'Quiz pós-resposta usa o helper');
});

test('2. auditoria: nenhum outro lugar escapa `notes` manualmente de forma divergente (sem reimplementar a lógica)', () => {
  assert.doesNotMatch(DETAIL_SRC, /\(e\.notes\|\|'sem anota[çc][aã]o/, 'o escape manual antigo (só replace de "<") foi substituído, não duplicado ao lado do helper');
});

test('3. auditoria: o lightbox não referencia `notes` da lesão (só mostra legenda de imagem) — fora de escopo, corretamente', () => {
  const lightboxSrc = extractFunction('openImageLightbox');
  assert.doesNotMatch(lightboxSrc, /\.notes\b/);
});

/* ===================== 2. comportamento do helper (função pura) ===================== */

test('4. notes SEM "Diferenciais-chave:" permanece visualmente equivalente (só escapado, nenhuma marcação nova)', () => {
  const api = loadApi();
  const notes = 'lesão óssea benigna clássica';
  assert.equal(api.notesDifferentialsHtml(notes), api.escAttr(notes));
  assert.doesNotMatch(api.notesDifferentialsHtml(notes), /<strong>|<div/);
});

test('5. "Diferenciais-chave:" recebe destaque em <strong>', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: item um (explicação um).');
  assert.match(out, /<strong>Diferenciais-chave:<\/strong>/);
});

test('6. 1 diferencial gera exatamente 1 linha (1 <div>)', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: item único (explicação).');
  const matches = out.match(/<div class="notes-differential-item">/g) || [];
  assert.equal(matches.length, 1);
});

test('7. 4 diferenciais geram exatamente 4 linhas (4 <div>), cada um com nome + explicação na MESMA linha', () => {
  const api = loadApi();
  const notes = 'Padrão: apêndice dilatado (>6-7 mm), não compressível.\n' +
    'Diferenciais-chave: diverticulite cecal ou do cólon direito (processo inflamatório centrado em divertículo); ' +
    'apendagite epiploica (lesão ovalada de gordura); ileíte terminal (espessamento mural do íleo); ' +
    'adenite mesentérica (linfonodomegalias mesentéricas).';
  const out = api.notesDifferentialsHtml(notes);
  const items = out.match(/<div class="notes-differential-item">.*?<\/div>/g) || [];
  assert.equal(items.length, 4);
  assert.match(items[0], /<strong>diverticulite cecal ou do cólon direito<\/strong> \(processo inflamatório centrado em divertículo\)/);
  assert.match(items[1], /<strong>apendagite epiploica<\/strong> \(lesão ovalada de gordura\)/);
  assert.match(items[2], /<strong>ileíte terminal<\/strong> \(espessamento mural do íleo\)/);
  assert.match(items[3], /<strong>adenite mesentérica<\/strong> \(linfonodomegalias mesentéricas\)\./);
});

test('8. somente o NOME (texto antes do primeiro "(") recebe <strong> — a explicação entre parênteses fica em peso normal', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: Meningioma (extra-axial, realce intenso).');
  assert.match(out, /<strong>Meningioma<\/strong> \(extra-axial, realce intenso\)\./);
  assert.doesNotMatch(out, /<strong>Meningioma \(extra-axial/);
});

test('9. a explicação entre parênteses nunca é envolvida em <strong>', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: Item (parte A, parte B, parte C).');
  const itemDiv = /<div class="notes-differential-item">(.*?)<\/div>/.exec(out)[1];
  const strongContent = /<strong>([^<]*)<\/strong>/.exec(itemDiv)[1];
  assert.equal(strongContent, 'Item');
  assert.doesNotMatch(out, /<strong>[^<]*parte A/);
});

test('10. itens separados por ";" são corretamente separados (SOMENTE dentro da seção Diferenciais-chave), e um ";" DENTRO da explicação não quebra o item', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: A (a1; a2); B (b1); C (c1).');
  const items = out.match(/<div class="notes-differential-item">.*?<\/div>/g) || [];
  assert.equal(items.length, 3, 'A, B e C são 3 itens — o ";" dentro de "(a1; a2)" fica DENTRO do item A, não cria um 4º item');
  assert.match(items[0], /<strong>A<\/strong> \(a1; a2\)/, 'o ";" interno sobrevive intacto dentro da explicação de A');
  assert.match(items[1], /<strong>B<\/strong> \(b1\)/);
  assert.match(items[2], /<strong>C<\/strong> \(c1\)\./);
});

test('11. acentos funcionam (nome e explicação preservados)', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: Torção de apêndice epiploico (anel hiperdenso periférico).');
  assert.match(out, /<strong>Torção de apêndice epiploico<\/strong> \(anel hiperdenso periférico\)\./);
});

test('12. hífen funciona', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: Walled-off necrosis (conteúdo heterogêneo).');
  assert.match(out, /<strong>Walled-off necrosis<\/strong> \(conteúdo heterogêneo\)\./);
});

test('13. slash/barra funciona', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: Cistoadenoma seroso/mucinoso (sem antecedente agudo).');
  assert.match(out, /<strong>Cistoadenoma seroso\/mucinoso<\/strong> \(sem antecedente agudo\)\./);
});

test('14. nomes com siglas funcionam', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: IPMN (comunicação ductal).');
  assert.match(out, /<strong>IPMN<\/strong> \(comunicação ductal\)\./);
});

test('15. "Padrão:" + "Diferenciais-chave:" juntos — Padrão continua exatamente como antes (só escapado), Diferenciais-chave recebe o novo realce', () => {
  const api = loadApi();
  const notes = 'Padrão: achado <típico> em exame.\nDiferenciais-chave: X (y).';
  const out = api.notesDifferentialsHtml(notes);
  assert.match(out, /^Padrão: achado &lt;típico&gt; em exame\.\n<strong>Diferenciais-chave:<\/strong>/);
  assert.match(out, /<strong>X<\/strong> \(y\)\./);
});

test('16. HTML malicioso é escapado, nunca executado (XSS)', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: <img src=x onerror=alert(1)> (teste);');
  assert.doesNotMatch(out, /<img/i, 'a tag <img> nunca aparece crua');
  assert.ok(out.includes('&lt;img'), 'o conteúdo aparece escapado como texto');
  assert.doesNotMatch(out, /onerror=alert\(1\)>/, 'o atributo malicioso nunca sobra fora de uma escapagem textual');
});

test('17. item sem "(" nenhum -> sai como texto simples, sem <strong> (não quebra notes fora do padrão)', () => {
  const api = loadApi();
  const out = api.notesDifferentialsHtml('Diferenciais-chave: um item sem explicação entre parênteses.');
  assert.doesNotMatch(out, /<strong>(?!Diferenciais-chave)/);
  assert.match(out, /<div class="notes-differential-item">um item sem explicação entre parênteses\.<\/div>/);
});

test('18. notes vazia/sem o marcador nunca lança e devolve só o texto escapado', () => {
  const api = loadApi();
  assert.equal(api.notesDifferentialsHtml(''), '');
  assert.equal(api.notesDifferentialsHtml(null), '');
  assert.equal(api.notesDifferentialsHtml(undefined), '');
});

/* ===================== 3. segurança / integridade de dados ===================== */

test('19. notesDifferentialsHtml é função pura: nunca referencia DATA/saveData/localStorage/Firestore', () => {
  assert.ok(!/\bDATA\b|saveData\s*\(|localStorage\.(setItem|removeItem)|firebase\.firestore|fbDb\./.test(HELPER_SRC));
});

test('20. notesDifferentialsHtml nunca retorna Markdown nem grava HTML — é só uma função de leitura (string) -> (string)', () => {
  assert.doesNotMatch(HELPER_SRC, /\*\*|##\s/, 'não introduz sintaxe Markdown');
  assert.doesNotMatch(HELPER_SRC, /\.notes\s*=/, 'nunca escreve de volta em notes');
});
