'use strict';

// Layout desktop do formulário de edição (UX 2026-09-21): modal largo com
// scroll interno, rodapé sticky, grids responsivos. Só template/CSS —
// nenhuma lógica de save/DATA foi tocada. Só stdlib.

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

const formSrc = () => extractFunction(html, 'openForm');

test('1. desktop largo (modal ~1000-1200px, responsivo)', () => {
  const src = formSrc();
  assert.match(src, /width:min\(1180px,calc\(100vw - 40px\)\)/, 'largura alvo com teto fluido');
  assert.match(src, /max-width:1180px/);
  assert.match(src, /max-height:92vh/, 'cabe na viewport');
});

test('2. janela média reorganiza (media queries do grid)', () => {
  const src = formSrc();
  assert.match(src, /@media\(max-width:900px\)\{\.lesion-form-grid-3\{grid-template-columns:1fr 1fr;\}\}/);
});

test('3. janela estreita cai para 1 coluna', () => {
  const src = formSrc();
  assert.match(src, /@media\(max-width:640px\)\{\.lesion-form-grid-3\{grid-template-columns:1fr;\}/);
});

test('4. sem scroll horizontal (overflow-x contido)', () => {
  const src = formSrc();
  assert.match(src, /overflow-x:hidden/);
  assert.match(src, /max-width:100vw|calc\(100vw/, 'nunca excede a viewport');
});

test('5. rodapé sticky sempre visível (cancelar + salvar)', () => {
  const src = formSrc();
  assert.match(src, /lesion-form-body/, 'conteúdo rola em container próprio');
  assert.match(src, /overflow-y:auto/, 'scroll interno');
  assert.match(src, /position:sticky/, 'rodapé fixo');
  assert.match(src, /bottom:0/);
  assert.match(src, /id="f-cancel"/);
  assert.match(src, /id="f-save"/);
  const bodyIdx = src.indexOf('lesion-form-body');
  const footIdx = src.indexOf('lesion-form-footer');
  assert.ok(bodyIdx !== -1 && footIdx !== -1 && bodyIdx < footIdx, 'rodapé após o conteúdo rolável');
});

test('6. salvar funciona mesmo no meio do formulário (fiação intacta)', () => {
  const src = formSrc();
  assert.match(src, /getElementById\('f-save'\)\.onclick/);
  assert.match(src, /storage\.set\(STORAGE_KEY/);
});

test('7. cancelar funciona (fiação intacta)', () => {
  const src = formSrc();
  assert.match(src, /getElementById\('f-cancel'\)\.onclick/);
  assert.match(src, /closeForm\(\)/);
});

test('8. cards de imagem não quebram (grid lado a lado)', () => {
  const src = formSrc();
  assert.match(src, /class="img-gallery" id="img-gallery"/);
  assert.match(src, /repeat\(auto-fill,minmax\(260px,1fr\)\)/, '2-3 colunas no desktop');
  assert.match(src, /img-gallery-preset-groups/);
  assert.match(src, /id="img-add-url"/);
});

test('9. expansores continuam funcionando (recolhidos recentemente)', () => {
  const src = formSrc();
  assert.match(src, /id="f-alt-toggle"/);
  assert.match(src, /id="suggest-toggle"/);
  assert.match(src, /img-gallery-presets-toggle/);
  assert.match(src, /altToggleLabel\(/);
  assert.match(src, /expandedPresetGroups/);
  assert.match(src, /renderSuggest\(\)/);
});

test('10. nenhuma regressão de save/edit (ids e fluxo preservados)', () => {
  const src = formSrc();
  for (const id of ['f-name', 'f-section', 'f-site', 'f-inc', 'f-notes', 'f-link-label', 'f-link-url', 'f-tag-input', 'f-en-term', 'f-img', 'f-classification']) {
    assert.ok(src.includes(`id="${id}"`), `campo preservado: ${id}`);
  }
  assert.match(src, /\bDATA\.push\(newEntry\)/);
  assert.match(src, /existing\.name\s*=\s*name;/);
});
