'use strict';
// Tradução EN -> PT da descrição do quadro (tradutor embutido do Chrome).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function block(name, kind) {
  const start = html.indexOf((kind || 'function ') + name + '(');
  assert.ok(start >= 0, name + ' existe');
  let i = html.indexOf('{', start), depth = 0;
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}') { depth--; if (!depth) break; } }
  return html.slice(start, i + 1);
}
function load(globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals || {}));
  vm.runInContext('let __ptTranslatorPromise = null;\n' + block('getPtTranslator', 'async function ') + '\n' + block('translateDescriptionToPt', 'async function ') + '\nthis.g = getPtTranslator; this.t = translateDescriptionToPt;', ctx);
  return ctx;
}
const fake = { translate: async s => '[PT] ' + s };

test('traduz só o texto das linhas; rótulos em negrito, "Fonte:" e links ficam intactos; linhas vazias preservadas', async () => {
  const c = load();
  const src = '**Achados de imagem (CT):** Large pleural effusion.\n**Legenda:** Split pleura sign.\n\n**Discussão:** Empyema is a collection.\nFonte: Radiopaedia — Pleural empyema, dr x — https://radiopaedia.org/cases/x\nhttps://radiopaedia.org/cases/x';
  const out = await c.t(src, fake);
  assert.equal(out, '**Achados de imagem (CT):** [PT] Large pleural effusion.\n**Legenda:** [PT] Split pleura sign.\n\n**Discussão:** [PT] Empyema is a collection.\nFonte: Radiopaedia — Pleural empyema, dr x — https://radiopaedia.org/cases/x\nhttps://radiopaedia.org/cases/x');
});

test('texto vazio ou só com rótulo não chama o tradutor', async () => {
  const c = load();
  let n = 0;
  const tr = { translate: async s => { n++; return s; } };
  assert.equal(await c.t('', tr), '');
  assert.equal(await c.t('**Discussão:** ', tr), '**Discussão:** ');
  assert.equal(n, 0);
});

test('sem tradutor no navegador: getPtTranslator devolve null (nada quebra)', async () => {
  assert.equal(await load().g(false), null);
  assert.equal(await load({ Translator: { availability: async () => 'unavailable' } }).g(true), null);
});

test('idioma ainda não baixado: só cria o tradutor quando o usuário clicou (allowDownload)', async () => {
  let created = 0;
  const T = { availability: async () => 'downloadable', create: async () => { created++; return fake; } };
  const c = load({ Translator: T });
  assert.equal(await c.g(false), null);
  assert.equal(created, 0);
  assert.equal(await c.g(true), fake);
  assert.equal(created, 1);
});

test('idioma já instalado: cria direto, sem exigir clique, e reaproveita', async () => {
  let created = 0;
  const T = { availability: async () => 'available', create: async () => { created++; return fake; } };
  const c = load({ Translator: T });
  assert.equal(await c.g(false), fake);
  assert.equal(await c.g(false), fake);
  assert.equal(created, 1);
});

test('fiação no construtor: botão traduzir + tradução automática só se o idioma já está instalado e o texto não foi editado', () => {
  assert.match(html, /id="collage-translate-btn"/);
  assert.match(html, /await getPtTranslator\(true\)/);
  assert.match(html, /await getPtTranslator\(false\); \/\/ automático/);
  assert.match(html, /if\(cov\.isConnected && dEl\.value === init\)/);
});

test('botão copiar p/ IA: prompt com o texto cru no lugar de <colar aqui> (sem ** e __)', () => {
  assert.match(html, /id="collage-ai-btn"/);
  const m = html.match(/const AI_FORMAT_PROMPT = (".*");\nfunction buildAiFormatPrompt[^\n]*/);
  assert.ok(m, 'prompt presente');
  const ctx = vm.createContext({});
  vm.runInContext(m[0] + '\nthis.f = buildAiFormatPrompt;', ctx);
  const out = ctx.f('**Achados de imagem:** lesion __x__ $& end');
  assert.ok(out.includes('Achados de imagem: lesion x $& end'));
  assert.ok(!out.includes('<colar aqui>'));
  assert.ok(out.includes('Discussão do caso'));
});

test('traduz bullets "- **TC:** texto" mantendo hífen e rótulo em negrito', async () => {
  const c = load({});
  const tr = { translate: async (t) => '[PT] ' + t };
  const out = await c.t('- **TC:** Round nodule.\n- **RM:** Signal drop.\n- **Discussão do caso:** Adenoma.', tr);
  assert.equal(out, '- **TC:** [PT] Round nodule.\n- **RM:** [PT] Signal drop.\n- **Discussão do caso:** [PT] Adenoma.');
});

test('botão copiar p/ IA fica na barra do quadro (e não repetido por imagem com id duplicado)', () => {
  const idCount = (html.match(/id="collage-ai-btn"/g) || []).length;
  assert.equal(idCount, 1);
  const tb = html.slice(html.indexOf('aria-label="Formatação da descrição"'));
  assert.ok(tb.slice(0, 1200).includes('id="collage-ai-btn"'), 'botão dentro da barra do quadro');
});

test('tradução disponível também depois de enviada: galeria, editor de legenda e lightbox', () => {
  assert.equal((html.match(/class="rich-text-btn legend-translate-btn"/g) || []).length, 2);
  assert.equal((html.match(/wireTranslateToggle\(labelInput,/g) || []).length, 2);
  assert.match(html, /class="lightbox-translate rich-text-btn"/);
  assert.match(html, /lbOriginalDesc = cur; descTextEl\.innerHTML = richDescHtml\(out\)/);
  assert.match(html, /lbResetTranslate\(\);\n\s*const old|lbResetTranslate\(\);\n    if\(descTextEl\)/);
});
