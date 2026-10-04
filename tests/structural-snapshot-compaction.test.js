'use strict';

// FASE 5B — compactação REAL (applySnapshotMigrationCompaction), NÃO executada
// em dados reais aqui: todos os testes usam fixtures sintéticas + Firestore
// falso em memória. Pipeline testado: gates → VERIFY remoto novo → PREPARE em
// clone → VALIDATE → APPLY por troca única → PERSIST uma vez (read-back) →
// sync normal. Sem boot/save/sync automáticos tocados. Sem rede real.

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

const codecConsts = html.slice(
  html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '),
  html.indexOf('function structuralSnapshotLocalCacheKey(')
);

// ---------- fixture determinística: 12 exec + 46 attempts + 10 tombstones ----------

function snapLesion(id, name) {
  return { id, name, s: 'S', site: 'T', tags: [], notes: 'n', classification: null, enTerm: '', img: '', images: [], links: [] };
}
function execBefore(tag, nested) {
  return {
    lesions: { k: { index: 0, lesion: snapLesion('seed_k' + tag, 'Keeper ' + tag) } },
    maps: {
      review: {}, reviewStamps: {},
      reviewProgress: nested ? { seed_k: { a: [[1700000000000, true, 1]] } } : {},
      reviewOverride: {}, srs: {}, merges: {}, pendingAdds: {}
    }
  };
}
function execAfter(tag) {
  return { lesions: { k: { index: 0, lesion: snapLesion('seed_k' + tag, 'Keeper ' + tag + ' novo') } } };
}
function mkAttempt(id, seedTag) {
  return { id, proposedChanges: { notes: 'x' }, beforeSnapshot: snapLesion('seed_a' + seedTag, 'Lesão ' + seedTag), appliedAt: 1000, approvedAt: null, rolledBackAt: null, rollbackReason: null };
}
// 58 itens: 12 executions (10 com tombstone) + 46 attempts (22 nas execs + 24 avulsos).
function buildFixture58() {
  const revs = {};
  let attN = 0;
  const attId = () => 'att_t' + String(++attN).padStart(2, '0');
  for (let i = 1; i <= 12; i++) {
    const tag = String(i).padStart(2, '0');
    const nAtt = i <= 10 ? 2 : 1;
    const attempts = [];
    for (let k = 0; k < nAtt; k++) attempts.push(mkAttempt(attId(), 'e' + tag + 'a' + k));
    const tomb = i <= 10
      ? { removeId: 'seed_r' + tag, keeperId: 'seed_k' + tag, previousSnapshot: { lesions: {} }, timestamp: '2026-01-01', reviewId: 'r_exec_' + tag, executorVersion: 1 }
      : null;
    revs['r_exec_' + tag] = {
      id: 'r_exec_' + tag, lesionId: 'seed_k' + tag, status: 'manual_action_required', requestText: 'fundir',
      structuralExecution: Object.assign(
        { executionId: 'exec_t' + tag, status: 'executed', type: 'merge_duplicates', at: '2026-01-01', affectedIds: ['seed_k' + tag], operations: ['merge'], executorVersion: 1, beforeSnapshot: execBefore(tag, i === 1), afterSnapshot: execAfter(tag) },
        tomb ? { tombstone: tomb } : {}),
      attempts, history: [], createdAt: 1, updatedAt: 2
    };
  }
  for (let j = 1; j <= 24; j++) {
    const id = attId();
    revs['r_att_' + String(j).padStart(2, '0')] = {
      id: 'r_att_' + String(j).padStart(2, '0'), lesionId: 'seed_1', status: 'applied_pending_validation',
      requestText: 'x', solution: { text: 't', proposedChanges: { notes: 'x' } },
      attempts: [mkAttempt(id, 'solo' + j)], history: [], createdAt: 1, updatedAt: 2
    };
  }
  return revs;
}
function countFixture(revs) {
  let e = 0, a = 0, t = 0;
  for (const r of Object.values(revs)) {
    const ex = r && r.structuralExecution;
    if (ex && (ex.beforeSnapshot || ex.afterSnapshot)) e++;
    if (ex && ex.tombstone && ex.tombstone.previousSnapshot) t++;
    for (const x of (r && Array.isArray(r.attempts) ? r.attempts : [])) if (x && x.beforeSnapshot) a++;
  }
  return { e, a, t };
}

// ---------- contexto mínimo do apply (sem módulo, sem DATA) ----------

const applyNames = [
  'canonicalJsonString', 'utf8ByteLength',
  'computeDeterministicFingerprint', 'buildAtlasSnapshotRecord',
  'structuralSnapshotLocalCacheKey', 'structuralSnapshotFirestoreRef',
  'encodeSnapshotRecordForFirestore', 'decodeSnapshotRecordFromFirestore',
  'getSnapshotFromFirestore', 'saveSnapshotToFirestore',
  'buildSnapshotMigrationPlan',
  'projectLesionRevisionsWithoutSnapshots', 'applySnapshotMigrationCompaction',
  'saveLesionRevisions'
];
const applySrc = applyNames.map(fn).join('\n');

