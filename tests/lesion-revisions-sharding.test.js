'use strict';

/* PROTEÇÃO 095 — EXTERNALIZAÇÃO/SHARDING DE LESION_REVISIONS (histórico) +
 * BLOCO B (retomada) — ESCOPO ATUAL DESTE ARQUIVO.
 *
 * Bug real original (2026-10-05): LESION_REVISIONS sozinho passou de 1 MiB
 * (~700+ revisões reais, cada uma com history/attempts/humanFeedback) e o
 * documento principal do Firestore passou a ser recusado por
 * checkChunkSize() (teto de 0.95 MiB) — com uma mensagem genérica de
 * "imagem"/Cloudinary que não se aplicava a este caso. A correção original
 * (PROTEÇÃO 095) shardava LESION_REVISIONS DENTRO da transação de
 * writeShardedState — splitLesionRevisionsIntoShards() ainda existe e ainda
 * é usado (só por restoreCanonicalStateToCloud(), a ferramenta forense
 * separada), mas writeShardedState() NUNCA MAIS participa desse contrato
 * (Bloco B): sync de LESION_REVISIONS é só por documento, uma revisão por
 * vez, em writeLesionReviewIncremental() (ver index.html e
 * tests/lesion-revisions-collection.test.js).
 *
 * ESCOPO ATUAL deste arquivo, pós-Bloco-B:
 * - splitLesionRevisionsIntoShards()/checkChunkSize() em si (funções puras,
 *   ainda usadas por restoreCanonicalStateToCloud) — testes A/B/M.
 * - writeShardedState() NUNCA mais lê/escreve/mergeia LESION_REVISIONS, e
 *   PRESERVA (nunca apaga) o ponteiro/pedaços legados que já existirem —
 *   testes C/D (D encontrou e corrigiu um bug real: tx.set() sem isso
 *   apagava lesionRevisionsChunkCount silenciosamente).
 * - readShardedState() continua lendo os três formatos (v4 embutido, v5
 *   pedaços, ausente) como fallback — testes E/095B.7/095C.1C/1D.
 * - a barreira de versão de schema (095B/095C.1) — mecanismo IDÊNTICO ao de
 *   antes, só os números mudaram (v5 anterior, v6 atual, v7 futuro).
 * - restoreCanonicalStateToCloud() (095C.2) — ferramenta forense separada,
 *   não tocada pelo Bloco B; só o número de schema que ela escreve mudou.
 * - União multi-dispositivo e o codec de progresso embutido, pro caminho
 *   NOVO (por documento), são cobertos em
 *   tests/lesion-revisions-collection.test.js e
 *   tests/structural-snapshot-atomic-commit.test.js — não duplicados aqui.
 *
 * Arquivo NOVO e autocontido de propósito (histórico, ainda válido):
 * tests/multi-device-sync.test.js tem uma investigação de rollback
 * estrutural em andamento e não deve ser tocado por esta tarefa.
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

// Funções REAIS extraídas do index.html.
const stableKeyFn = extractFunction(html, 'stableImageKeyV208');
const identityKeysFn = extractFunction(html, 'imageIdentityKeys');
const isValidAssignedAtFn = extractFunction(html, 'isValidAssignedAt');
const adoptOldestFn = extractFunction(html, 'adoptOldestAssignedAt');
const imageOwnerIdFn = extractFunction(html, 'imageOwnerIdV1');
const registerConflictFn = extractFunction(html, 'registerImageOwnershipConflict');
const canChangeOwnershipFn = extractFunction(html, 'canChangeImageOwnership');
const legacyHoldersFn = extractFunction(html, 'legacyImageHoldersByKey');
const tryNormalizeFn = extractFunction(html, 'tryNormalizeLegacyPullImage');
const tombTimeFn = extractFunction(html, 'tombstoneTime');
const isValidTombFn = extractFunction(html, 'isValidImageTombstone');
const tombScopeFn = extractFunction(html, 'tombstoneScopeKey');
const normalizeTombFn = extractFunction(html, 'normalizeTombstoneMap');
const mergeTombFn = extractFunction(html, 'mergeImageTombstones');
const isTombstonedFn = extractFunction(html, 'isImageTombstoned');
const applyTombFn = extractFunction(html, 'applyImageTombstonesToList');
const recordTombFn = extractFunction(html, 'recordImageTombstone');
const loadTombFn = extractFunction(html, 'loadImageTombstones');
const saveTombFn = extractFunction(html, 'saveImageTombstones');
const sweepTombFn = extractFunction(html, 'sweepImageTombstonesFromData');
const countAdoptedFn = extractFunction(html, 'countRemoteOnlyAdopted');
const reconcileCoreFn = extractFunction(html, 'reconcileStateWithRemote');
const persistLocalFn = extractFunction(html, 'persistLocalStateNow');
const reconcilePrePushFn = extractFunction(html, 'reconcileBeforePush');
const unionFn = extractFunction(html, 'unionEntryImages');
const dedupeFn = extractFunction(html, 'dedupeEntryImagesOnly');
const normalizeExternalTitleFn = extractFunction(html, 'normalizeExternalTitle');
const clinicalCaseIdentityKeyFn = extractFunction(html, 'clinicalCaseIdentityKey');
const unionClinicalCasesFn = extractFunction(html, 'unionClinicalCases');
const didacticFns093 = ['genDidacticId', 'didacticItemTime', 'isDidacticItemVisible', 'sortDidacticItems', 'mergeDidacticItems', 'mergeClinicalCaseLists', 'imageRefTime', 'mergeImageRefLists',
  'imageMetaFields', 'imageMetaNorm', 'imageMetaTopValue', 'imageMetaCtxValue', 'imageMetaStamp', 'imageMetaAWins', 'mergeImageMetadata'].map((n) => extractFunction(html, n).source).join('\n');
const mergeEntryNonDestructiveFn = extractFunction(html, 'mergeEntryNonDestructive');
const mergeForPushFn = extractFunction(html, 'mergeEntryForImagePush');
const mergeReviewFn = extractFunction(html, 'mergeReviewPreservingProgress');
const mergeSRSFn = extractFunction(html, 'mergeSRSPreservingNewest');
const mergeSessionLogFn = extractFunction(html, 'mergeSessionLogPreservingProgress');
const imageIdentityDivergenceForEntryFn = extractFunction(html, 'imageIdentityDivergenceForEntry');
const buildImageIdentityDivergenceReportFn = extractFunction(html, 'buildImageIdentityDivergenceReport');
const findNestedArrayPathsFn = extractFunction(html, 'findNestedArrayPaths');
const markSyncDirtyFn = extractFunction(html, 'markSyncDirty');
const clearSyncDirtyFn = extractFunction(html, 'clearSyncDirty');
const pendingAddsFns079d = ['normalizePendingLocalImageAdds', 'hasPendingLocalImageAdd', 'markPendingLocalImageAdds',
  'confirmPendingLocalImageAdds', 'loadPendingLocalImageAdds', 'savePendingLocalImageAdds']
  .map((n) => extractFunction(html, n).source).join('\n');
const addImageToLesionDataFn = extractFunction(html, 'addImageToLesionData');
const reviewFns089 = ['normalizeReviewStamps', 'loadReviewStamps', 'saveReviewStamps', 'stampRestoredReview',
  'mergeReviewByRecency', 'consolidateReviewOnMerge', 'getReview', 'setReview',
  'reviewPromotionReached', 'reviewDemotionTriggered', 'replayAutoReview', 'normalizeReviewAttempts', 'foldReviewProgress', 'autoReviewBase', 'hasRealReviewAttempts', 'autoReviewStateFromProgress',
  'normalizeReviewProgressEntry', 'normalizeReviewProgress', 'reviewProgressToFirestore', 'reviewProgressFromFirestore', 'normalizeReviewOverrides', 'mergeReviewProgress',
  'mergeReviewOverrides', 'materializeReviewState', 'isReviewManual', 'computeAutomaticReviewState', 'effectiveReviewState',
  'ensureReviewProgressBase', 'recordReviewAttempt', 'gradeReviewAttempt', 'getReviewStateExplanation',
  'loadReviewProgressState', 'saveReviewProgressState', 'stampRestoredReviewOverrides', 'setReviewAuto', 'markLesionForReviewAgain']
  .map((n) => extractFunction(html, n).source).join('\n');
const structuralSyncFns = ['structuralSnapshotWalkMaps', 'structuralSnapshotProgressToFirestore', 'structuralSnapshotProgressFromFirestore', 'syncFailureStatus']
  .map((n) => extractFunction(html, n).source).join('\n');
const snapshotStoreFns3B = ['snapshotSyncedLocalKey', 'isSnapshotMarkedSynced', 'markSnapshotSynced',
  'collectExternalSnapshotRefs', 'collectPendingSnapshotRefs',
  'structuralSnapshotLocalCacheKey', 'structuralSnapshotFirestoreRef', 'getSnapshotFromLocalCache',
  'encodeSnapshotRecordForFirestore']
  .map((n) => extractFunction(html, n).source).join('\n');
const isMergedAwayLesionIdFn = extractFunction(html, 'isMergedAwayLesionId');
const lesionMergesModule091c = html.slice(html.indexOf("const LESION_MERGES_KEY = 'atlas:lesionMerges';"), html.indexOf('/* Plano APROVADO pelo usuário (091c).'));
const lesionTombstonesModule094 = sliceBetween("const LESION_TOMBSTONES_KEY = 'atlas:lesionTombstones';", 'function isQuarantinedSeedId(id){');
const isQuarantinedSeedIdFn = extractFunction(html, 'isQuarantinedSeedId');
const getActiveCanonicalSeedFn = extractFunction(html, 'getActiveCanonicalSeed');
const activeCanonicalSeedV172Fn = extractFunction(html, 'activeCanonicalSeedV172');
const orderFns085 = ['normalizeOrderStamps', 'loadOrderStamps', 'saveOrderStamps', 'markSectionOrderManual',
  'markSiteOrderManual', 'markRestoredOrderManual', 'dedupeOrderList', 'isAutoSectionOrder', 'isAutoSiteList',
  'mergeOrderList', 'mergeOrderState']
  .map((n) => extractFunction(html, n).source).join('\n');
const lesionRevisionsFns084 = ['mergeOneLesionReviewPair', 'mergeLesionRevisions', 'saveLesionRevisions', 'loadLesionRevisions', 'updateReviewCenterBadges',
  'getPendingReviews', 'getProposedSolutions', 'getAppliedSolutionsAwaitingValidation', 'getManualActionSolutions',
  'getReadySolutions', 'countPendingLesionReviews', 'countReadyLesionSolutions',
  'hasActiveLesionReview', 'lesionReviewWarningHtml', 'refreshLesionReviewWarnings',
  'reviewScope', 'isGlobalReview', 'createReviewRequest', 'setGlobalReviewSolution', 'completeGlobalReview', 'pushLesionReviewHistory', 'genLesionReviewId',
  'isReviewRequestEditable', 'normalizeReviewRequestText', 'reviewRequestHistory', 'editReviewRequestText']
  .map((n) => extractFunction(html, n).source).join('\n');
const lesionReviewConsts = html.slice(html.indexOf("const LESION_REVIEW_EDITABLE_FIELDS = "),
  html.indexOf('function validateProposedChanges('));
const snapshotFlagConst = html.slice(html.indexOf('let STRUCTURAL_SNAPSHOT_EXTERNALIZATION_ENABLED'),
  html.indexOf('function structuralExecutionSnapshotsSync('));
const snapshotSchemaConst = html.slice(html.indexOf('const STRUCTURAL_SNAPSHOT_SCHEMA_VERSION = '),
  html.indexOf('function structuralSnapshotLocalCacheKey('));
const gateStaleImagesFn = extractFunction(html, 'gateStaleLocalOnlyImagesForWrite');
// PROTEÇÃO 095 — módulo novo sob teste: sharding + checagem REAL (não
// stubada — este arquivo existe justamente para provar tamanho/mensagem).
const splitLesionRevisionsIntoShardsFn = extractFunction(html, 'splitLesionRevisionsIntoShards');
const checkChunkSizeHintFn = extractFunction(html, 'checkChunkSizeHint');
const checkChunkSizeFn = extractFunction(html, 'checkChunkSize');
const writeShardedStateFn = extractFunction(html, 'writeShardedState');
const writeShardedStateWithConflictRetryFn = extractFunction(html, 'writeShardedStateWithConflictRetry');
const writeShardedStateSerializedFn = extractFunction(html, 'writeShardedStateSerialized');
const readShardedStateFn = extractFunction(html, 'readShardedState');
// Bloco B — readShardedState() lê a coleção nova por documento (Bloco A)
// como fonte de lesionRevisions SÓ quando meta.lesionRevisionsStorage===
// 'collection' (gate explícito de cutover, auditoria 2026-10-07) — nunca
// mais por ela estar "não vazia" (migração em lotes a deixaria parcial).
const getLesionRevisionsCollectionRefFn = extractFunction(html, 'getLesionRevisionsCollectionRef');
const readLesionRevisionsCollectionFn = extractFunction(html, 'readLesionRevisionsCollection');
const validateLesionRevisionCollectionAgainstLocalFn = extractFunction(html, 'validateLesionRevisionCollectionAgainstLocal');
const activateLesionRevisionsCollectionStorageFn = extractFunction(html, 'activateLesionRevisionsCollectionStorage');
const pushToFirebaseNowFn = extractFunction(html, 'pushToFirebaseNow');
const pushToFirebaseFn = extractFunction(html, 'pushToFirebase');
const saveDataFn = extractFunction(html, 'saveData');
const syncFromFirebaseFn = extractFunction(html, 'syncFromFirebase');
const loadDataFn = extractFunction(html, 'loadData');
const quarantineIndexedByLesionIdFn = extractFunction(html, 'quarantineIndexedByLesionId');
const adoptRemoteStateForNewDeviceFn = extractFunction(html, 'adoptRemoteStateForNewDevice');
const canonicalJsonStringFn = extractFunction(html, 'canonicalJsonString');
// PROTEÇÃO 095C — restore canônico (ferramenta forense dedicada) precisa
// permanecer compatível com o schema v5.
const sanitizeCanonicalPayloadForQuarantineFn = extractFunction(html, 'sanitizeCanonicalPayloadForQuarantine');
const validateCanonicalPayloadFn = extractFunction(html, 'validateCanonicalPayload');
const restoreCanonicalStateToCloudFn = extractFunction(html, 'restoreCanonicalStateToCloud');
const deepStableEqualFn = extractFunction(html, 'deepStableEqual');
const syncAuditCountersFn = extractFunction(html, 'syncAuditCounters');

const plain = (v) => JSON.parse(JSON.stringify(v));

function makeFakeCloud() {
  const store = new Map();
  return {
    FB_META_REF: () => ({
      __kind: 'meta',
      set: async (payload) => { store.set('main', payload); },
      get: async () => { const data = store.get('main'); return { exists: !!data, data: () => data }; },
      collection: (sub) => ({
        doc: (id) => {
          const subKey = 'sub/' + sub + '/' + id;
          return {
            __kind: 'sub', __sub: sub, __id: id,
            set: async (payload) => { store.set(subKey, payload); },
            get: async () => { const data = store.get(subKey); return { exists: !!data, data: () => data }; }
          };
        },
        // Bloco B — readLesionRevisionsCollection() lê a coleção inteira
        // (readShardedState() a consulta como fonte primária).
        get: async () => {
          const prefix = 'sub/' + sub + '/';
          const docs = [];
          for (const [k, v] of store.entries()) if (k.indexOf(prefix) === 0) docs.push({ id: k.slice(prefix.length), data: () => v });
          return { forEach: (cb) => docs.forEach(cb) };
        }
      })
    }),
    FB_CHUNK_REF: (i) => {
      const key = 'chunk_' + i;
      return {
        __kind: 'chunk', __i: i,
        set: async (payload) => { store.set(key, payload); },
        get: async () => { const data = store.get(key); return { exists: !!data, data: () => data }; },
        delete: async () => { store.delete(key); }
      };
    },
    FB_LESION_REVISIONS_CHUNK_REF: (i) => {
      const key = 'lr_chunk_' + i;
      return {
        __kind: 'lrchunk', __i: i,
        set: async (payload) => { store.set(key, payload); },
        get: async () => { const data = store.get(key); return { exists: !!data, data: () => data }; },
        delete: async () => { store.delete(key); }
      };
    },
    runTransaction: async (fn) => {
      const subKeyOf = (ref) => (ref.__kind === 'meta' ? 'main' : (ref.__kind === 'sub' ? ('sub/' + ref.__sub + '/' + ref.__id) : (ref.__kind === 'lrchunk' ? ('lr_chunk_' + ref.__i) : ('chunk_' + ref.__i))));
      const tx = {
        get: async (ref) => { const data = store.get(subKeyOf(ref)); return { exists: !!data, data: () => data }; },
        set: (ref, payload) => { store.set(subKeyOf(ref), payload); }
      };
      return fn(tx);
    },
    peekRevision() { const main = store.get('main'); return main ? (Number(main.revision) || 0) : 0; },
    peekMeta() { return store.get('main') || null; },
    peekChunkItems(i) { const chunk = store.get('chunk_' + i); return chunk && Array.isArray(chunk.items) ? chunk.items : []; },
    // Reconstrói lesionRevisions por completo (pedaços OU legado) — mesma
    // lógica de leitura de readShardedState(), em forma de helper de teste
    // (devolve o payload CRU, sem decodificar o codec de progresso).
    peekLesionRevisions() {
      const main = store.get('main');
      if (!main) return {};
      const chunkCount = Number(main.lesionRevisionsChunkCount) || 0;
      if (chunkCount > 0) {
        const out = {};
        for (let i = 0; i < chunkCount; i++) {
          const chunk = store.get('lr_chunk_' + i);
          if (chunk && chunk.entries && typeof chunk.entries === 'object') Object.assign(out, chunk.entries);
        }
        return out;
      }
      return (main.lesionRevisions && typeof main.lesionRevisions === 'object') ? main.lesionRevisions : {};
    },
    peekLesionRevisionsShardCount() { const main = store.get('main'); return main ? (Number(main.lesionRevisionsChunkCount) || 0) : 0; },
    peekLesionRevisionsShardRaw(i) { return store.get('lr_chunk_' + i) || null; },
    // GATE DE CUTOVER (auditoria 2026-10-07) — inspeciona a coleção nova
    // direto no store, sem passar pelo gate/readShardedState.
    peekLesionRevisionsCollection() {
      const prefix = 'sub/lesionRevisions/';
      const out = {};
      for (const [k, v] of store.entries()) if (k.indexOf(prefix) === 0) out[k.slice(prefix.length)] = v;
      return out;
    },
    // snapshot bruto do Map, pra provar atomicidade (nada mudou após uma falha).
    snapshotStore() { return new Map(store); },
    setRaw(key, value) { store.set(key, value); }
  };
}

// Um "computador": storage LOCAL próprio + a nuvem falsa compartilhada.
// SEED sempre vazio — fixtures são lesões de usuário (ids seed_*/u_* só
// como dado de teste).
function makeDevice(cloud, { initialCatalog = [] } = {}) {
  const localBacking = { data: JSON.stringify(initialCatalog) };
  const calls = { statusMessages: [] };
  let context;
  context = vm.createContext({
    DATA: [], REVIEW: {}, SRS: {}, SESSIONLOG: {}, sectionOrder: [], siteOrder: {},
    appStateReady: false, deviceBootstrapPending: false,
    fbDb: { runTransaction: cloud.runTransaction },
    fbSyncing: false, fbPushTimer: null, writeChainV247: Promise.resolve(),
    canonicalRestoreInProgress: false,
    syncPushPending: false,
    syncFromFirebaseSkipTrailingPush: false,
    syncDirty: false,
    SYNC_DIRTY_KEY: 'atlas:syncDirty',
    CLOUD_REVISION_FIELD: 'revision',
    STATE_SCHEMA_VERSION: 6, // PROTEÇÃO 095B — Bloco B
    // Bloco B — writeShardedState()/saveLesionRevisions()/loadData() reais
    // agora dependem destes; fora do escopo desta suíte (sharding legado de
    // writeShardedState), por isso stubs simples.
    DIRTY_LESION_REVIEW_IDS: new Set(),
    markLesionReviewDirty: () => {},
    persistDirtyLesionReviewIds: async () => {},
    pushLesionReviewsIncremental: () => {},
    foldLesionMergesIntoGlobals: () => ({ changed: false, folded: [], movedImages: 0 }),
    loadDirtyLesionReviewIds: async () => {},
    lastKnownCloudRevision: null,
    lastWriteRefusedReason: null,
    lastRevisionConflictAt: null,
    window: {}, setTimeout, clearTimeout, Blob,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } },
    SEED: [],
    STORAGE_KEY: 'data', ORDER_KEY: 'order', SITEORDER_KEY: 'site-order', REVIEW_KEY: 'review',
    SRS_KEY: 'srs', SESSIONLOG_KEY: 'sessionlog',
    RECOVERY_KEY: 'recovery', RECOVERY_VERSION: 'test', DEFAULT_SECTION_ORDER: [], EN_TERMS: {},
    DATA_CHUNK_SIZE: 150,
    FB_META_REF: cloud.FB_META_REF,
    FB_CHUNK_REF: cloud.FB_CHUNK_REF,
    FB_LESION_REVISIONS_CHUNK_REF: cloud.FB_LESION_REVISIONS_CHUNK_REF,
    withFirebaseTimeout: (p) => p,
    // PROTEÇÃO 095 — real (não stub): captura a mensagem pra provar que o
    // texto de erro diferencia DATA/meta/lesionRevisions (teste N).
    setSyncStatus: (ok, detail) => { context.syncPushPending = !ok; calls.statusMessages.push({ ok, detail }); },
    toast: () => {},
    storage: {
      get: async (key) => {
        if (Object.prototype.hasOwnProperty.call(localBacking, key)) return { value: localBacking[key] };
        throw new Error('key not found: ' + key);
      },
      set: async (key, value) => { localBacking[key] = value; }
    },
    ensureLinks: (e) => { if (!Array.isArray(e.links)) e.links = []; },
    isAutoRadiopaediaLink: () => false,
    radiopaediaSearchUrl: () => '',
    runTagCleanup: () => false,
    ensureInc: (e) => { if (typeof e.inc !== 'number') e.inc = 1; },
    saveOrder: async () => {}, saveSiteOrder: async () => {},
    loadSRS: async () => {}, loadSessionLog: async () => {},
    loadClassificationReviewDecisions: async () => {},
    saveReview: async () => {}, saveSRS: async () => {},
    createSafetySnapshot: () => null,
    applyAltPlacementsAudit20260918: async () => false,
    applyClassificationAudit20260918: async () => false,
    upgradeDescriptionsV169: async () => {}, upgradeDescriptionsV170: async () => {},
    upgradeDescriptionsV173: async () => {}, upgradeDescriptionsV175: async () => {},
    upgradeDescriptionsV176: async () => {}, upgradeDescriptionsV177: async () => {},
    upgradeDescriptionsV179: async () => {}, upgradeDescriptionsV180: async () => {},
    upgradeDescriptionsV181: async () => {}, upgradeDescriptionsV182: async () => {},
    migrateLegacyLocalImagesToCloudinary: async () => ({ migrated: 0 }),
    loadSidebarScopePref: () => ({ section: null, site: null }),
    loadQuizScopePref: () => ({ section: null, site: null }),
    runDuplicateCleanup: () => ({ changed: false, reviewOrSrsChanged: false }),
    deduplicateV171: async () => {},
    runNewDeviceBootstrapFlow: async () => { throw new Error('não deveria ser chamado (dispositivo já inicializado)'); },
    renderAll: () => {},
    LESION_REVISIONS: {},
    ORDER_STAMPS: { section: 0, sites: {} },
    REVIEW_STAMPS: {}, REVIEW_PROGRESS: {}, REVIEW_OVERRIDE: {},
    syncAuditCounters: () => ({}),
    readCloudAuditFromServer: async () => null,
    syncCountersMatch: () => false,
    confirm: () => true,
    console: { error: () => {}, info: () => {}, log: () => {}, warn: () => {} }
  });
  vm.createContext(context);
  const engine = `
    ${stableKeyFn.source}
    ${identityKeysFn.source}
    ${isValidAssignedAtFn.source}
    ${adoptOldestFn.source}
    function imageOwnerIdV1${imageOwnerIdFn.source.slice(imageOwnerIdFn.source.indexOf('('))}
    const IMAGE_OWNERSHIP_CONFLICTS = [];
    ${registerConflictFn.source}
    ${canChangeOwnershipFn.source}
    ${legacyHoldersFn.source}
    ${tryNormalizeFn.source}
    const IMAGE_TOMBSTONES_KEY = 'atlas:imageTombstones';
    let IMAGE_TOMBSTONES = {};
    let PULL_TOMBSTONES_NEW = 0;
    let PULL_TOMBSTONES_REMOVED = 0;
    ${tombTimeFn.source}
    ${isValidTombFn.source}
    ${tombScopeFn.source}
    ${normalizeTombFn.source}
    ${mergeTombFn.source}
    ${isTombstonedFn.source}
    ${applyTombFn.source}
    ${recordTombFn.source}
    ${loadTombFn.source}
    ${saveTombFn.source}
    ${sweepTombFn.source}
    let lastPrePushReconcileAt = null;
    let lastPrePushPreserved = 0;
    let pendingWriteImageExclusionsById = null;
    ${countAdoptedFn.source}
    ${canonicalJsonStringFn.source}
    ${deepStableEqualFn.source}
    const SUPPRESSED_DUPLICATE_IDS_V172 = new Set();
    const QUARANTINED_HIGH_IDS_20260924 = new Set();
    ${isMergedAwayLesionIdFn.source}
    ${lesionMergesModule091c}
    ${lesionTombstonesModule094}
    // PROTEÇÃO 095C — LESION_MERGES/LESION_TOMBSTONES são declarados via
    // \`let\` dentro dos módulos brutos acima: isso cria uma ligação LEXICAL
    // própria do script vm, separada da propriedade do mesmo nome no
    // sandbox/contexto — um \`a.context.LESION_MERGES = ...\` de FORA nunca
    // chega a estas funções (gravaria só a propriedade do objeto, não o
    // binding léxico interno). Setter explícito, mesmo raciocínio do
    // (não usado) __setLesionRevisions095 acima.
    function __setLesionMerges095c(v){ LESION_MERGES = v; }
    function __setLesionTombstones095c(v){ LESION_TOMBSTONES = v; }
    ${isQuarantinedSeedIdFn.source}
    ${getActiveCanonicalSeedFn.source}
    ${activeCanonicalSeedV172Fn.source}
    function __setLesionRevisions095(v){ LESION_REVISIONS = v; }
    ${reconcileCoreFn.source}
    ${persistLocalFn.source}
    ${reconcilePrePushFn.source}
    let PULL_IMAGE_OWNERSHIP_CONFLICTS = [];
    ${unionFn.source}
    ${dedupeFn.source}
    ${normalizeExternalTitleFn.source}
    ${clinicalCaseIdentityKeyFn.source}
    ${unionClinicalCasesFn.source}
    ${didacticFns093}
    ${mergeEntryNonDestructiveFn.source}
    ${mergeForPushFn.source}
    ${mergeReviewFn.source}
    ${mergeSRSFn.source}
    ${mergeSessionLogFn.source}
    ${imageIdentityDivergenceForEntryFn.source}
    ${buildImageIdentityDivergenceReportFn.source}
    function stripUndefinedDeep(v){try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}}
    ${findNestedArrayPathsFn.source}
    function splitIntoChunks(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
    ${checkChunkSizeHintFn.source}
    ${checkChunkSizeFn.source}
    ${markSyncDirtyFn.source}
    ${clearSyncDirtyFn.source}
    const PENDING_LOCAL_IMAGE_ADDS_KEY = 'atlas:pendingLocalImageAdds';
    let PENDING_LOCAL_IMAGE_ADDS = {};
    ${pendingAddsFns079d}
    ${addImageToLesionDataFn.source}
    const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';
    const ACTIVE_LESION_REVIEW_STATUSES = ['pending', 'rejected', 'proposed', 'applied_pending_validation', 'manual_action_required'];
    const GLOBAL_REVIEW_CATEGORIES = { audit:'Auditoria', duplicates:'Duplicatas', classifications:'Classificações', descriptions:'Descrições', images:'Imagens', taxonomy:'Taxonomia', organization:'Organização', other:'Outro' };
    const GLOBAL_REVIEW_NO_TARGET = 'global_review_has_no_direct_target';
    function reviewAcceptsAiProposal(review){ return !!review && (review.status==='pending' || review.status==='rejected'); }
    const LESION_REVIEW_WARNING_TEXT = 'Esta lesão possui revisão ativa';
    const REVIEW_REQUEST_TEXT_MAX = 2000;
    ${lesionRevisionsFns084}
    ${lesionReviewConsts}
    ${snapshotFlagConst}
    ${snapshotSchemaConst}
    const ORDER_STAMPS_KEY = 'atlas:orderUpdatedAt';
    ${orderFns085}
    const REVIEW_STAMPS_KEY = 'atlas:reviewUpdatedAt';
    const REVIEW_PROGRESS_KEY = 'atlas:reviewProgress'; const REVIEW_OVERRIDE_KEY = 'atlas:reviewOverride'; const REVIEW_ATTEMPTS_MAX = 8;
    const REVIEW_LABELS = {0:'Não revisado',1:'Revisando',2:'Dominado'};
    ${reviewFns089}
    ${structuralSyncFns}
    ${snapshotStoreFns3B}
    let lastWriteStaleImagesBlocked = 0;
    ${gateStaleImagesFn.source}
    const LESION_REVISIONS_SHARD_TARGET_BYTES = 700*1024;
    ${splitLesionRevisionsIntoShardsFn.source}
    ${getLesionRevisionsCollectionRefFn.source}
    ${readLesionRevisionsCollectionFn.source}
    ${validateLesionRevisionCollectionAgainstLocalFn.source}
    ${activateLesionRevisionsCollectionStorageFn.source}
    ${writeShardedStateFn.source}
    ${writeShardedStateWithConflictRetryFn.source}
    ${writeShardedStateSerializedFn.source}
    ${readShardedStateFn.source}
    ${pushToFirebaseNowFn.source}
    ${pushToFirebaseFn.source}
    ${saveDataFn.source}
    ${syncFromFirebaseFn.source}
    ${loadDataFn.source}
    ${quarantineIndexedByLesionIdFn.source}
    ${adoptRemoteStateForNewDeviceFn.source}
    ${syncAuditCountersFn.source}
    ${sanitizeCanonicalPayloadForQuarantineFn.source}
    ${validateCanonicalPayloadFn.source}
    ${restoreCanonicalStateToCloudFn.source}
  `;
  new vm.Script(engine).runInContext(context);
  return {
    context, calls,
    boot: () => context.loadData(),
    save: () => context.saveData(),
    peekLocal: (key) => localBacking[key]
  };
}

