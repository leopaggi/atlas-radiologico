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

test('ESTÁTICO: botão "👁 atual" da aba Propostas usa wireLesionHoverPreview com a LESÃO REAL (sem override), rotulada "VERSÃO ATUAL"', () => {
  assert.match(proposedListSrc, /class="btn btn-ghost review-open-lesion-current"/, 'botão "👁 atual" precisa existir');
  assert.match(proposedListSrc, /wireLesionHoverPreview\(\s*currentBtn\s*,\s*meta\.lesion\.id\s*,\s*\{\s*label:'VERSÃO ATUAL'\s*\}\s*\)/,
    'reaproveita wireLesionHoverPreview com o id real da lesão, sem "lesion:" override — sempre a versão atual em DATA');
});

test('ESTÁTICO: clique em "👁 atual" continua abrindo só o detalhe (nunca autoriza/rejeita/resolve/fecha scroll) — comportamento de clique preservado', () => {
  assert.match(proposedListSrc, /currentBtn\.onclick\s*=\s*\(\)\s*=>\s*\{\s*closeLesionHoverPreview\(\);\s*closeAllAndCleanup\(\);\s*openDetail\(meta\.lesion\.id\);\s*\}/);
  const onclickBlock = proposedListSrc.slice(proposedListSrc.indexOf('currentBtn.onclick'), proposedListSrc.indexOf("querySelector('.review-open-history')"));
  for (const forbidden of ['authorizeAndApplyReviewSolution', 'rejectProposedReviewSolution', 'confirmNoChangeReviewSolution', 'wireReviewResolveButton', 'runAiSolutionPipeline']) {
    assert.ok(!onclickBlock.includes(forbidden), 'onclick de "👁 atual" não pode chamar ' + forbidden);
  }
});

test('ESTÁTICO: só UMA chamada de wireLesionHoverPreview para "👁 atual" desta aba (sem wiring duplicado)', () => {
  const matches = proposedListSrc.match(/wireLesionHoverPreview\(\s*currentBtn\s*,/g) || [];
  assert.equal(matches.length, 1);
});

test('ESTÁTICO: botão "✨ proposta" existe só quando há changes, usa uma CÓPIA (lesion: override) com proposedChanges, nunca authorizeAndApplyReviewSolution', () => {
  assert.match(proposedListSrc, /class="btn btn-ghost review-open-lesion-proposed"/);
  assert.match(proposedListSrc, /lesion:\s*previewLesionWithProposedChanges\(meta\.lesion,\s*changes\)/,
    'a prévia da proposta precisa ser uma CÓPIA com proposedChanges sobreposto, nunca a lesão real direto');
  assert.match(proposedListSrc, /label:'PRÉVIA DA PROPOSTA'/);
  const proposedBlock = proposedListSrc.slice(proposedListSrc.indexOf('const proposedBtn'), proposedListSrc.indexOf("row.querySelector('.review-open-history')"));
  for (const forbidden of ['authorizeAndApplyReviewSolution', 'saveData', 'saveLesionRevisions', 'rejectProposedReviewSolution']) {
    assert.ok(!proposedBlock.includes(forbidden), 'wiring de "✨ proposta" não pode chamar ' + forbidden);
  }
});

test('ESTÁTICO: "👁 atual" e "✨ proposta" usam chaves de preview DISTINTAS (nunca uma "já aberto" bloqueia a outra na mesma lesão)', () => {
  assert.match(proposedListSrc, /previewKey\s*=\s*'proposed:'\s*\+\s*r\.id/);
  assert.doesNotMatch(proposedListSrc, /wireLesionHoverPreview\(\s*currentBtn[^)]*previewKey/, '"atual" usa a chave padrão (o próprio lesionId), não previewKey');
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
const PREVIEW_LESION_COPY_SRC = extractFunction(html, 'previewLesionWithProposedChanges').source;
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
  // "👁 atual" tem onclick próprio, independente do hover — simula o clique
  // real do botão chamando o spy (prova que hover não dispara clique).
  anchor.onclick = clickSpy || (() => {});
  // 2º anchor — "✨ proposta" da MESMA lesão (ver testes de chave distinta/
  // nenhum preview duplicado entre os dois botões).
  const anchor2 = makeFakeEl('button');
  anchor2.getBoundingClientRect = () => ({ left: 100, right: 200, top: 50, bottom: 70 });
  const context = {
    console: { error: () => {}, log: () => {}, info: () => {}, warn: () => {} },
    DATA: lesions, LESION_REVISIONS: {}, document,
    window: { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: true }) },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    __timers: timers, __anchor: anchor, __anchor2: anchor2
  };
  vm.createContext(context);
  const deps = ['splitDifferentialItems', 'boldLeadingPadraoLabelHtml', 'formatDifferentialItemHtml', 'notesDifferentialsHtml'].map((n) => extractFunction(html, n).source).join('\n');
  vm.runInContext(ESC_SRC + '\n' + PREVIEW_STATE_SRC + '\n' + deps + '\n' + PREVIEW_LESION_COPY_SRC + '\n' + PREVIEW_SRC, context, { filename: 'solucoes-hover.js' });
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

/* ---------- "👁 atual" vs "✨ proposta" — mesma lesão, conteúdos diferentes ---------- */

const PROPOSED_CHANGES = {
  notes: 'Padrão: achado reescrito pela IA.\n\nDiferenciais-chave:\nCraniofaringioma — calcificações.\nMeningioma — realce intenso.',
  tags: ['nova-tag'], enTerm: 'new proposal term'
};

test('previewLesionWithProposedChanges: campos alterados vêm da proposta; campos NÃO alterados permanecem exatamente como na lesão atual', () => {
  const ctx = makeHoverCtx([LESION]);
  const merged = vm.runInContext('previewLesionWithProposedChanges(DATA[0], ' + JSON.stringify(PROPOSED_CHANGES) + ')', ctx);
  assert.equal(merged.notes, PROPOSED_CHANGES.notes);
  assert.deepEqual(Array.from(merged.tags), PROPOSED_CHANGES.tags);
  assert.equal(merged.enTerm, PROPOSED_CHANGES.enTerm);
  // nunca alterados pela proposta: idênticos à lesão atual
  assert.equal(merged.id, LESION.id);
  assert.equal(merged.name, LESION.name);
  assert.equal(merged.s, LESION.s);
  assert.equal(merged.site, LESION.site);
  assert.deepEqual(Array.from(merged.clinicalTags), LESION.clinicalTags);
});

test('previewLesionWithProposedChanges NUNCA muta a lesão original (DATA permanece intacta)', () => {
  const ctx = makeHoverCtx([LESION]);
  const before = fp(ctx, 'DATA');
  vm.runInContext('previewLesionWithProposedChanges(DATA[0], ' + JSON.stringify(PROPOSED_CHANGES) + ')', ctx);
  assert.equal(fp(ctx, 'DATA'), before);
});

test('COMPORTAMENTAL: hover "👁 atual" mostra a LESÃO REAL (notes antigas) com rótulo "VERSÃO ATUAL"', () => {
  const ctx = makeHoverCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "' + LESION.id + '", {label:"VERSÃO ATUAL"})', ctx);
  ctx.__anchor.fire('mouseenter'); ctx.__timers.fire(300);
  const html2 = ctx.document._appended[0].innerHTML;
  assert.match(html2, /VERSÃO ATUAL/);
  assert.match(html2, /nota curta/, 'mostra a notes ATUAL (da lesão real em DATA)');
});

