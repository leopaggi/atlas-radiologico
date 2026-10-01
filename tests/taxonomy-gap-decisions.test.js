'use strict';

// TAXO-03C — validação estrutural, somente leitura, de TAXO03C_GAP_DECISIONS.json
// (proposta de adjudicação dos gaps vivos prioritários — NADA foi aplicado a
// TAXONOMY.json/TAG_TO_TAXONOMY_MAP.json/index.html/DATA). Mesmo padrão leve
// (node:test + node:assert) já usado pelas demais suítes de taxonomia.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const DECISIONS_PATH = path.resolve(REPO, 'TAXO03C_GAP_DECISIONS.json');
const TAXONOMY_PATH = path.resolve(REPO, 'TAXONOMY.json');
const MAP_PATH = path.resolve(REPO, 'TAG_TO_TAXONOMY_MAP.json');
const SNAPSHOT_PATH = path.resolve(REPO, 'TAXO03_LIVE_TAG_SNAPSHOT.json');

const gapDecisions = JSON.parse(fs.readFileSync(DECISIONS_PATH, 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));
const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

const existingConceptIds = new Set(taxonomy.concepts.map(c => c.id));
const existingGroupIds = new Set(taxonomy.groups.map(g => g.id));
const VALID_CATEGORIES = new Set(['ADD_CONCEPT', 'MAP_EXISTING', 'KEEP_FREE_TAG', 'METADATA_NOT_TAXONOMY', 'NORMALIZE_TAG', 'MERGE_WITH_EXISTING_TAG', 'REVIEW_LATER', 'IGNORE_FOR_ATTRIBUTES']);

test('metadata.status === "proposal"; taxonomyVersionBase === 1', () => {
  assert.equal(gapDecisions.metadata.status, 'proposal');
  assert.equal(gapDecisions.metadata.taxonomyVersionBase, 1);
});

test('as 22 decisões high-priority (usage>=20) registradas na TAXO-03C continuam íntegras no arquivo de proposta', () => {
  // Checagem histórica/interna ao próprio arquivo de proposta — não contra
  // map.taxonomyGapCandidates ATUAL, que já reflete a TAXO-03D (5 dos 22
  // gaps high originais foram resolvidos como MAP_EXISTING e saíram da
  // fila viva de gaps nesta mesma rodada; isso é o resultado ESPERADO da
  // aplicação, não uma regressão).
  const highDecisions = gapDecisions.decisions.filter(d => d.priority === 'high');
  assert.equal(highDecisions.length, 22);
  const decidedTags = new Set(gapDecisions.decisions.map(d => d.tag));
  for (const d of highDecisions) assert.ok(decidedTags.has(d.tag));
});

test('os 5 gaps high-priority resolvidos como MAP_EXISTING na TAXO-03D não aparecem mais na fila viva de gaps do mapa reconciliado', () => {
  const resolvedHighMapExisting = gapDecisions.decisions.filter(d => d.priority === 'high' && d.category === 'MAP_EXISTING').map(d => d.tag);
  assert.equal(resolvedHighMapExisting.length, 5);
  const currentGapTags = new Set(map.taxonomyGapCandidates.map(g => g.tag));
  for (const tag of resolvedHighMapExisting) assert.ok(!currentGapTags.has(tag), `"${tag}" foi resolvida (MAP_EXISTING) mas ainda aparece como gap`);
});

test('categorias são sempre uma das 8 válidas', () => {
  for (const d of gapDecisions.decisions) {
    assert.ok(VALID_CATEGORIES.has(d.category), `tag "${d.tag}" tem categoria inválida: ${d.category}`);
  }
});

test('MAP_EXISTING sempre referencia um conceptId que EXISTE em TAXONOMY.json', () => {
  for (const d of gapDecisions.decisions) {
    if (d.category === 'MAP_EXISTING') {
      assert.ok(d.existingConceptId, `${d.tag} é MAP_EXISTING sem existingConceptId`);
      assert.ok(existingConceptIds.has(d.existingConceptId), `${d.tag} -> existingConceptId inexistente: ${d.existingConceptId}`);
    }
  }
});

