'use strict';

// PROTEÇÃO 084 — LESION_REVISIONS (Central de Revisões + Soluções) passa a
// sincronizar entre dispositivos pelo documento principal do Firestore.
// Este arquivo cobre o MERGE puro (mergeLesionRevisions real, extraído do
// index.html) e as amarrações estáticas do pipeline de sync. Os cenários
// multi-dispositivo ponta a ponta (nuvem falsa compartilhada) ficam em
// tests/multi-device-sync.test.js, que já tem o harness completo.

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

const ctx = vm.createContext({});
vm.runInContext([
  extractFunction(html, 'canonicalJsonString'),
  extractFunction(html, 'mergeLesionRevisions')
].join('\n'), ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));
const merge = (l, r) => plain(ctx.mergeLesionRevisions(l, r));

function rev(id, over) {
  return Object.assign({
    id, lesionId: 'seed_1', createdAt: 1000, updatedAt: 1000, status: 'pending',
    requestText: 'pedido ' + id, solution: null, attempts: [], humanFeedback: [],
    history: [{ timestamp: 1000, action: 'created', details: { requestText: 'pedido ' + id } }]
  }, over || {});
}

test('084 MERGE: R1 só-local + R2 só-remoto = união (nenhuma revisão some)', () => {
  const out = merge({ R1: rev('R1') }, { R2: rev('R2') });
  assert.deepEqual(Object.keys(out).sort(), ['R1', 'R2']);
  assert.deepEqual(out.R1, rev('R1'));
  assert.deepEqual(out.R2, rev('R2'));
});

test('084 MERGE: mesmo id — updatedAt mais novo vence status/solution/escalares (nos dois sentidos)', () => {
  const older = rev('R1', { updatedAt: 1000, status: 'pending', solution: null });
  const newer = rev('R1', { updatedAt: 2000, status: 'proposed', solution: { summary: 'nova', proposedChanges: { notes: 'x' } } });
  for (const out of [merge({ R1: older }, { R1: newer }), merge({ R1: newer }, { R1: older })]) {
    assert.equal(out.R1.status, 'proposed');
    assert.equal(out.R1.updatedAt, 2000);
    assert.deepEqual(out.R1.solution, { summary: 'nova', proposedChanges: { notes: 'x' } });
  }
});

test('084 MERGE: empate de updatedAt é determinístico (merge(a,b) === merge(b,a))', () => {
  const a = rev('R1', { updatedAt: 5000, status: 'accepted' });
  const b = rev('R1', { updatedAt: 5000, status: 'rejected' });
  assert.deepEqual(merge({ R1: a }, { R1: b }), merge({ R1: b }, { R1: a }));
});

test('084 MERGE: history unido por timestamp+action, sem duplicar, ordem estável preservada', () => {
  const base = { timestamp: 1000, action: 'created', details: null };
  const l = rev('R1', { updatedAt: 3000, history: [base, { timestamp: 3000, action: 'solution_proposed', details: null }] });
  const r = rev('R1', { updatedAt: 2000, history: [base, { timestamp: 2000, action: 'reopened', details: null }] });
  const out = merge({ R1: l }, { R1: r });
  assert.deepEqual(out.R1.history.map((h) => h.timestamp + ':' + h.action), ['1000:created', '2000:reopened', '3000:solution_proposed']);
  // mesmo resultado no outro dispositivo (convergência)
  assert.deepEqual(merge({ R1: r }, { R1: l }).R1.history, out.R1.history);
  // entradas com o mesmo ms e ações diferentes mantêm a ordem original (a do vencedor)
  const same = [{ timestamp: 4000, action: 'application_authorized' }, { timestamp: 4000, action: 'before_snapshot_created' }, { timestamp: 4000, action: 'changes_applied' }];
  const out2 = merge({ R1: rev('R1', { updatedAt: 4000, history: same }) }, { R1: rev('R1', { updatedAt: 1000, history: [base] }) });
  assert.deepEqual(out2.R1.history.map((h) => h.action), ['created', 'application_authorized', 'before_snapshot_created', 'changes_applied']);
});

