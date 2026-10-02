# TAXO-04B — Refinamento do dry-run com regras contextuais seguras

Rodada read-only. Nenhuma lesão real foi alterada, nenhum `attributes` foi
gravado, `TAG_TO_TAXONOMY_MAP.json` permanece intocado nesta rodada. Esta
rodada constrói sobre a base da TAXO-04A (`TAXO04A_MIGRATION_DRY_RUN.json`,
preservado como baseline de comparação) adicionando uma camada separada de
`CONTEXTUAL_RESOLVERS` em `tools/taxonomy-migration-dry-run.js`.

## 1. DELTA TAXO-04A → TAXO-04B

Fixture idêntica (1208 lesões, reconstruída de `TAXO03_LIVE_TAG_SNAPSHOT.json`,
0 warnings de reconstrução).

| Métrica | 04A | 04B | Delta |
|---|---|---|---|
| auto-ready | 574 | 601 | **+27** |
| review-required | 318 | 291 | **-27** |
| no-structured-mapping | 316 | 316 | 0 (esperado — resolvers não atuam aqui) |
| totalProposedItems | 1314 | 1351 | **+37** |
| exclusive-group-conflict (issues) | 7 | 7 | 0 (lítica+esclerótica — ver seção 4) |
| concept-conflict (issues) | 0 | 0 | 0 |
| invalid-mapping (issues) | 0 | 0 | 0 |
| ocorrências ambíguas não resolvidas | 325 | 288 | **-37** |
| ocorrências em review não resolvidas | 39 | 39 | 0 (nenhum resolver atua em `review` nesta rodada) |

27 lesões mudaram `migrationStatus` de `review-required` → `auto-ready`
(lista completa nos dados gerados; exemplos: `seed_0` Adenoma hipofisário,
`seed_2` Meningioma do tubérculo selar, `seed_1094` Craniofaringioma
papilar, entre outras). As outras 10 ocorrências resolvidas (37 − 27)
pertencem a lesões que já tinham outro motivo de review-required
independente (ex.: também carregam `vascular` ou outra tag em `review`),
então o resolver eliminou a ambiguidade do "sólido" mas a lesão permaneceu
`review-required` por outro motivo — o que é o comportamento correto.

## 2. Resolver contextual — detalhe por regra

### `resolve-solid-composition-v1`

- **Descrição**: a tag `"sólido"` casa ambiguamente com dois concepts na
  baseline v1 (`rad_comp_solid`, domínio `radiologic.composition`, e
  `rad_periosteal_solid`, domínio `radiologic.periostealReaction`) via
  `normalizedMatch`. Nos 39 casos ambíguos da TAXO-04A, nenhuma lesão é
  primariamente óssea — o match com `rad_periosteal_solid` é um artefato de
  normalização de synonym, não uma leitura radiológica real.
- **Regra**: resolve para `rad_comp_solid` SE E SOMENTE SE nenhuma outra tag
  já resolvida da mesma lesão (1ª passada) tiver concept em
  `radiologic.boneDensity`, `radiologic.boneMatrix` ou
  `radiologic.periostealReaction`. Se houver qualquer concept nesses 3
  groups, o resolver recusa e a tag permanece ambígua (fallback = manter
  ambiguidade, nunca resolver "no escuro").
- **Uso**: **37 de 39** ocorrências resolvidas → `rad_comp_solid`.
- **2 ocorrências permanecem ambíguas** (o resolver foi tentado e recusou
  corretamente): `seed_563` (Adenocarcinoma pulmonar) e `seed_568`
  (Carcinoma ductal invasivo/NST). Ambas carregam a tag `"espiculada"`, que
  hoje resolve (por um mapeamento pré-existente, fora do escopo desta
  rodada — ver seção 5) para `rad_periosteal_spiculated`
  (`radiologic.periostealReaction`). Isso dispara o guard de contexto ósseo
  e o resolver corretamente recusa resolver "sólido" para essas 2 lesões,
  mantendo-as em `review-required`. Este é o comportamento desejado da
  regra "NO CHANGE IS SAFER": mesmo alimentado por um sinal que é, ele
  próprio, um mapeamento imperfeito, o resolver nunca resolveu de forma
  insegura — ele simplesmente ficou mais conservador, que é o lado seguro
  do erro.
