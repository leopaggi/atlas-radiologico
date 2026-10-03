'use strict';

// UX — "compactar Sequências/modalidade no editor de imagem": o painel
// grande de chips fixos (IMG_PRESET_GROUPS, sempre montado, com toggle
// próprio) foi substituído por um seletor compacto que reaproveita o MESMO
// componente já usado no construtor de quadro (collageSeqSelectHtml +
// IMAGE_SEQUENCE_PRESETS, uma única fonte) — chips removíveis só das
// sequências já presentes + um <select> pra adicionar mais, com "Outra /
// personalizada…" revelando um campo + botão "+ adicionar". Persistência
// INTOCADA: continua sendo uma parte de `img.label` (" · "), exatamente
// como antes — é só apresentação. Mesmo padrão de extração de código-fonte
// real + vm das demais suítes do projeto; nenhuma reimplementação.

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
function extractConstSingleLine(name) {
  const m = new RegExp(`^const ${name} = .*;$`, 'm').exec(html);
  assert.ok(m, `const ${name} nao encontrada`);
  return m[0];
}
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

const renderImgGallerySrc = extractFunction('renderImgGallery');

/* ===================== 1. estrutura/estática — painel antigo removido ===================== */

test('1. editor não mostra mais o painel grande antigo (toggle + IMG_PRESET_GROUPS)', () => {
  assert.doesNotMatch(renderImgGallerySrc, /img-gallery-presets-toggle/);
  assert.doesNotMatch(renderImgGallerySrc, /img-gallery-preset-groups/);
  assert.doesNotMatch(renderImgGallerySrc, /IMG_PRESET_GROUPS/);
  assert.doesNotMatch(renderImgGallerySrc, /Sequências \/ modalidade/);
  assert.doesNotMatch(html, /const IMG_PRESET_GROUPS/, 'a constante do painel antigo foi removida, não só desconectada');
});

test('2. dropdown compacto aparece, reaproveitando o MESMO componente do construtor de quadro', () => {
  assert.match(renderImgGallerySrc, /\$\{collageSeqSelectHtml\('', IMAGE_SEQUENCE_PRESETS\)\}/);
  assert.match(html, /const seqs=IMAGE_SEQUENCE_PRESETS;/, 'openCollageBuilder usa a MESMA constante — nenhuma lista paralela');
});

test('3. opções existentes carregadas: IMAGE_SEQUENCE_PRESETS tem os valores reais já usados no projeto', () => {
  const m = /^const IMAGE_SEQUENCE_PRESETS = (\[[^\]]*\]);$/m.exec(html);
  assert.ok(m);
  const presets = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepEqual(presets, ['RX', 'MMG', 'U.S', 'TC C-', 'TC C+', 'RM T1', 'RM T2', 'RM T1 +', 'RM FLAIR', 'RM DIFUSAO', 'RM ADC', 'RM SWI', 'ANGIORM']);
});

/* ===================== 2. comportamento real (fake DOM dirigido por seletor) ===================== */

function makeFakeChipButton(seqValue) {
  return makeFakeEl({ tag: 'button', _attrs: { 'data-seq': seqValue } });
}

function makeFakeEl(extra) {
  const el = Object.assign({
    tag: 'div', className: '', _html: '', textContent: '', hidden: false, value: '', _attrs: {},
    _children: [], _removed: false,
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      // Parser mínimo: só o suficiente pra reconstruir os chips removíveis
      // (<button data-seq="...">) que o código real cria via template
      // string — não um parser de HTML genérico.
      this._children = [];
      const re = /data-seq="([^"]*)"/g;
      let m;
      while ((m = re.exec(v))) this._children.push(makeFakeChipButton(m[1]));
    },
    appendChild(c) { this._children.push(c); },
    remove() { this._removed = true; },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    focus() {},
    querySelectorAll(sel) {
      if (sel === '[data-seq]') return this._children.filter(c => !c._removed && c._attrs && 'data-seq' in c._attrs);
      return this._children.filter(c => !c._removed && (!sel || (c.className || '').includes(sel.replace(/^[.\[]|\]$/g, ''))));
    },
    querySelector() { return null; },
    addEventListener(type, fn) { this['_on' + type] = this['_on' + type] || []; this['_on' + type].push(fn); },
    dispatchEvent(ev) { (this['_on' + ev.type] || []).forEach(fn => fn(ev)); }
  }, extra || {});
  return el;
}

