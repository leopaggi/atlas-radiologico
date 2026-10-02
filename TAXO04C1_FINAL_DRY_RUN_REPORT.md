# TAXO-04C1 — Dry-run final sobre o backup validado (1210 lesões)

Rodada read-only. Fonte exclusiva: `ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json`
(nunca `TAXO03_LIVE_TAG_SNAPSHOT.json`, `SEED` ou `DATA` runtime). Nenhuma
escrita real — `writePerformed: false` em todo o resultado.

## A. Fonte e hashes

| Campo | Valor |
|---|---|
| Arquivo | `ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json` |
| lesionCount | 1210 |
| dataSha256 | `f752b7381404cc4339eb4114213321c102737f53e0ef9ca389639b5667ab8541` |
| fileSha256 | `3d180146b8a1a007eedaf8b45b54f5386099d3cce1e30b9653a396011c5451b5` |
| atlasCommit | `78e23f27461f3e508821535a34f57ef0fb3b0774` |
| taxonomyVersionAtBackup | 2 |
| Revalidação antes do dry-run | **PASS** (0 problemas — `tools/validate-pre-attributes-backup.js`) |

## B. As 2 lesões novas (1210 − 1208)

Nenhum ID removido em relação à fixture histórica de 1208 (conjunto 1208 ⊆
1210). As 2 lesões novas:

| lesionId | nome | seção/sítio | tags | migrationStatus |
|---|---|---|---|---|
| `u_1790890532092_864tji` | Doença de Freiberg | Musculoesquelético/Tornozelo e Pé | **nenhuma** (`[]`) | `no-structured-mapping` |
| `u_1790891751067_e7bizb` | Bursite adventícia | Musculoesquelético/Tornozelo e Pé | **nenhuma** (`[]`) | `no-structured-mapping` |

Ambas foram cadastradas sem nenhuma tag radiológica/clínica ainda — por
isso caem exatamente em `no-structured-mapping` (nenhum `proposedAttribute`,
nenhuma ambiguidade, nenhum review, nenhum conflito). Isso explica
totalmente o delta da seção C: **+2 em `no-structured-mapping`, 0 em todo
o resto** — não por coincidência "+2 linear", mas porque as duas lesões
realmente não têm nenhum sinal de entrada para o motor processar.

## C. Delta 1208 (baseline histórica TAXO-04B3) → 1210 (TAXO-04C1)

| Métrica | 1208 (04B3) | 1210 (04C1) | Delta |
|---|---|---|---|
| auto-ready | 625 | 625 | 0 |
| review-required | 267 | 267 | 0 |
| no-structured-mapping | 316 | **318** | **+2** |
| proposedItems | 1381 | 1381 | 0 |
| exclusive-group-conflict | 7 | 7 | 0 |
| ambíguos não resolvidos | 286 | 286 | 0 |
| review não resolvidos | 11 | 11 | 0 |

## D. Contagens finais (1210)

- **auto-ready: 625**
- **review-required: 267**
- **no-structured-mapping: 318**
- **totalProposedItems: 1381**

## E. Conflitos

- `exclusive-group-conflict`: **7** (lítica+esclerótica, inalterado — as mesmas 7 lesões da TAXO-04B/B3).
- `concept-conflict`: **0**.
- `invalid-mapping`: **0** — nenhum conceptId inexistente, nenhum erro de alias.

## F. Ambiguidades (manuais, inalteradas)

| Tag | Ocorrências |
|---|---|
| `calcificações` | 75 |
| `hemorrágico` | 69 |
| `difuso` | 46 |
| `bilateral` | 44 |
| `necrótico` | 22 |

Nenhuma das 2 lesões novas carrega qualquer uma destas tags (elas não têm
tags), então estas contagens são **idênticas** às da TAXO-04B3.

## G. Review mappings (resíduo, inalterado)

`atelectasia`(2), `aneurismática`(3), `periférico`(1), `arredondada`(2),
`alargamento fisário`(1), `"2ª e 3ª metacarpofalângicas"`(1), `apêndice
dilatado`(1) — total **11**, igual à TAXO-04B3.

## H. Concept coverage

