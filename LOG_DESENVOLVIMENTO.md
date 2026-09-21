# Diario de desenvolvimento

Este arquivo registra, em linguagem simples, as mudancas importantes realizadas no projeto. Ele existe para que seja possivel entender o que aconteceu, quando aconteceu e como retornar a um estado anterior com seguranca.

## Conceitos basicos

### Para que serve o Git

Git e uma ferramenta que acompanha o historico dos arquivos do projeto. Ele permite comparar versoes, identificar o que mudou e, quando necessario, recuperar um estado anterior.

O Git deste projeto foi inicializado localmente. Isso significa que o historico esta neste computador. Ter Git local nao significa que o projeto foi publicado no GitHub, nem que qualquer mudanca foi enviada para a internet.

### Para que servem os commits

Um commit e como um ponto de controle identificado no historico. Ele registra um conjunto de arquivos em um determinado momento, junto com uma mensagem que explica o motivo daquele registro.

Commits ajudam a:

- comparar o antes e o depois;
- descobrir quando uma mudanca foi feita;
- retornar com seguranca a uma versao conhecida;
- documentar etapas aprovadas do desenvolvimento.

Um commit nao publica automaticamente o projeto no GitHub. Publicar ou enviar commits exige uma acao separada.

### Ponto zero deste projeto

O commit abaixo e o **PONTO ZERO**, isto e, a referencia de seguranca anterior as alteracoes de desenvolvimento assistido pelo OpenCode:

```text
1d5e2a2 - "Backup inicial antes das alteracoes pelo OpenCode"
```

Esse identificador deve ser preservado como referencia historica. Ele nao deve ser usado automaticamente para restaurar arquivos sem antes verificar o estado atual do projeto.

### Antes de qualquer recuperacao

Execute primeiro:

```text
git status
```

Esse comando mostra se existem arquivos novos, modificados ou preparados para commit. A verificacao evita apagar por engano um trabalho recente que ainda nao foi registrado.

Comandos destrutivos de recuperacao nao devem ser executados sem:

- verificar `git status`;
- entender quais mudancas ainda nao foram salvas em commit;
- confirmar qual versao deve ser recuperada;
- obter autorizacao do usuario.

## Registro 001

**Data:** 18/09/2026  
**Evento:** criacao do ambiente seguro de desenvolvimento com OpenCode.  
**Modelo inicial:** GPT-5.6 Sol.  
**Git:** inicializado localmente.  
**Commit de seguranca inicial:**

```text
1d5e2a2 - "Backup inicial antes das alteracoes pelo OpenCode"
```

### Objetivo

Preparar o projeto para receber ajuda de inteligencia artificial com regras claras de seguranca, preservacao do trabalho existente e registro das mudancas futuras.

### Estado inicial

- O projeto ja possuia o Atlas Radiologico em um unico arquivo HTML.
- Ja existiam documentos com decisoes tecnicas e historico do projeto.
- O Git local ja possuia um commit de seguranca anterior as futuras alteracoes.
- Esse commit foi definido como o PONTO ZERO para comparacoes e eventual recuperacao.

### Arquivos criados nesta etapa

- `AGENTS.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi feito

- As regras existentes foram reunidas em instrucoes permanentes para agentes de IA.
- Foi criado este diario para explicar mudancas de forma acessivel a quem nao e desenvolvedor.
- Nenhum arquivo existente da aplicacao foi alterado nesta etapa.
- Nenhum commit novo foi criado nesta etapa.

## COMO PEDIR AJUDA SE ALGO DER ERRADO

Ao pedir ajuda, envie estas quatro informacoes:

1. **O que estava tentando fazer:** descreva o objetivo e, se souber, o botao ou comando utilizado.
2. **O que apareceu na tela:** copie a mensagem de erro ou envie uma captura de tela, sem incluir dados identificaveis de pacientes.
3. **Resultado de `git status`:** execute o comando na pasta do projeto e envie todo o texto exibido.
4. **Ultimo commit conhecido como funcional:** informe o identificador e a mensagem. Se nao souber outro, mencione o PONTO ZERO `1d5e2a2`.

Nao execute comandos de recuperacao sugeridos fora de contexto antes de alguem verificar essas informacoes. Uma tentativa apressada de recuperacao pode apagar mudancas que ainda podem ser preservadas.

## Modelo para futuras alteracoes

Copie e preencha este modelo ao registrar uma nova etapa:

```markdown
## Registro NNN

**Numero da alteracao:** NNN
**Data:** DD/MM/AAAA

### Objetivo

Explique em linguagem simples o que se pretendia resolver ou acrescentar.

### Estado antes

Descreva como o projeto funcionava antes e qual problema foi observado.

### Arquivos modificados

- `caminho/do/arquivo`

### O que foi alterado

Descreva as mudancas realizadas sem depender de termos tecnicos.

### Testes realizados

Liste as verificacoes e testes realmente executados. Se nenhum teste foi possivel, explique o motivo.

### Resultado

Informe se a alteracao funcionou, se ficou parcial ou se ainda existe algum risco conhecido.

### Commit apos aprovacao

Registre o identificador e a mensagem do commit. Se ainda nao houve aprovacao ou commit, escreva "Ainda nao criado".

### Instrucoes de recuperacao, se necessarias

Explique como retornar ao estado anterior. Antes de qualquer recuperacao, executar `git status` e confirmar que nenhum trabalho recente sera perdido.
```

## Regras para manter este diario util

- Registre apenas o que realmente foi feito.
- Nao declare testes que nao foram executados.
- Use linguagem simples e explique termos tecnicos quando forem necessarios.
- Liste todos os arquivos modificados.
- Registre o commit somente depois da aprovacao e da criacao real do commit.
- Nunca inclua dados identificaveis de pacientes, senhas, tokens ou outras credenciais.

## Registro 002

**Numero da alteracao:** 002  
**Data:** 18/09/2026

### Objetivo

Padronizar os nomes dos tres arquivos principais do projeto, retirando os carimbos de data e hora dos nomes para facilitar sua identificacao e manutencao.

### Estado antes

Os arquivos principais usavam os nomes `AI(20260918-233115).md`, `README(20260918-233118).md` e `index(20260918-233112).html`. As instrucoes permanentes em `AGENTS.md` ainda apontavam para os nomes antigos da documentacao.

### Arquivos renomeados

- `AI(20260918-233115).md` para `AI.md`
- `README(20260918-233118).md` para `README.md`
- `index(20260918-233112).html` para `index.html`

### Arquivos com conteudo modificado

- `AGENTS.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

As referencias atuais de leitura obrigatoria em `AGENTS.md` foram atualizadas para `AI.md` e `README.md`. Este registro documenta a padronizacao; nenhuma funcionalidade da aplicacao, dado do `SEED` ou conteudo clinico foi alterado.

### Testes realizados

Foi feita uma busca em todos os arquivos do projeto pelos tres nomes antigos. As unicas referencias atuais encontradas estavam em `AGENTS.md`. Ao final, o estado do Git foi inspecionado.

### Resultado

Os nomes principais ficaram padronizados e as instrucoes permanentes agora apontam para os arquivos atuais. Os nomes antigos permanecem neste registro apenas para documentar quais arquivos foram renomeados.

### Commit apos aprovacao

Ainda nao criado.

### Instrucoes de recuperacao, se necessarias

Antes de qualquer recuperacao, executar `git status` e confirmar que nenhum trabalho recente sera perdido. As renomeacoes e as atualizacoes de conteudo devem ser avaliadas em conjunto antes de qualquer reversao.

## ALTERAÇÃO 001 — Testes estáticos de integridade

**Número da alteração:** 001
**Data:** 18/09/2026

### Objetivo

Criar uma verificação automatizada e estática da integridade básica dos dados e do JavaScript contidos em `index.html`, sem abrir nem executar a aplicação.

### Estado antes

Não havia arquivo de teste disponível em `tests/`, embora a documentação já mencionasse o comando obrigatório para a detecção de duplicatas.

### Arquivo criado

- `tests/duplicate-detection.test.js`

### Arquivos de documentação modificados

- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

O novo teste usa exclusivamente recursos nativos do Node.js. Ele lê o `index.html` como texto e não executa a aplicação. Também não acessa IndexedDB, Firebase, Firestore, Cloudinary ou a rede.

A análise estática verificou:

- existência e leitura de `index.html`;
- localização segura do `SEED`;
- 1.213 registros no `SEED` atual;
- presença, padrão `seed_<N>` e unicidade dos IDs;
- ausência de duplicatas exatas por `s + site + name`;
- estrutura de `DUPLICATE_PAIRS_V171`;
- sintaxe do JavaScript embutido, sem executá-lo.

### Testes realizados

```text
node tests/duplicate-detection.test.js
node --check tests/duplicate-detection.test.js
```

O teste principal terminou com **6 PASS e 1 FAIL**. A verificação sintática do próprio arquivo de teste terminou sem erros.

### Resultado

Foram confirmados 1.213 registros, IDs válidos e únicos, nenhuma duplicata exata atual por `s + site + name` e sintaxe válida no JavaScript embutido.

O único FAIL aponta que as 28 entradas de `DUPLICATE_PAIRS_V171` estão estruturalmente incorretas. Esse é um defeito preexistente conhecido e o FAIL é esperado. O defeito permanece propositalmente **NÃO CORRIGIDO** nesta alteração, para ser tratado apenas em uma etapa específica futura.

Nenhuma alteração foi feita em `index.html`, no `SEED`, em conteúdo clínico ou em integrações externas.

### Commit após aprovação

Ainda não criado.

### Instruções de recuperação, se necessárias

Antes de qualquer recuperação, executar `git status` e confirmar que nenhum trabalho recente será perdido. Para retirar somente esta alteração, devem ser avaliados em conjunto o arquivo de teste criado e os três registros documentais associados; não alterar `index.html` para essa recuperação.

## ALTERAÇÃO 002 — Testes isolados dos fluxos críticos

**Número da alteração:** 002
**Data:** 18/09/2026

### Objetivo

Ampliar a rede de segurança com testes isolados dos fluxos de recuperação do `SEED` e importação de backup, documentando comportamentos perigosos já existentes sem executar a aplicação completa e sem corrigir os defeitos encontrados.

### Estado antes

A Alteração 001 verificava a integridade estática do `SEED` e do JavaScript, mas ainda não havia testes isolados para a recuperação automática nem para a ordem de validação e mutação durante a importação de backups.

### Arquivo criado

- `tests/critical-flows.test.js`

### Arquivos de documentação modificados

- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

O novo teste usa somente recursos nativos do Node.js. Ele analisa o `index.html` estaticamente e executa apenas os trechos necessários em um contexto `vm` isolado, com mocks e stubs locais. Não acessa IndexedDB real, Firebase, Firestore, Cloudinary ou a rede.

Foram confirmados os seguintes comportamentos:

- `loadData()` chama `recoverCanonicalBaseV154()` automaticamente;
- `hasBrokenMigrationArtifacts()` não possui chamadas atualmente;
- em isolamento, `recoverCanonicalBaseV154()` pode reinserir um registro canônico do `SEED` ausente no estado persistido;
- um backup cuja estrutura interna é inválida pode iniciar mutações e persistência antes de existir validação completa.

O inventário estático atual do handler de importação encontrou:

- 10 atribuições de estado;
- 4 chamadas diretas a `storage.set`;
- 2 chamadas a `pushToFirebaseNow`;
- rotinas auxiliares de persistência, incluindo `saveData`, `saveSRS`, `saveSessionLog`, `saveOrder` e `saveSiteOrder`.

### Testes realizados

```text
node --check tests/critical-flows.test.js
node tests/critical-flows.test.js
node tests/duplicate-detection.test.js
```

Resultados atuais esperados:

- `tests/critical-flows.test.js`: **6 PASS e 2 FAIL** conhecidos;
- `tests/duplicate-detection.test.js`: **6 PASS e 1 FAIL** conhecido em `DUPLICATE_PAIRS_V171`.

Os dois FAILs do novo teste representam defeitos preexistentes: recuperação automática do `SEED` durante `loadData()` e início de mutação/persistência por backup estruturalmente inválido.

### Resultado

Os fluxos críticos passaram a ter testes reproduzíveis e isolados. **Nenhum dos defeitos detectados foi corrigido.** O arquivo `index.html` permaneceu intocado, assim como o `SEED`, `DUPLICATE_PAIRS_V171` e os arquivos de teste após sua aprovação.

Observação técnica: alguns testes de localização usam números de linha exatos do `index.html` atual. Esses números funcionam como âncoras do estado analisado e poderão precisar ser atualizados quando `index.html` for legitimamente modificado. Uma mudança isolada de linha não deve ser interpretada automaticamente como regressão funcional.

### Commit após aprovação

Ainda não criado.

### Instruções de recuperação, se necessárias

Antes de qualquer recuperação, executar `git status` e confirmar que nenhum trabalho recente será perdido. Para retirar somente a Alteração 002, avaliar em conjunto `tests/critical-flows.test.js` e os registros correspondentes nos três documentos; não modificar `index.html` nem o teste da Alteração 001.

## ALTERAÇÃO 003 — Impedir recuperação automática incondicional do SEED

**Número da alteração:** 003
**Data:** 18/09/2026
**Commit-base:** `88decec` — `Adiciona testes dos fluxos criticos`

### Objetivo

Impedir que o carregamento normal reponha automaticamente registros canônicos do `SEED` ausentes no estado persistido.

### Estado antes

Depois de carregar e interpretar `DATA` do armazenamento persistido, `loadData()` executava sempre `recoverCanonicalBaseV154()`. A Alteração 002 demonstrou em ambiente isolado que essa função é capaz de reinserir registros canônicos ausentes.

Antes da correção, os resultados eram:

- `tests/critical-flows.test.js`: **6 PASS e 2 FAIL** conhecidos;
- `tests/duplicate-detection.test.js`: **6 PASS e 1 FAIL** conhecido.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js`
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

Esta foi a primeira alteração funcional realizada em `index.html` nesta sequência de trabalho. A mudança funcional consistiu exclusivamente na remoção de uma única chamada automática dentro de `loadData()`:

```javascript
await recoverCanonicalBaseV154();
```

Nenhuma nova política automática de recuperação foi criada. `hasBrokenMigrationArtifacts()` continua sem conexão automática com o fluxo de carregamento. `recoverCanonicalBaseV154()` continua existindo e seu comportamento, quando acionada explicitamente, permanece coberto pelo teste dinâmico isolado.

`tests/critical-flows.test.js` foi atualizado somente para representar o estado legítimo após essa remoção:

- âncora do handler de importação: 6643 para 6642;
- chamadas esperadas de `recoverCanonicalBaseV154()`: `[4735]` para `[]`;
- verificação estática alterada para exigir ausência da chamada automática;
- teste funcional de segurança preservado para detectar qualquer reintrodução futura.

O `SEED` permaneceu com exatamente 1.213 registros e seu conteúdo não foi alterado. `DUPLICATE_PAIRS_V171` permaneceu inalterado, incluindo as mesmas 28 entradas malformadas conhecidas.

### Testes realizados

```text
node --check tests/critical-flows.test.js
node tests/critical-flows.test.js
node tests/duplicate-detection.test.js
```

Depois da correção:

- a verificação sintática de `tests/critical-flows.test.js` passou;
- `tests/critical-flows.test.js`: **7 PASS e 1 FAIL** conhecido;
- `tests/duplicate-detection.test.js`: **6 PASS e 1 FAIL** conhecido.

O teste de segurança que proíbe a chamada automática em `loadData()` mudou de FAIL para PASS. O FAIL remanescente dos fluxos críticos continua demonstrando que um backup estruturalmente inválido consegue iniciar mutação/persistência. O FAIL de integridade continua demonstrando as mesmas 28 entradas malformadas em `DUPLICATE_PAIRS_V171`.

### Resultado

A recuperação canônica deixou de ser acionada automaticamente em todo carregamento normal. O defeito da importação **não foi corrigido** nesta alteração. `DUPLICATE_PAIRS_V171` também **não foi corrigido** nesta alteração.

### Commit após aprovação

Ainda não criado.

### Instruções de recuperação, se necessárias

Antes de qualquer recuperação, executar `git status` e confirmar que nenhum trabalho recente será perdido. A reversão funcional desta alteração reintroduziria a chamada automática removida e, portanto, não deve ser feita sem nova revisão do risco de reposição de dados a partir do `SEED`.

## ALTERAÇÃO 004 — Validação segura da importação de backup

**Número da alteração:** 004
**Data:** 19/09/2026
**Commit-base:** `3e044ea` — `Impede recuperacao automatica do SEED`

### Objetivo

Garantir que backups estruturalmente inválidos sejam rejeitados antes de qualquer alteração do estado da aplicação, persistência local ou sincronização remota, preservando a compatibilidade dos formatos legítimos já aceitos.

### Estado antes

O importador verificava somente o envelope do backup completo ou se o backup legado era um array. Registros sem estrutura mínima e IDs duplicados chegavam às atribuições globais e operações de persistência. Os testes ampliados reproduziram três casos: backup completo malformado, backup legado inválido e IDs duplicados.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js`
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

Foi adicionada uma validação pequena e reutilizável dentro do handler de importação. Ela é aplicada ao array legado e ao campo `data` do backup completo antes de confirmação, mutação ou persistência.

Cada registro deve:

- ser objeto não nulo e não array;
- possuir `id`, `name`, `s` e `site` como strings não vazias nem formadas apenas por espaços;
- possuir um `id` que não se repita dentro do mesmo backup.

IDs personalizados continuam permitidos; não foi exigido o padrão `seed_<N>`. Permanecem opcionais `backupVersion`, `appVersion`, `exportedAt`, `review`, `srs`, `sessionLog`, `sectionOrder`, `siteOrder`, `tags`, `notes`, `inc`, `images`, `links` e `classification`. A política de tipos e fallbacks desses campos não foi alterada.

`createSafetySnapshot()` permanece inerte. Sua chamada foi apenas deslocada para depois da validação e da confirmação, imediatamente antes da primeira mutação. Nenhum mecanismo de snapshot foi implementado.

Os testes isolados passaram a cobrir também backup legado inválido, backup completo mínimo válido, backup legado válido com ID personalizado, IDs duplicados, cancelamento e envelopes inválidos.

### Testes realizados

```text
node --check tests/critical-flows.test.js
node tests/critical-flows.test.js
node tests/duplicate-detection.test.js
```

Resultados validados antes da documentação:

- `tests/critical-flows.test.js`: **14 PASS e 0 FAIL**;
- `tests/duplicate-detection.test.js`: **6 PASS e 1 FAIL** conhecido e não relacionado;
- `SEED`: exatamente 1.213 registros.

### Resultado

Backups inválidos passam a ser rejeitados sem mutação ou persistência, enquanto backups completos mínimos, backups legados válidos e IDs personalizados permanecem compatíveis.

Não foram corrigidos nesta alteração: as 28 entradas malformadas de `DUPLICATE_PAIRS_V171`, a implementação inerte de snapshots, a política de tipos de `review`/`srs`/`sessionLog`/`sectionOrder`/`siteOrder` ou qualquer outro defeito fora do fluxo de validação estrutural da importação.

### Commit após aprovação

Ainda não criado.

### Instruções de recuperação, se necessárias

Antes de qualquer recuperação, executar `git status` e confirmar que nenhum trabalho recente será perdido. Reverter esta alteração retiraria as validações anteriores à mutação e voltaria a permitir que backups estruturalmente inválidos alcançassem persistência e sincronização.

## ALTERAÇÃO 006 — Hardening de `altPlacements` no reconciliador V2 inerte

**Número da alteração:** 006

**Data:** 19/09/2026

**Commit-base:** `8b1e274` — `Valida importacao de backups antes de alterar dados`

### Objetivo

Impedir que duas cópias da mesma identidade percam silenciosamente associações secundárias (`altPlacements`) durante uma futura reconciliação, sem conectar o reconciliador V2 à aplicação.

### Estado antes

O V2 já reconciliava o catálogo por `name + s + site`, mas o tratamento herdado do V1 só copiava `altPlacements` quando um dos lados estava vazio. Se ambos possuíssem valores diferentes, um lado poderia ser descartado silenciosamente. O agente anterior havia iniciado uma função dedicada, mas a montagem do engine de teste ainda não incluía suas dependências e o teste antigo continuava documentando a limitação.

### Arquivos modificados

- `index.html`
- `tests/legacy-id-migration.test.js`
- `tests/critical-flows.test.js`
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `mergeAltPlacementsV2` passou a unir associações semanticamente diferentes e deduplicar equivalentes por `s + site` normalizados apenas para comparação.
- A representação original e campos extras são preservados; objetos complementares são mesclados recursivamente e arrays recebem união sem duplicatas.
- Divergências escalares são resolvidas pela prioridade determinística do V2 e registradas com ambos os valores. Identidades incompletas e incompatibilidades estruturais são bloqueantes.
- Conflitos bloqueantes alimentam `safeToApply=false` pela trava já existente.
- O mesmo hardening é aplicado ao fold DATA+DATA, ao merge DATA+SEED e à materialização a partir do SEED.
- O engine isolado de testes passou a carregar as novas funções na ordem correta de dependências.
- O teste que documentava descarte silencioso foi substituído por cenários positivos, bloqueantes, determinísticos, idempotentes e pelo snapshot completo somente leitura.

O V1 não foi alterado. O V2 continua sem call sites de produção. Não houve escrita em IndexedDB, Firebase/Firestore, Cloudinary ou no snapshot.

### Testes realizados

```text
node --check tests/legacy-id-migration.test.js
node tests/legacy-id-migration.test.js
node --check tests/critical-flows.test.js
node tests/critical-flows.test.js
node tests/duplicate-detection.test.js
git diff --check
```

Resultados:

- V1+V2: **119 PASS, 0 FAIL e 5 TODO**;
- fluxos críticos: **14 PASS e 0 FAIL**;
- integridade/duplicatas: **6 PASS e 1 FAIL** histórico nas mesmas 28 entradas malformadas de `DUPLICATE_PAIRS_V171`;
- snapshot: 18 `altPlacements` no DATA, 18 no SEED, 29 associações semânticas únicas no resultado, 0 conflitos de `altPlacements` e 0 bloqueios;
- JavaScript inline: sintaxe válida pela verificação estática existente.

### Resultado

O gap de perda silenciosa de `altPlacements` foi fechado no motor V2 inerte. O snapshot completo foi reconciliado somente em memória sem perda dessas associações. O reconciliador não foi integrado à produção e nenhum dado real foi alterado.

### Commit após aprovação

Ainda não criado.

### Instruções de recuperação, se necessárias

Antes de qualquer recuperação, executar `git status` e preservar as alterações anteriores já existentes no mesmo `index.html`. Uma eventual reversão deve remover somente o hardening do bloco V2 e seus testes/documentação correspondentes, sem tocar no V1, dashboard ou dados do acervo.

## ALTERAÇÃO 009 — Preservação das 1.213 identidades após F5

**Número da alteração:** 009
**Data:** 19/09/2026

### Objetivo

Impedir que o carregamento normal reduza 1.213 registros persistidos para 1.143.

### Estado antes

O boot renumerava o `SEED` por posição e recriava 70 IDs que também constavam
na lista histórica de duplicatas. O filtro final de `loadData()` removia esses
70 registros legítimos. A retirada anterior da detecção dinâmica não resolveu
o problema porque manteve justamente a lista histórica ativa.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js`
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

`SUPPRESSED_DUPLICATE_IDS_V172` passou a conter somente duplicatas encontradas
pela regra atual `s + site + name`. A lista antiga de 70 IDs permanece no
arquivo apenas como registro histórico e não participa mais da filtragem.

Foi adicionado um teste comportamental que executa a função `loadData()` real,
reproduz o renumeramento de boot e fornece 1.213 registros pelo armazenamento
simulado. Firebase, Cloudinary, IndexedDB real, imagens, REVIEW e SRS não são
acessados nem alterados.

### Testes realizados

- `node --check tests/critical-flows.test.js`: sem erros;
- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node tests/legacy-id-migration.test.js`: 156 PASS, 0 FAIL e 5 TODO;
- `node tests/duplicate-detection.test.js`: 6 PASS e 1 FAIL histórico nas 28
  entradas malformadas de `DUPLICATE_PAIRS_V171`;
- `git diff --check`: sem erros de whitespace.

### Resultado

O cenário automatizado reproduziu primeiro a falha `1213 -> 1143`. Depois da
correção, a mesma execução de `loadData()` terminou e persistiu `1213 -> 1213`.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 010 — Central de Revisões + Soluções

**Número da alteração:** 010
**Data:** 20/09/2026

### Objetivo

Adicionar um recurso funcional novo, pedido pelo usuário: uma central onde
qualquer lesão pode ser marcada para revisão com um pedido escrito livre
(por exemplo "corrigir classificação" ou "possível lesão duplicada"), com
um fluxo simples de proposta de solução e aprovação/recusa manual — como
primeiro passo para, no futuro, uma inteligência artificial processar essas
revisões automaticamente (isso ainda **não** foi implementado nesta
entrega, só a estrutura que vai permitir).

### O que muda para quem usa o Atlas

No cabeçalho, ao lado esquerdo do botão "Quiz & Progresso", aparecem dois
ícones novos:

- 🔔 **Revisões pendentes** — fica apagado e sem número quando não há nada
  pendente. Quando existe pelo menos uma lesão marcada para revisão (ou uma
  solução recusada, que volta automaticamente para cá), o ícone acende e
  mostra a quantidade. Clicar nele abre a lista, com o nome da lesão,
  seção/sítio, data e o pedido escrito, da mais recente para a mais antiga.
- 💡 **Soluções disponíveis** — mesma lógica, mas para revisões que já
  receberam uma proposta de solução. Clicar abre a lista com o pedido
  original, a solução proposta e dois botões: ✓ aceitar ou ✕ recusar.

No formulário de "Editar lesão" (não aparece ao criar uma lesão nova), há
uma nova opção "marcar para revisão" que abre uma caixa de texto livre para
descrever o que precisa ser revisado.

**Importante:** aceitar uma solução, nesta primeira versão, não altera a
lesão automaticamente — só aprova a proposta dentro dessa central. Aplicar
de fato as mudanças na lesão fica para uma etapa futura, separada.

### Estado antes

Esse recurso não existia. Havia, no `index.html`, apenas dois botões vazios
já inseridos no cabeçalho (sem estilo, sem função, sem dado por trás) de uma
tentativa anterior interrompida de começar esta mesma tarefa — foram
aproveitados e completados nesta entrega, em vez de descartados.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas + stub novo)
- `tests/lesion-review.test.js` (novo)
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

Foi criada uma fila de dados própria, `LESION_REVISIONS`, guardada no mesmo
armazenamento local (IndexedDB) já usado pelo restante do Atlas, separada
do sistema de revisão do fluxo de estudo (`REVIEW`) e da repetição espaçada
do quiz (`SRS`) — os três continuam independentes. Ela sobrevive a F5 e foi
incluída no backup/exportação e na importação de backup completo, para não
se perder.

Nenhum dado clínico, imagem, classificação, ID, `SEED`, `REVIEW`, `SRS` ou
a reconciliação V2 foi alterado. Este recurso também não envia nada para o
Firebase nesta primeira versão — fica salvo só neste dispositivo, de
propósito, para não mexer na sincronização remota existente.

### Testes realizados

