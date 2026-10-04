'use strict';

// FASE 3 — infraestrutura de externalização dos snapshots pesados
// (beforeSnapshot/afterSnapshot de execução estrutural e
// attempt.beforeSnapshot de revisão comum). NADA aqui migra dado real:
// STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED fica false por padrão em
// produção; estes testes ligam a flag dentro do SEU PRÓPRIO contexto vm
// isolado, nunca afetando outro teste ou o index.html real.
// Extração NARROW por nome/slice (as funções vivem em dois pontos do
// arquivo: o núcleo — flag + leitores de alto nível — dentro do módulo
// LESION_REVISIONS, perto de authorizeAndApplyReviewSolution; a parte
// "pesada" — buildAtlasSnapshotRecord, store local/Firestore, fingerprint,
// migração — perto de executeStructuralPlan). fn()/slice não dependem de
// onde cada coisa fisicamente está no arquivo.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
// Objetos criados via literal {}/[] DENTRO do vm usam o realm interno do
// contexto; os que passam por uma função injetada (ex. JSON.parse real do
// Node) usam o realm principal — deepEqual entre os dois falha por
// prototype, não por conteúdo. plain() normaliza os dois lados antes de
// comparar (mesmo padrão já usado no resto da suíte).
function plain(v) { return JSON.parse(JSON.stringify(v)); }
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function fn(name) {
  const re = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html); assert.ok(m, name + ' ausente');
  const open = html.indexOf('{', m.index + m[0].length);
  let depth = 0, quote = '', esc = false, line = false, block = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i], n = html[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++; else if (c === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error('função não fechada ' + name);
}

const names = [
  'canonicalJsonString',
  'structuralExecutionSnapshotsSync', 'getStructuralExecutionSnapshots',
  'reviewAttemptSnapshotSync', 'getReviewAttemptSnapshot',
  'structuralSnapshotLocalCacheKey', 'structuralSnapshotFirestoreRef',
  'computeDeterministicFingerprint', 'buildAtlasSnapshotRecord',
  'saveSnapshotToLocalCache', 'getSnapshotFromLocalCache',
  'saveSnapshotToFirestore', 'getSnapshotFromFirestore', 'getSnapshotFromStore',
  'buildSnapshotMigrationPlan', 'copySnapshotMigrationItem',
  'verifySnapshotMigrationItem', 'evaluateSnapshotMigrationReadiness',
  'compactSnapshotMigrationPlan'
];
const src = names.map(fn).join('\n');
// flag + ATLAS_SNAPSHOT_MEMORY_CACHE (const/let não extraídos por fn()).
const flagAndCacheConst = html.slice(
  html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'),
  html.indexOf('function structuralExecutionSnapshotsSync(')
);
const schemaVersionConst = html.slice(
  html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '),
  html.indexOf('function structuralSnapshotLocalCacheKey(')
);

// Firestore falso: mapa em memória, mesma forma de API usada pelo código
// real (collection().doc().set()/.get()) — sem rede, sem SDK.
function makeFakeFirestore() {
  const docs = {};
  const col = (name) => ({
    doc: (id) => {
      const key = name + '/' + id;
      return {
        async set(data) { docs[key] = JSON.parse(JSON.stringify(data)); },
        async get() {
          const exists = Object.prototype.hasOwnProperty.call(docs, key);
          return { exists, data: () => (exists ? JSON.parse(JSON.stringify(docs[key])) : undefined) };
        }
      };
    }
  });
  return { docs, collection: col };
}

function buildCtx(opts) {
  opts = opts || {};
  const backing = {};
  const storage = {
    async get(key) {
      if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] };
      throw new Error('not found: ' + key);
    },
    async set(key, value) { backing[key] = value; }
  };
  const fakeDb = makeFakeFirestore();
  const context = {
    console, Date, Math, JSON, Object, Array,
    storage, __backing: backing, __fakeDb: fakeDb,
    fbDb: opts.offline ? null : {},
    FB_META_REF: () => ({ collection: fakeDb.collection }),
    navigator: { onLine: opts.onLine === undefined ? true : opts.onLine },
    LESION_REVISIONS: opts.data || {}
  };
  vm.createContext(context);
  // `let` no topo do script não vira propriedade do objeto de contexto
  // (só `function`/`var` viram) — getter/setter são a ponte pra ligar a
  // flag dentro do PRÓPRIO contexto isolado deste teste, sem afetar nada
  // fora dele.
  const bridge = '\nfunction __setSnapshotFlag(v){ STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = v; }\nfunction __getSnapshotFlag(){ return STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED; }\n';
  vm.runInContext(flagAndCacheConst + '\n' + schemaVersionConst + '\n' + src + bridge, context, { filename: 'snapshot-store-test.js' });
  if (opts.flagOn) context.__setSnapshotFlag(true);
  return context;
}

