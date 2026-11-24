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
    fn(us, 'cleanText'), fn(us, 'radiopaediaFullImageUrl'), fn(us, 'radiopaediaImageId'), fn(us, 'radiopaediaBestImageUrl'), fn(us, 'collectImageCandidates')].join('\n');
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

test('12. outros formatos reais de imagem (caso galactocele): aceita, sobe _gallery e ignora banner/ícone', () => {
  const c = usCtx();
  const H = 'https://prod-images-static.radiopaedia.org/';
  assert.equal(c.radiopaediaBestImageUrl(H + 'images/56133843/0..png'), H + 'images/56133843/0..png');
  assert.equal(c.radiopaediaBestImageUrl(H + 'images/56133848/0._big_gallery.jpeg'), H + 'images/56133848/0._big_gallery.jpeg');
  assert.equal(c.radiopaediaBestImageUrl(H + 'images/56133845/2._gallery.jpeg'), H + 'images/56133845/2._big_gallery.jpeg');
  assert.equal(c.radiopaediaBestImageUrl(H + 'images/76198237/dr-thumb.jpg'), H + 'images/76198237/dr-original.jpg');
  assert.equal(c.radiopaediaBestImageUrl(H + 'promotional_banner_images/3565/WL-DESK_case-read-1584-monteggia.png'), '');
  assert.equal(c.radiopaediaBestImageUrl('https://prod-assets-static.radiopaedia.org/assets/logo.png'), '');
});

test('13. dois exames de 1 imagem cada: rótulo pela modalidade quando não há título, e mesma imagem em 2 tamanhos conta 1 vez', () => {
  const c = usCtx();
  const H = 'https://prod-images-static.radiopaedia.org/';
  const st = (modality, srcs) => ({
    querySelector: (sel) => sel === 'h2' ? null : (sel === '.study-modality' ? { innerText: modality } : null),
    querySelectorAll: (sel) => sel === 'img' ? srcs.map(img) : []
  });
  const r = c.collectImageCandidates(root([st('ultrasound', [H + 'images/56133848/0._big_gallery.jpeg', H + 'images/56133848/0._gallery.jpeg']), st('pathology', [H + 'images/56133843/0..png'])]));
  assert.equal(r.items.length, 2);
  assert.deepEqual(Array.from(r.items.map(x => x.seq)), ['ultrasound', 'pathology']);
  assert.equal(r.items[0].fallback, H + 'images/56133848/0._big_gallery.jpeg');
});

// ---------- nome legível no Cloudinary ----------
function pidCtx() {
  const ctx = vm.createContext({});
  vm.runInContext(fn(html, 'cloudinaryPublicIdForLesion') + '\nthis.f = cloudinaryPublicIdForLesion;', ctx);
  return ctx.f;
}
test('14. arquivo no Cloudinary leva o nome da lesão (sem acento, minúsculo, único)', () => {
  const f = pidCtx();
  const a = f('Carcinoma ductal in situ (CDIS)', 1795470000000);
  assert.match(a, /^carcinoma-ductal-in-situ-cdis-[a-z0-9]+$/);
  assert.notEqual(f('Fibroadenoma', 1), f('Fibroadenoma', 1), 'sufixo aleatório evita colisão');
  assert.match(f('Hérnia de Spiegel / ação', 5), /^hernia-de-spiegel-acao-/);
  assert.equal(f('', 1), '');
  assert.equal(f(null, 1), '');
  assert.ok(f('x'.repeat(200), 1).length <= 60 + 1 + 12);
});

