# TAXO-04C3 — Executor em modo simulação (sem persistência real)

`tools/taxonomy-attributes-apply-executor.js` — toda escrita acontece em
clones JSON em memória. Nenhuma função pública chama
`saveData()`/`pushToFirebase*`/`writeShardedState()`/Firestore/
IndexedDB/`localStorage`. `currentData`/`now`/`idFactory` são sempre
recebidos por parâmetro.

## Baseline

| Campo | Valor |
|---|---|
| lesionCount | 1210 |
| sourceDataSha256 | `f752b7381404cc4339eb4114213321c102737f53e0ef9ca389639b5667ab8541` |
| applyPlan (entrada) | `TAXO04C2_APPLY_PLAN.json` (625 eligible / 1131 inserts) |

## 1ª simulação (`simulateTaxonomyAttributesApply`)

| Métrica | Esperado | Obtido |
|---|---|---|
| modified lesions | 625 | **625** |
| new items | 1131 | **1131** |
| preserved existing items | 0 | **0** |
| duplicates avoided | 0 | **0** |
| review-required touched | 0 | **0** |
| no-structured touched | 0 | **0** |
| total lesions after | 1210 | **1210** |

Confirmado com `now`/`idFactory` injetados deterministicamente nos
testes; a versão real usaria `createDefaultIdFactory()`/
`createDefaultNowFn()` (exportados, mas nunca chamados internamente sem
injeção explícita do chamador).

## Estratégia de itemId

- **PLANEJAMENTO** (`taxonomy-attributes-apply-plan.js`): `attr_planned_<lesionId>_<conceptId>` — placeholder, nunca escrito de verdade.
- **MATERIALIZAÇÃO** (este módulo): `idFactory()` injetado — em produção seria `createDefaultIdFactory()`, que reproduz exatamente o padrão já usado no resto do Atlas (`'attr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8)`, mesmo esquema do `id` de safety-snapshot).
- Unicidade garantida contra **todos** os itemIds reais já existentes em `currentData` (não só dentro da própria lesão) — `collectExistingItemIds()` varre as 1210 lesões antes de materializar qualquer coisa.
- Nenhum `attr_dryrun_*` ou `attr_planned_*` sobrevive até o resultado materializado (verificado por teste).

## Estratégia de `updatedAt`/`_userUpdatedAt`

- `updatedAt` de cada item novo = `now()` injetado, nunca `null`.
- `_userUpdatedAt` da lesão só avança quando **pelo menos 1 item novo** foi de fato inserido nela nesta execução — um rerun idempotente (0 inserts) **não** toca `_userUpdatedAt`, mesmo que `now()` retorne um valor diferente. Isso evita marcar uma lesão como "mudou" quando na prática nada mudou, e evita gastar prioridade de reconciliação sem necessidade.
- Quando `_userUpdatedAt` É atualizado, a lesão passa a vencer qualquer reconciliação local↔nuvem↔legado subsequente (o Atlas já usa esse campo para decidir "qual cópia é mais nova" em várias rotinas de merge), protegendo os `attributes` recém-aplicados de serem sobrescritos.

## Semântica de merge

- `attributesVersion = 1` em toda lesão modificada.
- Itens existentes **nunca** são removidos ou reescritos — só itens novos são adicionados ao array.
- `allowMultipleInstances === false` (todos os 38 groups atuais) + item **ativo** (sem `deletedAt`) do mesmo concept → duplicata evitada, item existente preservado.
- Item com `deletedAt !== null` → **não bloqueia reinserção** (decisão explícita, testada): insere um item novo, o item deletado permanece deletado — nunca "ressuscita" silenciosamente.
- Conflito clínico (concept diferente ativo no mesmo group exclusivo) → **não insere, não sobrescreve** — fica fora do plano, sinalizado em `conflictsWithExisting` para revisão humana futura. `createLesionReview()` não é chamado nesta rodada.
- Campos fora de `attributes`/`attributesVersion`/`_userUpdatedAt` (tags, images, links, notes, review, SRS, altPlacements, etc.) são garantidamente preservados — testado com comparação profunda before/after.

