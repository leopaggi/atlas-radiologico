'use strict';

// Casos clínicos exemplo — vincular caso externo (Radiopaedia) a uma lesão
// JÁ EXISTENTE do Atlas, evolução do importador MVP (external-import.test.js
// cobre o importador original; este arquivo cobre só a extensão de vínculo).
// Mesmo padrão dos demais testes do projeto: extrai as funções REAIS do
// index.html e roda num `vm` isolado com stubs locais. Sem rede/IndexedDB/
// Firebase/Cloudinary reais.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
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

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/g, '$1');
}

// Funções puras em contexto vm (sem DATA/saveData — usadas nos testes que
// não persistem, ex: busca, união, HTML).
function loadPure() {
  const src = [
    extractFunction(html, 'escAttr'),
    extractFunction(html, 'esc'),
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
    extractFunction(html, 'buildClinicalCaseFromDraft'),
    extractFunction(html, 'lesionHasClinicalCaseUrl'),
    extractFunction(html, 'findClinicalCaseElsewhere'),
    extractFunction(html, 'addClinicalCaseToLesion'),
    extractFunction(html, 'filterReferenceLinksForDisplay'),
    extractFunction(html, 'removeClinicalCaseFromLesion'),
    extractFunction(html, 'clinicalCaseIdentityKey'),
    extractFunction(html, 'unionClinicalCases'),
    extractFunction(html, 'findExternalImportCandidatesForLink'),
    extractFunction(html, 'searchExistingLesionsForLink'),
    extractFunction(html, 'externalLinkCandidateRowHtml'),
    extractFunction(html, 'externalLinkCandidatesHtml'),
    extractFunction(html, 'externalManualResultsHtml'),
    extractFunction(html, 'externalModeTabsHtml'),
    extractFunction(html, 'externalLinkConfirmModalHtml'),
    extractFunction(html, 'clinicalCaseRowHtml'),
    extractFunction(html, 'clinicalCasesSectionHtml'),
    extractFunction(html, 'externalPendingBlockHtml'),
    extractFunction(html, 'externalMatchesHtml'),
    extractFunction(html, 'externalImportModalHtml'),
    extractFunction(html, 'stripUndefinedDeep')
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { normalizeExternalTitle, tokenizeExternalTitle, externalMatchBand, findExternalImportCandidates, sameExternalUrl, buildClinicalCaseFromDraft, lesionHasClinicalCaseUrl, findClinicalCaseElsewhere, addClinicalCaseToLesion, filterReferenceLinksForDisplay, removeClinicalCaseFromLesion, clinicalCaseIdentityKey, unionClinicalCases, findExternalImportCandidatesForLink, searchExistingLesionsForLink, externalLinkCandidatesHtml, externalManualResultsHtml, externalModeTabsHtml, externalLinkConfirmModalHtml, clinicalCasesSectionHtml, externalImportModalHtml, stripUndefinedDeep };', ctx);
  return ctx.__api;
}

// Contexto dinâmico com DATA/saveData mockados — para linkClinicalCaseToLesion
// (única função desta extensão que persiste de verdade).
function loadRuntime(dataFixture, opts) {
  const o = opts || {};
  const src = [
    extractFunction(html, 'normalizeExternalTitle'),
    extractFunction(html, 'sameExternalUrl'),
    extractFunction(html, 'buildClinicalCaseFromDraft'),
    extractFunction(html, 'lesionHasClinicalCaseUrl'),
    extractFunction(html, 'findClinicalCaseElsewhere'),
    extractFunction(html, 'addClinicalCaseToLesion'),
    extractFunction(html, 'linkClinicalCaseToLesion')
  ].join('\n');
  let saveCalls = 0;
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(dataFixture)),
    saveData: async () => { saveCalls += 1; if (o.saveFail) throw new Error('save falhou (mock)'); },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__rt = { linkClinicalCaseToLesion };', ctx);
  return { api: ctx.__rt, ctx, get saveCalls() { return saveCalls; } };
}