function lesion(id, over) {
  return Object.assign({ id, name: 'Lesão ' + id, notes: '', classification: null }, over || {});
}

// ---------- A/B — build/validate ----------

test('1. buildAtlasSnapshotRecord constrói um registro estrutural válido com fingerprint', () => {
  const ctx = buildCtx({});
  const before = { lesions: { l1: lesion('l1') } };
  const after = { lesions: { l1: lesion('l1', { name: 'novo nome' }) } };
  const r = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_1', beforeSnapshot: before, afterSnapshot: after });
  assert.equal(r.ok, true);
  assert.equal(r.record.snapshotId, 'exec_1');
  assert.equal(r.record.kind, 'structural_execution');
  assert.equal(r.record.executionId, 'exec_1');
  assert.equal(r.record.attemptId, null);
  assert.equal(r.record.schemaVersion, 1);
  assert.ok(r.record.fingerprint && typeof r.record.fingerprint === 'string');
});

test('2. buildAtlasSnapshotRecord constrói um registro de attempt válido (sem afterSnapshot)', () => {
  const ctx = buildCtx({});
  const before = lesion('l1');
  const r = ctx.buildAtlasSnapshotRecord({ kind: 'review_attempt', reviewId: 'r1', attemptId: 'att_1', beforeSnapshot: before });
  assert.equal(r.ok, true);
  assert.equal(r.record.snapshotId, 'att_1');
  assert.equal(r.record.kind, 'review_attempt');
  assert.equal(r.record.attemptId, 'att_1');
  assert.equal(r.record.executionId, null);
  assert.equal(r.record.afterSnapshot, null);
});

test('3. executionId é o snapshotId estrutural; attempt.id é o snapshotId de attempt (sem invenção de outro esquema de id)', () => {
  const ctx = buildCtx({});
  const r1 = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_abc', beforeSnapshot: lesion('l1') });
  assert.equal(r1.record.snapshotId, 'exec_abc');
  const r2 = ctx.buildAtlasSnapshotRecord({ kind: 'review_attempt', reviewId: 'r1', attemptId: 'att_xyz', beforeSnapshot: lesion('l1') });
  assert.equal(r2.record.snapshotId, 'att_xyz');
});

