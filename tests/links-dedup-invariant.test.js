const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('081a - editor bloqueia link exatamente duplicado', () => {
  assert.match(
    html,
    /links\.some\(l=>l&&l\.url===url&&\(l\.label\|\|'Referência'\)===label\)/
  );
});

test('081b - loadData saneia links exatamente duplicados', () => {
  assert.match(
    html,
    /const clean=e\.links\.filter\(l=>\{ const k=JSON\.stringify\(l\); if\(seen\.has\(k\)\) return false;/
  );
});

test('081c - reconcile saneia links antes de virar DATA', () => {
  assert.match(
    html,
    /for\(const e of reconciled\)\{ if\(!e\|\|!Array\.isArray\(e\.links\)\) continue; const seen=new Set\(\); e\.links=e\.links\.filter/
  );
});