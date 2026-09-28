# CLAUDE_CHECKPOINT_ATLAS

Checkpoint operacional para retomar a sessão sem reler o projeto inteiro.
Leia isto primeiro; só aprofunde no `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md`
se precisar de detalhe que não está aqui.

CURRENT HEAD: `34338f2a206803aa830e6bfb8b69ac19068b97f9`
CURRENT BRANCH: `master`
ORIGIN/MAIN: `34338f2a206803aa830e6bfb8b69ac19068b97f9` (idêntico ao HEAD — tudo publicado)
WORKTREE: limpo (só os arquivos protegidos untracked de sempre: `FUTUURO QUIZ.png`, `snapshot-catalogo-completo-readonly.json`, `snapshot-dry-run-duplicatas.json`, `atlas-radiologico-checkpoint-restaurado-61-assets.json`, `atlas-radiologico-backup-restaurado-61-assets-importavel.json`, `atlas-radiologico-checkpoint-pos-reconciliacao-v2_2026-09-19_22-23-27.json`, `auditoria-duplicatas-126.json` + alguns novos untracked ainda não classificados: `ATLAS_CANONICO_LIMPO_1216_116_*`, `EDGE_OFFLINE_LIMPO_1216_116_PRE_CONTAMINACAO.json`, `auditoria-imagens-identidade-semantica-2026-09-21.*` — não tocar sem pedido explícito)

## CURRENT TASK

