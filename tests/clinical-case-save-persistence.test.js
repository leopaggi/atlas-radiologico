'use strict';

// INVESTIGAÇÃO: imagens/quadro adicionados a um caso clínico (kind='cases')
// dentro do editor de item, e depois "Salvar item", pareciam se perder ao
// salvar a lesão inteira / reabrir. Este arquivo roda o CAMINHO REAL, ponta a
// ponta, com apenas os limites de I/O externo (Cloudinary) substituídos por
// um stub — todo o resto (openDidacticItemEditor, didacticImageCtx real do
// openForm, o corpo real do handler de "Salvar" da lesão até a gravação em
// DATA, applyImageMetadataEdits, mergeStaleFormImagesForSave,
// remapPendingImageRefs, stableImageKeyV208 etc.) é o código-fonte real
// extraído de index.html, não uma reimplementação.
//
// Fluxo simulado (ETAPA 1 -> ETAPA 2), com o mesmo objeto `pendingImgs`
// compartilhado entre as duas etapas (exatamente como no app real, onde
// didacticImageCtx fecha sobre o `pendingImgs` do openForm):
//   ETAPA 1: abre o editor do item (kind='cases', novo caso) com um DOM fake
//     minimo -> clica "criar quadro de imagens" (de-collage) -> o construtor
//     devolve uma imagem pendente -> clica "Salvar item" (de-save) -> captura
//     o objeto que seria passado a onSave().
//   ETAPA 2: monta clinicalCasesDraft com esse objeto (via upsertDidacticItem
//     real, como wireDidacticFormSection faz) -> roda o CORPO REAL do handler
//     de "Salvar" da lesão (extraído literalmente de openForm, do
//     `f-save`.onclick até imediatamente antes do push para a nuvem) -> lê o
//     resultado em `existing.clinicalCases`/`existing.images`.

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

function extractBlockFrom(source, startIndex) {
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = startIndex; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(startIndex, i + 1); }
  }
  throw new Error('bloco sem fechamento a partir de ' + startIndex);
}

function extractConstObject(source, name) {
  const idx = source.indexOf('const ' + name + ' = {');
  assert.ok(idx !== -1, 'const ' + name + ' não encontrada');
  const braceIdx = source.indexOf('{', idx);
  return 'const ' + name + ' = ' + extractBlockFrom(source, braceIdx) + ';';
}

function extractConstLine(source, name) {
  const re = new RegExp('const ' + name + ' = [^\\n]*;');
  const m = re.exec(source);
  assert.ok(m, 'const ' + name + ' não encontrada');
  return m[0];
}

const PURE_DEPS_NAMES = [
  'esc', 'escAttr', 'canonicalJsonString', 'didacticStr', 'didacticUrl', 'genDidacticId', 'sortDidacticItems', 'didacticItemTime',
  'upsertDidacticItem', 'didacticRefsField', 'normalizeManualClinicalCase',
  'stableImageKeyV208', 'didacticImageId', 'didacticImageRefId', 'didacticImageAltIds', 'isPendingImageRefId', 'findSameLesionImage',
  'resolveLesionImageRef', 'imageRefTime', 'activeImageRefs', 'isImageLinked', 'linkImageRef', 'unlinkImageRef', 'moveImageRef', 'setImageRefOverrides',
  'remapPendingImageRefs', 'applyDidacticDraftsToNewEntry', 'pruneTombstonedImageRefs', 'migrateLegacyDidacticImages',
  'imageMetaNorm', 'imageMetaFields', 'imageMetaTopValue', 'imageMetaCtxValue', 'imageMetaStamp', 'applyImageMetadataEdits',
  'mergeStaleFormImagesForSave', 'normalizeImageClinicalContext', 'withNormalizedImageClinicalContext', 'buildPendingImage', 'uploadPendingImage'
];
const PURE_DEPS_SRC = PURE_DEPS_NAMES.map((n) => extractFunction(html, n)).join('\n');
const CONSTS_SRC = extractConstLine(html, 'DIDACTIC_LIMITS');

const editorSrc = extractFunction(html, 'openDidacticItemEditor');
const imageCtxSrc = extractConstObject(html, 'didacticImageCtx');
const newPendingKeySrc = extractConstLine(html, 'newPendingKey');

