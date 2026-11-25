const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('CSS: legenda expandida sobe até ~metade da tela, por cima da imagem, com fundo translúcido', () => {
  const m = html.match(/\.lightbox-desc\.expanded\{[^}]*\}/);
  assert.ok(m, 'regra .lightbox-desc.expanded presente');
  assert.match(m[0], /position:fixed/);
  assert.match(m[0], /max-height:55vh/);
  assert.match(m[0], /background:rgba\([^)]*,\.55\)/, 'fundo translúcido (imagem visível atrás)');
  assert.match(html, /\.lightbox-desc\.expanded \.lightbox-desc-text\{[^}]*max-height:calc\(55vh/);
});

test('clique no texto alterna expandir/recolher, sem fechar o lightbox e sem atrapalhar seleção de texto', () => {
  assert.match(html, /descEl\.classList\.toggle\('expanded'\)/);
  assert.match(html, /if\(sel && String\(sel\)\.length > 0\) return;/);
  assert.match(html, /e\.stopPropagation\(\);\n\s*descEl\.classList\.toggle/);
});

test('ESC: com a legenda expandida o 1º ESC só recolhe; senão fecha como sempre', () => {
  assert.match(html, /if\(e\.key==='Escape' && descEl && descEl\.classList && descEl\.classList\.contains\('expanded'\)\)\{ descEl\.classList\.remove\('expanded'\); return; \}/);
  assert.match(html, /if\(e\.key==='Escape'\)\{ closeLb\(\); return; \}/);
});
