'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HttpsError } = require('firebase-functions/v2/https');
const OpenAI = require('openai');
const { createAnalyzeHandler, createBatchAnalyzer, buildResultSchema, sanitizeProviderError, MODEL, MAX_PAYLOAD_BYTES, INSTRUCTIONS, validateStructuredDifferentials, validateStructuredNotesInput, buildNotesFromStructured, STRUCTURED_NOTES_SCHEMA } = require('../review-analysis');

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
// ===========================================================================
// DIAGNÓSTICO LOCAL (onProviderError) — só em createBatchAnalyzer, nunca em
// createAnalyzeHandler/Firebase. Metadados sanitizados, nunca key/stack/
// headers/request/response/lote inteiros; o chamador continua recebendo o
// mesmo erro genérico de sempre.
// ===========================================================================
test('sanitizeProviderError: só os 6 campos escalares esperados, nunca o objeto/stack/headers inteiros', () => {
  const sdkError = Object.assign(new Error('Bad Request: model overloaded'), {
    name: 'BadRequestError', status: 400, code: 'model_overloaded', type: 'invalid_request_error', param: 'model',
    headers: { authorization: 'Bearer sk-SEGREDO' }, request: { apiKey: 'sk-SEGREDO' }, response: { body: 'sk-SEGREDO' },
    stack: 'Error: ...\n    at sk-SEGREDO-caller (file.js:1:1)'
  });
  const meta = sanitizeProviderError(sdkError);
  assert.deepEqual(Object.keys(meta).sort(), ['code', 'message', 'name', 'param', 'status', 'type']);
  assert.equal(meta.status, 400); assert.equal(meta.code, 'model_overloaded');
  assert.equal(meta.type, 'invalid_request_error'); assert.equal(meta.param, 'model');
  assert.equal(meta.name, 'BadRequestError'); assert.match(meta.message, /model overloaded/);
  assert.doesNotMatch(JSON.stringify(meta), /sk-SEGREDO|Bearer|stack|authorization/i);
});
test('sanitizeProviderError: campos ausentes/tipo errado no erro original nunca aparecem (nunca inventa)', () => {
  assert.deepEqual(sanitizeProviderError(new Error('rede caiu')), { name: 'Error', message: 'rede caiu' });
  assert.deepEqual(sanitizeProviderError('string crua, não é Error'), {});
  assert.deepEqual(sanitizeProviderError(null), {});
  assert.deepEqual(sanitizeProviderError({ status: '400 (string, não number)' }), {});
});
test('createBatchAnalyzer: onProviderError recebe metadados sanitizados do erro real do SDK; cliente continua com erro genérico', async () => {
  const received = [];
  const sdkError = Object.assign(new Error('upstream 502 from OpenAI, key=sk-SEGREDO'), { status: 502, type: 'server_error' });
  const analyze = createBatchAnalyzer({
    getApiKey: () => 'mock-secret-never-real',
    createClient: () => ({ responses: { create: async () => { throw sdkError; } } }),
    onProviderError: (meta) => received.push(meta)
  });
  await assert.rejects(analyze({ reviews: [review()] }), (e) => e.code === 'unavailable'
    && e.message === 'Não foi possível concluir a análise. Tente novamente.');
  assert.equal(received.length, 1);
  assert.deepEqual(Object.keys(received[0]).sort(), ['message', 'name', 'status', 'type']);
  assert.equal(received[0].status, 502);
  assert.doesNotMatch(JSON.stringify(received[0]), /mock-secret-never-real|sk-SEGREDO/);
});
test('createBatchAnalyzer: erro no próprio onProviderError nunca derruba o pipeline (ainda recebe o erro genérico de sempre)', async () => {
  const analyze = createBatchAnalyzer({
    getApiKey: () => 'mock-secret-never-real',
    createClient: () => ({ responses: { create: async () => { throw new Error('falha real do SDK'); } } }),
    onProviderError: () => { throw new Error('bug no próprio diagnóstico'); }
  });
  await assert.rejects(analyze({ reviews: [review()] }), (e) => e.code === 'unavailable'
    && e.message === 'Não foi possível concluir a análise. Tente novamente.');
});
test('createBatchAnalyzer: AnalysisError de validação (ex.: invalid-argument) nunca passa por onProviderError', async () => {
  let called = false;
  const analyze = createBatchAnalyzer({
    getApiKey: () => 'mock-secret-never-real', createClient: () => ({ responses: { create: async () => ({ status: 'completed', output_text: '{"results":[]}' }) } }),
    onProviderError: () => { called = true; }
  });
  await assert.rejects(analyze({ reviews: [] }), (e) => e.code === 'invalid-argument');
  assert.equal(called, false, 'erro de validação do próprio Atlas não é "erro de provider"');
});
test('ESTÁTICO: createAnalyzeHandler nunca referencia onProviderError no código-fonte', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../review-analysis.js'), 'utf8');
  const fn = src.slice(src.indexOf('function createAnalyzeHandler'), src.indexOf('module.exports'));
  assert.doesNotMatch(fn, /onProviderError/, 'Firebase/produção não pode ganhar o callback de diagnóstico');
});
test('createAnalyzeHandler (Firebase/produção) nunca recebe nem usa onProviderError — comportamento intocado', async () => {
  const received = [];
  const f = fixture({ error: new Error('upstream falhou, key=sk-SEGREDO'), onProviderError: (m) => received.push(m) }); // ignorado de propósito por createAnalyzeHandler
  await assert.rejects(f.invoke(), (e) => e.code === 'unavailable' && !/sk-SEGREDO/.test(e.message));
  assert.equal(received.length, 0, 'createAnalyzeHandler não repassa onProviderError ao núcleo — Firebase não loga nada disto');
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

// ===========================================================================
// CONTRATO EDITORIAL — "Padrão: ... / Diferenciais-chave:" com travessão "—"
// (padrão aceito pelo renderer em index.html desde a correção de
// notesDifferentialsHtml) e reforço contra agressividade excessiva (preferir
// no_change a mudança cosmética). Só texto de INSTRUCTIONS muda aqui — nada
// de schema, modelo, backend local ou pipeline. Nenhuma chamada real à
// OpenAI em nenhum teste desta seção.
// ===========================================================================
test('CONTRATO: INSTRUCTIONS exige "Padrão:" e "Diferenciais-chave:"', () => {
  assert.match(INSTRUCTIONS, /Padrão:/);
  assert.match(INSTRUCTIONS, /Diferenciais-chave:/);
});
test('CONTRATO: INSTRUCTIONS exige 3 a 4 diferenciais quando pertinentes (2 só se só 2 forem pertinentes; nunca inventar para completar)', () => {
  assert.match(INSTRUCTIONS, /3 a 4 diferenciais/);
  assert.match(INSTRUCTIONS, /só 2 se apenas 2 forem realmente os únicos relevantes/);
  assert.match(INSTRUCTIONS, /nunca invente diferencial extra só para completar quantidade/);
});
test('CONTRATO: INSTRUCTIONS instrui a IA a devolver a estrutura intermediária notes:{pattern,differentials} em vez de escrever a string final/quebras de linha', () => {
  assert.match(INSTRUCTIONS, /NÃO escreva a string final diretamente/);
  assert.match(INSTRUCTIONS, /notes:\{pattern,differentials:\[\{name,description\}\]\}/);
  assert.match(INSTRUCTIONS, /Você NUNCA decide quebra de linha, travessão, HTML ou Markdown/);
});
test('CONTRATO: INSTRUCTIONS exige 2 a 4 differentials, cada um com name (um único diagnóstico) e description', () => {
  assert.match(INSTRUCTIONS, /differentials: 2 a 4 objetos/);
  assert.match(INSTRUCTIONS, /exatamente UM diagnóstico em name \(nunca vários diagnósticos concatenados num mesmo name\)/);
});
test('CONTRATO: INSTRUCTIONS reforça preferência por no_change — correção cosmética nunca justifica apply', () => {
  assert.match(INSTRUCTIONS, /OU se notes atuais já estiverem excelentes/);
  assert.match(INSTRUCTIONS, /[Cc]orreção puramente cosmética[^.]*nunca justifica apply/);
});
test('CONTRATO: INSTRUCTIONS continua exigindo preservar notes já bons (nunca generalizar/encurtar sem motivo)', () => {
  assert.match(INSTRUCTIONS, /nunca substitua conteúdo correto e específico por versão mais genérica/);
  assert.match(INSTRUCTIONS, /nem apague detalhes úteis só para encurtar/);
});
test('CONTRATO: esta etapa não mudou schema, modelo, MAX_REVIEWS/payload nem o fluxo de validação — só o texto de INSTRUCTIONS', () => {
  assert.equal(MODEL, 'gpt-6.1-sol');
  assert.equal(MAX_PAYLOAD_BYTES, 512 * 1024);
  const schema = buildResultSchema([review()]);
  assert.deepEqual(Object.keys(schema.properties), ['results']);
});

test('EXEMPLO MOCKADO: saída no padrão editorial novo (travessão) passa pelo pipeline inteiro sem chamada real à OpenAI', async () => {
  const notasExemplo = 'Padrão: lesão radiolúcida bem definida, unilocular, associada à coroa de dente não irrompido.\n'
    + 'Diferenciais-chave:\n'
    + 'Cementoblastoma — massa radiopaca fusionada à raiz, não radiolúcida, descarta este diagnóstico.\n'
    + 'Cisto odontogênico calcificante — pode ter componente radiopaco interno, ausente aqui.\n'
    + 'Tumor odontogênico adenomatoide — mais comum em região anterior de maxila, com pequenas calcificações puntiformes.';
  const f = fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: notasExemplo } })] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] });
  assert.deepEqual(out, { results: [{ reviewId: 'r1', result: 'apply', summary: 'Já adequado', reasoning: 'Não há lacuna.', proposedChanges: { notes: notasExemplo }, manualAction: null }] });
  assert.equal(f.calls.length, 1, 'exemplo mockado — nenhuma chamada real à OpenAI, só o createClient fake do fixture');
  // Formato do exemplo é exatamente o exigido por INSTRUCTIONS: 3 diferenciais,
  // cada um em linha própria, nome antes do "—", explicação depois.
  const linhas = notasExemplo.split('\n').slice(2);
  assert.equal(linhas.length, 3);
  for (const linha of linhas) assert.match(linha, /^[^—]+ — .+$/);
});

