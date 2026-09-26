# Diario de desenvolvimento

## Save stale de imagens no editor (26/09/2026)

Se o formulário ficava aberto enquanto outro PC adicionava uma imagem, o Salvar apagava essa imagem: a galeria antiga virava a verdade e tudo fora dela era tratado como remoção. Agora o Atlas fotografa as imagens da abertura; no Save, busca o estado atual, junta as imagens novas do outro PC e só registra remoção do que o usuário tirou de propósito. Metadados, contexto clínico, vínculos didáticos e sincronização seguem iguais.

Arquivos desta etapa: `index.html`, `tests/editor-stale-save.test.js`, `tests/critical-flows.test.js`, `tests/clinical-cases.test.js`, `tests/external-import.test.js`, `tests/form-layout-desktop.test.js`, `AI.md`, `README.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` e este diário.
Testes: `editor-stale-save` 18/18; `critical-flows` 23/23; `multi-device-sync` 181/181; demais focados sem regressão (falhas amplas iguais às já conhecidas na base Windows). Smoke com dois perfis reais ainda depende do usuário.

## Protecao 091c-b — fusoes clinicas sem perda de conteudo (26/09/2026, sem executar fusao)

A infraestrutura de fusao de duplicatas (091c) foi fortalecida antes de qualquer execucao real. O que mudou, em linguagem simples:

- quem decide o registro que fica agora so considera imagem de verdade (arquivo Cloudinary com assetId/publicId); imagem de exemplo, link de busca ou campo antigo de texto nao forcam mais a escolha;
- casos clinicos iguais vindos dos dois lados sao somados campo a campo (textos complementares se juntam, vinculos de imagem e escolha do Quiz preservados) em vez de um apagar o outro;
- sinais e classificacoes diferentes de cada lado sao todos mantidos no registro final;
- os nomes antigos removidos viram etiquetas pesquisaveis no registro final, entao a busca continua achando pelo nome antigo;
- links repetidos com a mesma pagina (mesmo com barra final diferente) nao duplicam;
- notas e termos em ingles complementares sao preservados.

Nenhuma fusao foi executada nesta etapa; nenhum dado do catalogo foi alterado. O botao de fusao continua exigindo backup recente, ensaio e confirmacao.

Arquivos desta etapa: `index.html`, `tests/controlled-duplicate-merge.test.js`, `tests/multi-device-sync.test.js`, `tests/critical-flows.test.js`, `AI.md`, `README.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` e este diario.
Testes: `controlled-duplicate-merge` 27/27 (17 anteriores + 10 novos da 091c-b), `multi-device-sync` 181/181 (+1 cenário 091c-b), `critical-flows` 23/23, `clinical-cases` 47/47, demais focados sem regressao. Suite ampla: 1431 testes, 1416 PASS, 10 FAIL ja conhecidos na base Windows, 5 TODO — nenhuma falha nova.

## Cards de casos clínicos — textos longos recolhíveis (26/09/2026)

A história clínica já começava compacta, mas as observações do caso e a
descrição abaixo de cada imagem vinculada ainda podiam ocupar muitas linhas.
Agora usam o mesmo mecanismo da história: textos longos mostram inicialmente
~1,5 linha e expandem/recolhem no próprio texto por clique, Enter ou Espaço.
Os textos permanecem completos; imagem, título, idade, modalidade, fonte,
crédito e link não são recolhidos. É só visual, sem alteração nos dados.

Arquivos desta etapa: `index.html`, `tests/clinical-case-text-collapse.test.js`,
`AI.md`, `README.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` e este diário.
Teste focado: 7/7 PASS; `clinical-cases` 47/47, `external-import` 79/79 e
`critical-flows` 23/23 PASS. Smoke visual com navegador autenticado ainda
depende do usuário; não foi executado neste ambiente.

## Lightbox das imagens do Quiz — 26/09/2026

Ao maximizar uma imagem, o Quiz enviava ao visualizador apenas aquela imagem.
Por isso as setas e o teclado funcionavam no Quiz normal, mas desapareciam na
ampliação. O visualizador já sabia percorrer uma coleção de imagens: agora
recebe a coleção e a posição da questão, e devolve cada troca à própria
questão. Ao fechar, a imagem selecionada e seu contexto clínico permanecem.
Antes de responder, as legendas de todas as imagens seguem ocultas, mesmo
durante a navegação ampliada. Quadro continua sendo uma imagem.

Arquivos desta entrega: `index.html`, `tests/quiz-lightbox-navigation.test.js`,
`tests/lightbox-navigation.test.js`, `tests/quiz-images.test.js`,
`tests/image-description.test.js`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`,
`tests/image-clinical-context.test.js`, `AI.md`, `README.md` e este diário.
Testes: 6/6 para o fluxo expandido, 25/25 na galeria genérica, 103/103 no
Quiz, 31/31 descrições, 13/13 contexto clínico, 23/23 fluxos críticos e 4/4
no teste de compatibilidade Firestore. A suíte ampla passou 1408 de 1423
(10 falhas pré-existentes no Windows e 5 pendentes; nenhuma nova). Smoke real
em navegador com login e verificação do console não pôde ser feito deste
ambiente. Nenhuma migração de dados é necessária.

## Correção do envio ao Firestore — 26/09/2026 (em validação)

O envio do Atlas falhava porque o histórico das respostas do Quiz tinha um
array de tentativas dentro de outro array no documento principal da nuvem.
O caminho reproduzido no payload é
`atlas_state/main.reviewProgress.<id da lesão>.a[0]`. O Atlas agora troca
somente a representação dessas tentativas ao enviar e restaura a representação
original ao receber; histórico, casos clínicos, imagens, vínculos e progresso
permanecem preservados. Uma conferência antes de gravar aponta somente o
caminho de outros arrays aninhados, sem expor o conteúdo. Os testes locais
usam Firestore simulado; a checagem manual no navegador real ainda é necessária.

Arquivos desta etapa: `index.html`, `tests/firestore-no-nested-arrays.test.js`,
`tests/multi-device-sync.test.js`, `tests/device-bootstrap.test.js`,
`tests/review-auto-mode.test.js`, `tests/critical-flows.test.js`, `AI.md`, `README.md`,
`CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` e este diário.

Testes executados: 4/4 no teste novo; 180/180 no multi-PC (inclusive envio
com mock que recusa o mesmo formato proibido pelo Firebase e leitura por outro
PC); 42/42 no bootstrap; 19/19 no modo automático; 23/23 nos fluxos críticos
após atualização das âncoras. O teste obrigatório de duplicatas: 6 PASS e 1
FAIL histórico. A suíte ampla detectou ainda 2 falhas antigas dependentes da
data e 7 testes de portabilidade de fim de linha no Windows (CRLF), sem relação
com o payload. `git diff --check` não apontou erros. Smoke autenticado pendente.
O usuário autorizou publicar antes do smoke para testar a correção no site;
o resultado em produção só poderá ser registrado após esse teste manual.

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

**Número da alteração:** 055
**Data:** 21/09/2026

### Objetivo

Corrigir o "Atlas abre zerado em outro computador": um dispositivo novo (sem
catálogo local ainda) empurrava sozinho um catálogo vazio (sem imagens/SRS/
progresso) por cima do estado real da nuvem, ao abrir a página pela primeira
vez num computador diferente.

### Estado antes

Em `loadData()`, quando o IndexedDB local ainda não tinha o catálogo salvo
(sempre verdadeiro na primeira abertura num navegador/computador novo), o
código entrava no `catch` e usava o `SEED` cru (sem imagens, sem progresso)
como base. Mais adiante, no MESMO carregamento, havia uma chamada
incondicional a `pushToFirebaseNow()` que enviava esse catálogo zerado para o
Firestore. Como o envio é um `.set()` (substituição total, não uma mescla), a
nuvem real — que já tinha imagens, revisões e SRS de outros dispositivos —
era sobrescrita pelo catálogo vazio. Foi exatamente isso que aconteceu ao
abrir o site publicado num computador do hospital: os contadores apareceram
zerados ali, e a nuvem também ficou zerada para todo mundo depois.

Antes de corrigir, foi confirmado com o usuário que o computador principal
ainda tinha o estado correto no IndexedDB local (nunca é sobrescrito pela
nuvem, porque o pull automático no boot já estava desativado desde a
Alteração 008) e que a auditoria (`☁ sincronizar este dispositivo`) mostrou
nuvem íntegra (1213/1213 lesões, 65/65 registros com imagem, 89/89 imagens,
11/11 altPlacements, 49/49 SRS) — ou seja, não foi necessária nenhuma
recuperação manual antes desta correção.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras + 2 testes novos)
- `tests/device-bootstrap.test.js` (novo arquivo, 32 testes)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `deviceBootstrapPending` (flag global, perto de `appStateReady`): enquanto
  `true`, `writeShardedState()` recusa QUALQUER envio (automático, debounced
  ou pelo botão "☁ sincronizar este dispositivo"/"🔀 mesclar imagens") —
  mesmo sinal já usado para "pedaço grande demais", que todo chamador já
  trata sem quebrar.
- `loadData()`: o `catch` de dispositivo novo não persiste nem envia mais
  nada sozinho — só marca `isNewLocalDevice`/`deviceBootstrapPending` e usa o
  `SEED` como base de trabalho EM MEMÓRIA. Depois de REVIEW/SRS/SESSIONLOG/
  LESION_REVISIONS carregados (vazios, de fato, num dispositivo novo), e
  ANTES de qualquer limpeza de duplicatas/push/`renderAll()`, chama
  `runNewDeviceBootstrapFlow()`.
- `checkCloudForBootstrapV1()`: consulta a nuvem SERVER-ONLY (reaproveita
  `readCloudAuditFromServer()`, a mesma função da verificação pós-envio).
  Nunca confunde "não consegui verificar" (offline/erro) com "a nuvem está
  vazia" — só considera vazio o caso em que NENHUM dispositivo jamais
  sincronizou o projeto (nenhum documento em `atlas_state/main`).
- `openNewDeviceBootstrapModal()`: modal único, sem fechar por clique
  fora/ESC (força uma decisão explícita). Mostra "🔎 Verificando…", depois
  um de três estados: nuvem com dados (tabela de auditoria + `⬇ Carregar
  meus dados da nuvem` ou `usar este dispositivo vazio mesmo assim`, este
  último com um `confirm()` explicando que vai sobrescrever a nuvem na
  próxima sincronização), nuvem nunca inicializada (resolve sozinho, sem
  perguntar nada) ou falha de verificação (`🔄 tentar novamente` + a mesma
  opção de continuar vazio, com aviso).
- `applyNewDeviceBootstrapChoice(choice)`: só "load" chama `syncFromFirebase()`
  — o MESMO merge não destrutivo já usado por "⬇ atualizar deste backup/
  nuvem" (nenhuma lógica de reconciliação paralela foi criada). "skip"/
  "empty" apenas liberam o dispositivo (`deviceBootstrapPending = false`) e
  marcam o marcador local.
- `DEVICE_INITIALIZED_KEY` (`atlas:v1:deviceInitialized`, `localStorage`,
  mesmo padrão das preferências de escopo): marcador estritamente LOCAL, não
  sincronizado, não incluído no backup — só evita reabrir a pergunta à toa;
  quem decide se o dispositivo é novo continua sendo a ausência do próprio
  catálogo (`STORAGE_KEY`).
- Guardas adicionais (mensagem específica) em `syncThisDeviceToCloud()` e
  `mergeThisDeviceImagesToCloud()`: "Este dispositivo ainda não foi
  inicializado com os dados da nuvem." — mesmo que alguém consiga clicar
  nesses botões antes do modal aparecer.

### Segurança

- Nenhum push acontece enquanto `deviceBootstrapPending` for `true` — nem o
  automático de `loadData()`, nem os botões explícitos.
- Reaproveita 100% da lógica de merge existente (`syncFromFirebase`,
  `mergeEntryNonDestructive`, `unionEntryImages`) — sem reconciliação
  paralela. Isso já garante, sem código novo, que o bootstrap preserva
  imagens (união aditiva, sem duplicar), `assignedAt` (o mais antigo válido
  vence), SRS mais novo, REVIEW/SESSIONLOG (máximo preservado) e ownership
  (conflito automático é bloqueado e registrado, nunca resolvido em
  silêncio).
- Um dispositivo que JÁ tinha catálogo local (`STORAGE_KEY` presente) não
  passa por nenhum destes caminhos novos — comportamento idêntico ao de
  antes desta alteração.
- Continuar "vazio mesmo assim" exige confirmação explícita com aviso do que
  vai acontecer; não há bootstrap automático silencioso.
- Offline/erro ao verificar a nuvem nunca é tratado como "nuvem vazia".

### Testes realizados

- `node tests/device-bootstrap.test.js` (novo): 32 PASS, 0 FAIL — detecção
  server-only, bloqueio de push em todos os call sites, decisão pura
  (load/skip/empty), wiring do modal (estático), marcador local, ordem real
  de `loadData()` (dispositivo novo aciona o bootstrap antes de
  `renderAll()`; dispositivo já inicializado não é afetado; reload seguinte
  não repete o fluxo), e o merge do bootstrap preservando imagens/
  assignedAt/SRS/REVIEW/SESSIONLOG/ownership (reaproveitando as funções
  reais de `syncFromFirebase`).
- `node tests/critical-flows.test.js`: 21 PASS, 0 FAIL (âncoras atualizadas
  6221/6231/8773/11853; nova checagem de que a chamada a `syncFromFirebase()`
  do bootstrap só existe dentro de `applyNewDeviceBootstrapChoice()`, gated
  pela escolha do usuário no modal — nunca em `loadData()` diretamente).
- Suíte completa: 698 PASS, 5 TODO, só o FAIL histórico (28 entradas
  malformadas de `DUPLICATE_PAIRS_V171`, fora de escopo).
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Um computador novo, ao abrir o Atlas, nunca mais sobrescreve a nuvem
sozinho: primeiro verifica (server-only), mostra o que encontrou, e só age
depois de uma decisão explícita — carregando os dados reais, ou confirmando
(com aviso) que quer mesmo começar vazio. Um computador que já tinha
catálogo local continua funcionando exatamente como antes.

### Validação

**Aprovada em teste manual pelo usuário em 21/09/2026** — testes visuais e
funcionais realizados, resultado correto. Considerada BASELINE ESTÁVEL do
projeto junto com as Alterações 056 e 057.

### Commit após aprovação

Aprovada; commit/publicação ainda não criados (aguardando pedido explícito
do usuário).

**Número da alteração:** 056
**Data:** 21/09/2026

### Objetivo

Descrição persistente para imagens e quadros (multilinha, textos longos),
visível de forma consistente na edição, no detalhe da lesão, no Quiz
(oculta durante a pergunta, visível após responder) e ao maximizar
(lightbox) — sem criar nenhum campo novo.

### Estado antes

O campo canônico `label` já existia e já era exibido no detalhe da lesão e
no Quiz pós-resposta (`quizImageDescHtml`). Mas dois dos três lugares onde
`label` era escrito usavam `<input>` de uma linha (galeria do editor e caixa
de edição do modal "Adicionar imagem" do Quiz) — só o construtor de quadro
já usava `<textarea>`. E o lightbox (zoom) não mostrava descrição nenhuma,
em lugar nenhum, mesmo quando a imagem tinha `label`.

### Arquivos modificados

- `index.html`
- `tests/quiz-images.test.js` (2 testes ajustados pra nova assinatura do
  lightbox + 1 teste novo)
- `tests/image-description.test.js` (novo arquivo, 21 testes)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Galeria de imagens do editor (`openForm`) e caixa de edição do modal
  "🖼 Adicionar imagem" do Quiz: `<input class="img-gallery-label">` virou
  `<textarea class="img-gallery-label" rows="3">` — mesmo campo `label`,
  mesma lógica de salvar/chips de sequência, sem `maxlength` (sem limite
  artificial de tamanho). CSS de `.img-gallery-label` ganhou
  `resize:vertical` e `min-height`, pra caber textos mais longos.
- Construtor de quadro (`openCollageBuilder`): `#collage-desc` já era
  `<textarea>`; só aumentou de `rows="2"` para `rows="3"` (continua
  `resize:vertical`, sem limite).
