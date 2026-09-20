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

Ainda não criado.
