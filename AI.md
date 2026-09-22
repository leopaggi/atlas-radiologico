# AI.md — instruções para assistentes de IA (Claude, DeepSeek, ChatGPT, etc.)

Este arquivo existe porque esse projeto já foi mexido por mais de uma IA,
sem contexto uma da outra, e isso já causou regressões reais (bugs já
corrigidos voltando, porque uma IA reescreveu do zero sem saber do
histórico). Leia isto ANTES de propor ou aplicar qualquer mudança.

## Regra de ouro

**Antes de reescrever qualquer trecho de lógica, procure primeiro se esse
comportamento já existe de propósito.** Muita coisa aqui parece
"estranha" ou "redundante" à primeira vista, mas corrige um bug real que
já causou perda de dados. Se não tiver certeza, pergunte antes de mudar.

## Formato do arquivo: por quê é um único `index.html`

Decisão deliberada, não falta de organização. Já foi tentado separar em
`index.html` + `app.js` + `seed-data.js` + `styles.css` (Fase 1 de uma
auditoria clean code), e funcionou — mas o dono do projeto prefere manter
um arquivo só, porque é o fluxo que ele já usa há tempo (edita/sobe um
arquivo por vez no GitHub, sem gerenciar múltiplos arquivos). **Não
proponha voltar a separar sem que o usuário peça.**

Consequência prática: o arquivo passou de 2 MB, e o **editor web do
GitHub não abre mais pra edição direta**. Qualquer atualização precisa ir
por upload (Add file → Upload files → substituir), não por "editar e
colar".

## Armazenamento local: IndexedDB, não localStorage

**Nunca reintroduza `localStorage.setItem/getItem` direto neste projeto.**
Existe uma camada `storage.get/set/delete/list` (baseada em IndexedDB,
banco `atlas_radiologico_idb`) que substitui completamente o uso de
localStorage puro.

Por quê: `localStorage` tem uma cota fixa (~5 MB) **compartilhada por todo
o domínio** `leopaggi.github.io` — ou seja, dividida entre este app e
qualquer outro projeto do mesmo usuário hospedado no mesmo GitHub Pages
(ex: um app de controle de tomografia). Isso já causou
`QuotaExceededError` real em produção. IndexedDB tem cota muito maior e
banco próprio por app, sem essa colisão.

Se migrar OUTRO projeto do mesmo domínio pra IndexedDB, **filtre a
migração pelas chaves que pertencem àquele app especificamente** — uma
versão inicial dessa migração aqui pegava *todas* as chaves do
`localStorage` sem filtro, e "roubou" a flag de migração de outro projeto
por engano. Corrigido, mas fique atento ao replicar o padrão.

## Detecção de duplicatas: por regra, não por lista fixa

`SUPPRESSED_DUPLICATE_IDS_V172` não é mais uma lista estática editada à
mão. Ele usa somente `computeDuplicateSeedIds(SEED)`, que agrupa por
`s + site + name` e mantém o registro de maior ID como "keeper".

`LEGACY_SUPPRESSED_DUPLICATE_IDS` permanece apenas como histórico auditado,
sem alimentar o filtro ativo. O boot renumera o `SEED` por posição; por isso,
os 70 números antigos passaram a colidir com IDs legítimos e causavam
`loadData()` a reduzir 1.213 registros persistidos para 1.143 após F5.

**Nunca volte a resolver duplicata só editando essa lista à mão.** Se
aparecer uma duplicata nova, o problema está em como os dados foram
inseridos (ex: um script de importação rodou duas vezes), não na lista de
supressão.

## O mecanismo de "recovery automático" antigo — NUNCA reative

Existiu uma rotina (`hasBrokenMigrationArtifacts` → `recoverCanonicalBaseV154`)
que restaurava sozinha uma "base canônica" a partir do `SEED` hardcoded,
disparada automaticamente em qualquer carregamento se detectasse
"inconsistência". Essa rotina foi a causa raiz de duplicatas voltando
sozinhas mesmo depois de limpar o Firebase e o localStorage manualmente —
ela reidratava fantasmas direto do `SEED` do código-fonte.

A flag `atlas:recoveryVersion` / `RECOVERY_VERSION` ainda existe no código
por compatibilidade, mas a rotina automática que ela disparava foi
neutralizada (a lista de supressão agora cobre os casos que a acionavam).
**Não reative nem recrie um mecanismo parecido** (algo que reescreve dados
em massa sozinho, sem o usuário pedir, ao carregar a página). Qualquer
correção em massa deve ser manual, acionada pelo usuário (ex: a tela de
auditoria), nunca automática.

## Testes obrigatórios antes de mexer em dados ou deduplicação

```
node tests/duplicate-detection.test.js
```

Se você adicionar lesões novas ao `SEED`, rode isso depois pra confirmar
que não introduziu duplicata nenhuma.

## Antes de qualquer correção em massa nos dados

O estado que uma IA tem "em mãos" (de uma sessão anterior, um arquivo já
processado, etc.) pode estar desatualizado — o usuário edita o app
diretamente pela interface o tempo todo. **Antes de aplicar qualquer
correção em lote no SEED, peça um backup fresco** (o próprio app tem
função de exportar backup em JSON) em vez de assumir que uma cópia local
de sessões anteriores ainda reflete o estado atual. Já aconteceu de uma
cópia local ter 1283 lesões enquanto o backup real do usuário tinha 1213
— divergência grande o suficiente pra invalidar qualquer correção feita
em cima dos dados errados.

## Ao adicionar lesões novas ao SEED

- Confira duplicata de `s + site + name` contra o que já existe antes de
  adicionar (não confie só na detecção automática rodar depois — ela
  detecta, mas prevenir é mais barato que corrigir).
- Sem imagem ainda? Deixe `img: ""` e não preencha `images` — a lesão
  aparece automaticamente na tag "🚫 sem imagens".
- IDs seguem o padrão `seed_<N>`, `N` sequencial a partir do maior
  existente.

## Campo `classification` — sistemas de classificação radiológica

Algumas lesões têm um campo `classification` (ex: `"BIRADS"`, `"LIRADS"`,
`"PIRADS"`, `"TIRADS"`, `"CRADS"`, `"ORADS"`, `"VIRADS"`, `"NODERADS"`,
`"CADRADS"`, `"LUNGRADS"`, `"BOSNIAK"`, `"ASPECTS"`, `"AAST_KIDNEY"`,
`"AAST_LIVER"`, `"AAST_SPLEEN"`), referenciando sistemas padronizados de
classificação/relatório em radiologia. **Cada sistema é específico de um
órgão/contexto** — não é um campo genérico de "gravidade":

| Sistema | Órgão/contexto |
|---|---|
| BI-RADS | Mama |
| LI-RADS | Fígado (nódulo hepático) |
| PI-RADS | Próstata |
| TI-RADS | Tireoide |
| C-RADS | Cólon (colonografia por TC) |
| O-RADS | Ovário |
| VI-RADS | Bexiga |
| Node-RADS | Linfonodo |
| CAD-RADS | Artéria coronária |
| Lung-RADS | Nódulo pulmonar (rastreio) |
| Bosniak | Cisto renal |
| ASPECTS | AVC isquêmico (score de imagem) |
| AAST_KIDNEY/LIVER/SPLEEN | Grau de trauma do respectivo órgão |

**Já apareceram 30 casos de classificação atribuída errada** (ex:
"Ventriculomegalia fetal" com C-RADS, "Lesão meniscal" com BI-RADS,
"Cólica renal" com ASPECTS) — provavelmente de um preenchimento em lote
sem checar a correspondência anatômica. Corrigidos em 2026-09-18. **Ao
adicionar ou editar esse campo, confirme que o sistema corresponde ao
órgão/site da lesão** — uma lesão de rim nunca deveria ter BI-RADS, por
exemplo. Se a lesão não se enquadra em nenhum sistema padronizado, o
campo deve ficar ausente (não force um valor só pra preencher).

## Firebase

Projeto: `atlas-radiologico`. Firestore é a fonte da verdade; o
localStorage/IndexedDB é cache local que se reconcilia com a nuvem no
carregamento (`syncFromFirebase`).

## Ao publicar imagens

Imagens ficam no Cloudinary (`res.cloudinary.com/soegtip6/.../atlas-radiologico/`).
Se o usuário apagar uma imagem lá diretamente (fora do app), ela vira um
404 no console — a referência precisa ser removida do `SEED` manualmente
(já aconteceu mais de uma vez; procure pelos IDs do erro 404 no console e
remova do campo `images`/`img` da lesão correspondente).

## Mantendo este arquivo atualizado

**Toda vez que você fizer uma mudança relevante na lógica, atualize este
arquivo e o `README.md` no mesmo commit/entrega.** Isso vale tanto para
você (a IA lendo isso agora) quanto pra qualquer IA que trabalhar aqui
depois. O objetivo é nunca mais alguém (humano ou IA) refazer do zero algo
que já foi resolvido, por falta de contexto.

## Atualização 2026-09-21 — importador externo Radiopaedia (MVP, metadata-only)

- Userscript separado em `tools/radiopaedia-to-atlas.user.js` (NÃO faz parte
  do bundle; não separar o resto do app por causa dele).
- Receptor no fim do `index.html`, de propósito: `tests/critical-flows.test.js`
  usa âncoras de linha exatas (6061/6051/8603/11592) — inserções antes delas
  quebram o teste. O gancho pós-boot envolve `loadData` por fora
  (`_loadDataSemImport`), sem editar o corpo original.
- Regras do MVP (não afrouxar sem pedido): nenhuma gravação automática
  (nenhum caminho de import chama `saveData`/`pushToFirebaseNow` nem muta
  `DATA`); similaridade só em faixas na UI (nunca "score %"); todo conteúdo
  externo passa por `esc()`; fragmento sempre limpo com `history.replaceState`.
- Etapa 2 (NÃO implementar ainda): imagens, scraping em massa, IA, tradução,
  Cloudinary, classificação automática.
- Testes: `tests/external-import.test.js` (67 PASS: casos A–G
  anti-falso-positivo + 20 itens v2 de PT/tags/descrição/revisão/segurança +
  6 da instrução de IA + 8 anti-duplicata + 12 da consolidação mesmo-id) e
  `tests/quiz-image-desc.test.js` (8 PASS). Suíte total: 628 PASS,
  5 TODO + 1 FAIL histórico conhecido em `duplicate-detection.test.js`.
- Consolidação mesmo-id: `consolidateSameIdDuplicates(id, {expectedPublicIds})`
  SÓ via console, com snapshot + aborts; remoção por índice, nunca filter por
  id; SRS/revisões intocados; restauração sempre manual. Draft do importador
  já encaminha a referência aos links (persiste só no Salvar).
- Salvar do formulário tem trava `formSaving` + bloqueio
  `findExactLesionMatch()` em lesão nova; nunca criar silenciosamente;
  forçar duplicata exige dupla confirmação.
- v2: nunca traduzir à força (original preservado); tags só de vocabulário
  seguro; `aiReview` é só marcação local — sem fetch, sem LLM, sem
  Cloudinary no importador.

## Atualização 2026-09-21 — produtividade de imagens (assignedAt + dashboard)

- `assignedAt` (ISO) nasce SÓ no Salvar/Concluído, para imagens novas;
  pending/cancel/falha nunca geram; históricas nunca ganham retroativo.
- Mesma imagem (mesmo `stableImageKeyV208` não-vazio) conta 1; dia LOCAL.
- Sync (pull/push/merge) nunca gera; no `unionEntryImages` fica o mais
  antigo válido. Ownership/dedup intactos.
- Dashboard: KPI + gráfico semanal + totais, com refresh ao vivo nos saves.
- Âncoras do `critical-flows.test.js`: 6056/6066/8608/11602 (atualizar se
  inserir linhas antes delas; CSS do grid deve ser editado in-place).
- Testes: `tests/image-productivity.test.js` (20 PASS). Suíte: 602 PASS,
  5 TODO + 1 FAIL histórico em `duplicate-detection.test.js`.

## Atualização 2026-09-21 — descrição geral do quadro de imagens

- Campo canônico de descrição de imagem é `label`; nunca criar
  `collageDescription`/`boardDescription`.
- Descrição do quadro é METADADO (vira o `label` no Inserir); o canvas só
  recebe as sequências individuais, como antes. Composição, resolução,
  layouts, Cloudinary e sync intocados.
- Assinatura `openCollageBuilder(..., existingLabel?)`; âncora
  importHandler: 11651. Testes: `tests/collage-desc.test.js` (15 PASS).
  Suíte: 625 PASS, 5 TODO + 1 FAIL histórico em `duplicate-detection.test.js`.

## Atualização 2026-09-21 — contadores de imagem na sidebar

- Linha única `TOTAL · 🖼IMAGENS · X/Y` por seção/site, zeros visíveis,
  tooltip nativo; nome com ellipsis.
- `sectionStats`/`siteStats`/`buildSidebarImageStats` puros, mesmo conjunto
  do `structure()`; estoque atual, sem `assignedAt`; sem listeners novos;
  refresh pelo `renderAll()` existente (Quiz incluído).
- Âncoras do `critical-flows.test.js`: 6063/6073/8615/11670 (CSS novo e
  renderTree antes do handler). Testes: `tests/sidebar-image-stats.test.js`
  (20 PASS).   Suíte: 663 PASS, 5 TODO + 1 FAIL histórico.

## Atualização 2026-09-21 — sidebar só cobertura (X/Y)

- Linha mostra só `38/243` (`cov-num` âmbar + `cov-den` discreto); cálculo
  (`sectionStats`/`siteStats`) reutilizado, sem total/absoluto/🖼.
- Testes: `tests/sidebar-image-stats.test.js` (22 PASS). Suíte: 665 PASS,
  5 TODO + 1 FAIL histórico.

## Atualização 2026-09-21 — bootstrap seguro em dispositivo novo (CAUSA do "Atlas zerado em outro computador")

**✓ VALIDADO em teste manual pelo usuário (21/09/2026) — considerado
BASELINE ESTÁVEL do projeto, junto com as Alterações 056 e 057. Ainda sem
commit/publicação (aguardando pedido explícito).**

**Causa raiz encontrada e corrigida.** Um dispositivo/navegador que ainda não
tinha o catálogo salvo no IndexedDB local (`STORAGE_KEY` ausente — sempre
verdadeiro na primeira abertura num computador novo) fazia `loadData()`
entrar no `catch` e usar o `SEED` cru (sem imagens/SRS/progresso) como
`DATA`. Mais adiante, no MESMO carregamento, havia uma chamada incondicional
a `pushToFirebaseNow()` que enviava esse catálogo vazio para o Firestore.
Como `writeShardedState()` faz `.set()` (substituição total, não mescla),
isso sobrescrevia o estado real que já existia na nuvem — foi exatamente
isso que zerou o Atlas ao abrir num segundo computador do hospital
(2026-09-21). **Não reintroduza um push incondicional em `loadData()` sem
antes conferir se o dispositivo já passou pelo bootstrap** (ver abaixo).

**Antes de aplicar a correção**, foi confirmado com o usuário que o
computador principal ainda tinha o IndexedDB local intacto (nunca é
sobrescrito pela nuvem — o pull automático no boot já estava desativado
desde a Alteração 008/2026-09-19) e que a auditoria mostrou a nuvem íntegra
(1213/1213 lesões, 65/65 registros com imagem, 89/89 imagens, 11/11
altPlacements, 49/49 SRS). Não foi necessária recuperação manual.

### O que foi criado

- `deviceBootstrapPending` (flag global): enquanto `true`,
  `writeShardedState()` — o ÚNICO ponto que realmente escreve no Firestore —
  recusa qualquer envio (automático, debounced ou pelos botões explícitos
  "☁ sincronizar este dispositivo"/"🔀 mesclar imagens"), devolvendo `false`
  (o mesmo sinal já usado para "pedaço grande demais"). Guardar no
  `writeShardedState()` em vez de em cada chamador cobre TODOS os caminhos
  de push de uma vez, incluindo os futuros.
- `loadData()`: o `catch` de dispositivo novo não persiste/envia mais nada
  sozinho — só marca `isNewLocalDevice`/`deviceBootstrapPending = true` e usa
  o `SEED` como base EM MEMÓRIA. Depois de REVIEW/SRS/SESSIONLOG/
  LESION_REVISIONS carregados, e ANTES de qualquer limpeza de duplicatas,
  snapshot, push ou `renderAll()`, chama `runNewDeviceBootstrapFlow()`. Um
  dispositivo que JÁ tinha catálogo local não passa por nenhum destes
  caminhos — comportamento idêntico ao de antes.
- `checkCloudForBootstrapV1()`: consulta a nuvem SERVER-ONLY, reaproveitando
  `readCloudAuditFromServer()` (a mesma função da verificação pós-envio).
  Só considera "vazio" o caso em que NENHUM dispositivo jamais sincronizou o
  projeto (nenhum documento em `atlas_state/main`); offline/erro nunca vira
  "vazio" — vira um estado próprio que bloqueia o push e oferece "tentar de
  novo".
- `openNewDeviceBootstrapModal()`: modal único, sem clique fora/ESC (força
  decisão explícita). Estados: nuvem com dados (tabela + `⬇ Carregar meus
  dados da nuvem` ou `usar este dispositivo vazio mesmo assim`, com
  `confirm()` explicando a sobrescrita futura), nuvem nunca inicializada
  (resolve sozinho) ou falha de verificação (retry + a mesma opção de
  continuar vazio, avisado).
- `applyNewDeviceBootstrapChoice(choice)`: **reaproveita 100%**
  `syncFromFirebase()` — o mesmo merge não destrutivo de "⬇ atualizar deste
  backup/nuvem" — só no ramo `'load'`. Nenhuma lógica de reconciliação
  paralela foi criada. Isso já garante, sem código novo, que o bootstrap
  preserva imagens (união aditiva via `unionEntryImages`), `assignedAt` (o
  mais antigo válido vence), SRS mais novo, REVIEW/SESSIONLOG (máximo
  preservado) e ownership (conflito automático fica bloqueado e registrado).
- `DEVICE_INITIALIZED_KEY` (`atlas:v1:deviceInitialized`, `localStorage`,
  mesmo padrão de `atlas:v1:lastSidebarScope`): marcador estritamente LOCAL,
  nunca sincronizado, nunca no backup. Só evita reabrir a pergunta à toa —
  quem decide se o dispositivo é novo continua sendo a ausência do próprio
  catálogo (`STORAGE_KEY`), nunca esse marcador sozinho.
