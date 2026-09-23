'use strict';

/* Testes das duas proteções estruturais:
 *  1) Snapshots locais leves (IndexedDB) antes de operações de RISCO;
 *  2) Proteção forte de atribuição/ownership de imagens (automação não muda dono).
 *
 * Extrai o trecho REAL do index.html e roda num `vm` isolado, com um `storage`
 * falso em memória. Nenhum teste acessa IndexedDB, Firebase, Cloudinary ou rede.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
}
function extractFunction(source, name) {
  const re = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'função não encontrada: ' + name);
  const ob = source.indexOf('{', m.index + m[0].length);
  let depth = 0, q = null, esc = false, end = -1;
  for (let i = ob; i < source.length; i += 1) {
    const c = source[i];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, 'bloco sem fechamento: ' + name);
  return { source: source.slice(m.index, end + 1), body: source.slice(ob + 1, end) };
}

const snapshotBlock = extractBlock(html, "const SAFETY_SNAPSHOT_PREFIX = 'atlas:safetySnapshot:';", 'function isSeedLikeId(id){');
const stableKeyFn = extractFunction(html, 'stableImageKeyV208');
const ownershipBlock = extractBlock(html, 'const IMAGE_OWNERSHIP_MANUAL = { manual:true };', 'let canonicalImageOwnersV208 = null;');
const OWNERSHIP_SOURCE = stableKeyFn.source + '\n' + ownershipBlock;
const SNAPSHOT_SOURCE = snapshotBlock;

function makeStorage(backing) {
  return {
    async get(key) {
      if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] };
      throw new Error('not found: ' + key);
    },
    async set(key, value) { backing[key] = value; },
    async delete(key) { delete backing[key]; },
    async list(prefix) { return { keys: Object.keys(backing).filter(k => !prefix || k.indexOf(prefix) === 0) }; }
  };
}

function makeSnapshotContext(backing) {
  const store = backing || {};
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number,
    storage: makeStorage(store), __backing: store,
    DATA: [], REVIEW: {}, SRS: {}, SESSIONLOG: {}, LESION_REVISIONS: {},
    sectionOrder: [], siteOrder: {},
    STORAGE_KEY: 'data', REVIEW_KEY: 'review', SRS_KEY: 'srs', SESSIONLOG_KEY: 'slog',
    ORDER_KEY: 'order', SITEORDER_KEY: 'sorder', fbSyncing: false,
    saveLesionRevisions: async () => {},
    renderAll: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(SNAPSHOT_SOURCE, ctx, { filename: 'snapshots.js' });
  return ctx;
}

function makeOwnershipContext() {
  const ctx = { console, Date, Math, JSON, Object, Array, String, Number };
  vm.createContext(ctx);
  vm.runInContext(OWNERSHIP_SOURCE, ctx, { filename: 'ownership.js' });
  return ctx;
}
function readGlobal(ctx, name){ return vm.runInContext(name, ctx); }

function cloudinaryImage(over) {
  return Object.assign({
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/x.jpg',
    thumb: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/x.jpg',
    source: 'cloudinary',
    publicId: 'atlas-radiologico/x',
    assetId: 'A1',
    label: 'axial T2',
    lesionId: 'seed_1',
    lesionName: 'Lesão 1',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:X',
    sourceSite: 'Wikimedia Commons',
    license: 'CC BY',
    artist: 'Fulano',
    attribution: 'Fulano',
    originalUrl: 'https://upload.wikimedia.org/x.jpg'
  }, over || {});
}

// ===========================================================================
// SNAPSHOTS
// ===========================================================================
test('SNAPSHOT: NÃO cria em edição comum (motivo fora da lista de risco)', () => {
  const ctx = makeSnapshotContext();
  const res = ctx.createSafetySnapshot('antes de salvar alterações');
  assert.equal(res, null);
  assert.equal(Object.keys(ctx.__backing).length, 0, 'nada pode ser gravado numa edição comum');
  assert.equal(ctx.isRiskSnapshotReason('antes de salvar alterações'), false);
  assert.equal(ctx.isRiskSnapshotReason('abertura do Atlas antes do Firebase'), false);
});

test('SNAPSHOT: cria antes de importação/restauração/operação em massa (motivos de risco)', () => {
  const ctx = makeSnapshotContext();
  for (const reason of ['antes de importar backup', 'antes de restaurar padrão de fábrica', 'antes de forçar fusão de duplicatas', 'antes de aplicar reconciliação V2', 'antes de operação em massa de ownership']) {
    assert.equal(ctx.isRiskSnapshotReason(reason), true, reason);
    assert.ok(ctx.createSafetySnapshot(reason), 'deveria criar snapshot para ' + reason);
  }
});

test('SNAPSHOT: guarda o estado estruturado necessário (DATA/REVIEW/SRS/LESION_REVISIONS/ordens)', () => {
  const ctx = makeSnapshotContext();
  ctx.DATA = [{ id: 'seed_1', name: 'Lesão 1', s: 'S', site: 'T', images: [cloudinaryImage()] }];
  ctx.REVIEW = { seed_1: 2 };
  ctx.SRS = { seed_1: { interval: 7, due: 1, streak: 2 } };
  ctx.SESSIONLOG = { '2026-09-20': { reviewed: 1 } };
  ctx.LESION_REVISIONS = { lrev_1: { id: 'lrev_1', lesionId: 'seed_1', status: 'pending' } };
  ctx.sectionOrder = ['S'];
  ctx.siteOrder = { S: ['T'] };
  const snap = ctx.buildSafetySnapshot('antes de importar backup');
  assert.equal(snap.snapshotVersion, 2);
  assert.equal(snap.lesionCount, 1);
  assert.equal(snap.imageCount, 1);
  assert.equal(snap.data[0].id, 'seed_1');
  assert.deepEqual(JSON.parse(JSON.stringify(snap.review)), { seed_1: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(snap.srs)).seed_1.interval, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(snap.lesionRevisions)).lrev_1.status, 'pending');
  assert.deepEqual(JSON.parse(JSON.stringify(snap.sectionOrder)), ['S']);
  assert.deepEqual(JSON.parse(JSON.stringify(snap.siteOrder)), { S: ['T'] });
});

test('SNAPSHOT: preserva os metadados/ownership da imagem e NÃO duplica binário do Cloudinary', () => {
  const ctx = makeSnapshotContext();
  const img = cloudinaryImage();
  ctx.DATA = [{ id: 'seed_1', name: 'Lesão 1', images: [img] }];
  const snap = ctx.buildSafetySnapshot('antes de importar backup');
  const saved = snap.data[0].images[0];
  for (const k of ['publicId', 'assetId', 'label', 'source', 'sourcePage', 'sourceSite', 'license', 'artist', 'attribution', 'originalUrl', 'lesionId', 'lesionName']) {
    assert.equal(saved[k], img[k], 'metadado preservado: ' + k);
  }
  // a imagem remota fica só como URL (não há base64 nem blob embutido)
  assert.equal(saved.data, img.data);
  assert.ok(!/^data:/.test(String(saved.data)), 'não pode embutir binário');
});

test('SNAPSHOT: retenção de 5 — o 6º remove o mais antigo', async () => {
  const ctx = makeSnapshotContext();
  for (let i = 0; i < 6; i += 1) {
    ctx.DATA = [{ id: 'seed_' + i, name: 'L' + i, images: [] }];
    ctx.createSafetySnapshot('antes de importar backup');
  }
  await new Promise(r => setTimeout(r, 50));
  const index = JSON.parse(ctx.__backing['atlas:safetySnapshotIndex']);
  assert.equal(index.length, 5, 'no máximo 5 snapshots');
  const keys = Object.keys(ctx.__backing).filter(k => k.indexOf('atlas:safetySnapshot:') === 0);
  assert.equal(keys.length, 5, 'o mais antigo precisa ter sido apagado do storage');
  // o mais recente é o seed_5
  assert.equal(index[0].lesionCount, 1);
});

test('SNAPSHOT: reload mantém a lista (índice persistido)', async () => {
  const backing = {};
  const ctx = makeSnapshotContext(backing);
  ctx.DATA = [{ id: 'seed_1', name: 'L', images: [] }];
  ctx.createSafetySnapshot('antes de importar backup');
  await new Promise(r => setTimeout(r, 50));
  const ctx2 = makeSnapshotContext(backing); // mesmo "disco"
  const list = await ctx2.loadSafetySnapshots();
  assert.equal(list.length, 1);
  assert.equal(list[0].reason, 'antes de importar backup');
  assert.ok(list[0].id);
});

test('SNAPSHOT: restauração cria um snapshot do estado ATUAL antes de sobrescrever', async () => {
  const ctx = makeSnapshotContext();
  ctx.DATA = [{ id: 'seed_1', name: 'Estado A', images: [] }];
  const snapA = ctx.createSafetySnapshot('antes de importar backup');
  await new Promise(r => setTimeout(r, 30));
  ctx.DATA = [{ id: 'seed_1', name: 'Estado B', images: [] }];
  await ctx.restoreSafetySnapshot(snapA.id);
  await new Promise(r => setTimeout(r, 30));
  const index = JSON.parse(ctx.__backing['atlas:safetySnapshotIndex']);
  assert.ok(index.some(m => m.reason === 'antes de restaurar snapshot de segurança'), 'precisa criar snapshot do estado atual antes de restaurar');
  // o estado restaurado é o A
  assert.equal(ctx.DATA[0].name, 'Estado A');
});

test('SNAPSHOT: restauração não tem UI; só a infraestrutura manual continua no código', () => {
  // nenhum fluxo automático (loadData/sync) chama a restauração
  const loadData = extractFunction(html, 'loadData');
  assert.doesNotMatch(loadData.body, /restoreSafetySnapshot/);
  // a restauração não aparece mais na interface (botão removido)
  assert.doesNotMatch(html, /id="btn-restore-snapshot"/);
  const calls = [...html.matchAll(/restoreSafetySnapshot\s*\(/g)];
  assert.equal(calls.length, 1, 'apenas a definição da função (sem call site de UI)');
  assert.match(html, /async function restoreSafetySnapshot\(id\)\{/);
});

// ===========================================================================
// OWNERSHIP
// ===========================================================================
test('OWNERSHIP: automação NÃO pode trocar/remover lesionId de uma imagem existente', () => {
  const ctx = makeOwnershipContext();
  const img = cloudinaryImage({ lesionId: 'seed_1' });
  assert.equal(ctx.canChangeImageOwnership(img, 'seed_2', {}), false, 'automação não troca dono');
  assert.equal(ctx.canChangeImageOwnership(img, 'seed_2', { manual: false }), false);
  assert.equal(ctx.canChangeImageOwnership(img, '', {}), false, 'automação não remove dono');
  const blocked = ctx.assertManualImageOwnershipChange(img, 'seed_2', {});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'automatic_ownership_change_blocked');
  assert.equal(img.lesionId, 'seed_1', 'a imagem original não pode ser alterada');
});

test('OWNERSHIP: manter o MESMO dono é sempre permitido (idempotente)', () => {
  const ctx = makeOwnershipContext();
  const img = cloudinaryImage({ lesionId: 'seed_1' });
  assert.equal(ctx.canChangeImageOwnership(img, 'seed_1', {}), true);
  assert.equal(ctx.assertManualImageOwnershipChange(img, 'seed_1', {}).ok, true);
});

test('OWNERSHIP: ação MANUAL explícita pode trocar/remover o dono', () => {
  const ctx = makeOwnershipContext();
  const manual = readGlobal(ctx, 'IMAGE_OWNERSHIP_MANUAL');
  const img = cloudinaryImage({ lesionId: 'seed_1' });
  assert.equal(ctx.canChangeImageOwnership(img, 'seed_2', manual), true);
  assert.equal(ctx.canChangeImageOwnership(img, '', manual), true);
  assert.equal(ctx.assertManualImageOwnershipChange(img, 'seed_2', manual).ok, true);
});

test('OWNERSHIP: conflito bloqueado é REGISTRADO (nunca resolvido em silêncio)', () => {
  const ctx = makeOwnershipContext();
  ctx.clearImageOwnershipConflicts();
  ctx.assertManualImageOwnershipChange(cloudinaryImage({ lesionId: 'seed_1' }), 'seed_2', {});
  const conflicts = ctx.getImageOwnershipConflicts();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, 'automatic_ownership_change_blocked');
  assert.equal(conflicts[0].fromLesionId, 'seed_1');
  assert.equal(conflicts[0].toLesionId, 'seed_2');
});

test('OWNERSHIP: detectImageOwnershipConflicts acha asset em 2 lesões e dono divergente', () => {
  const ctx = makeOwnershipContext();
  const imgA = cloudinaryImage({ lesionId: 'seed_1' });
  const imgB = cloudinaryImage({ lesionId: 'seed_2' }); // MESMO assetId/publicId
  const data = [
    { id: 'seed_1', name: 'L1', images: [imgA] },
    { id: 'seed_2', name: 'L2', images: [imgB] },
    { id: 'seed_3', name: 'L3', images: [cloudinaryImage({ assetId: 'A9', publicId: 'atlas-radiologico/y', lesionId: 'seed_3' })] }
  ];
  const conflicts = ctx.detectImageOwnershipConflicts(data);
  assert.ok(conflicts.some(c => c.kind === 'asset_in_multiple_lesions'), 'mesmo asset em 2 lesões precisa ser conflito');
  // seed_2 contém uma imagem cujo dono (seed_2) é a própria lesão — sem mismatch aqui;
  // cria um mismatch explícito:
  const data2 = [{ id: 'seed_4', name: 'L4', images: [cloudinaryImage({ lesionId: 'seed_5', assetId: 'A7', publicId: 'atlas-radiologico/z' })] }];
  const mism = ctx.detectImageOwnershipConflicts(data2);
  assert.ok(mism.some(c => c.kind === 'image_owner_mismatch' && c.lesionId === 'seed_4' && c.imageOwnerId === 'seed_5'));
});

test('OWNERSHIP: importação conflitante NÃO sobrescreve a atribuição local', () => {
  const ctx = makeOwnershipContext();
  ctx.clearImageOwnershipConflicts();
  const local = [{ id: 'seed_1', name: 'Local', images: [cloudinaryImage({ lesionId: 'seed_1', lesionName: 'Local' })] }];
  const imported = [
    { id: 'seed_1', name: 'Local', images: [] },
    { id: 'seed_2', name: 'Importada', images: [cloudinaryImage({ lesionId: 'seed_2', lesionName: 'Importada' })] }
  ];
  const conflicts = ctx.preserveLocalImageOwnershipOnImport(imported, local);
  assert.equal(conflicts.length, 1, 'precisa registrar o conflito');
  // a imagem voltou para o dono local (seed_1) e saiu de seed_2
  assert.equal(imported[0].images.length, 1);
  assert.equal(imported[0].images[0].lesionId, 'seed_1');
  assert.equal(imported[1].images.length, 0);
  const reg = ctx.getImageOwnershipConflicts();
  assert.ok(reg.some(c => c.kind === 'import_ownership_preserved' && c.preservedLesionId === 'seed_1'));
});

test('OWNERSHIP: importação de imagem NOVA (sem dono local) mantém o dono do backup', () => {
  const ctx = makeOwnershipContext();
  const imported = [{ id: 'seed_2', name: 'Importada', images: [cloudinaryImage({ lesionId: 'seed_2', assetId: 'NEW', publicId: 'atlas-radiologico/new' })] }];
  const conflicts = ctx.preserveLocalImageOwnershipOnImport(imported, []);
  assert.equal(conflicts.length, 0);
  assert.equal(imported[0].images[0].lesionId, 'seed_2');
});

test('OWNERSHIP: só a ação manual de remover imagem (editor) tira a referência', () => {
  // removeImageFromLesionData só remove do array da lesão informada, sob ação da UI
  const removeFn = extractFunction(html, 'removeImageFromLesionData');
  assert.match(removeFn.body, /lesion\.images\.splice\(imageIndex, 1\)/);
  assert.doesNotMatch(removeFn.body, /\bDATA\b/, 'não toca DATA inteiro nem outra lesão');
});

test('OWNERSHIP: nenhum fluxo automático de loadData reescreve lesionId das imagens', () => {
  const loadData = extractFunction(html, 'loadData');
  assert.doesNotMatch(loadData.body, /lesionId\s*=/, 'loadData não pode reescrever ownership automaticamente');
  assert.doesNotMatch(loadData.body, /rewriteImageOwnershipV2|rewriteMigratedImageOwner/, 'os reescritores de ownership são só da ferramenta V2 manual');
});

test('OWNERSHIP: imagem persistida mantém a atribuição após F5 (loadData preserva o array de imagens)', () => {
  const loadData = extractFunction(html, 'loadData');
  // a atualização canônica do loadData só SOMA imagens (união), nunca troca dono
  assert.match(loadData.body, /stableImageKeyV208\(img\)/);
  assert.doesNotMatch(loadData.body, /lesionId\s*[:=]/, 'não reatribui dono');
});


// ===========================================================================
// AUDITORIA + SINCRONIZAÇÃO LOCAL ↔ NUVEM (read-only + ações explícitas)
// ===========================================================================

const syncAuditCountersFn = extractFunction(html, 'syncAuditCounters');
const buildSyncAuditFn = extractFunction(html, 'buildSyncAudit');
const syncThisDeviceToCloudFn = extractFunction(html, 'syncThisDeviceToCloud');
const writeShardedStateFn = extractFunction(html, 'writeShardedState');
const migrateLegacyFn = extractFunction(html, 'migrateLegacyLocalImagesToCloudinary');
const openSyncToCloudFn = extractFunction(html, 'openSyncDeviceToCloudModal');
const openUpdateFromCloudFn = extractFunction(html, 'openUpdateFromCloudModal');

function runSyncAuditCounters(data, revisions, review, srs){
  const ctx = { Object, Array };
  vm.createContext(ctx);
  vm.runInContext(syncAuditCountersFn.source, ctx, { filename: 'sync-audit-counters.js' });
  return ctx.syncAuditCounters(data, revisions, review, srs);
}

function runBuildSyncAudit({ localData, cloudData, fb }){
  const ctx = {
    DATA: localData || [],
    LESION_REVISIONS: { r1:{}, r2:{}, r3:{} },
    REVIEW: { a:1, b:1 },
    SRS: { s1:{} },
    SUPPRESSED_DUPLICATE_IDS_V172: new Set(),
    fbDb: (fb === undefined) ? {} : fb,
    withFirebaseTimeout: (p)=>p,
    readShardedState: async ()=> cloudData ? { data: cloudData, review:{}, srs:{ s1:{} } } : null,
    storage: { set: async ()=>{ throw new Error('buildSyncAudit NÃO pode gravar'); } },
    saveData: ()=>{ throw new Error('buildSyncAudit NÃO pode salvar'); },
    writeShardedStateSerialized: ()=>{ throw new Error('buildSyncAudit NÃO pode enviar'); },
    createSafetySnapshot: ()=>{ throw new Error('buildSyncAudit NÃO pode criar snapshot'); }
  };
  vm.createContext(ctx);
  vm.runInContext(syncAuditCountersFn.source + '\n' + buildSyncAuditFn.source, ctx, { filename: 'sync-audit.js' });
  return ctx;
}

function cloudEntry(id, imgs, alt){
  const e = { id, name:'L'+id, s:'S', site:'T', images: [] };
  for(let i=0;i<imgs;i++) e.images.push({ data:'https://res.cloudinary.com/x/'+id+'/'+i+'.jpg', publicId:'atlas-radiologico/'+id+i, lesionId:id });
  if(alt) e.altPlacements = alt;
  return e;
}

test('SYNC AUDIT: syncAuditCounters conta lesões/imagens/altPlacements/SRS/revisões (função pura)', () => {
  const data = [ cloudEntry('a', 2), cloudEntry('b', 0, [{s:'N',site:'E'}]), { id:'c', img:'https://x/y.jpg' } ];
  const c = runSyncAuditCounters(data, { r1:{}, r2:{} }, { x:1 }, { s1:{}, s2:{}, s3:{} });
  assert.equal(c.lesions, 3);
  assert.equal(c.entriesWithImages, 2, 'a e c têm imagem; b não');
  assert.equal(c.totalImages, 3, '2 + 0 + 1 (img legado)');
  assert.equal(c.altPlacements, 1);
  assert.equal(c.revisions, 2);
  assert.equal(c.srs, 3);
});

test('SYNC AUDIT: buildSyncAudit é READ-ONLY (não grava local, não envia, não cria snapshot)', () => {
  const body = buildSyncAuditFn.body;
  assert.doesNotMatch(body, /storage\.set|saveData\(|writeShardedState|pushToFirebase|createSafetySnapshot|restoreSafetySnapshot/);
  assert.match(body, /readShardedState/, 'só lê o estado remoto');
});

test('SYNC AUDIT (dinâmico): detecta divergência de contagem e NÃO grava nada', async () => {
  const ctx = runBuildSyncAudit({
    localData: [ cloudEntry('a', 2), cloudEntry('b', 1) ],
    cloudData: [ cloudEntry('a', 2) ]
  });
  const audit = await ctx.buildSyncAudit();
  assert.equal(audit.local.lesions, 2);
  assert.equal(audit.cloud.lesions, 1);
  assert.equal(audit.divergent, true, '2 vs 1 lesões precisa ser detectado como divergência');
  assert.equal(audit.cloud.storesRevisions, false, 'Firestore não guarda LESION_REVISIONS');
  assert.equal(audit.cloudError, null);
});

test('SYNC AUDIT (dinâmico): contadores iguais -> divergent=false', async () => {
  const same = [ cloudEntry('a', 2), cloudEntry('b', 1) ];
  const ctx = runBuildSyncAudit({ localData: same, cloudData: JSON.parse(JSON.stringify(same)) });
  const audit = await ctx.buildSyncAudit();
  assert.equal(audit.divergent, false);
});

test('SYNC AUDIT (dinâmico): Firebase indisponível -> cloudError e nenhuma escrita', async () => {
  const ctx = runBuildSyncAudit({ localData: [ cloudEntry('a', 1) ], cloudData: null, fb: null });
  const audit = await ctx.buildSyncAudit();
  assert.equal(audit.cloud, null);
  assert.match(audit.cloudError, /Firebase indisponível/);
});

test('SYNC PUSH: cria snapshot ANTES de enviar e NÃO mexe em ownership', () => {
  const body = syncThisDeviceToCloudFn.body;
  const snapIdx = body.indexOf("createSafetySnapshot('antes de sincronizar este dispositivo com a nuvem')");
  const pushIdx = body.indexOf('writeShardedStateSerialized');
  assert.ok(snapIdx !== -1 && pushIdx !== -1 && snapIdx < pushIdx, 'snapshot precisa vir ANTES do envio');
  assert.doesNotMatch(body, /canChangeImageOwnership|assertManualImageOwnershipChange|registerImageOwnershipConflict/, 'push não altera ownership');
  assert.doesNotMatch(body, /syncFromFirebase/, 'push nunca puxa da nuvem de volta');
});

test('SYNC PUSH: writeShardedState envia DATA (metadados/imagens) e não reenvia binários ao Cloudinary', () => {
  assert.match(writeShardedStateFn.body, /stripUndefinedDeep\(DATA\)/, 'serializa o catálogo inteiro (com imagens/URLs)');
  assert.doesNotMatch(writeShardedStateFn.body, /uploadToCloudinary|uploadPendingImage/, 'não faz upload de imagem no push');
});

test('SYNC CLOUDINARY: só imagens locais legadas são enviadas; Cloudinary existente não é reenviado', () => {
  assert.match(migrateLegacyFn.body, /atlas:img:/, 'só migra chaves de imagem local legada');
  assert.match(migrateLegacyFn.body, /\^data:image\\\//, 'só sobe data: URLs antigas');
  assert.doesNotMatch(migrateLegacyFn.body, /entry\.images\.forEach[\s\S]*?uploadToCloudinary/, 'não reenvia imagens já existentes');
});

test('SYNC UI: "sincronizar este dispositivo" é explícito (confirmação no modal) e não puxa de volta', () => {
  assert.match(openSyncToCloudFn.body, /syncThisDeviceToCloud\(\{ onStep/);
  assert.match(openSyncToCloudFn.body, /buildSyncAudit\(\)/, 'mostra a auditoria antes de enviar');
  assert.doesNotMatch(openSyncToCloudFn.body, /syncFromFirebase/, 'o envio não puxa da nuvem');
  // o controle fica dentro do bloco recolhível "Ferramentas avançadas"
  assert.match(html, /id="btn-sync-to-cloud"/);
  assert.match(html, /(?:async\s+)?function openSyncDeviceToCloudModal\(/);
});

test('SYNC UI: "atualizar deste backup/nuvem" exige confirmação, cria snapshot e reusa o merge não destrutivo', () => {
  assert.match(openUpdateFromCloudFn.body, /createSafetySnapshot\('antes de atualizar deste backup\/nuvem'\)/);
  const snapIdx = openUpdateFromCloudFn.body.indexOf('createSafetySnapshot');
  const pullIdx = openUpdateFromCloudFn.body.indexOf('syncFromFirebase');
  assert.ok(snapIdx !== -1 && pullIdx !== -1 && snapIdx < pullIdx, 'snapshot antes do pull');
  assert.match(html, /id="btn-sync-from-cloud"/);
  assert.match(html, /(?:async\s+)?function openUpdateFromCloudModal\(/);
});

test('SYNC: pull automático no boot (F5/login) é GUARDADO e usa só o merge não destrutivo já existente (ALTERAÇÃO 068, 2026-09-23)', () => {
  const loadData = extractFunction(html, 'loadData');
  // remove linhas de comentário antes de checar chamadas ATIVAS — o próprio
  // comentário que documenta esta alteração menciona "syncFromFirebase()"
  // várias vezes de propósito.
  const activeCode = loadData.body.split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
  const activeCalls = [...activeCode.matchAll(/syncFromFirebase\(\)/g)];
  assert.equal(activeCalls.length, 1, 'loadData() precisa ter exatamente UMA chamada ativa a syncFromFirebase()');
  // Guardado por !isNewLocalDevice: dispositivo novo já resolveu a decisão
  // explicitamente no modal do bootstrap alguns passos antes — repetir aqui
  // pisaria nessa escolha (inclusive "usar vazio mesmo assim").
  assert.match(loadData.body, /if\(!isNewLocalDevice\)\{\s*\n\s*await syncFromFirebase\(\);\s*\n\s*\}/, 'a chamada automática precisa ficar dentro do guard !isNewLocalDevice');
  // Nenhuma lógica de merge paralela: continua sendo a MESMA syncFromFirebase()
  // usada pelos botões explícitos, com snapshot antes/depois e merge não
  // destrutivo (mergeEntryNonDestructive) — nunca um overwrite cego.
  const syncFn = extractFunction(html, 'syncFromFirebase');
  assert.match(syncFn.body, /createSafetySnapshot\('antes da sincronização Firebase'\)/, 'syncFromFirebase precisa continuar criando snapshot antes de reconciliar');
  // ALTERAÇÃO 074: merge mora no núcleo compartilhado (pull e pre-push) —
  // mesma lógica, sem overwrite cego e sem merge paralelo.
  assert.match(syncFn.body, /reconcileStateWithRemote\(remote\)/, 'pull usa o núcleo de reconciliação compartilhado');
  const syncCore = extractFunction(html, 'reconcileStateWithRemote');
  assert.match(syncCore.body, /mergeEntryNonDestructive/, 'o núcleo precisa continuar usando o merge não destrutivo, nunca overwrite cego');
});

test('SYNC BACKUP FALLBACK: backup completo inclui DATA/imagens/revisões/SRS e não embute binários', () => {
  const exportHandler = html.slice(html.indexOf("document.getElementById('btn-export').onclick"), html.indexOf("document.getElementById('btn-import').onclick"));
  assert.match(exportHandler, /data: DATA/);
  assert.match(exportHandler, /lesionRevisions: LESION_REVISIONS/);
  assert.match(exportHandler, /srs: SRS/);
  assert.match(exportHandler, /review: REVIEW/);
  assert.doesNotMatch(exportHandler, /uploadToCloudinary/, 'backup não envia binários');
  assert.doesNotMatch(exportHandler, /readAsDataURL|toDataURL/, 'backup não embute base64 das imagens');
});


// ===========================================================================
// VERIFICAÇÃO PÓS-PUSH (o push só confirma se o servidor corresponder)
// ===========================================================================

const syncCountersMatchFn = extractFunction(html, 'syncCountersMatch');
const readCloudAuditFromServerFn = extractFunction(html, 'readCloudAuditFromServer');
const writeShardedStateFullFn = extractFunction(html, 'writeShardedState');
const readShardedStateFn = extractFunction(html, 'readShardedState');

function runSyncCountersMatch(local, server){
  const ctx = { Object, Array };
  vm.createContext(ctx);
  vm.runInContext(syncCountersMatchFn.source, ctx, { filename: 'sync-match.js' });
  return ctx.syncCountersMatch(local, server);
}

test('SYNC PUSH: aguarda writeShardedStateSerialized e DEPOIS relê o servidor', () => {
  const body = syncThisDeviceToCloudFn.body;
  const writeIdx = body.indexOf('await writeShardedStateSerialized');
  const verifyIdx = body.indexOf('readCloudAuditFromServer');
  assert.ok(writeIdx !== -1, 'precisa aguardar a escrita');
  assert.ok(verifyIdx !== -1 && verifyIdx > writeIdx, 'precisa verificar o servidor DEPOIS da escrita');
  assert.match(body, /await readCloudAuditFromServer\(\)/, 'a verificação é awaited');
});

test('SYNC PUSH: erro de escrita NÃO vira sucesso', () => {
  const body = syncThisDeviceToCloudFn.body;
  // o ramo de escrita recusada retorna ok:false ANTES de qualquer sucesso
  const refuseIdx = body.indexOf("reason:'write_refused'");
  const successIdx = body.indexOf('ok:true');
  assert.ok(refuseIdx !== -1 && successIdx !== -1 && refuseIdx < successIdx);
  assert.match(body, /catch\(e\)\{[\s\S]*?return \{ ok:false/, 'exceção vira ok:false');
});

test('SYNC PUSH: só confirma se local == servidor (syncCountersMatch)', () => {
  const body = syncThisDeviceToCloudFn.body;
  assert.match(body, /syncCountersMatch\(localCounters, serverCounters\)/);
  const mismatchIdx = body.indexOf("reason:'verification_mismatch'");
  const successIdx = body.indexOf('ok:true');
  assert.ok(mismatchIdx !== -1 && mismatchIdx < successIdx, 'mismatch retorna antes do sucesso');
  assert.match(body, /Envio concluído, mas a verificação do servidor não corresponde ao estado local/);
});

test('SYNC MATCH (dinâmico): compara lesões/imagens/altPlacements/SRS e detecta divergência', () => {
  const base = { lesions:1213, entriesWithImages:53, totalImages:66, altPlacements:11, srs:40 };
  assert.equal(runSyncCountersMatch(base, Object.assign({}, base)), true);
  assert.equal(runSyncCountersMatch(base, Object.assign({}, base, { entriesWithImages:51 })), false);
  assert.equal(runSyncCountersMatch(base, Object.assign({}, base, { totalImages:61 })), false);
  assert.equal(runSyncCountersMatch(base, Object.assign({}, base, { srs:31 })), false);
  assert.equal(runSyncCountersMatch(base, Object.assign({}, base, { lesions:1212 })), false);
  assert.equal(runSyncCountersMatch(base, null), false, 'sem leitura do servidor não confirma');
});

test('SYNC PUSH: NÃO puxa da nuvem, NÃO altera ownership e NÃO reenvia imagens remotas', () => {
  const body = syncThisDeviceToCloudFn.body;
  assert.doesNotMatch(body, /syncFromFirebase/, 'nunca puxa de volta');
  assert.doesNotMatch(body, /canChangeImageOwnership|assertManualImageOwnershipChange|registerImageOwnershipConflict|lesionId\s*=|lesionName\s*=/, 'não altera ownership');
  // a única migração de imagem é a de imagens locais legadas
  assert.match(body, /migrateLegacyLocalImagesToCloudinary\(\)/);
});

test('SYNC VERIFY: a leitura pós-envio força SERVIDOR (nunca cache)', () => {
  assert.match(readCloudAuditFromServerFn.body, /readShardedState\(/);
  assert.match(readShardedStateFn.body, /get\(\{source:'server'\}\)/, 'a leitura de meta força servidor');
  assert.match(readShardedStateFn.body, /get\(\{source:'server'\}\)/, 'os pedaços também vêm do servidor');
});

test('SYNC UI: a auditoria pode reler o servidor sem reutilizar o resultado anterior', () => {
  assert.match(openSyncToCloudFn.body, /id="sync-refresh"/);
  assert.match(openSyncToCloudFn.body, /const refreshAudit = async \(\)=>\{/);
  // a cada refresh, chama buildSyncAudit() de novo (nova leitura), não reusa variável antiga
  assert.match(openSyncToCloudFn.body, /await refreshAudit\(\)/);
  assert.match(openSyncToCloudFn.body, /await refreshAudit\(\); \/\/ atualiza a coluna Nuvem com a leitura pós-escrita/);
  assert.match(openUpdateFromCloudFn.body, /id="sync-refresh"/);
});

test('SYNC PATHS: escrita e leitura usam os MESMOS caminhos (atlas_state/main + data_chunk_i)', () => {
  // ALTERAÇÃO 070 (2026-09-23): a escrita passou a ser feita dentro de uma
  // transação (tx.set(ref, dados) em vez de ref.set(dados)) para permitir a
  // verificação de revisão — os CAMINHOS (FB_META_REF/FB_CHUNK_REF) são os
  // mesmos de sempre, só a forma de escrever neles mudou.
  assert.match(writeShardedStateFullFn.body, /tx\.set\(FB_META_REF\(\)/);
  assert.match(writeShardedStateFullFn.body, /tx\.set\(FB_CHUNK_REF\(i\)/);
  assert.match(readShardedStateFn.body, /FB_META_REF\(\)\.get/);
  assert.match(readShardedStateFn.body, /FB_CHUNK_REF\(i\)\.get/);
  assert.match(html, /const FB_META_REF = \(\) => fbDb\.collection\('atlas_state'\)\.doc\('main'\);/);
  assert.match(html, /const FB_CHUNK_REF = \(i\) => fbDb\.collection\('atlas_state'\)\.doc\('data_chunk_'\+i\);/);
});


// ===========================================================================
// MERGE ADITIVO DE IMAGENS (pull nuvem→local e push local→nuvem)
// ===========================================================================

const IDENTITY_KEYS_FN = extractFunction(html, 'imageIdentityKeys');
const UNION_FN = extractFunction(html, 'unionEntryImages');
const MERGE_PUSH_FN = extractFunction(html, 'mergeEntryForImagePush');
const MERGE_PUSH_CLOUD_FN = extractFunction(html, 'mergeThisDeviceImagesToCloud');
const MERGE_NONDESTRUCTIVE_FN = extractFunction(html, 'mergeEntryNonDestructive');

function buildUnionCtx(){
  const ctx = { console, JSON, Object, Array, String, Number, Map, Set };
  vm.createContext(ctx);
  vm.runInContext(OWNERSHIP_SOURCE + '\n' + 'let PULL_IMAGE_OWNERSHIP_CONFLICTS=[];let PUSH_IMAGE_OWNERSHIP_CONFLICTS=[];\n' + IDENTITY_KEYS_FN.source + '\n' + UNION_FN.source, ctx, { filename: 'union.js' });
  ctx.__pull = () => vm.runInContext('PULL_IMAGE_OWNERSHIP_CONFLICTS', ctx);
  return ctx;
}
const img = (over) => Object.assign({ data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/a.jpg', publicId:'atlas-radiologico/a', lesionId:'seed_1' }, over || {});

test('UNION IMAGENS: base + novas (sem duplicar); nunca apaga a base', () => {
  const ctx = buildUnionCtx();
  const base = [img({ publicId:'atlas-radiologico/1', data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/1.jpg' })];
  const add = [ base[0], img({ publicId:'atlas-radiologico/2', data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/2.jpg' }) ];
  const out = ctx.unionEntryImages(base, add, { id:'seed_1', name:'L' }, [], 'pull');
  assert.equal(out.length, 2, 'não duplica a existente e adiciona a nova');
  // nunca apaga: base + nada => base
  assert.equal(ctx.unionEntryImages(base, [], { id:'seed_1' }, [], 'pull').length, 1);
  // add vazio e base com 2 => 2
  const two = [base[0], add[1]];
  assert.equal(ctx.unionEntryImages(two, [], { id:'seed_1' }, [], 'pull').length, 2);
});

test('UNION IMAGENS: dedup por publicId e por URL normalizada', () => {
  const ctx = buildUnionCtx();
  const a = img({ publicId:'atlas-radiologico/x', data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/x.jpg' });
  const aUrlVariant = img({ publicId:'', data:'https://res.cloudinary.com/x/image/upload/v999/atlas-radiologico/x.jpg?foo=1#bar' });
  const out = ctx.unionEntryImages([a], [aUrlVariant], { id:'seed_1' }, [], 'pull');
  assert.equal(out.length, 1, 'mesmo asset (publicId/URL normalizada) não duplica');
});

test('UNION IMAGENS: ownership igual permite incorporar; conflitante é BLOQUEADO e reportado', () => {
  const ctx = buildUnionCtx();
  const okImg = img({ publicId:'atlas-radiologico/ok', data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/ok.jpg', lesionId:'seed_1' });
  const out = ctx.unionEntryImages([], [okImg], { id:'seed_1', name:'L' }, [], 'pull');
  assert.equal(out.length, 1, 'mesma lesão => incorpora');
  const foreign = img({ publicId:'atlas-radiologico/f', data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/f.jpg', lesionId:'seed_9' });
  const sink = [];
  const out2 = ctx.unionEntryImages([], [foreign], { id:'seed_1', name:'L' }, sink, 'pull');
  assert.equal(out2.length, 0, 'imagem de OUTRA lesão não é movida');
  assert.equal(sink.length, 1, 'conflito reportado');
  assert.equal(sink[0].fromLesionId, 'seed_9');
});

test('UNION IMAGENS: imagem sem dono (lesionId vazio) pode ser incorporada', () => {
  const ctx = buildUnionCtx();
  const orphan = img({ publicId:'atlas-radiologico/o', data:'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/o.jpg', lesionId:'' });
  const out = ctx.unionEntryImages([], [orphan], { id:'seed_1' }, [], 'pull');
  assert.equal(out.length, 1);
});

test('MERGE PUSH (estático): servidor-only, union aditiva, preserva SRS/REVIEW/SESSIONLOG, verifica servidor', () => {
  const src = MERGE_PUSH_CLOUD_FN.source;
  assert.match(src, /readShardedState\(/, 'lê do servidor');
  assert.match(src, /mergeEntryForImagePush\(l, r\)/);
  assert.match(src, /mergeSRSPreservingNewest\(SRS, remote && remote\.srs\)/, 'SRS remoto preservado (mais novo vence)');
  assert.match(src, /mergeReviewPreservingProgress\(REVIEW, remote && remote\.review\)/);
  assert.match(src, /mergeSessionLogPreservingProgress\(SESSIONLOG, remote && remote\.sessionLog\)/);
  assert.match(src, /writeShardedStateSerialized\(20000\)/);
  assert.match(src, /readCloudAuditFromServer\(\)/, 'verificação pós-merge no servidor');
  assert.doesNotMatch(src, /uploadToCloudinary|uploadPendingImage/, 'não reenvia imagens ao Cloudinary');
  assert.match(src, /server\.totalImages >= localCounters\.totalImages/, 'sucesso só se as imagens estão no servidor');
  assert.match(src, /server\.srs >= beforeServer\.srs/, 'sucesso só se o SRS não regrediu');
});

test('MERGE NAO-DESTRUTIVO (estático): clinicalCases usa UNION aditiva (nunca overwrite/perda ao sincronizar entre dispositivos)', () => {
  const src = MERGE_NONDESTRUCTIVE_FN.source;
  assert.match(src, /unionClinicalCases\(local\.clinicalCases, remote\.clinicalCases\)/, 'casos clínicos são unidos, não sobrescritos por spread');
});

test('MERGE PUSH (estático): mergeEntryForImagePush usa o remoto como base e só soma imagens locais', () => {
  const src = MERGE_PUSH_FN.source;
  assert.match(src, /mergeEntryNonDestructive\(localEntry, remoteEntry\)/);
  assert.match(src, /unionEntryImages\(remoteEntry\.images, localEntry\.images, merged, PUSH_IMAGE_OWNERSHIP_CONFLICTS, 'push'\)/);
});

test('AUDIT: divergência cruzada é detectada (imagens local>nuvem e SRS nuvem>local)', () => {
  // buildSyncAudit devolve crossDivergent quando cada lado é mais novo num domínio
  const src = extractFunction(html, 'buildSyncAudit').source;
  assert.match(src, /localImagesAhead = !!cloud && local\.totalImages > cloud\.totalImages/);
  assert.match(src, /cloudSrsAhead = !!cloud && cloud\.srs > local\.srs/);
  assert.match(src, /crossDivergent = !!\(cloud && localImagesAhead && cloudSrsAhead\)/);
  assert.match(src, /return \{ local, cloud, cloudError, divergent, localImagesAhead, cloudSrsAhead, crossDivergent \}/);
});

test('AUDIT (UI): aviso de divergência cruzada e botão de merge de imagens existem', () => {
  assert.match(html, /dados mais novos em áreas diferentes/);
  assert.match(html, /id="sync-merge-images"/);
  assert.match(html, /Mesclar imagens deste dispositivo na nuvem/);
  assert.match(html, /mergeBtn\.hidden = !audit\.crossDivergent/);
});
