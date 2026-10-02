'use strict';

// TAXO-04B2 — testes da ADJUDICAÇÃO (TAXO04B2_RULE_ADJUDICATION.json), não
// do motor em si (coberto por tests/taxonomy-migration-dry-run.test.js).
// Esta suíte é só leitura: não toca DATA/SEED/index.html/TAXONOMY.json/
// TAG_TO_TAXONOMY_MAP.json/Firestore/IndexedDB/localStorage, e não aplica
// nenhuma das decisões "approve" registradas no documento de adjudicação —
// aplicação real é uma microetapa futura explícita, fora desta rodada.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(REPO, 'tools', 'taxonomy-migration-dry-run.js');
const ADJUDICATION_PATH = path.join(REPO, 'TAXO04B2_RULE_ADJUDICATION.json');

const engine = require(ENGINE_PATH);
const { CONTEXTUAL_RESOLVERS, COMBINATION_RESOLVERS } = engine;

const engineSrc = fs.readFileSync(ENGINE_PATH, 'utf8');
const taxonomy = JSON.parse(fs.readFileSync(path.join(REPO, 'TAXONOMY.json'), 'utf8'));
const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));
const adjudication = JSON.parse(fs.readFileSync(ADJUDICATION_PATH, 'utf8'));
const indexHtmlSrc = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'marcadores não encontrados em engineSrc: ' + startMarker + ' / ' + endMarker);
  return src.slice(start, end + endMarker.length);
}
const resolversSourceRegion = sliceBetween(
  engineSrc,
  'resolvers contextuais =====================',
  'const COMBINATION_RESOLVERS = [];'
);

/* ===================== 1. toda proposta tem decisão ===================== */

test('1. todo globalMappingProposal tem campo decision não vazio', () => {
  assert.ok(Array.isArray(adjudication.globalMappingProposals) && adjudication.globalMappingProposals.length >= 5);
  adjudication.globalMappingProposals.forEach(p => {
    assert.equal(typeof p.decision, 'string');
    assert.ok(p.decision.length > 0, 'proposta sem decision: ' + p.tag);
  });
});

test('2. todo contextualResolver adjudicado tem decision', () => {
  assert.ok(Array.isArray(adjudication.contextualResolvers) && adjudication.contextualResolvers.length >= 1);
  adjudication.contextualResolvers.forEach(r => {
    assert.equal(typeof r.decision, 'string');
    assert.ok(['approve', 'revise', 'reject'].includes(r.decision));
  });
});

test('3. manualAmbiguities têm decision "keep-manual" (nenhuma resolvida silenciosamente)', () => {
  assert.ok(Array.isArray(adjudication.manualAmbiguities) && adjudication.manualAmbiguities.length === 5);
  adjudication.manualAmbiguities.forEach(a => {
    assert.equal(a.decision, 'keep-manual');
  });
});

test('4. exclusiveGroupConflicts têm decision "manual-review-required"', () => {
  assert.ok(Array.isArray(adjudication.exclusiveGroupConflicts) && adjudication.exclusiveGroupConflicts.length === 1);
  assert.equal(adjudication.exclusiveGroupConflicts[0].decision, 'manual-review-required');
  assert.equal(adjudication.exclusiveGroupConflicts[0].lesionIds.length, 7);
});

/* ===================== 5. nenhum conceptId inexistente ===================== */

test('5. todo conceptId referenciado em globalMappingProposals existe em TAXONOMY.json', () => {
  adjudication.globalMappingProposals.forEach(p => {
    if (p.conceptId) assert.ok(conceptById.has(p.conceptId), 'conceptId inexistente: ' + p.conceptId);
    if (p.currentConceptId) assert.ok(conceptById.has(p.currentConceptId), 'currentConceptId inexistente: ' + p.currentConceptId);
    if (p.proposedConceptId) assert.ok(conceptById.has(p.proposedConceptId), 'proposedConceptId inexistente: ' + p.proposedConceptId);
  });
});

