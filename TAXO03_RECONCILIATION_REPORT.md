# TAXO-03B — Relatório de reconciliação (mapa offline × snapshot vivo publicado)

**Gerado em:** ver `metadata.reconciledAt` em `TAG_TO_TAXONOMY_MAP.json`
**Fonte de verdade de vivacidade nesta rodada:** `TAXO03_LIVE_TAG_SNAPSHOT.json` (runtime publicado, `dataTotalLesions: 1208`, `readOnly: true`)
**TAXONOMY.json:** não alterado (`approved`, 33 groups, 194 concepts)
**SEED:** não usado como fonte de verdade em nenhum ponto

---

## A. Universo

| | |
|---|---|
| Offline original (`TAG_AUDIT_DECISOES.csv`) | 664 |
| Live atual (snapshot) | 695 |
| `liveAndKnown` (offline ∩ live) | 640 |
| `liveOnly` (vivas, nunca auditadas estaticamente) | 55 |
| `offlineOnly` (offline, ausentes de DATA hoje) | 24 |

## B. Decisões reais (`atlasTagAuditDecisions`, todas as 39 decisões registradas)

| decision | aplicada | não aplicada |
|---|---|---|
| keep | — | 6 |
| review | — | 6 |
| edit | 10 | 0 |
| eliminate | 13 | 4 |

**archived/historical total: 23** (10 edit + 13 eliminate, todas com `appliedAt` confirmado e `usage atual = 0`). As 4 `eliminate` não aplicadas (`abdome agudo`, `abscesso`, `acrômio tipo III`, `atrofia muscular isolada`) **não** foram tratadas como eliminadas — `appliedAt` manda, não a presença/ausência da tag.

## C. Mapeamento vivo (695 tags)

| mapped | ambiguous | review | unmapped | ignored |
|---|---|---|---|---|
| 42 | 17 | 5 | 620 | 11 |

**Somente entre as 55 `liveOnly`:**

| liveOnlyMapped | liveOnlyAmbiguous | liveOnlyReview | liveOnlyUnmapped | liveOnlyIgnored |
|---|---|---|---|---|
| 1 | 0 | 0 | 53 | 1 |

## D. Cobertura (3 eixos, nunca misturados)

- **`confirmedConceptCoverage`** (só `mapping.status=mapped`, tag viva): **40**
- **`potentialConceptCoverage`** (`mapped` + `ambiguous.candidates` + `review.conceptIds`, vivo): **61**
- **`historicalConceptCoverage`** (concepts que só aparecem em tags históricas, nenhuma tag viva os referencia): **2** (`rad_sym_asymmetric`, `clin_sym_asymmetric` — vinham só de "assimétrico", hoje `historical-edited`)

## E. Gaps (recalculados só com tags vivas, `unmapped`)

| total | high (≥20) | medium (5–19) | low (1–4) |
|---|---|---|---|
| 620 | 22 | 40 | 558 |

## F. Top 30 gaps vivos por uso atual

| tag | usageCount | priority |
|---|---|---|
| bem circunscrita | 217 | high |
| margens irregulares | 153 | high |
| idade pediátrica | 96 | high |
| dilatação focal | 89 | high |
| hipersinal T2 | 76 | high |
| emergência | 73 | high |
| malformação congênita | 67 | high |
| trauma | 62 | high |
| RM | 42 | high |
| aumento de volume | 41 | high |
| crescimento lento | 38 | high |
| heterogêneo | 38 | high |
| malignidade | 36 | high |
| parede espessa | 35 | high |
| restrição à difusão | 30 | high |
| derrame associado | 29 | high |
| realce | 28 | high |
| hipossinal T2 | 26 | high |
| sólido-cístico | 23 | high |
| espessamento nodular | 22 | high |
| hipoecogênico | 21 | high |
| homogêneo | 20 | high |
| coleção | 18 | medium |
| realce periférico | 18 | medium |
| benignidade | 16 | medium |
| US | 16 | medium |
| espessamento focal | 15 | medium |
| hipersinal T1 | 14 | medium |
| falha de enchimento | 14 | medium |
| margens mal definidas | 12 | medium |

Os 9 gaps citados explicitamente no pedido foram reconfirmados com o **uso vivo atual** (não os números antigos do CSV estático): `bem circunscrita` 217, `margens irregulares` 153, `idade pediátrica` 96, `trauma` 62, `hipersinal T2` 76, `emergência` 73, `malformação congênita` 67, `RM` 42, `aumento de volume` 41 — todas confirmadas vivas e `unmapped`.

## G. Edits aplicados e inconsistências

10 de 10 auditados. **9 consistentes** (origem com `usage=0`, target existe exato em `liveTags`, `additionalTags` vazio em todos os 10). **1 inconsistência real:**

| tag origem | target | problema |
|---|---|---|
| `aterosclerótico` | `"degenerativo"` | existem **duas grafias vivas distintas e não unificadas**: `"degenerativo"` (usage 3) e `"Degenerativo"` (usage 1) — possível duplicata de caixa não mesclada no catálogo real. **Não corrigido automaticamente.** |

## H. Eliminates aplicados e inconsistências

13 de 13 auditados. **0 em CRITICAL REVIEW** — nenhum eliminate aplicado tem `usage atual > 0`; todos batem com `appliedCount` consistente.

## I. `caseVariantCandidates`

```json
[{ "values": ["degenerativo", "Degenerativo"], "usages": [3, 1] }]
```

Único grupo de variante real encontrado nas 695 tags vivas (mesma ocorrência do item G). Nenhuma tag foi renomeada/mesclada.

## J. `stale-unknown` / `decision-unapplied`

| tag | catalogState | observação |
|---|---|---|
| `abscesso` | decision-unapplied | eliminate registrada, nunca aplicada; ausente de DATA — motivo não presumido |
| `abdome agudo` | decision-unapplied | idem |
| `acrômio tipo III` | decision-unapplied | idem |

**Nenhuma tag `stale-unknown` pura** (ausente + sem decisão alguma) foi encontrada nesta rodada — as 24 `offlineOnly` se dividem exatamente em 21 históricas (aplicadas) + 3 `decision-unapplied` (nunca aplicadas).

---

## Observação de transparência (achado desta rodada)

A tag `apêndice dilatado` é simultaneamente **`live-only`** (nunca esteve no `TAG_AUDIT_DECISOES.csv` original) **e** tem `decision: "review"` registrada no runtime. Por regra explícita desta rodada, `catalogState` assume o valor `"review-human"` nesse caso (prioridade sobre `"live-only"`); a informação de que a tag também é `live-only` foi preservada à parte no campo `isLiveOnly: true` de sua entrada em `mappings`, para não se perder por causa do override de `catalogState`.
