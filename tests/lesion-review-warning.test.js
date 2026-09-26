'use strict';

// PROTEÇÃO 086 — alerta ⚠ junto ao nome da lesão quando há revisão ATIVA na
// Central de Revisões. Usa o módulo LESION_REVISIONS REAL (mesmo recorte de
// tests/lesion-review.test.js) com um DOM mínimo simulado: hosts marcados com
// data-review-warning-host, como os cards e o título do detalhe no index.html.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const MODULE_START = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSource = html.slice(html.indexOf(MODULE_START), html.indexOf(MODULE_END, html.indexOf(MODULE_START)));
assert.ok(moduleSource.length > 1000, 'módulo LESION_REVISIONS não encontrado');

// DOM mínimo: host com filhos "span.lesion-review-warning" criados via insertAdjacentHTML.
function makeHost(lesionId) {
  const host = {
    attrs: { 'data-review-warning-host': lesionId },
    children: [],
    getAttribute(n) { return this.attrs[n]; },
    querySelectorAll(sel) {
      assert.equal(sel, '.lesion-review-warning');
      return this.children.filter((c) => c.className === 'lesion-review-warning');
    },
    insertAdjacentHTML(pos, markup) {
      assert.equal(pos, 'beforeend');
      const m = /^<span class="lesion-review-warning" role="button" tabindex="0" title="([^"]*)" aria-label="([^"]*)">([\s\S]*)<\/span>$/.exec(markup); // PROTEÇÃO 091d: ⚠ clicável
      assert.ok(m, 'marcação inesperada: ' + markup);
      const child = { className: 'lesion-review-warning', title: m[1], ariaLabel: m[2], text: m[3], remove() { host.children = host.children.filter((c) => c !== child); } };
      host.children.push(child);
    }
  };
  return host;
}

function buildContext(hosts) {
  const context = {
    console, Date, Math, JSON, Object, Array,
    storage: { async get() { throw new Error('nf'); }, async set() {} },
    DATA: [{ id: 'seed_1', name: 'L1' }, { id: 'seed_2', name: 'L2' }],
    saveData: () => {}, markSyncDirty: async () => {}, pushToFirebase: () => {},
    document: {
      getElementById: () => null,
      querySelectorAll: (sel) => { assert.equal(sel, '[data-review-warning-host]'); return hosts; }
    }
  };
  vm.createContext(context);
  vm.runInContext(moduleSource, context, { filename: 'lesion-review-module.js' });
  return context;
}
const setRevisions = (ctx, obj) => vm.runInContext('LESION_REVISIONS = ' + JSON.stringify(obj) + ';', ctx);
const rev = (id, lesionId, status) => ({ id, lesionId, status, createdAt: 1, updatedAt: 1, requestText: 'x', history: [], attempts: [], humanFeedback: [] });
const icons = (host) => host.children.filter((c) => c.className === 'lesion-review-warning').length;

test('086: lesão sem revisão -> sem alerta', () => {
  const ctx = buildContext([]);
  assert.equal(ctx.hasActiveLesionReview('seed_1'), false);
  assert.equal(ctx.lesionReviewWarningHtml('seed_1'), '');
  assert.equal(ctx.hasActiveLesionReview(''), false);
  assert.equal(ctx.hasActiveLesionReview(undefined), false);
});

for (const status of ['pending', 'rejected', 'proposed', 'applied_pending_validation', 'manual_action_required']) {
  test('086: status ' + status + ' -> alerta', () => {
    const ctx = buildContext([]);
    setRevisions(ctx, { r1: rev('r1', 'seed_1', status) });
    assert.equal(ctx.hasActiveLesionReview('seed_1'), true);
    assert.equal(ctx.hasActiveLesionReview('seed_2'), false, 'só a lesão da revisão');
  });
}

test('086: status finais (accepted/cancelled) e desconhecidos -> sem alerta', () => {
  const ctx = buildContext([]);
  for (const status of ['accepted', 'cancelled', 'status_futuro', undefined]) {
    setRevisions(ctx, { r1: rev('r1', 'seed_1', status) });
    assert.equal(ctx.hasActiveLesionReview('seed_1'), false, String(status));
  }
});

