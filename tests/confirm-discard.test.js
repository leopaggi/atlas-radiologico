'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function fnBlock(name) {
  const i = html.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' existe');
  return html.slice(i, i + 4000);
}

test('aviso de descarte: existe, pergunta sim/não e foca em "não" (seguro)', () => {
  const src = fnBlock('confirmDiscardChanges');
  assert.match(src, /perder as alterações/);
  assert.match(src, /discard-confirm-yes/);
  assert.match(src, /discard-confirm-no/);
  assert.match(src, /discard-confirm-no'\)\.focus\(\)/);
  // sem alterações → sai direto, sem perguntar
  assert.match(src, /if\(!dirty\)\{ onDiscard\(\); return; \}/);
});

test('aviso de descarte: clique fora do construtor de quadro, do modal de imagens e do editor passa pelo aviso', () => {
  assert.match(html, /cov\.onclick=e=>\{ if\(e\.target===cov\) confirmDiscardChanges\(/);
  assert.match(html, /cov\.addEventListener\('click', ev=>\{ if\(ev\.target===cov\) confirmDiscardChanges\(/);
  assert.match(html, /if\(ev\.target===ov\)\{\s*confirmDiscardChanges\(/);
});

test('aviso de descarte: Esc continua fechando direto (sem pergunta) nos três lugares', () => {
  assert.match(html, /const closeFormOnEsc = \(ev\)=>\{\s*if\(ev\.key==='Escape' && ov\.isConnected\)\{\s*releasePendingObjectUrls\(\);\s*closeForm\(\);/);
  assert.match(html, /const escHandler = ev=>\{ if\(ev\.key==='Escape' && cov\.isConnected\)\{ ev\.stopPropagation\(\); close\(\); \} \};\n  const close = \(\)=>\{ releaseDraftObjectUrls\(\)/);
});
