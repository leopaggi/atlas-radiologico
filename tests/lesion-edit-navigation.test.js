'use strict';

// NAVEGAÇÃO APÓS EDIÇÃO DA LESÃO (reviewId lrev_mul8jrtq_l2atyp).
// Bug real: 1) depois de salvar uma lesão editada a partir do detalhe, o
// app fechava tudo e perdia o contexto da lesão recém-editada; 2) dentro do
// formulário de edição não havia forma simples de voltar à visualização
// não editável da MESMA lesão. Fluxo REAL rastreado: openDetail() → botão
// "editar" → openForm(id, opts) → (salvar OU "← Voltar para visualização")
// → openDetail(id, opts) de novo, com o MESMO contexto (ex.: returnTo).
// Outros call sites de openForm (Quiz, "imagens hoje", nova lesão) não
// passam onBackToView/onSaved-de-reabertura e continuam exatamente como
// estavam — nenhum comportamento existente foi alterado para eles.

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

// ===========================================================================
// 1. ESTÁTICO — código real de openDetail() e openForm()
// ===========================================================================

test('1. openDetail: botão "editar" abre openForm com onSaved e onBackToView reabrindo a MESMA lesão + mesmo opts', () => {
  const src = stripJsComments(extractFunction(html, 'openDetail').source);
  assert.match(src, /document\.getElementById\('btn-edit'\)\.onclick\s*=\s*\(\)=>\{/);
  const idx = src.indexOf("getElementById('btn-edit')");
  const nearby = src.slice(idx, idx + 400);
  assert.match(nearby, /openForm\(e\.id,\s*\{/);
  assert.match(nearby, /onSaved:\s*\(\)=>\{\s*openDetail\(e\.id,\s*opts\);\s*\}/);
  assert.match(nearby, /onBackToView:\s*\(\)=>\{\s*openDetail\(e\.id,\s*opts\);\s*\}/);
});

test('2. openForm: footer só ganha "Voltar para visualização" quando opts.onBackToView é função (não afeta Quiz/imagens-hoje/nova lesão)', () => {
  const src = extractFunction(html, 'openForm').source;
  assert.match(src, /\$\{typeof opts\.onBackToView==='function' \? `<button type="button" class="btn btn-ghost" id="f-back-view">← Voltar para visualização<\/button>` : ''\}/);
});

test('3. openForm: clicar "Voltar para visualização" fecha o formulário (mesma limpeza do cancelar) e chama opts.onBackToView(), sem chamar closeOverlay() por fora', () => {
  const src = stripJsComments(extractFunction(html, 'openForm').source);
  const idx = src.indexOf("getElementById('f-back-view')");
  assert.notEqual(idx, -1, 'wiring do botão não encontrado');
  const nearby = src.slice(idx, idx + 400);
  assert.match(nearby, /releasePendingObjectUrls\(\);/);
  assert.match(nearby, /removeEventListener\('keydown', closeFormOnEsc\);/);
  assert.match(nearby, /closeForm\(\);/);
  assert.match(nearby, /opts\.onBackToView\(\);/);
});

test('4. outros call sites de openForm (Quiz, imagens-hoje, nova lesão, importador externo) não ganham onBackToView', () => {
  const re = /openForm\(([^;]*?)\)(?=;)/gs;
  let m;
  const hits = [];
  while ((m = re.exec(html)) !== null) {
    const before = html.slice(Math.max(0, m.index - 40), m.index);
    if (/function openForm/.test(before)) continue;
    if (/onBackToView/.test(m[0]) && !/openForm\(e\.id, \{\s*onSaved: \(\)=>\{ openDetail\(e\.id, opts\); \},\s*onBackToView: \(\)=>\{ openDetail\(e\.id, opts\); \}\s*\}\)/.test(m[0])) {
      hits.push(m[0].slice(0, 80));
    }
  }
  assert.deepEqual(hits, [], 'nenhum outro call site deveria referenciar onBackToView');
});

// ===========================================================================
// 5. FLUXO REAL — openDetail em execução (DOM mínimo, igual ao harness já
//    usado para VOLTAR/returnTo em images-today-modal.test.js)
// ===========================================================================

function loadDetail(lesionOver) {
  const src = extractFunction(html, 'openDetail').source;
  const els = {};
  let anonSeq = 0;
  function mkEl(id) {
    if (!els[id]) {
      els[id] = {
        id, innerHTML: '', textContent: '', onclick: null, style: {},
        dataset: {}, className: '',
        querySelector() { return null; },
        querySelectorAll() { return []; },
        appendChild() {},
        remove() { this.removed = true; },
        addEventListener() {},
        getAttribute() { return null; },
        setAttribute() {},
        removed: false
      };
    }
    return els[id];
  }
  function mkAnon() {
    anonSeq += 1;
    return mkEl('anon-' + anonSeq);
  }
  let appendedOv = null;
  const calls = { openImagesTodayModal: 0, closeOverlay: 0, openForm: 0 };
  let capturedFormOpts = null;
  const lesion = Object.assign({ id: 'L1', name: 'Lesão Teste', s: 'S', site: 'T', tags: [], notes: '', links: [], classification: null, images: [] }, lesionOver || {});
  const ctx = vm.createContext({
    DATA: [lesion],
    document: {
      createElement: () => mkAnon(),
      getElementById: (id) => mkEl(id),
      body: { appendChild: (el) => { appendedOv = el; } },
      querySelector: () => null
    },
    ensureLinks: () => [],
    filterReferenceLinksForDisplay: (l) => l,
    hasEntryImgs: () => false,
    incColor: () => '',
    incLabel: () => '',
    CLASSIFICATION_SYSTEMS: {},
    renderClassificationBox: () => '',
    clinicalCasesSectionHtml: () => '',
    getEntryImgs: async () => [],
    getReview: () => 0,
    REVIEW_COLORS: {},
    REVIEW_ICONS: {},
    REVIEW_LABELS: {},
    setReview: () => {},
    renderReviewBar: () => {},
    renderResults: () => {},
    wireClinicalCasesToggle: () => {},
    radiologicSignsSectionHtml: () => '', classificationSchemesSectionHtml: () => '', wireDidacticImages: () => {},
    closeOverlay: () => { calls.closeOverlay++; },
    openForm: (id, o) => { calls.openForm++; capturedFormOpts = o; },
    openImagesTodayModal: () => { calls.openImagesTodayModal++; },
    esc: (v) => v,
    escAttr: (v) => v, lesionReviewWarningHtml: () => '',
    isReviewManual: () => false, getReviewStateExplanation: () => '', setReviewAuto: () => {}, markLesionForReviewAgain: () => {},
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__d = { openDetail };', ctx);
  // Rastreia CADA chamada (inclusive recursiva, via onSaved/onBackToView) ao
  // reatribuir o binding global — o corpo da função resolve `openDetail(...)`
  // pelo escopo global a cada chamada, então a reatribuição é vista mesmo de
  // dentro dos closures já criados na 1ª abertura.
  const original = ctx.openDetail;
  const detailCalls = [];
  ctx.openDetail = function wrapped(...args) { detailCalls.push(args); return original.apply(this, args); };
  return { openDetail: ctx.openDetail, els, getOv: () => appendedOv, calls, detailCalls, lesion, getFormOpts: () => capturedFormOpts };
}

test('5. clicar "editar" fecha o detalhe e abre o formulário da MESMA lesão (fluxo real, não helper isolado)', () => {
  const h = loadDetail();
  h.openDetail('L1');
  assert.equal(typeof h.els['btn-edit'].onclick, 'function');
  h.els['btn-edit'].onclick();
  assert.equal(h.calls.closeOverlay, 1, 'detalhe fecha antes de abrir o formulário');
  assert.equal(h.calls.openForm, 1);
  const formOpts = h.getFormOpts();
  assert.equal(typeof formOpts.onSaved, 'function');
  assert.equal(typeof formOpts.onBackToView, 'function');
});

test('6. após "salvar" (onSaved), a MESMA lesão reabre em visualização — não outra lesão, não a lista', () => {
  const h = loadDetail();
  h.openDetail('L1');
  h.els['btn-edit'].onclick();
  const formOpts = h.getFormOpts();
  assert.equal(h.detailCalls.length, 1, 'só a abertura inicial até aqui');
  formOpts.onSaved();
  assert.equal(h.detailCalls.length, 2, 'onSaved reabriu o detalhe');
  assert.equal(h.detailCalls[1][0], 'L1', 'reabre a MESMA lesão, pelo id');
  assert.equal(h.calls.openImagesTodayModal, 0, 'não foi para a lista de imagens de hoje');
  assert.match(h.getOv().innerHTML, /id="btn-edit"/, 'reabriu em modo visualização (não editável)');
});

test('7. botão "← Voltar para visualização" (dentro da edição) também reabre a MESMA lesão em modo não editável', () => {
  const h = loadDetail();
  h.openDetail('L1');
  h.els['btn-edit'].onclick();
  const formOpts = h.getFormOpts();
  formOpts.onBackToView();
  assert.equal(h.detailCalls.length, 2);
  assert.equal(h.detailCalls[1][0], 'L1');
  assert.match(h.getOv().innerHTML, /id="btn-edit"/);
});

test('8. contexto de origem (ex.: returnTo=images-today) sobrevive ao ciclo editar → salvar → visualização', () => {
  const h = loadDetail();
  h.openDetail('L1', { returnTo: 'images-today' });
  assert.match(h.getOv().innerHTML, /id="btn-back-today"/, 'contexto original presente antes de editar');
  h.els['btn-edit'].onclick();
  const formOpts = h.getFormOpts();
  formOpts.onSaved();
  assert.equal(h.detailCalls[1][1] && h.detailCalls[1][1].returnTo, 'images-today', 'o MESMO opts foi repassado');
  assert.match(h.getOv().innerHTML, /id="btn-back-today"/, 'botão de retorno ao contexto original continua presente após reabrir');
});

test('9. reabrir por onSaved nunca chama closeOverlay() por conta própria (o formulário já fechou antes)', () => {
  const h = loadDetail();
  h.openDetail('L1');
  h.els['btn-edit'].onclick();
  const closeOverlayCallsBeforeSave = h.calls.closeOverlay;
  h.getFormOpts().onSaved();
  assert.equal(h.calls.closeOverlay, closeOverlayCallsBeforeSave, 'reabrir a visualização não fecha overlays por fora do fluxo do formulário');
});

test('10. ciclo repetível (editar → salvar → editar → voltar) sem acumular chamadas nem travar em outra lesão', () => {
  const h = loadDetail();
  h.openDetail('L1');
  h.els['btn-edit'].onclick();
  h.getFormOpts().onSaved();
  h.els['btn-edit'].onclick();
  h.getFormOpts().onBackToView();
  assert.equal(h.calls.openForm, 2);
  assert.equal(h.detailCalls.length, 3);
  assert.ok(h.detailCalls.every((args) => args[0] === 'L1'), 'toda reabertura é sempre da mesma lesão L1');
});