## Validação pós-apply (`validatePostApplyState`)

Confirma: contagem de lesões inalterada; IDs e ordem inalterados; só as
lesões em `modifiedLesionIds` têm `attributes` diferente; todas as
lesões modificadas têm `attributesVersion === 1`; todo itemId é único
em todo o conjunto; nenhum `attr_dryrun_*`/`attr_planned_*` sobrevive;
todo item novo tem `deletedAt === null`, `qualifiers === []`,
`updatedAt` preenchido.

## Idempotência — PASS

Simulação completa: baseline → simulate #1 (625/1131) → plano
**regerado do zero** sobre `afterData` → simulate #2 usando esse plano
fresco → **0 modified, 0 new items**, `_userUpdatedAt` não avança.
Testado tanto em fixture sintética quanto contra os dados reais
(1210 lesões).

## Proteção de drift — PASS (10 cenários testados)

Alteração de nome/tag de uma lesão, lesão adicionada, lesão removida,
`applyPlan` adulterado (conceptId trocado por um **inexistente**),
`taxonomy` incompatível (concept removido) — todos **abortam antes de
qualquer clone ser criado e antes de `idFactory` ser chamado**
(confirmado por contador de chamadas = 0 no teste de baseline-drift).

### Limite documentado da revalidação do plano

A revalidação estrutural (`revalidateApplyPlan`/`revalidateMutation`)
reconstrói o conjunto de `conceptId`s propostos a partir do **próprio**
conteúdo de cada `mutation` (`insertedItems`/`duplicatesAvoided`/
`conflictsWithExisting`) e recomputa `buildMutationForLesion` contra o
`currentData` atual, comparando o resultado. Isso detecta com certeza:
`conceptId` inexistente na taxonomy, violação de exclusividade, e
qualquer mutation que não bata com o que o motor recomputaria a partir
do que ela mesma declara. **O que ela não pode detectar sozinha**: se
alguém troca um `conceptId` por **outro concept igualmente válido e
não-conflitante** (ex.: `rad_comp_solid` → `rad_comp_cystic` numa lesão
sem nenhum outro sinal), a revalidação não tem como saber que esse não
era o concept originalmente indicado pelas tags da lesão — porque o
executor, por desenho explícito desta rodada (ver seção 2 do pedido),
**não recebe `migrationResult`**, só o `applyPlan` já processado. Esse
limite está documentado e coberto por um teste dedicado que não
reivindica uma garantia que o design atual não oferece. Fechar esse gap
por completo exigiria passar também o `migrationResult` original ao
executor — decisão de arquitetura para uma rodada futura, não tomada
aqui por não ter sido pedida na interface especificada.

## Auditoria do pipeline de persistência (A-J, nada executado)

**A. `saveData()` escreve local antes de Firestore?** Sim —
`saveData()` (`index.html:14147`) chama `storage.set(STORAGE_KEY, ...)`
(IndexedDB local) **primeiro**; só depois, se `internal` não for true,
marca `syncDirty` e chama `pushToFirebaseNow()`. Sequencial, nunca em
paralelo.

**B. `pushToFirebaseNow()` chama `writeShardedState()`?** Sim, através
de `writeShardedStateSerialized()` → `writeShardedStateWithConflictRetry()`
→ `writeShardedState()`. A "serialização" existe para nunca haver duas
chamadas de escrita reentrantes no MESMO dispositivo ao mesmo tempo.

**C. `writeShardedState()` é atomicamente transacional ou só rollback
compensatório?** **Genuinamente transacional** — usa
`fbDb.runTransaction(...)` real do Firestore: lê o documento de
metadados e todos os chunks **dentro** da mesma transação, e só grava
(`tx.set`) se nada mudou. Isso é mais forte que um readback+rollback
manual: o próprio Firestore garante que a transação só comita por
completo ou não comita nada. (Existe TAMBÉM um mecanismo separado de
readback-verify-rollback, mas em OUTRA função —
`restoreCanonicalStateToCloud()` — usada só para restaurar o catálogo
canônico, uma operação de risco diferente, fora do caminho normal de
escrita.)

