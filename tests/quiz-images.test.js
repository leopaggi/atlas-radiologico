'use strict';

/* Testes essenciais das imagens do Quiz clínico (carrossel + "adicionar
 * imagem sem sair do Quiz"). A maior parte deste recurso é interativa/DOM
 * (carrossel, modal, drag de teclado) e o projeto não tem jsdom nem
 * nenhuma dependência de navegador nos testes — por isso este arquivo
 * cobre exatamente o que dá pra verificar sem um browser real:
 *
 *  - addImageToLesionData(): lógica pura, testada dinamicamente (extraída
 *    do index.html real e executada num `vm` isolado).
 *  - Propriedades estruturais/de segurança do restante do recurso
 *    (openQuizAddImageModal, openCommonsImageSearch parametrizada, o
 *    carrossel e a limpeza do listener de teclado), verificadas
 *    estaticamente no texto-fonte real do index.html.
 *
 * A confirmação visual (carrossel aparecendo com 2+ imagens, contador,
 * setas, navegação por teclado, modal abrindo sobre o Quiz sem fechá-lo)
 * depende de teste manual no navegador — não é possível aqui.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) { return source.slice(0, index).split('\n').length; }

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Função ${name} não encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  assert.equal(source[openingBrace], '{');
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  let end = -1;
  for (let i = openingBrace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, `Bloco de ${name} sem fechamento`);
  return {
    source: source.slice(declaration.index, end + 1),
    body: source.slice(openingBrace + 1, end),
    line: lineNumberAt(source, declaration.index)
  };
}

const addImageFn = extractFunction(html, 'addImageToLesionData');
const removeImageFn = extractFunction(html, 'removeImageFromLesionData');
const updateImageLabelFn = extractFunction(html, 'updateLesionImageLabel');
const openQuizAddImageModalFn = extractFunction(html, 'openQuizAddImageModal');
const openCollageBuilderFn = extractFunction(html, 'openCollageBuilder');
const openCommonsImageSearchFn = extractFunction(html, 'openCommonsImageSearch');
const renderQuizCardIntegratedFn = extractFunction(html, 'renderQuizCardIntegrated');
const renderQuizSummaryIntegratedFn = extractFunction(html, 'renderQuizSummaryIntegrated');

// -----------------------------------------------------------------------
// addImageToLesionData() — lógica pura, testada de verdade (vm), não uma
// cópia reescrita.
// -----------------------------------------------------------------------
function runAddImageToLesionData(lesion, imgObj) {
  const context = { Date, Array, Object };
  vm.createContext(context);
  vm.runInContext(addImageFn.source, context, { filename: 'add-image-to-lesion-data.js' });
  return context.addImageToLesionData(lesion, imgObj);
}

function runLesionImageFunction(fn, name, ...args) {
  const context = { Date, Array, Object, Number, String };
  vm.createContext(context);
  vm.runInContext(fn.source, context, { filename: `${name}.js` });
  return context[name](...args);
}

test('addImageToLesionData(): anexa a imagem normalizada à lesão informada', () => {
  const lesion = { id: 'seed_1', name: 'Adamantinoma', images: [] };
  const result = runAddImageToLesionData(lesion, { data: 'https://example.com/x.png', source: 'url' });
  assert.equal(lesion.images.length, 1);
  assert.equal(lesion.images[0].data, 'https://example.com/x.png');
  assert.equal(lesion.images[0].lesionId, 'seed_1');
  assert.equal(lesion.images[0].lesionName, 'Adamantinoma');
  assert.equal(result, lesion.images[0]);
  assert.ok(lesion._userUpdatedAt, 'precisa marcar _userUpdatedAt (edição manual/assistida real)');
});

test('addImageToLesionData(): cria o array images quando a lesão ainda não tinha nenhuma', () => {
  const lesion = { id: 'seed_2', name: 'Osteocondroma' }; // sem `images` ainda
  runAddImageToLesionData(lesion, { data: 'https://example.com/y.png' });
  assert.ok(Array.isArray(lesion.images));
  assert.equal(lesion.images.length, 1);
});

test('addImageToLesionData(): preserva imagens já existentes da lesão (nunca remove)', () => {
  const lesion = { id: 'seed_3', name: 'Fibroma', images: [{ data: 'https://example.com/old.png', source: 'url' }] };
  runAddImageToLesionData(lesion, { data: 'https://example.com/new.png', source: 'url' });
  assert.equal(lesion.images.length, 2);
  assert.equal(lesion.images[0].data, 'https://example.com/old.png');
  assert.equal(lesion.images[1].data, 'https://example.com/new.png');
});

test('addImageToLesionData(): default de source é "url" quando a imagem não informa a própria fonte', () => {
  const lesion = { id: 'seed_4', name: 'Lipoma', images: [] };
  runAddImageToLesionData(lesion, { data: 'https://example.com/z.png' });
  assert.equal(lesion.images[0].source, 'url');
});

test('SEGURANÇA: addImageToLesionData() só grava em UMA lesão — nunca em outra passada por engano', () => {
  const target = { id: 'seed_5', name: 'Condrossarcoma', images: [] };
  const other = { id: 'seed_6', name: 'Osteossarcoma', images: [] };
  runAddImageToLesionData(target, { data: 'https://example.com/w.png' });
  assert.equal(target.images.length, 1);
  assert.equal(other.images.length, 0, 'a lesão não-alvo não pode ser tocada');
});

test('transições 0→1, 1→2 e 2→3+: cada adição preserva as anteriores e atualiza a quantidade da lesão atual', () => {
  const lesion = { id: 'seed_transition', name: 'Lesão teste', images: [] };
  for (let i = 1; i <= 3; i += 1) {
    runAddImageToLesionData(lesion, { data: `https://example.com/${i}.png` });
    assert.equal(lesion.images.length, i);
  }
  assert.deepEqual(lesion.images.map(img => img.data), [
    'https://example.com/1.png',
    'https://example.com/2.png',
    'https://example.com/3.png'
  ]);
});

test('removeImageFromLesionData(): remove somente da lesão alvo e preserva as demais imagens', () => {
  const target = { id: 'seed_target', images: [{ data: 'a' }, { data: 'b' }, { data: 'c' }] };
  const other = { id: 'seed_other', images: [{ data: 'other' }] };
  const removed = runLesionImageFunction(removeImageFn, 'removeImageFromLesionData', target, 1);
  assert.equal(removed.data, 'b');
  assert.deepEqual(target.images.map(img => img.data), ['a', 'c']);
  assert.deepEqual(other.images.map(img => img.data), ['other']);
});

test('removeImageFromLesionData(): suporta 1→0 sem criar ou alterar outra imagem', () => {
  const lesion = { id: 'seed_single', images: [{ data: 'only' }] };
  runLesionImageFunction(removeImageFn, 'removeImageFromLesionData', lesion, 0);
  assert.equal(lesion.images.length, 0);
  assert.ok(lesion._userUpdatedAt);
});

test('updateLesionImageLabel(): persiste só a legenda e preserva ownership/lesionId/metadados', () => {
  const lesion = {
    id: 'seed_label',
    images: [{ data: 'x', label: 'antes', lesionId: 'seed_label', lesionName: 'Lesão', source: 'cloudinary', publicId: 'asset_1' }]
  };
  const before = { ...lesion.images[0] };
  const updated = runLesionImageFunction(updateImageLabelFn, 'updateLesionImageLabel', lesion, 0, 'depois');
  assert.equal(updated.label, 'depois');
  for (const key of ['data', 'lesionId', 'lesionName', 'source', 'publicId']) {
    assert.equal(updated[key], before[key], `${key} não pode mudar ao editar legenda`);
  }
});

test('SEGURANÇA ESTÁTICA: addImageToLesionData() só referencia campos da própria lesão (id/name/images/_userUpdatedAt) — nada de SEED/REVIEW/SRS/DATA', () => {
  assert.doesNotMatch(addImageFn.body, /\bDATA\b/);
  assert.doesNotMatch(addImageFn.body, /\bSEED\b/);
  assert.doesNotMatch(addImageFn.body, /\bREVIEW\b/);
  assert.doesNotMatch(addImageFn.body, /\bSRS\b/);
});

// -----------------------------------------------------------------------
// openQuizAddImageModal() — checagens estáticas de arquitetura/segurança
// (overlay própria, nunca chama closeOverlay(), reaproveita os mecanismos
// existentes, não implementa upload/URL/dedup paralelos).
// -----------------------------------------------------------------------
test('openQuizAddImageModal(): NUNCA chama closeOverlay() (não pode remover a overlay do Quiz por baixo)', () => {
  assert.doesNotMatch(openQuizAddImageModalFn.source, /closeOverlay\(/);
});

test('openQuizAddImageModal(): usa uma classe própria, não ".overlay" (fora do alcance de closeOverlay())', () => {
  assert.match(openQuizAddImageModalFn.source, /cov\.className\s*=\s*['"]quiz-img-modal-overlay['"]/);
  assert.doesNotMatch(openQuizAddImageModalFn.source, /cov\.className\s*=\s*['"]overlay['"]/);
});

test('openQuizAddImageModal(): reaproveita os helpers compartilhados de upload e a busca de Commons — não reimplementa upload/busca', () => {
  assert.match(openQuizAddImageModalFn.source, /uploadPendingImage\(/, 'precisa reaproveitar o mesmo helper de upload do editor de lesões');
  assert.match(openQuizAddImageModalFn.source, /openCommonsImageSearch\(/, 'precisa reaproveitar a mesma busca de imagens livres');
  assert.doesNotMatch(openQuizAddImageModalFn.source, /wikimedia\.org/i, 'não pode ter uma segunda integração de busca duplicada');
});

test('openQuizAddImageModal(): persiste via saveData() (mesmo caminho seguro já usado pelo resto do app)', () => {
  assert.match(openQuizAddImageModalFn.source, /\bsaveData\(\)/);
});

test('openQuizAddImageModal(): a lesão-alvo vem do parâmetro lesionId, nunca de um estado de UI "atual" adivinhado', () => {
  assert.match(openQuizAddImageModalFn.source, /DATA\.find\(x=>x\.id===lesionId\)/);
});

test('galeria do Quiz exibe controles claros e persistentes de Editar e Remover', () => {
  assert.match(openQuizAddImageModalFn.source, /✏ Editar/);
  assert.match(openQuizAddImageModalFn.source, /🗑 Remover/);
  assert.match(openQuizAddImageModalFn.source, /quiz-img-edit-save/);
  assert.match(openQuizAddImageModalFn.source, /confirm\(['"]Remover esta imagem desta lesão\?['"]\)/);
});

test('remoção e edição operam no rascunho local e só aplicam à lesão no "concluído"', () => {
  assert.match(openQuizAddImageModalFn.source, /draftImgs\.splice\(idx,1\)/);
  assert.match(openQuizAddImageModalFn.source, /draftImgs\[idx\]\.label = labelInput\.value/);
  assert.match(openQuizAddImageModalFn.source, /lesion\.images = draftImgs\.map\(/);
  assert.match(openQuizAddImageModalFn.source, /await saveData\(\);/);
  assert.match(openQuizAddImageModalFn.source, /onImagesAdded\(\)/);
});

test('Ctrl+V: lê imagens do clipboard e adiciona como temporário local (sem upload imediato)', () => {
  assert.match(openQuizAddImageModalFn.source, /clipboardData\?\.items/);
  assert.match(openQuizAddImageModalFn.source, /addLocalFiles\(files\)/);
  assert.match(openQuizAddImageModalFn.source, /cov\.addEventListener\(['"]paste['"],\s*handlePaste\)/);
  assert.match(openQuizAddImageModalFn.source, /#quiz-add-img-upload-box['"]\)\.focus\(\)/);
});

test('Ctrl+V: listener fica restrito ao modal ativo e não captura paste globalmente', () => {
  assert.doesNotMatch(openQuizAddImageModalFn.source, /document\.addEventListener\(['"]paste['"]/);
  assert.doesNotMatch(openQuizAddImageModalFn.source, /document\.onpaste/);
});

test('Quadro de Imagem: Quiz e editor reutilizam o mesmo openCollageBuilder() parametrizado', () => {
  assert.match(openQuizAddImageModalFn.source, /openCollageBuilder\(\{id:\s*lesion\.id,\s*name:\s*lesion\.name\}/);
  assert.match(openCollageBuilderFn.source, /function openCollageBuilder\(lesionMeta,\s*onCollageReady,\s*existingPanels,\s*deferUpload(?:,\s*existingLabel)?\)/);
  assert.match(openCollageBuilderFn.source, /uploadToCloudinary\(file,lesionMeta\)/);
  assert.match(openCollageBuilderFn.source, /onCollageReady\(imgObj\)/);
  assert.doesNotMatch(openCollageBuilderFn.source, /pendingImgs/, 'o construtor compartilhado não pode depender do estado privado do formulário');
  assert.ok((html.match(/openCollageBuilder\(/g) || []).length >= 4, 'a mesma função deve atender criação/edição no formulário e o Quiz');
});

test('callback do "concluído" persiste e atualiza o visualizador do Quiz (só depois do upload)', () => {
  assert.match(openQuizAddImageModalFn.source, /lesion\.images = draftImgs\.map\([\s\S]*?await saveData\(\);[\s\S]*?onImagesAdded\(\);/);
  // Desde as métricas de imagem da sidebar (2026-09-21), o callback também
  // chama renderAll() para refletir a nova imagem sem F5 (overlays intactas).
  assert.match(renderQuizCardIntegratedFn.source, /openQuizAddImageModal\(e\.id,\s*\(\)=>\{\s*refreshQuizImgs\(true\);\s*renderAll\(\);\s*\}\)/);
});

test('openCommonsImageSearch(): foi parametrizada (lesionMeta/initialTerm/onImagesAdded + deferUpload) — não depende mais de pendingImgs/f-en-term/f-name do formulário de edição', () => {
  assert.match(openCommonsImageSearchFn.source, /function openCommonsImageSearch\(lesionMeta,\s*initialTerm,\s*onImagesAdded,\s*deferUpload\)/);
  assert.doesNotMatch(openCommonsImageSearchFn.body, /pendingImgs/, 'não pode mais depender do estado interno do formulário de edição');
  assert.doesNotMatch(openCommonsImageSearchFn.body, /getElementById\(['"]f-en-term['"]\)/, 'não pode mais ler campos do formulário de edição diretamente');
});

// -----------------------------------------------------------------------
// Carrossel dentro de renderQuizCardIntegrated() — checagens estáticas de
// que o estado reinicia por questão, o listener de teclado não vaza, e a
// navegação não interfere com campos de texto.
// -----------------------------------------------------------------------
test('carrossel: o índice/array de imagens é declarado DENTRO de renderQuizCardIntegrated() — reinicia a cada questão, nunca é uma variável global compartilhada', () => {
  assert.match(renderQuizCardIntegratedFn.body, /let\s+quizImgs\s*=\s*\[\]/);
  assert.match(renderQuizCardIntegratedFn.body, /let\s+quizImgIdx\s*=\s*st\.imgIdx\s*\|\|\s*0/);
});

test('carrossel: navegação por teclado ignora campos de texto e o modal de adicionar imagem/lightbox abertos', () => {
  assert.match(renderQuizCardIntegratedFn.body, /tag===['"]INPUT['"]/);
  assert.match(renderQuizCardIntegratedFn.body, /tag===['"]TEXTAREA['"]/);
  assert.match(renderQuizCardIntegratedFn.body, /quiz-img-modal-overlay/);
});

test('visualizador cobre 0 imagens, 1 imagem e 2+ com contador circular', () => {
  assert.match(renderQuizCardIntegratedFn.source, /if\(!quizImgs\.length\)[\s\S]*?CASO TEÓRICO/);
  assert.match(renderQuizCardIntegratedFn.source, /hasMultiple=quizImgs\.length>1/);
  assert.match(renderQuizCardIntegratedFn.source, /Imagem \$\{quizImgIdx\+1\} de \$\{quizImgs\.length\}/);
  assert.match(renderQuizCardIntegratedFn.source, /if\(quizImgIdx<0\) quizImgIdx=quizImgs\.length-1/);
  assert.match(renderQuizCardIntegratedFn.source, /if\(quizImgIdx>=quizImgs\.length\) quizImgIdx=0/);
});

test('carrossel: o listener de teclado é removido antes de criar um novo (nunca acumula um por questão)', () => {
  assert.match(renderQuizCardIntegratedFn.body, /if\(quizCarouselKeyHandler\)\s*document\.removeEventListener\(['"]keydown['"],\s*quizCarouselKeyHandler\)/);
});

test('carrossel: o listener de teclado é limpo ao sair do Quiz (voltar/finalizar) e ao chegar no resumo da sessão', () => {
  assert.match(renderQuizCardIntegratedFn.body, /leaveQuiz\s*=\s*\(\)=>\{[\s\S]*?removeEventListener\(['"]keydown['"],\s*quizCarouselKeyHandler\)/);
  assert.match(renderQuizSummaryIntegratedFn.body, /removeEventListener\(['"]keydown['"],\s*quizCarouselKeyHandler\)/);
});

test('pós-resposta: as ações (adicionar imagem/editar/revisão) só existem no feedback respondido', () => {
  const src = renderQuizCardIntegratedFn.source;
  const fbStart = src.indexOf('function renderAnsweredFeedback(){');
  assert.notEqual(fbStart, -1, 'renderAnsweredFeedback() não encontrado');
  const fbEnd = src.indexOf('\n  if(st.answered){', fbStart);
  assert.notEqual(fbEnd, -1);
  const fbBlock = src.slice(fbStart, fbEnd);
  assert.match(fbBlock, /openQuizAddImageModal\(e\.id/);
  assert.match(fbBlock, /openForm\(e\.id, \{/);
  assert.match(fbBlock, /openQuizReviewModal\(e\.id\)/);
  // o feedback respondido é montado só no fluxo de resposta, depois do HTML inicial
  const initialHtmlEnd = src.indexOf('const media=host.querySelector');
  assert.ok(fbStart > initialHtmlEnd, 'as ações pós-resposta não podem existir antes de responder');
});

test('SEGURANÇA ESTÁTICA: o fluxo de adicionar imagem do Quiz não referencia REVIEW/SRS/SESSIONLOG/SEED', () => {
  for (const fn of [openQuizAddImageModalFn, openCollageBuilderFn, addImageFn, removeImageFn, updateImageLabelFn]) {
    assert.doesNotMatch(fn.body, /\bREVIEW\b/);
    assert.doesNotMatch(fn.body, /\bSRS\b/);
    assert.doesNotMatch(fn.body, /\bSESSIONLOG\b/);
    assert.doesNotMatch(fn.body, /\bSEED\b/);
  }
});

test('SEGURANÇA: adicionar imagem/quadro não altera questão, resposta, pontuação ou progresso da sessão', () => {
  for (const fn of [openQuizAddImageModalFn, openCollageBuilderFn, addImageFn, removeImageFn, updateImageLabelFn]) {
    assert.doesNotMatch(fn.body, /\bquizIndex\b/);
    assert.doesNotMatch(fn.body, /\bquizStats\b/);
    assert.doesNotMatch(fn.body, /\bquizQueue\b/);
    assert.doesNotMatch(fn.body, /\brecordQuizAnswerToday\b/);
    assert.doesNotMatch(fn.body, /\blogSessionResult\b/);
  }
});

// -----------------------------------------------------------------------
// UPLOAD DIFERIDO (estratégia nova): imagens NOVAS do formulário Editar
// ficam temporárias (blob URL + File em memória) e só vão ao Cloudinary no
// "Salvar". Sem Firebase Function e sem delete remoto.
// -----------------------------------------------------------------------
function openFormSlice() {
  const start = html.indexOf('function openForm(id');
  assert.notEqual(start, -1, 'openForm não encontrada');
  const end = html.indexOf('\nfunction openCollageBuilder(', start);
  assert.notEqual(end, -1, 'fim de openForm não encontrado');
  return html.slice(start, end);
}

test('EDITAR (upload diferido): Ctrl+V e seleção de arquivo NÃO chamam uploadToCloudinary — só criam imagem temporária', () => {
  const src = openFormSlice();
  assert.match(src, /function addLocalFile\(file\)\{/);
  const start = src.indexOf('function addLocalFile(file)');
  const end = src.indexOf("imgFileInput.addEventListener('change'", start);
  const body = src.slice(start, end);
  assert.doesNotMatch(body, /uploadToCloudinary/, 'addLocalFile não pode subir ao Cloudinary');
  assert.match(body, /buildPendingImage\(file,\s*trackObjectUrl\)/);
  assert.match(src, /function trackObjectUrl\(file\)\{ const url=URL\.createObjectURL\(file\);/);
  assert.match(src, /imgBox\.addEventListener\('paste',[\s\S]*?addLocalFile\(f\)/);
  assert.match(src, /imgFileInput\.addEventListener\('change',[\s\S]*?addLocalFile\(file\)/);
});

test('EDITAR (upload diferido): remover uma imagem temporária antes do Salvar não gera upload', () => {
  const src = openFormSlice();
  assert.match(src, /img-gallery-remove'\)\.addEventListener\('click',[\s\S]*?pendingImgs\.splice\(idx,1\)[\s\S]*?revokeObjectUrl/);
  const idx = src.indexOf(".img-gallery-remove')");
  const slice = src.slice(idx, idx + 260);
  assert.doesNotMatch(slice, /uploadToCloudinary/);
});

test('EDITAR (upload diferido): Cancelar não envia imagem temporária (só libera blob URLs e fecha)', () => {
  const src = openFormSlice();
  assert.match(src, /f-cancel'\)\.onclick = \(\)=>\{ releasePendingObjectUrls\(\);[^}]*closeForm\(\)/);
  const idx = src.indexOf("f-cancel')");
  const slice = src.slice(idx, idx + 200);
  assert.doesNotMatch(slice, /uploadToCloudinary/);
});

test('EDITAR (upload diferido): Salvar envia somente as temporárias presentes e substitui pelo retorno do Cloudinary', () => {
  const src = openFormSlice();
  assert.match(src, /if\(x\.source==='pending' && x\._file\)\{/);
  assert.match(src, /normalized\.push\(await uploadPendingImage\(x, \{id:entryId,name\}\)\)/);
});

test('EDITAR (upload diferido): a persistência (storage.set) acontece depois dos uploads necessários', () => {
  const src = openFormSlice();
  const uploadIdx = src.indexOf('uploadPendingImage(x,');
  const persistIdx = src.indexOf('storage.set(STORAGE_KEY');
  assert.notEqual(uploadIdx, -1);
  assert.notEqual(persistIdx, -1);
  assert.ok(uploadIdx < persistIdx, 'os uploads precisam vir antes de persistir a lesão');
});

test('EDITAR (upload diferido): Commons usa a mesma regra (deferUpload=true) e só baixa o arquivo', () => {
  const src = openFormSlice();
  assert.match(src, /openCommonsImageSearch\(getCurrentLesionMeta\(\),\s*initialTerm,\s*\(imgs\)=>\{[\s\S]*?\},\s*true\)/);
  assert.match(openCommonsImageSearchFn.source, /function openCommonsImageSearch\(lesionMeta,\s*initialTerm,\s*onImagesAdded,\s*deferUpload\)/);
  assert.match(openCommonsImageSearchFn.body, /if\(deferUpload\)\{[\s\S]*?source:'pending'[\s\S]*?_file:f/);
});

test('EDITAR (upload diferido): URL externa continua sendo salva como URL, sem upload', () => {
  const src = openFormSlice();
  assert.match(src, /img-add-url'\)\.onclick=[\s\S]*?pendingImgs\.push\(\{label:'',data:url,source:'url'\}\)/);
});

test('SEM BACKEND: o frontend não tem mais gancho de delete remoto nem script de Functions', () => {
  assert.doesNotMatch(html, /requestCloudinaryAssetDeletion/);
  assert.doesNotMatch(html, /hasSecureCloudinaryIdentifier/);
  assert.doesNotMatch(html, /deleteCloudinaryAsset/);
  assert.doesNotMatch(html, /firebase-functions-compat/);
  assert.doesNotMatch(html, /firebase\.functions/);
});

test('SEM SEGREDO: o frontend não contém CLOUDINARY_API_SECRET nem api_secret', () => {
  assert.doesNotMatch(html, /CLOUDINARY_API_SECRET/);
  assert.doesNotMatch(html, /api_secret/i);
  assert.doesNotMatch(html, /CLOUDINARY_API_KEY/);
});

test('SEM BACKEND: não existe diretório functions/ nem teste de delete remoto', () => {
  assert.equal(fs.existsSync(path.resolve(__dirname, '..', 'functions')), false);
  assert.equal(fs.existsSync(path.resolve(__dirname, '..', 'tests', 'cloudinary-deletion.test.js')), false);
});

// -----------------------------------------------------------------------
// QUADRO DE IMAGEM no formulário Editar — upload diferido (mesma regra).
// O construtor é compartilhado com o Quiz; o Quiz mantém upload imediato.
// -----------------------------------------------------------------------
test('QUADRO (Editar): aberto com deferUpload=true e NÃO envia painéis ao Cloudinary', () => {
  const src = openFormSlice();
  assert.match(src, /openCollageBuilder\(getCurrentLesionMeta\(\),\s*collage=>\{[\s\S]*?\},\s*null,\s*true\)/);
  assert.match(openCollageBuilderFn.source, /function openCollageBuilder\(lesionMeta,\s*onCollageReady,\s*existingPanels,\s*deferUpload(?:,\s*existingLabel)?\)/);
  assert.match(openCollageBuilderFn.source, /if\(deferUpload\)\{ item\.durableUrl = item\.url; return; \}/);
});

test('QUADRO (Editar): o resultado entra como imagem pendente/temporária (source pending + File + blob URL + data local)', () => {
  assert.match(openCollageBuilderFn.source, /onCollageReady\(\{label, panels, data:objectUrl, source:'pending', _file:file, _objectUrl:objectUrl\}\)/);
  assert.match(openFormSlice(), /collage\.source==='pending' && collage\._objectUrl\) pendingObjectUrls\.add\(collage\._objectUrl\)/);
});

test('QUADRO (Editar): o ramo diferido do insert NÃO chama uploadToCloudinary', () => {
  const start = openCollageBuilderFn.source.indexOf('if(deferUpload){');
  assert.notEqual(start, -1);
  const end = openCollageBuilderFn.source.indexOf('return;', start);
  const branch = openCollageBuilderFn.source.slice(start, end);
  assert.doesNotMatch(branch, /uploadToCloudinary/);
});

test('QUADRO (Editar): remover/cancelar antes de Salvar não gera upload (só blob URL temporária)', () => {
  const src = openFormSlice();
  // O quadro entra em pendingImgs e a remoção usa o mesmo handler genérico
  // (splice + revoke), sem qualquer upload.
  assert.match(src, /pendingImgs\.push\(collage\); imgsChanged=true; renderImgGallery\(\)/);
  assert.match(src, /img-gallery-remove'\)\.addEventListener\('click',[\s\S]*?pendingImgs\.splice\(idx,1\)[\s\S]*?revokeObjectUrl/);
});

test('QUADRO (Editar): Salvar faz o upload do quadro exatamente uma vez (pipeline de pendingImgs)', () => {
  const src = openFormSlice();
  const uploads = (src.match(/uploadPendingImage\(x,/g) || []).length;
  assert.equal(uploads, 1, 'o quadro pendente deve subir uma única vez, no Salvar');
  assert.match(src, /normalized\.push\(await uploadPendingImage\(x, \{id:entryId,name\}\)\)/);
});

test('QUADRO (Quiz): agora usa upload diferido (deferUpload=true), igual ao Editar', () => {
  assert.match(openQuizAddImageModalFn.source, /openCollageBuilder\(\{id: lesion\.id, name: lesion\.name\},[\s\S]*?\},\s*null,\s*true\)/);
});

// -----------------------------------------------------------------------
// QUADRO (Quiz) — PREVIEW LOCAL enquanto pending (bug real: miniatura
// quebrada e "clique para ampliar" sem imagem antes do "concluído").
// -----------------------------------------------------------------------
test('PREVIEW QUADRO: o quadro pending carrega `data` = blob URL local (mesmo padrão de buildPendingImage)', () => {
  // O produtor do quadro precisa entregar `data` (não só `_objectUrl`), senão
  // a miniatura e o lightbox — que leem `data` — ficam quebrados.
  assert.match(openCollageBuilderFn.source, /const objectUrl=URL\.createObjectURL\(file\);/);
  assert.match(openCollageBuilderFn.source, /onCollageReady\(\{label, panels, data:objectUrl, source:'pending', _file:file, _objectUrl:objectUrl\}\)/);
});

test('PREVIEW QUADRO: a miniatura do Quiz usa a blob URL local enquanto pending (data || _objectUrl)', () => {
  const src = openQuizAddImageModalFn.source;
  assert.match(src, /const src = img\.data \|\| img\._objectUrl \|\| '';/);
  assert.match(src, /<img src="\$\{src\}" class="img-gallery-thumb"/);
  // Nunca monta a miniatura a partir de publicId/URL remota inexistente.
  assert.doesNotMatch(src, /src="\$\{img\.publicId/);
});

test('PREVIEW QUADRO: ampliar/lightbox recebe a MESMA src local do pending (e a legenda atual, pra descrição no maximizar)', () => {
  const src = openQuizAddImageModalFn.source;
  assert.match(src, /item\.querySelector\('\.img-gallery-thumb'\)\.onclick = \(\)=> openImageLightbox\(src, img\.label\);/);
  assert.match(html, /function openImageLightbox\(src, description\)\{/);
});

test('PREVIEW QUADRO: callback do Quiz registra a blob URL do quadro e NÃO faz upload', () => {
  const src = openQuizAddImageModalFn.source;
  const start = src.indexOf("openCollageBuilder({id: lesion.id, name: lesion.name}, collage=>{");
  assert.notEqual(start, -1);
  const end = src.indexOf('}, null, true);', start);
  const callback = src.slice(start, end);
  assert.match(callback, /collage\.source==='pending' && collage\._objectUrl\) draftObjectUrls\.add\(collage\._objectUrl\)/);
  assert.match(callback, /addDraftImages\(\[collage\]\)/);
  assert.doesNotMatch(callback, /uploadPendingImage|uploadToCloudinary|saveData|lesion\.images/);
});

test('PREVIEW QUADRO: rerenderizar a galeria NÃO revoga a blob URL (só o Remover revoga)', () => {
  const src = openQuizAddImageModalFn.source;
  const start = src.indexOf('function renderGallery(){');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  // O único revoke permitido dentro de renderGallery é o do botão Remover.
  assert.equal((body.match(/revokeDraftObjectUrl/g) || []).length, 1, 'renderGallery só revoga no Remover');
  assert.doesNotMatch(body, /releaseDraftObjectUrls/);
  const rerenderIdx = body.indexOf("galleryEl.innerHTML = '';");
  const revokeIdx = body.indexOf('revokeDraftObjectUrl');
  assert.ok(rerenderIdx !== -1 && revokeIdx > rerenderIdx, 'o rerender em si não revoga');
});

test('PREVIEW QUADRO: editar legenda apenas muda o label e rerenderiza (não revoga/upload)', () => {
  const src = openQuizAddImageModalFn.source;
  const idx = src.indexOf('draftImgs[idx].label = labelInput.value;');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 90);
  assert.match(slice, /renderGallery\(\)/);
  assert.doesNotMatch(slice, /revoke|upload|saveData/);
});

test('PREVIEW QUADRO: remover pending revoga a blob URL e não faz upload', () => {
  const src = openQuizAddImageModalFn.source;
  const idx = src.indexOf('draftImgs.splice(idx,1)');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 180);
  assert.match(slice, /removed\.source==='pending'\) revokeDraftObjectUrl\(removed\._objectUrl\)/);
  assert.doesNotMatch(slice, /uploadPendingImage|uploadToCloudinary|saveData/);
});

test('PREVIEW QUADRO: Concluído substitui pending pelo remoto e revoga a URL local só depois do upload', () => {
  const src = openQuizAddImageModalFn.source;
  const upIdx = src.indexOf('const remote = await uploadPendingImage(img');
  const revokeIdx = src.indexOf('revokeDraftObjectUrl(img._objectUrl);', upIdx);
  const replaceIdx = src.indexOf('draftImgs[i] = remote;', upIdx);
  assert.ok(upIdx !== -1 && revokeIdx !== -1 && replaceIdx !== -1, 'upload -> revoke -> substituir');
  assert.ok(upIdx < revokeIdx && revokeIdx < replaceIdx, 'só revoga/substitui DEPOIS do upload dar certo');
});

test('PREVIEW QUADRO: falha no upload mantém o preview local e NÃO persiste a lesão', () => {
  const src = openQuizAddImageModalFn.source;
  const catchIdx = src.indexOf("console.error('Cloudinary upload (quiz concluir)', err);");
  assert.notEqual(catchIdx, -1);
  const slice = src.slice(catchIdx, catchIdx + 320);
  assert.match(slice, /renderGallery\(\)/, 'preview local continua sendo renderizado');
  assert.match(slice, /return;/, 'não segue para a persistência');
  assert.doesNotMatch(slice, /lesion\.images =|saveData\(\)/);
});

test('PREVIEW QUADRO: DATA só muda no "concluído" (nenhum caminho de preview grava na lesão)', () => {
  const src = openQuizAddImageModalFn.source;
  assert.equal((src.match(/lesion\.images\s*=/g) || []).length, 1, 'só o concluído aplica o rascunho à lesão');
  assert.equal((src.match(/saveData\(\)/g) || []).length, 1, 'só o concluído persiste');
});

test('PREVIEW QUADRO: cancelar/fechar revoga as URLs locais e não persiste nem envia', () => {
  const src = openQuizAddImageModalFn.source;
  assert.match(src, /function releaseDraftObjectUrls\(\)\{[\s\S]*?draftObjectUrls\.clear\(\);/);
  const idx = src.indexOf('const close = ()=>');
  const slice = src.slice(idx, idx + 160);
  assert.match(slice, /releaseDraftObjectUrls\(\)/);
  assert.doesNotMatch(slice, /saveData|uploadPendingImage|lesion\.images/);
});

test('PREVIEW QUADRO: Ctrl+V/arquivo continuam usando o mesmo pending com data local', () => {
  const src = openQuizAddImageModalFn.source;
  assert.match(src, /addDraftImages\(\[buildPendingImage\(file, trackDraftObjectUrl\)\]\)/);
  assert.match(html, /return \{ label:'', data:objectUrl, source:'pending', _file:file, _objectUrl:objectUrl \};/);
});

// -----------------------------------------------------------------------
// MODAL DO QUIZ — transacional (rascunho local + "concluído").
// -----------------------------------------------------------------------
test('HELPERS COMPARTILHADOS: buildPendingImage/uploadPendingImage atendem Editar e Quiz', () => {
  assert.match(html, /function buildPendingImage\(file, trackObjectUrl\)\{/);
  assert.match(html, /async function uploadPendingImage\(img, lesionMeta\)\{/);
  assert.match(html, /return \{ label:'', data:objectUrl, source:'pending', _file:file, _objectUrl:objectUrl \};/);
  assert.match(html, /const remote = await uploadToCloudinary\(img\._file, lesionMeta\);/);
  assert.ok((html.match(/buildPendingImage\(/g) || []).length >= 2, 'Editar e Quiz compartilham buildPendingImage');
  assert.ok((html.match(/uploadPendingImage\(/g) || []).length >= 2, 'Editar e Quiz compartilham uploadPendingImage');
});

test('QUIZ (upload diferido): Ctrl+V/arquivo só criam temporário local — o único upload está no "concluído"', () => {
  const src = openQuizAddImageModalFn.source;
  const start = src.indexOf('function addLocalFiles(files){');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.doesNotMatch(body, /uploadPendingImage|uploadToCloudinary/);
  assert.match(body, /buildPendingImage\(file,\s*trackDraftObjectUrl\)/);
  assert.equal((src.match(/uploadPendingImage\(/g) || []).length, 1, 'o upload só pode acontecer no handler de "concluído"');
});

test('QUIZ (upload diferido): Commons é chamado com deferUpload=true (mesmo mecanismo do Editar)', () => {
  assert.match(openQuizAddImageModalFn.source, /openCommonsImageSearch\(\{id: lesion\.id, name: lesion\.name\}, initialTerm,[\s\S]*?\},\s*true\)/);
});

test('QUIZ (upload diferido): remover temporária no rascunho não gera upload', () => {
  const src = openQuizAddImageModalFn.source;
  const idx = src.indexOf('draftImgs.splice(idx,1)');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 200);
  assert.doesNotMatch(slice, /uploadPendingImage|uploadToCloudinary/);
});

test('QUIZ (upload diferido): Esc/clique fora/cancelar descartam o rascunho sem upload e sem tocar DATA', () => {
  const src = openQuizAddImageModalFn.source;
  assert.match(src, /const close = \(\)=>\{ releaseDraftObjectUrls\(\); if\(cov\.isConnected\) cov\.remove\(\);/);
  const idx = src.indexOf('const close = ()=>');
  const slice = src.slice(idx, idx + 220);
  assert.doesNotMatch(slice, /saveData|uploadPendingImage|uploadToCloudinary|lesion\.images/);
  assert.match(src, /cov\.addEventListener\('click', ev=>\{ if\(ev\.target===cov\) close\(\); \}\)/);
  assert.match(src, /ev\.key==='Escape'[\s\S]*?close\(\)/);
});

test('QUIZ (concluído): sobe só as temporárias presentes, cada uma uma vez, e persiste depois', () => {
  const src = openQuizAddImageModalFn.source;
  assert.match(src, /if\(!\(img && img\.source==='pending' && img\._file\)\) continue;/);
  assert.match(src, /const remote = await uploadPendingImage\(img, \{id: lesion\.id, name: lesion\.name\}\)/);
  assert.match(src, /draftImgs\[i\] = remote;/);
  const uploadIdx = src.indexOf('await uploadPendingImage(img');
  const persistIdx = src.indexOf('await saveData()');
  assert.ok(uploadIdx !== -1 && persistIdx !== -1 && uploadIdx < persistIdx, 'persistência só depois dos uploads');
});

test('QUIZ (upload diferido): imagem já existente não é reenviada (rascunho começa como cópia)', () => {
  assert.match(openQuizAddImageModalFn.source, /const draftImgs = \(Array\.isArray\(lesion\.images\) \? lesion\.images : \[\]\)\.map\(x=>\(\{\.\.\.x\}\)\);/);
  assert.match(openQuizAddImageModalFn.source, /if\(!\(img && img\.source==='pending' && img\._file\)\) continue;/);
});

test('QUIZ (upload diferido): URL externa entra no rascunho e só é associada no "concluído"', () => {
  assert.match(openQuizAddImageModalFn.source, /addDraftImages\(\[\{label:'', data:url, source:'url'\}\]\)/);
  assert.match(openQuizAddImageModalFn.source, /lesion\.images = draftImgs\.map\(/);
});

test('QUIZ (concluído): falha de upload mantém o modal aberto e NÃO persiste a galeria parcialmente', () => {
  const src = openQuizAddImageModalFn.source;
  const catchIdx = src.indexOf("console.error('Cloudinary upload (quiz concluir)'");
  assert.notEqual(catchIdx, -1);
  const returnIdx = src.indexOf('return;', catchIdx);
  assert.notEqual(returnIdx, -1);
  const slice = src.slice(catchIdx, returnIdx + 'return;'.length);
  assert.match(slice, /renderGallery\(\)/);
  assert.match(slice, /return;/);
  assert.doesNotMatch(slice, /saveData|lesion\.images/);
});

test('QUIZ (upload diferido): não reinicia questão nem toca score/SESSIONLOG/SRS', () => {
  const src = openQuizAddImageModalFn.source;
  assert.doesNotMatch(src, /\bquizIndex\b/);
  assert.doesNotMatch(src, /\bquizStats\b/);
  assert.doesNotMatch(src, /\bquizQueue\b/);
  assert.doesNotMatch(src, /\bSESSIONLOG\b/);
  assert.doesNotMatch(src, /\bSRS\b/);
  assert.doesNotMatch(src, /renderQuizCardIntegrated|openProgressDashboard/);
});

// -----------------------------------------------------------------------
// QUIZ → EDITAR ESTA LESÃO NO ACERVO → VOLTAR AO MESMO PONTO
// -----------------------------------------------------------------------
test('QUIZ → EDITAR: botão aparece só no pós-resposta e reutiliza openForm (sem segundo formulário)', () => {
  const src = renderQuizCardIntegratedFn.source;
  const fbStart = src.indexOf('function renderAnsweredFeedback(){');
  const editBtnIdx = src.indexOf('id="quiz-edit-lesion-btn"');
  const editHandlerIdx = src.indexOf("fb.querySelector('#quiz-edit-lesion-btn').onclick=");
  assert.notEqual(fbStart, -1);
  assert.ok(editBtnIdx > fbStart, 'o botão de editar deve existir apenas no feedback respondido');
  assert.ok(editHandlerIdx > editBtnIdx);
  const editEnd = src.indexOf("fb.querySelector('#quiz-review-btn')", editHandlerIdx);
  const editBlock = src.slice(editHandlerIdx, editEnd);
  assert.match(editBlock, /openForm\(e\.id, \{/, 'precisa reutilizar openForm com a lesão da questão atual');
  assert.match(editBlock, /preserveUnderlyingOverlay: true/);
  assert.doesNotMatch(editBlock, /renderQuizCardIntegrated|quizIndex|quizStats|srsGradeLevel|recordQuizAnswerToday/, 'editar não pode reiniciar a questão nem pontuar');
});

test('QUIZ → EDITAR: openForm ganha opts e closeForm preserva a overlay do Quiz quando pedido', () => {
  const src = openFormSlice();
  assert.match(src, /function openForm\(id, opts\)\{/);
  assert.match(src, /const preserveUnderlyingOverlay = opts\.preserveUnderlyingOverlay === true;/);
  assert.match(src, /const closeForm = \(\)=>\{\s*if\(preserveUnderlyingOverlay\)\{ if\(ov\.isConnected\) ov\.remove\(\); \}\s*else \{ closeOverlay\(\); \}/);
  assert.match(src, /ov\.className = 'overlay lesion-form-overlay'/);
  assert.match(src, /if\(onSaved\)\{ try\{ onSaved\(\); \}/);
});

test('QUIZ → EDITAR: o carrossel ignora ←/→ enquanto o formulário (.lesion-form-overlay) está aberto', () => {
  assert.match(renderQuizCardIntegratedFn.source, /\.lesion-form-overlay'\)\) return;/);
});

test('QUIZ → EDITAR: após salvar, atualiza o detalhe do feedback e a mídia sem reiniciar a questão', () => {
  const src = renderQuizCardIntegratedFn.source;
  const editStart = src.indexOf("fb.querySelector('#quiz-edit-lesion-btn').onclick=");
  const editEnd = src.indexOf("fb.querySelector('#quiz-review-btn')", editStart);
  const editBlock = src.slice(editStart, editEnd);
  assert.match(editBlock, /detailEl\.outerHTML = renderDetail\(\)/);
  assert.match(editBlock, /refreshQuizImgs\(false, true\)/);
});

// -----------------------------------------------------------------------
// PULAR PERGUNTA (⏭) — só antes de responder; move para o fim da fila
// -----------------------------------------------------------------------
function skipBlockSource() {
  const src = renderQuizCardIntegratedFn.source;
  const start = src.indexOf('if(skipBtn) skipBtn.onclick=');
  assert.notEqual(start, -1, 'handler de Pular não encontrado');
  const end = src.indexOf('\n  };', start);
  assert.notEqual(end, -1);
  return src.slice(start, end);
}

test('PULAR: botão existe antes de responder, fica fora do #quiz-feedback e some depois de responder', () => {
  const src = renderQuizCardIntegratedFn.source;
  const skipIdx = src.indexOf('id="quiz-skip-btn"');
  const feedbackIdx = src.indexOf('id="quiz-feedback"');
  assert.notEqual(skipIdx, -1, 'botão Pular não encontrado no HTML da questão');
  assert.ok(skipIdx < feedbackIdx, 'o botão Pular deve ficar antes do feedback (não é ação pós-resposta)');
  assert.match(src, /skipBtn\.style\.display='none'/, 'o botão precisa sumir depois de responder');
});

test('PULAR: move a questão atual para o FIM da fila, sem duplicar e sem avançar o quizIndex', () => {
  const block = skipBlockSource();
  assert.match(block, /quizQueue\.splice\(quizIndex,1\)\[0\]/);
  assert.match(block, /quizQueue\.push\(cur\)/);
  assert.doesNotMatch(block, /quizIndex\+\+/, 'pular não pode avançar o índice/progresso');
  assert.doesNotMatch(block, /quizQueue\.push\(quizQueue\[quizIndex\]\)/, 'não pode duplicar a questão');
});

test('PULAR: NÃO toca score/SRS/SESSIONLOG/quizSessionWrongIds nem revela a resposta', () => {
  const block = skipBlockSource();
  assert.doesNotMatch(block, /quizStats|SRS|SESSIONLOG|recordQuizAnswerToday|srsGradeLevel|quizSessionWrongIds/);
  assert.doesNotMatch(block, /is-correct|is-wrong|quiz-feedback|renderDetail/);
});

test('PULAR: guarda contra loop infinito quando é a última questão pendente', () => {
  const block = skipBlockSource();
  assert.match(block, /quizQueue\.length - quizIndex <= 1/);
  assert.match(block, /toast\('Esta é a última questão pendente da sessão\.'\)/);
  // nesse caso não mexe na fila (o return vem antes do splice)
  const guardIdx = block.indexOf('quizQueue.length - quizIndex <= 1');
  const spliceIdx = block.indexOf('quizQueue.splice');
  assert.ok(guardIdx < spliceIdx, 'a checagem da última questão precisa vir antes de mexer na fila');
});

test('PULAR: re-renderiza trocando o handler do carrossel (nunca acumula listeners)', () => {
  // renderQuizCardIntegrated remove o handler anterior logo no início e o
  // recria no fim; como pular chama renderQuizCardIntegrated(host), não acumula.
  assert.match(renderQuizCardIntegratedFn.source, /if\(quizCarouselKeyHandler\) document\.removeEventListener\('keydown', quizCarouselKeyHandler\);/);
  assert.match(skipBlockSource(), /renderQuizCardIntegrated\(host\)/);
});

// -----------------------------------------------------------------------
// CARROSSEL: overlay superior ‹ 1 / 2 › (contador + setas)
// -----------------------------------------------------------------------
test('CARROSSEL: 2+ imagens mostram o overlay superior com contador ‹ n / total ›', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /const cur=quizImgs\[quizImgIdx\], hasMultiple=quizImgs\.length>1;/);
  assert.match(src, /hasMultiple\?`<div class="quiz-carousel-overlay"/);
  assert.match(src, /quiz-carousel-ov-prev" aria-label="Imagem anterior">‹</);
  assert.match(src, /quiz-carousel-ov-next" aria-label="Próxima imagem">›</);
  assert.match(src, /quiz-carousel-ov-count" aria-live="polite" aria-label="Imagem \$\{quizImgIdx\+1\} de \$\{quizImgs\.length\}">\$\{quizImgIdx\+1\} \/ \$\{quizImgs\.length\}</);
});

test('CARROSSEL: 0 imagem mantém CASO TEÓRICO e 1 imagem não mostra overlay (só hasMultiple)', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /if\(!quizImgs\.length\)[\s\S]*?CASO TEÓRICO/);
  // o overlay existe num único ponto, gated por hasMultiple
  assert.equal((src.match(/quiz-carousel-overlay/g) || []).length, 1);
  assert.match(src, /hasMultiple\?`<div class="quiz-carousel-overlay"[\s\S]*?<\/div>`:''\}/);
  // o contador inferior antigo foi removido (sem tripla navegação)
  assert.doesNotMatch(src, /quiz-carousel-controls|quiz-carousel-textprev|quiz-carousel-textnext|quiz-carousel-textcount|quiz-carousel-counter/);
});

test('CARROSSEL: setas laterais e setas do overlay controlam o MESMO quizImgIdx (um só estado)', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /const goPrev=\(\)=>\{ quizImgIdx--; renderMedia\(\); \};/);
  assert.match(src, /const goNext=\(\)=>\{ quizImgIdx\+\+; renderMedia\(\); \};/);
  assert.match(src, /media\.querySelector\('\.quiz-carousel-prev'\)\.onclick=goPrev;/);
  assert.match(src, /media\.querySelector\('\.quiz-carousel-next'\)\.onclick=goNext;/);
  assert.match(src, /media\.querySelector\('\.quiz-carousel-ov-prev'\)\.onclick=goPrev;/);
  assert.match(src, /media\.querySelector\('\.quiz-carousel-ov-next'\)\.onclick=goNext;/);
});

test('CARROSSEL: navegação circular e índice sempre dentro dos limites', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /if\(quizImgIdx<0\) quizImgIdx=quizImgs\.length-1;/);
  assert.match(src, /if\(quizImgIdx>=quizImgs\.length\) quizImgIdx=0;/);
});

test('CARROSSEL: clicar nos controles NÃO abre o lightbox (lightbox só no clique da imagem)', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /const im=media\.querySelector\('img'\); if\(im\) im\.onclick=\(\)=>openImageLightbox\(cur\.data, st\.answered \? cur\.label : ''\);/);
  const controlsBlock = src.slice(src.indexOf('quiz-carousel-overlay'), src.indexOf('const im=media.querySelector'));
  assert.doesNotMatch(controlsBlock, /openImageLightbox/);
});

test('CARROSSEL/LIGHTBOX: maximizar a imagem só recebe a descrição DEPOIS de responder (nunca antes — sem vazar dica)', () => {
  const src = renderQuizCardIntegratedFn.source;
  // O mesmo gate (st.answered) usado pelo bloco de descrição ACIMA da imagem
  // (quizImageDescHtml) também precisa valer para o lightbox — só existe UMA
  // chamada a openImageLightbox neste arquivo, e ela precisa ser condicional.
  assert.equal((src.match(/openImageLightbox\(/g) || []).length, 1, 'só pode existir uma chamada ao lightbox no carrossel do Quiz');
  assert.doesNotMatch(src, /openImageLightbox\(cur\.data\)[;,)]/, 'nunca pode chamar sem o segundo argumento (isso voltaria a mostrar a legenda sempre)');
  assert.match(src, /openImageLightbox\(cur\.data, st\.answered \? cur\.label : ''\)/, 'só passa cur.label quando st.answered===true; senão, string vazia (sem caixa no lightbox)');
});

test('CARROSSEL: contador do overlay é dinâmico (quizImgIdx+1 / total) e o índice é único', () => {
  const src = renderQuizCardIntegratedFn.source;
  // Sem segundo índice: o overlay lê o MESMO quizImgIdx e o MESMO quizImgs.
  assert.match(src, /\$\{quizImgIdx\+1\} \/ \$\{quizImgs\.length\}/);
  assert.equal((src.match(/let quizImgIdx/g) || []).length, 1, 'só existe um índice de imagem');
  assert.doesNotMatch(src, /overlayIdx|carouselIdx/);
});

test('CARROSSEL: overlay tem aria-labels (anterior/próxima) e o contador é aria-live', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /quiz-carousel-ov-prev" aria-label="Imagem anterior"/);
  assert.match(src, /quiz-carousel-ov-next" aria-label="Próxima imagem"/);
  assert.match(src, /quiz-carousel-ov-count" aria-live="polite" aria-label="Imagem \$\{quizImgIdx\+1\} de \$\{quizImgs\.length\}"/);
});

test('CARROSSEL: CSS do overlay é absoluto no canto superior esquerdo e não estoura a largura', () => {
  const css = (sel)=>{ const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(html); return m ? m[1] : ''; };
  const carousel = css('.quiz-study-media .quiz-carousel');
  assert.match(carousel, /position:relative/, 'o container da imagem precisa ser a referência do overlay');
  const ov = css('.quiz-carousel-overlay');
  assert.match(ov, /position:absolute/);
  assert.match(ov, /top:8px/);
  assert.match(ov, /left:8px/);
  assert.match(ov, /max-width:calc\(100% - 16px\)/);
  assert.match(ov, /box-sizing:border-box/);
});

test('CARROSSEL: teclado ←/→ usa o mesmo quizImgIdx e respeita formulário/modais/inputs', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /if\(ev\.key==='ArrowLeft'\) quizImgIdx--; else quizImgIdx\+\+;/);
  assert.match(src, /if\(document\.querySelector\('\.quiz-img-modal-overlay, \.quiz-review-modal-overlay, \.lightbox-overlay, \.lesion-form-overlay'\)\) return;/);
  assert.match(src, /if\(tag==='INPUT'\|\|tag==='TEXTAREA'/);
});

test('CARROSSEL: preserva o índice após editar a lesão (keepIndex) e nunca sai do array', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /function refreshQuizImgs\(jumpToLast, keepIndex\)\{/);
  assert.match(src, /if\(keepIndex\) quizImgIdx = all\.length \? Math\.min\(Math\.max\(keepIdx,0\), all\.length-1\) : 0;/);
  assert.match(src, /refreshQuizImgs\(false, true\);/);
});

test('CARROSSEL: navegação de imagens não toca score/SRS/SESSIONLOG', () => {
  const src = renderQuizCardIntegratedFn.source;
  const start = src.indexOf('function renderMedia(){');
  const end = src.indexOf('\n  function refreshQuizImgs', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /quizStats|SRS|SESSIONLOG|srsGradeLevel|recordQuizAnswerToday|quizIndex/);
});

// -----------------------------------------------------------------------
// NAVEGAÇÃO ENTRE QUESTÕES (← Anterior / Próxima →) + estado por questão
// -----------------------------------------------------------------------
const goPrevFn = extractFunction(html, 'goPrevQuestion');
const goNextFn = extractFunction(html, 'goNextQuestion');
const getQStateFn = extractFunction(html, 'getQuizQuestionState');
const recordVisitFn = extractFunction(html, 'recordQuizVisit');

test('NAV QUESTÕES: ← Anterior e Próxima → existem junto de Pular e usam ids próprios', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /id="quiz-prev-btn"[^>]*>← Anterior</);
  assert.match(src, /id="quiz-skip-btn">⏭ Pular</);
  assert.match(src, /id="quiz-next-btn"[^>]*>Próxima →</);
  assert.match(src, /prevBtn\.onclick=\(\)=>goPrevQuestion\(host\)/);
  assert.match(src, /nextBtn\.onclick=\(\)=>goNextQuestion\(host\)/);
});

test('NAV QUESTÕES: Anterior volta na trilha de visitas (quizHistory/quizCursor) sem reordenar a fila nem tocar DATA', () => {
  const src = goPrevFn.source;
  assert.match(src, /if\(quizCursor<=0\) return;/);
  assert.match(src, /quizCursor--;/);
  assert.match(src, /quizQueue\.findIndex\(q=>q\.id===quizHistory\[quizCursor\]\)/);
  assert.doesNotMatch(src, /quizQueue\.(splice|push)\(/, 'navegar não reordena a fila');
  assert.doesNotMatch(src, /\bDATA\b/, 'navegar não toca DATA');
});

test('NAV QUESTÕES: Próxima retorna na trilha quando voltamos; na fronteira só avança se respondida', () => {
  const src = goNextFn.source;
  assert.match(src, /if\(quizCursor<quizHistory\.length-1\)\{[\s\S]*?quizCursor\+\+;[\s\S]*?renderQuizCardIntegrated\(host\);\s*return;/);
  assert.match(src, /if\(!st \|\| !st\.answered\)\{ toast\('Responda ou use Pular para avançar\.'\); return; \}/);
  assert.match(src, /quizIndex\+\+;/);
  assert.doesNotMatch(src, /\bDATA\b/);
});

test('NAV QUESTÕES: estado por questão guarda o necessário (visited/answered/selected/objective/grade/imgIdx)', () => {
  const src = getQStateFn.source;
  for (const k of ['visited','answered','selectedAnswerId','objectiveCorrect','grade','imgIdx']) {
    assert.ok(src.includes(k), 'estado precisa conter ' + k);
  }
  assert.match(recordVisitFn.source, /quizHistory = quizHistory\.slice\(0, quizCursor\+1\);/);
  assert.match(recordVisitFn.source, /quizHistory\.push\(id\);/);
});

test('NAV QUESTÕES: questão respondida é restaurada (alternativas bloqueadas + feedback) sem responder de novo', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /if\(st\.answered\)\{[\s\S]*?markOptionsAnswered\(\);[\s\S]*?renderAnsweredFeedback\(\);/);
  assert.match(src, /function markOptionsAnswered\(\)\{[\s\S]*?b\.disabled=true;/);
});

test('NAV QUESTÕES: NÃO duplica score/SRS/SESSIONLOG ao voltar ou classificar de novo', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /st\.answered=true; st\.selectedAnswerId=btn\.dataset\.id; st\.objectiveCorrect=/);
  assert.match(src, /if\(st\.objectiveCorrect\)quizStats\.right\+\+;else\{quizStats\.wrong\+\+;/);
  assert.match(src, /function applyGrade\(g\)\{\s*if\(st\.grade\) return;/);
  assert.match(src, /srsGradeLevel\(e\.id,g\);quizStats\[g\]\+\+;recordQuizAnswerToday\(st\.objectiveCorrect,g\);/);
});

test('NAV QUESTÕES: progresso usa questões RESPONDIDAS (navegar/pular não aumenta)', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /const answeredCount=quizQueue\.reduce\([\s\S]*?s&&s\.answered\?1:0/);
  assert.match(src, /const pct=Math\.round\(answeredCount\/Math\.max\(quizQueue\.length,1\)\*100\)/);
});

test('NAV QUESTÕES: resumo só no fim real e Pular mantém a fila íntegra (sem duplicar)', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /if\(quizIndex>=quizQueue\.length\)\{ renderQuizSummaryIntegrated\(host\); return; \}/);
  const skip = skipBlockSource();
  assert.match(skip, /const cur=quizQueue\.splice\(quizIndex,1\)\[0\];\s*quizQueue\.push\(cur\);/);
  assert.match(skip, /if\(st\.answered\) return;/);
});

test('NAV QUESTÕES: índice do carrossel restaurado por questão e sem conflito com os controles de imagem', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /let quizImgIdx=st\.imgIdx\|\|0;/);
  assert.match(src, /st\.imgIdx=quizImgIdx;/);
  assert.match(src, /refreshQuizImgs\(false, true\);/);
  assert.match(src, /id="quiz-prev-btn"/);
  assert.match(src, /id="quiz-next-btn"/);
  assert.match(src, /quiz-carousel-ov-prev/);
  assert.match(src, /quiz-carousel-ov-next/);
});

// -----------------------------------------------------------------------
// NAV: Próxima deve habilitar ao RESPONDER (a grade é independente)
// -----------------------------------------------------------------------
test('NAV: Próxima fica apagada só quando não dá para avançar e reabilita ao responder/classificar', () => {
  const src = renderQuizCardIntegratedFn.source;
  assert.match(src, /const canNext=\(quizCursor<quizHistory\.length-1\)\|\|st\.answered;/);
  assert.match(src, /id="quiz-next-btn"\$\{canNext\?'':' aria-disabled="true"'\}/);
  assert.match(src, /function enableNextBtn\(\)\{ if\(nextBtn\) nextBtn\.removeAttribute\('aria-disabled'\); \}/);
  assert.match(src, /enableNextBtn\(\); \/\/ respondeu/);
  assert.match(src, /enableNextBtn\(\); \/\/ a classificação/);
  // o botão NUNCA recebe o atributo disabled (continua clicável para o aviso)
  const nextIdx = src.indexOf('id="quiz-next-btn"');
  const nextFrag = src.slice(nextIdx, nextIdx + 120);
  assert.match(nextFrag, /aria-disabled/);
  assert.doesNotMatch(nextFrag, /\sdisabled(?:\s|>)/);
});

// Simulação real das funções de navegação extraídas do index.html.
function buildNavContext(queue) {
  const ctx = {
    console, JSON, Object, Array, Math, Date,
    quizQueue: queue.map(id => ({ id })),
    quizIndex: 0,
    quizQuestionState: {},
    quizHistory: [],
    quizCursor: -1,
    toasts: [],
    renders: [],
    renderQuizCardIntegrated() {
      const id = ctx.quizQueue[ctx.quizIndex] && ctx.quizQueue[ctx.quizIndex].id;
      if (id) vm.runInContext('getQuizQuestionState(' + JSON.stringify(id) + ')', ctx);
      ctx.renders.push(ctx.quizIndex);
    }
  };
  // arrow evita o binding de `this` dentro do contexto vm
  ctx.toast = (msg) => { ctx.toasts.push(msg); };
  vm.createContext(ctx);
  vm.runInContext([getQStateFn, recordVisitFn, goPrevFn, goNextFn].map(f => f.source).join('\n'), ctx, { filename: 'quiz-nav.js' });
  vm.runInContext('recordQuizVisit(quizQueue[0].id)', ctx);
  vm.runInContext('renderQuizCardIntegrated({})', ctx);
  return ctx;
}

test('NAV (dinâmico): respondida (com ou sem grade) → Próxima avança para questão ainda não visitada', () => {
  const ctx = buildNavContext(['q1', 'q2', 'q3']);
  ctx.quizQuestionState.q1.answered = true; // sem grade
  ctx.toasts = [];
  vm.runInContext('goNextQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 1);
  assert.deepEqual(ctx.toasts, [], 'não pode avisar quando a questão está respondida');

  ctx.quizQuestionState.q2.answered = true;
  ctx.quizQuestionState.q2.grade = 'medium';
  vm.runInContext('goNextQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 2, 'respondida + classificada também avança');
  assert.deepEqual(ctx.toasts, []);
});

test('NAV (dinâmico): não respondida na fronteira NÃO avança e mostra o aviso', () => {
  const ctx = buildNavContext(['q1', 'q2']);
  ctx.toasts = [];
  vm.runInContext('goNextQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 0, 'não pode avançar sem responder');
  assert.deepEqual(ctx.toasts, ['Responda ou use Pular para avançar.']);
});

test('NAV (dinâmico): Anterior volta e Próxima retorna na trilha, sem duplicar o histórico', () => {
  const ctx = buildNavContext(['q1', 'q2', 'q3']);
  ctx.quizQuestionState.q1.answered = true;
  vm.runInContext('goNextQuestion({})', ctx);
  ctx.quizQuestionState.q2.answered = true;
  vm.runInContext('goNextQuestion({})', ctx);
  assert.deepEqual(ctx.quizHistory, ['q1', 'q2', 'q3']);

  vm.runInContext('goPrevQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 1);
  vm.runInContext('goPrevQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 0);

  vm.runInContext('goNextQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 1, 'Próxima retorna na trilha');
  vm.runInContext('goNextQuestion({})', ctx);
  assert.equal(ctx.quizIndex, 2, 'Próxima retorna na trilha');
  assert.deepEqual(ctx.quizHistory, ['q1', 'q2', 'q3'], 'navegar não duplica o histórico');
});
