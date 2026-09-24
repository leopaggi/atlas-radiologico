'use strict';

/* Testes do BOOTSTRAP SEGURO EM DISPOSITIVO NOVO (2026-09-21).
 *
 * Contexto do defeito corrigido: um navegador sem catálogo local ainda
 * (STORAGE_KEY ausente no IndexedDB — sempre verdadeiro na primeira abertura
 * num computador novo) fazia loadData() usar o SEED cru como DATA e, mais
 * adiante no MESMO boot, um pushToFirebaseNow() incondicional enviava esse
 * catálogo sem imagens/SRS/progresso para o Firestore — sobrescrevendo
 * (overwrite total, writeShardedState faz .set(), não merge) o estado real
 * que já existia na nuvem. Foi isso que zerou o Atlas ao abrir num segundo
 * computador do hospital.
 *
 * Como o resto da suíte, extrai o trecho REAL do index.html e roda num `vm`
 * isolado, com stubs locais. Nenhum teste acessa IndexedDB, Firebase,
 * Cloudinary ou rede de verdade. Interações de modal (DOM) são cobertas por
 * asserções estáticas no corpo das funções — o projeto não tem jsdom (ver
 * outros arquivos de teste), então a decisão do usuário é testada pela
 * função pura que a APLICA (applyNewDeviceBootstrapChoice), não pela UI.
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
const loadDataFn = extractFunction(html, 'loadData');
const writeShardedStateFn = extractFunction(html, 'writeShardedState');
// ALTERAÇÃO 079b — writeShardedState() agora consome pendingWriteImageExclusionsById
// e chama imageIdentityKeys() ao montar o payload.
const imageIdentityKeysFn079b = extractFunction(html, 'imageIdentityKeys');
// ALTERAÇÃO 079c — barreira final de imagens dentro da transação de
// writeShardedState(): gate puro + união/aplicação de tombstones.
const helpers079c = ['gateStaleLocalOnlyImagesForWrite', 'mergeImageTombstones', 'normalizeTombstoneMap',
  'tombstoneScopeKey', 'isValidImageTombstone', 'tombstoneTime', 'applyImageTombstonesToList',
  'isImageTombstoned', 'stableImageKeyV208'].map((n) => extractFunction(html, n).source).join('\n');
const syncThisDeviceToCloudFn = extractFunction(html, 'syncThisDeviceToCloud');
const mergeThisDeviceImagesToCloudFn = extractFunction(html, 'mergeThisDeviceImagesToCloud');
const checkCloudFn = extractFunction(html, 'checkCloudForBootstrapV1');
const modalFn = extractFunction(html, 'openNewDeviceBootstrapModal');
const applyChoiceFn = extractFunction(html, 'applyNewDeviceBootstrapChoice');
const flowFn = extractFunction(html, 'runNewDeviceBootstrapFlow');
const isInitFn = extractFunction(html, 'isDeviceMarkedInitialized');
const markInitFn = extractFunction(html, 'markDeviceInitialized');
const mergeEntryNonDestructiveFn = extractFunction(html, 'mergeEntryNonDestructive');
const mergeReviewFn = extractFunction(html, 'mergeReviewPreservingProgress');
const mergeSRSFn = extractFunction(html, 'mergeSRSPreservingNewest');
const mergeSessionLogFn = extractFunction(html, 'mergeSessionLogPreservingProgress');
const unionFn = extractFunction(html, 'unionEntryImages');
const dedupeFn = extractFunction(html, 'dedupeEntryImagesOnly');
const identityKeysFn = extractFunction(html, 'imageIdentityKeys');
const stableKeyFn = extractFunction(html, 'stableImageKeyV208');
const isValidAssignedAtFn = extractFunction(html, 'isValidAssignedAt');
const adoptOldestFn = extractFunction(html, 'adoptOldestAssignedAt');
const unionClinicalCasesFn = extractFunction(html, 'unionClinicalCases');
const clinicalCaseIdentityKeyFn = extractFunction(html, 'clinicalCaseIdentityKey');
const normalizeExternalTitleFn = extractFunction(html, 'normalizeExternalTitle');
// ALTERAÇÃO 078 (2026-09-24): "carregar da nuvem" em device novo agora adota
// 1:1, sem passar por mergeEntryNonDestructive/syncFromFirebase.
const adoptRemoteFn = extractFunction(html, 'adoptRemoteStateForNewDevice');
const readShardedStateFn = extractFunction(html, 'readShardedState');
const normalizeTombstoneMapFn = extractFunction(html, 'normalizeTombstoneMap');
const isValidTombFn2 = extractFunction(html, 'isValidImageTombstone');
const saveTombFn2 = extractFunction(html, 'saveImageTombstones');
const tombScopeFn2 = extractFunction(html, 'tombstoneScopeKey');

// ===========================================================================
// 1) DETECÇÃO — checkCloudForBootstrapV1 (server-only, nunca assume vazio)
// ===========================================================================

function makeCheckCloudContext({ fb, readResult, readError } = {}) {
  const ctx = {
    fbDb: (fb === undefined) ? {} : fb,
    readCloudAuditFromServer: async () => {
      if (readError) throw readError;
      return readResult === undefined ? null : readResult;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(checkCloudFn.source, ctx, { filename: 'check-cloud.js' });
  return ctx;
}

test('BOOTSTRAP DETECÇÃO: Firebase indisponível -> offline:true (nunca "vazio")', async () => {
  const ctx = makeCheckCloudContext({ fb: null });
  const status = await ctx.checkCloudForBootstrapV1();
  assert.equal(status.ok, false);
  assert.equal(status.offline, true);
  assert.match(status.error, /Firebase indisponível/);
});

test('BOOTSTRAP DETECÇÃO: leitura falha (offline/erro de rede) -> offline:true, nunca assume vazio', async () => {
  const ctx = makeCheckCloudContext({ readError: new Error('timeout de rede') });
  const status = await ctx.checkCloudForBootstrapV1();
  assert.equal(status.ok, false);
  assert.equal(status.offline, true);
  assert.match(status.error, /timeout de rede/);
});

test('BOOTSTRAP DETECÇÃO: nenhum documento na nuvem (nunca sincronizada por ninguém) -> empty:true (único caso legítimo)', async () => {
  const ctx = makeCheckCloudContext({ readResult: null });
  const status = await ctx.checkCloudForBootstrapV1();
  // objeto criado DENTRO do vm (outro realm) — compara campo a campo em vez
  // de deepEqual, que falha por prototype cross-realm mesmo com mesma forma.
  assert.equal(status.ok, true);
  assert.equal(status.empty, true);
  assert.equal(status.counts, undefined);
});

test('BOOTSTRAP DETECÇÃO: nuvem com estado real (mesmo contadores baixos) -> empty:false + counts, sempre exige confirmação', async () => {
  const counts = { lesions: 1213, entriesWithImages: 58, totalImages: 73, altPlacements: 11, srs: 44 };
  const ctx = makeCheckCloudContext({ readResult: counts });
  const status = await ctx.checkCloudForBootstrapV1();
  assert.equal(status.ok, true);
  assert.equal(status.empty, false);
  assert.deepEqual(status.counts, counts);
});

// ===========================================================================
// 2) BLOQUEIO DE PUSH AMPLO ENQUANTO PENDENTE (writeShardedState = chokepoint)
// ===========================================================================

function makeWriteShardedStateContext({ deviceBootstrapPending, data, knownRevision = 0 }) {
  // ALTERAÇÃO 070 (2026-09-23): writeShardedState() agora escreve dentro de
  // uma transação do Firestore (verificação de revisão — ver CONTEXTO_MESTRE
  // seção 29). O mock de fbDb.runTransaction simula uma nuvem SEMPRE vazia
  // (metaSnap.exists=false -> revisão do servidor = 0), o que junto com
  // knownRevision=0 (padrão) faz a escrita ser aceita nestes testes
  // estruturais, que não são sobre controle de revisão em si.
  const calls = [];
  const metaRef = { __kind: 'meta' };
  const chunkRef = (i) => ({ __kind: 'chunk', __i: i, delete: async () => { calls.push({ kind: 'delete', i }); } });
  const ctx = {
    deviceBootstrapPending: !!deviceBootstrapPending,
    canonicalRestoreInProgress: false,
    CLOUD_REVISION_FIELD: 'revision',
    lastKnownCloudRevision: knownRevision,
    lastWriteRefusedReason: null,
    lastRevisionConflictAt: null,
    DATA: data || [],
    REVIEW: {}, SRS: {}, SESSIONLOG: {}, sectionOrder: [], siteOrder: {},
    // ALTERAÇÃO 073: writeShardedState() real leva tombstones no documento
    // principal (vazio aqui, mesmo padrão dos demais estados).
    IMAGE_TOMBSTONES: {},
    DATA_CHUNK_SIZE: 150,
    FB_META_REF: () => metaRef,
    FB_CHUNK_REF: chunkRef,
    withFirebaseTimeout: (p) => p,
    setSyncStatus: () => {},
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
    fbDb: {
      runTransaction: async (fn) => {
        const tx = {
          get: async (ref) => ({ exists: false, data: () => ({}) }),
          set: (ref, payload) => { calls.push({ kind: ref.__kind, i: ref.__i, payload }); }
        };
        return fn(tx);
      }
    },
    Blob: class { constructor(parts) { this.size = JSON.stringify(parts).length; } },
    window: {},
    console,
    JSON, Array, Object, Number,
    // ALTERAÇÃO 079 (Parte A) — writeShardedState() agora filtra DATA/REVIEW/SRS
    // pela quarentena diretamente; nenhum id de teste é quarentenado por padrão.
    isQuarantinedSeedId: (id) => false,
    quarantineIndexedByLesionId: (obj) => (obj && typeof obj === 'object') ? obj : {},
    // ALTERAÇÃO 079b — mesma variável real (declarada fora de qualquer
    // função no index.html); nenhum teste deste arquivo simula um reconcile
    // prévio, então fica null (sem exclusão) por padrão, igual ao caminho
    // real de syncThisDeviceToCloud/forceThisDeviceToCloud.
    pendingWriteImageExclusionsById: null
  };
  vm.createContext(ctx);
  vm.runInContext(
    'function stripUndefinedDeep(v){try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}}\n' +
    'function splitIntoChunks(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}\n' +
    'function checkChunkSize(){return true;}\n' +
    imageIdentityKeysFn079b.source + '\n' +
    'let lastWriteStaleImagesBlocked = 0;\n' + helpers079c + '\n' +
    writeShardedStateFn.source,
    ctx, { filename: 'write-sharded-state.js' }
  );
  return { ctx, calls };
}

test('BOOTSTRAP BLOQUEIO: writeShardedState() recusa QUALQUER envio enquanto deviceBootstrapPending=true (nem toca o Firestore)', async () => {
  const { ctx, calls } = makeWriteShardedStateContext({ deviceBootstrapPending: true, data: [{ id: 'seed_1' }] });
  const ok = await ctx.writeShardedState(1000);
  assert.equal(ok, false, 'precisa recusar o envio, não silenciosamente ter sucesso');
  assert.deepEqual(calls, [], 'nenhuma chamada ao Firestore pode acontecer enquanto pendente');
});

test('BOOTSTRAP BLOQUEIO: writeShardedState() funciona normalmente quando deviceBootstrapPending=false (dispositivo já inicializado)', async () => {
  const { ctx, calls } = makeWriteShardedStateContext({ deviceBootstrapPending: false, data: [{ id: 'seed_1' }] });
  const ok = await ctx.writeShardedState(1000);
  assert.equal(ok, true);
  assert.ok(calls.some((c) => c.kind === 'meta'), 'precisa escrever o documento principal quando não está pendente');
});

test('BOOTSTRAP BLOQUEIO: o guard é a PRIMEIRA verificação em writeShardedState (antes de qualquer stripUndefinedDeep/leitura de DATA)', () => {
  const idxGuard = writeShardedStateFn.body.indexOf("if(deviceBootstrapPending){ lastWriteRefusedReason = 'device_bootstrap_pending'; return false; }");
  const idxClean = writeShardedStateFn.body.indexOf('stripUndefinedDeep(DATA.filter(');
  assert.notEqual(idxGuard, -1);
  assert.ok(idxGuard < idxClean, 'o bloqueio precisa vir antes de qualquer preparação de envio');
});

test('BOOTSTRAP BLOQUEIO: "sincronizar este dispositivo" (ação ampla explícita) também recusa e avisa, sem tentar a rede', async () => {
  assert.match(syncThisDeviceToCloudFn.body, /if\(deviceBootstrapPending\)\{\s*toast\('Este dispositivo ainda não foi inicializado com os dados da nuvem\.'\);\s*return \{ ok:false, reason:'device_not_initialized' \};\s*\}/);
  // a checagem precisa vir ANTES de qualquer ação (snapshot/migração/envio)
  const idxGuard = syncThisDeviceToCloudFn.body.indexOf('deviceBootstrapPending');
  const idxSnapshot = syncThisDeviceToCloudFn.body.indexOf('createSafetySnapshot');
  assert.ok(idxGuard !== -1 && idxSnapshot !== -1 && idxGuard < idxSnapshot);
});

test('BOOTSTRAP BLOQUEIO: merge de imagens local→nuvem (mergeThisDeviceImagesToCloud) também recusa enquanto pendente', () => {
  assert.match(mergeThisDeviceImagesToCloudFn.body, /if\(deviceBootstrapPending\)\{\s*toast\('Este dispositivo ainda não foi inicializado com os dados da nuvem\.'\);\s*return \{ ok:false, reason:'device_not_initialized' \};\s*\}/);
});

// ===========================================================================
// 3) DECISÃO — applyNewDeviceBootstrapChoice (pura, sem DOM)
// ===========================================================================

function makeApplyChoiceContext() {
  const calls = { adoptRemote: 0, markInit: 0 };
  const ctx = {
    deviceBootstrapPending: true,
    // ALTERAÇÃO 078: 'load' agora delega para adoptRemoteStateForNewDevice()
    // (adoção 1:1), não mais syncFromFirebase() (merge com o SEED-como-local).
    adoptRemoteStateForNewDevice: async () => { calls.adoptRemote += 1; },
    markDeviceInitialized: () => { calls.markInit += 1; }
  };
  vm.createContext(ctx);
  vm.runInContext(applyChoiceFn.source, ctx, { filename: 'apply-choice.js' });
  return { ctx, calls };
}

test('BOOTSTRAP DECISÃO: escolha "load" chama adoptRemoteStateForNewDevice() (adoção 1:1, ALTERAÇÃO 078) e libera o dispositivo', async () => {
  const { ctx, calls } = makeApplyChoiceContext();
  await ctx.applyNewDeviceBootstrapChoice('load');
  assert.equal(calls.adoptRemote, 1, 'precisa chamar adoptRemoteStateForNewDevice exatamente uma vez');
  assert.equal(calls.markInit, 1);
  assert.equal(ctx.deviceBootstrapPending, false, 'só desbloqueia DEPOIS da escolha explícita');
});

test('BOOTSTRAP DECISÃO: escolha "skip" NÃO toca a nuvem, mas libera o dispositivo (usuário já foi avisado no modal)', async () => {
  const { ctx, calls } = makeApplyChoiceContext();
  await ctx.applyNewDeviceBootstrapChoice('skip');
  assert.equal(calls.adoptRemote, 0, 'skip não pode chamar adoptRemoteStateForNewDevice');
  assert.equal(calls.markInit, 1);
  assert.equal(ctx.deviceBootstrapPending, false);
});

test('BOOTSTRAP DECISÃO: escolha "empty" (nuvem nunca inicializada) também libera sem tocar a nuvem', async () => {
  const { ctx, calls } = makeApplyChoiceContext();
  await ctx.applyNewDeviceBootstrapChoice('empty');
  assert.equal(calls.adoptRemote, 0);
  assert.equal(calls.markInit, 1);
  assert.equal(ctx.deviceBootstrapPending, false);
});

// ===========================================================================
// 4) MODAL (estático — sem jsdom no projeto) e ORQUESTRAÇÃO
// ===========================================================================

test('BOOTSTRAP MODAL: nunca fecha por clique fora/ESC — força uma decisão explícita', () => {
  assert.doesNotMatch(modalFn.body, /ov\.onclick\s*=/, 'não pode fechar clicando fora');
  assert.doesNotMatch(modalFn.body, /addEventListener\('keydown'/, 'não pode fechar com ESC');
});

test('BOOTSTRAP MODAL: "usar vazio mesmo assim" exige confirm() explicando a sobrescrita antes de resolver', () => {
  const skipBlockMatch = modalFn.body.match(/bootstrap-skip'\)\.onclick\s*=\s*\(\)=>\{([\s\S]*?)\n\s*\};/);
  assert.ok(skipBlockMatch, 'handler de skip não encontrado');
  assert.match(skipBlockMatch[1], /confirm\(warn\)/);
  assert.match(skipBlockMatch[1], /SOBRESCREVA a nuvem/);
  assert.match(skipBlockMatch[1], /finish\('skip'\)/);
});

test('BOOTSTRAP MODAL: nuvem com dados mostra a tabela de auditoria (reaproveita syncAuditRowsHtml) e o botão "carregar"', () => {
  assert.match(modalFn.body, /syncAuditRowsHtml\(null, counts\)/, 'reaproveita a mesma renderização usada nos outros modais de sync');
  assert.match(modalFn.body, /bootstrap-load'\)\.onclick\s*=\s*\(\)=>\s*finish\('load'\)/);
});

test('BOOTSTRAP MODAL: estado offline oferece "tentar novamente" (não força o usuário a recarregar a página)', () => {
  assert.match(modalFn.body, /bootstrap-retry/);
  assert.match(modalFn.body, /actions\.querySelector\('#bootstrap-retry'\)\.onclick = runCheck;/);
});

test('BOOTSTRAP MODAL: nuvem vazia (nenhum documento) resolve sozinha, sem perguntar nada ao usuário', () => {
  assert.match(modalFn.body, /if\(status\.empty\)\{\s*finish\('empty'\);\s*return;\s*\}/);
});

test('BOOTSTRAP ORQUESTRAÇÃO: runNewDeviceBootstrapFlow sempre espera o modal antes de aplicar qualquer escolha', () => {
  const idxModal = flowFn.body.indexOf('openNewDeviceBootstrapModal');
  const idxApply = flowFn.body.indexOf('applyNewDeviceBootstrapChoice');
  assert.ok(idxModal !== -1 && idxApply !== -1 && idxModal < idxApply);
});

// ===========================================================================
// 5) MARCADOR LOCAL — isDeviceMarkedInitialized/markDeviceInitialized
// ===========================================================================

test('MARCADOR: é estritamente local (localStorage) — nunca toca storage/IndexedDB, DATA, ou envia à nuvem', () => {
  for (const fn of [isInitFn, markInitFn]) {
    assert.match(fn.body, /localStorage\./);
    assert.doesNotMatch(fn.body, /\bstorage\.(get|set)\(/, 'não pode usar a camada IndexedDB principal');
    assert.doesNotMatch(fn.body, /pushToFirebase|writeShardedState|saveData\(/, 'não pode disparar sincronização');
  }
});

test('MARCADOR: a chave não aparece no handler de backup (export/import) — não faz parte do backup', () => {
  const exportHandler = html.slice(html.indexOf("document.getElementById('btn-export').onclick"), html.indexOf("document.getElementById('btn-import').onclick"));
  const importStart = html.indexOf("document.getElementById('import-file').addEventListener('change'");
  const importHandler = html.slice(importStart, importStart + 6000);
  assert.doesNotMatch(exportHandler, /DEVICE_INITIALIZED_KEY|deviceInitialized/);
  assert.doesNotMatch(importHandler, /DEVICE_INITIALIZED_KEY|deviceInitialized/);
});

test('MARCADOR: leitura tolera localStorage indisponível/bloqueado (não quebra o boot)', () => {
  const ctx = { localStorage: { getItem() { throw new Error('bloqueado'); } } };
  vm.createContext(ctx);
  vm.runInContext(isInitFn.source, ctx, { filename: 'is-init.js' });
  assert.equal(ctx.isDeviceMarkedInitialized(), false, 'falha ao ler deve ser tratada como não inicializado, nunca lançar');
});

// ===========================================================================
// 6) loadData(): não persiste/decide sozinho no catch; roda o bootstrap ANTES
//    de renderAll() (nunca mostra zeros como definitivos antes da checagem)
// ===========================================================================

test('loadData(): o catch de dispositivo novo NÃO chama saveData()/push — só marca isNewLocalDevice e deviceBootstrapPending', () => {
  const body = loadDataFn.body;
  const catchStart = body.indexOf('}catch(e){');
  assert.notEqual(catchStart, -1, 'catch do carregamento de DATA não encontrado');
  const openBrace = body.indexOf('{', catchStart + 1);
  const catchBlock = extractBlock(body, openBrace); // equilibra chaves; tolera \r\n
  const catchBody = catchBlock.slice(1, -1);
  // remove comentários de linha antes de checar chamadas ATIVAS — o próprio
  // comentário explicativo deste bloco menciona "saveData()" de propósito.
  const activeCatchCode = catchBody.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(activeCatchCode, /isNewLocalDevice\s*=\s*true;/);
  assert.match(activeCatchCode, /deviceBootstrapPending\s*=\s*true;/);
  assert.doesNotMatch(activeCatchCode, /saveData\(\)/, 'não pode persistir/empurrar o SEED antes da decisão do usuário');
});

test('loadData(): o bootstrap roda DEPOIS de REVIEW/SRS/SESSIONLOG/LESION_REVISIONS carregados e ANTES de qualquer push/renderAll', () => {
  const body = loadDataFn.body;
  const idxLoadClassification = body.indexOf('await loadClassificationReviewDecisions();');
  const idxBootstrapCheck = body.indexOf('if(isNewLocalDevice){');
  const idxBootstrapCall = body.indexOf('await runNewDeviceBootstrapFlow();');
  const idxDupCleanup = body.indexOf('const dupResult = runDuplicateCleanup();');
  const idxFirstPush = body.indexOf('await pushToFirebaseNow();');
  const idxRenderAll = body.lastIndexOf('renderAll();');
  assert.ok([idxLoadClassification, idxBootstrapCheck, idxBootstrapCall, idxDupCleanup, idxFirstPush, idxRenderAll].every((i) => i !== -1));
  assert.ok(idxLoadClassification < idxBootstrapCheck, 'precisa checar dispositivo novo só depois de REVIEW/SRS/etc. carregados');
  assert.ok(idxBootstrapCheck < idxBootstrapCall);
  assert.ok(idxBootstrapCall < idxDupCleanup, 'a decisão precisa estar tomada antes da limpeza de duplicatas seguinte');
  assert.ok(idxBootstrapCall < idxFirstPush, 'nenhum push pode acontecer antes da decisão');
  assert.ok(idxBootstrapCall < idxRenderAll, 'a decisão precisa estar tomada antes de desenhar a UI — nunca mostra zeros definitivos antes da checagem');
});

test('loadData(): a chamada ao bootstrap é sempre CONDICIONAL a isNewLocalDevice — um dispositivo já inicializado não é afetado', () => {
  assert.match(loadDataFn.body, /if\(isNewLocalDevice\)\{\s*\n\s*await runNewDeviceBootstrapFlow\(\);\s*\n\s*\}/);
});

test('loadData() real: dispositivo NOVO (storage.get lança) aciona o bootstrap ANTES de renderAll(); dispositivo COM catálogo não aciona nada', async () => {
  async function run(storageThrowsOnData) {
    const calls = [];
    const seed = [{ id: 'seed_0', name: 'L0', s: 'S', site: 'T', images: [] }];
    const context = vm.createContext({
      DATA: [], REVIEW: {}, SRS: {}, SESSIONLOG: {}, sectionOrder: [], siteOrder: {},
      appStateReady: false, deviceBootstrapPending: false,
      SEED: seed,
      STORAGE_KEY: 'data', ORDER_KEY: 'order', SITEORDER_KEY: 'site-order', REVIEW_KEY: 'review',
      RECOVERY_KEY: 'recovery', RECOVERY_VERSION: 'test', DEFAULT_SECTION_ORDER: [],
      SUPPRESSED_DUPLICATE_IDS_V172: new Set(),
      QUARANTINED_HIGH_IDS_20260924: new Set(),
      isQuarantinedSeedId: (id) => false,
      activeCanonicalSeedV172: () => seed,
      storage: {
        get: async (key) => {
          if (key === 'data') {
            if (storageThrowsOnData) throw new Error('key not found: data');
            return { value: JSON.stringify(seed) };
          }
          throw new Error('sem estado simulado para ' + key);
        },
        set: async () => {}
      },
      ensureLinks: (e) => { e.links = []; },
      isAutoRadiopaediaLink: () => false,
      radiopaediaSearchUrl: () => '',
      runTagCleanup: () => false,
      ensureInc: (e) => { e.inc = 1; },
      saveData: async () => { calls.push('saveData'); },
      saveOrder: async () => {}, saveSiteOrder: async () => {},
      loadSRS: async () => {}, loadSessionLog: async () => {},
      // ALTERAÇÃO 073: loadData() real carrega tombstones (stub, mesmo padrão).
      loadImageTombstones: async () => {},
      IMAGE_TOMBSTONES: {},
      loadLesionRevisions: async () => {}, loadClassificationReviewDecisions: async () => {},
      saveReview: async () => {}, saveSRS: async () => {},
      createSafetySnapshot: () => null,
      applyAltPlacementsAudit20260918: async () => false,
      applyClassificationAudit20260918: async () => false,
      upgradeDescriptionsV169: async () => {}, upgradeDescriptionsV170: async () => {},
      upgradeDescriptionsV173: async () => {}, upgradeDescriptionsV175: async () => {},
      upgradeDescriptionsV176: async () => {}, upgradeDescriptionsV177: async () => {},
      upgradeDescriptionsV179: async () => {}, upgradeDescriptionsV180: async () => {},
      upgradeDescriptionsV181: async () => {}, upgradeDescriptionsV182: async () => {},
      pushToFirebaseNow: async () => { calls.push('pushToFirebaseNow'); },
      migrateLegacyLocalImagesToCloudinary: async () => ({ migrated: 0 }),
      loadSidebarScopePref: () => ({ section: null, site: null }),
      loadQuizScopePref: () => ({ section: null, site: null }),
      runDuplicateCleanup: () => ({ changed: false, reviewOrSrsChanged: false }),
      deduplicateV171: async () => {},
      runNewDeviceBootstrapFlow: async () => { calls.push('runNewDeviceBootstrapFlow'); },
      // ALTERACAO 068 (2026-09-23): dispositivo JA inicializado (storage.get
      // NAO lanca) agora puxa a nuvem automaticamente — ver asserts abaixo.
      syncFromFirebase: async () => { calls.push('syncFromFirebase'); },
      renderAll: () => { calls.push('renderAll'); },
      console: { error: () => {}, info: () => {}, log: () => {}, warn: () => {} }
    });
    vm.runInContext(loadDataFn.source, context, { filename: 'load-data.js' });
    await context.loadData();
    return calls;
  }

  const newDeviceCalls = await run(true);
  assert.ok(newDeviceCalls.includes('runNewDeviceBootstrapFlow'), 'dispositivo novo precisa acionar o bootstrap');
  assert.ok(
    newDeviceCalls.indexOf('runNewDeviceBootstrapFlow') < newDeviceCalls.indexOf('renderAll'),
    'o bootstrap precisa terminar ANTES de desenhar a UI'
  );
  // Dispositivo novo já resolveu a decisão explicitamente dentro do próprio
  // bootstrap (modal) — loadData() NÃO chama syncFromFirebase() de novo por
  // cima, senão pisaria na escolha "usar vazio mesmo assim" do usuário.
  assert.ok(!newDeviceCalls.includes('syncFromFirebase'), 'dispositivo novo não deve acionar o pull automático — o bootstrap já decidiu');

  const existingDeviceCalls = await run(false);
  assert.ok(!existingDeviceCalls.includes('runNewDeviceBootstrapFlow'), 'dispositivo já inicializado não deve acionar o bootstrap de dispositivo NOVO');
  // ALTERACAO 068 (2026-09-23): dispositivo já inicializado (catálogo local
  // existente) agora aciona o pull automático — é exatamente essa ausência
  // que deixava um PC com IndexedDB antigo (ex.: o do hospital) sem nunca
  // consultar a nuvem de novo, e cujo push incondicional no fim do boot
  // sobrescrevia (writeShardedState faz .set(), não merge) imagens que só
  // existiam na nuvem.
  assert.ok(existingDeviceCalls.includes('syncFromFirebase'), 'dispositivo já inicializado precisa acionar syncFromFirebase() automaticamente no boot');
  assert.ok(
    existingDeviceCalls.indexOf('syncFromFirebase') < existingDeviceCalls.indexOf('renderAll'),
    'o pull precisa terminar ANTES de desenhar a UI'
  );
  assert.ok(existingDeviceCalls.includes('renderAll'));
});

test('loadData() real: reload DEPOIS do bootstrap não repete o fluxo (storage já tem o catálogo persistido)', async () => {
  // Simula: 1ª chamada é um dispositivo novo (storage.get lança) — o
  // bootstrap "decide" e o restante do boot persiste STORAGE_KEY como
  // sempre fez. 2ª chamada (reload) já encontra a chave e não repete nada.
  const backing = {};
  const calls = [];
  const syncCalls = [];
  const seed = [{ id: 'seed_0', name: 'L0', s: 'S', site: 'T', images: [] }];
  function makeContext() {
    return vm.createContext({
      DATA: [], REVIEW: {}, SRS: {}, SESSIONLOG: {}, sectionOrder: [], siteOrder: {},
      appStateReady: false, deviceBootstrapPending: false,
      SEED: seed,
      STORAGE_KEY: 'data', ORDER_KEY: 'order', SITEORDER_KEY: 'site-order', REVIEW_KEY: 'review',
      RECOVERY_KEY: 'recovery', RECOVERY_VERSION: 'test', DEFAULT_SECTION_ORDER: [],
      SUPPRESSED_DUPLICATE_IDS_V172: new Set(),
      QUARANTINED_HIGH_IDS_20260924: new Set(),
      isQuarantinedSeedId: (id) => false,
      activeCanonicalSeedV172: () => seed,
      storage: {
        get: async (key) => {
          if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] };
          throw new Error('key not found: ' + key);
        },
        set: async (key, value) => { backing[key] = value; }
      },
      ensureLinks: (e) => { e.links = []; }, isAutoRadiopaediaLink: () => false, radiopaediaSearchUrl: () => '',
      runTagCleanup: () => false, ensureInc: (e) => { e.inc = 1; },
      saveData: async () => {}, saveOrder: async () => {}, saveSiteOrder: async () => {},
      loadSRS: async () => {}, loadSessionLog: async () => {},
      // ALTERAÇÃO 073: loadData() real carrega tombstones (stub, mesmo padrão;
      // a varredura é try/catch no próprio loadData e não precisa de stub).
      loadImageTombstones: async () => {},
      loadLesionRevisions: async () => {}, loadClassificationReviewDecisions: async () => {},
      saveReview: async () => {}, saveSRS: async () => {}, createSafetySnapshot: () => null,
      applyAltPlacementsAudit20260918: async () => false, applyClassificationAudit20260918: async () => false,
      upgradeDescriptionsV169: async () => {}, upgradeDescriptionsV170: async () => {},
      upgradeDescriptionsV173: async () => {}, upgradeDescriptionsV175: async () => {},
      upgradeDescriptionsV176: async () => {}, upgradeDescriptionsV177: async () => {},
      upgradeDescriptionsV179: async () => {}, upgradeDescriptionsV180: async () => {},
      upgradeDescriptionsV181: async () => {}, upgradeDescriptionsV182: async () => {},
      pushToFirebaseNow: async () => {},
      migrateLegacyLocalImagesToCloudinary: async () => ({ migrated: 0 }),
      loadSidebarScopePref: () => ({ section: null, site: null }),
      loadQuizScopePref: () => ({ section: null, site: null }),
      runDuplicateCleanup: () => ({ changed: false, reviewOrSrsChanged: false }),
      deduplicateV171: async () => {},
      runNewDeviceBootstrapFlow: async () => { calls.push('runNewDeviceBootstrapFlow'); },
      // ALTERACAO 068 (2026-09-23): rastreado à parte de `calls` — o ponto
      // deste teste é a NÃO repetição do bootstrap; o pull automático (que
      // SÓ roda quando o dispositivo já é considerado inicializado, ou seja,
      // a partir do 2º loadData()) é verificado abaixo separadamente.
      syncFromFirebase: async () => { syncCalls.push('syncFromFirebase'); },
      renderAll: () => {},
      console: { error: () => {}, info: () => {}, log: () => {}, warn: () => {} }
    });
  }

  const ctx1 = makeContext();
  vm.runInContext(loadDataFn.source, ctx1, { filename: 'load-data-1.js' });
  await ctx1.loadData();
  assert.equal(calls.length, 1, 'primeira abertura (dispositivo novo) aciona o bootstrap uma vez');
  assert.ok(Object.prototype.hasOwnProperty.call(backing, 'data'), 'o catálogo precisa ter sido persistido ao final do boot');
  assert.equal(syncCalls.length, 0, 'dispositivo novo não aciona o pull automático — o bootstrap acabou de decidir isso');

  const ctx2 = makeContext();
  vm.runInContext(loadDataFn.source, ctx2, { filename: 'load-data-2.js' });
  await ctx2.loadData();
  assert.equal(calls.length, 1, 'reload seguinte não pode repetir o bootstrap — o catálogo já existe localmente');
  // ALTERACAO 068: é exatamente este reload (dispositivo já inicializado,
  // catálogo persistido pelo boot anterior) que precisa consultar a nuvem
  // de novo — antes desta alteração, um PC com catálogo local antigo nunca
  // mais verificava a nuvem, e foi isso que deixou o PC do hospital stale.
  assert.equal(syncCalls.length, 1, 'reload com catálogo já existente precisa acionar o pull automático');
});

// ===========================================================================
// 7) MERGE DO BOOTSTRAP (reaproveita a MESMA lógica de syncFromFirebase):
//    preserva imagens, assignedAt, SRS, REVIEW, SESSIONLOG e ownership.
// ===========================================================================

function makeMergeContext() {
  const conflicts = [];
  const ctx = {
    imageOwnerIdV1: (img) => String((img && img.lesionId) || ''),
    IMAGE_OWNERSHIP_CONFLICTS: conflicts,
    registerImageOwnershipConflict: (entry) => { conflicts.push(entry); return entry; },
    canChangeImageOwnership: (image, newId) => {
      const current = String((image && image.lesionId) || '');
      return current === String(newId || '');
    }
  };
  vm.createContext(ctx);
  vm.runInContext(
    stableKeyFn.source + '\n' + identityKeysFn.source + '\n' + isValidAssignedAtFn.source + '\n' +
    adoptOldestFn.source + '\n' + unionFn.source + '\n' + dedupeFn.source + '\n' +
    normalizeExternalTitleFn.source + '\n' + clinicalCaseIdentityKeyFn.source + '\n' + unionClinicalCasesFn.source + '\n' +
    'let PULL_IMAGE_OWNERSHIP_CONFLICTS=[];\n' +
    mergeEntryNonDestructiveFn.source,
    ctx, { filename: 'merge-entry.js' }
  );
  return ctx;
}

function cloudImg(over) {
  return Object.assign({
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/x.jpg',
    publicId: 'atlas-radiologico/x', assetId: 'A1', lesionId: 'seed_1', lesionName: 'Lesão 1',
    assignedAt: '2026-08-01T10:00:00.000Z'
  }, over || {});
}

test('BOOTSTRAP MERGE: dispositivo novo (local = SEED sem imagens) + nuvem rica -> adota TODAS as imagens remotas (nenhuma some)', () => {
  const ctx = makeMergeContext();
  const local = { id: 'seed_1', name: 'Lesão 1', images: [] }; // base "SEED" do dispositivo novo
  const remote = { id: 'seed_1', name: 'Lesão 1', images: [cloudImg(), cloudImg({ assetId: 'A2', publicId: 'atlas-radiologico/y', data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/y.jpg' })], _userUpdatedAt: 1000 };
  const merged = ctx.mergeEntryNonDestructive(local, remote);
  assert.equal(merged.images.length, 2, 'as duas imagens da nuvem precisam sobreviver ao bootstrap');
  assert.deepEqual(new Set(merged.images.map((i) => i.assetId)), new Set(['A1', 'A2']));
});

test('BOOTSTRAP MERGE: preserva o assignedAt real vindo da nuvem (dispositivo novo não tem histórico próprio para "vencer")', () => {
  const ctx = makeMergeContext();
  const local = { id: 'seed_1', name: 'Lesão 1', images: [] };
  const remote = { id: 'seed_1', name: 'Lesão 1', images: [cloudImg({ assignedAt: '2026-07-15T08:00:00.000Z' })], _userUpdatedAt: 1000 };
  const merged = ctx.mergeEntryNonDestructive(local, remote);
  assert.equal(merged.images[0].assignedAt, '2026-07-15T08:00:00.000Z');
});

test('BOOTSTRAP MERGE: não duplica imagem quando o SEED local já tem a MESMA imagem canônica que a nuvem', () => {
  const ctx = makeMergeContext();
  const shared = cloudImg();
  const local = { id: 'seed_1', name: 'Lesão 1', images: [shared] }; // SEED já vem com essa imagem "de fábrica"
  const remote = { id: 'seed_1', name: 'Lesão 1', images: [{ ...shared }], _userUpdatedAt: 1000 };
  const merged = ctx.mergeEntryNonDestructive(local, remote);
  assert.equal(merged.images.length, 1, 'mesma identidade (assetId) não pode duplicar');
});

test('BOOTSTRAP MERGE: ownership permanece correto — imagem de outra lesão NÃO é adotada silenciosamente (fica registrado, não resolvido)', () => {
  const ctx = makeMergeContext();
  const local = { id: 'seed_1', name: 'Lesão 1', images: [] };
  const remote = { id: 'seed_1', name: 'Lesão 1', images: [cloudImg({ lesionId: 'seed_999', assetId: 'A9' })], _userUpdatedAt: 1000 };
  const merged = ctx.mergeEntryNonDestructive(local, remote);
  assert.equal(merged.images.some((i) => i.assetId === 'A9'), false, 'imagem com dono divergente não pode ser incorporada automaticamente');
  assert.equal(ctx.IMAGE_OWNERSHIP_CONFLICTS.length, 1, 'o conflito precisa ficar registrado, nunca resolvido em silêncio');
});

test('BOOTSTRAP MERGE: SRS/REVIEW/SESSIONLOG remotos são adotados quando o dispositivo novo não tem nada local (vazio de verdade)', () => {
  // Os objetos remoto/local atravessam a fronteira do vm como valores (não
  // por referência) só quando primitivos; aqui passamos objetos literais do
  // realm externo, então o resultado mistura prototypes — normaliza via
  // JSON antes de comparar (mesmo padrão já usado em snapshots-ownership.test.js).
  // ALTERAÇÃO 079 (Parte A) — as duas funções agora chamam
  // quarantineIndexedByLesionId() internamente; sem id quarentenado nestes
  // dados de teste, o stub é identidade (mesmo padrão do makeMergeContext).
  const quarantineStub = (obj) => (obj && typeof obj === 'object') ? obj : {};

  const ctxReview = vm.createContext({ quarantineIndexedByLesionId: quarantineStub });
  vm.runInContext(mergeReviewFn.source, ctxReview);
  const review = vm.runInContext('mergeReviewPreservingProgress', ctxReview)({}, { seed_1: 2, seed_2: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(review)), { seed_1: 2, seed_2: 1 });

  const ctxSrs = vm.createContext({ quarantineIndexedByLesionId: quarantineStub });
  vm.runInContext(mergeSRSFn.source, ctxSrs);
  const remoteSrs = { seed_1: { interval: 7, due: 123, streak: 2, updatedAt: 555 } };
  const srs = vm.runInContext('mergeSRSPreservingNewest', ctxSrs)({}, remoteSrs);
  assert.deepEqual(JSON.parse(JSON.stringify(srs)), remoteSrs);

  const ctxLog = vm.createContext({});
  vm.runInContext(mergeSessionLogFn.source, ctxLog);
  const remoteLog = { '2026-09-20': { reviewed: 5, right: 4, wrong: 1 } };
  const log = vm.runInContext('mergeSessionLogPreservingProgress', ctxLog)({}, remoteLog);
  assert.deepEqual(JSON.parse(JSON.stringify(log)), remoteLog);
});

// ===========================================================================
// 8) syncFromFirebase() em si continua intacta (o bootstrap reaproveita, não recria)
// ===========================================================================

test('BOOTSTRAP REAPROVEITAMENTO: applyNewDeviceBootstrapChoice delega para adoptRemoteStateForNewDevice() (ALTERAÇÃO 078) — nenhuma lógica de merge inline', () => {
  assert.doesNotMatch(applyChoiceFn.body, /readShardedState|mergeEntryNonDestructive|unionEntryImages|reconcileStateWithRemote/, 'não pode reimplementar merge nem ler a nuvem direto aqui — só delega');
  assert.match(applyChoiceFn.body, /await adoptRemoteStateForNewDevice\(\);/);
});

// ===========================================================================
// 9) ALTERAÇÃO 078 (2026-09-24) — adoptRemoteStateForNewDevice(): bug real
// corrigido. "load" reaproveitava syncFromFirebase()/reconcileStateWithRemote(),
// cujo mergeEntryNonDestructive() trata `local` como conteúdo real a
// proteger (regra "sem timestamp, local vence"). Mas o `local` de um device
// novo, nesse momento, é só activeCanonicalSeedV172() (o SEED estático,
// nunca tem _userUpdatedAt) — colocado em DATA só pra a tela ter algo pra
// desenhar antes da escolha. Como boa parte da nuvem também não tem
// _userUpdatedAt (conteúdo nunca tocado pelo editor depois de criado), a
// regra reafirmava links/notes/tags/classification do SEED por cima do que
// a nuvem tinha de mais completo — achado real: 99 lesões perderam links
// extras da nuvem nesse fluxo exato. adoptRemoteStateForNewDevice() adota a
// nuvem 1:1, sem merge nenhum — não existe estado local de verdade aqui.
// ===========================================================================

function makeAdoptContext({ localData, remoteMeta, remoteChunks } = {}) {
  const store = { meta: remoteMeta, chunks: remoteChunks || [] };
  const backing = {};
  const ctx = {
    DATA: localData || [], REVIEW: {}, SRS: {}, SESSIONLOG: {},
    sectionOrder: [], siteOrder: {}, IMAGE_TOMBSTONES: {},
    canonicalRestoreInProgress: false,
    DEFAULT_SECTION_ORDER: ['Seção Padrão'],
    STORAGE_KEY: 'data', REVIEW_KEY: 'review', SRS_KEY: 'srs', SESSIONLOG_KEY: 'sessionlog',
    ORDER_KEY: 'order', SITEORDER_KEY: 'site-order', IMAGE_TOMBSTONES_KEY: 'tombstones',
    isQuarantinedSeedId: (id) => false,
    CLOUD_REVISION_FIELD: 'revision',
    lastKnownCloudRevision: null,
    window: {},
    withFirebaseTimeout: (p) => p,
    FB_META_REF: () => ({ get: async () => ({ exists: !!store.meta, data: () => store.meta }) }),
    FB_CHUNK_REF: (i) => ({ get: async () => ({ exists: i < store.chunks.length, data: () => ({ items: store.chunks[i] }) }) }),
    storage: {
      get: async (key) => { if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] }; throw new Error('not found: ' + key); },
      set: async (key, value) => { backing[key] = value; }
    },
    console
  };
  vm.createContext(ctx);
  const engine = `
    ${tombScopeFn2.source}
    ${isValidTombFn2.source}
    ${normalizeTombstoneMapFn.source}
    ${saveTombFn2.source}
    ${readShardedStateFn.source}
    ${adoptRemoteFn.source}
  `;
  new vm.Script(engine).runInContext(ctx);
  return { ctx, backing };
}

const cloudMetaBase = { review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };

test('ALTERAÇÃO 078: adoptRemoteStateForNewDevice() adota os links da nuvem 1:1, mesmo com o "local" (SEED) tendo menos', async () => {
  const localSeedLike = [{ id: 'seed_1', name: 'L', s: 'S', site: 'T', links: [{ url: 'https://a', label: 'A' }] }];
  const remoteEntry = { id: 'seed_1', name: 'L', s: 'S', site: 'T', links: [{ url: 'https://a', label: 'A' }, { url: 'https://b', label: 'B' }] };
  const { ctx } = makeAdoptContext({
    localData: localSeedLike,
    remoteMeta: { ...cloudMetaBase, revision: 5, chunkCount: 1 },
    remoteChunks: [[remoteEntry]]
  });
  await ctx.adoptRemoteStateForNewDevice();
  assert.equal(ctx.DATA.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.DATA[0].links)), remoteEntry.links, 'links precisam ser EXATAMENTE os da nuvem (2), não os do SEED (1)');
});

test('ALTERAÇÃO 078: adoptRemoteStateForNewDevice() adota 3 links da nuvem mesmo com SEED tendo só 1', async () => {
  const localSeedLike = [{ id: 'seed_1', links: [{ url: 'https://a' }] }];
  const remoteEntry = { id: 'seed_1', links: [{ url: 'https://a' }, { url: 'https://b' }, { url: 'https://c' }] };
  const { ctx } = makeAdoptContext({
    localData: localSeedLike,
    remoteMeta: { ...cloudMetaBase, revision: 1, chunkCount: 1 },
    remoteChunks: [[remoteEntry]]
  });
  await ctx.adoptRemoteStateForNewDevice();
  assert.equal(ctx.DATA[0].links.length, 3);
});

test('ALTERAÇÃO 078: adoptRemoteStateForNewDevice() não reimplementa merge — sem referência a mergeEntryNonDestructive/reconcileStateWithRemote/unionEntryImages', () => {
  assert.doesNotMatch(adoptRemoteFn.body, /mergeEntryNonDestructive|reconcileStateWithRemote|unionEntryImages/);
});

test('ALTERAÇÃO 078: adoptRemoteStateForNewDevice() ainda filtra high ids (075) mesmo no caminho de device novo', async () => {
  const remoteGood = { id: 'seed_1', name: 'Bom' };
  const remoteHigh = { id: 'seed_1213', name: 'Contaminado' };
  const { ctx } = makeAdoptContext({
    localData: [],
    remoteMeta: { ...cloudMetaBase, revision: 1, chunkCount: 1 },
    remoteChunks: [[remoteGood, remoteHigh]]
  });
  ctx.isQuarantinedSeedId = (id) => id === 'seed_1213';
  await ctx.adoptRemoteStateForNewDevice();
  assert.deepEqual(Array.from(ctx.DATA).map(e => e.id), ['seed_1']);
});

test('ALTERAÇÃO 078: se a nuvem nunca foi escrita (remote null), mantém o SEED que já estava em DATA', async () => {
  const localSeedLike = [{ id: 'seed_1', name: 'SEED' }];
  const { ctx } = makeAdoptContext({ localData: localSeedLike, remoteMeta: null, remoteChunks: [] });
  await ctx.adoptRemoteStateForNewDevice();
  assert.deepEqual(ctx.DATA, localSeedLike);
});

test('ALTERAÇÃO 078: adoptRemoteStateForNewDevice() aborta (lock 077) se canonicalRestoreInProgress=true', async () => {
  const localSeedLike = [{ id: 'seed_1' }];
  const { ctx } = makeAdoptContext({
    localData: localSeedLike,
    remoteMeta: { ...cloudMetaBase, revision: 1, chunkCount: 1 },
    remoteChunks: [[{ id: 'seed_1', name: 'NUVEM' }]]
  });
  ctx.canonicalRestoreInProgress = true;
  await ctx.adoptRemoteStateForNewDevice();
  assert.deepEqual(ctx.DATA, localSeedLike, 'não deve ter adotado nada da nuvem com o lock ligado');
});

test('ALTERAÇÃO 078 (canônico real): device novo com "local" truncado em links adota o rev21 completo — 0 divergências de links no resultado', async () => {
  const canonicalPath = path.resolve(__dirname, '..', 'ATLAS_CANONICO_LIMPO_1216_116_FINAL.json');
  const canon = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));
  const remoteData = canon.data; // 1216 registros reais, já validados (hash conhecido)

  // Simula o "local" de um device novo: mesmos registros, mas com links
  // truncados a no máximo 1 — aproxima o baseline do SEED estático (sem
  // precisar do SEED real embutido no index.html, que não é extraível como
  // fixture de teste separada).
  const localSeedLike = remoteData.map(e => ({
    ...e,
    links: Array.isArray(e.links) && e.links.length ? [e.links[0]] : e.links
  }));

  const chunks = [];
  for (let i = 0; i < remoteData.length; i += 150) chunks.push(remoteData.slice(i, i + 150));

  const { ctx } = makeAdoptContext({
    localData: localSeedLike,
    remoteMeta: {
      review: canon.review, srs: canon.srs, sessionLog: canon.sessionLog,
      sectionOrder: canon.sectionOrder, siteOrder: canon.siteOrder,
      tombstones: canon.imageTombstones, revision: 21, chunkCount: chunks.length
    },
    remoteChunks: chunks
  });

  await ctx.adoptRemoteStateForNewDevice();

  assert.equal(ctx.DATA.length, 1216);
  let divergentLinks = 0;
  const byIdRemote = new Map(remoteData.map(e => [e.id, e]));
  for (const e of ctx.DATA) {
    const r = byIdRemote.get(e.id);
    if (JSON.stringify(e.links || []) !== JSON.stringify(r.links || [])) divergentLinks++;
  }
  assert.equal(divergentLinks, 0, 'depois da correção, TODOS os links devem bater com o canônico — 0 divergências (antes: 99)');
});

console.log('device-bootstrap.test.js carregado — nenhuma dependência de rede/DOM real usada.');