const DRAFT = {
  source: 'Radiopaedia',
  title: 'Polyethene wear',
  sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
  patientAge: '55',
  patientSex: 'Female',
  modality: 'x-ray',
  presentation: 'Worsening left hip pain seven years following total hip arthroplasty.'
};

function lesion(over) {
  return Object.assign({
    id: 'seed_1',
    name: 'Desgaste de polietileno',
    s: 'Musculoesquelético',
    site: 'Quadril',
    tags: ['radiografia'],
    notes: 'texto original',
    links: [],
    images: [{ publicId: 'atlas-radiologico/x', data: 'https://x/x.jpg' }],
    classification: null,
    altPlacements: [{ s: 'Outra seção', site: 'Outro sítio' }]
  }, over || {});
}

// ===========================================================================
// 1. BUSCA AUTOMÁTICA (findExternalImportCandidatesForLink)
// ===========================================================================

test('BUSCA AUTOMATICA: encontra pelo titulo original (banda exata)', () => {
  const api = loadPure();
  const catalog = [{ id: 'seed_1', s: 'Musculoesquelético', site: 'Quadril', name: 'Polyethene wear', links: [] }];
  const found = api.findExternalImportCandidatesForLink(DRAFT, null, catalog);
  assert.equal(found.length, 1);
  assert.equal(found[0].band, 'exata');
});

test('BUSCA AUTOMATICA: encontra tambem pelo NOME PT sugerido, quando diferente do titulo original', () => {
  const api = loadPure();
  const catalog = [{ id: 'seed_2', s: 'Musculoesquelético', site: 'Quadril', name: 'Desgaste de polietileno', links: [] }];
  const suggestion = { name: 'Desgaste de polietileno' }; // != DRAFT.title
  const byOriginalOnly = api.findExternalImportCandidatesForLink(DRAFT, null, catalog);
  assert.equal(byOriginalOnly.length, 0, 'sem a sugestão PT, o título original em inglês não bate');
  const withPt = api.findExternalImportCandidatesForLink(DRAFT, suggestion, catalog);
  assert.equal(withPt.length, 1, 'com a sugestão PT, encontra o mesmo conceito em português');
  assert.equal(withPt[0].entry.id, 'seed_2');
});

test('BUSCA AUTOMATICA: URL exata ja registrada em outra lesao aparece como candidato', () => {
  const api = loadPure();
  const catalog = [{ id: 'seed_3', s: 'X', site: 'Y', name: 'Outro nome qualquer', links: [{ url: DRAFT.sourceUrl }] }];
  const found = api.findExternalImportCandidatesForLink(DRAFT, null, catalog);
  assert.ok(found.some(m => m.entry.id === 'seed_3' && m.via === 'url'));
});

test('BUSCA AUTOMATICA: reusa a protecao anti-falso-positivo (zero token em comum = zero candidato)', () => {
  const api = loadPure();
  const draft = { ...DRAFT, title: 'Cisto aracnoide gigante' };
  const catalog = [{ id: 'seed_4', s: 'x', site: 'y', name: 'Desgaste de polietileno', links: [] }];
  const found = api.findExternalImportCandidatesForLink(draft, { name: 'Cisto aracnoide' }, catalog);
  assert.equal(found.length, 0);
});

test('BUSCA AUTOMATICA: teto de 5 candidatos e mesmas bandas (sem %) do importador original', () => {
  const api = loadPure();
  const catalog = Array.from({ length: 8 }, (_, i) => ({ id: 'seed_p' + i, s: 'Musculoesquelético', site: 'Quadril', name: 'Desgaste de polietileno variante ' + i, links: [] }));
  const found = api.findExternalImportCandidatesForLink(DRAFT, { name: 'Desgaste de polietileno' }, catalog);
  assert.ok(found.length <= 5);
  found.forEach(m => assert.ok(['exata', 'alta', 'possível'].includes(m.band)));
});

// ===========================================================================
// 2. BUSCA MANUAL (searchExistingLesionsForLink)
// ===========================================================================