test('COMPORTAMENTAL: hover "✨ proposta" mostra a CÓPIA com proposedChanges (notes/tags/enTerm novos), rotulada "PRÉVIA DA PROPOSTA" — nunca altera DATA', () => {
  const ctx = makeHoverCtx([LESION]);
  const merged = vm.runInContext('previewLesionWithProposedChanges(DATA[0], ' + JSON.stringify(PROPOSED_CHANGES) + ')', ctx);
  ctx.__merged = merged;
  const dataBefore = fp(ctx, 'DATA');
  vm.runInContext('wireLesionHoverPreview(__anchor2, "' + LESION.id + '", {lesion:__merged, label:"PRÉVIA DA PROPOSTA", labelAccent:true, previewKey:"proposed:r1"})', ctx);
  ctx.__anchor2.fire('mouseenter'); ctx.__timers.fire(300);
  const html2 = ctx.document._appended[0].innerHTML;
  assert.match(html2, /PRÉVIA DA PROPOSTA/);
  assert.match(html2, /<strong class="notes-section-label">Diferenciais-chave:<\/strong>/, 'notes propostas estruturadas renderizam com notesDifferentialsHtml');
  assert.match(html2, /<strong>Craniofaringioma<\/strong> — calcificações\./);
  assert.doesNotMatch(html2, /nota curta/, 'nunca mostra a notes antiga nesta prévia');
  assert.equal(fp(ctx, 'DATA'), dataBefore, 'DATA permanece bit-a-bit igual depois do hover da proposta');
});

test('COMPORTAMENTAL: "👁 atual" e "✨ proposta" da MESMA lesão nunca se bloqueiam um ao outro (chaves distintas) — nenhum preview duplicado', () => {
  const ctx = makeHoverCtx([LESION]);
  const merged = vm.runInContext('previewLesionWithProposedChanges(DATA[0], ' + JSON.stringify(PROPOSED_CHANGES) + ')', ctx);
  ctx.__merged = merged;
  vm.runInContext('wireLesionHoverPreview(__anchor, "' + LESION.id + '", {label:"VERSÃO ATUAL"})', ctx);
  vm.runInContext('wireLesionHoverPreview(__anchor2, "' + LESION.id + '", {lesion:__merged, label:"PRÉVIA DA PROPOSTA", previewKey:"proposed:r1"})', ctx);
  ctx.__anchor.fire('mouseenter'); ctx.__timers.fire(300);
  assert.equal(ctx.document._appended.length, 1, '"atual" abriu normalmente');
  assert.match(ctx.document._appended[0].innerHTML, /VERSÃO ATUAL/);
  ctx.__anchor2.fire('mouseenter'); ctx.__timers.fire(300);
  // closeLesionHoverPreview() some aqui dentro de openLesionHoverPreview —
  // só 1 card no DOM a qualquer momento, mas o 2º hover TROCOU o conteúdo
  // (nunca foi ignorado por já achar que "esta lesão" já estava aberta).
  const cards = ctx.document._appended.filter((el) => !el.removed);
  assert.equal(cards.length, 1, 'nenhum preview duplicado — sempre um por vez');
  assert.match(cards[0].innerHTML, /PRÉVIA DA PROPOSTA/, 'o hover da proposta realmente abriu — não foi bloqueado pela chave de "atual"');
});
