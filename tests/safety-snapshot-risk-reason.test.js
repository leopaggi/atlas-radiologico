'use strict';

// TAXO-04C0B — testes do novo risk reason adicionado a
// SAFETY_SNAPSHOT_RISK_REASONS (index.html) para a futura 1ª escrita real
// de attributes. Mesmo padrão de extração+vm usado em
// tests/taxonomy-panel.test.js: extrai o código REAL de index.html e roda
// isolado, nunca toca DATA/SEED/Firestore/IndexedDB/localStorage reais.
// Esta rodada SÓ adiciona o motivo à allowlist — createSafetySnapshot()
// não é chamado em lugar nenhum com esse motivo ainda.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

const NEW_REASON = 'antes de aplicar migração de atributos taxonômicos';
const NEWEST_REASON = 'imediatamente antes de persistir migração de atributos taxonômicos';

function extractConst(source, name) {
  const declaration = new RegExp('\\b(?:const|let)\\s+' + name + '\\s*=').exec(source);
  assert.ok(declaration, 'Constante ' + name + ' não encontrada');
  const semi = source.indexOf(';', declaration.index);
  assert.notEqual(semi, -1, 'Fim de statement (";") não encontrado para ' + name);
  return source.slice(declaration.index, semi + 1);
}

function extractFunction(source, name) {
  const declaration = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  assert.ok(declaration, 'Função ' + name + ' não encontrada');
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  let depth = 0, idx = openingBrace;
  for (; idx < source.length; idx++) {
    if (source[idx] === '{') depth++;
    else if (source[idx] === '}') { depth--; if (depth === 0) { idx++; break; } }
  }
  return source.slice(declaration.index, idx);
}

const src = [
  extractConst(html, 'SAFETY_SNAPSHOT_RISK_REASONS'),
  extractFunction(html, 'isRiskSnapshotReason')
].join('\n');

const ctx = vm.createContext({});
vm.runInContext(src + '\nthis.__api = { SAFETY_SNAPSHOT_RISK_REASONS, isRiskSnapshotReason };', ctx);
const { SAFETY_SNAPSHOT_RISK_REASONS, isRiskSnapshotReason } = ctx.__api;

test('1. isRiskSnapshotReason reconhece o novo motivo "antes de aplicar migração de atributos taxonômicos"', () => {
  assert.equal(isRiskSnapshotReason(NEW_REASON), true);
});

test('2. o novo motivo está literalmente presente na allowlist (não reaproveita um motivo existente por engano)', () => {
  assert.ok(SAFETY_SNAPSHOT_RISK_REASONS.includes(NEW_REASON));
});

test('3. os 11 motivos pré-existentes continuam todos presentes (nenhuma remoção acidental)', () => {
  const PREVIOUS_REASONS = [
    'antes de importar backup',
    'antes de restaurar padrão de fábrica',
    'antes da recuperação de dados antigos',
    'antes de forçar fusão de duplicatas',
    'antes de aplicar reconciliação V2',
    'antes de restaurar snapshot de segurança',
    'antes de operação em massa de ownership',
    'antes de corrigir classificações inválidas',
    'antes de migrar sítio de lesão',
    'antes da fusão clínica controlada de duplicatas aprovadas',
    'antes de aplicar decisões de auditoria de tags',
    NEW_REASON
  ];
  PREVIOUS_REASONS.forEach(r => assert.ok(SAFETY_SNAPSHOT_RISK_REASONS.includes(r), 'motivo pré-existente perdido: ' + r));
  assert.equal(SAFETY_SNAPSHOT_RISK_REASONS.length, PREVIOUS_REASONS.length + 1);
});

test('7. isRiskSnapshotReason reconhece o motivo mais novo "imediatamente antes de persistir migração de atributos taxonômicos"', () => {
  assert.equal(isRiskSnapshotReason(NEWEST_REASON), true);
});

test('8. o motivo mais novo é literalmente distinto do motivo anterior (não é o mesmo texto reaproveitado)', () => {
  assert.notEqual(NEWEST_REASON, NEW_REASON);
  assert.ok(SAFETY_SNAPSHOT_RISK_REASONS.includes(NEWEST_REASON));
  assert.ok(SAFETY_SNAPSHOT_RISK_REASONS.includes(NEW_REASON));
});

test('9. createSafetySnapshot() não é chamado em lugar nenhum de index.html com o motivo mais novo ainda (só a allowlist foi tocada)', () => {
  const callSites = [...html.matchAll(/createSafetySnapshot\s*\(\s*(['"`])((?:(?!\1).)*)\1/g)].map(m => m[2]);
  assert.ok(!callSites.includes(NEWEST_REASON));
});

test('10. o motivo mais novo aparece exatamente 1 vez em todo index.html', () => {
  const occurrences = html.split(NEWEST_REASON).length - 1;
  assert.equal(occurrences, 1);
});

test('4. motivo arbitrário fora da allowlist continua recusado (regressão)', () => {
  assert.equal(isRiskSnapshotReason('motivo qualquer inventado'), false);
  assert.equal(isRiskSnapshotReason(''), false);
  assert.equal(isRiskSnapshotReason(undefined), false);
});

test('5. createSafetySnapshot() não é chamado em lugar nenhum de index.html com o novo motivo (só a allowlist foi tocada nesta rodada)', () => {
  const callSites = [...html.matchAll(/createSafetySnapshot\s*\(\s*(['"`])((?:(?!\1).)*)\1/g)].map(m => m[2]);
  assert.ok(!callSites.includes(NEW_REASON), 'o novo motivo não deveria ter nenhum call site ainda nesta rodada');
});

test('6. o novo motivo aparece exatamente 1 vez em todo index.html (só dentro da allowlist)', () => {
  const occurrences = html.split(NEW_REASON).length - 1;
  assert.equal(occurrences, 1);
});