// Corpo real do handler de "Salvar" da lesão: do `f-save`.onclick até
// imediatamente antes do push para a nuvem (marcador de comentário real do
// próprio código — ver index.html). Tudo dentro desse trecho é código real,
// não reescrito.
const SAVE_START_MARK = "document.getElementById('f-save').onclick = async ()=>{";
const SAVE_END_MARK = '// A partir daqui, a tela SEMPRE fecha ao final';
const saveStartIdx = html.indexOf(SAVE_START_MARK);
assert.ok(saveStartIdx !== -1, 'handler de salvar não encontrado');
const saveEndIdx = html.indexOf(SAVE_END_MARK, saveStartIdx);
assert.ok(saveEndIdx !== -1, 'marcador de fim não encontrado');
const saveHandlerBody = html.slice(saveStartIdx + SAVE_START_MARK.length, saveEndIdx);

function makeFakeElement() {
  const bySelector = new Map();
  return {
    className: '', id: '', value: '', checked: false, textContent: '', disabled: false, innerHTML: '',
    appendChild() {}, remove() {}, setAttribute() {},
    addEventListener() {},
    querySelector(sel) {
      if (!bySelector.has(sel)) bySelector.set(sel, makeFakeElement());
      return bySelector.get(sel);
    },
    querySelectorAll() { return []; }
  };
}

function makeFakeDocumentForEditor() {
  let lastAppended = null;
  return {
    createElement() { return makeFakeElement(); },
    body: { appendChild(el) { lastAppended = el; } },
    get _lastAppended() { return lastAppended; }
  };
}

// ETAPA 1: roda o editor de item REAL (openDidacticItemEditor) com um DOM
// fake mínimo, ligado ao MESMO didacticImageCtx real do openForm (fechando
// sobre o `pendingImgs` passado).
function driveItemEditor({ pendingImgs, existing, formEntryId }) {
  const document = makeFakeDocumentForEditor();
  let imgsChanged = false;
  let lastCollageCb = null;
  let autoPickIds = null; // Set<imageId> — simula a escolha do usuário no seletor
  const IMAGE_TOMBSTONES = {};

  const sandbox = {
    document, console: { warn() {}, log() {}, error() {} },
    pendingImgs, existing, IMAGE_TOMBSTONES, formEntryId,
    get imgsChanged() { return imgsChanged; }, set imgsChanged(v) { imgsChanged = v; },
    renderImgGallery() {}, revokeObjectUrl() {},
    tombstoneScopeKey: (id, eid) => id + '|' + eid,
    buildPendingImage: (file, trackObjectUrl) => ({ label: '', data: trackObjectUrl(file), source: 'pending', _file: file, _objectUrl: trackObjectUrl(file) }),
    trackObjectUrl: () => 'blob:unused',
    pasteTargetIsText: () => false,
    openCollageBuilder: (lesionMeta, cb) => { lastCollageCb = cb; },
    // openLesionImagePicker real abre um modal de seleção; aqui simulamos
    // diretamente a confirmação do usuário (mesmo formato: Set de imageIds).
    openLesionImagePicker: (images, refs, onDone) => { onDone(autoPickIds || new Set()); }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    CONSTS_SRC + '\n' + PURE_DEPS_SRC + '\n' + newPendingKeySrc + '\n' + imageCtxSrc + '\n' + editorSrc +
    '\nthis.__open = openDidacticItemEditor; this.__ctx = didacticImageCtx; ' +
    'this.__utils = { upsertDidacticItem, genDidacticId, resolveLesionImageRef, stableImageKeyV208 };',
    ctx
  );
  return {
    open: ctx.__open,
    imageCtx: ctx.__ctx,
    utils: ctx.__utils,
    document,
    triggerCollage: (collageObj) => { assert.ok(lastCollageCb, 'openCollageBuilder não foi chamado'); lastCollageCb(collageObj); },
    setAutoPick: (ids) => { autoPickIds = new Set(ids); }
  };
}

