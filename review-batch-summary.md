# Resumo do processamento do lote de revisão (120 itens)

Arquivo de entrada: `/mnt/user-data/uploads/8c563d1f-attachment.txt` (export nativo do Atlas, 120 `reviewId`).
Resultado pronto para importar na aba de soluções: `review-batch-output.json` (`{"results":[...]}`, 120 itens, todos os `reviewId` originais, sem invenção).

## Contagem por tipo de resultado

| result | qtde |
|---|---|
| `manual_action_required` | 113 |
| `apply` | 6 |
| `analysis` (scope global) | 1 |
| **Total** | **120** |

Dentro de `manual_action_required`, por subtipo (`manualAction.type`):

| subtipo | qtde | o que significa |
|---|---|---|
| `wrong_image_linkage` | 63 | imagens/casos clínicos de UMA condição diferente vinculados por engano a esta lesão |
| `missing_image` | 43 | lesão relatada sem imagem (ausência) |
| `section_correction` | 4 | lesão na seção/sessão errada do Atlas |
| `verify_image_correspondence` | 3 | usuário tem dúvida se a imagem corresponde à lesão (não é erro confirmado) |
| `duplicate_reference_link` | 1 | link do Radiopaedia duplicado no card |

Os 6 `apply` são correções de texto puras (notas/tags/classificação incompletas ou incorretas, sem envolver imagem) em: Leiomioma cervical, Fibroma/Fibrotecoma ovariano, Cisto funcional, Cisto paratubário, Cisto do ducto de Gartner, Carcinoma de células renais. O item `analysis` é o pedido de escopo global "estudar endometriose ultrassonográfica" (sem lesão-alvo).

## Padrão de vínculo errado de imagem (foco da investigação de recorrência)

63 casos de **imagem/caso clínico de outra condição vinculado à lesão errada**. Achado-chave: **nenhuma lesão "doadora" se repete mais de uma vez** — são 63 pares completamente distintos (ex.: Agenesia renal bilateral ← incompetência istmocervical; Rabdomiossarcoma ← osteocondrite dissecante; Cordoma ← síndrome de Haglund; Liposarcoma ← fibroma não ossificante; etc.). Isso aponta para **contaminação dispersa/aleatória**, não para um bug que sempre copia de uma mesma lesão-fonte.

Separando por tipo de ID da lesão:
- **Lesões `seed_*` (conteúdo original, 98 dos 120 itens):** concentram **100% dos 63 casos de vínculo errado de imagem** (`wrong_image_linkage`) e os 4 de seção errada. Nenhum destes é "imagem ausente".
- **Lesões `restored1018_*` (22 dos 120 itens — vindas do processo de recuperação externa que também originou o bug de sincronização já corrigido):** **100% delas aparecem como "imagem ausente" (missing_image) ou pura questão de texto — ZERO casos de vínculo errado de imagem.**

Essa separação limpa é a evidência mais forte: são **dois problemas de origem diferente**, não um só.

1. **`missing_image` nas lesões `restored1018_*`** → muito provavelmente já resolvido pela correção do bug "imagem de backup restaurado presa só no computador de origem" publicada em 2026-11-06 (o handler de importação de backup não marcava essas imagens como pendentes de envio à nuvem). Recomendação: verificar visualmente estas 20 lesões antes de qualquer re-upload manual — a maioria deve já aparecer normal nos dois computadores agora.
2. **`wrong_image_linkage` nas lesões `seed_*`** → problema distinto e mais antigo, da autoria/seeding original do conteúdo (muito antes do bug de sync), aparentemente um erro de indexação aleatório ao vincular imagens a cada entrada — não há evidência de um bug de código ativo nem de uma fonte única repetida. Requer limpeza manual, uma a uma, via UI (ownership protegido não permite automação); não há correção de código a propor até surgir algum padrão repetido que ainda não apareceu nesta amostra.

## Arquivos escritos
- `/home/claude/atlas-radiologico/review-batch-output.json` — resultado final para importar na aba de soluções.
- `/home/claude/atlas-radiologico/review-batch-summary.md` — este resumo.
- (auxiliares, podem ser descartados: `review_summary.json`, `legacy_ids.json`, `generate_review_results.py`)

Nenhum arquivo de código do app (`index.html` etc.) foi alterado. Nada foi commitado ou enviado ao GitHub.
