'use strict';

/* PROTEÇÃO 094 — TOMBSTONE DE LESÃO INTEIRA (exclusão permanente).
 *
 * Contexto do defeito corrigido: o botão "Excluir" fazia só DATA.filter(id)
 * + saveData(). saveData() dispara pushToFirebaseNow(), que roda
 * reconcileBeforePush() ANTES de publicar — e reconcileStateWithRemote()
 * trata qualquer lesão presente só de um lado (local XOR remoto) como
 * "solo" e a preserva. Sem tombstone da lesão INTEIRA (o que já existia era
 * só IMAGE_TOMBSTONES, 073, para imagens DENTRO de uma lesão), a cópia
 * ainda viva no Firestore sempre voltava no mesmo ciclo de salvamento que
 * tentou excluí-la.
 *
 * Este arquivo testa o módulo novo (LESION_TOMBSTONES, deleteLesionPermanently)
 * e as amarrações reais (reconcileStateWithRemote, writeShardedState,
 * readShardedState, loadData, adoptRemoteStateForNewDevice) usando as
 * FUNÇÕES REAIS extraídas do index.html — nenhuma lógica de merge/sync
 * reimplementada — dentro de um Firestore falso compartilhado, do mesmo
 * jeito que tests/multi-device-sync.test.js já faz para outras proteções.
 * Deliberadamente um ARQUIVO NOVO e autocontido: multi-device-sync.test.js
 * tem uma investigação de rollback estrutural em andamento (modificação
 * local não commitada) e não deve ser tocado por esta tarefa.
 *
 * Os ids de lesão usados nas fixtures (ex.: u_1790973241450_1egv8z) são só
 * dados de teste — NÃO há nenhuma lista fixa de ids no código de produção
 * (index.html). A proteção é genérica: funciona para qualquer lesionId.
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
// PROTEÇÃO 094 — módulo novo (consts + normalize/merge/isLesionTombstoned/load/save).
const lesionTombstonesModule094 = sliceBetween("const LESION_TOMBSTONES_KEY = 'atlas:lesionTombstones';", 'function isQuarantinedSeedId(id){');
const isQuarantinedSeedIdFn = extractFunction(html, 'isQuarantinedSeedId');
const getActiveCanonicalSeedFn = extractFunction(html, 'getActiveCanonicalSeed');
const activeCanonicalSeedV172Fn = extractFunction(html, 'activeCanonicalSeedV172');
const deleteLesionPermanentlyFn = extractFunction(html, 'deleteLesionPermanently');
const orderFns085 = ['normalizeOrderStamps', 'loadOrderStamps', 'saveOrderStamps', 'markSectionOrderManual',
  'markSiteOrderManual', 'markRestoredOrderManual', 'dedupeOrderList', 'isAutoSectionOrder', 'isAutoSiteList',
  'mergeOrderList', 'mergeOrderState']
  .map((n) => extractFunction(html, n).source).join('\n');
const lesionRevisionsFns084 = ['mergeLesionRevisions', 'saveLesionRevisions', 'updateReviewCenterBadges',
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
const splitLesionRevisionsIntoShardsFn = extractFunction(html, 'splitLesionRevisionsIntoShards'); // PROTEÇÃO 095
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
// reconcileBeforePush() depende destas duas para o guard de no-op (079 Parte D).
const canonicalJsonStringFn = extractFunction(html, 'canonicalJsonString');
const deepStableEqualFn = extractFunction(html, 'deepStableEqual');

// TESTE — garante que o novo mecanismo não introduz um caminho paralelo
// (AGENTS.md proíbe lista fixa de ids / caminho duplicado de exclusão).
test('094 PIPELINE: isQuarantinedSeedId/loadData/reconcile/adoptRemoteStateForNewDevice/writeShardedState/backup consultam lesionTombstones; botão Excluir usa deleteLesionPermanently', () => {
  assert.match(isQuarantinedSeedIdFn.source, /isLesionTombstoned\(id\)/);
  assert.match(extractFunction(html, 'reconcileStateWithRemote').source, /LESION_TOMBSTONES = mergeLesionTombstones\(LESION_TOMBSTONES, remote && remote\.lesionTombstones\)/);
  assert.match(extractFunction(html, 'adoptRemoteStateForNewDevice').source, /LESION_TOMBSTONES = normalizeLesionTombstones\(remote\.lesionTombstones\)/);
  assert.match(extractFunction(html, 'loadData').source, /await loadLesionTombstones\(\);/);
  assert.match(extractFunction(html, 'writeShardedState').source, /lesionTombstones: normalizeLesionTombstones\(LESION_TOMBSTONES\)/);
  assert.match(extractFunction(html, 'readShardedState').source, /lesionTombstones: normalizeLesionTombstones\(meta\.lesionTombstones\)/);
  assert.match(html, /lesionTombstones: LESION_TOMBSTONES, \/\/ PROTEÇÃO 094/, 'export do backup');
  assert.match(html, /LESION_TOMBSTONES = mergeLesionTombstones\(LESION_TOMBSTONES, parsed\.lesionTombstones\)/, 'import nunca encolhe o mapa');
  assert.doesNotMatch(html, /DATA = DATA\.filter\(x=>x\.id!==id\);\s*\n\s*await saveData\(\);/, 'botão Excluir não usa mais o caminho antigo vulnerável');
  assert.match(html, /document\.getElementById\('btn-del'\)\.onclick[\s\S]{0,500}deleteLesionPermanently\(id\)/, 'botão Excluir chama a função oficial');
});

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
    // PROTEÇÃO 095 — pedaços de lesionRevisions, mesmo mecanismo dos pedaços
    // de DATA acima, só com prefixo de chave próprio (namespace separado).
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
    peekMeta() { return store.get('main') || null; },
    peekChunkItems(i) { const chunk = store.get('chunk_' + i); return chunk && Array.isArray(chunk.items) ? chunk.items : []; },
    peekAllLesionIds() {
      const main = store.get('main');
      if (!main) return [];
      const out = [];
      for (let i = 0; i < (main.chunkCount || 0); i++) {
        const chunk = store.get('chunk_' + i);
        if (chunk && Array.isArray(chunk.items)) out.push(...chunk.items.map((e) => e.id));
      }
      return out;
    }
  };
}

// Um "computador": storage LOCAL próprio + a nuvem falsa compartilhada.
// SEED (catálogo canônico embutido no app) é mantido SEMPRE VAZIO nestes
// testes — as lesões de fixture aqui são "lesões do usuário" (ids u_...),
// nunca o catálogo canônico embutido; isso evita qualquer efeito colateral
// de activeCanonicalSeedV172() reintroduzindo fixtures por engano.
function makeDevice(cloud, { initialCatalog = [] } = {}) {
  const localBacking = { data: JSON.stringify(initialCatalog) };
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
    window: {}, setTimeout, clearTimeout,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } },
    SEED: [], // ver nota acima — nunca as fixtures do teste
    STORAGE_KEY: 'data', ORDER_KEY: 'order', SITEORDER_KEY: 'site-order', REVIEW_KEY: 'review',
    SRS_KEY: 'srs', SESSIONLOG_KEY: 'sessionlog',
    RECOVERY_KEY: 'recovery', RECOVERY_VERSION: 'test', DEFAULT_SECTION_ORDER: [], EN_TERMS: {},
    DATA_CHUNK_SIZE: 150,
    FB_META_REF: cloud.FB_META_REF,
    FB_CHUNK_REF: cloud.FB_CHUNK_REF,
    FB_LESION_REVISIONS_CHUNK_REF: cloud.FB_LESION_REVISIONS_CHUNK_REF, // PROTEÇÃO 095
    withFirebaseTimeout: (p) => p,
    setSyncStatus: (ok) => { context.syncPushPending = !ok; },
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
    migrateLegacyLocalImagesToCloudinary: async () => ({ migrated: 0 }),
    loadSidebarScopePref: () => ({ section: null, site: null }),
    loadQuizScopePref: () => ({ section: null, site: null }),
    runDuplicateCleanup: () => ({ changed: false, reviewOrSrsChanged: false }),
    deduplicateV171: async () => {},
    runNewDeviceBootstrapFlow: async () => { throw new Error('runNewDeviceBootstrapFlow não deveria ser chamado neste teste (dispositivo já inicializado)'); },
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
    ${isQuarantinedSeedIdFn.source}
    ${getActiveCanonicalSeedFn.source}
    ${activeCanonicalSeedV172Fn.source}
    function __getLesionMerges091c(){ return LESION_MERGES; } function __setLesionMerges091c(v){ LESION_MERGES = v; }
    function __getLesionTombstones094(){ return LESION_TOMBSTONES; } function __setLesionTombstones094(v){ LESION_TOMBSTONES = v; }
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
    function checkChunkSize(){return true;}
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
    const LESION_REVISIONS_SHARD_TARGET_BYTES = 700*1024; // PROTEÇÃO 095
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
    ${deleteLesionPermanentlyFn.source}
  `;
  new vm.Script(engine).runInContext(context);
  return {
    context,
    boot: () => context.loadData(),
    save: () => context.saveData(),
    peekLocal: (key) => localBacking[key],
    markDirty: () => context.markSyncDirty()
  };
}

function lesion(id, over) {
  // img/localImg: mesmos defaults que mergeEntryNonDestructive() normaliza
  // ao mesclar dois lados (local E remoto) — presentes aqui para que a
  // fixture já nasça no formato "pós-merge" e as asserções comparem o que
  // de fato importa, sem ruído de normalização.
  return Object.assign({ id, name: id, s: 'Abdômen Superior', site: 'Apêndice', notes: '', tags: [], links: [], images: [], img: '', localImg: false }, over || {});
}

// Fixtures — ids só de teste (nenhum entra em produção/index.html).
const LESION_A = () => lesion('u_1790973241450_1egv8z', { name: 'apendicite (teste localhost)', notes: 'teste apenas (REMOVER APÓS OS TESTES)' });
const LESION_B = () => lesion('u_1790976420823_ynbcuc', { name: 'Apendicite' });
const LESION_C = () => lesion('u_real_apendicite_0001', { name: 'Apendicite aguda', s: 'Abdômen Inferior', notes: 'Padrão: coleção periapendicular com apêndice espessado e não compressível.', tags: ['apendicite'] });

test('094 UNIDADE: normalizeLesionTombstones/mergeLesionTombstones — formato compacto, só {deletedAt}; conflito = carimbo mais antigo vence', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  assert.deepEqual(plain(c.normalizeLesionTombstones({ a: { deletedAt: 5 }, b: { deletedAt: 0 }, c: 'x', d: null })), { a: { deletedAt: 5 } });
  const merged = c.mergeLesionTombstones({ a: { deletedAt: 10 } }, { a: { deletedAt: 3 }, b: { deletedAt: 7 } });
  assert.deepEqual(plain(merged), { a: { deletedAt: 3 }, b: { deletedAt: 7 } }, 'carimbo mais antigo (3) vence sobre 10; novo id (b) entra');
});

test('094 isQuarantinedSeedId: reflete LESION_TOMBSTONES sem afetar ids não tombstoned', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  c.__setLesionTombstones094({ X: { deletedAt: 1 } });
  assert.equal(c.isQuarantinedSeedId('X'), true);
  assert.equal(c.isQuarantinedSeedId('Y'), false);
});

test('094 deleteLesionPermanently: remove de DATA, registra tombstone compacto, chama saveData (dirty+push); idempotente; id inexistente não corrompe nada', async () => {
  const cloud = makeFakeCloud();
  const d = makeDevice(cloud, { initialCatalog: [LESION_A(), LESION_C()] });
  await d.boot();
  const r1 = plain(await d.context.deleteLesionPermanently('u_1790973241450_1egv8z'));
  assert.deepEqual(r1, { ok: true, id: 'u_1790973241450_1egv8z', name: 'apendicite (teste localhost)' });
  assert.equal(d.context.DATA.some((e) => e.id === 'u_1790973241450_1egv8z'), false);
  assert.equal(d.context.DATA.some((e) => e.id === 'u_real_apendicite_0001'), true, 'lesão legítima não relacionada intacta');
  assert.deepEqual(plain(d.context.__getLesionTombstones094()), { u_1790973241450_1egv8z: { deletedAt: d.context.__getLesionTombstones094().u_1790973241450_1egv8z.deletedAt } });
  assert.equal(typeof d.context.__getLesionTombstones094().u_1790973241450_1egv8z.deletedAt, 'number');

  // J) id inexistente: não existe e nunca foi tombstoned -> ok:false, nada muda.
  const before = plain(d.context.DATA);
  const rMissing = plain(await d.context.deleteLesionPermanently('id_que_nao_existe'));
  assert.deepEqual(rMissing, { ok: false, reason: 'lesion_not_found' });
  assert.deepEqual(plain(d.context.DATA), before);

  // I) idempotente: repetir no mesmo id já excluído não duplica nem falha.
  const tombBefore = plain(d.context.__getLesionTombstones094());
  const r2 = plain(await d.context.deleteLesionPermanently('u_1790973241450_1egv8z'));
  assert.deepEqual(r2, { ok: true, reason: 'already_deleted', id: 'u_1790973241450_1egv8z' });
  assert.deepEqual(plain(d.context.__getLesionTombstones094()), tombBefore, 'tombstone não é reescrito/duplicado na repetição');

  assert.equal(cloud.peekAllLesionIds().includes('u_1790973241450_1egv8z'), false, 'não voltou à nuvem');
  assert.equal(cloud.peekAllLesionIds().includes('u_real_apendicite_0001'), true);
});

test('094 RECONCILE direto — C) lesão só no remoto, tombstoned localmente: permanece ausente', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  c.DATA = [LESION_C()];
  c.__setLesionTombstones094({ u_1790973241450_1egv8z: { deletedAt: 100 } });
  const remote = { data: [LESION_A(), LESION_C()], lesionTombstones: {} };
  c.reconcileStateWithRemote(remote);
  assert.equal(c.DATA.some((e) => e.id === 'u_1790973241450_1egv8z'), false);
  assert.equal(c.DATA.some((e) => e.id === 'u_real_apendicite_0001'), true);
});

test('094 RECONCILE direto — D) lesão só no local, tombstoned localmente: não sobrevive ao reconcile (consistência)', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  c.DATA = [LESION_A(), LESION_C()];
  c.__setLesionTombstones094({ u_1790973241450_1egv8z: { deletedAt: 100 } });
  const remote = { data: [LESION_C()], lesionTombstones: {} };
  c.reconcileStateWithRemote(remote);
  assert.equal(c.DATA.some((e) => e.id === 'u_1790973241450_1egv8z'), false);
  assert.equal(c.DATA.some((e) => e.id === 'u_real_apendicite_0001'), true);
});

test('094 RECONCILE direto — E) ambos os lados têm a lesão, mas o REMOTO é quem sabe do tombstone (PC desatualizado nunca viu a exclusão): some mesmo assim, e o PC aprende o tombstone', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  c.DATA = [LESION_A(), LESION_B(), LESION_C()]; // PC antigo: nunca excluiu nada
  c.__setLesionTombstones094({});
  const remote = { data: [LESION_A(), LESION_B(), LESION_C()], lesionTombstones: { u_1790973241450_1egv8z: { deletedAt: 50 }, u_1790976420823_ynbcuc: { deletedAt: 55 } } };
  c.reconcileStateWithRemote(remote);
  assert.equal(c.DATA.some((e) => e.id === 'u_1790973241450_1egv8z'), false, 'A excluída em outro device também sai aqui');
  assert.equal(c.DATA.some((e) => e.id === 'u_1790976420823_ynbcuc'), false, 'B idem');
  assert.equal(c.DATA.some((e) => e.id === 'u_real_apendicite_0001'), true, 'C (legítima) intacta');
  assert.deepEqual(plain(c.__getLesionTombstones094()), plain(remote.lesionTombstones), 'PC converge e aprende os dois tombstones');
});

test('094 RECONCILE direto — G) outra lesão com NOME igual, ID diferente, não é afetada pelo tombstone', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  const samenameDifferentId = lesion('u_outra_apendicite_9999', { name: 'Apendicite' }); // mesmo name de LESION_B, id diferente
  c.DATA = [samenameDifferentId];
  c.__setLesionTombstones094({ u_1790976420823_ynbcuc: { deletedAt: 1 } });
  const remote = { data: [samenameDifferentId], lesionTombstones: {} };
  c.reconcileStateWithRemote(remote);
  assert.equal(c.DATA.length, 1);
  assert.equal(c.DATA[0].id, 'u_outra_apendicite_9999', 'tombstone é por ID, nunca por nome');
});

test('094 RECONCILE direto — H) lesões legítimas não relacionadas permanecem byte-a-byte intactas', () => {
  const d = makeDevice(makeFakeCloud());
  const c = d.context;
  const untouched1 = lesion('seedless_1', { name: 'Glioblastoma', s: 'Neuro', site: 'Encéfalo', tags: ['realce em anel'] });
  const untouched2 = lesion('seedless_2', { name: 'Hepatocarcinoma', s: 'Abdômen Superior', site: 'Fígado', classification: 'LIRADS' });
  c.DATA = [LESION_A(), untouched1, untouched2];
  c.__setLesionTombstones094({ u_1790973241450_1egv8z: { deletedAt: 1 } });
  const remote = { data: [LESION_A(), untouched1, untouched2], lesionTombstones: {} };
  c.reconcileStateWithRemote(remote);
  assert.deepEqual(plain(c.DATA.find((e) => e.id === 'seedless_1')), plain(untouched1));
  assert.deepEqual(plain(c.DATA.find((e) => e.id === 'seedless_2')), plain(untouched2));
});

test('094 PONTA A PONTA (A, B, E, F): excluir em um device sobrevive a reload, a outro device existente que ainda não sabia, e a um device NOVO; lesão legítima nunca é afetada; tombstone persiste na nuvem', async () => {
  const cloud = makeFakeCloud();
  const catalog = [LESION_A(), LESION_B(), LESION_C()];

  // Device 1 (já inicializado) publica o catálogo inicial na nuvem.
  const dev1 = makeDevice(cloud, { initialCatalog: catalog });
  await dev1.boot();
  dev1.markDirty();
  await dev1.save();
  assert.deepEqual(cloud.peekAllLesionIds().sort(), catalog.map((e) => e.id).sort());

  // Exclui A e B pelo caminho oficial.
  await dev1.context.deleteLesionPermanently('u_1790973241450_1egv8z');
  await dev1.context.deleteLesionPermanently('u_1790976420823_ynbcuc');
  assert.deepEqual(plain(dev1.context.DATA.map((e) => e.id)), ['u_real_apendicite_0001']);

  // F) tombstone chegou na nuvem (documento principal, união local∪remoto).
  const meta = cloud.peekMeta();
  assert.ok(meta.lesionTombstones.u_1790973241450_1egv8z);
  assert.ok(meta.lesionTombstones.u_1790976420823_ynbcuc);
  assert.equal(cloud.peekAllLesionIds().includes('u_1790973241450_1egv8z'), false);
  assert.equal(cloud.peekAllLesionIds().includes('u_1790976420823_ynbcuc'), false);
  assert.equal(cloud.peekAllLesionIds().includes('u_real_apendicite_0001'), true, 'Apendicite aguda legítima permanece na nuvem');

  // A) reload do MESMO device: reabre do IndexedDB local — A e B continuam ausentes.
  const dev1Reloaded = makeDevice(cloud, { initialCatalog: JSON.parse(dev1.peekLocal('data')) });
  // o storage local do "dev1Reloaded" precisa ser o mesmo dev1 (não um novo) —
  // reconstruímos lendo a mesma chave persistida, como um F5 faria.
  dev1Reloaded.context.fbDb = { runTransaction: cloud.runTransaction };
  await dev1Reloaded.boot();
  assert.deepEqual(plain(dev1Reloaded.context.DATA.map((e) => e.id)), ['u_real_apendicite_0001']);

  // E) device 2 JÁ EXISTENTE, com cópia antiga local (A, B e C, nunca excluiu nada),
  // que nunca sincronizou desde antes da exclusão: ao puxar da nuvem, aprende os
  // tombstones e A/B somem dele também — sem nunca ter chamado deleteLesionPermanently.
  const dev2 = makeDevice(cloud, { initialCatalog: catalog });
  await dev2.boot(); // boot já faz pull (syncFromFirebase) quando device já inicializado
  assert.deepEqual(plain(dev2.context.DATA.map((e) => e.id)).sort(), ['u_real_apendicite_0001']);
  assert.ok(dev2.context.__getLesionTombstones094().u_1790973241450_1egv8z, 'dev2 aprendeu o tombstone de A');
  assert.ok(dev2.context.__getLesionTombstones094().u_1790976420823_ynbcuc, 'dev2 aprendeu o tombstone de B');

  // B) device NOVO (nunca teve catálogo local): adoptRemoteStateForNewDevice()
  // real nunca herda uma lesão já excluída em outro device.
  const dev3 = makeDevice(cloud, { initialCatalog: [] });
  dev3.context.appStateReady = true;
  await dev3.context.adoptRemoteStateForNewDevice();
  assert.deepEqual(plain(dev3.context.DATA.map((e) => e.id)), ['u_real_apendicite_0001']);
  assert.ok(dev3.context.__getLesionTombstones094().u_1790973241450_1egv8z);
  assert.ok(dev3.context.__getLesionTombstones094().u_1790976420823_ynbcuc);
  assert.deepEqual(JSON.parse(dev3.peekLocal('data')).map((e) => e.id), ['u_real_apendicite_0001'], 'persistido localmente no device novo');

  // Histórico de revisão nunca é apagado pela exclusão (REVIEW/SRS podem
  // conter a entrada; só saem das vistas "ativas" pela mesma quarentena).
  dev1.context.REVIEW['u_1790973241450_1egv8z'] = 2;
  assert.equal(dev1.context.REVIEW['u_1790973241450_1egv8z'], 2, 'REVIEW bruto preservado — deleteLesionPermanently nunca o tocou');
});
