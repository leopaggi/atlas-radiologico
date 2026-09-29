'use strict';

// QUADRO DE IMAGEM EM CASOS CLÍNICOS (paridade com sinais radiológicos e
// classificações — reviewId lrev_mumkdsuy_ub6vy9).
// Casos clínicos já reaproveitavam 100% da arquitetura 093b (item.imageRefs
// sobre entry.images, vínculo por imageId, nunca duplica asset) através do
// mesmo openDidacticItemEditor('cases', ...) usado por signs/schemes; só os
// controles de imagem NOVA (upload/URL/colar/▦ quadro) estavam condicionados
// a `kind !== 'cases'`. Este arquivo testa as funções REAIS e puras que o
// "de-save" do editor usa para persistir/ler o vínculo em casos clínicos —
// mesmo padrão de tests/didactic-image-links.test.js, focado no caminho de
// `clinicalCases`. A fiação estática do editor (botões existirem para os 3
// kinds) está em tests/didactic-image-panels-signs-classifications.test.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Windows checkouts salvam index.html com CRLF; normalizamos aqui (só nesta
// cópia em memória de leitura de teste — não altera o arquivo real).
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

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

const editorSrc = extractFunction(html, 'openDidacticItemEditor');

function extractConstLine(source, name) {
  const re = new RegExp('const ' + name + ' = [^\\n]*;');
  const m = re.exec(source);
  assert.ok(m, 'constante ' + name + ' não encontrada');
  return m[0];
}

function api() {
  const names = ['esc', 'escAttr', 'didacticStr', 'didacticUrl', 'canonicalJsonString', 'genDidacticId', 'sortDidacticItems',
    'didacticItemTime', 'upsertDidacticItem', 'didacticRefsField', 'normalizeManualClinicalCase', 'stableImageKeyV208', 'didacticImageId',
    'didacticImageRefId', 'didacticImageAltIds', 'isPendingImageRefId', 'resolveLesionImageRef', 'imageRefTime', 'activeImageRefs',
    'isImageLinked', 'linkImageRef', 'unlinkImageRef', 'moveImageRef', 'setImageRefOverrides', 'didacticViewsHtml',
    'clinicalCasePresentationHtml', 'linkedImageViews', 'didacticImageViews', 'didacticImageCount', 'clinicalCaseRowHtml', 'clinicalCasesSectionHtml'];
  const consts = [extractConstLine(html, 'DIDACTIC_LIMITS'), extractConstLine(html, 'CLINICAL_CASE_PRESENTATION_CLAMP')].join('\n');
  const deps = names.map((n) => extractFunction(html, n)).join('\n');
  const ctx = vm.createContext({ URL, Date, Math, JSON, console });
  vm.runInContext(consts + '\n' + deps + '\nthis.__a = { ' + names.join(', ') + ' };', ctx);
  return ctx.__a;
}

// ===========================================================================
// 1. CRIAR caso com imageRefs
// ===========================================================================

test('1. criar caso clínico manual com imagem já vinculada à lesão: normalizeManualClinicalCase + linkImageRef + upsertDidacticItem grava imageRefs no item', () => {
  const { normalizeManualClinicalCase, linkImageRef, upsertDidacticItem, genDidacticId, didacticImageRefId } = api();
  const image = { data: 'https://res.cloudinary.com/x/a.jpg', label: 'RM T1' };
  const entry = { id: 'lesion_1', clinicalCases: [], images: [image] };
  // MESMA identidade que o "de-pick" real usa (didacticImageRefId -> stableImageKeyV208), nunca a URL crua.
  const imageId = didacticImageRefId(image);
  assert.equal(imageId, 'data:https://res.cloudinary.com/x/a.jpg');

  const res = normalizeManualClinicalCase({ title: 'Caso 1', presentation: 'Paciente com dor abdominal.', origin: 'manual' });
  assert.equal(res.ok, true);

  let refs = linkImageRef([], imageId);
  assert.equal(refs.length, 1);
  const out = Object.assign({}, res.item, { id: genDidacticId('case'), imageRefs: refs });
  entry.clinicalCases = upsertDidacticItem(entry.clinicalCases, out);

  assert.equal(entry.clinicalCases.length, 1);
  assert.equal(entry.clinicalCases[0].title, 'Caso 1');
  assert.equal(entry.clinicalCases[0].imageRefs.length, 1);
  assert.equal(entry.clinicalCases[0].imageRefs[0].imageId, imageId);
  // a imagem em si continua SÓ na galeria da lesão — nada foi copiado para o caso
  assert.equal(entry.images.length, 1);
  assert.equal('data' in entry.clinicalCases[0], false);
});

// ===========================================================================
// 2. EDITAR caso preservando imageRefs
// ===========================================================================

test('2. editar caso clínico (mudar só o título) preserva imageRefs existentes — upsertDidacticItem por id, sem imageRefs no patch', () => {
  const { upsertDidacticItem } = api();
  const existingCase = { id: 'case_1', title: 'Caso original', presentation: 'x', origin: 'manual',
    imageRefs: [{ imageId: 'img_a', order: 0 }], createdAt: 1000, updatedAt: 1000 };
  const list = [existingCase];

  // Editor reabre o item, usuário só muda o título; "de-save" sempre manda
  // out.imageRefs = finalRefs (os mesmos refs, não tocados na sessão de edição).
  const edited = Object.assign({}, existingCase, { title: 'Caso editado', imageRefs: existingCase.imageRefs.slice() });
  const next = upsertDidacticItem(list, edited, 2000);

  assert.equal(next.length, 1);
  assert.equal(next[0].title, 'Caso editado');
  assert.equal(next[0].imageRefs.length, 1);
  assert.equal(next[0].imageRefs[0].imageId, 'img_a');
  assert.equal(next[0].id, 'case_1', 'edição por id, nunca cria duplicata');
});

