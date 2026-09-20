# Atlas Radiológico

Atlas de padrões radiológicos — um banco de lesões organizado por seção
(Neurorradiologia, Tórax, Musculoesquelético, etc.), com tags de imagem,
descrição do padrão radiológico, classificação de frequência e imagens
associadas. Feito pra estudo/consulta rápida.

## Como rodar

É um único arquivo `index.html` autossuficiente. Não precisa de build,
servidor local nem instalação — basta abrir no navegador ou publicar via
GitHub Pages.

**Hospedagem:** GitHub Pages, em `leopaggi.github.io/atlas-radiologico/`.

## Como atualizar o site

O arquivo já passou de 2 MB, então o editor web do GitHub **não abre mais
esse arquivo pra edição direta**. O fluxo é:

1. Gerar o `index.html` atualizado
2. No repositório: **Add file → Upload files → choose your files**
3. Selecionar o `index.html` novo (substitui o antigo)
4. Commit changes
5. Esperar 1-2 min pro GitHub Pages publicar
6. Testar com Ctrl+Shift+R (força recarregar sem cache)

## Arquitetura

Tudo num arquivo único (`index.html`), por opção explícita — mais fácil de
manter e atualizar sem depender de build step. Por dentro, três camadas:

- **Dados** — `const SEED = [...]`: ~1.213 lesões, cada uma com `id`, `s`
  (seção), `site` (subseção), `name`, `tags`, `notes`, `inc` (frequência:
  1=muito comum ... 4=raro), `enTerm` (termo em inglês pra busca), `links`,
  `images`, e opcionalmente `classification` (sistema padronizado de
  classificação radiológica — BI-RADS, PI-RADS, TI-RADS, etc.; ver
  `AI.md` pra a lista completa e qual órgão cada um cobre).
- **Armazenamento local** — IndexedDB (banco `atlas_radiologico_idb`), não
  `localStorage`. Ver `AI.md` pra entender por quê.
- **Sincronização** — Firebase Firestore (projeto `atlas-radiologico`),
  como fonte da verdade na nuvem. Estado local é um cache; a nuvem manda.

## Funcionalidades principais

- Navegação por seção → subseção → lesão
- Filtro por tags de característica de imagem
- Tags especiais: "📷 imagens" (tem foto) e "🚫 sem imagens" (ainda não
  tem — útil pra saber o que falta completar)
- Upload de imagens (via Cloudinary)
- Tela de auditoria de duplicatas (`🩺 diagnóstico do sistema`, dentro de
  "⚙️ ferramentas avançadas")
- Auditoria de vínculo imagem↔lesão (`🔍 audit`)

## Testes

```text
node tests/duplicate-detection.test.js
```

O teste usa apenas recursos nativos do Node.js e analisa o `index.html`
estaticamente. Ele não executa a aplicação e não acessa IndexedDB, Firebase,
Firestore, Cloudinary ou a rede.

Verificação sintática do próprio arquivo de teste:

```text
node --check tests/duplicate-detection.test.js
```

Na Alteração 001, o teste analisou 1.213 registros do `SEED`: os IDs são
válidos e únicos, não existem duplicatas exatas atuais por `s + site + name`
e o JavaScript embutido possui sintaxe válida. Foi detectado um defeito
preexistente nas 28 entradas de `DUPLICATE_PAIRS_V171`, que estão
estruturalmente incorretas e permanecem propositalmente sem correção. Assim,
o resultado atual esperado é **6 PASS e 1 FAIL**.

### Fluxos críticos

```text
node --check tests/critical-flows.test.js
node tests/critical-flows.test.js
node tests/duplicate-detection.test.js
```

`tests/critical-flows.test.js` usa somente recursos nativos do Node.js. Ele
combina análise estática do `index.html` com a execução exclusiva de trechos
extraídos em `vm` isolado, usando mocks e stubs locais. Não acessa IndexedDB
real, Firebase, Firestore, Cloudinary ou a rede.

O teste também executa a função `loadData()` real com 1.213 registros
persistidos e o mesmo renumeramento de IDs feito no boot. Ele exige que o
carregamento termine com os mesmos 1.213 registros, protegendo contra a antiga
supressão de 70 IDs históricos após F5.

