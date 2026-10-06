'use strict';

/* PROTEÇÃO 095 — EXTERNALIZAÇÃO/SHARDING DE LESION_REVISIONS.
 *
 * Bug real (2026-10-05): LESION_REVISIONS sozinho passou de 1 MiB (~700+
 * revisões reais, cada uma com history/attempts/humanFeedback) e o
 * documento principal do Firestore passou a ser recusado por
 * checkChunkSize() (teto de 0.95 MiB) — com uma mensagem genérica de
 * "imagem"/Cloudinary que não se aplicava a este caso.
 *
 * Este arquivo testa o módulo novo (splitLesionRevisionsIntoShards) e as
 * amarrações reais (writeShardedState, readShardedState, checkChunkSize)
 * usando as FUNÇÕES REAIS extraídas do index.html dentro de um Firestore
 * falso compartilhado — mesmo padrão de tests/lesion-tombstone.test.js.
 * Arquivo NOVO e autocontido de propósito: tests/multi-device-sync.test.js
 * tem uma investigação de rollback estrutural em andamento (modificação
 * local não commitada) e não deve ser tocado por esta tarefa; o merge puro
 * de LESION_REVISIONS e as amarrações estáticas do pipeline já são cobertos
 * em tests/lesion-revisions-sync.test.js — aqui o foco é o ROUND-TRIP real
 * write→read com pedaços de verdade (vários KB/MB), multi-dispositivo,
 * legado→novo e falha parcial seguro.
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
const lesionRevisionsFns084 = ['mergeLesionRevisions', 'saveLesionRevisions', 'loadLesionRevisions', 'updateReviewCenterBadges',
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
    STATE_SCHEMA_VERSION: 5, // PROTEÇÃO 095B
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

test('C. documento principal permanece abaixo do limite mesmo com LESION_REVISIONS pesado (campo sai do meta)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = buildHeavyLesionRevisions(25, 50 * 1024);
  await a.context.markSyncDirty();
  const ok = await a.context.pushToFirebaseNow().then(() => a.context.syncPushPending === false).catch(() => false);
  // pushToFirebaseNow não devolve o resultado — confere pelo estado publicado.
  const meta = cloud.peekMeta();
  assert.ok(meta, 'escrita precisa ter publicado o documento principal');
  assert.equal('lesionRevisions' in meta, false, 'o campo embutido nunca mais aparece no meta');
  assert.ok(meta.lesionRevisionsChunkCount > 1, 'LESION_REVISIONS pesado gera mais de 1 pedaço');
  const metaBytes = byteSize(meta);
  assert.ok(metaBytes < 0.95 * MB, 'documento principal (' + metaBytes + ' bytes) precisa caber confortavelmente');
  assert.equal(a.context.syncPushPending, false, 'push confirmado (sem pedaço grande demais)');
});

test('D. round-trip write→read produz LESION_REVISIONS semanticamente idêntico (dispositivo novo, pedaços reais)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  const heavy = buildHeavyLesionRevisions(20, 40 * 1024);
  a.context.LESION_REVISIONS = heavy;
  await a.context.markSyncDirty();
  await a.context.pushToFirebaseNow();
  assert.ok(cloud.peekLesionRevisionsShardCount() > 1);

  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await b.boot(); // dispositivo já inicializado -> pull automático
  assert.deepEqual(plain(b.context.LESION_REVISIONS), heavy, 'B recebe EXATAMENTE o mesmo conteúdo, reconstruído dos pedaços');

  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(plain(remote.lesionRevisions), heavy, 'readShardedState() reconstrói por completo, direto do servidor');
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

test('F. migração legado→novo formato na PRÓXIMA escrita bem-sucedida, sem perder nenhuma revisão', async () => {
  const cloud = makeFakeCloud();
  const legacyRevs = { OLD1: rev('OLD1'), OLD2: rev('OLD2', { status: 'proposed', updatedAt: 2000 }) };
  cloud.setRaw('main', {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {},
    lesionMerges: {}, lesionTombstones: {}, chunkCount: 0, stateSchemaVersion: 4, revision: 1,
    lesionRevisions: legacyRevs
  });
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  assert.equal('lesionRevisionsChunkCount' in cloud.peekMeta(), false, 'pré-condição: nuvem ainda no formato legado');
  // ação REAL do usuário: nova revisão + salvar (marca dirty + publica).
  a.context.LESION_REVISIONS = { ...a.context.LESION_REVISIONS, NEW1: rev('NEW1', { updatedAt: 3000 }) };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow(); // saveLesionRevisions() agenda push DEBOUNCED; força a publicação imediata
  const metaAfter = cloud.peekMeta();
  assert.ok(metaAfter.lesionRevisionsChunkCount >= 1, 'migrou pro formato novo');
  assert.equal('lesionRevisions' in metaAfter, false, 'campo legado não é mais escrito');
  const cloudRevs = cloud.peekLesionRevisions();
  assert.deepEqual(Object.keys(cloudRevs).sort(), ['NEW1', 'OLD1', 'OLD2'], 'nenhuma revisão antiga se perdeu na migração');
  assert.deepEqual(plain(cloudRevs.OLD1), legacyRevs.OLD1);
  assert.deepEqual(plain(cloudRevs.OLD2), legacyRevs.OLD2);
});

test('G. dois dispositivos com revisões DIFERENTES convergem para a UNIÃO (via pedaços)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await b.boot();

  a.context.LESION_REVISIONS = { RA: rev('RA', { updatedAt: 1000 }) };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  b.context.LESION_REVISIONS = { RB: rev('RB', { updatedAt: 1000 }) };
  await b.context.saveLesionRevisions(); await b.context.pushToFirebaseNow(); // reconcile-antes-de-push funde RA (remoto) + RB (local)

  assert.deepEqual(Object.keys(cloud.peekLesionRevisions()).sort(), ['RA', 'RB'], 'nuvem com a união dos dois');
  assert.deepEqual(Object.keys(b.context.LESION_REVISIONS).sort(), ['RA', 'RB'], 'B já converge local (reconcile-antes-de-push)');

  await a.context.syncFromFirebase();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS).sort(), ['RA', 'RB'], 'A converge no próximo pull');
});

test('H. dispositivo desatualizado (nunca viu a revisão do outro) NUNCA apaga a revisão remota ao publicar', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { RA: rev('RA', { updatedAt: 1000 }) };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();

  // B nunca sincronizou desde antes de RA existir — tenta publicar RB sem
  // conhecer RA (saveLesionRevisions() real sempre reconcilia antes, mas o
  // teste prova que mesmo assim RA sobrevive).
  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  b.context.appStateReady = true;
  b.context.lastKnownCloudRevision = null; // nunca leu a nuvem nesta sessão
  b.context.LESION_REVISIONS = { RB: rev('RB', { updatedAt: 1000 }) };
  await b.context.saveLesionRevisions(); await b.context.pushToFirebaseNow();

  const cloudRevs = cloud.peekLesionRevisions();
  assert.ok(cloudRevs.RA, 'RA (só conhecida por A) continua na nuvem');
  assert.ok(cloudRevs.RB, 'RB (de B) também chegou');
});

test('I. falha na escrita de um pedaço (grande demais) NUNCA publica estado parcial — tudo ou nada', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  // Entrada ÚNICA deliberadamente maior que o teto (1.1 MiB num campo só) —
  // nenhum empacotamento guloso evita isto: vira um pedaço sozinho grande
  // demais, e a checagem AUTORITATIVA (dentro da transação) precisa recusar
  // antes de qualquer tx.set.
  a.context.LESION_REVISIONS = { HUGE: heavyRev('HUGE', 1.1 * MB) };
  await a.context.markSyncDirty();
  const snapshotBefore = cloud.snapshotStore();
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, true, 'push precisa ter sido recusado (banner de pendência)');
  assert.equal(a.context.lastWriteRefusedReason, 'chunk_too_large');
  const msgs = a.calls.statusMessages.filter((m) => !m.ok);
  assert.ok(msgs.some((m) => /revis(õ|ã)es de lesão/i.test(m.detail || '')), 'mensagem precisa identificar revisões de lesão, não "imagem"');
  assert.doesNotMatch(msgs[msgs.length - 1].detail || '', /Cloudinary/, 'não pode usar a dica de imagem/Cloudinary para este caso');
  // Atomicidade: NADA foi escrito — nem o meta, nem nenhum pedaço.
  const snapshotAfter = cloud.snapshotStore();
  assert.deepEqual(Array.from(snapshotAfter.keys()), Array.from(snapshotBefore.keys()));
  assert.equal(cloud.peekMeta(), null, 'documento principal continua inexistente — nenhuma escrita parcial');
});

test('J. structuralExecution continua passando pelo codec structuralSnapshotProgressToFirestore/FromFirestore DENTRO dos pedaços', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  const withProgress = rev('R1', {
    structuralExecution: {
      executionId: 'exec_1', status: 'executed', type: 'merge_duplicates', at: 'now',
      affectedIds: ['seed_1'], operations: ['x'],
      beforeSnapshot: { lesions: {}, maps: { reviewProgress: { seed_1: { a: [[1711111111111, 1, 1]] } } } }
    }
  });
  a.context.LESION_REVISIONS = { R1: withProgress };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();

  // RAW no pedaço: tupla [t,ok,graded] -> objeto {t,ok,graded} (Firestore
  // não aceita array dentro de array).
  const rawShard = cloud.peekLesionRevisionsShardRaw(0);
  const rawTuple = rawShard.entries.R1.structuralExecution.beforeSnapshot.maps.reviewProgress.seed_1.a[0];
  assert.equal(Array.isArray(rawTuple), false, 'no documento, a tupla precisa estar codificada como objeto');
  assert.deepEqual(plain(rawTuple), { t: 1711111111111, ok: 1, graded: 1 });

  // Round-trip: volta a tupla depois de ler.
  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await b.boot();
  const decodedTuple = b.context.LESION_REVISIONS.R1.structuralExecution.beforeSnapshot.maps.reviewProgress.seed_1.a[0];
  assert.deepEqual(plain(decodedTuple), [1711111111111, 1, 1], 'decodificado de volta pra tupla depois da leitura');
});

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

test('L. audit counters (syncAuditCounters) continuam equivalentes local × nuvem, com LESION_REVISIONS em pedaços', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = buildHeavyLesionRevisions(10, 10 * 1024);
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();

  const localCounters = a.context.syncAuditCounters(a.context.DATA, a.context.LESION_REVISIONS, a.context.REVIEW, a.context.SRS);
  const remote = await a.context.readShardedState(5000);
  const cloudCounters = a.context.syncAuditCounters(remote.data, remote.lesionRevisions, remote.review, remote.srs);
  assert.equal(cloudCounters.revisions, localCounters.revisions);
  assert.equal(cloudCounters.revisionsPending, localCounters.revisionsPending);
  assert.equal(cloudCounters.revisionsSolutions, localCounters.revisionsSolutions);
  assert.equal(cloudCounters.revisionsBytes, localCounters.revisionsBytes, 'contagem de bytes idêntica (mesmo conteúdo, só armazenado diferente)');
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

/* ---------- Auditoria adicional (rodada de revisão) ---------- */

