'use strict';

/* BLOCO A — infraestrutura ADITIVA para a nova coleção de LESION_REVISIONS
 * (atlas_state/main/lesionRevisions/{reviewId}). Este arquivo testa SÓ as
 * funções novas (getLesionRevisionsCollectionRef, readLegacyLesionRevisionsChunks,
 * readLesionRevisionsCollection, writeLesionRevisionDocument,
 * writeLesionRevisionBatch, readLesionRevisionsWithFallback,
 * migrateLesionRevisionsLocalToCollection, validateLesionRevisionCollectionAgainstLocal),
 * isoladas do pipeline real (writeShardedState/readShardedState/
 * reconcileBeforePush/pushToFirebase/mergeLesionRevisions) — nenhum deles é
 * extraído ou usado aqui, exatamente porque o Bloco A nunca os chama.
 * Nenhuma migração acontece contra o Firestore publicado: tudo roda contra
 * um Firestore falso em memória, criado e destruído por teste.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{', `Bloco nao inicia em { na posicao ${openingBrace}`);
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = openingBrace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(openingBrace, i + 1); }
  }
  throw new Error('Bloco sem fechamento');
}
function extractFunction(source, name) {
  const decl = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  assert.ok(decl, 'função não encontrada: ' + name);
  const ob = source.indexOf('{', decl.index + decl[0].length);
  const block = extractBlock(source, ob);
  return { source: source.slice(decl.index, ob) + block, body: block.slice(1, -1), index: decl.index };
}
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start);
  return html.slice(a, b);
}

// BLOCO A inteiro, como um único trecho contíguo (é exatamente como foi
// inserido no index.html) — evita extrair 8 funções uma a uma à mão.
const BLOCO_A_START = 'function getLesionRevisionsCollectionRef(){';
const BLOCO_A_END = '/* envia o estado atual pra nuvem';
const blocoASource = sliceBetween(BLOCO_A_START, BLOCO_A_END);

const withFirebaseTimeoutFn = extractFunction(html, 'withFirebaseTimeout');
const stripUndefinedDeepFn = extractFunction(html, 'stripUndefinedDeep');
const canonicalJsonStringFn = extractFunction(html, 'canonicalJsonString');
const structuralSnapshotProgressFromFirestoreFn = extractFunction(html, 'structuralSnapshotProgressFromFirestore');

const fullSource = [withFirebaseTimeoutFn.source, stripUndefinedDeepFn.source, canonicalJsonStringFn.source,
  structuralSnapshotProgressFromFirestoreFn.source, blocoASource].join('\n');

// Firestore falso — só o suficiente para o Bloco A. Note que o ref de chunk
// legado NÃO expõe `.set`/`.delete`: se alguma função do Bloco A tentasse
// escrever ali (regressão), o teste quebraria com um TypeError explícito,
// não silenciosamente.
function makeFakeCloud() {
  let main = null; // { exists, data }
  const collectionDocs = new Map(); // reviewId -> payload
  const legacyChunks = new Map(); // i -> {entries}
  return {
    setMain(data) { main = { exists: true, data }; },
    setLegacyChunk(i, entries) { legacyChunks.set(i, { entries }); },
    collectionDocs, legacyChunks,
    FB_META_REF() {
      return {
        get: async () => (main ? { exists: true, data: () => main.data } : { exists: false, data: () => undefined }),
        collection(name) {
          assert.equal(name, 'lesionRevisions', 'o Bloco A só deve usar a subcoleção lesionRevisions');
          return {
            doc(id) {
              return {
                get: async () => (collectionDocs.has(id) ? { exists: true, data: () => collectionDocs.get(id) } : { exists: false, data: () => undefined }),
                set: async (payload) => { collectionDocs.set(id, payload); }
              };
            },
            get: async () => {
              const entries = Array.from(collectionDocs.entries()).map(([id, data]) => ({ id, data: () => data }));
              return { forEach: (fn) => entries.forEach(fn) };
            }
          };
        }
      };
    },
    FB_LESION_REVISIONS_CHUNK_REF(i) {
      return {
        get: async () => (legacyChunks.has(i) ? { exists: true, data: () => legacyChunks.get(i) } : { exists: false, data: () => undefined })
      };
    }
  };
}

function ctxFixture() {
  const cloud = makeFakeCloud();
  const batchCalls = [];
  const fbDb = {
    batch() {
      const ops = [];
      batchCalls.push(ops);
      return {
        set(ref, data) { ops.push([ref, data]); },
        commit: async () => { for (const [ref, data] of ops) await ref.set(data); }
      };
    }
  };
  const ctx = vm.createContext({
    console,
    setTimeout, clearTimeout,
    LESION_REVISIONS: {},
    DATA: ['SENTINEL_DATA_NUNCA_TOCADO'],
    fbDb,
    FB_META_REF: cloud.FB_META_REF,
    FB_LESION_REVISIONS_CHUNK_REF: cloud.FB_LESION_REVISIONS_CHUNK_REF
  });
  vm.runInContext(fullSource, ctx, { filename: 'lesion-revisions-collection-test.js' });
  ctx.__cloud = cloud;
  ctx.__batchCalls = batchCalls;
  return ctx;
}

function review(over) {
  return Object.assign({
    id: 'lrev_placeholder', lesionId: 'seed_900', status: 'proposed',
    createdAt: 1000, updatedAt: 1000, requestText: 'corrigir',
    history: [{ timestamp: 1000, action: 'created' }],
    attempts: [{ id: 'att1', appliedAt: 1000 }],
    solution: { notes: 'nova nota' },
    humanFeedback: [{ at: 1000, text: 'ok' }]
  }, over || {});
}

// ===========================================================================
// A-F — migração preserva identidade e conteúdo integralmente
// ===========================================================================
test('A. doc id da coleção nova é exatamente o reviewId (nunca seed_N/lesionId)', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS = { lrev_x1: review({ id: 'lrev_x1', lesionId: 'seed_900' }) };
  const res = await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(ctx.__cloud.collectionDocs.has('lrev_x1'));
  assert.equal(ctx.__cloud.collectionDocs.has('seed_900'), false);
});

test('B. migração preserva o objeto da revisão integralmente (campo a campo)', async () => {
  const ctx = ctxFixture();
  const r = review({ id: 'lrev_x1' });
  ctx.LESION_REVISIONS = { lrev_x1: r };
  await ctx.migrateLesionRevisionsLocalToCollection();
  const stored = ctx.__cloud.collectionDocs.get('lrev_x1');
  assert.equal(JSON.stringify(stored), JSON.stringify(r));
});

test('C. history preservado', async () => {
  const ctx = ctxFixture();
  const r = review({ id: 'lrev_x1', history: [{ timestamp: 1, action: 'created' }, { timestamp: 2, action: 'proposed' }] });
  ctx.LESION_REVISIONS = { lrev_x1: r };
  await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(JSON.stringify(ctx.__cloud.collectionDocs.get('lrev_x1').history), JSON.stringify(r.history));
});

test('D. attempts preservado', async () => {
  const ctx = ctxFixture();
  const r = review({ id: 'lrev_x1', attempts: [{ id: 'a1', appliedAt: 10 }, { id: 'a2', appliedAt: 20 }] });
  ctx.LESION_REVISIONS = { lrev_x1: r };
  await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(JSON.stringify(ctx.__cloud.collectionDocs.get('lrev_x1').attempts), JSON.stringify(r.attempts));
});

test('E. solution preservado', async () => {
  const ctx = ctxFixture();
  const r = review({ id: 'lrev_x1', solution: { notes: 'texto X', tags: ['a', 'b'] } });
  ctx.LESION_REVISIONS = { lrev_x1: r };
  await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(JSON.stringify(ctx.__cloud.collectionDocs.get('lrev_x1').solution), JSON.stringify(r.solution));
});

test('F. structuralExecution preservado', async () => {
  const ctx = ctxFixture();
  const r = review({ id: 'lrev_x1', structuralExecution: { status: 'executed', at: '2026-10-07T00:00:00.000Z', snapshotStorage: 'external', snapshotRef: 'snap_1' } });
  ctx.LESION_REVISIONS = { lrev_x1: r };
  await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(JSON.stringify(ctx.__cloud.collectionDocs.get('lrev_x1').structuralExecution), JSON.stringify(r.structuralExecution));
});

// ===========================================================================
// G-H — limite de 500 por lote
// ===========================================================================
test('G. batches respeitam o limite de 500 (500 exatos cabem em 1 lote; 501 exige 2)', async () => {
  const ctx = ctxFixture();
  const entries500 = Array.from({ length: 500 }, (_, i) => ({ reviewId: 'lrev_' + i, review: review({ id: 'lrev_' + i }) }));
  const res500 = await ctx.writeLesionRevisionBatch(entries500);
  assert.equal(res500.written, 500);
  assert.equal(res500.batchCount, 1);

  const ctx2 = ctxFixture();
  const entries501 = Array.from({ length: 501 }, (_, i) => ({ reviewId: 'lrev_' + i, review: review({ id: 'lrev_' + i }) }));
  const res501 = await ctx2.writeLesionRevisionBatch(entries501);
  assert.equal(res501.written, 501);
  assert.equal(res501.batchCount, 2);
});

test('H. 1278 revisões (número real do Atlas publicado) geram exatamente 3 lotes', async () => {
  const ctx = ctxFixture();
  const entries = Array.from({ length: 1278 }, (_, i) => ({ reviewId: 'lrev_' + i, review: review({ id: 'lrev_' + i }) }));
  const res = await ctx.writeLesionRevisionBatch(entries);
  assert.equal(res.written, 1278);
  assert.equal(res.batchCount, 3); // 500 + 500 + 278
  assert.equal(ctx.__cloud.collectionDocs.size, 1278);
});

// ===========================================================================
// I — idempotência
// ===========================================================================
test('I. migração é idempotente: rodar duas vezes sem mudança local não reescreve nada na 2ª vez', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS = { lrev_1: review({ id: 'lrev_1' }), lrev_2: review({ id: 'lrev_2' }) };
  const first = await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(first.ok, true);
  assert.equal(first.writtenNow, 2);
  const second = await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(second.ok, true);
  assert.equal(second.writtenNow, 0, 'nada deveria ser regravado — já está idêntico');
  assert.equal(second.alreadyPresent, 2);
  assert.equal(second.conflicts.length, 0);
});

// ===========================================================================
// J-L — leitura com fallback (nunca mistura)
// ===========================================================================
test('J. coleção vazia/ausente → cai pro fallback legado', async () => {
  const ctx = ctxFixture();
  ctx.__cloud.setMain({ lesionRevisionsChunkCount: 1 });
  ctx.__cloud.setLegacyChunk(0, { lrev_legacy: review({ id: 'lrev_legacy' }) });
  const res = await ctx.readLesionRevisionsWithFallback();
  assert.equal(res.source, 'legacy_chunks');
  assert.deepEqual(Object.keys(res.lesionRevisions), ['lrev_legacy']);
});

test('K. coleção existente → usa a coleção (nunca o legado, mesmo que ambos tenham dados)', async () => {
  const ctx = ctxFixture();
  ctx.__cloud.collectionDocs.set('lrev_new', review({ id: 'lrev_new' }));
  ctx.__cloud.setMain({ lesionRevisionsChunkCount: 1 });
  ctx.__cloud.setLegacyChunk(0, { lrev_legacy: review({ id: 'lrev_legacy' }) });
  const res = await ctx.readLesionRevisionsWithFallback();
  assert.equal(res.source, 'collection');
  assert.deepEqual(Object.keys(res.lesionRevisions), ['lrev_new']);
});

test('L. nunca mistura silenciosamente coleção + legado (resultado é SEMPRE um dos dois, nunca união)', async () => {
  const ctx = ctxFixture();
  ctx.__cloud.collectionDocs.set('lrev_R1', review({ id: 'lrev_R1' }));
  ctx.__cloud.setMain({ lesionRevisionsChunkCount: 1 });
  ctx.__cloud.setLegacyChunk(0, { lrev_R2: review({ id: 'lrev_R2' }) });
  const res = await ctx.readLesionRevisionsWithFallback();
  assert.equal(res.source, 'collection');
  assert.ok(res.lesionRevisions.lrev_R1, 'R1 (da coleção) precisa estar presente');
  assert.equal(res.lesionRevisions.lrev_R2, undefined, 'R2 (só do legado) NUNCA pode aparecer — provaria união silenciosa');
});

// ===========================================================================
// M-P — validador 1:1 detecta toda divergência
// ===========================================================================
test('M-P. validador 1:1 detecta ausentes, extras e diferentes, e devolve ok:false', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS = {
    R1: review({ id: 'R1', solution: { notes: 'igual' } }),
    R2: review({ id: 'R2', solution: { notes: 'versão local' } }),
    R3: review({ id: 'R3' }) // nunca migrado — vai faltar na coleção
  };
  ctx.__cloud.collectionDocs.set('R1', review({ id: 'R1', solution: { notes: 'igual' } })); // idêntico
  ctx.__cloud.collectionDocs.set('R2', review({ id: 'R2', solution: { notes: 'versão remota — DIFERENTE' } })); // diverge
  ctx.__cloud.collectionDocs.set('R4', review({ id: 'R4' })); // só existe na coleção — extra

  const report = await ctx.validateLesionRevisionCollectionAgainstLocal();
  assert.equal(report.ok, false);
  assert.equal(report.localCount, 3);
  assert.equal(report.remoteCount, 3);
  assert.equal(report.equalCount, 1);
  // JSON.stringify em vez de assert.deepEqual: arrays construídas dentro do
  // contexto vm não são reference-equal às do realm externo mesmo com
  // conteúdo idêntico (mesma classe de falso-negativo já vista em outros
  // arquivos de teste deste projeto).
  assert.equal(JSON.stringify(report.missingIds), JSON.stringify(['R3']));   // N
  assert.equal(JSON.stringify(report.extraIds), JSON.stringify(['R4']));     // O
  assert.equal(JSON.stringify(report.differentIds), JSON.stringify(['R2'])); // P
});

test('validador 1:1 devolve ok:true quando tudo está idêntico', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS = { R1: review({ id: 'R1' }), R2: review({ id: 'R2' }) };
  ctx.__cloud.collectionDocs.set('R1', review({ id: 'R1' }));
  ctx.__cloud.collectionDocs.set('R2', review({ id: 'R2' }));
  const report = await ctx.validateLesionRevisionCollectionAgainstLocal();
  assert.equal(report.ok, true);
  assert.equal(report.equalCount, 2);
  assert.equal(report.missingIds.length, 0);
  assert.equal(report.extraIds.length, 0);
  assert.equal(report.differentIds.length, 0);
});

// ===========================================================================
// Q-V — isolamento total do pipeline real
// ===========================================================================
test('Q. DATA nunca é alterado pelo Bloco A (migração, validação e leitura com fallback)', async () => {
  const ctx = ctxFixture();
  const before = JSON.stringify(ctx.DATA);
  ctx.LESION_REVISIONS = { R1: review({ id: 'R1' }) };
  await ctx.migrateLesionRevisionsLocalToCollection();
  await ctx.validateLesionRevisionCollectionAgainstLocal();
  await ctx.readLesionRevisionsWithFallback();
  assert.equal(JSON.stringify(ctx.DATA), before);
});

test('R. nenhum chunk legado é escrito pela migração (o fake nem expõe set/delete nesse ref — regressão quebraria com TypeError)', async () => {
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS = { R1: review({ id: 'R1' }) };
  const before = new Map(ctx.__cloud.legacyChunks);
  await ctx.migrateLesionRevisionsLocalToCollection();
  assert.deepEqual(Array.from(ctx.__cloud.legacyChunks.entries()), Array.from(before.entries()));
});

test('S-U. ESTÁTICO: o Bloco A nunca chama writeShardedState/reconcileBeforePush/pushToFirebase/mergeLesionRevisions', () => {
  for (const forbidden of ['writeShardedState', 'reconcileBeforePush', 'pushToFirebase', 'mergeLesionRevisions']) {
    assert.doesNotMatch(blocoASource, new RegExp('\\b' + forbidden + '\\s*\\('), 'Bloco A não pode chamar ' + forbidden + '()');
  }
});

test('V. seed_N nunca é usado como identidade de documento (ESTÁTICO + comportamental)', async () => {
  assert.doesNotMatch(blocoASource, /\bseed_N\b|lesionId\s*\)\s*\.set|collectionRef\(lesion|\.doc\(lesion/i);
  const ctx = ctxFixture();
  ctx.LESION_REVISIONS = { lrev_abc: review({ id: 'lrev_abc', lesionId: 'seed_12345' }) };
  await ctx.migrateLesionRevisionsLocalToCollection();
  assert.equal(ctx.__cloud.collectionDocs.has('seed_12345'), false);
  assert.ok(ctx.__cloud.collectionDocs.has('lrev_abc'));
});

// ===========================================================================
// W — nenhuma execução automática
// ===========================================================================
test('W. migrateLesionRevisionsLocalToCollection nunca roda automaticamente (não há call site além da própria definição)', () => {
  const occurrences = html.split('migrateLesionRevisionsLocalToCollection(').length - 1;
  assert.equal(occurrences, 1, 'a função só pode aparecer na própria declaração — nenhum call site automático (boot, loadData, etc.)');
  assert.doesNotMatch(html.slice(html.indexOf('async function loadData('), html.indexOf('async function loadData(') + 8000),
    /migrateLesionRevisionsLocalToCollection/, 'loadData() não pode disparar a migração');
});