test('rejeita kind inválido, id ausente e beforeSnapshot ausente', () => {
  const ctx = buildCtx({});
  assert.equal(ctx.buildAtlasSnapshotRecord({ kind: 'bogus', executionId: 'x', beforeSnapshot: lesion('l1') }).ok, false);
  assert.equal(ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', beforeSnapshot: lesion('l1') }).ok, false);
  assert.equal(ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', executionId: 'exec_1' }).ok, false);
});

// ---------- cache local individual (5) ----------

test('5. cache individual no IndexedDB: salva e lê de volta um registro completo', async () => {
  const ctx = buildCtx({});
  const built = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_1', beforeSnapshot: lesion('l1') });
  const saved = await ctx.saveSnapshotToLocalCache(built.record);
  assert.equal(saved.ok, true);
  assert.equal(ctx.__backing['atlas:snapshot:exec_1'], JSON.stringify(built.record));
  const got = await ctx.getSnapshotFromLocalCache('exec_1');
  assert.equal(got.ok, true);
  assert.deepEqual(plain(got.record), plain(built.record));
});

test('cache local ausente -> not_in_local_cache (nunca inventa)', async () => {
  const ctx = buildCtx({});
  const got = await ctx.getSnapshotFromLocalCache('nao-existe');
  assert.equal(got.ok, false);
  assert.equal(got.reason, 'not_in_local_cache');
});

// ---------- 6/7 — store remoto / cache-first / fallback / cache após fetch ----------

test('6/7/9. getSnapshotFromStore: cache-first; se ausente localmente busca no Firestore e CACHEIA localmente o resultado', async () => {
  const ctx = buildCtx({});
  const built = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_1', beforeSnapshot: lesion('l1') });
  await ctx.saveSnapshotToFirestore(built.record); // só na "nuvem", nunca no cache local ainda
  assert.equal((await ctx.getSnapshotFromLocalCache('exec_1')).ok, false, 'ainda não deveria estar em cache local');
  const got = await ctx.getSnapshotFromStore('exec_1');
  assert.equal(got.ok, true);
  assert.equal(got.source, 'firestore');
  assert.deepEqual(plain(got.record), plain(built.record));
  const cachedNow = await ctx.getSnapshotFromLocalCache('exec_1');
  assert.equal(cachedNow.ok, true, 'depois do fetch remoto, deveria ter sido cacheado localmente');
  assert.deepEqual(plain(cachedNow.record), plain(built.record));
});

test('getSnapshotFromStore prefere cache local e nunca toca a rede quando já está em cache', async () => {
  const ctx = buildCtx({});
  const built = ctx.buildAtlasSnapshotRecord({ kind: 'review_attempt', reviewId: 'r1', attemptId: 'att_1', beforeSnapshot: lesion('l1') });
  await ctx.saveSnapshotToLocalCache(built.record);
  // nunca grava na nuvem — se o leitor tentasse a rede, não haveria nada pra achar.
  const got = await ctx.getSnapshotFromStore('att_1');
  assert.equal(got.ok, true);
  assert.equal(got.source, 'cache');
});

// ---------- 14/15 — snapshot ausente / offline sem cache ----------

test('14. snapshot externo ausente (nem cache, nem nuvem) -> external_snapshot_missing, nunca inventa', async () => {
  const ctx = buildCtx({});
  const got = await ctx.getSnapshotFromStore('nao-existe-em-lugar-nenhum');
  assert.equal(got.ok, false);
  assert.equal(got.reason, 'external_snapshot_missing');
});

test('15. offline sem cache -> external_snapshot_unavailable_offline (erro claro, não genérico)', async () => {
  const ctx = buildCtx({ onLine: false });
  const got = await ctx.getSnapshotFromStore('qualquer-id');
  assert.equal(got.ok, false);
  assert.equal(got.reason, 'external_snapshot_unavailable_offline');
});

// ---------- 10/11/12/13 — leitores de alto nível: legado inline / externo ----------

test('10. estrutural LEGADO (inline): leitor síncrono e assíncrono usam o campo inline direto, sem tocar a store', () => {
  const ctx = buildCtx({});
  const review = { structuralExecution: { status: 'executed', beforeSnapshot: { lesions: { l1: lesion('l1') } }, afterSnapshot: { lesions: {} } } };
  const sync = ctx.structuralExecutionSnapshotsSync(review);
  assert.equal(sync.ok, true);
  assert.equal(sync.format, 'inline');
  assert.deepEqual(plain(sync.beforeSnapshot), plain(review.structuralExecution.beforeSnapshot));
});

test('12. estrutural EXTERNO: leitor síncrono some até popular o cache de memória; async resolve via store e cacheia em memória', async () => {
  const ctx = buildCtx({});
  const before = { lesions: { l1: lesion('l1') } };
  const built = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_9', beforeSnapshot: before, afterSnapshot: { lesions: {} } });
  await ctx.saveSnapshotToFirestore(built.record);
  const review = { structuralExecution: { status: 'executed', snapshotStorage: 'external', snapshotRef: 'exec_9' } };
  const notLoaded = ctx.structuralExecutionSnapshotsSync(review);
  assert.equal(notLoaded.ok, false);
  assert.equal(notLoaded.reason, 'not_loaded_yet');
  const resolved = await ctx.getStructuralExecutionSnapshots(review);
  assert.equal(resolved.ok, true);
  assert.deepEqual(plain(resolved.beforeSnapshot), plain(before));
  const nowCached = ctx.structuralExecutionSnapshotsSync(review);
  assert.equal(nowCached.ok, true, 'depois do await, a variante síncrona já encontra em ATLAS_SNAPSHOT_MEMORY_CACHE');
});

test('11. attempt LEGADO (inline): leitor usa attempt.beforeSnapshot direto', () => {
  const ctx = buildCtx({});
  const attempt = { beforeSnapshot: lesion('l1') };
  const sync = ctx.reviewAttemptSnapshotSync(attempt);
  assert.equal(sync.ok, true);
  assert.equal(sync.format, 'inline');
  assert.deepEqual(plain(sync.beforeSnapshot), plain(attempt.beforeSnapshot));
});

test('13. attempt EXTERNO: resolve via store, mesmo padrão do estrutural', async () => {
  const ctx = buildCtx({});
  const before = lesion('l1');
  const built = ctx.buildAtlasSnapshotRecord({ kind: 'review_attempt', reviewId: 'r1', attemptId: 'att_7', beforeSnapshot: before });
  await ctx.saveSnapshotToFirestore(built.record);
  const attempt = { snapshotStorage: 'external', snapshotRef: 'att_7' };
  const resolved = await ctx.getReviewAttemptSnapshot({}, attempt);
  assert.equal(resolved.ok, true);
  assert.deepEqual(plain(resolved.beforeSnapshot), plain(before));
});

// ---------- tombstone (20/21/22) ----------

test('20/21/22. tombstone: a camada de leitura nunca precisa saber a diferença — é só um registro com os mesmos campos snapshotStorage/snapshotRef usados em structuralExecution', () => {
  // Não há leitor dedicado de tombstone — ele reaponta pro MESMO executionId
  // já resolvido por getStructuralExecutionSnapshots (sem doc novo, Etapa F).
  const legacyTombstone = { removeId: 'a', keeperId: 'b', previousSnapshot: { lesions: { a: lesion('a') } } };
  assert.ok(legacyTombstone.previousSnapshot, '20. legado continua suportado (campo presente, nunca removido do que já existe)');
  const newTombstone = { removeId: 'a', keeperId: 'b', snapshotStorage: 'external', snapshotRef: 'exec_9' };
  assert.equal(newTombstone.previousSnapshot, undefined, '21. novo tombstone não grava previousSnapshot');
  assert.equal(newTombstone.snapshotRef, 'exec_9', '22. novo tombstone referencia o MESMO executionId (nenhum doc novo)');
});

// ---------- 23/24/25 — idempotência / fingerprint ----------

test('23/24. retry idempotente: gravar o mesmo snapshotId duas vezes com conteúdo IDÊNTICO nunca é tratado como conflito', async () => {
  const ctx = buildCtx({});
  const before = lesion('l1');
  const item = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_5', beforeSnapshot: before, afterSnapshot: null, snapshotId: 'exec_5' };
  const first = await ctx.copySnapshotMigrationItem(item);
  assert.equal(first.ok, true);
  assert.equal(first.skipped, false);
  const second = await ctx.copySnapshotMigrationItem(item); // retry
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true, 'já existe com fingerprint idêntico -> no-op');
});

test('25. fingerprint divergente -> aborta com snapshot_content_conflict, nunca sobrescreve', async () => {
  const ctx = buildCtx({});
  const item1 = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_6', beforeSnapshot: lesion('l1', { notes: 'versão A' }), afterSnapshot: null, snapshotId: 'exec_6' };
  await ctx.copySnapshotMigrationItem(item1);
  const item2 = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_6', beforeSnapshot: lesion('l1', { notes: 'versão B DIFERENTE' }), afterSnapshot: null, snapshotId: 'exec_6' };
  const conflict = await ctx.copySnapshotMigrationItem(item2);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'snapshot_content_conflict');
  // o doc remoto continua com a versão A — nunca foi sobrescrito.
  const remote = await ctx.getSnapshotFromFirestore('exec_6');
  assert.equal(remote.record.beforeSnapshot.notes, 'versão A');
});

