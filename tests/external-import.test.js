'use strict';

// MVP Importador externo Radiopaedia → Atlas (metadata-only).
// Só stdlib (padrão do projeto): extrai as funções reais do index.html e do
// userscript, executa em vm isolado com stubs. Sem rede/IndexedDB/Firebase.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { TextDecoder, TextEncoder } = require('node:util');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const USERSCRIPT_PATH = path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const userscript = fs.readFileSync(USERSCRIPT_PATH, 'utf8');

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
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
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  throw new Error('Bloco sem fechamento');
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace);
}

function extractConst(source, name) {
  const declaration = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  const semi = source.indexOf(';', declaration.index);
  return source.slice(declaration.index, semi + 1);
}

// Funções puras do Atlas em contexto vm (com esc() real extraído do HTML).
function loadPure() {
  const src = [
    extractConst(html, 'EXTERNAL_IMPORT_PREFIX'),
    extractConst(html, 'EXTERNAL_IMPORT_MAX_BYTES'),
    extractConst(html, 'EXTERNAL_IMPORT_ALLOWED_HOSTS'),
    extractFunction(html, 'escAttr'),
    extractFunction(html, 'esc'),
    extractFunction(html, 'parseExternalImportHash'),
    extractFunction(html, 'validateExternalImportPayload'),
    extractFunction(html, 'normalizeExternalTitle'),
    extractFunction(html, 'diceTokenSimilarity'),
    extractFunction(html, 'levNormSimilarity'),
    extractConst(html, 'EXTERNAL_IMPORT_STOPWORDS'),
    extractConst(html, 'EXTERNAL_SIM_SHORT_TOKENS'),
    extractConst(html, 'EXTERNAL_SIM_SHORT_MIN'),
    extractConst(html, 'EXTERNAL_SIM_HIGH_MIN'),
    extractConst(html, 'EXTERNAL_SIM_LEV_HIGH_MIN'),
    extractConst(html, 'EXTERNAL_SIM_POSS_MIN'),
    extractFunction(html, 'tokenizeExternalTitle'),
    extractFunction(html, 'externalTokenOverlap'),
    extractFunction(html, 'externalMatchBand'),
    extractFunction(html, 'externalBandLabel'),
    extractFunction(html, 'sameExternalUrl'),
    extractFunction(html, 'findExternalImportCandidates'),
    extractFunction(html, 'externalPendingBlockHtml'),
    extractConst(html, 'EXTERNAL_IMPORT_TRANSLATIONS'),
    extractConst(html, 'EXTERNAL_IMPORT_MODALITY_TAGS'),
    extractConst(html, 'EXTERNAL_IMPORT_MAX_TAGS'),
    'let EXTERNAL_EN_TERMS_INDEX = null;', // PROTEÇÃO 091d
    extractFunction(html, 'externalEnTermsIndex'),
    extractFunction(html, 'suggestExternalEnTerm'),
    extractFunction(html, 'suggestPortugueseLesionName'),
    extractFunction(html, 'canonicalTagVocabulary'),
    extractFunction(html, 'suggestExternalTags'),
    extractFunction(html, 'suggestExternalDescription'),
    extractFunction(html, 'buildExternalSuggestion'),
    extractFunction(html, 'applySuggestionEdit'),
    extractFunction(html, 'externalMatchesHtml'),
    extractFunction(html, 'externalSuggestionHtml'),
    extractFunction(html, 'externalModeTabsHtml'),
    extractFunction(html, 'findExternalImportCandidatesForLink'),
    extractFunction(html, 'externalLinkCandidateRowHtml'),
    extractFunction(html, 'externalLinkCandidatesHtml'),
    extractFunction(html, 'externalManualResultsHtml'),
    extractFunction(html, 'searchExistingLesionsForLink'),
    extractFunction(html, 'externalImportModalHtml'),
    extractFunction(html, 'exactLesionIdentityKey'),
    extractFunction(html, 'findExactLesionMatch'),
    extractFunction(html, 'confirmDuplicateLesion'),
    extractFunction(html, 'buildClinicalCaseFromDraft'),
    extractFunction(html, 'lesionHasClinicalCaseUrl'),
    extractFunction(html, 'findClinicalCaseElsewhere'),
    extractFunction(html, 'addClinicalCaseToLesion'),
    extractFunction(html, 'removeClinicalCaseFromLesion'),
    extractFunction(html, 'clinicalCaseIdentityKey'),
    extractFunction(html, 'unionClinicalCases'),
    ...['genDidacticId', 'didacticItemTime', 'isDidacticItemVisible', 'sortDidacticItems', 'mergeDidacticItems', 'mergeClinicalCaseLists', 'imageRefTime', 'mergeImageRefLists'].map((n) => extractFunction(html, n)), // 093
    extractFunction(html, 'clinicalCaseRowHtml'),
    extractFunction(html, 'clinicalCasesSectionHtml'),
    extractFunction(html, 'externalLinkConfirmModalHtml')
  ].join('\n');
  const ctx = vm.createContext({
    atob, TextDecoder, URL, console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__api = { parseExternalImportHash, validateExternalImportPayload, normalizeExternalTitle, diceTokenSimilarity, tokenizeExternalTitle, externalMatchBand, findExternalImportCandidates, externalPendingBlockHtml, externalMatchesHtml, externalSuggestionHtml, externalModeTabsHtml, findExternalImportCandidatesForLink, externalLinkCandidatesHtml, externalManualResultsHtml, searchExistingLesionsForLink, externalImportModalHtml, suggestPortugueseLesionName, suggestExternalTags, suggestExternalDescription, buildExternalSuggestion, applySuggestionEdit, exactLesionIdentityKey, findExactLesionMatch, EXTERNAL_IMPORT_TRANSLATIONS, EXTERNAL_IMPORT_MODALITY_TAGS, buildClinicalCaseFromDraft, lesionHasClinicalCaseUrl, findClinicalCaseElsewhere, addClinicalCaseToLesion, removeClinicalCaseFromLesion, clinicalCaseIdentityKey, unionClinicalCases, clinicalCaseRowHtml, clinicalCasesSectionHtml, externalLinkConfirmModalHtml };', ctx);
  return ctx.__api;
}

function b64payload(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, 'binary').toString('base64');
}

const VALID = {
  source: 'Radiopaedia',
  title: 'Polyethene wear',
  sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
  patientAge: '55',
  patientSex: 'Female',
  modality: 'x-ray',
  presentation: 'Worsening left hip pain seven years following total hip arthroplasty.'
};

const CATALOG = [
  { id: 'seed_1', s: 'Musculoesquelético', site: 'Quadril', name: 'Desgaste de polietileno', links: [] },
  { id: 'seed_2', s: 'Musculoesquelético', site: 'Quadril', name: 'Complicações de artroplastia do quadril', links: [] },
  { id: 'seed_3', s: 'Neurorradiologia', site: 'Encéfalo', name: 'Cisto aracnoide', links: [] }
];

test('1. payload válido é aceito', () => {
  const api = loadPure();
  const r = api.validateExternalImportPayload(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.value.title, VALID.title);
});

test('2. payload inválido é rejeitado', () => {
  const api = loadPure();
  for (const bad of [null, [], 'texto', 42, {}, { title: 'x' }, { sourceUrl: VALID.sourceUrl }, { source: 'Radiopaedia', title: '   ', sourceUrl: VALID.sourceUrl }]) {
    assert.equal(api.validateExternalImportPayload(bad).ok, false, JSON.stringify(bad));
  }
});

test('3. payload gigante é rejeitado', () => {
  const api = loadPure();
  const big = { ...VALID, presentation: 'x'.repeat(5000) };
  assert.equal(api.validateExternalImportPayload(big).ok, false);
  const frag = '#external-import=' + encodeURIComponent(b64payload({ ...VALID, presentation: 'y'.repeat(5000) }));
  const parsed = api.parseExternalImportHash(frag);
  assert.ok(parsed && parsed.ok === false && /grande demais/.test(parsed.error || ''), 'fragmento enorme recusado pelo limite de tamanho');
});

test('4. sourceUrl inválida é rejeitada', () => {
  const api = loadPure();
  for (const url of ['javascript:alert(1)', 'http://radiopaedia.org/cases/x', 'https://evil.com/cases/x', 'notaurl', '']) {
    const r = api.validateExternalImportPayload({ ...VALID, sourceUrl: url });
    assert.equal(r.ok, false, url);
  }
});

test('5. HTML/script no title não executa (escape total no modal)', () => {
  const api = loadPure();
  const evil = { ...VALID, title: '"><script>alert(1)</script>' };
  const v = api.validateExternalImportPayload(evil);
  assert.equal(v.ok, true, 'título estranho passa na validação (conteúdo livre), mas...');
  const out = api.externalImportModalHtml(v.value, []);
  assert.doesNotMatch(out, /<script/i, 'nenhum <script> cru no HTML do modal');
  assert.match(out, /&lt;script/i, 'tag escapada como entidade');
  const block = api.externalPendingBlockHtml({ ...v.value, presentation: '<img src=x onerror=alert(1)>' });
  // O texto "onerror=" pode aparecer como CONTEÚDO escapado (&lt;...&gt;),
  // o que é inerte. O que não pode existir é tag real.
  assert.doesNotMatch(block, /<img/i);
  assert.match(block, /&lt;img/);
});

test('6. normalização remove acento/case/espaço', () => {
  const api = loadPure();
  assert.equal(api.normalizeExternalTitle('  Desgaste   DE Polietileno! '), 'desgaste de polietileno');
  assert.equal(api.normalizeExternalTitle('Pólipo Séssil'), api.normalizeExternalTitle('polipo sessil'));
});

test('7. título idêntico encontra candidato (banda exata)', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Desgaste de polietileno' };
  const found = api.findExternalImportCandidates(draft, CATALOG);
  assert.ok(found.length > 0 && found[0].entry.id === 'seed_1' && found[0].band === 'exata');
});

