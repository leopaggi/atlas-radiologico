'use strict';

/* Compactação dos cards da aba Propostas (modal 💡 Soluções) — com
 * dezenas/centenas de propostas, renderizar proposedChanges.notes inteira
 * expandida em TODO card deixava a lista impraticável de rolar/escanear.
 * Correção: por padrão só uma prévia compacta (rótulos dos campos
 * propostos); "ver proposta completa"/"recolher" alterna pra o diff
 * completo (mesmo renderFieldChangesHtml/notesDifferentialsHtml de sempre —
 * nenhum parser novo). Expansão só em memória (Set local ao modal),
 * nunca persistida — fecha o modal, esquece.
 *
 * Mesma técnica de tests/solucoes-ver-lesao-hover.test.js: extrai o corpo
 * REAL de openReadySolutionsModal/renderProposedList do index.html.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  const open = source.indexOf('{', m.index);
  let depth = 0, quote = '', esc = false, line = false, block = false, end = -1;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i += 1; } continue; }
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i += 1; continue; }
    if (c === '/' && n === '*') { block = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, 'função sem fechamento: ' + name);
  return source.slice(m.index, end + 1);
}

const readySolutionsSrc = extractFn(html, 'openReadySolutionsModal');
const proposedListSrc = readySolutionsSrc.slice(
  readySolutionsSrc.indexOf('const renderProposedList'),
  readySolutionsSrc.indexOf('const renderAppliedList')
);

test('1. card inicialmente compacto: o diff completo nasce "hidden" quando a revisão não está em expandedProposalIds', () => {
  assert.match(proposedListSrc, /const isExpanded = expandedProposalIds\.has\(r\.id\);/);
  assert.match(proposedListSrc, /class="review-proposal-full-diff" \$\{isExpanded \? '' : 'hidden'\}/,
    'o container do diff completo só fica visível (sem "hidden") quando isExpanded é true');
});

test('2. proposedChanges.notes completa NUNCA fica sempre expandida por padrão: a prévia compacta (só rótulos) é o que aparece sem interação', () => {
  assert.match(proposedListSrc, /class="review-proposal-compact-preview">Campos propostos: \$\{compactProposalFieldsHtml\(diffRows\)\}/,
    'por padrão só os RÓTULOS dos campos aparecem, nunca notesDifferentialsHtml direto fora do container escondido');
  // compactProposalFieldsHtml nunca chama notesDifferentialsHtml — é só rótulo.
  const compactFn = extractFn(html, 'compactProposalFieldsHtml');
  assert.doesNotMatch(compactFn, /notesDifferentialsHtml/);
});

test('3. expandir mostra o diff completo via renderFieldChangesHtml (que já reaproveita notesDifferentialsHtml para notes)', () => {
  assert.match(proposedListSrc, /class="review-proposal-full-diff"[^>]*>\$\{renderFieldChangesHtml\(diffRows\)\}<\/div>/);
  const renderFieldsFn = extractFn(html, 'renderFieldChangesHtml');
  assert.match(renderFieldsFn, /notesDifferentialsHtml\(r\.to\)/, 'renderFieldChangesHtml continua sendo o único lugar que formata notes propostas');
});

test('4. botão alterna "ver proposta completa" ⇄ "recolher", mostrando/ocultando o MESMO container (nenhum re-render pesado da lista)', () => {
  const toggleBlock = proposedListSrc.slice(proposedListSrc.indexOf('const toggleBtn'), proposedListSrc.indexOf('if(meta.found)'));
  assert.match(toggleBlock, /fullDiffEl\.hidden = !nowExpanded/, 'recolher volta a ocultar o container (hidden=true)');
  assert.match(toggleBlock, /toggleBtn\.textContent = nowExpanded \? 'recolher' : 'ver proposta completa'/);
  assert.match(toggleBlock, /if\(nowExpanded\) expandedProposalIds\.add\(r\.id\); else expandedProposalIds\.delete\(r\.id\);/);
});

test('expansão é só em memória (Set local ao modal) — nunca persistida em storage/LESION_REVISIONS/saveData', () => {
  assert.match(readySolutionsSrc, /const expandedProposalIds = new Set\(\);/);
  // o Set nunca é lido/escrito fora deste módulo (nunca entra em storage/saveLesionRevisions).
  for (const forbidden of ['localStorage', 'storage.set', 'saveLesionRevisions(expandedProposalIds', 'saveData(expandedProposalIds']) {
    assert.ok(!readySolutionsSrc.includes(forbidden), 'expandedProposalIds nunca deveria aparecer perto de ' + forbidden);
  }
});

test('o botão "ver proposta completa"/"recolher" e a prévia compacta só existem quando há changes reais (hasChanges) — no_change não ganha um toggle vazio', () => {
  const block = proposedListSrc.slice(proposedListSrc.indexOf('const hasChanges'), proposedListSrc.indexOf('</div>\n        <div class="review-center-row-actions">'));
  assert.match(block, /\$\{hasChanges \? `/);
});

test('compactProposalFieldsHtml nunca referencia DATA/saveData/autorização — é só rótulo (mini-tag) por campo', () => {
  const compactFn = extractFn(html, 'compactProposalFieldsHtml');
  for (const forbidden of ['DATA', 'saveData', 'authorizeAndApplyReviewSolution']) {
    assert.doesNotMatch(compactFn, new RegExp('\\b' + forbidden + '\\b'));
  }
});
