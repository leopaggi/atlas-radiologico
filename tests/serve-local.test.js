'use strict';

/* scripts/serve-local.js — servidor estático mínimo para testar o frontend
 * localmente (ver README.md). Único propósito de segurança: nunca servir
 * .env/.git/functions/local-ai-server por URL direta, mesmo que alguém peça
 * explicitamente; só serve arquivos estáticos do próprio repositório.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { server, HOST, PORT } = require('../scripts/serve-local.js');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

test('bind só em 127.0.0.1', () => {
  assert.equal(HOST, '127.0.0.1');
});

test('bloqueia .env, .git, functions/ e local-ai-server/ mesmo por URL direta; serve index.html normalmente', async (t) => {
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://' + HOST + ':' + server.address().port;

  const envRes = await get(base + '/local-ai-server/.env');
  assert.equal(envRes.status, 403);

  const gitRes = await get(base + '/.git/config');
  assert.equal(gitRes.status, 403);

  const fnRes = await get(base + '/functions/review-analysis.js');
  assert.equal(fnRes.status, 403);

  const scriptsRes = await get(base + '/scripts/serve-local.js');
  assert.equal(scriptsRes.status, 403);

  const nodeModulesRes = await get(base + '/functions/node_modules/openai/package.json');
  assert.equal(nodeModulesRes.status, 403);

  const indexRes = await get(base + '/index.html');
  assert.equal(indexRes.status, 200);
  assert.match(indexRes.body, /Atlas de Padrões/);
});

test('bloqueia path traversal (../)', async (t) => {
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://' + HOST + ':' + server.address().port;
  const res = await get(base + '/../package.json');
  assert.ok(res.status === 403 || res.status === 404);
});

test('arquivo inexistente responde 404, nunca 200', async (t) => {
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://' + HOST + ':' + server.address().port;
  const res = await get(base + '/arquivo-que-nao-existe-123.html');
  assert.equal(res.status, 404);
});
