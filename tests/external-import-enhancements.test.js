'use strict';

/* PROTEÇÃO 091d — importador de caso externo: nome em PT (catálogo ->
 * EN_TERMS invertido -> glossário/aliases -> original), enTerm automático,
 * descrição/tags no draft, e "✨ Revisar com IA" criando uma revisão REAL
 * na Central (só depois de a lesão existir). Funções REAIS do index.html
 * num `vm` isolado; nenhuma rede, IndexedDB, Firestore ou IA.
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
  assert.ok(m, 'função ' + name + ' não encontrada no index.html');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start.slice(0, 40));
  return html.slice(a, b);
}
const plain = (v) => JSON.parse(JSON.stringify(v));

const reviewModule = sliceBetween("const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';", '/* termos de busca em inglês para as lesões da base padrão');
const enTerms = sliceBetween('const EN_TERMS = {', '\n};') + '\n};';
const stopwords = sliceBetween('const EXTERNAL_IMPORT_STOPWORDS = ', '\n');
const importerConsts = sliceBetween('const EXTERNAL_IMPORT_TRANSLATIONS = {', '// PROTEÇÃO 091d — ordem: 1) lesão do catálogo');
const aiHelpers = sliceBetween("const EXTERNAL_AI_DEFAULT_INSTRUCTION = 'Revisar nome, tags e descrição da lesão.';", '// Pura e testada: confirma a marcação');
const fns = ['canonicalJsonString', 'escAttr', 'esc', 'normalizeExternalTitle', 'tokenizeExternalTitle', 'externalEnTermsIndex', 'suggestPortugueseLesionName',
  'suggestExternalEnTerm', 'canonicalTagVocabulary', 'suggestExternalTags', 'suggestExternalDescription', 'buildExternalSuggestion',
  'confirmExternalAiReview', 'externalPendingBlockHtml', 'openExternalDraft', 'handleExternalLinkCaseClick'].map((n) => extractFunction(html, n)).join('\n');

function buildCtx(opts) {
  const o = opts || {};
  const backing = o.backing || {};
  const fields = {};
  const field = (id) => (fields[id] = fields[id] || {
    id, value: '', dispatched: [], onclick: null, click() {},
    dispatchEvent(ev) { this.dispatched.push(this.value); if (this.onTag) this.onTag(this.value); return true; }
  });
  const tagsAdded = [];
  field('f-tag-input').onTag = (v) => { const t = v.trim(); if (t && !tagsAdded.includes(t)) tagsAdded.push(t); };
  const ctx = {
    console: { error() {}, warn() {}, log() {} }, Date, Math, JSON, Object, Array, String, Number, Set, Map, Promise,
    storage: { async get(k) { if (k in backing) return { value: backing[k] }; throw new Error('nf'); }, async set(k, v) { backing[k] = v; } },
    DATA: o.data || [], dirty: 0, toasts: [], opened: [], formOpened: [],
    saveData: () => {}, markSyncDirty: async () => { ctx.dirty += 1; }, pushToFirebase: () => {},
    KeyboardEvent: function KeyboardEvent(type, init) { this.type = type; Object.assign(this, init); },
    document: {
      getElementById: (id) => (/^f-/.test(id) ? field(id) : null), // só os campos do formulário
      querySelector: () => ({ insertBefore() {}, firstChild: null }),
      querySelectorAll: () => [],
      createElement: () => ({ innerHTML: '', style: {} })
    },
    closeOverlay: () => {}, openDetail: (id) => ctx.opened.push(id),
    openClinicalCaseLinkConfirm: async () => true,
    linkClinicalCaseToLesion: async () => ({ ok: true }),
    pendingExternalCase: null
  };
  ctx.toast = (m) => ctx.toasts.push(m);
  vm.createContext(ctx);
  vm.runInContext([stopwords, fns, reviewModule, enTerms, importerConsts, 'let EXTERNAL_EN_TERMS_INDEX = null;', aiHelpers,
    // openForm "real" só no ponto que importa: consome a instrução no início (como o index.html)
    'function openForm(id){ formOpened.push({ id, ai: consumePendingExternalAiReviewForForm() }); }',
    'this.__revs = () => LESION_REVISIONS; this.__pendingAi = () => pendingExternalAiReviewForForm;'].join('\n'), ctx);
  return { ctx, field, tagsAdded, backing };
}
const DRAFT = (over) => Object.assign({ source: 'Radiopaedia', sourceUrl: 'https://radiopaedia.org/cases/appendicitis-in-pregnancy-1', title: 'Appendicitis in pregnancy', modality: 'MRI', presentation: 'Dor em fossa ilíaca direita no 2º trimestre' }, over || {});
const CATALOG = [
  { id: 'seed_10', name: 'Apendicite aguda', enTerm: 'acute appendicitis', s: 'Abdômen Inferior', site: 'Apêndice', tags: ['apendicite', 'ressonância magnética', 'dor abdominal'] },
  { id: 'seed_11', name: 'Astrocitoma difuso', enTerm: 'Diffuse low grade astrocytoma', s: 'Neuro', site: 'Cérebro', tags: ['ressonância magnética'] }
];

test('091d 1: título original em inglês preenche o enTerm (preservado como na fonte)', () => {
  const { ctx } = buildCtx();
  const sug = ctx.buildExternalSuggestion(DRAFT({ title: '  Appendicitis   in pregnancy ' }), CATALOG, []);
  assert.equal(sug.enTerm, 'Appendicitis in pregnancy');
  assert.equal(ctx.suggestExternalEnTerm('Apendicite na gestação', { source: 'original' }), '', 'grafia portuguesa nunca vira enTerm');
});

test('091d 2: EN_TERMS invertido resolve correspondência EXATA normalizada (e usa o termo canônico); ambíguo não traduz', () => {
  const { ctx } = buildCtx();
  const r = plain(ctx.suggestPortugueseLesionName('Acute Appendicitis', []));
  assert.deepEqual([r.name, r.source, r.needsReview, r.canonicalEnTerm], ['Apendicite aguda', 'en_terms', false, 'acute appendicitis']);
  assert.equal(ctx.suggestExternalEnTerm('Acute Appendicitis', r), 'acute appendicitis', 'canônico do acervo vence');
  const hy = plain(ctx.suggestPortugueseLesionName('Appendiceal-mucocele', []));
  assert.equal(hy.name, 'Mucocele apendicular', 'hífen equivalente a espaço');
  const amb = plain(ctx.suggestPortugueseLesionName('Epiploic appendagitis', []));
  assert.equal(amb.source, 'original', 'dois nomes PT para o mesmo termo = ambíguo, não escolhe');
  assert.equal(amb.needsReview, true);
  const cat = plain(ctx.suggestPortugueseLesionName('diffuse low grade astrocytoma', CATALOG));
  assert.equal(cat.source, 'catalogo', 'catálogo (enTerm do acervo) continua em 1º lugar');
});

test('091d 3-4: tradução explícita "Appendicitis in/during pregnancy" -> "Apendicite na gestação"; enTerm preserva o original', () => {
  const { ctx } = buildCtx();
  for (const t of ['Appendicitis in pregnancy', 'Appendicitis during pregnancy', 'APPENDICITIS IN PREGNANCY.']) {
    const s = ctx.buildExternalSuggestion(DRAFT({ title: t }), CATALOG, []);
    assert.equal(s.name, 'Apendicite na gestação', t);
    assert.equal(s.nameSource, 'glossario');
    assert.equal(s.needsReview, false);
    assert.equal(s.enTerm, t.replace(/\s+/g, ' ').trim());
  }
});

test('091d 5-6: nada de tradução fuzzy perigosa; fallback mantém o título e needsReview', () => {
  const { ctx } = buildCtx();
  for (const t of ['Appendicitis', 'Appendicitis in pregnancy with abscess', 'Acute appendicitis in pregnancy']) {
    const r = plain(ctx.suggestPortugueseLesionName(t, CATALOG));
    assert.equal(r.source, 'original', t);
    assert.notEqual(r.name, 'Apendicite aguda', t + ' não pode virar "Apendicite aguda"');
    assert.equal(r.name, t);
    assert.equal(r.needsReview, true);
  }
});

test('091d 7-10: Nova lesão vem preenchida — nome PT, enTerm, descrição e tags (sem repetir); classification não é inventada', () => {
  const { ctx, field, tagsAdded } = buildCtx();
  const sug = plain(ctx.buildExternalSuggestion(DRAFT(), CATALOG, []));
  assert.ok(sug.description.startsWith('Apendicite na gestação.'), 'descrição só com o que é seguro');
  assert.match(sug.description, /Quadro relatado na fonte: Dor em fossa ilíaca direita/);
  assert.ok(sug.tags.includes('ressonância magnética'), 'modalidade -> tag canônica');
  assert.equal(new Set(sug.tags).size, sug.tags.length, 'sem tag repetida');
  assert.equal('classification' in sug, false);
  sug.tags = sug.tags.concat(sug.tags[0]); // mesmo com repetição na entrada, o draft não repete
  vm.runInContext('openExternalDraft(' + JSON.stringify(DRAFT()) + ', ' + JSON.stringify(sug) + ');', ctx);
  assert.equal(field('f-name').value, 'Apendicite na gestação');
  assert.equal(field('f-en-term').value, 'Appendicitis in pregnancy');
  assert.equal(field('f-notes').value, sug.description);
  assert.deepEqual(tagsAdded, [...new Set(sug.tags)]);
  assert.match(extractFunction(html, 'openForm'), /if\(t && !tags\.includes\(t\)\)\{ tags\.push\(t\);/, 'o campo real de tags (addTag) também não repete — o stub acima reproduz essa regra');
  assert.equal(field('f-classification').value, '', 'classification fica vazia');
  assert.equal(ctx.DATA.length, 0, 'nada salvo');
  // sem base: descrição vazia (nada genérico)
  const empty = plain(ctx.suggestExternalDescription({ title: 'Xyz' }, { source: 'original', name: 'Xyz' }, null));
  assert.equal(empty.text, '');
});

test('091d 11: marcar "✨ Revisar com IA" NÃO cria revisão antes do Salvar; a instrução segue só para o próximo formulário', () => {
  const { ctx } = buildCtx();
  const sug = ctx.confirmExternalAiReview(ctx.buildExternalSuggestion(DRAFT(), CATALOG, []), 'revisar nome em português e classificação');
  assert.equal(Object.keys(ctx.__revs()).length, 0);
  vm.runInContext('openExternalDraft(' + JSON.stringify(DRAFT()) + ', ' + JSON.stringify(plain(sug)) + ');', ctx);
  assert.deepEqual(plain(ctx.formOpened), [{ id: null, ai: 'revisar nome em português e classificação' }]);
  assert.equal(ctx.__pendingAi(), null, 'consumida: não vaza para outro formulário');
  assert.equal(Object.keys(ctx.__revs()).length, 0, 'abrir o draft não cria revisão');
  vm.runInContext('openForm("seed_10");', ctx);
  assert.equal(plain(ctx.formOpened)[1].ai, null, 'formulário seguinte não herda a instrução');
});

test('091d 12-16: Salvar a nova lesão cria revisão REAL (reviewId, 🔔, requestText digitado) e sobrevive ao reload', async () => {
  const backing = {};
  const { ctx } = buildCtx({ backing });
  ctx.DATA.push({ id: 'u_novo_1', name: 'Apendicite na gestação', s: 'Abdômen', site: 'Apêndice', tags: [], notes: '' });
  const res = plain(ctx.createExternalImportAiReview('u_novo_1', 'revisar nome em português e classificação'));
  assert.equal(res.ok, true);
  assert.equal(res.created, true);
  assert.match(res.review.id, /^lrev_/);
  const r = ctx.__revs()[res.review.id];
  assert.deepEqual([r.lesionId, r.status, r.requestText, r.scope], ['u_novo_1', 'pending', 'revisar nome em português e classificação', undefined]);
  assert.equal(ctx.countPendingLesionReviews(), 1, 'aparece no 🔔');
  assert.equal(ctx.hasActiveLesionReview('u_novo_1'), true, '⚠ na lesão');
  assert.equal(ctx.externalAiReviewResultMessage(res), '✨ Revisão adicionada à Central.');
  await ctx.saveLesionRevisions();
  assert.ok(ctx.dirty >= 1, 'marca dirty -> sincroniza');
  const reloaded = buildCtx({ backing }).ctx;
  await reloaded.loadLesionRevisions();
  assert.equal(reloaded.__revs()[res.review.id].requestText, 'revisar nome em português e classificação', 'reload preserva');
  // ponte manual de IA funciona com ela
  const prompt = ctx.buildReviewAiPrompt(res.review.id);
  assert.equal(prompt.ok, true);
  assert.match(prompt.text, /revisar nome em português e classificação/);
});

test('091d 17: sync — a revisão criada pelo importador entra no merge real (PC B recebe)', () => {
  const { ctx } = buildCtx();
  const res = ctx.createExternalImportAiReview('u_novo_1', 'melhorar descrição');
  const other = buildCtx().ctx;
  const merged = plain(other.mergeLesionRevisions({}, plain(ctx.__revs())));
  assert.equal(merged[res.review.id].requestText, 'melhorar descrição');
});

test('091d 18-19: Vincular existente + ✨ cria revisão real para ESSA lesão e NÃO altera nome/notas/tags', async () => {
  const lesion = { id: 'seed_10', name: 'Apendicite aguda', enTerm: 'acute appendicitis', notes: 'nota original', tags: ['apendicite'], s: 'Abdômen Inferior', site: 'Apêndice' };
  const { ctx } = buildCtx({ data: [lesion] });
  const before = JSON.stringify(lesion);
  await ctx.handleExternalLinkCaseClick(DRAFT(), 'seed_10', 'conferir se é apendicite na gestação');
  const revs = Object.values(plain(ctx.__revs()));
  assert.equal(revs.length, 1);
  assert.deepEqual([revs[0].lesionId, revs[0].requestText, revs[0].status], ['seed_10', 'conferir se é apendicite na gestação', 'pending']);
  assert.equal(JSON.stringify(ctx.DATA[0]), before, 'lesão existente intacta');
  assert.match(ctx.toasts.at(-1), /Caso clínico vinculado a "Apendicite aguda"\. ✨ Revisão adicionada à Central\./);
  assert.deepEqual(plain(ctx.opened), ['seed_10']);
  // sem ✨: nenhum pedido
  const plainCtx = buildCtx({ data: [JSON.parse(before)] }).ctx;
  await plainCtx.handleExternalLinkCaseClick(DRAFT(), 'seed_10', null);
  assert.equal(Object.keys(plainCtx.__revs()).length, 0);
});

test('091d 20: revisão ativa idêntica (mesma lesão + texto normalizado) não é duplicada', () => {
  const { ctx } = buildCtx();
  const a = plain(ctx.createExternalImportAiReview('seed_10', 'Revisar  tags'));
  const b = plain(ctx.createExternalImportAiReview('seed_10', 'revisar tags '));
  assert.equal(a.created, true);
  assert.deepEqual([b.ok, b.created, b.reason], [true, false, 'duplicate']);
  assert.equal(Object.keys(ctx.__revs()).length, 1);
  assert.match(ctx.externalAiReviewResultMessage(b), /não foi duplicada/);
  const other = plain(ctx.createExternalImportAiReview('seed_11', 'revisar tags'));
  assert.equal(other.created, true, 'outra lesão pode ter o mesmo pedido');
});

test('091d: falha ao criar a revisão NÃO é escondida (mensagem clara; lesão continua salva)', () => {
  const { ctx } = buildCtx();
  const bad = plain(ctx.createExternalImportAiReview('', 'x'));
  assert.equal(bad.ok, false);
  assert.match(ctx.externalAiReviewResultMessage(bad), /A lesão foi salva, mas a revisão com IA NÃO foi criada/);
  vm.runInContext('createReviewRequest = () => { throw new Error("boom"); };', ctx);
  const thrown = plain(ctx.createExternalImportAiReview('seed_10', 'y'));
  assert.deepEqual([thrown.ok, thrown.reason], [false, 'error']);
});

test('091d 12/21: openForm cria a revisão só DEPOIS de a lesão existir (entryId real) e aiReview nunca entra no objeto salvo', () => {
  const src = extractFunction(html, 'openForm');
  assert.match(src, /const externalAiReviewInstruction = consumePendingExternalAiReviewForForm\(\);/);
  const pushAt = src.indexOf('DATA.push(newEntry);');
  const createAt = src.indexOf('createExternalImportAiReview(entryId, externalAiReviewInstruction)');
  assert.ok(pushAt > 0 && createAt > pushAt, 'revisão criada depois de a lesão entrar em DATA');
  assert.match(src, /if\(!existing && externalAiReviewInstruction\)/, 'só para lesão NOVA');
  assert.match(src, /\+ \(externalAiReviewNotice \? ' ' \+ externalAiReviewNotice : ''\)/, 'resultado mostrado ao usuário');
  const entry = /const newEntry = \{([^}]*)\}/.exec(src);
  assert.ok(entry);
  assert.doesNotMatch(entry[1], /aiReview/);
  assert.doesNotMatch(src, /aiReview\b/, 'o formulário não guarda aiReview em lugar nenhum');
});

test('091d 18/UI: mensagens honestas — sem "concluir manualmente no fluxo de Revisões"', () => {
  assert.doesNotMatch(html, /concluir manualmente no fluxo de Revisões|concluir no fluxo de Revisões/);
  assert.match(html, /✨ Ao salvar, esta solicitação será adicionada às Revisões pendentes/);
  assert.match(extractFunction(html, 'wireExternalLinkCaseButtons'), /handleExternalLinkCaseClick\(draft, id, sug && sug\.aiReview === 'pending' \? sug\.aiReviewInstruction : null\)/);
  assert.match(extractFunction(html, 'openExternalImportModal'), /ov\.__externalSuggestion = suggestion;/);
});

test('091d 22: nenhuma chamada de API de IA foi criada (sem provedor, chave ou endpoint)', () => {
  assert.doesNotMatch(html, /openai|anthropic\.com|api\.anthropic|generativelanguage|openrouter|chat\/completions|generateContent|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|Bearer /i);
  for (const n of ['createExternalImportAiReview', 'externalAiReviewResultMessage', 'suggestPortugueseLesionName', 'suggestExternalEnTerm', 'externalEnTermsIndex',
    'handleExternalLinkCaseClick', 'openExternalDraft', 'editReviewRequestText', 'openEditReviewRequestModal', 'openReviewSummaryModal']) {
    const src = extractFunction(html, n);
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest/, n);
  }
});