test('15. upload usa public_id legível e reenvia sem ele se o preset recusar', () => {
  const i0 = html.indexOf('async function uploadToCloudinary(');
  const up = html.slice(i0, html.indexOf('function openCloudinarySettings', i0));
  assert.match(up, /cloudinaryPublicIdForLesion\(lesion\.name\)/);
  assert.match(up, /fd\.append\('public_id',publicId\)/);
  assert.match(up, /buildForm\(false\)/);
  assert.match(up, /lesion_name='\+lesion\.name/, 'metadado do nome continua');
});

// ---------- modal: caminho com imagens ----------
test('16. com imagens pendentes: abre na aba "Vincular", oferece "Vincular caso e adicionar imagens" e avisa quantas imagens', () => {
  assert.match(html, /setExternalMode\(\(typeof externalImagesPendingFor === 'function' && externalImagesPendingFor\(draft\)\) \? 'link' : 'new'\);/);
  assert.match(html, /📸 Vincular caso e adicionar imagens/);
  assert.match(html, /externalMatchesHtml\(matches, draft\)/);
  assert.match(html, /externalMatchesHtml\(fresh, draft\)/);
  assert.match(html, /imagem\(ns\) do Radiopaedia prontas/);
});

test('17. externalImagesPendingFor: só vale para o MESMO caso e dentro de 30 min', () => {
  const ctx = vm.createContext({ Date });
  vm.runInContext(['let pendingExternalImages = null;',
    'function sameExternalUrl(a,b){ return String(a).replace(/[?#].*$/,"").replace(/\\/$/,"") === String(b).replace(/[?#].*$/,"").replace(/\\/$/,""); }',
    fn(html, 'externalImagesPendingFor'),
    'this.set = (p) => { pendingExternalImages = p; }; this.f = externalImagesPendingFor;'].join('\n'), ctx);
  const url = 'https://radiopaedia.org/cases/galactocele-7';
  assert.equal(ctx.f({ sourceUrl: url }), false, 'sem pendência');
  ctx.set({ sourceUrl: url + '#image-1', images: [{}], at: Date.now() });
  assert.equal(ctx.f({ sourceUrl: url }), true);
  assert.equal(ctx.f({ sourceUrl: 'https://radiopaedia.org/cases/outro' }), false, 'outro caso');
  ctx.set({ sourceUrl: url, images: [{}], at: Date.now() - 31 * 60 * 1000 });
  assert.equal(ctx.f({ sourceUrl: url }), false, 'expirou');
});

// ---------- 1.5.2: lista completa do exame (annotated_viewer_json) ----------
function jsonCtx(fetchImpl) {
  const ctx = vm.createContext({ fetch: fetchImpl, Promise });
  const code = ['var MAX_FIELD = 500;', 'var IMG_MAX_COUNT = 8;',
    "var IMG_BASE = 'https://prod-images-static.radiopaedia.org/images/';",
    'var SKIP_MODALITIES = /patholog|histolog|photograph|illustration|diagram/i;',
    fn(us, 'cleanText'), fn(us, 'pickFrames'), fn(us, 'safeImageFile'), fn(us, 'imagesFromStudyJson'),
    fn(us, 'studyIdsFromPage'), fn(us, 'collectImagesViaStudyJson')].join('\n');
  vm.runInContext(code, ctx);
  return ctx;
}
// JSON REAL do caso galactocele (resposta colada pelo usuário), reduzido ao essencial
const GALACTO_US = { study: { id: 112138, modality: 'Ultrasound', series: [{
  stack_root_id: 56133845, frames: [{ id: 56133843 }, { id: 56133844 }, { id: 56133845, current: true }, { id: 56133846 }, { id: 56133847 }],
  encodings: { thumbnailed_files: [0, 1, 2, 3, 4].map(n => ({ thumb: `${n}._thumb.jpeg`, small: `${n}._small.jpeg`, tiny: `${n}._tiny.jpeg`, original: `${n}..png` })) } }] } };
const GALACTO_PATH = { study: { id: 112359, modality: 'Pathology', series: [{ frames: [{ id: 56133848 }], encodings: { thumbnailed_files: [{ original: '0..png' }] } }] } };

test('18. exame real (5 imagens de US): usa o nome do arquivo original de cada quadro', () => {
  const c = jsonCtx(null);
  const r = c.imagesFromStudyJson(GALACTO_US, 8, '');
  assert.equal(r.items.length, 5);
  assert.equal(r.total, 5);
  assert.equal(r.items[0].full, 'https://prod-images-static.radiopaedia.org/images/56133843/0..png');
  assert.equal(r.items[4].full, 'https://prod-images-static.radiopaedia.org/images/56133847/4..png');
  assert.equal(r.items[2].fallback, 'https://prod-images-static.radiopaedia.org/images/56133845/2._small.jpeg');
});

test('19. patologia/foto/ilustração são ignoradas', () => {
  const c = jsonCtx(null);
  assert.equal(c.imagesFromStudyJson(GALACTO_PATH, 8, '').items.length, 0);
  assert.equal(c.imagesFromStudyJson(GALACTO_PATH, 8, '').skipped, true);
  assert.equal(c.imagesFromStudyJson({ study: { modality: 'Photograph', series: [{ frames: [{ id: 1 }] }] } }, 8, '').skipped, true);
});

test('20. exame com muitas imagens: 8 espaçadas ao longo do exame, incluindo primeira e última', () => {
  const c = jsonCtx(null);
  const frames = Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i }));
  const files = frames.map(() => ({ original: 'dr-original.jpg' }));
  const r = c.imagesFromStudyJson({ study: { modality: 'CT', series: [{ frames, encodings: { thumbnailed_files: files } }] } }, 8, '');
  assert.equal(r.items.length, 8);
  assert.equal(r.total, 100);
  assert.match(r.items[0].full, /\/1000\//);
  assert.match(r.items[7].full, /\/1099\//);
});