test('O1. encolher de pedaços: o órfão NUNCA é lido/ressuscitado; a limpeza pós-commit dispara quando sua pré-condição real ocorre', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  // Força 3+ pedaços reais (não um cenário fabricado à mão).
  a.context.LESION_REVISIONS = buildHeavyLesionRevisions(35, 48 * 1024);
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const shardCountBefore = cloud.peekLesionRevisionsShardCount();
  assert.ok(shardCountBefore >= 3, 'pré-condição: fixture precisa gerar >=3 pedaços (gerou ' + shardCountBefore + ')');
  const orphanContentBefore = cloud.peekLesionRevisionsShardRaw(2);
  assert.ok(orphanContentBefore, 'pedaço 2 existe antes de encolher');
  assert.equal(a.context.window.__lastKnownLesionRevisionsChunkCount, shardCountBefore,
    'pré-condição: o próprio dispositivo lembra do chunkCount grande, pois foi ele quem commitou');

  // mergeLesionRevisions nunca encolhe por união (PROTEÇÃO 084: nenhuma
  // revisão é descartada por merge, só adicionada/atualizada) — logo NENHUM
  // push normal deste app reduz organicamente o número de pedaços (local
  // pequeno + remoto grande = merge GRANDE). Um encolhimento real só pode
  // vir de fora da escrita normal (ex.: uma futura rotina de arquivamento,
  // fora do escopo desta tarefa) — simulamos isso escrevendo direto na
  // nuvem falsa.
  const smallRevisions = { R1: rev('R1') };
  const shrunkMain = { ...cloud.peekMeta() };
  delete shrunkMain.lesionRevisions;
  shrunkMain.lesionRevisionsChunkCount = 1;
  cloud.setRaw('main', shrunkMain);
  cloud.setRaw('lr_chunk_0', { entries: smallRevisions });

  // PARTE 1 (achado real, documentado): pushToFirebaseNow() sempre RELÊ a
  // nuvem antes de escrever (reconcileBeforePush, ALTERAÇÃO 074) — essa
  // releitura já atualiza window.__lastKnownLesionRevisionsChunkCount pro
  // valor NOVO (pequeno) ANTES da escrita rodar sua própria limpeza. Nesta
  // escrita específica, prev==committed e a limpeza pós-commit NÃO dispara.
  a.context.LESION_REVISIONS = smallRevisions;
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.equal(cloud.peekLesionRevisionsShardCount(), 1, 'estado pequeno = 1 pedaço só');
  assert.deepEqual(cloud.peekLesionRevisionsShardRaw(2), orphanContentBefore,
    'risco residual documentado (auditoria item 3): encolhimento causado por processo EXTERNO não aciona a limpeza pós-commit desta escrita, porque reconcileBeforePush já releu o valor novo antes — ver as asserções abaixo pra prova de que isso NUNCA ressuscita o conteúdo órfão');

  // O que de fato IMPORTA, e vale SEMPRE — limpo ou não: readShardedState só
  // lê 0..chunkCount-1. Mesmo com o pedaço 2 fisicamente presente...
  const remote = await a.context.readShardedState(5000);
  assert.deepEqual(Object.keys(plain(remote.lesionRevisions)), ['R1'], 'órfão no índice 2 nunca é lido (chunkCount=1)');
  await a.context.syncFromFirebase();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS), ['R1'], 'pull também não ressuscita o conteúdo órfão');
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.deepEqual(Object.keys(cloud.peekLesionRevisions()), ['R1'], 'escrita seguinte não traz o órfão de volta');

  // PARTE 2: prova de que o MECANISMO DE LIMPEZA em si funciona — não é
  // código morto/quebrado, só não é alcançado pelo fluxo normal de push (ver
  // Parte 1). Chamando writeShardedState() DIRETO (sem passar por
  // pushToFirebaseNow/reconcileBeforePush, que já teria relido e atualizado
  // window antes da escrita), com window ainda apontando pro valor antigo —
  // a pré-condição exata que o código verifica (prev > committed).
  cloud.setRaw('lr_chunk_1', orphanContentBefore); // segundo "órfão" físico, agora em índice 1
  a.context.window.__lastKnownLesionRevisionsChunkCount = 3; // "a última vez que ESTE dispositivo escreveu, eram 3 pedaços"
  a.context.LESION_REVISIONS = smallRevisions; // já é exatamente o que está commitado (1 pedaço)
  const ok = await a.context.writeShardedState(5000);
  assert.equal(ok, true);
  assert.equal(cloud.peekLesionRevisionsShardCount(), 1);
  assert.equal(cloud.peekLesionRevisionsShardRaw(1), null, 'com a pré-condição real (window desatualizado > committed), a limpeza DELETA o(s) pedaço(s) órfão(s)');
  assert.equal(cloud.peekLesionRevisionsShardRaw(2), null, 'intervalo inteiro [committed, prevKnown) é limpo, não só o primeiro índice');
});