// ===========================================================================
// VALIDAÇÃO DETERMINÍSTICA de "Diferenciais-chave:" — problema real: mesmo
// com INSTRUCTIONS atualizada, a IA continuou devolvendo prosa corrida
// ("Craniofaringioma, Adenoma hipofisário e Meningioma do tubérculo selar.
// Favorecem..."). Esta seção nunca confia só no texto da instrução: todo
// "apply" com notes contendo "Diferenciais-chave:" passa por
// validateStructuredDifferentials ANTES de qualquer setReviewSolution (que
// nem existe neste arquivo — é chamado só pelo frontend, depois). Se a
// estrutura falhar, validateResults faz o DOWNGRADE do item (nunca do lote
// inteiro) para manual_action_required — nunca aplica conteúdo mal
// estruturado. Nenhuma chamada real à OpenAI em nenhum teste desta seção.
// ===========================================================================
const notasProsaCorrida = 'Padrão: macroadenoma com epicentro intrasselar.\n'
  + 'Diferenciais-chave: Craniofaringioma, Adenoma hipofisário e Meningioma do tubérculo selar. Favorecem este diagnóstico quando presentes.';
const notas3Linhas = 'Padrão: achado típico.\nDiferenciais-chave:\n'
  + 'Craniofaringioma — calcificações e componente cístico.\n'
  + 'Adenoma hipofisário — epicentro selar com alargamento da fossa.\n'
  + 'Meningioma do tubérculo selar — extra-axial, realce intenso.';
