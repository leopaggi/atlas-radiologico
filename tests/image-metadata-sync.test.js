'use strict';

/* PROTEÇÃO 092 — metadados da MESMA imagem sincronizados por campo entre
 * PCs. Funções REAIS do index.html em `vm`: identidade (imageIdentityKeys/
 * stableImageKeyV208), unionEntryImages (+ mergeImageMetadata), carimbo por
 * campo no Salvar/Concluído (applyImageMetadataEdits) e integração estática.
 * O cenário com write/read/pull REAIS está em multi-device-sync.test.js
 * ("PROTEÇÃO 092").
 *
 * Schema real auditado: imagens principais NÃO têm `caption`/`credit`
 * (esses nomes só existem no vínculo 093b — captionOverride/creditOverride —
 * e nas imagens didáticas antigas da 093). O equivalente na imagem
 * principal é `label` (legenda/descrição) e `attribution` (crédito, vindo do
 * Commons); os testes 5-7 usam esses campos.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const FNS = ['stableImageKeyV208', 'imageIdentityKeys', 'imageOwnerIdV1', 'canChangeImageOwnership', 'isValidAssignedAt', 'adoptOldestAssignedAt', 'unionEntryImages',
  'imageMetaFields', 'imageMetaNorm', 'imageMetaTopValue', 'imageMetaCtxValue', 'imageMetaStamp', 'imageMetaAWins', 'mergeImageMetadata',
  'snapshotImageMetaByKey', 'applyImageMetadataEdits', 'isImageTombstoned', 'applyImageTombstonesToList', 'tombstoneScopeKey',
  'linkedImageViews', 'activeImageRefs', 'resolveLesionImageRef', 'didacticImageId', 'didacticImageRefId', 'isPendingImageRefId', 'didacticImageAltIds'];
function api() {
  const ctx = vm.createContext({ Date, Math, JSON, console, Map, Set });
  vm.runInContext('function registerImageOwnershipConflict(){}\n' + FNS.map((n) => extractFunction(html, n)).join('\n')
    + '\nthis.__a = { ' + FNS.join(', ') + ' };', ctx);
  return ctx.__a;
}
const A = api();
const img = (over) => Object.assign({ data: 'https://res.cloudinary.com/x/image/upload/v1/atlas/p1.png', publicId: 'atlas/p1', assetId: 'A1', source: 'cloudinary',
  lesionId: 'seed_1', lesionName: 'Lesão 1', label: 'original' }, over || {});
const one = (list) => { assert.equal(list.length, 1, 'uma imagem só (sem clone)'); return plain(list[0]); };
const SYNC = (ha, hb) => ({ symmetric: true, hintA: ha || 0, hintB: hb || 0 });
const union = (L, R, opts) => A.unionEntryImages(L, R, { id: 'seed_1', name: 'Lesão 1' }, null, 'pull', null, opts || SYNC());
const meta = (im) => ({ label: im.label, sourcePage: im.sourcePage, attribution: im.attribution, clinicalContext: im.clinicalContext, metaUpdatedAt: im.metaUpdatedAt, clinicalContextUpdatedAt: im.clinicalContextUpdatedAt });

test('092 1: mesma imagem reconhecida pela identidade de sempre (assetId/publicId/URL) — nunca vira duas', () => {
  const local = img();
  const byUrlOnly = { data: 'https://res.cloudinary.com/x/image/upload/v7/atlas/p1.png', source: 'url', label: 'x', lesionId: 'seed_1' }; // outro PC só com a URL
  one(union([local], [byUrlOnly]));
  one(union([local], [img({ data: 'https://outra.url/p1.png' })]), 'mesmo assetId');
  assert.equal(union([local], [img({ assetId: 'A2', publicId: 'atlas/p2', data: 'https://res.cloudinary.com/x/image/upload/v1/atlas/p2.png' })]).length, 2, 'asset diferente continua separado');
});

test('092 2-4: PC A edita label, PC B edita sourcePage -> merge preserva os dois', () => {
  const pcA = img({ label: 'RM T2 — A', metaUpdatedAt: { label: 5000 }, sourcePage: 'https://commons/antigo' });
  const pcB = img({ label: 'original', sourcePage: 'https://radiopaedia.org/novo', metaUpdatedAt: { sourcePage: 6000 } });
  const r = one(union([pcA], [pcB]));
  assert.equal(r.label, 'RM T2 — A');
  assert.equal(r.sourcePage, 'https://radiopaedia.org/novo');
  assert.deepEqual(r.metaUpdatedAt, { label: 5000, sourcePage: 6000 });
});

test('092 5-7: legenda (label) no PC A e crédito (attribution) no PC B -> ambos preservados', () => {
  const pcA = img({ label: 'legenda A', attribution: 'autor antigo', metaUpdatedAt: { label: 7000 } });
  const pcB = img({ label: 'original', attribution: 'Autor novo (CC-BY)', metaUpdatedAt: { attribution: 7100 } });
  const r = one(union([pcA], [pcB]));
  assert.equal(r.label, 'legenda A');
  assert.equal(r.attribution, 'Autor novo (CC-BY)');
  assert.equal('caption' in r || 'credit' in r, false, 'não inventa caption/credit na imagem principal');
});

test('092 8: clinicalContext por subcampo (apresentação no A, idade no B)', () => {
  const pcA = img({ clinicalContext: { presentation: 'dor em FID há 2 dias', patientSex: 'Feminino' }, clinicalContextUpdatedAt: { presentation: 5000 } });
  const pcB = img({ clinicalContext: { presentation: 'dor', patientAge: '34', patientSex: 'Feminino' }, clinicalContextUpdatedAt: { patientAge: 6000 } });
  const r = one(union([pcA], [pcB]));
  assert.deepEqual(r.clinicalContext, { presentation: 'dor em FID há 2 dias', patientAge: '34', patientSex: 'Feminino' });
  assert.deepEqual(r.clinicalContextUpdatedAt, { presentation: 5000, patientAge: 6000 });
});

test('092 9: limpeza intencional sincroniza (vazio CARIMBADO vence valor antigo, também no subcampo)', () => {
  const cleared = img({ label: '', metaUpdatedAt: { label: 8000 }, clinicalContext: { presentation: 'p' }, clinicalContextUpdatedAt: { notes: 8000 } });
  const stale = img({ label: 'legenda antiga', metaUpdatedAt: { label: 3000 }, clinicalContext: { presentation: 'p', notes: 'obs antiga' } });
  for (const r of [one(union([cleared], [stale])), one(union([stale], [cleared]))]) {
    assert.equal(r.label, '');
    assert.deepEqual(r.clinicalContext, { presentation: 'p' });
    assert.equal(r.metaUpdatedAt.label, 8000);
  }
  // Salvar: apagar a legenda GRAVA o carimbo do campo
  const opened = [img({ label: 'legenda antiga' })];
  const base = A.snapshotImageMetaByKey(opened);
  const saved = A.applyImageMetadataEdits(base, opened, [img({ label: '' })], 9000);
  assert.equal(saved[0].label, '');
  assert.deepEqual(plain(saved[0].metaUpdatedAt), { label: 9000 });
});

test('092 10/20: legado sem carimbo — vazio não apaga preenchido; dados antigos continuam válidos', () => {
  const filled = img({ label: 'legenda legada', clinicalContext: { presentation: 'x' } });
  const empty = img({ label: '' });
  delete empty.clinicalContext;
  for (const r of [one(union([filled], [empty])), one(union([empty], [filled]))]) {
    assert.equal(r.label, 'legenda legada');
    assert.deepEqual(r.clinicalContext, { presentation: 'x' });
    assert.equal('metaUpdatedAt' in r, false, 'nenhum carimbo inventado para dado antigo');
  }
  // idênticos sem carimbo: resultado idêntico ao de antes (sem campos novos)
  assert.deepEqual(one(union([img()], [img()])), plain(img()));
  // fora do sync (sem metaOpts, ex.: ferramenta manual de push): base mantida como antes
  const r = one(A.unionEntryImages([img({ label: 'base' })], [img({ label: 'outro' })], { id: 'seed_1' }, null, 'push'));
  assert.equal(r.label, 'base');
});

test('092 11-13: empate determinístico; merge(A,B) == merge(B,A); idempotente', () => {
  const x = img({ label: 'alfa', metaUpdatedAt: { label: 5000 }, clinicalContext: { notes: 'n1' }, clinicalContextUpdatedAt: { notes: 5000 } });
  const y = img({ label: 'beta', metaUpdatedAt: { label: 5000 }, clinicalContext: { notes: 'n2' }, clinicalContextUpdatedAt: { notes: 5000 } });
  const xy = one(union([x], [y])), yx = one(union([y], [x]));
  assert.deepEqual(meta(xy), meta(yx));
  assert.equal(xy.label, 'beta', 'mesmo carimbo: valor canônico maior');
  assert.deepEqual(one(union([xy], [y])), xy, 'idempotente');
  assert.deepEqual(one(union([xy], [xy])), xy);
  // legado divergente no sync: lesão editada por último, depois lexical — igual nos dois sentidos
  const l1 = img({ label: 'L1' }), l2 = img({ label: 'L2' });
  assert.equal(one(union([l1], [l2], SYNC(10, 20))).label, 'L2');
  assert.equal(one(union([l2], [l1], SYNC(20, 10))).label, 'L2');
  assert.equal(one(union([l1], [l2], SYNC(5, 5))).label, one(union([l2], [l1], SYNC(5, 5))).label);
  // 3 PCs em qualquer ordem convergem
  const z = img({ sourcePage: 'https://z', metaUpdatedAt: { sourcePage: 7000 } });
  const r1 = one(union([one(union([x], [y]))], [z])), r2 = one(union([z], [one(union([y], [x]))]));
  assert.deepEqual(meta(r1), meta(r2));
});

test('092 14: tela aberta desatualizada salva outra coisa e NÃO apaga metadado novo (rebase no Salvar)', () => {
  const opened = [img({ label: 'antigo', clinicalContext: { presentation: 'p0' } })];
  const baseline = A.snapshotImageMetaByKey(opened);
  // enquanto a tela estava aberta, o pull trouxe o label novo do outro PC
  const current = [img({ label: 'novo do outro PC', metaUpdatedAt: { label: 5000 }, clinicalContext: { presentation: 'p0' } })];
  // usuário só mexeu na idade do contexto
  const next = [img({ label: 'antigo', clinicalContext: { presentation: 'p0', patientAge: '50' } })];
  const out = plain(A.applyImageMetadataEdits(baseline, current, next, 9000))[0];
  assert.equal(out.label, 'novo do outro PC', 'campo não editado adota o estado atual (não reverte)');
  assert.deepEqual(out.metaUpdatedAt, { label: 5000 });
  assert.deepEqual(out.clinicalContext, { presentation: 'p0', patientAge: '50' });
  assert.deepEqual(out.clinicalContextUpdatedAt, { patientAge: 9000 }, 'só o subcampo editado ganha carimbo (sem conflito artificial)');
  // imagem nova nesta edição: sem carimbos (criação)
  const fresh = A.applyImageMetadataEdits(baseline, current, [img({ assetId: 'N', publicId: 'n', data: 'https://x/n.png', label: 'nova' })], 9000);
  assert.equal('metaUpdatedAt' in fresh[0], false);
});

test('092 15: imagem tombstonada não ressuscita por metadado mais novo', () => {
  const tomb = { ['seed_1\u0001asset:A1']: { key: 'asset:A1', lesionId: 'seed_1', deletedAt: '2026-09-26T10:00:00.000Z' } };
  const newer = img({ label: 'editado depois', metaUpdatedAt: { label: 9e12 } });
  const merged = union([], [newer]);
  assert.equal(A.applyImageTombstonesToList(merged, 'seed_1', tomb).images.length, 0);
  const merge = extractFunction(html, 'mergeEntryNonDestructive');
  assert.ok(merge.indexOf("unionEntryImages(local.images, remote.images") < merge.indexOf('applyImageTombstonesToList(merged.images'), 'tombstone aplicado DEPOIS da união/merge de metadados');
});

test('092 16-17: imageRefs continuam válidos; captionOverride não altera a legenda principal (e vice-versa)', () => {
  const pcA = img({ label: 'principal nova', metaUpdatedAt: { label: 5000 } });
  const merged = one(union([pcA], [img({ label: 'principal antiga' })]));
  const entry = { images: [merged] };
  const refs = [{ imageId: 'asset:A1', order: 0, createdAt: 1, updatedAt: 1 }];
  assert.equal(A.linkedImageViews({ imageRefs: refs }, entry)[0].caption, 'principal nova', 'vínculo resolve na MESMA imagem mesclada');
  const withOverride = [{ imageId: 'asset:A1', order: 0, captionOverride: 'só no sinal', createdAt: 1, updatedAt: 1 }];
  assert.equal(A.linkedImageViews({ imageRefs: withOverride }, entry)[0].caption, 'só no sinal');
  assert.equal(merged.label, 'principal nova', 'override vive no vínculo');
  assert.equal(A.imageMetaFields().top.includes('captionOverride'), false);
});

test('092 18: sourcePage não se perde (nem por PC que não tem o campo)', () => {
  const withSrc = img({ sourcePage: 'https://commons.wikimedia.org/wiki/File:a.png', sourceSite: 'Wikimedia Commons', license: 'CC BY 4.0' });
  const without = img();
  for (const r of [one(union([withSrc], [without])), one(union([without], [withSrc]))]) {
    assert.equal(r.sourcePage, 'https://commons.wikimedia.org/wiki/File:a.png');
    assert.equal(r.sourceSite, 'Wikimedia Commons');
    assert.equal(r.license, 'CC BY 4.0');
  }
});

test('092 19: quadro (panels) — painéis ficam no asset; editar o quadro gera OUTRO asset (sem merge de painel necessário)', () => {
  const board = img({ panels: [{ data: 'https://x/1.png', label: 'T1' }, { data: 'https://x/2.png', label: 'T2' }], label: 'Quadro', metaUpdatedAt: { label: 1 } });
  const other = img({ panels: [{ data: 'https://x/1.png', label: 'T1' }, { data: 'https://x/2.png', label: 'T2' }], label: 'Quadro editado', metaUpdatedAt: { label: 2 } });
  const r = one(union([board], [other]));
  assert.equal(r.label, 'Quadro editado');
  assert.deepEqual(r.panels, plain(board.panels), 'painéis preservados');
  // reabrir o construtor substitui por um quadro NOVO (source pending -> novo upload/asset)
  assert.match(extractFunction(html, 'openForm'), /pendingImgs\[idx\]=collage; imgsChanged=true; renderImgGallery\(\);/);
});

test('092 integração: Salvar do formulário e Concluído do Quiz carimbam por campo; pull/reconcile é simétrico', () => {
  const form = extractFunction(html, 'openForm');
  assert.match(form, /formImageMetaBaseline = snapshotImageMetaByKey\(pendingImgs\);/);
  assert.match(form, /remoteImgs = applyImageMetadataEdits\(formImageMetaBaseline, existing && Array\.isArray\(existing\.images\) \? existing\.images : \[\], remoteImgs, Date\.now\(\)\);/);
  const quiz = html.slice(html.indexOf("cov.querySelector('#quiz-add-img-done').onclick"), html.indexOf("cov.querySelector('#quiz-add-img-done').onclick") + 3000);
  assert.match(quiz, /applyImageMetadataEdits\(quizImageMetaBaseline, prevQuizImgs, lesion\.images, Date\.now\(\)\)/);
  const merge = extractFunction(html, 'mergeEntryNonDestructive');
  assert.match(merge, /unionEntryImages\(local\.images, remote\.images, merged, PULL_IMAGE_OWNERSHIP_CONFLICTS, 'pull', pullCatalog, \{ symmetric: !!preferRemoteWhenUntimed, hintA: lt, hintB: rt \}\)/);
  assert.match(extractFunction(html, 'reconcileStateWithRemote'), /mergeEntryNonDestructive\(l,r,localData,IMAGE_TOMBSTONES,true\)/, 'pull e reconcile-before-push usam o modo simétrico');
  // contexto clínico: os subcampos são exatamente os do schema 088
  const limits = /const IMAGE_CLINICAL_CONTEXT_LIMITS = \{([^}]*)\}/.exec(html)[1];
  assert.deepEqual(plain(A.imageMetaFields().ctx), limits.split(',').map((x) => x.split(':')[0].trim()));
  // edição direta de label (API do Quiz) carimba só o label
  const upd = extractFunction(html, 'updateLesionImageLabel');
  assert.match(upd, /label: Math\.max\(Date\.now\(\), prevStamp \+ 1\)/);
});
