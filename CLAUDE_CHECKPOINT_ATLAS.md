# CLAUDE_CHECKPOINT_ATLAS

Checkpoint operacional para retomar a sessão sem reler o projeto inteiro.
Leia isto primeiro; só aprofunde no `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`
se precisar de detalhe que não está aqui.

CURRENT BRANCH: `master`
WORKTREE: limpo depois do commit desta task, salvo os arquivos protegidos
untracked de sempre (ver `AGENTS.md` seção "Arquivos protegidos" e a lista
de novos untracked ainda não classificados citada nos checkpoints
anteriores — nenhum foi tocado nesta sessão).

## CURRENT TASK (concluída nesta sessão, 2026-09-28)

5 pendências globais da Central de Revisões resolvidas de ponta a ponta
(código real + teste de regressão + suíte completa sem regressão nova).
Uma 6ª pendência (`lrev_muj3r3zn_efx2b4`, lesão `seed_390` "Isquemia
mesentérica aguda", pedido "adicionar casos clínicos") foi **deliberadamente
NÃO tocada** por instrução explícita do usuário — nenhum código relacionado
a `clinicalCases` de `seed_390` foi alterado, essa revisão não foi resolvida
e não entrou no commit (confirmado via `git diff index.html | grep
lrev_muj3r3zn_efx2b4` — nenhuma ocorrência).

### 1) Navegação após edição da lesão — `lrev_mul8jrtq_l2atyp`

**Sintoma:** salvar uma lesão editada a partir do detalhe fechava tudo e
perdia o contexto; não havia como voltar à visualização não editável sem
sair do formulário para a lista.

**Root cause:** `openDetail()` → botão "editar" chamava
`closeOverlay(); openForm(e.id)` sem nenhum contexto de retorno; o `finally`
do Salvar em `openForm()` sempre fechava o formulário (`closeForm()`) sem
reabrir nada, e não existia nenhum botão de "voltar" dentro da edição.

**Fix:** o handler do botão "editar" em `openDetail()` agora passa
`opts.onSaved` e `opts.onBackToView` para `openForm()`, ambos reabrindo
`openDetail(e.id, opts)` — a MESMA lesão, com o MESMO contexto original
(ex.: `returnTo:'images-today'` continua funcionando depois do ciclo
editar→salvar→visualizar). Reaproveita o hook `onSaved` já existente (usado
por Quiz/"imagens hoje" para outros fins — nada mudou para eles, pois não
passam `onBackToView`). Novo botão "← Voltar para visualização" no rodapé
do formulário, só quando `opts.onBackToView` é função; fecha sem salvar
(mesma limpeza do cancelar) e reabre a visualização.

**Arquivos:** `index.html` (`openDetail`, `openForm`).
**Teste novo:** `tests/lesion-edit-navigation.test.js` (10/10) — fluxo REAL
simulado em DOM mínimo (mesmo padrão de `images-today-modal.test.js`),
inclusive recursão real de `openDetail` via `onSaved`/`onBackToView`, não
apenas helper isolado.

### 2) Links automáticos do Radiopaedia em português — `lrev_mul8vsjq_0bfwkd`

**Root cause:** o bootstrap do `SEED` fazia `e.enTerm = EN_TERMS[e.name] ||
e.name` — sem tradução curada em `EN_TERMS`, o "termo em inglês" virava, em
silêncio, o próprio nome em português, e o link padrão "Radiopaedia —
buscar casos" era montado com esse nome (busca ruim, pois o Radiopaedia é
em inglês). O reparo automático de boot (dentro de `loadData()`) repetia o
mesmo fallback a cada carregamento, sem nunca corrigir de verdade.

**Fix:** nova função `radiopaediaAutoEnTerm(name)` — só devolve termo
quando `EN_TERMS[name]` existe de verdade; sem entrada, devolve `null` e
**nada é fabricado**. Usada em 3 pontos: bootstrap do `SEED` (novos
registros: sem tradução real, nasce **sem** o link automático, em vez de
com um link errado), `ensureLinks()` (mesma regra para lesões legadas sem
array de links) e o reparo de boot em `loadData()` (só corrige quando existe
termo real; sem termo, **mantém o link existente intocado** — fail-safe
explícito, nunca sobrescreve com português). O botão manual "+ gerar busca
no Radiopaedia" continua preferindo o campo "Termo em inglês" e, se cair no
nome em português por falta desse campo, agora avisa o usuário em vez de
fabricar em silêncio. Links `userEdited:true` (editados manualmente) e
lesões com mais de 1 link nunca são tocados por nenhum destes caminhos —
comportamento já existente, preservado.

