# TAXO-03C — Adjudicação humana dos gaps vivos prioritários

**Escopo:** os 22 gaps `high` (usage≥20) analisados individualmente com contexto real de lesões (seções/sítios via `TAXO03_LIVE_TAG_SNAPSHOT.json`), mais um subconjunto de 17 gaps `medium` com valor estrutural claro para a mesma v1.1, mais o caso especial `degenerativo`/`Degenerativo` (pedido explícito). Os ~22 `medium` restantes e todos os 558 `low` ficam em **backlog**, não analisados em profundidade nesta rodada.

**Nada foi aplicado.** `TAXONOMY.json`, `TAG_TO_TAXONOMY_MAP.json` e `index.html` permanecem exatamente como estavam. Toda decisão aqui é **proposta**, com `reviewStatus: "pending-human-approval"`.

---

## A. `ADD_CONCEPT` (15 tags → 13 concepts novos propostos, 5 groups novos)

| tag | usage | conceptId proposto | group (novo?) | supportsDifferentialReasoning |
|---|---|---|---|---|
| margens irregulares | 153 | `rad_margin_irregular` | radiologic.margins | sim |
| dilatação focal | 89 | `rad_assoc_focal_dilation` | radiologic.associatedFindings | sim |
| hipersinal T2 | 76 | `rad_signal_t2_hyper` | **radiologic.signalIntensityT2** (novo) | sim |
| hipossinal T2 | 26 | `rad_signal_t2_hypo` | radiologic.signalIntensityT2 (novo) | sim |
| hipersinal T1 | 14 | `rad_signal_t1_hyper` | **radiologic.signalIntensityT1** (novo) | sim |
| hipossinal T1 | 5 | `rad_signal_t1_hypo` | radiologic.signalIntensityT1 (novo) | sim |
| crescimento lento | 38 | `rad_growthrate_slow` | **radiologic.growthRate** (novo) | sim |
| crescimento rápido | 11 | `rad_growthrate_fast` | radiologic.growthRate (novo) | sim |
| parede espessa | 35 | `rad_assoc_thick_wall` | radiologic.associatedFindings | sim |
| restrição à difusão | 30 | `rad_diffusion_restricted` | **radiologic.diffusion** (novo) | sim |
| restrição de difusão | 8 | *(mesmo concept — sinônimo)* | — | — |
| derrame associado | 29 | `rad_assoc_effusion` | radiologic.associatedFindings | sim |
| hipoecogênico | 21 | `rad_echo_hypo` | **radiologic.echogenicity** (novo) | sim |
| hipoecoico | 6 | *(mesmo concept — sinônimo)* | — | — |
| anecoico | 11 | `rad_echo_anechoic` | radiologic.echogenicity (novo) | sim |

**5 groups novos propostos**, todos justificados por gap estrutural real (nenhum eixo equivalente existe hoje):
1. `radiologic.signalIntensityT2` / `radiologic.signalIntensityT1` — a V1 não modela intensidade de sinal em RM, um eixo semiológico fundamental.
2. `radiologic.growthRate` — **já previsto** na própria `TAXONOMIA_ATLAS_V1.md` (seção 13, nota explícita sobre "crescimento rápido" ter sido deixado de fora de propósito por já ter um group futuro reservado). Esta rodada confirma a necessidade real.
3. `radiologic.diffusion` — achado de RM fundamental (abscesso, infarto agudo, tumores celulares), ausente hoje.
4. `radiologic.echogenicity` — a V1 não modela ecogenicidade ao ultrassom.

Todos os `exclusive: true` propostos (hiper/hipo/aneco são estados mutuamente exclusivos do mesmo eixo), exceto `radiologic.diffusion` (`exclusive: false` — por ora só "restrito" é usado, sem par oposto vivo relevante).

## B. `MAP_EXISTING` (9 tags, nenhum concept novo necessário)