test('086: duas revisões, uma ativa -> alerta; todas concluídas -> sem alerta', () => {
  const ctx = buildContext([]);
  setRevisions(ctx, { r1: rev('r1', 'seed_1', 'accepted'), r2: rev('r2', 'seed_1', 'pending') });
  assert.equal(ctx.hasActiveLesionReview('seed_1'), true);
  setRevisions(ctx, { r1: rev('r1', 'seed_1', 'accepted'), r2: rev('r2', 'seed_1', 'cancelled') });
  assert.equal(ctx.hasActiveLesionReview('seed_1'), false);
});

test('086: "ativa" é exatamente o que alimenta 🔔 (getPendingReviews) e 💡 (getReadySolutions) — sem estado paralelo', () => {
  const ctx = buildContext([]);
  const all = ['pending', 'rejected', 'proposed', 'applied_pending_validation', 'manual_action_required', 'accepted', 'cancelled'];
  const obj = {}; all.forEach((s, i) => { obj['r' + i] = rev('r' + i, 'seed_' + i, s); });
  setRevisions(ctx, obj);
  const fromBadges = new Set([...ctx.getPendingReviews(), ...ctx.getReadySolutions()].map((r) => r.lesionId));
  all.forEach((s, i) => assert.equal(ctx.hasActiveLesionReview('seed_' + i), fromBadges.has('seed_' + i), s));
});

test('086: tooltip e aria-label presentes; símbolo de atenção sem dependência externa', () => {
  const ctx = buildContext([]);
  setRevisions(ctx, { r1: rev('r1', 'seed_1', 'pending') });
  const markup = ctx.lesionReviewWarningHtml('seed_1');
  assert.match(markup, /class="lesion-review-warning"/);
  assert.match(markup, /title="Esta lesão possui revisão ativa"/);
  assert.match(markup, /aria-label="Esta lesão possui revisão ativa"/);
  assert.match(markup, /role="button"/, 'PROTEÇÃO 091d: ⚠ virou atalho clicável (antes role="img")');
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /⚠/);
  assert.doesNotMatch(markup, /<img|url\(|https?:/);
});

test('086 AO VIVO: criar revisão (createLesionReview real) -> ⚠ aparece sem F5; concluir -> some; rollback reabre -> volta', () => {
  const host = makeHost('seed_1');
  const other = makeHost('seed_2');
  const ctx = buildContext([host, other]);
  ctx.refreshLesionReviewWarnings();
  assert.equal(icons(host), 0);
  const created = ctx.createLesionReview('seed_1', 'otimizar diferenciais');
  assert.equal(created.created, true);
  assert.equal(icons(host), 1, 'createLesionReview -> updateReviewCenterBadges -> ⚠');
  assert.equal(icons(other), 0);
  assert.equal(host.children[0].title, 'Esta lesão possui revisão ativa');
  assert.equal(host.children[0].ariaLabel, 'Esta lesão possui revisão ativa');
  const id = created.review.id;
  // proposta -> aplicada aguardando validação (permanece) -> aprovada (some)
  ctx.setReviewSolution(id, 'corrigir notas', { notes: 'nova nota' });
  assert.equal(icons(host), 1, 'proposed mantém');
  const applied = ctx.authorizeAndApplyReviewSolution(id);
  assert.equal(applied.ok, true, JSON.stringify(applied.reason));
  assert.equal(icons(host), 1, 'applied_pending_validation mantém');
  ctx.approveAppliedReviewSolution(id);
  assert.equal(icons(host), 0, 'accepted -> alerta some');
  // nova revisão, aplicada e desfeita (rollback -> rejected = volta à fila)
  const c2 = ctx.createLesionReview('seed_1', 'segunda revisão');
  ctx.setReviewSolution(c2.review.id, 's', { notes: 'outra' });
  ctx.authorizeAndApplyReviewSolution(c2.review.id);
  ctx.approveAppliedReviewSolution(c2.review.id);
  assert.equal(icons(host), 0);
  const c3 = ctx.createLesionReview('seed_1', 'terceira');
  ctx.setReviewSolution(c3.review.id, 's', { notes: 'x3' });
  ctx.authorizeAndApplyReviewSolution(c3.review.id);
  const rb = ctx.rollbackAppliedReviewSolution(c3.review.id, 'não resolveu');
  assert.equal(rb.ok, true);
  assert.equal(icons(host), 1, 'rollback reabre (rejected) -> alerta volta');
  ctx.cancelLesionReview(c3.review.id, 'desisti');
  assert.equal(icons(host), 0, 'cancelada -> some');
});

