'use strict';

// PROTEÇÃO 088 — contexto clínico / dados do paciente POR IMAGEM
// (`img.clinicalContext` = { presentation, patientAge, patientSex, notes },
// mesmos nomes do caso clínico importado). Informação pré-diagnóstica: no
// Quiz aparece ANTES e depois da resposta; a descrição da imagem (label)
// continua só depois. Funções reais extraídas do index.html.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada no index.html');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}

const limits = /const IMAGE_CLINICAL_CONTEXT_LIMITS = (\{[^}]*\});/.exec(html);
assert.ok(limits, 'IMAGE_CLINICAL_CONTEXT_LIMITS');
const ctx = vm.createContext({});
vm.runInContext('const IMAGE_CLINICAL_CONTEXT_LIMITS = ' + limits[1] + ';\n' +
  ['escAttr', 'esc', 'normalizeImageClinicalContext', 'withNormalizedImageClinicalContext', 'quizImageClinicalContextHtml',
    'quizImageDescHtml', 'stableImageKeyV208', 'imageIdentityKeys'].map((n) => extractFunction(html, n)).join('\n'), ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));

const CTX = { presentation: 'Dor no joelho há 3 semanas após trauma', patientAge: '52', patientSex: 'Masculino', notes: 'Tabagista; febre baixa' };
const LABEL = 'RM PD FAT SAT — ruptura do LCA com edema ósseo';
const IMG = { data: 'https://res.cloudinary.com/x/q.jpg', publicId: 'atlas-radiologico/q', assetId: 'Q', label: LABEL };

// Mesma composição do renderMedia() do Quiz (bloco clínico + descrição gated).
const quizMedia = (img, answered) => ctx.quizImageClinicalContextHtml(img.clinicalContext) + ctx.quizImageDescHtml(img.label, answered);

test('088: imagem antiga sem contexto continua válida (sem campo, sem bloco, sem erro)', () => {
  assert.equal(ctx.normalizeImageClinicalContext(undefined), null);
  assert.equal(ctx.quizImageClinicalContextHtml(undefined), '');
  const copy = plain(ctx.withNormalizedImageClinicalContext(IMG));
  assert.deepEqual(copy, IMG, 'nenhum campo novo é criado');
});

test('088: salva presentation, patientAge, patientSex e notes (trim externo)', () => {
  const out = plain(ctx.normalizeImageClinicalContext({ presentation: '  ' + CTX.presentation + '\n', patientAge: ' 52 ', patientSex: 'Masculino', notes: CTX.notes }));
  assert.deepEqual(out, CTX);
  assert.deepEqual(plain(ctx.normalizeImageClinicalContext({ patientAge: 52 })), { patientAge: '52' }, 'idade numérica vira texto');
});

test('088: vazio/só espaços/lixo não cria campo nem bloco visual', () => {
  for (const v of [{}, { presentation: '   ', notes: '' }, null, [], 'x', { presentation: { a: 1 }, extra: 'ignorado' }]) {
    assert.equal(ctx.normalizeImageClinicalContext(v), null);
    assert.equal(ctx.quizImageClinicalContextHtml(v), '');
  }
  const copy = plain(ctx.withNormalizedImageClinicalContext({ ...IMG, clinicalContext: { presentation: ' ', patientSex: '' } }));
  assert.equal('clinicalContext' in copy, false, 'contexto vazio é removido ao salvar');
  assert.deepEqual(plain(ctx.normalizeImageClinicalContext({ ...CTX, diagnosis: 'X', label: 'Y' })), CTX, 'só os 4 campos');
});

test('088: acentos e caracteres especiais sobrevivem (e são escapados no HTML)', () => {
  const c = { presentation: 'Criança com cefaleia, vômitos e "papiledema" <urgente> & febre', patientSex: 'Feminino', patientAge: '8 meses' };
  assert.deepEqual(plain(ctx.normalizeImageClinicalContext(c)), c);
  const h = ctx.quizImageClinicalContextHtml(c);
  assert.match(h, /Criança com cefaleia, vômitos e &quot;papiledema&quot; &lt;urgente&gt; &amp; febre/);
  assert.doesNotMatch(h, /<urgente>/);
  assert.match(h, /8 meses \/ Feminino/, 'idade não numérica fica como digitada');
});

test('088: identidade da imagem (stableImageKey/imageIdentityKeys) não muda com o contexto', () => {
  const withCtx = { ...IMG, clinicalContext: CTX };
  assert.equal(ctx.stableImageKeyV208(withCtx), ctx.stableImageKeyV208(IMG));
  assert.deepEqual(plain(ctx.imageIdentityKeys(withCtx)), plain(ctx.imageIdentityKeys(IMG)));
});

test('088 QUIZ ANTES da resposta: mostra história, idade e sexo — NUNCA a descrição da imagem', () => {
  const h = quizMedia({ ...IMG, clinicalContext: CTX }, false);
  assert.match(h, /Caso clínico/);
  assert.match(h, /<b>Paciente:<\/b> 52 anos \/ Masculino/);
  assert.match(h, /<b>História clínica:<\/b> Dor no joelho há 3 semanas após trauma/);
  assert.match(h, /<b>Observações:<\/b> Tabagista; febre baixa/);
  assert.doesNotMatch(h, /ruptura do LCA|Descrição da imagem|quiz-img-desc/);
});

test('088 QUIZ DEPOIS da resposta: descrição aparece e o contexto continua visível', () => {
  const h = quizMedia({ ...IMG, clinicalContext: CTX }, true);
  assert.match(h, /Descrição da imagem/);
  assert.match(h, /ruptura do LCA com edema ósseo/);
  assert.match(h, /História clínica:<\/b> Dor no joelho/);
  assert.ok(h.indexOf('quiz-clinical-context') < h.indexOf('quiz-img-desc'), 'caso clínico acima da descrição');
});

