'use strict';

/* CORREÇÃO DE UX (2026-10-08) — o botão "👁 Pré-visualizar plano" do card de
 * ação manual (💡 Soluções disponíveis → 🛠 Ações manuais), para
 * resolutionType === 'update_content', deixou de abrir um SEGUNDO .overlay
 * (openStructuralPlanPreviewModal/openStructuralPlanPreviewModalForReview —
 * "PLANO ESTRUTURAL IMPORTADO"/reviewId/"Justificativa da IA"/Aceitar/
 * Rejeitar duplicados) e passou a reutilizar EXATAMENTE o mesmo mecanismo
 * já usado pelo botão "✨ proposta" das revisões normais (ver
 * tests/solucoes-ver-lesao-hover.test.js): openLesionHoverPreview/
 * wireLesionHoverPreview + previewLesionWithProposedChanges, um preview
 * flutuante (.lesion-hover-preview) anexado direto a document.body —
 * nunca um .overlay novo.
 *
 * merge/move/transfer_images/additional_section_placement etc. NÃO mudam:
 * continuam usando "👁 Pré-visualizar plano" → openStructuralPlanPreviewModalForReview
 * (modal estrutural técnico), exatamente como antes.
 *
 * SEGUNDA RODADA (mesma data) — bug relatado: botão não aparecia na UI real.
 * Auditoria: structuralPlanLiveView(reviewId) é PURAMENTE derivada de
 * review.structuralPlan (retorna null sem ele) — nunca uma fonte
 * independente. A condição de render usava `r.structuralPlan.type`
 * diretamente enquanto o wiring usava `structuralPlanLiveView(r.id)`: dois
 * lugares lendo o MESMO dado por caminhos diferentes, sem motivo. Correção:
 * `const planView = structuralPlanLiveView(r.id)` calculada UMA vez por
 * linha, reusada tanto na condição de render quanto no wiring — nunca mais
 * uma leitura direta de r.structuralPlan fora dessa única linha.
 *
 * Quatro camadas:
 *  1) ESTÁTICA — no corpo real de renderManualList (dentro de
 *     openReadySolutionsModal) extraído do index.html.
 *  2) COMPORTAMENTAL — executa o TRECHO REAL de wiring (extraído literalmente
 *     do index.html) num vm context com as funções reais
 *     (structuralPlanLiveView, structuralPlanLesion,
 *     previewLesionWithProposedChanges, openLesionHoverPreview,
 *     wireLesionHoverPreview) e um DOM falso mínimo.
 *  3) RENDER — a expressão real do ternário de condição do botão, avaliada
 *     isoladamente com planView controlada.
 *  4) CENÁRIO EXIGIDO — planView com type:'update_content' enquanto
 *     r.structuralPlan está ausente (ver nota de auditoria acima: na vida
 *     real isso nunca acontece, mas prova que a condição/wiring decidem
 *     100% a partir de planView, nunca de r.structuralPlan de novo).
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
// 1) ESTÁTICA — renderManualList real (dentro de openReadySolutionsModal).
// ===========================================================================
const readySolutionsSrc = extractFn(html, 'openReadySolutionsModal');
const manualListSrc = readySolutionsSrc.slice(
  readySolutionsSrc.indexOf('const renderManualList'),
  readySolutionsSrc.indexOf('const renderHistoryList')
);

test('ESTÁTICO: planView (structuralPlanLiveView) é calculada UMA vez e é a ÚNICA fonte usada na condição de render do botão', () => {
  assert.match(manualListSrc, /const planView = structuralPlanLiveView\(r\.id\);/, 'planView precisa ser calculada uma vez por linha');
  assert.match(manualListSrc, /planView\s*&&\s*planView\.type===['"]update_content['"]\s*&&\s*planView\.fields\s*\?`<button[^`]*class="btn btn-ghost review-open-lesion-proposed"[^`]*>✨ proposta<\/button>`/,
    'update_content precisa renderizar o botão "✨ proposta" com a MESMA classe do botão normal, condicionado em planView (nunca em r.structuralPlan direto)');
  // nenhuma leitura de r.structuralPlan fora da própria declaração de planView
  // (a condição do botão e o fallback "👁 Pré-visualizar plano" usam só planView).
  const buttonExprStart = manualListSrc.indexOf("${planView && planView.type==='update_content'");
  const buttonExprEnd = manualListSrc.indexOf('${structuralPlanCardDecideHtml(r)}');
  const buttonExpr = manualListSrc.slice(buttonExprStart, buttonExprEnd);
  assert.ok(!buttonExpr.includes('r.structuralPlan'), 'condição de render do botão não pode ler r.structuralPlan diretamente — só planView');
});

test('ESTÁTICO: outros tipos estruturais continuam com "👁 Pré-visualizar plano" → openStructuralPlanPreviewModalForReview (não tocado)', () => {
  assert.match(manualListSrc, /class="btn btn-ghost review-structural-preview">👁 Pré-visualizar plano<\/button>/);
  assert.match(manualListSrc, /structPrevBtn\.onclick\s*=\s*\(\)=>\s*openStructuralPlanPreviewModalForReview\(r\.id,\s*renderBothLists\)/);
});

test('ESTÁTICO: wiring de update_content REUSA a MESMA planView (nunca recalcula structuralPlanLiveView), usa previewLesionWithProposedChanges + openLesionHoverPreview/wireLesionHoverPreview, nunca openStructuralPlanPreviewModal(ForReview)', () => {
  const block = manualListSrc.slice(
    manualListSrc.indexOf("const structProposedBtn = row.querySelector('.review-open-lesion-proposed')"),
    manualListSrc.indexOf("const structAcceptBtn = row.querySelector('.review-structural-accept')")
  );
  assert.ok(block.length > 0, 'bloco de wiring do botão "✨ proposta" estrutural precisa existir');
  assert.ok(!block.includes('structuralPlanLiveView'), 'wiring NÃO pode recalcular structuralPlanLiveView — tem que reusar a planView já calculada acima, uma fonte só');
  assert.match(block, /previewLesionWithProposedChanges\(lesion,\s*planView&&planView\.fields\)/);
  assert.match(block, /openLesionHoverPreview\(structProposedBtn,\s*anchorLesionId,\s*previewOpts\)/);
  assert.match(block, /wireLesionHoverPreview\(structProposedBtn,\s*anchorLesionId,\s*previewOpts\)/);
  for (const forbidden of ['openStructuralPlanPreviewModal', 'openStructuralPlanPreviewModalForReview']) {
    assert.ok(!block.includes(forbidden), 'wiring de update_content não pode chamar ' + forbidden);
  }
});

test('ESTÁTICO: wiring de update_content NÃO duplica Aceitar/Rejeitar (continuam só em structuralPlanCardButtonsHtml, já existente)', () => {
  const block = manualListSrc.slice(
    manualListSrc.indexOf("const structProposedBtn = row.querySelector('.review-open-lesion-proposed')"),
    manualListSrc.indexOf("const structAcceptBtn = row.querySelector('.review-structural-accept')")
  );
  assert.doesNotMatch(block, /Aceitar plano|Rejeitar plano|acceptStructuralPlan|rejectStructuralPlan/);
});

// ===========================================================================
// 2) COMPORTAMENTAL — executa o TRECHO REAL extraído acima num vm context
//    com as funções reais (structuralPlanLiveView, structuralPlanLesion,
//    previewLesionWithProposedChanges, openLesionHoverPreview,
//    wireLesionHoverPreview) e um DOM falso mínimo (mesmo harness de
//    tests/solucoes-ver-lesao-hover.test.js).
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
function extractLineFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^\\n\\r]*\\}', 'm');
  const m = re.exec(source); assert.ok(m, 'helper de uma linha não encontrado: ' + name);
  return m[0];
}

const PREVIEW_FNS = ['lesionHoverSupported', 'lesionHoverPreviewHtml', 'positionLesionHoverPreview',
  'closeLesionHoverPreview', 'openLesionHoverPreview', 'wireLesionHoverPreview'];
const PREVIEW_SRC = PREVIEW_FNS.map((n) => extractFunction(html, n).source).join('\n');
const ESC_SRC = ['esc', 'escAttr'].map((n) => extractLineFunction(html, n)).join('\n');
const PREVIEW_STATE_SRC = html.slice(
  html.indexOf('let lesionHoverPreviewEl'),
  html.indexOf('function lesionHoverSupported(')
);
const PREVIEW_LESION_COPY_SRC = extractFunction(html, 'previewLesionWithProposedChanges').source;
const STRUCTURAL_PLAN_LESION_SRC = extractFunction(html, 'structuralPlanLesion').source;
const STRUCTURAL_PLAN_LIVE_VIEW_SRC = extractFunction(html, 'structuralPlanLiveView').source;
const DEPS_SRC = ['splitDifferentialItems', 'boldLeadingPadraoLabelHtml', 'formatDifferentialItemHtml', 'notesDifferentialsHtml'].map((n) => extractFunction(html, n).source).join('\n');

// Trecho REAL de wiring extraído de renderManualList — executado literalmente
// (não uma reimplementação) contra um `row`/`r` falsos.
const WIRING_SRC = manualListSrc.slice(
  manualListSrc.indexOf("const structProposedBtn = row.querySelector('.review-open-lesion-proposed')"),
  manualListSrc.indexOf("const structAcceptBtn = row.querySelector('.review-structural-accept')")
);

// Expressão REAL da condição de render do botão (o ternário embutido no
// template), extraída literalmente — avaliada à parte, com `planView`
// controlada, pra provar o que a UI real decide renderizar sem precisar
// montar o template HTML inteiro (que tem dependências de UI não
// relacionadas a este bug: reviewCenterLesionMeta, reviewPlacementSuggestion
// etc.).
const BUTTON_RENDER_EXPR = (() => {
  const start = manualListSrc.indexOf("planView && planView.type==='update_content'");
  const end = manualListSrc.indexOf('${structuralPlanCardDecideHtml(r)}');
  const expr = manualListSrc.slice(start, end).replace(/\s+$/, ''); // tira \r\n/espaços finais (CRLF)
  assert.ok(expr.endsWith(":''}"), 'marcador de fim da expressão não bateu como esperado — ajuste o teste');
  return expr.slice(0, -1); // remove só o '}' que fecha o ${...}, mantém o ":''" final
})();
function evalButtonRenderExpr(planView) {
  const ctx = vm.createContext({ planView });
  return vm.runInContext('(' + BUTTON_RENDER_EXPR + ')', ctx);
}

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
    getBoundingClientRect: () => ({ left: 100, right: 200, top: 50, bottom: 70, width: 100, height: 20 }),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    appendChild: function (c) { this.children.push(c); return c; },
    querySelector: function (sel) {
      // suficiente pros seletores de classe usados no trecho de wiring.
      const cls = sel.replace('.', '');
      return this.children.find((c) => (c.className || '').split(' ').includes(cls)) || null;
    },
    remove: function () { this.removed = true; },
    contains: function (t) { return t === this || this.children.includes(t); },
    fire: function (t, ev) { (listeners[t] || []).slice().forEach((f) => f(ev || {})); },
    listenerCount: function (t) { return (listeners[t] || []).length; }
  };
  return el;
}

function makeCtx(DATA, LESION_REVISIONS, overlayCalls) {
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
  const context = {
    console: { error: () => {}, log: () => {}, info: () => {}, warn: () => {} },
    DATA, LESION_REVISIONS, document,
    window: { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: true }) },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    // Qualquer chamada ao modal estrutural técnico, dentro deste wiring, é um
    // BUG — contabiliza em vez de deixar ReferenceError esconder a asserção.
    openStructuralPlanPreviewModal: () => { overlayCalls.modal++; },
    openStructuralPlanPreviewModalForReview: () => { overlayCalls.modalForReview++; },
    __timers: timers
  };
  vm.createContext(context);
  vm.runInContext(
    ESC_SRC + '\n' + PREVIEW_STATE_SRC + '\n' + DEPS_SRC + '\n' + PREVIEW_LESION_COPY_SRC + '\n' +
    PREVIEW_SRC + '\n' + STRUCTURAL_PLAN_LESION_SRC + '\n' + STRUCTURAL_PLAN_LIVE_VIEW_SRC,
    context, { filename: 'structural-update-content-proposal.js' }
  );
  return context;
}

// planView é opcional: quando omitida, calculamos com a FUNÇÃO REAL
// structuralPlanLiveView(r.id) — exatamente como a própria renderManualList
// faz uma linha antes deste trecho (ver "const planView = ..." no index.html).
// Quando fornecida explicitamente, simula uma planView que não foi derivada
// de r.structuralPlan (prova que o wiring usa SÓ planView, nunca r.structuralPlan).
function runWiringOnRow(ctx, row, r, planView) {
  ctx.row = row; ctx.r = r;
  ctx.planView = (planView !== undefined) ? planView : vm.runInContext('structuralPlanLiveView(r.id)', ctx);
  vm.runInContext(WIRING_SRC, ctx);
}

const LESION = {
  id: 'seed_900', name: 'Ventriculomegalia fetal', s: 'Medicina Fetal', site: 'Anomalias fetais estruturais',
  notes: 'nota antiga', classification: 'antiga', tags: ['antiga'], clinicalTags: ['ct-antiga'], enTerm: 'old term'
};
const FIELDS = {
  notes: 'Dilatação ventricular > 10mm.\n\nDiferenciais-chave:\nVentriculomegalia isolada — leve, sem outras malformações.\nHidrocefalia obstrutiva — dilatação progressiva, pressão aumentada.',
  tags: ['dilatação ventricular', 'SNC fetal'], clinicalTags: ['acompanhamento seriado'],
  classification: 'leve', enTerm: 'fetal ventriculomegaly'
};

function makeReview(lesionId, fields, identity) {
  return {
    id: 'RUC', lesionId, status: 'manual_action_required',
    structuralPlan: { status: 'imported', type: 'update_content',
      resolution: { reviewId: 'RUC', lesionId, fields, expectedIdentity: identity, reasoning: 'proposta da IA' } }
  };
}

test('COMPORTAMENTAL: botão "✨ proposta" de update_content abre o preview flutuante (NUNCA um .overlay/modal estrutural)', () => {
  const overlayCalls = { modal: 0, modalForReview: 0 };
  const r = makeReview('seed_900', FIELDS, { name: LESION.name, section: LESION.s, site: LESION.site });
  const ctx = makeCtx([LESION], { RUC: r }, overlayCalls);
  const row = makeFakeEl('div');
  const btn = makeFakeEl('button'); btn.className = 'review-open-lesion-proposed';
  row.children.push(btn);
  runWiringOnRow(ctx, row, r);
  btn.fire('mouseenter'); ctx.__timers.fire(300);
  assert.equal(overlayCalls.modal, 0, 'openStructuralPlanPreviewModal nunca é chamado');
  assert.equal(overlayCalls.modalForReview, 0, 'openStructuralPlanPreviewModalForReview nunca é chamado');
  assert.equal(ctx.document._appended.length, 1, 'exatamente 1 elemento flutuante (.lesion-hover-preview) — nenhum .overlay');
});

test('COMPORTAMENTAL: a ficha mostra nome, seção/site, descrição final (com diferenciais), tags, classification, enTerm e clinicalTags PROPOSTOS', () => {
  const overlayCalls = { modal: 0, modalForReview: 0 };
  const r = makeReview('seed_900', FIELDS, { name: LESION.name, section: LESION.s, site: LESION.site });
  const ctx = makeCtx([LESION], { RUC: r }, overlayCalls);
  const row = makeFakeEl('div');
  const btn = makeFakeEl('button'); btn.className = 'review-open-lesion-proposed';
  row.children.push(btn);
  runWiringOnRow(ctx, row, r);
  btn.fire('mouseenter'); ctx.__timers.fire(300);
  const out = ctx.document._appended[0].innerHTML;
  assert.match(out, /Ventriculomegalia fetal/, 'nome da lesão');
  assert.match(out, /Medicina Fetal.*Anomalias fetais estruturais/, 'seção · site');
  assert.match(out, /Dilatação ventricular &gt; 10mm/, 'descrição final proposta (texto escapado, como qualquer outra ficha)');
  assert.match(out, /<strong class="notes-section-label">Diferenciais-chave:<\/strong>/, 'diferenciais renderizados dentro da descrição');
  assert.match(out, /Ventriculomegalia isolada/);
  assert.match(out, /dilatação ventricular/); assert.match(out, /SNC fetal/);
  assert.match(out, /leve/, 'classification proposta');
  assert.match(out, /fetal ventriculomegaly/, 'enTerm proposto');
  assert.match(out, /acompanhamento seriado/, 'clinicalTags propostas');
  assert.doesNotMatch(out, /nota antiga/, 'não mostra a notes antiga — foi substituída pela proposta');
});

test('COMPORTAMENTAL: NÃO mostra "PLANO ESTRUTURAL IMPORTADO", reviewId, "plano: imported" nem "Justificativa da IA"', () => {
  const overlayCalls = { modal: 0, modalForReview: 0 };
  const r = makeReview('seed_900', FIELDS, { name: LESION.name, section: LESION.s, site: LESION.site });
  const ctx = makeCtx([LESION], { RUC: r }, overlayCalls);
  const row = makeFakeEl('div');
  const btn = makeFakeEl('button'); btn.className = 'review-open-lesion-proposed';
  row.children.push(btn);
  runWiringOnRow(ctx, row, r);
  btn.fire('mouseenter'); ctx.__timers.fire(300);
  const out = ctx.document._appended[0].innerHTML;
  for (const forbidden of [/PLANO ESTRUTURAL IMPORTADO/, /RUC/, /plano: imported/, /Justificativa da IA/, /Aceitar plano/, /Rejeitar plano/]) {
    assert.doesNotMatch(out, forbidden);
  }
});

test('COMPORTAMENTAL: DATA/LESION_REVISIONS permanecem intocados ao abrir o preview', () => {
  const overlayCalls = { modal: 0, modalForReview: 0 };
  const r = makeReview('seed_900', FIELDS, { name: LESION.name, section: LESION.s, site: LESION.site });
  const ctx = makeCtx([LESION], { RUC: r }, overlayCalls);
  const dataBefore = JSON.stringify(ctx.DATA);
  const revBefore = JSON.stringify(ctx.LESION_REVISIONS);
  const row = makeFakeEl('div');
  const btn = makeFakeEl('button'); btn.className = 'review-open-lesion-proposed';
  row.children.push(btn);
  runWiringOnRow(ctx, row, r);
  btn.fire('mouseenter'); ctx.__timers.fire(300);
  assert.equal(JSON.stringify(ctx.DATA), dataBefore);
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS), revBefore);
});

test('COMPORTAMENTAL: lesão não encontrada em DATA (identidade só via expectedIdentity) ainda produz uma ficha coerente, sem lançar', () => {
  const overlayCalls = { modal: 0, modalForReview: 0 };
  const r = makeReview('seed_does_not_exist', { name: 'Nome novo' }, { name: 'Nome antigo', section: 'Seção X', site: 'Sítio Y' });
  const ctx = makeCtx([LESION], { RUC: r }, overlayCalls); // seed_900 existe, mas não é o lesionId do plano
  const row = makeFakeEl('div');
  const btn = makeFakeEl('button'); btn.className = 'review-open-lesion-proposed';
  row.children.push(btn);
  assert.doesNotThrow(() => { runWiringOnRow(ctx, row, r); btn.fire('mouseenter'); ctx.__timers.fire(300); });
  const out = ctx.document._appended[0].innerHTML;
  assert.match(out, /Nome novo/, 'campo proposto (name) aparece mesmo sem a lesão real em DATA');
});

// ===========================================================================
// 3) CONDIÇÃO DE RENDER DO BOTÃO — expressão real avaliada com planView
//    controlada (prova direta, sem precisar montar o template inteiro).
// ===========================================================================

test('RENDER: planView.type==="update_content" com fields => botão "✨ proposta"', () => {
  const out = evalButtonRenderExpr({ type: 'update_content', fields: { notes: 'x' } });
  assert.match(out, /review-open-lesion-proposed/);
  assert.match(out, /✨ proposta/);
});

test('RENDER: planView ausente (null) => nenhum botão', () => {
  const out = evalButtonRenderExpr(null);
  assert.equal(out, '');
});

test('RENDER: planView de outro tipo estrutural (merge_duplicates) => "👁 Pré-visualizar plano" (não "✨ proposta")', () => {
  const out = evalButtonRenderExpr({ type: 'merge_duplicates', fields: undefined });
  assert.match(out, /review-structural-preview/);
  assert.match(out, /👁 Pré-visualizar plano/);
  assert.ok(!out.includes('review-open-lesion-proposed'));
});

test('RENDER: planView.type==="update_content" SEM fields => cai no fallback técnico (nunca "✨ proposta" sem fields pra montar a ficha)', () => {
  const out = evalButtonRenderExpr({ type: 'update_content', fields: undefined });
  assert.match(out, /review-structural-preview/);
  assert.ok(!out.includes('review-open-lesion-proposed'));
});

// ===========================================================================
// 4) CENÁRIO EXIGIDO — planView (fonte usada pela condição E pelo wiring)
//    com type:'update_content' enquanto r.structuralPlan está ausente.
//    (Na realidade, structuralPlanLiveView(reviewId) retorna null sempre que
//    review.structuralPlan está ausente — é uma projeção pura dele, nunca
//    uma fonte independente: isso é precisamente a causa raiz investigada,
//    ver resumo da conversa. Este teste simula o cenário pedido ajustando
//    planView diretamente, SEM tocar a função real, para comprovar que o
//    código de produção — tanto a condição de render quanto o wiring —
//    decide 100% a partir de planView e nunca verifica r.structuralPlan de
//    novo. Se no futuro alguém reintroduzir uma leitura de r.structuralPlan
//    na condição/wiring, estes dois testes quebram.)
// ===========================================================================

test('CENÁRIO EXIGIDO: render do botão usa SÓ planView — "✨ proposta" aparece mesmo com r.structuralPlan undefined', () => {
  const r = { id: 'RUC', lesionId: 'seed_900', status: 'manual_action_required', structuralPlan: undefined };
  const planView = { type: 'update_content', fields: { name: 'Nome novo' }, lesionId: 'seed_900', expectedIdentity: null };
  const out = evalButtonRenderExpr(planView);
  assert.match(out, /review-open-lesion-proposed/, 'botão aparece mesmo com r.structuralPlan undefined, pois a condição só olha planView');
  assert.ok(r.structuralPlan === undefined, 'pré-condição do cenário: r.structuralPlan realmente ausente');
});

test('CENÁRIO EXIGIDO: wiring funciona com planView informada mesmo com r.structuralPlan undefined — chama openLesionHoverPreview, NUNCA openStructuralPlanPreviewModalForReview, sem .overlay novo', () => {
  const overlayCalls = { modal: 0, modalForReview: 0 };
  const r = { id: 'RUC', lesionId: 'seed_900', status: 'manual_action_required', structuralPlan: undefined };
  const planView = { type: 'update_content', fields: { name: 'Nome novo' }, lesionId: 'seed_900', expectedIdentity: null };
  const ctx = makeCtx([LESION], { RUC: r }, overlayCalls);
  const row = makeFakeEl('div');
  const btn = makeFakeEl('button'); btn.className = 'review-open-lesion-proposed';
  row.children.push(btn);
  runWiringOnRow(ctx, row, r, planView); // planView explícita — NUNCA derivada de r.structuralPlan aqui
  btn.fire('mouseenter'); ctx.__timers.fire(300);
  assert.equal(overlayCalls.modal, 0, 'openStructuralPlanPreviewModal nunca é chamado');
  assert.equal(overlayCalls.modalForReview, 0, 'openStructuralPlanPreviewModalForReview nunca é chamado');
  assert.equal(ctx.document._appended.length, 1, 'exatamente 1 .lesion-hover-preview — nenhum .overlay adicional');
  assert.match(ctx.document._appended[0].innerHTML, /Nome novo/, 'ficha usa o campo de planView.fields');
});
