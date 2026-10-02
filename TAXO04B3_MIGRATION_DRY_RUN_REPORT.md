# TAXO-04B3 — Aplicação das decisões aprovadas (TAXO-04B2) + dry-run final comparativo

Rodada de aplicação real, mas **só ao mapa de taxonomia**
(`TAG_TO_TAXONOMY_MAP.json`), nunca a `DATA`/tags de lesões reais/`SEED`.
Nenhum `attributes` real foi criado — tudo roda sobre a fixture
reconstruída (read-only) de `TAXO03_LIVE_TAG_SNAPSHOT.json`, como nas
rodadas anteriores.

## 1. O que foi aplicado

Em `TAG_TO_TAXONOMY_MAP.json`, exatamente as 5 decisões aprovadas na
adjudicação TAXO-04B2 (`TAXO04B2_RULE_ADJUDICATION.json`):

1. **`espiculada`** — corrigido de `rad_periosteal_spiculated` para
   `rad_margin_spiculated`. Audit trail preservado em
   `mapping.correctionHistory[0]` (concept/confidence/notes anteriores +
   motivo da correção) e `mapping.decisionSource: "TAXO-04B2"`.
2. **`vascular`** — promovido de `review` para `mapped` →
   `etio_vascular`.
3. **`focal`** — promovido de `review` para `mapped` →
   `rad_extent_focal`.
4. **`central`** — promovido de `review` para `mapped` →
   `rad_position_central`.
5. **`crônico`** — promovido de `review` para `mapped` →
   `clin_tc_chronic`.

Cada uma das 4 promoções manteve `notes` original e anexou o registro da
promoção com referência à TAXO-04B2. `coverage.confirmedConceptCoverage`/
`potentialConceptCoverage`/`conceptsWithoutLegacyTag` foram recalculados
do zero a partir dos mappings atuais (não apenas ajustados incrementalmente),
e verificados como uma partição exata dos 207 concepts da TAXONOMY.json
(`confirmed ⊆ potential`, `potential ∩ historical = ∅`,
`potential ∪ historical ∪ withoutLegacyTag = 207 concepts`).

`tools/taxonomy-migration-dry-run.js`: **nenhuma mudança de lógica**. Só a
`description` do resolver `resolve-solid-composition-v1` foi atualizada
(comentário) para registrar que a melhora observada vem da correção do
dado de entrada, não de uma mudança na regra. Confirmado por teste
(`tests/taxonomy-migration-dry-run.test.js`, teste 8 da seção 04B3):
`appliesTo`/`resolve` nunca mencionam `seed_563`/`seed_568` em código.

**Nenhuma tag real de lesão foi alterada. Nenhum `attributes` foi criado.
`DATA`/`SEED`/`index.html`/`openForm` intocados.**

## 2. DELTA 04A → 04B → 04B3

Mesma fixture (1208 lesões) nas 3 rodadas.

| Métrica | 04A | 04B | 04B3 |
|---|---|---|---|
| auto-ready | 574 | 601 | **625** |
| review-required | 318 | 291 | **267** |
| no-structured-mapping | 316 | 316 | 316 |
| totalProposedItems | 1314 | 1351 | **1381** |
| exclusive-group-conflict | 7 | 7 | 7 |
| ocorrências ambíguas não resolvidas | 325 | 288 | **286** |
| ocorrências em review não resolvidas | 39 | 39 | **11** |

A melhora 04B→04B3 veio de duas fontes combinadas: (a) a correção de
`"espiculada"` liberou os 2 últimos bloqueios de `"sólido"` (resolver
chegou a 39/39); (b) a promoção de `vascular`/`focal`/`central`/`crônico`
removeu 28 ocorrências da fila de review. No total, **24 lesões únicas**
mudaram de `review-required` para `auto-ready` entre 04B e 04B3 (algumas
lesões tinham mais de uma das tags promovidas, por isso 24 e não 30).

## 3. `resolve-solid-composition-v1` — resultado final

**39/39** ocorrências de `"sólido"` resolvidas para `rad_comp_solid`
(antes: 37/39). As 2 recusas anteriores (`seed_563`, `seed_568`)
desapareceram **sem qualquer alteração na lógica do resolver** — a regra
já estava correta; o problema era o sinal de entrada (`"espiculada"`
apontando para o group ósseo errado). Isso confirma a adjudicação da
TAXO-04B2 (seção C): o bloqueio era causado pelo mapeamento, não por uma
limitação da regra.

## 4. Validação de `"espiculada"`

| lesionId | nome | antes (04B) | depois (04B3) |
|---|---|---|---|
| seed_78 | Carcinoma broncogênico | `rad_periosteal_spiculated` (direto) | `rad_margin_spiculated` (direto) |
| seed_510 | Carcinoma tubular da mama | `rad_periosteal_spiculated` (direto) | `rad_margin_spiculated` (direto) |
| seed_563 | Adenocarcinoma pulmonar | bloqueava `"sólido"` (ambíguo) | `rad_margin_spiculated` + `rad_comp_solid` (ambos auto-ready) |
| seed_568 | Carcinoma ductal invasivo/NST | bloqueava `"sólido"` (ambíguo) | `rad_margin_spiculated` + `rad_comp_solid` (ambos auto-ready) |

**Confirmado**: as 4 ocorrências agora propõem `rad_margin_spiculated`.
**Zero** ocorrências propõem `rad_periosteal_spiculated`.

## 5. Validação dos 4 global mappings promovidos