- `openImageLightbox(src, description)`: nova assinatura, com `description`
  opcional. Sem descrição, comportamento idêntico ao de sempre (só a
  imagem). Com descrição, aparece **abaixo** da imagem, num bloco próprio
  (`.lightbox-content` em coluna + `.lightbox-desc`), nunca sobreposta,
  escapada com `esc()`, com espaço pra texto longo (a caixa do lightbox
  ganha scroll interno se precisar). Clicar no texto da descrição não fecha
  o lightbox (`stopPropagation`); clicar na imagem ou fora continua
  fechando, como sempre.
- 5 pontos onde o lightbox já era aberto, revisados individualmente:
  detalhe da lesão e galeria do editor e do modal do Quiz agora passam a
  descrição sempre (não é contexto de "spoiler"); o Quiz durante a pergunta
  **nunca** passa (`st.answered ? cur.label : ''` — mesmo gate que já
  protegia o bloco acima da imagem); a ferramenta técnica de auditoria de
  vínculo de imagens continua exatamente como estava (fora do pedido).
- Detalhe da lesão (`openDetail`): passou a usar `esc()` (escapa `&` também)
  em vez do `.replace(/</g,...)` manual que só escapava `<`; `.detail-img-label`
  ganhou estilo de texto corrido (esquerda, fonte normal, `white-space:pre-wrap`)
  em vez de monoespaçado centralizado — mais legível para descrições longas.
- **Nenhum campo novo**: `label` continua o único campo canônico de descrição
  (`description`/`collageDescription`/`boardDescription` continuam
  inexistentes como propriedade de imagem — regra mantida).

### Segurança

- `label` já viajava por `spread` (`{...x}`) em todo o caminho de
  salvar/upload/sync/backup — nenhuma mudança de persistência foi
  necessária; textos longos e com quebra de linha já passavam por esse
  caminho sem truncar.
- Limitação preexistente **registrada, não alterada nesta tarefa**: o merge
  aditivo (`unionEntryImages`/`mergeEntryNonDestructive`) não faz
  reconciliação campo a campo — se a MESMA imagem tiver `label` diferente em
  dois dispositivos, o merge mantém a versão do lado processado como base.
  Isso já valia pra qualquer campo de imagem antes desta entrega; não foi
  criada nem alterada nenhuma lógica de resolução de conflito.
- Compatibilidade com imagens antigas sem `label` preservada (`label||''`
  em toda leitura, como já era).
- **Alteração 055 (bootstrap seguro em dispositivo novo) permanece
  totalmente intacta** — nenhuma função/linha daquela entrega foi tocada
  nesta tarefa; confirmado por `git diff` (todas as ocorrências dos
  identificadores daquela alteração aparecem só como adições da própria
  Alteração 055, nenhuma como remoção/edição nesta) e pela suíte
  `tests/device-bootstrap.test.js` continuando 32 PASS / 0 FAIL sem
  nenhuma alteração no arquivo de teste.

### Testes realizados

- `node tests/image-description.test.js` (novo): **21 PASS**, 0 FAIL —
  campo único (sem campo novo), textarea nos 3 locais sem `maxlength`,
  lightbox com/sem descrição (dinâmico, DOM falsa mínima), descrição sempre
  abaixo da imagem via CSS, gate do Quiz (`st.answered`) também no lightbox,
  detalhe da lesão com `esc()`, e confirmação de que a lógica de merge não
  foi tocada.
- `node tests/quiz-images.test.js`: **102 PASS**, 0 FAIL (2 testes
  atualizados pra nova assinatura do lightbox + 1 teste novo sobre o gate).
- `node tests/critical-flows.test.js`: **21 PASS**, 0 FAIL (âncoras
  atualizadas para 6236/6246/8788/11868).
- `node tests/device-bootstrap.test.js`: **32 PASS**, 0 FAIL, sem alteração
  no arquivo — confirma a Alteração 055 intacta.
- `node tests/collage-desc.test.js`, `tests/quiz-image-desc.test.js`: **15
  PASS** / **8 PASS**, sem alterações necessárias.
- Suíte completa: **720 PASS, 5 TODO**, só o FAIL histórico
  (`DUPLICATE_PAIRS_V171`, fora de escopo).
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Qualquer imagem ou quadro pode ter uma descrição longa e multilinha,
escrita/editada nos 3 lugares onde isso já fazia sentido, sempre visível
onde já devia aparecer (detalhe, editor, modal do Quiz) e — a novidade —
também ao maximizar, com a regra de sigilo do Quiz preservada à risca
(nunca antes de responder).

### Validação

**Aprovada em teste manual pelo usuário em 21/09/2026** — testes visuais e
funcionais realizados, resultado correto. Considerada BASELINE ESTÁVEL do
projeto junto com as Alterações 055 e 057.

### Commit após aprovação

Aprovada; commit/publicação ainda não criados (aguardando pedido explícito
do usuário).

**Número da alteração:** 057
**Data:** 21/09/2026

### Objetivo

Ajuste VISUAL da Alteração 056, aprovado pelo usuário após teste real: a
lógica (gate do Quiz, persistência, sync) ficou correta e não foi tocada —
só a apresentação precisava de polimento.

### Estado antes

No detalhe da lesão, uma descrição longa ocupava espaço demais e poluía o
layout, sem forma de recolher. No lightbox, a descrição ficava presa à
largura que a IMAGEM ocupava (uma imagem estreita/retrato forçava o texto a
quebrar em muitas linhas à toa), com padding/line-height maiores que o
necessário.

### O que foi alterado (só CSS + 1 wiring de clique, sem tocar lógica)

- `.detail-img-label`: clamp visual de 2 linhas (`-webkit-line-clamp:2`) +
  classe `.expanded` que remove o clamp. Clique alterna a classe
  (`labelEl.classList.toggle('expanded')`) — não toca `img.label`/`DATA`; o
  texto completo (`esc(img.label)`) sempre esteve e continua no DOM, só a
  apresentação corta visualmente.
- `.lightbox-content`: ganhou `width:min(1200px,94vw)` — a coluna da
  descrição agora escala com a TELA, não com o tamanho renderizado da
  imagem. `.lightbox-desc` perdeu o teto fixo de `720px`, ganhou
  `padding:8px 18px` (era `12px 14px`) e `line-height:1.4` (era `1.55`).
  `.lightbox-img` (tamanho/posição) não foi tocado.
- `quizImageDescHtml`: mesmo ajuste de respiro (`padding`/`line-height`
  reduzidos, `text-align:left` explícito, `white-space:pre-wrap` pra
  parágrafos ficarem consistentes com detalhe/lightbox) — **sem** nenhum
  truncamento; depois de responder, a descrição continua aparecendo
  inteira, como sempre.

### Segurança / não regressão

- Nenhuma mudança em `label`, IndexedDB, Firebase, sync, merge, ownership,
  dedup, backup/restore, importação/exportação.
- Gate do Quiz (nada antes de responder, tudo depois) intocado — confirmado
  por teste dedicado.
- **Alteração 055 confirmada intacta** (nenhuma linha removida/editada nos
  identificadores do bootstrap; `tests/device-bootstrap.test.js` continua
  32 PASS sem alteração no arquivo).

### Testes realizados

- `tests/image-description.test.js`: **31 PASS** (+10 testes novos: clamp
  de 2 linhas via CSS, texto íntegro no DOM, toggle de expandir/recolher
  sem mutar dado, regressão do Quiz sem truncamento, regressão do gate do
  lightbox, largura independente da imagem, padding/line-height compactos
  sem reduzir fonte, imagem como elemento prioritário intocado).
- `tests/critical-flows.test.js`: **21 PASS** (âncoras 6247/6257/8799/11884).
- `tests/device-bootstrap.test.js`: **32 PASS**, sem alteração.
- Suíte completa: **730 PASS, 5 TODO**, só o FAIL histórico.
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Detalhe da lesão compacto por padrão (2 linhas + expandir/recolher sob
clique); lightbox com a descrição usando muito mais largura horizontal,
mais compacta verticalmente, sempre abaixo da imagem e nunca sobreposta;
Quiz pós-resposta com o mesmo respiro, sem truncar.

### Validação