function lesion(id, over) {
  return Object.assign({ id, name: id, s: 'Abdômen Superior', site: 'Fígado', notes: '', tags: [], links: [], images: [], img: '', localImg: false }, over || {});
}
function rev(id, over) {
  return Object.assign({
    id, lesionId: 'seed_1', createdAt: 1000, updatedAt: 1000, status: 'pending',
    requestText: 'pedido ' + id, solution: null, attempts: [], humanFeedback: [],
    history: [{ timestamp: 1000, action: 'created', details: null }]
  }, over || {});
}
// Registro "pesado": o padding mora em requestText (campo de texto livre
// real — nenhuma forma sintética inventada), controlando o tamanho em
// bytes de forma previsível pro teste.
function heavyRev(id, approxBytes) {
  const base = rev(id);
  const padLen = Math.max(0, approxBytes - JSON.stringify(base).length);
  base.requestText = 'pedido ' + id + ' ' + 'x'.repeat(padLen);
  return base;
}
function buildHeavyLesionRevisions(count, approxBytesEach) {
  const out = {};
  for (let i = 0; i < count; i++) {
    const id = 'lrev_' + String(i).padStart(5, '0');
    out[id] = heavyRev(id, approxBytesEach);
  }
  return out;
}
const byteSize = (v) => new Blob([JSON.stringify(v)]).size;
const MB = 1024 * 1024;