- `node --check tests/lesion-review.test.js`: sem erros;
- `node tests/lesion-review.test.js`: 18 PASS, 0 FAIL;
- `node --check tests/critical-flows.test.js`: sem erros;
- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node tests/duplicate-detection.test.js`: 6 PASS e 1 FAIL histórico
  (conhecido, não relacionado, nas 28 entradas malformadas de
  `DUPLICATE_PAIRS_V171`);
- `node tests/legacy-id-migration.test.js`: 156 PASS, 0 FAIL e 5 TODO (não
  tocado por esta alteração);
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Os 18 cenários novos cobrem: criar uma revisão; ela sobreviver a um reload
simulado; o contador de pendências; a transição de pendente para "solução
pronta"; o contador de soluções; aceitar uma solução; recusar uma solução;
uma solução recusada voltar sozinha para pendentes; o histórico completo
ficar preservado (nada apagado); e o backup/importação preservarem
`LESION_REVISIONS`. Nenhum teste pré-existente relacionado a dados, quiz ou
sincronização mudou de comportamento — só três âncoras de número de linha
em `tests/critical-flows.test.js` precisaram ser atualizadas, porque o
código novo foi inserido antes das funções que esse teste localiza pela
posição no arquivo (comportamento já documentado como esperado nesse
próprio teste).

### Teste manual recomendado (não executado nesta sessão — precisa de login)

1. Abrir o Atlas, entrar com a conta autorizada.
2. Editar qualquer lesão, marcar "marcar para revisão", escrever um pedido
   e salvar. Confirmar que o ícone 🔔 acende com "1".
3. Abrir 🔔, conferir nome da lesão, seção/sítio, data e pedido. Clicar em
   "histórico" e ver a entrada "revisão criada".
4. Recarregar a página (F5) e conferir que o 🔔 continua mostrando "1"
   (persistência).

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 011 — Hotfix: badges do header não atualizavam sem F5

**Número da alteração:** 011
**Data:** 20/09/2026

### Objetivo

Corrigir um bug encontrado em teste manual da Central de Revisões (Alteração
010): depois de propor uma solução para uma revisão pelo console do
navegador, a lâmpada 💡 continuava apagada e o sino 🔔 continuava mostrando
"1" — mesmo a solução tendo sido registrada corretamente. Só sumia/aparecia
depois de recarregar a página.

### Causa

As quatro funções que mudam o estado de uma revisão (`createLesionReview`,
`setReviewSolution`, `acceptReviewSolution`, `rejectReviewSolution`) nunca
atualizavam os ícones do header sozinhas — isso só acontecia pelos caminhos
de tela (salvar o formulário, clicar em aceitar/recusar no painel). Usar
essas funções de outro jeito (como pelo console, do jeito que uma futura IA
vai usar) deixava a tela desatualizada até um F5.

### O que foi alterado

As quatro funções agora atualizam os ícones do header sozinhas, assim que
terminam de salvar a mudança — sem precisar de F5, sem timer, sem recarregar
nada. Nenhum dado clínico, imagem, `SEED`, `REVIEW`, `SRS` ou sincronização
com a nuvem foi tocado.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js` (2 testes novos)
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node tests/lesion-review.test.js`: 20 PASS, 0 FAIL (incluindo os 2 testes
  novos que reproduzem exatamente o cenário relatado);
- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Reproduzi o cenário relatado num teste automatizado antes de corrigir (o
badge ficava com o número antigo depois de `setReviewSolution()`), confirmei
a falha, apliquei a correção e o mesmo teste passou a confirmar a atualização
imediata nas quatro transições (criar → propor solução → aceitar, e
separadamente criar → propor solução → recusar → volta pra pendentes).

### Teste manual recomendado (não executado nesta sessão — precisa de login)

1. Repetir o cenário relatado: editar uma lesão, marcar para revisão,
   salvar. Confirmar 🔔 = 1 imediatamente.
2. Pelo console do navegador, chamar `setReviewSolution('<id da revisão>',
   'texto da proposta')`. Confirmar que 🔔 zera e 💡 vira 1 **sem** dar F5.
3. Abrir 💡, clicar em "✓ aceitar". Confirmar que 💡 zera imediatamente.
4. Repetir criando outra revisão e recusando a solução pelo painel — 🔔 deve
   voltar a mostrar 1 imediatamente.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 012 — Central de Revisões: dois aceites antes de qualquer mudança de verdade na lesão

**Número da alteração:** 012
**Data:** 20/09/2026

### Objetivo

Depois de usar a Central de Revisões (Alteração 010/011) num teste manual
real, o usuário pediu para o fluxo evoluir: antes, "aceitar" uma solução só
aprovava a ideia — nada era realmente escrito na lesão. Agora existem duas
decisões separadas, e as duas são sempre da pessoa, nunca de uma IA:

1. **Autorizar** a correção proposta — só a partir daqui algo é realmente
   escrito na lesão.
2. **Validar o resultado** depois de aplicado — manter, ou desfazer e voltar
   exatamente como estava.

### O que muda para quem usa o Atlas

A lâmpada 💡 "Soluções disponíveis" agora abre com duas abas:

- **Propostas** — sugestões que ainda NÃO mudaram nada na lesão. Mostra o
  pedido original, a sugestão e um resumo "de → para" dos campos que
  seriam alterados. Botões: `✓ autorizar correção` ou `✕ recusar proposta`.
- **Validar correções** — sugestões que JÁ foram aplicadas na lesão depois
  de autorizadas, mas ainda não confirmadas como definitivas. Mostra o
  "antes" e o "depois" de verdade, um atalho para ver a lesão já corrigida,
  e os botões `✓ funcionou — manter` ou `↩ não funcionou — desfazer`.

Ao clicar em "desfazer", a lesão volta exatamente como estava antes da
correção ter sido aplicada — nenhum dado é perdido, e a revisão volta
automaticamente para 🔔 Revisões pendentes, pronta para uma nova tentativa.

**Segurança:** só um conjunto limitado de campos "de conteúdo" (nome,
descrição, classificação, tags, termo em inglês) pode ser alterado por essa
via. Nada relacionado a excluir/fundir lesões, mover ou apagar imagens,
mudar a "dona" de uma imagem, ou qualquer operação no Cloudinary/Firebase
passa por esse caminho — isso continua exigindo edição manual, como sempre.

### Estado antes

A versão anterior (Alteração 010/011) tinha só uma decisão ("aceitar" ou
"recusar" uma proposta) e nunca alterava a lesão de verdade — "aceitar" era
só um registro simbólico de aprovação dentro da própria central.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js` (reescrito para a nova máquina de estados)
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node tests/lesion-review.test.js`: 29 PASS, 0 FAIL;
- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node tests/legacy-id-migration.test.js`: 156 PASS, 0 FAIL e 5 TODO (não
  tocado por esta alteração);
- `node tests/duplicate-detection.test.js`: 6 PASS e 1 FAIL histórico
  (conhecido, não relacionado, nas 28 entradas malformadas de
  `DUPLICATE_PAIRS_V171` — não corrigido de propósito);
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Os testes cobrem, entre outros: criar uma revisão manualmente; propor uma
solução sem tocar a lesão; recusar uma proposta sem tocar a lesão; autorizar
e aplicar de verdade (com o "retrato" da lesão sendo tirado imediatamente
antes da mudança); aprovar e a mudança continuar valendo; desfazer e a
lesão voltar exatamente como estava; uma nova tentativa depois de desfazer
usar um retrato novo e independente do anterior; uma proposta com dados
inválidos ou com um campo fora dos permitidos nunca alterar a lesão; uma
tentativa de aplicar numa lesão que não existe mais não deixar nada
alterado pela metade; o histórico completo (o que foi pedido, proposto,
autorizado, aplicado, aprovado ou desfeito) nunca sendo apagado; tudo
sobrevivendo a um F5; e os ícones do cabeçalho reagindo imediatamente em
cada uma dessas transições.

Nenhum dado clínico, imagem, `SEED`, `REVIEW`, `SRS`, Firebase ou
Cloudinary foi alterado. A única mudança real em dados de lesão que este
recurso pode fazer é a estruturada e limitada descrita acima, sempre depois
de autorização explícita da pessoa.

### Teste manual recomendado (não executado nesta sessão — precisa de login)

1. Editar uma lesão, marcar para revisão, escrever um pedido e salvar.
2. Pelo console do navegador, chamar `setReviewSolution('<id da revisão>',
   'texto da proposta', {notes: 'novo texto de teste'})`. Abrir 💡, aba
   "Propostas" — conferir que o "de → para" aparece corretamente.
3. Clicar em "✓ autorizar correção". Conferir que a lesão já mudou
   (`notes` novo) e que o item foi para a aba "Validar correções".
4. Clicar em "↩ não funcionou — desfazer". Conferir que a lesão voltou ao
   texto original e que 🔔 voltou a mostrar a revisão como pendente.
5. Repetir autorizando de novo e, desta vez, clicar em "✓ funcionou —
   manter" — conferir que a mudança permanece e os dois ícones zeram.

### Commit após aprovação

Commit `d439546` (mensagem "Adiciona fluxo seguro de revisoes e solucoes"),
já criado após teste manual aprovado pelo usuário.

## ALTERAÇÃO 013 — legibilidade do Quiz clínico (pergunta, alternativas, caso sem imagem)

**Número da alteração:** 013
**Data:** 20/09/2026

### Objetivo

No Quiz & Progresso em tela cheia, quando a lesão não tem imagem, o painel
esquerdo mostrava "CASO TEÓRICO" com as características em chips minúsculos
— exatamente a principal pista para responder, quase ilegível — dentro de
uma área enorme e vazia. A pergunta e as alternativas A/B/C/D também
estavam pequenas demais.

### O que mudou

- **Caso sem imagem:** o painel "CASO TEÓRICO" agora usa toda a altura
  disponível (em vez de ficar centralizado numa ilha pequena dentro de uma
  área vazia), com título maior, descrição maior e as características em
  chips bem maiores (~16–19px, mais respiro entre eles).
- **Pergunta** ("Qual é o diagnóstico mais provável?"): foi de ~16px pro
  padrão do resto do app pra um tamanho dedicado de ~18–22px conforme a
  largura da tela.
- **Alternativas A/B/C/D:** caixas mais altas, mais respiro, texto maior
  (~15–18px) e o círculo da letra maior — mais fácil de ler e de clicar.
- **Caso com imagem:** a imagem passou a aproveitar melhor a altura do
  painel (antes ficava limitada a 390px fixos, mesmo com o painel bem mais
  alto); pergunta/alternativas recebem a mesma melhoria de legibilidade.
- Em telas menores, tudo se ajusta sozinho (usa `clamp()`/media queries,
  sem valores gigantes fixos que quebrariam telas pequenas); nenhum zoom
  global foi usado.

### O que NÃO mudou

Lógica de geração das questões, respostas corretas, pontuação, SESSIONLOG,
SRS, DATA, imagens, busca de imagens, Firebase/Cloudinary e a Central de
Revisões — nada disso foi tocado, só CSS e uma troca de `style` inline por
uma classe CSS no título da pergunta.

Foi deixado um comentário no código (sem nenhuma mudança visível ainda)
marcando onde entrará futuramente o atalho "🖼 Adicionar imagem a esta
lesão" depois de responder, pra não precisar reorganizar esse bloco depois.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node tests/lesion-review.test.js`: 29 PASS, 0 FAIL (não deveria ter sido
  afetado por uma mudança só de CSS/quiz — confirmado que continua assim);
- `git diff --check`: sem erros de espaço em branco.

Esta é uma mudança visual/CSS. Não existe teste automatizado de layout
visual no projeto; a confirmação visual (pergunta legível, alternativas
maiores, caso sem imagem preenchendo bem o painel, responsividade) precisa
ser feita manualmente pelo usuário no navegador — não foi possível testar
visualmente nesta sessão (sem acesso a um navegador autenticado).

### Teste manual recomendado

1. Abrir uma sessão do Quiz com uma lesão SEM imagem — conferir que "CASO
   TEÓRICO" e as características ficam grandes e bem distribuídas, sem
   sobra de espaço vazio nem chips minúsculos.
2. Abrir uma sessão com uma lesão COM imagem — conferir que a imagem
   aproveita bem o painel, sem distorcer.
3. Conferir a pergunta e as alternativas A/B/C/D antes de responder — texto
   grande e fácil de ler/clicar.
4. Responder e conferir que o feedback (certo/errado, detalhes, botões de
   confiança) continua aparecendo normalmente.
5. Redimensionar a janela pra uma largura menor e conferir que nada quebra.

### Commit após aprovação

Ainda não criado (aguardando aprovação do usuário).

## ALTERAÇÃO 014 — Imagens dentro do Quiz clínico

**Número da alteração:** 014
**Data:** 20/09/2026

### Objetivo

Evoluir como o Quiz mostra imagens. Antes, mesmo quando uma lesão tinha
várias imagens cadastradas, o Quiz só mostrava a primeira. Também não
existia nenhum jeito de adicionar uma imagem a uma lesão durante o Quiz —
era preciso sair da sessão, abrir "Editar lesão" e voltar.

### O que mudou para quem usa o Atlas

- Lesão sem imagem: continua mostrando "CASO TEÓRICO" normalmente.
- Lesão com 1 imagem: continua simples, sem nenhum controle extra.
- Lesão com 2 ou mais imagens: agora aparece um carrossel — setas para ir
  para a imagem anterior/seguinte, um contador ("Imagem 1 de 3", por
  exemplo), e dá para navegar também pelas setas ←/→ do teclado. Da última
  imagem, a seta "próxima" volta para a primeira (e vice-versa). Trocar de
  imagem não afeta a resposta nem a pontuação.
- Depois de responder qualquer questão, aparece um botão
  "🖼 Adicionar imagem a esta lesão". Ele abre um painel por cima do Quiz —
  a sessão continua exatamente do jeito que estava (mesma pergunta, mesma
  resposta, mesmo placar) por baixo. Nesse painel dá para enviar um
  arquivo, colar uma URL de imagem, ou buscar imagens livres — os mesmos
  jeitos que já existem no editor de lesões. Assim que a imagem é salva, o
  visualizador do Quiz já atualiza sozinho (sem precisar de F5): se a
  lesão não tinha nenhuma imagem, o "CASO TEÓRICO" vira imagem; se já
  tinha uma, aparece o carrossel; se já tinha várias, o contador atualiza.

### O que NÃO mudou

Como as questões são sorteadas, qual é a resposta certa, a pontuação, o
histórico de sessões, a repetição espaçada, a Central de Revisões,
Firebase/Cloudinary e a forma como o Atlas decide "de quem" é cada imagem
— nada disso foi tocado. O painel novo só sabe adicionar imagem à lesão da
questão que está na tela; não mexe em nenhuma outra lesão nem apaga
imagens existentes.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `tests/quiz-images.test.js` (novo)
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node tests/quiz-images.test.js`: 18 PASS, 0 FAIL;
- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node tests/lesion-review.test.js`: 29 PASS, 0 FAIL (não deveria ter sido
  afetado; confirmado que continua intacto);
- `git diff --check`: sem erros de espaço em branco.

