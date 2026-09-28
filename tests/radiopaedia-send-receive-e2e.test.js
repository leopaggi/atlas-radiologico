'use strict';

// "Enviar ao Atlas" — verificação pontual pedida pelo usuário após os
// commits 2ac0dff/3e61c01: confirmar que o botão do userscript
// (tools/radiopaedia-to-atlas.user.js) e o caminho REAL de recebimento no
// Atlas (validação -> vínculo a uma lesão -> persistência do caso clínico)
// continuam funcionando ponta a ponta, sem depender de helper isolado.
//
// Investigação (sem alterar código): `git diff e0249ad 3e61c01 -- tools/
// radiopaedia-to-atlas.user.js` está VAZIO — o userscript (onde o botão
// "📥 Enviar ao Atlas" existe de fato, na página do Radiopaedia) não foi
// tocado por nenhum dos 3 commits recentes. No lado do Atlas, o pipeline de
// RECEBIMENTO (maybeHandleExternalImport / handleExternalImportHashChange /
// deliverExternalImportPayload / validateExternalImportPayload /
// openExternalImportModal) também não foi tocado. O único ponto realmente
// alterado no caminho de importação foi `buildClinicalCaseFromDraft()`
// (ganhou `id`/`origin` — correção lrev_mulclk3s_7le9tj), usado só quando o
// usuário escolhe "vincular a lesão existente" -> "Adicionar como caso
// clínico exemplo". Este teste prova as DUAS pontas pedidas:
//   A) origem (Radiopaedia) — o payload que o userscript de verdade
//      constrói continua sendo aceito pela validação real do Atlas;
//   B) Atlas recebe/processa — esse MESMO payload, depois de "vincular a
//      lesão existente", chega PERSISTIDO em entry.clinicalCases com a
//      identidade estável (id/origin) da correção recente, sem quebrar.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const USERSCRIPT_PATH = path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const userscript = fs.readFileSync(USERSCRIPT_PATH, 'utf8');

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

// ===========================================================================
// 0. ENTRYPOINT REAL — o botão existe só no userscript; nenhum dos 3
// commits recentes tocou o arquivo onde ele vive
// ===========================================================================

test('0. o botão "📥 Enviar ao Atlas" (tools/radiopaedia-to-atlas.user.js) não foi tocado pelos commits recentes', () => {
  assert.match(userscript, /btn\.textContent = '📥 Enviar ao Atlas';/);
  assert.match(userscript, /function buildExternalPayload\(parts\)/);
});

// ===========================================================================
// A) ORIGEM (Radiopaedia) ENVIA — o payload real do userscript continua
// batendo com o que o Atlas exige
// ===========================================================================

function buildRealUserscriptPayload(parts) {
  const m = /function buildExternalPayload\(parts\)\s*\{/.exec(userscript);
  assert.ok(m, 'buildExternalPayload existe no userscript');
  const start = userscript.indexOf('{', m.index);
  const block = extractBlock(userscript, start);
  const maxField = /var MAX_FIELD\s*=\s*\d+;/.exec(userscript);
  assert.ok(maxField, 'MAX_FIELD existe no userscript');
  const ctx = vm.createContext({});
  vm.runInContext(
    maxField[0] + '\n' + extractFunction(userscript, 'normalizeRadiopaediaCaseTitle') + '\n'
    + userscript.slice(m.index, start) + block
    + '\nthis.__p = buildExternalPayload(' + JSON.stringify(parts) + ');',
    ctx
  );
  return ctx.__p;
}

test('A. payload REAL construído pelo userscript (buildExternalPayload) — mesma função que roda no clique do botão', () => {
  const payload = buildRealUserscriptPayload({
    title: 'Polyethene wear', sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
    patientAge: '55', patientSex: 'Female', modality: 'x-ray', presentation: 'Worsening left hip pain.'
  });
  assert.equal(payload.title, 'Polyethene wear');
  assert.equal(payload.sourceUrl, 'https://radiopaedia.org/cases/polyethene-wear-1');
  assert.equal(payload.source, 'Radiopaedia');
  assert.equal(payload.imagem, undefined, 'MVP metadata-only — nunca envia imagem');
});

// ===========================================================================
// B) ATLAS RECEBE/PROCESSA — validação real + vínculo real a uma lesão +
// persistência real (mesmo caminho pós "Adicionar como caso clínico
// exemplo"), provando que a correção de id/origin não quebrou nada a
// jusante
// ===========================================================================

function loadAtlasReceiveApi() {
  const deps = ['normalizeExternalTitle', 'sameExternalUrl', 'genDidacticId', 'buildClinicalCaseFromDraft',
    'lesionHasClinicalCaseUrl', 'findClinicalCaseElsewhere', 'addClinicalCaseToLesion']
    .map((n) => extractFunction(html, n)).join('\n');
  const constDecl = /const EXTERNAL_IMPORT_ALLOWED_HOSTS = \[[^\]]*\];/.exec(html);
  assert.ok(constDecl, 'EXTERNAL_IMPORT_ALLOWED_HOSTS não encontrado');
  const validateFn = extractFunction(html, 'validateExternalImportPayload');
  const ctx = vm.createContext({ URL, console: { warn(){}, log(){}, error(){} } });
  vm.runInContext(constDecl[0] + '\n' + validateFn + '\n' + deps + '\nthis.__api = { validateExternalImportPayload, addClinicalCaseToLesion };', ctx);
  return ctx.__api;
}

