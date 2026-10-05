'use strict';

// TAXO-04 FASE 2 — testes da fila de revisão somente leitura
// (reviewQueueApplyFilters + TAXO04_REVIEW_QUEUE.json), mantida sem
// alterações nesta rodada. Também confirma que a exibição de attributes no
// detalhe da lesão foi REMOVIDA (mudança de prioridade de UX: o detalhe
// voltou ao layout simples original; attributes continuam só como camada
// interna — ver TAXO04_FINAL_MIGRATION_REPORT.md). Mesmo padrão de
// extração+vm usado em tests/taxonomy-panel.test.js: extrai as funções
// REAIS de index.html e roda isolado. Nenhum destes testes toca DATA/SEED/
// Firestore/IndexedDB/localStorage reais, nem chama saveData().

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const REVIEW_QUEUE_PATH = path.resolve(__dirname, '..', 'TAXO04_REVIEW_QUEUE.json');

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

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

/* ===================== detalhe voltou ao layout simples ===================== */

test('1. nenhum vestígio de UI de attributes sobrou no detalhe (função, CSS, host div)', () => {
  assert.ok(!html.includes('function attributesCompactHtml'));
  assert.ok(!html.includes('function attributesSectionHtml'));
  assert.ok(!html.includes('detail-attr-host'));
  assert.ok(!html.includes('detail-attr-toggle'));
  assert.ok(!html.includes('detail-attr-compact'));
  assert.ok(!html.includes('ATRIBUTOS ESTRUTURADOS'));
  assert.ok(!html.includes('Atributos '));
});

test('2. o template de openDetail volta à ordem original: tags seguidas direto pelas notas', () => {
  const idx = html.indexOf('<div class="detail-tags">');
  assert.ok(idx > 0);
  const after = html.slice(idx, idx + 400);
  const tagsLineEnd = after.indexOf('</div>') + '</div>'.length;
  const nextMeaningful = after.slice(tagsLineEnd).trimStart();
  assert.ok(nextMeaningful.startsWith('<div class="detail-notes">'), 'logo após .detail-tags deveria vir .detail-notes, sem nenhum bloco no meio');
});

test('3. attributes persistidos continuam fora de qualquer caminho de remoção — este arquivo (índice) não tem nenhum "delete attributes"/"attributes = null"', () => {
  const region = stripJsComments(html);
  assert.ok(!/\.attributes\s*=\s*(null|undefined|\{\})/.test(region));
  assert.ok(!/delete\s+\w+\.attributes\b/.test(region));
});

/* ===================== reviewQueueApplyFilters (inalterado) ===================== */

function loadReviewQueueApi() {
  const src = extractFunction(html, 'reviewQueueApplyFilters').source;
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.__api = { reviewQueueApplyFilters };', ctx);
  return ctx.__api;
}

function makeLesions() {
  return [
    { id: 'L1', section: 'Tórax', site: 'Nódulo pulmonar', tags: ['calcificações'], proposedAttributes: [{ conceptId: 'rad_comp_solid' }], ambiguities: [{ tag: 'calcificações', candidateConceptIds: ['rad_comp_calcified'] }], reviewTags: [], conflicts: [] },
    { id: 'L2', section: 'Abdômen Superior', site: 'Fígado', tags: ['hemorrágico'], proposedAttributes: [], ambiguities: [], reviewTags: [{ tag: 'vascular' }], conflicts: [] },
    { id: 'L3', section: 'Musculoesquelético', site: 'Fêmur', tags: ['lítica', 'esclerótica'], proposedAttributes: [], ambiguities: [], reviewTags: [], conflicts: [{ type: 'exclusive-group-conflict', groupId: 'radiologic.boneDensity' }] }
  ];
}

test('4. filtro ambiguityOnly mantém só lesões com ambiguidade', () => {
  const api = loadReviewQueueApi();
  const out = api.reviewQueueApplyFilters(makeLesions(), { ambiguityOnly: true });
  assert.deepEqual(out.map(l => l.id), ['L1']);
});

test('5. filtro conflictOnly mantém só lesões com conflito', () => {
  const api = loadReviewQueueApi();
  const out = api.reviewQueueApplyFilters(makeLesions(), { conflictOnly: true });
  assert.deepEqual(out.map(l => l.id), ['L3']);
});

