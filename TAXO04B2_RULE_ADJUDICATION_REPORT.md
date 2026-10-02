# TAXO-04B2 — Adjudicação final das regras automáticas

Rodada de decisão/documentação, read-only. Nenhuma alteração em `DATA`,
tags reais, `attributes`, `TAG_TO_TAXONOMY_MAP.json` ou `TAXONOMY.json`.
As decisões "approve" aqui registradas em `TAXO04B2_RULE_ADJUDICATION.json`
ficam pendentes de aplicação em uma microetapa futura explícita.

## A. `resolve-solid-composition-v1`

**Decisão: APPROVE.**

Critérios verificados:

| Critério | Resultado |
|---|---|
| Determinística | ✅ |
| Semanticamente coerente | ✅ |
| Depende de nome de diagnóstico | ❌ (não depende) |
| Fallback seguro | ✅ (mantém ambíguo na presença de qualquer concept ósseo/periosteal) |
| Força contexto ósseo/periosteal | ❌ (nunca força — apenas detecta e recua) |
| Testes cobrem caso positivo e negativo | ✅ |
| Falsos positivos identificados na auditoria | **0** |

37/39 ocorrências resolvidas para `rad_comp_solid`. As 2 recusas
remanescentes (`seed_563`, `seed_568`) não são falhas da regra — são
recusas corretas causadas por um problema **separado**, no mapeamento da
tag `"espiculada"` (seção B). A regra está pronta para congelamento na
baseline do migrador.

## B. Auditoria de `"espiculada"`

Tag viva, 4 usos totais (`TAXO03_LIVE_TAG_SNAPSHOT.json`):

| lesionId | nome | seção/sítio | tags coexistentes |
|---|---|---|---|
| seed_78 | Carcinoma broncogênico | Tórax/Nódulo pulmonar | restrição à difusão, margens irregulares, lobulada |
| seed_510 | Carcinoma tubular da mama | Mamas/Nódulo mamário | margens irregulares |
| seed_563 | Adenocarcinoma pulmonar | Tórax/Parênquima pulmonar | sólido, subsólido |
| seed_568 | Carcinoma ductal invasivo/NST | Mamas/Nódulo mamário | sólido, hipoecogênico, margens irregulares, sombra acústica posterior |

**A. Uso real**: as 4 ocorrências descrevem exclusivamente **margem
espiculada de massa/nódulo** (nódulo pulmonar, massa mamária — achado
clássico de malignidade em ambos os contextos). **Zero** ocorrências em
contexto ósseo/periosteal. 3 das 4 também carregam `"margens irregulares"`
(mesma família semântica, `radiologic.margins`), reforçando a leitura de
margem.

**B. Concept já existe?** Sim: `rad_margin_spiculated` (label
`"espiculadas"`, plural), grupo `radiologic.margins`, já aprovado na
baseline v1, com description que explicitamente se distingue de
`rad_periosteal_spiculated`: *"Distinto de rad_periosteal_spiculated, que
descreve o padrão da reação periosteal do osso subjacente, não o contorno
da lesão em si."*

**C. O mapping atual é correto?** **Não.** O mapa atual (`mapping.status:
"mapped"`, `confidence: "high"`, nota *"Correspondência exata de
label."*) aponta para `rad_periosteal_spiculated` (label singular
`"espiculada"`) puramente por correspondência textual exata entre a tag
viva e o label singular do concept — não por leitura semântica. O concept
semanticamente correto, `rad_margin_spiculated`, tem label no **plural**
(`"espiculadas"`), que não casa exatamente com a tag viva singular, e por
isso nunca foi considerado pelo tier de match exato.

**Proposta registrada** (não aplicada): `globalMappingProposal` de
correção — `currentConceptId: rad_periosteal_spiculated` →
`proposedConceptId: rad_margin_spiculated`, risco baixo (N=4, mas 100%
consistente; nenhum concept novo necessário). Ver
`TAXO04B2_RULE_ADJUDICATION.json → globalMappingProposals[4]`.

## C. Reavaliação de `seed_563` / `seed_568`

Sem o falso sinal periosteal de `"espiculada"`, nenhuma das duas lesões
teria qualquer outra tag resolvendo para `radiologic.boneDensity`/
`boneMatrix`/`periostealReaction`. Ambas satisfariam com segurança
`"sólido"` → `rad_comp_solid`. **Confirmado**: o bloqueio das 2 lesões
remanescentes deriva inteiramente do mapeamento incorreto de
`"espiculada"`, não de uma limitação do resolver. Nenhuma alteração foi
feita em `DATA` — este é apenas o registro da causa raiz.

## D. Global mapping proposals

| Tag | Ocorrências | Consistência | Concept proposto | Decisão |
|---|---|---|---|---|
| `vascular` | 20 | 20/20 | `etio_vascular` | **approve** |
| `focal` | 4 | 4/4 | `rad_extent_focal` | **approve** |
| `central` | 3 | 3/3 | `rad_position_central` | **approve** |
| `crônico` | 1 | 1/1 | `clin_tc_chronic` | **approve** (confiança baixa, N=1) |
| `espiculada` | 4 | 4/4 (correção) | `rad_margin_spiculated` | **approve** (ver seção B) |