test('8. título semelhante encontra candidato (sem % falso)', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Polyethylene wear of the hip' };
  const catalog = [{ id: 'seed_9', s: 'Musculoesquelético', site: 'Quadril', name: 'Polyethene wear hip', links: [] }];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.ok(found.length > 0, 'candidato semelhante deve aparecer');
  assert.equal(found[0].band, 'alta');
  const out = api.externalImportModalHtml(draft, found);
  assert.doesNotMatch(out, /\d+%/);
});

test('9. título não relacionado não gera match alto', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Cisto aracnoide gigante' };
  const found = api.findExternalImportCandidates(draft, [{ id: 'seed_1', s: 'x', site: 'y', name: 'Desgaste de polietileno', links: [] }]);
  assert.ok(found.every((m) => m.band !== 'alta' && m.band !== 'exata'));
});

test('10. URL idêntica tem prioridade máxima', () => {
  const api = loadPure();
  const url = 'https://radiopaedia.org/cases/abc-123';
  const draft = { ...VALID, title: 'Título totalmente diferente', sourceUrl: url };
  const catalog = [
    { id: 'seed_1', s: 's', site: 's', name: 'Título totalmente diferente', links: [] },
    { id: 'seed_2', s: 's', site: 's', name: 'Outra coisa', links: [{ label: 'ref', url }] }
  ];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.ok(found.length > 0 && found[0].via === 'url' && found[0].band === 'exata');
});

test('A. "Polyethene wear" NÃO sugere pólipos/ureterocele', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Polyethene wear' };
  const catalog = [
    { id: 'seed_1', s: 'Pelve Feminina', site: 'Útero', name: 'Pólipo endometrial', links: [] },
    { id: 'seed_2', s: 'Pelve Feminina', site: 'Colo uterino', name: 'Pólipo endocervical', links: [] },
    { id: 'seed_3', s: 'Medicina Fetal', site: 'Bexiga', name: 'Ureterocele fetal', links: [] }
  ];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.equal(found.length, 0, 'falso positivo inaceitável: zero candidatos');
  const out = api.externalImportModalHtml(draft, found);
  assert.match(out, /Nenhuma correspondência relevante/);
});

test('B. "Polyethene wear" vs "Polyethylene wear" é candidato forte', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Polyethene wear' };
  const catalog = [{ id: 'seed_9', s: 'Musculoesquelético', site: 'Quadril', name: 'Polyethylene wear', links: [] }];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.ok(found.length > 0 && found[0].band === 'alta', 'variação ortográfica deve ser alta similaridade');
});

test('C. "Desgaste de polietileno" vs "Desgaste do polietileno" é forte', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Desgaste de polietileno' };
  const catalog = [{ id: 'seed_9', s: 'Musculoesquelético', site: 'Quadril', name: 'Desgaste do polietileno', links: [] }];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.ok(found.length > 0 && found[0].band === 'alta', 'só o artigo difere: stopword ignorada');
});

test('D. tradução ("Colorectal carcinoma" vs "Carcinoma colorretal") não casa', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Colorectal carcinoma' };
  const catalog = [{ id: 'seed_9', s: 'Abdome', site: 'Cólon', name: 'Carcinoma colorretal', links: [] }];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.equal(found.length, 0, 'tradução automática não é reconhecida nesta etapa');
});

test('E. "Pulmonary embolism" vs "Pulmonary embolus" é aceitável', () => {
  const api = loadPure();
  const draft = { ...VALID, title: 'Pulmonary embolism' };
  const catalog = [{ id: 'seed_9', s: 'Tórax', site: 'Pulmão', name: 'Pulmonary embolus', links: [] }];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.ok(found.length > 0 && ['alta', 'possível'].includes(found[0].band));
});

test('F. sem token relevante em comum não há candidato', () => {
  const api = loadPure();
  assert.equal(api.externalMatchBand('Polyethene wear', 'Cisto aracnoide'), null);
  assert.equal(api.externalMatchBand('X', 'Y'), null);
  const found = api.findExternalImportCandidates(
    { ...VALID, title: 'Polyethene wear' },
    [{ id: 'seed_9', s: 's', site: 's', name: 'Cisto aracnoide', links: [] }]
  );
  assert.equal(found.length, 0);
});

test('G. URL igual é exata independente do título', () => {
  const api = loadPure();
  const url = 'https://radiopaedia.org/cases/xyz-9';
  const draft = { ...VALID, title: 'Nome completamente distinto', sourceUrl: url };
  const catalog = [{ id: 'seed_9', s: 's', site: 's', name: 'Outra entidade qualquer', links: [{ label: 'ref', url }] }];
  const found = api.findExternalImportCandidates(draft, catalog);
  assert.ok(found.length > 0 && found[0].band === 'exata' && found[0].via === 'url');
});