function applyCtx(fixture, opts) {
  opts = opts || {};
  const backing = opts.backing || {};
  const stats = { sets: 0, revSets: 0, pushes: 0, dirties: 0 };
  const storage = {
    async get(key) {
      if (opts.failPersist) throw new Error('persist falhou (simulado)');
      if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] };
      throw new Error('not found: ' + key);
    },
    async set(key, value) {
      stats.sets++;
      if (key === 'atlas:lesionRevisions') stats.revSets++;
      if (opts.failPersist && key === 'atlas:lesionRevisions') throw new Error('persist falhou (simulado)');
      backing[key] = value;
    }
  };
  const fakeDocs = opts.fakeDocs || {};
  const fakeDb = {
    collection: (name) => ({
      doc: (id) => {
        const key = name + '/' + id;
        return {
          async set(data) { fakeDocs[key] = JSON.parse(JSON.stringify(data)); },
          async get() {
            const exists = Object.prototype.hasOwnProperty.call(fakeDocs, key);
            return { exists, data: () => (exists ? JSON.parse(JSON.stringify(fakeDocs[key])) : undefined) };
          }
        };
      }
    })
  };
  const context = {
    console, Date, Math, JSON, Object, Array, storage, __backing: backing, __stats: stats, __fakeDocs: fakeDocs,
    fbDb: {}, FB_META_REF: () => ({ collection: fakeDb.collection }), navigator: { onLine: true },
    markSyncDirty: async () => { stats.dirties++; }, pushToFirebase: () => { stats.pushes++; }
  };
  vm.createContext(context);
  vm.runInContext("const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';", context);
  vm.runInContext('let LESION_REVISIONS = ' + JSON.stringify(fixture) + ';', context);
  vm.runInContext('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', context);
  vm.runInContext(codecConsts + '\n' + applySrc, context, { filename: 'snapshot-compaction-test.js' });
  return context;
}
function liveOf(ctx) { return vm.runInContext('LESION_REVISIONS', ctx); }
function expectedFor(ctx) {
  const live = liveOf(ctx);
  const str = JSON.stringify(live);
  return {
    sourceFingerprint: ctx.computeDeterministicFingerprint(live),
    sourceBytes: Buffer.byteLength(str, 'utf8'),
    total: 58, structural: 12, attempts: 46, tombstones: 10
  };
}
// Semeia o Firestore falso com os 58 envelopes a partir do inline atual.
async function seedRemote58(ctx) {
  const plan = ctx.buildSnapshotMigrationPlan();
  assert.equal(plan.totalCount, 58);
  for (const item of plan.items) {
    const b = ctx.buildAtlasSnapshotRecord({ kind: item.kind, reviewId: item.reviewId,
      executionId: item.kind === 'structural_execution' ? item.executionId : undefined,
      attemptId: item.kind === 'review_attempt' ? item.attemptId : undefined,
      beforeSnapshot: item.beforeSnapshot, afterSnapshot: item.afterSnapshot });
    assert.equal(b.ok, true);
    assert.equal((await ctx.saveSnapshotToFirestore(b.record)).ok, true);
  }
  return plan;
}

test('5B-00 harness: fixture tem 12 exec + 46 attempts + 10 tombstones', () => {
  assert.deepEqual(countFixture(buildFixture58()), { e: 12, a: 46, t: 10 });
});

// Preenchido após primeira execução de sondagem (bytes determinísticos da
// fixture acima; qualquer mudança na fixture ou no formato exige atualizar).
const EXPECTED_DRYRUN_TARGET_BYTES = 20007;

// ---------- gates: abortam sem mutação e sem escrita ----------

test('5B-01 source fingerprint errado aborta sem mutação e sem escrita', async () => {
  const backing = {};
  const ctx = applyCtx(buildFixture58(), { backing });
  const before = JSON.stringify(liveOf(ctx));
  const exp = expectedFor(ctx);
  exp.sourceFingerprint = '0:deadbeef';
  const res = await ctx.applySnapshotMigrationCompaction({ expected: exp, dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'source_fingerprint_mismatch');
  assert.equal(JSON.stringify(liveOf(ctx)), before, 'real intacto');
  assert.equal(ctx.__stats.sets, 0, 'nenhuma escrita');
});

test('5B-02 source bytes errado aborta sem mutação', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  const before = JSON.stringify(liveOf(ctx));
  const exp = expectedFor(ctx);
  exp.sourceBytes = exp.sourceBytes + 1;
  const res = await ctx.applySnapshotMigrationCompaction({ expected: exp, dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'source_bytes_mismatch');
  assert.equal(JSON.stringify(liveOf(ctx)), before);
});

test('5B-03 plano != 58 aborta (expectativa maior que o real)', async () => {
  const fixture = buildFixture58();
  delete fixture.r_att_01; // 57 itens
  const ctx = applyCtx(fixture, {});
  const exp = { sourceFingerprint: ctx.computeDeterministicFingerprint(liveOf(ctx)), sourceBytes: Buffer.byteLength(JSON.stringify(liveOf(ctx)), 'utf8'), total: 58, structural: 12, attempts: 46, tombstones: 10 };
  const res = await ctx.applySnapshotMigrationCompaction({ expected: exp, dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'plan_count_mismatch');
  assert.equal(ctx.__stats.sets, 0);
});

test('5B-04 snapshot remoto ausente aborta antes de mutar', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  const before = JSON.stringify(liveOf(ctx));
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'remote_snapshot_unavailable');
  assert.equal(JSON.stringify(liveOf(ctx)), before);
});

