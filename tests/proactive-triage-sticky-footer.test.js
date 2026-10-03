'use strict';

// UX — "Triagem proativa": com centenas de candidatas a lista fica longa e
// o rodapé (contagem + ações) saía da área visível, obrigando a rolar até
// o fim. Agora o modal segue o MESMO padrão já usado por .lesion-form-overlay
// (modal = flex column com altura máxima; corpo próprio rolável; rodapé
// sticky, fora da área que rola) — escopado só a `.triage-overlay`, nenhuma
// regra global `.modal`/`.modal-actions` foi tocada. A lógica de triagem
// (critérios, score, createTriageReviewBatch, createLesionReview) é
// REAPROVEITADA tal como estava — nada foi alterado aqui; só a apresentação
// do modal. Mesmo padrão de extração de código-fonte real + vm/fake-DOM já
// usado em image-sequence-compact-picker.test.js (seletor exato, nunca um
// parser de HTML genérico).

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
  const eq = html.indexOf('=', declaration.index);
  let i = eq + 1;
  while (/\s/.test(html[i])) i += 1;
  if (html[i] === '{' || html[i] === '[') {
    const open = html[i], close = open === '{' ? '}' : ']';
    let depth = 0, q = null, esc = false, end = -1;
    for (; i < html.length; i += 1) {
      const c = html[i];
      if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === open) depth += 1; else if (c === close) { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    assert.notEqual(end, -1, 'bloco sem fechamento: ' + name);
    return html.slice(declaration.index, end + 1) + ';';
  }
  const semi = html.indexOf(';', i);
  return html.slice(declaration.index, semi + 1);
}

const MODAL_SRC = extractFunction('openProactiveTriageModal');

/* ===================== 1. estrutura/estática — rodapé fixo ===================== */

test('1. existe um rodapé próprio da triagem, com contador dedicado (#triage-footer-count)', () => {
  assert.match(MODAL_SRC, /id="triage-footer-count"/);
  assert.match(MODAL_SRC, /class="triage-footer-count"/);
});

test('2. o contador do rodapé fica DENTRO de .modal-actions e FORA de .triage-body (não rola junto com a lista)', () => {
  const bodyOpen = MODAL_SRC.indexOf('class="triage-body"');
  const bodyCloseMarker = MODAL_SRC.indexOf('</div>', MODAL_SRC.indexOf('review-center-list', bodyOpen));
  const footerCountIdx = MODAL_SRC.indexOf('id="triage-footer-count"');
  const actionsIdx = MODAL_SRC.lastIndexOf('class="modal-actions"', footerCountIdx);
  assert.ok(bodyOpen >= 0 && bodyCloseMarker >= 0 && footerCountIdx >= 0 && actionsIdx >= 0);
  assert.ok(footerCountIdx > bodyCloseMarker, 'o contador do rodapé vem DEPOIS do fechamento do corpo rolável');
  assert.ok(actionsIdx > bodyCloseMarker, '.modal-actions também fica fora de .triage-body');
});

