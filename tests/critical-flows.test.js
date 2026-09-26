'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{', `Bloco nao inicia em { na posicao ${openingBrace}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }

  throw new Error(`Bloco sem fechamento iniciado na linha ${lineNumberAt(source, openingBrace)}`);
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  const block = extractBlock(source, openingBrace);
  return {
    source: source.slice(declaration.index, openingBrace) + block,
    body: block.slice(1, -1),
    index: declaration.index,
    line: lineNumberAt(source, declaration.index)
  };
}

function extractAssignedArray(source, name) {
  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Declaracao ${name} nao encontrada`);
  const start = source.indexOf('[', declaration.index + declaration[0].length);
  assert.notEqual(start, -1, `Array de ${name} nao encontrado`);

  const closing = { '[': ']', '{': '}', '(': ')' };
  const stack = [']'];
  let quote = null;
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (closing[char]) stack.push(closing[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Array ${name} sem fechamento`);
}

function extractImportHandler(source) {
  const marker = "document.getElementById('import-file').addEventListener('change', async (ev)=>";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'Handler de importacao nao encontrado');
  const openingBrace = source.indexOf('{', start + marker.length);
  const block = extractBlock(source, openingBrace);
  return {
    body: block,
    index: start,
    line: lineNumberAt(source, start)
  };
}

function invocationLocations(source, name) {
  const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
  return [...source.matchAll(pattern)]
    .filter((match) => !/function\s*$/.test(source.slice(Math.max(0, match.index - 30), match.index)))
    .map((match) => ({ index: match.index, line: lineNumberAt(source, match.index) }));
}

const recovery = extractFunction(html, 'recoverCanonicalBaseV154');
const brokenArtifacts = extractFunction(html, 'hasBrokenMigrationArtifacts');
const loadData = extractFunction(html, 'loadData');
const importHandler = extractImportHandler(html);
// ALTERAÇÃO 073: o handler de importação une tombstones (reais, extraídos).
const tombTimeFnCF = extractFunction(html, 'tombstoneTime');
const isValidTombFnCF = extractFunction(html, 'isValidImageTombstone');
const tombScopeFnCF = extractFunction(html, 'tombstoneScopeKey');
const normalizeTombFnCF = extractFunction(html, 'normalizeTombstoneMap');
const mergeTombFnCF = extractFunction(html, 'mergeImageTombstones');
const saveTombFnCF = extractFunction(html, 'saveImageTombstones');

test('fluxos criticos sao localizados estaticamente no index.html', () => {
  // Todas as 4 ancoras sobem depois da Central de Revisoes + Solucoes
  // (LESION_REVISIONS): o modulo de dados/funcoes foi inserido logo apos
  // saveReview() (antes de recovery/brokenArtifacts), e o handler de
  // importacao ganhou uma linha a mais (restaura LESION_REVISIONS do
  // backup completo). loadData() tambem ganhou uma chamada nova no corpo
  // (await loadLesionRevisions()), mas isso nao move a linha da propria
  // declaracao de loadData, so o que vem depois dela.
  // +12 na revisao anterior: hotfix do badge do header nao atualizar sem F5
  // (updateReviewCenterBadges() passou a ser chamada direto de dentro das
  // funcoes de mutacao, com um comentario explicando o motivo).
  // +186 na revisao anterior: evolucao pra maquina de estados de dois
  // aceites (pending -> proposed -> applied_pending_validation ->
  // accepted/rejected), com snapshot/rollback por tentativa, validacao
  // estruturada de proposedChanges e as duas abas do painel de solucoes —
  // tudo inserido antes de recovery/brokenArtifacts, no modulo LESION_REVISIONS.
  // +10 na revisao anterior: melhoria de legibilidade do Quiz clinico (CSS
  // do painel "CASO TEORICO"/alternativas/pergunta, dentro do <style> no
  // topo do arquivo, bem antes de recovery/brokenArtifacts/loadData/
  // importHandler — por isso os 4 deslocam igualmente).
  // +30 nesta revisao: carrossel de imagens do Quiz + atalho "adicionar
  // imagem sem sair do Quiz". openCommonsImageSearch()/stripHtmlText()
  // foram movidas de dentro de openForm() pra escopo top-level e
  // parametrizadas (reaproveitadas pelo novo openQuizAddImageModal()), mais
  // CSS do carrossel/modal — tudo antes de recovery/brokenArtifacts.
  // +2 nesta continuação: estilos dos controles/modais pós-resposta do Quiz.
  // O construtor de quadro foi movido/parametrizado com saldo neutro antes
  // das três primeiras âncoras; seu foco inicial soma uma linha à importação.
  // +19 na correção pontual seguinte: controles visíveis de editar/remover
  // imagem no modal do Quiz e helpers seguros, inseridos antes das âncoras.
  // +33 nesta continuação: exclusão segura de assets do Cloudinary — script
  // firebase-functions-compat (+1) e helpers hasSecureCloudinaryIdentifier/
  // requestCloudinaryAssetDeletion logo após uploadToCloudinary, antes das
  // âncoras. Os ganchos de exclusão ficam DENTRO de openForm/openQuizAddImageModal
  // (depois de loadData), e o handler de importação não foi alterado em tamanho
  // por isso — apenas deslocado pelas inserções anteriores.
  // Mudança de estratégia (upload diferido, sem backend): removidos o script
  // firebase-functions-compat e os helpers de delete remoto (antes das
  // âncoras). O upload diferido do editor (blob URL + File em memória) fica
  // DENTRO de openForm (depois de recovery/brokenArtifacts/loadData), então
  // essas três voltam a cair; a importação recua pelo mesmo bloco removido.
  // +18 nesta continuação: helpers compartilhados buildPendingImage()/
  // uploadPendingImage() (usados pelo Editar E pelo Quiz) inseridos logo após
  // updateLesionImageLabel(), antes das quatro âncoras; o modal transacional
  // do Quiz fica depois de importHandler e não desloca as três primeiras.
  // +33 nesta continuação: cancelamento manual do pedido de revisão —
  // cancelLesionReview()/CANCELLABLE_REVIEW_STATUSES no módulo
  // LESION_REVISIONS (antes das âncoras) e o CSS do modal de cancelamento no
  // <style> do topo. As quatro âncoras deslocam igualmente.
  // +5 nesta continuação: produtividade de imagens — bloco de preservação do
  // assignedAt mais antigo dentro de unionEntryImages() (antes das quatro
  // âncoras; merge nunca gera timestamp, só adota o mínimo válido).
  // +5 só no importHandler: carimbo de assignedAt no Salvar do editor
  // (stampNewImagesAssignedAt após normalizar as imagens, antes de
  // deleteLocalImg — depois de loadData, antes do handler de importação).
  // Quiz/Concluído, dashboard, refresh e helpers novos ficam depois do
  // handler e não deslocam nada; o CSS do grid foi editado in-place.
  // +21 só no importHandler (auditoria de duplicatas do importador): trava
  // formSaving (4) + guarda no handler (2) + bloqueio findExactLesionMatch
  // antes dos uploads (14) + reset no finally (1) — tudo dentro do openForm,
  // depois de loadData. Helpers do bloqueio ficam no fim do script.
  // +28 só no importHandler (descrição geral do quadro): helpers puros
  // resolveCollageLabel/collageInitialDesc + campo textarea + pré-preenchimento
  // + label via descrição no insert — tudo no openCollageBuilder, antes do
  // handler de importação. Fluxo Cloudinary/sync intocado.
  // +8 só no importHandler (consolidação mesmo-id + auto-stage da referência):
  // auto-stage do link no draft + rede anti-mesmo-id no save (update em vez
  // de push duplicado) — dentro de openForm/openExternalDraft, depois de
  // loadData. consolidateSameIdDuplicates fica no fim do script (valor medido).
  // +7 nas quatro âncoras (CSS .tree-stats/.tree-name/ellipsis/responsivo no
  // <style>, antes de tudo) e +4 só no importHandler (métricas 1x por
  // renderTree + stats nas linhas de seção/site; helpers no fim do script).
  // +158 nas quatro âncoras (bootstrap seguro em dispositivo novo, 2026-09-21):
  // deviceBootstrapPending (perto de appStateReady) + guarda em
  // writeShardedState() + guardas em syncThisDeviceToCloud()/
  // mergeThisDeviceImagesToCloud() + o módulo inteiro "BOOTSTRAP SEGURO EM
  // DISPOSITIVO NOVO/VAZIO" (DEVICE_INITIALIZED_KEY, checkCloudForBootstrapV1,
  // openNewDeviceBootstrapModal, applyNewDeviceBootstrapChoice,
  // runNewDeviceBootstrapFlow) inserido antes de mergeReviewPreservingProgress
  // — tudo antes das quatro âncoras. +25 só em loadData()/importHandler:
  // isNewLocalDevice + comentário/ramo do catch (sem mais saveData() ali) +
  // a chamada condicional a runNewDeviceBootstrapFlow() logo após
  // loadClassificationReviewDecisions(), antes da fusão de duplicatas —
  // dentro do corpo de loadData(), por isso só desloca o que vem depois dela
  // (importHandler), não a própria declaração.
  // +15 nas quatro âncoras (descrição persistente de imagens/quadros,
  // 2026-09-21): CSS de .img-gallery-label (multilinha, comentário + regra
  // nova), .lightbox-overlay/.lightbox-img/.lightbox-close viraram
  // .lightbox-overlay/.lightbox-content/.lightbox-img/.lightbox-desc/
  // .lightbox-close (bloco de descrição abaixo da imagem) — tudo no <style>
  // do topo, antes das quatro âncoras. As mudanças de HTML/JS entre
  // loadData() e o importHandler (textarea no lugar de input na galeria do
  // editor e no modal de imagens do Quiz, `esc()` no detalhe da lesão,
  // openImageLightbox(src, description) e seus 5 call sites, rows="3" no
  // construtor de quadro) têm saldo neutro de linhas nesse trecho — por isso
  // loadData() e o importHandler deslocam igualmente às outras duas âncoras.
  // +11 nas quatro âncoras (ajuste visual das descrições, 2026-09-21): CSS
  // do .lightbox-content/.lightbox-desc (largura independente da imagem,
  // padding/line-height compactos) e do .detail-img-label (clamp de 2
  // linhas + .expanded), tudo no <style> do topo, antes das quatro âncoras.
  // +5 só no importHandler: wiring de clique pra expandir/recolher a
  // descrição no detalhe da lesão (dentro de openDetail, depois de
  // loadData) — puro toggle de classe CSS, nunca muta DATA/img.label.
  // +0 nas 3 primeiras âncoras / +16 só no importHandler (correção pontual
  // de ownership, Alteração 059, 2026-09-21): bloco de proteção arquitetural
  // dentro de loadData() (verificação de identidade semântica antes de
  // qualquer sincronismo canônico por id — ainda inerte, CANONICAL_REFRESH_
  // DISABLED_V250 continua true) desloca só o que vem depois de loadData();
  // a função fixAbscessoOligodendrogliomaOwnership20260921() foi inserida
  // depois de consolidateSameIdDuplicates(), no fim do script, e não afeta
  // nenhuma das quatro âncoras.
  // +0 nas 3 primeiras âncoras / +49 só no importHandler (expansores do
  // formulário, 2026-09-21): toggles + corpos recolhidos nos templates de
  // altPlacements/sugestões/presets por imagem, paintAltToggle, fiação dos
  // toggles, WeakSet de expandidos e helper puro altToggleLabel (fim do
  // script) — tudo dentro do openForm, depois de loadData(). Sem CSS novo,
  // sem mudança em DATA/save/chips/sync.
  // +0 nas 3 primeiras âncoras / +12 só no importHandler (layout desktop do
  // editor, 2026-09-21): <style> embutido no template + grade seção/sítio/
  // incidência + wrapper .lesion-form-body + rodapé sticky — tudo dentro do
  // template do openForm, depois de loadData(). Sem lógica alterada.
  // +0 nas 3 primeiras âncoras / +21 só no importHandler (paste amplo +
  // zoom, 2026-09-21): zona #images-field + listener com guarda de texto no
  // openForm; núcleo puro paste/zoom no fim do script. Lightbox (zoom/pan)
  // fica depois do importHandler e não desloca nada.
  // +0 nas 3 primeiras âncoras / +2 só no importHandler (toggle de tags
  // avançadas embutido na linha do título, 2026-09-21): mesma linha, sem
  // linha extra; fiação e corpos inalterados.
  // +0 nas 3 primeiras âncoras / -1 só no importHandler (bloco de tags no
  // topo do formulário, 2026-09-21): bloco movido para após o subtítulo,
  // ocorrência antiga removida; ids/fiação/dados intactos.
  // +0 nas 3 primeiras âncoras / +1 só no importHandler (correção do footer,
  // 2026-09-21): faltava a abertura do .lesion-form-body (só existia o
  // fechamento), o que quebrava o modal/rodapé no DOM; tags continuam no topo.
  // +6 nas 3 primeiras âncoras / +35 no importHandler (casos clínicos
  // exemplo — vincular caso externo a lesão existente, 2026-09-22): a UNION
  // aditiva de clinicalCases dentro de mergeEntryNonDestructive (antes das
  // três primeiras âncoras) soma 6 linhas nelas; dentro de openForm (depois
  // de loadData, antes do importHandler) entram o campo/lista de casos
  // vinculados e o draft de remoção (persistido só no Salvar, igual a
  // altPlacements) — as funções novas do importador (busca automática/
  // manual, confirmação, vínculo) ficam no fim do script e não deslocam
  // nada.
  // +0 nas 3 primeiras âncoras / +3 só no importHandler (ajuste UX
  // 22/09/2026 — não duplicar caso clínico nas referências): openDetail
  // (depois de loadData, antes do importHandler) passou a filtrar a lista
  // de referências exibida com filterReferenceLinksForDisplay(); a função
  // em si e o corte em addClinicalCaseToLesion() ficam no fim do script.
  // +80 só no importHandler (dropdown + proteção do Sítio/órgão, 22/09/2026):
  // dentro de openForm (depois de loadData, antes do importHandler) entram
  // o markup do dropdown/seta/aviso e toda a fiação (abrir/fechar, filtrar,
  // clicar opção, aviso de sítio novo) + a validação no Salvar; as funções
  // puras (knownSitesForSection/validateSiteAgainstSection/etc.) e a
  // auditoria/migração manual (console) ficam no fim do script.
  // +1 nas 4 âncoras (correção do bug do snapshot, 22/09/2026): o motivo
  // 'antes de migrar sítio de lesão' foi adicionado a
  // SAFETY_SNAPSHOT_RISK_REASONS (antes das quatro âncoras) — sem essa
  // entrada, createSafetySnapshot() sempre devolvia null pra esse motivo e
  // migrateLesionSite() sempre abortava, mesmo com o storage saudável.
  // +60 só no importHandler (dropdown de sítio na Localização adicional,
  // 22/09/2026): dentro de openForm (depois de loadData, antes do
  // importHandler) entram o markup da seta/dropdown do f-alt-site e toda a
  // fiação (abrir/fechar, filtrar por seção, selecionar opção) + a mesma
  // validação (validateSiteAgainstSection, sem allowNew) no "+ Adicionar
  // localização"; nenhuma função nova no fim do script — tudo reaproveitado
  // do dropdown do sítio principal.
  // +2 nas 4 âncoras / +44 a mais no importHandler (Histórico/auditoria de
  // imagens, 22/09/2026): o botão+painel do expansor na sidebar (bem antes
  // de recovery/brokenArtifacts) soma 2 linhas nas quatro; a fiação
  // (initImagesHistoryPanel, depois de loadData, antes do importHandler)
  // soma mais 44 só no importHandler. As funções puras
  // (buildImagesHistory/render*Html) ficam no fim do script.
  // +19 só no importHandler (correção do bug real de TDZ, mesmo dia):
  // IMAGES_HISTORY_FILTERS/DEFAULT_FILTER/PAGE_SIZE precisam ser
  // declaradas ANTES da IIFE initImagesHistoryPanel (que roda
  // imediatamente, não só num clique) — foram movidas do fim do script pra
  // logo antes da IIFE; sem isso o boot travava com "Cannot access ...
  // before initialization" (TDZ de const/let, que não são hoisted com
  // valor como function declarations são).
  // +1 nas 4 âncoras (Histórico fora das Ferramentas avançadas): removida a
  // cópia duplicada do painel de dentro de #advanced-tools (IDs duplicados);
  // mantida a ocorrência da sidebar, acima de "configurar Cloudinary".
  // Valores remedidos com o algoritmo do próprio teste (lineNumberAt).
  // +0 nas 3 primeiras âncoras / +10 só no importHandler (Voltar p/ imagens
  // de hoje, 22/09/2026): contexto returnTo em openDetail + botão + fiação —
  // tudo dentro de openDetail, depois de loadData(). Sem mudar chamadas
  // existentes nem outros fluxos.
  // +0 nas 3 primeiras âncoras / +11 só no importHandler (estado padrão de
  // filtros, 22/09/2026): boot ignora seção/sítio antigos + botão Limpar
  // cobre tags/busca/escopo/Revisões — em loadData/renderTagbar, depois de
  // loadData(). Sem tocar em dados, sync ou outras prefs.
  // +5 só no importHandler: guarda typeof document no boot (testes isolados
  // sem DOM).
  // +23 nas quatro âncoras (Alteração 068, reativação do pull automático,
  // 2026-09-23): syncPushPending/lastSyncOkAt/lastSyncErrorAt/
  // lastSyncErrorDetail + comentário em setSyncStatus() e o listener
  // 'online' de retry logo após pushToFirebaseNow() — tudo antes das quatro
  // âncoras. +56 só em loadData() (comentário completo da causa raiz +
  // `if(!isNewLocalDevice){ await syncFromFirebase(); }`, dentro do corpo de
  // loadData(), por isso só desloca o que vem depois dela) e +23 nas linhas
  // de sincronização do diagnóstico (buildSystemDiagnosticReport, antes do
  // importHandler) — juntos deslocam só o importHandler (79 no total).
  // +48 nas quatro âncoras (Alteração 069, barreira de reconciliação,
  // 2026-09-23): guard de reentrância + comentário no topo de
  // syncFromFirebase(), o flush de syncPushPending no fim dela, os guards
  // de fbSyncing em pushToFirebase()/pushToFirebaseNow() (comentado +
  // reescrito) e em syncThisDeviceToCloud()/mergeThisDeviceImagesToCloud()
  // — tudo antes das quatro âncoras. +12 só nas linhas de sincronização do
  // diagnóstico (reconciliando/dirty local, antes do importHandler).
  // +70 nas quatro âncoras (Alteração 069, auditoria read-only de
  // identidade de imagens local×nuvem): imageIdentityDivergenceForEntry +
  // buildImageIdentityDivergenceReport + buildImageIdentityDivergenceAuditFromServer,
  // inseridas antes de syncCountersMatch — tudo antes das quatro âncoras.
  // +18 só nas linhas de sincronização do diagnóstico (chamada da auditoria
  // de identidade quando diverge, antes do importHandler).
  // +106 nas quatro âncoras (Alteração 070, controle de revisão / concorrência
  // otimista, 2026-09-23): CLOUD_REVISION_FIELD/lastKnownCloudRevision/
  // lastWriteRefusedReason/lastRevisionConflictAt + writeShardedState()
  // reescrita como transação com verificação de revisão + comentário
  // completo da causa raiz + writeShardedStateWithConflictRetry() +
  // syncFromFirebaseSkipTrailingPush — tudo antes das quatro âncoras. +3
  // só nas linhas de sincronização do diagnóstico (revisão da nuvem/último
  // conflito, antes do importHandler).
  // +23 nas quatro âncoras (Alteração 071, separa pull de push, 2026-09-23):
  // guard !appStateReady sem side-effect em pushToFirebase()/pushToFirebaseNow()
  // + a checagem localHasExclusiveContent (reaproveita buildImageIdentityDivergenceReport)
  // dentro de syncFromFirebase() — tudo antes das quatro âncoras. +43 só em
  // loadData() (comparação preMigrations*/migrationsChangedSomething, dentro
  // do corpo de loadData(), só desloca o que vem depois dela) e +13 nas
  // linhas de diagnóstico de conflitos de ownership, antes do importHandler.
  // +50 nas quatro âncoras (Alteração 072, syncDirty persistente + zero
  // writes no boot, 2026-09-23): bloco SYNC_DIRTY_KEY/let syncDirty/
  // markSyncDirty/clearSyncDirty + parâmetro internal + comentários em
  // saveReview()/saveSRS()/saveSessionLog() + guardas de escrita em
  // writeShardedState()/pushToFirebase()/syncThisDeviceToCloud()/
  // mergeThisDeviceImagesToCloud()/syncFromFirebase() + saveData(true) na
  // migração legacy — tudo antes das quatro âncoras. +5 só em loadData()
  // (saveData(true) interno em deduplicateV171(), entre as âncoras e
  // loadData) e +153 só no importHandler (cargas internas de boot/migração
  // + comentários de causa raiz dentro de loadData() e +84 nas linhas de
  // sincronização do diagnóstico, antes do importHandler). A função
  // normalizeLegacyImageOwnerLabel() fica no fim do script (depois do
  // importHandler) e não desloca nenhuma âncora. Deltas conferidos hunk a
  // hunk contra o git diff (+323/+323/+328/+481 vs HEAD) — deslocamento
  // totalmente explicado, sem duplicação de função. Valores remedidos com
  // o algoritmo do próprio teste (lineNumberAt).
  // +94 nas quatro âncoras (Alteração 072b, normalização de etiqueta legada
  // NO pull, 2026-09-23): legacyImageHoldersByKey() + tryNormalizeLegacyPullImage()
  // + comentários antes de unionEntryImages(), o ramo de normalização dentro
  // do loop do pull, o parâmetro legacyCatalog em mergeEntryNonDestructive()
  // com o gate de mesmo-id e o comentário no loop do syncFromFirebase() —
  // tudo antes da primeira âncora, por isso o deslocamento é uniforme.
  // Deltas reconferidos hunk a hunk contra o git diff (+417/+417/+422/+575
  // vs HEAD) — deslocamento totalmente explicado, sem duplicação de função.
  // +12 nas quatro âncoras (Alteração 072c, holders por stable key única +
  // campo conflictingHolders no evento de bloqueio, 2026-09-23): tudo antes
  // da primeira âncora, deslocamento uniforme. Deltas reconferidos
  // (+429/+429/+434/+587 vs HEAD) — totalmente explicado.
  // +158 nas quatro âncoras (Alteração 073, tombstones de imagem excluída,
  // 2026-09-23): módulo TOMBSTONES + payload meta + merges + sync (tudo
  // antes da primeira âncora) — valores 6844/6854/9401/13027.
  // +35 nas quatro âncoras (Alteração 073b, escopo por lesão, 2026-09-23):
  // chave de escopo + normalize + matching scoped + comentários (tudo antes
  // da primeira âncora, deslocamento uniforme). Valores remedidos com o
  // algoritmo do próprio teste (lineNumberAt) — eram 6879/6889/9436/13062.
  // +117 nas quatro âncoras (Alteração 074, pre-push reconciliation,
  // 2026-09-23): núcleo reconcileStateWithRemote() + reconcileBeforePush()
  // + contadores + persistLocalStateNow() antes da primeira âncora
  // (deslocamento uniforme); +19 só no importHandler: hook de reconcile
  // no Salvar do editor (+13) + linhas de diagnóstico (+6) — depois de
  // loadData, antes do handler. Deltas conferidos hunk a hunk contra o
  // git diff (+310/+310/+310/+374 vs c11f54d) — totalmente explicado
  // (o resto dos hunks é 073/073b, já contabilizado). Valores remedidos
  // com o algoritmo do próprio teste (lineNumberAt).
  // +45 só no importHandler (073): carga/varredura no corpo
  // de loadData() (+11), hook de tombstone no Salvar do editor (+22) e
  // linhas de diagnóstico (+8) + campo no export (+4) — depois de loadData,
  // antes do handler de importação. Quiz/backup-import ficam depois do
  // handler e não deslocam nada. Deltas conferidos hunk a hunk contra o git
  // diff vs c11f54d (+158/+158/+158/+203) — totalmente explicado.
  // +26 nas quatro âncoras (quarentena estrutural dos 70 high ids da
  // contaminação multi-PC de 2026-09-24): QUARANTINED_HIGH_IDS_20260924
  // (Set fixo com seed_1213..seed_1282, ver ATLAS_CANONICO_LIMPO_1216_116_
  // DIFF.json) + isQuarantinedSeedId() inseridos logo após
  // SUPPRESSED_DUPLICATE_IDS_V172, antes de getActiveCanonicalSeed() — ou
  // seja, antes da primeira âncora. Os ~14 call sites de
  // SUPPRESSED_DUPLICATE_IDS_V172.has( foram trocados (mesma linha, sem
  // ganho/perda) para isQuarantinedSeedId(, incluindo dentro do
  // importHandler — por isso o deslocamento é uniforme nas quatro âncoras.
  // +16 nas quatro âncoras (Alteração 076, pre-push reconcile no push
  // debounced + comentário da regra dos "caminhos reais" atualizado para 5):
  // bloco reconcileBeforePush('push') dentro do setTimeout de
  // pushToFirebase() (usado por saveReview/saveSRS/saveSessionLog/
  // saveOrder/saveSiteOrder) + 1 linha a mais no comentário de
  // markSyncDirty/syncDirty — tudo antes da primeira âncora, deslocamento
  // uniforme. +10 a mais só em importHandler (mesma Alteração 076):
  // markSyncDirty() + comentário no Salvar do editor, entre loadData() e o
  // handler de importação — só desloca o que vem depois de loadData().
  // +369 nas quatro âncoras (Alteração 077, restore canônico dedicado,
  // 2026-09-24): canonicalRestoreInProgress (perto de deviceBootstrapPending)
  // + guards nos chokepoints de sync/push + o módulo inteiro
  // restoreCanonicalStateToCloud (quarantineIndexedByLesionId,
  // sanitizeCanonicalPayloadForQuarantine, validateCanonicalPayload,
  // canonicalJsonString/deepStableEqual, restoreCanonicalStateToCloud em
  // si) inserido logo após forceThisDeviceToCloud() — tudo antes da
  // primeira âncora, deslocamento uniforme (nada entre loadData e
  // importHandler desta vez, por isso o mesmo +369 nos quatro).
  // +7 nas quatro âncoras (Alteração 077b, 2026-09-24): correção do
  // default REVIEW de validateCanonicalPayload (139 -> 138, seed_1282 era
  // um high id residual no REVIEW cru do canônico que a quarentena
  // corretamente remove) — comentário explicativo antes da própria linha,
  // antes da primeira âncora, deslocamento uniforme.
  // +38 nas quatro âncoras (Alteração 078, 2026-09-24): função nova
  // adoptRemoteStateForNewDevice() (adoção 1:1 da nuvem pra device novo,
  // sem merge com o SEED-como-local) inserida logo antes de
  // applyNewDeviceBootstrapChoice() — antes da primeira âncora,
  // deslocamento uniforme.
  // +66 nas tres primeiras ancoras, +67 em importHandler (Alteracao 079,
  // 2026-09-24): barreira final de quarentena em writeShardedState()
  // (bloco de comentario + filtro de DATA/REVIEW/SRS antes da escrita),
  // guard de stale-merge em mergeEntryNonDestructive() e no-op detection em
  // reconcileBeforePush() — tudo antes da primeira ancora, deslocamento
  // quase uniforme (a diferenca de +1 em importHandler ja existia antes,
  // ver "+10 a mais so em importHandler" na Alteracao 076 acima).
  // +81 nas quatro ancoras (Alteracao 079b, 2026-09-24, versao final):
  // pendingWriteImageExclusionsById (variavel compartilhada, mesmo padrao de
  // syncFromFirebaseSkipTrailingPush) + hint transitorio em
  // mergeEntryNonDestructive() + coleta em reconcileStateWithRemote() +
  // consumo em writeShardedState() — protege só o que é ENVIADO a nuvem,
  // nunca a copia local (Alteracao 073 preservada) — antes da primeira
  // ancora, deslocamento uniforme.
  // +94 nas quatro ancoras (Alteracao 079c, 2026-09-24): barreira final de
  // imagens stale no choke-point de escrita — gateStaleLocalOnlyImagesForWrite()
  // (funcao pura) + leitura da base remota e uniao de tombstones DENTRO da
  // transacao de writeShardedState() + no-op guard de reconcileBeforePush()
  // comparando o payload ja filtrado — tudo antes da primeira ancora,
  // deslocamento uniforme.
  // +100 nas tres primeiras ancoras / +108 no importHandler (Alteracao 079d,
  // 2026-09-24): modulo de marcadores persistentes de inclusao explicita
  // (PENDING_LOCAL_IMAGE_ADDS) + gate exigindo marcador + snapshot/confirmacao
  // em writeShardedState() + confirmacao no reconcile + marcacao em
  // addImageToLesionData() — tudo antes da primeira ancora; +7 so no
  // importHandler pela marcacao no Salvar do editor e +1 pelo load dos
  // marcadores dentro de loadData (ambos entre loadData e ele).
  // +85 nas quatro ancoras (Protecao 084, 2026-09-25): LESION_REVISIONS
  // sincronizada — saveLesionRevisions(internal) + mergeLesionRevisions()
  // no modulo da Central e lesionRevisions em writeShardedState/
  // readShardedState/reconcile/persist/pull/adocao/auditoria — tudo antes
  // da primeira ancora, deslocamento uniforme.
  // +23 nas tres primeiras ancoras / +121 no importHandler (Protecao 085,
  // 2026-09-25): ORDER_STAMPS + merge de ordem em writeShardedState/
  // readShardedState/reconcile/persist/pull/adocao/merge de imagens e o
  // carimbo na restauracao de snapshot — antes da primeira ancora; +98 so no
  // importHandler: funcoes de carimbo/merge de ordem junto de saveOrder/
  // saveSiteOrder, load dos carimbos em loadData e o carimbo no proprio import.
  // +36 nas quatro ancoras (Protecao 086, 2026-09-26): CSS
  // .lesion-review-warning + hasActiveLesionReview/lesionReviewWarningHtml/
  // refreshLesionReviewWarnings no modulo da Central — tudo antes da primeira
  // ancora, deslocamento uniforme.
  // +5 nas tres primeiras ancoras / +61 no importHandler (Protecao 087,
  // 2026-09-26): CSS da sequencia livre antes da primeira ancora; helpers
  // (normalizeCustomSequence/addSequenceToImageLabel/collageSeqSelectHtml),
  // linha "Outra / personalizada" no editor e campo livre no quadro entre
  // loadData e o importHandler.
  // +8 nas tres primeiras ancoras / +64 no importHandler (Protecao 088,
  // 2026-09-26): CSS do contexto clinico por imagem antes da primeira ancora;
  // campos no editor, preservacao na troca/salvar entre loadData e o
  // importHandler.
  // +88 nas duas primeiras ancoras / +89 em loadData / +105 no importHandler
  // (Protecao 089, 2026-09-26): REVIEW_STAMPS + normalize/load/save/
  // stampRestoredReview/mergeReviewByRecency/consolidateReviewOnMerge, CSS do
  // seletor explicito, merge por recencia em write/read/reconcile/persist/
  // pull/adocao — antes da primeira ancora; +1 (load dos carimbos) antes de
  // loadData; +16 (seletor do card, export/import) antes do importHandler.
  assert.equal(recovery.line, 8048);
  assert.equal(brokenArtifacts.line, 8038);
  assert.equal(loadData.line, 10596);
  assert.equal(importHandler.line, 14486);
});

test('inventario de chamadas da recuperacao automatica e deterministico', () => {
  const recoveryCalls = invocationLocations(html, 'recoverCanonicalBaseV154');
  const detectorCalls = invocationLocations(html, 'hasBrokenMigrationArtifacts');

  assert.deepEqual(recoveryCalls, []);
  assert.deepEqual(detectorCalls, []);
  assert.doesNotMatch(loadData.body, /await\s+recoverCanonicalBaseV154\(\);/);
  console.log('recoverCanonicalBaseV154: 0 chamadas automaticas');
  console.log('hasBrokenMigrationArtifacts: 0 chamadas');
});

test('SEGURANCA: loadData nao deve chamar recuperacao do SEED automaticamente', () => {
  const callsInsideLoad = invocationLocations(loadData.body, 'recoverCanonicalBaseV154');
  assert.equal(
    callsInsideLoad.length,
    0,
    'Defeito conhecido: loadData chama recoverCanonicalBaseV154 automaticamente apos ler o estado persistido'
  );
});

// ===========================================================================
// ALTERACAO 008 (2026-09-19) — sincronizacao automatica NUVEM->LOCAL tinha
// sido desativada dentro de loadData() porque syncFromFirebase(), chamada
// sem condicao a cada F5/login, fazia merge POR ID contra DATA local e
// reintroduzia duplicatas/ownership antigo que a reconciliacao V2 tinha
// acabado de eliminar.
//
// ALTERACAO 068 (2026-09-23) — REATIVADA, com guarda, para corrigir o "PC do
// hospital abriu com metade das imagens": um dispositivo JA inicializado
// (catalogo local existente havia semanas) nunca consultava a nuvem de novo
// — so empurrava (push incondicional a cada saveData() e no fim do proprio
// boot) o que tinha localmente, e como writeShardedState() faz .set() (nao
// merge), isso apagava do Firestore qualquer imagem/lesao que so existisse
// na nuvem. A causa especifica da Alteracao 008 (merge por ID reintroduzindo
// duplicata/ownership antigo) esta coberta hoje por protecoes que nao
// existiam em 2026-09-19 (SUPPRESSED_DUPLICATE_IDS_V172 filtrando os DOIS
// lados do merge, mergeEntryNonDestructive/canChangeImageOwnership) — ver o
// comentario completo em loadData(), no proprio index.html. A chamada so
// acontece quando isNewLocalDevice e falso (dispositivo novo ja resolveu a
// decisao explicitamente no modal do bootstrap, alguns passos antes).
// Os testes abaixo sao comment-aware (usam isInsideComment, nao apenas um
// regex cru) porque o comentario que documenta a alteracao MENCIONA
// "syncFromFirebase()" varias vezes de proposito — um teste ingenuo baseado
// em regex simples acusaria falso positivo nessas mencoes.
// ===========================================================================

function isInsideComment(source, index) {
  const before = source.slice(Math.max(0, index - 4000), index);
  const lastBlockOpen = before.lastIndexOf('/*');
  const lastBlockClose = before.lastIndexOf('*/');
  const insideBlockComment = lastBlockOpen > lastBlockClose;
  const lastLineStart = before.lastIndexOf('\n') + 1;
  const lineSoFar = before.slice(lastLineStart);
  const insideLineComment = /\/\//.test(lineSoFar);
  return insideBlockComment || insideLineComment;
}

function activeCallLocations(source, name) {
  return invocationLocations(source, name).filter((match) => !isInsideComment(source, match.index));
}

const showApp = extractFunction(html, 'showApp');

function extractOnAuthStateChanged(source) {
  const marker = 'fbAuth.onAuthStateChanged(async (user)=>{';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'onAuthStateChanged nao encontrado');
  const openingBrace = source.indexOf('{', start + marker.length - 1);
  const block = extractBlock(source, openingBrace);
  return { source: source.slice(start, start + marker.length - 1) + block, index: start, line: lineNumberAt(source, start) };
}
const onAuthStateChangedBlock = extractOnAuthStateChanged(html);

test('ALTERACAO 068: loadData() chama syncFromFirebase() exatamente uma vez, guardado por !isNewLocalDevice', () => {
  const active = activeCallLocations(loadData.source, 'syncFromFirebase');
  assert.equal(active.length, 1, 'loadData() precisa ter exatamente UMA chamada ATIVA a syncFromFirebase()');
  assert.match(loadData.source, /if\(!isNewLocalDevice\)\{\s*\n\s*await syncFromFirebase\(\);\s*\n\s*\}/, 'a chamada automatica precisa ficar dentro de um guard !isNewLocalDevice — dispositivo novo ja decidiu explicitamente no modal do bootstrap');
  // A chamada guardada precisa vir DEPOIS do bootstrap de dispositivo novo
  // (isNewLocalDevice ja esta decidido) e ANTES do primeiro push incondicional
  // do fim do boot — senao o push levaria o estado local desatualizado.
  const idxBootstrapCall = loadData.source.indexOf('await runNewDeviceBootstrapFlow();');
  const idxAutoSync = loadData.source.indexOf('if(!isNewLocalDevice){');
  const idxFirstUnconditionalPush = loadData.source.indexOf('await pushToFirebaseNow();');
  assert.ok(idxBootstrapCall !== -1 && idxAutoSync !== -1 && idxFirstUnconditionalPush !== -1);
  assert.ok(idxBootstrapCall < idxAutoSync, 'a decisao do dispositivo novo precisa estar tomada antes do pull automatico');
  assert.ok(idxAutoSync < idxFirstUnconditionalPush, 'o pull precisa acontecer antes de qualquer push incondicional do boot — senao o push levaria dados desatualizados');
});

test('ALTERACAO 068: showApp() nao chama syncFromFirebase() diretamente — so chama loadData()', () => {
  const activeInShowApp = activeCallLocations(showApp.source, 'syncFromFirebase');
  assert.deepEqual(activeInShowApp, []);
  assert.match(showApp.source, /\bloadData\(\)/, 'showApp() precisa continuar chamando loadData() normalmente');
});

test('ALTERACAO 068: onAuthStateChanged (login) nao chama syncFromFirebase() diretamente', () => {
  const activeInAuth = activeCallLocations(onAuthStateChangedBlock.source, 'syncFromFirebase');
  assert.deepEqual(activeInAuth, []);
  assert.match(onAuthStateChangedBlock.source, /\bshowApp\(\)/, 'onAuthStateChanged precisa continuar chamando showApp() pro usuario autorizado');
});

test('ALTERACAO 068: cadeia completa onAuthStateChanged -> showApp -> loadData tem EXATAMENTE UM caminho ativo ate syncFromFirebase (o pull guardado de loadData)', () => {
  const combined = onAuthStateChangedBlock.source + '\n' + showApp.source + '\n' + loadData.source;
  const active = activeCallLocations(combined, 'syncFromFirebase');
  assert.equal(active.length, 1, 'o unico caminho ativo do fluxo de abertura/F5/login ate syncFromFirebase precisa ser o pull guardado dentro de loadData()');
});

test('ALTERACAO 068: syncFromFirebase() continua definida, intacta, e e a MESMA funcao usada em todos os call sites', () => {
  const fn = extractFunction(html, 'syncFromFirebase');
  assert.ok(fn.source.length > 500, 'a funcao precisa continuar com sua logica completa, nao virar um stub vazio');
  assert.match(fn.source, /readShardedState/, 'precisa continuar lendo o estado remoto de verdade');
  // ALTERAÇÃO 074: o merge mora no núcleo compartilhado
  // reconcileStateWithRemote() (mesma lógica, usada pelo pull E pelo
  // pre-push) — syncFromFirebase() o chama, sem lógica de merge paralela.
  assert.match(fn.source, /reconcileStateWithRemote\(remote\)/, 'pull usa o núcleo de reconciliação compartilhado');
  const core = extractFunction(html, 'reconcileStateWithRemote');
  assert.match(core.source, /mergeEntryNonDestructive/, 'o núcleo precisa continuar com a logica de merge original, intocada');

  // Call sites esperados: loadData() (automatico, guardado por
  // !isNewLocalDevice), exportar backup, restaurar padrao de fabrica,
  // "Atualizar deste backup/nuvem", e (ALTERACAO 070, 2026-09-23)
  // writeShardedStateWithConflictRetry() — reconcilia UMA vez antes de
  // repetir uma escrita que colidiu por revisao (nunca escreve às cegas por
  // cima de uma nuvem que mudou). ALTERAÇÃO 078 (2026-09-24) removeu a
  // escolha "Carregar meus dados da nuvem" do bootstrap de dispositivo novo
  // desta lista: ela não chama mais syncFromFirebase() — chama
  // adoptRemoteStateForNewDevice() (adoção 1:1, sem
  // mergeEntryNonDestructive), porque o "local" de um device novo é só o
  // SEED estático, nunca conteúdo real do usuário (ver teste BOOTSTRAP
  // SEGURO abaixo e ALTERAÇÃO 078 em multi-device-sync/device-bootstrap
  // tests). Nenhuma logica de merge paralela foi criada nos demais call
  // sites — todos continuam delegando pra esta mesma funcao.
  // Exclui mencoes DENTRO do proprio corpo da funcao (o rotulo de string
  // "syncFromFirebase (leitura)" usado em withFirebaseTimeout, linha 2013,
  // bate no regex ingenuo de invocationLocations mas nao e uma chamada).
  const allCalls = activeCallLocations(html, 'syncFromFirebase')
    .filter((m) => m.index < fn.index || m.index >= fn.index + fn.source.length);
  assert.equal(allCalls.length, 5, 'syncFromFirebase() so pode ser chamada por: loadData() (automatico, guardado), exportar backup, restaurar padrao de fabrica, "Atualizar deste backup/nuvem", e o retry de conflito de revisao — nenhum outro call site (bootstrap de device novo não chama mais, ver ALTERAÇÃO 078)');
});

test('BOOTSTRAP SEGURO (ALTERAÇÃO 078): a escolha "load" adota a nuvem 1:1 via adoptRemoteStateForNewDevice(), NÃO mais via syncFromFirebase()/merge — só depois da escolha do usuário no modal', () => {
  const applyChoiceFn = extractFunction(html, 'applyNewDeviceBootstrapChoice');
  const adoptFn = extractFunction(html, 'adoptRemoteStateForNewDevice');
  const modalFn = extractFunction(html, 'openNewDeviceBootstrapModal');
  const flowFn = extractFunction(html, 'runNewDeviceBootstrapFlow');
  assert.match(applyChoiceFn.body, /if\(choice === 'load'\)\{[\s\S]*?await adoptRemoteStateForNewDevice\(\);/, 'só chama adoptRemoteStateForNewDevice() no ramo "load" (usuário confirmou)');
  assert.doesNotMatch(applyChoiceFn.body, /syncFromFirebase|mergeEntryNonDestructive|reconcileStateWithRemote/, 'o bootstrap de device novo não pode mais mesclar com o SEED-como-local (bug real: 99 lesões perderam links) — só adota 1:1');
  // adoptRemoteStateForNewDevice() precisa continuar lendo o estado remoto
  // de verdade (não virou um stub vazio) e continuar sem reimplementar merge.
  assert.ok(adoptFn.source.length > 200, 'adoptRemoteStateForNewDevice não pode virar um stub vazio');
  assert.match(adoptFn.source, /readShardedState/, 'precisa continuar lendo o estado remoto de verdade');
  assert.doesNotMatch(adoptFn.source, /mergeEntryNonDestructive|reconcileStateWithRemote|unionEntryImages/, 'adoção 1:1 não pode reimplementar nem reaproveitar lógica de merge');
  assert.doesNotMatch(modalFn.body, /syncFromFirebase|adoptRemoteStateForNewDevice/, 'o modal em si não decide/grava nada, só coleta a escolha do usuário');
  assert.match(flowFn.body, /await openNewDeviceBootstrapModal\(\)/, 'a decisão vem sempre do modal, nunca de heurística automática');
  assert.match(flowFn.body, /await applyNewDeviceBootstrapChoice\(choice\)/);
  // loadData() só chama o orquestrador quando isNewLocalDevice é verdadeiro —
  // nunca chama applyNewDeviceBootstrapChoice/adoptRemoteStateForNewDevice diretamente.
  assert.match(loadData.source, /if\(isNewLocalDevice\)\{\s*\n\s*await runNewDeviceBootstrapFlow\(\);/);
  assert.doesNotMatch(loadData.source, /applyNewDeviceBootstrapChoice/);
});

test('F5 preserva as 1213 identidades ao executar o loadData real', async () => {
  const seedSource = extractAssignedArray(html, 'SEED');
  const legacySuppressedSource = extractAssignedArray(html, 'LEGACY_SUPPRESSED_DUPLICATE_IDS');
  const duplicatePairsSource = extractAssignedArray(html, 'DUPLICATE_PAIRS_V171');
  const seed = JSON.parse(seedSource);
  // Reproduz o boot real anterior a loadData(): index.html renumera todo o
  // SEED por posicao com seed_<indice> antes de ler o estado persistido.
  seed.forEach((entry, index) => { entry.id = `seed_${index}`; });
  const stages = [];
  const writes = [];
  const context = vm.createContext({
    DATA: [],
    REVIEW: {},
    SRS: {},
    SESSIONLOG: {},
    sectionOrder: [],
    siteOrder: {},
    loadOrderStamps: async () => {}, saveOrderStamps: async () => {}, // PROTEÇÃO 085
    loadReviewStamps: async () => {}, saveReviewStamps: async () => {}, // PROTEÇÃO 089
    appStateReady: false,
    SEED: seed,
    STORAGE_KEY: 'data',
    ORDER_KEY: 'order',
    SITEORDER_KEY: 'site-order',
    REVIEW_KEY: 'review',
    RECOVERY_KEY: 'recovery',
    RECOVERY_VERSION: 'test',
    DEFAULT_SECTION_ORDER: [],
    EN_TERMS: {},
    stages,
    storage: {
      get: async (key) => {
        if (key === 'data') {
          stages.push({ stage: 'storage.get', count: seed.length });
          return { value: JSON.stringify(seed) };
        }
        throw new Error(`Sem estado simulado para ${key}`);
      },
      set: async (key, value) => {
        if (key === 'data') {
          const count = JSON.parse(value).length;
          stages.push({ stage: 'storage.set', count });
          writes.push(count);
        }
      }
    },
    ensureLinks: (entry) => { entry.links = []; },
    isAutoRadiopaediaLink: () => false,
    radiopaediaSearchUrl: () => '',
    runTagCleanup: () => false,
    ensureInc: (entry) => { entry.inc = 1; },
    saveData: async () => {},
    saveOrder: async () => {},
    saveSiteOrder: async () => {},
    loadSRS: async () => {},
    loadSessionLog: async () => {},
    // ALTERAÇÃO 073: loadData() real carrega tombstones (stub, mesmo padrão).
    loadImageTombstones: async () => {},
    loadPendingLocalImageAdds: async () => {}, // ALTERAÇÃO 079d
    loadLesionRevisions: async () => {},
    loadClassificationReviewDecisions: async () => {},
    saveReview: async () => {},
    saveSRS: async () => {},
    createSafetySnapshot: () => null,
    applyAltPlacementsAudit20260918: async () => false,
    applyClassificationAudit20260918: async () => false,
    upgradeDescriptionsV169: async () => {},
    upgradeDescriptionsV170: async () => {},
    upgradeDescriptionsV173: async () => {},
    upgradeDescriptionsV175: async () => {},
    upgradeDescriptionsV176: async () => {},
    upgradeDescriptionsV177: async () => {},
    upgradeDescriptionsV179: async () => {},
    upgradeDescriptionsV180: async () => {},
    upgradeDescriptionsV181: async () => {},
    upgradeDescriptionsV182: async () => {},
    pushToFirebaseNow: async () => {},
    migrateLegacyLocalImagesToCloudinary: async () => ({ migrated: 0 }),
    // preferências locais de navegação (localStorage) — stub seguro no teste
    loadSidebarScopePref: () => ({ section: null, site: null }),
    loadQuizScopePref: () => ({ section: null, site: null }),
    // ALTERACAO 068: dispositivo ja inicializado (isNewLocalDevice=false, ver
    // storage.get acima) chama syncFromFirebase() automaticamente — stub
    // inerte aqui (sem side effects) so pra loadData() real nao quebrar; o
    // pull em si esta coberto por testes dedicados em multi-device-sync.test.js.
    syncFromFirebase: async () => {},
    renderAll: () => {},
    console: { error: () => {}, info: () => {}, log: () => {} }
  });

  const runDuplicateCleanup = extractFunction(html, 'runDuplicateCleanup').source
    .replace('function runDuplicateCleanup', 'function runDuplicateCleanupReal');
  const deduplicateV171 = extractFunction(html, 'deduplicateV171').source
    .replace('function deduplicateV171', 'function deduplicateV171Real');
  const engine = `
    const LEGACY_SUPPRESSED_DUPLICATE_IDS = new Set(${legacySuppressedSource});
    ${extractFunction(html, 'computeDuplicateSeedIds').source}
    ${html.slice(html.indexOf('const SUPPRESSED_DUPLICATE_IDS_V172'), html.indexOf('function getActiveCanonicalSeed'))}
    globalThis.legacySuppressedCount = LEGACY_SUPPRESSED_DUPLICATE_IDS.size;
    globalThis.activeSuppressedCount = SUPPRESSED_DUPLICATE_IDS_V172.size;
    ${extractFunction(html, 'getActiveCanonicalSeed').source}
    ${extractFunction(html, 'activeCanonicalSeedV172').source}
    const DUPLICATE_PAIRS_V171 = ${duplicatePairsSource};
    ${extractFunction(html, 'mergeDuplicateEntryV171').source}
    ${runDuplicateCleanup}
    function runDuplicateCleanup(){
      stages.push({stage:'runDuplicateCleanup:before', count:DATA.length});
      const result = runDuplicateCleanupReal();
      stages.push({stage:'runDuplicateCleanup:after', count:DATA.length});
      return result;
    }
    ${deduplicateV171}
    async function deduplicateV171(){
      stages.push({stage:'deduplicateV171:before', count:DATA.length});
      const result = await deduplicateV171Real();
      stages.push({stage:'deduplicateV171:after', count:DATA.length});
      return result;
    }
    ${loadData.source}
  `;
  new vm.Script(engine).runInContext(context);
  await context.loadData();

  assert.equal(context.legacySuppressedCount, 70);
  assert.equal(context.activeSuppressedCount, 0);
  assert.deepEqual(plain(stages.filter((item) => item.stage !== 'storage.set')), [
    { stage: 'storage.get', count: 1213 },
    { stage: 'runDuplicateCleanup:before', count: 1213 },
    { stage: 'runDuplicateCleanup:after', count: 1213 },
    { stage: 'runDuplicateCleanup:before', count: 1213 },
    { stage: 'runDuplicateCleanup:after', count: 1213 },
    { stage: 'deduplicateV171:before', count: 1213 },
    { stage: 'deduplicateV171:after', count: 1213 }
  ]);
  assert.equal(
    context.DATA.length,
    1213,
    `loadData reduziu 1213 para ${context.DATA.length}; gravacoes DATA: ${writes.join(' -> ')}`
  );
  assert.deepEqual(writes, [1213], 'loadData deve persistir exatamente as mesmas 1213 identidades');
});

test('recuperacao isolada demonstra reinsercao de registro SEED ausente', async () => {
  const writes = [];
  const context = vm.createContext({
    DATA: [
      { id: 'seed_1', local: 'preservado' },
      { id: 'custom_1', local: 'personalizado' }
    ],
    activeCanonicalSeedV172: () => [
      { id: 'seed_1', canonical: true },
      { id: 'seed_2', canonical: true }
    ],
    isSeedLikeId: (id) => /^seed_/.test(String(id || '')),
    storage: { set: async (...args) => writes.push(args) },
    STORAGE_KEY: 'data',
    RECOVERY_KEY: 'recovery',
    RECOVERY_VERSION: 'test-version'
  });
  new vm.Script(`${recovery.source}; globalThis.runRecovery = recoverCanonicalBaseV154;`)
    .runInContext(context);

  await context.runRecovery();

  assert.deepEqual(
    Array.from(context.DATA, (entry) => entry.id),
    ['seed_1', 'seed_2', 'custom_1']
  );
  assert.equal(context.DATA[0].local, 'preservado');
  assert.deepEqual(Array.from(writes, (write) => write[0]), ['data', 'recovery']);
});

test('operacoes potencialmente destrutivas da recuperacao sao inventariadas', () => {
  const expectedOperations = [
    /DATA\s*=\s*out/,
    /storage\.set\(STORAGE_KEY/,
    /storage\.set\(RECOVERY_KEY/
  ];
  for (const operation of expectedOperations) assert.match(recovery.body, operation);
});

test('ordem estatica do fluxo de importacao e documentada', () => {
  const body = importHandler.body;
  const read = body.indexOf('await file.text()');
  const parse = body.indexOf('JSON.parse(raw)');
  const envelopeValidation = body.indexOf("parsed.format !== 'atlas-radiologico-backup'");
  const confirmation = body.indexOf("confirm('Importar este backup completo?");
  const firstFullMutation = body.indexOf('DATA = parsed.data');

  assert.ok(read < parse, 'O arquivo deve ser lido antes do parse');
  assert.ok(parse < envelopeValidation, 'O JSON deve ser interpretado antes da validacao do envelope');
  assert.ok(envelopeValidation < confirmation, 'O envelope deve ser validado antes da confirmacao');
  assert.ok(confirmation < firstFullMutation, 'A confirmacao deve ocorrer antes da primeira mutacao completa');
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotImportState(context) {
  return JSON.stringify({
    data: context.DATA,
    review: context.REVIEW,
    srs: context.SRS,
    sessionLog: context.SESSIONLOG,
    sectionOrder: context.sectionOrder,
    siteOrder: context.siteOrder,
    scope: context.scope,
    activeTags: [...context.activeTags],
    searchTerm: context.searchTerm,
    searchValue: context.searchInput.value
  });
}

async function runImportScenario(raw, { confirmResult = true } = {}) {
  const writes = [];
  let confirmations = 0;
  const searchInput = { value: 'original' };
  const context = vm.createContext({
    DATA: [{ id: 'original', name: 'Original', s: 'Original', site: 'Original' }],
    REVIEW: { original: true },
    SRS: { original: true },
    SESSIONLOG: { original: true },
    sectionOrder: ['Original'],
    siteOrder: { Original: [] },
    DEFAULT_SECTION_ORDER: ['Padrao'],
    SUPPRESSED_DUPLICATE_IDS_V172: new Set(),
    QUARANTINED_HIGH_IDS_20260924: new Set(),
    isQuarantinedSeedId: (id) => false,
    // ALTERAÇÃO 079 (Parte A): import handler agora também quarentena REVIEW/SRS.
    quarantineIndexedByLesionId: (obj) => (obj && typeof obj === 'object') ? obj : {},
    RECOVERY_KEY: 'recovery',
    RECOVERY_VERSION: 'test-version',
    STORAGE_KEY: 'data',
    REVIEW_KEY: 'review',
    createSafetySnapshot: () => null,
    preserveLocalImageOwnershipOnImport: () => [],
    confirm: () => {
      confirmations += 1;
      return confirmResult;
    },
    deduplicateV171: async () => 0,
    saveData: async () => writes.push('saveData'),
    storage: { set: async (key) => writes.push(`storage.set:${key}`) },
    saveSRS: async () => writes.push('saveSRS'),
    saveSessionLog: async () => writes.push('saveSessionLog'),
    saveOrder: async () => writes.push('saveOrder'),
    saveSiteOrder: async () => writes.push('saveSiteOrder'),
    stampRestoredReview: () => {}, saveReviewStamps: async () => {}, // PROTEÇÃO 089 (coberto em review-state.test.js)
    markRestoredOrderManual: () => {}, // PROTEÇÃO 085 — carimbo da ordem importada (coberto em order-sync.test.js)
    scope: { section: 'Original', site: 'Original' },
    activeTags: new Set(['original']),
    searchTerm: 'original',
    searchInput,
    document: { getElementById: () => searchInput },
    renderAll: () => {},
    pushToFirebaseNow: async () => writes.push('pushToFirebaseNow-stub'),
    toast: () => {},
    console: { error: () => {}, info: () => {}, log: () => {} }
  });
  // ALTERAÇÃO 073: tombstones reais no cenário de importação.
  context.IMAGE_TOMBSTONES = {};
  new vm.Script(`${tombTimeFnCF.source}\n${isValidTombFnCF.source}\n${tombScopeFnCF.source}\n${normalizeTombFnCF.source}\n${mergeTombFnCF.source}\n${saveTombFnCF.source}\nglobalThis.runImport = async function(ev) ${importHandler.body};`)
    .runInContext(context);
  const before = snapshotImportState(context);

  await context.runImport({
    target: {
      files: [{ text: async () => raw }],
      value: 'backup.json'
    }
  });

  return {
    context,
    writes,
    before,
    after: snapshotImportState(context),
    confirmations
  };
}

test('SEGURANCA: backup malformado nao deve causar mutacao nem persistencia', async () => {
  const malformedBackup = JSON.stringify({
    format: 'atlas-radiologico-backup',
    backupVersion: 1,
    data: [{ name: 'registro sem id' }],
    review: [],
    srs: 'invalido',
    sessionLog: 42,
    sectionOrder: [null],
    siteOrder: []
  });
  const result = await runImportScenario(malformedBackup);

  assert.equal(
    result.writes.length,
    0,
    `Defeito conhecido: backup estruturalmente invalido iniciou mutacoes: ${result.writes.join(', ')}`
  );
  assert.equal(result.after, result.before);
});

test('SEGURANCA: backup legado invalido nao deve causar mutacao nem persistencia', async () => {
  const result = await runImportScenario(JSON.stringify([
    { name: 'registro legado sem estrutura minima' }
  ]));

  assert.equal(
    result.writes.length,
    0,
    `Defeito conhecido: backup legado invalido iniciou mutacoes: ${result.writes.join(', ')}`
  );
  assert.equal(result.after, result.before);
});

test('backup completo minimo valido usa defaults sem exigir campos opcionais', async () => {
  const entry = {
    id: 'custom_minimo',
    name: 'Registro minimo',
    s: 'Secao minima',
    site: 'Sitio minimo'
  };
  const result = await runImportScenario(JSON.stringify({
    format: 'atlas-radiologico-backup',
    data: [entry]
  }));

  assert.deepEqual(plain(result.context.DATA), [entry]);
  assert.deepEqual(plain(result.context.REVIEW), {});
  assert.deepEqual(plain(result.context.SRS), {});
  assert.deepEqual(plain(result.context.SESSIONLOG), {});
  assert.deepEqual(plain(result.context.sectionOrder), ['Padrao']);
  assert.deepEqual(plain(result.context.siteOrder), {});
  assert.equal(result.confirmations, 1);
  assert.ok(result.writes.length > 0, 'Backup completo valido deve chegar a persistencia');
});

test('backup legado valido aceita ID personalizado e preserva progresso', async () => {
  const entry = {
    id: 'lesao_personalizada_abc',
    name: 'Registro legado valido',
    s: 'Secao legada',
    site: 'Sitio legado'
  };
  const result = await runImportScenario(JSON.stringify([entry]));

  assert.deepEqual(plain(result.context.DATA), [entry]);
  assert.deepEqual(plain(result.context.REVIEW), { original: true });
  assert.deepEqual(plain(result.context.SRS), { original: true });
  assert.deepEqual(plain(result.context.SESSIONLOG), { original: true });
  assert.equal(result.confirmations, 1);
  assert.ok(result.writes.length > 0, 'Backup legado valido deve chegar a persistencia');
});

test('SEGURANCA: IDs duplicados devem ser rejeitados antes de qualquer mutacao', async () => {
  const duplicated = [
    { id: 'custom_repetido', name: 'Primeiro', s: 'Secao', site: 'Sitio A' },
    { id: 'custom_repetido', name: 'Segundo', s: 'Secao', site: 'Sitio B' }
  ];
  const result = await runImportScenario(JSON.stringify({
    format: 'atlas-radiologico-backup',
    data: duplicated
  }));

  assert.equal(
    result.writes.length,
    0,
    `Defeito conhecido: IDs duplicados iniciaram mutacoes: ${result.writes.join(', ')}`
  );
  assert.equal(result.after, result.before);
});

test('cancelar importacao nao altera estado nem inicia persistencia', async () => {
  const result = await runImportScenario(JSON.stringify({
    format: 'atlas-radiologico-backup',
    data: [{ id: 'custom_cancelado', name: 'Cancelado', s: 'Secao', site: 'Sitio' }]
  }), { confirmResult: false });

  assert.equal(result.confirmations, 1);
  assert.deepEqual(result.writes, []);
  assert.equal(result.after, result.before);
});

test('envelopes invalidos nao alteram estado nem iniciam persistencia', async () => {
  const invalidBackups = [
    '{json invalido',
    JSON.stringify({ format: 'outro-formato', data: [] }),
    JSON.stringify({ format: 'atlas-radiologico-backup', data: {} })
  ];

  for (const raw of invalidBackups) {
    const result = await runImportScenario(raw);
    assert.equal(result.confirmations, 0);
    assert.deepEqual(result.writes, []);
    assert.equal(result.after, result.before);
  }
});

test('operacoes potencialmente destrutivas da importacao sao inventariadas', () => {
  const body = importHandler.body;
  const stateAssignments = [...body.matchAll(/\b(?:DATA|REVIEW|SRS|SESSIONLOG|sectionOrder|siteOrder)\s*=/g)];
  const directStorageWrites = [...body.matchAll(/\bstorage\.set\s*\(/g)];
  const remotePushes = [...body.matchAll(/\bpushToFirebaseNow\s*\(/g)];

  assert.equal(stateAssignments.length, 10);
  assert.equal(directStorageWrites.length, 4);
  assert.equal(remotePushes.length, 2);
  assert.match(body, /await\s+saveData\(\)/);
  assert.match(body, /await\s+saveSRS\(\)/);
  assert.match(body, /await\s+saveSessionLog\(\)/);
  assert.match(body, /await\s+saveOrder\(\)/);
  assert.match(body, /await\s+saveSiteOrder\(\)/);
  console.log('Importacao: 10 atribuicoes de estado, 4 storage.set diretos e 2 pushes remotos');
});

// ===========================================================================
// TESTE C (ALTERAÇÃO 075/076) — quarentena estrutural dos 70 high ids da
// contaminação multi-PC de 2026-09-24. Extrai isQuarantinedSeedId() REAL
// (mesmo trecho entre SUPPRESSED_DUPLICATE_IDS_V172 e getActiveCanonicalSeed)
// e confirma o comportamento exato pedido: lista B bloqueada, lista A e o
// keeper real (seed_1212) liberados, ids u_* liberados.
// ===========================================================================
test('PROTEÇÃO 075: seed_1213..seed_1282 continuam bloqueados; seed_0..seed_1212 e u_* continuam válidos', () => {
  const start = html.indexOf('const SUPPRESSED_DUPLICATE_IDS_V172');
  const end = html.indexOf('function getActiveCanonicalSeed');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = html.slice(start, end);
  const ctx = { SEED: [], computeDuplicateSeedIds: () => new Set() };
  vm.createContext(ctx);
  vm.runInContext(block, ctx, { filename: 'quarantine-075.js' });

  for (let n = 1213; n <= 1282; n += 1) {
    assert.equal(ctx.isQuarantinedSeedId('seed_' + n), true, 'seed_' + n + ' (lista B) precisa continuar em quarentena');
  }
  assert.equal(ctx.isQuarantinedSeedId('seed_1212'), false, 'seed_1212 é o keeper real — nunca pode ser bloqueado');
  assert.equal(ctx.isQuarantinedSeedId('seed_0'), false);
  for (const id of ['seed_7', 'seed_39', 'seed_1125']) {
    assert.equal(ctx.isQuarantinedSeedId(id), false, id + ' (lista A, legado/posicional) precisa continuar liberado');
  }
  assert.equal(ctx.isQuarantinedSeedId('u_1790101615508_5dm18o'), false, 'ids u_* precisam continuar liberados');
});

// ===========================================================================
// TESTE B, guarda estática (ALTERAÇÃO 076) — reforça em cima da própria
// fonte do index.html que markSyncDirty() roda ANTES da tentativa de
// reconcile/push no Salvar do editor. O comportamento funcional completo
// (preflight falho mantém syncDirty=true; retry na reconexão preserva a
// edição) é coberto em tests/multi-device-sync.test.js — este teste aqui é
// especificamente para impedir que alguém remova a chamada por engano numa
// edição futura, já que o handler inteiro (DOM/Cloudinary) não é executável
// isolado num vm.
// ===========================================================================
test('ALTERAÇÃO 076: markSyncDirty() roda ANTES de reconcileBeforePush no Salvar do editor', () => {
  // Não usa extractBlock/extractFunction aqui de propósito: este handler
  // contém, mais acima (fora da janela que nos interessa), um regex literal
  // (/^data:image\//i) cujo `\/` seguido do `/` de fechamento confunde o
  // contador ingênuo de chaves de extractBlock com um início de comentário
  // `//` — faz a extração da função inteira parar cedo demais (bug do
  // utilitário do teste, não do index.html). Em vez de arriscar mexer num
  // utilitário compartilhado por dezenas de outros testes, isolamos a janela
  // certa por dois marcadores únicos e comparamos a ORDEM diretamente na
  // fonte — suficiente pra garantir estaticamente o que este teste protege.
  const startMarker = "document.getElementById('f-save').onclick = async ()=>";
  const endMarker = 'writeShardedStateSerialized(6000)';
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, 'handler de salvar do editor não encontrado');
  const end = html.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'ponto de referência (write real do Salvar) não encontrado após o handler');
  assert.ok(end - start < 15000, 'os marcadores precisam estar próximos (mesma função) — distância suspeita indica handler mudou de lugar');
  const window = html.slice(start, end);
  const dirtyIdx = window.indexOf('await markSyncDirty();');
  const reconIdx = window.indexOf("reconcileBeforePush('editor-save')");
  assert.notEqual(dirtyIdx, -1, 'markSyncDirty() precisa estar presente no Salvar do editor');
  assert.notEqual(reconIdx, -1, "reconcileBeforePush('editor-save') precisa continuar presente");
  assert.ok(dirtyIdx < reconIdx, 'markSyncDirty() precisa rodar ANTES da tentativa de reconcile/push — senão uma falha de rede deixa a edição local com syncDirty=false');
});
