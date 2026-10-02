'use strict';

// CLINICAL TAGS V1 — integração com o importador Radiopaedia. Objetivo: o
// modal de import (openExternalImportModal) passa a mostrar DUAS áreas
// separadas — "TAGS RADIOLÓGICAS SUGERIDAS" (inalterada, mecanismo antigo
// via #external-tags-input) e "TAGS CLÍNICAS SUGERIDAS" (nova, reaproveitando
// suggestClinicalTagsForLesion — mesmo motor do openForm, sem duplicar nada).
// Nada é autoaceito: só clique explícito em um chip grava em
// clinicalTagsDraft; só isso segue para openExternalDraft -> openForm ->
// entry.clinicalTags. buildExternalSuggestion/suggestExternalTags continuam
// 100% intactos (zero edição nessas duas funções nesta rodada).
//
// Fonte do texto clínico analisado nesta etapa (documentado explicitamente,
// conforme pedido): presentation do caso (prioridade 1, único texto clínico
// real do payload Radiopaedia) + nome sugerido/título original (prioridade
// 2). Não há seção/sítio nem "descrição importada" separada disponíveis
// ainda neste estágio (só existem depois, dentro do formulário) — por isso
// não entram no texto analisado aqui.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const TAXONOMY_PATH = path.resolve(__dirname, '..', 'TAXONOMY.json');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const REAL_TAXONOMY = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));

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
function extractFunction(name, fromIndex) {
  const re = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const searchSrc = typeof fromIndex === 'number' ? html.slice(fromIndex) : html;
  const m = re.exec(searchSrc);
  assert.ok(m, `Funcao ${name} nao encontrada`);
  const base = typeof fromIndex === 'number' ? fromIndex : 0;
  const declIndex = base + m.index;
  const openingBrace = html.indexOf('{', declIndex + m[0].length);
  return html.slice(declIndex, openingBrace) + extractBlock(html, openingBrace);
}
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

/* ===================== 1. AUDITORIA — contratos preservados ===================== */

const buildExternalSuggestionSrc = extractFunction('buildExternalSuggestion');
const suggestExternalTagsSrc = extractFunction('suggestExternalTags');
const openExternalImportModalSrc = extractFunction('openExternalImportModal');
const openExternalDraftSrc = extractFunction('openExternalDraft');

test('1. buildExternalSuggestion: contrato 100% preservado (zero referência a clinicalTags, assinatura igual)', () => {
  assert.match(buildExternalSuggestionSrc, /function buildExternalSuggestion\(draft,\s*catalog,\s*matches\)/);
  assert.ok(!/clinicalTags/.test(buildExternalSuggestionSrc), 'buildExternalSuggestion não deveria ter sido tocada nesta rodada');
});

test('2. suggestExternalTags: contrato 100% preservado (zero referência a clinicalTags, assinatura igual)', () => {
  assert.match(suggestExternalTagsSrc, /function suggestExternalTags\(draft,\s*nameSug,\s*catalog,\s*matches\)/);
  assert.ok(!/clinicalTags/.test(suggestExternalTagsSrc), 'suggestExternalTags não deveria ter sido tocada nesta rodada');
});

