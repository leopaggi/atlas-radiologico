'use strict';

// TAXO-04C2 — PLANEJAMENTO puro do apply real de attributes. Transforma o
// resultado de um dry-run (tools/taxonomy-migration-dry-run.js) num PLANO
// de mutações EM MEMÓRIA — nunca grava nada, nunca lê globais.
//
// Três fases deliberadamente separadas (nenhuma delas implementada alem da
// primeira nesta rodada):
//   PLANEJAMENTO   — este módulo. Decide QUEM é elegível e QUAIS itens
//                    entrariam em attributes.items[], com itemId placeholder.
//   MATERIALIZAÇÃO — função futura (NÃO existe ainda) que trocaria os
//                    itemId placeholder por IDs reais (padrão já usado no
//                    resto do Atlas: 'attr_' + Date.now().toString(36) +
//                    '_' + Math.random().toString(36).slice(2,8)) só no
//                    instante da escrita real — nunca durante o
//                    planejamento, para o plano continuar determinístico.
//   PERSISTÊNCIA   — função futura (NÃO existe ainda) que chamaria
//                    saveData()/pushToFirebaseNow() do Atlas. Fora do
//                    escopo desta rodada por completo.
//
// Este arquivo NUNCA referencia DATA/SEED/window/document/localStorage/
// IndexedDB/Firestore/saveData — só recebe `data`/`migrationResult`/
// `taxonomy` como parâmetros explícitos (mesmo padrão do motor de dry-run).

const crypto = require('crypto');

