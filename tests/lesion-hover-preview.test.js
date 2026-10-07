'use strict';

/* Preview flutuante (hover) em "ver lesão corrigida" — somente leitura.
 * Combina análise estática do index.html real com execução das funções
 * extraídas num DOM falso mínimo (sem jsdom, sem navegador, sem rede).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  // Ancora no início da linha: declarações top-level do index.html. Sem isso,
  // nomes curtos como `esc`/`escAttr` podem casar dentro de comentários.
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
// esc/escAttr são one-liners estáveis: extração por linha evita o extrator
// ingênuo de chaves (que tropeça em \" dentro de comentários adiante).
function extractLineFunction(source, name) {
  const re = new RegExp('^function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^\\n\\r]*\\}', 'm');
  const m = re.exec(source); assert.ok(m, 'helper de uma linha não encontrado: ' + name);
  return m[0];
}
const ESC_SRC = ['esc', 'escAttr'].map((n) => extractLineFunction(html, n)).join('\n');
// `let`/`const` de módulo (timers, elemento atual, delays) — mesmo padrão dos
// demais harnesses que fatiam consts por índice.
const PREVIEW_STATE_SRC = html.slice(
  html.indexOf('let lesionHoverPreviewEl'),
  html.indexOf('function lesionHoverSupported(')
);

/* ---------- estáticos ---------- */

test('helpers do preview existem e o wiring está no botão "ver lesão corrigida"', () => {
  for (const n of PREVIEW_FNS) assert.ok(html.includes('function ' + n + '('), n + ' ausente');
  assert.match(html, /wireLesionHoverPreview\(openBtn, meta\.lesion\.id\)/,
    'botão da lista applied precisa chamar wireLesionHoverPreview');
});

test('clique original continua abrindo o detalhe completo', () => {
  const i = html.indexOf('👁 ver lesão corrigida');
  assert.notEqual(i, -1, 'botão existe');
  const seg = html.slice(i, i + 900);
  assert.match(seg, /closeAllAndCleanup\(\);\s*openDetail\(meta\.lesion\.id\)/,
    'onclick preservado: fecha tudo e abre openDetail com o id da lesão');
});

test('preview usa o renderer estruturado existente, sem parser duplicado', () => {
  const body = extractFunction(html, 'lesionHoverPreviewHtml').body;
  assert.match(body, /notesDifferentialsHtml\(e\.notes\)/, 'reusa notesDifferentialsHtml');
  const allPreview = PREVIEW_FNS.map((n) => extractFunction(html, n).body).join('\n');
  assert.doesNotMatch(allPreview, /Diferenciais-chave:/, 'nenhum parser de diferenciais duplicado no preview');
});

test('preview nunca persiste, sincroniza ou navega', () => {
  const allPreview = PREVIEW_FNS.map((n) => extractFunction(html, n).body).join('\n');
  for (const pat of [/saveData\s*\(/, /pushToFirebase/, /writeShardedState/, /storage\.set/, /openDetail\s*\(/, /location|history\.push/]) {
    assert.doesNotMatch(allPreview, pat, 'preview não pode conter ' + pat);
  }
});

test('timing 300/200, ESC, instância única e CSS presentes', () => {
  assert.match(html, /LESION_HOVER_OPEN_DELAY = 300/, 'abre após ~300ms');
  assert.match(html, /LESION_HOVER_CLOSE_DELAY = 200/, 'fecha após ~200ms');
  assert.match(html, /key==='Escape'\) closeLesionHoverPreview\(\);/,
    'ESC fecha o preview');
  const openBody = extractFunction(html, 'openLesionHoverPreview').body;
  assert.match(openBody, /closeLesionHoverPreview\(\);\s*\n?\s*if\(!anchorBtn/, 'abrir fecha o anterior: um por vez');
  assert.match(html, /\.lesion-hover-preview\{[^}]*position:fixed/, 'card flutuante com position:fixed');
  assert.match(html, /\.lesion-hover-preview\{[^}]*max-height:/, 'card com teto de altura');
  assert.match(html, /\.lesion-hover-preview\{[^}]*overflow-y:auto/, 'card com scroll interno');
});

/* ---------- harness comportamental ---------- */

function makeFakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    pending,
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    fire: (ms) => {
      for (const [id, t] of [...pending]) {
        if (t.ms <= ms) { pending.delete(id); t.fn(); }
      }
    },
    count: () => pending.size
  };
}