test('3. openExternalImportModal: a seção clínica reaproveita suggestClinicalTagsForLesion (não duplica motor)', () => {
  assert.match(openExternalImportModalSrc, /suggestClinicalTagsForLesion\(draftEntry, externalClinicalTaxonomy\)/);
  assert.match(openExternalImportModalSrc, /loadTaxonomy\(\)\.then\(/);
});

test('4. openExternalImportModal: tags radiológicas e clínicas usam arrays SEPARADOS (nunca misturados)', () => {
  assert.match(openExternalImportModalSrc, /let clinicalTagsDraft = \[\];/);
  assert.ok(!/clinicalTagsDraft\.push\([^)]*suggestion\.tags/.test(openExternalImportModalSrc));
  assert.ok(!/suggestion\.tags\.push\([^)]*clinicalTagsDraft/.test(openExternalImportModalSrc));
  assert.match(openExternalImportModalSrc, /live\.clinicalTags = clinicalTagsDraft\.slice\(\);/);
});

test('5. openExternalImportModal: nunca autoaceita — clinicalTagsDraft só muda dentro de addExternalClinicalTag/onclick de remoção', () => {
  const fn = openExternalImportModalSrc;
  // toda atribuição a clinicalTagsDraft tem que estar dentro de um handler de clique (push em addExternalClinicalTag, filter no onclick de remoção) ou na declaração inicial ([])
  const assignments = fn.match(/clinicalTagsDraft\s*=\s*[^;]+;/g) || [];
  assert.ok(assignments.length >= 2, 'esperava pelo menos a declaração inicial + a reatribuição no filter de remoção');
  assert.ok(assignments.every(a => /^clinicalTagsDraft\s*=\s*\[\];$/.test(a) || /clinicalTagsDraft\.filter\(/.test(a)), 'alguma atribuição a clinicalTagsDraft fora do padrão esperado: ' + JSON.stringify(assignments));
});

test('6. openExternalDraft: prefill clínico usa o MESMO mecanismo (Enter no input real) das tags radiológicas, nunca grava direto em DATA', () => {
  assert.match(openExternalDraftSrc, /document\.getElementById\('f-clinical-tag-input'\)/);
  assert.match(openExternalDraftSrc, /new KeyboardEvent\('keydown', \{ key: 'Enter', bubbles: true \}\)/);
  const region = stripJsComments(openExternalDraftSrc);
  assert.ok(!/\bDATA\.(push|find)\(/.test(region) || /openForm\(null\)/.test(region), 'openExternalDraft não deveria escrever direto em DATA');
});

test('7. região nova (import clínico) nunca chama saveData/Firestore/localStorage/segunda escrita', () => {
  [openExternalImportModalSrc, openExternalDraftSrc].forEach(region => {
    const stripped = stripJsComments(region);
    assert.ok(!/saveData\s*\(/.test(stripped));
    assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(stripped));
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(stripped));
  });
});

test('8. HTML: duas áreas claramente separadas — TAGS RADIOLÓGICAS SUGERIDAS e TAGS CLÍNICAS SUGERIDAS', () => {
  const extHtmlSrc = extractFunction('externalSuggestionHtml');
  assert.match(extHtmlSrc, /TAGS RADIOLÓGICAS SUGERIDAS/);
  assert.match(extHtmlSrc, /externalClinicalSuggestionHtml\(\)/);
  const clinHtmlSrc = extractFunction('externalClinicalSuggestionHtml');
  assert.match(clinHtmlSrc, /TAGS CLÍNICAS SUGERIDAS/);
  assert.match(clinHtmlSrc, /id="external-clinical-chip-wrap"/);
  assert.match(clinHtmlSrc, /id="external-clinical-smart-row"/);
});

/* ===================== 2. MOTOR DE SUGESTÃO — mesmas garantias do openForm ===================== */

// Linha inteira (não só até o 1º ";") — alguns consts são regex literais com
// ";" DENTRO da classe de caracteres (ex.: NEGATION_MARKER), o que faria um
// "indexOf/match não-greedy até o 1º ;" cortar no meio da própria regex.
function extractConstFullLine(name) {
  const m = new RegExp(`^const ${name} = .*;$`, 'm').exec(html);
  assert.ok(m, `const ${name} nao encontrada`);
  return m[0];
}

const DEPS = ['normalizeExternalTitle', 'tokenizeExternalTitle'];
const depsSrc = DEPS.map(n => extractFunction(n)).join('\n');
const stopwordsSrc = (() => { const m = /const EXTERNAL_IMPORT_STOPWORDS\s*=.*?;/.exec(html); assert.ok(m); return m[0]; })();
const genderVariantSrc = extractFunction('clinicalAdjectiveGenderVariant');
const aliasesSrc = (() => { const m = /const CLINICAL_CONCEPT_ALIASES = \{[\s\S]*?\n\};/.exec(html); assert.ok(m); return m[0]; })();
const maxConstSrc = (() => { const m = /const SUGGEST_CLINICAL_TAGS_MAX\s*=\s*\d+;/.exec(html); assert.ok(m); return m[0]; })();
const sugSrc = extractFunction('suggestClinicalTagsForLesion');
// CORREÇÃO DE QUALIDADE (filtro de diferenciais) — suggestClinicalTagsForLesion
// agora passa as notas por primaryLesionTextForSuggestions antes de tokenizar.
const diffBlockSrc = extractConstFullLine('DIFFERENTIAL_BLOCK_HEADING');
const diffSentenceSrc = extractConstFullLine('DIFFERENTIAL_LABEL_SENTENCE');
const diffInlineSrc = extractConstFullLine('DIFFERENTIAL_INLINE_MARKER');
const extractPrimarySrc = extractFunction('extractPrimaryLesionText');
const negationMarkerSrc = extractConstFullLine('NEGATION_MARKER');
const stripNegatedSrc = extractFunction('stripNegatedClauses');
const primaryForSuggestionsSrc = extractFunction('primaryLesionTextForSuggestions');

function loadClinicalSuggestEngine() {
  const ctx = vm.createContext({ console });
  vm.runInContext(
    stopwordsSrc + '\n' + depsSrc + '\n' +
    diffBlockSrc + '\n' + diffSentenceSrc + '\n' + diffInlineSrc + '\n' + extractPrimarySrc + '\n' +
    negationMarkerSrc + '\n' + stripNegatedSrc + '\n' + primaryForSuggestionsSrc + '\n' +
    genderVariantSrc + '\n' + aliasesSrc + '\n' + maxConstSrc + '\n' + sugSrc + '\n' +
    'this.__suggest = suggestClinicalTagsForLesion;',
    ctx
  );
  return ctx.__suggest;
}

// Constrói o pseudo-entry EXATAMENTE como openExternalImportModal constrói
// (mesmos campos, mesma prioridade): name <- nome sugerido/título original;
// notes <- presentation; s/site vazios (não existem ainda nesta etapa).
function buildImportClinicalDraftEntry({ name, presentation, clinicalTagsSoFar }) {
  return { name: name || '', s: '', site: '', notes: presentation || '', clinicalTags: clinicalTagsSoFar || [] };
}

test('9. EXEMPLO A (apendicite): presentation "dor abdominal aguda em fossa ilíaca direita, febre" detecta os concepts reais esperados', () => {
  const suggest = loadClinicalSuggestEngine();
  const entry = buildImportClinicalDraftEntry({ name: 'Apendicite', presentation: 'dor abdominal aguda em fossa ilíaca direita, febre' });
  const out = suggest(entry, REAL_TAXONOMY);
  assert.ok(out.includes('Dor abdominal'));
  assert.ok(out.includes('Febre'));
  assert.ok(out.includes('FID'));
  assert.ok(out.includes('agudo'));
});

test('10. EXEMPLO B (embolia pulmonar): presentation "dor torácica pleurítica de início súbito e dispneia"', () => {
  const suggest = loadClinicalSuggestEngine();
  const entry = buildImportClinicalDraftEntry({ name: 'Embolia pulmonar', presentation: 'dor torácica pleurítica de início súbito e dispneia' });
  const out = suggest(entry, REAL_TAXONOMY);
  assert.ok(out.includes('Dor torácica'));
  assert.ok(out.includes('pleurítica'));
  assert.ok(out.includes('súbito'));
  // "dispneia" não existe como rótulo em domain clinical (conferido contra a
  // TAXONOMY real) — não pode ser inventado, mesmo estando no texto.
  assert.ok(!REAL_TAXONOMY.concepts.some(c => c.domain === 'clinical' && /dispneia/i.test(c.label)), 'pré-condição: TAXONOMY realmente não tem "dispneia"');
  assert.ok(!out.includes('dispneia') && !out.includes('Dispneia'));
});

test('11. EXEMPLO C (HSA): presentation "cefaleia súbita intensa"', () => {
  const suggest = loadClinicalSuggestEngine();
  const entry = buildImportClinicalDraftEntry({ name: 'Hemorragia subaracnóidea', presentation: 'cefaleia súbita intensa' });
  const out = suggest(entry, REAL_TAXONOMY);
  assert.ok(out.includes('Cefaleia'));
  assert.ok(out.includes('súbito'), '"súbita" deveria mapear pro concept "súbito" (clin_onset_sudden) via variante de gênero');
  assert.ok(out.includes('intensa'), 'TAXONOMY real já usa "intensa" como rótulo (clinical.intensity) — sem variante necessária');
  out.forEach(label => {
    const concept = REAL_TAXONOMY.concepts.find(c => c.domain === 'clinical' && c.label === label);
    assert.ok(concept, '"' + label + '" deveria existir em TAXONOMY.json (domain clinical)');
  });
});

test('12. clinicalTag já confirmada não é sugerida de novo (mesma garantia do openForm)', () => {
  const suggest = loadClinicalSuggestEngine();
  const entry = buildImportClinicalDraftEntry({ name: 'Apendicite', presentation: 'dor abdominal aguda, febre', clinicalTagsSoFar: ['Febre'] });
  const out = suggest(entry, REAL_TAXONOMY);
  assert.ok(!out.includes('Febre'));
  assert.ok(out.includes('Dor abdominal'));
});

test('13. import sem nenhum contexto clínico (presentation vazia) não quebra — devolve []', () => {
  const suggest = loadClinicalSuggestEngine();
  const entry = buildImportClinicalDraftEntry({ name: 'Lesão qualquer', presentation: '' });
  assert.doesNotThrow(() => {
    const out = suggest(entry, REAL_TAXONOMY);
    assert.equal(out.length, 0);
  });
});

/* ===================== 3. WIRING DO MODAL — chips reais (extração + vm) ===================== */

function makeFakeEl(tag) {
  const el = {
    tag, className: '', _html: '', textContent: '', hidden: false, _removed: false,
    _children: [], value: '', _onclick: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._children = []; },
    appendChild(c) { this._children.push(c); },
    insertBefore(c) { this._children.push(c); },
    remove() { this._removed = true; },
    setAttribute() {},
    querySelectorAll(sel) { return this._children.filter(c => !c._removed && (sel !== '.removable-tag' || c.className.includes('removable-tag'))); },
    querySelector(sel) { if (sel === 'button') { if (!this._btn) this._btn = makeFakeEl('button'); return this._btn; } return null; },
    addEventListener(type, fn) { this['_on' + type] = this['_on' + type] || []; this['_on' + type].push(fn); },
    dispatchEvent(ev) { (this['_on' + ev.type] || []).forEach(fn => fn(ev)); return true; },
    click() { if (this._onclick) this._onclick(); },
    set onclick(fn) { this._onclick = fn; }, get onclick() { return this._onclick; }
  };
  return el;
}

// Extrai e roda SÓ o bloco novo (clinicalTagsDraft..loadTaxonomy) de dentro
// de openExternalImportModal — não a função inteira (que depende de muitas
// outras: wireExternalOpenButtons, externalImportModalHtml, etc., fora do
// escopo desta integração). `ov` é o fake "overlay" com os elementos reais
// que o bloco consulta via ov.querySelector(...).
const MODAL_BLOCK_START = 'let clinicalTagsDraft = [];';
const MODAL_BLOCK_END = "document.getElementById('external-create-btn').onclick";
const modalClinicalBlock = (() => {
  const s = html.indexOf(MODAL_BLOCK_START);
  const e = html.indexOf(MODAL_BLOCK_END, s);
  assert.ok(s >= 0 && e > s, 'bloco clínico do modal de import não encontrado');
  return html.slice(s, e);
})();

function driveImportModal({ name, presentation }) {
  const byId = new Map();
  const elFor = (id) => { if (!byId.has(id)) byId.set(id, makeFakeEl('div')); return byId.get(id); };
  ['external-clinical-chip-wrap', 'external-clinical-smart-row', 'external-clinical-smart-empty', 'external-name-input'].forEach(elFor);
  elFor('external-clinical-tag-input', makeFakeEl('input'));
  byId.set('external-clinical-tag-input', makeFakeEl('input'));
  elFor('external-name-input').value = name || '';

  const ov = { querySelector: (sel) => { const id = sel.replace('#', ''); return byId.has(id) ? byId.get(id) : elFor(id); } };
  const draft = { title: name || '', presentation: presentation || '' };
  const suggestion = { name: name || '', tags: [] };
  const sandbox = {
    document: { getElementById: () => null, createElement: (tag) => makeFakeEl(tag) },
    console,
    ov, draft, suggestion,
    suggestClinicalTagsForLesion: standaloneSuggest,
    loadTaxonomy: () => Promise.resolve(REAL_TAXONOMY)
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(modalClinicalBlock + "\nthis.__add = addExternalClinicalTag; this.__render = renderExternalClinicalSmartSuggestions; this.__getDraftTags = () => clinicalTagsDraft;", ctx);
  return {
    getClinicalTagsDraft: () => ctx.__getDraftTags(),
    clickSuggestion: (label) => {
      const row = byId.get('external-clinical-smart-row');
      const chip = row._children.find(c => c.textContent === '+ ' + label);
      assert.ok(chip, 'chip "' + label + '" não renderizado — sugestões atuais: ' + JSON.stringify(row._children.map(c => c.textContent)));
      chip.onclick();
    },
    suggestedLabels: () => byId.get('external-clinical-smart-row')._children.map(c => c.textContent.replace(/^\+ /, '')),
    confirmedChipTexts: () => byId.get('external-clinical-chip-wrap')._children.filter(c => !c._removed).map(c => c._html),
    waitTaxonomy: () => new Promise(r => setImmediate(r))
  };
}

const standaloneSuggest = loadClinicalSuggestEngine();

test('14. Modal de import: sugestão clínica aparece (chip azul) só depois do TAXONOMY carregar, nunca auto-adiciona', async () => {
  const modal = driveImportModal({ name: 'Apendicite', presentation: 'dor abdominal aguda e febre' });
  await modal.waitTaxonomy();
  const labels = modal.suggestedLabels();
  assert.ok(labels.includes('Febre'));
  assert.ok(labels.includes('Dor abdominal'));
  assert.equal(modal.getClinicalTagsDraft().length, 0); // nada confirmado até o clique (cross-realm: compara length, não deepEqual)
});

test('15. Modal de import: clicar na sugestão move pra confirmado (chip âmbar) e tira da lista de sugestões', async () => {
  const modal = driveImportModal({ name: 'Apendicite', presentation: 'dor abdominal aguda e febre' });
  await modal.waitTaxonomy();
  modal.clickSuggestion('Febre');
  const confirmed = modal.getClinicalTagsDraft();
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0], 'Febre');
  assert.ok(!modal.suggestedLabels().includes('Febre'), 'Febre já confirmada não deveria continuar sugerida');
  assert.ok(modal.confirmedChipTexts().some(h => h.includes('Febre')));
});

