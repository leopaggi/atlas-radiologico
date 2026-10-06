'use strict';

/* Botão "ver lesão" da aba Propostas (modal 💡 Soluções) ganhou o MESMO
 * preview por hover já usado em "ver lesão" (Pendentes) e "👁 ver lesão
 * corrigida" (Validar correções) — reaproveitando wireLesionHoverPreview()
 * já existente, sem sistema novo.
 *
 * Duas camadas, como o resto do projeto (ver tests/lesion-hover-preview.test.js
 * e tests/manual-action-ai-export.test.js para o mesmo padrão):
 *  1) ESTÁTICA — no corpo real de openReadySolutionsModal extraído do
 *     index.html: o botão "ver lesão" da aba Propostas chama
 *     wireLesionHoverPreview com o lesionId correto; o onclick continua
 *     exatamente o mesmo (abre o detalhe, nunca autoriza/rejeita/resolve).
 *  2) COMPORTAMENTAL — wireLesionHoverPreview()/openLesionHoverPreview()
 *     REAIS, com um botão/DOM falso mínimo (mesmo harness de
 *     lesion-hover-preview.test.js): hover mostra o preview da lesão
 *     correta; mouseleave remove; nenhum clique é disparado; nenhum
 *     preview duplicado; DATA/LESION_REVISIONS nunca são referenciados
 *     pelo mecanismo de hover.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  const open = source.indexOf('{', m.index);
  let depth = 0, quote = '', esc = false, line = false, block = false, end = -1;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i += 1; } continue; }
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i += 1; continue; }
    if (c === '/' && n === '*') { block = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, 'função sem fechamento: ' + name);
  return source.slice(m.index, end + 1);
}

// ===========================================================================
// 1) ESTÁTICA — openReadySolutionsModal real.
// ===========================================================================
const readySolutionsSrc = extractFn(html, 'openReadySolutionsModal');

// Isola só o trecho da aba "Propostas" (entre a declaração de renderProposedList
// e a de renderAppliedList, que vem imediatamente depois) para não confundir
// com o hover que as OUTRAS abas já tinham antes desta correção.
const proposedListSrc = readySolutionsSrc.slice(
  readySolutionsSrc.indexOf('const renderProposedList'),
  readySolutionsSrc.indexOf('const renderAppliedList')
);

test('ESTÁTICO: botão "ver lesão" da aba Propostas agora usa wireLesionHoverPreview (mesmo mecanismo já existente)', () => {
  assert.match(proposedListSrc, /class="btn btn-ghost review-open-lesion">ver lesão<\/button>/, 'botão "ver lesão" precisa continuar existindo');
  assert.match(proposedListSrc, /wireLesionHoverPreview\(\s*openLesionBtn\s*,\s*meta\.lesion\.id\s*\)/,
    'precisa reaproveitar wireLesionHoverPreview com o id da lesão da própria proposta');
});

test('ESTÁTICO: clique continua abrindo só o detalhe (nunca autoriza/rejeita/resolve/fecha scroll) — comportamento de clique preservado', () => {
  assert.match(proposedListSrc, /openLesionBtn\.onclick\s*=\s*\(\)\s*=>\s*\{\s*closeLesionHoverPreview\(\);\s*closeAllAndCleanup\(\);\s*openDetail\(meta\.lesion\.id\);\s*\}/);
  // O onclick do "ver lesão" (isolado por slice até o próximo querySelector
  // de histórico) não pode conter nenhuma das ações humanas da proposta.
  const onclickBlock = proposedListSrc.slice(proposedListSrc.indexOf('openLesionBtn.onclick'), proposedListSrc.indexOf("querySelector('.review-open-history')"));
  for (const forbidden of ['authorizeAndApplyReviewSolution', 'rejectProposedReviewSolution', 'confirmNoChangeReviewSolution', 'wireReviewResolveButton', 'runAiSolutionPipeline']) {
    assert.ok(!onclickBlock.includes(forbidden), 'onclick do "ver lesão" não pode chamar ' + forbidden);
  }
});

test('ESTÁTICO: só UMA chamada de wireLesionHoverPreview para o botão "ver lesão" desta aba (sem wiring duplicado)', () => {
  const matches = proposedListSrc.match(/wireLesionHoverPreview\(\s*openLesionBtn\s*,/g) || [];
  assert.equal(matches.length, 1);
});

// ===========================================================================
// 2) COMPORTAMENTAL — wireLesionHoverPreview()/openLesionHoverPreview() reais
//    (mesmo harness de tests/lesion-hover-preview.test.js), exercitados como
//    o botão "ver lesão" das Propostas efetivamente os usa.
// ===========================================================================
function extractFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(source); assert.ok(m, 'função não encontrada: ' + name);
  const ob = source.indexOf('{', m.index + m[0].length);
  let depth = 0, q = null, esc = false, end = -1;
  for (let i = ob; i < source.length; i += 1) {
    const c = source[i];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, 'bloco sem fechamento: ' + name);
  return { source: source.slice(m.index, end + 1), body: source.slice(ob + 1, end) };
}
const PREVIEW_FNS = ['lesionHoverSupported', 'lesionHoverPreviewHtml', 'positionLesionHoverPreview',
  'closeLesionHoverPreview', 'openLesionHoverPreview', 'wireLesionHoverPreview'];
const PREVIEW_SRC = PREVIEW_FNS.map((n) => extractFunction(html, n).source).join('\n');
function extractLineFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^\\n\\r]*\\}', 'm');
  const m = re.exec(source); assert.ok(m, 'helper de uma linha não encontrado: ' + name);
  return m[0];
}
const ESC_SRC = ['esc', 'escAttr'].map((n) => extractLineFunction(html, n)).join('\n');
const PREVIEW_STATE_SRC = html.slice(
  html.indexOf('let lesionHoverPreviewEl'),
  html.indexOf('function lesionHoverSupported(')
);

function makeFakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    pending,
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    fire: (ms) => { for (const [id, t] of [...pending]) { if (t.ms <= ms) { pending.delete(id); t.fn(); } } }
  };
}
function makeFakeEl(tag) {
  const listeners = {};
  const el = {
    tag, className: '', innerHTML: '', style: {}, removed: false, children: [],
    getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    appendChild: function (c) { this.children.push(c); return c; },
    remove: function () { this.removed = true; },
    contains: function (t) { return t === this || this.children.includes(t); },
    fire: function (t, ev) { (listeners[t] || []).slice().forEach((f) => f(ev || {})); },
    listenerCount: function (t) { return (listeners[t] || []).length; }
  };
  return el;
}
function makeHoverCtx(lesions, clickSpy) {
  const timers = makeFakeTimers();
  const docListeners = {};
  const appended = [];
  const document = {
    createElement: (tag) => makeFakeEl(tag),
    body: { appendChild: (el) => { appended.push(el); return el; } },
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter((x) => x !== f); },
    _appended: appended,
    fire: (t, ev) => { (docListeners[t] || []).slice().forEach((f) => f(ev || {})); }
  };
  const anchor = makeFakeEl('button');
  anchor.getBoundingClientRect = () => ({ left: 100, right: 200, top: 50, bottom: 70 });
  // "ver lesão" tem onclick próprio, independente do hover — simula o clique
  // real do botão chamando o spy (prova que hover não dispara clique).
  anchor.onclick = clickSpy || (() => {});
  const context = {
    console: { error: () => {}, log: () => {}, info: () => {}, warn: () => {} },
    DATA: lesions, LESION_REVISIONS: {}, document,
    window: { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: true }) },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    __timers: timers, __anchor: anchor
  };
  vm.createContext(context);
  const deps = ['splitDifferentialItems', 'notesDifferentialsHtml'].map((n) => extractFunction(html, n).source).join('\n');
  vm.runInContext(ESC_SRC + '\n' + PREVIEW_STATE_SRC + '\n' + deps + '\n' + PREVIEW_SRC, context, { filename: 'solucoes-hover.js' });
  return context;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') { const out = {}; for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]); return out; }
  return value;
}
function fp(ctx, name) { return JSON.stringify(canonicalize(vm.runInContext(name, ctx))); }

const LESION = { id: 'seed_42', name: 'Lesão da Proposta', s: 'Seção P', site: 'Sítio Q', classification: null, enTerm: 'proposal lesion', tags: ['a'], clinicalTags: [], notes: 'nota curta' };
const OTHER = { id: 'seed_43', name: 'Outra Lesão', s: 'Seção P', site: 'Sítio Q', classification: null, enTerm: '', tags: [], clinicalTags: [], notes: '' };

test('COMPORTAMENTAL: hover no botão "ver lesão" da proposta mostra o preview da lesão correta', () => {
  let clicked = 0;
  const ctx = makeHoverCtx([LESION, OTHER], () => { clicked++; });
  vm.runInContext('wireLesionHoverPreview(__anchor, "' + LESION.id + '")', ctx);
  const dataBefore = fp(ctx, 'DATA'); const revBefore = fp(ctx, 'LESION_REVISIONS');
  ctx.__anchor.fire('mouseenter');
  ctx.__timers.fire(300);
  assert.equal(ctx.document._appended.length, 1, 'preview abriu');
  assert.match(ctx.document._appended[0].innerHTML, /Lesão da Proposta/, 'preview é da lesão da proposta correta, não de outra');
  assert.doesNotMatch(ctx.document._appended[0].innerHTML, /Outra Lesão/);
  assert.equal(clicked, 0, 'hover nunca dispara o clique/navegação do botão');
  assert.equal(fp(ctx, 'DATA'), dataBefore, 'DATA não muda com o hover');
  assert.equal(fp(ctx, 'LESION_REVISIONS'), revBefore, 'LESION_REVISIONS não muda com o hover');
});

test('COMPORTAMENTAL: mouseleave remove o preview (mesmo atraso/padrão já existente)', () => {
  const ctx = makeHoverCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "' + LESION.id + '")', ctx);
  ctx.__anchor.fire('mouseenter');
  ctx.__timers.fire(300);
  const card = ctx.document._appended[0];
  assert.equal(card.removed, false);
  ctx.__anchor.fire('mouseleave');
  assert.equal(card.removed, false, 'ainda aguarda o atraso de saída — não remove instantaneamente');
  ctx.__timers.fire(200);
  assert.equal(card.removed, true, 'removido após o atraso de saída padrão');
});

test('COMPORTAMENTAL: nenhum preview duplicado — reabrir sobre a mesma lesão não acumula cards', () => {
  const ctx = makeHoverCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "' + LESION.id + '")', ctx);
  ctx.__anchor.fire('mouseenter'); ctx.__timers.fire(300);
  ctx.__anchor.fire('mouseenter'); ctx.__timers.fire(300); // 2º hover sobre a MESMA lesão, sem sair antes
  assert.equal(ctx.document._appended.length, 1, 'segundo hover sobre a mesma lesão não cria um 2º card');
});

test('COMPORTAMENTAL: só mouseenter/mouseleave são usados pelo wiring — nunca click, nunca onclick sobrescrito', () => {
  const ctx = makeHoverCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "' + LESION.id + '")', ctx);
  assert.equal(ctx.__anchor.listenerCount('mouseenter'), 1);
  assert.equal(ctx.__anchor.listenerCount('mouseleave'), 1);
  assert.equal(ctx.__anchor.listenerCount('click'), 0, 'hover nunca escuta click');
  assert.equal(typeof ctx.__anchor.onclick, 'function', 'onclick original do botão continua intocado (não foi sobrescrito pelo wiring de hover)');
});
