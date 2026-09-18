# Atlas Radiológico

Atlas de padrões radiológicos — um banco de lesões organizado por seção
(Neurorradiologia, Tórax, Musculoesquelético, etc.), com tags de imagem,
descrição do padrão radiológico, classificação de frequência e imagens
associadas. Feito pra estudo/consulta rápida.

## Como rodar

É um único arquivo `index.html` autossuficiente. Não precisa de build,
servidor local nem instalação — basta abrir no navegador ou publicar via
GitHub Pages.

**Hospedagem:** GitHub Pages, em `leopaggi.github.io/atlas-radiologico/`.

## Como atualizar o site

O arquivo já passou de 2 MB, então o editor web do GitHub **não abre mais
esse arquivo pra edição direta**. O fluxo é:

1. Gerar o `index.html` atualizado
2. No repositório: **Add file → Upload files → choose your files**
3. Selecionar o `index.html` novo (substitui o antigo)
4. Commit changes
5. Esperar 1-2 min pro GitHub Pages publicar
6. Testar com Ctrl+Shift+R (força recarregar sem cache)

## Arquitetura

Tudo num arquivo único (`index.html`), por opção explícita — mais fácil de
manter e atualizar sem depender de build step. Por dentro, três camadas:

- **Dados** — `const SEED = [...]`: ~1.213 lesões, cada uma com `id`, `s`
  (seção), `site` (subseção), `name`, `tags`, `notes`, `inc` (frequência:
  1=muito comum ... 4=raro), `enTerm` (termo em inglês pra busca), `links`,
  `images`, e opcionalmente `classification` (sistema padronizado de
  classificação radiológica — BI-RADS, PI-RADS, TI-RADS, etc.; ver
  `AI.md` pra a lista completa e qual órgão cada um cobre).
- **Armazenamento local** — IndexedDB (banco `atlas_radiologico_idb`), não
  `localStorage`. Ver `AI.md` pra entender por quê.
- **Sincronização** — Firebase Firestore (projeto `atlas-radiologico`),
  como fonte da verdade na nuvem. Estado local é um cache; a nuvem manda.

## Funcionalidades principais

- Navegação por seção → subseção → lesão
- Filtro por tags de característica de imagem
- Tags especiais: "📷 imagens" (tem foto) e "🚫 sem imagens" (ainda não
  tem — útil pra saber o que falta completar)
- Upload de imagens (via Cloudinary)
- Tela de auditoria de duplicatas (`🩺 diagnóstico do sistema`, dentro de
  "⚙️ ferramentas avançadas")
- Auditoria de vínculo imagem↔lesão (`🔍 audit`)

## Testes

```
node tests/duplicate-detection.test.js
```

Roda antes de qualquer mudança na lógica de dados ou de deduplicação, pra
garantir que nenhuma duplicata escapa.

## Histórico relevante

Ver `AI.md` para o histórico de bugs já resolvidos e decisões de design —
essencial antes de mexer na lógica de sincronização ou de dados.

## Atualização 2026-09-18 — correção de subseções secundárias

Foi realizada uma auditoria de `altPlacements`, campo usado para exibir uma lesão também em uma segunda localização anatômica. A partir de um backup fresco, 86 registros foram revisados: 18 associações secundárias coerentes foram mantidas e 68 associações espúrias foram removidas pela migração do `index.html`.

A correção é restrita a `altPlacements`: não muda a seção/subseção principal (`s`/`site`), imagens, tags, descrições, IDs ou progresso de revisão/SRS.

**Regra de manutenção do projeto:** qualquer nova alteração no `index.html` deve ser acompanhada, na mesma entrega, pelas versões atualizadas de `AI.md` e `README.md`.

### Correção persistente de `altPlacements` — revisão 2

A limpeza auditada de associações secundárias erradas agora é reaplicada após cada sincronização inicial com o Firebase. Isso evita que um valor remoto antigo volte a aparecer depois que uma migração pontual já tenha sido marcada como concluída. A rotina continua limitada aos IDs auditados e ao campo `altPlacements`; nenhum outro dado da lesão é alterado.

### Auditoria de classificações — 2026-09-18

O banco foi auditado globalmente para associações indevidas de sistemas de classificação. Entre 117 lesões com `classification`, **54 atribuições claramente incompatíveis** foram removidas e **63 compatíveis** foram preservadas. A limpeza é idempotente após a sincronização inicial com Firebase e altera exclusivamente `classification` nos IDs auditados.