Este projeto não tem nenhuma dependência de teste de navegador (sem
jsdom). Os testes automatizados cobrem a parte que dá pra verificar sem
abrir um navegador de verdade (a função que anexa a imagem à lesão certa,
e checagens de que o código não usa atalhos perigosos como remover a tela
inteira do Quiz sem querer). O carrossel aparecendo de verdade, o teclado
funcionando, e o painel abrindo por cima do Quiz sem perder o progresso —
isso só dá pra confirmar testando manualmente no navegador.

### Teste manual recomendado

1. Abrir uma questão de uma lesão sem imagem — confirmar CASO TEÓRICO
   normal.
2. Abrir uma questão de uma lesão com 1 imagem só — confirmar que não
   aparecem setas nem contador.
3. Abrir uma questão de uma lesão com 2+ imagens — confirmar setas,
   contador "Imagem X de Y", e que as setas do teclado também funcionam.
4. Responder a questão e clicar "🖼 Adicionar imagem a esta lesão" —
   confirmar que o Quiz continua visível por baixo, com a pergunta e o
   resultado intactos.
5. Adicionar uma imagem (upload, URL ou busca) e fechar o painel —
   confirmar que o visualizador da questão atualizou sozinho, sem F5, e
   que a pontuação/progresso não mudaram.
6. Repetir adicionando mais uma imagem na mesma questão e confirmar que o
   contador atualiza corretamente.

### Commit após aprovação

Ainda não criado (aguardando aprovação do usuário).

## ALTERAÇÃO 015 — Ctrl+V, Quadro de Imagem e revisão manual dentro do Quiz

**Número da alteração:** 015
**Data:** 20/09/2026

### Objetivo

Completar o trabalho interrompido no modal de imagens do Quiz e permitir que
um problema observado durante o estudo seja marcado para revisão sem sair da
questão.

### Estado antes

O Quiz já tinha carrossel e adição por arquivo, URL e Commons, com atualização
imediata. O modal ainda não aceitava `Ctrl+V` nem abria o Quadro de Imagem.
Também não havia ação para criar uma revisão diretamente no feedback.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js`
- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `Ctrl+V` no modal de imagens usa o mesmo upload já existente e o listener
  fica no próprio modal, sem capturar colagens fora dele.
- O construtor existente de Quadro de Imagem virou uma função parametrizada e
  única, reutilizada pelo formulário e pelo Quiz. O quadro pronto segue o
  callback normal de adição e atualização do carrossel.
- O feedback pós-resposta ganhou `🔔 Marcar para revisão`, ao lado da ação de
  imagem e com quebra de linha responsiva.
- O pequeno modal de revisão chama exatamente
  `createLesionReview(lesion.id, requestText)`, preservando persistência,
  proteção de duplicata e atualização imediata do badge já existentes.
- Nenhum desses fluxos avança questão, altera resposta/pontuação, reinicia
  progresso ou grava em `SRS`/`SESSIONLOG`.
- A galeria do modal ganhou botões sempre visíveis `✏ Editar` e `🗑 Remover`.
  Editar salva somente a legenda; remover pede confirmação e retira somente
  o item escolhido do array da lesão atual, sem apagar o arquivo remoto.
- Adição, edição e remoção usam a mesma rotina de persistência/atualização do
  modal, portanto a galeria e o lado esquerdo do Quiz refletem imediatamente
  transições como 1→0, 2→1 e 3→2.

### Testes realizados

- `node --test tests/quiz-images.test.js`: 30 PASS, 0 FAIL;
- `node tests/lesion-review.test.js`: 35 PASS, 0 FAIL;
- `node tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O usuário pode colar uma imagem, criar um quadro ou registrar uma revisão da
lesão atual sem fechar o Quiz. Imagens continuam sendo apenas adicionadas; a
revisão apenas documenta o problema e não executa correção automática.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 016 — upload diferido no editor (sem backend)

**Número da alteração:** 016
**Data:** 20/09/2026

### Objetivo

Impedir que imagens NOVAS adicionadas durante a edição de uma lesão (Ctrl+V,
selecionar arquivo ou Wikimedia Commons) sejam enviadas ao Cloudinary antes do
usuário confirmar. Antes, cada imagem ia para o Cloudinary no momento em que
era adicionada, o que acumulava assets de teste mesmo quando a edição era
cancelada.

### Mudança de estratégia

A tentativa anterior desta mesma alteração tentava excluir assets via uma
Firebase Cloud Function. Isso exigiria o plano Blaze (backend pago) só para
limpar imagens de teste, então foi **descartada por completo**. Foram
removidos: a Function (`functions/`), `firebase.json`, `.firebaserc`, o
`.gitignore` criado pelo `firebase init`, `tests/cloudinary-deletion.test.js`,
as funções `requestCloudinaryAssetDeletion()`/`hasSecureCloudinaryIdentifier()`,
o script `firebase-functions-compat` e os ganchos de delete no Editor e no
Quiz. Não há mais dependência de Firebase Functions nem segredo administrativo.

### O que mudou para quem usa o Atlas

- Adicionar uma imagem no formulário "Editar lesão" (colar com Ctrl+V,
  escolher um arquivo ou buscar no Wikimedia Commons) mostra a imagem na hora,
  mas ela fica **temporária** — marcada como "⏳ não enviada". Nada vai ao
  Cloudinary ainda.
- Dá para adicionar várias, trocar, editar a legenda, remover e testar à
  vontade sem criar nenhum arquivo remoto.
- Só ao clicar em **Salvar** as imagens temporárias que sobraram são enviadas
  ao Cloudinary; as que foram removidas antes nunca são enviadas.
- Se um envio necessário falhar, a lesão NÃO é salva (nada pela metade) e o
  Atlas avisa para tentar de novo.
- **Cancelar** (ou Esc/clique fora) descarta as imagens temporárias sem enviar
  nada e sem alterar a lesão.
- Imagens que já existiam continuam normais. Remover uma delas apenas tira a
  referência da lesão (sem exclusão remota nesta versão).
- URL externa continua sendo salva como URL, sem upload.

### Detalhes técnicos

- Imagem temporária = blob URL (para exibir) + `File` em memória
  (`{source:'pending', _file, _objectUrl}`), nunca gravada em `DATA`/IndexedDB
  antes de Salvar.
- `addLocalFile(file)` (Ctrl+V / arquivo) só cria a blob URL e guarda o `File`.
- `openCommonsImageSearch(..., deferUpload=true)` baixa o arquivo e devolve
  objeto temporário, preservando `sourcePage`, `sourceSite`, `license`,
  `artist`, `attribution`, `originalUrl`. O Quiz chama sem esse parâmetro e
  mantém o upload imediato.
- `releasePendingObjectUrls()` revoga todas as blob URLs em qualquer
  fechamento (Cancelar/Esc/clique fora) e depois de Salvar.
- No Salvar, o upload roda ANTES de `storage.set`, e só as temporárias
  presentes sobem (`source==='pending' && _file`); cada temporária é
  substituída pelo retorno de `uploadToCloudinary()`.

### Arquivos alterados/removidos

- `index.html` (modificado)
- `tests/quiz-images.test.js` (cenários de upload diferido: Ctrl+V, arquivo,
  Commons e Quadro de Imagem)
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`
- **Removidos:** `functions/`, `firebase.json`, `.firebaserc`, `.gitignore`
  (criado pelo firebase init), `tests/cloudinary-deletion.test.js`

### Testes realizados

- `node --test tests/quiz-images.test.js`: 46 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 35 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Nenhuma imagem nova é enviada ao Cloudinary antes de Salvar. Cancelar não cria
asset remoto e não altera os dados. `SEED`, `REVIEW`, `SRS`, `SESSIONLOG`, a
reconciliação V2 e os dados atuais não foram alterados.

### Quadro de Imagem (correção pontual)

O construtor de Quadro de Imagem (compartilhado com o Quiz) entrou na mesma
regra. Agora ele é parametrizável: o formulário Editar chama com
`deferUpload=true`, então os painéis ficam temporários (blob URL) e o quadro
final vira imagem pendente — nenhum upload antes de Salvar. Remover o quadro
antes de Salvar ou cancelar não gera upload; no Salvar, o quadro sobe uma única
vez pelo pipeline de `pendingImgs`.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 017 — Quiz de imagens transacional (rascunho + Concluído)

**Número da alteração:** 017
**Data:** 20/09/2026

### Objetivo

Aplicar ao modal de imagens do Quiz ("🖼 Adicionar imagem a esta lesão") a
mesma filosofia já usada no formulário Editar: imagens novas ficam locais/
temporárias e só vão ao Cloudinary quando o usuário confirmar. Antes, cada
imagem (Ctrl+V, arquivo, Commons ou Quadro) era enviada ao Cloudinary e
persistida imediatamente.

### O que mudou para quem usa o Atlas

- Enquanto o modal está aberto, dá para colar (Ctrl+V), escolher arquivo,
  buscar no Commons, criar Quadro, editar legenda e remover à vontade — sem
  enviar nada novo ao Cloudinary.
- O botão **concluído** é o "salvar" do modal: só então as imagens novas que
  sobraram sobem ao Cloudinary, são associadas à lesão e persistidas.
- Fechar com Esc, clicar fora ou cancelar descarta tudo: nenhuma imagem sobe,
  a lesão não muda e o Quiz continua na mesma questão.
- Imagens que já existiam aparecem normalmente e não são reenviadas. Remover
  uma delas só tira a referência (sem exclusão remota).
- URL externa continua sendo salva como URL, sem upload, e só é associada no
  concluído.
- Se um upload falhar, o modal continua aberto com os previews, informa o erro
  e não salva nada pela metade; o que já subiu não é reenviado na nova
  tentativa.

### Detalhes técnicos

- Rascunho local `draftImgs` (cópia das imagens da lesão); o modal não toca
  `DATA` até o concluído.
- Helpers compartilhados `buildPendingImage()` e `uploadPendingImage()`
  (usados pelo Editar E pelo Quiz — sem duplicar lógica).
- Commons e Quadro reutilizam `deferUpload=true` (mesmo mecanismo do Editar).
- `releaseDraftObjectUrls()` revoga as blob URLs no fechar/concluir.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node --test tests/quiz-images.test.js`: 56 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 35 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O modal do Quiz não altera mais `DATA` a cada ação. Nenhuma imagem nova sobe ao
Cloudinary antes de "concluído"; cancelar deixa a lesão exatamente como estava.
`SEED`, `REVIEW`, `SRS`, `SESSIONLOG`, a reconciliação V2 e os dados atuais não
foram alterados.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 018 — cancelamento manual do pedido de revisão

**Número da alteração:** 018
**Data:** 20/09/2026

### Objetivo

Permitir que o usuário encerre um pedido de revisão que não é mais necessário
(corrigiu manualmente, marcou por engano, resolveu fora do fluxo de solução),
sem apagar o histórico.

### O que mudou para quem usa o Atlas

- Na Central de Revisões (🔔) e na aba "Propostas" da Central de Soluções (💡),
  aparece um botão discreto `✕ Cancelar pedido` para pedidos ainda não
  aplicados.
- Ao clicar, abre uma confirmação que mostra a lesão e o pedido original, com
  um campo opcional de motivo; os botões são `voltar` e `Cancelar pedido`.
- O pedido não é apagado: vira "cancelado", sai das filas ativas (os badges 🔔
  e 💡 caem na hora, sem F5) e continua no histórico, com data/hora e motivo
  (ou "Sem motivo informado").
- Correções já aplicadas aguardando validação NÃO podem ser canceladas por
  aqui — elas continuam com o fluxo próprio de manter/desfazer.
- Nada nos dados da lesão é alterado pelo cancelamento.

### Detalhes técnicos

- Novo status `cancelled`; função central `cancelLesionReview(reviewId, reason)`
  (a UI só a chama — a lógica não fica no botão).
- Grava `cancelledAt`, `cancelledBy='user'` e `cancelReason` (opcional),
  preservando `requestText`, `createdAt`, `attempts[]`, `solution`/
  `proposedChanges` e todo o histórico.
- `CANCELLABLE_REVIEW_STATUSES = ['pending', 'proposed', 'rejected']` (um
  pedido recusado volta ao 🔔 e também pode ser encerrado).
- `cancelled` não é retornado por `getPendingReviews()`,
  `getProposedSolutions()` nem `getAppliedSolutionsAwaitingValidation()`;
  continua acessível por `getReviewHistory()`.
- `cancelLesionReview()` não toca `DATA`, não aplica `proposedChanges`, não faz
  rollback e não altera SRS/REVIEW/imagens/ownership.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node --test tests/lesion-review.test.js`: 48 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 56 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O usuário consegue encerrar pedidos de revisão sem perder histórico e sem
alterar a lesão. `SEED`, `REVIEW`, `SRS`, `SESSIONLOG`, a reconciliação V2 e os
dados atuais não foram alterados.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 019 — Quiz: editar a lesão no Acervo e pular pergunta

**Número da alteração:** 019
**Data:** 20/09/2026

### Objetivo

Depois de responder, permitir abrir o formulário completo da lesão da questão
atual sem sair do Quiz e voltar exatamente ao mesmo ponto; e, antes de
responder, permitir pular uma pergunta (mandando-a para o fim da fila) sem
marcar acerto/erro.

### O que mudou para quem usa o Atlas

- Após responder, além de adicionar imagem e marcar para revisão, há
  `✏ Editar esta lesão no Acervo`. O formulário abre por cima do Quiz; ao
  salvar ou cancelar, ele fecha e a sessão continua na MESMA questão, com a
  resposta e o feedback preservados (e atualizados com os dados novos).
- Antes de responder, há `⏭ Pular`. A questão vai para o fim da fila e
  reaparece antes do fim da sessão. Pular não conta como acerto/erro e não mexe
  em placar, SRS, SESSIONLOG nem progresso. Se for a única pendente, aparece o
  aviso "Esta é a última questão pendente da sessão."

### Detalhes técnicos

- `openForm(id, opts)` ganhou `opts.preserveUnderlyingOverlay` e `opts.onSaved`.
  No modo preservar, o fechamento usa `closeForm()` (remove só o formulário) em
  vez de `closeOverlay()` (que apagaria `#study-overlay`).
- Overlay do formulário com a classe `lesion-form-overlay`; o carrossel do Quiz
  ignora ←/→ enquanto ela existir.