const SEARCH_CATALOG = [
  { id: 'seed_10', name: 'Endometrioma', enTerm: 'endometrioma', tags: ['cisto', 'anexo'] },
  { id: 'seed_11', name: 'Hemangioma hepático', enTerm: 'hepatic hemangioma', tags: ['fígado', 'lesão vascular'] },
  { id: 'seed_12', name: 'Cisto aracnoide', enTerm: 'arachnoid cyst', tags: ['encéfalo'] }
];

test('BUSCA MANUAL: nome parcial/normalizado encontra a lesão (case/acento/espaço insensível)', () => {
  const api = loadPure();
  const found = api.searchExistingLesionsForLink('endometrioma', SEARCH_CATALOG);
  assert.ok(found.some(e => e.id === 'seed_10'));
  const found2 = api.searchExistingLesionsForLink('  ENDOMETRIOMA  ', SEARCH_CATALOG);
  assert.ok(found2.some(e => e.id === 'seed_10'));
});

test('BUSCA MANUAL: sinonimo em ingles (enTerm) tambem encontra, quando disponivel', () => {
  const api = loadPure();
  const found = api.searchExistingLesionsForLink('hepatic hemangioma', SEARCH_CATALOG);
  assert.ok(found.some(e => e.id === 'seed_11'));
});

test('BUSCA MANUAL: tag tambem encontra, quando disponivel', () => {
  const api = loadPure();
  const found = api.searchExistingLesionsForLink('anexo', SEARCH_CATALOG);
  assert.ok(found.some(e => e.id === 'seed_10'));
});

test('BUSCA MANUAL: consulta curta demais (<2 chars uteis) nao retorna o catalogo inteiro a toa', () => {
  const api = loadPure();
  assert.equal(api.searchExistingLesionsForLink('', SEARCH_CATALOG).length, 0);
  assert.equal(api.searchExistingLesionsForLink('a', SEARCH_CATALOG).length, 0);
});

test('BUSCA MANUAL: sem correspondencia devolve lista vazia (nao inventa candidato)', () => {
  const api = loadPure();
  assert.equal(api.searchExistingLesionsForLink('entidade totalmente inexistente xyz', SEARCH_CATALOG).length, 0);
});

// ===========================================================================
// 3. VINCULAR EXISTENTE (addClinicalCaseToLesion / linkClinicalCaseToLesion)
// ===========================================================================

test('VINCULAR: addClinicalCaseToLesion acrescenta SO o caso clinico, sem tocar em links nem no resto (ajuste UX 22/09/2026)', () => {
  const api = loadPure();
  const e = lesion();
  const before = JSON.parse(JSON.stringify(e));
  const r = api.addClinicalCaseToLesion(e, DRAFT);
  assert.equal(r.ok, true);
  assert.equal(r.entry.clinicalCases.length, 1);
  assert.equal(r.entry.clinicalCases[0].sourceUrl, DRAFT.sourceUrl);
  assert.equal(r.entry.clinicalCases[0].title, DRAFT.title);
  assert.equal(r.entry.clinicalCases[0].patientAge, DRAFT.patientAge);
  // NÃO copia mais a sourceUrl para links — o card do caso já tem "Abrir caso".
  assert.deepEqual(r.entry.links, before.links, 'links permanece exatamente como estava');
  // nunca sobrescreve nome/descricao/tags/secao/sitio/imagens/classificacao/altPlacements
  assert.equal(r.entry.name, before.name);
  assert.equal(r.entry.notes, before.notes);
  assert.deepEqual(r.entry.tags, before.tags);
  assert.equal(r.entry.s, before.s);
  assert.equal(r.entry.site, before.site);
  assert.deepEqual(r.entry.images, before.images);
  assert.equal(r.entry.classification, before.classification);
  assert.deepEqual(r.entry.altPlacements, before.altPlacements);
  // a lesao ORIGINAL passada não foi mutada (função pura)
  assert.deepEqual(e, before);
});

test('VINCULAR: um link manual pre-existente com URL DIFERENTE da sourceUrl continua intacto', () => {
  const api = loadPure();
  const e = lesion({ links: [{ label: 'Referência manual', url: 'https://radiopaedia.org/cases/outro-caso' }] });
  const r = api.addClinicalCaseToLesion(e, DRAFT);
  assert.equal(r.entry.links.length, 1);
  assert.equal(r.entry.links[0].url, 'https://radiopaedia.org/cases/outro-caso');
});