test('088 QUIZ: só renderiza campos preenchidos (sem frase inventada); render repetido não duplica', () => {
  const onlyAge = ctx.quizImageClinicalContextHtml({ patientAge: '70' });
  assert.match(onlyAge, /<b>Paciente:<\/b> 70 anos<\/div>/);
  assert.doesNotMatch(onlyAge, /História clínica|Observações/);
  const onlyHist = ctx.quizImageClinicalContextHtml({ presentation: 'Tosse crônica' });
  assert.doesNotMatch(onlyHist, /Paciente:/);
  const once = quizMedia({ ...IMG, clinicalContext: CTX }, false);
  const again = quizMedia({ ...IMG, clinicalContext: CTX }, false);
  assert.equal(once, again);
  assert.equal((once.match(/quiz-clinical-context/g) || []).length, 1);
});

test('088 QUIZ: contexto de uma imagem não contamina a outra (carrossel usa cur.clinicalContext)', () => {
  const a = { ...IMG, clinicalContext: CTX };
  const b = { data: 'https://res.cloudinary.com/x/b.jpg', publicId: 'atlas-radiologico/b', label: 'outra' };
  assert.match(quizMedia(a, false), /Caso clínico/);
  assert.equal(quizMedia(b, false), '', 'imagem sem contexto: nenhum bloco');
  const render = extractFunction(html, 'renderQuizCardIntegrated');
  // 093d: o bloco agora passa por quizClinicalContextBlockHtml (caso clínico
  // vinculado À IMAGEM tem prioridade); sem caso, cai exatamente em
  // quizImageClinicalContextHtml(cur.clinicalContext) — mesma imagem ativa.
  assert.match(render, /media\.innerHTML=`\$\{quizClinicalContextBlockHtml\(e, cur, st\.answered\)\}\$\{quizImageDescHtml\(cur\.label, st\.answered\)\}/);
  assert.match(extractFunction(html, 'quizClinicalContextBlockHtml'), /return typeof quizImageClinicalContextHtml === 'function' \? quizImageClinicalContextHtml\(image && image\.clinicalContext\) : '';/);
  assert.match(render, /openImageLightbox\(cur\.data, st\.answered \? cur\.label : ''\)/, 'gate do lightbox intacto');
});

test('088 NÃO VAZA: nada copia nome/descrição/tags para o contexto (só digitação do usuário)', () => {
  const assigns = html.match(/clinicalContext\s*=[^=][^;\n]*/g) || [];
  assert.ok(assigns.length >= 4, 'atribuições auditadas');
  for (const a of assigns) assert.doesNotMatch(a, /\.name\b|\.label\b|\.tags\b|\.notes\b|classification/, a);
  assert.doesNotMatch(extractFunction(html, 'quizImageClinicalContextHtml'), /label|\.name|tags/);
});

test('088 EDITOR: bloco "Contexto clínico / dados do paciente" com os 4 campos, aviso pré-diagnóstico e cópia da imagem anterior', () => {
  const src = html.slice(html.indexOf('function renderImgGallery(){'), html.indexOf("item.querySelector('.img-gallery-remove')"));
  assert.match(src, /Contexto clínico \/ dados do paciente/);
  for (const cls of ['img-clinical-presentation', 'img-clinical-age', 'img-clinical-sex', 'img-clinical-notes']) assert.match(src, new RegExp('class="' + cls + '"'));
  assert.match(src, /Informação pré-diagnóstica: aparece no Quiz ANTES da resposta\. Não escreva o diagnóstico aqui/);
  assert.match(src, /<option value="Feminino">Feminino<\/option><option value="Masculino">Masculino<\/option>/);
  assert.match(src, /el\.value = ctxNow\[k\] != null \? String\(ctxNow\[k\]\) : '';/, 'reabrir preenche via .value (nunca via HTML)');
  assert.match(src, /pendingImgs\[idx\]\.clinicalContext = \{ \.\.\.cur, \[k\]: ev\.target\.value \};\s*imgsChanged = true;/);
  assert.match(src, /img-clinical-copy-prev/);
  assert.match(src, /textarea class="img-gallery-label"/, 'descrição continua em campo separado');
});

test('088 SALVAR/UPLOAD/TROCA: o campo atravessa upload, troca de imagem e salvar (spread + normalização)', () => {
  assert.match(extractFunction(html, 'uploadPendingImage'), /'originalUrl','clinicalContext'\]/);
  const form = extractFunction(html, 'openForm');
  assert.match(form, /remoteImgs = normalized\.map\(x=>\(\{\s*\.\.\.x,[\s\S]*?\}\)\)\.map\(withNormalizedImageClinicalContext\);/);
  assert.match(form, /if\(oldCtx\) pendingImgs\[idx\]\.clinicalContext = oldCtx;/);
  assert.match(form, /if\(old\.clinicalContext\) temp\.clinicalContext = old\.clinicalContext;/);
  assert.match(form, /pendingImgs = imgs\.map\(i=>\(\{\.\.\.i,/, 'reabrir edição carrega o objeto inteiro');
  assert.match(extractFunction(html, 'getEntryImgs'), /\(\{\.\.\.x, source:/, 'Quiz recebe o objeto inteiro');
});

test('088: F5 / backup export-import (JSON) preservam o contexto exato', () => {
  const entry = { id: 'seed_1', images: [{ ...IMG, clinicalContext: CTX }, { data: 'https://x/2.jpg' }] };
  const backup = JSON.parse(JSON.stringify({ format: 'atlas-radiologico-backup', data: [entry] }));
  assert.deepEqual(backup.data[0].images[0].clinicalContext, CTX);
  assert.equal('clinicalContext' in backup.data[0].images[1], false);
});
