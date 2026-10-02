# TAXO-04A — Relatório de dry-run da migração tags[] → attributes.items[]

**Esta é uma SIMULAÇÃO.** `metadata.dryRun = true`, `metadata.writePerformed = false`. Nenhuma lesão real foi alterada; nenhum `attributes` foi gravado; `tags[]` nunca é proposto para remoção (a migração, quando aplicada de verdade, será sempre aditiva).

**Fonte de dados:** fixture reconstruída, read-only, a partir de `TAXO03_LIVE_TAG_SNAPSHOT.json` (tag → lesões do runtime publicado) — **1208 lesões**, **0 avisos de inconsistência de metadata** na reconstrução. `SEED` não foi usado. `TAXONOMY.json` v1.1 (`taxonomyVersion=2`, `releaseLabel="1.1"`) e `TAG_TO_TAXONOMY_MAP.json` atuais.

---

## TOTAL

| | |
|---|---|
| Lesões analisadas | **1208** |
| `auto-ready` | **574** |
| `review-required` | **318** |
| `no-structured-mapping` | **316** |

## ATTRIBUTES

| | |
|---|---|
| Total de `proposedItem` (deduplicados por lesão+concept) | **1314** |
| Concepts distintos propostos em pelo menos 1 lesão | **46** de 207 |
| Concepts por domain | `radiologic`: 1047 · `etiology`: 169 · `demographics`: 96 · `clinical`: 2 |

### Top 30 concepts por número de lesões

| conceptId | label | lesões |
|---|---|---|
| `rad_margin_circumscribed` | circunscritas | 225 |
| `rad_comp_cystic` | cístico | 134 |
| `demo_age_pediatric` | pediátrica | 96 |
| `rad_enh_heterogeneous` | realce heterogêneo | 82 |
| `rad_assoc_edema` | edema | 79 |
| `etio_congenital` | congênito | 69 |
| `etio_traumatic` | traumático | 62 |
| `rad_enh_absent` | ausência de realce | 59 |
| `rad_vasc_hypervascular` | hipervascular | 50 |
| `rad_extent_multifocal` | multifocal | 46 |
| `rad_growth_infiltrative` | infiltrativo | 41 |
| `rad_growth_expansile` | expansivo | 36 |
| `rad_bonedensity_lytic` | lítico | 34 |
| `rad_comp_fatty` | gorduroso | 34 |
| `rad_enh_homogeneous` | realce homogêneo | 28 |
| `rad_enh_ring` | realce anelar | 28 |
| `rad_comp_complex_cyst` | cisto complexo | 23 |
| `etio_infectious` | infeccioso | 23 |
| `rad_comp_multiseptated` | multisseptado | 21 |
| `rad_bonedensity_sclerotic` | esclerótico | 21 |
| `rad_margin_illdefined` | mal definidas | 12 |
| `rad_vasc_hypovascular` | hipovascular | 11 |
| `rad_bonematrix_chondroid` | condroide | 11 |
| `rad_assoc_segmental_stenosis` | estenose segmentar | 11 |
| `rad_growth_sessile` | séssil | 9 |
| `rad_growth_eccentric` | excêntrico | 7 |
| `etio_inflammatory` | inflamatório | 7 |
| `rad_kinetics_washout` | washout | 6 |
| `rad_growth_exophytic` | exofítico | 6 |
| `rad_margin_lobulated` | lobuladas | 5 |

### Groups mais usados (por nº de lesões com ≥1 concept daquele group)

`radiologic.margins` 240 · `radiologic.enhancementMorphology` 199 · `radiologic.composition` 181 · `etiology.primary` 169 · `radiologic.associatedFindings` 108 · `demographics.ageGroup` 96 · `radiologic.growthPattern` 94 · `radiologic.enhancementVascularity` 61 · `radiologic.boneDensity` 55 · `radiologic.extent` 46 · `radiologic.boneMatrix` 11 · `radiologic.enhancementKinetics` 8 · `radiologic.periostealReaction` 4 · `clinical.evolution` 2 · `radiologic.regionalPattern` 1.

