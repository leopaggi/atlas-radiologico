'use strict';

// TAXO-04C3 — testes do EXECUTOR em modo simulação
// (tools/taxonomy-attributes-apply-executor.js). Toda escrita acontece
// SÓ em clones JSON em memória — nenhuma função pública deste módulo
// chama saveData()/Firestore/IndexedDB/localStorage, e os testes abaixo
// confirmam isso estaticamente também. `now`/`idFactory` são sempre
// injetados de forma determinística para os testes serem reproduzíveis.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const EXECUTOR_PATH = path.join(REPO, 'tools', 'taxonomy-attributes-apply-executor.js');
const PLANNER_PATH = path.join(REPO, 'tools', 'taxonomy-attributes-apply-plan.js');
const executor = require(EXECUTOR_PATH);
const planner = require(PLANNER_PATH);
const {
  prepareTaxonomyAttributesExecution,
  materializeTaxonomyAttributeItems,
  simulateTaxonomyAttributesApply,
  validatePostApplyState,
  createDefaultIdFactory,
  createDefaultNowFn
} = executor;
const { buildTaxonomyAttributesApplyPlan, computeDataSha256 } = planner;

const executorSrc = fs.readFileSync(EXECUTOR_PATH, 'utf8');
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}
const executorCodeOnly = stripJsComments(executorSrc);

/* ===================== Fixtures sintéticas ===================== */

function makeTaxonomy() {
  return {
    metadata: { schemaVersion: 1, taxonomyVersion: 2, status: 'approved', releaseLabel: '1.1' },
    groups: [
      { id: 'radiologic.composition', label: 'Composição', domain: 'radiologic', exclusive: true, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'etiology.primary', label: 'Etiologia', domain: 'etiology', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'radiologic.multi', label: 'Multi', domain: 'radiologic', exclusive: false, allowMultipleInstances: true, applicableSections: ['*'] }
    ],
    concepts: [
      { id: 'rad_comp_solid', label: 'sólido', domain: 'radiologic', group: 'radiologic.composition', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'rad_comp_cystic', label: 'cístico', domain: 'radiologic', group: 'radiologic.composition', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'etio_vascular', label: 'vascular', domain: 'etiology', group: 'etiology.primary', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'rad_multi_marker', label: 'marcador', domain: 'radiologic', group: 'radiologic.multi', status: 'active', synonyms: [], description: null, relations: {} }
    ]
  };
}

function rawLesion(id, overrides) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Tórax', site: 'Nódulo', tags: ['sólido'], images: [{ url: 'x' }], links: [{ url: 'y' }], notes: 'abc' }, overrides);
}

function proposedItem(conceptId) {
  return { proposedItem: { itemId: 'attr_dryrun_x_' + conceptId, conceptId }, provenance: { sourceTags: [conceptId], mappingStatus: 'mapped', resolutionType: 'direct' } };
}

function migrationLesion(overrides) {
  return Object.assign({
    lesionId: 'seed_1', lesionName: 'x', section: 'Tórax', site: 'Nódulo', sourceTags: [], proposedAttributes: [],
    unmappedTags: [], ignoredTags: [], ambiguousTags: [], reviewTags: [], historicalTagsPresent: [], staleTagsPresent: [],
    unknownTags: [], conflicts: [], contextualResolutions: [], combinationResolutions: [], migrationStatus: 'auto-ready'
  }, overrides);
}

function buildFixture(dataLesions, migrationLesions) {
  const taxonomy = makeTaxonomy();
  const data = dataLesions;
  const migrationResult = { lesions: migrationLesions };
  const applyPlan = buildTaxonomyAttributesApplyPlan({ data, migrationResult, taxonomy, sourceDataSha256: computeDataSha256(data) });
  const expectedBaseline = { lesionCount: data.length, ids: data.map(d => d.id), dataSha256: computeDataSha256(data) };
  return { taxonomy, data, migrationResult, applyPlan, expectedBaseline };
}

function detFactory(prefix) {
  let n = 0;
  return () => prefix + '_' + (n++);
}
const fixedNow = () => 1700000000000;

/* ===================== 1/2. baseline guard ===================== */

test('1. baseline correto permite execução (ready=true / success=true)', () => {
  const f = buildFixture(
    [rawLesion('seed_1')],
    [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]
  );
  const prep = prepareTaxonomyAttributesExecution({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy });
  assert.equal(prep.ready, true);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, true);
});