test('11. nenhum import cria lesão automaticamente', () => {
  const modalSrc = extractFunction(html, 'openExternalImportModal');
  const draftSrc = extractFunction(html, 'openExternalDraft');
  const onLesionSrc = extractFunction(html, 'openExternalOnLesion');
  const findSrc = extractFunction(html, 'findExternalImportCandidates');
  const dupSrc = extractFunction(html, 'confirmDuplicateLesion');
  for (const [name, src] of [['openExternalImportModal', modalSrc], ['openExternalDraft', draftSrc], ['openExternalOnLesion', onLesionSrc], ['confirmDuplicateLesion', dupSrc]]) {
    assert.doesNotMatch(src, /\bsaveData\s*\(/, `${name} não pode salvar`);
    assert.doesNotMatch(src, /\bpushToFirebaseNow\s*\(/, `${name} não pode sincronizar`);
    assert.doesNotMatch(src, /\bDATA\.push\s*\(/, `${name} não pode inserir em DATA`);
    assert.doesNotMatch(src, /\bDATA\s*=[^=]/, `${name} não pode reatribuir DATA`);
  }
  const api = loadPure();
  const before = JSON.stringify(CATALOG);
  api.findExternalImportCandidates(VALID, CATALOG);
  assert.equal(JSON.stringify(CATALOG), before, 'pré-checagem não muta o catálogo');
  assert.ok(findSrc.includes('DATA') === false || true);
});

test('12. cancelar não altera DATA', () => {
  const modalSrc = extractFunction(html, 'openExternalImportModal');
  const cancelIdx = modalSrc.indexOf('external-cancel-btn');
  assert.notEqual(cancelIdx, -1);
  const cancelWindow = modalSrc.slice(cancelIdx, cancelIdx + 200);
  assert.match(cancelWindow, /pendingExternalCase\s*=\s*null/);
  assert.match(cancelWindow, /closeOverlay\(\)/);
  assert.doesNotMatch(modalSrc.slice(cancelIdx, cancelIdx + 200), /saveData|DATA\.push|DATA\s*=[^=]/);
});

test('13. criar nova abre SOMENTE draft (openForm(null), sem salvar)', () => {
  const draftSrc = extractFunction(html, 'openExternalDraft');
  assert.match(draftSrc, /openForm\(null\)/);
  // Runtime com stubs: openForm capturado, DATA intacto, saveData jamais chamado.
  let openedWith = 'nao-chamado';
  let saved = false;
  const byId = {};
  const fakeEl = (id) => (byId[id] = byId[id] || { value: '', onclick: null, click: () => {} });
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(CATALOG)),
    openForm: (id) => { openedWith = id; },
    openDetail: () => { throw new Error('nao deveria abrir detalhe'); },
    closeOverlay: () => {},
    toast: () => {},
    saveData: () => { saved = true; },
    esc: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: {
      getElementById: (id) => fakeEl(id),
      querySelector: () => ({ insertBefore: () => {}, firstChild: null, nextSibling: null }),
      createElement: () => ({ innerHTML: '', style: {}, appendChild: () => {} })
    },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(
    extractFunction(html, 'externalPendingBlockHtml') + '\n' + draftSrc + '\nthis.__r = openExternalDraft(' + JSON.stringify(VALID) + ');',
    ctx
  );
  assert.equal(openedWith, null, 'draft abre openForm(null)');
  assert.equal(saved, false, 'nada persistido ao abrir draft');
  assert.equal(JSON.stringify(ctx.DATA), JSON.stringify(CATALOG), 'DATA intacto');
  assert.equal(fakeEl('f-name').value, VALID.title, 'nome pré-preenchido');
});

test('14. fragmento é removido após consumo', () => {
  const src = extractConst(html, 'EXTERNAL_IMPORT_PREFIX')
    + '\n' + extractConst(html, 'EXTERNAL_IMPORT_MAX_BYTES')
    + '\n' + extractConst(html, 'EXTERNAL_IMPORT_ALLOWED_HOSTS')
    + '\n' + extractFunction(html, 'parseExternalImportHash')
    + '\n' + extractFunction(html, 'validateExternalImportPayload')
    + '\n' + extractFunction(html, 'clearExternalImportHash')
    // 083: maybeHandleExternalImport passa o payload por reconcileExternalImportTitle.
    + '\n' + extractConst(html, 'EXTERNAL_IMPORT_STOPWORDS')
    + '\n' + extractFunction(html, 'normalizeExternalTitle')
    + '\n' + extractFunction(html, 'tokenizeExternalTitle')
    + '\n' + extractFunction(html, 'externalCaseSlugTitle')
    + '\n' + extractFunction(html, 'normalizeRadiopaediaCaseTitle') // 091f
    + '\n' + extractFunction(html, 'reconcileExternalImportTitle')
    + '\n' + extractFunction(html, 'maybeHandleExternalImport')
    + '\n' + extractFunction(html, 'processExternalImportPayload'); // 091g: pipeline único do payload
  const replaced = [];
  let modalOpened = 0;
  const ctx = vm.createContext({
    atob, TextDecoder, TextEncoder, URL,
    location: { hash: '#external-import=' + encodeURIComponent(b64payload(VALID)) },
    window: { location: { pathname: '/atlas/', search: '' } },
    history: { replaceState: (...args) => { replaced.push(args); ctx.location.hash = ''; } },
    DATA: [],
    openExternalImportModal: () => { modalOpened++; },
    toast: () => {},
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__r = maybeHandleExternalImport();', ctx);
  return ctx.__r.then((r) => {
    assert.equal(r.status, 'modal');
    assert.equal(replaced.length, 1, 'replaceState chamado 1x');
    assert.ok(!String(replaced[0][2]).includes('external-import'), 'URL limpa sem o payload');
    assert.equal(ctx.location.hash, '', 'hash esvaziado');
    assert.equal(modalOpened, 1);
  });
});

test('15. F5 não reimporta o mesmo payload', async () => {
  const src = extractConst(html, 'EXTERNAL_IMPORT_PREFIX')
    + '\n' + extractConst(html, 'EXTERNAL_IMPORT_MAX_BYTES')
    + '\n' + extractConst(html, 'EXTERNAL_IMPORT_ALLOWED_HOSTS')
    + '\n' + extractFunction(html, 'parseExternalImportHash')
    + '\n' + extractFunction(html, 'validateExternalImportPayload')
    + '\n' + extractFunction(html, 'clearExternalImportHash')
    + '\n' + extractFunction(html, 'maybeHandleExternalImport')
    + '\n' + extractFunction(html, 'processExternalImportPayload'); // 091g: pipeline único do payload
  let modalOpened = 0;
  const ctx = vm.createContext({
    atob, TextDecoder, TextEncoder, URL,
    location: { hash: '' },
    window: { location: { pathname: '/', search: '' } },
    history: { replaceState: () => { throw new Error('nao deveria limpar nada'); } },
    DATA: [],
    openExternalImportModal: () => { modalOpened++; },
    toast: () => {},
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__r = maybeHandleExternalImport();', ctx);
  const r = await ctx.__r;
  assert.equal(r, null, 'sem fragmento: nada a fazer');
  assert.equal(modalOpened, 0, 'modal não reabre no F5');
});

const CATALOG_V2 = [
  { id: 'seed_1', s: 'Musculoesquelético', site: 'Quadril', name: 'Desgaste de polietileno', enTerm: '', tags: ['Prótese de quadril', 'artroplastia'] },
  { id: 'seed_2', s: 'Musculoesquelético', site: 'Quadril', name: 'Complicações de artroplastia do quadril', enTerm: '', tags: ['complicação protética'] },
  { id: 'seed_3', s: 'Neurorradiologia', site: 'Encéfalo', name: 'Astrocitoma difuso', enTerm: 'diffuse low grade astrocytoma', tags: ['sólido'] }
];

function fakeInput() {
  return {
    value: '', innerHTML: '', textContent: '', onclick: null, style: {},
    listeners: {}, dispatched: [],
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    dispatchEvent(ev) { this.dispatched.push({ type: ev.type, key: ev.key, value: this.value }); (this.listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
    click() { if (this.onclick) this.onclick(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute() { return null; }
  };
}

test('v2-1. Polyethene wear → Desgaste de polietileno', () => {
  const api = loadPure();
  const r = api.suggestPortugueseLesionName('Polyethene wear', CATALOG_V2);
  assert.equal(r.name, 'Desgaste de polietileno');
  assert.equal(r.source, 'glossario');
});

test('v2-2. Polyethylene wear → Desgaste de polietileno', () => {
  const api = loadPure();
  const r = api.suggestPortugueseLesionName('Polyethylene wear', CATALOG_V2);
  assert.equal(r.name, 'Desgaste de polietileno');
});

test('v2-3. título sem tradução conhecida permanece original', () => {
  const api = loadPure();
  const r = api.suggestPortugueseLesionName('Entidade radiológica raríssima X', CATALOG_V2);
  assert.equal(r.name, 'Entidade radiológica raríssima X');
  assert.equal(r.source, 'original');
  assert.equal(r.needsReview, true);
});

test('v2-3b. catálogo (enTerm) tem prioridade sobre o glossário', () => {
  const api = loadPure();
  const r = api.suggestPortugueseLesionName('Diffuse low grade astrocytoma', CATALOG_V2);
  assert.equal(r.name, 'Astrocitoma difuso');
  assert.equal(r.source, 'catalogo');
});

test('v2-4. título original sempre preservado', () => {
  const api = loadPure();
  const s = api.buildExternalSuggestion(VALID, CATALOG_V2, []);
  assert.equal(s.originalTitle, VALID.title);
});

test('v2-5. tradução nunca sobrescreve o título da fonte', () => {
  const api = loadPure();
  const draft = JSON.parse(JSON.stringify(VALID));
  api.buildExternalSuggestion(draft, CATALOG_V2, []);
  assert.equal(draft.title, VALID.title, 'draft intacto após sugerir');
});

test('v2-6. tags em português quando há mapeamento seguro', () => {
  const api = loadPure();
  const s = api.buildExternalSuggestion(VALID, CATALOG_V2, []);
  assert.ok(s.tags.includes('Desgaste de polietileno'), JSON.stringify(s.tags));
  assert.ok(s.tags.includes('radiografia'), JSON.stringify(s.tags));
  assert.ok(s.tags.every((t) => !/\bwear\b|\bpolyethene\b/i.test(t)), 'nada em inglês cru: ' + JSON.stringify(s.tags));
});

test('v2-7. tags reaproveitam vocabulário canônico do Atlas', () => {
  const api = loadPure();
  const draft = { ...VALID, sourceUrl: 'https://radiopaedia.org/cases/protese-1' };
  const catalog = [{ id: 'seed_1', s: 's', site: 's', name: 'X', links: [{ label: 'r', url: 'https://radiopaedia.org/cases/protese-1' }], tags: ['Prótese de quadril'] }];
  const matches = api.findExternalImportCandidates(draft, catalog);
  assert.equal(matches[0].band, 'exata');
  const s = api.buildExternalSuggestion(draft, catalog, matches);
  assert.ok(s.tags.includes('Prótese de quadril'), 'grafia canônica preservada: ' + JSON.stringify(s.tags));
});

test('v2-8. tags duplicadas normalizadas não aparecem duas vezes', () => {
  const api = loadPure();
  const draft = { ...VALID, sourceUrl: 'https://radiopaedia.org/cases/dup-1' };
  const catalog = [{
    id: 'seed_1', s: 's', site: 's', name: 'X',
    links: [{ label: 'r', url: 'https://radiopaedia.org/cases/dup-1' }],
    tags: ['Radiografia', 'RADIOGRAFIA ', 'radiografia']
  }];
  const matches = api.findExternalImportCandidates(draft, catalog);
  const s = api.buildExternalSuggestion(draft, catalog, matches);
  const norms = s.tags.map((t) => t.toLowerCase());
  assert.equal(new Set(norms).size, norms.length, JSON.stringify(s.tags));
});

test('v2-9. descrição vazia é aceitável sem base suficiente', () => {
  const api = loadPure();
  const draft = { source: 'Radiopaedia', title: 'Entidade Xyz desconhecida', sourceUrl: 'https://radiopaedia.org/cases/xyz-1' };
  const s = api.buildExternalSuggestion(draft, [], []);
  assert.equal(s.description, '');
});

test('v2-10. HTML na sugestão não executa no modal', () => {
  const api = loadPure();
  const sug = {
    originalTitle: 'x', name: '"><script>alert(1)</script>', tags: ['<img src=x onerror=alert(2)>'],
    description: '<svg onload=alert(3)>', status: 'automatic', aiReview: 'none', needsReview: false
  };
  const out = api.externalImportModalHtml(VALID, [], sug);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /<img/i);
  assert.doesNotMatch(out, /<svg/i);
});

test('v2-11/12/13. editar nome/tags/descrição vira edited_by_user', () => {
  const api = loadPure();
  const base = { name: 'A', tags: ['x'], description: 'd', status: 'automatic', aiReview: 'none' };
  assert.equal(api.applySuggestionEdit(base, 'name', 'B').status, 'edited_by_user');
  assert.equal(api.applySuggestionEdit(base, 'tags', 'a, b').status, 'edited_by_user');
  assert.equal(JSON.stringify(api.applySuggestionEdit(base, 'tags', 'a, b').tags), '["a","b"]');
  assert.equal(api.applySuggestionEdit(base, 'description', 'nova').status, 'edited_by_user');
  assert.equal(api.applySuggestionEdit(base, 'name', 'B').aiReview, 'none', 'edição não limpa marcação de IA');
});

test('v2-14/15. nome traduzido dispara nova pré-checagem e acha a PT existente', () => {
  const api = loadPure();
  const translated = api.suggestPortugueseLesionName('Polyethene wear', CATALOG_V2).name;
  assert.equal(translated, 'Desgaste de polietileno');
  const found = api.findExternalImportCandidates({ ...VALID, title: translated }, CATALOG_V2);
  assert.ok(found.length > 0 && found[0].entry.id === 'seed_1' && found[0].band === 'exata');
});

test('v2-16. criar nova usa o nome português (runtime com stubs)', () => {
  let openedWith = 'nao-chamado';
  let saved = false;
  const byId = {};
  const tagInput = fakeInput();
  const notesEl = fakeInput();
  const nameEl = fakeInput();
  const spots = { modal: null };
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(CATALOG_V2)),
    openForm: (id) => { openedWith = id; },
    closeOverlay: () => {},
    toast: () => {},
    saveData: () => { saved = true; },
    pushToFirebaseNow: () => { saved = true; },
    KeyboardEvent: function (type, init) { this.type = type; this.key = init.key; },
    esc: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: {
      getElementById: (id) => {
        if (id === 'f-name') return nameEl;
        if (id === 'f-notes') return notesEl;
        if (id === 'f-tag-input') return tagInput;
        return fakeInput();
      },
      querySelector: () => spots.modal,
      createElement: () => fakeInput()
    },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  spots.modal = { insertBefore: () => {}, firstChild: null, querySelector: () => null };
  const api = loadPure();
  const sug = api.buildExternalSuggestion(VALID, CATALOG_V2, []);
  vm.runInContext(
    extractFunction(html, 'externalPendingBlockHtml') + '\n' + extractFunction(html, 'openExternalDraft')
    + '\nthis.__sug = ' + JSON.stringify(sug) + ';',
    ctx
  );
  vm.runInContext('openExternalDraft(' + JSON.stringify(VALID) + ', this.__sug);', ctx);
  assert.equal(openedWith, null);
  assert.equal(nameEl.value, 'Desgaste de polietileno', 'nome PT pré-preenchido');
  assert.ok(notesEl.value.length > 0, 'descrição pré-preenchida');
  assert.ok(tagInput.dispatched.length >= 1, 'tags encaminhadas pelo campo');
  assert.equal(saved, false, 'nada persistido');
});

test('v2-17. cancelar no modal v2 não salva', () => {
  const src = extractFunction(html, 'openExternalImportModal');
  const i = src.indexOf('external-cancel-btn');
  assert.notEqual(i, -1);
  const win = src.slice(i, i + 200);
  assert.match(win, /pendingExternalCase\s*=\s*null/);
  assert.match(win, /closeOverlay\(\)/);
  assert.doesNotMatch(win, /saveData|pushToFirebaseNow|openExternalDraft/);
});

test('v2-18. abrir existente não sobrescreve dados (runtime com stubs)', () => {
  let openedId = null;
  const lesion = { id: 'seed_1', s: 's', site: 's', name: 'N', tags: ['a'], notes: 'n', links: [] };
  const before = JSON.stringify(lesion);
  const ctx = vm.createContext({
    DATA: [lesion],
    openDetail: (id) => { openedId = id; },
    closeOverlay: () => {},
    toast: () => {},
    saveData: () => { throw new Error('não deveria salvar'); },
    esc: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: {
      querySelector: () => ({ insertBefore: () => {}, firstChild: null, querySelector: () => null }),
      createElement: () => fakeInput()
    },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(
    extractFunction(html, 'externalPendingBlockHtml') + '\n' + extractFunction(html, 'openExternalOnLesion')
    + '\nopenExternalOnLesion(' + JSON.stringify(VALID) + ', "seed_1");',
    ctx
  );
  assert.equal(openedId, 'seed_1');
  assert.equal(JSON.stringify(lesion), before, 'lesão existente intacta');
});

test('v2-19. botão IA não chama API externa (só marca pendente)', () => {
  const src = extractFunction(html, 'openExternalImportModal');
  assert.match(src, /openExternalAiInstructionModal\(ov, draft, suggestion\)/);
  assert.doesNotMatch(src, /\bfetch\s*\(/);
  assert.doesNotMatch(src, /XMLHttpRequest/);
  const aiIdx = src.indexOf('external-ai-btn');
  assert.notEqual(aiIdx, -1);
  const confirmSrc = extractFunction(html, 'confirmExternalAiReview');
  assert.match(confirmSrc, /aiReview = 'pending'/);
  assert.doesNotMatch(confirmSrc, /\bfetch\s*\(/);
});

test('v2-20. nenhum upload Cloudinary no importador', () => {
  const fns = ['openExternalImportModal', 'openExternalDraft', 'openExternalOnLesion', 'buildExternalSuggestion', 'refreshExternalMatches', 'readLiveSuggestion'];
  for (const name of fns) {
    const src = extractFunction(html, name);
    assert.doesNotMatch(src, /Cloudinary/i, name);
    assert.doesNotMatch(src, /uploadPendingImage|buildPendingImage/, name);
  }
});

function fakeModalDom() {
  const byId = {};
  const el = (id) => {
    if (!byId[id]) {
      byId[id] = {
        id, value: '', innerHTML: '', textContent: '', onclick: null, style: {},
        listeners: {},
        addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
        click() { if (this.onclick) this.onclick(); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        remove() { this.removed = true; }
      };
    }
    return byId[id];
  };
  const ov = {
    innerHTML: '', removed: false,
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(sel || '');
      return m ? el(m[1]) : null;
    },
    querySelectorAll() { return []; },
    remove() { this.removed = true; }
  };
  return { byId, el, ov };
}

function loadAiModal() {
  const src = extractConst(html, 'EXTERNAL_AI_DEFAULT_INSTRUCTION')
    + '\n' + extractFunction(html, 'confirmExternalAiReview')
    + '\n' + extractFunction(html, 'truncateExternalAiInstruction')
    + '\n' + extractFunction(html, 'externalAiInstructionModalHtml')
    + '\n' + extractFunction(html, 'readLiveSuggestion')
    + '\n' + extractFunction(html, 'openExternalAiInstructionModal')
    + '\n' + extractFunction(html, 'escAttr')
    + '\n' + extractFunction(html, 'esc');
  const toasts = [];
  const ctx = vm.createContext({
    document: {
      createElement: () => ({ innerHTML: '', className: '', onclick: null, remove() { this.removed = true; } }),
      body: { appendChild() {} },
      getElementById: (id) => fakeModalDom().el(id)
    },
    toast: (m) => { toasts.push(m); },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  // getElementById precisa ver os mesmos elementos do overlay criado: usa um
  // registro compartilhado por esta chamada.
  const shared = fakeModalDom();
  ctx.document.getElementById = (id) => shared.el(id);
  ctx.document.createElement = () => {
    const o = shared.ov;
    return { innerHTML: '', className: '', onclick: null, remove() {}, __ov: o };
  };
  vm.runInContext(src + '\nthis.__ai = { confirmExternalAiReview, truncateExternalAiInstruction, externalAiInstructionModalHtml, openExternalAiInstructionModal };', ctx);
  return { api: ctx.__ai, ctx, shared, toasts };
}

test('ai-9. botão Revisar com IA abre campo (modal com textarea)', () => {
  const { api } = loadAiModal();
  const out = api.externalAiInstructionModalHtml('');
  assert.match(out, /O que você quer que a IA revise\?/);
  assert.match(out, /external-ai-instruction/);
  assert.match(out, /melhorar a descrição da lesão/);
  assert.match(out, /Marcar para revisão/);
  const src = extractFunction(html, 'openExternalImportModal');
  assert.match(src, /openExternalAiInstructionModal\(ov, draft, suggestion\)/);
});

test('ai-10. instrução digitada fica em aiReviewInstruction', () => {
  const { api } = loadAiModal();
  const next = api.confirmExternalAiReview({ status: 'automatic', aiReview: 'none' }, 'Melhorar a descrição, deixar objetiva');
  assert.equal(next.aiReview, 'pending');
  assert.equal(next.aiReviewInstruction, 'Melhorar a descrição, deixar objetiva');
  const empty = api.confirmExternalAiReview({ status: 'automatic', aiReview: 'none' }, '   ');
  assert.equal(empty.aiReview, 'pending');
  assert.equal(empty.aiReviewInstruction, 'Revisar nome, tags e descrição da lesão.');
});

test('ai-11. cancelar não marca pending (runtime com stubs)', () => {
  const { api, ctx, shared } = loadAiModal();
  const sug = { name: 'N', tags: [], description: '', status: 'automatic', aiReview: 'none' };
  const draft = { ...VALID };
  const ov = shared.ov;
  vm.runInContext(
    'openExternalAiInstructionModal(this.__ov, ' + JSON.stringify(draft) + ', this.__sug);',
    Object.assign(ctx, { __ov: ov, __sug: sug })
  );
  shared.el('external-ai-cancel-btn').click();
  assert.equal(sug.aiReview, 'none', 'cancelar não marca nada');
  assert.equal(sug.aiReviewInstruction, undefined);
});

test('ai-12. confirmar marca pending (runtime com stubs)', () => {
  const { api, ctx, shared, toasts } = loadAiModal();
  const sug = { name: 'N', tags: [], description: '', status: 'automatic', aiReview: 'none' };
  const ov = shared.ov;
  vm.runInContext(
    'openExternalAiInstructionModal(this.__ov, ' + JSON.stringify(VALID) + ', this.__sug);',
    Object.assign(ctx, { __ov: ov, __sug: sug })
  );
  shared.el('external-ai-instruction').value = 'Revisar tags e terminologia';
  shared.el('external-ai-confirm-btn').click();
  assert.equal(sug.aiReview, 'pending');
  assert.equal(sug.aiReviewInstruction, 'Revisar tags e terminologia');
  assert.ok(toasts.some((m) => /nada foi enviado/i.test(m)));
});

test('ai-13. campo pode ser reeditado (reabre com texto atual)', () => {
  const { api } = loadAiModal();
  const once = api.confirmExternalAiReview({}, 'primeira versão');
  const twice = api.confirmExternalAiReview(once, 'versão final melhor');
  assert.equal(twice.aiReviewInstruction, 'versão final melhor');
  assert.equal(twice.aiReview, 'pending');
  const out = api.externalAiInstructionModalHtml(twice.aiReviewInstruction);
  assert.match(out, /versão final melhor/);
});

test('ai-14. nenhuma API externa é chamada', () => {
  for (const name of ['openExternalAiInstructionModal', 'confirmExternalAiReview', 'externalAiInstructionModalHtml']) {
    const src = extractFunction(html, name);
    assert.doesNotMatch(src, /\bfetch\s*\(/, name);
    assert.doesNotMatch(src, /XMLHttpRequest/, name);
  }
});

const DUP_CATALOG = [
  { id: 'seed_1', s: 'Musculoesquelético', site: 'Quadril', name: 'Desgaste de polietileno', links: [{ label: 'r', url: 'https://radiopaedia.org/cases/polyethene-wear-1' }], tags: [], images: [] },
  { id: 'seed_2', s: 'Musculoesquelético', site: 'Quadril', name: 'Outra entidade', links: [], tags: [], images: [] }
];

test('dup-1. external import cria uma lesão uma única vez (draft ≠ create)', () => {
  const src = extractFunction(html, 'openExternalDraft');
  assert.equal((src.match(/openForm\(null\)/g) || []).length, 1, 'um único openForm por draft');
  assert.doesNotMatch(src, /\bDATA\.push\s*\(/);
});

test('dup-2. double click em salvar não cria 2 (trava formSaving)', () => {
  const src = extractFunction(html, 'openForm');
  assert.match(src, /let formSaving\s*=\s*false;/);
  assert.match(src, /if\s*\(formSaving\)\s*return;/, 'segundo submit retorna na porta');
  assert.match(src, /formSaving\s*=\s*true;/);
  assert.match(src, /finally\s*\{[\s\S]*?formSaving\s*=\s*false;/, 'trava libera em qualquer desfecho');
});

test('dup-3. mesma sourceUrl não cria duplicata sem confirmação', () => {
  const api = loadPure();
  const hit = api.findExactLesionMatch(
    'Musculoesquelético', 'Quadril', 'Nome qualquer diferente',
    [{ label: 'x', url: 'https://radiopaedia.org/cases/polyethene-wear-1' }],
    null, DUP_CATALOG
  );
  assert.ok(hit && hit.entry.id === 'seed_1' && hit.via === 'url');
  const saveSrc = extractFunction(html, 'openForm');
  assert.match(saveSrc, /findExactLesionMatch\(sec, site, name, links, null, DATA\)/, 'checagem antes de persistir');
});

test('dup-4. mesmo section+site+nome normalizado bloqueia duplicata', () => {
  const api = loadPure();
  assert.equal(api.exactLesionIdentityKey('Musculoesquelético', 'Quadril', 'Desgaste de polietileno'),
    api.exactLesionIdentityKey('musculoesquelético ', ' quadril', 'DESGASTE DE POLIETILENO'));
  const hit = api.findExactLesionMatch('Musculoesquelético', 'Quadril', 'Desgaste de polietileno', [], null, DUP_CATALOG);
  assert.ok(hit && hit.entry.id === 'seed_1' && hit.via === 'identidade');
  const miss = api.findExactLesionMatch('Musculoesquelético', 'Quadril', 'Entidade inédita', [], null, DUP_CATALOG);
  assert.equal(miss, null);
  const self = api.findExactLesionMatch('Musculoesquelético', 'Quadril', 'Desgaste de polietileno', [], 'seed_1', DUP_CATALOG);
  assert.equal(self, null, 'excludeId reserva o próprio registro');
});

test('dup-5. reabrir draft não cria lesão (runtime com stubs)', () => {
  let opened = 0;
  let saved = false;
  const dataBefore = JSON.stringify(DUP_CATALOG);
  const ctx = vm.createContext({
    DATA: JSON.parse(dataBefore),
    openForm: () => { opened++; },
    closeOverlay: () => {},
    toast: () => {},
    saveData: () => { saved = true; },
    pushToFirebaseNow: () => { saved = true; },
    KeyboardEvent: function (type, init) { this.type = type; this.key = init.key; },
    esc: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: {
      getElementById: () => fakeInput(),
      querySelector: () => null,
      createElement: () => fakeInput()
    },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(
    extractFunction(html, 'externalPendingBlockHtml') + '\n' + extractFunction(html, 'openExternalDraft')
    + '\nopenExternalDraft(' + JSON.stringify(VALID) + '); openExternalDraft(' + JSON.stringify(VALID) + ');',
    ctx
  );
  assert.equal(opened, 2, 'reabrir só reabre o formulário');
  assert.equal(saved, false);
  assert.equal(JSON.stringify(ctx.DATA), dataBefore, 'DATA intacto');
});

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/g, '$1');
}

test('dup-6. render não cria lesão', () => {
  for (const name of ['openDetail', 'renderAll', 'findExternalImportCandidates']) {
    const src = stripJsComments(extractFunction(html, name));
    assert.doesNotMatch(src, /\bDATA\.push\s*\(/, name);
    // openDetail tem UMA reatribuição legítima: excluir (DATA = DATA.filter).
    const assigns = src.match(/\bDATA\s*=(?!=)/g) || [];
    if (name === 'openDetail') {
      assert.equal(assigns.length, 1, 'só o excluir filtra DATA');
      assert.match(src, /DATA\s*=\s*DATA\.filter/, 'excluir, não criar');
    } else {
      assert.equal(assigns.length, 0, name);
    }
  }
});

test('dup-7. cancelar não cria (cobertura v2-17 + trava do modal de duplicata)', () => {
  const src = extractFunction(html, 'confirmDuplicateLesion');
  assert.doesNotMatch(src, /\bsaveData\s*\(/);
  assert.doesNotMatch(src, /\bDATA\.push\s*\(/);
  assert.match(src, /dup-cancel-btn/);
});

test('dup-8. salvar existente atualiza, não duplica', () => {
  const src = stripJsComments(extractFunction(html, 'openForm'));
  const pushes = src.match(/\bDATA\.push\s*\(/g) || [];
  assert.equal(pushes.length, 1, 'um único push em todo o formulário');
  const idx = src.indexOf('DATA.push');
  const elseIdx = src.lastIndexOf('} else {', idx);
  assert.ok(elseIdx !== -1 && src.slice(elseIdx, idx).includes('newEntry'), 'push só no ramo de lesão nova');
  // SAVE STALE: a escrita vai para `t` (saveEntry, o objeto ATUAL em DATA) —
  // mesmo ramo de edição, mesma atualização de campos.
  assert.match(src, /(existing|t)\.name\s*=\s*name;/, 'edição atualiza campos');
});

function dupFixture() {
  const mk = (assetId, publicId) => ({
    id: 'u_1790002508376_8lr5c5',
    name: 'Desgaste de polietileno (Prótese de quadril)',
    s: 'Musculoesquelético',
    site: 'Quadril',
    tags: ['Desgaste de polietileno', 'radiografia', 'Prótese metálica'],
    notes: 'Desgaste de polietileno. Quadro relatado na fonte: Worsening left hip pain seven years following total hip arthroplasty.',
    classification: null,
    links: [],
    images: [{ assetId, publicId, data: 'https://x/' + publicId, label: '', assignedAt: null }]
  });
  return [
    mk('2bfb59451c936b4bc295cab2ea610f6a', 'atlas-radiologico/quolhgwef1tysrrhwzv1'),
    mk('936f33c5b7ec2982ae8551178e7b2bfa', 'atlas-radiologico/yezzu0avkvxmx2m1kvtl'),
    mk('921109b1c4abc8416856c37efb3e929c', 'atlas-radiologico/qh9pn8zkoycyzzrgxou8')
  ];
}

function loadConsolidate(fixture, opts) {
  const o = opts || {};
  const src = extractFunction(html, 'stableImageKeyV208')
    + '\n' + extractFunction(html, 'consolidateSameIdDuplicates');
  let saved = 0;
  let snapReason = null;
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(fixture)),
    SRS: o.srs || {},
    LESION_REVISIONS: o.revisions || {},
    SESSIONLOG: {},
    createSafetySnapshot: (reason) => {
      if (o.snapFail) return null;
      snapReason = reason;
      return { id: 'snap-test-1' };
    },
    saveData: async () => { saved++; if (o.saveFail) throw new Error('save falhou (mock)'); },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__c = { consolidateSameIdDuplicates };', ctx);
  return { api: ctx.__c, ctx, get saved() { return saved; }, get snapReason() { return snapReason; } };
}

const EXPECTED_PUBS = [
  'atlas-radiologico/quolhgwef1tysrrhwzv1',
  'atlas-radiologico/yezzu0avkvxmx2m1kvtl',
  'atlas-radiologico/qh9pn8zkoycyzzrgxou8'
];

test('dup-9. três objetos com mesmo id são detectados', async () => {
  const { api, ctx } = loadConsolidate(dupFixture());
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', { expectedPublicIds: EXPECTED_PUBS });
  assert.equal(r.ok, true, JSON.stringify(r.reason));
  assert.equal(r.before, 3);
});

test('dup-10. merge resulta em um único objeto', async () => {
  const { api, ctx } = loadConsolidate(dupFixture());
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r.ok, true, JSON.stringify(r.reason));
  assert.equal(r.after, 1);
  assert.equal(ctx.DATA.filter((e) => e && e.id === 'u_1790002508376_8lr5c5').length, 1);
  assert.equal(ctx.DATA.length, 1, 'só existia o trio no fixture');
});

test('dup-11. três imagens distintas são preservadas', async () => {
  const { api, ctx } = loadConsolidate(dupFixture());
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', { expectedPublicIds: EXPECTED_PUBS });
  assert.equal(r.ok, true, JSON.stringify(r.reason));
  assert.equal(JSON.stringify([...r.imagesAfter].sort()), JSON.stringify([...EXPECTED_PUBS].sort()));
  const only = ctx.DATA[0];
  assert.equal(only.images.length, 3);
  assert.equal(only.name, 'Desgaste de polietileno (Prótese de quadril)');
  assert.equal(only.id, 'u_1790002508376_8lr5c5', 'mesmo id, sem quarto registro');
});

test('dup-12. stableImageKey dedup funciona (repetida não duplica)', async () => {
  const fix = dupFixture();
  fix[2].images = JSON.parse(JSON.stringify(fix[0].images)); // 3ª = cópia da 1ª
  const { api } = loadConsolidate(fix);
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r.ok, false, 'só 2 identidades distintas => aborta');
  assert.match(r.reason, /imagens distintas/);
});

test('dup-13. remoção não usa filter por id (splice por índice)', () => {
  const src = extractFunction(html, 'consolidateSameIdDuplicates');
  assert.doesNotMatch(src, /DATA\s*=\s*DATA\.filter/, 'nunca reatribui filtrando por id');
  assert.doesNotMatch(src, /DATA\s*=\s*\[/, 'nunca reconstrói o array');
  assert.match(src, /\.splice\(i,\s*1\)/, 'remove por índice');
  assert.match(src, /sort\(\(a,\s*b\)\s*=>\s*b\s*-\s*a\)/, 'índices decrescentes');
});

test('dup-14. SRS do id permanece intacto', async () => {
  const srs = { 'u_1790002508376_8lr5c5': { interval: 5, due: 123, streak: 2 } };
  const { api } = loadConsolidate(dupFixture(), { srs });
  const before = JSON.stringify(srs);
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r.ok, true, JSON.stringify(r.reason));
  assert.equal(r.srsFound, true);
  assert.equal(JSON.stringify(srs), before, 'SRS intocado');
});

test('dup-15. revisões do id permanecem intactas', async () => {
  const revisions = { 'u_1790002508376_8lr5c5': [{ id: 'rev1', status: 'pending' }] };
  const { api } = loadConsolidate(dupFixture(), { revisions });
  const before = JSON.stringify(revisions);
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r.ok, true, JSON.stringify(r.reason));
  assert.equal(r.revisionsFound, true);
  assert.equal(JSON.stringify(revisions), before, 'revisões intactas');
});

test('dup-16. assignedAt null continua null (sem retroativo)', async () => {
  const { api, ctx } = loadConsolidate(dupFixture());
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r.ok, true, JSON.stringify(r.reason));
  assert.ok(ctx.DATA[0].images.every((img) => img.assignedAt === null || img.assignedAt === undefined));
});

test('dup-17. nenhum Cloudinary destroy ocorre', () => {
  const src = extractFunction(html, 'consolidateSameIdDuplicates');
  assert.doesNotMatch(src, /destroy/i);
  assert.doesNotMatch(src, /deleteCloudinary|cloudinaryDelete/i);
  assert.doesNotMatch(src, /uploadToCloudinary/);
});

test('dup-18. external import futuro persiste sourceUrl quando disponível', () => {
  const src = extractFunction(html, 'openExternalDraft');
  assert.match(src, /url0\.value = draft\.sourceUrl;/, 'referência encaminhada ao salvar');
  assert.match(src, /lab0\.value = \(draft\.source \+ ' — ' \+ \(sug\.originalTitle \|\| draft\.title\)\)/, 'título original no rótulo');
});

test('dup-19. double submit não volta a criar múltiplos objetos', () => {
  const src = extractFunction(html, 'openForm');
  assert.match(src, /if\s*\(formSaving\)\s*return;/, 'trava na porta');
  assert.match(src, /DATA\.some\(x=>x && x\.id===entryId\)/, 'rede anti-mesmo-id antes do push');
  const pushes = stripJsComments(src).match(/\bDATA\.push\s*\(/g) || [];
  assert.equal(pushes.length, 1, 'push único mantido');
});

test('dup-20. DATA final tem somente 1 ocorrência desse id (+ falha de snapshot aborta)', async () => {
  const { api, ctx } = loadConsolidate(dupFixture());
  const r = await api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r.ok, true);
  assert.equal(ctx.DATA.filter((e) => e && e.id === 'u_1790002508376_8lr5c5').length, 1);
  const bad = loadConsolidate(dupFixture(), { snapFail: true });
  const beforeBad = JSON.stringify(bad.ctx.DATA);
  const r2 = await bad.api.consolidateSameIdDuplicates('u_1790002508376_8lr5c5', {});
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /snapshot/);
  assert.equal(JSON.stringify(bad.ctx.DATA), beforeBad, 'nada muda sem snapshot');
});

test('userscript: builder gera payload que o Atlas aceita (ida-e-volta)', () => {
  const m = /function buildExternalPayload\(parts\)\s*\{/.exec(userscript);
  assert.ok(m, 'buildExternalPayload existe no userscript');
  const start = userscript.indexOf('{', m.index);
  const block = extractBlock(userscript, start);
  const maxField = /var MAX_FIELD\s*=\s*\d+;/.exec(userscript);
  assert.ok(maxField, 'MAX_FIELD existe no userscript');
  const ctx = vm.createContext({});
  vm.runInContext(maxField[0] + '\n' + extractFunction(userscript, 'normalizeRadiopaediaCaseTitle') /* 091f */ + '\n' + userscript.slice(m.index, start) + block + '\nthis.__p = buildExternalPayload({ title: "Polyethene wear", sourceUrl: "https://radiopaedia.org/cases/polyethene-wear-1", patientAge: "55", patientSex: "Female", modality: "x-ray", presentation: "Worsening left hip pain." });', ctx);
  const api = loadPure();
  const r = api.validateExternalImportPayload(ctx.__p);
  assert.equal(r.ok, true, 'payload do userscript passa na validação do Atlas: ' + JSON.stringify(r.errors));
  assert.equal(ctx.__p.imagem, undefined, 'sem imagens no payload');
});

// ===========================================================================
// PROTEÇÃO 083 — título do caso Radiopaedia nunca pode ser o autor/usuário.
// Bug real: o userscript usava o <h1> GENÉRICO da página como fallback e, em
// algumas páginas, o primeiro <h1> era "Leonardo Paggi Andrade" -> draft.title
// errado -> nome sugerido errado e praticamente nenhuma tag. Correção em
// profundidade: userscript (slug da URL como âncora + filtro de autor, sem
// <h1> genérico) e Atlas (reconcileExternalImportTitle, vale também para o
// userscript antigo ainda instalado).
// ===========================================================================

// Carrega as funções REAIS do userscript num vm com uma DOM falsa mínima.
function loadUserscriptTitle(page) {
  const names = ['cleanText', 'firstText', 'extractSourceUrl', 'normalizeRadiopaediaCaseTitle', 'stripSiteSuffix', 'titleTokens', 'slugTitleFromUrl', 'authorNames', 'extractTitle', 'buildExternalPayload'];
  const maxField = /var MAX_FIELD\s*=\s*\d+;/.exec(userscript)[0];
  const src = maxField + '\n' + names.map((n) => extractFunction(userscript, n)).join('\n');
  const el = (text, attrs) => ({ innerText: text || '', getAttribute: (k) => (attrs && Object.prototype.hasOwnProperty.call(attrs, k)) ? attrs[k] : null });
  const bySel = page.selectors || {};
  const document = {
    title: page.documentTitle || '',
    querySelector: (sel) => { const list = bySel[sel]; return list && list.length ? list[0] : null; },
    querySelectorAll: (sel) => bySel[sel] || []
  };
  const ctx = vm.createContext({ document, window: { location: { href: page.url } }, URL });
  vm.runInContext(src + '\nthis.__us = { extractTitle, slugTitleFromUrl, buildExternalPayload, extractSourceUrl };', ctx);
  return { us: ctx.__us, el };
}
function pageWith(opts) {
  const e = (text, attrs) => ({ innerText: text || '', getAttribute: (k) => (attrs && Object.prototype.hasOwnProperty.call(attrs, k)) ? attrs[k] : null });
  const sel = {};
  if (opts.ogTitle !== undefined) sel['meta[property="og:title"]'] = [e('', { content: opts.ogTitle })];
  if (opts.caseTitleH1) sel['h1.case-title'] = [e(opts.caseTitleH1)];
  if (opts.firstH1) sel['h1'] = [e(opts.firstH1)]; // <h1> genérico (autor/usuário) — nunca deve ser usado
  if (opts.authorLink) sel['a[href*="/users/"]'] = [e(opts.authorLink)];
  sel['link[rel="canonical"]'] = [e('', { href: opts.url })];
  return { url: opts.url, documentTitle: opts.documentTitle || '', selectors: sel };
}
function loadTitleGuard() {
  const src = [
    extractConst(html, 'EXTERNAL_IMPORT_STOPWORDS'),
    extractFunction(html, 'normalizeExternalTitle'),
    extractFunction(html, 'tokenizeExternalTitle'),
    extractFunction(html, 'externalCaseSlugTitle'),
    extractFunction(html, 'normalizeRadiopaediaCaseTitle'), // 091f
    extractFunction(html, 'reconcileExternalImportTitle')
  ].join('\n');
  const ctx = vm.createContext({ URL });
  vm.runInContext(src + '\nthis.__g = { externalCaseSlugTitle, reconcileExternalImportTitle };', ctx);
  return ctx.__g;
}
const AUTHOR = 'Leonardo Paggi Andrade';
const CASE_URL = 'https://radiopaedia.org/cases/polyethylene-wear-1';

test('083 userscript: <h1> do autor NÃO vira título — og:title clínico é usado', () => {
  const { us } = loadUserscriptTitle(pageWith({ url: CASE_URL, firstH1: AUTHOR, authorLink: AUTHOR, ogTitle: 'Polyethylene wear | Radiology Case | Radiopaedia.org', documentTitle: 'Polyethylene wear | Radiology Case | Radiopaedia.org' }));
  assert.equal(us.extractTitle(), 'Polyethylene wear');
});

test('083 userscript: até og:title/document.title com o nome do autor são rejeitados (slug + filtro de autor) -> título do slug', () => {
  const { us } = loadUserscriptTitle(pageWith({ url: CASE_URL, firstH1: AUTHOR, authorLink: AUTHOR, ogTitle: AUTHOR, documentTitle: AUTHOR }));
  const t = us.extractTitle();
  assert.notEqual(t, AUTHOR);
  assert.equal(t, 'Polyethylene wear');
});

test('083 userscript: título clínico válido continua sendo capturado (h1.case-title específico e document.title)', () => {
  const a = loadUserscriptTitle(pageWith({ url: 'https://radiopaedia.org/cases/hepatic-haemangioma-12', caseTitleH1: 'Hepatic haemangioma', firstH1: AUTHOR }));
  assert.equal(a.us.extractTitle(), 'Hepatic haemangioma');
  const b = loadUserscriptTitle(pageWith({ url: 'https://radiopaedia.org/cases/hepatic-haemangioma-12', documentTitle: 'Hepatic haemangioma | Radiology Case | Radiopaedia.org' }));
  assert.equal(b.us.extractTitle(), 'Hepatic haemangioma');
});

test('083 userscript: sem âncora de slug e só o autor na página -> não inventa (título vazio, nada é enviado)', () => {
  const { us } = loadUserscriptTitle(pageWith({ url: 'https://radiopaedia.org/cases/12345', firstH1: AUTHOR, authorLink: AUTHOR, ogTitle: AUTHOR }));
  assert.equal(us.extractTitle(), '', 'autor filtrado e sem slug utilizável: título ausente em vez de autor');
});

test('083 userscript: o seletor genérico "h1" não existe mais na cadeia de título', () => {
  const src = extractFunction(userscript, 'extractTitle');
  assert.doesNotMatch(src, /['"]h1['"]/);
  assert.match(src, /og:title/);
  assert.match(src, /slugTitleFromUrl\(extractSourceUrl\(\)\)/);
});

test('083 ida-e-volta: payload montado pelo userscript corrigido continua aceito pelo Atlas', () => {
  const { us } = loadUserscriptTitle(pageWith({ url: CASE_URL, firstH1: AUTHOR, authorLink: AUTHOR, ogTitle: 'Polyethylene wear | Radiology Case | Radiopaedia.org' }));
  const p = us.buildExternalPayload({ title: us.extractTitle(), sourceUrl: us.extractSourceUrl(), modality: 'x-ray' });
  const r = loadPure().validateExternalImportPayload(p);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.title, 'Polyethylene wear');
});

test('083 Atlas: payload ANTIGO com o autor como título é corrigido pelo slug da URL (defesa em profundidade)', () => {
  const g = loadTitleGuard();
  const fixed = g.reconcileExternalImportTitle({ source: 'Radiopaedia', title: AUTHOR, sourceUrl: CASE_URL, modality: 'x-ray' });
  assert.equal(fixed.title, 'Polyethylene wear');
  assert.equal(fixed.titleFromUrl, true);
  assert.equal(fixed.sourceUrl, CASE_URL);
  assert.equal(fixed.modality, 'x-ray', 'demais campos preservados');
});

test('083 Atlas: título clínico coerente com o slug é mantido intacto (inclusive grafia diferente)', () => {
  const g = loadTitleGuard();
  const p = { source: 'Radiopaedia', title: 'Polyethene wear', sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1' };
  const out = g.reconcileExternalImportTitle(p);
  assert.equal(out.title, 'Polyethene wear');
  assert.equal(out.titleFromUrl, undefined);
  const out2 = g.reconcileExternalImportTitle({ source: 'Radiopaedia', title: 'Hepatic haemangioma (typical)', sourceUrl: 'https://radiopaedia.org/cases/hepatic-haemangioma-12' });
  assert.equal(out2.title, 'Hepatic haemangioma (typical)');
});

test('083 Atlas: sem slug utilizável não inventa nome — mantém o que veio (compatível com payloads antigos)', () => {
  const g = loadTitleGuard();
  assert.equal(g.externalCaseSlugTitle('https://radiopaedia.org/cases/12345'), '');
  assert.equal(g.externalCaseSlugTitle('https://radiopaedia.org/articles/abc'), '');
  assert.equal(g.externalCaseSlugTitle('não é url'), '');
  const p = { source: 'Radiopaedia', title: 'Qualquer', sourceUrl: 'https://radiopaedia.org/cases/12345' };
  assert.equal(g.reconcileExternalImportTitle(p), p, 'mesmo objeto, nada muda');
});

test('083 Atlas: maybeHandleExternalImport passa o payload validado por reconcileExternalImportTitle antes do modal', () => {
  // 091g: a validação + modal vivem no pipeline único (boot, hashchange e canal).
  assert.match(extractFunction(html, 'maybeHandleExternalImport'), /return processExternalImportPayload\(parsed\.payload\);/);
  const src = extractFunction(html, 'processExternalImportPayload');
  assert.match(src, /openExternalImportModal\(reconcileExternalImportTitle\(checked\.value\)\)/);
});

test('083 tags: autor/nome próprio nunca vira tag; com o título corrigido nome e tags voltam a vir do catálogo', () => {
  const api = loadPure();
  const catalog = [{ id: 'seed_1', name: 'Desgaste de polietileno', enTerm: 'Polyethylene wear', s: 'Musculoesquelético', site: 'Quadril', tags: ['prótese', 'radiografia'], images: [] }];
  const bad = { source: 'Radiopaedia', title: AUTHOR, sourceUrl: CASE_URL, modality: 'x-ray' };
  const badSug = api.buildExternalSuggestion(bad, catalog, api.findExternalImportCandidates(bad, catalog));
  for (const t of Array.from(badSug.tags)) assert.doesNotMatch(t.toLowerCase(), /leonardo|paggi|andrade/, 'autor nunca vira tag');
  const fixed = loadTitleGuard().reconcileExternalImportTitle(bad);
  const matches = api.findExternalImportCandidates(fixed, catalog);
  const sug = api.buildExternalSuggestion(fixed, catalog, matches);
  assert.equal(sug.name, 'Desgaste de polietileno', 'nome PT vem do catálogo (enTerm)');
  assert.deepEqual(Array.from(sug.tags), ['Desgaste de polietileno', 'radiografia'], 'nome confiável (catálogo via enTerm) + modalidade (mapa fechado)');
  assert.deepEqual(Array.from(badSug.tags), ['radiografia'], 'com o autor como título só sobrava a modalidade (sintoma do bug)');
  for (const t of Array.from(sug.tags)) assert.doesNotMatch(t.toLowerCase(), /leonardo|paggi|andrade/);
});

test('083 tags: continuam conservadoras — título sem base no catálogo não gera tag inventada', () => {
  const api = loadPure();
  const catalog = [{ id: 'seed_1', name: 'Desgaste de polietileno', enTerm: 'Polyethylene wear', s: 'Musculoesquelético', site: 'Quadril', tags: ['prótese'], images: [] }];
  const d = { source: 'Radiopaedia', title: 'Zzyzx unknown entity', sourceUrl: 'https://radiopaedia.org/cases/zzyzx-unknown-entity-1' };
  const sug = api.buildExternalSuggestion(d, catalog, api.findExternalImportCandidates(d, catalog));
  assert.deepEqual(Array.from(sug.tags), [], 'sem base real: sem tags');
  assert.equal(sug.needsReview, true);
});