- **51 concepts únicos** cobertos de 207 (24,6%).
- **16 groups** usados.
- Nenhuma mudança em relação à TAXO-04B3 (as 2 lesões novas, sem tags, não
  acrescentam cobertura).

## I. Top 30 concepts (por nº de lesões)

`rad_margin_circumscribed`(225), `rad_comp_cystic`(134),
`demo_age_pediatric`(96), `rad_enh_heterogeneous`(82),
`rad_assoc_edema`(79), `etio_congenital`(69), `etio_traumatic`(62),
`rad_enh_absent`(59), `rad_vasc_hypervascular`(50),
`rad_extent_multifocal`(46), `rad_growth_infiltrative`(41),
`rad_comp_solid`(39), `rad_growth_expansile`(36), `rad_comp_fatty`(34),
`rad_bonedensity_lytic`(34), `rad_enh_homogeneous`(28), `rad_enh_ring`(28),
`rad_comp_complex_cyst`(23), `etio_infectious`(23),
`rad_comp_multiseptated`(21), `rad_bonedensity_sclerotic`(21),
`etio_vascular`(20), `rad_margin_illdefined`(12),
`rad_bonematrix_chondroid`(11), `rad_vasc_hypovascular`(11),
`rad_assoc_segmental_stenosis`(11), `rad_growth_sessile`(9),
`rad_growth_eccentric`(7), `etio_inflammatory`(7), `rad_kinetics_washout`(6).

## J. Fila de revisão final

Idêntica à seções F/G acima — nenhuma mudança trazida pelas 2 lesões
novas. Total `review-required`: **267**.

## Regra de aplicação (seção 12 do pedido) — validada por teste

Confirmado por `tests/taxonomy-final-dry-run.test.js`: **somente**
lesões com `migrationStatus === "auto-ready"` são elegíveis para receber
`attributes` automaticamente numa futura aplicação real.
`review-required` e `no-structured-mapping` nunca são elegíveis — essa
regra é verificada sobre o resultado real das 1210 lesões, não apenas em
fixture sintética.

## Critério de prontidão

| Critério | Resultado |
|---|---|
| invalid-mapping | 0 |
| alias error | 0 |
| conceptId inexistente | 0 |
| erro estrutural | 0 |
| mutação do input | nenhuma (`data1210` idêntico antes/depois) |
| output determinístico | sim (2 execuções idênticas) |
| backup hash confirmado | sim (dataSha256 e fileSha256 PASS) |

Conflitos manuais conhecidos (lítica+esclerótica, 5 famílias ambíguas, 7
tags review residuais) **não impedem** a prontidão — todas essas lesões
ficam corretamente em `review-required`, nunca em `auto-ready`.

**→ FINAL DRY-RUN READY FOR APPLY PREPARATION.**

## Testes

`tests/taxonomy-final-dry-run.test.js` (novo) cobre: contagem do backup
(1210), hash correto, os 2 IDs novos identificados e caracterizados,
engine alimentado com `parsed.data` do backup (não com a fixture
histórica), `auto-ready` reconhecido corretamente, `review-required` e
`no-structured-mapping` nunca elegíveis para apply automático,
ambiguidades manuais conhecidas continuam bloqueadas, conflito exclusivo
lítica+esclerótica continua bloqueado, zero persistência/DATA/SEED/
Firestore/IndexedDB/localStorage, determinismo, imutabilidade do backup
de entrada.

## Confirmações

- Backup externo: intocado (só leitura).
- `DATA`/`SEED`/`index.html`/`openForm`: intocados.
- Firestore/IndexedDB/localStorage: intocados.
- Nenhuma lesão recebeu `attributes` reais.
- `saveData()`: nunca chamado.

Arquivos desta rodada: `TAXO04C1_FINAL_DRY_RUN.json` (novo),
`TAXO04C1_FINAL_DRY_RUN_REPORT.md` (novo, este arquivo),
`tests/taxonomy-final-dry-run.test.js` (novo), `TAXO04C0_SAFETY_CHECKPOINT.json`
(atualizado — somente o bloco `internalSnapshot`, hashes externos
inalterados).

**NÃO houve `git add`, `commit` ou `push` nesta rodada.**