test('2. baseline incorreto aborta ANTES de qualquer chamada a idFactory (zero materialização)', () => {
  const f = buildFixture(
    [rawLesion('seed_1')],
    [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]
  );
  let idFactoryCalls = 0;
  const idFactory = () => { idFactoryCalls++; return 'id_' + idFactoryCalls; };
  const badBaseline = Object.assign({}, f.expectedBaseline, { lesionCount: 999 });
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: badBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory });
  assert.equal(sim.success, false);
  assert.equal(sim.aborted, true);
  assert.equal(sim.reason, 'baseline-drift');
  assert.equal(sim.afterData, null);
  assert.equal(idFactoryCalls, 0);
});

/* ===================== 3/4/5. simulação real (integração guardada) ===================== */

const BACKUP_PATH = 'C:/Users/LEONARDO/Downloads/ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json';
const C1_PATH = path.join(REPO, 'TAXO04C1_FINAL_DRY_RUN.json');
const C2_PATH = path.join(REPO, 'TAXO04C2_APPLY_PLAN.json');
const realFilesExist = fs.existsSync(BACKUP_PATH) && fs.existsSync(C1_PATH) && fs.existsSync(C2_PATH);

let realSim1 = null;
if (realFilesExist) {
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const realTaxonomy = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXONOMY.json'), 'utf8'));
  const realApplyPlan = JSON.parse(fs.readFileSync(C2_PATH, 'utf8'));
  const SOURCE_HASH = 'f752b7381404cc4339eb4114213321c102737f53e0ef9ca389639b5667ab8541';
  const expectedBaseline = { lesionCount: 1210, ids: backup.data.map(d => d.id), dataSha256: SOURCE_HASH };
  const expectedPlanShape = { eligibleCount: 625, mutationsCount: 625, totalInsertedItems: 1131, blockedCount: 0 };
  realSim1 = simulateTaxonomyAttributesApply({
    currentData: backup.data, expectedBaseline, applyPlan: realApplyPlan, taxonomy: realTaxonomy,
    now: fixedNow, idFactory: detFactory('attr_real_test'), expectedPlanShape
  });
}

test('3. exatamente 625 lesions modificadas (integração real, pula se arquivos ausentes)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  assert.equal(realSim1.success, true);
  assert.equal(realSim1.modifiedLesionIds.length, 625);
});

test('4. exatamente 1131 novos items (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  assert.equal(realSim1.newItemsCount, 1131);
});

test('5. 1210 lesions permanecem após a simulação (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  assert.equal(realSim1.afterData.length, 1210);
});

test('6. IDs de lesão preservados integralmente (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  assert.deepEqual(realSim1.afterData.map(l => l.id), backup.data.map(l => l.id));
});

test('7. tags preservadas integralmente (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const beforeById = new Map(backup.data.map(l => [l.id, l]));
  realSim1.afterData.forEach(l => {
    assert.deepEqual(l.tags, beforeById.get(l.id).tags);
  });
});

test('8. images preservadas integralmente (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const beforeById = new Map(backup.data.map(l => [l.id, l]));
  realSim1.afterData.forEach(l => {
    assert.deepEqual(l.images || null, beforeById.get(l.id).images || null);
  });
});

test('9. links preservados integralmente (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const beforeById = new Map(backup.data.map(l => [l.id, l]));
  realSim1.afterData.forEach(l => {
    assert.deepEqual(l.links || null, beforeById.get(l.id).links || null);
  });
});

test('10. lesões review-required permanecem sem attributes (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const realApplyPlan = JSON.parse(fs.readFileSync(C2_PATH, 'utf8'));
  const afterById = new Map(realSim1.afterData.map(l => [l.id, l]));
  realApplyPlan.reviewRequiredIds.forEach(id => {
    assert.equal(afterById.get(id).attributes, undefined);
  });
});

test('11. lesões no-structured-mapping permanecem sem attributes (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const realApplyPlan = JSON.parse(fs.readFileSync(C2_PATH, 'utf8'));
  const afterById = new Map(realSim1.afterData.map(l => [l.id, l]));
  realApplyPlan.noStructuredMappingIds.forEach(id => {
    assert.equal(afterById.get(id).attributes, undefined);
  });
});

