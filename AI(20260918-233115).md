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
mão. É a união de:
1. `LEGACY_SUPPRESSED_DUPLICATE_IDS` — histórico auditado (piso de
   segurança, nunca suprime menos que isso)
2. `computeDuplicateSeedIds(SEED)` — detecção automática por regra (agrupa
   por `s + site + name`; mantém o de **maior id** como "keeper")

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

