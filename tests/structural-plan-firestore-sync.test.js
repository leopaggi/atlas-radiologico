'use strict';

// BUG REAL: após executar o Teratoma, o sync falhava com
// "Arrays aninhados no payload Firestore:
//  atlas_state/main.lesionRevisions.lrev_....structuralExecution.
//  beforeSnapshot.maps.reviewProgress.seed_206.a[0]".
// Causa: beforeSnapshot.maps.reviewProgress carrega as tuplas locais do Quiz
// [t,ok,graded], e o codec {t,ok,graded} só era aplicado ao reviewProgress
// top-level — nunca ao embutido no snapshot.
// Correção: structuralSnapshotProgressToFirestore/FromFirestore centralizados
// nos choke points de escrita/leitura. O validator continua ativo.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
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

const names = ['canonicalJsonString', 'stripUndefinedDeep', 'mergeLesionRevisions',
  'normalizeReviewProgress', 'normalizeReviewProgressEntry', 'foldReviewProgress', 'normalizeReviewAttempts',
  'reviewProgressToFirestore', 'reviewProgressFromFirestore',
  'structuralSnapshotProgressToFirestore', 'structuralSnapshotProgressFromFirestore',
  'findNestedArrayPaths', 'syncFailureStatus', 'normalizeLesionMerges'];
const src = names.map(fn).join('\n');
const ATTEMPTS_MAX = 'const REVIEW_ATTEMPTS_MAX = 8;\n';

function ctxFixture() {
  const ctx = vm.createContext({ console });
  vm.runInContext(ATTEMPTS_MAX + src, ctx, { filename: 'firestore-sync-test.js' });
  return ctx;
}

// Lesão rica: tudo que um snapshot real carrega (só arrays de objetos/strings).
function richKeeper() {
  return { id: 'seed_206', name: 'Teratoma maduro (cisto dermoide)', s: 'Pelve Feminina', site: 'Ovário',
    notes: 'n', classification: 'O-RADS', tags: ['teratoma', 'dermoide'], enTerm: 'mature cystic teratoma',
    images: [
      { assetId: 'A206', data: 'https://res.cloudinary.com/x/A206.jpg', source: 'cloudinary', label: 'TC', lesionId: 'seed_206', lesionName: 'Teratoma maduro (cisto dermoide)', mergedFromLesionId: 'seed_575' },
      { assetId: 'A575', data: 'https://res.cloudinary.com/x/A575.jpg', source: 'cloudinary', label: 'US', lesionId: 'seed_206', lesionName: 'Teratoma maduro (cisto dermoide)', mergedFromLesionId: 'seed_575' }
    ],
    links: [{ label: 'caso', url: 'https://example.com/a' }],
    clinicalCases: [{ id: 'c1', title: 'caso 1', presentation: 'p', imageRefs: [{ imageId: 'A206', order: 0 }] }],
    radiologicSigns: [{ id: 's1', title: 'sinal' }],
    classificationSchemes: [{ id: 'k1', title: 'O-RADS' }],
    altPlacements: [{ s: 'Pelve Feminina', site: 'Tuba uterina' }],
    _userUpdatedAt: 200 };
}

