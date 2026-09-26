'use strict';

/* PROTEÇÃO 093d — contexto clínico POR IMAGEM no Quiz (caso clínico
 * vinculado à imagem exibida, via imageRefs da 093b), escolha explícita
 * quando a imagem tem 2+ casos (gravada no próprio vínculo e sincronizada
 * pelo merge por vínculo), vínculo pré-Salvar de imagem/quadro temporário
 * (chave pending:… da 093c) e card de caso com apresentação compacta.
 * Funções REAIS do index.html em `vm` + fiação estática.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const userscript = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
const MODULE = html.slice(html.indexOf('/* ============================================================\n   PROTEÇÃO 093 — CONTEÚDO DIDÁTICO POR LESÃO'),
  html.indexOf('/* ============================================================\n   SÍTIO/ÓRGÃO'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const NAMES = ['getClinicalCasesForImage', 'getQuizClinicalCaseForImage', 'setQuizCasePickForImage', 'redactDiagnosisTerms', 'quizCaseClinicalContextHtml',
  'quizClinicalContextBlockHtml', 'clinicalCasePresentationHtml', 'wireClinicalCasePresentations', 'clinicalCasesSectionHtml', 'lesionDidacticQuizHtml',
  'applyImageLinkSelection', 'didacticListsOfEntry', 'didacticImageRefId', 'didacticImageId', 'remapPendingImageRefs', 'mergeDidacticItems', 'linkImageRef',
  'imageLinkButtonHtml', 'sortDidacticItems', 'upsertDidacticItem', 'normalizeRadiologicSign', 'normalizeClassificationScheme'];
function api() {
  const deps = ['escAttr', 'esc', 'canonicalJsonString', 'normalizeExternalTitle', 'clinicalCaseIdentityKey', 'unionClinicalCases', 'sameExternalUrl',
    'buildClinicalCaseFromDraft', 'lesionHasClinicalCaseUrl', 'addClinicalCaseToLesion', 'clinicalCaseRowHtml', 'clinicalCasesSectionHtml', 'stableImageKeyV208',
    'normalizeImageClinicalContext', 'quizImageClinicalContextHtml'].map((n) => extractFunction(html, n)).join('\n');
  const limits = /const IMAGE_CLINICAL_CONTEXT_LIMITS = \{[^}]*\};/.exec(html)[0];
  const ctx = vm.createContext({ URL, Date, Math, JSON, console });
  vm.runInContext(limits + '\n' + deps + '\n' + MODULE + '\nthis.__a = { ' + NAMES.join(', ') + ' };', ctx);
  return ctx.__a;
}
const A = api();
const quizFn = extractFunction(html, 'renderQuizCardIntegrated');
const formFn = extractFunction(html, 'openForm');

const mk = (n, over) => Object.assign({ label: 'legenda ' + n, data: 'https://res.cloudinary.com/x/image/upload/v1/atlas/' + n + '.png', source: 'cloudinary',
  publicId: 'atlas/' + n, assetId: 'asset' + n, lesionId: 'seed_1', lesionName: 'Retenção de produtos da concepção' }, over || {});
const CASE_A = { id: 'case_A', origin: 'imported', source: 'Radiopaedia', title: 'Retained products of conception (after delivery)',
  sourceUrl: 'https://radiopaedia.org/cases/rpoc-1', patientAge: '40', patientSex: 'Female', modality: 'MRI',
  presentation: 'Persistent vaginal bleeding one month after delivery, with a low level of beta-hCG (18.2 IU/mL).', order: 0, createdAt: 1, updatedAt: 1 };
const CASE_B = { id: 'case_B', origin: 'manual', title: 'RPOC após aborto', patientAge: '31', patientSex: 'Feminino',
  presentation: 'Dor pélvica e sangramento após curetagem.', order: 1, createdAt: 2, updatedAt: 2 };
const ref = (n, over) => Object.assign({ imageId: 'asset:asset' + n, order: 0, createdAt: 10, updatedAt: 10 }, over || {});
function lesion() {
  return { id: 'seed_1', name: 'Retenção de produtos da concepção', enTerm: 'retained products of conception', s: 'Abdome', site: 'Útero',
    images: [mk('A'), mk('B'), mk('C')],
    clinicalCases: [Object.assign({}, CASE_A, { imageRefs: [ref('A')] }), Object.assign({}, CASE_B, { imageRefs: [ref('B')] })],
    radiologicSigns: [{ id: 's1', title: 'Sinal da massa vascular endometrial', strength: 'specific', description: '', images: [], order: 0, createdAt: 1, updatedAt: 1 }],
    classificationSchemes: [{ id: 'k1', title: 'Gutenberg (vascularização RPOC)', content: '', links: [], images: [], order: 0, createdAt: 1, updatedAt: 1 }] };
}
const pre = (e, im) => A.quizClinicalContextBlockHtml(e, im, false);
const post = (e, im) => A.quizClinicalContextBlockHtml(e, im, true);

// ------------------------------------------------------------ CONTEXTO
test('093d 1: imagem sem caso vinculado -> nenhum contexto de caso (Quiz como antes)', () => {
  const e = lesion();
  assert.equal(pre(e, e.images[2]), '');
  // com contexto manual da própria imagem (088), exatamente o bloco de antes
  const withCtx = mk('C', { clinicalContext: { presentation: 'tosse' } });
  assert.equal(pre(e, withCtx), A.quizClinicalContextBlockHtml({ clinicalCases: [] }, withCtx, false));
  assert.match(pre(e, withCtx), /Caso clínico[\s\S]*tosse/);
});

test('093d 2-6: imagem com 1 caso -> idade, sexo, modalidade e apresentação ANTES da resposta', () => {
  const e = lesion();
  const h = pre(e, e.images[0]);
  assert.match(h, /class="quiz-case-context"/);
  assert.match(h, />Contexto clínico</);
  assert.match(h, /40 anos · Female · MRI/);
  assert.match(h, /Persistent vaginal bleeding one month after delivery, with a low level of beta-hCG \(18\.2 IU\/mL\)\./);
  const noMod = A.quizClinicalContextBlockHtml({ clinicalCases: [Object.assign({}, CASE_B, { imageRefs: [ref('B')] })] }, mk('B'), false);
  assert.match(noMod, /31 anos · Feminino</, 'sem modalidade: não aparece');
});

test('093d 7-10: NADA diagnóstico antes da resposta (título do caso, nome da lesão, sinais, classificações)', () => {
  const e = lesion();
  const leaky = Object.assign({}, CASE_A, { presentation: 'Bleeding; retained products of conception suspected. Retenção de produtos da concepção?', imageRefs: [ref('A')] });
  e.clinicalCases = [leaky];
  const h = pre(e, e.images[0]);
  assert.doesNotMatch(h, /Retained products of conception \(after delivery\)/i, 'título do caso');
  assert.doesNotMatch(h, /retained products of conception/i, 'termo diagnóstico mascarado na apresentação');
  assert.doesNotMatch(h, /Retenção de produtos da concepção/i, 'nome da lesão');
  assert.match(h, /\[…\] suspected/);
  assert.doesNotMatch(h, /Sinal da massa|Gutenberg|Radiopaedia|Abrir caso|legenda A/);
  // a função pré-resposta nunca lê título/notas/sinais/classificações
  const fn = extractFunction(html, 'quizCaseClinicalContextHtml');
  assert.match(fn, /answered \? String\(c\.presentation \|\| ''\)\.trim\(\)\s*: redactDiagnosisTerms\(c\.presentation, \[entry && entry\.name, entry && entry\.enTerm, c\.title\]\)/);
  assert.doesNotMatch(fn, /radiologicSigns|classificationSchemes|c\.notes|\.label/);
  // no Quiz, sinais/classificações seguem só no feedback pós-resposta
  assert.equal((quizFn.match(/lesionDidacticQuizHtml\(/g) || []).length, 1);
  assert.match(/function renderDetail\(\)\{[\s\S]*?\n  \}/.exec(quizFn)[0], /lesionDidacticQuizHtml\(e\)/);
});

test('093d 11: depois da resposta — caso identificado + conteúdo educacional completo', () => {
  const e = lesion();
  const h = post(e, e.images[0]);
  assert.match(h, /Caso: <b>Retained products of conception \(after delivery\)<\/b>/);
  assert.match(h, /↗ Abrir caso/);
  assert.match(h, /40 anos · Female · MRI/);
  const detail = A.lesionDidacticQuizHtml(e);
  assert.match(detail, /Sinal da massa vascular endometrial/);
  assert.match(detail, /Gutenberg/);
  assert.match(quizFn, /media\.innerHTML=`\$\{quizClinicalContextBlockHtml\(e, cur, st\.answered\)\}\$\{quizImageDescHtml\(cur\.label, st\.answered\)\}/, 'bloco segue a imagem ATIVA do carrossel');
});

// ------------------------------------------------------------ MÚLTIPLAS IMAGENS
test('093d 12-16: imagem A -> caso A, imagem B -> caso B; trocar imagem troca; quadro usa o próprio vínculo; sem mistura', () => {
  const e = lesion();
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[0]).id, 'case_A');
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[1]).id, 'case_B');
  const hA = pre(e, e.images[0]), hB = pre(e, e.images[1]);
  assert.match(hA, /Persistent vaginal bleeding/); assert.doesNotMatch(hA, /Dor pélvica|31 anos/);
  assert.match(hB, /Dor pélvica e sangramento/); assert.doesNotMatch(hB, /Persistent|40 anos/);
  // carrossel: o mesmo renderMedia recalcula com `cur` a cada troca (goPrev/goNext -> renderMedia)
  assert.match(quizFn, /const goNext=\(\)=>\{ quizImgIdx\+\+; renderMedia\(\); \};/);
  // quadro = UM item de entry.images: vale o vínculo do quadro, nunca dos painéis
  const board = mk('Q', { panels: [{ data: 'https://res.cloudinary.com/x/image/upload/v1/atlas/A.png', label: 'T1' }] });
  e.images.push(board);
  assert.equal(A.getQuizClinicalCaseForImage(e, board), null, 'painel com a mesma URL da imagem A não herda o caso A');
  e.clinicalCases[1].imageRefs.push(ref('Q'));
  assert.equal(A.getQuizClinicalCaseForImage(e, board).id, 'case_B');
  // cópia da imagem (como getEntryImgs entrega ao Quiz) resolve igual — nunca por posição
  assert.equal(A.getQuizClinicalCaseForImage(e, Object.assign({}, e.images[1], { source: 'cloudinary' })).id, 'case_B');
});

// ------------------------------------------------------------ AMBIGUIDADE
test('093d 17-19: 1 imagem + 2 casos sem escolha -> nenhum; escolha A -> A; trocar para B -> B; Nenhum -> nenhum', () => {
  const e = lesion();
  e.clinicalCases[1].imageRefs.push(ref('A'));
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[0]), null, 'ambíguo: melhor sem contexto que misturar pacientes');
  assert.equal(pre(e, e.images[0]), '', 'nem cai no contexto de outro caso');
  let r = A.setQuizCasePickForImage(e.clinicalCases, 'asset:assetA', 'case_A', 1000);
  assert.equal(r.changed, true); e.clinicalCases = r.list;
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[0]).id, 'case_A');
  r = A.setQuizCasePickForImage(e.clinicalCases, 'asset:assetA', 'case_B', 2000); e.clinicalCases = r.list;
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[0]).id, 'case_B');
  r = A.setQuizCasePickForImage(e.clinicalCases, 'asset:assetA', null, 3000); e.clinicalCases = r.list;
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[0]), null, '"Nenhum" explícito');
  // a escolha é da IMAGEM: a imagem B do caso B não muda
  assert.equal(A.getQuizClinicalCaseForImage(e, e.images[1]).id, 'case_B');
  // gravada no vínculo, com carimbo do vínculo; nenhum caso duplicado
  const refA = e.clinicalCases[0].imageRefs.find((x) => x.imageId === 'asset:assetA');
  assert.equal(refA.quizPick, 'off'); assert.ok(refA.updatedAt > 10);
  assert.equal(e.clinicalCases.length, 2);
  // 1 caso só: usado sem escolha (e sem gravar nada)
  const single = lesion();
  assert.equal(JSON.stringify(single.clinicalCases).includes('quizPick'), false);
  // UI: radio só com 2+ casos marcados, gravado ao salvar vínculos
  const picker = extractFunction(html, 'openImageLinkPicker');
  assert.match(picker, /box\.hidden = chosen\.length < 2;/);
  assert.match(picker, /\['', 'Nenhum'\]/);
  assert.match(picker, /const pk = setQuizCasePickForImage\(res\.cases, imageId, target \? didacticPickKey\(target\) : null, now\);/);
});

test('093d 20: sync — a escolha mais nova vence no outro PC (merge por vínculo da 093b), sem índice', () => {
  const base = lesion();
  base.clinicalCases[1].imageRefs.push(ref('A'));
  const pcA = A.setQuizCasePickForImage(base.clinicalCases, 'asset:assetA', 'case_B', 5000).list; // escolha nova
  const pcOld = A.setQuizCasePickForImage(base.clinicalCases, 'asset:assetA', 'case_A', 4000).list; // PC antigo
  for (const merged of [A.mergeDidacticItems(pcA, pcOld), A.mergeDidacticItems(pcOld, pcA)]) {
    assert.equal(A.getQuizClinicalCaseForImage({ clinicalCases: merged }, base.images[0]).id, 'case_B');
  }
  assert.deepEqual(plain(A.mergeDidacticItems(pcA, pcOld)), plain(A.mergeDidacticItems(pcOld, pcA)), 'determinístico');
});

// ------------------------------------------------------------ CARD COMPACTO
function fakeEl() {
  const cls = new Set(['clinical-case-presentation', 'is-clampable', 'is-clamped']);
  const attrs = { 'aria-expanded': 'false' };
  return { classList: { toggle: (c) => { if (cls.has(c)) { cls.delete(c); return false; } cls.add(c); return true; }, has: (c) => cls.has(c) },
    setAttribute: (k, v) => { attrs[k] = v; }, attrs, cls };
}
test('093d 21-25: apresentação longa começa compacta, expande/recolhe por clique e teclado; curta fica normal', () => {
  const long = A.clinicalCasePresentationHtml(CASE_A.presentation + ' ' + CASE_A.presentation);
  assert.match(long, /class="clinical-case-presentation is-clampable is-clamped" role="button" tabindex="0" aria-expanded="false"/);
  const short = A.clinicalCasePresentationHtml('Dor pélvica.');
  assert.doesNotMatch(short, /is-clampable|role="button"|tabindex/, 'texto curto sem expansão artificial');
  assert.match(html, /\.clinical-case-presentation\.is-clamped\{max-height:2\.1em;line-height:1\.4;overflow:hidden;/, '~1,5 linha');
  const el = fakeEl();
  A.wireClinicalCasePresentations({ querySelectorAll: () => [el] });
  el.onclick();
  assert.equal(el.cls.has('is-clamped'), false); assert.equal(el.attrs['aria-expanded'], 'true');
  el.onclick();
  assert.equal(el.cls.has('is-clamped'), true); assert.equal(el.attrs['aria-expanded'], 'false');
  let prevented = 0;
  el.onkeydown({ key: 'Enter', preventDefault: () => { prevented++; } });
  assert.equal(el.attrs['aria-expanded'], 'true');
  el.onkeydown({ key: ' ', preventDefault: () => { prevented++; } });
  assert.equal(el.attrs['aria-expanded'], 'false');
  el.onkeydown({ key: 'a', preventDefault: () => { prevented++; } });
  assert.equal(prevented, 2);
  // título, idade/sexo, modalidade, link e imagens ficam FORA da parte recolhível
  const card = A.clinicalCasesSectionHtml({ images: [mk('A')], clinicalCases: [Object.assign({}, CASE_A, { presentation: CASE_A.presentation.repeat(3), imageRefs: [ref('A')] })] });
  const iPres = card.indexOf('clinical-case-presentation');
  for (const bit of ['Retained products of conception (after delivery)', '40 anos', 'Modalidade: MRI']) assert.ok(card.indexOf(bit) >= 0 && card.indexOf(bit) < iPres, bit);
  assert.ok(card.indexOf('↗ Abrir caso') > iPres && card.indexOf('didactic-images') > card.indexOf('↗ Abrir caso'));
  assert.match(extractFunction(html, 'wireClinicalCasesToggle'), /wireClinicalCasePresentations\(ov\)/);
});

// ------------------------------------------------------------ PRÉ-SALVAR
test('093d 26-31: imagem/quadro temporário recebe vínculo antes do Salvar; zero upload; Salvar converte; cancelar descarta', () => {
  const tempImg = { label: '', data: 'blob:https://atlas/1', source: 'pending', _pendingKey: 'pending:t1' };
  const tempBoard = { label: 'Quadro', data: 'blob:https://atlas/2', source: 'pending', panels: [{ data: 'blob:x' }], _pendingKey: 'pending:t2' };
  const lists = { cases: [Object.assign({}, CASE_A)], signs: [], schemes: [] };
  // o botão 🔗 aparece para a temporária/quadro (antes só para imagem enviada)
  assert.match(A.imageLinkButtonHtml(lists, tempImg, 'data-form-link="1"'), /🔗 Vincular a…/);
  assert.match(A.imageLinkButtonHtml(lists, tempBoard, ''), /🔗 Vincular a…/);
  let res = A.applyImageLinkSelection(lists, A.didacticImageRefId(tempImg), { cases: new Set(['case_A']), signs: new Set(), schemes: new Set() }, 100);
  res = A.applyImageLinkSelection(Object.assign({}, lists, { cases: res.cases }), A.didacticImageRefId(tempBoard), { cases: new Set(['case_A']), signs: new Set(), schemes: new Set() }, 101);
  assert.deepEqual(plain(res.cases[0].imageRefs.map((r) => r.imageId)), ['pending:t1', 'pending:t2']);
  // nenhum caminho do seletor/vínculo envia ao Cloudinary
  for (const fn of ['openImageLinkPicker', 'imageLinkButtonHtml', 'applyImageLinkSelection', 'setQuizCasePickForImage', 'getQuizClinicalCaseForImage']) assert.doesNotMatch(extractFunction(html, fn), /uploadToCloudinary|uploadPendingImage/, fn);
  assert.match(formFn, /function renderImgGallery\(\)\{\s*didacticImageCtx\.getImages\(\); \/\/ 093d/, 'toda temporária da galeria (arquivo, Ctrl+V, quadro) ganha chave pending: antes de renderizar');
  // Salvar (única vez): pending -> chave estável do asset enviado
  const saved = A.remapPendingImageRefs(res.cases, { 'pending:t1': 'asset:up1', 'pending:t2': 'asset:up2' });
  assert.deepEqual(plain(saved[0].imageRefs.map((r) => r.imageId)), ['asset:up1', 'asset:up2']);
  assert.equal(JSON.stringify(saved).includes('pending:'), false);
  // já vinculado após o único Salvar: o Quiz acha o caso pela imagem enviada
  const uploaded = mk('up1', { assetId: 'up1' });
  assert.equal(A.getQuizClinicalCaseForImage({ clinicalCases: saved }, uploaded).id, 'case_A');
  // cancelar: draft descartado; temporária removida antes do Salvar -> vínculo some
  assert.deepEqual(plain(A.remapPendingImageRefs(res.cases, {})[0].imageRefs), []);
  assert.match(formFn, /document\.getElementById\('f-cancel'\)\.onclick = \(\)=>\{ releasePendingObjectUrls\(\);/);
  assert.match(formFn, /onApply: \(res\)=>\{\s*for\(const kind of \['cases','signs','schemes'\]\)\{ if\(res\.changed\[kind\]\)\{ setDidacticDraft\(kind, res\[kind\]\);/, 'vínculo pré-Salvar só vai para o draft do formulário');
});

// ------------------------------------------------------------ REGRESSÕES
test('093d 32-36: 093b, 093c, 092, Quiz sem caso e userscript intactos', () => {
  // 093b: vínculo resolve a imagem da galeria, sem cópia
  const e = lesion();
  assert.match(A.clinicalCasesSectionHtml(e), /atlas\/A\.png/);
  // 093c: upload só no Salvar do formulário
  assert.match(formFn, /normalized\.push\(await uploadPendingImage\(x, \{id:entryId,name\}\)\);/);
  assert.doesNotMatch(extractFunction(html, 'openDidacticItemEditor'), /uploadToCloudinary|uploadPendingImage/);
  // 092: merge por campo continua no pull
  assert.match(extractFunction(html, 'mergeEntryNonDestructive'), /symmetric: !!preferRemoteWhenUntimed, hintA: lt, hintB: rt/);
  // Quiz sem caso: bloco idêntico ao da 088
  const img = mk('Z', { clinicalContext: { patientAge: '70', presentation: 'tosse' } });
  assert.equal(A.quizClinicalContextBlockHtml({ clinicalCases: [] }, img, false), A.quizClinicalContextBlockHtml({}, img, false));
  assert.match(A.quizClinicalContextBlockHtml({}, img, false), /Paciente:<\/b> 70 anos/);
  assert.equal(A.quizClinicalContextBlockHtml({}, mk('Z'), false), '');
  // alternativas do Quiz inalteradas (mesma montagem das opções)
  assert.match(quizFn, /choices\.map\(\(x,i\)=>`<button class="quiz-mcq-option" data-id="\$\{escAttr\(x\.id\)\}">/);
  assert.match(userscript, /@version\s+1\.4\.2/);
  assert.doesNotMatch(userscript, /imageRefs|quizPick|quizCase/);
});
