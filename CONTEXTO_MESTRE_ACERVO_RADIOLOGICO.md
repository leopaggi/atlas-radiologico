# CONTEXTO MESTRE — Acervo Radiológico (Atlas Radiológico)

Documento de referência do estado ATUAL do projeto. Leia junto com `AGENTS.md`,
`AI.md`, `README.md` e `LOG_DESENVOLVIMENTO.md`. Em caso de divergência entre
uma cópia antiga e o repositório, o repositório e o código valem.

<!-- ===================== CHECKPOINT OPERACIONAL (manter no topo) ===================== -->

## ESTADO OPERACIONAL ATUAL

*Atualizado em 2026-09-26, junto do commit "Protecao 093c: restaura upload somente no salvar".*

- **Branch local de trabalho:** `master` (publicação: `git push origin master:main`).
- **origin/main antes da 093c:** `5e9b59b` (Protecao 093b). **Último commit:** Protecao 093c (código + testes + este checkpoint; hash exato em `git log -1`).
- **Baseline de testes (ambiente local do usuário, com os arquivos protegidos presentes) — esperado após a 093c:** 1447 testes · 1439 pass · 3 fail conhecidos · 5 todo (+8 `didactic-pending-images`). Os 3 fail conhecidos: `duplicate-detection` (1, `DUPLICATE_PAIRS_V171` histórico) e `images-history` (2, dependem da data do sistema).
  - Medido no ambiente remoto (sem os arquivos protegidos): 1437 · 1402 · 30 · 5 (base `5e9b59b` no mesmo ambiente: 1429 · 1394 · 30 · 5; conjunto de falhas idêntico, arquivo a arquivo). As +27 falhas do remoto são só falta de `snapshot-catalogo-completo-readonly.json`/`ATLAS_CANONICO_LIMPO_1216_116_FINAL.json` (24 `legacy-id-migration`, 1 `device-bootstrap`, 1 F2 do `multi-device-sync`) e `ownership-fix-20260921` abortando por CRLF. Nenhuma é regressão.
- **Validação real do usuário após a 091 (navegador):** `LESION_REVISIONS` sincronizou entre navegadores/PCs; as pendências apareceram no Edge; a lógica da 091 funciona; só foram encontrados problemas visuais (contraste/alinhamento) — corrigidos na 091b.
- **Firestore (informado pelo usuário; não verificável sem credenciais):** última cloud revision observada: 64. Rules intocadas pela 091b (só CSS/markup). Nenhuma escrita deliberada nesta tarefa. A 091 não cria campo/documento novo (pendências gerais vivem em `lesionRevisions`, sincronizado desde a 084). A 090 adicionou `reviewProgress` (histórico compacto do Quiz, até 8 tentativas por lesão) e `reviewOverride` (override manual) no documento principal; a 089 adicionou `reviewUpdatedAt` (carimbos de mudança manual do estado de estudo) no documento principal, na próxima publicação real. A 088 adicionou só o campo opcional `clinicalContext` DENTRO do objeto da imagem (viaja nos chunks como qualquer metadado de imagem). A 087 reaproveitou `img.label`/`panels[].seq`; a 086 também não (alerta derivado de `lesionRevisions`). Desde a 085 o documento principal tem `orderUpdatedAt`.
- **Proteções recentes concluídas:** 075 (quarentena `seed_1213..1282`), 076, 077/077b, 078, 079/079b/079c/079d (imagens stale; marcador `atlas:pendingLocalImageAdds`), 080/081/082 (links duplicados), 083 (título/tags do importador Radiopaedia), 084 (Central de Revisões sincronizada), 085 (ordem de seções/sítios entre dispositivos — seção 41), 086 (⚠ junto ao nome da lesão com revisão ativa — seção 42), 087 (sequência livre de RM — seção 43), 088 (contexto clínico por imagem, visível no Quiz antes da resposta — seção 44), 089 (estado de estudo estável — seção 45), 090 (estado AUTOMÁTICO pelo Quiz + override manual — seção 46; corrige o modelo da 089), 091 (pendências gerais do Atlas na Central de Revisões — seção 47), 091b (ajuste visual após validação real no navegador — seção 48), 091c (fusão clínica controlada de 4 grupos de duplicatas aprovados; mapa `lesionMerges` sincronizado — seção 49), **091d (editar motivo de revisão ativa com histórico, ⚠ clicável, importador externo com nome PT/enTerm/descrição/tags e "✨ Revisar com IA" criando revisão real — seção 50)**, **091e (importações do Radiopaedia reutilizam a aba já aberta do Atlas — seção 51)**, **091f (título do Radiopaedia sem branding + alias Paraovarian cyst; "✓ Marcar como resolvida" — seção 52)**, **091g (reuso da aba do Atlas via canal: ponte do userscript + BroadcastChannel; alvo nomeado vira fallback — seção 53)**, userscript 1.4.1/1.4.2 (www + regressão de boot — seção 54), **093 (conteúdo didático por lesão: casos manuais, sinais radiológicos, classificações e esquemas — seção 55)**, **090b (status AUTO baseado exclusivamente em tentativas reais do Quiz — seção 56)**, **093b (vínculos de imagens da galeria com casos clínicos, sinais e classificações — `imageRefs`; seção 57)**, **093c (restaura upload somente no Salvar para imagens didáticas — seção 58)**.
- **Invariantes importantes:** toda escrita normal passa por `writeShardedState()` (transação + `revision`); imagem só-local só sobe com marcador 079d; tombstone vence; ownership de imagem só muda manualmente; ids `seed_N` são posicionais; não "consertar" `DUPLICATE_PAIRS_V171`; links sem duplicata por URL semântica; título de caso externo nunca pode ser nome de autor (083); `lesionRevisions` com merge por reviewId (084); **ordem de seções/sítios com merge por carimbo de reordenação manual (`atlas:orderUpdatedAt` / `orderUpdatedAt`) em pull, pre-push e dentro da transação; normalização do render e default de boot são internos (nunca dirty/push) (085); "revisão ativa" só existe como derivação de `LESION_REVISIONS` via `hasActiveLesionReview()` — mesma regra dos badges 🔔/💡 (086); sequência de imagem é texto livre salvo exatamente (só trim externo), nunca convertido para opção pré-definida (087); `img.clinicalContext` é pré-diagnóstico, digitado pelo usuário, visível no Quiz antes e depois da resposta — a descrição (`label`) continua só depois (088); REVIEW (Não revisado/Revisando/Dominado) é AUTOMÁTICO pelo histórico do Quiz (`REVIEW_PROGRESS`, regra determinística `replayAutoReview`) salvo override MANUAL explícito (`REVIEW_OVERRIDE`), que o Quiz nunca sobrescreve; boot/render/pull não mudam nada sem dado novo; conflitos por recência, nunca Math.max (089/090); pendência GERAL (`scope:'global'`, `lesionId:null`) é só um pedido: nunca aplica nada em DATA (`global_review_has_no_direct_target`), nunca gera ⚠ em lesão, conclusão é humana (091)**. **091c:** id presente em `LESION_MERGES` nunca volta (nem pelo SEED, nem por PC desatualizado, nem por backup antigo); o mapa só cresce; a única exceção de ownership de imagem é o fold desse mapa (imagens marcadas com `mergedFromLesionId`). **091d:** o motivo (`requestText`) de revisão ativa é editável com `requestHistory` (união no merge) e carimbo próprio `requestTextUpdatedAt` (editar texto nunca mexe em `updatedAt`/status/🔔); não há IA integrada — "✨ Revisar com IA" só cria revisão na Central (ponte manual). **091f:** fusão clínica (091c) NÃO conclui revisão — ela só é redirecionada ao keeper; concluir é sempre ação humana ("✓ Marcar como resolvida" → `accepted`, sem tocar DATA). **093:** `clinicalCases`/`radiologicSigns`/`classificationSchemes` — itens com `id` estável, `order`, `createdAt`/`updatedAt` e exclusão por tombstone `deletedAt` (nunca apagar do array); merge por item; sinais/classificações NUNCA renderizados no Quiz antes da resposta; imagens didáticas antigas (formato 093) ficam dentro do item até o Salvar do editor as migrar. **090b:** estado AUTO = derivado SÓ de tentativas reais (`REVIEW_PROGRESS[id].a`, criadas só por `recordReviewAttempt`); sem tentativa real = Não revisado; `REVIEW` é cache derivado (recalculado no boot/pull/escrita), nunca fonte de verdade para o AUTO. **093b:** `entry.images` é a fonte ÚNICA do asset; casos/sinais/classificações guardam só `imageRefs` (`imageId` = `stableImageKeyV208`, a mesma chave dos tombstones), com merge POR vínculo e desvincular = tombstone `deletedAt` do vínculo; vincular nunca muda `updatedAt` do item nem `_userUpdatedAt` da lesão, nunca envia/copia asset e nunca acontece sem clique; imagem principal excluída = vínculo inerte (nunca ressuscita a imagem). **093c:** NENHUMA imagem vai ao Cloudinary antes do Salvar do formulário — nem as de sinal/classificação (arquivo/Ctrl+V = `buildPendingImage` em `pendingImgs`, vínculo com chave temporária `pending:…` trocada pela chave real só após o upload; `pending:` nunca é persistido).
- **Trabalho pendente FORA do main:** "fonte por imagem (`sourcePage`)" e "adicionar caso clínico manual no detalhe" continuam preservados no `stash@{0}` da sessão remota ("pendente: sourcePage por imagem + caso clinico manual") e num patch de backup. Intocados pela 091b. Não restaurar sem decisão explícita do usuário.
- **Passo manual pós-deploy (085):** ordens personalizadas feitas ANTES da 085 não têm carimbo. No PC que tem a ordem CORRETA, fazer uma reordenação qualquer (ex.: descer uma seção e subir de volta; idem um sítio em cada seção personalizada) — isso carimba e publica. Depois abrir o outro PC: ordem default/automática cede para a da nuvem sozinha. (Revisões pré-084: mesma lógica, ver seção 40.)
- **Passo manual pendente (091c):** a fusão NÃO foi executada no ambiente remoto (sem acesso aos dados reais). No navegador com os dados reais: 💾 exportar backup JSON → Ferramentas avançadas → "🧬 fusões clínicas aprovadas" → conferir o relatório (ids reais, keeper, motivo) → "Fundir". Depois abrir o outro PC e conferir que ele converge sozinho.
- **Passo manual (091e/091f/091g):** atualizar o userscript no Tampermonkey para a **v1.4.2** (`tools/radiopaedia-to-atlas.user.js`) e ACEITAR as novas permissões (`@match` do Atlas e de www.radiopaedia.org + `GM_setValue`/`GM_addValueChangeListener`/`GM_removeValueChangeListener`) — sem isso o reuso da aba não funciona (cai no fallback que abre aba). Título sem branding (091f) também é limpo pelo Atlas ao receber. Conferir no DevTools do Radiopaedia a linha `[Atlas userscript 1.4.2] ativo`.
- **Próximo passo exato:** executar no navegador a fusão da 091c (passo manual acima); conferir os vínculos 093b no navegador real (🔗 na galeria do detalhe/formulário; `auditDidacticImagesNow()` no console mostra se há imagens no formato 093 a migrar); depois Proteção 092 (sync de metadados de imagens entre PCs — legendas/overrides dos vínculos 093b já têm carimbo próprio).

## BACKLOG

- ~~Editar o motivo de uma revisão pendente clicando no ⚠, com histórico~~ — feito na 091d (seção 50).
- **PRÓXIMA PRIORIDADE: Proteção 092 — corrigir o merge de edição de metadados/contexto de imagens JÁ EXISTENTES entre PCs** (ver pendência abaixo).
- **093** — conteúdo complementar/classificações/estadiamento exibidos somente após responder no Quiz.
- **Auditoria semântica de duplicatas:** está sendo feita separadamente, em modo READ-ONLY, fora do app. NÃO confundir com `LESION_REVISIONS` (a Central só guarda pedidos/pendências; nada nela executa auditoria ou fusão).
- **Pendência de sync encontrada na 088 (pré-existente, recomendável tratar logo):** em `mergeEntryNonDestructive`, `unionEntryImages(local.images, remote.images)` mantém SEMPRE a versão local de uma imagem que existe nos dois lados. Uma EDIÇÃO posterior de metadados de uma imagem já existente (`label`, `clinicalContext`, `panels`…) chega à nuvem, mas um PC que já tinha a imagem mantém a cópia antiga no pull — e pode republicá-la no próximo envio dele. Imagens NOVAS (com label/contexto) propagam normalmente. `tests/image-description.test.js` proíbe hoje lógica específica de `label` nesse merge: a correção exige decisão explícita (ex.: metadados de imagem pelo `_userUpdatedAt` da lesão) e testes próprios.
- **Pendência pré-existente observada:** `uploadPendingImage()` copia só `label` + campos de fonte/licença (+ `clinicalContext` desde a 088); `panels` de um quadro novo criado no editor não são copiados no upload do Salvar (o quadro salvo não fica reeditável). Não alterado.
- Pendências funcionais posteriores:
  - fonte individual por imagem;
  - auditar o stash antigo antes de reimplementar funcionalidades já existentes.
- Herdado da 083: `extractModality()` do userscript ainda varre a página inteira (restringir à área do caso com base no DOM real); userscript no Tampermonkey precisa ser atualizado para a v1.1.0.

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
completo. **Desde a Proteção 091 aceita também pendências GERAIS do Atlas** (`scope:'global'`, sem lesão — ver seção 47). **Desde a Proteção 084 sincroniza entre dispositivos** pelo campo
`lesionRevisions` do documento principal do Firestore, com merge por reviewId
(`mergeLesionRevisions`) — ver seção 40. (Até a 083 era local por dispositivo.)

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

## 40. Proteção 084 — Central de Revisões + Soluções sincronizada entre dispositivos (2026-09-25)