test('5B-05 fingerprint remoto divergente aborta', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  // corrompe o conteúdo remoto de um item (fingerprint não bate mais)
  const key = 'snapshotStore/exec_t01';
  const doc = ctx.__fakeDocs[key];
  const payload = JSON.parse(doc.payloadJson);
  payload.beforeSnapshot.lesions.k.lesion.name = 'ADULTERADO';
  doc.payloadJson = JSON.stringify(payload);
  const before = JSON.stringify(liveOf(ctx));
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.ok(['remote_snapshot_conflict', 'remote_snapshot_unavailable'].includes(res.reason), res.reason);
  assert.equal(JSON.stringify(liveOf(ctx)), before);
});

test('5B-06 conteúdo remoto sem beforeSnapshot aborta com decode explícito', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const key = 'snapshotStore/exec_t02';
  const doc = ctx.__fakeDocs[key];
  doc.payloadJson = JSON.stringify({ afterSnapshot: null }); // sem beforeSnapshot
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'remote_snapshot_unavailable');
  assert.equal(JSON.stringify(liveOf(ctx)), JSON.stringify(liveOf(ctx)), 'sem mutação parcial');
});

test('5B-07 metadata remota divergente aborta (reviewId trocado, conteúdo igual)', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  ctx.__fakeDocs['snapshotStore/att_t01'].reviewId = 'r_outra_revisao';
  const before = JSON.stringify(liveOf(ctx));
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'remote_metadata_mismatch');
  assert.equal(JSON.stringify(liveOf(ctx)), before);
});

// ---------- prepare + validate no clone ----------

test('5B-08 todos 58 válidos: clone preparado (dryRun, sem mutar nem persistir)', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const before = JSON.stringify(liveOf(ctx));
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, true, JSON.stringify(res.reason || res));
  assert.equal(res.status, 'validated_dry_run');
  assert.equal(res.verifiedRemoteCount, 58);
  assert.equal(JSON.stringify(liveOf(ctx)), before, 'dry-run não muta');
  assert.equal(ctx.__stats.sets, 0, 'dry-run não persiste');
  assert.ok(/^compact_\d+$/.test(res.migrationId), 'migrationId presente');
  assert.ok(res.startedAt, 'startedAt presente');
});

test('5B-09 clone tem tamanho exato determinístico', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, true);
  assert.equal(res.targetBytes, EXPECTED_DRYRUN_TARGET_BYTES);
  assert.ok(res.reductionBytes > 0 && res.reductionPct > 0, 'houve redução real');
});

test('5B-10/11/12 clone: 12 executions, 46 attempts, 10 tombstones', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.structuralCount, 12);
  assert.equal(res.attemptCount, 46);
  assert.equal(res.tombstoneCount, 10);
});

test('5B-13/14 zero inline restante; 58 refs únicas dentro do verificado', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  // reexecuta a transformação via dry-run duplo não é possível (não expõe o
  // clone); valida pelo apply real em cópia: aqui, checa via segundo ctx.
  const ctx2 = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx2);
  const exp = expectedFor(ctx2);
  const res = await ctx2.applySnapshotMigrationCompaction({ expected: exp });
  assert.equal(res.ok, true, JSON.stringify(res.reason || res.detail || ''));
  const live = liveOf(ctx2);
  let remE = 0, remA = 0, remT = 0;
  const refs = [];
  for (const r of Object.values(live)) {
    const ex = r && r.structuralExecution;
    if (ex && (ex.beforeSnapshot || ex.afterSnapshot)) remE++;
    if (ex && ex.tombstone && ex.tombstone.previousSnapshot) remT++;
    if (ex && ex.snapshotStorage === 'external' && ex.snapshotRef) refs.push(ex.snapshotRef);
    for (const a of (r && Array.isArray(r.attempts) ? r.attempts : [])) {
      if (a && a.beforeSnapshot) remA++;
      if (a && a.snapshotStorage === 'external' && a.snapshotRef) refs.push(a.snapshotRef);
    }
  }
  assert.equal(remE, 0, 'zero executions inline');
  assert.equal(remA, 0, 'zero attempts inline');
  assert.equal(remT, 0, 'zero tombstones inline');
  assert.equal(refs.length, 58, '58 refs');
  assert.equal(new Set(refs).size, 58, '58 únicas');
});

