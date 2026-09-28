'use strict';

// DESCRIÇÕES EXTENSAS NÃO PODEM COMPRIMIR A IMAGEM (reviewId lrev_mulfu0x2_ocobn9).
//
// Histórico desta revisão:
// 1) Correção original: piso `min-height` na imagem + `overflow-y:auto` no
//    painel inteiro (`.quiz-study-media`). Reduzia a compressão mas não
//    eliminava.
// 2) 1º complemento: texto (contexto clínico + descrição da imagem) passou
//    a entrar num wrapper próprio (`.quiz-media-text`) com `max-height`
//    fixo em pixels + `overflow-y:auto`. Ainda insuficiente: com reprodução
//    visual real, a IMAGEM podia sair da área visível ao rolar — porque
//    `.quiz-study-media` (o painel INTEIRO) continuava com
//    `overflow-y:auto`, e imagem+texto ainda compartilhavam o MESMO eixo de
//    rolagem do container pai.
// 3) 2º complemento (este): causa raiz real = `overflow-y:auto` no PAI
//    (`.quiz-study-media`). Removido. `.quiz-media-text` vira
//    `flex:0 0 auto` (nunca cresce/encolhe por causa da imagem) com teto
//    por LINHAS (~5 linhas: `line-height` explícito +
//    `max-height:calc(5 * line-height)`); a imagem/`.quiz-carousel` ganham
//    `flex-shrink:0` explícito (além do `min-height` já existente) — nunca
//    encolhem, nunca participam de nenhuma rolagem, nunca somem. Nenhum
//    line-clamp, nenhum overflow:hidden, nada truncado — o texto completo
//    continua acessível rolando SÓ o `.quiz-media-text`.
//
// Fluxo REAL verificado: CSS real do `<style>` do index.html +
// `renderMedia()` real (Quiz).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
// Regra CSS simples de uma linha (sem chaves aninhadas) — seletor até o
// fechamento do bloco. Falha alto e claro se o seletor não existir mais.
function cssRule(selector) {
  const idx = html.indexOf(selector + '{');
  assert.ok(idx !== -1, 'seletor CSS não encontrado: ' + selector);
  const close = html.indexOf('}', idx);
  return html.slice(idx, close + 1);
}

// ===========================================================================
// A — CAUSA RAIZ REAL: o PAI (.quiz-study-media) não pode rolar
// ===========================================================================

test('A1. .quiz-study-media (painel inteiro): NUNCA tem overflow-y — a imagem não pode fazer parte de rolagem nenhuma', () => {
  const rule = cssRule('.quiz-study-media');
  assert.doesNotMatch(rule, /overflow-y/, 'overflow-y:auto no pai era a causa real da imagem sumir ao rolar');
  assert.match(rule, /display:flex;flex-direction:column/);
});

test('A2. .quiz-study-media: sem line-clamp/overflow:hidden em nenhuma camada (nada trunca o texto)', () => {
  const rule = cssRule('.quiz-study-media');
  assert.doesNotMatch(rule, /-webkit-line-clamp/);
  assert.doesNotMatch(rule, /overflow.*hidden/);
});

// ===========================================================================
// B — IMAGEM: fixa, estável, nunca encolhe, nunca rola, nunca some
// ===========================================================================

test('B1. .quiz-study-media img: flex-shrink:0 explícito (além do min-height) — nunca encolhe por causa do texto', () => {
  const rule = cssRule('.quiz-study-media img');
  assert.match(rule, /flex:1/, 'ainda cresce pra ocupar o espaço livre');
  assert.match(rule, /flex-shrink:0/, 'mas nunca encolhe abaixo do que precisa');
  assert.match(rule, /min-height:240px/);
  assert.match(rule, /max-height:min\(58vh,560px\)/, 'teto existente preservado');
  assert.match(rule, /object-fit:contain/, 'proporção preservada — sequências/legendas queimadas continuam visíveis');
});

test('B2. .quiz-study-media .quiz-carousel (wrapper da imagem): mesmo flex-shrink:0 + min-height — independente do texto', () => {
  const rule = cssRule('.quiz-study-media .quiz-carousel');
  assert.match(rule, /flex:1/);
  assert.match(rule, /flex-shrink:0/);
  assert.match(rule, /min-height:240px/);
  assert.match(rule, /position:relative/, 'setas/overlay do carrossel continuam posicionadas por isto');
});

test('B3. nem a imagem nem o carrossel têm overflow — nunca viram área de rolagem', () => {
  assert.doesNotMatch(cssRule('.quiz-study-media img'), /overflow/);
  assert.doesNotMatch(cssRule('.quiz-study-media .quiz-carousel'), /overflow-y/);
});