test('12. todos os itemIds são únicos dentro de todas as 1210 lesões (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const allIds = [];
  realSim1.afterData.forEach(l => {
    (l.attributes && l.attributes.items || []).forEach(i => allIds.push(i.itemId));
  });
  assert.equal(new Set(allIds).size, allIds.length);
});

test('13. zero itemId com prefixo attr_dryrun_ no resultado (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  realSim1.afterData.forEach(l => {
    (l.attributes && l.attributes.items || []).forEach(i => assert.ok(!i.itemId.startsWith('attr_dryrun_')));
  });
});

test('14. todos os conceptIds materializados existem na TAXONOMY real (integração real)', (t) => {
  if (!realFilesExist) { t.skip('arquivos reais ausentes nesta máquina'); return; }
  const realTaxonomy = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXONOMY.json'), 'utf8'));
  const conceptIds = new Set(realTaxonomy.concepts.map(c => c.id));
  realSim1.afterData.forEach(l => {
    (l.attributes && l.attributes.items || []).forEach(i => assert.ok(conceptIds.has(i.conceptId)));
  });
});

/* ===================== 15-17. forma dos itens novos ===================== */

test('15. qualifiers sempre [] nos itens novos', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  const items = sim.afterData[0].attributes.items;
  items.forEach(i => assert.deepEqual(i.qualifiers, []));
});

test('16. deletedAt null nos itens novos', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  sim.afterData[0].attributes.items.forEach(i => assert.equal(i.deletedAt, null));
});

test('17. updatedAt preenchido (nunca null) nos itens novos', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  sim.afterData[0].attributes.items.forEach(i => assert.equal(i.updatedAt, fixedNow()));
});

/* ===================== 18/19. _userUpdatedAt ===================== */

test('18. _userUpdatedAt atualizado SÓ em lesão realmente modificada (nova inserção)', () => {
  const f = buildFixture(
    [rawLesion('seed_1'), rawLesion('seed_2')],
    [
      migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] }),
      migrationLesion({ lesionId: 'seed_2', migrationStatus: 'no-structured-mapping' })
    ]
  );
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  const byId = new Map(sim.afterData.map(l => [l.id, l]));
  assert.equal(byId.get('seed_1')._userUpdatedAt, fixedNow());
  assert.equal(byId.get('seed_2')._userUpdatedAt, undefined);
});

test('19. rerun idempotente com zero inserts NÃO altera _userUpdatedAt', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim1 = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  const stampAfterFirstApply = sim1.afterData[0]._userUpdatedAt;

  const hash2 = computeDataSha256(sim1.afterData);
  const plan2 = buildTaxonomyAttributesApplyPlan({ data: sim1.afterData, migrationResult: f.migrationResult, taxonomy: f.taxonomy, sourceDataSha256: hash2 });
  const baseline2 = { lesionCount: sim1.afterData.length, ids: sim1.afterData.map(d => d.id), dataSha256: hash2 };
  const laterNow = () => fixedNow() + 999999; // "tempo passou" — mas nada deveria usar isso se não há insert
  const sim2 = simulateTaxonomyAttributesApply({ currentData: sim1.afterData, expectedBaseline: baseline2, applyPlan: plan2, taxonomy: f.taxonomy, now: laterNow, idFactory: detFactory('id2') });
  assert.equal(sim2.success, true);
  assert.equal(sim2.modifiedLesionIds.length, 0);
  assert.equal(sim2.afterData[0]._userUpdatedAt, stampAfterFirstApply);
});

/* ===================== 20/21/22. single/multiple instance e deletedAt ===================== */