test('084 MERGE: attempts unidos por attempt.id (versão do vencedor para o mesmo id), humanFeedback por at+text', () => {
  const att1Old = { id: 'att_1', appliedAt: 1500, approvedAt: null, rolledBackAt: null, beforeSnapshot: { id: 'seed_1' } };
  const att1New = { ...att1Old, rolledBackAt: 2500, rollbackReason: 'errado' };
  const att2 = { id: 'att_2', appliedAt: 2600, approvedAt: null, beforeSnapshot: { id: 'seed_1' } };
  const fbA = { kind: 'rollback', text: 'errado', at: 2500, attemptId: 'att_1' };
  const fbB = { kind: 'reject', text: 'não', at: 1200, attemptId: null };
  const l = rev('R1', { updatedAt: 3000, attempts: [att1New, att2], humanFeedback: [fbA] });
  const r = rev('R1', { updatedAt: 2000, attempts: [att1Old], humanFeedback: [fbB, fbA] });
  const out = merge({ R1: l }, { R1: r });
  assert.deepEqual(out.R1.attempts.map((a) => a.id), ['att_1', 'att_2']);
  assert.equal(out.R1.attempts[0].rolledBackAt, 2500, 'att_1: versão do lado mais novo');
  assert.deepEqual(out.R1.humanFeedback.map((f) => f.at + ':' + f.text), ['1200:não', '2500:errado']);
  assert.deepEqual(merge({ R1: r }, { R1: l }), out, 'convergência nos dois dispositivos');
});

test('084 MERGE: attempt sem id é deduplicado pelo conteúdo canônico', () => {
  const a = { appliedAt: 1500, summary: 's' };
  const out = merge({ R1: rev('R1', { updatedAt: 2000, attempts: [a] }) }, { R1: rev('R1', { updatedAt: 1000, attempts: [{ summary: 's', appliedAt: 1500 }] }) });
  assert.equal(out.R1.attempts.length, 1);
});

test('084 MERGE: todos os status são preservados sem normalização', () => {
  const statuses = ['pending', 'proposed', 'rejected', 'applied_pending_validation', 'accepted', 'manual_action_required', 'cancelled', 'status_futuro'];
  const local = {}; statuses.forEach((s, i) => { local['L' + i] = rev('L' + i, { status: s }); });
  const out = merge(local, {});
  assert.deepEqual(statuses.map((s, i) => out['L' + i].status), statuses);
});

test('084 MERGE: remoto sem o campo (undefined/null/array/string) = {} — local intacto', () => {
  const local = { R1: rev('R1') };
  for (const bad of [undefined, null, [], 'x', 42]) {
    assert.deepEqual(merge(local, bad), local);
    assert.deepEqual(merge(bad, local), local);
  }
  assert.deepEqual(merge(undefined, undefined), {});
});

test('084 MERGE: puro — não muta as entradas; idempotente (merge(m,m) === m)', () => {
  const l = { R1: rev('R1', { updatedAt: 3000, history: [{ timestamp: 3000, action: 'x' }] }) };
  const r = { R1: rev('R1', { updatedAt: 2000 }), R2: rev('R2') };
  const lCopy = plain(l), rCopy = plain(r);
  const out = merge(l, r);
  assert.deepEqual(plain(l), lCopy);
  assert.deepEqual(plain(r), rCopy);
  assert.deepEqual(merge(out, out), out);
  out.R2.status = 'mutado';
  assert.equal(r.R2.status, 'pending', 'resultado não compartilha referência com o remoto');
});

// ---------------------------------------------------------------------------
// Amarrações estáticas do pipeline (garante que cada ponto do sync participa)
// ---------------------------------------------------------------------------

test('084 PIPELINE: writeShardedState grava lesionRevisions no meta e une com o remoto DENTRO da transação', () => {
  const src = extractFunction(html, 'writeShardedState');
  assert.match(src, /lesionRevisions:\s*stripUndefinedDeep\(LESION_REVISIONS \|\| \{\}\)/);
  assert.match(src, /mergeLesionRevisions\(metaPayloadBase\.lesionRevisions,\s*remoteMeta\.lesionRevisions\)/);
  assert.match(src, /lesionRevisions:\s*writeLesionRevisions/);
});

