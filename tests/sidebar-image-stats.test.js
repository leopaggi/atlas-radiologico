'use strict';

// Contadores de imagem na barra lateral (seção/site).
// Só stdlib (padrão do projeto): extrai do index.html real, roda em vm.

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

function loadStats() {
  const src = extractFunction(html, 'lesionHasAnyImage')
    + '\n' + extractFunction(html, 'forEachImagePlacement')
    + '\n' + extractFunction(html, 'blankImageStats')
    + '\n' + extractFunction(html, 'addPlacementStats')
    + '\n' + extractFunction(html, 'buildSidebarImageStats')
    + '\n' + extractFunction(html, 'sectionStats')
    + '\n' + extractFunction(html, 'siteStats')
    + '\n' + extractFunction(html, 'sidebarStatsText')
    + '\n' + extractFunction(html, 'sidebarCoverageHtml')
    + '\n' + extractFunction(html, 'sidebarStatsTitle');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { sectionStats, siteStats, buildSidebarImageStats, sidebarStatsText, sidebarCoverageHtml, sidebarStatsTitle };', ctx);
  return ctx.__api;
}

const img = (extra) => Object.assign({ data: 'http://h/i.png' }, extra);
const CAT = [
  { id: 'a', s: 'MSK', site: 'Quadril', images: [img({}), img({}), img({})] },
  { id: 'b', s: 'MSK', site: 'Quadril', images: [img({})] },
  { id: 'c', s: 'MSK', site: 'Joelho', images: [] },
  { id: 'd', s: 'NEURO', site: 'Encéfalo', images: [] }
];

test('1. seção conta lesões corretamente', () => {
  const api = loadStats();
  assert.equal(api.sectionStats(CAT, 'MSK').lesions, 3);
  assert.equal(api.sectionStats(CAT, 'NEURO').lesions, 1);
  assert.equal(api.sectionStats(CAT, 'INEXISTENTE').lesions, 0);
});

test('2. seção soma imagens corretamente', () => {
  const api = loadStats();
  assert.equal(api.sectionStats(CAT, 'MSK').images, 4);
  assert.equal(api.sectionStats(CAT, 'NEURO').images, 0);
});

test('3. seção conta lesões com imagem corretamente', () => {
  const api = loadStats();
  assert.equal(api.sectionStats(CAT, 'MSK').withImages, 2);
  assert.equal(api.sectionStats(CAT, 'NEURO').withImages, 0);
});

test('4. site/subseção faz o mesmo', () => {
  const api = loadStats();
  assert.deepEqual(JSON.parse(JSON.stringify(api.siteStats(CAT, 'MSK', 'Quadril'))), { lesions: 2, images: 4, withImages: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.siteStats(CAT, 'MSK', 'Joelho'))), { lesions: 1, images: 0, withImages: 0 });
});

test('5. zero imagens aparece como 0 (não some)', () => {
  const api = loadStats();
  assert.equal(api.sidebarStatsText(api.sectionStats(CAT, 'NEURO')), '0/1');
});

test('6. lesão com 3 imagens conta 3 imagens e 1 com imagem', () => {
  const api = loadStats();
  const one = [{ id: 'a', s: 'S', site: 'T', images: [img({}), img({}), img({})] }];
  const st = api.sectionStats(one, 'S');
  assert.equal(st.images, 3);
  assert.equal(st.withImages, 1);
  assert.equal(st.lesions, 1);
});

test('7. lesão sem imagem conta no denominador', () => {
  const api = loadStats();
  const st = api.siteStats(CAT, 'MSK', 'Joelho');
  assert.equal(st.lesions, 1);
  assert.equal(st.withImages, 0);
  assert.equal(api.sidebarStatsText(st), '0/1');
});

test('8. pending não entra (só entry.images definitivo)', () => {
  const api = loadStats();
  const st = api.sectionStats([{ id: 'a', s: 'S', site: 'T', images: [] }], 'S');
  assert.equal(st.images, 0);
  assert.equal(st.withImages, 0);
});

test('9. imagem histórica sem assignedAt entra no total', () => {
  const api = loadStats();
  const st = api.sectionStats([{ id: 'a', s: 'S', site: 'T', images: [img({})] }], 'S');
  assert.equal(st.images, 1);
  assert.equal(st.withImages, 1);
});

test('10. assignedAt não altera o total (estoque ≠ produtividade)', () => {
  const api = loadStats();
  const withTs = [{ id: 'a', s: 'S', site: 'T', images: [img({ assignedAt: '2026-09-21T10:00:00.000Z' })] }];
  const without = [{ id: 'a', s: 'S', site: 'T', images: [img({})] }];
  assert.equal(JSON.stringify(api.sectionStats(withTs, 'S')), JSON.stringify(api.sectionStats(without, 'S')));
});

test('11. mesma métrica funciona em seção e site', () => {
  const api = loadStats();
  const m = api.buildSidebarImageStats(CAT);
  assert.equal(m.sections.MSK.lesions, api.sectionStats(CAT, 'MSK').lesions);
  assert.equal(m.sections.MSK.images, api.sectionStats(CAT, 'MSK').images);
  assert.equal(m.sites.MSK.Quadril.withImages, api.siteStats(CAT, 'MSK', 'Quadril').withImages);
  assert.equal(m.sites.NEURO['Encéfalo'].lesions, 1);
});

