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

function extractConst(source, name) {
  const declaration = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  const semi = source.indexOf(';', declaration.index);
  return source.slice(declaration.index, semi + 1);
}

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/g, '$1');
}

// Extrai um trecho por marcadores de texto (não por chave de função) — usado
// só para o bloco REAL de snapshots de segurança (mesmo padrão de
// tests/snapshots-ownership.test.js), para testar migrateLesionSite() com o
// createSafetySnapshot() de verdade, não um mock que esconderia o bug real
// (motivo fora da allowlist SAFETY_SNAPSHOT_RISK_REASONS).
function extractMarkerBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
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

// Mock de createSafetySnapshot/isRiskSnapshotReason — usado nos testes de
// LÓGICA de migração (ordem, campos preservados, etc). Os testes que
// exercitam o mecanismo de snapshot DE VERDADE (allowlist real) ficam na
// seção "INTEGRAÇÃO REAL" mais abaixo — foi lá que o bug real (motivo fora
// da allowlist) apareceu; um mock sempre-sucesso como este não o pegaria.
function loadRuntime(dataFixture, opts) {
  const o = opts || {};
  const src = [
    extractFunction(html, 'normalizeSiteName').source,
    extractFunction(html, 'knownSitesForSection').source,
    extractFunction(html, 'validateSiteAgainstSection').source,
    extractConst(html, 'SITE_MIGRATION_SNAPSHOT_REASON'),
    extractFunction(html, 'migrateLesionSite').source
  ].join('\n');
  let saveCalls = 0;
  let snapCalls = 0;
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(dataFixture)),
    isRiskSnapshotReason: () => true,
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

// ===========================================================================
// INTEGRAÇÃO REAL — migrateLesionSite() + createSafetySnapshot() de verdade
// (bug real corrigido em 22/09/2026: o motivo usado pela migração não
// estava em SAFETY_SNAPSHOT_RISK_REASONS, então createSafetySnapshot()
// sempre devolvia null e a migração sempre abortava — mesmo com o storage
// saudável. Os testes anteriores usavam um MOCK de createSafetySnapshot
// que sempre "funcionava", por isso não pegaram esse bug; estes aqui usam
// o mecanismo REAL, extraído do próprio index.html.)
// ===========================================================================

const SNAPSHOT_REAL_SOURCE = extractMarkerBlock(html, "const SAFETY_SNAPSHOT_PREFIX = 'atlas:safetySnapshot:';", 'function isSeedLikeId(id){');
const MIGRATION_SOURCE = [
  extractFunction(html, 'normalizeSiteName').source,
  extractFunction(html, 'knownSitesForSection').source,
  extractFunction(html, 'validateSiteAgainstSection').source,
  extractConst(html, 'SITE_MIGRATION_SNAPSHOT_REASON'),
  extractFunction(html, 'migrateLesionSite').source
].join('\n');

function makeRealStorage(backing) {
  return {
    async get(key) {
      if (Object.prototype.hasOwnProperty.call(backing, key)) return { value: backing[key] };
      throw new Error('not found: ' + key);
    },
    async set(key, value) { backing[key] = value; },
    async delete(key) { delete backing[key]; },
    async list(prefix) { return { keys: Object.keys(backing).filter(k => !prefix || k.indexOf(prefix) === 0) }; }
  };
}

// Contexto com o createSafetySnapshot() REAL (mesma allowlist do app) +
// migrateLesionSite() REAL, ligados como o app de verdade os usa.
function loadRealMigrationRuntime(dataFixture) {
  const backing = {};
  let saveCalls = 0;
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number,
    DATA: JSON.parse(JSON.stringify(dataFixture)),
    REVIEW: {}, SRS: {}, SESSIONLOG: {}, LESION_REVISIONS: {},
    sectionOrder: [], siteOrder: {},
    storage: makeRealStorage(backing),
    __backing: backing,
    saveData: async () => { saveCalls += 1; }
  };
  vm.createContext(ctx);
  vm.runInContext(SNAPSHOT_REAL_SOURCE + '\n' + MIGRATION_SOURCE + '\nthis.__rt = { migrateLesionSite, isRiskSnapshotReason, SAFETY_SNAPSHOT_RISK_REASONS, SITE_MIGRATION_SNAPSHOT_REASON };', ctx, { filename: 'real-migration.js' });
  return { api: ctx.__rt, ctx, get saveCalls() { return saveCalls; } };
}

