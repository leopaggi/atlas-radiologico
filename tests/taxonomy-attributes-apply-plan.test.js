'use strict';

// TAXO-04C2 — testes do planejador PURO de apply
// (tools/taxonomy-attributes-apply-plan.js). Cobre tanto regras
// estruturais com fixtures sintéticas (sempre rodam, portáteis) quanto
// uma integração real contra o backup externo validado + o dry-run final
// TAXO-04C1 (guardada por existsSync — ambos vivem fora do controle de
// versão, então os testes pulam graciosamente em qualquer máquina onde
// não existam). Nunca toca DATA/SEED/window/document/localStorage/
// IndexedDB/Firestore/saveData — nenhuma escrita real ocorre em lugar
// nenhum deste arquivo.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const PLANNER_PATH = path.join(REPO, 'tools', 'taxonomy-attributes-apply-plan.js');
const planner = require(PLANNER_PATH);
const { buildTaxonomyAttributesApplyPlan, validateApplyBaseline, computeDataSha256, plannedItemId } = planner;

const plannerSrc = fs.readFileSync(PLANNER_PATH, 'utf8');
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}
const plannerCodeOnly = stripJsComments(plannerSrc);

/* ===================== Fixtures sintéticas ===================== */

function makeTaxonomy(overrides) {
  const base = {
    metadata: { schemaVersion: 1, taxonomyVersion: 2, status: 'approved', releaseLabel: '1.1' },
    groups: [
      { id: 'radiologic.composition', label: 'Composição', domain: 'radiologic', exclusive: true, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'radiologic.margins', label: 'Margens', domain: 'radiologic', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'etiology.primary', label: 'Etiologia', domain: 'etiology', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'radiologic.multi', label: 'Multi', domain: 'radiologic', exclusive: false, allowMultipleInstances: true, applicableSections: ['*'] }
    ],
    concepts: [
      { id: 'rad_comp_solid', label: 'sólido', domain: 'radiologic', group: 'radiologic.composition', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'rad_comp_cystic', label: 'cístico', domain: 'radiologic', group: 'radiologic.composition', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'rad_margin_circumscribed', label: 'circunscrita', domain: 'radiologic', group: 'radiologic.margins', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'etio_vascular', label: 'vascular', domain: 'etiology', group: 'etiology.primary', status: 'active', synonyms: [], description: null, relations: {} },
      { id: 'rad_multi_marker', label: 'marcador', domain: 'radiologic', group: 'radiologic.multi', status: 'active', synonyms: [], description: null, relations: {} }
    ]
  };
  return Object.assign({}, base, overrides);
}

function proposedItem(conceptId, sourceTags) {
  return {
    proposedItem: { itemId: 'attr_dryrun_x_' + conceptId, conceptId, qualifiers: [], updatedAt: null, deletedAt: null },
    provenance: { sourceTags: sourceTags || [conceptId], mappingStatus: 'mapped', resolutionType: 'direct' }
  };
}

function migrationLesion(overrides) {
  return Object.assign({
    lesionId: 'seed_1',
    lesionName: 'Lesão teste',
    section: 'Tórax',
    site: 'Nódulo',
    sourceTags: [],
    proposedAttributes: [],
    unmappedTags: [],
    ignoredTags: [],
    ambiguousTags: [],
    reviewTags: [],
    historicalTagsPresent: [],
    staleTagsPresent: [],
    unknownTags: [],
    conflicts: [],
    contextualResolutions: [],
    combinationResolutions: [],
    migrationStatus: 'auto-ready'
  }, overrides);
}

function rawLesion(id, overrides) {
  return Object.assign({ id, name: 'Lesão ' + id, s: 'Tórax', site: 'Nódulo' }, overrides);
}

function makeResult(lesions) {
  return { lesions };
}

/* ===================== 1/2/3/4/5/6. elegibilidade ===================== */

test('1. somente auto-ready entra no plano (review/no-mapping não geram mutations)', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1'), rawLesion('seed_2'), rawLesion('seed_3')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] }),
    migrationLesion({ lesionId: 'seed_2', migrationStatus: 'review-required', ambiguousTags: [{ tag: 'x' }] }),
    migrationLesion({ lesionId: 'seed_3', migrationStatus: 'no-structured-mapping' })
  ]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.deepEqual(plan.eligibleLesionIds, ['seed_1']);
  assert.equal(plan.mutations.length, 1);
});