function computeDataSha256(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// itemId de PLANEJAMENTO — deliberadamente distinto de dryRunItemId
// ('attr_dryrun_...', usado só no dry-run) e do padrão real de produção
// ('attr_' + Date.now().toString(36) + '_' + Math.random()...). Nunca deve
// ser escrito em DATA real — só serve para o humano revisar o plano.
function plannedItemId(lesionId, conceptId) {
  return 'attr_planned_' + String(lesionId) + '_' + conceptId;
}

function isGroupExclusive(group) {
  return !!(group && group.exclusive === true);
}
function groupAllowsMultiple(group) {
  return !!(group && group.allowMultipleInstances === true);
}

// Itens ATIVOS (sem deletedAt) de attributes.items[] já existentes na
// lesão, agrupados por conceptId. Um item com deletedAt NUNCA bloqueia
// reinserção — exclusão deliberada de um clínico não deve "ressuscitar"
// silenciosamente por causa da migração.
function activeExistingItemsByConcept(rawLesion) {
  const map = new Map();
  const items = (rawLesion && rawLesion.attributes && Array.isArray(rawLesion.attributes.items)) ? rawLesion.attributes.items : [];
  items.forEach(item => {
    if (!item || item.deletedAt) return;
    if (!map.has(item.conceptId)) map.set(item.conceptId, []);
    map.get(item.conceptId).push(item);
  });
  return map;
}

function findRawLesion(data, lesionId) {
  const matches = data.filter(d => d && d.id === lesionId);
  if (matches.length !== 1) return { ok: false, count: matches.length };
  return { ok: true, lesion: matches[0] };
}

// Revalida, de forma DEFENSIVA, um resultado de dry-run já marcado
// "auto-ready" — nunca confia cegamente no upstream. Qualquer falha aqui
// é um bug grave do motor (nunca esperado no estado atual aprovado), mas o
// mecanismo precisa existir e ser testável.
function evaluateLesionEligibility(migrationLesion, data, conceptById, groupById) {
  const reasons = [];

  if (!migrationLesion.lesionId) reasons.push('lesionId ausente');

  const rawLookup = findRawLesion(data, migrationLesion.lesionId);
  if (!rawLookup.ok) {
    reasons.push(rawLookup.count === 0 ? 'lesão não encontrada em data' : 'lesão duplicada em data (' + rawLookup.count + ' ocorrências)');
  }

  if (Array.isArray(migrationLesion.conflicts) && migrationLesion.conflicts.length > 0) {
    reasons.push('possui conflicts (invalid-mapping/exclusive-group-conflict/concept-conflict)');
  }
  if (Array.isArray(migrationLesion.ambiguousTags) && migrationLesion.ambiguousTags.length > 0) {
    reasons.push('possui ambiguousTags pendentes');
  }
  if (Array.isArray(migrationLesion.reviewTags) && migrationLesion.reviewTags.length > 0) {
    reasons.push('possui reviewTags pendentes');
  }
  if (!Array.isArray(migrationLesion.proposedAttributes) || migrationLesion.proposedAttributes.length === 0) {
    reasons.push('nenhum proposedAttribute');
  }

  const seenExclusiveGroup = new Map(); // groupId -> conceptId já visto nesta lesão
  (migrationLesion.proposedAttributes || []).forEach(p => {
    const conceptId = p && p.proposedItem && p.proposedItem.conceptId;
    const concept = conceptById.get(conceptId);
    if (!concept) { reasons.push('conceptId inexistente: ' + conceptId); return; }
    const group = groupById.get(concept.group);
    if (!group) { reasons.push('group inexistente para concept ' + conceptId + ': ' + concept.group); return; }
    if (isGroupExclusive(group)) {
      const already = seenExclusiveGroup.get(group.id);
      if (already && already !== conceptId) reasons.push('violação de exclusividade no group ' + group.id);
      seenExclusiveGroup.set(group.id, conceptId);
    }
  });

  return {
    eligible: reasons.length === 0,
    reasons,
    rawLesion: rawLookup.ok ? rawLookup.lesion : null
  };
}

// Constrói a mutação EM MEMÓRIA para uma lesão elegível. Nunca altera
// rawLesion — todo trabalho é feito sobre cópias (JSON round-trip).
function buildMutationForLesion(migrationLesion, rawLesion, conceptById, groupById) {
  const existingByConcept = activeExistingItemsByConcept(rawLesion);
  const beforeAttributes = rawLesion.attributes ? JSON.parse(JSON.stringify(rawLesion.attributes)) : null;
  const existingAllItemsCopy = (rawLesion.attributes && Array.isArray(rawLesion.attributes.items))
    ? JSON.parse(JSON.stringify(rawLesion.attributes.items))
    : [];

  const insertedItems = [];
  const preservedItemIds = [];
  const duplicatesAvoided = [];
  const conflictsWithExisting = [];

  migrationLesion.proposedAttributes.forEach(p => {
    const conceptId = p.proposedItem.conceptId;
    const concept = conceptById.get(conceptId);
    const group = groupById.get(concept.group);
    const activeExisting = existingByConcept.get(conceptId) || [];

    if (activeExisting.length > 0 && !groupAllowsMultiple(group)) {
      // Já existe item ATIVO deste concept e o group não permite múltiplas
      // instâncias (default de toda a baseline atual) — preserva o
      // existente, nunca duplica.
      duplicatesAvoided.push({ conceptId, existingItemId: activeExisting[0].itemId });
      preservedItemIds.push(activeExisting[0].itemId);
      return;
    }

    if (isGroupExclusive(group)) {
      // Conflito clínico: já existe item ATIVO de um concept DIFERENTE no
      // MESMO group exclusivo. Nunca sobrescreve — fica de fora do plano,
      // sinalizado para revisão humana futura (createLesionReview NÃO é
      // chamado nesta rodada, por instrução explícita).
      const conflicting = existingAllItemsCopy.find(i => !i.deletedAt && i.conceptId !== conceptId
        && conceptById.has(i.conceptId) && conceptById.get(i.conceptId).group === group.id);
      if (conflicting) {
        conflictsWithExisting.push({ proposedConceptId: conceptId, existingConceptId: conflicting.conceptId, groupId: group.id });
        return;
      }
    }

    insertedItems.push({
      itemId: plannedItemId(migrationLesion.lesionId, conceptId), // PLACEHOLDER — nunca gravar em DATA real
      conceptId,
      qualifiers: [],
      updatedAt: null, // nunca timestamp real durante planejamento
      deletedAt: null,
      provenance: { source: 'taxo-migration-plan', sourceTags: (p.provenance && p.provenance.sourceTags) || [] }
    });
  });

  const resultingItems = existingAllItemsCopy.concat(insertedItems);

  return {
    lesionId: migrationLesion.lesionId,
    beforeAttributes,
    proposedItemsConsidered: migrationLesion.proposedAttributes.length,
    insertedItems,
    preservedItemIds,
    duplicatesAvoided,
    conflictsWithExisting,
    resultingAttributes: { attributesVersion: 1, attributes: { items: resultingItems } }
  };
}

// ---------- Função principal (seção 1 do pedido) ----------
// Pura: nunca muta `data`/`migrationResult`/`taxonomy`, nunca acessa
// DATA/SEED/window/document/localStorage/IndexedDB/Firestore/saveData.
function buildTaxonomyAttributesApplyPlan({ data, migrationResult, taxonomy, sourceDataSha256 }) {
  if (!Array.isArray(data)) throw new Error('data deve ser um array');
  if (!migrationResult || !Array.isArray(migrationResult.lesions)) throw new Error('migrationResult.lesions deve ser um array');
  if (!taxonomy || !Array.isArray(taxonomy.concepts) || !Array.isArray(taxonomy.groups)) throw new Error('taxonomy inválida (concepts/groups ausentes)');

  const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));
  const groupById = new Map(taxonomy.groups.map(g => [g.id, g]));

  const eligibleLesionIds = [];
  const blockedLesionIds = [];
  const blockedReasons = {};
  const reviewRequiredIds = [];
  const noStructuredMappingIds = [];
  const mutations = [];

  migrationResult.lesions.forEach(ml => {
    if (ml.migrationStatus === 'review-required') { reviewRequiredIds.push(ml.lesionId); return; }
    if (ml.migrationStatus === 'no-structured-mapping') { noStructuredMappingIds.push(ml.lesionId); return; }
    if (ml.migrationStatus !== 'auto-ready') {
      // status desconhecido/futuro: nunca elegível, nunca assume.
      blockedLesionIds.push(ml.lesionId);
      blockedReasons[ml.lesionId] = ['migrationStatus desconhecido: ' + ml.migrationStatus];
      return;
    }
    const evaluation = evaluateLesionEligibility(ml, data, conceptById, groupById);
    if (!evaluation.eligible) {
      blockedLesionIds.push(ml.lesionId);
      blockedReasons[ml.lesionId] = evaluation.reasons;
      return;
    }
    eligibleLesionIds.push(ml.lesionId);
    mutations.push(buildMutationForLesion(ml, evaluation.rawLesion, conceptById, groupById));
  });

  const sum = (arr, fn) => arr.reduce((acc, x) => acc + fn(x), 0);

  return {
    metadata: {
      planOnly: true,
      writePerformed: false,
      sourceDataSha256: sourceDataSha256 || null,
      sourceLesionCount: data.length,
      taxonomyVersion: taxonomy.metadata ? taxonomy.metadata.taxonomyVersion : null,
      taxonomyReleaseLabel: taxonomy.metadata ? (taxonomy.metadata.releaseLabel || null) : null,
      generatedAt: null // nunca Date.now() real num plano — mesma regra do dry-run
    },
    eligibleLesionIds,
    blockedLesionIds,
    blockedReasons,
    reviewRequiredIds,
    noStructuredMappingIds,
    mutations,
    summary: {
      eligibleCount: eligibleLesionIds.length,
      blockedCount: blockedLesionIds.length,
      reviewRequiredCount: reviewRequiredIds.length,
      noStructuredMappingCount: noStructuredMappingIds.length,
      totalProposedItemsConsidered: sum(mutations, m => m.proposedItemsConsidered),
      totalInserted: sum(mutations, m => m.insertedItems.length),
      totalPreserved: sum(mutations, m => m.preservedItemIds.length),
      totalDuplicatesAvoided: sum(mutations, m => m.duplicatesAvoided.length),
      totalConflictsWithExisting: sum(mutations, m => m.conflictsWithExisting.length)
    }
  };
}

