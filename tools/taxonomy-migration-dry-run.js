'use strict';

// TAXO-04A — motor de SIMULAÇÃO (dry-run) da futura migração tags[] →
// attributes.items[]. Função pura: nunca lê DATA/SEED/window/localStorage/
// IndexedDB/Firestore, nunca chama saveData()/storage.set()/
// markSyncDirty()/pushToFirebaseNow()/writeShardedStateSerialized(), nunca
// muta os parâmetros recebidos. Todo estado vem explicitamente dos 3
// argumentos (data, taxonomy, tagMap) — isso permite testar com fixtures e,
// depois, chamar com o DATA/TAXONOMY.json/TAG_TO_TAXONOMY_MAP.json reais sem
// duplicar lógica.
//
// NADA aqui grava nada. O objeto devolvido é só uma PROPOSTA (dry-run):
// attributesVersion/attributes do schema final NÃO são escritos em nenhuma
// lesão — ver proposedItem/provenance por lesão no resultado.
//
// Estados de catálogo elegíveis para gerar proposedAttribute automaticamente
// (seção 4 do pedido): catalogState === 'live' ou 'live-only' E
// mapping.status === 'mapped'. Todo o resto (ambiguous/review/unmapped/
// ignored/historical-*/stale-unknown/decision-unapplied/review-human) NUNCA
// gera attribute automaticamente — na pior das hipóteses bloqueia a lesão
// para revisão humana (ambiguous/review/conflitos), na melhor só fica de
// fora sem impedir os outros concepts da mesma lesão (unmapped/ignored).

const ELIGIBLE_CATALOG_STATES = new Set(['live', 'live-only']);

// ===================== TAXO-04B — resolvers contextuais =====================
// Camada SEPARADA do mapeamento original: TAG_TO_TAXONOMY_MAP.json nunca é
// lido como "mapped" por causa disto — a ambiguidade/review ORIGINAL
// continua exatamente como estava no mapa. Um resolver só decide, PARA UMA
// LESÃO ESPECÍFICA, se o CONTEXTO JÁ PRESENTE nela (outros concepts já
// candidatos para a mesma lesão) é suficiente para resolver com segurança —
// nunca usa o nome do diagnóstico como oráculo (seção 5 do pedido), nunca
// decide "no escuro": sem sinal contextual suficiente, cai no fallback
// original (ambiguousTags/reviewTags), que é sempre o comportamento mais
// seguro (seção 19: "no change is safer").
//
// Cada resolver é puro: só lê candidateConceptIds/rawCandidates (já
// calculados por OUTRAS tags da MESMA lesão) e conceptById/groupById —
// nunca a lesão inteira "às cegas", nunca window/DATA/SEED.

const BONE_CONTEXT_GROUPS = new Set(['radiologic.boneDensity', 'radiologic.boneMatrix', 'radiologic.periostealReaction']);

const CONTEXTUAL_RESOLVERS = [
  {
    ruleId: 'resolve-solid-composition-v1',
    description: '"sólido" é ambíguo entre composição geral (rad_comp_solid) e reação periosteal "sólida" (rad_periosteal_solid) por colisão de concordância de gênero gramatical. Resolve para rad_comp_solid quando a lesão não tem NENHUM outro concept candidato em groups ósseos/periosteal (radiologic.boneDensity/boneMatrix/periostealReaction) — ausência de qualquer sinal ósseo/periosteal nos OUTROS concepts já candidatos da mesma lesão é o contexto que permite excluir com segurança a leitura de reação periosteal. Nunca usa o nome do diagnóstico. Auditado manualmente contra as 39 ocorrências reais da TAXO-04A antes de ser habilitado (ver TAXO04B_MIGRATION_DRY_RUN_REPORT.md) — 0 das 39 tinha qualquer sinal ósseo genuíno nos outros concepts. As 2 recusas vistas na TAXO-04B (seed_563/seed_568) vinham de um falso candidato ósseo (rad_periosteal_spiculated, originado de um mapeamento equivocado da tag "espiculada" no TAG_TO_TAXONOMY_MAP.json) — corrigido na TAXO-04B3 (ver TAXO04B2_RULE_ADJUDICATION.json) para rad_margin_spiculated, fora dos groups ósseos/periosteal. A regra em si não foi alterada: o resultado melhora porque o SINAL de entrada foi corrigido, não porque a lógica do resolver mudou.',
    appliesTo(tag, candidateConceptIds) {
      return tag === 'sólido' && candidateConceptIds.length === 2 && candidateConceptIds.includes('rad_comp_solid') && candidateConceptIds.includes('rad_periosteal_solid');
    },
    resolve(ctx) {
      const hasBoneContext = [...ctx.rawCandidatesByConceptId.keys()].some(cid => {
        const c = ctx.conceptById.get(cid);
        return !!(c && BONE_CONTEXT_GROUPS.has(c.group));
      });
      if (hasBoneContext) {
        return { resolved: false, reason: 'a lesão tem outro concept candidato em group ósseo/periosteal — contexto insuficiente para excluir rad_periosteal_solid com segurança' };
      }
      return { resolved: true, conceptId: 'rad_comp_solid', reason: 'nenhum outro concept candidato da lesão pertence a radiologic.boneDensity/boneMatrix/periostealReaction' };
    }
  }
];