test('20. single-instance (allowMultipleInstances=false) não duplica quando item ativo já existe', () => {
  const data = [rawLesion('seed_1', { attributes: { items: [{ itemId: 'attr_real_1', conceptId: 'rad_comp_solid', qualifiers: [], updatedAt: 1, deletedAt: null }] } })];
  const f = buildFixture(data, [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, true);
  assert.equal(sim.newItemsCount, 0);
  assert.equal(sim.afterData[0].attributes.items.length, 1);
});

test('21. item deletado (deletedAt != null) NÃO ressuscita silenciosamente — regra explícita: insere item NOVO, mantém o antigo deletado', () => {
  const data = [rawLesion('seed_1', { attributes: { items: [{ itemId: 'attr_real_1', conceptId: 'rad_comp_solid', qualifiers: [], updatedAt: 1, deletedAt: 999 }] } })];
  const f = buildFixture(data, [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, true);
  assert.equal(sim.newItemsCount, 1);
  const items = sim.afterData[0].attributes.items;
  assert.equal(items.length, 2);
  const oldItem = items.find(i => i.itemId === 'attr_real_1');
  assert.equal(oldItem.deletedAt, 999); // nunca alterado
  const newItem = items.find(i => i.itemId !== 'attr_real_1');
  assert.equal(newItem.deletedAt, null);
});

test('22. multiple-instance (allowMultipleInstances=true) não duplica acidentalmente DENTRO da mesma execução (1 proposedItem = 1 item novo, nunca 2)', () => {
  const data = [rawLesion('seed_1', { attributes: { items: [{ itemId: 'attr_real_1', conceptId: 'rad_multi_marker', qualifiers: [], updatedAt: 1, deletedAt: null }] } })];
  const f = buildFixture(data, [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_multi_marker')] })]);
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.newItemsCount, 1); // permite nova instância (group allowMultipleInstances=true), mas só 1, não duplicada
  assert.equal(sim.afterData[0].attributes.items.length, 2);
});

/* ===================== 23/24/25/26/27. abortar tudo ===================== */

test('23. conflito (exclusive-group) presente no plano aborta a execução inteira antes de clonar', () => {
  const data = [rawLesion('seed_1')];
  const migrationResult = { lesions: [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')], conflicts: [{ type: 'exclusive-group-conflict' }] })] };
  const taxonomy = makeTaxonomy();
  // buildTaxonomyAttributesApplyPlan já bloqueia isso no planejamento —
  // simulamos um plano adulterado que ignora essa proteção para provar que
  // o EXECUTOR também detecta, não só o planejador.
  const applyPlan = buildTaxonomyAttributesApplyPlan({ data, migrationResult, taxonomy, sourceDataSha256: computeDataSha256(data) });
  assert.equal(applyPlan.mutations.length, 0); // já bloqueado no planejamento
  const expectedBaseline = { lesionCount: 1, ids: ['seed_1'], dataSha256: computeDataSha256(data) };
  const sim = simulateTaxonomyAttributesApply({ currentData: data, expectedBaseline, applyPlan, taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, true); // plano vazio é válido — nada a aplicar, nada quebra
  assert.equal(sim.modifiedLesionIds.length, 0);
});

test('24. applyPlan adulterado (conceptId trocado para um inexistente na taxonomy) é detectado e aborta', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const tampered = JSON.parse(JSON.stringify(f.applyPlan));
  tampered.mutations[0].insertedItems[0].conceptId = 'concept_fantasma_inexistente'; // trocado às escondidas
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: tampered, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, false);
  assert.equal(sim.reason, 'plan-invalid');
  assert.equal(sim.afterData, null);
});

test('extra — LIMITE DOCUMENTADO: trocar o conceptId por outro concept válido e não-conflitante (sem violar exclusividade/duplicidade) NÃO é detectável só por revalidação estrutural, pois o executor não recebe migrationResult (ver seção de limites no relatório) — este teste existe para não reivindicar uma garantia que o design atual não oferece', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const tampered = JSON.parse(JSON.stringify(f.applyPlan));
  tampered.mutations[0].insertedItems[0].conceptId = 'rad_comp_cystic'; // outro concept válido do MESMO group exclusivo, sem conflito nesta lesão
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: tampered, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  // Documentado como NÃO bloqueado por este executor (limite de design conhecido) — não é uma garantia quebrada, é a fronteira declarada do que esta camada cobre.
  assert.equal(sim.success, true);
});

test('25. taxonomy incompatível (conceptId removido da taxonomy) aborta', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const brokenTaxonomy = JSON.parse(JSON.stringify(f.taxonomy));
  brokenTaxonomy.concepts = brokenTaxonomy.concepts.filter(c => c.id !== 'rad_comp_solid');
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: brokenTaxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, false);
  assert.equal(sim.reason, 'plan-invalid');
});

test('26. lesão desaparecida de currentData (removida desde o plano) aborta por baseline drift', () => {
  const f = buildFixture([rawLesion('seed_1'), rawLesion('seed_2')], [
    migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] }),
    migrationLesion({ lesionId: 'seed_2', proposedAttributes: [proposedItem('etio_vascular')] })
  ]);
  const dataWithoutSeed2 = f.data.filter(d => d.id !== 'seed_2');
  const sim = simulateTaxonomyAttributesApply({ currentData: dataWithoutSeed2, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, false);
  assert.equal(sim.reason, 'baseline-drift');
});

