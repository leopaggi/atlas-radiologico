#!/usr/bin/env node
/*
 * Trava de CI: roda a suíte de testes completa e só falha (bloqueia a
 * publicação) se o número de testes falhando for MAIOR que o conhecido
 * (tests/known-failures-baseline.json). Isso existe porque o projeto já
 * tinha, antes desta trava (06/11/2026), falhas antigas e documentadas,
 * não relacionadas a mudanças recentes — exigir 0 falhas pra sempre
 * travaria a CI permanentemente sem ninguém ter corrigido nada. Qualquer
 * falha NOVA (acima da baseline) é bloqueada.
 *
 * Se o número de falhas CAIR (alguém corrigiu uma pré-existente), o
 * script avisa e sugere atualizar a baseline — não atualiza sozinho.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const glob = require('fs').readdirSync;

const baselinePath = path.join(__dirname, '..', 'tests', 'known-failures-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const knownFailCount = Number(baseline.failCount) || 0;

const testsDir = path.join(__dirname, '..', 'tests');
const testFiles = glob(testsDir)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join('tests', f));

console.log('[gate] Rodando ' + testFiles.length + ' arquivo(s) de teste...');
const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 1024, // suíte grande (2700+ testes, diffs verbosos) passa de 1 MB fácil
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

const summary = (result.stdout || '').match(/# pass (\d+)[\s\S]*?# fail (\d+)/);
if (!summary) {
  console.error('[gate] Não consegui ler o resumo da suíte de testes (formato inesperado) — tratando como falha, por segurança.');
  process.exit(1);
}
const passCount = Number(summary[1]);
const failCount = Number(summary[2]);

console.log('\n[gate] Resultado: ' + passCount + ' passando, ' + failCount + ' falhando. Baseline conhecida: ' + knownFailCount + '.');

if (failCount > knownFailCount) {
  console.error('[gate] BLOQUEADO — ' + (failCount - knownFailCount) + ' falha(s) NOVA(S) além das ' + knownFailCount + ' já conhecidas. Corrija antes de publicar.');
  process.exit(1);
}
if (failCount < knownFailCount) {
  console.log('[gate] Boa notícia: ' + (knownFailCount - failCount) + ' falha(s) a menos que a baseline. Considere atualizar failCount em tests/known-failures-baseline.json para ' + failCount + '.');
}
console.log('[gate] OK — nenhuma falha nova.');
process.exit(0);