// combinationResolvers (seção 7 do pedido): avaliados nesta rodada para o
// par lítica+esclerótica -> rad_bonedensity_mixed e DELIBERADAMENTE
// REJEITADOS (lista vazia) — ver justificativa completa no relatório.
// Resumo: 3 das 7 ocorrências reais têm a tag "multifocal" (doença
// multifocal pode legitimamente ter focos líticos E escleróticos
// INDEPENDENTES, nunca um único "misto"); das 4 restantes, pelo menos 2
// (fibroma não ossificante, osteoma osteoide) são classicamente descritas
// como lesão lítica com RIM/nicho esclerótico — não "densidade mista" — e
// distinguir esse padrão das 2 restantes (Paget, osteomielite, onde "misto"
// de fato se aplica) exigiria conhecimento diagnóstico específico por
// lesão, exatamente o que a seção 5 do pedido proíbe. Nenhuma regra segura,
// 100% baseada em contexto, foi encontrada — mantém-se o framework (array),
// vazio, para reutilização futura se uma regra realmente segura aparecer.
const COMBINATION_RESOLVERS = [];

function isSeedLike(id) {
  return /^seed_/i.test(String(id || ''));
}

// Resolve deprecated->aliasOf (seção 20). Nesta baseline nenhum concept é
// deprecated, mas a cadeia é implementada e testada mesmo assim: aliasOf
// precisa existir, e a cadeia não pode ser circular (limite de 10 saltos —
// bem acima de qualquer cadeia real esperada — para nunca travar em loop).
function resolveConcept(conceptId, conceptById) {
  let current = conceptById.get(conceptId);
  if (!current) return { ok: false, reason: 'conceptId inexistente em TAXONOMY.json: ' + conceptId };
  const seen = new Set([conceptId]);
  let hops = 0;
  while (current.status === 'deprecated') {
    hops += 1;
    if (hops > 10) return { ok: false, reason: 'cadeia de aliasOf excede 10 saltos (possível ciclo) a partir de ' + conceptId };
    const aliasOf = current.aliasOf;
    if (!aliasOf) return { ok: false, reason: 'concept "' + current.id + '" está deprecated sem aliasOf' };
    if (seen.has(aliasOf)) return { ok: false, reason: 'cadeia de aliasOf circular detectada a partir de ' + conceptId + ' (voltou para ' + aliasOf + ')' };
    seen.add(aliasOf);
    const next = conceptById.get(aliasOf);
    if (!next) return { ok: false, reason: 'concept "' + current.id + '" tem aliasOf inexistente: ' + aliasOf };
    current = next;
  }
  return { ok: true, concept: current };
}

function validateConcept(conceptId, conceptById, groupById) {
  if (isSeedLike(conceptId)) return { ok: false, reason: 'conceptId em formato seed_N (posicional), nunca válido: ' + conceptId };
  const resolved = resolveConcept(conceptId, conceptById);
  if (!resolved.ok) return resolved;
  const concept = resolved.concept;
  const group = groupById.get(concept.group);
  if (!group) return { ok: false, reason: 'concept "' + concept.id + '" referencia group inexistente: ' + concept.group };
  return { ok: true, concept, group };
}

// itemId determinístico para o dry-run (seção 2 do pedido): derivado de
// lesionId+conceptId, nunca de posição/índice/seed_N, nunca aleatório —
// garante que duas execuções do MESMO dry-run sobre os MESMOS dados
// produzam exatamente o mesmo itemId, permitindo comparar dry-run A vs B
// depois de ajustes no mapa (seção 31). A aplicação REAL futura (fora deste
// dry-run) deve gerar itemId com o padrão já usado no resto do Atlas
// ('attr_' + Date.now().toString(36) + '_' + Math.random().toString(36)
// .slice(2,8)) no momento real da escrita — este helper aqui NÃO deve ser
// reaproveitado por código que grava de verdade, só para simulação.
function dryRunItemId(lesionId, conceptId) {
  return 'attr_dryrun_' + String(lesionId) + '_' + conceptId;
}

