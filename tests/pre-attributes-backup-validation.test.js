'use strict';

// TAXO-04C0B — testes do validador independente de backup
// (tools/validate-pre-attributes-backup.js). Usa fixtures sintéticas
// escritas num diretório temporário — nunca o backup real do usuário (que
// vive fora do repositório), para o teste ser portável e não depender de
// um arquivo local específico. Não toca DATA/SEED/index.html/Firestore/
// IndexedDB/localStorage.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const MODULE_PATH = path.resolve(__dirname, '..', 'tools', 'validate-pre-attributes-backup.js');
const validator = require(MODULE_PATH);
const { validateBackupStructure, computeDataSha256, simulateRestore, validateBackupFile, sha256Hex } = validator;
const moduleSrcRaw = fs.readFileSync(MODULE_PATH, 'utf8');
// Remove comentários antes das checagens estáticas de "nunca faz X" — o
// próprio módulo documenta extensivamente essas garantias em comentários
// (ex.: "nunca toca IndexedDB/Firestore"), o que geraria falso positivo
// contra a própria explicação de que o termo NÃO é usado em código.
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}
const moduleSrc = stripJsComments(moduleSrcRaw);

function makeLesion(id, overrides) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Tórax', site: 'Nódulo pulmonar', tags: ['sólido'] }, overrides);
}

function makeData(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(makeLesion('seed_' + i));
  return arr;
}

function makeBackup(data, metadataOverrides) {
  const metadata = Object.assign({
    type: 'full-canonical-backup',
    generatedAt: new Date().toISOString(),
    source: 'published-runtime',
    readOnly: true,
    lesionCount: data.length,
    taxonomyVersionAtBackup: 2,
    atlasCommit: 'commit123',
    dataSha256: computeDataSha256(data)
  }, metadataOverrides);
  return { metadata, data };
}

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'taxo04c0b-'));
let tmpFileCounter = 0;
function writeBackupFile(backup) {
  const filePath = path.join(TMP_DIR, 'backup_' + (tmpFileCounter++) + '.json');
  fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
  return filePath;
}

test.after(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

/* ===================== 1. arquivo válido passa ===================== */

test('1. arquivo de backup válido passa todas as validações', () => {
  const data = makeData(10);
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, { lesionCount: 10, atlasCommit: 'commit123', taxonomyVersionAtBackup: 2, dataSha256: backup.metadata.dataSha256 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.lesionCount, 10);
  assert.equal(result.idsUnique, true);
  assert.equal(result.restoreSimulation.pass, true);
});

/* ===================== 2. lesionCount incorreto falha ===================== */

test('2. lesionCount esperado diferente do real falha', () => {
  const data = makeData(10);
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, { lesionCount: 999 });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('lesionCount')));
});

/* ===================== 3. id duplicado falha ===================== */

test('3. id duplicado em data falha', () => {
  const data = makeData(5);
  data[4] = makeLesion('seed_0'); // duplica o id de data[0]
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, {});
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('duplicado')));
  assert.equal(result.idsUnique, false);
});

/* ===================== 4. id ausente falha ===================== */

test('4. item sem id falha', () => {
  const data = makeData(5);
  delete data[2].id;
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, {});
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('sem id')));
  assert.equal(result.allIdsPresent, false);
});

/* ===================== 5. dataSha256 adulterado falha ===================== */

test('5. dataSha256 esperado divergente do recalculado falha', () => {
  const data = makeData(5);
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, { dataSha256: 'f'.repeat(64) });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('dataSha256 recalculado') && p.includes('esperado')));
});

/* ===================== 6. conteúdo DATA adulterado falha (hash interno não bate) ===================== */

test('6. metadata.dataSha256 do próprio arquivo divergente do recalculado falha (DATA foi adulterado após o backup ser gerado)', () => {
  const data = makeData(5);
  const backup = makeBackup(data);
  // Adultera o conteúdo DEPOIS de calcular o hash original — simula alguém
  // editando o arquivo de backup manualmente.
  backup.data[0].name = 'NOME ADULTERADO';
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, {});
  assert.equal(result.ok, false);
  assert.equal(result.dataHashMatchesMetadata, false);
  assert.ok(result.problems.some(p => p.includes('difere de metadata.dataSha256')));
});

