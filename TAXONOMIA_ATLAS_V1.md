# TAXONOMIA_ATLAS_V1 — Sistema de Atributos Clínico-Radiológicos

**Fase:** TAXO-00 (documento arquitetural) → **TAXO-01 aprovada e congelada** (ver seção 29 para o manifesto formal de congelamento).
**Base:** commit publicado `a7852291d4f480ac4cf87862cfd3c4ca22018095`
**Status:** fonte de verdade desde TAXO-00; o dicionário real (`TAXONOMY.json`) está em `metadata.status = "approved"` com os 194 conceptIds atuais congelados (imutáveis). Qualquer divergência entre este documento e uma fase futura deve ser resolvida atualizando este arquivo, não silenciosamente no código. **Nenhuma integração runtime foi feita** — `TAXONOMY.json` ainda não é lido por `index.html`.

Este documento formaliza decisões já aprovadas pelo usuário (seção 27) e toma posição explícita, fundamentada no código real do Atlas, sobre os pontos que ficaram em aberto na auditoria arquitetural anterior (seção 28).

---

## 1. Objetivo

Criar um sistema de atributos clínico-radiológicos estruturados, com conceitos canônicos e sinônimos, que conviva permanentemente com o sistema de tags livres atual — sem quebrar compatibilidade, sem depender de `SEED`/posição como identidade, e sem exigir preenchimento obrigatório em nenhum fluxo (importação, criação manual ou edição).

## 2. Princípios

1. **Aditivo, nunca substitutivo.** `tags: []` continua para sempre.
2. **Identidade nunca posicional.** Nada neste sistema deriva de índice de array ou de `seed_N` (ver seção 3.1 do `CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md` — o drift de `classification` por `seed_N` já causou dado clínico vazar para a lesão errada).
3. **`conceptId` imutável; `label` mutável.** Renomear um conceito nunca migra lesões. A imutabilidade começa no momento em que o conceito é **explicitamente aprovado/publicado** no `TAXONOMY.json` (ver seção 17) — durante a autoria da TAXO-01, um `conceptId` ainda em rascunho podia ser renomeado livremente, porque nenhuma lesão referenciava um conceito ainda não publicado. **Esse momento já ocorreu** (seção 29): os 194 conceptIds da TAXO-01 estão aprovados e congelados a partir de agora.
4. **O dicionário decide forma; a lesão só guarda conteúdo.** Exclusividade de grupo, rótulo, sinônimos e relações vivem no dicionário, nunca hardcoded no HTML nem duplicados na lesão.
5. **Nenhuma migração silenciosa.** Toda conversão real de dado existente passa por preview + confirmação explícita + snapshot, igual ao padrão já usado na auditoria de tags desta sessão.
6. **Menor alteração correta.** Reaproveitar os três mecanismos de merge que o Atlas já tem testados (`classification` por identidade semântica, `radiologicSigns`/`classificationSchemes` por item com `id`+`updatedAt`, `img.metaUpdatedAt` por subcampo) em vez de inventar um quarto.

## 3. Compatibilidade com as tags atuais

`tags: []` e `attributes` são independentes e coexistem na mesma lesão indefinidamente. Uma lesão pode ter só tags, só atributos, ambos, ou nenhum. Tags livres continuam servindo para epônimos, palavras-chave de estudo, associações raras e qualquer conceito ainda não incorporado à taxonomia. O mapeamento tag→conceito (`TAG_TO_TAXONOMY_MAP.json`, seção 21) é só uma AJUDA de migração — nunca remove a tag original automaticamente.

## 4. Modelo da lesão

Campo novo, opcional, nível superior da lesão (mesmo nível de `tags`/`clinicalCases`/`radiologicSigns`):

```json
{
  "attributesVersion": 1,
  "attributes": {
    "reviewStatus": null,
    "items": [
      {
        "itemId": "attr_9f2k1a",
        "conceptId": "rad_comp_solid",
        "qualifiers": [],
        "updatedAt": 1790840000000,
        "deletedAt": null
      }
    ]
  }
}
```

Ausência total do campo `attributes` (ou `attributes.items` vazio/só com itens `deletedAt`) é o estado "não classificada" — não é tratado como erro nem migrado automaticamente a partir do SEED.

## 5. `attributes.items[]`

Lista plana, independente de domínio (`clinical`/`radiologic`/`etiology`/`demographics` não são sub-objetos separados — são resolvidos via o campo `domain` do **conceito**, no dicionário, não duplicado no item). Isso evita que um item precise "saber" em qual domínio mora (o dicionário já sabe) e simplifica o merge (uma lista só, não quatro).

Cada item:

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `itemId` | string | sim | identidade estável — ver seção 6 |
| `conceptId` | string | sim | chave para o dicionário (`TAXONOMY.json`) |
| `qualifiers` | string[] | não (`[]` default) | conceptIds de qualificadores, mesmo dicionário |
| `updatedAt` | number (ms) | sim | carimbo para merge — ver seção 7 |
| `deletedAt` | number (ms) \| null | sim | tombstone — ver seção 8 |
| `supersededBy` | string (itemId) | não | só quando um conflito foi auto-resolvido — ver seção 9 |
| `supersededReason` | `"exclusive_conflict"` \| `"duplicate_instance"` | não | acompanha `supersededBy`; distingue as duas causas possíveis (seção 9) |

## 6. Identidade dos itens — decisão fundamentada

**Decisão: `itemId` estável, gerado na criação, é a identidade real para merge/tombstone/histórico. `conceptId` NÃO é identidade — é conteúdo.**

Motivo: cenários como dor abdominal migratória (periumbilical → FID) ou dor torácica mudando de qualificador ao longo do tempo tornam **plausível, mas não obrigatório**, que o mesmo conceito precise aparecer mais de uma vez na mesma lesão. Se `conceptId` fosse a identidade de merge, essa possibilidade ficaria estruturalmente fechada para sempre (duas ocorrências colidiriam como "o mesmo item", e o algoritmo não teria como saber se é edição do mesmo fato ou dois fatos distintos). `itemId` mantém a porta aberta sem forçar nada — é a mesma solução que o Atlas já usa para `radiologicSigns[]`/`classificationSchemes[]`/`clinicalCases[]`: identidade estável, independente de conteúdo, gerada uma vez. Custo: um campo string a mais por item, irrelevante no orçamento de chunk (seção 25).

**Ajuste aprovado — `allowMultipleInstances` no GROUP evita duplicata acidental.** Ter `itemId` disponível para múltiplas instâncias não significa que a V1 deva *assumir* que qualquer grupo precisa disso. Cada grupo no dicionário ganha um campo:

```json
"allowMultipleInstances": false
```

**Default `false` para TODO grupo da baseline das seções 12–15** (nenhum grupo da V1 é marcado `true` por enquanto — habilitar é uma decisão futura explícita e revisada, não uma suposição de hoje, exatamente como pedido). Regra:

- **`allowMultipleInstances: false` (padrão):** a lesão pode ter no máximo **um item vivo** (`deletedAt == null`) por `conceptId` naquele grupo. Isso vale mesmo para grupos **não-exclusivos** (ex.: `radiologic.composition` não impede ter `rad_comp_solid` **e** `rad_comp_necrotic` ao mesmo tempo — conceitos diferentes — mas não permite dois itens **ambos** `rad_comp_necrotic`).
- **`allowMultipleInstances: true`:** o grupo permite explicitamente 2+ itens vivos com o mesmo `conceptId` (ex.: se um dia `clinical.symptoms` for marcado assim, dor migratória vira representável com dois itens `clin_symptom_abdominal_pain`, cada um com seus próprios `qualifiers`).

**Onde a regra é aplicada (duas camadas, nunca só uma):**
1. **Na edição (mesmo dispositivo):** a UI do formulário (seção 22) bloqueia adicionar um segundo item vivo do mesmo `conceptId` num grupo com `allowMultipleInstances=false` — validação local, síncrona, sem custo.
2. **No merge (dispositivos diferentes, offline):** dois PCs podem, cada um sem saber do outro, criar um item novo com o mesmo `conceptId` num grupo `allowMultipleInstances=false` antes de sincronizar. A união de itens (seção 7) soma os dois (`itemId`s diferentes, ambos legítimos à primeira vista) — por isso a **passagem de resolução pós-merge** (seção 9) também verifica duplicata por `conceptId` dentro do mesmo grupo quando `allowMultipleInstances=false`, não só exclusividade de grupo. São dois eixos ortogonais, ambos resolvidos pela mesma passagem: "exclusive" decide quantos **conceitos diferentes** podem estar ativos no grupo (1 ou N); "allowMultipleInstances" decide se o **mesmo conceito** pode ter mais de uma instância ativa (ver algoritmo completo na seção 9).

## 7. Merge granular

**Decisão: merge por item (padrão `radiologicSigns`/`classificationSchemes`, Proteção 093), não merge por subcampo (padrão `img.metaUpdatedAt`, Proteção 092).**

Motivo: o padrão por subcampo (092) foi criado porque um objeto de imagem tem poucos campos fixos e MUITO editados concorrentemente (legenda, contexto clínico). `attributes.items[]` é uma coleção que cresce (novos itens, não os mesmos 4 campos reeditados) — o padrão por item (093), mais simples e já validado com `clinicalCases`/`radiologicSigns`, é suficiente e mais barato.

Algoritmo (`mergeAttributeItems(localItems, remoteItems)`, pura, mesmo contrato de `mergeDidacticItems`):

```
1. Indexar local e remoto por itemId.
2. Para cada itemId presente em só um lado: entra direto no resultado.
3. Para itemId presente nos dois lados:
   - updatedAt maior vence o ITEM INTEIRO (conceptId + qualifiers + deletedAt).
   - Empate de updatedAt → serialização canônica maior vence (determinístico,
     mesmo truque de mergeDidacticItems — garante que N PCs convirjam na
     mesma ordem, em qualquer ordem de sincronização).
4. Resultado = união completa, INCLUINDO itens com deletedAt setado
   (tombstone — nunca removidos da lista, só marcados).
5. Rodar a passagem de resolução de grupo exclusivo (seção 9) sobre o
   resultado da união.
```

Propriedades (idênticas às já comprovadas para `mergeDidacticItems`): `merge(A,B) == merge(B,A)`, idempotente, convergente em qualquer ordem entre 2+ dispositivos.

**Onde entra:** dentro de `mergeEntryNonDestructive` (`index.html:4361`), ao lado do bloco que já trata `radiologicSigns`/`classificationSchemes` (`for (const f of ['radiologicSigns','classificationSchemes'])`) — `attributes.items` ganha a mesma chamada, não um bloco paralelo novo.

## 8. Tombstones

Exclusão de um item = `deletedAt = Date.now()`, nunca remoção física da lista (mesma regra de `radiologicSigns`/`clinicalCases`). Um PC desatualizado que ainda tem o item "vivo" localmente, ao sincronizar, recebe o tombstone e o item some — nunca ressuscita. Reclassificar o mesmo conceito depois de excluído gera um **novo** `itemId` (não reaproveita o antigo), consistente com "reimportar um caso excluído revive o mesmo id" ser uma regra específica de `clinicalCases` (que tem `legacyKey`/URL como chave natural de reconciliação) — `attributes` não tem esse conceito de origem externa, então não precisa dessa exceção.

## 9. Grupos exclusivos vs múltiplos

Exclusividade é metadado do **grupo**, no dicionário (`exclusive: true/false`), nunca hardcoded na lesão ou no HTML. A UI consulta o grupo para decidir radio/select (exclusivo) vs checkbox/multiselect (múltiplo).

**Reforço explícito da semântica:** `exclusive: true` significa que, naquele grupo, **só um CONCEITO pode estar ativo por vez** na lesão (não é sobre quantas instâncias — isso é `allowMultipleInstances`, seção 6 — é sobre quantos valores distintos coexistem). Se duas máquinas criarem conceitos diferentes nesse grupo concorrentemente (ex.: `clin_onset_sudden` num PC, `clin_onset_gradual` noutro), o merge:

- **deve** ser determinístico (os dois PCs convergem para o mesmo resultado, em qualquer ordem de sync);
- **não pode** deixar dois conceitos ativos ao mesmo tempo;
- **não pode** perder histórico — o perdedor vira tombstone (`deletedAt`), nunca é apagado da lista;
- **deve** sinalizar o conflito para revisão humana;
- e — ponto central — **o timestamp mais recente resolve o estado TÉCNICO para a sincronização convergir, nunca a verdade CLÍNICA.** "Gradual" ter vencido por ser o `updatedAt` mais novo não significa que "gradual" está clinicamente certo; só significa que o sistema precisava de UM estado ativo determinístico enquanto um humano não revisa.

**Conflito multi-PC — algoritmo e visibilidade (ajustado: sem estado paralelo que pode ficar stale).**

Cenário: PC A grava `clin_onset_sudden` (item X), PC B grava `clin_onset_gradual` (item Y), grupo `clinical.onset` é `exclusive`. Como os dois itens têm `itemId` diferentes, a união simples do passo 4 (seção 7) mantém **os dois vivos** — violando a exclusividade. A mesma passagem também cobre o caso de `allowMultipleInstances=false` (seção 6): dois itens vivos com o **mesmo** `conceptId` no mesmo grupo, mesmo sem o grupo ser `exclusive`.

**Passagem única de resolução**, executada depois da união de itens (seção 7), antes de persistir, para cada grupo da lesão:

```
1. Agrupar itens vivos (deletedAt == null) por grupo (via conceptId → dicionário).
2. Se group.exclusive:
     manter só o item de updatedAt mais recente ENTRE TODOS os conceitos do grupo;
     os demais → deletedAt = now(), supersededBy = <itemId vencedor>, supersededReason = "exclusive_conflict".
3. Senão, se !group.allowMultipleInstances:
     dentro de cada conceptId repetido no grupo, manter só o de updatedAt mais recente;
     os demais → deletedAt = now(), supersededBy = <itemId vencedor>, supersededReason = "duplicate_instance".
4. Empate de updatedAt em qualquer dos dois casos → serialização canônica maior vence
   (mesmo critério determinístico da seção 7).
```

`supersededBy`/`supersededReason` tornam o tombstone **permanentemente rastreável** — não é um estado que expira ou fica stale, é um fato histórico gravado no próprio item, igual a qualquer outro tombstone do Atlas.

**Visibilidade — reaproveitando a Central de Revisões existente, sem mecanismo paralelo.** Em vez de um campo transitório tipo `conflictFlag` (que precisaria de alguém limpar e poderia ficar desatualizado), a passagem de resolução, ao criar um tombstone por `"exclusive_conflict"` ou `"duplicate_instance"`, chama a função **já existente** `createLesionReview(lesionId, textoDoConflito)` (Proteção 091, `scope:'lesion'`) — por exemplo: *"Conflito de classificação resolvido automaticamente em `clinical.onset`: 'gradual' venceu sobre 'súbito' por timestamp mais recente. Revisar qual valor é clinicamente correto."* Consequências, todas de graça, sem UI nova:
- A pendência entra na fila `LESION_REVISIONS` já sincronizada (Proteção 084) e já visível em `🔔 Revisões pendentes`.
- O `⚠` já exibido ao lado do nome da lesão com revisão ativa (Proteção 086, `hasActiveLesionReview`) passa a aparecer **automaticamente** para lesões com conflito de atributo, sem nenhum código de UI novo.
- `attributes.reviewStatus` é promovido automaticamente para `"review"` no mesmo momento (mesmo se estivesse `"classified"` antes — um conflito real invalida uma confirmação anterior), fechando o loop com a seção 20 sem precisar de um segundo estado independente: o estado "preciso de revisão" vive ao mesmo tempo (a) na fila de revisões (fonte operacional, já com todo o ciclo de vida de aceitar/rejeitar/concluir) e (b) em `reviewStatus`, que é só um resumo de leitura rápida, nunca a fonte de verdade do conflito em si (a fonte de verdade é o próprio tombstone `supersededBy` + a entrada em `LESION_REVISIONS`).

## 10. Sintomas e qualificadores

Qualificador é conteúdo do item do sintoma, não um item próprio:

```json
{ "itemId": "attr_a1", "conceptId": "clin_symptom_chest_pain", "qualifiers": ["clin_chest_pain_pleuritic"], "updatedAt": 1790840000000, "deletedAt": null }
```

V1 não carimba qualificador individualmente — editar `qualifiers` atualiza o `updatedAt` do item inteiro (mesma simplicidade do resto desta V1; se no futuro qualificadores precisarem de histórico próprio, vira uma Fase TAXO posterior, documentada como extensão aditiva, não uma mudança de schema).

## 11. Localização de sintomas

Localização é **qualificador do sintoma**, nunca um atributo solto da lesão (ex.: "FID" sozinho na lesão não tem significado sem saber a que sintoma se refere). Baseline abdominal (FID, FIE, hipogástrio, mesogástrio, flanco direito/esquerdo, hipocôndrio direito/esquerdo, epigástrio, difusa) entra no dicionário como conceitos `clin_loc_*`, usáveis como qualifiers de qualquer sintoma de localização abdominal.

## 12. Taxonomia clínica (baseline aberta — grupos e exclusividade)

| Grupo | `exclusive` | Valores baseline |
|---|---|---|
| `clinical.distribution` | não | localizada, difusa |
| `clinical.laterality` | sim | unilateral, bilateral |
| `clinical.symmetry` | sim | simétrica, assimétrica |
| `clinical.longitudinalDistribution` | não | proximal, distal |
| `clinical.onset` | sim | súbito, gradual |
| `clinical.timeCourse` | sim | agudo, subagudo, crônico |
| `clinical.course` | sim | contínuo, recorrente, episódico |
| `clinical.episodeDuration` | sim | segundos, minutos, horas, dias |
| `clinical.intensity` | sim | leve, moderada, intensa |
| `clinical.evolution` | sim | progressiva, estável, regressiva |

Lista de sintomas (baseline, não fechada): a lista completa enviada pelo usuário entra como conceitos `clin_symptom_*` sem agrupamento visual obrigatório por sistema (Geral/Cardiovascular/Respiratório/...) — esse agrupamento, se existir, é **metadado interno** do dicionário (campo opcional `subgroups` no concept, array — um conceito pode pertencer a mais de um subgrupo organizacional —, só para organização, nunca exigido pela busca, que é sempre global).

## 13. Taxonomia radiológica (baseline — grupos e exclusividade)

| Grupo | `exclusive` | Observação |
|---|---|---|
| `radiologic.composition` | não | sólido, cístico, sólido-cístico, gorduroso, hemorrágico, necrótico, multisseptado, fibroso, mineralizado/calcificado |
| `radiologic.enhancementMorphology` | não | ausência de realce, homogêneo, heterogêneo, anelar, nodular periférico, targetoid |
| `radiologic.enhancementVascularity` | não | hipervascular, hipovascular, hiper-realce, hipo-realce |
| `radiologic.enhancementKinetics` | não | washout, preenchimento centrípeto, persistente, progressivo |
| `radiologic.margins` | não | circunscritas, mal definidas, espiculadas, lobuladas |
| `radiologic.growthPattern` | não | infiltrativo, expansivo, exofítico, séssil, excêntrico |
| `radiologic.extent` | sim | focal, multifocal, difuso |
| `radiologic.laterality` | sim | unilateral, bilateral |
| `radiologic.symmetry` | sim | simétrico, assimétrico |
| `radiologic.regionalPattern` | sim | segmentar, lobar, multilobar |
| `radiologic.position` | não | central, periférico |
| `radiologic.longitudinalDistribution` | não | proximal, distal |
| `radiologic.boneDensity` | sim | lítico, esclerótico, misto |
| `radiologic.boneMatrix` | não | condroide, osteóide, fibrosa |
| `radiologic.periostealReaction` | não | sólida, lamelada, casca de cebola, espiculada, triângulo de Codman |
| `radiologic.aggressiveness` | sim | não agressiva, indeterminada, agressiva |
| `radiologic.associatedFindings` | não | calcificações, cicatriz central, cápsula, septos internos, septos espessos, níveis líquido-líquido, edema, atelectasia, estenose segmentar, desvio da linha média, enfisema de partes moles, aprisionamento aéreo, efeito de massa, hemorragia, necrose |

