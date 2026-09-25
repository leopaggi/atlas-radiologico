# CONTEXTO MESTRE — Acervo Radiológico (Atlas Radiológico)

Documento de referência do estado ATUAL do projeto. Leia junto com `AGENTS.md`,
`AI.md`, `README.md` e `LOG_DESENVOLVIMENTO.md`. Em caso de divergência entre
uma cópia antiga e o repositório, o repositório e o código valem.

<!-- ===================== CHECKPOINT OPERACIONAL (manter no topo) ===================== -->

## ESTADO OPERACIONAL ATUAL

*Atualizado em 2026-09-25, junto do commit "Protecao 083: corrige titulo e tags do importador Radiopaedia".*

- **Branch local de trabalho:** `master` (publicação: `git push origin master:main`).
- **origin/main antes da 083:** `aff09e4` (Protecao 082). **Último commit:** Protecao 083 (este checkpoint entra no mesmo commit; o hash exato está em `git log -1`).
- **Baseline de testes (ambiente local do usuário, com os arquivos protegidos presentes):** 1167 testes · 1159 pass · 3 fail conhecidos · 5 todo (era 1155/1147/3/5 antes da 083; +12 testes novos da 083). Os 3 fail conhecidos: `duplicate-detection` (1, `DUPLICATE_PAIRS_V171` histórico) e `images-history` (2, dependem da data do sistema).
  - Divergência documentada: num clone sem os arquivos protegidos (ex.: sessão na nuvem) a mesma suíte dá 1157 · 1122 · 30 · 5 — +24 fail em `legacy-id-migration` e +1 em `device-bootstrap`/F2 do `multi-device-sync` por falta de `snapshot-catalogo-completo-readonly.json` e `ATLAS_CANONICO_LIMPO_1216_116_FINAL.json`, e `ownership-fix-20260921` aborta por CRLF (arquivo com fim de linha Windows). Nenhuma dessas é regressão.
- **Firestore (informado pelo usuário; não verificável sem credenciais):** uso normal, última cloud revision observada: 64. Rules intocadas pela 083. Nenhuma escrita deliberada nesta tarefa.
- **Produção validada (usuário):** links semanticamente duplicados = 0 lesões / 0 grupos; imagens: 0 duplicatas intralesão por identidade estável, 0 identidades compartilhadas entre lesões; ordem de seções/subseções local × Firestore sem diferenças reais.
- **Proteções recentes concluídas:** 075 (quarentena `seed_1213..1282`), 076, 077/077b, 078, 079/079b/079c/079d (imagens stale; marcador explícito `atlas:pendingLocalImageAdds`), 080/081/082 (links duplicados), **083 (título/tags do importador Radiopaedia)**.
- **Invariantes importantes:** toda escrita normal passa por `writeShardedState()` (transação + `revision`); imagem só-local só sobe com marcador 079d; tombstone vence; ownership de imagem só muda manualmente; ids `seed_N` são posicionais; não "consertar" `DUPLICATE_PAIRS_V171`; links sem duplicata por URL semântica; título de caso externo nunca pode ser nome de autor/usuário (083).
- **Trabalho pendente FORA do main (não faz parte da 083):** duas entregas anteriores ainda não aprovadas — "fonte por imagem (`sourcePage`)" e "adicionar caso clínico manual no detalhe" — estão preservadas no `git stash` da sessão remota (`stash@{0}`, mensagem "pendente: sourcePage por imagem + caso clinico manual") e num patch de backup. Não restaurar sem decisão explícita do usuário; tratar como bloco separado.
- **Problema aberto atual:** `extractModality()` do userscript ainda pega a primeira sigla de modalidade em QUALQUER lugar da página (pode vir modalidade errada → tag de modalidade errada); a estrutura real do DOM do Radiopaedia não pôde ser inspecionada (site inacessível do ambiente remoto).
- **Próximo passo exato:** (1) o usuário atualiza o userscript no Tampermonkey para a v1.1.0 (`tools/radiopaedia-to-atlas.user.js`) e testa "Enviar ao Atlas" numa página que antes gerava "Leonardo Paggi Andrade"; (2) decidir sobre o `stash@{0}` (fonte por imagem + caso clínico manual) como bloco separado; (3) só então, se desejado, restringir `extractModality()` à área do caso com base no DOM real.

## PROTOCOLO OBRIGATÓRIO DE CONTINUIDADE

1. Todo agente deve ler este arquivo antes de alterar o projeto.
2. Conferir `git status --short`, `git rev-parse HEAD` e `git rev-parse origin/main` (e `git log -5 --oneline`).
3. O repositório real vence qualquer contexto de conversa divergente; documentar a divergência aqui.
4. Após cada alteração validada, atualizar ESTE arquivo antes do commit.
5. Registrar: alteração concluída; motivo; arquivos alterados; testes/resultados; estado operacional relevante; pendências; próximo passo exato.
6. Commitar o Contexto Mestre junto com a alteração correspondente.
7. Nunca usar `git add .` — adicionar arquivos explicitamente.
8. Nunca usar force push.
9. Nunca tocar nos arquivos untracked protegidos (lista na seção 3 + os citados no bloco acima).
10. Se houver dúvida, auditar antes de modificar.

<!-- =================== FIM DO CHECKPOINT OPERACIONAL =================== -->

## 1. Estado do Git / publicação

- **Nota (2026-09-21):** HEAD local e `origin/main` publicados coincidem em
  `c628d09` ("Melhora importacao imagens quiz e cobertura do acervo"). As
  Alterações 055, 056, 057 (seções 17/19) estão implementadas, testadas e
  **validadas manualmente pelo usuário** (ver seção 25), mas **ainda não
  commitadas nem publicadas** — `git status` mostra os arquivos alterados
  como working tree sujo sobre esse mesmo HEAD. Commit/push seguem
  dependendo de pedido explícito.
- Último commit publicado antes deste bloco (confirmado, texto histórico
  original desta seção — desatualizado, ver nota acima): **`038f4be`** —
  "Melhora revisoes classificacoes e ferramentas".
- Branch local: **`master`**. Remoto: `origin` =
  `https://github.com/leopaggi/atlas-radiologico.git`; branch publicada
  **`origin/main`**.
- Observação: o branch local `master` **não tem upstream configurado**
  (`master@{upstream}` falha). Publicar exige `git push origin master:main`.
- Publicação é por substituição do `index.html` no GitHub Pages
  (`leopaggi.github.io/atlas-radiologico/`).
- Este bloco (ver seção 10) cobre: painel SRS único (vencidas têm prioridade;
  sem vencidas mostra próximas; atualização imediata após resposta); auditoria
  de classificações conservadora (`canonical`/`compatible_noncanonical`/
  `incompatible`/`mismatch`/`unknown`) com correção em lote só em
  `incompatible`+`mismatch`; fila manual "Revisar" (`✓ Manter`/`✕ Remover`/
  `✎ Abrir lesão`) com decisões por identidade semântica + classification;
  "Ferramentas avançadas" recolhíveis e fechadas por padrão; e preferências
  locais independentes `atlas:v1:lastQuizScope`/`atlas:v1:lastSidebarScope`
  (não sincronizadas pela nuvem).

## 2. Arquitetura atual

- **Um único arquivo `index.html`** autossuficiente (HTML + CSS + JS + `SEED`).
  Não separar em arquivos, não introduzir build/framework/servidor.
- **Armazenamento local:** IndexedDB (banco `atlas_radiologico_idb`) via camada
  `storage.get/set/delete/list`. Nunca reintroduzir `localStorage` para dados
  principais.
  - **Exceção (preferências de UI):** a última seção/site da sidebar e do Quiz
    fica em `localStorage` (`atlas:v1:lastSidebarScope` / `atlas:v1:lastQuizScope`),
    local por origem, independente e sem nuvem. Só grava em mudança manual;
    validada contra seções/sites existentes.
- **Nuvem:** Firebase Firestore (projeto `atlas-radiologico`) como fonte da
  verdade. O push local→nuvem é automático em `saveData`/`pushToFirebaseNow`
  (a cada edição e no fim de todo boot); o pull nuvem→local É automático no
  boot desde a Alteração 068 (2026-09-23; tinha sido desativado na Alteração
  008, ver seção 27) para qualquer dispositivo JÁ inicializado — reaproveita
  `syncFromFirebase()` (merge não destrutivo, sem lógica nova). Uma barreira
  de reconciliação (`fbSyncing`, Alteração 069, seção 28) impede qualquer
  push — automático ou manual — de competir com um pull/merge em andamento;
  nenhum push fica perdido em silêncio (`syncPushPending` + flush ao fim da
  reconciliação). Localhost e GitHub Pages têm IndexedDB separados — o elo
  continua sendo o Firestore.
  Continua havendo auditoria read-only local × nuvem e botões explícitos
  `☁ sincronizar este dispositivo` (push com snapshot, **verificação pós-envio
  lendo o servidor**, sem pull) e `⬇ atualizar deste backup/nuvem` (pull com
  confirmação/snapshot). Só mostra sucesso se os contadores do servidor baterem
  com o local. Revisões são locais por dispositivo; para movê-las, use o backup
  (Salvar → Importar).
  - **Exceção — dispositivo novo sem catálogo local (Alteração 055,
    2026-09-21):** `writeShardedState()` (o único ponto que escreve no
    Firestore) recusa QUALQUER envio enquanto `deviceBootstrapPending` for
    `true`. Essa flag liga quando `loadData()` detecta que o IndexedDB local
    ainda não tem o catálogo (`STORAGE_KEY` ausente) — nesse caso, ANTES de
    qualquer push automático e ANTES de `renderAll()`, a nuvem é consultada
    SERVER-ONLY e um modal mostra o que foi encontrado, pedindo uma decisão
    explícita: carregar (reaproveita `syncFromFirebase()`, o mesmo pull não
    destrutivo de "atualizar deste backup/nuvem") ou confirmar (com aviso)
    que quer mesmo começar vazio. Um dispositivo que já tem catálogo local
    não passa por nada disso — comportamento idêntico ao de antes. Ver seção
    17 para os detalhes completos. **Motivação:** sem isso, um computador
    novo abrindo o site publicado usava o `SEED` cru como catálogo e, no
    mesmo carregamento, um `pushToFirebaseNow()` incondicional sobrescrevia
    (overwrite total, não é merge) o estado real da nuvem — foi isso que
    zerou o Atlas ao abrir num segundo computador do hospital.
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
  - **Divergência cruzada + merge aditivo de imagens (Alteração 044):** quando o
    local tem mais imagens e a nuvem tem SRS mais novo, NÃO fazer overwrite
    integral. O modal avisa e oferece `🔀 Mesclar imagens deste dispositivo na
    nuvem`. No push de imagens, o registro **remoto é a base** e recebe somente
    as imagens locais ausentes; a união deduplica por `assetId`, `publicId` e URL
    normalizada, nunca apaga e nunca move ownership. SRS, REVIEW e SESSIONLOG
    remotos são preservados pelos merges próprios. A leitura inicial e a
    verificação pós-escrita são server-only. O pull nuvem→dispositivo também faz
    união aditiva das imagens, incorporando as que existem apenas na nuvem. Sem
    upload ao Cloudinary.
  - **Reteste real do merge APROVADO (2026-09-21):** servidor/site confirmado
    com **58 registros com imagens**, **73 imagens** e **SRS 44**. O SRS remoto
    permaneceu 44 após incorporar as imagens locais. Ownership permaneceu
    protegido. **Merge aditivo considerado validado.**