// Monta um `item` fake cujo querySelector devolve, por seletor exato, os
// elementos que o código real pede — mesmo padrão (byId/elFor) já usado
// com sucesso nas demais suítes do projeto pra essa função (evita reescrever
// um parser de innerHTML, que é frágil; aqui o que importa é testar a
// LÓGICA de wiring real, não um DOM completo).
function driveImageCard({ label }) {
  let pendingImgs = [{ data: 'a.png', label: label || '', source: 'local' }];
  let imgsChanged = false;
  const toasts = [];
  const renders = [];

  const seqChipsWrap = makeFakeEl({ className: 'img-gallery-seq-chips' });
  const seqSelect = makeFakeEl({ tag: 'select', className: 'collage-seq-select' });
  const seqCustomInput = makeFakeEl({ tag: 'input', className: 'collage-seq-custom', hidden: true });
  const seqCustomAddBtn = makeFakeEl({ tag: 'button', className: 'img-gallery-seq-custom-add', hidden: true });
  const seqPicker = makeFakeEl({
    className: 'img-gallery-seq-picker',
    querySelector(sel) {
      if (sel === '.collage-seq-select') return seqSelect;
      if (sel === '.collage-seq-custom') return seqCustomInput;
      if (sel === '.img-gallery-seq-custom-add') return seqCustomAddBtn;
      return null;
    }
  });
  const otherEls = {
    '.img-gallery-thumb': makeFakeEl({ tag: 'img' }),
    '[data-form-link]': null,
    '.img-gallery-swap': makeFakeEl({ tag: 'button' }),
    '.img-gallery-replace-file': makeFakeEl({ tag: 'button' }),
    '.img-gallery-replace-url-btn': makeFakeEl({ tag: 'button' }),
    '.img-gallery-label': makeFakeEl({ tag: 'textarea' }),
    '.img-clinical-box': makeFakeEl({ hidden: true }),
    '.img-clinical-toggle': makeFakeEl({ tag: 'button' }),
    '.img-clinical-sex': makeFakeEl({ tag: 'select', options: [{ value: '' }] }),
    '.img-clinical-presentation': makeFakeEl({ tag: 'textarea' }),
    '.img-clinical-age': makeFakeEl({ tag: 'input' }),
    '.img-clinical-notes': makeFakeEl({ tag: 'textarea' }),
    '.img-clinical-copy-prev': null,
    '.img-gallery-remove': makeFakeEl({ tag: 'button' })
  };

  const item = makeFakeEl({
    className: 'img-gallery-item',
    querySelector(sel) {
      if (sel === '.img-gallery-seq-chips') return seqChipsWrap;
      if (sel === '.img-gallery-seq-picker') return seqPicker;
      if (sel in otherEls) return otherEls[sel];
      return makeFakeEl();
    }
  });

  const imgGalleryEl = makeFakeEl({
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._children = []; },
    appendChild(c) { this._children.push(c); }
  });

  const sandbox = {
    document: { createElement: () => item, getElementById: () => null },
    console,
    didacticImageCtx: { getImages: () => {} },
    get pendingImgs() { return pendingImgs; }, set pendingImgs(v) { pendingImgs = v; },
    get imgsChanged() { return imgsChanged; }, set imgsChanged(v) { imgsChanged = v; },
    imgGallery: imgGalleryEl,
    esc: (s) => String(s == null ? '' : s),
    escAttr: (s) => String(s == null ? '' : s),
    toast: (m) => toasts.push(m),
    clinicalCasesDraft: [], radiologicSignsDraft: [], classificationSchemesDraft: [],
    openImageLightbox: () => {}, openImageLinkPicker: () => {}, openCollageBuilder: () => {},
    imageLinkButtonHtml: () => '',
    revokeObjectUrl: () => {},
    normalizeImageClinicalContext: () => null,
    expandedClinicalBoxes: new WeakSet(),
    replaceTargetIdx: null,
    imgFileInput: makeFakeEl({ tag: 'input' }),
    getCurrentLesionMeta: () => ({}),
    setDidacticDraft: () => {}, didacticFormApi: { render: () => {} }, renderClinicalCasesDraft: () => {}
  };
  const ctx = vm.createContext(sandbox);
  const collageSeqSelectHtmlSrc = extractFunction('collageSeqSelectHtml');
  const addSequenceToImageLabelSrc = extractFunction('addSequenceToImageLabel');
  const normalizeCustomSequenceSrc = extractFunction('normalizeCustomSequence');
  const customOptSrc = extractConstSingleLine('CUSTOM_SEQUENCE_OPTION');
  const presetsSrc = extractConstSingleLine('IMAGE_SEQUENCE_PRESETS');
  vm.runInContext(
    [customOptSrc, presetsSrc, normalizeCustomSequenceSrc, addSequenceToImageLabelSrc, collageSeqSelectHtmlSrc, renderImgGallerySrc].join('\n') +
    '\nthis.__render = function(){ renders.push(1); renderImgGallery(); }; this.renders = [];' +
    '\nthis.__render = renderImgGallery;',
    ctx
  );
  return {
    render: () => ctx.__render(),
    getLabel: () => pendingImgs[0].label,
    seqSelect, seqCustomInput, seqCustomAddBtn, seqChipsWrap,
    toasts
  };
}

test('4. selecionar uma opção do dropdown adiciona a sequência ao label (sem duplicar)', () => {
  const d = driveImageCard({ label: 'achado relevante' });
  d.render();
  d.seqSelect.value = 'RM T2';
  d.seqSelect.dispatchEvent({ type: 'change', target: d.seqSelect });
  assert.equal(d.getLabel(), 'achado relevante · RM T2');
  // escolher de novo não duplica (addSequenceToImageLabel real)
  d.render();
  d.seqSelect.value = 'RM T2';
  d.seqSelect.dispatchEvent({ type: 'change', target: d.seqSelect });
  assert.equal(d.getLabel(), 'achado relevante · RM T2');
});