test('O2. a checagem roda sobre o PAYLOAD REAL (envelope {entries} já codificado), não sobre o objeto cru de revisões', async () => {
  // Nota honesta (achado da auditoria): o progresso embutido em
  // structuralExecution.beforeSnapshot.maps.reviewProgress passa por
  // foldReviewProgress ANTES de qualquer coisa chegar na nuvem, que limita
  // `a` (tentativas) a REVIEW_ATTEMPTS_MAX=8 por registro (ver index.html,
  // normalizeReviewProgressEntry/foldReviewProgress). Então NÃO existe
  // fixture realista em que esse codec específico infle um pedaço de "cabe"
  // pra "não cabe" dado a margem atual (alvo de empacotamento ~0.667 MiB vs
  // teto de 0.95 MiB, ~42% de folga) — uma fixture com milhares de tuplas
  // simplesmente é cortada pra 8 ANTES de codificar, o que o teste anterior
  // desta auditoria media errado (comparava um array cru de 9000 tuplas
  // contra o resultado JÁ cortado, concluindo erroneamente que o codec
  // "encolhe"). O que este teste prova, com números reais (não inventados):
  // (1) o codec de fato AUMENTA o tamanho (tupla->objeto + envelope
  // {entries}), numa magnitude mensurável e modesta; (2) nenhuma tentativa
  // é perdida na conversão; (3) — o ponto que realmente importa pro item 4
  // da auditoria — checkChunkSize(), dentro de writeShardedState, SEMPRE
  // roda sobre o payload {entries:...} JÁ codificado, nunca sobre o pedaço
  // cru, verificado estaticamente no código-fonte real (não só por
  // comportamento observado, que seria frágil de mais pra provar aqui).
  const d = makeDevice(makeFakeCloud());
  const eightTuples = Array.from({ length: 8 }, (_, i) => [1700000000000 + i, 1, 1]); // 8 = REVIEW_ATTEMPTS_MAX, no limite do fold (nenhuma é descartada)
  const withProgress = rev('R1', {
    structuralExecution: {
      executionId: 'exec_1', status: 'executed', type: 'merge_duplicates', at: 'now',
      affectedIds: ['seed_1'], operations: ['x'],
      beforeSnapshot: { lesions: {}, maps: { reviewProgress: { seed_1: { a: eightTuples } } } }
    }
  });
  const rawBytes = byteSize({ R1: withProgress });
  const encoded = d.context.structuralSnapshotProgressToFirestore({ R1: withProgress });
  const encodedBytes = byteSize({ entries: encoded });
  assert.ok(encodedBytes > rawBytes,
    'o codec (tuplas->objetos) + envelope {entries} realmente aumentam o tamanho, mesmo que modestamente (cru ' + rawBytes + ' vs codificado ' + encodedBytes + ')');
  assert.equal(encoded.R1.structuralExecution.beforeSnapshot.maps.reviewProgress.seed_1.a.length, 8,
    'nenhuma tentativa perdida na conversão (8 = REVIEW_ATTEMPTS_MAX, exatamente no limite do fold)');

  // Verificação ESTÁTICA do código real — o que de fato importa pro item 4:
  // checkChunkSize precisa receber lesionRevisionsShardDocs[i] (o envelope
  // {entries:...} já codificado), nunca o pedaço cru pré-codec.
  const src = writeShardedStateFn.source;
  assert.match(src, /lesionRevisionsShardsEncoded\s*=\s*lesionRevisionsShards\.map\(\s*s\s*=>\s*structuralSnapshotProgressToFirestore\(s\)\s*\)/,
    'os pedaços crus (lesionRevisionsShards) precisam ser codificados (lesionRevisionsShardsEncoded) antes de qualquer checagem/escrita');
  assert.match(src, /lesionRevisionsShardDocs\s*=\s*lesionRevisionsShardsEncoded\.map\(entries\s*=>\s*\(\{\s*entries\s*\}\)\)/,
    'lesionRevisionsShardDocs precisa ser o envelope {entries} derivado dos pedaços JÁ codificados');
  assert.match(src, /checkChunkSize\(\s*lesionRevisionsShardDocs\[i\]/,
    'checkChunkSize precisa rodar sobre lesionRevisionsShardDocs[i] (envelope já codificado) — nunca sobre lesionRevisionsShards[i] (pedaço cru)');
  assert.doesNotMatch(src, /checkChunkSize\(\s*lesionRevisionsShards\[i\]/,
    'checkChunkSize NUNCA pode rodar sobre o pedaço cru pré-codec');
});

test('O3. fronteiras de pedaço DIFERENTES entre dispositivos não interferem no merge — identidade é só por reviewId, sharding é só transporte', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  // A publica um estado GRANDE (vários pedaços, fronteiras calculadas por A).
  a.context.LESION_REVISIONS = buildHeavyLesionRevisions(30, 45 * 1024);
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const shardCountA = cloud.peekLesionRevisionsShardCount();
  assert.ok(shardCountA > 1);

  // B nunca viu esse estado; adiciona UMA revisão nova e publica — o
  // merge dentro da transação precisa reconstruir TUDO (pedaços de A) e
  // recalcular fronteiras do ZERO (nenhuma relação com as fronteiras de A).
  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  b.context.appStateReady = true;
  b.context.lastKnownCloudRevision = null;
  b.context.LESION_REVISIONS = { NEWB: rev('NEWB', { updatedAt: 9999999 }) };
  await b.context.saveLesionRevisions(); await b.context.pushToFirebaseNow();
  const shardCountAfterB = cloud.peekLesionRevisionsShardCount();

  const finalRevs = cloud.peekLesionRevisions();
  assert.equal(Object.keys(finalRevs).length, 31, '30 de A + 1 de B — nenhuma perdida, independente de quantos pedaços cada lado usou');
  assert.ok(finalRevs.NEWB, 'revisão de B presente');
  assert.ok(Object.keys(finalRevs).some((k) => k.startsWith('lrev_')), 'revisões de A presentes');
  // As fronteiras são recalculadas (determinístico por ID, não "herdadas" de A).
  const recomputed = a.context.splitLesionRevisionsIntoShards(finalRevs);
  assert.equal(recomputed.length, shardCountAfterB, 'contagem de pedaços é função só do CONTEÚDO final, nunca de qual device escreveu');
});

/* ---------- PROTEÇÃO 095 — risco residual DOCUMENTADO (rollout misto) ----------
 * Este teste não prova uma proteção — prova a AUSÊNCIA de uma. Registrado
 * de propósito (ver relatório da tarefa, item 7): um cliente ANTIGO (que
 * nunca soube de lesionRevisionsChunkCount) grava o documento principal via
 * .set() de SUBSTITUIÇÃO TOTAL. Se ele escrever depois da migração, o
 * resultado nunca inclui lesionRevisionsChunkCount (o código antigo não o
 * conhece) — o documento volta a parecer "formato legado" (campo ausente),
 * só que agora com o conteúdo EMBUTIDO sendo a visão LOCAL/incompleta do
 * cliente antigo, enquanto os pedaços recém-migrados ficam órfãos
 * (inacessíveis, não deletados). Isto NÃO é um bug introduzido pela 095:
 * é a MESMA exposição que qualquer campo novo já teve neste projeto
 * (tombstones/073, lesionMerges/091c, lesionTombstones/094 — todos também
 * desaparecem do documento se um cliente desatualizado fizer .set() depois
 * deles existirem) — o projeto nunca teve proteção em código contra isso;
 * mitigação é operacional (atualizar os dispositivos juntos no deploy).
 */
test('P. RISCO RESIDUAL (documentado, não corrigido): escrita de um cliente "antigo" (sem saber de lesionRevisionsChunkCount) depois da migração reverte o sinal de formato e orfaniza os pedaços', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { OLD1: rev('OLD1'), OLD2: rev('OLD2', { updatedAt: 2000 }) };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.ok(cloud.peekLesionRevisionsShardCount() >= 1, 'pré-condição: já migrado pro formato novo');

  // Simula o .set() de um cliente ANTIGO: substitui o meta por um objeto
  // SEM lesionRevisionsChunkCount, com lesionRevisions embutido contendo
  // só o que ESSE cliente antigo conhecia localmente (ex.: só OLD1 — nunca
  // viu OLD2, que só existe nos pedaços que ele não sabe ler).
  const currentMeta = cloud.peekMeta();
  const oldClientMeta = { ...currentMeta };
  delete oldClientMeta.lesionRevisionsChunkCount;
  oldClientMeta.lesionRevisions = { OLD1: rev('OLD1') }; // visão incompleta do cliente antigo
  cloud.setRaw('main', oldClientMeta);

  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await b.boot();
  // Resultado observado (risco real, sem proteção em código):
  assert.deepEqual(Object.keys(b.context.LESION_REVISIONS), ['OLD1'],
    'RISCO: um cliente novo que leia depois do cliente antigo só vê a visão incompleta dele — OLD2 (só nos pedaços) fica invisível');
  assert.equal('lesionRevisionsChunkCount' in cloud.peekMeta(), false, 'sinal de formato revertido pro legado pelo cliente antigo');
});

