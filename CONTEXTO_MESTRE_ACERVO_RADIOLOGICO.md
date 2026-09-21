# CONTEXTO MESTRE — Acervo Radiológico (Atlas Radiológico)

Documento de referência do estado ATUAL do projeto. Leia junto com `AGENTS.md`,
`AI.md`, `README.md` e `LOG_DESENVOLVIMENTO.md`. Em caso de divergência entre
uma cópia antiga e o repositório, o repositório e o código valem.

## 1. Estado do Git / publicação

- **Nota (2026-09-21):** HEAD local e `origin/main` publicados coincidem em
  `c628d09` ("Melhora importacao imagens quiz e cobertura do acervo"). As
  Alterações 055, 056, 057 (seções 17/19) estão implementadas, testadas e
  **validadas manualmente pelo usuário** (ver seção 21), mas **ainda não
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
  verdade. O push local→nuvem é automático em `saveData`/`pushToFirebaseNow`; o
  pull nuvem→local NÃO é automático no boot (desativado na Alteração 008) e só
  roda em ações explícitas. Localhost e GitHub Pages têm IndexedDB separados —
  o elo é o Firestore. Há auditoria read-only local × nuvem e botões explícitos
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
| `tests/local-scope-prefs.test.js` | **14 PASS**, 0 FAIL |
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
| Total (suíte completa) | **736 testes, 730 PASS, 5 TODO, 0 FAIL** |

- `tests/duplicate-detection.test.js` tem 1 FAIL **histórico e fora de escopo**
  (`DUPLICATE_PAIRS_V171`, 28 entradas malformadas). Não corrigir sem pedido.
  (Não entra na tabela acima nem no total, por ter esse FAIL conhecido — ver
  `README.md`.)
- `tests/critical-flows.test.js` usa âncoras de linha exatas; após edições antes
  das âncoras, atualizar via script. Valores atuais (Alteração 057):
  **6247/6257/8799/11884** (`brokenArtifacts`/`recovery`/`loadData`/
  `importHandler`, respectivamente).
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
  2 saves (sem listeners novos).
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

## 20. Próximos passos pendentes

1. **Bootstrap seguro em dispositivo novo** (2026-09-21) — implementado,
   testado e **VALIDADO em teste manual pelo usuário** (Alteração 055, ver
   seção 17 e seção 21). Nenhuma ação pendente; commit/publicação
   dependem de pedido explícito.
2. **Descrição persistente de imagens e quadros** (2026-09-21) —
   implementado, testado e **VALIDADO em teste manual pelo usuário**
   (Alteração 056); ajuste visual de acabamento aplicado no mesmo dia,
   também validado (Alteração 057, ver seção 19 e seção 21). Nenhuma ação
   pendente; commit/publicação dependem de pedido explícito.
3. **Merge aditivo e sincronização validados** (2026-09-21) — servidor/site
   conferido após o merge com 58 registros com imagens, 73 imagens e 44 SRS.
   Nenhuma ação pendente aqui.
4. **Preferências locais de navegação** (2026-09-20): a última seção/site da
   sidebar e do Quiz já são lembrados de forma independente em `localStorage`
   (`atlas:v1:lastSidebarScope` / `atlas:v1:lastQuizScope`), sem nuvem. Feito.
5. **Eventuais refinamentos do fluxo de IA** (sem API/segredo; sempre com
   confirmação humana e sem autoaceite).
6. **Manutenção incremental** (pequenas correções, sempre preservando dados,
   imagens e ownership).

## 21. Validação manual — Alterações 055, 056 e 057 (Alteração 058, 2026-09-21)

O usuário testou manualmente (funcional e visualmente) as três entregas
anteriores e aprovou todas explicitamente:

- **Alteração 055** — bootstrap seguro em dispositivo novo.
- **Alteração 056** — descrição persistente de imagens e quadros.
- **Alteração 057** — refinamento visual das descrições.

Todas as três são consideradas **BASELINE ESTÁVEL do projeto**. Esta
entrada (Alteração 058) é **só documentação** — nenhum código funcional foi
alterado. Estado do repositório: nada foi commitado nem publicado; `git
status` continua mostrando as mesmas alterações locais das três entregas
anteriores (mais esta atualização de documentação). Commit/publicação
seguem dependendo de pedido explícito do usuário (regra permanente de
`AGENTS.md`).

Última execução da suíte completa nesta sessão: **730 PASS, 5 TODO, 1 FAIL
histórico** (`duplicate-detection.test.js`, fora de escopo). `git diff
--check`: sem erros.