test('2. review-required nunca entra no plano, mesmo tendo proposedAttributes parciais', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_2')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_2', migrationStatus: 'review-required', proposedAttributes: [proposedItem('etio_vascular')], reviewTags: [{ tag: 'vascular' }] })
  ]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.deepEqual(plan.eligibleLesionIds, []);
  assert.deepEqual(plan.reviewRequiredIds, ['seed_2']);
  assert.equal(plan.mutations.length, 0);
});

test('3. no-structured-mapping nunca entra no plano', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_3')];
  const result = makeResult([migrationLesion({ lesionId: 'seed_3', migrationStatus: 'no-structured-mapping' })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.deepEqual(plan.noStructuredMappingIds, ['seed_3']);
  assert.equal(plan.mutations.length, 0);
});

test('4. lesão com conflicts (exclusive-group-conflict/concept-conflict) marcada auto-ready por engano é BLOQUEADA defensivamente', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_4')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_4', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')], conflicts: [{ type: 'exclusive-group-conflict' }] })
  ]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.deepEqual(plan.eligibleLesionIds, []);
  assert.ok(plan.blockedLesionIds.includes('seed_4'));
  assert.ok(plan.blockedReasons['seed_4'].some(r => r.includes('conflicts')));
});

test('5. lesão "auto-ready" com invalid mapping embutido em conflicts é bloqueada', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_5')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_5', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')], conflicts: [{ type: 'invalid-mapping' }] })
  ]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.ok(plan.blockedLesionIds.includes('seed_5'));
});

test('6. conceptId inexistente na taxonomy bloqueia a lesão', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_6')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_6', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('concept_fantasma')] })
  ]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.ok(plan.blockedLesionIds.includes('seed_6'));
  assert.ok(plan.blockedReasons['seed_6'].some(r => r.includes('concept_fantasma')));
});

/* ===================== 7/8/9. IDs e contagens ===================== */

test('7. IDs de lesões no plano são únicos (nenhuma duplicata entre eligible/blocked/review/noMapping)', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1'), rawLesion('seed_2')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] }),
    migrationLesion({ lesionId: 'seed_2', migrationStatus: 'review-required' })
  ]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  const all = [...plan.eligibleLesionIds, ...plan.blockedLesionIds, ...plan.reviewRequiredIds, ...plan.noStructuredMappingIds];
  assert.equal(new Set(all).size, all.length);
});

test('8/9. integração real: exatamente 625 elegíveis e 1131 proposedItemsConsidered contra o backup validado + TAXO04C1 (pula se os arquivos não existirem nesta máquina)', (t) => {
  const BACKUP_PATH = 'C:/Users/LEONARDO/Downloads/ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json';
  const C1_PATH = path.join(REPO, 'TAXO04C1_FINAL_DRY_RUN.json');
  if (!fs.existsSync(BACKUP_PATH) || !fs.existsSync(C1_PATH)) { t.skip('backup externo e/ou TAXO04C1_FINAL_DRY_RUN.json não encontrados nesta máquina'); return; }
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const migrationResult = JSON.parse(fs.readFileSync(C1_PATH, 'utf8'));
  const realTaxonomy = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXONOMY.json'), 'utf8'));
  const plan = buildTaxonomyAttributesApplyPlan({
    data: backup.data,
    migrationResult,
    taxonomy: realTaxonomy,
    sourceDataSha256: 'f752b7381404cc4339eb4114213321c102737f53e0ef9ca389639b5667ab8541'
  });
  assert.equal(plan.summary.eligibleCount, 625);
  assert.equal(plan.summary.blockedCount, 0);
  assert.equal(plan.summary.totalProposedItemsConsidered, 1131);
  assert.equal(plan.summary.totalInserted, 1131);
  // nota: 1131 é o total de proposedAttributes só das 625 lesões auto-ready;
  // o total global do dry-run (1381) inclui também 250 itens de lesões
  // review-required, que o apply plan corretamente NUNCA processa.
});

/* ===================== 10/11. imutabilidade ===================== */

test('10. input data nunca é mutado pelo planejador', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1')];
  const before = JSON.stringify(data);
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.equal(JSON.stringify(data), before);
});

test('11. migrationResult nunca é mutado pelo planejador', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1')];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const before = JSON.stringify(result);
  buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.equal(JSON.stringify(result), before);
});

/* ===================== 12-17. zero persistência real ===================== */

