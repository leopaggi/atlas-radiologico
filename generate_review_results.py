import json, re

text = open('/mnt/user-data/uploads/8c563d1f-attachment.txt', encoding='utf-8').read()
start = text.index('=== PACOTE DAS REVISÕES (JSON) ===')
jsontext = text[start+len('=== PACOTE DAS REVISÕES (JSON) ==='):].strip()
data = json.loads(jsontext)
reviews = data['reviews']
legacy_ids = set(json.load(open('/home/claude/atlas-radiologico/legacy_ids.json')))

VALID_PLACEMENTS = {
"Abdômen Superior": ["Apêndice","Baço","Bexiga","Estômago","Esôfago","Fígado","Intestino / cólon","Peritônio e Mesentério","Pâncreas","Retroperitônio","Rim","Suprarrenal","Vascular","Vesícula biliar / vias biliares"],
"Cabeça e Pescoço": ["Base do crânio","Cavidade oral e orofaringe","Espaços cervicais","Glândulas salivares","Laringe","Linfonodos cervicais","Mandíbula e maxila","Nasofaringe","Osso temporal","Paratireoide","Seios paranasais","Tireoide","Vascular","Órbita"],
"Coluna Vertebral": ["Articulações facetárias","Corpo vertebral","Disco intervertebral","Espaço epidural","Intradural","Partes moles paravertebrais","Sacro"],
"Mamas": ["Axila","Calcificações","Mama masculina","Mama operada","Mamilo e pele","Nódulo mamário","Prótese mamária"],
"Medicina Fetal": ["Anomalias fetais estruturais","Rim e trato urinário fetal"],
"Musculoesquelético": ["Articulações","Cotovelo","Joelho","Músculos","Nervos periféricos","Ombro","Osso","Partes moles","Punho e Mão","Quadril","Tibia","Tornozelo e Pé","Vascular"],
"Neurorradiologia": ["Crânio ósseo","Extra-axial / meninges","Fossa posterior / cerebelo","Intra-axial (parênquima)","Região pineal","Região selar","Tronco encefálico","Vascular","Ventrículos","Vias ópticas"],
"Obstetrícia": ["Colo uterino e gestação","Gestação múltipla e complicações","Placenta e anexos ovulares","Puerpério"],
"Pelve Feminina": ["Colo uterino","Endométrio","Ovário","Trompas de Falópio","Vagina","Útero"],
"Pelve Masculina": ["Cordão espermático","Epidídimo","Períneo / escroto","Próstata","Pênis","Testículo","Vesículas seminais"],
"Tórax": ["Coração e pericárdio","Diafragma","Massa mediastinal","Nódulo pulmonar","Parede torácica","Parênquima pulmonar","Pleura","Vascular","Vias aéreas"],
}