- Pular: `quizQueue.splice(quizIndex,1)` + `push` (move, não duplica), sem
  `quizIndex++`, sem tocar `quizStats`/`SRS`/`SESSIONLOG`/`quizSessionWrongIds`.
  Guarda: `quizQueue.length - quizIndex <= 1` → toast e não mexe na fila.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node --test tests/quiz-images.test.js`: 65 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 51 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O Quiz passa a permitir editar a lesão da questão sem perder o ponto da sessão e
a pular perguntas sem pontuar. `SEED`, `REVIEW`, `SRS`, `SESSIONLOG`, a
reconciliação V2 e os dados atuais não foram alterados.

### Commit após aprovação

Ainda não criado.

### Controles textuais do carrossel (mesma entrega)

Além das setas laterais, com 2+ imagens aparece `← Imagem anterior` ·
`Imagem X de Y` · `Próxima imagem →` (aria-label adequado), tudo sobre o mesmo
`quizImgIdx`/`renderMedia()`. Circular; contador atualiza na hora; lightbox só
no clique da imagem; após editar a lesão o índice é preservado/normalizado
(`refreshQuizImgs(false, true)`). 0/1 imagem continuam sem controles.

## ALTERAÇÃO 020 — Navegação entre questões no Quiz

**Número da alteração:** 020
**Data:** 20/09/2026

### Objetivo

Permitir navegar entre as questões já visitadas da sessão (`← Anterior` /
`Próxima →`) sem alterar a ordem da fila e sem duplicar respostas/estatísticas,
separando claramente da navegação de imagens e do `⏭ Pular`.

### O que mudou para quem usa o Atlas

- Bloco de navegação de questões: `← Anterior` · `⏭ Pular` · `Próxima →`.
- Anterior volta para a questão anterior visitada, já com a resposta, o
  feedback e a classificação preservados.
- Próxima retorna na trilha de visitas; se a questão atual ainda não foi
  respondida, avisa "Responda ou use Pular para avançar." em vez de avançar.
- Navegar não pontua e não aumenta o progresso; Pular continua igual.

### Detalhes técnicos

- `quizQuestionState` (por `lesionId`, só em memória), `quizHistory`/`quizCursor`.
- Acerto objetivo contado ao responder; grade contada em `applyGrade` (guardada
  por `st.grade`). Progresso = respondidas/total.
- `goPrevQuestion`/`goNextQuestion` só navegam (sem reordenar a fila nem tocar
  DATA). Pular movido para o bloco de questões, mantendo a lógica.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node --test tests/quiz-images.test.js`: 82 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 51 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O usuário navega entre questões sem perder estado e sem duplicar pontuação. As
questões puladas continuam pendentes e o resumo não aparece antes do fim real.
`SEED`, `REVIEW`, `SRS`, `SESSIONLOG`, a reconciliação V2 e os dados atuais não
foram alterados.

### Commit após aprovação

Ainda não criado.

### Correção pontual — Próxima habilita ao responder (sem exigir grade)

**Correção da ALTERAÇÃO 020.** No reteste manual, o botão `Próxima →` aparecia
apagado mesmo com a questão já respondida e classificada. A navegação já
avançava corretamente quando a questão estava respondida (`goNextQuestion` checa
`st.answered`), mas o estado visual do botão não era explícito.

Agora `Próxima →`:
- habilita quando há histórico à frente (voltamos com Anterior) **ou** quando a
  questão atual já foi respondida — a grade (Fácil/Média/Difícil/Não sei) é
  **independente** e não é exigida para avançar;
- fica apenas com aparência apagada (`aria-disabled`) quando não dá para
  avançar, continuando **clicável** para mostrar o aviso "Responda ou use Pular
  para avançar.";
- é reabilitada (`enableNextBtn()`) ao responder e ao classificar;
- nunca recebe o atributo `disabled`.

Testes novos em `tests/quiz-images.test.js`: verificação estática do `canNext`/
`enableNextBtn` e simulação real (vm) de `goNextQuestion`/`goPrevQuestion` —
respondida (com ou sem grade) avança; não respondida na fronteira mostra o aviso
e não avança; Anterior/Próxima percorrem a trilha sem duplicar o histórico.
Resultado: **86 PASS, 0 FAIL**. Âncoras de `tests/critical-flows.test.js` para
4822/4812/7122/9558.

## ALTERAÇÃO 021 — Snapshots locais leves e proteção forte de ownership

**Número da alteração:** 021
**Data:** 20/09/2026

### Objetivo

1. Proteger o estado local antes de operações de risco, sem sobrecarregar o
   IndexedDB (snapshots leves, no máximo 5, sem duplicar binários remotos).
2. Impedir que qualquer fluxo AUTOMÁTICO altere a atribuição (ownership) de uma
   imagem já vinculada a uma lesão.

### Arquivos modificados

- `index.html`
- `tests/snapshots-ownership.test.js` (novo)
- `tests/critical-flows.test.js` (âncoras + stub)
- `AGENTS.md`, `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `createSafetySnapshot(motivo)` voltou a funcionar (IndexedDB), mas só para
  motivos de RISCO; edição comum/Quiz/marcar revisão/sync NÃO geram snapshot.
- Snapshot guarda DATA + metadados de imagem + REVIEW + SRS + LESION_REVISIONS +
  ordens; nunca binários do Cloudinary; retenção de 5 (escrita serializada).
- Painel "Snapshots de segurança": resumo, restauração manual com confirmação
  forte (criando snapshot do estado atual antes) e exclusão.
- Funções centrais de ownership: `canChangeImageOwnership`,
  `assertManualImageOwnershipChange`, `registerImageOwnershipConflict`,
  `detectImageOwnershipConflicts`, `preserveLocalImageOwnershipOnImport`.
- Importação preserva a atribuição local existente e registra conflitos.
- Regra permanente documentada em `AGENTS.md`/`AI.md`.

### Testes realizados

- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 51 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Operações de risco passam a ter ponto de retorno local e a atribuição das
imagens fica protegida contra automação. `SEED`, `REVIEW`, `SRS`, `SESSIONLOG`,
a reconciliação V2 e os dados atuais não foram alterados.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 022 — Área de ferramentas simplificada (Manutenção técnica)

**Número da alteração:** 022
**Data:** 20/09/2026

### Objetivo

Deixar a interface normal simples e segura, escondendo ferramentas técnicas/
destrutivas numa seção recolhida, sem remover funcionalidades internas.

### O que foi alterado

- Interface normal agora mostra só `🩺 diagnóstico do sistema` e `🔍 auditar
  vínculo de imagens` (ambos somente leitura).
- Criada `⚙ Manutenção técnica` (`<details>`, recolhida por padrão) contendo:
  forçar envio deste dispositivo, exportar checkpoint V2, reconciliar catálogo
  V2, fundir duplicatas agora, procurar dados antigos/recuperar e restaurar
  padrão de fábrica (separado por um divisor e marcado como destrutivo).
- `restaurar padrão de fábrica`: confirmação forte em DOIS passos; não executa ao
  abrir a seção; lógica de reset inalterada.
- `auditar vínculo de imagens` virou SOMENTE LEITURA — removidos os botões
  "mover pra lesão certa" e "corrigir todas automaticamente".
- Botão "restaurar snapshot de segurança" removido da interface (não aparece na
  normal nem na Manutenção técnica). A infraestrutura (createSafetySnapshot,
  restoreSafetySnapshot, índice, retenção 5, criação automática antes de risco)
  permanece no código. CSS morto da UI de snapshot removido.
- IDs/handlers existentes reutilizados; nenhuma função duplicada.

### Arquivos modificados

- `index.html`
- `tests/tools-layout.test.js` (novo)
- `tests/snapshots-ownership.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- `node --test tests/tools-layout.test.js`: 13 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 51 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Interface normal limpa; ferramentas técnicas escondidas por padrão; auditoria de
imagens somente leitura; snapshots automáticos e retenção de 5 preservados.
`SEED`, `DATA`, ownership, Quiz e Revisões não foram alterados.

### Commit após aprovação

Ainda não criado.

### Revisão da ALTERAÇÃO 022 — controles técnicos removidos da UI

O usuário não queria uma seção expansível: as ferramentas técnicas **não devem
aparecer na interface**. A `⚙ Manutenção técnica` (details/summary) foi REMOVIDA
do HTML, junto com os botões forçar envio, exportar checkpoint V2, reconciliar
catálogo V2, fundir duplicatas agora, procurar dados antigos/recuperar e
restaurar padrão de fábrica. Também foi removido o CSS morto.

A interface normal agora mostra **somente** `🩺 diagnóstico do sistema` e
`🔍 auditar vínculo de imagens` (ambos somente leitura), além dos botões normais
`Salvar backup`/`Importar backup` (inalterados).

A implementação interna continua no código para manutenção futura: as lógicas
inline de deduplicação e de factory reset viraram funções nomeadas
(`forceDuplicateCleanupNow()` e `restoreFactoryDefault()`), e permanecem
`forceThisDeviceToCloud`, `openExportCheckpointV2Modal`, `openReconcileV2Modal`,
`openRecoveryInspector`, `runDuplicateCleanup`, `reconcileCatalogByIdentityV2`,
`createSafetySnapshot`/`restoreSafetySnapshot` e o índice de snapshots
(retenção 5, criação automática antes de risco). A proteção de ownership não foi
alterada.

Testes: `tests/tools-layout.test.js` reescrito (**8 PASS**). Âncoras de
`tests/critical-flows.test.js` para 4917/4907/7220/9630.

## ALTERAÇÃO 023 — Ponte segura para IA (manual-assistida)

**Número da alteração:** 023
**Data:** 20/09/2026

### Objetivo

Tirar as revisões do estado paralisado: permitir que um pedido já criado pelo
usuário gere uma proposta (via IA externa, colando/colando texto), sem API paga,
sem segredo no frontend e sem autoaplicar.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- Botão `🤖 Preparar para IA` em cada revisão `pending`/`rejected`, abrindo um
  painel com `📋 Copiar pedido para IA` e `📥 Colar solução da IA`.
- `buildReviewAiPacket`/`buildReviewAiPrompt` montam o pacote (só metadados de
  imagem, sem blob) e o texto de instrução; não alteram `DATA` nem status.
- `importReviewAiSolution` valida JSON/reviewId/status/allowlist e, se válido,
  chama `setReviewSolution` (status `proposed`, `DATA` intocada); se inválido,
  não altera nada e mostra erro.
- Nenhuma chave de API, nenhum backend, nenhuma chamada de rede.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 61 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Uma revisão pendente pode gerar uma proposta e aparecer em 💡 Soluções
imediatamente, mantendo `DATA` intocada até a autorização manual do usuário. A
IA continua sem qualquer caminho para criar revisão, autorizar ou alterar
ownership.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 024 — Simplificação do fluxo Revisão → Solução

**Número da alteração:** 024
**Data:** 20/09/2026

### Objetivo

Eliminar o clique intermediário "✓ autorizar correção": ao importar a solução
da IA, a correção é aplicada provisoriamente e o usuário só decide entre
Manter e Desfazer.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- Importar o JSON válido aplica PROVISORIAMENTE (snapshot antes +
  `applied_pending_validation`), reusando a função auditada de aplicação.
- Nova tela `🔎 Validar correção` com antes/depois, resumo e botões
  `👁 ver lesão`, `✓ Manter correção`, `↩ Desfazer correção`.
- 💡 Soluções passa a priorizar a aba "Validar correções"; a aba "Propostas" só
  aparece para itens legados.
- Removido o clique obrigatório de autorização da UX; a função interna continua
  existindo (e é reusada na importação), com o histórico marcando
  `origin: 'import'`.
- Sem API, sem segredo, sem backend.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 66 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O usuário vê o resultado da correção imediatamente após colar o JSON da IA e
decide Manter ou Desfazer uma única vez. `DATA` só muda após a ação humana de
importar; rollback é exato e reabre a revisão para nova tentativa.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 025 — Respostas da IA sem campos aplicáveis ({} e ação manual)

**Número da alteração:** 025
**Data:** 20/09/2026

### Objetivo

Corrigir a UX da ponte de IA: uma resposta legítima com `proposedChanges = {}`
(normal em pedidos que a IA não pode executar, como remover imagem) era
rejeitada como "campos inválidos". Agora ela é tratada corretamente.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- Importação aceita `{}` (e ausente/nulo) sem erro, sem alterar dados.
- Novo status `manual_action_required` para pedidos de imagem/ownership/
  estrutura, que não altera dados, sai da fila de pendentes e fica visível na
  aba "Ação manual" do 💡 Soluções.
- Nova tela de ação manual com pedido, resumo da IA, motivo e botão
  `Abrir lesão para correção manual` (abre o editor; nada é removido sozinho).
- `reopenManualActionReview` devolve a revisão para a fila; cancelamento também
  funciona nesse status.
- Campo fora da allowlist continua rejeitado; segurança não foi afrouxada.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 76 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Pedidos que a IA não pode resolver deixam de parecer erro ou ficar travados:
viram uma tarefa manual clara, com botão para abrir a lesão, sem qualquer
alteração automática de imagem ou ownership.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 026 — Fluxo em lote para revisões pendentes com IA

**Número da alteração:** 026
**Data:** 20/09/2026

### Objetivo

Substituir o processamento revisão-a-revisão por um fluxo em lote: selecionar
várias revisões pendentes, gerar UM prompt, colar UMA vez o JSON de volta e
validar os resultados.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- Botão `🤖 Analisar pendências com IA` na Central de Revisões.
- Tela de seleção múltipla (checkbox + "Selecionar todas") com
  `📋 Copiar lote para IA` e `📥 Colar respostas da IA` + `Processar lote`.
- Funções novas: `getBatchEligibleReviews`, `buildReviewAiBatchPacket`,
  `buildReviewAiBatchPrompt`, `processReviewAiBatchItem`, `importReviewAiBatch`.
- Resultados aceitos: `apply`, `manual_action_required`, `no_change`.
- Resumo final (processadas/aplicadas/ações manuais/sem alteração/falharam) e
  lista de falhas individuais.
- Aba do 💡 Soluções renomeada para **🛠 Ações manuais**.

### Segurança

