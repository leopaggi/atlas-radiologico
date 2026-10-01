'use strict';

// TAXO-02 — Painel mestre da taxonomia clínico-radiológica (somente leitura).
// Mesmo padrão dos demais testes deste projeto: extrai as funções REAIS do
// index.html e roda num `vm` isolado (ver tests/site-taxonomy.test.js para o
// precedente). Nenhum destes testes toca DATA/SEED/Firestore/IndexedDB/
// localStorage reais — tudo roda sobre o TAXONOMY.json real do repositório,
// lido só para leitura.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const TAXONOMY_PATH = path.resolve(__dirname, '..', 'TAXONOMY.json');
const REAL_TAXONOMY = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));

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
  return { source: source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace) };
}

function extractConst(source, name) {
  const declaration = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  const semi = source.indexOf(';', declaration.index);
  return source.slice(declaration.index, semi + 1);
}

function extractMarkerBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
}

function loadPureTaxo() {
  const src = [
    extractFunction(html, 'escAttr').source,
    extractFunction(html, 'esc').source,
    extractFunction(html, 'taxoNormalizeText').source,
    extractFunction(html, 'taxoBuildIndices').source,
    extractFunction(html, 'taxoSearch').source,
    extractFunction(html, 'taxoRunIntegrityAudit').source,
    extractFunction(html, 'taxoQualifierCount').source,
    extractFunction(html, 'taxoComputeMetrics').source,
    extractFunction(html, 'taxoApplyConceptFilters').source,
    extractFunction(html, 'taxoRenderGroupsTab').source,
    extractFunction(html, 'taxoRenderRelationsTab').source,
    extractFunction(html, 'taxoRenderSynonymsTab').source,
    extractFunction(html, 'taxoRenderCoverageTab').source,
    extractFunction(html, 'taxoRenderIntegrityTab').source,
    extractConst(html, 'TAXO_TABS'),
    extractFunction(html, 'taxoTabsHtml').source,
    extractFunction(html, 'taxoMetricsHtml').source
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { taxoNormalizeText, taxoBuildIndices, taxoSearch, taxoRunIntegrityAudit, taxoQualifierCount, taxoComputeMetrics, taxoApplyConceptFilters, taxoRenderGroupsTab, taxoRenderRelationsTab, taxoRenderSynonymsTab, taxoRenderCoverageTab, taxoRenderIntegrityTab, taxoTabsHtml, taxoMetricsHtml };', ctx);
  return ctx.__api;
}

function loadTaxoLoader(fetchImpl) {
  const src = [
    extractConst(html, 'TAXONOMY_CACHE'),
    extractConst(html, 'TAXONOMY_LOAD_PROMISE'),
    extractConst(html, 'TAXONOMY_CACHE_BUST'),
    extractFunction(html, 'loadTaxonomy').source
  ].join('\n');
  const ctx = vm.createContext({ fetch: fetchImpl, console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__loadTaxonomy = loadTaxonomy; this.__getCache = function(){ return TAXONOMY_CACHE; };', ctx);
  return { loadTaxonomy: ctx.__loadTaxonomy, getCache: ctx.__getCache };
}

const api = loadPureTaxo();
const REAL_INDICES = api.taxoBuildIndices(REAL_TAXONOMY);

// ===========================================================================
// 1/2. LOADER — carrega TAXONOMY.json / fallback se o fetch falha
// ===========================================================================

test('1. loadTaxonomy() resolve com o objeto devolvido pelo fetch (groups/concepts)', async () => {
  let calls = 0;
  const loader = loadTaxoLoader(async (url) => {
    calls += 1;
    assert.match(url, /^TAXONOMY\.json\?v=/, 'usa cache-busting por query string');
    return { ok: true, json: async () => REAL_TAXONOMY };
  });
  const t = await loader.loadTaxonomy();
  assert.equal(t.groups.length, 33);
  assert.equal(t.concepts.length, 194);
  assert.equal(calls, 1);
});

test('1b. loadTaxonomy() carrega UMA ÚNICA VEZ por sessão — chamadas repetidas não refazem o fetch', async () => {
  let calls = 0;
  const loader = loadTaxoLoader(async () => { calls += 1; return { ok: true, json: async () => REAL_TAXONOMY }; });
  await loader.loadTaxonomy();
  await loader.loadTaxonomy();
  await loader.loadTaxonomy();
  assert.equal(calls, 1, 'cache em memória evita refazer o fetch');
});

test('1c. loadTaxonomy() também deduplica chamadas CONCORRENTES (mesma promise em voo)', async () => {
  let calls = 0;
  const loader = loadTaxoLoader(async () => { calls += 1; await new Promise(r => setTimeout(r, 5)); return { ok: true, json: async () => REAL_TAXONOMY }; });
  const [a, b] = await Promise.all([loader.loadTaxonomy(), loader.loadTaxonomy()]);
  assert.equal(calls, 1);
  assert.equal(a.concepts.length, b.concepts.length);
});

test('2. fallback: fetch com HTTP não-ok rejeita a promise sem lançar exceção não tratada', async () => {
  const loader = loadTaxoLoader(async () => ({ ok: false, status: 404, json: async () => { throw new Error('não deveria chamar json()'); } }));
  await assert.rejects(() => loader.loadTaxonomy(), /HTTP 404/);
  assert.equal(loader.getCache(), null, 'nada fica em cache quando o fetch falha');
});

test('2b. fallback: erro de rede (fetch rejeita) também rejeita loadTaxonomy(), e uma nova tentativa depois refaz o fetch', async () => {
  let calls = 0;
  const loader = loadTaxoLoader(async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    return { ok: true, json: async () => REAL_TAXONOMY };
  });
  await assert.rejects(() => loader.loadTaxonomy(), /network down/);
  assert.equal(loader.getCache(), null);
  const t = await loader.loadTaxonomy(); // nova tentativa, depois da falha
  assert.equal(t.concepts.length, 194);
  assert.equal(calls, 2, 'depois de uma falha, a próxima chamada tenta de novo (não fica travado em erro)');
});

test('2c. fallback: JSON com formato inesperado (sem groups/concepts) é rejeitado explicitamente', async () => {
  const loader = loadTaxoLoader(async () => ({ ok: true, json: async () => ({ foo: 'bar' }) }));
  await assert.rejects(() => loader.loadTaxonomy(), /formato inesperado/);
});

test('2d (estático). taxoMountPanel mostra erro amigável no catch e não propaga — resto do Atlas continua intacto', () => {
  const src = extractFunction(html, 'taxoMountPanel').source;
  assert.match(src, /catch\s*\(err\)\s*\{/);
  assert.match(src, /O restante do Atlas continua funcionando normalmente/);
  assert.match(src, /return;/, 'retorna cedo no erro, sem seguir tentando montar o resto do painel');
});

// ===========================================================================
// 3/4/5. ÍNDICES EM MEMÓRIA
// ===========================================================================

test('3. conceptById indexa todos os 194 concepts, cada um recuperável pelo próprio id', () => {
  const idx = api.taxoBuildIndices(REAL_TAXONOMY);
  assert.equal(idx.conceptById.size, 194);
  assert.equal(idx.conceptById.get('rad_enh_ring').label, 'realce anelar');
});

test('4. groupById indexa todos os 33 groups', () => {
  const idx = api.taxoBuildIndices(REAL_TAXONOMY);
  assert.equal(idx.groupById.size, 33);
  assert.equal(idx.groupById.get('radiologic.laterality').exclusive, true);
});

test('5. conceptsByGroup agrupa corretamente (clinical.symptoms tem 59 concepts)', () => {
  const idx = api.taxoBuildIndices(REAL_TAXONOMY);
  assert.equal(idx.conceptsByGroup.get('clinical.symptoms').length, 59);
  assert.equal(idx.conceptsByGroup.get('clinical.chestPainQualifiers').length, 4);
  assert.equal(idx.conceptsByGroup.get('clinical.abdominalPainLocation').length, 10);
});

test('conceptsByDomain agrupa corretamente (clinical/radiologic/etiology/demographics)', () => {
  const idx = api.taxoBuildIndices(REAL_TAXONOMY);
  assert.equal(idx.conceptsByDomain.get('clinical').length, 99);
  assert.equal(idx.conceptsByDomain.get('radiologic').length, 75);
  assert.equal(idx.conceptsByDomain.get('etiology').length, 12);
  assert.equal(idx.conceptsByDomain.get('demographics').length, 8);
});

// ===========================================================================
// 6/7/8/9. BUSCA
// ===========================================================================

test('6. busca por label encontra o concept ("realce anelar" -> rad_enh_ring)', () => {
  const r = api.taxoSearch(REAL_TAXONOMY, 'realce anelar');
  assert.ok(r.some(c => c.id === 'rad_enh_ring'));
});

test('7. busca por synonym encontra o concept canônico ("realce em anel" -> rad_enh_ring, label "realce anelar")', () => {
  const r = api.taxoSearch(REAL_TAXONOMY, 'realce em anel');
  assert.ok(r.some(c => c.id === 'rad_enh_ring' && c.label === 'realce anelar'));
});

test('8. busca por conceptId encontra o próprio concept ("rad_enh_ring")', () => {
  const r = api.taxoSearch(REAL_TAXONOMY, 'rad_enh_ring');
  assert.ok(r.some(c => c.id === 'rad_enh_ring'));
});

test('9. busca por description encontra o concept (trecho de uma description real)', () => {
  const withDesc = REAL_TAXONOMY.concepts.find(c => c.id === 'rad_comp_complex_cyst');
  const snippet = withDesc.description.slice(0, 20);
  const r = api.taxoSearch(REAL_TAXONOMY, snippet);
  assert.ok(r.some(c => c.id === 'rad_comp_complex_cyst'));
});

test('busca "hemorr" encontra os 3 membros da família hemorrágica, em domains diferentes', () => {
  const r = api.taxoSearch(REAL_TAXONOMY, 'hemorr').map(c => c.id);
  assert.ok(r.includes('rad_comp_hemorrhagic'));
  assert.ok(r.includes('rad_assoc_hemorrhage'));
  assert.ok(r.includes('etio_hemorrhagic'));
});

test('busca vazia não devolve nada (evita listar tudo à toa como "resultado de busca")', () => {
  // JSON.stringify em vez de deepEqual: o array devolvido pertence ao realm
  // isolado do `vm` — estruturalmente igual a [], mas deepStrictEqual rejeita
  // por reference-equality de protótipo entre realms diferentes (mesmo
  // padrão de tests/site-taxonomy.test.js).
  assert.equal(JSON.stringify(api.taxoSearch(REAL_TAXONOMY, '')), '[]');
  assert.equal(JSON.stringify(api.taxoSearch(REAL_TAXONOMY, '   ')), '[]');
});

// ===========================================================================
// 10/11/12. FILTROS (aba Conceitos)
// ===========================================================================

test('10. filtro por domain (etiology) devolve só os 12 concepts de etiology', () => {
  const state = { search: '', filters: { domain: 'etiology', group: '', subgroup: '', status: '', hasSynonym: '', hasDescription: '' } };
  const list = api.taxoApplyConceptFilters(REAL_TAXONOMY, state);
  assert.equal(list.length, 12);
  assert.ok(list.every(c => c.domain === 'etiology'));
});

test('11. filtro por group (clinical.chestPainQualifiers) devolve só os 4 qualifiers de dor torácica', () => {
  const state = { search: '', filters: { domain: '', group: 'clinical.chestPainQualifiers', subgroup: '', status: '', hasSynonym: '', hasDescription: '' } };
  const list = api.taxoApplyConceptFilters(REAL_TAXONOMY, state);
  assert.equal(list.length, 4);
  assert.ok(list.every(c => c.group === 'clinical.chestPainQualifiers'));
});

test('12. filtro por subgroup (otolaryngologic) devolve só concepts que incluem esse subgroup', () => {
  const state = { search: '', filters: { domain: '', group: '', subgroup: 'otolaryngologic', status: '', hasSynonym: '', hasDescription: '' } };
  const list = api.taxoApplyConceptFilters(REAL_TAXONOMY, state);
  assert.ok(list.length > 0);
  assert.ok(list.every(c => (c.subgroups || []).includes('otolaryngologic')));
});

test('filtros combinados (domain + hasDescription=yes) aplicam AND, não OR', () => {
  const state = { search: '', filters: { domain: 'radiologic', group: '', subgroup: '', status: '', hasSynonym: '', hasDescription: 'yes' } };
  const list = api.taxoApplyConceptFilters(REAL_TAXONOMY, state);
  assert.ok(list.length > 0);
  assert.ok(list.every(c => c.domain === 'radiologic' && !!c.description));
});

// ===========================================================================
// 13. DETALHE DO CONCEITO (estático — openTaxoConceptDetailModal monta DOM via overlay)
// ===========================================================================

test('13. openTaxoConceptDetailModal exibe todos os campos pedidos (estático: presença dos rótulos na função real)', () => {
  const src = extractFunction(html, 'openTaxoConceptDetailModal').source;
  ['domain', 'group', 'subgroups', 'status', 'synonyms', 'description', 'parentId', 'aliasOf', 'conflictsWith', 'relatedTo', 'oftenAssociatedWith', 'differentialOf', 'applicableSections']
    .forEach(field => assert.match(src, new RegExp(`row\\('${field}`), `campo "${field}" deveria aparecer no detalhe`));
  assert.match(src, /deprecated → aliasOf/, 'deprecated mostra claramente o aliasOf, conforme pedido');
  assert.doesNotMatch(src, /<button[^>]*>\s*editar/i, 'nenhum botão de editar nesta fase');
});

// ===========================================================================
// 14/15. ABA GRUPOS — exclusive / allowMultipleInstances
// ===========================================================================

test('14. aba Grupos exibe "exclusive" de cada group (sim para laterality, não para position)', () => {
  const html2 = api.taxoRenderGroupsTab(REAL_TAXONOMY, REAL_INDICES);
  assert.match(html2, /radiologic\.laterality[\s\S]*?exclusive: sim/);
  assert.match(html2, /radiologic\.position[\s\S]*?exclusive: não/);
});

test('15. aba Grupos exibe "allowMultipleInstances" de cada group (todos "não" na V1)', () => {
  const html2 = api.taxoRenderGroupsTab(REAL_TAXONOMY, REAL_INDICES);
  const matches = html2.match(/allowMultipleInstances: (sim|não)/g);
  assert.equal(matches.length, 33);
  assert.ok(matches.every(m => m === 'allowMultipleInstances: não'), 'default false em todos os groups da V1 (seção 6/9 do documento)');
});

// ===========================================================================
// 16. conflictsWith renderizado
// ===========================================================================

test('16. aba Relações lista os concepts com conflictsWith, incluindo clin_loc_diffuse_abdominal', () => {
  const html2 = api.taxoRenderRelationsTab(REAL_TAXONOMY);
  assert.match(html2, /conflictsWith \(10\)/);
  assert.match(html2, /clin_loc_diffuse_abdominal[\s\S]{0,400}⇎/);
});

// ===========================================================================
// 17. INTEGRITY AUDIT — PASS no TAXONOMY.json atual
// ===========================================================================

test('17. taxoRunIntegrityAudit() não encontra NENHUM problema na baseline aprovada atual', () => {
  const issues = api.taxoRunIntegrityAudit(REAL_TAXONOMY);
  assert.equal(JSON.stringify(issues), '[]', 'baseline aprovada deveria estar 100% íntegra: ' + JSON.stringify(issues));
});

test('integrity audit PEGA um problema introduzido de propósito (conceptId duplicado)', () => {
  const broken = JSON.parse(JSON.stringify(REAL_TAXONOMY));
  broken.concepts.push({ ...broken.concepts[0] });
  const issues = api.taxoRunIntegrityAudit(broken);
  assert.ok(issues.some(i => i.level === 'erro' && /duplicado/.test(i.message)));
});

test('integrity audit PEGA conflictsWith assimétrico introduzido de propósito', () => {
  const broken = JSON.parse(JSON.stringify(REAL_TAXONOMY));
  const c = broken.concepts.find(x => x.id === 'clin_loc_fid');
  c.conflictsWith = []; // quebra a simetria com clin_loc_diffuse_abdominal
  const issues = api.taxoRunIntegrityAudit(broken);
  assert.ok(issues.some(i => i.level === 'erro' && /assimétrico/.test(i.message)));
});

test('integrity audit avisa (não erro) se status não for "approved" ou contagens divergirem da baseline', () => {
  const draftLike = JSON.parse(JSON.stringify(REAL_TAXONOMY));
  draftLike.metadata.status = 'draft';
  const issues = api.taxoRunIntegrityAudit(draftLike);
  assert.ok(issues.some(i => i.level === 'aviso' && /approved/.test(i.message)));
});

// ===========================================================================
// 18/19/20. O PAINEL NÃO TOCA DATA / NÃO CHAMA saveData() / NÃO TOCA FIRESTORE
// ===========================================================================

const TAXO_BLOCK = extractMarkerBlock(
  html,
  '/* ===================== TAXO-02 — Painel mestre da taxonomia clínico-radiológica (somente leitura) =====================',
  "async function openTagAuditModal(){"
);

test('18. o bloco inteiro do painel (loader + índices + UI) nunca USA as variáveis globais DATA/SEED como código', () => {
  // Checa uso real como identificador de código (DATA.algo / DATA[i] / DATA =
  // / SEED.algo / SEED[i]), não a palavra solta — o próprio texto da UI e os
  // comentários do painel mencionam "DATA/SEED" em prosa várias vezes
  // justamente para dizer que NÃO são tocados (ex.: título do botão, modal-sub,
  // cabeçalho do bloco), o que é o comportamento correto, não uma violação.
  assert.doesNotMatch(TAXO_BLOCK, /\bDATA\s*[.\[=]/, 'painel somente leitura não deveria tocar a variável global DATA como código');
  assert.doesNotMatch(TAXO_BLOCK, /\bSEED\s*[.\[=]/, 'painel não deveria depender de SEED como código');
});

test('19. o bloco inteiro do painel nunca chama saveData()', () => {
  assert.doesNotMatch(TAXO_BLOCK, /saveData\s*\(/);
});

test('20. o bloco inteiro do painel nunca CHAMA nenhuma função/API real de Firestore/sync ou escreve em localStorage/IndexedDB', () => {
  // Checa chamadas/identificadores de API real, não a palavra "Firestore" em
  // si — o próprio texto da UI/comentários do painel MENCIONA Firestore
  // várias vezes para dizer explicitamente que ele não é tocado (ex.: "não
  // altera lesões, DATA, SEED, Firestore, IndexedDB ou localStorage" no
  // modal-sub), o que é o comportamento correto, não uma violação.
  assert.doesNotMatch(TAXO_BLOCK, /pushToFirebaseNow|writeShardedStateSerialized|reconcileBeforePush|markSyncDirty/);
  assert.doesNotMatch(TAXO_BLOCK, /localStorage\.(setItem|removeItem)/);
  assert.doesNotMatch(TAXO_BLOCK, /\bstorage\.(set|delete)\(/, 'não grava no IndexedDB (storage.set/delete) — só fetch de um arquivo estático');
});

test('o único I/O do painel é fetch(\'TAXONOMY.json...\') — nenhum outro endpoint/arquivo é lido', () => {
  const fetchCalls = TAXO_BLOCK.match(/fetch\([^)]*\)/g) || [];
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /^fetch\('TAXONOMY\.json/);
});

// ===========================================================================
// 16 (wiring). Botão em "Ferramentas avançadas" abre o painel, nada mais
// ===========================================================================

test('botão "Taxonomia clínico-radiológica" existe em Ferramentas avançadas e só abre o painel', () => {
  assert.match(html, /id="btn-taxonomy-panel"[^>]*>🧬 Taxonomia clínico-radiológica/);
  assert.match(html, /document\.getElementById\('btn-taxonomy-panel'\)\.onclick = openTaxonomyPanel;/);
});

test('openTaxonomyPanel() não recebe parâmetros de lesão/edição (é sempre o mesmo painel global, não contextual)', () => {
  const src = extractFunction(html, 'openTaxonomyPanel').source;
  assert.match(src, /^function openTaxonomyPanel\(\)\s*\{/);
});