**Aprovada em teste manual pelo usuário em 21/09/2026** — testes visuais e
funcionais realizados, resultado correto ("a apresentação ficou
excelente"). Considerada BASELINE ESTÁVEL do projeto junto com as
Alterações 055 e 056.

### Commit após aprovação

Aprovada; commit/publicação ainda não criados (aguardando pedido explícito
do usuário).

**Número da alteração:** 058
**Data:** 21/09/2026

### Objetivo

Registrar formalmente a validação manual das Alterações 055, 056 e 057
(nenhuma alteração de código funcional — só documentação).

### O que foi feito

Nenhum código foi alterado nesta entrada. Atualização de
`LOG_DESENVOLVIMENTO.md`, `AI.md` e `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`
para registrar que o usuário testou manualmente (funcional e visualmente) e
aprovou as três entregas anteriores, marcando-as como **baseline estável
do projeto**:

- **Alteração 055** — bootstrap seguro em dispositivo novo.
- **Alteração 056** — descrição persistente de imagens e quadros.
- **Alteração 057** — refinamento visual das descrições.

### Estado após esta entrada

- Nenhum commit foi criado; nada foi publicado. `git status` continua
  mostrando as mesmas alterações não commitadas de `index.html` e dos
  arquivos de teste/documentação das três entregas anteriores.
- Suíte completa validada pela última vez nesta sessão: **730 PASS, 5
  TODO, 1 FAIL histórico** (`duplicate-detection.test.js`,
  `DUPLICATE_PAIRS_V171`, fora de escopo). `git diff --check` sem erros.
- Publicação/commit permanecem pendentes de pedido explícito do usuário.

### Commit após aprovação

**Publicado** (atualização retroativa desta nota): commit `670ffd6` —
"feat: secure device bootstrap and image descriptions" — criado e enviado
para `origin/main` mediante pedido explícito do usuário (Alterações
055–058). `HEAD` local e `origin/main` confirmados idênticos no momento do
push.

**Número da alteração:** 059
**Data:** 21/09/2026

### Objetivo

Auditoria forense + correção pontual: 2 imagens (`atlas-radiologico/o0ykul2z1qp00pp6yxel`,
`atlas-radiologico/n5oyigvmkpb8zpqykd3g`) foram encontradas — via cross-
reference entre o `SEED` congelado em 18/09/2026 (git, antes de qualquer
reconciliação ao vivo) e um backup real exportado do app em 20/09/2026—
com o próprio `lesionName` reescrito de "Abscesso cerebral" para
"Oligodendroglioma". Causa raiz: o antigo sincronismo canônico por id
(hoje desligado, `CANONICAL_REFRESH_DISABLED_V250=true`) casou um registro
persistido com o SEED só pelo `id` posicional, sem checar identidade
semântica, no momento em que o SEED foi reordenado/compactado (70
duplicatas removidas em 18/09/2026 11:46, commit `c27fe256`).

### Estado antes

As 2 imagens apareciam sob "Oligodendroglioma" (hoje `seed_11`), enquanto
seu conteúdo real e todo o histórico (SEED de 18/09, `createdAt` no
Cloudinary de 14/09) apontam para "Abscesso cerebral" (hoje `seed_10`).
Outras 63 ocorrências no acervo têm `lesionId` desatualizado mas
`lesionName` já compatível com a lesão atual — classificadas
`LEGACY_ID_ONLY`, inofensivas, não tocadas.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras)
- `tests/ownership-fix-20260921.test.js` (novo, 10 testes)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- **`fixAbscessoOligodendrogliomaOwnership20260921()`** (nova, console-only,
  mesmo padrão de `consolidateSameIdDuplicates`): localiza origem/destino
  por **identidade semântica** (`exactLesionIdentityKey`, s+site+nome),
  nunca por `seed_N`; confirma as 2 imagens pelo `publicId` exato; snapshot
  obrigatório antes (aborta se falhar); usa o guard manual existente
  (`assertManualImageOwnershipChange`/`IMAGE_OWNERSHIP_MANUAL`); remove da
  origem e adiciona ao destino reaproveitando `removeImageFromLesionData`/
  `addImageToLesionData` (já existentes, sem lógica paralela); persiste via
  `saveData()`. Preserva assetId/publicId/URL/label/source/attribution/
  assignedAt; nunca chama upload/destroy no Cloudinary; nunca carimba
  `assignedAt` novo (é correção histórica, não produtividade nova).
- **Proteção arquitetural em `loadData()`**: o bloco de sincronismo
  canônico por id (inerte, `CANONICAL_REFRESH_DISABLED_V250=true`, mantido
  desligado) ganhou uma checagem de identidade semântica ANTES de copiar
  qualquer campo — se o registro persistido já tem `s+site+name` e eles não
  batem com o canônico da mesma posição, o conflito é **registrado**
  (`registerImageOwnershipConflict`) e nada é alterado automaticamente.
  Protege contra uma recorrência do mesmo bug, mesmo que o bloco seja
  reativado no futuro por engano.

### Segurança

- As 63 ocorrências `LEGACY_ID_ONLY` não foram tocadas (confirmado por
  teste dedicado).
- Nenhuma migração global; nenhuma reescrita de `lesionId` em massa;
  `CANONICAL_REFRESH_DISABLED_V250` continua `true`; nenhum reorder no
  SEED.
- SRS/REVIEW/LESION_REVISIONS/SESSIONLOG intocados (indexados pelo id da
  lesão, que não muda nesta correção).

### Testes realizados

- `node tests/ownership-fix-20260921.test.js` (novo): **10 PASS**, 0 FAIL
  — cobre as 14 verificações pedidas (localização semântica, sem
  duplicar, metadados preservados, `assignedAt` intacto, sem Cloudinary,
  SRS/revisão intactos, `LEGACY_ID_ONLY` preservado, canonical refresh
  continua bloqueado, conflito semântico nunca autoaplicado).
- `node tests/critical-flows.test.js`: **21 PASS**, 0 FAIL (âncoras
  atualizadas: `loadData` continua 8799; `importHandler` foi para 11900).
- Suíte completa: **740 PASS, 5 TODO**, só o FAIL histórico.
- `git diff --check`: sem erros de espaço em branco.

### Resultado

**Executada pelo usuário no console do navegador e CONFIRMADA no `DATA`
real (21/09/2026):**

```
{ ok: true,
  reason: '2 imagem(ns) movida(s) de "Oligodendroglioma" para "Abscesso cerebral"',
  snapshotId: 'snap_mubyvs5t_x2jmnm' }
```

Conferência visual manual aprovada pelo usuário: Oligodendroglioma sem as
2 imagens incorretas; Abscesso cerebral com as 2 imagens corretas.

### Commit após aprovação

**Publicado** — commit e push executados nesta mesma entrega, mediante
pedido explícito do usuário (ver hash abaixo/relatório final da sessão).

**Número da alteração:** 055
**Data:** 22/09/2026

### Objetivo

Corrigir tela cinza + scroll travado após Salvar edição de lesão (backdrop
residual que só saía com um clique).

### Estado antes

`refreshStudyDashboardLive()` chamava `getStudyOverlay()`, que cria a
`#study-overlay` quando ausente — o guarda `!ov.isConnected` nunca barrava.
As chamadas no pós-save criavam o backdrop com o dashboard fechado.

### Arquivos modificados

- `index.html` (lookup sem criar em `refreshStudyDashboardLive`)
- `tests/modal-cleanup.test.js` (novo, 14 testes)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `getElementById('study-overlay')` direto; `getStudyOverlay()` intocado
  (fluxos que abrem o dashboard continuam usando-o).
- Sem setTimeout, clique sintético, reload ou remoção indiscriminada.

### Segurança

Nenhuma mudança em dados, sync, quiz, SRS, imagens ou classificação.

### Testes realizados

- `node tests/modal-cleanup.test.js`: 14 PASS, 0 FAIL;
- `critical-flows`: 21 PASS; `external-import`: 67 PASS;
  `collage-desc`: 15 PASS; `quiz-image-desc`: 8 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Pós-save sem overlay residual, scroll imediato, aninhados preservados.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 060
**Data:** 22/09/2026

### Objetivo

Reduzir a altura do formulário recolhendo só o secundário (sequências,
tags avançadas, localização adicional), sem esconder descrição/tags da
imagem.

### Estado antes

Presets de sequência, todos os grupos de sugestão e altPlacements sempre
expandidos, ocupando muita altura.

### Arquivos modificados

- `index.html` (toggles + `altToggleLabel` puro, só UI)
- `tests/form-collapse.test.js` (novo, 9 testes)
- `tests/critical-flows.test.js` (âncora importHandler 11949)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `▸ Sequências / modalidade` por imagem (WeakSet entre re-renders),
  `▸ Tags avançadas`, `▸ Localização adicional (opcional[, N])`; tudo
  começa recolhido, sem persistência, sem mudar DATA/save/chips/sync.

### Segurança

Só alterna `hidden`/rótulo/aria; preview, descrição, tags, ações intactos.

### Testes realizados

- `node tests/form-collapse.test.js`: 9 PASS, 0 FAIL;
- `critical-flows`: 21 PASS; `external-import`: 67 PASS;
  `collage-desc`: 15 PASS; `quiz-image-desc`: 8 PASS;
  `lesion-review`: 138 PASS; `quiz-images`: 102 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Formulário compacto com informações da imagem sempre visíveis.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 061
**Data:** 22/09/2026

### Objetivo

Layout desktop do editor: modal largo com scroll interno, rodapé sticky e
grids responsivos, sem alterar lógica.

### Estado antes

Modal estreito (560px), tudo empilhado, Salvar só no fim, espaço lateral
desperdiçado em desktop.

### Arquivos modificados

- `index.html` (template + `<style>` embutido no modal)
- `tests/form-layout-desktop.test.js` (novo, 10 testes)
- `tests/critical-flows.test.js` (âncora importHandler 11961)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Modal `min(1180px,100vw-40px)`, `max-height:92vh`, body rolável, rodapé
  sticky; grade Seção/Sítio/Incidência (3→2→1); galeria 2-3 colunas;
  espaçamentos compactos; expansores preservados.

### Segurança

Só template/CSS; ids, save, DATA, sync e demais fluxos intactos.

### Testes realizados

- `node tests/form-layout-desktop.test.js`: 10 PASS, 0 FAIL;
- `form-collapse`: 9 PASS; `lesion-review`: 138 PASS;
  `quiz-images`: 102 PASS; `critical-flows`: 21 PASS;
  `external-import`: 67 PASS; `collage-desc`: 15 PASS;
  `quiz-image-desc`: 8 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Editor aproveita o desktop com rodapé sempre visível; responsivo em
janelas menores.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 062
**Data:** 22/09/2026

### Objetivo

Paste em toda a seção de imagens do editor + zoom profundo com pan no
lightbox, sem alterar persistência/Cloudinary/estrutura.

### Estado antes

Ctrl+V só na caixinha de upload; lightbox sem zoom (só fit + fechar).

### Arquivos modificados

- `index.html` (zona `#images-field` + núcleo puro paste/zoom + lightbox)
- `tests/image-handling.test.js` (novo, 18 testes)
- `tests/image-description.test.js` (harness extrai helpers de zoom)
- `tests/critical-flows.test.js` (âncora importHandler 11982)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `#images-field` focável com dica; listener com guarda
  `pasteTargetIsText` + dedup com a caixa; mesmo `addLocalFile`.
- Lightbox: roda com âncora no cursor (1–20x), botões −/100%/+/Reset,
  % discreto, pan com clamp, duplo-clique/EESC, estado por abertura;
  assinatura e classes preservadas, sem CSS novo.
- Lateral: `imagesAssignedLast7Days` com duck-type de Date (teste flaky
  pós-meia-noite eliminado).

### Segurança

Texto nunca interceptado; nada enviado antes do Salvar; escape intacto.

### Testes realizados

- `node tests/image-handling.test.js`: 18 PASS, 0 FAIL;
- `quiz-images`: 102 PASS; `collage-desc`: 15 PASS;
  `critical-flows`: 21 PASS; `form-collapse`: 9 PASS;
  `form-layout-desktop`: 10 PASS; `image-description`: 31 PASS;
  `modal-cleanup`: 14 PASS; `snapshots-ownership`: 46 PASS;
- Suíte completa: sem regressão (só o FAIL histórico);
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Colar em qualquer ponto da seção; zoom até 2000% com pan e reset.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 063
**Data:** 22/09/2026

### Objetivo

Embutir "▸ Tags avançadas" na mesma linha do título "Tags de
característica de imagem", sem linha extra.

### Estado antes

Expansor ocupava linha própria de largura total abaixo dos chips.

### Arquivos modificados

- `index.html` (linha flex título + toggle; resto intacto)
- `tests/form-collapse.test.js` (+1 teste de posição)
- `tests/critical-flows.test.js` (âncora importHandler 11984)

### O que foi alterado

- Título à esquerda, expansor à direita (`space-between`, `wrap`
  responsivo); conteúdo avançado continua logo abaixo dos chips; fiação,
  dados, save e demais fluxos intactos.

### Testes realizados

- `node tests/form-collapse.test.js`: 10 PASS, 0 FAIL;
- `critical-flows`: 21 PASS; `lesion-review`: 138 PASS;
  `quiz-images`: 102 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Cabeçalho compacto sem perder função nem quebrar responsivo.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 065
**Data:** 22/09/2026

### Objetivo

Restaurar Cancelar/Salvar no DOM: faltava a abertura do
`.lesion-form-body` (só existia o fechamento), desequilibrando o template
(35 opens × 36 closes) e quebrando modal/rodapé.

### Estado antes

Rodapé fora do modal no DOM (botões ausentes para o navegador).

### Arquivos modificados

- `index.html` (1 linha: abertura do corpo)
- `tests/form-layout-desktop.test.js` (+2 regressões: footer e balanço)
- `tests/critical-flows.test.js` (âncora importHandler 11984)

