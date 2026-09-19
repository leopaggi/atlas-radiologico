'use strict';

/*
 * Contrato da migracao de legacy IDs (ver investigacao read-only:
 * auditoria dos 126 grupos duplicados reais do DATA do navegador,
 * cruzados contra o SEED atual de index.html).
 *
 * Este arquivo agora extrai e executa, via vm, o MOTOR REAL implementado
 * em index.html ("MOTOR DE MIGRACAO DE LEGACY IDS (V1) — INERTE, NAO
 * CONECTADO"): LEGACY_ID_MIGRATION_MAP_V1 e as funcoes puras
 * normalizeLegacyIdentity, validateLegacyContent,
 * validateLegacyIdMigrationMap, mergeLegacyReview, mergeLegacySrs,
 * mergeLegacyNotes, mergeLegacyTags, mergeLegacyLinks,
 * rewriteMigratedImageOwner, mergeLegacyImages, mergeLegacyBaseFields e
 * applyLegacyIdMigrationToState — no mesmo estilo de extracao estatica +
 * vm.createContext usado por tests/critical-flows.test.js.
 *
 * IMPORTANTE: o motor extraido aqui e' o codigo de PRODUCAO, mas ele
 * continua INERTE — nao e chamado por loadData, syncFromFirebase,
 * importacao, nenhum botao ou qualquer outro fluxo automatico. Esta
 * suite prova o comportamento do motor isoladamente; nao liga nada a
 * producao.
 *
 * Os poucos helpers que permanecem SOMENTE neste arquivo (resolveCanonical,
 * isSameLesionIdentity, buildSeedIndex) NAO tem equivalente em producao
 * de proposito: eles formalizam a METODOLOGIA usada para construir o
 * mapa estatico (ver investigacao), nao fazem parte do motor de
 * migracao em si — o mapa e' estatico e auditado a mao, nunca gerado em
 * runtime (ver PASSO 2 da especificacao desta etapa).
 *
 * Nenhum teste aqui depende de rede, navegador, IndexedDB ou Firebase.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Extracao estatica (mesmo estilo de tests/critical-flows.test.js e
// tests/duplicate-detection.test.js) — nenhuma execucao de index.html
// inteiro, so' os trechos relevantes.
// ---------------------------------------------------------------------------
function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{', `Bloco nao inicia em { na posicao ${openingBrace}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

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
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  throw new Error(`Bloco sem fechamento iniciado na linha ${lineNumberAt(source, openingBrace)}`);
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada em index.html`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  const block = extractBlock(source, openingBrace);
  return {
    source: source.slice(declaration.index, openingBrace) + block,
    body: block.slice(1, -1),
    index: declaration.index,
    line: lineNumberAt(source, declaration.index)
  };
}

function extractDelimited(source, start) {
  const closing = { '[': ']', '{': '}', '(': ')' };
  const first = source[start];
  assert.ok(closing[first], `Delimitador inicial invalido na posicao ${start}`);
  const stack = [closing[first]];
  let quote = null;
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (closing[char]) stack.push(closing[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Bloco iniciado na posicao ${start} nao foi fechado`);
}

function declarationsOf(source, name) {
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`, 'g');
  return [...source.matchAll(pattern)];
}

// ---------------------------------------------------------------------------
// PASSO 14 — comprovacao de ZERO call sites de producao ANTES de extrair
// qualquer coisa. Se isto falhar, a suite inteira para aqui: nao faz
// sentido testar um motor que, por engano, ja esteja conectado.
// ---------------------------------------------------------------------------
function callSitesOutsideDefinition(source, name, definitionIndex) {
  const pattern = new RegExp(`\\b${name}\\b`, 'g');
  return [...source.matchAll(pattern)]
    .map((m) => m.index)
    .filter((index) => index !== definitionIndex);
}

test('PASSO 14: ZERO call sites de producao para o motor de migracao (fora da propria definicao)', () => {
  const mapDecl = declarationsOf(html, 'LEGACY_ID_MIGRATION_MAP_V1');
  assert.equal(mapDecl.length, 1, 'LEGACY_ID_MIGRATION_MAP_V1 deve ter uma unica declaracao');
  const applyFn = extractFunction(html, 'applyLegacyIdMigrationToState');

  // Toda outra ocorrencia do nome do mapa fora da propria declaracao so'
  // pode estar em comentario/documentacao (nunca em codigo executavel
  // fora de um bloco de comentario /* ... */ ou //).
  const mapMentions = callSitesOutsideDefinition(html, 'LEGACY_ID_MIGRATION_MAP_V1', mapDecl[0].index);
  for (const index of mapMentions) {
    const before = html.slice(Math.max(0, index - 400), index);
    const lastCommentOpen = before.lastIndexOf('/*');
    const lastCommentClose = before.lastIndexOf('*/');
    const lastLineStart = before.lastIndexOf('\n') + 1;
    const lineSoFar = html.slice(lastLineStart, index);
    const insideBlockComment = lastCommentOpen > lastCommentClose;
    const insideLineComment = /\/\//.test(lineSoFar);
    assert.ok(insideBlockComment || insideLineComment, `Mencao inesperada a LEGACY_ID_MIGRATION_MAP_V1 fora de comentario na linha ${lineNumberAt(html, index)}`);
  }

  const applyMentions = callSitesOutsideDefinition(html, 'applyLegacyIdMigrationToState', applyFn.index);
  for (const index of applyMentions) {
    const before = html.slice(Math.max(0, index - 400), index);
    const lastCommentOpen = before.lastIndexOf('/*');
    const lastCommentClose = before.lastIndexOf('*/');
    const lastLineStart = before.lastIndexOf('\n') + 1;
    const lineSoFar = html.slice(lastLineStart, index);
    const insideBlockComment = lastCommentOpen > lastCommentClose;
    const insideLineComment = /\/\//.test(lineSoFar);
    assert.ok(insideBlockComment || insideLineComment, `Mencao inesperada a applyLegacyIdMigrationToState fora de comentario na linha ${lineNumberAt(html, index)}`);
  }

  console.log(`LEGACY_ID_MIGRATION_MAP_V1: 1 declaracao + ${mapMentions.length} mencao(oes) em comentario, 0 usos em codigo.`);
  console.log(`applyLegacyIdMigrationToState: 1 definicao + ${applyMentions.length} mencao(oes) em comentario, 0 chamadas.`);
});

// ---------------------------------------------------------------------------
// Extrai o motor real e o executa em um unico vm.Script (as funcoes se
// chamam entre si, entao precisam compartilhar o mesmo escopo de topo).
// ---------------------------------------------------------------------------
const ENGINE_FUNCTION_NAMES = [
  'stableImageKeyV208',
  'normalizeLegacyIdentity',
  'validateLegacyContent',
  'validateLegacyIdMigrationMap',
  'mergeLegacyReview',
  'mergeLegacySrs',
  'mergeLegacyNotes',
  'mergeLegacyTags',
  'mergeLegacyLinks',
  'rewriteMigratedImageOwner',
  'mergeLegacyImages',
  'mergeLegacyBaseFields',
  'applyLegacyIdMigrationToState'
];

function buildEngine() {
  const extractedFns = {};
  for (const name of ENGINE_FUNCTION_NAMES) extractedFns[name] = extractFunction(html, name);

  const mapDecl = declarationsOf(html, 'LEGACY_ID_MIGRATION_MAP_V1');
  assert.equal(mapDecl.length, 1, 'LEGACY_ID_MIGRATION_MAP_V1 deve ter uma unica declaracao');
  const equalsIndex = html.indexOf('=', mapDecl[0].index);
  const arrayStart = html.indexOf('[', equalsIndex);
  const mapArraySource = extractDelimited(html, arrayStart);

  const sourceParts = [
    extractedFns.stableImageKeyV208.source,
    `const LEGACY_ID_MIGRATION_MAP_V1 = ${mapArraySource};`,
    extractedFns.normalizeLegacyIdentity.source,
    extractedFns.validateLegacyContent.source,
    extractedFns.validateLegacyIdMigrationMap.source,
    extractedFns.mergeLegacyReview.source,
    extractedFns.mergeLegacySrs.source,
    extractedFns.mergeLegacyNotes.source,
    extractedFns.mergeLegacyTags.source,
    extractedFns.mergeLegacyLinks.source,
    extractedFns.rewriteMigratedImageOwner.source,
    extractedFns.mergeLegacyImages.source,
    extractedFns.mergeLegacyBaseFields.source,
    extractedFns.applyLegacyIdMigrationToState.source,
    'globalThis.LEGACY_ID_MIGRATION_MAP_V1 = LEGACY_ID_MIGRATION_MAP_V1;',
    ...ENGINE_FUNCTION_NAMES.map((name) => `globalThis.${name} = ${name};`)
  ];

  const context = vm.createContext({ console });
  new vm.Script(sourceParts.join('\n\n'), { filename: 'index.html:legacy-engine' }).runInContext(context);
  return { context, extractedFns, mapArraySource };
}

const engineBuild = buildEngine();
const engine = engineBuild.context;

test('motor real e localizado estaticamente no index.html nas linhas esperadas', () => {
  assert.ok(engineBuild.extractedFns.stableImageKeyV208.line < engineBuild.extractedFns.normalizeLegacyIdentity.line);
  for (const name of ENGINE_FUNCTION_NAMES) {
    assert.ok(engineBuild.extractedFns[name].line > 0, `${name} deveria ter sido localizado em index.html`);
  }
  assert.equal(typeof engine.LEGACY_ID_MIGRATION_MAP_V1, 'object');
  assert.equal(Array.isArray(engine.LEGACY_ID_MIGRATION_MAP_V1), true);
  for (const name of ENGINE_FUNCTION_NAMES) {
    assert.equal(typeof engine[name], 'function', `${name} deveria ter sido extraido como funcao executavel`);
  }
});

// ---------------------------------------------------------------------------
// Extracao independente do SEED real (mesma tecnica de
// tests/duplicate-detection.test.js), usada para: (a) validar o mapa real
// contra o SEED real (PASSO 16); (b) checar que as fixtures desta suite
// nao ficaram desatualizadas.
// ---------------------------------------------------------------------------
function loadRealSeed() {
  const match = /\bconst\s+SEED\s*=/.exec(html);
  assert.ok(match, 'SEED nao encontrado em index.html');
  const start = html.indexOf('[', match.index);
  const seed = JSON.parse(extractDelimited(html, start));
  assert.ok(Array.isArray(seed), 'SEED deve ser um array JSON estatico');
  return seed;
}
const REAL_SEED = loadRealSeed();
const REAL_SEED_BY_ID = new Map(REAL_SEED.map((e) => [e.id, e]));

// Funcoes extraidas via vm rodam em um realm (contexto V8) diferente do
// realm deste arquivo de teste. Um array/objeto retornado por elas tem um
// Array.prototype/Object.prototype distinto do global do teste, entao
// assert.deepEqual (deepStrictEqual em modo estrito) os rejeita mesmo
// quando o CONTEUDO e identico ("same structure but are not
// reference-equal"). O mesmo padrao ja e usado em critical-flows.test.js
// (funcao `plain`) para normalizar valores vindos de vm.createContext
// antes de comparar.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// ===========================================================================
// PASSO 2 / PASSO 16 — VALIDACAO ESTATICA DO MAPA REAL (126 pares)
// ===========================================================================

test('PASSO 2/16: LEGACY_ID_MIGRATION_MAP_V1 tem exatamente 126 itens', () => {
  assert.equal(engine.LEGACY_ID_MIGRATION_MAP_V1.length, 126);
});

test('PASSO 2/16: validateLegacyIdMigrationMap (real) aprova os 126 pares contra o SEED real, sem ambiguidade', () => {
  const report = engine.validateLegacyIdMigrationMap(engine.LEGACY_ID_MIGRATION_MAP_V1, REAL_SEED);
  assert.equal(report.totalRules, 126);
  assert.equal(report.uniqueLegacyIds, 126, '126 legacyIds unicos');
  assert.deepEqual(plain(report.issues), [], `Mapa real reprovado: ${JSON.stringify(report.issues.slice(0, 5))}`);
  assert.equal(report.valid, true);
});

test('PASSO 2/16: cada item tem legacyId != canonicalId e canonicalId existente no SEED real', () => {
  for (const rule of engine.LEGACY_ID_MIGRATION_MAP_V1) {
    assert.notEqual(rule.legacyId, rule.canonicalId, `Par invalido: ${JSON.stringify(rule)}`);
    assert.ok(REAL_SEED_BY_ID.has(rule.canonicalId), `canonicalId ${rule.canonicalId} ausente do SEED real`);
    const canonical = REAL_SEED_BY_ID.get(rule.canonicalId);
    assert.equal(canonical.name, rule.expectedLegacyName, `nome do canonico diverge do esperado em ${rule.legacyId}`);
    assert.equal(canonical.s, rule.expectedLegacySection, `secao do canonico diverge do esperado em ${rule.legacyId}`);
    assert.equal(canonical.site, rule.expectedLegacySite, `site do canonico diverge do esperado em ${rule.legacyId}`);
  }
});

test('PASSO 16 OBRIGATORIO (seed_28): legacyId existe no SEED atual com identidade DIFERENTE, e o motor NAO trata como historico', () => {
  const rule = engine.LEGACY_ID_MIGRATION_MAP_V1.find((r) => r.legacyId === 'seed_28');
  assert.ok(rule, 'regra para seed_28 deve existir no mapa real');
  const seed28Atual = REAL_SEED_BY_ID.get('seed_28');
  assert.ok(seed28Atual, 'seed_28 deve existir no SEED atual');
  assert.notEqual(seed28Atual.name, rule.expectedLegacyName, 'seed_28 hoje NAO pode ser "Osteoma craniano" — se for, a fixture desta investigacao ficou obsoleta');

  const validation = engine.validateLegacyContent(seed28Atual, rule);
  assert.deepEqual(plain(validation), { valid: false, reason: 'content_mismatch_id_reused' });

  const state = { data: [seed28Atual, REAL_SEED_BY_ID.get(rule.canonicalId)], review: {}, srs: {} };
  const result = engine.applyLegacyIdMigrationToState(state, [rule], REAL_SEED_BY_ID);
  assert.deepEqual(plain(result.state.data.map((e) => e.id)).sort(), ['seed_28', 'seed_32']);
  assert.equal(result.state.data.find((e) => e.id === 'seed_28').name, seed28Atual.name, 'seed_28 nao pode ser renomeado/apagado');
  assert.equal(result.report.anomalies.length, 1);
  assert.equal(result.report.anomalies[0].reason, 'content_mismatch_id_reused');
  assert.deepEqual(plain(result.report.migrated), []);
});

// ===========================================================================
// Fixtures baseadas nos casos reais confirmados na investigacao — usadas
// nas secoes seguintes com o motor REAL.
// ===========================================================================

const OSTEOMA_RULE = engine.LEGACY_ID_MIGRATION_MAP_V1.find((r) => r.legacyId === 'seed_28');
const PINEOCITOMA_RULE = engine.LEGACY_ID_MIGRATION_MAP_V1.find((r) => r.legacyId === 'seed_21');

test('GROUNDING: regras usadas nas fixtures desta suite existem no mapa real', () => {
  assert.ok(OSTEOMA_RULE, 'regra seed_28 -> seed_32 deve existir no mapa real');
  assert.ok(PINEOCITOMA_RULE, 'regra seed_21 -> seed_24 deve existir no mapa real');
  assert.equal(OSTEOMA_RULE.canonicalId, 'seed_32');
  assert.equal(PINEOCITOMA_RULE.canonicalId, 'seed_24');
});

// ===========================================================================
// SECAO 1 — METODOLOGIA DE CONSTRUCAO DO MAPA (nao existe em producao de
// proposito — o mapa e' estatico/auditado a mao, ver comentario de topo).
// Mantida aqui para provar que o METODO usado para gerar
// LEGACY_ID_MIGRATION_MAP_V1 nunca dependeu de ordem numerica.
// ===========================================================================

function normalize(value) {
  return String(value == null ? '' : value).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}
function identityKey(name, s, site) {
  return `${normalize(name)}|||${normalize(s)}|||${normalize(site)}`;
}
function isSameLesionIdentity(a, b) {
  return identityKey(a.name, a.s, a.site) === identityKey(b.name, b.s, b.site);
}
function buildSeedIndex(seedEntries) {
  const index = new Map();
  for (const entry of seedEntries) {
    const key = identityKey(entry.name, entry.s, entry.site);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry.id);
  }
  return index;
}
function resolveCanonical(seedIndex, group) {
  const key = identityKey(group.nome, group.secao, group.site);
  const matches = seedIndex.get(key) || [];
  const ids = group.registros.map((r) => r.id);
  if (matches.length === 0) return { classification: 'SEM_CANONICO', canonicalId: null, legacyId: null };
  if (matches.length > 1) return { classification: 'AMBIGUO', canonicalId: null, legacyId: null, matches };
  const canonicalId = matches[0];
  if (!ids.includes(canonicalId)) return { classification: 'CONFIRMADO_ANOMALO', canonicalId, legacyId: null };
  const legacyId = ids.find((id) => id !== canonicalId) ?? null;
  return { classification: 'CONFIRMADO', canonicalId, legacyId };
}

const FICTICIO_LEGACY = { id: 'ficticio_9001', name: 'Lesão reaproveitada fictícia', s: 'Tórax', site: 'Pleura' };
const FICTICIO_CANONICAL = { id: 'ficticio_42', name: 'Fratura de Colles fictícia', s: 'Musculoesquelético', site: 'Punho e Mão' };
const CISTOADENOMA_PANCREAS = REAL_SEED.find((e) => e.name === 'Cistoadenoma seroso' && e.site === 'Pâncreas');
const CISTOADENOMA_OVARIO = REAL_SEED.find((e) => e.name === 'Cistoadenoma seroso' && e.site === 'Ovário');

test('metodologia: resolveCanonical usa o conteudo do SEED, nao a ordem numerica — caso real A (Osteoma craniano)', () => {
  const seedIndex = buildSeedIndex(REAL_SEED);
  const group = { nome: 'Osteoma craniano', secao: 'Neurorradiologia', site: 'Crânio ósseo', registros: [{ id: 'seed_28' }, { id: 'seed_32' }] };
  assert.deepEqual(resolveCanonical(seedIndex, group), { classification: 'CONFIRMADO', canonicalId: 'seed_32', legacyId: 'seed_28' });
});

test('metodologia: caso real B (Pineocitoma)', () => {
  const seedIndex = buildSeedIndex(REAL_SEED);
  const group = { nome: 'Pineocitoma', secao: 'Neurorradiologia', site: 'Região pineal', registros: [{ id: 'seed_21' }, { id: 'seed_24' }] };
  assert.deepEqual(resolveCanonical(seedIndex, group), { classification: 'CONFIRMADO', canonicalId: 'seed_24', legacyId: 'seed_21' });
});

test('metodologia: caso artificial C — legacyId numericamente MAIOR que canonicalId nao inverte o resultado', () => {
  const seedIndex = buildSeedIndex([...REAL_SEED, FICTICIO_LEGACY, FICTICIO_CANONICAL]);
  const group = { nome: 'Fratura de Colles fictícia', secao: 'Musculoesquelético', site: 'Punho e Mão', registros: [{ id: 'ficticio_9001' }, { id: 'ficticio_42' }] };
  assert.deepEqual(resolveCanonical(seedIndex, group), { classification: 'CONFIRMADO', canonicalId: 'ficticio_42', legacyId: 'ficticio_9001' });
});

test('metodologia: caso real D — Cistoadenoma seroso (mesmo nome, s/site diferentes) NUNCA e o mesmo grupo', () => {
  assert.ok(CISTOADENOMA_PANCREAS && CISTOADENOMA_OVARIO, 'fixtures do Cistoadenoma seroso devem existir no SEED real');
  assert.equal(isSameLesionIdentity(CISTOADENOMA_PANCREAS, CISTOADENOMA_OVARIO), false);
});

// ===========================================================================
// PASSO 5 / PASSO 9 — VALIDACAO DO LEGACY (motor real)
// ===========================================================================