test('6. filtro por tag', () => {
  const api = loadReviewQueueApi();
  const out = api.reviewQueueApplyFilters(makeLesions(), { tag: 'hemorrág' });
  assert.deepEqual(out.map(l => l.id), ['L2']);
});

test('7. filtro por seção', () => {
  const api = loadReviewQueueApi();
  const out = api.reviewQueueApplyFilters(makeLesions(), { section: 'Musculoesquelético' });
  assert.deepEqual(out.map(l => l.id), ['L3']);
});

test('8. filtro por sítio', () => {
  const api = loadReviewQueueApi();
  const out = api.reviewQueueApplyFilters(makeLesions(), { site: 'fígado' });
  assert.deepEqual(out.map(l => l.id), ['L2']);
});

test('9. filtro por conceptId proposto (bate em proposedAttributes OU em ambiguities.candidateConceptIds)', () => {
  const api = loadReviewQueueApi();
  const out1 = api.reviewQueueApplyFilters(makeLesions(), { conceptId: 'rad_comp_solid' });
  assert.deepEqual(out1.map(l => l.id), ['L1']);
  const out2 = api.reviewQueueApplyFilters(makeLesions(), { conceptId: 'rad_comp_calcified' });
  assert.deepEqual(out2.map(l => l.id), ['L1']);
});

test('10. sem nenhum filtro, devolve todas', () => {
  const api = loadReviewQueueApi();
  const out = api.reviewQueueApplyFilters(makeLesions(), {});
  assert.equal(out.length, 3);
});

/* ===================== TAXO04_REVIEW_QUEUE.json (mantido, sem refinar) ===================== */

const reviewQueueExists = fs.existsSync(REVIEW_QUEUE_PATH);

test('11. TAXO04_REVIEW_QUEUE.json tem exatamente 267 lesões (integração real, pula se o arquivo não existir)', (t) => {
  if (!reviewQueueExists) { t.skip('TAXO04_REVIEW_QUEUE.json não encontrado nesta máquina'); return; }
  const queue = JSON.parse(fs.readFileSync(REVIEW_QUEUE_PATH, 'utf8'));
  assert.equal(queue.lesions.length, 267);
  assert.equal(queue.metadata.count, 267);
});

test('12. nenhuma lesão em TAXO04_REVIEW_QUEUE.json tem migrationStatus diferente de "review-required"', (t) => {
  if (!reviewQueueExists) { t.skip('TAXO04_REVIEW_QUEUE.json não encontrado nesta máquina'); return; }
  const queue = JSON.parse(fs.readFileSync(REVIEW_QUEUE_PATH, 'utf8'));
  queue.lesions.forEach(l => assert.equal(l.migrationStatus, 'review-required'));
});

/* ===================== fila continua acessível em Ferramentas Avançadas ===================== */

test('13. botão "Revisão de atributos" foi removido das Ferramentas Avançadas (funções preservadas)', () => {
  assert.ok(!html.includes('id="btn-review-queue-panel"'), 'botão removido da interface');
  assert.ok(!html.includes("document.getElementById('btn-review-queue-panel')"), 'wiring removido');
});

test('14. openReviewQueuePanel/reviewQueueMountPanel continuam intactos (fila não foi tocada nesta rodada)', () => {
  assert.ok(html.includes('function openReviewQueuePanel'));
  assert.ok(html.includes('async function reviewQueueMountPanel'));
  assert.ok(html.includes('function loadReviewQueue'));
});

/* ===================== zero persistência / zero escrita ===================== */

function regionBetween(markerStart, markerEnd) {
  const start = html.indexOf(markerStart);
  assert.ok(start >= 0, 'marcador inicial não encontrado: ' + markerStart);
  const end = html.indexOf(markerEnd, start);
  assert.ok(end > start, 'marcador final não encontrado: ' + markerEnd);
  return stripJsComments(html.slice(start, end));
}

test('15. a região de código do painel de revisão (fila) não chama saveData/Firestore/IndexedDB/localStorage', () => {
  const region = regionBetween(
    "/* ---------- TAXO-04 FASE 2",
    'async function loadData(){'
  );
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/localStorage\.(setItem|getItem|removeItem|clear)\s*\(/.test(region));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/indexedDB\.open/i.test(region));
  assert.ok(!/\bDATA\s*=(?!=)/.test(region)); // nunca reatribui DATA (leitura via .find/.some é ok)
});