# ---- Manually authored "apply" content for stub/poor-quality entries identified during review ----
MANUAL_APPLY = {
  "lrev_mw55gnal_k5r8fa": {  # seed_220 Leiomioma cervical - ORADS misapplied (O-RADS is adnexal), notes stub
    "summary": "Notas reescritas (estavam quase vazias) e classificação O-RADS removida (sistema é para massas anexiais, não se aplica a leiomioma cervical).",
    "reasoning": "currentFields.notes tinha apenas 99 caracteres, insuficiente para descrever o padrão de imagem. O-RADS (ACR Ovarian-Adnexal Reporting and Data System) classifica massas ANEXIAIS/ovarianas, não se aplica anatomicamente a um leiomioma do colo uterino — por isso a classificação foi removida, conforme regra de compatibilidade anatômica.",
    "proposedChanges": {
      "notes": "Padrão: nódulo sólido bem circunscrito originado da parede do colo uterino, com sinal tipicamente baixo em T2 (semelhante aos leiomiomas de corpo uterino) e realce homogêneo pós-contraste; pode causar efeito de massa sobre o canal cervical ou órgãos adjacentes quando volumoso.\n\nDiferenciais-chave: Leiomioma de corpo uterino com extensão cervical (origem no corpo uterino, não isolado no colo); Pólipo cervical (lesão polipoide mais superficial/intracanalicular, geralmente menor e pediculada); Carcinoma cervical (massa infiltrativa, irregular, com restrição à difusão e realce heterogêneo, em vez de nódulo bem circunscrito e homogêneo).",
      "classification": None
    }
  },
  "lrev_mw5397kv_zpgl2a": {  # seed_206 Fibroma/Fibrotecoma ovariano, img_mismatch Teratoma, tags contaminated
    "summary": "Notas e tags reescritas; removidos descritores contaminados de outra condição (estenose segmentar, colaterais) que não se aplicam a fibroma/fibrotecoma ovariano. Classificação O-RADS mantida (compatível com massa ovariana).",
    "reasoning": "notes tinha só 90 caracteres e as tags incluíam termos vasculares/intestinais (\"estenose segmentar\", \"colaterais\") incompatíveis com fibroma/fibrotecoma ovariano — provável contaminação cruzada de conteúdo de outra lesão. Corrigido para refletir o padrão real da entidade.",
    "proposedChanges": {
      "notes": "Padrão: massa ovariana sólida bem circunscrita, com sinal baixo em T2 (conteúdo fibroso/colágeno denso) e realce geralmente discreto e progressivo; pode haver sombra acústica ao US pela densidade fibrosa. Fibrotecomas podem apresentar sinal discretamente mais alto que fibromas puros por componente tecal.\n\nDiferenciais-chave: Leiomioma subseroso pediculado (origem uterina identificável, continuidade com o miométrio); Tumor de células da granulosa (massa sólido-cística com componentes hipervascularizados, podendo associar-se a efeitos hormonais); Tumor de Krukenberg/metástase ovariana (geralmente bilateral, com história de tumor primário, frequentemente mais heterogêneo).",
      "tags": ["hipossinal T2", "sólido", "bem circunscrita", "sombra acústica", "realce discreto"]
    }
  },
  "lrev_mw530hd8_7a8gfj": {  # seed_204 Cisto funcional, stub notes
    "summary": "Notas reescritas (estavam com apenas 88 caracteres); tags e classificação O-RADS mantidas, compatíveis com a entidade.",
    "reasoning": "Pedido do usuário foi explicitamente 'atualizar tags, descrição, diferenciais'. notes tinha só 88 caracteres. Tags atuais já eram adequadas; adicionada apenas a descrição e diferenciais.",
    "proposedChanges": {
      "notes": "Padrão: cisto ovariano simples, unilocular, anecoico, de paredes finas e sem componente sólido ou vascularização interna ao Doppler; cisto de corpo lúteo pode apresentar parede mais espessa com padrão de \"anel de fogo\" ao Doppler e conteúdo com debris por conteúdo hemorrágico, sem sinal de malignidade.\n\nDiferenciais-chave: Cistadenoma seroso (cisto persistente além de alguns ciclos, sem resolução espontânea esperada do cisto funcional); Cisto hemorrágico (conteúdo reticular/em teia de aranha nas fases iniciais, evoluindo de forma semelhante ao corpo lúteo); Endometrioma (conteúdo com ecos de baixo nível difusos \"em vidro fosco\", sem o padrão anecoico puro do cisto funcional)."
    }
  },
  "lrev_mw534voz_kdo7g0": {  # restored1018_268 Cisto paratubário, stub notes, tag "Paraovarian cyst" duplicating enTerm
    "summary": "Notas reescritas (94 caracteres) e removida tag duplicada em inglês ('Paraovarian cyst', que já está em enTerm). A ausência de imagens é uma questão separada, fora do allowlist — requer ação manual.",
    "reasoning": "Pedido tinha duas partes: (1) tags+descrição — campo permitido, corrigido; (2) ausência de imagem — fora da allowlist, não pode ser resolvido aqui; fica registrado para ação manual do usuário.",
    "proposedChanges": {
      "notes": "Padrão: cisto anexial extraovariano, separado do ovário e da tuba, geralmente adjacente ao mesossalpinge; é anecoico, unilocular, de parede fina e sem componente sólido, sem alteração ao longo do ciclo menstrual (não funcional).\n\nDiferenciais-chave: Cisto funcional ovariano (localizado dentro do ovário, com variação ao longo do ciclo); Hidrossalpinge (estrutura tubular alongada e serpiginosa, em vez de cisto arredondado simples); Cistadenoma seroso ovariano (origem ovariana identificável, podendo ter septos finos).",
      "tags": ["cístico", "ausência de realce", "bem circunscrita", "extraovariano"]
    }
  },
  "lrev_mw53449o_8vuse5": {  # restored1018_272 Cisto do ducto de Gartner - "atualizar tags + descrição" entry (not the IMAGEM AUSENTE one)
    "summary": "Notas reescritas (94 caracteres); tags mantidas, adequadas à entidade.",
    "reasoning": "Pedido explícito: 'atualizar tags + descrição'. Notas eram insuficientes (94 caracteres).",
    "proposedChanges": {
      "notes": "Padrão: cisto remanescente do ducto mesonéfrico (de Gartner), localizado na parede anterolateral da vagina, geralmente assintomático e incidental; anecoico/hipointenso em T1, hiperintenso em T2, sem realce ou componente sólido. Pode associar-se a outras anomalias müllerianas/mesonéfricas (ex.: agenesia renal ipsilateral).\n\nDiferenciais-chave: Divertículo uretral (comunicação com a uretra, podendo mudar de tamanho com a micção); Cisto de inclusão vaginal (geralmente pós-traumático/pós-parto, mais superficial na parede vaginal); Ureterocele ectópica (estrutura cística associada a ureter ectópico, com continuidade demonstrável)."
    }
  },
  "lrev_mw52it9e_5a3182": {  # seed_159 Carcinoma de células renais - clarify title confusion
    "summary": "Notas ampliadas com um parágrafo de esclarecimento sobre a relação entre 'carcinoma de células renais' (termo guarda-chuva) e 'carcinoma de células claras' (subtipo histológico mais comum), sem alterar o nome da lesão.",
    "reasoning": "O usuário relatou confusão entre os dois termos. 'Carcinoma de células renais' é o termo correto para a entidade guarda-chuva nesta lesão (não um erro a corrigir no nome); a solução apropriada é esclarecer a relação dentro das notas, não criar/renomear a lesão. Nenhuma classificação específica se aplica de forma inequívoca a todos os subtipos de CCR, por isso 'classification' permanece null.",
    "proposedChanges": {
      "notes": "Padrão: massa renal sólida, geralmente heterogênea e hipervascular na fase arterial/corticomedular, com margens irregulares em formas mais agressivas; pode haver necrose central, componente cístico ou invasão da veia renal/cava.\n\nNota sobre nomenclatura: \"Carcinoma de células renais\" (CCR) é o termo guarda-chuva para as neoplasias malignas epiteliais do rim; \"carcinoma de células claras\" é o subtipo histológico mais comum (cerca de 70-80% dos casos) dentro desse grupo, caracterizado por hipervascularização intensa na fase corticomedular. Outros subtipos (papilífero, cromófobo, etc.) têm padrões de realce distintos (geralmente mais discretos/progressivos). A distinção definitiva entre subtipos é histológica, não radiológica isolada.\n\nDiferenciais-chave: Angiomiolipoma (componente de gordura macroscópica identificável na TC/RM, ausente no CCR); Oncocitoma (massa homogênea com padrão em roda de carroça em alguns casos, realce intenso porém sem invasão típica); Metástase renal (história de neoplasia primária conhecida, frequentemente múltipla/bilateral)."
    }
  },
}