test('086 AO VIVO: rerender/refresh repetido nunca duplica o ícone (e remove duplicata pré-existente)', () => {
  const host = makeHost('seed_1');
  const ctx = buildContext([host]);
  setRevisions(ctx, { r1: rev('r1', 'seed_1', 'manual_action_required') });
  for (let i = 0; i < 5; i++) ctx.refreshLesionReviewWarnings();
  ctx.updateReviewCenterBadges();
  assert.equal(icons(host), 1);
  host.insertAdjacentHTML('beforeend', ctx.lesionReviewWarningHtml('seed_1'));
  assert.equal(icons(host), 2);
  ctx.refreshLesionReviewWarnings();
  assert.equal(icons(host), 1);
});

test('086 SYNC: estado recebido da nuvem (LESION_REVISIONS substituído pelo pull) -> ⚠ aparece no refresh do pull', () => {
  const host = makeHost('seed_2');
  const ctx = buildContext([host]);
  ctx.refreshLesionReviewWarnings();
  assert.equal(icons(host), 0);
  // o pull (084) faz LESION_REVISIONS = mergeLesionRevisions(...) e chama updateReviewCenterBadges()
  setRevisions(ctx, { lrev_remoto: rev('lrev_remoto', 'seed_2', 'pending') });
  ctx.updateReviewCenterBadges();
  assert.equal(icons(host), 1);
  assert.match(extractFn('syncFromFirebase'), /updateReviewCenterBadges\(\)/, 'pull chama o refresh');
  assert.match(extractFn('adoptRemoteStateForNewDevice'), /updateReviewCenterBadges\(\)/, 'device novo também');
});

function extractFn(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(html);
  assert.ok(m, name);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < html.length; i += 1) { if (html[i] === '{') depth += 1; else if (html[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return html.slice(m.index, i + 1);
}

test('086 RENDER: card (lista principal/busca) e título do detalhe marcam o host e usam a função central', () => {
  const results = extractFn('renderResults');
  assert.match(results, /<span class="card-title" data-review-warning-host="\$\{escAttr\(e\.id\)\}">\$\{e\.name\}\$\{lesionReviewWarningHtml\(e\.id\)\}<\/span>/);
  const detail = extractFn('openDetail');
  assert.match(detail, /<h2 data-review-warning-host="\$\{escAttr\(e\.id\)\}">\$\{e\.name\}\$\{lesionReviewWarningHtml\(e\.id\)\}<\/h2>/);
  assert.match(extractFn('updateReviewCenterBadges'), /refreshLesionReviewWarnings\(\);/);
  assert.match(extractFn('renderAll'), /updateReviewCenterBadges\(\)/);
});

test('086 CSS: classe dedicada, sem imagem externa, não estica o card', () => {
  const m = /\.lesion-review-warning\{([^}]*)\}/.exec(html);
  assert.ok(m, 'CSS .lesion-review-warning');
  assert.match(m[1], /vertical-align:middle/);
  assert.match(m[1], /flex:none/);
  assert.match(m[1], /white-space:nowrap/);
  assert.doesNotMatch(m[1], /url\(/);
});

test('086: sem estado paralelo nem campo remoto — nada novo no payload do Firestore', () => {
  const write = extractFn('writeShardedState');
  assert.doesNotMatch(write, /reviewWarning|activeReview|hasActiveLesionReview/);
  assert.doesNotMatch(html, /let\s+\w*(?:ACTIVE_REVIEW|ReviewWarning)\w*\s*=/, 'nenhum estado mutável de alerta');
});
