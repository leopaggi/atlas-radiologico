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
