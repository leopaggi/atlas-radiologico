'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const functionsRequire = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { HttpsError } = functionsRequire('firebase-functions/v2/https');
const { createAnalyzeHandler } = require('../functions/review-analysis');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const moduleSource = html.slice(html.indexOf("const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';"),
  html.indexOf('/* termos de busca em inglês para as lesões da base padrão'));
const providerSource = html.slice(html.indexOf("const REVIEW_AI_FUNCTIONS_REGION = 'us-central1';"), html.indexOf('function showApp(){'));
const owner = 'leopaggi89@gmail.com';
const lesion = { id: 'seed_test', name: 'Entidade sintética', s: 'S', site: 'T', notes: 'Descrição sintética',
  tags: ['x'], clinicalTags: [], enTerm: 'test entity', classification: null, images: [], links: [] };
function fixture(opts = {}) {
  const button = { disabled: false, title: '' }, calls = [], disk = {};
  const ctx = { console, Date, Math, JSON, Object, Array,
    DATA: [JSON.parse(JSON.stringify(lesion))], ALLOWED_EMAIL: owner,
    document: { querySelectorAll: selector => selector === '#ai-pipeline-run' ? [button] : [], getElementById: () => null },
    storage: { get: async k => ({ value: disk[k] }), set: async (k, v) => { disk[k] = v; } },
    saveDataCalls: 0, markSyncDirty: async () => {}, pushToFirebase: () => {},
    fbAuth: opts.noAuth ? null : { app: { name: 'test' }, currentUser: opts.signedOut ? null : { email: opts.email || owner } }
  };
  ctx.saveData = () => { ctx.saveDataCalls++; };
  ctx.firebase = opts.noSdk ? {} : { functions: (app, region) => ({
    httpsCallable: (name, options) => async packet => {
      calls.push({ app, region, name, options, packet });
      if (opts.error) throw new Error('PRIVATE_BATCH mock-api-key stack');
      if (opts.callable) return { data: await opts.callable(packet) };
      return { data: { results: packet.reviews.map((r, i) => opts.item ? opts.item(r, i) : {
        reviewId: r.reviewId, result: 'no_change', summary: 'Sem lacuna', reasoning: 'Já adequado', proposedChanges: null, manualAction: null
      }) } };
    }
  }) };
  vm.createContext(ctx);
  vm.runInContext(moduleSource + '\n' + providerSource, ctx, { filename: 'atlas-ai-real-provider.js' });
  return { ctx, button, calls, disk };
}
const revs = ctx => vm.runInContext('LESION_REVISIONS', ctx);
function createReviews(ctx, count) {
  return Array.from({ length: count }, (_v, i) => ctx.createLesionReview(lesion.id, 'pedido ' + i).review);
}