test('12. linha contém só a cobertura (formato "38/243")', () => {
  const api = loadStats();
  assert.equal(api.sidebarStatsText({ lesions: 243, images: 126, withImages: 38 }), '38/243');
  assert.equal(api.sidebarStatsText({ lesions: 34, images: 21, withImages: 12 }), '12/34');
  const treeSrc = extractFunction(html, 'renderTree');
  assert.doesNotMatch(treeSrc, /🖼/, 'sem ícone nas linhas');
  assert.doesNotMatch(treeSrc, /ts-imgs|ts-total/, 'sem total isolado/absoluto nas linhas');
});

test('13. stats ficam na mesma linha (nowrap + flex no CSS/render)', () => {
  assert.match(html, /\.tree-section-head \.tree-cov,.tree-site \.tree-cov\{[^}]*white-space:nowrap/);
  assert.match(html, /\.tree-cov \.cov-num\{[^}]*var\(--amber\)/, 'numerador em amarelo do tema');
  assert.match(html, /\.tree-cov \.cov-den\{[^}]*opacity/, 'denominador discreto');
  const treeSrc = extractFunction(html, 'renderTree');
  assert.match(treeSrc, /class="count tree-cov"/);
  const title = loadStats().sidebarStatsTitle({ lesions: 243, images: 126, withImages: 38 });
  assert.equal(title, '38 de 243 lesões possuem pelo menos uma imagem');
});

test('21. numerador é withImages e denominador é lesions (cobertura pura)', () => {
  const api = loadStats();
  const out = api.sidebarCoverageHtml({ lesions: 243, images: 999, withImages: 38 });
  assert.match(out, /<span class="cov-num">38<\/span>/);
  assert.match(out, /<span class="cov-den">\/243<\/span>/);
  assert.doesNotMatch(out, /999/, 'absoluto de imagens não aparece');
});

test('22. zero aparece como 0/N com destaque só no zero', () => {
  const api = loadStats();
  assert.equal(api.sidebarCoverageHtml({ lesions: 73, images: 0, withImages: 0 }), '<span class="cov-num">0</span><span class="cov-den">/73</span>');
});

test('14. sidebar continua navegável (handlers intactos)', () => {
  const treeSrc = extractFunction(html, 'renderTree');
  assert.match(treeSrc, /head\.onclick/);
  assert.match(treeSrc, /sEl\.onclick/);
  assert.match(treeSrc, /saveSidebarScopePref\(\)/);
  assert.match(treeSrc, /renderAll\(\)/);
  assert.match(treeSrc, /openSections/);
});

test('15. scope atual não quebra (scope/openSections intocados)', () => {
  const treeSrc = extractFunction(html, 'renderTree');
  assert.match(treeSrc, /scope\s*=\s*\{section:sectionName,\s*site:null\}/);
  assert.match(treeSrc, /scope\s*=\s*\{section:sectionName,\s*site:siteName\}/);
  assert.doesNotMatch(treeSrc, /SIDEBAR_SCOPE_KEY|localStorage/);
});

test('16. update após save reflete novo total (renderAll no fluxo)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /renderAll\(\)/, 'Salvar do editor re-renderiza (sidebar inclusa)');
  assert.match(html, /openQuizAddImageModal\(e\.id, \(\)=>\{ refreshQuizImgs\(true\); renderAll\(\); \}\)/, 'Concluído do Quiz re-renderiza (overlays intactas)');
});

test('17. remoção de imagem reduz total (derivado do estado atual)', () => {
  const api = loadStats();
  const full = [{ id: 'a', s: 'S', site: 'T', images: [img({}), img({})] }];
  assert.equal(api.sectionStats(full, 'S').images, 2);
  full[0].images.pop();
  assert.equal(api.sectionStats(full, 'S').images, 1);
  full[0].images.pop();
  const st = api.sectionStats(full, 'S');
  assert.equal(st.images, 0);
  assert.equal(st.withImages, 0);
  assert.equal(st.lesions, 1, 'lesão continua no denominador');
});

test('18. nenhum hardcode de total de lesões', () => {
  const treeSrc = extractFunction(html, 'renderTree');
  assert.doesNotMatch(treeSrc, /1213/);
  const marker = html.indexOf('MÉTRICAS DE IMAGEM DA SIDEBAR');
  assert.notEqual(marker, -1);
  assert.doesNotMatch(html.slice(marker), /1213/);
});

test('19. DATA real é a fonte (render usa o catálogo vivo)', () => {
  const treeSrc = extractFunction(html, 'renderTree');
  assert.match(treeSrc, /buildSidebarImageStats\(DATA\)/, 'uma passada por render, sem cache paralelo');
  assert.doesNotMatch(treeSrc, /setInterval|addEventListener\('storage'|BroadcastChannel/, 'sem listeners novos');
});

test('20. nenhuma regressão visual/estrutural relevante', () => {
  const treeSrc = extractFunction(html, 'renderTree');
  assert.match(treeSrc, /Todas as seções/);
  assert.match(treeSrc, /tree-section-head/);
  assert.match(treeSrc, /tree-site-name/);
  assert.match(treeSrc, /reorder-btn/);
  assert.match(treeSrc, /drag-handle/);
  assert.match(treeSrc, /active-scope/);
});
