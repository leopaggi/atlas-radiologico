'use strict';

// TAXO-04C3 — EXECUTOR do apply de attributes, mas operando SOMENTE sobre
// clones em memória. Nenhuma função pública deste arquivo persiste nada:
// não existe (e não pode existir nesta rodada) nenhum caminho até
// saveData()/pushToFirebaseNow()/writeShardedState()/Firestore/
// IndexedDB/localStorage. `currentData`/`now`/`idFactory` são SEMPRE
// recebidos por parâmetro — nunca lidos de DATA/SEED/window/document
// globais, e nunca gerados internamente (Date.now()/Math.random() só
// aparecem dentro de `createDefaultIdFactory`/`createDefaultNowFn`,
// helpers EXPORTADOS mas nunca chamados automaticamente por este módulo —
// quem usa decide explicitamente, e testes injetam versões determinísticas).
//
// Três fases continuam separadas (igual à TAXO-04C2):
//   PLANEJAMENTO   — tools/taxonomy-attributes-apply-plan.js (já existe).
//   MATERIALIZAÇÃO — este arquivo. Troca itemId placeholder por itemId
//                    real e recomputa attributes.items[] SÓ EM MEMÓRIA.
//   PERSISTÊNCIA   — NÃO existe ainda. `simulateTaxonomyAttributesApply`
//                    é o teto desta rodada: produz um `afterData` em
//                    memória e devolve, nunca grava.

const applyPlanModule = require('./taxonomy-attributes-apply-plan.js');
const { validateApplyBaseline, evaluateLesionEligibility, buildMutationForLesion } = applyPlanModule;

// ---------- Helpers de now/idFactory (nunca chamados sem injeção explícita) ----------