/* ===================== 7. fileSha256 esperado errado falha ===================== */

test('7. fileSha256 esperado divergente do recalculado falha', () => {
  const data = makeData(5);
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, { fileSha256: '0'.repeat(64) });
  assert.equal(result.ok, false);
  assert.equal(result.fileHashMatchesExpected, false);
  assert.ok(result.problems.some(p => p.includes('fileSha256 recalculado')));
});

/* ===================== 8. metadata.atlasCommit errado falha ===================== */

test('8. atlasCommit esperado divergente falha', () => {
  const data = makeData(5);
  const backup = makeBackup(data, { atlasCommit: 'commit123' });
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, { atlasCommit: 'commit-outro' });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('atlasCommit')));
});

/* ===================== 9. taxonomyVersionAtBackup errada falha ===================== */

test('9. taxonomyVersionAtBackup esperada divergente falha', () => {
  const data = makeData(5);
  const backup = makeBackup(data, { taxonomyVersionAtBackup: 2 });
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, { taxonomyVersionAtBackup: 99 });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('taxonomyVersionAtBackup')));
});

/* ===================== 10. restore simulation não muta entrada ===================== */

test('10. simulateRestore nunca muta o array/objetos originais recebidos', () => {
  const data = makeData(5);
  const snapshotBefore = JSON.stringify(data);
  const outcome = simulateRestore(data);
  assert.equal(outcome.pass, true);
  assert.equal(JSON.stringify(data), snapshotBefore);
});

test('extra — validateBackupStructure também nunca muta o parsed recebido', () => {
  const data = makeData(5);
  const backup = makeBackup(data);
  const snapshotBefore = JSON.stringify(backup);
  validateBackupStructure(backup, { lesionCount: 5 });
  assert.equal(JSON.stringify(backup), snapshotBefore);
});

/* ===================== 11/12/13/14. zero persistência real no módulo ===================== */

test('11. nenhuma referência a IndexedDB no código do validador', () => {
  assert.ok(!/indexedDB/i.test(moduleSrc));
});

test('12. nenhuma referência a Firestore/firebase no código do validador', () => {
  assert.ok(!/firestore|firebase/i.test(moduleSrc));
});

test('13. nenhuma referência a localStorage no código do validador', () => {
  assert.ok(!/localStorage\./.test(moduleSrc));
});

test('14. nenhuma chamada a saveData()/storage.set() no código do validador (só fs.readFileSync, leitura)', () => {
  assert.ok(!/saveData\s*\(/.test(moduleSrc));
  assert.ok(!/storage\.(set|delete)\s*\(/.test(moduleSrc));
  assert.ok(!/fs\.writeFileSync|fs\.writeFile\b|fs\.appendFile/.test(moduleSrc));
});

/* ===================== extra — hash determinístico e JSON malformado ===================== */

test('extra — computeDataSha256 é determinístico para o mesmo array (ordem preservada)', () => {
  const data = makeData(5);
  assert.equal(computeDataSha256(data), computeDataSha256(JSON.parse(JSON.stringify(data))));
});

test('extra — JSON malformado no arquivo falha com problema claro, sem lançar exceção não tratada', () => {
  const filePath = path.join(TMP_DIR, 'malformed.json');
  fs.writeFileSync(filePath, '{ isso nao é json válido');
  const result = validateBackupFile(filePath, {});
  assert.equal(result.ok, false);
  assert.ok(result.problems[0].includes('JSON.parse falhou'));
});

test('extra — item null dentro de data falha', () => {
  const data = makeData(5);
  data[1] = null;
  const backup = makeBackup(data);
  const filePath = writeBackupFile(backup);
  const result = validateBackupFile(filePath, {});
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('null/undefined')));
});
