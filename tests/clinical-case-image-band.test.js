'use strict';

// lrev_muqw07yj_w2yirw — testes das funções PURAS por trás da faixa de
// resumo clínico (clinicalCaseLinkedToImage + clinicalCaseImageBandHtml).
// Decisão de UX revisada: a faixa NÃO aparece mais na galeria normal do
// detalhe — só dentro do lightbox maximizado (ver
// tests/lightbox-clinical-context.test.js para a wiring do lightbox em
// si). Estas duas funções continuam exatamente as mesmas, só reaproveitadas
// num lugar diferente. Mesmo padrão de extração+vm das demais suítes:
// extrai as funções REAIS de index.html e roda isolado. Reaproveita a
// resolução imagem->caso já usada e testada no Quiz (093d) — não duplica
// lógica de vínculo/ambiguidade, só a renderização da faixa. Nenhum teste
// toca DATA/SEED/Firestore/IndexedDB/localStorage reais, nem chama saveData().

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const DRIFT_SNAPSHOT_PATH = 'C:/Users/LEONARDO/Downloads/ATLAS_CURRENT_DATA_AFTER_DRIFT.json';

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
  vm.runInContext(src + '\nthis.__api = { clinicalCaseLinkedToImage, clinicalCaseImageBandHtml, getClinicalCasesForImage };', ctx);
  return { api: ctx.__api, warnings };
}

function makeImage(id, assetId) { return { assetId, data: 'https://res.cloudinary.com/x/image/upload/v1/' + id + '.jpg', source: 'cloudinary' }; }
function makeCase(id, overrides) {
  return Object.assign({ id, title: 'Caso ' + id, origin: 'imported', imageRefs: [] }, overrides);
}
function entryWith(images, clinicalCases) { return { id: 'L1', name: 'Lesão teste', images, clinicalCases }; }

test('1. imagem SEM caso vinculado — sem faixa clínica', () => {
  const { api } = loadApi();
  const img = makeImage('i1', 'asset1');
  const entry = entryWith([img], [makeCase('c1', { patientAge: '40', patientSex: 'Masculino', imageRefs: [] })]);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  assert.equal(linked, null);
  assert.equal(api.clinicalCaseImageBandHtml(linked), '');
});

test('2. imagem COM caso vinculado — faixa aparece', () => {
  const { api } = loadApi();
  const img = makeImage('i1', 'asset1');
  const entry = entryWith([img], [makeCase('c1', { patientAge: '40', patientSex: 'Masculino', presentation: 'Dor lombar há 3 meses.', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] })]);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  assert.ok(linked);
  const out = api.clinicalCaseImageBandHtml(linked);
  assert.ok(out.includes('detail-img-clinical-band'));
});

test('3. idade aparece', () => {
  const { api } = loadApi();
  const c = makeCase('c1', { patientAge: '34' });
  assert.ok(api.clinicalCaseImageBandHtml(c).includes('34 anos'));
});

test('4. sexo/gênero aparece', () => {
  const { api } = loadApi();
  const c = makeCase('c1', { patientSex: 'Masculino' });
  assert.ok(api.clinicalCaseImageBandHtml(c).includes('Masculino'));
});

test('5. queixa/história (presentation) aparece', () => {
  const { api } = loadApi();
  const c = makeCase('c1', { presentation: 'Dor lombar progressiva há 3 meses, sem trauma.' });
  assert.ok(api.clinicalCaseImageBandHtml(c).includes('Dor lombar progressiva'));
});

test('6. campo ausente é omitido (sem idade, mostra só sexo)', () => {
  const { api } = loadApi();
  const c = makeCase('c1', { patientSex: 'Feminino' });
  const out = api.clinicalCaseImageBandHtml(c);
  assert.ok(out.includes('Feminino'));
  assert.ok(!/\d+\s*anos/.test(out));
});

test('7. nenhum dado é inventado — sem idade/sexo/presentation, nenhuma faixa (nunca "desconhecido"/placeholder)', () => {
  const { api } = loadApi();
  const c = makeCase('c1', {});
  assert.equal(api.clinicalCaseImageBandHtml(c), '');
  assert.equal(api.clinicalCaseImageBandHtml(null), '');
});