test('validateLegacyContent (real): aceita quando o conteudo do legacy ainda bate com o esperado', () => {
  const legacySnapshotHistorico = { id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo' };
  assert.deepEqual(plain(engine.validateLegacyContent(legacySnapshotHistorico, OSTEOMA_RULE)), { valid: true, reason: null });
});

test('validateLegacyContent (real): rejeita quando o ID foi reaproveitado no SEED para outra lesao', () => {
  assert.deepEqual(plain(engine.validateLegacyContent(REAL_SEED_BY_ID.get('seed_28'), OSTEOMA_RULE)), { valid: false, reason: 'content_mismatch_id_reused' });
});

// ===========================================================================
// PASSO 7 — REVIEW (motor real)
// ===========================================================================

test('mergeLegacyReview (real): somente legacy possui REVIEW', () => {
  assert.equal(engine.mergeLegacyReview(1, undefined), 1);
});
test('mergeLegacyReview (real): somente canonical possui REVIEW', () => {
  assert.equal(engine.mergeLegacyReview(undefined, 2), 2);
});
test('mergeLegacyReview (real): ambos iguais', () => {
  assert.equal(engine.mergeLegacyReview(1, 1), 1);
});
test('mergeLegacyReview (real): ambos diferentes preserva o maior estagio ordinal (0 vs 2)', () => {
  assert.equal(engine.mergeLegacyReview(0, 2), 2);
});
test('mergeLegacyReview (real): ausencia de chave (undefined) e valor explicito 0 produzem o mesmo piso seguro', () => {
  assert.equal(engine.mergeLegacyReview(0, undefined), 0);
  assert.equal(engine.mergeLegacyReview(undefined, undefined), null);
});
test('GUARDA ESTRUTURAL: mergeLegacyReview (real) nao decide qual SRS deve sobreviver', () => {
  assert.doesNotMatch(engineBuild.extractedFns.mergeLegacyReview.body, /srs/i);
});

// ===========================================================================
// PASSO 8 — SRS (motor real)
// ===========================================================================

const SRS_A = { interval: 3, streak: 2, due: 2000, updatedAt: 1000, lastGrade: 'easy' };
const SRS_B = { interval: 30, streak: 10, due: 9000, updatedAt: 5000, lastGrade: 'easy' };

test('mergeLegacySrs (real): SRS somente no legacy', () => {
  assert.deepEqual(plain(engine.mergeLegacySrs(SRS_A, null)), { value: SRS_A, conflict: false });
});
test('mergeLegacySrs (real): SRS somente no canonical', () => {
  assert.deepEqual(plain(engine.mergeLegacySrs(null, SRS_B)), { value: SRS_B, conflict: false });
});
test('mergeLegacySrs (real): nenhum possui SRS', () => {
  assert.deepEqual(plain(engine.mergeLegacySrs(null, null)), { value: null, conflict: false });
});
test('mergeLegacySrs (real): ambos identicos nao geram conflito', () => {
  const clone = { ...SRS_A };
  assert.deepEqual(plain(engine.mergeLegacySrs(SRS_A, clone)), { value: clone, conflict: false });
});
test('mergeLegacySrs (real): ambos diferentes com updatedAt distinto preserva INTEGRALMENTE o mais recente e reporta conflito', () => {
  const result = engine.mergeLegacySrs(SRS_A, SRS_B);
  assert.deepEqual(plain(result), { value: SRS_B, conflict: true, reason: 'srs_conflict_resolved_by_updatedAt' });
});
test('mergeLegacySrs (real): ambos diferentes SEM timestamp confiavel exige conflito, sem inventar hibrido', () => {
  const semTimestampA = { interval: 3, streak: 2, due: 2000, lastGrade: 'easy' };
  const semTimestampB = { interval: 30, streak: 10, due: 9000, lastGrade: 'easy' };
  assert.deepEqual(plain(engine.mergeLegacySrs(semTimestampA, semTimestampB)), { value: null, conflict: true, reason: 'srs_conflict_unresolved_no_timestamp' });
});
test('mergeLegacySrs (real): nunca soma streak nem tira media de interval', () => {
  const result = engine.mergeLegacySrs(SRS_A, SRS_B);
  assert.notEqual(result.value.streak, SRS_A.streak + SRS_B.streak);
  assert.notEqual(result.value.interval, (SRS_A.interval + SRS_B.interval) / 2);
  assert.ok(result.value.streak === SRS_A.streak || result.value.streak === SRS_B.streak);
});
test('mergeLegacySrs (real): nao decide pelo maior due nem pelo maior streak isoladamente', () => {
  const aMaisRecente = { ...SRS_A, updatedAt: 9999 };
  const result = engine.mergeLegacySrs(aMaisRecente, SRS_B);
  assert.equal(result.value, aMaisRecente, 'deveria vencer por updatedAt, mesmo tendo due/streak menores');
});

test('FIXTURE REAL — Osteoma craniano: REVIEW final 2, SRS final e o SRS real do legacy (motor real)', () => {
  const legacySrsReal = { interval: 3, streak: 1, lastGrade: 'easy', updatedAt: 1789765201665, due: 1790024401665 };
  assert.equal(engine.mergeLegacyReview(0, 2), 2);
  assert.deepEqual(plain(engine.mergeLegacySrs(legacySrsReal, null)), { value: legacySrsReal, conflict: false });
});

// ===========================================================================
// PASSO 10 — IMAGENS (motor real, stableImageKeyV208 real)
// ===========================================================================

test('stableImageKeyV208 (real): prioriza assetId sobre publicId', () => {
  assert.equal(engine.stableImageKeyV208({ assetId: 'A1', publicId: 'P1' }), 'asset:A1');
});
test('stableImageKeyV208 (real): prioriza publicId sobre originalUrl', () => {
  assert.equal(engine.stableImageKeyV208({ publicId: 'P1', originalUrl: 'https://x/img.png' }), 'public:P1');
});
test('stableImageKeyV208 (real): prioriza originalUrl sobre data', () => {
  assert.equal(engine.stableImageKeyV208({ originalUrl: 'https://x/img.png', data: 'data:base64,xyz' }), 'original:https://x/img.png');
});
test('stableImageKeyV208 (real): prioriza data sobre thumb', () => {
  assert.equal(engine.stableImageKeyV208({ data: 'data:base64,xyz', thumb: 'https://x/thumb.png' }), 'data:data:base64,xyz');
});

const IMG_SHARED = { assetId: 'shared-1', width: 800, height: 600, label: 'compartilhada' };
const IMG_LEGACY_ONLY = { assetId: 'legacy-only', width: 400, height: 300, label: 'so no legacy' };
const IMG_CANONICAL_ONLY = { assetId: 'canonical-only', width: 500, height: 500, label: 'so no canonico' };

test('mergeLegacyImages (real): une sem duplicar imagem com a mesma chave nos dois lados', () => {
  assert.equal(engine.mergeLegacyImages([IMG_SHARED], [{ ...IMG_SHARED }], 'seed_32').length, 1);
});
test('mergeLegacyImages (real): preserva imagens exclusivas de cada lado (uniao sem perda)', () => {
  const result = engine.mergeLegacyImages([IMG_LEGACY_ONLY], [IMG_CANONICAL_ONLY], 'seed_32');
  assert.deepEqual(plain(result.map((i) => engine.stableImageKeyV208(i))).sort(), ['asset:canonical-only', 'asset:legacy-only']);
});
test('mergeLegacyImages (real): reescreve lesionId para canonicalId em TODA imagem migrada', () => {
  const result = engine.mergeLegacyImages([{ ...IMG_LEGACY_ONLY, lesionId: 'seed_28' }], [{ ...IMG_CANONICAL_ONLY, lesionId: 'seed_32' }], 'seed_32');
  assert.ok(result.every((img) => img.lesionId === 'seed_32'));
});
test('mergeLegacyImages (real): reescreve cloudinaryContext.custom.lesion_id quando presente', () => {
  const legacyImg = { ...IMG_LEGACY_ONLY, lesionId: 'seed_28', cloudinaryContext: { custom: { atlas_version: 'v193', lesion_id: 'seed_28', lesion_name: 'Osteoma craniano' } } };
  const result = engine.mergeLegacyImages([legacyImg], [], 'seed_32');
  assert.equal(result[0].cloudinaryContext.custom.lesion_id, 'seed_32');
  assert.equal(result[0].cloudinaryContext.custom.atlas_version, 'v193');
});
test('mergeLegacyImages (real): preserva demais metadados', () => {
  const result = engine.mergeLegacyImages([], [IMG_CANONICAL_ONLY], 'seed_32');
  assert.equal(result[0].width, 500);
  assert.equal(result[0].label, 'so no canonico');
});
test('mergeLegacyImages (real): e idempotente', () => {
  const first = engine.mergeLegacyImages([IMG_LEGACY_ONLY], [IMG_CANONICAL_ONLY, IMG_SHARED], 'seed_32');
  const second = engine.mergeLegacyImages([IMG_LEGACY_ONLY], first, 'seed_32');
  assert.deepEqual(plain(second), plain(first));
});

// ===========================================================================
// PASSO 11 — LINKS E TAGS (motor real)
// ===========================================================================

const LINK_SHARED = { label: 'Radiopaedia — buscar casos', url: 'https://radiopaedia.org/search?q=osteoma' };
const LINK_LEGACY_ONLY = { label: 'Caso legado', url: 'https://radiopaedia.org/cases/legado-1' };
const LINK_CANONICAL_ONLY = { label: 'Caso canonico', url: 'https://radiopaedia.org/cases/canonico-1' };

test('mergeLegacyLinks (real): mesmos links nao duplicam', () => {
  assert.equal(engine.mergeLegacyLinks([LINK_SHARED], [{ ...LINK_SHARED }]).length, 1);
});
test('mergeLegacyLinks (real): link so no legacy e preservado', () => {
  const result = engine.mergeLegacyLinks([LINK_LEGACY_ONLY], [LINK_SHARED]);
  assert.ok(result.some((l) => l.url === LINK_LEGACY_ONLY.url));
});
test('mergeLegacyLinks (real): link so no canonical e preservado', () => {
  assert.deepEqual(plain(engine.mergeLegacyLinks([], [LINK_CANONICAL_ONLY])), [LINK_CANONICAL_ONLY]);
});
test('mergeLegacyLinks (real): URLs diferentes geram uniao com as duas', () => {
  const urls = plain(engine.mergeLegacyLinks([LINK_LEGACY_ONLY], [LINK_CANONICAL_ONLY]).map((l) => l.url)).sort();
  assert.deepEqual(urls, [LINK_CANONICAL_ONLY.url, LINK_LEGACY_ONLY.url].sort());
});
test('mergeLegacyLinks (real): mesma URL com labels diferentes nao duplica, label do canonico prevalece', () => {
  const legacyVersion = { label: 'Busca em português', url: 'https://radiopaedia.org/search?q=x' };
  const canonicalVersion = { label: 'Search in English', url: 'https://radiopaedia.org/search?q=x' };
  const result = engine.mergeLegacyLinks([legacyVersion], [canonicalVersion]);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, canonicalVersion.label);
});

test('mergeLegacyTags (real): uniao sem duplicatas, nenhuma tag exclusiva se perde', () => {
  const result = plain(engine.mergeLegacyTags(['cístico', 'exclusiva-legacy'], ['cístico', 'exclusiva-canonico']));
  assert.deepEqual(result.sort(), ['cístico', 'exclusiva-canonico', 'exclusiva-legacy'].sort());
});
test('mergeLegacyTags (real): idempotente', () => {
  const first = engine.mergeLegacyTags(['a', 'b'], ['b', 'c']);
  const second = plain(engine.mergeLegacyTags(first, first));
  assert.deepEqual(second.sort(), plain(first).sort());
});

// ===========================================================================
// PASSO 9 (notes, dentro dos campos personalizados) — motor real
// ===========================================================================

test('mergeLegacyNotes (real): notes iguais', () => {
  assert.deepEqual(plain(engine.mergeLegacyNotes('mesmo texto', 'mesmo texto', 1, 2)), { value: 'mesmo texto', conflict: false });
});
test('mergeLegacyNotes (real): notes so no legacy', () => {
  assert.deepEqual(plain(engine.mergeLegacyNotes('texto legado', '', 1, 0)), { value: 'texto legado', conflict: false });
});
test('mergeLegacyNotes (real): notes so no canonical', () => {
  assert.deepEqual(plain(engine.mergeLegacyNotes('', 'texto canonico', 0, 1)), { value: 'texto canonico', conflict: false });
});
test('mergeLegacyNotes (real): diferentes com _userUpdatedAt diferente resolve deterministicamente', () => {
  assert.deepEqual(plain(engine.mergeLegacyNotes('texto antigo', 'texto novo', 1000, 2000)), { value: 'texto novo', conflict: false });
});
test('mergeLegacyNotes (real): diferentes SEM timestamp confiavel exige conflito, nunca descarta por suposicao', () => {
  assert.deepEqual(plain(engine.mergeLegacyNotes('versao A', 'versao B', undefined, undefined)), { value: null, conflict: true, reason: 'notes_conflict_unresolved_no_timestamp' });
});

// ===========================================================================
// PASSO 12 — CAMPOS BASE (motor real)
// ===========================================================================

