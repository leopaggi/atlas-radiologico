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