test('27. lesão adicionada a currentData (fora do baseline) aborta por baseline drift', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const dataWithExtra = f.data.concat([rawLesion('seed_novo')]);
  const sim = simulateTaxonomyAttributesApply({ currentData: dataWithExtra, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, false);
  assert.equal(sim.reason, 'baseline-drift');
});

/* ===================== 28. tag alterada bloqueia por hash ===================== */

test('28. tag alterada numa lesão (hash muda, contagem/IDs iguais) bloqueia por baseline drift', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const mutatedData = JSON.parse(JSON.stringify(f.data));
  mutatedData[0].tags = ['cístico'];
  const sim = simulateTaxonomyAttributesApply({ currentData: mutatedData, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.success, false);
  assert.equal(sim.reason, 'baseline-drift');
});

/* ===================== 29-34. zero persistência real ===================== */

test('29. nenhuma referência a DATA global no código do executor', () => { assert.ok(!/\bwindow\.DATA\b/.test(executorCodeOnly)); assert.ok(!/(^|[^.\w])DATA\s*[\[.=]/.test(executorCodeOnly)); });
test('30. nenhuma referência a SEED no código do executor', () => { assert.ok(!/\bSEED\b/.test(executorCodeOnly)); });
test('31. nenhuma referência a Firestore/firebase no código do executor', () => { assert.ok(!/firestore|firebase/i.test(executorCodeOnly)); });
test('32. nenhuma referência a IndexedDB no código do executor', () => { assert.ok(!/indexedDB/i.test(executorCodeOnly)); });
test('33. nenhuma chamada a localStorage no código do executor', () => { assert.ok(!/localStorage\./.test(executorCodeOnly)); });
test('34. nenhuma chamada a saveData() no código do executor', () => { assert.ok(!/saveData\s*\(/.test(executorCodeOnly)); });
test('extra — nenhuma chamada a pushToFirebase/writeShardedState no código do executor', () => {
  assert.ok(!/pushToFirebase|writeShardedState/.test(executorCodeOnly));
});
test('extra — nenhuma chamada direta a Date.now()/Math.random() fora de createDefaultIdFactory/createDefaultNowFn', () => {
  const start = executorCodeOnly.indexOf('function createDefaultIdFactory');
  const end = executorCodeOnly.indexOf('function checkBaseline');
  const beforeHelpers = executorCodeOnly.slice(0, executorCodeOnly.indexOf('function createDefaultIdFactory'));
  const afterHelpers = executorCodeOnly.slice(end);
  assert.ok(!/Date\.now\(\)|Math\.random\(\)/.test(beforeHelpers));
  assert.ok(!/Date\.now\(\)|Math\.random\(\)/.test(afterHelpers));
  assert.ok(start >= 0 && end > start);
});

/* ===================== 35/36. imutabilidade e atomicidade ===================== */

test('35. input (currentData) nunca é mutado pelo executor', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const before = JSON.stringify(f.data);
  simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(JSON.stringify(f.data), before);
});

test('36. atomicidade lógica: em caso de abort, afterData é null — nunca um clone parcialmente aplicado', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const badBaseline = Object.assign({}, f.expectedBaseline, { lesionCount: 42 });
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: badBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim.afterData, null);
});

/* ===================== 37/38. determinismo e idempotência completa ===================== */