test('mergeLegacyBaseFields (real): identidade (name/s/site/inc) e SEMPRE do canonico', () => {
  const canonical = { id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', inc: 1 };
  const legacyComIdentidadeDiferente = { id: 'seed_28', name: 'Outra coisa qualquer', s: 'Outra secao', site: 'Outro site', inc: 3 };
  const { merged } = engine.mergeLegacyBaseFields(canonical, legacyComIdentidadeDiferente);
  assert.equal(merged.name, 'Osteoma craniano');
  assert.equal(merged.s, 'Neurorradiologia');
  assert.equal(merged.site, 'Crânio ósseo');
  assert.equal(merged.inc, 1);
});
test('mergeLegacyBaseFields (real): enTerm/classification/img/localImg herdados do legacy quando o canonico nao tem', () => {
  const canonical = { id: 'seed_32', name: 'x', s: 'x', site: 'x' };
  const legacy = { id: 'seed_28', name: 'x', s: 'x', site: 'x', enTerm: 'skull osteoma', classification: 'BI-RADS 2', img: 'data:img', localImg: true };
  const { merged } = engine.mergeLegacyBaseFields(canonical, legacy);
  assert.equal(merged.enTerm, 'skull osteoma');
  assert.equal(merged.classification, 'BI-RADS 2');
  assert.equal(merged.img, 'data:img');
  assert.equal(merged.localImg, true);
});
test('mergeLegacyBaseFields (real): altPlacements copiado do legacy quando o canonico nao tem', () => {
  const canonical = { id: 'seed_32', name: 'x', s: 'x', site: 'x' };
  const legacy = { id: 'seed_28', name: 'x', s: 'x', site: 'x', altPlacements: [{ s: 'Outra', site: 'Outro' }] };
  const { merged } = engine.mergeLegacyBaseFields(canonical, legacy);
  assert.deepEqual(plain(merged.altPlacements), [{ s: 'Outra', site: 'Outro' }]);
});
test('mergeLegacyBaseFields (real): _userUpdatedAt final e o maior dos dois lados', () => {
  const canonical = { id: 'seed_32', name: 'x', s: 'x', site: 'x', _userUpdatedAt: 1000 };
  const legacy = { id: 'seed_28', name: 'x', s: 'x', site: 'x', _userUpdatedAt: 5000 };
  assert.equal(engine.mergeLegacyBaseFields(canonical, legacy).merged._userUpdatedAt, 5000);
});
test('mergeLegacyBaseFields (real): conflito de classification NAO resolvivel e registrado, nunca sobrescrito silenciosamente', () => {
  const canonical = { id: 'seed_32', name: 'x', s: 'x', site: 'x', classification: 'BI-RADS 2' };
  const legacy = { id: 'seed_28', name: 'x', s: 'x', site: 'x', classification: 'BI-RADS 4' };
  const { merged, conflicts } = engine.mergeLegacyBaseFields(canonical, legacy);
  assert.equal(merged.classification, 'BI-RADS 2');
  assert.deepEqual(plain(conflicts), [{ field: 'classification', canonicalValue: 'BI-RADS 2', legacyValue: 'BI-RADS 4' }]);
});

// ===========================================================================
// PASSO 4 / PASSO 13 — applyLegacyIdMigrationToState (motor real):
// resultado estruturado, nao-mutacao e idempotencia
// ===========================================================================

test('applyLegacyIdMigrationToState (real): NAO muta os argumentos recebidos', () => {
  const legacyHistorico = { id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['esclerótica'] };
  const canonicalAtual = { id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['bem circunscrita'] };
  const state = { data: [legacyHistorico, canonicalAtual], review: { seed_28: 0, seed_32: 2 }, srs: {} };
  const stateSnapshot = JSON.stringify(state);

  engine.applyLegacyIdMigrationToState(state, [OSTEOMA_RULE], REAL_SEED_BY_ID);

  assert.equal(JSON.stringify(state), stateSnapshot, 'os argumentos de entrada nao podem ser alterados');
});

test('applyLegacyIdMigrationToState (real): legacyId com conteudo NAO correspondente vira anomaly, nada e fundido/apagado', () => {
  const state = { data: [{ ...REAL_SEED_BY_ID.get('seed_28') }, { ...REAL_SEED_BY_ID.get('seed_32') }], review: {}, srs: {} };
  const result = engine.applyLegacyIdMigrationToState(state, [OSTEOMA_RULE], REAL_SEED_BY_ID);
  assert.deepEqual(plain(result.state.data.map((e) => e.id)).sort(), ['seed_28', 'seed_32']);
  assert.equal(result.report.anomalies.length, 1);
  assert.equal(result.report.anomalies[0].reason, 'content_mismatch_id_reused');
  assert.deepEqual(plain(result.report.migrated), []);
});

test('applyLegacyIdMigrationToState (real): ambos existem (conteudo legacy valido) — funde uma vez e remove o legacy', () => {
  const legacyHistorico = { id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['esclerótica'] };
  const canonicalAtual = { id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['bem circunscrita'] };
  const review = { seed_28: 0, seed_32: 2 };
  const srs = { seed_28: SRS_A, seed_32: null };

  const result = engine.applyLegacyIdMigrationToState({ data: [legacyHistorico, canonicalAtual], review, srs }, [OSTEOMA_RULE], REAL_SEED_BY_ID);

  assert.deepEqual(plain(result.state.data.map((e) => e.id)), ['seed_32']);
  assert.deepEqual(plain(result.state.data[0].tags).sort(), ['bem circunscrita', 'esclerótica']);
  assert.equal(result.state.review.seed_32, 2);
  assert.equal(result.state.review.seed_28, undefined);
  assert.deepEqual(plain(result.state.srs.seed_32), SRS_A);
  assert.equal(result.state.srs.seed_28, undefined);
  assert.equal(result.report.migrated.length, 1);
});

test('applyLegacyIdMigrationToState (real): somente legacy existe — materializa o canonico a partir do SEED', () => {
  const legacyHistorico = { id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo' };
  const result = engine.applyLegacyIdMigrationToState({ data: [legacyHistorico], review: { seed_28: 1 }, srs: {} }, [OSTEOMA_RULE], REAL_SEED_BY_ID);
  assert.deepEqual(plain(result.state.data.map((e) => e.id)), ['seed_32']);
  assert.equal(result.state.data[0].s, 'Neurorradiologia');
  assert.equal(result.state.data[0].site, 'Crânio ósseo');
  assert.equal(result.state.review.seed_32, 1);
});

test('applyLegacyIdMigrationToState (real): somente canonical existe — no-op', () => {
  const canonicalAtual = { id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo' };
  const result = engine.applyLegacyIdMigrationToState({ data: [canonicalAtual], review: { seed_32: 2 }, srs: {} }, [OSTEOMA_RULE], REAL_SEED_BY_ID);
  assert.deepEqual(plain(result.state.data), [canonicalAtual]);
  assert.deepEqual(plain(result.report.conflicts), []);
  assert.deepEqual(plain(result.report.anomalies), []);
  assert.deepEqual(plain(result.report.skipped), [{ rule: plain(OSTEOMA_RULE), reason: 'legacy_ausente' }]);
});

test('applyLegacyIdMigrationToState (real): nenhum dos dois existe — no-op', () => {
  const outraEntrada = { id: 'seed_999', name: 'Outra lesão qualquer', s: 'x', site: 'x' };
  const result = engine.applyLegacyIdMigrationToState({ data: [outraEntrada], review: {}, srs: {} }, [OSTEOMA_RULE], REAL_SEED_BY_ID);
  assert.deepEqual(plain(result.state.data), [outraEntrada]);
});

test('applyLegacyIdMigrationToState (real) e IDEMPOTENTE: executar duas vezes produz exatamente o mesmo resultado', () => {
  const legacyHistorico = { id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['esclerótica'], images: [IMG_LEGACY_ONLY], links: [LINK_LEGACY_ONLY] };
  const canonicalAtual = { id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['bem circunscrita'], images: [IMG_CANONICAL_ONLY], links: [LINK_CANONICAL_ONLY] };
  const review = { seed_28: 0, seed_32: 2 };
  const srs = { seed_28: SRS_A, seed_32: null };

  const first = engine.applyLegacyIdMigrationToState({ data: [legacyHistorico, canonicalAtual], review, srs }, [OSTEOMA_RULE], REAL_SEED_BY_ID);
  const second = engine.applyLegacyIdMigrationToState(first.state, [OSTEOMA_RULE], REAL_SEED_BY_ID);

  assert.deepEqual(plain(second.state), plain(first.state), 'segunda execucao nao pode alterar o estado');
  assert.equal(second.state.data[0].images.length, first.state.data[0].images.length, 'nao pode duplicar imagens');
  assert.equal(second.state.data[0].links.length, first.state.data[0].links.length, 'nao pode duplicar links');
  assert.equal(second.state.data[0].tags.length, first.state.data[0].tags.length, 'nao pode duplicar tags');
  assert.deepEqual(plain(second.report.migrated), [], 'segunda execucao nao migra de novo (legacy ja nao existe)');
  assert.deepEqual(plain(second.report.skipped), [{ rule: plain(OSTEOMA_RULE), reason: 'legacy_ausente' }]);
});

// ===========================================================================
// SECAO 11 — RECONCILIACAO SIMULADA (Firebase fake, sem rede), motor real
// ===========================================================================

// Uniao simples por ID, do jeito que syncFromFirebase real faz hoje (ver
// investigacao: index.html — reconciled.push(l||r) por id) — usada aqui
// SOMENTE para montar o cenario de entrada antes de aplicar o motor real,
// nunca toca rede.
function unionByIdLikeSyncFromFirebase(local, remote) {
  const byId = new Map(local.map((e) => [e.id, e]));
  for (const entry of remote) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()];
}

test('SIMULACAO FIREBASE: remote com copia legacy historica e incorporada ao canonical sem reintroduzir uma segunda lesao', () => {
  const local = [{ id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['bem circunscrita'] }];
  const remote = [{ id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['esclerótica'] }];

  const unioned = unionByIdLikeSyncFromFirebase(local, remote);
  assert.equal(unioned.length, 2, 'pre-condicao: sem o fold, a uniao simples reintroduziria a duplicata');

  const result = engine.applyLegacyIdMigrationToState({ data: unioned, review: {}, srs: {} }, [OSTEOMA_RULE], REAL_SEED_BY_ID);
  assert.deepEqual(plain(result.state.data.map((e) => e.id)), ['seed_32']);
  assert.deepEqual(plain(result.state.data[0].tags).sort(), ['bem circunscrita', 'esclerótica']);
});

test('SIMULACAO FIREBASE: legacyId no remote representa a lesao LEGITIMA atual (id reaproveitado) — NAO tratada como historico', () => {
  const local = [{ ...REAL_SEED_BY_ID.get('seed_32') }];
  const remote = [{ ...REAL_SEED_BY_ID.get('seed_28') }]; // conteudo ATUAL e legitimo (Cisto aracnoide), nao o historico

  const unioned = unionByIdLikeSyncFromFirebase(local, remote);
  const result = engine.applyLegacyIdMigrationToState({ data: unioned, review: {}, srs: {} }, [OSTEOMA_RULE], REAL_SEED_BY_ID);

  const seed28Final = result.state.data.find((e) => e.id === 'seed_28');
  assert.ok(seed28Final, 'a lesao legitima reaproveitando o ID nao pode desaparecer');
  assert.equal(seed28Final.name, REAL_SEED_BY_ID.get('seed_28').name);
  assert.equal(result.state.data.find((e) => e.id === 'seed_32').name, 'Osteoma craniano');
  assert.equal(result.report.anomalies.length, 1);
  assert.equal(result.report.anomalies[0].reason, 'content_mismatch_id_reused');
});

// ===========================================================================
// TODO / SPEC — o que esta suite explicitamente NAO cobre ainda
// ===========================================================================

// ===========================================================================
// MOTOR V2 — RECONCILIADOR POR IDENTIDADE SEMANTICA (INERTE)
// ===========================================================================
// Diferente do V1 (mapa estatico de 126 pares legacyId->canonicalId), o V2
// nao usa NENHUMA tabela de deslocamento de IDs — a auditoria do catalogo
// completo (1213 registros) mostrou que o problema real (1001 mismatches)
// e' muito maior que os 126 pares cobertos pelo V1. O V2 reconstroi o
// catalogo inteiro a partir da identidade semantica (name+s+site).
// Extraido via vm da mesma forma que o motor V1 acima — codigo de PRODUCAO,
// mas 100% inerte (ver teste de call sites abaixo).

const V2_FUNCTION_NAMES = [
  'identityKeyOfV2',
  'buildSeedIdentityIndexV2',
  'mergeUnknownFieldsV2',
  'normalizeAltPlacementKeyV2',
  'mergeAltPlacementsV2',
  'foldDataEntriesByIdentityV2',
  'rewriteDataImagesOnlyV2',
  'mergeSeedIdentityWithDataV2',
  'rewriteImageOwnershipV2',
  'reconcileCatalogByIdentityV2'
];

function buildV2Engine() {
  const v2ExtractedFns = {};
  for (const name of V2_FUNCTION_NAMES) v2ExtractedFns[name] = extractFunction(html, name);

  // mergeUnknownFieldsV2 depende da constante de modulo V2_KNOWN_FIELDS
  // (declarada fora da funcao em index.html) — precisa ser extraida junto.
  const knownFieldsDecl = declarationsOf(html, 'V2_KNOWN_FIELDS');
  assert.equal(knownFieldsDecl.length, 1, 'V2_KNOWN_FIELDS deve ter uma unica declaracao');
  const knownFieldsEquals = html.indexOf('=', knownFieldsDecl[0].index);
  const knownFieldsSemicolon = html.indexOf(';', knownFieldsEquals);
  const knownFieldsSource = html.slice(knownFieldsDecl[0].index, knownFieldsSemicolon + 1);

  const sourceParts = [
    engineBuild.extractedFns.stableImageKeyV208.source,
    engineBuild.extractedFns.normalizeLegacyIdentity.source,
    engineBuild.extractedFns.mergeLegacyReview.source,
    engineBuild.extractedFns.mergeLegacySrs.source,
    engineBuild.extractedFns.mergeLegacyNotes.source,
    engineBuild.extractedFns.mergeLegacyTags.source,
    engineBuild.extractedFns.mergeLegacyLinks.source,
    engineBuild.extractedFns.rewriteMigratedImageOwner.source,
    engineBuild.extractedFns.mergeLegacyImages.source,
    engineBuild.extractedFns.mergeLegacyBaseFields.source,
    knownFieldsSource,
    v2ExtractedFns.identityKeyOfV2.source,
    v2ExtractedFns.buildSeedIdentityIndexV2.source,
    v2ExtractedFns.mergeUnknownFieldsV2.source,
    v2ExtractedFns.normalizeAltPlacementKeyV2.source,
    v2ExtractedFns.mergeAltPlacementsV2.source,
    v2ExtractedFns.foldDataEntriesByIdentityV2.source,
    v2ExtractedFns.rewriteDataImagesOnlyV2.source,
    v2ExtractedFns.mergeSeedIdentityWithDataV2.source,
    v2ExtractedFns.rewriteImageOwnershipV2.source,
    v2ExtractedFns.reconcileCatalogByIdentityV2.source,
    ...V2_FUNCTION_NAMES.map((name) => `globalThis.${name} = ${name};`)
  ];

  const context = vm.createContext({ console });
  new vm.Script(sourceParts.join('\n\n'), { filename: 'index.html:legacy-engine-v2' }).runInContext(context);
  return { context, extractedFns: v2ExtractedFns };
}

const v2EngineBuild = buildV2Engine();
const v2 = v2EngineBuild.context;

test('V2: motor real e localizado estaticamente no index.html, todas as funcoes extraidas', () => {
  for (const name of V2_FUNCTION_NAMES) {
    assert.ok(v2EngineBuild.extractedFns[name].line > 0, `${name} deveria ter sido localizado em index.html`);
    assert.equal(typeof v2[name], 'function', `${name} deveria ter sido extraido como funcao executavel`);
  }
});

// ---------------------------------------------------------------------------
// ALTERACAO 007 — a partir daqui reconcileCatalogByIdentityV2 deixa de ter
// ZERO call sites: ganha exatamente UM, dentro de reconcileV2Preview, que so'
// e' acionado pela ferramenta manual (botao "reconciliar catalogo V2"). O
// teste abaixo substitui o antigo "ZERO call sites" e prova as duas metades
// da garantia: (1) so' existe esse unico call site de producao, em nenhum
// outro lugar; (2) reconcileV2Preview/applyReconcileV2/openReconcileV2Modal
// NUNCA aparecem dentro de loadData, syncFromFirebase ou do handler de
// importacao — os tres fluxos automaticos que rodam sem acao manual do
// usuario.
// ---------------------------------------------------------------------------
test('V2 PASSO 14 (ALTERACAO 007): reconcileCatalogByIdentityV2 tem exatamente 1 call site de producao, dentro de reconcileV2Preview', () => {
  const fn = extractFunction(html, 'reconcileCatalogByIdentityV2');
  const mentions = callSitesOutsideDefinition(html, 'reconcileCatalogByIdentityV2', fn.index);
  const preview = extractFunction(html, 'reconcileV2Preview');
  const realCalls = mentions.filter((index) => index >= preview.index && index < preview.index + preview.source.length);
  const commentMentions = mentions.filter((index) => !realCalls.includes(index));

  assert.equal(realCalls.length, 1, `Esperava exatamente 1 chamada real (dentro de reconcileV2Preview), encontrei ${realCalls.length}`);
  for (const index of commentMentions) {
    const before = html.slice(Math.max(0, index - 400), index);
    const lastCommentOpen = before.lastIndexOf('/*');
    const lastCommentClose = before.lastIndexOf('*/');
    const lastLineStart = before.lastIndexOf('\n') + 1;
    const lineSoFar = html.slice(lastLineStart, index);
    const insideBlockComment = lastCommentOpen > lastCommentClose;
    const insideLineComment = /\/\//.test(lineSoFar);
    assert.ok(insideBlockComment || insideLineComment, `Mencao inesperada a reconcileCatalogByIdentityV2 fora de comentario e fora de reconcileV2Preview na linha ${lineNumberAt(html, index)}`);
  }
  console.log(`reconcileCatalogByIdentityV2: 1 definicao + 1 chamada real (em reconcileV2Preview) + ${commentMentions.length} mencao(oes) em comentario.`);
});

test('V2 PASSO 14 (ALTERACAO 007): reconcileV2Preview/applyReconcileV2/openReconcileV2Modal NUNCA aparecem em loadData, syncFromFirebase ou no handler de importacao', () => {
  const toolNames = ['reconcileV2Preview', 'applyReconcileV2', 'openReconcileV2Modal', 'downloadPreMigrationBackupV2', 'buildPreMigrationBackupV2', 'buildRealStateDiagnosticV2', 'openRealStateDiagnosticModal', 'buildPostApplyValidationReportV2', 'buildCheckpointIntegrityReportV2', 'buildCheckpointV2', 'downloadCheckpointV2', 'exportCheckpointV2', 'openExportCheckpointV2Modal'];
  const loadDataFn = extractFunction(html, 'loadData');
  const syncFn = extractFunction(html, 'syncFromFirebase');
  const importMarker = "document.getElementById('import-file').addEventListener('change', async (ev)=>";
  const importStart = html.indexOf(importMarker);
  assert.notEqual(importStart, -1, 'Handler de importacao nao encontrado');
  const importBrace = html.indexOf('{', importStart + importMarker.length);
  const importBody = extractBlock(html, importBrace);

  for (const name of toolNames) {
    assert.ok(!loadDataFn.source.includes(name), `${name} NAO pode ser mencionado dentro de loadData (fluxo automatico de inicializacao)`);
    assert.ok(!syncFn.source.includes(name), `${name} NAO pode ser mencionado dentro de syncFromFirebase (fluxo automatico de sincronizacao)`);
    assert.ok(!importBody.includes(name), `${name} NAO pode ser mencionado dentro do handler de importacao (fluxo automatico de importacao)`);
  }
});

test('V2 PASSO 14 (ALTERACAO 007): reconcileCatalogByIdentityV2 continua sem nenhuma chamada de Firebase/Firestore ou Cloudinary em toda a cadeia da ferramenta manual', () => {
  // Termos exatos de identificador — nunca aparecem como nome de campo de
  // imagem, entao substring simples e seguro pra estes.
  const forbiddenIdentifiers = ['pushToFirebase', 'pushToFirebaseNow', 'fbDb', 'fbAuth', 'getCloudinaryConfig', 'hasCloudinaryConfig', 'uploadToCloudinary'];
  // "cloudinary"/"Cloudinary" tambem aparecem em CAMPOS DE METADADO legitimos
  // de imagem (img.cloudinaryContext, img.source==='cloudinary') — ler esses
  // campos nao e' uma chamada de rede. So' bloqueia CHAMADA de funcao/endpoint
  // (ex.: api.cloudinary.com, ou qualquer identificador terminando em "(").
  const forbiddenCloudinaryCallPattern = /(api\.cloudinary\.com|\bcloudinary\w*\s*\()/i;
  const chain = ['classifyImageOwnershipDivergenceV2', 'buildImageOwnershipCorrectionPlanV2', 'applyImageOwnershipCorrectionV2', 'reconcileV2Preview', 'buildPreMigrationBackupV2', 'downloadPreMigrationBackupV2', 'applyReconcileV2', 'openReconcileV2Modal', 'openReconcileV2ResultModal', 'buildRealStateDiagnosticV2', 'openRealStateDiagnosticModal', 'buildPostApplyValidationReportV2', 'buildCheckpointIntegrityReportV2', 'buildCheckpointV2', 'downloadCheckpointV2', 'exportCheckpointV2', 'openExportCheckpointV2Modal'];
  for (const name of chain) {
    const fn = extractFunction(html, name);
    for (const term of forbiddenIdentifiers) {
      assert.ok(!fn.source.includes(term), `${name} NAO pode mencionar ${term}`);
    }
    assert.ok(!forbiddenCloudinaryCallPattern.test(fn.source), `${name} NAO pode chamar a API do Cloudinary (ler um campo de metadado como cloudinaryContext e' permitido, invocar o servico nao e')`);
  }
});

// ---- fixtures sinteticas: SEED pequeno cobrindo os cenarios pedidos ----
const V2_SEED_FIXTURE = [
  // identidade "Item Alfa" hoje mora em seed_47 (teste de registro deslocado simples)
  { id: 'seed_47', name: 'Item Alfa', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['esclerótica-seed'], links: [{ label: 'seed link', url: 'https://x/seed' }], images: [{ assetId: 'seed-asset', lesionId: 'seed_47', lesionName: 'Item Alfa' }], notes: 'nota seed 47 default' },
  // identidade "Osteoma craniano" hoje mora em seed_32 (usa os dados REAIS do SEED extraido de index.html)
  { ...REAL_SEED_BY_ID.get('seed_32'), tags: [], links: [], images: [], notes: '' },
  // seed_28 foi reaproveitado para outra identidade (dados REAIS do SEED)
  { ...REAL_SEED_BY_ID.get('seed_28'), tags: [], links: [], images: [], notes: '' },
  // identidade unica, sem duplicata, sem deslocamento
  { id: 'seed_99', name: 'Lesão única sem duplicata', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }
];

function buildV2StateFixture() {
  return {
    data: [
      { id: 'seed_10', name: 'Item Alfa', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['exclusiva-data'], links: [{ label: 'data link', url: 'https://x/data' }], images: [{ assetId: 'data-asset', lesionId: 'seed_10', lesionName: 'Item Alfa' }], notes: 'nota do usuário', _userUpdatedAt: 5000 },
      { id: 'seed_28', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: [], links: [], images: [], notes: 'cópia histórica presa em seed_28' },
      { id: 'seed_32', name: 'Osteoma craniano', s: 'Neurorradiologia', site: 'Crânio ósseo', tags: ['bem circunscrita'], links: [], images: [], notes: '' },
      { id: 'seed_777', name: 'Lesão que não existe mais', s: 'Nada', site: 'Nada', tags: [], links: [], images: [], notes: '' }
    ],
    review: { seed_10: 0, seed_32: 2, seed_480: 2 },
    srs: { seed_10: { interval: 3, streak: 1, updatedAt: 1000, due: 2000, lastGrade: 'easy' } }
  };
}

test('V2 teste 1/5: registro simples deslocado — conteúdo preservado no ID atual, identidade estrutural do SEED', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  const final = plain(result.state.data.find((e) => e.id === 'seed_47'));
  assert.ok(final, 'seed_47 deve existir no resultado');
  assert.equal(final.name, 'Item Alfa');
  assert.equal(final.notes, 'nota do usuário');
  assert.deepEqual(final.tags.sort(), ['esclerótica-seed', 'exclusiva-data'].sort());
  assert.equal(result.state.data.some((e) => e.id === 'seed_10'), false, 'seed_10 nao pode sobreviver como entrada separada');
});

test('V2 teste 2: REVIEW segue a identidade — sai de seed_10 e termina em seed_47, nunca fica em seed_10', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  assert.equal(result.state.review.seed_47, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.review, 'seed_10'), false);
});

test('V2 teste 3: SRS segue a identidade da mesma forma', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  assert.deepEqual(plain(result.state.srs.seed_47), { interval: 3, streak: 1, updatedAt: 1000, due: 2000, lastGrade: 'easy' });
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.srs, 'seed_10'), false);
});

test('V2 teste 4 OBRIGATORIO: ID reaproveitado (seed_28 real) — final NAO herda conteudo/REVIEW/SRS do Osteoma craniano', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  const seed28Final = result.state.data.find((e) => e.id === 'seed_28');
  assert.equal(seed28Final.name, REAL_SEED_BY_ID.get('seed_28').name, 'seed_28 deve conter a identidade ATUAL do SEED');
  assert.notEqual(seed28Final.name, 'Osteoma craniano');
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.review, 'seed_28'), false, 'seed_28 nao pode herdar REVIEW do Osteoma');
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.srs, 'seed_28'), false, 'seed_28 nao pode herdar SRS do Osteoma');
});

test('V2 teste 5: identidade ausente no DATA — materializa do SEED sem inventar conteúdo de usuário', () => {
  const stateWithoutSeed99 = buildV2StateFixture(); // nenhuma entrada com identidade "Lesão única sem duplicata"
  const result = v2.reconcileCatalogByIdentityV2(stateWithoutSeed99, V2_SEED_FIXTURE);
  const seed99Final = result.state.data.find((e) => e.id === 'seed_99');
  assert.ok(seed99Final);
  assert.deepEqual(plain(seed99Final.tags), []);
  assert.equal(seed99Final.notes, '');
  assert.ok(result.report.materializedFromSeed.some((m) => m.id === 'seed_99'));
});

test('V2 teste 6: duplicata conhecida — duas cópias convergem para o ID atual, preservando conteúdo por merge conservador', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  const seed32Final = result.state.data.find((e) => e.id === 'seed_32');
  assert.deepEqual(plain(seed32Final.tags), ['bem circunscrita']);
  const consolidated = result.report.consolidatedGroups.find((g) => g.finalId === 'seed_32');
  assert.ok(consolidated, 'seed_32 deve aparecer como grupo consolidado');
  assert.deepEqual(plain(consolidated.fromIds).sort(), ['seed_28', 'seed_32']);
});

test('V2 teste 7 (POLITICA CORRIGIDA): imagem — so a imagem do DATA real sobrevive, ownership reescrito para o ID/nome atual, identificador fisico preservado; a imagem SO-DO-SEED nao e materializada', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  const seed47Final = result.state.data.find((e) => e.id === 'seed_47');
  assert.equal(seed47Final.images.length, 1, 'DATA real (seed_10) e a UNICA fonte de verdade — a imagem exclusiva do SEED (seed-asset) nao pode ser materializada');
  assert.equal(seed47Final.images[0].assetId, 'data-asset', 'a imagem que sobrevive precisa ser a que ja existia no DATA real');
  assert.equal(seed47Final.images[0].lesionId, 'seed_47', 'ownership reescrito para a identidade final (registro estava preso em seed_10, um ID deslocado)');
  assert.equal(seed47Final.images[0].lesionName, 'Item Alfa');
  assert.ok(!seed47Final.images.some((i) => i.assetId === 'seed-asset'), 'seed-asset (imagem exclusiva do SEED, sem correspondente no DATA) nunca pode aparecer no resultado');
});

test('V2 teste 8 OBRIGATORIO: identidade sem SEED — anomaly, conteúdo preservado sem perda silenciosa', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  assert.equal(result.state.data.some((e) => e.id === 'seed_777'), false, 'nao pode entrar no catalogo final sem uma identidade valida do SEED');
  const anomaly = result.report.anomalies.find((a) => a.kind === 'data_identity_not_in_seed');
  assert.ok(anomaly, 'deve haver uma anomaly reportando a identidade ausente do SEED');
  const preserved = result.report.unreconciledEntries.find((u) => u.originalId === 'seed_777');
  assert.ok(preserved, 'o conteudo original de seed_777 deve estar preservado no relatorio, nunca descartado');
  assert.equal(preserved.entry.name, 'Lesão que não existe mais');
});