- **Imagens:** Cloudinary (`res.cloudinary.com/soegtip6/.../atlas-radiologico/`).
- **Backup/export:** botões `Salvar backup` / `Importar backup` (inalterados).
- **UI de ferramentas (normal):** sempre visíveis `☁ configurar Cloudinary`,
  `💾 Salvar backup` e `📂 Importar backup`. As ações técnicas ficam recolhidas no
  bloco **`⚙ Ferramentas avançadas`** (`#advanced-tools`), **fechado por padrão**,
  que abre/fecha ao clique (indicador ▸/▾): sincronizar este dispositivo,
  atualizar deste backup/nuvem, diagnóstico do sistema e auditar vínculo de
  imagens. Não persiste aberto (sempre fecha ao recarregar). As ferramentas
  destrutivas seguem fora da UI. A implementação interna permanece no código
  (`syncThisDeviceToCloud`, `openSyncDeviceToCloudModal`,
  `openUpdateFromCloudModal`, `openSystemDiagnosticModal`,
  `openImageAuditModal`, `forceThisDeviceToCloud`, `openExportCheckpointV2Modal`,
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

## 3.1. Integridade de `classification` (ids posicionais)

- Os ids são **posicionais** (`seed_<N>`, renumerados por posição no boot). Se o
  `SEED` for reordenado/ampliado, o mesmo id passa a apontar para outra lesão e o
  `DATA` persistido (IndexedDB/Firestore) mantém campos antigos "colados" na
  lesão errada. Foi assim que C-RADS apareceu em lesões fetais.
- A auditoria antiga `applyClassificationAudit20260918` (lista de ids
  posicionais) foi **NEUTRALIZADA** — ela podia apagar C-RADS **válida** dos
  pólipos colorretais (hoje `seed_818/819/820`).
- **Ausência de `classification` no SEED NÃO é prova de erro** (pode ter sido
  adicionada manualmente e ser legítima). A regra "SEED sem classificação ⇒
  espúria" foi considerada agressiva demais e substituída (Alteração 041).
- **Auditoria read-only:** `buildClassificationAudit()` compara com o `SEED` pela
  IDENTIDADE SEMÂNTICA `s+site+name` → `canonical` / `mismatch` /
  `compatible_noncanonical` / `incompatible` / `unknown`.
- **Regras conservadoras:** `CLASSIFICATION_CONTEXT_RULES` +
  `classifyClassificationCompatibility()` só marcam `incompatible` quando a seção
  é claramente de OUTRO sistema **e** não há palavra de contexto; ambiguidade vira
  `unknown` (revisar).
- **Correção em lote:** `applyClassificationIdentityFix()` (snapshot antes) remove
  só `incompatible` (→ null) e restaura `mismatch` (→ valor do SEED); **nunca**
  toca `canonical`, `compatible_noncanonical`, `unknown` nem fora do SEED.
- **Fila manual "Revisar" (unknown):** cada item tem `✓ Manter` (não altera DATA;
  registra decisão), `✕ Remover` (confirma + snapshot; zera só `classification`)
  e `✎ Abrir lesão` (editor; recalcula ao salvar). Decisões em
  `CLASSIFICATION_REVIEW_DECISIONS` (IndexedDB local, chave = identidade semântica
  `s+site+name` + classification atual; **não** sincroniza com a nuvem; não
  globaliza; se a classificação mudar, o item volta para a fila). UI:
  `📋 auditar classificações` em **Ferramentas avançadas**.
- `C-RADS` no SEED: 3 registros, todos em `Abdômen Superior / Intestino / cólon`
  (canônicos). C-RADS em Medicina Fetal = `incompatible`.

## 4. Snapshots automáticos (locais, leves)

- `createSafetySnapshot(motivo)` grava no IndexedDB SOMENTE para motivos de
  risco (`SAFETY_SNAPSHOT_RISK_REASONS`): importar backup, restaurar padrão,
  recuperar dados antigos, fundir duplicatas, reconciliar V2, restaurar
  snapshot, operação em massa de ownership, corrigir classificações inválidas.
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
- **SRS — vencidas x próximas:** `SRS[id]={interval(dias),due(ms),streak,lastGrade}`.
  VENCIDA = `due>0 && due<=agora`; PRÓXIMA = `due>agora`; "nunca estudada" fica
  fora das duas. `partitionScheduledReviews` separa e ordena por `due`.
  `reviewPanelModel` decide UM ÚNICO painel: se há vencidas → "Revisões vencidas"
  (badge "N vencidas", tempo "vencida há X"); senão → "Próximas revisões" (badge
  "N agendadas"/"em dia", tempo "em X"). O badge usa o total real; a lista limita
  a 5. `renderReviewPanels` é chamado por `refreshStudyDashboardLive` — o painel
  atualiza na hora após responder e troca automaticamente para "Próximas" quando
  a última vencida é resolvida. Tempo relativo: `fmtReviewPast`/`fmtReviewFuture`,
  nunca cruzados.

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
| `tests/snapshots-ownership.test.js` | **46 PASS**, 0 FAIL |
| `tests/quiz-images.test.js` | **102 PASS**, 0 FAIL |
| `tests/local-scope-prefs.test.js` | **20 PASS**, 0 FAIL |
| `tests/classification-integrity.test.js` | **24 PASS**, 0 FAIL |
| `tests/srs-dashboard.test.js` | **17 PASS**, 0 FAIL |
| `tests/critical-flows.test.js` | 21 PASS, 0 FAIL |
| `tests/tools-layout.test.js` | **11 PASS**, 0 FAIL |
| `tests/legacy-id-migration.test.js` | 156 PASS, 5 TODO, 0 FAIL |
| `tests/external-import.test.js` | **67 PASS**, 0 FAIL |
| `tests/quiz-image-desc.test.js` | **8 PASS**, 0 FAIL |
| `tests/image-productivity.test.js` | **20 PASS**, 0 FAIL |
| `tests/collage-desc.test.js` | **15 PASS**, 0 FAIL |
| `tests/sidebar-image-stats.test.js` | **22 PASS**, 0 FAIL |
| `tests/device-bootstrap.test.js` | **32 PASS**, 0 FAIL |
| `tests/image-description.test.js` | **31 PASS**, 0 FAIL |
| `tests/ownership-fix-20260921.test.js` | **10 PASS**, 0 FAIL |
| `tests/form-collapse.test.js` | **11 PASS**, 0 FAIL |
| `tests/form-layout-desktop.test.js` | **10 PASS**, 0 FAIL |
| `tests/image-handling.test.js` | **18 PASS**, 0 FAIL |
| Total (suíte completa) | **784 testes, 778 PASS, 5 TODO, 0 FAIL** |

- `tests/duplicate-detection.test.js` tem 1 FAIL **histórico e fora de escopo**
  (`DUPLICATE_PAIRS_V171`, 28 entradas malformadas). Não corrigir sem pedido.
  (Não entra na tabela acima nem no total, por ter esse FAIL conhecido — ver
  `README.md`.)
- `tests/critical-flows.test.js` usa âncoras de linha exatas; após edições antes
  das âncoras, atualizar via script. Valores atuais:
  **6247/6257/8799/11949** (`brokenArtifacts`/`recovery`/`loadData`/
  `importHandler`, respectivamente — importHandler deslocado pelos
  expansores do formulário).
- `git diff --check`: sem erros de espaço em branco.

## 12. Entrega da Alteração 044

Arquivos do fechamento: `index.html`, `tests/snapshots-ownership.test.js`,
`tests/critical-flows.test.js`, `AI.md`, `README.md`,
`LOG_DESENVOLVIMENTO.md` e este contexto mestre. A entrega cobre a detecção de
divergência cruzada, o merge aditivo de imagens local→nuvem, a união aditiva no
pull, a proteção de ownership e a verificação server-only.

## 13. Importador externo MVP — Radiopaedia → Atlas (2026-09-21)

- **Fluxo:** userscript Tampermonkey (`tools/radiopaedia-to-atlas.user.js`,
  fora do bundle) põe botão `📥 Enviar ao Atlas` em
  `https://radiopaedia.org/cases/*`, coleta SÓ metadados visíveis
  (título, URL, idade/sexo, modalidade, apresentação — sem imagens, sem
  tradução, sem inventar ausentes) e abre o Atlas com o payload pequeno em
  base64 no **fragmento** `#external-import=` (não em query persistente;
  `ATLAS_URL` configurável p/ localhost).
- **Recepção (fim do `index.html`, sem deslocar âncoras de teste):** consumo
  único no boot via gancho pós-`loadData` (wrapper, `loadData` original
  intacto); validação rigorosa (`validateExternalImportPayload`: https +
  host radiopaedia.org, título obrigatório, teto 4KB); limpeza imediata do
  fragmento com `history.replaceState` (F5 nunca reimporta); tudo em
  try/catch para nunca quebrar o boot.
- **Pré-checagem (read-only, sem libs):** URL exata > título exato normalizado
  (minúsculas, sem acentos, sem pontuação) > `externalMatchBand` conservadora
  em bandas **sem %**: `correspondência exata` / `alta similaridade` /
  `possível correspondência` (máx. 5; vazio mostra "✅ Nenhuma
  correspondência relevante"). Trava principal: **zero token relevante em
  comum ⇒ zero candidato** (stopwords PT/EN + tokens <3 letras fora, salvo
  com dígito). Título curto (≤2 tokens) só passa com Dice ou Lev ≥ 0.8;
  título longo: alta com Dice ≥ 0.66 ou Lev ≥ 0.85, possível com Dice ≥ 0.5.
  Modal com tudo escapado via `esc()`.
- **v2 (2026-09-21):** separa título original (preservado, ex. no rótulo do
  link staged) de nome sugerido em PT (`suggestPortugueseLesionName`:
  catálogo via `enTerm` > glossário `EXTERNAL_IMPORT_TRANSLATIONS` >
  original + `needsReview`). Tags PT conservadoras (nome confiável +
  contexto forte + mapa fechado de modalidade + reuso de tag canônica,
  dedup normalizado, máx. 8); descrição curta só do seguro (vazio
  aceitável). Modal com campos editáveis (qualquer edição ⇒
  `edited_by_user`), re-precheck do nome em PT com alerta e
  [Abrir]/[Continuar], botão `✨ Revisar com IA` que só marca
  `aiReview:'pending'` (sem fetch, sem arquitetura paralela). Draft
  pré-preenche nome/notas/tags/links; existente nunca é sobrescrito.
- **Duas melhorias de UX (2026-09-21):** (1) `✨ Revisar com IA` abre caixa
  com textarea ("O que você quer que a IA revise?"); confirmar grava
  `aiReview:'pending'` + `aiReviewInstruction` no draft (vazio usa texto
  genérico; reeditável com preview discreto) — sem nenhuma chamada externa.
  (2) Descrição da imagem no Quiz: bloco legível (15px/1.5) **acima** da
  imagem, visível **só após responder** (`quizImageDescHtml(label,
  answered)` pura; `renderMedia()` re-executa ao responder e ao navegar,
  sempre no `quizImgIdx` atual; some na próxima questão). Carrossel,
  contador, setas, lightbox, SRS e grades intactos.
- **Decisão 100% humana:** abrir lesão existente (só navega + bloco
  informativo, sem anexar), criar nova (abre `openForm(null)` em draft com
  nome pré-preenchido + referência encaminhada aos links, persistindo só no
  Salvar) ou cancelar (descarta, `DATA` intacto). Nenhum caminho de import
  chama `saveData`/`pushToFirebaseNow` nem muta `DATA`.
- **Testes:** `tests/external-import.test.js`, **67 PASS** (escopo +
  anti-falso-positivo + v2 PT + instrução de IA + bloqueio de duplicata +
  consolidação mesmo-id), e `tests/quiz-image-desc.test.js`, **8 PASS**
  (visibilidade, carrossel, reset, escape, sem duplicar).
- **Consolidação mesmo-id (auditoria 2026-09-21):** 3 objetos distintos com o
  mesmo `formEntryId` (triplo submit pré-trava). `consolidateSameIdDuplicates`
  (console, localhost): snapshot obrigatório (motivo da allowlist) → exige
  exatamente 3 ocorrências → metadados iguais → 3 imagens distintas →
  principal = 1ª ocorrência + união dedup (imagens/tags/links, escalares
  "mais completo vence", assignedAt intacto) → splice por índice decrescente
  (NUNCA filter por id) → pós-condição → saveData. SRS/revisões (mesmo id)
  intocados. Causa do `links:[]`: a referência exigia clique manual; agora o
  draft já sai com os campos de link encaminhados (só persiste no Salvar).
  Rede extra: id já existente no save vira update, nunca push duplicado.
- **Bloqueio de duplicata no Salvar (auditoria 2026-09-21):** o botão Salvar
  só desabilitava DEPOIS dos uploads — duplo-clique criava 2+ lesões com o
  MESMO `formEntryId`. Correção: trava `formSaving` no handler (+ reset em
  todos os retornos/finally) e `findExactLesionMatch()` antes de
  upload/persistência de lesão NOVA (identidade seção+sítio+nome normalizado
  ou sourceUrl já registrada) com modal [Abrir existente]/[Cancelar]/
  [Continuar mesmo assim + confirmação extra]. Botão Criar do importador com
  trava anti-duplo-clique. Edição existente intocada (só atualiza).

## 14. Produtividade de imagens — assignedAt + dashboard (2026-09-21)

- **Auditoria prévia:** nenhum timestamp por imagem existia (só leitura
  diagnóstica de `img.createdAt` e `_userUpdatedAt` da lesão). `assignedAt`
  (ISO) = primeira atribuição confirmada; nasce SÓ em
  `stampNewImagesAssignedAt()` nos 2 pontos reais (Salvar do editor,
  Concluído do Quiz). Históricas nunca ganham retroativo (só total geral).
- **Regras:** dia LOCAL (não 24h); mesma identidade (`stableImageKeyV208`,
  chave não-vazia) conta 1; sem assignedAt = fora da série; remoção sem
  ledger (derivado do estado atual); sync nunca gera — no merge
  (`unionEntryImages`, pull/push/reconciliação) fica o válido MAIS ANTIGO.
- **Dashboard:** 5º KPI `🖼️ N imagens hoje` (grid 4→5 col); entre Evolução
  (largura ~metade: 1.12fr→.56fr) e Estado do acervo, o card `Imagens
  atribuídas na última semana` (SVG próprio linha+pontos+`<title>`, 7 dias
  com zeros, subtítulo `Imagens no acervo: X · Lesões com imagem: Y / Z`
  com Z=`DATA.length`). Empilha em telas menores pelos breakpoints
  existentes. Refresh ao vivo via `refreshStudyDashboardLive()` chamado nos
  2 saves (sem listeners novos). O KPI abre o modal "Imagens adicionadas
  hoje"; abrir lesão dali mostra "← Voltar para imagens de hoje" no detalhe
  (`openDetail` com `returnTo`, demais fluxos inalterados).
- **Âncoras:** `critical-flows.test.js` atualizadas para 6056/6066/8608/11602
  (+5 union, +5 save do editor; CSS do grid editado in-place, resto após
  11592). Testes: `tests/image-productivity.test.js`, **20 PASS**.

## 15. Descrição geral do quadro de imagens (2026-09-21)

- Campo canônico de descrição de imagem no Atlas é **`label`** (detalhe,
  Quiz, edição) — nada de `collageDescription`/`boardDescription`.
- Builder ganhou textarea `Descrição geral do quadro` (após
  Layout/Rótulos/Resolução, antes da prévia); no `Inserir`, ela vira o
  `label` (`resolveCollageLabel`: descrição > join das seqs > 'Quadro
  multimodal'). Canvas NUNCA a recebe (só seqs individuais, como antes).
- Reedição pré-preenche via `collageInitialDesc` (só se o rótulo não for o
  join automático); edição posterior pelo input existente da galeria.
- Efeitos automáticos: Quiz mostra via `quizImageDescHtml` (só pós-resposta);
  detalhe/lightbox iguais às demais; 1 `assignedAt` no save (painéis-fonte
  nunca entram no DATA). Assinatura do builder ganhou 5º param opcional
  `existingLabel` (fluxo Cloudinary/sync intocado).
- Âncora `importHandler` do `critical-flows`: 11651 (+28). Testes:
  `tests/collage-desc.test.js`, **15 PASS**.

## 16. Contadores de imagem na sidebar (2026-09-21)

- Linha única por seção/site: `TOTAL · 🖼IMAGENS · COM_IMAGEM/TOTAL` (zeros
  sempre visíveis; tooltip nativo com o resumo). Nome com ellipsis, stats com
  `nowrap` (media 760px reduz a fonte).
- Simplificação visual (2026-09-21): só cobertura `38/243` (numerador
  `cov-num` em `var(--amber)`, denominador discreto); cálculo reutilizado,
  sem total isolado, sem absoluto de imagens, sem 🖼.
- Funções puras: `sectionStats`/`siteStats` + `buildSidebarImageStats` (1
  passada por render, mesmo conjunto do `structure()`, altPlacements
  incluídos como o total existente). Estoque atual (`images.length` +
  `img` legado; "com imagem" = `lesionHasAnyImage`); sem `assignedAt`.
- Refresh pelo fluxo atual (`renderAll` nos saves; Quiz chama `renderAll`
  após concluir). Sem listeners/intervals; scope/ordenação/filtro intactos.
- Testes: `tests/sidebar-image-stats.test.js`, **20 PASS**.

## 17. Bootstrap seguro em dispositivo novo (Alteração 055, 2026-09-21)

**Causa do "Atlas abre zerado em outro computador", corrigida.** Um
dispositivo/navegador sem catálogo local ainda (`STORAGE_KEY` ausente no
IndexedDB — sempre verdadeiro na primeira abertura num computador novo)
fazia `loadData()` usar o `SEED` cru (sem imagens/SRS/progresso). Mais
adiante, no MESMO carregamento, um `pushToFirebaseNow()` incondicional
enviava esse catálogo vazio para o Firestore — como `writeShardedState()`
faz `.set()` (substituição total, não mescla), isso sobrescrevia o estado
real que já existia na nuvem. **Confirmado antes de corrigir:** o computador
principal tinha IndexedDB local intacto e a nuvem estava íntegra (1213/1213
lesões, 65/65 registros com imagem, 89/89 imagens, 11/11 altPlacements,
49/49 SRS) — nenhuma recuperação manual foi necessária.

- **Bloqueio central:** `deviceBootstrapPending` (flag global) faz
  `writeShardedState()` — o único ponto que escreve no Firestore — recusar
  QUALQUER envio (automático ou pelos botões explícitos) enquanto `true`.
- **Detecção:** liga em `loadData()` quando `STORAGE_KEY` está ausente/não
  parseia (mesmo sinal que já existia; não inventa heurística nova).
- **Verificação server-only:** `checkCloudForBootstrapV1()` reaproveita
  `readCloudAuditFromServer()`. Só é "vazio legítimo" quando NENHUM
  documento existe em `atlas_state/main` (nunca sincronizado por ninguém);
  offline/erro nunca vira "vazio" — bloqueia e oferece tentar de novo.
- **Decisão explícita:** `openNewDeviceBootstrapModal()` (sem fechar por
  clique fora/ESC) mostra o que a nuvem tem e pede: carregar (reaproveita
  `syncFromFirebase()`, o MESMO pull não destrutivo de "atualizar deste
  backup/nuvem" — sem lógica de merge paralela) ou confirmar, com aviso
  explícito de sobrescrita futura, que quer continuar vazio.
- **Preservação automática (herdada de `syncFromFirebase`/
  `mergeEntryNonDestructive`/`unionEntryImages`, sem código novo):** imagens
  (união aditiva, sem duplicar), `assignedAt` (mais antigo válido vence),
  SRS mais novo, REVIEW/SESSIONLOG (máximo preservado), ownership (conflito
  automático bloqueado e registrado, nunca resolvido em silêncio).
- **Marcador local:** `atlas:v1:deviceInitialized` (`localStorage`, nunca
  sincronizado, fora do backup) — só evita reabrir a pergunta à toa; quem
  decide "é novo?" continua sendo a ausência do próprio catálogo.
- **Dispositivo já inicializado:** nenhum destes caminhos é acionado —
  comportamento idêntico ao de antes desta alteração.

Testes: `tests/device-bootstrap.test.js` (**32 PASS**) e
`tests/critical-flows.test.js` (**21 PASS**, âncoras 6221/6231/8773/11853).

**✓ VALIDADA em teste manual pelo usuário (21/09/2026).** Considerada
BASELINE ESTÁVEL do projeto, junto com as Alterações 056 e 057. Ainda sem
commit/publicação (aguardando pedido explícito do usuário).

## 19. Descrição persistente de imagens e quadros (Alteração 056, 2026-09-21)

**✓ VALIDADA em teste manual pelo usuário (21/09/2026).** Considerada
BASELINE ESTÁVEL do projeto, junto com as Alterações 055 e 057.

`label` continua o **único** campo canônico de descrição de imagem — nenhum
campo novo foi criado (`description`/`collageDescription`/`boardDescription`
seguem inexistentes como propriedade de imagem, regra mantida). O que era
inconsistente foi corrigido: a galeria do editor (`openForm`) e a caixa de
edição do modal "🖼 Adicionar imagem" do Quiz usavam `<input>` de uma linha;
agora usam `<textarea rows="3">` (sem `maxlength`, `resize:vertical`), igual
ao construtor de quadro (que já era `<textarea>`, só ganhou `rows="3"`).

- **Lightbox (o gap real):** `openImageLightbox(src, description)` — sem
  descrição, nada muda; com descrição, aparece **abaixo** da imagem
  (`.lightbox-content` em coluna + `.lightbox-desc`, nunca sobreposta, com
  scroll interno se o texto for longo), escapada com `esc()`. Detalhe da
  lesão e as duas galerias de edição sempre passam a descrição (sem
  "spoiler" nesses contextos); a ferramenta de auditoria técnica de imagens
  não foi alterada.
- **Quiz — regra de sigilo preservada:** durante a pergunta,
  `openImageLightbox` **nunca** recebe a descrição
  (`st.answered ? cur.label : ''`) — mesmo gate que já protegia o bloco
  `quizImageDescHtml` acima da imagem. Depois de responder, a descrição
  aparece nos dois lugares (adjacente à imagem e, se maximizar, no
  lightbox).
- **Detalhe da lesão:** trocou o escape manual (só `<`) por `esc()`
  (escapa `&` também); `.detail-img-label` virou texto corrido (esquerda,
  `white-space:pre-wrap`) em vez de monoespaçado centralizado.
- **Persistência:** nenhuma mudança de lógica — `label` já viajava por
  `spread` em salvar/upload/sync/backup; texto longo/multilinha já
  sobrevivia a esse caminho inteiro.
- **Limitação preexistente, só registrada (não alterada nesta tarefa):** o
  merge aditivo não reconcilia campo a campo — `label` divergente da MESMA
  imagem em dois dispositivos faz o merge manter a versão do lado
  processado como base. Já valia pra qualquer campo de imagem antes desta
  entrega.
- **Alteração 055 intacta:** confirmado por `git diff` (nenhuma
  remoção/edição nos identificadores do bootstrap) e por
  `tests/device-bootstrap.test.js` continuando 32 PASS sem qualquer
  alteração no arquivo de teste.

Testes: `tests/image-description.test.js` (**21 PASS**, novo) e
`tests/quiz-images.test.js` (**102 PASS**, 2 ajustados + 1 novo).

### Ajuste visual (Alteração 057, mesmo dia, após teste real do usuário)

**✓ VALIDADA em teste manual pelo usuário (21/09/2026)** — "tudo
funcionando corretamente e a apresentação ficou excelente". Considerada
BASELINE ESTÁVEL do projeto, junto com as Alterações 055 e 056.

A lógica acima foi validada em teste real e **não foi alterada**. Só
apresentação: detalhe da lesão limita a descrição a 2 linhas visuais
(`-webkit-line-clamp`, CSS puro) com clique para expandir/recolher (toggle
de classe, `label`/`DATA` nunca tocados); lightbox ganhou
`.lightbox-content{width:min(1200px,94vw)}` — a coluna de texto não fica
mais presa à largura da `<img>` — e `padding`/`line-height` mais compactos
em `.lightbox-desc` (sem reduzir a fonte); `quizImageDescHtml` recebeu o
mesmo polimento de respiro, **sem** nenhum truncamento (continua mostrando
o texto inteiro após responder). Alteração 055 reconfirmada intacta.

Testes: `tests/image-description.test.js` (**31 PASS**, +10 novos).
`tests/critical-flows.test.js` com as âncoras atuais: 6247/6257/8799/11884.

## 20. Overlay residual pós-save (bug 2026-09-21, corrigido sem commit)

- Sintoma: após Salvar edição, tela cinza + scroll travado até um clique.
- Causa: `refreshStudyDashboardLive()` chamava `getStudyOverlay()`, que CRIA
  a `#study-overlay` quando ausente — o `!ov.isConnected` nunca barrava.
  As chamadas no pós-save (produtividade de imagens) criavam o backdrop com
  o dashboard fechado; o clique caía no próprio backdrop (`closeOverlay`).
- Correção: lookup direto sem criar (`getElementById('study-overlay')`).
  Com o dashboard aberto, tudo funciona igual; fechado, retorna sem tocar.
- Testes: `tests/modal-cleanup.test.js`, **14 PASS**.

## 21. Expansores do formulário (UX 2026-09-21, sem commit)

- Seletores de sequência/modalidade por imagem, tags avançadas (sugestões
  por grupo) e localização adicional começam recolhidos (▸); preview,
  descrição, tags atuais, ações e chips intactos e sempre visíveis.
- Só alterna `hidden`/rótulo/aria — sem persistência, sem mudar DATA, save,
  chips, sync ou Cloudinary. Estado expandido por imagem via WeakSet.
- Testes: `tests/form-collapse.test.js`, **9 PASS**.

## 22. Layout desktop do editor (UX 2026-09-21, sem commit)

- Modal largo (`min(1180px, 100vw-40px)`, `max-height:92vh`) com scroll
  interno (`.lesion-form-body`) e rodapé sticky (Cancelar/Salvar sempre
  visíveis); grade Seção/Sítio/Incidência (3→2→1 colunas); galeria 2-3
  colunas; espaçamentos compactos. CSS embutido no template (sem tocar no
  `<style>` global); expansores e overlay-residual preservados.
- Testes: `tests/form-layout-desktop.test.js`, **10 PASS**.

## 23. Paste amplo + zoom profundo (UX 2026-09-21, sem commit)

- Seção de imagens do editor virou zona de paste (`#images-field` focável +
  dica); campos de texto nunca interceptados (`pasteTargetIsText`); mesmo
  pipeline `addLocalFile` (pending até Salvar, sem upload antecipado).
- Lightbox com zoom 1–20x (roda com âncora no cursor, botões −/100%/+/Reset,
  % discreto), pan com clamp quando ampliada, duplo-clique/EESC, estado por
  abertura; assinatura e classes preservadas; sem CSS novo.
- Correção lateral: `imagesAssignedLast7Days` com duck-type de Date
  (cross-realm; teste flaky pós-meia-noite eliminado).
- Testes: `tests/image-handling.test.js`, **18 PASS**.

## 24. Próximos passos pendentes

1. **Bootstrap seguro em dispositivo novo** (2026-09-21) — implementado,
   testado e **VALIDADO em teste manual pelo usuário** (Alteração 055, ver
   seção 17 e seção 25). Nenhuma ação pendente; commit/publicação
   dependem de pedido explícito.
2. **Descrição persistente de imagens e quadros** (2026-09-21) —
   implementado, testado e **VALIDADO em teste manual pelo usuário**
   (Alteração 056); ajuste visual de acabamento aplicado no mesmo dia,
   também validado (Alteração 057, ver seção 19 e seção 25). Nenhuma ação
   pendente; commit/publicação dependem de pedido explícito.
3. **Merge aditivo e sincronização validados** (2026-09-21) — servidor/site
   conferido após o merge com 58 registros com imagens, 73 imagens e 44 SRS.
   Nenhuma ação pendente aqui.
4. **Preferências locais de navegação** (2026-09-20, revisto 2026-09-22): só
   o Quiz lembra a última seção/site (`atlas:v1:lastQuizScope`); o catálogo
   sempre nasce limpo no reload (Todas, sem tags, Revisões=Todas) e o botão
   Limpar restaura esse estado. `atlas:v1:lastSidebarScope` segue gravado por
   compatibilidade, mas o boot o ignora. Sem nuvem. Feito.
5. **Eventuais refinamentos do fluxo de IA** (sem API/segredo; sempre com
   confirmação humana e sem autoaceite).
6. **Manutenção incremental** (pequenas correções, sempre preservando dados,
   imagens e ownership).

## 25. Validação manual — Alterações 055, 056 e 057 (Alteração 058, 2026-09-21)

O usuário testou manualmente (funcional e visualmente) as três entregas
anteriores e aprovou todas explicitamente:

- **Alteração 055** — bootstrap seguro em dispositivo novo.
- **Alteração 056** — descrição persistente de imagens e quadros.
- **Alteração 057** — refinamento visual das descrições.

Todas as três são consideradas **BASELINE ESTÁVEL do projeto**. Esta
entrada (Alteração 058) é **só documentação** — nenhum código funcional foi
alterado.

**Nota (atualização posterior):** as Alterações 055–058 foram commitadas e
publicadas em `origin/main` no commit `670ffd6` (mediante pedido explícito
do usuário) — ver seção 1. As Alterações 059 em diante (auditoria forense
de imagens + correção pontual) vieram DEPOIS desse push e ainda não foram
commitadas.

Última execução da suíte completa nesta sessão (antes do push): **730
PASS, 5 TODO, 1 FAIL histórico** (`duplicate-detection.test.js`, fora de
escopo). `git diff --check`: sem erros.

## 26. Correção pontual de ownership — Abscesso cerebral / Oligodendroglioma (Alteração 059, 2026-09-21)

Auditoria forense (cross-reference entre o `SEED` congelado em 18/09/2026
no git — antes de qualquer reconciliação ao vivo — e um backup real
exportado do app em 20/09/2026) confirmou que 2 imagens
(`atlas-radiologico/o0ykul2z1qp00pp6yxel`,
`atlas-radiologico/n5oyigvmkpb8zpqykd3g`) tiveram o próprio `lesionName`
reescrito de "Abscesso cerebral" para "Oligodendroglioma". Causa raiz: o
antigo sincronismo canônico por id (hoje inerte,
`CANONICAL_REFRESH_DISABLED_V250=true`) casou um registro persistido com o
SEED só pelo `id` posicional no instante em que o SEED foi
reordenado/compactado (70 duplicatas removidas em 18/09/2026 11:46, commit
`c27fe256`) — **o mesmo mecanismo já documentado para o bug do C-RADS em
lesões fetais** (§3.1), agora confirmado também via `images`. As outras 63
ocorrências no acervo são `LEGACY_ID_ONLY` (id desatualizado, nome já
correto) — inofensivas, não tocadas.

- **`fixAbscessoOligodendrogliomaOwnership20260921()`** (nova, só console,
  mesmo padrão de `consolidateSameIdDuplicates`): localiza origem/destino
  por identidade semântica (`exactLesionIdentityKey`, s+site+nome) —
  nunca por `seed_N`; confirma as 2 imagens pelo `publicId` exato;
  snapshot obrigatório (aborta se falhar ou se qualquer pré-condição
  falhar); usa o guard manual existente
  (`assertManualImageOwnershipChange`/`IMAGE_OWNERSHIP_MANUAL`); reaproveita
  `removeImageFromLesionData`/`addImageToLesionData`; persiste via
  `saveData()`. Preserva assetId/publicId/URL/label/source/attribution/
  `assignedAt` (nunca carimba um novo); sem upload/destroy no Cloudinary.
  **Precisa ser executada pelo usuário no console do navegador contra o
  `DATA` real** — sem acesso ao Firestore/IndexedDB ao vivo nesta sessão.
- **Proteção arquitetural:** o bloco de sincronismo canônico por id em
  `loadData()` (continua desligado, `CANONICAL_REFRESH_DISABLED_V250=true`
  — **não reativado**) ganhou checagem de identidade semântica antes de
  copiar qualquer campo; identidade divergente é **registrada**
  (`registerImageOwnershipConflict`), nunca aplicada automaticamente.

Testes: `tests/ownership-fix-20260921.test.js` (**10 PASS**, novo).
`tests/critical-flows.test.js` com as âncoras atuais: `importHandler` foi
para 11900 (as outras três não mudaram). Suíte: 740 PASS, 5 TODO + 1 FAIL
histórico.

**✓ EXECUTADA E CONFIRMADA no `DATA` real pelo usuário (21/09/2026).**
`fixAbscessoOligodendrogliomaOwnership20260921()` rodada no console do
navegador: `{ ok:true, reason:'2 imagem(ns) movida(s) de
"Oligodendroglioma" para "Abscesso cerebral"' }`, snapshot
`snap_mubyvs5t_x2jmnm` criado antes da correção. Conferência visual manual
aprovada: Oligodendroglioma sem as imagens incorretas; Abscesso cerebral
com as 2 imagens corretas. Considerada **BASELINE ESTÁVEL**, junto com as
Alterações 055–058.

## 27. Sincronização multi-PC — pull automático reativado (Alteração 068, 2026-09-23)

### Causa raiz do "PC do hospital abriu com metade das imagens"

Um dispositivo **já inicializado** (catálogo local existente no IndexedDB, de
uma abertura de semanas atrás) nunca consultava a nuvem de novo em nenhum
boot — só **empurrava** (`pushToFirebaseNow()` roda incondicionalmente no fim
de `loadData()` e a cada `saveData()`) o que tinha localmente. O único ponto
que consultava a nuvem automaticamente era o bootstrap de **dispositivo
NOVO** (Alteração 055, seção 17), que só dispara quando o IndexedDB local
está genuinamente vazio (`STORAGE_KEY` ausente) — nunca o caso de um PC que
já foi usado antes. Como `writeShardedState()` faz `.set()` (substituição
total do documento, não merge), o push incondicional do fim de todo boot já
sobrescrevia no Firestore qualquer imagem/lesão que só existisse na nuvem
(adicionada por outro computador nesse meio tempo) — **mesmo sem o usuário
editar nada**, só de abrir a página num PC desatualizado.

Isso tinha sido desligado de propósito na **Alteração 008 (2026-09-19)**
porque, naquela época, o merge de `syncFromFirebase()` reintroduzia
duplicatas/ownership que a reconciliação V2 tinha acabado de consolidar. Essa
causa específica está coberta hoje por proteções que não existiam em
2026-09-19: `SUPPRESSED_DUPLICATE_IDS_V172` filtra dos DOIS lados (local E
remoto) qualquer id de duplicata do SEED atual antes do merge;
`mergeEntryNonDestructive()`/`unionEntryImages()` nunca perdem imagem (união
aditiva por identidade estável) nem movem ownership
(`canChangeImageOwnership` exige contexto manual; conflito vira registro em
`IMAGE_OWNERSHIP_CONFLICTS`, nunca resolução silenciosa). Todas essas
proteções já eram usadas e testadas pelos 3 call sites explícitos que nunca
deixaram de existir (exportar backup, restaurar padrão de fábrica, `⬇
atualizar deste backup/nuvem`) e pela escolha "carregar" do bootstrap de
dispositivo novo.

### O que foi alterado

- `loadData()`: reativa `await syncFromFirebase();`, **guardado por
  `if(!isNewLocalDevice)`** — dispositivo novo já resolveu a decisão
  explicitamente no modal do bootstrap alguns passos antes (seção 17);
  repetir o pull automaticamente ali pisaria na escolha do usuário (inclusive
  "usar vazio mesmo assim"). Roda depois do bootstrap de dispositivo novo e
  ANTES de qualquer push incondicional do resto do boot — para que, quando o
  push acontecer, ele já leve o estado MESCLADO (local ∪ nuvem), nunca o
  local desatualizado sozinho.
- `setSyncStatus(ok, detail)`: ganhou três variáveis de estado em memória
  (`syncPushPending`, `lastSyncOkAt`, `lastSyncErrorAt`/`lastSyncErrorDetail`)
  — nunca persistidas, nunca sincronizadas. Usadas pelo diagnóstico e pelo
  retry automático abaixo.
- **Retry automático ao reconectar:** um listener `window.addEventListener('online', …)`
  reenvia (`pushToFirebaseNow()`) sozinho quando a última tentativa tinha
  falhado (`syncPushPending`) e a conexão volta — sem exigir clique do
  usuário. Antes, uma edição feita offline ficava só local até a próxima
  edição/F5 empurrar por acaso.
- `buildSystemDiagnosticReport()`: a seção `--- SINCRONIZAÇÃO ---` ganhou
  linhas de texto (sem painel novo) com envio pendente SIM/NÃO, timestamp do
  último sucesso/erro e uma comparação local × nuvem read-only (reaproveita
  `buildSyncAudit()`).

### Segurança preservada (nada removido)

`deviceBootstrapPending`, `isNewLocalDevice`, o modal de bootstrap de
dispositivo novo, o bloqueio de push em `writeShardedState()`, a proteção de
ownership (`canChangeImageOwnership`/`assertManualImageOwnershipChange`), os
snapshots automáticos antes/depois de `syncFromFirebase()` e a verificação
pós-envio server-only (`readCloudAuditFromServer`/`syncCountersMatch`)
continuam **intactos** — nenhuma dessas proteções foi tocada. Nenhuma lógica
de merge nova foi criada: `syncFromFirebase()` é a MESMA função, usada pelos
mesmos 4 call sites explícitos de antes, com só mais um (o automático,
guardado).

### Testes

- `tests/critical-flows.test.js`: os 5 testes "ALTERACAO 008" foram
  reescritos como "ALTERACAO 068" (o pull automático agora É esperado, uma
  única vez, guardado por `!isNewLocalDevice`); âncoras recalculadas
  (`recovery` 6290, `brokenArtifacts` 6280, `loadData` 8832, `importHandler`
  12332).
- `tests/device-bootstrap.test.js`: os 2 testes de `loadData()` real ganharam
  asserts novos — dispositivo novo NÃO aciona `syncFromFirebase()` (o
  bootstrap já decidiu); dispositivo já inicializado/reload SIM aciona, antes
  de `renderAll()`.
- `tests/snapshots-ownership.test.js`: o teste antigo "nenhuma sincronização
  automática no boot" virou "pull automático é GUARDADO e usa só o merge não
  destrutivo já existente".
- `tests/multi-device-sync.test.js` (**novo**, 5 testes): simula dois
  "computadores" com `storage` local separado compartilhando uma nuvem falsa
  (Firestore em memória), rodando `loadData()`/`syncFromFirebase()`/
  `writeShardedState()`/`readShardedState()` REAIS via `vm`. Cobre: PC com
  local desatualizado recebe automaticamente o que só existia na nuvem, sem
  perda; PC edita e o outro dispositivo recebe essa edição num boot seguinte;
  divergência cruzada (imagem exclusiva de cada lado) vira união, sem perda
  em nenhum dos dois lados; dois boots seguidos sem mudança não duplicam
  imagem; identidade (`assetId`/`lesionId`/`lesionName`) sobrevive ao
  round-trip; nuvem indisponível no boot não trava nem perde o local.
- Suíte completa: **992 PASS**, 0 FAIL novo (3 falhas pré-existentes e fora
  de escopo continuam: 1 em `duplicate-detection.test.js` — já documentada
  na seção 25 como "histórica, fora de escopo" — e 2 em
  `images-history.test.js`, dependentes da data do sistema no dia do teste,
  confirmadas presentes mesmo sem nenhuma mudança de código).

### Pendências

Não commitado nem publicado (tarefa pediu explicitamente para testar antes
no localhost). Teste manual multi-PC real (dois computadores de verdade,
localhost ↔ site publicado ou dois localhosts) ainda não foi feito pelo
usuário — só os testes automatizados acima.

## 28. Barreira de reconciliação — bug real relatado no teste manual (Alteração 069, 2026-09-23)

### O que o usuário relatou

No primeiro teste manual real da Alteração 068 (dois computadores/navegadores
de verdade), o Chrome mostrou local=106/cloud=116 imagens (`Divergente: SIM`
no diagnóstico). Ao adicionar 1 imagem no Chrome, a nuvem **caiu** para 107
(perdeu as 10 imagens exclusivas). O Edge, aberto depois, ficou correto
(117 = 106+10+1), sincronizado com a nuvem.

### Investigação

Uma análise linha a linha de `pushToFirebase()`/`pushToFirebaseNow()`
confirmou uma falha real e comprovável, independente da hipótese mais
provável (aba do Chrome não recarregada, ainda rodando o código anterior à
Alteração 068 — sem cache-busting, um `index.html` local não se atualiza
sozinho numa aba já aberta): **quando `fbSyncing` está `true` (uma
reconciliação/pull está em andamento), `pushToFirebaseNow()`/
`pushToFirebase()` retornavam SEM FAZER NADA — nem erro, nem retry, nem
qualquer rastro.** Uma edição salva exatamente nessa janela ficava
local-only, silenciosamente, até a PRÓXIMA edição empurrar por acaso. Além
disso, `syncThisDeviceToCloud()`/`mergeThisDeviceImagesToCloud()` (botões
manuais) e a própria `syncFromFirebase()` (5 call sites) não tinham NENHUM
guard contra rodar concorrentemente com uma reconciliação já em andamento —
clicar em "☁ sincronizar este dispositivo" ou "⬇ atualizar deste backup/
nuvem" bem na janela em que o pull automático do boot ainda está lendo o
servidor competiria com ele.

Análise formal (single-thread JS, sem `await` entre pontos-chave) mostrou
que, DENTRO de uma mesma aba, o merge de `syncFromFirebase()` já se
autocorrige de uma edição concorrente (lê `DATA` fresco depois do único
ponto de `await` real) — mas o PUSH dessa edição podia ficar perdido em
silêncio, e ações EXPLÍCITAS (manuais) não tinham proteção nenhuma contra a
reentrância. Não foi encontrado um caminho de código, dentro de uma mesma
aba, que reproduza exatamente "cloud caiu de 116 para 107" — o que reforça
a hipótese da aba desatualizada como explicação mais provável do caso
relatado — mas as falhas acima são reais, comprovadas com um teste que FALHA
sem a correção e PASSA com ela (ver seção Testes), e foram corrigidas de
qualquer forma, como defesa em profundidade.

### O que foi implementado

- **Reentrância fechada num único ponto:** `syncFromFirebase()` ganhou
  `if(!fbDb || fbSyncing) return;` logo no topo — cobre os 5 call sites
  (pull automático do boot, "⬇ atualizar deste backup/nuvem", exportar
  backup, restaurar padrão de fábrica, escolha "carregar" do bootstrap) sem
  precisar duplicar o guard em cada um.
- **Nenhum push mais é descartado em silêncio:** `pushToFirebase()`/
  `pushToFirebaseNow()` marcam `syncPushPending=true` em vez de só retornar,
  sempre que `fbDb`/`appStateReady`/`fbSyncing` impedem o envio de
  acontecer de verdade.
- **Flush automático:** ao fim de `syncFromFirebase()` (sucesso OU falha),
  se `syncPushPending` ainda estiver `true`, um `pushToFirebaseNow()` extra
  é disparado — reenvia o estado já MESCLADO (nuvem + qualquer edição
  concorrente), nunca só o lado local desatualizado.
- **Botões manuais protegidos:** `syncThisDeviceToCloud()` e
  `mergeThisDeviceImagesToCloud()` ganharam `if(fbSyncing){ toast(...);
  return {ok:false, reason:'sync_in_progress'} }`, mesmo guard/mutex
  (`fbSyncing`) já usado no resto do projeto — nenhum flag paralelo criado.
- **Diagnóstico:** nova linha "Reconciliação em andamento agora" (`fbSyncing`),
  "Envio pendente" ampliado para cobrir também bloqueio por reconciliação/
  offline, "Dirty local", e uma nota quando a comparação Local×Nuvem foi lida
  enquanto uma reconciliação estava em andamento (evita o "Status: OK" +
  "Divergente: SIM" lado a lado sem explicação).
- **Auditoria read-only de IDENTIDADE de imagens** (`buildImageIdentityDivergenceReport`,
  `imageIdentityDivergenceForEntry`, `buildImageIdentityDivergenceAuditFromServer`):
  compara local × nuvem por identidade estável (`stableImageKeyV208`/
  `imageIdentityKeys`) e classifica cada imagem como só local, só nuvem, ou
  nos dois lados, além de detectar duplicata exata (mesma imagem 2x do MESMO
  lado). Nunca apaga/move/funde — só relata. Acoplada ao diagnóstico do
  sistema (só roda quando a contagem de imagens diverge) e disponível para
  chamada manual/console.

### Segurança preservada

`fbSyncing` continua sendo o ÚNICO mutex de "não deixe nada automático
empurrar agora" (mesmo usado por `restoreSafetySnapshot`/
`openRecoveryInspector`) — não foi criado um segundo flag paralelo
(`syncReconciliationInProgress`) que fragmentaria essa proteção. Nenhuma
lógica de merge nova: `syncFromFirebase()`/`mergeEntryNonDestructive()`/
`unionEntryImages()` continuam intocadas. `deviceBootstrapPending` e o
bootstrap de dispositivo novo continuam intocados.

### Testes

`tests/multi-device-sync.test.js` ganhou um teste de CONCORRÊNCIA que
reproduz proporcionalmente o cenário relatado (nuvem com 13 imagens, local
stale com 3, edição concorrente feita exatamente durante o pull — usando um
portão controlável na leitura do documento principal, sem `setTimeout`) e
prova: (1) o push da edição concorrente fica PENDENTE, nunca escreve na
nuvem com o estado pré-merge; (2) o resultado final é a união completa
(13+1=14), nunca "só a edição" (3+1=4, proporcional ao 107 relatado); (3) a
nuvem, ao final, também reflete a união. **Verificado por sanity-check:**
revertendo temporariamente só a correção de `pushToFirebaseNow()`, este
teste FALHA (`push bloqueado precisa ficar marcado como pendente` — `false
!== true`) — confirma que o teste realmente captura o defeito, não é um
falso-positivo. 3 testes novos de auditoria de identidade (pura). Suíte
completa: **996 PASS**, 0 FAIL novo (as mesmas 3 falhas pré-existentes/fora
de escopo de sempre).

### Pendência

A hipótese mais provável para o caso relatado (aba do Chrome não
recarregada) precisa ser confirmada pelo usuário no próximo teste manual —
abrindo uma aba NOVA (ou dando um hard-refresh, Ctrl+Shift+R) antes de
repetir o cenário. Um mecanismo de "a nuvem mudou desde o último pull deste
dispositivo, aborte o push e reconcilie de novo" (proteção adicional contra
DOIS dispositivos publicando quase ao mesmo tempo, sem que nenhum saiba do
outro) foi CONSIDERADO e não implementado nesta entrega — a barreira de
reconciliação acima já fecha o caminho comprovado; adicionar um
compare-and-swap contra o timestamp do servidor é uma mudança bem maior,
com risco de introduzir um novo defeito num sistema sensível, e não havia
evidência de que fosse a causa real deste caso específico. Fica como
possível trabalho futuro, só se o problema persistir após confirmar que a
aba estava mesmo atualizada.

## 29. Controle de revisão / concorrência otimista (Alteração 070, 2026-09-23)

### Prova real do bug (teste manual pós-hard-refresh)

Com o código da Alteração 069 já rodando (confirmado por hard-refresh), o
usuário reproduziu o problema de forma inequívoca: Chrome (13:43) mostrou
local=nuvem=108 imagens; Edge, aberto um minuto depois (13:44), mostrou
local=nuvem=118. A nuvem "pulou" de 108 para 118 sem nenhum pull intermediário
capaz de explicar isso — cada dispositivo estava fazendo a nuvem assumir o
PRÓPRIO estado local ao publicar, não convergindo de verdade.

### Cadeia exata localizada no código

`loadData()` tem **dois pontos de push incondicional** na mesma execução:
(1) o push interno ao final de `syncFromFirebase()` (bem-sucedido ou não) e
(2) o `await pushToFirebaseNow();` incondicional no fim de `loadData()`,
depois das auditorias/upgrades/dedup. Nenhum dos dois nunca conferia se a
nuvem ainda era a mesma versão que este dispositivo tinha acabado de ler —
`writeShardedState()` sempre fazia `.set()` cego. Se o PULL de um
dispositivo falhasse silenciosamente (timeout de rede, comum logo após um
hard-refresh com o SDK do Firebase ainda autenticando) OU se simplesmente
não trouxesse nada de novo (nada para mesclar), o push seguinte ainda assim
escrevia — sem qualquer garantia de que a nuvem não tivesse mudado
entretanto por outro dispositivo.

### Mecanismo implementado — revisão + transação Firestore

- Documento principal (`atlas_state/main`) ganhou o campo `revision`
  (inteiro, começa em 0, incrementado a cada escrita bem-sucedida).
- `readShardedState()`: toda leitura bem-sucedida (existindo ou não o
  documento) grava a revisão vista em `lastKnownCloudRevision` — `null`
  significa "nunca lido com sucesso nesta sessão".
- `writeShardedState()`: recusa escrever se `lastKnownCloudRevision===null`.
  Caso contrário, escreve dentro de uma **transação real do Firestore**
  (`fbDb.runTransaction`) que relê a revisão atual e só faz `tx.set()` (meta
  + todos os chunks, atomicamente) se ela bater com `lastKnownCloudRevision`
  — senão lança um erro `cloud_revision_conflict` e a transação aborta SEM
  escrever nada. É a transação em si (não uma leitura solta seguida de
  `.set()`) que fecha o TOCTOU: se outro dispositivo comitar entre a leitura
  e o commit desta transação, o Firestore detecta e aborta esta também.
- `writeShardedStateWithConflictRetry()` (novo, chamado por
  `writeShardedStateSerialized()`): ao ver `cloud_revision_conflict` ou
  `no_known_revision`, chama `syncFromFirebase()` (com um sinal interno
  `syncFromFirebaseSkipTrailingPush` que suprime o push próprio dela, pra
  evitar reentrância) — reconcilia com o merge não destrutivo de sempre — e
  tenta escrever UMA vez mais, já com o estado mesclado. Se a segunda
  tentativa também falhar, desiste (estado local preservado,
  `syncPushPending` continua `true`, tenta de novo na próxima chamada).
- Limpeza de chunks excedentes continua FORA da transação (best-effort,
  como antes) — não faz parte do snapshot lógico que precisa ser atômico;
  `chunkCount` na meta já reflete o tamanho novo, então um chunk extra que
  sobre nunca é lido de volta.

### Segurança

Nenhum "cloud-wins" nem "local-wins": o merge continua sendo
`mergeEntryNonDestructive`/`unionEntryImages`, intocado. A transação do
Firestore garante atomicidade real (não uma checagem solta com janela de
corrida). `deviceBootstrapPending`, a barreira `fbSyncing` (Alteração 069)
e todas as proteções de ownership continuam intactas.

### Testes

`tests/multi-device-sync.test.js` ganhou 2 testes novos: (1) cenário EXATO
pedido — dois dispositivos partem da mesma revisão conhecida (simulado
diretamente, sem inflar a revisão com boots redundantes), B publica
primeiro, a escrita CRUA de A é recusada (`lastWriteRefusedReason ===
'cloud_revision_conflict'`, nuvem intocada), e o caminho real de salvar
(`saveData`) se autocura sozinho — reconcilia e tenta de novo, terminando
com a união completa (base + edição de B + edição de A) tanto localmente
quanto na nuvem, verificado por um terceiro dispositivo independente; (2)
boots repetidos com estado idêntico gastam sempre o MESMO número de
escritas (nunca crescente — descarta a hipótese de loop). `tests/critical-
flows.test.js`, `tests/device-bootstrap.test.js` (mock de
`fbDb.runTransaction` + `lastKnownCloudRevision`/`CLOUD_REVISION_FIELD`) e
`tests/snapshots-ownership.test.js` (assinatura `tx.set(FB_META_REF()...)`
em vez de `FB_META_REF().set(...)`) atualizados. Suíte completa: **998
PASS**, 0 FAIL novo (as mesmas 3 falhas pré-existentes/fora de escopo).

**Armadilha encontrada e corrigida durante a implementação:** dois
comentários novos continham, sem querer, texto que confundia parsers de
teste ingênuos (sem consciência de comentário `//`) — um apóstrofo
("marca d'água") foi lido como abertura de string, e uma citação literal
da assinatura `async function syncFromFirebase(){` dentro de um comentário
fez `indexOf()` de um teste achar a ocorrência ERRADA (dentro do próprio
comentário) em vez da função real. Ambos corrigidos reescrevendo o texto
sem alterar o sentido.

### Escopo — não implementado

`loadData()` continua empurrando incondicionalmente ao fim do boot mesmo
quando o merge não trouxe nem levou nada de novo (confirmado pelo teste
"BOOT COM ESTADO JÁ IDÊNTICO": um único boot já pode gravar mais de uma vez
— o push interno de `syncFromFirebase()` e o push final de `loadData()`).
Isso é uma escolha deliberada: a barreira de revisão acima já GARANTE que
esse push nunca pode sobrescrever algo mais novo (só teria êxito se a
revisão bater), então um push "desnecessário" é uma ineficiência de rede
(mais uma revisão gasta), não um risco de perda de dados. Implementar
"pular push quando o merge não mudou nada" exigiria comparar corretamente
se o LOCAL tem conteúdo exclusivo não presente no remoto — uma checagem
sutil (comparar `DATA` antes/depois do merge não é a comparação certa: ver
raciocínio completo descartado na sessão) — com risco real de, se
implementada errado, pular um push que era necessário e silenciosamente
deixar uma edição exclusiva sem chegar à nuvem. Não implementado nesta
entrega; possível otimização futura, sem urgência (não é um risco de dados).

## 30. Separação pull/push no boot + investigação de ownership (Alteração 071, 2026-09-23)

### Novo teste manual real (terceira rodada)

Com a Alteração 070 já rodando, o usuário reproduziu OUTRO sintoma: Edge às
14:25:30 com local=nuvem=118 (revisão 2, sem divergência); Chrome, aberto
28s depois, às 14:25:58, com local=nuvem=108 (revisão 4, sem divergência) —
**sem nenhum conflito de revisão registrado**. Ou seja: o simples BOOT do
Chrome reduziu a nuvem de 118 para 108, de forma "legítima" do ponto de
vista da barreira de revisão (a escrita bateu com a revisão que Chrome
tinha acabado de ler) — confirmando que o problema restante não era mais
concorrência entre dispositivos, e sim o **próprio fluxo de boot** fazendo
push mesmo sem nenhuma edição do usuário. Depois de mais edições em ambos
os navegadores, a proteção de revisão funcionou corretamente num conflito
real (Edge terminou 82/120, registrando "a nuvem mudou desde a última
leitura — reconciliando..."). O Chrome ficou stale (80/109) e a nova
auditoria de identidade (Alteração 069) listou corretamente **11 imagens
reais exclusivas da nuvem** (não duplicatas), distribuídas em 7 lesões
nomeadas (Glioblastoma, Abscesso cerebral, Hematoma subdural, etc.).

### Causa real do 118→108

`loadData()` tinha dois pontos de push **incondicional**: o push interno
de `syncFromFirebase()` (sempre disparava depois de um merge bem-sucedido,
mesmo sem nada exclusivo local) e o push final de `loadData()` (sempre
disparava no fim do boot, mesmo sem nenhuma mudança das auditorias/upgrades
subsequentes). Nenhum dos dois verificava se o LOCAL realmente tinha algo
que a nuvem ainda não tivesse — só "acabou de mesclar, então publica".

### O que foi implementado

- **`syncFromFirebase()`**: depois do merge, calcula `localHasExclusiveContent`
  — reaproveita `buildImageIdentityDivergenceReport()` (mesma função do
  diagnóstico, nenhuma lógica nova) para saber se alguma imagem é exclusiva
  do local; verifica se alguma lesão existe só localmente; e compara
  REVIEW/SRS/SESSIONLOG (já mesclados) contra os valores crus do remoto —
  se nenhum dos dois lados achar nada exclusivo do local, **não publica**.
- **`loadData()`**: marca `DATA`/`REVIEW`/`SRS` logo após o bloco de dedup
  pós-sync (que já era condicional) e só chama o push final do boot se algo
  realmente mudou nos passos seguintes (upgrades de descrição, dedup v171,
  barreira de suprimidos) — não incondicionalmente.
- **`pushToFirebase()`/`pushToFirebaseNow()`**: correção de um efeito
  colateral descoberto durante a implementação — antes de `appStateReady`
  ficar `true`, uma chamada aqui é só plumbing interno de boot (ex.:
  `saveOrder()`/`saveSiteOrder()` persistindo um valor padrão), nunca uma
  intenção real de sincronizar; marcar `syncPushPending=true` nesse momento
  fazia o flush de `syncFromFirebase()` reenviar sem necessidade real. Agora
  só marca pendente quando o bloqueio acontece DEPOIS do app estar pronto
  (offline ou reconciliação em andamento) — os únicos casos que representam
  uma intenção genuína de envio.
- **Investigação de ownership × pull** (não uma correção — ver abaixo):
  `unionEntryImages()`/`canChangeImageOwnership()` bloqueiam a adoção de
  uma imagem remota quando a etiqueta interna dela (`img.lesionId`) diverge
  do id da lesão-alvo do merge, MESMO a imagem estando guardada dentro do
  array `images` dessa mesma lesão na nuvem (cenário real documentado:
  Alteração 059, reetiquetagem incompleta após fusão/reordenação de
  posição). Provado com um teste dedicado usando o código real — não
  alterado, porque relaxar essa checagem reintroduziria exatamente o bug
  que ela foi criada para prevenir (C-RADS/Abscesso-Oligodendroglioma).
  Ficou **visível** no diagnóstico: `getImageOwnershipConflicts()` (já
  existia, nunca era mostrado em lugar nenhum) agora aparece na seção de
  sincronização do diagnóstico do sistema.

### Segurança

Nenhuma lógica de merge nova (reaproveita `buildImageIdentityDivergenceReport`).
Ownership NÃO foi relaxado — apenas tornado visível. `deviceBootstrapPending`,
`fbSyncing`, o controle de revisão (Alteração 070) e todas as proteções
anteriores continuam intactas. `saveData()` (chamada por toda edição real do
usuário) continua chamando `pushToFirebaseNow()` incondicionalmente — só os
DOIS pontos automáticos do boot passaram a ser condicionais.

### Testes

`tests/multi-device-sync.test.js` ganhou: (1) cenário EXATO pedido — PC
stale sem nenhuma edição recebe tudo da nuvem (várias lesões, imagens
reais, não uma só) e gasta **ZERO** escritas; (2) PC stale COM 1 imagem
exclusiva recebe a nuvem inteira E publica só essa imagem — **exatamente
UMA** escrita, união completa dos dois lados; (3) teste de ownership × pull
provando a etiqueta interna divergente bloqueando adoção, com controle
(etiqueta batendo adota normalmente). **Armadilha encontrada e corrigida
durante a implementação:** o motor de teste (`makeDevice()`) esquecera de
incluir `buildImageIdentityDivergenceReport`/`imageIdentityDivergenceForEntry`
no `vm` — a chamada lançava `ReferenceError`, capturado pelo próprio
`catch` de `syncFromFirebase()`, que marcava `syncPushPending=true` via
`setSyncStatus(false,...)` e disparava o push mesmo assim pelo flush —
mascarando o bug por um caminho de erro que "parecia" funcionar. Corrigido
incluindo as duas funções no motor do teste; os testes passam agora pelo
caminho de código pretendido, não por um efeito colateral de erro. Suíte
completa: **1001 PASS**, 0 FAIL novo (as mesmas 3 falhas pré-existentes).

### Pendência

Sem acesso aos dados reais desta sessão, não foi possível confirmar se
ownership é de fato a causa das 11 imagens do caso relatado — só que é um
mecanismo REAL e reproduzível no código que produz exatamente esse padrão
(imagens genuínas, não duplicatas, presas do lado da nuvem). O usuário pode
confirmar rodando o diagnóstico do sistema no navegador real: a nova linha
"Conflitos de ownership bloqueados nesta sessão" mostrará a contagem e o
detalhe (de qual lesão pra qual) se for esse o caso. Se confirmado, a
correção correta é MANUAL (abrir a lesão, reassociar a imagem pelo editor
— único caminho que `canChangeImageOwnership` libera), nunca automática.

## 31. syncDirty persistente + zero escritas no boot + normalização segura de etiqueta legada (Alteração 072, 2026-09-23)

### O que foi implementado

- **Bandeira `syncDirty` persistente** (`atlas:syncDirty` no navegador):
  só é levantada por salvamento REAL do usuário (`saveData()` normal,
  `saveReview()`, `saveSRS()`, `saveSessionLog()`); só é abaixada quando
  um push é confirmado pela nuvem. `syncFromFirebase()` decide puxar x
  publicar por ela — sem a bandeira, nenhum caminho publica.
- **Modo "só local" (`internal=true`)** em `saveData()`/`saveReview()`/
  `saveSRS()`/`saveSessionLog()`: persiste no navegador sem levantar a
  bandeira e sem publicar. Todo caminho de boot/migração/dedup usa esse
  modo (`migrateLegacyLocalImagesToCloudinary`, `deduplicateV171`,
  `dupResult`, reconciliações, bootstrap). Evolui a 071: antes, o boot
  condicional ainda publicava quando migrações mudavam algo; agora,
  boot/migração nunca publicam sozinhos — a edição real publica depois.
- **Normalização segura de etiqueta legada** (6 pares reais
  `seed_8→seed_7`, `seed_11→seed_10`, `seed_21→seed_18`,
  `seed_413→seed_404`, `seed_414→seed_405`, `seed_477→seed_464`):
  `normalizeLegacyImageOwnerLabel()` — função de console/manutenção,
  nunca chamada automaticamente — reescreve SÓ `img.lesionId`, SÓ com as
  6 condições provadas (array certo + `assetId`/`publicId` + identidade
  única + dono `seed_N` histórico), registrando
  `legacy_image_owner_label_normalized`. Conflito real continua bloqueado.

### Segurança

`canChangeImageOwnership()` NÃO foi relaxado (teste dedicado prova o
bloqueio sem contexto manual). Nada automático publica, normaliza, move
ou funde imagem. Âncoras de `critical-flows` remedidas (hunk a hunk
contra o diff: deslocamento totalmente explicado, sem duplicação).

### Testes

`multi-device-sync`: 23 PASS (sync A–C + normalização D + conflito E +
auditoria de diff F). Marcadores de extração de `local-scope-prefs` e
`lesion-review` atualizados para `saveData(internal)` (só teste).
Suíte completa: **1015 PASS**, 3 FAIL — as mesmas 3 pré-existentes da
071 (pares órfãos do `DUPLICATE_PAIRS_V171` + 2 de "hoje" com data fixa
de 22/09), reproduzidas no código publicado, sem relação com a 072.

## 32. Normalização de etiqueta legada dentro do pull (Alteração 072b, 2026-09-23)

A 072 deixou a normalização pronta mas sem chamar em fluxo automático —
um PC desatualizado bloquearia para sempre as imagens legítimas com
etiqueta histórica. Integração SOMENTE ao merge/pull remoto:
`tryNormalizeLegacyPullImage()` (mesma tabela de decisão da função de
console, agora compartilhada) é tentado dentro de `unionEntryImages()`
apenas com `sourceLabel 'pull'` + catálogo atual repassado; só o
`syncFromFirebase()` repassa (`localData` pré-merge) e só quando local e
remoto têm o mesmo id. Push (`mergeEntryForImagePush`), importação e
recuperação nem recebem o parâmetro — bloqueio puro, provado por testes.
Normaliza SÓ `img.lesionId` (cópia; objeto remoto não mutado),
`lesionName` intacto, evento `legacy_image_owner_label_normalized`;
conflito real continua bloqueado. Sem hardcode de pares (6 reais +
1 sintético passam pelo mesmo caminho). Suíte: **1019 PASS**, 3 FAIL
pré-existentes.

## 33. Falso positivo: holders por stable key única (Alteração 072c, 2026-09-23)

Caso real 118/120: 2 assets (Abscesso/seed_10, etiqueta seed_11)
bloqueados embora o MESMO asset não existisse em outra lesão. Causa: a
072b considerava qualquer chave parcial (mesmo publicId de re-upload =
asset diferente) como conflito real. Correção: holders por
`stableImageKeyV208` (mesma noção do auditor/diagnóstico) + evento de
bloqueio informa `conflictingHolders`. `canChangeImageOwnership()`
intacto; sem hardcode. Suíte: **1021 PASS**, 3 FAIL pré-existentes.

## 37. Pre-push reconciliation (Alteração 074, 2026-09-23)

Bug real 118→116: save com revisão válida escreveu snapshot local
incompleto (2 cloud-only nunca adotadas) e a nuvem perdeu o que só ela
tinha — REVISION MATCH != conteúdo completo. Novo fluxo de todo SAVE:
persiste local+dirty → relê nuvem ATUAL → merge conservador (união +
tombstones + normalização; edições locais por timestamp/união) → escreve
a UNIÃO pela transação/revisão. Núcleo `reconcileStateWithRemote()`
extraído do pull (mesma lógica, pull e pre-push). Hooks:
`pushToFirebaseNow`, Salvar do editor, "Enviar este dispositivo";
`mergeThisDeviceImagesToCloud` já relia; exceção única:
`forceThisDeviceToCloud` (aviso reforçado). Offline/leitura-falha: não
escreve às cegas (dirty/pending). Sem reentrância (mutex liberado antes
da escrita). Diagnóstico: último reconcile + cloud-only preservados.
Residual: conflito genuíno não aborta save; asset sobrevive na
detentora; bloqueio registrado. Suíte: **1046 PASS**, 3 FAIL
pré-existentes.

## 35. Consistência final — 2 assets do Abscesso (investigação, sem fix) (2026-09-23)

Auditoria determinística em fontes congeladas: ambos os assets
fisicamente em `seed_11`="Oligodendroglioma" (snapshot 19/09) com nome
clínico "Abscesso cerebral"; auditoria 21/09 prova contaminação 059
(nome reescrito Abscesso→Oligodendroglioma 18/09→20/09); nuvem hoje
`seed_10`="Abscesso cerebral" os contém (etiqueta seed_11 = slot
posicional antigo — legada legítima). Mesmo asset em dois lugares =
CONFLITO REAL; bloqueio correto; sem bug no helper (label nunca entra
no mapa de holders). Nova `auditImageHoldersByStableKey()` read-only
(fim do script, sem deslocar âncoras) para confirmar no Chrome ao vivo.
ALERTA: tombstone 073 é global por identidade — excluir as cópias de
`seed_11` pelo editor hoje apagaria também as boas de `seed_10` no
próximo pull; NÃO excluir até escopo por (key, lesionId). Suíte:
**1031 PASS**, 3 FAIL pré-existentes.

## 34. Tombstones de imagem excluída (Alteração 073, 2026-09-23)

Merge aditivo não propaga deletes (ausência simples nunca apaga —
indistinguível de "ainda não chegou"). Exclusão explícita (Salvar/
Concluído confirmados) registra tombstone `{key, lesionId, deletedAt}`
por stable key; viaja no documento principal (mesma transação/revisão),
storage local e backup; merges (pull e envio) unem pelo mais recente,
não adotam e removem local; boot varre; sem GC; sem ressurreição
automática (tombstone vence, documentado). Editor marca dirty e limpa
após escrita confirmada. Diagnóstico: contadores de tombstones.
Ownership/legacy intocados; snapshots sem tombstones; Cloudinary
intocado. Suíte: **1029 PASS**, 3 FAIL pré-existentes.

## 36. Tombstone scoped por lesão (Alteração 073b, 2026-09-23)

Global por identidade apagaria a cópia boa junto (caso seed_10/
seed_11). Novo modelo: chave `lesionId + stableKey` ("removida DESTA
lesão"); legado sem `lesionId` segue global (sem inventar dono);
`normalizeTombstoneMap` re-indexa mapas antigos ao carregar/unir;
matching por lesão nos 4 pontos (merge pull, solo-remota, envio,
varredura); merge por par com deletedAt mais novo; global+scoped
coexistem. Fluxos, transação/revisão/dirty, ownership e normalização
intocados; sem hardcode. Suíte: **1039 PASS**, 3 FAIL pré-existentes.

## 38. Histórico 075–082 (resumo a partir do Git, 2026-09-24)

Estas proteções não tinham sido registradas aqui; resumo fiel às mensagens de
commit e aos comentários do código.

- **075** (`d6b3f1e`) — quarentena permanente dos ids `seed_1213..seed_1282`
  (`QUARANTINED_HIGH_IDS_20260924`, filtrados em DATA/REVIEW/SRS/payload).
- **076** (`43533ed`) — reconcile antes de enviar também no push com atraso
  (SRS/REVIEW/ordem) e dirty seguro no Salvar do editor.
- **077 / 077b** (`55579fc`, `b84bd00`) — `restoreCanonicalStateToCloud`
  isolado (console, `expectedRemoteRevision`, bloqueio de race) e REVIEW
  canônico corrigido após a quarentena.
- **078** (`8dda3a1`) — dispositivo novo "carregar da nuvem" adota a nuvem 1:1
  (`adoptRemoteStateForNewDevice`), sem merge com o SEED.
- **079 / 079b** (`d7d02b4`, `45aae37`) — barreira final de quarentena no
  write; remoto vence sem timestamp; primeiro filtro de imagens stale.
- **079c** (`48e91a0`) — barreira final de imagens dentro da transação de
  `writeShardedState` (`gateStaleLocalOnlyImagesForWrite`).
- **079d** (`13a3166`, `f8c9445`) — imagem só-local só sobe com marcador
  explícito persistente `atlas:pendingLocalImageAdds`.
- **080** (`eca4b1c`) — bloqueia e saneia links duplicados (editor, boot,
  reconcile).
- **081** (`13c1914`) — teste de invariante `tests/links-dedup-invariant.test.js`.
- **082** (`aff09e4`) — deduplicação de links por URL semântica.

## 39. Proteção 083 — título e tags do importador Radiopaedia (2026-09-25)

### Causa raiz
- `tools/radiopaedia-to-atlas.user.js` → `extractTitle()` usava
  `firstText(['h1.case-title', 'h1', 'meta[property="og:title"]'])`. Quando a
  página não tinha `h1.case-title`, o seletor GENÉRICO `'h1'` devolvia o
  PRIMEIRO `<h1>` do DOM — em algumas páginas, o nome do usuário/autor
  ("Leonardo Paggi Andrade"). O `og:title` nunca era alcançado (e, dentro de
  `firstText`, nem funcionava: `meta` não tem `innerText`).
- O Atlas aceitava qualquer título (só tamanho/host validados) → `draft.title`
  = autor → `suggestPortugueseLesionName` caía em "original + needsReview" →
  zero candidatos (zero token em comum) → `suggestExternalTags` só com a
  modalidade. O autor nunca virava tag (tags só vêm de vocabulário/candidatos/
  nome confiável/mapa de modalidade); o sintoma era a ausência de tags.
- O DOM real do Radiopaedia NÃO pôde ser inspecionado (site inacessível do
  ambiente remoto); a correção não depende dele.

### Correção (defesa em profundidade)
- **Userscript v1.1.0:** sem `<h1>` genérico. Candidatos: `og:title` (via
  `content`), seletores específicos (`h1.case-title`, `.case-title h1`,
  `h1.header-title`) e `document.title`, sem o sufixo do site. Candidato é
  descartado se for igual a um nome de autor/perfil visível
  (`meta[name=author]`, `[rel=author]`, `a[href*="/users/"]`, `.author`,
  `.byline`, `.user-name`, `.username`) ou se não tiver NENHUM termo em comum
  com o slug da URL do caso (`/cases/<slug>`, derivado do título clínico pelo
  próprio Radiopaedia). Sem candidato confiável: título do slug; sem slug
  utilizável: título vazio (nada é enviado — nunca o autor).
- **Atlas (`index.html`, bloco do importador, depois das âncoras):**
  `externalCaseSlugTitle` + `reconcileExternalImportTitle`, chamado em
  `maybeHandleExternalImport` antes do modal. Protege também quem ainda usa o
  userscript ANTIGO: título sem termo em comum com o slug é trocado pelo título
  do slug (`titleFromUrl: true`); slug sem palavras → payload intacto
  (compatível com payloads antigos). Nada mais mudou no fluxo (validação,
  vínculo com lesão existente, criação, salvamento).
- Tags continuam conservadoras (sem mudança em `suggestExternalTags`): com o
  título correto voltam o nome confiável (catálogo via `enTerm`/glossário) e as
  tags de candidatos/vocabulário; sem base real, continuam vazias.

### Arquivos alterados
`tools/radiopaedia-to-atlas.user.js`, `index.html`,
`tests/external-import.test.js` (12 testes novos + 5 funções no harness do
teste 14, ajuste mecânico), `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `external-import` 79/79 (12 novos: autor não vira título; og:title/
  h1 específico/document.title válidos; og:title=autor rejeitado → slug; sem
  slug e só autor → vazio; ausência do `'h1'` genérico; ida-e-volta
  userscript→Atlas; defesa do Atlas p/ payload antigo; título coerente
  mantido; sem slug não inventa; gancho em `maybeHandleExternalImport`; autor
  nunca vira tag e tags voltam com título correto; tags conservadoras sem
  base). `clinical-cases` 47/47, `critical-flows` 23/23 (âncoras inalteradas),
  `modal-cleanup` 14/14, `quiz-images` 103/103, `multi-device-sync` 145/146
  (F2 = arquivo protegido ausente).
- Suíte (ambiente remoto): 1157 · 1122 · 30 · 5 — mesmas falhas da base
  (1145 · 1110 · 30 · 5). Esperado no ambiente local: 1167 · 1159 · 3 · 5.

### Pendências
- `extractModality()` ainda varre a página inteira (ver "Problema aberto
  atual" no topo).
- Userscript instalado no Tampermonkey precisa ser atualizado manualmente para
  a v1.1.0 (o Atlas já corrige o título mesmo com a versão antiga, via slug).