test('6. todo conceptId referenciado em mappingIssues e exclusiveGroupConflicts existe em TAXONOMY.json', () => {
  adjudication.mappingIssues.forEach(i => {
    if (i.currentConceptId) assert.ok(conceptById.has(i.currentConceptId));
    if (i.proposedConceptId) assert.ok(conceptById.has(i.proposedConceptId));
  });
  adjudication.exclusiveGroupConflicts.forEach(c => {
    c.conceptIds.forEach(cid => assert.ok(conceptById.has(cid), 'conceptId inexistente: ' + cid));
  });
});

/* ===================== 7. manualAmbiguities permanecem bloqueadas ===================== */

test('7. nenhum resolver contextual existente dispara para as 5 tags mantidas manuais', () => {
  const manualTags = adjudication.manualAmbiguities.map(a => a.tag);
  manualTags.forEach(tag => {
    const triggered = CONTEXTUAL_RESOLVERS.some(r => r.appliesTo(tag, ['algum_concept_arbitrario_1', 'algum_concept_arbitrario_2']));
    assert.equal(triggered, false, 'resolver inesperado dispararia para tag mantida manual: ' + tag);
  });
});

test('8. COMBINATION_RESOLVERS continua vazio (lítica+esclerótica permanece rejeitada)', () => {
  assert.equal(COMBINATION_RESOLVERS.length, 0);
});

/* ===================== 9. resolver sólido: sem dependência de diagnóstico ===================== */

test('9. a região de código dos resolvers contextuais não referencia nome de lesão/diagnóstico', () => {
  assert.ok(!/lesionName/.test(resolversSourceRegion));
  assert.ok(!/lesion\.name/.test(resolversSourceRegion));
});

test('10. appliesTo/resolve do resolve-solid-composition-v1 não recebem a lesão inteira como parâmetro', () => {
  const rule = CONTEXTUAL_RESOLVERS.find(r => r.ruleId === 'resolve-solid-composition-v1');
  assert.ok(rule);
  assert.equal(rule.appliesTo.length, 2); // (tag, candidateConceptIds)
  assert.equal(rule.resolve.length, 1); // (ctx) — ctx não contém a lesão, só candidatos/conceptById/groupById
});

/* ===================== 11. resolver possui fallback seguro ===================== */

test('11. resolve-solid-composition-v1 recusa (fallback) quando há contexto ósseo real', () => {
  const rule = CONTEXTUAL_RESOLVERS.find(r => r.ruleId === 'resolve-solid-composition-v1');
  const boneConcept = { id: 'rad_bonedensity_lytic', group: 'radiologic.boneDensity' };
  const ctx = {
    rawCandidatesByConceptId: new Map([['rad_bonedensity_lytic', {}]]),
    conceptById: new Map([['rad_bonedensity_lytic', boneConcept]]),
    groupById: new Map()
  };
  const outcome = rule.resolve(ctx);
  assert.equal(outcome.resolved, false);
  assert.equal(typeof outcome.reason, 'string');
});

test('12. resolve-solid-composition-v1 resolve quando não há nenhum contexto ósseo/periosteal', () => {
  const rule = CONTEXTUAL_RESOLVERS.find(r => r.ruleId === 'resolve-solid-composition-v1');
  const ctx = {
    rawCandidatesByConceptId: new Map([['etio_vascular', {}]]),
    conceptById: new Map([['etio_vascular', { id: 'etio_vascular', group: 'etiology.primary' }]]),
    groupById: new Map()
  };
  const outcome = rule.resolve(ctx);
  assert.equal(outcome.resolved, true);
  assert.equal(outcome.conceptId, 'rad_comp_solid');
});

/* ===================== 13. auditoria de "espiculada" ===================== */