test('sem Functions SDK: provider null e botão disabled (nunca mock)', () => {
  const f = fixture({ noSdk: true }); assert.equal(f.ctx.isAiPipelineProviderConfigured(), false);
  assert.equal(vm.runInContext('REVIEW_AI_PIPELINE_PROVIDER', f.ctx), null); assert.equal(f.button.disabled, true);
});
test('sem auth / usuário autenticado / conta errada controla disponibilidade', () => {
  for (const options of [{ noAuth: true }, { signedOut: true }, { email: 'other@test.com' }]) {
    const f = fixture(options); assert.equal(f.ctx.refreshReviewAiFirebaseProvider(), false); assert.equal(f.button.disabled, true);
  }
  const f = fixture(); assert.equal(f.ctx.refreshReviewAiFirebaseProvider(), true); assert.equal(f.button.disabled, false);
  assert.equal(vm.runInContext('REVIEW_AI_PIPELINE_PROVIDER === REVIEW_AI_FIREBASE_PROVIDER', f.ctx), true);
});
test('logout posterior zera provider e desabilita o botão antes de selecionar revisões', async () => {
  const f = fixture(); f.ctx.refreshReviewAiFirebaseProvider(); createReviews(f.ctx, 1);
  f.ctx.fbAuth.currentUser = null;
  const res = await f.ctx.runAiSolutionPipeline(); assert.equal(res.reason, 'no_provider_configured');
  assert.equal(f.button.disabled, true); assert.equal(f.calls.length, 0); assert.equal(Object.values(revs(f.ctx))[0].aiPipeline, undefined);
});
test('erro backend vira ai_error com mensagem segura; DATA permanece idêntico', async () => {
  const f = fixture({ error: true }); const [r] = createReviews(f.ctx, 1); const before = JSON.stringify(f.ctx.DATA);
  const res = await f.ctx.runAiSolutionPipeline(); assert.equal(res.reason, 'provider_error');
  assert.equal(revs(f.ctx)[r.id].aiPipeline.state, 'ai_error'); assert.equal(revs(f.ctx)[r.id].status, 'pending');
  assert.doesNotMatch(revs(f.ctx)[r.id].aiPipeline.error, /PRIVATE_BATCH|mock-api-key|stack/);
  assert.equal(JSON.stringify(f.ctx.DATA), before); assert.equal(f.ctx.saveDataCalls, 0);
});
test('provider real usa app autenticado, região/us-central1 e callable com timeout', async () => {
  const f = fixture(); createReviews(f.ctx, 1); const res = await f.ctx.runAiSolutionPipeline(); assert.equal(res.ok, true);
  assert.equal(f.calls[0].name, 'analyzeAtlasReviewBatch'); assert.equal(f.calls[0].region, 'us-central1');
  assert.equal(f.calls[0].options.timeout, 300000); assert.equal(f.calls[0].app, f.ctx.fbAuth.app);
});
test('pipeline real + callable backend + OpenAI mock: 20, apply/no_change/manual só propostas', async () => {
  let openAiCalls = 0;
  const callable = createAnalyzeHandler({ HttpsError, getApiKey: () => 'mock-only', createClient: () => ({ responses: {
    create: async request => {
      openAiCalls++; const packet = JSON.parse(request.input);
      return { status: 'completed', output_text: JSON.stringify({ results: packet.reviews.map((r, i) => ({
        reviewId: r.reviewId, result: ['apply', 'no_change', 'manual_action_required'][i % 3],
        summary: 'Proposta sintética', reasoning: 'Somente teste', proposedChanges: i % 3 === 0 ? { enTerm: 'new term' } : null,
        manualAction: i % 3 === 2 ? { type: 'other', description: 'Decisão humana', suggestedPlacement: null } : null
      })) }) };
    }
  } }) });
  const f = fixture({ callable: data => callable({ auth: { uid: 'test', token: { email: owner, email_verified: true } }, data }) });
  const before = JSON.stringify(f.ctx.DATA); createReviews(f.ctx, 25);
  const res = await f.ctx.runAiSolutionPipeline();
  assert.equal(openAiCalls, 1); assert.equal(f.calls[0].packet.reviews.length, 20); assert.equal(res.total, 20); assert.equal(res.errors, 0);
  assert.ok(res.proposed > 0 && res.noChange > 0 && res.needsHumanReview > 0);
  const reviews = Object.values(revs(f.ctx)); assert.equal(reviews.filter(r => r.status === 'pending').length, 5);
  assert.ok(reviews.every(r => ['pending', 'proposed', 'manual_action_required'].includes(r.status)));
  assert.ok(reviews.some(r => r.solution && r.solution.kind === 'no_change'));
  assert.equal(JSON.stringify(f.ctx.DATA), before); assert.equal(f.ctx.saveDataCalls, 0);
});
test('se SDK ficar indisponível após habilitar, chamada direta é recusada sem fallback', async () => {
  const f = fixture(); f.ctx.refreshReviewAiFirebaseProvider(); f.ctx.firebase = {};
  await assert.rejects(vm.runInContext('REVIEW_AI_FIREBASE_PROVIDER.analyzeBatch({reviews:[]})', f.ctx), /indisponível/);
  assert.equal(f.calls.length, 0); assert.equal(vm.runInContext('REVIEW_AI_PIPELINE_PROVIDER', f.ctx), null);
});
test('SDK compat 10.13.0 e callback de auth conectam somente adapter, não execução', () => {
  assert.match(html, /10\.13\.0\/firebase-functions-compat\.js/);
  const authCallback = html.slice(html.indexOf('fbAuth.onAuthStateChanged(async (user)=>{'), html.indexOf('/* ============================================================\n    PROTEÇÃO 088'));
  assert.match(authCallback, /refreshReviewAiFirebaseProvider\(\)/);
  assert.doesNotMatch(providerSource, /saveData\(|storage\.set|executeStructuralPlan\(|authorizeAndApplyReviewSolution\(/);
});