// Padrão REAL já usado em todo o resto do Atlas para itemId de produção
// (ver, por ex., o padrão de backup/safety-snapshot id: 'snap_' +
// Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8)).
// Exportado como FÁBRICA (função que retorna uma função), nunca invocado
// internamente por este módulo — só existe para um futuro chamador real
// optar explicitamente por ele.
function createDefaultIdFactory() {
  return function defaultIdFactory() {
    return 'attr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  };
}
function createDefaultNowFn() {
  return function defaultNowFn() { return Date.now(); };
}

// ---------- 3. Baseline guard (primeira barreira, antes de qualquer materialização) ----------
// Reaproveita validateApplyBaseline (já testada na TAXO-04C2) — não
// reimplementa a lógica de hash/contagem/IDs.
function checkBaseline(currentData, expectedBaseline) {
  const result = validateApplyBaseline(currentData, expectedBaseline || {});
  return { ok: result.ok, driftDetected: result.driftDetected, problems: result.problems, currentHash: result.currentHash };
}

// ---------- 4/5. Revalidação do apply plan — nunca confia cegamente no JSON ----------
// Reconstrói, a partir do PRÓPRIO conteúdo de cada mutation (insertedItems/
// duplicatesAvoided/conflictsWithExisting), qual era o conjunto de
// conceptIds propostos, e RECOMPUTA buildMutationForLesion contra o
// `currentData` ATUAL — não contra o que estava congelado no plano. Se o
// resultado recomputado não bater exatamente com o que está no plano
// (conceptId a conceptId), a mutation é rejeitada: ou o plano foi
// adulterado, ou `currentData` mudou de um jeito que a proteção de hash
// de `checkBaseline` não cobriria por si só (ex.: alguém editou
// `attributes` de uma lesão sem mudar mais nada — o que mudaria o hash do
// DATA mesmo assim, mas esta camada é defesa em profundidade, não
// substitui o baseline guard).
function reconstructProposedConceptIds(mutation) {
  const set = new Set();
  mutation.insertedItems.forEach(i => set.add(i.conceptId));
  mutation.duplicatesAvoided.forEach(d => set.add(d.conceptId));
  mutation.conflictsWithExisting.forEach(c => set.add(c.proposedConceptId));
  return [...set];
}

function revalidateMutation(mutation, currentData, conceptById, groupById) {
  const reasons = [];
  const proposedConceptIds = reconstructProposedConceptIds(mutation);
  if (proposedConceptIds.length === 0) reasons.push('mutation sem nenhum conceptId reconstruível');

  const syntheticMigrationLesion = {
    lesionId: mutation.lesionId,
    proposedAttributes: proposedConceptIds.map(conceptId => ({ proposedItem: { conceptId }, provenance: { sourceTags: [] } })),
    conflicts: [],
    ambiguousTags: [],
    reviewTags: []
  };

  const evaluation = evaluateLesionEligibility(syntheticMigrationLesion, currentData, conceptById, groupById);
  if (!evaluation.eligible) {
    return { ok: false, reasons: reasons.concat(evaluation.reasons) };
  }

  const recomputed = buildMutationForLesion(syntheticMigrationLesion, evaluation.rawLesion, conceptById, groupById);

  const recomputedInserted = new Set(recomputed.insertedItems.map(i => i.conceptId));
  const planInserted = new Set(mutation.insertedItems.map(i => i.conceptId));
  const recomputedDup = new Set(recomputed.duplicatesAvoided.map(d => d.conceptId));
  const planDup = new Set(mutation.duplicatesAvoided.map(d => d.conceptId));
  const recomputedConflict = new Set(recomputed.conflictsWithExisting.map(c => c.proposedConceptId));
  const planConflict = new Set(mutation.conflictsWithExisting.map(c => c.proposedConceptId));

  const setsEqual = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  if (!setsEqual(recomputedInserted, planInserted)) reasons.push('insertedItems recomputados divergem do plano para ' + mutation.lesionId);
  if (!setsEqual(recomputedDup, planDup)) reasons.push('duplicatesAvoided recomputados divergem do plano para ' + mutation.lesionId);
  if (!setsEqual(recomputedConflict, planConflict)) reasons.push('conflictsWithExisting recomputados divergem do plano para ' + mutation.lesionId);

  return { ok: reasons.length === 0, reasons, rawLesion: evaluation.rawLesion };
}

function revalidateApplyPlan(applyPlan, currentData, taxonomy, expectedPlanShape) {
  const problems = [];
  const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));
  const groupById = new Map(taxonomy.groups.map(g => [g.id, g]));

  if (expectedPlanShape) {
    if (expectedPlanShape.eligibleCount != null && applyPlan.eligibleLesionIds.length !== expectedPlanShape.eligibleCount) {
      problems.push('eligibleLesionIds.length (' + applyPlan.eligibleLesionIds.length + ') !== esperado (' + expectedPlanShape.eligibleCount + ')');
    }
    if (expectedPlanShape.mutationsCount != null && applyPlan.mutations.length !== expectedPlanShape.mutationsCount) {
      problems.push('mutations.length (' + applyPlan.mutations.length + ') !== esperado (' + expectedPlanShape.mutationsCount + ')');
    }
    if (expectedPlanShape.totalInsertedItems != null && applyPlan.summary.totalInserted !== expectedPlanShape.totalInsertedItems) {
      problems.push('summary.totalInserted (' + applyPlan.summary.totalInserted + ') !== esperado (' + expectedPlanShape.totalInsertedItems + ')');
    }
    if (expectedPlanShape.blockedCount != null && applyPlan.blockedLesionIds.length !== expectedPlanShape.blockedCount) {
      problems.push('blockedLesionIds.length (' + applyPlan.blockedLesionIds.length + ') !== esperado (' + expectedPlanShape.blockedCount + ')');
    }
  }

  // Nenhuma mutation pode pertencer a review-required/no-structured-mapping —
  // checagem estrutural: o id da mutation nunca pode aparecer nessas listas.
  const reviewSet = new Set(applyPlan.reviewRequiredIds || []);
  const noMapSet = new Set(applyPlan.noStructuredMappingIds || []);

  const mutationRevalidations = {};
  applyPlan.mutations.forEach(m => {
    if (reviewSet.has(m.lesionId) || noMapSet.has(m.lesionId)) {
      problems.push('mutation ' + m.lesionId + ' pertence a review-required/no-structured-mapping — nunca deveria ter mutation');
      mutationRevalidations[m.lesionId] = { ok: false, reasons: ['status incompatível'] };
      return;
    }
    const revalidation = revalidateMutation(m, currentData, conceptById, groupById);
    mutationRevalidations[m.lesionId] = revalidation;
    if (!revalidation.ok) problems.push.apply(problems, revalidation.reasons);
  });

  return { ok: problems.length === 0, problems, mutationRevalidations };
}