A Alteração 002 confirmou que `loadData()` chama automaticamente
`recoverCanonicalBaseV154()`, enquanto `hasBrokenMigrationArtifacts()` não
possui chamadas. O cenário isolado demonstrou que a recuperação pode reinserir
um registro canônico ausente do `SEED`. Também confirmou que um backup com
estrutura interna inválida pode iniciar mutações e persistência antes da
validação completa.

O inventário atual do handler de importação contém 10 atribuições de estado,
4 chamadas diretas a `storage.set`, 2 chamadas a `pushToFirebaseNow` e outras
rotinas auxiliares de persistência verificadas pelo teste. O resultado esperado
é **6 PASS e 2 FAIL** conhecidos; nenhum defeito foi corrigido nesta alteração.

Algumas verificações usam números de linha exatos como âncoras do
`index.html` atual. Após uma alteração legítima no HTML, essas âncoras podem
precisar ser atualizadas; uma mudança de linha isolada não representa
automaticamente uma regressão funcional.

### Alteração 003 — recuperação do SEED

`loadData()` não chama mais `recoverCanonicalBaseV154()` automaticamente após
carregar `DATA` do estado persistido. A correção removeu exclusivamente a
linha `await recoverCanonicalBaseV154();`; nenhuma nova política automática
de recuperação foi criada e `hasBrokenMigrationArtifacts()` continua sem ser
conectada ao carregamento normal.

A função de recuperação continua no código e seu comportamento explícito
permanece coberto pelo cenário isolado. O `SEED` continua com 1.213 registros,
sem mudanças de conteúdo, e `DUPLICATE_PAIRS_V171` permanece com as mesmas 28
entradas malformadas conhecidas.

O teste de fluxos críticos foi ajustado apenas para o novo estado: âncora da
importação de 6643 para 6642, chamadas esperadas da recuperação de `[4735]`
para `[]` e verificação estática exigindo ausência da chamada automática. O
resultado atual é **7 PASS e 1 FAIL** conhecido na importação. O teste de
integridade permanece com **6 PASS e 1 FAIL** conhecido em
`DUPLICATE_PAIRS_V171`. Nenhum desses dois defeitos remanescentes foi corrigido
na Alteração 003.

### Central de Revisões + Soluções — testes (2026-09-20)

```text
node tests/lesion-review.test.js
```