test('A. LESION_REVISIONS > 1 MiB consegue ser persistido por pedaços (nenhuma revisão perdida ao dividir)', () => {
  const d = makeDevice(makeFakeCloud());
  const heavy = buildHeavyLesionRevisions(25, 50 * 1024); // ~25 x 50KB ≈ 1.22 MiB
  assert.ok(byteSize(heavy) > MB, 'fixture precisa realmente passar de 1 MiB: ' + byteSize(heavy));
  const shards = plain(d.context.splitLesionRevisionsIntoShards(heavy));
  assert.ok(shards.length > 1, 'objeto >1 MiB precisa gerar mais de 1 pedaço');
  const rebuilt = Object.assign({}, ...shards);
  assert.deepEqual(Object.keys(rebuilt).sort(), Object.keys(heavy).sort(), 'nenhum id perdido ao dividir');
  assert.deepEqual(rebuilt, heavy, 'conteúdo de cada revisão idêntico após dividir e rejuntar');
  const allIds = shards.flatMap((s) => Object.keys(s));
  assert.equal(new Set(allIds).size, allIds.length, 'cada id aparece em EXATAMENTE um pedaço');
});

test('B. nenhum pedaço ultrapassa o limite configurado (checkChunkSize REAL em cada um)', () => {
  const d = makeDevice(makeFakeCloud());
  const heavy = buildHeavyLesionRevisions(25, 50 * 1024);
  const shards = d.context.splitLesionRevisionsIntoShards(heavy);
  assert.ok(shards.length > 1);
  for (let i = 0; i < shards.length; i++) {
    assert.ok(d.context.checkChunkSize(shards[i], `revisões de lesão — pedaço ${i + 1}/${shards.length}`),
      `pedaço ${i} (${byteSize(shards[i])} bytes) deveria passar no teto de 0.95 MiB`);
    assert.ok(byteSize(shards[i]) <= 0.95 * MB);
  }
});