const notas4Linhas = notas3Linhas + '\nCisto de Rathke — parede fina, sem componente sólido.';
const notas2Linhas = 'Padrão: achado típico.\nDiferenciais-chave:\n'
  + 'Craniofaringioma — calcificações e componente cístico.\n'
  + 'Adenoma hipofisário — epicentro selar com alargamento da fossa.';
const notasLinhaSemTravessao = 'Padrão: achado típico.\nDiferenciais-chave:\n'
  + 'Craniofaringioma — calcificações.\nAdenoma hipofisário sem separador algum aqui.';
const notasNomeSemExplicacao = 'Padrão: achado típico.\nDiferenciais-chave:\n'
  + 'Craniofaringioma — calcificações.\n— explicação órfã sem nome.';
const notasExplicacaoVazia = 'Padrão: achado típico.\nDiferenciais-chave:\n'
  + 'Craniofaringioma — calcificações.\nAdenoma hipofisário — ';
const notasListaComE = 'Padrão: achado típico.\nDiferenciais-chave:\n'
  + 'Craniofaringioma — calcificações.\nAdenoma hipofisário, Cisto de Rathke e Meningioma — achados mistos combinados.';

test('CONTRATO: rejeita prosa corrida com 3 diagnósticos na mesma linha (bug real reportado)', () => {
  const res = validateStructuredDifferentials(notasProsaCorrida);
  assert.equal(res.valid, false, 'prosa corrida nunca passa — motivo: ' + JSON.stringify(res));
});
test('CONTRATO: aceita 3 linhas no formato "Nome — explicação"', () => {
  assert.deepEqual(validateStructuredDifferentials(notas3Linhas), { valid: true });
});
test('CONTRATO: aceita 4 linhas', () => {
  assert.deepEqual(validateStructuredDifferentials(notas4Linhas), { valid: true });
});
test('CONTRATO: aceita 2 linhas quando realmente só há 2 diferenciais válidos', () => {
  assert.deepEqual(validateStructuredDifferentials(notas2Linhas), { valid: true });
});
test('CONTRATO: rejeita linha sem travessão', () => {
  assert.deepEqual(validateStructuredDifferentials(notasLinhaSemTravessao), { valid: false, reason: 'line_without_single_dash' });
});
test('CONTRATO: rejeita nome vazio antes do travessão', () => {
  assert.deepEqual(validateStructuredDifferentials(notasNomeSemExplicacao), { valid: false, reason: 'empty_diagnosis_name' });
});
test('CONTRATO: rejeita explicação vazia depois do travessão', () => {
  assert.deepEqual(validateStructuredDifferentials(notasExplicacaoVazia), { valid: false, reason: 'empty_explanation' });
});
test('CONTRATO: rejeita lista "A, B e C — explicação" (vários diagnósticos antes de um único travessão)', () => {
  assert.deepEqual(validateStructuredDifferentials(notasListaComE), { valid: false, reason: 'multiple_diagnoses_in_one_line' });
});
test('CONTRATO: notes sem "Diferenciais-chave:" nunca é forçado a este formato (convenção não se aplica)', () => {
  assert.deepEqual(validateStructuredDifferentials('Achado incidental sem diferenciais pertinentes.'), { valid: true });
  assert.deepEqual(validateStructuredDifferentials(''), { valid: true });
});
test('CONTRATO: "Diferenciais-chave:" presente mas sem "Padrão:" é rejeitado', () => {
  assert.deepEqual(validateStructuredDifferentials('Diferenciais-chave:\nA — x.\nB — y.'), { valid: false, reason: 'missing_padrao' });
});
test('CONTRATO: menos de 2 linhas de diferencial é rejeitado', () => {
  assert.deepEqual(validateStructuredDifferentials('Padrão: x.\nDiferenciais-chave:\nA — único.'), { valid: false, reason: 'too_few_differential_lines' });
});

