'use strict';

// lrev — "contexto clínico no lightbox aberto pelo EDITOR": antes, maximizar
// uma imagem a partir da visão panorâmica (openDetail) mostrava a faixa
// clínica no lightbox, mas maximizar a MESMA imagem a partir da aba Editar
// lesão (openForm/renderImgGallery) não mostrava — o call site do editor
// não passava o resolver (5º/6º argumento de openImageLightbox). Esta
// suíte prova que os dois call sites agora usam EXATAMENTE a mesma função
// pura (clinicalCaseLinkedToImage, 093d) — nenhuma lógica nova, nenhuma
// duplicação de getQuizClinicalCaseForImage. Mesmo padrão de extração de
// código-fonte real + vm das demais suítes do projeto. Nenhum teste toca
// DATA/SEED/Firestore/IndexedDB/localStorage reais, nem chama saveData().

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
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
    else if (char === '}') { depth -= 1; if (depth === 0) return source.slice(openingBrace, index + 1); }
  }
  throw new Error('Bloco sem fechamento');
}
function extractFunction(name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = html.indexOf('{', declaration.index + declaration[0].length);
  return html.slice(declaration.index, openingBrace) + extractBlock(html, openingBrace);
}
function extractConst(name) {
  const declaration = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(html);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  const semi = html.indexOf(';', declaration.index);
  return html.slice(declaration.index, semi + 1);
}
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

/* ===================== 1. auditoria de call sites ===================== */

const openDetailSrc = extractFunction('openDetail');
const renderImgGallerySrc = extractFunction('renderImgGallery');

test('1. call site ANTIGO (openDetail/renderDetailGallery): já passava o resolver — continua exatamente igual', () => {
  assert.match(
    openDetailSrc,
    /openImageLightbox\(it\.data, it\.label, all, idx, null, \(item\)=>clinicalCaseLinkedToImage\(cur, item\)\);/
  );
});

test('2. call site NOVO (renderImgGallery/openForm): agora também passa o resolver, mesma função, sem lógica nova', () => {
  assert.doesNotMatch(renderImgGallerySrc, /openImageLightbox\(img\.data, img\.label, pendingImgs, idx\);/, 'a chamada antiga (sem resolver) não deveria mais existir assim');
  assert.match(
    renderImgGallerySrc,
    /openImageLightbox\(img\.data, img\.label, pendingImgs, idx, null, \(image\)=>clinicalCaseLinkedToImage\(\{ name: \(existing && existing\.name\) \|\| '', clinicalCases: clinicalCasesDraft \}, image\)\)\);/
  );
});

