'use strict';

// LINKS AUTOMÁTICOS DO RADIOPAEDIA EM INGLÊS (reviewId lrev_mul8vsjq_0bfwkd).
// Bug real: o link padrão "Radiopaedia — buscar casos" era montado com
// EN_TERMS[e.name] || e.name — quando o dicionário EN_TERMS não tinha
// tradução curada, o "termo em inglês" virava, em silêncio, o PRÓPRIO nome
// em português, e a URL de busca (que é sempre em inglês) saía errada.
// Fluxo REAL rastreado: bootstrap do SEED (gera o link default de cada
// lesão) -> ensureLinks() (repara lesões sem array de links) -> reparo de
// boot em loadData() (audita/corrige o link automático a cada carregamento,
// só quando não foi editado manualmente). Os três agora usam a MESMA regra
// fail-safe (radiopaediaAutoEnTerm): só existe link automático quando
// EN_TERMS tem entrada real; sem entrada, nada é fabricado com o nome em
// português — o link existente (se houver) é mantido intocado.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) { return source.slice(0, index).split('\n').length; }

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
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

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return {
    source: source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace),
    line: lineNumberAt(source, declaration.index)
  };
}

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/g, '$1');
}

function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start.slice(0, 40));
  return html.slice(a, b);
}

// ===========================================================================
// PURO — radiopaediaSearchUrl / radiopaediaAutoEnTerm / ensureLinks
// ===========================================================================

function loadPure() {
  const src = [
    sliceBetween('const EN_TERMS = {', '\n};') + '\n};',
    extractFunction(html, 'radiopaediaSearchUrl').source,
    extractFunction(html, 'radiopaediaAutoEnTerm').source,
    extractFunction(html, 'isAutoRadiopaediaLink').source,
    extractFunction(html, 'ensureLinks').source
  ].join('\n');
  const ctx = vm.createContext({ console: { warn() {}, log() {}, error() {} } });
  vm.runInContext(src + '\nthis.__api = { EN_TERMS, radiopaediaSearchUrl, radiopaediaAutoEnTerm, isAutoRadiopaediaLink, ensureLinks };', ctx);
  return ctx.__api;
}

test('1. radiopaediaSearchUrl: encoding correto (espaços, hífen, parênteses, acentos)', () => {
  const api = loadPure();
  assert.equal(api.radiopaediaSearchUrl('hepatic hemangioma'), 'https://radiopaedia.org/search?lang=us&q=hepatic%20hemangioma');
  assert.equal(api.radiopaediaSearchUrl('non-Hodgkin lymphoma'), 'https://radiopaedia.org/search?lang=us&q=non-Hodgkin%20lymphoma');
  assert.equal(api.radiopaediaSearchUrl('adenoma (pituitary)'), 'https://radiopaedia.org/search?lang=us&q=adenoma%20(pituitary)');
  assert.equal(api.radiopaediaSearchUrl('Sheehan syndrome postpartum pituitary necrosis'), 'https://radiopaedia.org/search?lang=us&q=Sheehan%20syndrome%20postpartum%20pituitary%20necrosis');
});

test('2. radiopaediaAutoEnTerm: só devolve termo quando EN_TERMS tem entrada real; nunca fabrica a partir do nome', () => {
  const api = loadPure();
  const anyRealName = Object.keys(api.EN_TERMS)[0];
  assert.equal(api.radiopaediaAutoEnTerm(anyRealName), api.EN_TERMS[anyRealName]);
  assert.equal(api.radiopaediaAutoEnTerm('Nome que certamente não existe no dicionário EN_TERMS xyz123'), null);
  assert.equal(api.radiopaediaAutoEnTerm(''), null);
});

test('3. ensureLinks: SEM EN_TERMS real, não cria link (array vazio) — nunca busca em português', () => {
  const api = loadPure();
  const e = { name: 'Nome que certamente não existe no dicionário EN_TERMS xyz123' };
  const links = api.ensureLinks(e);
  // Compara por length/JSON, não deepEqual: array devolvido pelo vm isolado
  // pertence a outro "realm" (mesmo padrão de images-today-modal.test.js).
  assert.equal(links.length, 0);
  assert.equal(JSON.stringify(e.links), '[]');
});

