'use strict';

// TAXO-04A — testes do motor PURO de dry-run (tools/taxonomy-migration-dry-run.js).
// Não toca DATA/SEED/index.html/Firestore/IndexedDB/localStorage — o motor em
// si recebe tudo por parâmetro; estes testes usam fixtures sintéticas
// mínimas para os 26 cenários pedidos, e uma integração leve contra os
// arquivos reais (TAXONOMY.json/TAG_TO_TAXONOMY_MAP.json) só para confirmar
// que o motor não quebra sobre os dados de verdade.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ENGINE_PATH = path.resolve(__dirname, '..', 'tools', 'taxonomy-migration-dry-run.js');
const engine = require(ENGINE_PATH);
const { simulateTagToAttributesMigration, simulateLesionMigration, buildFixtureFromLiveSnapshot, dryRunItemId, CONTEXTUAL_RESOLVERS, COMBINATION_RESOLVERS } = engine;

const REPO = path.resolve(__dirname, '..');
const engineSrc = fs.readFileSync(ENGINE_PATH, 'utf8');

// Remove comentários antes das checagens estáticas de "nunca faz X" — o
// próprio arquivo DOCUMENTA extensivamente essas garantias em comentários
// (ex.: "nunca chama saveData()/.../nunca lê SEED/IndexedDB/Firestore"),
// então checar a palavra em texto bruto geraria falso positivo contra a
// própria explicação de que ela NÃO é usada. Mesma stripagem simples (sem
// noção de regex literal) já usada por outras suítes deste projeto.
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}
const engineCodeOnly = stripJsComments(engineSrc);

/* ===================== Fixtures sintéticas mínimas ===================== */

function makeTaxonomy(overrides) {
  const base = {
    metadata: { schemaVersion: 1, taxonomyVersion: 2, status: 'approved', releaseLabel: '1.1' },
    groups: [
      { id: 'radiologic.composition', label: 'Composição', domain: 'radiologic', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'radiologic.growthRate', label: 'Velocidade de crescimento', domain: 'radiologic', exclusive: true, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'radiologic.periostealReaction', label: 'Reação periosteal', domain: 'radiologic', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'radiologic.boneDensity', label: 'Densidade óssea', domain: 'radiologic', exclusive: true, allowMultipleInstances: false, applicableSections: ['*'] },
      { id: 'etiology.primary', label: 'Etiologia', domain: 'etiology', exclusive: false, allowMultipleInstances: false, applicableSections: ['*'] }
    ],
    concepts: [
      { id: 'rad_comp_solid', label: 'sólido', domain: 'radiologic', group: 'radiologic.composition', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'rad_periosteal_solid', label: 'sólida', domain: 'radiologic', group: 'radiologic.periostealReaction', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'rad_bonedensity_lytic', label: 'lítico', domain: 'radiologic', group: 'radiologic.boneDensity', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'rad_bonedensity_sclerotic', label: 'esclerótico', domain: 'radiologic', group: 'radiologic.boneDensity', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'rad_growthrate_slow', label: 'lento', domain: 'radiologic', group: 'radiologic.growthRate', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'rad_growthrate_fast', label: 'rápido', domain: 'radiologic', group: 'radiologic.growthRate', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'etio_traumatic', label: 'traumático', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'etio_benign_x', label: 'benigno-x', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] }, conflictsWith: ['etio_malignant_x'] },
      { id: 'etio_malignant_x', label: 'maligno-x', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] }, conflictsWith: ['etio_benign_x'] },
      { id: 'etio_old_deprecated', label: 'antigo', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'deprecated', aliasOf: 'etio_traumatic', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'etio_circular_a', label: 'circular-a', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'deprecated', aliasOf: 'etio_circular_b', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'etio_circular_b', label: 'circular-b', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'deprecated', aliasOf: 'etio_circular_a', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'etio_broken_alias', label: 'quebrado', domain: 'etiology', group: 'etiology.primary', subgroups: null, status: 'deprecated', aliasOf: 'etio_nao_existe', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } },
      { id: 'etio_orphan_group', label: 'orfao', domain: 'etiology', group: 'etiology.nonexistent', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } }
    ]
  };
  return Object.assign({}, base, overrides || {});
}

function mappedEntry(conceptId, catalogState) {
  return { catalogState: catalogState || 'live', isLiveOnly: false, decisionState: 'none', decision: null, mapping: { status: 'mapped', conceptIds: [conceptId], confidence: 'high', notes: 'teste', source: { usageCount: 1 } } };
}
function ambiguousEntry(candidates) {
  return { catalogState: 'live', isLiveOnly: false, decisionState: 'none', decision: null, mapping: { status: 'ambiguous', conceptIds: [], candidates, confidence: null, notes: 'teste', source: { usageCount: 1 } } };
}
function reviewEntry(conceptId) {
  return { catalogState: 'live', isLiveOnly: false, decisionState: 'none', decision: null, mapping: { status: 'review', conceptIds: conceptId ? [conceptId] : [], confidence: 'high', notes: 'teste', source: { usageCount: 1 } } };
}
function unmappedEntry() {
  return { catalogState: 'live', isLiveOnly: false, decisionState: 'none', decision: null, mapping: { status: 'unmapped', conceptIds: [], confidence: null, notes: 'teste', source: { usageCount: 1 } } };
}
function ignoredEntry() {
  return { catalogState: 'live', isLiveOnly: false, decisionState: 'none', decision: null, mapping: { status: 'ignored', conceptIds: [], confidence: null, notes: 'teste', source: { usageCount: 1 } } };
}