- **Lesões afetadas**: lista completa de 37 `lesionId`s em
  `TAXO04B_MIGRATION_DRY_RUN.json → resolverUsage[0].lesionIds`.
- **Resultado**: `rad_comp_solid` (único concept de destino desta regra).

### `COMBINATION_RESOLVERS` — nenhuma regra ativa (decisão deliberada)

Avaliada e **rejeitada** nesta rodada: combinar `"lítica"` + `"esclerótica"`
(7 lesões em conflito de grupo exclusivo `radiologic.boneDensity`) em
`rad_bonedensity_mixed`.

Motivo da rejeição:
- 3 das 7 lesões carregam também a tag `"multifocal"` — doença multifocal
  pode legitimamente ter focos líticos e escleróticos independentes em
  sítios diferentes; colapsar em um único concept "misto" misrepresentaria
  a lesão.
- Das 4 restantes (não-multifocais), pelo menos 2 (Fibroma não ossificante,
  Osteoma osteoide) são padrões clássicos de "lesão lítica com borda/nicho
  escleróticos" — NÃO são verdadeiramente lesões de densidade mista — e as
  outras 2 (Paget, Osteomielite) são candidatas plausíveis a "misto"
  genuíno. Distinguir esses dois subgrupos exigiria conhecimento clínico
  específico do diagnóstico, que esta tarefa proíbe explicitamente como
  base de regra.
- Como nenhum sinal contextual seguro e independente de diagnóstico separa
  os dois subgrupos, a regra foi rejeitada por completo. As 7 lesões
  permanecem com `exclusive-group-conflict` (issue), exatamente como na
  TAXO-04A (0 mudança).
- A infraestrutura de dedup/conflito já suporta genericamente uma futura
  regra de combinação, se/quando aprovada por um humano (comprovado por
  teste estrutural dedicado, sem necessidade de código novo).

## 3. `globalMappingProposal`s — candidatos a mapeamento global (requer aprovação humana)

Nenhum destes foi aplicado a `TAG_TO_TAXONOMY_MAP.json`. São propostas para
decisão humana em uma rodada futura.

| Tag (status atual: `review`) | Ocorrências | Consistência | Concept proposto |
|---|---|---|---|
| `vascular` | 20/20 | 100% — todas são processos de origem vascular (aneurismas, dissecções, tromboses, infartos) | `etio_vascular` |
| `focal` | 4/4 | 100% | `rad_extent_focal` |
| `central` | 3/3 | 100% | `rad_position_central` |
| `crônico` | 1/1 | 100%, mas N=1 (confiança baixa por amostra única) | `clin_tc_chronic` |

Essas 4 famílias foram auditadas tag a tag (seção/sítio/nome/tags
coocorrentes) e não apresentaram nenhuma ocorrência discordante — por isso
são candidatas fortes a passar de `review` para `mapped` globalmente, mas
isso é uma mudança na baseline de mapeamento e, por instrução explícita
desta rodada, não pode ser decidida/aplicada aqui.

## 4. Ambiguidades mantidas (sem resolver, decisão deliberada)

Auditadas com amostras representativas (seção/sítio/tags coocorrentes) e
mantidas ambíguas por não apresentarem sinal contextual seguro e
independente de diagnóstico:

| Tag | Ocorrências (04B, inalterado vs 04A) | Motivo de manter ambíguo |
|---|---|---|
| `calcificações` | 75 | Uso real misto; sem sinal estrutural que distinga os concepts candidatos sem inferir diagnóstico |
| `hemorrágico` | 69 | Idem |
| `difuso` | 46 | Idem |
| `bilateral` | 44 | Mesmos dados fonte já carregam ambiguidade/hedging (ex.: lesão com `"bilateral"` E `"bilateral possível"` simultaneamente) |
| `necrótico` | 22 | Idem |

