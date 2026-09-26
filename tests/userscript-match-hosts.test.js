'use strict';

/* Fix: o userscript precisa rodar nas páginas de caso dos DOIS hosts do
 * Radiopaedia (radiopaedia.org e www.radiopaedia.org) e continuar rodando
 * no Atlas (ponte da 091g). Verifica os @match do cabeçalho com o mesmo
 * casamento de padrão (glob "*") que o Tampermonkey usa para @match. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const userscript = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js'), 'utf8');
const header = userscript.slice(0, userscript.indexOf('// ==/UserScript=='));
const matches = [...header.matchAll(/^\/\/ @match\s+(\S+)\s*$/gm)].map((m) => m[1]);
const toRegex = (pattern) => new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('.*') + '$');
const runsOn = (url) => matches.some((p) => toRegex(p).test(url));

test('userscript roda nas páginas de caso de radiopaedia.org E www.radiopaedia.org', () => {
  assert.ok(matches.includes('https://radiopaedia.org/cases/*'));
  assert.ok(matches.includes('https://www.radiopaedia.org/cases/*'));
  assert.equal(runsOn('https://radiopaedia.org/cases/paraovarian-cyst-12'), true);
  assert.equal(runsOn('https://www.radiopaedia.org/cases/paraovarian-cyst-12'), true);
  assert.equal(runsOn('https://www.radiopaedia.org/cases/appendicitis-in-pregnancy-1?lang=us'), true);
});

test('continua rodando no Atlas (ponte 091g) e não se espalha para outras páginas', () => {
  assert.equal(runsOn('https://leopaggi.github.io/atlas-radiologico/'), true);
  assert.equal(runsOn('https://radiopaedia.org/articles/appendicitis'), false);
  assert.equal(runsOn('https://www.radiopaedia.org/articles/appendicitis'), false);
  assert.equal(runsOn('https://evil.example/radiopaedia.org/cases/x'), false);
  assert.equal(matches.length, 3);
});

test('versão 1.4.x e o Atlas aceita sourceUrl dos dois hosts', () => {
  assert.match(header, /@version\s+1\.4\.\d+\b/);
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /const EXTERNAL_IMPORT_ALLOWED_HOSTS = \['radiopaedia\.org', 'www\.radiopaedia\.org'\];/);
});
