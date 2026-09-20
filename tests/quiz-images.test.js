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
  assert.match(openCollageBuilderFn.source, /function openCollageBuilder\(lesionMeta,\s*onCollageReady,\s*existingPanels,\s*deferUpload\)/);
  assert.match(openCollageBuilderFn.source, /uploadToCloudinary\(file,lesionMeta\)/);
  assert.match(openCollageBuilderFn.source, /onCollageReady\(imgObj\)/);
  assert.doesNotMatch(openCollageBuilderFn.source, /pendingImgs/, 'o construtor compartilhado não pode depender do estado privado do formulário');
  assert.ok((html.match(/openCollageBuilder\(/g) || []).length >= 4, 'a mesma função deve atender criação/edição no formulário e o Quiz');
});

test('callback do "concluído" persiste e atualiza o visualizador do Quiz (só depois do upload)', () => {
  assert.match(openQuizAddImageModalFn.source, /lesion\.images = draftImgs\.map\([\s\S]*?await saveData\(\);[\s\S]*?onImagesAdded\(\);/);
  assert.match(renderQuizCardIntegratedFn.source, /openQuizAddImageModal\(e\.id,\s*\(\)=>\s*refreshQuizImgs\(true\)\)/);
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
  assert.match(renderQuizCardIntegratedFn.body, /let\s+quizImgIdx\s*=\s*0/);
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

test('pós-resposta: o atalho de adicionar imagem só é montado dentro do handler de resposta (nunca antes de responder)', () => {
  const answerHandlerIdx = renderQuizCardIntegratedFn.body.indexOf(".querySelectorAll('.quiz-mcq-option').forEach(btn=>btn.onclick=()=>{");
  assert.notEqual(answerHandlerIdx, -1, 'handler de resposta não encontrado');
  const addImgIdx = renderQuizCardIntegratedFn.body.indexOf('openQuizAddImageModal(e.id');
  assert.notEqual(addImgIdx, -1);
  assert.ok(addImgIdx > answerHandlerIdx, 'o atalho "adicionar imagem" precisa estar dentro do fluxo pós-resposta, não antes');
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
  const start = html.indexOf('function openForm(id)');
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
  assert.match(src, /f-cancel'\)\.onclick = \(\)=>\{ releasePendingObjectUrls\(\);[^}]*closeOverlay\(\)/);
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
  assert.match(openCollageBuilderFn.source, /function openCollageBuilder\(lesionMeta,\s*onCollageReady,\s*existingPanels,\s*deferUpload\)/);
  assert.match(openCollageBuilderFn.source, /if\(deferUpload\)\{ item\.durableUrl = item\.url; return; \}/);
});

test('QUADRO (Editar): o resultado entra como imagem pendente/temporária (source pending + File + blob URL)', () => {
  assert.match(openCollageBuilderFn.source, /onCollageReady\(\{label, panels, source:'pending', _file:file, _objectUrl:objectUrl\}\)/);
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
