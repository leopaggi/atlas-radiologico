'use strict';

/* Testes da CORREÇÃO PONTUAL DE OWNERSHIP — Abscesso cerebral (Alteração 059).
 *
 * A auditoria forense (Alterações 058/059) confirmou, comparando o SEED
 * congelado em 18/09/2026 contra um backup real exportado do app em
 * 20/09/2026, que exatamente 2 imagens tiveram o próprio `lesionName`
 * reescrito de "Abscesso cerebral" para "Oligodendroglioma" — efeito
 * colateral do antigo sincronismo canônico por id (hoje desligado,
 * CANONICAL_REFRESH_DISABLED_V250=true) quando o SEED foi
 * reordenado/compactado. fixAbscessoOligodendrogliomaOwnership20260921()
 * corrige SOMENTE essas 2 imagens, por publicId exato, localizando
 * origem/destino por IDENTIDADE SEMÂNTICA (s+site+nome) — nunca por seed_N.
 *
 * Como o resto da suíte, extrai o trecho REAL do index.html e roda num `vm`
 * isolado, com storage/Firebase/Cloudinary totalmente mockados (nunca reais).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
}
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

// Bloco inteiro (const OWNERSHIP_FIX_20260921 + a função) extraído de uma vez,
// exatamente como está no index.html — nenhuma lógica reescrita no teste.
const FIX_BLOCK = extractBlock(
  html,
  'const OWNERSHIP_FIX_20260921 = {',
  '/* ============================================================\r\n   PRODUTIVIDADE DE IMAGENS'
);
const stableKeyFn = extractFunction(html, 'stableImageKeyV208');
const identityKeysFn = extractFunction(html, 'imageIdentityKeys');
const normalizeExternalTitleFn = extractFunction(html, 'normalizeExternalTitle');
const exactLesionIdentityKeyFn = extractFunction(html, 'exactLesionIdentityKey');
const ownershipBlock = extractBlock(html, 'const IMAGE_OWNERSHIP_MANUAL = { manual:true };', 'let canonicalImageOwnersV208 = null;');
const removeImageFn = extractFunction(html, 'removeImageFromLesionData');
const addImageFn = extractFunction(html, 'addImageToLesionData');

function cloudinaryImage(over) {
  return Object.assign({
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v1789387821/atlas-radiologico/o0ykul2z1qp00pp6yxel.jpg',
    thumb: 'https://res.cloudinary.com/soegtip6/image/upload/v1789387821/atlas-radiologico/o0ykul2z1qp00pp6yxel.jpg',
    source: 'cloudinary',
    publicId: 'atlas-radiologico/o0ykul2z1qp00pp6yxel',
    assetId: '48266481f0c336b5932d5e1116a5add1',
    label: '',
    lesionId: 'seed_11',
    lesionName: 'Oligodendroglioma',
    createdAt: '2026-09-14T12:10:21Z',
    assignedAt: null
  }, over || {});
}

function baseFixture() {
  return [
    { id: 'seed_9', name: 'Metástase cerebral', s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', images: [
      { publicId: 'atlas-radiologico/f6iuwtucsxpig0o4zgul', assetId: 'x9', lesionId: 'seed_10', lesionName: 'Metástase cerebral', data: 'https://x/f6.jpg' }
    ] },
    { id: 'seed_10', name: 'Abscesso cerebral', s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', images: [] },
    { id: 'seed_11', name: 'Oligodendroglioma', s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', images: [
      cloudinaryImage(),
      cloudinaryImage({ publicId: 'atlas-radiologico/n5oyigvmkpb8zpqykd3g', assetId: '1f173ab3e75da101bd7a04d3f05b2ba1', createdAt: '2026-09-14T12:07:20Z' })
    ] },
    { id: 'seed_12', name: 'Encefalite herpética', s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', images: [] }
  ];
}

function loadFix(fixture, opts) {
  const o = opts || {};
  const src = [
    stableKeyFn.source, identityKeysFn.source, normalizeExternalTitleFn.source,
    exactLesionIdentityKeyFn.source, ownershipBlock, removeImageFn.source, addImageFn.source,
    FIX_BLOCK
  ].join('\n');
  const calls = { saved: 0, snapshots: [] };
  const ctx = vm.createContext({
    DATA: JSON.parse(JSON.stringify(fixture)),
    SRS: o.srs !== undefined ? JSON.parse(JSON.stringify(o.srs)) : { seed_10: { interval: 3, due: 1, streak: 1 }, seed_11: { interval: 5, due: 2, streak: 2 } },
    REVIEW: o.review !== undefined ? JSON.parse(JSON.stringify(o.review)) : { seed_10: 1, seed_11: 2 },
    LESION_REVISIONS: o.revisions !== undefined ? JSON.parse(JSON.stringify(o.revisions)) : {},
    SESSIONLOG: {},
    createSafetySnapshot: (reason) => {
      calls.snapshots.push(reason);
      if (o.snapFail) return null;
      return { id: 'snap-fix-1' };
    },
    saveData: async () => { calls.saved += 1; if (o.saveFail) throw new Error('save falhou (mock)'); },
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__api = { fixAbscessoOligodendrogliomaOwnership20260921, OWNERSHIP_FIX_20260921, IMAGE_OWNERSHIP_CONFLICTS };', ctx);
  return { api: ctx.__api, ctx, calls };
}

// ===========================================================================
// 1) IMAGEM HISTÓRICA NÃO PERMANECE NO LUGAR ERRADO / 2) DESTINO SEMÂNTICO /
//    3) AS DUAS CHEGAM AO DESTINO
// ===========================================================================

test('1-3. as 2 imagens saem de Oligodendroglioma e chegam em Abscesso cerebral (destino achado por identidade semântica, não por seed_N)', async () => {
  const { api, ctx } = loadFix(baseFixture());
  const r = await api.fixAbscessoOligodendrogliomaOwnership20260921();
  assert.equal(r.ok, true, JSON.stringify(r));
  const oligo = ctx.DATA.find(e => e.id === 'seed_11');
  const abscesso = ctx.DATA.find(e => e.id === 'seed_10');
  assert.equal(oligo.images.length, 0, 'Oligodendroglioma fica sem as 2 imagens');
  assert.equal(abscesso.images.length, 2, 'Abscesso cerebral recebe exatamente as 2 imagens');
  assert.deepEqual(
    new Set(abscesso.images.map(i => i.publicId)),
    new Set(['atlas-radiologico/o0ykul2z1qp00pp6yxel', 'atlas-radiologico/n5oyigvmkpb8zpqykd3g'])
  );
  // destino localizado por identidade (s+site+nome), não pelo literal "seed_10"
  assert.doesNotMatch(FIX_BLOCK, /correctMatches\s*=\s*DATA\.filter\([^)]*\.id\s*===\s*['"]seed_10['"]/);
  assert.match(FIX_BLOCK, /exactLesionIdentityKey\(/);
});

// ===========================================================================
// 4) NÃO DUPLICAM (rodar de novo, já com o estado corrigido, aborta)
// ===========================================================================

test('4. rodar novamente depois de já corrigido aborta (evita duplicar) e não altera nada', async () => {
  const { api, ctx } = loadFix(baseFixture());
  const first = await api.fixAbscessoOligodendrogliomaOwnership20260921();
  assert.equal(first.ok, true);
  const snapshotAfterFirst = JSON.stringify(ctx.DATA);
  const second = await api.fixAbscessoOligodendrogliomaOwnership20260921();
  assert.equal(second.ok, false);
  assert.match(second.reason, /não encontrada|já está/i);
  assert.equal(JSON.stringify(ctx.DATA), snapshotAfterFirst, 'segunda chamada não pode alterar o DATA');
});

// ===========================================================================
// 5) publicId/assetId PRESERVADOS
// ===========================================================================

test('5. publicId, assetId, URL (data), label e source são preservados exatamente', async () => {
  const { api, ctx } = loadFix(baseFixture());
  await api.fixAbscessoOligodendrogliomaOwnership20260921();
  const abscesso = ctx.DATA.find(e => e.id === 'seed_10');
  const img1 = abscesso.images.find(i => i.publicId === 'atlas-radiologico/o0ykul2z1qp00pp6yxel');
  assert.equal(img1.assetId, '48266481f0c336b5932d5e1116a5add1');
  assert.equal(img1.data, 'https://res.cloudinary.com/soegtip6/image/upload/v1789387821/atlas-radiologico/o0ykul2z1qp00pp6yxel.jpg');
  assert.equal(img1.source, 'cloudinary');
  assert.equal(img1.createdAt, '2026-09-14T12:10:21Z');
  // e os campos de identidade agora refletem o destino (compatibilidade operacional do id)
  assert.equal(img1.lesionName, 'Abscesso cerebral');
  assert.equal(img1.lesionId, 'seed_10');
});

// ===========================================================================
// 6) assignedAt NÃO MUDA / 7) PRODUTIVIDADE NÃO INCREMENTA
// ===========================================================================

test('6. assignedAt existente é preservado; assignedAt null continua null', async () => {
  const fixture = baseFixture();
  const oligoEntry = fixture.find(e => e.id === 'seed_11');
  oligoEntry.images[0].assignedAt = '2026-09-14T12:10:21.000Z'; // já tinha um valor real
  // images[1] fica com assignedAt: null (default do fixture)
  const { api, ctx } = loadFix(fixture);
  await api.fixAbscessoOligodendrogliomaOwnership20260921();
  const abscesso = ctx.DATA.find(e => e.id === 'seed_10');
  const img1 = abscesso.images.find(i => i.publicId === 'atlas-radiologico/o0ykul2z1qp00pp6yxel');
  const img2 = abscesso.images.find(i => i.publicId === 'atlas-radiologico/n5oyigvmkpb8zpqykd3g');
  assert.equal(img1.assignedAt, '2026-09-14T12:10:21.000Z', 'assignedAt existente não pode mudar');
  assert.equal(img2.assignedAt, null, 'assignedAt null continua null — não é nova atribuição');
});

test('7. a função nunca chama stampNewImagesAssignedAt (não é produtividade nova)', () => {
  const fnSrc = extractFunction(html, 'fixAbscessoOligodendrogliomaOwnership20260921').body;
  assert.doesNotMatch(fnSrc, /stampNewImagesAssignedAt/);
});

// ===========================================================================
// 8) SEM UPLOAD CLOUDINARY / 9) SEM DESTROY CLOUDINARY
// ===========================================================================

test('8-9. a função nunca faz upload nem destroy no Cloudinary', () => {
  const fnSrc = extractFunction(html, 'fixAbscessoOligodendrogliomaOwnership20260921').body;
  assert.doesNotMatch(fnSrc, /uploadToCloudinary|uploadPendingImage/, 'sem upload');
  assert.doesNotMatch(fnSrc, /destroy|requestCloudinaryAssetDeletion|deleteAsset/i, 'sem destroy remoto');
});

// ===========================================================================
// 10) SRS INTACTO / 11) REVISÃO INTACTA
// ===========================================================================

test('10-11. SRS, REVIEW e LESION_REVISIONS ficam byte-a-byte intactos (indexados por id de lesão, que não muda)', async () => {
  const srs = { seed_10: { interval: 3, due: 1, streak: 1, updatedAt: 111 }, seed_11: { interval: 5, due: 2, streak: 2, updatedAt: 222 } };
  const review = { seed_10: 1, seed_11: 2 };
  const revisions = { lrev_1: { id: 'lrev_1', lesionId: 'seed_11', status: 'pending' } };
  const { api, ctx } = loadFix(baseFixture(), { srs, review, revisions });
  const before = { srs: JSON.stringify(ctx.SRS), review: JSON.stringify(ctx.REVIEW), rev: JSON.stringify(ctx.LESION_REVISIONS) };
  await api.fixAbscessoOligodendrogliomaOwnership20260921();
  assert.equal(JSON.stringify(ctx.SRS), before.srs, 'SRS não pode mudar');
  assert.equal(JSON.stringify(ctx.REVIEW), before.review, 'REVIEW não pode mudar');
  assert.equal(JSON.stringify(ctx.LESION_REVISIONS), before.rev, 'LESION_REVISIONS não pode mudar');
});

// ===========================================================================
// 12) LEGACY_ID_ONLY NÃO É ALTERADO
// ===========================================================================

test('12. uma imagem LEGACY_ID_ONLY não relacionada (id desatualizado, lesionName já correto) não é tocada', async () => {
  const fixture = baseFixture();
  // Metástase cerebral (seed_9) tem uma imagem com lesionId desatualizado
  // (seed_10) mas lesionName já bate com o container — LEGACY_ID_ONLY.
  const { api, ctx } = loadFix(fixture);
  const before = JSON.stringify(ctx.DATA.find(e => e.id === 'seed_9'));
  await api.fixAbscessoOligodendrogliomaOwnership20260921();
  const after = JSON.stringify(ctx.DATA.find(e => e.id === 'seed_9'));
  assert.equal(after, before, 'entrada LEGACY_ID_ONLY não relacionada precisa continuar idêntica');
});

// ===========================================================================
// 13) CANONICAL REFRESH POR ID CONTINUA BLOQUEADO / 14) CONFLITO SEMÂNTICO
//     NUNCA É AUTOAPLICADO (bloco de proteção arquitetural em loadData())
// ===========================================================================

test('13. CANONICAL_REFRESH_DISABLED_V250 continua true — não foi reativado', () => {
  const loadDataFn = extractFunction(html, 'loadData');
  assert.match(loadDataFn.body, /const CANONICAL_REFRESH_DISABLED_V250 = true;/);
});

function loadCanonicalRefreshBlock() {
  // Extrai só o corpo do DATA.forEach(...) de dentro de loadData(), pra
  // testar a lógica de proteção isoladamente (sem rodar o loadData inteiro).
  const loadDataFn = extractFunction(html, 'loadData');
  const start = loadDataFn.body.indexOf('DATA.forEach(e=>{');
  assert.notEqual(start, -1);
  const ob = loadDataFn.body.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = ob; i < loadDataFn.body.length; i += 1) {
    if (loadDataFn.body[i] === '{') depth += 1;
    else if (loadDataFn.body[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const forEachBody = loadDataFn.body.slice(ob + 1, end);
  return forEachBody;
}

test('14. se reativado no futuro, o bloco canônico BLOQUEIA quando a identidade semântica não bate — nunca autoaplica', () => {
  const forEachBody = loadCanonicalRefreshBlock();
  const conflicts = [];
  const ctx = vm.createContext({
    registerImageOwnershipConflict: (c) => { conflicts.push(c); return c; },
    stableImageKeyV208: () => '',
    console
  });
  const src = normalizeExternalTitleFn.source + '\n' + exactLesionIdentityKeyFn.source +
    '\nfunction run(e, CANONICAL_REFRESH_DISABLED_V250, seedById){ let canonicalRefreshed = 0;\n' + forEachBody + '\n}\nthis.__run = run;';
  vm.runInContext(src, ctx);

  // Simula exatamente o corpo real, com CANONICAL_REFRESH_DISABLED_V250
  // forçado a false só para provar que o guard semântico funcionaria SE
  // alguém reativasse — não é assim que o app roda hoje (ver teste 13).
  const seedById = new Map([
    ['seed_11', { s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', name: 'Oligodendroglioma', images: [] }]
  ]);
  const persistedMismatched = { id: 'seed_11', s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', name: 'Abscesso cerebral', images: [{ publicId: 'x' }] };
  const persistedMatched = { id: 'seed_11', s: 'Neurorradiologia', site: 'Intra-axial (parênquima)', name: 'Oligodendroglioma', images: [] };

  const before = JSON.stringify(persistedMismatched);
  ctx.__run(persistedMismatched, false, seedById);
  assert.equal(JSON.stringify(persistedMismatched), before, 'identidade divergente: NADA pode ser alterado automaticamente');
  assert.equal(conflicts.length, 1, 'o conflito precisa ser REGISTRADO, nunca resolvido em silêncio');
  assert.equal(conflicts[0].kind, 'canonical_refresh_identity_mismatch_blocked');

  ctx.__run(persistedMatched, false, seedById);
  assert.equal(persistedMatched.name, 'Oligodendroglioma', 'identidade compatível: o sincronismo (se reativado) pode prosseguir normalmente');
});