Evidência resumida:

- **vascular**: as 20 ocorrências são processos de etiologia vascular
  (infarto, trombose, aneurisma, dissecção, pseudoaneurisma, peliose
  hepática). Nenhuma descreve vascularização/realce de massa. Seções
  predominantes: `Vascular`, `Neurorradiologia`, `Abdômen Superior` —
  todas consistentes com etiologia.
- **focal**: as 4 ocorrências descrevem extensão/distribuição da lesão
  (infarto focal, nódulo focal, microadenoma focal, metástase esplênica
  focal), nunca "dilatação focal" (tag distinta já mapeada) ou outro
  sentido.
- **central**: as 3 ocorrências descrevem posição central vs periférica —
  carcinoma pulmonar central (padrão clássico para espinocelular e
  pequenas células) e bronquiectasias centrais na ABPA (achado clássico
  descrito como "central" na literatura). Nenhuma referência a sistema
  nervoso central, calcificação central ou necrose central.
- **crônico**: única ocorrência (artropatia do manguito rotador) é
  semanticamente inequívoca como temporalidade clínica crônica; decisão
  semântica, não estatística — confiança registrada como baixa apenas
  pela amostra (N=1).

**Nenhuma destas propostas foi aplicada a `TAG_TO_TAXONOMY_MAP.json`
nesta rodada.** Aplicação fica para microetapa futura explícita, seguida
de novo dry-run.

## E. Ambiguidades mantidas (manuais, decisão conservadora)

| Tag | Ocorrências | Decisão |
|---|---|---|
| `calcificações` | 75 | keep-manual |
| `hemorrágico` | 69 | keep-manual |
| `difuso` | 46 | keep-manual |
| `bilateral` | 44 | keep-manual (dados fonte já carregam hedging: a mesma lesão às vezes tem `"bilateral"` E `"bilateral possível"`) |
| `necrótico` | 22 | keep-manual |

Nenhuma regra contextual determinística e auditável foi encontrada para
estas 5 famílias. Mantidas manuais por decisão deliberada, não por
omissão.

## F. Conflitos exclusivos — lítica + esclerótica

Mantida a decisão da TAXO-04B: **nenhuma** resolução automática para
"misto". As 7 lesões (`seed_44`, `seed_283`, `seed_46`, `seed_560`,
`seed_578`, `seed_1088`, `seed_577`) permanecem registradas como
`manual-review-required` no grupo exclusivo `radiologic.boneDensity`.
Motivo inalterado: 3/7 carregam `"multifocal"` (focos legítimos
independentes), e separar as demais exigiria inferência de diagnóstico.

## G. Regras aprovadas para congelamento

- `resolve-solid-composition-v1` (`CONTEXTUAL_RESOLVERS`) — **approve**,
  elegível para baseline congelada do migrador.

## H. Regras rejeitadas/adiadas

- Combinação lítica+esclerótica → misto: **rejeitada** (ver seção F,
  reiterando a decisão da TAXO-04B).
- Resolução automática de `calcificações`/`hemorrágico`/`difuso`/
  `bilateral`/`necrótico`: **adiada indefinidamente** — nenhum sinal
  contextual seguro disponível.
- Aplicação real das `globalMappingProposals` (vascular/focal/central/
  crônico/espiculada) ao `TAG_TO_TAXONOMY_MAP.json`: **adiada** para uma
  microetapa futura explícita, não decidida automaticamente aqui.

## I. Testes

`tests/taxonomy-migration-rule-adjudication.test.js` — valida: toda
proposta tem `decision`; nenhum `conceptId` referenciado é inexistente em
`TAXONOMY.json`; as `manualAmbiguities` continuam sem resolver
(`CONTEXTUAL_RESOLVERS`/`COMBINATION_RESOLVERS` não têm regra para
nenhuma delas); `resolve-solid-composition-v1` não referencia nome de
lesão/diagnóstico em seu código-fonte; o resolver possui caminho de
fallback (`resolved: false`); a auditoria de `"espiculada"` está presente
e correta; cada `globalMappingProposal` tem `usages`/`reason`/`decision`;
nenhuma referência a `DATA`/`SEED`/`saveData`/`localStorage`/Firestore/
IndexedDB nos arquivos desta rodada; `TAXONOMY.json` permanece com 38
groups/207 concepts (inalterado); `index.html` permanece intocado.

## J. Confirmações

- `TAG_TO_TAXONOMY_MAP.json`: intocado.
- `TAXONOMY.json`: intocado.
- `index.html`: intocado.
- `DATA` / `SEED` / Firestore / IndexedDB / `localStorage`: intocados.
- Nenhum `attributes` real criado; nenhuma tag real alterada.

Arquivos desta rodada: `TAXO04B2_RULE_ADJUDICATION.json` (novo),
`TAXO04B2_RULE_ADJUDICATION_REPORT.md` (novo, este arquivo),
`tests/taxonomy-migration-rule-adjudication.test.js` (novo). Nenhum
arquivo de rodadas anteriores foi modificado.

**NÃO houve `git add`, `commit` ou `push` nesta rodada.**