function makeFakeEl(tag) {
  const listeners = {};
  const el = {
    tag, className: '', innerHTML: '', style: {}, removed: false, children: [],
    _listeners: listeners,
    // Altura/retângulo "renderizados" simulados — sobrescrever via
    // el.getBoundingClientRect = () => ({...}) por teste, do mesmo jeito que
    // __anchor já faz. Default 0 (sem dimensão), nunca undefined/throw.
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

function makeCtx(lesions, opts) {
  opts = opts || {};
  const timers = makeFakeTimers();
  const docListeners = {};
  const appended = [];
  const body = {
    appendChild: (el) => { appended.push(el); return el; }
  };
  const document = {
    createElement: (tag) => makeFakeEl(tag),
    body,
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter((x) => x !== f); },
    _listeners: docListeners,
    _appended: appended,
    fire: (t, ev) => { (docListeners[t] || []).slice().forEach((f) => f(ev || {})); }
  };
  const anchor = makeFakeEl('button');
  anchor.getBoundingClientRect = () => ({ left: 100, right: 200, top: 50, bottom: 70 });
  const errors = [];
  // matchMedia configurável por teste: boolean legado (vale para toda query)
  // ou função que responde por query — cobre hover/pointer combinados.
  const matchMedia = typeof opts.matchMedia === 'function' ? opts.matchMedia
    : ((q) => ({ matches: opts.hover === undefined ? true : !!opts.hover }));
  const context = {
    console: { error: (m) => errors.push(m), log: () => {}, info: () => {}, warn: () => {} },
    DATA: lesions,
    document,
    window: {
      innerWidth: 1024, innerHeight: 768,
      matchMedia
    },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    __timers: timers, __anchor: anchor, __errors: errors
  };
  vm.createContext(context);
  const deps = ['splitDifferentialItems', 'notesDifferentialsHtml'].map((n) => extractFunction(html, n).source).join('\n');
  vm.runInContext(ESC_SRC + '\n' + PREVIEW_STATE_SRC + '\n' + deps + '\n' + PREVIEW_SRC, context, { filename: 'lesion-hover-preview.js' });
  return context;
}

const LESION = {
  id: 'seed_1', name: 'Lesão Teste', s: 'Seção X', site: 'Sítio Y',
  classification: 'BIRADS', enTerm: 'test lesion',
  tags: ['densa', 'redonda'], clinicalTags: ['dor', 'febre'],
  notes: 'Padrão: nódulo denso.\nDiferenciais-chave: A (critério um); B (critério dois).'
};

test('1. hover abre o preview após o delay; 2. não abre instantaneamente', () => {
  const ctx = makeCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  ctx.__anchor.fire('mouseenter');
  assert.equal(ctx.document._appended.length, 0, 'nada abre antes dos ~300ms');
  ctx.__timers.fire(300);
  assert.equal(ctx.document._appended.length, 1, 'preview abre após o delay');
  assert.equal(ctx.document._appended[0].className, 'lesion-hover-preview');
});

test('3. mouse entra no card e ele permanece; 4. sair de botão+card fecha', () => {
  const ctx = makeCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  ctx.__anchor.fire('mouseenter');
  ctx.__timers.fire(300);
  const card = ctx.document._appended[0];
  ctx.__anchor.fire('mouseleave');
  card.fire('mouseenter');
  ctx.__timers.fire(1000);
  assert.equal(card.removed, false, 'dentro do card, o fechamento é cancelado');
  card.fire('mouseleave');
  assert.equal(card.removed, false, 'ainda aguarda o atraso de saída');
  ctx.__timers.fire(200);
  assert.equal(card.removed, true, 'sair de botão+card fecha após ~200ms');
});

test('5. ESC fecha; 6. somente um preview por vez', () => {
  const ctx = makeCtx([LESION,
    Object.assign({}, LESION, { id: 'seed_2', name: 'Outra Lesão' })]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  ctx.__anchor.fire('mouseenter');
  ctx.__timers.fire(300);
  const first = ctx.document._appended[0];
  assert.equal(vm.runInContext('openLesionHoverPreview(__anchor, "seed_2")', ctx), true);
  assert.equal(first.removed, true, 'abrir o segundo fecha o primeiro');
  assert.equal(ctx.document._appended.length, 2);
  const second = ctx.document._appended[1];
  ctx.document.fire('keydown', { key: 'Escape' });
  assert.equal(second.removed, true, 'ESC fecha');
  assert.equal(ctx.__errors.length, 0, 'sem erros no console');
});

test('7-9. lesão, tags e clinicalTags corretas no conteúdo', () => {
  const ctx = makeCtx([LESION]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  assert.match(out, /Lesão Teste/);
  assert.match(out, /Seção X · Sítio Y/);
  assert.match(out, /BIRADS/);
  assert.match(out, /test lesion/);
  assert.match(out, /densa/);
  assert.match(out, /febre/);
});

test('10-11. notes usa o renderer estruturado (Diferenciais-chave formatado)', () => {
  const ctx = makeCtx([LESION]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  assert.match(out, /<strong>Diferenciais-chave:<\/strong>/);
  assert.match(out, /<strong>A<\/strong> \(critério um\)/);
  assert.match(out, /notes-differential-item/);
});

test('posicionamento prefere a direita e respeita a viewport', () => {
  const ctx = makeCtx([LESION]);
  const el = ctx.document.createElement('div');
  vm.runInContext('positionLesionHoverPreview(__el, __anchor)', Object.assign(ctx, { __el: el }));
  assert.equal(el.style.left, '212px', 'direita do botão quando há espaço');
  const ctx2 = makeCtx([LESION]);
  const el2 = ctx2.document.createElement('div');
  const far = ctx2.document.createElement('button');
  far.getBoundingClientRect = () => ({ left: 900, right: 1000, top: 50, bottom: 70 });
  vm.runInContext('positionLesionHoverPreview(__el2, __far)', Object.assign(ctx2, { __el2: el2, __far: far }));
  assert.equal(el2.style.left, '408px', 'sem espaço: abre à esquerda');
});

/* ---------- posicionamento vertical (corte perto do rodapé) ----------
 * Bug real: o clamp antigo usava uma constante fixa (40px) no lugar da
 * altura REAL do card, então um preview alto (notes longo/vários
 * diferenciais) perto da metade/rodapé da viewport abria com a maior parte
 * fora da área visível. A correção mede a altura real já renderizada
 * (el.getBoundingClientRect().height, disponível porque o card já está no
 * DOM com CSS width/max-height aplicados antes desta função rodar) e só
 * sobe o `top` o necessário para caber — nunca baseado só no espaço ABAIXO
 * do botão. Helper local: configura anchor.top e a altura simulada do card.
 */
function positionWithHeights(anchorTop, previewHeight, vh) {
  const ctx = makeCtx([LESION]);
  ctx.window.innerHeight = vh || 768;
  const el = ctx.document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 480, height: previewHeight });
  const anchor = ctx.document.createElement('button');
  anchor.getBoundingClientRect = () => ({ left: 100, right: 200, top: anchorTop, bottom: anchorTop + 20 });
  vm.runInContext('positionLesionHoverPreview(__el, __anchor)', Object.assign(ctx, { __el: el, __anchor: anchor }));
  return parseFloat(el.style.top);
}

test('1. botão perto do topo: preview alinha ao topo do botão, nunca sobe além da margem', () => {
  const top = positionWithHeights(20, 300, 768);
  assert.equal(top, 20, 'cabe inteiro abaixo do botão — usa o topo do botão como está');
});

test('2. botão no meio da viewport com preview baixo: alinha ao topo do botão (cabe sem ajuste)', () => {
  const top = positionWithHeights(380, 150, 768);
  assert.equal(top, 380);
});

test('3. botão perto do rodapé com preview alto: sobe o preview (nunca usa só o espaço abaixo do botão)', () => {
  const top = positionWithHeights(700, 500, 768);
  assert.equal(top, 768 - 500 - 12, 'top = viewport - altura do card - margem');
  assert.ok(top < 700, 'subiu acima do topo do próprio botão — não fica "pendurado" cortado embaixo');
});

test('4. preview muito alto (quase a viewport inteira) perto do rodapé: nunca ultrapassa o topo (clamps em margem)', () => {
  const top = positionWithHeights(700, 760, 768);
  assert.equal(top, 12, 'vh-altura-margem ficaria negativo — clamp final garante top=margem');
});

test('5. preview baixo em qualquer posição: comportamento inalterado (sem ajuste de altura)', () => {
  assert.equal(positionWithHeights(50, 80, 768), 50);
  assert.equal(positionWithHeights(400, 80, 768), 400);
});

test('6. nunca top < margem, em nenhum dos cenários acima (topo/meio/rodapé × preview baixo/alto)', () => {
  const margin = 12;
  for (const [anchorTop, h] of [[0, 300], [20, 760], [700, 760], [768, 620], [1, 1]]) {
    const top = positionWithHeights(anchorTop, h, 768);
    assert.ok(top >= margin, `top=${top} para anchorTop=${anchorTop} h=${h}`);
  }
});

test('7. nunca bottom (top + altura real) > viewport - margem, quando a altura cabe na viewport', () => {
  const margin = 12, vh = 768;
  for (const [anchorTop, h] of [[0, 300], [380, 150], [700, 500], [768, 100]]) {
    const top = positionWithHeights(anchorTop, h, vh);
    if (h <= vh - 2 * margin) assert.ok(top + h <= vh - margin, `bottom ultrapassou para anchorTop=${anchorTop} h=${h}`);
  }
});

test('8. scroll interno permanece (CSS) — o ajuste de posição nunca precisa mover a lista/página', () => {
  assert.match(html, /\.lesion-hover-preview\{[^}]*overflow-y:auto/);
  assert.match(html, /\.lesion-hover-preview\{[^}]*max-height:min\(calc\(100vh - 24px\),620px\)/);
});

test('9. posicionamento horizontal existente não foi alterado por esta correção', () => {
  const body = extractFunction(html, 'positionLesionHoverPreview').body;
  assert.match(body, /left = r\.right \+ margin/);
  assert.match(body, /if\(left \+ width > vw - margin\) left = r\.left - width - margin/);
});

test('10. a correção de posicionamento não toca wiring/clique/hover (só positionLesionHoverPreview muda)', () => {
  for (const n of ['wireLesionHoverPreview', 'openLesionHoverPreview', 'closeLesionHoverPreview']) {
    assert.doesNotMatch(extractFunction(html, n).body, /getBoundingClientRect\(\)\.height/, n + ' não precisa medir altura — isso é só de positionLesionHoverPreview');
  }
});

test('13. lista não é substituída: nenhum overlay/modal é criado', () => {
  const ctx = makeCtx([LESION]);
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  ctx.__anchor.fire('mouseenter');
  ctx.__timers.fire(300);
  const overlays = ctx.document._appended.filter((el) => /overlay|modal/.test(el.className));
  assert.equal(overlays.length, 0, 'só o card flutuante, nunca overlay/modal');
  assert.equal(ctx.document._appended.length, 1);
});

test('14. lesão inexistente não causa crash nem preview quebrado', () => {
  const ctx = makeCtx([LESION]);
  assert.equal(vm.runInContext('openLesionHoverPreview(__anchor, "seed_999")', ctx), false);
  assert.equal(ctx.document._appended.length, 0);
  assert.equal(vm.runInContext('openLesionHoverPreview(null, "seed_1")', ctx), false);
  assert.equal(ctx.__errors.length, 0);
});

test('15. sem hover confiável (touch): só o clique, sem listeners', () => {
  const ctx = makeCtx([LESION], { hover: false });
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  assert.equal(ctx.__anchor.listenerCount('mouseenter'), 0);
  assert.equal(ctx.__anchor.listenerCount('mouseleave'), 0);
});

test('gate: hover:true + pointer:fine habilita', () => {
  const ctx = makeCtx([LESION], { matchMedia: (q) => ({ matches: /hover: hover/.test(q) || /pointer: fine/.test(q) }) });
  assert.equal(vm.runInContext('lesionHoverSupported()', ctx), true);
});

test('gate: hover:false + pointer:fine habilita (notebook com touch + mouse)', () => {
  const ctx = makeCtx([LESION], { matchMedia: (q) => ({ matches: /pointer: fine/.test(q) }) });
  assert.equal(vm.runInContext('lesionHoverSupported()', ctx), true);
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  assert.equal(ctx.__anchor.listenerCount('mouseenter'), 1, 'listeners conectados mesmo com hover:false');
});

test('gate: hover:true + pointer:coarse habilita', () => {
  const ctx = makeCtx([LESION], { matchMedia: (q) => ({ matches: /hover: hover/.test(q) }) });
  assert.equal(vm.runInContext('lesionHoverSupported()', ctx), true);
});

test('gate: hover:false + pointer:coarse desabilita', () => {
  const ctx = makeCtx([LESION], { matchMedia: () => ({ matches: false }) });
  assert.equal(vm.runInContext('lesionHoverSupported()', ctx), false);
});

test('gate: matchMedia indisponível/erro não quebra o clique', () => {
  const ctx = makeCtx([LESION], { matchMedia: () => { throw new Error('sem matchMedia'); } });
  assert.equal(vm.runInContext('lesionHoverSupported()', ctx), true);
  const ctx2 = makeCtx([LESION]);
  delete ctx2.window.matchMedia;
  assert.equal(vm.runInContext('lesionHoverSupported()', ctx2), true);
});

test('clique continua funcionando mesmo quando hover está desabilitado', () => {
  const ctx = makeCtx([LESION], { matchMedia: () => ({ matches: false }) });
  let opened = null;
  const btn = ctx.__anchor;
  btn.onclick = () => { opened = 'seed_1'; };
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  assert.equal(btn.listenerCount('mouseenter'), 0, 'sem listeners de hover');
  btn.onclick();
  assert.equal(opened, 'seed_1', 'onclick original intacto e funcional');
  assert.match(html, /openBtn\.onclick = \(\)=>\{ closeLesionHoverPreview\(\); closeAllAndCleanup\(\); openDetail\(meta\.lesion\.id\); \};/,
    'onclick real ainda fecha preview, limpa tudo e abre o detalhe');
});

/* ---------- legibilidade (réplica compacta do detalhe) ----------
 * Mesma filosofia dos testes acima: auditoria estática do CSS/HTML real +
 * execução das funções extraídas. notesDifferentialsHtml NUNCA é tocado —
 * todo o ganho de legibilidade abaixo é só CSS (incl. ::first-line, que não
 * precisa de marcação nova), reaproveitando as MESMAS classes do detalhe
 * completo (.detail-notes/.notes-differential-item), nunca um parser novo.
 */

test('16. título do preview: CSS evidente — negrito, ligeiramente maior, cor de destaque', () => {
  const rule = /\.lesion-hover-preview h3\{([^}]*)\}/.exec(html);
  assert.ok(rule, 'regra .lesion-hover-preview h3{} precisa existir');
  assert.match(rule[1], /font-weight:700/);
  assert.match(rule[1], /font-size:1[6-9]px/, 'ligeiramente maior que o h3 original (15px)');
  assert.match(rule[1], /color:var\(--text\)/);
});

test('17. seção/sítio do preview: cor secundária, menor destaque que o corpo das notas', () => {
  const metaRule = /\.lesion-hover-preview-meta\{([^}]*)\}/.exec(html);
  const notesRule = /\.lesion-hover-preview-notes\{([^}]*)\}/.exec(html);
  assert.ok(metaRule && notesRule);
  assert.match(metaRule[1], /color:var\(--muted-2\)/, 'meta mais discreta que o corpo');
  assert.match(notesRule[1], /color:var\(--muted\)/, 'corpo das notas no mesmo tom do detalhe completo (.detail-notes)');
});