- Guardas com mensagem específica ("Este dispositivo ainda não foi
  inicializado com os dados da nuvem.") também em `syncThisDeviceToCloud()`
  e `mergeThisDeviceImagesToCloud()`, cobrindo o caso raro de alguém clicar
  nesses botões antes do modal aparecer.

Testes: `tests/device-bootstrap.test.js` (novo, 32 PASS) e
`tests/critical-flows.test.js` (21 PASS). Suíte: 698 PASS, 5 TODO + 1 FAIL
histórico. (Âncoras do `critical-flows` deslocadas de novo pela Alteração
056 logo abaixo — ver valores atuais lá: 6236/6246/8788/11868.)

## Atualização 2026-09-21 — descrição persistente de imagens e quadros (Alteração 056)

**✓ VALIDADO em teste manual pelo usuário (21/09/2026) — considerado
BASELINE ESTÁVEL do projeto, junto com as Alterações 055 e 057. Ainda sem
commit/publicação (aguardando pedido explícito).**

`label` continua o único campo canônico de descrição de imagem (nenhum
campo novo — `description`/`collageDescription`/`boardDescription`
continuam inexistentes como propriedade de imagem). O que faltava era
consistência: dois lugares onde `label` era escrito ainda usavam `<input>`
de uma linha (galeria do editor `openForm` e a caixa de edição do modal
"🖼 Adicionar imagem" do Quiz) — só o construtor de quadro já usava
`<textarea>`. Os dois viraram `<textarea class="img-gallery-label" rows="3">`
(sem `maxlength`, `resize:vertical`, `min-height` maior), e o construtor de
quadro passou de `rows="2"` pra `rows="3"`. Mesmo campo, mesma lógica de
salvar/chips de sequência — sem duplicar nada.

O gap real era o **lightbox**: `openImageLightbox(src)` não sabia nada sobre
descrição, em nenhum dos 5 lugares onde é chamado. Agora é
`openImageLightbox(src, description)` — sem descrição, comportamento
idêntico ao de sempre; com descrição, aparece **abaixo** da imagem (nunca
sobreposta), num bloco próprio (`.lightbox-content` em coluna +
`.lightbox-desc`, com scroll interno se o texto for longo), escapada com
`esc()`, e clicar no texto não fecha o lightbox (`stopPropagation`).
Detalhe da lesão e as duas galerias de edição (editor e modal do Quiz)
passam a descrição sempre — não há "spoiler" nesses contextos. **O Quiz
durante a pergunta nunca passa descrição** (`st.answered ? cur.label : ''`
— o mesmo gate que já protegia o bloco de texto acima da imagem,
`quizImageDescHtml`). A ferramenta técnica de auditoria de vínculo de
imagens continua exatamente como estava, sem descrição — fora do pedido.

Detalhe da lesão também trocou `img.label.replace(/</g,...)` (só escapava
`<`) por `esc()` (escapa `&` também) e `.detail-img-label` ganhou estilo de
texto corrido (esquerda, `white-space:pre-wrap`) em vez de monoespaçado
centralizado.

**Persistência:** nenhuma mudança de lógica foi necessária — `label` já
viajava por `spread` (`{...x}`) em todo o caminho de salvar/upload
Cloudinary/sync/backup, então texto longo e com quebra de linha já
sobrevivia a esse caminho inteiro. **Limitação preexistente, apenas
registrada nesta entrega (não alterada):** o merge aditivo
(`unionEntryImages`/`mergeEntryNonDestructive`) não reconcilia campo a
campo — se a MESMA imagem tiver `label` diferente em dois dispositivos ao
sincronizar, o merge mantém a versão do lado processado como base. Isso já
valia pra qualquer campo de imagem antes desta entrega.

**Alteração 055 (bootstrap seguro em dispositivo novo) não foi tocada** —
confirmado por `git diff` (nenhuma remoção/edição nos identificadores
daquela entrega) e por `tests/device-bootstrap.test.js` continuando 32
PASS sem qualquer alteração no arquivo de teste.

Testes: `tests/image-description.test.js` (novo, 21 PASS) e
`tests/quiz-images.test.js` (102 PASS, 2 testes ajustados + 1 novo pra nova
assinatura do lightbox e seu gate no Quiz). `tests/critical-flows.test.js`
com as âncoras atuais: 6236/6246/8788/11868. Suíte: 720 PASS, 5 TODO + 1
FAIL histórico em `duplicate-detection.test.js`. (Âncoras deslocadas de
novo pela Alteração 057 logo abaixo — ver valores atuais lá.)

## Atualização 2026-09-21 — correção pontual de ownership: Abscesso cerebral / Oligodendroglioma (Alteração 059)

Auditoria forense (comparando o `SEED` congelado em 18/09/2026 no git,
ANTES de qualquer reconciliação ao vivo, contra um backup real exportado
do app em 20/09/2026) confirmou que 2 imagens
(`atlas-radiologico/o0ykul2z1qp00pp6yxel`,
`atlas-radiologico/n5oyigvmkpb8zpqykd3g`) tiveram o próprio `lesionName`
reescrito de "Abscesso cerebral" para "Oligodendroglioma". **Causa raiz:**
o antigo sincronismo canônico por id em `loadData()` (hoje inerte,
`CANONICAL_REFRESH_DISABLED_V250=true`) casou um registro persistido com o
SEED só pelo `id` posicional — sem checar identidade semântica — no
instante em que o SEED foi reordenado/compactado (70 duplicatas removidas
em 18/09/2026 11:46, commit `c27fe256`; o `seed_11` passou a apontar para
outra lesão). **Isso é o MESMO mecanismo já documentado para o bug do
C-RADS em lesões fetais** (ver §3.1 do `CONTEXTO_MESTRE`) — só que
manifestando via `images` em vez de `classification`. Outras 63
ocorrências no acervo têm `lesionId` desatualizado mas `lesionName` já
compatível com a lesão que as contém (`LEGACY_ID_ONLY` — inofensivas, NÃO
tocadas).

**`fixAbscessoOligodendrogliomaOwnership20260921()`** (nova, só via
console, mesmo padrão de `consolidateSameIdDuplicates`): localiza
origem/destino por **identidade semântica** (`exactLesionIdentityKey`,
s+site+nome normalizado) — nunca por `seed_N`; confirma as 2 imagens pelo
`publicId` exato; snapshot obrigatório antes (aborta se falhar, ou se
qualquer pré-condição falhar); usa o guard manual já existente
(`assertManualImageOwnershipChange`/`IMAGE_OWNERSHIP_MANUAL`); reaproveita
`removeImageFromLesionData`/`addImageToLesionData` (sem lógica paralela);
persiste via `saveData()`. Preserva assetId/publicId/URL/label/source/
attribution/`assignedAt` (nunca carimba um novo — é correção histórica,
não produtividade nova); nunca chama upload/destroy no Cloudinary.
**✓ Executada pelo usuário no console do navegador contra o `DATA` real e
CONFIRMADA (21/09/2026):** `{ ok:true, reason:'2 imagem(ns) movida(s) de
"Oligodendroglioma" para "Abscesso cerebral"' }`, snapshot
`snap_mubyvs5t_x2jmnm`. Conferência visual manual aprovada.

**Proteção arquitetural:** o bloco de sincronismo canônico por id em
`loadData()` (continua desligado,
`CANONICAL_REFRESH_DISABLED_V250=true` — **não reativado**) ganhou uma
checagem de identidade semântica ANTES de copiar qualquer campo: se o
registro persistido já tem `s+site+name` preenchidos e não batem com o
canônico da mesma posição, o conflito é **registrado**
(`registerImageOwnershipConflict`, mesmo registro já usado por ownership de
imagens) e nada é alterado automaticamente. Protege contra recorrência do
mesmo bug mesmo que esse bloco seja reativado por engano no futuro.

Testes: `tests/ownership-fix-20260921.test.js` (novo, **10 PASS**, cobrindo
localização semântica, ausência de duplicação, preservação de metadados/
`assignedAt`, ausência de chamadas Cloudinary, SRS/revisões intactos,
`LEGACY_ID_ONLY` preservado, e o guard de identidade semântica bloqueando
uma reativação futura do sincronismo canônico). `tests/critical-flows.test.js`
com as âncoras atuais: `loadData` continua 8799; `importHandler` foi para
11900. Suíte: 740 PASS, 5 TODO + 1 FAIL histórico.

## Atualização 2026-09-21 — ajuste visual das descrições (Alteração 057)

**✓ VALIDADO em teste manual pelo usuário (21/09/2026) — "tudo funcionando
corretamente e a apresentação ficou excelente". Considerado BASELINE
ESTÁVEL do projeto, junto com as Alterações 055 e 056. Ainda sem
commit/publicação (aguardando pedido explícito).**

Depois do teste real da Alteração 056, o usuário confirmou que a LÓGICA
está correta (gate do Quiz, persistência, sync) e pediu só ajustes de
apresentação — nada de lógica foi tocado aqui.

- **Detalhe da lesão:** `.detail-img-label` ganhou clamp visual de 2 linhas
  (`-webkit-line-clamp:2`) com "..." nativo; clique alterna a classe
  `.expanded` (remove o clamp). É **só CSS + toggle de classe** — o texto
  completo (`esc(img.label)`) sempre esteve no DOM; nada em `img.label`/
  `DATA` é lido, escrito ou truncado por esse mecanismo.
- **Lightbox:** a causa do texto quebrar demais era `.lightbox-content` não
  ter largura própria — herdava o tamanho da `<img>` (que podia ser
  estreita/retrato). Agora `.lightbox-content{width:min(1200px,94vw)}` dá à
  coluna uma largura que escala com a TELA, independente da imagem;
  `.lightbox-desc` perdeu o teto de `720px`, e `padding`/`line-height`
  ficaram mais compactos (`8px 18px`/`1.4`, eram `12px 14px`/`1.55`) — sem
  reduzir a fonte. `.lightbox-img` (tamanho/posição/prioridade visual) não
  mudou.
- **Quiz pós-resposta (`quizImageDescHtml`):** mesmo ajuste de respiro
  (padding/line-height menores, `text-align:left` explícito,
  `white-space:pre-wrap` pra consistência com detalhe/lightbox) — **sem**
  nenhum truncamento; a descrição continua aparecendo inteira depois de
  responder, exatamente como a Alteração 056 deixou.

**Alteração 055 confirmada intacta de novo** (mesmo processo de
verificação: `git diff` sem remoção/edição nos identificadores do
bootstrap; `tests/device-bootstrap.test.js` 32 PASS sem alteração).

Testes: `tests/image-description.test.js` (**31 PASS**, +10 novos: clamp
via CSS/texto íntegro no DOM/toggle sem mutar dado/regressão do gate no
Quiz e no lightbox/largura independente da imagem/padding compacto sem
reduzir fonte). `tests/critical-flows.test.js` com as âncoras atuais:
6247/6257/8799/11884. Suíte: 730 PASS, 5 TODO + 1 FAIL histórico.

## Atualização 2026-09-18 — auditoria de `altPlacements`

- Regra obrigatória de manutenção: **toda alteração do `index.html` deve ser entregue junto com `AI.md` e `README.md` atualizados**.
- Foi usado backup fresco exportado em 2026-09-18 para auditar associações secundárias (`altPlacements`).
- Foram revisados 86 registros com `altPlacements`: 18 associações anatômicas secundárias coerentes foram preservadas e 68 associações espúrias foram marcadas para remoção.
- A correção não altera `s` nem `site` (localização anatômica principal), nem imagens, tags, descrições, revisão/SRS ou IDs.
- O `index.html` corrigido contém migração pontual pós-Firebase para remover apenas os `altPlacements` auditados como errados, evitando que o estado remoto os reintroduza.
- Arquivo correspondente desta entrega: `index-atlas-altplacements-corrigido-20260918.html`.

### Revisão 2 da correção de `altPlacements` — 2026-09-18

A primeira implementação usava uma chave de migração “já executado”. Isso era insuficiente: se o Firebase ainda contivesse um `altPlacement` espúrio, uma sincronização posterior poderia reintroduzi-lo e a chave impediria nova limpeza. A correção agora é **idempotente e reaplicada após toda leitura inicial do Firebase**, exclusivamente para a lista auditada de IDs. Não há recovery genérico nem reescrita de outros campos. Se a gravação remota falhar, a interface da sessão continua saneada e a correção é reaplicada na próxima abertura.

Regra de entrega permanece obrigatória: toda alteração do `index.html` deve acompanhar `AI.md` e `README.md` atualizados.

## Atualização 2026-09-18 — auditoria global de `classification`

Após identificação de Apendicite aguda com `AAST_LIVER`, foi auditado o campo `classification` das 1.213 lesões usando o backup fresco. Havia 117 registros classificados. A auditoria conservadora removeu **54 atribuições claramente incompatíveis com a anatomia/indicação** e preservou **63 atribuições compatíveis**.

A correção atua somente no campo `classification` dos IDs auditados, tanto no `SEED` quanto após a leitura inicial do Firebase. É idempotente para impedir reintrodução por estado remoto antigo. Não altera `s`, `site`, imagens, tags, `notes`, revisão/SRS ou IDs.

Compatibilidade usada: BI-RADS→mama; LI-RADS→fígado; Bosniak→rim; O-RADS→ovário/adnexo; PI-RADS→próstata; VI-RADS→bexiga; TI-RADS→tireoide; Lung-RADS→nódulo pulmonar; C-RADS→cólon/CT colonografia; CAD-RADS→coronárias; ASPECTS→AVC/isquemia cerebral; AAST liver/spleen/kidney→trauma do órgão correspondente; Node-RADS→linfonodos.

## Atualização 2026-09-18 — Quiz & Progresso visual

Implementado o dashboard visual aprovado para Quiz/Progresso sem refatorar a arquitetura do Atlas. O botão Quiz passa a abrir a central de estudo com dados reais: sequência de estudo, meta diária de 15 casos, acurácia dos últimos 14 dias, revisões SRS pendentes, evolução temporal, estado do acervo e domínio por seção.

Foram adicionados três atalhos: Sessão de hoje (15 casos priorizando SRS vencido, casos difíceis, novos e depois estáveis), Sessão rápida (5) e Sessão CBR (20 casos distribuídos entre seções), além da sessão personalizada já existente.

A autoavaliação binária “Acertei/Não sabia” foi substituída por quatro graus: Fácil, Média, Difícil e Não sei. O SRS usa intervalos diferentes para cada grau. O formato legado `right/wrong` do histórico foi preservado para compatibilidade: Fácil/Média contam no grupo de reconhecimento satisfatório; Difícil/Não sei entram no grupo a reforçar. `lastGrade` é salvo no SRS para priorização futura.

Não foram alterados dados clínicos das lesões, imagens, IDs, `s`, `site`, tags ou classificações. A mudança é de interface e lógica de estudo/progresso.

## Atualização 2026-09-18 — Quiz & Progresso v2 integrado

A referência visual aprovada passa a ser tratada como especificação. O cabeçalho exibe um único acesso visível `Quiz & Progresso`; o botão legado `Quiz` fica oculto para preservar compatibilidade de código.

O modo de estudo foi integrado à mesma identidade visual e agora usa múltipla escolha com quatro diagnósticos. Os distratores são escolhidos prioritariamente na mesma subseção anatômica e, depois, na mesma seção, evitando alternativas aleatórias quando há opções próximas no acervo. A correção objetiva (acertou/errou) é registrada separadamente da autoavaliação de segurança (Fácil/Média/Difícil/Não sei), que continua controlando o SRS.

Quando a lesão possui imagem, o caso é visual. Quando não possui imagem, o sistema cria um caso teórico usando exclusivamente as tags já registradas naquela própria lesão; não inventa achados. Após responder, mostra diagnóstico, tags, notas e referência existentes.

O dashboard recebeu cores vivas específicas para sequência, meta, acurácia, pendências e barras de domínio por área, aproximando a implementação do mockup aprovado. Nenhum dado clínico do SEED foi modificado.

## Atualização 2026-09-18 — Quiz & Progresso v3: sessão realmente integrada

Corrigidos dois problemas observados em uso real. Cada questão agora grava imediatamente `reviewed`, `right/wrong` e o grau de confiança no `SESSIONLOG`; encerrar uma sessão parcial não perde o progresso do dia. O dashboard usa somente SRS com `due <= agora` para “Revisões pendentes”, excluindo lesões nunca estudadas.

Sessão de Hoje, Rápida, CBR e treino por área agora permanecem dentro do mesmo overlay `Quiz & Progresso`: o conteúdo do dashboard é substituído pelo Modo Estudo e “voltar ao progresso” reconstrói o dashboard já com os números atualizados. Não há necessidade de concluir a fila para contabilizar as questões respondidas.

Nenhum dado clínico do acervo foi alterado.

## Hotfix 2026-09-18 — inicialização do Modo Estudo integrado

Corrigido erro `Cannot set properties of null (setting 'innerHTML')` ao iniciar uma sessão pelo dashboard. A causa era uma ponte temporária que interceptava `document.body.appendChild`, chamava o renderer legado `renderQuizCard()` fora do DOM e depois tentava transplantar seu conteúdo. O renderer legado procurava elementos por ID no documento e recebia `null`.

`startQuizInsideDashboard()` agora não chama mais `renderQuizCard()` nem cria/captura um segundo overlay. Ele inicializa a fila e chama diretamente `renderQuizCardIntegrated()` sobre o modal `Quiz & Progresso` já montado. Isso preserva a arquitetura de tela única aprovada.

## 2026-09-18 — Quiz & Progresso v4: overlay única de verdade + paleta viva

### Causa raiz do "abre 2 telas"

As correções anteriores atacaram sintomas. A causa real eram **três** pontos
que criavam/destruíam overlays independentes:

1. `closeOverlay()` removia só `document.querySelector('.overlay')` — **a
   primeira**. Se duas ficassem empilhadas, uma sobrava visível por baixo.
2. `openProgressDashboard()` fazia `createElement` + `document.body
   .appendChild(ov)` **toda vez** que era chamado, criando uma overlay nova
   a cada retorno ao dashboard.
3. `openProgressDashboardReplacing()` removia a overlay atual e chamava
   `openProgressDashboard()`, que criava outra — destrói-e-recria em vez de
   re-renderizar.
4. "Personalizada" chamava `closeOverlay(); openQuizSetup();`, e
   `openQuizSetup()` monta a **própria** overlay separada.

### Solução: uma overlay persistente, views trocadas por dentro

Foi introduzida `getStudyOverlay()`, que retorna sempre a **mesma** overlay
(`#study-overlay`), criando-a só na primeira vez e descartando qualquer
outra overlay que esteja no DOM. Todas as views do Quiz & Progresso
(dashboard, Modo Estudo, sessão personalizada) apenas **trocam o
`innerHTML`** dessa overlay — nada de `appendChild`/`remove` entre telas.

- `closeOverlay()` passou a remover **todas** as overlays (`querySelectorAll`).
- `openProgressDashboard()` usa `getStudyOverlay()` e não faz mais
  `appendChild`.
- `openProgressDashboardReplacing()` só chama `openProgressDashboard()`
  (que reusa a overlay) — não remove nada.
- Criada `renderCustomSetupInside()`: a sessão personalizada agora é
  renderizada dentro da overlay única, substituindo o uso de
  `openQuizSetup()` nesse fluxo. `openQuizSetup()` continua no arquivo
  (não foi removida) mas não é mais acionada pelo dashboard.

**Regra pra quem mexer nisso depois:** qualquer tela nova do Quiz &
Progresso deve renderizar via `getStudyOverlay()` e trocar `innerHTML`.
Nunca use `document.body.appendChild` para uma view do fluxo de estudo —
é exatamente isso que reintroduz o bug das duas telas.

### Paleta viva

O visual sóbrio do Atlas foi mantido no resto do app. As cores vivas do
mockup são uma **camada aditiva** no fim do `<style>`, com escopo em
`.study-dashboard` (azul #3B82F6, verde #22C55E, âmbar #F59E0B, roxo
#A855F7, ciano, rosa). Componentes cobertos: KPIs do topo (cada um com cor
e ícone próprios), botão principal em gradiente azul, barras de domínio
por área multicoloridas, alternativas de múltipla escolha com verde/vermelho
vivos, barra de progresso da sessão e botões de autoavaliação.

`REVIEW_COLORS` também foi atualizado para tons vivos
(`{0:"#64748B",1:"#FACC15",2:"#22C55E"}`), o que reflete no donut "Estado
do acervo" e nos chips de revisão.

**Importante:** `startQuizInsideDashboard()` mantém a classe
`study-dashboard` no host ao entrar no Modo Estudo — é o que faz a paleta
viva valer também dentro da sessão. Não remova essa classe.

### Teste

`real_e2e_test.js` (usa jsdom) carrega o `index.html` **de verdade** — não
uma cópia reescrita das funções — stuba só Firebase/IndexedDB (o suficiente
pra não travar o boot) e clica nos botões reais do dashboard, simulando o
usuário: abrir Quiz & Progresso, iniciar sessão rápida, responder as 5
perguntas, ver a tela de resultado, voltar ao dashboard, abrir a sessão
Personalizada, configurar e começar, voltar de novo, fechar e reabrir.
Em todo instante conta `document.querySelectorAll('.overlay').length` e
falha se passar de 1. 31/31 passando.

(O antigo `test_single_screen.js` testava uma cópia das funções
`closeOverlay`/`getStudyOverlay` coladas no próprio arquivo de teste, fora
do contexto do app real — por isso passava mesmo quando o bug ainda existia
no `index.html` de verdade. Foi substituído pelo teste acima, que carrega o
arquivo real.)

### Correção 2026-09-18 — código morto que ainda causava a 2ª tela

Uma tentativa anterior de corrigir a "tela dupla" introduziu corretamente
`getStudyOverlay()` e migrou o dashboard novo pra usá-la, mas **deixou no
arquivo o fluxo antigo inteiro**, nunca removido:
`openQuizSetup()`, `startQuizSession()`, `renderQuizCard()`,
`renderQuizSummary()`, `startDailyStudy()`, `startQuickStudy()`,
`startCBRStudy()`. Todas essas funções criavam sua **própria** overlay via
`document.createElement('div')` + `document.body.appendChild(ov)`,
totalmente à parte de `getStudyOverlay()`.

Nenhum botão do dashboard atual chamava mais essas funções diretamente, mas
elas continuavam ativas e prontas pra disparar em qualquer edição futura
que tocasse nesse trecho por engano — exatamente o tipo de armadilha que
reproduz esse bug depois de "corrigido". Foram todas removidas.

De quebra, isso revelou uma lacuna real: `startQuizInsideDashboard()`
pulava direto da última pergunta da sessão pro dashboard, sem nunca mostrar
a tela de resumo (% de acerto, fáceis/médias/difíceis, "refazer erros").
Essa tela foi recriada como `renderQuizSummaryIntegrated()`, renderizada
dentro do mesmo host/overlay — sem `appendChild`, sem overlay nova.

`startQuizInsideDashboard()` também foi reforçada: antes localizava a
overlay ativa via `document.querySelector('.overlay .study-dashboard')`
(um seletor que dependia da tela já estar com a classe certa); agora chama
`getStudyOverlay()` diretamente, então nunca depende de estado prévio do
DOM pra achar a tela certa.

## Atualização 2026-09-18 — variedade da fila e métricas coerentes com o novo Quiz

`buildSmartStudyQueue(limit)` reserva pelo menos 60% da sessão para casos nunca estudados quando houver disponibilidade, impedindo que poucos casos `hard`/`again` monopolizem sessões sucessivas.

O `Domínio por área` não usa mais `REVIEW[id] === 2`, que só chegava ao estado “dominado” após intervalos SRS longos e por isso podia permanecer em 0% mesmo com questões respondidas. Agora usa a última autoavaliação SRS dos casos já estudados: `easy=100%`, `medium=70%`, `hard=35%`, `again=0%`, e exibe também `estudados/total`. Área ainda não estudada mostra `—`.

O card `Estado do acervo` foi alinhado aos quatro botões atuais do quiz: `Fácil / Média / Difícil / Não sei / Nunca estudadas`, usando `SRS[id].lastGrade`, em vez dos estados legados `Dominadas / Em aprendizado / Nunca estudadas`.

Nenhum dado clínico, imagem, classificação, `altPlacements`, ID ou lógica de sincronização foi alterado.

## Atualização 2026-09-18 — visual aprovado de “Domínio por área”

O bloco `Domínio por área` foi ajustado para reproduzir o padrão visual aprovado no mockup: uma linha compacta por área com nome à esquerda, barra horizontal fina e longa no centro e percentual à direita. As barras usam uma sequência fixa de cores vivas (verde, azul, laranja, vermelho, roxo, magenta, ciano e amarelo).

A informação `estudados/total` foi retirada da linha principal para não poluir o dashboard. Ela continua disponível no `title`/tooltip da linha, junto com a cobertura da área. O percentual visível continua sendo calculado pelos dados reais de confiança SRS; não há valores ilustrativos.

A ordenação das áreas deixou de depender do percentual e segue `sectionOrder`, mantendo a anatomia em posição estável entre atualizações do progresso.

## Atualização 2026-09-18 — dashboard completo: próximas revisões + Quiz embutido

O espaço vazio abaixo dos atalhos de sessão agora exibe `Próximas revisões`, derivado exclusivamente de registros SRS reais com `due > agora`, ordenados pelo vencimento mais próximo. São mostrados até 5 casos, com diagnóstico, área/site e prazo/data. Clicar em um caso inicia uma fila curta começando por ele.

A sessão do quiz deixou de substituir o conteúdo do dashboard. `startQuizInsideDashboard()` agora procura exclusivamente `#study-embedded-host` dentro da overlay única e chama `renderQuizCardIntegrated(host)` nesse container. O dashboard, KPIs, gráfico, Estado do acervo e Domínio por área permanecem visíveis acima durante a sessão.

Foi acrescentado um bloco permanente `Modo Estudo / Quiz clínico` na parte inferior da mesma tela. Antes de iniciar, ele mostra um placeholder; ao iniciar qualquer sessão do dashboard, as questões, imagens, alternativas, feedback e botões Fácil/Média/Difícil/Não sei são renderizados ali. Não criar uma segunda overlay/modal para esse fluxo.

Nenhum dado clínico, imagem, classificação, `altPlacements`, ID ou regra de sincronização foi alterado.

## Atualização 2026-09-18 — insight de desempenho + barra de progresso do Quiz

O espaço vazio abaixo do gráfico `Evolução do desempenho` foi preenchido por um card de insight derivado exclusivamente do `SESSIONLOG` dos últimos 14 dias. Ele mostra quantidade real de questões e acurácia real; quando ainda não há dados, apresenta apenas uma orientação neutra, sem inventar tendência.

O cabeçalho do `Modo Estudo` foi reorganizado conforme a referência visual aprovada: título à esquerda, `Questão X de Y`, barra horizontal azul longa e percentual no centro, e botão `Finalizar sessão` à direita. O percentual deriva de `quizIndex / quizQueue.length`. Finalizar retorna ao dashboard sem apagar respostas já persistidas.

## Hotfix 2026-09-18 — botão “Começar sessão” da Personalizada

Corrigido o fluxo da Sessão personalizada. `renderCustomSetupInside()` substitui temporariamente o conteúdo da overlay única e, portanto, remove `#study-embedded-host`. O handler antigo chamava `startQuizInsideDashboard()` imediatamente nesse estado; como o host do quiz não existia, a sessão não iniciava.

Ao clicar `Começar sessão`, a fila filtrada é agora congelada em até 30 casos, o dashboard persistente é reconstruído com `openProgressDashboard()` e, no próximo frame, `startQuizInsideDashboard(queue)` renderiza a sessão no `#study-embedded-host`. O fluxo continua usando uma única overlay e o quiz permanece embutido na parte inferior do dashboard.

Também foi protegido o KPI de área mais fraca para usar `weak.name || weak.s || '—'`, evitando a exibição literal de `undefined`.

## Atualização 2026-09-18 — cores anatômicas nas revisões + dashboard em tempo real

Foi criado um mapa canônico de cores por seção (`studySectionColor(section)`), derivado de `sectionOrder`. `Domínio por área` e `Próximas revisões` passam a usar exatamente a mesma cor para a mesma seção anatômica. Cada revisão recebe barra lateral, ponto luminoso, hover e destaque na cor da sua seção; a cor não depende mais da posição visual da linha.

Foi adicionada `refreshStudyDashboardLive()`. Após cada clique em `Fácil / Média / Difícil / Não sei`, imediatamente depois de `srsGradeLevel()` e `recordQuizAnswerToday()`, o dashboard já aberto é atualizado in-place sem reconstruir a overlay e sem interromper a questão. São atualizados: `Questões hoje`, `Revisões pendentes`, barras/percentuais de `Domínio por área`, tooltip de cobertura e contagens do `Estado do acervo`.

Regra: atualizações em tempo real do dashboard durante uma sessão devem modificar apenas os elementos existentes; não chamar `openProgressDashboard()` para atualizar métricas, pois isso destruiria o estado visual do quiz embutido.

## Atualização 2026-09-18 — Ciclo de revisão do acervo

O card genérico de insight abaixo de `Evolução do desempenho` foi substituído por `Ciclo de revisão do acervo`, para continuar útil mesmo quando 100% das lesões já tiverem sido vistas.

A classificação usa exclusivamente `SRS[id].updatedAt`, que já representa o instante da última classificação/revisão do caso. As faixas são mutuamente exclusivas: `≤ 7 dias`, `8–45 dias`, `46 dias–6 meses` (183 dias), `> 6 meses` e `Nunca revisada`. Cada lesão pertence a exatamente uma faixa.

Cada seção anatômica recebe uma barra segmentada de 100%, além de `X / total` já vistas e percentual de cobertura. O resumo geral mostra contagem e percentual das cinco faixas em todo o acervo. Não foi criado um segundo banco de progresso.

`refreshStudyDashboardLive()` também atualiza o Ciclo de revisão após cada resposta classificada no quiz, portanto um caso recém-revisado migra imediatamente para `≤ 7 dias` sem recarregar a overlay.

## Atualização 2026-09-18 — dashboard panorâmico e Ciclo de revisão ampliado

O modal `Quiz & Progresso` foi ampliado para até 1540 px / 96vw. A grade superior dá mais largura à coluna analítica da direita e o `Ciclo de revisão do acervo` ganhou barras mais longas e altas, rótulos maiores, colunas mais espaçosas para `X / total` e `%`, além de legenda e resumo geral mais legíveis. Em telas menores, a grade volta automaticamente para uma coluna.

Esta alteração é exclusivamente visual/responsiva. Não modifica SRS, SESSIONLOG, dados clínicos, imagens, classificações, IDs, taxonomia ou sincronização.

## Atualização 2026-09-18 — Resumo geral panorâmico do ciclo de revisão

Foi implementado o painel independente `Resumo geral do ciclo de revisão`, conforme o preview aprovado. Ele aparece em largura total antes do Modo Estudo e mostra uma única barra segmentada de todo o acervo, com percentual dentro de cada faixa e, abaixo, quantidade absoluta + rótulo para `≤7 dias`, `8–45 dias`, `46 dias–6 meses`, `>6 meses` e `Nunca revisadas`.

O painel usa o mesmo `cycleGlobal/getReviewCycleStats()` do Ciclo por área, portanto os segmentos sempre somam o acervo real e não duplicam estado. `refreshStudyDashboardLive()` atualiza também este resumo imediatamente após cada questão classificada.

## Atualização 2026-09-18 — otimização dos espaços do Quiz & Progresso

O `Ciclo de revisão do acervo` foi retirado de dentro do card `Evolução do desempenho`. Essa composição fazia a coluna direita ficar muito alta e obrigava `Próximas revisões`, na coluna esquerda, a deixar um grande espaço vazio artificial.

A composição desktop agora é: (1) Sessões/Próximas revisões ao lado de Evolução do desempenho; (2) Ciclo de revisão em um card panorâmico próprio, ocupando toda a largura; (3) Estado do acervo ao lado de Domínio por área; (4) Resumo geral do ciclo em largura total; (5) Modo Estudo. O Ciclo ganhou barras ainda mais largas nessa posição.

A mudança é estrutural apenas no layout do dashboard; os cálculos, SRS, SESSIONLOG, atualização em tempo real e dados do acervo permanecem inalterados.

## Atualização 2026-09-18 — composição panorâmica fiel ao preview

O `Quiz & Progresso` desktop passou a usar uma grade panorâmica real de três colunas, em vez de duas colunas altas empilhadas. A primeira linha reúne `Sessão/Próximas revisões`, `Evolução do desempenho` e `Estado do acervo`. O gráfico de evolução foi deliberadamente compactado porque, com poucos dias registrados, não deve dominar a área útil.

O `Ciclo de revisão do acervo` ocupa uma faixa larga nas colunas central+direita, com barras maiores. Na linha seguinte, `Domínio por área` ocupa a coluna esquerda e `Resumo geral do ciclo de revisão` ocupa as colunas central+direita. `Modo Estudo` permanece em largura total abaixo. Em larguras menores que 1180 px o dashboard volta para fluxo vertical responsivo.

A mudança é exclusivamente de composição/CSS. Nenhum cálculo de SRS, SESSIONLOG, classificação, imagens, dados clínicos, IDs, taxonomia ou sincronização foi alterado.

## Atualização 2026-09-18 — compactação dos espaços vazios panorâmicos

A grade desktop foi refinada sem alterar lógica: título/subtítulo e KPIs agora compartilham a mesma faixa superior; `Evolução do desempenho` e `Estado do acervo` não são mais esticados artificialmente pela altura do card de sessões; e `Ciclo de revisão do acervo` passou a ocupar as três colunas completas, eliminando a coluna vazia à esquerda. `Domínio por área` + `Resumo geral` continuam na linha seguinte e `Modo Estudo` permanece em largura total.

Nenhum cálculo, SRS, SESSIONLOG, dado clínico, imagem, classificação, ID, taxonomia ou sincronização foi modificado.

## Atualização 2026-09-18 — correção definitiva da grade panorâmica

A tentativa anterior ainda sofria interferência de regras CSS antigas. A composição desktop foi sobrescrita por uma grade determinística de 12 colunas com posicionamento explícito: cabeçalho 4/12 + KPIs 8/12; Sessões 4/12 + Evolução 5/12 + Estado 3/12; Ciclo 12/12; Domínio 4/12 + Resumo 8/12; Quiz 12/12. `grid-auto-rows:max-content` impede que uma linha reserve altura vazia além do conteúdo necessário.

A Evolução tem altura fixa compacta de 145 px. Ciclo ocupa efetivamente `1 / -1`. Não houve alteração de lógica ou dados.

## Alteração 001 — testes estáticos de integridade

Foi criado `tests/duplicate-detection.test.js`, usando exclusivamente recursos nativos do Node.js. O teste lê e analisa estaticamente o `index.html`: não executa a aplicação e não acessa IndexedDB, Firebase, Firestore, Cloudinary ou a rede.

O `SEED` atual analisado contém 1.213 registros. Todos os IDs foram verificados como únicos, presentes e compatíveis com o padrão `seed_<N>`. Não há duplicatas exatas atuais pela chave `s + site + name`, e o JavaScript embutido passou na verificação sintática sem ser executado.

O teste também confirmou um defeito preexistente: as 28 entradas de `DUPLICATE_PAIRS_V171` estão estruturalmente incorretas. Esse defeito foi deliberadamente mantido sem correção nesta alteração, para continuar detectável até sua etapa específica. Por isso, o resultado atual esperado é **6 PASS e 1 FAIL**.

Comandos de verificação:

```text
node tests/duplicate-detection.test.js
node --check tests/duplicate-detection.test.js
```

## Alteração 002 — testes isolados dos fluxos críticos

Foi criado `tests/critical-flows.test.js` usando somente recursos nativos do Node.js. O teste analisa o `index.html` estaticamente e executa apenas trechos específicos extraídos em um contexto `vm` isolado, com mocks e stubs locais. Nenhum cenário acessa IndexedDB real, Firebase, Firestore, Cloudinary ou a rede.

Os testes confirmaram que `loadData()` chama `recoverCanonicalBaseV154()` automaticamente e que `hasBrokenMigrationArtifacts()` não possui chamadas atualmente. Em isolamento, `recoverCanonicalBaseV154()` demonstrou capacidade de reinserir no estado persistido um registro canônico do `SEED` que estivesse ausente.

Também foi confirmado que o fluxo atual de importação pode iniciar mutações e persistência com um backup cuja estrutura interna é inválida, antes de existir validação completa. O inventário estático do handler encontrou 10 atribuições de estado, 4 chamadas diretas a `storage.set`, 2 chamadas a `pushToFirebaseNow` e as rotinas auxiliares de persistência identificadas pelo próprio teste.

O resultado esperado de `tests/critical-flows.test.js` é **6 PASS e 2 FAIL** conhecidos: recuperação automática do `SEED` durante `loadData()` e mutação/persistência iniciada por backup estruturalmente inválido. Nenhum desses defeitos foi corrigido. O teste da Alteração 001 permanece com **6 PASS e 1 FAIL** conhecido em `DUPLICATE_PAIRS_V171`.

```text
node --check tests/critical-flows.test.js
node tests/critical-flows.test.js
node tests/duplicate-detection.test.js
```

Observação técnica: alguns testes de localização usam números de linha exatos do `index.html` atual. Esses números são âncoras do estado analisado e podem precisar ser atualizados quando o arquivo for legitimamente modificado. Uma mudança isolada de linha não deve ser interpretada automaticamente como regressão funcional.

## Alteração 003 — fim da recuperação automática incondicional do SEED

O problema corrigido era a chamada automática de `recoverCanonicalBaseV154()` por `loadData()` imediatamente após carregar `DATA` do estado persistido. A única mudança funcional no `index.html` foi remover:

```javascript
await recoverCanonicalBaseV154();
```

Nenhuma nova política automática de recuperação foi criada. `hasBrokenMigrationArtifacts()` continua sem ser conectada ao fluxo normal de carregamento. `recoverCanonicalBaseV154()` continua existindo, e o teste dinâmico isolado continua demonstrando que, quando chamada explicitamente, ela é capaz de reinserir um registro canônico ausente do `SEED`.

O `SEED` permaneceu com exatamente 1.213 registros e não teve seu conteúdo alterado. `DUPLICATE_PAIRS_V171` também permaneceu inalterado, incluindo as mesmas 28 entradas malformadas conhecidas.

`tests/critical-flows.test.js` foi ajustado somente para refletir o novo estado legítimo: a âncora do handler de importação mudou de 6643 para 6642, as chamadas esperadas de `recoverCanonicalBaseV154()` mudaram de `[4735]` para `[]`, e a verificação estática passou a exigir a ausência da chamada automática. O teste de segurança continua protegendo contra sua reintrodução.

Resultados após a correção:

- `tests/critical-flows.test.js`: **7 PASS e 1 FAIL** conhecido, referente ao backup estruturalmente inválido que ainda consegue iniciar mutação/persistência;
- `tests/duplicate-detection.test.js`: **6 PASS e 1 FAIL** conhecido, referente às 28 entradas malformadas de `DUPLICATE_PAIRS_V171`.

O defeito da importação e o defeito de `DUPLICATE_PAIRS_V171` **não foram corrigidos** nesta alteração.

## Alteração 004 — validação segura da importação de backup

A importação passou a validar completamente o array de registros antes de qualquer confirmação, atribuição ao estado global, persistência local ou sincronização remota. A mesma validação é usada tanto pelo backup legado em formato de array quanto pelo backup completo identificado por `format: "atlas-radiologico-backup"`.

Cada registro importado deve ser um objeto não nulo e não array, com `id`, `name`, `s` e `site` como strings não vazias nem compostas apenas por espaços. IDs duplicados dentro do próprio backup são rejeitados. IDs personalizados continuam permitidos; não foi imposto o padrão `seed_<N>`.

Campos historicamente opcionais continuam opcionais, incluindo metadados do backup, progresso, ordenações e campos clínicos complementares. A política de tipos e fallbacks de `review`, `srs`, `sessionLog`, `sectionOrder` e `siteOrder` não foi alterada.

`createSafetySnapshot()` permanece inerte. Sua chamada foi apenas reposicionada para ocorrer depois da validação e da confirmação do usuário, imediatamente antes da primeira mutação, sem implementar snapshots.

Após a correção, `tests/critical-flows.test.js` totaliza **14 PASS e 0 FAIL**. `tests/duplicate-detection.test.js` permanece com **6 PASS e 1 FAIL** conhecido e não relacionado nas 28 entradas malformadas de `DUPLICATE_PAIRS_V171`. Esse defeito não foi corrigido. O `SEED` permanece com exatamente 1.213 registros.

## Alteração 006 — hardening inerte de `altPlacements` no reconciliador V2

O reconciliador por identidade semântica V2 continua **inerte e sem qualquer call site de produção**. Seu merge de `altPlacements` passou a unir associações distintas, deduplicar associações equivalentes por `s + site` normalizados somente para comparação e preservar a representação original escolhida.

Metadados complementares são fundidos sem perda. Divergências escalares usam a prioridade determinística já definida pelo V2 e são registradas com os dois valores de origem e o valor resultante. Identidades incompletas, containers inválidos e incompatibilidades estruturais geram conflitos `blocking:true`; esses conflitos alimentam `safeToApply` e impedem aplicação.

A auditoria em memória do snapshot completo confirmou 18 associações em DATA, 18 no SEED e 29 associações semânticas únicas no resultado, sem perda, conflitos de `altPlacements` ou bloqueios. O arquivo de snapshot não foi modificado e nenhum armazenamento local/remoto foi acessado.

Resultados: `tests/legacy-id-migration.test.js` com **119 PASS, 0 FAIL e 5 TODO**; `tests/critical-flows.test.js` com **14 PASS e 0 FAIL**; `tests/duplicate-detection.test.js` permanece com **6 PASS e 1 FAIL** histórico e não relacionado em `DUPLICATE_PAIRS_V171`.

## Alteração 010 — Central de Revisões + Soluções (`LESION_REVISIONS`)

Novo recurso funcional, não uma correção de dados. Adiciona uma fila própria
para o usuário marcar uma lesão para revisão com um pedido de texto livre
(ex: "corrigir classificação", "possível lesão duplicada"), com um fluxo de
proposta de solução e aprovação/recusa manual. **É deliberadamente separada**
de `REVIEW` (Não revisado/Revisando/Dominado, fluxo de estudo) e de `SRS`
(repetição espaçada do quiz) — nenhuma linha desses dois sistemas foi tocada.

### O que foi adicionado

- Variável global `LESION_REVISIONS` (dicionário por `reviewId`), persistida
  via `storage.get/set` sob a chave `atlas:lesionRevisions` — mesma camada
  IndexedDB usada por `REVIEW`/`SRS`/`SESSIONLOG`, carregada em `loadData()`
  via `loadLesionRevisions()`.
- Funções públicas: `createLesionReview(lesionId, requestText)`,
  `getPendingReviews()`, `getReadySolutions()`, `setReviewSolution(reviewId,
  solutionText, proposedChanges)`, `acceptReviewSolution(reviewId)`,
  `rejectReviewSolution(reviewId, reasonText)`, `getReviewHistory(reviewId)`.
  Pensadas para, no futuro, uma IA chamar `getPendingReviews()` diariamente e
  registrar propostas via `setReviewSolution()` — **essa IA/agendamento não
  foi implementada nesta entrega**, só a arquitetura de suporte.
- Dois ícones no cabeçalho (🔔 Revisões pendentes, 💡 Soluções disponíveis),
  à esquerda do botão `Quiz & Progresso`, com badge numérico só quando há
  itens. Cada um abre um painel próprio (`openPendingReviewsModal()` /
  `openReadySolutionsModal()`) — overlays independentes no mesmo padrão de
  `openDetail()`/`openForm()` (não usam `getStudyOverlay()`, que é exclusiva
  do fluxo Quiz & Progresso).
- Checkbox "marcar para revisão" no modal já existente de "Editar lesão"
  (só em edição, não ao criar uma lesão nova), que abre uma textarea de
  pedido livre e cria a revisão ao salvar.

### Regras de status e segurança

`status` vale `pending`, `solution_ready`, `accepted` ou `rejected`.
`getPendingReviews()` conta `pending` **e** `rejected` (uma solução recusada
volta sozinha para a fila de pendentes). `createLesionReview()` recusa criar
uma segunda revisão `pending` para a mesma lesão com o mesmo `requestText`
(comparação exata, após `trim()`), evitando duplicação acidental — mas
permite pedidos diferentes para a mesma lesão.

**Aceitar não aplica nada em `DATA` automaticamente.** `acceptReviewSolution()`
só muda o `status` da revisão para `accepted` e registra no histórico —
aplicação estruturada dos dados propostos é uma etapa futura, fora do escopo
desta entrega. `rejectReviewSolution()` pede um motivo opcional, nunca apaga
a solução recusada nem o histórico, e devolve a revisão para pendentes.

Cada revisão guarda um histórico cronológico (`history: [{timestamp, action,
details}]`) com ações `created`, `solution_created`, `accepted`, `rejected`,
`reopened` — nada é apagado silenciosamente. `reopened` é registrado quando
`setReviewSolution()` é chamada sobre uma revisão que estava `rejected`
(nova proposta depois de uma recusa).

### Por que NÃO sincroniza com Firebase

De propósito, nesta primeira versão. `saveLesionRevisions()` só grava local
(IndexedDB) e nunca chama `pushToFirebase()`/`pushToFirebaseNow()`. Isso
evita tocar na camada de reconciliação/sincronização remota (fora do escopo
autorizado desta tarefa). Se um dia isso precisar sincronizar entre
dispositivos, será uma mudança deliberada e separada, avaliando concorrência
e merge — não implícita nesta entrega.

### Persistência e backup

Incluída no backup/export (`btn-export`, campo `lesionRevisions`) e restaurada
na importação de um backup completo (`format: 'atlas-radiologico-backup'`).
Um backup legado (array simples de lesões) não contém `lesionRevisions` e
por isso não mexe no estado atual dessa fila ao ser importado — mesmo
comportamento já aplicado a `REVIEW`/`SRS`/`SESSIONLOG` nesse caminho legado.
O gerador de backup pré-reconciliação V2 (`buildPreMigrationBackupV2`, área
sensível/inerte) **não foi tocado** e continua sem `lesionRevisions` — não é
usado por nenhum fluxo de produção.

### Testes

`tests/lesion-review.test.js` (novo, 18 cenários) extrai o trecho real do
módulo do `index.html` e executa num `vm` isolado com `storage` falso em
memória — mesmo padrão de `tests/critical-flows.test.js`, sem IndexedDB,
Firebase, Firestore, Cloudinary ou rede reais. Resultado: **18 PASS, 0 FAIL**.

A inserção do módulo antes de `recoverCanonicalBaseV154()`,
`hasBrokenMigrationArtifacts()`, `loadData()` e o handler de importação
deslocou as âncoras de linha estáticas de `tests/critical-flows.test.js`
(atualizadas: 4312→4502, 4302→4492, 6612→6802, 8542→8947) e exigiu um stub
`loadLesionRevisions` no contexto isolado de `loadData()` usado por esse
teste — nenhuma lógica preexistente foi alterada. Resultados após a
atualização: `tests/critical-flows.test.js` com **20 PASS e 0 FAIL**;
`tests/duplicate-detection.test.js` permanece com **6 PASS e 1 FAIL**
histórico em `DUPLICATE_PAIRS_V171`; `tests/legacy-id-migration.test.js` (não
tocado por esta alteração) permanece com **156 PASS, 0 FAIL e 5 TODO** —
mais testes que o número histórico da Alteração 006 (119), porque o arquivo
cresceu com alterações não relacionadas a esta tarefa desde então.

`SEED`, `DATA`, `REVIEW`, `SRS`, `SESSIONLOG` e a reconciliação V2 não foram
alterados nesta entrega.

### Hotfix (mesmo dia) — badges do header não atualizavam sem F5

Bug encontrado em teste manual: `createLesionReview()` e `setReviewSolution()`
funcionavam e persistiam corretamente, mas os ícones 🔔/💡 do header só
refletiam a mudança depois de recarregar a página (F5) — porque
`updateReviewCenterBadges()` só era chamada pelos caminhos de UI (salvar o
formulário de edição, aceitar/recusar no painel), nunca pelas 4 funções
centrais em si. Chamar `setReviewSolution()` direto pelo console (simulando
como a futura IA vai operar) deixava os badges visivelmente desatualizados.

Correção: `createLesionReview()`, `setReviewSolution()`,
`acceptReviewSolution()` e `rejectReviewSolution()` agora chamam
`updateReviewCenterBadges()` diretamente, de forma síncrona, logo após
persistir a mudança — então o header reage imediatamente, mesmo quando essas
funções são chamadas fora da UI. `updateReviewCenterBadges()` ganhou uma
guarda `if(typeof document==='undefined') return;` no topo, pra continuar
segura em qualquer contexto sem DOM (testes em `vm`, ou um script headless
futuro rodando a IA sem browser) — sem essa guarda, chamar as 4 funções fora
de um browser lançaria `ReferenceError: document is not defined`.

Os três call sites de UI que já chamavam `updateReviewCenterBadges()`
manualmente depois de `await saveLesionRevisions()` (salvar o formulário de
edição; aceitar/recusar no painel de soluções) tiveram essa chamada removida
por ficar redundante — a chamada central já cobre o caso; o `await
saveLesionRevisions()` continua ali só para garantir que a gravação termine
antes de fechar o modal/re-renderizar a lista.

Dois testes de regressão novos em `tests/lesion-review.test.js` cobrem
exatamente esse cenário: um confirma que `updateReviewCenterBadges()` nunca
lança erro sem `document`; o outro usa uma DOM falsa mínima
(`getElementById`/`textContent`/`classList.toggle`) para confirmar que os
badges mudam corretamente após cada uma das 4 transições de status,
inclusive chamando as funções "fora da UI". Resultado:
`tests/lesion-review.test.js` com **20 PASS, 0 FAIL** (18→20). A inserção do
comentário/guarda deslocou as âncoras de linha de
`tests/critical-flows.test.js` mais uma vez (+12: 4502→4514, 4492→4504,
6802→6814, 8947→8962); nenhuma lógica preexistente foi alterada —
`tests/critical-flows.test.js` continua com **20 PASS, 0 FAIL**.

## Alteração 012 — máquina de estados de dois aceites (proposta → autorizar → aplicar → aprovar/desfazer)

Evolução funcional do workflow da Central de Revisões, pedida pelo usuário
depois de usar a v1 (Alteração 010) em teste manual real. A v1 tinha só uma
decisão humana (aceitar/recusar uma proposta) e nunca tocava `DATA` —
"aceitar" só aprovava a proposta *dentro do workflow*, sem aplicar nada de
verdade na lesão. Essa segunda versão introduz a aplicação estruturada real,
mas com **dois controles humanos obrigatórios** antes de qualquer mudança
definitiva:

1. **1º aceite — "autorizo executar esta correção proposta?"**
   (`authorizeAndApplyReviewSolution`): só depois desse aceite os campos
   autorizados são escritos em `DATA` de verdade.
2. **2º aceite — "vi a correção aplicada e quero mantê-la?"**
   (`approveAppliedReviewSolution` / `rollbackAppliedReviewSolution`): a
   mudança já está em `DATA`, mas ainda pode ser desfeita com um clique.

**A IA nunca tem os dois aceites.** Ela só pode ir até `setReviewSolution()`
(propor) — nunca autoriza a própria proposta, nunca aprova a própria
alteração, nunca decide um rollback sozinha. Ver comentário no topo do
módulo em `index.html` e a seção "REGRA FUNDAMENTAL DA IA" abaixo.

### Nova máquina de estados

```
pending
  -> proposed                        (setReviewSolution — SÓ propõe, DATA intocado)
       -> rejected                   (rejectProposedReviewSolution — 1º aceite negado, DATA intocado)
       -> applied_pending_validation (authorizeAndApplyReviewSolution — 1º aceite dado:
                                       snapshot COMPLETO da lesão é criado ANTES,
                                       só então os campos autorizados são escritos em DATA)
            -> accepted              (approveAppliedReviewSolution — 2º aceite dado, fica valendo)
            -> rejected              (rollbackAppliedReviewSolution — 2º aceite negado:
                                       DATA é restaurado EXATAMENTE do snapshot daquela tentativa)
rejected -> proposed                 (nova proposta reabre a revisão — ação "reopened")
```

`status === "rejected"` continua contando pra 🔔 Revisões pendentes (agora
cobre duas origens: proposta recusada, ou correção aplicada e desfeita via
rollback — ambas voltam pra fila pendente igual). O badge 💡 Soluções
disponíveis agora conta a UNIÃO de `proposed` + `applied_pending_validation`
— tudo que aguarda alguma decisão humana.

### Snapshot por tentativa (não por revisão)

Cada `authorizeAndApplyReviewSolution()` bem-sucedida cria uma nova entrada
em `review.attempts[]`: `{id, beforeSnapshot, proposedChanges, appliedAt,
approvedAt, rolledBackAt}`. `beforeSnapshot` é um clone completo
(`JSON.parse(JSON.stringify(lesion))`) tirado imediatamente antes de
escrever qualquer campo — nunca reaproveitado entre tentativas diferentes da
mesma revisão. Se uma correção é desfeita e uma nova proposta é autorizada
depois, `rollbackAppliedReviewSolution()` restaura a lesão a partir do
`beforeSnapshot` daquela tentativa específica
(`DATA[idx] = JSON.parse(JSON.stringify(attempt.beforeSnapshot))`, uma
substituição completa do registro, não um patch campo a campo) e a
tentativa seguinte cria seu próprio snapshot novo, a partir do estado já
restaurado.

### `proposedChanges` — validação estruturada, não execução de código

`validateProposedChanges()` só aceita um objeto simples `{campo: valor}`
restrito a uma allowlist fixa,
`LESION_REVIEW_EDITABLE_FIELDS = ['name', 'notes', 'classification', 'tags', 'enTerm']`
— deliberadamente SEM `id`, `img`/`images`/`localImg`, `links`, `s`, `site`,
`altPlacements` ou qualquer campo de posse/identidade. Isso é o que impede,
por construção, que uma proposta acione: excluir lesão, fundir lesões,
mover/apagar imagem, mudar ownership de imagem, ou qualquer operação
Cloudinary/Firebase — nenhum desses campos passa pela allowlist, então a
validação recusa a proposta antes de tocar `DATA`. A validação roda TANTO ao
propor (`setReviewSolution`) QUANTO de novo ao autorizar
(`authorizeAndApplyReviewSolution`, defesa em profundidade — mesmo que o
objeto da revisão fosse corrompido manualmente entre os dois passos).

Para esta primeira versão, alterações destrutivas ou de ownership (excluir
lesão, fundir lesões, mover/deletar imagens, ownership de imagens, operações
Cloudinary/Firebase) continuam exigindo edição manual pelo formulário — a
IA pode até escrever essa sugestão em `solution.text` como texto livre, mas
nenhum campo desse tipo é aceito estruturalmente em `proposedChanges`.

### Interface

💡 Soluções disponíveis agora tem duas abas: **Propostas** (`proposed` —
mostra pedido original, solução proposta, resumo "de → para" dos campos que
serão alterados, com botões `✓ autorizar correção` / `✕ recusar proposta`)
e **Validar correções** (`applied_pending_validation` — mostra pedido
original, "de → para" real (snapshot vs. estado atual em `DATA`), botão
`👁 ver lesão corrigida` que abre o detalhe da lesão de verdade, e botões
`✓ funcionou — manter` / `↩ não funcionou — desfazer`). O modal genérico de
motivo opcional (antes `openRejectReasonModal`) virou
`openReasonPromptModal(reviewId, onConfirm, {title, subtitle, confirmLabel})`
— reaproveitado tanto pra recusar uma proposta quanto pra desfazer uma
correção aplicada, só o texto muda.

`REVIEW_HISTORY_ACTION_LABELS` e o histórico ganharam os novos eventos:
`solution_proposed`, `proposal_rejected`, `application_authorized`,
`before_snapshot_created`, `changes_applied`, `application_approved`,
`application_rejected`, `rollback_completed` — além de `created`/`reopened`
que já existiam. Nada é apagado do histórico em nenhuma transição.

### API (nomes exigidos pela evolução, ver seção 6 do pedido)

`createLesionReview` e `getPendingReviews` continuam com o mesmo nome/
comportamento. Novas: `getProposedSolutions()`,
`getAppliedSolutionsAwaitingValidation()`, `authorizeAndApplyReviewSolution()`,
`rejectProposedReviewSolution()`, `approveAppliedReviewSolution()`,
`rollbackAppliedReviewSolution()`. `getReadySolutions()` foi mantida (mesmo
nome, compatibilidade pedida explicitamente) mas agora é a união de
propostas + aplicadas aguardando validação — o que já mantém
`countReadyLesionSolutions()`/o badge 💡 corretos sem precisar mudar esses
call sites. `acceptReviewSolution()`/`rejectReviewSolution()` (da v1) foram
REMOVIDAS — o modelo de um aceite só não existe mais; usar
`rejectProposedReviewSolution()` (1º aceite negado) ou
`approveAppliedReviewSolution()`/`rollbackAppliedReviewSolution()` (2º
aceite) conforme o estado.

### `DATA` agora é tocado — mas só em dois lugares, com o caminho de persistência já existente

Diferente da Alteração 010 (que era 100% local, sem tocar `DATA`),
`authorizeAndApplyReviewSolution()` e `rollbackAppliedReviewSolution()`
agora leem e escrevem `DATA` de verdade — são as ÚNICAS duas funções do
módulo que fazem isso (`tests/lesion-review.test.js` tem um teste estático
que verifica isso extraindo o corpo de cada função). As duas chamam
`saveData()`, a mesma função já existente no app (usada pelo formulário de
edição) que persiste em `storage`/IndexedDB e sincroniza com o Firebase —
**não foi criado nenhum caminho de persistência novo, nem mexido no
Firebase/Cloudinary/reconciliação V2**; só reaproveitado o que já existe,
porque qualquer mudança real em `DATA` precisa desse caminho pra não
divergir do Firestore (ver AGENTS.md, "Não silencie falhas que possam deixar
o estado local e remoto divergentes"). A fila em si (pedidos, propostas,
histórico, snapshots) continua só local (`saveLesionRevisions()`, sem
Firebase), exatamente como na Alteração 010.

### REGRA FUNDAMENTAL DA IA

`createLesionReview()` é **exclusivamente** uma ação iniciada manualmente
pela pessoa usando o Atlas — a futura IA nunca deve chamá-la. O fluxo
permitido pra uma IA é `getPendingReviews()` → analisar →
`setReviewSolution()`, e parar exatamente aí. Ela nunca chama
`authorizeAndApplyReviewSolution()` (autorizar a própria proposta), nunca
chama `approveAppliedReviewSolution()`/`rollbackAppliedReviewSolution()`
(decidir sozinha se a própria alteração funcionou) — os dois aceites são
sempre de uma pessoa, pelos botões da Central de Revisões. Isso está
documentado em comentário no topo do módulo `index.html`, e
`tests/lesion-review.test.js` tem um teste estático que confirma que nenhuma
das funções de processamento (`setReviewSolution`,
`rejectProposedReviewSolution`, `authorizeAndApplyReviewSolution`,
`approveAppliedReviewSolution`, `rollbackAppliedReviewSolution`) chama
`createLesionReview()` internamente. Não existe (nem foi implementada) uma
IA de verdade ou agendamento nesta entrega — só a infraestrutura pra
conectar uma futura.

### Testes

`tests/lesion-review.test.js` foi reescrito para a nova máquina de estados:
**29 PASS, 0 FAIL** — cobre os 7 cenários numerados do pedido (manual,
proposta, recusar proposta, autorizar, aprovar, desfazer/rollback, nova
tentativa com snapshot independente), validação de `proposedChanges`
inválido/campo proibido sem alterar `DATA`, falha de aplicação (lesão não
encontrada) sem mutação parcial, histórico completo preservado numa cadeia
longa (criada→proposta→autorizada→aplicada→desfeita→reaberta→nova
proposta→autorizada→aprovada), persistência de `attempts`/snapshots após um
reload simulado, os badges reagindo imediatamente em cada transição, e as
duas checagens estáticas de segurança (só as 2 funções certas tocam `DATA`;
nenhuma função de processamento cria revisão nova).

A inserção do módulo maior deslocou as âncoras de linha de
`tests/critical-flows.test.js` mais uma vez (+186: 4514→4700, 4504→4690,
6814→7000, 8962→9287) — nenhuma lógica preexistente foi alterada, só a
posição no arquivo. Resultado: `tests/critical-flows.test.js` **20 PASS, 0
FAIL**; `tests/duplicate-detection.test.js` permanece **6 PASS, 1 FAIL**
histórico (não relacionado, `DUPLICATE_PAIRS_V171`, não corrigido de
propósito); `tests/legacy-id-migration.test.js` (não tocado) permanece
**156 PASS, 0 FAIL, 5 TODO**.

`SEED`, `REVIEW`, `SRS`, `SESSIONLOG`, a reconciliação V2 e o Firebase/
Cloudinary não foram alterados nesta entrega — só o caminho já existente
`saveData()` foi reutilizado, exatamente como o formulário de edição já
fazia.

## Alteração 013 — legibilidade do Quiz clínico

Mudança puramente visual (CSS), sem tocar lógica de geração de questões,
correção, `SESSIONLOG`, `SRS`, `DATA`, imagens ou Central de Revisões.

O painel "CASO TEÓRICO" (`.quiz-noimage`, usado quando a lesão não tem
imagem) deixou de ficar centralizado numa ilha pequena dentro de uma área
vazia: `.quiz-study-media` virou `display:flex;flex-direction:column` e
`.quiz-noimage` recebeu `flex:1`, então ele preenche a mesma altura que o
grid (`.quiz-study-shell`) já reservava pro painel — sem isso, o painel
esticava pelo `align-items:stretch` padrão do grid, mas o conteúdo pequeno
ficava perdido no meio de um espaço grande. Título, descrição e os chips de
características (`.quiz-theory-clues span`) ganharam `font-size` bem maior,
com `clamp()` pra continuar responsivo. Pelo mesmo motivo, `.quiz-study-media
img` (caso COM imagem) trocou o `max-height:390px` fixo por
`max-height:min(58vh,560px)` com `flex:1`, aproveitando melhor um painel
que agora pode ficar mais alto.

A pergunta (`<h3>`) trocou um `style` inline sem tamanho definido (ficava no
padrão do navegador, ~16px) por uma classe dedicada `.quiz-question-title`
com `clamp(18px,1vw + 15px,22px)`. As alternativas (`.quiz-mcq-option`/
`.quiz-mcq-letter`) tiveram padding, gap e fonte aumentados — nos DOIS
lugares onde essas classes são estilizadas: a regra base (linha ~713) e a
regra com maior especificidade `.study-dashboard .quiz-mcq-option` (linha
~823), que é a que **realmente** está ativa dentro do Modo Estudo embutido
(o host do quiz sempre carrega dentro de um container com a classe
`study-dashboard` — ver Atualização 2026-09-18 "paleta viva"). Editar só a
regra base não teria efeito visual nenhum ali.

Foi deixado um comentário em `renderQuizCardIntegrated()`, sem nenhuma
mudança funcional, marcando `.quiz-answer-detail` como o lugar reservado
pro futuro atalho "🖼 Adicionar imagem a esta lesão" pós-resposta — recurso
ainda não implementado, só o espaço/estrutura preservados de propósito.

Como o `<style>` fica no topo do arquivo, essas mudanças deslocaram (+10
linhas) as âncoras estáticas de `tests/critical-flows.test.js` mais uma vez
(4700→4710, 4690→4700, 7000→7010, 9287→9297) — nenhuma lógica preexistente
foi alterada. Resultado: `tests/critical-flows.test.js` **20 PASS, 0 FAIL**;
`tests/lesion-review.test.js` (não relacionado, confirmado que continua
intacto) **29 PASS, 0 FAIL**. Não existe suíte automatizada de verificação
visual/layout no projeto — a confirmação de que o resultado visual bate com
o pedido (pergunta/alternativas maiores, caso sem imagem preenchendo bem o
painel, responsividade) depende de teste manual no navegador, não executado
nesta sessão.

## Alteração 014 — imagens dentro do Quiz clínico (carrossel + "adicionar sem sair do Quiz")

Evolução do visualizador de imagens do Quiz. Antes, mesmo quando uma lesão
tinha 2+ imagens em `e.images[]`, o Quiz só usava `all[0]` — a primeira —
descartando o resto. Não havia nenhuma forma de alimentar uma lesão com
imagem a partir do Quiz; era preciso sair, abrir "Editar lesão" e voltar.

### O que foi adicionado

- **Carrossel** dentro de `renderQuizCardIntegrated()`: 0 imagens continua
  no CASO TEÓRICO; 1 imagem continua no visual simples de antes, sem
  controles; 2+ imagens ganham setas `‹`/`›`, contador "Imagem X de Y" e
  navegação circular (da última volta pra primeira e vice-versa). O índice
  (`quizImgIdx`) e o array (`quizImgs`) são variáveis locais declaradas
  DENTRO de `renderQuizCardIntegrated()` — reiniciam sozinhas a cada
  questão nova, sem precisar de nenhuma lógica extra de reset (é assim que
  a função já funcionava pra tudo mais). Trocar de imagem só reescreve
  `#quiz-media`; nunca recria a questão, nunca toca resposta/pontuação.
- Navegação por teclado ←/→, com um único listener por questão
  (`quizCarouselKeyHandler`, removido e recriado a cada
  `renderQuizCardIntegrated()`, e limpo ao sair do Quiz ou chegar no
  resumo — sem isso ficaria um listener de `document` vazando a cada
  questão). Ignora ←/→ quando o foco está num `INPUT`/`TEXTAREA`/
  contenteditable, ou quando o modal de adicionar imagem/o lightbox estão
  abertos — não interfere com outros controles.
- **`🖼 Adicionar imagem a esta lesão`**: aparece SOMENTE dentro de
  `#quiz-feedback`, ou seja, só depois de responder (nunca antes) — dentro
  de um novo `.quiz-post-answer-actions`, já preparado pra também receber
  futuramente "🔔 Marcar problema para revisão" (não implementado ainda, só
  o espaço reservado, como já estava documentado na Alteração 013).
- **`openQuizAddImageModal(lesionId, onImagesAdded)`** (nova): painel
  focado "Adicionar imagem a: <nome da lesão>", com upload de arquivo, URL
  direta e busca no Commons — a lesão-alvo é sempre a da questão atual
  (`lesionId` vem de `e.id`, nunca de um estado de UI "selecionado"
  adivinhado). Cada imagem é persistida IMEDIATAMENTE (sem lote/Salvar,
  que não existe fora do formulário de edição completo). Usa uma classe
  própria (`.quiz-img-modal-overlay`, não `.overlay`) e **nunca chama
  `closeOverlay()`** — `closeOverlay()` remove TODAS as `.overlay` de uma
  vez, o que destruiria a overlay do Quiz (`#study-overlay`) por baixo;
  este painel só remove a si mesmo, exatamente como `openCommonsImageSearch`
  já fazia. Fechar o modal (✕/clique fora/Esc/"concluído") não afeta a
  questão, resposta, feedback, pontuação ou posição da sessão por baixo —
  nada disso é tocado por este painel.
- **`addImageToLesionData(lesion, imgObj)`** (nova, em
  `getEntryImgs`/`hasEntryImgs`): função pura que só grava em
  `images`/`_userUpdatedAt` da lesão recebida por parâmetro — nunca em
  `DATA` inteiro, nunca em outra lesão, nunca remove imagens existentes.

### Reuso, não um segundo sistema de imagens

Nenhuma integração nova foi criada. `uploadToCloudinary()` é chamada
diretamente (já era uma função standalone). `openCommonsImageSearch()`
(busca no Wikimedia Commons) foi **movida de dentro de `openForm()` pra
escopo top-level e parametrizada** — antes era uma closure presa a
`pendingImgs`/`imgsChanged`/`renderImgGallery`/`getElementById('f-en-term'/
'f-name')`, só utilizável de dentro do formulário de edição. Agora recebe
`(lesionMeta, initialTerm, onImagesAdded)` e devolve as imagens escolhidas
via callback, em vez de empurrar direto em `pendingImgs`. O call site
original (`img-web-btn` dentro de `openForm()`) foi ajustado só o
suficiente pra continuar com exatamente o mesmo comportamento de antes
(`pendingImgs.push(...imgs); imgsChanged=true; renderImgGallery();` dentro
do callback) — a busca, o upload, a UI de resultados e a lógica de seleção
em si não mudaram uma linha. `stripHtmlText()` (usada só ali) foi movida
junto, pelo mesmo motivo.

### Persistência e segurança

`saveData()` é o mesmo caminho já usado pelo formulário de edição —
`createSafetySnapshot()` + `storage.set(STORAGE_KEY,...)` +
`pushToFirebaseNow()` — nenhum caminho de persistência novo foi criado.
Nenhuma imagem de outra lesão é tocada (`addImageToLesionData()` só recebe
e grava na lesão passada por parâmetro, que é sempre a `e.id` da questão
atual). Nenhuma imagem é removida. Nenhum ID físico de asset é alterado.
Nenhuma deduplicação global nova foi implementada, nenhuma reconciliação
foi executada, `SEED` não foi tocado. `REVIEW`, `SRS`, `SESSIONLOG` e a
Central de Revisões continuam fora do escopo — não referenciados em
nenhuma das funções novas (confirmado estaticamente em
`tests/quiz-images.test.js`).

### Testes

`tests/quiz-images.test.js` (novo, 18 cenários): `addImageToLesionData()`
é testada dinamicamente (função real extraída do `index.html`, executada
num `vm` isolado) — anexa corretamente, cria o array quando ainda não
existe, preserva imagens já existentes, nunca grava numa lesão diferente
da passada. O restante (`openQuizAddImageModal`, `openCommonsImageSearch`
parametrizada, o carrossel dentro de `renderQuizCardIntegrated`, a limpeza
do listener de teclado) é verificado estaticamente no texto-fonte real:
nunca chama `closeOverlay()`, usa classe própria, reaproveita
`uploadToCloudinary()`/`openCommonsImageSearch()` sem reimplementar,
persiste via `saveData()`, o atalho de imagem só existe dentro do fluxo
pós-resposta, e nenhuma das funções novas referencia
`REVIEW`/`SRS`/`SESSIONLOG`/`SEED`. Resultado: **18 PASS, 0 FAIL**.

Como o carrossel/modal foram inseridos antes de `recoverCanonicalBaseV154`
etc. (a busca do Commons e `stripHtmlText` viraram funções top-level logo
depois de `openForm()`), as âncoras de `tests/critical-flows.test.js`
deslocaram mais uma vez (+30: 4710→4740, 4700→4730, 7010→7040, 9297→9341)
— nenhuma lógica preexistente foi alterada. Resultado:
`tests/critical-flows.test.js` **20 PASS, 0 FAIL**;
`tests/lesion-review.test.js` (não relacionado) **29 PASS, 0 FAIL**.

Não existe suíte automatizada de UI/browser no projeto (sem jsdom, sem
dependências) — a confirmação visual/interativa (carrossel aparecendo com
2+ imagens, contador, setas, navegação por teclado, modal abrindo sobre o
Quiz sem fechá-lo, imagem nova aparecendo sem F5) depende de teste manual
no navegador, não executado nesta sessão.

## Alteração 015 — complementos do modal de imagens e revisão manual no Quiz

O painel pós-resposta de imagens agora aceita imagem do clipboard por
`Ctrl+V`, com listener preso ao próprio modal e foco inicial na área de
upload. Fora do modal ele não captura `paste`. O construtor existente de
Quadro de Imagem foi movido de uma closure de `openForm()` para a função
parametrizada `openCollageBuilder(lesionMeta, onCollageReady,
existingPanels)`. Editor e Quiz chamam essa mesma função; não foi criado um
segundo compositor. O resultado volta pelo mesmo callback que persiste a
imagem na lesão da questão e chama `refreshQuizImgs(true)`, cobrindo as
transições 0→1, 1→2 e 2→3+ sem reconstruir a questão.

Depois de responder, ao lado de adicionar imagem, existe também
`🔔 Marcar para revisão`. `openQuizReviewModal(lesionId)` mostra o nome da
lesão e uma textarea livre, e o botão salvar chama exatamente
`createLesionReview(lesion.id, requestText)`. Cancelar ou fechar remove só
esse modal. Duplicatas idênticas continuam sob a proteção da função central,
que também atualiza o badge do header imediatamente. O fluxo não corrige nem
remove imagens e não toca `quizIndex`, `quizStats`, `SRS` ou `SESSIONLOG`.

Cada miniatura no modal de imagens do Quiz também possui controles sempre
visíveis `✏ Editar` e `🗑 Remover`. Editar altera somente `label`, preservando
`lesionId`, ownership e demais metadados. Remover usa `splice` exclusivamente
no array `images` da lesão recebida, sem excluir o asset remoto. As duas ações
persistem por `saveData()` e passam pelo mesmo callback de atualização usado
na adição, permitindo inclusive 1→0 (retorno imediato ao CASO TEÓRICO).

Testes ampliados: `tests/quiz-images.test.js` passou de 18 para 30 cenários;
`tests/lesion-review.test.js`, de 29 para 35. As âncoras legítimas de
`tests/critical-flows.test.js` foram atualizadas sem alterar seus fluxos.

## Alteração 016 — upload diferido no editor (sem backend)

**Mudança de estratégia:** a tentativa anterior (Alteração 016 original) usava
uma Firebase Cloud Function para excluir assets do Cloudinary. Isso exigiria o
plano Blaze/pagamento de backend só para limpar imagens de teste, então foi
**descartada por completo**: a Function, `functions/`, `firebase.json`,
`.firebaserc`, o `.gitignore` do `firebase init` e `tests/cloudinary-deletion.test.js`
foram removidos; `requestCloudinaryAssetDeletion()` / `hasSecureCloudinaryIdentifier()`
e os ganchos de delete no Editor/Quiz foram apagados. NÃO há dependência de
Firebase Functions nem de segredo administrativo.

### Nova regra

Imagens NOVAS adicionadas no formulário **Editar lesão** (Ctrl+V, selecionar
arquivo ou Wikimedia Commons) ficam **somente locais/temporárias** enquanto o
formulário está aberto — representadas por uma blob URL (para exibir) + o
`File` em memória (`{source:'pending', _file, _objectUrl}`). Nada é enviado ao
Cloudinary antes de **Salvar**.

- **Ctrl+V / selecionar arquivo**: `addLocalFile(file)` só cria a blob URL e
  guarda o `File`. Não chama `uploadToCloudinary`.
- **Commons**: `openCommonsImageSearch(..., deferUpload=true)` baixa o arquivo
  e devolve objeto temporário (preservando `sourcePage`, `sourceSite`,
  `license`, `artist`, `attribution`, `originalUrl`). O Quiz chama sem esse
  parâmetro e mantém o upload imediato (comportamento preservado).
- **URL externa**: continua salva como URL (`source:'url'`), sem upload.
- **Remover durante a edição**: imagem temporária apenas sai de `pendingImgs`
  (blob URL revogada); imagem já persistida apenas sai do conjunto final. Em
  nenhum caso há delete remoto.
- **Cancelar / Esc / clique fora**: libera todas as blob URLs
  (`releasePendingObjectUrls()`), sem enviar nada. `DATA` fica como estava.
- **Salvar**: percorre `pendingImgs` e envia ao Cloudinary **somente** as
  temporárias que sobraram (`source==='pending' && _file`), substituindo cada
  objeto temporário pelo retorno de `uploadToCloudinary()`; só então persiste
  (`storage.set` + push). Se algum upload necessário falhar, a lesão NÃO é
  gravada (nada parcial) e um toast explica. Imagens temporárias removidas antes
  do Salvar nunca são enviadas.

### Testes

`tests/quiz-images.test.js` ganhou 10 cenários de upload diferido (Ctrl+V/
arquivo não chamam `uploadToCloudinary`; remover antes de Salvar não envia;
Cancelar não envia; Salvar envia só as presentes e substitui pelo retorno;
persistência depois dos uploads; Commons com `deferUpload`; URL externa
inalterada; ausência de `requestCloudinaryAssetDeletion`/`firebase.functions`/
`deleteCloudinaryAsset`/`firebase-functions-compat`; ausência de
`CLOUDINARY_API_SECRET`; ausência de `functions/`). Resultado: **40 PASS, 0 FAIL**.

As âncoras de `tests/critical-flows.test.js` recuaram para 4762/4752/7062/9407
(remoção do script e dos helpers de delete, antes das âncoras). `SEED`,
`REVIEW`, `SRS`, `SESSIONLOG`, a reconciliação V2 e os dados atuais não foram
alterados.

### Quadro de Imagem — também diferido

O construtor de **Quadro de Imagem** (`openCollageBuilder`, compartilhado com o
Quiz) é parametrizável: com `deferUpload=true` (usado pelo formulário Editar E
pelo modal do Quiz), os painéis ficam temporários (blob URL) e o quadro final
vira uma imagem pendente (`{source:'pending', _file, _objectUrl}`) — NENHUM
upload acontece antes de confirmar. Remover o quadro antes de confirmar ou
cancelar não gera nenhum upload; na confirmação o quadro sobe uma única vez,
pelo mesmo pipeline de imagens pendentes.

## Alteração 017 — Quiz de imagens transacional (rascunho + Concluído)

O modal "🖼 Adicionar imagem a esta lesão" (pós-resposta do Quiz) deixou de
alterar `DATA` a cada ação. Agora ele trabalha com um **rascunho local**
(`draftImgs`, cópia das imagens atuais da lesão) enquanto está aberto, e só o
botão **concluído** aplica o rascunho à lesão real.

- **Ctrl+V / selecionar arquivo**: viram imagem temporária
  (`buildPendingImage` → `{source:'pending', _file, _objectUrl}`), exibida na
  hora por blob URL. Nenhum upload.
- **Commons**: `openCommonsImageSearch(..., deferUpload=true)` — baixa e mantém
  temporário, preservando `sourcePage`/`sourceSite`/`license`/`artist`/
  `attribution`/`originalUrl`.
- **Quadro de Imagem**: `openCollageBuilder(..., null, true)` — composição local,
  quadro final temporário.
- **URL externa**: entra no rascunho como `source:'url'` (sem upload) e só é
  associada no concluído.
- **Editar legenda / Remover**: alteram apenas o rascunho.
- **Concluído**: envia ao Cloudinary SOMENTE as temporárias que sobraram
  (`source==='pending' && _file`), uma vez cada, substitui cada temporária pelo
  objeto remoto e só então aplica `lesion.images`, marca `_userUpdatedAt`,
  `saveData()`, atualiza o visualizador (`onImagesAdded()`) e fecha.
- **Esc / clique fora / cancelar**: revogam as blob URLs e descartam o rascunho
  — `DATA` fica intacto e o Quiz continua na mesma questão.
- **Falha de upload**: o modal continua aberto, informa o erro e mantém os
  previews; o que já subiu é substituído no rascunho, então uma nova tentativa
  não reenvia os sucessos. Nada é persistido parcialmente.
- **Imagem já existente**: nunca é reenviada (só `source:'pending'` sobe); sem
  delete remoto.

### Reutilização (sem segundo sistema)

`buildPendingImage(file, trackObjectUrl)` e `uploadPendingImage(img,
lesionMeta)` são helpers compartilhados (usados pelo Editar E pelo Quiz). A
busca do Commons e o construtor de Quadro são os mesmos, apenas parametrizados
por `deferUpload`. O modal mantém sua classe própria
(`.quiz-img-modal-overlay`) e nunca chama `closeOverlay()`.

### Testes

`tests/quiz-images.test.js` cobre os cenários de rascunho do Quiz (Ctrl+V/
arquivo/Commons/Quadro sem upload imediato; remover no rascunho sem upload;
Esc/clique fora sem upload e sem tocar `DATA`; concluído sobe só as temporárias
presentes, uma vez cada, persistindo depois; imagem antiga não reenviada; URL
externa só no concluído; falha de upload não persiste parcialmente; sem tocar
`quizIndex`/`quizStats`/`SESSIONLOG`/`SRS`). Resultado: **56 PASS, 0 FAIL**.

As âncoras de `tests/critical-flows.test.js` passaram para 4780/4770/7080/9440
(helpers compartilhados inseridos antes das quatro âncoras). `SEED`, `REVIEW`,
`SRS`, `SESSIONLOG`, a reconciliação V2 e os dados atuais não foram alterados.

## Alteração 018 — cancelamento manual do pedido de revisão

O usuário pode encerrar um pedido de revisão que não é mais necessário (ex:
corrigiu manualmente, marcou por engano, resolveu fora do fluxo de solução),
SEM apagar nada. Novo status `cancelled`; o pedido continua em
`LESION_REVISIONS` com histórico, tentativas e proposta preservados.

### Função central

`cancelLesionReview(reviewId, reason)` — única porta de entrada. Localiza a
revisão, valida se o status é cancelável, marca `status='cancelled'`,
`cancelledAt`, `cancelledBy='user'` e `cancelReason` (normalizado; `null` se
vazio), registra o evento `cancelled` no histórico, persiste via
`saveLesionRevisions()` e atualiza os badges. NUNCA toca `DATA`, nunca aplica
`proposedChanges`, nunca faz rollback, nunca mexe em SRS/REVIEW/imagens/
ownership. A lógica NÃO fica nos botões.

### Status canceláveis

`CANCELLABLE_REVIEW_STATUSES = ['pending', 'proposed', 'rejected']`. Um pedido
recusado (`rejected`) volta ao 🔔 e também pode ser encerrado (ex: você resolveu
o problema à mão depois de recusar a proposta). Não é possível cancelar
`applied_pending_validation` (tem o fluxo próprio manter/desfazer), `accepted`
ou `cancelled`.

### UI

- Central de Revisões (🔔): botão discreto `✕ Cancelar pedido` para pedidos
  canceláveis, abrindo `openCancelReviewModal()` — mostra lesão, pedido
  original, campo opcional "Motivo do cancelamento", botões `voltar` e
  `Cancelar pedido` (este com `btn-danger`).
- Central de Soluções (💡, aba Propostas): mesmo botão; ao cancelar, o item
  sai imediatamente da aba e o badge 💡 diminui.
- Histórico: quando cancelada, mostra "Status: Cancelado pelo usuário",
  data/hora e motivo (ou "Sem motivo informado").

### Getters/badges

`cancelled` fica naturalmente fora de `getPendingReviews()`,
`getProposedSolutions()`, `getAppliedSolutionsAwaitingValidation()` e
`getReadySolutions()` (os filtros já são por status específico). Os badges
reagem imediatamente (sem F5) e, após F5, a revisão continua cancelada.

### Testes

`tests/lesion-review.test.js` ganhou 13 cenários de cancelamento (pending→
cancelled, proposed→cancelled, applied/accepted/cancelled não canceláveis,
id inexistente, saída das filas ativas, histórico preservado, reload não
reabre, requestText/createdAt/attempts/proposedChanges preservados,
cancelReason/cancelledAt/cancelledBy, badges, e checagem estática de que a UI
só chama a função central). Resultado: **48 PASS, 0 FAIL**. Âncoras de
`tests/critical-flows.test.js` para 4813/4803/7113/9531.

## Alteração 019 — Quiz: editar a lesão no Acervo e pular pergunta

### Editar esta lesão no Acervo (voltar ao mesmo ponto)

Depois de responder, além de "🖼 Adicionar imagem a esta lesão" e "🔔 Marcar
para revisão", há "✏ Editar esta lesão no Acervo". Ele reutiliza o formulário
completo já existente — `openForm(e.id, { preserveUnderlyingOverlay: true,
onSaved })` — sem criar um segundo formulário.

- `openForm(id, opts)` agora aceita `opts.preserveUnderlyingOverlay` e
  `opts.onSaved`. Internamente define `closeForm()`: no modo preservar, remove
  SOMENTE o overlay do formulário (nunca `closeOverlay()`, que apagaria a
  `#study-overlay` por baixo); nos demais casos mantém o comportamento antigo.
- O overlay do formulário recebe a classe `lesion-form-overlay`; o handler do
  carrossel do Quiz ignora ←/→ enquanto `.lesion-form-overlay` existe.
- Salvar ou Cancelar fecha só o formulário e volta para a MESMA questão:
  `quizQueue`, `quizIndex`, `quizStats`, `quizSessionWrongIds`, a resposta e o
  feedback não são tocados. Nada de nova resposta, `srsGradeLevel` ou
  `SESSIONLOG`.
- Após salvar, `onSaved()` reconstrói o detalhe do feedback (nome/tags/notes/
  referência) e recarrega a mídia (`refreshQuizImgs(true)`) sem re-renderizar a
  questão; o rótulo da alternativa correta também é atualizado se o nome mudou.

### Pular pergunta (⏭)

Antes de responder existe "⏭ Pular" (fora do `#quiz-feedback`). Ao pular:
- move a questão ATUAL para o FIM de `quizQueue` (`splice(quizIndex,1)` +
  `push`), sem duplicar;
- NÃO marca resposta, NÃO revela a correta, NÃO toca `quizStats`, `SRS`,
  `SESSIONLOG` nem `quizSessionWrongIds`;
- NÃO incrementa `quizIndex` — logo o progresso (`quizIndex/length`) não
  aumenta indevidamente;
- re-renderiza a próxima questão, trocando o handler do carrossel (não acumula
  listeners).
Se for a última questão ainda não respondida
(`quizQueue.length - quizIndex <= 1`), não mexe na fila: mostra o toast
"Esta é a última questão pendente da sessão." (evita loop infinito). Depois de
responder, o botão some.

### Testes

`tests/quiz-images.test.js` ganhou 9 cenários (edição no Acervo: botão só no
pós-resposta, reutilização do openForm, `preserveUnderlyingOverlay`/`closeForm`,
carrossel ignorando ←/→ com o formulário aberto, atualização do feedback/mídia;
Pular: posição do botão, mover para o fim sem duplicar/avançar, sem tocar
score/SRS/SESSIONLOG, guarda da última questão, sem acúmulo de listeners).
Resultado: **65 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js` para
4815/4805/7115/9551.

### Controles textuais do carrossel

Com 2+ imagens, além das setas laterais, aparece uma linha de controles:
`← Imagem anterior` · `Imagem X de Y` · `Próxima imagem →` (com `aria-label`).
Os botões textuais e as setas laterais usam o MESMO estado (`quizImgIdx`) e a
MESMA `renderMedia()`; navegação circular. Com 0 imagens, CASO TEÓRICO sem
controles; com 1, sem botões. O contador atualiza ao clicar nas setas, nos
botões ou no teclado ←/→. O lightbox continua abrindo só ao clicar na imagem.
Após "Editar esta lesão no Acervo", o índice da imagem é preservado
(`refreshQuizImgs(false, true)`), normalizado ao novo conjunto (nunca fora do
array). Nada de score/SRS/SESSIONLOG é tocado.

## Alteração 020 — Navegação entre questões no Quiz (Anterior/Próxima)

O Quiz ganhou `← Anterior` · `⏭ Pular` · `Próxima →` num bloco de navegação de
QUESTÕES, distinto dos controles de IMAGEM (`← Imagem anterior` / `Próxima
imagem →`, que continuam junto da mídia e no teclado ←/→).

### Estado temporário por questão

`quizQuestionState` (objeto por `lesionId`, SÓ em memória — nunca em
DATA/IndexedDB/Firestore) guarda `visited`, `answered`, `selectedAnswerId`,
`objectiveCorrect`, `grade` e `imgIdx`. `quizHistory`/`quizCursor` formam a
trilha de questões visitadas. `startQuizInsideDashboard` zera tudo e registra a
primeira visita.

### Anterior / Próxima

- **← Anterior**: volta na trilha (`quizCursor--`), restaura a questão e seu
  estado (alternativas bloqueadas, resposta marcada, feedback, ações
  pós-resposta, grade aplicada e índice do carrossel). Desabilitado na primeira
  visitada.
- **Próxima →**: se voltamos, apenas retorna na trilha (`quizCursor++`); na
  fronteira, só avança se a atual já foi respondida — senão mostra "Responda ou
  use Pular para avançar."
- Nenhuma das duas reordena a fila, pontua, altera SRS/SESSIONLOG/
  `quizSessionWrongIds` ou toca DATA.

### Não duplicar contagem

O acerto objetivo é contado UMA vez, ao responder (`st.answered`); o grau de
confiança é contado UMA vez, ao classificar (`applyGrade` com guarda
`if(st.grade) return`). Revisitar uma questão respondida restaura o estado e
NÃO permite responder/classificar de novo — sem duplicar `quizStats`, SRS,
`recordQuizAnswerToday` ou SESSIONLOG.

### Progresso e fim da sessão

O progresso (`pct`) passa a ser `questões respondidas / total`, então navegar ou
pular NÃO aumenta o percentual. O resumo continua aparecendo só quando
`quizIndex` ultrapassa a fila (fim real). Pular mantém o comportamento anterior
(move a atual para o fim, sem pontuar, com a guarda da última pendente).

### Testes

`tests/quiz-images.test.js` ganhou 9 cenários de navegação. Resultado:
**82 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js` para
4821/4811/7121/9557.

## Alteração 021 — Snapshots locais leves e proteção forte de ownership

### Snapshots locais leves (IndexedDB)

`createSafetySnapshot(motivo)` agora grava de verdade — mas SOMENTE para
motivos de RISCO (`SAFETY_SNAPSHOT_RISK_REASONS`): importar backup, restaurar
padrão de fábrica, recuperar dados antigos, fundir duplicatas, aplicar
reconciliação V2, restaurar snapshot e operação em massa de ownership. Qualquer
outro motivo (edição comum, Quiz, marcar revisão, abertura do Atlas, sync) é
IGNORADO — nenhum snapshot a cada clique.

- Guarda o estado ESTRUTURADO: `data` (catálogo + metadados de imagem, com
  `publicId`/`assetId`/`label`/`source`/`sourcePage`/`sourceSite`/`license`/
  `artist`/`attribution`/`originalUrl`/`lesionId`/`lesionName`), `review`, `srs`,
  `sessionLog`, `lesionRevisions`, `sectionOrder`, `siteOrder` e contagens.
- NUNCA copia binários remotos do Cloudinary — a imagem fica só como URL.
- Retenção de **5**: ao criar o 6º, o mais antigo é apagado (escrita
  serializada para evitar corrida).
- Cada snapshot tem `id`, `createdAt`, `reason`, `lesionCount`, `imageCount`,
  tamanho aproximado e `snapshotVersion` (schema 2).
- A lista mostra data/hora, motivo, lesões, imagens, tamanho e schema.
- **Restauração SEMPRE manual** (botão "Snapshots de segurança" nas ferramentas
  avançadas): abre o resumo, exige confirmação forte e, ANTES de sobrescrever,
  cria um snapshot do estado ATUAL (`antes de restaurar snapshot de segurança`).
  Pode excluir um snapshot manualmente. Não sincroniza a nuvem.

### Proteção forte de ownership de imagens

Regra permanente: uma imagem já atribuída a uma lesão NÃO pode perder essa
atribuição por nenhum fluxo AUTOMÁTICO.

- `canChangeImageOwnership(image, newLesionId, context)` — só permite trocar o
  dono quando o dono não muda ou quando `context.manual === true`.
- `assertManualImageOwnershipChange(...)` — bloqueia a mudança automática e
  REGISTRA o conflito (`registerImageOwnershipConflict`), devolvendo a imagem
  inalterada. Nunca resolve em silêncio.
- `detectImageOwnershipConflicts(data)` (read-only) — acha o mesmo asset em 2+
  lesões e imagem cujo `lesionId`/`lesionName` diverge da lesão que a contém.
- **Importação:** `preserveLocalImageOwnershipOnImport(imported, local)` — uma
  imagem que já existia localmente mantém a atribuição local (a lesão dona ainda
  existindo no backup); o conflito é registrado e avisado por toast. O backup
  pode adicionar metadados/imagens novas, mas NÃO troca ownership sozinho.
- Deduplicação/reconciliação só consolidam a MESMA identidade semântica; mover
  imagem para lesão diferente exige ação manual (contexto manual).
- IA futura: pode detectar atribuição possivelmente errada e propor via
  `setReviewSolution`; NÃO pode criar revisão, mover/remover imagem, trocar
  ownership nem aplicar correção automaticamente.

Testes: `tests/snapshots-ownership.test.js` (18 cenários). Resultado:
**18 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js` para
4946/4936/7249/9685.

## Alteração 023 — Ponte segura para IA (manual-assistida) na Central de Revisões

Motivo: os pedidos da Central de Revisões ficavam parados porque não havia um
fluxo prático que produzisse propostas para `setReviewSolution()`. O usuário
criava revisões (status `pending`), mas nada aparecia em 💡 Soluções.

### O que foi implementado (SEM API, SEM segredo, SEM backend)

Na Central de Revisões, cada revisão `pending`/`rejected` ganhou
`🤖 Preparar para IA`, que abre um painel com:

- `📋 Copiar pedido para IA` — gera um texto estruturado (pacote da revisão +
  instruções) para colar em qualquer IA (OpenCode/Claude/DeepSeek).
- `📥 Colar solução da IA` — campo para colar o JSON devolvido pela IA; valida e
  importa como proposta.

Funções (no módulo `LESION_REVISIONS`):

- `buildReviewAiPacket(reviewId)` — pacote SOMENTE daquela revisão: `reviewId`,
  `lesionId`, nome/seção/sítio, `requestText`, campos atuais (`name`, `notes`,
  `classification`, `tags`, `enTerm`), metadados de imagem (SEM blob/binário),
  tentativas anteriores e a allowlist/proibidos. Não altera `DATA` nem status.
- `buildReviewAiPrompt(reviewId)` — texto pronto para a IA, explicando que é uma
  revisão criada manualmente, o problema, os campos permitidos e que ela deve
  devolver SOMENTE o JSON `{reviewId, summary, reasoning, proposedChanges}` e
  não aplicar nada.
- `importReviewAiSolution(reviewId, rawText)` — valida JSON, `reviewId`,
  existência, status que aceita proposta e `proposedChanges` pela allowlist
  existente (`validateProposedChanges`); em sucesso chama `setReviewSolution`
  (status `proposed`, `DATA` intocada); em falha não altera nada.

### Regras de status

- `pending` → pode preparar/importar;
- `rejected` → pode preparar/importar NOVA tentativa (histórico preservado);
- `proposed` → já tem proposta (não duplica);
- `applied_pending_validation`, `accepted`, `cancelled` → bloqueiam.

### Regra permanente da IA (inalterada)

A IA NUNCA cria revisão, marca lesão, aplica correção, autoriza a própria
solução, remove/move imagem, altera ownership nem modifica `DATA`. Ela só recebe
uma revisão JÁ EXISTENTE e devolve uma PROPOSTA; importar a proposta NÃO é
autorizar — o usuário ainda precisa clicar `✓ autorizar correção` e depois
`✓ funcionou — manter` / `↩ não funcionou — desfazer`.

> **SUPERSEDIDO pela Alteração 024:** o clique intermediário
> `✓ autorizar correção` foi REMOVIDO da UX. Importar a solução da IA já aplica
> PROVISORIAMENTE e abre a tela `🔎 Validar correção`, onde o usuário decide
> `✓ Manter correção` (`accepted`) ou `↩ Desfazer correção` (rollback exato).
> A regra permanente acima continua valendo; só a etapa visual de autorização
> deixou de existir.

### Testes

`tests/lesion-review.test.js` ganhou 10 cenários (pacote correto/sem alterar
DATA/sem blob; prompt; import válido → `proposed` e 💡; proibidos `images`/
`lesionId`/reviewId errado; JSON inválido; `proposed` sem duplicata; `rejected`
nova tentativa; bloqueios; e a regra estática de que a ponte não cria revisão
nem mexe em ownership/imagens). Resultado: **61 PASS, 0 FAIL**. Âncoras de
`tests/critical-flows.test.js` para 5014/5004/7317/9800.

## Alteração 024 — Simplificação: importar já aplica provisoriamente (sem "autorizar correção")

Motivo: o fluxo tinha burocracia dupla — importar a proposta **e depois** clicar
`✓ autorizar correção` em 💡 Soluções só para ver o resultado. A decisão humana
importante é **manter** ou **desfazer**, não autorizar duas vezes.

### Novo fluxo (o anterior tinha um clique a mais)

revisão `pending`/`rejected` → `🤖 Preparar para IA` → `📋 Copiar pedido` →
IA devolve JSON → `📥 Colar solução da IA` → `Importar e aplicar correção` →
**aplica PROVISORIAMENTE** (snapshot antes + `applied_pending_validation`) →
abre a tela `🔎 Validar correção` (antes → depois + resumo) →
`✓ Manter correção` (`accepted`) **ou** `↩ Desfazer correção` (rollback exato +
`rejected`, permitindo nova tentativa).

### O que mudou no código

- `importReviewAiSolution()`: após validar tudo (JSON, `reviewId`, status,
  allowlist), chama `setReviewSolution()` e, em seguida,
  `authorizeAndApplyReviewSolution(reviewId, { origin:'import' })` — reusa a
  função auditada que cria o `beforeSnapshot` e escreve só os campos
  permitidos. Em qualquer falha, **nada** é alterado.
- `authorizeAndApplyReviewSolution(reviewId, opts)`: ganhou o parâmetro opcional
  `opts.origin`; com `'import'` registra no histórico que a aplicação provisória
  veio da importação humana (ação explícita de colar/importar). Sem `opts`, o
  comportamento é **idêntico** ao anterior (autorização por clique, mantida para
  o legado).
- Nova `openReviewValidationModal(reviewId, opts)`: tela de validação com
  `👁 ver lesão`, `✓ Manter correção` e `↩ Desfazer correção`; aberta
  automaticamente logo após importar.
- 💡 Soluções: aba principal agora é **Validar correções**
  (`applied_pending_validation`). A aba **Propostas** (`proposed`) só aparece se
  houver propostas LEGADAS — o fluxo atual não deixa nada parado em `proposed`.
- O status `proposed` e `setReviewSolution()` continuam existindo internamente
  (compatibilidade com dados antigos e com o console), mas **não** são mais uma
  etapa visual obrigatória.

### Segurança (preservada)

- Aplicação provisória só ocorre após ação humana explícita de colar/importar o
  JSON **daquela** revisão; a IA nunca cria revisão, nunca marca `accepted`,
  nunca desfaz, nunca toca imagens/ownership.
- `beforeSnapshot` é criado ANTES de qualquer escrita; rollback restaura
  EXATAMENTE o snapshot e volta a `rejected` (nova tentativa permitida).
- Allowlist inalterada: `name`, `notes`, `classification`, `tags`, `enTerm`.
  Proibidos: `images`, ownership (`lesionId`/`lesionName`), IDs, `SRS`,
  `REVIEW`, progresso e campos estruturais.

### Contadores

`🔔` diminui ao importar; `💡` passa a representar a correção aguardando
validação. Não há contador separado para proposta que precise de autorização.

### Testes

`tests/lesion-review.test.js` atualizado (import aplica direto; ausência da
etapa intermediária; snapshot antes; manter → `accepted`; desfazer → rollback
exato + `rejected`; nova tentativa; JSON inválido/campo proibido sem alterar
DATA; images/ownership bloqueados; IA não cria revisão nem marca accepted;
contadores; sem duplicar tentativa). Resultado: **66 PASS, 0 FAIL**.
Âncoras de `tests/critical-flows.test.js`: 5030/5020/7333/9891.

## Alteração 025 — Respostas da IA sem campos aplicáveis: `{}` e ação manual

Motivo: um pedido real de **remoção de imagem** fazia a IA responder
corretamente `"proposedChanges": {}` (porque `images`/ownership são proibidos),
mas o importador rejeitava com "Campos inválidos: só name, notes, classification,
tags, enTerm são aceitos". Isso tratava uma resposta legítima como erro.

### Três resultados válidos da importação

1. **Proposta aplicável** — `proposedChanges` com ao menos um campo permitido →
   aplica PROVISORIAMENTE (`applied_pending_validation`) e abre `🔎 Validar
   correção` (Manter / Desfazer). Sem mudança.
2. **Nenhuma alteração aplicável** — `proposedChanges = {}` e o texto não
   menciona imagem/ownership/estrutura → **não** é erro, **não** altera dados,
   **não** aplica, **não** marca `accepted`. Mostra: "Esta revisão não possui
   alteração aplicável nos campos permitidos." (outcome `no_applicable_changes`).
3. **Ação manual necessária** — `proposedChanges = {}` e o pedido/resumo
   menciona imagem, ownership ou estrutura (ex.: "remover imagem", "mover
   imagem", `lesionId`, "alteração estrutural") → status
   `manual_action_required` (outcome `manual_action_required`). **Não** altera
   dados nem ownership.

### Status `manual_action_required`

- Não conta como `accepted` nem como `applied_pending_validation`;
- não altera `DATA`; permanece no histórico;
- sai da fila de pendentes (não fica "travado") e aparece na aba **Ação manual**
  do 💡 Soluções (que entra no contador 💡);
- pode voltar para a fila normal (`reopenManualActionReview` → `pending`) e
  também pode ser cancelado;
- estados existentes (`pending`, `rejected`, `proposed`,
  `applied_pending_validation`, `accepted`, `cancelled`) preservados.

### Ação manual na UI

Modal/tela com **pedido original**, **resumo da IA**, **motivo** e o botão
`🖼 Abrir lesão para correção manual` (ou `✏` quando não é imagem), que abre o
editor normal da lesão (`openDetail`). **Nada é removido automaticamente** — a
remoção/movimentação de imagem continua dependendo de ação explícita do usuário.

### Importador

`importReviewAiSolution()` agora:
- aceita `proposedChanges = {}` (e `missing`/`null` como vazio);
- valida que é objeto;
- rejeita SOMENTE campo fora da allowlist (ou tipo inválido);
- não rejeita mais objeto vazio como "campos inválidos".

### Segurança (não afrouxada)

Continua proibido: `images`, `lesionId`, `lesionName` estrutural, ownership,
IDs, `SRS`, `REVIEW`, progresso e qualquer campo estrutural. A IA nunca cria
revisão, nunca marca `accepted`, nunca desfaz e nunca toca `DATA` diretamente.

### Testes

`tests/lesion-review.test.js` ganhou cenários para: `{}` aceito sem alterar
DATA; `{}` não vira `applied_pending_validation`; remoção de imagem vira
`manual_action_required`; botão de abrir lesão existe e não remove imagem;
images/ownership ainda proibidos; proposta normal (`notes`/`tags`) continua
aplicando; campo proibido ainda rejeitado; reabrir e cancelar ação manual.
Resultado: **76 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js`:
5113/5103/7416/10088.

## Alteração 026 — Fluxo EM LOTE para revisões pendentes com IA

Motivo: processar revisão por revisão (preparar → copiar → colar → validar) era
trabalhoso. Agora o fluxo principal é em lote: **UM prompt** para várias
revisões e **UM JSON** de volta.

### Fluxo em lote

1 clique `🤖 Analisar pendências com IA` (na Central de Revisões) → seleção
múltipla (checkbox por revisão + "Selecionar todas") → 1 clique
`📋 Copiar lote para IA` → IA externa → 1 clique `📥 Colar respostas da IA` →
1 confirmação `Processar lote`.

### Elegíveis

Somente `pending` e `rejected`. NÃO entram `applied_pending_validation`,
`accepted`, `cancelled` (nem `manual_action_required`). Gerar/copiar o lote
**não** altera status.

### Pacote e prompt

- `getBatchEligibleReviews()` — as pendentes elegíveis.
- `buildReviewAiBatchPacket(reviewIds)` — UM objeto com `reviews[]` (cada item
  igual ao pacote individual: `reviewId`, `lesionId`, `lesionName`, `section`,
  `site`, `requestText`, `currentFields`, metadados de imagem SEM blob,
  `previousAttempts`, `previousSolution`, `allowedFields`, `forbiddenFields`).
- `buildReviewAiBatchPrompt(reviewIds)` — texto único explicando que as revisões
  foram criadas manualmente, que deve analisar cada uma separadamente, não
  inventar mudanças, usar `apply` só nos campos permitidos,
  `manual_action_required` para o que é proibido/estrutural, `no_change` quando
  não houver correção, devolver TODOS os `reviewId` recebidos e responder
  SOMENTE com JSON. Inclui o formato exato e o pacote.

### Tipos de resultado (só estes)

- **apply** — `proposedChanges` só com a allowlist (`name`, `notes`,
  `classification`, `tags`, `enTerm`); válido → cria `beforeSnapshot` próprio,
  aplica PROVISORIAMENTE (`applied_pending_validation`) e aparece em
  💡 Validar correções. NUNCA `accepted`.
- **manual_action_required** — fora da allowlist (imagem, ownership, mover/
  remover imagem, site/seção, `altPlacements`, IDs, estrutural). Não altera
  dados; status `manual_action_required`; vai para a fila **🛠 Ações manuais**.
- **no_change** — nenhuma correção. Não altera dados nem status; guarda
  `lastAiAnalysis` para o usuário decidir (manter pendente / encerrar / cancelar).

### Importação do lote

`importReviewAiBatch(rawText)` valida o JSON geral e `results` (array) e
**processa cada item isoladamente** (`processReviewAiBatchItem`). Um item
inválido (reviewId inexistente, status não elegível, `result` desconhecido,
campo proibido, tipo inválido, reviewId duplicado no mesmo lote) falha **apenas
naquele item** — os válidos continuam. Retorna
`{ ok, summary:{processed, applied, manual, noChange, failed}, items[] }`.
A UI mostra o resumo e permite, por item: `🔎 Validar`, `✏/🖼 Abrir lesão para
correção manual`, `manter pendente`, `✕ Encerrar revisão`, `histórico`.

### Segurança transacional

Cada revisão preserva seu próprio `beforeSnapshot`, histórico, status e
rollback. Não há operação cega no lote. Reimportar o mesmo JSON **não duplica**
aplicação: como o status saiu de `pending/rejected`, o item vira
`not_proposable` e nada é reaplicado; `reviewId` repetido no mesmo lote é
bloqueado por `duplicate_review_id`. A validação final continua item a item
(`✓ Manter correção` / `↩ Desfazer correção`); **não** existe "Aceitar tudo".

### Ações manuais

A aba do 💡 Soluções foi renomeada para **🛠 Ações manuais** (entra no contador
💡). Mostra lesão, pedido original, resumo da IA, motivo e tipo da ação, com
botão `✏ Abrir lesão` / `🖼 Abrir lesão para ajustar imagens` e `↩ Voltar para
revisões`. Nada estrutural é feito automaticamente.

### Compatibilidade

O fluxo individual (`🤖 Preparar para IA`, importação individual, histórico)
continua disponível como fallback.

### Segurança (inalterada)

`images`, `lesionId`, `lesionName` estrutural, ownership, IDs, `SRS`, `REVIEW`,
progresso e campos estruturais continuam proibidos. O lote/IA nunca remove ou
move imagem, nunca troca ownership e nunca toca `DATA` fora da allowlist.

### Testes

`tests/lesion-review.test.js` ganhou 18 cenários do lote (elegíveis, seleção
parcial, pacote múltiplo, prompt, importação múltipla, apply provisório com
snapshot próprio, manual/no_change sem alterar DATA, falha parcial isolada,
reviewId inexistente, campo proibido, images/ownership, reimportação sem
duplicar, duplicado no lote, result inválido, fila de ações manuais, apply
vazio, sem elegíveis, fallback individual). Resultado: **93 PASS, 0 FAIL**.
Âncoras de `tests/critical-flows.test.js`: 5240/5230/7543/10361.

## Alteração 027 — Feedback humano nas próximas tentativas da IA

Motivo: quando o usuário recusava/desfazia uma solução e escrevia o motivo, a
próxima tentativa da IA recebia um pacote praticamente igual ao anterior — sem
o comentário humano — e a IA repetia a mesma solução errada.

### Feedback persistido

`rejectProposedReviewSolution` e `rollbackAppliedReviewSolution` passaram a
guardar o motivo explicitamente na revisão:

- `review.rejectionReason` / `review.rollbackReason`;
- `review.humanFeedback[]` (`{ kind, text, at, attemptId }`, kinds
  `proposal_rejected`, `rollback`, `manual_return`);
- `review.lastHumanFeedback`;
- `attempt.rollbackReason` na tentativa desfeita.

`reopenManualActionReview(reviewId, reasonText)` agora aceita um motivo opcional
(a UI `↩ Devolver para revisões` pergunta) e o registra como feedback. Motivo
vazio NÃO cria entrada. Tudo é salvo via `saveLesionRevisions()` (sobrevive a F5)
e aparece no histórico.

### Pacote individual

`buildReviewAiPacket()` agora inclui:

- `previousAttempts[]` reconstruído por `buildReviewAiAttempts(review)` (read-only)
  a partir do histórico: `attempt`, `summary`, `reasoning`, `proposedChanges`,
  `outcome` (`rejected`/`rolledback`/`accepted`/`applied_pending_validation`/
  `manual_action_required`), `humanFeedback`, `proposedAt`, `appliedAt`,
  `decidedAt`. **Não inclui mais `beforeSnapshot`** (evita enviar cópia da lesão);
- `previousSolution` com `summary`/`reasoning` separados;
- `latestHumanFeedback`, `previousOutcome`, `rejectionReason`, `rollbackReason`.

`setReviewSolution(..., meta)` guarda `summary`/`reasoning` da solução da IA
(usados para reconstruir as tentativas).

### Prompt individual

`buildReviewAiPrompt()` passou a instruir: leia `previousAttempts` e o feedback
humano; NÃO repita solução recusada (`rejected`/`rolledback`); corrija
especificamente o problema apontado; se o que falta estiver fora da allowlist,
responda `proposedChanges: {}` para o Atlas tratar como ação manual/sem alteração.

### Fluxo em lote

Cada item do pacote em lote já carrega `previousAttempts`,
`latestHumanFeedback`, `previousSolution`, `previousOutcome` (por revisão), e o
prompt global ganhou a instrução: "Para revisões com tentativas anteriores, use
OBRIGATORIAMENTE o feedback humano. Não repita uma solução já recusada sem
corrigir o motivo indicado."

### Sem duplicar histórico

Gerar pacote/prompt é 100% read-only: não cria tentativa, não adiciona
histórico, não altera status. Testes garantem isso.

### Segurança (inalterada)

`accepted`/`cancelled` não entram em nova tentativa (pacote bloqueado e fora do
lote). Imagens, ownership, IDs, `SRS`, `REVIEW` e progresso seguem proibidos.

### Testes

`tests/lesion-review.test.js` ganhou 12 cenários (motivo de recusa/rollback
persistido, sobrevive a F5, pacote com humanFeedback/latestHumanFeedback/
previousOutcome, prompt com feedback e "não repetir", previousAttempts em ordem,
gerar pacote read-only, rejected com contexto, lote com feedback por revisão e
instrução global, accepted/cancelled fora, summary/reasoning da importação).
Resultado: **105 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js`:
5346/5336/7649/10479.

## Alteração 028 — Consistência do `latestHumanFeedback` (registros históricos)

Motivo: em revisões históricas (criadas antes do campo direto), o pacote mostrava
`latestHumanFeedback: null` mesmo com `previousAttempts[].humanFeedback`
preenchido (casos reais de recusa e de rollback).

### Correção (somente leitura/normalização)

`buildReviewAiPacket()` passou a derivar `latestHumanFeedback` por
`resolveLatestHumanFeedback(review, attempts)` com prioridade:

1. `review.lastHumanFeedback` (feedback explícito salvo na revisão);
2. o `humanFeedback` **não vazio** da tentativa mais recente que tiver um
   (varre `previousAttempts` de trás para frente);
3. `null` se não houver nada.

Nada é escrito de volta no IndexedDB; a normalização é apenas de leitura. Como
`buildReviewAiBatchPacket()` usa `buildReviewAiPacket()`, o lote herda o mesmo
valor automaticamente.

### Texto legado

`buildReviewAiAttempts()` agora preserva `text` (o texto original da proposta)
em cada tentativa. Registros antigos com `summary`/`reasoning` vazios continuam
com eles vazios — **não se fabrica** summary/reasoning — mas a IA ainda recebe o
texto da tentativa anterior (`previousAttempts[].text` e `previousSolution.text`).

### Testes

`tests/lesion-review.test.js` ganhou 9 cenários (derivação com campo direto
ausente, rollback histórico, múltiplas tentativas, tentativa recente sem
feedback caindo no anterior, prioridade do campo direto, nenhuma informação →
`null`, lote herdando, read-only sem gravar, e texto legado preservado sem
inventar summary). Resultado: **114 PASS, 0 FAIL**. Âncoras de
`tests/critical-flows.test.js`: 5364/5354/7667/10497.

## Alteração 029 — Fluxo híbrido para localizações adicionais sugeridas pela IA

Motivo: revisões como "também deve aparecer em Neurorradiologia"
(Holoprosencefalia, Agenesia do corpo caloso) ficavam em `manual_action_required`
sem um caminho prático — o usuário teria que abrir o editor e montar tudo à mão.

### Sugestão estruturada da IA

Para `manual_action_required` de localização adicional, a IA pode responder:

```json
{
  "reviewId": "...", "result": "manual_action_required",
  "summary": "...", "reasoning": "...",
  "manualAction": {
    "type": "additional_section_placement",
    "description": "...",
    "suggestedPlacement": { "section": "Neurorradiologia", "site": null }
  },
  "proposedChanges": {}
}
```

`site` pode ser `null` (a aplicação pede o sítio na confirmação).

### Validação (sem alterar DATA)

`validateReviewAiPlacement()` confere contra as seções/sítios que EXISTEM no
Atlas (derivados do próprio `DATA`, incluindo altPlacements): seção inexistente
→ `unknown_section`; sítio informado inexistente → `unknown_site`. A sugestão é
guardada em `review.manualAction` e nada em `DATA` muda. Vale para o fluxo em
lote e para o individual.

### Aplicar com 1 clique + confirmação humana

Na aba **🛠 Ações manuais** (e no modal de ação manual), quando o tipo é
`additional_section_placement`:

- mostra "Sugestão da IA: {principal} → também em {section}";
- botão principal `✓ Aplicar localização sugerida`;
- botão secundário `✏ Abrir lesão` (ou `🖼 Abrir lesão para ajustar imagens`).

O botão abre uma confirmação ("Adicionar esta lesão também em X? A localização
principal será preservada."). Só após confirmar, `applyReviewAiSuggestedPlacement()`
roda. Se a sugestão não tiver sítio, a confirmação inclui um seletor de sítio.

### O que a aplicação faz

- guarda `beforeSnapshot`/`beforeAltPlacements` ANTES de escrever;
- acrescenta `{ s, site }` ao `altPlacements` da MESMA lesão (campo existente —
  sem estrutura paralela);
- preserva `s`/`site` principal, `id`, `lesionId`, imagens e ownership;
- não cria novo registro (contagem global/Quiz/busca inalterados);
- `saveData()` + `saveLesionRevisions()`;
- status vai para `applied_pending_validation` (NUNCA `accepted` automático) e a
  lesão aparece em 💡 Validar correções com `✓ Manter correção` /
  `↩ Desfazer correção`.

### Rollback / manter

`↩ Desfazer correção` restaura EXATAMENTE o `beforeSnapshot` (altPlacements
anteriores), sem afetar seção principal, imagens, ownership, notes/tags, SRS ou
REVIEW, e volta a `rejected` (permite nova tentativa). `✓ Manter correção` →
`accepted` e registra no histórico (`placement_applied`).

### Editor manual

O editor ganhou **"Também aparece em"** com `[+ Adicionar localização]`
(seção + sítio, com dedupe), para correções manuais futuras. Para revisões com
sugestão, o usuário NÃO precisa usá-lo.

### Outros tipos de ação manual

O botão de 1 clique vale SOMENTE para `additional_section_placement`. Para
`image_removal`, ownership e outras mudanças estruturais, continua exigindo
editor/ação manual normal (testado: `applyReviewAiSuggestedPlacement` recusa com
`not_placement_action`).

### Testes

`tests/lesion-review.test.js` ganhou 13 cenários (sugestão armazenada sem alterar
DATA, site null, seção/sítio inexistentes rejeitados, fluxo individual, aplicar
cria altPlacement sem duplicar id/imagem/ownership/contagem, image_removal sem
autoaplicação, already_placed/already_primary, rollback exato, manter → accepted
+ F5, e UI do botão/confirmação/editor). Resultado: **127 PASS, 0 FAIL**.
Âncoras de `tests/critical-flows.test.js`: 5498/5488/7801/10757.

## Alteração 030 — Robustez do importador do lote (normalização da moldura + diagnóstico)

Motivo: no reteste, a resposta da IA começava com `{"results":[` e mesmo assim
aparecia "JSON inválido — confira o texto colado". A causa não pôde ser
confirmada porque o conteúdo completo não estava disponível (a solicitação veio
truncada), então o foco foi eliminar as fragilidades reais do caminho de parse,
sem afrouxar a validação semântica.

### O que foi inspecionado

Handler de `📥 Colar respostas da IA`, a textarea `#batch-json`,
`importReviewAiBatch(rawText)`, o `JSON.parse`, o `trim`, o `copyTextToClipboard`
e a mensagem de erro. O botão de colar apenas revela a textarea e dá foco — não
lê o clipboard nem valida enquanto digita; a validação acontece só em
`Processar lote`.

### Normalização segura (somente a moldura)

`normalizeReviewAiBatchJson(rawText)`:
1. `String(rawText == null ? '' : rawText)`;
2. `trim()`;
3. remove BOM (`\uFEFF`) e zero-width (`\u200B`–`\u200D`, `\u2060`) **somente nas
   bordas**;
4. aceita resposta envolvida em code fence ```json … ``` (ou ``` … ```), com ou
   sem `\r`.

`parseReviewAiBatchJson(rawText)` usa essa normalização e então `JSON.parse`.
**NÃO** faz correção de vírgula/aspas, **NÃO** recorta "do primeiro `{` ao último
`}`", **NÃO** completa documento truncado e **NÃO** remove invisíveis internos —
o conteúdo interno é preservado byte a byte.

### Diagnóstico sem vazar conteúdo

Em falha, o retorno é `{ ok:false, reason:'invalid_json', parseError:{ kind,
position, line, column } }`, derivado apenas de `error.message` (posição/linha/
coluna) — a mensagem bruta e o texto colado **nunca** são registrados nem
devolvidos. `formatReviewAiBatchParseError` produz uma orientação genérica
(`empty`, `invalid_fence`, `incomplete`, `syntax`). A UI passou a distinguir
"não foi possível interpretar o JSON" de "JSON lido, mas o formato do lote é
inválido".

### Validação semântica intacta

Nada foi afrouxado: campos proibidos, `result` desconhecido, reviewId
inexistente/duplicado e `proposedChanges` inválido continuam falhando — por item,
sem bloquear os demais. Nenhuma API, segredo ou caminho de rede foi adicionado.

### Testes

`tests/lesion-review.test.js` ganhou 7 cenários: moldura com BOM/zero-width/code
fence (inclusive `\r` e invisíveis ao redor), diagnóstico de posição sem expor o
conteúdo, truncado/vazio, conteúdo interno preservado, ausência de recorte "do
primeiro `{` ao último `}`", campo proibido ainda rejeitado dentro da moldura e
lote válido em fence processado normalmente. Resultado: **134 PASS, 0 FAIL**.
Âncoras de `tests/critical-flows.test.js`: 5545/5535/7848/10804.

> Observação: a solicitação chegou truncada no item de normalização; foram
> implementados os passos visíveis (String, trim, BOM, zero-width nas bordas,
> code fence). Se houver etapas adicionais pretendidas (ex.: outros invólucros
> de markdown), confirmar antes de ampliar.

## Alteração 031 — Correção visual da linha de ações da Central de Soluções

Motivo: no reteste real, o card da aba **🛠 Ações manuais** (ex.: "Teratoma
cístico maduro") quebrava o layout: os botões `Abrir lesão para ajustar
imagens` / `histórico` / `Voltar para revisões` / `Cancelar pedido`
ultrapassavam a largura, aparecia scrollbar horizontal e o último botão ficava
cortado.

### Causa visual

- `.review-center-row-actions` tinha `flex-shrink:0` — o bloco de botões não
  encolhia e podia exceder a largura do card/modal.
- `.review-center-row-main` tinha `min-width:220px` — o bloco de texto não
  encolhia abaixo disso, somando-se ao problema em modal estreito.
- Textos (`title`, `meta`, `request`, `solution`) sem `overflow-wrap`, e o
  `.review-center-modal` sem controle de overflow horizontal.

### Card

`.review-center-row` ganhou `width:100%; max-width:100%; min-width:0;
box-sizing:border-box` (o `box-sizing` já era global, mantido explícito).
`.review-center-row-main` passou a `flex:1 1 240px; min-width:0` — o texto pode
encolher e quebrar. `title`, `meta`, `request` e `solution` receberam
`overflow-wrap:anywhere; word-break:break-word` (a `meta` é monoespaçada e
tinha risco de string longa sem quebra).

### Botões

`.review-center-row-actions` virou `flex:1 1 auto; min-width:0; flex-wrap:wrap`
(sem `flex-shrink:0`, sem `nowrap`). `.review-center-row-actions .btn` recebeu
`max-width:100%; white-space:normal; overflow-wrap:anywhere` — o botão longo
(`Abrir lesão para ajustar imagens`) pode ir para linha própria e quebrar; os
demais quebram para as linhas seguintes, sem cortar `Cancelar pedido`,
`Voltar para revisões` ou `histórico`.

### Overflow horizontal

Corrigido primeiro nos filhos; depois `.review-center-modal` (e
`.review-history-modal`) receberam `overflow-x:hidden`, mantendo
`overflow-y:auto` (scroll vertical normal).

### Outras telas

A correção é nas classes COMPARTILHADAS `.review-center-row*`, usadas por
Revisões, Validar correções, Ações manuais, resultado do lote e histórico —
todas se beneficiam sem redesenho. `.review-tabs` ganhou `flex-wrap:wrap` (as
3 abas podem quebrar em tela estreita). Nenhuma lógica, status,
`manual_action_required`, `altPlacements`, ownership, `DATA` ou snapshot foi
alterado.

### Testes

`tests/lesion-review.test.js` ganhou 4 testes estáticos de layout (card com
`max-width:100%`/`min-width:0`/`flex-wrap`; ações com `flex-wrap` e sem
`flex-shrink:0`/`nowrap`; botões com `max-width:100%`/`white-space:normal`;
textos com `overflow-wrap:anywhere`; modal com `overflow-x:hidden` e
`overflow-y:auto`; abas com wrap; e presença dos botões). Resultado:
**138 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js`:
5548/5538/7851/10807.

> Sem suíte de layout visual no projeto (sem jsdom); a confirmação de que o
> card ficou bem em telas largas/estreitas depende de reteste manual no
> navegador.

## Alteração 032 — Preview local do quadro de imagens no Quiz (pending)

Motivo: no reteste, um quadro criado no Quiz aparecia como "⏳ não enviada", mas
a miniatura ficava vazia, o "Clique para ampliar" não mostrava nada e só depois
de "concluído" (upload) a imagem funcionava — parecendo que a criação falhou.

### Causa real

O produtor do quadro (`openCollageBuilder`, ramo `deferUpload=true`) devolvia
`{label, panels, source:'pending', _file, _objectUrl}` — **sem `data`**. Todos os
outros produtores pending (`buildPendingImage` para Ctrl+V/arquivo, e o Commons
com `deferUpload`) devolvem `data` = a mesma blob URL. Como o renderer da
galeria e o `openImageLightbox` leem `img.data`, o quadro pending caía em
`src="undefined"` (miniatura quebrada e lightbox vazio). O editor tinha o mesmo
defeito latente no "criar quadro".

### Correção (sem upload antecipado)

- `openCollageBuilder` (ramo `deferUpload`): o objeto devolvido agora inclui
  `data:objectUrl` (a MESMA blob URL de `_objectUrl`) — mesmo padrão funcional
  de `buildPendingImage`. `_file` continua sendo o File local para o upload no
  "concluído".
- Renderer do modal do Quiz: `const src = img.data || img._objectUrl || ''`,
  usada tanto na miniatura quanto no `openImageLightbox(src)`. Enquanto pending,
  o preview é LOCAL; nunca se tenta URL remota/`publicId` inexistente.

### Ciclo de vida do object URL (inalterado e preservado)

- Não é revogado ao salvar o quadro, ao fechar só o construtor, ao rerenderizar
  a galeria, ao editar a legenda nem ao navegar entre previews.
- É revogado ao remover o item pending, ao cancelar/fechar o modal, e só DEPOIS
  do upload dar certo no "concluído" (substituindo o pending pelo remoto).

### Regra de upload tardio (NÃO regrediu)

Quadro no Quiz permanece local/pending; **zero upload ao Cloudinary** antes de
"concluído"; cancelar = zero upload; só as pendings ainda presentes ao
"concluído" sobem, uma vez cada; falha de upload mantém o modal aberto com o
preview local funcionando e não persiste a lesão parcialmente. `DATA` só muda no
"concluído".

### Testes

`tests/quiz-images.test.js` ganhou 12 testes (quadro pending com `data` local;
miniatura usando `data || _objectUrl`; lightbox com a mesma src; callback sem
upload; rerender não revoga; editar legenda não revoga/upload; remover revoga
sem upload; concluído faz upload→revoga→substitui; falha mantém preview e não
persiste; `DATA` só muda no concluído; cancelar revoga sem persistir; Ctrl+V
segue usando o mesmo pending). Resultado: **98 PASS, 0 FAIL**. Âncoras de
`tests/critical-flows.test.js`: 5548/5538/7851/10810.

## Alteração 033 — Contador + navegação no canto superior esquerdo do carrossel do Quiz

Motivo: com 2+ imagens, o usuário via só as setas laterais e precisava deduzir
quantas imagens havia e qual estava vendo.

### Overlay superior

Quando a questão tem 2+ imagens, aparece sobre a área da imagem (canto superior
esquerdo) um painel compacto:

```
‹  1 / 2  ›
```

- seta anterior (`‹`), índice atual, total, seta próxima (`›`);
- fundo semitransparente compatível com o tema, texto legível, compacto;
- `position:absolute` dentro de `.quiz-carousel` (que já é `position:relative`),
  `top:8px;left:8px`, `max-width:calc(100% - 16px);box-sizing:border-box` — não
  estoura a largura nem cria scrollbar horizontal.

### Regras visuais

- 0 imagens → continua CASO TEÓRICO, sem controle.
- 1 imagem → sem contador e sem setas do overlay.
- 2+ imagens → overlay `‹ n / total ›`.

### Um único estado (sem duplicar navegação)

As setas do overlay usam EXATAMENTE o mesmo `quizImgIdx` e chamam as MESMAS
funções `goPrev`/`goNext` das setas laterais — nenhuma lógica nova de navegação,
navegação circular preservada (o wrap acontece no início do próximo
`renderMedia()`). As setas laterais grandes continuam (alvos grandes de clique).

O contador inferior textual antigo (`quiz-carousel-controls` com
`← Imagem anterior` / `Imagem X de Y` / `Próxima imagem →`) foi REMOVIDO para
não haver três conjuntos de navegação; o contador principal agora é o overlay
superior. O CSS morto correspondente foi removido.

### Teclado

`ArrowLeft`/`ArrowRight` continuam controlando `quizImgIdx` e continuam sendo
ignorados com editor de lesão, modal de imagem, lightbox ou
input/textarea/contenteditable ativos.

### Atualização / refresh

Como o overlay é reconstruído a cada `renderMedia()` a partir de
`quizImgIdx`/`quizImgs`, ele atualiza imediatamente em qualquer troca (seta
superior, seta lateral, teclado, voltar para questão respondida, edição da
lesão, refresh das imagens). `refreshQuizImgs(..., keepIndex)` preserva o índice
quando possível e normaliza (`Math.min(Math.max(keepIdx,0), all.length-1)`)
quando o total muda (ex.: 2 → 3 imagens vira 1/3, 2/3…).

### Acessibilidade

`aria-label="Imagem anterior"` / `aria-label="Próxima imagem"` nas setas do
overlay; o contador tem `aria-live="polite"` e
`aria-label="Imagem N de total"`.

### Não alterado

Lógica de questões, score, SRS, SESSIONLOG, Anterior/Próxima questão, Pular,
edição da lesão, upload Cloudinary, Revisões/Soluções, snapshots, ownership e
`altPlacements` — nada disso foi tocado.

### Testes

`tests/quiz-images.test.js` atualizado/adicionado: 2+ mostra o overlay com
`‹ n / total ›`; 0/1 imagem sem overlay; contador dinâmico e índice único;
setas laterais e do overlay no mesmo `quizImgIdx`; navegação circular; teclado;
refresh normaliza o índice; aria-labels; CSS absoluto no canto superior esquerdo
sem estourar largura; ausência do contador inferior antigo. Resultado:
**101 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js`:
5549/5539/7852/10811.

## Alteração 034 — Auditoria + sincronização explícita localhost ↔ site publicado

Motivo: o localhost tinha mais imagens/associações do que o site publicado, e
era preciso sincronizar com segurança. Localhost e GitHub Pages têm **origens
diferentes**, logo **IndexedDB separados**; o elo entre eles é o **Firestore**
(mesmo projeto `atlas-radiologico`).

### Auditoria do fluxo atual (o que já existia)

- **Envio local → nuvem:** `saveData()` (chamado por edições, import e
  migrações) → `pushToFirebaseNow()` → `writeShardedStateSerialized()` →
  `writeShardedState()` grava `DATA` em pedaços + `REVIEW`/`SRS`/`SESSIONLOG`/
  `sectionOrder`/`siteOrder` no documento principal. Havia também
  `forceThisDeviceToCloud()` (envio manual completo), mas o botão tinha sido
  removido da UI.
- **Recebimento nuvem → local:** `syncFromFirebase()` faz merge **não
  destrutivo por id** (`mergeEntryNonDestructive`, `mergeReviewPreservingProgress`,
  `mergeSRSPreservingNewest`), cria snapshots antes/depois e persiste. Mas a
  chamada **automática no boot foi DESATIVADA de propósito** (Alteração 008) —
  ela reintroduzia registros que a reconciliação V2 já havia consolidado. Hoje
  `syncFromFirebase()` só roda em ações EXPLÍCITAS (exportar backup e restaurar
  padrão de fábrica).
- **Consequência:** o site publicado **não** recebe mudanças do localhost
  automaticamente; só veria via uma ação explícita de pull ou via backup.
- **Cloudinary:** as imagens já estão na nuvem; a sincronização só precisa de
  metadados/URLs. Nenhum binário é reenviado (só imagens locais legadas
  `data:image/` sob `atlas:img:` são migradas, por `migrateLegacyLocalImagesToCloudinary`).
- **`LESION_REVISIONS` (revisões) é LOCAL por dispositivo** — não é gravada no
  Firestore. Para movê-la entre dispositivos, o caminho é o **backup**.

### O que foi implementado

1. `syncAuditCounters(data, revisions, review, srs)` — contadores puros (lesões,
   registros com imagens, total de imagens, `altPlacements`, SRS, revisões).
2. `buildSyncAudit()` — comparação **100% read-only** local × nuvem (nunca
   grava local nem remoto), com `divergent` e `cloudError`.
3. `syncThisDeviceToCloud()` — envia o estado DESTE dispositivo para a nuvem:
   cria snapshot ANTES, migra só imagens locais legadas, persiste local e chama
   `writeShardedStateSerialized`. **Nunca** faz pull de volta e **não toca
   ownership**. `forceThisDeviceToCloud()` (interno/console) agora só confirma e
   chama essa função.
4. Botões explícitos na barra lateral:
   - `☁ sincronizar este dispositivo` → modal com a auditoria + confirmação →
     snapshot → push → sucesso. Descrição: "envia o estado deste dispositivo
     para a nuvem — use quando este dispositivo contém a versão correta".
   - `⬇ atualizar deste backup/nuvem` → modal com a auditoria + confirmação →
     snapshot → `syncFromFirebase()` (merge não destrutivo). **Ação explícita**,
     nunca automática no boot/F5/login.
5. `openUpdateFromCloudModal()` NÃO reativa o comportamento antigo automático —
   é um clique consciente do usuário.

### Respostas às perguntas da auditoria

1. **Como o localhost envia para o Firestore?** Via `saveData`/`pushToFirebaseNow`
   (automático a cada edição) e, agora, pelo botão explícito de sincronização.
2. **Como o site publicado recebe?** Hoje NÃO recebe automaticamente; passa a
   poder receber pelo botão `⬇ atualizar deste backup/nuvem` (explícito) ou pelo
   backup.
3. **O site publica faz pull automático?** Não — desativado no boot (Alteração 008).
4. **Risco de estado antigo sobrescrever novo?** Sim, no push automático de um
   dispositivo desatualizado. Mitigado por: snapshot antes do push explícito,
   confirmação humana e a auditoria que mostra os contadores. Não houve mudança
   na política de push automático do dia a dia.
5. **Cloudinary precisa de upload?** Não — só metadados/URLs. Sem reenvio de
   binários (exceto imagens locais legadas).
6. **Método mais seguro hoje?** (a) backup export/import entre origens; (b) botão
   explícito `☁ sincronizar este dispositivo` (local→nuvem, com snapshot) e, no
   outro dispositivo, `⬇ atualizar deste backup/nuvem` (nuvem→local, explícito).

### Backup como fallback oficial

`Salvar backup` (localhost) → `Importar backup` (site publicado). O backup
inclui `data` (DATA com metadados/URLs de imagem), `review`, `srs`, `sessionLog`,
`sectionOrder`, `siteOrder` e `lesionRevisions`; a importação cria snapshot,
preserva ownership local e não embute binários do Cloudinary. É o caminho mais
seguro para mover também as **revisões**.

### Não alterado

Ownership, snapshots, Revisões/Soluções, `altPlacements`, parser JSON e a
política de push automático existente. Nenhum pull automático foi reativado.

### Testes

`tests/snapshots-ownership.test.js` ganhou 12 testes (contadores puros;
`buildSyncAudit` read-only; divergência detectada dinamicamente; sem divergência
quando iguais; Firebase indisponível; snapshot antes do push; push não altera
ownership nem puxa de volta; `writeShardedState` envia DATA sem upload;
Cloudinary não reenvia existentes; UI dos dois botões; pull explícito com
snapshot; boot sem sync automático; backup com as estruturas e sem binários).
Resultado: **30 PASS, 0 FAIL**. `tests/critical-flows.test.js` atualizado: o
teste da Alteração 008 agora aceita 3 call sites EXPLÍCITOS de
`syncFromFirebase()` (export, factory reset, "atualizar deste backup/nuvem"),
continuando a proibir qualquer chamada automática no boot. Âncoras:
5735/5725/8038/10999.

## Alteração 035 — Push local→nuvem agora VERIFICA o servidor (pós-envio)

Motivo: no reteste, o usuário clicou em "Enviar este dispositivo para a nuvem" e
a nuvem continuou com contadores antigos (imagens 51/61 e SRS 31, enquanto o
local tinha 53/66 e SRS 40). O SRS divergir mostra que **não é um problema de
Cloudinary/imagens** — o estado remoto inteiro não estava sendo confirmado.

### Causa real

O push (`syncThisDeviceToCloud`) confiava apenas na promessa de
`writeShardedStateSerialized` para declarar sucesso e **não relia o servidor**
depois. A auditoria também carregava os contadores da nuvem **uma vez** (ao
abrir o modal) e não os atualizava após o envio. Assim, qualquer falha de
gravação/ack (regras, rede, timeout) ou uma leitura antiga podia deixar a
impressão de "sincronizado" mesmo com o servidor diferente. O site publicado,
além disso, não faz pull automático (Alteração 008) — então continuar mostrando
os números antigos é esperado até um pull explícito.

### Correção

- `readCloudAuditFromServer()`: lê a nuvem **direto do servidor**
  (`readShardedState` já usa `get({source:'server'})`) e calcula os mesmos
  contadores da auditoria.
- `syncCountersMatch(local, server)`: compara lesões, registros com imagens,
  total de imagens, `altPlacements` e SRS.
- `syncThisDeviceToCloud(opts)` agora: cria snapshot → prepara estado → envia →
  **relê o servidor** → **só retorna `ok:true` se os contadores baterem**. Em
  divergência, retorna `{ ok:false, reason:'verification_mismatch', local,
  server }` e mostra: "Envio concluído, mas a verificação do servidor não
  corresponde ao estado local." — **sem** pull e **sem** alterar o local. A UI
  exibe a tabela Local enviado × Servidor.
- `openSyncDeviceToCloudModal()` mostra as 5 etapas reais (1 criando snapshot,
  2 preparando estado, 3 enviando, 4 verificando no servidor, 5 confirmada),
  ganhou `🔄 ler servidor de novo` e, ao confirmar, atualiza a coluna Nuvem com
  a leitura pós-escrita (não reutiliza os números antigos).
- `openUpdateFromCloudModal()` também ganhou `🔄 ler servidor de novo`.

### Paths (write = read)

`writeShardedState` e `readShardedState` usam os MESMOS caminhos:
`atlas_state/main` (meta: review/srs/sessionLog/sectionOrder/siteOrder +
`chunkCount`) e `atlas_state/data_chunk_<i>` (pedaços). O meta é escrito antes
dos pedaços e a leitura usa `meta.chunkCount`. Sem namespace divergente.

### Segurança (inalterada)

Nenhum pull automático (boot continua sem `syncFromFirebase`); nenhum ownership
alterado; Cloudinary só recebe imagens locais legadas (sem reenvio de imagens já
remotas); `LESION_REVISIONS` continua local por dispositivo.

### Testes

`tests/snapshots-ownership.test.js` ganhou 8 cenários (push aguarda a escrita e
relê o servidor; erro de escrita não vira sucesso; só confirma se local ==
servidor; `syncCountersMatch` dinâmico detecta divergência de imagens/SRS/
lesões; push não puxa/ownership; leitura pós-envio força servidor; auditoria
relê sem reutilizar; paths de write/read coerentes). Resultado: **38 PASS,
0 FAIL**. Âncoras de `tests/critical-flows.test.js`: 5824/5814/8127/11088.

## Alteração 036 — Preferências locais de navegação (última seção/site na sidebar e no Quiz)

Motivo: após F5, o Atlas não lembrava a última seção/site escolhidos.

### Onde ficam (local por navegador/origem)

`localStorage`, com chaves versionadas e **independentes**:

- `atlas:v1:lastSidebarScope` → `{ section, site }` da sidebar;
- `atlas:v1:lastQuizScope` → `{ section, site }` do Quiz.

**Nunca** usa Firebase/Firestore/IndexedDB/sync/backup/`DATA`. Localhost e GitHub
Pages podem ter preferências diferentes (origens diferentes).

### Sidebar

`scope` (estado já existente) é gravado por `saveSidebarScopePref()` **somente
em mudança manual**: "Todas as seções", clique numa seção, clique num sítio e
"limpar filtros". No boot, `loadData()` faz `scope = loadSidebarScopePref()`.

### Quiz

O Quiz ganhou `quizScope` próprio (independente do `scope` da sidebar):

- clicar numa área em "Domínio do conteúdo" define
  `quizScope={section, site:null}` e grava;
- a "Sessão personalizada" ganhou seletores de **Seção do Quiz** e **Sítio**
  (opcional) que atualizam `quizScope` e gravam na chave própria;
- a "Seleção do Quiz" da sessão personalizada usa `quizScopeEntries()` (não mais
  a seleção da sidebar).
- No boot, `quizScope = loadQuizScopePref()`.

### Validação e fallback

`validateScopePref()` confere contra as seções/sites EXISTENTES (derivados do
`DATA`):

- `section` inexistente → ignora a preferência inteira (volta ao padrão);
- `section` válida + `site` inexistente → mantém a seção e zera o site;
- nunca cria seção/site inexistente.

`readScopePref`/`writeScopePref` usam `try/catch`: JSON inválido, valor
inesperado ou `localStorage` indisponível são ignorados sem erro visível, e o
boot segue no padrão.

### Não sobrescreve por acidente

As preferências só são gravadas em ação manual de navegação. Render, F5, sync,
importação de backup, refresh interno, abertura de modal, retorno de edição e
restauração de questão **não** chamam `saveSidebarScopePref`/`saveQuizScopePref`.

### Independência

Alterar o Quiz não muda a sidebar e vice-versa (chaves e estados separados).
Ex.: sidebar em `Neurorradiologia → Região selar` e Quiz em `Tórax → Pulmão`
continuam assim após F5.

### Testes

Novo `tests/local-scope-prefs.test.js` (**14 PASS**): chaves versionadas
independentes; salvar/restaurar sidebar e Quiz; independência; seção inexistente
ignorada; site inexistente com fallback; JSON inválido; `localStorage`
indisponível; ausência de Firebase/IndexedDB/`DATA`; gravação só em mudança
manual; import/sync não sobrescrevem; gravação nos handlers manuais da sidebar e
nos seletores do Quiz; seleção do Quiz usando `quizScope`. Âncoras de
`tests/critical-flows.test.js`: 5869/5859/8172/11141.

## Alteração 037 — Limpeza visual da sidebar (ações técnicas fora da UI)

Motivo: o bloco de manutenção ocupava muito espaço vertical e forçava scrollbar
na lista de seções.

> **CORRIGIDO pela Alteração 038:** os controles NÃO foram removidos da UI. Eles
> foram **recolhidos no bloco `⚙ Ferramentas avançadas`**, fechado por padrão.
> Ver a Alteração 038.

### Controles técnicos (na 037, movidos para "Ferramentas avançadas")

- `☁ sincronizar este dispositivo`
- `⬇ atualizar deste backup/nuvem`
- `🩺 diagnóstico do sistema`
- `🔍 auditar vínculo de imagens`

### O que continua sempre visível na sidebar

- `☁ configurar Cloudinary`
- `💾 Salvar backup`
- `📂 Importar backup`

### Funções internas preservadas

Nenhuma lógica foi apagada. Continuam no código e acessíveis (botão dentro do
bloco e/ou console): `syncThisDeviceToCloud`, `openSyncDeviceToCloudModal`,
`openUpdateFromCloudModal`, `openSystemDiagnosticModal`,
`openImageAuditModal`, `forceThisDeviceToCloud` e as demais ferramentas
técnicas.

### Não alterado

Sync, snapshots, ownership, auditoria, backup e a lista de seções — nada disso
mudou. Só a presença dos controles na UI normal.

### Testes

`tests/tools-layout.test.js` atualizado: os 4 controles não existem mais no
HTML/sidebar; Cloudinary/Salvar/Importar continuam visíveis; as funções internas
(`syncThisDeviceToCloud`, `openSyncDeviceToCloudModal`,
`openUpdateFromCloudModal`, `openSystemDiagnosticModal`,
`openImageAuditModal`) continuam definidas. `tests/snapshots-ownership.test.js`
ajustado para confirmar que o fluxo de sync continua interno (sem os botões).
Âncoras de `tests/critical-flows.test.js`: 5866/5856/8169/11138.

## Alteração 038 — Correção: ações técnicas recolhidas em "⚙ Ferramentas avançadas"

**Correção da Alteração 037.** Os controles técnicos NÃO foram removidos da UI:
eles foram recolhidos num bloco **`⚙ Ferramentas avançadas`**, **fechado por
padrão**, para preservar espaço vertical na sidebar.

### Bloco recolhível

- Fechado (padrão): apenas a linha `▸ ⚙ Ferramentas avançadas`.
- Aberto: `▾ ⚙ Ferramentas avançadas` e, dentro, os 4 controles:
  `☁ sincronizar este dispositivo`, `⬇ atualizar deste backup/nuvem`,
  `🩺 diagnóstico do sistema`, `🔍 auditar vínculo de imagens`.
- Alterna ao clique; não persiste em localStorage (sempre fecha ao recarregar).

### Fora do bloco (sempre visível)

`☁ configurar Cloudinary`, `💾 Salvar backup`, `📂 Importar backup`.

### Handlers

Restaurados e ligados às funções internas já existentes (sem duplicar lógica):
`openSyncDeviceToCloudModal`, `openUpdateFromCloudModal`,
`openSystemDiagnosticModal`, `openImageAuditModal`. O toggle é
`initAdvancedToolsToggle()` (aria-expanded + indicador ▸/▾).

### Layout

Bloco aberto compacto (coluna com gap pequeno, indentação discreta), sem overflow
horizontal, sem altura fixa e sem scroll próprio; fechado ocupa só uma linha.

### Não alterado

Sync, Firestore, snapshots, ownership, auditoria, Cloudinary, backup, Quiz,
localStorage de escopo e `DATA` — apenas reorganização visual/handlers.

### Testes

`tests/tools-layout.test.js` (11 PASS): bloco presente; 4 controles dentro do
bloco; começa fechado; clique alterna (abre/fecha) com ▸/▾; handlers corretos;
Cloudinary/Salvar/Importar fora do bloco; funções internas intactas.
`tests/snapshots-ownership.test.js` (38 PASS) volta a exigir os controles
existentes. Âncoras de `tests/critical-flows.test.js`: 5874/5864/8177/11164.

## Alteração 039 — Integridade de `classification` (C-RADS espalhada por id posicional)

Motivo: lesões de Medicina Fetal (ex.: Rim policístico infantil, Ureterocele
fetal, Displasia esquelética fetal, Megabexiga fetal) apareciam com
"C-RADS — colonoscopia virtual", o que é anatomicamente impossível.

### Causa real

Os ids são **posicionais** (`seed_<N>`, renumerados por posição no boot). Ao
longo do tempo o `SEED` foi reordenado/ampliado (a seção Medicina Fetal foi
inserida), então o MESMO `seed_<N>` passou a apontar para OUTRA lesão. O `DATA`
persistido (IndexedDB/Firestore) guarda os campos por esse id, então
classificações antigas ficaram "coladas" em lesões diferentes. Como a
atualização canônica de campos está desativada (V250), a classificação errada
persistia e aparecia na lesão errada.

Agravante: a auditoria antiga `CLASSIFICATION_AUDIT_REMOVE_20260918` é uma lista
de ids POSICIONAIS; com a reordenação, ela passou a apontar para outras lesões —
inclusive `seed_818/819/820`, que hoje são justamente os pólipos/carcinoma
colorretal (onde **C-RADS é legítima**). Ou seja, a lista antiga podia apagar
classificação VÁLIDA.

### Auditoria no SEED (read-only)

- `C-RADS` no SEED: **3 registros**, todos em `Abdômen Superior / Intestino /
  cólon` (Pólipo hiperplásico, Pólipo adenomatoso colônico, Carcinoma
  colorretal) — **válidos**. O SEED não tem C-RADS em Medicina Fetal.

### Correção (sem limpeza cega por string)

- A remoção automática por id posicional foi **NEUTRALIZADA**
  (`applyClassificationAudit20260918` → no-op).
- Novo `buildClassificationAudit()` (read-only) compara a `classification` de
  cada lesão de `DATA` com o **SEED pela identidade semântica `s+site+name`**:
  - `valid` (bate), `mismatch` (SEED tem outra), `spurious` (SEED não tem
    classificação nessa identidade), `unknown` (identidade fora do SEED — lesão
    do usuário, não mexer).
- `applyClassificationIdentityFix()` (manual, com confirmação): cria
  `createSafetySnapshot('antes de corrigir classificações inválidas')`, remove
  `spurious` (→ null) e restaura `mismatch` (→ valor canônico do SEED).
  Preserva `name/notes/tags/s/site/images/ownership/altPlacements/ids`.
- UI: `📋 auditar classificações` em **Ferramentas avançadas** — mostra o
  relatório e só corrige após confirmação.

### Recorrência

`tests/classification-integrity.test.js` (novo): C-RADS válida na identidade
colônica; C-RADS em fetal é espúria; divergência restaurada; lesão fora do SEED
não é tocada; auditoria read-only; correção cria snapshot, remove só espúria e
preserva o resto; e testes estáticos de que editar/nova lesão/importação/revisão
não espalham `classification`.

### Observação

O SEED do repositório está limpo (3 C-RADS válidas). Os registros espalhados
existem no `DATA` do usuário (estado antigo persistido); a auditoria no app lista
os ids exatos e a correção os limpa. Para números exatos do estado real, usar o
`📋 auditar classificações` (ou um backup fresco).

## Alteração 040 — Painel "Próximas revisões" x "Revisões vencidas" (SRS) e atualização ao vivo

Motivo: (1) depois de responder uma revisão, o card continuava no painel e só
atualizava ao fechar/reabrir; (2) o painel mostrava "18 vencidas" no cabeçalho
de "Próximas revisões", enquanto os cards abaixo diziam "em 11 h" — misturando
dois conceitos.

### Semântica real (confirmada no código)

- `SRS[id] = { interval (dias), due (ms), streak, lastGrade, updatedAt }`.
- **VENCIDA:** tem SRS com `due > 0` e `due <= agora`.
- **PRÓXIMA:** tem SRS com `due > agora`.
- **Nunca estudada** (sem SRS) não entra em nenhuma das duas — é "pendente do
  acervo" (`isDue` a considera pendente, mas não é revisão agendada).
- O KPI "revisões pendentes" e o antigo badge "N vencidas" usavam
  `countActuallyDue(DATA)` = vencidas agendadas (exclui nunca estudadas).
- A lista de "Próximas revisões" filtrava `due > agora` (futuras), top 5.

### Causa do card não sumir/atualizar

`refreshStudyDashboardLive()` (chamada por `applyGrade` após responder)
atualizava KPIs, domínio, ciclo e estado, mas **não** re-renderizava o painel de
revisões. O SRS era salvo, porém o painel só refletia ao reconstruir o dashboard.

### O que significava "18 vencidas" e por que aparecia "em 11 h"

"18 vencidas" = `countActuallyDue(DATA)` (revisões com `due <= agora`), mostrado
no cabeçalho de "Próximas revisões". A lista logo abaixo mostrava apenas as
FUTURAS (`due > agora`), com "em X h". Ou seja: o badge contava as vencidas, mas
a lista mostrava as próximas — daí a incoerência.

### Correção

- `partitionScheduledReviews(now)` separa **vencidas** (`due <= now`) e
  **próximas** (`due > now`), cada uma ordenada por `due` crescente; "nunca
  estudada" fica fora.
- `renderReviewPanels(ov)` renderiza **dois blocos** in-place:
  - **"Revisões vencidas"** (só quando há), com badge vermelho "N vencidas" e
    tempo relativo `fmtReviewPast` → "vencida há 2 h" / "vencida há 3 dias";
  - **"Próximas revisões"**, com badge "N agendada(s)" (ou "em dia") e tempo
    `fmtReviewFuture` → "em 11 h" / "amanhã · HH:MM".
- `refreshStudyDashboardLive()` chama `renderReviewPanels(ov)` — o painel agora
  atualiza **imediatamente** após responder (o card sai/reordena na hora), sem
  fechar/reabrir.
- `openProgressDashboard()` usa os mesmos containers (`#study-overdue`,
  `#study-upcoming-list`, `#study-upcoming-count`).

### Sem duplicação

`applyGrade` já é guardado por `if(st.grade) return;` e chama `srsGradeLevel`
(1x), `quizStats[g]++` (1x), `recordQuizAnswerToday` (1x) — sem duplicar SRS,
score ou SESSIONLOG. Clicar num card abre a sessão com aquela lesão
(`startQuizInsideDashboard`), sem criar revisão de conteúdo.

### Testes

Novo `tests/srs-dashboard.test.js` (12 PASS): passado → vencida; futuro →
próxima; nunca estudada fora; vencido nunca mostra "em"; futuro nunca mostra
"vencida"; ordenação por `due`; reagendar reduz o contador; refresh ao vivo
re-renderiza; dashboard com blocos separados; sem duplicar SRS/score/SESSIONLOG;
clique não cria revisão. Âncoras de `tests/critical-flows.test.js`:
5885/5875/8297/11285.

## Alteração 041 — Auditoria de classificações conservadora (não remover por ausência no SEED)

**Correção da Alteração 039.** A regra antiga era agressiva demais:

> "SEED sem classification para essa identidade ⇒ spurious (será removida)".

Ela marcava como espúrias 64 de 87 classificações — incluindo plausíveis e
legítimas (LUNG-RADS em lesão torácica, BI-RADS em mama/axila, LI-RADS em
fígado, Bosniak em rim), além das realmente absurdas (C-RADS em Medicina Fetal).
**Ausência de `classification` no SEED NÃO é prova de erro**: pode ter sido
adicionada manualmente depois e ser válida.

### Nova regra

- `canonical` — bate com a `classification` do SEED.
- `mismatch` — SEED define uma classificação diferente (a do SEED é canônica).
- `compatible_noncanonical` — SEED não define, mas a anatomia/contexto é
  plausível (regras semânticas por sistema). **Não mexer.**
- `incompatible` — classificação claramente de outro sistema (seção diferente
  E sem palavra-chave de contexto). **Único candidato a remoção.**
- `unknown` — sem base segura (sistema sem regra, contexto ambíguo ou
  identidade fora do SEED). **Revisar; não remover.**

`CLASSIFICATION_CONTEXT_RULES` (conservador, seção + palavra-chave de
sítio/nome): C-RADS→cólon; LUNG-RADS→pulmão; BI-RADS→mama/axila;
LI-RADS→fígado; Bosniak→rim/cisto; TI-RADS→tireoide; PI-RADS→próstata;
O-RADS→ovário/anexo; VI-RADS→bexiga; CAD-RADS→coronária; Node-RADS→linfonodo;
ASPECTS→neuro; AAST_*→rim/fígado/baço. `classifyClassificationCompatibility()`
só marca `incompatible` quando a seção é claramente de OUTRO sistema **e** não há
palavra de contexto; empate/ambiguidade vira `unknown`.

### Correção automática (botão)

Só remove `incompatible` (→ `null`) e restaura `mismatch` (→ valor canônico do
SEED), com `createSafetySnapshot('antes de corrigir classificações inválidas')`.
**Nunca** toca `canonical`, `compatible_noncanonical`, `unknown` nem registros
fora do SEED.

### C-RADS (confirmado)

- C-RADS em Medicina Fetal ⇒ **incompatible**.
- C-RADS nos 3 registros colônicos canônicos ⇒ **canonical** (não removida).
- C-RADS em outra lesão abdominal (ex.: fígado) ⇒ `unknown` (revisar).

### Testes

`tests/classification-integrity.test.js` reescrito (14 PASS): C-RADS colônica
canônica; C-RADS fetal incompatível; C-RADS abdominal não colônica em revisar;
BI-RADS mama / Bosniak rim / LI-RADS fígado plausíveis; LI-RADS pâncreas e
LUNG-RADS coração em revisar (nunca removidos); sistema desconhecido em revisar;
divergente restaurada; auditoria read-only; correção só toca
incompatible+mismatch e preserva plausíveis/unknown; snapshot antes. Âncoras de
`tests/critical-flows.test.js`: 5885/5875/8336/11324.

## Alteração 042 — Painel de revisões em bloco único (vencidas têm prioridade)

Motivo: a Alteração 040 separou "Revisões vencidas" e "Próximas revisões" em
dois blocos empilhados na coluna esquerda, deixando a coluna alta e com espaço
vazio à direita.

### Regra do painel

**Um único painel** na coluna esquerda:
- **Se há vencidas:** mostra **"Revisões vencidas"** (`SRS · já passaram do
  vencimento`), badge **"N vencidas"**, lista ordenada por `due` crescente com
  tempo "vencida há X".
- **Se não há vencidas:** mostra **"Próximas revisões"** (`SRS · casos clínicos
  agendados`), badge **"N agendadas"** (ou "em dia"), lista ordenada por `due`
  com tempo "em X"/"amanhã · HH:MM".
- Nunca os dois ao mesmo tempo.

O badge usa o **total real** (ex.: 8 vencidas); a lista limita a **5** cards para
preservar o layout (como o painel antigo).

### Transição automática

`renderReviewPanels` (via `refreshStudyDashboardLive`) usa `reviewPanelModel`:
depois de responder/reagendar, recalcula na hora. Se ainda houver vencidas,
continua em "Revisões vencidas"; se a última for resolvida, o MESMO painel vira
"Próximas revisões" — sem fechar/reabrir, sem F5, sem render global.

### Semântica preservada

Vencida = `due <= agora`; próxima = `due > agora`; nunca estudada fora dos dois;
vencida nunca mostra "em"; futura nunca mostra "vencida"; contador em tempo real;
sem duplicar SRS/score/SESSIONLOG.

### Layout

Container único `#study-review-panel` (classe `.study-upcoming`, com
`.is-overdue` quando é o caso). Sem alterar gráficos, ciclo, domínio, cards da
direita ou o grid do dashboard.

### Testes

`tests/srs-dashboard.test.js` (17 PASS): com vencidas mostra "Revisões vencidas"
e não "Próximas revisões"; sem vencidas mostra "Próximas revisões"; badge com
total real (8) mesmo limitando a lista; resolver a última vencida troca para
próximas; "em dia"; tempos relativos; ordenação; read-only/refresh; sem
duplicação. Âncoras de `tests/critical-flows.test.js`: 5884/5874/8335/11323.

## Alteração 043 — Fila manual "Revisar" com 3 ações (Manter / Remover / Abrir lesão)

Motivo: a categoria "Revisar" (`unknown`) da auditoria de classificações era
apenas uma lista somente-leitura; faltava um jeito prático de decidir caso a caso
sem correção automática.

### Fila manual

Cada item de "Revisar" virou um card com **nome, seção, sítio e classificação
atual** e 3 ações:

- **✓ Manter** — NÃO altera `DATA`. Registra uma decisão manual de que aquela
  classificação foi revisada e deve ser aceita. O item sai da fila.
- **✕ Remover** — confirma ("Remover a classificação X desta lesão?"), cria
  `createSafetySnapshot('antes de corrigir classificações inválidas')`, zera
  SOMENTE `lesion.classification`, `saveData`, registra a decisão e recalcula.
- **✎ Abrir lesão** — abre o editor daquela lesão (`openForm` com
  `preserveUnderlyingOverlay`), mantendo a auditoria aberta por baixo; ao salvar,
  recalcula a auditoria (a lesão pode mudar de categoria). Esc fecha só o
  formulário.

### Persistência e identidade

`CLASSIFICATION_REVIEW_DECISIONS` (IndexedDB local, chave
`atlas:classificationReviewDecisions`) guarda `{action, classification,
identity, at}`. A chave da decisão é
**IDENTIDADE SEMÂNTICA (s+site+name) + a `classification` atual** — nunca o
`seed_<N>` posicional. Consequências:

- a decisão **não é global**: manter "BIRADS" numa lesão não valida BIRADS para
  outras;
- se a `classification` mudar depois (ex.: BIRADS → LIRADS), a decisão antiga
  **não esconde** o novo valor — o item volta para a fila;
- persiste após F5 (IndexedDB); **não** sincroniza com a nuvem (evita conflito
  entre origens). Estrutura separada de `LESION_REVISIONS`.

### Contadores

A tabela da auditoria é re-renderizada a cada decisão (sem fechar o modal):
"Manter" tira 1 de Revisar mantendo a classificação no `DATA`; "Remover" tira 1 de
Revisar e diminui 1 em "Total com classification".

### Correção em lote

`applyClassificationIdentityFix` continua mexendo **só** em `incompatible` e
`mismatch` — não toca `canonical`, `compatible_noncanonical`, `unknown`/Revisar
nem decisões manuais.

### Testes

`tests/classification-integrity.test.js` (24 PASS): unknown na fila; card com
nome/seção/sítio/classificação e 3 ações; Manter não altera DATA e sai da fila;
Manter persiste após reload; chave por identidade semântica (id diferente mantém
a decisão); mudar a classification invalida a decisão; Remover cria snapshot,
zera só classification e preserva o resto; correção em lote não toca unknown;
Abrir lesão usa `openForm` e recalcula ao salvar. Âncoras de
`tests/critical-flows.test.js`: 5891/5881/8433/11422.

## Alteração 044 — Merge aditivo de imagens local→nuvem (divergência cruzada)

Motivo: localhost tinha 58 registros/73 imagens (SRS 41) e a nuvem 53/66 (SRS
44). Cada lado era mais novo num domínio diferente: **overwrite integral perderia
o SRS mais novo da nuvem**; e o push simples não incorporava as imagens novas.

### Regra

**Quando local e nuvem possuem dados mais novos em domínios diferentes, NÃO fazer
overwrite integral. Para imagens, usar merge aditivo preservando SRS e demais
estruturas remotas.**

### Merge aditivo de imagens

- `imageIdentityKeys(img)` — identidades estáveis (assetId, publicId, URL
  normalizada de `originalUrl`/`data`/`thumb`). Dedup cruzada: um lado pode ter
  só o `publicId` e o outro só a URL do MESMO asset.
- `unionEntryImages(base, add, alvo, sink, label)` — preserva a base, acrescenta
  só as ausentes (dedup) e **NUNCA move ownership**: imagem com dono diferente da
  lesão-alvo é bloqueada e registrada. Nunca apaga.
- **PULL (nuvem→local):** `mergeEntryNonDestructive` agora usa UNION ADITIVA
  (`base=local`), então imagens que existem só na nuvem passam a ser incorporadas.
- **PUSH (local→nuvem):** `mergeEntryForImagePush(local, remote)` usa o registro
  REMOTO como base e soma só as imagens LOCAIS ausentes no remoto.

### `mergeThisDeviceImagesToCloud()`

1. snapshot de segurança; 2. lê a nuvem DIRETO DO SERVIDOR; 3. para cada id,
   `mergeEntryForImagePush` (union); 4. preserva SRS (`mergeSRSPreservingNewest`),
   REVIEW (`mergeReviewPreservingProgress`), SESSIONLOG e ordens; 5. persiste
   local e escreve a nuvem (`writeShardedStateSerialized`); 6. **relê o servidor**
   e só confirma se `server.totalImages >= local.totalImages` E `server.srs >=
   beforeServer.srs`. Se não bater: "A nuvem possui imagens que ainda não foram
   incorporadas neste dispositivo", com servidor × local e conflitos.

### UI

`buildSyncAudit` detecta `crossDivergent` (imagens local>nuvem **e** SRS
nuvem>local). O modal de sincronização mostra o aviso "Este dispositivo e a nuvem
possuem dados mais novos em áreas diferentes…" e revela o botão
`🔀 Mesclar imagens deste dispositivo na nuvem`. O envio integral continua
disponível, mas com o aviso.

### Sem upload

O merge só copia metadados/URLs; **nenhuma imagem é reenviada ao Cloudinary**.

### Testes

`tests/snapshots-ownership.test.js` (46 PASS): union base+novas sem duplicar;
dedup por publicId e URL normalizada; ownership igual incorpora / conflitante
bloqueia e reporta; imagem sem dono incorpora; merge push servidor-only, union,
preserva SRS/REVIEW/SESSIONLOG, verifica servidor e não faz upload; `crossDivergent`
na auditoria; aviso + botão na UI. Âncoras de `tests/critical-flows.test.js`:
6061/6051/8603/11592.

## Atualização 22/09/2026 — overlay residual pós-save (corrigido)

Causa: `refreshStudyDashboardLive()` chamava `getStudyOverlay()`, que CRIA a
`#study-overlay` quando ausente — com o dashboard fechado (ex: após Salvar),
isso deixava um backdrop escuro com scroll travado até um clique. Correção:
lookup direto sem criar (`getElementById('study-overlay')`);
`getStudyOverlay()` segue exclusivo dos fluxos que abrem o dashboard/Quiz.
Testes: `tests/modal-cleanup.test.js` (14 PASS).

## Atualização 22/09/2026 — expansores do formulário (UX, sem commit)

Seletores de sequência/modalidade, tags avançadas e localização adicional
começam recolhidos (▸); preview, descrição, tags atuais e ações sempre
visíveis. Só UI (`hidden`/rótulo/aria), sem persistência e sem mudar
DATA/save/chips/sync. Testes: `tests/form-collapse.test.js` (9 PASS);
âncora `importHandler` em 11949.

## Atualização 22/09/2026 — toggle de tags na linha do título

"▸ Tags avançadas" embutido à direita do título (flex + wrap); sem linha
extra, sem duplicação, fiação intacta. Testes:
`tests/form-collapse.test.js` (10 PASS); âncora `importHandler` em 11984.

## Atualização 22/09/2026 — bloco de tags no topo do formulário

Bloco inteiro (título + toggle + chips + avançadas) movido para após o
subtítulo, antes de Nome da lesão; ocorrência antiga removida (sem cópia).
Testes: `form-collapse` (11 PASS); âncora `importHandler` em 11983.

## Atualização 22/09/2026 — layout desktop do editor (só template/CSS)

Modal `min(1180px,100vw-40px)`/`92vh`, scroll interno, rodapé sticky,
grade 3→2→1, galeria 2-3 colunas. CSS embutido no template (sem tocar no
`<style>` global); ids e lógica intactos; expansores preservados.
Testes: `tests/form-layout-desktop.test.js` (10 PASS);
âncora `importHandler` em 11961.

## Atualização 22/09/2026 — footer restaurado no DOM

Faltava a abertura do `.lesion-form-body` (template 35×36); adicionada 1
linha, sem mover as tags. Testes: `form-layout-desktop` (12 PASS);
âncora `importHandler` em 11984.

## Atualização 22/09/2026 — paste amplo + zoom profundo (só interação)

Seção de imagens virou zona de paste (`pasteTargetIsText` protege campos;
mesmo `addLocalFile`, pending até Salvar). Lightbox com zoom 1–20x (roda
com âncora, botões, pan com clamp, reset, ESC), estado por abertura;
assinatura/classes intactas, sem CSS novo. Testes:
`tests/image-handling.test.js` (18 PASS); âncora `importHandler` em 11982.