test('VINCULAR: campos ausentes no draft nunca sao inventados no caso clinico', () => {
  const api = loadPure();
  const minimalDraft = { source: 'Radiopaedia', title: 'Caso sem paciente', sourceUrl: 'https://radiopaedia.org/cases/x-2' };
  const r = api.addClinicalCaseToLesion(lesion(), minimalDraft);
  const c = r.entry.clinicalCases[0];
  assert.ok(!('patientAge' in c));
  assert.ok(!('patientSex' in c));
  assert.ok(!('modality' in c));
  assert.ok(!('presentation' in c));
});

test('VINCULAR (dinamico): linkClinicalCaseToLesion persiste via saveData() e atualiza DATA de verdade', async () => {
  const rt = loadRuntime([lesion()]);
  const r = await rt.api.linkClinicalCaseToLesion('seed_1', DRAFT, {});
  assert.equal(r.ok, true);
  assert.equal(rt.ctx.DATA[0].clinicalCases.length, 1);
  assert.equal(rt.ctx.DATA[0].clinicalCases[0].sourceUrl, DRAFT.sourceUrl);
  assert.equal(rt.ctx.DATA[0].links.length, 0, 'links não recebe mais cópia da sourceUrl (ajuste UX 22/09/2026)');
  assert.equal(rt.saveCalls, 1, 'saveData chamado exatamente uma vez');
});

test('VINCULAR (dinamico): lesao inexistente nao quebra e nao chama saveData', async () => {
  const rt = loadRuntime([lesion()]);
  const r = await rt.api.linkClinicalCaseToLesion('seed_inexistente', DRAFT, {});
  assert.equal(r.ok, false);
  assert.equal(rt.saveCalls, 0);
});

// ===========================================================================
// 3.1 REFERÊNCIAS — sem duplicar na exibição (ajuste UX 22/09/2026)
// ===========================================================================

test('REFERENCIAS: novo vinculo nao adiciona link duplicado (links fica vazio)', () => {
  const api = loadPure();
  const r = api.addClinicalCaseToLesion(lesion(), DRAFT);
  assert.deepEqual(r.entry.links, []);
});

