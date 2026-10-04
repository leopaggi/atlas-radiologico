'use strict';

// FASE 3C — codec Firestore do snapshot store (encode/decode centralizado).
// Causa real: o Firestore recusa nested arrays nativos (invalid-argument no
// primeiro COPY); snapshots lógicos contêm tuplas [t,ok,graded] do
// reviewProgress embutido. O envelope encoded (metadata plana + payloadJson)
// é o ÚNICO formato que cruza a fronteira Firestore; cache local, rollback e
// memória continuam com o logical record. Fingerprint sempre sobre o lógico.
// Extração por nome/slice do index.html real; sem rede/Firebase reais.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

// Firestore recusa array-dentro-de-array em qualquer profundidade. O envelope
// encoded só pode conter escalares, objetos e strings (payloadJson).
function assertNoNestedArrays(v, trail) {
  trail = trail || 'doc';
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      assert.equal(Array.isArray(v[i]), false, 'nested array em ' + trail + '[' + i + ']');
      assertNoNestedArrays(v[i], trail + '[' + i + ']');
    }
    return;
  }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) assertNoNestedArrays(v[k], trail + '.' + k);
    return;
  }
  assert.ok(v === null || ['string', 'number', 'boolean'].includes(typeof v), 'valor não-Firestore em ' + trail + ': ' + typeof v);
}

const codecNames = [
  'canonicalJsonString',
  'structuralSnapshotLocalCacheKey', 'structuralSnapshotFirestoreRef',
  'computeDeterministicFingerprint', 'buildAtlasSnapshotRecord',
  'encodeSnapshotRecordForFirestore', 'decodeSnapshotRecordFromFirestore',
  'saveSnapshotToLocalCache', 'getSnapshotFromLocalCache',
  'saveSnapshotToFirestore', 'getSnapshotFromFirestore', 'getSnapshotFromStore',
  'buildSnapshotMigrationPlan', 'copySnapshotMigrationItem',
  'verifySnapshotMigrationItem', 'evaluateSnapshotMigrationReadiness',
  'compactSnapshotMigrationPlan'
];
const codecSrc = codecNames.map(fn).join('\n');
const codecConsts = html.slice(
  html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '),
  html.indexOf('function structuralSnapshotLocalCacheKey(')
);
const flagAndCacheConst = html.slice(
  html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'),
  html.indexOf('function structuralExecutionSnapshotsSync(')
);

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

function codecCtx(opts) {
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
    navigator: { onLine: true }, LESION_REVISIONS: {}
  };
  vm.createContext(context);
  vm.runInContext(flagAndCacheConst + '\n' + codecConsts + '\n' + codecSrc, context, { filename: 'snapshot-codec-test.js' });
  return context;
}