**D. Quantos chunks?** `DATA_CHUNK_SIZE = 150` lesões por chunk. Para
1210 lesões: **9 chunks** (8 de 150 + 1 de 10).

**E. Como detecta divergência?** `writeShardedState()` não faz um
readback pós-escrita — a proteção é **antes** da escrita: dentro da
transação, compara `serverRevision` (lido agora, no servidor) com
`lastKnownCloudRevision` (a última revisão que este dispositivo
confirmou ter lido). Se divergirem, lança `cloud_revision_conflict` e a
transação do Firestore aborta inteira, sem gravar nada.

**F. O que acontece se um chunk falhar?** Como tudo (`meta` + todos os
chunks) está dentro da MESMA `runTransaction`, uma falha em qualquer
parte (erro de rede, `chunk_too_large`, `cloud_revision_conflict`,
arrays aninhados detectados) aborta a transação inteira — nenhum chunk
parcial é gravado.

**G. O rollback restaura remoto e/ou local?** Não existe "rollback" no
sentido de desfazer uma escrita já confirmada — a transação do Firestore
nunca confirma parcialmente. O estado local só avança
(`lastKnownCloudRevision = committedRevision`) **depois** de o `try`
inteiro ter sucesso; em caso de erro, a variável global não muda e
`DATA` local também não foi alterado por esta função (ela só lê `DATA`
para montar o payload, nunca escreve de volta nela).

