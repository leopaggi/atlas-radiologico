'use strict';

// Proteção contra SAVE STALE de imagens no editor: formulário aberto em um PC
// não pode apagar imagem adicionada por outro PC enquanto estava aberto.
// Usa as funções REAIS do index.html (mergeStaleFormImagesForSave pura +
// stableImageKeyV208) em `vm` + fiação estática do f-save. Nenhum dado real,
// Cloudinary, Firebase ou DOM de verdade é tocado.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
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
  return source.slice(declaration.index, end + 1);
}

function loadApi() {
  const src = [
    extractFunction(html, 'stableImageKeyV208'),
    extractFunction(html, 'mergeStaleFormImagesForSave'),
  ].join('\n');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.__api = { stableImageKeyV208, mergeStaleFormImagesForSave };', ctx);
  return ctx.__api;
}

const A = () => ({ assetId: 'A', data: 'https://res.cloudinary.com/x/A.jpg', source: 'cloudinary', label: 'A' });
const B = () => ({ assetId: 'B', data: 'https://res.cloudinary.com/x/B.jpg', source: 'cloudinary', label: 'B' });
const C = () => ({ assetId: 'C', data: 'https://res.cloudinary.com/x/C.jpg', source: 'cloudinary', label: 'C' });
const D = () => ({ assetId: 'D', data: 'https://res.cloudinary.com/x/D.jpg', source: 'cloudinary', label: 'D' });
const ids = (list) => list.map((im) => im.assetId).sort();
const plain = (v) => JSON.parse(JSON.stringify(v));

// 1. stale save sem tocar em imagens: A abre [A], B adiciona B, A salva notes => [A,B], nada removido
test('1. galeria intacta + imagem remota nova => união, sem remoção', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A()], [A()], [A(), B()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'B']);
  assert.deepEqual(plain(r.removed), []);
});

// 2. remoção explícita: A abre [A,B], B adiciona C, A remove B e salva => [A,C], removida só B
test('2. remoção explícita de B + C remota nova => [A,C], só B como removida', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A(), B()], [A()], [A(), B(), C()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'C']);
  assert.deepEqual(plain(r.removed), ['asset:B']);
});

// 3. adição local: A abre [A], B adiciona B, A adiciona D e salva => [A,B,D]
test('3. adição local D + B remota nova => [A,B,D]', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A()], [A(), D()], [A(), B()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'B', 'D']);
  assert.deepEqual(plain(r.removed), []);
});

// 4. metadado remoto mais novo: a união carrega o objeto remoto intacto (092 faz o rebase no Save)
test('4. imagem remota nova entra com os metadados remotos intactos', () => {
  const api = loadApi();
  const remoteB = Object.assign(B(), { label: 'legenda nova de B', metaUpdatedAt: { label: 999 } });
  const r = api.mergeStaleFormImagesForSave([A()], [A()], [A(), remoteB]);
  const got = r.images.find((im) => im.assetId === 'B');
  assert.equal(got.label, 'legenda nova de B');
  assert.deepEqual(plain(got.metaUpdatedAt), { label: 999 });
});

// 5. remoção explícita vs atualização remota: X removida na galeria => X em removed (tombstone segue a regra 073)
test('5. X fora da galeria mas presente na abertura => intenção explícita de remover', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A(), B()], [A()], [A(), B()]);
  assert.deepEqual(plain(ids(r.images)), ['A']);
  assert.deepEqual(plain(r.removed), ['asset:B']);
});

// 6. dois PCs adicionam imagens diferentes: união das duas, sem duplicar
test('6. B remota + C local (galeria) => união sem duplicar A', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A()], [A(), C()], [A(), B()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'B', 'C']);
});

// 7. pending convertida (D normalizada) + B remota => ambas sobrevivem
test('7. imagem local normalizada + remota nova => ambas no final', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A()], [A(), D()], [A(), B()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'B', 'D']);
});

// 8. identidade por stable key, nunca por posição: mesma ordem trocada não confunde
test('8. galeria reordenada não gera remoção nem duplicata', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A(), B()], [B(), A()], [A(), B()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'B']);
  assert.deepEqual(plain(r.removed), []);
});