**Nota explícita (conforme pedido):** `bilateral`, `multifocal`, `assimetria`, `crescimento rápido` e `idade pediátrica` **não** entram em `associatedFindings` — já têm grupo semântico próprio (`radiologic.laterality`, `radiologic.extent`, `radiologic.symmetry`, um futuro `radiologic.growthRate` se necessário, e `demographics.ageGroup`, respectivamente). `associatedFindings` é reservado para achados que não cabem em nenhum eixo estrutural acima.

**Ajuste pré-congelamento (correção estrutural):** o antigo grupo único `radiologic.distribution` (`exclusive: false`) misturava vários eixos ortogonais (extensão, lateralidade, simetria, padrão regional, posição, distribuição longitudinal) sem impedir combinações logicamente contraditórias dentro do mesmo eixo (ex.: `unilateral` + `bilateral` simultâneos na mesma lesão). Foi dividido nos 6 grupos acima, cada um com a exclusividade correta para o seu próprio eixo. Como nenhum `conceptId` desse grupo havia sido publicado/congelado ainda (fase `draft`), os antigos `rad_dist_*` foram renomeados para refletir o eixo correto (`rad_extent_*`, `rad_lat_*`, `rad_sym_*`, `rad_regional_*`, `rad_position_*`, `rad_long_*`) em vez de manter nomes que não espelhavam mais o grupo.

## 14. Etiologia

Grupo `etiology.cause`, **não exclusivo** (uma lesão pode ter mais de um componente etiológico, ex. "traumático" + "hemorrágico"): traumático, infeccioso, inflamatório, neoplásico, vascular, congênito, degenerativo, metabólico, iatrogênico, autoimune, isquêmico, hemorrágico.

## 15. Demografia

```
demographics.ageGroup (exclusive=true): neonatal, pediátrica, adulto jovem, adulto, idoso
demographics.sexPredominance (exclusive=true): masculino, feminino, sem predomínio
```

**Documentado explicitamente:** isso representa associação/prevalência epidemiológica do CONCEITO (ex.: "este tipo de lesão predomina em...") — não é uma regra absoluta nem um dado do paciente individual daquele caso. Não confundir com idade/sexo reais de um `clinicalCase` importado (campo diferente, já existente, sem relação com a taxonomia).

## 16. Schema de `TAXONOMY.json` (não criado nesta fase — especificação apenas)

```json
{
  "metadata": {
    "schemaVersion": 1,
    "taxonomyVersion": 1
  },
  "groups": [
    {
      "id": "radiologic.enhancementMorphology",
      "label": "Padrão de realce",
      "domain": "radiologic",
      "exclusive": false,
      "allowMultipleInstances": false,
      "applicableSections": ["*"],
      "sortOrder": 10
    }
  ],
  "concepts": [
    {
      "id": "rad_enh_ring",
      "label": "realce anelar",
      "domain": "radiologic",
      "group": "radiologic.enhancementMorphology",
      "subgroups": null,
      "status": "active",
      "description": null,
      "synonyms": ["realce em anel"],
      "relations": { "relatedTo": [], "oftenAssociatedWith": [], "differentialOf": [] }
    },
    {
      "id": "clin_symptom_vertigo",
      "label": "vertigem",
      "domain": "clinical",
      "group": "clinical.symptoms",
      "subgroups": ["otoneurologic"],
      "status": "active",
      "description": null,
      "synonyms": [],
      "relations": { "relatedTo": [], "oftenAssociatedWith": [], "differentialOf": [] }
    },
    {
      "id": "clin_chest_pain_pleuritic",
      "label": "pleurítica",
      "domain": "clinical",
      "group": "clinical.chestPainQualifiers",
      "subgroups": ["chestPainCharacter"],
      "parentId": "clin_symptom_chest_pain",
      "status": "active",
      "description": null,
      "synonyms": [],
      "relations": { "relatedTo": [], "oftenAssociatedWith": [], "differentialOf": [] }
    },
    {
      "id": "clin_loc_diffuse_abdominal",
      "label": "difusa",
      "domain": "clinical",
      "group": "clinical.abdominalPainLocation",
      "subgroups": ["abdominalLocation"],
      "parentId": "clin_symptom_abdominal_pain",
      "status": "active",
      "description": null,
      "synonyms": [],
      "conflictsWith": ["clin_loc_fid", "clin_loc_fie"],
      "relations": { "relatedTo": [], "oftenAssociatedWith": [], "differentialOf": [] }
    }
  ]
}
```

**Incluído nesta revisão (aprovado):** `allowMultipleInstances` no group (default `false` — ver seção 6/9); `subgroups` (array, **não** string única — ajuste TAXO-01: um conceito pode pertencer organizacionalmente a mais de um domínio, ex. "Fraqueza muscular" → `["neurologic","musculoskeletal"]`) — **só metadado organizacional**, **nunca** armazenado na lesão (a lesão guarda só `conceptId`; `subgroups` é resolvido via dicionário, igual a `label`/`group`), nunca pré-requisito de navegação (busca de sintomas continua global por padrão); `parentId` opcional no concept, usado quando "muito óbvio" (ex.: qualificador → sintoma-pai, `clin_chest_pain_pleuritic.parentId = "clin_symptom_chest_pain"`), sem substituir `relations` (que cobre vínculos menos diretos); `description` opcional no concept, usada **somente quando necessária para esclarecer uma distinção semântica real** entre conceitos próximos (ex.: `rad_comp_calcified` vs `rad_assoc_calcifications` — mesma palavra-raiz, sentidos diferentes — composição estrutural vs achado associado) — não obrigatória em todo concept, nunca armazenada na lesão, só no dicionário.

**Incluído nesta revisão (ajuste pré-congelamento):** `conflictsWith` (array opcional de `conceptId`, no concept) — metadado **do dicionário**, nunca armazenado na lesão: lista outros conceitos que não podem ficar ativos simultaneamente no mesmo contexto/grupo (ex.: `clin_loc_diffuse_abdominal` — "dor abdominal difusa" — conflita com cada uma das 9 localizações específicas de quadrante, já que "difusa" é por definição incompatível com uma localização pontual). Sempre **simétrico** no dicionário (se A conflita com B, B também lista A) para permitir validação simples sem busca reversa. Semântica de uso: a UI futura deve bloquear ou alertar ao tentar ativar dois conceitos conflitantes no mesmo item/contexto; o processo de merge futuro resolve apenas o **estado técnico** de sincronização (como já ocorre para grupos exclusivos — seção 9) e, se um conflito chegar a existir entre dois PCs que editaram em paralelo, cria uma revisão via `createLesionReview` na Central de Revisões, pelo mesmo mecanismo já usado para conflitos de grupo exclusivo — sem um flag solto paralelo.