### Testes realizados

- `node tests/form-layout-desktop.test.js`: 12 PASS, 0 FAIL;
- `modal-cleanup`: 14 PASS; `critical-flows`: 21 PASS;
  `external-import`: 67 PASS; `collage-desc`: 15 PASS;
  `quiz-image-desc`: 8 PASS; `form-collapse`: 11 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Template 36×36, footer sticky com os dois botões, tags no topo.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 064
**Data:** 22/09/2026

### Objetivo

Mover TODO o bloco de tags para o topo do formulário (após o subtítulo,
antes de Nome da lesão) e remover a ocorrência antiga do fim.

### Estado antes

Bloco (mesmo com toggle inline) permanecia no fim do formulário.

### Arquivos modificados

- `index.html` (bloco movido, ocorrência antiga removida)
- `tests/form-collapse.test.js` (+1 teste de posição/unicidade)
- `tests/critical-flows.test.js` (âncora importHandler 11983)

### O que foi alterado

- Só posição no template; ids, fiação, chips, avançadas, save e dados
  intactos; expansor continua na linha do título.

### Testes realizados

- `node tests/form-collapse.test.js`: 11 PASS, 0 FAIL;
- `critical-flows`: 21 PASS; `lesion-review`: 138 PASS;
  `quiz-images`: 102 PASS; `form-layout-desktop`: 10 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Tags principais + avançadas no topo; restante do formulário abaixo.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 065
**Data:** 22/09/2026

### Objetivo

Evoluir o importador de casos do Radiopaedia: hoje, todo caso importado
virava sempre uma lesão nova. Agora também é possível vincular o caso a
uma lesão que JÁ existe no Atlas, como "caso clínico exemplo" — sem
sobrescrever nada do que já estava cadastrado nessa lesão.

### Estado antes

Ao clicar em "Enviar ao Atlas" no Radiopaedia, o modal só oferecia
"Criar nova lesão" (ou abrir uma lesão parecida, sem anexar nada a ela).

### Arquivos modificados

- `index.html` (nova opção "Vincular a lesão existente", campo opcional
  `clinicalCases` na lesão, seção "Casos clínicos exemplo" no detalhe,
  visualizar/remover vínculo no editor, sincronização entre dispositivos)
- `tests/clinical-cases.test.js` (novo)
- `tests/external-import.test.js` (ajuste de suporte às novas funções)
- `tests/critical-flows.test.js` (âncoras de linha atualizadas)
- `tests/snapshots-ownership.test.js` (+1 teste)
- `tests/device-bootstrap.test.js` (ajuste de suporte, sem mudar cenários)
- `AI.md`, `README.md`, este diário

### O que foi alterado

- Ao receber um caso do Radiopaedia, o modal agora tem duas opções: "🔗
  Vincular a lesão existente" e "➕ Criar nova lesão" (que continua
  funcionando exatamente como antes, sem nenhuma mudança).
- Na aba de vincular: uma busca automática (reaproveitando a mesma
  proteção contra falso positivo que já existia) e uma busca manual
  ("Pesquisar lesão existente no Atlas…") por nome, sinônimo em inglês ou
  tag.
- Ao escolher uma lesão, aparece a confirmação "Vincular este caso a:
  [nome] [seção › sítio]" com o botão "Adicionar como caso clínico
  exemplo". Só depois desse clique o vínculo é realmente salvo.
- O vínculo entra num campo novo e opcional da lesão, `clinicalCases`,
  guardando só os dados que o Radiopaedia realmente forneceu (título,
  link, idade/sexo, modalidade, apresentação, data). Nome, descrição,
  tags, seção, sítio, imagens, classificação e o "dono" das imagens da
  lesão NUNCA são alterados por esse caminho.
- O mesmo caso não duplica se vinculado de novo à mesma lesão. Se o
  mesmo caso já estiver vinculado a OUTRA lesão, o Atlas avisa e só
  permite vincular também ali com uma confirmação extra explícita —
  nunca em silêncio.
- Na tela de detalhe da lesão, quando existem casos vinculados, aparece
  uma seção recolhível "Casos clínicos exemplo (N)" com um resumo de cada
  caso e um link "Abrir caso".
- No formulário de editar lesão, dá para ver e remover um vínculo (isso
  não apaga a lesão nem mexe nas imagens do Cloudinary).
- Esses casos vinculados são salvos e sincronizados do mesmo jeito que o
  resto da lesão (computador local, nuvem, backup) e, ao sincronizar dois
  dispositivos, os vínculos de ambos são somados (nunca um substitui o
  outro nem se perde).

### Testes realizados

- `node tests/clinical-cases.test.js`: 34 PASS, 0 FAIL (novo arquivo);
- `node tests/external-import.test.js`: 67 PASS, 0 FAIL (sem regressão);
- `node tests/critical-flows.test.js`: 21 PASS, 0 FAIL (âncoras
  atualizadas: `recovery` 6263, `brokenArtifacts` 6253, `loadData` 8805,
  `importHandler` 12019);
- `node tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- `node tests/device-bootstrap.test.js`: 32 PASS, 0 FAIL (precisou de um
  pequeno ajuste no próprio teste para reconhecer a função nova de união
  de casos clínicos — nenhum cenário existente foi alterado);
- Suíte completa do projeto: 830 PASS, 5 TODO (conhecidos, não
  relacionados) e 1 FAIL histórico em `duplicate-detection.test.js` (as 28
  entradas malformadas de `DUPLICATE_PAIRS_V171`, já documentado e fora de
  escopo desta tarefa);
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O importador ganhou o caminho de vincular a uma lesão já existente, sem
tocar no caminho de criar lesão nova (que continua idêntico) nem em
nenhum dado clínico já cadastrado. Todos os testes pedidos passaram.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 066
**Data:** 22/09/2026

### Objetivo

Dois problemas relacionados ao campo "Sítio / órgão" do editor de lesão:
(1) não havia uma seta visível para abrir a lista de sítios já cadastrados
na seção, só um autocomplete discreto; (2) digitar qualquer texto nesse
campo e salvar criava uma subseção nova sem nenhum aviso — foi assim que
"Fossa ilíaca direita" apareceu como subseção de "Abdômen Superior" sem
intenção.

### Estado antes

O campo "Sítio / órgão" era um `<input>` de texto livre, sem seta, sem
lista, sem validação nenhuma contra o que já existia.

### Arquivos modificados

- `index.html` (seta/dropdown no campo, aviso de "sítio novo", validação
  no Salvar, e uma ferramenta de console — não executada — para migrar uma
  lesão de sítio com segurança)
- `tests/site-taxonomy.test.js` (novo)
- `tests/critical-flows.test.js` (âncora atualizada)
- `AI.md`, `README.md`, este diário

### O que foi alterado

- O campo "Sítio / órgão" ganhou uma seta (▾) que abre todos os sítios já
  cadastrados na seção escolhida — a mesma lista que a barra lateral já
  mostra (o Atlas nunca teve uma lista separada de seções/sítios: ela é
  sempre calculada, na hora, a partir das lesões que já existem). Dá para
  digitar pra filtrar, e a seta funciona mesmo com o campo vazio.
- Ao salvar, o sítio digitado agora precisa bater com um já cadastrado na
  seção. Se não bater, aparece um aviso "⚠️ Este sítio ainda não existe
  nesta seção" com uma caixinha "confirmar que é um sítio/órgão novo" — só
  marcando essa caixinha o Atlas aceita um sítio realmente novo. Sem
  marcar, salvar mostra "Selecione um sítio/órgão existente na lista." e
  não salva. Isso vale só para o campo Sítio/órgão — a Seção continua como
  estava, sem essa trava.
- Como a lista de sítios é sempre calculada na hora a partir das lesões
  reais, não existe um passo separado de "apagar uma subseção": basta
  nenhuma lesão mais usar aquele sítio, e ele some sozinho da tela na
  próxima vez que a página atualizar. Por isso não há risco dele voltar
  depois de um F5.
- Foi criada uma ferramenta de console (só para uso manual, como as outras
  ferramentas de correção pontual do Atlas) para mover uma lesão de um
  sítio para outro com segurança: cria uma cópia de segurança antes, muda
  só o campo do sítio, acrescenta o nome do sítio antigo como uma tag (se
  ainda não tiver), e preserva tudo o mais — imagens, descrição, links,
  casos clínicos vinculados, classificação, ownership e progresso do
  estudo. **Essa ferramenta não foi executada nesta tarefa.**

### Auditoria de "Fossa ilíaca direita" (pedida, não executada)

O arquivo `index.html` deste repositório não tem nenhuma lesão com esse
sítio — nem "Fossa ilíaca direita" nem "Diverticulite de Meckel" aparecem
no catálogo embutido (`SEED`). Isso é esperado: o catálogo que o usuário
vê no navegador vive no IndexedDB/Firestore dele, não no arquivo do
repositório, e os dois podem estar diferentes. Por isso a auditoria real
precisa ser feita no navegador do usuário — foi passado um comando de
console (só leitura, não altera nada) para ele rodar e trazer a lista real
de lesões afetadas antes de qualquer migração.

### Testes realizados

- `node tests/site-taxonomy.test.js`: 25 PASS, 0 FAIL (novo arquivo);
- `node tests/critical-flows.test.js`: 21 PASS, 0 FAIL (âncora
  `importHandler` atualizada; as outras três não mudaram);
- `node tests/form-layout-desktop.test.js`: 12 PASS, 0 FAIL;
- `node tests/form-collapse.test.js`: 11 PASS, 0 FAIL;
- `node tests/clinical-cases.test.js`: 47 PASS, 0 FAIL;
- `node tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- Suíte completa do projeto: 868 PASS, 5 TODO (conhecidos) e 1 FAIL
  histórico em `duplicate-detection.test.js` (fora de escopo, já
  documentado);
- `git diff --check`: sem erros de espaço em branco.

### Resultado

A seta/dropdown e a proteção contra subseção acidental estão prontas e
testadas. A correção de dados de "Fossa ilíaca direita" NÃO foi feita —
está esperando o usuário rodar a auditoria real no navegador dele e
escolher o sítio de destino.

### Commit após aprovação