test('3. o editor reaproveita clinicalCaseLinkedToImage SEM reimplementar getQuizClinicalCaseForImage/getClinicalCasesForImage', () => {
  // a única função nova no call site é a arrow de resolver — nenhuma
  // duplicata de lógica de ambiguidade/vínculo foi criada no editor.
  const editorRegion = renderImgGallerySrc;
  assert.doesNotMatch(stripJsComments(editorRegion), /function getQuizClinicalCaseForImage|function getClinicalCasesForImage|function clinicalCaseLinkedToImage/, 'nenhuma redefinição local dessas funções dentro do editor');
  assert.match(editorRegion, /clinicalCaseLinkedToImage\(/, 'chama a função real existente');
});

test('4. descrição inferior (img.label) continua intacta: mesmos 4 primeiros argumentos de antes (data/label/pendingImgs/idx)', () => {
  assert.match(renderImgGallerySrc, /openImageLightbox\(img\.data, img\.label, pendingImgs, idx, /);
});

/* ===================== 2. comportamento real (mesma função pura, 093d) ===================== */

const FN_NAMES = [
  'stableImageKeyV208', 'didacticImageId', 'didacticImageAltIds', 'isPendingImageRefId', 'didacticImageRefId',
  'resolveLesionImageRef', 'activeImageRefs', 'isImageLinked', 'isDidacticItemVisible', 'sortDidacticItems',
  'clinicalCaseIdentityKey', 'didacticPickKey', 'getClinicalCasesForImage', 'getQuizClinicalCaseForImage',
  'clinicalCasePresentationHtml', 'escAttr', 'esc', 'clinicalCaseLinkedToImage', 'clinicalCaseImageBandHtml'
];

function loadApi() {
  const src = [extractConst('CLINICAL_CASE_PRESENTATION_CLAMP')].concat(FN_NAMES.map(extractFunction)).join('\n');
  const warnings = [];
  const ctx = vm.createContext({ console: { warn: (...a) => warnings.push(a.join(' ')), log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { clinicalCaseLinkedToImage, clinicalCaseImageBandHtml };', ctx);
  return { api: ctx.__api, warnings };
}

function makeImage(id, assetId) { return { assetId, data: 'https://res.cloudinary.com/x/image/upload/v1/' + id + '.jpg', source: 'cloudinary' }; }
function makeCase(id, overrides) {
  return Object.assign({ id, title: 'Caso ' + id, origin: 'imported', imageRefs: [] }, overrides);
}
// Pseudo-entry EXATAMENTE como o editor constrói: { name, clinicalCases:
// clinicalCasesDraft } — o estado AO VIVO da tela (rascunho), não
// existing.clinicalCases direto.
function draftPseudoEntry(name, clinicalCasesDraft) { return { name, clinicalCases: clinicalCasesDraft }; }

test('5. editor: imagem SEM caso vinculado no draft atual -> sem faixa', () => {
  const { api } = loadApi();
  const img = makeImage('i1', 'asset1');
  const draft = [makeCase('c1', { patientAge: '40', imageRefs: [] })];
  const entry = draftPseudoEntry('Lesão X', draft);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  assert.equal(linked, null);
  assert.equal(api.clinicalCaseImageBandHtml(linked), '');
});

test('6. editor: imagem COM caso vinculado no draft atual -> faixa aparece (mesma função do detalhe)', () => {
  const { api } = loadApi();
  const img = makeImage('i1', 'asset1');
  const draft = [makeCase('c1', { patientAge: '40', patientSex: 'Masculino', presentation: 'Dor lombar há 3 meses.', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] })];
  const entry = draftPseudoEntry('Lesão X', draft);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  assert.ok(linked);
  assert.equal(linked.id, 'c1');
  const out = api.clinicalCaseImageBandHtml(linked);
  assert.ok(out.includes('detail-img-clinical-band'));
  assert.ok(out.includes('40 anos'));
});

test('7. editor: vínculo AMBÍGUO (2 casos pra mesma imagem, sem escolha explícita) -> sem faixa + aviso', () => {
  const { api, warnings } = loadApi();
  const img = makeImage('i1', 'asset1');
  const c1 = makeCase('c1', { patientAge: '30', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const c2 = makeCase('c2', { patientAge: '55', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 2, updatedAt: 2 }] });
  const entry = draftPseudoEntry('Lesão X', [c1, c2]);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  assert.equal(linked, null, 'ambíguo -> nenhuma faixa, nunca mistura pacientes');
  assert.equal(api.clinicalCaseImageBandHtml(linked), '');
  assert.ok(warnings.some(w => w.includes('mais de um caso clínico vinculado')), 'avisa no console sobre a ambiguidade');
});

test('8. navegação entre imagens: cada imagem resolve o PRÓPRIO caso de forma independente (nunca mistura pacientes)', () => {
  const { api } = loadApi();
  const img1 = makeImage('i1', 'asset1');
  const img2 = makeImage('i2', 'asset2');
  const img3 = makeImage('i3', 'asset3'); // sem nenhum caso vinculado
  const c1 = makeCase('c1', { patientAge: '20', presentation: 'Quadro paciente 1', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const c2 = makeCase('c2', { patientAge: '70', presentation: 'Quadro paciente 2', imageRefs: [{ imageId: 'asset:asset2', order: 0, createdAt: 1, updatedAt: 1 }] });
  const entry = draftPseudoEntry('Lesão X', [c1, c2]);
  // simula a navegação ‹ › dentro do lightbox: o resolver é chamado de novo
  // para CADA imagem visitada, sempre com o MESMO draft (nada muda entre
  // navegações, já que é uma releitura, nunca uma mutação).
  const seq = [img1, img2, img3, img1].map(img => api.clinicalCaseLinkedToImage(entry, img));
  assert.equal(seq[0].id, 'c1');
  assert.equal(seq[1].id, 'c2');
  assert.equal(seq[2], null, 'imagem sem caso -> sem faixa');
  assert.equal(seq[3].id, 'c1', 'voltar pra imagem 1 resolve de novo o MESMO caso (c1), não o último visitado (c2)');
  assert.ok(!api.clinicalCaseImageBandHtml(seq[0]).includes('paciente 2'));
  assert.ok(!api.clinicalCaseImageBandHtml(seq[1]).includes('paciente 1'));
});

/* ===================== 3. zero efeito colateral ===================== */

test('9. o novo resolver do editor nunca muta pendingImgs/clinicalCasesDraft/existing nem chama saveData', () => {
  const start = renderImgGallerySrc.indexOf("item.querySelector('.img-gallery-thumb')");
  const end = renderImgGallerySrc.indexOf(';', renderImgGallerySrc.indexOf('clinicalCaseLinkedToImage', start)) + 1;
  const region = stripJsComments(renderImgGallerySrc.slice(start, end));
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/clinicalCasesDraft\s*=(?!=)/.test(region), 'não reatribui o draft, só lê');
  assert.ok(!/existing\.\w+\s*=/.test(region), 'não escreve em existing');
  assert.ok(!/pendingImgs\[idx\]\s*=/.test(region), 'não substitui a imagem');
});

test('10. clinicalCaseLinkedToImage/clinicalCaseImageBandHtml continuam puras (nunca mutam entry/image/case)', () => {
  const { api } = loadApi();
  const img = makeImage('i1', 'asset1');
  const draft = [makeCase('c1', { patientAge: '40', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] })];
  const entry = draftPseudoEntry('Lesão X', draft);
  const entrySnap = JSON.parse(JSON.stringify(entry));
  const imgSnap = JSON.parse(JSON.stringify(img));
  api.clinicalCaseLinkedToImage(entry, img);
  assert.deepEqual(entry, entrySnap);
  assert.deepEqual(img, imgSnap);
});

test('11. região do novo resolver nunca referencia Firestore/localStorage', () => {
  const start = renderImgGallerySrc.indexOf("item.querySelector('.img-gallery-thumb')");
  const end = renderImgGallerySrc.indexOf(';', renderImgGallerySrc.indexOf('clinicalCaseLinkedToImage', start)) + 1;
  const region = stripJsComments(renderImgGallerySrc.slice(start, end));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
});