test('V2 teste 9 OBRIGATORIO: SEED com identidade duplicada — anomaly/abort seguro, sem escolha silenciosa', () => {
  const ambiguousSeed = [
    { id: 'seed_A1', name: 'Duplicata no Seed', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' },
    { id: 'seed_A2', name: 'Duplicata no Seed', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }
  ];
  const stateForAmbiguous = { data: [{ id: 'seed_A1', name: 'Duplicata no Seed', s: 'X', site: 'Y', tags: ['tag-usuario'], links: [], images: [], notes: 'nota do usuario' }], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(stateForAmbiguous, ambiguousSeed);

  assert.deepEqual(plain(result.state.data.map((e) => e.id)).sort(), ['seed_A1', 'seed_A2'], 'ambos os IDs ambiguos devem ser materializados isoladamente, sem fusao');
  const seed_A1_final = result.state.data.find((e) => e.id === 'seed_A1');
  assert.equal(seed_A1_final.notes, '', 'nao pode herdar conteudo do usuario silenciosamente numa identidade ambigua');
  assert.ok(result.report.anomalies.some((a) => a.kind === 'seed_identity_ambiguous'));
  const preserved = result.report.unreconciledEntries.find((u) => u.originalId === 'seed_A1');
  assert.ok(preserved, 'conteudo do usuario deve ficar preservado no relatorio, nunca perdido');
  assert.equal(preserved.entry.notes, 'nota do usuario');
});

test('V2 teste 10 OBRIGATORIO: REVIEW órfão seed_480 — não aplicado a nenhuma lesão, preservado/reportado', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  assert.deepEqual(plain(result.report.orphanReview), { seed_480: 2 });
  for (const entry of result.state.data) {
    assert.notEqual(entry.id, 'seed_480');
  }
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.review, 'seed_480'), false, 'orphan nunca deve aparecer no estado final aplicado');
});

test('V2 teste 11 OBRIGATORIO: idempotência — segunda execução produz exatamente o mesmo catálogo e estados', () => {
  const first = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  const second = v2.reconcileCatalogByIdentityV2(first.state, V2_SEED_FIXTURE);
  const sortById = (arr) => [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  assert.deepEqual(plain(sortById(second.state.data)), plain(sortById(first.state.data)));
  assert.deepEqual(plain(second.state.review), plain(first.state.review));
  assert.deepEqual(plain(second.state.srs), plain(first.state.srs));
  assert.equal(second.report.materializedFromSeed.length, 0, 'segunda execucao nao materializa nada novo');
  assert.equal(second.report.consolidatedGroups.length, 0, 'segunda execucao nao encontra mais duplicatas para consolidar');
});

test('V2: não muta os argumentos recebidos (state nem seed)', () => {
  const state = buildV2StateFixture();
  const seedCopy = plain(V2_SEED_FIXTURE);
  const stateSnapshot = plain(state);
  v2.reconcileCatalogByIdentityV2(state, V2_SEED_FIXTURE);
  assert.deepEqual(plain(state), stateSnapshot);
  assert.deepEqual(plain(V2_SEED_FIXTURE), seedCopy);
});

// ===========================================================================
// POLITICA DE IMAGENS CORRIGIDA — DATA real e' a UNICA fonte de verdade para
// associacoes de imagem do usuario; o SEED (fotografia congelada de um
// backup antigo) NUNCA cria/restaura uma imagem ausente no DATA atual. Ver
// rewriteDataImagesOnlyV2 (substitui mergeLegacyImages(seedEntry.images,...)
// no merge DATA vs SEED). Casos A-E pedidos explicitamente.
// ===========================================================================

test('POLITICA DE IMAGENS: mergeSeedIdentityWithDataV2 usa rewriteDataImagesOnlyV2 (DATA-only), nunca uma uniao com seedEntry.images', () => {
  const fn = extractFunction(html, 'mergeSeedIdentityWithDataV2');
  assert.ok(fn.source.includes('rewriteDataImagesOnlyV2'), 'precisa chamar rewriteDataImagesOnlyV2');
  assert.ok(!/mergeLegacyImages\s*\(\s*seedEntry\.images/.test(fn.source), 'nao pode mais unir imagens do SEED no merge DATA vs SEED');
});

test('POLITICA DE IMAGENS A: DATA sem imagem + SEED com imagem => resultado continua SEM imagem', () => {
  const seed = [{ id: 'seed_A', name: 'Lesão A', s: 'X', site: 'Y', images: [{ assetId: 'seed-only-asset', lesionId: 'seed_A', lesionName: 'Lesão A' }] }];
  const data = { data: [{ id: 'seed_A', name: 'Lesão A', s: 'X', site: 'Y', images: [] }], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(data, seed);
  const final = result.state.data.find((e) => e.id === 'seed_A');
  assert.deepEqual(plain(final.images), [], 'SEED nao pode materializar imagem ausente no DATA real');
});

test('POLITICA DE IMAGENS B: DATA com imagem + SEED sem imagem => imagem do DATA preservada', () => {
  const seed = [{ id: 'seed_B', name: 'Lesão B', s: 'X', site: 'Y' }];
  const data = { data: [{ id: 'seed_B', name: 'Lesão B', s: 'X', site: 'Y', images: [{ assetId: 'data-only-asset', lesionId: 'seed_B', lesionName: 'Lesão B' }] }], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(data, seed);
  const final = result.state.data.find((e) => e.id === 'seed_B');
  assert.equal(final.images.length, 1);
  assert.equal(final.images[0].assetId, 'data-only-asset');
});

test('POLITICA DE IMAGENS C: DATA e SEED com imagens diferentes => somente a associação do DATA real é preservada', () => {
  const seed = [{ id: 'seed_C', name: 'Lesão C', s: 'X', site: 'Y', images: [{ assetId: 'seed-c-asset', lesionId: 'seed_C', lesionName: 'Lesão C' }] }];
  const data = { data: [{ id: 'seed_C', name: 'Lesão C', s: 'X', site: 'Y', images: [{ assetId: 'data-c-asset', lesionId: 'seed_C', lesionName: 'Lesão C' }] }], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(data, seed);
  const final = result.state.data.find((e) => e.id === 'seed_C');
  assert.equal(final.images.length, 1, 'so a imagem do DATA real sobrevive, a do SEED e descartada');
  assert.equal(final.images[0].assetId, 'data-c-asset');
  assert.ok(!final.images.some((i) => i.assetId === 'seed-c-asset'));
});

test('POLITICA DE IMAGENS D: imagem presa num registro DATA com ID antigo/reutilizado acompanha a identidade semântica correta', () => {
  const seed = [{ id: 'seed_D_novo', name: 'Lesão D', s: 'X', site: 'Y' }];
  const data = { data: [{ id: 'seed_D_antigo', name: 'Lesão D', s: 'X', site: 'Y', images: [{ assetId: 'stale-asset', lesionId: 'seed_D_antigo', lesionName: 'Lesão D' }] }], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(data, seed);
  assert.equal(result.state.data.some((e) => e.id === 'seed_D_antigo'), false, 'o ID antigo nao pode sobreviver como entrada separada');
  const final = result.state.data.find((e) => e.id === 'seed_D_novo');
  assert.ok(final, 'a identidade deve ser encontrada sob o ID atual do SEED');
  assert.equal(final.images.length, 1);
  assert.equal(final.images[0].assetId, 'stale-asset', 'identificador fisico preservado');
  assert.equal(final.images[0].lesionId, 'seed_D_novo', 'ownership reescrito para o ID atual');
  assert.equal(final.images[0].lesionName, 'Lesão D');
});

test('POLITICA DE IMAGENS E: identidade sem NENHUM registro DATA (materializada do SEED) nunca herda imagem do SEED', () => {
  const seed = [{ id: 'seed_E', name: 'Lesão E sem DATA', s: 'X', site: 'Y', images: [{ assetId: 'seed-e-asset', lesionId: 'seed_E', lesionName: 'Lesão E sem DATA' }] }];
  const data = { data: [], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(data, seed);
  const final = result.state.data.find((e) => e.id === 'seed_E');
  assert.ok(final, 'a identidade e materializada a partir do SEED (name/s/site)');
  assert.deepEqual(plain(final.images), [], 'mas NENHUMA imagem pode ser materializada — DATA nao tinha nenhum registro pra essa identidade');
  assert.ok(result.report.materializedFromSeed.some((m) => m.id === 'seed_E'));
});

// ===========================================================================
// V2 TESTE 12 OBRIGATORIO — READ-ONLY COM O SNAPSHOT COMPLETO (1213 reais)
// ===========================================================================

function loadFullCatalogSnapshot() {
  const snapshotPath = path.resolve(__dirname, '..', 'snapshot-catalogo-completo-readonly.json');
  assert.ok(fs.existsSync(snapshotPath), 'snapshot-catalogo-completo-readonly.json deve existir na raiz do projeto (fixture read-only)');
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  return { raw, parsed: JSON.parse(raw) };
}

test('V2 TESTE 12: snapshot completo (1213) é usado apenas como fixture read-only, nunca sobrescrito', () => {
  const { raw, parsed } = loadFullCatalogSnapshot();
  assert.equal(parsed.type, 'full-catalog-readonly-snapshot');
  assert.equal(parsed.entries.length, 1213);
  assert.equal(Object.keys(parsed.review).length, 94);
  assert.equal(Object.keys(parsed.srs).length, 26);

  v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);

  const rawAfter = fs.readFileSync(path.resolve(__dirname, '..', 'snapshot-catalogo-completo-readonly.json'), 'utf8');
  assert.equal(rawAfter, raw, 'o arquivo do snapshot nao pode ser alterado por esta suite');
});

test('V2 TESTE 12: output tem exatamente uma entrada por identidade unica do SEED atual, nenhum ID/identidade duplicados', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);

  // NAO hardcoda 1213 como regra — compara contra o tamanho real do SEED extraido.
  assert.equal(result.state.data.length, REAL_SEED.length);

  const outIds = result.state.data.map((e) => e.id);
  assert.equal(new Set(outIds).size, outIds.length, 'nenhum ID final duplicado');

  const outIdentities = result.state.data.map((e) => v2.identityKeyOfV2(e));
  assert.equal(new Set(outIdentities).size, result.state.data.length, 'nenhuma identidade final duplicada');

  const seedIdentities = new Set(REAL_SEED.map((e) => v2.identityKeyOfV2(e)));
  for (const key of seedIdentities) assert.ok(new Set(outIdentities).has(key), `identidade do SEED ausente no output: ${key}`);

  assert.deepEqual(plain(result.report.unreconciledEntries), [], 'nenhuma identidade DATA conhecida pode ficar sem report/perdida (esperado 0 no catalogo real)');
  assert.deepEqual(plain(result.report.anomalies), [], 'nenhuma anomaly inesperada no catalogo real');
});

test('V2 TESTE 12: os 875 deslocamentos sao reconciliados e os 126 grupos duplicados sao consolidados', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);

  assert.equal(result.report.materializedFromSeed.length, 126, 'as 126 identidades ausentes do DATA devem ser materializadas do SEED');
  assert.equal(result.report.consolidatedGroups.length, 126, 'os 126 grupos duplicados conhecidos devem ser consolidados');
  // reconciled cobre TODAS as identidades que tinham pelo menos 1 fonte em DATA
  // (as 212 classe-A + as 875 deslocadas), ou seja, tudo exceto os 126 materializados.
  assert.equal(result.report.reconciled.length, REAL_SEED.length - 126);
});

test('V2 TESTE 12: REVIEW/SRS seguem as identidades corretas — Osteoma craniano, Pineocitoma, Cisto ganglionar', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);

  assert.equal(result.state.review.seed_32, 2, 'Osteoma craniano: max(0,2) = 2');
  assert.deepEqual(plain(result.state.srs.seed_32), { interval: 3, streak: 1, lastGrade: 'easy', updatedAt: 1789765201665, due: 1790024401665 }, 'SRS real do legacy (seed_28) deve ter sido transferido para seed_32');

  assert.equal(result.state.review.seed_24, 2, 'Pineocitoma: max(2,2) = 2');
  assert.deepEqual(plain(result.state.srs.seed_24), { streak: 1, due: 1790021364513, updatedAt: 1789762164513, lastGrade: 'easy', interval: 3 });

  assert.equal(result.state.review.seed_1282, 0);
  assert.deepEqual(plain(result.state.srs.seed_1282), { interval: 1, updatedAt: 1789765145869, due: 1789851545869, streak: 1, lastGrade: 'medium' });
});

test('V2 TESTE 12: seed_480 permanece órfão/reportado, nunca aplicado', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);

  assert.deepEqual(plain(result.report.orphanReview), { seed_480: 2 });
  assert.deepEqual(plain(result.report.orphanSrs), {});
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.review, 'seed_480'), false);
});

test('V2 TESTE 12: ownership de imagens final fica 100% consistente (0 mismatches)', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);

  let mismatches = 0;
  for (const entry of result.state.data) {
    for (const img of (entry.images || [])) {
      const custom = img.cloudinaryContext && img.cloudinaryContext.custom;
      if (img.lesionId !== undefined && img.lesionId !== entry.id) mismatches += 1;
      else if (custom && custom.lesion_id !== undefined && custom.lesion_id !== entry.id) mismatches += 1;
    }
  }
  assert.equal(mismatches, 0);
});

test('V2 TESTE 12: segunda execucao sobre o resultado real (1213) e idempotente', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const first = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  const second = v2.reconcileCatalogByIdentityV2(first.state, REAL_SEED);
  const sortById = (arr) => [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

  assert.deepEqual(plain(sortById(second.state.data)), plain(sortById(first.state.data)));
  assert.deepEqual(plain(second.state.review), plain(first.state.review));
  assert.deepEqual(plain(second.state.srs), plain(first.state.srs));
  assert.equal(second.report.materializedFromSeed.length, 0);
  assert.equal(second.report.consolidatedGroups.length, 0);
});

// ===========================================================================
// V2 HARDENING — safeToApply, provenance, blocking, campos desconhecidos
// ===========================================================================
// Estes testes cobrem os campos NOVOS adicionados ao relatorio do V2 nesta
// etapa (safeToApply/safeToApplyReasons, provenance, blocking em cada
// conflict) e fecham lacunas de cobertura que os testes 1-12 acima nao
// exercitavam: campos desconhecidos (mergeUnknownFieldsV2), img/localImg
// divergentes, deduplicacao de imagens por stable key com complemento de
// metadados, imagens fisicamente distintas nunca colapsando, e a
// contabilidade explicita de REVIEW/SRS (valor 0 vs ausente, colisao SRS).
// Nenhum teste aqui altera o motor V1 nem seus testes.

function buildHardeningSeedFixture() {
  return [
    { id: 'seed_h1', name: 'Hardening Alfa', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' },
    { id: 'seed_h2', name: 'Hardening Beta', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' },
    { id: 'seed_h3', name: 'Hardening Gama', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }
  ];
}

test('V2 hardening: toda entrada de conflicts tem "blocking" booleano explicito (nunca undefined)', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  assert.ok(result.report.conflicts.length > 0, 'o catalogo real deve produzir ao menos 1 conflict (Osteoma craniano) para este teste ser significativo');
  for (const c of result.report.conflicts) {
    assert.equal(typeof c.blocking, 'boolean', `conflict sem blocking booleano: ${JSON.stringify(c)}`);
  }
});

test('V2 hardening: safeToApply e safeToApplyReasons no catalogo real (1213) — true, [] (nao hardcoded, computado)', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  assert.equal(result.report.anomalies.length, 0);
  assert.equal(result.report.unreconciledEntries.length, 0);
  assert.equal(result.report.unresolvedReview.length, 0);
  assert.equal(result.report.unresolvedSrs.length, 0);
  assert.equal(result.report.conflicts.filter((c) => c.blocking).length, 0, 'o unico conflict real (review, Osteoma) e blocking:false');
  assert.equal(result.report.safeToApply, true);
  assert.deepEqual(plain(result.report.safeToApplyReasons), []);
});

test('V2 hardening: safeToApply e FALSE quando ha anomaly (data_identity_not_in_seed) — fixture sintetica com seed_777', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  assert.ok(result.report.anomalies.length > 0);
  assert.equal(result.report.safeToApply, false);
  assert.ok(result.report.safeToApplyReasons.some((r) => r.includes('anomaly')));
  assert.ok(result.report.safeToApplyReasons.some((r) => r.includes('unreconciledEntries')));
});

test('V2 hardening: safeToApply e FALSE quando ha conflito BLOQUEANTE (notes divergentes sem timestamp confiavel)', () => {
  const seed = buildHardeningSeedFixture();
  const state = {
    data: [
      { id: 'seed_h1', name: 'Hardening Alfa', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: 'versao A da nota' },
      { id: 'seed_zzz_1', name: 'Hardening Alfa', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: 'versao B da nota' }
    ],
    review: {}, srs: {}
  };
  // as duas copias tem a MESMA identidade (Hardening Alfa) mas nenhum _userUpdatedAt
  // confiavel para desempatar as notas -> mergeLegacyNotes reporta conflito bloqueante.
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const blocking = result.report.conflicts.filter((c) => c.blocking);
  assert.ok(blocking.length > 0, 'deve haver ao menos 1 conflito bloqueante (notes sem timestamp)');
  assert.ok(blocking.every((c) => c.kind === 'notes' && c.reason === 'notes_conflict_unresolved_no_timestamp'));
  assert.equal(result.report.safeToApply, false);
  assert.ok(result.report.safeToApplyReasons.some((r) => r.includes('BLOQUEANTE')));
});

test('V2 hardening: safeToApply e TRUE numa fixture totalmente segura (sem anomaly, sem conflito bloqueante, cobertura completa)', () => {
  const seed = buildHardeningSeedFixture();
  const state = {
    data: [
      { id: 'seed_h1', name: 'Hardening Alfa', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: 'nota unica' }
    ],
    review: { seed_h1: 1 },
    srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  assert.deepEqual(plain(result.report.safeToApplyReasons), []);
  assert.equal(result.report.safeToApply, true);
});

test('V2 hardening: provenance cobre exatamente 1 entrada por identidade do SEED, com origin correto (materialized/single/consolidated)', () => {
  const result = v2.reconcileCatalogByIdentityV2(buildV2StateFixture(), V2_SEED_FIXTURE);
  assert.equal(result.report.provenance.length, V2_SEED_FIXTURE.length);
  const bySeedId = new Map(result.report.provenance.map((p) => [p.finalId, p]));

  const alfa = bySeedId.get('seed_47');
  assert.equal(alfa.origin, 'single_source_reconciled');
  assert.deepEqual(plain(alfa.sourceIds), ['seed_10']);

  const osteoma = bySeedId.get('seed_32');
  assert.equal(osteoma.origin, 'duplicate_consolidated');
  assert.deepEqual(plain(osteoma.sourceIds).sort(), ['seed_28', 'seed_32']);
  assert.deepEqual(plain(osteoma.reviewContributors), ['seed_32']);

  const semDuplicata = bySeedId.get('seed_99');
  assert.equal(semDuplicata.origin, 'materialized_from_seed');
  assert.deepEqual(plain(semDuplicata.sourceIds), []);
});

test('V2 hardening: provenance no catalogo real tem tamanho == SEED.length e nenhum finalId repetido', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  assert.equal(result.report.provenance.length, REAL_SEED.length);
  const finalIds = result.report.provenance.map((p) => p.finalId);
  assert.equal(new Set(finalIds).size, finalIds.length);
});

test('V2 hardening: distincao explicita alreadyAtCorrectId vs displacedFromIds no catalogo real (nao lumped)', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  const alreadyCorrect = result.report.reconciled.filter((r) => r.alreadyAtCorrectId);
  const displaced = result.report.reconciled.filter((r) => r.displacedFromIds.length > 0);
  // numeros exatos estabelecidos pela auditoria completa do catalogo (classe A / classe B);
  // nao hardcoded como premissa do motor — comparados aqui contra o resultado real do proprio V2.
  assert.equal(alreadyCorrect.length, 212, 'classe A: identidades cujo DATA ja estava no ID atual do SEED');
  assert.ok(displaced.length >= 875, 'classe B: identidades com pelo menos 1 copia deslocada (inclui os 126 pares consolidados, que tem 1 lado correto + 1 deslocado)');
  for (const r of result.report.reconciled) {
    assert.equal(typeof r.alreadyAtCorrectId, 'boolean');
    assert.ok(Array.isArray(r.displacedFromIds));
  }
});

