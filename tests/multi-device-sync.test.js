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
const normalizeLegacyOwnerFn = extractFunction(html, 'normalizeLegacyImageOwnerLabel');
// ALTERAÇÃO 072b: helper compartilhado da normalização no pull (mesma tabela
// de decisão da função de console) — precisa entrar nos motores `vm`.
const legacyHoldersFn = extractFunction(html, 'legacyImageHoldersByKey');
const tryNormalizeFn = extractFunction(html, 'tryNormalizeLegacyPullImage');

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
    ${writeShardedStateFn.source}
    ${writeShardedStateWithConflictRetryFn.source}
    ${writeShardedStateSerializedFn.source}
    ${readShardedStateFn.source}
    ${pushToFirebaseNowFn.source}
    ${saveDataFn.source}
    ${syncFromFirebaseFn.source}
    ${loadDataFn.source}
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
    markDirty: () => context.markSyncDirty()
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

  // PC B adiciona uma 4ª imagem (simula upload novo) e salva — precisa subir pra nuvem.
  entryB.images.push(img({ publicId: 'atlas-radiologico/4', assetId: 'A4' }));
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
  const seedB = [makeSeedEntry({ images: [img({ publicId: 'atlas-radiologico/Y', assetId: 'Y' })] })];
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
  deviceB.context.DATA.find((e) => e.id === 'seed_1').images.push(img({ publicId: 'atlas-radiologico/from-b', assetId: 'FROMB' }));
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
  deviceA.context.DATA.find((e) => e.id === 'seed_1').images.push(img({ publicId: 'atlas-radiologico/from-a', assetId: 'FROMA' }));
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
  deviceStale.context.DATA.find((e) => e.id === 'seed_1').images.push(img({ publicId: 'atlas-radiologico/exclusiva-local', assetId: 'EXCLUSIVA' }));
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
  device.context.DATA.find((e) => e.id === 'seed_1').images.push(img({ publicId: 'atlas-radiologico/offline-edit', assetId: 'OFFLINE' }));
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
  assert.deepEqual(withCatalog, ['l,r,localData'], 'só o syncFromFirebase (pull) repassa catálogo');
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

console.log('multi-device-sync.test.js carregado — loadData/syncFromFirebase/writeShardedState/readShardedState REAIS, nenhuma rede/DOM real usada.');