20 cenários, usando o mesmo padrão dos testes acima: o trecho real do
módulo `LESION_REVISIONS` é extraído do `index.html` e executado num `vm`
isolado com um `storage` falso em memória (sem IndexedDB, Firebase,
Firestore, Cloudinary ou rede real). Cobre criação de revisão, prevenção de
duplicidade, persistência após um "reload" simulado, contadores de
pendências/soluções, as transições `pending → solution_ready → accepted` e
`solution_ready → rejected → pending`, preservação completa do histórico,
checagens estáticas de que o export/import e `loadData()` incluem
`lesionRevisions`, e (hotfix) a atualização imediata dos badges do header a
cada transição usando uma DOM falsa mínima. Resultado esperado nesta etapa:
**20 PASS e 0 FAIL** (números e status como `solution_ready` descritos aqui
foram depois substituídos pela máquina de dois aceites da seção "Central de
Revisões v2" mais abaixo — ver lá o estado atual: **29 PASS, 0 FAIL**).

Como a Central de Revisões foi inserida antes de `recoverCanonicalBaseV154`,
`hasBrokenMigrationArtifacts`, `loadData` e o handler de importação, as
âncoras de linha de `tests/critical-flows.test.js` foram atualizadas em duas
rodadas (a segunda, do hotfix, +12 linhas): 4312→4502→4514, 4302→4492→4504,
6612→6802→6814, 8542→8947→8962. O contexto isolado de `loadData()` ganhou um
stub de `loadLesionRevisions`. Nenhuma lógica existente foi alterada —
apenas as âncoras de linha, que a própria documentação do teste já previa
como sujeitas a deslocamento após uma mudança legítima no HTML. Resultado
atual de `tests/critical-flows.test.js` (já refletindo a correção da
Alteração 004): **20 PASS e 0 FAIL**.

### Alteração 004 — importação segura de backups

Antes de alterar dados, persistir localmente ou sincronizar, a importação agora
valida todos os registros tanto de backups legados em formato de array quanto de
backups completos. Cada registro precisa ser um objeto com `id`, `name`, `s` e
`site` como strings não vazias. IDs repetidos no próprio backup são rejeitados.

IDs personalizados continuam aceitos e não precisam seguir `seed_<N>`. Campos
historicamente opcionais continuam opcionais, incluindo metadados do backup,
progresso, ordenações, tags, notas, frequência, imagens, links e classificação.
A política atual de tipos e fallbacks desses campos não foi modificada.

`createSafetySnapshot()` continua inerte; sua chamada foi somente movida para
depois da validação e confirmação e antes da primeira mutação. Os testes de
fluxos críticos agora passam em **14 de 14** cenários. A integridade permanece
com **6 PASS e 1 FAIL** conhecido nas 28 entradas malformadas de
`DUPLICATE_PAIRS_V171`, não corrigidas nesta alteração. O `SEED` continua com
1.213 registros.

## Histórico relevante

Ver `AI.md` para o histórico de bugs já resolvidos e decisões de design —
essencial antes de mexer na lógica de sincronização ou de dados.

## Atualização 2026-09-18 — correção de subseções secundárias

Foi realizada uma auditoria de `altPlacements`, campo usado para exibir uma lesão também em uma segunda localização anatômica. A partir de um backup fresco, 86 registros foram revisados: 18 associações secundárias coerentes foram mantidas e 68 associações espúrias foram removidas pela migração do `index.html`.

A correção é restrita a `altPlacements`: não muda a seção/subseção principal (`s`/`site`), imagens, tags, descrições, IDs ou progresso de revisão/SRS.

**Regra de manutenção do projeto:** qualquer nova alteração no `index.html` deve ser acompanhada, na mesma entrega, pelas versões atualizadas de `AI.md` e `README.md`.

### Correção persistente de `altPlacements` — revisão 2

A limpeza auditada de associações secundárias erradas agora é reaplicada após cada sincronização inicial com o Firebase. Isso evita que um valor remoto antigo volte a aparecer depois que uma migração pontual já tenha sido marcada como concluída. A rotina continua limitada aos IDs auditados e ao campo `altPlacements`; nenhum outro dado da lesão é alterado.

### Auditoria de classificações — 2026-09-18

O banco foi auditado globalmente para associações indevidas de sistemas de classificação. Entre 117 lesões com `classification`, **54 atribuições claramente incompatíveis** foram removidas e **63 compatíveis** foram preservadas. A limpeza é idempotente após a sincronização inicial com Firebase e altera exclusivamente `classification` nos IDs auditados.

### Quiz & Progresso — dashboard visual

A área de estudo agora possui painel visual com sequência, meta diária, acurácia recente, pendências SRS, gráfico de evolução, estado do acervo e domínio por área. Há sessões de Hoje (15), Rápida (5), CBR (20) e Personalizada.

Durante o quiz, a avaliação passa a usar quatro níveis — Fácil, Média, Difícil e Não sei — que controlam o intervalo da repetição espaçada. O histórico anterior continua compatível.

### Quiz & Progresso v2 — experiência integrada

Há um único acesso visível `Quiz & Progresso`. As sessões usam múltipla escolha com quatro diagnósticos plausíveis do próprio acervo. Casos com imagem são apresentados visualmente; casos sem imagem usam as tags existentes como pistas teóricas. Acerto/erro objetivo e confiança (Fácil/Média/Difícil/Não sei) são registrados separadamente. O dashboard ganhou a paleta viva do mockup aprovado e barras multicoloridas por área.

### Quiz & Progresso v3 — persistência e integração

Questões respondidas são contabilizadas imediatamente no histórico diário, inclusive quando a sessão é encerrada antes do fim. “Revisões pendentes” representa apenas SRS efetivamente vencido, sem contar lesões nunca estudadas. As sessões passam a ocorrer dentro da própria central Quiz & Progresso e retornam ao dashboard atualizado.

### Hotfix — início da sessão integrada

Corrigida falha JavaScript ao iniciar uma sessão a partir de `Quiz & Progresso`. O modo integrado agora é renderizado diretamente no painel existente, sem passar pelo modal legado intermediário.

### Quiz & Progresso v4 — tela única e visual vivo

Toda a central de estudo (painel de progresso, Modo Estudo e sessão
personalizada) passou a funcionar dentro de **uma única tela**, trocando
apenas o conteúdo interno. Antes, voltar de uma sessão ou abrir a sessão
personalizada podia deixar duas telas sobrepostas.

O visual foi aproximado do mockup aprovado: KPIs coloridos no topo, botão
principal em azul vivo, barras de domínio por área multicoloridas, e
destaque verde/vermelho nas alternativas durante o quiz.

### Hotfix — código morto removido (2ª tela, de vez)

A tentativa anterior de unificar Quiz & Progresso numa tela só corrigiu o
dashboard novo, mas deixou no arquivo o fluxo antigo inteiro (que ainda
criava sua própria tela por baixo, embora nenhum botão a acionasse mais —
um risco pronto pra disparar em qualquer edição futura). Esse código morto
foi removido, a tela de resultado da sessão (que tinha passado a ser
pulada, indo direto da última pergunta pro dashboard) foi recriada dentro
da mesma tela, e o início de sessão foi reforçado pra nunca mais depender
de a tela certa já estar visível no DOM.

Testado com jsdom carregando o `index.html` real (não uma cópia das
funções) e clicando nos botões de verdade: abrir Quiz & Progresso, iniciar
sessão rápida, responder as 5 perguntas, ver o resultado, voltar ao
dashboard, abrir e configurar a sessão Personalizada, voltar de novo,
fechar e reabrir. 31 cenários, 0 falhas, nunca mais que 1 tela aberta em
nenhum passo.

### Quiz & Progresso — variedade e métricas de confiança

A fila inteligente reserva pelo menos 60% da sessão para casos nunca estudados quando houver casos novos. `Domínio por área` agora reflete a confiança registrada no quiz (`Fácil`, `Média`, `Difícil`, `Não sei`) entre os casos já estudados e mostra também `estudados/total`. `Estado do acervo` usa as mesmas quatro categorias do quiz, mais `Nunca estudadas`, substituindo `Dominadas / Em aprendizado`.

### Domínio por área — visual compacto

O dashboard apresenta cada área em uma única linha com nome, barra colorida e percentual. As cores são vivas e alternadas por área; cobertura (`estudados/total`) fica disponível no tooltip. A ordem das áreas é anatômica/estável conforme `sectionOrder`, enquanto o percentual continua derivado das respostas reais do quiz.

### Dashboard completo — revisões e Quiz na mesma tela

O painel mostra até cinco próximas revisões SRS no espaço abaixo dos atalhos de sessão. Na parte inferior existe um `Modo Estudo` permanente: iniciar Sessão de Hoje, Sessão rápida, treino por área ou uma revisão renderiza o quiz diretamente nesse bloco, sem substituir o dashboard nem abrir outra tela.

### Evolução e progresso da sessão

O gráfico de evolução ganhou um card inferior com resumo real das questões e acurácia dos últimos 14 dias. O Modo Estudo mostra `Questão X de Y`, barra azul de progresso, percentual e `Finalizar sessão` no mesmo cabeçalho, mantendo o quiz embutido no dashboard.

### Hotfix — Sessão personalizada

O botão `Começar sessão` volta a funcionar: a seleção personalizada é preservada, o dashboard único é reconstruído e a fila escolhida é iniciada no Modo Estudo embutido. O KPI de área mais fraca também não exibe mais `undefined`.

### Cores por área e atualização em tempo real

`Próximas revisões` usa a mesma cor anatômica de `Domínio por área`, com barra lateral e marcador colorido por seção. Ao classificar uma questão como Fácil, Média, Difícil ou Não sei, o dashboard é atualizado imediatamente na própria tela: questões do dia, revisões pendentes, Estado do acervo e Domínio por área mudam sem recarregar nem sair do quiz.

### Ciclo de revisão do acervo

Abaixo da evolução de desempenho, o Atlas mostra a atualidade das revisões por área em barras segmentadas: `≤7 dias`, `8–45 dias`, `46 dias–6 meses`, `>6 meses` e `Nunca`. Cada linha mantém `X / total` e percentual já visto. Os dados vêm de `SRS.updatedAt` e são atualizados em tempo real após cada questão.

### Dashboard panorâmico

`Quiz & Progresso` usa uma largura panorâmica de até 1540 px. O `Ciclo de revisão do acervo` recebe maior área horizontal, barras segmentadas maiores e melhor espaço para totais e percentuais, preservando responsividade em telas menores.

### Resumo geral do ciclo de revisão

Um painel panorâmico em largura total resume todas as lesões do Atlas em uma barra segmentada por idade da última revisão, exibindo simultaneamente percentual, quantidade absoluta e faixa temporal. Ele é atualizado em tempo real junto com o quiz.

### Layout otimizado do Quiz & Progresso

O Ciclo de revisão passou a ocupar uma faixa panorâmica própria abaixo da primeira linha do dashboard. Isso elimina o grande vazio que surgia abaixo de Próximas revisões e amplia a leitura das barras segmentadas. Estado do acervo e Domínio por área permanecem lado a lado, seguidos pelo Resumo geral e pelo Modo Estudo.

### Composição panorâmica fiel ao preview

Em desktop, Quiz & Progresso usa três colunas: controles/revisões, evolução e Estado do acervo na primeira linha; Ciclo de revisão em faixa larga; Domínio do conteúdo ao lado do Resumo geral; e Modo Estudo em largura total. O gráfico de evolução fica compacto quando há pouca informação histórica, evitando desperdício vertical.

### Compactação dos vazios panorâmicos

O cabeçalho divide a faixa superior com os KPIs; os cards de Evolução e Estado do acervo mantêm apenas a altura necessária ao próprio conteúdo; e o Ciclo de revisão ocupa toda a largura disponível. Isso elimina os vazios laterais e verticais introduzidos pela primeira versão da grade panorâmica.

### Grade panorâmica determinística

O desktop usa uma grade explícita de 12 colunas: Sessões 4/12, Evolução 5/12 e Estado 3/12; Ciclo 12/12; Domínio 4/12 e Resumo 8/12. As linhas usam altura pelo conteúdo, eliminando reservas verticais vazias.

### Reconciliador V2 — hardening de `altPlacements`

O reconciliador experimental por identidade semântica continua inerte e não participa de carregamento, sincronização, importação ou qualquer outro fluxo da aplicação. O merge de `altPlacements` agora faz união sem perda, deduplicação por `s + site` normalizados somente para comparação e preservação de campos extras.

Metadados complementares são mesclados; valores incompatíveis são reportados explicitamente. Casos estruturalmente irresolvíveis são bloqueantes e deixam `safeToApply` como `false`. No snapshot completo lido somente em memória, as 18 associações do DATA e as 18 do SEED resultaram em 29 associações semânticas únicas, sem perda nem conflitos de `altPlacements`.

### Central de Revisões + Soluções — 2026-09-20

Novo recurso funcional: uma fila própria, chamada `LESION_REVISIONS`, para o
usuário marcar qualquer lesão para revisão futura (ex: "otimizar
diagnósticos diferenciais", "possível lesão duplicada", "corrigir
classificação") escrevendo um pedido livre. **Não deve ser confundida** com
o `REVIEW` do fluxo de estudo (Não revisado/Revisando/Dominado) nem com o
`SRS` do quiz — são três sistemas independentes.

No modal já existente de "Editar lesão" (apenas em edição, não ao criar
uma lesão nova), há uma opção "marcar para revisão" que abre um campo de
texto livre. Ao salvar, cria-se uma revisão vinculada à lesão com
`status: "pending"`, sem duplicar acidentalmente a mesma revisão pendente
para a mesma lesão com o mesmo texto.

Dois ícones compactos no cabeçalho, à esquerda de `Quiz & Progresso`:

- 🔔 **Revisões pendentes** — conta `status === "pending"` ou
  `status === "rejected"` (uma solução recusada volta automaticamente para
  cá). Aparência apagada e sem contador quando não há nada pendente; abre
  um painel com lesão, seção/sítio, data, pedido e status, mais recentes
  primeiro, com atalho para abrir a lesão correspondente.
- 💡 **Soluções disponíveis** — conta `status === "solution_ready"`. Abre um
  painel com o pedido original, a solução proposta e os botões
  `✓ aceitar` / `✕ recusar`.

Aceitar aprova a solução **dentro do workflow de revisão**; esta primeira
versão **não aplica nenhuma alteração em `DATA` automaticamente** — isso
fica para uma etapa futura. Recusar pede um motivo opcional, mantém a
solução e o histórico (nada é apagado) e devolve a revisão para
"pendentes". Cada revisão guarda um histórico cronológico completo
(`created`, `solution_created`, `accepted`, `rejected`, `reopened`).

A API interna já está pronta para uma futura IA processar
`getPendingReviews()` diariamente e registrar propostas via
`setReviewSolution()` — sem que essa IA/agendamento tenha sido implementada
nesta entrega.

Persistência via a mesma camada `storage.get/set` (IndexedDB) usada por
`REVIEW`/`SRS`/`SESSIONLOG`, sobrevivendo a F5, e incluída no backup/export
e na importação de backup completo (`lesionRevisions`). Não sincroniza com
o Firebase nesta primeira versão — é local por dispositivo, para não tocar
na camada de reconciliação/sincronização remota. `DATA`, `REVIEW` e `SRS`
não são lidos nem escritos por este recurso.

Testado em `tests/lesion-review.test.js` (20 cenários: criação, duplicidade,
persistência após reload simulado, contadores, transições de status,
aceitar/recusar, histórico completo preservado, presença de
`lesionRevisions` no export/import, e atualização imediata dos badges do
header em cada transição) e por checagens estáticas atualizadas em
`tests/critical-flows.test.js` (ver seção de Testes abaixo).

**Hotfix (mesmo dia):** os ícones 🔔/💡 do header só atualizavam depois de
F5, porque as funções de mutação não chamavam a atualização do header
sozinhas (só os caminhos de tela chamavam). Passaram a atualizar o header
diretamente ao terminar, então o badge reage imediatamente mesmo quando são
chamadas fora da UI (ex: console, ou a futura IA processando revisões sem
browser).

### Central de Revisões v2 — dois aceites humanos (2026-09-20)

Depois de testar a v1 manualmente, o workflow evoluiu pra separar duas
decisões: **autorizar** uma correção proposta (1º aceite — só então algo é
escrito na lesão de verdade) e **validar** o resultado depois de aplicado
(2º aceite — manter ou desfazer). A IA nunca tem os dois aceites: seu limite
é `getPendingReviews()` → analisar → `setReviewSolution()`, e parar aí.

Nova máquina de estados: `pending → proposed → applied_pending_validation →
accepted` (manteve) ou `→ rejected` em dois pontos possíveis (proposta
recusada antes de tocar a lesão, ou correção aplicada e desfeita via
rollback) — os dois casos voltam pra fila 🔔 automaticamente, prontos pra
uma nova tentativa. Cada autorização cria uma tentativa própria
(`attempts[]`) com um snapshot completo da lesão tirado imediatamente antes
da escrita; um "não funcionou — desfazer" restaura a lesão exatamente
daquele snapshot (nunca de uma tentativa antiga). `proposedChanges` só
aceita uma allowlist fixa de campos de conteúdo (`name`, `notes`,
`classification`, `tags`, `enTerm`) — nada de identidade, imagem, ownership,
Cloudinary ou Firebase passa pela validação estruturada.

💡 Soluções disponíveis ganhou duas abas: **Propostas** (ainda não tocaram a
lesão) e **Validar correções** (já aplicadas, aguardando o 2º aceite, com
antes/depois e um atalho pra ver a lesão corrigida). Quando uma correção é
autorizada e aplicada, ou desfeita, isso usa o mesmo `saveData()` que o
formulário de edição já usa — a única forma de mudar `DATA` sem divergir do
Firebase; a fila de revisões em si continua só local, sem sincronizar.

`tests/lesion-review.test.js` foi reescrito para a nova máquina: **29 PASS,
0 FAIL**, cobrindo os 7 cenários (manual → proposta → recusar/autorizar →
aprovar/desfazer → nova tentativa), validação de `proposedChanges` inválido
ou de campo fora da allowlist sem tocar `DATA`, falha de aplicação sem
mutação parcial, histórico completo numa cadeia longa, persistência de
snapshots após reload, badges reagindo em cada transição, e duas checagens
estáticas (só autorizar/rollback tocam `DATA`; nenhuma função de
processamento cria revisão nova). Ver `AI.md` para os detalhes completos.

Validação: motor V1+V2 com **119 PASS, 0 FAIL e 5 TODO**; fluxos críticos com **14 PASS e 0 FAIL**. O teste de duplicatas mantém exclusivamente o FAIL histórico das 28 entradas malformadas de `DUPLICATE_PAIRS_V171`, fora do escopo desta alteração.

### Legibilidade do Quiz clínico (2026-09-20)

Mudança só visual (CSS), sem tocar lógica de questões/correção/`SESSIONLOG`/
`SRS`/`DATA`/imagens/Central de Revisões. No Quiz & Progresso, o painel
"CASO TEÓRICO" (lesão sem imagem) parava de ficar minúsculo numa área vazia
enorme — agora ocupa a altura toda do painel, com título/descrição/chips de
características bem maiores. A pergunta ganhou uma classe dedicada com
`clamp(18px, …, 22px)` (antes ficava no padrão do navegador, ~16px). As
alternativas A/B/C/D ficaram com caixas mais altas, mais respiro e texto/
letra maiores — editado tanto na regra base quanto na regra
`.study-dashboard .quiz-mcq-option`, que é a que de fato vale dentro do Modo
Estudo embutido. A imagem, no caso com imagem, deixou de ficar limitada a
390px fixos e agora aproveita melhor um painel mais alto. Tudo usa
`clamp()`/media queries, sem zoom global nem valores fixos que quebrem
telas menores.

`tests/critical-flows.test.js` teve só as âncoras de linha reatualizadas
(deslocadas pelas novas regras no `<style>` do topo do arquivo): **20 PASS,
0 FAIL**. `tests/lesion-review.test.js` segue intacto: **29 PASS, 0 FAIL**.
Não há teste automatizado de layout visual no projeto — a confirmação de
que o resultado bate com o pedido depende de teste manual no navegador.

### Imagens dentro do Quiz clínico (2026-09-20)

O Quiz passou a mostrar TODAS as imagens de uma lesão, não só a primeira:
0 imagens continua no CASO TEÓRICO; 1 imagem continua simples, sem
controles; 2+ imagens ganham um carrossel (setas, "Imagem X de Y",
navegação circular e por teclado ←/→, que não interfere com campos de
texto nem com os modais abertos). Depois de responder, aparece
"🖼 Adicionar imagem a esta lesão", que abre um painel focado *sobre* o
Quiz — sem fechá-lo, sem perder questão/resposta/pontuação/progresso — pra
alimentar a lesão certa (sempre a da questão atual) sem sair da sessão.
Cada imagem é salva na hora, usando o mesmo `saveData()` seguro de sempre.

Nada foi reimplementado: o painel reaproveita `uploadToCloudinary()` e a
busca de imagens livres no Wikimedia Commons, que só precisou ser
"destravada" de dentro do formulário de edição (virou uma função
independente, parametrizada, sem mudar seu comportamento no formulário).
Nenhuma imagem de outra lesão é tocada, nenhuma é removida, nenhum ID de
asset muda, e a Central de Revisões/`REVIEW`/`SRS`/`SESSIONLOG`/`SEED`
continuam fora do escopo.

`tests/quiz-images.test.js` (novo): **18 PASS, 0 FAIL** — cobre
`addImageToLesionData()` dinamicamente e o restante (modal, reuso da busca,
carrossel, limpeza de listener) estaticamente. `tests/critical-flows.test.js`
segue **20 PASS, 0 FAIL** (só âncoras reatualizadas) e
`tests/lesion-review.test.js` intacto: **29 PASS, 0 FAIL**. Sem jsdom/
dependências de browser no projeto, a confirmação visual e interativa
(carrossel de verdade, teclado, modal sobre o Quiz) depende de teste manual.

### Ctrl+V, Quadro de Imagem e revisão pelo Quiz (2026-09-20)

O modal `🖼 Adicionar imagem a esta lesão` aceita agora imagens coladas por
`Ctrl+V` somente enquanto está aberto e oferece também `▦ criar quadro de
imagens`. O quadro usa o mesmo construtor do formulário de edição, agora
parametrizado pela lesão e por callback; upload, URL e Commons permanecem
disponíveis. Toda adição continua vinculada à lesão da questão atual e
atualiza o visualizador imediatamente.

Após responder, aparece também `🔔 Marcar para revisão`. O pequeno modal
mostra o nome da lesão e recebe texto livre, salvando exclusivamente por
`createLesionReview(lesionId, requestText)`. Isso apenas registra o problema
na fila `LESION_REVISIONS`; não corrige/remove imagens e não reinicia questão,
pontuação, `SRS` ou `SESSIONLOG`. Cancelar não cria revisão, duplicatas
idênticas continuam bloqueadas e o badge 🔔 reage imediatamente.

Cada miniatura desse modal mostra ainda `✏ Editar` e `🗑 Remover`, inclusive
em touchscreen. A edição altera somente a legenda. A remoção pede confirmação
e desassocia apenas aquela imagem da lesão atual (sem exclusão remota nesta
versão). Ambas persistem e atualizam imediatamente galeria e visualizador do
Quiz; remover a única imagem devolve o caso para `CASO TEÓRICO`.

Cobertura atual: `tests/quiz-images.test.js` com **40 PASS** e
`tests/lesion-review.test.js` com **35 PASS**, além dos fluxos críticos.

### Upload diferido no editor de lesão (2026-09-20)

Imagens NOVAS adicionadas no formulário `Editar lesão` (Ctrl+V, selecionar
arquivo ou Wikimedia Commons) agora ficam **somente locais/temporárias**
enquanto o formulário está aberto: aparecem na hora (blob URL) e o arquivo
fica em memória, mas **nada é enviado ao Cloudinary antes de `Salvar`**. Isso
evita acumular assets de teste. Ao clicar em `Salvar`, só as imagens
temporárias que continuarem no formulário sobem ao Cloudinary; as que foram
removidas antes nunca são enviadas. Se um upload necessário falhar, a lesão
não é gravada e o Atlas avisa — nada é salvo pela metade.

`Cancelar` (ou Esc/clique fora) descarta as imagens temporárias sem enviar
nada e sem alterar os dados da lesão. Imagens que já estavam salvas continuam
sendo tratadas como sempre; remover uma delas apenas remove a referência (sem
exclusão remota automática nesta versão). URLs externas continuam sendo
salvas como URL, sem upload.

A estratégia anterior (uma Firebase Cloud Function para excluir assets do
Cloudinary) foi **descartada**: exigiria o plano Blaze. Não há mais backend,
`functions/`, `firebase.json`/`.firebaserc` nem segredo administrativo.

O mesmo vale para o **Quiz**: o modal "🖼 Adicionar imagem a esta lesão" agora é
transacional — Ctrl+V, arquivo, Commons e Quadro entram como imagens
temporárias (blob) num rascunho local, e **só o botão `concluído`** envia ao
Cloudinary as imagens novas que sobraram, aplica à lesão e persiste. Esc, clique
fora ou cancelar descartam o rascunho sem subir nada e sem alterar a lesão. O
Quiz permanece na mesma questão (sem tocar resposta, score, `SESSIONLOG` ou
`SRS`). Se um upload falhar, o modal continua aberto e nada é salvo pela metade.
Os helpers `buildPendingImage`/`uploadPendingImage` são compartilhados entre
Editar e Quiz (sem duplicar lógica).

Testes: `tests/quiz-images.test.js` com **56 PASS**.

### Cancelar um pedido de revisão (2026-09-20)

Na Central de Revisões (🔔) e na aba Propostas da Central de Soluções (💡),
pedidos ainda não aplicados podem ser encerrados com `✕ Cancelar pedido`. O
pedido NÃO é apagado: ele vira `cancelled`, sai das filas ativas (os badges 🔔
e 💡 caem na hora, sem F5) e continua visível no histórico com data/hora e
motivo (opcional). Isso serve para quando você mesmo corrigiu o problema, para
quando marcou por engano, ou quando a revisão deixou de ser necessária. Não é
possível cancelar uma correção já aplicada aguardando validação — nesse caso
use o fluxo próprio `✓ funcionou — manter` / `↩ não funcionou — desfazer`.
Nada em `DATA` é alterado pelo cancelamento.

Testes: `tests/lesion-review.test.js` com **48 PASS**.
