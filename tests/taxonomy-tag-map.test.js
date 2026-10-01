'use strict';

// TAXO-03B (revisão 2) — validação estrutural, somente leitura, do
// TAG_TO_TAXONOMY_MAP.json reconciliado com TAXO03_LIVE_TAG_SNAPSHOT.json.
// Schema: cada entrada de `mappings` é { tag, catalogState, isLiveOnly,
// decisionState, decision, originFromAuditEditTarget,
// originFromAuditAdditionalTag, mapping: { status, conceptIds, candidates?,
// confidence, notes, source } } — catalogState/decisionState NUNCA reusam os
// valores de mapping.status (eixos distintos, por instrução explícita).
// Não toca index.html, DATA, SEED, Firestore, IndexedDB nem localStorage.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const MAP_PATH = path.resolve(REPO, 'TAG_TO_TAXONOMY_MAP.json');
const TAXONOMY_PATH = path.resolve(REPO, 'TAXONOMY.json');
const SNAPSHOT_PATH = path.resolve(REPO, 'TAXO03_LIVE_TAG_SNAPSHOT.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));

function allConceptIdsIn(m) {
  const ids = [];
  (m.conceptIds || []).forEach(id => ids.push(id));
  (m.candidates || []).forEach(c => ids.push(c.conceptId));
  return ids;
}

/* ===================== 1-24: pontos explicitamente pedidos ===================== */

test('1. snapshot metadata válido (readOnly, source published-runtime)', () => {
  assert.equal(snapshot.metadata.readOnly, true);
  assert.equal(snapshot.metadata.source, 'published-runtime');
});

test('2. dataTotalLesions === 1208 (propagado ao metadata do mapa)', () => {
  assert.equal(snapshot.metadata.dataTotalLesions, 1208);
  assert.equal(map.metadata.dataTotalLesions, 1208);
});

test('3. liveTagCount === 695', () => {
  assert.equal(map.metadata.liveTagCount, 695);
  assert.equal(Object.keys(snapshot.liveTags).length, 695);
});

test('4. archivedTags === 23 (igual a historicalMappings)', () => {
  assert.equal(snapshot.archivedTags.length, 23);
  assert.equal(Object.keys(map.historicalMappings).length, 23);
});

test('5. edit aplicada vira historical-edited', () => {
  const editApplied = snapshot.archivedTags.filter(a => a.type === 'edited-applied');
  assert.equal(editApplied.length, 10);
  for (const a of editApplied) {
    assert.equal(map.historicalMappings[a.tag].catalogState, 'historical-edited');
    assert.ok(!(a.tag in map.mappings), `${a.tag} não deveria estar na fila viva`);
  }
});

test('6. edit NÃO aplicada nunca vira historical', () => {
  for (const [tag, d] of Object.entries(snapshot.auditDecisions)) {
    if (d.decision === 'edit' && !d.appliedAt) {
      assert.ok(!(tag in map.historicalMappings), `${tag} tem edit não aplicada mas foi marcada historical`);
    }
  }
  // nesta rodada não há nenhum edit não aplicado (0), mas a regra fica coberta estruturalmente.
});

test('7. eliminate aplicada vira historical-eliminated', () => {
  const elimApplied = snapshot.archivedTags.filter(a => a.type === 'eliminated-applied');
  assert.equal(elimApplied.length, 13);
  for (const a of elimApplied) {
    assert.equal(map.historicalMappings[a.tag].catalogState, 'historical-eliminated');
  }
});

test('8. eliminate NÃO aplicada nunca vira historical (há 4 nesta rodada)', () => {
  const elimUnapplied = Object.entries(snapshot.auditDecisions).filter(([, d]) => d.decision === 'eliminate' && !d.appliedAt);
  assert.equal(elimUnapplied.length, 4);
  for (const [tag] of elimUnapplied) {
    assert.ok(!(tag in map.historicalMappings), `${tag} tem eliminate não aplicada mas foi marcada historical`);
  }
});

test('9. liveOnly (55) estão incorporadas em mappings com isLiveOnly=true', () => {
  const liveOnlyEntries = Object.values(map.mappings).filter(e => e.isLiveOnly);
  assert.equal(liveOnlyEntries.length, 55);
});

test('10. offlineOnly sem decisão vira stale-unknown (nesta rodada: 0 — todas as offlineOnly têm decisão)', () => {
  const staleUnknown = Object.values(map.staleOrUnappliedTags).filter(s => s.catalogState === 'stale-unknown');
  assert.equal(staleUnknown.length, 0);
  assert.equal(Object.keys(map.staleOrUnappliedTags).length, 3);
  for (const s of Object.values(map.staleOrUnappliedTags)) assert.equal(s.catalogState, 'decision-unapplied');
});

test('11. tags historical ficam fora de confirmedConceptCoverage/potentialConceptCoverage', () => {
  const confirmedSet = new Set(map.coverage.confirmedConceptCoverage);
  const potentialSet = new Set(map.coverage.potentialConceptCoverage);
  const assimetricoHist = map.historicalMappings['assimétrico'];
  assert.ok(assimetricoHist);
  for (const id of (assimetricoHist.originalMapping.candidates || []).map(c => c.conceptId)) {
    const stillLive = Object.values(map.mappings).some(e => allConceptIdsIn(e.mapping).includes(id));
    if (!stillLive) {
      assert.ok(!confirmedSet.has(id) && !potentialSet.has(id), `${id} só vinha de tag histórica mas está na cobertura viva`);
      assert.ok(map.coverage.historicalConceptCoverage.includes(id), `${id} deveria estar em historicalConceptCoverage`);
    }
  }
});

test('12. mapped vivo entra em confirmedConceptCoverage', () => {
  const confirmedSet = new Set(map.coverage.confirmedConceptCoverage);
  for (const e of Object.values(map.mappings)) {
    if (e.mapping.status === 'mapped') {
      for (const id of e.mapping.conceptIds) assert.ok(confirmedSet.has(id), `${e.tag} -> ${id} deveria estar em confirmedConceptCoverage`);
    }
  }
});

test('13. ambiguous vivo entra só em potentialConceptCoverage (não necessariamente em confirmed)', () => {
  const potentialSet = new Set(map.coverage.potentialConceptCoverage);
  for (const e of Object.values(map.mappings)) {
    if (e.mapping.status === 'ambiguous') {
      for (const c of e.mapping.candidates) assert.ok(potentialSet.has(c.conceptId), `${e.tag} -> ${c.conceptId} deveria estar em potentialConceptCoverage`);
    }
  }
});

test('14. review vivo entra só em potentialConceptCoverage', () => {
  const potentialSet = new Set(map.coverage.potentialConceptCoverage);
  for (const e of Object.values(map.mappings)) {
    if (e.mapping.status === 'review') {
      for (const id of e.mapping.conceptIds) assert.ok(potentialSet.has(id), `${e.tag} -> ${id} deveria estar em potentialConceptCoverage`);
    }
  }
});

test('15. todo conceptId referenciado (mappings e historicalMappings) existe em TAXONOMY.json', () => {
  for (const [tag, e] of Object.entries(map.mappings)) {
    for (const id of allConceptIdsIn(e.mapping)) assert.ok(conceptById.has(id), `${tag} -> conceptId inexistente: ${id}`);
  }
  for (const [tag, h] of Object.entries(map.historicalMappings)) {
    for (const id of allConceptIdsIn(h.originalMapping)) assert.ok(conceptById.has(id), `historical ${tag} -> conceptId inexistente: ${id}`);
  }
});

test('16. nenhuma referência a conceptId em formato seed_N (posicional)', () => {
  for (const e of Object.values(map.mappings)) {
    for (const id of allConceptIdsIn(e.mapping)) assert.ok(!/^seed_/i.test(id));
  }
});

test('17. TAXONOMY.json está approved (baseline atual: v1.1/TAXO-03D, 38 groups / 207 concepts)', () => {
  // Esta suíte valida a reconciliação TAXO-03B, que não deveria por si só
  // alterar TAXONOMY.json. A baseline NUMÉRICA abaixo reflete a v1.1
  // (TAXO-03D, aprovada depois da TAXO-03B) — a invariante real que este
  // teste protege é "status continua approved", não um número fixo de
  // groups/concepts por tempo indeterminado.
  assert.equal(taxonomy.metadata.status, 'approved');
  assert.equal(taxonomy.groups.length, 38);
  assert.equal(taxonomy.concepts.length, 207);
});

test('18. index.html permanece intocado nesta fase', () => {
  const html = fs.readFileSync(path.resolve(REPO, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /TAG_TO_TAXONOMY_MAP/);
  assert.doesNotMatch(html, /TAXO03_LIVE_TAG_SNAPSHOT/);
  assert.doesNotMatch(html, /TAXO03_RECONCILIATION_REPORT/);
});

test('19. nenhuma escrita em DATA é feita por este processo (nenhuma referência ao mapa/relatório em index.html)', () => {
  const html = fs.readFileSync(path.resolve(REPO, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /TAG_TO_TAXONOMY_MAP/);
});

test('20. nenhum saveData() referenciado nos arquivos de saída desta reconciliação', () => {
  const mapRaw = fs.readFileSync(MAP_PATH, 'utf8');
  const reportRaw = fs.readFileSync(path.resolve(REPO, 'TAXO03_RECONCILIATION_REPORT.md'), 'utf8');
  assert.doesNotMatch(mapRaw, /saveData\s*\(/);
  assert.doesNotMatch(reportRaw, /saveData\s*\(/);
});

test('21. nenhuma persistência Firestore/IndexedDB/localStorage é chamada (arquivos de saída são dados estáticos)', () => {
  const mapRaw = fs.readFileSync(MAP_PATH, 'utf8');
  assert.doesNotMatch(mapRaw, /storage\.set\s*\(|storage\.delete\s*\(|localStorage\.setItem\s*\(|localStorage\.removeItem\s*\(/);
  assert.equal(path.extname(MAP_PATH), '.json');
});

test('22. taxonomyGapCandidates são derivados só de tags vivas (status unmapped), nunca historical/offline-only', () => {
  for (const g of map.taxonomyGapCandidates) {
    const e = map.mappings[g.tag];
    assert.ok(e, `gap "${g.tag}" deveria existir em mappings (vivo)`);
    assert.equal(e.mapping.status, 'unmapped');
    assert.ok(!(g.tag in map.historicalMappings));
    assert.ok(!(g.tag in map.staleOrUnappliedTags));
  }
});

test('23. caseVariantCandidates não altera nenhuma tag (só diagnóstico) e reflete grupos reais', () => {
  assert.ok(Array.isArray(map.reconciliationDiagnostics.caseVariantCandidates));
  assert.ok(map.reconciliationDiagnostics.caseVariantCandidates.length >= 1);
  const group = map.reconciliationDiagnostics.caseVariantCandidates.find(g => g.values.includes('degenerativo') && g.values.includes('Degenerativo'));
  assert.ok(group, 'grupo degenerativo/Degenerativo deveria estar presente');
  assert.equal(group.values.length, group.usages.length);
  // nenhuma das duas formas foi removida/mesclada do mapa viva:
  assert.ok('degenerativo' in map.mappings);
  assert.ok('Degenerativo' in map.mappings);
});

test('24. historicalMappings preserva o audit trail completo (tag, type, target, additionalTags, decidedAt, appliedAt, appliedCount)', () => {
  for (const [tag, h] of Object.entries(map.historicalMappings)) {
    assert.ok(['historical-edited', 'historical-eliminated', 'historical-other'].includes(h.catalogState), tag);
    assert.ok('target' in h && 'additionalTags' in h && 'decidedAt' in h && 'appliedAt' in h && 'appliedCount' in h, tag);
    assert.ok(h.appliedAt, `${tag} em historicalMappings deveria ter appliedAt`);
  }
});

/* ===================== Verificações extras (qualidade/consistência) ===================== */

test('extra — universo bate exatamente (664/695/640/55/24)', () => {
  const s = map.metadata.reconciliationSummary;
  assert.equal(s.offlineOriginal, 664);
  assert.equal(s.liveAtual, 695);
  assert.equal(s.liveAndKnown, 640);
  assert.equal(s.liveOnly, 55);
  assert.equal(s.offlineOnly, 24);
});

test('extra — "appliedAt manda": nenhuma eliminação aplicada tem usage atual > 0 (critical review = 0 nesta rodada)', () => {
  for (const audit of map.reconciliationDiagnostics.eliminatesAudit) {
    assert.equal(audit.criticalReview, false, JSON.stringify(audit));
  }
});

test('extra — editsAudit cobre os 10 edits aplicados e identifica a inconsistência real (aterosclerótico)', () => {
  assert.equal(map.reconciliationDiagnostics.editsAudit.length, 10);
  const consistent = map.reconciliationDiagnostics.editsAudit.filter(a => a.consistent);
  assert.equal(consistent.length, 9);
  const inconsistent = map.reconciliationDiagnostics.editsAudit.find(a => !a.consistent);
  assert.equal(inconsistent.tag, 'aterosclerótico');
});

test('extra — catalogState nunca reusa valores de mapping.status', () => {
  const FORBIDDEN = new Set(['mapped', 'ambiguous', 'review', 'unmapped', 'ignored']);
  for (const e of Object.values(map.mappings)) assert.ok(!FORBIDDEN.has(e.catalogState), `${e.tag} tem catalogState="${e.catalogState}" igual a um valor de mapping.status`);
  for (const h of Object.values(map.historicalMappings)) assert.ok(!FORBIDDEN.has(h.catalogState), h.catalogState);
});

test('extra — decision=review vira catalogState="review-human" (6 ocorrências)', () => {
  const reviewHuman = Object.values(map.mappings).filter(e => e.catalogState === 'review-human');
  assert.equal(reviewHuman.length, 6);
  for (const e of reviewHuman) assert.equal(e.decision.decision, 'review');
});

test('extra — "trauma" usa o usageCount VIVO do snapshot (62), não a frequência antiga do CSV', () => {
  assert.equal(map.mappings['trauma'].mapping.source.usageCount, 62);
  assert.equal(map.mappings['trauma'].mapping.source.usageCount, snapshot.liveTags['trauma'].usageCount);
});

test('extra — TAXO03_RECONCILIATION_REPORT.md existe e contém as seções pedidas (A-J)', () => {
  const report = fs.readFileSync(path.resolve(REPO, 'TAXO03_RECONCILIATION_REPORT.md'), 'utf8');
  ['## A. Universo', '## B. Decisões reais', '## C. Mapeamento vivo', '## D. Cobertura', '## E. Gaps',
   '## F. Top 30', '## G. Edits aplicados', '## H. Eliminates aplicados', '## I. `caseVariantCandidates`', '## J.']
    .forEach(h => assert.ok(report.includes(h), `seção ausente no relatório: ${h}`));
});