test('INTEGRACAO REAL: "antes de migrar sítio de lesão" está na allowlist SAFETY_SNAPSHOT_RISK_REASONS (regressão do bug)', () => {
  const rt = loadRealMigrationRuntime([lesion()]);
  assert.ok(rt.api.SAFETY_SNAPSHOT_RISK_REASONS.includes(rt.api.SITE_MIGRATION_SNAPSHOT_REASON));
  assert.equal(rt.api.isRiskSnapshotReason(rt.api.SITE_MIGRATION_SNAPSHOT_REASON), true);
});

test('INTEGRACAO REAL: createSafetySnapshot() não é async — migrateLesionSite() corretamente NÃO usa await nela', () => {
  const src = stripJsComments(extractFunction(html, 'migrateLesionSite').source);
  assert.doesNotMatch(src, /await\s+createSafetySnapshot/, 'createSafetySnapshot é síncrona; await nela seria um bug (Promise nunca é o que ela devolve)');
  assert.match(src, /snap\s*=\s*createSafetySnapshot\(/);
});

test('INTEGRACAO REAL (snapshot sucesso): migração acontece de ponta a ponta com o mecanismo de verdade', async () => {
  const rt = loadRealMigrationRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }]);
  const r = await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.fromSite, 'Fossa ilíaca direita');
  assert.equal(r.toSite, 'Apêndice');
  assert.ok(r.snapshotId, 'snapshot real foi criado e devolveu um id');
  assert.equal(rt.ctx.DATA.find(e => e.id === 'seed_1').site, 'Apêndice');
  assert.equal(rt.saveCalls, 1);
  // o snapshot de verdade foi gravado no storage (não só um objeto solto em memória)
  assert.ok(Object.keys(rt.ctx.__backing).some(k => k.indexOf('atlas:safetySnapshot:') === 0));
});

test('INTEGRACAO REAL (retorno em caso de erro): destino inválido devolve fromSite/toSite vazios e NÃO cria snapshot', async () => {
  const rt = loadRealMigrationRuntime([lesion()]);
  const r = await rt.api.migrateLesionSite('seed_1', 'Sítio Inexistente', {});
  assert.equal(r.ok, false);
  assert.equal(r.fromSite, '');
  assert.equal(r.toSite, '');
  assert.equal(Object.keys(rt.ctx.__backing).length, 0, 'nada gravado — abortou antes do snapshot');
  assert.equal(rt.saveCalls, 0);
});

test('INTEGRACAO REAL (diagnóstico): destino válido devolve fromSite/toSite preenchidos mesmo que o snapshot venha a falhar depois', async () => {
  // Simula "storage saudável, mas motivo não aprovado" reescrevendo a
  // allowlist DEPOIS de montar o contexto — prova que o diagnóstico novo
  // (snapshotError) não depende de um storage quebrado pra aparecer.
  const rt = loadRealMigrationRuntime([lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }]);
  vm.runInContext('SAFETY_SNAPSHOT_RISK_REASONS.length = 0;', rt.ctx); // esvazia a allowlist de propósito
  const r = await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  assert.equal(r.ok, false);
  assert.equal(r.fromSite, 'Fossa ilíaca direita', 'fromSite/toSite aparecem MESMO no erro de snapshot');
  assert.equal(r.toSite, 'Apêndice');
  assert.match(r.snapshotError, /não está em SAFETY_SNAPSHOT_RISK_REASONS/);
  assert.equal(rt.ctx.DATA.find(e => e.id === 'seed_1').site, 'Fossa ilíaca direita', 'lesão byte-equivalente — nenhuma mutação');
  assert.equal(rt.saveCalls, 0, 'saveData só ocorre depois do snapshot confirmado');
});

