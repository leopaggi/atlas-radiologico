#!/usr/bin/env node
/*
 * Checagem rápida de sintaxe do JavaScript embutido em index.html.
 *
 * Por quê: index.html é HTML + <script> embutido (sem build), então um
 * erro de sintaxe no JS só costumava aparecer quebrando o site ao vivo.
 * Este script extrai o conteúdo de cada <script> sem "src" e roda
 * `node --check` nele — pega a esmagadora maioria dos erros de sintaxe
 * (parênteses/chaves desbalanceados, vírgula sobrando, etc.) antes de
 * qualquer coisa ir ao ar. Não substitui a suíte de testes (tests/*.test.js)
 * — syntax check não garante que o código faz o que deveria, só que ele
 * é JavaScript válido.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const file = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
let hadError = false;

while ((match = scriptRe.exec(html))) {
  const code = match[1];
  if (!code.trim()) continue;
  count++;
  const tmp = path.join(os.tmpdir(), 'atlas-syntax-check-' + count + '.js');
  fs.writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    hadError = true;
    console.error('[check-syntax] ERRO de sintaxe no bloco <script> #' + count + ':');
    console.error(e.stderr ? e.stderr.toString() : e.message);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_e) {}
  }
}

if (!count) {
  console.error('[check-syntax] Nenhum <script> embutido encontrado em index.html — algo está errado com a checagem.');
  process.exit(1);
}

if (hadError) {
  console.error('[check-syntax] FALHOU — ' + count + ' bloco(s) verificado(s), erro de sintaxe encontrado.');
  process.exit(1);
}

console.log('[check-syntax] OK — ' + count + ' bloco(s) <script> verificado(s), sintaxe válida.');