function makeTagMap(mappings, historicalMappings) {
  return {
    metadata: { schemaVersion: 1, taxonomyVersion: 2, status: 'draft' },
    mappings: mappings || {},
    historicalMappings: historicalMappings || {},
    staleOrUnappliedTags: {},
    taxonomyGapCandidates: [],
    coverage: { confirmedConceptCoverage: [], potentialConceptCoverage: [], historicalConceptCoverage: [], conceptsWithoutLegacyTag: [] }
  };
}

function lesion(over) {
  return Object.assign({ id: 'L1', name: 'Lesão teste', s: 'Seção teste', site: 'Sítio teste', tags: [] }, over || {});
}

/* ===================== 1-26: pontos pedidos ===================== */

test('1. mapped tag cria attribute', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': mappedEntry('rad_comp_solid') });
  const r = simulateLesionMigration(lesion({ tags: ['sólido'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 1);
  assert.equal(r.proposedAttributes[0].proposedItem.conceptId, 'rad_comp_solid');
  assert.equal(r.migrationStatus, 'auto-ready');
});

test('2. ambiguous NÃO cria attribute (e bloqueia auto-ready)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'bilateral': ambiguousEntry([{ conceptId: 'rad_comp_solid', context: {} }, { conceptId: 'etio_traumatic', context: {} }]) });
  const r = simulateLesionMigration(lesion({ tags: ['bilateral'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
  assert.equal(r.migrationStatus, 'review-required');
});

test('3. review NÃO cria attribute (e bloqueia auto-ready)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'vascular': reviewEntry('etio_traumatic') });
  const r = simulateLesionMigration(lesion({ tags: ['vascular'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.reviewTags.length, 1);
  assert.equal(r.migrationStatus, 'review-required');
});

test('4. ignored NÃO cria attribute', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sinal do alvo': ignoredEntry() });
  const r = simulateLesionMigration(lesion({ tags: ['sinal do alvo'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.ignoredTags.length, 1);
});

test('5. tag historical NÃO cria attribute, mesmo que historicalMappings tenha conceptId', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({}, { 'trauma antigo': { catalogState: 'historical-edited', target: 'trauma', originalMapping: { status: 'mapped', conceptIds: ['etio_traumatic'] } } });
  const r = simulateLesionMigration(lesion({ tags: ['trauma antigo'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.historicalTagsPresent.length, 1);
  assert.equal(r.migrationStatus, 'no-structured-mapping');
});

test('6. múltiplas tags para o MESMO concept deduplicam em um único proposedAttribute', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'infiltrativo': mappedEntry('rad_comp_solid'), 'infiltrativa': mappedEntry('rad_comp_solid') });
  const r = simulateLesionMigration(lesion({ tags: ['infiltrativo', 'infiltrativa'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 1);
  assert.deepEqual(r.proposedAttributes[0].provenance.sourceTags.sort(), ['infiltrativa', 'infiltrativo']);
});

test('7. exclusive group conflict bloqueia auto-ready (e exclui os concepts conflitantes)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'crescimento lento': mappedEntry('rad_growthrate_slow'), 'crescimento rápido': mappedEntry('rad_growthrate_fast') });
  const r = simulateLesionMigration(lesion({ tags: ['crescimento lento', 'crescimento rápido'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0, 'ambos ficam de fora até revisão humana');
  assert.equal(r.conflicts.filter(c => c.type === 'exclusive-group-conflict').length, 1);
  assert.equal(r.migrationStatus, 'review-required');
});

test('8. conflictsWith gera concept-conflict', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'benigno-x': mappedEntry('etio_benign_x'), 'maligno-x': mappedEntry('etio_malignant_x') });
  const r = simulateLesionMigration(lesion({ tags: ['benigno-x', 'maligno-x'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.conflicts.filter(c => c.type === 'concept-conflict').length, 1);
  assert.equal(r.migrationStatus, 'review-required');
});

test('9. unmapped NÃO bloqueia auto-ready (coexiste com um mapped válido)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'trauma': mappedEntry('etio_traumatic'), 'palavra-chave didática': unmappedEntry() });
  const r = simulateLesionMigration(lesion({ tags: ['trauma', 'palavra-chave didática'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 1);
  assert.equal(r.unmappedTags.length, 1);
  assert.equal(r.migrationStatus, 'auto-ready');
});

test('10. ignored NÃO bloqueia auto-ready (coexiste com um mapped válido)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'trauma': mappedEntry('etio_traumatic'), 'sinal do alvo': ignoredEntry() });
  const r = simulateLesionMigration(lesion({ tags: ['trauma', 'sinal do alvo'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 1);
  assert.equal(r.ignoredTags.length, 1);
  assert.equal(r.migrationStatus, 'auto-ready');
});

test('11. nenhuma tag mapped vira "no-structured-mapping"', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'palavra-chave didática': unmappedEntry(), 'sinal do alvo': ignoredEntry() });
  const r = simulateLesionMigration(lesion({ tags: ['palavra-chave didática', 'sinal do alvo'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.migrationStatus, 'no-structured-mapping');
});

test('12. concept inválido (group inexistente) gera issue "invalid-mapping" e não cria attribute', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'órfão': mappedEntry('etio_orphan_group') });
  const r = simulateLesionMigration(lesion({ tags: ['órfão'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.conflicts.filter(c => c.type === 'invalid-mapping').length, 1);
  assert.equal(r.migrationStatus, 'review-required');
});

test('13. concept deprecated com aliasOf válido resolve corretamente (vira o concept de destino)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'termo antigo': mappedEntry('etio_old_deprecated') });
  const r = simulateLesionMigration(lesion({ tags: ['termo antigo'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 1);
  assert.equal(r.proposedAttributes[0].proposedItem.conceptId, 'etio_traumatic', 'deveria resolver via aliasOf');
});

test('13b. aliasOf apontando para id inexistente gera issue, não quebra', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'quebrado': mappedEntry('etio_broken_alias') });
  const r = simulateLesionMigration(lesion({ tags: ['quebrado'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.conflicts.filter(c => c.type === 'invalid-mapping').length, 1);
});

test('14. aliasOf circular gera issue (nunca trava em loop infinito)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'circular': mappedEntry('etio_circular_a') });
  const r = simulateLesionMigration(lesion({ tags: ['circular'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  const issue = r.conflicts.find(c => c.type === 'invalid-mapping');
  assert.ok(issue);
  assert.match(issue.reason, /circular/i);
});

test('15. itemId é determinístico (mesmo lesionId+conceptId => mesmo itemId sempre)', () => {
  assert.equal(dryRunItemId('seed_42', 'rad_comp_solid'), dryRunItemId('seed_42', 'rad_comp_solid'));
  assert.notEqual(dryRunItemId('seed_42', 'rad_comp_solid'), dryRunItemId('seed_43', 'rad_comp_solid'));
  assert.doesNotMatch(dryRunItemId('seed_42', 'rad_comp_solid'), /^seed_/);
});

test('16. inputs (data/taxonomy/tagMap) nunca são mutados pelo motor', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': mappedEntry('rad_comp_solid'), 'infiltrativo': mappedEntry('rad_comp_solid') });
  const data = [lesion({ id: 'L1', tags: ['sólido', 'infiltrativo'] })];
  const taxonomyBefore = JSON.stringify(taxonomy);
  const tagMapBefore = JSON.stringify(tagMap);
  const dataBefore = JSON.stringify(data);
  simulateTagToAttributesMigration(data, taxonomy, tagMap);
  assert.equal(JSON.stringify(taxonomy), taxonomyBefore, 'taxonomy não deveria ser mutado');
  assert.equal(JSON.stringify(tagMap), tagMapBefore, 'tagMap não deveria ser mutado');
  assert.equal(JSON.stringify(data), dataBefore, 'data não deveria ser mutado');
});

test('17. output é determinístico para os mesmos inputs (duas chamadas idênticas produzem o mesmo resultado)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': mappedEntry('rad_comp_solid'), 'trauma': mappedEntry('etio_traumatic') });
  const data = [lesion({ id: 'L1', tags: ['sólido', 'trauma'] })];
  const r1 = simulateTagToAttributesMigration(data, taxonomy, tagMap);
  const r2 = simulateTagToAttributesMigration(data, taxonomy, tagMap);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
});

test('18. qualifiers sempre [] nesta fase (nunca inferidos)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': mappedEntry('rad_comp_solid') });
  const r = simulateLesionMigration(lesion({ tags: ['sólido'] }), taxonomy, tagMap);
  assert.deepEqual(r.proposedAttributes[0].proposedItem.qualifiers, []);
});

test('19. updatedAt NUNCA recebe timestamp real (sempre null no dry-run)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': mappedEntry('rad_comp_solid') });
  const r = simulateLesionMigration(lesion({ tags: ['sólido'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes[0].proposedItem.updatedAt, null);
  assert.equal(r.proposedAttributes[0].proposedItem.deletedAt, null);
});

test('20. nenhuma função de persistência real existe no CÓDIGO (fora de comentários) do motor', () => {
  assert.doesNotMatch(engineCodeOnly, /saveData\s*\(|storage\.set\s*\(|storage\.delete\s*\(|markSyncDirty\s*\(|pushToFirebaseNow\s*\(|writeShardedStateSerialized\s*\(/);
});

test('21. nenhuma referência à variável global DATA como código', () => {
  assert.doesNotMatch(engineCodeOnly, /\bDATA\s*[.\[=]/);
});

test('22. nenhuma referência a SEED como código (fora de comentários)', () => {
  assert.doesNotMatch(engineCodeOnly, /\bSEED\b/);
});

test('23. nenhuma chamada a localStorage', () => {
  assert.doesNotMatch(engineCodeOnly, /localStorage\./);
});

test('24. nenhuma chamada/referência real a Firestore no CÓDIGO (fora de comentários)', () => {
  assert.doesNotMatch(engineCodeOnly, /firestore/i);
});

test('25. nenhuma chamada a IndexedDB / storage.get/set/delete/list no CÓDIGO (fora de comentários)', () => {
  assert.doesNotMatch(engineCodeOnly, /indexedDB/i);
  assert.doesNotMatch(engineCodeOnly, /\bstorage\.(get|set|delete|list)\s*\(/);
});

test('26. o motor nunca propõe remover/alterar tags (sem .tags = / .tags.splice / .tags.pop em código real, só leitura)', () => {
  assert.doesNotMatch(engineCodeOnly, /\.tags\s*=\s*[^=]/);
  assert.doesNotMatch(engineCodeOnly, /\.tags\.(splice|pop|shift|filter\s*\(.*=>.*\)\s*;?\s*$)/m);
  // o único uso real de "tags" além de leitura é slice() (cópia defensiva, nunca mutação).
});

/* ===================== Verificações extras ===================== */

test('extra — buildFixtureFromLiveSnapshot consolida lesionId -> Set(tags) corretamente', () => {
  const snapshot = {
    liveTags: {
      trauma: { usageCount: 2, lesions: [{ id: 'seed_1', name: 'Fratura', section: 'MSK', site: 'Fêmur' }, { id: 'seed_2', name: 'Hematoma', section: 'MSK', site: 'Braço' }] },
      'sólido': { usageCount: 1, lesions: [{ id: 'seed_1', name: 'Fratura', section: 'MSK', site: 'Fêmur' }] }
    }
  };
  const { fixture, warnings } = buildFixtureFromLiveSnapshot(snapshot);
  assert.equal(fixture.length, 2);
  const l1 = fixture.find(l => l.id === 'seed_1');
  assert.deepEqual(l1.tags.sort(), ['sólido', 'trauma']);
  assert.equal(warnings.length, 0);
});

test('extra — buildFixtureFromLiveSnapshot gera warning em inconsistência de metadata, sem escolher silenciosamente', () => {
  const snapshot = {
    liveTags: {
      a: { usageCount: 1, lesions: [{ id: 'seed_9', name: 'Nome A', section: 'Sec A', site: 'Site A' }] },
      b: { usageCount: 1, lesions: [{ id: 'seed_9', name: 'Nome B (diferente)', section: 'Sec A', site: 'Site A' }] }
    }
  };
  const { warnings } = buildFixtureFromLiveSnapshot(snapshot);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].field, 'name');
});

test('extra — integração leve: motor não quebra sobre TAXONOMY.json/TAG_TO_TAXONOMY_MAP.json reais', () => {
  const realTaxonomy = JSON.parse(fs.readFileSync(path.resolve(REPO, 'TAXONOMY.json'), 'utf8'));
  const realTagMap = JSON.parse(fs.readFileSync(path.resolve(REPO, 'TAG_TO_TAXONOMY_MAP.json'), 'utf8'));
  const data = [lesion({ id: 'seed_x', tags: ['trauma', 'sólido', 'sinal do alvo', 'tag-completamente-desconhecida-xyz'] })];
  const result = simulateTagToAttributesMigration(data, realTaxonomy, realTagMap);
  assert.equal(result.summary.lesionsAnalyzed, 1);
  assert.equal(result.metadata.dryRun, true);
  assert.equal(result.metadata.writePerformed, false);
  assert.equal(result.metadata.taxonomyVersion, realTaxonomy.metadata.taxonomyVersion);
});

/* ===================== TAXO-04B — resolvers contextuais (20 pontos) ===================== */

function solidAmbiguousEntry() {
  return ambiguousEntry([
    { conceptId: 'rad_comp_solid', context: { domain: 'radiologic', group: 'radiologic.composition' } },
    { conceptId: 'rad_periosteal_solid', context: { domain: 'radiologic', group: 'radiologic.periostealReaction' } }
  ]);
}

test('1. resolver contextual só executa em ambiguous apropriado (appliesTo é específico ao par sólido/periosteal, não a qualquer ambiguidade)', () => {
  const resolver = CONTEXTUAL_RESOLVERS.find(r => r.ruleId === 'resolve-solid-composition-v1');
  assert.ok(resolver);
  assert.equal(resolver.appliesTo('sólido', ['rad_comp_solid', 'rad_periosteal_solid']), true);
  assert.equal(resolver.appliesTo('bilateral', ['clin_lat_bilateral', 'rad_lat_bilateral']), false, 'não deveria se candidatar para outra tag');
  assert.equal(resolver.appliesTo('sólido', ['rad_comp_solid']), false, 'não deveria se candidatar com candidatos diferentes do par esperado');
});

test('2. resolver NUNCA altera o mapping original em TAG_TO_TAXONOMY_MAP.json (continua "ambiguous" depois da simulação)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry() });
  const before = JSON.stringify(tagMap.mappings['sólido']);
  simulateLesionMigration(lesion({ tags: ['sólido'] }), taxonomy, tagMap);
  assert.equal(JSON.stringify(tagMap.mappings['sólido']), before, 'a ambiguidade original no mapa nunca é tocada pelo resolver');
  assert.equal(tagMap.mappings['sólido'].mapping.status, 'ambiguous');
});

test('3. fallback mantém ambiguity quando há contexto ósseo/periosteal na mesma lesão', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry(), 'casca de cebola': mappedEntry('rad_bonedensity_lytic') });
  const r = simulateLesionMigration(lesion({ tags: ['sólido', 'casca de cebola'] }), taxonomy, tagMap);
  assert.equal(r.contextualResolutions.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
  assert.equal(r.ambiguousTags[0].tag, 'sólido');
  assert.equal(r.ambiguousTags[0].resolverAttempted, 'resolve-solid-composition-v1');
});

test('4. provenance do proposedAttribute resolvido inclui ruleId e resolutionType="contextual-rule"', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry() });
  const r = simulateLesionMigration(lesion({ tags: ['sólido'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 1);
  assert.equal(r.proposedAttributes[0].proposedItem.conceptId, 'rad_comp_solid');
  assert.equal(r.proposedAttributes[0].provenance.resolutionType, 'contextual-rule');
  assert.equal(r.proposedAttributes[0].provenance.ruleId, 'resolve-solid-composition-v1');
});

test('5. regra sólida-composição funciona em fixture adequada (sem nenhum outro concept ósseo/periosteal na lesão)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry(), 'trauma': mappedEntry('etio_traumatic') });
  const r = simulateLesionMigration(lesion({ tags: ['sólido', 'trauma'] }), taxonomy, tagMap);
  assert.equal(r.contextualResolutions.length, 1);
  assert.equal(r.contextualResolutions[0].resolvedConceptId, 'rad_comp_solid');
  assert.equal(r.migrationStatus, 'auto-ready');
});

test('6. contexto periosteal/ósseo explícito NUNCA vira composition automaticamente (resolver recua)', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry(), 'lítica': mappedEntry('rad_bonedensity_lytic') });
  const r = simulateLesionMigration(lesion({ tags: ['sólido', 'lítica'] }), taxonomy, tagMap);
  assert.ok(!r.proposedAttributes.some(p => p.proposedItem.conceptId === 'rad_comp_solid'));
  assert.equal(r.ambiguousTags.length, 1);
});

test('7. candidatos fora do par esperado (ambiguidade "insuficiente" para este resolver) mantém sólido ambiguous sem tentar resolver', () => {
  const taxonomy = makeTaxonomy();
  // ambiguidade com um 3º candidato não previsto pelo resolver — appliesTo
  // deve recusar (guarda de especificidade), nunca "tentar mesmo assim".
  const tagMap = makeTagMap({ 'sólido': ambiguousEntry([
    { conceptId: 'rad_comp_solid', context: {} },
    { conceptId: 'rad_periosteal_solid', context: {} },
    { conceptId: 'etio_traumatic', context: {} }
  ]) });
  const r = simulateLesionMigration(lesion({ tags: ['sólido'] }), taxonomy, tagMap);
  assert.equal(r.contextualResolutions.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
  assert.equal(r.ambiguousTags[0].resolverAttempted, undefined, 'nem deveria ter tentado — appliesTo já recusa');
});

test('8. lítica+esclerótica NÃO resolve automaticamente para "mixed" (regra avaliada e deliberadamente rejeitada nesta rodada)', () => {
  const { COMBINATION_RESOLVERS } = engine;
  assert.equal(COMBINATION_RESOLVERS.length, 0, 'nenhum combinationResolver foi aprovado — ver justificativa no código/relatório (multifocal + padrões nidus/rim exigiriam conhecimento diagnóstico)');
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'lítica': mappedEntry('rad_bonedensity_lytic'), 'esclerótica': mappedEntry('rad_bonedensity_sclerotic') });
  const r = simulateLesionMigration(lesion({ tags: ['lítica', 'esclerótica'] }), taxonomy, tagMap);
  assert.equal(r.conflicts.filter(c => c.type === 'exclusive-group-conflict').length, 1, 'conflito exclusive continua ocorrendo, sem resolução automática');
  assert.equal(r.migrationStatus, 'review-required');
});

test('9. o mecanismo de dedup/conflito já suporta uma futura resolução combinada (prova estrutural, sem precisar de um combinationResolver falso)', () => {
  // Se "lítica" e "esclerótica" fossem, no futuro, ambas corrigidas no mapa
  // (globalMappingProposal aprovado por humano) para apontar para o MESMO
  // concept rad_bonedensity_mixed, o conflito exclusive desapareceria
  // sozinho pelo dedup já existente — sem precisar de nenhum código novo.
  const taxonomyWithMixed = makeTaxonomy({
    groups: makeTaxonomy().groups,
    concepts: [...makeTaxonomy().concepts, { id: 'rad_bonedensity_mixed', label: 'misto', domain: 'radiologic', group: 'radiologic.boneDensity', subgroups: null, status: 'active', description: null, synonyms: [], relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] } }]
  });
  const tagMap = makeTagMap({ 'lítica': mappedEntry('rad_bonedensity_mixed'), 'esclerótica': mappedEntry('rad_bonedensity_mixed') });
  const r = simulateLesionMigration(lesion({ tags: ['lítica', 'esclerótica'] }), taxonomyWithMixed, tagMap);
  assert.equal(r.conflicts.filter(c => c.type === 'exclusive-group-conflict').length, 0);
  assert.equal(r.proposedAttributes.length, 1);
  assert.equal(r.proposedAttributes[0].proposedItem.conceptId, 'rad_bonedensity_mixed');
});

test('10. resolver não afeta outras tags/concepts da mesma lesão', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry(), 'trauma': mappedEntry('etio_traumatic'), 'palavra-chave didática': unmappedEntry() });
  const r = simulateLesionMigration(lesion({ tags: ['sólido', 'trauma', 'palavra-chave didática'] }), taxonomy, tagMap);
  assert.ok(r.proposedAttributes.some(p => p.proposedItem.conceptId === 'etio_traumatic' && p.provenance.resolutionType === 'direct'));
  assert.deepEqual(r.unmappedTags, ['palavra-chave didática']);
});

test('11. "calcificações" não resolve sem contexto suficiente (nenhum resolver registrado para ela nesta rodada)', () => {
  assert.ok(!CONTEXTUAL_RESOLVERS.some(r => r.appliesTo('calcificações', ['rad_comp_calcified', 'rad_assoc_calcifications'])));
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'calcificações': ambiguousEntry([{ conceptId: 'rad_comp_solid', context: {} }, { conceptId: 'etio_traumatic', context: {} }]) });
  const r = simulateLesionMigration(lesion({ tags: ['calcificações'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
});

test('12. "hemorrágico" não resolve sem contexto suficiente (nenhum resolver registrado)', () => {
  assert.ok(!CONTEXTUAL_RESOLVERS.some(r => r.appliesTo('hemorrágico', ['rad_comp_solid', 'etio_traumatic'])));
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'hemorrágico': ambiguousEntry([{ conceptId: 'rad_comp_solid', context: {} }, { conceptId: 'etio_traumatic', context: {} }]) });
  const r = simulateLesionMigration(lesion({ tags: ['hemorrágico'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
});

test('13. "bilateral" não resolve sem contexto suficiente (nenhum resolver registrado)', () => {
  assert.ok(!CONTEXTUAL_RESOLVERS.some(r => r.appliesTo('bilateral', ['rad_comp_solid', 'etio_traumatic'])));
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'bilateral': ambiguousEntry([{ conceptId: 'rad_comp_solid', context: {} }, { conceptId: 'etio_traumatic', context: {} }]) });
  const r = simulateLesionMigration(lesion({ tags: ['bilateral'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
});

test('14. "difuso" não resolve sem contexto suficiente (nenhum resolver registrado)', () => {
  assert.ok(!CONTEXTUAL_RESOLVERS.some(r => r.appliesTo('difuso', ['rad_comp_solid', 'etio_traumatic'])));
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'difuso': ambiguousEntry([{ conceptId: 'rad_comp_solid', context: {} }, { conceptId: 'etio_traumatic', context: {} }]) });
  const r = simulateLesionMigration(lesion({ tags: ['difuso'] }), taxonomy, tagMap);
  assert.equal(r.proposedAttributes.length, 0);
  assert.equal(r.ambiguousTags.length, 1);
});

test('15. inputs continuam imutáveis quando um resolver é acionado', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry() });
  const data = [lesion({ id: 'L1', tags: ['sólido'] })];
  const taxonomyBefore = JSON.stringify(taxonomy);
  const tagMapBefore = JSON.stringify(tagMap);
  const dataBefore = JSON.stringify(data);
  simulateTagToAttributesMigration(data, taxonomy, tagMap);
  assert.equal(JSON.stringify(taxonomy), taxonomyBefore);
  assert.equal(JSON.stringify(tagMap), tagMapBefore);
  assert.equal(JSON.stringify(data), dataBefore);
});

test('16. output continua determinístico quando um resolver é acionado', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry() });
  const data = [lesion({ id: 'L1', tags: ['sólido'] })];
  const r1 = simulateTagToAttributesMigration(data, taxonomy, tagMap);
  const r2 = simulateTagToAttributesMigration(data, taxonomy, tagMap);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
});

test('17/18/19/20. a região de código dos resolvers (CONTEXTUAL_RESOLVERS/COMBINATION_RESOLVERS) não introduz nenhuma persistência real, nem referências a DATA/SEED/localStorage/Firestore/IndexedDB', () => {
  const start = engineCodeOnly.indexOf('const BONE_CONTEXT_GROUPS');
  const end = engineCodeOnly.indexOf('function simulateLesionMigration');
  assert.ok(start >= 0 && end > start, 'não encontrou a região dos resolvers no código');
  const resolversCodeOnly = engineCodeOnly.slice(start, end);
  assert.doesNotMatch(resolversCodeOnly, /saveData\s*\(|storage\.(set|delete|get|list)\s*\(|markSyncDirty\s*\(|pushToFirebaseNow\s*\(|writeShardedStateSerialized\s*\(/);
  assert.doesNotMatch(resolversCodeOnly, /\bDATA\s*[.\[=]/);
  assert.doesNotMatch(resolversCodeOnly, /\bSEED\b/);
  assert.doesNotMatch(resolversCodeOnly, /localStorage\.|firestore|indexedDB/i);
});

test('extra — resolverUsage agregado nunca fica silencioso: registra ruleId, total e lesões atingidas', () => {
  const taxonomy = makeTaxonomy();
  const tagMap = makeTagMap({ 'sólido': solidAmbiguousEntry() });
  const data = [lesion({ id: 'L1', tags: ['sólido'] }), lesion({ id: 'L2', tags: ['sólido'] })];
  const result = simulateTagToAttributesMigration(data, taxonomy, tagMap);
  assert.equal(result.resolverUsage.length, 1);
  assert.equal(result.resolverUsage[0].ruleId, 'resolve-solid-composition-v1');
  assert.equal(result.resolverUsage[0].timesTriggered, 2);
  assert.deepEqual(result.resolverUsage[0].lesionIds.sort(), ['L1', 'L2']);
  assert.equal(result.resolverUsage[0].resolvedConceptId, 'rad_comp_solid');
});

/* ===================== TAXO-04B3 — aplicação real das decisões TAXO-04B2 (20 pontos) =====================
 * Diferente das seções acima (fixtures sintéticas), esta seção roda o motor contra os
 * arquivos REAIS pós-aplicação (TAXONOMY.json/TAG_TO_TAXONOMY_MAP.json/
 * TAXO03_LIVE_TAG_SNAPSHOT.json) para confirmar que as decisões aprovadas na TAXO-04B2
 * (correção de "espiculada", promoção de vascular/focal/central/crônico) realmente
 * emergem do motor sem nenhuma alteração de código no resolver em si. Só leitura: não
 * toca DATA/SEED/index.html/openForm/Firestore/IndexedDB/localStorage. */

const realTaxonomy04b3 = JSON.parse(fs.readFileSync(path.resolve(REPO, 'TAXONOMY.json'), 'utf8'));
const realTagMap04b3 = JSON.parse(fs.readFileSync(path.resolve(REPO, 'TAG_TO_TAXONOMY_MAP.json'), 'utf8'));
const realSnapshot04b3 = JSON.parse(fs.readFileSync(path.resolve(REPO, 'TAXO03_LIVE_TAG_SNAPSHOT.json'), 'utf8'));
const realFixture04b3 = buildFixtureFromLiveSnapshot(realSnapshot04b3).fixture;
const realResult04b3 = simulateTagToAttributesMigration(realFixture04b3, realTaxonomy04b3, realTagMap04b3);
function realLesion04b3(id) { return realResult04b3.lesions.find(l => l.lesionId === id); }

test('1. (04B3) tag "espiculada" mapeia para rad_margin_spiculated em TAG_TO_TAXONOMY_MAP.json', () => {
  assert.deepEqual(realTagMap04b3.mappings['espiculada'].mapping.conceptIds, ['rad_margin_spiculated']);
  assert.equal(realTagMap04b3.mappings['espiculada'].mapping.status, 'mapped');
});

test('2. (04B3) nenhuma das 4 lesões com "espiculada" propõe rad_periosteal_spiculated', () => {
  ['seed_78', 'seed_510', 'seed_563', 'seed_568'].forEach(id => {
    const l = realLesion04b3(id);
    assert.ok(l, 'lesão não encontrada na fixture reconstruída: ' + id);
    const conceptIds = l.proposedAttributes.map(p => p.proposedItem.conceptId);
    assert.ok(conceptIds.includes('rad_margin_spiculated'), id + ' deveria propor rad_margin_spiculated');
    assert.ok(!conceptIds.includes('rad_periosteal_spiculated'), id + ' NUNCA deveria propor rad_periosteal_spiculated');
  });
});

test('3. (04B3) "vascular" está mapped em TAG_TO_TAXONOMY_MAP.json e todas as 20 ocorrências viram proposedAttribute', () => {
  assert.equal(realTagMap04b3.mappings['vascular'].mapping.status, 'mapped');
  const lesions = realResult04b3.lesions.filter(l => l.sourceTags.includes('vascular'));
  assert.equal(lesions.length, 20);
  lesions.forEach(l => {
    assert.ok(l.proposedAttributes.some(p => p.provenance.sourceTags.includes('vascular')), l.lesionId + ' deveria ter attribute vindo de "vascular"');
  });
});

test('4. (04B3) "focal" está mapped e todas as 4 ocorrências viram proposedAttribute', () => {
  assert.equal(realTagMap04b3.mappings['focal'].mapping.status, 'mapped');
  const lesions = realResult04b3.lesions.filter(l => l.sourceTags.includes('focal'));
  assert.equal(lesions.length, 4);
  lesions.forEach(l => assert.ok(l.proposedAttributes.some(p => p.provenance.sourceTags.includes('focal'))));
});

test('5. (04B3) "central" está mapped e todas as 3 ocorrências viram proposedAttribute', () => {
  assert.equal(realTagMap04b3.mappings['central'].mapping.status, 'mapped');
  const lesions = realResult04b3.lesions.filter(l => l.sourceTags.includes('central'));
  assert.equal(lesions.length, 3);
  lesions.forEach(l => assert.ok(l.proposedAttributes.some(p => p.provenance.sourceTags.includes('central'))));
});

test('6. (04B3) "crônico" está mapped e a única ocorrência vira proposedAttribute', () => {
  assert.equal(realTagMap04b3.mappings['crônico'].mapping.status, 'mapped');
  const lesions = realResult04b3.lesions.filter(l => l.sourceTags.includes('crônico'));
  assert.equal(lesions.length, 1);
  assert.ok(lesions[0].proposedAttributes.some(p => p.provenance.sourceTags.includes('crônico')));
});

test('7. (04B3) resolve-solid-composition-v1 continua funcionando sobre dados reais pós-correção', () => {
  const usage = realResult04b3.resolverUsage.find(r => r.ruleId === 'resolve-solid-composition-v1');
  assert.ok(usage);
  assert.ok(usage.timesTriggered >= 1);
  assert.equal(usage.resolvedConceptId, 'rad_comp_solid');
});

test('8. (04B3) os 2 antigos bloqueios de "sólido" (seed_563/seed_568) desaparecem — resolvido pela regra existente, sem nenhum ID hardcoded no motor', () => {
  // A regra em tools/taxonomy-migration-dry-run.js não foi alterada nesta rodada —
  // só o SINAL de entrada ("espiculada" corrigida). Isso prova que a melhora emerge
  // do dado, não de um hardcode seed_563/seed_568 dentro da LÓGICA do resolver (o
  // texto de "description" comenta o caso histórico, mas appliesTo/resolve — o
  // código que de fato decide — nunca referenciam lesionId nenhum).
  const resolveFn = CONTEXTUAL_RESOLVERS.find(r => r.ruleId === 'resolve-solid-composition-v1');
  assert.ok(!/seed_563|seed_568/.test(resolveFn.appliesTo.toString()));
  assert.ok(!/seed_563|seed_568/.test(resolveFn.resolve.toString()));
  const l563 = realLesion04b3('seed_563');
  const l568 = realLesion04b3('seed_568');
  assert.equal(l563.migrationStatus, 'auto-ready');
  assert.equal(l568.migrationStatus, 'auto-ready');
  assert.equal(l563.ambiguousTags.length, 0);
  assert.equal(l568.ambiguousTags.length, 0);
  assert.ok(l563.proposedAttributes.some(p => p.proposedItem.conceptId === 'rad_comp_solid'));
  assert.ok(l568.proposedAttributes.some(p => p.proposedItem.conceptId === 'rad_comp_solid'));
});

test('9. (04B3) as 5 famílias mantidas manuais continuam sem nenhum resolver (regressão)', () => {
  ['calcificações', 'hemorrágico', 'difuso', 'bilateral', 'necrótico'].forEach(tag => {
    const triggered = CONTEXTUAL_RESOLVERS.some(r => r.appliesTo(tag, ['x1', 'x2']));
    assert.equal(triggered, false, tag + ' não deveria disparar nenhum resolver');
    const occurrences = realResult04b3.lesions.filter(l => l.ambiguousTags.some(a => a.tag === tag));
    assert.ok(occurrences.length > 0, tag + ' deveria continuar aparecendo como ambiguous em dados reais');
  });
});

test('10. (04B3) lítica+esclerótica continua exclusive-group-conflict nas mesmas 7 lesões (nenhuma resolução automática para mixed)', () => {
  const conflicts = realResult04b3.issues.filter(i => i.type === 'exclusive-group-conflict');
  assert.equal(conflicts.length, 7);
  assert.equal(COMBINATION_RESOLVERS.length, 0);
  const ids = conflicts.map(c => c.lesionId).sort();
  assert.deepEqual(ids, ['seed_1088', 'seed_283', 'seed_44', 'seed_46', 'seed_560', 'seed_577', 'seed_578'].sort());
});

test('11. (04B3) provenance de attribute vindo de global mapping promovido não tem resolutionType="contextual-rule"', () => {
  const l = realLesion04b3('seed_614'); // Infarto de tronco encefálico — tags "vascular" e "focal"
  const vascularItem = l.proposedAttributes.find(p => p.provenance.sourceTags.includes('vascular'));
  assert.ok(vascularItem);
  assert.equal(vascularItem.provenance.resolutionType, 'direct');
  assert.equal(vascularItem.provenance.mappingStatus, 'mapped');
});

test('12. (04B3) resultado é determinístico (duas execuções sobre os mesmos arquivos reais produzem o mesmo resultado)', () => {
  const again = simulateTagToAttributesMigration(realFixture04b3, realTaxonomy04b3, realTagMap04b3);
  assert.deepEqual(again.summary, realResult04b3.summary);
  assert.deepEqual(again.resolverUsage, realResult04b3.resolverUsage);
});

test('13. (04B3) inputs reais (fixture/taxonomy/tagMap) permanecem imutáveis após a simulação', () => {
  const fixtureSnapshot = JSON.stringify(realFixture04b3);
  const taxonomySnapshot = JSON.stringify(realTaxonomy04b3);
  const tagMapSnapshot = JSON.stringify(realTagMap04b3);
  simulateTagToAttributesMigration(realFixture04b3, realTaxonomy04b3, realTagMap04b3);
  assert.equal(JSON.stringify(realFixture04b3), fixtureSnapshot);
  assert.equal(JSON.stringify(realTaxonomy04b3), taxonomySnapshot);
  assert.equal(JSON.stringify(realTagMap04b3), tagMapSnapshot);
});

test('14/15/16/17/18/19. (04B3) motor continua sem nenhuma persistência real / DATA / SEED / Firestore / IndexedDB / localStorage após as edições desta rodada (regressão)', () => {
  assert.ok(!/saveData\s*\(/.test(engineCodeOnly));
  assert.ok(!/storage\.(set|delete|get|list)\s*\(/.test(engineCodeOnly));
  assert.ok(!/\bwindow\.DATA\b/.test(engineCodeOnly));
  assert.ok(!/\bSEED\b/.test(engineCodeOnly));
  assert.ok(!/firestore/i.test(engineCodeOnly));
  assert.ok(!/indexedDB/i.test(engineCodeOnly));
  assert.ok(!/localStorage\./.test(engineCodeOnly));
});

test('20. (04B3) nenhuma tag real foi removida — a soma de sourceTags de cada lesão real continua igual ao conjunto original da fixture', () => {
  realFixture04b3.forEach(lesion => {
    const result = realLesion04b3(lesion.id);
    assert.deepEqual(result.sourceTags.slice().sort(), lesion.tags.slice().sort());
  });
});