// ---------- 6. Materialização de itemId (seção 5/7 do pedido) ----------
// Pura: nunca chama Date.now()/Math.random() diretamente — recebe `now`
// (função) e `idFactory` (função) já resolvidos pelo chamador. Garante
// unicidade do itemId dentro de TODAS as 1210 lesões (não só dentro da
// própria lesão), comparando contra os itemIds reais já existentes em
// `currentData` mais os já gerados nesta mesma materialização.
function collectExistingItemIds(data) {
  const set = new Set();
  data.forEach(lesion => {
    const items = (lesion && lesion.attributes && Array.isArray(lesion.attributes.items)) ? lesion.attributes.items : [];
    items.forEach(item => { if (item && item.itemId) set.add(item.itemId); });
  });
  return set;
}

function materializeTaxonomyAttributeItems(mutations, { now, idFactory, currentData }) {
  if (typeof now !== 'function') throw new Error('now deve ser uma função injetada que retorne o instante atual (ex.: createDefaultNowFn())');
  if (typeof idFactory !== 'function') throw new Error('idFactory deve ser uma função injetada');
  const usedIds = collectExistingItemIds(currentData || []);
  const timestamp = now();

  return mutations.map(mutation => {
    const materializedInserted = mutation.insertedItems.map(placeholder => {
      let realId = idFactory();
      let attempts = 0;
      while (usedIds.has(realId)) {
        attempts += 1;
        if (attempts > 1000) throw new Error('idFactory não conseguiu gerar um itemId único após 1000 tentativas');
        realId = idFactory();
      }
      usedIds.add(realId);
      return {
        itemId: realId,
        conceptId: placeholder.conceptId,
        qualifiers: [],
        updatedAt: timestamp,
        deletedAt: null,
        provenance: placeholder.provenance
      };
    });

    const existingItems = (mutation.beforeAttributes && Array.isArray(mutation.beforeAttributes.items))
      ? JSON.parse(JSON.stringify(mutation.beforeAttributes.items))
      : [];

    return Object.assign({}, mutation, {
      materializedInsertedItems: materializedInserted,
      materializedAttributes: { attributesVersion: 1, attributes: { items: existingItems.concat(materializedInserted) } }
    });
  });
}

// ---------- 9. Validação pós-apply ----------
function omitFields(obj, fields) {
  const copy = Object.assign({}, obj);
  fields.forEach(f => { delete copy[f]; });
  return copy;
}

function validatePostApplyState(beforeData, afterData, execution) {
  const problems = [];

  if (!Array.isArray(beforeData) || !Array.isArray(afterData)) {
    return { ok: false, problems: ['beforeData/afterData devem ser arrays'] };
  }
  if (afterData.length !== beforeData.length) {
    problems.push('contagem de lesões mudou: antes=' + beforeData.length + ' depois=' + afterData.length);
  }
  const beforeIds = beforeData.map(l => l.id);
  const afterIds = afterData.map(l => l.id);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    problems.push('IDs ou ordem das lesões mudaram');
  }

  const modifiedSet = new Set(execution.modifiedLesionIds || []);
  const beforeById = new Map(beforeData.map(l => [l.id, l]));
  const afterById = new Map(afterData.map(l => [l.id, l]));

  const allItemIds = new Set();
  let duplicateItemIdFound = null;
  let newItemsCount = 0;

  afterData.forEach(lesion => {
    const before = beforeById.get(lesion.id);
    const wasModified = modifiedSet.has(lesion.id);

    // Campos fora de attributes/attributesVersion/_userUpdatedAt nunca podem mudar.
    const beforeRest = omitFields(before, ['attributes', 'attributesVersion', '_userUpdatedAt']);
    const afterRest = omitFields(lesion, ['attributes', 'attributesVersion', '_userUpdatedAt']);
    if (JSON.stringify(beforeRest) !== JSON.stringify(afterRest)) {
      problems.push('lesão ' + lesion.id + ' teve campo fora de attributes/attributesVersion/_userUpdatedAt alterado');
    }

    if (!wasModified) {
      if (JSON.stringify(lesion.attributes || null) !== JSON.stringify(before.attributes || null)) {
        problems.push('lesão ' + lesion.id + ' NÃO deveria ter attributes alterado (não está em modifiedLesionIds)');
      }
      return;
    }

    if (lesion.attributesVersion !== 1) problems.push('lesão ' + lesion.id + ' modificada sem attributesVersion === 1');
    const items = (lesion.attributes && Array.isArray(lesion.attributes.items)) ? lesion.attributes.items : [];
    items.forEach(item => {
      if (allItemIds.has(item.itemId)) duplicateItemIdFound = item.itemId;
      allItemIds.add(item.itemId);
      if (/^attr_dryrun_|^attr_planned_/.test(item.itemId)) problems.push('itemId placeholder vazou para afterData: ' + item.itemId);
    });
  });

  (execution.materializedMutations || []).forEach(m => {
    m.materializedInsertedItems.forEach(item => {
      newItemsCount += 1;
      if (item.deletedAt !== null) problems.push('item novo com deletedAt !== null: ' + item.itemId);
      if (!Array.isArray(item.qualifiers) || item.qualifiers.length !== 0) problems.push('item novo com qualifiers inválido: ' + item.itemId);
      if (item.updatedAt == null) problems.push('item novo com updatedAt vazio: ' + item.itemId);
    });
  });

  if (duplicateItemIdFound) problems.push('itemId duplicado encontrado em afterData: ' + duplicateItemIdFound);

  return {
    ok: problems.length === 0,
    problems,
    modifiedLesionCount: modifiedSet.size,
    newItemsCount,
    totalLesionsAfter: afterData.length
  };
}

