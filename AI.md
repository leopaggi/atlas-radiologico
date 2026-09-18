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

## Ao adicionar lesões novas ao SEED

- Confira duplicata de `s + site + name` contra o que já existe antes de
  adicionar (não confie só na detecção automática rodar depois — ela
  detecta, mas prevenir é mais barato que corrigir).
- Sem imagem ainda? Deixe `img: ""` e não preencha `images` — a lesão
  aparece automaticamente na tag "🚫 sem imagens".
- IDs seguem o padrão `seed_<N>`, `N` sequencial a partir do maior
  existente.

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
