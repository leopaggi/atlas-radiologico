'use strict';

/* Testes da organização final da área de ferramentas:
 *  - interface normal mostra SÓ "diagnóstico do sistema" e "auditar vínculo de imagens";
 *  - as ferramentas técnicas NÃO existem mais na UI (nem escondidas em details);
 *  - a implementação interna continua no código (manutenção futura);
 *  - snapshots automáticos ativos; ownership protegido; backup normal inalterado.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('\\b(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'função não encontrada: ' + name);
  const ob = source.indexOf('{', m.index + m[0].length);
  let depth = 0, q = null, esc = false, end = -1;
  for (let i = ob; i < source.length; i += 1) {
    const c = source[i];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.notEqual(end, -1, 'bloco sem fechamento: ' + name);
  return { source: source.slice(m.index, end + 1), body: source.slice(ob + 1, end) };
}

const footBlock = html.slice(html.indexOf('<div id="sidebar-foot">'), html.indexOf('<div id="main">'));
const REMOVED_IDS = ['btn-force-cloud', 'btn-export-checkpoint-v2', 'btn-reconcile-v2', 'btn-force-dedup', 'btn-recover-data', 'btn-reset', 'btn-restore-snapshot'];

test('UI: a área de ferramentas mostra SÓ diagnóstico e auditar vínculo', () => {
  assert.match(footBlock, /id="btn-system-diagnostic"/);
  assert.match(footBlock, /id="btn-audit-images"/);
  assert.match(footBlock, /gera um relatório para copiar e enviar — não altera nada/);
  assert.match(footBlock, /confere se as imagens continuam associadas às lesões corretas — não altera nada/);
  for (const id of REMOVED_IDS) {
    assert.doesNotMatch(footBlock, new RegExp('id="' + id + '"'), id + ' não pode aparecer na UI');
  }
});

test('UI: nenhum controle técnico existe em lugar nenhum (sem details/summary/submenu)', () => {
  for (const id of REMOVED_IDS) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'), id);
  }
  assert.doesNotMatch(html, /<details class="maintenance-tools">/);
  assert.doesNotMatch(html, /<details class="advanced-tools">/);
  assert.doesNotMatch(html, /<summary>⚙ Manutenção técnica<\/summary>/);
  assert.doesNotMatch(html, /class="maintenance-tools|class="advanced-tools/);
  assert.doesNotMatch(html, /\.maintenance-tools|maintenance-danger-separator/, 'CSS morto removido');
});

test('UI: diagnóstico e auditoria de imagens continuam SOMENTE LEITURA', () => {
  const diag = extractFunction(html, 'openSystemDiagnosticModal');
  assert.doesNotMatch(diag.body, /\bDATA\s*=|\bREVIEW\s*=|\bSRS\s*=/);
  assert.doesNotMatch(diag.body, /saveData\(|storage\.set\(/);
  const audit = extractFunction(html, 'openImageAuditModal');
  assert.doesNotMatch(audit.body, /\bDATA\s*=/, 'não pode reatribuir DATA');
  assert.doesNotMatch(audit.body, /saveData\(|storage\.set\(/, 'não pode persistir');
  assert.doesNotMatch(audit.body, /removeImageFromLesionData|applyImageOwnershipCorrectionV2|rewriteImageOwnershipV2|audit-fix-btn|audit-fix-all/, 'sem correção automática');
});

test('UI: implementação interna das ferramentas técnicas continua no código', () => {
  for (const name of ['forceThisDeviceToCloud', 'openExportCheckpointV2Modal', 'openReconcileV2Modal', 'openRecoveryInspector', 'forceDuplicateCleanupNow', 'restoreFactoryDefault', 'runDuplicateCleanup', 'reconcileCatalogByIdentityV2']) {
    assert.match(html, new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('), name + ' precisa continuar no código');
  }
  // o factory reset interno mantém a confirmação forte em dois passos
  const reset = extractFunction(html, 'restoreFactoryDefault');
  assert.ok((reset.body.match(/confirm\(/g) || []).length >= 2, 'duas confirmações');
  assert.match(reset.body, /createSafetySnapshot\('antes de restaurar padrão de fábrica'\)/);
});

test('UI: snapshots automáticos continuam ativos (retenção 5) e sem controles na UI', () => {
  assert.match(html, /function createSafetySnapshot\(reason\)\{/);
  assert.match(html, /async function restoreSafetySnapshot\(id\)\{/);
  assert.match(html, /const SAFETY_SNAPSHOT_INDEX_KEY = 'atlas:safetySnapshotIndex';/);
  assert.match(html, /const SAFETY_SNAPSHOT_LIMIT = 5;/);
  assert.match(html, /'antes de importar backup'/);
  assert.match(html, /'antes de restaurar padrão de fábrica'/);
  assert.match(html, /'antes da recuperação de dados antigos'/);
  assert.match(html, /'antes de forçar fusão de duplicatas'/);
  assert.match(html, /'antes de aplicar reconciliação V2'/);
  const body = html.slice(html.indexOf('<body>'));
  assert.doesNotMatch(body, /snapshot-picker-modal|snapshot-row-restore|snapshot-row-delete/);
});

test('UI: ownership continua protegido', () => {
  assert.match(html, /function canChangeImageOwnership\(image, newLesionId, context\)\{/);
  assert.match(html, /function assertManualImageOwnershipChange\(image, newLesionId, context\)\{/);
  assert.match(html, /const IMAGE_OWNERSHIP_MANUAL = \{ manual:true \};/);
});

test('UI: Salvar backup / Importar backup continuam inalterados', () => {
  assert.match(footBlock, /id="btn-export"/);
  assert.match(footBlock, /id="btn-import"/);
  assert.match(html, /document\.getElementById\('btn-export'\)\.onclick = async \(\)=>\{/);
  assert.match(html, /document\.getElementById\('btn-import'\)\.onclick = \(\)=> document\.getElementById\('import-file'\)\.click\(\);/);
});

test('UI: Quiz e Revisões continuam presentes (sem regressão de presença)', () => {
  assert.match(html, /function renderQuizCardIntegrated\(host\)\{/);
  assert.match(html, /function openQuizReviewModal\(lesionId\)\{/);
  assert.match(html, /function cancelLesionReview\(reviewId, reason\)\{/);
});