test('4. ensureLinks: COM EN_TERMS real, gera o link automático com o termo em inglês correto', () => {
  const api = loadPure();
  const anyRealName = Object.keys(api.EN_TERMS)[0];
  const e = { name: anyRealName };
  const links = api.ensureLinks(e);
  assert.equal(links.length, 1);
  assert.equal(links[0].label, 'Radiopaedia — buscar casos');
  assert.equal(links[0].url, api.radiopaediaSearchUrl(api.EN_TERMS[anyRealName]));
});

test('5. ensureLinks: não mexe em lesão que já tem array de links (mesmo que outro conteúdo)', () => {
  const api = loadPure();
  const e = { name: 'qualquer', links: [{ label: 'Referência', url: 'https://exemplo.com' }] };
  const links = api.ensureLinks(e);
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://exemplo.com');
});

// ===========================================================================
// SEED — bootstrap real (todo o catálogo), sem fabricar português
// ===========================================================================

function loadSeedApi() {
  const seedSrc = sliceBetween('const SEED = [', '\n];') + '\n];';
  const enSrc = sliceBetween('const EN_TERMS = {', '\n};') + '\n};';
  const forEachBlock = stripJsComments(sliceBetween('SEED.forEach((e,i)=>{', '});')) + '});';
  const src = [
    enSrc, seedSrc,
    extractFunction(html, 'radiopaediaSearchUrl').source,
    extractFunction(html, 'radiopaediaAutoEnTerm').source,
    forEachBlock // o MESMO código real do bootstrap, não uma cópia digitada à mão
  ].join('\n');
  const ctx = vm.createContext({ console: { warn() {}, log() {}, error() {} } });
  vm.runInContext(src + '\nthis.__api = { SEED, EN_TERMS, radiopaediaSearchUrl };', ctx);
  return ctx.__api;
}

test('6. bootstrap real do SEED: literalmente usa radiopaediaAutoEnTerm + fallback [] (não é só um helper isolado — é o código que roda)', () => {
  const block = stripJsComments(sliceBetween('SEED.forEach((e,i)=>{', '});'));
  assert.match(block, /const autoTerm\s*=\s*radiopaediaAutoEnTerm\(e\.name\);/);
  assert.match(block, /e\.links\s*=\s*autoTerm\s*\?\s*\[\{label:"Radiopaedia — buscar casos",\s*url:\s*radiopaediaSearchUrl\(autoTerm\)\}\]\s*:\s*\[\];/);
});

test('7. catálogo inteiro: NENHUMA lesão sem EN_TERMS acaba com link automático usando o próprio nome em português', () => {
  const api = loadSeedApi();
  let withoutTranslation = 0, withTranslation = 0, polluted = [];
  api.SEED.forEach((e) => {
    const hasReal = !!api.EN_TERMS[e.name];
    if (hasReal) {
      withTranslation++;
      assert.equal(e.links.length, 1, e.name);
      assert.equal(e.links[0].url, api.radiopaediaSearchUrl(api.EN_TERMS[e.name]), e.name);
    } else {
      withoutTranslation++;
      // fail-safe: SEM tradução real, o link automático não é criado — nunca
      // com o nome em português como termo de busca em inglês.
      if (e.links.length === 1 && e.links[0].url === api.radiopaediaSearchUrl(e.name)) polluted.push(e.name);
    }
  });
  assert.ok(withoutTranslation > 0, 'sanity: precisa haver lesões sem tradução no catálogo real para este teste valer algo');
  assert.deepEqual(polluted, [], 'nenhuma lesão sem EN_TERMS deveria ter link automático em português');
});

// ===========================================================================
// REPARO DE BOOT (loadData) — audita/corrige só quando é seguro
// ===========================================================================