test('V2 hardening: mergeUnknownFieldsV2 preserva campo desconhecido ESCALAR presente em apenas um lado', () => {
  const primary = { id: 'a', foo: undefined };
  const secondary = { id: 'a', foo: 'valor-desconhecido' };
  const merged = { id: 'a' };
  const conflicts = [];
  v2.mergeUnknownFieldsV2(merged, primary, secondary, conflicts, { identityKey: 'k' });
  assert.equal(merged.foo, 'valor-desconhecido');
  assert.equal(conflicts.length, 0);
});

test('V2 hardening: mergeUnknownFieldsV2 preserva campo desconhecido OBJETO presente em apenas um lado', () => {
  const primary = { id: 'a' };
  const secondary = { id: 'a', metaObj: { origem: 'legado', versao: 3 } };
  const merged = { id: 'a' };
  const conflicts = [];
  v2.mergeUnknownFieldsV2(merged, primary, secondary, conflicts, { identityKey: 'k' });
  assert.deepEqual(plain(merged.metaObj), { origem: 'legado', versao: 3 });
  assert.equal(conflicts.length, 0);
});

test('V2 hardening: mergeUnknownFieldsV2 preserva campo desconhecido ARRAY presente em apenas um lado', () => {
  const primary = { id: 'a', historico: ['evento1', 'evento2'] };
  const secondary = { id: 'a' };
  // 'merged' comeca como {...primary} (mesmo padrao de mergeLegacyBaseFields
  // em producao) — quando o campo desconhecido ja esta so' no primary, ele
  // sobrevive pelo spread inicial; mergeUnknownFieldsV2 so' precisa NAO
  // apagar/sobrescrever isso (o que este teste confirma).
  const merged = { ...primary };
  const conflicts = [];
  v2.mergeUnknownFieldsV2(merged, primary, secondary, conflicts, { identityKey: 'k' });
  assert.deepEqual(plain(merged.historico), ['evento1', 'evento2']);
  assert.equal(conflicts.length, 0);
});

test('V2 hardening: mergeUnknownFieldsV2 reporta conflito (nunca escolhe silenciosamente) quando os dois lados divergem', () => {
  const primary = { id: 'a', campoFuturo: 'valor-primary' };
  const secondary = { id: 'a', campoFuturo: 'valor-secondary' };
  const merged = { id: 'a', campoFuturo: 'valor-primary' };
  const conflicts = [];
  v2.mergeUnknownFieldsV2(merged, primary, secondary, conflicts, { identityKey: 'k', finalId: 'seed_x' });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, 'unknown_field');
  assert.equal(conflicts[0].blocking, false);
  assert.equal(conflicts[0].field, 'campoFuturo');
  assert.equal(conflicts[0].primaryValue, 'valor-primary');
  assert.equal(conflicts[0].secondaryValue, 'valor-secondary');
  // nenhum dos dois valores originais foi descartado sem chance de aparecer:
  // o valor de 'primary' venceu deterministicamente em 'merged' (regra ja
  // testada em mergeLegacyBaseFields/spread inicial) E o de 'secondary'
  // ficou visivel no proprio conflict reportado.
  assert.equal(merged.campoFuturo, 'valor-primary');
});

