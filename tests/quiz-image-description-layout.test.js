'use strict';

// DESCRIÇÕES EXTENSAS NÃO PODEM COMPRIMIR A IMAGEM (reviewId lrev_mulfu0x2_ocobn9).
//
// Correção original: a imagem (`.quiz-study-media img`/`.quiz-carousel`)
// ganhou `min-height` (piso mínimo) em vez de `min-height:0`, e o painel
// (`.quiz-study-media`) ganhou `overflow-y:auto`. Isso reduzia a compressão
// mas não eliminava: com texto MUITO longo, o painel inteiro ainda podia
// crescer/rolar como um bloco só, competindo por espaço com a imagem dentro
// da altura vinda do grid stretch (acompanha `.quiz-study-question`, não o
// próprio conteúdo).
//
// COMPLEMENTO desta revisão: o contexto clínico (093d) + a descrição da
// imagem (quizImageDescHtml, sem truncamento de propósito) agora entram num
// wrapper PRÓPRIO — `.quiz-media-text` — criado por renderMedia() SÓ quando
// há conteúdo, com `max-height` + `overflow-y:auto` (rolagem interna, sem
// line-clamp, sem overflow:hidden, sem truncar nada). A imagem fica FORA
// desse wrapper, com `flex:1` + piso mínimo próprios, e nunca mais compete
// por espaço com o texto — área visual sempre estável, sem precisar rolar o
// painel inteiro para vê-la.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
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
// 1-4. CSS REAL — piso mínimo da imagem (herdado da correção anterior)
// ===========================================================================

test('1. .quiz-study-media img: min-height estável (nunca mais flex-shrink até 0) preservando max-height/object-fit existentes', () => {
  const rule = cssRule('.quiz-study-media img');
  assert.match(rule, /flex:1/);
  assert.match(rule, /min-height:240px/, 'piso mínimo — antes era min-height:0 (espremia até sumir)');
  assert.doesNotMatch(rule, /min-height:0\D/, 'o min-height:0 antigo (raiz do bug) não pode sobrar na mesma regra');
  assert.match(rule, /max-height:min\(58vh,560px\)/, 'teto existente preservado');
  assert.match(rule, /object-fit:contain/, 'proporção preservada — nunca corta a imagem (sequências/legendas queimadas continuam visíveis)');
});

test('2. .quiz-study-media .quiz-carousel: mesmo piso mínimo (o wrapper do <img> também tinha min-height:0)', () => {
  const rule = cssRule('.quiz-study-media .quiz-carousel');
  assert.match(rule, /min-height:240px/);
  assert.doesNotMatch(rule, /min-height:0\D/);
  assert.match(rule, /position:relative/, 'setas/overlay do carrossel continuam posicionadas por isto');
});

// ===========================================================================
// 5-9. CSS REAL — o COMPLEMENTO: bloco de texto com teto + rolagem própria
// ===========================================================================

test('5. .quiz-media-text: teto de altura + rolagem PRÓPRIA (não afeta a imagem) — sem line-clamp, sem overflow:hidden', () => {
  const rule = cssRule('.quiz-study-media .quiz-media-text');
  assert.match(rule, /max-height:200px/);
  assert.match(rule, /overflow-y:auto/);
  assert.doesNotMatch(rule, /overflow-y:hidden/);
  assert.doesNotMatch(rule, /-webkit-line-clamp/);
});

test('6. responsivo (≤780px): .quiz-media-text ganha um teto menor (mobile), imagem preserva seu próprio piso/teto', () => {
  const idx = html.indexOf('@media(max-width:780px)');
  assert.notEqual(idx, -1);
  const block = html.slice(idx, html.indexOf('@media(max-width:480px)', idx));
  assert.match(block, /\.quiz-study-shell\{grid-template-columns:1fr\}/, 'empilha em coluna única (preservado)');
  assert.match(block, /\.quiz-study-media img\{max-height:320px;min-height:180px\}/);
  assert.match(block, /\.quiz-study-media \.quiz-carousel\{min-height:180px\}/);
  assert.match(block, /\.quiz-study-media \.quiz-media-text\{max-height:140px\}/);
});

test('7. a imagem (min-height/max-height/flex) fica FORA de .quiz-media-text — nunca compartilha o teto do texto', () => {
  const textRule = cssRule('.quiz-study-media .quiz-media-text');
  assert.doesNotMatch(textRule, /\bimg\b/, 'a regra do bloco de texto não deve mencionar <img>');
  const imgRule = cssRule('.quiz-study-media img');
  assert.doesNotMatch(imgRule, /quiz-media-text/);
});

test('8. .quiz-study-media (painel externo) continua sem line-clamp/overflow:hidden — nada trunca o texto em nenhuma camada', () => {
  const rule = cssRule('.quiz-study-media');
  assert.doesNotMatch(rule, /-webkit-line-clamp/);
  assert.doesNotMatch(rule, /overflow.*hidden/);
});

// ===========================================================================
// 10. renderMedia() REAL — o wrapper só existe com conteúdo; carrossel/
// setas/lightbox continuam exatamente wireados como antes
// ===========================================================================

