# Instrucoes permanentes para agentes de IA

Este arquivo define as regras de trabalho para qualquer agente de IA que atue no Atlas Radiologico. Antes de propor ou aplicar mudancas, leia integralmente:

- `AI.md`
- `README.md`
- `LOG_DESENVOLVIMENTO.md`

Consulte tambem o estado atual do repositorio e o codigo relevante. Nao suponha que uma copia antiga, uma sessao anterior ou apenas a documentacao represente o estado atual dos dados.

## Regra de ouro

Preserve o comportamento existente. Antes de reescrever, remover ou simplificar uma logica, verifique se ela existe para corrigir uma regressao anterior. Trechos estranhos, redundantes ou desativados podem registrar decisoes de seguranca contra perda de dados.

Se houver duvida sobre a intencao de um comportamento ou sobre o impacto de uma mudanca, pare e solicite confirmacao ao usuario.

## Arquitetura obrigatoria

- Preserve a arquitetura atual de um unico arquivo HTML para a aplicacao.
- Nao separe CSS, JavaScript, `SEED` ou outros trechos em arquivos diferentes sem solicitacao explicita do usuario.
- Nao introduza build, framework, empacotador, servidor ou dependencia sem autorizacao explicita.
- Nao refatore toda a aplicacao para resolver um problema localizado.
- Prefira a menor alteracao correta, compreensivel e reversivel.
- Preserve compatibilidade com o fluxo atual de publicacao por substituicao do HTML no GitHub Pages.

## Antes de alterar qualquer coisa

1. Leia a documentacao existente antes de assumir como algo deveria funcionar.
2. Verifique o estado atual do Git e identifique mudancas que ja existam no diretorio de trabalho.
3. Leia o trecho completo relacionado ao problema e procure chamadas, migracoes e dependencias associadas.
4. Identifique se a mudanca toca dados, sincronizacao, imagens, progresso de estudo ou conteudo clinico.
5. Confirme que os arquivos, testes e funcionalidades mencionados realmente existem no workspace.
6. Para operacoes de risco ou que possam alterar muitos registros, explique o impacto e solicite confirmacao antes de executar.
7. Antes de qualquer correcao em massa de dados, solicite um backup JSON fresco exportado pelo proprio aplicativo.

## Areas sensiveis

As areas abaixo exigem analise conservadora e autorizacao antes de mudancas amplas:

- `SEED` e IDs `seed_<N>`.
- IndexedDB e a camada `storage.get/set/delete/list`.
- Firestore, fragmentacao em chunks, reconciliacao e sincronizacao.
- Migracoes, auditorias e rotinas executadas no carregamento.
- Deteccao, supressao e fusao de duplicatas.
- Cloudinary, URLs, metadados e associacao de imagens a lesoes.
- Importacao, exportacao, backups, snapshots, reset e recuperacao.
- `REVIEW`, `SRS`, `SESSIONLOG` e metricas do Quiz & Progresso.
- `classification`, `altPlacements`, `s`, `site`, tags, descricoes e demais dados clinicos.

Nessas areas:

- Nao execute operacoes destrutivas automaticamente.
- Nao crie recuperacao automatica que reescreva dados em massa ao abrir a pagina.
- Nao execute correcao em massa sem autorizacao expressa.
- Nao presuma que dados locais antigos correspondam ao estado atual do usuario.
- Nao apague, renumere, substitua ou funda registros silenciosamente.
- Nao altere IDs sem avaliar todas as referencias em imagens, revisao, SRS, sincronizacao e migracoes.
- Nao silencie falhas que possam deixar o estado local e remoto divergentes.

## Dados e armazenamento

- Use a camada IndexedDB existente para o estado local principal.
- Nao reintroduza acesso direto a `localStorage` para novos dados principais.
- Uso legado de `localStorage` deve ser entendido antes de qualquer modificacao; nao o remova apenas por parecer antigo.
- Firestore e tratado pela documentacao como fonte da verdade na nuvem; qualquer mudanca de reconciliacao deve considerar concorrencia, falhas parciais e dados de outros dispositivos.
- Nunca reative nem recrie recovery generico que reponha dados em massa a partir do `SEED` sem acao e confirmacao do usuario.
- Duplicatas devem ser detectadas pela regra `s + site + name`, preservando o historico auditado. Nao resolva novos casos apenas acrescentando IDs a uma lista fixa.
- Ao adicionar uma lesao, verifique previamente duplicidade e siga o padrao de ID documentado.
- Para lesao sem imagem, mantenha `img: ""` e nao invente uma colecao `images`.

## Conteudo clinico e radiologico

- Nunca altere conteudo clinico ou radiologico silenciosamente.
- Nao invente diagnosticos, achados, tags, descricoes, frequencias, classificacoes ou referencias.
- Mudancas clinicas devem ser claramente apresentadas ao usuario e depender de aprovacao explicita.
- O campo `classification` e especifico do orgao e do contexto; nao o trate como classificacao generica de gravidade.
- Confirme a compatibilidade anatomica antes de incluir ou alterar `classification`.
- Se uma lesao nao pertencer claramente a um sistema padronizado, nao force o preenchimento.
- Preserve `s`, `site`, `altPlacements`, imagens, tags, notas, IDs, revisao e SRS quando a tarefa nao exigir explicitamente altera-los.

## Privacidade e imagens

