# TAXO-04C2 — Plano de apply (PURO, sem execução)

Rodada de planejamento. `tools/taxonomy-attributes-apply-plan.js` nunca
acessa `DATA`/`SEED`/`window`/`document`/`localStorage`/IndexedDB/
Firestore/`saveData` — recebe `data`/`migrationResult`/`taxonomy` só por
parâmetro, igual ao motor de dry-run. **Nenhuma escrita real ocorreu.**

## Baseline

| Campo | Valor |
|---|---|
| Fonte | `ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json` |
| lesionCount | 1210 |
| sourceDataSha256 | `f752b7381404cc4339eb4114213321c102737f53e0ef9ca389639b5667ab8541` |
| migrationResult | `TAXO04C1_FINAL_DRY_RUN.json` (READY FOR APPLY PREPARATION) |

## Resultado do PLAN 1 (estado atual — nenhuma lesão tem `attributes` ainda)

| Métrica | Valor |
|---|---|
| eligible (auto-ready, revalidado defensivamente) | **625** |
| blocked (auto-ready que falhou a revalidação defensiva) | **0** |
| review-required (nunca elegível) | 267 |
| no-structured-mapping (nunca elegível) | 318 |
| proposedItemsConsidered (só das 625 elegíveis) | **1131** |
| inserts previstos | **1131** |
| items preservados | 0 |
| duplicatas evitadas | 0 |
| conflitos com attributes existentes | 0 |

**Nota importante sobre os números**: o `TAXO04C1_FINAL_DRY_RUN.json`
reporta `totalProposedItems: 1381` como soma **global** (todas as
lesões, qualquer status). Esse total inclui **1131** itens das 625
lesões `auto-ready` + **250** itens de lesões `review-required` (que têm
proposedAttributes parciais, mas ficam bloqueadas por outro motivo — ex.:
uma tag `vascular` já mapeada na mesma lesão que também tem
`calcificações` ambíguo). O apply plan **só processa as 625 auto-ready**,
então seu total correto é **1131**, não 1381. Isso não é uma divergência
de bug — é a distinção entre "total do dry-run" e "total efetivamente
aplicável", e está destacado aqui para não ser confundido com erro.

## Detalhe por categoria

- **eligibleLesionIds**: 625 IDs únicos (lista completa em
  `TAXO04C2_APPLY_PLAN.json → eligibleLesionIds`).
- **blockedLesionIds**: 0 — nenhuma lesão marcada `auto-ready` pelo
  dry-run falhou a revalidação defensiva (conflicts/ambiguousTags/
  reviewTags/conceptId inexistente/violação de exclusividade). Confirma
  que o motor de dry-run e o planejador estão consistentes.
- **reviewRequiredIds**: 267 — nunca entram no plano.
- **noStructuredMappingIds**: 318 — nunca entram no plano.

## Idempotência — PASS

Simulação completa em memória (nunca em `DATA` real):

1. PLAN 1 sobre o baseline sem `attributes` → 625 elegíveis, 1131 inserts.
2. As mutations do PLAN 1 foram aplicadas **numa cópia** (`JSON.parse(JSON.stringify(data))`), nunca na `data` original.
3. PLAN 2 rodado sobre essa cópia já "pós-apply":

| Métrica | PLAN 2 |
|---|---|
| eligible | 625 (inalterado — migrationStatus não depende de `attributes` já existentes) |
| totalInserted | **0** |
| totalDuplicatesAvoided | **1131** (= totalInserted do PLAN 1) |

**→ IDEMPOTÊNCIA: PASS.** Reexecutar o plano depois de uma aplicação
anterior não gera nenhuma inserção nova para os conceitos já
materializados — cada item ativo existente é preservado, nunca
duplicado.

## Proteção de drift de baseline — PASS

`validateApplyBaseline(currentData, expectedBaseline)` testada contra:

| Cenário | Resultado |
|---|---|
| Sem nenhuma alteração | `ok: true`, `driftDetected: false` |
| 1 lesão removida (contagem muda) | `ok: false` — bloqueado |
| 1 campo de 1 lesão alterado (hash muda, contagem igual) | `ok: false` — bloqueado |
| 1 lesão adicionada (IDs novos) | `ok: false`, `idsAdded` lista o novo ID |
| 1 lesão removida (IDs faltando) | `ok: false`, `idsRemoved` lista o ID ausente |

**→ BASELINE DRIFT PROTECTION: PASS.** Qualquer drift — contagem, hash
ou conjunto de IDs — bloqueia o apply. Nunca há tentativa de reconciliar
silenciosamente; a função só reporta o problema.

## Auditoria de persistência futura (documentação — nada executado)

- `saveData()` grava localmente (`storage.set`) e marca `syncDirty`;
  `pushToFirebase()`/`pushToFirebaseNow()` chamam
  `writeShardedStateSerialized()` → `writeShardedState()`, que já
  implementa: validação (`validateCanonicalPayload`), escrita em chunks,
  **leitura de confirmação** (`deepStableEqual(readBack, snapshot)`) e
  **rollback automático** se o reconfirmado não bater com o que foi
  enviado.
