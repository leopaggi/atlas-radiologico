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