// ===========================================================================
// 3. REMOVER imagem do quadro sem remover da lesão
// ===========================================================================

test('3. desvincular imagem do quadro do caso (unlinkImageRef) não apaga a imagem de entry.images', () => {
  const { linkImageRef, unlinkImageRef, activeImageRefs, resolveLesionImageRef, didacticImageRefId } = api();
  const img1 = { data: 'https://x/img1.jpg' }, img2 = { data: 'https://x/img2.jpg' };
  const entry = { images: [img1, img2] };
  const id1 = didacticImageRefId(img1), id2 = didacticImageRefId(img2);
  let refs = linkImageRef([], id1);
  refs = linkImageRef(refs, id2);
  assert.equal(activeImageRefs(refs).length, 2);

  refs = unlinkImageRef(refs, id1);

  assert.equal(activeImageRefs(refs).length, 1, 'só 1 vínculo ativo depois de desvincular');
  assert.equal(activeImageRefs(refs)[0].imageId, id2);
  // a imagem desvinculada CONTINUA na galeria da lesão, intocada
  assert.equal(entry.images.length, 2);
  assert.ok(resolveLesionImageRef(entry.images, id1), 'imagem ainda existe/resolvível na galeria da lesão (o vínculo é que ficou inativo, não o asset)');
});

// ===========================================================================
// 4. REABRIR caso e manter refs (round-trip de persistência)
// ===========================================================================

test('4. round-trip de persistência (serializar/reler, como storage local ou Firestore) preserva imageRefs do caso clínico', () => {
  const { linkImageRef, activeImageRefs, upsertDidacticItem, didacticImageRefId } = api();
  const image = { data: 'https://x/rm.jpg' };
  const entry = { id: 'lesion_2', clinicalCases: [], images: [image] };
  const imageId = didacticImageRefId(image);
  const refs = linkImageRef([], imageId);
  entry.clinicalCases = upsertDidacticItem(entry.clinicalCases, { id: 'case_rt', title: 'Caso RT', presentation: 'p', origin: 'manual', imageRefs: refs });

  const reloaded = JSON.parse(JSON.stringify(entry)); // simula storage.set + storage.get / write + read do Firestore

  assert.equal(reloaded.clinicalCases.length, 1);
  const activeAfterReload = activeImageRefs(reloaded.clinicalCases[0].imageRefs);
  assert.equal(activeAfterReload.length, 1);
  assert.equal(activeAfterReload[0].imageId, imageId);
});

// ===========================================================================
// 5. RENDERIZAR quadro no detalhe da lesão
// ===========================================================================

test('5. clinicalCaseRowHtml renderiza o quadro de imagens do caso (mesma didacticViewsHtml de signs/schemes)', () => {
  const { linkImageRef, upsertDidacticItem, clinicalCaseRowHtml, didacticImageRefId } = api();
  const image = { data: 'https://x/foto.jpg', thumb: 'https://x/foto-thumb.jpg', label: 'RM axial' };
  const entry = { id: 'lesion_3', clinicalCases: [], images: [image] };
  const refs = linkImageRef([], didacticImageRefId(image));
  const c = upsertDidacticItem([], { id: 'case_render', title: 'Caso com imagem', presentation: 'p', origin: 'manual', imageRefs: refs })[0];
  entry.clinicalCases = [c];

  const html2 = clinicalCaseRowHtml(c, entry);

  assert.match(html2, /didactic-images/, 'renderiza o wrapper do quadro de imagens');
  assert.match(html2, /didactic-figure/);
  assert.match(html2, /src="https:\/\/x\/foto-thumb\.jpg"/, 'usa o thumb da imagem já vinculada, sem duplicar asset');
  assert.match(html2, /data-full="https:\/\/x\/foto\.jpg"/);
});

test('6. caso clínico sem nenhuma imagem vinculada não renderiza o wrapper do quadro (comportamento existente preservado)', () => {
  const { clinicalCaseRowHtml } = api();
  const entry = { id: 'lesion_4', clinicalCases: [], images: [] };
  const c = { id: 'case_no_img', title: 'Caso sem imagem', presentation: 'p', origin: 'manual' };
  const html2 = clinicalCaseRowHtml(c, entry);
  assert.doesNotMatch(html2, /didactic-images/);
});

// ===========================================================================
// 7. Fiação do editor: "de-save" grava imageRefs para kind='cases' sem
// exclusão especial (a mesma linha genérica usada por signs/schemes).
// ===========================================================================

test('7. wiring "de-save": a gravação de imageRefs no editor não exclui kind=\'cases\' (paridade real com signs/schemes)', () => {
  const idx = editorSrc.indexOf('out.imageRefs = finalRefs.map');
  assert.notEqual(idx, -1, 'linha de gravação de imageRefs não encontrada');
  const nearby = editorSrc.slice(Math.max(0, idx - 200), idx);
  assert.doesNotMatch(nearby, /kind !== 'cases'/, 'gravação de imageRefs deve ser incondicional a kind');
});