test('O4. cenário real de 3 dispositivos (auditoria item 6): nuvem=A∪B, PC desatualizado conhece A∪C e publica -> A∪B∪C; um 2º PC lê tudo, nenhuma fronteira de pedaço interfere', async () => {
  const cloud = makeFakeCloud();
  // Conjuntos pesados e DISJUNTOS (vários pedaços cada, prefixos próprios —
  // nada de colisão de id entre A/B/C).
  const heavySet = (prefix, count, approxBytesEach) => {
    const out = {};
    for (let i = 0; i < count; i++) {
      const id = prefix + '_' + String(i).padStart(4, '0');
      out[id] = heavyRev(id, approxBytesEach);
    }
    return out;
  };
  const setA = heavySet('A', 12, 46 * 1024);
  const setB = heavySet('B', 12, 46 * 1024);
  const setC = heavySet('C', 12, 46 * 1024);

  // PC1 publica A, depois B (chega a nuvem = A∪B, com as fronteiras de
  // pedaço calculadas por ELE, sobre A∪B).
  const pc1 = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await pc1.boot();
  pc1.context.LESION_REVISIONS = setA;
  await pc1.context.saveLesionRevisions(); await pc1.context.pushToFirebaseNow();
  pc1.context.LESION_REVISIONS = { ...setA, ...setB };
  await pc1.context.saveLesionRevisions(); await pc1.context.pushToFirebaseNow();
  const shardCountAB = cloud.peekLesionRevisionsShardCount();
  assert.ok(shardCountAB > 1, 'pré-condição: A∪B já ocupa vários pedaços');
  assert.deepEqual(Object.keys(cloud.peekLesionRevisions()).sort(), [...Object.keys(setA), ...Object.keys(setB)].sort());

  // PC "desatualizado" (stale): nunca viu B — seu estado local é A∪C
  // (A antigo que ele já tinha + C, que ele acabou de criar). Ao publicar,
  // o merge dentro da transação funde A∪C (local) com A∪B (remoto real,
  // relido na hora) -> A∪B∪C, com fronteiras de pedaço recalculadas DO
  // ZERO (nenhuma relação com as fronteiras que PC1 usou).
  const stale = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  stale.context.appStateReady = true;
  stale.context.lastKnownCloudRevision = null; // nunca leu esta nuvem nesta sessão
  stale.context.LESION_REVISIONS = { ...setA, ...setC };
  await stale.context.saveLesionRevisions(); await stale.context.pushToFirebaseNow();
  const shardCountABC = cloud.peekLesionRevisionsShardCount();
  assert.ok(shardCountABC >= shardCountAB, 'A∪B∪C não cabe em menos pedaços que A∪B');

  const finalRemote = cloud.peekLesionRevisions();
  const expectedIds = [...Object.keys(setA), ...Object.keys(setB), ...Object.keys(setC)].sort();
  assert.deepEqual(Object.keys(finalRemote).sort(), expectedIds,
    'A∪B∪C completo na nuvem — nenhuma revisão perdida, independente de quantos pedaços PC1 usou antes');

  // Um 2º PC, que nunca viu nada disso, lê do zero: precisa reconstruir
  // A∪B∪C por completo, decodificando corretamente o progresso embutido
  // (quando houver) em TODOS os pedaços, com fronteiras que não têm
  // nenhuma relação com as de PC1 nem com as do PC desatualizado — a
  // identidade de cada revisão é só o reviewId; sharding é só transporte.
  const pc2 = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await pc2.boot();
  assert.deepEqual(Object.keys(pc2.context.LESION_REVISIONS).sort(), expectedIds,
    '2º PC vê A∪B∪C completo, byte a byte, sem nenhuma perda por causa de fronteiras de pedaço diferentes entre os três dispositivos');
  for (const id of expectedIds) {
    assert.deepEqual(plain(pc2.context.LESION_REVISIONS[id]), plain({ ...setA, ...setB, ...setC }[id]),
      'conteúdo de ' + id + ' idêntico ao originalmente escrito, sem corrupção por re-empacotamento');
  }
});