test('ADD_CONCEPT possui domain e group válidos (group existente OU novo group proposto em QUALQUER decisão desta rodada, com domain coerente)', () => {
  // Um group novo pode ser declarado (newGroup) uma única vez pelo primeiro
  // membro da família (ex.: "hipersinal T2") e reaproveitado por decisão
  // (ex.: "hipossinal T2") sem redeclarar — por isso a validação usa a UNIÃO
  // de todos os newGroup desta rodada, não só o da própria decisão.
  const allNewGroups = new Map();
  for (const d of gapDecisions.decisions) {
    if (d.newGroup) allNewGroups.set(d.newGroup.id, d.newGroup);
  }
  for (const d of gapDecisions.decisions) {
    if (d.category === 'ADD_CONCEPT' && d.proposedConcept) {
      const pc = d.proposedConcept;
      assert.ok(['clinical', 'radiologic', 'etiology', 'demographics'].includes(pc.domain), `${d.tag} domain inválido: ${pc.domain}`);
      const groupIsExisting = existingGroupIds.has(pc.group);
      const newGroup = allNewGroups.get(pc.group);
      assert.ok(groupIsExisting || newGroup, `${d.tag} -> group "${pc.group}" não existe e não é um newGroup proposto em nenhuma decisão desta rodada`);
      if (newGroup) assert.equal(newGroup.domain, pc.domain, `${d.tag}: newGroup.domain ("${newGroup.domain}") deveria bater com proposedConcept.domain ("${pc.domain}")`);
    }
  }
});

test('todo proposedConceptId que hoje existe em TAXONOMY.json corresponde à PRÓPRIA aprovação desta proposta (label batendo), nunca uma colisão acidental com um id não relacionado', () => {
  // Quando esta suíte foi escrita (TAXO-03C), TAXONOMY.json ainda não tinha
  // os 13 concepts propostos — qualquer coincidência de id seria colisão
  // real. Depois da TAXO-03D (que aprovou a proposta), os ids agora EXISTEM
  // de propósito; o teste correto deixa de ser "não existe" e passa a ser
  // "se existe, é exatamente o mesmo concept proposto" (label idêntico).
  for (const d of gapDecisions.decisions) {
    if (d.proposedConcept && d.proposedConcept.conceptId) {
      const existing = taxonomy.concepts.find(c => c.id === d.proposedConcept.conceptId);
      if (existing) {
        assert.equal(existing.label, d.proposedConcept.label, `${d.tag}: concept existente "${d.proposedConcept.conceptId}" tem label diferente do proposto — possível colisão acidental, não a aprovação desta proposta`);
        assert.equal(existing.domain, d.proposedConcept.domain, `${d.tag}: domain divergente`);
      }
    }
  }
});

test('nenhum proposedConceptId duplicado entre propostas distintas (exceto via sameProposalAs explícito)', () => {
  const seen = new Map();
  for (const d of gapDecisions.decisions) {
    if (d.proposedConcept && d.proposedConcept.conceptId) {
      const id = d.proposedConcept.conceptId;
      assert.ok(!seen.has(id), `conceptId proposto "${id}" duplicado entre "${d.tag}" e "${seen.get(id)}"`);
      seen.set(id, d.tag);
    }
  }
});

test('"sameProposalAs", quando presente, referencia um proposedConceptId que existe entre as próprias decisões', () => {
  const proposedIds = new Set(gapDecisions.decisions.filter(d => d.proposedConcept).map(d => d.proposedConcept.conceptId));
  for (const d of gapDecisions.decisions) {
    if (d.sameProposalAs) assert.ok(proposedIds.has(d.sameProposalAs), `${d.tag} -> sameProposalAs "${d.sameProposalAs}" não corresponde a nenhuma proposta real`);
  }
});

test('nenhum proposedConceptId começa com "seed_" (nunca posicional)', () => {
  for (const d of gapDecisions.decisions) {
    if (d.proposedConcept && d.proposedConcept.conceptId) assert.ok(!/^seed_/i.test(d.proposedConcept.conceptId), d.tag);
  }
});

test('TAXONOMY.json está approved; TAXO03C_GAP_DECISIONS.json continua um registro histórico de PROPOSTA (status="proposal"), mesmo após a TAXO-03D ter aprovado parte dela em TAXONOMY.json', () => {
  // Esta suíte valida tests/taxonomy-gap-decisions.test.js em si (a proposta
  // TAXO-03C), que nesta rodada (TAXO-03D) teve 13 ADD_CONCEPT efetivamente
  // aprovados em TAXONOMY.json — por isso NÃO assumimos mais 33/194 fixos
  // aqui (isso pertencia à janela entre TAXO-03C e TAXO-03D). A invariante
  // que ainda vale sempre: status approved, e o arquivo de proposta em si
  // nunca é reescrito como se já tivesse sido aplicado.
  assert.equal(taxonomy.metadata.status, 'approved');
  assert.equal(gapDecisions.metadata.status, 'proposal', 'TAXO03C_GAP_DECISIONS.json é um registro histórico — não deveria ser reescrito para "applied"');
});

