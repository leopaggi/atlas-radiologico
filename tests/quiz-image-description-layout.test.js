'use strict';

// DESCRIÇÕES EXTENSAS NÃO PODEM COMPRIMIR A IMAGEM (reviewId lrev_mulfu0x2_ocobn9).
// Bug real: no Quiz, depois de responder, o contexto clínico (093d) e a
// descrição da imagem (quizImageDescHtml, sem truncamento de propósito)
// entram ANTES do carrossel dentro de `.quiz-study-media` (flex column). A
// altura desse painel vem do grid stretch (acompanha `.quiz-study-question`,
// não o próprio conteúdo), e a imagem tinha `flex:1;min-height:0` — sem piso
// mínimo, um texto longo acima espremia a imagem (e o que estivesse queimado
// nela, como rótulo de sequência) até quase sumir. Fluxo REAL rastreado:
// renderMedia() monta `${quizClinicalContextBlockHtml}${quizImageDescHtml}
// <div class="quiz-carousel">…<img>…</div>` dentro de `#quiz-media`
// (`.quiz-study-media`), CSS real do próprio <style> do index.html.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
// 1-4. CSS REAL — a imagem ganha um piso (min-height) e o painel passa a
// rolar em vez de espremer a imagem
// ===========================================================================

test('1. .quiz-study-media img: min-height estável (nunca mais flex-shrink até 0) preservando max-height/object-fit existentes', () => {
  const rule = cssRule('.quiz-study-media img');
  assert.match(rule, /flex:1/);
  assert.match(rule, /min-height:240px/, 'piso mínimo — antes era min-height:0 (espremia até sumir)');
  assert.doesNotMatch(rule, /min-height:0/, 'o min-height:0 antigo (raiz do bug) não pode sobrar na mesma regra');
  assert.match(rule, /max-height:min\(58vh,560px\)/, 'teto existente preservado');
  assert.match(rule, /object-fit:contain/, 'proporção preservada — nunca corta a imagem');
});

test('2. .quiz-study-media .quiz-carousel: mesmo piso mínimo (o wrapper do <img> também tinha min-height:0)', () => {
  const rule = cssRule('.quiz-study-media .quiz-carousel');
  assert.match(rule, /min-height:240px/);
  assert.doesNotMatch(rule, /min-height:0/);
  assert.match(rule, /position:relative/, 'setas/overlay do carrossel continuam posicionadas por isto');
});

test('3. .quiz-study-media: painel rola (overflow-y:auto) em vez de forçar tudo a caber espremendo a imagem', () => {
  const rule = cssRule('.quiz-study-media');
  assert.match(rule, /display:flex;flex-direction:column/);
  assert.match(rule, /overflow-y:auto/);
});

test('4. responsivo (largura menor, ≤780px): min-height reduzido mas presente, max-height existente preservado', () => {
  const idx = html.indexOf('@media(max-width:780px)');
  assert.notEqual(idx, -1);
  const block = html.slice(idx, html.indexOf('@media(max-width:480px)', idx));
  assert.match(block, /\.quiz-study-shell\{grid-template-columns:1fr\}/, 'empilha em coluna única (preservado)');
  assert.match(block, /\.quiz-study-media img\{max-height:320px;min-height:180px\}/);
  assert.match(block, /\.quiz-study-media \.quiz-carousel\{min-height:180px\}/);
});

// ===========================================================================
// 5. NÃO ESCONDER/TRUNCAR A DESCRIÇÃO — a correção é só de LAYOUT; o texto
// continua inteiro (a exigência explícita é não truncar permanentemente)
// ===========================================================================

test('5. quizImageDescHtml continua sem truncamento (a correção NÃO esconde/trunca a descrição — só estabiliza a imagem)', () => {
  const src = extractFunction(html, 'quizImageDescHtml');
  assert.match(src, /Sem truncamento aqui de propósito/);
  assert.doesNotMatch(src, /\.slice\(0,\s*\d+\)/, 'sem corte por tamanho de caractere');
  assert.doesNotMatch(src, /-webkit-line-clamp/, 'sem clamp de linhas nesta função');
});

// ===========================================================================
// 6-8. NÃO QUEBRAR carrossel/navegação/lightbox — mesma fiação de antes
// ===========================================================================

test('6. renderMedia(): descrição/contexto continuam ANTES do carrossel (mesma ordem/estrutura; só o CSS do container mudou)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /media\.innerHTML=`\$\{quizClinicalContextBlockHtml\(e, cur, st\.answered\)\}\$\{quizImageDescHtml\(cur\.label, st\.answered\)\}<div class="quiz-carousel/);
});

test('7. renderMedia(): setas do carrossel e overlay de contagem continuam wireados (regressão)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /quiz-carousel-prev'\)\.onclick=goPrev;/);
  assert.match(src, /quiz-carousel-next'\)\.onclick=goNext;/);
  assert.match(src, /quiz-carousel-ov-prev'\)\.onclick=goPrev;/);
  assert.match(src, /quiz-carousel-ov-next'\)\.onclick=goNext;/);
});

test('8. renderMedia(): clique na imagem continua abrindo o lightbox com o MESMO conjunto/índice (regressão)', () => {
  const src = extractFunction(html, 'renderMedia');
  assert.match(src, /im\.onclick=\(\)=>openImageLightbox\(/);
  assert.match(src, /idx=>\{ quizImgIdx=idx; renderMedia\(\); \}/);
});

// ===========================================================================
// 9. Nenhum OUTRO local de imagem+legenda no app tem o mesmo padrão de risco
// (flex:1 + min-height:0 num elemento <img>) — confirma que este era o
// único ponto real do bug, não um sintoma parcial
// ===========================================================================

test('9. nenhum outro seletor de <img> no app combina flex:1 com min-height:0 (mesma classe de bug em outro lugar)', () => {
  const re = /\.[\w-]+(?:\s+[\w-]+)*\s*img\s*\{[^}]*\}/g;
  const offenders = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const rule = m[0];
    if (/flex:\s*1\b/.test(rule) && /min-height:\s*0\b/.test(rule)) offenders.push(rule.slice(0, 80));
  }
  assert.deepEqual(offenders, []);
});
