'use strict';

// Descrição da imagem no Quiz: legível, acima da imagem, SÓ pós-resposta.
// Só stdlib (padrão do projeto): extrai quizImageDescHtml + trechos de
// renderQuizCardIntegrated do index.html real e testa em vm isolado.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
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
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  throw new Error('Bloco sem fechamento');
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace);
}

function loadDesc() {
  const src = extractFunction(html, 'escAttr')
    + '\n' + extractFunction(html, 'esc')
    + '\n' + extractFunction(html, 'quizImageDescHtml');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { quizImageDescHtml };', ctx);
  return ctx.__api;
}

const cardSrc = () => extractFunction(html, 'renderQuizCardIntegrated');

test('1. descrição NÃO aparece antes da resposta', () => {
  const api = loadDesc();
  assert.equal(api.quizImageDescHtml('tubo de alimentação enrolado no esôfago superior.', false), '');
});

test('2. descrição aparece após responder', () => {
  const api = loadDesc();
  const out = api.quizImageDescHtml('tubo de alimentação enrolado no esôfago superior.', true);
  assert.match(out, /Descrição da imagem/);
  assert.match(out, /tubo de alimentação enrolado no esôfago superior\./);
  // Bloco vem com o cabeçalho discreto e fonte legível (não minúscula).
  assert.match(out, /font-size:15px/);
});

test('3. bloco acompanha o quizImgIdx (legenda da imagem atual)', () => {
  const src = cardSrc();
  // renderMedia monta o bloco a partir de cur (quizImgs[quizImgIdx]) e do
  // estado de resposta.
  assert.match(src, /quizImageDescHtml\(cur\.label, st\.answered\)/);
  const callIdx = src.indexOf('quizImageDescHtml(cur.label, st.answered)');
  const carouselIdx = src.indexOf('class="quiz-carousel');
  assert.ok(callIdx !== -1 && carouselIdx !== -1 && callIdx < carouselIdx, 'bloco antes do carrossel (acima da imagem)');
});

test('4. imagem 2 mostra a caption da imagem 2 (navegar re-renderiza)', () => {
  const src = cardSrc();
  // Setas/overlay/teclado só mudam quizImgIdx e chamam renderMedia(), que lê
  // cur.label do índice atual (cobertura das setas em quiz-images.test.js).
  assert.match(src, /const goPrev=\(\)=>\{ quizImgIdx--; renderMedia\(\); \};/);
  assert.match(src, /const goNext=\(\)=>\{ quizImgIdx\+\+; renderMedia\(\); \};/);
});

test('5. imagem sem caption não mostra bloco vazio', () => {
  const api = loadDesc();
  assert.equal(api.quizImageDescHtml('', true), '');
  assert.equal(api.quizImageDescHtml(null, true), '');
  assert.equal(api.quizImageDescHtml('   ', true), '');
});

test('6. nova questão reseta a descrição (answered começa falso)', () => {
  const src = cardSrc();
  const stateSrc = extractFunction(html, 'getQuizQuestionState');
  // Estado fresco por questão com answered:false; o bloco só existe com
  // st.answered verdadeiro (teste 1 prova o gate). Cada render lê o estado
  // da questão atual — sem vazamento da anterior.
  assert.match(stateSrc, /answered:false/);
  assert.match(src, /getQuizQuestionState\(e\.id\)/);
  assert.match(src, /host\.dataset\.answered='1'/, 'só vira respondida no clique');
});

test('7. HTML em caption é tratado com segurança', () => {
  const api = loadDesc();
  const out = api.quizImageDescHtml('<img src=x onerror=alert(1)><script>alert(2)</script>', true);
  assert.doesNotMatch(out, /<img/i);
  assert.doesNotMatch(out, /<script/i);
  assert.match(out, /&lt;img/);
});

test('8. layout não duplica captions (bloco único, legenda antiga removida do card)', () => {
  const src = cardSrc();
  assert.equal((src.match(/quiz-img-desc/g) || []).length, 0, 'classe só existe no helper, não duplicada no card');
  assert.doesNotMatch(src, /quiz-img-label/);
  // Responder revela o bloco: o handler chama renderMedia() após marcar.
  assert.match(src, /renderAnsweredFeedback\(\);\s*\n\s*renderMedia\(\);/);
});
