'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{', `Bloco nao inicia em { na posicao ${openingBrace}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }

  throw new Error(`Bloco sem fechamento iniciado na linha ${lineNumberAt(source, openingBrace)}`);
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  const block = extractBlock(source, openingBrace);
  return {
    source: source.slice(declaration.index, openingBrace) + block,
    body: block.slice(1, -1),
    index: declaration.index,
    line: lineNumberAt(source, declaration.index)
  };
}

function extractAssignedArray(source, name) {
  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Declaracao ${name} nao encontrada`);
  const start = source.indexOf('[', declaration.index + declaration[0].length);
  assert.notEqual(start, -1, `Array de ${name} nao encontrado`);

  const closing = { '[': ']', '{': '}', '(': ')' };
  const stack = [']'];
  let quote = null;
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (closing[char]) stack.push(closing[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Array ${name} sem fechamento`);
}

function extractImportHandler(source) {
  const marker = "document.getElementById('import-file').addEventListener('change', async (ev)=>";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'Handler de importacao nao encontrado');
  const openingBrace = source.indexOf('{', start + marker.length);
  const block = extractBlock(source, openingBrace);
  return {
    body: block,
    index: start,
    line: lineNumberAt(source, start)
  };
}

function invocationLocations(source, name) {
  const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
  return [...source.matchAll(pattern)]
    .filter((match) => !/function\s*$/.test(source.slice(Math.max(0, match.index - 30), match.index)))
    .map((match) => ({ index: match.index, line: lineNumberAt(source, match.index) }));
}

const recovery = extractFunction(html, 'recoverCanonicalBaseV154');
const brokenArtifacts = extractFunction(html, 'hasBrokenMigrationArtifacts');
const loadData = extractFunction(html, 'loadData');
const importHandler = extractImportHandler(html);

test('fluxos criticos sao localizados estaticamente no index.html', () => {
  // Todas as 4 ancoras sobem depois da Central de Revisoes + Solucoes
  // (LESION_REVISIONS): o modulo de dados/funcoes foi inserido logo apos
  // saveReview() (antes de recovery/brokenArtifacts), e o handler de
  // importacao ganhou uma linha a mais (restaura LESION_REVISIONS do
  // backup completo). loadData() tambem ganhou uma chamada nova no corpo
  // (await loadLesionRevisions()), mas isso nao move a linha da propria
  // declaracao de loadData, so o que vem depois dela.
  // +12 na revisao anterior: hotfix do badge do header nao atualizar sem F5
  // (updateReviewCenterBadges() passou a ser chamada direto de dentro das
  // funcoes de mutacao, com um comentario explicando o motivo).
  // +186 na revisao anterior: evolucao pra maquina de estados de dois
  // aceites (pending -> proposed -> applied_pending_validation ->
  // accepted/rejected), com snapshot/rollback por tentativa, validacao
  // estruturada de proposedChanges e as duas abas do painel de solucoes —
  // tudo inserido antes de recovery/brokenArtifacts, no modulo LESION_REVISIONS.
  // +10 na revisao anterior: melhoria de legibilidade do Quiz clinico (CSS
  // do painel "CASO TEORICO"/alternativas/pergunta, dentro do <style> no
  // topo do arquivo, bem antes de recovery/brokenArtifacts/loadData/
  // importHandler — por isso os 4 deslocam igualmente).
  // +30 nesta revisao: carrossel de imagens do Quiz + atalho "adicionar
  // imagem sem sair do Quiz". openCommonsImageSearch()/stripHtmlText()
  // foram movidas de dentro de openForm() pra escopo top-level e
  // parametrizadas (reaproveitadas pelo novo openQuizAddImageModal()), mais
  // CSS do carrossel/modal — tudo antes de recovery/brokenArtifacts.
  // +2 nesta continuação: estilos dos controles/modais pós-resposta do Quiz.
  // O construtor de quadro foi movido/parametrizado com saldo neutro antes
  // das três primeiras âncoras; seu foco inicial soma uma linha à importação.
  // +19 na correção pontual seguinte: controles visíveis de editar/remover
  // imagem no modal do Quiz e helpers seguros, inseridos antes das âncoras.
  // +33 nesta continuação: exclusão segura de assets do Cloudinary — script
  // firebase-functions-compat (+1) e helpers hasSecureCloudinaryIdentifier/
  // requestCloudinaryAssetDeletion logo após uploadToCloudinary, antes das
  // âncoras. Os ganchos de exclusão ficam DENTRO de openForm/openQuizAddImageModal
  // (depois de loadData), e o handler de importação não foi alterado em tamanho
  // por isso — apenas deslocado pelas inserções anteriores.
  // Mudança de estratégia (upload diferido, sem backend): removidos o script
  // firebase-functions-compat e os helpers de delete remoto (antes das
  // âncoras). O upload diferido do editor (blob URL + File em memória) fica
  // DENTRO de openForm (depois de recovery/brokenArtifacts/loadData), então
  // essas três voltam a cair; a importação recua pelo mesmo bloco removido.
  // +18 nesta continuação: helpers compartilhados buildPendingImage()/
  // uploadPendingImage() (usados pelo Editar E pelo Quiz) inseridos logo após
  // updateLesionImageLabel(), antes das quatro âncoras; o modal transacional
  // do Quiz fica depois de importHandler e não desloca as três primeiras.
  assert.equal(recovery.line, 4780);
  assert.equal(brokenArtifacts.line, 4770);
  assert.equal(loadData.line, 7080);
  assert.equal(importHandler.line, 9440);
});

test('inventario de chamadas da recuperacao automatica e deterministico', () => {
  const recoveryCalls = invocationLocations(html, 'recoverCanonicalBaseV154');
  const detectorCalls = invocationLocations(html, 'hasBrokenMigrationArtifacts');

  assert.deepEqual(recoveryCalls, []);
  assert.deepEqual(detectorCalls, []);
  assert.doesNotMatch(loadData.body, /await\s+recoverCanonicalBaseV154\(\);/);
  console.log('recoverCanonicalBaseV154: 0 chamadas automaticas');
  console.log('hasBrokenMigrationArtifacts: 0 chamadas');
});

test('SEGURANCA: loadData nao deve chamar recuperacao do SEED automaticamente', () => {
  const callsInsideLoad = invocationLocations(loadData.body, 'recoverCanonicalBaseV154');
  assert.equal(
    callsInsideLoad.length,
    0,
    'Defeito conhecido: loadData chama recoverCanonicalBaseV154 automaticamente apos ler o estado persistido'
  );
});

// ===========================================================================
// ALTERACAO 008 (2026-09-19) — sincronizacao automatica NUVEM->LOCAL foi
// desativada dentro de loadData() (a auditoria read-only desta mesma sessao
// encontrou que syncFromFirebase(), chamada sem condicao a cada F5/login,
// fazia merge POR ID contra DATA local e reintroduzia duplicatas/ownership
// antigo que a reconciliacao V2 ja tinha eliminado). syncFromFirebase()
// continua definida e INTACTA — so' este call site automatico foi removido.
// Os testes abaixo sao comment-aware (usam isInsideComment, nao apenas um
// regex cru) porque o comentario que documenta a desativacao MENCIONA
// "syncFromFirebase()" varias vezes de proposito, inclusive numa linha
// comentada (`// await syncFromFirebase();`) — um teste ingenuo baseado em
// regex simples acusaria falso positivo nessas mencoes.
// ===========================================================================

function isInsideComment(source, index) {
  const before = source.slice(Math.max(0, index - 4000), index);
  const lastBlockOpen = before.lastIndexOf('/*');
  const lastBlockClose = before.lastIndexOf('*/');
  const insideBlockComment = lastBlockOpen > lastBlockClose;
  const lastLineStart = before.lastIndexOf('\n') + 1;
  const lineSoFar = before.slice(lastLineStart);
  const insideLineComment = /\/\//.test(lineSoFar);
  return insideBlockComment || insideLineComment;
}

function activeCallLocations(source, name) {
  return invocationLocations(source, name).filter((match) => !isInsideComment(source, match.index));
}

const showApp = extractFunction(html, 'showApp');

function extractOnAuthStateChanged(source) {
  const marker = 'fbAuth.onAuthStateChanged(async (user)=>{';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'onAuthStateChanged nao encontrado');
  const openingBrace = source.indexOf('{', start + marker.length - 1);
  const block = extractBlock(source, openingBrace);
  return { source: source.slice(start, start + marker.length - 1) + block, index: start, line: lineNumberAt(source, start) };
}
const onAuthStateChangedBlock = extractOnAuthStateChanged(html);

test('ALTERACAO 008: loadData() NAO chama syncFromFirebase() (nem mesmo em comentario/mencao ativa)', () => {
  const active = activeCallLocations(loadData.source, 'syncFromFirebase');
  assert.deepEqual(active, [], 'loadData() nao pode ter nenhuma chamada ATIVA a syncFromFirebase()');
  // Confirma que o comentario de desativacao realmente esta ali (prova que a
  // remocao foi deliberada e documentada, nao um apagamento silencioso).
  assert.match(loadData.source, /\/\/ await syncFromFirebase\(\);/, 'a chamada precisa continuar visivel, so comentada — nunca apagada silenciosamente');
});

test('ALTERACAO 008: showApp() nao chama syncFromFirebase() diretamente — so chama loadData()', () => {
  const activeInShowApp = activeCallLocations(showApp.source, 'syncFromFirebase');
  assert.deepEqual(activeInShowApp, []);
  assert.match(showApp.source, /\bloadData\(\)/, 'showApp() precisa continuar chamando loadData() normalmente');
});

test('ALTERACAO 008: onAuthStateChanged (login) nao chama syncFromFirebase() diretamente', () => {
  const activeInAuth = activeCallLocations(onAuthStateChangedBlock.source, 'syncFromFirebase');
  assert.deepEqual(activeInAuth, []);
  assert.match(onAuthStateChangedBlock.source, /\bshowApp\(\)/, 'onAuthStateChanged precisa continuar chamando showApp() pro usuario autorizado');
});

test('ALTERACAO 008: cadeia completa onAuthStateChanged -> showApp -> loadData nao tem NENHUM caminho ativo ate syncFromFirebase (F5/login seguros)', () => {
  const combined = onAuthStateChangedBlock.source + '\n' + showApp.source + '\n' + loadData.source;
  const active = activeCallLocations(combined, 'syncFromFirebase');
  assert.deepEqual(active, [], 'nenhum ponto do fluxo de abertura/F5/login pode chamar syncFromFirebase automaticamente');
});

test('ALTERACAO 008: syncFromFirebase() continua definida, intacta, e disponivel para uso manual/controlado', () => {
  const fn = extractFunction(html, 'syncFromFirebase');
  assert.ok(fn.source.length > 500, 'a funcao precisa continuar com sua logica completa, nao virar um stub vazio');
  assert.match(fn.source, /readShardedState/, 'precisa continuar lendo o estado remoto de verdade');
  assert.match(fn.source, /mergeEntryNonDestructive/, 'precisa continuar com a logica de merge original, intocada');

  // Continua alcancavel: os 2 call sites manuais pre-existentes (botao de
  // exportar backup e botao de restaurar padrao de fabrica) nao foram
  // tocados por esta alteracao — syncFromFirebase() nao ficou orfa.
  // Exclui mencoes DENTRO do proprio corpo da funcao (o rotulo de string
  // "syncFromFirebase (leitura)" usado em withFirebaseTimeout, linha 2013,
  // bate no regex ingenuo de invocationLocations mas nao e uma chamada).
  const allCalls = activeCallLocations(html, 'syncFromFirebase')
    .filter((m) => m.index < fn.index || m.index >= fn.index + fn.source.length);
  assert.equal(allCalls.length, 2, 'syncFromFirebase() precisa continuar chamada exatamente pelos 2 botoes manuais pre-existentes (exportar backup, restaurar padrao de fabrica) — nenhum a mais, nenhum a menos');
});

test('F5 preserva as 1213 identidades ao executar o loadData real', async () => {
  const seedSource = extractAssignedArray(html, 'SEED');
  const legacySuppressedSource = extractAssignedArray(html, 'LEGACY_SUPPRESSED_DUPLICATE_IDS');
  const duplicatePairsSource = extractAssignedArray(html, 'DUPLICATE_PAIRS_V171');
  const seed = JSON.parse(seedSource);
  // Reproduz o boot real anterior a loadData(): index.html renumera todo o
  // SEED por posicao com seed_<indice> antes de ler o estado persistido.
  seed.forEach((entry, index) => { entry.id = `seed_${index}`; });
  const stages = [];
  const writes = [];
  const context = vm.createContext({
    DATA: [],
    REVIEW: {},
    SRS: {},
    SESSIONLOG: {},
    sectionOrder: [],
    siteOrder: {},
    appStateReady: false,
    SEED: seed,
    STORAGE_KEY: 'data',
    ORDER_KEY: 'order',
    SITEORDER_KEY: 'site-order',
    REVIEW_KEY: 'review',
    RECOVERY_KEY: 'recovery',
    RECOVERY_VERSION: 'test',
    DEFAULT_SECTION_ORDER: [],
    EN_TERMS: {},
    stages,
    storage: {
      get: async (key) => {
        if (key === 'data') {
          stages.push({ stage: 'storage.get', count: seed.length });
          return { value: JSON.stringify(seed) };
        }
        throw new Error(`Sem estado simulado para ${key}`);
      },
      set: async (key, value) => {
        if (key === 'data') {
          const count = JSON.parse(value).length;
          stages.push({ stage: 'storage.set', count });
          writes.push(count);
        }
      }
    },
    ensureLinks: (entry) => { entry.links = []; },
    isAutoRadiopaediaLink: () => false,
    radiopaediaSearchUrl: () => '',
    runTagCleanup: () => false,
    ensureInc: (entry) => { entry.inc = 1; },
    saveData: async () => {},
    saveOrder: async () => {},
    saveSiteOrder: async () => {},
    loadSRS: async () => {},
    loadSessionLog: async () => {},
    loadLesionRevisions: async () => {},
    saveReview: async () => {},
    saveSRS: async () => {},
    createSafetySnapshot: () => null,
    applyAltPlacementsAudit20260918: async () => false,
    applyClassificationAudit20260918: async () => false,
    upgradeDescriptionsV169: async () => {},
    upgradeDescriptionsV170: async () => {},
    upgradeDescriptionsV173: async () => {},
    upgradeDescriptionsV175: async () => {},
    upgradeDescriptionsV176: async () => {},
    upgradeDescriptionsV177: async () => {},
    upgradeDescriptionsV179: async () => {},
    upgradeDescriptionsV180: async () => {},
    upgradeDescriptionsV181: async () => {},
    upgradeDescriptionsV182: async () => {},
    pushToFirebaseNow: async () => {},
    migrateLegacyLocalImagesToCloudinary: async () => ({ migrated: 0 }),
    renderAll: () => {},
    console: { error: () => {}, info: () => {}, log: () => {} }
  });

  const runDuplicateCleanup = extractFunction(html, 'runDuplicateCleanup').source
    .replace('function runDuplicateCleanup', 'function runDuplicateCleanupReal');
  const deduplicateV171 = extractFunction(html, 'deduplicateV171').source
    .replace('function deduplicateV171', 'function deduplicateV171Real');
  const engine = `
    const LEGACY_SUPPRESSED_DUPLICATE_IDS = new Set(${legacySuppressedSource});
    ${extractFunction(html, 'computeDuplicateSeedIds').source}
    ${html.slice(html.indexOf('const SUPPRESSED_DUPLICATE_IDS_V172'), html.indexOf('function getActiveCanonicalSeed'))}
    globalThis.legacySuppressedCount = LEGACY_SUPPRESSED_DUPLICATE_IDS.size;
    globalThis.activeSuppressedCount = SUPPRESSED_DUPLICATE_IDS_V172.size;
    ${extractFunction(html, 'getActiveCanonicalSeed').source}
    ${extractFunction(html, 'activeCanonicalSeedV172').source}
    const DUPLICATE_PAIRS_V171 = ${duplicatePairsSource};
    ${extractFunction(html, 'mergeDuplicateEntryV171').source}
    ${runDuplicateCleanup}
    function runDuplicateCleanup(){
      stages.push({stage:'runDuplicateCleanup:before', count:DATA.length});
      const result = runDuplicateCleanupReal();
      stages.push({stage:'runDuplicateCleanup:after', count:DATA.length});
      return result;
    }
    ${deduplicateV171}
    async function deduplicateV171(){
      stages.push({stage:'deduplicateV171:before', count:DATA.length});
      const result = await deduplicateV171Real();
      stages.push({stage:'deduplicateV171:after', count:DATA.length});
      return result;
    }
    ${loadData.source}
  `;
  new vm.Script(engine).runInContext(context);
  await context.loadData();

  assert.equal(context.legacySuppressedCount, 70);
  assert.equal(context.activeSuppressedCount, 0);
  assert.deepEqual(plain(stages.filter((item) => item.stage !== 'storage.set')), [
    { stage: 'storage.get', count: 1213 },
    { stage: 'runDuplicateCleanup:before', count: 1213 },
    { stage: 'runDuplicateCleanup:after', count: 1213 },
    { stage: 'runDuplicateCleanup:before', count: 1213 },
    { stage: 'runDuplicateCleanup:after', count: 1213 },
    { stage: 'deduplicateV171:before', count: 1213 },
    { stage: 'deduplicateV171:after', count: 1213 }
  ]);
  assert.equal(
    context.DATA.length,
    1213,
    `loadData reduziu 1213 para ${context.DATA.length}; gravacoes DATA: ${writes.join(' -> ')}`
  );
  assert.deepEqual(writes, [1213], 'loadData deve persistir exatamente as mesmas 1213 identidades');
});

test('recuperacao isolada demonstra reinsercao de registro SEED ausente', async () => {
  const writes = [];
  const context = vm.createContext({
    DATA: [
      { id: 'seed_1', local: 'preservado' },
      { id: 'custom_1', local: 'personalizado' }
    ],
    activeCanonicalSeedV172: () => [
      { id: 'seed_1', canonical: true },
      { id: 'seed_2', canonical: true }
    ],
    isSeedLikeId: (id) => /^seed_/.test(String(id || '')),
    storage: { set: async (...args) => writes.push(args) },
    STORAGE_KEY: 'data',
    RECOVERY_KEY: 'recovery',
    RECOVERY_VERSION: 'test-version'
  });
  new vm.Script(`${recovery.source}; globalThis.runRecovery = recoverCanonicalBaseV154;`)
    .runInContext(context);

  await context.runRecovery();

  assert.deepEqual(
    Array.from(context.DATA, (entry) => entry.id),
    ['seed_1', 'seed_2', 'custom_1']
  );
  assert.equal(context.DATA[0].local, 'preservado');
  assert.deepEqual(Array.from(writes, (write) => write[0]), ['data', 'recovery']);
});

test('operacoes potencialmente destrutivas da recuperacao sao inventariadas', () => {
  const expectedOperations = [
    /DATA\s*=\s*out/,
    /storage\.set\(STORAGE_KEY/,
    /storage\.set\(RECOVERY_KEY/
  ];
  for (const operation of expectedOperations) assert.match(recovery.body, operation);
});

test('ordem estatica do fluxo de importacao e documentada', () => {
  const body = importHandler.body;
  const read = body.indexOf('await file.text()');
  const parse = body.indexOf('JSON.parse(raw)');
  const envelopeValidation = body.indexOf("parsed.format !== 'atlas-radiologico-backup'");
  const confirmation = body.indexOf("confirm('Importar este backup completo?");
  const firstFullMutation = body.indexOf('DATA = parsed.data');

  assert.ok(read < parse, 'O arquivo deve ser lido antes do parse');
  assert.ok(parse < envelopeValidation, 'O JSON deve ser interpretado antes da validacao do envelope');
  assert.ok(envelopeValidation < confirmation, 'O envelope deve ser validado antes da confirmacao');
  assert.ok(confirmation < firstFullMutation, 'A confirmacao deve ocorrer antes da primeira mutacao completa');
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotImportState(context) {
  return JSON.stringify({
    data: context.DATA,
    review: context.REVIEW,
    srs: context.SRS,
    sessionLog: context.SESSIONLOG,
    sectionOrder: context.sectionOrder,
    siteOrder: context.siteOrder,
    scope: context.scope,
    activeTags: [...context.activeTags],
    searchTerm: context.searchTerm,
    searchValue: context.searchInput.value
  });
}

async function runImportScenario(raw, { confirmResult = true } = {}) {
  const writes = [];
  let confirmations = 0;
  const searchInput = { value: 'original' };
  const context = vm.createContext({
    DATA: [{ id: 'original', name: 'Original', s: 'Original', site: 'Original' }],
    REVIEW: { original: true },
    SRS: { original: true },
    SESSIONLOG: { original: true },
    sectionOrder: ['Original'],
    siteOrder: { Original: [] },
    DEFAULT_SECTION_ORDER: ['Padrao'],
    SUPPRESSED_DUPLICATE_IDS_V172: new Set(),
    RECOVERY_KEY: 'recovery',
    RECOVERY_VERSION: 'test-version',
    STORAGE_KEY: 'data',
    REVIEW_KEY: 'review',
    createSafetySnapshot: () => null,
    confirm: () => {
      confirmations += 1;
      return confirmResult;
    },
    deduplicateV171: async () => 0,
    saveData: async () => writes.push('saveData'),
    storage: { set: async (key) => writes.push(`storage.set:${key}`) },
    saveSRS: async () => writes.push('saveSRS'),
    saveSessionLog: async () => writes.push('saveSessionLog'),
    saveOrder: async () => writes.push('saveOrder'),
    saveSiteOrder: async () => writes.push('saveSiteOrder'),
    scope: { section: 'Original', site: 'Original' },
    activeTags: new Set(['original']),
    searchTerm: 'original',
    searchInput,
    document: { getElementById: () => searchInput },
    renderAll: () => {},
    pushToFirebaseNow: async () => writes.push('pushToFirebaseNow-stub'),
    toast: () => {},
    console: { error: () => {}, info: () => {}, log: () => {} }
  });
  new vm.Script(`globalThis.runImport = async function(ev) ${importHandler.body};`)
    .runInContext(context);
  const before = snapshotImportState(context);

  await context.runImport({
    target: {
      files: [{ text: async () => raw }],
      value: 'backup.json'
    }
  });

  return {
    context,
    writes,
    before,
    after: snapshotImportState(context),
    confirmations
  };
}

test('SEGURANCA: backup malformado nao deve causar mutacao nem persistencia', async () => {
  const malformedBackup = JSON.stringify({
    format: 'atlas-radiologico-backup',
    backupVersion: 1,
    data: [{ name: 'registro sem id' }],
    review: [],
    srs: 'invalido',
    sessionLog: 42,
    sectionOrder: [null],
    siteOrder: []
  });
  const result = await runImportScenario(malformedBackup);

  assert.equal(
    result.writes.length,
    0,
    `Defeito conhecido: backup estruturalmente invalido iniciou mutacoes: ${result.writes.join(', ')}`
  );
  assert.equal(result.after, result.before);
});

test('SEGURANCA: backup legado invalido nao deve causar mutacao nem persistencia', async () => {
  const result = await runImportScenario(JSON.stringify([
    { name: 'registro legado sem estrutura minima' }
  ]));

  assert.equal(
    result.writes.length,
    0,
    `Defeito conhecido: backup legado invalido iniciou mutacoes: ${result.writes.join(', ')}`
  );
  assert.equal(result.after, result.before);
});

test('backup completo minimo valido usa defaults sem exigir campos opcionais', async () => {
  const entry = {
    id: 'custom_minimo',
    name: 'Registro minimo',
    s: 'Secao minima',
    site: 'Sitio minimo'
  };
  const result = await runImportScenario(JSON.stringify({
    format: 'atlas-radiologico-backup',
    data: [entry]
  }));

  assert.deepEqual(plain(result.context.DATA), [entry]);
  assert.deepEqual(plain(result.context.REVIEW), {});
  assert.deepEqual(plain(result.context.SRS), {});
  assert.deepEqual(plain(result.context.SESSIONLOG), {});
  assert.deepEqual(plain(result.context.sectionOrder), ['Padrao']);
  assert.deepEqual(plain(result.context.siteOrder), {});
  assert.equal(result.confirmations, 1);
  assert.ok(result.writes.length > 0, 'Backup completo valido deve chegar a persistencia');
});

test('backup legado valido aceita ID personalizado e preserva progresso', async () => {
  const entry = {
    id: 'lesao_personalizada_abc',
    name: 'Registro legado valido',
    s: 'Secao legada',
    site: 'Sitio legado'
  };
  const result = await runImportScenario(JSON.stringify([entry]));

  assert.deepEqual(plain(result.context.DATA), [entry]);
  assert.deepEqual(plain(result.context.REVIEW), { original: true });
  assert.deepEqual(plain(result.context.SRS), { original: true });
  assert.deepEqual(plain(result.context.SESSIONLOG), { original: true });
  assert.equal(result.confirmations, 1);
  assert.ok(result.writes.length > 0, 'Backup legado valido deve chegar a persistencia');
});

test('SEGURANCA: IDs duplicados devem ser rejeitados antes de qualquer mutacao', async () => {
  const duplicated = [
    { id: 'custom_repetido', name: 'Primeiro', s: 'Secao', site: 'Sitio A' },
    { id: 'custom_repetido', name: 'Segundo', s: 'Secao', site: 'Sitio B' }
  ];
  const result = await runImportScenario(JSON.stringify({
    format: 'atlas-radiologico-backup',
    data: duplicated
  }));

  assert.equal(
    result.writes.length,
    0,
    `Defeito conhecido: IDs duplicados iniciaram mutacoes: ${result.writes.join(', ')}`
  );
  assert.equal(result.after, result.before);
});

test('cancelar importacao nao altera estado nem inicia persistencia', async () => {
  const result = await runImportScenario(JSON.stringify({
    format: 'atlas-radiologico-backup',
    data: [{ id: 'custom_cancelado', name: 'Cancelado', s: 'Secao', site: 'Sitio' }]
  }), { confirmResult: false });

  assert.equal(result.confirmations, 1);
  assert.deepEqual(result.writes, []);
  assert.equal(result.after, result.before);
});

test('envelopes invalidos nao alteram estado nem iniciam persistencia', async () => {
  const invalidBackups = [
    '{json invalido',
    JSON.stringify({ format: 'outro-formato', data: [] }),
    JSON.stringify({ format: 'atlas-radiologico-backup', data: {} })
  ];

  for (const raw of invalidBackups) {
    const result = await runImportScenario(raw);
    assert.equal(result.confirmations, 0);
    assert.deepEqual(result.writes, []);
    assert.equal(result.after, result.before);
  }
});

test('operacoes potencialmente destrutivas da importacao sao inventariadas', () => {
  const body = importHandler.body;
  const stateAssignments = [...body.matchAll(/\b(?:DATA|REVIEW|SRS|SESSIONLOG|sectionOrder|siteOrder)\s*=/g)];
  const directStorageWrites = [...body.matchAll(/\bstorage\.set\s*\(/g)];
  const remotePushes = [...body.matchAll(/\bpushToFirebaseNow\s*\(/g)];

  assert.equal(stateAssignments.length, 10);
  assert.equal(directStorageWrites.length, 4);
  assert.equal(remotePushes.length, 2);
  assert.match(body, /await\s+saveData\(\)/);
  assert.match(body, /await\s+saveSRS\(\)/);
  assert.match(body, /await\s+saveSessionLog\(\)/);
  assert.match(body, /await\s+saveOrder\(\)/);
  assert.match(body, /await\s+saveSiteOrder\(\)/);
  console.log('Importacao: 10 atribuicoes de estado, 4 storage.set diretos e 2 pushes remotos');
});