test('INTEGRAÇÃO: apply com prosa corrida em Diferenciais-chave nunca é aceito — validateResults faz downgrade do ITEM para manual_action_required (nunca rejeita o lote inteiro)', async () => {
  const f = fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: notasProsaCorrida } })] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].result, 'manual_action_required');
  assert.equal(out.results[0].proposedChanges, null);
  assert.equal(out.results[0].manualAction.type, 'invalid_differentials_format');
  assert.match(out.results[0].manualAction.description, /too_few_differential_lines/);
});
test('INTEGRAÇÃO: apply bem formatado (travessão, linha própria) continua sendo aceito normalmente', async () => {
  const f = fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: notas3Linhas } })] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] });
  assert.equal(out.results[0].result, 'apply');
  assert.deepEqual(out.results[0].proposedChanges, { notes: notas3Linhas });
});
test('INTEGRAÇÃO: um item mal formatado não derruba os outros itens válidos do mesmo lote', async () => {
  const f = fixture({ output: { results: [
    result('r1', { result: 'apply', proposedChanges: { notes: notasProsaCorrida } }),
    result('r2', { result: 'apply', proposedChanges: { notes: notas3Linhas } })
  ] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] }), review('r2', { allowedFields: ['notes'] })] });
  assert.equal(out.results[0].result, 'manual_action_required');
  assert.equal(out.results[1].result, 'apply');
});

test('ESTÁTICO: este módulo nunca chama setReviewSolution/autoriza/aprova nada — a validação de Diferenciais-chave é só sobre o texto da resposta da IA', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../review-analysis.js'), 'utf8');
  for (const forbidden of ['setReviewSolution', 'authorizeAndApplyReviewSolution', 'approveAppliedReviewSolution']) {
    assert.doesNotMatch(src, new RegExp(forbidden + '\\('), 'nenhuma CHAMADA a ' + forbidden + ' (menção em comentário explicativo é esperada)');
  }
  assert.doesNotMatch(src, /\bSEED\s*[.\[=]/, 'nenhuma referência de leitura/escrita a um SEED do catálogo');
});

