# CONTEXTO MESTRE — Acervo Radiológico (Atlas Radiológico)

Documento de referência do estado ATUAL do projeto. Leia junto com `AGENTS.md`,
`AI.md`, `README.md` e `LOG_DESENVOLVIMENTO.md`. Em caso de divergência entre
uma cópia antiga e o repositório, o repositório e o código valem.

## 1. Estado do Git / publicação

- Último commit publicado (confirmado): **`68e8421`** — "Melhora navegacao
  completa do quiz".
- Branch local: **`master`** (HEAD em `68e8421`).
- Remoto: `origin` = `https://github.com/leopaggi/atlas-radiologico.git`.
- Branch publicada: **`origin/main`**, hoje apontando para o MESMO commit
  `68e84219ab2ed1f150444033cf341272517369b0`.
- Observação: o branch local `master` **não tem upstream configurado**
  (`master@{upstream}` falha). Publicar exige `git push origin master:main`
  (ou configurar o upstream) — confirmar com o usuário antes.
- Publicação é por substituição do `index.html` no GitHub Pages
  (`leopaggi.github.io/atlas-radiologico/`).
- Há **alterações ainda não commitadas** (ver seção 10).

## 2. Arquitetura atual

- **Um único arquivo `index.html`** autossuficiente (HTML + CSS + JS + `SEED`).
  Não separar em arquivos, não introduzir build/framework/servidor.
- **Armazenamento local:** IndexedDB (banco `atlas_radiologico_idb`) via camada
  `storage.get/set/delete/list`. Nunca reintroduzir `localStorage` para dados
  principais.
- **Nuvem:** Firebase Firestore (projeto `atlas-radiologico`) como fonte da
  verdade. O push local→nuvem é automático em `saveData`/`pushToFirebaseNow`; o
  pull nuvem→local NÃO é automático no boot (desativado na Alteração 008) e só
  roda em ações explícitas. Localhost e GitHub Pages têm IndexedDB separados —
  o elo é o Firestore. Há auditoria read-only local × nuvem e botões explícitos
  `☁ sincronizar este dispositivo` (push com snapshot, **verificação pós-envio
  lendo o servidor**, sem pull) e `⬇ atualizar deste backup/nuvem` (pull com
  confirmação/snapshot). Só mostra sucesso se os contadores do servidor baterem
  com o local. Revisões são locais por dispositivo; para movê-las, use o backup
  (Salvar → Importar).
  - **Bug corrigido (sucesso falso):** antes o push declarava sucesso sem reler o
    servidor e a auditoria não se atualizava após o envio.
  - **Leitura server-only:** `readShardedState` usa `get({source:'server'})` no
    meta e nos pedaços; a verificação pós-push usa `readCloudAuditFromServer()`.
  - **Verificação local × servidor:** `syncCountersMatch` compara lesões,
    registros com imagens, total de imagens, `altPlacements` e SRS; sucesso
    somente quando batem.
  - **Reteste real APROVADO (2026-09-20):** localhost e site publicado com
    1213/1213 lesões, **53/53 registros com imagens**, **66/66 imagens**,
    **11/11 altPlacements**, 44/44 SRS. **Sincronização considerada validada.**
- **Imagens:** Cloudinary (`res.cloudinary.com/soegtip6/.../atlas-radiologico/`).
- **Backup/export:** botões `Salvar backup` / `Importar backup` (inalterados).
- **UI de ferramentas (normal):** só `🩺 diagnóstico do sistema` e
  `🔍 auditar vínculo de imagens` (ambos somente leitura) + `Salvar backup` /
  `Importar backup`. As ferramentas técnicas/destrutivas foram REMOVIDAS da
  interface; a implementação interna permanece no código para manutenção
  (`forceThisDeviceToCloud`, `openExportCheckpointV2Modal`,
  `openReconcileV2Modal`, `openRecoveryInspector`, `forceDuplicateCleanupNow`,
  `restoreFactoryDefault`, `runDuplicateCleanup`, `reconcileCatalogByIdentityV2`).

