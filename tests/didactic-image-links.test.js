'use strict';

/* PROTEÇÃO 093b — vínculos de imagens JÁ ENVIADAS da lesão (entry.images,
 * fonte única do asset) com casos clínicos, sinais radiológicos e
 * classificações/esquemas (item.imageRefs). Funções REAIS do index.html em
 * `vm` (vínculo, desvínculo, ordem, override, merge por vínculo, seleção,
 * "último caso clínico", migração 093 -> 093b, renderização) + checagens
 * estáticas da fiação da UI (galeria, editor, Ctrl+V, Quiz). O cenário
 * multi-PC com write/read/pull REAIS está em multi-device-sync.test.js
 * ("PROTEÇÃO 093b").
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const userscript = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'radiopaedia-to-atlas.user.js'), 'utf8');

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
const MODULE = html.slice(html.indexOf('/* ============================================================\n   PROTEÇÃO 093 — CONTEÚDO DIDÁTICO POR LESÃO'),
  html.indexOf('/* ============================================================\n   SÍTIO/ÓRGÃO'));
const plain = (v) => JSON.parse(JSON.stringify(v));

const NAMES = ['sortDidacticItems', 'mergeDidacticItems', 'mergeClinicalCaseLists', 'normalizeRadiologicSign', 'normalizeClassificationScheme', 'normalizeManualClinicalCase',
  'upsertDidacticItem', 'deleteDidacticItem', 'radiologicSignsSectionHtml', 'classificationSchemesSectionHtml', 'lesionDidacticQuizHtml', 'clinicalCasesSectionHtml',
  'addClinicalCaseToLesion', 'didacticImageId', 'isLinkableLesionImage', 'resolveLesionImageRef', 'findSameLesionImage', 'mergeImageRefLists', 'activeImageRefs',
  'isImageLinked', 'linkImageRef', 'unlinkImageRef', 'moveImageRef', 'setImageRefOverrides', 'pruneTombstonedImageRefs', 'didacticPickKey',
  'updateDidacticItemImageRefs', 'didacticListsOfEntry', 'imageLinkSummary', 'applyImageLinkSelection', 'latestClinicalCase', 'linkImageToLatestClinicalCase',
  'commitDidacticLinkChanges', 'migrateLegacyDidacticImages', 'auditDidacticImages', 'linkedImageViews', 'didacticImageViews', 'didacticImageCount', 'imageLinkButtonHtml'];
function api() {
  const deps = ['escAttr', 'esc', 'canonicalJsonString', 'normalizeExternalTitle', 'clinicalCaseIdentityKey', 'unionClinicalCases', 'sameExternalUrl',
    'buildClinicalCaseFromDraft', 'lesionHasClinicalCaseUrl', 'addClinicalCaseToLesion', 'clinicalCaseRowHtml', 'clinicalCasesSectionHtml', 'stableImageKeyV208']
    .map((n) => extractFunction(html, n)).join('\n');
  const ctx = vm.createContext({ URL, Date, Math, JSON, console });
  vm.runInContext(deps + '\n' + MODULE + '\nthis.__a = { ' + NAMES.join(', ') + ' };', ctx);
  return ctx.__a;
}
const A = api();

// imagem PRINCIPAL da lesão (entry.images) — formato real do uploadToCloudinary
const main = (n, over) => Object.assign({ label: 'legenda principal ' + n, data: 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/' + n + '.png',
  thumb: 'https://res.cloudinary.com/x/image/upload/c_thumb/v1/atlas-radiologico/' + n + '.png', source: 'cloudinary', publicId: 'atlas-radiologico/' + n,
  assetId: 'asset' + n, lesionId: 'seed_1', lesionName: 'Lesão 1' }, over || {});
const sign = (id, over) => Object.assign({ id, title: 'Sinal ' + id, strength: 'specific', description: '', images: [], order: 0, createdAt: 1000, updatedAt: 1000 }, over || {});
const scheme = (id, over) => Object.assign({ id, title: 'Classificação ' + id, content: '', links: [], images: [], order: 0, createdAt: 1000, updatedAt: 1000 }, over || {});
const kase = (id, over) => Object.assign({ id, origin: 'manual', title: 'Caso ' + id, presentation: 'p', order: 0, createdAt: 1000, updatedAt: 1000 }, over || {});
function lesion() {
  return { id: 'seed_1', name: 'Lesão 1', images: [main(1), main(2), main(3)],
    clinicalCases: [kase('c1')], radiologicSigns: [sign('s1')], classificationSchemes: [scheme('k1')] };
}
const idOf = (im) => A.didacticImageId(im);
const select = (over) => Object.assign({ cases: new Set(), signs: new Set(), schemes: new Set() }, over || {});
const editorFn = extractFunction(html, 'openDidacticItemEditor');
const formFn = extractFunction(html, 'openForm');
const detailFn = extractFunction(html, 'openDetail');

// ------------------------------------------------------------ VÍNCULOS
test('093b 1-3: imagem da lesão vinculada a caso clínico, sinal e classificação (só referência)', () => {
  const e = lesion();
  const id1 = idOf(e.images[0]);
  assert.equal(id1, 'asset:asset1', 'imageId = identidade estável da imagem principal (mesma chave dos tombstones)');
  const res = A.applyImageLinkSelection(A.didacticListsOfEntry(e), id1, select({ cases: new Set(['c1']), signs: new Set(['s1']), schemes: new Set(['k1']) }), 2000);
  assert.deepEqual(plain(res.changed), { cases: true, signs: true, schemes: true });
  assert.equal(A.commitDidacticLinkChanges(e, res), true);
  for (const f of ['clinicalCases', 'radiologicSigns', 'classificationSchemes']) {
    assert.deepEqual(plain(e[f][0].imageRefs), [{ imageId: id1, order: 0, createdAt: 2000, updatedAt: 2000 }], f);
    assert.equal(e[f][0].updatedAt, 1000, f + ': vincular NÃO mexe no updatedAt do item');
  }
  assert.equal(e.images.length, 3, 'nenhuma imagem criada/copiada');
  assert.equal(JSON.stringify(e.radiologicSigns).includes('res.cloudinary.com'), false, 'o item guarda só o vínculo, nunca o asset');
});

test('093b 4: o MESMO asset com vários vínculos, sem duplicar nada', () => {
  const e = lesion();
  e.radiologicSigns.push(sign('s2', { order: 1 }));
  const id2 = idOf(e.images[1]);
  const res = A.applyImageLinkSelection(A.didacticListsOfEntry(e), id2, select({ cases: new Set(['c1']), signs: new Set(['s1', 's2']), schemes: new Set(['k1']) }), 2000);
  A.commitDidacticLinkChanges(e, res);
  assert.deepEqual(plain(A.imageLinkSummary(A.didacticListsOfEntry(e), id2).map((w) => w.kind + ':' + w.key)), ['cases:c1', 'signs:s1', 'signs:s2', 'schemes:k1']);
  assert.equal(e.images.filter((im) => im.publicId === 'atlas-radiologico/2').length, 1, 'um asset só');
  const btn = A.imageLinkButtonHtml(A.didacticListsOfEntry(e), e.images[1], 'data-link-idx="1"');
  assert.match(btn, /class="image-link-btn linked"/);
  assert.match(btn, />🔗 4<\/button>/, 'vínculos existentes aparecem de forma discreta');
  assert.match(btn, /Vinculada a: Caso clínico — Caso c1; Sinal radiológico — Sinal s1/);
  assert.match(A.imageLinkButtonHtml(A.didacticListsOfEntry(e), e.images[2], ''), />🔗 Vincular a…<\/button>/);
});

test('093b 5: desvincular remove só o vínculo (tombstone); a imagem principal continua', () => {
  const e = lesion();
  const id1 = idOf(e.images[0]);
  A.commitDidacticLinkChanges(e, A.applyImageLinkSelection(A.didacticListsOfEntry(e), id1, select({ signs: new Set(['s1']) }), 2000));
  const res = A.applyImageLinkSelection(A.didacticListsOfEntry(e), id1, select(), 3000);
  assert.deepEqual(plain(res.changed), { cases: false, signs: true, schemes: false });
  A.commitDidacticLinkChanges(e, res);
  assert.deepEqual(plain(e.radiologicSigns[0].imageRefs), [{ imageId: id1, order: 0, createdAt: 2000, updatedAt: 3000, deletedAt: 3000 }]);
  assert.equal(A.isImageLinked(e.radiologicSigns[0].imageRefs, id1), false);
  assert.equal(e.images.length, 3, 'imagem principal intacta');
  assert.deepEqual(plain(e.images[0]), plain(main(1)));
  // revincular depois revive o MESMO vínculo com carimbo mais novo
  const again = A.linkImageRef(e.radiologicSigns[0].imageRefs, id1, 4000);
  assert.deepEqual(plain(again), [{ imageId: id1, order: 0, createdAt: 2000, updatedAt: 4000 }]);
});

test('093b 6: imagem principal excluída -> vínculo INERTE (não renderiza, não ressuscita); o Salvar do editor desativa', () => {
  const e = lesion();
  const id3 = idOf(e.images[2]);
  e.radiologicSigns[0].imageRefs = [{ imageId: id3, order: 0, createdAt: 2000, updatedAt: 2000 }];
  e.images = e.images.slice(0, 2); // excluída pela galeria (tombstone 073)
  assert.equal(A.linkedImageViews(e.radiologicSigns[0], e).length, 0, 'nada renderizado');
  assert.doesNotMatch(A.radiologicSignsSectionHtml(e), /<img /);
  assert.equal(e.images.length, 2, 'renderizar nunca recria a imagem');
  // ausência SEM tombstone (ex.: ainda não sincronizou) mantém o vínculo
  assert.deepEqual(plain(A.pruneTombstonedImageRefs(e.radiologicSigns[0].imageRefs, e.images, () => false, 5000)), plain(e.radiologicSigns[0].imageRefs));
  // tombstone confirmado -> vínculo desativado (sem apagar nada da galeria)
  const pruned = A.pruneTombstonedImageRefs(e.radiologicSigns[0].imageRefs, e.images, (k) => k === id3, 5000);
  assert.equal(pruned[0].deletedAt, 5000);
  assert.match(extractFunction(html, 'openForm'), /isTombstoned: \(imageId\)=>\{[\s\S]{0,300}tombstoneScopeKey\(imageId, formEntryId\)/, 'mesma chave escopada dos tombstones 073b');
  const audit = A.auditDidacticImages([e]);
  assert.equal(audit.orphanRefs, 1, 'auditoria somente leitura aponta o vínculo órfão');
});

test('093b 7: reordenar imagens vinculadas (ordem própria do item)', () => {
  let refs = [];
  for (const [k, t] of [['a', 1], ['b', 2], ['c', 3]]) refs = A.linkImageRef(refs, 'asset:asset' + k, t);
  assert.deepEqual(plain(A.activeImageRefs(refs).map((r) => r.imageId)), ['asset:asseta', 'asset:assetb', 'asset:assetc']);
  refs = A.moveImageRef(refs, 'asset:assetc', -1, 10);
  assert.deepEqual(plain(A.activeImageRefs(refs).map((r) => r.imageId)), ['asset:asseta', 'asset:assetc', 'asset:assetb']);
  refs = A.moveImageRef(refs, 'asset:asseta', -1, 11);
  assert.deepEqual(plain(A.activeImageRefs(refs).map((r) => r.imageId)), ['asset:asseta', 'asset:assetc', 'asset:assetb'], 'primeira não sobe');
  const e = lesion();
  e.images.push(main('a'), main('b'), main('c'));
  e.radiologicSigns[0].imageRefs = refs;
  const out = A.radiologicSignsSectionHtml(e);
  assert.ok(out.indexOf('/a.png') < out.indexOf('/c.png') && out.indexOf('/c.png') < out.indexOf('/b.png'), 'detalhe respeita a ordem do item');
});

test('093b 8-9: captionOverride e creditOverride valem só no item; legenda principal intacta', () => {
  const e = lesion();
  const id1 = idOf(e.images[0]);
  let refs = A.linkImageRef([], id1, 2000);
  assert.match(A.radiologicSignsSectionHtml(Object.assign(e, { radiologicSigns: [sign('s1', { imageRefs: refs })] })), /legenda principal 1/, 'padrão = legenda principal');
  refs = A.setImageRefOverrides(refs, id1, { captionOverride: 'Sinal do alvo (seta)', creditOverride: 'Radiopaedia rID 1' }, 3000);
  e.radiologicSigns = [sign('s1', { imageRefs: refs })];
  const out = A.radiologicSignsSectionHtml(e);
  assert.match(out, /Sinal do alvo \(seta\) <span class="didactic-credit">— Radiopaedia rID 1<\/span>/);
  assert.equal(e.images[0].label, 'legenda principal 1', 'override nunca altera a imagem principal');
  assert.equal(refs[0].updatedAt, 3000);
  refs = A.setImageRefOverrides(refs, id1, { captionOverride: '' }, 4000);
  assert.equal('captionOverride' in refs[0], false, 'apagar o override volta à legenda principal');
  assert.equal(refs[0].creditOverride, 'Radiopaedia rID 1');
});

test('093b 10-11: imagem NOVA de sinal/classificação entra em entry.images (via galeria da lesão) e é vinculada', () => {
  // o editor NUNCA guarda o asset no item: usa a galeria (imageCtx.addImage)
  assert.match(editorFn, /let target = findSameLesionImage\(lesionImages\(\), imgObj\);\s*if \(!target\) \{ target = ctx\.addImage\(imgObj\);/);
  assert.match(editorFn, /refs = linkImageRef\(refs, id\); renderImgs\(\); return true;/);
  // 093c: arquivo/Ctrl+V = temporária do formulário (upload só no Salvar; ver didactic-pending-images)
  assert.match(editorFn, /const temp = ctx\.addPendingFile\(f\);/);
  assert.doesNotMatch(editorFn, /uploadToCloudinary|uploadPendingImage/, 'nenhum upload no editor do item');
  assert.doesNotMatch(editorFn, /imgs\.push\(|images\.push\(/, 'nenhum armazenamento paralelo dentro do item');
  // no formulário, addImage = pendingImgs (entry.images no Salvar, com lesionId/assignedAt/079d do fluxo normal)
  assert.match(formFn, /addImage: \(im\)=>\{ const n = \{ \.\.\.im, label: im\.label\|\|'', source: im\.source\|\|'url' \}; pendingImgs\.push\(n\); imgsChanged = true; renderImgGallery\(\); return n; \}/);
  assert.match(formFn, /markPendingLocalImageAdds\(entryId, prevForMark, remoteImgs\)/, 'imagem nova passa pelo marcador 079d de sempre');
  // sinal E classificação têm arquivo/URL/Ctrl+V; caso clínico só seleção
  assert.match(editorFn, /\(kind !== 'cases' \? '<label class="btn btn-ghost" style="margin:0;">\+ adicionar nova imagem<input type="file" id="de-img-file"/);
  assert.match(editorFn, /\+ selecionar imagens da lesão/);
  assert.match(editorFn, /Imagens vinculadas \(<span id="de-linked-count">/);
});

test('093b 12-13: Ctrl+V em sinal e em classificação usa o mesmo fluxo de imagem temporária + vínculo', () => {
  assert.match(editorFn, /if \(kind !== 'cases'\) ov\.addEventListener\('paste', \(ev\) => \{/);
  assert.match(editorFn, /x\.type\.startsWith\('image\/'\)\) \{ const f = x\.getAsFile\(\); if \(f\) files\.push\(f\); \}\s*if \(files\.length\) \{ ev\.preventDefault\(\); addPendingFiles\(files\); return; \}/);
  assert.match(editorFn, /if \(typeof pasteTargetIsText === 'function' && pasteTargetIsText\(ev\.target\)\) return;/, 'texto colado em campo continua colagem normal');
  assert.match(editorFn, /📋 Cole com Ctrl\+V aqui/);
});

test('093b 14: URL em sinal -> imagem da galeria + vínculo; URL já existente não duplica', () => {
  assert.match(editorFn, /if \(addAndLink\(\{ label: '', data: url, source: 'url' \}\)\)/);
  const e = lesion();
  const byUrl = { data: e.images[0].data + '?x=1', source: 'url' };
  assert.equal(A.findSameLesionImage(e.images, byUrl), e.images[0], 'mesma URL (sem query) = mesmo asset -> só vincula');
  const fresh = { label: '', data: 'https://upload.wikimedia.org/x/novo.png', source: 'url' };
  assert.equal(A.findSameLesionImage(e.images, fresh), null);
  assert.equal(idOf(fresh), 'data:https://upload.wikimedia.org/x/novo.png', 'URL nova tem identidade estável (mesma do tombstone 073)');
});

test('093b 15: selecionar imagens existentes — só as já enviadas; pendente/local não vincula', () => {
  assert.equal(A.isLinkableLesionImage(main(1)), true);
  assert.equal(A.isLinkableLesionImage({ data: 'blob:https://x/1', source: 'pending' }), false);
  assert.equal(A.isLinkableLesionImage({ data: 'data:image/png;base64,AAA', source: 'local' }), false);
  const picker = extractFunction(html, 'openLesionImagePicker');
  assert.match(picker, /\(id \? '' : ' disabled'\)/);
  assert.match(picker, /isImageLinked\(refs, id\) \? ' checked' : ''/, 'já vinculadas vêm marcadas');
  assert.match(editorFn, /openLesionImagePicker\(lesionImages\(\), refs, \(chosen\) => \{/);
});

test('093b 16: quadro (collage) que é item de entry.images vincula como qualquer imagem', () => {
  const board = main('board', { panels: [{ data: 'https://x/p1.png', label: 'T1' }, { data: 'https://x/p2.png', label: 'T2' }], label: 'Quadro T1/T2' });
  const e = lesion(); e.images.push(board);
  A.commitDidacticLinkChanges(e, A.applyImageLinkSelection(A.didacticListsOfEntry(e), idOf(board), select({ schemes: new Set(['k1']) }), 2000));
  const out = A.classificationSchemesSectionHtml(e);
  assert.match(out, /atlas-radiologico\/board\.png/);
  assert.match(out, /Quadro T1\/T2/);
  assert.equal((out.match(/<img /g) || []).length, 1, 'o quadro inteiro, uma imagem');
});

test('093b 17-18: "Vincular ao último caso clínico" (só por clique); nada vincula sozinho', () => {
  const e = lesion();
  e.clinicalCases = [kase('c1', { createdAt: 1000, updatedAt: 1000 }), { source: 'Radiopaedia', title: 'Importado agora', sourceUrl: 'https://radiopaedia.org/cases/x-1', addedAt: '2026-09-26T10:00:00.000Z' }, kase('c3', { createdAt: 5000, updatedAt: 5000, deletedAt: 9e12 })];
  const latest = A.latestClinicalCase(e.clinicalCases);
  assert.equal(latest.title, 'Importado agora', 'mais recente ativo (importação recente conta pelo addedAt; excluído não conta)');
  const id1 = idOf(e.images[0]);
  const r = A.linkImageToLatestClinicalCase(e.clinicalCases, id1, 3000);
  assert.equal(r.changed, true);
  const linked = r.list.find((c) => c.title === 'Importado agora');
  assert.ok(linked.id && linked.legacyKey, 'caso legado ganha id estável na 1ª gestão (como no 093)');
  assert.deepEqual(plain(linked.imageRefs.map((x) => x.imageId)), [id1]);
  // sem clique, nada: o atalho só existe dentro do menu 🔗, em onclick
  const picker = extractFunction(html, 'openImageLinkPicker');
  assert.match(picker, /latestBtn\.onclick = \(\) => \{\s*const r = linkImageToLatestClinicalCase\(/);
  assert.match(picker, /⚡ Vincular ao último caso clínico/);
  for (const fn of ['loadData', 'mergeEntryNonDestructive', 'addClinicalCaseToLesion', 'processExternalImportPayload', 'foldLesionMergesIntoState', 'syncFromFirebase']) {
    assert.doesNotMatch(extractFunction(html, fn), /linkImageRef|linkImageToLatestClinicalCase|applyImageLinkSelection|migrateLegacyDidacticImages/, fn + ' não vincula/migra sozinho');
  }
  const outside = html.replace(MODULE, '');
  assert.equal((outside.match(/openImageLinkPicker\(\{/g) || []).length, 2, 'só os 2 botões 🔗 (galeria do detalhe e do formulário)');
});

// ------------------------------------------------------------ SYNC
test('093b 19-20: merge por vínculo — A→B, concorrentes somam, desvincular não ressuscita, determinístico', () => {
  const base = sign('s1');
  const A1 = Object.assign({}, base, { imageRefs: [{ imageId: 'asset:1', order: 0, createdAt: 2000, updatedAt: 2000 }] });
  const B1 = Object.assign({}, base, { title: 'editado no B', updatedAt: 5000, imageRefs: [{ imageId: 'asset:2', order: 0, createdAt: 3000, updatedAt: 3000 }] });
  const ab = A.mergeDidacticItems([A1], [B1]);
  const ba = A.mergeDidacticItems([B1], [A1]);
  assert.deepEqual(plain(ab), plain(ba), 'mesmo resultado nos dois PCs');
  assert.equal(ab[0].title, 'editado no B', 'texto mais novo vence o item');
  assert.deepEqual(plain(A.activeImageRefs(ab[0].imageRefs).map((r) => r.imageId)).sort(), ['asset:1', 'asset:2'], 'vínculos dos dois lados preservados');
  // A desvincula asset:1; B desatualizado ainda o tem ativo
  const A2 = Object.assign({}, ab[0], { imageRefs: A.unlinkImageRef(ab[0].imageRefs, 'asset:1', 9000) });
  const back = A.mergeDidacticItems([ab[0]], [A2]);
  assert.deepEqual(plain(A.activeImageRefs(back[0].imageRefs).map((r) => r.imageId)), ['asset:2'], 'não ressuscita');
  assert.deepEqual(plain(A.mergeDidacticItems([A2], [ab[0]])), plain(back));
  // sem imageRefs dos dois lados: item idêntico ao 093 (sem campo novo)
  assert.equal('imageRefs' in A.mergeDidacticItems([base], [Object.assign({}, base, { updatedAt: 2 })])[0], false);
  // caso clínico com id segue o mesmo merge
  const cA = kase('c1', { imageRefs: [{ imageId: 'asset:1', order: 0, createdAt: 1, updatedAt: 1 }] });
  const cB = kase('c1', { imageRefs: [{ imageId: 'asset:2', order: 0, createdAt: 1, updatedAt: 1 }] });
  assert.equal(A.activeImageRefs(A.mergeClinicalCaseLists([cA], [cB])[0].imageRefs).length, 2);
  // item excluído continua excluído mesmo com vínculo novo do outro lado
  const del = A.deleteDidacticItem([base], 's1', 8000);
  const merged = A.mergeDidacticItems(del, [A1]);
  assert.equal(A.sortDidacticItems(merged).length, 0);
});

// ------------------------------------------------------------ EXIBIÇÃO / QUIZ
test('093b 21-22: detalhe mostra só as imagens vinculadas de cada item; lightbox navega entre elas', () => {
  const e = lesion();
  e.radiologicSigns[0].imageRefs = A.linkImageRef(A.linkImageRef([], idOf(e.images[0]), 1), idOf(e.images[2]), 2);
  e.clinicalCases[0].imageRefs = A.linkImageRef([], idOf(e.images[1]), 1);
  const signs = A.radiologicSignsSectionHtml(e);
  assert.match(signs, /\/1\.png/); assert.match(signs, /\/3\.png/); assert.doesNotMatch(signs, /\/2\.png/);
  assert.match(signs, /· 2 imagens/);
  assert.match(signs, /data-idx="0"[\s\S]*data-idx="1"/);
  assert.doesNotMatch(A.classificationSchemesSectionHtml(e), /<img /, 'item sem vínculo não mostra imagem');
  const cases = A.clinicalCasesSectionHtml(e);
  assert.match(cases, /\/2\.png/); assert.doesNotMatch(cases, /\/1\.png/);
  // detalhe: host re-renderizável + galeria principal intacta com botão 🔗
  assert.match(detailFn, /<div class="didactic-detail-host">\s*\$\{clinicalCasesSectionHtml\(e\)\}\s*\$\{radiologicSignsSectionHtml\(e\)\}\s*\$\{classificationSchemesSectionHtml\(e\)\}\s*<\/div>/);
  assert.match(detailFn, /imageLinkButtonHtml\(didacticListsOfEntry\(cur\), img, `data-link-idx="\$\{i\}"`\)/);
  assert.match(detailFn, /openImageLightbox\(it\.data, it\.label, all, idx\)/, 'lightbox da galeria principal intacto');
  const wire = extractFunction(html, 'wireDidacticImages');
  assert.match(wire, /openImageLightbox\(img\.getAttribute\('data-full'\), img\.getAttribute\('data-caption'\) \|\| '', nav, i\)/);
});

test('093b 23-24: Quiz — nada didático antes da resposta; depois, imagens via vínculo (sem duplicar a da questão)', () => {
  const quiz = extractFunction(html, 'renderQuizCardIntegrated');
  assert.equal((quiz.match(/lesionDidacticQuizHtml\(/g) || []).length, 1);
  assert.match(/function renderDetail\(\)\{[\s\S]*?\n  \}/.exec(quiz)[0], /lesionDidacticQuizHtml\(e\)/, 'só no detalhe pós-resposta');
  assert.equal((quiz.match(/imageRefs|radiologicSigns|classificationSchemes/g) || []).length, 0);
  for (const fn of ['quizImageClinicalContextHtml', 'quizImageDescHtml']) assert.doesNotMatch(extractFunction(html, fn), /imageRefs|radiologicSigns|classificationSchemes/);
  const e = lesion();
  e.radiologicSigns[0].imageRefs = A.linkImageRef([], idOf(e.images[0]), 1);
  const after = A.lesionDidacticQuizHtml(e);
  assert.equal((after.match(/<img /g) || []).length, 1);
  assert.match(after, /src="https:\/\/res\.cloudinary\.com\/x\/image\/upload\/c_thumb\/v1\/atlas-radiologico\/1\.png"/, 'mesmo asset da galeria (thumb), sem cópia');
  assert.equal(e.images.length, 3, 'Quiz não cria imagem nem questão nova');
});

// ------------------------------------------------------------ ASSETS / MIGRAÇÃO
test('093b 25: vínculo nunca envia ao Cloudinary nem duplica publicId/assetId', () => {
  for (const fn of ['linkImageRef', 'unlinkImageRef', 'applyImageLinkSelection', 'linkImageToLatestClinicalCase', 'openImageLinkPicker', 'openLesionImagePicker', 'migrateLegacyDidacticImages']) {
    assert.doesNotMatch(extractFunction(html, fn), /uploadToCloudinary|uploadPendingImage|fetch\(/, fn);
  }
  const e = lesion();
  const sameAsset = { data: 'https://res.cloudinary.com/x/image/upload/v99/outra-url.png', assetId: 'asset1' };
  assert.equal(A.findSameLesionImage(e.images, sameAsset), e.images[0], 'mesmo assetId = mesma imagem');
  assert.equal(A.findSameLesionImage(e.images, { data: 'https://x/y.png', publicId: 'atlas-radiologico/2' }), e.images[1], 'mesmo publicId = mesma imagem');
});

test('093b 26: migração 093 -> 093b (imagens dentro do item) sem duplicar assets, sem novo upload', () => {
  const e = lesion();
  const legacy = [
    { id: 'i1', data: e.images[0].data, publicId: 'atlas-radiologico/1', assetId: 'asset1', source: 'cloudinary', caption: 'alvo', credit: 'fonte A', order: 0 },
    { id: 'i2', data: 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/novo.png', publicId: 'atlas-radiologico/novo', assetId: 'assetN', thumb: 'https://t/novo.png', source: 'cloudinary', caption: 'só no sinal', credit: '', order: 1 },
    { id: 'i3', data: 'https://res.cloudinary.com/x/image/upload/v7/atlas-radiologico/novo.png', publicId: 'atlas-radiologico/novo', source: 'cloudinary', caption: 'repetida', order: 2 }
  ];
  const mig = A.migrateLegacyDidacticImages(legacy, e.images, [], 5000);
  assert.equal(mig.newImages.length, 1, 'só o asset que não estava na galeria; o repetido não duplica');
  assert.deepEqual(plain(mig.newImages[0]), { label: 'só no sinal', data: legacy[1].data, source: 'cloudinary', thumb: 'https://t/novo.png', publicId: 'atlas-radiologico/novo', assetId: 'assetN' });
  const refs = A.activeImageRefs(mig.refs);
  assert.deepEqual(plain(refs.map((r) => r.imageId)), ['asset:asset1', 'asset:assetN']);
  assert.equal(refs[0].captionOverride, 'alvo', 'legenda antiga do item vira override (a principal não muda)');
  assert.equal(refs[0].creditOverride, 'fonte A');
  assert.equal(e.images[0].label, 'legenda principal 1');
  // compatibilidade: sem migrar, as imagens antigas continuam aparecendo
  e.radiologicSigns[0].images = legacy.slice(1, 2);
  assert.match(A.radiologicSignsSectionHtml(e), /só no sinal/);
  assert.equal(A.auditDidacticImages([e]).legacyImages, 1, 'auditoria somente leitura encontra dado 093');
  // a migração só roda no Salvar do editor (ação do usuário), nunca no carregamento
  assert.match(editorFn, /if \(ctx && legacyImgs\.length\) \{\s*const mig = migrateLegacyDidacticImages\(legacyImgs, lesionImages\(\), finalRefs, Date\.now\(\)\);\s*mig\.newImages\.forEach\(im => ctx\.addImage\(im\)\);/);
  assert.match(editorFn, /if \(migrated\) out\.images = \[\];/);
  assert.equal((html.match(/migrateLegacyDidacticImages\(/g) || []).length, 2, 'definição + Salvar do editor');
});

test('093b 27-28: casos importados continuam válidos; importação do Radiopaedia intacta', () => {
  // importação adiciona caso sem tocar vínculos existentes
  const e = lesion();
  e.clinicalCases[0].imageRefs = A.linkImageRef([], idOf(e.images[0]), 1);
  const res = A.addClinicalCaseToLesion(e, { sourceUrl: 'https://radiopaedia.org/cases/novo-1', title: 'Novo', source: 'Radiopaedia' });
  assert.equal(res.ok, true);
  assert.deepEqual(plain(res.entry.clinicalCases[0].imageRefs), plain(e.clinicalCases[0].imageRefs));
  assert.equal('imageRefs' in res.entry.clinicalCases[1], false, 'caso importado nunca chega vinculado');
  // legado sem id vinculado: a cópia legada do outro PC não duplica o caso
  const legacy = { source: 'Radiopaedia', title: 'Antigo', sourceUrl: 'https://radiopaedia.org/cases/antigo-1', addedAt: '2026-09-01T00:00:00.000Z' };
  const upd = A.updateDidacticItemImageRefs([legacy], A.didacticPickKey(legacy), (r) => A.linkImageRef(r, 'asset:asset1', 10), 10);
  const merged = A.mergeClinicalCaseLists(upd.list, [legacy]);
  assert.equal(A.sortDidacticItems(merged).length, 1);
  assert.equal(merged[0].imageRefs[0].imageId, 'asset:asset1');
  // userscript não muda (nem vincula por URL)
  assert.match(userscript, /@version\s+1\.4\.2/);
  assert.doesNotMatch(userscript, /imageRefs|imageId|radiologicSigns|classificationSchemes/);
});