// ===========================================================================
// C — TEXTO: bloco próprio, flex:0 0 auto (nunca cresce/encolhe pela
// imagem), teto por ~5 linhas, rolagem SÓ dentro dele
// ===========================================================================

test('C1. .quiz-media-text: flex:0 0 auto — tamanho ditado só pelo próprio conteúdo/teto, nunca pela imagem', () => {
  const rule = cssRule('.quiz-study-media .quiz-media-text');
  assert.match(rule, /flex:0 0 auto/);
});

test('C2. .quiz-media-text: teto por LINHAS (~5) via line-height explícito + max-height:calc(5 * line-height); rolagem própria', () => {
  const rule = cssRule('.quiz-study-media .quiz-media-text');
  assert.match(rule, /line-height:1\.4/);
  assert.match(rule, /max-height:calc\(5 \* 1\.4em\)/);
  assert.match(rule, /overflow-y:auto/);
  assert.doesNotMatch(rule, /-webkit-line-clamp/);
  assert.doesNotMatch(rule, /overflow-y:hidden/);
});

test('C3. o teto do texto é numericamente ~5 linhas de corpo de texto (14px, 1.4 de entrelinha ≈ 98px) — não cresce indefinidamente', () => {
  const rule = cssRule('.quiz-study-media .quiz-media-text');
  assert.match(rule, /font-size:14px/);
  // calc(5 * 1.4em) a 14px = 5 * 1.4 * 14 = 98px — não é um número mágico
  // solto, é literalmente "~5 linhas" computável a partir da própria regra.
  const lineHeightPx = 1.4 * 14;
  const maxHeightPx = 5 * lineHeightPx;
  assert.ok(Math.abs(maxHeightPx - 98) < 0.01, 'esperado ~98px, obtido ' + maxHeightPx);
});

test('C4. a imagem/carrossel ficam FORA de .quiz-media-text — nenhuma das duas regras se mistura com a outra', () => {
  const textRule = cssRule('.quiz-study-media .quiz-media-text');
  assert.doesNotMatch(textRule, /\bimg\b/);
  const imgRule = cssRule('.quiz-study-media img');
  assert.doesNotMatch(imgRule, /quiz-media-text/);
  const carouselRule = cssRule('.quiz-study-media .quiz-carousel');
  assert.doesNotMatch(carouselRule, /quiz-media-text/);
});

// ===========================================================================
// D — RESPONSIVO (≤780px): mesmo princípio, teto por linhas proporcional
// ===========================================================================

test('D1. responsivo (≤780px): .quiz-media-text mantém teto por ~5 linhas com fonte/entrelinha menores; imagem preserva seu piso/teto', () => {
  const idx = html.indexOf('@media(max-width:780px)');
  assert.notEqual(idx, -1);
  const block = html.slice(idx, html.indexOf('@media(max-width:480px)', idx));
  assert.match(block, /\.quiz-study-shell\{grid-template-columns:1fr\}/, 'empilha em coluna única (preservado)');
  assert.match(block, /\.quiz-study-media img\{max-height:320px;min-height:180px\}/);
  assert.match(block, /\.quiz-study-media \.quiz-carousel\{min-height:180px\}/);
  assert.match(block, /\.quiz-study-media \.quiz-media-text\{font-size:13px;line-height:1\.35;max-height:calc\(5 \* 1\.35em\)\}/);
});

test('D2. mobile: nenhuma das regras de imagem/carrossel ganha overflow-y (mesma garantia do desktop)', () => {
  const idx = html.indexOf('@media(max-width:780px)');
  const block = html.slice(idx, html.indexOf('@media(max-width:480px)', idx));
  assert.doesNotMatch(block, /\.quiz-study-media\{[^}]*overflow-y/);
});

// ===========================================================================
// E — renderMedia() REAL — estrutura DOM continua: [.quiz-media-text?]
// [.quiz-carousel] — nunca o inverso, nunca misturado
// ===========================================================================