test('M. estado pequeno também funciona (1-2 revisões cabem num único pedaço)', () => {
  const d = makeDevice(makeFakeCloud());
  const small = { R1: rev('R1'), R2: rev('R2', { status: 'proposed' }) };
  const shards = plain(d.context.splitLesionRevisionsIntoShards(small));
  assert.equal(shards.length, 1);
  assert.deepEqual(shards[0], small);
  assert.ok(d.context.checkChunkSize(shards[0], 'revisões de lesão — pedaço 1/1'));
});

/* ===========================================================================
 * BLOCO B (retomada) — writeShardedState() PAROU de ler/mergear/escrever
 * LESION_REVISIONS por completo (ver index.html, comentário da constante
 * STATE_SCHEMA_VERSION e do bloco "Bloco B" logo acima de writeShardedState).
 * O sync de LESION_REVISIONS agora é só por documento, uma revisão por vez,
 * em writeLesionReviewIncremental() — já coberto a fundo em
 * tests/lesion-revisions-collection.test.js (A-W) e
 * tests/structural-snapshot-atomic-commit.test.js (3B-01..14, já migrados
 * pra apontar pra writeLesionReviewIncremental).
 *
 * Os testes C/D/F/G/H/I/J/L/O1/O2/O3/O4/P originais deste arquivo provavam
 * mecanismos que escreviam/liam/mesclavam LESION_REVISIONS DENTRO da
 * transação de writeShardedState — mecanismo que não existe mais, por
 * desenho (não um bug). Substituídos pelos dois testes abaixo, que provam
 * a NOVA invariante diretamente (e que encontraram um bug real: sem a
 * correção aplicada em index.html, tx.set() — substituição TOTAL do
 * documento — apagava silenciosamente lesionRevisionsChunkCount/
 * lesionRevisions na PRÓXIMA escrita de QUALQUER outra coisa, órfãos os
 * pedaços legados e quebrando a promessa de fallback de leitura).
 * ===========================================================================
 */

