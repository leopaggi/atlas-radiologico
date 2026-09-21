'use strict';

/* Integridade das classificações (classification) — auditoria CONSERVADORA:
 *  - canônica (bate com o SEED);
 *  - plausível não canônica (SEED não define, mas o contexto é plausível);
 *  - incompatível (contexto claramente de outro sistema) => único candidato a remoção;
 *  - divergente (SEED tem outra) => restaura o canônico;
 *  - revisar/unknown (sem base segura) => NÃO remover.
 * Ausência de classification no SEED NÃO é prova de erro.
 *
 * Extrai o trecho REAL do index.html e roda num `vm` isolado. Nenhum teste
 * acessa IndexedDB, Firebase, Cloudinary ou rede.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
}

const IDENTITY_FN = extractFunction(html, 'classificationIdentityKey');
const DECISIONS_BLOCK = extractBlock(html, "const CLASSIFICATION_REVIEW_DECISIONS_KEY = 'atlas:classificationReviewDecisions';", 'async function keepClassificationDecision(');
const CANON_FN = extractFunction(html, 'classificationCanonicalMap');
const RULES_BLOCK = extractBlock(html, 'const CLASSIFICATION_CONTEXT_RULES = {', 'function buildClassificationAudit(){');
const COMPAT_FN = extractFunction(html, 'classifyClassificationCompatibility');
const AUDIT_FN = extractFunction(html, 'buildClassificationAudit');
const FIX_FN = extractFunction(html, 'applyClassificationIdentityFix');
const KEEP_FN = extractFunction(html, 'keepClassificationDecision');
const REMOVE_FN = extractFunction(html, 'removeClassificationDecision');

const SYSTEMS = { CRADS: {}, LUNGRADS: {}, BIRADS: {}, LIRADS: {}, BOSNIAK: {}, TIRADS: {}, PIRADS: {}, ORADS: {}, VADIRADS: {} };
const COLON = { id: 'seed_0', s: 'Abdômen Superior', site: 'Intestino / cólon', name: 'Pólipo hiperplásico', classification: 'CRADS' };
const FETAL = { id: 'seed_1', s: 'Medicina Fetal', site: 'Rim e trato urinário fetal', name: 'Megabexiga fetal' };

function buildCtx(data, seed, backing) {
  const calls = { snapshots: [], storageSets: 0, pushes: 0, toasts: [] };
  const store = backing || {};
  const ctx = {
    console, JSON, Object, Array, String, Number, Map, Set,
    DATA: data || [],
    SEED: seed || [COLON, FETAL],
    CLASSIFICATION_SYSTEMS: { CRADS:{}, BIRADS:{}, LIRADS:{}, BOSNIAK:{}, LUNGRADS:{}, TIRADS:{}, PIRADS:{}, ORADS:{}, CADRADS:{}, NODERADS:{}, ASPECTS:{}, AAST_KIDNEY:{}, AAST_LIVER:{}, AAST_SPLEEN:{}, VIRADS:{} },
    appStateReady: true,
    createSafetySnapshot: (r) => { calls.snapshots.push(r); },
    confirm: () => true,
    storage: {
      get: async (k) => { if (Object.prototype.hasOwnProperty.call(store, k)) return { value: store[k] }; throw new Error('vazio'); },
      set: async (k, v) => { store[k] = v; calls.storageSets += 1; }
    },
    pushToFirebaseNow: async () => { calls.pushes += 1; },
    toast: (m) => { calls.toasts.push(m); },
    renderAll: () => {},
    STORAGE_KEY: 'data',
    __backing: store,
    __calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext([IDENTITY_FN.source, DECISIONS_BLOCK, CANON_FN.source, RULES_BLOCK, AUDIT_FN.source, FIX_FN.source, KEEP_FN.source, REMOVE_FN.source].join('\n'), ctx, { filename: 'classification-integrity.js' });
  ctx.setDecisions = (obj) => vm.runInContext('CLASSIFICATION_REVIEW_DECISIONS = ' + JSON.stringify(obj) + ';', ctx);
  return ctx;
}
function byId(audit, list, id) { return audit.lists[list].find(x => x.id === id); }

test('CLASSIF: C-RADS na identidade colônica canônica é CANONICAL', () => {
  const ctx = buildCtx([{ ...COLON }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.total, 1);
  assert.equal(a.canonical, 1);
  assert.equal(a.incompatible, 0);
});

test('CLASSIF: C-RADS em Medicina Fetal é INCOMPATIBLE', () => {
  const ctx = buildCtx([{ ...FETAL, classification: 'CRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.incompatible, 1);
  assert.equal(byId(a, 'incompatible', 'seed_1').reason, 'contexto_incompativel');
});

test('CLASSIF: C-RADS em outra lesão abdominal não colônica fica REVISAR (unknown), não incompatível', () => {
  const liver = { id: 'seed_9', s: 'Abdômen Superior', site: 'Fígado', name: 'Nódulo hepático', classification: 'CRADS' };
  const ctx = buildCtx([liver]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.incompatible, 0, 'mesma seção => não é claramente incompatível');
  assert.equal(a.unknown, 1);
});

test('CLASSIF: BI-RADS em mama plausível sem SEED é COMPATIBLE_NONCANONICAL', () => {
  const breast = { id: 'u_1', s: 'Mamas', site: 'Nódulo mamário', name: 'Fibroadenoma', classification: 'BIRADS' };
  const ctx = buildCtx([breast]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.compatible, 1);
  assert.equal(a.incompatible, 0);
  assert.equal(a.lists.compatible[0].classification, 'BIRADS');
});

test('CLASSIF: Bosniak em rim cístico plausível é COMPATIBLE_NONCANONICAL', () => {
  const ctx = buildCtx([{ id: 'u_2', s: 'Abdômen Superior', site: 'Rim', name: 'Cisto renal simples', classification: 'BOSNIAK' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.compatible, 1);
});

test('CLASSIF: LI-RADS em fígado plausível é COMPATIBLE_NONCANONICAL', () => {
  const ctx = buildCtx([{ id: 'u_3', s: 'Abdômen Superior', site: 'Fígado', name: 'Carcinoma hepatocelular', classification: 'LIRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.compatible, 1);
});

test('CLASSIF: LI-RADS em pâncreas NÃO é compatível e NÃO é removido automaticamente', () => {
  const ctx = buildCtx([{ id: 'u_4', s: 'Abdômen Superior', site: 'Pâncreas', name: 'Adenocarcinoma de pâncreas', classification: 'LIRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.compatible, 0);
  assert.equal(a.incompatible, 0, 'mesma seção => revisar, não remover');
  assert.equal(a.unknown, 1);
});

test('CLASSIF: LUNG-RADS em Tórax/Coração (não pulmão) fica REVISAR, não compatível', () => {
  const ctx = buildCtx([{ id: 'u_5', s: 'Tórax', site: 'Coração e pericárdio', name: 'Doença coronariana', classification: 'LUNGRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.compatible, 0);
  assert.equal(a.unknown, 1);
});

test('CLASSIF: LUNG-RADS em Medicina Fetal é INCOMPATIBLE', () => {
  const ctx = buildCtx([{ id: 'u_6', s: 'Medicina Fetal', site: 'Anomalias fetais estruturais', name: 'Hidropisia fetal', classification: 'LUNGRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.incompatible, 1);
});

test('CLASSIF: classificação desconhecida (sistema fora da lista) é UNKNOWN/REVISAR', () => {
  const ctx = buildCtx([{ id: 'u_7', s: 'Tórax', site: 'Pulmão', name: 'Nódulo', classification: 'FOOBAR' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.unknown, 1);
  assert.equal(a.incompatible, 0);
});

test('CLASSIF: classificação divergente do SEED é MISMATCH (restaura o canônico)', () => {
  const ctx = buildCtx([{ ...COLON, classification: 'BIRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.mismatch, 1);
  assert.equal(a.lists.mismatch[0].canonical, 'CRADS');
});

test('CLASSIF: buildClassificationAudit é READ-ONLY (não grava, não cria snapshot, não puxa)', () => {
  const ctx = buildCtx([{ ...FETAL, classification: 'CRADS' }, { ...COLON }]);
  ctx.buildClassificationAudit();
  assert.equal(ctx.__calls.storageSets, 0);
  assert.equal(ctx.__calls.snapshots.length, 0);
  assert.equal(ctx.__calls.pushes, 0);
});

test('CLASSIF: a correção só toca INCOMPATIBLE + MISMATCH e preserva plausíveis/unknown', async () => {
  const fetal = { ...FETAL, classification: 'CRADS', notes: 'texto', tags: ['x'], images: [{ publicId: 'p' }], altPlacements: [{ s: 'N', site: 'E' }] };
  const breast = { id: 'u_1', s: 'Mamas', site: 'Nódulo mamário', name: 'Fibroadenoma', classification: 'BIRADS' };
  const liverPancreas = { id: 'u_4', s: 'Abdômen Superior', site: 'Pâncreas', name: 'Adenocarcinoma', classification: 'LIRADS' };
  const colonWrong = { ...COLON, id: 'seed_0b', classification: 'BIRADS' };
  const ctx = buildCtx([fetal, breast, liverPancreas, colonWrong]);
  const before = JSON.parse(JSON.stringify(fetal));
  const ok = await ctx.applyClassificationIdentityFix();
  assert.equal(ok, true);
  assert.equal(ctx.__calls.snapshots.length, 1, 'snapshot antes da correção');
  assert.match(ctx.__calls.snapshots[0], /classificações inválidas/);
  // incompatível removida
  assert.equal(fetal.classification, null);
  assert.equal(fetal.notes, before.notes);
  assert.deepEqual(fetal.tags, before.tags);
  assert.deepEqual(fetal.images, before.images);
  assert.deepEqual(fetal.altPlacements, before.altPlacements);
  // plausível e unknown NÃO tocadas
  assert.equal(breast.classification, 'BIRADS', 'plausível preservada');
  assert.equal(liverPancreas.classification, 'LIRADS', 'unknown preservada');
});

test('CLASSIF: correção sem nada incompatível/divergente não cria snapshot nem grava', async () => {
  const ctx = buildCtx([{ ...COLON }]);
  const ok = await ctx.applyClassificationIdentityFix();
  assert.equal(ok, false);
  assert.equal(ctx.__calls.snapshots.length, 0);
  assert.equal(ctx.__calls.storageSets, 0);
});


// ===========================================================================
// FILA MANUAL "REVISAR" (Manter / Remover / Abrir lesão)
// ===========================================================================

test('FILA: unknown aparece na fila Revisar (com id, nome, seção, sítio e classificação)', () => {
  // LI-RADS em pâncreas = contexto ambíguo => unknown (revisar), não incompatível
  const ctx = buildCtx([{ id: 'seed_5', s: 'Abdômen Superior', site: 'Pâncreas', name: 'Adenocarcinoma de pâncreas', classification: 'LIRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.unknown, 1);
  const it = a.lists.unknown[0];
  assert.equal(it.name, 'Adenocarcinoma de pâncreas');
  assert.equal(it.section, 'Abdômen Superior');
  assert.equal(it.site, 'Pâncreas');
  assert.equal(it.classification, 'LIRADS');
});

test('FILA: BIRADS em contexto claramente não mamário (ex.: veia) é INCOMPATIBLE (não entra na fila manual)', () => {
  const ctx = buildCtx([{ id: 'seed_5', s: 'Vascular', site: 'Veias', name: 'Síndrome de Budd-Chiari', classification: 'BIRADS' }]);
  const a = ctx.buildClassificationAudit();
  assert.equal(a.incompatible, 1);
  assert.equal(a.unknown, 0);
});

test('FILA (UI): card tem nome/seção/sítio/classificação e as 3 ações', () => {
  const src = extractFunction(html, 'openClassificationAuditModal').body;
  assert.match(src, /cls-queue-item/);
  assert.match(src, /Classificação atual:/);
  assert.match(src, /data-cls-keep="\$\{escAttr\(x\.id\)\}">✓ Manter</);
  assert.match(src, /data-cls-remove="\$\{escAttr\(x\.id\)\}">✕ Remover</);
  assert.match(src, /data-cls-open="\$\{escAttr\(x\.id\)\}">✎ Abrir lesão</);
});

test('FILA: "Manter" NÃO altera DATA e tira o item da fila', async () => {
  const lesion = { id: 'u_1', s: 'Vascular', site: 'Veias', name: 'Budd-Chiari', classification: 'BIRADS', notes: 'n', tags: ['t'] };
  const ctx = buildCtx([lesion]);
  const before = JSON.stringify(lesion);
  const ok = await ctx.keepClassificationDecision('u_1');
  assert.equal(ok, true);
  assert.equal(JSON.stringify(lesion), before, 'DATA intacta');
  assert.equal(ctx.buildClassificationAudit().unknown, 0, 'saiu da fila');
  assert.equal(lesion.classification, 'BIRADS', 'classification continua');
});

test('FILA: decisão "Manter" sobrevive a reload simulado', async () => {
  const backing = {};
  const lesion = { id: 'u_1', s: 'Vascular', site: 'Veias', name: 'Budd-Chiari', classification: 'BIRADS' };
  const ctx1 = buildCtx([lesion], undefined, backing);
  await ctx1.keepClassificationDecision('u_1');
  assert.equal(ctx1.buildClassificationAudit().unknown, 0);
  // "reload": novo contexto com o mesmo storage
  const ctx2 = buildCtx([JSON.parse(JSON.stringify(lesion))], undefined, backing);
  await ctx2.loadClassificationReviewDecisions();
  assert.equal(ctx2.buildClassificationAudit().unknown, 0, 'decisão persistida');
});

test('FILA: a chave da decisão usa IDENTIDADE semântica + classification (não o seed id posicional)', async () => {
  const backing = {};
  const a = { id: 'seed_10', s: 'Vascular', site: 'Veias', name: 'Budd-Chiari', classification: 'BIRADS' };
  const ctx1 = buildCtx([a], undefined, backing);
  await ctx1.keepClassificationDecision('seed_10');
  // mesmo conteúdo, ID DIFERENTE (posicional mudou): a decisão continua valendo
  const b = { id: 'seed_999', s: 'Vascular', site: 'Veias', name: 'Budd-Chiari', classification: 'BIRADS' };
  const ctx2 = buildCtx([b], undefined, backing);
  await ctx2.loadClassificationReviewDecisions();
  assert.equal(ctx2.buildClassificationAudit().unknown, 0, 'identidade semântica, não id');
});

test('FILA: mudar a classification invalida a decisão antiga (volta para Revisar)', async () => {
  const backing = {};
  const lesion = { id: 'u_1', s: 'Abdômen Superior', site: 'Pâncreas', name: 'Adenocarcinoma de pâncreas', classification: 'LIRADS' };
  const ctx1 = buildCtx([lesion], undefined, backing);
  await ctx1.keepClassificationDecision('u_1');
  assert.equal(ctx1.buildClassificationAudit().unknown, 0);
  // agora muda para BOSNIAK (outra classificação, também ambígua aqui)
  const changed = { id: 'u_1', s: 'Abdômen Superior', site: 'Pâncreas', name: 'Adenocarcinoma de pâncreas', classification: 'BOSNIAK' };
  const ctx2 = buildCtx([changed], undefined, backing);
  await ctx2.loadClassificationReviewDecisions();
  assert.equal(ctx2.buildClassificationAudit().unknown, 1, 'novo valor não é escondido pela decisão antiga');
});

test('FILA: "Remover" cria snapshot, zera só classification e preserva o resto', async () => {
  const lesion = { id: 'u_2', s: 'Vascular', site: 'Veias', name: 'Budd-Chiari', classification: 'BIRADS', notes: 'texto', tags: ['x'], images: [{ publicId: 'p' }], altPlacements: [{ s: 'N', site: 'E' }] };
  const ctx = buildCtx([lesion]);
  const before = JSON.parse(JSON.stringify(lesion));
  const ok = await ctx.removeClassificationDecision('u_2');
  assert.equal(ok, true);
  assert.equal(ctx.__calls.snapshots.length, 1, 'snapshot antes');
  assert.match(ctx.__calls.snapshots[0], /classificações inválidas/);
  assert.equal(lesion.classification, null);
  assert.equal(lesion.notes, before.notes);
  assert.deepEqual(lesion.tags, before.tags);
  assert.deepEqual(lesion.images, before.images);
  assert.deepEqual(lesion.altPlacements, before.altPlacements);
  assert.equal(lesion.id, before.id);
  assert.equal(ctx.buildClassificationAudit().total, 0, 'total com classification diminui');
});

test('FILA: a correção em lote NÃO toca unknown nem decisões manuais', async () => {
  const lesion = { id: 'u_3', s: 'Abdômen Superior', site: 'Pâncreas', name: 'Adenocarcinoma de pâncreas', classification: 'LIRADS' };
  const ctx = buildCtx([lesion]);
  await ctx.applyClassificationIdentityFix(); // só incompatible+mismatch
  assert.equal(lesion.classification, 'LIRADS', 'unknown preservada');
  assert.equal(ctx.__calls.snapshots.length, 0, 'nada incompatível => sem snapshot');
});

test('FILA (UI): "Abrir lesão" usa openForm sobre a auditoria e recalcula ao salvar', () => {
  const src = extractFunction(html, 'openClassificationAuditModal').body;
  assert.match(src, /openForm\(id, \{ preserveUnderlyingOverlay:true, onSaved:/);
  assert.match(src, /onSaved: \(\)=>\{ refresh\(\);/);
  // decidir não fecha o modal (sem ov.remove nos handlers de decisão)
  assert.doesNotMatch(src, /keepClassificationDecision[\s\S]{0,120}ov\.remove\(\)/);
});
