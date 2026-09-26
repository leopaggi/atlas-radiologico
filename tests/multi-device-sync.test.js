'use strict';

/* Testes de SINCRONIZAÇÃO MULTI-DISPOSITIVO REAL (ALTERAÇÃO 068, 2026-09-23).
 *
 * Contexto do defeito corrigido: um dispositivo JÁ inicializado (catálogo
 * local existente no IndexedDB, de uma abertura de semanas atrás) nunca
 * consultava a nuvem de novo no boot — só EMPURRAVA o que tinha localmente
 * (pushToFirebaseNow() roda incondicionalmente no fim de loadData() e a cada
 * saveData()). Como writeShardedState() faz .set() (substituição total, não
 * merge), um PC com IndexedDB desatualizado — o computador do hospital —
 * ficava mostrando só uma fração das imagens, e o próprio boot (sem o
 * usuário editar nada) já sobrescrevia no Firestore qualquer imagem/lesão
 * que só existisse na nuvem.
 *
 * Estes testes simulam DOIS "computadores" com armazenamento LOCAL separado
 * (cada um seu próprio objeto `storage`, como dois IndexedDB de origens
 * diferentes) compartilhando uma ÚNICA nuvem falsa (um Firestore em memória),
 * e rodam o loadData()/syncFromFirebase()/writeShardedState()/
 * readShardedState() REAIS extraídos do index.html — as mesmas funções que
 * o app usa de verdade — dentro de um `vm` isolado. Nenhum teste acessa
 * IndexedDB, Firebase ou Cloudinary de verdade.
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

// Funções REAIS extraídas do index.html — nenhuma lógica de merge/sync reimplementada.
const loadDataFn = extractFunction(html, 'loadData');
const syncFromFirebaseFn = extractFunction(html, 'syncFromFirebase');
const writeShardedStateFn = extractFunction(html, 'writeShardedState');
const writeShardedStateSerializedFn = extractFunction(html, 'writeShardedStateSerialized');
const readShardedStateFn = extractFunction(html, 'readShardedState');
const pushToFirebaseNowFn = extractFunction(html, 'pushToFirebaseNow');
// ALTERAÇÃO 076: pre-push reconcile também no caminho debounced (usado por
// saveReview/saveSRS/saveSessionLog/saveOrder/saveSiteOrder).
const pushToFirebaseFn = extractFunction(html, 'pushToFirebase');
// ALTERAÇÃO 077: restore canônico dedicado — nunca lê DATA/REVIEW/SRS
// globais, nunca faz merge/união/migração, exige expectedRemoteRevision.
const quarantineIndexedByLesionIdFn = extractFunction(html, 'quarantineIndexedByLesionId');
const sanitizeCanonicalPayloadForQuarantineFn = extractFunction(html, 'sanitizeCanonicalPayloadForQuarantine');
const validateCanonicalPayloadFn = extractFunction(html, 'validateCanonicalPayload');
const canonicalJsonStringFn = extractFunction(html, 'canonicalJsonString');
const deepStableEqualFn = extractFunction(html, 'deepStableEqual');
const restoreCanonicalStateToCloudFn = extractFunction(html, 'restoreCanonicalStateToCloud');
// A quarentena precisa ser REAL (não o stub isQuarantinedSeedId:()=>false já
// usado no resto deste arquivo) para os testes E/F/G/H/I do restore
// canônico, que verificam a proteção 075 de verdade. Mesmo trecho que
// PROTEÇÃO 075 usa em critical-flows.test.js.
const computeDuplicateSeedIdsFn = extractFunction(html, 'computeDuplicateSeedIds');
const quarantineConstsSource = html.slice(html.indexOf('const SUPPRESSED_DUPLICATE_IDS_V172'), html.indexOf('function getActiveCanonicalSeed'));
const saveDataFn = extractFunction(html, 'saveData');
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
const mergeForPushFn = extractFunction(html, 'mergeEntryForImagePush');
const unionClinicalCasesFn = extractFunction(html, 'unionClinicalCases');
const clinicalCaseIdentityKeyFn = extractFunction(html, 'clinicalCaseIdentityKey');
const normalizeExternalTitleFn = extractFunction(html, 'normalizeExternalTitle');
const imageOwnerIdFn = extractFunction(html, 'imageOwnerIdV1');
const canChangeOwnershipFn = extractFunction(html, 'canChangeImageOwnership');
const registerConflictFn = extractFunction(html, 'registerImageOwnershipConflict');
const imageIdentityDivergenceForEntryFn = extractFunction(html, 'imageIdentityDivergenceForEntry');
const buildImageIdentityDivergenceReportFn = extractFunction(html, 'buildImageIdentityDivergenceReport');
const writeShardedStateWithConflictRetryFn = extractFunction(html, 'writeShardedStateWithConflictRetry');
const markSyncDirtyFn = extractFunction(html, 'markSyncDirty');
const clearSyncDirtyFn = extractFunction(html, 'clearSyncDirty');
// ALTERAÇÃO 073 (2026-09-23): tombstones de imagem excluída — reais no motor.
const tombTimeFn = extractFunction(html, 'tombstoneTime');
const isValidTombFn = extractFunction(html, 'isValidImageTombstone');
const mergeTombFn = extractFunction(html, 'mergeImageTombstones');
const isTombstonedFn = extractFunction(html, 'isImageTombstoned');
const applyTombFn = extractFunction(html, 'applyImageTombstonesToList');
const recordTombFn = extractFunction(html, 'recordImageTombstone');
const loadTombFn = extractFunction(html, 'loadImageTombstones');
const saveTombFn = extractFunction(html, 'saveImageTombstones');
const sweepTombFn = extractFunction(html, 'sweepImageTombstonesFromData');
// ALTERAÇÃO 074: reconciliação pré-envio — reais no motor.
const reconcileCoreFn = extractFunction(html, 'reconcileStateWithRemote');
const reconcilePrePushFn = extractFunction(html, 'reconcileBeforePush');
const countAdoptedFn = extractFunction(html, 'countRemoteOnlyAdopted');
const persistLocalFn = extractFunction(html, 'persistLocalStateNow');
// ALTERAÇÃO 073b: escopo por lesão + compatibilidade com global legado.
const tombScopeFn = extractFunction(html, 'tombstoneScopeKey');
const normalizeTombFn = extractFunction(html, 'normalizeTombstoneMap');
// Auditoria read-only de holders físicos (resolver os 2 assets do Abscesso).
const auditHoldersFn = extractFunction(html, 'auditImageHoldersByStableKey');
const normalizeLegacyOwnerFn = extractFunction(html, 'normalizeLegacyImageOwnerLabel');
// ALTERAÇÃO 072b: helper compartilhado da normalização no pull (mesma tabela
// de decisão da função de console) — precisa entrar nos motores `vm`.
const legacyHoldersFn = extractFunction(html, 'legacyImageHoldersByKey');
const tryNormalizeFn = extractFunction(html, 'tryNormalizeLegacyPullImage');
// ALTERAÇÃO 079 — loadSRS() real, usada isoladamente no Teste 5b (a
// makeDevice() abaixo estuba loadSRS como no-op pra não afetar os testes
// pré-existentes que não são sobre este load específico).
const loadSRSFn = extractFunction(html, 'loadSRS');
// ALTERAÇÃO 079c — caminhos de escrita manuais e os saves de progresso
// reais, para provar que TODO caminho normal passa pela barreira final de
// imagens stale dentro de writeShardedState().
const syncThisDeviceToCloudFn = extractFunction(html, 'syncThisDeviceToCloud');
const forceThisDeviceToCloudFn = extractFunction(html, 'forceThisDeviceToCloud');
const saveSRSFn = extractFunction(html, 'saveSRS');
const saveReviewFn = extractFunction(html, 'saveReview');
const gateStaleImagesFn = extractFunction(html, 'gateStaleLocalOnlyImagesForWrite');
// ALTERAÇÃO 079d — marcadores persistentes de inclusão explícita de imagem.
const pendingAddsFns079d = ['normalizePendingLocalImageAdds', 'hasPendingLocalImageAdd', 'markPendingLocalImageAdds',
  'confirmPendingLocalImageAdds', 'loadPendingLocalImageAdds', 'savePendingLocalImageAdds']
  .map((n) => extractFunction(html, n).source).join('\n');
const addImageToLesionDataFn = extractFunction(html, 'addImageToLesionData');
// PROTEÇÃO 085 — ordem de seções/sítios com carimbo de reordenação manual.
const orderFns085 = ['normalizeOrderStamps', 'loadOrderStamps', 'saveOrderStamps', 'markSectionOrderManual',
  'markSiteOrderManual', 'markRestoredOrderManual', 'dedupeOrderList', 'isAutoSectionOrder', 'isAutoSiteList',
  'mergeOrderList', 'mergeOrderState']
  .map((n) => extractFunction(html, n).source).join('\n');
// PROTEÇÃO 084 — Central de Revisões sincronizada (merge + save reais).
const lesionRevisionsFns084 = ['mergeLesionRevisions', 'saveLesionRevisions', 'updateReviewCenterBadges',
  'getPendingReviews', 'getProposedSolutions', 'getAppliedSolutionsAwaitingValidation', 'getManualActionSolutions',
  'getReadySolutions', 'countPendingLesionReviews', 'countReadyLesionSolutions',
  // PROTEÇÃO 086 — ⚠ junto ao nome da lesão (chamado por updateReviewCenterBadges)
  'hasActiveLesionReview', 'lesionReviewWarningHtml', 'refreshLesionReviewWarnings']
  .map((n) => extractFunction(html, n).source).join('\n');

// Nuvem falsa COMPARTILHADA entre "dispositivos" — simula um único projeto
// Firestore (atlas_state/main + data_chunk_i) visto por computadores
// diferentes, cada um com seu próprio IndexedDB local.
function makeFakeCloud() {
  const store = new Map();
  // Portão controlável para o teste de CONCORRÊNCIA (ALTERAÇÃO 069): permite
  // pausar exatamente a leitura do documento principal (o primeiro `await`
  // real dentro de syncFromFirebase()) para interleavear um save() no meio
  // do pull, do jeito determinístico que promises/microtasks permitem — sem
  // depender de setTimeout/sleep.
  let metaReadGate = null;
  let metaReadOnEnter = null;
  return {
    // Devolve { waitUntilEntered, release }: waitUntilEntered() só resolve
    // quando a leitura de fato CHEGOU no get() (está bloqueada no portão) —
    // sem isso, um teste que só chama boot() e imediatamente muta DATA
    // correria contra um número indeterminado de microtasks (storage.get,
    // loadSRS, etc.) que loadData() atravessa antes de chegar aqui.
    gateNextMetaRead() {
      let releaseGate, resolveEntered;
      const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
      const enteredPromise = new Promise((resolve) => { resolveEntered = resolve; });
      metaReadGate = gatePromise;
      metaReadOnEnter = resolveEntered;
      return {
        waitUntilEntered: () => enteredPromise,
        release: () => { metaReadGate = null; metaReadOnEnter = null; releaseGate(); }
      };
    },
    // ALTERAÇÃO 070 (2026-09-23): as referências carregam __kind/__i pra que
    // fbDb.runTransaction() (abaixo) saiba em qual "documento" da nuvem
    // falsa operar — replica o mesmo formato que FB_META_REF()/FB_CHUNK_REF()
    // reais devolvem (DocumentReference), só que endereçando o Map local
    // em vez do Firestore de verdade.
    FB_META_REF: () => ({
      __kind: 'meta',
      set: async (payload) => { store.set('main', payload); },
      get: async () => {
        if (metaReadGate) {
          const gate = metaReadGate;
          if (metaReadOnEnter) metaReadOnEnter();
          await gate;
        }
        const data = store.get('main');
        return { exists: !!data, data: () => data };
      }
    }),
    FB_CHUNK_REF: (i) => {
      const key = 'chunk_' + i;
      return {
        __kind: 'chunk', __i: i,
        set: async (payload) => { store.set(key, payload); },
        get: async () => {
          const data = store.get(key);
          return { exists: !!data, data: () => data };
        },
        delete: async () => { store.delete(key); }
      };
    },
    // ALTERAÇÃO 070: writeShardedState() real escreve dentro de UMA
    // transação (tx.get/tx.set) — este mock opera no MESMO `store`
    // compartilhado, então a verificação de revisão feita por
    // writeShardedState() (dentro da própria função extraída, real) vale
    // de verdade entre os "dispositivos" do teste.
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => {
          const key = ref.__kind === 'meta' ? 'main' : ('chunk_' + ref.__i);
          const data = store.get(key);
          return { exists: !!data, data: () => data };
        },
        set: (ref, payload) => {
          const key = ref.__kind === 'meta' ? 'main' : ('chunk_' + ref.__i);
          store.set(key, payload);
        }
      };
      return fn(tx);
    },
    // acesso direto pra inspecionar a nuvem nos testes sem passar pelo device
    peekLesionCount() {
      const main = store.get('main');
      if (!main) return 0;
      let n = 0;
      for (let i = 0; i < (main.chunkCount || 0); i++) {
        const chunk = store.get('chunk_' + i);
        if (chunk && Array.isArray(chunk.items)) n += chunk.items.length;
      }
      return n;
    },
    peekRevision() {
      const main = store.get('main');
      return main ? (Number(main.revision) || 0) : 0;
    },
    // ALTERAÇÃO 079 — inspeciona o payload cru gravado (review/srs/tombstones
    // no documento principal, itens de um chunk) sem passar por nenhum
    // device: prova diretamente O QUE de fato chegou no Firestore falso.
    peekMeta() {
      return store.get('main') || null;
    },
    peekChunkItems(i) {
      const chunk = store.get('chunk_' + i);
      return chunk && Array.isArray(chunk.items) ? chunk.items : [];
    }
  };
}

// Um "computador": storage LOCAL próprio (não compartilhado) + a nuvem
// falsa compartilhada passada por parâmetro. Cada chamada a boot() roda o
// loadData() REAL do zero (simulando abrir a página/F5), lendo o storage
// local que sobrou da vez anterior — exatamente como um IndexedDB real
// persiste entre aberturas do navegador.
function makeDevice(cloud, { seed = [] } = {}) {
  // Pré-popula o storage local com o catálogo — simula um dispositivo JÁ
  // INICIALIZADO (IndexedDB com STORAGE_KEY existente), nunca um dispositivo
  // novo (que cairia no fluxo de bootstrap, fora do escopo destes testes).
  const localBacking = { data: JSON.stringify(seed) };
  let context; // referenciado pelo próprio setSyncStatus stub abaixo (closure)
  context = vm.createContext({
    DATA: [], REVIEW: {}, SRS: {}, SESSIONLOG: {}, sectionOrder: [], siteOrder: {},
    appStateReady: false, deviceBootstrapPending: false,
    // ALTERAÇÃO 070 (2026-09-23): fbDb.runTransaction aponta pra nuvem falsa
    // COMPARTILHADA — writeShardedState() real (extraída abaixo) usa isso
    // pra fazer a verificação de revisão de verdade entre os "dispositivos".
    fbDb: { runTransaction: cloud.runTransaction },
    fbSyncing: false, fbPushTimer: null, writeChainV247: Promise.resolve(),
    canonicalRestoreInProgress: false,
    syncPushPending: false,
    syncFromFirebaseSkipTrailingPush: false,
    // ALTERAÇÃO 072 (2026-09-23): dirty PERSISTENTE e explícito — só ligado
    // por uma ação real do usuário (device.save(), que chama saveData()
    // real, que chama markSyncDirty()). Um boot() puro nunca liga isto
    // sozinho, do mesmo jeito que no app real.
    syncDirty: false,
    SYNC_DIRTY_KEY: 'atlas:syncDirty',
    CLOUD_REVISION_FIELD: 'revision',
    lastKnownCloudRevision: null, // null = nunca lido com sucesso nesta sessão (mesmo estado inicial do app real)
    lastWriteRefusedReason: null,
    lastRevisionConflictAt: null,
    window: {}, setTimeout, clearTimeout,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } },
    SEED: seed,
    STORAGE_KEY: 'data', ORDER_KEY: 'order', SITEORDER_KEY: 'site-order', REVIEW_KEY: 'review',
    SRS_KEY: 'srs', SESSIONLOG_KEY: 'sessionlog',
    RECOVERY_KEY: 'recovery', RECOVERY_VERSION: 'test', DEFAULT_SECTION_ORDER: [], EN_TERMS: {},
    SUPPRESSED_DUPLICATE_IDS_V172: new Set(),
    QUARANTINED_HIGH_IDS_20260924: new Set(),
    isQuarantinedSeedId: (id) => false,
    activeCanonicalSeedV172: () => [],
    DATA_CHUNK_SIZE: 150,
    FB_META_REF: cloud.FB_META_REF,
    FB_CHUNK_REF: cloud.FB_CHUNK_REF,
    withFirebaseTimeout: (p) => p,
    // Espelha o essencial da setSyncStatus real (sem DOM): sucesso limpa o
    // pendente, falha marca — é exatamente esse estado que a barreira de
    // reconciliação (ALTERAÇÃO 069) usa para não perder um push bloqueado.
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
    // ALTERAÇÃO 079c — stubs mínimos para syncThisDeviceToCloud()/
    // forceThisDeviceToCloud() reais (verificação pós-envio e confirm()).
    LESION_REVISIONS: {},
    ORDER_STAMPS: { section: 0, sites: {} }, // PROTEÇÃO 085
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
    // ALTERAÇÃO 079b — mesma variável compartilhada real (declarada fora de
    // qualquer função no index.html); reconcileStateWithRemote() grava,
    // writeShardedState() consome e zera.
    let pendingWriteImageExclusionsById = null;
    ${countAdoptedFn.source}
    ${reconcileCoreFn.source}
    ${persistLocalFn.source}
    ${reconcilePrePushFn.source}
    let PULL_IMAGE_OWNERSHIP_CONFLICTS = [];
    ${unionFn.source}
    ${dedupeFn.source}
    ${normalizeExternalTitleFn.source}
    ${clinicalCaseIdentityKeyFn.source}
    ${unionClinicalCasesFn.source}
    ${mergeEntryNonDestructiveFn.source}
    ${mergeForPushFn.source}
    ${mergeReviewFn.source}
    ${mergeSRSFn.source}
    ${mergeSessionLogFn.source}
    ${imageIdentityDivergenceForEntryFn.source}
    ${buildImageIdentityDivergenceReportFn.source}
    function stripUndefinedDeep(v){try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}}
    function splitIntoChunks(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
    function checkChunkSize(){return true;}
    ${markSyncDirtyFn.source}
    ${clearSyncDirtyFn.source}
    const PENDING_LOCAL_IMAGE_ADDS_KEY = 'atlas:pendingLocalImageAdds';
    let PENDING_LOCAL_IMAGE_ADDS = {};
    // acessores só de teste (o \`let\` do motor não vira propriedade do contexto)
    function __getPendingAdds079d(){ return PENDING_LOCAL_IMAGE_ADDS; }
    function __setPendingAdds079d(v){ PENDING_LOCAL_IMAGE_ADDS = v; }
    ${pendingAddsFns079d}
    ${addImageToLesionDataFn.source}
    const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';
    const ACTIVE_LESION_REVIEW_STATUSES = ['pending', 'rejected', 'proposed', 'applied_pending_validation', 'manual_action_required'];
    const LESION_REVIEW_WARNING_TEXT = 'Esta lesão possui revisão ativa';
    ${lesionRevisionsFns084}
    const ORDER_STAMPS_KEY = 'atlas:orderUpdatedAt';
    ${orderFns085}
    let lastWriteStaleImagesBlocked = 0;
    ${gateStaleImagesFn.source}
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
    ${sanitizeCanonicalPayloadForQuarantineFn.source}
    ${validateCanonicalPayloadFn.source}
    ${canonicalJsonStringFn.source}
    ${deepStableEqualFn.source}
    ${restoreCanonicalStateToCloudFn.source}
    ${syncThisDeviceToCloudFn.source}
    ${forceThisDeviceToCloudFn.source}
    ${saveSRSFn.source}
    ${saveReviewFn.source}
  `;
  new vm.Script(engine).runInContext(context);
  return {
    context,
    boot: () => context.loadData(),
    // simula o usuário salvando uma edição (ex.: adicionar imagem) — mesmo
    // caminho real: persiste local e empurra pra nuvem.
    save: () => context.saveData(),
    // ALTERAÇÃO 072: simula "este dispositivo tem uma edição real ainda não
    // confirmada na nuvem" SEM precisar simular a edição inteira — usado só
    // no SETUP de cenários (ex.: popular a nuvem falsa pela primeira vez),
    // nunca como parte do comportamento sendo testado.
    markDirty: () => context.markSyncDirty(),
    // ALTERAÇÃO 079d — simula uma inclusão REAL de imagem pelo usuário
    // (mesmo efeito do Salvar do editor / Concluído do Quiz): adiciona à
    // lesão, carimba e cria o marcador persistente via addImageToLesionData real.
    addImage: async (lesionId, image) => {
      const lesion = context.DATA.find((e) => e && e.id === lesionId);
      const added = context.addImageToLesionData(lesion, image);
      await context.savePendingLocalImageAdds();
      return added;
    }
  };
}

function img(over) {
  const publicId = (over && over.publicId) || 'atlas-radiologico/x';
  // URL derivada do publicId (nunca um literal fixo repetido) — do
  // contrário todas as imagens do teste compartilhariam a MESMA chave de
  // identidade "url:...", colapsando em uma só no dedup por identidade.
  return Object.assign({
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/' + publicId + '.jpg',
    publicId, lesionId: 'seed_1', lesionName: 'Lesão 1',
    assignedAt: '2026-08-01T10:00:00.000Z'
  }, over || {});
}

function makeSeedEntry(over) {
  return Object.assign({
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', images: [], links: [], inc: 1
  }, over || {});
}

// ===========================================================================
// CENÁRIO A — dispositivo stale recebe automaticamente o que a nuvem tem, e
// depois de editar, o outro dispositivo recebe essa edição de volta.
// ===========================================================================

test('CENARIO A: PC B (local desatualizado) abre e recebe automaticamente as imagens que só existiam na nuvem (nenhuma perda)', async () => {
  const cloud = makeFakeCloud();

  // PC A já sincronizou 3 imagens com a nuvem anteriormente. markDirty()
  // simula "este catálogo veio de uma edição real ainda não confirmada" —
  // desde a ALTERAÇÃO 072, um boot() sozinho nunca publica nada (dirty é
  // explícito e persistente, nunca inferido por conteúdo).
  const seedA = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/1' }), img({ publicId: 'atlas-radiologico/2' }), img({ publicId: 'atlas-radiologico/3' })] })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot(); // popula a nuvem com 3 imagens

  assert.equal(cloud.peekLesionCount(), 1, 'a nuvem precisa ter a lesão após o boot de A');

  // PC B é um dispositivo JÁ INICIALIZADO (tem catálogo local), mas
  // desatualizado: só conhece 2 das 3 imagens (ex.: catálogo de semanas
  // atrás, antes de A ter adicionado a 3ª).
  const seedB = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/1' }), img({ publicId: 'atlas-radiologico/2' })] })];
  const deviceB = makeDevice(cloud, { seed: seedB });
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find(e => e.id === 'seed_1');
  assert.equal(entryB.images.length, 3, 'PC B precisa terminar o boot com as 3 imagens (a que só existia na nuvem foi incorporada)');
  const publicIdsB = new Set(entryB.images.map(i => i.publicId));
  assert.deepEqual(publicIdsB, new Set(['atlas-radiologico/1', 'atlas-radiologico/2', 'atlas-radiologico/3']));

  // PC B adiciona uma 4ª imagem (simula upload novo) e salva — precisa subir
  // pra nuvem. _userUpdatedAt: mesmo carimbo que addImageToLesionData()/o
  // Salvar do editor sempre gravam numa adição real (ALTERAÇÃO 079b) — sem
  // ele, o reconcile-before-push trataria como stale sem evidência.
  entryB.images.push(img({ publicId: 'atlas-radiologico/4', assetId: 'A4' }));
  entryB._userUpdatedAt = Date.now();
  deviceB.context.markPendingLocalImageAdds(entryB.id, [], [entryB.images[entryB.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();

  // PC A reabre (2º boot, storage local de A ainda só tem 3 imagens) —
  // precisa puxar a 4ª imagem que só existe na nuvem agora.
  await deviceA.boot();
  const entryA2 = deviceA.context.DATA.find(e => e.id === 'seed_1');
  assert.equal(entryA2.images.length, 4, 'PC A precisa receber a 4ª imagem adicionada por PC B');
  assert.ok(entryA2.images.some(i => i.publicId === 'atlas-radiologico/4'));
});

test('CENARIO B: divergência cruzada (cada lado tem uma imagem exclusiva) resulta em UNIÃO — nenhum lado perde nada', async () => {
  const cloud = makeFakeCloud();

  // Nuvem/PC A tem uma imagem exclusiva (X). markDirty() simula a edição
  // real que colocou X lá (ver ALTERAÇÃO 072 — boot() sozinho não publica).
  const seedA = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot();

  // PC B (já inicializado) tem uma imagem LOCAL exclusiva (Y), que a nuvem
  // não conhece — mesmo raciocínio: markDirty() simula a edição real de Y.
  // _userUpdatedAt: ALTERAÇÃO 079b — markDirty() sozinho não é mais
  // evidência suficiente de edição por lesão (é um flag de dispositivo
  // inteiro); a imagem só-local precisa do MESMO carimbo que uma adição
  // real via editor/Quiz sempre grava, ou o reconcile a trataria como stale.
  const seedB = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' })], _userUpdatedAt: Date.now() })];
  const deviceB = makeDevice(cloud, { seed: seedB });
  await deviceB.markDirty();
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find(e => e.id === 'seed_1');
  const idsB = new Set(entryB.images.map(i => i.assetId));
  assert.deepEqual(idsB, new Set(['X', 'Y']), 'PC B precisa terminar com as duas imagens (união), sem perder a Y nem deixar de ganhar a X');

  // A nuvem, depois do push automático de B ao fim do boot, também precisa refletir a união.
  assert.equal(cloud.peekLesionCount(), 1);
});

// ===========================================================================
// CONCORRÊNCIA (ALTERAÇÃO 069, 2026-09-23) — reproduz o bug relatado
// manualmente pelo usuário: nuvem com 116 imagens, Chrome local com 106
// (stale), diagnóstico mostrou "Divergente: SIM"; ao adicionar 1 imagem no
// Chrome, a nuvem CAIU para 107 (perdeu as 10 exclusivas). Este teste prova,
// via CÓDIGO REAL (loadData/syncFromFirebase/pushToFirebaseNow), que uma
// edição feita ENQUANTO o pull automático ainda está lendo o servidor nunca
// mais pode resultar nisso: o push da edição fica PENDENTE (nunca perdido,
// nunca ignorado em silêncio) até o merge terminar, e então é reenviado já
// com o estado UNIDO (nuvem + edição), nunca só a edição sobre o local stale.
// ===========================================================================

test('CONCORRÊNCIA: edição local DURANTE a reconciliação (pull em andamento) nunca é perdida, e o push da edição NÃO sobrescreve a nuvem com o estado pré-merge', async () => {
  const cloud = makeFakeCloud();

  // Nuvem já tem 13 imagens (equivalente proporcional ao caso real: 116).
  const cloudImages = [];
  for (let i = 1; i <= 13; i++) cloudImages.push(img({ publicId: 'atlas-radiologico/cloud-' + i, assetId: 'C' + i }));
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: cloudImages })] });
  await deviceA.markDirty(); // simula a edição real que colocou as 13 lá (ALTERAÇÃO 072)
  await deviceA.boot(); // popula a nuvem com as 13

  // PC B é um dispositivo JÁ INICIALIZADO, mas desatualizado: só conhece 3
  // das 13 imagens (equivalente proporcional ao caso real: local 106 x nuvem 116).
  const staleImages = cloudImages.slice(0, 3).map((x) => ({ ...x }));
  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: staleImages })] });

  // Pausa a leitura do documento principal — o primeiro `await` real dentro
  // de syncFromFirebase() — pra poder editar+salvar NO MEIO do pull, assim
  // como o usuário fez na prática (adicionou uma imagem logo depois de abrir
  // a página, antes do pull automático terminar de mesclar).
  const gate = cloud.gateNextMetaRead();
  const bootPromise = deviceB.boot();
  await gate.waitUntilEntered();

  // Enquanto o pull ainda está "preso" no portão (fbSyncing=true neste
  // exato instante): usuário adiciona 1 imagem nova e salva — o caminho
  // real de qualquer edição (saveData -> pushToFirebaseNow).
  const entryDuringPull = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  entryDuringPull.images.push(img({ publicId: 'atlas-radiologico/new-from-b', assetId: 'NEWB' }));
  entryDuringPull._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceB.context.markPendingLocalImageAdds(entryDuringPull.id, [], [entryDuringPull.images[entryDuringPull.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();

  // O push desta edição precisa ter sido BLOQUEADO (nunca perdido em
  // silêncio, nunca escrevendo por cima da nuvem com só local+1 nesse meio
  // tempo) — a nuvem ainda só tem o que A escreveu antes.
  assert.equal(cloud.peekLesionCount(), 1, 'a nuvem não pode ter sido tocada pelo push bloqueado da edição concorrente');
  assert.equal(deviceB.context.syncPushPending, true, 'o push bloqueado precisa ficar marcado como pendente, nunca descartado em silêncio');

  gate.release();
  await bootPromise;

  // RESULTADO OBRIGATÓRIO: união completa — as 13 da nuvem + a 1 nova de B = 14.
  // PROIBIDO: só 3+1=4 (a edição sozinha, como se tivesse perdido as 10
  // exclusivas da nuvem — o bug relatado, proporcionalmente 116 -> 107).
  const finalEntryB = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  assert.equal(finalEntryB.images.length, 14, 'PC B precisa terminar com TODAS as imagens da nuvem + a nova, nunca só local+1');
  const finalIds = new Set(finalEntryB.images.map((i) => i.assetId));
  for (let i = 1; i <= 13; i++) assert.ok(finalIds.has('C' + i), `imagem C${i} da nuvem não pode ter sido perdida`);
  assert.ok(finalIds.has('NEWB'), 'a nova imagem adicionada durante o pull não pode ter sido perdida');
  assert.equal(deviceB.context.syncPushPending, false, 'o push pendente precisa ter sido escoado (flush) assim que a reconciliação terminou');

  // A nuvem, ao final, também precisa refletir a união (nunca regredir pra
  // 4) — verificado com um terceiro dispositivo independente puxando dela.
  const deviceCheck = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await deviceCheck.boot();
  const cloudFinalEntry = deviceCheck.context.DATA.find((e) => e.id === 'seed_1');
  assert.equal(cloudFinalEntry.images.length, 14, 'a nuvem, ao final, precisa ter as 14 imagens (união) — nunca ter regredido para 4');
});

test('SYNC REPETIDO: dois boots seguidos do mesmo dispositivo, sem mudança na nuvem, não duplicam imagens', async () => {
  const cloud = makeFakeCloud();
  const seed = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/1' })] })];
  const device = makeDevice(cloud, { seed });
  await device.boot();
  const countAfterFirst = device.context.DATA.find(e => e.id === 'seed_1').images.length;

  await device.boot(); // simula outro F5, mesma máquina, nuvem inalterada
  const countAfterSecond = device.context.DATA.find(e => e.id === 'seed_1').images.length;

  assert.equal(countAfterFirst, 1);
  assert.equal(countAfterSecond, 1, 'reabrir sem mudanças não pode duplicar a imagem já sincronizada');
});

// ===========================================================================
// CONTROLE DE REVISÃO (ALTERAÇÃO 070, 2026-09-23) — cenário exato pedido:
// "A e B partem revision 10. B publica revision 11. A tenta publicar
// baseado em 10 -> escrita ABORTADA -> pull revision 11 -> merge -> retry
// seguro -> revision 12." Prova as DUAS etapas separadamente: (1) a escrita
// crua é recusada quando a revisão conhecida está desatualizada; (2) o
// caminho real de salvar (saveData -> writeShardedStateSerialized) se
// autocura sozinho — reconcilia e tenta de novo, sem perder nem a edição de
// A nem a de B.
// ===========================================================================

test('REVISÃO: dois dispositivos sincronizados, B publica primeiro, A com revisão desatualizada é recusado cru e depois se autocura via saveData (nenhuma edição perdida)', async () => {
  // Comparações RELATIVAS de propósito (não números fixos de revisão): um
  // único boot já pode gravar mais de uma vez (o próprio pull/merge de
  // syncFromFirebase e o push incondicional do fim de loadData() — ver a
  // nota de escopo no teste "BOOT COM ESTADO JÁ IDÊNTICO" abaixo). O que
  // importa para o controle de revisão é a ORDEM RELATIVA dos eventos, não
  // o número exato de escritas que um boot comum realiza.
  const cloud = makeFakeCloud();

  // Estado inicial compartilhado: um único boot popula a nuvem (o próprio
  // boot pode gravar mais de uma vez — ver nota de escopo abaixo — então o
  // que importa é o valor FINAL, não quantas escritas levou até lá).
  const seedInicial = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/base', assetId: 'BASE' })] })];
  const seedBoot = makeDevice(cloud, { seed: seedInicial });
  await seedBoot.boot();
  const revisionCompartilhada = cloud.peekRevision();

  // A e B partem da MESMA revisão conhecida (equivalente a "revision 10") —
  // simulado diretamente (em vez de cada um rodar seu próprio boot() completo,
  // que também escreveria e inflaria a revisão de forma desigual entre os
  // dois, mascarando o cenário real de "ambos sabiam a mesma versão"). O
  // mecanismo testado abaixo (writeShardedState/syncFromFirebase/saveData)
  // continua sendo o código REAL, só o setup do "ponto de partida" é direto.
  const deviceA = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedInicial)) });
  deviceA.context.appStateReady = true;
  deviceA.context.lastKnownCloudRevision = revisionCompartilhada;
  deviceA.context.DATA = JSON.parse(JSON.stringify(seedInicial));
  const deviceB = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedInicial)) });
  deviceB.context.appStateReady = true;
  deviceB.context.lastKnownCloudRevision = revisionCompartilhada;
  deviceB.context.DATA = JSON.parse(JSON.stringify(seedInicial));

  // B edita e salva primeiro (equivalente a "B publica revision 11").
  // _userUpdatedAt: ALTERAÇÃO 079b — mesmo carimbo que uma adição real via
  // editor/Quiz sempre grava.
  const entryB0 = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  entryB0.images.push(img({ publicId: 'atlas-radiologico/from-b', assetId: 'FROMB' }));
  entryB0._userUpdatedAt = Date.now();
  deviceB.context.markPendingLocalImageAdds(entryB0.id, [], [entryB0.images[entryB0.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();
  const revisionAposB = cloud.peekRevision();
  assert.ok(revisionAposB > revisionCompartilhada, 'B precisa ter avançado a nuvem para uma revisão mais nova');

  // ETAPA 1 — prova a escrita CRUA (sem o retry automático): A ainda acha
  // que a revisão é a antiga (nunca releu depois do boot). Chamar
  // writeShardedState() diretamente (não writeShardedStateSerialized) isola
  // só a verificação de revisão, sem o retry que
  // writeShardedStateWithConflictRetry faria.
  assert.equal(deviceA.context.lastKnownCloudRevision, revisionCompartilhada, 'A não pode ter sido notificado da escrita de B');
  const rawOk = await deviceA.context.writeShardedState(5000);
  assert.equal(rawOk, false, 'escrita crua de A, baseada numa revisão desatualizada, precisa ser RECUSADA — nunca sobrescrever a edição de B');
  assert.equal(deviceA.context.lastWriteRefusedReason, 'cloud_revision_conflict');
  assert.equal(cloud.peekRevision(), revisionAposB, 'a recusa não pode ter tocado a nuvem — a edição de B continua intacta, na mesma revisão');
  // A edição de B não pode ter sido apagada pela tentativa recusada de A.
  const cloudCheck1 = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await cloudCheck1.boot();
  assert.ok(cloudCheck1.context.DATA.find((e) => e.id === 'seed_1').images.some((i) => i.assetId === 'FROMB'));

  // ETAPA 2 — o caminho REAL de salvar (saveData -> writeShardedStateSerialized
  // -> writeShardedStateWithConflictRetry) precisa se autocurar sozinho: A
  // edita algo próprio e salva; mesmo com a revisão desatualizada, o Atlas
  // reconcilia (pull da edição de B + merge com a edição de A) e tenta de
  // novo — "retry seguro -> revision mais nova ainda".
  const entryA0 = deviceA.context.DATA.find((e) => e.id === 'seed_1');
  entryA0.images.push(img({ publicId: 'atlas-radiologico/from-a', assetId: 'FROMA' }));
  entryA0._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceA.context.markPendingLocalImageAdds(entryA0.id, [], [entryA0.images[entryA0.images.length - 1]]); await deviceA.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceA.save();

  assert.ok(cloud.peekRevision() > revisionAposB, 'o retry precisa ter avançado a nuvem mais uma vez, com o estado já mesclado');
  const finalEntryA = deviceA.context.DATA.find((e) => e.id === 'seed_1');
  const idsA = new Set(finalEntryA.images.map((i) => i.assetId));
  assert.deepEqual(idsA, new Set(['BASE', 'FROMB', 'FROMA']), 'A precisa terminar com a base + a edição de B + a própria edição — nenhuma perdida');

  // A nuvem final também precisa refletir a união completa (verificado por
  // um terceiro dispositivo independente).
  const cloudCheck2 = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await cloudCheck2.boot();
  const idsCloud = new Set(cloudCheck2.context.DATA.find((e) => e.id === 'seed_1').images.map((i) => i.assetId));
  assert.deepEqual(idsCloud, new Set(['BASE', 'FROMB', 'FROMA']));
});

test('BOOT COM ESTADO JÁ IDÊNTICO: reabrir com a nuvem sem nenhuma mudança real não duplica nem corrompe nada (número de escritas por boot é ESTÁVEL, não cresce a cada reabertura)', async () => {
  // NOTA DE ESCOPO (ver relatório da Alteração 070): loadData() continua
  // empurrando incondicionalmente ao fim do boot (não implementamos "pular
  // push quando o merge não trouxe nada novo" — ver a seção "Não
  // implementado" do CONTEXTO_MESTRE). Isso é uma escolha deliberada: a
  // barreira de revisão acima já GARANTE que esse push nunca pode
  // sobrescrever algo mais novo (só teria êxito se realmente bater com a
  // revisão atual do servidor), então um push "desnecessário" é uma
  // ineficiência de rede (no máximo mais uma revisão gasta), não um risco
  // de perda de dados. Este teste prova só a parte que É garantida: o
  // número de escritas de um boot sem mudança real é o MESMO de qualquer
  // outro boot equivalente — nunca cresce a cada reabertura repetida (o que
  // indicaria um loop ou uma escrita se alimentando de si mesma).
  const cloud = makeFakeCloud();
  const seed = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/1' })] })];
  const deviceA = makeDevice(cloud, { seed });
  await deviceA.boot();
  const writesFirstBoot = cloud.peekRevision(); // revisão parte de 0 -> mede quantas escritas o 1º boot fez

  const deviceB = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seed)) });
  await deviceB.boot();
  const writesSecondBoot = cloud.peekRevision() - writesFirstBoot;

  assert.ok(writesSecondBoot <= writesFirstBoot, 'um segundo boot com estado idêntico não pode gastar MAIS escritas que o primeiro (sinal de loop)');
  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  assert.equal(entryB.images.length, 1, 'nenhuma duplicação da única imagem existente');

  // Reabrir uma TERCEIRA vez, ainda sem nenhuma mudança real, precisa gastar
  // o MESMO número de escritas do segundo boot — nunca mais (não pode ficar
  // incrementando a cada reabertura repetida).
  const deviceC = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seed)) });
  await deviceC.boot();
  const writesThirdBoot = cloud.peekRevision() - writesFirstBoot - writesSecondBoot;
  assert.equal(writesThirdBoot, writesSecondBoot, 'boots repetidos e idênticos precisam gastar sempre o mesmo número de escritas, nunca crescente');
  assert.equal(deviceC.context.DATA.find((e) => e.id === 'seed_1').images.length, 1);
});

// ===========================================================================
// OWNERSHIP × PULL (investigação do relatório manual, 2026-09-23) — prova,
// com o código REAL, POR QUE uma imagem que existe de verdade na nuvem (não
// duplicata) pode não chegar ao dispositivo que puxa: unionEntryImages()
// bloqueia a adoção quando a etiqueta interna da imagem (img.lesionId)
// diverge do id da lesão-alvo do merge — mesmo a imagem estando guardada
// dentro do array `images` dessa MESMA lesão na nuvem. Esse é o mecanismo
// documentado de proteção de ownership (nunca resolvido automaticamente,
// sempre registrado); este teste prova exatamente essa cadeia, sem afirmar
// se é a causa do caso real relatado (não temos acesso aos dados reais).
// ===========================================================================

test('OWNERSHIP × PULL: imagem com etiqueta interna (lesionId) divergente do id da lesão-alvo NÃO é adotada no pull — fica registrada, nunca perdida em silêncio nem forçada', async () => {
  const cloud = makeFakeCloud();

  // Nuvem: seed_1 tem uma imagem cuja etiqueta interna aponta para OUTRA
  // lesão em formato NÃO-histórico ('u_outra_lesao_999') — bloqueio puro.
  // (Etiqueta legada seed_N segura tem outro destino desde a 072b: é
  // normalizada e adotada — ver testes '072b PULL REAL'. Aqui o dono NÃO é
  // seed_N, então nenhuma normalização se aplica e o bloqueio precisa valer
  // como antes.)
  const imagemComEtiquetaDivergente = img({ publicId: 'atlas-radiologico/tagged-other', assetId: 'TAGGED', lesionId: 'u_outra_lesao_999', lesionName: 'Outra Lesão' });
  const seedNuvem = [makeSeedEntry({ images: [imagemComEtiquetaDivergente] })];
  const deviceA = makeDevice(cloud, { seed: seedNuvem });
  await deviceA.markDirty(); // simula a edição real que colocou a imagem lá (ALTERAÇÃO 072) — sem isto, a nuvem nunca teria a imagem e o teste passaria pelo motivo errado
  await deviceA.boot();

  // PC B (já inicializado, sem essa imagem) faz o pull.
  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  assert.equal(entryB.images.length, 0, 'a imagem com etiqueta divergente NÃO pode ser adotada automaticamente — provaria ownership sendo ignorado');

  // Controle: a MESMA imagem, mas com a etiqueta batendo com a lesão-alvo,
  // PRECISA ser adotada normalmente — prova que o bloqueio é especificamente
  // sobre a etiqueta divergente, não uma falha geral do pull.
  const cloud2 = makeFakeCloud();
  const imagemComEtiquetaCorreta = img({ publicId: 'atlas-radiologico/tagged-correct', assetId: 'CORRETA', lesionId: 'seed_1', lesionName: 'Lesão 1' });
  const deviceA2 = makeDevice(cloud2, { seed: [makeSeedEntry({ images: [imagemComEtiquetaCorreta] })] });
  await deviceA2.markDirty();
  await deviceA2.boot();
  const deviceB2 = makeDevice(cloud2, { seed: [makeSeedEntry({ images: [] })] });
  await deviceB2.boot();
  const entryB2 = deviceB2.context.DATA.find((e) => e.id === 'seed_1');
  assert.equal(entryB2.images.length, 1, 'com a etiqueta batendo, a MESMA lógica de pull adota a imagem normalmente');
});

// ===========================================================================
// PULL SEM PUSH (ALTERAÇÃO 071, 2026-09-23) — cenários exatos pedidos:
// abrir o Atlas sem nenhuma alteração do usuário NUNCA deve empurrar o
// local à nuvem; só publica quando o local realmente tinha algo exclusivo.
// ===========================================================================

test('BOOT 108/118 SEM EDIÇÃO: PC stale sem nenhuma alteração local recebe tudo da nuvem e NÃO gasta nenhuma escrita', async () => {
  const cloud = makeFakeCloud();

  // Nuvem rica (equivalente proporcional a 118: 9 imagens espalhadas em
  // várias lesões, como no caso real — não uma só lesão com 9 imagens).
  const seedRico = [
    makeSeedEntry({ id: 'seed_1', name: 'Glioblastoma', images: [img({ publicId: 'atlas-radiologico/g1' }), img({ publicId: 'atlas-radiologico/g2' }), img({ publicId: 'atlas-radiologico/g3' })] }),
    makeSeedEntry({ id: 'seed_2', name: 'Abscesso cerebral', images: [img({ publicId: 'atlas-radiologico/a1', lesionId: 'seed_2', lesionName: 'Abscesso cerebral' }), img({ publicId: 'atlas-radiologico/a2', lesionId: 'seed_2', lesionName: 'Abscesso cerebral' })] }),
    makeSeedEntry({ id: 'seed_3', name: 'Hematoma subdural', images: [img({ publicId: 'atlas-radiologico/h1', lesionId: 'seed_3', lesionName: 'Hematoma subdural' }), img({ publicId: 'atlas-radiologico/h2', lesionId: 'seed_3', lesionName: 'Hematoma subdural' })] }),
    makeSeedEntry({ id: 'seed_4', name: 'Esclerose múltipla', images: [img({ publicId: 'atlas-radiologico/e1', lesionId: 'seed_4', lesionName: 'Esclerose múltipla' })] }),
    makeSeedEntry({ id: 'seed_5', name: 'Eventração', images: [img({ publicId: 'atlas-radiologico/v1', lesionId: 'seed_5', lesionName: 'Eventração' })] })
  ];
  const deviceRico = makeDevice(cloud, { seed: seedRico });
  await deviceRico.markDirty(); // simula as edições reais que povoaram a nuvem (ALTERAÇÃO 072)
  await deviceRico.boot();
  const revisionAntesDoStale = cloud.peekRevision();

  // PC stale conhece só a PRIMEIRA imagem de cada lesão (equivalente
  // proporcional a 108: menos imagens, mesmas lesões, nenhuma edição feita).
  const seedStale = seedRico.map((e) => ({ ...e, images: e.images.slice(0, 1).map((i) => ({ ...i })) }));
  const deviceStale = makeDevice(cloud, { seed: seedStale });
  await deviceStale.boot();

  // RESULTADO OBRIGATÓRIO: local recebe tudo da nuvem.
  for (const seedEntry of seedRico) {
    const entry = deviceStale.context.DATA.find((e) => e.id === seedEntry.id);
    assert.equal(entry.images.length, seedEntry.images.length, `${seedEntry.name} precisa terminar com todas as imagens da nuvem`);
  }

  // RESULTADO OBRIGATÓRIO: ZERO escritas — o boot só LEU e persistiu local,
  // não tinha nada exclusivo pra contribuir de volta.
  assert.equal(cloud.peekRevision(), revisionAntesDoStale, 'boot sem alteração local exclusiva não pode gastar nenhuma escrita na nuvem');
});

test('BOOT COM ALTERAÇÃO LOCAL EXCLUSIVA: PC stale com 1 imagem própria (edição real, dirty) recebe a nuvem inteira E publica só essa imagem (união completa)', async () => {
  const cloud = makeFakeCloud();
  const seedRico = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/1' }), img({ publicId: 'atlas-radiologico/2' })] })];
  const deviceRico = makeDevice(cloud, { seed: seedRico });
  await deviceRico.markDirty();
  await deviceRico.boot();
  const revisionAntes = cloud.peekRevision();

  // PC stale: só conhece 1 das 2 imagens da nuvem (sem nenhuma edição própria
  // ainda). Boot normal primeiro — não deve publicar nada (mesma regra do
  // teste anterior).
  const seedStale = [makeSeedEntry({ images: [{ ...seedRico[0].images[0] }] })];
  const deviceStale = makeDevice(cloud, { seed: seedStale });
  await deviceStale.boot();
  assert.equal(cloud.peekRevision(), revisionAntes, 'o boot sozinho (sem edição própria ainda) não pode ter publicado nada');

  // AGORA o usuário adiciona uma imagem própria de verdade (equivalente a
  // "local 109 com 1 exclusivo") — caminho real: mutar DATA + device.save()
  // (chama saveData() real, que marca dirty e publica). É isto, não o
  // conteúdo já vir "de fábrica" no catálogo, que ALTERAÇÃO 072 exige para
  // considerar uma publicação necessária.
  const entryComEdicao = deviceStale.context.DATA.find((e) => e.id === 'seed_1');
  entryComEdicao.images.push(img({ publicId: 'atlas-radiologico/exclusiva-local', assetId: 'EXCLUSIVA' }));
  entryComEdicao._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceStale.context.markPendingLocalImageAdds(entryComEdicao.id, [], [entryComEdicao.images[entryComEdicao.images.length - 1]]); await deviceStale.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceStale.save();

  const entryStale = deviceStale.context.DATA.find((e) => e.id === 'seed_1');
  const idsLocal = new Set(entryStale.images.map((i) => i.publicId));
  assert.deepEqual(idsLocal, new Set(['atlas-radiologico/1', 'atlas-radiologico/2', 'atlas-radiologico/exclusiva-local']), 'local precisa terminar com a união completa (as duas da nuvem + a própria)');

  // Exatamente UMA escrita a mais além da linha de base (o save da imagem
  // exclusiva) — o boot puro logo acima não gastou nenhuma.
  assert.equal(cloud.peekRevision() - revisionAntes, 1, 'só o save real precisa gastar exatamente UMA escrita');

  // A nuvem final também precisa refletir a união (verificado por um
  // terceiro dispositivo independente).
  const cloudCheck = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await cloudCheck.boot();
  const idsCloud = new Set(cloudCheck.context.DATA.find((e) => e.id === 'seed_1').images.map((i) => i.publicId));
  assert.deepEqual(idsCloud, new Set(['atlas-radiologico/1', 'atlas-radiologico/2', 'atlas-radiologico/exclusiva-local']));
});

test('BOOT ZERO WRITES MESMO COM CONFLITOS DE OWNERSHIP: dispositivo stale sem edição própria não publica nada, mesmo quando o pull encontra imagens bloqueadas por etiqueta divergente', async () => {
  // Cenário exato do relatório manual: cloud=120/local=110 com 10 imagens
  // bloqueadas por ownership — precisa dar EXATAMENTE zero escritas no boot,
  // não "quase zero" ou "zero só quando não há conflito".
  const cloud = makeFakeCloud();
  const seedRico = [makeSeedEntry({
    images: [
      img({ publicId: 'atlas-radiologico/normal-1' }),
      img({ publicId: 'atlas-radiologico/normal-2' }),
      // Donos divergentes em formato NÃO-histórico: bloqueio puro (desde a
      // 072b, etiqueta legada seed_N segura seria normalizada e adotada —
      // ver testes '072b PULL REAL' — então este teste usa donos que NUNCA
      // normalizam, para provar zero writes mesmo com bloqueios reais).
      img({ publicId: 'atlas-radiologico/legacy-1', assetId: 'LEG1', lesionId: 'u_outra_999', lesionName: 'Outra' }),
      img({ publicId: 'atlas-radiologico/legacy-2', assetId: 'LEG2', lesionId: 'u_outra_998', lesionName: 'Outra 2' })
    ]
  })];
  const deviceRico = makeDevice(cloud, { seed: seedRico });
  await deviceRico.markDirty();
  await deviceRico.boot();
  const revisionAntes = cloud.peekRevision();

  // PC stale: só conhece as 2 imagens "normais", sem nenhuma edição própria.
  const seedStale = [makeSeedEntry({ images: [{ ...seedRico[0].images[0] }, { ...seedRico[0].images[1] }] })];
  const deviceStale = makeDevice(cloud, { seed: seedStale });
  await deviceStale.boot();

  const entryStale = deviceStale.context.DATA.find((e) => e.id === 'seed_1');
  // As duas normais chegam; as duas com etiqueta divergente ficam de fora
  // (bloqueadas por ownership) — mas isso não pode, por si só, gerar
  // NENHUMA escrita: o dispositivo não tem nada de SEU pra publicar.
  assert.equal(entryStale.images.length, 2, 'só as imagens sem conflito de ownership são adotadas');
  assert.equal(cloud.peekRevision(), revisionAntes, 'boot sem edição própria não pode publicar nada, mesmo com conflitos de ownership bloqueados');
});

test('DIRTY SOBREVIVE A RELOAD: edição real feita offline continua marcada após reabrir, e só é confirmada (dirty=false) depois do push realmente aceito', async () => {
  const cloud = makeFakeCloud();
  const seedInicial = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/base' })] })];
  const seedBoot = makeDevice(cloud, { seed: seedInicial });
  await seedBoot.markDirty();
  await seedBoot.boot();

  // Dispositivo que vai editar OFFLINE: primeiro um boot normal (recebe o
  // estado atual), depois simula estar sem rede (fbDb=null) quando edita.
  const device = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedInicial)) });
  await device.boot();
  device.context.fbDb = null; // offline
  const entryOffline = device.context.DATA.find((e) => e.id === 'seed_1');
  entryOffline.images.push(img({ publicId: 'atlas-radiologico/offline-edit', assetId: 'OFFLINE' }));
  entryOffline._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  device.context.markPendingLocalImageAdds(entryOffline.id, [], [entryOffline.images[entryOffline.images.length - 1]]); await device.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await device.save(); // saveData() real: marca dirty, tenta publicar (falha por estar offline)

  assert.equal(device.context.syncDirty, true, 'a edição real precisa continuar marcada como dirty enquanto não for confirmada na nuvem');
  assert.equal(cloud.peekLesionCount(), 1, 'nada pode ter chegado na nuvem enquanto offline');

  // "Reabre" o MESMO dispositivo — chama loadData() de novo no mesmo
  // `context`/`storage` (o mesmo padrão já usado no teste SYNC REPETIDO
  // acima), simulando um F5/reconexão. Conexão "volta" (fbDb restaurado)
  // antes do reload, como aconteceria na prática.
  device.context.fbDb = { runTransaction: cloud.runTransaction };
  device.context.appStateReady = false; // loadData() reseta isto normalmente no boot real
  await device.boot();

  assert.equal(device.context.syncDirty, false, 'depois do push confirmado no reload, dirty precisa voltar a false');
  const finalEntry = device.context.DATA.find((e) => e.id === 'seed_1');
  const finalIds = new Set(finalEntry.images.map((i) => i.assetId || i.publicId));
  assert.ok([...finalIds].some((k) => String(k).includes('OFFLINE') || String(k).includes('offline-edit')), 'a edição feita offline precisa ter sido publicada no reload seguinte');

  // A nuvem final também precisa refletir a edição (terceiro dispositivo independente).
  const cloudCheck = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await cloudCheck.boot();
  const cloudEntry = cloudCheck.context.DATA.find((e) => e.id === 'seed_1');
  assert.ok(cloudEntry.images.some((i) => i.assetId === 'OFFLINE'), 'a nuvem precisa ter recebido a edição feita offline assim que a reconexão aconteceu');
});

test('OWNERSHIP: identidade das imagens (assetId, lesionId, lesionName) sobrevive ao round-trip entre dois dispositivos', async () => {
  const cloud = makeFakeCloud();
  const seedA = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/1', assetId: 'A1', lesionId: 'seed_1', lesionName: 'Lesão 1' })] })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot();

  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await deviceB.boot();

  const imgB = deviceB.context.DATA.find(e => e.id === 'seed_1').images[0];
  assert.equal(imgB.assetId, 'A1');
  assert.equal(imgB.lesionId, 'seed_1');
  assert.equal(imgB.lesionName, 'Lesão 1');
  assert.equal(imgB.publicId, 'atlas-radiologico/1');
});

test('OFFLINE NO BOOT: nuvem indisponível (fbDb ausente) não trava o boot nem perde o estado local', async () => {
  const cloud = makeFakeCloud();
  const seed = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/local-only' })] })];
  const device = makeDevice(cloud, { seed });
  device.context.fbDb = null; // simula Firebase indisponível/offline

  let renderCalled = false;
  device.context.renderAll = () => { renderCalled = true; };

  await device.boot(); // não pode lançar/travar

  assert.equal(renderCalled, true, 'o boot precisa terminar e desenhar a UI mesmo sem nuvem disponível');
  const entry = device.context.DATA.find(e => e.id === 'seed_1');
  assert.equal(entry.images.length, 1, 'o estado local precisa ser preservado quando a nuvem está indisponível');
  assert.equal(entry.images[0].publicId, 'atlas-radiologico/local-only');
});

// ===========================================================================
// AUDITORIA DE IDENTIDADE DE IMAGENS (ALTERAÇÃO 069) — funções puras,
// read-only, pedidas para confirmar se um conjunto de imagens "exclusivas"
// de um lado (local ou nuvem) são distintas de verdade ou duplicatas.
// ===========================================================================

function makeIdentityContext() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    stableKeyFn.source + '\n' + identityKeysFn.source + '\n' +
    imageIdentityDivergenceForEntryFn.source + '\n' + buildImageIdentityDivergenceReportFn.source,
    ctx, { filename: 'identity-divergence.js' }
  );
  return ctx;
}

test('IDENTIDADE: imagem só local, só nuvem e presente nos dois lados são classificadas corretamente', () => {
  const ctx = makeIdentityContext();
  const localImgs = [img({ publicId: 'atlas-radiologico/shared' }), img({ publicId: 'atlas-radiologico/local-only' })];
  const remoteImgs = [img({ publicId: 'atlas-radiologico/shared' }), img({ publicId: 'atlas-radiologico/remote-only' })];
  const div = ctx.imageIdentityDivergenceForEntry(localImgs, remoteImgs);
  assert.equal(div.localOnly.length, 1);
  assert.equal(div.remoteOnly.length, 1);
  assert.equal(div.both.length, 1);
  assert.equal(div.localDuplicates.length, 0);
  assert.equal(div.remoteDuplicates.length, 0);
});

test('IDENTIDADE: duplicata exata (mesma imagem 2x do MESMO lado) é reportada como duplicata, não como duas exclusivas', () => {
  const ctx = makeIdentityContext();
  const dup = img({ publicId: 'atlas-radiologico/dup', assetId: 'D1' });
  const localImgs = [dup, { ...dup }]; // mesma identidade estável, duas entradas
  const div = ctx.imageIdentityDivergenceForEntry(localImgs, []);
  assert.equal(div.localDuplicates.length, 1);
  assert.equal(div.localDuplicates[0].count, 2);
  assert.equal(div.localOnly.length, 1, 'a identidade só conta uma vez como "só local", não duas');
});

// ===========================================================================
// NORMALIZAÇÃO SEGURA DE ETIQUETA LEGADA (ALTERAÇÃO 072) — casos reais:
// seed_8→seed_7, seed_11→seed_10, seed_21→seed_18, seed_413→seed_404,
// seed_414→seed_405, seed_477→seed_464. Reescreve SÓ img.lesionId, SÓ com
// as 6 condições provadas; registra legacy_image_owner_label_normalized.
// Conflito real (duas lesões atuais) continua BLOQUEADO; nada é automático
// no app (função de console/manutenção).
// ===========================================================================

function makeLegacyCtx() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    stableKeyFn.source + '\n' + identityKeysFn.source + '\n' + imageOwnerIdFn.source + '\n' +
    'const IMAGE_OWNERSHIP_CONFLICTS = [];\n' +
    registerConflictFn.source + '\n' +
    legacyHoldersFn.source + '\n' +
    tryNormalizeFn.source + '\n' +
    normalizeLegacyOwnerFn.source + '\n' +
    'this.__api = { normalizeLegacyImageOwnerLabel, IMAGE_OWNERSHIP_CONFLICTS };',
    ctx, { filename: 'legacy-owner-normalize.js' }
  );
  return ctx.__api;
}

function legacyCatalog(targetId, ownerId, assetId, extraLesions) {
  const target = {
    id: targetId, name: 'Alvo', s: 'S', site: 'T',
    images: [{ assetId, publicId: 'atlas-radiologico/' + assetId, data: 'https://x/' + assetId + '.jpg', lesionId: ownerId, lesionName: 'Antiga' }]
  };
  return [target].concat(extraLesions || []);
}

test('D. LEGACY OWNER LABEL: os 6 pares reais normalizam (só lesionId, sem mover array)', () => {
  const pairs = [
    ['seed_7', 'seed_8'], ['seed_10', 'seed_11'], ['seed_18', 'seed_21'],
    ['seed_404', 'seed_413'], ['seed_405', 'seed_414'], ['seed_464', 'seed_477']
  ];
  for (const [targetId, ownerId] of pairs) {
    const api = makeLegacyCtx();
    const catalog = legacyCatalog(targetId, ownerId, 'ASSET-' + targetId);
    const before = JSON.stringify(catalog[0].images.map((i) => i.data));
    const r = api.normalizeLegacyImageOwnerLabel(catalog[0], catalog);
    assert.equal(r.ok, true, targetId);
    assert.equal(r.normalized.length, 1, targetId);
    assert.equal(r.normalized[0].from, ownerId, targetId);
    assert.equal(r.normalized[0].to, targetId, targetId);
    assert.equal(catalog[0].images[0].lesionId, targetId, targetId + ' continua na mesma lesão, só a etiqueta muda');
    assert.equal(JSON.stringify(catalog[0].images.map((i) => i.data)), before, targetId + ': array intacto');
    assert.equal(catalog.length, 1, targetId + ': nenhuma lesão criada/removida');
    const regs = JSON.parse(JSON.stringify(api.IMAGE_OWNERSHIP_CONFLICTS));
    assert.equal(regs.length, 1, targetId);
    assert.equal(regs[0].kind, 'legacy_image_owner_label_normalized', targetId);
  }
});

test('D. LEGACY: sem assetId/publicId não normaliza (identidade fraca)', () => {
  const api = makeLegacyCtx();
  const catalog = [{
    id: 'seed_7', name: 'Alvo', s: 'S', site: 'T',
    images: [{ data: 'https://x/solta.jpg', lesionId: 'seed_8', lesionName: 'Antiga' }]
  }];
  const r = api.normalizeLegacyImageOwnerLabel(catalog[0], catalog);
  assert.equal(r.ok, true);
  assert.equal(r.normalized.length, 0);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /assetId/);
  assert.equal(catalog[0].images[0].lesionId, 'seed_8', 'etiqueta intacta');
});

test('D. LEGACY: dono divergente que NÃO é seed_N histórico não normaliza', () => {
  const api = makeLegacyCtx();
  const catalog = legacyCatalog('seed_7', 'u_usuario_123', 'ASSET-X');
  const r = api.normalizeLegacyImageOwnerLabel(catalog[0], catalog);
  assert.equal(r.ok, true);
  assert.equal(r.normalized.length, 0);
  assert.match(r.skipped[0].reason, /seed_N/);
  assert.equal(catalog[0].images[0].lesionId, 'u_usuario_123');
});

test('D. LEGACY: etiqueta já correta ou ausente não faz nada', () => {
  const api = makeLegacyCtx();
  const catalog = [{
    id: 'seed_7', name: 'Alvo', s: 'S', site: 'T',
    images: [
      { assetId: 'OK', publicId: 'atlas-radiologico/ok', data: 'https://x/ok.jpg', lesionId: 'seed_7' },
      { assetId: 'NO', publicId: 'atlas-radiologico/no', data: 'https://x/no.jpg' }
    ]
  }];
  const r = api.normalizeLegacyImageOwnerLabel(catalog[0], catalog);
  assert.equal(r.ok, true);
  assert.equal(r.normalized.length, 0);
  assert.equal(r.skipped.length, 0);
});

test('D. LEGACY: alvo inválido aborta sem tocar em nada', () => {
  const api = makeLegacyCtx();
  for (const bad of [null, undefined, {}, { id: 123 }, { id: '' }]) {
    const r = api.normalizeLegacyImageOwnerLabel(bad, []);
    assert.equal(r.ok, false);
    assert.equal(r.normalized.length, 0);
  }
});

test('E. CONFLITO REAL via normalize: mesma identidade em duas lesões atuais NÃO normaliza (bloqueado)', () => {
  const api = makeLegacyCtx();
  const shared = { assetId: 'SHARED', publicId: 'atlas-radiologico/shared', data: 'https://x/shared.jpg', lesionId: 'seed_8', lesionName: 'Outra' };
  const catalog = [
    { id: 'seed_7', name: 'Alvo', s: 'S', site: 'T', images: [{ ...shared }] },
    { id: 'seed_9', name: 'Outra atual', s: 'S', site: 'T', images: [{ ...shared, lesionId: 'seed_9' }] }
  ];
  const r = api.normalizeLegacyImageOwnerLabel(catalog[0], catalog);
  assert.equal(r.ok, true);
  assert.equal(r.normalized.length, 0, 'conflito real: nada normalizado');
  assert.match(r.skipped[0].reason, /outra lesão atual/);
  assert.equal(catalog[0].images[0].lesionId, 'seed_8', 'etiqueta intacta');
  assert.equal(catalog[1].images[0].lesionId, 'seed_9', 'outra lesão intacta');
});

test('E. canChangeImageOwnership NÃO foi relaxado: sem contexto manual, continua bloqueando', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    imageOwnerIdFn.source + '\nconst IMAGE_OWNERSHIP_MANUAL = { manual:true };\n' + canChangeOwnershipFn.source +
    '\nthis.__c = { canChangeImageOwnership };',
    ctx, { filename: 'ownership-gate.js' }
  );
  const img = { lesionId: 'seed_8' };
  assert.equal(ctx.__c.canChangeImageOwnership(img, 'seed_7', null), false);
  assert.equal(ctx.__c.canChangeImageOwnership(img, 'seed_7', {}), false);
  assert.equal(ctx.__c.canChangeImageOwnership(img, 'seed_7', { manual: false }), false);
  assert.equal(ctx.__c.canChangeImageOwnership(img, 'seed_7', { manual: true }), true, 'só manual explícito libera');
  assert.equal(ctx.__c.canChangeImageOwnership(img, 'seed_8', null), true, 'mesmo dono sempre liberado');
});

test('IDENTIDADE: buildImageIdentityDivergenceReport soma por catálogo inteiro e só lista lesões com divergência real', () => {
  const ctx = makeIdentityContext();
  const localData = [
    { id: 'seed_1', name: 'Lesão 1', images: [img({ publicId: 'atlas-radiologico/only-local-1' })] },
    { id: 'seed_2', name: 'Lesão 2', images: [img({ publicId: 'atlas-radiologico/same' })] }
  ];
  const remoteData = [
    { id: 'seed_2', name: 'Lesão 2', images: [img({ publicId: 'atlas-radiologico/same' })] },
    { id: 'seed_3', name: 'Lesão 3', images: [img({ publicId: 'atlas-radiologico/only-remote-3' })] }
  ];
  const report = ctx.buildImageIdentityDivergenceReport(localData, remoteData);
  assert.equal(report.totals.localOnly, 1);
  assert.equal(report.totals.remoteOnly, 1);
  assert.equal(report.totals.both, 1);
  // seed_2 é idêntica nos dois lados — não pode aparecer na lista de
  // divergências. JSON.parse(JSON.stringify(...)) normaliza o array (criado
  // DENTRO do vm, outro realm) antes da comparação — deepEqual falha por
  // prototype cross-realm mesmo com o mesmo conteúdo (mesmo padrão usado em
  // device-bootstrap.test.js).
  const ids = JSON.parse(JSON.stringify(report.perLesion.map((p) => p.id))).sort();
  assert.deepEqual(ids, ['seed_1', 'seed_3']);
});

// ===========================================================================
// 072b — NORMALIZAÇÃO NO PULL, COM O MERGE REAL (syncFromFirebase de
// verdade, dois dispositivos, nuvem falsa): a etiqueta legada segura é
// normalizada DENTRO do pull e a imagem é adotada normalmente. Os 6 pares
// reais + 1 par SINTÉTICO (seed_900→seed_901, que nunca existiu) passam
// pelo MESMO caminho — prova que a decisão é estrutural, sem hardcode.
// ===========================================================================

function legacyPairEntry(targetId, ownerId) {
  return {
    id: targetId, name: 'Alvo ' + targetId, s: 'Seção', site: 'Sítio',
    images: [
      {
        data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/LEG-' + targetId + '.jpg',
        publicId: 'atlas-radiologico/LEG-' + targetId,
        assetId: 'LEG-' + targetId,
        lesionId: ownerId, lesionName: 'Nome antigo',
        assignedAt: '2026-08-01T10:00:00.000Z'
      },
      img({ publicId: 'atlas-radiologico/OK-' + targetId, assetId: 'OK-' + targetId, lesionId: targetId, lesionName: 'Alvo ' + targetId })
    ],
    links: [], inc: 1
  };
}

function deviceOwnershipEvents(device) {
  return JSON.parse(vm.runInContext('JSON.stringify(IMAGE_OWNERSHIP_CONFLICTS)', device.context));
}

test('072b PULL REAL: 6 pares legados + 1 sintético normalizam no merge e são adotados, com ZERO writes (dirty=false)', async () => {
  const pairs = [
    ['seed_7', 'seed_8'], ['seed_10', 'seed_11'], ['seed_18', 'seed_21'],
    ['seed_404', 'seed_413'], ['seed_405', 'seed_414'], ['seed_464', 'seed_477'],
    ['seed_901', 'seed_900'] // sintético: nunca existiu — decisão estrutural, sem hardcode
  ];
  for (const [targetId, ownerId] of pairs) {
    const cloud = makeFakeCloud();
    // EDGE/nuvem: a lesão-alvo COM a imagem de etiqueta legada (+ 1 normal).
    const deviceA = makeDevice(cloud, { seed: [legacyPairEntry(targetId, ownerId)] });
    await deviceA.markDirty(); // simula a edição real que colocou isso na nuvem
    await deviceA.boot(); // popula a nuvem
    assert.equal(cloud.peekLesionCount(), 1, targetId + ': nuvem populada');
    const revBefore = cloud.peekRevision();

    // CHROME stale: conhece a lesão, mas SEM a imagem legada.
    const staleEntry = legacyPairEntry(targetId, ownerId);
    staleEntry.images = [staleEntry.images[1]]; // só a normal
    const deviceB = makeDevice(cloud, { seed: [staleEntry] });
    await deviceB.boot();

    const entryB = deviceB.context.DATA.find((e) => e.id === targetId);
    assert.equal(entryB.images.length, 2, targetId + ': imagem legada incorporada no pull');
    const got = entryB.images.find((i) => i.assetId === 'LEG-' + targetId);
    assert.ok(got, targetId + ': imagem presente');
    assert.equal(got.lesionId, targetId, targetId + ': APENAS o lesionId normalizado');
    assert.equal(got.lesionName, 'Nome antigo', targetId + ': lesionName intacto');
    assert.equal(got.publicId, 'atlas-radiologico/LEG-' + targetId, targetId + ': resto intacto');
    const normalized = deviceOwnershipEvents(deviceB).filter((e) => e.kind === 'legacy_image_owner_label_normalized');
    assert.equal(normalized.length, 1, targetId + ': evento registrado');
    assert.equal(normalized[0].fromLesionId, ownerId, targetId);
    assert.equal(normalized[0].toLesionId, targetId, targetId);
    assert.equal(cloud.peekRevision(), revBefore, targetId + ': revisão da nuvem intacta (ZERO writes)');
    assert.equal(deviceB.context.syncDirty, false, targetId + ': boot não sujou');

    // Segundo boot: estável — sem duplicar, sem publicar, sem re-registrar.
    await deviceB.boot();
    const entryB2 = deviceB.context.DATA.find((e) => e.id === targetId);
    assert.equal(entryB2.images.length, 2, targetId + ': segundo boot estável');
    assert.equal(cloud.peekRevision(), revBefore, targetId + ': segue sem writes');
  }
});

test('072b PULL REAL: mesma imagem em outra lesão atual continua BLOQUEADA (sem normalização, sem adoção, ZERO writes)', async () => {
  const cloud = makeFakeCloud();
  const deviceA = makeDevice(cloud, { seed: [legacyPairEntry('seed_7', 'seed_8')] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBefore = cloud.peekRevision();

  // Chrome: seed_7 SEM a imagem, mas seed_9 JÁ contém o MESMO asset.
  const local7 = legacyPairEntry('seed_7', 'seed_8');
  local7.images = [local7.images[1]];
  const clash = {
    id: 'seed_9', name: 'Outra', s: 'Seção', site: 'Sítio',
    images: [{
      data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/LEG-seed_7.jpg',
      publicId: 'atlas-radiologico/LEG-seed_7', assetId: 'LEG-seed_7',
      lesionId: 'seed_9', lesionName: 'Outra', assignedAt: '2026-08-01T10:00:00.000Z'
    }],
    links: [], inc: 1
  };
  const deviceB = makeDevice(cloud, { seed: [local7, clash] });
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_7');
  assert.equal(entryB.images.length, 1, 'imagem bloqueada: não adotada em seed_7');
  const events = deviceOwnershipEvents(deviceB);
  assert.equal(events.filter((e) => e.kind === 'legacy_image_owner_label_normalized').length, 0, 'nenhuma normalização automática em conflito real');
  assert.ok(events.some((e) => e.kind === 'image_merge_ownership_conflict_blocked'), 'bloqueio registrado como sempre');
  const other = deviceB.context.DATA.find((e) => e.id === 'seed_9');
  assert.equal(other.images.length, 1, 'outra lesão intacta');
  assert.equal(other.images[0].lesionId, 'seed_9', 'etiqueta da outra lesão intacta');
  assert.equal(cloud.peekRevision(), revBefore, 'ZERO writes');
  assert.equal(deviceB.context.syncDirty, false, 'boot não sujou');
});

test('072b PUSH inalterado: merge local→nuvem NÃO normaliza (bloqueio puro, como antes)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    stableKeyFn.source + '\n' + identityKeysFn.source + '\n' + imageOwnerIdFn.source + '\n' +
    'const IMAGE_OWNERSHIP_CONFLICTS = [];\n' +
    registerConflictFn.source + '\n' +
    canChangeOwnershipFn.source + '\n' +
    'let PULL_IMAGE_OWNERSHIP_CONFLICTS = [];\n' +
    'let PUSH_IMAGE_OWNERSHIP_CONFLICTS = [];\n' +
    'function adoptOldestAssignedAt(){};\n' +
    'function unionClinicalCases(a){ return Array.isArray(a) ? a : []; };\n' +
    dedupeFn.source + '\n' +
    legacyHoldersFn.source + '\n' +
    tryNormalizeFn.source + '\n' +
    unionFn.source + '\n' +
    mergeEntryNonDestructiveFn.source + '\n' +
    mergeForPushFn.source + '\n' +
    'this.__api = { mergeEntryForImagePush, IMAGE_OWNERSHIP_CONFLICTS, PUSH_IMAGE_OWNERSHIP_CONFLICTS };',
    ctx, { filename: 'push-scope.js' }
  );
  const local = legacyPairEntry('seed_7', 'seed_8'); // local TEM a imagem legada
  const remoteLESS = { id: 'seed_7', name: 'Alvo seed_7', s: 'Seção', site: 'Sítio', images: [local.images[1]], links: [], inc: 1 };
  const merged = ctx.__api.mergeEntryForImagePush(
    JSON.parse(JSON.stringify(local)), JSON.parse(JSON.stringify(remoteLESS))
  );
  const plain = JSON.parse(JSON.stringify(merged));
  assert.equal(plain.images.length, 1, 'push não adota a imagem legada sozinho');
  assert.equal(plain.images[0].assetId, 'OK-seed_7');
  const events = JSON.parse(JSON.stringify(ctx.__api.IMAGE_OWNERSHIP_CONFLICTS));
  assert.equal(events.filter((e) => e.kind === 'legacy_image_owner_label_normalized').length, 0, 'push nunca normaliza');
  assert.ok(events.some((e) => e.kind === 'image_merge_ownership_conflict_blocked'), 'push mantém o bloqueio puro');
});

test('072b ESCOPO estático: só o pull (syncFromFirebase) repassa catálogo ao merge; push/recuperação nem conhecem o parâmetro', () => {
  const pushFn = extractFunction(html, 'mergeEntryForImagePush');
  assert.doesNotMatch(pushFn.source, /legacyCatalog/, 'push não repassa catálogo');
  const recFn = extractFunction(html, 'mergeRecoverableIntoMap');
  assert.doesNotMatch(recFn.source, /legacyCatalog/, 'recuperação não repassa catálogo');
  const calls = [...html.matchAll(/mergeEntryNonDestructive\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((a) => !a.startsWith('localEntry')); // fora a declaração
  const withCatalog = calls.filter((a) => a.split(',').length >= 3);
  assert.deepEqual(withCatalog, ['l,r,localData,IMAGE_TOMBSTONES,true'], 'só o syncFromFirebase (pull) repassa catálogo + tombstones');
});

// ===========================================================================
// 072c — FALSO POSITIVO DO CASO REAL (Chrome 118/120, Abscesso seed_10):
// 2 assets com etiqueta legada seed_11 foram bloqueados como "conflito"
// embora o MESMO asset não exista em nenhuma outra lesão — o helper
// considerava QUALQUER chave parcial (publicId/URL) compartilhada com um
// asset DIFERENTE fisicamente presente em outra lesão (ex.: re-upload com
// mesmo publicId) como conflito real. A noção correta é a do próprio
// projeto: stable key única (a mesma do auditor/diagnóstico).
// ===========================================================================

function abscessoEntry(id, images) {
  return { id, name: 'Abscesso cerebral', s: 'Seção', site: 'Sítio', images, links: [], inc: 1 };
}

function cloudAsset(assetId, publicId, ownerId) {
  return {
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/' + publicId + '.jpg',
    publicId, assetId, lesionId: ownerId, lesionName: 'Nome antigo',
    assignedAt: '2026-08-01T10:00:00.000Z'
  };
}

test('072c PULL REAL: asset DIFERENTE com mesmo publicId em seed_11 NÃO é conflito — normaliza e adota (padrão exato do caso 118/120)', async () => {
  const cloud = makeFakeCloud();
  // Nuvem seed_10 com o asset novo (etiqueta legada seed_11) + 1 normal.
  const remoteX = cloudAsset('48266481f0c336b5932d5e1116a5add1', 'atlas-radiologico/REUP', 'seed_11');
  const remoteOK = img({ publicId: 'atlas-radiologico/ABS-OK', assetId: 'ABS-OK', lesionId: 'seed_10', lesionName: 'Abscesso cerebral' });
  const deviceA = makeDevice(cloud, { seed: [abscessoEntry('seed_10', [remoteX, remoteOK])] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBefore = cloud.peekRevision();

  // Chrome: seed_10 SEM o asset novo; seed_11 contém OUTRO asset (cópia
  // antiga, re-upload com o MESMO publicId, etiqueta correta seed_11).
  const oldCopy = cloudAsset('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'atlas-radiologico/REUP', 'seed_11');
  const deviceB = makeDevice(cloud, { seed: [abscessoEntry('seed_10', [{ ...remoteOK }]), abscessoEntry('seed_11', [oldCopy])] });
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_10');
  assert.equal(entryB.images.length, 2, 'asset novo adotado em seed_10 (não é o mesmo asset da seed_11)');
  const got = entryB.images.find((i) => i.assetId === '48266481f0c336b5932d5e1116a5add1');
  assert.ok(got, 'asset presente');
  assert.equal(got.lesionId, 'seed_10', 'só o lesionId normalizado');
  const events = deviceOwnershipEvents(deviceB);
  assert.equal(events.filter((e) => e.kind === 'legacy_image_owner_label_normalized').length, 1, 'evento de normalização registrado');
  assert.equal(deviceB.context.DATA.find((e) => e.id === 'seed_11').images.length, 1, 'seed_11 intacta (cópia antiga preservada lá)');
  assert.equal(cloud.peekRevision(), revBefore, 'ZERO writes');
  assert.equal(deviceB.context.syncDirty, false, 'boot não sujou');
});

test('072c PULL REAL: MESMO asset fisicamente em seed_11 continua BLOQUEADO (conflito real, sem normalização)', async () => {
  const cloud = makeFakeCloud();
  const remoteX = cloudAsset('1f173ab3e75da101bd7a04d3f05b2ba1', 'atlas-radiologico/REAL', 'seed_11');
  const deviceA = makeDevice(cloud, { seed: [abscessoEntry('seed_10', [remoteX])] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBefore = cloud.peekRevision();

  // Chrome: seed_10 sem o asset; seed_11 contém FISICAMENTE O MESMO asset.
  const sameAsset = cloudAsset('1f173ab3e75da101bd7a04d3f05b2ba1', 'atlas-radiologico/REAL', 'seed_11');
  const deviceB = makeDevice(cloud, { seed: [abscessoEntry('seed_10', []), abscessoEntry('seed_11', [sameAsset])] });
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_10');
  assert.equal(entryB.images.length, 0, 'mesmo asset em duas lesões: bloqueado, não adotado');
  const events = deviceOwnershipEvents(deviceB);
  assert.equal(events.filter((e) => e.kind === 'legacy_image_owner_label_normalized').length, 0, 'nenhuma normalização em conflito real');
  const blocked = events.filter((e) => e.kind === 'image_merge_ownership_conflict_blocked');
  assert.ok(blocked.length >= 1, 'bloqueio registrado como sempre');
  assert.ok((blocked[0].conflictingHolders || []).includes('seed_11'), 'evento informa exatamente qual lesão detém o asset');
  assert.equal(cloud.peekRevision(), revBefore, 'ZERO writes');
  assert.equal(deviceB.context.syncDirty, false, 'boot não sujou');
});

// ===========================================================================
// ALTERAÇÃO 073 (2026-09-23) — TOMBSTONES DE IMAGEM EXCLUÍDA. O merge é
// aditivo: ausência simples na nuvem NUNCA apaga local. Só um tombstone
// explícito (exclusão confirmada pelo usuário) remove do outro lado.
// Motor acima roda as funções REAIS (record/merge/apply/load/save/sweep +
// syncFromFirebase/writeShardedState/loadData reais).
// ===========================================================================

// Simula a exclusão EXPLÍCITA do usuário no dispositivo: calcula a chave
// ANTES de remover (função real), remove a referência, persiste o
// tombstone. O save/push posterior leva tudo à nuvem pelo fluxo seguro.
async function explicitDelete(device, lesionId, matchFn) {
  const entry = device.context.DATA.find((e) => e.id === lesionId);
  assert.ok(entry, 'fixture: lesão precisa existir');
  const idx = entry.images.findIndex(matchFn);
  assert.ok(idx !== -1, 'fixture: imagem X precisa existir antes de excluir');
  const key = await device.context.stableImageKeyV208(JSON.parse(JSON.stringify(entry.images[idx])));
  const rec = await device.context.recordImageTombstone(JSON.parse(JSON.stringify(entry.images[idx])), lesionId);
  assert.ok(rec && rec.key === key, 'tombstone registrado para a identidade correta');
  entry.images.splice(idx, 1);
  await device.context.saveImageTombstones();
  return key;
}

function deviceTombstones(device) {
  return JSON.parse(vm.runInContext('JSON.stringify(IMAGE_TOMBSTONES)', device.context));
}

function deviceImagesByAsset(device, lesionId) {
  const entry = device.context.DATA.find((e) => e.id === lesionId);
  return new Set((entry.images || []).map((i) => i.assetId));
}

test('073 DELETE ENTRE PCS: A exclui X → tombstone na nuvem → B remove X no pull, sem reintroduzir; todos convergem', async () => {
  const cloud = makeFakeCloud();
  const seedX = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' }), img({ publicId: 'atlas-radiologico/KEEP', assetId: 'KEEP' })] })];
  const deviceA = makeDevice(cloud, { seed: seedX });
  await deviceA.markDirty();
  await deviceA.boot(); // nuvem com X + KEEP
  const deviceB = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedX)) });
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['X', 'KEEP']));

  // A exclui X explicitamente e salva (fluxo real: tombstone + dirty + push).
  const keyX = await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();
  assert.deepEqual(deviceImagesByAsset(deviceA, 'seed_1'), new Set(['KEEP']));
  assert.ok(deviceTombstones(deviceA)[scopedKey(deviceA, 'seed_1', keyX)], 'tombstone persiste em A');

  // Nuvem: X sumiu, tombstone presente (verificado por 3º dispositivo limpo).
  const deviceC = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(['KEEP']), 'nuvem sem X');
  assert.ok(deviceTombstones(deviceC)[scopedKey(deviceC, 'seed_1', keyX)], 'nuvem carrega o tombstone');

  // B ainda tem X → pull remove, sem reintroduzir; segundo boot idempotente.
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['KEEP']), 'B removeu X no pull');
  assert.ok(deviceTombstones(deviceB)[scopedKey(deviceB, 'seed_1', keyX)], 'B adotou o tombstone');
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['KEEP']), 'sem ressurreição no boot seguinte');
  assert.deepEqual(deviceImagesByAsset(deviceA, 'seed_1'), new Set(['KEEP']), 'A convergido');
});

test('073 PC STALE: B semanas desatualizado com X volta e remove X pelo tombstone (zero ressurreição)', async () => {
  const cloud = makeFakeCloud();
  const seedX = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })];
  const deviceA = makeDevice(cloud, { seed: seedX });
  await deviceA.markDirty();
  await deviceA.boot();
  // B inicializado há semanas com X, sem nenhum boot desde então.
  const deviceB = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedX)) });

  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();

  // B volta agora: primeiro boot já remove X e adota o tombstone.
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'stale remove X no primeiro pull');
  assert.equal(Object.keys(deviceTombstones(deviceB)).length, 1, 'tombstone adotado');
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'X não volta nunca');
});

test('073 CONCORRÊNCIA: A exclui X enquanto B adiciona Y — X continua excluída, Y preservada', async () => {
  const cloud = makeFakeCloud();
  const seedX = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })];
  const deviceA = makeDevice(cloud, { seed: seedX });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBase = cloud.peekRevision();
  // B desatualizado (revisão antiga conhecida) com X.
  const deviceB = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedX)) });
  await deviceB.boot();

  // A exclui X e publica (revisão avança).
  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();
  assert.ok(cloud.peekRevision() > revBase, 'push de A confirmado');

  // B, ainda com a revisão antiga, adiciona Y e salva: a escrita direta
  // seria recusada pela barreira de revisão; o retry reconcilia (puxa o
  // tombstone, remove X, mantém Y) e só então escreve a união.
  const entryB1 = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  entryB1.images.push(img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' }));
  entryB1._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceB.context.markPendingLocalImageAdds(entryB1.id, [], [entryB1.images[entryB1.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();

  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['Y']), 'B: X fora, Y dentro');
  const deviceC = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(['Y']), 'nuvem: X excluída, Y preservada (sem overwrite do stale)');
  assert.equal(Object.keys(deviceTombstones(deviceC)).length, 1, 'tombstone sobreviveu à escrita concorrente (sem wipe)');
});

test('073 AUSÊNCIA SEM TOMBSTONE: cloud sem X + local com X, sem tombstone → NÃO apaga, ZERO writes', async () => {
  const cloud = makeFakeCloud();
  // Nuvem só com KEEP.
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/KEEP', assetId: 'KEEP' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBase = cloud.peekRevision();
  // B tem KEEP + X local (sem nenhum tombstone em lugar nenhum).
  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/KEEP', assetId: 'KEEP' }), img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })] });
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['KEEP', 'X']), 'ausência simples NUNCA apaga local');
  assert.equal(cloud.peekRevision(), revBase, 'ZERO writes no boot sem tombstone');
  assert.equal(deviceB.context.syncDirty, false, 'boot não sujou');
});

test('073 SYNC REPETIDO: tombstone aplicado várias vezes é idempotente (sem writes extras)', async () => {
  const cloud = makeFakeCloud();
  const seedX = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })];
  const deviceA = makeDevice(cloud, { seed: seedX });
  await deviceA.markDirty();
  await deviceA.boot();
  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();
  const revBase = cloud.peekRevision();

  const deviceB = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedX)) });
  await deviceB.boot();
  await deviceB.boot();
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'convergido e estável');
  assert.equal(cloud.peekRevision(), revBase, 'boots repetidos sem edição não escrevem');
});

test('073 OFFLINE DELETE: A remove X sem rede → tombstone+dirty persistem → reconnect publica → outro PC remove', async () => {
  const cloud = makeFakeCloud();
  const seedX = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })];
  const seedBoot = makeDevice(cloud, { seed: seedX });
  await seedBoot.markDirty();
  await seedBoot.boot();
  const revBase = cloud.peekRevision();

  const device = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedX)) });
  await device.boot();
  device.context.fbDb = null; // offline
  const keyX = await explicitDelete(device, 'seed_1', (i) => i.assetId === 'X');
  await device.save(); // saveData real: dirty + push falha (offline)
  assert.equal(device.context.syncDirty, true, 'exclusão offline continua marcada');
  assert.equal(cloud.peekRevision(), revBase, 'nada chega na nuvem offline');
  assert.ok(deviceTombstones(device)[scopedKey(device, 'seed_1', keyX)], 'tombstone persiste local offline');

  // Reconecta e reabre: o boot com dirty publica o estado + tombstone.
  device.context.fbDb = { runTransaction: cloud.runTransaction };
  device.context.appStateReady = false;
  await device.boot();
  assert.ok(cloud.peekRevision() > revBase, 'reconnect publicou');
  assert.equal(device.context.syncDirty, false, 'push confirmado limpou o dirty');

  const deviceC = makeDevice(cloud, { seed: JSON.parse(JSON.stringify(seedX)) });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(), 'outro PC remove X pelo tombstone');
  assert.ok(deviceTombstones(deviceC)[scopedKey(deviceC, 'seed_1', keyX)], 'tombstone chegou ao outro PC');
});

test('073 UNIDADE: merge de tombstones une pelo deletedAt mais recente e ignora inválidos', async () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    tombTimeFn.source + '\n' + isValidTombFn.source + '\n' + tombScopeFn.source + '\n' + normalizeTombFn.source + '\n' +
    mergeTombFn.source + '\n' +
    applyTombFn.source + '\n' + isTombstonedFn.source + '\n' +
    stableKeyFn.source + '\n' +
    'this.__t = { mergeImageTombstones, applyImageTombstonesToList, isImageTombstoned, normalizeTombstoneMap, tombstoneScopeKey };',
    ctx, { filename: 'tombstone-unit.js' }
  );
  const T = ctx.__t;
  const SK = (lid, k) => T.tombstoneScopeKey(k, lid);
  const old = { key: 'asset:X', lesionId: 'seed_1', deletedAt: '2026-01-01T00:00:00.000Z' };
  const newer = { key: 'asset:X', lesionId: 'seed_1', deletedAt: '2026-09-23T00:00:00.000Z' };
  const merged = JSON.parse(JSON.stringify(T.mergeImageTombstones({ 'asset:X': old }, { 'asset:X': newer, 'asset:Y': { key: 'asset:Y', lesionId: 'seed_2', deletedAt: '2026-05-01T00:00:00.000Z' } })));
  assert.equal(merged[SK('seed_1', 'asset:X')].deletedAt, newer.deletedAt, 'mais recente vence no mesmo par (key, lesionId)');
  assert.ok(merged[SK('seed_2', 'asset:Y')], 'pares distintos unem');
  // Global legado (sem lesionId) coexiste com scoped do mesmo asset.
  const coexistence = JSON.parse(JSON.stringify(T.mergeImageTombstones(
    {}, { 'asset:X': { key: 'asset:X', lesionId: '', deletedAt: '2026-02-01T00:00:00.000Z' } }
  )));
  assert.ok(coexistence['asset:X'], 'legado sem lesionId continua global (chave nua)');
  const withInvalid = JSON.parse(JSON.stringify(T.mergeImageTombstones({}, { 'asset:Z': { key: 'asset:Z' }, 'nada': 42 })));
  assert.deepEqual(Object.keys(withInvalid).filter((k) => k !== 'asset:Z'), [], 'inválidos ignorados (só global sem lesionId passa)');
  const list = JSON.parse(JSON.stringify(T.applyImageTombstonesToList(
    [{ assetId: 'X', publicId: 'p', data: 'u' }, { assetId: 'KEEP' }], 'seed_1', { [SK('seed_1', 'asset:X')]: newer }
  )));
  assert.equal(list.removed, 1, 'filtra o tombstonado da lesão certa');
  assert.equal(list.images.length, 1, 'mantém o resto');
  // Escopo: mesmo asset em OUTRA lesão não é filtrado.
  const scoped = JSON.parse(JSON.stringify(T.applyImageTombstonesToList(
    [{ assetId: 'X', publicId: 'p', data: 'u' }], 'seed_2', { [SK('seed_1', 'asset:X')]: newer }
  )));
  assert.equal(scoped.removed, 0, 'tombstone de seed_1 não remove de seed_2');
  assert.equal(scoped.images.length, 1);
});

test('073 BACKUP: export inclui imageTombstones; import une pelo mais recente sem descartar os atuais', () => {
  assert.match(html, /imageTombstones:\s*IMAGE_TOMBSTONES/, 'export leva tombstones');
  assert.match(html, /IMAGE_TOMBSTONES\s*=\s*mergeImageTombstones\(IMAGE_TOMBSTONES,\s*parsed\.imageTombstones\)/, 'import une sem descartar');
});

// ===========================================================================
// CASO REAL 118/118 — os 2 assets do Abscesso cerebral (seed_10) com
// etiqueta seed_11, fisicamente também em seed_11 (Oligodendroglioma).
// Evidência congelada: snapshot-catalogo-completo-readonly.json (19/09) +
// auditoria CRITICAL de 21/09 (contaminação 059 comprovada: nome reescrito
// de "Abscesso cerebral" para "Oligodendroglioma"). Fixture com os
// assetIds/publicIds/URLs/nomes REAIS. Resultado esperado: BLOQUEIO
// (conflito real — mesmo asset em duas lesões), nunca normalização.
// ===========================================================================

function realAbscessoImage(assetId, publicId, version) {
  return {
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v' + version + '/atlas-radiologico/' + publicId + '.jpg',
    publicId: 'atlas-radiologico/' + publicId,
    assetId, lesionId: 'seed_11', lesionName: 'Abscesso cerebral',
    source: 'cloudinary', label: '',
    assignedAt: '2026-08-01T10:00:00.000Z'
  };
}

test('CASO REAL: os 2 assets do Abscesso em seed_10-remoto + seed_11-local BLOQUEIAM (conflito real, sem normalizar)', async () => {
  const cloud = makeFakeCloud();
  const remoteAbscesso = {
    id: 'seed_10', name: 'Abscesso cerebral', s: 'Neurorradiologia', site: 'T', images: [
      realAbscessoImage('48266481f0c336b5932d5e1116a5add1', 'o0ykul2z1qp00pp6yxel', '1789387821'),
      realAbscessoImage('1f173ab3e75da101bd7a04d3f05b2ba1', 'n5oyigvmkpb8zpqykd3g', '1789387640')
    ], links: [], inc: 1
  };
  const deviceA = makeDevice(cloud, { seed: [remoteAbscesso] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBefore = cloud.peekRevision();

  // Chrome: seed_10 SEM as imagens; seed_11 (Oligodendroglioma) contém
  // FISICAMENTE os mesmos 2 assets (estado do snapshot 19/09).
  const localOligo = {
    id: 'seed_11', name: 'Oligodendroglioma', s: 'Neurorradiologia', site: 'T', images: [
      realAbscessoImage('48266481f0c336b5932d5e1116a5add1', 'o0ykul2z1qp00pp6yxel', '1789387821'),
      realAbscessoImage('1f173ab3e75da101bd7a04d3f05b2ba1', 'n5oyigvmkpb8zpqykd3g', '1789387640')
    ], links: [], inc: 1
  };
  const deviceB = makeDevice(cloud, { seed: [{ id: 'seed_10', name: 'Abscesso cerebral', s: 'Neurorradiologia', site: 'T', images: [], links: [], inc: 1 }, localOligo] });
  await deviceB.boot();

  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_10');
  assert.equal(entryB.images.length, 0, 'mesmo asset em duas lesões: nada adotado em seed_10');
  const events = deviceOwnershipEvents(deviceB);
  assert.equal(events.filter((e) => e.kind === 'legacy_image_owner_label_normalized').length, 0, 'nenhuma normalização em conflito real');
  const blocked = events.filter((e) => e.kind === 'image_merge_ownership_conflict_blocked');
  assert.equal(blocked.length, 2, 'os 2 assets bloqueados e registrados');
  assert.ok(blocked.every((e) => (e.conflictingHolders || []).includes('seed_11')), 'evento aponta seed_11 como detentora');
  assert.equal(cloud.peekRevision(), revBefore, 'ZERO writes');
  assert.equal(deviceB.context.syncDirty, false, 'boot não sujou');
});

test('AUDIT FN: auditImageHoldersByStableKey lista holders físicos sem modificar nada', () => {
  const ctx = { DATA: [] };
  vm.createContext(ctx);
  vm.runInContext(
    stableKeyFn.source + '\n' + auditHoldersFn.source + '\n' +
    'this.__a = { auditImageHoldersByStableKey };',
    ctx, { filename: 'audit-holders.js' }
  );
  ctx.DATA = [
    { id: 'seed_10', name: 'Abscesso cerebral', s: 'S', site: 'T', images: [realAbscessoImage('48266481f0c336b5932d5e1116a5add1', 'o0ykul2z1qp00pp6yxel', '1789387821')] },
    { id: 'seed_11', name: 'Oligodendroglioma', s: 'S', site: 'T', images: [realAbscessoImage('48266481f0c336b5932d5e1116a5add1', 'o0ykul2z1qp00pp6yxel', '1789387821')] }
  ];
  const before = JSON.stringify(ctx.DATA);
  const out = JSON.parse(JSON.stringify(ctx.__a.auditImageHoldersByStableKey(['48266481f0c336b5932d5e1116a5add1', 'asset:INEXISTENTE'])));
  assert.equal(JSON.stringify(ctx.DATA), before, 'read-only: DATA intacto');
  assert.equal(out.length, 2);
  assert.equal(out[0].assetId, '48266481f0c336b5932d5e1116a5add1');
  assert.equal(out[0].stableKey, 'asset:48266481f0c336b5932d5e1116a5add1');
  assert.equal(out[0].holders.length, 2, 'mesmo asset em duas lesões');
  assert.deepEqual(out[0].holders.map((h) => h.lesionId).sort(), ['seed_10', 'seed_11']);
  assert.equal(out[0].holders[1].lesionName, 'Oligodendroglioma');
  assert.equal(out[0].holders[1].imgLesionId, 'seed_11');
  assert.equal(out[1].holders.length, 0, 'asset ausente = holders vazio');
});

// ===========================================================================
// ALTERAÇÃO 073b — TOMBSTONE SCOPED POR LESÃO. Modelo: "imagem X removida
// DA lesão Y" (chave de escopo Y+key), nunca "apagada do universo".
// Tombstone legado sem lesionId mantém semântica global histórica.
// ===========================================================================

function scopedKey(device, lesionId, key) {
  // Assinatura real: tombstoneScopeKey(key, lesionId) → "lesionId + key".
  return vm.runInContext('tombstoneScopeKey(' + JSON.stringify(key) + ', ' + JSON.stringify(lesionId) + ')', device.context);
}

function seed10Entry(images) {
  return { id: 'seed_10', name: 'Abscesso cerebral', s: 'Neurorradiologia', site: 'T', images, links: [], inc: 1 };
}

function seed11Entry(images) {
  return { id: 'seed_11', name: 'Oligodendroglioma', s: 'Neurorradiologia', site: 'T', images, links: [], inc: 1 };
}

test('073b CASO EXATO seed_10/seed_11: remove as 2 de seed_11 → seed_10 mantém, cloud converge, sem tocar seed_10', async () => {
  const cloud = makeFakeCloud();
  const both = () => [
    realAbscessoImage('48266481f0c336b5932d5e1116a5add1', 'o0ykul2z1qp00pp6yxel', '1789387821'),
    realAbscessoImage('1f173ab3e75da101bd7a04d3f05b2ba1', 'n5oyigvmkpb8zpqykd3g', '1789387640')
  ];
  // A (Chrome): seed_10 e seed_11 com os 2 assets; usuário remove os 2 de seed_11.
  const deviceA = makeDevice(cloud, { seed: [seed10Entry(both()), seed11Entry(both())] });
  await deviceA.markDirty();
  await deviceA.boot();
  await explicitDelete(deviceA, 'seed_11', (i) => i.assetId === '48266481f0c336b5932d5e1116a5add1');
  await explicitDelete(deviceA, 'seed_11', (i) => i.assetId === '1f173ab3e75da101bd7a04d3f05b2ba1');
  await deviceA.save();
  assert.deepEqual(deviceImagesByAsset(deviceA, 'seed_10'), new Set(['48266481f0c336b5932d5e1116a5add1', '1f173ab3e75da101bd7a04d3f05b2ba1']), 'seed_10 de A intacta');
  assert.deepEqual(deviceImagesByAsset(deviceA, 'seed_11'), new Set(), 'seed_11 de A sem as 2');
  const tombsA = deviceTombstones(deviceA);
  assert.ok(tombsA[scopedKey(deviceA, 'seed_11', 'asset:48266481f0c336b5932d5e1116a5add1')], 'tombstone scoped (482664, seed_11)');
  assert.ok(tombsA[scopedKey(deviceA, 'seed_11', 'asset:1f173ab3e75da101bd7a04d3f05b2ba1')], 'tombstone scoped (1f173, seed_11)');

  // B stale com as 2 em ambas: após pull, seed_11 perde, seed_10 preserva.
  const deviceB = makeDevice(cloud, { seed: [seed10Entry(both()), seed11Entry(both())] });
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_10'), new Set(['48266481f0c336b5932d5e1116a5add1', '1f173ab3e75da101bd7a04d3f05b2ba1']), 'seed_10 de B preservada — nenhum tombstone a remove');
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_11'), new Set(), 'seed_11 de B sem as 2');

  // Cloud converge igual (3º dispositivo limpo).
  const deviceC = makeDevice(cloud, { seed: [seed10Entry([]), seed11Entry([])] });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_10'), new Set(['48266481f0c336b5932d5e1116a5add1', '1f173ab3e75da101bd7a04d3f05b2ba1']), 'cloud mantém seed_10');
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_11'), new Set(), 'cloud sem as 2 em seed_11');
});

test('073b ADICIONAL 1: mesma imagem em duas lesões, delete em A → só A perde', async () => {
  const cloud = makeFakeCloud();
  const mkBoth = () => [
    makeSeedEntry({ id: 'seed_1', name: 'L1', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] }),
    makeSeedEntry({ id: 'seed_2', name: 'L2', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })
  ];
  const deviceA = makeDevice(cloud, { seed: mkBoth() });
  await deviceA.markDirty();
  await deviceA.boot();
  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();

  const deviceB = makeDevice(cloud, { seed: mkBoth() });
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'seed_1 de B perdeu X');
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_2'), new Set(['X']), 'seed_2 de B mantém X');
});

test('073b ADICIONAL 2: tombstone scoped repetido é idempotente (sem writes extras)', async () => {
  const cloud = makeFakeCloud();
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();
  const revBase = cloud.peekRevision();

  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })] });
  await deviceB.boot();
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'estável');
  assert.equal(cloud.peekRevision(), revBase, 'sem writes extras');
});

test('073b ADICIONAL 3: tombstone global legado (sem lesionId) continua removendo em todas as lesões', async () => {
  const cloud = makeFakeCloud();
  const mkBoth = () => [
    makeSeedEntry({ id: 'seed_1', name: 'L1', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] }),
    makeSeedEntry({ id: 'seed_2', name: 'L2', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })
  ];
  const deviceA = makeDevice(cloud, { seed: mkBoth() });
  await deviceA.markDirty();
  await deviceA.boot();
  // Injeta legado global (compatibilidade histórica): sem lesionId.
  await vm.runInContext(
    "IMAGE_TOMBSTONES['asset:X'] = { key: 'asset:X', lesionId: '', deletedAt: new Date().toISOString() };",
    deviceA.context
  );
  await deviceA.context.saveImageTombstones();
  await deviceA.save();

  const deviceB = makeDevice(cloud, { seed: mkBoth() });
  await deviceB.boot();
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'global remove em seed_1');
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_2'), new Set(), 'global remove em seed_2');
});

test('073b ADICIONAL 4: offline — delete scoped persiste e propaga só naquela lesão', async () => {
  const cloud = makeFakeCloud();
  const mkBoth = () => [
    makeSeedEntry({ id: 'seed_1', name: 'L1', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] }),
    makeSeedEntry({ id: 'seed_2', name: 'L2', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })
  ];
  const seedBoot = makeDevice(cloud, { seed: mkBoth() });
  await seedBoot.markDirty();
  await seedBoot.boot();
  const revBase = cloud.peekRevision();

  const device = makeDevice(cloud, { seed: mkBoth() });
  await device.boot();
  device.context.fbDb = null;
  await explicitDelete(device, 'seed_1', (i) => i.assetId === 'X');
  await device.save();
  assert.equal(device.context.syncDirty, true, 'dirty persiste offline');
  assert.equal(cloud.peekRevision(), revBase, 'nada na nuvem offline');

  device.context.fbDb = { runTransaction: cloud.runTransaction };
  device.context.appStateReady = false;
  await device.boot();
  assert.ok(cloud.peekRevision() > revBase, 'reconnect publicou');

  const deviceC = makeDevice(cloud, { seed: mkBoth() });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(), 'seed_1 sem X');
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_2'), new Set(['X']), 'seed_2 com X');
});

test('073b ADICIONAL 5: concorrência — A remove X de lesionA, B adiciona Y em lesionB', async () => {
  const cloud = makeFakeCloud();
  const mkA = () => [
    makeSeedEntry({ id: 'seed_1', name: 'L1', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] }),
    makeSeedEntry({ id: 'seed_2', name: 'L2', images: [] })
  ];
  const deviceA = makeDevice(cloud, { seed: mkA() });
  await deviceA.markDirty();
  await deviceA.boot();
  const deviceB = makeDevice(cloud, { seed: mkA() });
  await deviceB.boot();

  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();

  const entryB2 = deviceB.context.DATA.find((e) => e.id === 'seed_2');
  entryB2.images.push(img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' }));
  entryB2._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceB.context.markPendingLocalImageAdds(entryB2.id, [], [entryB2.images[entryB2.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();

  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(), 'X removida em B');
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_2'), new Set(['Y']), 'Y preservada em B');
  const deviceC = makeDevice(cloud, { seed: mkA() });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(), 'nuvem sem X em seed_1');
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_2'), new Set(['Y']), 'nuvem com Y em seed_2');
});

test('073b ADICIONAL 6: backup/import preserva lesionId do tombstone scoped', () => {
  assert.match(html, /imageTombstones:\s*IMAGE_TOMBSTONES/, 'export leva o mapa (chaves de escopo + lesionId nos registros)');
  assert.match(html, /IMAGE_TOMBSTONES\s*=\s*mergeImageTombstones\(IMAGE_TOMBSTONES,\s*parsed\.imageTombstones\)/, 'import une sem descartar');
});

test('073b ADICIONAL 7: merge do mesmo par (key, lesionId) usa deletedAt mais novo; global+scoped coexistem', async () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    tombTimeFn.source + '\n' + isValidTombFn.source + '\n' + tombScopeFn.source + '\n' + normalizeTombFn.source + '\n' +
    mergeTombFn.source + '\n' +
    'this.__t = { mergeImageTombstones, tombstoneScopeKey };',
    ctx, { filename: 'tombstone-scope-unit.js' }
  );
  const T = ctx.__t;
  const SK = (lid, k) => T.tombstoneScopeKey(k, lid);
  const oldRec = { key: 'asset:X', lesionId: 'seed_11', deletedAt: '2026-01-01T00:00:00.000Z' };
  const newRec = { key: 'asset:X', lesionId: 'seed_11', deletedAt: '2026-09-23T00:00:00.000Z' };
  const merged = JSON.parse(JSON.stringify(T.mergeImageTombstones({ [SK('seed_11', 'asset:X')]: oldRec }, { [SK('seed_11', 'asset:X')]: newRec })));
  assert.equal(merged[SK('seed_11', 'asset:X')].deletedAt, newRec.deletedAt, 'mesmo par: mais novo vence');
  const coexist = JSON.parse(JSON.stringify(T.mergeImageTombstones(
    { 'asset:X': { key: 'asset:X', lesionId: '', deletedAt: '2026-02-01T00:00:00.000Z' } },
    { [SK('seed_10', 'asset:X')]: { key: 'asset:X', lesionId: 'seed_10', deletedAt: '2026-03-01T00:00:00.000Z' } }
  )));
  assert.ok(coexist['asset:X'], 'global preservado');
  assert.ok(coexist[SK('seed_10', 'asset:X')], 'scoped preservado junto');
  assert.equal(Object.keys(coexist).length, 2, 'sem mesclar escopos diferentes');
});

// ===========================================================================
// ALTERAÇÃO 074 — PRE-PUSH RECONCILIATION (bug real 118→116 provado).
// REVISION MATCH != ESTADO LOCAL COMPLETO: um save escreveu o snapshot
// local (sem 2 imagens cloud-only) com revisão válida e a nuvem perdeu o
// que só ela tinha. Agora todo SAVE real faz: reler nuvem ATUAL → merge
// conservador (união + tombstones + normalização) → escrever a UNIÃO.
// ===========================================================================

// Total de imagens na nuvem, lido por um dispositivo limpo (só leitura,
// sem dirty → nenhum write; mesmo padrão dos testes de verificação).
async function cloudImageTotal(cloud) {
  const checker = makeDevice(cloud, { seed: [] });
  await checker.boot();
  return checker.context.DATA.reduce((n, e) => n + (Array.isArray(e.images) ? e.images.length : 0), 0);
}

function prePushInfo(device) {
  return JSON.parse(vm.runInContext(
    'JSON.stringify({ at: lastPrePushReconcileAt, preserved: lastPrePushPreserved })',
    device.context
  ));
}

test('074 CENÁRIO EXATO 118→116: delete scoped + save faz pre-pull — seed_10 preserva A+B, cloud NÃO cai', async () => {
  const cloud = makeFakeCloud();
  const AB = () => [
    realAbscessoImage('48266481f0c336b5932d5e1116a5add1', 'o0ykul2z1qp00pp6yxel', '1789387821'),
    realAbscessoImage('1f173ab3e75da101bd7a04d3f05b2ba1', 'n5oyigvmkpb8zpqykd3g', '1789387640')
  ];
  // Cloud rev15: seed_10 [A,B] (etiqueta legada seed_11), seed_11 [], seed_9 [K].
  const deviceA = makeDevice(cloud, { seed: [seed10Entry(AB()), seed11Entry([]), makeSeedEntry({ id: 'seed_9', name: 'L9', images: [img({ publicId: 'atlas-radiologico/K', assetId: 'K' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBase = cloud.peekRevision();
  assert.equal(await cloudImageTotal(cloud), 3, 'nuvem com A+B+K');

  // Chrome: seed_10 SEM A+B, seed_11 COM A+B (cópias erradas), seed_9 [K].
  const deviceB = makeDevice(cloud, { seed: [seed10Entry([]), seed11Entry(AB()), makeSeedEntry({ id: 'seed_9', name: 'L9', images: [img({ publicId: 'atlas-radiologico/K', assetId: 'K' })] })] });
  await deviceB.boot();
  const preB = deviceB.context.DATA.find((e) => e.id === 'seed_10');
  assert.equal(preB.images.length, 0, 'antes do delete: A+B bloqueadas (holders em seed_11), nada adotado');
  assert.equal(cloud.peekRevision(), revBase, 'boot sem edição: zero writes');

  // Usuário remove A+B de seed_11 (explícito) e salva.
  await explicitDelete(deviceB, 'seed_11', (i) => i.assetId === '48266481f0c336b5932d5e1116a5add1');
  await explicitDelete(deviceB, 'seed_11', (i) => i.assetId === '1f173ab3e75da101bd7a04d3f05b2ba1');
  await deviceB.save();

  // Pre-push reconcile: holders sumiram → normaliza+adota A+B em seed_10
  // ANTES de escrever. A nuvem NUNCA cai para 116-analógico.
  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_10');
  assert.equal(entryB.images.length, 2, 'seed_10 local adotou A+B no pre-pull');
  assert.ok(entryB.images.every((i) => i.lesionId === 'seed_10'), 'só lesionId normalizado');
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_11'), new Set(), 'seed_11 local vazia');
  assert.equal(await cloudImageTotal(cloud), 3, 'CLOUD NÃO CAIU (antes da correção caía para 1)');
  assert.equal(cloud.peekRevision() - revBase, 1, 'exatamente UM write (reconcile lê, não escreve)');
  assert.equal(deviceB.context.syncDirty, false, 'save confirmado limpou dirty');
  const info = prePushInfo(deviceB);
  assert.ok(info.at > 0, 'reconcile registrado');
  assert.equal(info.preserved, 2, '2 cloud-only preservadas antes do write');
});

test('074 MESMA REVISION, LOCAL INCOMPLETO: preflight detecta cloud-only e preserva mesmo com revisão igual', async () => {
  const cloud = makeFakeCloud();
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' }), img({ publicId: 'atlas-radiologico/K', assetId: 'K' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' }), img({ publicId: 'atlas-radiologico/K', assetId: 'K' })] })] });
  await deviceB.boot();

  // Simula estado local semanticamente incompleto COM a revisão em dia
  // (ex.: conteúdo bloqueado/não-adotado no passado, sem tombstone):
  // remove X do DATA de B sem tombstone e sem salvar.
  const entryB = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  entryB.images = entryB.images.filter((i) => i.assetId !== 'X');
  // B edita outra coisa (Y) e salva — sem preflight, o write levaria [K,Y]
  // e a nuvem PERDERIA X mesmo com revisão válida.
  entryB.images.push(img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' }));
  entryB._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceB.context.markPendingLocalImageAdds(entryB.id, [], [entryB.images[entryB.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();

  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['K', 'X', 'Y']), 'preflight re-adotou X + manteve Y');
  assert.equal(await cloudImageTotal(cloud), 3, 'nuvem com X+K+Y (nada perdido)');
});

test('074 OFFLINE EDIT: sem rede salva local + dirty, sem reconcile; reconnect reconcilia antes do write', async () => {
  const cloud = makeFakeCloud();
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  const revBase = cloud.peekRevision();

  const device = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })] });
  await device.boot();
  device.context.fbDb = null; // offline
  const entryOfflineEdit = device.context.DATA.find((e) => e.id === 'seed_1');
  entryOfflineEdit.images.push(img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' }));
  entryOfflineEdit._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  device.context.markPendingLocalImageAdds(entryOfflineEdit.id, [], [entryOfflineEdit.images[entryOfflineEdit.images.length - 1]]); await device.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await device.save();
  assert.equal(device.context.syncDirty, true, 'dirty persiste offline');
  assert.equal(cloud.peekRevision(), revBase, 'nada escrito offline');
  assert.equal(prePushInfo(device).at, null, 'sem reconcile offline');

  device.context.fbDb = { runTransaction: cloud.runTransaction };
  device.context.appStateReady = false;
  await device.boot(); // dirty → reconcile + push no fim do boot
  assert.ok(cloud.peekRevision() > revBase, 'reconnect publicou após reconciliar');
  assert.equal(device.context.syncDirty, false, 'confirmado limpou');
  assert.ok(prePushInfo(device).at > 0, 'reconcile rodou no caminho de volta');
  assert.equal(await cloudImageTotal(cloud), 2, 'X+Y convergidos');
});

test('074 TOMBSTONE SCOPED PRESERVADO: pre-push não ressuscita o que o tombstone tirou', async () => {
  const cloud = makeFakeCloud();
  const mkBoth = () => [
    makeSeedEntry({ id: 'seed_1', name: 'L1', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] }),
    makeSeedEntry({ id: 'seed_2', name: 'L2', images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })
  ];
  const deviceA = makeDevice(cloud, { seed: mkBoth() });
  await deviceA.markDirty();
  await deviceA.boot();
  // Delete scoped em seed_1 (seed_2 mantém X).
  await explicitDelete(deviceA, 'seed_1', (i) => i.assetId === 'X');
  await deviceA.save();

  const deviceC = makeDevice(cloud, { seed: mkBoth() });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(), 'seed_1 sem X');
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_2'), new Set(['X']), 'seed_2 com X (scoped não vaza)');
  assert.equal(await cloudImageTotal(cloud), 1, 'só a cópia de seed_2');
});

test('074 CONCORRÊNCIA: stale salva após outro push — preflight evita o conflito e une tudo', async () => {
  const cloud = makeFakeCloud();
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/M', assetId: 'M' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  const deviceB = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/M', assetId: 'M' })] })] });
  await deviceB.boot();

  // A adiciona N1 e publica (revisão avança).
  const entryA1 = deviceA.context.DATA.find((e) => e.id === 'seed_1');
  entryA1.images.push(img({ publicId: 'atlas-radiologico/N1', assetId: 'N1' }));
  entryA1._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceA.context.markPendingLocalImageAdds(entryA1.id, [], [entryA1.images[entryA1.images.length - 1]]); await deviceA.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceA.save();
  const revAfterA = cloud.peekRevision();

  // B, com revisão antiga, adiciona N2 e salva: o preflight relê (vê N1),
  // mescla e escreve a união — sem conflito de revisão sequer.
  const entryB1 = deviceB.context.DATA.find((e) => e.id === 'seed_1');
  entryB1.images.push(img({ publicId: 'atlas-radiologico/N2', assetId: 'N2' }));
  entryB1._userUpdatedAt = Date.now(); // ALTERAÇÃO 079b — mesmo carimbo de uma adição real
  deviceB.context.markPendingLocalImageAdds(entryB1.id, [], [entryB1.images[entryB1.images.length - 1]]); await deviceB.context.savePendingLocalImageAdds(); // ALTERAÇÃO 079d — marcador persistente de uma inclusão real
  await deviceB.save();

  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_1'), new Set(['M', 'N1', 'N2']), 'união completa em B');
  assert.equal(await cloudImageTotal(cloud), 3, 'união completa na nuvem');
  assert.ok(cloud.peekRevision() > revAfterA, 'write de B confirmado');
  const deviceC = makeDevice(cloud, { seed: [makeSeedEntry({ images: [] })] });
  await deviceC.boot();
  assert.deepEqual(deviceImagesByAsset(deviceC, 'seed_1'), new Set(['M', 'N1', 'N2']), 'terceiro PC converge');
});

test('074 ZERO WRITE BOOT após saves: boot dirty=false continua sem escrever', async () => {
  const cloud = makeFakeCloud();
  const deviceA = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/X', assetId: 'X' })] })] });
  await deviceA.markDirty();
  await deviceA.boot();
  deviceA.context.DATA.find((e) => e.id === 'seed_1').images.push(img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' }));
  await deviceA.save();
  const revBase = cloud.peekRevision();
  await deviceA.boot();
  await deviceA.boot();
  assert.equal(cloud.peekRevision(), revBase, 'boots puros pós-save não escrevem (pre-push só em save)');
});

test('074 OWNERSHIP REAL: save com conflito genuíno não aborta; asset sobrevive na lesion detentora', async () => {
  const cloud = makeFakeCloud();
  // Nuvem: seed_8 [Z, dono seed_9] + seed_9 [Z, dono seed_9].
  const mkZ = (lid) => ({ data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/ZZZ.jpg', publicId: 'atlas-radiologico/ZZZ', assetId: 'ZZZ', lesionId: lid, lesionName: 'L', assignedAt: '2026-08-01T10:00:00.000Z' });
  const deviceA = makeDevice(cloud, { seed: [
    makeSeedEntry({ id: 'seed_8', name: 'L8', images: [mkZ('seed_9')] }),
    makeSeedEntry({ id: 'seed_9', name: 'L9', images: [mkZ('seed_9')] })
  ] });
  await deviceA.markDirty();
  await deviceA.boot();
  // Local igual à nuvem; usuário edita só o nome de seed_8 e salva.
  const deviceB = makeDevice(cloud, { seed: [
    makeSeedEntry({ id: 'seed_8', name: 'L8', images: [] }),
    makeSeedEntry({ id: 'seed_9', name: 'L9', images: [mkZ('seed_9')] })
  ] });
  await deviceB.boot();
  // seed_8 de B: Z bloqueada (mesmo asset em seed_9) — documenta o residual:
  // sem adoção opaca; o asset sobrevive na detentora e o save não aborta.
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_8'), new Set(), 'Z bloqueada em seed_8 (conflito real)');
  const editedEntry8 = deviceB.context.DATA.find((e) => e.id === 'seed_8');
  editedEntry8.name = 'L8 editada';
  editedEntry8._userUpdatedAt = Date.now(); // edição real do usuário sempre carrega este timestamp (ver handler de salvar do editor)
  await deviceB.save();
  const entryC8 = deviceB.context.DATA.find((e) => e.id === 'seed_8');
  assert.equal(entryC8.name, 'L8 editada', 'edição do usuário preservada');
  assert.deepEqual(deviceImagesByAsset(deviceB, 'seed_9'), new Set(['ZZZ']), 'detentora intacta');
  const deviceC = makeDevice(cloud, { seed: [makeSeedEntry({ id: 'seed_8', name: 'L8', images: [] }), makeSeedEntry({ id: 'seed_9', name: 'L9', images: [] })] });
  await deviceC.boot();
  assert.ok(deviceImagesByAsset(deviceC, 'seed_9').has('ZZZ'), 'asset sobrevive na nuvem via detentora');
  const blocked = deviceOwnershipEvents(deviceB).filter((e) => e.kind === 'image_merge_ownership_conflict_blocked');
  assert.ok(blocked.length >= 1, 'bloqueio registrado, nunca silencioso');
});

// ===========================================================================
// ALTERAÇÃO 076 (2026-09-24) — auditoria independente encontrou dois pontos
// onde a barreira de pre-push reconciliation (074) não se aplicava:
// (1) o push DEBOUNCED (pushToFirebase(), usado por saveReview/saveSRS/
//     saveSessionLog/saveOrder/saveSiteOrder) escrevia DATA local direto,
//     sem reconcileBeforePush — um device semanticamente incompleto que só
//     mudasse REVIEW/SRS podia sobrescrever a nuvem e apagar lesões
//     cloud-only;
// (2) o Salvar do editor (escrita direta, fora de saveData()) nunca chamava
//     markSyncDirty() — se reconcileBeforePush()/o write falhassem, a
//     edição ficava só local com syncDirty=false, e nem o retry em memória
//     (syncPushPending) sobrevive a um reload.
// ===========================================================================

test('TESTE A (076): device semanticamente incompleto que só altera SRS não apaga lesão cloud-only — pre-push reconcile no push debounced', async () => {
  const cloud = makeFakeCloud();

  // A publica DUAS lesões.
  const seedA = [makeSeedEntry({ id: 'seed_1', name: 'Lesão 1' }), makeSeedEntry({ id: 'seed_2', name: 'Lesão 2' })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot();
  assert.equal(cloud.peekLesionCount(), 2, 'a nuvem precisa ter as 2 lesões após o boot de A');

  // B puxa as duas normalmente...
  const deviceB = makeDevice(cloud, { seed: [] });
  await deviceB.boot();
  assert.equal(deviceB.context.DATA.length, 2, 'B precisa terminar o boot com as 2 lesões');

  // ...mas fica semanticamente incompleto DEPOIS do boot (ex.: um pull
  // anterior parcial, uma migração local, qualquer motivo) — perde seed_2
  // só da memória local, sem isso passar por nenhum merge.
  deviceB.context.DATA = deviceB.context.DATA.filter((e) => e.id !== 'seed_2');
  assert.equal(deviceB.context.DATA.length, 1, 'setup do teste: B agora só conhece seed_1');

  // B altera SRS (mesmo caminho real de saveSRS(): markSyncDirty() + push
  // debounced) sem nunca ter reconhecido seed_2.
  deviceB.context.SRS = { seed_1: { interval: 3, due: Date.now(), streak: 1 } };
  await deviceB.context.markSyncDirty();
  deviceB.context.pushToFirebase();

  // Espera o debounce (400ms) + a escrita real terminarem.
  await new Promise((resolve) => setTimeout(resolve, 700));

  assert.equal(cloud.peekLesionCount(), 2, 'seed_2 (cloud-only) precisa sobreviver ao push debounced de SRS — reconcile tem que mesclar antes de escrever');
  assert.equal(deviceB.context.syncDirty, false, 'escrita confirmada precisa limpar o dirty');
  assert.ok(deviceB.context.DATA.some((e) => e.id === 'seed_2'), 'o próprio device B recupera seed_2 localmente (reconcileBeforePush também persiste local)');

  // Confirma com um terceiro device independente puxando da nuvem.
  const deviceCheck = makeDevice(cloud, { seed: [] });
  await deviceCheck.boot();
  assert.equal(deviceCheck.context.DATA.length, 2, 'a nuvem, ao final, precisa ter as 2 lesões — nunca ter regredido para 1');
});

test('TESTE B (076): edição real com preflight de rede falhando mantém syncDirty=true; retry na reconexão preserva a edição', async () => {
  const cloud = makeFakeCloud();
  const seed = [makeSeedEntry({ id: 'seed_1', name: 'Nome original' })];
  const device = makeDevice(cloud, { seed });
  await device.boot();
  assert.equal(device.context.syncDirty, false, 'estado inicial: nada pendente');

  // Edição real do usuário (mutação direta de DATA, como o Salvar do editor
  // faz antes de tentar persistir).
  device.context.DATA.find((e) => e.id === 'seed_1').name = 'Nome editado';

  // Mesma sequência do Salvar do editor (ALTERAÇÃO 076): markSyncDirty()
  // ANTES da tentativa de reconcile/push.
  await device.context.markSyncDirty();

  // Simula falha de preflight (offline/erro de rede): sem fbDb,
  // reconcileBeforePush() devolve ok:false de forma controlada (não lança).
  const realFbDb = device.context.fbDb;
  device.context.fbDb = null;
  const recon = await device.context.reconcileBeforePush('editor-save');
  assert.equal(recon.ok, false, 'sem fbDb, o preflight precisa falhar de forma controlada');

  assert.equal(cloud.peekLesionCount(), 0, 'preflight falho não pode ter escrito nada (nuvem nunca foi tocada)');
  assert.equal(device.context.syncDirty, true, 'a edição real precisa continuar marcada como pendente — nunca "esquecida"');

  // "Conexão volta": restaura fbDb e roda o mesmo retry real do listener
  // 'online' (pushToFirebaseNow).
  device.context.fbDb = realFbDb;
  await device.context.pushToFirebaseNow();

  assert.equal(device.context.syncDirty, false, 'retry confirmado precisa limpar o dirty');
  assert.equal(cloud.peekLesionCount(), 1, 'a nuvem precisa ter recebido a lesão no retry');

  const deviceCheck = makeDevice(cloud, { seed: [] });
  await deviceCheck.boot();
  assert.equal(deviceCheck.context.DATA.find((e) => e.id === 'seed_1').name, 'Nome editado', 'a edição feita durante a falha de preflight não pode ter sido perdida');
});

test('TESTE D (076): boot com syncDirty=false continua sem escrever na nuvem, mesmo depois do pre-push reconcile no push debounced', async () => {
  const cloud = makeFakeCloud();
  const seedA = [makeSeedEntry({ id: 'seed_1', name: 'Lesão 1' })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot();
  const revisionAfterA = cloud.peekRevision();

  // B abre o mesmo catálogo sem editar nada — reabrir não pode escrever.
  const deviceB = makeDevice(cloud, { seed: seedA.map((e) => ({ ...e })) });
  await deviceB.boot();

  assert.equal(deviceB.context.syncDirty, false, 'boot sem edição não pode ligar o dirty sozinho');
  assert.equal(cloud.peekRevision(), revisionAfterA, 'boot com dirty=false não pode ter incrementado a revisão da nuvem (nenhuma escrita)');
});

// ===========================================================================
// ALTERAÇÃO 077 (2026-09-24) — RESTORE CANÔNICO DEDICADO. Bug real
// (rev19->rev20): forceThisDeviceToCloud() não tinha proteção própria (sem
// reconcile, sem filtro de quarentena, confiava cegamente em DATA/REVIEW/
// SRS globais) e rodou concorrente com um syncFromFirebase() disparado por
// onAuthStateChanged (Auth se revalidando ao voltar a rede), que mesclou a
// nuvem AINDA contaminada de volta no estado em memória antes da escrita.
// restoreCanonicalStateToCloud() é a ferramenta dedicada: recebe o payload
// por parâmetro (nunca lê DATA/REVIEW/SRS globais como fonte), nunca faz
// merge/união/migração, exige expectedRemoteRevision, e é bloqueada de
// qualquer concorrência via canonicalRestoreInProgress.
// ===========================================================================

// Contexto ISOLADO, só pra restoreCanonicalStateToCloud() e vizinhos diretos
// — usa a quarentena REAL (isQuarantinedSeedId de verdade), ao contrário do
// resto deste arquivo (que stuba isQuarantinedSeedId=>false porque várias
// fixtures pré-existentes usam nome/seção/sítio repetidos de propósito pra
// testar ownership, não dedup — ligar a quarentena real no engine
// compartilhado quebrava esses testes sem relação nenhuma com a 077).
function makeRestoreContext(cloud) {
  const context = vm.createContext({
    fbDb: { runTransaction: cloud.runTransaction },
    FB_META_REF: cloud.FB_META_REF,
    FB_CHUNK_REF: cloud.FB_CHUNK_REF,
    DATA_CHUNK_SIZE: 150,
    CLOUD_REVISION_FIELD: 'revision',
    canonicalRestoreInProgress: false,
    withFirebaseTimeout: (p) => p,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } },
    SEED: [],
    // Estado global "real" do app, só aqui pra provar que restore NUNCA os
    // lê como fonte (ver TESTE J) — propositalmente vazio/diferente do
    // payload de restore.
    DATA: [], REVIEW: {}, SRS: {}, SESSIONLOG: {}, sectionOrder: [], siteOrder: {},
    IMAGE_TOMBSTONES: {}, lastKnownCloudRevision: null,
    window: {},
    console
  });
  const engine = `
    ${computeDuplicateSeedIdsFn.source}
    ${quarantineConstsSource}
    ${stableKeyFn.source}
    ${tombScopeFn.source}
    ${isValidTombFn.source}
    ${isTombstonedFn.source}
    function stripUndefinedDeep(v){try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}}
    function splitIntoChunks(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
    function checkChunkSize(){return true;}
    ${quarantineIndexedByLesionIdFn.source}
    ${sanitizeCanonicalPayloadForQuarantineFn.source}
    ${validateCanonicalPayloadFn.source}
    ${canonicalJsonStringFn.source}
    ${deepStableEqualFn.source}
    ${restoreCanonicalStateToCloudFn.source}
  `;
  new vm.Script(engine).runInContext(context);
  return context;
}

function makeSyntheticCanonicalPayload() {
  return {
    data: [
      { id: 'seed_0', name: 'Lesão A', s: 'Seção 1', site: 'Sítio 1', images: [{ assetId: 'A1', publicId: 'p/A1' }] },
      { id: 'seed_1', name: 'Lesão B', s: 'Seção 1', site: 'Sítio 2', images: [] },
      { id: 'u_test1', name: 'Lesão C', s: 'Seção 2', site: 'Sítio 3', images: [] }
    ],
    review: { seed_0: 1, seed_1: 2 },
    srs: { seed_0: { interval: 3, due: 1, streak: 1 } },
    sessionLog: { '2026-09-01': { reviewed: 2, right: 2, wrong: 0 } },
    sectionOrder: ['Seção 1', 'Seção 2'],
    siteOrder: { 'Seção 1': ['Sítio 1', 'Sítio 2'] },
    imageTombstones: {}
  };
}
const SYNTHETIC_EXPECTED = {
  records: 3, dupGroups: 0, highIds: 0,
  withImage: 1, imageRefs: 1, distinctStableKeys: 1,
  review: 2, srs: 1, altPlacements: 0, tombstones: 0,
  zeroImageIds: ['seed_1'], seedRangeMax: 1, uCount: 1
};

test('TESTE A (077): restore recebe canônico sintético e escreve exatamente esse estado na nuvem (revision 0->1)', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const result = await ctx.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.revision, 1);
  assert.equal(cloud.peekLesionCount(), 3);
  assert.equal(cloud.peekRevision(), 1);
  assert.deepEqual(Array.from(ctx.DATA).map(e => e.id).sort(), ['seed_0', 'seed_1', 'u_test1']);
});

test('TESTE B (077): syncFromFirebase() não executa (nem liga fbSyncing) enquanto canonicalRestoreInProgress=true', async () => {
  const cloud = makeFakeCloud();
  const seedA = [makeSeedEntry({ id: 'seed_1', name: 'Original' })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot();

  const deviceB = makeDevice(cloud, { seed: [] });
  deviceB.context.canonicalRestoreInProgress = true;
  await deviceB.context.syncFromFirebase();

  assert.equal(deviceB.context.fbSyncing, false, 'syncFromFirebase não pode nem ter começado — fbSyncing nunca liga');
  assert.deepEqual(deviceB.context.DATA, [], 'DATA local não pode ter sido tocado — o pull nem rodou');
});

test('TESTE C (077): loadData()/boot (mesmo caminho de onAuthStateChanged->showApp) não consegue puxar a nuvem enquanto canonicalRestoreInProgress=true', async () => {
  const cloud = makeFakeCloud();
  const seedA = [makeSeedEntry({ id: 'seed_1', name: 'Nuvem' })];
  const deviceA = makeDevice(cloud, { seed: seedA });
  await deviceA.markDirty();
  await deviceA.boot();

  const deviceB = makeDevice(cloud, { seed: [] });
  deviceB.context.canonicalRestoreInProgress = true;
  await deviceB.boot();

  assert.deepEqual(Array.from(deviceB.context.DATA), [], 'boot com o lock ligado não pode ter puxado nada da nuvem');
});

test('TESTE D (077): revision remota diferente da esperada aborta — zero writes', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  await ctx.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(cloud.peekRevision(), 1, 'setup: primeira escrita precisa ter ido pra revision 1');

  const before = cloud.peekLesionCount();
  const result = await ctx.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'revision_check');
  assert.equal(cloud.peekRevision(), 1, 'revisão não pode ter mudado');
  assert.equal(cloud.peekLesionCount(), before, 'nenhum write extra deve ter acontecido');
});

test('TESTE E (077): seed_1282 em DATA é removido pela quarentena antes de qualquer escrita', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const payload = makeSyntheticCanonicalPayload();
  payload.data.push({ id: 'seed_1282', name: 'Contaminado', s: 'Seção X', site: 'Sítio X', images: [] });
  const result = await ctx.restoreCanonicalStateToCloud(payload, { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.records, 3, 'seed_1282 precisa ter sido removido antes da validação/escrita');
  assert.equal(cloud.peekLesionCount(), 3);
  assert.ok(!ctx.DATA.some(e => e.id === 'seed_1282'), 'seed_1282 não pode estar em DATA após o restore');
});

test('TESTE F (077): seed_1282 em SRS é removido pela quarentena — não chega ao servidor', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const payload = makeSyntheticCanonicalPayload();
  payload.srs.seed_1282 = { interval: 1, due: 1, streak: 1 };
  const result = await ctx.restoreCanonicalStateToCloud(payload, { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(!('seed_1282' in ctx.SRS), 'seed_1282 não pode estar em SRS após o restore');
  const rawMeta = await cloud.FB_META_REF().get();
  assert.ok(!('seed_1282' in (rawMeta.data().srs || {})), 'seed_1282 não pode ter chegado ao servidor');
});

// ===========================================================================
// ALTERAÇÃO 077b (2026-09-24) — achado real no Edge: o REVIEW CRU do
// canônico (ATLAS_CANONICO_LIMPO_1216_116_FINAL.json, hash
// 620f9bb6...685d86) tem 139 chaves, mas UMA delas (seed_1282) é um high id
// residual que a reconciliação manual original não pegou (focou em DATA,
// não em REVIEW). DATA (1216) e SRS (51) não têm high id nenhum. O valor
// CORRETO esperado depois da quarentena é REVIEW=138 — não 139. Corrigido
// o default de validateCanonicalPayload(). Este teste usa o ARQUIVO
// CANÔNICO REAL (não uma fixture sintética) para provar isso fim a fim,
// com os defaults (sem passar `expected`).
// ===========================================================================
test('TESTE F2 (077b): REVIEW do canônico REAL contém seed_1282 (high id residual) — sanitize remove, validação com defaults (138) passa, nunca chega à escrita', async () => {
  const canonicalPath = path.resolve(__dirname, '..', 'ATLAS_CANONICO_LIMPO_1216_116_FINAL.json');
  const rawPayload = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));

  // Confirma o fato relatado, direto do arquivo real, antes de qualquer
  // sanitização — não confia em nenhum número de memória.
  assert.equal(Object.keys(rawPayload.review).length, 139, 'setup: REVIEW cru do canônico precisa ter 139 chaves');
  assert.equal(rawPayload.review.seed_1282, 1, 'setup: seed_1282 precisa estar presente no REVIEW cru');
  assert.equal(Object.keys(rawPayload.srs).length, 51, 'setup: SRS cru precisa ter 51 (sem high id)');
  assert.equal(rawPayload.data.length, 1216, 'setup: DATA cru precisa ter 1216 (sem high id)');

  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);

  const sanitized = ctx.sanitizeCanonicalPayloadForQuarantine(rawPayload);
  assert.equal(Object.keys(sanitized.review).length, 138, 'sanitize precisa remover seed_1282 e deixar REVIEW com 138');
  assert.ok(!('seed_1282' in sanitized.review), 'seed_1282 não pode sobreviver ao sanitize');
  assert.equal(Object.keys(sanitized.srs).length, 51, 'SRS não deve mudar (não tinha high id)');
  assert.equal(sanitized.data.length, 1216, 'DATA não deve mudar (não tinha high id)');

  // validateCanonicalPayload SEM `expected` — usa os defaults corrigidos.
  const validation = ctx.validateCanonicalPayload(sanitized);
  assert.equal(validation.ok, true, JSON.stringify(validation.failures));

  // restoreCanonicalStateToCloud também SEM `expected` override — mesma
  // prova fim a fim, com o payload real inteiro (1216 registros).
  const result = await ctx.restoreCanonicalStateToCloud(rawPayload, { expectedRemoteRevision: 0 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.records, 1216);
  assert.ok(!('seed_1282' in ctx.REVIEW), 'seed_1282 não pode estar em REVIEW após o restore');
  assert.equal(Object.keys(ctx.REVIEW).length, 138);

  const rawMeta = await cloud.FB_META_REF().get();
  assert.ok(!('seed_1282' in (rawMeta.data().review || {})), 'seed_1282 não pode ter chegado ao servidor');
  assert.equal(Object.keys(rawMeta.data().review).length, 138, 'servidor precisa refletir REVIEW=138, nunca 139');
});

test('TESTE G (077): payload com contagem de imagens divergente da esperada aborta sem escrever', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const payload = makeSyntheticCanonicalPayload();
  payload.data[1].images = [{ assetId: 'EXTRA', publicId: 'p/extra' }]; // seed_1 ganha 1 imagem inesperada
  const result = await ctx.restoreCanonicalStateToCloud(payload, { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'validation');
  assert.ok(result.failures.some(f => f.includes('imageRefs')), JSON.stringify(result.failures));
  assert.equal(cloud.peekRevision(), 0, 'nenhuma escrita deve ter acontecido');
});

test('TESTE H (077): payload com duplicação semântica (nome+seção+sítio repetido) aborta sem escrever', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const payload = makeSyntheticCanonicalPayload();
  payload.data[1].name = payload.data[0].name;
  payload.data[1].s = payload.data[0].s;
  payload.data[1].site = payload.data[0].site;
  const result = await ctx.restoreCanonicalStateToCloud(payload, { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'validation');
  assert.ok(result.failures.some(f => f.includes('dupGroups')), JSON.stringify(result.failures));
  assert.equal(cloud.peekRevision(), 0);
});

test('TESTE I (077): imagem ainda presente mas já tombstonada para a mesma lesão aborta sem escrever', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const payload = makeSyntheticCanonicalPayload();
  payload.imageTombstones = { ['seed_0asset:A1']: { key: 'asset:A1', lesionId: 'seed_0', deletedAt: '2026-09-01T00:00:00.000Z' } };
  const result = await ctx.restoreCanonicalStateToCloud(payload, { expectedRemoteRevision: 0, expected: Object.assign({}, SYNTHETIC_EXPECTED, { tombstones: 1 }) });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'validation');
  assert.ok(result.failures.some(f => f.includes('tombstonada')), JSON.stringify(result.failures));
  assert.equal(cloud.peekRevision(), 0);
});

test('TESTE J (077): a escrita usa o snapshot do payload — mutar DATA global ou o próprio objeto payload depois de chamar não afeta o que é escrito', async () => {
  const cloud = makeFakeCloud();
  const ctx = makeRestoreContext(cloud);
  const payload = makeSyntheticCanonicalPayload();
  const restorePromise = ctx.restoreCanonicalStateToCloud(payload, { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED, updateGlobalsOnSuccess: false });
  // Mutação SÍNCRONA logo após chamar (restore já tirou seu snapshot antes
  // do primeiro await) — tanto do global quanto do próprio objeto payload.
  ctx.DATA = [{ id: 'seed_999', name: 'MUTADO', s: 'Z', site: 'Z' }];
  payload.data.push({ id: 'seed_888', name: 'MUTAÇÃO TARDIA DO PAYLOAD', s: 'Z', site: 'Z' });
  const result = await restorePromise;
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(cloud.peekLesionCount(), 3, 'a nuvem precisa refletir o payload ORIGINAL (3), nunca DATA global nem a mutação tardia do payload (4)');
  assert.deepEqual(ctx.DATA.map(e => e.id), ['seed_999'], 'updateGlobalsOnSuccess:false — DATA global mutado não deve ter sido tocado pelo restore');
});

test('TESTE K (077): race real — syncFromFirebase() em voo quando o restore começa não corrompe a escrita canônica', async () => {
  const cloud = makeFakeCloud();
  const seedContaminado = [makeSeedEntry({ id: 'seed_1', name: 'Contaminado', images: [img({ publicId: 'atlas-radiologico/old' })] })];
  const deviceOld = makeDevice(cloud, { seed: seedContaminado });
  await deviceOld.markDirty();
  await deviceOld.boot(); // nuvem em revision 1

  // "Edge": MESMO contexto/aba vai rodar tanto o pull concorrente quanto o
  // restore — exatamente como no bug real (onAuthStateChanged e
  // forceThisDeviceToCloud no mesmo JS runtime, não dois devices distintos).
  const edge = makeDevice(cloud, { seed: [] });
  edge.context.syncDirty = true; // simula edição real ainda não confirmada, que faria syncFromFirebase tentar um push ao final
  const gate = cloud.gateNextMetaRead();
  const syncPromise = edge.context.syncFromFirebase(); // dispara e trava no portão de leitura
  await gate.waitUntilEntered();

  // O pull concorrente já passou pelo check de canonicalRestoreInProgress
  // (ainda false) e está preso lendo a rede. Restore começa AGORA, no MESMO
  // contexto, e liga o lock antes de qualquer await seu.
  const restorePromise = edge.context.restoreCanonicalStateToCloud(
    makeSyntheticCanonicalPayload(),
    { expectedRemoteRevision: 1, expected: SYNTHETIC_EXPECTED }
  );
  gate.release();
  const [, restoreResult] = await Promise.all([syncPromise, restorePromise]);

  assert.equal(restoreResult.ok, true, JSON.stringify(restoreResult));
  assert.equal(cloud.peekRevision(), 2, 'restore precisa ter escrito com sucesso (rev 1->2), apesar do pull concorrente');
  assert.equal(cloud.peekLesionCount(), 3, 'a nuvem final precisa ser o canônico limpo — nunca uma mistura com o pull concorrente');

  const deviceCheck = makeDevice(cloud, { seed: [] });
  await deviceCheck.boot();
  assert.deepEqual(Array.from(deviceCheck.context.DATA).map(e => e.id).sort(), ['seed_0', 'seed_1', 'u_test1'], 'nenhum device puxando depois pode ver contaminação residual da race');
});

test('TESTE L (077): releitura pós-escrita divergente faz o restore reportar falha e NÃO atualizar os globais', async () => {
  const cloud = makeFakeCloud();
  const originalChunkRef = cloud.FB_CHUNK_REF;
  let corrupt = true;
  cloud.FB_CHUNK_REF = (i) => {
    const ref = originalChunkRef(i);
    if (i !== 0) return ref;
    return Object.assign({}, ref, {
      get: async (opts) => {
        if (corrupt) return { exists: true, data: () => ({ items: [{ id: 'seed_corrompido', name: 'X', s: 'Y', site: 'Z' }] }) };
        return ref.get(opts);
      }
    });
  };

  const ctx = makeRestoreContext(cloud);
  const result = await ctx.restoreCanonicalStateToCloud(makeSyntheticCanonicalPayload(), { expectedRemoteRevision: 0, expected: SYNTHETIC_EXPECTED });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'post_write_verification');
  assert.deepEqual(ctx.DATA, [], 'globais não podem ter sido atualizados — o restore não confirmou sucesso');
});

// ===========================================================================
// PROTEÇÃO 079 (2026-09-24) — duas classes de falha provadas pela forense da
// REV26 (Edge explicitamente limpo antes, contaminação real depois de
// reabrir write):
//
// PARTE A — barreira final de quarentena obrigatória em writeShardedState()
// (DATA/REVIEW/SRS), independente de qualquer proteção upstream, + filtro já
// no LOAD do IndexedDB (loadSRS()/REVIEW em loadData()) e nos DOIS lados do
// merge (mergeReviewPreservingProgress/mergeSRSPreservingNewest), pra lixo
// de quarentena nem permanecer em memória.
//
// PARTE B — mergeEntryNonDestructive() ganhou o parâmetro
// preferRemoteWhenUntimed (só usado por reconcileStateWithRemote, chamado
// com true): quando NENHUM dos dois lados tem _userUpdatedAt (nenhuma
// evidência de edição real), o REMOTO passa a ser autoritativo pra
// links/classification/altPlacements/notes/tags — um "local" sem timestamp
// não pode mais vencer/sobrescrever um remoto limpo só por existir. Imagens
// continuam com a união aditiva pré-existente (ALTERAÇÃO 073/074), fora do
// escopo deste bug.
//
// PARTE C — sem mudança de código: a captura do payload (cleanData/chunks/
// metaPayloadBase) já acontece de forma síncrona, ANTES de qualquer await,
// dentro do corpo de writeShardedState() — o Teste 8 abaixo prova isso
// diretamente. writeChainV247 (serialização de escritas) já é reaproveitado
// por writeShardedStateSerialized(), sem necessidade de mecanismo novo.
//
// PARTE D — reconcileBeforePush() ganhou detecção de no-op: se o snapshot
// local pós-reconcile (DATA/REVIEW/SRS/etc., já filtrados da quarentena) é
// estruturalmente idêntico ao remoto (deepStableEqual), pushToFirebase()/
// pushToFirebaseNow() limpam syncDirty sem gastar um write nem incrementar
// revision — evita repetição dos episódios de no-op-write das revisões
// 22/24.
// ===========================================================================

test('PROTEÇÃO 079 - Parte A, Teste 1: REVIEW com seed_1282 nunca chega ao payload gravado no Firestore', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [makeSeedEntry({ id: 'seed_1', name: 'Lesão válida' })] });
  device.context.isQuarantinedSeedId = (id) => id === 'seed_1282';
  device.context.REVIEW = { seed_1: 2, seed_1282: 5 };
  device.context.lastKnownCloudRevision = 0;
  const ok = await device.context.writeShardedState(5000);
  assert.equal(ok, true);
  const meta = cloud.peekMeta();
  assert.ok(meta, 'documento principal precisa ter sido gravado');
  assert.equal(Object.prototype.hasOwnProperty.call(meta.review, 'seed_1282'), false, 'seed_1282 não pode aparecer no REVIEW gravado na nuvem');
  assert.equal(meta.review.seed_1, 2, 'entrada válida continua presente');
});

test('PROTEÇÃO 079 - Parte A, Teste 2: SRS com seed_1282 nunca chega ao payload gravado no Firestore', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [makeSeedEntry({ id: 'seed_1', name: 'Lesão válida' })] });
  device.context.isQuarantinedSeedId = (id) => id === 'seed_1282';
  device.context.SRS = { seed_1: { interval: 3, due: 1, streak: 1 }, seed_1282: { interval: 9, due: 1, streak: 9 } };
  device.context.lastKnownCloudRevision = 0;
  const ok = await device.context.writeShardedState(5000);
  assert.equal(ok, true);
  const meta = cloud.peekMeta();
  assert.equal(Object.prototype.hasOwnProperty.call(meta.srs, 'seed_1282'), false, 'seed_1282 não pode aparecer no SRS gravado na nuvem');
  assert.ok(meta.srs.seed_1, 'entrada válida continua presente');
});

test('PROTEÇÃO 079 - Parte A, Teste 3: DATA com seed_1282 nunca chega ao payload gravado no Firestore', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  device.context.isQuarantinedSeedId = (id) => id === 'seed_1282';
  device.context.DATA = [
    makeSeedEntry({ id: 'seed_1', name: 'Lesão válida' }),
    makeSeedEntry({ id: 'seed_1282', name: 'Lixo quarentenado' })
  ];
  device.context.lastKnownCloudRevision = 0;
  const ok = await device.context.writeShardedState(5000);
  assert.equal(ok, true);
  const ids = Array.from(cloud.peekChunkItems(0)).map((e) => e.id);
  assert.ok(!ids.includes('seed_1282'), 'seed_1282 não pode aparecer no chunk gravado na nuvem');
  assert.ok(ids.includes('seed_1'), 'entrada válida continua presente');
});

test('PROTEÇÃO 079 - Parte A, Teste 4: REVIEW/SRS remotos contaminados não reintroduzem seed_1282 nos globais via reconcileStateWithRemote', () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  device.context.isQuarantinedSeedId = (id) => id === 'seed_1282';
  device.context.DATA = [makeSeedEntry({ id: 'seed_1', name: 'Lesão válida' })];
  device.context.REVIEW = { seed_1: 1 };
  device.context.SRS = { seed_1: { interval: 2, due: 1, streak: 1 } };
  const remote = {
    data: [makeSeedEntry({ id: 'seed_1', name: 'Lesão válida' })],
    review: { seed_1: 3, seed_1282: 9 },
    srs: { seed_1: { interval: 4, due: 2, streak: 2 }, seed_1282: { interval: 9, due: 9, streak: 9 } },
    sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {}
  };
  device.context.reconcileStateWithRemote(remote);
  assert.equal(Object.prototype.hasOwnProperty.call(device.context.REVIEW, 'seed_1282'), false, 'REVIEW global não pode ter reincorporado seed_1282');
  assert.equal(Object.prototype.hasOwnProperty.call(device.context.SRS, 'seed_1282'), false, 'SRS global não pode ter reincorporado seed_1282');
  assert.equal(device.context.REVIEW.seed_1, 3, 'merge legítimo (max-wins de progresso) continua funcionando pro resto');
});

test('PROTEÇÃO 079 - Parte A, Teste 5a: REVIEW contaminado no IndexedDB não sobrevive ao boot (loadData real)', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [makeSeedEntry({ id: 'seed_1', name: 'Lesão válida' })] });
  device.context.isQuarantinedSeedId = (id) => id === 'seed_1282';
  // Simula um IndexedDB que já tinha seed_1282 salvo em REVIEW de um
  // incidente anterior (achado real da REV26: DATA limpa, REVIEW nunca
  // filtrada no load).
  await device.context.storage.set('review', JSON.stringify({ seed_1: 2, seed_1282: 7 }), false);
  await device.boot();
  assert.equal(Object.prototype.hasOwnProperty.call(device.context.REVIEW, 'seed_1282'), false, 'boot não pode manter seed_1282 em REVIEW vindo do IndexedDB');
  assert.equal(device.context.REVIEW.seed_1, 2, 'entrada válida sobrevive normalmente');
});

// Contexto isolado só pra loadSRS(): makeDevice() estuba loadSRS() como
// no-op (não é sobre esse load nos outros cenários), então o Teste 5b
// precisa da função REAL ligada diretamente.
function makeLoadSRSContext(rawJson) {
  const context = vm.createContext({
    SRS: {},
    SRS_KEY: 'srs',
    isQuarantinedSeedId: (id) => id === 'seed_1282',
    storage: {
      get: async (key) => {
        if (key === 'srs') return { value: rawJson };
        throw new Error('key not found: ' + key);
      }
    },
    console
  });
  const engine = `
    ${quarantineIndexedByLesionIdFn.source}
    ${loadSRSFn.source}
  `;
  new vm.Script(engine).runInContext(context);
  return context;
}

test('PROTEÇÃO 079 - Parte A, Teste 5b: SRS contaminado no IndexedDB não sobrevive ao load real (loadSRS)', async () => {
  const ctx = makeLoadSRSContext(JSON.stringify({ seed_1: { interval: 2, due: 1, streak: 1 }, seed_1282: { interval: 9, due: 9, streak: 9 } }));
  await ctx.loadSRS();
  assert.equal(Object.prototype.hasOwnProperty.call(ctx.SRS, 'seed_1282'), false, 'loadSRS() não pode manter seed_1282 vindo do IndexedDB');
  assert.ok(ctx.SRS.seed_1, 'entrada válida sobrevive normalmente');
});

test('PROTEÇÃO 079 - Parte B, Teste 6: DATA remoto limpo não é sobrescrito por local stale sem timestamp em images/links/classification/altPlacements (reprodução REV26)', () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const cleanRemoteEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/clean', assetId: 'CLEAN' })],
    links: ['https://exemplo.com/clean'],
    classification: 'Correta',
    altPlacements: ['Sítio B']
    // sem _userUpdatedAt — exatamente o caso real (nuvem já corrigida, sem edição de editor)
  };
  const staleLocalEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/stale', assetId: 'STALE' })],
    links: ['https://exemplo.com/stale'],
    classification: 'Desatualizada',
    altPlacements: []
    // sem _userUpdatedAt — IndexedDB nunca sincronizado desde o incidente anterior
  };
  device.context.DATA = [staleLocalEntry];
  const remote = { data: [cleanRemoteEntry], review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');

  assert.deepEqual(Array.from(merged.links), ['https://exemplo.com/clean'], 'links stale locais não podem sobrescrever os remotos limpos');
  assert.equal(merged.classification, 'Correta', 'classification stale local não pode sobrescrever a remota limpa');
  assert.deepEqual(Array.from(merged.altPlacements), ['Sítio B'], 'altPlacements stale locais não podem sobrescrever os remotos limpos');
  // ALTERAÇÃO 079b (decisão explícita) — imagens NÃO seguem a mesma regra
  // dos escalares acima: a união aditiva pré-existente (ALTERAÇÃO 073 —
  // ausência sem tombstone nunca apaga localmente) continua intacta na
  // CÓPIA LOCAL. A proteção contra a imagem stale (57 das 146 divergências
  // da REV26) atua só no que é ENVIADO à nuvem — ver Teste 6c abaixo.
  const assetIds = new Set(Array.from(merged.images).map((i) => i.assetId));
  assert.deepEqual(assetIds, new Set(['CLEAN', 'STALE']), 'cópia local mantém a união completa (073 preservado)');
});

test('PROTEÇÃO 079b - Teste 6c: imagem stale só-local sem evidência não é ENVIADA à nuvem (mas continua na cópia local — 073 preservado)', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const cleanRemoteEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/clean', assetId: 'CLEAN' })]
  };
  const staleLocalEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/stale', assetId: 'STALE' })]
  };
  device.context.DATA = [staleLocalEntry];
  const remote = { data: [cleanRemoteEntry], review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  const localAssetIds = new Set(Array.from(merged.images).map((i) => i.assetId));
  assert.deepEqual(localAssetIds, new Set(['CLEAN', 'STALE']), 'cópia local mantém a união completa (073 preservado)');

  device.context.lastKnownCloudRevision = 0;
  const ok = await device.context.writeShardedState(5000);
  assert.equal(ok, true);
  const pushedItems = Array.from(cloud.peekChunkItems(0));
  const pushedEntry = pushedItems.find((e) => e.id === 'seed_1');
  const pushedAssetIds = new Set((pushedEntry.images || []).map((i) => i.assetId));
  assert.deepEqual(pushedAssetIds, new Set(['CLEAN']), 'imagem stale só-local não pode ser enviada à nuvem sem evidência de edição');
});

test('PROTEÇÃO 079b - Teste 6d: imagem REALMENTE adicionada localmente (com _userUpdatedAt) continua no push — A+B preservados', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const cleanRemoteEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/A', assetId: 'A' })]
  };
  const localEntryComEdicaoReal = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/A', assetId: 'A' }), img({ publicId: 'atlas-radiologico/B', assetId: 'B' })],
    _userUpdatedAt: Date.now() // evidência real: usuário adicionou B via editor/Quiz
  };
  device.context.DATA = [localEntryComEdicaoReal];
  const remote = { data: [cleanRemoteEntry], review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  assert.deepEqual(new Set(Array.from(merged.images).map((i) => i.assetId)), new Set(['A', 'B']), 'cópia local com A+B');

  device.context.lastKnownCloudRevision = 0;
  const ok = await device.context.writeShardedState(5000);
  assert.equal(ok, true);
  const pushedEntry = Array.from(cloud.peekChunkItems(0)).find((e) => e.id === 'seed_1');
  const pushedIds = new Set((pushedEntry.images || []).map((i) => i.assetId));
  assert.deepEqual(pushedIds, new Set(['A', 'B']), 'B com evidência de edição real precisa ser enviado junto com A');
});

test('PROTEÇÃO 079b - Teste 6e: imagem tombstonada LOCALMENTE jamais ressuscita, mesmo sem evidência de edição em nenhum lado', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [makeSeedEntry({ id: 'seed_1', images: [img({ publicId: 'atlas-radiologico/A', assetId: 'A' }), img({ publicId: 'atlas-radiologico/B', assetId: 'B' })] })] });
  await device.boot();
  // Tombstone REAL, gerado pela função real (explicitDelete usa
  // recordImageTombstone internamente — precisa ser assim, não um objeto
  // atribuído de fora, porque IMAGE_TOMBSTONES é um `let` interno ao motor
  // vm deste teste, desacoplado da propriedade externa do contexto).
  await explicitDelete(device, 'seed_1', (i) => i.assetId === 'B');

  // B "stale" reaparece localmente (ex.: snapshot antigo restaurado) — sem
  // NENHUMA evidência de edição em nenhum lado.
  const entry = device.context.DATA.find((e) => e.id === 'seed_1');
  entry.images.push(img({ publicId: 'atlas-radiologico/B', assetId: 'B' }));

  const remote = {
    data: [{ id: 'seed_1', name: entry.name, s: entry.s, site: entry.site, images: [img({ publicId: 'atlas-radiologico/A', assetId: 'A' })] }],
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {}
  };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  const ids = new Set(Array.from(merged.images).map((i) => i.assetId));
  assert.deepEqual(ids, new Set(['A']), 'B tombstonada localmente não pode ressuscitar nem na cópia local');
});

test('PROTEÇÃO 079b - Teste 6f: tombstone vindo só do REMOTO também impede que imagem local stale seja reincorporada', () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const localEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/A', assetId: 'A' }), img({ publicId: 'atlas-radiologico/B', assetId: 'B' })]
  };
  device.context.DATA = [localEntry];
  const remote = {
    data: [{ id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1, images: [img({ publicId: 'atlas-radiologico/A', assetId: 'A' })] }],
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {},
    // tombstone só no lado remoto — nunca registrado neste device (outro
    // dispositivo excluiu B explicitamente e publicou o tombstone).
    tombstones: { 'seed_1asset:B': { key: 'asset:B', lesionId: 'seed_1', deletedAt: new Date().toISOString() } }
  };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  const ids = new Set(Array.from(merged.images).map((i) => i.assetId));
  assert.deepEqual(ids, new Set(['A']), 'tombstone remoto precisa impedir B mesmo vindo do local sem registro próprio');
});

test('PROTEÇÃO 079b - Teste 6g: metadados de uma imagem presente nos dois lados não são destruídos pelo filtro de evidência', () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const sharedImg = img({ publicId: 'atlas-radiologico/A', assetId: 'A', label: 'RM T2', assignedAt: '2026-01-01T00:00:00.000Z' });
  const localEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [{ ...sharedImg }]
  };
  const remoteEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [{ ...sharedImg }]
  };
  device.context.DATA = [localEntry];
  const remote = { data: [remoteEntry], review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  assert.equal(merged.images.length, 1, 'imagem presente nos dois lados não pode duplicar');
  assert.equal(merged.images[0].label, 'RM T2', 'label não pode ser perdido');
  assert.equal(merged.images[0].assignedAt, '2026-01-01T00:00:00.000Z', 'assignedAt não pode ser perdido');
});

test('PROTEÇÃO 079b - Teste 6b: imagem só-REMOTA continua sempre incorporada no reconcile untimed (nunca perde o que já está confirmado na nuvem)', () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const remoteEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [img({ publicId: 'atlas-radiologico/so-remoto', assetId: 'REMOTO' })]
    // sem _userUpdatedAt — mesmo caso untimed do Teste 6, só que agora a
    // imagem exclusiva está do lado REMOTO, não do local.
  };
  const localEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: []
  };
  device.context.DATA = [localEntry];
  const remote = { data: [remoteEntry], review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  const assetIds = new Set(Array.from(merged.images).map((i) => i.assetId));
  assert.deepEqual(assetIds, new Set(['REMOTO']), 'imagem só-remota precisa ser incorporada mesmo sem nenhuma evidência de edição dos dois lados');
});

test('PROTEÇÃO 079 - Parte B, Teste 7: edição local REAL com _userUpdatedAt mais novo continua preservada no reconcile', () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  const remoteEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [], links: ['https://exemplo.com/antigo'], classification: 'Antiga',
    _userUpdatedAt: 1000
  };
  const editedLocalEntry = {
    id: 'seed_1', name: 'Lesão 1', s: 'Seção', site: 'Sítio', inc: 1,
    images: [], links: ['https://exemplo.com/editado'], classification: 'Editada pelo usuário',
    _userUpdatedAt: 5000 // mais novo que o remoto — edição real feita no editor
  };
  device.context.DATA = [editedLocalEntry];
  const remote = { data: [remoteEntry], review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones: {} };
  device.context.reconcileStateWithRemote(remote);
  const merged = device.context.DATA.find((e) => e.id === 'seed_1');
  assert.deepEqual(Array.from(merged.links), ['https://exemplo.com/editado'], 'edição local mais nova precisa prevalecer sobre o remoto mais antigo');
  assert.equal(merged.classification, 'Editada pelo usuário', 'classification editada localmente precisa prevalecer');
});

test('PROTEÇÃO 079 - Parte C, Teste 8: mutar DATA global depois de chamar writeShardedState() não altera o que é gravado (snapshot síncrono antes do 1º await)', async () => {
  const cloud = makeFakeCloud();
  const device = makeDevice(cloud, { seed: [] });
  device.context.DATA = [makeSeedEntry({ id: 'seed_1', name: 'Antes da mutação' })];
  device.context.lastKnownCloudRevision = 0;
  const writePromise = device.context.writeShardedState(5000);
  // Muta os globais no MESMO tick síncrono, antes de qualquer await real
  // resolver — simula um pull concorrente ou uma edição mutando DATA entre
  // a chamada e a confirmação da escrita.
  device.context.DATA[0].name = 'Mutado depois da chamada';
  device.context.DATA.push(makeSeedEntry({ id: 'seed_pos_await', name: 'Não pode ser gravado' }));
  const ok = await writePromise;
  assert.equal(ok, true);
  const items = cloud.peekChunkItems(0);
  assert.equal(items.length, 1, 'a lesão adicionada depois da chamada não pode ter sido incluída na escrita');
  assert.equal(items[0].name, 'Antes da mutação', 'o snapshot gravado precisa ser o de ANTES da mutação pós-chamada, não o de depois');
});

test('PROTEÇÃO 079 - Parte D, Teste 9: push sem nenhuma mudança semântica é no-op — revision não incrementa, dirty é limpo mesmo assim', async () => {
  const cloud = makeFakeCloud();
  // img/localImg explícitos (mesmos defaults que mergeEntryNonDestructive
  // sempre grava em qualquer registro que passe por um merge de dois lados):
  // sem isso, o reconcile-before-push do device B (que SEMPRE roda dentro de
  // pushToFirebaseNow, mesmo quando o conteúdo é idêntico) acrescentaria
  // essas duas chaves à sua cópia local e o comparativo estrutural do no-op
  // nunca bateria com o remoto cru — um artefato do fixture, não do bug real.
  const seed = [makeSeedEntry({ id: 'seed_1', name: 'Lesão 1', images: [img({ publicId: 'atlas-radiologico/1', assetId: 'A1' })], img: '', localImg: false })];
  const deviceA = makeDevice(cloud, { seed });
  await deviceA.markDirty();
  await deviceA.boot(); // publica revision 1
  const revisionAfterFirstPush = cloud.peekRevision();
  assert.equal(revisionAfterFirstPush, 1);

  // Device B: mesmo conteúdo EXATO já publicado na nuvem, montado direto
  // (sem passar por boot()/pull).
  const deviceB = makeDevice(cloud, { seed: [] });
  deviceB.context.DATA = JSON.parse(JSON.stringify(seed));
  deviceB.context.lastKnownCloudRevision = revisionAfterFirstPush;
  deviceB.context.appStateReady = true;
  // Simula "algo marcou dirty sem mudança semântica real" (ex.: uma migração
  // idempotente de boot) — o cenário exato dos episódios de no-op das
  // revisões 22/24 que a Parte D existe pra evitar.
  await deviceB.markDirty();
  await deviceB.context.pushToFirebaseNow();

  assert.equal(cloud.peekRevision(), revisionAfterFirstPush, 'revision não pode ter incrementado — nenhuma mudança semântica real pra publicar');
  assert.equal(deviceB.context.syncDirty, false, 'syncDirty precisa ser limpo mesmo no caminho no-op');
  assert.equal(deviceB.context.syncPushPending, false, 'no-op conta como sucesso, não como pendência');
});


// ===========================================================================
// PROTEÇÃO 079c — reprodução do incidente rev27→rev28 (62 imagens stale
// chegaram à nuvem com 079/079b já publicadas). Remoto limpo: lesão X com
// [A]. Local stale (IndexedDB antigo): mesma lesão X com [A,B,C], SEM
// _userUpdatedAt mais novo e SEM tombstone de B/C. Cada caminho real de
// escrita é exercitado; a nuvem final precisa continuar [A] e a cópia local
// pode continuar [A,B,C] (política 073).
// ===========================================================================
const T079C = 1789900000000;
function img079c(id) { return img({ publicId: 'atlas-radiologico/' + id, assetId: id }); }
async function seedCleanCloud079c(cloud, entries, { revision = 29, tombstones = {} } = {}) {
  await cloud.FB_META_REF().set({
    review: {}, srs: {}, sessionLog: {}, sectionOrder: [], siteOrder: {}, tombstones,
    chunkCount: 1, stateSchemaVersion: 4, revision
  });
  await cloud.FB_CHUNK_REF(0).set({ items: JSON.parse(JSON.stringify(entries)) });
}
function cloudImageIds079c(cloud, id = 'seed_1') {
  const e = Array.from(cloud.peekChunkItems(0)).find((x) => x.id === id);
  return e ? Array.from(e.images || [], (i) => i.assetId).sort() : null;
}
function localImageIds079c(device, id = 'seed_1') {
  const e = Array.from(device.context.DATA).find((x) => x.id === id);
  return e ? Array.from(e.images || [], (i) => i.assetId).sort() : null;
}
async function waitForCloudRevision079c(cloud, from, ms = 3000) {
  const t0 = Date.now();
  while (cloud.peekRevision() === from && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25));
}
function remoteEntry079c(rt) {
  const e = makeSeedEntry({ images: [img079c('A')] });
  if (rt) e._userUpdatedAt = rt;
  return e;
}
function staleLocalEntry079c(lt) {
  const e = makeSeedEntry({ images: [img079c('A'), img079c('B'), img079c('C')] });
  if (lt) e._userUpdatedAt = lt;
  return e;
}
const STAMP_CASES_079C = [
  { label: 'sem timestamp nos dois lados', lt: 0, rt: 0 },
  { label: 'mesmo _userUpdatedAt nos dois lados (limpeza canônica sem carimbo novo)', lt: T079C, rt: T079C },
  { label: 'local com _userUpdatedAt MAIS ANTIGO que o remoto', lt: T079C - 60000, rt: T079C },
  { label: 'local SEM carimbo e remoto com carimbo', lt: 0, rt: T079C }
];
const WRITE_PATHS_079C = [
  { label: 'boot com syncDirty persistido (trailing push de syncFromFirebase + push final do boot)', preBoot: async (d) => { await d.context.storage.set('atlas:syncDirty', 'true'); }, run: async () => {} },
  { label: 'saveData() -> pushToFirebaseNow()', run: async (d) => { await d.save(); } },
  { label: 'Salvar do editor (reconcileBeforePush + writeShardedStateSerialized direto)', run: async (d) => {
      const recon = await d.context.reconcileBeforePush('editor-save');
      assert.equal(recon.ok, true);
      await d.context.writeShardedStateSerialized(6000);
    } },
  { label: 'saveSRS() -> pushToFirebase() debounced', run: async (d, cloud) => {
      const rev = cloud.peekRevision();
      d.context.SRS = { seed_1: { interval: 1, due: 1, streak: 1, updatedAt: Date.now() } };
      await d.context.saveSRS();
      await waitForCloudRevision079c(cloud, rev);
    } },
  { label: 'saveReview() -> pushToFirebase() debounced', run: async (d, cloud) => {
      const rev = cloud.peekRevision();
      d.context.REVIEW = { seed_1: 2 };
      await d.context.saveReview();
      await waitForCloudRevision079c(cloud, rev);
    } },
  { label: 'syncThisDeviceToCloud() (envio manual com preflight)', run: async (d) => { await d.context.syncThisDeviceToCloud(); } },
  { label: 'forceThisDeviceToCloud() (skipPreflight:true)', run: async (d) => { await d.context.forceThisDeviceToCloud(); } },
  { label: 'duas escritas diretas seguidas (writeChainV247; a 1a consome o mapa 079b)', run: async (d) => {
      await d.context.writeShardedStateSerialized(5000);
      d.context.REVIEW = { seed_1: 1 };
      await d.context.writeShardedStateSerialized(5000);
    } },
  { label: 'retry de conflito de revisão (writeShardedStateWithConflictRetry)', run: async (d, cloud) => {
      const meta = cloud.peekMeta();
      await cloud.FB_META_REF().set({ ...meta, revision: meta.revision + 1 }); // outro device escreveu
      await d.context.writeShardedStateSerialized(5000);
    } }
];
for (const sc of STAMP_CASES_079C) {
  for (const wp of WRITE_PATHS_079C) {
    test(`PROTEÇÃO 079c: imagem stale só-local nunca chega à nuvem — ${sc.label} — via ${wp.label}`, async () => {
      const cloud = makeFakeCloud();
      await seedCleanCloud079c(cloud, [remoteEntry079c(sc.rt)]);
      const device = makeDevice(cloud, { seed: [staleLocalEntry079c(sc.lt)] });
      if (wp.preBoot) await wp.preBoot(device);
      await device.boot();
      await wp.run(device, cloud);
      assert.deepEqual(cloudImageIds079c(cloud), ['A'], 'payload remoto final precisa ser exatamente [A]');
      assert.deepEqual(localImageIds079c(device), ['A', 'B', 'C'], 'cópia local continua [A,B,C] (073: ausência sem tombstone nunca apaga localmente)');
    });
  }
}

test('PROTEÇÃO 079d (substitui 079c): imagem incluída de verdade (addImageToLesionData, marcador persistente) é enviada — [A,B] por todos os caminhos', async () => {
  for (const wp of WRITE_PATHS_079C.filter((w) => !w.preBoot)) {
    const cloud = makeFakeCloud();
    await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)]);
    const device = makeDevice(cloud, { seed: [remoteEntry079c(T079C)] });
    await device.boot();
    await device.addImage('seed_1', img079c('B'));
    await device.markDirty();
    await wp.run(device, cloud);
    assert.deepEqual(cloudImageIds079c(cloud), ['A', 'B'], 'inclusão real marcada precisa chegar à nuvem via ' + wp.label);
    assert.deepEqual(JSON.parse(JSON.stringify(device.context.__getPendingAdds079d())), {}, 'marcador removido após confirmação via ' + wp.label);
  }
});

test('PROTEÇÃO 079d (F): lesão nova criada localmente sobe com as imagens marcadas; registro stale ausente no remoto NÃO sobe imagens sem marcador', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)]);
  const staleOrfa = makeSeedEntry({ id: 'custom_stale', name: 'Stale', images: [img079c('S1')], _userUpdatedAt: T079C + 999999 });
  const device = makeDevice(cloud, { seed: [remoteEntry079c(T079C), staleOrfa] });
  await device.boot();
  device.context.DATA.push(makeSeedEntry({ id: 'custom_1', name: 'Nova', images: [], _userUpdatedAt: Date.now() }));
  await device.addImage('custom_1', img079c('N1'));
  await device.save();
  assert.deepEqual(cloudImageIds079c(cloud, 'custom_1'), ['N1']);
  assert.deepEqual(cloudImageIds079c(cloud, 'custom_stale'), [], 'imagem de registro stale sem marcador não sobe');
  assert.deepEqual(localImageIds079c(device, 'custom_stale'), ['S1'], 'mas continua local (073)');
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
});

test('PROTEÇÃO 079c: tombstone REMOTO bloqueia ressurreição mesmo no force (sem reconcile) e com edição local mais nova; tombstones remotos nunca somem do payload', async () => {
  const cloud = makeFakeCloud();
  const bKey = 'asset:B';
  const remoteTomb = { ['seed_1\u0001' + bKey]: { key: bKey, lesionId: 'seed_1', deletedAt: '2026-09-24T10:00:00.000Z' } };
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)], { tombstones: remoteTomb });
  const device = makeDevice(cloud, { seed: [] });
  // Estado montado direto (sem boot/pull): o force nunca reconcilia antes.
  device.context.DATA = [makeSeedEntry({ images: [img079c('A'), img079c('B')], _userUpdatedAt: T079C + 5000 })];
  device.context.appStateReady = true;
  device.context.lastKnownCloudRevision = 29;
  await device.context.forceThisDeviceToCloud();
  assert.equal(cloud.peekRevision(), 30, 'o force escreveu');
  assert.deepEqual(cloudImageIds079c(cloud), ['A'], 'B tombstonado na nuvem não pode ressuscitar');
  const tombs = cloud.peekMeta().tombstones || {};
  assert.ok(Object.values(tombs).some((t) => t && t.key === bKey && t.lesionId === 'seed_1'), 'tombstone remoto preservado no payload');
});

test('PROTEÇÃO 079c: tombstone LOCAL bloqueia ressurreição no envio normal', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry({ images: [img079c('A'), img079c('B')], _userUpdatedAt: T079C })]);
  const device = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img079c('A'), img079c('B')], _userUpdatedAt: T079C })] });
  await device.boot();
  const entry = device.context.DATA.find((e) => e.id === 'seed_1');
  await device.context.recordImageTombstone(entry.images.find((i) => i.assetId === 'B'), 'seed_1');
  entry.images = entry.images.filter((i) => i.assetId !== 'B');
  entry._userUpdatedAt = T079C + 10000;
  await device.save();
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
  // outro device stale com B, sem carimbo novo: nunca ressuscita
  const stale = makeDevice(cloud, { seed: [makeSeedEntry({ images: [img079c('A'), img079c('B')], _userUpdatedAt: T079C })] });
  await stale.context.storage.set('atlas:syncDirty', 'true');
  await stale.boot();
  await stale.context.forceThisDeviceToCloud();
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
});

test('PROTEÇÃO 079c: no-op guard da 079 preservado — estado idêntico ao remoto não gasta revisão', async () => {
  const cloud = makeFakeCloud();
  // img/localImg explícitos: o merge sempre grava esses dois campos (mesmo
  // artefato de fixture documentado no teste de no-op da 079 Parte D).
  const same = () => ({ ...remoteEntry079c(T079C), img: '', localImg: false });
  await seedCleanCloud079c(cloud, [same()]);
  const device = makeDevice(cloud, { seed: [same()] });
  await device.boot();
  await device.markDirty();
  await device.context.pushToFirebaseNow();
  assert.equal(cloud.peekRevision(), 29);
  assert.equal(device.context.syncDirty, false);
});

test('PROTEÇÃO 079d (resolve o residual da 079c): inclusão real com carimbo de lesão MAIS ANTIGO que o remoto sobe mesmo assim; sem marcador fica só local', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C + 100000)]); // outro PC editou depois
  const device = makeDevice(cloud, { seed: [remoteEntry079c(T079C + 100000)] });
  await device.boot();
  const e = device.context.DATA.find((x) => x.id === 'seed_1');
  e.images.push(img079c('N'));
  e._userUpdatedAt = T079C; // relógio/edição mais antiga que a versão remota
  await device.save();
  assert.deepEqual(cloudImageIds079c(cloud), ['A'], 'sem marcador, não sobe');
  assert.deepEqual(localImageIds079c(device), ['A', 'N'], 'continua na cópia local (nada perdido)');
  await device.addImage('seed_1', img079c('M'));
  device.context.DATA.find((x) => x.id === 'seed_1')._userUpdatedAt = T079C; // carimbo continua antigo
  await device.save();
  assert.deepEqual(cloudImageIds079c(cloud), ['A', 'M'], 'inclusão real marcada sobe mesmo com carimbo antigo; N (sem marcador) continua fora');
});

test('PROTEÇÃO 079c: no-op guard enxerga o payload filtrado — device stale sem nenhuma mudança publicável NÃO gasta revisão', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [{ ...remoteEntry079c(T079C), img: '', localImg: false }]);
  const device = makeDevice(cloud, { seed: [{ ...staleLocalEntry079c(T079C), img: '', localImg: false }] });
  await device.context.storage.set('atlas:syncDirty', 'true');
  await device.boot();
  assert.equal(cloud.peekRevision(), 29, 'nenhuma escrita: o que sobraria no payload já é idêntico à nuvem');
  assert.equal(device.context.syncDirty, false, 'dirty limpo pelo no-op');
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
});


// ===========================================================================
// PROTEÇÃO 079d — intenção EXPLÍCITA e persistente para imagem só-local.
// ===========================================================================
// Teste 1 (essencial, falha na 079c): local stale com _userUpdatedAt MAIS
// NOVO que o remoto (ex.: restore canônico com carimbo antigo) e SEM
// marcador — por TODOS os caminhos de escrita (itens 8–12 e 14).
for (const wp of WRITE_PATHS_079C) {
  test(`PROTEÇÃO 079d - 1: local stale A+B+C com _userUpdatedAt MAIS NOVO que o remoto e SEM marcador => remoto continua [A] — via ${wp.label}`, async () => {
    const cloud = makeFakeCloud();
    await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)]);
    const device = makeDevice(cloud, { seed: [staleLocalEntry079c(T079C + 3600000)] });
    if (wp.preBoot) await wp.preBoot(device);
    await device.boot();
    await wp.run(device, cloud);
    assert.deepEqual(cloudImageIds079c(cloud), ['A']);
    assert.deepEqual(localImageIds079c(device), ['A', 'B', 'C'], '073: local preservado');
  });
}

async function deviceWithMarkedB079d() {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)]);
  const device = makeDevice(cloud, { seed: [remoteEntry079c(T079C)] });
  await device.boot();
  await device.addImage('seed_1', img079c('B'));
  await device.markDirty();
  return { cloud, device };
}
function markerKeys079d(device, lesionId = 'seed_1') {
  return Object.keys(device.context.__getPendingAdds079d()[lesionId] || {});
}
async function storedMarkers079d(device) {
  try { return JSON.parse((await device.context.storage.get('atlas:pendingLocalImageAdds')).value); } catch (_e) { return null; }
}

test('PROTEÇÃO 079d - 2/3/13: usuário adiciona B => marcador persistente com a chave canônica; saveData envia [A,B]; confirmação remove o marcador (memória e storage)', async () => {
  const { cloud, device } = await deviceWithMarkedB079d();
  const keyB = device.context.stableImageKeyV208(img079c('B'));
  assert.deepEqual(markerKeys079d(device), [keyB], 'marcador usa stableImageKeyV208 (mesma chave dos tombstones)');
  assert.deepEqual(Object.keys((await storedMarkers079d(device)).seed_1), [keyB], 'persistido no storage');
  await device.save();
  assert.deepEqual(cloudImageIds079c(cloud), ['A', 'B']);
  assert.deepEqual(markerKeys079d(device), [], 'removido após write confirmado');
  assert.deepEqual(await storedMarkers079d(device), {}, 'removido também do storage');
});

for (const failure of [
  { label: 'erro de rede', make: () => Object.assign(new Error('network error'), { code: 'unavailable' }) },
  { label: 'permission-denied', make: () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }) }
]) {
  test(`PROTEÇÃO 079d - 4/5: ${failure.label} na escrita => marcador de B permanece (memória e storage) e nuvem intacta`, async () => {
    const { cloud, device } = await deviceWithMarkedB079d();
    const realTx = cloud.runTransaction;
    device.context.fbDb = { runTransaction: async () => { throw failure.make(); } };
    await device.context.pushToFirebaseNow();
    assert.deepEqual(cloudImageIds079c(cloud), ['A']);
    assert.equal(markerKeys079d(device).length, 1, 'marcador continua em memória');
    assert.equal(Object.keys((await storedMarkers079d(device)).seed_1 || {}).length, 1, 'marcador continua no storage');
    assert.equal(device.context.syncDirty, true, 'dirty preservado');
    device.context.fbDb = { runTransaction: realTx };
    await device.context.pushToFirebaseNow();
    assert.deepEqual(cloudImageIds079c(cloud), ['A', 'B'], 'rede de volta: B sobe');
    assert.equal(markerKeys079d(device).length, 0);
  });
}

test('PROTEÇÃO 079d - 6: conflito de revisão (inclusive retry que falha de novo) mantém o marcador até a confirmação final', async () => {
  const { cloud, device } = await deviceWithMarkedB079d();
  const realTx = cloud.runTransaction;
  // Toda tentativa encontra a nuvem numa revisão nova (outro device escrevendo).
  device.context.fbDb = { runTransaction: async (fn) => {
    const meta = cloud.peekMeta();
    await cloud.FB_META_REF().set({ ...meta, revision: meta.revision + 1 });
    return realTx(fn);
  } };
  const ok = await device.context.writeShardedStateSerialized(5000);
  assert.equal(ok, false, 'conflito na 1a tentativa e no retry');
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
  assert.equal(markerKeys079d(device).length, 1, 'marcador permanece após conflito+retry');
  device.context.fbDb = { runTransaction: realTx };
  const ok2 = await device.context.writeShardedStateSerialized(5000);
  assert.equal(ok2, true, 'retry com conflito reconcilia e confirma');
  assert.deepEqual(cloudImageIds079c(cloud), ['A', 'B']);
  assert.equal(markerKeys079d(device).length, 0, 'só sai após confirmação final');
});

test('PROTEÇÃO 079d - 7: marcador sobrevive a reload (lido do storage no boot) e autoriza o envio depois', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)]);
  const device = makeDevice(cloud, { seed: [remoteEntry079c(T079C)] });
  await device.boot();
  const realTx = cloud.runTransaction;
  device.context.fbDb = { runTransaction: async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); } };
  await device.addImage('seed_1', img079c('B'));
  await device.save(); // falha: fica local + dirty + marcador
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
  device.context.__setPendingAdds079d({}); // "fecha a aba": memória perdida
  device.context.fbDb = { runTransaction: realTx };
  await device.boot(); // reload: loadPendingLocalImageAdds + trailing push (dirty)
  assert.equal(markerKeys079d(device).length, 0, 'confirmado após o envio do reload');
  assert.deepEqual(cloudImageIds079c(cloud), ['A', 'B'], 'marcador restaurado do storage autorizou B');
});

test('PROTEÇÃO 079d - 7b: boot/pull NUNCA cria marcador para imagem que já estava no IndexedDB', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C)]);
  const device = makeDevice(cloud, { seed: [staleLocalEntry079c(T079C + 3600000)] });
  await device.context.storage.set('atlas:syncDirty', 'true');
  await device.boot();
  assert.deepEqual(JSON.parse(JSON.stringify(device.context.__getPendingAdds079d())), {});
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
});

test('PROTEÇÃO 079d - marcador de imagem que outro device já publicou é confirmado pela leitura do remoto (não reautoriza depois de um restore)', async () => {
  const { cloud, device } = await deviceWithMarkedB079d();
  // Outro device publicou B antes deste conseguir escrever.
  await cloud.FB_CHUNK_REF(0).set({ items: [makeSeedEntry({ images: [img079c('A'), img079c('B')], _userUpdatedAt: T079C })] });
  const meta = cloud.peekMeta();
  await cloud.FB_META_REF().set({ ...meta, revision: meta.revision + 1 });
  await device.context.syncFromFirebase();
  assert.equal(markerKeys079d(device).length, 0, 'remoto já contém B: marcador sai');
  // Restore canônico volta a nuvem para [A]: B local (sem marcador) não pode ressurgir.
  await seedCleanCloud079c(cloud, [remoteEntry079c(T079C - 1000)], { revision: cloud.peekRevision() + 1 });
  await device.boot();
  await device.markDirty();
  await device.context.pushToFirebaseNow();
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
});

test('PROTEÇÃO 079d - 15: tombstone remoto vence o marcador — imagem marcada e depois excluída em outro PC não ressuscita (force incluído)', async () => {
  const { cloud, device } = await deviceWithMarkedB079d();
  const keyB = device.context.stableImageKeyV208(img079c('B'));
  const meta = cloud.peekMeta();
  await cloud.FB_META_REF().set({ ...meta, tombstones: { ['seed_1\u0001' + keyB]: { key: keyB, lesionId: 'seed_1', deletedAt: '2099-01-01T00:00:00.000Z' } } });
  await device.context.forceThisDeviceToCloud();
  assert.deepEqual(cloudImageIds079c(cloud), ['A'], 'force não contorna tombstone remoto');
  await device.context.pushToFirebaseNow();
  assert.deepEqual(cloudImageIds079c(cloud), ['A']);
});

// ===========================================================================
// PROTEÇÃO 084 — LESION_REVISIONS sincronizada entre dispositivos (nuvem
// falsa compartilhada; writeShardedState/readShardedState/reconcile/pull REAIS).
// ===========================================================================
function rev084(id, over) {
  return Object.assign({
    id, lesionId: 'seed_1', createdAt: 1000, updatedAt: 1000, status: 'pending',
    requestText: 'pedido ' + id, solution: null, attempts: [], humanFeedback: [],
    history: [{ timestamp: 1000, action: 'created', details: null }]
  }, over || {});
}
async function device084(cloud, revisions) {
  const d = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await d.boot();
  d.context.LESION_REVISIONS = JSON.parse(JSON.stringify(revisions || {}));
  return d;
}
// ação REAL do usuário na Central (mesmo contrato das funções do módulo):
// muta LESION_REVISIONS -> saveLesionRevisions() -> dirty + push; o teste
// dispara o push imediato em vez de esperar o debounce de 400ms.
async function userRevisionAction084(device, mutate) {
  mutate(device.context.LESION_REVISIONS);
  await device.context.saveLesionRevisions();
  assert.equal(device.context.syncDirty, true, 'ação do usuário precisa marcar dirty');
  await device.context.pushToFirebaseNow();
}
const cloudRevs084 = (cloud) => JSON.parse(JSON.stringify((cloud.peekMeta() || {}).lesionRevisions || {}));

test('PROTEÇÃO 084 - PC A cria revisão -> nuvem recebe; PC B (já inicializado) abre e recebe SEM marcar dirty nem escrever', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1'); });
  assert.deepEqual(Object.keys(cloudRevs084(cloud)), ['R1']);
  assert.equal(a.context.syncDirty, false, 'escrita confirmada limpa o dirty');
  const revAfterA = cloud.peekRevision();
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await b.boot();
  assert.deepEqual(Object.keys(b.context.LESION_REVISIONS), ['R1'], 'PC B recebe a revisão no pull');
  assert.equal(b.context.LESION_REVISIONS.R1.status, 'pending');
  assert.equal(b.context.syncDirty, false, 'pull NUNCA marca dirty');
  assert.equal(cloud.peekRevision(), revAfterA, 'abrir o PC B não gasta escrita (sem loop)');
  assert.ok(await b.context.storage.get('atlas:lesionRevisions'), 'pull persiste localmente (IndexedDB)');
});

test('PROTEÇÃO 084 - badges 🔔/💡 do PC B atualizam no pull, sem F5', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1'); L.R2 = rev084('R2', { status: 'proposed', updatedAt: 1500 }); });
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  const btn = () => ({ classList: { empty: null, toggle(c, v) { this.empty = v; } } });
  const els = { 'pending-reviews-btn': btn(), 'pending-reviews-badge': { textContent: '' }, 'ready-solutions-btn': btn(), 'ready-solutions-badge': { textContent: '' } };
  b.context.document = { getElementById: (id) => els[id] || null };
  await b.boot();
  assert.equal(els['pending-reviews-badge'].textContent, '1', '🔔 mostra a revisão pendente vinda do PC A');
  assert.equal(els['ready-solutions-badge'].textContent, '1', '💡 mostra a proposta vinda do PC A');
  assert.equal(els['pending-reviews-btn'].classList.empty, false);
});

test('PROTEÇÃO 086 - revisão criada no PC A: ⚠ junto ao nome da lesão aparece no PC B após o pull, sem F5 e sem campo remoto novo', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1', { status: 'manual_action_required' }); });
  const meta = cloud.peekMeta();
  assert.deepEqual(Object.keys(meta).filter((k) => /warning|activeReview/i.test(k)), [], 'alerta é derivado, nunca gravado');
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  const hostChildren = [];
  const host = {
    getAttribute: () => 'seed_1',
    querySelectorAll: () => hostChildren.slice(),
    insertAdjacentHTML: (_pos, markup) => { const c = { markup, remove() { hostChildren.splice(hostChildren.indexOf(c), 1); } }; hostChildren.push(c); }
  };
  b.context.document = { getElementById: () => null, querySelectorAll: () => [host] };
  await b.boot();
  assert.equal(hostChildren.length, 1, '⚠ inserido pelo refresh do pull');
  assert.match(hostChildren[0].markup, /title="Esta lesão possui revisão ativa"/);
  assert.equal(b.context.syncDirty, false);
});

test('PROTEÇÃO 084 - concorrência: R1 em A e R2 em B -> nuvem e os dois dispositivos terminam com a UNIÃO', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  const b = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1'); });
  await userRevisionAction084(b, (L) => { L.R2 = rev084('R2'); }); // B tinha revisão antiga: conflito -> reconcile -> união
  assert.deepEqual(Object.keys(cloudRevs084(cloud)).sort(), ['R1', 'R2']);
  assert.deepEqual(Object.keys(b.context.LESION_REVISIONS).sort(), ['R1', 'R2']);
  await a.context.syncFromFirebase();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS).sort(), ['R1', 'R2']);
  assert.equal(a.context.syncDirty, false);
});

test('PROTEÇÃO 084 - mesmo id: updatedAt mais novo vence status/solution; history/attempts/feedback são UNIDOS', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1'); });
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await b.boot();
  // A: recusa com feedback (mais antigo). B: proposta nova (mais novo) com tentativa.
  await userRevisionAction084(a, (L) => {
    L.R1.status = 'rejected'; L.R1.updatedAt = 2000;
    L.R1.history.push({ timestamp: 2000, action: 'solution_rejected', details: null });
    L.R1.humanFeedback.push({ kind: 'reject', text: 'incompleto', at: 2000, attemptId: null });
  });
  await userRevisionAction084(b, (L) => {
    L.R1.status = 'applied_pending_validation'; L.R1.updatedAt = 3000;
    L.R1.solution = { summary: 'corrige notas', proposedChanges: { notes: 'n' } };
    L.R1.attempts.push({ id: 'att_b', appliedAt: 3000, beforeSnapshot: { id: 'seed_1' } });
    L.R1.history.push({ timestamp: 3000, action: 'changes_applied', details: { attemptId: 'att_b' } });
  });
  const r1 = cloudRevs084(cloud).R1;
  assert.equal(r1.status, 'applied_pending_validation', 'updatedAt mais novo vence o status');
  assert.deepEqual(r1.solution, { summary: 'corrige notas', proposedChanges: { notes: 'n' } });
  assert.deepEqual(r1.history.map((h) => h.action), ['created', 'solution_rejected', 'changes_applied'], 'history unido sem duplicar');
  assert.deepEqual(r1.attempts.map((x) => x.id), ['att_b']);
  assert.deepEqual(r1.humanFeedback.map((f) => f.text), ['incompleto'], 'feedback de A preservado mesmo perdendo o status');
  await a.context.syncFromFirebase();
  assert.deepEqual(JSON.parse(JSON.stringify(a.context.LESION_REVISIONS.R1)), r1, 'A converge para o mesmo estado da nuvem');
  assert.equal(a.context.syncDirty, false);
});

test('PROTEÇÃO 084 - no-op: estado de revisões idêntico ao da nuvem não gasta revisão; mudança SÓ de revisão não é no-op', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1'); });
  const r0 = cloud.peekRevision();
  await a.markDirty();
  await a.context.pushToFirebaseNow();
  assert.equal(cloud.peekRevision(), r0, 'nada mudou: sem escrita');
  assert.equal(a.context.syncDirty, false, 'no-op limpa o dirty');
  await userRevisionAction084(a, (L) => { L.R1.status = 'cancelled'; L.R1.updatedAt = 5000; });
  assert.equal(cloud.peekRevision(), r0 + 1, 'mudança só na Central precisa publicar');
  assert.equal(cloudRevs084(cloud).R1.status, 'cancelled');
});

test('PROTEÇÃO 084 - nuvem antiga SEM lesionRevisions continua válida; revisão local é preservada e publicada na próxima ação real', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  assert.equal('lesionRevisions' in cloud.peekMeta(), false);
  const a = makeDevice(cloud, { seed: [makeSeedEntry()] });
  a.context.LESION_REVISIONS = { OLD: rev084('OLD') };
  const r0 = cloud.peekRevision();
  await a.boot();
  assert.deepEqual(Object.keys(a.context.LESION_REVISIONS), ['OLD'], 'pull de documento antigo não apaga revisão local');
  assert.equal(cloud.peekRevision(), r0, 'boot sem ação do usuário não publica (regra 072)');
  const remote = await a.context.readShardedState(1000);
  assert.deepEqual(JSON.parse(JSON.stringify(remote.lesionRevisions)), {}, 'campo ausente = {}');
  await userRevisionAction084(a, (L) => { L.NEW = rev084('NEW'); });
  assert.deepEqual(Object.keys(cloudRevs084(cloud)).sort(), ['NEW', 'OLD']);
});

test('PROTEÇÃO 084 - escrita sem reconcile (forceThisDeviceToCloud) nunca apaga revisão que só existe na nuvem', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = await device084(cloud);
  await userRevisionAction084(a, (L) => { L.R1 = rev084('R1'); });
  const b = await device084(cloud, { R2: rev084('R2') });
  b.context.appStateReady = true;
  await b.context.forceThisDeviceToCloud();
  assert.deepEqual(Object.keys(cloudRevs084(cloud)).sort(), ['R1', 'R2'], 'união dentro da transação');
});

// ===========================================================================
// PROTEÇÃO 085 — ordem de seções/sítios entre dispositivos (loadData/
// syncFromFirebase/writeShardedState/adoção REAIS + funções reais de
// reordenação: moveSection/reorderSectionDrag/reorderSite/saveOrder/...).
// ===========================================================================
const orderUiFns085 = ['saveOrder', 'saveSiteOrder', 'orderedSectionNames', 'orderedSiteNames', 'moveSection',
  'reorderSectionDrag', 'reorderSite', 'adoptRemoteStateForNewDevice', 'applyNewDeviceBootstrapChoice']
  .map((n) => extractFunction(html, n).source).join('\n');
const DEFAULTS085 = ['Neuro', 'Tórax', 'Abdome'];
// fresh=true: IndexedDB vazio (PC novo) — o bootstrap escolhe "carregar da
// nuvem" (mesma função real applyNewDeviceBootstrapChoice('load')).
function makeOrderDevice085(cloud, { fresh = false, backing } = {}) {
  const d = makeDevice(cloud, { seed: [makeSeedEntry()] });
  const store = backing || (fresh ? {} : { data: JSON.stringify([makeSeedEntry()]) });
  const c = d.context;
  c.storage = {
    get: async (key) => { if (Object.prototype.hasOwnProperty.call(store, key)) return { value: store[key] }; throw new Error('key not found: ' + key); },
    set: async (key, value) => { store[key] = value; }
  };
  c.DEFAULT_SECTION_ORDER = DEFAULTS085;
  c.renderTree = () => {};
  c.markDeviceInitialized = () => {};
  c.runNewDeviceBootstrapFlow = async () => { await c.applyNewDeviceBootstrapChoice('load'); };
  new vm.Script(orderUiFns085).runInContext(c);
  d.store = store;
  return d;
}
const flush085 = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const plain085 = (v) => JSON.parse(JSON.stringify(v));
// PC A com ordem personalizada feita pelas funções REAIS de reordenação e publicada.
async function pcAWithCustomOrder085(cloud) {
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = makeOrderDevice085(cloud);
  await a.boot();
  a.context.sectionOrder = [...DEFAULTS085];
  a.context.siteOrder = { Neuro: ['a', 'b', 'c'], Tórax: ['x', 'y'] };
  await a.context.reorderSectionDrag('Abdome', 'Neuro');       // Abdome, Neuro, Tórax
  await a.context.moveSection('Tórax', -1);                    // Abdome, Tórax, Neuro
  a.context.reorderSite('Neuro', 2, 0);                        // c, a, b
  a.context.reorderSite('Tórax', 1, 0);                        // y, x
  await flush085();
  assert.equal(a.context.syncDirty, true, 'reordenação manual marca dirty');
  await a.context.pushToFirebaseNow();
  assert.equal(a.context.syncDirty, false);
  return a;
}
const ORDER_A085 = ['Abdome', 'Tórax', 'Neuro'];
const SITES_A085 = { Neuro: ['c', 'a', 'b'], Tórax: ['y', 'x'] };

test('PROTEÇÃO 085 - reordenar seção e sítios (funções reais) persiste local, marca dirty e sincroniza (com carimbo)', async () => {
  const cloud = makeFakeCloud();
  const a = await pcAWithCustomOrder085(cloud);
  const meta = cloud.peekMeta();
  assert.deepEqual(plain085(meta.sectionOrder), ORDER_A085);
  assert.deepEqual(plain085(meta.siteOrder), SITES_A085);
  assert.ok(meta.orderUpdatedAt.section > 0 && meta.orderUpdatedAt.sites.Neuro > 0 && meta.orderUpdatedAt.sites['Tórax'] > 0);
  assert.deepEqual(JSON.parse(a.store.order), ORDER_A085, 'persistido localmente');
});

test('PROTEÇÃO 085 - PC NOVO (IndexedDB vazio) adota exatamente a ordem da nuvem, sem dirty e sem publicar; F5 mantém', async () => {
  const cloud = makeFakeCloud();
  await pcAWithCustomOrder085(cloud);
  const rev0 = cloud.peekRevision();
  const b = makeOrderDevice085(cloud, { fresh: true });
  await b.boot();
  assert.deepEqual(plain085(b.context.sectionOrder), ORDER_A085);
  assert.deepEqual(plain085(b.context.siteOrder), SITES_A085);
  assert.equal(b.context.syncDirty, false, 'adotar a ordem remota não é edição');
  assert.equal(cloud.peekRevision(), rev0, 'bootstrap não publica defaults (nem nada)');
  // F5: mesmo IndexedDB, novo boot (dispositivo já inicializado agora)
  const b2 = makeOrderDevice085(cloud, { backing: b.store });
  await b2.boot();
  assert.deepEqual(plain085(b2.context.sectionOrder), ORDER_A085);
  assert.deepEqual(plain085(b2.context.siteOrder), SITES_A085);
  assert.equal(b2.context.syncDirty, false);
  assert.equal(cloud.peekRevision(), rev0, 'F5 não publica');
});

test('PROTEÇÃO 085 - PC JÁ INICIALIZADO com ordem default (causa raiz) adota a ordem da nuvem e uma edição posterior NÃO grava o default por cima', async () => {
  const cloud = makeFakeCloud();
  await pcAWithCustomOrder085(cloud);
  const rev0 = cloud.peekRevision();
  const store = { data: JSON.stringify([makeSeedEntry()]), order: JSON.stringify(DEFAULTS085), 'site-order': JSON.stringify({ Neuro: ['a', 'b', 'c'] }) };
  const b = makeOrderDevice085(cloud, { backing: store });
  await b.boot();
  assert.deepEqual(plain085(b.context.sectionOrder), ORDER_A085, 'antes da 085: ficava no default local');
  assert.deepEqual(plain085(b.context.siteOrder), SITES_A085);
  assert.equal(b.context.syncDirty, false);
  assert.equal(cloud.peekRevision(), rev0);
  assert.deepEqual(JSON.parse(store.order), ORDER_A085, 'pull persiste a ordem adotada localmente');
  // edição real qualquer em B (ex.: salvar uma lesão) publica — mas com a ordem certa
  b.context.DATA[0].notes = 'edição em B'; b.context.DATA[0]._userUpdatedAt = Date.now();
  await b.save();
  assert.ok(cloud.peekRevision() > rev0);
  assert.deepEqual(plain085(cloud.peekMeta().sectionOrder), ORDER_A085);
  assert.deepEqual(plain085(cloud.peekMeta().siteOrder), SITES_A085);
});

test('PROTEÇÃO 085 - dois PCs convergem: reordenação mais nova em B chega em A no pull', async () => {
  const cloud = makeFakeCloud();
  const a = await pcAWithCustomOrder085(cloud);
  const b = makeOrderDevice085(cloud, { fresh: true });
  await b.boot();
  await new Promise((r) => setTimeout(r, 5)); // carimbo estritamente mais novo
  await b.context.moveSection('Neuro', -1); // Abdome, Neuro, Tórax
  await b.context.pushToFirebaseNow();
  await a.context.syncFromFirebase();
  assert.deepEqual(plain085(a.context.sectionOrder), ['Abdome', 'Neuro', 'Tórax']);
  assert.deepEqual(plain085(a.context.siteOrder), SITES_A085, 'sítios intocados');
  assert.equal(a.context.syncDirty, false);
  assert.deepEqual(plain085(a.context.sectionOrder), plain085(b.context.sectionOrder));
});

test('PROTEÇÃO 085 - nuvem sem sectionOrder/siteOrder (legado) mantém a ordem local, sem erro nem publicação', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const meta = cloud.peekMeta(); delete meta.sectionOrder; delete meta.siteOrder;
  await cloud.FB_META_REF().set(meta);
  const rev0 = cloud.peekRevision();
  const store = { data: JSON.stringify([makeSeedEntry()]), order: JSON.stringify(['Tórax', 'Neuro']), 'site-order': JSON.stringify({ Neuro: ['b', 'a'] }) };
  const d = makeOrderDevice085(cloud, { backing: store });
  await d.boot();
  assert.deepEqual(plain085(d.context.sectionOrder), ['Tórax', 'Neuro']);
  assert.deepEqual(plain085(d.context.siteOrder), { Neuro: ['b', 'a'] });
  assert.equal(cloud.peekRevision(), rev0);
});

test('PROTEÇÃO 085 - seção/sítio novo local entra no FIM (normalização do render) sem dirty e sem publicar', async () => {
  const cloud = makeFakeCloud();
  await pcAWithCustomOrder085(cloud);
  const b = makeOrderDevice085(cloud, { fresh: true });
  await b.boot();
  const rev0 = cloud.peekRevision();
  const names = b.context.orderedSectionNames({ Abdome: 1, Tórax: 1, Neuro: 1, 'Zeta Nova': 1, 'Alfa Nova': 1 });
  const sites = b.context.orderedSiteNames('Neuro', { a: 1, b: 1, c: 1, d: 1 });
  await flush085();
  assert.deepEqual(plain085(names), [...ORDER_A085, 'Alfa Nova', 'Zeta Nova'], 'conhecidos na ordem remota, novos no fim');
  assert.deepEqual(plain085(sites), ['c', 'a', 'b', 'd']);
  assert.equal(b.context.syncDirty, false);
  assert.equal(cloud.peekRevision(), rev0, 'abrir/desenhar nunca publica (regra 072)');
});

test('PROTEÇÃO 085 - escrita sem reconcile (forceThisDeviceToCloud) de um PC com default não apaga a ordem mais nova da nuvem', async () => {
  const cloud = makeFakeCloud();
  await pcAWithCustomOrder085(cloud);
  // PC B que nunca puxou a nuvem nesta sessão (sem boot): ordem default, sem carimbo.
  const b = makeOrderDevice085(cloud);
  b.context.DATA = [makeSeedEntry()];
  b.context.sectionOrder = [...DEFAULTS085];
  b.context.siteOrder = { Neuro: ['a', 'b', 'c'] };
  b.context.appStateReady = true;
  const rev0 = cloud.peekRevision();
  b.context.lastKnownCloudRevision = rev0;
  await b.context.forceThisDeviceToCloud();
  assert.ok(cloud.peekRevision() > rev0, 'o envio forçado de fato escreveu');
  assert.deepEqual(plain085(cloud.peekMeta().sectionOrder), ORDER_A085, 'merge por carimbo dentro da transação');
  assert.deepEqual(plain085(cloud.peekMeta().siteOrder), SITES_A085);
});

// ===========================================================================
// PROTEÇÃO 087 — sequência livre de RM (img.label / panels[].seq) atravessa a
// sincronização sem ser alterada.
// ===========================================================================
test('PROTEÇÃO 087 - sequência livre ("PD FAT SAT", "T2 FAT SAT", "STIR") chega idêntica ao outro dispositivo', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await a.boot();
  const quadro = img({ publicId: 'atlas-radiologico/q087', assetId: 'Q087', label: 'RM T1 · PD FAT SAT',
    panels: [{ url: 'https://res.cloudinary.com/x/p1.jpg', seq: 'T2 FAT SAT' }, { url: 'https://res.cloudinary.com/x/p2.jpg', seq: 'STIR' }] });
  await a.addImage('seed_1', quadro);
  await a.save();
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await b.boot();
  const got = Array.from(b.context.DATA.find((e) => e.id === 'seed_1').images).find((i) => i.assetId === 'Q087');
  assert.ok(got, 'imagem chegou ao PC B');
  assert.equal(got.label, 'RM T1 · PD FAT SAT');
  assert.deepEqual(Array.from(got.panels, (p) => p.seq), ['T2 FAT SAT', 'STIR']);
  assert.equal(b.context.syncDirty, false);
});

// ===========================================================================
// PROTEÇÃO 088 — contexto clínico por imagem (img.clinicalContext) atravessa
// sync e merge sem ser removido nem contaminar outra imagem.
// ===========================================================================
const CTX088 = { presentation: 'Dor no joelho há 3 semanas após trauma', patientAge: '52', patientSex: 'Masculino', notes: 'Tabagista' };
test('PROTEÇÃO 088 - contexto clínico da imagem chega idêntico ao outro PC; imagem sem contexto continua sem', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await a.boot();
  await a.addImage('seed_1', img({ publicId: 'atlas-radiologico/c088', assetId: 'C088', label: 'RM PD FAT SAT', clinicalContext: CTX088 }));
  await a.addImage('seed_1', img({ publicId: 'atlas-radiologico/n088', assetId: 'N088', label: 'RM T1' }));
  await a.save();
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await b.boot();
  const imgs = Array.from(b.context.DATA.find((e) => e.id === 'seed_1').images);
  assert.deepEqual(JSON.parse(JSON.stringify(imgs.find((i) => i.assetId === 'C088').clinicalContext)), CTX088);
  assert.equal('clinicalContext' in imgs.find((i) => i.assetId === 'N088'), false, 'não contamina a outra imagem');
  assert.equal(b.context.syncDirty, false);
});

test('PROTEÇÃO 088 - merge/reconcile: imagens diferentes nos dois PCs mantêm cada uma o seu contexto; edição do contexto chega à nuvem', async () => {
  const cloud = makeFakeCloud();
  await seedCleanCloud079c(cloud, [makeSeedEntry()]);
  const a = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await a.boot();
  const b = makeDevice(cloud, { seed: [makeSeedEntry()] });
  await b.boot();
  await a.addImage('seed_1', img({ publicId: 'atlas-radiologico/a088', assetId: 'A088', clinicalContext: { presentation: 'Caso A — cefaleia' } }));
  await a.save();
  await b.addImage('seed_1', img({ publicId: 'atlas-radiologico/b088', assetId: 'B088', clinicalContext: { presentation: 'Caso B — lombalgia', patientSex: 'Feminino' } }));
  await b.save(); // conflito de revisão -> reconcile -> união
  const cloudImgs = Array.from(cloud.peekChunkItems(0).find((e) => e.id === 'seed_1').images);
  assert.equal(cloudImgs.find((i) => i.assetId === 'A088').clinicalContext.presentation, 'Caso A — cefaleia');
  assert.deepEqual(JSON.parse(JSON.stringify(cloudImgs.find((i) => i.assetId === 'B088').clinicalContext)), { presentation: 'Caso B — lombalgia', patientSex: 'Feminino' });
  // A edita o contexto da imagem de B (edição real mais nova, carimbada) e publica:
  // a nuvem recebe a edição. (Limitação PRÉ-EXISTENTE, igual ao label: um PC que
  // já tinha essa imagem mantém a própria cópia no pull — ver CONTEXTO §44.)
  await a.context.syncFromFirebase();
  const la = a.context.DATA.find((e) => e.id === 'seed_1');
  la.images.find((i) => i.assetId === 'B088').clinicalContext = { presentation: 'Caso B — lombalgia há 2 meses', patientSex: 'Feminino', patientAge: '41' };
  la._userUpdatedAt = Date.now() + 1000;
  await a.save();
  const cloudAfter = Array.from(cloud.peekChunkItems(0).find((e) => e.id === 'seed_1').images);
  assert.deepEqual(JSON.parse(JSON.stringify(cloudAfter.find((i) => i.assetId === 'B088').clinicalContext)), { presentation: 'Caso B — lombalgia há 2 meses', patientSex: 'Feminino', patientAge: '41' });
  await b.context.syncFromFirebase();
  const lb = b.context.DATA.find((e) => e.id === 'seed_1');
  assert.ok(lb.images.find((i) => i.assetId === 'B088').clinicalContext.presentation, 'merge nunca remove o contexto');
  assert.equal(lb.images.find((i) => i.assetId === 'A088').clinicalContext.presentation, 'Caso A — cefaleia', 'merge não remove contexto');
});

console.log('multi-device-sync.test.js carregado — loadData/syncFromFirebase/writeShardedState/readShardedState REAIS, nenhuma rede/DOM real usada.');
