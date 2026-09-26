'use strict';

/* PROTEÇÃO 093c — regra histórica restaurada: imagem só vai ao Cloudinary
 * DEPOIS do Salvar do formulário, inclusive as adicionadas dentro de um
 * sinal radiológico ou classificação/esquema (arquivo, Ctrl+V). O editor do
 * item usa o MESMO mecanismo do formulário principal (buildPendingImage ->
 * blob + File em pendingImgs -> uploadPendingImage no f-save); o vínculo
 * usa uma chave temporária `pending:…` trocada pela chave estável do asset
 * só depois do upload (remapPendingImageRefs). Funções REAIS em `vm` +
 * ordem/fiação estática do editor e do Salvar. O fluxo clicado no navegador
 * foi conferido à parte (smoke Chromium com espião no uploadToCloudinary).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

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
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
function api() {
  const deps = ['escAttr', 'esc', 'canonicalJsonString', 'normalizeExternalTitle', 'clinicalCaseIdentityKey', 'unionClinicalCases', 'sameExternalUrl',
    'buildClinicalCaseFromDraft', 'lesionHasClinicalCaseUrl', 'addClinicalCaseToLesion', 'clinicalCaseRowHtml', 'clinicalCasesSectionHtml', 'stableImageKeyV208', 'buildPendingImage']
    .map((n) => extractFunction(html, n)).join('\n');
  const ctx = vm.createContext({ URL, Date, Math, JSON, console });
  vm.runInContext(deps + '\n' + MODULE + '\nthis.__a = { ' + ['didacticImageId', 'didacticImageRefId', 'isPendingImageRefId', 'remapPendingImageRefs',
    'resolveLesionImageRef', 'findSameLesionImage', 'linkImageRef', 'unlinkImageRef', 'moveImageRef', 'activeImageRefs', 'linkedImageViews', 'buildPendingImage'].join(', ') + ' };', ctx);
  return ctx.__a;
}
const A = api();
const editorFn = extractFunction(html, 'openDidacticItemEditor');
const formFn = extractFunction(html, 'openForm');
const saveBody = formFn.slice(formFn.indexOf("document.getElementById('f-save').onclick"));
const main = (n) => ({ label: 'principal ' + n, data: 'https://res.cloudinary.com/x/image/upload/v1/atlas/' + n + '.png', source: 'cloudinary', publicId: 'atlas/' + n, assetId: 'asset' + n });
// temporária exatamente como o formulário cria (buildPendingImage + chave do vínculo)
const pending = (key) => Object.assign(A.buildPendingImage({ name: key + '.png', type: 'image/png' }, () => 'blob:https://atlas/' + key), { _pendingKey: 'pending:' + key });

test('093c 1-3: Ctrl+V e arquivo (sinal e classificação) viram temporária do formulário — zero upload no editor', () => {
  assert.doesNotMatch(editorFn, /uploadToCloudinary|uploadPendingImage|fetch\(/, 'o editor do item nunca envia nada');
  // arquivo e Ctrl+V caem no MESMO addPendingFiles (sinal e classificação: kind !== 'cases')
  assert.match(editorFn, /\$\('de-img-file'\)\.onchange = \(ev\) => \{[\s\S]{0,120}addPendingFiles\(files\);/);
  assert.match(editorFn, /if \(kind !== 'cases'\) ov\.addEventListener\('paste', \(ev\) => \{[\s\S]{0,300}if \(files\.length\) \{ ev\.preventDefault\(\); addPendingFiles\(files\); return; \}/);
  assert.match(editorFn, /const temp = ctx\.addPendingFile\(f\);\s*if \(!temp\) continue;\s*addedHere\.push\(temp\);\s*refs = linkImageRef\(refs, didacticImageRefId\(temp\)\);/);
  // no formulário: o MESMO buildPendingImage/trackObjectUrl do upload principal
  assert.match(formFn, /addPendingFile: \(file\)=>\{\s*if\(!file \|\| !file\.type \|\| !file\.type\.startsWith\('image\/'\)\) return null;\s*const temp = buildPendingImage\(file, trackObjectUrl\);\s*temp\._pendingKey = newPendingKey\(\);\s*pendingImgs\.push\(temp\); imgsChanged = true; renderImgGallery\(\);/);
  // preview: a temporária resolve no editor (blob), sem chave estável
  const t = pending('p1');
  assert.equal(t.source, 'pending');
  assert.equal(t.data, 'blob:https://atlas/p1');
  assert.equal(A.didacticImageId(t), '', 'sem identidade de asset antes do upload');
  assert.equal(A.didacticImageRefId(t), 'pending:p1');
  const refs = A.linkImageRef([], 'pending:p1', 1);
  assert.equal(A.resolveLesionImageRef([main(1), t], 'pending:p1'), t, 'preview do vínculo temporário funciona');
  assert.equal(A.linkedImageViews({ imageRefs: refs }, { images: [main(1), t] })[0].data, 'blob:https://atlas/p1');
});

test('093c 4: URL nova não persiste antes do Salvar (só entra no draft do formulário, como o "+ URL" principal)', () => {
  assert.match(editorFn, /if \(addAndLink\(\{ label: '', data: url, source: 'url' \}\)\)/);
  assert.match(formFn, /addImage: \(im\)=>\{ const n = \{ \.\.\.im, label: im\.label\|\|'', source: im\.source\|\|'url' \}; pendingImgs\.push\(n\);/);
  assert.match(formFn, /pendingImgs\.push\(\{label:'',data:url,source:'url'\}\); imgsChanged=true;/, 'mesmo padrão do "+ URL" da galeria');
  // nenhuma escrita em DATA/saveData dentro do editor
  assert.doesNotMatch(editorFn, /saveData|DATA\b|storage\./);
});

test('093c 5: cancelar o ITEM desfaz o que ele pôs na galeria (blob revogada); nada foi enviado', () => {
  assert.match(editorFn, /const close = \(\) => \{ if \(ctx && typeof ctx\.removeImage === 'function'\) addedHere\.forEach\(im => ctx\.removeImage\(im\)\); addedHere\.length = 0; ov\.remove\(\); \};/);
  assert.match(editorFn, /ov\.onclick = \(ev\) => \{ if \(ev\.target === ov\) close\(\); \};\s*\$\('de-cancel'\)\.onclick = close;/);
  assert.match(editorFn, /ov\.remove\(\); \/\/ salvou o item[^\n]*\n\s*onSave\(out\);/, 'salvar o item mantém as temporárias para o Salvar do formulário');
  assert.match(formFn, /removeImage: \(im\)=>\{\s*const i = pendingImgs\.indexOf\(im\);\s*if\(i < 0\) return;\s*pendingImgs\.splice\(i, 1\);\s*if\(im\.source==='pending'\) revokeObjectUrl\(im\._objectUrl\);/);
  // só o que ESTE editor adicionou (imagem existente reaproveitada não entra em addedHere)
  assert.match(editorFn, /let target = findSameLesionImage\(lesionImages\(\), imgObj\);\s*if \(!target\) \{ target = ctx\.addImage\(imgObj\); if \(target\) addedHere\.push\(target\); \}/);
});

test('093c 6: cancelar o FORMULÁRIO descarta as temporárias (mesmo caminho de sempre)', () => {
  assert.match(formFn, /document\.getElementById\('f-cancel'\)\.onclick = \(\)=>\{ releasePendingObjectUrls\(\);/);
  // o único ponto do formulário que envia ao Cloudinary é o f-save
  const beforeSave = stripComments(formFn.slice(0, formFn.indexOf("document.getElementById('f-save').onclick")));
  assert.doesNotMatch(beforeSave, /uploadPendingImage\(|uploadToCloudinary\(/);
  // vínculo temporário que não virou upload é descartado; `pending:` nunca persiste
  const draft = [{ id: 's1', title: 'S', imageRefs: [{ imageId: 'pending:x', order: 0, createdAt: 1, updatedAt: 1 }] }];
  assert.deepEqual(plain(A.remapPendingImageRefs(draft, {})[0].imageRefs), []);
});

test('093c 7-9: Salvar — upload uma única vez, imagem entra em entry.images, vínculo vira a chave real', () => {
  // cada temporária sobe UMA vez, no loop do Salvar, e alimenta o mapa pending -> chave estável
  assert.match(saveBody, /normalized\.push\(await uploadPendingImage\(x, \{id:entryId,name\}\)\);\s*\/\/ 093c[^\n]*\n\s*if\(x\._pendingKey\) pendingImageRefMap\[x\._pendingKey\] = stableImageKeyV208\(normalized\[normalized\.length-1\]\);/);
  assert.equal((saveBody.match(/uploadPendingImage\(/g) || []).length, 1);
  assert.match(formFn, /if\(formSaving\) return; \/\/ idempotência/, 'trava de duplo clique existente');
  // resultado vai para entry.images (remoteImgs -> existing.images/newEntry.images)
  assert.match(saveBody, /existing\.images=remoteImgs;/);
  assert.match(saveBody, /images:remoteImgs, classification/);
  // remapeia os drafts ANTES de gravá-los na lesão
  const iRemap = saveBody.indexOf('radiologicSignsDraft = remapPendingImageRefs(radiologicSignsDraft, pendingImageRefMap);');
  assert.ok(iRemap > 0 && iRemap < saveBody.indexOf('existing.radiologicSigns = JSON.parse(JSON.stringify(radiologicSignsDraft))'));
  assert.ok(saveBody.indexOf('clinicalCasesDraft = remapPendingImageRefs(') > 0 && saveBody.indexOf('classificationSchemesDraft = remapPendingImageRefs(') > 0);
  // pura: pending -> chave real, preservando ordem/override/carimbos
  let refs = A.linkImageRef([], 'asset:asset1', 1);
  refs = A.linkImageRef(refs, 'pending:p1', 2);
  const drafts = [{ id: 's1', title: 'S', imageRefs: plain(refs).map((r) => r.imageId === 'pending:p1' ? Object.assign(r, { captionOverride: 'no sinal' }) : r) }];
  const out = A.remapPendingImageRefs(drafts, { 'pending:p1': 'asset:up1' });
  assert.deepEqual(plain(out[0].imageRefs), [{ imageId: 'asset:asset1', order: 0, createdAt: 1, updatedAt: 1 }, { imageId: 'asset:up1', order: 1, createdAt: 2, updatedAt: 2, captionOverride: 'no sinal' }]);
  assert.equal(JSON.stringify(out).includes('pending:'), false);
  // item sem temporária: mesmo objeto (nada muda)
  const untouched = [{ id: 's2', imageRefs: [{ imageId: 'asset:asset1' }] }];
  assert.equal(A.remapPendingImageRefs(untouched, {})[0], untouched[0]);
});

test('093c 10-11: imagem existente vinculada não faz upload; mesma imagem não duplica asset', () => {
  // seleção/🔗 só manipula refs (nenhum upload nesses caminhos)
  for (const fn of ['openLesionImagePicker', 'openImageLinkPicker', 'applyImageLinkSelection', 'linkImageRef', 'remapPendingImageRefs']) {
    assert.doesNotMatch(extractFunction(html, fn), /uploadToCloudinary|uploadPendingImage/, fn);
  }
  const imgs = [main(1)];
  assert.equal(A.findSameLesionImage(imgs, { data: imgs[0].data + '?v=2', source: 'url' }), imgs[0], 'URL do mesmo asset = só vínculo');
  // temporária que depois de enviada é o MESMO asset de um vínculo já existente: não duplica o vínculo
  const d = [{ id: 's', imageRefs: [{ imageId: 'asset:asset1', order: 0 }, { imageId: 'pending:p', order: 1 }] }];
  assert.deepEqual(plain(A.remapPendingImageRefs(d, { 'pending:p': 'asset:asset1' })[0].imageRefs.map((r) => r.imageId)), ['asset:asset1']);
  // temporária desvinculada antes do Salvar não vira vínculo
  const u = [{ id: 's', imageRefs: A.unlinkImageRef(A.linkImageRef([], 'pending:q', 1), 'pending:q', 2) }];
  assert.deepEqual(plain(A.remapPendingImageRefs(u, { 'pending:q': 'asset:q' })[0].imageRefs), []);
});

test('093c 12: erro no upload do Salvar -> retorna antes de gravar/remapear (nenhum estado parcial)', () => {
  const iCatch = saveBody.indexOf("toast('Falha ao enviar uma imagem nova ao Cloudinary. Nada foi salvo — tente novamente.');");
  assert.ok(iCatch > 0);
  assert.match(saveBody.slice(iCatch, iCatch + 160), /formSaving=false; return;/);
  const iRemap = saveBody.indexOf('clinicalCasesDraft = remapPendingImageRefs(');
  const iAssign = saveBody.indexOf('existing.name=name;');
  assert.ok(iCatch < iRemap && iRemap < iAssign, 'falha aborta ANTES do remapeamento e de qualquer escrita na lesão');
  assert.match(saveBody, /if\(!hasCloudinaryConfig\(\)\)\{ toast\('Cloudinary indisponível: não foi possível enviar as imagens novas\. Nada foi salvo\.'\); formSaving=false; return; \}/);
});

test('093c 13: regressão — upload principal da lesão continua só no Salvar (pipeline histórico intacto)', () => {
  assert.match(formFn, /function addLocalFile\(file\)\{[\s\S]{0,400}const temp = buildPendingImage\(file, trackObjectUrl\);/);
  assert.doesNotMatch(extractFunction(formFn, 'addLocalFile'), /uploadToCloudinary|uploadPendingImage/);
  assert.match(extractFunction(html, 'buildPendingImage'), /return \{ label:'', data:objectUrl, source:'pending', _file:file, _objectUrl:objectUrl \};/);
  assert.match(formFn, /cloudStatus\.textContent='☁ Cloudinary ativo — imagens novas só são enviadas ao clicar em "Salvar"\.'/);
  // o editor do item não tem mais caminho próprio de upload (o único
  // uploadToCloudinary(f, …) restante é o do construtor de quadro em modo
  // NÃO diferido, usado fora do formulário — inalterado)
  assert.equal((stripComments(editorFn).match(/uploadToCloudinary|uploadPendingImage/g) || []).length, 0);
  assert.match(extractFunction(html, 'openCollageBuilder'), /if\(deferUpload\)\{ item\.durableUrl = item\.url; return; \}/);
});