Campos avaliados e **deliberadamente adiados** da V1 (evitar campo desnecessário, por instrução explícita): `searchTerms` separado de `synonyms`, `applicableSections` por conceito (fica só no grupo, nível mais grosso — suficiente para o caso de uso atual, mesmo grão de `CLASSIFICATION_CONTEXT_RULES`). Ambos podem ser adicionados depois sem quebrar nada, por serem opcionais.

## 17. Convenção de IDs

**Grupo:** `{domain}.{camelCaseGroupName}` — ex. `radiologic.enhancementMorphology`, `clinical.onset`.

**Conceito:** `{prefixoDomínio}_{abreviaçãoDoGrupo}_{slug}`, minúsculas, `snake_case`, ASCII puro (sem acento — mesma convenção já usada por `tagAuditNormalizeForMatch` nesta sessão e por `seed_N`/chaves do projeto em geral). Prefixos de domínio fixos:

| Domínio | Prefixo |
|---|---|
| clinical | `clin_` |
| radiologic | `rad_` |
| etiology | `etio_` |
| demographics | `demo_` |

Exemplos: `rad_enh_ring`, `rad_comp_necrotic`, `rad_growth_infiltrative`, `clin_symptom_fever`, `clin_onset_sudden`, `clin_loc_fid`, `etio_neoplastic`, `demo_age_adult`.

**Nunca:** UUID puro (ilegível em debug, destoa do resto do projeto), `seed_N`, índice de array, ou qualquer coisa derivada de posição.

**`itemId`** (identidade de item dentro da lesão, seção 6): prefixo `attr_` + sufixo aleatório curto, mesmo gerador já usado para `createSafetySnapshot` (`'attr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8)`) — não precisa ser globalmente único entre lesões diferentes, só estável dentro da mesma lesão.

## 18. Sinônimos e deprecated

```json
{ "id": "rad_enh_peripheral", "label": "realce periférico", "status": "deprecated", "aliasOf": "rad_enh_ring" }
```

Resolução de alias é recursiva com proteção contra ciclo (limite de saltos, ex. 5, igual a qualquer resolução de cadeia já feita nesta sessão para detectar `A→B→C` na auditoria de tags — mesma lógica, aplicada aqui para `aliasOf` em vez de decisão de edição).

- **Busca:** indexa por `label` + todos os `synonyms` de TODOS os status (`active` e `deprecated`), sempre resolvendo ao conceito ativo final antes de contar/filtrar.
- **Renderização:** exibe sempre o `label` do conceito ativo resolvido, nunca o deprecated.
- **Nova gravação:** o formulário nunca permite selecionar um conceito `deprecated` diretamente — ao digitar/selecionar um sinônimo que resolve para deprecated, a UI já grava o `conceptId` ativo correspondente.
- **Migração futura:** se um `conceptId` antigo aparecer em `attributes.items[]`, resolve-se via `aliasOf` em tempo de leitura — nunca é necessário reescrever `DATA` só porque um conceito foi depreciado.

## 19. Relações

Schema reservado em cada concept (`relations: { relatedTo: [], oftenAssociatedWith: [], differentialOf: [] }`), **vazio por padrão**. Não preenchido nesta fase. `synonymOf`/`aliasOf`/`parentOf` não entram em `relations` — `aliasOf` é campo de topo do concept (seção 18); `parentOf`/`childOf` ficam para quando houver um caso de uso real (ex. hierarquia de composição), documentados aqui só como extensão compatível, não implementados.

## 20. Estado de classificação — decisão fundamentada

**Decisão:** estado majoritariamente **derivado**, com UM campo explícito mínimo para a única parte que não é derivável (intenção humana de "já revisei o suficiente").

```
função tagAuditLikeDeriveAttributeState(lesion):
  items_vivos = (lesion.attributes?.items || []).filter(i => !i.deletedAt)
  se items_vivos.length === 0: retorna "não classificada"
  se lesion.attributes.reviewStatus === "classified": retorna "classificada"
  retorna "parcialmente classificada"   # default quando há itens mas ninguém confirmou "pronto"
```

`attributes.reviewStatus` (opcional): `null`/ausente = sem decisão humana ainda; `"classified"` = usuário confirmou explicitamente (botão "Confirmar" do painel de migração ou do formulário); `"review"` = usuário escolheu "Revisar depois" explicitamente **OU** foi setado automaticamente pela passagem de resolução de conflito (seção 9) — nos dois casos o significado operacional é o mesmo ("precisa de olhar humano"), só a origem difere, e a origem real de um conflito automático está registrada em `LESION_REVISIONS`, não só no valor do campo. Três únicos valores possíveis: `null`, `"classified"`, `"review"`. Nenhum outro estado (`"não classificada"`, `"parcial"`) é persistido — são sempre calculados na leitura, exatamente como `isAutoSectionOrder`/`knownSitesForSection` já fazem para outros dados do Atlas (nunca duplicar estado que já pode ser inferido de forma barata e correta). **`reviewStatus` nunca é a fonte de verdade de um conflito** (seção 9) — é só um resumo de leitura rápida; a fonte de verdade é o tombstone `supersededBy`/`supersededReason` no próprio item mais a entrada em `LESION_REVISIONS`, nenhum dos dois pode ficar "stale" porque nenhum dos dois é um flag solto — são fatos gravados.

`attributesVersion` (seção 4) é informativo (contra qual versão do dicionário aqueles `conceptId`s foram originalmente gravados) e não participa do cálculo de estado.

## 21. Mapeamento de tags legadas (`TAG_TO_TAXONOMY_MAP.json` — schema, não criado nesta fase)

```json
{
  "bem circunscrita": { "status": "direct", "conceptId": "rad_margin_circumscribed" },
  "bilateral": {
    "status": "ambiguous",
    "candidates": [
      { "conceptId": "rad_lat_bilateral", "context": "radiologic" },
      { "conceptId": "clin_lat_bilateral", "context": "clinical" }
    ]
  },
  "arcada de Frohse": { "status": "keep_free", "note": "achado muito específico — permanece só como tag livre" },
  "hemática": { "status": "review", "note": "possível sinônimo de hemorrágico; ver grupo G3 da auditoria de tags" }
}
```

`status` ∈ `direct` (mapeamento 1:1 seguro) | `ambiguous` (precisa contexto — nunca aplicado automaticamente) | `review` (revisão humana antes de decidir) | `keep_free` (decisão explícita de NUNCA migrar essa tag — fica livre para sempre). Este arquivo é o ponto de entrada da fase TAXO-03 e reaproveita diretamente os 13 grupos semânticos já identificados na auditoria de tags desta sessão (`TAG_AUDIT_GRUPOS_SEMANTICOS.json`) como candidatos iniciais de `ambiguous`/`review`.