// ---------- Proteção de drift (seção 8 do pedido) ----------
// Pura: nunca escreve, só compara. QUALQUER drift (contagem, IDs, hash)
// bloqueia — nunca tenta reconciliar silenciosamente.
function validateApplyBaseline(currentData, expectedBaseline) {
  const problems = [];
  const eb = expectedBaseline || {};

  if (!Array.isArray(currentData)) {
    return { ok: false, driftDetected: true, problems: ['currentData não é um array'], currentHash: null, idsAdded: [], idsRemoved: [] };
  }

  const count = currentData.length;
  if (eb.lesionCount != null && count !== eb.lesionCount) {
    problems.push('lesionCount atual (' + count + ') difere do baseline esperado (' + eb.lesionCount + ')');
  }

  let idsAdded = [], idsRemoved = [];
  if (Array.isArray(eb.ids)) {
    const currentIds = new Set(currentData.map(d => d && d.id));
    const baselineIds = new Set(eb.ids);
    idsAdded = [...currentIds].filter(id => !baselineIds.has(id));
    idsRemoved = [...baselineIds].filter(id => !currentIds.has(id));
    if (idsAdded.length > 0) problems.push(idsAdded.length + ' id(s) adicionado(s) desde o baseline (drift)');
    if (idsRemoved.length > 0) problems.push(idsRemoved.length + ' id(s) removido(s) desde o baseline (drift)');
  }

  const currentHash = computeDataSha256(currentData);
  if (eb.dataSha256 && currentHash !== String(eb.dataSha256).toLowerCase()) {
    problems.push('dataSha256 atual (' + currentHash + ') difere do baseline esperado (' + eb.dataSha256 + ') — drift de conteúdo');
  }

  return {
    ok: problems.length === 0,
    driftDetected: problems.length > 0,
    problems,
    currentHash,
    idsAdded,
    idsRemoved
  };
}

module.exports = {
  buildTaxonomyAttributesApplyPlan,
  validateApplyBaseline,
  computeDataSha256,
  plannedItemId,
  evaluateLesionEligibility,
  buildMutationForLesion
};