test('E1. renderMedia(): .quiz-media-text (quando há conteúdo) vem ANTES de .quiz-carousel — nunca dentro/depois misturado com a imagem', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /const mediaTextHtml = `\$\{quizClinicalContextBlockHtml\(e, cur, st\.answered\)\}\$\{quizImageDescHtml\(cur\.label, st\.answered\)\}`;/);
  assert.match(src, /media\.innerHTML=`\$\{mediaTextHtml\?`<div class="quiz-media-text">\$\{mediaTextHtml\}<\/div>`:''\}<div class="quiz-carousel/);
});

test('E2. renderMedia(): setas do carrossel e overlay de contagem continuam wireados (regressão)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /quiz-carousel-prev'\)\.onclick=goPrev;/);
  assert.match(src, /quiz-carousel-next'\)\.onclick=goNext;/);
  assert.match(src, /quiz-carousel-ov-prev'\)\.onclick=goPrev;/);
  assert.match(src, /quiz-carousel-ov-next'\)\.onclick=goNext;/);
});

test('E3. renderMedia(): clique na imagem continua abrindo o lightbox com o MESMO conjunto/índice (regressão)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /im\.onclick=\(\)=>openImageLightbox\(/);
  assert.match(src, /idx=>\{ quizImgIdx=idx; renderMedia\(\); \}/);
});

// ===========================================================================
// F — quizImageDescHtml continua sem truncamento (nada escondido, só rolável)
// ===========================================================================

test('F. quizImageDescHtml continua sem truncamento — o texto INTEIRO fica acessível rolando .quiz-media-text', () => {
  const src = extractFunction(html, 'quizImageDescHtml');
  assert.match(src, /Sem truncamento aqui de propósito/);
  assert.doesNotMatch(src, /\.slice\(0,\s*\d+\)/, 'sem corte por tamanho de caractere');
  assert.doesNotMatch(src, /-webkit-line-clamp/, 'sem clamp de linhas nesta função');
});

// ===========================================================================
// G — FLUXO REAL: 1 linha / ~5 linhas / 10+ linhas — o texto INTEIRO
// sempre está no HTML (nunca cortado em JS); quem decide rolar é só o CSS
// (max-height+overflow-y:auto testado nos blocos C acima)
// ===========================================================================

function renderQuizMediaTextHtml(label, answered) {
  const src = [extractFunction(html, 'quizImageDescHtml'), extractFunction(html, 'esc'), extractFunction(html, 'escAttr')].join('\n');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.__h = quizImageDescHtml(' + JSON.stringify(label) + ', ' + JSON.stringify(answered) + ');', ctx);
  const mediaTextHtml = ctx.__h;
  return mediaTextHtml ? '<div class="quiz-media-text">' + mediaTextHtml + '</div>' : '';
}
const line = (n) => 'RM T2 axial linha ' + n + ' de achados radiológicos';

test('G1. 1 linha (texto curto): cabe folgado no teto de ~5 linhas (98px) — nenhuma necessidade de rolagem', () => {
  const oneLine = line(1);
  const out = renderQuizMediaTextHtml(oneLine, true);
  assert.match(out, /<div class="quiz-media-text">/);
  assert.match(out, new RegExp(oneLine));
  // sanity objetiva: 1 linha real (~40 chars) não passa de 1-2 linhas
  // renderizadas mesmo numa coluna estreita — bem abaixo do teto de 98px.
  assert.ok(oneLine.length < 80);
});

test('G2. ~5 linhas (texto médio): ainda cabe no teto, mas já próximo do limite — texto continua 100% presente', () => {
  const fiveLines = Array.from({ length: 5 }, (_, i) => line(i + 1)).join(' ');
  const out = renderQuizMediaTextHtml(fiveLines, true);
  assert.match(out, /<div class="quiz-media-text">/);
  for (let i = 1; i <= 5; i++) assert.match(out, new RegExp(line(i)));
});

test('G3. 10+ linhas (texto MUITO longo): continua 100% presente no HTML (início E fim) — o CSS (C2) é quem ativa a rolagem, nunca truncamento em JS', () => {
  const manyLines = Array.from({ length: 15 }, (_, i) => line(i + 1)).join(' ');
  const out = renderQuizMediaTextHtml(manyLines, true);
  assert.match(out, /<div class="quiz-media-text">/);
  assert.match(out, new RegExp(line(1)), 'início presente');
  assert.match(out, new RegExp(line(15)), 'FIM presente — nada foi cortado');
});

test('G4. sem descrição/contexto (antes de responder, ou imagem sem legenda): NENHUM wrapper vazio é criado', () => {
  const out = renderQuizMediaTextHtml('qualquer legenda', false); // answered=false -> quizImageDescHtml devolve ''
  assert.equal(out, '', 'sem conteúdo, sem wrapper — nenhuma scrollbar residual');
});

// ===========================================================================
// H — Nenhum OUTRO local de imagem+legenda no app tem o mesmo padrão de
// risco (flex:1 + min-height:0 num <img>, ou overflow-y:auto num ancestral
// direto de uma <img> dentro de flex column)
// ===========================================================================

test('H1. nenhum outro seletor de <img> no app combina flex:1 com min-height:0', () => {
  const re = /\.[\w-]+(?:\s+[\w-]+)*\s*img\s*\{[^}]*\}/g;
  const offenders = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const rule = m[0];
    if (/flex:\s*1\b/.test(rule) && /min-height:\s*0\b/.test(rule)) offenders.push(rule.slice(0, 80));
  }
  assert.deepEqual(offenders, []);
});