test('INTEGRACAO REAL (byte-equivalência): quando o snapshot falha, a lesão inteira permanece idêntica (JSON antes == depois)', async () => {
  const fixture = [lesion(), { id: 'seed_2', s: 'Abdômen Superior', site: 'Apêndice', name: 'Z' }];
  const rt = loadRealMigrationRuntime(fixture);
  vm.runInContext('SAFETY_SNAPSHOT_RISK_REASONS.length = 0;', rt.ctx);
  const beforeJson = JSON.stringify(rt.ctx.DATA);
  await rt.api.migrateLesionSite('seed_1', 'Apêndice', {});
  assert.equal(JSON.stringify(rt.ctx.DATA), beforeJson);
});

// ===========================================================================
// LOCALIZAÇÃO ADICIONAL — mesmo dropdown/proteção do Sítio/órgão principal
// (ajuste 22/09/2026). Sem jsdom no projeto: interação de DOM (abrir/
// fechar, clicar opção) é coberta por checagem estática do wiring real
// (mesmo padrão já usado pelas demais suítes deste projeto); a validação
// em si (o que realmente decide aceitar/recusar) é testada de forma
// dinâmica via validateSiteAgainstSection, a mesma função reaproveitada.
// ===========================================================================

// NÃO usa stripJsComments aqui: essa função é uma stripagem ingênua por
// regex, sem noção de strings — em openForm() ela confunde o `/*` dentro do
// atributo `accept="image/*"` (input de arquivo, texto legítimo, não
// comentário) com abertura de comentário de bloco, e some com um trecho
// grande de código real até o próximo `*/` de verdade (foi assim que os
// testes abaixo, que checam justamente o dropdown novo, ficavam com
// "actual" sem a declaração que devia estar lá). Bug pré-existente da
// própria stripJsComments (também usada por outros arquivos de teste),
// não do index.html — aqui só evitamos acioná-lo, sem alterar o helper
// compartilhado por fora do escopo desta tarefa.
const OPEN_FORM_SRC = extractFunction(html, 'openForm').source;

test('LOC.ADICIONAL 1: a seta (dropdown) existe no campo Sítio/órgão da localização adicional', () => {
  assert.match(html, /id="f-alt-site-toggle"[^>]*>▾</);
  assert.match(html, /id="f-alt-site-dropdown"/);
});