test('21. várias séries (RM): uma imagem por série (a "current" ou a do meio), no máximo 8 séries', () => {
  const c = jsonCtx(null);
  const mk = (base, n, cur) => ({ frames: Array.from({ length: n }, (_, i) => ({ id: base + i, current: i === cur })), encodings: { thumbnailed_files: Array.from({ length: n }, () => ({ original: 'dr-original.jpg' })) } });
  const r = c.imagesFromStudyJson({ study: { modality: 'MRI', series: [mk(100, 30, 7), mk(200, 31, -1), mk(300, 5, -1)] } }, 8, '');
  assert.equal(r.items.length, 6, '8 / 3 séries = 2 por série');
  const r1 = c.imagesFromStudyJson({ study: { modality: 'MRI', series: [mk(100, 30, 7), mk(200, 31, -1), mk(300, 5, -1), mk(400, 5, -1), mk(500, 5, -1), mk(600, 5, -1), mk(700, 5, -1), mk(800, 5, -1), mk(900, 5, -1), mk(1000, 5, -1)] } }, 8, '');
  assert.equal(r1.items.length, 8, 'mais de 8 séries: 1 por série até 8');
  assert.match(r1.items[0].full, /\/107\//, 'usa o quadro "current" quando existe');
  assert.match(r1.items[1].full, /\/215\//, 'sem "current": o do meio');
});

test('22. nome de arquivo suspeito é descartado (cai para dr-original.jpg)', () => {
  const c = jsonCtx(null);
  const r = c.imagesFromStudyJson({ study: { modality: 'X-ray', series: [{ frames: [{ id: 7 }], encodings: { thumbnailed_files: [{ original: '../../x?y=1', small: 'ok.jpeg' }] } }] } }, 8, '');
  assert.match(r.items[0].full, /\/7\/dr-original\.jpg$/);
  const bad = c.imagesFromStudyJson({ study: { modality: 'X-ray', series: [{ frames: [{ id: 'abc' }] }] } }, 8, '');
  assert.equal(bad.items.length, 0);
});

test('23. leitura pela página: pega os ids dos exames, busca o JSON de cada um, só rótulo quando há mais de um exame útil', async () => {
  const urls = [];
  const fetchStub = (u) => { urls.push(u); const j = u.includes('112138') ? GALACTO_US : GALACTO_PATH; return Promise.resolve({ ok: true, json: () => Promise.resolve(j) }); };
  const c = jsonCtx(fetchStub);
  const doc = { querySelectorAll: (sel) => sel === '.main-study-desc' ? [{ id: 'study-112138' }, { id: 'study-112359' }, { id: 'outro' }] : [] };
  assert.deepEqual(Array.from(c.studyIdsFromPage(doc)), ['112138', '112359']);
  const found = await c.collectImagesViaStudyJson(doc);
  assert.equal(found.items.length, 5, 'só o ultrassom; patologia fora');
  assert.equal(found.items[0].seq, '', 'um exame útil só: sem rótulo');
  assert.ok(urls.every(u => u.startsWith('/studies/') && u.includes('annotated_viewer_json.json')));
  // falha total do fetch -> null (usa a coleta antiga da página)
  const c2 = jsonCtx(() => Promise.reject(new Error('rede')));
  assert.equal(await c2.collectImagesViaStudyJson(doc), null);
  // sem exames na página -> null
  assert.equal(await c.collectImagesViaStudyJson({ querySelectorAll: () => [] }), null);
});

test('24. botão usa a lista completa e cai para a coleta da página se ela falhar', () => {
  const f = fn(us, 'sendToAtlasWithImages');
  assert.match(f, /collectImagesViaStudyJson\(document\)\.catch/);
  assert.match(f, /found = collectImageCandidates\(document\)/);
  assert.match(us, /\/studies\/' \+ id \+ '\/annotated_viewer_json\.json\?lang=us/);
});
