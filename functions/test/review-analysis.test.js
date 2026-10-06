'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HttpsError } = require('firebase-functions/v2/https');
const OpenAI = require('openai');
const { createAnalyzeHandler, buildResultSchema, MODEL, MAX_PAYLOAD_BYTES } = require('../review-analysis');

const auth = { uid: 'test-owner', token: { email: 'leopaggi89@gmail.com', email_verified: true } };
const review = (id = 'r1', extra = {}) => ({ reviewId: id, scope: 'lesion', requestText: 'Revisar termo',
  currentFields: { name: 'Nome de teste', notes: 'Descrição de teste', classification: null, tags: ['tag'], enTerm: 'term', clinicalTags: [] },
  allowedFields: ['name', 'notes', 'classification', 'tags', 'enTerm', 'clinicalTags'],
  forbiddenFields: ['id', 'images', 's', 'site'], ...extra });
const result = (id = 'r1', extra = {}) => ({ reviewId: id, result: 'no_change', summary: 'Já adequado', reasoning: 'Não há lacuna.', proposedChanges: null, manualAction: null, ...extra });
function fixture(options = {}) {
  const calls = [];
  const handler = createAnalyzeHandler({ HttpsError,
    getApiKey: () => options.noKey ? '' : 'mock-secret-never-real',
    createClient: () => ({ responses: { create: async request => {
      calls.push(request);
      if (options.error) throw options.error;
      return { status: options.status || 'completed', output_text: options.text ?? JSON.stringify(options.output || { results: [result()] }) };
    } } }) });
  return { calls, handler, invoke: (data = { reviews: [review()] }, user = auth) => handler({ auth: user, data }) };
}
async function rejectCode(promise, code) { await assert.rejects(promise, e => e instanceof HttpsError && e.code === code); }