/* ===========================================================================
 * PROTEÇÃO 095B — barreira de versão de schema do documento principal.
 *
 * v4 = PRÉ-095 (LESION_REVISIONS embutido). v5 = PÓS-095 (pedaços próprios +
 * lesionRevisionsChunkCount). Defesa em DUAS camadas, testadas em separado:
 *
 * 1) CÓDIGO (testável aqui com as funções reais): writeShardedState() nunca
 *    escreve por cima de um documento cujo stateSchemaVersion remoto já é
 *    MAIOR que STATE_SCHEMA_VERSION=5 — ver guard logo após a checagem de
 *    revisão, dentro da transação, ANTES de qualquer tx.set().
 * 2) REGRA DO FIRESTORE (servidor — NÃO testável aqui sem um emulador real
 *    do Firestore, que este projeto não usa/não tem configurado): bloqueia
 *    um cliente < 5 de gravar atlas_state/main. O teste "3" abaixo não
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
  return typeof v === 'number' && Number.isInteger(v) && v >= 5;
}

test('095B.1 — main v4 existente (sem stateSchemaVersion, campo legado): cliente v5 lê e migra', async () => {
  const cloud = makeFakeCloud();
  const legacyMain = {
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {},
    tombstones: {}, lesionRevisions: { OLD1: rev('OLD1') }, lesionMerges: {}, lesionTombstones: {},
    chunkCount: 0, stateSchemaVersion: 4, revision: 1
  };
  cloud.setRaw('main', legacyMain);
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS), ['OLD1'], 'leitura v4 (legado) funciona antes da migração');

  a.context.LESION_REVISIONS = { ...a.context.LESION_REVISIONS, NEW1: rev('NEW1', { updatedAt: 9999 }) };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const meta = cloud.peekMeta();
  assert.equal(meta.stateSchemaVersion, 5, 'a PRÓXIMA escrita bem-sucedida migra pra v5');
  assert.ok(cloud.peekLesionRevisionsShardCount() >= 1, 'LESION_REVISIONS já em pedaços após a migração');
  assert.equal('lesionRevisions' in meta, false, 'campo legado não sobrevive à migração');
  assert.deepEqual(Object.keys(cloud.peekLesionRevisions()).sort(), ['NEW1', 'OLD1'], 'nenhuma revisão perdida na migração');
});

test('095B.2 — cliente v5 grava main v5 + pedaços de revisão, do zero (sem documento prévio)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const meta = cloud.peekMeta();
  assert.equal(meta.stateSchemaVersion, 5);
  assert.equal(typeof meta.lesionRevisionsChunkCount, 'number');
  assert.ok(meta.lesionRevisionsChunkCount >= 1);
  assert.equal('lesionRevisions' in meta, false);
});

test('095B.3 — regra proposta (espelho JS, não é o Firestore real): aceita só stateSchemaVersion inteiro >=5, recusa v4/ausente/não-numérico', () => {
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 5 }), true, 'v5 aceito');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 6 }), true, 'v6 futuro aceito (>=5)');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 4 }), false, 'v4 (cliente antigo) RECUSADO');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 0 }), false, 'v0 RECUSADO');
  assert.equal(mainWriteRuleAllows({}), false, 'campo ausente RECUSADO (trata como pré-histórico/desconhecido)');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: '5' }), false, 'string "5" RECUSADO (precisa ser number, não bypassa por coerção)');
  assert.equal(mainWriteRuleAllows({ stateSchemaVersion: 5.5 }), false, 'não-inteiro RECUSADO');
});

test('095B.4 — remoto já num schema FUTURO (>5): writeShardedState recusa escrever, transação inteira aborta, nada publicado', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const metaBefore = cloud.peekMeta();
  assert.equal(metaBefore.stateSchemaVersion, 5);

  // Simula outro dispositivo, já numa versão futura do Atlas (v6
  // hipotético), tendo escrito depois deste device.
  cloud.setRaw('main', { ...metaBefore, stateSchemaVersion: 6, [a.context.CLOUD_REVISION_FIELD]: metaBefore.revision });
  const snapshotBefore = cloud.snapshotStore();

  a.context.LESION_REVISIONS = { ...a.context.LESION_REVISIONS, R2: rev('R2') };
  await a.context.saveLesionRevisions();
  const ok = await a.context.writeShardedState(5000);
  assert.equal(ok, false, 'escrita recusada');
  assert.equal(a.context.lastWriteRefusedReason, 'schema_version_too_new');
  // Atomicidade: nada mudou na nuvem (nem main, nem nenhum pedaço).
  const snapshotAfter = cloud.snapshotStore();
  assert.deepEqual(Array.from(snapshotAfter.entries()), Array.from(snapshotBefore.entries()),
    'transação abortada por completo — nenhuma escrita parcial, nada sobrescrito');
});

test('095B.5 — cliente v5 continua sincronizando normalmente (push e pull) com o novo campo presente', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, false, 'push normal continua funcionando');

  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await b.boot();
  assert.deepEqual(Object.keys(b.context.LESION_REVISIONS), ['R1'], 'pull normal continua funcionando');
  assert.equal(cloud.peekMeta().stateSchemaVersion, 5);
});

test('095B.6 — schemaVersion >5 é recusado pelo cliente v5 para escrita (limite exato: 5 aceito, 6 recusado)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const meta5 = cloud.peekMeta();
  assert.equal(meta5.stateSchemaVersion, 5);

  // No limite: remoto exatamente em 5 (o que este cliente entende) — escreve normalmente.
  a.context.LESION_REVISIONS = { ...a.context.LESION_REVISIONS, R2: rev('R2') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, false, 'schema==5 (igual ao que este cliente entende) é aceito');

  // Acima do limite: remoto em 6 (futuro) — recusa.
  const metaNow = cloud.peekMeta();
  cloud.setRaw('main', { ...metaNow, stateSchemaVersion: 6 });
  a.context.LESION_REVISIONS = { ...a.context.LESION_REVISIONS, R3: rev('R3') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncPushPending, true, 'schema==6 (futuro) é recusado');
  assert.equal(a.context.lastWriteRefusedReason, 'schema_version_too_new');
});

test('095B.7 — leitura legada v4 (sem stateSchemaVersion/lesionRevisionsChunkCount) continua funcionando ANTES de qualquer migração', async () => {
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
 * o schema remoto é maior que STATE_SCHEMA_VERSION.
 * ===========================================================================
 */

