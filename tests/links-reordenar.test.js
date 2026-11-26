const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
test('links de referência: botões ↑/↓ e arrastar reordenam via moveLink', () => {
  assert.match(html, /function moveLink\(from, to\)\{[\s\S]*?links\.splice\(to,0,it\);[\s\S]*?renderLinks\(\);/);
  assert.match(html, /link-row-up/); assert.match(html, /link-row-down/);
  assert.match(html, /row\.draggable = true;/);
  assert.match(html, /row\.addEventListener\('drop'/);
});