function classifyTag(tag, tagMap) {
  if (Object.prototype.hasOwnProperty.call(tagMap.mappings || {}, tag)) {
    return { bucket: 'live', entry: tagMap.mappings[tag] };
  }
  if (tagMap.historicalMappings && Object.prototype.hasOwnProperty.call(tagMap.historicalMappings, tag)) {
    return { bucket: 'historical', entry: tagMap.historicalMappings[tag] };
  }
  if (tagMap.staleOrUnappliedTags && Object.prototype.hasOwnProperty.call(tagMap.staleOrUnappliedTags, tag)) {
    return { bucket: 'stale', entry: tagMap.staleOrUnappliedTags[tag] };
  }
  return { bucket: 'unknown', entry: null };
}

function simulateLesionMigration(lesion, taxonomy, tagMap) {
  const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));
  const groupById = new Map(taxonomy.groups.map(g => [g.id, g]));

  const tags = Array.isArray(lesion.tags) ? lesion.tags : [];
  const unmappedTags = [];
  const ignoredTags = [];
  const ambiguousTags = [];
  const reviewTags = [];
  const historicalTagsPresent = [];
  const staleTagsPresent = [];
  const unknownTags = [];

  // conceptId -> { sourceTags: [...] } — candidatos ANTES de validação/conflitos
  const candidatesByConceptId = new Map();
  // Tags ambíguas/review ADIADAS para a 2ª passada (seção 2 do pedido: um
  // resolver contextual só pode usar dados JÁ presentes na lesão — ou seja,
  // precisa que a 1ª passada (tags mapped diretas) já tenha terminado).
  const deferredAmbiguous = [];
  const deferredReview = [];
  const contextualResolutions = [];

  // ---------- 1ª passada: tags mapped diretas (nunca dependem de resolver) ----------
  tags.forEach(tag => {
    const { bucket, entry } = classifyTag(tag, tagMap);

    if (bucket === 'historical') { historicalTagsPresent.push({ tag, catalogState: entry.catalogState }); return; }
    if (bucket === 'stale') { staleTagsPresent.push({ tag, catalogState: entry.catalogState }); return; }
    if (bucket === 'unknown') { unknownTags.push(tag); return; }

    // bucket === 'live': entry é { catalogState, isLiveOnly, decisionState, decision, mapping, ... }
    if (!ELIGIBLE_CATALOG_STATES.has(entry.catalogState)) {
      // catalogState === 'review-human' (ou outro futuro estado não elegível):
      // nunca auto-aplica, mesmo que mapping.status acidentalmente seja "mapped".
      deferredReview.push({ tag, reason: 'catalogState "' + entry.catalogState + '" não é elegível para aplicação automática', conceptIds: [] });
      return;
    }

    const m = entry.mapping;
    if (m.status === 'mapped') {
      (m.conceptIds || []).forEach(conceptId => {
        if (!candidatesByConceptId.has(conceptId)) candidatesByConceptId.set(conceptId, { sourceTags: [], catalogState: entry.catalogState });
        candidatesByConceptId.get(conceptId).sourceTags.push(tag);
      });
    } else if (m.status === 'ambiguous') {
      deferredAmbiguous.push({ tag, candidates: m.candidates || [], reason: m.notes || null });
    } else if (m.status === 'review') {
      deferredReview.push({ tag, reason: m.notes || null, conceptIds: m.conceptIds || [] });
    } else if (m.status === 'unmapped') {
      unmappedTags.push(tag);
    } else if (m.status === 'ignored') {
      ignoredTags.push(tag);
    } else {
      // status desconhecido/futuro: nunca auto-aplica, vai para revisão em vez de assumir.
      deferredReview.push({ tag, reason: 'mapping.status desconhecido: ' + m.status, conceptIds: [] });
    }
  });

  // ---------- 2ª passada: aplica resolvers contextuais sobre as ambíguas/review ----------
  // TAG_TO_TAXONOMY_MAP.json nunca é tocado aqui — só a INTERPRETAÇÃO desta
  // lesão específica. Sem sinal contextual suficiente, cai no fallback
  // original (ambiguousTags/reviewTags) — nunca "no escuro" (seção 19).
  const resolverCtx = { rawCandidatesByConceptId: candidatesByConceptId, conceptById, groupById };

  deferredAmbiguous.forEach(item => {
    const candidateConceptIds = (item.candidates || []).map(c => c.conceptId);
    const resolver = CONTEXTUAL_RESOLVERS.find(r => r.appliesTo(item.tag, candidateConceptIds));
    if (resolver) {
      const outcome = resolver.resolve(resolverCtx);
      if (outcome.resolved) {
        if (!candidatesByConceptId.has(outcome.conceptId)) candidatesByConceptId.set(outcome.conceptId, { sourceTags: [], catalogState: 'live' });
        candidatesByConceptId.get(outcome.conceptId).sourceTags.push(item.tag);
        contextualResolutions.push({ tag: item.tag, ruleId: resolver.ruleId, resolvedConceptId: outcome.conceptId, reason: outcome.reason, originalMappingStatus: 'ambiguous' });
        return;
      }
      // resolver existe para esta tag mas não teve contexto suficiente nesta
      // lesão — fallback explícito para ambiguous, com o motivo do resolver
      // registrado para auditoria (não é silencioso).
      ambiguousTags.push({ tag: item.tag, candidates: item.candidates, reason: item.reason, resolverAttempted: resolver.ruleId, resolverFallbackReason: outcome.reason });
      return;
    }
    ambiguousTags.push({ tag: item.tag, candidates: item.candidates, reason: item.reason });
  });

  deferredReview.forEach(item => {
    // Nenhum resolver contextual registrado nesta rodada atua sobre
    // mapping.status="review" (ver TAXO04B_MIGRATION_DRY_RUN_REPORT.md,
    // seção de globalMappingProposals) — toda tag "review" permanece em
    // reviewTags, sem exceção, por decisão explícita desta rodada.
    reviewTags.push(item);
  });

  // ---------- Validação de cada concept candidato (seção 19/20) ----------
  const invalidMappingIssues = [];
  const validConcepts = new Map(); // conceptId resolvido -> { concept, group, sourceTags }
  candidatesByConceptId.forEach((info, conceptId) => {
    const result = validateConcept(conceptId, conceptById, groupById);
    if (!result.ok) {
      invalidMappingIssues.push({ type: 'invalid-mapping', conceptId, sourceTags: info.sourceTags.slice(), reason: result.reason });
      return;
    }
    // Concept resolvido (pode ter mudado de id via aliasOf — não ocorre nesta
    // baseline, mas o código já está pronto para quando ocorrer).
    const resolvedId = result.concept.id;
    if (!validConcepts.has(resolvedId)) validConcepts.set(resolvedId, { concept: result.concept, group: result.group, sourceTags: [], catalogState: info.catalogState });
    const bucket = validConcepts.get(resolvedId);
    info.sourceTags.forEach(t => { if (!bucket.sourceTags.includes(t)) bucket.sourceTags.push(t); });
  });

  // ---------- Conflito de group exclusivo (seção 10) ----------
  const exclusiveGroupConflicts = [];
  const byGroup = new Map();
  validConcepts.forEach((info, conceptId) => {
    const gid = info.group.id;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(conceptId);
  });
  const conceptIdsBlockedByExclusiveConflict = new Set();
  byGroup.forEach((conceptIds, gid) => {
    const group = groupById.get(gid);
    if (group && group.exclusive === true && conceptIds.length > 1) {
      const sourceTags = [];
      conceptIds.forEach(cid => validConcepts.get(cid).sourceTags.forEach(t => { if (!sourceTags.includes(t)) sourceTags.push(t); }));
      exclusiveGroupConflicts.push({ type: 'exclusive-group-conflict', groupId: gid, conceptIds: conceptIds.slice(), sourceTags });
      conceptIds.forEach(cid => conceptIdsBlockedByExclusiveConflict.add(cid));
    }
  });

  // ---------- Conflito semântico conflictsWith (seção 21) ----------
  const conceptConflicts = [];
  const conceptIdsBlockedByConceptConflict = new Set();
  const allValidIds = [...validConcepts.keys()];
  for (let i = 0; i < allValidIds.length; i++) {
    for (let j = i + 1; j < allValidIds.length; j++) {
      const a = allValidIds[i], b = allValidIds[j];
      const conceptA = validConcepts.get(a).concept;
      const conceptB = validConcepts.get(b).concept;
      const aConflictsWithB = Array.isArray(conceptA.conflictsWith) && conceptA.conflictsWith.includes(b);
      const bConflictsWithA = Array.isArray(conceptB.conflictsWith) && conceptB.conflictsWith.includes(a);
      if (aConflictsWithB || bConflictsWithA) {
        const sourceTags = [...validConcepts.get(a).sourceTags, ...validConcepts.get(b).sourceTags];
        conceptConflicts.push({ type: 'concept-conflict', conceptIds: [a, b], sourceTags });
        conceptIdsBlockedByConceptConflict.add(a);
        conceptIdsBlockedByConceptConflict.add(b);
      }
    }
  }

  // ---------- Monta proposedAttributes (só os concepts que sobreviveram) ----------
  // Seção 3 do pedido: quando o conceptId recebeu alguma tag via resolução
  // contextual, a provenance registra ruleId/resolutionType — sempre
  // auditável, nunca escondido dentro de um "mapped" genérico.
  const resolutionByConceptId = new Map(contextualResolutions.map(r => [r.resolvedConceptId, r]));
  const proposedAttributes = [];
  validConcepts.forEach((info, conceptId) => {
    if (conceptIdsBlockedByExclusiveConflict.has(conceptId) || conceptIdsBlockedByConceptConflict.has(conceptId)) return;
    const resolution = resolutionByConceptId.get(conceptId);
    const provenance = {
      sourceTags: info.sourceTags.slice(),
      mappingStatus: resolution ? 'ambiguous' : 'mapped',
      catalogState: info.catalogState,
      resolutionType: resolution ? 'contextual-rule' : 'direct'
    };
    if (resolution) {
      provenance.ruleId = resolution.ruleId;
      provenance.reason = resolution.reason;
    }
    proposedAttributes.push({
      proposedItem: {
        itemId: dryRunItemId(lesion.id, conceptId),
        conceptId,
        qualifiers: [], // seção 12: nunca inferido automaticamente nesta fase
        updatedAt: null, // seção 14: nunca Date.now() real num dry-run
        deletedAt: null
      },
      provenance
    });
  });

  const conflicts = [...exclusiveGroupConflicts, ...conceptConflicts, ...invalidMappingIssues];

  let migrationStatus;
  if (ambiguousTags.length > 0 || reviewTags.length > 0 || conflicts.length > 0) {
    migrationStatus = 'review-required';
  } else if (proposedAttributes.length > 0) {
    migrationStatus = 'auto-ready';
  } else {
    migrationStatus = 'no-structured-mapping';
  }

  return {
    lesionId: lesion.id,
    lesionName: lesion.name,
    section: lesion.s != null ? lesion.s : lesion.section,
    site: lesion.site,
    sourceTags: tags.slice(),
    proposedAttributes,
    unmappedTags,
    ignoredTags,
    ambiguousTags,
    reviewTags,
    historicalTagsPresent,
    staleTagsPresent,
    unknownTags,
    conflicts,
    contextualResolutions,
    combinationResolutions: [], // COMBINATION_RESOLVERS está vazio nesta rodada — ver comentário na declaração
    migrationStatus
  };
}