## 3. Arquivos protegidos (NÃO adicionar/editar/apagar)

Untracked, intocados. Nunca devem entrar em commit sem pedido explícito:

1. `FUTUURO QUIZ.png`
2. `auditoria-duplicatas-126.json`
3. `snapshot-catalogo-completo-readonly.json`
4. `snapshot-dry-run-duplicatas.json`
5. `atlas-radiologico-checkpoint-restaurado-61-assets.json`
6. `atlas-radiologico-backup-restaurado-61-assets-importavel.json`
7. `atlas-radiologico-checkpoint-pos-reconciliacao-v2_2026-09-19_22-23-27.json`

## 4. Snapshots automáticos (locais, leves)

- `createSafetySnapshot(motivo)` grava no IndexedDB SOMENTE para motivos de
  risco (`SAFETY_SNAPSHOT_RISK_REASONS`): importar backup, restaurar padrão,
  recuperar dados antigos, fundir duplicatas, reconciliar V2, restaurar
  snapshot, operação em massa de ownership.
- Retenção de 5 (`SAFETY_SNAPSHOT_LIMIT`); sem duplicar binários do Cloudinary
  (imagem fica só como URL). Schema 2.
- Restauração é SEMPRE manual e cria um snapshot do estado atual antes.
- Edição comum, Quiz, marcar revisão e sync NÃO criam snapshot.
- Infraestrutura presente no código; o painel de snapshots NÃO aparece na UI.

## 5. Proteção de ownership de imagens

- Regra: uma imagem já atribuída a uma lesão NUNCA perde a atribuição por fluxo
  AUTOMÁTICO (importação, reconciliação, deduplicação, migração, recuperação,
  sync ou IA).
- Função central `canChangeImageOwnership(image, newLesionId, context)` — só
  libera com `context.manual === true` (`IMAGE_OWNERSHIP_MANUAL`).
- `assertManualImageOwnershipChange` bloqueia e `registerImageOwnershipConflict`
  REGISTRA o conflito (nunca resolve em silêncio).
- `detectImageOwnershipConflicts` (read-only); import preserva o owner local
  (`preserveLocalImageOwnershipOnImport`).

## 6. Central de Revisões + Soluções (`LESION_REVISIONS`)

Fila própria, separada de `REVIEW` (estudo) e `SRS` (quiz). Persistida em
IndexedDB sob `atlas:lesionRevisions`; sobrevive a F5; incluída no backup
completo. NÃO sincroniza com Firebase (de propósito).

Status: `pending`, `rejected`, `proposed` (legado), `applied_pending_validation`,
`accepted`, `cancelled`, `manual_action_required`.

- **Revisão manual:** criada só pela pessoa (checkbox "marcar para revisão" no
  editor ou `🔔 Marcar para revisão` no Quiz). A IA NUNCA cria revisão.
- **Soluções com aplicação provisória:** importar a solução da IA valida tudo
  (JSON, `reviewId`, status, allowlist) e aplica PROVISORIAMENTE com
  `beforeSnapshot` antes de escrever → `applied_pending_validation`. Não há
  clique intermediário de "autorizar correção".
- **Validação final humana:** `✓ Manter correção` → `accepted`; `↩ Desfazer
  correção` → rollback EXATO do `beforeSnapshot` + `rejected` (permite nova
  tentativa). Não existe "aceitar tudo".
- **Rollback:** por tentativa (`review.attempts[]`), cada uma com seu snapshot.
- **Cancelamento:** `cancelLesionReview` (status `cancelled`; canceláveis
  `pending`/`proposed`/`rejected`/`manual_action_required`). Nunca apaga.
- **`manual_action_required`:** para o que a IA não pode resolver
  (imagem/ownership/estrutura). Não altera dados; sai da fila de pendentes;
  aparece na aba **🛠 Ações manuais**; pode voltar para a fila
  (`reopenManualActionReview`) ou ser cancelado.
