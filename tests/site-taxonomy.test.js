'use strict';

// Sítio/órgão — dropdown + proteção contra subseção acidental (22/09/2026).
// Não existe taxonomia canônica separada: a árvore seção→sítio (structure())
// é sempre derivada, ao vivo, de DATA. "Sítio válido" = "sítio que já
// aparece em algum registro daquela seção agora" (knownSitesForSection
// reaproveita a mesma lógica). Mesmo padrão dos demais testes: extrai as
// funções REAIS do index.html e roda num `vm` isolado com stubs locais.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) { return source.slice(0, index).split('\n').length; }

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
  return {
    source: source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace),
    line: lineNumberAt(source, declaration.index)
  };
}

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/g, '$1');
}

// Compara por JSON, não por deepEqual: valores devolvidos pelo `vm` isolado
// pertencem a outro "realm" (Array/Object próprios) — estruturalmente
// idênticos a um literal do arquivo de teste, mas deepStrictEqual rejeita
// por reference-equality de protótipo entre realms diferentes.
function assertJsonEqual(actual, expected, msg) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}

function loadPure() {
  const src = [
    extractFunction(html, 'escAttr').source,
    extractFunction(html, 'esc').source,
    extractFunction(html, 'normalizeExternalTitle').source,
    extractFunction(html, 'normalizeSiteName').source,
    extractFunction(html, 'knownSitesForSection').source,
    extractFunction(html, 'validateSiteAgainstSection').source,
    extractFunction(html, 'filterSiteOptions').source,
    extractFunction(html, 'siteDropdownOptionsHtml').source,
    extractFunction(html, 'auditSiteUsage').source,
    extractFunction(html, 'structure').source
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { normalizeSiteName, knownSitesForSection, validateSiteAgainstSection, filterSiteOptions, siteDropdownOptionsHtml, auditSiteUsage, structure };', ctx);
  return ctx.__api;
}

// structure() lê a global DATA; para usá-la isolada, injeta DATA no contexto.
function loadStructureWith(data) {
  const src = extractFunction(html, 'structure').source;
  const ctx = vm.createContext({ DATA: data, console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__structure = structure;', ctx);
  return ctx.__structure;
}

function loadRuntime(dataFixture, opts) {
  const o = opts || {};
  const src = [
    extractFunction(html, 'normalizeSiteName').source,
    extractFunction(html, 'knownSitesForSection').source,
    extractFunction(html, 'validateSiteAgainstSection').source,
    extractFunction(html, 'migrateLesionSite').source
  ].join('\n');
  let saveCalls = 0;
  let snapCalls = 0;
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(dataFixture)),
    createSafetySnapshot: (reason) => { snapCalls += 1; if (o.snapFail) return null; return { id: 'snap-site-1' }; },
    saveData: async () => { saveCalls += 1; if (o.saveFail) throw new Error('save falhou (mock)'); },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__rt = { migrateLesionSite };', ctx);
  return { api: ctx.__rt, ctx, get saveCalls() { return saveCalls; }, get snapCalls() { return snapCalls; } };
}

function lesion(over) {
  return Object.assign({
    id: 'seed_1',
    name: 'Diverticulite de Meckel',
    s: 'Abdômen Superior',
    site: 'Fossa ilíaca direita',
    tags: ['divertículo'],
    notes: 'texto original',
    links: [{ label: 'Referência', url: 'https://radiopaedia.org/cases/x' }],
    images: [{ publicId: 'atlas-radiologico/x', data: 'https://x/x.jpg' }],
    clinicalCases: [{ source: 'Radiopaedia', title: 'Caso A', sourceUrl: 'https://radiopaedia.org/cases/a' }],
    classification: null,
    altPlacements: [{ s: 'Outra seção', site: 'Outro sítio' }]
  }, over || {});
}

const CATALOG = [
  { id: 'seed_1', s: 'Abdômen Superior', site: 'Apêndice', name: 'A' },
  { id: 'seed_2', s: 'Abdômen Superior', site: 'Baço', name: 'B' },
  { id: 'seed_3', s: 'Abdômen Superior', site: 'Estômago', name: 'C' },
  { id: 'seed_4', s: 'Pelve Feminina', site: 'Ovário', name: 'D' }
];

// ===========================================================================
// 1/3. SETA ABRE TODAS AS OPÇÕES (campo vazio incluso)
// ===========================================================================

test('SETA: knownSitesForSection devolve TODOS os sítios já cadastrados na seção, ordenados', () => {
  const api = loadPure();
  const sites = api.knownSitesForSection('Abdômen Superior', CATALOG);
  assertJsonEqual(sites, ['Apêndice', 'Baço', 'Estômago']);
});

test('SETA: seção sem nenhum sítio cadastrado devolve lista vazia (nunca inventa)', () => {
  const api = loadPure();
  assertJsonEqual(api.knownSitesForSection('Seção Inexistente', CATALOG), []);
});

test('SETA: também conta sítios vindos de altPlacements (mesma fonte que structure()/sidebar)', () => {
  const api = loadPure();
  const catalog = [{ id: 'x', s: 'Neurorradiologia', site: 'Encéfalo', name: 'X', altPlacements: [{ s: 'Abdômen Superior', site: 'Retroperitônio' }] }];
  assertJsonEqual(api.knownSitesForSection('Abdômen Superior', catalog), ['Retroperitônio']);
});

test('CAMPO VAZIO + SETA: filterSiteOptions sem query devolve a lista inteira (sem filtrar à toa)', () => {
  const api = loadPure();
  const sites = api.knownSitesForSection('Abdômen Superior', CATALOG);
  assert.deepEqual(api.filterSiteOptions(sites, ''), sites);
  assert.deepEqual(api.filterSiteOptions(sites, '   '), sites);
});

// ===========================================================================
// 2. DIGITAR FILTRA A LISTA
// ===========================================================================

test('FILTRAR: digitar parte do nome (acento/caixa insensível) filtra a lista', () => {
  const api = loadPure();
  const sites = api.knownSitesForSection('Abdômen Superior', CATALOG);
  assertJsonEqual(api.filterSiteOptions(sites, 'apen'), ['Apêndice']);
  assertJsonEqual(api.filterSiteOptions(sites, 'BAÇO'), ['Baço']);
  assertJsonEqual(api.filterSiteOptions(sites, 'zzz'), []);
});

test('DROPDOWN HTML: opções escapadas e com data-site (clique seleciona o valor exato)', () => {
  const api = loadPure();
  const out = api.siteDropdownOptionsHtml(['Apêndice', '"><script>alert(1)</script>']);
  assert.match(out, /data-site="Apêndice"/);
  assert.doesNotMatch(out, /<script/i);
  assert.match(out, /&lt;script/i);
});

// ===========================================================================
// 4/6. VALIDAÇÃO: texto inexistente não passa; seleção válida passa
// ===========================================================================

test('VALIDACAO: sítio já cadastrado na seção é aceito e devolve a grafia CANÔNICA exata', () => {
  const api = loadPure();
  const v = api.validateSiteAgainstSection('Abdômen Superior', '  apêndice  ', CATALOG, false);
  assert.equal(v.ok, true);
  assert.equal(v.isNew, false);
  assert.equal(v.value, 'Apêndice', 'grafia canônica, não o texto digitado');
});

test('VALIDACAO: sítio inexistente na seção é RECUSADO sem o checkbox de "sítio novo"', () => {
  const api = loadPure();
  const v = api.validateSiteAgainstSection('Abdômen Superior', 'Fossa ilíaca direita', CATALOG, false);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'unknown_site');
});

test('VALIDACAO: com allowNew=true (checkbox marcado), um sítio realmente novo é aceito', () => {
  const api = loadPure();
  const v = api.validateSiteAgainstSection('Abdômen Superior', 'Mesocólon', CATALOG, true);
  assert.equal(v.ok, true);
  assert.equal(v.isNew, true);
  assert.equal(v.value, 'Mesocólon');
});

test('VALIDACAO: sítio vazio nunca é aceito, mesmo com allowNew', () => {
  const api = loadPure();
  assert.equal(api.validateSiteAgainstSection('Abdômen Superior', '  ', CATALOG, true).ok, false);
});

test('SALVAR (estatico): handler do formulário bloqueia sítio desconhecido com a mensagem pedida', () => {
  const src = stripJsComments(extractFunction(html, 'openForm').source);
  assert.match(src, /validateSiteAgainstSection\(sec, site, DATA, allowNewSite\)/);
  assert.match(src, /toast\('Selecione um sítio\/órgão existente na lista\.'\)/);
  assert.match(src, /site = siteCheck\.value;/, 'grava a grafia canônica, não o texto bruto');
});

// ===========================================================================
// 7. AUDITORIA (read-only) encontra lesões em "Fossa ilíaca direita"
// ===========================================================================

test('AUDITORIA: auditSiteUsage encontra as lesões com s+site exatos e não altera nada', () => {
  const api = loadPure();
  const catalog = [lesion(), { id: 'seed_9', s: 'Abdômen Superior', site: 'Apêndice', name: 'Outra' }];
  const before = JSON.stringify(catalog);
  const r = api.auditSiteUsage('Abdômen Superior', 'Fossa ilíaca direita', catalog);
  assert.equal(r.lesions.length, 1);
  assert.equal(r.lesions[0].id, 'seed_1');
  assert.equal(r.lesions[0].name, 'Diverticulite de Meckel');
  assert.ok(r.otherSitesInSection.includes('Apêndice'));
  assert.ok(!r.otherSitesInSection.includes('Fossa ilíaca direita'), 'o próprio sítio auditado não aparece como "outro destino"');
  assert.equal(JSON.stringify(catalog), before, '100% read-only');
});

test('AUDITORIA: também relata ocorrências em altPlacements separadamente', () => {
  const api = loadPure();
  const catalog = [{ id: 'seed_5', s: 'Neurorradiologia', site: 'Encéfalo', name: 'Y', altPlacements: [{ s: 'Abdômen Superior', site: 'Fossa ilíaca direita' }] }];
  const r = api.auditSiteUsage('Abdômen Superior', 'Fossa ilíaca direita', catalog);
  assert.equal(r.lesions.length, 0);
  assert.equal(r.altPlacementHits.length, 1);
  assert.equal(r.altPlacementHits[0].id, 'seed_5');
});

// ===========================================================================
// 8/9/13. MIGRAÇÃO: não apaga a lesão; muda só site + tag; preserva o resto
// ===========================================================================

test('MIGRACAO: nao apaga a lesao (mesmo id, mesma quantidade de registros)', async () => {
  const rt = loadRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }]);
  const before = rt.ctx.DATA.length;
  const r = await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  assert.equal(r.ok, true);
  assert.equal(rt.ctx.DATA.length, before);
  assert.ok(rt.ctx.DATA.some(e => e.id === 'seed_1'));
});