test('C. writeShardedState NUNCA lê/escreve/mergeia lesion_revisions_chunk_* (estático: estrutura do código real)', () => {
  const src = writeShardedStateFn.source;
  assert.doesNotMatch(src, /FB_LESION_REVISIONS_CHUNK_REF/, 'nunca referencia os pedaços legados');
  assert.doesNotMatch(src, /splitLesionRevisionsIntoShards/, 'nunca empacota LESION_REVISIONS');
  assert.doesNotMatch(src, /mergeLesionRevisions\(/, 'nunca mergeia o mapa inteiro');
  assert.doesNotMatch(src, /structuralSnapshotProgressToFirestore|structuralSnapshotProgressFromFirestore/, 'nunca codifica/decodifica progresso embutido (não é mais dono desse campo)');
  assert.doesNotMatch(src, /\blesionRevisionsChunkCount\s*:\s*lesionRevisionsShards/, 'nunca calcula um novo chunkCount a partir de pedaços recém-divididos');
});

test('D/BUG FIX. chunks legados permanecem congelados E o ponteiro (lesionRevisionsChunkCount) sobrevive a uma escrita não relacionada', async () => {
  const cloud = makeFakeCloud();
  // Seed MANUAL do formato v5 (pedaços) — a escrita normal não produz mais
  // isto (ver nota acima), então simulamos uma nuvem que já estava migrada
  // ANTES do cutover pro Bloco B (cenário real: Atlas publicado hoje).
  const legacyChunks = { OLD1: rev('OLD1'), OLD2: rev('OLD2', { updatedAt: 2000 }) };
  cloud.setRaw('main', {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {},
    lesionMerges: {}, lesionTombstones: {}, chunkCount: 0, stateSchemaVersion: 5, revision: 1,
    lesionRevisionsChunkCount: 1
  });
  cloud.setRaw('lr_chunk_0', { entries: legacyChunks });
  const chunkBefore = cloud.peekLesionRevisionsShardRaw(0);

  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot(); // dispositivo novo faz pull automático — não deve tocar nos pedaços
  assert.deepEqual(cloud.peekLesionRevisionsShardRaw(0), chunkBefore, 'boot (leitura) não altera o pedaço legado');

  // Ação REAL e totalmente não-relacionada: edita uma lesão (DATA), nada a
  // ver com LESION_REVISIONS — mas ainda assim passa por writeShardedState.
  a.context.DATA = [...a.context.DATA, lesion('seed_2')];
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, false, 'escrita não relacionada precisa ter sido aceita normalmente');

  assert.deepEqual(cloud.peekLesionRevisionsShardRaw(0), chunkBefore,
    'o pedaço legado continua byte a byte idêntico — writeShardedState nunca escreve nele');
  const metaAfter = cloud.peekMeta();
  assert.equal(metaAfter.lesionRevisionsChunkCount, 1,
    'BUG FIX: o ponteiro pros pedaços legados sobrevive a uma escrita de outra coisa — sem a correção, tx.set() (substituição total do documento) apagava este campo silenciosamente');

  // E o fallback de leitura, pro qual o ponteiro preservado existe, continua
  // funcionando normalmente depois dessa escrita não relacionada.
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), legacyChunks, 'readShardedState ainda reconstrói os pedaços legados depois da escrita não relacionada');
});

// ===========================================================================
// GATE DE CUTOVER (auditoria 2026-10-07) — meta.lesionRevisionsStorage
// decide a fonte de leitura; NUNCA mais "coleção não-vazia". Ver
// index.html readShardedState()/activateLesionRevisionsCollectionStorage().
// ===========================================================================
const metaBase095Gate = { review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {},
  lesionMerges: {}, lesionTombstones: {}, chunkCount: 0, stateSchemaVersion: 6, revision: 1 };

test('GATE-A. meta sem lesionRevisionsStorage => usa o legado (campo embutido)', async () => {
  const cloud = makeFakeCloud();
  const legacyRevs = { OLD1: rev('OLD1') };
  cloud.setRaw('main', { ...metaBase095Gate, lesionRevisions: legacyRevs });
  cloud.setRaw('sub/lesionRevisions/NEW1', rev('NEW1')); // coleção nova tem conteúdo, mas o gate está ausente
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), legacyRevs, 'lê só o legado; NEW1 (coleção) nunca aparece');
});

test('GATE-B. gate="legacy" + coleção PARCIAL => IGNORA a coleção por completo', async () => {
  const cloud = makeFakeCloud();
  const legacyRevs = { OLD1: rev('OLD1'), OLD2: rev('OLD2') };
  cloud.setRaw('main', { ...metaBase095Gate, lesionRevisions: legacyRevs, lesionRevisionsStorage: 'legacy' });
  // "Parcial" = só 1 dos 2 ids já migrados pra coleção (meio de uma migração em lotes).
  cloud.setRaw('sub/lesionRevisions/OLD1', rev('OLD1'));
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), legacyRevs, 'OLD2 (só no legado) não desaparece — a coleção parcial é 100% ignorada');
});

test('GATE-C. gate="legacy" + coleção COMPLETA (1:1) => ainda assim usa o legado', async () => {
  const cloud = makeFakeCloud();
  const legacyRevs = { OLD1: rev('OLD1'), OLD2: rev('OLD2') };
  cloud.setRaw('main', { ...metaBase095Gate, lesionRevisions: legacyRevs, lesionRevisionsStorage: 'legacy' });
  // Coleção já tem TUDO (migração terminou), mas o gate não foi ativado —
  // a decisão é só pelo campo, nunca por comparar conteúdo.
  cloud.setRaw('sub/lesionRevisions/OLD1', rev('OLD1'));
  cloud.setRaw('sub/lesionRevisions/OLD2', rev('OLD2'));
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), legacyRevs, 'fonte continua sendo o legado — gate não ativado, mesmo com a coleção completa');
});

test('GATE-D. gate="collection" => usa a coleção (legado, mesmo presente e divergente, é ignorado)', async () => {
  const cloud = makeFakeCloud();
  const legacyRevs = { OLD1: rev('OLD1', { status: 'rejected' }) }; // propositalmente diferente — prova que não é consultado
  const collectionRevs = { NEW1: rev('NEW1'), NEW2: rev('NEW2') };
  cloud.setRaw('main', { ...metaBase095Gate, lesionRevisions: legacyRevs, lesionRevisionsStorage: 'collection' });
  cloud.setRaw('sub/lesionRevisions/NEW1', collectionRevs.NEW1);
  cloud.setRaw('sub/lesionRevisions/NEW2', collectionRevs.NEW2);
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), collectionRevs, 'fonte é só a coleção; o campo legado (OLD1) nunca entra na leitura');
});

test('GATE-E. coleção parcialmente preenchida NUNCA ativa o gate automaticamente (nenhum fluxo de boot/push toca o campo)', async () => {
  const cloud = makeFakeCloud();
  cloud.setRaw('main', { ...metaBase095Gate });
  cloud.setRaw('sub/lesionRevisions/NEW1', rev('NEW1')); // "migração em andamento" — parcial, sem gate
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.DATA = [...a.context.DATA, lesion('seed_2')]; // ação real não relacionada
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, false, 'escrita não relacionada aceita normalmente');
  assert.equal(cloud.peekMeta().lesionRevisionsStorage, undefined, 'nenhum caminho de boot/push ativa o gate por conta própria');
});

test('GATE-F. validação divergente => activateLesionRevisionsCollectionStorage() recusa e NÃO toca o meta', async () => {
  const cloud = makeFakeCloud();
  cloud.setRaw('main', { ...metaBase095Gate });
  cloud.setRaw('sub/lesionRevisions/NEW1', rev('NEW1', { status: 'rejected' })); // remoto diferente do local
  const metaBefore = cloud.peekMeta();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  vm.runInContext("LESION_REVISIONS = { NEW1: " + JSON.stringify(rev('NEW1')) + " };", a.context); // local diferente (status pending)
  const result = await a.context.activateLesionRevisionsCollectionStorage(5000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'validation_failed');
  assert.equal(result.validation.ok, false);
  assert.deepEqual(plain(result.validation.differentIds), ['NEW1']); // plain() — cross-realm vm array, ver outras asserções do arquivo
  assert.deepEqual(cloud.peekMeta(), metaBefore, 'meta byte a byte intacto — validação falhou, nada foi escrito');
});

test('GATE-G. validação 1:1 perfeita => activateLesionRevisionsCollectionStorage() ativa o gate preservando o resto do meta', async () => {
  const cloud = makeFakeCloud();
  cloud.setRaw('main', { ...metaBase095Gate, review: { seed_1: 2 }, orderUpdatedAt: { section: 42, sites: {} } });
  cloud.setRaw('sub/lesionRevisions/NEW1', rev('NEW1'));
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  vm.runInContext("LESION_REVISIONS = { NEW1: " + JSON.stringify(rev('NEW1')) + " };", a.context); // local idêntico ao remoto
  const result = await a.context.activateLesionRevisionsCollectionStorage(5000);
  assert.equal(result.ok, true);
  assert.equal(result.validation.ok, true);
  const metaAfter = cloud.peekMeta();
  assert.equal(metaAfter.lesionRevisionsStorage, 'collection', 'gate ativado');
  assert.equal(metaAfter.review.seed_1, 2, 'campos não relacionados do meta sobrevivem (tx.set não apaga o resto do documento)');
  assert.equal(metaAfter.orderUpdatedAt.section, 42);
});

test('GATE-H. activateLesionRevisionsCollectionStorage não tem call site automático em nenhum fluxo de produção', () => {
  // Ignora linhas de comentário (// ...) — só sobra código real. A única
  // ocorrência esperada é a própria declaração; qualquer outra seria uma
  // CHAMADA de verdade, exatamente o que não deve existir.
  const codeLines = html.split('\n').filter((line) => !/^\s*\/\//.test(line));
  const callSites = codeLines.join('\n').match(/activateLesionRevisionsCollectionStorage\(/g) || [];
  assert.equal(callSites.length, 1, 'função existe mas não é chamada por nenhum código de produção (boot/pull/push/migração)');
});

test('E. formato legado (campo embutido, sem pedaços) continua sendo lido corretamente', async () => {
  const cloud = makeFakeCloud();
  const legacyRevs = { OLD1: rev('OLD1'), OLD2: rev('OLD2', { status: 'proposed', updatedAt: 2000 }) };
  cloud.setRaw('main', {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {},
    lesionMerges: {}, lesionTombstones: {}, chunkCount: 0, stateSchemaVersion: 4, revision: 1,
    lesionRevisions: legacyRevs // formato pré-095 — SEM lesionRevisionsChunkCount
  });
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  assert.deepEqual(plain(a.context.LESION_REVISIONS), legacyRevs, 'pull de documento antigo lê o campo embutido normalmente');
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), legacyRevs);
});

