// Imagens do Radiopaedia -> quadro de imagens (aprovação antes de salvar).
// Cobre: conversão miniatura->versão grande, coleta por série, validação no
// Atlas, teto de ~500 KB do quadro e a fiação (canal -> vínculo -> construtor).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const us = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js'), 'utf8');

function extractBlock(source, openingBrace) {
  let depth = 0, quote = null, escaped = false, lc = false, bc = false;
  for (let i = openingBrace; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lc = true; i++; continue; }
    if (c === '/' && n === '*') { bc = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return source.slice(openingBrace, i + 1); }
  }
  throw new Error('bloco sem fechamento');
}
function fn(source, name) {
  const m = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(m, name + ' existe');
  const ob = source.indexOf('{', m.index + m[0].length);
  return source.slice(m.index, ob) + extractBlock(source, ob);
}

// ---------- userscript ----------
function usCtx() {
  const ctx = vm.createContext({});
  const code = ['var MAX_FIELD = 500;', 'var IMG_MAX_COUNT = 8;',
    fn(us, 'cleanText'), fn(us, 'radiopaediaFullImageUrl'), fn(us, 'collectImageCandidates')].join('\n');
  vm.runInContext(code, ctx);
  return ctx;
}
const img = (src) => ({ currentSrc: src, getAttribute: () => src });
const study = (title, srcs) => ({
  querySelector: (sel) => sel === 'h2' ? { innerText: title } : null,
  querySelectorAll: (sel) => sel === 'img' ? srcs.map(img) : []
});
const root = (studies) => ({ querySelectorAll: (sel) => sel === '.case-study' ? studies : [] });

test('1. miniatura vira versão grande (visualizador novo e antigo); o resto é ignorado', () => {
  const c = usCtx();
  assert.equal(c.radiopaediaFullImageUrl('https://prod-images-static.radiopaedia.org/images/76198237/dr-thumb.jpg'),
    'https://prod-images-static.radiopaedia.org/images/76198237/dr-original.jpg');
  assert.equal(c.radiopaediaFullImageUrl('https://prod-images-static.radiopaedia.org/images/27926411/7f338a73ca8a52b5fda863ab8bb713_thumb.jpeg'),
    'https://prod-images-static.radiopaedia.org/images/27926411/7f338a73ca8a52b5fda863ab8bb713.jpg');
  assert.equal(c.radiopaediaFullImageUrl('https://radiopaedia.org/packs/stack-YQKLCKBI.gif'), '');
  assert.equal(c.radiopaediaFullImageUrl('https://evil.example/images/1/dr-thumb.jpg'), '');
  assert.equal(c.radiopaediaFullImageUrl(''), '');
});

test('2. coleta por série: ignora ícone de stack, remove duplicadas e rotula pelo exame só se houver mais de um', () => {
  const c = usCtx();
  const A = 'https://prod-images-static.radiopaedia.org/images/1/dr-thumb.jpg';
  const B = 'https://prod-images-static.radiopaedia.org/images/2/dr-thumb.jpg';
  const gif = 'https://radiopaedia.org/packs/stack-YQKLCKBI.gif';
  const one = c.collectImageCandidates(root([study('MRI', [A, gif, B, A])]));
  assert.equal(one.items.length, 2);
  assert.equal(one.items[0].seq, '');
  const two = c.collectImageCandidates(root([study('Initial US', [A]), study('FU US after 7 days', [B])]));
  assert.deepEqual(Array.from(two.items.map(x => x.seq)), ['Initial US', 'FU US after 7 days']);
});

test('3. limite de 8 imagens, mas informa o total encontrado', () => {
  const c = usCtx();
  const srcs = Array.from({ length: 11 }, (_, i) => `https://prod-images-static.radiopaedia.org/images/${i + 1}/dr-thumb.jpg`);
  const r = c.collectImageCandidates(root([study('x', srcs)]));
  assert.equal(r.items.length, 8);
  assert.equal(r.total, 11);
});

test('4. userscript: botão novo, ponte leva as imagens e o botão antigo continua igual', () => {
  assert.match(us, /btn\.textContent = '📥 Enviar ao Atlas';/);
  assert.match(us, /imgBtn\.textContent = '📸 Enviar com imagens';/);
  assert.match(us, /@grant\s+GM_xmlhttpRequest/);
  assert.match(us, /@connect\s+prod-images-static\.radiopaedia\.org/);
  assert.match(us, /payload: payload, images: images \|\| null/);
  assert.match(us, /payload: v\.payload, images: v\.images \|\| null/);
});

// ---------- Atlas ----------
function atlasCtx() {
  const ctx = vm.createContext({});
  const code = ['const EXTERNAL_IMAGES_MAX_COUNT = 8;', 'const EXTERNAL_IMAGE_MAX_CHARS = 900 * 1024;',
    'const EXTERNAL_IMAGES_MAX_TOTAL_CHARS = 5 * 1024 * 1024;', 'let pendingExternalImages = null;',
    fn(html, 'validateExternalImages'), fn(html, 'setPendingExternalImages'),
    'this.v = validateExternalImages; this.set = setPendingExternalImages; this.get = () => pendingExternalImages;'].join('\n');
  vm.runInContext(code, ctx);
  return ctx;
}
const good = (n) => 'data:image/jpeg;base64,' + 'A'.repeat(n);

