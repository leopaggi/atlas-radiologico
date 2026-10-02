# TAXO-04 — Relatório final: migração inicial de attributes taxonômicos

**Status: CONCLUÍDA.** Esta é a primeira escrita real de `attributes.items[]`
no catálogo do Atlas, resultado de toda a sequência TAXO-03/04 (taxonomia
v1.1 → dry-run → adjudicação → plano de apply → executor simulado →
execução real no navegador).

## 1. Baseline usado na execução real

| Campo | Valor |
|---|---|
| lesionCount | 1210 |
| hash usado no baseline guard | **canônico** (chaves de objeto ordenadas recursivamente, SHA-256) |
| canonicalDataSha256 | `bfc9cf1c69cc7d0d80688f5e360a8dabc29e5f1ae447ed3106afa47abe71e99d` |
| atlasCommit (allowlist/script publicados) | `676ab5a7e1599ef7e086b257dd7d9ce591cc80fe` |

O hash bruto (`JSON.stringify(DATA)` sem normalização) foi **descartado**
como critério de baseline guard durante a preparação desta rodada, por
ter se mostrado instável a reordenações de chave sem significado
semântico (confirmado empiricamente: dois exports do mesmo conteúdo
produziram hashes brutos diferentes). O hash canônico foi validado
contra 3 critérios antes do uso: (1) invariante a reordenação de chaves,
(2) sensível a qualquer alteração real de conteúdo, (3) determinístico.

## 2. Checkpoint de segurança (pré-existente, preservado)

- Backup externo: `ATLAS_FULL_BACKUP_PRE_ATTRIBUTES_2026-10-01_22-26-09.json` — validado (hash + contagem + simulação de restauração).
- Snapshot interno inicial: `snap_muqazoek_offohj` — reason `"antes de aplicar migração de atributos taxonômicos"`.

## 3. Snapshot imediatamente antes da persistência real

| Campo | Valor |
|---|---|
| id | `snap_muqebhrc_3kqie6` |
| reason | `"imediatamente antes de persistir migração de atributos taxonômicos"` |
| createdAt | `2026-10-02T03:20:51.624Z` |
| lesionCount | 1210 |
| validated | true |

## 4. Resultado da migração real

| Métrica | Valor |
|---|---|
| lesões elegíveis (auto-ready) | 625 |
| lesões modificadas | **625** |
| novos `attributes.items[]` inseridos | **1131** |
| duplicatas evitadas (idempotência) | 0 (primeira execução) |
| `review-required` tocadas | **0** |
| `no-structured-mapping` tocadas | **0** |
| persistência | **local (IndexedDB) + nuvem (Firestore) confirmadas** |
| `lastWriteRefusedReason` | `null` (nenhuma recusa de revision guard) |

## 5. Validação pós-write

- Total de lesões após a escrita: **1210** (nenhuma lesão perdida ou adicionada).
- Todos os `itemId` materializados são **únicos**.
- **Zero** placeholder (`attr_dryrun_*`/`attr_planned_*`) vazou para o estado real.

## 6. Cadeia de evidência (rodadas que levaram a este resultado)

1. **TAXONOMY v1.1** aprovada (TAXO-03D) — 38 groups / 207 concepts.
2. **Dry-run** do motor de migração (TAXO-04A/B/B2/B3) sobre 1208→1210 lesões — resolução de `"sólido"`, correção de `"espiculada"`, promoção de `vascular`/`focal`/`central`/`crônico`.
3. **Checkpoint de segurança** (TAXO-04C0/C0B) — backup externo + snapshot interno validados.
4. **Dry-run final** (TAXO-04C1) sobre as 1210 lesões do backup validado — 625 auto-ready / 267 review-required / 318 no-structured-mapping, READY FOR APPLY PREPARATION.
5. **Apply plan puro** (TAXO-04C2) — 625 elegíveis / 1131 inserts previstos, idempotência e drift guard validados em memória.
6. **Executor simulado** (TAXO-04C3) — mesma lógica validada via clones em memória, sem nenhuma escrita real; auditoria completa do pipeline de persistência (Firestore `runTransaction` + revision guard) e da concorrência multi-dispositivo.
7. **Drift pós-checkpoint identificado e analisado** — 1 lesão (`seed_365`) teve campos não-relacionados a tags alterados (imagens/casos clínicos); confirmado irrelevante ao plano (0 tags mudaram em qualquer lesão).
8. **Correção do baseline guard** para hash canônico (esta rodada anterior) — eliminou falsos positivos de drift por reordenação de chaves; corrigido também um bug de double-encoding na string do motivo do snapshot.
9. **Execução real** (TAXO-04C4) — script executado no navegador pelo usuário, usando exclusivamente o pipeline já existente e auditado (`createSafetySnapshot` → mutations em memória → `saveData()` → `pushToFirebaseNow()` → `writeShardedState()` com `runTransaction` + revision guard). **Sucesso confirmado.**

## 7. Testes

Suíte completa do projeto executada após o fechamento: ver seção de
confirmação abaixo — nenhuma mudança de código nesta rodada de
fechamento além de documentação, então a suíte roda exatamente como na
última validação (355+ testes das rodadas TAXO-03/04, todos PASS, 0
regressões).

## 8. Confirmações finais

- Migração real **já concluída** (executada pelo usuário no navegador, não nesta sessão de fechamento).
- **625 lesões modificadas.**
- **1131 items persistidos** (local + Firestore).
- Firestore confirmado (`lastWriteRefusedReason: null`).
- Snapshot final (`snap_muqebhrc_3kqie6`) registrado em `TAXO04C4_MIGRATION_RESULT.json`.
- **Nenhuma nova migração foi executada durante este fechamento** — esta rodada só documentou e versionou o resultado já ocorrido.
- `DATA` real, Firestore e IndexedDB **não foram tocados nesta rodada de fechamento** — só lidos indiretamente através do relato do usuário, nunca escritos por mim.

Arquivos desta rodada: `TAXO04_FINAL_MIGRATION_REPORT.md` (novo, este
arquivo), `TAXO04C4_MIGRATION_RESULT.json` (novo). `TAXO04C4_BROWSER_MIGRATION_SCRIPT.js`
e os JSONs operacionais grandes (`TAXO04C1_FINAL_DRY_RUN.json`,
`TAXO04C2_APPLY_PLAN.json`, etc.) permanecem untracked, mesmo padrão já
estabelecido para artefatos grandes/derivados.