// ETAPA 2: roda o CORPO REAL do handler de Salvar da lesão.
async function driveLesionSave({ existing, pendingImgs, imgsChangedInitial, clinicalCasesDraft, cloudinaryUpload }) {
  const fieldValues = {
    'f-name': existing.name, 'f-section': existing.s, 'f-site': existing.site, 'f-img': '',
    'f-en-term': existing.enTerm || '', 'f-inc': String(existing.inc || 2), 'f-classification': existing.classification || '',
    'f-notes': existing.notes || '', 'f-site-new-confirm': null, 'f-mark-review': null, 'f-review-request': null
  };
  const document = {
    getElementById(id) {
      if (id in fieldValues) {
        const v = fieldValues[id];
        if (v === null) return { checked: false, value: '' };
        return { value: v };
      }
      return null;
    }
  };
  let formSaving = false;
  let imgsChanged = imgsChangedInitial;
  const toasts = [];
  const sandbox = {
    document, console: { warn() {}, log() {}, error() {} },
    get formSaving() { return formSaving; }, set formSaving(v) { formSaving = v; },
    existing, DATA: [existing], formEntryId: existing.id,
    pendingImgs, get imgsChanged() { return imgsChanged; }, set imgsChanged(v) { imgsChanged = v; },
    tags: existing.tags || [], links: existing.links || [], altPlacementsDraft: existing.altPlacements || [],
    clinicalTags: existing.clinicalTags || [], // CLINICAL TAGS V1 — nova variável livre do handler real
    clinicalCasesDraft, radiologicSignsDraft: [], classificationSchemesDraft: [],
    formImageMetaBaseline: new Map(), formImagesOpenList: [],
    toast: (m) => toasts.push(m),
    validateSiteAgainstSection: (sec, site) => ({ ok: true, value: site }),
    hasCloudinaryConfig: () => true,
    uploadToCloudinary: cloudinaryUpload,
    isImageTombstoned: () => false,
    stampNewImagesAssignedAt: () => {},
    markPendingLocalImageAdds: () => false,
    savePendingLocalImageAdds: async () => {},
    deleteLocalImg: async () => {},
    createLesionReview: () => ({ reason: '' }),
    saveLesionRevisions: async () => {},
    createExternalImportAiReview: () => ({ ok: false }),
    externalAiReviewResultMessage: () => '',
    externalAiReviewInstruction: null
  };
  const ctx = vm.createContext(sandbox);
  const src = CONSTS_SRC + '\n' + PURE_DEPS_SRC + '\n' +
    'async function __save(){\n' + saveHandlerBody + '\n}\nthis.__run = __save;';
  vm.runInContext(src, ctx);
  await ctx.__run();
  return { toasts };
}

test('PROVA end-to-end: quadro de imagem criado dentro de um caso clínico novo sobrevive ao Salvar real da lesão e fica resolvível em entry.images', async () => {
  const existing = {
    id: 'lesion_1', name: 'Abscesso hepático', s: 'Abdômen Superior', site: 'Fígado',
    tags: [], img: '', notes: '', links: [], enTerm: '', inc: 2, images: [], clinicalCases: []
  };
  const pendingImgs = [];

  // ETAPA 1 — editor do item (kind='cases'), REAL, via DOM fake.
  const flow = driveItemEditor({ pendingImgs, existing, formEntryId: existing.id });
  let savedOut = null;
  const getLesionMeta = () => ({ id: existing.id, name: existing.name });
  flow.open('cases', null, getLesionMeta, (out) => { savedOut = out; }, flow.imageCtx);
  const ov = flow.document._lastAppended;
  assert.ok(ov, 'editor não anexou nenhum elemento ao document.body');

  ov.querySelector('#de-title').value = 'Caso ilustrativo';
  ov.querySelector('#de-presentation').value = 'Paciente com dor no hipocôndrio direito.';

  ov.querySelector('#de-collage').onclick();
  flow.triggerCollage({ label: 'Quadro TC', panels: [{ url: 'blob:a', seq: 'TC axial' }], data: 'blob:collage1', source: 'pending', _file: { name: 'quadro.png' }, _objectUrl: 'blob:collage1' });

  assert.equal(pendingImgs.length, 1, 'a imagem do quadro entrou na galeria (pendingImgs) — fonte única, sem duplicar');
  const pendingKey = pendingImgs[0]._pendingKey;
  assert.match(pendingKey, /^pending:/);

  ov.querySelector('#de-save').onclick();
  assert.ok(savedOut, 'onSave não foi chamado');
  assert.equal(savedOut.title, 'Caso ilustrativo');
  assert.ok(Array.isArray(savedOut.imageRefs) && savedOut.imageRefs.length === 1, 'caso salvo do editor deveria ter 1 imageRef — ANTES mesmo do Salvar da lesão');
  assert.equal(savedOut.imageRefs[0].imageId, pendingKey);

  // Como wireDidacticFormSection monta o draft ao ADICIONAR um caso novo.
  const clinicalCasesDraft = flow.utils.upsertDidacticItem([], Object.assign({}, savedOut, { id: flow.utils.genDidacticId('case') }));
  assert.equal(clinicalCasesDraft[0].imageRefs.length, 1, 'draft da lesão mantém o imageRefs após upsertDidacticItem');

  // ETAPA 2 — corpo REAL do Salvar da lesão (upload real simulado só no limite externo).
  const cloudinaryUpload = async (file, lesionMeta) => ({
    data: 'https://res.cloudinary.com/atlas/image/upload/v1/real/quadro1.jpg',
    thumb: 'https://res.cloudinary.com/atlas/image/upload/v1/real/quadro1_thumb.jpg',
    assetId: 'realAsset1', publicId: 'real/quadro1', source: 'cloudinary'
  });
  await driveLesionSave({ existing, pendingImgs, imgsChangedInitial: true, clinicalCasesDraft, cloudinaryUpload });

  // === Asserções finais: o que sobrou em `existing` (equivalente a DATA/reload) ===
  assert.equal(existing.images.length, 1, 'a imagem do quadro foi persistida em entry.images');
  assert.equal(existing.clinicalCases.length, 1, 'o caso clínico foi persistido em entry.clinicalCases');
  const persistedCase = existing.clinicalCases[0];
  assert.ok(Array.isArray(persistedCase.imageRefs) && persistedCase.imageRefs.length === 1,
    'BUG: o caso clínico persistido perdeu o imageRefs no Salvar real da lesão');
  const persistedImageId = persistedCase.imageRefs[0].imageId;
  assert.doesNotMatch(persistedImageId, /^pending:/, 'a chave pending:… deveria ter sido trocada pela chave real do asset enviado');

  const resolved = flow.utils.resolveLesionImageRef(existing.images, persistedImageId);
  assert.ok(resolved, 'BUG CONFIRMADO: o imageId do vínculo do caso não resolve contra entry.images após o Salvar — a imagem "fica solta"');
  assert.equal(resolved.assetId, 'realAsset1');
});