test('18. "Padrão:" ganha destaque só por CSS (::first-line) — notesDifferentialsHtml continua sem nenhuma lógica sobre "Padrão"', () => {
  assert.match(html, /\.lesion-hover-preview-notes::first-line\{[^}]*font-weight:600[^}]*color:var\(--text\)/);
  const helperBody = extractFunction(html, 'lesionHoverPreviewHtml').body;
  assert.doesNotMatch(helperBody, /Padrão/, 'nenhuma lógica nova sobre "Padrão" dentro do preview');
  const ctx = makeCtx([LESION]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  assert.match(out, /Padrão: nódulo denso\./, '"Padrão:" continua só escapado, texto intacto');
});

test('19. "Diferenciais-chave:" ganha linha própria + espaço acima (CSS por seletor de filho direto, sem classe nova no HTML gerado)', () => {
  assert.match(html, /\.detail-notes > strong,\.lesion-hover-preview-notes > strong\{display:block;margin-top:\d+px;color:var\(--text\);?\}/,
    'regra aplicada aos DOIS containers (detalhe e preview) — mesma classe, nenhuma nova');
  const ctx = makeCtx([LESION]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  assert.match(out, /<strong>Diferenciais-chave:<\/strong>/, 'HTML do marcador não mudou (continua bare <strong>, sem atributo novo)');
});

test('20. cada diferencial em bloco próprio, com espaço perceptível entre eles (mesma classe do detalhe)', () => {
  const rule = /\.notes-differential-item\{([^}]*)\}/.exec(html);
  assert.ok(rule);
  assert.match(rule[1], /display:block/);
  assert.match(rule[1], /margin-top:[4-9]px/, 'espaço maior que o original (3px), mas ainda compacto');
});