**Auditoria (contra o catálogo `SEED` real, 1213 lesões — não tenho acesso
ao Firestore/IndexedDB de produção do usuário, então este é o número
correto de auditar/reportar disponível para este agente):**
- **1213** lesões auditadas (todo o catálogo base).
- **204** delas sem entrada em `EN_TERMS` — o link automático dessas usava
  (antes da correção) o nome em português como termo de busca.
- Com a correção: as **204** deixam de fabricar/repetir um link errado
  (novas nascem sem link automático; existentes mantidas como estavam —
  fail-safe, nada sobrescrito às cegas). As outras **1009** já usavam (e
  continuam usando) o termo real de `EN_TERMS`.
- **0** corrigidas por reescrita automática nesta sessão (a correção é do
  *gerador*, não uma migração em massa — nenhuma escrita de dados foi
  autorizada/necessária; o app já se autocorrige a cada boot para quem TEM
  termo real, e passa a nunca mais piorar quem não tem).

**Arquivos:** `index.html` (`radiopaediaAutoEnTerm` novo; `SEED.forEach`
bootstrap; `ensureLinks`; reparo de boot em `loadData()`; botão
`f-link-radiopaedia`).
**Teste novo:** `tests/radiopaedia-links-fail-safe.test.js` (12/12),
incluindo encoding (espaços/hífen/parênteses/acentos) e uma varredura do
catálogo `SEED` inteiro provando que nenhuma lesão sem `EN_TERMS` acaba com
link automático em português.

### 3) Dados clínicos importados do Radiopaedia — `lrev_mulclk3s_7le9tj`

**Sintoma:** idade/modalidade/história clínica chegavam pela importação,
mas editar o caso vinculado mostrava/perdia dados.

**Root cause (mapeamento incompleto no ponto de importação, não
schema/ownership/persistência):** `buildClinicalCaseFromDraft()` — a única
função que transforma o caso importado do Radiopaedia num item de
`clinicalCases` — nunca atribuía `id` nem `origin`. O editor do item
(`openDidacticItemEditor`, botão "✏") e o Salvar (`upsertDidacticItem`)
casam o item pelo `id`; sem `id`, o Salvar nunca encontrava o item
importado e criava um item NOVO (com `id` novo) em vez de atualizar o
original — o card editado continuava com os dados de antes e um duplicado
desalinhado aparecia ao lado. Sem `origin:'imported'`, a validação do
Salvar (`origin: it.origin || 'manual'`) exigia "apresentação clínica"
mesmo quando o Radiopaedia legitimamente não trouxe história clínica
para aquele caso, bloqueando o Salvar.

**Fix:** `buildClinicalCaseFromDraft()` agora atribui `id: genDidacticId
('case')` e `origin:'imported'` desde a importação (mesmo gerador de id já
usado em todo o sistema didático 093 — nenhum schema novo). Para casos JÁ
importados ANTES desta correção (sem id/origin, dado antigo real do
usuário): o botão "✏ editar" agora aplica a MESMA conversão
(`ensureClinicalCaseIdentity`) que ↑/↓/✕ já aplicavam — não é migração em
massa, só "ganha identidade estável na 1ª gestão" (padrão já documentado e
testado, `ensureClinicalCaseIdentity` já preenchia `origin:'imported'`
corretamente; só faltava o botão editar chamá-la ANTES de abrir o editor).

**Arquivos:** `index.html` (`buildClinicalCaseFromDraft`;
`wireDidacticFormSection` — wiring do `.didactic-edit`).
**Teste novo:** `tests/radiopaedia-clinical-data-edit.test.js` (13/13) —
importar→editar→salvar→reabrir preserva os dados; caso importado sem
apresentação pode salvar; caso manual sem apresentação continua exigindo o
campo; legado sem id ganha identidade; confirma que
`structuralApplyAddCases` (usado pela pendência MANUAL de `seed_390`,
intocada) é uma função separada, não usa `buildClinicalCaseFromDraft` e não
foi alterada.

### 4) Quadros de imagens em Sinais Radiológicos e Classificações — `lrev_mulf9eek_h24i4h`

Sinais/classificações já vinculavam imagens existentes e aceitavam imagem
nova por arquivo/URL/Ctrl+V (arquitetura 093b/093c: `entry.images` é a
fonte única do asset; o item só guarda `imageRefs`) — reordenar/remover
vínculo, persistir, editar e visualizar já funcionavam. Faltava
especificamente o "quadro de imagens" (▦, o MESMO construtor de montagem —
`openCollageBuilder` — já usado no formulário principal e no Quiz) dentro
do editor do item.

