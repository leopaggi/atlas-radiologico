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