### Causa raiz
- `LESION_REVISIONS` era persistido só no IndexedDB (`atlas:lesionRevisions`)
  e ficava FORA do payload remoto: `writeShardedState()` não gravava o campo,
  `readShardedState()` não o devolvia, `reconcileStateWithRemote()` não o
  mesclava, e a auditoria marcava `cloud.storesRevisions = false`. Decisão
  consciente da primeira versão da Central ("não sincroniza com Firebase") —
  por isso revisões/soluções criadas no PC A nunca apareciam no PC B.

### Estratégia de merge (`mergeLesionRevisions(local, remoto)`, função pura)
- Por `reviewId`: só-local fica; só-remoto é adotado; nada é apagado.
- Mesmo id nos dois lados: o `updatedAt` mais novo vence os campos escalares,
  `status` e `solution`. Empate: desempate pela serialização canônica
  (`canonicalJsonString`) — resultado idêntico em qualquer dispositivo.
- `history` (chave `timestamp|action`), `attempts` (chave `attempt.id`;
  sem id → conteúdo canônico) e `humanFeedback` (chave `at|text`) são UNIDOS
  sem duplicar: ordem do vencedor preservada, itens só do outro lado
  acrescentados e ordenados de forma estável pelo próprio timestamp.
- Todos os status preservados como estão (inclusive desconhecidos).
- Ausente/inválido (documento/backup/snapshot antigo) = `{}`.

### Onde entra no pipeline
- `writeShardedState()`: `lesionRevisions` no documento principal (mesma
  transação/revisão; mesmo `checkChunkSize` de ~1MB) e **unido com o remoto
  DENTRO da transação** — nenhum caminho de escrita (push, debounce,
  `syncThisDeviceToCloud`, `forceThisDeviceToCloud`, retry) apaga revisão que
  só existe na nuvem.
- `readShardedState()`: devolve `lesionRevisions` (fallback `{}`).
- `reconcileStateWithRemote()` (pull e pre-push): merge; `persistLocalStateNow()`
  e `syncFromFirebase()` persistem com `saveLesionRevisions(true)` (interno,
  sem dirty) e o pull atualiza os badges 🔔/💡 sem F5.
- `reconcileBeforePush()`: `lesionRevisions` entra nos dois lados da
  comparação no-op — mudança só na Central publica; estado idêntico não gasta
  revisão.
- `adoptRemoteStateForNewDevice()` (dispositivo novo): merge + persistência
  interna + badges.
- `saveLesionRevisions(internal)`: mesmo contrato de `saveReview/saveSRS` —
  ação do usuário marca dirty + `pushToFirebase()` (debounced, com
  reconcile); `internal=true` só persiste. `restoreSafetySnapshot()` usa
  `internal` (restauração manual continua sem sync automático). Importar
  backup continua sendo ação do usuário (publica, como antes fazia com o resto).
- Auditoria: `syncAuditCounters` ganhou `revisionsPending`,
  `revisionsSolutions` e `revisionsBytes` (tamanho serializado);
  `cloud.storesRevisions = true`; resumo mostra "Revisões (Central)" e
  "Revisões pendentes" local × nuvem.
- Backup/snapshot já incluíam `lesionRevisions` (sem mudança).

### Tamanho
- O campo viaja no documento principal. Lesão típica do catálogo ≈ 0,9 KB
  (p95 1,1 KB); cada tentativa guarda um `beforeSnapshot` da lesão, então uma
  revisão com 1–2 tentativas fica em ~3–6 KB. Se o documento principal passar
  de ~0,95 MB, `checkChunkSize` recusa a escrita (dirty preservado, aviso na
  barra lateral) — falha segura, sem perda. `revisionsBytes` na auditoria
  permite acompanhar. O tamanho real do acervo do usuário não pôde ser medido
  daqui (sem acesso aos dados).

### Riscos residuais / fora do escopo
- `restoreCanonicalStateToCloud()` (console, manual) grava um payload próprio
  sem `lesionRevisions` — após um restore canônico o campo some da nuvem, mas
  as cópias locais sobrevivem e voltam na próxima publicação (merge é união).
  Não alterado (fora do escopo; restore canônico não deve ser executado).
- `mergeThisDeviceImagesToCloud` não adota as revisões remotas localmente
  antes de escrever, mas a união dentro da transação preserva o remoto.