// Estado REAL pós-execução do Teratoma (tuplas normalizadas, como no app).
const RID = 'lrev_muhmzdmv_6rak3k';
function teratomaExecuted(progressTuples) {
  const maps = {
    review: { seed_206: 2 }, reviewStamps: { seed_206: 1500 },
    reviewProgress: { seed_206: { b: 1, f: 0, a: progressTuples || [[1711111111111, 1, 1], [1711112222222, 0, 1]] } },
    reviewOverride: { seed_206: { m: 1, s: 2, at: 1500 } },
    srs: { seed_206: { level: 2 } }, merges: {}, pendingAdds: {}
  };
  return { id: RID, lesionId: 'seed_206', status: 'accepted',
    requestText: 'Teratoma duplicado', manualAction: { type: 'duplicate_merge', description: 'x' },
    createdAt: 1000, updatedAt: 3000, completedAt: 3000, resolvedManually: true,
    history: [
      { timestamp: 1500, action: 'structural_plan_imported', details: { type: 'merge_duplicates' } },
      { timestamp: 1600, action: 'structural_plan_accepted', details: { type: 'merge_duplicates' } },
      { timestamp: 3000, action: 'structural_plan_executed', details: { type: 'merge_duplicates', executionId: 'exec_teratoma1' } },
      { timestamp: 3000, action: 'manually_resolved', details: { previousStatus: 'manual_action_required' } }
    ],
    structuralPlan: { status: 'executed', importedAt: '2026-09-27T00:00:00.000Z', decidedAt: '2026-09-27T00:02:00.000Z',
      type: 'merge_duplicates',
      resolution: { reviewId: RID, valid: true, type: 'merge_duplicates',
        keeperId: 'seed_206', removeId: 'seed_575',
        keeperName: 'Teratoma maduro (cisto dermoide)', removeName: 'Teratoma cístico maduro',
        merge: { name: 'Teratoma maduro (cisto dermoide)', tags: ['teratoma'], preserveAliases: ['cisto dermoide'], transferImages: true },
        reasoning: 'x' },
      snapshot: { createdAt: '2026-09-27T00:00:00.000Z', lesions: { seed_206: { index: 0 }, seed_575: { index: 1 } } } },
    structuralExecution: { executionId: 'exec_teratoma1', status: 'executed', type: 'merge_duplicates', at: '2026-09-27T00:03:00.000Z',
      affectedIds: ['seed_206', 'seed_575'], operations: ['transfer_data_to_keeper', 'remove_lesion_record'],
      tombstone: { removeId: 'seed_575', keeperId: 'seed_206', previousName: 'Teratoma cístico maduro', timestamp: '2026-09-27T00:03:00.000Z', reviewId: RID },
      beforeSnapshot: { lesions: { seed_206: { index: 0, lesion: richKeeper() } }, maps,
        reviewLesionIds: [{ reviewId: RID, lesionId: 'seed_575' }] },
      afterSnapshot: { lesions: { seed_206: { index: 0, lesion: richKeeper() } } },
      executorVersion: 'fase3-v1' } };
}

// Payload como o writeShardedState monta (mesma ordem de operações).
function firestorePayload(ctx, revs) {
  return vm.runInContext(
    'stripUndefinedDeep({ lesionRevisions: structuralSnapshotProgressToFirestore(mergeLesionRevisions(' +
    JSON.stringify(revs) + ', {})) })', ctx);
}
function nestedPaths(ctx, payload) {
  ctx.__p = payload;
  return vm.runInContext('findNestedArrayPaths(__p, "atlas_state/main")', ctx);
}
// assert/strict deepEqual é reference-strict entre realms: vazio = length 0.
function nestedCount(ctx, payload) {
  return nestedPaths(ctx, payload).length;
}
const jstr = (v) => JSON.stringify(v);

test('1. review simples continua sincronizando', () => {
  const ctx = ctxFixture();
  const revs = { R1: { id: 'R1', lesionId: 'seed_1', status: 'manual_action_required', requestText: 'x', history: [], createdAt: 1, updatedAt: 1 } };
  assert.equal(nestedCount(ctx, firestorePayload(ctx, revs)), 0);
});

test('2+3. structuralPlan imported/accepted sincroniza', () => {
  const ctx = ctxFixture();
  for (const st of ['imported', 'accepted']) {
    const r = teratomaExecuted();
    r.status = 'manual_action_required'; delete r.completedAt; delete r.resolvedManually;
    r.structuralPlan.status = st; delete r.structuralExecution;
    assert.equal(nestedCount(ctx, firestorePayload(ctx, { [RID]: r })), 0, st);
  }
});