test('084 PIPELINE: readShardedState devolve lesionRevisions com fallback {} para documento antigo', () => {
  const src = extractFunction(html, 'readShardedState');
  assert.match(src, /lesionRevisions:\s*\(meta\.lesionRevisions && typeof meta\.lesionRevisions === 'object' && !Array\.isArray\(meta\.lesionRevisions\)\) \? meta\.lesionRevisions : \{\}/);
});

test('084 PIPELINE: reconcile/persist/no-op/pull/adoção de device novo cobrem lesionRevisions sem marcar dirty', () => {
  assert.match(extractFunction(html, 'reconcileStateWithRemote'), /LESION_REVISIONS = mergeLesionRevisions\(LESION_REVISIONS, remote && remote\.lesionRevisions\)/);
  assert.match(extractFunction(html, 'persistLocalStateNow'), /await saveLesionRevisions\(true\)/);
  const pre = extractFunction(html, 'reconcileBeforePush');
  assert.match(pre, /lesionRevisions: LESION_REVISIONS \|\| \{\}/, 'snapshot local do no-op inclui revisões');
  assert.match(pre, /lesionRevisions: remote\.lesionRevisions\|\|\{\}/, 'snapshot remoto do no-op inclui revisões');
  const pull = extractFunction(html, 'syncFromFirebase');
  assert.match(pull, /await saveLesionRevisions\(true\)/);
  assert.match(pull, /updateReviewCenterBadges\(\)/, 'badges 🔔/💡 atualizados sem F5');
  const adopt = extractFunction(html, 'adoptRemoteStateForNewDevice');
  assert.match(adopt, /LESION_REVISIONS = mergeLesionRevisions\(LESION_REVISIONS, remote\.lesionRevisions\)/);
  assert.match(adopt, /await saveLesionRevisions\(true\)/);
  // restauração manual de snapshot continua sem sync automático
  assert.match(extractFunction(html, 'restoreSafetySnapshot'), /await saveLesionRevisions\(true\)/);
});

test('084 PIPELINE: ação do usuário marca dirty e agenda push; internal só persiste', async () => {
  const calls = { dirty: 0, push: 0, set: 0 };
  const c = vm.createContext({
    LESION_REVISIONS: { R1: rev('R1') },
    storage: { set: async () => { calls.set += 1; } },
    markSyncDirty: async () => { calls.dirty += 1; },
    pushToFirebase: () => { calls.push += 1; },
    console
  });
  vm.runInContext("const LESION_REVISIONS_KEY='atlas:lesionRevisions';\n" + extractFunction(html, 'saveLesionRevisions'), c);
  await c.saveLesionRevisions(true);
  assert.deepEqual(calls, { dirty: 0, push: 0, set: 1 });
  await c.saveLesionRevisions();
  assert.deepEqual(calls, { dirty: 1, push: 1, set: 2 });
});

test('084 AUDITORIA: buildSyncAudit/readCloudAuditFromServer contam as revisões da nuvem (storesRevisions=true)', () => {
  const audit = extractFunction(html, 'buildSyncAudit');
  assert.match(audit, /syncAuditCounters\(remoteData, remote\.lesionRevisions, remote\.review, remote\.srs\)/);
  assert.match(audit, /cloud\.storesRevisions = true/);
  assert.doesNotMatch(audit, /storesRevisions = false/);
  const verify = extractFunction(html, 'readCloudAuditFromServer');
  assert.match(verify, /counters\.storesRevisions = true/);
});

test('084 BACKUP/SNAPSHOT: continuam incluindo lesionRevisions (sem duplicar) e backup antigo cai em {}', () => {
  assert.match(html, /lesionRevisions:\s*LESION_REVISIONS,/, 'export de backup');
  assert.match(html, /LESION_REVISIONS = \(parsed\.lesionRevisions && typeof parsed\.lesionRevisions==='object' && !Array\.isArray\(parsed\.lesionRevisions\)\) \? parsed\.lesionRevisions : \{\};/, 'import com fallback {}');
  assert.match(html, /lesionRevisions:\s*JSON\.parse\(JSON\.stringify\(LESION_REVISIONS\|\|\{\}\)\)/, 'snapshot de segurança');
  assert.match(extractFunction(html, 'restoreSafetySnapshot'), /snapshot\.lesionRevisions\|\|\{\}/, 'snapshot antigo sem o campo = {}');
});