Commit `88d6047` ("Sitio/orgao: dropdown de sitios + protecao contra
subsecao acidental"), publicado em `origin/main` mediante pedido explícito
do usuário em tarefa seguinte. A migração real de dados continuou não
executada.

**Número da alteração:** 067
**Data:** 22/09/2026

### Objetivo

Corrigir um bug real relatado pelo usuário: ao testar
`migrateLesionSite('u_1790101615508_5dm18o', 'Intestino / cólon')` no site
já publicado, o Atlas sempre devolvia `{ ok:false, reason:'snapshot
falhou...' }` e a lesão não era alterada — mesmo com tudo funcionando
normalmente.

### Estado antes

`migrateLesionSite()` pedia um "carimbo de segurança" antes de mexer na
lesão (`createSafetySnapshot('antes de migrar sítio de lesão')`), mas essa
frase nunca tinha sido cadastrada na lista de motivos que o Atlas realmente
aceita para criar esse carimbo. Sem estar na lista, o pedido de carimbo
sempre volta vazio — não porque algo quebrou, mas porque a frase certa
nunca foi ensinada ao Atlas.

### Arquivos modificados

- `index.html` (frase adicionada à lista aprovada; diagnóstico de erro mais
  claro; `fromSite`/`toSite` aparecem no retorno mesmo quando dá erro)
- `tests/site-taxonomy.test.js` (+6 testes usando o mecanismo de carimbo de
  segurança DE VERDADE, não uma simulação)
- `tests/critical-flows.test.js` (âncora atualizada)
- `AI.md`, `README.md`, este diário

### O que foi alterado

- A frase `'antes de migrar sítio de lesão'` foi adicionada à lista de
  motivos aprovados (a mesma lista já usada por outras correções do Atlas,
  como importar backup ou fundir duplicatas) — sem criar nenhum atalho que
  pule a proteção.
- Se algum dia essa frase sumir da lista de novo por engano, o Atlas agora
  explica exatamente isso no erro, em vez de uma mensagem genérica.
- A lesão de origem e o sítio de destino aparecem no retorno mesmo quando
  a migração falha, pra facilitar entender o que deu errado.
- Nada na proteção em si foi removido ou enfraquecida: o carimbo de
  segurança continua obrigatório antes de qualquer alteração, e sem ele
  nada é mudado na lesão.

### Testes realizados

- `node tests/site-taxonomy.test.js`: 31 PASS, 0 FAIL (6 novos, usando o
  mecanismo real de carimbo de segurança);
- `node tests/critical-flows.test.js`: 21 PASS, 0 FAIL (âncoras +1);
- `node tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- Suíte completa do projeto: 874 PASS, 5 TODO (conhecidos) e 1 FAIL
  histórico em `duplicate-detection.test.js` (fora de escopo);
- `git diff --check`: sem erros de espaço em branco.

### Resultado

O comando que o usuário tentou rodar (`migrateLesionSite(...)`) agora
funciona de verdade. A migração real de "Fossa ilíaca direita" continua
não executada — pedido explícito do usuário para rodar manualmente.

### Commit após aprovação

Ainda não criado no momento em que este registro foi escrito (a
publicação, quando aprovada, é registrada com o hash real assim que o
commit existir).

**Número da alteração:** 064
**Data:** 22/09/2026

### Objetivo

Mover o painel "Histórico de imagens" para fora de Ferramentas avançadas:
sidebar, acima de "configurar Cloudinary". Só posição/layout.

### Estado antes

O painel existia em 2 lugares ao mesmo tempo (sidebar + dentro de
#advanced-tools), com IDs duplicados (`btn-images-history`,
`images-history-panel`).

### Arquivos modificados

- `index.html` (removida a cópia de dentro de #advanced-tools; rótulo
  unificado em "▸ Histórico de imagens")
- `tests/images-history.test.js` (testes de posição/unicidade)
- `tests/critical-flows.test.js` (âncoras remedidas)

### O que foi alterado

- Nada na lógica: mesma fiação (`getElementById` agora sem ambiguidade),
  mesmos filtros, agrupamento, links e lazy ao expandir.

### Testes realizados

- `node tests/images-history.test.js`: 31 PASS, 0 FAIL;
- `critical-flows`: 21 PASS; `tools-layout`: 11 PASS;
  `local-scope-prefs`: 14 PASS; `sidebar-image-stats`: 22 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Painel único na sidebar; Ferramentas avançadas independente.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 065
**Data:** 22/09/2026

### Objetivo

Transformar o "Histórico de imagens" num LOG compacto: uma linha por
lesão, sem seção/sítio/horários, com scroll interno.

### Estado antes

Cada lesão ocupava várias linhas (nome + seção/sítio + horários), fonte
grande, sem scroll — o painel empurrava o resto da sidebar.

### Arquivos modificados

- `index.html` (só render: `imagesHistoryLesionRowHtml`,
  `imagesHistoryDayGroupHtml`, resumo menor, scroll em
  `#images-history-list`)
- `tests/images-history.test.js` (+11 testes do log compacto; teste de
  horários invertido para ausência)

### O que foi alterado

- Linha única nome + contador, ellipsis com `title` completo, fonte
  12.5/11px, cabeçalho do dia compacto, resumo menor, lista com
  `max-height:320px` + `overflow-y:auto` (resumo/filtros/"mostrar mais"
  fora da rolagem). Dados, contagens, filtros, links e lazy intactos.

### Testes realizados

- `node tests/images-history.test.js`: 42 PASS, 0 FAIL;
- `tools-layout`: 11 PASS; `critical-flows`: 21 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Log denso e legível; painel não desloca mais a sidebar.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 066
**Data:** 22/09/2026

### Objetivo

"← Voltar para imagens de hoje" no detalhe aberto pelo modal do KPI,
sem mexer nos demais fluxos.

### Estado antes

Abrir lesão pelo modal destruía a lista sem volta (só fechando tudo).

### Arquivos modificados

- `index.html` (`openDetail(id, opts)` + botão + fiação; `openLesion`
  passa `{ returnTo: 'images-today' }`)
- `tests/images-today-modal.test.js` (+7 testes do Voltar)
- `tests/critical-flows.test.js` (âncora importHandler 12237)

### O que foi alterado

- Contexto opcional allowlist; Voltar remove só o detalhe e reabre a
  lista recalculada; Fechar/ESC inalterados; sem stack global, sem
  history, sem reload.

### Testes realizados

- `node tests/images-today-modal.test.js`: 31 PASS, 0 FAIL;
- `modal-cleanup`: 14 PASS; `critical-flows`: 21 PASS;
  `collage-desc`: 15 PASS; `quiz-image-desc`: 8 PASS;
  `image-productivity`: 20 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Ciclo lista → detalhe → voltar repetível, Dashboard/Quiz intactos.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

**Número da alteração:** 067
**Data:** 22/09/2026

### Objetivo

Estado padrão de fábrica dos filtros: reload e "Limpar filtros" sempre
resultam em Todas as seções, sem tags, Revisões=Todas.

### Estado antes

O boot restaurava seção/sítio antigos do localStorage; o botão Limpar
só aparecia com tags e não zerava o filtro de Revisões.

### Arquivos modificados

- `index.html` (boot ignora seção/sítio guardados; Limpar cobre
  tags/busca/escopo/Revisões)
- `tests/local-scope-prefs.test.js` (+6 testes de reset)
- `tests/critical-flows.test.js` (âncora importHandler 12253)

### O que foi alterado

- `loadData`: `scope={section:null,site:null}` + limpa input de busca
  (com guarda para ambientes sem DOM); Quiz e demais prefs intactos.
- Botão Limpar aparece com qualquer filtro ativo e zera tudo.
- Funções save/load de preferência preservadas (compatibilidade).

### Testes realizados

- `node tests/local-scope-prefs.test.js`: 20 PASS, 0 FAIL;
- `critical-flows`: 21 PASS; `sidebar-image-stats`: 22 PASS;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Catálogo sempre abre e limpa no mesmo estado de fábrica.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 068 — Sincronização multi-PC: pull automático reativado

**Número da alteração:** 068
**Data:** 23/09/2026

### Objetivo

Investigar e corrigir com cuidado por que um computador do hospital abriu o
Atlas mostrando só ~50 imagens enquanto a máquina principal tinha bem mais,
sem apagar dados de nenhum lado, sem depender de comandos manuais no
console e sem remover as proteções existentes contra overwrite
(`isNewLocalDevice`/`deviceBootstrapPending`).

### Estado antes

`loadData()` só consultava a nuvem automaticamente quando o IndexedDB local
estava genuinamente vazio (bootstrap de dispositivo NOVO, Alteração 055). Um
dispositivo JÁ inicializado (catálogo local de semanas atrás) nunca mais
verificava a nuvem — só empurrava (`pushToFirebaseNow()`, incondicional no
fim de todo boot e a cada `saveData()`) o que tinha localmente. Como
`writeShardedState()` faz `.set()` (substituição total, não merge), esse
push incondicional já sobrescrevia no Firestore qualquer imagem que só
existisse na nuvem, mesmo sem o usuário editar nada. O pull automático
tinha sido desligado de propósito na Alteração 008 (2026-09-19) por um
motivo específico (merge por id reintroduzindo duplicatas/ownership que a
reconciliação V2 tinha acabado de consolidar) que está coberto hoje por
proteções que não existiam naquela época
(`SUPPRESSED_DUPLICATE_IDS_V172` filtrando os dois lados do merge,
`mergeEntryNonDestructive`/`canChangeImageOwnership`).

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (5 testes "ALTERACAO 008" reescritos como
  "ALTERACAO 068"; âncoras recalculadas; contexto de vm com stub de
  `syncFromFirebase`)
- `tests/device-bootstrap.test.js` (2 testes de `loadData()` real com
  asserts novos sobre o pull automático)
- `tests/snapshots-ownership.test.js` (1 teste reescrito)
- `tests/multi-device-sync.test.js` (novo, 5 testes)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `loadData()`: `await syncFromFirebase();` reativado dentro de
  `if(!isNewLocalDevice){ … }`, logo após `appStateReady=true` e antes de
  qualquer push incondicional do resto do boot. Dispositivo novo não é
  afetado (já decidiu no modal do bootstrap).
- `setSyncStatus(ok, detail)`: passou a manter em memória
  `syncPushPending`/`lastSyncOkAt`/`lastSyncErrorAt`/`lastSyncErrorDetail`
  (nunca persistidos/sincronizados).
- Retry automático: `window.addEventListener('online', …)` chama
  `pushToFirebaseNow()` sozinho quando a última tentativa tinha falhado e a
  conexão volta.
- `buildSystemDiagnosticReport()`: seção de sincronização ganhou envio
  pendente, último sucesso/erro e comparação local × nuvem (reaproveita
  `buildSyncAudit()`, read-only) — sem painel novo.

### Segurança

- Nenhuma lógica de merge nova: continua sendo a MESMA `syncFromFirebase()`
  de sempre (snapshot antes/depois, merge não destrutivo, união aditiva de
  imagens, proteção de ownership), agora com mais um call site automático
  e guardado, além dos 4 explícitos que já existiam.
- `deviceBootstrapPending`, o modal de bootstrap de dispositivo novo, o
  bloqueio de push em `writeShardedState()` e a verificação pós-envio
  server-only continuam intactos.
- Pull silencioso quando offline/erro (não trava o boot, não apaga local);
  o aviso de sincronização (`sync-status`) e o novo estado
  `syncPushPending` cobrem o diagnóstico.

### Testes realizados

- `node --test tests/critical-flows.test.js`: 21 PASS, 0 FAIL;
- `node --test tests/device-bootstrap.test.js`: 32 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- `node --test tests/multi-device-sync.test.js` (novo): 5 PASS, 0 FAIL;
- Suíte completa (27 arquivos): **992 PASS**, 0 FAIL novo — as mesmas 3
  falhas pré-existentes de sempre continuam (1 em
  `duplicate-detection.test.js`, já documentada como histórica/fora de
  escopo; 2 em `images-history.test.js`, dependentes da data do sistema),
  confirmadas presentes mesmo sem nenhuma mudança de código via
  `git stash`;
- `git diff --check`: sem erros de espaço em branco.

### Resultado

Qualquer dispositivo já autenticado passa a ficar em dia com a nuvem só de
abrir o Atlas — sem clicar em nada, sem apagar dado de nenhum lado. Testado
com dois "computadores" simulados (storage local separado + nuvem
compartilhada) usando o código real de sincronização: PC desatualizado
recebe o que só existia na nuvem, PC que edita é recebido pelo outro num
boot seguinte, divergência cruzada vira união sem perda, sync repetido não
duplica imagem, ownership sobrevive ao round-trip, nuvem indisponível não
trava o boot. Teste manual com dois computadores reais ainda não foi feito
pelo usuário.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push — testar primeiro no
localhost).

## ALTERAÇÃO 069 — Barreira de reconciliação (bug real do teste manual)

**Número da alteração:** 069
**Data:** 23/09/2026

### Objetivo

Investigar um bug crítico relatado pelo usuário no primeiro teste manual
real da Alteração 068: Chrome com local 106/cloud 116 imagens; ao salvar 1
imagem nova, a nuvem caiu para 107 (perdeu as 10 exclusivas). Implementar
uma barreira explícita que garanta que nenhum push aconteça enquanto houver
uma reconciliação (pull/merge) em andamento, sem perder a edição concorrente.

### Estado antes

`pushToFirebase()`/`pushToFirebaseNow()` retornavam em silêncio quando
`fbSyncing` (reconciliação em andamento) era `true` — sem marcar nada, sem
retry. `syncThisDeviceToCloud()`, `mergeThisDeviceImagesToCloud()` e os 5
call sites de `syncFromFirebase()` não tinham guard contra reentrância.

### Causa real

Comprovada em código (não suposição): um push bloqueado por `fbSyncing`
era descartado sem deixar rastro. Análise formal (JS single-thread) não
encontrou um caminho, dentro de uma mesma aba, que reproduza exatamente
"116 → 107" — a hipótese mais provável para o caso relatado é a aba do
Chrome não ter sido recarregada (ainda rodando o código anterior à
Alteração 068). As falhas de silenciamento/reentrância são reais e foram
corrigidas de qualquer forma, como defesa em profundidade.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras recalculadas)
- `tests/snapshots-ownership.test.js` (2 testes ajustados — comentário novo
  mencionava "syncFromFirebase" e disparava falso positivo num regex ingênuo)
- `tests/multi-device-sync.test.js` (novo teste de concorrência + 3 testes
  de auditoria de identidade de imagens)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `syncFromFirebase()`: guard de reentrância no topo (`if(!fbDb ||
  fbSyncing) return;`), cobrindo os 5 call sites de uma vez.
- `pushToFirebase()`/`pushToFirebaseNow()`: marcam `syncPushPending=true`
  em vez de descartar em silêncio.
- `syncFromFirebase()`: flush no fim (sucesso ou falha) — se
  `syncPushPending` continuar `true`, reenvia o estado já mesclado.
- `syncThisDeviceToCloud()`/`mergeThisDeviceImagesToCloud()`: guard
  `fbSyncing` (mesmo mutex do resto do projeto).
- `buildSystemDiagnosticReport()`: "Reconciliação em andamento", "Dirty
  local", nota quando a comparação foi lida durante uma reconciliação.
