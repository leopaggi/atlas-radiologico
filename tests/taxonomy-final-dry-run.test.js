'use strict';

// TAXO-04C1 — testes do dry-run FINAL sobre o backup externo validado
// (1210 lesões). Cobre tanto a regra estrutural (sintética, portátil,
// sempre roda) quanto uma integração leve contra o backup real do
// usuário (guardada por existsSync — este arquivo vive fora do
// repositório, em Downloads, então o teste pula graciosamente, sem
// falhar, em qualquer outra máquina onde ele não exista). Nunca toca
// DATA/SEED/index.html/openForm/Firestore/IndexedDB/localStorage.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(REPO, 'tools', 'taxonomy-migration-dry-run.js');
const VALIDATOR_PATH = path.join(REPO, 'tools', 'validate-pre-attributes-backup.js');
const engine = require(ENGINE_PATH);
const validator = require(VALIDATOR_PATH);
const { simulateTagToAttributesMigration, buildFixtureFromLiveSnapshot } = engine;

const engineSrc = fs.readFileSync(ENGINE_PATH, 'utf8');
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}
const engineCodeOnly = stripJsComments(engineSrc);

const BACKUP_PATH = 'C:/Users/LEONARDO/Downloads/ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json';
const EXPECTED = {
  lesionCount: 1210,
  atlasCommit: '78e23f27461f3e508821535a34f57ef0fb3b0774',
  taxonomyVersionAtBackup: 2,
  dataSha256: 'f752b7381404cc4339eb4114213321c102737f53e0ef9ca389639b5667ab8541',
  fileSha256: '3D180146B8A1A007EEDAF8B45B54F5386099D3CCE1E30B9653A396011C5451B5'
};
const backupExists = fs.existsSync(BACKUP_PATH);

const realTaxonomy = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXONOMY.json'), 'utf8'));
const realTagMap = JSON.parse(fs.readFileSync(path.join(REPO, 'TAG_TO_TAXONOMY_MAP.json'), 'utf8'));

/* ===================== Integração real (guardada por existsSync) ===================== */

test('1. backup externo tem exatamente 1210 lesões (integração real, pula se o arquivo não existir nesta máquina)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina — ver BACKUP_PATH'); return; }
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  assert.equal(backup.data.length, 1210);
  assert.equal(backup.metadata.lesionCount, 1210);
});

test('2. hash do backup externo confere com o esperado (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const result = validator.validateBackupFile(BACKUP_PATH, EXPECTED);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.dataSha256, EXPECTED.dataSha256.toLowerCase());
  assert.equal(result.fileSha256, EXPECTED.fileSha256.toLowerCase());
});

let realBackupData = null;
let newIds = [];
if (backupExists) {
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  realBackupData = backup.data;
  const snapshot1208 = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXO03_LIVE_TAG_SNAPSHOT.json'), 'utf8'));
  const ids1208 = new Set(buildFixtureFromLiveSnapshot(snapshot1208).fixture.map(l => l.id));
  newIds = realBackupData.filter(l => !ids1208.has(l.id)).map(l => l.id);
}

test('3. os 2 IDs novos (1210 - 1208) são identificados e caracterizados (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  assert.equal(newIds.length, 2);
  newIds.forEach(id => {
    const lesion = realBackupData.find(l => l.id === id);
    assert.ok(lesion);
    assert.ok(!Array.isArray(lesion.tags) || lesion.tags.length === 0, id + ' esperado sem tags (achado da auditoria TAXO-04C1)');
  });
});

test('4. o dry-run final usa parsed.data do backup (não a fixture histórica de 1208) e as 2 lesões novas caem em no-structured-mapping (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const result = simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  assert.equal(result.summary.lesionsAnalyzed, 1210);
  newIds.forEach(id => {
    const l = result.lesions.find(x => x.lesionId === id);
    assert.ok(l, 'lesão nova não encontrada no resultado: ' + id);
    assert.equal(l.migrationStatus, 'no-structured-mapping');
    assert.equal(l.proposedAttributes.length, 0);
  });
});

test('5. delta 1208->1210: no-structured-mapping +2, todo o resto inalterado (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const prevB3 = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXO04B3_MIGRATION_DRY_RUN.json'), 'utf8'));
  const result = simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  assert.equal(result.summary.lesionsAutoReady, prevB3.summary.lesionsAutoReady);
  assert.equal(result.summary.lesionsReviewRequired, prevB3.summary.lesionsReviewRequired);
  assert.equal(result.summary.lesionsNoStructuredMapping, prevB3.summary.lesionsNoStructuredMapping + 2);
  assert.equal(result.summary.totalProposedItems, prevB3.summary.totalProposedItems);
});

/* ===================== Regra de aplicação (sintética, sempre roda) ===================== */