test('LOC.ADICIONAL 2/3: o dropdown usa knownSitesForSection da SEÇÃO informada na própria linha (f-alt-section), nunca da seção principal', () => {
  assert.match(OPEN_FORM_SRC, /function renderAltSiteDropdown\(\)\{[\s\S]*?knownSitesForSection\(sec, DATA\)/);
  assert.match(OPEN_FORM_SRC, /const sec = altSectionInput\.value\.trim\(\);/);
  assert.doesNotMatch(OPEN_FORM_SRC.slice(OPEN_FORM_SRC.indexOf('renderAltSiteDropdown'), OPEN_FORM_SRC.indexOf('renderAltSiteDropdown') + 700), /sectionInputForSite/, 'não usa a seção do campo principal por engano');
});

test('LOC.ADICIONAL 4: digitar no campo filtra a lista (reaproveita filterSiteOptions, não duplica lógica de filtro)', () => {
  assert.match(OPEN_FORM_SRC, /filterSiteOptions\(known, altSiteInput\.value\)/);
});

test('LOC.ADICIONAL 5: clicar numa opção grava o valor exato do data-site (grafia canônica) no campo', () => {
  const block = OPEN_FORM_SRC.slice(OPEN_FORM_SRC.indexOf('function renderAltSiteDropdown'));
  assert.match(block, /altSiteInput\.value = opt\.getAttribute\('data-site'\);/);
});

test('LOC.ADICIONAL 6: sem seção informada, o dropdown mostra orientação em vez de misturar sítios de outras seções', () => {
  assert.match(OPEN_FORM_SRC, /if\(!sec\)\{ altSiteDropdown\.innerHTML = '<div[^>]*>Selecione a seção primeiro<\/div>'; return; \}/);
});

test('LOC.ADICIONAL 7: "+ Adicionar localização" reusa validateSiteAgainstSection (mesma função do sítio principal) sem permitir sítio novo', () => {
  const idx = OPEN_FORM_SRC.indexOf("altAddBtn.onclick");
  const block = OPEN_FORM_SRC.slice(idx, idx + 1800);
  assert.match(block, /validateSiteAgainstSection\(s, st, DATA, false\)/, 'allowNew=false: localização adicional nunca inventa sítio');
  assert.match(block, /toast\('Selecione um sítio\/órgão existente na lista\.'\)/);
  assert.match(block, /altPlacementsDraft\.push\(\{ s, site: canonicalSite \}\)/, 'grava a grafia canônica devolvida pela validação, não o texto digitado');
});

test('LOC.ADICIONAL 7 (dinâmico): sítio inexistente na seção é recusado (mesma regra do campo principal, sem allowNew)', () => {
  const api = loadPure();
  const v = api.validateSiteAgainstSection('Coluna Vertebral', 'Sítio Inventado', [{ id: 'x', s: 'Coluna Vertebral', site: 'Corpo vertebral' }], false);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'unknown_site');
});

test('LOC.ADICIONAL 8 (dinâmico): sítio já cadastrado na seção é aceito e devolve a grafia canônica exata', () => {
  const api = loadPure();
  const catalog = [{ id: 'x', s: 'Coluna Vertebral', site: 'Corpo vertebral', name: 'Y' }];
  const v = api.validateSiteAgainstSection('Coluna Vertebral', '  corpo VERTEBRAL  ', catalog, false);
  assert.equal(v.ok, true);
  assert.equal(v.value, 'Corpo vertebral');
});

test('LOC.ADICIONAL 9: altPlacements já existentes continuam renderizando/removendo normalmente (fluxo antigo intacto)', () => {
  assert.match(OPEN_FORM_SRC, /function renderAltPlacements\(\)\{/);
  assert.match(OPEN_FORM_SRC, /altPlacementsDraft\.splice\(i,1\); renderAltPlacements\(\);/);
  assert.match(OPEN_FORM_SRC, /let altPlacementsDraft = \(existing && Array\.isArray\(existing\.altPlacements\)\)/);
});

test('LOC.ADICIONAL 10 (regressão): o campo Sítio/órgão PRINCIPAL continua com seu próprio dropdown/validação intactos', () => {
  assert.match(OPEN_FORM_SRC, /siteInput = document\.getElementById\('f-site'\);/);
  assert.match(OPEN_FORM_SRC, /siteCheck = validateSiteAgainstSection\(sec, site, DATA, allowNewSite\)/);
  assert.match(html, /id="f-site-toggle"/, 'markup do dropdown principal preservado');
});

test('LOC.ADICIONAL: não cria uma segunda fonte de taxonomia (mesmas funções puras reaproveitadas, nenhuma nova)', () => {
  const altBlockStart = OPEN_FORM_SRC.indexOf("altSiteInput = document.getElementById('f-alt-site');");
  const altBlockEnd = OPEN_FORM_SRC.indexOf('let altPlacementsDraft');
  assert.ok(altBlockStart >= 0 && altBlockEnd > altBlockStart, 'bloco do dropdown da localização adicional encontrado');
  const altBlock = OPEN_FORM_SRC.slice(altBlockStart, altBlockEnd);
  assert.doesNotMatch(altBlock, /function knownSitesForSection|function validateSiteAgainstSection|function filterSiteOptions/, 'reaproveita as funções existentes, não redefine');
});