**Fix:** novo botão "▦ criar quadro de imagens" em
`openDidacticItemEditor`, só para `signs`/`schemes` (`kind !== 'cases'`,
igual aos outros controles de imagem nova — casos clínicos não mudam),
chamando `openCollageBuilder(getLesionMeta(), (collage) =>
addAndLink(collage), null, true)` — reaproveita 100% da arquitetura
existente, nenhuma coleção paralela. **Bug lateral encontrado e corrigido
no mesmo commit:** o objeto que `openCollageBuilder` devolve
(`deferUpload:true`) nunca tinha `_pendingKey` — sem essa chave,
`didacticImageRefId()` não resolve e o vínculo falharia na hora
("Não foi possível vincular esta imagem"). `didacticImageCtx.addImage()`
(dentro de `openForm`) agora atribui a chave imediatamente quando falta,
igual `addPendingFile` já fazia — corrige o quadro E qualquer futura fonte
de imagem pendente que passe por `addImage` sem chave.

**Arquivos:** `index.html` (`openDidacticItemEditor` — template + wiring do
`de-collage`; `didacticImageCtx.addImage` dentro de `openForm`).
**Teste novo:**
`tests/didactic-image-panels-signs-classifications.test.js` (9/9) — wiring
estático do botão (só signs/schemes, gated por `ctx`), reorder/remover
vínculo preservados, sem coleção paralela, e teste dinâmico do
`addImage()` real (não helper isolado) provando que a imagem pendente sem
chave ganha uma na hora e nunca duplica no array.

### 5) Descrições extensas comprimindo a imagem — `lrev_mulfu0x2_ocobn9`

**Root cause:** no Quiz, depois de responder, o contexto clínico (093d) e a
descrição da imagem (`quizImageDescHtml`, sem truncamento — de propósito)
entram ANTES do carrossel dentro de `.quiz-study-media` (`display:flex;
flex-direction:column`). A altura desse painel vem do **grid stretch** do
`.quiz-study-shell` (acompanha a altura da coluna da pergunta ao lado, não
o próprio conteúdo). A imagem (`.quiz-study-media img` e o wrapper
`.quiz-carousel`) tinha `flex:1;min-height:0` — sem piso mínimo, um texto
longo acima espremia a imagem (e qualquer rótulo/sequência queimado nela)
até quase sumir.

**Fix:** `min-height:240px` (`180px` no breakpoint ≤780px) na imagem e no
`.quiz-carousel`, preservando `max-height`/`object-fit:contain` existentes
— a imagem passa a ter uma área visual estável, nunca comprimida abaixo
desse piso. `.quiz-study-media` ganhou `overflow-y:auto`: se o texto acima
for realmente muito longo, o PAINEL rola (a descrição continua inteira,
nunca truncada/escondida permanentemente — exigência explícita) em vez de
competir por espaço com a imagem. Carrossel, setas, contador e lightbox
continuam exatamente como estavam (nenhuma lógica de navegação tocada, só
CSS de layout).

**Arquivos:** `index.html` (CSS `.quiz-study-media`, `.quiz-study-media
img`, `.quiz-study-media .quiz-carousel`, media query `≤780px`).
**Teste novo:** `tests/quiz-image-description-layout.test.js` (9/9) — CSS
real, confirma que `quizImageDescHtml` continua sem truncamento, que
carrossel/setas/lightbox permanecem wireados, e que nenhum outro seletor de
`<img>` no app combina `flex:1` com `min-height:0` (era o único ponto real
do bug).

## SUÍTE DE TESTES

Antes desta task (baseline, `git stash` comparado arquivo a arquivo):
**1655 testes · 1638 PASS · 12 FAIL** (todos históricos, ver lista abaixo)
**· 5 TODO**.

Depois desta task (5 arquivos de teste novos, +53 testes):
**1708 testes · 1691 PASS · 12 FAIL · 5 TODO** — **os MESMOS 12 FAIL
históricos, nenhuma regressão nova** (confirmado via `git stash` antes de
cada mudança e na suíte completa final).

Os 12 FAIL históricos (pré-existentes, não relacionados a esta task):
`DUPLICATE_PAIRS_V171` (duplicate-detection), 2 testes dependentes da data
do sistema (`FILTRO Hoje`, `RESUMO todayCount`), 4 testes que assumem LF mas
o checkout Windows usa CRLF (`091e window.name`, `092 integração`, `085
PIPELINE`, `REGRESSAO dropdown do sitio`), e os arquivos inteiros
`controlled-duplicate-merge.test.js`, `didactic-image-links.test.js`,
`didactic-pending-images.test.js`, `lesion-didactic-content.test.js`,
`quiz-clinical-case-context.test.js` (mesmo motivo CRLF — usam recorte por
marcador de comentário com `\n` literal, que não bate com o CRLF real do
arquivo neste ambiente Windows).