**H. `saveData()` pode disparar reconcile no meio?** Não diretamente —
`saveData()` só marca `syncDirty` e chama `pushToFirebaseNow()`; é
`pushToFirebaseNow()`/`pushToFirebase()` que fazem o pre-push reconcile
(mencionado nos comentários como "mesmo pre-push reconcile de
pushToFirebaseNow()") antes de tentar escrever.

**I. Existe risco de outro dispositivo sobrescrever durante o apply?**
Ver seção de concorrência abaixo — **mitigado pelo revision guard**,
não eliminado para o caso 100% offline.

**J. Existe revision/version guard remoto?** **Sim** —
`CLOUD_REVISION_FIELD` no documento de metadados, comparado dentro da
transação (`serverRevision !== lastKnownCloudRevision`). Este é
exatamente o mecanismo que protegeria um futuro apply real contra
concorrência multi-dispositivo, **desde que** a materialização futura
reutilize `pushToFirebaseNow()`/`writeShardedState()` em vez de inventar
um caminho de escrita novo.

## Concorrência multi-dispositivo: **SAFE** (com uma condição explícita)

Determinado **SAFE**, não BLOCKER — mas com uma condição que precisa ser
respeitada pela futura implementação real:

- O cenário "PC A valida baseline → PC B altera catálogo → PC A escreve
  por cima" é coberto pelo `CLOUD_REVISION_FIELD`: a transação de PC A
  só comita se a revisão do servidor, lida **no momento exato da
  escrita**, ainda for a que PC A esperava. Se PC B escreveu antes, a
  revisão do servidor já avançou, PC A recebe `cloud_revision_conflict`
  e nada é gravado.
- **Condição**: isso só protege se a futura persistência passar
  realmente por `writeShardedState()` (via `saveData()`/
  `pushToFirebaseNow()`). Um caminho de escrita que ignorasse esse
  pipeline (ex.: escrever o documento Firestore diretamente) **não**
  teria essa proteção — por isso a recomendação da seção de
  persistência (TAXO-04C2) de reaproveitar o pipeline existente em vez
  de criar um novo.
- **O que o revision guard NÃO cobre**: o hash de baseline
  (`validateApplyBaseline`, usado pelo executor) é verificado contra o
  `DATA` **local** no momento em que o plano foi feito — se o
  dispositivo que vai de fato persistir estiver rodando totalmente
  offline (sem nunca ter sincronizado com a nuvem desde o checkpoint),
  o revision guard do Firestore simplesmente não entra em jogo até a
  primeira tentativa de `pushToFirebaseNow()`, e aí sim ele protegeria.
  Ou seja: as duas camadas (hash local + revision remota) são
  complementares, não substitutas uma da outra — nenhuma delas sozinha
  é suficiente, mas juntas cobrem o cenário crítico descrito.

## Pre-save remote revalidation (estratégia proposta, nada implementado)

Para o futuro apply real, imediatamente antes de persistir:

1. `syncFromFirebase()` (ou equivalente) para garantir que `DATA` local reflita o estado remoto mais recente conhecido.
2. Recalcular `dataSha256` sobre o `DATA` local pós-sync.
3. Confirmar 1210 IDs (ou a contagem/IDs vigentes, se o checkpoint for refeito).
4. Só então chamar `simulateTaxonomyAttributesApply` (ou sua futura contraparte real) com esse baseline fresco.
5. Se o sync trouxe qualquer mudança, ou o hash não bater: **abortar** e exigir novo dry-run (TAXO-04C1-like) + novo apply plan (TAXO-04C2-like) — nunca tentar reconciliar silenciosamente.

Essa estratégia é só desenhada aqui — nenhum código de sync/revalidação remota foi criado nesta rodada.

## Novo snapshot imediato (proposta, nada criado)

Preferência confirmada: motivo **específico**, não reaproveitar
"antes de aplicar migração de atributos taxonômicos" (que já marca o
início do processo de checkpoint) para o instante real da escrita.
Proposta de motivo novo:

```
'imediatamente antes de persistir migração de atributos taxonômicos'
```

Seria adicionado a `SAFETY_SNAPSHOT_RISK_REASONS` numa rodada futura,
exatamente da mesma forma pequena/explícita/testável que a TAXO-04C0B
adicionou o motivo anterior — **não criado nem proposto como diff nesta
rodada**, já que não era indispensável para os testes puros desta fase.

## Estratégia de rollback (reafirmada)

Backup externo validado + snapshot `snap_muqazoek_offohj` já existem. A
proteção de revisão do Firestore (`CLOUD_REVISION_FIELD`) garante que a
escrita real nunca sobrescreve um estado remoto mais novo não visto.
Mesmo assim, a recomendação de criar um snapshot interno **novo**,
imediatamente antes da persistência real futura, permanece — cobre o
caso de a própria escrita local (IndexedDB) precisar ser desfeita, algo
que o revision guard do Firestore não resolve (ele protege o lado
remoto, não o `storage.set` local que `saveData()` faz primeiro).

## O que NÃO foi criado/alterado nesta rodada

- Nenhuma função de persistência real (`persistTaxonomyAttributes()`, etc.).
- Nenhuma chamada a `saveData()`/`pushToFirebaseNow()`/`writeShardedState()`.
- Nenhum Firestore/IndexedDB/localStorage write.
- Nenhum botão/UI de apply.
- Nenhum `createLesionReview()`.
- Nenhum snapshot interno novo.
- `index.html` **intocado** nesta rodada (nenhuma mudança na allowlist de snapshot).

## Testes

`tests/taxonomy-attributes-apply-executor.test.js` — 46/46 PASS, cobrindo
os 40 pontos pedidos (baseline guard, revalidação defensiva do plano,
contagens reais 625/1131/1210, preservação de tags/images/links,
isolamento de review-required/no-structured-mapping, unicidade de
itemId, forma dos itens novos, `_userUpdatedAt` condicional,
single/multiple-instance, item deletado não ressuscita, conflito aborta,
10 cenários de drift, zero persistência real, imutabilidade,
atomicidade, determinismo, idempotência completa via regeneração de
plano, e os dois validadores de `validatePostApplyState` isolados).

Suíte completa do projeto: **355/355 PASS, 0 regressões.**

## Confirmações

- `DATA` real intocado.
- `attributes` reais inexistentes.
- `saveData()` nunca chamado.
- Firestore intocado.
- IndexedDB intocado.
- `localStorage` intocado.
- Nenhuma persistência executada.

Arquivos desta rodada (FASE B):
`tools/taxonomy-attributes-apply-executor.js` (novo),
`tests/taxonomy-attributes-apply-executor.test.js` (novo),
`TAXO04C3_EXECUTOR_SIMULATION_REPORT.md` (novo, este arquivo).

**NÃO houve `git add`, `commit` ou `push` da FASE B.**