- Nova auditoria read-only `buildImageIdentityDivergenceReport()`/
  `imageIdentityDivergenceForEntry()`/`buildImageIdentityDivergenceAuditFromServer()`:
  classifica imagens divergentes local×nuvem como exclusivas de verdade ou
  duplicatas exatas (por identidade estável), nunca apaga/move/funde nada.

### Segurança

`fbSyncing` continua o único mutex ("não deixe nada automático empurrar
agora"), reaproveitado — nenhum flag paralelo criado. Nenhuma lógica de
merge nova. `deviceBootstrapPending` e o bootstrap de dispositivo novo
intocados.

### Testes realizados

- `node --test tests/multi-device-sync.test.js`: 9 PASS, 0 FAIL (inclui o
  teste de concorrência e 3 de auditoria de identidade);
- `node --test tests/critical-flows.test.js`: 21 PASS, 0 FAIL;
- `node --test tests/device-bootstrap.test.js`: 32 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- Sanity-check: revertendo só a correção de `pushToFirebaseNow()` de
  propósito, o teste de concorrência FALHA (`push bloqueado precisa ficar
  marcado como pendente` — `false !== true`) — confirma que o teste captura
  o defeito de verdade;
- Suíte completa (28 arquivos): **996 PASS**, 0 FAIL novo (as mesmas 3
  falhas pré-existentes de sempre);
- `git diff --check`: sem erros de espaço em branco;
- Inline `<script>` do `index.html` verificado sintaticamente válido via
  `vm.Script` após cada edição.

### Resultado

Nenhum push — automático ou manual — pode mais competir com uma
reconciliação em andamento; uma edição feita durante esse período nunca
mais é perdida em silêncio, e é reenviada automaticamente já com o estado
mesclado assim que a reconciliação termina. Diagnóstico deixou de mostrar
"OK" e "Divergente: SIM" lado a lado sem explicação.

### Pendências

A hipótese da aba desatualizada precisa ser confirmada pelo usuário
(reabrir com hard-refresh antes do próximo teste). Compare-and-swap contra
timestamp do servidor (proteção adicional para dois dispositivos publicando
quase ao mesmo tempo) foi considerado e não implementado — risco maior que
benefício comprovado nesta entrega.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 070 — Controle de revisão / concorrência otimista

**Número da alteração:** 070
**Data:** 23/09/2026

### Objetivo

Corrigir bug crítico comprovado em teste manual real (hard-refresh
confirmado): Chrome mostrou local=nuvem=108 imagens às 13:43; Edge, aberto
um minuto depois, mostrou local=nuvem=118 às 13:44 — a nuvem estava
assumindo o estado do último dispositivo a publicar em vez de convergir.
Implementar controle de revisão / concorrência otimista real (sem TOCTOU)
antes de qualquer escrita destrutiva no Firestore.

### Causa real

`loadData()` tem dois pontos de push incondicional (o push interno de
`syncFromFirebase()` e o push final de `loadData()`) e nenhum dos dois
conferia se a nuvem ainda era a versão que o dispositivo tinha lido por
último — `writeShardedState()` sempre fazia `.set()` cego (substituição
total). Um pull que falhasse silenciosamente ou não trouxesse nada novo
não impedia o push seguinte de escrever do mesmo jeito, sobrescrevendo
qualquer estado mais novo publicado por outro dispositivo nesse meio tempo.

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras + contagem de call sites de
  syncFromFirebase)
- `tests/device-bootstrap.test.js` (mock de `fbDb.runTransaction` +
  `lastKnownCloudRevision`/`CLOUD_REVISION_FIELD`)
- `tests/snapshots-ownership.test.js` (assinatura `tx.set(FB_META_REF()...)`
  em vez de `FB_META_REF().set(...)`)
- `tests/multi-device-sync.test.js` (2 testes novos + wiring de transação)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- Documento principal (`atlas_state/main`) ganhou o campo `revision`
  (inteiro, incrementado a cada escrita bem-sucedida).
- `readShardedState()`: toda leitura bem-sucedida grava a revisão vista em
  `lastKnownCloudRevision` (`null` = nunca lido com sucesso nesta sessão).
- `writeShardedState()`: recusa escrever se `lastKnownCloudRevision===null`;
  senão, escreve dentro de uma TRANSAÇÃO real do Firestore
  (`fbDb.runTransaction`) que relê a revisão atual e só comita (meta +
  todos os chunks, atomicamente) se bater com `lastKnownCloudRevision` —
  a transação em si fecha o TOCTOU.
- `writeShardedStateWithConflictRetry()` (novo, chamado por
  `writeShardedStateSerialized()`): em conflito de revisão, reconcilia
  (`syncFromFirebase()`, com push próprio suprimido via
  `syncFromFirebaseSkipTrailingPush` pra evitar reentrância) e tenta
  escrever UMA vez mais, já com o estado mesclado.

### Segurança

Nenhum cloud-wins/local-wins: merge continua `mergeEntryNonDestructive`/
`unionEntryImages`, intocado. `deviceBootstrapPending`, `fbSyncing`
(barreira de reconciliação da Alteração 069) e proteção de ownership
continuam intactos.

### Testes realizados

- `node --test tests/multi-device-sync.test.js`: 11 PASS, 0 FAIL (2 testes
  novos: cenário exato de conflito de revisão + boots repetidos com
  escritas estáveis);
