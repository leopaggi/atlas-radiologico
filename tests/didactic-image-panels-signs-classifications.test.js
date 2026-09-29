'use strict';

// QUADROS DE IMAGENS EM SINAIS RADIOLÓGICOS, CLASSIFICAÇÕES E CASOS CLÍNICOS
// (reviewId lrev_mulf9eek_h24i4h; paridade para casos clínicos: lrev_mumkdsuy_ub6vy9).
// Sinais/classificações já vinculavam imagens EXISTENTES da galeria e
// aceitavam imagem nova por arquivo/URL/Ctrl+V (arquitetura 093b/093c:
// entry.images é a fonte única do asset; o item guarda só `imageRefs`).
// O que faltava era o "quadro de imagens" (▦, o MESMO construtor de
// montagem usado no formulário principal e no Quiz — openCollageBuilder)
// dentro do editor do item. Reaproveita 100% da arquitetura existente:
// nenhuma coleção paralela, nenhum schema novo. Fluxo REAL rastreado:
// botão "▦ criar quadro de imagens" (openDidacticItemEditor) ->
// openCollageBuilder(..., deferUpload:true) -> addAndLink(collage) ->
// didacticImageCtx.addImage (openForm) -> vínculo por imageRefs -> upload
// só no Salvar da lesão (mesmo pipeline de qualquer imagem pendente).
//
// Bug lateral encontrado e corrigido no mesmo commit: o objeto devolvido
// por openCollageBuilder (deferUpload:true) nunca tinha `_pendingKey`
// (só era corrigido depois, na próxima leitura de getImages() — tarde
// demais para o addAndLink() que já teria decidido "não foi possível
// vincular" com o id vazio). didacticImageCtx.addImage agora atribui a
// chave na hora, igual addPendingFile já fazia.

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
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1'); }
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start.slice(0, 60));
  return html.slice(a, b);
}

const openFormSrc = extractFunction(html, 'openForm');
const editorSrc = extractFunction(html, 'openDidacticItemEditor');

// ===========================================================================
// 1/2. ESTÁTICO — botão novo só para signs/schemes, reaproveita openCollageBuilder
// ===========================================================================