// Função principal — pura, determinística, sem side effects (seção 27).
// NUNCA lê window.DATA/localStorage/IndexedDB/Firestore; NUNCA chama
// saveData()/storage.set()/markSyncDirty()/pushToFirebaseNow()/
// writeShardedStateSerialized(); NUNCA muta data/taxonomy/tagMap recebidos.
function simulateTagToAttributesMigration(data, taxonomy, tagMap) {
  const lesions = Array.isArray(data) ? data : [];
  const results = lesions.map(lesion => simulateLesionMigration(lesion, taxonomy, tagMap));

  const summary = {
    lesionsAnalyzed: results.length,
    lesionsAutoReady: results.filter(r => r.migrationStatus === 'auto-ready').length,
    lesionsReviewRequired: results.filter(r => r.migrationStatus === 'review-required').length,
    lesionsNoStructuredMapping: results.filter(r => r.migrationStatus === 'no-structured-mapping').length,
    totalProposedItems: results.reduce((acc, r) => acc + r.proposedAttributes.length, 0)
  };

  const conceptCoverage = new Map(); // conceptId -> count de lesões
  const groupCoverage = new Map(); // groupId -> count de lesões (concepts distintos por lesão)
  const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));
  results.forEach(r => {
    const groupsTouchedThisLesion = new Set();
    r.proposedAttributes.forEach(p => {
      const cid = p.proposedItem.conceptId;
      conceptCoverage.set(cid, (conceptCoverage.get(cid) || 0) + 1);
      const concept = conceptById.get(cid);
      if (concept) groupsTouchedThisLesion.add(concept.group);
    });
    groupsTouchedThisLesion.forEach(gid => groupCoverage.set(gid, (groupCoverage.get(gid) || 0) + 1));
  });

  const allIssues = [];
  results.forEach(r => {
    r.conflicts.forEach(c => allIssues.push(Object.assign({ lesionId: r.lesionId, lesionName: r.lesionName }, c)));
    r.ambiguousTags.forEach(a => allIssues.push({ type: 'ambiguous-mapping', lesionId: r.lesionId, lesionName: r.lesionName, tag: a.tag, candidates: a.candidates, reason: a.reason }));
    r.reviewTags.forEach(rv => allIssues.push({ type: 'mapping-review-required', lesionId: r.lesionId, lesionName: r.lesionName, tag: rv.tag, reason: rv.reason }));
  });

  // Seção 18 do pedido: nenhum resolver pode operar silenciosamente — para
  // cada ruleId, soma de uso + lista de lesões atingidas + concept
  // resultante, sempre auditável no resultado agregado (não só por lesão).
  const resolverUsage = new Map(); // ruleId -> { ruleId, timesTriggered, lesionIds: [], resolvedConceptId }
  results.forEach(r => {
    r.contextualResolutions.forEach(res => {
      if (!resolverUsage.has(res.ruleId)) resolverUsage.set(res.ruleId, { ruleId: res.ruleId, timesTriggered: 0, lesionIds: [], resolvedConceptId: res.resolvedConceptId });
      const bucket = resolverUsage.get(res.ruleId);
      bucket.timesTriggered += 1;
      bucket.lesionIds.push(r.lesionId);
    });
  });

  return {
    metadata: {
      dryRun: true,
      writePerformed: false,
      taxonomyVersion: taxonomy.metadata.taxonomyVersion,
      taxonomyReleaseLabel: taxonomy.metadata.releaseLabel || null,
      generatedAt: null // nunca Date.now() real — ver seção 14; quem chama decide se quer timestampar o ENVELOPE do relatório, nunca os itens simulados
    },
    summary,
    lesions: results,
    conceptCoverage: Object.fromEntries(conceptCoverage),
    groupCoverage: Object.fromEntries(groupCoverage),
    issues: allIssues,
    resolverUsage: [...resolverUsage.values()]
  };
}