- Revisões pré-084 só sobem na próxima ação real de publicação (ver "Passo
  manual pós-deploy" no topo).

### Arquivos alterados
`index.html`, `tests/lesion-revisions-sync.test.js` (novo, 15),
`tests/multi-device-sync.test.js` (+7 cenários ponta a ponta + funções reais
no harness), `tests/device-bootstrap.test.js` (+2 + harness),
`tests/snapshots-ownership.test.js` (+1; `storesRevisions` agora `true`),
`tests/lesion-review.test.js` (stubs de dirty/push; teste estático agora
permite `pushToFirebase` só dentro de `saveLesionRevisions`),
`tests/critical-flows.test.js` (âncoras +85, deslocamento uniforme),
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `lesion-revisions-sync` 15/15; `multi-device-sync` 152/153 (novos:
  A→nuvem→B sem dirty/sem escrita; badges do PC B sem F5; R1+R2 união;
  updatedAt mais novo vence + unions de history/attempts/feedback; no-op e
  mudança só-revisão; nuvem antiga sem o campo; force não apaga revisão só da
  nuvem; F2 = arquivo protegido ausente); `device-bootstrap` 40/41;
  `snapshots-ownership` 48/48; `lesion-review` 138/138; `critical-flows`
  23/23; `modal-cleanup` 14/14. Checagem de mutação: remover o merge do
  reconcile ou o campo do no-op derruba os cenários 084.
- Suíte (remoto): 1182 · 1147 · 30 · 5 (base 1157 · 1122 · 30 · 5; mesmas
  falhas). Esperado no local: 1192 · 1184 · 3 · 5.

## 41. Proteção 085 — ordem de seções/sítios preservada entre dispositivos (2026-09-25)

### Causa raiz
- `reconcileStateWithRemote()` (pull e pre-push) tinha a regra "ordem local é
  preservada quando válida; remoto só preenche ausência". Mas a ordem local
  NUNCA fica vazia: o boot grava `DEFAULT_SECTION_ORDER` em `atlas:sectionOrder`
  quando a chave não existe, e o render (`orderedSectionNames`/
  `orderedSiteNames`) grava a ordem automática (extras em ordem alfabética).
- **Ponto exato:** o bloco `if((!Array.isArray(sectionOrder) || !sectionOrder.length) && …) sectionOrder = remote.sectionOrder;`
  (e o equivalente de `siteOrder`) em `reconcileStateWithRemote()`, repetido
  em `mergeThisDeviceImagesToCloud()`. Um PC já inicializado (com a ordem
  default) nunca adotava a ordem personalizada da nuvem — e o próximo push
  desse PC ainda gravava o default por cima da nuvem (o `set()` é do
  documento inteiro). Sem carimbo não havia como saber qual lado era
  intenção do usuário.
- Agravantes: reordenar manualmente não marcava dirty (um push bloqueado/
  offline se perdia no F5), e a normalização do render publicava sozinha ao
  abrir o app (violava a regra 072).
- PC realmente NOVO (IndexedDB vazio, "Carregar da nuvem") já adotava a ordem
  remota em `adoptRemoteStateForNewDevice()` — continua adotando (agora
  normalizada e com o carimbo).

### Correção
- **Carimbo de reordenação manual** `ORDER_STAMPS = { section, sites: { [seção]: ms } }`
  (IndexedDB `atlas:orderUpdatedAt`; Firestore `orderUpdatedAt` no documento
  principal). Carimbado só por `moveSection`, `reorderSectionDrag`,
  `reorderSite` (por seção) e pelas restaurações manuais (importar backup,
  restaurar snapshot — que antes sempre venciam a nuvem e continuam vencendo).
- **`mergeOrderState(local, remoto)`** (pura), usada em
  `reconcileStateWithRemote`, `mergeThisDeviceImagesToCloud`,
  `adoptRemoteStateForNewDevice` e DENTRO da transação de `writeShardedState`
  (nem `syncThisDeviceToCloud`/`forceThisDeviceToCloud` gravam default/ordem
  velha por cima de uma ordem mais nova):
  - carimbo mais novo vence (seções; sítios POR SEÇÃO — não destrói ordem de
    outra seção); empate de carimbo: desempate fixo (convergente);
  - sem carimbo nos dois lados (legado): ordem local que é só o default
    automático (`isAutoSectionOrder`: defaults existentes + extras
    alfabéticos; `isAutoSiteList`: alfabética) cede à remota; ordem local
    personalizada legada é preservada (comportamento antigo);
  - lado sem lista válida = usa o outro; itens que só o perdedor conhece
    entram no FIM, na ordem dele; duplicatas removidas; nunca reordena
    alfabeticamente o que já estava definido; itens fora do catálogo ficam
    guardados (o render os ignora).
- **Dirty/publicação:** `saveOrder(internal)`/`saveSiteOrder(internal)` com o
  mesmo contrato de `saveReview/saveSRS`. Default de boot e normalização do
  render = `internal` (só persiste). Reordenação manual e importação de
  backup = marcam dirty + push com reconcile. Pull/persist/adoção persistem
  o carimbo sem dirty. `loadData()` carrega o carimbo antes dos saves de boot.
- `reconcileBeforePush()`: `orderUpdatedAt` normalizado nos dois lados do
  no-op.

### Comportamento em PC novo
- IndexedDB vazio → "Carregar da nuvem" → `sectionOrder`/`siteOrder` remotos
  adotados integralmente (sem duplicatas) + carimbo; default só se a nuvem
  não tiver ordem válida; nada publicado; `syncDirty` segue false; F5 mantém.
- PC já inicializado com ordem default → no primeiro pull adota a ordem da
  nuvem (sem dirty, sem publicar); uma edição posterior publica com a ordem
  certa.

### Arquivos alterados
`index.html`, `tests/order-sync.test.js` (novo, 17),
`tests/multi-device-sync.test.js` (+7 ponta a ponta + funções reais no
harness), `tests/device-bootstrap.test.js` (+1 + harness/stubs),
`tests/critical-flows.test.js` (âncoras +23 nas três primeiras / +121 no
importHandler; stubs), `tests/snapshots-ownership.test.js` (stubs),
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `order-sync` 17/17 (remoto completo/parcial/ausente/inválido,
  duplicata, item removido, novo item no fim, carimbo por seção, legado auto
  × personalizado, convergência/idempotência, serialização, pipeline estático,
  saves reais internal × usuário, restauração carimba); `multi-device-sync`
  159/160 (novos: reordenação real marca dirty e sincroniza; PC novo adota
  exato sem dirty/sem publicar + F5; PC já inicializado com default adota e
  edição posterior não grava default; dois PCs convergem; nuvem legada sem
  ordem; novo item no fim sem publicar; force não apaga ordem mais nova;
  F2 = arquivo protegido ausente); `device-bootstrap` 41/42; `critical-flows`
  23/23; `snapshots-ownership` 48/48; `site-taxonomy` 42/42;
  `lesion-revisions-sync` 15/15; `modal-cleanup` 14/14. Checagem de mutação:
  voltar a regra antiga do reconcile derruba 2 cenários 085; remover o merge
  de ordem da transação derruba o cenário do force.
- Suíte (remoto): 1207 · 1172 · 30 · 5 (base 1182 · 1147 · 30 · 5; mesmas
  falhas). Esperado no local: 1217 · 1209 · 3 · 5.

### Limitações
- Ordem personalizada ANTERIOR à 085 não tem carimbo: entre dois PCs com
  ordens personalizadas diferentes e legadas, cada um mantém a sua até uma
  reordenação manual (que carimba) — ver "Passo manual pós-deploy" no topo.
- Uma ordem personalizada que coincida exatamente com a automática é
  indistinguível do default (cede à nuvem se legada).
- `restoreCanonicalStateToCloud()` (console) grava ordem sem carimbo;
  dispositivos com carimbo mantêm a própria ordem depois dele.
- Sem teste de DOM real (arrastar na sidebar): a reordenação foi testada
  pelas funções reais chamadas pelos handlers.

## 42. Proteção 086 — ⚠ junto ao nome da lesão com revisão ativa (2026-09-26)

### Objetivo
Mostrar, diretamente junto ao nome da lesão (não só no 🔔 geral do topo), um
alerta visual quando a lesão tem revisão ativa na Central de Revisões.

### Definição de "revisão ativa"
- Auditoria dos status reais de `LESION_REVISIONS` (atribuições
  `review.status = …`): `pending`, `rejected`, `proposed`,
  `applied_pending_validation`, `accepted`, `cancelled`,
  `manual_action_required`. Nenhum outro existe.
- **Ativa** = `pending`, `rejected` (voltou para a fila), `proposed`,
  `applied_pending_validation`, `manual_action_required` — exatamente o que
  alimenta o 🔔 (`getPendingReviews`) e o 💡 (`getReadySolutions`); há teste
  garantindo a equivalência. **Não alertam:** `accepted`, `cancelled` e
  qualquer status desconhecido.
- Função central única: `hasActiveLesionReview(lesionId)` (lista
  `ACTIVE_LESION_REVIEW_STATUSES`), no módulo da Central. Sem estado paralelo
  e sem campo remoto: 100% derivada de `LESION_REVISIONS`.

### Onde aparece
- Card da lista principal (`renderResults` — o mesmo renderer serve à busca,
  filtros e escopo da sidebar) e título do detalhe da lesão (`openDetail`).
  Quiz/dashboard de estudo e modais auxiliares ficaram fora desta etapa.
- Marcação: `lesionReviewWarningHtml(id)` → `<span class="lesion-review-warning"
  role="img" title/aria-label="Esta lesão possui revisão ativa">⚠︎</span>`
  (U+26A0 + VS15, forma de texto; sem imagem externa). CSS
  `.lesion-review-warning`: pílula amarela (#facc15) com símbolo escuro e
  borda âmbar — legível no tema claro e escuro; `vertical-align:middle`,
  `flex:none`, `white-space:nowrap`, `cursor:help`, margem pequena.

### Tempo real
- Cada elemento que mostra o nome carrega `data-review-warning-host="<id>"`.
  `refreshLesionReviewWarnings()` põe/retira o ícone NO LUGAR (nunca duplica,
  remove duplicata) e é chamada no fim de `updateReviewCenterBadges()` — que
  TODA mutação da Central já chamava (criar, propor, recusar, autorizar,
  aprovar, desfazer, cancelar, ação manual, reabrir, sugestão de posição,
  lote da IA), além de `renderAll()`, restaurar snapshot e importar backup.
  Nada é reconstruído (não fecha modal, não perde scroll).

### Integração com a 084
- O pull (`syncFromFirebase`) e a adoção de device novo já chamavam
  `updateReviewCenterBadges()` → a ⚠ aparece no PC B assim que a revisão do
  PC A chega, sem F5. Nenhum campo novo no Firestore.

### Arquivos alterados
`index.html` (CSS + 3 funções/2 constantes no módulo da Central + host/ícone
no card e no detalhe + 1 chamada em `updateReviewCenterBadges`),
`tests/lesion-review-warning.test.js` (novo, 16),
`tests/multi-device-sync.test.js` (+1 ponta a ponta; funções no harness),
`tests/images-today-modal.test.js` (2 stubs mecânicos no harness de
`openDetail`), `tests/critical-flows.test.js` (âncoras +36, uniforme),
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `lesion-review-warning` 16/16 (sem revisão; cada status ativo;
  finais/desconhecidos; mistura ativa/concluída; equivalência com 🔔/💡;
  tooltip/aria; ciclo real criar→propor→aplicar→aprovar some→rollback volta→
  cancelar some; refresh repetido não duplica; estado vindo do pull; render
  do card e do detalhe; CSS; nenhum campo remoto/estado paralelo);
  `multi-device-sync` 160/161 (novo: revisão do PC A → ⚠ no PC B após o pull;
  F2 = arquivo protegido ausente); `lesion-review` 138/138;
  `lesion-revisions-sync` 15/15; `critical-flows` 23/23; `modal-cleanup`
  14/14; `images-today-modal` 31/31.
- Suíte (remoto): 1224 · 1189 · 30 · 5 (base 1207 · 1172 · 30 · 5; mesmas
  falhas). Esperado no local: 1234 · 1226 · 3 · 5.
- Sem teste em navegador real (DOM simulado nos testes); conferir
  visualmente o ícone no card e no detalhe após o deploy.

## 43. Proteção 087 — sequência/protocolo de RM com texto livre (2026-09-26)

### Problema
As sequências só podiam vir de listas fechadas; sequências específicas (RM
musculoesquelética: T2 FAT SAT, PD FAT SAT, STIR, T2 Dixon, PD SPAIR, DWI
b1000…) não podiam ser registradas como usadas.

### Auditoria — campos reais (nenhum schema novo)
- Não existe campo "sequence/modality" próprio da imagem. Há DOIS pontos de
  entrada, ambos já strings livres no dado:
  1. **Editor da lesão** — chips "Sequências / modalidade"
     (`IMG_PRESET_GROUPS`: RM/TC/RX-MMG-US) acrescentam/removem partes de
     `img.label` (partes separadas por " · "); a textarea de descrição exibe e
     edita o mesmo `img.label`.
  2. **Construtor de quadro** (`openCollageBuilder`) — `<select>` FECHADO
     (`seqs`: RX, MMG, U.S, TC C-, TC C+, RM T1, RM T2, RM T1 +, RM FLAIR,
     RM DIFUSAO, RM ADC, RM SWI, ANGIORM) grava `panels[].seq`, queimado no
     canvas e usado na legenda automática (`resolveCollageLabel`).
- `img.modality` só é lido ao reabrir o editor (legado, concatenado ao label).
  O `modality` do importador externo é outro contexto (metadado do caso) —
  intocado.
- Busca textual (`filteredEntries`) pesquisa só nome/notas/tags — não legenda
  de imagem; não há filtro por sequência. Nada alterado aí. Quiz exibe o label
  como descrição (após a resposta) — intocado.
- Label/panels viajam dentro do objeto da imagem: IndexedDB, Firestore
  (chunks), backup e snapshot, sem nenhuma normalização.

### Solução de UI
- **Quadro:** o select mantém todas as opções e ganha "Outra / personalizada…";
  ao escolher, aparece um campo de texto (`.collage-seq-custom`) e o texto vai
  para `items[i].seq` (trim externo). Reabrir um quadro com `seq` fora da lista
  já abre em "Outra / personalizada…" com o texto preenchido. Trocar para uma
  opção padrão oculta o campo e grava a opção. Texto longo: a fonte do rótulo
  queimado no canvas diminui (28→14px) em vez de truncar. Campo não arrastável
  enquanto em foco (o painel é draggable).
- **Editor:** dentro de "Sequências / modalidade", nova linha "Outra /
  personalizada" com campo + "+ adicionar" (Enter também adiciona, sem
  submeter o formulário). Acrescenta o texto EXATO como mais uma parte da
  legenda — mesma lógica dos chips: não duplica, não apaga as outras; o chip
  padrão continua removendo só a sua parte.
- Helpers puros: `normalizeCustomSequence` (só trim externo),
  `addSequenceToImageLabel`, `collageSeqSelectHtml` (valores escapados),
  constante `CUSTOM_SEQUENCE_OPTION`.

### Texto livre / retrocompatibilidade
- Salvo exatamente como digitado (caixa, espaços internos, acentos); nunca
  vira opção pré-definida ("PD FAT SAT" ≠ "PD"). Vazio/só espaços: nada é
  gravado (editor avisa; no quadro o painel fica sem sequência → "Imagem N").
- Registros antigos (presets) seguem idênticos, sem migração; nenhuma rotina
  reescreve `label`/`seq`.

### Arquivos alterados
`index.html` (CSS + 3 helpers/1 constante + campo livre no quadro + linha
personalizada no editor + ajuste de fonte do rótulo no canvas),
`tests/custom-sequence.test.js` (novo, 15), `tests/multi-device-sync.test.js`
(+1: sequência livre chega idêntica ao outro PC), `tests/critical-flows.test.js`
(âncoras +5 nas três primeiras / +61 no importHandler),
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `custom-sequence` 15/15 (presets intactos; opção personalizada;
  T2 FAT SAT/PD FAT SAT/STIR/T1 pós-contraste FAT SAT/PD axial com supressão
  de gordura/DWI b1000/T2 Dixon exatos; trim externo; escape; vazio seguro;
  troca padrão↔personalizada; reabrir; JSON/backup/F5; registro antigo;
  fiação do quadro e do editor; canvas sem truncar); `multi-device-sync`
  161/162 (F2 = arquivo protegido ausente); `collage-desc` 15/15;
  `image-description` 31/31; `image-handling` 18/18; `form-collapse` 11/11;
  `form-layout-desktop` 12/12; `quiz-images` 103/103; `lightbox-navigation`
  25/25; `external-import` 79/79; `critical-flows` 23/23; `modal-cleanup` 14/14.
- Suíte (remoto): 1240 · 1205 · 30 · 5 (base 1224 · 1189 · 30 · 5; mesmas
  falhas). Esperado no local: 1250 · 1242 · 3 · 5.
- Sem teste em navegador real (fiação validada por leitura estática + helpers
  reais); conferir visualmente no editor e no construtor de quadro.

## 44. Proteção 088 — contexto clínico / dados do paciente por imagem (2026-09-26)

### Auditoria
- Imagem = objeto em `entry.images[]` (`data`, `label` = descrição, `publicId`/
  `assetId`, `lesionId`/`lesionName`, `assignedAt`, `source`, `panels` de
  quadro, campos de fonte/licença). Cada imagem é independente (sem agrupador
  de "caso" entre imagens).
- Caso clínico importado (Radiopaedia) = `entry.clinicalCases[]` com
  `title`, `sourceUrl`, `patientAge`, `patientSex`, `modality`,
  `presentation` — ligado à LESÃO, sem imagens (o importador é metadata-only).
  Portanto não há correspondência segura imagem↔caso para reaproveitar
  automaticamente; nenhum preenchimento automático foi criado.

### Schema escolhido (opcional, retrocompatível)
`img.clinicalContext = { presentation, patientAge, patientSex, notes }` —
mesmos nomes do caso clínico importado + `notes`. Strings com trim externo e
limites (2000/30/30/2000); campo ausente/vazio = removido ao salvar
(`withNormalizedImageClinicalContext`); `normalizeImageClinicalContext`
ignora qualquer outra chave. Não participa de `stableImageKeyV208`/
`imageIdentityKeys`. Imagens antigas seguem válidas, sem migração.

### Editor
Em cada imagem da galeria do formulário (adicionar/editar lesão): botão
recolhível "▸ Contexto clínico / dados do paciente" (● quando preenchido) com
História clínica (textarea), Idade (texto), Sexo (—/Feminino/Masculino; valor
antigo diferente é preservado como opção), Observações clínicas (textarea),
aviso "Informação pré-diagnóstica: aparece no Quiz ANTES da resposta. Não
escreva o diagnóstico aqui" e "⤵ copiar da imagem anterior" (várias imagens do
mesmo caso, sem arquitetura nova). Descrição da imagem continua no campo
próprio. Valores lidos/escritos via `.value`. Trocar a imagem (arquivo/URL)
mantém o contexto; `uploadPendingImage` copia o campo; Salvar mantém o spread
`...x` e normaliza depois (`.map(withNormalizedImageClinicalContext)`).
O atalho "adicionar imagem" do Quiz não ganhou os campos (Quiz fora do escopo).

### Quiz
- `renderMedia()`: `quizImageClinicalContextHtml(cur.clinicalContext)` +
  `quizImageDescHtml(cur.label, st.answered)` no mesmo innerHTML (sem
  duplicar; segue a imagem atual do carrossel).
- **Antes da resposta:** imagem + bloco "Caso clínico" (Paciente: idade
  [número → "N anos"] / sexo; História clínica; Observações) — só os campos
  preenchidos, sem frase inventada, tudo escapado. **Nunca** a descrição.
- **Depois:** mesmo bloco + "Descrição da imagem" (gate existente intacto,
  inclusive o do lightbox).

### Persistência / sync
Campo dentro do objeto da imagem: IndexedDB, chunks do Firestore, backup/
import, snapshot — sem allowlist que o corte. Imagem nova com contexto chega
idêntica ao outro PC; merge nunca remove o contexto; contexto de uma imagem
não contamina outra. Limitação pré-existente (igual ao `label`): edição
POSTERIOR do contexto de uma imagem que o outro PC já tem não substitui a
cópia local dele no pull — ver BACKLOG.