- Sem API direta e sem segredo no frontend; continua manual (copiar/colar).
- `apply` só aplica provisoriamente, com `beforeSnapshot` por revisão; nada vira
  `accepted` automaticamente e não há "Aceitar tudo".
- `manual_action_required` e `no_change` não alteram `DATA`.
- Imagens, ownership, IDs, SRS, REVIEW e progresso seguem proibidos.
- Falha parcial isolada: um item inválido não corrompe os válidos.
- Reimportar o mesmo JSON não duplica aplicação.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 93 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Processar muitas revisões de uma vez, com validação individual dos resultados e
proteção total de dados, imagens e ownership.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 027 — Feedback humano nas próximas tentativas da IA

**Número da alteração:** 027
**Data:** 20/09/2026

### Objetivo

Fazer o motivo escrito pelo usuário (ao recusar/desfazer) chegar à próxima
tentativa da IA, para ela não repetir a mesma solução errada.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- Persistência do motivo: `rejectionReason`, `rollbackReason`, `humanFeedback[]`,
  `lastHumanFeedback`, `attempt.rollbackReason`.
- `reopenManualActionReview(reviewId, reason)` com motivo opcional (UI pergunta).
- `buildReviewAiPacket` com `previousAttempts` (summary/reasoning/proposedChanges/
  outcome/humanFeedback), `latestHumanFeedback`, `previousOutcome` — sem
  `beforeSnapshot`.
- `buildReviewAiPrompt` com instrução de ler o feedback e não repetir solução
  recusada.
- Prompt em lote com instrução global sobre tentativas anteriores.
- `setReviewSolution` guarda `summary`/`reasoning` da solução.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 105 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O feedback humano é preservado, aparece no histórico e entra no pacote/prompt da
IA (individual e em lote). Gerar pacote é read-only. Nada de imagens/ownership
foi afetado.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 028 — Consistência do latestHumanFeedback (histórico)

**Número da alteração:** 028
**Data:** 20/09/2026

### Objetivo

Corrigir `latestHumanFeedback: null` em revisões históricas que já tinham
`previousAttempts[].humanFeedback` (casos reais de recusa e rollback).

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `resolveLatestHumanFeedback(review, attempts)` (read-only): prioriza
  `lastHumanFeedback`, depois o feedback não vazio da tentativa mais recente,
  depois `null`.
- `buildReviewAiPacket` usa a normalização; o lote herda.
- `buildReviewAiAttempts` preserva `text` legado sem fabricar
  summary/reasoning.

### Segurança

Somente leitura: não escreve no IndexedDB, não cria histórico, não muda status
nem UX. Fluxo em lote, ponte de IA e status permanecem como estavam.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 114 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O feedback humano histórico volta a aparecer em `latestHumanFeedback` no pacote
individual e no lote, sem alterar dados.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 029 — Fluxo híbrido de localizações adicionais (altPlacements)

**Número da alteração:** 029
**Data:** 20/09/2026

### Objetivo

Permitir que a IA sugira uma localização adicional (ex.: "também em
Neurorradiologia") e o usuário aplique com 1 clique + confirmação, sem abrir o
editor para montar tudo manualmente.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `manualAction.type = additional_section_placement` com `suggestedPlacement`.
- Validação de seção/sítio existentes (`validateReviewAiPlacement`), lote e
  individual.
- `applyReviewAiSuggestedPlacement` (snapshot antes, altPlacements, provisório).
- UI: botão `✓ Aplicar localização sugerida` + confirmação; seletor de sítio
  quando a sugestão não traz um.
- Editor: "Também aparece em" com `+ Adicionar localização`.
- Prompts (individual/lote) com a lista de seções/sítios válidos.

### Segurança

Sem API/segredo; nada aplicado automaticamente (exige confirmação humana);
`accepted` só por decisão do usuário; rollback exato via `beforeSnapshot`;
imagens/ownership/IDs intactos; só `additional_section_placement` tem o atalho.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 127 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Revisões de localização adicional deixam de ficar presas: a sugestão vira uma
ação de 1 clique com confirmação, provisória e reversível, preservando todo o
resto da lesão.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 030 — Robustez do importador do lote (JSON da IA)

**Número da alteração:** 030
**Data:** 20/09/2026

### Objetivo

Tornar "📥 Colar respostas da IA" resistente a respostas JSON válidas de
ChatGPT/Claude/DeepSeek, sem afrouxar a validação de segurança.

### Estado antes

O lote fazia apenas `JSON.parse(String(rawText||'').trim())` e, em falha,
mostrava "JSON inválido" descartando o erro. Respostas em bloco Markdown ou com
BOM/caracteres invisíveis nas bordas eram recusadas sem explicação.

### Arquivos modificados

- `index.html`
- `tests/lesion-review.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `normalizeReviewAiBatchJson`: String → trim → remove BOM/zero-width só nas
  bordas → aceita um bloco ```json … ``` (ou ``` … ```).
- `parseReviewAiBatchJson`: usa a normalização e devolve `parseError`
  (`kind`/`position`/`line`/`column`) sem expor o conteúdo colado.
- `formatReviewAiBatchParseError`: mensagem com orientação (vazio/incompleto/
  cerca inválida/sintaxe), dizendo que nada foi processado.
- A UI separa "não foi possível interpretar o JSON" de "formato do lote
  inválido".

### Segurança

Nenhuma mudança na validação semântica: campos proibidos, `result`
desconhecido, reviewId inexistente/duplicado e `proposedChanges` inválido
continuam rejeitados, item a item. Sem API, sem segredo, sem rede. O parser
continua sendo o `JSON.parse` nativo — sem correção de conteúdo nem recorte
"do primeiro `{` ao último `}`".

### Observação

A solicitação chegou truncada no trecho de normalização; foram implementados os
passos visíveis (String, trim, BOM, zero-width nas bordas, code fence). Passos
adicionais devem ser confirmados antes de ampliar.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 134 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

A moldura externa deixou de derrubar o parse e, quando o JSON é realmente
inválido, o usuário recebe uma dica de onde está o problema — sem que o
conteúdo colado seja registrado ou exibido.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 031 — Correção visual da linha de ações da Central de Soluções

**Número da alteração:** 031
**Data:** 20/09/2026

### Objetivo

Corrigir SOMENTE o layout responsivo do card da aba **🛠 Ações manuais** (e das
demais telas que usam as mesmas classes), eliminando o overflow horizontal e o
botão cortado.

### Estado antes

`.review-center-row-actions` usava `flex-shrink:0` (bloco de botões não
encolhia) e `.review-center-row-main` usava `min-width:220px` (texto não
encolhia). Em modal estreito, os botões ultrapassavam a largura e o
`.review-center-modal` exibia scroll horizontal.

### Arquivos modificados

- `index.html` (apenas CSS)
- `tests/lesion-review.test.js` (4 testes estáticos de layout)
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### O que foi alterado

- `.review-center-row`: `width/max-width:100%`, `min-width:0`,
  `box-sizing:border-box`.
- `.review-center-row-main`: `flex:1 1 240px; min-width:0`.
- `title`/`meta`/`request`/`solution`: `overflow-wrap:anywhere; word-break:break-word`.
- `.review-center-row-actions`: `flex:1 1 auto; min-width:0; flex-wrap:wrap`
  (sem `flex-shrink:0`, sem `nowrap`).
- `.review-center-row-actions .btn`: `max-width:100%; white-space:normal; overflow-wrap:anywhere`.
- `.review-center-modal`/`.review-history-modal`: `overflow-x:hidden` (mantendo `overflow-y:auto`).
- `.review-tabs`: `flex-wrap:wrap`.

### O que NÃO mudou

Lógica de revisão, status, `manual_action_required`, botão de abrir lesão,
cancelamento, histórico, `altPlacements`, ownership, `DATA` e snapshots — nada
disso foi tocado.

### Testes realizados

- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 86 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Os cards respeitam a largura do modal, os botões quebram para novas linhas e
não há mais scroll horizontal. Sem suíte de layout visual no projeto, a
confirmação estética final depende de reteste manual no navegador.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 032 — Preview local do quadro de imagens no Quiz (pending)

**Número da alteração:** 032
**Data:** 20/09/2026

### Objetivo

Corrigir o preview quebrado de um quadro de imagens criado no Quiz antes de
"concluído" (miniatura vazia e "Clique para ampliar" sem imagem), sem permitir
upload antecipado.

### Estado antes

O quadro pending (`openCollageBuilder`, `deferUpload=true`) era devolvido sem o
campo `data`; a galeria do Quiz e o `openImageLightbox` leem `img.data`, então o
`src` ficava `undefined`. O editor tinha o mesmo defeito latente.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js`
- `tests/critical-flows.test.js` (âncora do handler de importação)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- O ramo `deferUpload` do `openCollageBuilder` agora devolve
  `data:objectUrl` (mesma blob URL de `_objectUrl`), como `buildPendingImage`.
- O renderer do modal do Quiz usa `img.data || img._objectUrl` na miniatura e no
  ampliar (`openImageLightbox(src)`).

### O que NÃO mudou

Política de upload tardio (zero Cloudinary antes de "concluído"), ownership,
Revisões/Soluções, `altPlacements`, snapshots, parser JSON e os demais fluxos do
Quiz — nada disso foi tocado.

### Testes realizados

- `node --test tests/quiz-images.test.js`: 98 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O quadro pending mostra a miniatura e amplia usando o preview LOCAL, sem nenhum
upload antes de "concluído". A proteção contra upload antecipado permanece
intacta.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 033 — Contador + navegação no canto superior esquerdo do carrossel do Quiz

**Número da alteração:** 033
**Data:** 20/09/2026

### Objetivo

Deixar claro, com 2+ imagens, quantas existem e qual está sendo exibida, com um
overlay `‹ n / total ›` no canto superior esquerdo da imagem.

### Estado antes

Havia setas laterais e um bloco textual inferior (`← Imagem anterior` /
`Imagem X de Y` / `Próxima imagem →`), mas o estado do carrossel não ficava
imediatamente claro.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js`
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Overlay `.quiz-carousel-overlay` (absoluto, canto superior esquerdo) com seta
  anterior, contador `n / total` e seta próxima, gated por `hasMultiple`.
- Setas do overlay usam as MESMAS `goPrev`/`goNext` e o mesmo `quizImgIdx` das
  setas laterais; navegação circular e teclado preservados.
- Removido o contador/controles textuais inferiores (sem tripla navegação) e o
  CSS morto correspondente.
- `aria-label` nas setas e `aria-live`/`aria-label` no contador.

### O que NÃO mudou

Lógica de questões, score, SRS, SESSIONLOG, Anterior/Próxima questão, Pular,
edição da lesão, upload Cloudinary, Revisões/Soluções, snapshots, ownership e
`altPlacements`.

### Testes realizados

- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 18 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Com 2+ imagens, o carrossel mostra `‹ n / total ›` no canto superior esquerdo,
sempre em sincronia com as setas laterais e o teclado. Sem suíte de layout
visual no projeto, a confirmação estética final depende de reteste manual.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 034 — Auditoria + sincronização explícita localhost ↔ site publicado

**Número da alteração:** 034
**Data:** 20/09/2026

### Objetivo

Permitir que o estado correto do localhost vire o estado usado pelo site
publicado, com auditoria, confirmação e snapshot — sem reativar sincronização
automática destrutiva.

### Estado antes

O localhost já enviava para o Firestore via `saveData`/`pushToFirebaseNow`, mas
o site publicado não recebia automaticamente (pull no boot desativado na
Alteração 008) e não havia uma ação explícita de sincronização na interface.

### Arquivos modificados

- `index.html`
- `tests/snapshots-ownership.test.js`
- `tests/critical-flows.test.js` (âncoras + call sites explícitos)
- `tests/tools-layout.test.js` (inalterado no comportamento; só presença)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `syncAuditCounters` (puro) + `buildSyncAudit` (read-only) comparando local × nuvem.
- `syncThisDeviceToCloud` (snapshot antes; push; sem pull; sem ownership) e
  `forceThisDeviceToCloud` reutilizando-a.
- Botões `☁ sincronizar este dispositivo` e `⬇ atualizar deste backup/nuvem`,
  com modais de auditoria + confirmação.
- `openUpdateFromCloudModal` chama `syncFromFirebase()` como AÇÃO EXPLÍCITA.

### Segurança

- Auditoria não grava nada.
- Push cria snapshot antes e não toca ownership/imagens.
- Pull só por clique consciente (snapshot antes), nunca automático.
- Cloudinary não recebe reenvio (só imagens locais legadas migram).
- Backup continua como fallback oficial (inclui revisões).

### Testes realizados

- `node --test tests/snapshots-ownership.test.js`: 30 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O usuário consegue auditar (sem alterar nada), enviar o estado do localhost para
a nuvem com confirmação/snapshot, e trazer da nuvem para o site publicado de
forma explícita — sem sobrescrita silenciosa e sem reativar o pull automático.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 035 — Verificação pós-envio no push local→nuvem

**Número da alteração:** 035
**Data:** 20/09/2026

### Objetivo

Descobrir por que o push explícito aparentava concluir mas a nuvem continuava
antiga, e corrigir a causa real (não criar recurso novo).

### Estado antes

`syncThisDeviceToCloud` só aguardava `writeShardedStateSerialized` e declarava
sucesso; a auditoria lia a nuvem uma vez e não atualizava após o envio.

### Causa real

Falta de verificação do servidor após a escrita + auditoria sem re-leitura. Não
era bug de Cloudinary/imagens (o SRS também divergia).

### Arquivos modificados

- `index.html`
- `tests/snapshots-ownership.test.js`
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `readCloudAuditFromServer` (leitura forçada do servidor) e `syncCountersMatch`.
- `syncThisDeviceToCloud` relê o servidor e só confirma se os contadores baterem;
  em divergência retorna `verification_mismatch` com local × servidor.
- Modal com 5 etapas, `🔄 ler servidor de novo` e atualização da coluna Nuvem.
- `openUpdateFromCloudModal` também ganhou o botão de releitura.

### Segurança

Sem pull automático; sem alteração de ownership; Cloudinary sem reenvio; local
preservado em qualquer falha.

### Testes realizados

- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Sucesso só é mostrado quando o servidor confirma o estado; falha é explícita e
o local permanece intacto.

### Commit após aprovação

Ainda não criado (aguardando reteste).

## ALTERAÇÃO 036 — Preferências locais de navegação (sidebar e Quiz)

**Número da alteração:** 036
**Data:** 20/09/2026

### Objetivo

Restaurar, após F5, a última seção/site escolhidos na sidebar e no Quiz, de
forma independente.

### Arquivos modificados

- `index.html`
- `tests/local-scope-prefs.test.js` (novo)
- `tests/critical-flows.test.js` (stubs de preferência + âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Chaves `atlas:v1:lastSidebarScope` e `atlas:v1:lastQuizScope` (localStorage).
- `readScopePref`/`writeScopePref`/`validateScopePref`/`scopeSectionsMap`.
- Sidebar grava a preferência nas mudanças manuais; boot restaura.
- Quiz ganhou `quizScope` próprio, seletores de seção/sítio na sessão
  personalizada e persistência na chave própria; boot restaura.

### Segurança/limites

Não usa Firebase/IndexedDB/sync/backup/DATA. Validação contra seções/sites
existentes; JSON inválido/localStorage indisponível ignorados sem erro; só grava
em ação manual. Nenhum fluxo de dados/ownership/Cloudinary foi tocado.

### Testes realizados

- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 8 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Sidebar e Quiz lembram cada um a sua última seção/site, sem interferir um no
outro e sem sincronizar pela nuvem.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 037 — Limpeza visual da sidebar

**Número da alteração:** 037
**Data:** 20/09/2026

> **CORRIGIDO pela Alteração 038:** as ações técnicas NÃO foram removidas da UI;
> foram recolhidas no bloco `⚙ Ferramentas avançadas`, fechado por padrão.

### Objetivo

Reduzir o espaço vertical ocupado pelas ações técnicas na sidebar, liberando
espaço para a lista de seções.

### Arquivos modificados

- `index.html`
- `tests/tools-layout.test.js`
- `tests/snapshots-ownership.test.js`
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- **Corrigido na Alteração 038:** os controles técnicos (sincronizar este
  dispositivo, atualizar deste backup/nuvem, diagnóstico do sistema e auditar
  vínculo de imagens) NÃO foram removidos da UI — foram recolhidos no bloco
  `⚙ Ferramentas avançadas`, fechado por padrão.
- Mantidos sempre visíveis: configurar Cloudinary, Salvar backup, Importar backup.
- Funções internas preservadas (sync explícito, diagnóstico, auditoria).

### Segurança

Nenhum fluxo de sync/snapshot/ownership/auditoria foi removido ou alterado;
apenas a presença dos controles na UI normal.

### Testes realizados

- `node --test tests/tools-layout.test.js`: 9 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Sidebar normal com apenas Cloudinary + backup; ações técnicas internas.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 038 — Correção: ações técnicas em "⚙ Ferramentas avançadas"

**Número da alteração:** 038
**Data:** 20/09/2026

### Objetivo

Corrigir a Alteração 037: os controles técnicos NÃO devem sumir da UI; devem
ficar recolhidos num bloco fechado por padrão, para não ocupar espaço vertical.

### Estado antes (após a 037)

Os 4 controles haviam sido removidos do HTML e seus handlers apagados.

### Arquivos modificados

- `index.html`
- `tests/tools-layout.test.js`
- `tests/snapshots-ownership.test.js`
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Restaurado o bloco recolhível `⚙ Ferramentas avançadas` (`#advanced-tools`,
  `hidden` por padrão) com os 4 controles dentro.