def has_mismatch(req_lower):
    return any(k in req_lower for k in ["imagens erradas", "erroneamente vinculad", "casos clinicos", "caso clinico", "casos e imagens", "caso e imagens", "imagens todas erradas", "imagens duplicadas"])

results = []
for r in reviews:
    rid = r['reviewId']
    scope = r.get('scope')
    lname = r.get('lesionName')
    req = (r.get('requestText') or '').strip()
    req_low = req.lower()
    cf = r.get('currentFields', {}) or {}
    imgs = r.get('images') or []
    img_names = sorted(set(i.get('lesionName') for i in imgs if i.get('lesionName')))
    mismatched = [n for n in img_names if n and n != lname]

    if rid in MANUAL_APPLY:
        m = MANUAL_APPLY[rid]
        results.append({
            "reviewId": rid, "result": "apply",
            "summary": m["summary"], "reasoning": m["reasoning"],
            "proposedChanges": m["proposedChanges"]
        })
        continue

    if scope == "global":
        results.append({
            "reviewId": rid, "result": "analysis",
            "summary": "Pendência geral do Atlas sem lesão-alvo única: estudar e padronizar achados ultrassonográficos de endometriose em todo o acervo.",
            "reasoning": "scope=global — não se refere a uma lesão específica. Requer plano de trabalho manual: (1) levantar todas as lesões do Atlas relacionadas a endometriose (ovariana, profunda, de parede abdominal, etc.), (2) revisar se os achados ultrassonográficos atuais (vs. apenas RM) estão descritos de forma completa e correta em cada uma, (3) padronizar terminologia (ex.: 'kissing ovaries', sinal do deslizamento ausente, endometrioma com ecos de baixo nível) entre as lesões correlatas. Não é uma correção de campo único, por isso não pode ser 'apply'."
        })
        continue

    # Image mismatch / wrong case-image linkage reported in free text
    if mismatched or has_mismatch(req_low):
        donors = mismatched if mismatched else ["(ver requestText)"]
        results.append({
            "reviewId": rid, "result": "manual_action_required",
            "summary": f"Imagens/casos clínicos vinculados a esta lesão pertencem a outra condição, não a \"{lname}\".",
            "reasoning": f"requestText do usuário ('{req}') e/ou o campo images[].lesionName apontam conteúdo de outra entidade ({', '.join(donors)}) vinculado por engano a esta lesão. Reassociação/remoção de imagem está fora da allowlist de campos de texto (images é campo proibido) e é protegida pela regra de ownership do Atlas — só pode ser feita manualmente pelo usuário via UI, nunca automaticamente.",
            "manualAction": {
                "type": "wrong_image_linkage",
                "description": f"Verificar manualmente as imagens desta lesão ({lname}); desvincular as que pertencem a '{', '.join(donors)}' e, se necessário, revincular as imagens corretas de '{lname}' nas lesões doadoras correspondentes."
            },
            "proposedChanges": {}
        })
        continue

    # Missing image reports
    if "imagem ausente" in req_low or "imagens ausentes" in req_low or "ausencia de imagens" in req_low or "sem imagem" in req_low or "vincular imagens" in req_low:
        results.append({
            "reviewId": rid, "result": "manual_action_required",
            "summary": "Imagem relatada como ausente nesta lesão.",
            "reasoning": "Imagem é campo fora da allowlist. Além disso, parte das lesões marcadas como 'ausente' pode já ter se resolvido com a correção do bug de sincronização hospital/casa publicada em 2026-11-06 (importação de backup não marcava imagens como pendentes de envio à nuvem) — por isso recomenda-se verificar visualmente no app ANTES de qualquer re-upload manual, para não duplicar trabalho.",
            "manualAction": {
                "type": "missing_image",
                "description": "Confirmar no app (ambos os dispositivos já sincronizados) se a imagem desta lesão aparece normalmente agora; se ainda estiver ausente, re-anexar manualmente a imagem correta."
            },
            "proposedChanges": {}
        })
        continue

    # Wrong section/session placement (current placement wrong, not an addition)
    if "sessão" in req_low or "sessao" in req_low or "classificad" in req_low:
        results.append({
            "reviewId": rid, "result": "manual_action_required",
            "summary": "Lesão relatada como posicionada na seção/sessão errada do Atlas.",
            "reasoning": f"requestText ('{req}') indica que a seção atual não é a correta para esta entidade. Seção/site são campos fora da allowlist (estrutural); mudança de local exige ação manual do usuário, pois pode afetar navegação, contagens e IDs de ordenação.",
            "manualAction": {
                "type": "section_correction",
                "description": "Mover manualmente esta lesão para a seção/site correta no app, conforme indicado pelo usuário no pedido original."
            },
            "proposedChanges": {}
        })
        continue

    # Uncertainty about image correspondence ("DUVIDA", "não recordo", "achei no cloudinary", "nao tenho ctza")
    if "duvida" in req_low or "não recordo" in req_low or "nao recordo" in req_low or "achei no cloudinary" in req_low or "nao tenho ctza" in req_low or "confirmar" in req_low:
        results.append({
            "reviewId": rid, "result": "manual_action_required",
            "summary": "Usuário tem incerteza sobre a correspondência da imagem vinculada a esta lesão.",
            "reasoning": f"requestText ('{req}') expressa dúvida, não uma correção de texto. Verificação visual da imagem é necessária e está fora da allowlist de campos de texto.",
            "manualAction": {
                "type": "verify_image_correspondence",
                "description": "Revisar visualmente a imagem vinculada e confirmar (ou corrigir manualmente) se ela realmente corresponde a esta lesão."
            },
            "proposedChanges": {}
        })
        continue

    # Duplicated hyperlink reference issue
    if "duplicad" in req_low:
        results.append({
            "reviewId": rid, "result": "manual_action_required",
            "summary": "Link/hiperlink de referência (Radiopaedia) duplicado nesta lesão.",
            "reasoning": f"requestText ('{req}') refere-se a um link duplicado — não é um dos campos de texto da allowlist (name/notes/classification/tags/enTerm/clinicalTags) de forma inequívoca; pode estar embutido em notes mas sem clareza de qual trecho remover sem risco de apagar conteúdo correto.",
            "manualAction": {
                "type": "duplicate_reference_link",
                "description": "Verificar manualmente o campo de referência/link desta lesão no app e remover a duplicata do hiperlink do Radiopaedia."
            },
            "proposedChanges": {}
        })
        continue

    # Default: nothing clearly actionable found in this pass -> no_change, flag for manual review of request text
    results.append({
        "reviewId": rid, "result": "no_change",
        "summary": "Nenhuma mudança de campo permitido identificada para este pedido nesta passada automatizada.",
        "reasoning": f"requestText ('{req}') não se encaixou claramente em nenhum dos padrões recorrentes (imagem errada/ausente, seção errada, dúvida de correspondência, link duplicado) nem indicou um problema evidente nos campos de texto atuais. Recomenda-se revisão humana específica deste item antes de descartar.",
        "proposedChanges": {}
    })

print(len(results), 'results generated')
from collections import Counter
print(Counter(r['result'] for r in results))

with open('/home/claude/atlas-radiologico/review-batch-output.json', 'w', encoding='utf-8') as f:
    json.dump({"results": results}, f, ensure_ascii=False, indent=1)