test('PROVA end-to-end: caso clínico com imagem JÁ EXISTENTE (via "+ selecionar imagens da lesão") sobrevive ao Salvar real, sem nenhum upload novo', async () => {
  const existingImage = { data: 'https://res.cloudinary.com/atlas/image/upload/v1/old/foto1.jpg', assetId: 'oldAsset1', publicId: 'old/foto1', source: 'cloudinary', label: 'RM prévia' };
  const existing = {
    id: 'lesion_2', name: 'Cisto renal', s: 'Abdômen Superior', site: 'Rim',
    tags: [], img: '', notes: '', links: [], enTerm: '', inc: 2, images: [existingImage], clinicalCases: []
  };
  // pendingImgs, no app real, é populado de forma ASSÍNCRONA (getEntryImgs(existing).then(...))
  // a partir de entry.images quando o formulário abre. Simulamos o estado JÁ
  // carregado (cenário normal — o usuário não clica em menos de 1 tick).
  const pendingImgs = [{ ...existingImage }];

  const flow = driveItemEditor({ pendingImgs, existing, formEntryId: existing.id });
  const imageId = flow.utils.stableImageKeyV208(existingImage);
  flow.setAutoPick([imageId]);

  let savedOut = null;
  const getLesionMeta = () => ({ id: existing.id, name: existing.name });
  flow.open('cases', null, getLesionMeta, (out) => { savedOut = out; }, flow.imageCtx);
  const ov = flow.document._lastAppended;

  ov.querySelector('#de-title').value = 'Caso com imagem prévia';
  ov.querySelector('#de-presentation').value = 'Achado incidental em exame de rotina.';
  ov.querySelector('#de-pick').onclick(); // seleciona a imagem já existente (openLesionImagePicker -> onDone)
  ov.querySelector('#de-save').onclick();

  assert.ok(savedOut);
  assert.equal(savedOut.imageRefs.length, 1, 'imagem já existente selecionada deveria estar no imageRefs salvo pelo item');
  assert.equal(savedOut.imageRefs[0].imageId, imageId);

  const clinicalCasesDraft = flow.utils.upsertDidacticItem([], Object.assign({}, savedOut, { id: flow.utils.genDidacticId('case') }));

  // imgsChangedInitial=false: nenhuma imagem NOVA foi adicionada nesta sessão
  // (só selecionou uma já existente) — replica fielmente o app real, onde
  // `de-pick` nunca marca imgsChanged=true.
  const cloudinaryUpload = async () => { throw new Error('não deveria fazer upload — imagem já existia'); };
  await driveLesionSave({ existing, pendingImgs, imgsChangedInitial: false, clinicalCasesDraft, cloudinaryUpload });

  assert.equal(existing.images.length, 1, 'nenhuma imagem duplicada');
  assert.equal(existing.clinicalCases.length, 1);
  const persistedCase = existing.clinicalCases[0];
  assert.equal(persistedCase.imageRefs.length, 1, 'BUG: caso perdeu o vínculo com a imagem já existente no Salvar real');
  const resolved = flow.utils.resolveLesionImageRef(existing.images, persistedCase.imageRefs[0].imageId);
  assert.ok(resolved, 'vínculo da imagem já existente não resolve contra entry.images após o Salvar');
  assert.equal(resolved.assetId, 'oldAsset1');
});