// ---------- 13. Simulação atômica (orquestra tudo, nunca persiste) ----------
function simulateTaxonomyAttributesApply({ currentData, expectedBaseline, applyPlan, taxonomy, now, idFactory, expectedPlanShape }) {
  // 1. baseline guard — PRIMEIRA barreira. Se falhar, idFactory/now NUNCA
  // são chamados e NADA é clonado.
  const baselineCheck = checkBaseline(currentData, expectedBaseline);
  if (!baselineCheck.ok) {
    return { success: false, aborted: true, reason: 'baseline-drift', baselineCheck, afterData: null };
  }

  // 2. revalidação do plano — defesa em profundidade, nunca confia no JSON.
  const planCheck = revalidateApplyPlan(applyPlan, currentData, taxonomy, expectedPlanShape);
  if (!planCheck.ok) {
    return { success: false, aborted: true, reason: 'plan-invalid', baselineCheck, planCheck, afterData: null };
  }

  // 3. deep clone — todo trabalho a partir daqui é sobre a cópia.
  const afterData = JSON.parse(JSON.stringify(currentData));
  const byId = new Map(afterData.map(l => [l.id, l]));

  // 4. materialização de IDs reais — só agora, só em memória.
  const materializedMutations = materializeTaxonomyAttributeItems(applyPlan.mutations, { now, idFactory, currentData });

  // 5. aplica cada mutation materializada no clone.
  const modifiedLesionIds = [];
  materializedMutations.forEach(m => {
    const lesion = byId.get(m.lesionId);
    lesion.attributesVersion = m.materializedAttributes.attributesVersion;
    lesion.attributes = m.materializedAttributes.attributes;
    // Seção 17: timestamp de "freshness" só avança quando algo foi
    // realmente inserido nesta execução — rerun idempotente (0 inserts)
    // não deve fingir que a lesão mudou.
    if (m.materializedInsertedItems.length > 0) {
      lesion._userUpdatedAt = now();
      modifiedLesionIds.push(m.lesionId);
    }
  });

  // 6. validação pós-apply completa.
  const postApplyCheck = validatePostApplyState(currentData, afterData, { modifiedLesionIds, materializedMutations });
  if (!postApplyCheck.ok) {
    return { success: false, aborted: true, reason: 'post-apply-validation-failed', baselineCheck, planCheck, postApplyCheck, afterData: null };
  }

  return {
    success: true,
    aborted: false,
    baselineCheck,
    planCheck,
    postApplyCheck,
    modifiedLesionIds,
    newItemsCount: postApplyCheck.newItemsCount,
    afterData
  };
}

// ---------- 1. prepareTaxonomyAttributesExecution — só validação, nunca clona ----------
function prepareTaxonomyAttributesExecution({ currentData, expectedBaseline, applyPlan, taxonomy, expectedPlanShape }) {
  const baselineCheck = checkBaseline(currentData, expectedBaseline);
  if (!baselineCheck.ok) return { ready: false, reason: 'baseline-drift', baselineCheck, planCheck: null };
  const planCheck = revalidateApplyPlan(applyPlan, currentData, taxonomy, expectedPlanShape);
  if (!planCheck.ok) return { ready: false, reason: 'plan-invalid', baselineCheck, planCheck };
  return { ready: true, reason: null, baselineCheck, planCheck };
}

module.exports = {
  prepareTaxonomyAttributesExecution,
  materializeTaxonomyAttributeItems,
  simulateTaxonomyAttributesApply,
  validatePostApplyState,
  revalidateApplyPlan,
  checkBaseline,
  collectExistingItemIds,
  createDefaultIdFactory,
  createDefaultNowFn
};