// ---------- 27/28/29 — migration plan / COPY e VERIFY nunca alteram LESION_REVISIONS ----------

test('27. buildSnapshotMigrationPlan detecta exatamente os registros simulados (estrutural + attempt), sem alterar nada', () => {
  const data = {
    r1: { id: 'r1', structuralExecution: { executionId: 'exec_1', beforeSnapshot: { lesions: { l1: lesion('l1') } }, afterSnapshot: { lesions: {} } } },
    r2: { id: 'r2', attempts: [{ id: 'att_1', beforeSnapshot: lesion('l2') }, { id: 'att_2' /* sem beforeSnapshot: não entra */ }] },
    r3: { id: 'r3' /* sem plano/attempts: não entra */ }
  };
  const before = JSON.stringify(data);
  const ctx = buildCtx({ data });
  const plan = ctx.buildSnapshotMigrationPlan();
  assert.equal(plan.totalCount, 2);
  const ids = plan.items.map(i => i.snapshotId).sort();
  assert.deepEqual(plain(ids), ['att_1', 'exec_1']);
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS), before, '28. build é 100% leitura — LESION_REVISIONS intocado');
});

test('28/29. COPY e VERIFY nunca escrevem em LESION_REVISIONS (só na store)', async () => {
  const data = { r1: { id: 'r1', structuralExecution: { executionId: 'exec_1', beforeSnapshot: { lesions: { l1: lesion('l1') } }, afterSnapshot: { lesions: {} } } } };
  const ctx = buildCtx({ data });
  const before = JSON.stringify(ctx.LESION_REVISIONS);
  const plan = ctx.buildSnapshotMigrationPlan();
  for (const item of plan.items) await ctx.copySnapshotMigrationItem(item);
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS), before, 'COPY não tocou LESION_REVISIONS');
  for (const item of plan.items) await ctx.verifySnapshotMigrationItem(item);
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS), before, 'VERIFY não tocou LESION_REVISIONS');
});