test('sem auth rejeita antes de OpenAI', async () => {
  const f = fixture(); await rejectCode(f.invoke(undefined, null), 'unauthenticated'); assert.equal(f.calls.length, 0);
});
test('outra conta autenticada / email não verificado rejeita', async () => {
  const f = fixture();
  await rejectCode(f.invoke(undefined, { uid: 'other', token: { email: 'other@test.com', email_verified: true } }), 'permission-denied');
  await rejectCode(f.invoke(undefined, { uid: 'owner', token: { email: auth.token.email, email_verified: false } }), 'permission-denied');
  assert.equal(f.calls.length, 0);
});
test('limite >20 e lote vazio rejeitam', async () => {
  const f = fixture();
  await rejectCode(f.invoke({ reviews: Array.from({ length: 21 }, (_v, i) => review('r' + i)) }), 'invalid-argument');
  await rejectCode(f.invoke({ reviews: [] }), 'invalid-argument'); assert.equal(f.calls.length, 0);
});
test('reviewId duplicado rejeita', async () => {
  const f = fixture(); await rejectCode(f.invoke({ reviews: [review(), review()] }), 'invalid-argument'); assert.equal(f.calls.length, 0);
});
test('scope global e reviewId inválido rejeitam', async () => {
  const f = fixture(); await rejectCode(f.invoke({ reviews: [review('r1', { scope: 'global' })] }), 'invalid-argument');
  await rejectCode(f.invoke({ reviews: [review('')] }), 'invalid-argument');
});
test('payload UTF-8 acima de 512KiB rejeita antes de OpenAI', async () => {
  const f = fixture(); await rejectCode(f.invoke({ reviews: [review()], extra: 'á'.repeat(MAX_PAYLOAD_BYTES) }), 'invalid-argument'); assert.equal(f.calls.length, 0);
});
test('allowedFields e currentFields inválidos rejeitam', async () => {
  const f = fixture();
  await rejectCode(f.invoke({ reviews: [review('r1', { allowedFields: ['images'] })] }), 'invalid-argument');
  await rejectCode(f.invoke({ reviews: [review('r1', { currentFields: { tags: 'not an array' } })] }), 'invalid-argument');
});
test('válido chama Responses estrito, modelo pedido, sem ferramentas nem conversa persistente', async () => {
  const f = fixture(); const output = await f.invoke(); assert.deepEqual(output, { results: [result()] });
  const req = f.calls[0]; assert.equal(req.model, 'gpt-6.1-sol'); assert.equal(req.model, MODEL);
  assert.equal(req.store, false); assert.deepEqual(req.tools, []);
  assert.equal(req.conversation, undefined); assert.equal(req.previous_response_id, undefined);
  assert.equal(req.text.format.type, 'json_schema'); assert.equal(req.text.format.strict, true);
  assert.match(req.instructions, /um humano decidirá/i);
});
test('projeção não envia URLs/ownership ou snapshots de imagens à OpenAI', async () => {
  const f = fixture(); await f.invoke({ reviews: [review('r1', { images: [{ originalUrl: 'PRIVATE_URL', lesionId: 'owner' }], beforeSnapshot: { notes: 'OLD_SNAPSHOT' } })] });
  assert.doesNotMatch(f.calls[0].input, /PRIVATE_URL|OLD_SNAPSHOT/);
  assert.equal(JSON.parse(f.calls[0].input).reviews[0].images, undefined);
});
test('schema fechado requer todas as propriedades de cada variante; preserva changes esparsos', () => {
  const schema = buildResultSchema([review()]);
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (v.type === 'object') { assert.equal(v.additionalProperties, false); assert.deepEqual(v.required, Object.keys(v.properties)); }
    for (const child of Object.values(v)) { if (Array.isArray(child)) child.forEach(walk); else walk(child); }
  }
  walk(schema);
  const variants = schema.properties.results.items.properties.proposedChanges.anyOf;
  assert.ok(variants.some(s => s.properties && Object.keys(s.properties).join() === 'classification'));
});
test('ids desconhecidos, duplicados e item omitido rejeitam o lote inteiro', async () => {
  await rejectCode(fixture({ output: { results: [result('unknown')] } }).invoke(), 'data-loss');
  await rejectCode(fixture({ output: { results: [result(), result()] } }).invoke({ reviews: [review(), review('r2')] }), 'data-loss');
  await rejectCode(fixture({ output: { results: [result()] } }).invoke({ reviews: [review(), review('r2')] }), 'data-loss');
});
test('JSON malformado e resposta incompleta/refusal viram erro explícito', async () => {
  await rejectCode(fixture({ text: '{' }).invoke(), 'data-loss');
  await rejectCode(fixture({ status: 'incomplete' }).invoke(), 'data-loss');
});
test('enum inválido e campos de resultado adicionais rejeitam', async () => {
  await rejectCode(fixture({ output: { results: [result('r1', { result: 'accepted' })] } }).invoke(), 'data-loss');
  await rejectCode(fixture({ output: { results: [result('r1', { extra: 'no' })] } }).invoke(), 'data-loss');
});
test('campo proibido e campo permitido globalmente mas não nesta revisão rejeitam', async () => {
  await rejectCode(fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { images: [] } })] } }).invoke(), 'data-loss');
  await rejectCode(fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: 'nova' } })] } }).invoke({ reviews: [review('r1', { allowedFields: ['enTerm'] })] }), 'data-loss');
});
test('apply/no_change/manual são somente retornados, request permanece idêntico', async () => {
  const packet = { reviews: [review('r1'), review('r2'), review('r3')] }; const before = JSON.stringify(packet);
  const results = [result('r1', { result: 'apply', proposedChanges: { classification: null, enTerm: 'new term' } }), result('r2'),
    result('r3', { result: 'manual_action_required', manualAction: { type: 'other', description: 'Revisão humana', suggestedPlacement: null } })];
  const f = fixture({ output: { results } }); assert.deepEqual(await f.invoke(packet), { results }); assert.equal(JSON.stringify(packet), before);
});
test('lote de 20 mantém correspondência exata de IDs', async () => {
  const reviews = Array.from({ length: 20 }, (_v, i) => review('r' + i));
  const f = fixture({ output: { results: reviews.map(r => result(r.reviewId)) } });
  assert.equal((await f.invoke({ reviews })).results.length, 20);
});
test('sem key não chama OpenAI; falhas SDK não vazam key/stack/lote', async () => {
  const noKey = fixture({ noKey: true }); await rejectCode(noKey.invoke(), 'failed-precondition'); assert.equal(noKey.calls.length, 0);
  const f = fixture({ error: new Error('mock-secret-never-real PRIVATE_BATCH stack trace') });
  await assert.rejects(f.invoke(), e => e.code === 'unavailable' && !/mock-secret|PRIVATE_BATCH|stack trace/.test(e.message));
});
test('entrypoint real v2 callable exporta só análise e não usa Admin/Firestore', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8');
  assert.match(src, /firebase-functions\/v2\/https/); assert.match(src, /defineSecret\('OPENAI_API_KEY'\)/);
  assert.doesNotMatch(src, /require\('firebase-admin|initializeApp\(|getFirestore\(|\.collection\(/);
  const entry = require('../index'); assert.deepEqual(Object.keys(entry), ['analyzeAtlasReviewBatch']);
  assert.equal(typeof entry.analyzeAtlasReviewBatch.run, 'function');
});
test('SDK oficial: fetch mockado recebe /responses e schema sem qualquer chamada real', async () => {
  let body, endpoint;
  const sdk = new OpenAI({ apiKey: 'mock-only', maxRetries: 0, logLevel: 'off', fetch: async (url, opts) => {
    endpoint = String(url); body = JSON.parse(opts.body);
    return new Response(JSON.stringify({ object: 'response', id: 'mock_resp', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ results: [result()] }), annotations: [] }] }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const handler = createAnalyzeHandler({ HttpsError, getApiKey: () => 'mock-only', createClient: () => sdk });
  assert.deepEqual(await handler({ auth, data: { reviews: [review()] } }), { results: [result()] });
  assert.match(endpoint, /\/responses$/); assert.equal(body.model, MODEL); assert.equal(body.text.format.strict, true);
});