// ===========================================================================
// RADIOLOGISTA EDITOR — a IA deve considerar TODO o contexto em conjunto
// (não só o pedido isolado) e produzir a REESCRITA FINAL da ficha, no nível
// dos EXEMPLOS OURO, nunca uma frase genérica explicando a mudança. Nenhuma
// chamada real à OpenAI em nenhum teste desta seção.
// ===========================================================================
test('CONTRATO: o packet enviado à IA inclui TODOS os campos de contexto obrigatórios (name, section, site, notes, tags, classification, enTerm, clinicalTags, pedido da revisão)', async () => {
  const f = fixture();
  await f.invoke({ reviews: [review('r1', {
    section: 'Cabeça e pescoço', site: 'Sela túrcica', requestText: 'Notes genéricas, melhorar diferenciais.'
  })] });
  const sent = JSON.parse(f.calls[0].input).reviews[0];
  assert.equal(sent.section, 'Cabeça e pescoço');
  assert.equal(sent.site, 'Sela túrcica');
  assert.equal(sent.requestText, 'Notes genéricas, melhorar diferenciais.');
  assert.deepEqual(Object.keys(sent.currentFields).sort(), ['classification', 'clinicalTags', 'enTerm', 'name', 'notes', 'tags']);
  assert.equal(sent.currentFields.name, 'Nome de teste');
  assert.equal(sent.currentFields.notes, 'Descrição de teste');
  assert.equal(sent.currentFields.enTerm, 'term');
  assert.deepEqual(sent.currentFields.tags, ['tag']);
  assert.deepEqual(sent.currentFields.clinicalTags, []);
});
test('CONTRATO: considerar TODO o contexto em conjunto, nunca só o pedido isolado, está explícito em INSTRUCTIONS', () => {
  assert.match(INSTRUCTIONS, /Considere TODO o contexto de cada revisão em conjunto/);
  assert.match(INSTRUCTIONS, /name, section, site, notes atuais, tags, classification, enTerm, clinicalTags e o pedido da revisão \(requestText\)/);
});
test('CONTRATO: INSTRUCTIONS posiciona a IA como radiologista editor (reescrita final, não frase genérica explicando a mudança)', () => {
  assert.match(INSTRUCTIONS, /RADIOLOGISTA EDITOR/);
  assert.match(INSTRUCTIONS, /NÃO escreva a string final diretamente/);
});
test('CONTRATO: INSTRUCTIONS inclui os 3 exemplos ouro (odontogênico, selar\\/suprasselar, abdominal\\/traumático) — nível de qualidade, nunca copiados literalmente', () => {
  assert.match(INSTRUCTIONS, /EXEMPLO OURO 1 \(lesão odontogênica\)/);
  assert.match(INSTRUCTIONS, /Ceratocisto odontogênico — crescimento ao longo do eixo da mandíbula/);
  assert.match(INSTRUCTIONS, /EXEMPLO OURO 2 \(lesão selar\/suprasselar\)/);
  assert.match(INSTRUCTIONS, /Craniofaringioma adamantinomatoso — maior componente cístico/);
  assert.match(INSTRUCTIONS, /EXEMPLO OURO 3 \(lesão abdominal\/traumática\)/);
  assert.match(INSTRUCTIONS, /Hematoma subcapsular isolado — coleção periférica em crescente/);
  assert.match(INSTRUCTIONS, /nunca copie o conteúdo literal/);
});
test('CONTRATO: INSTRUCTIONS proíbe frases vagas (favorecem este diagnóstico / deve integrar contexto clínico / pode ser útil) quando não acrescentam informação concreta', () => {
  assert.match(INSTRUCTIONS, /"favorecem este diagnóstico"/);
  assert.match(INSTRUCTIONS, /"a distinção deve integrar contexto clínico\/origem anatômica"/);
  assert.match(INSTRUCTIONS, /"pode ser útil"/);
});
test('CONTRATO: INSTRUCTIONS proíbe inventar classificação oficial e achados/associações sem base médica plausível', () => {
  assert.match(INSTRUCTIONS, /nunca invente uma classificação oficial inexistente/);
  assert.match(INSTRUCTIONS, /não invente informação clínica\/radiológica sem base médica plausível; não invente associações sem base/);
});
test('CONTRATO: chamada à OpenAI usa reasoning:{effort:"medium"} nesta tarefa editorial, sem alterar model/tools/store', async () => {
  const f = fixture();
  await f.invoke();
  const req = f.calls[0];
  assert.deepEqual(req.reasoning, { effort: 'medium' });
  assert.equal(req.model, MODEL);
  assert.deepEqual(req.tools, []);
  assert.equal(req.store, false);
});
test('INTEGRAÇÃO: no_change quando notes já estiverem adequados é aceito normalmente (nenhuma reescrita forçada)', async () => {
  const f = fixture({ output: { results: [result('r1', { result: 'no_change', summary: 'Notes já excelentes.', reasoning: 'Padrão e diferenciais já específicos; nenhuma lacuna real.' })] } });
  const out = await f.invoke({ reviews: [review('r1')] });
  assert.equal(out.results[0].result, 'no_change');
  assert.equal(out.results[0].proposedChanges, null);
  assert.equal(out.results[0].manualAction, null);
});
// ===========================================================================
// ESTRUTURA EDITORIAL INTERMEDIÁRIA notes:{pattern,differentials} — a IA
// NUNCA decide quebra de linha/travessão/HTML; só fornece campos
// estruturados. O backend (buildNotesFromStructured) monta a string final
// deterministicamente, só depois de validar a ESTRUTURA (nunca o texto
// livre). proposedChanges.notes continua sendo, sempre, a string final —
// DATA/formato persistido nunca mudam; notes antigas (string direta)
// continuam funcionando. Nenhuma chamada real à OpenAI nesta seção.
// ===========================================================================
test('ESTRUTURA: 4 differentials geram exatamente 4 linhas na string final, um por linha', () => {
  const struct = { pattern: 'Achado típico.', differentials: [
    { name: 'A', description: 'd1' }, { name: 'B', description: 'd2' },
    { name: 'C', description: 'd3' }, { name: 'D', description: 'd4' }
  ] };
  const check = validateStructuredNotesInput(struct, 'Entidade X');
  assert.equal(check.valid, true);
  const finalStr = buildNotesFromStructured(check.value);
  const lines = finalStr.split('\n').slice(3);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines, ['A — d1', 'B — d2', 'C — d3', 'D — d4']);
});
test('ESTRUTURA: 3 differentials geram exatamente 3 linhas na string final', () => {
  const struct = { pattern: 'Achado típico.', differentials: [
    { name: 'A', description: 'd1' }, { name: 'B', description: 'd2' }, { name: 'C', description: 'd3' }
  ] };
  const finalStr = buildNotesFromStructured(validateStructuredNotesInput(struct, null).value);
  assert.deepEqual(finalStr.split('\n').slice(3), ['A — d1', 'B — d2', 'C — d3']);
});
test('ESTRUTURA: nenhum newline depende da resposta do modelo — mesmo sem nenhum "\\n" em pattern/name/description, a string final tem a quebra correta', () => {
  const struct = { pattern: 'Frase sem quebra nenhuma.', differentials: [
    { name: 'Diagnóstico A', description: 'explicação sem quebra' },
    { name: 'Diagnóstico B', description: 'outra explicação' }
  ] };
  assert.ok(!JSON.stringify(struct).includes('\\n'), 'sanity: nada no input do modelo contém newline');
  const finalStr = buildNotesFromStructured(validateStructuredNotesInput(struct, null).value);
  assert.equal(finalStr, 'Padrão: Frase sem quebra nenhuma.\n\nDiferenciais-chave:\nDiagnóstico A — explicação sem quebra\nDiagnóstico B — outra explicação');
  assert.equal((finalStr.match(/\n/g) || []).length, 4, 'as 4 quebras vêm só do código, nunca do texto do modelo');
});
test('ESTRUTURA: pattern vazio é rejeitado', () => {
  assert.deepEqual(validateStructuredNotesInput({ pattern: '  ', differentials: [{ name: 'A', description: 'd' }, { name: 'B', description: 'd' }] }, null),
    { valid: false, reason: 'empty_pattern' });
});
test('ESTRUTURA: menos de 2 ou mais de 4 differentials é rejeitado', () => {
  const one = { pattern: 'x', differentials: [{ name: 'A', description: 'd' }] };
  const five = { pattern: 'x', differentials: Array.from({ length: 5 }, (_v, i) => ({ name: 'D' + i, description: 'd' })) };
  assert.deepEqual(validateStructuredNotesInput(one, null), { valid: false, reason: 'differentials_count_out_of_range' });
  assert.deepEqual(validateStructuredNotesInput(five, null), { valid: false, reason: 'differentials_count_out_of_range' });
});
test('ESTRUTURA: name ou description vazios/ausentes são rejeitados', () => {
  assert.equal(validateStructuredNotesInput({ pattern: 'x', differentials: [{ name: '', description: 'd' }, { name: 'B', description: 'd' }] }, null).reason, 'empty_differential_name');
  assert.equal(validateStructuredNotesInput({ pattern: 'x', differentials: [{ name: 'A', description: '' }, { name: 'B', description: 'd' }] }, null).reason, 'empty_differential_description');
});
test('ESTRUTURA: name com múltiplos diagnósticos ("A, B e C") é rejeitado — um diagnóstico por objeto', () => {
  const struct = { pattern: 'x', differentials: [{ name: 'A, B e C', description: 'd' }, { name: 'D', description: 'd' }] };
  assert.equal(validateStructuredNotesInput(struct, null).reason, 'multiple_diagnoses_in_name');
});
test('ESTRUTURA: HTML/Markdown em name ou description é rejeitado', () => {
  assert.equal(validateStructuredNotesInput({ pattern: 'x', differentials: [{ name: '<b>A</b>', description: 'd' }, { name: 'B', description: 'd' }] }, null).reason, 'html_or_markdown_in_differential');
  assert.equal(validateStructuredNotesInput({ pattern: 'x', differentials: [{ name: 'A', description: '**d**' }, { name: 'B', description: 'd' }] }, null).reason, 'html_or_markdown_in_differential');
});
test('ESTRUTURA: diferenciais duplicados (mesmo nome, ignorando acento/caixa) são rejeitados', () => {
  const struct = { pattern: 'x', differentials: [{ name: 'Craniofaringioma', description: 'd1' }, { name: 'craniofaringioma', description: 'd2' }] };
  assert.equal(validateStructuredNotesInput(struct, null).reason, 'duplicate_differential');
});
test('ESTRUTURA: a própria entidade revisada não pode aparecer como diferencial dela mesma', () => {
  const struct = { pattern: 'x', differentials: [{ name: 'Craniofaringioma', description: 'd1' }, { name: 'Meningioma', description: 'd2' }] };
  assert.equal(validateStructuredNotesInput(struct, 'Craniofaringioma').reason, 'entity_as_own_differential');
  // subtipo (texto diferente, não é match exato) continua permitido:
  const subtipo = { pattern: 'x', differentials: [{ name: 'Craniofaringioma papilar', description: 'd1' }, { name: 'Meningioma', description: 'd2' }] };
  assert.equal(validateStructuredNotesInput(subtipo, 'Craniofaringioma').valid, true);
});
test('INTEGRAÇÃO: apply com notes ESTRUTURADO (pattern/differentials) é convertido na string final determinística — proposedChanges.notes final é sempre string', async () => {
  const f = fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: {
    pattern: 'Massa sólida bem circunscrita.',
    differentials: [
      { name: 'Craniofaringioma adamantinomatoso', description: 'maior componente cístico' },
      { name: 'Meningioma do tubérculo selar', description: 'implantação dural ampla' },
      { name: 'Cisto de Rathke', description: 'parede fina, sem componente sólido' }
    ]
  } } }) ] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] });
  assert.equal(out.results[0].result, 'apply');
  assert.equal(typeof out.results[0].proposedChanges.notes, 'string');
  assert.equal(out.results[0].proposedChanges.notes,
    'Padrão: Massa sólida bem circunscrita.\n\nDiferenciais-chave:\n'
    + 'Craniofaringioma adamantinomatoso — maior componente cístico\n'
    + 'Meningioma do tubérculo selar — implantação dural ampla\n'
    + 'Cisto de Rathke — parede fina, sem componente sólido');
});
test('INTEGRAÇÃO: apply com notes estruturado INVÁLIDO (ex.: entidade como diferencial de si mesma) sofre downgrade do ITEM para manual_action_required, nunca aplica', async () => {
  const f = fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: {
    pattern: 'x', differentials: [{ name: 'Nome de teste', description: 'd1' }, { name: 'Outro', description: 'd2' }]
  } } }) ] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] }); // currentFields.name = 'Nome de teste'
  assert.equal(out.results[0].result, 'manual_action_required');
  assert.equal(out.results[0].proposedChanges, null);
  assert.match(out.results[0].manualAction.description, /entity_as_own_differential/);
});
test('COMPATIBILIDADE: schema antigo — notes como string direta (sem Padrão/Diferenciais-chave) continua aceito normalmente, sem nenhuma conversão', async () => {
  const f = fixture({ output: { results: [result('r1', { result: 'apply', proposedChanges: { notes: 'Correção pontual de um erro de digitação.' } })] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] });
  assert.equal(out.results[0].result, 'apply');
  assert.equal(out.results[0].proposedChanges.notes, 'Correção pontual de um erro de digitação.');
});
test('COMPATIBILIDADE: um lote pode misturar notes estruturado (item 1) e notes string antiga (item 2) sem conflito', async () => {
  const f = fixture({ output: { results: [
    result('r1', { result: 'apply', proposedChanges: { notes: { pattern: 'x', differentials: [{ name: 'A', description: 'd' }, { name: 'B', description: 'd' }] } } }),
    result('r2', { result: 'apply', proposedChanges: { notes: 'string antiga direta' } })
  ] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] }), review('r2', { allowedFields: ['notes'] })] });
  assert.equal(out.results[0].proposedChanges.notes, 'Padrão: x\n\nDiferenciais-chave:\nA — d\nB — d');
  assert.equal(out.results[1].proposedChanges.notes, 'string antiga direta');
});
test('ESTÁTICO: validateStructuredNotesInput/buildNotesFromStructured nunca referenciam DATA/SEED/setReviewSolution/autorização — só validam/montam texto', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../review-analysis.js'), 'utf8');
  const fnSrc = src.slice(src.indexOf('function validateStructuredNotesInput'), src.indexOf('function buildNotesFromStructured') + 500);
  for (const forbidden of ['setReviewSolution(', 'authorizeAndApplyReviewSolution(', 'approveAppliedReviewSolution(', 'DATA.', 'DATA[']) {
    assert.doesNotMatch(fnSrc, new RegExp(forbidden.replace(/[.[()]/g, '\\$&')));
  }
});
test('CONTRATO: STRUCTURED_NOTES_SCHEMA define pattern/differentials com 2-4 itens, name+description obrigatórios, sem campos extras', () => {
  assert.deepEqual(STRUCTURED_NOTES_SCHEMA.required, ['pattern', 'differentials']);
  assert.equal(STRUCTURED_NOTES_SCHEMA.additionalProperties, false);
  const diffSchema = STRUCTURED_NOTES_SCHEMA.properties.differentials;
  assert.equal(diffSchema.minItems, 2);
  assert.equal(diffSchema.maxItems, 4);
  assert.deepEqual(diffSchema.items.required, ['name', 'description']);
  assert.equal(diffSchema.items.additionalProperties, false);
});
test('CONTRATO: buildResultSchema aceita notes como string OU como STRUCTURED_NOTES_SCHEMA (anyOf) — compatível com o formato antigo', () => {
  const schema = buildResultSchema([review('r1', { allowedFields: ['notes'] })]);
  const notesVariant = schema.properties.results.items.properties.proposedChanges.anyOf
    .find(v => v.properties && Object.keys(v.properties).join() === 'notes');
  assert.ok(notesVariant, 'precisa existir uma variante só com notes');
  assert.deepEqual(notesVariant.properties.notes.anyOf[0], { type: 'string' });
  assert.deepEqual(notesVariant.properties.notes.anyOf[1], STRUCTURED_NOTES_SCHEMA);
});

