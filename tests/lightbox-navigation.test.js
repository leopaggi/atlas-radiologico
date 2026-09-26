'use strict';

// Navegação entre imagens dentro do lightbox (22/09/2026). Escopo: lesão
// atual (openDetail) e galeria do editor (openForm) — Quiz/collage/
// auditoria técnica NÃO foram tocados de propósito (pedido explícito).
// Sem jsdom no projeto: interação de DOM real (clique/teclado) é coberta
// por checagem estática do wiring real; a navegação em si (índice
// anterior/próximo circular, filtragem de imagens sem `data`) é testada
// dinamicamente via funções puras extraídas do index.html.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) { return source.slice(0, index).split('\n').length; }

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) return source.slice(openingBrace, index + 1); }
  }
  throw new Error('Bloco sem fechamento');
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return {
    source: source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace),
    line: lineNumberAt(source, declaration.index)
  };
}

function loadPure() {
  const src = [
    extractFunction(html, 'lightboxNavList').source,
    extractFunction(html, 'lightboxNextIndex').source,
    extractFunction(html, 'lightboxPrevIndex').source,
    extractFunction(html, 'pasteTargetIsText').source
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { lightboxNavList, lightboxNextIndex, lightboxPrevIndex, pasteTargetIsText };', ctx);
  return ctx.__api;
}

const LIGHTBOX_SRC = extractFunction(html, 'openImageLightbox').source;

// ===========================================================================
// 1/2. UMA IMAGEM → SEM SETAS; MÚLTIPLAS → SETAS APARECEM
// ===========================================================================

test('1. lightboxNavList com 1 imagem => hasNav seria false (setas não aparecem)', () => {
  const api = loadPure();
  const list = api.lightboxNavList([{ data: 'https://x/a.jpg', label: 'A' }]);
  assert.equal(list.length, 1);
});

test('2. lightboxNavList com 2+ imagens mantém todas (setas apareceriam)', () => {
  const api = loadPure();
  const list = api.lightboxNavList([
    { data: 'https://x/a.jpg', label: 'A' },
    { data: 'https://x/b.jpg', label: 'B' },
    { data: 'https://x/c.jpg', label: 'C' }
  ]);
  assert.equal(list.length, 3);
});

test('lightboxNavList ignora entradas sem `data` (nunca conta imagem vazia/inválida)', () => {
  const api = loadPure();
  const list = api.lightboxNavList([{ data: 'https://x/a.jpg' }, {}, null, { label: 'sem data' }, { data: '' }]);
  assert.equal(list.length, 1);
});

test('openImageLightbox: setas/contador só renderizam quando há MAIS de 1 imagem (hasNav = navList.length > 1)', () => {
  assert.match(LIGHTBOX_SRC, /const hasNav = navList\.length > 1;/);
  assert.match(LIGHTBOX_SRC, /\$\{hasNav \? `<button type="button" class="lightbox-nav-prev"/);
});

// ===========================================================================
// 3/4. PRÓXIMA E ANTERIOR FUNCIONAM
// ===========================================================================

test('3. lightboxNextIndex avança um índice', () => {
  const api = loadPure();
  assert.equal(api.lightboxNextIndex(0, 3), 1);
  assert.equal(api.lightboxNextIndex(1, 3), 2);
});

test('4. lightboxPrevIndex volta um índice', () => {
  const api = loadPure();
  assert.equal(api.lightboxPrevIndex(2, 3), 1);
  assert.equal(api.lightboxPrevIndex(1, 3), 0);
});

// ===========================================================================
// 5. NAVEGAÇÃO CIRCULAR
// ===========================================================================

test('5. circular: última + próxima -> primeira; primeira + anterior -> última', () => {
  const api = loadPure();
  assert.equal(api.lightboxNextIndex(2, 3), 0, 'última + próxima = primeira');
  assert.equal(api.lightboxPrevIndex(0, 3), 2, 'primeira + anterior = última');
});

test('circular com 0 imagens não quebra (devolve 0, defensivo)', () => {
  const api = loadPure();
  assert.equal(api.lightboxNextIndex(0, 0), 0);
  assert.equal(api.lightboxPrevIndex(0, 0), 0);
});

// ===========================================================================
// 6/8/9. TECLADO: ArrowRight/ArrowLeft e </> — estático (sem jsdom)
// ===========================================================================

test('6/8. ArrowRight e ">" avançam para a próxima imagem', () => {
  assert.match(LIGHTBOX_SRC, /e\.key==='ArrowRight' \|\| e\.key==='>'/);
  assert.match(LIGHTBOX_SRC, /goToLbImage\(lightboxNextIndex\(navIdx, navList\.length\)\)/);
});

test('7/9. ArrowLeft e "<" voltam para a imagem anterior', () => {
  assert.match(LIGHTBOX_SRC, /e\.key==='ArrowLeft' \|\| e\.key==='<'/);
  assert.match(LIGHTBOX_SRC, /goToLbImage\(lightboxPrevIndex\(navIdx, navList\.length\)\)/);
});

test('teclado de navegação só age quando hasNav===true (1 imagem = teclas ignoradas, sem erro)', () => {
  assert.match(LIGHTBOX_SRC, /if\(!hasNav \|\| pasteTargetIsText\(e\.target\)\) return;/);
});

// ===========================================================================
// 10. ESC CONTINUA FECHANDO
// ===========================================================================

test('10. ESC fecha o lightbox, verificado ANTES de qualquer checagem de navegação', () => {
  const escIdx = LIGHTBOX_SRC.indexOf("e.key==='Escape'");
  const navCheckIdx = LIGHTBOX_SRC.indexOf('if(!hasNav');
  assert.ok(escIdx >= 0 && navCheckIdx > escIdx, 'Escape é a primeira checagem do handler de teclado');
  assert.match(LIGHTBOX_SRC, /if\(e\.key==='Escape'\)\{ closeLb\(\); return; \}/);
});

// ===========================================================================
// 11/12. TROCAR IMAGEM RESETA ZOOM E PAN
// ===========================================================================

test('11/12. goToLbImage chama zbReset() (zoomStateInit devolve {s:1,tx:0,ty:0} — reseta escala E posição)', () => {
  assert.match(LIGHTBOX_SRC, /function goToLbImage\(idx\)\{[\s\S]*?zbReset\(\);\s*\}/);
  assert.match(html, /function zoomStateInit\(\)\{ return \{ s:1, tx:0, ty:0 \}; \}/);
});

test('goToLbImage NUNCA fecha/recria a overlay (só troca src/legenda/contador)', () => {
  const fnSrc = LIGHTBOX_SRC.slice(LIGHTBOX_SRC.indexOf('function goToLbImage'), LIGHTBOX_SRC.indexOf('if(hasNav){'));
  assert.doesNotMatch(fnSrc, /closeLb\(\)|createElement|\.remove\(\)|appendChild/);
});

// ===========================================================================
// 13. CONTADOR ATUALIZA
// ===========================================================================

test('13. contador (N / total) é atualizado dentro de goToLbImage', () => {
  assert.match(LIGHTBOX_SRC, /counterEl\.textContent = \(navIdx \+ 1\) \+ ' \/ ' \+ navList\.length;/);
});

// ===========================================================================
// 14. DESCRIÇÃO/CAPTION ATUALIZA
// ===========================================================================

test('14. legenda (lightbox-desc) é atualizada e ocultada quando a nova imagem não tem descrição', () => {
  assert.match(LIGHTBOX_SRC, /descEl\.hidden = !newDesc; descEl\.textContent = newDesc;/);
});

test('descrição vazia por padrão fica com hidden (não deixa caixa vazia visível)', () => {
  assert.match(LIGHTBOX_SRC, /<div class="lightbox-desc" \$\{desc \? '' : 'hidden'\}>/);
});

// ===========================================================================
// 15. NÃO NAVEGA PARA IMAGEM DE OUTRA LESÃO (escopo do conjunto)
// ===========================================================================

test('15. openDetail passa SÓ as imagens da própria lesão (`all`) como conjunto de navegação', () => {
  const src = extractFunction(html, 'openDetail').source;
  assert.match(src, /openImageLightbox\(it\.data, it\.label, all, idx\)/, 'navList = all, o mesmo array já resolvido só para esta lesão (getEntryImgs(e))');
});

test('15. openForm passa SÓ pendingImgs (galeria da própria lesão em edição) como conjunto de navegação', () => {
  const src = extractFunction(html, 'openForm').source;
  assert.match(src, /openImageLightbox\(img\.data, img\.label, pendingImgs, idx\)/);
});

test('15. Quiz compartilha a coleção; modal de imagem e auditoria técnica continuam sem navegação', () => {
  assert.match(html, /st\.answered \? quizImgs : quizImgs\.map\(img=>\(\{\.\.\.img, label:''\}\)\), quizImgIdx,/);
  assert.match(html, /openImageLightbox\(src, img\.label\);/, 'modal de imagem do Quiz intocado');
  assert.match(html, /openImageLightbox\(thumb\.src\);/, 'auditoria técnica de imagens intocada');
});

// ===========================================================================
// 16. CAMPOS DE TEXTO NÃO CAPTURAM AS TECLAS DE NAVEGAÇÃO
// ===========================================================================

test('16. pasteTargetIsText (reaproveitada, não duplicada) bloqueia ArrowLeft/ArrowRight quando o foco está em input/textarea/contenteditable', () => {
  const api = loadPure();
  const fakeInput = { closest: (sel) => (sel.indexOf('input') >= 0 ? {} : null) };
  assert.equal(api.pasteTargetIsText(fakeInput), true);
  const fakeDiv = { closest: () => null };
  assert.equal(api.pasteTargetIsText(fakeDiv), false);
});

test('16 (estático): a mesma função pasteTargetIsText já usada no editor é reaproveitada, nenhuma lógica nova duplicada', () => {
  assert.match(LIGHTBOX_SRC, /pasteTargetIsText\(e\.target\)/);
  const occurrences = (html.match(/function pasteTargetIsText/g) || []).length;
  assert.equal(occurrences, 1, 'só uma definição no arquivo inteiro — sem duplicação');
});

// ===========================================================================
// 7. NÃO ALTERAR zoom/pan/Cloudinary/assignedAt/DATA/sync/clinicalCases/
//    quiz/collage/ownership — só navegação do lightbox
// ===========================================================================

test('REGRESSAO: zoom (LIGHTBOX_ZOOM_*, zoomAtPoint, clampZoomPan) permanece intacto', () => {
  assert.match(html, /const LIGHTBOX_ZOOM_MIN = 1;/);
  assert.match(html, /const LIGHTBOX_ZOOM_MAX = 20;/);
  assert.match(LIGHTBOX_SRC, /function zbStep\(factor\)/);
  assert.match(LIGHTBOX_SRC, /stage\.addEventListener\('wheel'/);
});

test('REGRESSAO: navegação nunca toca DATA/saveData/Cloudinary/assignedAt', () => {
  assert.doesNotMatch(LIGHTBOX_SRC, /\bDATA\b/);
  assert.doesNotMatch(LIGHTBOX_SRC, /saveData\(|pushToFirebaseNow\(/);
  assert.doesNotMatch(LIGHTBOX_SRC, /uploadToCloudinary|cloudinary\.com\/.*upload|assignedAt/);
});

test('REGRESSAO: navegação nunca referencia quiz/collage (fora de escopo desta entrega)', () => {
  assert.doesNotMatch(LIGHTBOX_SRC, /quizImgIdx|quiz-carousel|openCollageBuilder|panels/i);
});