test('5B-15 nenhuma mudança fora dos campos autorizados (projeção canônica)', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const proj = (revs) => ctx.canonicalJsonString(ctx.projectLesionRevisionsWithoutSnapshots(revs));
  const beforeProj = proj(liveOf(ctx));
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx) });
  assert.equal(res.ok, true);
  assert.equal(proj(liveOf(ctx)), beforeProj, 'só campos autorizados mudaram');
  assert.equal(Object.keys(liveOf(ctx)).length, 36, 'revisões preservadas');
});

test('5B-16 real não muda durante prepare/verify (inclui applies abortados)', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  const before = JSON.stringify(liveOf(ctx));
  await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true }); // aborta: remoto ausente
  await seedRemote58(ctx);
  await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true }); // ok, mas dry-run
  assert.equal(JSON.stringify(liveOf(ctx)), before, 'real intacto após prepares');
});

// ---------- apply all-or-none + persistência ----------

test('5B-17 apply troca tudo de uma vez (binding compactado)', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx) });
  assert.equal(res.ok, true, JSON.stringify({ reason:res.reason, detail:res.detail }));
  assert.equal(res.status, 'compacted');
  assert.equal(res.persistedLocal, true);
  assert.equal(res.syncRequested, true);
  const live = liveOf(ctx);
  const ex = live.r_exec_01.structuralExecution;
  assert.equal(ex.snapshotStorage, 'external');
  assert.equal(ex.snapshotRef, 'exec_t01');
  assert.equal(ex.beforeSnapshot, undefined);
  assert.equal(live.r_att_01.attempts[0].snapshotStorage, 'external');
});

test('5B-18 persistência local ocorre exatamente uma vez', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx) });
  assert.equal(ctx.__stats.revSets, 1, 'um único save de LESION_REVISIONS, sem saves por item');
});

test('5B-19 falha de persistência restaura o original (sem perda)', async () => {
  const backing = {};
  const ctx = applyCtx(buildFixture58(), { backing, failPersist: true });
  await seedRemote58(ctx);
  const before = JSON.stringify(liveOf(ctx));
  const remoteBefore = JSON.stringify(ctx.__fakeDocs);
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'persist_failed');
  assert.equal(JSON.stringify(liveOf(ctx)), before, 'binding restaurado');
  assert.equal(JSON.stringify(ctx.__fakeDocs), remoteBefore, 'remoto intocado');
});

test('5B-20 falha de sync externa não apaga snapshots (remoto só é lido)', async () => {
  const ctx = applyCtx(buildFixture58(), { failPersist: true });
  await seedRemote58(ctx);
  const remoteBefore = JSON.stringify(ctx.__fakeDocs);
  await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx) });
  assert.equal(JSON.stringify(ctx.__fakeDocs), remoteBefore, 'nenhum doc remoto tocado pelo apply');
  assert.doesNotMatch(fn('applySnapshotMigrationCompaction'), /\.delete\(/, 'apply nunca deleta');
});

test('5B-21 conflito remoto impede metadata compactada de chegar ao sync', async () => {
  const ctx = applyCtx(buildFixture58(), {});
  await seedRemote58(ctx);
  const key = 'snapshotStore/exec_t03';
  const doc = ctx.__fakeDocs[key];
  const payload = JSON.parse(doc.payloadJson);
  payload.beforeSnapshot.lesions.k.lesion.name = 'DIVERGIU';
  doc.payloadJson = JSON.stringify(payload);
  const res = await ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true });
  assert.equal(res.ok, false, 'aborta antes de compactar');
  // e a transação jamais sobrescreve: pin estático do abort
  assert.match(fn('writeShardedState'), /err\.code = 'snapshot_content_conflict'/, 'tx aborta em divergência');
});

// ---------- leitores pós-compact com flag FALSE ----------