test('INTEGRAÇÃO: saída completa/estruturada (reescrita final no formato canônico, Padrão com várias frases + 3 diferenciais) é aceita como apply', async () => {
  const notasReescritaFinal = 'Padrão: massa sólida bem circunscrita na região selar/suprasselar, com realce geralmente intenso. '
    + 'Pode haver expansão da sela e, em casos maiores, invasão do seio cavernoso. Calcificação é incomum nesta apresentação.\n'
    + 'Diferenciais-chave:\n'
    + 'Craniofaringioma adamantinomatoso — maior componente cístico e calcificações mais frequentes.\n'
    + 'Meningioma do tubérculo selar — implantação dural ampla, realce intenso e homogêneo.\n'
    + 'Cisto de Rathke — parede fina, sem componente sólido realçante.';
  const f = fixture({ output: { results: [result('r1', {
    result: 'apply', summary: 'Notes reescrita com achados específicos e diferenciais individualizados.',
    reasoning: 'Notes anterior era genérica; reescrita traz características discriminativas de imagem por diferencial.',
    proposedChanges: { notes: notasReescritaFinal }
  })] } });
  const out = await f.invoke({ reviews: [review('r1', { allowedFields: ['notes'] })] });
  assert.equal(out.results[0].result, 'apply');
  assert.deepEqual(out.results[0].proposedChanges, { notes: notasReescritaFinal });
  assert.equal(validateStructuredDifferentials(notasReescritaFinal).valid, true);
});