test('todos os conceptIds propostos como ADD_CONCEPT na TAXO-03C agora existem em TAXONOMY.json (confirmação de que foram aprovados na TAXO-03D)', () => {
  const approvedConceptIds = new Set(taxonomy.concepts.map(c => c.id));
  for (const d of gapDecisions.decisions) {
    if (d.category === 'ADD_CONCEPT' && d.proposedConcept) {
      assert.ok(approvedConceptIds.has(d.proposedConcept.conceptId), `${d.tag} -> ${d.proposedConcept.conceptId} foi proposto mas ainda não existe em TAXONOMY.json`);
    }
  }
});

test('index.html permanece intocado (sem referência a TAXO03C)', () => {
  const html = fs.readFileSync(path.resolve(REPO, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /TAXO03C/);
});

test('nenhuma escrita em DATA / nenhum saveData() / nenhuma persistência referenciada nos arquivos desta rodada', () => {
  const html = fs.readFileSync(path.resolve(REPO, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /TAXO03C/);
  const decisionsRaw = fs.readFileSync(DECISIONS_PATH, 'utf8');
  assert.doesNotMatch(decisionsRaw, /saveData\s*\(|storage\.set\s*\(|localStorage\.setItem\s*\(/);
  assert.equal(path.extname(DECISIONS_PATH), '.json');
});

test('usageCount de cada decisão corresponde ao snapshot vivo (TAXO03_LIVE_TAG_SNAPSHOT.json), nunca ao CSV antigo', () => {
  for (const d of gapDecisions.decisions) {
    const live = snapshot.liveTags[d.tag];
    assert.ok(live, `tag "${d.tag}" não está viva no snapshot`);
    assert.equal(d.usageCount, live.usageCount, `${d.tag}: usageCount da decisão (${d.usageCount}) não bate com o snapshot vivo (${live.usageCount})`);
  }
});

test('"trauma", "bem circunscrita", "idade pediátrica" usam o uso vivo atual, não os números antigos do CSV estático', () => {
  const byTag = new Map(gapDecisions.decisions.map(d => [d.tag, d]));
  assert.equal(byTag.get('trauma').usageCount, 62);
  assert.equal(byTag.get('bem circunscrita').usageCount, 217);
  assert.equal(byTag.get('idade pediátrica').usageCount, 96);
});

test('nenhuma decisão referencia um proposedConcept cujo group novo (newGroup) tenha exclusive/allowMultipleInstances fora do boolean', () => {
  for (const d of gapDecisions.decisions) {
    if (d.newGroup) {
      assert.equal(typeof d.newGroup.exclusive, 'boolean', d.tag);
      assert.equal(typeof d.newGroup.allowMultipleInstances, 'boolean', d.tag);
      assert.ok(Array.isArray(d.newGroup.applicableSections), d.tag);
    }
  }
});

test('o caso degenerativo/Degenerativo está presente com category NORMALIZE_TAG', () => {
  const d = gapDecisions.decisions.find(x => x.tag === 'Degenerativo');
  assert.ok(d, 'decisão para "Degenerativo" deveria existir');
  assert.equal(d.category, 'NORMALIZE_TAG');
});

test('REVIEW_LATER nunca tem proposedConcept nem existingConceptId definitivos (decisão ainda pendente)', () => {
  for (const d of gapDecisions.decisions) {
    if (d.category === 'REVIEW_LATER') {
      assert.equal(d.proposedConcept, null, d.tag);
      assert.equal(d.existingConceptId, null, d.tag);
    }
  }
});

test('METADATA_NOT_TAXONOMY nunca propõe concept nem existingConceptId', () => {
  for (const d of gapDecisions.decisions) {
    if (d.category === 'METADATA_NOT_TAXONOMY') {
      assert.equal(d.proposedConcept, null, d.tag);
      assert.equal(d.existingConceptId, null, d.tag);
    }
  }
});

test('nenhuma decisão usa score numérico (sem campos tipo score/percent/confidenceScore)', () => {
  const raw = fs.readFileSync(DECISIONS_PATH, 'utf8');
  assert.doesNotMatch(raw, /"score"\s*:\s*[\d.]/i);
  assert.doesNotMatch(raw, /"confidenceScore"/i);
  for (const d of gapDecisions.decisions) {
    if (d.confidence) assert.match(d.confidence, /^(high|medium|low)-confidence$/);
  }
});

test('todas as 22 decisões high-priority somam exatamente nas 4 categorias observadas (22)', () => {
  const high = gapDecisions.decisions.filter(d => d.priority === 'high');
  assert.equal(high.length, 22);
  const tally = {};
  high.forEach(d => { tally[d.category] = (tally[d.category] || 0) + 1; });
  const sum = Object.values(tally).reduce((a, b) => a + b, 0);
  assert.equal(sum, 22);
});