- **Estratégia recomendada para o futuro apply real** (não implementada
  nesta rodada): mesclar TODAS as 625 mutations em memória primeiro,
  validar o resultado completo, e então fazer **UMA única chamada** de
  `saveData()`/`pushToFirebaseNow()` para o lote inteiro — nunca uma
  chamada por lesão. Isso evita estado parcialmente aplicado em caso de
  falha de rede/sincronização, e reaproveita o mecanismo de
  validação+readback+rollback que `writeShardedState()` já tem, sem
  precisar de nenhuma mudança nele.
- Imediatamente antes dessa futura chamada, `validateApplyBaseline` deve
  ser executado contra o `DATA` real **no momento exato do apply** (não
  só contra o backup de 1º de outubro) — se qualquer coisa mudou desde o
  checkpoint (nova lesão, edição, exclusão), o apply deve abortar.

## Estratégia de rollback (documentação — nada criado nesta rodada)

Já existem duas camadas de segurança (criadas em rodadas anteriores):

1. **Backup externo validado**: `ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json` (hash confirmado).
2. **Snapshot interno**: `snap_muqazoek_offohj` (IndexedDB local, reason "antes de aplicar migração de atributos taxonômicos", criado em 2026-10-02T01:47:41.516Z).

Recomendação para o momento real do apply (futuro, não executado agora):
criar um **NOVO** snapshot interno com a mesma `reason` **imediatamente
antes** da persistência real (não reaproveitar o `snap_muqazoek_offohj`
antigo, que pode já estar desatualizado se o tempo passou e `DATA` mudou)
— `createSafetySnapshot()` já aceita esse motivo (TAXO-04C0B). Se
`writeShardedState()` detectar readback divergente, seu próprio rollback
interno age primeiro; o `restoreSafetySnapshot(id)` manual continua
disponível como última linha de defesa, e ele mesmo tira um snapshot do
estado "falho" antes de sobrescrever, então nenhum estado é jamais
irrecuperável.

## `_userUpdatedAt` — estratégia documentada (nada escrito)

O Atlas usa `_userUpdatedAt` (timestamp) como critério de "qual cópia é
mais nova" em toda reconciliação local↔nuvem↔legado (`index.html`, várias
chamadas tipo `lt = Number(local._userUpdatedAt)||0`). Se o futuro apply
real escrever `attributes` numa lesão **sem** atualizar
`_userUpdatedAt`, uma reconciliação subsequente pode considerar a cópia
remota/legada mais "nova" por timestamp e **sobrescrever os `attributes`
recém-aplicados**. Estratégia correta a adotar na futura materialização:
ao escrever `attributes.items[]` numa lesão, também atualizar
`lesion._userUpdatedAt = Date.now()` **na mesma operação**, para que a
cópia com os attributes novos sempre vença qualquer reconciliação
seguinte. Isso é só documentado aqui — nenhum timestamp foi escrito nesta
rodada.

## O que NÃO foi criado nesta rodada (por instrução explícita)

- `executeTaxonomyAttributesApply()` — não existe.
- `applyTaxonomyAttributesToDATA()` — não existe.
- Botão/handler de UI para apply — não existe.
- Nenhuma chamada a `saveData()`/Firestore/IndexedDB/localStorage.
- Nenhum `createLesionReview()` chamado (conflitos ficam só registrados em `conflictsWithExisting`, sem criar review automaticamente).
- Nenhum novo snapshot interno criado.

## Testes

`tests/taxonomy-attributes-apply-plan.test.js` — 30/30 PASS, cobrindo os
27 pontos pedidos (elegibilidade, bloqueios defensivos, contagens reais
contra o backup validado, imutabilidade, zero persistência, merge com
attributes existentes, `allowMultipleInstances`, `deletedAt`, conflito
clínico, idempotência completa, proteção de drift em 4 cenários, e a
garantia de que nenhum itemId desta fase usa o padrão de produção real).

Suíte completa do projeto: **309/309 PASS, 0 regressões.**

## Confirmações

- Nenhum `DATA` real alterado.
- Nenhum `attributes` real criado.
- `saveData()` nunca chamado.
- Nenhum Firestore write.
- Nenhum IndexedDB write.
- Nenhum localStorage write.
- Nenhum apply executado.

Arquivos desta rodada (FASE B): `tools/taxonomy-attributes-apply-plan.js`
(novo), `tests/taxonomy-attributes-apply-plan.test.js` (novo),
`TAXO04C2_APPLY_PLAN_REPORT.md` (novo, este arquivo),
`TAXO04C2_APPLY_PLAN.json` (novo, operacional/local — grande e derivado,
untracked, mesmo padrão dos dry-runs anteriores).

**NÃO houve `git add`, `commit` ou `push` da FASE B.**