/* F, G, H, I, J, L (removidas — Classe D, comportamento legado retirado por
 * desenho, nada a substituir individualmente):
 * - F provava a MIGRAÇÃO automática legado→pedaços "na próxima escrita bem-
 *   sucedida" de writeShardedState — esse mecanismo não existe mais (ver
 *   teste D/BUG FIX acima: o campo legado agora é só PRESERVADO, nunca
 *   migrado automaticamente — migração deliberada é
 *   migrateLesionRevisionsLocalToCollection(), Bloco A, nunca automática).
 * - G/H provavam UNIÃO multi-dispositivo de LESION_REVISIONS via pedaços
 *   dentro de writeShardedState — a união agora acontece por documento em
 *   writeLesionReviewIncremental()/mergeOneLesionReviewPair(), já coberta em
 *   tests/lesion-revisions-collection.test.js.
 * - I provava que um pedaço de LESION_REVISIONS grande demais fazia
 *   writeShardedState recusar a escrita inteira — não é mais possível: o
 *   tamanho de LESION_REVISIONS não tem NENHUM efeito em writeShardedState
 *   (prova direta de desacoplamento já no teste C acima, estático).
 * - J provava o codec de progresso embutido DENTRO dos pedaços de
 *   writeShardedState — o codec em si é o mesmo e continua coberto (testes
 *   E/095C.1C/1D abaixo, formato legado) e, pro caminho novo, em
 *   tests/lesion-revisions-collection.test.js (F2).
 * - L comparava syncAuditCounters local × "nuvem" obtida via
 *   readShardedState — como LESION_REVISIONS não sai mais da nuvem por essa
 *   função, a comparação não tem mais sinal útil; fidelidade por revisão já
 *   é provada byte a byte em tests/lesion-revisions-collection.test.js.
 */

test('K. collectExternalSnapshotRefs/collectPendingSnapshotRefs continuam funcionando sobre LESION_REVISIONS (antes de qualquer sharding)', async () => {
  const d = makeDevice(makeFakeCloud());
  const revs = {
    R1: rev('R1', { structuralExecution: { snapshotStorage: 'external', snapshotRef: 'snap_1' } }),
    R2: rev('R2', { attempts: [{ id: 'att_1', snapshotStorage: 'external', snapshotRef: 'snap_2' }] }),
    R3: rev('R3') // sem ref nenhuma
  };
  assert.deepEqual(plain(d.context.collectExternalSnapshotRefs(revs)).sort(), ['snap_1', 'snap_2']);
  const pending = await d.context.collectPendingSnapshotRefs(revs);
  assert.deepEqual(plain(pending).sort(), ['snap_1', 'snap_2'], 'nenhum marcado como sincronizado ainda = todos pendentes');
});

test('N. mensagem de erro diferencia pedaço de DATA, documento principal e pedaço de LESION_REVISIONS (nunca a dica genérica errada)', () => {
  const d = makeDevice(makeFakeCloud());
  const oversized = { pad: 'x'.repeat(Math.ceil(1.0 * MB)) };
  const calls = [];
  d.context.setSyncStatus = (ok, detail) => calls.push({ ok, detail });

  d.context.checkChunkSize(oversized, 'pedaço 1/3');
  d.context.checkChunkSize(oversized, 'documento principal (revisão/SRS/histórico)');
  d.context.checkChunkSize(oversized, 'revisões de lesão — pedaço 1/2');

  assert.equal(calls.length, 3);
  assert.match(calls[0].detail, /Cloudinary/, 'DATA: mantém a dica de imagem/Cloudinary (comportamento original preservado)');
  assert.doesNotMatch(calls[1].detail, /Cloudinary/, 'documento principal: nunca a dica de imagem');
  assert.doesNotMatch(calls[2].detail, /Cloudinary/, 'revisões de lesão: nunca a dica de imagem');
  assert.match(calls[2].detail, /revis(õ|ã)o/i, 'revisões de lesão: dica própria, menciona revisão');
  assert.notEqual(calls[1].detail, calls[2].detail, 'as duas mensagens não-DATA são diferentes entre si');
});

/* O1, O2, O3, O4, P (removidos — Classe D, mecanismo retirado por desenho):
 * - O1 provava a limpeza pós-commit de pedaços órfãos de writeShardedState
 *   — writeShardedState nunca mais escreve nem limpa lesion_revisions_chunk_*
 *   (ver teste C acima); não há mais "pedaço órfão" produzido por essa
 *   função, então não há mais limpeza a provar aqui.
 * - O2 provava que checkChunkSize, DENTRO de writeShardedState, rodava sobre
 *   o payload JÁ codificado (não o cru) — código que não existe mais nesta
 *   função. A mesma preocupação, pro caminho novo, já é coberta em
 *   tests/structural-snapshot-atomic-commit.test.js (3B-01..03, migrados
 *   pra writeLesionReviewIncremental).
 * - O3/O4 provavam UNIÃO multi-dispositivo com fronteiras de pedaço
 *   diferentes, via writeShardedState — a união agora é por documento em
 *   writeLesionReviewIncremental()/mergeOneLesionReviewPair(), sem
 *   "fronteira de pedaço" nenhuma (não existe mais sharding nesse caminho);
 *   já coberto em tests/lesion-revisions-collection.test.js.
 * - P documentava um risco residual específico do FORMATO ANTIGO (cliente
 *   desatualizado reescrevendo lesionRevisionsChunkCount por engano via
 *   writeShardedState). Esse write path para LESION_REVISIONS não existe
 *   mais — e o teste D/BUG FIX acima já prova o oposto: o ponteiro legado
 *   agora é PRESERVADO (nunca mais pisado) por qualquer escrita de
 *   writeShardedState, o que elimina exatamente o risco que P documentava.
 */

/* ===========================================================================
 * PROTEÇÃO 095B — barreira de versão de schema do documento principal.
 *
 * Bloco B (retomada): v5 = ANTERIOR (LESION_REVISIONS ainda fazia parte do
 * contrato de writeShardedState — pedaços próprios + lesionRevisionsChunkCount
 * escritos por ELE). v6 = ATUAL (writeShardedState nunca mais toca
 * LESION_REVISIONS — ver testes C/D acima; sync de revisão é só por
 * documento, writeLesionReviewIncremental). v7 = FUTURO/INCOMPATÍVEL (usado
 * só nestes testes pra simular "outro dispositivo já numa versão que este
 * cliente ainda não entende").
 *
 * Defesa em DUAS camadas, testadas em separado:
 *
 * 1) CÓDIGO (testável aqui com as funções reais): writeShardedState() nunca
 *    escreve por cima de um documento cujo stateSchemaVersion remoto já é
 *    MAIOR que STATE_SCHEMA_VERSION=6 — ver guard logo após a checagem de
 *    revisão, dentro da transação, ANTES de qualquer tx.set(). Mecanismo
 *    IDÊNTICO ao que já protegia v4→v5; só o número mudou.
 * 2) REGRA DO FIRESTORE (servidor — NÃO testável aqui sem um emulador real
 *    do Firestore, que este projeto não usa/não tem configurado): bloqueia
 *    um cliente < 6 de gravar atlas_state/main. O teste "3" abaixo não
 *    chama o Firestore de verdade — ele espelha a MESMA condição booleana
 *    da regra proposta (ver relatório) como uma função JS pura, só pra
 *    documentar/fixar por escrito exatamente o que a regra precisa aceitar
 *    e recusar. Isso NÃO substitui validar a regra de verdade no Firebase
 *    Console/emulador antes de publicá-la.
 * ===========================================================================
 */

// Espelho PURO (sem rede) da condição da regra proposta para
// atlas_state/main — usado só pra fixar por escrito o comportamento
// esperado (teste "3"). A fonte da verdade é a regra publicada no Firebase
// Console; isto aqui NUNCA é executado pelo app nem pelo Firestore real.
function mainWriteRuleAllows(resourceData) {
  const v = resourceData && resourceData.stateSchemaVersion;
  return typeof v === 'number' && Number.isInteger(v) && v >= 6;
}

test('095B.1 — escrita de cliente v6 sobre documento v5 (legado): schema sobe pra v6 e LESION_REVISIONS embutido/pedaços sobrevivem intactos (nunca migrados automaticamente)', async () => {
  const cloud = makeFakeCloud();
  const legacyMain = {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {},
    tombstones: {}, lesionRevisions: { OLD1: rev('OLD1') }, lesionMerges: {}, lesionTombstones: {},
    chunkCount: 0, stateSchemaVersion: 5, revision: 1
  };
  cloud.setRaw('main', legacyMain);
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS), ['OLD1'], 'leitura v5 (legado embutido) funciona normalmente');

  // Ação REAL não relacionada: edita DATA e publica — writeShardedState()
  // precisa escrever v6, mas NUNCA migra/mexe no campo legado de revisões.
  a.context.DATA = [...a.context.DATA, lesion('seed_2')];
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  const meta = cloud.peekMeta();
  assert.equal(meta.stateSchemaVersion, 6, 'a PRÓXIMA escrita bem-sucedida carimba v6 (schema do cliente atual)');
  assert.deepEqual(meta.lesionRevisions, legacyMain.lesionRevisions, 'campo legado PRESERVADO byte a byte — nunca migrado automaticamente (ver teste D/BUG FIX)');
});

test('095B.2 — cliente v6 grava main v6 do zero (sem documento prévio) e NUNCA inclui lesionRevisionsChunkCount/lesionRevisions', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  const meta = cloud.peekMeta();
  assert.equal(meta.stateSchemaVersion, 6);
  assert.equal('lesionRevisionsChunkCount' in meta, false, 'writeShardedState nunca escreve este campo (Bloco B)');
  assert.equal('lesionRevisions' in meta, false, 'writeShardedState nunca escreve este campo (Bloco B)');
});