| tag | usage | existingConceptId | motivo resumido |
|---|---|---|---|
| bem circunscrita | 217 | `rad_margin_circumscribed` | mesmo conceito, intensificador "bem" + concordância |
| idade pediátrica | 96 | `demo_age_pediatric` | "idade" redundante |
| malformação congênita | 67 | `etio_congenital` | forma substantivada de "congênito" |
| trauma | 62 | `etio_traumatic` | forma substantivada de "traumático"; contexto 100% etiológico real |
| sólido-cístico | 23 | `rad_comp_complex_cyst` | precedente DIRETO já decidido na TAXO-01 (ver nota) |
| margens mal definidas | 12 | `rad_margin_illdefined` | "margens" redundante |
| bem delimitado | 12 | `rad_margin_circumscribed` | mesma família de "bem circunscrita" (nuance a confirmar — ver G) |
| lobulada | 5 | `rad_margin_lobulated` | concordância de gênero/número |
| matriz condroide | 11 | `rad_bonematrix_chondroid` | "matriz" redundante |

**Nota sobre `sólido-cístico`**: esta é a MESMA expressão que motivou a criação de `rad_comp_complex_cyst` na própria TAXO-01 (ajuste de composição, já documentado em `TAXONOMIA_ATLAS_V1.md` seção 2) — o mapeamento automático simplesmente não capturou por diferença textual exata. Alta confiança.

Essas 9 correções devem futuramente atualizar `TAG_TO_TAXONOMY_MAP.json` (de `unmapped` para `mapped`/`ambiguous`), **nunca** `TAXONOMY.json`.

## C. `KEEP_FREE_TAG`

Nenhum dos 22 `high` ou dos 17 `medium` analisados caiu nesta categoria nesta rodada — os gaps de alto uso revisados tiveram valor estruturado suficiente (`ADD_CONCEPT`/`MAP_EXISTING`), eram metadado (`METADATA_NOT_TAXONOMY`) ou precisam de decisão humana adicional (`REVIEW_LATER`). Isso é esperado: tags *genuinamente* livres (epônimos, sinais muito específicos) já foram majoritariamente capturadas como `ignored` na reconciliação TAXO-03B, não aparecem como gap de alta prioridade.

## D. `METADATA_NOT_TAXONOMY` (5 tags — modalidade/técnica/triagem, fora do escopo clínico-radiológico)

| tag | usage | motivo |
|---|---|---|
| emergência | 73 | marcador de urgência/triagem operacional, não fenótipo da lesão |
| RM | 42 | sigla de modalidade (Ressonância Magnética) |
| US | 16 | sigla de modalidade (Ultrassom) |
| radiografia | 11 | nome de modalidade (Raio-X) |
| dinâmico | 5 | qualificador de protocolo de aquisição |

Nenhuma dessas deveria virar `conceptId` na taxonomia clínico-radiológica — são metadados de **como a imagem foi feita**, não **o que a lesão é**.

## E. `NORMALIZE_TAG` / `MERGE_WITH_EXISTING_TAG`

| tag | usage | ação proposta |
|---|---|---|
| `inflamatório/infeccioso` | 5 | normalizar para a forma canônica `"infeccioso/inflamatório"` — duplicata por ordem de palavras, já identificada com confiança alta em `TAG_AUDIT_GRUPOS_SEMANTICOS.json` (grupo G1) |
| `Degenerativo` | 1 | normalizar para `"degenerativo"` (minúsculo) — ver seção dedicada abaixo |

### Caso especial: `degenerativo` × `Degenerativo` (pedido explícito)

- `"degenerativo"` (minúsculo): **3 usos**, vivo.
- `"Degenerativo"` (maiúsculo): **1 uso**, vivo.
- Histórico: o edit aplicado `aterosclerótico → "degenerativo"` já estabeleceu a forma minúscula como a canônica de fato.
- **Decisão proposta:** `NORMALIZE_TAG` — numa futura rodada de aplicação de decisões de tag (mesmo mecanismo já usado para os 10 edits já aplicados), registrar `decision="edit", target="degenerativo"` para a tag `"Degenerativo"`. **Não corrigido automaticamente aqui.**
- O mapeamento taxonômico (`mapped → etio_degenerative`) já está correto para as duas grafias hoje — a normalização é só higiene de vocabulário de tag, nunca uma questão de `TAXONOMY.json`.