// ---------- Reconstrução de fixture a partir do snapshot vivo (seção 29/30) ----------
// Puramente read-only / diagnóstica: não é "DATA real", é uma RECONSTRUÇÃO a
// partir de TAXO03_LIVE_TAG_SNAPSHOT.json (tag -> lesões que a usam), útil só
// porque este ambiente não tem acesso ao DATA runtime real. NUNCA usa SEED.
function buildFixtureFromLiveSnapshot(snapshot) {
  const byLesionId = new Map();
  const warnings = [];
  Object.keys(snapshot.liveTags || {}).forEach(tag => {
    const entry = snapshot.liveTags[tag];
    (entry.lesions || []).forEach(ref => {
      if (!byLesionId.has(ref.id)) {
        byLesionId.set(ref.id, { id: ref.id, name: ref.name, s: ref.section, site: ref.site, tags: [] });
      }
      const lesion = byLesionId.get(ref.id);
      // Inconsistência de metadata entre ocorrências da MESMA lesão em tags
      // diferentes: nunca escolhida silenciosamente — mantém o primeiro
      // valor visto e registra warning explícito (seção 30).
      ['name', 'section', 'site'].forEach(field => {
        const current = field === 'section' ? lesion.s : lesion[field];
        const incoming = field === 'section' ? ref.section : ref[field];
        if (incoming != null && current != null && incoming !== current) {
          warnings.push({ lesionId: ref.id, field, kept: current, sawAlso: incoming, tag });
        }
      });
      if (!lesion.tags.includes(tag)) lesion.tags.push(tag);
    });
  });
  return { fixture: [...byLesionId.values()], warnings };
}

module.exports = {
  simulateTagToAttributesMigration,
  simulateLesionMigration,
  buildFixtureFromLiveSnapshot,
  dryRunItemId,
  validateConcept,
  resolveConcept,
  CONTEXTUAL_RESOLVERS,
  COMBINATION_RESOLVERS
};
