'use strict';

// FASE 3B — atomicidade e segurança do snapshot store (commit atômico
// snapshot + metadata, pending/retry, conflitos, flag OFF, falhas de cache).
// NADA aqui migra dado real nem altera o catálogo: a flag permanece false em
// produção; os caminhos flag-ON são exercitados só dentro de contextos vm
// isolados. Extração por nome/slice do index.html real (mesmo padrão do resto
// da suíte); sem IndexedDB/Firebase/Cloudinary/rede reais.

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

const txSrc = fn('writeShardedState');
const META_SET = 'tx.set(FB_META_REF(), firestoreMeta)';
const SNAP_SET = 'tx.set(structuralSnapshotFirestoreRef(snapshotId), pendingSnapshotDocs[snapshotId])';

// ---------- 1/2/3/13/14 — a transação atômica (estático) ----------

test('3B-01 snapshot + metadata na MESMA transação (snapshot antes da metadata)', () => {
  const snapIdx = txSrc.indexOf(SNAP_SET);
  const metaIdx = txSrc.indexOf(META_SET);
  assert.notEqual(snapIdx, -1, 'tx.set do snapshot ausente na transação');
  assert.notEqual(metaIdx, -1, 'tx.set da metadata ausente na transação');
  assert.ok(snapIdx < metaIdx, 'o snapshot precisa ser gravado antes da metadata, na mesma transação');
});

test('3B-02 snapshot indisponível aborta ANTES do commit da metadata', () => {
  const throwIdx = txSrc.indexOf("err.code = 'snapshot_unavailable_for_commit'");
  const metaIdx = txSrc.indexOf(META_SET);
  assert.notEqual(throwIdx, -1, 'aborto snapshot_unavailable_for_commit ausente');
  assert.ok(throwIdx < metaIdx, 'o aborto precisa vir antes de qualquer commit da metadata');
});

test('3B-03 um único commit da metadata, após o loop de snapshots (falha no meio = nada comita)', () => {
  const occurrences = txSrc.split('tx.set(FB_META_REF()').length - 1;
  assert.equal(occurrences, 1, 'a metadata só pode ser comitada uma vez por transação');
  const loopIdx = txSrc.indexOf('for(const snapshotId of finalPendingIds){');
  const metaIdx = txSrc.indexOf(META_SET);
  assert.notEqual(loopIdx, -1, 'loop de snapshots pendentes ausente');
  assert.ok(loopIdx < metaIdx, 'todos os snapshots são decididos antes do commit da metadata');
});

test('3B-04 remoto idêntico é no-op idempotente (só diverge aborta)', () => {
  assert.match(txSrc, /já existe remotamente e bate/, 'caminho no-op para fingerprint igual ausente');
  assert.match(txSrc, /remoteFp !== localRecord\.fingerprint/, 'comparação de fingerprint ausente');
});

test('3B-05 fingerprint divergente aborta com snapshot_content_conflict', () => {
  const throwIdx = txSrc.indexOf("err.code = 'snapshot_content_conflict'");
  const metaIdx = txSrc.indexOf(META_SET);
  assert.notEqual(throwIdx, -1, 'aborto snapshot_content_conflict ausente');
  assert.ok(throwIdx < metaIdx, 'o conflito precisa abortar antes do commit');
});

test('3B-13 um conflito no meio do lote aborta tudo (nenhum commit parcial)', () => {
  const loopBlock = txSrc.slice(txSrc.indexOf('for(const snapshotId of finalPendingIds){'), txSrc.indexOf(META_SET));
  const throws = loopBlock.split('throw err').length - 1;
  assert.ok(throws >= 2, 'o loop precisa abortar em conflito E em indisponibilidade, antes da metadata');
});

test('3B-14 eco de outro PC: remoto existe + cache local ausente NÃO é conflito', () => {
  assert.match(txSrc, /Eco de outro PC/, 'tratamento do eco multidevice ausente na transação');
  const loopBlock = txSrc.slice(txSrc.indexOf('for(const snapshotId of finalPendingIds){'), txSrc.indexOf(META_SET));
  assert.match(loopBlock, /if\(localRecord\)/, 'o conflito só pode disparar quando há registro local para comparar');
});

