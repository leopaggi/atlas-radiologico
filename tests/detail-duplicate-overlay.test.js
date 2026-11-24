'use strict';
// Depois de "concluído" no fluxo do Radiopaedia, openDetail() é chamado de novo
// com o detalhe anterior ainda aberto por baixo. Antes, os botões eram achados
// por document.getElementById (ids duplicados -> pegava o botão do detalhe de
// BAIXO) e o "editar" do detalhe de cima ficava sem função (travado).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('openDetail define detailEl com ov.querySelector e usa só ele para os botões', () => {
  assert.match(html, /const detailEl = \(elId\) => \(typeof ov\.querySelector === 'function' && ov\.querySelector\('#' \+ elId\)\) \|\| document\.getElementById\(elId\);/);
});

test('openDetail acha seus botões DENTRO da própria janela (nunca pelo document inteiro)', () => {
  const a = html.indexOf('function openDetail(id, opts){');
  const b = html.indexOf('\nfunction ', a + 20);
  const src = html.slice(a, b > 0 ? b : a + 30000);
  for (const id of ['btn-close', 'btn-edit', 'btn-del', 'btn-back-today', 'btn-clear-filters', 'review-btn-row', 'detail-img-gallery']) {
    assert.ok(!src.includes("document.getElementById('" + id + "')"), id + ' não pode ser buscado no document');
    assert.ok(src.includes("detailEl('" + id + "')"), id + ' é buscado por detailEl (dentro de ov)');
  }
});