- Nunca insira, publique ou preserve conscientemente dados identificaveis de pacientes.
- Nao inclua nomes, documentos, datas identificadoras, numeros de prontuario ou pixels com identificacao visivel.
- Trate URLs e metadados de imagens como dados sensiveis.
- Antes de alterar upload, exclusao, migracao ou associacao de imagens, avalie referencias no `SEED`, IndexedDB, Firestore e Cloudinary.
- Uma imagem removida diretamente do Cloudinary pode deixar uma referencia quebrada; corrija somente a referencia confirmada e autorizada.
- Nao exclua assets remotos nem faca limpeza em lote sem confirmacao explicita.

## Quiz, progresso e interface

- Preserve a separacao entre acerto objetivo e grau de confianca do SRS.
- Preserve a contabilizacao imediata de questoes respondidas, inclusive em sessoes interrompidas, salvo se a tarefa aprovada tratar especificamente dessa logica.
- Todo o fluxo `Quiz & Progresso` deve continuar usando uma unica overlay obtida por `getStudyOverlay()`.
- Nao crie outra overlay ou modal para views do fluxo de estudo.
- O quiz deve permanecer no host embutido do dashboard quando esse for o fluxo existente.
- Durante uma sessao, atualizacoes ao vivo devem modificar os elementos existentes; nao devem reconstruir o dashboard e destruir o estado visual do quiz.
- Preserve a classe `study-dashboard` no Modo Estudo, pois ela controla a paleta visual aprovada.
- Preserve a grade panoramica responsiva documentada, salvo solicitacao explicita de mudanca visual.

## Escopo e seguranca operacional

- Modifique somente os arquivos necessarios para a tarefa aprovada.
- Nao invente arquivos, testes, APIs, configuracoes ou funcionalidades inexistentes.
- Nao declare um teste como executado se ele nao existe ou nao foi executado.
- Nao instale dependencias, execute migracoes, publique, envie dados, faca commit ou use comandos destrutivos sem solicitacao ou autorizacao apropriada.
- Nao descarte mudancas existentes do usuario ou de outro agente.
- Nao use comandos destrutivos de Git para recuperar arquivos sem verificar `git status` e obter confirmacao.
- Em mudancas de risco, apresente primeiro o impacto, o plano de verificacao e a forma de recuperacao.

## Testes e verificacao

- Teste toda alteracao sempre que for possivel.
- Use primeiro os testes existentes e confirme que os arquivos citados realmente estao presentes.
- A documentacao cita `node tests/duplicate-detection.test.js` como obrigatorio para mudancas em dados ou deduplicacao. Se o arquivo nao estiver disponivel, informe a ausencia; nao invente um resultado.
- Para o fluxo Quiz & Progresso, verifique que nunca exista mais de uma overlay e que sessao, resumo, retorno e sessao personalizada preservem a mesma tela.
- Para dados, verifique duplicatas, IDs, persistencia local, reconciliacao remota e ausencia de alteracoes fora do escopo.
- Se nao for possivel testar, declare claramente o motivo e o risco residual.

## Documentacao e entrega

- Mudancas relevantes no HTML devem manter README e AI sincronizados na mesma entrega, conforme a regra historica do projeto.
- Atualize a documentacao apenas quando a alteracao realmente exigir; nao reescreva o historico sem necessidade.
- Registre futuras alteracoes em `LOG_DESENVOLVIMENTO.md` de forma compreensivel para uma pessoa nao desenvolvedora.
- Ao concluir uma tarefa, informe exatamente quais arquivos foram modificados.
- Resuma o que mudou, quais testes foram realizados, o resultado e qualquer risco ou passo manual restante.
- Nao faca commit sem pedido explicito do usuario.

## Notificacao de conclusao

Ao terminar qualquer tarefa solicitada neste projeto — depois de testes, validacoes e relatorio final — a ULTIMA acao operacional deve ser enviar uma notificacao ntfy para `https://ntfy.sh/acervo-leo-7k29-radiologia`.

Comando padrao no Windows:

```
powershell.exe -NoProfile -Command "Invoke-RestMethod -Method Post -Uri 'https://ntfy.sh/acervo-leo-7k29-radiologia' -Body 'Acervo Radiologico: tarefa concluida. Verifique o terminal para o resultado.'"
```

Regras:

- a notificacao deve ser a ULTIMA acao operacional da tarefa;
- envie somente depois que a tarefa realmente tiver terminado;
- se houver erro ou bloqueio que exija intervencao do usuario, notifique tambem, deixando isso claro na mensagem;
- nao remova nem altere esta regra em tarefas futuras;
- nao inclua segredos ou dados sensiveis na mensagem;
- falha no envio da notificacao NAO deve alterar nem repetir operacoes ja concluidas;
- se o envio falhar, apenas informe a falha no relatorio final.

## Conduta em caso de incerteza

Pare e pergunte antes de continuar quando houver risco de:

- perda ou sobrescrita de dados;
- alteracao em massa;
- mudanca de conteudo clinico;
- exclusao ou reassociacao de imagens;
- divergencia entre IndexedDB e Firestore;
- quebra de compatibilidade de IDs, migracoes, SRS ou backups;
- reintroducao de um comportamento que a documentacao informa ter causado regressao.

Seguranca, preservacao do acervo e rastreabilidade tem prioridade sobre velocidade ou refatoracao estetica.