## TAGS (ocorrências, não lesões)

| status | ocorrências |
|---|---|
| `mapped` (geraram proposedAttribute) | 1322 |
| `ambiguous` | 325 |
| `review` | 39 |
| `unmapped` | 1843 |
| `ignored` | 15 |
| `historical` presente em DATA viva (inesperado) | 0 |
| `stale`/`decision-unapplied` presente em DATA viva | 0 |
| tag completamente desconhecida do mapa | 0 |

**0 tags históricas/stale apareceram em lesões vivas** — confirma que a reconciliação TAXO-03B está consistente com o snapshot: nenhuma tag arquivada "voltou" a aparecer como se fosse viva.

## CONFLICTS

| type | ocorrências |
|---|---|
| `exclusive-group-conflict` | **7** |
| `concept-conflict` | 0 (nenhum concept aprovado tem `conflictsWith` ainda) |
| `invalid-mapping` | 0 (todos os concepts/groups mapeados são estruturalmente válidos) |
| `deprecated-alias-issue` | 0 (nenhum concept é `deprecated` nesta baseline) |

### Os 7 `exclusive-group-conflict` (todos no mesmo padrão)

Todas as 7 ocorrências são o par `rad_bonedensity_lytic` + `rad_bonedensity_sclerotic` (group `radiologic.boneDensity`, `exclusive: true`) nas tags `"lítica"` + `"esclerótica"` coexistindo na mesma lesão:

| lesionId | lesionName |
|---|---|
| seed_44 | Doença de Paget óssea (vertebral) |
| seed_283 | Fibroma não ossificante |
| seed_46 | Osteoma osteoide vertebral |
| seed_560 | Metástases ósseas vertebrais |
| seed_578 | Mieloma múltiplo |
| seed_1088 | Osteomielite mandibular |
| seed_577 | Metástases ósseas |

**Achado real, não um bug do motor**: o group já tem um terceiro valor (`rad_bonedensity_mixed`, "misto") exatamente para este cenário — essas 7 lesões provavelmente deveriam ter sido tagueadas como "mista" em vez de carregar as duas tags opostas simultaneamente. Correção fica para decisão humana (nem o dry-run nem esta rodada alteram tags).

## REVIEW QUEUE (318 lesões)

### Por motivo (uma lesão pode aparecer em mais de uma categoria)

| motivo | lesões afetadas |
|---|---|
| `ambiguous` só por "sólido" | 30 |
| `ambiguous` por outro(s) motivo(s) | 253 |
| `exclusive-group-conflict` | 7 |
| `mapping.status = review` | 36 |

### Tags ambíguas, por frequência (lesões afetadas)

| tag | lesões | candidatos |
|---|---|---|
| calcificações | 75 | `rad_comp_calcified` / `rad_assoc_calcifications` |
| hemorrágico | 69 | `rad_comp_hemorrhagic` / `rad_assoc_hemorrhage` / `etio_hemorrhagic` |
| difuso | 46 | `rad_extent_diffuse` / `clin_dist_diffuse` / `clin_loc_diffuse_abdominal` |
| bilateral | 44 | `clin_lat_bilateral` / `rad_lat_bilateral` |
| **sólido** | **39** | `rad_comp_solid` / `rad_periosteal_solid` |
| necrótico | 22 | `rad_comp_necrotic` / `rad_assoc_necrosis` |
| calcificado | 10 | `rad_comp_calcified` / `rad_assoc_calcifications` |
| calcificação possível | 6 | idem |
| necrose possível | 4 | `rad_comp_necrotic` / `rad_assoc_necrosis` |
| unilateral | 2 | `clin_lat_unilateral` / `rad_lat_unilateral` |
| (demais variantes de hemorragia/necrose) | 6 | — |