test('13. mappingIssues contém a auditoria de "espiculada" com concepts corretos', () => {
  const issue = adjudication.mappingIssues.find(i => i.tag === 'espiculada');
  assert.ok(issue, 'auditoria de espiculada ausente');
  assert.equal(issue.currentConceptId, 'rad_periosteal_spiculated');
  assert.equal(issue.proposedConceptId, 'rad_margin_spiculated');
  const current = conceptById.get('rad_periosteal_spiculated');
  const proposed = conceptById.get('rad_margin_spiculated');
  assert.equal(current.group, 'radiologic.periostealReaction');
  assert.equal(proposed.group, 'radiologic.margins');
});

test('14. globalMappingProposals contém a correção de "espiculada" como kind "correction"', () => {
  const p = adjudication.globalMappingProposals.find(p => p.tag === 'espiculada');
  assert.ok(p);
  assert.equal(p.kind, 'correction');
  assert.equal(p.currentConceptId, 'rad_periosteal_spiculated');
  assert.equal(p.proposedConceptId, 'rad_margin_spiculated');
});

/* ===================== 15. global mapping proposals auditados ===================== */

test('15. cada globalMappingProposal tem usages numérico e reason não vazio', () => {
  adjudication.globalMappingProposals.forEach(p => {
    assert.equal(typeof p.usages, 'number');
    assert.ok(p.usages >= 1);
    assert.equal(typeof p.reason, 'string');
    assert.ok(p.reason.length > 10);
  });
});

test('16. proposta de "crônico" registra confiança baixa por N=1, mesmo aprovada', () => {
  const p = adjudication.globalMappingProposals.find(p => p.tag === 'crônico');
  assert.ok(p);
  assert.equal(p.decision, 'approve');
  assert.equal(p.usages, 1);
  assert.match(p.confidence, /baixa|low/i);
});

/* ===================== 17. zero alteração em DATA/persistência ===================== */

test('18. tools/taxonomy-migration-dry-run.js continua sem persistência real (regressão)', () => {
  const stripped = engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
  assert.ok(!/saveData\s*\(/.test(stripped));
  assert.ok(!/localStorage\./.test(stripped));
  assert.ok(!/window\.DATA/.test(stripped));
});

/* ===================== 19. TAXONOMY.json intocado ===================== */

test('19. TAXONOMY.json permanece com 38 groups / 207 concepts / v1.1 aprovada (nenhuma alteração nesta rodada)', () => {
  assert.equal(taxonomy.groups.length, 38);
  assert.equal(taxonomy.concepts.length, 207);
  assert.equal(taxonomy.metadata.taxonomyVersion, 2);
  assert.equal(taxonomy.metadata.releaseLabel, '1.1');
  assert.equal(taxonomy.metadata.status, 'approved');
});

/* ===================== 20. index.html intocado ===================== */

test('20. index.html não referencia nenhum artefato desta rodada (TAXO-04B2)', () => {
  assert.ok(!indexHtmlSrc.includes('TAXO04B2'));
  assert.ok(!indexHtmlSrc.includes('RULE_ADJUDICATION'));
  assert.ok(!indexHtmlSrc.includes('resolve-solid-composition-v1'));
});

/* ===================== extra: metadata do documento de adjudicação ===================== */

test('extra — metadata.status da adjudicação é "proposal" (decisões ainda não aplicadas)', () => {
  assert.equal(adjudication.metadata.status, 'proposal');
  assert.equal(adjudication.metadata.taxonomyVersion, 2);
  assert.equal(adjudication.metadata.taxonomyReleaseLabel, '1.1');
});

test('extra — resolve-solid-composition-v1 adjudicado referencia as 2 lesões remanescentes corretas', () => {
  const r = adjudication.contextualResolvers.find(r => r.ruleId === 'resolve-solid-composition-v1');
  assert.deepEqual(r.remainingLesionIds.slice().sort(), ['seed_563', 'seed_568']);
  assert.equal(r.resolvedCount + r.remainingCount, r.affectedCount);
});