`sólido` caiu de 39 → **2** ocorrências ambíguas restantes (ver seção 2).

## 5. Achado de transparência (fora do escopo de correção desta rodada)

A tag `"espiculada"` resolve hoje, via o tier `normalizedMatch` do mapa
existente, exclusivamente para `rad_periosteal_spiculated` (forma singular
casando exatamente com o synonym normalizado), em vez de ser corretamente
marcada ambígua contra `rad_margin_spiculated` (forma plural
"espiculadas" — o fold de gênero do mapa só remove `o`/`a` finais, não a
flexão de plural). Isso foi descoberto como efeito colateral da auditoria
do resolver `resolve-solid-composition-v1` (as 2 lesões que permanecem
ambíguas para "sólido" o fazem por causa deste mapeamento pré-existente).
Não foi alterado nesta rodada — está fora do escopo (`TAG_TO_TAXONOMY_MAP.json`
intocado) e é reportado apenas como achado para uma futura rodada de
correção do mapa.

## 6. Conflitos restantes

- **7 `exclusive-group-conflict`** (lítica + esclerótica em
  `radiologic.boneDensity`) — inalterado, ver seção 2.
- **0 `concept-conflict`** (via `conflictsWith`) — inalterado.
- **0 `invalid-mapping`** — inalterado.

## 7. Fila de revisão refinada (top motivos restantes, 04B)

Ambíguos: `calcificações` 75, `hemorrágico` 69, `difuso` 46, `bilateral` 44,
`necrótico` 22, `sólido` 2 (demais tags com contagens baixas, inalteradas).

Review: `vascular` 20, `focal` 4, `central` 3, `crônico` 1 (inalterado —
nenhum resolver atua em tags `review` nesta rodada, por decisão
deliberada).

**Total `review-required` (04B): 291** (era 318 na 04A).

## 8. Testes

Suíte completa de taxonomia (`taxonomy-v1-structure`, `taxonomy-panel`,
`taxonomy-tag-map`, `taxonomy-gap-decisions`, `taxonomy-migration-dry-run`):

```
tests 205
pass 205
fail 0
```

0 regressões. `tests/taxonomy-migration-dry-run.test.js` isoladamente:
48/48 (26 da TAXO-04A + 20 novos da TAXO-04B + 2 extras), incluindo os
testes que isolam textualmente apenas a região de código dos resolvers
(`CONTEXTUAL_RESOLVERS`/`COMBINATION_RESOLVERS`) para garantir ausência de
`saveData`/`SEED`/`DATA`/`localStorage`/Firestore/IndexedDB também nessa
região específica.

## 9. Confirmações

- `index.html`: intocado.
- `TAXONOMY.json`: intocado.
- `TAG_TO_TAXONOMY_MAP.json`: intocado nesta rodada.
- `DATA` / `SEED` / Firestore / IndexedDB / `localStorage`: intocados;
  nenhuma referência nos arquivos desta rodada.
- `saveData()`: nunca chamado.
- Nenhuma lesão recebeu `attributes` reais — toda a simulação roda sobre
  uma fixture read-only reconstruída de `TAXO03_LIVE_TAG_SNAPSHOT.json`.

Arquivos desta rodada: `tools/taxonomy-migration-dry-run.js` (modificado —
camada de resolvers contextuais adicionada), `tests/taxonomy-migration-dry-run.test.js`
(modificado — 20 novos pontos), `TAXO04B_MIGRATION_DRY_RUN.json` (novo),
`TAXO04B_MIGRATION_DRY_RUN_REPORT.md` (novo, este arquivo).
`TAXO04A_MIGRATION_DRY_RUN.json`/`TAXO04A_MIGRATION_DRY_RUN_REPORT.md`
preservados como baseline de comparação.

**NÃO houve `git add`, `commit` ou `push` nesta rodada.**