function makeTaxonomy() {
  return {
    metadata: { schemaVersion: 1, taxonomyVersion: 2, status: 'approved', releaseLabel: '1.1' },
    groups: [
      { id: 'radiologic.composition', label: 'Composição', domain: 'radiologic', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] }
    ],
    concepts: [
      { id: 'rad_comp_solid', label: 'sólido', domain: 'radiologic', group: 'radiologic.composition', status: 'active', synonyms: [], description: null, relations: {} }
    ]
  };
}
function makeTagMap(overrides) {
  return {
    metadata: {},
    mappings: Object.assign({
      'sólido': { tag: 'sólido', catalogState: 'live', isLiveOnly: false, mapping: { status: 'mapped', conceptIds: ['rad_comp_solid'], confidence: 'high', notes: null } },
      'ambígua': { tag: 'ambígua', catalogState: 'live', isLiveOnly: false, mapping: { status: 'ambiguous', candidates: [{ conceptId: 'rad_comp_solid' }], confidence: 'low', notes: null } }
    }, overrides),
    historicalMappings: {},
    staleOrUnappliedTags: {}
  };
}

test('6. auto-ready é reconhecido quando toda tag resolve sem ambiguidade/conflito', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap();
  const result = simulateTagToAttributesMigration([{ id: 'L1', name: 'x', s: 's', site: 'y', tags: ['sólido'] }], taxonomy, tagMap);
  assert.equal(result.lesions[0].migrationStatus, 'auto-ready');
});

test('7. review-required NUNCA é elegível para apply automático (regra explícita validada)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap();
  const result = simulateTagToAttributesMigration([{ id: 'L2', name: 'x', s: 's', site: 'y', tags: ['ambígua'] }], taxonomy, tagMap);
  const lesion = result.lesions[0];
  assert.equal(lesion.migrationStatus, 'review-required');
  // A regra de apply é: só migrationStatus === 'auto-ready' pode ser aplicado.
  const eligibleForApply = lesion.migrationStatus === 'auto-ready';
  assert.equal(eligibleForApply, false);
});

test('8. no-structured-mapping NUNCA é elegível para apply automático', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap();
  const result = simulateTagToAttributesMigration([{ id: 'L3', name: 'x', s: 's', site: 'y', tags: [] }], taxonomy, tagMap);
  const lesion = result.lesions[0];
  assert.equal(lesion.migrationStatus, 'no-structured-mapping');
  const eligibleForApply = lesion.migrationStatus === 'auto-ready';
  assert.equal(eligibleForApply, false);
});

test('9. ambiguidades manuais conhecidas continuam bloqueadas no resultado real (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const result = simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  ['calcificações', 'hemorrágico', 'difuso', 'bilateral', 'necrótico'].forEach(tag => {
    const occurrences = result.lesions.filter(l => l.ambiguousTags.some(a => a.tag === tag));
    assert.ok(occurrences.length > 0, tag + ' deveria continuar ambíguo');
    occurrences.forEach(l => assert.notEqual(l.migrationStatus, 'auto-ready'));
  });
});

test('10. conflito exclusivo lítica+esclerótica continua bloqueado (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const result = simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  const conflicts = result.issues.filter(i => i.type === 'exclusive-group-conflict');
  assert.equal(conflicts.length, 7);
  conflicts.forEach(c => {
    const l = result.lesions.find(x => x.lesionId === c.lesionId);
    assert.equal(l.migrationStatus, 'review-required');
  });
});

/* ===================== Zero persistência / determinismo / imutabilidade ===================== */

test('11/12/13/14/15. motor usado nesta rodada continua sem persistência real / DATA global / SEED / Firestore / IndexedDB (regressão)', () => {
  assert.ok(!/saveData\s*\(/.test(engineCodeOnly));
  assert.ok(!/\bwindow\.DATA\b/.test(engineCodeOnly));
  assert.ok(!/\bSEED\b/.test(engineCodeOnly));
  assert.ok(!/firestore/i.test(engineCodeOnly));
  assert.ok(!/indexedDB/i.test(engineCodeOnly));
});

test('16. nenhuma escrita em localStorage no motor (regressão)', () => {
  assert.ok(!/localStorage\./.test(engineCodeOnly));
});

test('17. output determinístico sobre o backup real (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const r1 = simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  const r2 = simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  assert.deepEqual(r1.summary, r2.summary);
});

test('18. input (dados do backup) nunca é mutado pelo motor (integração real)', (t) => {
  if (!backupExists) { t.skip('backup externo não encontrado nesta máquina'); return; }
  const before = JSON.stringify(realBackupData);
  simulateTagToAttributesMigration(realBackupData, realTaxonomy, realTagMap);
  assert.equal(JSON.stringify(realBackupData), before);
});
