const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('082a - editor bloqueia URL semanticamente duplicada', () => {
  assert.match(
    html,
    /links\.some\(l=>l&&sameExternalUrl\(l\.url,url\)\)/
  );
});

test('082b - loadData saneia links pela URL normalizada', () => {
  assert.match(
    html,
    /const clean=e\.links\.filter\(l=>\{ const k=String\(l&&l\.url\|\|''\)\.trim\(\)\.replace\(\/\\\/\+\$\/,''\); if\(!k\) return true; if\(seen\.has\(k\)\) return false;/
  );
});

test('082c - reconcile saneia links pela URL normalizada antes de virar DATA', () => {
  assert.match(
    html,
    /for\(const e of reconciled\).*const k=String\(l&&l\.url\|\|''\)\.trim\(\)\.replace/
  );
});