`tests/critical-flows.test.js` teve as 4 âncoras de linha atualizadas
(recovery/brokenArtifacts/loadData +32; importHandler +85) — mesmo padrão
de manutenção já documentado nas correções anteriores; comentário no
próprio teste explica a origem do deslocamento.

`git diff --check` limpo (sem espaço em branco/CRLF misturado introduzido).

## ARQUIVOS ALTERADOS NESTA SESSÃO

- `index.html` (as 5 correções acima).
- `tests/critical-flows.test.js` (4 âncoras de linha realinhadas).
- `tests/clinical-cases.test.js` (dependência `genDidacticId` adicionada ao
  harness `loadRuntime()`, que passou a precisar dela por causa da correção
  3 — sem isso o teste dinâmico quebrava com `ReferenceError`).
- 5 arquivos de teste novos: `tests/lesion-edit-navigation.test.js`,
  `tests/radiopaedia-links-fail-safe.test.js`,
  `tests/radiopaedia-clinical-data-edit.test.js`,
  `tests/didactic-image-panels-signs-classifications.test.js`,
  `tests/quiz-image-description-layout.test.js`.
- `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`, `CLAUDE_CHECKPOINT_ATLAS.md`
  (este arquivo).

Nenhum arquivo protegido (untracked) foi tocado. Nenhuma alteração em
Firestore rules. Nenhuma migração destrutiva. `seed_390`/`clinicalCases` e
a revisão `lrev_muj3r3zn_efx2b4` permanecem exatamente como estavam —
pendência para resolução manual do usuário, fora do escopo desta task por
instrução explícita.

## REVIEWS

Resolvidas (marcadas como `accepted`/resolvidas na Central de Revisões após
validação real do usuário no app, já que este agente não tem acesso direto
ao Firestore/IndexedDB de produção para clicar "✓ Marcar como resolvida"):

- `lrev_mul8jrtq_l2atyp` (navegação após edição)
- `lrev_mul8vsjq_0bfwkd` (links Radiopaedia)
- `lrev_mulclk3s_7le9tj` (dados clínicos importados)
- `lrev_mulf9eek_h24i4h` (quadros de imagens signs/classifications)
- `lrev_mulfu0x2_ocobn9` (layout descrição/imagem)

**NÃO resolvida** (intocada, por instrução explícita):
`lrev_muj3r3zn_efx2b4` (seed_390, casos clínicos) — o usuário resolve
manualmente.

## LIMITAÇÕES REAIS RESTANTES

- Este agente não tem acesso ao Firestore/IndexedDB de produção do
  usuário — as 5 revisões precisam ser confirmadas/marcadas como
  resolvidas pelo próprio usuário no app real, depois de validar cada
  correção na prática (ver "próximo passo" abaixo).
- A auditoria de links do Radiopaedia (item 2) foi calculada contra o
  catálogo `SEED` (1213 lesões, base determinística) — não contra o estado
  real e possivelmente editado do Firestore do usuário, que este agente não
  pode ler. Os números reportados (204/1213 sem tradução) são o piso
  conhecido; lesões que o usuário já editou manualmente podem já ter
  `enTerm`/links diferentes do `SEED`.
- Smoke test em navegador real (clique de verdade em cada um dos 5 fluxos)
  não foi possível neste ambiente — a validação foi por suíte de testes
  (funções reais extraídas do `index.html`, executadas em `vm`, sem
  DOM/rede de verdade) + leitura cuidadosa do código real ponta a ponta.

## PRÓXIMO PASSO

Testar cada uma das 5 correções no navegador real (localhost ou GitHub
Pages após o deploy) e, se confirmado, marcar as 5 revisões acima como
resolvidas na Central de Revisões (✓ Marcar como resolvida). A pendência de
`seed_390` (`lrev_muj3r3zn_efx2b4`) fica para o usuário resolver quando
quiser — não mexer nela sem pedido explícito.

## DO NOT

- Não tocar em `clinicalCases` de `seed_390` nem na revisão
  `lrev_muj3r3zn_efx2b4` sem pedido explícito do usuário.
- Não refazer a auditoria/root cause já concluída desta task sem evidência
  NOVA de falha.
- Não reescrever em massa os links do Radiopaedia já persistidos — a
  correção é do gerador; migração em massa exigiria backup fresco +
  autorização explícita (AGENTS.md).
- Não usar force push.

## GIT RULES

- `git add` explícito por arquivo, nunca `git add .`.
- Publicar com `git push origin master:main`.
- Sem force push, sem `--no-verify`.

## DEPLOY

GitHub Pages serve o branch `main` diretamente a partir de `index.html`; não
há workflow do GitHub Actions nem service worker neste repositório — o
deploy é imediato após o push.