test('095B.3 — regra proposta (espelho JS, não é o Firestore real): aceita só stateSchemaVersion inteiro >=6, recusa v5/ausente/não-numérico', () => {
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 6 }), true, 'v6 (atual) aceito');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 7 }), true, 'v7 futuro aceito (>=6)');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 5 }), false, 'v5 (cliente anterior ao Bloco B) RECUSADO');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 0 }), false, 'v0 RECUSADO');
  assert.equal(mainWriteRuleAllows({}), false, 'campo ausente RECUSADO (trata como pré-histórico/desconhecido)');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: '6' }), false, 'string "6" RECUSADO (precisa ser number, não bypassa por coerção)');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 6.5 }), false, 'não-inteiro RECUSADO');
});

test('095B.4 — remoto já num schema FUTURO (>6): writeShardedState recusa escrever, transação inteira aborta, nada publicado', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  const metaBefore = cloud.peekMeta();
  assert.equal(metaBefore.stateSchemaVersion, 6);

  // Simula outro dispositivo, já numa versão futura do Atlas (v7
  // hipotético), tendo escrito depois deste device.
  cloud.setRaw('main', { ...metaBefore, stateSchemaVersion: 7, [a.context.CLOUD_REVISION_FIELD]: metaBefore.revision });
  const snapshotBefore = cloud.snapshotStore();

  a.context.DATA = [...a.context.DATA, lesion('seed_2')];
  await a.context.saveData();
  const ok = await a.context.writeShardedState(5000);
  assert.equal(ok, false, 'escrita recusada');
  assert.equal(a.context.lastWriteRefusedReason, 'schema_version_too_new');
  // Atomicidade: nada mudou na nuvem (nem main, nem nenhum pedaço).
  const snapshotAfter = cloud.snapshotStore();
  assert.deepEqual(Array.from(snapshotAfter.entries()), Array.from(snapshotBefore.entries()),
    'transação abortada por completo — nenhuma escrita parcial, nada sobrescrito');
});

test('095B.5 — cliente v6 continua sincronizando normalmente (push e pull), e nunca escreve lesionRevisionsChunkCount', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, false, 'push normal continua funcionando');

  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await b.boot();
  assert.equal(b.context.DATA.length, a.context.DATA.length, 'pull normal continua funcionando');
  const meta = cloud.peekMeta();
  assert.equal(meta.stateSchemaVersion, 6);
  assert.equal('lesionRevisionsChunkCount' in meta, false, 'Bloco B — writeShardedState nunca escreve este campo');
});

test('095B.6 — schemaVersion >6 é recusado pelo cliente v6 para escrita (limite exato: 6 aceito, 7 recusado)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  const meta6 = cloud.peekMeta();
  assert.equal(meta6.stateSchemaVersion, 6);

  // No limite: remoto exatamente em 6 (o que este cliente entende) — escreve normalmente.
  a.context.DATA = [...a.context.DATA, lesion('seed_2')];
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, false, 'schema==6 (igual ao que este cliente entende) é aceito');

  // Acima do limite: remoto em 7 (futuro) — recusa.
  const metaNow = cloud.peekMeta();
  cloud.setRaw('main', { ...metaNow, stateSchemaVersion: 7 });
  a.context.DATA = [...a.context.DATA, lesion('seed_3')];
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, true, 'schema==7 (futuro) é recusado');
  assert.equal(a.context.lastWriteRefusedReason, 'schema_version_too_new');
});

test('095B.7 — leitura legada v4 (sem stateSchemaVersion/lesionRevisionsChunkCount) continua funcionando', async () => {
  const cloud = makeFakeCloud();
  const legacyMain = {
    review: { seed_1: 1 }, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {},
    tombstones: {}, lesionRevisions: { L1: rev('L1'), L2: rev('L2') }, lesionMerges: {}, lesionTombstones: {},
    chunkCount: 0, stateSchemaVersion: 4, revision: 1
  };
  cloud.setRaw('main', legacyMain);
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS).sort(), ['L1', 'L2']);
  // Nenhuma escrita ainda ocorreu — o documento remoto continua v4 intacto.
  assert.equal(cloud.peekMeta().stateSchemaVersion, 4);
});

/* ===========================================================================
 * PROTEÇÃO 095C — fail-safe de versão também na LEITURA (readShardedState),
 * não só na escrita (095B). Ver index.html: o guard roda logo após ler
 * `meta`, ANTES de tocar lastKnownCloudRevision/window ou de ler qualquer
 * pedaço — então NENHUM estado (local ou de rastreio de sync) muda quando
 * o schema remoto é maior que STATE_SCHEMA_VERSION. v7 = futuro/incompatível
 * (Bloco B: v6 agora é o schema ATUAL, não mais hipotético-futuro).
 * ===========================================================================
 */

test('095C.1A — schema remoto v7 (futuro): leitura recusada SEM alterar DATA/REVIEW/LESION_REVISIONS locais', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  const dataBefore = plain(a.context.DATA);
  const reviewBefore = plain(a.context.REVIEW);
  const revisionsBefore = plain(a.context.LESION_REVISIONS);

  // Outro dispositivo, numa versão futura hipotética (v7), já escreveu.
  const metaNow = cloud.peekMeta();
  cloud.setRaw('main', { ...metaNow, stateSchemaVersion: 7 });

  await a.context.syncFromFirebase(); // pull real — não deve adotar nada
  assert.deepEqual(plain(a.context.DATA), dataBefore, 'DATA local intocado');
  assert.deepEqual(plain(a.context.REVIEW), reviewBefore, 'REVIEW local intocado');
  assert.deepEqual(plain(a.context.LESION_REVISIONS), revisionsBefore, 'LESION_REVISIONS local intocado');
  const msgs = a.calls.statusMessages.filter((m) => !m.ok);
  assert.ok(msgs.length > 0, 'algum aviso de falha foi mostrado');
  assert.match(msgs[msgs.length - 1].detail || '', /atualiz/i, 'mensagem clara de que o Atlas precisa ser atualizado');
});

test('095C.1B — schema remoto v7 (futuro): nenhum write subsequente automático (push recusado, nada publicado)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  await a.context.saveData();
  await a.context.pushToFirebaseNow();

  const metaNow = cloud.peekMeta();
  cloud.setRaw('main', { ...metaNow, stateSchemaVersion: 7 });
  const snapshotBefore = cloud.snapshotStore();

  a.context.DATA = [...a.context.DATA, lesion('seed_2')];
  await a.context.saveData(); // marca dirty + agenda push
  await a.context.pushToFirebaseNow(); // chamada explícita (equivalente ao fim do debounce)

  assert.equal(a.context.syncPushPending, true, 'push recusado, fica pendente — nunca silenciosamente descartado');
  assert.equal(a.context.lastWriteRefusedReason, 'schema_version_too_new');
  const snapshotAfter = cloud.snapshotStore();
  assert.deepEqual(Array.from(snapshotAfter.entries()), Array.from(snapshotBefore.entries()),
    'nada foi publicado — nem main, nem nenhum pedaço (writeShardedState nem chega a ser chamado: reconcileBeforePush já recusa antes)');
});

test('095C.1C — leitura de main v4 (legado, sem stateSchemaVersion/chunkCount de lesionRevisions) continua funcionando', async () => {
  const cloud = makeFakeCloud();
  cloud.setRaw('main', {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {},
    lesionRevisions: { L1: rev('L1') }, lesionMerges: {}, lesionTombstones: {},
    chunkCount: 0, stateSchemaVersion: 4, revision: 1
  });
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(Object.keys(remote.lesionRevisions), ['L1'], 'v4 legado lido normalmente, sem lançar nada');
});

test('095C.1D — leitura de main v5 (pedaços legados) continua funcionando (fallback de leitura, seed manual — a escrita normal não produz mais este formato)', async () => {
  const cloud = makeFakeCloud();
  // Bloco B: writeShardedState não escreve mais pedaços de LESION_REVISIONS
  // (ver teste C acima) — pra provar que a LEITURA do formato v5 continua
  // funcionando, o fixture precisa ser semeado manualmente (mesmo padrão já
  // usado em 095B.1/095B.7/095C.1C pro formato v4).
  const legacyRevs = { R1: rev('R1') };
  cloud.setRaw('main', {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {},
    lesionMerges: {}, lesionTombstones: {}, chunkCount: 0, stateSchemaVersion: 5, revision: 1,
    lesionRevisionsChunkCount: 1
  });
  cloud.setRaw('lr_chunk_0', { entries: legacyRevs });

  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await b.context.readShardedState(5000);
  assert.deepEqual(Object.keys(remote.lesionRevisions), ['R1'], 'v5 (pedaços legados) lido normalmente, sem lançar nada');
});


/* ===========================================================================
 * PROTEÇÃO 095C (item 2) — restoreCanonicalStateToCloud() compatível com o
 * schema v6 (Bloco B). Esta função é uma ferramenta forense SEPARADA, nunca
 * tocada pelo Bloco B — continua usando splitLesionRevisionsIntoShards/
 * structuralSnapshotProgressToFirestore diretamente, exatamente como antes;
 * só o número de STATE_SCHEMA_VERSION que ela carimba mudou (5→6). O formato
 * canônico original (ATLAS_CANONICO_LIMPO_1216_116_
 * FINAL.json) nunca teve lesionRevisions/lesionMerges/lesionTombstones/
 * reviewProgress/reviewOverride/reviewUpdatedAt/orderUpdatedAt — por isso
 * payload.{campo} é OPCIONAL: omitido = PRESERVA o que já existe na nuvem
 * (lido na mesma transação da revisão); presente (mesmo {}) = SUBSTITUI,
 * com os MESMOS helpers de sharding/codec de writeShardedState.
 * ===========================================================================
 */