## F. `REVIEW_LATER` (9 tags — decisão humana adicional necessária antes de qualquer ação)

| tag | usage | motivo da pendência |
|---|---|---|
| aumento de volume | 41 | ambíguo entre achado de exame clínico (edema/swelling) e um possível eixo radiológico de tamanho — sem domain claro nos exemplos revisados |
| heterogêneo | 38 | pode ser heterogeneidade de REALCE (já existe) ou de COMPOSIÇÃO geral (não modelada) — decidir junto com "homogêneo" |
| homogêneo | 20 | par simétrico de "heterogêneo" |
| malignidade | 36 | risco de conflação entre "aparência agressiva" (já existe `radiologic.aggressiveness`) e "malignidade clínico-patológica comprovada" (conceito relacionado mas distinto) — decidir junto com "benignidade"/"benigna" |
| benignidade | 16 | par de "malignidade" |
| benigna | 6 | mesma família |
| realce | 28 | tag genérica demais isoladamente (já sinalizada como tal na auditoria de tags original, grupo G7) — qualquer um dos 6 concepts de `enhancementMorphology` poderia estar implícito |
| espessamento nodular | 22 | possível redundância/composicionalidade com a proposta "parede espessa" desta mesma rodada — decidir modelagem (concept único com qualificador vs. dois concepts) |
| assimetria | 6 | ambíguo entre `clinical.symmetry`/`radiologic.symmetry` (mesmo padrão de "assimétrico"); não precisa de concept novo, só da decisão de qual/quais candidatos marcar como `ambiguous` no mapa — também é o target vivo de 3 edits já aplicados |

---

## Além dos 22 high — varredura dos 40 medium (sem análise profunda)

Dos 40 gaps `medium`, **17 foram trazidos para esta rodada** (tabela completa acima, seções A/B/D/E/F) por completarem famílias já identificadas nos `high` (sinal T1, ecogenicidade, crescimento) ou por serem correções `MAP_EXISTING`/`METADATA_NOT_TAXONOMY`/`NORMALIZE_TAG` de alta confiança e baixo esforço. Os **23 medium restantes** (`coleção`, `realce periférico`, `falha de enchimento`, `hiperdensidade espontânea`, `densificação da gordura`, `radiografia`-já incluído, `descontinuidade`, `realce variável`, `hipercaptante`, `hematogênico`, `engloba vasos`, `flap intimal`, `oval`, `pós-operatório`, `fibrose`, `grande volume`, `pneumatose`, `linear`, `hiperparatireoidismo`, `consolidação`, `vidro fosco`, `fratura`, `massa sólida`) ficam em **backlog** — nenhum padrão estrutural óbvio de família incompleta foi identificado entre eles nesta varredura superficial; merecem a mesma análise individual dos `high` numa rodada futura, não antes.

Os 558 `low` (usage 1-4) permanecem inteiramente em backlog, conforme instruído.

---

## Conexão futura com diferencial (sem implementar)

Os concepts marcados `supportsDifferentialReasoning: true` nesta rodada (margens, sinal T1/T2, ecogenicidade, velocidade de crescimento, difusão, derrame, parede espessa, dilatação focal) são exatamente os citados como "alto valor provável" no pedido — todos radiológicos, descritores de achado de imagem clássicos usados em diagnóstico diferencial.

## Conexão futura com Radiopaedia (documentação apenas, sem implementar)

Concepts com maior probabilidade de serem sugeridos automaticamente a partir de seções de artigo Radiopaedia (ver auditoria anterior desta sessão):
- `rad_margin_irregular`, `rad_assoc_thick_wall`, `rad_assoc_effusion`, `rad_diffusion_restricted` → seção **Radiographic features**.
- `rad_signal_t1_*`/`rad_signal_t2_*` → seção **Radiographic features > MRI**.
- `rad_echo_*` → seção **Radiographic features > Ultrasound**.
- `rad_growthrate_*` → seção **Treatment and prognosis** (frequentemente onde a velocidade de crescimento é discutida) ou **Pathology**.
