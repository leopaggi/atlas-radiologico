'use strict';

/* PROTEÇÃO 091d — editar o MOTIVO (requestText) de uma revisão ativa, com
 * histórico (requestHistory), sync entre PCs e atalho pelo ⚠. Usa o módulo
 * REAL da Central (trecho do index.html entre LESION_REVISIONS_KEY e o
 * comentário de EN_TERMS) num `vm` isolado, com storage falso em memória.
 * Nenhum acesso a IndexedDB, Firestore, Cloudinary ou rede.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada no index.html');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
const START = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const END = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSource = html.slice(html.indexOf(START), html.indexOf(END, html.indexOf(START)));
const plain = (v) => JSON.parse(JSON.stringify(v));

function buildCtx() {
  const backing = {};
  const listeners = [];
  const opened = [];
  const makeBtn = () => ({ classList: { empty: null, toggle(c, v) { this.empty = v; } } });
  const els = { 'pending-reviews-btn': makeBtn(), 'pending-reviews-badge': { textContent: '' }, 'ready-solutions-btn': makeBtn(), 'ready-solutions-badge': { textContent: '' } };
  const ctx = {
    console, Date, Math, JSON, Object, Array,
    storage: { async get(k) { if (k in backing) return { value: backing[k] }; throw new Error('nf'); }, async set(k, v) { backing[k] = v; } },
    __backing: backing, DATA: [], saveData: () => {}, dirty: 0,
    markSyncDirty: async () => { ctx.dirty += 1; }, pushToFirebase: () => {},
    toast: () => {},
    document: {
      getElementById: (id) => els[id] || null,
      querySelectorAll: () => [],
      addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture })
    },
    openReviewSummaryModal: (id) => opened.push(['summary', id]),
    openLesionReviewsListModal: (lesionId, ids) => opened.push(['list', lesionId, ids])
  };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(html, 'canonicalJsonString') + '\n' + moduleSource + '\nthis.__setRevs = (v) => { LESION_REVISIONS = v; }; this.__revs = () => LESION_REVISIONS;', ctx);
  return { ctx, els, listeners, opened, backing };
}
function rev(id, over) {
  return Object.assign({ id, lesionId: 'seed_1', createdAt: 1000, updatedAt: 1000, status: 'pending', requestText: 'revisar descrição',
    solution: null, attempts: [], humanFeedback: [], history: [{ timestamp: 1000, action: 'created', details: null }] }, over || {});
}

test('091d 1-4: pending, rejected, proposed, applied_pending_validation e manual_action_required podem editar', () => {
  for (const st of ['pending', 'rejected', 'proposed', 'applied_pending_validation', 'manual_action_required']) {
    const { ctx } = buildCtx();
    ctx.__setRevs({ R: rev('R', { status: st }) });
    const res = ctx.editReviewRequestText('R', 'revisar descrição e diferenciais');
    assert.equal(res.ok, true, st);
    assert.equal(ctx.__revs().R.requestText, 'revisar descrição e diferenciais');
    assert.equal(ctx.__revs().R.status, st, 'status não muda (' + st + ')');
  }
});

test('091d 5-6: accepted e cancelled são somente leitura (motivo original intacto)', () => {
  for (const st of ['accepted', 'cancelled']) {
    const { ctx } = buildCtx();
    ctx.__setRevs({ R: rev('R', { status: st }) });
    const res = ctx.editReviewRequestText('R', 'outro texto');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not_editable');
    assert.equal(ctx.__revs().R.requestText, 'revisar descrição');
    assert.equal(ctx.__revs().R.requestHistory, undefined);
    assert.equal(ctx.isReviewRequestEditable(ctx.__revs().R), false);
  }
});

test('091d 7-11: mesmo reviewId, status/solution/attempts/feedback/createdAt preservados; histórico registra o anterior e acumula', () => {
  const { ctx } = buildCtx();
  const base = rev('R', { status: 'proposed', solution: { text: 's' }, attempts: [{ id: 'a1' }], humanFeedback: [{ at: 5, text: 'f' }], category: null });
  ctx.__setRevs({ R: base });
  const before = plain(base);
  const r1 = ctx.editReviewRequestText('R', 'revisar descrição + classificação');
  assert.equal(r1.ok, true);
  const r = ctx.__revs().R;
  assert.equal(Object.keys(ctx.__revs()).length, 1, 'nenhum reviewId novo');
  assert.equal(r.id, 'R');
  for (const k of ['status', 'solution', 'attempts', 'humanFeedback', 'createdAt', 'lesionId', 'updatedAt']) assert.deepEqual(plain(r[k]), before[k], k);
  assert.deepEqual(plain(r.requestHistory).map((h) => [h.action, h.text]), [['created', 'revisar descrição'], ['edited', 'revisar descrição + classificação']]);
  assert.equal(r.requestHistory[0].at, 1000, 'entrada "created" usa o createdAt da revisão antiga');
  assert.ok(r.requestTextUpdatedAt > 1000);
  assert.equal(r.history.at(-1).action, 'request_edited');
  const r2 = ctx.editReviewRequestText('R', 'terceira versão');
  assert.equal(r2.ok, true);
  assert.deepEqual(plain(ctx.__revs().R.requestHistory).map((h) => h.text), ['revisar descrição', 'revisar descrição + classificação', 'terceira versão']);
  const ats = plain(ctx.__revs().R.requestHistory).map((h) => h.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b), 'ordem estável');
  assert.equal(new Set(ats).size, ats.length, 'carimbos distintos mesmo no mesmo ms');
});

test('091d: texto vazio / igual / revisão inexistente não alteram nada; salvar marca dirty (sync)', () => {
  const { ctx } = buildCtx();
  ctx.__setRevs({ R: rev('R') });
  assert.equal(ctx.editReviewRequestText('R', '   ').reason, 'empty');
  assert.equal(ctx.editReviewRequestText('R', ' revisar descrição ').reason, 'unchanged');
  assert.equal(ctx.editReviewRequestText('X', 'a').reason, 'not_found');
  assert.equal(ctx.__revs().R.requestHistory, undefined);
  ctx.editReviewRequestText('R', 'novo');
  return new Promise((r) => setImmediate(r)).then(() => assert.ok(ctx.dirty >= 1, 'saveLesionRevisions() sem internal = dirty + push'));
});

test('091d 12: sync (merge real) preserva o histórico e o texto editado', () => {
  const { ctx } = buildCtx();
  ctx.__setRevs({ R: rev('R') });
  ctx.editReviewRequestText('R', 'editado no PC A');
  const local = plain(ctx.__revs());
  const remoteOld = { R: rev('R') }; // nuvem ainda sem a edição
  const merged = plain(ctx.mergeLesionRevisions(local, remoteOld));
  assert.equal(merged.R.requestText, 'editado no PC A');
  assert.equal(merged.R.requestHistory.length, 2);
  const merged2 = plain(ctx.mergeLesionRevisions(remoteOld, local)); // ordem inversa (PC B puxando)
  assert.deepEqual(merged2.R, merged.R);
});

test('091d 13: conflito multi-PC converge — texto mais recente vence, histórico é UNIÃO, status/proposta do outro PC não se perdem', () => {
  const A = buildCtx().ctx; const B = buildCtx().ctx;
  A.__setRevs({ R: rev('R') }); B.__setRevs({ R: rev('R') });
  A.editReviewRequestText('R', 'versão do PC A');
  const tA = A.__revs().R.requestTextUpdatedAt;
  B.editReviewRequestText('R', 'versão do PC B');
  B.__revs().R.requestTextUpdatedAt = tA + 50; B.__revs().R.requestHistory[1].at = tA + 50; // B editou depois
  // PC A também recebeu uma proposta (updatedAt mais novo) enquanto B só editou o texto
  Object.assign(A.__revs().R, { status: 'proposed', solution: { text: 'proposta' }, updatedAt: 9e12 });
  const ab = plain(A.mergeLesionRevisions(plain(A.__revs()), plain(B.__revs())));
  const ba = plain(A.mergeLesionRevisions(plain(B.__revs()), plain(A.__revs())));
  assert.deepEqual(ab, ba, 'converge em qualquer ordem');
  assert.equal(ab.R.requestText, 'versão do PC B', 'edição mais recente vence');
  assert.equal(ab.R.status, 'proposed', 'a proposta do PC A não é perdida pela edição de texto do PC B');
  assert.deepEqual(ab.R.requestHistory.map((h) => h.text), ['revisar descrição', 'versão do PC A', 'versão do PC B'], 'união deduplicada');
});

test('091d 14: contador 🔔 (e 💡) não muda ao editar o motivo', () => {
  const { ctx, els } = buildCtx();
  ctx.__setRevs({ P: rev('P'), Q: rev('Q', { status: 'rejected', lesionId: 'seed_2' }), S: rev('S', { status: 'proposed', lesionId: 'seed_3' }) });
  ctx.updateReviewCenterBadges();
  const before = [ctx.countPendingLesionReviews(), els['pending-reviews-badge'].textContent, ctx.countReadyLesionSolutions(), els['ready-solutions-badge'].textContent];
  assert.equal(before[0], 2);
  ctx.editReviewRequestText('P', 'motivo novo');
  ctx.editReviewRequestText('S', 'motivo novo 2');
  const after = [ctx.countPendingLesionReviews(), els['pending-reviews-badge'].textContent, ctx.countReadyLesionSolutions(), els['ready-solutions-badge'].textContent];
  assert.deepEqual(after, before);
  assert.equal(ctx.hasActiveLesionReview('seed_1'), true);
});

test('091d 15-16: ⚠ com UMA revisão ativa abre ela; com várias mostra a lista (nunca escolhe uma)', () => {
  const { ctx, opened } = buildCtx();
  ctx.__setRevs({ A: rev('A', { lesionId: 'seed_1' }), B: rev('B', { lesionId: 'seed_2', updatedAt: 1 }), C: rev('C', { lesionId: 'seed_2', updatedAt: 2, status: 'manual_action_required' }), D: rev('D', { lesionId: 'seed_2', status: 'accepted' }) });
  const one = plain(ctx.openLesionActiveReviewsShortcut('seed_1'));
  assert.deepEqual(one, { mode: 'single', reviewIds: ['A'] });
  const many = plain(ctx.openLesionActiveReviewsShortcut('seed_2'));
  assert.equal(many.mode, 'list');
  assert.deepEqual(many.reviewIds, ['C', 'B'], 'só as ativas (accepted fora), mais recente primeiro');
  assert.deepEqual(plain(opened), [['summary', 'A'], ['list', 'seed_2', ['C', 'B']]]);
  assert.equal(plain(ctx.openLesionActiveReviewsShortcut('seed_9')).mode, 'none');
});

test('091d 17: clique/Enter no ⚠ é capturado — stopPropagation/preventDefault impedem abrir/fechar o detalhe por acidente', () => {
  const { ctx, listeners, opened } = buildCtx();
  ctx.__setRevs({ A: rev('A') });
  assert.ok(listeners.some((l) => l.type === 'click' && l.capture === true && l.fn === ctx.handleLesionReviewWarningEvent), 'listener de captura no document');
  assert.ok(listeners.some((l) => l.type === 'keydown' && l.capture === true));
  const host = { getAttribute: (k) => (k === 'data-review-warning-host' ? 'seed_1' : null) };
  const icon = { closest: (sel) => (sel === '.lesion-review-warning' ? icon : sel === '[data-review-warning-host]' ? host : null) };
  const calls = [];
  const ev = { type: 'click', target: icon, preventDefault: () => calls.push('pd'), stopPropagation: () => calls.push('sp'), stopImmediatePropagation: () => calls.push('sip') };
  assert.equal(ctx.handleLesionReviewWarningEvent(ev), true);
  assert.deepEqual(calls, ['pd', 'sp', 'sip']);
  assert.deepEqual(plain(opened), [['summary', 'A']]);
  // clique fora do ⚠ (card normal): não interfere
  const other = { type: 'click', target: { closest: () => null }, stopPropagation: () => { throw new Error('não deveria parar'); } };
  assert.equal(ctx.handleLesionReviewWarningEvent(other), false);
  // tecla que não é Enter/Espaço: ignora
  assert.equal(ctx.handleLesionReviewWarningEvent({ type: 'keydown', key: 'Tab', target: icon }), false);
  // markup acessível
  const markup = ctx.lesionReviewWarningHtml('seed_1');
  assert.match(markup, /role="button"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /aria-label="Esta lesão possui revisão ativa"/);
  assert.match(markup, /title="Esta lesão possui revisão ativa"/);
});

test('091d 18: pendência GERAL também pode ter o motivo editado enquanto ativa (e continua sem ⚠)', () => {
  const { ctx } = buildCtx();
  const g = ctx.createReviewRequest({ scope: 'global', requestText: 'auditar duplicatas', category: 'duplicates' });
  assert.equal(g.created, true);
  const res = ctx.editReviewRequestText(g.review.id, 'auditar duplicatas em neurorradiologia');
  assert.equal(res.ok, true);
  const r = ctx.__revs()[g.review.id];
  assert.deepEqual([r.scope, r.lesionId, r.category, r.status], ['global', null, 'duplicates', 'pending']);
  assert.equal(r.requestText, 'auditar duplicatas em neurorradiologia');
  ctx.setGlobalReviewSolution(g.review.id, 'análise');
  ctx.completeGlobalReview(g.review.id);
  assert.equal(ctx.editReviewRequestText(g.review.id, 'x').reason, 'not_editable', 'concluída = somente leitura');
});

test('091d: revisão antiga sem requestHistory continua válida (leitura mostra o pedido como "criado")', () => {
  const { ctx } = buildCtx();
  const h = plain(ctx.reviewRequestHistory(rev('R')));
  assert.deepEqual(h, [{ at: 1000, text: 'revisar descrição', action: 'created' }]);
  const merged = plain(ctx.mergeLesionRevisions({ R: rev('R') }, { R: rev('R') }));
  assert.equal('requestHistory' in merged.R, false, 'merge de legadas não cria campo novo');
  assert.equal('requestTextUpdatedAt' in merged.R, false);
});

test('091d a IA recebe o motivo ATUAL (pacote da ponte manual usa requestText editado)', () => {
  const { ctx } = buildCtx();
  ctx.DATA.push({ id: 'seed_1', name: 'L', s: 'S', site: 'X', tags: [], notes: '' });
  ctx.__setRevs({ R: rev('R') });
  ctx.editReviewRequestText('R', 'motivo atualizado para a IA');
  const p = ctx.buildReviewAiPrompt('R');
  assert.equal(p.ok, true);
  assert.match(p.text, /motivo atualizado para a IA/);
});

test('091d UI: Central tem ✏ Editar solicitação (só ativas) em todas as listas; modais de edição/resumo/lista existem', () => {
  const edit = (html.match(/review-edit-request">✏ Editar solicitação/g) || []).length;
  assert.equal(edit, 5, 'pendentes, global proposta, proposta, aplicada e ação manual');
  assert.equal((html.match(/\$\{isReviewRequestEditable\(r\)\?'<button type="button" class="btn btn-ghost review-edit-request">/g) || []).length, 5);
  const m = extractFunction(html, 'openEditReviewRequestModal');
  assert.match(m, /Editar motivo da revisão/);
  assert.match(m, /Salvar alteração/);
  assert.match(m, /Cancelar/);
  assert.match(m, /ta\.value = review\.requestText/, 'texto entra via .value (nunca HTML)');
  assert.match(m, /ov\.remove\(\)/);
  assert.doesNotMatch(m, /closeOverlay\(\)/, 'não fecha o detalhe/Central por baixo');
  assert.match(extractFunction(html, 'reviewRequestHistoryHtml'), /<details class="review-request-history"><summary>Histórico do pedido/);
  const s = extractFunction(html, 'openReviewSummaryModal');
  assert.match(s, /Motivo atual/);
  assert.match(s, /✏ Editar solicitação/);
  assert.match(s, /Abrir Central completa/);
  assert.match(extractFunction(html, 'openLesionReviewsListModal'), /Esta lesão possui \$\{\(reviewIds\|\|\[\]\)\.length\} revisões ativas/);
  assert.match(html, /\.lesion-review-warning\{[^}]*cursor:pointer;/);
});