test('5. "Outra / personalizada…" revela campo + botão; adicionar grava o texto exato', () => {
  const d = driveImageCard({ label: '' });
  d.render();
  d.seqSelect.value = '__custom__';
  d.seqSelect.dispatchEvent({ type: 'change', target: d.seqSelect });
  assert.equal(d.seqCustomInput.hidden, false, 'campo livre aparece');
  assert.equal(d.seqCustomAddBtn.hidden, false, 'botão adicionar aparece');
  d.seqCustomInput.value = 'PD FAT SAT';
  d.seqCustomAddBtn.dispatchEvent({ type: 'click' });
  assert.equal(d.getLabel(), 'PD FAT SAT');
});

test('6. "+ adicionar" vazio avisa e não grava nada', () => {
  const d = driveImageCard({ label: 'RM T1' });
  d.render();
  d.seqSelect.value = '__custom__';
  d.seqSelect.dispatchEvent({ type: 'change', target: d.seqSelect });
  d.seqCustomInput.value = '   ';
  d.seqCustomAddBtn.dispatchEvent({ type: 'click' });
  assert.equal(d.getLabel(), 'RM T1', 'nada foi alterado');
  assert.ok(d.toasts.length >= 1, 'avisou o usuário');
});

test('7. remover chip funciona — tira só aquela sequência, preserva as outras e o texto livre', () => {
  const d = driveImageCard({ label: 'RM T1 · achado relevante · RM T2' });
  d.render();
  assert.equal(d.seqChipsWrap._html.includes('RM T1'), true);
  assert.equal(d.seqChipsWrap._html.includes('RM T2'), true);
  const btn = d.seqChipsWrap._children.find(c => c.getAttribute('data-seq') === 'RM T1');
  assert.ok(btn, 'chip "RM T1" renderizado com botão de remover');
  btn.dispatchEvent({ type: 'click' });
  assert.equal(d.getLabel(), 'achado relevante · RM T2', 'RM T1 removido; o resto preservado');
});

test('8. valores existentes carregam corretamente: chips refletem exatamente as presets já presentes no label', () => {
  const d = driveImageCard({ label: 'RM T1 · RM FLAIR · PD FAT SAT (personalizada)' });
  d.render();
  const chipTexts = d.seqChipsWrap._children.map(c => c.getAttribute('data-seq'));
  assert.deepEqual(chipTexts.sort(), ['RM FLAIR', 'RM T1'].sort(), 'só as presets reconhecidas viram chip; o texto livre continua no label/textarea, não como chip');
});

test('9. salvar preserva dados: a sequência some do label 1:1 com addSequenceToImageLabel/remoção manual (nenhuma transformação extra)', () => {
  const normalizeCustomSequenceSrc = extractFunction('normalizeCustomSequence');
  const addSequenceToImageLabelSrc = extractFunction('addSequenceToImageLabel');
  const ctx = vm.createContext({});
  vm.runInContext(normalizeCustomSequenceSrc + '\n' + addSequenceToImageLabelSrc + '\nthis.__add = addSequenceToImageLabel;', ctx);
  assert.equal(ctx.__add('RM T1', 'RM T2'), 'RM T1 · RM T2');
  assert.equal(ctx.__add('RM T1 · RM T2', 'RM T1'), 'RM T1 · RM T2', 'idempotente/sem duplicar');
});

/* ===================== 3. zero mudança de schema / zero regressão no resto ===================== */

test('10. nenhuma mudança de schema: continua sendo img.label (string), nenhum campo novo', () => {
  const region = stripJsComments(renderImgGallerySrc);
  assert.ok(!/img\.sequences\s*=|img\.modalities\s*=|img\.seqList\s*=/.test(region), 'nenhum campo novo foi inventado');
  assert.match(region, /pendingImgs\[idx\]\.label = /);
});

test('11. zero chamada a saveData/Firestore/localStorage na região do seletor (presentation-only)', () => {
  const start = renderImgGallerySrc.indexOf('const seqChipsWrap');
  const end = renderImgGallerySrc.indexOf("addEventListener('keydown'", start) + 200;
  const region = stripJsComments(renderImgGallerySrc.slice(start, end > start ? end : renderImgGallerySrc.length));
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
});

test('12. lightbox/Quiz não foram tocados pelo seletor de sequência (openImageLightbox continua recebendo img.data/img.label/pendingImgs/idx)', () => {
  // lrev — a chamada ganhou o resolver de contexto clínico numa rodada
  // separada (paridade com openDetail); aqui só confirmamos que o SELETOR
  // DE SEQUÊNCIA não alterou esses 4 argumentos nem a chamada em si.
  assert.match(renderImgGallerySrc, /openImageLightbox\(img\.data, img\.label, pendingImgs, idx, /);
  assert.doesNotMatch(html.slice(html.indexOf('function openImageLightbox(')), /IMAGE_SEQUENCE_PRESETS|collage-seq-select/, 'lightbox não referencia nada do seletor de sequência');
});