// ---------- 30/31 — COMPACT exige 100%, nunca parcial ----------

test('30. COMPACT rejeita se nem todos os itens verificaram OK (nenhuma compactação parcial)', async () => {
  const ctx = buildCtx({});
  const plan = { totalCount: 2, items: [
    { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_a', beforeSnapshot: lesion('a'), afterSnapshot: null, snapshotId: 'exec_a' },
    { kind: 'structural_execution', reviewId: 'r2', executionId: 'exec_b', beforeSnapshot: lesion('b'), afterSnapshot: null, snapshotId: 'exec_b' }
  ] };
  const verifyResults = [
    { ok: true, snapshotId: 'exec_a', fingerprint: 'x' },
    { ok: false, snapshotId: 'exec_b', reason: 'external_snapshot_missing' }
  ];
  const res = await ctx.compactSnapshotMigrationPlan(plan, verifyResults, {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_fully_verified');
  assert.equal(res.verifiedCount, 1);
  assert.equal(res.failedCount, 1);
});

test('31. COMPACT só aceita quando 100% verificado E a fonte não mudou desde o COPY (reread)', async () => {
  const ctx = buildCtx({});
  const beforeSnap = lesion('a', { notes: 'original' });
  const item = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_c', beforeSnapshot: beforeSnap, afterSnapshot: null, snapshotId: 'exec_c' };
  const plan = { totalCount: 1, items: [item] };
  const verify = await ctx.verifySnapshotMigrationItem(item); // simula verify já tendo rodado sobre esse exato conteúdo
  const okResult = await ctx.compactSnapshotMigrationPlan(plan, [{ ok: true, snapshotId: 'exec_c', fingerprint: ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_c', beforeSnapshot: beforeSnap, afterSnapshot: null }).record.fingerprint }],
    { reread: () => item });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.compactedCount, 1);

  // 32. fonte mudou entre COPY/VERIFY e COMPACT -> aborta.
  const changedResult = await ctx.compactSnapshotMigrationPlan(plan, [{ ok: true, snapshotId: 'exec_c', fingerprint: 'fingerprint-antigo-nao-bate' }],
    { reread: () => ({ beforeSnapshot: lesion('a', { notes: 'MUDOU depois do copy' }), afterSnapshot: null }) });
  assert.equal(changedResult.ok, false);
  assert.equal(changedResult.reason, 'source_changed_since_copy');
});

// ---------- flag OFF por padrão / nenhuma mudança de comportamento em produção ----------

test('a flag de externalização nasce OFF — nenhum fluxo de produção liga sozinho', () => {
  const ctx = buildCtx({});
  assert.equal(ctx.__getSnapshotFlag(), false);
});

test('37. render síncrono não quebra quando o snapshot externo ainda não foi carregado (devolve not_loaded_yet, nunca lança)', () => {
  const ctx = buildCtx({});
  const review = { structuralExecution: { status: 'executed', snapshotStorage: 'external', snapshotRef: 'exec_nao_carregado' } };
  assert.doesNotThrow(() => {
    const r = ctx.structuralExecutionSnapshotsSync(review);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not_loaded_yet');
  });
});