test('MIGRACAO: altera SOMENTE site (grafia canônica) e adiciona a tag do sítio antigo', async () => {
  const rt = loadRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }]);
  const r = await rt.api.migrateLesionSite('seed_1', '  apêndice  ', {});
  assert.equal(r.ok, true);
  assert.equal(r.fromSite, 'Fossa ilíaca direita');
  assert.equal(r.toSite, 'Apêndice');
  const e = rt.ctx.DATA.find(x => x.id === 'seed_1');
  assert.equal(e.site, 'Apêndice');
  assert.ok(e.tags.includes('Fossa ilíaca direita'), 'sítio antigo preservado como tag');
});

test('MIGRACAO: preserva imagens/links/clinicalCases/classification/altPlacements/name/notes/tags-restantes', async () => {
  const rt = loadRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }]);
  const before = JSON.parse(JSON.stringify(rt.ctx.DATA.find(x => x.id === 'seed_1')));
  await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  const after = rt.ctx.DATA.find(x => x.id === 'seed_1');
  assertJsonEqual(after.images, before.images);
  assertJsonEqual(after.links, before.links);
  assertJsonEqual(after.clinicalCases, before.clinicalCases);
  assertJsonEqual(after.altPlacements, before.altPlacements);
  assert.equal(after.classification, before.classification);
  assert.equal(after.name, before.name);
  assert.equal(after.notes, before.notes);
  assert.ok(after.tags.includes('divertículo'), 'tag original preservada');
});