// 9. tombstone só nasce de remoção explícita: B remota nova nunca aparece em removed
test('9. imagem que não estava na abertura jamais é marcada como removida', () => {
  const api = loadApi();
  const r = api.mergeStaleFormImagesForSave([A()], [A()], [A(), B(), C()]);
  assert.deepEqual(plain(ids(r.images)), ['A', 'B', 'C']);
  assert.deepEqual(plain(r.removed), []);
});

// 10. idempotência/convergência: reaplicar com a base atualizada não muda nada nem ressuscita
test('10. segunda aplicação com base atualizada é no-op', () => {
  const api = loadApi();
  const first = api.mergeStaleFormImagesForSave([A()], [A()], [A(), B()]);
  assert.deepEqual(plain(ids(first.images)), ['A', 'B']);
  const second = api.mergeStaleFormImagesForSave(first.images, first.images, first.images);
  assert.deepEqual(plain(ids(second.images)), ['A', 'B']);
  assert.deepEqual(plain(second.removed), []);
});

// ---------------------------------------------------------------------------
// Fiação real no f-save do editor (estática, sem DOM)
// ---------------------------------------------------------------------------
const SAVE_SRC = (() => {
  const fn = extractFunction(html, 'openForm');
  return fn.slice(fn.indexOf("document.getElementById('f-save').onclick"));
})();

test('fiação: abertura registra a base (cópias por valor) com identidade estável', () => {
  assert.match(html, /let formImagesOpenList = \[\];/);
  assert.match(html, /formImagesOpenList = pendingImgs\.map\(i=>\(\{\.\.\.i\}\)\);/);
});

test('fiação: Save resolve o objeto ATUAL em DATA antes de ler/gravar imagens', () => {
  assert.match(SAVE_SRC, /const fresh = DATA\.find\(x=>x && x\.id===entryId\);/);
  assert.match(SAVE_SRC, /if\(fresh && fresh !== existing\) saveEntry = fresh;/);
});

test('fiação: 092 faz rebase no estado ATUAL (metadado remoto mais novo preservado)', () => {
  assert.match(SAVE_SRC, /applyImageMetadataEdits\(formImageMetaBaseline, saveEntryImages, remoteImgs/);
});

test('fiação: união stale acontece antes dos tombstones e respeita tombstone alheio', () => {
  const unionIdx = SAVE_SRC.indexOf('mergeStaleFormImagesForSave(formImagesOpenList, remoteImgs, saveEntryImages)');
  const tombIdx = SAVE_SRC.indexOf('for(const k of staleRemovedKeys)');
  assert.ok(unionIdx >= 0 && tombIdx > unionIdx, 'união antes do bloco 073');
  assert.match(SAVE_SRC, /isImageTombstoned\(im, entryId, IMAGE_TOMBSTONES\)/);
});

test('fiação: tombstone SÓ para o que estava na base e sumiu (nunca para remota nova)', () => {
  assert.match(SAVE_SRC, /for\(const k of staleRemovedKeys\)/);
  assert.doesNotMatch(SAVE_SRC, /for\(const prev of existing\.images\)/);
  assert.match(SAVE_SRC, /recordImageTombstone\(prev, entryId\)/);
});

test('fiação: stamp e marcador 079d usam a base ATUAL (remota nova não é "nova aqui")', () => {
  assert.match(SAVE_SRC, /stampNewImagesAssignedAt\(saveEntryImages, remoteImgs/);
  assert.match(SAVE_SRC, /markPendingLocalImageAdds\(entryId, saveEntryImages, remoteImgs\)/);
});

test('fiação: escrita final vai para o objeto ATUAL em DATA', () => {
  assert.match(SAVE_SRC, /const t = saveEntry \|\| existing;/);
  assert.match(SAVE_SRC, /t\.images=remoteImgs;/);
});

test('fiação: didático/quiz fora do escopo — helper usado SÓ no Save do editor', () => {
  const uses = (html.match(/mergeStaleFormImagesForSave\(/g) || []).length;
  assert.equal(uses, 2, 'definição + 1 chamada no f-save (Quiz/modal intocados)');
  assert.doesNotMatch(html, /openQuizAddImageModal[\s\S]{0,4000}mergeStaleFormImagesForSave\(formImagesOpenList/);
});