- `node --test tests/critical-flows.test.js`: 21 PASS, 0 FAIL;
- `node --test tests/device-bootstrap.test.js`: 32 PASS, 0 FAIL;
- `node --test tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- Suíte completa (28 arquivos): **998 PASS**, 0 FAIL novo (as mesmas 3
  falhas pré-existentes/fora de escopo de sempre);
- `git diff --check`: sem erros de espaço em branco;
- Inline `<script>` verificado sintaticamente válido via `vm.Script` após
  cada edição.

### Resultado

Nenhum dispositivo consegue mais publicar baseado numa versão desatualizada
da nuvem sem que o Atlas detecte, reconcilie e tente de novo com o estado
mesclado. Provado com o cenário exato pedido: dois dispositivos na mesma
revisão, um publica primeiro, o outro é recusado cru e depois se autocura
sozinho pelo caminho normal de salvar — terminando com a união completa
dos dois lados, tanto localmente quanto na nuvem.

### Pendências

Não implementado: pular o push quando o merge não trouxe/levou nada de
novo (otimização de rede, não de segurança — a barreira de revisão já
garante que um push "desnecessário" nunca sobrescreve algo mais novo).
Teste manual com dois computadores reais, usando este código, ainda
precisa ser refeito pelo usuário.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 071 — Separa pull de push no boot + investigação de ownership

**Número da alteração:** 071
**Data:** 23/09/2026

### Objetivo

Terceiro teste manual real mostrou: Edge 118 imagens, Chrome (aberto 28s
depois) reduziu a nuvem pra 108 SEM nenhum conflito de revisão — o boot em
si estava empurrando sem necessidade. Corrigir separando claramente
PULL/RECONCILIAÇÃO de PUSH de alteração do usuário, e investigar (sem
assumir) por que 11 imagens reais da nuvem não chegavam ao Chrome.

### Causa real

`loadData()` tinha dois pontos de push incondicional (interno de
`syncFromFirebase()` e final de `loadData()`) que nunca verificavam se o
local realmente tinha algo exclusivo pra contribuir — só "mesclou, então
publica". A barreira de revisão (070) impedia overwrite indevido, mas não
impedia esse push desnecessário (que, sem conflito real acontecendo,
sempre "ganhava" e virava o novo estado da nuvem).

### Arquivos modificados

- `index.html`
- `tests/critical-flows.test.js` (âncoras)
- `tests/multi-device-sync.test.js` (3 testes novos + correção de um bug
  no próprio motor de teste — faltavam 2 funções no `vm`)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### O que foi alterado

- `syncFromFirebase()`: só publica se `localHasExclusiveContent` for
  verdadeiro (lesão só local, imagem só local via
  `buildImageIdentityDivergenceReport`, ou REVIEW/SRS/SESSIONLOG com
  progresso mais novo que o remoto).
- `loadData()`: push final do boot também condicional às migrações locais
  terem realmente mudado algo.
- `pushToFirebase()`/`pushToFirebaseNow()`: não marcam mais
  `syncPushPending` quando bloqueadas antes de `appStateReady` (plumbing
  interno de boot, não intenção real).
- Diagnóstico: `getImageOwnershipConflicts()` (já existia) agora aparece
  na seção de sincronização.

### Segurança

Ownership NÃO foi relaxado — só tornado visível. `saveData()` continua
publicando incondicionalmente (é uma edição real do usuário). Todas as
proteções anteriores (revisão, fbSyncing, bootstrap, ownership) intactas.

### Testes realizados

- `node --test tests/multi-device-sync.test.js`: 14 PASS, 0 FAIL (3 novos:
  boot sem edição = zero escritas; boot com 1 exclusivo = uma escrita;
  ownership × pull);
- `node --test tests/critical-flows.test.js`: 21 PASS, 0 FAIL;
- Suíte completa (28 arquivos): **1001 PASS**, 0 FAIL novo (as mesmas 3
  falhas pré-existentes);
- `git diff --check`: sem erros; sintaxe validada via `vm.Script`.

### Resultado

Abrir o Atlas sem editar nada nunca mais publica o estado local por cima
da nuvem. Provado o mecanismo real de ownership bloqueando pull de imagens
com etiqueta divergente (não corrigido — investigação, não fix; ownership
nunca é relaxado automaticamente).

### Pendências

Sem acesso aos dados reais, não confirmado se ownership é a causa exata
das 11 imagens do caso relatado — só que é um mecanismo real reproduzível.
Diagnóstico agora mostra isso; se confirmado, correção é sempre manual.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 072 — syncDirty persistente + zero escritas no boot + normalização segura de etiqueta legada

**Número da alteração:** 072
**Data:** 23/09/2026

### Objetivo

Fechar a última brecha do boot: mesmo com o pull separado do push (071),
rotinas internas do próprio boot (migrações, deduplicação, reconciliação)
chamavam `saveData()`/`saveReview()`/`saveSRS()` normais e publicavam a
nuvem sem que o usuário tivesse editado nada. E normalizar com segurança
6 etiquetas antigas de dono de imagem (`seed_8→seed_7`, `seed_11→seed_10`,
`seed_21→seed_18`, `seed_413→seed_404`, `seed_414→seed_405`,
`seed_477→seed_464`), sem relaxar nenhuma proteção.

### O que foi alterado (linguagem simples)

- O aplicativo ganhou uma "bandeira de pendência" (`syncDirty`, guardada
  no próprio navegador): ela só é levantada quando o usuário edita algo
  de verdade, e só é abaixada quando a nuvem confirma que recebeu.
- Abrir o aplicativo, migrar dados antigos ou reconciliar com a nuvem
  NUNCA levanta essa bandeira — e sem a bandeira levantada, nada é
  publicado. Abrir sem editar = zero escritas na nuvem.
- As funções internas de salvamento ganharam um modo "só local"
  (`internal=true`): guardam no navegador sem levantar a bandeira e sem
  publicar. Todo caminho de boot/migração usa esse modo.
- Normalização das 6 etiquetas antigas: função de console/manutenção
  (`normalizeLegacyImageOwnerLabel`), NUNCA chamada sozinha pelo
  aplicativo. Ela só reescreve o campo `lesionId` quando prova, ao mesmo
  tempo, que (1) a imagem está no array da lesão certa, (2) tem
  `assetId`/`publicId`, (3) é única no catálogo, (4) o dono divergente é
  um `seed_N` histórico. Conflito de verdade (mesma imagem em duas
  lesões atuais) continua bloqueado. Cada caso é registrado.

### Arquivos modificados

- `index.html` (bandeira syncDirty, modo interno, normalização no fim do
  script — não desloca âncoras)
- `tests/multi-device-sync.test.js` (23 testes: sync A–C + normalização
  D + conflito E + auditoria de diff F)
- `tests/critical-flows.test.js` (âncoras remedidas: 6580/6590/9137/12718)
- `tests/local-scope-prefs.test.js` e `tests/lesion-review.test.js`
  (marcador de extração atualizado para a nova assinatura
  `saveData(internal)` — só teste, nenhum código do app)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Segurança

Nada automático publica, normaliza, move ou funde imagem. A proteção de
dono (`canChangeImageOwnership`) continua exigindo ação manual explícita.
Antes de qualquer operação de risco, snapshot local via
`createSafetySnapshot()`; restauração sempre manual.

### Testes realizados

- `tests/multi-device-sync.test.js`: 23 PASS, 0 FAIL;
- `tests/device-bootstrap.test.js`: 32 PASS, 0 FAIL;
- `tests/snapshots-ownership.test.js`: 47 PASS, 0 FAIL;
- `tests/critical-flows.test.js`: 21 PASS, 0 FAIL;
- `tests/image-productivity.test.js`: 20 PASS, 0 FAIL;
- `tests/local-scope-prefs.test.js` + `tests/lesion-review.test.js`:
  158 PASS, 0 FAIL (após atualizar o marcador de extração);
- Suíte completa (28 arquivos): **1015 PASS**, 3 FAIL — as mesmas 3
  falhas pré-existentes já documentadas na 071 (pares do
  `DUPLICATE_PAIRS_V171` com IDs removidos pela reconciliação V2 + 2
  testes de "hoje" do histórico sensíveis a data; todas reproduzidas no
  código publicado, sem relação com esta alteração);
- `git diff --check`: sem erros; sintaxe do script validada via
  `vm.Script`; nenhuma função duplicada.

### Resultado

Abrir o Atlas em qualquer dispositivo sem editar nada não escreve nada
na nuvem (nem publica, nem marca pendência). Edição real continua
publicando normalmente, inclusive com a máquina offline (a pendência
aguarda a reconexão). As 6 etiquetas legadas têm caminho de correção
manual seguro, registrado e auditável.

### Pendências

As 3 falhas pré-existentes seguem aguardando decisão do usuário (com
backup fresco): `DUPLICATE_PAIRS_V171` precisa de revisão dos pares
órfãos; os 2 testes de "hoje" usam data fixa de 22/09.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 072b — Normalização de etiqueta legada DENTRO do pull (2026-09-23)

**Número da alteração:** 072b
**Data:** 23/09/2026

### Objetivo

A 072 deixou a normalização pronta mas sem chamar em nenhum fluxo
automático — um PC desatualizado continuaria bloqueando para sempre as
imagens legítimas com etiqueta histórica. Integrar a normalização SOMENTE
ao merge/pull remoto, com as mesmas condições de segurança já testadas.

### O que foi alterado (linguagem simples)

- Quando o pull encontra uma imagem da nuvem com etiqueta antiga
  (`seed_N`) dentro da lesão certa, ele agora verifica: a etiqueta é
  histórica? A imagem tem identificação forte? Ela é única no acervo
  (não existe em outra lesão atual)? Se tudo for sim, corrige SÓ a
  etiqueta e traz a imagem normalmente, registrando o evento. Se a mesma
  imagem existir em outra lesão (conflito de verdade), continua
  bloqueando como antes.
- A decisão é estrutural — não existe lista de pares no código. Os 6
  pares reais e um par inventado passam pelo mesmo caminho.
- O caminho inverso (publicar para a nuvem), a importação de backup e a
  recuperação de dados antigos NÃO mudaram: continuam bloqueando como
  antes. A proteção de dono continua exigindo ação manual.

### Arquivos modificados

- `index.html` (helper compartilhado + ramo no pull + catálogo repassado
  só pelo `syncFromFirebase`)
- `tests/multi-device-sync.test.js` (4 testes novos de integração com o
  merge real; 2 testes antigos atualizados para dono não-histórico,
  mantendo a prova do bloqueio)
- `tests/critical-flows.test.js` (âncoras remedidas: 6674/6684/9231/12812)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Testes realizados

- `tests/multi-device-sync.test.js`: 27 PASS, 0 FAIL;
- `tests/critical-flows.test.js`: 21 PASS, 0 FAIL;
- `tests/snapshots-ownership.test.js` + `tests/device-bootstrap.test.js`:
  79 PASS, 0 FAIL;
- Suíte completa (28 arquivos): **1019 PASS**, 3 FAIL — as mesmas 3
  pré-existentes, sem relação com esta alteração;
- `git diff --check`: sem erros; sintaxe validada via `vm.Script`.

### Resultado

Abrir o Chrome desatualizado agora traz as imagens com etiqueta antiga
(normalizando só a etiqueta, com registro) e continua sem escrever nada
na nuvem quando não há edição do usuário.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 072c — Falso positivo: holders por stable key única (2026-09-23)

**Número da alteração:** 072c
**Data:** 23/09/2026

### Objetivo

Caso real: Chrome 118/120 com 2 imagens só na nuvem (Abscesso/seed_10,
etiqueta seed_11) bloqueadas como "conflito" embora o MESMO asset não
exista em nenhuma outra lesão. Investigar a condição exata e corrigir sem
relaxar a segurança.

### Causa real

O helper considerava QUALQUER chave parcial compartilhada (mesmo
publicId de um re-upload = asset DIFERENTE em outra lesão) como conflito
real. Dedução pelos fatos: assets com assetId conhecido + classificados
como só-nuvem por identidade estável + evento de bloqueio no pull =
obrigatoriamente a condição "outro holder", que só podia vir de overlap
parcial — nunca do label (o código jamais usa `img.lesionId` como holder)
e nunca do mesmo asset (senão não seriam "só-nuvem").

### O que foi alterado (linguagem simples)

- A verificação de "existe em outra lesão?" agora usa a identidade única
  de cada imagem (a mesma que o auditor e o diagnóstico usam), em vez de
  qualquer pedaço solto da identidade. Asset diferente com mesmo nome de
  arquivo em outra lesão não trava mais; o MESMO asset em duas lesões
  continua travando.
- O evento de bloqueio agora informa exatamente quais lesões detêm o
  asset (`conflictingHolders`), para o próximo diagnóstico ser direto.

### Arquivos modificados

- `index.html` (holders por stable key + campo diagnóstico)
- `tests/multi-device-sync.test.js` (2 testes novos reproduzindo o padrão
  exato: re-upload com mesmo publicId normaliza; mesmo asset bloqueia)
- `tests/critical-flows.test.js` (âncoras: 6686/6696/9243/12824)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Testes realizados

- `tests/multi-device-sync.test.js`: 29 PASS, 0 FAIL (o teste do falso
  positivo FALHAVA antes da correção — prova do mecanismo);
- `tests/critical-flows.test.js` + `snapshots-ownership` +
  `device-bootstrap`: 100 PASS, 0 FAIL;
- Suíte completa: **1021 PASS**, 3 FAIL pré-existentes;
- `git diff --check`: sem erros; sintaxe via `vm.Script`.

### Resultado

As 2 imagens do caso real devem normalizar no próximo pull do Chrome
(120/120), com evento registrado. Se algum bloqueio voltar a aparecer, o
evento agora diz exatamente qual lesão detém o asset.

### Commit após aprovação

Criado na publicação 068–072c (commit c11f54d, push origin master:main).

## ALTERAÇÃO 073 — Tombstones de imagem excluída (sincronizar deletes entre PCs)

**Número da alteração:** 073
**Data:** 23/09/2026

### Objetivo

Caso real: Edge excluiu imagens (120→118) e a nuvem convergiu, mas o
Chrome manteve o conteúdo antigo — o merge é aditivo e ausência simples
na nuvem nunca pode virar delete (não dá pra distinguir "excluído de
propósito" de "ainda não chegou"). Criar tombstone explícito de exclusão.

### O que foi alterado (linguagem simples)

- Ao remover uma imagem e confirmar (Salvar no editor / Concluído no
  Quiz), o Atlas anota "esta imagem foi excluída de propósito" (só a
  identidade, sem binário) com data e hora.
- Essa anotação viaja junto na sincronização (documento principal,
  protegida pela mesma transação/revisão) e no backup.
- Ao receber, cada computador une as anotações (vale a mais recente),
  não traz de volta a imagem excluída e apaga a cópia local se ainda
  tiver. Um computador antigo nunca reintroduz o que foi excluído.
- Re-adicionar a mesma imagem depois salva localmente, mas o próximo
  pull remove de novo (a anotação vence — sem ressurreição automática
  nesta rodada, documentado).
- O diagnóstico mostra: quantas anotações existem, quantas chegaram
  neste pull e quantas imagens foram removidas por elas.

### Arquivos modificados

- `index.html` (módulo TOMBSTONES + hooks no Salvar/Concluído + merge no
  pull e no envio + carga no boot + backup + diagnóstico)
- `tests/multi-device-sync.test.js` (8 testes novos: 6 cenários
  obrigatórios + unidade + backup)
- `tests/critical-flows.test.js` (âncoras: 6844/6854/9401/13027 +
  tombstones reais no cenário de importação)
- `tests/device-bootstrap.test.js` (stubs de carga)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Segurança

Nada apaga sem tombstone (regra permanente testada). Exclusão de lesão
inteira não existe como ação no app (fora de escopo). Snapshots não
incluem tombstones (restauração manual não perde nem ganha deletes
sozinha). Cloudinary nunca tocado por este fluxo.

### Testes realizados

- `tests/multi-device-sync.test.js`: 37 PASS, 0 FAIL;
- `tests/critical-flows.test.js` + `device-bootstrap` + `snapshots`:
  100 PASS, 0 FAIL; `quiz-images`: 102 PASS, 0 FAIL;
- Suíte completa: **1029 PASS**, 3 FAIL pré-existentes;
- `git diff --check`: sem erros; sintaxe via `vm.Script`.

### Resultado

Deletes explícitos agora convergem entre PCs (Edge→nuvem→Chrome),
inclusive offline/stale e concorrente com adições, sem ressurreição e
sem quebrar zero-write no boot, dirty, revisão ou ownership.

### 2 assets do Abscesso ainda bloqueados no Chrome (investigação, sem mexer)

Evento `image_merge_ownership_conflict_blocked` seed_11→seed_10 para
48266481… e 1f173ab… mesmo após a 072c. Análise objetiva do código:
- o mapa de holders usa SÓ o id da lesão que contém fisicamente a
  imagem (`e.id`) — o campo legado `img.lesionId` nunca entra no mapa;
- com assetId conhecido e classificação "só-nuvem" por identidade
  estável, o único ramo possível no código novo é holder real do MESMO
  asset em outra lesão local;
- o evento novo informa `conflictingHolders`; o relato não o menciona.
Hipóteses em ordem: (1) Chrome com HTML em cache/anterior à publicação
(verificar `view-source` por `conflictingHolders` + Ctrl+F5 + novo pull);
(2) imagem sem assetId/publicId (regra exige identidade forte);
(3) mesmo asset fisicamente em outra lesão local (conflito real → fix
manual no editor). Este fluxo de tombstones não toca esse caminho
(sem tombstones, varredura inerte).

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## Consistência final — os 2 assets do Abscesso cerebral (só investigação + auditoria)

**Data:** 23/09/2026

### Estado real

Chrome 118/118 em contagem, mas 82 registros locais vs 81 na nuvem
(Divergente: SIM) + 2 bloqueios `image_merge_ownership_conflict_blocked`
seed_11→seed_10 (assets 48266481… e 1f173ab…). Tombstones, syncDirty,
transaction e demais ownerships intocados nesta rodada.

### Auditoria determinística (sem inferência)

Fontes congeladas somente-leitura do próprio repo:
- `snapshot-catalogo-completo-readonly.json` (19/09): ambos os assets
  fisicamente em `seed_11` = "Oligodendroglioma" (índices 0 e 1), com
  `imgLesionId` seed_11 e `imgLesionName` "Abscesso cerebral"; `seed_10`
  = "Metástase cerebral" (1 outra imagem). Nenhuma outra cópia em
  nenhuma outra lesão nessa fonte.
- Auditoria de 21/09 (casos CRITICAL): os 2 assets estavam em
  "Abscesso cerebral" em 18/09 e tiveram o nome reescrito para
  "Oligodendroglioma" no backup real de 20/09 — contaminação 059
  comprovada; destino sugerido: a lesão atual "Abscesso cerebral".
- Nuvem hoje: `seed_10` = "Abscesso cerebral" contém os 2 assets
  (etiqueta seed_11 = id posicional da época em que o Abscesso ocupava
  o slot 11 — etiqueta legada legítima).
Conclusão: MESMO asset fisicamente em dois lugares (nuvem seed_10 +
local seed_11) = CONFLITO REAL. O bloqueio está correto; o campo
`img.lesionId` jamais entra no mapa de holders (só `entry.id`), então
não há bug no helper para este caso. As outras 8 normalizaram porque
não tinham segunda cópia — prova de que o caminho funciona.

### Nova função read-only (console do navegador, zero escrita)

`auditImageHoldersByStableKey(['4826…', 'asset:…'])` no fim do script
(sem deslocar âncoras): devolve por asset `{assetId, stableKey,
holders:[{lesionId, lesionName, imgLesionId, publicId, url…}]}`.
Para confirmar no Chrome ao vivo + `getImageOwnershipConflicts()` (o
evento novo traz `conflictingHolders`).

### ALERTA — não excluir as cópias de seed_11 pelo editor ainda

Descoberto ao auditar: o tombstone 073 é global por identidade. Excluir
as cópias erradas de `seed_11` hoje criaria tombstone dos assets — e o
próximo pull apagaria também as cópias BOAS de `seed_10` em todos os
PCs (perda real). NÃO excluir até o tombstone ter escopo por
(key, lesionId). Caminho seguro alternativo (sem código): após o wipe,
re-anexar as imagens ao Abscesso com nova identidade (novo upload/URL
sem o assetId tombstonado) — com perda de metadados; preferível o
follow-up de escopo, que preserva os assets. Ressurreição com o MESMO
assetId não funciona (tombstone vence — testado).

### Arquivos modificados

- `index.html` (só a função de auditoria, fim do script)
- `tests/multi-device-sync.test.js` (fixture exata do estado real com
  assetIds/publicIds/URLs/nomes reais + teste da função de auditoria)
- `LOG_DESENVOLVIMENTO.md`, `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Testes realizados

