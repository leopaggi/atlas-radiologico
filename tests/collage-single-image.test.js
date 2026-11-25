const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('quadro aceita 1 imagem (mínimo 1, máximo 8)', () => {
  assert.match(html, /cole ou selecione de 1 a 8 imagens/);
  assert.match(html, /if\(items\.length<1\)\{toast\('Adicione pelo menos 1 imagem\.'\)/);
  assert.doesNotMatch(html, /Adicione pelo menos 2 imagens/);
  assert.match(html, /if\(finalBlob&&items\.length>=1\)generateCollage\(\)/);
  assert.match(html, /if\(items\.length>8\)\{toast\('Máximo de 8 imagens\.'\)/);
});

test('quadro de 1 imagem: coluna única, altura pela proporção, sem "Imagem 1" e sem barra vazia', () => {
  assert.match(html, /const single=items\.length===1;/);
  assert.match(html, /const cols=single\?1:/);
  assert.match(html, /labelH=\(single&&!items\[0\]\.seq\)\?0:54/);
  assert.match(html, /cellW\*im0\.height\/im0\.width/);
  assert.match(html, /const lab=items\[i\]\.seq\|\|\(single\?'':\('Imagem '\+\(i\+1\)\)\)/);
  assert.match(html, /if\(!lab\)\{ \/\* sem rótulo/);
});

test('com 2+ imagens o cálculo de colunas e rótulos continua o de sempre', () => {
  assert.match(html, /lv==='auto'\?\(items\.length<=4\?2:\(items\.length<=6\?3:4\)\):\+lv/);
  assert.match(html, /\('Imagem '\+\(i\+1\)\)/);
});