// Fixture representativa do erro real: beforeSnapshot com tuplas do Quiz
// [t,ok,graded] (reviewProgress embutido nos maps) = nested arrays que o
// Firestore recusou com invalid-argument no primeiro COPY.
function realLikeBefore() {
  return {
    lesions: { seed_208: { index: 0, lesion: { id: 'seed_208', name: 'Cistoadenoma mucinoso', images: [{ assetId: 'A208' }] } } },
    maps: {
      review: {}, reviewStamps: {},
      reviewProgress: { seed_208: { a: [[1700000000000, true, 1], [1700000100000, false, 0]], lastGrade: 'hard' } },
      reviewOverride: {}, srs: {}, merges: {}, pendingAdds: {}
    }
  };
}
function realLikeAfter() {
  return { lesions: { seed_208: { index: 0, lesion: { id: 'seed_208', name: 'Cistoadenoma mucinoso NOVO', images: [{ assetId: 'A208' }] } } } };
}
function buildRealLike(ctx, over) {
  return ctx.buildAtlasSnapshotRecord(Object.assign(
    { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_real', beforeSnapshot: realLikeBefore(), afterSnapshot: realLikeAfter() },
    over || {}));
}

test('3C-01 nested arrays no beforeSnapshot: envelope encoded sem arrays aninhados', () => {
  const ctx = codecCtx({});
  const built = buildRealLike(ctx);
  assert.equal(built.ok, true);
  // prova que a fixture reproduz o erro real (lógico contém nested arrays:
  // tuplas [t,ok,graded] do reviewProgress embutido nos maps)
  let hasNested = false;
  (function walk(v) {
    if (Array.isArray(v)) { if (v.some(Array.isArray)) hasNested = true; v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(built.record.beforeSnapshot);
  assert.equal(hasNested, true, 'a fixture precisa conter nested arrays (tuplas do Quiz)');
  const enc = ctx.encodeSnapshotRecordForFirestore(built.record);
  assert.equal(enc.ok, true);
  assertNoNestedArrays(enc.doc);
});

test('3C-02 nested arrays no afterSnapshot: envelope encoded sem arrays aninhados', () => {
  const ctx = codecCtx({});
  const built = buildRealLike(ctx, { afterSnapshot: { lesions: {}, trail: [[1, 2], [3]] } });
  assert.equal(built.ok, true);
  const enc = ctx.encodeSnapshotRecordForFirestore(built.record);
  assert.equal(enc.ok, true);
  assertNoNestedArrays(enc.doc);
  assert.equal(typeof enc.doc.payloadJson, 'string');
});

test('3C-03 round-trip lógico → encode → decode deepEqual ao original', () => {
  const ctx = codecCtx({});
  const built = buildRealLike(ctx);
  const dec = ctx.decodeSnapshotRecordFromFirestore(ctx.encodeSnapshotRecordForFirestore(built.record).doc);
  assert.equal(dec.ok, true);
  assert.deepEqual(plain(dec.record), plain(built.record));
});

test('3C-04 fingerprint preservado no round-trip (é do logical, não do transporte)', () => {
  const ctx = codecCtx({});
  const built = buildRealLike(ctx);
  const dec = ctx.decodeSnapshotRecordFromFirestore(ctx.encodeSnapshotRecordForFirestore(built.record).doc);
  assert.equal(dec.record.fingerprint, built.record.fingerprint);
  assert.equal(dec.record.fingerprint, ctx.computeDeterministicFingerprint({ beforeSnapshot: dec.record.beforeSnapshot, afterSnapshot: dec.record.afterSnapshot }));
});

test('3C-05 metadata preservada no envelope e no decode', () => {
  const ctx = codecCtx({});
  const built = buildRealLike(ctx);
  const doc = ctx.encodeSnapshotRecordForFirestore(built.record).doc;
  for (const k of ['snapshotId', 'kind', 'reviewId', 'executionId', 'attemptId', 'schemaVersion', 'fingerprint']) {
    assert.deepEqual(plain(doc[k]), plain(built.record[k]), 'envelope preserva ' + k);
  }
  assert.equal(doc.payloadEncoding, 'json-v1');
  const dec = ctx.decodeSnapshotRecordFromFirestore(doc);
  for (const k of ['snapshotId', 'kind', 'reviewId', 'executionId', 'attemptId', 'schemaVersion', 'fingerprint']) {
    assert.deepEqual(plain(dec.record[k]), plain(built.record[k]), 'decode preserva ' + k);
  }
});

test('3C-06 beforeSnapshot ausente: encode rejeita (formato inválido)', () => {
  const ctx = codecCtx({});
  assert.equal(ctx.encodeSnapshotRecordForFirestore(null).ok, false);
  assert.equal(ctx.encodeSnapshotRecordForFirestore({ snapshotId: 'x', kind: 'review_attempt', fingerprint: 'f' }).ok, false);
  assert.equal(ctx.encodeSnapshotRecordForFirestore({ snapshotId: 'x', kind: 'bogus', beforeSnapshot: { a: 1 }, fingerprint: 'f' }).ok, false);
  assert.equal(ctx.encodeSnapshotRecordForFirestore({ kind: 'review_attempt', beforeSnapshot: { a: 1 }, fingerprint: 'f' }).ok, false);
});

test('3C-07 afterSnapshot null (attempt): encode ok e round-trip preserva null', () => {
  const ctx = codecCtx({});
  const built = ctx.buildAtlasSnapshotRecord({ kind: 'review_attempt', reviewId: 'r1', attemptId: 'att_1', beforeSnapshot: { id: 'seed_1' } });
  assert.equal(built.record.afterSnapshot, null);
  const dec = ctx.decodeSnapshotRecordFromFirestore(ctx.encodeSnapshotRecordForFirestore(built.record).doc);
  assert.equal(dec.ok, true);
  assert.equal(dec.record.afterSnapshot, null);
  assert.deepEqual(plain(dec.record), plain(built.record));
});

test('3C-08 payload JSON corrompido: decode falha explicitamente', () => {
  const ctx = codecCtx({});
  const doc = ctx.encodeSnapshotRecordForFirestore(buildRealLike(ctx).record).doc;
  const bad = Object.assign({}, doc, { payloadJson: '{"beforeSnapshot": ' });
  const dec = ctx.decodeSnapshotRecordFromFirestore(bad);
  assert.equal(dec.ok, false);
  assert.equal(dec.reason, 'snapshot_decode_failed');
});

test('3C-09 payloadEncoding desconhecido: decode falha explicitamente', () => {
  const ctx = codecCtx({});
  const doc = ctx.encodeSnapshotRecordForFirestore(buildRealLike(ctx).record).doc;
  assert.equal(ctx.decodeSnapshotRecordFromFirestore(Object.assign({}, doc, { payloadEncoding: 'yaml-v9' })).ok, false);
  assert.equal(ctx.decodeSnapshotRecordFromFirestore(Object.assign({}, doc, { payloadEncoding: undefined })).ok, false);
  // envelope no formato lógico antigo (sem payloadJson) também é rejeitado
  assert.equal(ctx.decodeSnapshotRecordFromFirestore(buildRealLike(ctx).record).ok, false);
});

test('3C-10 saveSnapshotToFirestore usa o encoder (doc persistido é o envelope)', async () => {
  const ctx = codecCtx({});
  assert.match(fn('saveSnapshotToFirestore'), /encodeSnapshotRecordForFirestore\(/, 'save precisa codificar');
  const built = buildRealLike(ctx);
  const saved = await ctx.saveSnapshotToFirestore(built.record);
  assert.equal(saved.ok, true);
  const rawDoc = ctx.__fakeDb.docs['snapshotStore/exec_real'];
  assert.ok(rawDoc, 'doc gravado na store');
  assertNoNestedArrays(rawDoc);
  assert.equal(rawDoc.payloadEncoding, 'json-v1');
  assert.equal(typeof rawDoc.payloadJson, 'string');
});

test('3C-11 copySnapshotMigrationItem usa o mesmo caminho seguro', async () => {
  const ctx = codecCtx({});
  assert.match(fn('copySnapshotMigrationItem'), /saveSnapshotToFirestore\(/, 'copy usa o writer central');
  const item = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_real', beforeSnapshot: realLikeBefore(), afterSnapshot: realLikeAfter(), snapshotId: 'exec_real' };
  const first = await ctx.copySnapshotMigrationItem(item);
  assert.equal(first.ok, true);
  assertNoNestedArrays(ctx.__fakeDb.docs['snapshotStore/exec_real']);
});

test('3C-12 transaction usa o envelope encoded (nunca o lógico cru)', () => {
  const tx = fn('writeShardedState');
  assert.match(tx, /pendingSnapshotDocs\[snapshotId\]/, 'tx.set usa o doc pré-codificado');
  assert.match(tx, /encodeSnapshotRecordForFirestore\(/, 'codificação antes do commit');
  assert.doesNotMatch(tx, /tx\.set\(structuralSnapshotFirestoreRef\(snapshotId\), localRecord\)/, 'nenhum set cru na transação');
});

test('3C-13 getSnapshotFromFirestore retorna o logical decodificado', async () => {
  const ctx = codecCtx({});
  assert.match(fn('getSnapshotFromFirestore'), /decodeSnapshotRecordFromFirestore\(/, 'leitura decodifica');
  const built = buildRealLike(ctx);
  await ctx.saveSnapshotToFirestore(built.record);
  const got = await ctx.getSnapshotFromFirestore('exec_real');
  assert.equal(got.ok, true);
  assert.deepEqual(plain(got.record), plain(built.record));
  assert.ok(got.record.beforeSnapshot.maps, 'beforeSnapshot é objeto de novo');
});

test('3C-14 remoto idêntico continua idempotente', async () => {
  const ctx = codecCtx({});
  const item = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_dup', beforeSnapshot: { a: 1 }, afterSnapshot: null, snapshotId: 'exec_dup' };
  assert.equal((await ctx.copySnapshotMigrationItem(item)).skipped, false);
  const retry = await ctx.copySnapshotMigrationItem(item);
  assert.equal(retry.ok, true);
  assert.equal(retry.skipped, true, 'fingerprint igual → no-op');
});

test('3C-15 remoto divergente continua conflito (nunca sobrescreve)', async () => {
  const ctx = codecCtx({});
  const base = { kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_c', afterSnapshot: null, snapshotId: 'exec_c' };
  assert.equal((await ctx.copySnapshotMigrationItem(Object.assign({ beforeSnapshot: { v: 'A' } }, base))).ok, true);
  const conflict = await ctx.copySnapshotMigrationItem(Object.assign({ beforeSnapshot: { v: 'B DIFERENTE' } }, base));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'snapshot_content_conflict');
  const remote = await ctx.getSnapshotFromFirestore('exec_c');
  assert.equal(remote.record.beforeSnapshot.v, 'A', 'remoto preservado');
});

test('3C-16 dois snapshots na mesma transaction: all-or-none com envelope', () => {
  const tx = fn('writeShardedState');
  const metaSet = 'tx.set(FB_META_REF(), firestoreMeta)';
  assert.equal(tx.split('tx.set(FB_META_REF()').length - 1, 1, 'um único commit da metadata');
  assert.ok(tx.indexOf('for(const snapshotId of finalPendingIds){') < tx.indexOf(metaSet), 'snapshots decididos antes da metadata');
  assert.ok(tx.indexOf('pendingSnapshotDocs[snapshotId]') < tx.indexOf(metaSet), 'envelope encoded antes da metadata');
});

// ---------- cache local continua lógico/raw + rollback ----------

const MODULE_START_MARKER = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END_MARKER = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSource = html.slice(html.indexOf(MODULE_START_MARKER), html.indexOf(MODULE_END_MARKER));
const canonSrc = html.slice(html.indexOf('function canonicalJsonString('), html.indexOf('function deepStableEqual('));
const heavySource = html.slice(html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '), html.indexOf('function buildSnapshotMigrationPlan('));

function reviewCtx3C(opts) {
  opts = opts || {};
  const backing = {};
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
    async set(key, value) { backing[key] = value; }
  };
  const context = {
    console, Date, Math, JSON, Object, Array, storage, __backing: backing,
    DATA: opts.data || [], saveDataCalls: []
  };
  context.saveData = () => { context.saveDataCalls.push(Date.now()); };
  context.syncDirtyCalls = 0; context.pushCalls = 0;
  context.markSyncDirty = async () => { context.syncDirtyCalls += 1; };
  context.pushToFirebase = () => { context.pushCalls += 1; };
  vm.createContext(context);
  vm.runInContext(moduleSource, context, { filename: 'lesion-review-module-3c.js' });
  vm.runInContext(canonSrc + '\n' + heavySource, context, { filename: 'lesion-review-module-3c-heavy.js' });
  if (opts.flagOn) vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true;', context);
  return context;
}
const tick3C = () => new Promise((r) => setTimeout(r, 10));

test('3C-17 cache local continua logical/raw e rollback funciona (flag ON)', async () => {
  const lesion = { id: 'seed_1', name: 'Adamantinoma', s: 'Musculoesquelético', site: 'Tíbia', tags: [], notes: 'original', classification: null, enTerm: 'adamantinoma', img: '', images: [], links: [] };
  const ctx = reviewCtx3C({ data: [lesion], flagOn: true });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  ctx.setReviewSolution(review.id, 'x', { notes: 'nota nova' });
  assert.equal(ctx.authorizeAndApplyReviewSolution(review.id).ok, true);
  await tick3C();
  const cached = await ctx.getSnapshotFromLocalCache(review.attempts[0].id);
  assert.equal(cached.ok, true, 'snapshot em cache local');
  assert.ok(cached.record.beforeSnapshot && typeof cached.record.beforeSnapshot === 'object', 'cache guarda OBJETO lógico, não string');
  assert.equal(cached.record.beforeSnapshot.notes, 'original');
  const rb = await ctx.rollbackAppliedReviewSolution(review.id, 'não funcionou');
  assert.equal(rb.ok, true, 'rollback via cache lógico: ' + rb.reason);
  assert.equal(ctx.DATA[0].notes, 'original');
});

test('3C-18 flag OFF continua comportamento legado (inline, sem Firestore)', async () => {
  const lesion = { id: 'seed_1', name: 'L', s: 'S', site: 'T', tags: [], notes: 'a', classification: null, enTerm: '', img: '', images: [], links: [] };
  const ctx = reviewCtx3C({ data: [lesion] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  ctx.setReviewSolution(review.id, 'x', { notes: 'b' });
  assert.equal(ctx.authorizeAndApplyReviewSolution(review.id).ok, true);
  await tick3C();
  const attempt = review.attempts[0];
  assert.ok(attempt.beforeSnapshot, 'inline');
  assert.equal(attempt.snapshotStorage, undefined, 'sem marker externo');
  assert.equal(Object.keys(ctx.__backing).filter((k) => k.indexOf('atlas:snapshot:') === 0).length, 0, 'nada no cache de snapshots');
});

test('3C-19 nenhuma migração automática', () => {
  assert.ok(html.includes('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false'), 'flag nasce OFF');
  // build tem 2 ocorrências: definição + rebuild live no apply manual (5B).
  for (const pair of [['copySnapshotMigrationItem(', 1], ['verifySnapshotMigrationItem(', 1], ['compactSnapshotMigrationPlan(', 1]]) {
    assert.equal(html.split(pair[0]).length - 1, pair[1], pair[0] + ' só tem a definição');
  }
  assert.equal(html.split('buildSnapshotMigrationPlan(').length - 1, 2, 'build: definição + rebuild do apply');
});

test('3C-20 nenhum call site produtivo faz .set de snapshot lógico cru', () => {
  assert.doesNotMatch(fn('saveSnapshotToFirestore'), /\.set\((record|localRecord|built\.record)\)/, 'writer central só persiste envelope');
  assert.doesNotMatch(fn('writeShardedState'), /, localRecord\)/, 'transação sem record cru');
  assert.equal(html.split('.set(built.record)').length - 1, 0, 'nenhum .set(built.record) no app');
});
