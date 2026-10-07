'use strict';
/* Servidor estático MÍNIMO para testar o frontend localmente antes de
 * publicar — só serve arquivos estáticos do próprio repositório, nunca
 * executa nada do Atlas. Bind só em 127.0.0.1 (nunca 0.0.0.0) e bloqueia
 * qualquer caminho que comece por .env, .git, functions/ ou
 * local-ai-server/ (onde fica a chave real da OpenAI), mesmo que alguém
 * tente acessar por URL direta. Uso: node scripts/serve-local.js [porta]
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.argv[2]) || 8000;
const ROOT = path.resolve(__dirname, '..');
const BLOCKED_PREFIXES = ['.env', '.git', 'functions', 'local-ai-server', 'scripts'];
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function isBlocked(relPath) {
  const first = relPath.split('/')[0];
  return BLOCKED_PREFIXES.includes(first) || relPath.split('/').includes('node_modules');
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const relPath = urlPath.replace(/^\/+/, '');
  if (relPath.includes('..') || isBlocked(relPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const filePath = path.join(ROOT, relPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Servindo ${ROOT} em http://${HOST}:${PORT}/ (.env, .git, functions/, local-ai-server/ e scripts/ bloqueados)`);
  });
}

module.exports = { server, HOST, PORT, isBlocked };