### Arquivos alterados
`index.html` (CSS; `IMAGE_CLINICAL_CONTEXT_LIMITS`,
`normalizeImageClinicalContext`, `withNormalizedImageClinicalContext`,
`quizImageClinicalContextHtml`; campos no editor; troca/upload/salvar
preservam; bloco no Quiz), `tests/image-clinical-context.test.js` (novo, 13),
`tests/multi-device-sync.test.js` (+2), `tests/critical-flows.test.js`
(âncoras +8 / +64 no importHandler), `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `image-clinical-context` 13/13; `multi-device-sync` 163/164 (F2 =
  arquivo protegido ausente); `quiz-images` 103/103; `quiz-image-desc` 8/8;
  `image-description` 31/31; `image-handling` 18/18; `critical-flows` 23/23;
  `modal-cleanup` 14/14; `external-import` 79/79; `custom-sequence` 15/15;
  `lightbox-navigation` 25/25.
- Suíte (remoto): 1255 · 1220 · 30 · 5 (base 1240 · 1205 · 30 · 5; mesmas
  falhas). Esperado no local: 1265 · 1257 · 3 · 5.
- Sem teste em navegador real; conferir visualmente o editor e o Quiz.

## 45. Proteção 089 — estado manual de estudo estável (2026-09-26)

### Problema
Lesões pareciam mudar sozinhas entre Não revisado / Revisando / Dominado
(`REVIEW`: {id: 0|1|2}).

### Causa raiz (auditoria de TODAS as mutações)
| Ponto | Classe | Antes | Agora |
|---|---|---|---|
| `srsGradeLevel()` — toda resposta do Quiz | D (indevida) | `setReview()` automático: acerto com intervalo ≥30 d → Dominado; senão/erro/difícil → Revisando | removido: o grau só atualiza SRS |
| `reconcileStateWithRemote` / `mergeThisDeviceImagesToCloud` (pull, pre-push, merge de imagens) | C (sync) | `mergeReviewPreservingProgress`: maior estágio sempre vence → rebaixamento manual desfeito pelo outro PC | `mergeReviewByRecency` (carimbo) |
| `writeShardedState` (inclui force/syncThisDevice) | C | gravava o REVIEW local inteiro | merge por recência DENTRO da transação |
| `runDuplicateCleanup` / `deduplicateV171` | B (consolidação) | promovia o keeper ao maior estágio | `consolidateReviewOnMerge`: preserva sem promover |
| card da lista (`cycleReview`) | A (usuário) | ciclo cego a cada clique | seletor explícito ○/◐/● |
| botões do detalhe | A | explícitos | inalterado (agora carimbam) |
| import de backup / restaurar snapshot | explícito | substituem | substituem + carimbam (vale sobre a nuvem, como antes) |
| aplicar reconciliação V2 | B (ids remapeados) | substitui | substitui + zera carimbos (ids mudaram) |
| recuperação de dados antigos (inspetor) | explícito | `mergeReviewPreservingProgress` (maior) | inalterado (ação manual com confirmação; dados antigos sem carimbo) |
| adoção de PC novo | exceção aceita | adota remoto | adota remoto + carimbos |
| boot/render/load | — | não escreviam REVIEW | idem (verificado por teste) |

A "aleatoriedade" percebida vinha principalmente do Quiz (cada resposta
reescrevia o estado manual) somado ao "maior vence" do sync.

### Regra final
"Não revisado / Revisando / Dominado só muda por ação explícita do usuário"
(`setReview`: seletor do card e botões do detalhe). Exceções: consolidação de
duplicata (preserva, não promove), restore/import explícito, adoção inicial em
PC novo, reconciliação V2 manual.

### Estratégia de conflito
- REVIEW continua `{id: 0|1|2}` (nenhum leitor mudou). Carimbos à parte:
  `REVIEW_STAMPS {id: ms}` — IndexedDB `atlas:reviewUpdatedAt`, Firestore
  `reviewUpdatedAt` (documento principal), backup `reviewUpdatedAt`.
- `mergeReviewByRecency(local, remoto, carimbosL, carimbosR)` (pura): carimbo
  mais novo vence (valor + carimbo), inclusive para estágio menor; empate de
  carimbo = maior (determinístico); sem carimbo nos DOIS lados (estado
  legado) = maior (regra antiga, única informação disponível). Quarentena 075
  filtrada. No-op do pre-push compara também os carimbos.
- `consolidateReviewOnMerge(keep, drop)`: mantém o do keeper; herda o da
  duplicata só se o keeper não tem estado (0 sem carimbo) ou se a mudança
  manual da duplicata é mais recente.

### UI
Card: clique no estado abre ○ Não revisado / ◐ Revisando / ● Dominado
(`.card-review-picker`), tooltip "Estado manual de estudo — clique para
escolher"; escolher o mesmo estado não grava nada. Detalhe: botões explícitos
de sempre.

### Impacto para o usuário
- Responder o Quiz não muda mais o estado manual (o SRS continua decidindo
  quando rever). Estados antigos seguem válidos, sem migração.
- Rebaixar manualmente (Dominado → Revisando/Não revisado) agora propaga para
  os outros PCs e não é desfeito.

### Arquivos alterados
`index.html`, `tests/review-state.test.js` (novo, 12),
`tests/multi-device-sync.test.js` (+3 ponta a ponta; funções no harness),
`tests/device-bootstrap.test.js` (harness), `tests/snapshots-ownership.test.js`
(stubs + assert estático do merge de imagens agora exige `mergeReviewByRecency`),
`tests/legacy-id-migration.test.js` (stub), `tests/critical-flows.test.js`
(âncoras +88/+88/+89/+105; stubs), `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `review-state` 12/12 (default; escolher/voltar com carimbo; Quiz/
  SRS não tocam REVIEW em nenhum grau; boot/render sem escrita; inventário de
  chamadas de `setReview`; seletor do card; merge sem conflito; recência vence
  Math.max; legado sem carimbo + quarentena; consolidação sem promoção; F5;
  restore/import carimbam; pipeline); `multi-device-sync` 166/167 (novos:
  rebaixamento em B chega em A e resiste a envio forçado stale; boot/F5/no-op
  sem escrita com legado; PC novo recebe estado + carimbos; F2 = arquivo
  protegido ausente); `device-bootstrap` 41/42; `critical-flows` 23/23;
  `quiz-images` 103/103; `snapshots-ownership` 48/48; `legacy-id-migration`
  132/156 (24 = fixture protegida ausente); `srs-dashboard` 17/17;
  `modal-cleanup` 14/14.
- Suíte (remoto): 1270 · 1235 · 30 · 5 (base 1255 · 1220 · 30 · 5; mesmas
  falhas). Esperado no local: 1280 · 1272 · 3 · 5.

## 46. Proteção 090 — estado de estudo AUTOMÁTICO pelo Quiz + override manual (2026-09-26)

### Correção conceitual da 089
A 089 tornou Não revisado/Revisando/Dominado puramente manual. A intenção
real do usuário é híbrida: automático pelo Quiz por padrão (feedback real do
aprendizado) e manual só quando ele quiser forçar — sem o sistema "brigar"
com a escolha manual e sem perder histórico. O que a 089 corrigiu continua
valendo: o SRS (`srsGradeLevel`) não mexe no estado; sync nunca por Math.max;
consolidação de duplicata não promove.

### Dados usados (auditoria)
- Antes: por lesão só `SRS[id] = {interval, due, streak, lastGrade,
  updatedAt}` (último estado, sem histórico); `SESSIONLOG` é agregado por dia
  (não usado para domínio individual). Acerto objetivo (`st.objectiveCorrect`,
  ao responder) é separado do grau de confiança (`easy/medium/hard/again`,
  opcional, depois).
- Novo `REVIEW_PROGRESS[id] = { b, f, a:[[t, ok, graded], …] }` — últimas
  `REVIEW_ATTEMPTS_MAX = 8` tentativas; `t` = ms da resposta (identidade);
  `ok` = acerto objetivo E grau ≠ "Não sei"; `graded` = grau já aplicado;
  `b` = estado-base (estado anterior à 1ª tentativa registrada, ou estado
  acumulado das tentativas que saíram da janela); `f` = t da última tentativa
  dobrada. IndexedDB `atlas:reviewProgress`; Firestore `reviewProgress`.
- Novo `REVIEW_OVERRIDE[id] = {m:1, s, at}` (manual) ou `{m:0, at}` (volta
  explícita ao automático). IndexedDB `atlas:reviewOverride`; Firestore
  `reviewOverride`.
- `REVIEW[id]` continua sendo o valor VISÍVEL (todo leitor antigo inalterado),
  materializado por `materializeReviewState`.

### Regra automática (pura, `replayAutoReview(b, tentativas)`)
- Sem tentativa: estado-base (0 = Não revisado; lesões antigas mantêm o valor
  que tinham).
- Qualquer tentativa tira de Não revisado → Revisando.
- **Dominado**: ≥4 tentativas, ≥80% de acerto nas últimas 5 e as 2 últimas
  corretas (`reviewPromotionReached`).
- **Rebaixamento**: Dominado só volta a Revisando com ≥2 falhas nas últimas 3
  (`reviewDemotionTriggered`) — erro isolado não derruba.
- Falha = resposta errada OU grau "Não sei" (again). Fácil/Média/Difícil com
  acerto objetivo = correta.
- Explicação: `getReviewStateExplanation(id)` (ex.: "Estado calculado pelo
  Quiz — 4/5 acertos recentes · 2 últimas corretas · 5 tentativa(s) na
  janela"; manual: "Estado definido manualmente (…) — o Quiz não o altera").

### AUTO / MANUAL / revisar novamente
- Quiz: ao responder, `recordReviewAttempt(id, acerto)`; ao classificar,
  `gradeReviewAttempt(id, t, grau)`. SRS/estatística/SESSIONLOG seguem iguais.
  O estado visível só muda se o modo for AUTO.
- `setReview(id, s)` = override MANUAL (card: ○/◐/●; detalhe: botões).
- `setReviewAuto(id)` = "⚙ Automático pelo Quiz": remove o override e
  recalcula na hora com o histórico atual.
- `markLesionForReviewAgain(id)` = "↺ Marcar para revisar novamente" (detalhe):
  manual Revisando; histórico do Quiz e SRS intactos.
- Card mostra `AUTO`/`MANUAL` (tooltip "Estado calculado pelo desempenho no
  Quiz" / "Estado definido manualmente" + explicação); o detalhe mostra o
  indicador e a explicação.

### Merge/sync
- Histórico: união por `t` (sem duplicar; versão graduada vence; empate =
  falha), base do lado que dobrou mais (`f` maior), janela de 8.
- Override: o mais recente vence (manual ou volta ao auto); empate = manual,
  depois maior. Nunca Math.max.
- Pipeline: `writeShardedState` (merge dentro da transação + REVIEW
  materializado), `readShardedState`, `reconcileStateWithRemote`, no-op do
  pre-push, `persistLocalStateNow`, pull, `mergeThisDeviceImagesToCloud`,
  adoção de PC novo, backup export/import, snapshot (captura/restauração),
  consolidação de duplicata (histórico unido, override mais recente),
  reconciliação V2 (zera, ids remapeados). Restauração/import explícitos
  recarimbam overrides (valem sobre a nuvem, como antes).
- Tamanho: até 8 × `[t,ok,g]` por lesão estudada (~200 B com a chave) —
  ~230 KB no pior caso (todas as 1213 lesões estudadas ≥8 vezes) no documento
  principal, junto de review/srs/lesionRevisions; `checkChunkSize` continua
  recusando com segurança (dirty mantido, aviso) se passar de ~0,95 MB.
  Acompanhar; se crescer, mover `reviewProgress` para um doc próprio.

### Migração da 089
Não há como distinguir, nos carimbos `REVIEW_STAMPS` da 089, escolhas manuais
reais de carimbos de restauração/importação. Decisão conservadora: **nenhum
estado vira manual** — tudo volta ao AUTO por padrão, com os valores atuais
preservados como base (nada é zerado nem recalculado sem tentativa nova).
Os carimbos da 089 continuam só para o merge legado de REVIEW. Daqui em diante,
override manual é explícito. Se o usuário tinha fixado algo na 089 que quer
manter, basta escolher de novo (vira MANUAL).

### Arquivos alterados
`index.html`, `tests/review-auto-mode.test.js` (novo, 18),
`tests/multi-device-sync.test.js` (+3 ponta a ponta; funções no harness),
`tests/review-state.test.js` (harness com as funções da 090; asserções do
seletor/tooltip e do inventário de `setReview` ajustadas),
`tests/device-bootstrap.test.js`, `tests/snapshots-ownership.test.js`,
`tests/site-taxonomy.test.js`, `tests/legacy-id-migration.test.js`,
`tests/images-today-modal.test.js` (stubs/harness),
`tests/critical-flows.test.js` (âncoras +253/+253/+255/+284; stubs),
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `review-auto-mode` 18/18 (sem tentativa/legado; 1ª tentativa;
  sem critério; 4 com critério; 80% em 5; 2 últimas exigidas; erro isolado;
  2 falhas em 3; "Não sei" = falha; Quiz atualiza AUTO e não o MANUAL;
  manual 0/1/2; voltar ao auto recalcula (com e sem tentativas); revisar
  novamente preserva histórico e SRS; SRS; janela limitada; explicação e
  indicadores; merge/materialização; migração 089; F5; pipeline);
  `multi-device-sync` 169/170 (novos: AUTO A→B e união de histórico; MANUAL
  sincroniza, manual mais recente vence, volta ao auto sincroniza; F5 + PC
  novo recebem modo; F2 = arquivo protegido ausente); `review-state` 12/12;
  `srs-dashboard` 17/17; `quiz-images` 103/103; `device-bootstrap` 41/42;
  `critical-flows` 23/23; `snapshots-ownership` 48/48; `site-taxonomy`
  42/42; `images-today-modal` 31/31; `legacy-id-migration` 132/156 (24 =
  fixture protegida ausente); `modal-cleanup` 14/14.
- Suíte (remoto): 1291 · 1256 · 30 · 5 (base 1270 · 1235 · 30 · 5; mesmas
  falhas). Esperado no local: 1301 · 1293 · 3 · 5.
- Sem teste em navegador real; conferir visualmente card (AUTO/MANUAL,
  seletor) e detalhe (⚙ Automático, ↺ revisar novamente, explicação).

## 47. Proteção 091 — pendências gerais do Atlas na Central de Revisões (2026-09-26)

### Schema (retrocompatível, sem sistema paralelo)
- Mesma fila `LESION_REVISIONS`, mesma máquina de estados, mesmo sync (084),
  backup e snapshot (o objeto inteiro já viajava).
- `scope`: `'lesion'` (padrão — revisões antigas sem o campo continuam lesão;
  o formato delas não muda) ou `'global'`. Global: `lesionId: null`,
  `requestText` obrigatório (trim), `category` opcional
  (`GLOBAL_REVIEW_CATEGORIES`: audit/Auditoria, duplicates/Duplicatas,
  classifications/Classificações, descriptions/Descrições, images/Imagens,
  taxonomy/Taxonomia, organization/Organização, other/Outro — só organização).
- Helpers centrais: `reviewScope(review)`, `isGlobalReview(review)`.
- Criação: `createReviewRequest({scope, lesionId, requestText, category})`;
  `createLesionReview(lesionId, texto)` continua existindo (API intacta) e é
  usado por ela para scope lesion. Duplicata EXATA de global ATIVA (mesmo
  texto) não cria outra; textos diferentes coexistem; após concluir/cancelar
  o mesmo texto pode ser pedido de novo.

### UI
- 🔔 Revisões pendentes: botão "+ Nova pendência" → modal com Tipo (padrão
  "Atlas / solicitação geral" | "Lesão específica"). Geral: "Solicitação /
  otimização" + categoria opcional. Lesão: busca por nome (mín. 2 letras,
  até 20 resultados, sem dropdown gigante) + pedido. Só cria o pedido.
- Linhas globais: "🌐 Atlas / solicitação geral" + "categoria: …"; sem "ver
  lesão" (`reviewCenterLesionMeta(null|global)` nunca procura lesão).
- 💡 Soluções: pendência global com análise aparece em "Propostas" com
  "✓ Concluir", "↩ devolver / pedir nova análise" (volta ao 🔔 com feedback
  humano) e "✕ Cancelar pedido"; em "Ações manuais" ganha "✓ Concluir".
- Badges: global ativa conta no 🔔/💡 pela mesma regra; o ⚠ junto ao nome
  (086) considera SÓ scope lesion (`hasActiveLesionReview`).

### Solução textual e conclusão
- `setGlobalReviewSolution(id, texto, {summary, reasoning})`: guarda a
  análise/plano/resultado (`solution.proposedChanges = {}`, `global:true`) e
  vai para `proposed`.
- `completeGlobalReview(id)` (de `proposed` ou `manual_action_required`) →
  `accepted`. Devolver = `rejectProposedReviewSolution` (→ `rejected`, volta
  ao 🔔); ação manual/cancelar/reabrir reaproveitam as funções existentes.
  Nenhuma delas toca DATA.

### Proteção contra mutação automática
- Para global, `authorizeAndApplyReviewSolution`, `rollbackAppliedReviewSolution`,
  `applyReviewAiSuggestedPlacement` e `setReviewSolution` (com proposedChanges)
  devolvem `{ ok:false, reason:'global_review_has_no_direct_target' }` — nunca
  escolhem uma lesão.
- IA: `buildReviewAiPacket` global = `{scope:'global', category,
  categoryLabel, requestText, targetLesion:null, …}` sem lesionId/campos/
  imagens; o prompt explica que é auditoria/manutenção geral, sem lesão alvo,
  sem proposedChanges. Import (`importGlobalReviewAiResult`) e lote
  (`processReviewAiBatchItem`, novo result `"analysis"` só para global)
  aceitam só texto (`analysis`/`manual_action_required`/`no_change`); recusam
  `apply`, qualquer proposedChanges e lesionId. Pacotes de lesão ganham
  `scope:'lesion'` (campo extra, nada removido).
- Fora do escopo (não implementado): execução automática de auditoria,
  fusão/renomeação/classificação em massa, agente autônomo.

### Arquivos alterados
`index.html`, `tests/global-review.test.js` (novo, 12 — cobre os 26 itens
pedidos), `tests/multi-device-sync.test.js` (+1: global A→B e conclusão B→A;
harness), `tests/critical-flows.test.js` (âncoras +160/+160/+160/+290),
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- Focados: `global-review` 12/12; `lesion-review` 138/138;
  `lesion-revisions-sync` 15/15; `lesion-review-warning` 16/16;
  `multi-device-sync` 170/171 (F2 = arquivo protegido ausente);
  `modal-cleanup` 14/14; `critical-flows` 23/23; `review-auto-mode` 18/18;
  `snapshots-ownership` 48/48.
- Suíte (remoto): 1304 · 1269 · 30 · 5 (base 1291 · 1256 · 30 · 5; mesmas
  falhas). Esperado no local: 1314 · 1306 · 3 · 5.
- Sem teste em navegador real; conferir o modal "+ Nova pendência" e as ações
  do 💡 para pendência global.

## 48. Proteção 091b — ajuste visual após validação manual no navegador (2026-09-26)

### Validação real do usuário (091)
- `LESION_REVISIONS` sincronizou entre navegadores/PCs; pendências apareceram
  no Edge; a lógica da 091 está funcionando.
- Encontrados só problemas VISUAIS: (1) contraste dos controles da 090 no
  detalhe da lesão; (2) radios desalinhados no modal "+ Nova pendência".

### Causa e correção (só CSS/markup; nenhuma lógica, sync ou schema)
1. `.review-set-btn` usa cor inline (dada pelos 3 estados); os botões
   "⚙ Automático pelo Quiz" e "↺ Marcar para revisar novamente" (090) não
   recebiam cor e herdavam a do navegador (escura sobre fundo escuro).
   Nova classe `.review-secondary-btn` nos dois: `color:var(--text)`,
   `background:var(--panel-2)`, `border:1px solid var(--line)`; hover e
   ativo em `var(--teal)`/`var(--teal-dim)`; foco visível. Explicação
   `.review-mode-info` passou de `--muted-2` para `--muted` (legível, mais
   discreta que o nome); o selo AUTO/MANUAL dentro dela usa `--text` a 85%.
   Só variáveis do tema (o app tem apenas o tema escuro em `:root`).
2. `.field input{width:100%}` esticava os radios. Cada opção agora é UMA
   `<label class="nrr-scope-option">` com `<input type="radio">` + `<span>` do
   texto (clicar no texto seleciona), dentro de
   `<div class="nrr-scope-options" role="radiogroup" aria-labelledby=…>`;
   CSS dedicado (`display:flex; align-items:center; gap:8px`, radio
   `width:auto`, sem `position:absolute`). Mesmos `name`/`value`/default
   (global) e mesmos ids/handlers.
- Conferido no Chromium: radio a 8 px do texto, centros verticais iguais,
  clique no texto marca a opção; botões legíveis no tema escuro.

### Arquivos alterados
`index.html`, `tests/global-review.test.js` (+1 estrutural; asserção do
markup do radio atualizada), `tests/review-auto-mode.test.js` (+1
estrutural), `tests/critical-flows.test.js` (âncoras +13/+13/+13/+15) — no
commit `44ec839`; `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` num commit de
registro logo depois (a atualização do Contexto falhou no primeiro commit por
âncora de texto desatualizada e o commit seguiu sem ele; corrigido sem
reescrever histórico).

### Testes
- `global-review` 13/13; `review-auto-mode` 19/19; `modal-cleanup` 14/14;
  `critical-flows` 23/23.
- Suíte (remoto): 1306 · 1271 · 30 · 5 (base 1304 · 1269 · 30 · 5; mesmas
  falhas). Esperado no local: 1316 · 1308 · 3 · 5.

### Próximo passo (inalterado)
Proteção 092 — sync de edição de metadados/contexto de imagens já existentes
entre PCs.

## 49. Proteção 091c — fusão clínica controlada de duplicatas aprovadas (2026-09-26)

### Autorização do usuário
Decisão clínica EXPLÍCITA do usuário (4 grupos, com os ids da auditoria):
1. `seed_155` "Metástase hepática" + `seed_590` "Metástases hepáticas" +
   `seed_722` "Metástases hepáticas hipervasculares" → **"Metástases hepáticas"**.
2. `seed_45` "Metástase óssea vertebral" + `seed_581` "Metástases ósseas
   vertebrais" → **"Metástases ósseas vertebrais"**.
3. `seed_89` "Linfoma mediastinal" + `seed_625` "Linfoma do mediastino" →
   **"Linfoma mediastinal"**.
4. `seed_1049` "Osteomielite mandibular" + `seed_1158` "Osteomielite da
   mandíbula" → **"Osteomielite mandibular"** (keeper 1158 recebe enTerm
   `mandibular osteomyelitis` e o link em inglês).

