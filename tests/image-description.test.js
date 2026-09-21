'use strict';

/* Testes da DESCRIÇÃO PERSISTENTE de imagens e quadros (2026-09-21).
 *
 * O campo continua sendo `label` (canônico, já existente — ver
 * CONTEXTO_MESTRE_ACERVO_RADIOLOGICO.md §15). Nenhum campo novo foi criado
 * (`description`/`collageDescription`/`boardDescription` continuam
 * inexistentes de propósito). O que mudou: os dois lugares que ainda usavam
 * `<input>` de uma linha para editar `label` passaram a usar `<textarea>`
 * (igual ao construtor de quadro, que já usava), e o lightbox passou a
 * aceitar uma descrição opcional, exibida abaixo da imagem — só quando o
 * chamador decide passá-la (o Quiz só passa depois de `st.answered`).
 *
 * Como o resto da suíte, extrai o trecho REAL do index.html e roda num `vm`
 * isolado. O projeto não tem jsdom — para `openImageLightbox` (que usa
 * `document.createElement`), uma DOM falsa MÍNIMA é usada (mesmo padrão já
 * documentado em AI.md para o header da Central de Revisões).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, openingBrace) {
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = openingBrace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(openingBrace, i + 1); }
  }
  throw new Error('Bloco sem fechamento');
}
function extractFunction(source, name) {
  const decl = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  assert.ok(decl, 'função não encontrada: ' + name);
  const ob = source.indexOf('{', decl.index + decl[0].length);
  const block = extractBlock(source, ob);
  return { source: source.slice(decl.index, ob) + block, body: block.slice(1, -1), index: decl.index };
}

const openFormFn = extractFunction(html, 'openForm');
const openQuizAddImageModalFn = extractFunction(html, 'openQuizAddImageModal');
const openCollageBuilderFn = extractFunction(html, 'openCollageBuilder');
const openImageLightboxFn = extractFunction(html, 'openImageLightbox');
const openDetailFn = extractFunction(html, 'openDetail');
const unionEntryImagesFn = extractFunction(html, 'unionEntryImages');
const mergeEntryNonDestructiveFn = extractFunction(html, 'mergeEntryNonDestructive');
const escAttrFn = extractFunction(html, 'escAttr');
const escFn = extractFunction(html, 'esc');

// ===========================================================================
// 1) CAMPO ÚNICO — `label` continua canônico; nenhuma estrutura paralela
// ===========================================================================

test('CAMPO ÚNICO: nenhum campo novo foi criado (description/collageDescription/boardDescription continuam inexistentes)', () => {
  // A menção em comentário (documentando a decisão de NÃO criar esses campos)
  // continua permitida e esperada — só o USO como propriedade real é proibido.
  assert.doesNotMatch(html, /[.{,]\s*collageDescription\s*[:=]/);
  assert.doesNotMatch(html, /[.{,]\s*boardDescription\s*[:=]/);
  // "description" aparece só como nome de PARÂMETRO de função (openImageLightbox)
  // e, em código não relacionado a imagens (ex.: sugestões da IA), como campo de
  // OUTRO objeto — nunca como propriedade de uma imagem/quadro (img.description).
  assert.doesNotMatch(html, /\bimg\.description\b/);
  assert.doesNotMatch(openFormFn.body + openQuizAddImageModalFn.body + openCollageBuilderFn.body, /\.description\s*=/, 'nenhuma atribuição a um campo .description nos fluxos de imagem/quadro');
});

test('CAMPO ÚNICO: os textareas novos e o já existente editam o MESMO campo `label`', () => {
  assert.match(openFormFn.body, /pendingImgs\[idx\]\.label = ev\.target\.value/);
  assert.match(openQuizAddImageModalFn.body, /draftImgs\[idx\]\.label = labelInput\.value/);
  assert.match(openCollageBuilderFn.body, /const label\s*=\s*resolveCollageLabel\(/);
});

// ===========================================================================
// 2) EDITOR (openForm) — galeria de imagens: input -> textarea, sem limite
// ===========================================================================

test('EDITOR: o campo de legenda/descrição da galeria é um <textarea> (não <input> de uma linha)', () => {
  assert.match(openFormFn.body, /<textarea class="img-gallery-label" rows="3"/);
  assert.doesNotMatch(openFormFn.body, /<input class="img-gallery-label"/);
});

test('EDITOR: o textarea não tem limite artificial de tamanho (sem maxlength) e preserva conteúdo escapado com esc()', () => {
  const m = openFormFn.body.match(/<textarea class="img-gallery-label"[^>]*>/);
  assert.ok(m, 'textarea da galeria do editor não encontrado');
  assert.doesNotMatch(m[0], /maxlength/i);
  assert.match(openFormFn.body, /<textarea class="img-gallery-label" rows="3"[^>]*>\$\{esc\(img\.label\|\|''\)\}<\/textarea>/);
});

test('EDITOR: clicar na miniatura abre o lightbox já passando a legenda/descrição atual', () => {
  assert.match(openFormFn.body, /openImageLightbox\(img\.data, img\.label\)/);
});

test('EDITOR: chips de sequência continuam funcionando sobre o mesmo campo (sem duplicar lógica)', () => {
  assert.match(openFormFn.body, /pendingImgs\[idx\]\.label = parts\.join\(' · '\)/);
});

// ===========================================================================
// 3) MODAL "Adicionar imagem" do Quiz — mesma conversão input -> textarea
// ===========================================================================

test('QUIZ ADD-IMAGE: a caixa de edição de legenda/descrição é um <textarea> dentro de .quiz-img-edit-box', () => {
  const editBoxMatch = openQuizAddImageModalFn.body.match(/<div class="quiz-img-edit-box" hidden>([\s\S]*?)<\/div>\s*`;/);
  assert.ok(editBoxMatch, '.quiz-img-edit-box não encontrado');
  assert.match(editBoxMatch[1], /<textarea class="img-gallery-label" rows="3"/);
  assert.doesNotMatch(editBoxMatch[1], /<input class="img-gallery-label"/);
  assert.doesNotMatch(editBoxMatch[1], /maxlength/i);
});

test('QUIZ ADD-IMAGE: salvar a edição continua gravando só em label, sem reiniciar upload/persistência', () => {
  const saveHandler = openQuizAddImageModalFn.body.match(/quiz-img-edit-save'\)\.onclick = \(\)=>\{([\s\S]*?)\};/);
  assert.ok(saveHandler);
  assert.match(saveHandler[1], /draftImgs\[idx\]\.label = labelInput\.value;/);
  assert.doesNotMatch(saveHandler[1], /uploadPendingImage|uploadToCloudinary|saveData\(/);
});

test('QUIZ ADD-IMAGE: miniatura da galeria de edição também abre o lightbox com a descrição atual', () => {
  assert.match(openQuizAddImageModalFn.body, /item\.querySelector\('\.img-gallery-thumb'\)\.onclick = \(\)=> openImageLightbox\(src, img\.label\);/);
});

// ===========================================================================
// 4) CONSTRUTOR DE QUADRO — já era textarea; agora com mais espaço inicial
// ===========================================================================

test('QUADRO: a descrição geral continua um <textarea> sem limite artificial, agora com mais linhas visíveis', () => {
  assert.match(openCollageBuilderFn.body, /<textarea id="collage-desc" rows="3"[^>]*><\/textarea>/);
  assert.doesNotMatch(openCollageBuilderFn.body, /id="collage-desc"[^>]*maxlength/i);
});

// ===========================================================================
// 5) DETALHE DA LESÃO — já mostrava a descrição; troca de escaping + lightbox
// ===========================================================================

test('DETALHE: usa esc() (escapa & também) em vez do replace manual só de "<"', () => {
  assert.match(openDetailFn.body, /\$\{img\.label\?`<div class="detail-img-label">\$\{esc\(img\.label\)\}<\/div>`:''\}/);
  assert.doesNotMatch(openDetailFn.body, /img\.label\.replace\(\/</);
});

test('DETALHE: continua sem mostrar caixa quando não há descrição', () => {
  assert.match(openDetailFn.body, /img\.label\?`<div class="detail-img-label">/, 'só renderiza a div quando há label');
});

test('DETALHE: clicar na imagem no grid abre o lightbox já com a descrição (sem gate — não é contexto de quiz)', () => {
  assert.match(openDetailFn.body, /const it=all\[\+imgEl\.dataset\.idx\]; openImageLightbox\(it\.data, it\.label\);/);
});

// ===========================================================================
// 6) LIGHTBOX — nova assinatura, sem caixa quando vazio, nunca sobrepõe
// ===========================================================================

test('LIGHTBOX: assinatura aceita descrição opcional; ferramenta de auditoria técnica continua chamando sem ela (inalterada)', () => {
  assert.match(html, /function openImageLightbox\(src, description\)\{/);
  assert.match(html, /thumb\.onclick = \(e\)=>\{ e\.stopPropagation\(\); openImageLightbox\(thumb\.src\); \};/, 'auditoria de vínculo de imagens continua sem passar descrição');
});

function makeEscContext() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(escAttrFn.source + '\n' + escFn.source, ctx, { filename: 'esc.js' });
  return ctx;
}

function invokeLightbox(src, description) {
  const escCtx = makeEscContext();
  const descEl = {};
  const closeBtn = {};
  const ov = {
    className: '',
    innerHTML: '',
    onclick: null,
    querySelector(sel) {
      if (sel === '.lightbox-desc') return /class="lightbox-desc"/.test(ov.innerHTML) ? descEl : null;
      if (sel === '.lightbox-close') return closeBtn;
      return null;
    }
  };
  const appended = [];
  const ctx = {
    document: { createElement: () => ov, body: { appendChild: (el) => appended.push(el) } },
    String,
    esc: vm.runInContext('esc', escCtx)
  };
  vm.createContext(ctx);
  vm.runInContext(openImageLightboxFn.source + '\nthis.__call = openImageLightbox;', ctx, { filename: 'lightbox-call.js' });
  vm.runInContext('__call', ctx)(src, description);
  return { ov, descEl, appended };
}

test('LIGHTBOX (dinâmico): sem descrição -> nenhuma caixa/elemento de descrição aparece (comportamento de sempre)', () => {
  for (const empty of [undefined, '', '   ', null]) {
    const { ov, appended } = invokeLightbox('https://x/y.jpg', empty);
    assert.doesNotMatch(ov.innerHTML, /lightbox-desc/, `description=${JSON.stringify(empty)} não pode gerar caixa`);
    assert.match(ov.innerHTML, /class="lightbox-img"/);
    assert.equal(appended.length, 1, 'o lightbox precisa ser anexado ao body normalmente');
    assert.equal(typeof ov.onclick, 'function', 'clicar fora continua fechando');
  }
});

test('LIGHTBOX (dinâmico): com descrição -> aparece abaixo da imagem, escapada, sem fechar o lightbox ao clicar nela', () => {
  const { ov, descEl } = invokeLightbox('https://x/y.jpg', 'TC do joelho\ndemonstrando <edema> ósseo & derrame.');
  assert.match(ov.innerHTML, /class="lightbox-desc"/);
  // a imagem aparece ANTES da descrição no HTML (fica acima, nunca sobreposta)
  const imgIdx = ov.innerHTML.indexOf('class="lightbox-img"');
  const descIdx = ov.innerHTML.indexOf('class="lightbox-desc"');
  assert.ok(imgIdx !== -1 && descIdx !== -1 && imgIdx < descIdx, 'a descrição precisa vir DEPOIS da imagem no markup (abaixo dela)');
  assert.match(ov.innerHTML, /&lt;edema&gt;/, 'conteúdo é escapado (esc()), nunca HTML cru');
  assert.match(ov.innerHTML, /&amp;/, 'escapa & também (não só <)');
  assert.equal(typeof descEl.onclick, 'function', 'clique na descrição precisa ter handler próprio');
  let stopped = false;
  descEl.onclick({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true, 'clicar na descrição não pode fechar o lightbox (stopPropagation)');
});

test('LIGHTBOX (dinâmico): descrição só com espaços é tratada como vazia (trim), igual a não ter descrição', () => {
  const { ov } = invokeLightbox('https://x/y.jpg', '   \n  ');
  assert.doesNotMatch(ov.innerHTML, /lightbox-desc/);
});

test('LIGHTBOX: CSS garante que a descrição fica ABAIXO da imagem, nunca sobreposta (coluna, sem position:absolute na descrição)', () => {
  const contentRule = html.match(/\.lightbox-content\{([^}]*)\}/);
  const descRule = html.match(/\.lightbox-desc\{([^}]*)\}/);
  assert.ok(contentRule && descRule, 'regras CSS do lightbox não encontradas');
  assert.match(contentRule[1], /flex-direction:column/);
  assert.doesNotMatch(descRule[1], /position:\s*absolute/);
});

// ===========================================================================
// 7) QUIZ — comportamento identificado na auditoria PRESERVADO exatamente:
//    invisível antes de responder, visível adjacente (sem maximizar) depois.
//    Cobertura da chamada condicional ao lightbox já está em
//    tests/quiz-images.test.js (mesma âncora de renderQuizCardIntegrated).
// ===========================================================================

const quizImageDescHtmlFn = extractFunction(html, 'quizImageDescHtml');
function loadQuizImageDescHtml() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(escAttrFn.source + '\n' + escFn.source + '\n' + quizImageDescHtmlFn.source, ctx, { filename: 'quiz-desc.js' });
  return vm.runInContext('quizImageDescHtml', ctx);
}

test('QUIZ: descrição continua invisível antes de responder e visível (adjacente, sem maximizar) depois — mesmo com texto longo/multilinha', () => {
  const api = loadQuizImageDescHtml();
  const longDesc = 'Linha 1 da descrição.\nLinha 2, bem mais longa, explicando achados adicionais e diagnóstico diferencial extenso.';
  assert.equal(api(longDesc, false), '', 'nada pode aparecer antes de responder, nem com texto longo');
  const out = api(longDesc, true);
  assert.match(out, /Linha 1 da descrição\./);
  assert.match(out, /diagnóstico diferencial extenso\./);
  assert.doesNotMatch(out, /overflow:\s*hidden|white-space:\s*nowrap|text-overflow/, 'não pode truncar texto longo');
});

// ===========================================================================
// 8) PERSISTÊNCIA / SYNC — nenhuma mudança na lógica de merge (limitação
//    preexistente apenas REGISTRADA, não resolvida nesta tarefa)
// ===========================================================================

test('SYNC: unionEntryImages/mergeEntryNonDestructive NÃO foram alterados para resolver conflito de label entre dispositivos', () => {
  // Nenhuma reconciliação nova por campo — a imagem inteira continua sendo
  // copiada por identidade (dedup), sem lógica especial para `label`.
  assert.doesNotMatch(unionEntryImagesFn.body, /\blabel\b/, 'a união de imagens não pode ganhar lógica específica de label nesta tarefa');
  assert.doesNotMatch(mergeEntryNonDestructiveFn.body, /\.label\b/, 'o merge de entrada não pode ganhar lógica específica de label nesta tarefa');
});

test('SYNC: label continua um campo comum do objeto de imagem — viaja por spread, sem allowlist que possa cortá-lo', () => {
  assert.match(openFormFn.body, /remoteImgs = normalized\.map\(x=>\(\{\s*\.\.\.x,/, 'salvar continua usando spread (preserva label e demais metadados)');
  const uploadPendingImageFn = extractFunction(html, 'uploadPendingImage');
  assert.match(uploadPendingImageFn.body, /remote\.label = img\.label \|\| '';/);
});

// ===========================================================================
// 9) AJUSTE VISUAL (2026-09-21) — clamp de 2 linhas no detalhe (só CSS),
//    expandir/recolher (só toggle de classe), e layout mais largo/compacto
//    no lightbox e no Quiz pós-resposta. NADA de lógica/gate foi tocado.
// ===========================================================================

test('DETALHE/CLAMP: a apresentação limita a 2 linhas via CSS puro (line-clamp) — o DOM continua com o texto INTEIRO', () => {
  const rule = html.match(/\.detail-img-label\{([^}]*)\}/);
  assert.ok(rule, 'regra .detail-img-label não encontrada');
  assert.match(rule[1], /-webkit-line-clamp:\s*2/, 'precisa clampar visualmente em 2 linhas por padrão');
  assert.match(rule[1], /overflow:\s*hidden/);
  const expandedRule = html.match(/\.detail-img-label\.expanded\{([^}]*)\}/);
  assert.ok(expandedRule, 'regra .detail-img-label.expanded não encontrada');
  assert.match(expandedRule[1], /-webkit-line-clamp:\s*unset/, 'expandido precisa remover o clamp');
  // A renderização em si (esc(img.label)) não muda — continua sendo o
  // texto completo escapado; o clamp é 100% apresentação (CSS), nunca corta
  // a string.
  assert.match(openDetailFn.body, /\$\{esc\(img\.label\)\}/, 'o markup continua recebendo o label INTEIRO, sem slice/substring');
  assert.doesNotMatch(openDetailFn.body, /img\.label\.slice\(|img\.label\.substring\(|img\.label\.substr\(/, 'nenhum truncamento de dado — só CSS');
});

test('DETALHE/CLAMP: clicar na descrição alterna .expanded (puro toggle de classe — nunca muta img.label/DATA)', () => {
  assert.match(openDetailFn.body, /labelEl\.addEventListener\('click', \(\)=> labelEl\.classList\.toggle\('expanded'\)\);/);
  // Garante que esse handler NÃO grava nada em DATA/img/saveData — é só UI.
  const wireMatch = openDetailFn.body.match(/gal\.querySelectorAll\('\.detail-img-label'\)\.forEach\(labelEl=>\{([\s\S]*?)\}\);/);
  assert.ok(wireMatch, 'wiring do toggle de expandir/recolher não encontrado');
  assert.doesNotMatch(wireMatch[1], /\.label\s*=|saveData\(|DATA\[|img\.label\s*=/, 'expandir/recolher não pode alterar dado nenhum');
});

test('DETALHE/CLAMP (dinâmico): a classe alterna entre presente/ausente a cada clique (expande e recolhe)', () => {
  // Simula exatamente o listener real: classList.toggle('expanded').
  const classes = new Set();
  const labelEl = {
    classList: {
      toggle(name) { if (classes.has(name)) classes.delete(name); else classes.add(name); },
      contains(name) { return classes.has(name); }
    }
  };
  const onclick = () => labelEl.classList.toggle('expanded');
  assert.equal(labelEl.classList.contains('expanded'), false);
  onclick();
  assert.equal(labelEl.classList.contains('expanded'), true, 'primeiro clique expande');
  onclick();
  assert.equal(labelEl.classList.contains('expanded'), false, 'segundo clique recolhe de volta');
});

test('QUIZ (regressão): a descrição pós-resposta continua SEM truncamento (texto completo, mesmo multilinha/longo)', () => {
  const api = loadQuizImageDescHtml();
  const longDesc = Array.from({ length: 8 }, (_, i) => `Linha ${i + 1} com detalhes clínicos relevantes para o estudo.`).join('\n');
  const out = api(longDesc, true);
  for (let i = 1; i <= 8; i += 1) assert.match(out, new RegExp(`Linha ${i} com detalhes`), `linha ${i} precisa continuar presente, sem corte`);
  assert.doesNotMatch(out, /line-clamp|text-overflow|overflow:\s*hidden/, 'o bloco pós-resposta do Quiz NUNCA pode clampar — é a única visão completa durante o estudo');
});

test('QUIZ (regressão): gate continua idêntico — nada antes de responder, mesmo com a nova formatação', () => {
  const api = loadQuizImageDescHtml();
  assert.equal(api('qualquer descrição', false), '', 'antes de responder continua vazio, sem exceção');
});

test('LIGHTBOX (regressão): continua sem descrição antes da resposta e com a descrição completa depois — mesmo call site/gate de antes', () => {
  assert.match(html, /openImageLightbox\(cur\.data, st\.answered \? cur\.label : ''\)/, 'gate do carrossel do Quiz intacto');
});

test('LIGHTBOX/LARGURA: a coluna da descrição NÃO fica presa à largura da imagem — usa largura própria, responsiva à tela', () => {
  const contentRule = html.match(/\.lightbox-content\{([^}]*)\}/);
  assert.ok(contentRule);
  // width (não só max-width) explícito e baseado em vw — independe do
  // tamanho renderizado da <img> (que poderia ser bem mais estreita).
  assert.match(contentRule[1], /width:\s*min\([^)]*vw[^)]*\)/, 'a largura da coluna precisa escalar com a tela (vw), não com a imagem');
  const descRule = html.match(/\.lightbox-desc\{([^}]*)\}/);
  assert.ok(descRule);
  assert.doesNotMatch(descRule[1], /max-width:\s*\d+px/, 'não pode haver mais um teto fixo em pixels menor que a coluna (isso reintroduziria a quebra excessiva)');
  assert.match(descRule[1], /width:\s*100%/, 'a descrição ocupa 100% da coluna, que agora é larga');
});

test('LIGHTBOX/COMPACTO: padding vertical e line-height mais enxutos que antes, mas ainda legível (fonte não foi reduzida)', () => {
  const descRule = html.match(/\.lightbox-desc\{([^}]*)\}/)[1];
  const lineHeight = parseFloat(descRule.match(/line-height:\s*([\d.]+)/)[1]);
  const fontSize = parseFloat(descRule.match(/font-size:\s*([\d.]+)px/)[1]);
  assert.ok(lineHeight <= 1.45, `line-height precisa ser compacto (<=1.45), veio ${lineHeight}`);
  assert.ok(fontSize >= 13, `a solução não pode ser diminuir demais a fonte (>=13px), veio ${fontSize}px`);
  assert.match(descRule, /text-align:\s*left/);
});

test('LIGHTBOX: a imagem continua o elemento visual prioritário (tamanho/posição dela não foram tocados)', () => {
  const imgRule = html.match(/\.lightbox-img\{([^}]*)\}/)[1];
  assert.match(imgRule, /max-height:\s*75vh/, 'a imagem mantém seu limite de altura de sempre — não encolheu pra "dar espaço" ao texto');
  assert.match(imgRule, /object-fit:\s*contain/);
});

test('AJUSTE VISUAL: nenhuma regressão nas Alterações 055/056 — testes dedicados continuam intactos', () => {
  // Não reexecuta os arquivos aqui (o relatório de entrega roda a suíte
  // inteira) — só confirma que os pontos centrais de cada alteração
  // continuam de pé textualmente após os ajustes de CSS/wiring desta tarefa.
  assert.match(html, /let deviceBootstrapPending = false;/, 'Alteração 055: flag de bootstrap intacta');
  assert.match(html, /async function runNewDeviceBootstrapFlow\(\)\{/, 'Alteração 055: orquestrador intacto');
  assert.match(html, /function openImageLightbox\(src, description\)\{/, 'Alteração 056: assinatura do lightbox intacta');
  assert.match(openCollageBuilderFn.body, /<textarea id="collage-desc" rows="3"/, 'Alteração 056: textarea do quadro intacto');
});