test('MIGRACAO: nao mexe em SRS/ownership (nem sao referenciados pela funcao)', () => {
  const src = stripJsComments(extractFunction(html, 'migrateLesionSite').source);
  assert.doesNotMatch(src, /\bSRS\b/);
  assert.doesNotMatch(src, /canChangeImageOwnership|assertManualImageOwnershipChange|registerImageOwnershipConflict/);
  assert.doesNotMatch(src, /\bimages\s*[:=]/);
});

test('MIGRACAO: destino invalido (nao cadastrado, sem allowNewSite) e recusado sem tocar a lesao', async () => {
  const rt = loadRuntime([lesion()]);
  const before = JSON.stringify(rt.ctx.DATA);
  const r = await rt.api.migrateLesionSite('seed_1', 'Sítio Que Nunca Existiu', {});
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(rt.ctx.DATA), before);
  assert.equal(rt.saveCalls, 0);
});

test('MIGRACAO: destino igual ao atual nao faz nada (evita chamada vazia)', async () => {
  const rt = loadRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Fossa ilíaca direita', name: 'Z' }]);
  const r = await rt.api.migrateLesionSite('seed_1', 'Fossa ilíaca direita', {});
  assert.equal(r.ok, false);
  assert.equal(rt.saveCalls, 0);
});

