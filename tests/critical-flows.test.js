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
  assert.equal(recovery.line, 4312);
  assert.equal(brokenArtifacts.line, 4302);
  assert.equal(loadData.line, 4731);
  assert.equal(importHandler.line, 6642);
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

test('SEGURANCA: backup malformado nao deve causar mutacao nem persistencia', async () => {
  const originalData = [{ id: 'original' }];
  const writes = [];
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
  const context = vm.createContext({
    DATA: originalData,
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
    confirm: () => true,
    deduplicateV171: async () => 0,
    storage: { set: async (key) => writes.push(`storage.set:${key}`) },
    saveSRS: async () => writes.push('saveSRS'),
    saveSessionLog: async () => writes.push('saveSessionLog'),
    saveOrder: async () => writes.push('saveOrder'),
    saveSiteOrder: async () => writes.push('saveSiteOrder'),
    scope: { section: 'Original', site: 'Original' },
    activeTags: { clear: () => {} },
    searchTerm: 'original',
    document: { getElementById: () => ({ value: 'original' }) },
    renderAll: () => {},
    pushToFirebaseNow: async () => writes.push('pushToFirebaseNow-stub'),
    toast: () => {},
    console
  });
  new vm.Script(`globalThis.runImport = async function(ev) ${importHandler.body};`)
    .runInContext(context);

  await context.runImport({
    target: {
      files: [{ text: async () => malformedBackup }],
      value: 'backup.json'
    }
  });

  assert.equal(
    writes.length,
    0,
    `Defeito conhecido: backup estruturalmente invalido iniciou mutacoes: ${writes.join(', ')}`
  );
  assert.deepEqual(context.DATA, originalData);
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