test('21. critério (texto entre parênteses) visualmente separado do nome — nunca herda o branco/negrito do diagnóstico', () => {
  const ctx = makeCtx([LESION]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  assert.match(out, /<strong>A<\/strong> \(critério um\)/);
  assert.doesNotMatch(out, /<strong>A \(critério um/, 'o critério nunca entra dentro do <strong>');
});

/* ---------- "Nome — explicação" (travessão): 2º formato, além de "(" ---------- */

test('21b. formato antigo com parênteses continua funcionando sem nenhuma mudança (compatibilidade total)', () => {
  const ctx = makeCtx([LESION]);
  const out = vm.runInContext('notesDifferentialsHtml(DATA[0].notes)', ctx);
  assert.match(out, /<strong>A<\/strong> \(critério um\)/);
  assert.match(out, /<strong>B<\/strong> \(critério dois\)/);
});

test('21c. formato novo "Nome — explicação" (travessão) passa a funcionar: nome em <strong>, explicação em texto normal, bloco próprio', () => {
  const dashLesion = Object.assign({}, LESION, {
    notes: 'Padrão: achado típico.\nDiferenciais-chave: Diagnóstico A — descrição breve; Diagnóstico B — outra descrição.'
  });
  const ctx = makeCtx([dashLesion]);
  const out = vm.runInContext('notesDifferentialsHtml(DATA[0].notes)', ctx);
  assert.match(out, /<div class="notes-differential-item"><strong>Diagnóstico A<\/strong> — descrição breve<\/div>/);
  assert.match(out, /<div class="notes-differential-item"><strong>Diagnóstico B<\/strong> — outra descrição\.<\/div>/);
  const items = out.match(/<div class="notes-differential-item">/g) || [];
  assert.equal(items.length, 2, 'cada diferencial em bloco próprio, igual ao formato de parênteses');
});

test('21d. prosa sem separador (nem "(" nem "—") continua sem quebrar: nenhum <strong> novo, texto só escapado em bloco próprio', () => {
  const proseLesion = Object.assign({}, LESION, {
    notes: 'Padrão: achado típico.\nDiferenciais-chave: menos comum neste contexto clínico; ainda assim considerar.'
  });
  const ctx = makeCtx([proseLesion]);
  const out = vm.runInContext('notesDifferentialsHtml(DATA[0].notes)', ctx);
  assert.doesNotMatch(out, /<strong>menos|<strong>ainda/, 'sem "(" ou "—" no item, nenhum nome é inventado/destacado');
  const items = out.match(/<div class="notes-differential-item">/g) || [];
  assert.equal(items.length, 2, 'ainda quebra em bloco por item (";"), só sem negrito de nome');
});

// Referência congelada da notesDifferentialsHtml ANTERIOR a esta correção
// (só reconhecia "(" como separador nome/explicação) — usada só para provar,
// contra os dados reais, que a versão nova produz saída idêntica sempre que
// o separador novo ("—") não aparece ANTES de um "(" dentro do item (caso
// que, nos dados reais de hoje, não ocorre nenhuma vez).
const LEGACY_NOTES_DIFFERENTIALS_SRC = `
function notesDifferentialsHtml_legacy(notes){
  const raw = String(notes || '');
  const marker = 'Diferenciais-chave:';
  const idx = raw.indexOf(marker);
  if(idx === -1) return esc(raw);
  const before = raw.slice(0, idx);
  const afterMarker = idx + marker.length;
  const blank = raw.slice(afterMarker).search(/\\n\\s*\\n/);
  const sectionEnd = blank === -1 ? raw.length : afterMarker + blank;
  const section = raw.slice(afterMarker, sectionEnd).trim();
  const after = raw.slice(sectionEnd);
  const items = splitDifferentialItems(section);
  if(!items.length) return esc(raw);
  const itemsHtml = items.map(item=>{
    const parenIdx = item.indexOf('(');
    const name = parenIdx===-1 ? '' : item.slice(0, parenIdx).trim();
    if(!name) return \`<div class="notes-differential-item">\${esc(item)}</div>\`;
    const rest = item.slice(parenIdx);
    return \`<div class="notes-differential-item"><strong>\${esc(name)}</strong> \${esc(rest)}</div>\`;
  }).join('');
  return \`\${esc(before)}<strong>\${esc(marker)}</strong>\${itemsHtml}\${esc(after)}\`;
}`;

test('21e. não migra/converte as notas reais existentes: todas as lesões do SEED com "Diferenciais-chave:" renderizam IDÊNTICO à versão anterior à correção (0 casos reais de travessão antes de "(" hoje)', () => {
  const seedMatch = /const SEED = (\[.*?\]);/s.exec(html);
  assert.ok(seedMatch, 'SEED precisa ser localizável no index.html');
  const seed = JSON.parse(seedMatch[1]);
  const withDiff = seed.filter(l => typeof l.notes === 'string' && l.notes.includes('Diferenciais-chave:'));
  assert.ok(withDiff.length > 900, 'sanity check: ainda existem ~1.014 lesões reais com Diferenciais-chave:');
  const ctx = makeCtx(withDiff);
  vm.runInContext(LEGACY_NOTES_DIFFERENTIALS_SRC, ctx);
  for (let i = 0; i < withDiff.length; i++) {
    const current = vm.runInContext(`notesDifferentialsHtml(DATA[${i}].notes)`, ctx);
    const legacy = vm.runInContext(`notesDifferentialsHtml_legacy(DATA[${i}].notes)`, ctx);
    assert.equal(current, legacy, `lesão "${withDiff[i].name}" (${withDiff[i].id}) rendeu diferente da versão anterior — não deveria, pois nenhuma nota real usa travessão`);
  }
});

test('21f. detalhe da lesão, preview por hover e Quiz pós-resposta continuam chamando o MESMO renderer (notesDifferentialsHtml) — nenhum parser novo por lugar', () => {
  const detailBody = extractFunction(html, 'openDetail').body;
  assert.match(detailBody, /notesDifferentialsHtml\(e\.notes\)/, 'detalhe da lesão usa o mesmo helper');
  const quizSrc = html.slice(html.indexOf('function renderDetail(){'), html.indexOf('function renderDetail(){') + 600);
  assert.match(quizSrc, /notesDifferentialsHtml\(e\.notes\)/, 'Quiz pós-resposta usa o mesmo helper');
  const previewBody = extractFunction(html, 'lesionHoverPreviewHtml').body;
  assert.match(previewBody, /notesDifferentialsHtml\(e\.notes\)/, 'preview por hover usa o mesmo helper');
});

test('22. notes SEM "Diferenciais-chave:" dentro do preview continua normal (só escapado, nenhuma marcação nova)', () => {
  const plain = Object.assign({}, LESION, { notes: 'lesão óssea benigna clássica' });
  const ctx = makeCtx([plain]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  assert.match(out, /<div class="lesion-hover-preview-notes">lesão óssea benigna clássica<\/div>/,
    'notes aparece só escapada dentro do container, sem nenhuma marcação nova');
  assert.doesNotMatch(out, /<strong>|notes-differential-item/, 'sem o marcador, notesDifferentialsHtml não insere HTML novo');
});

test('23. notes longo com vários diferenciais renderiza por completo; card mantém teto de altura (70-80vh) + scroll interno próprio (nunca move a lista/página)', () => {
  const longLesion = Object.assign({}, LESION, {
    notes: 'Padrão: ' + 'achado longo repetido. '.repeat(40) + '\nDiferenciais-chave: ' +
      Array.from({ length: 6 }, (_, i) => `Diagnóstico ${i} (critério discriminativo número ${i} bem detalhado)`).join('; ') + '.'
  });
  const ctx = makeCtx([longLesion]);
  const out = vm.runInContext('lesionHoverPreviewHtml(DATA[0])', ctx);
  const items = out.match(/<div class="notes-differential-item">/g) || [];
  assert.equal(items.length, 6, 'os 6 diferenciais são renderizados inteiros, sem truncar nem paginar');
  assert.match(html, /\.lesion-hover-preview\{[^}]*max-height:min\(calc\(100vh - 24px\),620px\)/, 'teto de altura adaptativo à viewport real (nunca cobre a tela toda)');
  assert.match(html, /\.lesion-hover-preview\{[^}]*overflow-y:auto/, 'scroll interno — nunca o da lista/viewport');
  assert.match(html, /\.lesion-hover-preview\{[^}]*width:480px/, 'largura dentro de 480-540px');
});

/* ---------- Validar correção: mesmo preview, nenhum sistema novo ---------- */

test('24. "👁 ver lesão" do modal "Validar correção" agora chama o MESMO wireLesionHoverPreview (sem segundo sistema de preview)', () => {
  const body = extractFunction(html, 'openReviewValidationModal').body;
  assert.match(body, /id="review-validate-open-lesion"/, 'botão existe dentro do modal correto');
  assert.match(body, /wireLesionHoverPreview\(openLesionBtn, meta\.lesion\.id\)/, 'reusa exatamente a função já usada em "ver lesão corrigida"');
  assert.doesNotMatch(body, /function\s+lesionHoverPreviewHtml|notesDifferentialsHtml\(/, 'nenhum renderer de preview duplicado dentro do modal');
});

test('25. clique no "👁 ver lesão" do modal "Validar correção" continua abrindo o detalhe completo e fecha o modal/preview antes', () => {
  const body = extractFunction(html, 'openReviewValidationModal').body;
  assert.match(body, /openLesionBtn\.onclick = \(\)=>\{ closeLesionHoverPreview\(\); close\(\); openDetail\(meta\.lesion\.id\); \};/);
});

test('26. a nova chamada em "Validar correção" não introduz saveData/push/sync/storage (mesma garantia do preview em geral)', () => {
  const body = extractFunction(html, 'openReviewValidationModal').body;
  for (const pat of [/saveData\s*\(/, /pushToFirebase/, /writeShardedState/, /storage\.set/]) {
    assert.doesNotMatch(body, pat, 'não pode conter ' + pat);
  }
});

test('27. touch no botão de "Validar correção" continua usando só o clique (mesmo guard lesionHoverSupported de wireLesionHoverPreview, já comprovado touch-safe acima)', () => {
  const ctx = makeCtx([LESION], { hover: false });
  // Reproduz o wiring real do modal (mesma função, mesmo argumento) fora do DOM real.
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  assert.equal(ctx.__anchor.listenerCount('mouseenter'), 0, 'sem listeners de hover em touch — clique normal preservado');
});

/* ---------- Revisões pendentes: mesmo preview, 3º ponto da interface ----------
 * 2-6 (abrir a lesão certa, notes estruturado, Padrão, Diferenciais-chave,
 * negrito) e 7-8 (sair/ESC fecham) são propriedades do MESMO
 * wireLesionHoverPreview/openLesionHoverPreview/lesionHoverPreviewHtml já
 * exaustivamente testados acima (shared, sem override aqui) — por isso os
 * testes abaixo focam no que é específico deste botão: existência do
 * wiring, composição (sem renderer duplicado), onclick preservado,
 * isolamento hover×fechamento da lista, ausência de saveData/DATA, e touch.
 */

test('28. "ver lesão" de "Revisões pendentes" (3º ponto) recebe o MESMO wireLesionHoverPreview', () => {
  const body = extractFunction(html, 'openPendingReviewsModal').body;
  assert.match(body, /class="btn btn-ghost review-open-lesion">ver lesão<\/button>/, 'botão existe dentro do modal correto');
  assert.match(body, /wireLesionHoverPreview\(openBtn, meta\.lesion\.id\)/, 'reusa exatamente a função já usada nos outros dois pontos');
});

test('29. nenhum renderer/parser de preview duplicado dentro de "Revisões pendentes" (reuso, não recriação)', () => {
  const body = extractFunction(html, 'openPendingReviewsModal').body;
  assert.doesNotMatch(body, /function\s+lesionHoverPreviewHtml|notesDifferentialsHtml\(|Diferenciais-chave:/, 'nenhuma lógica de preview/diferenciais reimplementada aqui');
});

test('30. clique normal em "Revisões pendentes" continua abrindo o detalhe completo (comportamento de clique preservado)', () => {
  const body = extractFunction(html, 'openPendingReviewsModal').body;
  assert.match(body, /openBtn\.onclick = \(\)=>\{ closeLesionHoverPreview\(\); closeOverlay\(\); document\.removeEventListener\('keydown', closeOnEsc\); openDetail\(meta\.lesion\.id\); \};/,
    'onclick real: fecha o preview (se aberto), fecha a lista e abre o detalhe — exatamente como antes, só com closeLesionHoverPreview() adicionado na frente');
});

test('31. hover isolado do fechamento da lista: wireLesionHoverPreview/openLesionHoverPreview/closeLesionHoverPreview nunca chamam closeOverlay/closeAllAndCleanup', () => {
  for (const n of ['wireLesionHoverPreview', 'openLesionHoverPreview', 'closeLesionHoverPreview']) {
    assert.doesNotMatch(extractFunction(html, n).body, /closeOverlay\(|closeAllAndCleanup\(/, n + ' não pode fechar nenhuma tela/modal por conta própria');
  }
});

test('32. a nova chamada em "Revisões pendentes" não introduz saveData/push/sync/storage nem toca DATA diretamente', () => {
  const body = extractFunction(html, 'openPendingReviewsModal').body;
  for (const pat of [/saveData\s*\(/, /pushToFirebase/, /writeShardedState/, /storage\.set/, /\bDATA\s*=/, /DATA\.(push|splice)\(/]) {
    assert.doesNotMatch(body, pat, 'não pode conter ' + pat);
  }
});

test('33. touch no botão de "Revisões pendentes" continua usando só o clique (mesmo guard lesionHoverSupported)', () => {
  const ctx = makeCtx([LESION], { hover: false });
  vm.runInContext('wireLesionHoverPreview(__anchor, "seed_1")', ctx);
  assert.equal(ctx.__anchor.listenerCount('mouseenter'), 0, 'sem listeners de hover em touch — clique normal preservado');
});

test('34. os três pontos da interface (ver lesão corrigida / Validar correção / Revisões pendentes) chamam exatamente o mesmo par onclick+wireLesionHoverPreview — nenhum componente novo', () => {
  const sites = ['openPendingReviewsModal', 'openReviewValidationModal'];
  for (const fn of sites) {
    const body = extractFunction(html, fn).body;
    assert.match(body, /wireLesionHoverPreview\(open(Btn|LesionBtn), meta\.lesion\.id\)/);
  }
  // "ver lesão corrigida" já coberto pelo primeiro teste estático do arquivo.
  assert.match(html, /wireLesionHoverPreview\(openBtn, meta\.lesion\.id\)/);
});