**Destaque**: `"sólido"` é a tag de composição mais usada do catálogo (40 usos no total) e está **ambígua** por colisão de gênero gramatical com `rad_periosteal_solid` (reação periosteal "sólida") — isso sozinho bloqueia 39 lesões que, pelo contexto (a maioria tumores/massas, não achados de reação periosteal), muito provavelmente deveriam resolver para `rad_comp_solid`. Candidata natural a uma correção de regra de desambiguação numa fase futura (ex.: regra "ignorar candidato de `radiologic.periostealReaction` quando a lesão não tem nenhum outro indício ósseo/periosteal"), mas **não implementada automaticamente aqui** — exatamente o tipo de ajuste que deveria passar por aprovação humana explícita antes de mudar o comportamento do motor.

### Tags com `mapping.status = review`, por frequência

| tag | lesões |
|---|---|
| vascular | 20 |
| focal | 4 |
| central | 3 |
| aneurismática | 3 |
| atelectasia | 2 |
| arredondada | 2 |
| (demais, 1 lesão cada) | 5 |

### Amostra de lesões em revisão (15 primeiras, lista completa em `TAXO04A_MIGRATION_DRY_RUN.json`)

| lesionId | nome | seção/sítio | problema |
|---|---|---|---|
| seed_0 | Adenoma hipofisário (macroadenoma) | Neurorradiologia / Região selar | ambiguous: sólido |
| seed_2 | Meningioma do tubérculo selar | Neurorradiologia / Região selar | ambiguous: sólido |
| seed_15 | Meningioma | Neurorradiologia / Extra-axial / meninges | ambiguous: sólido, calcificações |
| seed_83 | Timoma | Tórax / Massa mediastinal | ambiguous: sólido |
| seed_108 | Mixoma atrial | Tórax / Coração e pericárdio | ambiguous: sólido |
| seed_115 | Papiloma intraductal | Mamas / Nódulo mamário | ambiguous: sólido |
| seed_157 | Tumor neuroendócrino pancreático | Abdômen Superior / Pâncreas | ambiguous: sólido |
| seed_162 | Carcinoma de células renais | Abdômen Superior / Rim | ambiguous: sólido |
| seed_210 | Fibroma / Fibrotecoma ovariano | Pelve Feminina / Ovário | ambiguous: sólido |
| seed_212 | Disgerminoma | Pelve Feminina / Ovário | ambiguous: sólido |
| seed_213 | Metástase ovariana (tumor de Krukenberg) | Pelve Feminina / Ovário | ambiguous: sólido, bilateral |
| seed_215 | Tumor de Sertoli-Leydig | Pelve Feminina / Ovário | ambiguous: sólido |
| seed_257 | Endometriose vesical | Pelve Masculina / Bexiga | ambiguous: sólido, hemorrágico |
| seed_356 | Tumor de Wilms (nefroblastoma) | Abdômen Superior / Rim | ambiguous: sólido |
| seed_360 | Hepatoblastoma | Abdômen Superior / Fígado | ambiguous: sólido |

---

## Observações finais

- **`unmapped` (1843 ocorrências) nunca bloqueou `auto-ready`** — confirmado: das 574 lesões `auto-ready`, muitas têm tags `unmapped`/`ignored` coexistindo com os concepts propostos, exatamente como pedido (seção 17).
- **316 lesões `no-structured-mapping`** não têm nenhuma tag `mapped` — continuam só com tags livres; nenhuma ação automática proposta para elas.
- Os **46 concepts distintos** que já cobririam ≥1 lesão hoje, de **207** existentes — confirma que a cobertura estrutural real do catálogo ainda é pequena relativa ao dicionário (consistente com `confirmedConceptCoverage` já reportado na TAXO-03D).
- Nenhum `concept-conflict` ou `invalid-mapping` apareceu — o dicionário em si está estruturalmente saudável; os únicos bloqueios reais vêm de ambiguidade textual pré-existente (família "sólido", "calcificações", "hemorrágico" etc., já documentada desde a TAXO-01) e do único par `lítica`/`esclerótica` genuinamente contraditório.