## 22. Integração com `openForm` / importação

Nova seção recolhível "Classificação" dentro de `openForm` (`index.html:14487`), logo após a seção de tags (`index.html:14306-14312`), reaproveitando o MESMO componente visual (`chip-input-wrap`/`suggest-row`/`suggest-chip`, toggle `aria-expanded`) já usado ali e já reaproveitado por mim no modal "Editar tag" da auditoria de tags.

- **Modo rápido (padrão, aberto):** mostra só os grupos cujo nome/notas/tags já digitados sugerem relevância (heurística de palavra-chave, mesmo princípio do `tagAuditSimilarity` desta sessão).
- **▸ Classificação avançada (recolhido por padrão):** todos os grupos disponíveis, filtrados por `applicableSections` do grupo batendo com a seção (`s`) da lesão.
- Nunca obrigatório para Salvar — mesma regra de tags hoje.
- Importação Radiopaedia usa o MESMO `openForm` (via `openExternalDraft`, `index.html:20386`) — nenhum código novo específico de importação é necessário; o draft simplesmente nasce com a seção de Classificação vazia/sugerida, igual a qualquer lesão nova.

## 23. Busca diferencial futura (não implementada)

Índice em memória `Map<conceptId, Set<lesionId>>`, construído do mesmo jeito que `tagAuditComputeLiveIndex()` já constrói para tags nesta sessão — interseção de sets por atributo selecionado é O(n) na prática (catálogo de ~1200 lesões). Entrada do usuário (seção, idade, composição, realce, crescimento, achados, sintomas) vira uma lista de `conceptId`s; resultado é a interseção, ordenada por contagem de coincidências — exatamente o exemplo "Glioblastoma — 5/6 atributos coincidentes" do pedido original. Fase TAXO-07.

## 24. Multi-PC

Resumo da seção 9: merge por item (`itemId`+`updatedAt`+tombstone), resolução automática e determinística de conflitos de exclusividade de grupo e de instância duplicada (`allowMultipleInstances=false`), com registro **sempre** visível via `createLesionReview` na Central de Revisões existente — nunca um flag solto que possa envelhecer sem ninguém notar. Limitação conhecida e documentada (mesma classe da já documentada para `img.clinicalContext`, Proteção 088): edição quase simultânea do MESMO `itemId` em dois PCs resolve pelo item inteiro mais novo (não por campo) — aceitável porque a granularidade real do conflito é "este item existe ou não" / "este item tem este conteúdo", não "este subcampo específico mudou", caso mais raro e fora do escopo da V1 (ver seção 7, decisão de não copiar o padrão por subcampo da Proteção 092).

## 25. Backup e segurança

**Fases TAXO-00 a TAXO-03:** somente leitura/preparação (documento, `TAXONOMY.json`, `TAG_TO_TAXONOMY_MAP.json`, painel mestre read-only). **Nenhuma** gravação em `DATA` acontece nelas — não é exigido backup externo extra além da rotina normal já existente do usuário.

**Antes da PRIMEIRA fase que gravar `attributes` em `DATA` real (início da TAXO-04), é OBRIGATÓRIO, nesta ordem:**

1. Backup/exportação completa externa do catálogo canônico atual (botão `💾 Salvar backup` já existente, salvo fora do repositório/IndexedDB).
2. Snapshot interno de segurança via `createSafetySnapshot` com um motivo novo adicionado à allowlist `SAFETY_SNAPSHOT_RISK_REASONS` (mesmo padrão que usei para "antes de aplicar decisões de auditoria de tags" nesta sessão).
3. Validação do backup (reabrir o JSON exportado e confirmar contagem de lesões/imagens bate com o `DATA` atual).
4. Registro explícito no `LOG_DESENVOLVIMENTO.md`/`CONTEXTO_MESTRE`: hash ou nome do arquivo de backup, data/hora, número de lesões.
5. Só então a migração real (preview → confirmação → snapshot → aplicação → validação pós-aplicação → `saveData()` único → relatório) pode prosseguir — mesmo pipeline de segurança já construído e testado para "Aplicar decisões aprovadas" da auditoria de tags.

**Qualquer mudança futura em `mergeEntryNonDestructive`/sync** (ex.: implementar de fato a seção 7/9 no código) exige um checkpoint manual específico — rodar a suíte completa (`node tests/*.test.js`, ~1729 testes hoje) e um teste manual real multi-dispositivo antes do primeiro uso com dados reais, mesmo padrão exigido pelo histórico de Proteções 068–093 documentado no `CONTEXTO_MESTRE`.

## 26. Roadmap TAXO-00 → TAXO-07

| Fase | Conteúdo | Toca `DATA`? |
|---|---|---|
| **TAXO-00** | Este documento | não |
| **TAXO-01** | Criar `TAXONOMY.json` inicial (grupos + conceitos das seções 12–15) | não |
| **TAXO-02** | Painel mestre da taxonomia, somente leitura (navegar grupos/conceitos/sinônimos) | não |
| **TAXO-03** | Criar `TAG_TO_TAXONOMY_MAP.json` (direct/ambiguous/review/keep_free), sem aplicação real | não |
| **— CHECKPOINT DE BACKUP OBRIGATÓRIO (seção 25) —** | | |
| **TAXO-04** | Migrador/classificador de lesões antigas — preview + confirmação + snapshot + `saveData()` único + relatório | sim, com todas as proteções |
| **TAXO-05** | Classificação de novas lesões dentro de `openForm` (seção 22) | sim, fluxo normal de edição |
| **TAXO-06** | Integração completa com o editor normal (lesões já existentes voltam a ser editáveis na mesma tela) | sim, fluxo normal de edição |
| **TAXO-07** | Explorar diferenciais por atributos (seção 23) | não (só leitura) |

Nenhuma reordenação proposta — a sequência aprovada já coloca toda gravação real depois do checkpoint de backup, que é o ponto que mais importa proteger.

## 27. Decisões fechadas (desta fase)

