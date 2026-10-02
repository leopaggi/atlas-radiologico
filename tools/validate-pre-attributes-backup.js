'use strict';

// TAXO-04C0B — validador INDEPENDENTE e read-only do backup externo gerado
// pelo script de console da TAXO-04C0 (ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_*.json).
// Nunca toca DATA/SEED/index.html/openForm/Firestore/IndexedDB/localStorage —
// só lê o arquivo de backup do disco e faz contas sobre ele. Não escreve nada
// (quem chama decide se grava um manifesto com o resultado — ver
// tools/generate-safety-checkpoint-manifest.js).
//
// Exporta funções puras testáveis (tests/pre-attributes-backup-validation.test.js)
// e também funciona como CLI: `node tools/validate-pre-attributes-backup.js <arquivo.json> [opções]`.

const fs = require('fs');
const crypto = require('crypto');

function sha256Hex(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}

// Valida a ESTRUTURA do backup já parseado (metadata + data) contra as
// expectativas explícitas desta rodada. Pura: recebe tudo por parâmetro,
// nunca lê arquivos nem globais.
function validateBackupStructure(parsed, expected) {
  const problems = [];
  const metadata = parsed && parsed.metadata;
  const data = parsed && parsed.data;

  if (!metadata || typeof metadata !== 'object') {
    problems.push('metadata ausente ou não é objeto');
  } else {
    if (metadata.type !== 'full-canonical-backup') problems.push('metadata.type !== "full-canonical-backup" (valor: ' + metadata.type + ')');
    if (metadata.source !== 'published-runtime') problems.push('metadata.source !== "published-runtime" (valor: ' + metadata.source + ')');
    if (metadata.readOnly !== true) problems.push('metadata.readOnly !== true');
    if (expected.lesionCount != null && metadata.lesionCount !== expected.lesionCount) {
      problems.push('metadata.lesionCount (' + metadata.lesionCount + ') !== esperado (' + expected.lesionCount + ')');
    }
    if (expected.atlasCommit && metadata.atlasCommit !== expected.atlasCommit) {
      problems.push('metadata.atlasCommit (' + metadata.atlasCommit + ') !== esperado (' + expected.atlasCommit + ')');
    }
    if (expected.taxonomyVersionAtBackup != null && metadata.taxonomyVersionAtBackup !== expected.taxonomyVersionAtBackup) {
      problems.push('metadata.taxonomyVersionAtBackup (' + metadata.taxonomyVersionAtBackup + ') !== esperado (' + expected.taxonomyVersionAtBackup + ')');
    }
  }

  if (!Array.isArray(data)) {
    problems.push('data não é um array');
  } else {
    if (expected.lesionCount != null && data.length !== expected.lesionCount) {
      problems.push('data.length (' + data.length + ') !== lesionCount esperado (' + expected.lesionCount + ')');
    }
    let nullCount = 0, missingIdCount = 0, duplicateIdCount = 0;
    const seenIds = new Set();
    data.forEach(item => {
      if (item == null) { nullCount++; return; }
      if (item.id == null || String(item.id).trim() === '') { missingIdCount++; return; }
      if (seenIds.has(item.id)) { duplicateIdCount++; return; }
      seenIds.add(item.id);
    });
    if (nullCount > 0) problems.push(nullCount + ' item(ns) null/undefined em data');
    if (missingIdCount > 0) problems.push(missingIdCount + ' item(ns) sem id em data');
    if (duplicateIdCount > 0) problems.push(duplicateIdCount + ' id(s) duplicado(s) em data');
  }

  return {
    ok: problems.length === 0,
    problems,
    idsUnique: Array.isArray(data) ? (new Set(data.filter(d => d && d.id != null).map(d => d.id)).size === data.filter(d => d && d.id != null).length) : false,
    allIdsPresent: Array.isArray(data) ? data.every(d => d && d.id != null && String(d.id).trim() !== '') : false,
    countMatches: Array.isArray(data) && expected.lesionCount != null ? data.length === expected.lesionCount : false
  };
}

// Recalcula dataSha256 EXATAMENTE como o script de console (TAXO-04C0):
// SHA-256 de JSON.stringify(data), sem indentação, ordem original preservada.
function computeDataSha256(data) {
  return sha256Hex(JSON.stringify(data));
}