// ---------- pending/retry (comportamental, tudo local) ----------

const pendingSrc = [
  'snapshotSyncedLocalKey', 'isSnapshotMarkedSynced', 'markSnapshotSynced',
  'collectExternalSnapshotRefs', 'collectPendingSnapshotRefs'
].map(fn).join('\n');

function pendingCtx(lesionRevisions, backing) {
  backing = backing || {};
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
    async set(key, value) { backing[key] = value; }
  };
  const context = { console, JSON, Object, Array, storage, __backing: backing, LESION_REVISIONS: lesionRevisions || {} };
  vm.createContext(context);
  vm.runInContext(pendingSrc, context, { filename: 'snapshot-pending-test.js' });
  return context;
}

function externalExecCtx() {
  return {
    r1: { id: 'r1', structuralExecution: { status: 'executed', snapshotStorage: 'external', snapshotRef: 'exec_1' } },
    r2: { id: 'r2', attempts: [{ id: 'att_1', snapshotStorage: 'external', snapshotRef: 'att_1' }] }
  };
}

test('3B-06 offline: pendência é 100% local (sem rede) e permanece até o commit', async () => {
  const ctx = pendingCtx(externalExecCtx());
  const pending = await ctx.collectPendingSnapshotRefs(ctx.LESION_REVISIONS);
  assert.deepEqual(plain(pending.sort()), ['att_1', 'exec_1']);
  assert.equal(await ctx.isSnapshotMarkedSynced('exec_1'), false, 'falha/offline nunca pode marcar synced');
});

test('3B-07 reload: pendência é reconstruída re-varrendo LESION_REVISIONS', async () => {
  const backing = {}; // mesmo IndexedDB após F5
  const ctx1 = pendingCtx(externalExecCtx(), backing);
  await ctx1.markSnapshotSynced('exec_1');
  const ctx2 = pendingCtx(externalExecCtx(), backing); // novo contexto, mesmo backing
  const pending = await ctx2.collectPendingSnapshotRefs(ctx2.LESION_REVISIONS);
  assert.deepEqual(plain(pending), ['att_1'], 'o já-sincronizado não volta; o restante é redescoberto');
});

test('3B-08 commit bem-sucedido marca synced (não tenta de novo)', async () => {
  const ctx = pendingCtx(externalExecCtx());
  await ctx.markSnapshotSynced('exec_1');
  await ctx.markSnapshotSynced('att_1');
  const pending = await ctx.collectPendingSnapshotRefs(ctx.LESION_REVISIONS);
  assert.deepEqual(plain(pending), []);
});

test('3B-09 falha nunca marca synced (próximo ciclo tenta de novo)', async () => {
  const ctx = pendingCtx(externalExecCtx());
  assert.equal(await ctx.isSnapshotMarkedSynced('exec_1'), false);
  assert.equal(await ctx.isSnapshotMarkedSynced('att_1'), false);
});

test('3B-12 dois snapshots pendentes são listados juntos', async () => {
  const ctx = pendingCtx(externalExecCtx());
  const pending = await ctx.collectPendingSnapshotRefs(ctx.LESION_REVISIONS);
  assert.equal(pending.length, 2);
});

// ---------- 10/11 — kinds via store (comportamental) ----------

