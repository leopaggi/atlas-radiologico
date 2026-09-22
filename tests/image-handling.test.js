'use strict';

// Paste em área ampla + zoom profundo do lightbox (UX 2026-09-21).
// Só stdlib (padrão do projeto): extrai do index.html real, roda em vm.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
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
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  throw new Error('Bloco sem fechamento');
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace);
}

function extractConst(source, name) {
  const declaration = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  const semi = source.indexOf(';', declaration.index);
  return source.slice(declaration.index, semi + 1);
}

function loadZoom() {
  const src = [
    extractConst(html, 'LIGHTBOX_ZOOM_MIN'),
    extractConst(html, 'LIGHTBOX_ZOOM_MAX'),
    extractConst(html, 'LIGHTBOX_ZOOM_WHEEL'),
    extractConst(html, 'LIGHTBOX_ZOOM_STEP'),
    extractFunction(html, 'zoomStateInit'),
    extractFunction(html, 'clampZoomPan'),
    extractFunction(html, 'zoomAtPoint'),
    extractFunction(html, 'pasteTargetIsText')
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { zoomStateInit, clampZoomPan, zoomAtPoint, pasteTargetIsText, LIGHTBOX_ZOOM_MIN, LIGHTBOX_ZOOM_MAX };', ctx);
  return ctx.__api;
}

const fakeEl = (tag) => ({
  tagName: tag,
  closest(sel) {
    const parts = sel.split(',');
    for (const p of parts) {
      const t = p.trim().toLowerCase();
      if (t === 'input' && ['input'].includes(this.tagName)) return this;
      if (t === 'textarea' && this.tagName === 'textarea') return this;
      if (t === 'select' && this.tagName === 'select') return this;
      if (t === '[contenteditable="true"]' && this.editable) return this;
    }
    return null;
  }
});

const LAY = { stageW: 800, stageH: 600, imgW: 400, imgH: 300 };
const CENTER = { x: 400, y: 300 };

// ============================ PASTE (1-8) ============================

test('1. zona de paste cobre a seção (listener no field, não só na caixinha)', () => {
  const src = extractFunction(html, 'openForm');
  assert.match(src, /id="images-field"/);
  assert.match(src, /imagesField\.addEventListener\('paste'/);
  assert.match(src, /Ctrl\+V para colar imagem/);
});

test('2. paste em qualquer parte da zona usa o pipeline (addLocalFile)', () => {
  const src = extractFunction(html, 'openForm');
  const i = src.indexOf("imagesField.addEventListener('paste'");
  assert.notEqual(i, -1);
  const win = src.slice(i, i + 900);
  assert.match(win, /addLocalFile\(f\)/);
  assert.match(win, /for\(const f of files\)/);
});

test('3. textarea mantém paste textual normal', () => {
  const api = loadZoom();
  assert.equal(api.pasteTargetIsText(fakeEl('textarea')), true);
  const src = extractFunction(html, 'openForm');
  assert.match(src, /if\(pasteTargetIsText\(e\.target\)\) return;/);
});

test('4. input mantém paste textual normal', () => {
  const api = loadZoom();
  assert.equal(api.pasteTargetIsText(fakeEl('input')), true);
  assert.equal(api.pasteTargetIsText(fakeEl('select')), true);
  const ed = fakeEl('div');
  ed.editable = true;
  assert.equal(api.pasteTargetIsText(ed), true);
  assert.equal(api.pasteTargetIsText(fakeEl('div')), false);
  assert.equal(api.pasteTargetIsText(null), false);
});

test('5. clipboard só texto não cria imagem', () => {
  const src = extractFunction(html, 'openForm');
  const i = src.indexOf("imagesField.addEventListener('paste'");
  const win = src.slice(i, i + 900);
  assert.match(win, /if\(files\.length\)/, 'só age com arquivo de imagem');
  assert.match(win, /startsWith\('image\/'\)/, 'filtra por tipo imagem');
});

test('6. imagem continua pendente até Salvar (sem upload no paste)', () => {
  const src = extractFunction(html, 'openForm');
  const i = src.indexOf("imagesField.addEventListener('paste'");
  const win = src.slice(i, i + 900);
  assert.doesNotMatch(win, /uploadToCloudinary|uploadPendingImage/, 'paste nunca envia');
  assert.match(src, /imgBox\.addEventListener\('paste'[\s\S]{0,400}?addLocalFile\(f\)/, 'caixinha original preservada');
});

test('7. duas imagens coladas sucessivamente funcionam (loop, sem sobrescrever)', () => {
  const src = extractFunction(html, 'openForm');
  assert.match(src, /for\(const f of files\) addLocalFile\(f\)/);
});

test('8. cancelar não faz upload (cancela só libera blobs)', () => {
  const src = extractFunction(html, 'openForm');
  const i = src.indexOf("f-cancel').onclick");
  const win = src.slice(i, i + 300);
  assert.match(win, /releasePendingObjectUrls/);
  assert.doesNotMatch(win, /uploadToCloudinary|saveData/);
});

// ============================ ZOOM (9-18) ============================

test('9. zoom in aumenta a escala', () => {
  const api = loadZoom();
  const r = api.zoomAtPoint(api.zoomStateInit(), LAY, CENTER, 1.25);
  assert.ok(r.s > 1 && r.s <= 20);
});

test('10. zoom out diminui (com piso no fit)', () => {
  const api = loadZoom();
  const z = api.zoomAtPoint(api.zoomStateInit(), LAY, CENTER, 4);
  const back = api.zoomAtPoint(z, LAY, CENTER, 0.01);
  assert.equal(back.s, 1, 'não passa do fit');
  assert.deepEqual([back.tx, back.ty], [0, 0]);
});

test('11. máximo permite grande ampliação (2000%)', () => {
  const api = loadZoom();
  assert.equal(api.LIGHTBOX_ZOOM_MAX, 20);
  const r = api.zoomAtPoint(api.zoomStateInit(), LAY, CENTER, 1000);
  assert.equal(r.s, 20, 'trava em 2000%, sem estourar');
});

test('12. pan funciona quando ampliada (com clamp anti-perda)', () => {
  const api = loadZoom();
  const z = api.zoomAtPoint(api.zoomStateInit(), LAY, CENTER, 4);
  const moved = api.clampZoomPan({ s: z.s, tx: z.tx + 50, ty: z.ty - 30 }, LAY);
  assert.equal(moved.tx, z.tx + 50);
  const wild = api.clampZoomPan({ s: z.s, tx: 99999, ty: -99999 }, LAY);
  assert.ok(Math.abs(wild.tx) <= (400 * z.s) / 2 && Math.abs(wild.ty) <= (300 * z.s) / 2);
});

test('13. reset volta ao estado inicial', () => {
  const api = loadZoom();
  const z = api.zoomAtPoint(api.zoomStateInit(), LAY, { x: 100, y: 100 }, 5);
  assert.ok(z.s > 1);
  assert.deepEqual(JSON.parse(JSON.stringify(api.zoomStateInit())), { s: 1, tx: 0, ty: 0 });
});

test('14. duplo clique reseta (fiação presente)', () => {
  const src = extractFunction(html, 'openImageLightbox');
  assert.match(src, /ondblclick/);
  assert.match(src, /zbReset\(\)/);
});

test('15. trocar imagem reseta zoom/pan (estado por abertura)', () => {
  const src = extractFunction(html, 'openImageLightbox');
  assert.match(src, /let zb = zoomStateInit\(\);/, 'cada open cria estado zerado');
  assert.doesNotMatch(src, /zb\.s\s*=/, 'nunca muta campo avulso fora do closure');
});

test('16. fechar/reabrir reseta (sem estado global)', () => {
  const names = ['zbState', 'zoomState', 'lbZoom', 'currentZoom'];
  for (const n of names) {
    assert.equal(new RegExp(`\\b(?:let|var|const)\\s+${n}\\s*=`).test(html), false, n);
  }
  const src = extractFunction(html, 'openImageLightbox');
  assert.match(src, /ov\.remove\(\)/, 'fechar descarta tudo com a overlay');
});

test('17. carrossel continua funcionando (setas/teclado intactos)', () => {
  const src = extractFunction(html, 'openImageLightbox');
  assert.doesNotMatch(src, /quizImgIdx|goPrev|goNext/, 'lightbox não invade o carrossel da questão');
  assert.match(html, /if\(document\.querySelector\('\.quiz-img-modal-overlay, \.quiz-review-modal-overlay, \.lightbox-overlay, \.lesion-form-overlay'\)\) return;/);
});

test('18. ESC continua funcionando (fecha o lightbox)', () => {
  // Ajuste 22/09/2026: o handler dedicado de tecla (antes só ESC, "lbEsc")
  // virou "lbKeydown" ao ganhar também a navegação ArrowLeft/ArrowRight —
  // ESC continua tratado primeiro e sempre fecha, com ou sem navegação.
  const src = extractFunction(html, 'openImageLightbox');
  assert.match(src, /lbKeydown/, 'handler de teclado dedicado');
  assert.match(src, /if\(e\.key==='Escape'\)\{ closeLb\(\); return; \}/, 'ESC sempre fecha, antes de qualquer checagem de navegação');
  assert.match(src, /removeEventListener\('keydown', lbKeydown\)/, 'listener removido ao fechar');
});
