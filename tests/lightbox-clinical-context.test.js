'use strict';

// lrev_muqw07yj_w2yirw — testes da wiring do contexto clínico DENTRO do
// lightbox maximizado (openImageLightbox), decisão final de UX: a faixa
// aparece SOMENTE lá, nunca na galeria normal do detalhe (ver
// tests/clinical-case-image-band.test.js para as funções puras
// reaproveitadas aqui: clinicalCaseLinkedToImage/clinicalCaseImageBandHtml,
// que não mudaram). Mesmo padrão de extração+vm das demais suítes. Como
// openImageLightbox manipula o DOM diretamente (document.createElement,
// querySelector, appendChild), estes testes validam por EXTRAÇÃO DE
// CÓDIGO-FONTE (mesmo padrão já usado no projeto para funções que tocam o
// DOM) em vez de simular um DOM completo — a lógica pura por trás
// (clinicalBandFor) é extraída e invocada isoladamente. Nenhum teste toca
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
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

const lightboxSrc = extractFunction('openImageLightbox');

/* ===================== assinatura e template ===================== */

test('1. openImageLightbox aceita resolveClinicalCase como 6º parâmetro', () => {
  const sigMatch = lightboxSrc.match(/function openImageLightbox\(([^)]*)\)/);
  assert.ok(sigMatch);
  const params = sigMatch[1].split(',').map(p => p.trim());
  assert.equal(params.length, 6);
  assert.equal(params[5], 'resolveClinicalCase');
});

test('2. o host ".lightbox-clinical-host" é inserido ANTES de ".lightbox-stage" no template', () => {
  const hostIdx = lightboxSrc.indexOf('lightbox-clinical-host');
  const stageIdx = lightboxSrc.indexOf('lightbox-stage');
  assert.ok(hostIdx > 0 && stageIdx > hostIdx, 'o host clínico deveria vir antes do stage da imagem');
});

test('3. a descrição inferior (.lightbox-desc) continua existindo e depois do stage, inalterada', () => {
  const stageIdx = lightboxSrc.indexOf('lightbox-stage');
  const descIdx = lightboxSrc.indexOf('class="lightbox-desc"');
  assert.ok(descIdx > stageIdx);
});

test('4. goToLbImage() re-resolve o contexto clínico a cada navegação (não fica preso na imagem de abertura)', () => {
  const start = lightboxSrc.indexOf('function goToLbImage(idx){');
  assert.ok(start >= 0);
  const fnSrc = extractBlock(lightboxSrc, lightboxSrc.indexOf('{', start));
  assert.ok(fnSrc.includes('clinicalBandFor(item)'));
  assert.ok(fnSrc.includes("lbFind('.lightbox-clinical-host')"));
});

test('5. call sites que NÃO passam resolveClinicalCase continuam funcionando sem nenhuma faixa (parâmetro opcional)', () => {
  // outros call sites do projeto (editor, quiz, etc.) chamam openImageLightbox
  // com só 2-4 argumentos — confirma que eles continuam existindo intactos.
  assert.ok(html.includes("openImageLightbox(thumb.src)"));
  assert.ok(html.includes("openImageLightbox(src, img.label)"));
});

/* ===================== clinicalBandFor — lógica pura extraída ===================== */

function loadClinicalBandFor(resolveClinicalCaseImpl, clinicalCaseImageBandHtmlImpl, warnSink) {
  const start = lightboxSrc.indexOf('function clinicalBandFor(item){');
  assert.ok(start >= 0);
  const fnSrc = extractBlock(lightboxSrc, lightboxSrc.indexOf('{', start));
  const ctx = vm.createContext({
    resolveClinicalCase: resolveClinicalCaseImpl,
    clinicalCaseImageBandHtml: clinicalCaseImageBandHtmlImpl,
    console: { warn: (...a) => warnSink.push(a.join(' ')) }
  });
  vm.runInContext('function clinicalBandFor(item)' + fnSrc + '\nthis.clinicalBandFor = clinicalBandFor;', ctx);
  return ctx.clinicalBandFor;
}

test('6. sem resolveClinicalCase (não passado) — devolve sempre "" (call sites antigos nunca mostram faixa)', () => {
  const warns = [];
  const fn = loadClinicalBandFor(undefined, () => '<div>x</div>', warns);
  assert.equal(fn({ data: 'x' }), '');
});

test('7. sem item (navList vazia) — devolve "" mesmo com resolver presente', () => {
  const warns = [];
  const fn = loadClinicalBandFor(() => ({ patientAge: '30' }), (c) => (c ? '<div>x</div>' : ''), warns);
  assert.equal(fn(null), '');
});

test('8. com resolver + item válido — chama clinicalCaseImageBandHtml com o caso resolvido', () => {
  const warns = [];
  let receivedCase = null;
  const fakeCase = { patientAge: '30', patientSex: 'Female' };
  const fn = loadClinicalBandFor(
    (item) => { assert.deepEqual(item, { data: 'img1' }); return fakeCase; },
    (c) => { receivedCase = c; return '<div class="detail-img-clinical-band">ok</div>'; },
    warns
  );
  const out = fn({ data: 'img1' });
  assert.equal(receivedCase, fakeCase);
  assert.equal(out, '<div class="detail-img-clinical-band">ok</div>');
});

test('9. resolver sem caso vinculado (retorna null) — devolve "" via clinicalCaseImageBandHtml(null)', () => {
  const warns = [];
  const fn = loadClinicalBandFor(() => null, (c) => (c ? '<div>x</div>' : ''), warns);
  assert.equal(fn({ data: 'img1' }), '');
});

test('10. erro dentro do resolver nunca propaga — vira "" + console.warn (lightbox nunca quebra por causa disso)', () => {
  const warns = [];
  const fn = loadClinicalBandFor(() => { throw new Error('boom'); }, () => '<div>x</div>', warns);
  const out = fn({ data: 'img1' });
  assert.equal(out, '');
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes('contexto clínico'));
});

/* ===================== zero persistência ===================== */

test('11. a região de openImageLightbox não chama saveData/Firestore/IndexedDB/localStorage', () => {
  const region = stripJsComments(lightboxSrc);
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/indexedDB\.open/i.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
});

test('12. openImageLightbox nunca reatribui DATA nem escreve em clinicalCases/imageRefs', () => {
  const region = stripJsComments(lightboxSrc);
  assert.ok(!/\bDATA\s*=(?!=)/.test(region));
  assert.ok(!/\.clinicalCases\s*=/.test(region));
  assert.ok(!/\.imageRefs\s*=/.test(region));
});