- `tests/multi-device-sync.test.js`: 39 PASS, 0 FAIL;
- Suíte completa: **1031 PASS**, 3 FAIL pré-existentes;
- `git diff --check`: sem erros; sintaxe via `vm.Script`; âncoras
  inalteradas (6844/6854/9401/13027).

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 073b — Tombstone scoped por lesão (2026-09-23)

**Número da alteração:** 073b
**Data:** 23/09/2026

### Objetivo

O tombstone 073 era global por identidade: apagar X de `seed_11`
apagaria X de `seed_10` no próximo pull — perigoso para o caso real
dos 2 assets do Abscesso (cópia certa em `seed_10`, errada em
`seed_11`). Escopar por lesão para permitir a correção manual segura.

### O que foi alterado (linguagem simples)

- O tombstone agora diz "imagem X removida DA lesão Y" (chave
  `lesionId + stableKey`, separador impossível em ids reais).
- Apagar de uma lesão só afeta aquela lesão em todos os PCs; a mesma
  imagem em outra lesão fica intacta.
- Tombstone antigo sem `lesionId` continua valendo para todas (regra
  histórica, sem inventar dono); mapas antigos são re-indexados
  sozinhos ao carregar/unir.
- Nada mais mudou: mesmos fluxos (Salvar/Concluído, pull, envio, boot,
  backup, diagnóstico), mesma transação/revisão/dirty, ownership e
  normalização intocados.

### Arquivos modificados

- `index.html` (chave de escopo + normalize + matching por lesão nos
  4 pontos de aplicação)
- `tests/multi-device-sync.test.js` (caso exato `seed_10`/`seed_11`
  com os assets reais + 7 adicionais; unidade 073 ajustada às chaves)
- `tests/critical-flows.test.js` (âncoras: 6879/6889/9436/13062 +
  normalize no cenário de importação)
- `tests/device-bootstrap.test.js` (stubs de carga)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Segurança

Sem hardcode de assets/lesões no app. Conflito real continua
bloqueado. Exclusão de lesão inteira segue fora de escopo (não existe
no app). Ressurreição segue sem automática (tombstone vence).

### Testes realizados

- `tests/multi-device-sync.test.js`: 47 PASS, 0 FAIL;
- `critical-flows` + `quiz-images`: 123 PASS, 0 FAIL;
- Suíte completa: **1039 PASS**, 3 FAIL pré-existentes;
- `git diff --check`: sem erros; sintaxe via `vm.Script`; zero
  caractere de controle cru no fonte (separador como escape explícito).

### Resultado

Infraestrutura pronta para a correção manual dos 2 assets: remover as
2 cópias de `seed_11`/Oligodendroglioma no editor gerará tombstones
scoped que limpam `seed_11` em todo PC preservando `seed_10`/Abscesso.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 074 — Pre-push reconciliation (bug real 118→116)

**Número da alteração:** 074
**Data:** 23/09/2026

### Objetivo

Bug comprovado em teste real: Chrome com revisão 15 (válida) salvou o
snapshot local sem 2 imagens cloud-only e a nuvem caiu 118→116.
REVISION MATCH não prova conteúdo completo. Todo SAVE real agora
reconcilia antes de escrever.

### Causa exata

`saveData()` → `pushToFirebaseNow()` escrevia o snapshot local como
estava. A revisão batia (o Chrome conhecia a 15), mas o DATA local
estava semanticamente incompleto (as 2 de `seed_10`, bloqueadas na
época por holders em `seed_11`, nunca tinham sido adotadas). A
transação protege contra "nuvem mudou desde minha leitura" — não
contra "meu estado está incompleto".

### O que foi alterado (linguagem simples)

- Novo fluxo de todo SAVE: persiste local + dirty → relê a nuvem ATUAL
  → mescla conservadora (traz o que só a nuvem tem, mantém suas
  edições, aplica tombstones, normaliza etiqueta legada) → escreve a
  UNIÃO pela transação/revisão de sempre.
- No caso real: ao salvar o delete de `seed_11`, o pre-pull readota
  A+B em `seed_10` (holders sumiram) antes de escrever — a nuvem nunca
  cai; `seed_11` esvazia como pedido.
- Vale para `pushToFirebaseNow` (todo save), Salvar do editor e botão
  "Enviar este dispositivo". O merge de envio e o retry de conflito já
  reliam — inalterados. Exceção única e explícita: "forçar substituir"
  (console, com aviso reforçado).
- Sem internet/leitura: não escreve às cegas (mantém dirty/pending,
  tenta depois). Sem reentrância (mutex liberado antes da escrita).
- Diagnóstico: último pre-push reconcile + cloud-only preservados.

### Residual documentado (sem perda silenciosa de asset)

Conflito de ownership genuíno e não resolvido: o save não aborta; o
asset sobrevive na lesão detentora (que sincroniza normal); a cópia
duplicada do outro lado consolida para fora; o bloqueio segue
registrado no diagnóstico. Alternativas piores: abortar todo save
enquanto houver conflito, ou carregar cópia opaca por cima do guard.

### Arquivos modificados

- `index.html` (núcleo `reconcileStateWithRemote` extraído do pull +
  `reconcileBeforePush` + hooks nos 3 caminhos de escrita + force
  explícito + diagnóstico)
- `tests/multi-device-sync.test.js` (7 testes: cenário exato 118→116,
  mesma-revisão-incompleto, offline, scoped, concorrência, zero-write,
  ownership genuíno)
- `tests/critical-flows.test.js` (âncoras: 6996/7006/9553/13198 +
  marcadores do núcleo compartilhado)
- `tests/snapshots-ownership.test.js` (marcadores do núcleo)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`,
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`

### Testes realizados

- `tests/multi-device-sync.test.js`: 54 PASS, 0 FAIL;
- Suíte completa: **1046 PASS**, 3 FAIL pré-existentes;
- `git diff --check`: sem erros; sintaxe via `vm.Script`.

### Resultado

SAVE = LOCAL EDIT → PRE-PUSH RECONCILIATION → MERGE → TRANSACTION
WRITE. Recuperação dos 2 assets: usar o Edge (não recarregado, com as
cópias) após esta correção publicada — o pre-push do próprio Edge vai
reconciliar antes de qualquer escrita dele.

### Commit após aprovação

Ainda não criado (tarefa pediu sem commit/push).

## ALTERAÇÃO 079c — Fecha o último caminho de imagens stale para a nuvem

**Data:** 24/09/2026

### Problema real

Com 079/079b já publicadas, um Chrome com dados locais antigos levou a
nuvem da revisão 27 (limpa) para a 28 com 62 referências de imagem a
mais (confirmado lendo o servidor). REVIEW/SRS ficaram corretos — o
problema era só de imagens.

### Causa exata

A proteção 079b só barrava imagem "só deste computador" quando a lesão
não tinha data de edição em NENHUM dos lados. Mas lesões com imagem
quase sempre têm essa data, e a limpeza canônica tirou imagens sem mudar
a data (local e nuvem com a MESMA data). Nesses casos a mescla juntava
[A] da nuvem com [A,B,C] locais e nada filtrava — por todos os caminhos
de envio. Além disso, a lista de exclusões da 079b era "gasta" na
primeira escrita: a escrita seguinte saía sem filtro.

### O que mudou (linguagem simples)

- A decisão final sobre imagens agora acontece no único ponto que grava
  na nuvem, dentro da mesma transação que confere a versão: o Atlas lê o
  que a nuvem tem naquele instante e só deixa subir uma imagem que a
  nuvem não tem se a lesão foi editada neste computador DEPOIS da versão
  da nuvem (data de edição local mais nova). Empate não conta.
- Sem essa evidência, a imagem continua só neste computador (nada é
  apagado localmente), mas não vai para a nuvem.
- Exclusões anotadas (tombstones) deste computador e da nuvem são
  somadas e sempre aplicadas ao envio; as da nuvem nunca somem.
- Vale para todo envio: salvar, Quiz/progresso, editor, envio manual,
  "forçar", envio ao abrir e nova tentativa após conflito.
- O filtro "não há nada a publicar" (079) passou a comparar o que
  realmente seria enviado, para não gastar revisão à toa.
- Limite conhecido: se dois computadores editam a MESMA lesão e o que
  salva por último tem data de edição mais antiga, a imagem dele fica só
  local (não se perde) até a próxima edição dessa lesão.

### Arquivos modificados

- `index.html`
- `tests/multi-device-sync.test.js` (43 testes novos: 4 variações de
  data × 9 caminhos de envio, edição legítima, lesão nova, tombstones,
  no-op, residual; fixture do teste "074 CONCORRÊNCIA" com data de B
  estritamente posterior à de A — o empate no mesmo milissegundo era
  artefato do teste)
- `tests/device-bootstrap.test.js` (funções novas no ambiente de teste)
- `tests/critical-flows.test.js` (âncoras +94)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- Reprodução ANTES da correção: 30 dos novos testes falhavam (vazamento
  por todos os 9 caminhos com data de edição; 1 caminho sem data).
- Depois: suíte 1124 testes, 1089 PASS, 30 FAIL, 5 todo — as mesmas 30
  falhas da linha de base 45aae37 (arquivos protegidos ausentes neste
  ambiente, data do sistema, quebra de linha Windows, pares V171).

### Commit

Commit local "Protecao 079c: fecha bypass de imagens stale no write",
sem push.

## ALTERAÇÃO 079d — Imagem nova só sobe com intenção explícita

**Data:** 24/09/2026

### Risco que restava na 079c

A 079c deixava subir uma imagem que só este computador tinha quando a
data de edição da lesão aqui era mais nova que a da nuvem. Mas um
restore canônico pode deixar a nuvem com uma data MAIS ANTIGA que a de
um computador desatualizado — e aí as imagens antigas dele subiam.

### O que mudou (linguagem simples)

- Quando você realmente inclui uma imagem (Salvar no editor, inclusive
  lesão nova; Concluído no Quiz; inclusão direta usada pela correção
  manual de ownership), o Atlas grava uma anotação "inclusão pendente"
  para aquela imagem naquela lesão, guardada no navegador (sobrevive a
  recarregar, fechar a aba e ficar sem internet).
- Na hora de gravar na nuvem, uma imagem que a nuvem não tem só vai se
  tiver essa anotação. A data de edição da lesão não autoriza mais nada
  sozinha (continua valendo só para os outros campos).
- A anotação só é apagada quando a nuvem comprovadamente tem a imagem
  (gravação confirmada ou leitura da nuvem). Erro de rede, falta de
  permissão, conflito ou nova tentativa não apagam.
- Abrir o Atlas, puxar da nuvem, importar backup ou migrar dados nunca
  cria anotação. Imagens importadas de backup ficam só locais (não sobem
  sozinhas) — decisão conservadora.
- Exclusões anotadas continuam vencendo (inclusive no "forçar").
- O limite da 079c (edição concorrente com data mais antiga ficava só
  local) deixou de existir: a inclusão real sobe pela anotação.

### Arquivos modificados

- `index.html`
- `tests/multi-device-sync.test.js` (18 testes novos; simulações de
  "adicionar imagem" dos testes antigos passam a criar a anotação, como a
  ação real faz; 2 testes da 079c reescritos para a regra nova; ajuste de
  empate do teste "074 CONCORRÊNCIA" feito na 079c foi desfeito)
- `tests/quiz-images.test.js` (1 teste novo; funções do marcador no vm)
- `tests/device-bootstrap.test.js`, `tests/critical-flows.test.js`
  (stubs/âncoras)
- `AI.md`, `README.md`, `LOG_DESENVOLVIMENTO.md`

### Testes realizados

- Teste essencial (data local mais nova, sem anotação): falha 9/9 no
  código da 079c, passa 9/9 agora.
- Suíte: 1142 testes, 1107 PASS, 30 FAIL, 5 todo — as mesmas 30 falhas
  pré-existentes/ambientais.

### Commit

Commit local "Protecao 079d: exige intencao explicita para novas
imagens", sem push.
