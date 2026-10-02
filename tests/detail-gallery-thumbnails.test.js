'use strict';

// UX — "simplificar miniaturas na visão panorâmica": a galeria de imagens
// do detalhe principal da lesão (renderDetailGallery, dentro de openDetail)
// passou a mostrar SOMENTE a imagem — sem a legenda/descrição
// (.detail-img-label) nem o botão "🔗 Vincular a…" por baixo da miniatura.
// Nenhum dado é apagado (img.label/imageRefs/clinicalCases continuam
// intactos): é só apresentação. A descrição continua disponível no
// lightbox (clique na miniatura) e no editor (openForm), que têm sua
// própria renderização independente desta galeria — nunca tocados aqui.
// Mesmo padrão de extração de código-fonte real + vm das demais suítes do
// projeto; nenhuma reimplementação.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
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
function extractFunction(name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = html.indexOf('{', declaration.index + declaration[0].length);
  return html.slice(declaration.index, openingBrace) + extractBlock(html, openingBrace);
}
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

const openDetailSrc = extractFunction('openDetail');
const openFormSrc = extractFunction('openForm');
const openImageLightboxSrc = extractFunction('openImageLightbox');

/* ===================== 1. visão panorâmica mostra só a imagem ===================== */

test('1. renderDetailGallery: o template da miniatura é EXATAMENTE a <img>, nada mais dentro de .detail-img-item', () => {
  assert.match(
    openDetailSrc,
    /gal\.innerHTML=all\.map\(\(img,i\)=>`<div class="detail-img-item"><img src="\$\{img\.data\}" data-idx="\$\{i\}"><\/div>`\)\.join\(''\);/
  );
});

test('2. renderDetailGallery: renderização REAL com dados sintéticos produz só <img> dentro de cada item (prova de template, não só regex)', () => {
  const all = [
    { data: 'a.png', label: 'achado X' },
    { data: 'b.png', label: '' },
    { data: 'c.png' } // sem label nenhum
  ];
  // avalia a EXATA expressão de template extraída acima, sem reimplementar.
  const m = openDetailSrc.match(/gal\.innerHTML=(all\.map\([\s\S]*?\.join\(''\));/);
  assert.ok(m, 'expressão de template não encontrada');
  const fn = new Function('all', 'return ' + m[1] + ';');
  const out = fn(all);
  assert.equal((out.match(/<div class="detail-img-item">/g) || []).length, 3);
  assert.equal((out.match(/<img /g) || []).length, 3);
  assert.ok(!out.includes('detail-img-label'));
  assert.ok(!out.includes('achado X'), 'o label não deveria aparecer no HTML desta galeria, mesmo existindo no dado');
  assert.ok(!/<button/.test(out), 'nenhum botão (vincular ou outro) deveria aparecer');
});

/* ===================== 2. descrição não aparece sob a miniatura ===================== */

test('3. renderDetailGallery: sem referência a detail-img-label (legenda) em nenhuma forma', () => {
  assert.doesNotMatch(openDetailSrc, /detail-img-label/);
});

/* ===================== 3. botão/controle de vínculo não aparece nessa visão ===================== */

test('4. renderDetailGallery: sem imageLinkButtonHtml nem wiring de data-link-idx (botão 🔗 Vincular removido desta view)', () => {
  assert.doesNotMatch(openDetailSrc, /imageLinkButtonHtml/);
  assert.doesNotMatch(openDetailSrc, /data-link-idx/);
  assert.doesNotMatch(openDetailSrc, /openImageLinkPicker/);
});

/* ===================== 4. descrição continua no lightbox ===================== */

test('5. clique na miniatura continua abrindo o lightbox passando it.label (descrição não se perde, só não aparece aqui)', () => {
  assert.match(
    openDetailSrc,
    /const idx=\+imgEl\.dataset\.idx; const it=all\[idx\]; openImageLightbox\(it\.data, it\.label, all, idx, null, \(item\)=>clinicalCaseLinkedToImage\(cur, item\)\);/
  );
});

test('6. openImageLightbox continua aceitando/exibindo a descrição (parâmetro "description" intacto)', () => {
  assert.match(openImageLightboxSrc, /function openImageLightbox\(src, description, navImages, startIndex, onNavigate, resolveClinicalCase\)/);
  assert.match(openImageLightboxSrc, /lightbox-desc/);
});

/* ===================== 5. editor continua mostrando descrição ===================== */

test('7. openForm (editor): a galeria de imagens continua com o <textarea> de legenda/descrição', () => {
  assert.match(openFormSrc, /<textarea class="img-gallery-label" rows="3"/);
});

test('8. openForm (editor): o botão 🔗 Vincular a… continua existindo (data-form-link), independente da galeria do detalhe', () => {
  assert.match(openFormSrc, /imageLinkButtonHtml\(\{cases:clinicalCasesDraft, signs:radiologicSignsDraft, schemes:classificationSchemesDraft\}, img, 'data-form-link="1"'\)/);
});

/* ===================== 6. dados permanecem intactos ===================== */

// A galeria em si (renderDetailGallery, dentro do .then(imgs=>{...}) de
// getEntryImgs) é só uma FATIA de openDetail — o resto da função (editar,
// excluir, marcar revisão) legitimamente chama saveData() em outros
// fluxos, sem relação com a galeria. Isolamos só a fatia da galeria pra
// não acusar falso positivo.
const galleryRegionStart = openDetailSrc.indexOf('getEntryImgs(e).then(imgs=>{');
const galleryRegionEnd = openDetailSrc.indexOf('renderDetailGallery();', galleryRegionStart) + 'renderDetailGallery();'.length;
assert.ok(galleryRegionStart >= 0 && galleryRegionEnd > galleryRegionStart, 'região da galeria não encontrada em openDetail');
const galleryRegion = stripJsComments(openDetailSrc.slice(galleryRegionStart, galleryRegionEnd));

test('9. renderDetailGallery nunca apaga/reescreve img.label, imageRefs ou clinicalCases (só lê, nunca atribui)', () => {
  assert.ok(!/img\.label\s*=/.test(galleryRegion), 'não deveria haver nenhuma atribuição a img.label');
  assert.ok(!/\.imageRefs\s*=/.test(galleryRegion), 'não deveria haver nenhuma atribuição a imageRefs');
  assert.ok(!/\.clinicalCases\s*=/.test(galleryRegion), 'não deveria haver nenhuma atribuição a clinicalCases');
  assert.ok(!/delete\s+\w+\.label/.test(galleryRegion));
});

test('10. renderDetailGallery nunca chama saveData()/Firestore/localStorage (presentation-only, zero persistência nova)', () => {
  assert.ok(!/saveData\s*\(/.test(galleryRegion));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(galleryRegion));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(galleryRegion));
});

test('11. clinicalCaseLinkedToImage (resolvedor do lightbox) continua recebendo os mesmos dados — vínculo clínico intacto nos dados', () => {
  // mesma chamada de antes, inalterada: o vínculo clínico (093d) continua
  // funcionando por trás, só não tem mais um atalho de botão nesta galeria.
  assert.match(openDetailSrc, /clinicalCaseLinkedToImage\(cur, item\)/);
});
