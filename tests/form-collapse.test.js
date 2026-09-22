'use strict';

// Expansores do formulário de lesão (UX 2026-09-21): sequências/modalidade,
// tags avançadas e localização adicional começam recolhidos; descrição da
// imagem e tags de característica ficam sempre visíveis. Só stdlib.

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

function loadLabel() {
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(extractFunction(html, 'altToggleLabel') + '\nthis.__api = { altToggleLabel };', ctx);
  return ctx.__api;
}

const formSrc = () => extractFunction(html, 'openForm');

test('1. descrição da imagem sempre visível (fora de qualquer bloco recolhido)', () => {
  const src = formSrc();
  const labelIdx = src.indexOf('img-gallery-label');
  assert.notEqual(labelIdx, -1);
  const win = src.slice(Math.max(0, labelIdx - 600), labelIdx);
  assert.doesNotMatch(win, /hidden/, 'textarea da descrição não está em bloco hidden');
});

test('2. características da imagem (tags atuais) sempre visíveis', () => {
  const src = formSrc();
  assert.match(src, /id="chip-wrap"/);
  assert.match(src, /id="f-tag-input"/);
  const chipIdx = src.indexOf('id="chip-wrap"');
  const win = src.slice(Math.max(0, chipIdx - 600), chipIdx);
  assert.doesNotMatch(win, /hidden/, 'chip-wrap não está em bloco hidden');
});

test('3. sequências/modalidade começam recolhidas', () => {
  const src = formSrc();
  assert.match(src, /img-gallery-presets-toggle/);
  assert.match(src, /aria-expanded="false"[^>]*>▸ Sequências \/ modalidade/);
  assert.match(src, /<div class="img-gallery-preset-groups" hidden>/);
});

test('4. tags avançadas começam recolhidas (sugestões por grupo)', () => {
  const src = formSrc();
  assert.match(src, /id="suggest-toggle"[^>]*>▸ Tags avançadas/);
  assert.match(src, /<div class="suggest-row" id="suggest-row" hidden>/);
});

test('5. localização adicional começa recolhida, com contador', () => {
  const src = formSrc();
  assert.match(src, /id="f-alt-toggle"[^>]*>▸ Localização adicional \(opcional\)/);
  assert.match(src, /<div id="alt-body" hidden>/);
  const api = loadLabel();
  assert.equal(api.altToggleLabel(0, false), '▸ Localização adicional (opcional)');
  assert.equal(api.altToggleLabel(2, false), '▸ Localização adicional (2)');
  assert.equal(api.altToggleLabel(2, true), '▾ Localização adicional (2)');
  assert.equal(api.altToggleLabel(0, true), '▾ Localização adicional (opcional)');
});

test('6. expandir/recolher alterna hidden + rótulo ▸/▾ (sem tocar dados)', () => {
  const src = formSrc();
  const toggles = src.match(/\.hidden = !\w+\.hidden/g) || [];
  assert.ok(toggles.length >= 3, 'três toggles flipam hidden, achados: ' + toggles.length);
  assert.match(src, /aria-expanded/);
  const paintIdx = src.indexOf('const paintPresetToggle');
  assert.notEqual(paintIdx, -1);
  const paintWin = src.slice(paintIdx, paintIdx + 700);
  assert.match(paintWin, /\.hidden/, 'toggle lê hidden');
  assert.match(paintWin, /textContent/, 'toggle pinta rótulo');
  assert.match(paintWin, /aria-expanded/, 'toggle expõe estado');
  assert.doesNotMatch(paintWin, /pendingImgs|DATA\.push|storage\.set|localStorage/, 'toggle só mexe em UI');
});

test('7. valores selecionados preservados (chips/labels/intactos)', () => {
  const src = formSrc();
  assert.match(src, /pendingImgs\[idx\]\.label = ev\.target\.value/, 'digitar descrição grava no draft');
  assert.match(src, /parts\.join\(' · '\)/, 'chips de sequência compõem o label');
  assert.match(src, /expandedPresetGroups\.has\(img\)/, 'expandido sobrevive ao re-render');
});

test('8. salvar e reabrir mantém os dados (fluxo de save intocado)', () => {
  const src = formSrc();
  assert.match(src, /id="f-save"/);
  assert.match(src, /storage\.set\(STORAGE_KEY/, 'persistência do save intacta');
  assert.match(src, /\bDATA\.push\(newEntry\)/, 'criação intacta');
});

test('9. nenhuma regressão no editor (blocos e handlers preservados)', () => {
  const src = formSrc();
  assert.match(src, /Também aparece em/, 'rótulo original preservado');
  assert.match(src, /id="alt-placements-list"/);
  assert.match(src, /id="f-alt-add"/);
  assert.match(src, /id="suggest-row"/);
  assert.match(src, /renderSuggest\(\)/);
  assert.match(src, /id="f-link-add"/);
  assert.match(src, /id="img-add-url"/);
});