- **Metástases hepáticas hipervasculares não é mais uma lesão separada; o padrão hipervascular foi incorporado ao registro Metástases hepáticas.**
- **Metástases de órgãos diferentes permanecem entradas separadas.**
- LIRADS sai do registro final do grupo 1; diferenciais autorreferentes
  (a lesão citando a própria duplicata) foram removidos do texto final.
- O texto final de cada grupo foi composto SÓ com frases já existentes nos
  membros (nada inventado) e só é aplicado se as notas ainda forem as do
  SEED; se o usuário editou alguma nota, o fallback preserva a nota do keeper
  + parágrafos inéditos dos outros (relatório avisa "fallback_notas_editadas").

### Achado crítico: ids da auditoria ≠ ids de execução
`SEED.forEach((e,i)=> e.id='seed_'+i)` renumera por POSIÇÃO no boot; o campo
`id` literal do SEED (usado pela auditoria) não corresponde ao id real (ex.: o
`seed_155` da auditoria é o `seed_150` em execução; o `seed_155` real é o
IPMN). Por isso a fusão resolve cada membro pela IDENTIDADE
`exactLesionIdentityKey(s, site, name)` nos dados reais — nunca pelo número.
O relatório mostra os ids REAIS antes de executar. Grupo com identidade
ambígua (2+ registros iguais) ou membro ausente fica PAUSADO.

### Regra oficial do keeper (aprovada)
1. Só um membro com imagem → ele permanece (**"quem tem imagem permanece"**).
2. Mais de um com imagem → grupo PAUSADO; o relatório lista ids, imagens,
   source, label, clinicalContext, panels e ownership; nada é decidido.