test('12. nenhuma referência a DATA global no código do planejador', () => {
  assert.ok(!/\bwindow\.DATA\b/.test(plannerCodeOnly));
  assert.ok(!/(^|[^.\w])DATA\s*[\[.=]/.test(plannerCodeOnly));
});
test('13. nenhuma referência a SEED no código do planejador', () => {
  assert.ok(!/\bSEED\b/.test(plannerCodeOnly));
});
test('14. nenhuma chamada a localStorage no código do planejador', () => {
  assert.ok(!/localStorage\./.test(plannerCodeOnly));
});
test('15. nenhuma referência a IndexedDB no código do planejador', () => {
  assert.ok(!/indexedDB/i.test(plannerCodeOnly));
});
test('16. nenhuma referência a Firestore/firebase no código do planejador', () => {
  assert.ok(!/firestore|firebase/i.test(plannerCodeOnly));
});
test('17. nenhuma chamada a saveData() no código do planejador', () => {
  assert.ok(!/saveData\s*\(/.test(plannerCodeOnly));
});
test('extra — nenhuma referência a window/document no código do planejador', () => {
  assert.ok(!/\bwindow\.|<reference lib="dom"/.test(plannerCodeOnly));
  assert.ok(!/\bdocument\./.test(plannerCodeOnly));
});

/* ===================== 18/19/20/21. merge com attributes existentes ===================== */

test('18. merge preserva attributes existentes (item ativo de concept já presente não é descartado)', () => {
  const taxonomy = makeTaxonomy();
  const existingItem = { itemId: 'attr_real_1', conceptId: 'rad_comp_solid', qualifiers: [], updatedAt: 123, deletedAt: null };
  const data = [rawLesion('seed_1', { attributes: { items: [existingItem] } })];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  const mutation = plan.mutations[0];
  assert.deepEqual(mutation.preservedItemIds, ['attr_real_1']);
  assert.equal(mutation.insertedItems.length, 0);
  assert.ok(mutation.resultingAttributes.attributes.items.some(i => i.itemId === 'attr_real_1'));
});

test('19. concept single-instance (allowMultipleInstances=false) não duplica quando já existe item ativo', () => {
  const taxonomy = makeTaxonomy();
  const existingItem = { itemId: 'attr_real_1', conceptId: 'rad_margin_circumscribed', qualifiers: [], updatedAt: 1, deletedAt: null };
  const data = [rawLesion('seed_1', { attributes: { items: [existingItem] } })];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_margin_circumscribed')] })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.equal(plan.summary.totalDuplicatesAvoided, 1);
  assert.equal(plan.summary.totalInserted, 0);
});

test('20. allowMultipleInstances=true permite nova instância mesmo com item ativo existente', () => {
  const taxonomy = makeTaxonomy();
  const existingItem = { itemId: 'attr_real_1', conceptId: 'rad_multi_marker', qualifiers: [], updatedAt: 1, deletedAt: null };
  const data = [rawLesion('seed_1', { attributes: { items: [existingItem] } })];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_multi_marker')] })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.equal(plan.summary.totalInserted, 1);
  assert.equal(plan.summary.totalDuplicatesAvoided, 0);
});

test('21. item existente com deletedAt NÃO bloqueia reinserção (exclusão deliberada não "ressuscita" sozinha)', () => {
  const taxonomy = makeTaxonomy();
  const deletedItem = { itemId: 'attr_real_1', conceptId: 'rad_comp_solid', qualifiers: [], updatedAt: 1, deletedAt: 999 };
  const data = [rawLesion('seed_1', { attributes: { items: [deletedItem] } })];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  const mutation = plan.mutations[0];
  assert.equal(mutation.insertedItems.length, 1);
  assert.equal(mutation.duplicatesAvoided.length, 0);
  // o item deletado original permanece no resultingAttributes (nunca removido silenciosamente)
  assert.ok(mutation.resultingAttributes.attributes.items.some(i => i.itemId === 'attr_real_1' && i.deletedAt === 999));
});

test('extra — conflito clínico com concept diferente no mesmo group exclusivo nunca sobrescreve (fica fora do plano)', () => {
  const taxonomy = makeTaxonomy();
  const existingItem = { itemId: 'attr_real_1', conceptId: 'rad_comp_cystic', qualifiers: [], updatedAt: 1, deletedAt: null };
  const data = [rawLesion('seed_1', { attributes: { items: [existingItem] } })];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  const mutation = plan.mutations[0];
  assert.equal(mutation.insertedItems.length, 0);
  assert.equal(mutation.conflictsWithExisting.length, 1);
  assert.equal(mutation.conflictsWithExisting[0].existingConceptId, 'rad_comp_cystic');
});

/* ===================== 22. idempotência ===================== */

test('22. idempotência: segunda simulação produz zero novas inserções para conceitos já materializados', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1'), rawLesion('seed_2')];
  const result = makeResult([
    migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid'), proposedItem('etio_vascular')] }),
    migrationLesion({ lesionId: 'seed_2', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_margin_circumscribed')] })
  ]);
  const plan1 = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.ok(plan1.summary.totalInserted > 0);

  // Simula a aplicação em memória, numa CÓPIA — nunca na `data` original.
  const cloneData = JSON.parse(JSON.stringify(data));
  const byId = new Map(cloneData.map(l => [l.id, l]));
  plan1.mutations.forEach(m => { byId.get(m.lesionId).attributes = m.resultingAttributes.attributes; });

  const plan2 = buildTaxonomyAttributesApplyPlan({ data: cloneData, migrationResult: result, taxonomy });
  assert.equal(plan2.summary.totalInserted, 0);
  assert.equal(plan2.summary.totalDuplicatesAvoided, plan1.summary.totalInserted);
  // `data` original (não a cópia) continua sem attributes.
  assert.equal(data[0].attributes, undefined);
});

/* ===================== 23/24/25/26. proteção de drift ===================== */

test('23. alteração de conteúdo de uma lesão no baseline bloqueia apply (drift de hash)', () => {
  const data = [rawLesion('seed_1'), rawLesion('seed_2')];
  const baseline = { lesionCount: 2, ids: data.map(d => d.id), dataSha256: computeDataSha256(data) };
  const drifted = JSON.parse(JSON.stringify(data));
  drifted[0].name = 'Nome alterado';
  const check = validateApplyBaseline(drifted, baseline);
  assert.equal(check.ok, false);
  assert.equal(check.driftDetected, true);
});

test('24. adição de lesão ao baseline bloqueia apply (drift de IDs)', () => {
  const data = [rawLesion('seed_1'), rawLesion('seed_2')];
  const baseline = { lesionCount: 2, ids: data.map(d => d.id), dataSha256: computeDataSha256(data) };
  const added = data.concat([rawLesion('seed_3')]);
  const check = validateApplyBaseline(added, baseline);
  assert.equal(check.ok, false);
  assert.deepEqual(check.idsAdded, ['seed_3']);
});

test('25. remoção de lesão do baseline bloqueia apply (drift de IDs)', () => {
  const data = [rawLesion('seed_1'), rawLesion('seed_2')];
  const baseline = { lesionCount: 2, ids: data.map(d => d.id), dataSha256: computeDataSha256(data) };
  const removed = data.slice(0, 1);
  const check = validateApplyBaseline(removed, baseline);
  assert.equal(check.ok, false);
  assert.deepEqual(check.idsRemoved, ['seed_2']);
});

test('26. baseline sem nenhum drift passa (ok=true, driftDetected=false)', () => {
  const data = [rawLesion('seed_1'), rawLesion('seed_2')];
  const baseline = { lesionCount: 2, ids: data.map(d => d.id), dataSha256: computeDataSha256(data) };
  const check = validateApplyBaseline(data, baseline);
  assert.equal(check.ok, true);
  assert.equal(check.driftDetected, false);
  assert.deepEqual(check.idsAdded, []);
  assert.deepEqual(check.idsRemoved, []);
});

/* ===================== 27. nenhuma geração de ID real ===================== */

test('27. nenhum itemId gerado nesta fase usa o padrão de produção real (Date.now()/Math.random()) — só placeholder determinístico', () => {
  assert.equal(plannedItemId('L1', 'c1'), plannedItemId('L1', 'c1'));
  assert.ok(plannedItemId('L1', 'c1').startsWith('attr_planned_'));
  assert.ok(!/Date\.now\(\)|Math\.random\(\)/.test(plannedItemId.toString()));

  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1')];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  plan.mutations[0].insertedItems.forEach(item => {
    assert.ok(item.itemId.startsWith('attr_planned_'));
    assert.equal(item.updatedAt, null);
  });
});

/* ===================== extra — determinismo global do plano ===================== */

test('extra — buildTaxonomyAttributesApplyPlan é determinístico para os mesmos inputs', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1')];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'auto-ready', proposedAttributes: [proposedItem('rad_comp_solid')] })]);
  const p1 = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  const p2 = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.deepEqual(p1, p2);
});

test('extra — metadata.writePerformed é sempre false e planOnly é sempre true', () => {
  const taxonomy = makeTaxonomy();
  const data = [rawLesion('seed_1')];
  const result = makeResult([migrationLesion({ lesionId: 'seed_1', migrationStatus: 'no-structured-mapping' })]);
  const plan = buildTaxonomyAttributesApplyPlan({ data, migrationResult: result, taxonomy });
  assert.equal(plan.metadata.writePerformed, false);
  assert.equal(plan.metadata.planOnly, true);
  assert.equal(plan.metadata.generatedAt, null);
});