test('8. mais de um caso na lesão — cada imagem usa SOMENTE o caso vinculado a ELA (sem concatenar pacientes)', () => {
  const { api } = loadApi();
  const img1 = makeImage('i1', 'asset1');
  const img2 = makeImage('i2', 'asset2');
  const c1 = makeCase('c1', { patientAge: '30', patientSex: 'Female', presentation: 'Quadro A', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const c2 = makeCase('c2', { patientAge: '4', patientSex: 'Female', presentation: 'Quadro B', imageRefs: [{ imageId: 'asset:asset2', order: 0, createdAt: 1, updatedAt: 1 }] });
  const entry = entryWith([img1, img2], [c1, c2]);
  const linked1 = api.clinicalCaseLinkedToImage(entry, img1);
  const linked2 = api.clinicalCaseLinkedToImage(entry, img2);
  assert.equal(linked1.id, 'c1');
  assert.equal(linked2.id, 'c2');
  assert.ok(!api.clinicalCaseImageBandHtml(linked1).includes('Quadro B'));
  assert.ok(!api.clinicalCaseImageBandHtml(linked2).includes('Quadro A'));
});

test('9. vínculo ambíguo (2 casos apontando pra mesma imagem, sem escolha explícita) — NÃO mistura, não mostra faixa, registra warn', () => {
  const { api, warnings } = loadApi();
  const img = makeImage('i1', 'asset1');
  const c1 = makeCase('c1', { patientAge: '30', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const c2 = makeCase('c2', { patientAge: '50', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const entry = entryWith([img], [c1, c2]);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  assert.equal(linked, null);
  assert.equal(api.clinicalCaseImageBandHtml(linked), '');
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('mais de um caso clínico'));
});

test('10. texto longo de presentation usa o clamp já existente (is-clampable/is-clamped)', () => {
  const { api } = loadApi();
  const longText = 'A'.repeat(200);
  const c = makeCase('c1', { presentation: longText });
  const out = api.clinicalCaseImageBandHtml(c);
  assert.ok(out.includes('is-clampable'));
  assert.ok(out.includes('is-clamped'));
});

test('11. texto curto de presentation NÃO usa o clamp (fica direto, sem necessidade de expandir)', () => {
  const { api } = loadApi();
  const c = makeCase('c1', { presentation: 'Dor leve.' });
  const out = api.clinicalCaseImageBandHtml(c);
  assert.ok(!out.includes('is-clampable'));
});

test('12. a resolução reaproveita getQuizClinicalCaseForImage (não duplica a lógica de ambiguidade)', () => {
  const region = extractFunction('clinicalCaseLinkedToImage');
  assert.ok(region.includes('getQuizClinicalCaseForImage'));
});

/* ===================== integração real (seed_365) ===================== */

const driftExists = fs.existsSync(DRIFT_SNAPSHOT_PATH);

test('13. integração real: seed_365 (2 imagens, 2 casos) resolve 1:1 sem ambiguidade (pula se o snapshot não existir)', (t) => {
  if (!driftExists) { t.skip('snapshot real não encontrado nesta máquina'); return; }
  const { api } = loadApi();
  const curFile = JSON.parse(fs.readFileSync(DRIFT_SNAPSHOT_PATH, 'utf8'));
  const seed365 = curFile.data.find(d => d.id === 'seed_365');
  assert.ok(seed365 && Array.isArray(seed365.images) && seed365.images.length === 2);
  const linked0 = api.clinicalCaseLinkedToImage(seed365, seed365.images[0]);
  const linked1 = api.clinicalCaseLinkedToImage(seed365, seed365.images[1]);
  assert.ok(linked0 && linked1);
  assert.notEqual(linked0.id, linked1.id);
  assert.ok(api.clinicalCaseImageBandHtml(linked0).includes('anos'));
  assert.ok(api.clinicalCaseImageBandHtml(linked1).includes('anos'));
});

/* ===================== descrição inferior continua intacta ===================== */

test('14. a descrição inferior (.detail-img-label) continua renderizada exatamente como antes', () => {
  assert.ok(html.includes('img.label?`<div class="detail-img-label">${esc(img.label)}</div>`'));
});

test('15. attributes/tags não são afetados — nenhuma referência a attributes/tags na região da faixa clínica', () => {
  const region = stripJsComments(extractFunction('clinicalCaseLinkedToImage') + '\n' + extractFunction('clinicalCaseImageBandHtml'));
  assert.ok(!/\.attributes\b/.test(region));
  assert.ok(!/\.tags\b/.test(region));
});

/* ===================== zero persistência ===================== */

test('16. nenhuma chamada a saveData() na faixa clínica', () => {
  const region = stripJsComments(extractFunction('clinicalCaseLinkedToImage') + '\n' + extractFunction('clinicalCaseImageBandHtml'));
  assert.ok(!/saveData\s*\(/.test(region));
});

test('17. nenhuma referência a Firestore/IndexedDB/localStorage na faixa clínica', () => {
  const region = stripJsComments(extractFunction('clinicalCaseLinkedToImage') + '\n' + extractFunction('clinicalCaseImageBandHtml'));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/indexedDB\.open/i.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
});

test('18. clinicalCaseLinkedToImage/clinicalCaseImageBandHtml nunca mutam entry/image/clinicalCase recebidos', () => {
  const { api } = loadApi();
  const img = makeImage('i1', 'asset1');
  const c = makeCase('c1', { patientAge: '30', imageRefs: [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const entry = entryWith([img], [c]);
  const before = JSON.stringify(entry);
  const linked = api.clinicalCaseLinkedToImage(entry, img);
  api.clinicalCaseImageBandHtml(linked);
  assert.equal(JSON.stringify(entry), before);
});

test('extra — a galeria normal do detalhe (renderDetailGallery) NÃO embute mais a faixa clínica (decisão revisada: só no lightbox)', () => {
  const start = html.indexOf('const renderDetailGallery = ()=>{');
  assert.ok(start >= 0);
  const end = html.indexOf('gal.querySelectorAll(\'img\').forEach', start);
  const galleryTemplateRegion = html.slice(start, end);
  assert.ok(!galleryTemplateRegion.includes('clinicalCaseImageBandHtml'));
  assert.ok(!galleryTemplateRegion.includes('clinicalCaseLinkedToImage'));
});

test('extra — o clique na imagem da galeria passa um resolver de contexto clínico para o lightbox (não embute HTML direto)', () => {
  const idx = html.indexOf("openImageLightbox(it.data, it.label, all, idx, null, (item)=>clinicalCaseLinkedToImage(cur, item))");
  assert.ok(idx > 0, 'call site do lightbox no detalhe deveria passar o resolver como 6º argumento');
});