3. Nenhum com imagem → casos clínicos > progresso de estudo (REVIEW/SRS/
   Quiz/override) > registro canônico aprovado (`preferredKeeperName`:
   "Metástases hepáticas", "Metástases ósseas vertebrais", "Linfoma do
   mediastino", "Osteomielite da mandíbula") > menor id (desempate).
- No SEED (sem imagens nesses 9 registros) o keeper previsto é o registro
  preferido de cada grupo; o keeper REAL é decidido na hora pelos dados do
  navegador do usuário (regra 1 prevalece se alguém tiver imagem).

### Mapa de fusão `lesionMerges` (sincronizado; aprovado)
- `LESION_MERGES = { idFundido: { into, at, group, finalName } }` — IndexedDB
  `atlas:lesionMerges`, campo `lesionMerges` no meta do Firestore, backup
  JSON e snapshot. União entre PCs (conflito: fusão mais antiga vence); o
  mapa nunca encolhe (import de backup antigo e restauração de snapshot
  fazem união).
- `foldLesionMergesIntoState()` (pura) aplica o mapa: move imagens (dedup por
  identidade), une links (URL), tags, clinicalCases, altPlacements; REVIEW
  (estado do keeper, a menos que o fundido tenha carimbo manual mais novo ou o
  keeper não tenha estado), REVIEW_STAMPS, REVIEW_PROGRESS (união),
  REVIEW_OVERRIDE (mais recente), SRS (updatedAt mais novo),
  LESION_REVISIONS por lesão (redirecionadas; no fluxo explícito com
  histórico `lesion_merged`), marcadores 079d; remove o id fundido.
- Aplicado ANTES de qualquer filtro: boot (`loadData`), pull/pre-push
  (`reconcileStateWithRemote`, local e cópia do remoto), transação de
  `writeShardedState` (payload, dados remotos e cópia do meta remoto — nem `forceThisDeviceToCloud`
  de um PC antigo grava o id fundido), adoção de PC novo, import e restauração.
- `isQuarantinedSeedId()` também devolve true para ids do mapa
  (`isMergedAwayLesionId`) → o id não volta pelo SEED/catálogo ativo.
- **Exceção RESTRITA de ownership:** só o fold do mapa muda `lesionId`/
  `lesionName` de imagens (para o keeper, marcando `mergedFromLesionId`). Não é
  regra geral de sync: `canChangeImageOwnership` continua exigindo ação manual.
  Rótulos legados (`lesionId` histórico) em imagens de OUTRAS lesões não são
  tocados nem contam como órfãos (no SEED, 63 de 68 imagens têm rótulo
  histórico; um deles coincide com um id fundido).

### Fluxo manual (nunca automático)
Ferramentas avançadas → "🧬 fusões clínicas aprovadas": relatório com os dados
reais → "Fundir N grupo(s)". `runApprovedClinicalMerges091c` exige: app
pronto, sem sync em andamento, **backup JSON exportado há ≤ 2 h**
(`atlas:lastBackupExportAt`, gravado pelo 💾), ENSAIO completo numa cópia (se
algum grupo deixar órfão ou perder imagem, nada é alterado), confirmação e
`createSafetySnapshot('antes da fusão clínica controlada de duplicatas
aprovadas')` (motivo na allowlist; snapshot nulo aborta). Depois salva
REVIEW/SRS/LESION_REVISIONS/mapa/marcadores e `saveData()` (dirty + push).
Idempotente: segunda execução encontra os grupos como `already_merged`.
Auditoria pós-fusão (`auditLesionMergeOrphans`) precisa dar 0.

### Contagem
Medida antes/depois pelo próprio fluxo: esperado **−5** (9 registros → 4). No
SEED: 1213 → 1208. Nos dados reais o número exato depende do estado do
usuário (o relatório mostra antes/depois).

### Execução
NÃO executada no ambiente remoto (sem acesso aos dados reais — regra do
pedido). Pendente no navegador do usuário (ver checkpoint). Validação
multi-PC: abrir o segundo PC após a fusão; ele deve convergir sem ação.

### Arquivos alterados
`index.html`; `tests/controlled-duplicate-merge.test.js` (novo, 17);
`tests/multi-device-sync.test.js` (+4 multi-PC e módulo 091c no motor);
harnesses atualizados com o mapa: `tests/device-bootstrap.test.js`,
`tests/critical-flows.test.js` (âncoras +420/+420/+421/+490 e stubs),
`tests/snapshots-ownership.test.js`, `tests/site-taxonomy.test.js`,
`tests/lesion-review.test.js` (janela do bloco de import 4600→5000),
`tests/review-state.test.js`, `tests/review-auto-mode.test.js`,
`tests/lesion-revisions-sync.test.js` (regex aceita `txBase`, a base da
transação após o fold); `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- `controlled-duplicate-merge` 17/17: grupo 1 vira um registro com nome
  final, 722 some, conteúdo hipervascular presente, LIRADS fora, tags unidas,
  links deduplicados, imagem/ownership/clinicalContext/panels/source
  preservados, REVIEW/PROGRESS/OVERRIDE/STAMPS/SRS no keeper, revisões
  redirecionadas, sem ressurreição, PC antigo converge, os 3 pares, nada mais
  muda, −5, idempotente, regras 1/2/3, backup/snapshot/ensaio, notas editadas,
  casos clínicos, rótulos legados.
- `multi-device-sync` 174/175 (+4 da 091c, incl. PC antigo que gravou REVIEW/revisão do id fundido na nuvem antes da fusão; a 1 falha é a F2 pré-existente
  que depende do arquivo canônico ausente no remoto).
- Suíte (remoto): 1327 · 1292 · 30 · 5 (base 1306 · 1271 · 30 · 5; mesmas
  falhas). Esperado no local: 1337 · 1329 · 3 · 5.
- Chromium (rede bloqueada): script carrega sem erro, botão e modal
  aparecem; o fluxo completo exige login Firebase (validação no navegador do
  usuário).

## 50. Proteção 091d — revisões editáveis + importador de caso externo (2026-09-26)

### Roadmap
- 091c — fusões clínicas: código pronto; execução REAL depende do navegador
  do usuário (backup JSON + "🧬 fusões clínicas aprovadas"). Não executada.
- **091d — esta proteção.**
- 092 — sync de metadados de imagens entre PCs.
- 093 — conteúdo complementar pós-resposta no Quiz.

### Editar o motivo de uma revisão ativa
- `editReviewRequestText(reviewId, texto)`: só para status ativos
  (`pending`, `rejected`, `proposed`, `applied_pending_validation`,
  `manual_action_required`); `accepted`/`cancelled` = somente leitura
  (`not_editable`). Vazio/igual/inexistente não alteram nada.
- Mesmo reviewId; `status`, `solution`, `attempts`, `humanFeedback`,
  `createdAt`, `scope`, `lesionId`, `category` e **`updatedAt`** intactos →
  o 🔔/💡 não muda (testado: contador antes = depois). Vale também para a
  pendência GERAL (091) enquanto ativa.
- `requestHistory` (retrocompatível, criado só na 1ª edição):
  `[{at, text, action:'created'|'edited'}]` — a 1ª entrada guarda o texto
  anterior com o `createdAt` da revisão. Revisões antigas sem o campo seguem
  válidas (a UI mostra o pedido como "criado"). `history` ganha
  `request_edited` (de → para). A ponte manual de IA usa o texto ATUAL.
- Sync (merge da 084): `requestText` vence pelo carimbo PRÓPRIO
  `requestTextUpdatedAt` (edição mais recente), independente de quem venceu
  status/solução — uma edição de texto nunca faz outro PC perder uma
  proposta/decisão; `requestHistory` é união deduplicada (at+action+text).
  Nunca "local sempre vence". Converge em qualquer ordem.
- UI: botão "✏ Editar solicitação" em todas as listas da Central (🔔
  pendentes; 💡 proposta, pendência geral, aplicada, ação manual) → modal
  pequeno "Editar motivo da revisão" (Salvar alteração / Cancelar) com
  "Histórico do pedido" recolhível (`<details>`). O modal de histórico mostra
  "Pedido atual" + histórico quando houve edição.

### ⚠ clicável
- `lesionReviewWarningHtml` agora é `role="button" tabindex="0"` (mesmo
  title/aria-label "Esta lesão possui revisão ativa"; `cursor:pointer`, foco
  visível). Um listener de CAPTURA no `document`
  (`handleLesionReviewWarningEvent`, clique e Enter/Espaço) chama
  `preventDefault/stopPropagation/stopImmediatePropagation` → o card/lista
  NÃO abre/fecha o detalhe por acidente (conferido no Chromium: 0 cliques no
  card).
- Uma revisão ativa na lesão → abre direto o resumo (motivo atual, status,
  ✏ Editar solicitação, histórico, "Abrir Central completa"). Várias →
  lista "Esta lesão possui N revisões ativas" (motivo resumido + status +
  abrir/editar em cada); nunca escolhe uma sozinho. Modais pequenos por cima
  (`ov.remove()`), sem destruir o detalhe.

### Importador de caso externo
- **Nome em PT** (`suggestPortugueseLesionName`), sem tradução fuzzy:
  1) lesão do catálogo com `enTerm` exato; 2) **`EN_TERMS` invertido**
  (~1251 pares) com correspondência EXATA normalizada (minúsculas, acentos,
  espaços, pontuação, hífens) e INEQUÍVOCA — dois nomes PT para o mesmo termo
  (ex.: "epiploic appendagitis") = não traduz; 3) glossário/aliases
  explícitos `EXTERNAL_IMPORT_TRANSLATIONS` (novos: "Appendicitis in
  pregnancy" e "Appendicitis during pregnancy" → **"Apendicite na
  gestação"**; sem "acute" no título nunca vira "Apendicite aguda");
  4) fallback: título original + "⚠️ Sem tradução segura".
- **enTerm automático** (`suggestExternalEnTerm`): termo canônico do acervo
  quando houve correspondência segura; senão o título original da fonte
  (espaços normalizados). Nunca em português (título com grafia PT não vira
  enTerm). Preenche `f-en-term` no draft.
- **Nova lesão** vem preenchida: nome PT, enTerm, descrição
  (`suggestExternalDescription`, só com o que é seguro; sem base = vazio) e
  tags (`suggestExternalTags`; o campo real `addTag` não repete). Tudo
  editável; nada salvo antes do Salvar. `classification` nunca é preenchida
  pelo importador.
- **"✨ Revisar com IA"** (nome mantido): continua abrindo "O que você quer
  que a IA revise?". Agora a instrução vira uma **revisão REAL** na Central
  (`createExternalImportAiReview` → `createReviewRequest({scope:'lesion'})`):
  - Nova lesão: a instrução segue para o formulário
    (`pendingExternalAiReviewForForm`, consumida no início do `openForm` —
    não vaza para outro formulário) e a revisão é criada no Salvar, DEPOIS de
    a lesão entrar em `DATA` com o id real; aparece no 🔔, gera ⚠,
    sincroniza, sobrevive a reload e funciona na ponte manual.
  - Vincular existente: após o vínculo, cria a revisão para aquela lesão;
    name/notes/tags da lesão NÃO são alterados.
  - Revisão ativa idêntica (mesma lesão + texto normalizado) não é duplicada.
  - Mensagens: antes de salvar "✨ Ao salvar, esta solicitação será adicionada
    às Revisões pendentes"; depois "✨ Revisão adicionada à Central."; falha →
    "⚠ A lesão foi salva, mas a revisão com IA NÃO foi criada (…)" (a lesão/
    vínculo não é desfeito). Removida a frase falsa "concluir manualmente no
    fluxo de Revisões". `aiReview` nunca entra no objeto salvo.
- **Não há IA/API integrada** (nenhum provedor, chave, endpoint ou `fetch`
  novo). A "IA" continua sendo a ponte manual: 📋 Copiar pedido → Claude/
  OpenCode/etc. → 📥 Colar solução.

### Não alterado
REVIEW automático (090), regra Dominado/Revisando, REVIEW_PROGRESS, SRS,
fusões/`lesionMerges` (091c), ownership de imagens, sourcePage, 092, 093.
"AUTO Dominado sem histórico" fica para análise separada.

### Arquivos alterados
`index.html`; `tests/review-request-edit.test.js` (novo, 13);
`tests/external-import-enhancements.test.js` (novo, 14);
`tests/multi-device-sync.test.js` (+1 multi-PC; funções 091d no motor);
`tests/external-import.test.js` (harness: novas funções do importador);
`tests/lesion-review-warning.test.js` (⚠ agora `role="button"` +
`tabindex="0"`, mudança pedida); `tests/critical-flows.test.js` (âncoras
+94/+94/+94/+230); `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.

### Testes
- `review-request-edit` 13/13 · `external-import-enhancements` 14/14 ·
  `external-import` 79/79 · `lesion-review-warning` 16/16 · `global-review`
  13/13 · `lesion-review` 138/138 · `lesion-revisions-sync` 15/15 ·
  `modal-cleanup` 14/14 · `critical-flows` 23/23 · `review-auto-mode` 19/19 ·
  `controlled-duplicate-merge` 17/17 · `multi-device-sync` 175/176 (a 1 falha
  é a F2 pré-existente sem o arquivo canônico no remoto).
- Suíte (remoto): 1355 · 1320 · 30 · 5 (base `6b1e4bf`: 1327 · 1292 · 30 · 5;
  mesmas falhas). Esperado no local: 1365 · 1357 · 3 · 5.
- Chromium (rede bloqueada, login oculto só na sessão de teste): clique e
  Enter no ⚠ abrem o resumo sem acionar o card; edição grava texto e
  histórico; nenhum erro de página.

## 51. Proteção 091e — importações do Radiopaedia reutilizam a aba já aberta do Atlas (2026-09-26)

Pequena correção de UX pós-091d: **"Importações do Radiopaedia reutilizam a aba já aberta do Atlas."**

- Userscript v1.2.0 (`tools/radiopaedia-to-atlas.user.js`): antes
  `window.open(url, '_blank', 'noopener')` (uma aba nova a cada envio);
  agora `openAtlasWindow(url)` = `window.open(url, 'atlas-radiologico')` +
  `focus()` quando a janela é devolvida. Sem `noopener` de propósito: com ele
  o navegador não devolve a janela (sem foco) nem a reencontra pelo nome.
  O payload `#external-import=` é exatamente o mesmo.
- Atlas: `ATLAS_WINDOW_NAME = 'atlas-radiologico'`; `ensureAtlasWindowName()`
  no carregamento do script (try/catch, não interfere em nada).
- Aba reutilizada: só o `#fragmento` muda (a página NÃO recarrega), então o
  boot não roda de novo — um listener de `hashchange`
  (`handleExternalImportHashChange`) processa o novo caso pelo MESMO
  `maybeHandleExternalImport()` do boot (limpa o hash, valida, abre o modal).
  Durante o boot, deixa para o gancho do `loadData`. Modal de importação
  anterior (não salvo) é substituído. Se houver **formulário de lesão
  aberto**, nunca o derruba: limpa o hash e avisa "Caso não importado: salve
  ou feche o formulário aberto e clique de novo em Enviar ao Atlas".
- Limitação do navegador (esperada): o nome só é reencontrado entre abas do
  mesmo grupo — a aba do Atlas aberta pelo próprio botão é reutilizada em
  todos os envios seguintes (conferido no Chromium entre duas origens: 3
  envios → 1 aba do Atlas, mesmo documento, 2 hashchange). Uma aba do Atlas
  aberta manualmente pelo usuário não é visível ao Radiopaedia: o 1º envio
  abre uma aba nova, e dali em diante ela é reutilizada. Sem backend,
  BroadcastChannel, extensão ou service worker.
- Nada mudou em importação/Nova lesão/Vincular existente/sugestões 091d/
  Revisar com IA/histórico/sync.
- Arquivos: `index.html`, `tools/radiopaedia-to-atlas.user.js`,
  `tests/atlas-tab-reuse.test.js` (novo, 7), `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.
- Testes: `atlas-tab-reuse` 7/7; `external-import` 79/79;
  `external-import-enhancements` 14/14; `critical-flows` 23/23 (âncoras
  inalteradas — código depois do importHandler). Suíte (remoto): 1362 · 1327 ·
  30 · 5 (base 1355 · 1320 · 30 · 5; mesmas falhas).

## 52. Proteção 091f — títulos externos sem branding + conclusão manual de revisões (2026-09-26)

### A) Título do Radiopaedia
- Bug real: o Atlas recebeu "Paraovarian cyst | Radiology Case |
  Radiopaedia.org" (sem tradução, EN_TERMS, enTerm nem descrição limpa). A
  versão do repositório já removia essa forma exata; variantes (caractere
  invisível no fim, barra "｜" de largura total, "Radiology case |
  Radiopaedia" sem .org) e userscripts antigos instalados escapavam.
- Helper central `normalizeRadiopaediaCaseTitle(title)` — MESMA regra no
  userscript (v1.3.0) e no Atlas: remove do FIM, repetidamente, "|/–/—/-
  Radiopaedia(.org)" e "|/–/—/- Radiology Case/Reference Article";
  ignora maiúsculas, espaços/NBSP, zero-width e "｜"; nunca mexe no meio do
  título ("Radiopaedia sign…" fica intacto). Userscript: aplicada a TODAS as
  fontes (og:title, título do caso, document.title via `stripSiteSuffix`) e
  como guarda final em `buildExternalPayload` (o payload nunca leva o
  branding). Atlas: aplicada em `reconcileExternalImportTitle` ao receber —
  corrige também payloads de userscripts antigos.
- Aliases explícitos: "Paraovarian cyst" → **"Cisto paraovariano"**;
  "Paratubal cyst" → "Cisto paratubário" (termos próximos, mas cada um
  mantém o próprio nome e o enTerm original; nunca fundidos
  automaticamente). Caso observado: name "Cisto paraovariano", enTerm
  "Paraovarian cyst", descrição sem branding.
- 091e preservada (alvo nomeado `atlas-radiologico`, focus, hashchange,
  proteção de formulário aberto; sem `_blank`).

### B) ✓ Marcar como resolvida
- `resolveReviewManually(reviewId)`: para qualquer revisão ATIVA (lesão ou
  geral) → `status:'accepted'`, `completedAt`, `resolvedManually:true` e
  histórico `manually_resolved` ("Concluída manualmente pelo usuário", com o
  status anterior). Não toca DATA/a lesão, não executa solução, não apaga
  histórico; sai do 🔔/💡 (contador cai exatamente 1) e o ⚠ some.
- Confirmação: "Marcar esta revisão como resolvida? Nenhum dado da lesão será
  alterado." Botão em todas as listas da Central e no resumo do ⚠. Na
  pendência geral já proposta/ação manual, o "✓ Concluir" existente cumpre o
  papel (sem botão duplicado); na geral pendente (ex.: "auditar possíveis
  duplicatas em fígado") o botão novo aparece.
- **Fusão ≠ conclusão:** a fusão clínica (091c) só redireciona a revisão
  para o keeper; ela continua ativa até o usuário conferir e clicar em
  "✓ Marcar como resolvida" (rastreabilidade).

### Arquivos / testes
- `index.html`, `tools/radiopaedia-to-atlas.user.js` (v1.3.0),
  `tests/title-branding-manual-resolve.test.js` (novo, 8),
  `tests/external-import.test.js` (harness: nova função),
  `tests/critical-flows.test.js` (âncoras +21/+21/+21/+53),
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.
- `title-branding-manual-resolve` 8/8; `atlas-tab-reuse` 7/7;
  `external-import` 79/79; `external-import-enhancements` 14/14;
  `global-review` 13/13; `lesion-review` 138/138; `lesion-review-warning`
  16/16; `controlled-duplicate-merge` 17/17; `critical-flows` 23/23.
  Suíte (remoto): 1370 · 1335 · 30 · 5 (base 1362 · 1327 · 30 · 5; mesmas
  falhas). Chromium: ⚠ → ✓ Marcar como resolvida → diálogo com o texto
  exato → accepted, DATA idêntico, ⚠ some ao vivo.

## 53. Proteção 091g — reuso da aba do Atlas via canal (BroadcastChannel + ponte do userscript) (2026-09-26)

### Por que a 091e não bastou
- O alvo nomeado (`window.open(url, 'atlas-radiologico')`) **falhou no
  navegador real do usuário**: uma aba do Atlas aberta pelo próprio usuário
  pertence a outro grupo de navegação e o Radiopaedia não a enxerga pelo
  nome — nasce outra aba.
- `BroadcastChannel` sozinho também NÃO resolve: ele só liga abas da MESMA
  origem (conferido no Chromium: mensagem de outra origem nunca chega).
  Um canal aberto em radiopaedia.org nunca fala com leopaggi.github.io.

### Mecanismo final (primário)
- **Atlas (`index.html`)**: escuta `BroadcastChannel('atlas-radiologico-import')`
  (`startAtlasImportChannel`, `handleAtlasImportChannelMessage`):
  `{type:'ping', requestId}` → `{type:'pong', requestId, tabId, ready}`;
  `{type:'external-import', requestId, tabId, payload}` → só a aba com esse
  `tabId` importa, `requestId` repetido é ignorado → `deliverExternalImportPayload`
  → **mesmo pipeline** do boot/hashchange (`processExternalImportPayload`:
  valida, corrige título 083/091f, abre o modal) → `import-ack`.
  Porta comum `externalImportFormBlocked()` (hashchange e canal): formulário
  de lesão aberto nunca é fechado (aviso, não importa); modal de importação
  anterior é substituído. Caso recebido durante o boot entra na fila e é
  processado pelo gancho do `loadData`.
- **Userscript v1.4.0**: roda também na página do Atlas (`@match`) APENAS
  como ponte (sem botão). As duas instâncias conversam pelo armazenamento do
  Tampermonkey (`GM_setValue` + `GM_addValueChangeListener`, compartilhado
  entre abas); na aba do Atlas a ponte repassa pelo BroadcastChannel da
  própria origem. Radiopaedia: ping → a ponte pergunta à página → pong real
  da página → envia o caso SÓ para a aba que respondeu primeiro (nenhum
  `window.open`) + aviso "✓ Caso enviado para a aba do Atlas já aberta".
  Com duas abas do Atlas abertas, importa em uma só.

### Fallback
Sem pong em ~700 ms (Atlas fechado, página antiga em cache, gerenciador sem
`GM_addValueChangeListener`, sem BroadcastChannel, erro): abre como antes —
`window.open(url, 'atlas-radiologico')` com `#external-import=` (091e: alvo
nomeado, `window.name`, hashchange, `focus()`). Nunca os dois.

