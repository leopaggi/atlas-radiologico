'use strict';

// Pós-condição de modais: salvar/cancelar nunca deixa backdrop residual.
// Regressão real (2026-09-21): refreshStudyDashboardLive() chamava
// getStudyOverlay() — que CRIA a overlay — com o dashboard fechado, e o
// `!ov.isConnected` nunca barrava. Tela cinza + scroll travado até um clique.
// Só stdlib (padrão do projeto): estático + vm com document fake.

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

// Document fake mínimo: rastreia overlays anexadas e criações de elemento.
function fakeDocument() {
  const attached = [];
  const created = [];
  const byId = {};
  function el(id) {
    if (!byId[id]) {
      byId[id] = {
        id, connected: false, removed: false, innerHTML: '', onclick: null,
        querySelector() { return null; },
        querySelectorAll() { return []; },
        remove() {
          this.removed = true;
          this.connected = false;
          const i = attached.indexOf(this);
          if (i >= 0) attached.splice(i, 1);
        }
      };
    }
    return byId[id];
  }
  return {
    _attached: attached,
    _created: created,
    querySelectorAll(sel) {
      if (sel === '.overlay') return attached.filter((e) => e.connected);
      return [];
    },
    getElementById(id) {
      const e = byId[id];
      return e && e.connected ? e : null;
    },
    createElement() {
      const e = el('anon-' + created.length);
      created.push(e);
      return e;
    },
    body: {
      appendChild(e) {
        e.connected = true;
        if (!attached.includes(e)) attached.push(e);
      }
    },
    _attach(id, className) {
      const e = el(id);
      e.className = className;
      e.connected = true;
      if (!attached.includes(e)) attached.push(e);
      return e;
    }
  };
}

function loadOverlayFns() {
  const src = extractFunction(html, 'closeOverlay')
    + '\n' + extractFunction(html, 'getStudyOverlay')
    + '\n' + extractFunction(html, 'refreshStudyDashboardLive');
  const document = fakeDocument();
  const ctx = vm.createContext({
    document,
    renderReviewPanels: () => {},
    DATA: [],
    SESSIONLOG: {},
    SRS: {},
    todayKey: () => 'x',
    countActuallyDue: () => 0,
    countImagesAssignedOnDate: () => 0,
    localDayKeyFromDate: () => '2026-09-21',
    imagesAssignedLast7Days: () => [],
    renderImagesWeekSvg: () => '',
    countTotalImages: () => 0,
    countLesionsWithImages: () => 0,
    getReviewCycleStats: () => ({ total: 0, never: 0 }),
    reviewCycleSegments: () => [],
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__m = { closeOverlay, getStudyOverlay, refreshStudyDashboardLive };', ctx);
  return { api: ctx.__m, document };
}

test('1. salvar remove overlay (closeForm→closeOverlay no finally do save)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /closeForm\(\);[\s\S]*?renderAll\(\);/, 'finally fecha antes de re-renderizar');
  const { api, document } = loadOverlayFns();
  document._attach('form-ov', 'overlay');
  assert.equal(document.querySelectorAll('.overlay').length, 1);
  api.closeOverlay();
  assert.equal(document.querySelectorAll('.overlay').length, 0);
});

test('2/3. sem overlay residual, backdrop some (refresh com dashboard fechado não cria nada)', () => {
  const { api, document } = loadOverlayFns();
  assert.equal(document.querySelectorAll('.overlay').length, 0);
  api.refreshStudyDashboardLive();
  assert.equal(document._created.length, 0, 'nenhum elemento criado');
  assert.equal(document.querySelectorAll('.overlay').length, 0, 'nenhum backdrop residual');
});

test('4. body/modal state restaurado (sem overflow nem modal-open no código)', () => {
  assert.doesNotMatch(html, /document\.body\.style\.overflow\s*=/, 'scroll nunca travado via body');
  assert.doesNotMatch(html, /modal-open/, 'sem classe modal-open no app');
  const { api, document } = loadOverlayFns();
  api.refreshStudyDashboardLive();
  assert.equal(document.querySelectorAll('.overlay').length, 0);
});

test('5. modal aninhado preserva o pai (preserveUnderlyingOverlay)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /if\(preserveUnderlyingOverlay\)\{\s*if\(ov\.isConnected\) ov\.remove\(\);\s*\}/);
  assert.match(formSrc, /else \{\s*closeOverlay\(\);\s*\}/);
});

test('6. último modal fechado remove tudo', () => {
  const { api, document } = loadOverlayFns();
  document._attach('a', 'overlay');
  document._attach('b', 'overlay');
  api.closeOverlay();
  assert.equal(document.querySelectorAll('.overlay').length, 0);
});

test('7. cancelar continua funcionando (libera tudo e fecha)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /f-cancel'\)\.onclick[\s\S]*?releasePendingObjectUrls\(\); document\.removeEventListener\('keydown', closeFormOnEsc\); closeForm\(\);/);
});

test('8. erro de save mantém modal aberto (retornos antes do fechamento)', () => {
  const formSrc = extractFunction(html, 'openForm');
  const closeIdx = formSrc.indexOf('A partir daqui, a tela SEMPRE fecha');
  assert.notEqual(closeIdx, -1);
  const before = formSrc.slice(0, closeIdx);
  assert.match(before, /Nada foi salvo/, 'falha de upload retorna antes de fechar');
  assert.match(before, /formSaving=false; return;/, 'trava libera sem fechar');
});

test('9. toast não segura overlay', () => {
  const toastSrc = extractFunction(html, 'toast');
  assert.doesNotMatch(toastSrc, /createElement/);
  assert.doesNotMatch(toastSrc, /overlay/i);
  assert.match(toastSrc, /classList\.(add|remove)\('show'\)/);
});

test('10. duas edições seguidas não acumulam backdrop (trava de submit)', () => {
  const formSrc = extractFunction(html, 'openForm');
  assert.match(formSrc, /if\(formSaving\) return;/);
});

test('11. external import não quebra (fluxo intacto)', () => {
  assert.match(html, /function openExternalImportModal\(draft\)\{/);
  assert.match(html, /maybeHandleExternalImport/);
});

test('12. review modal não quebra (fluxo intacto)', () => {
  assert.match(html, /function openReviewHistoryModal\(reviewId\)\{/);
  assert.match(html, /function openQuizReviewModal/);
});

test('13. collage modal não quebra (fluxo intacto)', () => {
  assert.match(html, /function openCollageBuilder\(lesionMeta,/);
  assert.match(html, /id="collage-desc"/);
});

test('14. refresh com dashboard ABERTO continua atualizando (sem regressão)', () => {
  const { api, document } = loadOverlayFns();
  const ov = document._attach('study-overlay', 'overlay');
  assert.doesNotThrow(() => api.refreshStudyDashboardLive());
  assert.equal(document.querySelectorAll('.overlay').length, 1, 'não remove o dashboard aberto');
  assert.equal(ov.removed, false);
});

test('15. sem F5/reload/hack (correção é lookup sem criar)', () => {
  const src = extractFunction(html, 'refreshStudyDashboardLive');
  assert.doesNotMatch(src, /location\.reload/);
  assert.doesNotMatch(src, /setTimeout/);
  assert.match(src, /getElementById\('study-overlay'\)/, 'lookup direto, sem getStudyOverlay()');
  assert.doesNotMatch(src, /= *getStudyOverlay\(\)\s*;/, 'nenhuma chamada que crie overlay aqui');
});