test('4+5+6. executed + before/afterSnapshot sincronizam', () => {
  const ctx = ctxFixture();
  const payload = firestorePayload(ctx, { [RID]: teratomaExecuted() });
  assert.equal(nestedCount(ctx, payload), 0, 'validator limpo com execução completa');
  const wire = payload.lesionRevisions[RID].structuralExecution.beforeSnapshot.maps.reviewProgress.seed_206.a;
  assert.equal(wire[0].t, 1711111111111, 'fronteira usa objetos {t,ok,graded}');
  assert.ok(payload.lesionRevisions[RID].structuralExecution.afterSnapshot.lesions.seed_206.lesion, 'after intacto');
});

test('7. tags/aliases sincronizam', () => {
  const ctx = ctxFixture();
  const payload = firestorePayload(ctx, { [RID]: teratomaExecuted() });
  const m = payload.lesionRevisions[RID].structuralPlan.resolution.merge;
  assert.equal(jstr(JSON.parse(JSON.stringify(m.tags))), jstr(['teratoma']));
  assert.equal(jstr(JSON.parse(JSON.stringify(m.preserveAliases))), jstr(['cisto dermoide']));
});

test('8. imagens/links/cases/signs/classifications no snapshot não quebram', () => {
  const ctx = ctxFixture();
  const payload = firestorePayload(ctx, { [RID]: teratomaExecuted() });
  assert.equal(nestedCount(ctx, payload), 0);
  const lesion = payload.lesionRevisions[RID].structuralExecution.beforeSnapshot.lesions.seed_206.lesion;
  assert.equal(lesion.images.length, 2);
  assert.equal(lesion.clinicalCases[0].imageRefs.length, 1);
  assert.equal(lesion.links.length, 1);
});

test('9. rollback metadata sincroniza', () => {
  const ctx = ctxFixture();
  const r = teratomaExecuted();
  r.structuralExecution.status = 'rolledback';
  r.structuralExecution.rolledbackAt = '2026-09-27T00:04:00.000Z';
  r.structuralPlan.status = 'rolledback';
  const payload = firestorePayload(ctx, { [RID]: r });
  assert.equal(nestedCount(ctx, payload), 0);
  assert.equal(payload.lesionRevisions[RID].structuralExecution.rolledbackAt, '2026-09-27T00:04:00.000Z');
});

test('10. roundtrip serialize→deserialize preserva conteúdo', () => {
  const ctx = ctxFixture();
  const local = { [RID]: teratomaExecuted() };
  const wire = firestorePayload(ctx, local);
  const back = vm.runInContext('structuralSnapshotProgressFromFirestore(' + JSON.stringify(wire.lesionRevisions) + ')', ctx);
  const before = JSON.parse(JSON.stringify(local[RID].structuralExecution.beforeSnapshot.maps.reviewProgress));
  assert.equal(jstr(back[RID].structuralExecution.beforeSnapshot.maps.reviewProgress), jstr(before), 'tuplas restauradas');
  assert.equal(jstr(back[RID].structuralPlan), jstr(local[RID].structuralPlan), 'plano intacto');
  assert.equal(jstr(back[RID].structuralExecution.tombstone), jstr(local[RID].structuralExecution.tombstone), 'tombstone intacto');
});

test('11. execução local mais nova vence remoto pré-execução', () => {
  const ctx = ctxFixture();
  const local = { [RID]: teratomaExecuted() };
  const remote = JSON.parse(JSON.stringify(local));
  // Remoto parou no accepted (forma JÁ codificada da nuvem) + edição concorrente mais nova.
  // decidedAt do aceite é ANTERIOR ao da execução real (execute sempre recarimba).
  remote[RID].structuralPlan.status = 'accepted';
  remote[RID].structuralPlan.decidedAt = '2026-09-27T00:01:00.000Z';
  delete remote[RID].structuralExecution;
  remote[RID].updatedAt = Date.now() + 100000;
  const wireRemote = vm.runInContext('structuralSnapshotProgressToFirestore(' + JSON.stringify(remote) + ')', ctx);
  const decodedRemote = vm.runInContext('structuralSnapshotProgressFromFirestore(' + JSON.stringify(wireRemote) + ')', ctx);
  ctx.__local = local; ctx.__remote = decodedRemote;
  const merged = vm.runInContext('mergeLesionRevisions(__local, __remote)', ctx);
  assert.equal(merged[RID].structuralPlan.status, 'executed');
  assert.equal(merged[RID].structuralExecution.executionId, 'exec_teratoma1');
});