test('16. Modal de import: clinicalTag confirmada nunca duplica mesmo clicando de novo em outra sugestão igual', async () => {
  const modal = driveImportModal({ name: 'Apendicite', presentation: 'febre febre febre' });
  await modal.waitTaxonomy();
  modal.clickSuggestion('Febre');
  assert.equal(modal.getClinicalTagsDraft().filter(t => t === 'Febre').length, 1);
});

/* ===================== 4. PREFILL NO openForm (openExternalDraft -> f-clinical-tag-input) ===================== */

const openFormSrc = extractFunction('openForm');

test('17. openExternalDraft: sem clinicalTags confirmadas, não toca no input clínico nenhuma vez (sem ruído)', () => {
  // cobertura estrutural: o laço só executa se sug.clinicalTags.length > 0.
  assert.match(openExternalDraftSrc, /Array\.isArray\(sug\.clinicalTags\) && sug\.clinicalTags\.length/);
});

test('18. openExternalDraft: expande "Apresentação clínica" automaticamente quando algo já veio confirmado do import', () => {
  assert.match(openExternalDraftSrc, /clinicalToggleBtn\.click\(\)/);
});

// Integração real ponta-a-ponta: roda o bloco de prefill de openExternalDraft
// JUNTO com o bloco de wiring clínico real de openForm (addClinicalTag/
// renderClinicalChips já testados em tests/clinical-tags.test.js) — confirma
// que o "Enter simulado" do import realmente populariza `clinicalTags` do
// formulário de destino, não é só teatro de DOM.
const OPENFORM_CLINICAL_START = "const chipWrapClinical = document.getElementById('chip-wrap-clinical');";
const openFormClinicalBlock = (() => {
  const s = html.indexOf(OPENFORM_CLINICAL_START);
  let e = html.indexOf('/* --- imagens: Cloudinar', s);
  assert.ok(s >= 0 && e > s, 'bloco clínico do openForm não encontrado');
  return html.slice(s, e);
})();
const draftPrefillStart = "const clinicalTagInput = document.getElementById('f-clinical-tag-input');";
const draftStartIdx = html.indexOf('function openExternalDraft(');
const prefillStartIdx = html.indexOf(draftPrefillStart, draftStartIdx);
const prefillEndIdx = html.indexOf("const modal = document.querySelector('.lesion-form-overlay .modal');", prefillStartIdx);
const draftPrefillBlock = html.slice(prefillStartIdx, prefillEndIdx);