const canonSrc = html.slice(html.indexOf('function canonicalJsonString('), html.indexOf('function deepStableEqual('));
const schemaConst = html.slice(html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '), html.indexOf('function structuralSnapshotLocalCacheKey('));
const kindsSrc = ['computeDeterministicFingerprint', 'buildAtlasSnapshotRecord'].map(fn).join('\n');

function kindsCtx() {
  const context = { console, Date, Math, JSON, Object, Array };
  vm.createContext(context);
  vm.runInContext(canonSrc + '\n' + schemaConst + '\n' + kindsSrc, context, { filename: 'snapshot-kinds-test.js' });
  return context;
}

test('3B-10 structural_execution: snapshotId = executionId', () => {
  const ctx = kindsCtx();
  const r = ctx.buildAtlasSnapshotRecord({ kind: 'structural_execution', reviewId: 'r1', executionId: 'exec_x', beforeSnapshot: { a: 1 }, afterSnapshot: { a: 2 } });
  assert.equal(r.ok, true);
  assert.equal(r.record.snapshotId, 'exec_x');
  assert.ok(r.record.fingerprint);
});

test('3B-11 review_attempt: snapshotId = attempt.id, sem afterSnapshot', () => {
  const ctx = kindsCtx();
  const r = ctx.buildAtlasSnapshotRecord({ kind: 'review_attempt', reviewId: 'r1', attemptId: 'att_x', beforeSnapshot: { a: 1 } });
  assert.equal(r.ok, true);
  assert.equal(r.record.snapshotId, 'att_x');
  assert.equal(r.record.afterSnapshot, null);
});

// ---------- 15/17 — módulo de revisões: flag OFF inline + falha de cache ----------

const MODULE_START_MARKER = "const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';";
const MODULE_END_MARKER = '/* termos de busca em inglês para as lesões da base padrão';
const moduleSource = html.slice(html.indexOf(MODULE_START_MARKER), html.indexOf(MODULE_END_MARKER));
const heavySource = html.slice(html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '), html.indexOf('function buildSnapshotMigrationPlan('));

function reviewCtx(opts) {
  opts = opts || {};
  const backing = opts.backing || {};
  const failSnapshot = !!opts.failSnapshotCache;
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
    async set(key, value) {
      if (String(key).indexOf('atlas:snapshot:') === 0) {
        if (failSnapshot) throw new Error('cache cheio (simulado)');
        if (typeof opts.onSnapshotSet === 'function') return opts.onSnapshotSet(key, value, backing);
      }
      backing[key] = value;
    }
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
  vm.runInContext(moduleSource, context, { filename: 'lesion-review-module-3b.js' });
  vm.runInContext(canonSrc + '\n' + heavySource, context, { filename: 'lesion-review-module-3b-heavy.js' });
  // Fase 6: default publicado é ON; legado inline pinado exceto opts.flagOn.
  // opts.keepDefault preserva o default real do app (para o teste do default).
  if (opts.flagOn) vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true;', context);
  else if (!opts.keepDefault) vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', context);
  return context;
}

function makeLesion3B() {
  return {
    id: 'seed_1', name: 'Adamantinoma', s: 'Musculoesquelético', site: 'Tíbia',
    tags: ['lítica'], notes: 'lesão óssea benigna clássica',
    classification: null, enTerm: 'adamantinoma', img: '', images: [], links: []
  };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test('3B-15 flag OFF mantém comportamento legado (attempt inline)', () => {
  const ctx = reviewCtx({ data: [makeLesion3B()] });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  ctx.setReviewSolution(review.id, 'corrigir notas', { notes: 'nota nova' });
  const applied = ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(applied.ok, true);
  const attempt = review.attempts[review.attempts.length - 1];
  assert.ok(attempt.beforeSnapshot, 'flag OFF: snapshot inline como sempre');
  assert.equal(attempt.snapshotStorage, undefined, 'flag OFF: nenhuma metadata externa');
});

test('3B-17 falha de cache de attempt reverte para inline e rollback funciona', async () => {
  const ctx = reviewCtx({ data: [makeLesion3B()], flagOn: true, failSnapshotCache: true });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  ctx.setReviewSolution(review.id, 'corrigir notas', { notes: 'nota nova' });
  const applied = ctx.authorizeAndApplyReviewSolution(review.id);
  assert.equal(applied.ok, true, 'a aplicação local não pode falhar por causa do cache');
  await tick(); // o fallback assíncrono reverte para inline
  const attempt = review.attempts[review.attempts.length - 1];
  assert.ok(attempt.beforeSnapshot, 'sem cache: attempt revertido para inline (rollback preservado)');
  assert.equal(attempt.snapshotStorage, undefined, 'sem cache: nenhuma metadata externa inválida');
  assert.equal(attempt.snapshotRef, undefined);
  const rb = await ctx.rollbackAppliedReviewSolution(review.id, 'não funcionou');
  assert.equal(rb.ok, true, 'rollback precisa funcionar via inline: ' + rb.reason);
  assert.equal(ctx.DATA[0].notes, 'lesão óssea benigna clássica');
});

// ---------- 16 — falha de cache estrutural nunca deixa executed inválido ----------

const execNames = [
  'normalizeExternalTitle', 'tokenizeExternalTitle',
  'structuralSectionOf', 'structuralSiteOf', 'hasStrongAnatomicConflict',
  'structuralOrganTags', 'hasIncompatibleOrganAnatomy', 'isCrossSectionOverrideValid',
  'canonicalJsonString', 'stableImageKeyV208', 'imageIdentityKeys',
  'pushLesionReviewHistory', 'lesionMergeLinkKey',
  'mergeClinicalCasesForFold', 'mergeDidacticItems', 'genDidacticId',
  'mergeReviewProgress', 'mergeReviewOverrides',
  'structuralPlanLesion', 'structuralPlanResolveImage',
  'buildStructuralPlanSnapshot', 'isStructuralPlanStale',
  'structuralExecutionId', 'structuralClone', 'structuralLesionIndex', 'structuralMapHas',
  'dryRunStructuralPlan', 'structuralSnapshotLesions', 'structuralSnapshotMaps',
  'structuralPersistAll', 'structuralRestoreSnapshots',
  'executeStructuralPlan',
  'structuralApplyMerge', 'structuralApplyRemovePlacement',
  'structuralApplyTransferImages', 'structuralApplyAddCases',
  'rollbackStructuralExecution',
  'buildAtlasSnapshotRecord', 'computeDeterministicFingerprint',
  'structuralSnapshotLocalCacheKey', 'structuralSnapshotFirestoreRef',
  'saveSnapshotToLocalCache', 'saveSnapshotToFirestore',
  'structuralDryRunSummaryHtml', 'getEffectiveStructuralStatus', 'structuralPlanCardBadgeHtml', 'structuralPlanCardButtonsHtml',
  'resolveReviewManually',
  'imageOwnerIdV1', 'assertManualImageOwnershipChange', 'canChangeImageOwnership',
  'clinicalCaseIdentityKey'
];
const execSrc = execNames.map(fn).join('\n');
const execConsts = html.slice(html.indexOf('const STRUCTURAL_EXECUTOR_VERSION = '), html.indexOf('function structuralExecutionId('));
const ownershipConst = "const IMAGE_OWNERSHIP_MANUAL = { manual:true };\n";
const statusesConst = "const ACTIVE_LESION_REVIEW_STATUSES = ['pending','rejected','proposed','applied_pending_validation','manual_action_required'];\n";
const anatomicGuardConst = html.slice(html.indexOf('const SECTION_ANATOMIC_SYSTEM = {'), html.indexOf('function validateReviewAiPlacement(suggested, sourceSection){'));
const snapshotStoreConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'), html.indexOf('function authorizeAndApplyReviewSolution('));

function structuralCtx(failSnapshotCache) {
  const lesion = (id, over) => Object.assign({
    id, name: 'Lesão ' + id, s: 'Pelve Feminina', site: 'Ovário', notes: '',
    classification: null, tags: [], enTerm: '', images: [], altPlacements: [],
    links: [], clinicalCases: [], radiologicSigns: [], classificationSchemes: [],
    _userUpdatedAt: 100
  }, over || {});
  const IMG = (assetId) => ({ assetId, data: 'https://res.cloudinary.com/x/' + assetId + '.jpg', source: 'cloudinary', label: 'img ' + assetId, lesionId: 'seed_698', lesionName: 'clone' });
  const DATA = [
    lesion('seed_208', { name: 'Cistoadenoma mucinoso', images: [IMG('A208')] }),
    lesion('seed_698', { name: 'Cistadenoma mucinoso ovariano', images: [IMG('A698')] })
  ];
  const LESION_REVISIONS = { R208: { id: 'R208', lesionId: 'seed_698', status: 'manual_action_required', requestText: 'fundir clone', manualAction: { type: 'duplicate_merge', description: 'x' }, history: [], createdAt: 1, updatedAt: 2 } };
  const backing = {};
  const storage = {
    async get(key) { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
    async set(key, value) {
      if (failSnapshotCache && String(key).indexOf('atlas:snapshot:') === 0) throw new Error('cache cheio (simulado)');
      backing[key] = value;
    }
  };
  const ctx = vm.createContext({
    DATA, LESION_REVISIONS, storage,
    REVIEW: {}, REVIEW_STAMPS: {}, REVIEW_PROGRESS: {}, REVIEW_OVERRIDE: {},
    SRS: {}, LESION_MERGES: {}, PENDING_LOCAL_IMAGE_ADDS: {},
    saveData: async () => {}, saveLesionRevisions: async () => {},
    registerImageOwnershipConflict: (c) => ({ id: 'conflict_test', conflict: c || null }),
    saveLesionMerges: async () => {}, saveReview: async () => {}, saveSRS: async () => {},
    saveReviewStamps: async () => {}, saveReviewProgressState: async () => {},
    savePendingLocalImageAdds: async () => {}, updateReviewCenterBadges: () => {},
    markSyncDirty: async () => {}, pushToFirebaseNow: async () => {},
    toast: () => {}, document: undefined, console
  });
  vm.runInContext(execConsts + '\n' + ownershipConst + statusesConst + anatomicGuardConst + snapshotStoreConst + '\n' + schemaConst + execSrc, ctx, { filename: 'fase3b-exec-test.js' });
  // Fase 6: default publicado é ON; este fixture cobre o legado inline
  // (3B-16 liga explicitamente depois).
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = false;', ctx);
  const res = { reviewId: 'R208', valid: true, type: 'merge_duplicates', keeperId: 'seed_208', removeId: 'seed_698', keeperName: 'x', removeName: 'y', merge: {}, reasoning: 'teste' };
  const r = ctx.LESION_REVISIONS['R208'];
  r.structuralPlan = { status: 'accepted', importedAt: '2026-09-27T00:00:00.000Z', type: res.type, resolution: res, snapshot: ctx.buildStructuralPlanSnapshot(res) };
  return ctx;
}

test('3B-16 falha de cache local estrutural aborta sem executed inválido', async () => {
  const ctx = structuralCtx(true);
  vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true;', ctx);
  const res = await ctx.executeStructuralPlan('R208');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'snapshot_cache_write_failed');
  const r = ctx.LESION_REVISIONS['R208'];
  assert.notEqual(r.structuralExecution.status, 'executed', 'nunca marca executed sem snapshot em cache');
  assert.equal(r.structuralExecution.snapshotStorage, undefined, 'falha não deixa metadata externa');
  assert.ok(ctx.DATA.some((e) => e.id === 'seed_698'), 'DATA restaurado (nada removido)');
});

// ---------- 18/19/20 — estáticos de higiene ----------

test('3B-18 nenhum call site produtivo chama saveSnapshotToFirestore fora da transação', () => {
  const occurrences = html.split('saveSnapshotToFirestore(').length - 1;
  assert.equal(occurrences, 2, 'esperado: definição + 1 uso na migração futura (atual: ' + occurrences + ')');
  for (const name of ['executeStructuralPlan', 'authorizeAndApplyReviewSolution', 'applyReviewAiSuggestedPlacement', 'importReviewAiSolution', 'processReviewAiBatchItem', 'importReviewAiBatch', 'writeShardedState']) {
    assert.doesNotMatch(fn(name), /saveSnapshotToFirestore\(/, name + ' não pode chamar saveSnapshotToFirestore fora da transação');
  }
  assert.match(fn('copySnapshotMigrationItem'), /saveSnapshotToFirestore\(/, 'o único uso permanece na migração futura documentada');
});

test('3B-19 nenhum .catch(()=>{}) em persistência de snapshot', () => {
  const matches = html.match(/\.catch\(\(\)=>\{\}\)/g) || [];
  assert.equal(matches.length, 1, 'só o hover preview (leitura de UI) pode usar catch vazio, atual: ' + matches.length);
  for (const name of ['saveSnapshotToLocalCache', 'getSnapshotFromStore', 'markSnapshotSynced', 'copySnapshotMigrationItem']) {
    assert.doesNotMatch(fn(name), /\.catch\(\(\)=>\{\}\)/, name + ' sem catch silencioso');
  }
});

test('3B-20 nenhuma migração automática, nenhum dado real tocado, flag ON (Fase 6)', () => {
  assert.ok(html.includes('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED = true'), 'flag nasce ON');
  // build tem 2 ocorrências: definição + rebuild live DENTRO do apply manual
  // (5B, explícito, nunca boot/save/sync) — demais fns só a definição.
  assert.equal(html.split('buildSnapshotMigrationPlan(').length - 1, 2, 'build: definição + rebuild do apply');
  assert.match(fn('applySnapshotMigrationCompaction'), /buildSnapshotMigrationPlan\(\)/, 'o segundo uso mora no apply manual');
  assert.equal(html.split('copySnapshotMigrationItem(').length - 1, 1, 'copy só tem a definição');
  assert.equal(html.split('verifySnapshotMigrationItem(').length - 1, 1, 'verify só tem a definição');
  assert.equal(html.split('compactSnapshotMigrationPlan(').length - 1, 1, 'compact só tem a definição');
});

// ---------- persistência do fallback inline (reload pós-falha) ----------

test('3B-21 authorize + cache falha: inline em memória E persistido; reload recupera; rollback offline funciona; sem duplicata', async () => {
  const backing = {};
  const ctx = reviewCtx({ data: [makeLesion3B()], flagOn: true, failSnapshotCache: true, backing });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  const reviewId = review.id;
  ctx.setReviewSolution(reviewId, 'corrigir notas', { notes: 'nota nova' });
  const applied = ctx.authorizeAndApplyReviewSolution(reviewId);
  assert.equal(applied.ok, true);
  await tick(); await tick(); // fallback (reverte + re-persiste)
  const memAttempt = review.attempts[review.attempts.length - 1];
  assert.ok(memAttempt.beforeSnapshot, 'memória: inline restaurado');
  assert.equal(memAttempt.snapshotStorage, undefined, 'memória: sem marker externo');
  assert.equal(review.attempts.length, 1, 'memória: sem attempt duplicado');
  const persisted = JSON.parse(backing['atlas:lesionRevisions']);
  assert.equal(persisted[reviewId].attempts.length, 1, 'persistido: sem attempt duplicado');
  const pAtt = persisted[reviewId].attempts[0];
  assert.ok(pAtt.beforeSnapshot, 'persistido: inline restaurado');
  assert.equal(pAtt.snapshotStorage, undefined, 'persistido: sem marker externo');
  assert.equal(pAtt.snapshotRef, undefined);
  // reload simulado: novo contexto, mesmo backing (mesmo IndexedDB)
  const ctx2 = reviewCtx({ data: [makeLesion3B()], flagOn: true, failSnapshotCache: true, backing });
  await ctx2.loadLesionRevisions();
  const reloaded = vm.runInContext('LESION_REVISIONS', ctx2);
  assert.ok(reloaded[reviewId].attempts[0].beforeSnapshot, 'reload: beforeSnapshot recuperado');
  assert.deepEqual(plain(reloaded[reviewId].attempts[0].beforeSnapshot.notes), 'lesão óssea benigna clássica');
  // rollback offline (inline resolve sem rede)
  ctx2.DATA[0].notes = 'nota nova'; // DATA mutado, como o saveData real teria persistido
  const rb = await ctx2.rollbackAppliedReviewSolution(reviewId, 'não funcionou');
  assert.equal(rb.ok, true, 'rollback offline após reload: ' + rb.reason);
  assert.equal(ctx2.DATA[0].notes, 'lesão óssea benigna clássica');
});

test('3B-22 placement + cache falha: mesmos quatro pontos (inline, persistido, reload, rollback offline)', async () => {
  const backing = {};
  const target = Object.assign(makeLesion3B(), { id: 'seed_9', name: 'Lesão pélvica', s: 'Pelve Masculina', site: 'Bexiga' });
  const catalog = Object.assign(makeLesion3B(), { id: 'seed_10', name: 'Lesão abdominal', s: 'Abdômen Superior', site: 'Fígado' });
  const ctx = reviewCtx({ data: [target, catalog], flagOn: true, failSnapshotCache: true, backing });
  const { review } = ctx.createLesionReview('seed_9', 'sugerir local adicional');
  const reviewId = review.id;
  const flagged = ctx.flagManualActionRequired(reviewId, 'Resumo IA', 'additional_section_placement',
    { type: 'additional_section_placement', description: 'aparece também no abdome', suggestedPlacement: { section: 'Abdômen Superior', site: 'Fígado' } });
  assert.equal(flagged.ok, true, JSON.stringify(flagged.reason));
  const res = ctx.applyReviewAiSuggestedPlacement(reviewId);
  assert.equal(res.ok, true, JSON.stringify(res.reason));
  await tick(); await tick();
  assert.equal(review.attempts.length, 1, 'memória: sem attempt duplicado');
  assert.ok(review.attempts[0].beforeSnapshot, 'memória: inline restaurado');
  assert.equal(review.attempts[0].snapshotStorage, undefined, 'memória: sem marker externo');
  const persisted = JSON.parse(backing['atlas:lesionRevisions']);
  assert.equal(persisted[reviewId].attempts.length, 1, 'persistido: sem attempt duplicado');
  assert.ok(persisted[reviewId].attempts[0].beforeSnapshot, 'persistido: inline restaurado');
  assert.equal(persisted[reviewId].attempts[0].snapshotStorage, undefined, 'persistido: sem marker externo');
  assert.equal(ctx.DATA.find((e) => e.id === 'seed_9').altPlacements.length, 1, 'placement aplicado no DATA');
  const ctx2 = reviewCtx({ data: [target, catalog], flagOn: true, failSnapshotCache: true, backing });
  await ctx2.loadLesionRevisions();
  const reloaded = vm.runInContext('LESION_REVISIONS', ctx2);
  assert.ok(reloaded[reviewId].attempts[0].beforeSnapshot, 'reload: beforeSnapshot recuperado');
  ctx2.DATA.find((e) => e.id === 'seed_9').altPlacements = [{ s: 'Abdômen Superior', site: 'Fígado' }];
  const rb = await ctx2.rollbackAppliedReviewSolution(reviewId, 'não funcionou');
  assert.equal(rb.ok, true, 'rollback offline após reload: ' + rb.reason);
  assert.deepEqual(plain(ctx2.DATA.find((e) => e.id === 'seed_9').altPlacements || []), [], 'placement desfeito');
});

test('3B-23 janela antes do fallback: sync enxerga a metadata externa como pendente não-publicada', async () => {
  const backing = {};
  let release = null;
  const ctx = reviewCtx({ data: [makeLesion3B()], flagOn: true, backing, onSnapshotSet: (key, value) => new Promise((res) => { release = () => { backing[key] = value; res(); }; }) });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  const reviewId = review.id;
  ctx.setReviewSolution(reviewId, 'x', { notes: 'nota nova' });
  ctx.authorizeAndApplyReviewSolution(reviewId);
  await tick(); // saveLesionRevisions persistiu a metadata externa; cache segue pendente
  const persisted = JSON.parse(backing['atlas:lesionRevisions']);
  const extAttempt = persisted[reviewId].attempts[0];
  assert.equal(extAttempt.snapshotStorage, 'external', 'na janela: metadata externa persistida');
  const pctx = pendingCtx({});
  const pending = await pctx.collectPendingSnapshotRefs(persisted);
  assert.deepEqual(plain(pending), [extAttempt.id], 'sync a trata como pendente (não-publicada)');
  assert.equal(await pctx.isSnapshotMarkedSynced(pending[0]), false, 'nunca marcada como synced');
  // a transação atômica (3B-01/02/14) publicaria snapshot+metadata juntos ou
  // abortaria — nunca a metadata sozinha.
  release(); await tick();
  assert.equal(review.attempts[0].snapshotStorage, 'external', 'cache OK: continua externa, sem downgrade');
  assert.ok((await ctx.getSnapshotFromLocalCache(review.attempts[0].id)).ok, 'snapshot em cache após sucesso');
});

test('3B-25 flag OFF: forma persistida legada (inline, sem markers, sem cache)', async () => {
  const backing = {};
  const ctx = reviewCtx({ data: [makeLesion3B()], backing }); // flag OFF
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  const reviewId = review.id;
  ctx.setReviewSolution(reviewId, 'x', { notes: 'nota nova' });
  ctx.authorizeAndApplyReviewSolution(reviewId);
  await tick();
  const att = JSON.parse(backing['atlas:lesionRevisions'])[reviewId].attempts[0];
  assert.ok(att.beforeSnapshot, 'inline como sempre');
  assert.ok(!('snapshotStorage' in att) && !('snapshotRef' in att), 'nenhum marker externo');
  assert.equal(Object.keys(backing).filter((k) => k.indexOf('atlas:snapshot:') === 0).length, 0, 'nada no cache de snapshots');
});

test('3B-26 sucesso de cache: metadata continua externalizada (não volta para inline)', async () => {
  const backing = {};
  const ctx = reviewCtx({ data: [makeLesion3B()], flagOn: true, backing });
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  const reviewId = review.id;
  ctx.setReviewSolution(reviewId, 'x', { notes: 'nota nova' });
  ctx.authorizeAndApplyReviewSolution(reviewId);
  await tick(); await tick();
  const att = review.attempts[0];
  assert.equal(att.snapshotStorage, 'external', 'memória: continua externa');
  assert.ok(att.snapshotRef, 'memória: com snapshotRef');
  assert.equal(att.beforeSnapshot, undefined, 'memória: sem inline');
  assert.equal(JSON.parse(backing['atlas:lesionRevisions'])[reviewId].attempts[0].snapshotStorage, 'external', 'persistido: continua externo');
  assert.ok((await ctx.getSnapshotFromLocalCache(att.id)).ok, 'snapshot em cache');
});

test('3B-27 default publicado (Fase 6): novos attempts externalizam sem opt-in', async () => {
  const backing = {};
  const ctx = reviewCtx({ data: [makeLesion3B()], backing, keepDefault: true }); // vale o default do app
  assert.equal(vm.runInContext('STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED', ctx), true, 'default ON no contexto');
  const { review } = ctx.createLesionReview('seed_1', 'pedido');
  const reviewId = review.id;
  ctx.setReviewSolution(reviewId, 'x', { notes: 'nova' });
  assert.equal(ctx.authorizeAndApplyReviewSolution(reviewId).ok, true);
  const attempt = review.attempts[review.attempts.length - 1];
  assert.equal(attempt.snapshotStorage, 'external', 'metadata externa por padrão');
  assert.equal(attempt.snapshotRef, attempt.id, 'ref = attempt.id');
  assert.equal(attempt.beforeSnapshot, undefined, 'sem inline');
  await new Promise((r) => setTimeout(r, 10));
  assert.ok((await ctx.getSnapshotFromLocalCache(attempt.id)).ok, 'snapshot em cache local');
  assert.equal(JSON.parse(backing['atlas:lesionRevisions'])[reviewId].attempts[0].snapshotStorage, 'external', 'persistido externo');
});