test('5. Atlas só aceita imagens JPEG/PNG/WEBP em data URL, até 8, com teto de tamanho', () => {
  const c = atlasCtx();
  const out = c.v([{ url: good(100), seq: ' RM T2 ' }, { url: 'https://evil.example/x.jpg' }, { url: 'data:text/html;base64,AAAA' },
    { url: good(900 * 1024) }, null, { url: 5 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].seq, 'RM T2');
  assert.equal(c.v('x').length, 0);
  assert.equal(c.v(Array.from({ length: 12 }, () => ({ url: good(50) }))).length, 8);
  const big = Array.from({ length: 8 }, () => ({ url: good(800 * 1024) }));
  assert.ok(c.v(big).length <= 6, 'teto total de ~5 MB');
});

test('6. imagens ficam só em memória e sem imagem válida não fica pendência', () => {
  const c = atlasCtx();
  assert.equal(c.set('https://radiopaedia.org/cases/x', [{ url: good(10) }]), 1);
  assert.equal(c.get().images.length, 1);
  assert.equal(c.set('https://radiopaedia.org/cases/x', [{ url: 'nada' }]), 0);
  assert.equal(c.get(), null);
});

// ---------- teto de 500 KB ----------
function encodeCtx(sizeFor) {
  const ctx = vm.createContext({ document: { createElement: () => makeCanvas(sizeFor) } });
  vm.runInContext('const COLLAGE_MAX_BYTES = 500 * 1024;\n' + fn(html, 'collageEncodeUnderLimit') + '\nthis.enc = collageEncodeUnderLimit;', ctx);
  return ctx;
}
function makeCanvas(sizeFor, w = 1920, h = 1000) {
  const cv = { width: w, height: h, getContext: () => ({ drawImage() {} }) };
  cv.toBlob = (cb, type, q) => cb({ size: sizeFor(cv.width, q), q, w: cv.width });
  return cv;
}

test('7. quadro leve já sai com qualidade alta (sem perda desnecessária)', async () => {
  const c = encodeCtx(() => 200 * 1024);
  const b = await c.enc(makeCanvas(() => 200 * 1024));
  assert.equal(b.q, 0.92);
});

test('8. quadro pesado é comprimido até caber em 500 KB', async () => {
  const f = (w, q) => Math.round(w * 1000 * q * 0.6);   // proporcional à qualidade e à largura
  const c = encodeCtx(f);
  const b = await c.enc(makeCanvas(f));
  assert.ok(b.size <= 500 * 1024, 'ficou em ' + b.size);
});

test('9. se qualidade não basta, reduz a resolução; se nada basta, devolve o melhor esforço sem falhar', async () => {
  const f = (w, q) => Math.round(w * 1000 * (0.5 + q) * 0.8);
  const c = encodeCtx(f);
  const b = await c.enc(makeCanvas(f));
  assert.ok(b.w < 1920, 'reduziu resolução');
  const c2 = encodeCtx(() => 9e6);
  const b2 = await c2.enc(makeCanvas(() => 9e6));
  assert.ok(b2 && b2.size === 9e6, 'devolve o último resultado em vez de falhar');
});

// ---------- fiação ----------
test('10. construtor aceita imagens pré-carregadas e pode omitir painéis; usa o teto de tamanho', () => {
  assert.match(html, /function openCollageBuilder\(lesionMeta, onCollageReady, existingPanels, deferUpload, existingLabel, opts\)/);
  assert.match(html, /opts\.preload\.filter/);
  assert.match(html, /\(opts && opts\.omitPanels\) \? \[\]/);
  assert.match(html, /finalBlob=await collageEncodeUnderLimit\(canvas\);/);
  assert.doesNotMatch(html, /canvas\.toBlob\(b=>res\(b\), 'image\/jpeg', \.92\)/);
});

test('11. canal recebe imagens, vínculo do caso abre o construtor e nada salva antes do "concluído"', () => {
  assert.match(html, /setPendingExternalImages\(data\.payload\.sourceUrl, data\.images\)/);
  assert.match(html, /try \{ openPendingExternalImagesFor\(entry, draft\); \}/);
  assert.match(html, /function openQuizAddImageModal\(lesionId, onImagesAdded, opts\)/);
  const open = fn(html, 'openPendingExternalImagesFor');
  assert.match(open, /sameExternalUrl\(pend\.sourceUrl, draft\.sourceUrl\)/);
  assert.match(open, /openQuizAddImageModal\(entry\.id/);
  assert.doesNotMatch(open, /saveData|uploadToCloudinary/);
});