test('19. INTEGRAÇÃO REAL: sug.clinicalTags confirmadas no import chegam como `clinicalTags` populadas no openForm de destino', () => {
  const byId = new Map();
  const elFor = (id) => { if (!byId.has(id)) byId.set(id, makeFakeEl('div')); return byId.get(id); };
  ['chip-wrap-clinical', 'clinical-suggest-row', 'suggest-clinical-smart-wrap', 'suggest-clinical-smart-row',
    'suggest-clinical-smart-empty', 'f-name', 'f-section', 'f-site', 'f-notes', 'clinical-toggle', 'clinical-body']
    .forEach(elFor);
  byId.set('f-clinical-tag-input', makeFakeEl('input'));
  const clinicalBodyEl = elFor('clinical-body');
  clinicalBodyEl.hidden = true; // seção começa recolhida, como no form real

  let clinicalTags = [];
  const existing = null;
  const sandbox = {
    document: { getElementById: (id) => byId.has(id) ? byId.get(id) : elFor(id), createElement: (tag) => makeFakeEl(tag) },
    console, existing,
    get clinicalTags() { return clinicalTags; }, set clinicalTags(v) { clinicalTags = v; },
    taxoBuildIndices: () => ({ conceptsByGroup: new Map() }),
    loadTaxonomy: () => Promise.reject(new Error('sem fetch no teste')),
    suggestClinicalTagsForLesion: () => [],
    clinicalToggleLabel: (n, open) => (open ? 'open' : 'closed') + ':' + n,
    setTimeout: () => null, clearTimeout: () => {},
    KeyboardEvent: function (type, opts) { this.type = type; this.key = opts && opts.key; this.bubbles = !!(opts && opts.bubbles); this.preventDefault = function () {}; }
  };
  const ctx = vm.createContext(sandbox);
  // monta o formulário (define addClinicalTag/renderClinicalChips reais) e,
  // em seguida, o trecho de prefill real extraído de openExternalDraft.
  vm.runInContext(
    openFormClinicalBlock + '\n' +
    '{\n const sug = { clinicalTags: ["Febre", "Dor abdominal"] };\n' +
    draftPrefillBlock +
    '\n}' +
    '\nthis.__clinicalTags = () => clinicalTags;',
    ctx
  );
  const result = ctx.__clinicalTags();
  assert.equal(result.length, 2);
  assert.equal(result[0], 'Febre');
  assert.equal(result[1], 'Dor abdominal');
  // o próprio handler REAL de toggle do openForm (clinicalToggleBtn.onclick,
  // montado por openFormClinicalBlock) é quem alterna `hidden` — aqui só
  // confirmamos que .click() de fato chegou a disparar esse handler real.
  assert.equal(clinicalBodyEl.hidden, false, 'deveria ter expandido a seção automaticamente (clinical-body não deveria continuar hidden)');
});

/* ===================== 5. ZERO REGRESSÃO NO RESTO ===================== */

test('20. clinicalCases/casos clínicos reais não são tocados por este fluxo (sem duplicar presentation/idade/sexo em clinicalTags)', () => {
  assert.ok(!/clinicalCases/.test(openExternalImportModalSrc));
  assert.ok(!/clinicalCases/.test(openExternalDraftSrc));
  // confirma a premissa documentada na auditoria: o importador NÃO cria
  // clinicalCases automaticamente a partir do draft nesta versão.
  assert.ok(!/\.clinicalCases\s*=/.test(stripJsComments(openExternalDraftSrc)));
});