Bug real reportado pelo usuário: a lesão `seed_928` ("Depósito de gadolínio
no SNC", Neurorradiologia > Intra-axial (parênquima)) recebeu um
`altPlacement` anatomicamente absurdo — `Pelve Masculina > Bexiga` — via
sugestão da IA aplicada sem veto anatômico. Já havia ocorrido antes com
"Abdômen Superior" (removido antes desta sessão). Pedido do usuário: corrigir
a CAUSA da regeneração (não só apagar o valor atual) + remover o valor atual
com segurança.

A causa raiz já foi corrigida e publicada (commit `34338f2`). A remoção do
valor ATUAL em `seed_928` ainda não foi confirmada como executada no app
real (este agente não tem acesso ao IndexedDB/Firestore de produção do
usuário — só pode preparar o JSON e instruir o passo manual).

## CURRENT REAL UI STATE

Não verificado nesta sessão (sem acesso a navegador/Firestore reais). O que
se sabe pelo relato do usuário: a revisão `lrev_muknhymv_564ywe` existe na
Central de Revisões, ligada a `seed_928`, com o altPlacement incorreto ainda
presente em `seed_928.altPlacements` no momento do relato original.

## LAST FIXES

- **`2491003`** — "Ponte 1->2 no lote + citacao 'manter o clone X': bug real
  de rejected preso". Corrigiu dois bugs reais no pipeline de plano
  estrutural: (1) `processReviewAiBatchItem` (ramo `manual_action_required`)
  não chamava `bridgeManualActionToStructuralPlan` no fluxo de LOTE (só o
  fluxo individual chamava); (2) `findExplicitCloneMatches` não reconhecia a
  frase "manter o clone X" (a palavra "clone" ficava presa na citação
  capturada). Teste novo `structural-plan-batch-manual-bridge.test.js`.

- **`34338f2`** (HEAD atual) — "Guarda anatomica de altPlacements: bug real
  seed_928 SNC->Pelve Masculina". Root cause: `applyReviewAiSuggestedPlacement`
  (único ponto que escreve `altPlacements` a partir de sugestão da IA) só
  validava se a seção/sítio sugerido EXISTIA em algum lugar do atlas, nunca
  se era anatomicamente compatível com a lesão-fonte. Fix: guarda genérica
  `SECTION_ANATOMIC_SYSTEM` + `anatomicSystemsCompatible()` (12 seções fixas
  do atlas classificadas em sistemas amplos; vascular/fetal transversais;
  allowlist restrita de cruzamentos reais) aplicada em
  `validateReviewAiPlacement`, `applyReviewAiSuggestedPlacement` (escrita
  real) e `reviewPlacementSuggestion` (esconde o botão "Aplicar" antes do
  clique). Import individual/lote (`importReviewAiSolution`/
  `processReviewAiBatchItem`) continua auditado para NUNCA tocar DATA — só
  valida seção/sítio ali; o veto real é só na aplicação. Segunda
  vulnerabilidade da mesma classe corrigida por precaução em
  `structuralApplyMerge`/`dryRunStructuralPlan` (transferência de
  `altPlacements` na fusão de duplicatas, agora filtrada pela mesma guarda).
  Testes novos: `lesion-review.test.js` (+6), `structural-plan-execute.test.js`
  (+1); `critical-flows.test.js` com as 4 âncoras de linha atualizadas
  (+54/+55). Suíte completa: 1655 testes, 1638 PASS, 12 FAIL — idênticos ao
  baseline medido via `git stash` (nenhuma regressão nova). `git diff --check`
  limpo.

## ACTIVE REVIEW/LESION IDS

- **reviewId:** `lrev_muknhymv_564ywe`
- **lesionId:** `seed_928` — "Depósito de gadolínio no SNC"
- **localização principal (correta, preservar):** Neurorradiologia > Intra-axial (parênquima)
- **altPlacement a remover (e SÓ este):** `{"s":"Pelve Masculina","site":"Bexiga"}`
- **plano pronto para colar em "🛠 Ações manuais" → "📥 Importar plano estrutural da IA"** (mecanismo já existente, testado, não modificado nesta sessão):

```json
{"type":"atlas_structural_resolution_batch","version":1,"resolutions":[
  {"reviewId":"lrev_muknhymv_564ywe","resolutionType":"remove_additional_section_placement",
   "lesionId":"seed_928","placement":{"section":"Pelve Masculina","site":"Bexiga"},
   "reasoning":"Localização anatomicamente incompatível com lesão do SNC (Depósito de gadolínio no SNC)."}
]}
```

Requer a revisão em status `manual_action_required` no momento da importação
(se não estiver, reabrir com `reopenManualActionReview` antes). Depois:
prévia → "▶ Executar" → a revisão resolve sozinha (`accepted`), histórico
preservado, sem ficar pendente eternamente.

## KNOWN GOOD BEHAVIOR

- Guarda anatômica bloqueia (`anatomic_conflict`) qualquer NOVA sugestão da
  IA anatomicamente incompatível com a lesão-fonte, tanto no fluxo individual
  quanto em lote — testado, publicado.
- Placements legítimos continuam permitidos: mesmo sistema anatômico (ex.:
  SNC → SNC), pares reais na allowlist (genitourinário ↔ abdominal), e
  seções transversais (Medicina Fetal, Vascular) — ex.: "Holoprosencefalia"
  (Medicina Fetal) também em Neurorradiologia continua funcionando.
- Mecanismo `remove_additional_section_placement` (estrutural, Fase 3) já
  existe, testado e intocado — é o caminho correto e seguro para remover o
  altPlacement atual de `seed_928`.
- Suíte de testes local: 1655 testes · 1638 pass · 12 fail (todos
  históricos, ver lista abaixo) · publicado em `origin/main`.

## KNOWN BROKEN/UNRESOLVED

- A remoção do altPlacement ATUAL (`Pelve Masculina > Bexiga`) em `seed_928`
  ainda não foi confirmada como executada no app real pelo usuário — este
  agente não tem acesso ao Firestore/IndexedDB de produção.
- 12 falhas de teste HISTÓRICAS, pré-existentes, não relacionadas a esta
  task (confirmado via `git stash` comparando baseline): `DUPLICATE_PAIRS_V171`
  (duplicate-detection), 2 testes dependentes de data do sistema
  (`FILTRO Hoje`, `RESUMO todayCount`), testes que assumem LF mas o checkout
  Windows usa CRLF (`091e window.name`, `092 integração`, `085 PIPELINE`,
  `REGRESSAO dropdown do sitio`), e os arquivos inteiros
  `controlled-duplicate-merge.test.js`, `didactic-image-links.test.js`,
  `didactic-pending-images.test.js`, `lesion-didactic-content.test.js`,
  `quiz-clinical-case-context.test.js` (mesmos motivos CRLF/dependência de
  ambiente). Nenhuma delas é nova nem foi introduzida por `34338f2`.

## NEXT STEP

Confirmar com o usuário se ele já executou o plano de remoção acima no app
real; se sim, pedir para relatar o resultado (altPlacement sumiu, revisão
`accepted`, sync/reload não ressuscitou nada) e então encerrar a task. Se
ainda não executou, aguardar — nenhuma ação de código pendente.

## DO NOT

- Não reler o repositório inteiro sem necessidade — este arquivo + o topo do
  `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` bastam para retomar.
- Não refazer a auditoria de causa raiz já concluída (root cause provado por
  código + teste, ver "LAST FIXES" acima).
- Não reabrir como bug o que já foi corrigido em `34338f2` sem evidência
  NOVA de falha.
- Não alterar arquitetura fora desta task (altPlacements/guarda anatômica).
- Não usar force push.

## GIT RULES

- `git add` explícito por arquivo, nunca `git add .`.
- Publicar com `git push origin master:main`.
- Sem force push, sem `--no-verify`.

## DEPLOY

GitHub Pages serve o branch `main` diretamente a partir de `index.html`; não
há workflow do GitHub Actions nem service worker neste repositório — o
deploy é imediato após o push.