const MODULE_START_B = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END_B = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSourceB = html.slice(html.indexOf(MODULE_START_B), html.indexOf(MODULE_END_B));
const canonSrcB = html.slice(html.indexOf('function canonicalJsonString('), html.indexOf('function deepStableEqual('));
const heavySourceB = html.slice(html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '), html.indexOf('function buildSnapshotMigrationPlan('));

function reviewCtxB(opts) {
  opts = opts || {};
  const backing = opts.backing || {};
  const fakeDocs = opts.fakeDocs || {};
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
    async set(key, value) { backing[key] = value; }
  };
  const fakeDb = {
    collection: (name) => ({
      doc: (id) => {
        const key = name + '/' + id;
        return {
          async set(data) { fakeDocs[key] = JSON.parse(JSON.stringify(data)); },
          async get() {
            const exists = Object.prototype.hasOwnProperty.call(fakeDocs, key);
            return { exists, data: () => (exists ? JSON.parse(JSON.stringify(fakeDocs[key])) : undefined) };
          }
        };
      }
    })
  };
  const context = {
    console, Date, Math, JSON, Object, Array, storage, __backing: backing, __fakeDocs: fakeDocs,
    fbDb: {}, FB_META_REF: () => ({ collection: fakeDb.collection }), navigator: { onLine: true },
    DATA: opts.data || [], saveDataCalls: []
  };
  context.saveData = () => { context.saveDataCalls.push(Date.now()); };
  context.syncDirtyCalls = 0; context.pushCalls = 0;
  context.markSyncDirty = async () => { context.syncDirtyCalls += 1; };
  context.pushToFirebase = () => { context.pushCalls += 1; };
  vm.createContext(context);
  vm.runInContext(moduleSourceB, context, { filename: 'lesion-review-5b.js' });
  vm.runInContext(canonSrcB + '\n' + heavySourceB, context, { filename: 'lesion-review-5b-heavy.js' });
  if (opts.flagOn) vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true;', context);
  return context;
}
function mkLesionB(id, notes) {
  return { id, name: 'L ' + id, s: 'S', site: 'T', tags: [], notes, classification: null, enTerm: '', img: '', images: [], links: [] };
}
// Cenário pós-compact: attempt externalizado, cache local FRIO, remoto com o
// envelope (como outro dispositivo / após reload sem cache).
async function compactedAttemptScenario() {
  const fakeDocs = {};
  const backing1 = {};
  const ctx = reviewCtxB({ data: [mkLesionB('seed_1', 'original')], flagOn: true, backing: backing1, fakeDocs });
  const created = ctx.createLesionReview('seed_1', 'pedido');
  const reviewId = created.review.id;
  ctx.setReviewSolution(reviewId, 'x', { notes: 'nova' });
  assert.equal(ctx.authorizeAndApplyReviewSolution(reviewId).ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const attemptId = created.review.attempts[0].id;
  assert.equal(created.review.attempts[0].snapshotStorage, 'external', 'setup: attempt externalizado');
  // publica o envelope no "remoto" a partir do cache local (papel do COPY)
  const cached = JSON.parse(backing1['atlas:snapshot:' + attemptId]);
  const enc = ctx.encodeSnapshotRecordForFirestore(cached);
  assert.equal(enc.ok, true);
  fakeDocs['snapshotStore/' + attemptId] = JSON.parse(JSON.stringify(enc.doc));
  // reload com cache frio: só a chave de revisões viaja
  const backing2 = { 'atlas:lesionRevisions': backing1['atlas:lesionRevisions'] };
  const ctx2 = reviewCtxB({ data: [mkLesionB('seed_1', 'original')], backing: backing2, fakeDocs });
  await ctx2.loadLesionRevisions();
  return { ctx2, reviewId, attemptId };
}

test('5B-22 reload pós-compact recupera snapshot externo (flag false, cache frio, via remoto)', async () => {
  const { ctx2, reviewId, attemptId } = await compactedAttemptScenario();
  const reloaded = vm.runInContext('LESION_REVISIONS', ctx2);
  const attempt = reloaded[reviewId].attempts[0];
  assert.equal(attempt.snapshotStorage, 'external', 'metadata externa sobreviveu ao reload');
  assert.equal(attempt.beforeSnapshot, undefined, 'nada inline');
  const snap = await ctx2.getReviewAttemptSnapshot(reloaded[reviewId], attempt);
  assert.equal(snap.ok, true, 'resolve via store remota: ' + (snap.reason || ''));
  assert.equal(snap.beforeSnapshot.notes, 'original');
});

test('5B-24 rollback de attempt funciona pós-compact (offline, via remoto)', async () => {
  const { ctx2, reviewId } = await compactedAttemptScenario();
  ctx2.DATA[0].notes = 'nova'; // DATA mutado persistido
  const rb = await ctx2.rollbackAppliedReviewSolution(reviewId, 'não funcionou');
  assert.equal(rb.ok, true, 'rollback: ' + rb.reason);
  assert.equal(ctx2.DATA[0].notes, 'original');
});

test('5B-25 flag false NÃO impede leitura externalizada (sync + async)', async () => {
  const { ctx2 } = await compactedAttemptScenario(); // ctx2 tem flag OFF por padrão
  assert.equal(vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED', ctx2), false);
  const reloaded = vm.runInContext('LESION_REVISIONS', ctx2);
  const rid = Object.keys(reloaded)[0];
  const attempt = reloaded[rid].attempts[0];
  const sync = ctx2.reviewAttemptSnapshotSync(attempt);
  assert.equal(sync.ok, false);
  assert.equal(sync.reason, 'not_loaded_yet', 'síncrono não quebra: sinaliza');
  const got = await ctx2.getReviewAttemptSnapshot(reloaded[rid], attempt);
  assert.equal(got.ok, true, 'assíncrono resolve com flag OFF');
  const syncEx = ctx2.structuralExecutionSnapshotsSync({ structuralExecution: { status: 'executed', snapshotStorage: 'external', snapshotRef: 'exec_x' } });
  assert.equal(syncEx.ok, false);
  assert.equal(syncEx.reason, 'not_loaded_yet');
});

test('5B-26 flag false continua criando NOVOS snapshots inline', async () => {
  const ctx = reviewCtxB({ data: [mkLesionB('seed_1', 'a')] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  ctx.setReviewSolution(review.id, 'x', { notes: 'b' });
  assert.equal(ctx.authorizeAndApplyReviewSolution(review.id).ok, true);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(review.attempts[0].beforeSnapshot, 'novo attempt nasce inline com flag OFF');
  assert.equal(review.attempts[0].snapshotStorage, undefined);
});

// ---------- rollback estrutural pós-compact ----------

const execNamesC = [
  'canonicalJsonString',
  'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'pushLesionReviewHistory',
  'structuralSnapshotLocalCacheKey', 'structuralSnapshotFirestoreRef',
  'computeDeterministicFingerprint', 'buildAtlasSnapshotRecord',
  'encodeSnapshotRecordForFirestore', 'decodeSnapshotRecordFromFirestore',
  'saveSnapshotToLocalCache', 'getSnapshotFromLocalCache',
  'saveSnapshotToFirestore', 'getSnapshotFromFirestore', 'getSnapshotFromStore',
  'structuralRestoreSnapshots', 'rollbackStructuralExecution'
];
const execSrcC = execNamesC.map(fn).join('\n');
const execConstsC = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const readersConstC = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));

test('5B-23 rollback estrutural funciona pós-compact (externo, via remoto)', async () => {
  const origKeeper = mkLesionB('seed_k', 'keeper original');
  const origRemove = mkLesionB('seed_r', 'clone original');
  const beforeSnapshot = {
    lesions: {
      seed_k: { index: 0, lesion: JSON.parse(JSON.stringify(origKeeper)) },
      seed_r: { index: 1, lesion: JSON.parse(JSON.stringify(origRemove)) }
    },
    maps: { review: {}, reviewStamps: {}, reviewProgress: {}, reviewOverride: {}, srs: {}, merges: {}, pendingAdds: {} }
  };
  const backing = {};
  const fakeDocs = {};
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found'); },
    async set(key, value) { backing[key] = value; }
  };
  const fakeDb = {
    collection: (name) => ({
      doc: (id) => {
        const key = name + '/' + id;
        return {
          async set(data) { fakeDocs[key] = JSON.parse(JSON.stringify(data)); },
          async get() {
            const exists = Object.prototype.hasOwnProperty.call(fakeDocs, key);
            return { exists, data: () => (exists ? JSON.parse(JSON.stringify(fakeDocs[key])) : undefined) };
          }
        };
      }
    })
  };
  const mergedKeeper = Object.assign(JSON.parse(JSON.stringify(origKeeper)), { name: 'keeper fundido' });
  const ctx = vm.createContext({
    DATA: [mergedKeeper], LESION_REVISIONS: {
      RC: { id: 'RC', lesionId: 'seed_k', status: 'accepted', requestText: 'fundir', manualAction: { type: 'x' }, history: [], createdAt: 1, updatedAt: 2,
        structuralPlan: { status: 'executed' },
        structuralExecution: { executionId: 'exec_c1', status: 'executed', type: 'merge_duplicates', at: '2026-01-01',
          affectedIds: ['seed_k', 'seed_r'], operations: ['merge'], executorVersion: 1,
          snapshotStorage: 'external', snapshotRef: 'exec_c1',
          tombstone: { removeId: 'seed_r', keeperId: 'seed_k', snapshotStorage: 'external', snapshotRef: 'exec_c1' } } }
    },
    REVIEW: {}, REVIEW_STAMPS: {}, REVIEW_PROGRESS: {}, REVIEW_OVERRIDE: {}, SRS: {}, LESION_MERGES: {}, PENDING_LOCAL_IMAGE_ADDS: {},
    storage, fbDb: {}, FB_META_REF: () => ({ collection: fakeDb.collection }), navigator: { onLine: true },
    saveData: async () => {}, structuralPersistAll: async () => {}, saveLesionRevisions: async () => {},
    console, Date, Math, JSON, Object, Array
  });
  vm.runInContext(execConstsC + '\n' + readersConstC + '\n' + codecConsts + '\n' + execSrcC, ctx, { filename: 'rollback-postcompact-test.js' });
  // publica o envelope no remoto (papel do COPY/VERIFY)
  const b = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'RC', executionId: 'exec_c1', beforeSnapshot, afterSnapshot: { lesions: {} } });
  assert.equal(b.ok, true);
  assert.equal((await ctx.saveSnapshotToFirestore(b.record)).ok, true);
  assert.equal(ctx.DATA.some((e) => e.id === 'seed_r'), false, 'setup: remove ausente pós-merge');
  const rb = await ctx.rollbackStructuralExecution('RC');
  assert.equal(rb.ok, true, 'rollback pós-compact: ' + rb.reason);
  assert.equal(ctx.DATA.find((e) => e.id === 'seed_k').notes, 'keeper original');
  assert.equal(ctx.DATA.find((e) => e.id === 'seed_r').notes, 'clone original');
});