test('8. loadData: reparo do link automático usa radiopaediaAutoEnTerm (termo real), não EN_TERMS[e.name] || e.name', () => {
  const src = stripJsComments(extractFunction(html, 'loadData').source);
  const idx = src.indexOf('isAutoRadiopaediaLink(e.links[0])');
  assert.notEqual(idx, -1, 'bloco de reparo do link não encontrado em loadData()');
  const nearby = src.slice(idx, idx + 500);
  assert.match(nearby, /const autoTerm\s*=\s*radiopaediaAutoEnTerm\(e\.name\);/);
  assert.match(nearby, /if\(autoTerm\)\{/, 'só corrige quando existe termo real');
  assert.doesNotMatch(nearby.slice(0, nearby.indexOf('if(autoTerm)')), /EN_TERMS\[e\.name\]\s*\|\|\s*e\.name/, 'não deve mais usar o fallback antigo que fabricava português');
});

test('9. loadData: link já editado manualmente (userEdited) NUNCA é tocado pelo reparo automático', () => {
  const src = stripJsComments(extractFunction(html, 'loadData').source);
  const idx = src.indexOf("e.links.length===1 && isAutoRadiopaediaLink(e.links[0])");
  assert.notEqual(idx, -1);
  assert.match(src.slice(idx, idx + 120), /!e\.links\[0\]\.userEdited/);
});

test('10. loadData: mais de 1 link (referências extras adicionadas manualmente) nunca é tocado pelo reparo automático', () => {
  const src = stripJsComments(extractFunction(html, 'loadData').source);
  const idx = src.indexOf("e.links.length===1 && isAutoRadiopaediaLink(e.links[0])");
  assert.notEqual(idx, -1);
  assert.match(src.slice(Math.max(0, idx - 5), idx + 30), /e\.links\.length===1/);
});

// ===========================================================================
// BOTÃO MANUAL DO FORMULÁRIO — sempre pode ser sobrescrito por quem edita,
// prioriza o termo em inglês do campo e AVISA (não fabrica em silêncio)
// ===========================================================================

test('11. openForm: "+ gerar busca no Radiopaedia" prioriza f-en-term; sem ele, avisa em vez de fabricar em silêncio', () => {
  // NÃO usa stripJsComments no openForm inteiro: a função tem dezenas de
  // "https://..." em placeholders/URLs, e o regex ingênuo de comentário de
  // linha ("//") do stripJsComments não é quote-aware — ele confunde essas
  // URLs com comentários e corrompe o texto ao longo de uma função de 1000+
  // linhas. Usa o source bruto (mesmo padrão de modal-cleanup.test.js).
  const src = extractFunction(html, 'openForm').source;
  const idx = src.indexOf("getElementById('f-link-radiopaedia')");
  assert.notEqual(idx, -1);
  const nearby = src.slice(idx, idx + 900);
  assert.match(nearby, /const enTermField\s*=\s*document\.getElementById\('f-en-term'\)\.value\.trim\(\);/);
  assert.match(nearby, /const nm\s*=\s*enTermField\s*\|\|\s*nameField;/);
  assert.match(nearby, /if\(!enTermField\)\{\s*toast\(/, 'avisa quando cai no fallback do nome em português');
});

// ===========================================================================
// MANUAL NUNCA É SOBRESCRITO — outros geradores automáticos não tocam link
// já marcado userEdited (invariante já existente, preservada)
// ===========================================================================

test('12. link manual (userEdited=true) sobrevive intacto ao reparo de boot mesmo com URL "errada" pelo critério automático', () => {
  const api = loadPure();
  const manualLink = { label: 'Radiopaedia — buscar casos', url: 'https://radiopaedia.org/search?lang=us&q=url-escolhida-manualmente', userEdited: true };
  // Simula exatamente a condição de guarda usada em loadData(): só entra no
  // reparo automático quando NÃO é userEdited.
  const shouldAutoRepair = manualLink.userEdited !== true && api.isAutoRadiopaediaLink(manualLink);
  assert.equal(shouldAutoRepair, false);
});
