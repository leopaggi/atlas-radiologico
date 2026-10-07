'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const OpenAI = require('openai');
const { createBatchAnalyzer, AnalysisError, MAX_PAYLOAD_BYTES } = require('../functions/review-analysis');

const HOST = '127.0.0.1';
const PORT = 8787;
const PUBLISHED_ORIGIN = 'https://leopaggi.github.io';
function allowedOrigin(origin) {
  if (origin === PUBLISHED_ORIGIN) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)
      && !u.username && !u.password && u.origin === origin;
  } catch (_e) { return false; }
}
function readApiKey() {
  // Exclusivamente este arquivo, nunca variável do shell/localStorage.
  try { return parseEnv(fs.readFileSync(path.join(__dirname, '.env'), 'utf8')).OPENAI_API_KEY || ''; }
  catch (_e) { return ''; }
}
// Diagnóstico LOCAL apenas: imprime só os campos sanitizados que o erro
// original do SDK/OpenAI trouxer (ver sanitizeProviderError em
// review-analysis.js) — nunca o objeto inteiro, stack, headers, request,
// response, o lote ou a chave. O comportamento HTTP/frontend não muda em
// nada: a resposta ao cliente continua a mesma mensagem genérica (502,
// "Não foi possível concluir a análise."). Nunca usado por Firebase/
// createAnalyzeHandler — só aqui, no terminal local.
function logProviderErrorLocally(meta) {
  console.error('[Atlas IA/OpenAI]');
  for (const key of ['status', 'code', 'type', 'param', 'message']) {
    if (Object.hasOwn(meta, key)) console.error(key + ': ' + meta[key]);
  }
}
function createLocalServer(options = {}) {
  const analyze = createBatchAnalyzer({
    getApiKey: options.getApiKey || readApiKey,
    createClient: options.createClient || (apiKey => new OpenAI({ apiKey, timeout: 240000, maxRetries: 0, logLevel: 'off' })),
    onProviderError: options.onProviderError || logProviderErrorLocally
  });
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const send = (status, data) => { res.writeHead(status, headers); res.end(JSON.stringify(data)); };
    // Evita DNS rebinding: Host também deve apontar ao loopback.
    if (!/^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/i.test(req.headers.host || '')) {
      send(403, { error: 'Host local obrigatório.' }); return;
    }
    if (origin && !allowedOrigin(origin)) { send(403, { error: 'Origem não autorizada.' }); return; }
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
      // Compatibilidade com preflight de acesso a rede privada/loopback.
      if (req.headers['access-control-request-private-network'] === 'true') headers['Access-Control-Allow-Private-Network'] = 'true';
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    if (req.url === '/health' && req.method === 'GET') { send(200, { ok: true }); return; }
    if (req.url !== '/analyze-review-batch' || req.method !== 'POST') { send(404, { error: 'Endpoint não encontrado.' }); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { send(415, { error: 'Envie JSON.' }); return; }
    try {
      let size = 0; const parts = [];
      for await (const part of req) {
        size += part.length;
        if (size > MAX_PAYLOAD_BYTES) { send(413, { error: 'Payload excede 512 KiB.' }); req.resume(); return; }
        parts.push(part);
      }
      let packet;
      try { packet = JSON.parse(Buffer.concat(parts).toString('utf8')); }
      catch (_e) { send(400, { error: 'JSON inválido.' }); return; }
      send(200, await analyze(packet));
    } catch (e) {
      const status = e instanceof AnalysisError && e.code === 'invalid-argument' ? 400
        : e instanceof AnalysisError && e.code === 'failed-precondition' ? 503 : 502;
      send(status, { error: e instanceof AnalysisError ? e.message : 'Não foi possível concluir a análise.' });
    }
  });
}
function startLocalServer(options = {}) {
  const server = createLocalServer(options);
  server.listen(PORT, HOST, () => console.log(`Atlas IA local: http://${HOST}:${PORT}`));
  server.on('error', () => console.error('Não foi possível iniciar o servidor IA local (verifique a porta 8787).'));
  return server;
}
if (require.main === module) startLocalServer();
module.exports = { createLocalServer, startLocalServer, allowedOrigin, HOST, PORT, logProviderErrorLocally };