test('12+13+14. sync não ressuscita removeId; keeper preservado', () => {
  const ctx = ctxFixture();
  const local = { [RID]: teratomaExecuted() };
  const merged = vm.runInContext('mergeLesionRevisions(' + JSON.stringify(local) + ', {})', ctx);
  assert.equal(merged[RID].lesionId, 'seed_206', 'revisão segue no keeper');
  assert.equal(merged[RID].structuralExecution.tombstone.removeId, 'seed_575');
  const merges = vm.runInContext('stripUndefinedDeep({seed_575:{into:"seed_206",at:1,group:"structural:' + RID + '"}})', ctx);
  assert.equal(nestedCount(ctx, { lesionMerges: merges }), 0, 'mapa anti-ressurreição sincroniza');
});

test('15. validator de nested arrays continua ativo', () => {
  const ctx = ctxFixture();
  // Sem o codec, as tuplas CRUAS seriam barradas — a proteção existe.
  const raw = { lesionRevisions: { [RID]: teratomaExecuted() } };
  ctx.__raw = raw;
  const paths = vm.runInContext('findNestedArrayPaths(__raw, "atlas_state/main")', ctx);
  assert.ok(paths.length > 0, 'validator acusa payload não codificado');
  assert.ok(paths.some(p => p.includes('beforeSnapshot') && p.includes('reviewProgress')), 'caminho exato do bug');
});

test('16. nenhum campo estrutural é silenciosamente descartado', () => {
  const ctx = ctxFixture();
  const local = teratomaExecuted();
  const back = vm.runInContext(
    'structuralSnapshotProgressFromFirestore(structuralSnapshotProgressToFirestore({r:' + JSON.stringify(local) + '})).r', ctx);
  for (const k of ['structuralPlan', 'structuralExecution', 'history']) {
    assert.equal(jstr(back[k]), jstr(local[k]), k + ' preservado');
  }
});

test('TERATOMA LOCAL RECOVERY: executado local serializa e confirma sem reexecutar', () => {
  const ctx = ctxFixture();
  // Estado local do usuário após o merge real (como está no IndexedDB agora).
  const localDisk = JSON.parse(JSON.stringify({ [RID]: teratomaExecuted() }));
  const payload = firestorePayload(ctx, localDisk);
  assert.equal(nestedCount(ctx, payload), 0, 'payload do estado real passa no validator');
  const back = vm.runInContext('structuralSnapshotProgressFromFirestore(' + JSON.stringify(payload.lesionRevisions) + ')', ctx);
  assert.equal(back[RID].structuralPlan.status, 'executed');
  assert.equal(back[RID].structuralExecution.executionId, 'exec_teratoma1');
  assert.equal(back[RID].status, 'accepted', 'revisão segue resolvida; nada a reexecutar/reimportar');
});

test('UI: erro de sync resumido, detalhe no console', () => {
  const ctx = ctxFixture();
  const short = ctx.syncFailureStatus({ code: 'firestore_nested_arrays', message: 'Arrays aninhados: a[0], a[1], a[2]...' });
  assert.ok(!short.includes('a[0]'), 'sem parede de caminhos na UI');
  assert.match(short, /preservado neste dispositivo/);
  const other = ctx.syncFailureStatus({ message: 'timeout' });
  assert.match(other, /timeout/);
});