- Restaurados os handlers (`openSyncDeviceToCloudModal`,
  `openUpdateFromCloudModal`, `openSystemDiagnosticModal`,
  `openImageAuditModal`) e criado `initAdvancedToolsToggle()` (abre/fecha, ▸/▾,
  `aria-expanded`).
- Fora do bloco seguem Cloudinary + Salvar/Importar backup.

### Segurança

Nenhuma lógica interna alterada (sync/Firestore/snapshots/ownership/auditoria/
Cloudinary/backup/Quiz/escopo/DATA).

### Testes realizados

- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Sidebar compacta com as ações técnicas acessíveis em um clique, fechadas por
padrão.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 039 — Integridade de classification (C-RADS espalhada)

**Número da alteração:** 039
**Data:** 20/09/2026

### Objetivo

Descobrir por que C-RADS aparecia em lesões fetais não relacionadas e corrigir
com segurança, sem limpeza cega.

### Estado antes

`applyClassificationAudit20260918` removia por id POSICIONAL; com a reordenação
do SEED, a lista passou a apontar para outras lesões (inclusive os pólipos
colorretais, onde C-RADS é válida).

### Causa real

Ids posicionais (`seed_<N>`) + reordenação do SEED → classificações antigas
persistidas no DATA ficaram associadas a outras lesões; a atualização canônica
estava desativada (V250), então a classificação errada persistia.

### Arquivos modificados

- `index.html`
- `tests/classification-integrity.test.js` (novo)
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Neutralizada a remoção por id posicional.
- `classificationIdentityKey`/`classificationCanonicalMap`/`buildClassificationAudit`
  (read-only) e `applyClassificationIdentityFix` (manual, com snapshot).
- Botão `📋 auditar classificações` em Ferramentas avançadas.
- Nova razão de snapshot de risco.

### Testes realizados

- `node --test tests/classification-integrity.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Auditoria read-only + correção confirmada por identidade semântica; SEED com 3
C-RADS válidas preservadas; nenhuma classificação válida de outra lesão é
alterada.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 040 — Vencidas x Próximas no painel SRS + atualização ao vivo

**Número da alteração:** 040
**Data:** 20/09/2026

### Objetivo

Separar "vencidas" de "próximas" no painel de revisões e atualizar o painel
imediatamente após responder.

### Estado antes

`refreshStudyDashboardLive` não re-renderizava o painel; o badge "N vencidas"
(overdue) ficava no cabeçalho de "Próximas revisões" (futuras).

### Arquivos modificados

- `index.html`
- `tests/srs-dashboard.test.js` (novo)
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `partitionScheduledReviews(now)` (vencidas `due<=now` / próximas `due>now`).
- `fmtReviewFuture` ("em X") e `fmtReviewPast` ("vencida há X").
- `renderReviewPanels(ov)`: bloco "Revisões vencidas" (badge vermelho) + bloco
  "Próximas revisões" (badge "N agendada(s)"), ambos in-place.
- `refreshStudyDashboardLive` e `openProgressDashboard` usam `renderReviewPanels`.

### Segurança

Não mexe em Cloudinary, sync Firestore, ownership, altPlacements, revisões de
conteúdo/IA, snapshots nem na classificação C-RADS.

### Testes realizados

- `node --test tests/srs-dashboard.test.js`: 12 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/classification-integrity.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Painel coerente (vencidas e próximas separadas) e atualizado na hora após
responder.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 041 — Auditoria de classificações conservadora

**Número da alteração:** 041
**Data:** 20/09/2026

### Objetivo

Corrigir a regra da Alteração 039 ("SEED sem classification ⇒ espúria"), que era
agressiva demais, e transformar a auditoria numa ferramenta segura.

### Estado antes

64 de 87 classificações eram marcadas como espúrias só por não constarem no
SEED — incluindo plausíveis/legítimas.

### Arquivos modificados

- `index.html`
- `tests/classification-integrity.test.js`
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Categorias: `canonical`, `mismatch`, `compatible_noncanonical`, `incompatible`,
  `unknown`.
- `CLASSIFICATION_CONTEXT_RULES` + `classifyClassificationCompatibility`
  (conservador: só `incompatible` quando a seção é de outro sistema E sem
  palavra de contexto).
- Correção só remove `incompatible` e restaura `mismatch`; nunca toca plausíveis,
  unknown ou fora do SEED.

### Testes realizados

- `node --test tests/classification-integrity.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/srs-dashboard.test.js`: 12 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Nenhuma classificação plausível é apagada; só o claramente incompatível é
removido, com snapshot e confirmação.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 042 — Painel de revisões em bloco único

**Número da alteração:** 042
**Data:** 20/09/2026

### Objetivo

Manter a semântica de vencidas/próximas, mas voltar a ter UM único painel na
coluna esquerda (a separação em dois blocos deixou a coluna alta).

### Arquivos modificados

- `index.html`
- `tests/srs-dashboard.test.js`
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Container único `#study-review-panel`; `reviewPanelModel(now)` decide
  `overdue` (prioridade) ou `upcoming`.
- `renderReviewPanels` renderiza um só bloco; badge com total real; lista top 5.
- CSS `.study-upcoming.is-overdue` (sem o bloco `.study-overdue` separado).

### Segurança

Só layout/render do painel; sem tocar gráficos, ciclo, domínio, grid, SRS,
score, SESSIONLOG, Cloudinary, sync, ownership, snapshots ou classificações.

### Testes realizados

- `node --test tests/srs-dashboard.test.js`: 17 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/classification-integrity.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Um painel único, com prioridade para vencidas e transição automática ao
resolver; layout da coluna esquerda de volta ao tamanho anterior.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 043 — Fila manual "Revisar" com 3 ações

**Número da alteração:** 043
**Data:** 20/09/2026

### Objetivo

Transformar a categoria "Revisar" (unknown) numa fila manual prática, com
Manter / Remover / Abrir lesão, sem correção automática.

### Arquivos modificados