test('095C.1A — schema remoto v6 (futuro): leitura recusada SEM alterar DATA/REVIEW/LESION_REVISIONS locais', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const dataBefore = plain(a.context.DATA);
  const reviewBefore = plain(a.context.REVIEW);
  const revisionsBefore = plain(a.context.LESION_REVISIONS);

  // Outro dispositivo, numa versão futura hipotética (v6), já escreveu.
  const metaNow = cloud.peekMeta();
  cloud.setRaw('main', { ...metaNow, stateSchemaVersion: 6 });

  await a.context.syncFromFirebase(); // pull real — não deve adotar nada
  assert.deepEqual(plain(a.context.DATA), dataBefore, 'DATA local intocado');
  assert.deepEqual(plain(a.context.REVIEW), reviewBefore, 'REVIEW local intocado');
  assert.deepEqual(plain(a.context.LESION_REVISIONS), revisionsBefore, 'LESION_REVISIONS local intocado');
  const msgs = a.calls.statusMessages.filter((m) => !m.ok);
  assert.ok(msgs.length > 0, 'algum aviso de falha foi mostrado');
  assert.match(msgs[msgs.length - 1].detail || '', /atualiz/i, 'mensagem clara de que o Atlas precisa ser atualizado');
});

test('095C.1B — schema remoto v6 (futuro): nenhum write subsequente automático (push recusado, nada publicado)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();

  const metaNow = cloud.peekMeta();
  cloud.setRaw('main', { ...metaNow, stateSchemaVersion: 6 });
  const snapshotBefore = cloud.snapshotStore();

  a.context.LESION_REVISIONS = { ...a.context.LESION_REVISIONS, R2: rev('R2') };
  await a.context.saveLesionRevisions(); // marca dirty + agenda push
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

test('095C.1D — leitura de main v5 (pedaços) continua funcionando', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1') };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  assert.equal(cloud.peekMeta().stateSchemaVersion, 5);

  const b = makeDevice(cloud, { initialCatalog: [lesion('seed_1')] });
  const remote = await b.context.readShardedState(5000);
  assert.deepEqual(Object.keys(remote.lesionRevisions), ['R1'], 'v5 (pedaços) lido normalmente, sem lançar nada');
});