// ---------- estáticos: sem auto-execução ----------

test('5B-27 nenhuma auto-migração no boot', () => {
  for (const name of ['loadData', 'saveData', 'syncFromFirebase', 'pushToFirebaseNow']) {
    const src = fn(name);
    for (const callee of ['buildSnapshotMigrationPlan(', 'copySnapshotMigrationItem(', 'verifySnapshotMigrationItem(', 'compactSnapshotMigrationPlan(', 'applySnapshotMigrationCompaction(']) {
      assert.doesNotMatch(src, new RegExp(callee.replace(/\(/g, '\\(')), name + ' não pode chamar ' + callee);
    }
  }
});

test('5B-28/29 apply real não possui call site automático', () => {
  assert.equal(html.split('applySnapshotMigrationCompaction(').length - 1, 1, 'só a definição existe no app');
});

test('5B-30 flag ON aborta o apply (gate) — nenhuma execução real fora de fixtures', () => {
  const ctx = applyCtx(buildFixture58(), {});
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true;', ctx);
  const before = JSON.stringify(liveOf(ctx));
  return ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true }).then((res) => {
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'flag_must_be_off');
    assert.equal(JSON.stringify(liveOf(ctx)), before, 'nada mutado com flag ON');
    assert.equal(ctx.__stats.sets, 0, 'nada persistido com flag ON');
  });
});

