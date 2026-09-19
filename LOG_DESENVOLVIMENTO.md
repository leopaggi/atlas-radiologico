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