test('1. template do editor: "▦ criar quadro de imagens" existe para os 3 kinds (cases/signs/schemes), igual aos outros controles de imagem nova (paridade lrev_mumkdsuy_ub6vy9)', () => {
  const idx = editorSrc.indexOf('id="de-collage"');
  assert.notEqual(idx, -1, 'botão não encontrado no template');
  const nearby = editorSrc.slice(Math.max(0, idx - 260), idx + 120);
  assert.doesNotMatch(nearby, /kind !== 'cases' \?/, 'não deve mais estar condicionado a kind — paridade total entre cases/signs/schemes');
  assert.match(nearby, /'<button type="button" class="btn btn-ghost" id="de-collage"/);
  assert.match(nearby, /\(ctx \? '' : ' disabled title="abra pelo Editar da lesão"'\)/, 'desabilitado fora do contexto da lesão, igual ao de-pick');
});

test('2. wiring do "de-collage": chama openCollageBuilder com deferUpload=true e liga via addAndLink (mesma porta de qualquer imagem nova)', () => {
  const idx = editorSrc.indexOf("$('de-collage')) $('de-collage').onclick");
  assert.notEqual(idx, -1, 'wiring do botão não encontrado');
  const nearby = editorSrc.slice(idx, idx + 500);
  assert.match(nearby, /if \(!ctx\) return;/);
  assert.match(nearby, /activeImageRefs\(refs\)\.length >= DIDACTIC_LIMITS\.images/, 'respeita o mesmo limite de imagens por item');
  assert.match(nearby, /openCollageBuilder\(getLesionMeta\(\), \(collage\) => \{ if \(addAndLink\(collage\)\) err\(''\); \}, null, true\);/);
});

test('3. paridade lrev_mumkdsuy_ub6vy9: upload de arquivo novo, "+ URL" e a zona de colar (Ctrl+V) também deixaram de ser exclusivos de signs/schemes — cases ganha os mesmos controles', () => {
  assert.doesNotMatch(editorSrc, /kind !== 'cases' \? '<label class="btn btn-ghost"/, 'upload de arquivo novo agora incondicional');
  assert.doesNotMatch(editorSrc, /kind !== 'cases' \? '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px;"><input id="de-img-url"/, 'campo de URL agora incondicional');
  assert.doesNotMatch(editorSrc, /if \(kind !== 'cases'\) ov\.addEventListener\('paste'/, 'listener de colar (Ctrl+V) agora incondicional');
  assert.match(editorSrc, /id="de-img-file"/);
  assert.match(editorSrc, /id="de-img-url"/);
  assert.match(editorSrc, /id="de-paste"/);
});

test('4. reordenar/remover vínculo continuam disponíveis (↑/↓/✕ do editor, arquitetura já existente, não recriada)', () => {
  assert.match(editorSrc, /de-iu'\)\.onclick = \(\) => \{ refs = moveImageRef\(refs, r\.imageId, -1\); renderImgs\(\); \};/);
  assert.match(editorSrc, /de-id'\)\.onclick = \(\) => \{ refs = moveImageRef\(refs, r\.imageId, 1\); renderImgs\(\); \};/);
  assert.match(editorSrc, /de-ix'\)\.onclick = \(\) => \{ refs = unlinkImageRef\(refs, r\.imageId\); renderImgs\(\); \};/, 'desvincular, nunca deleta o asset global');
});

test('5. reaproveita a arquitetura existente: sem coleção paralela — só imageRefs sobre entry.images (mesma chave dos tombstones)', () => {
  assert.doesNotMatch(editorSrc, /signImages|classificationImages|schemeImages|signPanels|classificationPanels/i, 'nenhum campo/array paralelo inventado para imagens de signs/schemes');
  assert.match(editorSrc, /refs = \(Array\.isArray\(it\.imageRefs\) \? it\.imageRefs : \[\]\)\.map\(x => Object\.assign\(\{\}, x\)\);/);
});

// ===========================================================================
// 6-9. DINÂMICO — didacticImageCtx.addImage (código REAL de openForm),
// não um helper isolado: o quadro (pending, sem _pendingKey) precisa
// resolver a um id vinculável IMEDIATAMENTE, na mesma chamada.
// ===========================================================================

function loadImageCtx(over) {
  const ctxSrc = sliceBetween('const newPendingKey = ()=>', '\n  };') + '\n  };';
  const depsSrc = [extractFunction(html, 'didacticImageId'), extractFunction(html, 'didacticImageRefId'), extractFunction(html, 'isPendingImageRefId'), extractFunction(html, 'stableImageKeyV208')].join('\n');
  let pendingImgs = (over && over.pendingImgs) || [];
  let imgsChanged = false;
  let renderCalls = 0;
  const existing = (over && over.existing) || null;
  const IMAGE_TOMBSTONES = {};
  const formEntryId = 'u_test';
  const buildPendingImage = () => ({ source: 'pending', data: 'blob:unused' });
  const trackObjectUrl = () => 'blob:unused';
  const tombstoneScopeKey = (id, entryId) => id + '|' + entryId;
  const revokeObjectUrl = () => {};
  const renderImgGallery = () => { renderCalls += 1; };
  const vmCtx = vm.createContext({
    pendingImgs, existing, IMAGE_TOMBSTONES, formEntryId, buildPendingImage, trackObjectUrl, tombstoneScopeKey, revokeObjectUrl, renderImgGallery,
    get imgsChanged() { return imgsChanged; }, set imgsChanged(v) { imgsChanged = v; },
    console: { warn(){}, log(){}, error(){} }
  });
  vm.runInContext(depsSrc + '\n' + ctxSrc + '\nthis.__c = didacticImageCtx; this.__d = { didacticImageRefId, isPendingImageRefId };', vmCtx);
  return { imageCtx: vmCtx.__c, refId: vmCtx.__d.didacticImageRefId, pendingImgs, get renderCalls(){ return renderCalls; } };
}

test('6. addImage: imagem pendente SEM _pendingKey (exatamente como o quadro devolvido por openCollageBuilder) ganha uma chave "pending:..." na hora', () => {
  const { imageCtx, refId } = loadImageCtx();
  const collage = { label: 'Quadro RM', panels: [{ url: 'blob:a', seq: 'RM T1' }, { url: 'blob:b', seq: 'RM T2' }], data: 'blob:collage', source: 'pending', _file: {}, _objectUrl: 'blob:collage' };
  const added = imageCtx.addImage(collage);
  assert.ok(added._pendingKey, 'precisa ganhar _pendingKey imediatamente');
  assert.match(added._pendingKey, /^pending:/);
  const id = refId(added);
  assert.equal(id, added._pendingKey, 'didacticImageRefId resolve pela mesma chave — o vínculo (addAndLink) consegue linkar na hora');
});

test('7. addImage: imagem pendente que JÁ tem _pendingKey não é sobrescrita', () => {
  const { imageCtx } = loadImageCtx();
  const already = { data: 'blob:x', source: 'pending', _pendingKey: 'pending:original123' };
  const added = imageCtx.addImage(already);
  assert.equal(added._pendingKey, 'pending:original123');
});

test('8. addImage: imagem NÃO pendente (source:"url", ex.: link direto) nunca ganha _pendingKey — identidade continua sendo a URL estável', () => {
  const { imageCtx, refId } = loadImageCtx();
  const urlImg = { data: 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/foo.jpg', source: 'url', label: '' };
  const added = imageCtx.addImage(urlImg);
  assert.equal('_pendingKey' in added, false);
  assert.notEqual(refId(added), '', 'ainda assim resolve — por stableImageKeyV208, não por pending key');
});

test('9. addImage: entra na MESMA galeria (pendingImgs) sem duplicar — 1 push, 1 objeto, re-render disparado', () => {
  const pendingImgs = [];
  const ctxHandle = loadImageCtx({ pendingImgs });
  const collage = { data: 'blob:collage2', source: 'pending', _file: {}, _objectUrl: 'blob:collage2' };
  ctxHandle.imageCtx.addImage(collage);
  assert.equal(pendingImgs.length, 1, 'um único objeto na galeria — nenhum asset duplicado');
  assert.ok(ctxHandle.renderCalls >= 1, 'renderImgGallery foi chamado (miniatura aparece sem F5)');
});