test('V2 hardening: classification divergente entre 2 copias DATA da mesma identidade vira conflict D (base_field), blocking:false, nunca escolha silenciosa', () => {
  const seed = [{ id: 'seed_hc', name: 'Hardening Classificacao', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [
      { id: 'seed_hc', name: 'Hardening Classificacao', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', classification: 'LUNGRADS', _userUpdatedAt: 100 },
      { id: 'seed_zzz_2', name: 'Hardening Classificacao', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', classification: 'NODERADS', _userUpdatedAt: 50 }
    ],
    review: {}, srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const conflict = result.report.conflicts.find((c) => c.kind === 'base_field' && c.field === 'classification');
  assert.ok(conflict, 'divergencia de classification entre 2 copias DATA deve gerar conflict reportado');
  assert.equal(conflict.blocking, false);
  const final = result.state.data.find((e) => e.id === 'seed_hc');
  // desempate deterministico ja testado (maior _userUpdatedAt primeiro) — o
  // motor NUNCA decide qual classificacao medica esta correta, so' aplica a
  // MESMA regra de prioridade usada para todos os demais campos base.
  assert.equal(final.classification, 'LUNGRADS');
  assert.ok([conflict.canonicalValue, conflict.legacyValue].includes('NODERADS'), 'o valor perdedor continua visivel no conflict, nunca some sem rastro');
});

function altPlacementKeys(list) {
  return (list || []).map((item) => v2.normalizeAltPlacementKeyV2(item));
}

test('V2 altPlacements 1: valores somente no primeiro lado sao preservados integralmente', () => {
  const input = [{ s: 'Neuro', site: 'A', extra: { origem: 'DATA' } }];
  const conflicts = [];
  const merged = v2.mergeAltPlacementsV2(input, undefined, conflicts, { identityKey: 'k' });
  assert.deepEqual(plain(merged), input);
  assert.deepEqual(plain(conflicts), []);
});

test('V2 altPlacements 2: valores somente no segundo lado sao preservados integralmente', () => {
  const input = [{ s: 'Torax', site: 'B', enabled: false }];
  const conflicts = [];
  const merged = v2.mergeAltPlacementsV2(null, input, conflicts, { identityKey: 'k' });
  assert.deepEqual(plain(merged), input);
  assert.deepEqual(plain(conflicts), []);
});

test('V2 altPlacements 3: associacoes semanticamente equivalentes sao deduplicadas sem normalizar a representacao original', () => {
  const conflicts = [];
  const merged = v2.mergeAltPlacementsV2(
    [{ s: '  Neurorradiologia ', site: 'Crânio   ósseo', origem: 'DATA' }],
    [{ s: 'neurorradiologia', site: 'crânio ósseo', origem: 'DATA' }],
    conflicts,
    { identityKey: 'k' }
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].s, '  Neurorradiologia ');
  assert.equal(merged[0].site, 'Crânio   ósseo');
  assert.equal(v2.normalizeAltPlacementKeyV2(merged[0]), 'neurorradiologia|||crânio ósseo');
  assert.deepEqual(plain(conflicts), []);
});

test('V2 altPlacements 4: associacoes diferentes fazem uniao sem conflito artificial', () => {
  const conflicts = [];
  const merged = v2.mergeAltPlacementsV2(
    [{ s: 'Tórax', site: 'B' }],
    [{ s: 'Neuro', site: 'A' }],
    conflicts,
    { identityKey: 'k' }
  );
  assert.deepEqual(plain(altPlacementKeys(merged)), ['neuro|||a', 'tórax|||b']);
  assert.deepEqual(plain(conflicts), []);
});

test('V2 altPlacements 5: mesma associacao com metadados complementares faz merge recursivo sem perda', () => {
  const conflicts = [];
  const merged = v2.mergeAltPlacementsV2(
    [{ s: 'Neuro', site: 'A', source: 'DATA', enabled: false, meta: { owner: 'usuario' }, markers: [{ code: 'a' }] }],
    [{ s: ' neuro ', site: ' a ', confidence: 0, meta: { reviewer: 'auditoria' }, markers: [{ code: 'b' }] }],
    conflicts,
    { identityKey: 'k' }
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'DATA');
  assert.equal(merged[0].enabled, false);
  assert.equal(merged[0].confidence, 0);
  assert.deepEqual(plain(merged[0].meta), { owner: 'usuario', reviewer: 'auditoria' });
  assert.deepEqual(plain(merged[0].markers), [{ code: 'a' }, { code: 'b' }]);
  assert.deepEqual(plain(conflicts), []);
});

test('V2 altPlacements 6: metadado escalar incompatível usa prioridade deterministica e registra ambos os valores', () => {
  const conflicts = [];
  const merged = v2.mergeAltPlacementsV2(
    [{ s: 'Neuro', site: 'A', label: 'valor-primary', enabled: false }],
    [{ s: 'neuro', site: 'a', label: 'valor-secondary', enabled: true }],
    conflicts,
    { identityKey: 'k', finalId: 'seed_hap' }
  );
  assert.equal(merged[0].label, 'valor-primary');
  assert.equal(merged[0].enabled, false, 'false e metadado explicito, nunca ausencia');
  assert.equal(conflicts.length, 2);
  for (const conflict of conflicts) {
    assert.equal(conflict.kind, 'alt_placement');
    assert.equal(conflict.blocking, false);
    assert.equal(conflict.reason, 'alt_placement_metadata_conflict_resolved_by_priority');
    assert.ok(Object.prototype.hasOwnProperty.call(conflict, 'primaryValue'));
    assert.ok(Object.prototype.hasOwnProperty.call(conflict, 'secondaryValue'));
    assert.ok(Object.prototype.hasOwnProperty.call(conflict, 'resolvedValue'));
  }
});

test('V2 altPlacements 7/8: nenhuma associacao valida se perde e a ordem final independe da ordem de entrada', () => {
  const a = [{ s: 'Zeta', site: '3' }, { s: 'Beta', site: '2' }, { s: 'Alfa', site: '1' }];
  const b = [{ s: 'Gama', site: '4' }, { s: ' beta ', site: ' 2 ' }];
  const first = v2.mergeAltPlacementsV2(a, b, [], { identityKey: 'k' });
  const second = v2.mergeAltPlacementsV2([...a].reverse(), [...b].reverse(), [], { identityKey: 'k' });
  assert.deepEqual(plain(altPlacementKeys(first)), ['alfa|||1', 'beta|||2', 'gama|||4', 'zeta|||3']);
  assert.deepEqual(plain(second), plain(first));
});

test('V2 altPlacements 9: merge e reconciliacao sao idempotentes', () => {
  const seed = [{ id: 'seed_hap', name: 'Hardening AltPlacements', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', altPlacements: [{ s: 'Neuro', site: 'A', meta: { seed: true } }] }];
  const state = { data: [{ id: 'seed_old', name: 'Hardening AltPlacements', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', altPlacements: [{ s: ' neuro ', site: ' a ', meta: { data: true } }, { s: 'Tórax', site: 'B' }] }], review: {}, srs: {} };
  const first = v2.reconcileCatalogByIdentityV2(state, seed);
  const second = v2.reconcileCatalogByIdentityV2(first.state, seed);
  assert.deepEqual(plain(second.state), plain(first.state));
  assert.deepEqual(plain(second.report.safeToApplyReasons), plain(first.report.safeToApplyReasons));
});

test('V2 altPlacements 10: ausencia, undefined, null e array vazio sao tratados como ausencia segura', () => {
  const cases = [
    [undefined, undefined],
    [null, undefined],
    [[], null],
    [[], undefined]
  ];
  for (const [primary, secondary] of cases) {
    const conflicts = [];
    assert.deepEqual(plain(v2.mergeAltPlacementsV2(primary, secondary, conflicts, { identityKey: 'k' })), []);
    assert.deepEqual(plain(conflicts), []);
  }
  const placement = [{ s: 'Neuro', site: 'A' }];
  assert.deepEqual(plain(v2.mergeAltPlacementsV2(placement, [], [], { identityKey: 'k' })), placement);
  assert.deepEqual(plain(v2.mergeAltPlacementsV2([], placement, [], { identityKey: 'k' })), placement);
});

test('V2 altPlacements 11: incompatibilidade estrutural e identidade incompleta bloqueiam safeToApply', () => {
  const seed = [{ id: 'seed_hap', name: 'Hardening AltPlacements', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', altPlacements: [{ s: 'Neuro', site: 'A', meta: 'texto' }] }];
  const state = {
    data: [{ id: 'seed_hap', name: 'Hardening AltPlacements', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', altPlacements: [{ s: 'Neuro', site: 'A', meta: { origem: 'DATA' } }, { s: 'Sem site' }] }],
    review: {}, srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const blocking = result.report.conflicts.filter((c) => c.kind === 'alt_placement' && c.blocking);
  assert.equal(blocking.length, 2);
  assert.ok(blocking.some((c) => c.reason === 'alt_placement_metadata_conflict_unresolved'));
  assert.ok(blocking.some((c) => c.reason === 'alt_placement_sem_identidade_semantica'));
  assert.equal(result.report.safeToApply, false);
  assert.ok(result.report.safeToApplyReasons.some((r) => r.includes('BLOQUEANTE')));
});

test('V2 altPlacements 12: snapshot real preserva toda associacao de DATA e SEED pela identidade semantica', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  const expectedByIdentity = new Map();
  let dataPlacementsBefore = 0;
  let seedPlacementsBefore = 0;

  const collect = (entries, counterName) => {
    for (const entry of entries) {
      const identityKey = v2.identityKeyOfV2(entry);
      if (!expectedByIdentity.has(identityKey)) expectedByIdentity.set(identityKey, new Set());
      for (const placement of (Array.isArray(entry.altPlacements) ? entry.altPlacements : [])) {
        if (counterName === 'data') dataPlacementsBefore += 1;
        else seedPlacementsBefore += 1;
        expectedByIdentity.get(identityKey).add(v2.normalizeAltPlacementKeyV2(placement));
      }
    }
  };
  collect(parsed.entries, 'data');
  collect(REAL_SEED, 'seed');

  let expectedUnique = 0;
  let outputPlacements = 0;
  const outputByIdentity = new Map();
  for (const entry of result.state.data) {
    const keys = new Set(altPlacementKeys(entry.altPlacements));
    outputByIdentity.set(v2.identityKeyOfV2(entry), keys);
    outputPlacements += keys.size;
  }
  for (const [identityKey, expectedKeys] of expectedByIdentity) {
    expectedUnique += expectedKeys.size;
    const outputKeys = outputByIdentity.get(identityKey) || new Set();
    for (const key of expectedKeys) assert.ok(outputKeys.has(key), `altPlacement perdido para ${identityKey}: ${key}`);
  }

  assert.equal(outputPlacements, expectedUnique, 'output deve conter exatamente a uniao semantica DATA+SEED, sem perda nem duplicacao');
  assert.equal(result.report.conflicts.filter((c) => c.kind === 'alt_placement').length, 0);
  assert.equal(result.report.conflicts.filter((c) => c.blocking).length, 0);
  assert.equal(result.report.safeToApply, true);
  console.log(`altPlacements snapshot: DATA=${dataPlacementsBefore}, SEED=${seedPlacementsBefore}, uniaoSemantica=${expectedUnique}, final=${outputPlacements}, conflitos=0`);
});

test('V2 auditoria consolidada: snapshot real reporta todas as metricas de conservacao', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const result = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  const finalIds = result.state.data.map((entry) => entry.id);
  const finalIdentityKeys = new Set(result.state.data.map((entry) => v2.identityKeyOfV2(entry)));
  const seedIdentityKeys = new Set(REAL_SEED.map((entry) => v2.identityKeyOfV2(entry)));
  const seedIdByIdentity = new Map(REAL_SEED.map((entry) => [v2.identityKeyOfV2(entry), entry.id]));
  const originallyCorrect = parsed.entries.filter((entry) => seedIdByIdentity.get(v2.identityKeyOfV2(entry)) === entry.id).length;
  const displacedRecords = parsed.entries.filter((entry) => seedIdByIdentity.get(v2.identityKeyOfV2(entry)) !== entry.id).length;
  const countImages = (entries) => entries.reduce((total, entry) => total + (Array.isArray(entry.images) ? entry.images.length : 0), 0);
  const countAltPlacements = (entries) => entries.reduce((total, entry) => total + (Array.isArray(entry.altPlacements) ? entry.altPlacements.length : 0), 0);
  // POLITICA DE IMAGENS CORRIGIDA: DATA real e' a UNICA fonte de verdade
  // para associacoes de imagem — o SEED nunca contribui uma imagem que o
  // DATA atual nao tem (ver rewriteDataImagesOnlyV2). Por isso, diferente
  // da versao anterior deste teste, NAO existe mais uma "uniao DATA+SEED"
  // esperada — a expectativa e' exatamente o conjunto DATA-only, e nenhuma
  // associacao exclusiva do SEED pode vazar pro resultado final.
  const dataOnlyImageAssociations = new Set();
  for (const entry of parsed.entries) {
    const identityKey = v2.identityKeyOfV2(entry);
    for (const image of (entry.images || [])) {
      const imageKey = engine.stableImageKeyV208(image);
      if (imageKey) dataOnlyImageAssociations.add(`${identityKey}|||${imageKey}`);
    }
  }
  const seedOnlyImageAssociations = new Set();
  for (const entry of REAL_SEED) {
    const identityKey = v2.identityKeyOfV2(entry);
    for (const image of (entry.images || [])) {
      const imageKey = engine.stableImageKeyV208(image);
      if (imageKey) seedOnlyImageAssociations.add(`${identityKey}|||${imageKey}`);
    }
  }
  const seedExclusiveImageAssociations = [...seedOnlyImageAssociations].filter((a) => !dataOnlyImageAssociations.has(a));
  const finalImageAssociations = new Set();
  let ownershipMismatches = 0;
  for (const entry of result.state.data) {
    for (const image of (entry.images || [])) {
      const imageKey = engine.stableImageKeyV208(image);
      if (imageKey) finalImageAssociations.add(`${v2.identityKeyOfV2(entry)}|||${imageKey}`);
      const custom = image.cloudinaryContext && image.cloudinaryContext.custom;
      if (image.lesionId !== undefined && image.lesionId !== entry.id) ownershipMismatches += 1;
      if (custom && custom.lesion_id !== undefined && custom.lesion_id !== entry.id) ownershipMismatches += 1;
    }
  }
  const seedExclusiveLeaked = seedExclusiveImageAssociations.filter((a) => finalImageAssociations.has(a)).length;

  const audit = {
    seedTotal: REAL_SEED.length,
    dataBefore: parsed.entries.length,
    dataAfter: result.state.data.length,
    uniqueFinalIds: new Set(finalIds).size,
    seedIdentityCoverage: [...seedIdentityKeys].filter((key) => finalIdentityKeys.has(key)).length,
    originallyCorrect,
    displacedRecords,
    displacedIdentities: result.report.reconciled.filter((entry) => entry.displacedFromIds.length > 0).length,
    materializedFromSeed: result.report.materializedFromSeed.length,
    duplicateGroups: result.report.consolidatedGroups.length,
    reviewBefore: Object.keys(parsed.review).length,
    reviewAfter: Object.keys(result.state.review).length,
    srsBefore: Object.keys(parsed.srs).length,
    srsAfter: Object.keys(result.state.srs).length,
    orphanReview: Object.keys(result.report.orphanReview),
    orphanSrs: Object.keys(result.report.orphanSrs),
    imagesBefore: countImages(parsed.entries),
    imagesSeedBefore: countImages(REAL_SEED),
    uniqueImageAssociationsDataOnly: dataOnlyImageAssociations.size,
    seedExclusiveImageAssociations: seedExclusiveImageAssociations.length,
    imagesAfter: countImages(result.state.data),
    uniqueImageAssociationsAfter: finalImageAssociations.size,
    seedExclusiveLeaked,
    ownershipMismatches,
    altPlacementsDataBefore: countAltPlacements(parsed.entries),
    altPlacementsSeedBefore: countAltPlacements(REAL_SEED),
    altPlacementsAfter: countAltPlacements(result.state.data),
    altPlacementConflicts: result.report.conflicts.filter((conflict) => conflict.kind === 'alt_placement').length,
    conflictsTotal: result.report.conflicts.length,
    blockingConflicts: result.report.conflicts.filter((conflict) => conflict.blocking).length,
    anomalies: result.report.anomalies.length,
    unreconciledEntries: result.report.unreconciledEntries.length,
    unresolvedReview: result.report.unresolvedReview.length,
    unresolvedSrs: result.report.unresolvedSrs.length,
    safeToApply: result.report.safeToApply,
    safeToApplyReasons: plain(result.report.safeToApplyReasons)
  };

  assert.equal(audit.seedTotal, 1213);
  assert.equal(audit.dataBefore, 1213);
  assert.equal(audit.dataAfter, 1213);
  assert.equal(audit.uniqueFinalIds, 1213);
  assert.equal(audit.seedIdentityCoverage, 1213);
  assert.equal(audit.originallyCorrect, 212);
  assert.equal(audit.displacedRecords, 1001);
  assert.equal(audit.displacedIdentities, 1001);
  assert.equal(audit.materializedFromSeed, 126);
  assert.equal(audit.duplicateGroups, 126);
  assert.deepEqual(audit.orphanReview, ['seed_480']);
  assert.deepEqual(audit.orphanSrs, []);
  assert.equal(audit.reviewBefore, 94);
  assert.equal(audit.reviewAfter, 89);
  assert.equal(audit.srsBefore, 26);
  assert.equal(audit.srsAfter, 26);
  assert.equal(audit.imagesBefore, 102);
  assert.equal(audit.imagesSeedBefore, 68);
  assert.equal(audit.uniqueImageAssociationsDataOnly, 63);
  assert.equal(audit.seedExclusiveImageAssociations, 10, '10 associacoes de imagem existem SOMENTE no SEED (nao no DATA real) — precisam ficar de fora do resultado');
  assert.equal(audit.imagesAfter, 63, 'apos a correcao, so as imagens do DATA real sobrevivem — nao mais a uniao com o SEED (era 73 antes da correcao)');
  assert.equal(audit.uniqueImageAssociationsAfter, 63);
  for (const association of dataOnlyImageAssociations) assert.ok(finalImageAssociations.has(association), `associacao de imagem do DATA real perdida: ${association}`);
  assert.equal(audit.seedExclusiveLeaked, 0, 'NENHUMA associacao exclusiva do SEED pode vazar pro resultado final');
  assert.equal(audit.ownershipMismatches, 0);
  assert.equal(audit.altPlacementConflicts, 0);
  assert.equal(audit.blockingConflicts, 0);
  assert.equal(audit.anomalies, 0);
  assert.equal(audit.unreconciledEntries, 0);
  assert.equal(audit.unresolvedReview, 0);
  assert.equal(audit.unresolvedSrs, 0);
  assert.equal(audit.safeToApply, true);
  assert.deepEqual(audit.safeToApplyReasons, []);
  console.log(`V2_AUDIT ${JSON.stringify(audit)}`);
});

test('V2 hardening: img divergente entre 2 copias DATA gera conflict D (base_field), nenhum valor descartado sem rastro', () => {
  const seed = [{ id: 'seed_himg', name: 'Hardening Img', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [
      { id: 'seed_himg', name: 'Hardening Img', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', img: 'imgA.png', _userUpdatedAt: 200 },
      { id: 'seed_zzz_4', name: 'Hardening Img', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', img: 'imgB.png', _userUpdatedAt: 100 }
    ],
    review: {}, srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const conflict = result.report.conflicts.find((c) => c.kind === 'base_field' && c.field === 'img');
  assert.ok(conflict, 'img divergente deve gerar conflict');
  assert.equal(conflict.blocking, false);
  assert.ok([conflict.canonicalValue, conflict.legacyValue].includes('imgA.png'));
  assert.ok([conflict.canonicalValue, conflict.legacyValue].includes('imgB.png'));
});

test('V2 hardening: localImg divergente entre 2 copias DATA gera conflict D (base_field), nenhum valor descartado sem rastro', () => {
  const seed = [{ id: 'seed_hlimg', name: 'Hardening LocalImg', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [
      { id: 'seed_hlimg', name: 'Hardening LocalImg', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', localImg: 'local-a.png', _userUpdatedAt: 200 },
      { id: 'seed_zzz_5', name: 'Hardening LocalImg', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '', localImg: 'local-b.png', _userUpdatedAt: 100 }
    ],
    review: {}, srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const conflict = result.report.conflicts.find((c) => c.kind === 'base_field' && c.field === 'localImg');
  assert.ok(conflict, 'localImg divergente deve gerar conflict');
  assert.equal(conflict.blocking, false);
  assert.ok([conflict.canonicalValue, conflict.legacyValue].includes('local-a.png'));
  assert.ok([conflict.canonicalValue, conflict.legacyValue].includes('local-b.png'));
});

test('V2 hardening: mesma imagem fisica (mesma stable key) em 2 copias com metadados complementares colapsa em 1, sem perder metadado exclusivo de nenhum lado', () => {
  const seed = [{ id: 'seed_himgdup', name: 'Hardening ImgDup', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [
      { id: 'seed_himgdup', name: 'Hardening ImgDup', s: 'X', site: 'Y', tags: [], links: [], images: [{ assetId: 'ativo-fisico-1', width: 800 }], notes: '' },
      { id: 'seed_zzz_6', name: 'Hardening ImgDup', s: 'X', site: 'Y', tags: [], links: [], images: [{ assetId: 'ativo-fisico-1', height: 600, license: 'CC-BY' }], notes: '' }
    ],
    review: {}, srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const final = result.state.data.find((e) => e.id === 'seed_himgdup');
  assert.equal(final.images.length, 1, 'mesma stable key (assetId) deve colapsar em 1 imagem, nao duplicar');
  assert.equal(final.images[0].assetId, 'ativo-fisico-1');
});

test('V2 hardening: imagens FISICAMENTE DISTINTAS (assetId diferente) nunca colapsam, mesmo que outros campos coincidam', () => {
  const seed = [{ id: 'seed_himgdist', name: 'Hardening ImgDistinta', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [
      { id: 'seed_himgdist', name: 'Hardening ImgDistinta', s: 'X', site: 'Y', tags: [], links: [], images: [{ assetId: 'fisico-A', width: 800 }], notes: '' },
      { id: 'seed_zzz_7', name: 'Hardening ImgDistinta', s: 'X', site: 'Y', tags: [], links: [], images: [{ assetId: 'fisico-B', width: 800 }], notes: '' }
    ],
    review: {}, srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const final = result.state.data.find((e) => e.id === 'seed_himgdist');
  assert.equal(final.images.length, 2, 'assetId diferentes sao ativos fisicos distintos, ambos devem sobreviver');
  assert.deepEqual(plain(final.images.map((i) => i.assetId)).sort(), ['fisico-A', 'fisico-B']);
});

test('V2 hardening: _userUpdatedAt do usuario NUNCA e apagado por fusao com o SEED (SEED nunca tem _userUpdatedAt)', () => {
  const seed = [{ id: 'seed_hts', name: 'Hardening Timestamp', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = { data: [{ id: 'seed_hts', name: 'Hardening Timestamp', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: 'nota editada', _userUpdatedAt: 123456 }], review: {}, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const final = result.state.data.find((e) => e.id === 'seed_hts');
  assert.equal(final._userUpdatedAt, 123456, 'timestamp do usuario deve sobreviver intacto ao ser mesclado com um SEED sem _userUpdatedAt');
});

test('V2 hardening: REVIEW com valor explicito 0 e preservado (0 nao e tratado como ausente)', () => {
  const seed = [{ id: 'seed_hrz', name: 'Hardening ReviewZero', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = { data: [{ id: 'seed_hrz', name: 'Hardening ReviewZero', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }], review: { seed_hrz: 0 }, srs: {} };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.review, 'seed_hrz'), true, 'review 0 deve estar presente, nao removido por ser falsy');
  assert.equal(result.state.review.seed_hrz, 0);
});

test('V2 hardening: REVIEW de uma identidade que existe no DATA mas nao existe no SEED vai para unresolvedReview (nunca orphan, nunca aplicado)', () => {
  const seed = [{ id: 'seed_hru', name: 'Identidade Que Existe No Seed', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [{ id: 'seed_fantasma', name: 'Identidade Fantasma Sem Seed', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }],
    review: { seed_fantasma: 1 },
    srs: {}
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  assert.deepEqual(plain(result.report.orphanReview), {}, 'orphan e so para IDs que nem existem em DATA — seed_fantasma existe em DATA');
  assert.equal(result.report.unresolvedReview.length, 1);
  assert.equal(result.report.unresolvedReview[0].id, 'seed_fantasma');
  assert.equal(result.report.unresolvedReview[0].reason, 'identity_not_in_seed');
  assert.equal(Object.prototype.hasOwnProperty.call(result.state.review, 'seed_fantasma'), false);
});

test('V2 hardening: colisao de SRS entre 2 copias da mesma identidade e resolvida deterministicamente por updatedAt e reportada (nunca mistura campos)', () => {
  const seed = [{ id: 'seed_hsrs', name: 'Hardening SrsColisao', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }];
  const state = {
    data: [
      { id: 'seed_hsrs', name: 'Hardening SrsColisao', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' },
      { id: 'seed_zzz_8', name: 'Hardening SrsColisao', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: '' }
    ],
    review: {},
    srs: {
      seed_hsrs: { interval: 1, streak: 1, updatedAt: 2000, due: 3000, lastGrade: 'easy' },
      seed_zzz_8: { interval: 5, streak: 9, updatedAt: 1000, due: 9000, lastGrade: 'hard' }
    }
  };
  const result = v2.reconcileCatalogByIdentityV2(state, seed);
  const conflict = result.report.conflicts.find((c) => c.kind === 'srs' && c.finalId === 'seed_hsrs');
  assert.ok(conflict, 'SRS divergente entre 2 fontes da mesma identidade deve ser reportado');
  assert.equal(conflict.reason, 'srs_conflict_resolved_by_updatedAt');
  assert.equal(conflict.blocking, false, 'resolvido por updatedAt = deterministico = nao bloqueante');
  // objeto INTEIRO do vencedor (maior updatedAt), nunca uma mistura de campos dos dois lados.
  assert.deepEqual(plain(result.state.srs.seed_hsrs), { interval: 1, streak: 1, updatedAt: 2000, due: 3000, lastGrade: 'easy' });
});

test('V2 hardening: idempotencia dos NOVOS campos (safeToApply/provenance) — 2a execucao sobre o catalogo real produz um estado igualmente seguro e completo', () => {
  // Nota: 'origin'/'sourceIds' por identidade NAO precisam ser identicos entre
  // as duas execucoes — isso e' esperado: na 1a execucao varias identidades
  // partem de multiplas copias historicas (duplicate_consolidated) ou de
  // nenhuma copia (materialized_from_seed); apos consolidadas, a 2a execucao
  // ve exatamente 1 copia ja correta por identidade (single_source_reconciled
  // para todas). O invariante real de idempotencia e' o ESTADO final
  // resultante (data/review/srs), ja coberto por 'V2 TESTE 12: ... idempotente'
  // acima — aqui verificamos que os campos NOVOS continuam corretos e
  // consistentes (mesma cobertura, mesma seguranca) na 2a rodada.
  const { parsed } = loadFullCatalogSnapshot();
  const first = v2.reconcileCatalogByIdentityV2({ data: parsed.entries, review: parsed.review, srs: parsed.srs }, REAL_SEED);
  const second = v2.reconcileCatalogByIdentityV2(first.state, REAL_SEED);

  assert.equal(second.report.safeToApply, first.report.safeToApply);
  assert.deepEqual(plain(second.report.safeToApplyReasons), plain(first.report.safeToApplyReasons));
  assert.equal(second.report.provenance.length, first.report.provenance.length);

  const finalIdsFirst = new Set(first.report.provenance.map((p) => p.finalId));
  const finalIdsSecond = new Set(second.report.provenance.map((p) => p.finalId));
  assert.deepEqual(plain([...finalIdsSecond].sort()), plain([...finalIdsFirst].sort()), 'o conjunto de identidades finais cobertas deve ser identico entre as duas execucoes');

  // na 2a execucao, NENHUMA identidade deveria mais precisar de consolidacao
  // ou materializacao — tudo ja esta no lugar certo apos a 1a reconciliacao.
  for (const p of second.report.provenance) {
    assert.equal(p.origin, 'single_source_reconciled', `apos a 1a reconciliacao, ${p.finalId} deveria ja estar consolidado em uma unica fonte correta`);
    assert.deepEqual(plain(p.sourceIds), [p.finalId]);
  }
});

test('TODO: sincronizacao real com Firestore precisa de teste de integracao manual', { todo: true }, () => {
  // A simulacao em memoria (unionByIdLikeSyncFromFirebase + o motor real)
  // formaliza o contrato, mas nao substitui um teste real com dois
  // dispositivos/documentos Firestore de fato — fora do escopo de uma
  // suite unitaria local sem rede.
});

test('TODO: botao "Forcar fusao de duplicatas" deve ser reescrito para usar o mapa e testado via extracao real', { todo: true }, () => {
  // Ver relatorio da investigacao, secao K: o botao hoje chama
  // runDuplicateCleanup() (desativado). Quando reescrito para consumir o
  // LEGACY_ID_MIGRATION_MAP_V1 + applyLegacyIdMigrationToState, deve
  // ganhar um teste extraindo o handler real de index.html, no estilo de
  // extractImportHandler em critical-flows.test.js. O motor em si (testado
  // acima) ja esta pronto para ser consumido por esse botao quando essa
  // decisao for tomada — nada aqui liga automaticamente a ele.
});

test('TODO: ligar applyLegacyIdMigrationToState a loadData/syncFromFirebase e uma decisao FUTURA separada', { todo: true }, () => {
  // Esta etapa entrega o motor pronto e testado, mas 100% inerte
  // (ver teste "PASSO 14" acima). Conectar a producao requer nova
  // aprovacao explicita, dry-run controlado e provavelmente um teste de
  // regressao adicional para o ponto exato de integracao escolhido.
});

test('TODO: decidir a relacao entre o motor V1 (mapa de 126 pares) e o V2 (identidade semantica) antes de conectar qualquer um a producao', { todo: true }, () => {
  // O V2 cobre estritamente mais casos que o V1 (os 875 deslocamentos
  // fora do mapa, alem dos 126 que o V1 ja cobria) e usa uma logica mais
  // geral (identidade semantica em vez de tabela estatica). Antes de uma
  // futura integracao, decidir explicitamente se o V1 sera aposentado,
  // mantido como camada de auditoria/documentacao historica, ou se algum
  // hibrido faz sentido — esta decisao NAO foi tomada nesta etapa.
});

test('TODO: ligar reconcileCatalogByIdentityV2 a loadData/syncFromFirebase/importacao e uma decisao FUTURA separada', { todo: true }, () => {
  // ALTERACAO 007 deu ao motor V2 seu unico call site de producao dentro
  // de reconcileV2Preview, acionado exclusivamente pelo botao manual
  // "reconciliar catalogo V2" (ver testes "V2 PASSO 14 (ALTERACAO 007)"
  // e a suite ALTERACAO 007 — ferramenta manual). O motor deixou de ser
  // 100% inerte, mas continua sem NENHUMA integracao automatica: loadData,
  // syncFromFirebase e o handler de importacao nao mencionam nenhuma
  // funcao da ferramenta (comprovado estaticamente). Ligar o V2 a esses
  // fluxos automaticos continua sendo uma decisao FUTURA separada, nao
  // tomada aqui.
});

// ===========================================================================
// ALTERACAO 007 — ferramenta manual "reconciliar catalogo V2": testes
// comportamentais de reconcileV2Preview/applyReconcileV2 extraidos e
// executados de verdade (via vm), com storage.set/confirm/download
// injetados/mockados — nunca window.confirm, Blob, URL ou document reais.
// ===========================================================================

function buildToolEngine() {
  const toolNames = ['classifyImageOwnershipDivergenceV2', 'dedupeEntryImagesByStableKeyV2', 'buildImageOwnershipCorrectionPlanV2', 'applyImageOwnershipCorrectionV2', 'reconcileV2Preview', 'buildPreMigrationBackupV2', 'downloadPreMigrationBackupV2', 'applyReconcileV2', 'buildRealStateDiagnosticV2', 'buildPostApplyValidationReportV2', 'buildCheckpointIntegrityReportV2', 'buildCheckpointV2', 'downloadCheckpointV2', 'exportCheckpointV2'];
  const toolFns = {};
  for (const name of toolNames) toolFns[name] = extractFunction(html, name);

  const knownFieldsDecl = declarationsOf(html, 'V2_KNOWN_FIELDS');
  const knownFieldsEquals = html.indexOf('=', knownFieldsDecl[0].index);
  const knownFieldsSemicolon = html.indexOf(';', knownFieldsEquals);
  const knownFieldsSource = html.slice(knownFieldsDecl[0].index, knownFieldsSemicolon + 1);

  // MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919 = new Map([ ... ]) — extrai o
  // "new Map(" + conteudo balanceado via extractDelimited a partir do "(".
  const overridesDecl = declarationsOf(html, 'MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919');
  assert.equal(overridesDecl.length, 1, 'MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919 deve ter uma unica declaracao');
  const overridesNewMapIndex = html.indexOf('new Map(', overridesDecl[0].index);
  const overridesParenIndex = html.indexOf('(', overridesNewMapIndex);
  const overridesMapCall = extractDelimited(html, overridesParenIndex);
  const overridesSource = `const MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919 = new Map${overridesMapCall};`;

  const sourceParts = [
    engineBuild.extractedFns.stableImageKeyV208.source,
    engineBuild.extractedFns.normalizeLegacyIdentity.source,
    engineBuild.extractedFns.mergeLegacyReview.source,
    engineBuild.extractedFns.mergeLegacySrs.source,
    engineBuild.extractedFns.mergeLegacyNotes.source,
    engineBuild.extractedFns.mergeLegacyTags.source,
    engineBuild.extractedFns.mergeLegacyLinks.source,
    engineBuild.extractedFns.rewriteMigratedImageOwner.source,
    engineBuild.extractedFns.mergeLegacyImages.source,
    engineBuild.extractedFns.mergeLegacyBaseFields.source,
    knownFieldsSource,
    v2EngineBuild.extractedFns.identityKeyOfV2.source,
    v2EngineBuild.extractedFns.buildSeedIdentityIndexV2.source,
    v2EngineBuild.extractedFns.mergeUnknownFieldsV2.source,
    v2EngineBuild.extractedFns.normalizeAltPlacementKeyV2.source,
    v2EngineBuild.extractedFns.mergeAltPlacementsV2.source,
    v2EngineBuild.extractedFns.foldDataEntriesByIdentityV2.source,
    v2EngineBuild.extractedFns.rewriteDataImagesOnlyV2.source,
    v2EngineBuild.extractedFns.mergeSeedIdentityWithDataV2.source,
    v2EngineBuild.extractedFns.rewriteImageOwnershipV2.source,
    v2EngineBuild.extractedFns.reconcileCatalogByIdentityV2.source,
    overridesSource,
    toolFns.classifyImageOwnershipDivergenceV2.source,
    toolFns.dedupeEntryImagesByStableKeyV2.source,
    toolFns.buildImageOwnershipCorrectionPlanV2.source,
    toolFns.applyImageOwnershipCorrectionV2.source,
    toolFns.reconcileV2Preview.source,
    toolFns.buildPreMigrationBackupV2.source,
    toolFns.downloadPreMigrationBackupV2.source,
    toolFns.applyReconcileV2.source,
    toolFns.buildRealStateDiagnosticV2.source,
    toolFns.buildPostApplyValidationReportV2.source,
    toolFns.buildCheckpointIntegrityReportV2.source,
    toolFns.buildCheckpointV2.source,
    toolFns.downloadCheckpointV2.source,
    toolFns.exportCheckpointV2.source,
    'globalThis.MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919 = MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919;',
    'globalThis.buildPostApplyValidationReportV2 = buildPostApplyValidationReportV2;',
    'globalThis.classifyImageOwnershipDivergenceV2 = classifyImageOwnershipDivergenceV2;',
    'globalThis.dedupeEntryImagesByStableKeyV2 = dedupeEntryImagesByStableKeyV2;',
    'globalThis.buildImageOwnershipCorrectionPlanV2 = buildImageOwnershipCorrectionPlanV2;',
    'globalThis.applyImageOwnershipCorrectionV2 = applyImageOwnershipCorrectionV2;',
    'globalThis.reconcileV2Preview = reconcileV2Preview;',
    'globalThis.applyReconcileV2 = applyReconcileV2;',
    'globalThis.buildRealStateDiagnosticV2 = buildRealStateDiagnosticV2;',
    'globalThis.buildCheckpointIntegrityReportV2 = buildCheckpointIntegrityReportV2;',
    'globalThis.buildCheckpointV2 = buildCheckpointV2;',
    'globalThis.exportCheckpointV2 = exportCheckpointV2;'
  ];
  return { toolFns, sourceParts };
}

const toolEngine = buildToolEngine();

// Nenhum stub de document/Blob/URL/window.confirm e' necessario: os testes
// sempre passam confirmFn/downloadFn explicitos para applyReconcileV2 (a
// mesma injecao de dependencia que o codigo real de producao aceita), entao
// os defaults (que tocariam o DOM/confirm real) nunca sao avaliados.
function makeToolContext({ data, review, srs, seed }) {
  const storageSetLog = [];
  const contextObj = {
    console,
    DATA: data,
    REVIEW: review,
    SRS: srs,
    SEED: seed,
    SESSIONLOG: {},
    sectionOrder: [],
    siteOrder: {},
    STORAGE_KEY: 'atlas:pathologies',
    REVIEW_KEY: 'atlas:review',
    SRS_KEY: 'atlas:srs',
    storage: { set: async (key, value) => { storageSetLog.push({ key, value }); } }
  };
  const context = vm.createContext(contextObj);
  new vm.Script(toolEngine.sourceParts.join('\n\n'), { filename: 'index.html:legacy-engine-v2-tool' }).runInContext(context);
  return { context, storageSetLog };
}

test('ALTERACAO 007: reconcileV2Preview NAO muta DATA/REVIEW/SRS (preview e puro em memoria)', () => {
  const { raw, parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  const dataSnapshot = plain(context.DATA);
  const reviewSnapshot = plain(context.REVIEW);
  const srsSnapshot = plain(context.SRS);

  const preview = context.reconcileV2Preview();

  assert.deepEqual(plain(context.DATA), dataSnapshot, 'DATA nao pode mudar so' + ' de rodar o preview');
  assert.deepEqual(plain(context.REVIEW), reviewSnapshot, 'REVIEW nao pode mudar so' + ' de rodar o preview');
  assert.deepEqual(plain(context.SRS), srsSnapshot, 'SRS nao pode mudar so' + ' de rodar o preview');
  // safeToApply do catalogo real e' TRUE: os 6 casos categoria B (conflitantes)
  // que existiam foram todos resolvidos por overrides manuais explicitos
  // (MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919, decisao humana de 2026-09-19,
  // nao uma heuristica automatica) — ver a suite "CORRECAO DE OWNERSHIP DE
  // IMAGENS" mais abaixo pros numeros completos.
  assert.equal(preview.report.safeToApply, true);
  assert.equal(preview.report.imageOwnershipCorrection.categoryB.length, 0);
  assert.equal(preview.report.imageOwnershipCorrection.manualOverrides.length, 6);

  const rawAfter = fs.readFileSync(path.resolve(__dirname, '..', 'snapshot-catalogo-completo-readonly.json'), 'utf8');
  assert.equal(rawAfter, raw, 'o snapshot no disco nao pode ser alterado por este teste');
});

test('ALTERACAO 007: safeToApply=false BLOQUEIA applyReconcileV2 — nada e mutado, nada e persistido', async () => {
  const ambiguousSeed = [
    { id: 'seed_X1', name: 'Duplicata no Seed', s: 'X', site: 'Y' },
    { id: 'seed_X2', name: 'Duplicata no Seed', s: 'X', site: 'Y' }
  ];
  const data = [{ id: 'seed_X1', name: 'Duplicata no Seed', s: 'X', site: 'Y', tags: [], links: [], images: [], notes: 'nota do usuario' }];
  const { context, storageSetLog } = makeToolContext({ data, review: { seed_X1: 2 }, srs: {}, seed: ambiguousSeed });

  const preview = context.reconcileV2Preview();
  assert.equal(preview.report.safeToApply, false, 'fixture precisa ser inseguro pra este teste fazer sentido');

  let confirmCalled = false;
  let downloadCalled = false;
  const result = await context.applyReconcileV2({
    confirmFn: () => { confirmCalled = true; return true; },
    downloadFn: () => { downloadCalled = true; }
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, 'not_safe');
  assert.equal(confirmCalled, false, 'nao pode nem chegar a pedir confirmacao quando safeToApply=false');
  assert.equal(downloadCalled, false, 'nao pode gerar backup quando a aplicacao esta bloqueada');
  assert.equal(storageSetLog.length, 0, 'nao pode persistir nada quando a aplicacao esta bloqueada');
  assert.deepEqual(plain(context.DATA), data, 'DATA precisa permanecer intocado');
});

// Fixture dedicada, deliberadamente SEGURA (sem duplicatas, sem anomalias,
// sem nenhuma divergencia de ownership de imagem) pros testes de
// ORQUESTRACAO de applyReconcileV2 abaixo (confirmacao/backup/persistencia).
// Nao usa mais o snapshot real: desde a correcao de ownership de imagens, o
// catalogo real tem 6 divergencias categoria B genuinas (ver teste acima),
// entao safeToApply=false la' e' o resultado CORRETO — usa-lo aqui faria
// esses testes de orquestracao pararem antes mesmo de chegar no fluxo que
// eles querem exercitar.
function buildSafeApplyFixture(){
  const seed = [
    { id: 'safe_1', name: 'Lesão Segura Um', s: 'S', site: 'T' },
    { id: 'safe_2', name: 'Lesão Segura Dois', s: 'S', site: 'T' }
  ];
  const data = {
    data: [
      { id: 'safe_1', name: 'Lesão Segura Um', s: 'S', site: 'T', images: [{ assetId: 'safe-asset-1', lesionId: 'safe_1', lesionName: 'Lesão Segura Um' }] },
      { id: 'safe_2', name: 'Lesão Segura Dois', s: 'S', site: 'T', images: [] }
    ],
    review: { safe_1: 2 },
    srs: {}
  };
  return { seed, data };
}

test('ALTERACAO 007: applyReconcileV2 exige confirmacao explicita — cancelar nao aplica nada', async () => {
  const fixture = buildSafeApplyFixture();
  const { context, storageSetLog } = makeToolContext({ data: fixture.data.data, review: fixture.data.review, srs: fixture.data.srs, seed: fixture.seed });
  const dataCountBefore = context.DATA.length;

  let downloadCalled = false;
  const result = await context.applyReconcileV2({
    confirmFn: () => false, // usuario cancela
    downloadFn: () => { downloadCalled = true; }
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(downloadCalled, false, 'nao pode gerar backup se o usuario cancelou antes');
  assert.equal(storageSetLog.length, 0);
  assert.equal(context.DATA.length, dataCountBefore, 'DATA precisa permanecer intocado apos cancelamento');
});

test('ALTERACAO 007: backup e gerado ANTES de qualquer mutacao de DATA/REVIEW/SRS', async () => {
  const fixture = buildSafeApplyFixture();
  const { context } = makeToolContext({ data: fixture.data.data, review: fixture.data.review, srs: fixture.data.srs, seed: fixture.seed });
  const dataCountBefore = context.DATA.length;
  const reviewCountBefore = Object.keys(context.REVIEW).length;

  let dataCountAtBackupTime = null;
  let reviewCountAtBackupTime = null;
  let backupPayload = null;
  const result = await context.applyReconcileV2({
    confirmFn: () => true,
    downloadFn: (backup) => {
      // neste instante a mutacao AINDA nao pode ter acontecido
      dataCountAtBackupTime = context.DATA.length;
      reviewCountAtBackupTime = Object.keys(context.REVIEW).length;
      backupPayload = backup;
    }
  });

  assert.equal(result.applied, true);
  assert.equal(dataCountAtBackupTime, dataCountBefore, 'o backup precisa capturar o estado ANTES da mutacao');
  assert.equal(reviewCountAtBackupTime, reviewCountBefore, 'o backup precisa capturar o REVIEW ANTES da mutacao');
  assert.equal(backupPayload.format, 'atlas-radiologico-backup');
  assert.equal(backupPayload.reason, 'pre-reconciliacao-v2');
  assert.equal(backupPayload.data.length, dataCountBefore, 'o backup precisa ser o payload PRE-migracao, nao o pos-migracao');
});

test('ALTERACAO 007: DATA/REVIEW/SRS aplicados correspondem exatamente ao resultado do V2, e sao persistidos localmente (sem Firebase/Cloudinary)', async () => {
  const fixture = buildSafeApplyFixture();
  const { context, storageSetLog } = makeToolContext({ data: fixture.data.data, review: fixture.data.review, srs: fixture.data.srs, seed: fixture.seed });

  const expectedPreview = context.reconcileV2Preview(); // puro — nao muta nada, serve so' de expectativa
  const result = await context.applyReconcileV2({ confirmFn: () => true, downloadFn: () => {} });

  assert.equal(result.applied, true);
  assert.deepEqual(plain(context.DATA), plain(expectedPreview.state.data));
  assert.deepEqual(plain(context.REVIEW), plain(expectedPreview.state.review));
  assert.deepEqual(plain(context.SRS), plain(expectedPreview.state.srs));

  assert.equal(storageSetLog.length, 3, 'precisa persistir DATA, REVIEW e SRS — exatamente 3 chamadas de storage.set');
  const keys = storageSetLog.map((c) => c.key).sort();
  assert.deepEqual(keys, ['atlas:pathologies', 'atlas:review', 'atlas:srs'].sort());
  const dataCall = storageSetLog.find((c) => c.key === 'atlas:pathologies');
  assert.deepEqual(JSON.parse(dataCall.value), plain(expectedPreview.state.data));
});

test('ALTERACAO 007: skipConfirm permite orquestrar aplicacao programaticamente sem confirmFn', async () => {
  const fixture = buildSafeApplyFixture();
  const { context, storageSetLog } = makeToolContext({ data: fixture.data.data, review: fixture.data.review, srs: fixture.data.srs, seed: fixture.seed });
  let downloadCalled = false;
  const result = await context.applyReconcileV2({ skipConfirm: true, downloadFn: () => { downloadCalled = true; } });
  assert.equal(result.applied, true);
  assert.equal(downloadCalled, true, 'o backup continua obrigatorio mesmo com skipConfirm');
  assert.equal(storageSetLog.length, 3);
});

// ===========================================================================
// DIAGNOSTICO DO ESTADO REAL — buildRealStateDiagnosticV2 usa EXCLUSIVAMENTE
// DATA/REVIEW/SRS (nunca SEED, nunca roda o motor de reconciliacao). Serve
// pra investigar o catalogo como ele esta agora no navegador, sem depender
// de nenhum preview/aplicacao do V2.
// ===========================================================================

test('DIAGNOSTICO: buildRealStateDiagnosticV2 e read-only — nao muta DATA/REVIEW/SRS, nunca referencia SEED', () => {
  const fn = extractFunction(html, 'buildRealStateDiagnosticV2');
  assert.ok(!/\bSEED\b/.test(fn.source), 'o diagnostico nao pode ler o SEED — so o estado real carregado');
  assert.ok(!fn.source.includes('reconcileCatalogByIdentityV2'), 'o diagnostico nao pode rodar o motor de reconciliacao');

  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  const dataSnapshot = plain(context.DATA);
  context.buildRealStateDiagnosticV2();
  assert.deepEqual(plain(context.DATA), dataSnapshot, 'DATA nao pode mudar so de rodar o diagnostico');
});

test('DIAGNOSTICO: detecta grupo duplicado e mismatch de ownership numa fixture pequena e controlada', () => {
  const { context } = makeToolContext({
    data: [
      { id: 'x1', name: 'Lesão Dup', s: 'S', site: 'T', images: [] },
      { id: 'x2', name: 'Lesão Dup', s: 'S', site: 'T', images: [{ assetId: 'a1', lesionId: 'x2', lesionName: 'Outra Lesão Qualquer' }] },
      { id: 'x3', name: 'Lesão Única', s: 'S', site: 'T', images: [{ assetId: 'a2', lesionId: 'x3', lesionName: 'Lesão Única' }] }
    ],
    review: {}, srs: {}, seed: []
  });
  const report = context.buildRealStateDiagnosticV2();
  assert.equal(report.dataLength, 3);
  assert.equal(report.uniqueIdentityCount, 2);
  assert.equal(report.duplicateGroupCount, 1);
  assert.deepEqual(plain(report.duplicateGroups[0].ids).sort(), ['x1', 'x2']);
  assert.equal(report.recordsWithImagesCount, 2);
  assert.equal(report.totalImageCount, 2);
  assert.equal(report.ownershipMismatches.length, 1, 'x2 tem lesionName divergente do nome atual do registro');
  assert.equal(report.ownershipMismatches[0].currentHolderId, 'x2');
  assert.equal(report.ownershipMismatches[0].nameMismatch, true);
});

test('DIAGNOSTICO: busca por "modic" encontra o registro e mostra exatamente a imagem e metadados de ownership anexados', () => {
  const { context } = makeToolContext({
    data: [{ id: 'seed_X', name: 'Alterações Modic dos platôs vertebrais', s: 'Coluna Vertebral', site: 'Disco intervertebral', images: [{ assetId: 'img-modic-test', lesionId: 'seed_X', lesionName: 'Outra Coisa Qualquer' }] }],
    review: {}, srs: {}, seed: []
  });
  const report = context.buildRealStateDiagnosticV2();
  assert.equal(report.modicSearch.matches.length, 1);
  assert.equal(report.modicSearch.matches[0].id, 'seed_X');
  assert.equal(report.modicSearch.matches[0].images[0].assetId, 'img-modic-test');
  assert.equal(report.modicSearch.matches[0].images[0].lesionName, 'Outra Coisa Qualquer', 'o diagnostico expoe o lesionName tal como gravado, mesmo divergente');
});

test('DIAGNOSTICO no snapshot REAL (1213): trava os numeros encontrados — achado concreto que explica o que aparece no navegador', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  const report = context.buildRealStateDiagnosticV2();

  assert.equal(report.dataLength, 1213);
  assert.equal(report.recordsWithImagesCount, 87, 'bate com o filtro "imagens" (87 lesões) visto no navegador — ja preexistente no DATA real, nao e efeito do V2');
  assert.equal(report.totalImageCount, 102);
  assert.equal(report.duplicateGroupCount, 126, 'mesmo numero dos 126 grupos duplicados conhecidos de LEGACY_ID_MIGRATION_MAP_V1');
  assert.equal(report.ownershipMismatches.length, 47, 'achado: quase metade das 102 imagens do catalogo real ja tem lesionId/lesionName divergente do registro que as contem HOJE, independente do V2');

  const modic = report.modicSearch.matches.find((m) => m.id === 'seed_482');
  assert.ok(modic, '"Alterações Modic dos platôs vertebrais" precisa ser encontrada em seed_482');
  assert.equal(modic.imageCount, 1);
  assert.equal(modic.images[0].lesionId, 'seed_482', 'lesionId bate com o registro atual...');
  assert.equal(modic.images[0].lesionName, 'Cisto epidermoide intracraniano', '...mas lesionName NAO bate — a imagem e de outra lesao, mal atribuida no DATA real (achado da investigacao)');
});

// ===========================================================================
// CORRECAO DE OWNERSHIP DE IMAGENS POR EVIDENCIA DE METADADOS — classifica
// cada imagem cujo lesionId/lesionName (e cloudinaryContext.custom espelhado,
// quando existir) diverge do registro que a contem hoje, em 4 categorias:
//   A — destino inequivoco: todos os sinais presentes convergem pra UMA
//       unica identidade existente no catalogo — movida automaticamente.
//   B — metadados conflitantes: sinais apontam pra identidades DIFERENTES
//       — NUNCA movida automaticamente, bloqueia safeToApply.
//   C — destino inexistente: nenhum sinal presente resolve pra identidade
//       existente — NUNCA movida, bloqueia safeToApply.
//   D — insuficiente: nenhum metadado de ownership presente — NUNCA movida,
//       bloqueia safeToApply.
// Roda ANTES da reconciliacao por identidade (sobre o DATA cru), nunca
// depois — reconcileCatalogByIdentityV2 reescreve incondicionalmente o
// ownership de toda imagem no seu ultimo passo, o que apagaria a propria
// evidencia de divergencia se a classificacao rodasse depois.
// ===========================================================================

test('OWNERSHIP A: sinais convergem pra uma unica identidade DIFERENTE da atual — imagem e MOVIDA (nao copiada), fisico preservado', () => {
  const data = [
    { id: 'own_src', name: 'Origem Errada', s: 'S', site: 'T', images: [{ assetId: 'phys-1', publicId: 'pub/phys-1', originalUrl: 'https://x/phys-1.jpg', lesionId: 'own_dst', lesionName: 'Destino Certo' }] },
    { id: 'own_dst', name: 'Destino Certo', s: 'S', site: 'T', images: [] }
  ];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed: [] });
  const plan = context.buildImageOwnershipCorrectionPlanV2(context.DATA);
  assert.equal(plan.categoryA.length, 1);
  assert.equal(plan.categoryB.length, 0);
  assert.equal(plan.categoryC.length, 0);
  assert.equal(plan.categoryD.length, 0);
  assert.equal(plan.categoryA[0].destination.id, 'own_dst');

  const corrected = context.applyImageOwnershipCorrectionV2({ data: context.DATA, review: {}, srs: {} });
  const src = corrected.state.data.find((e) => e.id === 'own_src');
  const dst = corrected.state.data.find((e) => e.id === 'own_dst');
  assert.equal(src.images.length, 0, 'a imagem precisa sair da origem — MOVER, nao copiar');
  assert.equal(dst.images.length, 1, 'a imagem precisa chegar no destino exatamente uma vez');
  assert.equal(dst.images[0].assetId, 'phys-1', 'assetId fisico preservado');
  assert.equal(dst.images[0].publicId, 'pub/phys-1', 'publicId fisico preservado');
  assert.equal(dst.images[0].originalUrl, 'https://x/phys-1.jpg', 'originalUrl fisico preservado');
  assert.equal(dst.images[0].lesionId, 'own_dst', 'ownership reescrito para o destino');
  assert.equal(dst.images[0].lesionName, 'Destino Certo');
  assert.equal(corrected.report.imageOwnershipCorrection.moved.filter((m) => m.action === 'moved').length, 1);
  assert.equal(corrected.report.safeToApply, true, 'categoria A sozinha nao bloqueia safeToApply');
});

test('OWNERSHIP A (relabel in place): id aponta pro proprio registro mas name diverge e nao existe em lugar nenhum — so relabela, nao move', () => {
  const data = [{ id: 'own_1', name: 'Nome Certo', s: 'S', site: 'T', images: [{ assetId: 'phys-2', lesionId: 'own_1', lesionName: 'Nome Antigo Que Nao Existe Mais' }] }];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed: [] });
  const corrected = context.applyImageOwnershipCorrectionV2({ data: context.DATA, review: {}, srs: {} });
  const entry = corrected.state.data.find((e) => e.id === 'own_1');
  assert.equal(entry.images.length, 1, 'a imagem nao pode sumir nem duplicar');
  assert.equal(entry.images[0].assetId, 'phys-2');
  assert.equal(entry.images[0].lesionName, 'Nome Certo', 'label stale e corrigido');
  assert.equal(corrected.report.imageOwnershipCorrection.moved[0].action, 'relabeled_in_place');
});

test('OWNERSHIP B: lesionId e lesionName apontam pra identidades DIFERENTES — NUNCA move, bloqueia safeToApply', () => {
  const data = [
    { id: 'b_holder', name: 'Quem Segura', s: 'S', site: 'T', images: [{ assetId: 'phys-3', lesionId: 'b_dest_by_id', lesionName: 'Nome De Outra Lesao' }] },
    { id: 'b_dest_by_id', name: 'Destino Pelo ID', s: 'S', site: 'T', images: [] },
    { id: 'b_dest_by_name', name: 'Nome De Outra Lesao', s: 'S', site: 'T', images: [] }
  ];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed: [] });
  const corrected = context.applyImageOwnershipCorrectionV2({ data: context.DATA, review: {}, srs: {} });
  const holder = corrected.state.data.find((e) => e.id === 'b_holder');
  assert.equal(holder.images.length, 1, 'imagem categoria B fica exatamente onde estava — nunca movida automaticamente');
  assert.equal(holder.images[0].assetId, 'phys-3');
  assert.equal(corrected.report.imageOwnershipCorrection.categoryB.length, 1);
  assert.equal(corrected.report.safeToApply, false, 'categoria B bloqueia safeToApply');
  assert.ok(corrected.report.safeToApplyReasons.some((r) => r.includes('CONFLITANTES')));
});

test('OWNERSHIP C: metadados apontam pra lesao INEXISTENTE no catalogo — NUNCA move, bloqueia safeToApply', () => {
  const data = [{ id: 'c_holder', name: 'Quem Segura', s: 'S', site: 'T', images: [{ assetId: 'phys-4', lesionId: 'id_que_nao_existe', lesionName: 'Nome Que Tambem Nao Existe' }] }];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed: [] });
  const corrected = context.applyImageOwnershipCorrectionV2({ data: context.DATA, review: {}, srs: {} });
  const holder = corrected.state.data.find((e) => e.id === 'c_holder');
  assert.equal(holder.images.length, 1, 'imagem categoria C fica onde estava');
  assert.equal(corrected.report.imageOwnershipCorrection.categoryC.length, 1);
  assert.equal(corrected.report.safeToApply, false);
});

test('OWNERSHIP D: sem NENHUM metadado de ownership presente — insuficiente, bloqueia safeToApply', () => {
  const { context } = makeToolContext({ data: [], review: {}, srs: {}, seed: [] });
  const classification = context.classifyImageOwnershipDivergenceV2({}, new Map(), new Map());
  assert.equal(classification.category, 'D');
  assert.equal(classification.reason, 'sem_metadado_de_ownership_suficiente');
});

test('OWNERSHIP: nunca decide destino so pelo ID numerico — lesionId reaproveitado pra outra identidade resolve pra identidade ATUAL do ID, nunca pela historica', () => {
  const data = [
    { id: 'reused_id', name: 'Identidade Atual Do ID', s: 'S', site: 'T', images: [] },
    { id: 'holder', name: 'Quem Segura A Imagem', s: 'S', site: 'T', images: [{ assetId: 'phys-6', lesionId: 'reused_id', lesionName: 'Identidade Antiga Que O ID Costumava Ter' }] }
  ];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed: [] });
  const corrected = context.applyImageOwnershipCorrectionV2({ data: context.DATA, review: {}, srs: {} });
  const holder = corrected.state.data.find((e) => e.id === 'holder');
  const reused = corrected.state.data.find((e) => e.id === 'reused_id');
  assert.equal(holder.images.length, 0);
  assert.equal(reused.images.length, 1);
  assert.equal(reused.images[0].lesionName, 'Identidade Atual Do ID');
});

test('OWNERSHIP no snapshot REAL (1213): trava os numeros do dry-run completo — divergencias, categorias, overrides, movidas, antes/depois', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });

  const recordsWithImagesBefore = context.DATA.filter((e) => Array.isArray(e.images) && e.images.length > 0).length;
  const totalImagesBefore = context.DATA.reduce((n, e) => n + (Array.isArray(e.images) ? e.images.length : 0), 0);
  assert.equal(recordsWithImagesBefore, 87);
  assert.equal(totalImagesBefore, 102);

  const preview = context.reconcileV2Preview();
  const ic = preview.report.imageOwnershipCorrection;

  // Os 6 casos categoria B originais foram todos cobertos pelos 4 overrides
  // manuais explicitos (2026-09-19) — MANUAL_IMAGE_OWNERSHIP_OVERRIDES_20260919
  // saem do balde B e viram manualOverrides, nunca A (nao sao "resolvidos
  // automaticamente", sao decisao humana registrada e auditavel).
  assert.equal(ic.totalDivergences, 47);
  assert.equal(ic.categoryA.length, 41, 'resolvidas automaticamente por destino inequivoco');
  assert.equal(ic.manualOverrides.length, 6, '2 copias do asset 6b8984... (Modic/epidermoide) + 2 assets distintos de Cavernoma + 2 copias do asset 03f470... (AVC/Gangrena)');
  assert.equal(ic.categoryB.length, 0, 'todos os 6 B originais foram cobertos por override manual explicito');
  assert.equal(ic.categoryC.length, 0);
  assert.equal(ic.categoryD.length, 0);

  assert.equal(ic.moved.filter((m) => m.source === 'category_A' && m.action === 'moved').length, 39);
  assert.equal(ic.moved.filter((m) => m.source === 'category_A' && m.action === 'relabeled_in_place').length, 2);
  assert.equal(ic.moved.filter((m) => m.source === 'manual_override' && m.action === 'moved').length, 2, 'a copia presa em Modic e a copia presa em Gangrena de Fournier precisam ser MOVIDAS pra fora');
  assert.equal(ic.moved.filter((m) => m.source === 'manual_override' && m.action === 'relabeled_in_place').length, 4, 'as 2 imagens de Cavernoma + as copias ja corretas de Cisto epidermoide/AVC so precisam de relabel');

  const recordsWithImagesAfter = preview.state.data.filter((e) => Array.isArray(e.images) && e.images.length > 0).length;
  const totalImagesAfter = preview.state.data.reduce((n, e) => n + (Array.isArray(e.images) ? e.images.length : 0), 0);
  const physicalAssetsAfter = new Set();
  for (const e of preview.state.data) for (const img of (e.images || [])) physicalAssetsAfter.add(context.stableImageKeyV208(img));
  assert.equal(recordsWithImagesAfter, 51, '53 antes dos overrides, -2 porque Modic e Gangrena de Fournier ficam sem imagem');
  assert.equal(totalImagesAfter, 61, '63 antes dos overrides, -2 pela deduplicacao das 2 copias fisicas identicas (asset 6b8984... e asset 03f470...)');
  assert.equal(physicalAssetsAfter.size, 61, 'nenhum asset fisico duplicado sobra no resultado final');

  let ownershipMismatchesAfter = 0;
  for (const e of preview.state.data) {
    for (const img of (e.images || [])) {
      if ((img.lesionId && img.lesionId !== e.id) || (img.lesionName && img.lesionName !== e.name)) ownershipMismatchesAfter += 1;
    }
  }
  assert.equal(ownershipMismatchesAfter, 0, 'toda imagem que sobra no resultado tem ownership consistente com quem a contem');

  assert.equal(preview.report.safeToApply, true, 'com os overrides manuais, nao sobra nenhum B/C/D bloqueante');
  assert.deepEqual(plain(preview.report.safeToApplyReasons.filter((r) => r.includes('ownership'))), []);
});

test('OWNERSHIP no snapshot REAL: os 6 casos manuais (Modic, Cavernoma x2, AVC/Gangrena) sao aplicados EXATAMENTE como decidido, nunca pelo ID cru historico', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });

  const preview = context.reconcileV2Preview();
  const ic = preview.report.imageOwnershipCorrection;

  // os overrides preservam a classificacao natural (o que teria acontecido
  // sem a decisao manual) so' pra auditoria/transparencia — todas as 6 devem
  // ter sido naturalmente categoria B antes do override entrar em acao.
  assert.equal(ic.manualOverrides.length, 6);
  for (const item of ic.manualOverrides) {
    assert.equal(item.naturalClassification.category, 'B', `${item.assetId} deveria ser naturalmente B antes do override`);
  }

  const modicOverride = ic.manualOverrides.find((item) => item.sourceId === 'seed_482');
  assert.ok(modicOverride, 'a copia presa em Modic (seed_482) precisa aparecer nos overrides manuais');
  assert.equal(modicOverride.assetId, '6b8984838a6f37f08dc34568793cb842');
  assert.equal(modicOverride.destination.id, 'seed_467', 'destino do override e o ID cru seed_467 (identidade Cisto epidermoide intracraniano NA EPOCA)');

  // Busca pelo NOME, nunca pelo ID cru usado no override — o SEED reatribui
  // numeros (seed_14->seed_16, seed_417->seed_428, seed_428->seed_439,
  // seed_467->seed_482, seed_482->seed_499 no snapshot atual), entao o ID
  // final de cada identidade NAO e o mesmo ID cru citado na decisao manual.
  const modicFinal = preview.state.data.find((e) => e.name === 'Alterações Modic dos platôs vertebrais');
  const epidermoideFinal = preview.state.data.find((e) => e.name === 'Cisto epidermoide intracraniano');
  const cavernomaFinal = preview.state.data.find((e) => e.name === 'Cavernoma (malformação cavernosa)');
  const schwannomaFinal = preview.state.data.find((e) => e.name === 'Schwannoma vestibular');
  const avcFinal = preview.state.data.find((e) => e.name === 'AVC isquêmico agudo');
  const gangrenaFinal = preview.state.data.find((e) => e.name === 'Gangrena de Fournier');
  assert.ok(modicFinal && epidermoideFinal && cavernomaFinal && schwannomaFinal && avcFinal && gangrenaFinal);

  assert.equal(modicFinal.images.length, 0, 'Modic termina SEM a imagem — decisao explicita do usuario');
  assert.deepEqual(plain(epidermoideFinal.images.map((i) => i.assetId)), ['6b8984838a6f37f08dc34568793cb842'], 'Cisto epidermoide intracraniano recebe a UNICA copia do asset (deduplicado)');
  assert.deepEqual(plain(cavernomaFinal.images.map((i) => i.assetId)).sort(), ['2ccbe78da9718ebfe799a00345d305d0', '460eabe57a4af005ddd9e0b33bd871cd'], 'Cavernoma fica com os 2 assets distintos');
  assert.equal(schwannomaFinal.images.some((i) => i.assetId === '460eabe57a4af005ddd9e0b33bd871cd' || i.assetId === '2ccbe78da9718ebfe799a00345d305d0'), false, 'Schwannoma vestibular nao pode ficar com nenhum dos 2 assets de Cavernoma');
  assert.deepEqual(plain(avcFinal.images.map((i) => i.assetId)), ['03f470a828fbe7a4b5236219ae042596'], 'AVC isquemico agudo recebe a UNICA copia do asset (deduplicado)');
  assert.equal(gangrenaFinal.images.length, 0, 'Gangrena de Fournier termina SEM a imagem de AVC — decisao explicita do usuario');

  // confirma que a evidencia fisica (assetId/publicId) sobrevive intacta
  assert.equal(epidermoideFinal.images[0].publicId, 'atlas-radiologico/rvdvnnzfb0njskyjfk4k');
  assert.equal(avcFinal.images[0].publicId, 'atlas-radiologico/j6si2eycbufajb5nasvw');
});

test('OWNERSHIP no snapshot REAL: nenhuma imagem do SEED foi reincorporada artificialmente durante a correcao com overrides', () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  const preview = context.reconcileV2Preview();

  const dataOnly = new Set();
  for (const e of parsed.entries) {
    const key = context.identityKeyOfV2(e);
    for (const img of (e.images || [])) { const ik = context.stableImageKeyV208(img); if (ik) dataOnly.add(`${key}|||${ik}`); }
  }
  const seedOnly = new Set();
  for (const e of REAL_SEED) {
    const key = context.identityKeyOfV2(e);
    for (const img of (e.images || [])) { const ik = context.stableImageKeyV208(img); if (ik) seedOnly.add(`${key}|||${ik}`); }
  }
  const seedExclusive = [...seedOnly].filter((a) => !dataOnly.has(a));
  assert.equal(seedExclusive.length, 10, 'o SEED continua tendo 10 associacoes de imagem que o DATA real nao tem');

  const final = new Set();
  for (const e of preview.state.data) {
    const key = context.identityKeyOfV2(e);
    for (const img of (e.images || [])) { const ik = context.stableImageKeyV208(img); if (ik) final.add(`${key}|||${ik}`); }
  }
  const leaked = seedExclusive.filter((a) => final.has(a));
  assert.equal(leaked.length, 0, 'nenhuma das 10 associacoes exclusivas do SEED pode vazar pro resultado, nem com os overrides manuais ativos');
});

// ===========================================================================
// VALIDACAO POS-APLICACAO — buildPostApplyValidationReportV2 roda READ-ONLY
// depois que a mutacao real ja aconteceu (DATA/REVIEW/SRS ja substituidos).
// Simula uma aplicacao real (applyReconcileV2 com skipConfirm) sobre o
// snapshot real e confere que o relatorio pos-aplicacao reflete exatamente
// o estado final, incluindo as 6 verificacoes nominais dos overrides
// manuais de 2026-09-19.
// ===========================================================================

test('VALIDACAO POS-APLICACAO: buildPostApplyValidationReportV2 e read-only e nao referencia Firebase/Cloudinary/storage', () => {
  const fn = extractFunction(html, 'buildPostApplyValidationReportV2');
  assert.ok(!fn.source.includes('storage.'), 'validacao pos-aplicacao nao pode persistir nada');
  assert.ok(!fn.source.includes('pushToFirebase'));
  assert.ok(!fn.source.includes('DATA =') && !fn.source.includes('REVIEW =') && !fn.source.includes('SRS ='), 'nao pode reatribuir os globais');
});

test('VALIDACAO POS-APLICACAO no snapshot REAL: apos aplicar de verdade (simulado), o relatorio pos-aplicacao bate com os numeros do dry-run e as 6 verificacoes nominais passam', async () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context, storageSetLog } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });

  const result = await context.applyReconcileV2({ skipConfirm: true, downloadFn: () => {} });
  assert.equal(result.applied, true);
  assert.equal(storageSetLog.length, 3, 'aplicacao real precisa persistir DATA/REVIEW/SRS localmente');

  const post = context.buildPostApplyValidationReportV2();
  assert.equal(post.dataLength, 1213);
  assert.equal(post.uniqueIdentityCount, 1213);
  assert.equal(post.duplicateGroupCount, 0);
  assert.equal(post.recordsWithImagesCount, 51);
  assert.equal(post.totalImageCount, 61);
  assert.equal(post.physicalAssetsCount, 61);
  assert.equal(post.ownershipMismatchesCount, 0);
  assert.equal(post.reviewCount, 89);
  assert.equal(post.srsCount, 26);
  assert.equal(post.seedCoverage, 1213);
  assert.equal(post.seedTotal, 1213);
  assert.equal(post.allNominalChecksPassed, true);
  for (const check of plain(post.nominalChecks)) {
    assert.equal(check.pass, true, `verificacao nominal falhou: ${check.label}`);
  }
});

// ===========================================================================
// CHECKPOINT POS-RECONCILIACAO V2 — export somente leitura de DATA/REVIEW/SRS
// atuais + relatorio de integridade. NUNCA muta nada, NUNCA sincroniza
// Firebase, NUNCA toca Cloudinary, NUNCA roda a reconciliacao de novo.
// ===========================================================================

test('CHECKPOINT V2: exportCheckpointV2 NAO modifica DATA/REVIEW/SRS', async () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  await context.applyReconcileV2({ skipConfirm: true, downloadFn: () => {} });

  const dataSnapshot = plain(context.DATA);
  const reviewSnapshot = plain(context.REVIEW);
  const srsSnapshot = plain(context.SRS);

  const result = context.exportCheckpointV2({ confirmFn: () => true, downloadFn: () => {} });

  assert.equal(result.exported, true);
  assert.deepEqual(plain(context.DATA), dataSnapshot, 'DATA nao pode mudar por exportar o checkpoint');
  assert.deepEqual(plain(context.REVIEW), reviewSnapshot, 'REVIEW nao pode mudar por exportar o checkpoint');
  assert.deepEqual(plain(context.SRS), srsSnapshot, 'SRS nao pode mudar por exportar o checkpoint');
});

test('CHECKPOINT V2: JSON exportado pode ser parseado e contem DATA/REVIEW/SRS completos', async () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  await context.applyReconcileV2({ skipConfirm: true, downloadFn: () => {} });

  let downloadedCheckpoint = null;
  const result = context.exportCheckpointV2({
    confirmFn: () => true,
    downloadFn: (checkpoint) => {
      const serialized = JSON.stringify(checkpoint);
      downloadedCheckpoint = JSON.parse(serialized);
    }
  });

  assert.equal(result.exported, true);
  assert.ok(downloadedCheckpoint, 'o JSON exportado precisa ser parseavel');
  assert.equal(downloadedCheckpoint.format, 'atlas-radiologico-checkpoint-v2');
  assert.equal(typeof downloadedCheckpoint.checkpointVersion, 'number');
  assert.ok(downloadedCheckpoint.exportedAt);
  assert.equal(downloadedCheckpoint.data.length, 1213, 'DATA exportado precisa ter os 1213 registros do estado atual');
  assert.equal(Object.keys(downloadedCheckpoint.review).length, Object.keys(plain(context.REVIEW)).length);
  assert.equal(Object.keys(downloadedCheckpoint.srs).length, Object.keys(plain(context.SRS)).length);
  assert.ok(downloadedCheckpoint.integrity, 'precisa incluir o bloco de integridade');
});

test('CHECKPOINT V2 no estado pos-reconciliacao real: identidades unicas, assets nao duplicados, ownership consistente, cobertura SEED completa — zero problemas', async () => {
  const { parsed } = loadFullCatalogSnapshot();
  const { context } = makeToolContext({ data: parsed.entries, review: parsed.review, srs: parsed.srs, seed: REAL_SEED });
  await context.applyReconcileV2({ skipConfirm: true, downloadFn: () => {} });

  const integrity = context.buildCheckpointIntegrityReportV2();
  assert.equal(integrity.dataLength, 1213);
  assert.equal(integrity.uniqueIdentityCount, 1213, 'identidades continuam unicas — 1 por registro');
  assert.equal(integrity.duplicateGroupCount, 0);
  assert.equal(integrity.duplicatedAssetsCount, 0, 'nenhum asset fisico anexado a mais de um registro');
  assert.equal(integrity.ownershipMismatchesCount, 0, 'ownership permanece consistente');
  assert.equal(integrity.seedCoverage, integrity.seedTotal, 'cobertura do SEED permanece completa');
  assert.equal(integrity.hasIssues, false);
  assert.deepEqual(plain(integrity.issues), []);
});

test('CHECKPOINT V2: quando ha problema de integridade, NAO exporta sem confirmacao explicita — mas nao bloqueia silenciosamente', () => {
  const data = [
    { id: 'x1', name: 'Duplicada', s: 'S', site: 'T', images: [] },
    { id: 'x2', name: 'Duplicada', s: 'S', site: 'T', images: [] }
  ];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed: [] });

  const integrity = context.buildCheckpointIntegrityReportV2();
  assert.equal(integrity.hasIssues, true);
  assert.equal(integrity.duplicateGroupCount, 1);

  let confirmCalled = false;
  let confirmMessage = null;
  let downloadCalled = false;
  const cancelled = context.exportCheckpointV2({
    confirmFn: (msg) => { confirmCalled = true; confirmMessage = msg; return false; },
    downloadFn: () => { downloadCalled = true; }
  });
  assert.equal(confirmCalled, true, 'precisa pedir confirmacao explicita quando ha problema');
  assert.ok(confirmMessage.includes('grupo(s) de identidade duplicada'), 'a mensagem precisa explicar exatamente o problema');
  assert.equal(cancelled.exported, false);
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(downloadCalled, false, 'nao pode baixar nada se o usuario nao confirmou');

  const confirmed = context.exportCheckpointV2({
    confirmFn: () => true,
    downloadFn: () => { downloadCalled = true; }
  });
  assert.equal(confirmed.exported, true);
  assert.equal(downloadCalled, true);
});

test('CHECKPOINT V2: sem nenhum problema de integridade, exporta sem exigir confirmFn', () => {
  const data = [{ id: 'x1', name: 'Unica', s: 'S', site: 'T', images: [] }];
  const seed = [{ id: 'x1', name: 'Unica', s: 'S', site: 'T' }];
  const { context } = makeToolContext({ data, review: {}, srs: {}, seed });

  let confirmCalled = false;
  let downloadCalled = false;
  const result = context.exportCheckpointV2({
    confirmFn: () => { confirmCalled = true; return true; },
    downloadFn: () => { downloadCalled = true; }
  });
  assert.equal(result.exported, true);
  assert.equal(confirmCalled, false, 'sem problemas, nao precisa nem chamar confirmFn');
  assert.equal(downloadCalled, true);
});

test('CHECKPOINT V2: recalcula a integridade DO ZERO no momento da exportacao (nunca confia em um relatorio antigo)', () => {
  const fn = extractFunction(html, 'exportCheckpointV2');
  assert.ok(fn.source.includes('buildCheckpointV2()'), 'precisa chamar buildCheckpointV2() (que recalcula tudo) dentro da propria funcao, nao receber um relatorio pronto como parametro');
});

test('CHECKPOINT V2: nenhuma funcao da cadeia (integridade/export/modal) muta DATA/REVIEW/SRS ou reatribui os globais', () => {
  for (const name of ['buildCheckpointIntegrityReportV2', 'buildCheckpointV2', 'downloadCheckpointV2', 'exportCheckpointV2', 'openExportCheckpointV2Modal']) {
    const fn = extractFunction(html, name);
    assert.ok(!/\bDATA\s*=[^=]/.test(fn.source), `${name} nao pode reatribuir DATA`);
    assert.ok(!/\bREVIEW\s*=[^=]/.test(fn.source), `${name} nao pode reatribuir REVIEW`);
    assert.ok(!/\bSRS\s*=[^=]/.test(fn.source), `${name} nao pode reatribuir SRS`);
    assert.ok(!fn.source.includes('storage.set'), `${name} nao pode escrever em storage/localStorage`);
    assert.ok(!fn.source.includes('reconcileCatalogByIdentityV2') && !fn.source.includes('reconcileV2Preview'), `${name} nao pode rodar a reconciliacao de novo`);
  }
});

test('CHECKPOINT V2: nome do arquivo segue o padrao atlas-radiologico-checkpoint-pos-reconciliacao-v2_data_hora.json', () => {
  const links = [];
  const fakeDoc = {
    createElement: () => {
      const a = { click(){}, remove(){} };
      links.push(a);
      return a;
    },
    body: { appendChild(){} }
  };
  const { context } = makeToolContext({ data: [], review: {}, srs: {}, seed: [] });
  context.document = fakeDoc;
  context.Blob = function(parts, opts){ this.parts = parts; this.opts = opts; };
  context.URL = { createObjectURL: () => 'blob:mock' };
  context.downloadCheckpointV2(context.buildCheckpointV2());
  assert.equal(links.length, 1);
  assert.match(links[0].download, /^atlas-radiologico-checkpoint-pos-reconciliacao-v2_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
});