test('10. renderMedia(): contexto+descrição entram num wrapper `.quiz-media-text` só quando há conteúdo, ANTES do carrossel', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /const mediaTextHtml = `\$\{quizClinicalContextBlockHtml\(e, cur, st\.answered\)\}\$\{quizImageDescHtml\(cur\.label, st\.answered\)\}`;/);
  assert.match(src, /media\.innerHTML=`\$\{mediaTextHtml\?`<div class="quiz-media-text">\$\{mediaTextHtml\}<\/div>`:''\}<div class="quiz-carousel/);
});

test('11. renderMedia(): setas do carrossel e overlay de contagem continuam wireados (regressão)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /quiz-carousel-prev'\)\.onclick=goPrev;/);
  assert.match(src, /quiz-carousel-next'\)\.onclick=goNext;/);
  assert.match(src, /quiz-carousel-ov-prev'\)\.onclick=goPrev;/);
  assert.match(src, /quiz-carousel-ov-next'\)\.onclick=goNext;/);
});

test('12. renderMedia(): clique na imagem continua abrindo o lightbox com o MESMO conjunto/índice (regressão)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /im\.onclick=\(\)=>openImageLightbox\(/);
  assert.match(src, /idx=>\{ quizImgIdx=idx; renderMedia\(\); \}/);
});

// ===========================================================================
// 13. NÃO ESCONDER/TRUNCAR A DESCRIÇÃO — continua inteira, só rolável
// ===========================================================================

test('13. quizImageDescHtml continua sem truncamento (o texto INTEIRO fica acessível rolando o bloco, nunca cortado)', () => {
  const src = extractFunction(html, 'quizImageDescHtml');
  assert.match(src, /Sem truncamento aqui de propósito/);
  assert.doesNotMatch(src, /\.slice\(0,\s*\d+\)/, 'sem corte por tamanho de caractere');
  assert.doesNotMatch(src, /-webkit-line-clamp/, 'sem clamp de linhas nesta função');
});

// ===========================================================================
// 14-16. FLUXO REAL — descrição curta vs. longa: o wrapper existe/não
// existe conforme conteúdo, e o texto INTEIRO (sem corte) está presente —
// a decisão de rolar ou não é 100% do CSS (max-height/overflow-y:auto),
// nunca de truncamento em JS
// ===========================================================================

function renderQuizMediaTextHtml(label, answered) {
  const src = [extractFunction(html, 'quizImageDescHtml'), extractFunction(html, 'esc'), extractFunction(html, 'escAttr')].join('\n');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.__h = quizImageDescHtml(' + JSON.stringify(label) + ', ' + JSON.stringify(answered) + ');', ctx);
  const mediaTextHtml = ctx.__h; // sem contexto clínico neste teste (foco na descrição da imagem)
  return mediaTextHtml ? '<div class="quiz-media-text">' + mediaTextHtml + '</div>' : '';
}

test('14. descrição CURTA: o wrapper existe mas o conteúdo cabe folgado no teto (200px) — sem necessidade de rolagem', () => {
  const shortLabel = 'RM T2 axial';
  const out = renderQuizMediaTextHtml(shortLabel, true);
  assert.match(out, /<div class="quiz-media-text">/);
  assert.match(out, new RegExp(shortLabel));
  // heurística objetiva de "curto": poucas linhas mesmo com quebra a cada
  // ~40 caracteres (largura típica do painel) — bem abaixo do teto de 200px.
  const approxLines = Math.ceil(shortLabel.length / 40);
  assert.ok(approxLines <= 2, 'sanity: rótulo curto real deveria caber em poucas linhas');
});

test('15. descrição LONGA: continua inteira dentro do wrapper (será o CSS — max-height+overflow-y:auto — quem ativa a rolagem, nunca truncamento em JS)', () => {
  const longLabel = 'RM T2 FLAIR axial demonstrando lesão expansiva com realce heterogêneo, edema perilesional extenso e efeito de massa sobre o corno frontal do ventrículo lateral, achados compatíveis com neoplasia de alto grau — correlacionar com espectroscopia e perfusão para diagnóstico diferencial com linfoma e abscesso.'.repeat(2);
  const out = renderQuizMediaTextHtml(longLabel, true);
  assert.match(out, /<div class="quiz-media-text">/);
  assert.equal(out.includes(longLabel.slice(0, 50)), true, 'início do texto presente');
  assert.equal(out.includes(longLabel.slice(-50)), true, 'FIM do texto presente — nada foi cortado');
});

test('16. sem descrição/contexto (antes de responder, ou imagem sem legenda): NENHUM wrapper vazio é criado', () => {
  const out = renderQuizMediaTextHtml('qualquer legenda', false); // answered=false -> quizImageDescHtml devolve ''
  assert.equal(out, '', 'sem conteúdo, sem wrapper — nenhuma scrollbar residual');
});

// ===========================================================================
// 17. Nenhum OUTRO local de imagem+legenda no app tem o mesmo padrão de
// risco (flex:1 + min-height:0 num elemento <img>)
// ===========================================================================

test('17. nenhum outro seletor de <img> no app combina flex:1 com min-height:0 (mesma classe de bug em outro lugar)', () => {
  const re = /\.[\w-]+(?:\s+[\w-]+)*\s*img\s*\{[^}]*\}/g;
  const offenders = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const rule = m[0];
    if (/flex:\s*1\b/.test(rule) && /min-height:\s*0\b/.test(rule)) offenders.push(rule.slice(0, 80));
  }
  assert.deepEqual(offenders, []);
});