test('3. CSS: lista rola independente (.triage-body) e rodapé fica fixo (.triage-overlay .modal-actions sticky), escopados só a esta overlay', () => {
  assert.match(MODAL_SRC, /\.triage-body\{[^}]*overflow-y:auto/);
  assert.match(MODAL_SRC, /\.triage-overlay \.modal\{[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(MODAL_SRC, /\.triage-overlay \.modal-actions\{[^}]*position:sticky[^}]*bottom:0/);
  // nenhuma regra GLOBAL (.modal{}/.modal-actions{} fora do escopo .triage-overlay) foi criada aqui.
  assert.doesNotMatch(MODAL_SRC, /(?<!triage-overlay )\.modal-actions\{/, 'não deveria existir uma regra .modal-actions{} não escopada dentro desta função');
});

test('4. responsivo: existe uma regra para telas estreitas (sem exigir rolagem horizontal do rodapé)', () => {
  assert.match(MODAL_SRC, /@media\(max-width:480px\)\{[^}]*\.triage-overlay \.modal-actions/);
});

/* ===================== 2. mesma lógica de sempre — nenhuma duplicação ===================== */

test('5. só existe UM handler de clique para #triage-create (nenhum handler duplicado)', () => {
  const matches = MODAL_SRC.match(/\bcreateBtn\.onclick\s*=/g) || [];
  assert.equal(matches.length, 1, 'esperado exatamente um `createBtn.onclick = ...`');
});

test('6. o botão de criar continua chamando EXATAMENTE o mesmo fluxo (createTriageReviewBatch -> toast -> close -> onCreated)', () => {
  assert.match(
    MODAL_SRC,
    /const \{ created, skipped \} = createTriageReviewBatch\(chosen\);\s*\n\s*toast\(created\.length \? \(created\.length \+ ' pedido\(s\) de revisão criado\(s\) — use "🤖 Analisar pendências com IA" pra gerar o lote\.'\) : \('Nenhum pedido criado \(' \+ \(\(skipped\[0\] && skipped\[0\]\.reason\) \|\| 'erro'\) \+ '\)\.'\)\);\s*\n\s*close\(\);\s*\n\s*if\(typeof onCreated==='function'\) onCreated\(\);/
  );
});

test('7. updateCount é a ÚNICA função que escreve nos contadores — mesmo handler de seleção, só com mais um alvo de texto', () => {
  const updateCountMatches = MODAL_SRC.match(/const updateCount = \(\)=>\{/g) || [];
  assert.equal(updateCountMatches.length, 1, 'uma única definição de updateCount');
  assert.match(MODAL_SRC, /updateCount\(\);\s*\n\s*const selectAll/, 'chamada inicial, pra já nascer com "0 selecionada(s)"');
  // os dois ÚNICOS onchange continuam sendo select-all e a delegação da lista (nenhum terceiro handler).
  const onchangeMatches = MODAL_SRC.match(/\.onchange\s*=/g) || [];
  assert.equal(onchangeMatches.length, 2);
});

/* ===================== 3. comportamento real (fake DOM dirigido por seletor) ===================== */

const FN_NAMES = [
  'triageReasonLabel', 'triageNormalize', 'triageNotesReasons', 'triageTagsReasons', 'triageEnTermReasons',
  'triageClassificationApplicable', 'triageClassificationReasons', 'triageClinicalTagsReasons', 'triageRichImagesWeakNotesReasons',
  'evaluateLesionForTriage', 'scanCatalogForTriage', 'createTriageReviewBatch',
  'tokenizeExternalTitle', 'normalizeExternalTitle', 'classifyClassificationCompatibility',
  'hasActiveLesionReview', 'reviewScope', 'createLesionReview', 'genLesionReviewId', 'pushLesionReviewHistory'
];
const CONST_NAMES = [
  'TRIAGE_MIN_TAGS', 'TRIAGE_MIN_NOTES_CHARS', 'TRIAGE_MIN_NOTES_REMAINDER_TOKENS', 'TRIAGE_RICH_IMAGES_MIN',
  'TRIAGE_MIN_NOTES_CHARS_FOR_DIFFERENTIALS', 'TRIAGE_CLASSIFICATION_TRAUMA_SYSTEMS', 'TRIAGE_CLASSIFICATION_TRAUMA_HINT',
  'TRIAGE_CLASSIFICATION_BENIGN_EXCLUSIONS', 'TRIAGE_CLASSIFICATION_REQUIRED_HINTS',
  'TRIAGE_REASON_LABELS', 'TRIAGE_REASON_WEIGHTS', 'EXTERNAL_IMPORT_STOPWORDS', 'CLASSIFICATION_CONTEXT_RULES',
  'ACTIVE_LESION_REVIEW_STATUSES'
];

// innerHTML carrega o parser mínimo (data-id="...") na definição BASE, não
// via `extra`: Object.assign não compõe dois pares get/set acessor pro
// mesmo nome — só o par definido no objeto base sobrevive na mescla, por
// isso o parser precisa estar aqui (mesmo princípio de makeFakeEl() em
// image-sequence-compact-picker.test.js, cujo parser de data-seq também
// vive na base, nunca em `extra`).
function makeFakeEl(extra) {
  const el = Object.assign({
    tag: 'div', className: '', textContent: '', checked: false, disabled: false, hidden: false,
    dataset: {}, _html: '', _children: [],
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      this._children = [];
      const re = /data-id="([^"]*)"/g;
      let m;
      while ((m = re.exec(v))) this._children.push({ tag: 'input', checked: false, dataset: { id: m[1] }, onchange: null, classList: { contains: (c) => c === 'triage-check' } });
    },
    onclick: null, onchange: null,
    querySelector() { return null; },
    querySelectorAll(sel) { return sel === '.triage-check' ? this._children : []; },
    appendChild() {},
    remove() {}
  }, extra || {});
  return el;
}

function candidate(id, name) {
  return { id, name, s: 'Tórax', site: 'Mediastino', notes: '', tags: [], images: [] };
}

test('8. contador do rodapé começa em "0 selecionadas" (mesmo com candidatas na lista)', () => {
  const d = driveTriageModal([candidate('a', 'Lesão A'), candidate('b', 'Lesão B')]);
  assert.equal(d.footerCount.textContent, '0 selecionadas');
  assert.equal(d.toolbarCount.textContent, '0');
});

test('9. marcar/desmarcar via delegação da lista (listEl.onchange) atualiza o contador — 1 selecionada, depois 2, depois volta a 0', () => {
  const d = driveTriageModal([candidate('a', 'Lesão A'), candidate('b', 'Lesão B'), candidate('c', 'Lesão C')]);
  d.toggle(0, true);
  assert.equal(d.footerCount.textContent, '1 selecionada');
  assert.equal(d.toolbarCount.textContent, '1');
  d.toggle(1, true);
  assert.equal(d.footerCount.textContent, '2 selecionadas');
  d.toggle(0, false);
  assert.equal(d.footerCount.textContent, '1 selecionada');
  d.toggle(1, false);
  assert.equal(d.footerCount.textContent, '0 selecionadas');
});

test('10. "Selecionar todas" marca todas as caixas e atualiza o contador pro total', () => {
  const d = driveTriageModal([candidate('a', 'Lesão A'), candidate('b', 'Lesão B'), candidate('c', 'Lesão C')]);
  d.selectAll.checked = true;
  d.selectAll.onchange({ target: d.selectAll });
  assert.equal(d.footerCount.textContent, '3 selecionadas');
  assert.ok(d.boxes().every(b => b.checked));
  d.selectAll.checked = false;
  d.selectAll.onchange({ target: d.selectAll });
  assert.equal(d.footerCount.textContent, '0 selecionadas');
  assert.ok(d.boxes().every(b => !b.checked));
});

test('11. clicar em "criar pedidos" usa a seleção atual e chama createTriageReviewBatch (mesmo fluxo), fecha e chama onCreated', () => {
  const d = driveTriageModal([candidate('a', 'Lesão A'), candidate('b', 'Lesão B')]);
  d.toggle(0, true);
  d.createBtn.onclick();
  assert.ok(Object.values(d.lesionRevisions).some(r => r.lesionId === 'a'), 'criou pedido pra lesão selecionada');
  assert.ok(!Object.values(d.lesionRevisions).some(r => r.lesionId === 'b'), 'nunca cria pedido pra quem não foi selecionado');
  assert.equal(d.onCreatedCalls(), 1);
  assert.ok(d.toasts.length >= 1);
});

test('12. nenhuma seleção -> toast pedindo pra selecionar, nenhum pedido criado (mesmo guard de sempre)', () => {
  const d = driveTriageModal([candidate('a', 'Lesão A')]);
  d.createBtn.onclick();
  assert.deepEqual(d.lesionRevisions, {});
  assert.equal(d.onCreatedCalls(), 0);
  assert.ok(d.toasts.some(t => /Selecione ao menos uma candidata/.test(t)));
});

// `ov` fake: só os seletores que openProactiveTriageModal realmente usa —
// mesmo princípio de driveImageCard() (image-sequence-compact-picker.test.js):
// mapa exato por seletor, nunca um parser de HTML genérico. toggle() simula
// a MESMA delegação real (listEl.onchange recebendo o checkbox como target).
function driveTriageModal(data, lesionRevisions) {
  const toasts = [];
  const toolbarCount = makeFakeEl({ tag: 'span' });
  const footerCount = makeFakeEl({ tag: 'span' });
  const selectAll = makeFakeEl({ tag: 'input', checked: false });
  const createBtn = makeFakeEl({ tag: 'button' });
  const closeBtn = makeFakeEl({ tag: 'button' });
  const listEl = makeFakeEl({ tag: 'div' });
  const ov = makeFakeEl({
    tag: 'div',
    querySelector(sel) {
      if (sel === '#triage-close') return closeBtn;
      if (sel === '#triage-list') return listEl;
      if (sel === '#triage-selected-count') return toolbarCount;
      if (sel === '#triage-select-all') return selectAll;
      if (sel === '#triage-footer-count') return footerCount;
      if (sel === '#triage-create') return createBtn;
      return null;
    },
    querySelectorAll(sel) { return sel === '.triage-check' ? listEl._children : []; }
  });
  const lr = lesionRevisions || {};
  const sandbox = {
    console, DATA: data, LESION_REVISIONS: lr,
    document: { createElement: () => ov, addEventListener: () => {}, removeEventListener: () => {}, body: { appendChild: () => {} } },
    esc: (s) => String(s == null ? '' : s), escAttr: (s) => String(s == null ? '' : s),
    toast: (m) => toasts.push(m),
    saveLesionRevisions: async () => {}, updateReviewCenterBadges: () => {}
  };
  const ctx = vm.createContext(sandbox);
  const src = CONST_NAMES.map(extractConst).concat(FN_NAMES.map(extractFunction)).concat([MODAL_SRC]).join('\n');
  vm.runInContext(src + '\nthis.__open = openProactiveTriageModal;', ctx);
  let onCreatedCalls = 0;
  ctx.__open(() => { onCreatedCalls += 1; });
  return {
    toolbarCount, footerCount, selectAll, createBtn, toasts,
    boxes: () => listEl._children,
    toggle(idx, value) { listEl._children[idx].checked = value; listEl.onchange({ target: listEl._children[idx] }); },
    onCreatedCalls: () => onCreatedCalls,
    lesionRevisions: lr
  };
}