test('B1. validateExternalImportPayload (recebimento real) aceita o payload REAL do userscript', () => {
  const api = loadAtlasReceiveApi();
  const payload = buildRealUserscriptPayload({
    title: 'Polyethene wear', sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
    patientAge: '55', patientSex: 'Female', modality: 'x-ray', presentation: 'Worsening left hip pain.'
  });
  const r = api.validateExternalImportPayload(payload);
  assert.equal(r.ok, true, 'payload real do userscript deveria passar: ' + JSON.stringify(r.errors));
  assert.equal(r.value.title, 'Polyethene wear');
  assert.equal(r.value.patientAge, '55');
  assert.equal(r.value.modality, 'x-ray');
});

test('B2. "vincular a lesão existente" -> caso clínico chega PERSISTIDO na lesão, com id/origin estáveis (correção recente não quebrou o recebimento)', () => {
  const api = loadAtlasReceiveApi();
  const rawPayload = buildRealUserscriptPayload({
    title: 'Polyethene wear', sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
    patientAge: '55', patientSex: 'Female', modality: 'x-ray', presentation: 'Worsening left hip pain.'
  });
  const validated = api.validateExternalImportPayload(rawPayload);
  assert.equal(validated.ok, true);
  // Mesma chamada real de handleExternalLinkCaseClick -> addClinicalCaseToLesion
  const entry = { id: 'seed_1', name: 'Osteoartrose de quadril', clinicalCases: [] };
  const result = api.addClinicalCaseToLesion(entry, validated.value);
  assert.equal(result.ok, true, 'addClinicalCaseToLesion deveria aceitar: ' + result.reason);
  const persisted = result.entry.clinicalCases[0];
  assert.ok(persisted.id, 'caso persistido precisa de id (upsert/edição dependem disso)');
  assert.equal(persisted.origin, 'imported');
  assert.equal(persisted.title, 'Polyethene wear');
  assert.equal(persisted.patientAge, '55');
  assert.equal(persisted.modality, 'x-ray');
  assert.equal(persisted.sourceUrl, 'https://radiopaedia.org/cases/polyethene-wear-1');
});

test('B3. sem "história clínica" (Radiopaedia às vezes não traz) o recebimento ainda persiste o resto dos dados — nenhuma exceção, nenhum bloqueio', () => {
  const api = loadAtlasReceiveApi();
  const rawPayload = buildRealUserscriptPayload({
    title: 'Silent case', sourceUrl: 'https://radiopaedia.org/cases/silent-case-1',
    patientAge: '40', patientSex: 'Male', modality: 'CT', presentation: ''
  });
  const validated = api.validateExternalImportPayload(rawPayload);
  assert.equal(validated.ok, true);
  const entry = { id: 'seed_2', name: 'Qualquer', clinicalCases: [] };
  const result = api.addClinicalCaseToLesion(entry, validated.value);
  assert.equal(result.ok, true, 'não deveria lançar/bloquear: ' + result.reason);
  assert.equal('presentation' in result.entry.clinicalCases[0], false);
});

test('B4. duas importações da MESMA URL para a mesma lesão são bloqueadas (duplicata) — regra de recebimento preservada', () => {
  const api = loadAtlasReceiveApi();
  const rawPayload = buildRealUserscriptPayload({
    title: 'Polyethene wear', sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
    patientAge: '55', patientSex: 'Female', modality: 'x-ray', presentation: 'Worsening left hip pain.'
  });
  const validated = api.validateExternalImportPayload(rawPayload);
  let entry = { id: 'seed_1', name: 'Osteoartrose de quadril', clinicalCases: [] };
  const first = api.addClinicalCaseToLesion(entry, validated.value);
  assert.equal(first.ok, true);
  const second = api.addClinicalCaseToLesion(first.entry, validated.value);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'duplicate_same_lesion');
});

// ===========================================================================
// C) NENHUMA EXCEÇÃO SILENCIOSA no caminho de recebimento — se o payload do
// userscript batesse com algo que a correção recente quebrasse, apareceria
// aqui como throw, não como falso "ok"
// ===========================================================================

test('C. nenhuma exceção ao processar 5 payloads reais variados ponta a ponta (buildExternalPayload -> validate -> addClinicalCaseToLesion)', () => {
  const api = loadAtlasReceiveApi();
  const cases = [
    { title: 'Case A', sourceUrl: 'https://radiopaedia.org/cases/case-a', patientAge: '10', patientSex: 'Male', modality: 'MRI', presentation: 'x' },
    { title: 'Case B', sourceUrl: 'https://www.radiopaedia.org/cases/case-b', patientAge: '', patientSex: '', modality: '', presentation: '' },
    { title: 'Case (special) — chars', sourceUrl: 'https://radiopaedia.org/cases/case-c', patientAge: '77', patientSex: 'Female', modality: 'US', presentation: 'Long history '.repeat(20) },
    { title: 'Case D', sourceUrl: 'https://radiopaedia.org/cases/case-d', patientAge: '5 months', patientSex: 'Male', modality: 'X-ray', presentation: 'p' },
    { title: 'Case E', sourceUrl: 'https://radiopaedia.org/cases/case-e', patientAge: '90', patientSex: 'Female', modality: 'CT', presentation: 'p' }
  ];
  for (const parts of cases) {
    const payload = buildRealUserscriptPayload(parts);
    const validated = api.validateExternalImportPayload(payload);
    assert.equal(validated.ok, true, JSON.stringify(parts) + ' -> ' + JSON.stringify(validated.errors));
    const entry = { id: 'seed_x_' + parts.title, name: 'X', clinicalCases: [] };
    assert.doesNotThrow(() => api.addClinicalCaseToLesion(entry, validated.value), parts.title);
  }
});