/* ===========================================================================
 * PROTEÇÃO 095C (item 2) — restoreCanonicalStateToCloud() compatível com o
 * schema v5. O formato canônico original (ATLAS_CANONICO_LIMPO_1216_116_
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

test('095C.2E — restore canônico v5 PRESERVA LESION_REVISIONS já existente na nuvem (payload não traz o campo)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  a.context.LESION_REVISIONS = { R1: rev('R1'), R2: rev('R2', { updatedAt: 2000 }) };
  await a.context.saveLesionRevisions(); await a.context.pushToFirebaseNow();
  const revisionsBefore = plain(cloud.peekLesionRevisions());
  assert.deepEqual(Object.keys(revisionsBefore).sort(), ['R1', 'R2']);

  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true, 'restore precisa ter sucesso: ' + JSON.stringify(result));
  assert.deepEqual(plain(cloud.peekLesionRevisions()), revisionsBefore, 'LESION_REVISIONS preservado intacto — restore nem sabia que existia');
  assert.equal(cloud.peekMeta().stateSchemaVersion, 5);
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

test('095C.2I — regra proposta (espelho JS) aceita o documento que o restore v5 publica', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: cloud.peekRevision(), expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true);
  assert.equal(mainWriteRuleAllows(cloud.peekMeta()), true, 'documento escrito pelo restore passa na regra proposta (stateSchemaVersion inteiro >=5)');
});

test('095C.2J — restore NUNCA escreve stateSchemaVersion 4 (nem em nuvem vazia, primeira escrita)', async () => {
  const cloud = makeFakeCloud();
  const a = makeDevice(cloud, { initialCatalog: [] });
  await a.boot();
  assert.equal(cloud.peekMeta(), null, 'pré-condição: nuvem vazia');
  const result = await a.context.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), {
    expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED_095C
  });
  assert.equal(result.ok, true);
  assert.notEqual(cloud.peekMeta().stateSchemaVersion, 4);
  assert.equal(cloud.peekMeta().stateSchemaVersion, 5);
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
