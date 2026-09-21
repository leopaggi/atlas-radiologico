'use strict';

// Produtividade de imagens: assignedAt = primeira atribuição confirmada.
// Só stdlib (padrão do projeto): extrai as funções reais do index.html e
// testa em vm isolado. Sem rede/IndexedDB/Firebase.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
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
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  throw new Error('Bloco sem fechamento');
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace);
}

const PURE = [
  'isValidAssignedAt', 'localDayKeyFromDate', 'imageAssignedDayLocal',
  'stampNewImagesAssignedAt', 'adoptOldestAssignedAt', 'lesionHasAnyImage',
  'countImagesAssignedOnDate', 'countTotalImages', 'countLesionsWithImages',
  'imagesAssignedLast7Days', 'renderImagesWeekSvg'
];

function loadPure() {
  const src = extractFunction(html, 'escAttr')
    + '\n' + extractFunction(html, 'esc')
    + '\n' + extractFunction(html, 'stableImageKeyV208')
    + '\n' + extractFunction(html, 'imageIdentityKeys')
    + '\n' + PURE.map((n) => extractFunction(html, n)).join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { ' + ['stableImageKeyV208', ...PURE].join(', ') + ' };', ctx);
  return ctx.__api;
}

function loadUnion() {
  const src = extractFunction(html, 'imageIdentityKeys')
    + '\n' + extractFunction(html, 'isValidAssignedAt')
    + '\n' + extractFunction(html, 'adoptOldestAssignedAt')
    + '\n' + extractFunction(html, 'unionEntryImages');
  const conflicts = [];
  const ctx = vm.createContext({
    imageOwnerIdV1: (img) => (img && img.lesionId) || null,
    canChangeImageOwnership: () => true,
    registerImageOwnershipConflict: (c) => { conflicts.push(c); },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__u = { unionEntryImages };', ctx);
  return { unionEntryImages: ctx.__u.unionEntryImages, conflicts };
}

// ISO construído no horário LOCAL (sem flakiness de fuso).
function localIso(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

test('1. imagem nova salva recebe assignedAt', () => {
  const api = loadPure();
  const next = [{ publicId: 'a' }, { data: 'http://x/y.png' }];
  const n = api.stampNewImagesAssignedAt([], next, '2026-09-21T14:30:00.000Z');
  assert.equal(n, 2);
  assert.ok(next.every((img) => img.assignedAt === '2026-09-21T14:30:00.000Z'));
});

test('2. imagem pending nunca recebe assignedAt fora do save', () => {
  for (const name of ['buildPendingImage', 'addImageToLesionData']) {
    const src = extractFunction(html, name);
    assert.doesNotMatch(src, /stampNewImagesAssignedAt/, `${name} não carimba`);
    assert.doesNotMatch(src, /assignedAt\s*=\s*new Date/, `${name} não inventa timestamp`);
  }
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /stampNewImagesAssignedAt\(/, 'carimbo só no Salvar do editor');
  const doneMarker = "cov.querySelector('#quiz-add-img-done').onclick";
  const doneIdx = html.indexOf(doneMarker);
  assert.notEqual(doneIdx, -1, 'handler Concluído do Quiz existe');
  const doneRegion = html.slice(doneIdx, doneIdx + 3000);
  assert.match(doneRegion, /stampNewImagesAssignedAt\(/, 'carimbo só no Concluído do Quiz');
});

test('3. cancelar não conta (carimbo só nos 2 pontos de confirmação)', () => {
  const hits = [];
  const re = /stampNewImagesAssignedAt\(/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const lineStart = html.lastIndexOf('\n', m.index) + 1;
    const line = html.slice(lineStart, html.indexOf('\n', m.index));
    if (/^\s*\/\//.test(line)) continue; // comentário explica, não executa
    if (/function stampNewImagesAssignedAt/.test(line)) continue; // definição
    hits.push(line.trim().slice(0, 80));
  }
  assert.equal(hits.length, 2, 'exatamente 2 call sites reais: ' + JSON.stringify(hits));
});

test('4. imagem já existente não recebe novo assignedAt (edição mantém)', () => {
  const api = loadPure();
  const prev = [{ publicId: 'a', assignedAt: '2026-01-01T00:00:00.000Z', label: 'velho' }];
  const next = [{ publicId: 'a', label: 'novo' }];
  const n = api.stampNewImagesAssignedAt(prev, next, '2026-09-21T14:30:00.000Z');
  assert.equal(n, 0);
  assert.equal(next[0].assignedAt, '2026-01-01T00:00:00.000Z', 'adota o anterior, não hoje');
});

test('5. sync pull NÃO cria assignedAt', () => {
  const { unionEntryImages } = loadUnion();
  const out = unionEntryImages(
    [{ publicId: 'a', lesionId: 'L1' }],
    [{ publicId: 'a', lesionId: 'L1' }],
    { id: 'L1' }, null, 'pull'
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].assignedAt, undefined, 'pull não inventa timestamp');
});

test('6. sync push NÃO duplica assignedAt', () => {
  const { unionEntryImages } = loadUnion();
  const out = unionEntryImages(
    [{ publicId: 'a', lesionId: 'L1' }],
    [{ publicId: 'a', lesionId: 'L1', assignedAt: '2026-05-01T00:00:00.000Z' }],
    { id: 'L1' }, null, 'push'
  );
  assert.equal(out.length, 1);
  assert.equal(out.filter((img) => img.assignedAt).length, 1, 'um só timestamp, sem duplicar');
});

test('7. timestamp mais antigo vence no merge (ida e volta)', () => {
  const { unionEntryImages } = loadUnion();
  const oldTs = '2026-03-01T00:00:00.000Z';
  const newTs = '2026-09-01T00:00:00.000Z';
  const r1 = unionEntryImages(
    [{ publicId: 'a', lesionId: 'L1', assignedAt: newTs }],
    [{ publicId: 'a', lesionId: 'L1', assignedAt: oldTs }],
    { id: 'L1' }, null, 'pull'
  );
  assert.equal(r1[0].assignedAt, oldTs);
  const r2 = unionEntryImages(
    [{ publicId: 'a', lesionId: 'L1', assignedAt: oldTs }],
    [{ publicId: 'a', lesionId: 'L1', assignedAt: newTs }],
    { id: 'L1' }, null, 'push'
  );
  assert.equal(r2[0].assignedAt, oldTs);
});

test('8. countImagesAssignedOnDate respeita o DIA LOCAL', () => {
  const api = loadPure();
  assert.equal(api.imageAssignedDayLocal(localIso(2026, 9, 21, 10)), '2026-09-21');
  assert.equal(api.imageAssignedDayLocal(localIso(2026, 9, 21, 0, 1)), '2026-09-21');
  assert.equal(api.imageAssignedDayLocal(localIso(2026, 9, 20, 23, 59)), '2026-09-20');
  assert.equal(api.imageAssignedDayLocal('lixo'), null);
  assert.equal(api.imageAssignedDayLocal(undefined), null);
  const cat = [{ id: 'a', images: [{ publicId: 'x', assignedAt: localIso(2026, 9, 21, 10) }] }];
  assert.equal(api.countImagesAssignedOnDate(cat, '2026-09-21'), 1);
  assert.equal(api.countImagesAssignedOnDate(cat, '2026-09-20'), 0);
  assert.equal(api.countImagesAssignedOnDate(cat, 'invalida'), 0);
});

test('9. hoje conta corretamente', () => {
  const api = loadPure();
  const nowIso = new Date().toISOString();
  const cat = [
    { id: 'a', images: [{ publicId: 'x', assignedAt: nowIso }] },
    { id: 'b', images: [{ publicId: 'y', assignedAt: nowIso }] }
  ];
  const today = api.localDayKeyFromDate(new Date());
  assert.equal(api.countImagesAssignedOnDate(cat, today), 2);
});

test('10. ontem não entra em hoje', () => {
  const api = loadPure();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  const cat = [{ id: 'a', images: [{ publicId: 'x', assignedAt: d.toISOString() }] }];
  const today = api.localDayKeyFromDate(new Date());
  const yDay = api.localDayKeyFromDate(d);
  assert.notEqual(yDay, today);
  assert.equal(api.countImagesAssignedOnDate(cat, today), 0);
  assert.equal(api.countImagesAssignedOnDate(cat, yDay), 1);
});

test('11. gráfico produz exatamente 7 dias terminando hoje', () => {
  const api = loadPure();
  const ref = new Date(2026, 8, 21, 12);
  const s = api.imagesAssignedLast7Days([], ref);
  assert.equal(s.length, 7);
  assert.equal(s[6].key, '2026-09-21');
  assert.equal(s[0].key, '2026-09-15');
  assert.equal(JSON.stringify(s.map((x) => x.label)), JSON.stringify(['15/09', '16/09', '17/09', '18/09', '19/09', '20/09', '21/09']));
});

test('12. dia sem imagens retorna zero (sem omitir)', () => {
  const api = loadPure();
  const s = api.imagesAssignedLast7Days([], new Date(2026, 8, 21, 12));
  assert.ok(s.every((x) => x.count === 0));
  const svg = api.renderImagesWeekSvg(s);
  assert.match(svg, /<polyline/);
  assert.equal((svg.match(/<circle/g) || []).length, 7, '7 pontos mesmo zerados');
});

test('13. imagem histórica sem assignedAt não entra na série', () => {
  const api = loadPure();
  const cat = [{ id: 'a', images: [{ publicId: 'x' }, { data: 'http://h/y.png' }] }];
  const s = api.imagesAssignedLast7Days(cat, new Date(2026, 8, 21, 12));
  assert.ok(s.every((x) => x.count === 0));
});

test('14. imagem histórica continua no total geral', () => {
  const api = loadPure();
  const cat = [
    { id: 'a', images: [{ publicId: 'x' }, { data: 'http://h/y.png' }], img: 'http://h/legado.png' },
    { id: 'b', images: [{ publicId: 'z', assignedAt: localIso(2026, 9, 21) }] }
  ];
  assert.equal(api.countTotalImages(cat), 4, '2 + legado + 1 nova');
  assert.equal(api.countLesionsWithImages(cat), 2);
});

test('15. nova imagem salva atualiza o dashboard (refresh ligado aos saves)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /refreshStudyDashboardLive\(\)/, 'Salvar do editor atualiza o dashboard');
  const doneMarker = "cov.querySelector('#quiz-add-img-done').onclick";
  const doneRegion = html.slice(html.indexOf(doneMarker), html.indexOf(doneMarker) + 3000);
  assert.match(doneRegion, /refreshStudyDashboardLive\(\)/, 'Concluído do Quiz atualiza o dashboard');
  const refreshSrc = extractFunction(html, 'refreshStudyDashboardLive');
  assert.match(refreshSrc, /kpi-images-today/);
  assert.match(refreshSrc, /imgs-week-chart/);
  assert.match(refreshSrc, /imgs-total-line/);
});

test('16. reload não duplica contagem (idempotência)', () => {
  const api = loadPure();
  const prev = [];
  const next = [{ publicId: 'x' }];
  api.stampNewImagesAssignedAt(prev, next, '2026-09-21T14:30:00.000Z');
  // "Reload": o estado persistido volta como prev; contar de novo não muda.
  const cat = [{ id: 'a', images: next }];
  const today = '2026-09-21';
  const c1 = api.countImagesAssignedOnDate(cat, today);
  api.stampNewImagesAssignedAt(next, next, '2026-09-22T00:00:01.000Z');
  const c2 = api.countImagesAssignedOnDate(cat, today);
  assert.equal(c1, 1);
  assert.equal(c2, 1, 'recontar / re-carimbar não duplica');
  assert.equal(next[0].assignedAt, '2026-09-21T14:30:00.000Z', 'timestamp original preservado');
});

test('17. duas imagens novas no mesmo save contam 2', () => {
  const api = loadPure();
  const next = [{ publicId: 'a' }, { publicId: 'b' }];
  assert.equal(api.stampNewImagesAssignedAt([], next, '2026-09-21T14:30:00.000Z'), 2);
  const cat = [{ id: 'a', images: next }];
  assert.equal(api.countImagesAssignedOnDate(cat, '2026-09-21'), 2);
});

test('18. mesma imagem duplicada conta 1', () => {
  const api = loadPure();
  const cat = [
    { id: 'a', images: [{ publicId: 'x', assignedAt: '2026-09-21T14:30:00.000Z' }] },
    { id: 'b', images: [{ publicId: 'x', assignedAt: '2026-09-21T14:30:00.000Z' }] }
  ];
  assert.equal(api.countImagesAssignedOnDate(cat, '2026-09-21'), 1, 'mesma identidade em 2 lesões = 1');
});

test('19. total de lesões usa DATA real, sem 1213 hardcoded', () => {
  const marker = html.indexOf('PRODUTIVIDADE DE IMAGENS');
  assert.notEqual(marker, -1);
  assert.doesNotMatch(html.slice(marker), /1213/, 'nenhum total hardcoded no módulo novo');
  assert.match(html, /countLesionsWithImages\(DATA\)/, 'lesões com imagem do catálogo real');
  assert.match(html, /\/ \$\{DATA\.length\}/, 'total do catálogo real');
});

test('20. layout possui os três blocos (evolução, imagens semana, estado)', () => {
  for (const h3 of ['Evolução do desempenho', 'Imagens atribuídas na última semana', 'Estado do acervo']) {
    assert.ok(html.includes('<h3>' + h3 + '</h3>'), h3);
  }
  assert.match(html, /"start performance imgs state"/, 'grid com a coluna imgs');
  assert.match(html, /id="kpi-images-today"/, 'card imagens hoje');
  assert.match(html, /id="imgs-week-chart"/, 'contêiner do gráfico semanal');
  assert.match(html, /id="imgs-total-line"/, 'linha de totais');
});
