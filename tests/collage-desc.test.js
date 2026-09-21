'use strict';

// Descrição geral do quadro de imagens (metadado `label`, nunca no canvas).
// Só stdlib (padrão do projeto): extrai do index.html real, roda em vm.

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

function loadCollage() {
  const src = extractFunction(html, 'escAttr')
    + '\n' + extractFunction(html, 'esc')
    + '\n' + extractFunction(html, 'isValidAssignedAt')
    + '\n' + extractFunction(html, 'resolveCollageLabel')
    + '\n' + extractFunction(html, 'collageInitialDesc')
    + '\n' + extractFunction(html, 'quizImageDescHtml')
    + '\n' + extractFunction(html, 'stableImageKeyV208')
    + '\n' + extractFunction(html, 'stampNewImagesAssignedAt');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { resolveCollageLabel, collageInitialDesc, quizImageDescHtml, stampNewImagesAssignedAt };', ctx);
  return ctx.__api;
}

const builderSrc = () => extractFunction(html, 'openCollageBuilder');

test('1. campo de descrição geral existe no builder', () => {
  const src = builderSrc();
  assert.match(src, /id="collage-desc"/);
  assert.match(src, /Descrição geral do quadro/);
  assert.match(src, /<textarea[^>]*id="collage-desc"/);
});

test('2. campo é opcional (vazio cai no join das sequências)', () => {
  const api = loadCollage();
  assert.equal(api.resolveCollageLabel('', ['TC C-', 'TC C+']), 'TC C- · TC C+');
  assert.equal(api.resolveCollageLabel('   ', []), 'Quadro multimodal');
});

test('3. gerar quadro não perde a descrição', () => {
  const api = loadCollage();
  assert.equal(api.resolveCollageLabel('TC do joelho demonstrando edema.', ['TC C-', 'TC C+']), 'TC do joelho demonstrando edema.');
  // Pré-preenchimento na reedição preserva descrição customizada...
  assert.equal(api.collageInitialDesc('TC do joelho demonstrando edema.', ['TC C-', 'TC C+']), 'TC do joelho demonstrando edema.');
  // ...mas não força texto quando o rótulo era só o join automático.
  assert.equal(api.collageInitialDesc('TC C- · TC C+', ['TC C-', 'TC C+']), '');
  assert.equal(api.collageInitialDesc('', ['TC C-']), '');
});

test('4. inserir quadro transfere descrição para o objeto pending', () => {
  const src = builderSrc();
  assert.match(src, /resolveCollageLabel\(cov\.querySelector\('#collage-desc'\)\.value, items\.map\(x=>x\.seq\)\)/);
  assert.match(src, /onCollageReady\(\{label, panels, data:objectUrl, source:'pending'/, 'pending leva label+panels');
});

test('5. cancelar não persiste descrição', () => {
  const src = builderSrc();
  const cancelIdx = src.indexOf("cov.querySelector('#collage-cancel').onclick");
  assert.notEqual(cancelIdx, -1);
  const win = src.slice(cancelIdx, cancelIdx + 120);
  assert.match(win, /cleanup/);
  assert.doesNotMatch(win, /onCollageReady|resolveCollageLabel/);
});

test('6. descrição usa o campo canônico de imagem existente', () => {
  const src = builderSrc();
  assert.doesNotMatch(src, /collageDescription|boardDescription|quadroDescricao/i, 'sem campo novo inventado');
  assert.match(src, /const label=resolveCollageLabel\(/, 'usa `label`, o campo da legenda');
});

test('7. descrição pode ser editada depois (mecanismo existente)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /pendingImgs\[idx\]\.label\s*=/, 'input da galeria edita label do pending');
});

test('8. Quiz não mostra antes de responder', () => {
  const api = loadCollage();
  assert.equal(api.quizImageDescHtml('TC do joelho demonstrando edema.', false), '');
});

test('9. Quiz mostra depois de responder', () => {
  const api = loadCollage();
  const out = api.quizImageDescHtml('TC do joelho demonstrando edema.', true);
  assert.match(out, /Descrição da imagem/);
  assert.match(out, /TC do joelho demonstrando edema\./);
});

test('10. quadro sem descrição não cria bloco vazio', () => {
  const api = loadCollage();
  // Quadro com label automático de sequências continua exibindo (é legenda
  // real); só o vazio some.
  assert.equal(api.quizImageDescHtml('', true), '');
  assert.ok(api.quizImageDescHtml('TC C- · TC C+', true).length > 0);
});

test('11. descrição com HTML permanece texto inerte', () => {
  const api = loadCollage();
  const out = api.quizImageDescHtml('<img src=x onerror=alert(1)>', true);
  assert.doesNotMatch(out, /<img/i);
  assert.match(out, /&lt;img/);
  const src = builderSrc();
  assert.match(src, /querySelector\('#collage-desc'\)\.value/, 'lê via .value, nunca via HTML');
});

test('12. quadro salvo recebe somente 1 assignedAt', () => {
  const api = loadCollage();
  const next = [{ data: 'blob:quadro', label: 'TC do joelho', panels: [] }];
  assert.equal(api.stampNewImagesAssignedAt([], next, '2026-09-21T14:30:00.000Z'), 1);
  assert.equal(next[0].assignedAt, '2026-09-21T14:30:00.000Z');
});

test('13. imagens-fonte temporárias não contam como produtividade extra', () => {
  const src = builderSrc();
  // Itens-fonte nunca entram em pendingImgs/DATA: só o objeto final vai a
  // onCollageReady (1 chamada no fluxo de inserção).
  assert.equal((src.match(/onCollageReady\(/g) || []).length, 2, 'defer + imediato, um objeto cada');
  assert.doesNotMatch(src, /pendingImgs\.push/, 'builder não empurra painéis');
});

test('14. Cloudinary continua seguindo o fluxo atual', () => {
  const src = builderSrc();
  assert.match(src, /source:'pending'/, 'diferido continua pending');
  assert.match(src, /uploadToCloudinary\(file,lesionMeta\)/, 'envio só no fluxo imediato/Salvar');
  assert.match(src, /canvas\.toBlob/, 'composição visual intocada');
});

test('15. carrossel/lightbox continuam funcionando', () => {
  const src = builderSrc();
  assert.match(src, /id="collage-preview"/, 'prévia preservada');
  assert.match(src, /id="collage-generate"/);
  assert.match(src, /id="collage-insert"/);
  assert.match(src, /id="collage-cancel"/);
  // Canvas só recebe sequências individuais (fillText de seq), nunca a descrição.
  const genIdx = src.indexOf('async function generateCollage');
  assert.notEqual(genIdx, -1);
  const genBody = src.slice(genIdx, src.indexOf('#collage-generate', genIdx));
  assert.doesNotMatch(genBody, /collage-desc|resolveCollageLabel/, 'descrição fora do canvas');
});