test('5B-30 flag ON aborta o apply (gate) — nenhuma execução real fora de fixtures', () => {
  const ctx = applyCtx(buildFixture58(), {});
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true;', ctx);
  const before = JSON.stringify(liveOf(ctx));
  return ctx.applySnapshotMigrationCompaction({ expected: expectedFor(ctx), dryRunOnly: true }).then((res) => {
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'flag_must_be_off');
    assert.equal(JSON.stringify(liveOf(ctx)), before, 'nada mutado com flag ON');
    assert.equal(ctx.__stats.sets, 0, 'nada persistido com flag ON');
  });
});

// ---------- correção 5B-fix: bytes UTF-8 reais + detecção por presença ----------

function utf8Reference(s) { return Buffer.byteLength(String(s), 'utf8'); } // implementação independente (Node)

test('5B-31 utf8ByteLength equivale a Blob.size / Buffer.byteLength', () => {
  const ctx = applyCtx(buildFixture58(), {});
  const cases = ['a', 'é', '€', '😀', 'lesão óssea — 日本語 🎯', 'plain ascii 123'];
  for (const s of cases) assert.equal(ctx.utf8ByteLength(s), utf8Reference(s), JSON.stringify(s));
  assert.equal(ctx.utf8ByteLength(''), 0);
});

// Fixture com multibyte real: length !== bytes.
function buildFixtureMultibyte() {
  const revs = {};
  revs.r_exec_mb = {
    id: 'r_exec_mb', lesionId: 'seed_mb', status: 'manual_action_required', requestText: 'fundir — ação já concluída 🎯',
    structuralExecution: { executionId: 'exec_mb', status: 'executed', type: 'merge_duplicates', at: '2026-01-01',
      affectedIds: ['seed_mb'], operations: ['merge'], executorVersion: 1,
      beforeSnapshot: { lesions: { seed_mb: { index: 0, lesion: snapLesion('seed_mb', 'Lesão óssea — 日本語') } },
        maps: { review: {}, reviewStamps: {}, reviewProgress: {}, reviewOverride: {}, srs: {}, merges: {}, pendingAdds: {} } },
      afterSnapshot: { lesions: {} },
      tombstone: { removeId: 'seed_x', keeperId: 'seed_mb', previousSnapshot: { lesions: {} }, timestamp: '2026-01-01', reviewId: 'r_exec_mb', executorVersion: 1 } },
    attempts: [Object.assign(mkAttempt('att_mb1', 'mb1'), { summary: 'ação executada ✅' })],
    history: [], createdAt: 1, updatedAt: 2
  };
  return revs;
}
function expectedForBytes(ctx) {
  const live = liveOf(ctx);
  const str = JSON.stringify(live);
  return {
    sourceFingerprint: ctx.computeDeterministicFingerprint(live),
    sourceBytes: utf8Reference(str), sourceLength: str.length,
    total: 2, structural: 1, attempts: 1, tombstones: 1
  };
}

test('5B-32 fixture multibyte: length difere de bytes; target usa bytes reais', async () => {
  const ctx = applyCtx(buildFixtureMultibyte(), {});
  await seedRemoteFor(ctx, 2);
  const exp = expectedForBytes(ctx);
  assert.ok(exp.sourceBytes > exp.sourceLength, 'a fixture precisa ter multibyte (bytes > length)');
  const res = await ctx.applySnapshotMigrationCompaction({ expected: exp });
  assert.equal(res.ok, true, JSON.stringify(res.reason || res.detail || ''));
  assert.equal(res.targetBytes, utf8Reference(JSON.stringify(liveOf(ctx))), 'target em bytes reais');
  assert.equal(res.targetBytes, Buffer.byteLength(JSON.stringify(liveOf(ctx)), 'utf8'));
  assert.equal(res.structuralCount, 1);
  assert.equal(res.attemptCount, 1);
  assert.equal(res.tombstoneCount, 1);
  const ex = liveOf(ctx).r_exec_mb.structuralExecution;
  assert.equal(ex.snapshotStorage, 'external');
  assert.equal(ex.snapshotRef, 'exec_mb');
});