- `attributes` dentro da própria lesão, não coleção separada.
- `conceptId` nunca muda de significado depois de **aprovado/publicado** no `TAXONOMY.json`; só `deprecated → aliasOf` a partir daí. Durante a autoria da TAXO-01 (antes da publicação), `conceptId` ainda em rascunho pode ser ajustado livremente.
- Baseline das seções 12–15 é **ponto de partida ajustável durante a TAXO-01** — não congelada por este documento. O congelamento (imutabilidade) acontece conceito a conceito, no momento em que cada um é publicado no `TAXONOMY.json`, não em bloco antecipadamente.
- `itemId` (não `conceptId`) é a identidade de merge — fundamentado na seção 6 com cenário clínico plausível (dor migratória), mas **sem assumir** que esse cenário exige duas instâncias desde já: controlado por `allowMultipleInstances` no group (default `false` em todos os grupos da V1).
- Merge por item (padrão 093), não por subcampo (padrão 092) — fundamentado na seção 7.
- Resolução de conflito (grupo exclusivo **e** instância duplicada): automática, determinística, nunca trava o sync, nunca apaga histórico (tombstone `supersededBy`/`supersededReason`), e **sempre** visível via `createLesionReview` na Central de Revisões já existente (`LESION_REVISIONS`, Proteção 091) — sem flag solto paralelo que possa ficar stale. Timestamp resolve o estado técnico de sincronização, nunca a verdade clínica — fundamentado na seção 9.
- Estado de classificação majoritariamente derivado + um único campo explícito (`reviewStatus`, 3 valores) para intenção humana, que também pode ser setado automaticamente por um conflito — fundamentado na seção 20.
- `subgroups` (array) opcional no concept (só metadado organizacional, nunca armazenado na lesão), `parentId` opcional (relação óbvia com um concept-pai, ex. qualificador→sintoma) e `allowMultipleInstances` no group (default `false`) entram no schema `TAXONOMY.json` da V1 — seção 16.
- `TAXONOMY.json` estático, publicado com o próprio GitHub Pages, nunca embutido no `index.html`, nunca no Firestore.
- Convenção de IDs com prefixo de domínio + slug (seção 17); nunca UUID, nunca posicional.
- Backup externo + snapshot obrigatórios antes de qualquer gravação real (seção 25) — sem exceção.
- Numeração própria `TAXO-0x`, separada da sequência `Proteção 09x` do `CONTEXTO_MESTRE` — confirmado.
- `radiologic.distribution` (grupo único, `exclusive:false`) dividido em 6 grupos de eixo único (`extent`, `laterality`, `symmetry`, `regionalPattern`, `position`, `longitudinalDistribution`), cada um com a exclusividade correta — decidido na auditoria pré-congelamento, por ser uma correção estrutural e não apenas de nomenclatura (seção 13).
- `clinical.symptomQualifiers` (grupo único, misturava duas famílias de qualifier não relacionadas) dividido em `clinical.chestPainQualifiers` e `clinical.abdominalPainLocation`; o grupo genérico foi removido do dicionário por ter ficado vazio.
- `conflictsWith` (array opcional de `conceptId` no concept, sempre simétrico) entra no schema da V1 para expressar incompatibilidade **dentro** de um grupo não-exclusivo, quando exclusividade de grupo inteiro seria grossa demais (ex.: "difusa" vs. localizações específicas de quadrante, que coexistem entre si mas não com "difusa") — seção 13/16.
- Lombalgia, dorsalgia e cervicalgia **permanecem** `symptoms` independentes na V1 (não normalizados para "dor + localização regional", ao contrário do padrão adotado para dor abdominal) — decisão consciente, registrada aqui como tal e não como inconsistência pendente; pode ser revisitada em fase futura sem quebrar `conceptId`s existentes.

## 28. Questões ainda abertas

Nenhuma decisão arquitetural pendente quanto ao schema em si. A auditoria pré-congelamento (rodada de revisão final do `TAXONOMY.json`, antes da aprovação) encerrou sem nenhum achado `CRÍTICO` ou `REVISAR` pendente — restaram apenas itens `BAIXO RISCO` (polissemia de label entre domains por design, subgroups usados por um único concept), que não bloqueiam o congelamento e não exigem ação; ver seção 29 para o resultado formal da aprovação. Próximo ponto de decisão natural é operacional, não arquitetural: quando TAXO-02 em diante propuser **novos** conceitos (fora dos 194 já congelados), cada `conceptId` proposto precisará da mesma aprovação individual antes de entrar na baseline congelada (seção 29) — o formato dessa aprovação (revisão em lote vs. por conceito) pode ser definido no início da fase correspondente, sem impacto no schema aqui fechado.

## 29. TAXO-01 — Baseline aprovada (congelamento formal)

**Esta seção é o manifesto de congelamento formal da TAXO-01.** A partir da aprovação registrada aqui, os 194 `conceptId`s existentes em `TAXONOMY.json` são **imutáveis**:

- `conceptId` nunca é renomeado.
- `conceptId` nunca é reaproveitado para outro significado.
- `conceptId` nunca é apagado depois de usado/publicado.

Mudanças futuras num conceito já aprovado só podem alterar: `label`, `synonyms`, `description`, `relations`, `subgroups`, `applicableSections`, `status`, `aliasOf`. Se um conceito precisar ser substituído por outro, o padrão é:

```json
{ "id": "conceito_antigo", "status": "deprecated", "aliasOf": "novo_conceptId" }
```

Nunca renomear o `id` antigo para o novo significado.

**Regra para conceitos futuros:** um `conceptId` criado depois desta aprovação só passa a ser considerado congelado/imutável quando ele próprio entrar em uma versão publicada/aprovada do `TAXONOMY.json` — até lá, pode ser livremente ajustado ou descartado durante a autoria da fase que o propôs, pelo mesmo princípio da seção 2/17.

### Manifesto

| Campo | Valor |
|---|---|
| `schemaVersion` | 1 |
| `taxonomyVersion` | 1 |
| `status` | `approved` |
| `groups` | 33 |
| `concepts` | 194 |
| `symptoms` | 59 |
| `qualifiers` | 14 |
| `synonyms` | 2 |
| `conflictsWith` (concepts com o campo) | 10 |
| Testes | 52/52 PASS (`tests/taxonomy-v1-structure.test.js`) |
| Data | 2026-10-01 |

A fonte de verdade da lista completa de `conceptId`s continua sendo `TAXONOMY.json` (e, como mecanismo de proteção, um snapshot da mesma lista em `tests/taxonomy-v1-structure.test.js` — `BASELINE_APPROVED_CONCEPT_IDS`); não duplicada aqui por ser redundante e por este documento não ser a fonte de dados.

**Nenhuma integração runtime foi feita nesta aprovação:** `index.html` não lê `TAXONOMY.json`, nenhum `fetch` foi adicionado, `openForm` não foi alterado, nenhum migrador foi criado, e nenhuma lesão (`DATA`/Firestore/IndexedDB) passou a ter `attributes`. A aprovação é só do dicionário em si — a integração real começa em TAXO-02 em diante (seção 26), com checkpoint de backup obrigatório antes de qualquer gravação real.

## 30. TAXO-03D — TAXONOMY v1.1 (expansão aditiva aprovada)