// Simulação de restauração SEM restaurar: clona data via JSON round-trip,
// confirma contagem/IDs/ordem/hash idênticos ao original, nunca chama
// nenhuma função de restore real, nunca toca IndexedDB/Firestore/DATA.
function simulateRestore(data) {
  const clonedJson = JSON.stringify(data);
  const cloned = JSON.parse(clonedJson);
  const originalIds = data.map(d => d && d.id);
  const clonedIds = cloned.map(d => d && d.id);
  const sameCount = cloned.length === data.length;
  const sameOrder = originalIds.length === clonedIds.length && originalIds.every((id, i) => id === clonedIds[i]);
  const sameHash = computeDataSha256(cloned) === computeDataSha256(data);
  return {
    pass: sameCount && sameOrder && sameHash,
    sameCount,
    sameOrder,
    sameHash,
    restoredLesionCount: cloned.length
  };
}

// Orquestra a validação completa de um arquivo de backup no disco. Read-only:
// só fs.readFileSync. Nunca escreve nada — quem chama decide o que fazer com
// o resultado.
function validateBackupFile(filePath, expected) {
  const raw = fs.readFileSync(filePath); // Buffer — usado para fileSha256
  const fileSha256 = sha256Hex(raw);

  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return { ok: false, problems: ['JSON.parse falhou: ' + e.message], filePath, fileSha256 };
  }

  const structure = validateBackupStructure(parsed, expected);
  const problems = structure.problems.slice();

  const dataSha256Actual = Array.isArray(parsed.data) ? computeDataSha256(parsed.data) : null;
  const dataSha256Expected = expected.dataSha256 || (parsed.metadata && parsed.metadata.dataSha256);
  const dataHashMatchesMetadata = Array.isArray(parsed.data) && parsed.metadata
    ? dataSha256Actual === parsed.metadata.dataSha256
    : false;
  const dataHashMatchesExpected = expected.dataSha256
    ? dataSha256Actual === expected.dataSha256.toLowerCase()
    : null;
  if (expected.dataSha256 && dataSha256Actual !== expected.dataSha256.toLowerCase()) {
    problems.push('dataSha256 recalculado (' + dataSha256Actual + ') difere do esperado (' + expected.dataSha256 + ')');
  }
  if (parsed.metadata && dataSha256Actual !== parsed.metadata.dataSha256) {
    problems.push('dataSha256 recalculado difere de metadata.dataSha256 dentro do próprio arquivo');
  }

  const fileHashMatchesExpected = expected.fileSha256
    ? fileSha256 === expected.fileSha256.toLowerCase()
    : null;
  if (expected.fileSha256 && fileSha256 !== expected.fileSha256.toLowerCase()) {
    problems.push('fileSha256 recalculado (' + fileSha256 + ') difere do esperado (' + expected.fileSha256 + ')');
  }

  const restoreSimulation = Array.isArray(parsed.data) ? simulateRestore(parsed.data) : { pass: false };
  if (!restoreSimulation.pass) problems.push('simulação de restauração falhou (ver restoreSimulation)');

  return {
    ok: problems.length === 0,
    problems,
    filePath,
    fileSha256,
    fileHashMatchesExpected,
    dataSha256: dataSha256Actual,
    dataHashMatchesMetadata,
    dataHashMatchesExpected,
    lesionCount: Array.isArray(parsed.data) ? parsed.data.length : null,
    idsUnique: structure.idsUnique,
    allIdsPresent: structure.allIdsPresent,
    countMatches: structure.countMatches,
    restoreSimulation,
    metadata: parsed.metadata || null
  };
}

module.exports = {
  sha256Hex,
  computeDataSha256,
  validateBackupStructure,
  simulateRestore,
  validateBackupFile
};

// ---------- CLI ----------
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('uso: node tools/validate-pre-attributes-backup.js <arquivo.json>');
    process.exit(1);
  }
  const expected = {
    lesionCount: process.env.EXPECTED_LESION_COUNT ? Number(process.env.EXPECTED_LESION_COUNT) : undefined,
    atlasCommit: process.env.EXPECTED_ATLAS_COMMIT,
    taxonomyVersionAtBackup: process.env.EXPECTED_TAXONOMY_VERSION ? Number(process.env.EXPECTED_TAXONOMY_VERSION) : undefined,
    dataSha256: process.env.EXPECTED_DATA_SHA256,
    fileSha256: process.env.EXPECTED_FILE_SHA256
  };
  const result = validateBackupFile(filePath, expected);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