function makeSyntheticCanonicalPayload(extra) {
  return Object.assign({
    data: [
      { id: 'c0', name: 'Lesão A', s: 'Seção 1', site: 'Sítio 1', images: [{ assetId: 'A1', publicId: 'p/A1' }] },
      { id: 'c1', name: 'Lesão B', s: 'Seção 1', site: 'Sítio 2', images: [] }
    ],
    review: { c0: 1, c1: 2 },
    srs: { c0: { interval: 3, due: 1, streak: 1 } },
    sessionLog: {},
    sectionOrder: ['Seção 1'],
    siteOrder: { 'Seção 1': ['Sítio 1', 'Sítio 2'] },
    imageTombstones: {}
  }, extra || {});
}
const SYNTHETIC_EXPECTED_095C = {
  records: 2, dupGroups: 0, highIds: 0,
  withImage: 1, imageRefs: 1, distinctStableKeys: 1,
  review: 2, srs: 1, altPlacements: 0, tombstones: 0,
  zeroImageIds: ['c1'], seedRangeMax: -1, uCount: 0
};

test('095C.2E — restore canônico v6 PRESERVA LESION_REVISIONS já existente na nuvem (payload não traz o campo)', async () => {
  const cloud = makeFakeCloud();
  // Seed MANUAL (Bloco B: saveLesionRevisions()/pushToFirebaseNow() não
  // levam mais LESION_REVISIONS à nuvem — ver testes C/D acima) — simula
  // uma nuvem que já tinha pedaços legados ANTES do restore.
  const revisionsBefore = { R1: rev('R1'), R2: rev('R2', { updatedAt: 2000 }) };
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  cloud.setRaw('main', { ...cloud.peekMeta(), lesionRevisionsChunkCount: 1 });
  cloud.setRaw('lr_chunk_0', { entries: revisionsBefore });
  assert.deepEqual(Object.keys(cloud.peekLesionRevisions()).sort(), ['R1', 'R2']);

  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  assert.deepEqual(plain(cloud.peekLesionRevisions()), revisionsBefore, 'LESION_REVISIONS preservado intacto — restore nem sabia que existia');
  assert.equal(cloud.peekMeta().stateSchemaVersion, 6);
});

test('GATE-I. restore canônico v6 PRESERVA lesionRevisionsStorage="collection" já ativado na nuvem', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  cloud.setRaw('main', { ...cloud.peekMeta(), lesionRevisionsStorage: 'collection' });
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  assert.equal(cloud.peekMeta().lesionRevisionsStorage, 'collection', 'gate sobrevive ao restore canônico (bug fix)');
});

test('GATE-J. restore canônico v6 PRESERVA lesionRevisionsStorage="legacy"', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  cloud.setRaw('main', { ...cloud.peekMeta(), lesionRevisionsStorage: 'legacy' });
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  assert.equal(cloud.peekMeta().lesionRevisionsStorage, 'legacy', 'gate continua "legacy" (nunca promovido pelo restore)');
});

test('GATE-K. restore canônico v6: campo lesionRevisionsStorage AUSENTE antes não vira "collection" depois', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  assert.equal((cloud.peekMeta() || {}).lesionRevisionsStorage, undefined, 'pré-condição: campo ausente (nuvem nunca escrita)');
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  assert.equal(cloud.peekMeta().lesionRevisionsStorage, undefined, 'restore nunca ativa o gate por conta própria');
});

test('095C.2F — restore PRESERVA reviewProgress/lesionMerges/lesionTombstones já existentes (payload não traz nenhum dos campos)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  a.context.REVIEW_PROGRESS = { seed_9: { b: 1, f: 1000, a: [[1000, 1, 1]] } };
  // LESION_MERGES/LESION_TOMBSTONES são declarados via `let` dentro dos
  // módulos brutos injetados no engine (lesionMergesModule091c/094) — uma
  // ligação LEXICAL própria do vm.Script, separada da propriedade do
  // sandbox. Atribuir direto por fora (a.context.LESION_MERGES = ...) só
  // mudaria a propriedade do objeto, nunca o binding interno que
  // writeShardedState de fato lê — por isso o setter explícito abaixo.
  a.context.__setLesionMerges095c({ seed_dup: { into: 'seed_1', at: 1000, group: 'g1' } });
  a.context.__setLesionTombstones095c({ seed_old: { deletedAt: 1000 } });
  await a.context.saveData();
  await a.context.pushToFirebaseNow();
  const metaBefore = cloud.peekMeta();
  assert.ok(metaBefore.reviewProgress && metaBefore.reviewProgress.seed_9, 'pré-condição: reviewProgress já na nuvem');
  assert.ok(metaBefore.lesionMerges && metaBefore.lesionMerges.seed_dup, 'pré-condição: lesionMerges já na nuvem');
  assert.ok(metaBefore.lesionTombstones && metaBefore.lesionTombstones.seed_old, 'pré-condição: lesionTombstones já na nuvem');

  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  const metaAfter = cloud.peekMeta();
  assert.deepEqual(plain(metaAfter.reviewProgress), plain(metaBefore.reviewProgress), 'reviewProgress preservado');
  assert.deepEqual(plain(metaAfter.lesionMerges), plain(metaBefore.lesionMerges), 'lesionMerges preservado');
  assert.deepEqual(plain(metaAfter.lesionTombstones), plain(metaBefore.lesionTombstones), 'lesionTombstones preservado');
  // REVIEW_PROGRESS global também atualizado com o preservado (nunca
  // zerado) — LESION_MERGES/LESION_TOMBSTONES não são verificáveis assim
  // por fora (ver nota do setter acima); a prova real já está no doc da
  // nuvem (metaAfter, verificado linhas acima) e é confirmada de novo via
  // leitura normal por um 2º dispositivo no teste 095C.2K.
  assert.deepEqual(plain(a.context.REVIEW_PROGRESS), plain(metaBefore.reviewProgress));
});

test('095C.2G — restore com LESION_REVISIONS explícito >1 MiB usa pedaços (mesmo empacotador de writeShardedState)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  const heavy = buildHeavyLesionRevisions(25, 50 * 1024); // ~1.22 MiB cru
  assert.ok(byteSize(heavy) > MB);

  const result = await a.context.restoreCanonicalStateToCloud(
    makeSyntheticCanonicalPayload({ lesionRevisions: heavy }),
    { expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C }
  );
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  assert.ok(cloud.peekLesionRevisionsShardCount() > 1, 'LESION_REVISIONS >1 MiB precisa ter ido pra MAIS de 1 pedaço');
  assert.deepEqual(Object.keys(cloud.peekLesionRevisions()).sort(), Object.keys(heavy).sort(), 'nenhuma revisão perdida ao dividir em pedaços');
  assert.deepEqual(plain(a.context.LESION_REVISIONS), plain(heavy), 'global atualizado com exatamente o que foi restaurado');
});

test('095C.2H — falha de UM pedaço de LESION_REVISIONS (grande demais) aborta o restore INTEIRO — nada publicado', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  const snapshotBefore = cloud.snapshotStore();
  const oversized = { HUGE: heavyRev('HUGE', 1.1 * MB) };

  const result = await a.context.restoreCanonicalStateToCloud(
    makeSyntheticCanonicalPayload({ lesionRevisions: oversized }),
    { expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lesion_revisions_chunk_too_large');
  const snapshotAfter = cloud.snapshotStore();
  assert.deepEqual(Array.from(snapshotAfter.entries()), Array.from(snapshotBefore.entries()),
    'nada foi publicado — a checagem roda ANTES da transação (igual writeShardedState faz pra DATA)');
});

test('095C.2I — regra proposta (espelho JS) aceita o documento que o restore v6 publica', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true);
  assert.equal(mainWriteRuleAllows(cloud.peekMeta()), true, 'documento escrito pelo restore passa na regra proposta (stateSchemaVersion inteiro >=6)');
});

test('095C.2J — restore NUNCA escreve stateSchemaVersion 5 (anterior ao Bloco B; nem em nuvem vazia, primeira escrita)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  assert.equal(cloud.peekMeta(), null, 'pré-condição: nuvem vazia');
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true);
  assert.notEqual(cloud.peekMeta().stateSchemaVersion, 5);
  assert.equal(cloud.peekMeta().stateSchemaVersion, 6);
});

test('095C.2K — leitura normal (readShardedState) após o restore reproduz semanticamente o estado restaurado', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  const heavy = { R1: rev('R1'), R2: rev('R2', { updatedAt: 2000 }) };
  const payload = makeSyntheticCanonicalPayload({ lesionRevisions: heavy });
  const result = await a.context.restoreCanonicalStateToCloud(payload, {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, JSON.stringify(result));

  const b = makeDevice(cloud, { initialCatalog: [] });
  const remote = await b.context.readShardedState(5000);
  assert.deepEqual(plain(remote.data).map((e) => e.id).sort(), ['c0', 'c1']);
  assert.deepEqual(plain(remote.review), payload.review);
  assert.deepEqual(plain(remote.srs), payload.srs);
  assert.deepEqual(Object.keys(remote.lesionRevisions).sort(), ['R1', 'R2']);
  assert.deepEqual(plain(remote.lesionRevisions), plain(heavy));
});