- **Allowlist de `proposedChanges`:** `name`, `notes`, `classification`, `tags`,
  `enTerm`. Proibidos: `images`/`img`, `lesionId`/`lesionName`, IDs, `s`, `site`,
  `altPlacements`, `links`, `SRS`, `REVIEW`, progresso e estruturais.

### Fluxo em lote

- `🤖 Analisar pendências com IA` → seleção múltipla → `📋 Copiar lote para IA`
  → IA externa → `📥 Colar respostas da IA` → `Processar lote`.
- Elegíveis: só `pending`/`rejected`. Um JSON com `results`:
  `apply` (aplica provisório, snapshot próprio), `manual_action_required`
  (fila de ações manuais), `no_change` (não altera nada).
- Processa cada item ISOLADAMENTE (falha parcial não bloqueia os válidos);
  reimportar não duplica aplicação; `reviewId` repetido no lote é bloqueado.
- O fluxo individual (`🤖 Preparar para IA`) continua como fallback.

### Feedback humano nas tentativas

- Motivo de recusa/desfazer/devolução é persistido: `rejectionReason`,
  `rollbackReason`, `humanFeedback[]`, `lastHumanFeedback`,
  `attempt.rollbackReason`. Sobrevive a F5 e aparece no histórico.
- O pacote da IA inclui `previousAttempts` (summary/reasoning/proposedChanges/
  outcome/humanFeedback/text), `latestHumanFeedback`, `previousOutcome`,
  `previousSolution`, `rejectionReason`, `rollbackReason`.
- `latestHumanFeedback` é derivado (read-only) quando o campo direto está
  ausente, a partir do feedback não vazio mais recente.
- O prompt instrui a NÃO repetir solução recusada e a corrigir o motivo.
- Gerar pacote/prompt é 100% read-only (não cria tentativa/histórico).

### Parser robusto de JSON (lote)

- `normalizeReviewAiBatchJson`: String → trim → remove BOM/zero-width SÓ nas
  bordas → aceita um bloco ```json … ``` (ou ``` … ```).
- Não corrige vírgula/aspas, não recorta "do primeiro `{` ao último `}`", não
  completa documento truncado; conteúdo interno preservado.
- Em falha, devolve `parseError` (`kind`/`position`/`line`/`column`) SEM expor o
  texto colado; a UI orienta (vazio/incompleto/cerca/sintaxe).

## 7. `altPlacements` e localização adicional sugerida pela IA

- `altPlacements` é o campo existente (array de `{ s, site }`) para a lesão
  aparecer também em outra seção/sítio — SEM estrutura paralela, sem duplicar
  registro/lesionId/imagens/Quiz/busca/contagem.
- Sugestão da IA: `manualAction.type = "additional_section_placement"` com
  `suggestedPlacement { section, site }` (site pode ser `null`).
- Validação contra seções/sítios que EXISTEM (`validateReviewAiPlacement`):
  `unknown_section`/`unknown_site` rejeitam.
- Aplicação híbrida com confirmação: `✓ Aplicar localização sugerida` abre uma
  confirmação; só então `applyReviewAiSuggestedPlacement` grava (snapshot antes,
  provisório → `applied_pending_validation`, Manter/Desfazer). Se não houver
  sítio, a confirmação pede um.
- Editor ganhou "Também aparece em" com `+ Adicionar localização`.
- Só `additional_section_placement` tem o atalho; `image_removal`/ownership
  continuam manuais.

## 8. Quiz & Progresso (resumo do estado atual)

- Uma única overlay (`getStudyOverlay()`); quiz embutido no host do dashboard;
  classe `study-dashboard` preservada.
- Navegação `← Anterior` / `⏭ Pular` / `Próxima →`; carrossel de imagens com
  setas laterais grandes + overlay `‹ n / total ›` no canto superior esquerdo
  (mesmo `quizImgIdx`, navegação circular, teclado ←/→); editar a lesão no
  Acervo sem perder a sessão.
- Upload de imagens diferido/transacional (Editor e Quiz) via
  `buildPendingImage`/`uploadPendingImage`; nada sobe ao Cloudinary antes de
  Salvar/Concluído.