- `index.html`
- `tests/classification-integrity.test.js`
- `tests/critical-flows.test.js` (stub + âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `CLASSIFICATION_REVIEW_DECISIONS` (IndexedDB local) + `keepClassificationDecision`
  / `removeClassificationDecision`; chave = identidade semântica + classification.
- `buildClassificationAudit` esconde do `unknown` o que tem decisão "keep".
- Modal: fila "Revisar" com os 3 botões; contadores atualizam sem fechar; "Abrir
  lesão" usa `openForm` (preserveUnderlyingOverlay) e recalcula ao salvar.

### Segurança

"Manter" não altera DATA; "Remover" cria snapshot e zera só `classification`;
correção em lote continua só em incompatible+mismatch. Não toca ownership,
imagens, altPlacements, ids, SRS/SESSIONLOG, Cloudinary ou sync.

### Testes realizados

- `node --test tests/classification-integrity.test.js`: 24 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/srs-dashboard.test.js`: 17 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 38 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

A fila "Revisar" permite decidir caso a caso com persistência local e sem
globalizar nenhuma classificação.

### Commit após aprovação

Ainda não criado.

## ALTERAÇÃO 044 — Merge aditivo de imagens local→nuvem

**Número da alteração:** 044
**Data:** 20/09/2026

### Objetivo

Incorporar as imagens novas do localhost na nuvem sem sobrescrever o SRS mais
novo da nuvem (divergência cruzada).

### Estado antes

O push integral escrevia `DATA`/`SRS`/`REVIEW`/`SESSIONLOG` do local, o que
sobrescreveria o SRS 44 da nuvem com o 41 local; e o pull nuvem→local, quando o
local tinha timestamp mais novo, descartava as imagens que existiam só na nuvem.

### Arquivos modificados

- `index.html`
- `tests/snapshots-ownership.test.js`
- `tests/critical-flows.test.js` (âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `imageIdentityKeys` + `unionEntryImages` (dedup por publicId/URL, ownership).
- Pull (`mergeEntryNonDestructive`) e push (`mergeEntryForImagePush`) usam união
  aditiva de imagens.
- `mergeThisDeviceImagesToCloud` (server-only, preserva SRS/REVIEW/SESSIONLOG,
  escreve e verifica o servidor).
- `buildSyncAudit.crossDivergent` + aviso e botão na UI.

### Segurança

Nunca apaga imagem; nunca move/reatribui ownership (conflito registrado e
pulado); preserva SRS/REVIEW/SESSIONLOG/ordens remotas; sem upload Cloudinary;
sucesso só com confirmação do servidor; boot continua sem pull automático.

### Testes realizados

- `node --test tests/snapshots-ownership.test.js`: 46 PASS, 0 FAIL;
- `node --test tests/critical-flows.test.js`: 20 PASS, 0 FAIL;
- `node --test tests/quiz-images.test.js`: 101 PASS, 0 FAIL;
- `node --test tests/srs-dashboard.test.js`: 17 PASS, 0 FAIL;
- `node --test tests/classification-integrity.test.js`: 24 PASS, 0 FAIL;
- `node --test tests/local-scope-prefs.test.js`: 14 PASS, 0 FAIL;
- `node --test tests/lesion-review.test.js`: 138 PASS, 0 FAIL;
- `node --test tests/tools-layout.test.js`: 11 PASS, 0 FAIL;
- `node --test tests/legacy-id-migration.test.js`: 156 PASS, 5 TODO, 0 FAIL;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Local (58/73, SRS 41) + nuvem (53/66, SRS 44) → nuvem 58/73 com SRS 44; o site
publicado, ao "Atualizar deste backup/nuvem", passa a receber 58/73 sem reduzir o
SRS.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 045
**Data:** 21/09/2026

### Objetivo

MVP de importação semiautomática de casos do Radiopaedia (só metadados):
botão no Tampermonkey → Atlas recebe draft → pré-checagem → usuário decide.
Nada salvo/criado automaticamente.

### Estado antes

Não existia nenhum fluxo de importação externa; a única ponte com o
Radiopaedia era o link automático de busca por nome em cada lesão.

### Arquivos modificados

- `tools/radiopaedia-to-atlas.user.js` (novo, fora do bundle)
- `index.html` (módulo anexado no fim do script, sem deslocar âncoras)
- `tests/external-import.test.js` (novo)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Userscript com botão discreto, extração defensiva e payload em base64 no
  fragmento `#external-import=` (`ATLAS_URL` configurável).
- Recepção: consumo único no boot (gancho pós-`loadData`), validação
  rigorosa, `history.replaceState` (F5 não reimporta), try/catch no boot.
- Pré-checagem em 4 níveis com faixas (sem %): URL exata, título exato
  normalizado, Dice/Levenshtein, contexto seção/sítio; modal 100% escapado.
- Draft: nova lesão abre `openForm(null)` pré-preenchido (só Salva persiste);
  existente abre detalhe + bloco informativo, sem anexar.

### Segurança

Sem imagens, sem Cloudinary, sem tradução; `DATA` nunca mutado pelo fluxo;
todo conteúdo externo passa por `esc()`; payload limitado a 4KB e restrito a
https://radiopaedia.org.

### Testes realizados

- `node tests/external-import.test.js`: 16 PASS, 0 FAIL;
- Suíte completa: 543 PASS, 5 TODO, 0 FAIL (+ 1 FAIL histórico conhecido em
  `duplicate-detection.test.js`, fora de escopo);
- Âncoras de `critical-flows.test.js` (6061/6051/8603/11592) inalteradas;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Fluxo Radiopaedia → Atlas → pré-checagem → navegação validado em testes;
pronto para teste manual com caso real (ver resposta da entrega).

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 046
**Data:** 21/09/2026

### Objetivo

Eliminar falsos positivos da pré-checagem do importador Radiopaedia:
"Polyethene wear" sugeria "Pólipo endometrial/endocervical" e "Ureterocele
fetal".

### Estado antes

Similaridade = max(Dice-tokens, Levenshtein), limiares 0.6/0.35. Os três
falsos positivos tinham Dice 0 e Lev 0.35–0.39 — o Lev sozinho promovia.

### Arquivos modificados

- `index.html` (só o módulo do importador, no fim do script)
- `tests/external-import.test.js` (7 testes A–G; teste 8 ajustado)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `tokenizeExternalTitle` (stopwords PT/EN, fora token <3 letras sem dígito).
- `externalMatchBand`: trava de zero token comum; título curto (≤2 tokens)
  só com Dice/Lev ≥ 0.8; longo com alta ≥ 0.66/0.85 e possível ≥ 0.5.
- Vazio agora mostra "✅ Nenhuma correspondência relevante encontrada".
- URL exata, título exato, validação, draft e modal inalterados.

### Segurança

Mais conservador por construção; nenhuma mudança em dados, sync, quiz,
imagens ou classificação.

### Testes realizados

- `node tests/external-import.test.js`: 23 PASS, 0 FAIL;
- Suíte completa: 550 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- Âncoras de `critical-flows.test.js` inalteradas;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

"Polyethene wear" → zero candidatos espúrios; "Polyethylene wear",
"Desgaste do polietileno" e "Pulmonary embolus" continuam encontrados;
tradução ("Colorectal carcinoma" × "Carcinoma colorretal") não casa.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 047
**Data:** 21/09/2026

### Objetivo

Importador v2: trabalhar em português (nome sugerido, tags, descrição em
draft) preservando o título original, com re-prechecagem após tradução.

### Estado antes

O modal mostrava só os dados crus da fonte; o nome da nova lesão era o
título em inglês e não havia checagem do nome traduzido contra o acervo.

### Arquivos modificados

- `index.html` (só o módulo do importador, no fim do script)
- `tests/external-import.test.js` (+18 testes, total 41)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Glossário `EXTERNAL_IMPORT_TRANSLATIONS` + `suggestPortugueseLesionName`
  (catálogo via `enTerm` > glossário > original + `needsReview`).
- `suggestExternalTags` (nome confiável, contexto forte, mapa fechado de
  modalidade, reuso canônico, dedup, máx. 8) e `suggestExternalDescription`
  (só do seguro; vazio aceitável).
- Modal com campos editáveis, status `automatic`/`edited_by_user`, re-check
  do nome em PT com alerta [Abrir]/[Continuar] e botão `✨ Revisar com IA`
  (só `aiReview:'pending'`, sem fetch).
- Draft pré-preenche nome/notas/tags/links (título original no rótulo);
  existente nunca sobrescrito.

### Segurança

Sem API externa, sem Cloudinary, sem gravação automática; tudo escapado;
validação e pré-checagem anteriores intactas.

### Testes realizados

- `node tests/external-import.test.js`: 41 PASS, 0 FAIL;
- Suíte completa: 568 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- Âncoras de `critical-flows.test.js` inalteradas;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

"Polyethene wear" sugere "Desgaste de polietileno" + tags PT + descrição
inicial, tudo editável; re-check encontra a lesão PT existente antes de
criar duplicata.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 048
**Data:** 21/09/2026

### Objetivo

Duas melhorias pontuais de UX: (1) campo de instrução no Revisar com IA do
importador; (2) descrição da imagem do Quiz legível, acima da imagem e só
pós-resposta.

### Estado antes

(1) O botão só marcava `aiReview:'pending'`, sem o usuário dizer o quê
revisar. (2) A caption ficava em 11px abaixo da imagem, ilegível e sempre
visível (entregando pista antes da resposta).

### Arquivos modificados

- `index.html` (modal de instrução + `quizImageDescHtml` + 2 ganchos)
- `tests/external-import.test.js` (+6 testes da instrução)
- `tests/quiz-image-desc.test.js` (novo, 8 testes)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `openExternalAiInstructionModal` + `confirmExternalAiReview` (pura):
  textarea, Cancelar/Marcar, `aiReviewInstruction` no draft, preview
  discreto, reeditável, zero chamada externa.
- `quizImageDescHtml(label, answered)` pura + bloco acima da imagem em
  `renderMedia()`; `renderMedia()` re-executa ao responder; some na próxima
  questão; carrossel/contador/setas/lightbox/SRS intactos.

### Segurança

Instrução escapada ao exibir; caption escapada; sem API, Cloudinary, sync
ou mudança em dados/SRS.

### Testes realizados

- `node tests/quiz-image-desc.test.js`: 8 PASS, 0 FAIL;
- `node tests/external-import.test.js`: 47 PASS, 0 FAIL;
- Suíte completa: 582 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- Âncoras de `critical-flows.test.js` inalteradas;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Instrução da IA registrada no draft sem envios; descrição legível só após
responder, acompanhando o carrossel e resetando por questão.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 050
**Data:** 21/09/2026

### Objetivo

Auditar 3 cards duplicados ("Desgaste de polietileno (Prótese de quadril)")
criados via importador e blindar o Salvar contra duplicatas e double-submit.

### Estado antes

O botão Salvar só desabilitava após os uploads: duplo-clique executava o
handler 2x com o mesmo `formEntryId` (2+ pushes idênticos). Sem checagem de
duplicata no save; a pré-checagem do modal não pega variantes parentéticas
("Desgaste de polietileno" × "... (Prótese de quadril)").

### Arquivos modificados

- `index.html` (trava formSaving + `findExactLesionMatch` +
  `confirmDuplicateLesion` + busy no Criar)
- `tests/external-import.test.js` (+8 testes dup-1..dup-8)
- `tests/critical-flows.test.js` (âncora importHandler 11623)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Trava `formSaving` com reset em todos os retornos e no finally.
- Bloqueio exato (identidade ou URL) antes de uploads, só em lesão nova,
  com modal de 3 vias + confirmação extra no forçar.
- Nenhuma remoção/mesclagem automática dos 3 existentes (só relatório).

### Segurança

Edição existente intocada; forçar exige dupla confirmação; ownership/sync
intocados.

### Testes realizados

- `node tests/external-import.test.js`: 55 PASS, 0 FAIL;
- Suíte completa: 610 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Double-submit e recriação silenciosa bloqueados; duplicatas exigem decisão
explícita. Consolidação dos 3 existentes pendente de relatório + aprovação.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 052
**Data:** 21/09/2026

### Objetivo

Consolidar com segurança os 3 objetos de mesmo id
(`u_1790002508376_8lr5c5`, "Desgaste de polietileno (Prótese de quadril)")
em 1 lesão com as 3 imagens, sem perda.

### Estado antes

3 objetos distintos, mesmo id/nome/seção/sítio/tags/notes, cada um com 1
imagem (assetIds ...610f6a, ...b2bfa, ...e929c); links [] e assignedAt null
nos 3; trava formSaving e bloqueio já implementados (050).

### Arquivos modificados

- `index.html` (`consolidateSameIdDuplicates` + auto-stage da referência no
  draft + rede anti-mesmo-id no save)
- `tests/external-import.test.js` (+12 testes dup-9..dup-20)
- `tests/critical-flows.test.js` (âncora importHandler 11659)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Consolidação via console: snapshot (allowlist) → exige 3 ocorrências →
  metadados iguais → 3 imagens distintas → principal = 1ª + união dedup
  (imagens/tags/links; escalares "mais completo vence") → splice por índice
  decrescente → pós-condição → saveData. SRS/revisões intocados.
- Causa do links:[]: referência exigia clique manual; draft agora já a
  encaminha (persiste só no Salvar).
- Rede extra: id existente no save vira update, nunca push duplicado.

### Segurança

Aborts sem tocar no DATA (snapshot, contagem, metadados, imagens);
restauração sempre manual; nada no Cloudinary; sem filter por id.

### Testes realizados

- `node tests/external-import.test.js`: 67 PASS, 0 FAIL;
- Suíte completa: 628 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Função pronta e testada; EXECUÇÃO no localhost pendente (usuário roda no
console com os 3 publicIds e relata o `report`).

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 049
**Data:** 21/09/2026

### Objetivo

Métrica visual de produtividade de imagens (principal indicador de
progresso da construção do Atlas): `assignedAt` + card hoje + gráfico
semanal + totais no dashboard, com refresh ao vivo.

### Estado antes

Nenhum timestamp por imagem (só `_userUpdatedAt` da lesão); dashboard não
mostrava trabalho de atribuição de imagens.

### Arquivos modificados

- `index.html` (helpers + carimbo nos 2 saves + oldest no merge + dashboard)
- `tests/image-productivity.test.js` (novo, 20 testes)
- `tests/critical-flows.test.js` (âncoras 6056/6066/8608/11602)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `stampNewImagesAssignedAt` (Salvar do editor, Concluído do Quiz);
  `adoptOldestAssignedAt` no `unionEntryImages`; contagem/série/SVG puros.
- KPI `imagens hoje`, card semanal entre Evolução (metade) e Estado,
  totais com `DATA.length`; refresh nos saves; CSS do grid in-place.

### Segurança

Sem invenção retroativa; ownership/dedup/SRS/quiz/sync intactos; remoção
sem ledger (derivado do estado atual, documentado).

### Testes realizados

- `node tests/image-productivity.test.js`: 20 PASS, 0 FAIL;
- Suíte completa: 602 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Cada imagem nova confirmada conta 1x no dia local; gráfico de 7 dias e
totais atualizam sem F5; histórico antigo só no total geral.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 051
**Data:** 21/09/2026

### Objetivo

Campo "Descrição geral do quadro" no construtor de quadros de imagens,
como metadado `label` (sem queimar no PNG/JPEG).

### Estado antes

O quadro guardava só o join das sequências (ou 'Quadro multimodal'); sem
lugar para explicar o que o conjunto demonstra.

### Arquivos modificados

- `index.html` (textarea + `resolveCollageLabel`/`collageInitialDesc` +
  fiação no insert + `existingLabel` na reedição)
- `tests/collage-desc.test.js` (novo, 15 testes)
- `tests/quiz-images.test.js` (assinatura com 5º param opcional)
- `tests/critical-flows.test.js` (âncora importHandler 11651)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Textarea após Layout/Rótulos/Resolução, antes da prévia; leitura via
  `.value`; cancel descarta.
- Insert: descrição > join das seqs > 'Quadro multimodal'; canvas intocado.
- Reedição passa `img.label` e pré-preenche (só se não for join automático).
- Edição posterior pelo input de legenda existente; Quiz/detalhe iguais às
  demais; 1 `assignedAt`; painéis-fonte nunca entram no DATA.

### Segurança

Texto via `.value`, renderizado com `esc()` existente; sem HTML executável.

### Testes realizados

- `node tests/collage-desc.test.js`: 15 PASS, 0 FAIL;
- Suíte completa: 625 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Quadro com contexto próprio, fluindo para Quiz, detalhe, edição e
produtividade sem regras especiais.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 053
**Data:** 21/09/2026

### Objetivo

Contadores de imagem na sidebar (principal indicador de enriquecimento do
acervo): por seção/site, `TOTAL · 🖼IMAGENS · X/Y` em linha única.

### Estado antes

A sidebar mostrava só o total de lesões; áreas pobres em imagem invisíveis.

### Arquivos modificados

- `index.html` (CSS + helpers puros + linhas do renderTree + renderAll no Quiz)
- `tests/sidebar-image-stats.test.js` (novo, 20 testes)
- `tests/critical-flows.test.js` (âncoras 6063/6073/8615/11670)
- `tests/quiz-images.test.js` (callback com renderAll)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `sectionStats`/`siteStats`/`buildSidebarImageStats` (1 passada/render,
  mesmo conjunto do `structure()`); estoque atual, sem `assignedAt`.
- Linha única com ellipsis, nowrap, tooltip; zeros sempre visíveis.
- Refresh pelo `renderAll()` existente (incluído após concluir no Quiz).

### Segurança

Sem listeners/intervals; scope/ordenação/filtro/quiz/SRS/sync intactos;
totais reconciliados de forma verificável (649 blocos, 663 PASS).

### Testes realizados

- `node tests/sidebar-image-stats.test.js`: 20 PASS, 0 FAIL;
- Suíte completa: 663 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Sidebar mostra lesões, imagens e cobertura por seção/site, atualizando nos
fluxos existentes.

### Commit após aprovação

Ainda não criado.

**Número da alteração:** 054
**Data:** 21/09/2026

### Objetivo

Simplificar a sidebar: só cobertura `38/243` (estava poluído e comprimindo
nomes).

### Estado antes

Linha `243 · 🖼126 · 38/243` por seção/site.

### Arquivos modificados

- `index.html` (formato `tree-cov`, CSS in-place, tooltip enxuto)
- `tests/sidebar-image-stats.test.js` (+2 testes, total 22)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `sidebarCoverageHtml()` (`cov-num` âmbar + `cov-den` discreto); cálculo
  (`sectionStats`/`siteStats`) reutilizado; sem total/absoluto/🖼.
- Lógica, navegação, scope, dashboard e produtividade intactos.

### Segurança

Números internos (sem HTML externo); sem mudança de dados.

### Testes realizados

- `node tests/sidebar-image-stats.test.js`: 22 PASS, 0 FAIL;
- `local-scope-prefs`: 14 PASS; `critical-flows`: 20 PASS;
- Suíte: 665 PASS (+6 do duplicate), 5 TODO, só o FAIL histórico;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Sidebar legível com nomes completos e cobertura compacta à direita.

### Commit após aprovação

Ainda não criado.