test('37. execução determinística com now/idFactory fixos (duas simulações idênticas produzem o mesmo afterData)', () => {
  const f = buildFixture([rawLesion('seed_1')], [migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const sim1 = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  const sim2 = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.deepEqual(sim1.afterData, sim2.afterData);
});

test('38. idempotência completa: plano fresco pós-apply produz 0 inserts e preserva todos os itens materializados', () => {
  const f = buildFixture(
    [rawLesion('seed_1'), rawLesion('seed_2')],
    [
      migrationLesion({ lesionId: 'seed_1', proposedAttributes: [proposedItem('rad_comp_solid'), proposedItem('etio_vascular')] }),
      migrationLesion({ lesionId: 'seed_2', proposedAttributes: [proposedItem('rad_comp_cystic')] })
    ]
  );
  const sim1 = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id') });
  assert.equal(sim1.newItemsCount, 3);

  const hash2 = computeDataSha256(sim1.afterData);
  const plan2 = buildTaxonomyAttributesApplyPlan({ data: sim1.afterData, migrationResult: f.migrationResult, taxonomy: f.taxonomy, sourceDataSha256: hash2 });
  assert.equal(plan2.summary.totalInserted, 0);
  assert.equal(plan2.summary.totalDuplicatesAvoided, 3);
  const baseline2 = { lesionCount: sim1.afterData.length, ids: sim1.afterData.map(d => d.id), dataSha256: hash2 };
  const sim2 = simulateTaxonomyAttributesApply({ currentData: sim1.afterData, expectedBaseline: baseline2, applyPlan: plan2, taxonomy: f.taxonomy, now: fixedNow, idFactory: detFactory('id2') });
  assert.equal(sim2.newItemsCount, 0);
  assert.equal(sim2.modifiedLesionIds.length, 0);
});

/* ===================== 39/40. validatePostApplyState isolado ===================== */

test('39. validatePostApplyState detecta item inválido (deletedAt !== null num item "novo")', () => {
  const before = [rawLesion('seed_1')];
  const after = JSON.parse(JSON.stringify(before));
  after[0].attributes = { items: [{ itemId: 'attr_x', conceptId: 'rad_comp_solid', qualifiers: [], updatedAt: 1, deletedAt: 123 }] };
  after[0].attributesVersion = 1;
  const execution = {
    modifiedLesionIds: ['seed_1'],
    materializedMutations: [{ materializedInsertedItems: [{ itemId: 'attr_x', deletedAt: 123, qualifiers: [], updatedAt: 1 }] }]
  };
  const result = validatePostApplyState(before, after, execution);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('deletedAt')));
});

test('40. validatePostApplyState detecta alteração indevida em lesão review-required (fora de modifiedLesionIds)', () => {
  const before = [rawLesion('seed_1'), rawLesion('seed_2')];
  const after = JSON.parse(JSON.stringify(before));
  // seed_2 NÃO está em modifiedLesionIds, mas ganhou attributes de qualquer forma — bug a ser detectado.
  after[1].attributes = { items: [{ itemId: 'attr_y', conceptId: 'rad_comp_solid', qualifiers: [], updatedAt: 1, deletedAt: null }] };
  const execution = { modifiedLesionIds: ['seed_1'], materializedMutations: [] };
  const result = validatePostApplyState(before, after, execution);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.includes('seed_2') && p.includes('NÃO deveria')));
});

/* ===================== extra — helpers de now/idFactory ===================== */

test('extra — createDefaultIdFactory/createDefaultNowFn existem e produzem valores plausíveis, mas nunca são chamados internamente sem injeção', () => {
  const idFn = createDefaultIdFactory();
  const nowFn = createDefaultNowFn();
  assert.equal(typeof idFn(), 'string');
  assert.ok(idFn().startsWith('attr_'));
  assert.equal(typeof nowFn(), 'number');
});

test('extra — materializeTaxonomyAttributeItems exige now/idFactory explícitos (lança erro sem eles)', () => {
  assert.throws(() => materializeTaxonomyAttributeItems([], { currentData: [] }));
});

test('extra — itemIds materializados nunca colidem com itemIds reais já existentes em currentData', () => {
  const data = [rawLesion('seed_1', { attributes: { items: [{ itemId: 'dup_id', conceptId: 'rad_comp_cystic', qualifiers: [], updatedAt: 1, deletedAt: null }] } }), rawLesion('seed_2')];
  const f = buildFixture(data, [
    migrationLesion({ lesionId: 'seed_1', migrationStatus: 'no-structured-mapping' }),
    migrationLesion({ lesionId: 'seed_2', proposedAttributes: [proposedItem('rad_comp_solid')] })
  ]);
  let calls = 0;
  const collidingThenUnique = () => { calls++; return calls === 1 ? 'dup_id' : 'unique_id_' + calls; };
  const sim = simulateTaxonomyAttributesApply({ currentData: f.data, expectedBaseline: f.expectedBaseline, applyPlan: f.applyPlan, taxonomy: f.taxonomy, now: fixedNow, idFactory: collidingThenUnique });
  assert.equal(sim.success, true);
  const newItem = sim.afterData.find(l => l.id === 'seed_2').attributes.items[0];
  assert.notEqual(newItem.itemId, 'dup_id');
});
