'use strict';

/* Reordenação de imagens por lesão: a primeira posição do array `images` é a
 * capa do card e do detalhe. Estes testes cobrem a lógica pura de reordenação
 * (extraída do index.html real e executada em `vm`) e as propriedades
 * estruturais das duas telas que reordenam (Editar e modal do Quiz), além de
 * garantir que deduplicação de sincronização preserva a ordem escolhida.
 *
 * A interação visual (clique nos botões ★/↑/↓) depende de teste manual no
 * navegador, como no restante da suíte deste projeto.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Função ${name} não encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  assert.equal(source[openingBrace], '{');
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  let end = -1;
  for (let i = openingBrace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, `Bloco de ${name} sem fechamento`);
  return { source: source.slice(declaration.index, end + 1), body: source.slice(openingBrace + 1, end) };
}

const moveFn = extractFunction(html, 'moveArrayItem');
const moveContext = {};
vm.createContext(moveContext);
vm.runInContext(moveFn.source, moveContext, { filename: 'move-array-item.js' });

function img(id, extra) {
  return Object.assign({
    data: 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/' + id + '.jpg',
    publicId: 'atlas-radiologico/' + id,
    assetId: 'asset-' + id,
    source: 'cloudinary',
    label: 'legenda ' + id
  }, extra || {});
}

test('★ capa: move a imagem escolhida para a posição 0 (primeira = capa)', () => {
  const imgs = [img('a'), img('b'), img('c')];
  assert.equal(moveContext.moveArrayItem(imgs, 2, 0), true);
  assert.deepEqual(imgs.map((x) => x.assetId), ['asset-c', 'asset-a', 'asset-b']);
  assert.equal(imgs[0].assetId, 'asset-c', 'a capa passa a ser a imagem escolhida');
});

test('↑/↓: reordena vizinhas preservando todos os objetos', () => {
  const imgs = [img('a'), img('b'), img('c')];
  assert.equal(moveContext.moveArrayItem(imgs, 1, 0), true);
  assert.deepEqual(imgs.map((x) => x.assetId), ['asset-b', 'asset-a', 'asset-c']);
  assert.equal(moveContext.moveArrayItem(imgs, 0, 1), true);
  assert.deepEqual(imgs.map((x) => x.assetId), ['asset-a', 'asset-b', 'asset-c']);
});

test('reordenar NÃO altera publicId, assetId, URL nem metadados da imagem', () => {
  const original = img('a', { clinicalContext: { patientAge: '42' }, assignedAt: '2026-01-01T00:00:00.000Z' });
  const other = img('b');
  const imgs = [original, other];
  const before = JSON.parse(JSON.stringify(original));
  moveContext.moveArrayItem(imgs, 0, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(imgs[1])), before);
  assert.equal(imgs[1].publicId, 'atlas-radiologico/a');
  assert.equal(imgs[1].data, 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/a.jpg');
  assert.equal(imgs[1].assetId, 'asset-a');
});

test('limites: mesma posição, índice inválido ou fora do array devolvem false sem tocar na ordem', () => {
  const imgs = [img('a'), img('b')];
  assert.equal(moveContext.moveArrayItem(imgs, 1, 1), false);
  assert.equal(moveContext.moveArrayItem(imgs, -1, 0), false);
  assert.equal(moveContext.moveArrayItem(imgs, 2, 0), false);
  assert.equal(moveContext.moveArrayItem(imgs, 0, 9), true);
  assert.deepEqual(imgs.map((x) => x.assetId), ['asset-b', 'asset-a'], 'destino é limitado ao último índice válido');
  assert.equal(moveContext.moveArrayItem(imgs, 0, -5), false, 'índice 0 já é o limite inferior: nada muda');
  assert.deepEqual(imgs.map((x) => x.assetId), ['asset-b', 'asset-a'], 'destino é limitado ao índice 0');
  assert.equal(moveContext.moveArrayItem(null, 0, 1), false);
});

test('Editar: a galeria reordena o MESMO array pendingImgs e marca imgsChanged (Salvar persiste a ordem)', () => {
  const renderFn = extractFunction(html, 'renderImgGallery');
  assert.match(renderFn.body, /moveArrayItem\(pendingImgs,\s*from,\s*to\)/, 'usa o reorder compartilhado no pendingImgs');
  assert.match(renderFn.body, /imgsChanged\s*=\s*true/, 'reordenar precisa marcar a galeria como alterada para o Salvar gravar');
  assert.match(renderFn.body, /renderImgGallery\(\)/, 're-renderiza após mover');
  assert.match(html, /class="img-gallery-cover-btn"[^>]*>\u2605 capa/, 'botão ★ capa no editor');
  assert.match(html, /class="img-gallery-move img-gallery-move-up"/, 'botão ↑ no editor');
  assert.match(html, /class="img-gallery-move img-gallery-move-down"/, 'botão ↓ no editor');
});

test('Quiz: o modal reordena draftImgs e o "concluído" aplica o rascunho nessa ordem', () => {
  const modalFn = extractFunction(html, 'openQuizAddImageModal');
  assert.match(modalFn.body, /moveArrayItem\(draftImgs,\s*from,\s*to\)/, 'usa o reorder compartilhado no draftImgs');
  assert.match(modalFn.body, /lesion\.images\s*=\s*draftImgs\.map\(/, 'a ordem do rascunho vira a ordem persistida');
  assert.match(modalFn.body, /class="img-gallery-cover-btn quiz-img-cover"/, 'botão ★ capa no Quiz');
  assert.match(modalFn.body, /class="img-gallery-move quiz-img-up"/, 'botão ↑ no Quiz');
  assert.match(modalFn.body, /class="img-gallery-move quiz-img-down"/, 'botão ↓ no Quiz');
});

test('capa do card e do detalhe = primeira imagem do array images', () => {
  const resultsFn = extractFunction(html, 'renderResults');
  assert.match(resultsFn.body, /all\[0\]\.data/, 'card usa a primeira imagem resolvida');
  const firstFn = extractFunction(html, 'getEntryFirstImg');
  assert.match(firstFn.body, /imgs\[0\]\.data/, 'primeira imagem é a capa');
  const getImgsFn = extractFunction(html, 'getEntryImgs');
  assert.match(getImgsFn.body, /Array\.isArray\(e\.images\)\s*\?\s*e\.images\.filter/, 'getEntryImgs preserva a ordem do array persistido');
});

test('deduplicação de sincronização preserva a ordem (Map mantém a primeira ocorrência)', () => {
  const keyFn = extractFunction(html, 'stableImageKeyV208');
  const dedupeFn = extractFunction(html, 'dedupeEntryImagesOnly');
  const sanitizeFn = extractFunction(html, 'sanitizeEntryImagesV208');
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    keyFn.source + '\n' +
    'function imageBelongsToEntryV208(){ return true; }\n' +
    sanitizeFn.source + '\n' +
    dedupeFn.source,
    context,
    { filename: 'image-order-dedupe.js' }
  );
  const entry = { id: 'seed_1', images: [img('c'), img('a'), img('b')] };
  context.dedupeEntryImagesOnly(entry);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.images.map((x) => x.assetId))), ['asset-c', 'asset-a', 'asset-b']);
  const entry2 = { id: 'seed_1', images: [img('c'), img('c'), img('a')] };
  context.sanitizeEntryImagesV208(entry2);
  assert.deepEqual(JSON.parse(JSON.stringify(entry2.images.map((x) => x.assetId))), ['asset-c', 'asset-a'], 'duplicata fundida mantém a posição da primeira ocorrência');
});