test('REFERENCIAS: caso clinico continua com "Abrir caso" (a URL nao sumiu, só não é copiada pra links)', () => {
  const api = loadPure();
  const r = api.addClinicalCaseToLesion(lesion(), DRAFT);
  const out = api.clinicalCasesSectionHtml(r.entry);
  assert.match(out, /Abrir caso/);
  assert.match(out, new RegExp('href="' + DRAFT.sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
});

test('REFERENCIAS: link historico com a MESMA URL do clinicalCases é ocultado só na exibição (filterReferenceLinksForDisplay)', () => {
  const api = loadPure();
  const cases = [{ source: 'Radiopaedia', title: 'Caso antigo', sourceUrl: DRAFT.sourceUrl, addedAt: '2026-09-21T00:00:00.000Z' }];
  const links = [{ label: 'Radiopaedia — Caso antigo', url: DRAFT.sourceUrl }];
  const visible = api.filterReferenceLinksForDisplay(links, cases);
  assert.equal(visible.length, 0, 'link redundante oculto na exibição');
});

test('REFERENCIAS: URL diferente (link manual) continua aparecendo normalmente', () => {
  const api = loadPure();
  const cases = [{ source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a' }];
  const links = [
    { label: 'Radiopaedia — Caso A', url: 'https://radiopaedia.org/cases/a' },
    { label: 'Outra referência', url: 'https://radiopaedia.org/cases/outro-diferente' }
  ];
  const visible = api.filterReferenceLinksForDisplay(links, cases);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].url, 'https://radiopaedia.org/cases/outro-diferente');
});

test('REFERENCIAS: sem clinicalCases, todos os links aparecem normalmente (nao filtra à toa)', () => {
  const api = loadPure();
  const links = [{ label: 'X', url: 'https://radiopaedia.org/cases/x' }];
  assert.deepEqual(api.filterReferenceLinksForDisplay(links, []), links);
  assert.deepEqual(api.filterReferenceLinksForDisplay(links, undefined), links);
});

test('REFERENCIAS: filterReferenceLinksForDisplay nunca apaga do array original (só filtra a exibição)', () => {
  const api = loadPure();
  const cases = [{ source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a' }];
  const links = [{ label: 'Radiopaedia — Caso A', url: 'https://radiopaedia.org/cases/a' }];
  const before = JSON.stringify(links);
  api.filterReferenceLinksForDisplay(links, cases);
  assert.equal(JSON.stringify(links), before, 'array de entrada intacto (função pura)');
});

test('REFERENCIAS (openDetail): usa filterReferenceLinksForDisplay ao montar a lista de referências', () => {
  const src = stripJsComments(extractFunction(html, 'openDetail'));
  assert.match(src, /const links = filterReferenceLinksForDisplay\(ensureLinks\(e\), e\.clinicalCases\);/);
});

// ===========================================================================
// 3.2 ABAS DO MODAL — ajuste visual (UX 22/09/2026, sem mudar lógica)
// ===========================================================================

test('ABAS: rotulos curtos e sem as classes de botao de acao (nao parecem CTA)', () => {
  const api = loadPure();
  const out = api.externalModeTabsHtml();
  assert.match(out, /🔗 Vincular existente/);
  assert.match(out, /➕ Nova lesão/);
  assert.doesNotMatch(out, /class="btn/, 'abas não usam .btn/.btn-ghost/.btn-primary (não podem parecer botão de ação)');
  assert.match(out, /role="tab"/g);
});

test('ABAS: estado inicial (Nova lesão selecionada) é coerente com a aba visualmente marcada por padrão', () => {
  const api = loadPure();
  const out = api.externalModeTabsHtml();
  assert.match(out, /id="external-tab-new"[^>]*aria-selected="true"/);
  assert.match(out, /id="external-tab-link"[^>]*aria-selected="false"/);
});

test('ABAS: alternância troca as duas abas em conjunto (paintExternalModeTab em ambas, nunca só uma) — lógica de mostrar/esconder painel intacta', () => {
  const src = stripJsComments(extractFunction(html, 'openExternalImportModal'));
  // A mesma lógica de antes (regra 8): isLink decide newPane/linkPane/createBtn0.hidden.
  assert.match(src, /const isLink = mode === 'link';/);
  assert.match(src, /newPane\.hidden = isLink/);
  assert.match(src, /linkPane\.hidden = !isLink/);
  assert.match(src, /createBtn0\.hidden = isLink/);
  // As DUAS abas são sempre repintadas juntas — nunca fica ambíguo qual está ativa.
  assert.match(src, /paintExternalModeTab\(tabLink, isLink\);/);
  assert.match(src, /paintExternalModeTab\(tabNew, !isLink\);/);
  assert.match(src, /tabLink\.onclick = \(\) => setExternalMode\('link'\);/);
  assert.match(src, /tabNew\.onclick = \(\) => setExternalMode\('new'\);/);
  assert.match(src, /setExternalMode\('new'\);/, 'estado inicial explícito ao abrir o modal');
});

test('ABAS: pintura da aba ativa usa a mesma linguagem visual de "seção ativa" da sidebar (--teal-dim/--teal), nunca a cor do botão de ação (--amber)', () => {
  const src = stripJsComments(extractFunction(html, 'openExternalImportModal'));
  const paintFn = src.slice(src.indexOf('function paintExternalModeTab'), src.indexOf('function setExternalMode'));
  assert.match(paintFn, /var\(--teal-dim\)/);
  assert.match(paintFn, /var\(--teal\)/);
  assert.doesNotMatch(paintFn, /var\(--amber\)/, 'aba ativa nunca usa a cor do botão de ação real');
});

test('ABAS: botão inferior "Criar nova lesão" continua sendo o único que de fato cria (regressão)', () => {
  const src = stripJsComments(extractFunction(html, 'externalImportModalHtml'));
  assert.match(src, /id="external-create-btn">Criar nova lesão<\/button>/);
});

// ===========================================================================
// 4. CRIAR NOVA — regressão do fluxo atual (permanece intacto)
// ===========================================================================

test('CRIAR NOVA (regressao): openExternalDraft continua 100% draft — nenhuma persistencia automatica', () => {
  const src = stripJsComments(extractFunction(html, 'openExternalDraft'));
  assert.doesNotMatch(src, /\bsaveData\s*\(/);
  assert.doesNotMatch(src, /\bpushToFirebaseNow\s*\(/);
  assert.doesNotMatch(src, /\bDATA\.push\s*\(/);
  assert.doesNotMatch(src, /\bDATA\s*=(?!=)/);
});

test('CRIAR NOVA (regressao): a aba "Criar nova lesao" continua sendo o modo padrao ao abrir o modal', () => {
  const api = loadPure();
  const out = api.externalImportModalHtml(DRAFT, [], null, []);
  assert.match(out, /id="external-link-pane"[^>]*hidden/, 'painel de vinculo comeca escondido');
  assert.doesNotMatch(out.match(/id="external-new-pane"[^>]*>/)[0], /hidden/, 'painel de criar nova comeca visivel');
});

// ===========================================================================
// 5. DUPLICIDADE
// ===========================================================================

test('DUPLICIDADE: mesma sourceUrl na MESMA lesao nao duplica', () => {
  const api = loadPure();
  const e = lesion({ clinicalCases: [{ source: 'Radiopaedia', title: 'Polyethene wear', sourceUrl: DRAFT.sourceUrl, addedAt: '2026-01-01T00:00:00.000Z' }] });
  const r = api.addClinicalCaseToLesion(e, DRAFT);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'duplicate_same_lesion');
});

test('DUPLICIDADE: mesma sourceUrl ja vinculada a OUTRA lesao é avisada e bloqueada por padrão', async () => {
  const other = lesion({ id: 'seed_2', name: 'Outra lesão', clinicalCases: [{ source: 'Radiopaedia', title: 'Polyethene wear', sourceUrl: DRAFT.sourceUrl, addedAt: '2026-01-01T00:00:00.000Z' }] });
  const target = lesion({ id: 'seed_1' });
  const { api, ctx } = loadRuntime([target, other]);
  const r = await api.linkClinicalCaseToLesion('seed_1', DRAFT, {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'linked_elsewhere');
  assert.equal(r.otherEntry.id, 'seed_2');
  assert.equal(ctx.DATA[0].clinicalCases, undefined, 'nada foi vinculado silenciosamente');
});

test('DUPLICIDADE: com forceElsewhere=true (decisao explicita), o vinculo adicional acontece e fica registrado nos dois lados', async () => {
  const other = lesion({ id: 'seed_2', name: 'Outra lesão', clinicalCases: [{ source: 'Radiopaedia', title: 'Polyethene wear', sourceUrl: DRAFT.sourceUrl, addedAt: '2026-01-01T00:00:00.000Z' }] });
  const target = lesion({ id: 'seed_1' });
  const { api, ctx } = loadRuntime([target, other]);
  const r = await api.linkClinicalCaseToLesion('seed_1', DRAFT, { forceElsewhere: true });
  assert.equal(r.ok, true);
  assert.equal(ctx.DATA[0].clinicalCases.length, 1);
  assert.equal(ctx.DATA[1].clinicalCases.length, 1, 'a outra lesão mantém o vínculo dela, intacto');
});

// ===========================================================================
// 6/7. PERSISTENCIA / SYNC / BACKUP / RESTORE
// ===========================================================================

test('PERSISTENCIA: clinicalCases sobrevive a JSON round-trip (IndexedDB/backup usam JSON.stringify/parse)', () => {
  const api = loadPure();
  const e = api.addClinicalCaseToLesion(lesion(), DRAFT).entry;
  const roundTripped = JSON.parse(JSON.stringify(e));
  // Comparação por JSON (não por deepEqual): o objeto retornado pelo vm
  // isolado pertence a outro "realm" — estruturalmente idêntico, mas
  // deepStrictEqual rejeita por reference-equality de protótipo entre realms.
  assert.equal(JSON.stringify(roundTripped.clinicalCases), JSON.stringify(e.clinicalCases));
});

test('PERSISTENCIA (Firestore): stripUndefinedDeep preserva clinicalCases (so remove undefined, nao o array)', () => {
  const api = loadPure();
  const e = api.addClinicalCaseToLesion(lesion(), DRAFT).entry;
  const cleaned = api.stripUndefinedDeep(e);
  assert.deepEqual(cleaned.clinicalCases, e.clinicalCases);
});

test('SYNC/BACKUP: unionClinicalCases mescla aditivamente (nunca perde caso de nenhum lado)', () => {
  const api = loadPure();
  const local = [{ source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a', addedAt: '2026-01-01T00:00:00.000Z' }];
  const remote = [{ source: 'Radiopaedia', title: 'Caso B', sourceUrl: 'https://radiopaedia.org/cases/b', addedAt: '2026-01-02T00:00:00.000Z' }];
  const merged = api.unionClinicalCases(local, remote);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(c => c.sourceUrl.endsWith('/a')));
  assert.ok(merged.some(c => c.sourceUrl.endsWith('/b')));
});

test('SYNC/BACKUP: unionClinicalCases dedup por sourceUrl (mesmo caso nos dois lados nao duplica)', () => {
  const api = loadPure();
  const shared = { source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a', addedAt: '2026-01-01T00:00:00.000Z' };
  const merged = api.unionClinicalCases([shared], [{ ...shared, addedAt: '2026-01-03T00:00:00.000Z' }]);
  assert.equal(merged.length, 1, 'mesma URL nao duplica mesmo com addedAt diferente');
});

test('SYNC/BACKUP: unionClinicalCases nunca apaga (base + nada = base; nada + add = add)', () => {
  const api = loadPure();
  const base = [{ source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a' }];
  assert.equal(api.unionClinicalCases(base, []).length, 1);
  assert.equal(api.unionClinicalCases([], base).length, 1);
  assert.equal(api.unionClinicalCases(undefined, undefined).length, 0);
});

// ===========================================================================
// 8. VISUALIZAÇÃO (clinicalCasesSectionHtml)
// ===========================================================================

test('VISUALIZACAO: sem casos vinculados, a secao nao aparece', () => {
  const api = loadPure();
  assert.equal(api.clinicalCasesSectionHtml({ clinicalCases: [] }), '');
  assert.equal(api.clinicalCasesSectionHtml({}), '');
});

test('VISUALIZACAO: com casos, mostra titulo "Casos clinicos exemplo (N)" recolhivel por padrao', () => {
  const api = loadPure();
  const e = { clinicalCases: [
    { source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a', patientAge: '40', patientSex: 'Male', modality: 'CT', presentation: 'dor abdominal' },
    { source: 'Radiopaedia', title: 'Caso B', sourceUrl: 'https://radiopaedia.org/cases/b' }
  ] };
  const out = api.clinicalCasesSectionHtml(e);
  assert.match(out, /Casos clínicos exemplo \(2\)/);
  assert.match(out, /class="clinical-cases-body" hidden/, 'comeca recolhida');
  assert.match(out, /Caso A/);
  assert.match(out, /Caso B/);
  assert.match(out, /40 anos/);
  assert.match(out, /Male/);
  assert.match(out, /CT/);
  assert.match(out, /Abrir caso/);
});

test('VISUALIZACAO: HTML/script no titulo/apresentacao do caso nunca executa (escape total)', () => {
  const api = loadPure();
  const e = { clinicalCases: [{ source: 'Radiopaedia', title: '"><script>alert(1)</script>', sourceUrl: 'https://radiopaedia.org/cases/x', presentation: '<img src=x onerror=alert(2)>' }] };
  const out = api.clinicalCasesSectionHtml(e);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /<img/i);
  assert.match(out, /&lt;script/i);
});

// ===========================================================================
// 9. REMOÇÃO (removeClinicalCaseFromLesion + editor)
// ===========================================================================

test('REMOCAO: removeClinicalCaseFromLesion remove SO o caso correspondente, preserva os outros e a lesao', () => {
  const api = loadPure();
  const e = lesion({ clinicalCases: [
    { source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a' },
    { source: 'Radiopaedia', title: 'Caso B', sourceUrl: 'https://radiopaedia.org/cases/b' }
  ] });
  const r = api.removeClinicalCaseFromLesion(e, 'https://radiopaedia.org/cases/a');
  assert.equal(r.ok, true);
  assert.equal(r.entry.clinicalCases.length, 1);
  assert.equal(r.entry.clinicalCases[0].sourceUrl, 'https://radiopaedia.org/cases/b');
  assert.equal(r.entry.name, e.name);
  assert.equal(r.entry.id, e.id);
});

test('REMOCAO: url inexistente nao remove nada (ok=false)', () => {
  const api = loadPure();
  const e = lesion({ clinicalCases: [{ source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a' }] });
  const r = api.removeClinicalCaseFromLesion(e, 'https://radiopaedia.org/cases/inexistente');
  assert.equal(r.ok, false);
});

test('REMOCAO (editor): openForm so grava clinicalCasesDraft no ramo "existing" (visualizar/remover), nunca ao criar', () => {
  const src = stripJsComments(extractFunction(html, 'openForm'));
  assert.match(src, /if\(clinicalCasesDraft\.length\) existing\.clinicalCases = JSON\.parse\(JSON\.stringify\(clinicalCasesDraft\)\); else delete existing\.clinicalCases;/);
  const newEntryLine = src.match(/const newEntry = \{[^}]*\};/);
  assert.ok(newEntryLine, 'newEntry literal encontrado');
  assert.doesNotMatch(newEntryLine[0], /clinicalCases/, 'lesão nova nunca inventa clinicalCases');
});

test('REMOCAO (editor): remover um caso no editor nao mexe no Cloudinary nem apaga a lesao', () => {
  const src = extractFunction(html, 'openForm');
  const startIdx = src.indexOf('renderClinicalCasesDraft');
  const endIdx = src.indexOf('renderAltPlacements');
  const block = src.slice(startIdx, endIdx);
  assert.doesNotMatch(block, /uploadToCloudinary|cloudinary\.com|destroy/i);
  assert.doesNotMatch(block, /DATA\s*=\s*DATA\.filter/);
});

// ===========================================================================
// 10. REGRESSÃO GERAL DO IMPORTADOR (estático)
// ===========================================================================

test('REGRESSAO: vincular a lesao existente e a unica funcao desta extensao que persiste (saveData); as demais sao puras/somente-leitura', () => {
  for (const name of ['buildClinicalCaseFromDraft', 'addClinicalCaseToLesion', 'removeClinicalCaseFromLesion', 'unionClinicalCases', 'findExternalImportCandidatesForLink', 'searchExistingLesionsForLink', 'clinicalCasesSectionHtml']) {
    const src = stripJsComments(extractFunction(html, name));
    assert.doesNotMatch(src, /\bsaveData\s*\(/, name);
    assert.doesNotMatch(src, /\bpushToFirebaseNow\s*\(/, name);
  }
});

test('REGRESSAO: mergeEntryNonDestructive integra clinicalCases (declarado antes de mais nada quebrar)', () => {
  const src = stripJsComments(extractFunction(html, 'mergeEntryNonDestructive'));
  assert.match(src, /unionClinicalCases\(local\.clinicalCases, remote\.clinicalCases\)/);
});

test('REGRESSAO: openDetail exibe a secao de casos clinicos sem alterar o fluxo de excluir/editar', () => {
  const src = stripJsComments(extractFunction(html, 'openDetail'));
  assert.match(src, /clinicalCasesSectionHtml\(e\)/);
  assert.match(src, /wireClinicalCasesToggle\(ov, e\)/);
});
