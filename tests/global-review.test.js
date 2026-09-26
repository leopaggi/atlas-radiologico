'use strict';

// PROTEÇÃO 091 — PENDÊNCIAS GERAIS do Atlas dentro de LESION_REVISIONS
// (scope "global", lesionId null, categoria opcional). Usa o módulo REAL da
// Central de Revisões (mesmo recorte de tests/lesion-review.test.js).
// Sync PC A -> PC B fica em tests/multi-device-sync.test.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const MODULE_START = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSource = html.slice(html.indexOf(MODULE_START), html.indexOf(MODULE_END, html.indexOf(MODULE_START)));
assert.ok(moduleSource.length > 1000);

function extractFn(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(html);
  assert.ok(m, name);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < html.length; i += 1) { if (html[i] === '{') depth += 1; else if (html[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return html.slice(m.index, i + 1);
}
const plain = (v) => JSON.parse(JSON.stringify(v));

function makeCtx() {
  const backing = {};
  const data = [{ id: 'seed_1', name: 'Lesão 1', s: 'S', site: 'T', notes: 'n', tags: [] }];
  const ctx = {
    console, Date, Math, JSON, Object, Array,
    storage: { async get(k) { if (k in backing) return { value: backing[k] }; throw new Error('nf'); }, async set(k, v) { backing[k] = v; } },
    __backing: backing,
    DATA: data, saveDataCalls: 0,
    markSyncDirty: async () => {}, pushToFirebase: () => {}
  };
  ctx.saveData = () => { ctx.saveDataCalls += 1; };
  vm.createContext(ctx);
  vm.runInContext(moduleSource + '\nfunction __revs(){ return LESION_REVISIONS; }\nfunction __setRevs(v){ LESION_REVISIONS = v; }', ctx);
  return ctx;
}
const G = (c, text, category) => c.createReviewRequest({ scope: 'global', requestText: text, category });

test('091-1/23: revisão antiga sem scope = lesion e continua funcionando igual', () => {
  const c = makeCtx();
  assert.equal(c.reviewScope({ id: 'x', lesionId: 'seed_1' }), 'lesion');
  assert.equal(c.reviewScope(null), 'lesion');
  const r = c.createLesionReview('seed_1', 'corrigir notas');
  assert.equal(r.created, true);
  assert.equal('scope' in r.review, false, 'formato antigo preservado');
  assert.equal(c.reviewScope(r.review), 'lesion');
  assert.equal(c.setReviewSolution(r.review.id, 's', { notes: 'x' }).ok, true);
  assert.equal(c.authorizeAndApplyReviewSolution(r.review.id).ok, true, 'fluxo de lesão intacto');
});

test('091-2/3/4/5: cria global sem lesionId; exige texto; lesion exige lesionId; categoria opcional validada', () => {
  const c = makeCtx();
  const g = G(c, '  Auditar duplicatas de fígado  ', 'duplicates');
  assert.equal(g.created, true);
  assert.deepEqual({ scope: g.review.scope, lesionId: g.review.lesionId, requestText: g.review.requestText, category: g.review.category, status: g.review.status },
    { scope: 'global', lesionId: null, requestText: 'Auditar duplicatas de fígado', category: 'duplicates', status: 'pending' });
  assert.equal(G(c, '   ').reason, 'invalid_input');
  assert.equal(c.createReviewRequest({ scope: 'lesion', requestText: 'x' }).reason, 'invalid_input', 'lesion sem lesionId');
  assert.equal(c.createReviewRequest({ scope: 'lesion', lesionId: 'seed_1', requestText: 'rever diferenciais' }).created, true, 'wrapper para createLesionReview');
  assert.equal(G(c, 'Categoria inválida', 'hackear').review.category, null);
  assert.equal(G(c, 'Sem categoria').review.category, null);
});

test('091-24/25: duplicata EXATA de global ativa não cria outra; textos diferentes coexistem; concluída libera o mesmo texto', () => {
  const c = makeCtx();
  const a = G(c, 'Revisar classificações O-RADS');
  const dup = G(c, 'Revisar classificações O-RADS');
  assert.equal(dup.created, false);
  assert.equal(dup.reason, 'duplicate');
  assert.equal(G(c, 'Verificar lesões sem imagens').created, true);
  assert.equal(Object.keys(plain(c.__revs())).length, 2);
  c.cancelLesionReview(a.review.id, 'feito à mão');
  assert.equal(G(c, 'Revisar classificações O-RADS').created, true, 'a anterior não está mais ativa');
});

test('091-8/9/16: global conta no 🔔, pending funciona e NUNCA gera ⚠ em lesão', () => {
  const c = makeCtx();
  const g = G(c, 'Auditar tags inconsistentes');
  assert.ok(c.getPendingReviews().some((r) => r.id === g.review.id));
  assert.equal(c.countPendingLesionReviews(), 1);
  assert.equal(c.hasActiveLesionReview('seed_1'), false);
  assert.equal(c.hasActiveLesionReview(null), false);
  assert.equal(c.hasActiveLesionReview(undefined), false);
  // mesmo se uma pendência global carregasse um lesionId por erro, não alerta
  c.__setRevs({ z: { id: 'z', scope: 'global', lesionId: 'seed_1', status: 'pending', requestText: 'x' } });
  assert.equal(c.hasActiveLesionReview('seed_1'), false);
});

test('091-10/26: solução TEXTUAL global -> 💡 (proposed) -> ✓ Concluir (accepted) sem alterar DATA', () => {
  const c = makeCtx();
  const before = JSON.stringify(c.DATA);
  const g = G(c, 'Auditar duplicatas de fígado', 'duplicates');
  const s = c.setGlobalReviewSolution(g.review.id, 'Foram identificados 7 grupos candidatos: ...', { summary: '7 grupos', reasoning: 'nomes semelhantes' });
  assert.equal(s.ok, true);
  assert.equal(s.review.status, 'proposed');
  assert.deepEqual(plain(s.review.solution.proposedChanges), {});
  assert.ok(c.getReadySolutions().some((r) => r.id === g.review.id), 'aparece no 💡');
  const done = c.completeGlobalReview(g.review.id);
  assert.equal(done.ok, true);
  assert.equal(done.review.status, 'accepted');
  assert.equal(JSON.stringify(c.DATA), before, 'DATA intocado');
  assert.equal(c.saveDataCalls, 0);
  assert.equal(c.getReadySolutions().length + c.getPendingReviews().length, 0);
  assert.equal(c.setGlobalReviewSolution(g.review.id, 'x').ok, false, 'concluída não aceita nova análise');
  assert.equal(c.setGlobalReviewSolution(g.review.id, '').reason, 'not_proposable');
});

test('091-11/12/13/14: rejected (devolver), manual_action_required, accepted e cancelled funcionam para global', () => {
  const c = makeCtx();
  const g = G(c, 'Revisar descrições pancreáticas');
  c.setGlobalReviewSolution(g.review.id, 'análise 1');
  const rej = c.rejectProposedReviewSolution(g.review.id, 'faltou IPMN');
  assert.equal(rej.ok, true);
  assert.equal(rej.review.status, 'rejected');
  assert.ok(c.getPendingReviews().some((r) => r.id === g.review.id), 'volta ao 🔔');
  assert.equal(c.setGlobalReviewSolution(g.review.id, 'análise 2 com IPMN').review.status, 'proposed', 'reabre com nova análise');
  const g2 = G(c, 'Auditar imagens sem fonte');
  const man = c.flagManualActionRequired(g2.review.id, 'exige checagem visual', 'imagens');
  assert.equal(man.ok, true);
  assert.equal(man.review.status, 'manual_action_required');
  assert.equal(c.completeGlobalReview(g2.review.id).review.status, 'accepted');
  const g3 = G(c, 'Algo que não precisa mais');
  assert.equal(c.cancelLesionReview(g3.review.id, 'desisti').review.status, 'cancelled');
  assert.equal(c.saveDataCalls, 0);
});

test('091-15: aplicação direta em DATA é recusada para global (authorize/rollback/placement/setReviewSolution)', () => {
  const c = makeCtx();
  const before = JSON.stringify(c.DATA);
  const g = G(c, 'Revisar classificações');
  // mesmo forçando um estado "proposto com mudanças", nunca aplica
  const r = c.__revs()[g.review.id];
  r.status = 'proposed'; r.solution = { text: 'x', proposedChanges: { notes: 'HACK' } };
  assert.equal(c.authorizeAndApplyReviewSolution(g.review.id).reason, 'global_review_has_no_direct_target');
  r.status = 'applied_pending_validation';
  assert.equal(c.rollbackAppliedReviewSolution(g.review.id).reason, 'global_review_has_no_direct_target');
  r.status = 'manual_action_required';
  assert.equal(c.applyReviewAiSuggestedPlacement(g.review.id).reason, 'global_review_has_no_direct_target');
  r.status = 'pending';
  assert.equal(c.setReviewSolution(g.review.id, 's', { notes: 'x' }).reason, 'global_review_has_no_direct_target');
  assert.equal(JSON.stringify(c.DATA), before);
  assert.equal(c.saveDataCalls, 0);
  assert.equal(c.completeGlobalReview(c.createLesionReview('seed_1', 'x').review.id).reason, 'not_global', 'concluir é só para global');
});

test('091-17/18: pacote/prompt da IA — scope global, categoria, sem lesionId nem campos de lesão', () => {
  const c = makeCtx();
  const g = G(c, 'Auditar duplicatas de fígado', 'duplicates');
  const p = plain(c.buildReviewAiPacket(g.review.id).packet);
  assert.equal(p.scope, 'global');
  assert.equal(p.category, 'duplicates');
  assert.equal(p.categoryLabel, 'Duplicatas');
  assert.equal('lesionId' in p, false, 'não inventa lesionId');
  assert.equal(p.targetLesion, null);
  assert.equal('currentFields' in p, false);
  const prompt = c.buildReviewAiPrompt(g.review.id).text;
  assert.match(prompt, /PENDÊNCIA GERAL do Atlas \(scope "global"\)/);
  assert.match(prompt, /NÃO invente lesionId/);
  assert.match(prompt, /"result":"analysis"/);
  const l = plain(c.buildReviewAiPacket(c.createLesionReview('seed_1', 'x').review.id).packet);
  assert.equal(l.scope, 'lesion');
  assert.equal(l.lesionId, 'seed_1');
});

test('091: importar resposta da IA para global — análise vira solução textual; proposedChanges/lesionId são recusados', () => {
  const c = makeCtx();
  const g = G(c, 'Auditar duplicatas');
  const bad = c.importReviewAiSolution(g.review.id, JSON.stringify({ reviewId: g.review.id, result: 'analysis', summary: 's', proposedChanges: { notes: 'x' } }));
  assert.equal(bad.reason, 'global_review_has_no_direct_target');
  const bad2 = c.importReviewAiSolution(g.review.id, JSON.stringify({ reviewId: g.review.id, result: 'analysis', summary: 's', lesionId: 'seed_1' }));
  assert.equal(bad2.reason, 'global_review_has_no_direct_target');
  const ok = c.importReviewAiSolution(g.review.id, JSON.stringify({ reviewId: g.review.id, result: 'analysis', summary: '3 grupos', reasoning: 'detalhes' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.outcome, 'global_solution');
  assert.equal(ok.review.solution.text, '3 grupos\n\ndetalhes');
  assert.equal(c.saveDataCalls, 0);
});

test('091-19: lote aceita global (analysis/manual/no_change), recusa "apply" em global e "analysis" em lesão', () => {
  const c = makeCtx();
  const g1 = G(c, 'Global A'), g2 = G(c, 'Global B'), g3 = G(c, 'Global C'), g4 = G(c, 'Global D');
  const l = c.createLesionReview('seed_1', 'lesão');
  const res = c.importReviewAiBatch(JSON.stringify({ results: [
    { reviewId: g1.review.id, result: 'analysis', summary: 'plano A' },
    { reviewId: g2.review.id, result: 'manual_action_required', summary: 'manual' },
    { reviewId: g3.review.id, result: 'no_change', summary: 'nada' },
    { reviewId: g4.review.id, result: 'apply', proposedChanges: { notes: 'x' } },
    { reviewId: l.review.id, result: 'analysis', summary: 'x' }
  ] }));
  assert.equal(res.ok, true);
  const by = Object.fromEntries(res.items.map((i) => [i.reviewId, i]));
  assert.equal(by[g1.review.id].status, 'global_solution');
  assert.equal(by[g2.review.id].status, 'manual_action_required');
  assert.equal(by[g3.review.id].status, 'no_change');
  assert.equal(by[g4.review.id].reason, 'global_review_has_no_direct_target');
  assert.equal(by[l.review.id].reason, 'invalid_result');
  assert.equal(res.summary.globalSolutions, 1);
  assert.equal(c.saveDataCalls, 0);
  assert.match(c.buildReviewAiBatchPrompt([g4.review.id, l.review.id]).text, /Itens com "scope":"global" são PENDÊNCIAS GERAIS/);
});

test('091-6/7: Central — meta global (🌐, categoria, sem "ver lesão"), botão "+ Nova pendência", modal com busca e ações ✓ Concluir / ↩ devolver', () => {
  const ctx = vm.createContext({ DATA: [{ id: 'seed_1', name: 'L1', s: 'S', site: 'T' }], GLOBAL_REVIEW_CATEGORIES: { duplicates: 'Duplicatas' } });
  vm.runInContext("function isGlobalReview(r){ return !!r && r.scope==='global'; }\n" + extractFn('reviewCenterLesionMeta'), ctx);
  const m = plain(ctx.reviewCenterLesionMeta(null, { scope: 'global', category: 'duplicates' }));
  assert.deepEqual(m, { name: '🌐 Atlas / solicitação geral', sub: 'categoria: Duplicatas', found: false, lesion: null, global: true });
  assert.equal(plain(ctx.reviewCenterLesionMeta('seed_1')).found, true, 'lesão continua igual');
  const pending = extractFn('openPendingReviewsModal');
  assert.match(pending, /id="pending-reviews-new">\+ Nova pendência</);
  assert.match(pending, /\$\{meta\.found\?'<button type="button" class="btn btn-ghost review-open-lesion">ver lesão<\/button>':''\}/, '"ver lesão" só com lesão encontrada');
  const modal = extractFn('openNewReviewRequestModal');
  assert.match(modal, /value="global" checked> Atlas \/ solicitação geral/);
  assert.match(modal, /Lesão específica/);
  assert.match(modal, /searchLesionsForReviewRequest\(ev\.target\.value, 20\)/, 'busca, sem dropdown gigante');
  assert.match(modal, /createReviewRequest\(\{ scope, lesionId: selectedLesionId, requestText: text, category:/);
  const ready = extractFn('openReadySolutionsModal');
  assert.match(ready, /review-global-complete">✓ Concluir/);
  assert.match(ready, /↩ devolver \/ pedir nova análise/);
  const search = vm.createContext({ DATA: [{ id: 'a', name: 'Hemangioma hepático' }, { id: 'b', name: 'Cisto renal' }] });
  vm.runInContext(extractFn('searchLesionsForReviewRequest'), search);
  assert.deepEqual(plain(search.searchLesionsForReviewRequest('HEPATICO')).map((e) => e.id), ['a']);
  assert.deepEqual(plain(search.searchLesionsForReviewRequest('h')), [], 'mínimo 2 letras');
});

test('091-21/22: backup e snapshot preservam pendências globais (mesmo objeto LESION_REVISIONS); antigas sem scope seguem lesion', () => {
  const c = makeCtx();
  const g = G(c, 'Revisar estadiamentos oncológicos', 'classifications');
  const back = JSON.parse(JSON.stringify({ lesionRevisions: c.__revs() }));
  const r = back.lesionRevisions[g.review.id];
  assert.deepEqual([r.scope, r.lesionId, r.category, r.requestText], ['global', null, 'classifications', 'Revisar estadiamentos oncológicos']);
  assert.match(html, /lesionRevisions:\s*LESION_REVISIONS,/, 'export de backup');
  assert.match(html, /lesionRevisions:\s*JSON\.parse\(JSON\.stringify\(LESION_REVISIONS\|\|\{\}\)\)/, 'snapshot');
});