test('MIGRACAO: snapshot obrigatorio ANTES de qualquer mutação; falha de snapshot aborta', async () => {
  const rt = loadRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }], { snapFail: true });
  const before = JSON.stringify(rt.ctx.DATA);
  const r = await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  assert.equal(r.ok, false);
  assert.match(r.reason, /snapshot/);
  assert.equal(JSON.stringify(rt.ctx.DATA), before);
  assert.equal(rt.saveCalls, 0);
});

test('MIGRACAO: persiste via saveData() (mesmo caminho seguro de sempre)', async () => {
  const rt = loadRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }]);
  await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  assert.equal(rt.saveCalls, 1);
  assert.equal(rt.snapCalls, 1);
});

// ===========================================================================
// 10/12. SUBSEÇÃO SOME DA TAXONOMIA APÓS MIGRAÇÃO — sem "remoção" separada
// (a árvore é sempre derivada; não há id/posição pra remover) — e não volta
// depois de um "reload" simulado (structure() nunca guarda estado próprio).
// ===========================================================================

test('TAXONOMIA: apos migrar a ULTIMA lesao, o sitio some sozinho de structure() (sem passo de remocao)', () => {
  const before = [lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }];
  const structureFn1 = loadStructureWith(before);
  const mapBefore = structureFn1();
  assert.ok('Fossa ilíaca direita' in mapBefore['Abdômen Superior']);

  // simula a migração (mesma transformação que migrateLesionSite faz)
  const after = JSON.parse(JSON.stringify(before));
  after[0].site = 'Apêndice';
  const structureFn2 = loadStructureWith(after);
  const mapAfter = structureFn2();
  assert.ok(!('Fossa ilíaca direita' in mapAfter['Abdômen Superior']), 'sítio sem nenhuma lesão desaparece sozinho da árvore');
  assert.equal(mapAfter['Abdômen Superior']['Apêndice'], 2, 'as duas lesões agora contam no sítio de destino');
});

test('TAXONOMIA (reload): chamar structure() de novo com o MESMO DATA nunca reintroduz um sítio migrado (sem cache/estado)', () => {
  const after = [{ ...lesion(), site: 'Apêndice' }, { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }];
  const structureFn = loadStructureWith(after);
  const first = structureFn();
  const second = structureFn(); // "reload" simulado: recalcula do zero
  assert.deepEqual(first, second);
  assert.ok(!('Fossa ilíaca direita' in second['Abdômen Superior']));
});

// ===========================================================================
// 14. REGRESSÃO NO EDITOR
// ===========================================================================

test('REGRESSAO: o dropdown do sitio nao interfere no fluxo normal de salvar (ids/handlers existentes preservados)', () => {
  const src = stripJsComments(extractFunction(html, 'openForm').source);
  assert.match(src, /document\.getElementById\('f-save'\)\.onclick/);
  assert.match(src, /existing\.site\s*=\s*site;/);
  assert.match(src, /const newEntry = \{[^}]*\bsite\b[^}]*\};/);
});

test('REGRESSAO: a seção (f-section) continua sem essa restrição — só o sítio ganhou a proteção (escopo pedido)', () => {
  const src = stripJsComments(extractFunction(html, 'openForm').source);
  assert.doesNotMatch(src, /validateSiteAgainstSection\(.*sec.*\).*section/i);
  // f-section não tem toggle/dropdown novo — só o datalist existente.
  assert.doesNotMatch(src, /f-section-toggle/);
});