**Motivação:** a reconciliação do dicionário aprovado (TAXO-01, 194 concepts) com o vocabulário vivo real de tags do catálogo publicado (TAXO-03/03B, 695 tags vivas) revelou gaps estruturais genuínos — eixos semiológicos inteiros ausentes da V1 (intensidade de sinal em RM, ecogenicidade ao ultrassom, velocidade de crescimento, difusão) e alguns achados radiológicos isolados sem concept correspondente, mesmo em tags de uso muito alto. A adjudicação humana desses gaps (TAXO-03C, ver `TAXO03C_GAP_DECISIONS.json`/`TAXO03C_GAP_REVIEW.md`) aprovou 13 concepts novos e 5 groups novos, formalizados aqui como v1.1.

**Decisão semântica dos 2 concepts condicionais** (pré-flight desta rodada):
- **`rad_assoc_focal_dilation` ("dilatação focal") — APROVADO.** Funciona como achado transversal independente de estrutura pelo mesmo padrão arquitetural já aprovado para `rad_assoc_segmental_stenosis` (seu oposto semântico): a identificação de QUAL estrutura está dilatada (ducto, vaso, alça, sistema coletor) vem do contexto da lesão (seção/sítio), nunca do concept em si. Contexto real revisado (ectasia ductal, hidrossalpinge, varicocele, aneurisma de aorta) confirma uso coerente, não excessivamente vago.
- **`rad_assoc_effusion` ("derrame associado") — APROVADO.** Mesmo padrão arquitetural já aprovado para `rad_assoc_edema`: uma efusão líquida genérica é útil como achado associado transversal, com a cavidade específica (pleural/pericárdica/peritoneal/articular) vindo do contexto da lesão. Contexto real revisado (mesotelioma pleural, metástase pleural, empiema, carcinomatose peritoneal) é consistente, sem heterogeneidade semântica excessiva.

**5 groups novos:**

| Group | domain | exclusive | allowMultipleInstances | justificativa do `exclusive` |
|---|---|---|---|---|
| `radiologic.signalIntensityT2` | radiologic | `false` | `false` | uma lesão pode ter componentes espacialmente heterogêneos (parte hipersinal + parte hipossinal na mesma lesão) |
| `radiologic.signalIntensityT1` | radiologic | `false` | `false` | mesma lógica do eixo T2 |
| `radiologic.growthRate` | radiologic | `true` | `false` | velocidade de crescimento entre dois exames é uma avaliação única por lesão — não há "lento E rápido" simultâneos no mesmo intervalo comparado (diferente do sinal, que varia por componente espacial) |
| `radiologic.diffusion` | radiologic | `false` | `false` | desenhado para futura expansão (ex.: "facilitada"/"mista", **não criados nesta rodada** por falta de adjudicação) e a difusão também pode variar por componente espacial da lesão |
| `radiologic.echogenicity` | radiologic | `false` | `false` | lesões heterogêneas podem ter componentes de ecogenicidade distintos (ex.: cisto com debris = porção anecoica + porção hipoecogênica) |

**13 concepts novos** (todos `domain: "radiologic"`, todos com `description` evitando definição circular — sinal/difusão/ecogenicidade são explicitamente distinguidos de composição estrutural em cada description):

`rad_margin_irregular` (radiologic.margins) · `rad_signal_t2_hyper`/`rad_signal_t2_hypo` (radiologic.signalIntensityT2) · `rad_signal_t1_hyper`/`rad_signal_t1_hypo` (radiologic.signalIntensityT1) · `rad_growthrate_slow`/`rad_growthrate_fast` (radiologic.growthRate) · `rad_assoc_thick_wall` · `rad_diffusion_restricted` (synonym: "restrição de difusão") · `rad_assoc_effusion` · `rad_assoc_focal_dilation` · `rad_echo_hypo` (synonym: "hipoecoico") · `rad_echo_anechoic`.

**Deliberadamente NÃO criados nesta rodada** (para não completar famílias automaticamente sem adjudicação humana explícita, por instrução direta): `rad_echo_hyper`/`rad_echo_iso` (hiperecogênico/isoecogênico), `rad_diffusion_facilitated`/`rad_diffusion_mixed` (difusão facilitada/mista).

**`MAP_EXISTING` resolvidos em `TAG_TO_TAXONOMY_MAP.json`** (9 tags, de `unmapped` para `mapped` — nenhuma tag real de lesão foi alterada, só o status de mapeamento): `bem circunscrita`/`bem delimitado` → `rad_margin_circumscribed`; `margens mal definidas` → `rad_margin_illdefined`; `lobulada` → `rad_margin_lobulated`; `idade pediátrica` → `demo_age_pediatric`; `malformação congênita` → `etio_congenital`; `trauma` → `etio_traumatic`; `sólido-cístico` → `rad_comp_complex_cyst`; `matriz condroide` → `rad_bonematrix_chondroid`.

**`METADATA_NOT_TAXONOMY`** (preservadas explicitamente FORA da taxonomia clínico-radiológica, nenhum concept criado): `emergência`, `RM`, `US`, `radiografia`, `dinâmico` — modalidade/técnica de aquisição ou triagem operacional, não fenótipo da lesão.

**Concepts adiados** (categoria `REVIEW_LATER` na TAXO-03C, sem decisão nesta rodada): `aumento de volume`, `heterogêneo`/`homogêneo`, `malignidade`/`benignidade`/`benigna`, `realce`, `espessamento nodular`, `assimetria`. Nenhum deles entrou na v1.1 — continuam como gap vivo em `TAG_TO_TAXONOMY_MAP.json`.

**Regra de congelamento:** os 13 `conceptId`s novos desta seção passam a estar **congelados** a partir desta aprovação, pelo mesmo mecanismo da seção 29 — nunca renomeados/reaproveitados/apagados, só `deprecated`+`aliasOf` se precisarem ser substituídos no futuro. Os 194 `conceptId`s da v1 (TAXO-01) permanecem intactos e congelados.

**Versionamento:** `schemaVersion` permanece `1` (nenhuma mudança estrutural de schema, só conteúdo aditivo); `taxonomyVersion` passa de `1` para **`2`**; novo campo `metadata.releaseLabel = "1.1"` registra o rótulo humano da versão, sem transformar `taxonomyVersion` em string. `status` permanece `approved`.

**TAXONOMY v1.1 ainda NÃO está integrada a `attributes` reais de nenhuma lesão** — nenhuma mutação em `DATA`/Firestore/IndexedDB, nenhum migrador, `openForm` e o importador Radiopaedia permanecem intocados. A integração real (gravação de `attributes` em lesões) é uma fase futura própria, com checkpoint de backup externo obrigatório imediatamente antes da primeira gravação real.

### Manifesto v1.1

| Campo | Valor |
|---|---|
| `schemaVersion` | 1 |
| `taxonomyVersion` | 2 |
| `releaseLabel` | `"1.1"` |
| `status` | `approved` |
| `groups` | 38 (33 da v1 + 5 novos) |
| `concepts` | 207 (194 da v1 + 13 novos) |
| Testes | ver `tests/taxonomy-v1-structure.test.js` |
| Data | 2026-10-01 |