### Foco
O navegador NÃO deixa uma aba focar outra em segundo plano sem gesto do
usuário. A aba do Atlas tenta `window.focus()` (inofensivo) e, se estiver em
segundo plano, marca o título ("📥 Novo caso — …") até ser vista; o
Radiopaedia mostra o aviso para alternar. Prioridade: **não criar aba nova**
(nunca abre aba só para obter foco).

### Preservado
091e (alvo nomeado/`window.name`/hashchange/proteção de formulário) como
fallback; 091f (título sem branding, "Paraovarian cyst" → "Cisto
paraovariano", enTerm); descrição/tags; Revisar com IA; payload idêntico.

### Arquivos / testes
- `index.html`, `tools/radiopaedia-to-atlas.user.js` (v1.4.0),
  `tests/atlas-broadcast-import.test.js` (novo, 11),
  `tests/atlas-tab-reuse.test.js`, `tests/external-import.test.js`,
  `tests/title-branding-manual-resolve.test.js` (harnesses: pipeline único e
  versão ≥ 1.3.0), `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.
- `atlas-broadcast-import` 11/11; `atlas-tab-reuse` 7/7; `external-import`
  79/79; `external-import-enhancements` 14/14; `title-branding-manual-resolve`
  8/8; `critical-flows` 23/23 (âncoras inalteradas). Suíte (remoto): 1381 ·
  1346 · 30 · 5 (base 1370 · 1335 · 30 · 5; mesmas falhas).
- Chromium real, duas origens, userscript real nas duas páginas (Tampermonkey
  emulado entre abas): Atlas aberto primeiro pelo usuário + 3 envios →
  **2 abas no total** (Radiopaedia + Atlas), cada envio abriu o modal na aba
  existente ("Cisto paraovariano"); Atlas fechado → 1º envio abriu exatamente
  1 aba (`window.name = atlas-radiologico`). Validação final depende do
  Tampermonkey real do usuário.

## 54. Userscript 1.4.2 — correção da regressão de boot da 091g (2026-09-26)

- Relato real do usuário (Chrome + Tampermonkey): a v1.3.0 (`984ce42`) mostra
  o botão "📥 Enviar ao Atlas"; a v1.4.0/1.4.1 não.
- Não reproduzido aqui: o arquivo COMPLETO da 1.4.1 montou o botão em todos
  os cenários do Chromium (mundo da página e mundo ISOLADO como o sandbox do
  Tampermonkey; GM_* presente/ausente/lançando erro; sem BroadcastChannel).
  O que só o Tampermonkey real interpreta é o cabeçalho (novos `@grant GM_*`
  e `@match`). Não foi possível apontar a causa exata sem o navegador do
  usuário.
- 1.4.2 = texto EXATO da 1.3.0 + o mínimo da ponte:
  - boot do botão idêntico ao da 1.3.0 (`mountButton`, `readyState`/
    `DOMContentLoaded`, `setInterval(mountButton, 5000)`), com NADA da ponte
    antes; só pulado na página do Atlas;
  - GM_*/BroadcastChannel só no clique (`try` → fallback `window.open`
    nomeado) ou na página do Atlas (ponte isolada em `try`, depois do boot);
  - `defaultBridgeEnv` nunca lança;
  - classe de acentos de `titleTokens` passou de caracteres invisíveis
    literais (U+0300..U+036F, frágeis em copiar/colar) para `\u0300-\u036f`
    (mesma semântica);
  - linha de diagnóstico no console após o boot.
- Payload, título (091f), tradução, sourceUrl e regras do Atlas inalterados.
- Testes: `userscript-boot-regression` (novo, 7: arquivo completo em DOM
  simulado — botão nos 2 hosts com ponte/sem BC/sem GM/GM lançando/Atlas
  fechado/página carregando; reaparece via setInterval; reuso de aba;
  fallback; título; payload idêntico). Chromium real, arquivo completo no
  mundo isolado, URLs radiopaedia.org e www.radiopaedia.org interceptadas e
  Atlas em leopaggi.github.io servido localmente: botão presente em todos os
  cenários, reaparece após remoção, 3 envios com o Atlas aberto = 2 abas
  (modal "Apendicite aguda" na aba existente), Atlas fechado = 1 aba nova.

## 55. Proteção 093 — Conteúdo didático por lesão (2026-09-26)

### O que é
Três áreas didáticas por lesão, editáveis no formulário da lesão e
exibidas no detalhe e no Quiz (pós-resposta):
1. **Casos clínicos exemplo** — além dos importados (Radiopaedia), agora
   **casos manuais** na MESMA lista/visual (`origin: 'manual'`; importados
   antigos sem o campo = importados). Campos: título*, apresentação
   clínica* (obrigatória só no manual), fonte, URL (http/https), idade,
   sexo, modalidade, observações. Criar/editar/excluir/reordenar. O
   contador conta importados + manuais (sem os excluídos).
2. **Sinais radiológicos** — vários por lesão: nome*, categoria
   diagnóstica* (Sugestivo/Específico/Patognomônico — selo discreto com as
   cores do tema), descrição, modalidade, observações, link de referência,
   várias imagens (legenda + fonte por imagem), ordem manual.
3. **Classificações e esquemas** — título*, conteúdo formatado (seguro:
   "## subtítulo", "- lista", "**negrito**", parágrafos; tudo escapado),
   links/referências, várias imagens com legenda/fonte, ordem manual. Uso
   livre (PI-RADS, Bosniak, O-RADS, LI-RADS, Atlanta, estadiamento,
   critérios, algoritmos, conduta, tratamento…).

### Schema (na própria lesão; sincroniza junto)
- `clinicalCases[]` (existente) + opcionais `id`, `origin`, `order`,
  `createdAt`, `updatedAt`, `deletedAt`, `legacyKey`, `notes`.
- `radiologicSigns[]`: `{id, title, strength: suggestive|specific|
  pathognomonic, description, modality, notes, referenceUrl, images[],
  order, createdAt, updatedAt[, deletedAt]}`.
- `classificationSchemes[]`: `{id, title, content, links[{label,url}],
  images[], order, createdAt, updatedAt[, deletedAt]}`.
- Imagem didática: `{id, data (URL http/https), thumb, publicId, assetId,
  width, height, format, bytes, source: cloudinary|url, caption, credit,
  order, createdAt, updatedAt}` — **sem** `lesionId`/`lesionName` e nunca em
  `entry.images` (fora de ownership, tombstones de imagem, galeria e Quiz
  principal). Nunca base64 no documento. Limite 20 imagens por item.
- Identidade = `id` estável (nunca índice). Campos ausentes = `[]`
  (sem migração). Caso legado ganha `id` + `legacyKey` (identidade antiga
  url/título) só quando o usuário o gerencia (editar/excluir/ordenar).

### Sync / multi-PC
- `mergeEntryNonDestructive`: `mergeDidacticItems` (união por id; mesmo id
  → carimbo mais novo `updatedAt`/`deletedAt` vence o item inteiro;
  empate → serialização canônica; determinístico nos dois PCs) para sinais
  e classificações; `mergeClinicalCaseLists` para casos (com id → merge por
  item; legados sem id → a MESMA `unionClinicalCases` de sempre; legado que
  corresponde a um item gerenciado do outro PC, por url/título ou
  `legacyKey`, cede ao gerenciado — inclusive exclusão).
- Exclusão = tombstone `deletedAt` mantido no array → não ressuscita por PC
  desatualizado. Reimportar a URL de um caso excluído REVIVE o mesmo id
  (carimbo mais novo).
- Ordem = `order` por item (reordenar carimba os itens movidos).
- Imagens: carimbos por imagem já existem (base para a 092); hoje a edição
  concorrente do MESMO item em dois PCs resolve pelo item inteiro (mais novo).
- Fusão clínica (091c): o keeper recebe sinais/classificações do fundido
  (por id).
- Validado com write/read/pull reais (multi-device-sync): criar no A → B
  recebe; editar/reordenar no B → A recebe; excluir no A + PC B desatualizado
  salvando → nada ressuscita.

### UI
- Detalhe (ordem): conteúdo principal → Casos clínicos exemplo (n) →
  Sinais radiológicos (n) → Classificações e esquemas (n); blocos
  recolhíveis (`<details>`), cada sinal/classificação também recolhível;
  vazio = bloco oculto na leitura. Imagem abre no lightbox.
- Formulário: seção "Conteúdo didático" com 3 áreas recolhíveis (contador,
  ↑ ↓ ✏ ✕ por item, "+ Adicionar …") e editor por item em submodal.
  Upload pelo MESMO `uploadToCloudinary` (ou URL da imagem). Tudo draft até
  o Salvar da lesão (lesão nova grava só o que o usuário adicionou).
  Aviso: nunca enviar imagem com dado identificável do paciente.

### Quiz
- Sinais radiológicos e Classificações e esquemas **não são renderizados**
  antes da resposta (não existem no DOM: nada de CSS escondido). Aparecem
  no feedback pós-resposta (`renderDetail` → `lesionDidacticQuizHtml`),
  junto da descrição da lesão, com imagens. Casos clínicos: comportamento
  atual (não aparecem no Quiz). Conferido no Chromium: antes = 0 ocorrência
  de "Patognom"/título/imagem; depois = blocos e imagens; 1 overlay só.

### Arquivos / testes
- `index.html`; `tests/lesion-didactic-content.test.js` (novo, 11 — cobre
  os 33 itens pedidos); `tests/multi-device-sync.test.js` (+1 multi-PC;
  funções 093 no motor); harnesses: `clinical-cases`, `external-import`,
  `device-bootstrap`, `images-today-modal`, `snapshots-ownership` (merge por
  item envolve a união dos legados), `critical-flows` (âncoras
  +37/+37/+37/+47); `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`.
- Suíte (remoto): 1403 · 1368 · 30 · 5 (base 1391 · 1356 · 30 · 5; mesmas
  falhas). Userscript não alterado.
- Risco residual: conteúdo muito longo aumenta o documento/chunk da lesão
  no Firestore (limites por campo aplicados; `checkChunkSize` existente
  continua barrando envio grande demais).

## 56. Proteção 090b — status AUTO baseado exclusivamente em tentativas reais do Quiz (2026-09-26)

### Bug real
No navegador do usuário, várias lesões nunca abertas/estudadas/respondidas
apareciam como **Revisando AUTO**.

### Causa raiz (confirmada no código da 090)
1. `effectiveReviewState`/`computeAutomaticReviewState`: sem `REVIEW_PROGRESS`
   → devolviam `null` → "estado anterior preservado" = o valor bruto de
   `REVIEW[id]` (legado/pré-090). E `materializeReviewState` só recalculava
   ids com progresso/override: os demais mantinham o `REVIEW` legado.
2. `ensureReviewProgressBase` copiava o `REVIEW` legado para o estado-base
   `b` (com `f = 0`) ao usar setReview/setReviewAuto/Quiz — e
   `replayAutoReview(b, [])` devolvia `b`: base legada virava estado AUTO
   sem nenhuma tentativa (e servia de ponto de partida da promoção:
   legado Dominado + 1 acerto = Dominado).
3. Decisão documentada na migração da 090 ("nenhum estado vira manual;
   valores atuais preservados como base").
Os valores legados vêm do `REVIEW` antigo: pré-089 o Quiz/SRS mexia no
`REVIEW` sozinho; o merge legado sem carimbo usa o maior estágio entre PCs;
e o `REVIEW` era indexado por ids `seed_N` posicionais (renumerados por
versões antigas).

### Regra corrigida
- **Tentativa real** = item de `REVIEW_PROGRESS[id].a`, criado SÓ por
  `recordReviewAttempt` (clique de resposta no Quiz). Nunca: migração,
  seed, base/`REVIEW` legado, abrir/visualizar/editar lesão, importação,
  sync, timestamp legado, SRS isolado.
- `b` só conta quando `f > 0` (tentativas reais que saíram da janela de 8);
  com `f = 0` é legado/sintético e o ponto de partida é 0
  (`autoReviewBase`, `hasRealReviewAttempts`,
  `autoReviewStateFromProgress`).
- AUTO: 0 tentativas reais = **Não revisado**; ≥1 = **Revisando**;
  Dominado/rebaixamento com os critérios da 090 intactos (≥4 tentativas,
  ≥80% nas últimas até 5, 2 últimas corretas; sai só com ≥2 falhas nas
  últimas 3).
- `REVIEW_OVERRIDE` preservado: MANUAL continua prevalecendo;
  "Automático pelo Quiz" remove o override e recalcula só com tentativas
  reais; "Marcar para revisar novamente" = MANUAL Revisando sem apagar
  histórico.
- `ensureReviewProgressBase` nunca mais copia o legado; a dobra da janela
  parte da base real.

### Convergência (sem migração destrutiva)
`REVIEW` é tratado como cache derivado: `materializeReviewState` recalcula
TODO id (manual = escolha; AUTO = só tentativas reais) no boot (novo, em
`loadData`, sem marcar dirty nem publicar), no pull/reconcile e na escrita
(transação). Contadores Todas/Não revisado/Revisando/Dominado (getReview)
refletem já no primeiro render. A nuvem é corrigida na próxima escrita real
de qualquer PC; todos os PCs derivam o mesmo resultado. Nada é apagado de
`REVIEW_PROGRESS`/`REVIEW_OVERRIDE` (bases legadas com f=0 ficam no dado,
só não contam).
- Efeito colateral assumido (regra pedida): estados marcados manualmente
  na 089 SEM override (a 090 os tinha deixado como AUTO) também voltam a
  Não revisado — para manter, marcar de novo (vira MANUAL).

### Auditoria (somente leitura)
Console: `await auditReviewAutoStatusNow()` — lê o `REVIEW` salvo e imprime
total, manual, AUTO, AUTO sem tentativas reais, AUTO Revisando/Dominado sem
tentativas, quantos o recálculo corrige e a distribuição final. Não grava.

### Arquivos / testes
- `index.html`; `tests/review-auto-status.test.js` (novo, 7 — cobre os 16
  itens + regressão de REVIEW_PROGRESS real); ajustados à regra nova:
  `review-auto-mode` (4 asserções que fixavam o comportamento corrigido),
  `multi-device-sync` (fixtures de quarentena/089/091c passam a usar estado
  MANUAL legítimo; teste 089 reescrito para provar a convergência),
  `device-bootstrap`/`critical-flows` (stubs + âncoras +49/+49/+49/+50) e
  listas de funções dos harnesses (`controlled-duplicate-merge`,
  `review-state`).
- Fixture do bug: 9 lesões → 5 corrigidas (3 AUTO Revisando e 1 AUTO
  Dominado sem tentativa → Não revisado; distribuição final 5/2/2).
- Suíte (remoto): 1410 · 1375 · 30 · 5 (base 1403 · 1368 · 30 · 5; mesmas
  falhas).

## 57. Proteção 093b — vínculos de imagens com conteúdo didático (2026-09-26)

### Objetivo
Usar imagens JÁ enviadas da lesão (galeria principal) em casos clínicos,
sinais radiológicos e classificações/esquemas, sem duplicar asset.

### Schema final
- **Fonte única do asset:** `entry.images[]` (inalterado; nenhum campo novo,
  nenhuma migração da galeria).
- **Vínculo no item:** `clinicalCases[] / radiologicSigns[] /
  classificationSchemes[]` ganham `imageRefs: [{ imageId, order,
  captionOverride?, creditOverride?, createdAt, updatedAt, deletedAt? }]`.
- `imageId` = `stableImageKeyV208(img)` (`asset:` > `public:` > URL) — a mesma
  chave dos tombstones de imagem 073/073b. A resolução aceita qualquer forma
  estável da mesma imagem (`didacticImageAltIds`: um PC com só a URL, outro
  com o assetId).
- Legenda: padrão = `img.label` da imagem principal; `captionOverride`/
  `creditOverride` valem só naquele item e nunca alteram a imagem principal.

### Fluxos
- **Galeria (detalhe e formulário):** botão discreto `🔗 Vincular a…` /
  `🔗 n` (título lista onde está vinculada). Abre o seletor com abas Caso
  clínico / Sinal radiológico / Classificação e esquema e checkboxes (vários
  de uma vez; desmarcar = desvincular). No detalhe grava na hora (`saveData`);
  no formulário vira draft até o Salvar. Atalho `⚡ Vincular ao último caso
  clínico` (caso visível mais recente por `createdAt`/`updatedAt`/`addedAt`
  do importador) — só por clique.
- **Editor do item:** seção "Imagens vinculadas (n)" com miniaturas, legenda
  principal, override de legenda/fonte, ↑/↓ e ✕ (desvincula, nunca apaga a
  imagem). "+ selecionar imagens da lesão" (só imagens já enviadas; as ⏳ não
  enviadas ficam desabilitadas). Sinais/classificações: "+ adicionar nova
  imagem" (arquivo), URL e "Cole com Ctrl+V aqui" — a imagem nova vai para a
  GALERIA da lesão (`pendingImgs` → `entry.images` no Salvar, com lesionId,
  `assignedAt` e marcador 079d do fluxo normal) e é vinculada; mesmo asset
  já na galeria (assetId/publicId/URL) = só vínculo, sem duplicar. Caso
  clínico: só seleção.
- **Quadro (collage):** é um item de `entry.images` e vincula como qualquer
  imagem.
- **Exibição:** detalhe e feedback pós-resposta do Quiz renderizam só as
  imagens vinculadas de cada item (resolvidas na galeria, mesmo asset/thumb);
  lightbox navega entre as imagens do mesmo item. Quiz: nada didático no DOM
  antes da resposta (inalterado); nenhuma questão/imagem nova.

### Exclusão e sync
- Desvincular = tombstone do VÍNCULO (`deletedAt`); a imagem fica na galeria.
- Imagem principal excluída (tombstone 073) → vínculo INERTE (não renderiza,
  nunca recria a imagem). Só o Salvar do editor do item desativa vínculos cuja
  imagem tem tombstone confirmado; ausência sem tombstone (ainda não
  sincronizou) mantém o vínculo.
- `mergeDidacticItems`: o item vence pelo carimbo como na 093, mas os
  `imageRefs` dos dois lados são unidos POR vínculo (carimbo mais novo vence;
  empate por JSON canônico; array ordenado por `imageId`) — vínculos
  concorrentes em dois PCs se somam e desvincular não ressuscita.
- Vincular/desvincular não mexe no `updatedAt` do item nem no
  `_userUpdatedAt` da lesão (não atropela edição de texto do outro PC).
- A fusão 091c usa o mesmo `mergeDidacticItems` (vínculos preservados).

### Migração 093 → 093b
- Não há como ver os dados reais daqui: `auditDidacticImagesNow()` (console,
  somente leitura) conta itens com imagens no formato 093 e vínculos órfãos.
- Compatibilidade: imagens antigas dentro do item continuam aparecendo.
- Migração só por ação do usuário: ao Salvar o editor do item, cada imagem
  antiga vira imagem da galeria (sem upload; mesmo asset já na galeria = só
  vínculo) + vínculo; legenda/fonte antigas diferentes da principal viram
  override; o item fica com `images: []`. Nada roda no carregamento.

### Não alterado
- Userscript (v1.4.2) e importação do Radiopaedia (sem vínculo por URL; caso
  importado chega sem vínculo). Firestore Rules. Estrutura de `entry.images`.

### Risco residual
- Imagem enviada pelo editor do item entra na galeria mesmo se o usuário
  cancelar só o editor do item (fica visível para remover com ✕); cancelar o
  formulário inteiro descarta tudo, mas o arquivo já enviado ao Cloudinary
  fica órfão lá (mesmo comportamento do upload da 093).
  **→ Era uma regressão da regra histórica (upload só no Salvar) e foi
  corrigida na 093c (seção 58).**
- "🔄 trocar imagem" na galeria troca o asset: vínculos da imagem antiga
  ficam inertes.

### Arquivos / testes
- `index.html`; `tests/didactic-image-links.test.js` (novo, 18 testes
  cobrindo os 28 itens); `multi-device-sync` (+1 cenário real A↔B: vínculo
  sem carimbar a lesão, concorrentes somam, desvincular não ressuscita,
  asset único — falha sem o merge por vínculo); listas de funções dos
  harnesses (`multi-device-sync`, `device-bootstrap`, `clinical-cases`,
  `external-import`); âncoras de `critical-flows` (+12/+12/+12/+64).
- Smoke no Chromium: 🔗 no detalhe (sinal + classificação), atalho do último
  caso (legado ganha id), lightbox 1/2, editor com seleção/URL duplicada
  (dedup)/URL nova/Ctrl+V em sinal e classificação, migração 093 sem
  duplicar, desvincular mantendo a imagem, Quiz 0 imagens didáticas antes /
  6 depois com uma única overlay; sem erros de página.
- Suíte (remoto): 1429 · 1394 · 30 · 5 (base 1410 · 1375 · 30 · 5; mesmas
  falhas).

## 58. Proteção 093c — restaura upload somente no Salvar para imagens didáticas (2026-09-26)

### Regressão corrigida
Regra histórica do Atlas: **imagem só vai ao Cloudinary depois do Salvar.**
O editor do item (sinal radiológico / classificação-esquema) chamava
`uploadToCloudinary` na hora em que o arquivo era escolhido ou colado
(Ctrl+V). Isso veio da 093, que já enviava na hora e guardava a imagem dentro
do item; a 093b manteve o envio imediato e só mudou o destino para a galeria.
Resultado: asset órfão no Cloudinary ao cancelar, e imagem na galeria mesmo
com o item cancelado.

### Mecanismo reaproveitado (pré-093, formulário principal)
`buildPendingImage(file, trackObjectUrl)` → `{source:'pending', data: blob
URL (preview), _file, _objectUrl}` em `pendingImgs`; `f-cancel` →
`releasePendingObjectUrls()`; `f-save` → `uploadPendingImage` (única
chamada ao Cloudinary) → `remoteImgs` → `entry.images` (lesionId,
`assignedAt`, marcador 079d). Nenhum fluxo paralelo foi criado.

### Fluxo depois da correção
- Arquivo/Ctrl+V no editor do item → `imageCtx.addPendingFile(file)` = o
  mesmo `buildPendingImage` → entra em `pendingImgs` (preview por blob) com
  `_pendingKey = 'pending:…'`; o item vincula essa chave temporária (pode
  reordenar, desvincular, dar legenda só do item).
- URL nova → draft do formulário (`pendingImgs`, como o "+ URL" da
  galeria); nada persiste antes do Salvar.
- Cancelar o ITEM → o editor desfaz o que ELE pôs na galeria
  (`imageCtx.removeImage`, blob revogada). Imagem existente reaproveitada não
  é tocada.
- Cancelar o FORMULÁRIO → caminho de sempre (nada enviado, nada gravado).
- Salvar o formulário → uploads (uma vez por temporária) → mapa
  `pending:… → stableImageKeyV208(asset)` → `remapPendingImageRefs` nos 3
  drafts → grava tudo junto. Vínculo de temporária removida/desvinculada é
  descartado; `pending:` nunca chega ao DATA/nuvem.
- Falha no upload durante o Salvar → retorna antes do remapeamento e de
  qualquer escrita na lesão (formulário continua aberto com as temporárias;
  os uploads anteriores dessa tentativa seguem o comportamento histórico).
- Seletor "+ selecionar imagens da lesão": temporárias do formulário também
  são selecionáveis (⏳ nova — envia no Salvar).

### Onde o Cloudinary é chamado agora (formulário)
Somente em `f-save` (`uploadPendingImage`), após as validações. O editor do
item não tem nenhuma chamada de upload. (O construtor de quadro fora do
formulário, em modo não diferido, continua como antes.)

### Não alterado
`imageRefs`, vínculo múltiplo, override de legenda/fonte, botão 🔗,
"Vincular ao último caso clínico", Quiz, sync, userscript, Radiopaedia.

### Arquivos / testes
- `index.html`; `tests/didactic-pending-images.test.js` (novo, 8 testes
  cobrindo os 13 itens); ajustadas as asserções que fixavam o upload
  imediato (`lesion-didactic-content` 093 e `didactic-image-links` 093b);
  âncora do importHandler em `critical-flows` (+27).
- Smoke no Chromium com espião no `uploadToCloudinary`: Ctrl+V e arquivo em
  sinal com preview blob e 0 upload; cancelar item → galeria volta ao
  original; Ctrl+V + URL em classificação e cancelar formulário → 0 upload e
  DATA idêntico; falha simulada no Salvar → DATA idêntico e formulário
  aberto; Salvar → 3 uploads para 3 temporárias, imagens em `entry.images`
  com lesionId, vínculos com a chave real (legenda do item preservada),
  imagem existente/URL do mesmo asset sem novo upload, nenhum
  `pending:`/`blob:` persistido; sem erros de página.
- Suíte (remoto): 1437 · 1402 · 30 · 5 (base 1429 · 1394 · 30 · 5; mesmas
  falhas).
