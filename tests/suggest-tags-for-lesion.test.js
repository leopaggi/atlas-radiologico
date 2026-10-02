'use strict';

// TAXO-05 — testes de suggestTagsForLesion(entry, catalog), a camada de
// sugestão de tags LOCAL/determinística (reaproveita a mesma técnica já em
// produção para importação do Radiopaedia — canonicalTagVocabulary +
// tokenizeExternalTitle). Mesmo padrão de extração+vm das demais suítes:
// extrai as funções REAIS de index.html e roda isolado. Pura: nunca muta
// `entry`/`catalog`, nunca persiste nada, nunca inventa um tag fora do
// vocabulário já usado no catálogo.

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

function loadApi() {
  const src = [
    extractConst('EXTERNAL_IMPORT_STOPWORDS'),
    extractFunction('normalizeExternalTitle'),
    extractFunction('tokenizeExternalTitle'),
    extractFunction('canonicalTagVocabulary'),
    extractConst('SUGGEST_TAGS_MAX'),
    extractFunction('suggestTagsForLesion')
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { suggestTagsForLesion };', ctx);
  return ctx.__api;
}

function makeCatalog() {
  return [
    { id: 'a', name: 'Hemangioma hepático', s: 'Abdômen Superior', site: 'Fígado', notes: '', tags: ['realce homogêneo', 'bem circunscrita', 'hipervascular'] },
    { id: 'b', name: 'Cisto ósseo simples', s: 'Musculoesquelético', site: 'Úmero proximal', notes: '', tags: ['lítica', 'idade pediátrica', 'bem circunscrita'] },
    { id: 'c', name: 'Osteocondroma', s: 'Musculoesquelético', site: 'Fêmur distal', notes: '', tags: ['matriz condroide', 'idade pediátrica'] },
    { id: 'd', name: 'Abscesso hepático', s: 'Abdômen Superior', site: 'Fígado', notes: '', tags: ['margens mal definidas', 'realce em anel', 'infeccioso'] }
  ];
}

test('1. sugere tags do vocabulário existente quando o texto da lesão bate com elas', () => {
  const api = loadApi();
  const entry = { name: 'Hemangioma hepático cavernoso', s: 'Abdômen Superior', site: 'Fígado', notes: 'Lesão bem circunscrita, hipervascular, com realce homogêneo.', tags: [] };
  const out = api.suggestTagsForLesion(entry, makeCatalog());
  assert.ok(out.includes('bem circunscrita'));
  assert.ok(out.includes('hipervascular'));
  assert.ok(out.includes('realce homogêneo'));
});

test('2. nunca inventa uma tag fora do vocabulário do catálogo', () => {
  const api = loadApi();
  const entry = { name: 'Lesão totalmente nova e inédita xyzabc', s: 'Seção Nova', site: 'Sítio Novo', notes: 'nada em comum com o catálogo', tags: [] };
  const out = api.suggestTagsForLesion(entry, makeCatalog());
  const vocabTags = new Set();
  makeCatalog().forEach(e => e.tags.forEach(t => vocabTags.add(t)));
  out.forEach(t => assert.ok(vocabTags.has(t), 'sugeriu um tag fora do vocabulário: ' + t));
});

test('3. tags já existentes na lesão NUNCA são sugeridas de novo (sem duplicata)', () => {
  const api = loadApi();
  const entry = { name: 'Hemangioma hepático cavernoso', s: 'Abdômen Superior', site: 'Fígado', notes: 'bem circunscrita, hipervascular, com realce homogêneo.', tags: ['bem circunscrita'] };
  const out = api.suggestTagsForLesion(entry, makeCatalog());
  assert.ok(!out.includes('bem circunscrita'));
  assert.ok(out.includes('hipervascular'));
});

test('4. nenhuma duplicata dentro da própria lista de sugestões', () => {
  const api = loadApi();
  const entry = { name: 'Cisto ósseo bem circunscrito bem circunscrito', s: 'Musculoesquelético', site: 'Úmero proximal', notes: 'idade pediátrica idade pediátrica', tags: [] };
  const out = api.suggestTagsForLesion(entry, makeCatalog());
  assert.equal(out.length, new Set(out).size);
});

test('5. sem nenhum texto preenchido (nome/seção/sítio/notas vazios), não sugere nada', () => {
  const api = loadApi();
  const entry = { name: '', s: '', site: '', notes: '', tags: [] };
  // deepEqual([], []) cruza a fronteira do vm context (Array de outro realm)
  // e falha por prototype mismatch — comparar por length é equivalente e robusto.
  assert.equal(api.suggestTagsForLesion(entry, makeCatalog()).length, 0);
});

test('6. catálogo vazio não sugere nada (sem vocabulário, sem sugestão)', () => {
  const api = loadApi();
  const entry = { name: 'Hemangioma hepático', s: 'Abdômen Superior', site: 'Fígado', notes: '', tags: [] };
  assert.equal(api.suggestTagsForLesion(entry, []).length, 0);
});

test('7. entry/catalog nunca são mutados', () => {
  const api = loadApi();
  const entry = { name: 'Hemangioma hepático cavernoso', s: 'Abdômen Superior', site: 'Fígado', notes: 'bem circunscrita, hipervascular', tags: [] };
  const catalog = makeCatalog();
  const entrySnapshot = JSON.stringify(entry);
  const catalogSnapshot = JSON.stringify(catalog);
  api.suggestTagsForLesion(entry, catalog);
  assert.equal(JSON.stringify(entry), entrySnapshot);
  assert.equal(JSON.stringify(catalog), catalogSnapshot);
});

test('8. determinístico: a mesma entrada produz sempre a mesma saída', () => {
  const api = loadApi();
  const entry = { name: 'Cisto ósseo simples', s: 'Musculoesquelético', site: 'Úmero proximal', notes: 'lesão lítica em paciente de idade pediátrica', tags: [] };
  const out1 = api.suggestTagsForLesion(entry, makeCatalog());
  const out2 = api.suggestTagsForLesion(entry, makeCatalog());
  assert.deepEqual(out1, out2);
});

test('9. nunca sugere mais que SUGGEST_TAGS_MAX itens', () => {
  const api = loadApi();
  const bigCatalog = makeCatalog();
  for (let i = 0; i < 20; i++) bigCatalog.push({ id: 'extra' + i, name: 'x', s: 'x', site: 'x', notes: '', tags: ['palavra' + i] });
  const entry = { name: Array.from({ length: 20 }, (_, i) => 'palavra' + i).join(' '), s: '', site: '', notes: '', tags: [] };
  const out = api.suggestTagsForLesion(entry, bigCatalog);
  assert.ok(out.length <= 10);
});

test('10. não muta/depende de DATA global, SEED, localStorage, Firestore ou IndexedDB', () => {
  const src = stripJsComments(extractFunction('suggestTagsForLesion') + '\n' + extractFunction('canonicalTagVocabulary'));
  assert.ok(!/\bwindow\.DATA\b/.test(src));
  assert.ok(!/(^|[^.\w])DATA\s*[.\[]/.test(src));
  assert.ok(!/\bSEED\b/.test(src));
  assert.ok(!/localStorage\./.test(src));
  assert.ok(!/firestore|firebase/i.test(src));
  assert.ok(!/indexedDB/i.test(src));
  assert.ok(!/saveData\s*\(/.test(src));
});

test('11. nenhuma chamada a saveData() em toda a vizinhança de wiring do formulário (renderSmartSuggestions)', () => {
  const start = html.indexOf('function renderSmartSuggestions(){');
  assert.ok(start >= 0);
  const end = html.indexOf("renderChips(); renderSuggest(); renderSmartSuggestions();", start);
  assert.ok(end > start);
  const region = stripJsComments(html.slice(start, end));
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
});

test('12. renderSmartSuggestions só adiciona tags via addTag() (mesmo caminho manual de sempre) e só por clique explícito — nunca automaticamente', () => {
  const start = html.indexOf('function renderSmartSuggestions(){');
  const end = html.indexOf('renderChips(); renderSuggest(); renderSmartSuggestions();', start);
  const region = html.slice(start, end);
  assert.ok(/s\.onclick\s*=\s*\(\)\s*=>\s*addTag\(t\)/.test(region));
  assert.ok(!/addTag\(t\);(?![^}]*onclick)/s.test(region.replace(/s\.onclick[\s\S]*?addTag\(t\);/, ''))); // fora do onclick, addTag nunca é chamado sozinho
});

test('13. o bloco de sugestões só aparece para lesão NOVA (existing), nunca em edição', () => {
  const start = html.indexOf('function renderSmartSuggestions(){');
  const end = html.indexOf('renderChips(); renderSuggest(); renderSmartSuggestions();', start);
  const region = html.slice(start, end);
  assert.ok(/if\(existing\)\{\s*wrap\.hidden\s*=\s*true;\s*return;\s*\}/.test(region));
});

test('extra — exemplo real: lesão hepática sugere achados radiológicos e demográficos coerentes', () => {
  const api = loadApi();
  const entry = { name: 'Abscesso hepático piogênico', s: 'Abdômen Superior', site: 'Fígado', notes: 'Coleção com margens mal definidas e realce em anel, contexto infeccioso.', tags: [] };
  const out = api.suggestTagsForLesion(entry, makeCatalog());
  assert.ok(out.includes('margens mal definidas'));
  assert.ok(out.includes('realce em anel'));
  assert.ok(out.includes('infeccioso'));
});