- Quadro de imagens pending carrega `data` = blob URL local (igual a
  `_objectUrl`); miniatura e lightbox usam `data || _objectUrl` (preview LOCAL
  enquanto pending, sem upload antecipado).
- Quiz não duplica contagem/questão; progresso = respondidas/total.

## 9. Correção responsiva da Central de Revisões/Soluções

- Classes compartilhadas `.review-center-row*` com `min-width:0`,
  `max-width:100%`, `overflow-wrap:anywhere`; `.review-center-row-actions` com
  `flex-wrap:wrap` (sem `flex-shrink:0`/`nowrap`); `.review-center-modal` com
  `overflow-x:hidden` + `overflow-y:auto`. Vale para Revisões, Validar
  correções, Ações manuais e resultado do lote.

## 10. Regra NTFY (estrita — manter)

A notificação `ntfy` deve ser a **ÚLTIMA** ação operacional de toda tarefa.
Ordem: terminar código → testes → git diff/status → preparar a resposta final →
enviar ntfy → NÃO executar mais nada → responder com o resumo já preparado.
Destino: `https://ntfy.sh/acervo-leo-7k29-radiologia`. Detalhes em `AGENTS.md`.

## 11. Testes (estado atual)

| Arquivo | Resultado |
|---|---|
| `tests/lesion-review.test.js` | **138 PASS**, 0 FAIL |
| `tests/snapshots-ownership.test.js` | **38 PASS**, 0 FAIL |
| `tests/quiz-images.test.js` | **101 PASS**, 0 FAIL |
| `tests/critical-flows.test.js` | 20 PASS, 0 FAIL |
| `tests/tools-layout.test.js` | 8 PASS, 0 FAIL |
| `tests/legacy-id-migration.test.js` | 156 PASS, 5 TODO, 0 FAIL |
| Total (suíte completa) | **466 testes, 461 PASS, 5 TODO, 0 FAIL** |

- `tests/duplicate-detection.test.js` tem 1 FAIL **histórico e fora de escopo**
  (`DUPLICATE_PAIRS_V171`, 28 entradas malformadas). Não corrigir sem pedido.
- `tests/critical-flows.test.js` usa âncoras de linha exatas; após edições antes
  das âncoras, atualizar via script. Valores atuais:
  **5548/5538/7851/10807**.
- `git diff --check`: sem erros de espaço em branco.

## 12. Alterações ainda não commitadas

Modificados: `AGENTS.md`, `AI.md`, `LOG_DESENVOLVIMENTO.md`, `README.md`,
`index.html`, `tests/critical-flows.test.js`, `tests/lesion-review.test.js`,
`tests/quiz-images.test.js`.
Novos (untracked, para adicionar no commit): `tests/snapshots-ownership.test.js`,
`tests/tools-layout.test.js`, e este `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

Cobrem (ALTERAÇÕES 021–034 do log): snapshots+ownership, simplificação das
ferramentas, ponte de IA, aplicação provisória, `{}`/ação manual, fluxo em lote,
feedback humano, `latestHumanFeedback`, localizações adicionais, parser robusto
do lote, correção responsiva da Central de Revisões/Soluções, preview local do
quadro de imagens pending no Quiz, contador do carrossel no canto superior e a
auditoria + sincronização explícita localhost ↔ nuvem.

## 13. Próximos passos pendentes

1. **Sincronização validada** (2026-09-20) — localhost e site publicado
   conferidos com os mesmos contadores (53 registros com imagens, 66 imagens,
   11 altPlacements, 44 SRS). Nenhuma ação pendente aqui.
2. **Persistir a última seção/posição escolhida no Quiz e na sidebar** (reabrir
   no mesmo ponto após F5).
3. **Eventuais refinamentos do fluxo de IA** (sem API/segredo; sempre com
   confirmação humana e sem autoaceite).
4. **Manutenção incremental** (pequenas correções, sempre preservando dados,
   imagens e ownership).