test('5B-33 gate sourceBytes usa bytes reais (length multibyte aborta)', async () => {
  const ctx = applyCtx(buildFixtureMultibyte(), {});
  await seedRemoteFor(ctx, 2);
  const exp = expectedForBytes(ctx);
  const okRes = await ctx.applySnapshotMigrationCompaction({ expected: exp, dryRunOnly: true });
  assert.equal(okRes.ok, true, 'com bytes reais passa');
  const wrong = Object.assign({}, exp, { sourceBytes: exp.sourceLength }); // string.length, não bytes
  const bad = await ctx.applySnapshotMigrationCompaction({ expected: wrong, dryRunOnly: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'source_bytes_mismatch');
});

test('5B-34 campos null/falsey explícitos são detectados por presença e abortam', async () => {
  // attempt com beforeSnapshot:null explícito (fora do plano por truthiness,
  // mas presente para a varredura hasOwnProperty do clone).
  const revs = {};
  revs.r_exec_n = {
    id: 'r_exec_n', lesionId: 'seed_n', status: 'manual_action_required', requestText: 'x',
    structuralExecution: { executionId: 'exec_n', status: 'executed', type: 'merge_duplicates', at: '2026-01-01',
      affectedIds: ['seed_n'], operations: ['merge'], executorVersion: 1,
      beforeSnapshot: { lesions: {} }, afterSnapshot: { lesions: {} } },
    attempts: [Object.assign(mkAttempt('att_null1', 'n1'), { beforeSnapshot: null })],
    history: [], createdAt: 1, updatedAt: 2
  };
  const ctx = applyCtx(revs, {});
  await seedRemoteFor(ctx, 1);
  const live = liveOf(ctx);
  const str = JSON.stringify(live);
  const exp = { sourceFingerprint: ctx.computeDeterministicFingerprint(live), sourceBytes: utf8Reference(str), total: 1, structural: 1, attempts: 0, tombstones: 0 };
  const before = JSON.stringify(live);
  const res = await ctx.applySnapshotMigrationCompaction({ expected: exp, dryRunOnly: true });
  assert.equal(res.ok, false, 'campo null explícito não passa batido');
  assert.equal(res.reason, 'clone_validation_failed');
  assert.deepEqual(plain(res.detail.remainingInline), { exec: 0, att: 1, tomb: 0 });
  assert.equal(JSON.stringify(liveOf(ctx)), before, 'nada mutado');
  // tombstone com previousSnapshot:null explícito: mesma detecção.
  const revs2 = {};
  revs2.r_exec_t = {
    id: 'r_exec_t', lesionId: 'seed_t', status: 'manual_action_required', requestText: 'x',
    structuralExecution: { executionId: 'exec_t', status: 'executed', type: 'merge_duplicates', at: '2026-01-01',
      affectedIds: ['seed_t'], operations: ['merge'], executorVersion: 1,
      beforeSnapshot: { lesions: {} }, afterSnapshot: { lesions: {} },
      tombstone: { removeId: 'a', keeperId: 'b', previousSnapshot: null } },
    attempts: [], history: [], createdAt: 1, updatedAt: 2
  };
  const ctx2 = applyCtx(revs2, {});
  await seedRemoteFor(ctx2, 1);
  const live2 = liveOf(ctx2);
  const str2 = JSON.stringify(live2);
  const exp2 = { sourceFingerprint: ctx2.computeDeterministicFingerprint(live2), sourceBytes: utf8Reference(str2), total: 1, structural: 1, attempts: 0, tombstones: 0 };
  const res2 = await ctx2.applySnapshotMigrationCompaction({ expected: exp2, dryRunOnly: true });
  assert.equal(res2.ok, false, 'tombstone null explícito não passa batido');
  assert.equal(res2.reason, 'clone_validation_failed');
});

// Semeia N itens do plano no Firestore falso (para fixtures pequenas).
async function seedRemoteFor(ctx, n) {
  const plan = ctx.buildSnapshotMigrationPlan();
  assert.equal(plan.totalCount, n);
  for (const item of plan.items) {
    const b = ctx.buildAtlasSnapshotRecord({ kind: item.kind, reviewId: item.reviewId,
      executionId: item.kind === 'structural_execution' ? item.executionId : undefined,
      attemptId: item.kind === 'review_attempt' ? item.attemptId : undefined,
      beforeSnapshot: item.beforeSnapshot, afterSnapshot: item.afterSnapshot });
    assert.equal(b.ok, true);
    assert.equal((await ctx.saveSnapshotToFirestore(b.record)).ok, true);
  }
  return plan;
}