| Tag | Ocorrências | Viraram `proposedAttribute` |
|---|---|---|
| `vascular` | 20 | **20/20** |
| `focal` | 4 | **4/4** |
| `central` | 3 | **3/3** |
| `crônico` | 1 | **1/1** |

100% de cobertura nas 4 famílias, como previsto pela auditoria da
TAXO-04B2 (nenhuma ocorrência discordante).

## 6. Fila de revisão manual restante (top motivos, 04B3)

**Ambíguos** (inalterado — nenhuma destas tem resolver, por decisão
deliberada da TAXO-04B2):

| Tag | Ocorrências |
|---|---|
| `calcificações` | 75 |
| `hemorrágico` | 69 |
| `difuso` | 46 |
| `bilateral` | 44 |
| `necrótico` | 22 |

(demais variantes de baixa frequência — `calcificado`, `calcificação
possível`, `necrose possível`, `unilateral`, `hemorragia possível`,
`cap hemorrágico`, `risco de necrose avascular`, `risco hemorrágico`,
`hemorrágico crônico`, `necrose`, `calcificação intratendínea` — já
existiam nas rodadas anteriores; só ficaram mais visíveis no ranking
agora que `"sólido"` saiu do topo.)

**Review** (reduzido de 39 para **11** ocorrências — os resíduos abaixo
nunca foram tocados por esta rodada, fora do escopo aprovado):
`aneurismática`(3), `atelectasia`(2), `arredondada`(2), `alargamento
fisário`(1), `periférico`(1), `"2ª e 3ª metacarpofalângicas"`(1),
`apêndice dilatado`(1).

**Conflito exclusivo lítica+esclerótica**: inalterado, as mesmas **7**
lesões (`seed_44`, `seed_283`, `seed_46`, `seed_560`, `seed_578`,
`seed_1088`, `seed_577`) permanecem `exclusive-group-conflict`. Nenhuma
resolução automática para `rad_bonedensity_mixed`.

**Total `review-required` (04B3): 267** (era 291 na 04B, 318 na 04A).

## 7. Provenance

Confirmado por teste (`tests/taxonomy-migration-dry-run.test.js`, teste
11 da seção 04B3): um `proposedAttribute` vindo de um global mapping
promovido (ex.: `vascular`→`etio_vascular`) tem
`provenance.resolutionType: "direct"` e `provenance.mappingStatus:
"mapped"` — nunca `"contextual-rule"`, que é reservado para os
resolvidos via `CONTEXTUAL_RESOLVERS` (ex.: `resolve-solid-composition-v1`).
Os dois caminhos de provenance nunca se confundem.

## 8. Testes

`tests/taxonomy-migration-dry-run.test.js`: nova seção "TAXO-04B3 —
aplicação real das decisões TAXO-04B2" com os 20 pontos pedidos, usando
os arquivos REAIS pós-aplicação (não fixture sintética): espiculada
mapeia corretamente (1-2), os 4 global mappings cobrem 100% (3-6), o
resolver de sólido continua funcionando e os 2 bloqueios desaparecem sem
hardcode (7-8), as 5 famílias manuais continuam sem resolver (9), lítica+
esclerótica continua conflito (10), provenance correta (11), determinismo
e imutabilidade sobre dados reais (12-13), zero persistência/DATA/SEED/
Firestore/IndexedDB/localStorage (14-19), nenhuma tag removida (20).

Suíte completa de taxonomia:

```
tests 241
pass 241
fail 0
```

**0 regressões.**

## 9. MIGRATION DRY-RUN ENGINE BASELINE READY

Todos os critérios desta rodada foram satisfeitos sem nenhuma regressão:
as decisões aprovadas na TAXO-04B2 foram aplicadas somente ao mapa; o
motor (`tools/taxonomy-migration-dry-run.js`) não precisou de nenhuma
mudança de lógica para refletir a melhora (confirmando que o resolver
`resolve-solid-composition-v1` estava correto desde a TAXO-04B); as 24
lesões liberadas, as 39/39 resoluções de "sólido" e os 28 slots de review
eliminados emergiram inteiramente dos dados corrigidos; os conflitos e
ambiguidades mantidos manuais permanecem exatamente como adjudicado.

**→ MIGRATION DRY-RUN ENGINE BASELINE READY.**

Isso é uma marcação de prontidão técnica, não uma publicação: por
instrução explícita desta rodada, **não há commit/push nesta etapa** — o
resultado fica para revisão humana antes de qualquer decisão de
congelamento formal/versionamento.

## 10. Confirmações

- `index.html`: intocado.
- `TAXONOMY.json`: intocado.
- `DATA` / `SEED` / Firestore / IndexedDB / `localStorage`: intocados.
- Nenhuma tag real de lesão foi alterada; nenhuma lesão recebeu
  `attributes` reais.
- `saveData()`: nunca chamado.

Arquivos desta rodada: `TAG_TO_TAXONOMY_MAP.json` (modificado — as 5
decisões aprovadas aplicadas), `tools/taxonomy-migration-dry-run.js`
(modificado — só comentário/descrição, zero lógica), `tests/taxonomy-
migration-dry-run.test.js` (modificado — 20 novos testes),
`TAXO04B3_MIGRATION_DRY_RUN.json` (novo),
`TAXO04B3_MIGRATION_DRY_RUN_REPORT.md` (novo, este arquivo).
`TAXO04A_MIGRATION_DRY_RUN.json`/`TAXO04B_MIGRATION_DRY_RUN.json` e seus
relatórios preservados como baseline histórica de comparação — não
versionar nenhum dos três JSONs operacionais ainda, por instrução
explícita.

**NÃO houve `git add`, `commit` ou `push` nesta rodada.**
