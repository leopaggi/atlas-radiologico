'use strict';

// lrev — "classificações oficiais recolhidas por padrão": o detalhe da lesão
// (openDetail) mostrava a tabela completa de PI-RADS/ASPECTS/AAST/etc. (via
// renderClassificationBox, chamada só quando e.classification aponta para um
// CLASSIFICATION_SYSTEMS válido) sempre totalmente aberta, poluindo a visão
// panorâmica. Esta suíte prova que renderClassificationBox passou a envolver
// o MESMO conteúdo (label + tabela, sem nenhuma mudança de texto/itens/links)
// num <details><summary> nativo — recolhido por padrão, igual ao padrão já
// usado por radiologicSignsSectionHtml/classificationSchemesSectionHtml
// (.didactic-block). Nenhum teste toca DATA/SEED/Firestore/IndexedDB/
// localStorage reais, nem chama saveData().

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
function extractConstObject(name) {
  const declaration = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\{`).exec(html);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  const openingBrace = html.lastIndexOf('{', declaration.index + declaration[0].length) === (declaration.index + declaration[0].length - 1)
    ? declaration.index + declaration[0].length - 1
    : html.indexOf('{', declaration.index);
  return `const ${name} = ` + extractBlock(html, openingBrace) + ';';
}

const RENDER_SRC = extractFunction('renderClassificationBox');
const SYSTEMS_SRC = extractConstObject('CLASSIFICATION_SYSTEMS');

function loadApi() {
  const ctx = vm.createContext({ console });
  vm.runInContext(SYSTEMS_SRC + '\n' + RENDER_SRC + '\nthis.__api = { renderClassificationBox, CLASSIFICATION_SYSTEMS };', ctx);
  return ctx.__api;
}

/* ===================== 1. auditoria do componente real ===================== */

test('1. call site real: openDetail só chama renderClassificationBox quando e.classification aponta para um sistema válido', () => {
  assert.match(
    html.slice(html.indexOf('function openDetail('), html.indexOf('function openDetail(') + 20000),
    /\$\{e\.classification && CLASSIFICATION_SYSTEMS\[e\.classification\] \? renderClassificationBox\(e\.classification\) : ''\}/
  );
});

test('2. renderClassificationBox agora devolve um <details> (nativo, sem JS de toggle manual)', () => {
  assert.match(RENDER_SRC, /return `<details class="didactic-block">/);
  assert.doesNotMatch(RENDER_SRC, /addEventListener\(['"]click['"]/, 'nenhum toggle manual via JS — <details> nativo cuida disso');
});

/* ===================== 2. comportamento real, exemplos reais ===================== */

test('3. PI-RADS: summary discreto com o nome real do sistema, conteúdo completo preservado dentro', () => {
  const { renderClassificationBox } = loadApi();
  const out = renderClassificationBox('PIRADS');
  assert.match(out, /^<details class="didactic-block">/);
  assert.match(out, /<summary>PI-RADS v2\.1 — próstata \(RM\)<\/summary>/);
  assert.ok(out.includes('CLASSIFICAÇÃO OFICIAL — PI-RADS v2.1 — próstata (RM)'), 'label interno inalterado');
  assert.ok(out.includes('class-table'), 'tabela completa continua presente dentro do details');
  assert.ok(out.trim().endsWith('</details>'));
});

test('4. ASPECTS: mesmo padrão, conteúdo (categorias/descrições) idêntico ao original', () => {
  const { renderClassificationBox, CLASSIFICATION_SYSTEMS } = loadApi();
  const out = renderClassificationBox('ASPECTS');
  assert.match(out, /<summary>ASPECTS — AVC isquêmico agudo \(TC sem contraste\)<\/summary>/);
  CLASSIFICATION_SYSTEMS.ASPECTS.categories.forEach(c => {
    assert.ok(out.includes(c.code), `código ${c.code} presente`);
    assert.ok(out.includes(c.label), `label ${c.label} presente`);
    assert.ok(out.includes(c.desc), `descrição de ${c.code} presente, sem truncar`);
  });
});

test('5. AAST (trauma esplênico): mesmo padrão, independente de outros sistemas', () => {
  const { renderClassificationBox } = loadApi();
  const out = renderClassificationBox('AAST_SPLEEN');
  assert.match(out, /<summary>AAST — trauma esplênico \(rev\. 2018\)<\/summary>/);
  assert.ok(out.includes('CLASSIFICAÇÃO OFICIAL — AAST — trauma esplênico (rev. 2018)'));
});

test('6. recolhido por padrão: nenhum <details> sai com o atributo "open" (sem memorizar estado nesta versão)', () => {
  const { renderClassificationBox } = loadApi();
  ['PIRADS', 'ASPECTS', 'AAST_SPLEEN', 'BIRADS', 'LIRADS'].forEach(key => {
    const out = renderClassificationBox(key);
    assert.doesNotMatch(out, /<details[^>]*\bopen\b/, `${key} não deveria vir expandido por padrão`);
  });
});

test('7. lesão sem classificação válida -> renderClassificationBox devolve string vazia (nada aparece)', () => {
  const { renderClassificationBox } = loadApi();
  assert.equal(renderClassificationBox(undefined), '');
  assert.equal(renderClassificationBox(''), '');
  assert.equal(renderClassificationBox('SISTEMA_INEXISTENTE'), '');
});

test('8. múltiplas lesões/sistemas resolvem de forma independente (cada chamada é pura, sem estado compartilhado)', () => {
  const { renderClassificationBox } = loadApi();
  const piradsOut = renderClassificationBox('PIRADS');
  const aspectsOut = renderClassificationBox('ASPECTS');
  assert.notEqual(piradsOut, aspectsOut);
  assert.ok(!aspectsOut.includes('PI-RADS'), 'ASPECTS não herda nada de PIRADS');
  assert.ok(!piradsOut.includes('ASPECTS'), 'PIRADS não herda nada de ASPECTS');
  // chamar de novo na mesma ordem dá exatamente o mesmo resultado (idempotente)
  assert.equal(renderClassificationBox('PIRADS'), piradsOut);
});

/* ===================== 3. zero efeito colateral / fora de escopo ===================== */

test('9. renderClassificationBox nunca referencia saveData/Firestore/localStorage/DATA', () => {
  assert.ok(!/saveData\s*\(|firebase\.firestore|fbDb\.|localStorage\.(setItem|removeItem)|\bDATA\b/.test(RENDER_SRC));
});

test('10. classificationSchemesSectionHtml / radiologicSignsSectionHtml (sinais, esquemas didáticos) não foram tocados por esta mudança', () => {
  const schemesFn = extractFunction('classificationSchemesSectionHtml');
  const signsFn = extractFunction('radiologicSignsSectionHtml');
  assert.doesNotMatch(schemesFn, /didactic-block">\s*<summary>\$\{sys/);
  assert.match(schemesFn, /Classificações e esquemas \(/);
  assert.match(signsFn, /Sinais radiológicos \(/);
});

test('11. lightbox/editor/Quiz não referenciam renderClassificationBox (fora de escopo desta entrega)', () => {
  const lightboxFn = extractFunction('openImageLightbox');
  assert.doesNotMatch(lightboxFn, /renderClassificationBox/);
});
