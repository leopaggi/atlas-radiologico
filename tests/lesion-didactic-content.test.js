'use strict';

/* PROTEÇÃO 093 — conteúdo didático por lesão: casos clínicos manuais (na
 * MESMA lista dos importados), sinais radiológicos e classificações/
 * esquemas. Funções REAIS do index.html em `vm` (schema, operações de lista,
 * merge por item, renderização e integração com detalhe/Quiz/formulário).
 * O cenário multi-PC completo (write/read/pull reais) está em
 * multi-device-sync.test.js ("PROTEÇÃO 093").
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

function api() {
  const deps = ['escAttr', 'esc', 'canonicalJsonString', 'normalizeExternalTitle', 'clinicalCaseIdentityKey', 'unionClinicalCases', 'sameExternalUrl',
    'buildClinicalCaseFromDraft', 'lesionHasClinicalCaseUrl', 'addClinicalCaseToLesion', 'clinicalCaseRowHtml', 'clinicalCasesSectionHtml'].map((n) => extractFunction(html, n)).join('\n');
  const ctx = vm.createContext({ URL, Date, Math, JSON, console });
  vm.runInContext(deps + '\n' + MODULE + '\nthis.__a = { ' + ['sortDidacticItems', 'countDidacticItems', 'mergeDidacticItems', 'mergeClinicalCaseLists', 'ensureClinicalCaseIdentity',
    'normalizeRadiologicSign', 'normalizeClassificationScheme', 'normalizeManualClinicalCase', 'upsertDidacticItem', 'deleteDidacticItem', 'moveDidacticItem',
    'renderDidacticRichText', 'radiologicSignsSectionHtml', 'classificationSchemesSectionHtml', 'lesionDidacticQuizHtml', 'clinicalCasesSectionHtml',
    'addClinicalCaseToLesion', 'applyDidacticDraftsToNewEntry', 'didacticFormSectionHtml'].join(', ') + ' };', ctx);
  return ctx.__a;
}
const A = api();
const IMPORTED = { source: 'Radiopaedia', title: 'Acute appendicitis', sourceUrl: 'https://radiopaedia.org/cases/acute-appendicitis-170', addedAt: '2026-09-20T10:00:00.000Z', presentation: 'RLQ pain' };
const img = (n, over) => Object.assign({ data: 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/' + n + '.png', source: 'cloudinary', publicId: 'atlas-radiologico/' + n, assetId: 'A' + n, caption: 'legenda ' + n, credit: 'fonte ' + n }, over || {});
const addSign = (list, over, t) => {
  const r = A.normalizeRadiologicSign(Object.assign({ title: 'Sinal do ducto penetrante', strength: 'specific', description: 'Ducto pancreático atravessa a massa.' }, over || {}), t);
  assert.equal(r.ok, true, JSON.stringify(r));
  return A.upsertDidacticItem(list, r.item, t);
};

// ------------------------------------------------------------ CASOS CLÍNICOS
test('093 casos 1-5: caso manual na MESMA lista dos importados; editar; excluir; contador conta ambos', () => {
  const bad = plain(A.normalizeManualClinicalCase({ title: 'x' }));
  assert.deepEqual([bad.ok, bad.field], [false, 'presentation']);
  assert.equal(A.normalizeManualClinicalCase({ title: 'x', presentation: 'y', sourceUrl: 'javascript:alert(1)' }).ok, false, 'URL insegura recusada');
  const m = A.normalizeManualClinicalCase({ title: 'Caso do plantão', presentation: 'Dor em FID há 12 h', patientAge: '24 anos', patientSex: 'Feminino', modality: 'TC', notes: 'Apêndice 11 mm' });
  assert.equal(m.ok, true);
  assert.deepEqual(plain(m.item), { id: null, origin: 'manual', title: 'Caso do plantão', source: '', sourceUrl: '', presentation: 'Dor em FID há 12 h', patientAge: '24', patientSex: 'Feminino', modality: 'TC', notes: 'Apêndice 11 mm' });
  let cases = [IMPORTED];
  cases = A.upsertDidacticItem(cases, Object.assign({}, m.item, { id: 'case_m1' }), 1000);
  assert.equal(A.countDidacticItems(cases), 2, 'importado + manual');
  const sec = A.clinicalCasesSectionHtml({ clinicalCases: cases });
  assert.match(sec, /Casos clínicos exemplo \(2\)/);
  assert.match(sec, /Acute appendicitis/);
  assert.match(sec, /Caso do plantão/);
  assert.match(sec, /caso manual/);
  assert.match(sec, /Apêndice 11 mm/);
  // editar
  cases = A.upsertDidacticItem(cases, { id: 'case_m1', title: 'Caso do plantão (editado)' }, 2000);
  const edited = cases.find((c) => c.id === 'case_m1');
  assert.equal(edited.title, 'Caso do plantão (editado)');
  assert.equal(edited.presentation, 'Dor em FID há 12 h', 'demais campos preservados');
  assert.equal(edited.createdAt, 1000);
  assert.ok(edited.updatedAt >= 2000);
  // excluir (tombstone) — some da lista e do contador
  cases = A.deleteDidacticItem(cases, 'case_m1', 3000);
  assert.equal(A.countDidacticItems(cases), 1);
  assert.ok(cases.find((c) => c.id === 'case_m1').deletedAt >= 3000, 'tombstone mantido para o sync');
  assert.match(A.clinicalCasesSectionHtml({ clinicalCases: cases }), /Casos clínicos exemplo \(1\)/);
  assert.doesNotMatch(A.clinicalCasesSectionHtml({ clinicalCases: cases }), /plantão/);
});

test('093 casos: legado ganha identidade estável (legacyKey) só na 1ª gestão; reordenar mistura importado e manual', () => {
  const legacy = A.ensureClinicalCaseIdentity(IMPORTED, 500);
  assert.match(legacy.id, /^case_/);
  assert.equal(legacy.legacyKey, 'url:https://radiopaedia.org/cases/acute-appendicitis-170');
  assert.equal(legacy.origin, 'imported');
  assert.equal(A.ensureClinicalCaseIdentity(legacy), legacy, 'idempotente');
  let cases = [legacy];
  cases = A.upsertDidacticItem(cases, { id: 'case_m', origin: 'manual', title: 'Manual', presentation: 'p' }, 600);
  cases = A.moveDidacticItem(cases, 'case_m', -1, 700);
  assert.deepEqual(A.sortDidacticItems(cases).map((c) => c.title), ['Manual', 'Acute appendicitis']);
});

test('093 casos: reimportar a URL de um caso excluído REVIVE o mesmo id (o tombstone não vence depois)', () => {
  const managed = A.ensureClinicalCaseIdentity(IMPORTED, 500);
  const entry = { id: 'seed_1', clinicalCases: A.deleteDidacticItem([managed], managed.id, 900) };
  const r = A.addClinicalCaseToLesion(entry, { source: 'Radiopaedia', title: 'Acute appendicitis', sourceUrl: IMPORTED.sourceUrl });
  assert.equal(r.ok, true);
  const c = r.entry.clinicalCases.find((x) => x.id === managed.id);
  assert.equal(c.deletedAt, undefined);
  assert.ok(c.updatedAt > 900);
  const merged = plain(A.mergeClinicalCaseLists(r.entry.clinicalCases, entry.clinicalCases));
  assert.equal(merged.filter((x) => !x.deletedAt).length, 1, 'revivido vence o tombstone antigo do outro PC');
});

// ------------------------------------------------------------ SINAIS
test('093 sinais 6-10: sugestivo / específico / patognomônico, múltiplas imagens com legenda e fonte', () => {
  let signs = [];
  signs = addSign(signs, { title: 'Sinal do alvo', strength: 'suggestive' }, 1000);
  signs = addSign(signs, { title: 'Sinal do ducto penetrante', strength: 'specific', images: [img(1), img(2)] }, 1001);
  signs = addSign(signs, { title: 'Sinal do cometa', strength: 'pathognomonic', modality: 'TC', notes: 'obs', referenceUrl: 'https://radiopaedia.org/articles/x' }, 1002);
  assert.equal(A.normalizeRadiologicSign({ title: 'x', strength: 'provável' }).ok, false, 'só as 3 categorias');
  assert.equal(A.normalizeRadiologicSign({ strength: 'specific' }).ok, false, 'nome obrigatório');
  const list = A.sortDidacticItems(signs);
  assert.deepEqual(list.map((s) => s.strength), ['suggestive', 'specific', 'pathognomonic']);
  assert.equal(new Set(list.map((s) => s.id)).size, 3, 'ids estáveis e únicos');
  const two = list[1].images;
  assert.equal(two.length, 2);
  assert.deepEqual(plain(two.map((i) => [i.caption, i.credit, i.order, i.publicId])), [['legenda 1', 'fonte 1', 0, 'atlas-radiologico/1'], ['legenda 2', 'fonte 2', 1, 'atlas-radiologico/2']]);
  assert.ok(two.every((i) => i.id && i.createdAt && i.updatedAt), 'imagem com id e carimbos próprios (pronta p/ a 092)');
  assert.equal('lesionId' in two[0], false, 'fora do ownership de entry.images');
  const html1 = A.radiologicSignsSectionHtml({ radiologicSigns: signs });
  assert.match(html1, /Sinais radiológicos \(3\)/);
  for (const b of ['Sugestivo', 'Específico', 'Patognomônico']) assert.match(html1, new RegExp('>' + b + '<'));
  assert.match(html1, /legenda 1 <span class="didactic-credit">— fonte 1<\/span>/);
  assert.match(html1, /2 imagens/);
  assert.match(html1, /↗ Referência/);
  // imagem base64/javascript nunca entra
  const bad = A.normalizeRadiologicSign({ title: 't', strength: 'specific', images: [{ data: 'data:image/png;base64,AAA' }, { data: 'javascript:1' }] });
  assert.equal(bad.item.images.length, 0);
});

test('093 sinais 11-13: editar, excluir (tombstone) e reordenar', () => {
  let signs = addSign([], { title: 'A', strength: 'suggestive' }, 1);
  signs = addSign(signs, { title: 'B', strength: 'specific' }, 2);
  signs = addSign(signs, { title: 'C', strength: 'pathognomonic' }, 3);
  const [a, b, c] = A.sortDidacticItems(signs);
  signs = A.upsertDidacticItem(signs, Object.assign({}, A.normalizeRadiologicSign({ title: 'B editado', strength: 'pathognomonic' }).item, { id: b.id }), 10);
  assert.equal(A.sortDidacticItems(signs)[1].title, 'B editado');
  assert.equal(A.sortDidacticItems(signs)[1].id, b.id, 'mesmo id');
  signs = A.moveDidacticItem(signs, c.id, -1, 20);
  signs = A.moveDidacticItem(signs, c.id, -1, 21);
  assert.deepEqual(A.sortDidacticItems(signs).map((s) => s.id), [c.id, a.id, b.id]);
  assert.deepEqual(A.sortDidacticItems(A.moveDidacticItem(signs, c.id, -1, 22)).map((s) => s.id), [c.id, a.id, b.id], 'o primeiro não sobe mais');
  signs = A.deleteDidacticItem(signs, a.id, 30);
  assert.deepEqual(A.sortDidacticItems(signs).map((s) => s.id), [c.id, b.id]);
  assert.equal(signs.length, 3, 'tombstone fica no array (não ressuscita no merge)');
});

// ------------------------------------------------------------ CLASSIFICAÇÕES
test('093 classificações 14-20: item com conteúdo rico, várias imagens, referências, editar, excluir, reordenar', () => {
  const content = '## Categorias\n- PI-RADS 1: muito baixa\n- PI-RADS 5: **muito alta**\n\nConduta: biópsia <script>x</script>';
  const r = A.normalizeClassificationScheme({ title: 'PI-RADS v2.1', content, links: [{ label: 'ACR', url: 'https://www.acr.org/pi-rads' }, { label: 'x', url: 'ftp://nope' }], images: [img(7), img(8), img(9)] });
  assert.equal(r.ok, true);
  assert.equal(r.item.links.length, 1, 'só http(s)');
  let schemes = A.upsertDidacticItem([], r.item, 100);
  schemes = A.upsertDidacticItem(schemes, A.normalizeClassificationScheme({ title: 'Bosniak 2019', content: 'I a IV' }).item, 101);
  const h = A.classificationSchemesSectionHtml({ classificationSchemes: schemes });
  assert.match(h, /Classificações e esquemas \(2\)/);
  assert.match(h, /<div class="didactic-subtitle">Categorias<\/div>/);
  assert.match(h, /<li>PI-RADS 5: <b>muito alta<\/b><\/li>/);
  assert.doesNotMatch(h, /<script>/, 'conteúdo escapado');
  assert.match(h, /&lt;script&gt;/);
  assert.equal((h.match(/class="didactic-img"/g) || []).length, 3);
  assert.match(h, /↗ ACR/);
  const [pi, bos] = A.sortDidacticItems(schemes);
  schemes = A.upsertDidacticItem(schemes, Object.assign({}, A.normalizeClassificationScheme({ title: 'PI-RADS v2.1', content: 'novo' }).item, { id: pi.id }), 200);
  assert.equal(A.sortDidacticItems(schemes)[0].content, 'novo');
  schemes = A.moveDidacticItem(schemes, bos.id, -1, 210);
  assert.deepEqual(A.sortDidacticItems(schemes).map((x) => x.title), ['Bosniak 2019', 'PI-RADS v2.1']);
  schemes = A.deleteDidacticItem(schemes, bos.id, 220);
  assert.deepEqual(A.sortDidacticItems(schemes).map((x) => x.title), ['PI-RADS v2.1']);
  assert.equal(A.classificationSchemesSectionHtml({ classificationSchemes: A.deleteDidacticItem(schemes, pi.id, 230) }), '', 'sem itens: bloco some na leitura');
});

// ------------------------------------------------------------ QUIZ
test('093 Quiz 21-25: sinais e classificações NÃO são renderizados antes da resposta; aparecem depois (com imagens)', () => {
  const quiz = extractFunction(html, 'renderQuizCardIntegrated');
  const detailFn = /function renderDetail\(\)\{[\s\S]*?\n  \}/.exec(quiz)[0];
  assert.match(detailFn, /lesionDidacticQuizHtml\(e\)/, 'conteúdo didático só dentro do detalhe pós-resposta');
  assert.equal((quiz.match(/lesionDidacticQuizHtml\(/g) || []).length, 1, 'nenhum outro ponto do Quiz renderiza');
  assert.equal((quiz.match(/radiologicSigns|classificationSchemes|radiologicSignsSectionHtml|classificationSchemesSectionHtml/g) || []).length, 0);
  // renderDetail só é chamado no feedback (st.answered) e ao reabrir após editar (também pós-resposta)
  const calls = [...quiz.matchAll(/renderDetail\(\)/g)].map((m) => m.index).filter((i) => quiz.slice(i - 9, i) !== 'function ');
  const feedbackFn = quiz.indexOf('function renderAnsweredFeedback(){');
  assert.ok(calls.length === 2 && calls.every((i) => i > feedbackFn), 'renderDetail só dentro de renderAnsweredFeedback');
  assert.match(quiz, /if\(st\.answered\)\{[\s\S]{0,400}renderAnsweredFeedback\(\);/);
  // conteúdo gerado pós-resposta
  const lesion = { radiologicSigns: addSign([], { title: 'Sinal do cometa', strength: 'pathognomonic', images: [img(3)] }, 1),
    classificationSchemes: A.upsertDidacticItem([], A.normalizeClassificationScheme({ title: 'Bosniak', images: [img(4)] }).item, 2) };
  const after = A.lesionDidacticQuizHtml(lesion);
  assert.match(after, /Patognomônico/);
  assert.match(after, /Sinais radiológicos \(1\)/);
  assert.match(after, /Classificações e esquemas \(1\)/);
  assert.equal((after.match(/<img /g) || []).length, 2);
  // o que o Quiz monta ANTES da resposta (mídia + enunciado) não usa nada disso
  for (const fn of ['quizImageClinicalContextHtml', 'quizImageDescHtml']) assert.doesNotMatch(extractFunction(html, fn), /radiologicSigns|classificationSchemes|Patognom/);
});

// ------------------------------------------------------------ SYNC
test('093 sync 26-29: serialização, merge por id (edição/criação/exclusão/ordem), convergência nos dois sentidos', () => {
  const base = addSign([], { title: 'Base', strength: 'suggestive' }, 100);
  const baseId = base[0].id;
  const roundtrip = JSON.parse(JSON.stringify({ radiologicSigns: base }));
  assert.deepEqual(roundtrip.radiologicSigns, plain(base), 'serialize/deserialize');
  // PC A edita o item base e cria outro; PC B exclui... outro item e cria o seu
  let pcA = A.upsertDidacticItem(base, { id: baseId, title: 'Base editada' }, 200);
  pcA = addSign(pcA, { title: 'Novo de A', strength: 'specific' }, 210);
  let pcB = addSign(base, { title: 'Novo de B', strength: 'pathognomonic' }, 220);
  const ab = plain(A.mergeDidacticItems(pcA, pcB));
  const ba = plain(A.mergeDidacticItems(pcB, pcA));
  const key = (l) => A.sortDidacticItems(l).map((s) => s.id + ':' + s.title).sort();
  assert.deepEqual(key(ab), key(ba), 'converge em qualquer ordem');
  assert.deepEqual(A.sortDidacticItems(ab).map((s) => s.title).sort(), ['Base editada', 'Novo de A', 'Novo de B']);
  // exclusão não ressuscita
  const aDel = A.deleteDidacticItem(ab, baseId, 300);
  const merged = plain(A.mergeDidacticItems(pcB, aDel));
  assert.equal(A.sortDidacticItems(merged).some((s) => s.id === baseId), false, 'excluído não volta pelo PC antigo');
  // ordem persiste
  const moved = A.moveDidacticItem(merged, A.sortDidacticItems(merged)[1].id, -1, 400);
  const again = plain(A.mergeDidacticItems(merged, moved));
  assert.deepEqual(A.sortDidacticItems(again).map((s) => s.id), A.sortDidacticItems(moved).map((s) => s.id));
  // identidade por id (títulos iguais não fundem itens diferentes)
  const twin = addSign(addSign([], { title: 'Igual', strength: 'specific' }, 1), { title: 'Igual', strength: 'specific' }, 2);
  assert.equal(A.sortDidacticItems(A.mergeDidacticItems(twin, [])).length, 2);
});

test('093 sync: casos legados sem id continuam com a união de sempre; gerenciado (id) vence a cópia legada do outro PC, inclusive exclusão', () => {
  const other = { source: 'Radiopaedia', title: 'Outro', sourceUrl: 'https://radiopaedia.org/cases/outro-1' };
  assert.deepEqual(plain(A.mergeClinicalCaseLists([IMPORTED], [other])).map((c) => c.title), ['Acute appendicitis', 'Outro'], 'legado: união aditiva');
  const managed = A.ensureClinicalCaseIdentity(IMPORTED, 10);
  const del = A.deleteDidacticItem([managed], managed.id, 20);
  const m = plain(A.mergeClinicalCaseLists(del, [IMPORTED, other]));
  assert.deepEqual(A.sortDidacticItems(m).map((c) => c.title), ['Outro'], 'excluído num PC não volta pela cópia legada do outro');
  // editado (inclusive mudando a URL): a cópia legada antiga não duplica (legacyKey)
  const edited = A.upsertDidacticItem([managed], { id: managed.id, title: 'Apendicite (editado)', sourceUrl: 'https://example.org/novo' }, 30);
  const m2 = plain(A.mergeClinicalCaseLists([IMPORTED], edited));
  assert.deepEqual(A.sortDidacticItems(m2).map((c) => c.title), ['Apendicite (editado)']);
});

// ------------------------------------------------------------ MIGRAÇÃO / REGRESSÃO
test('093 migração 30-33: dados antigos sem os campos = []; casos existentes aparecem sem migração; importação e userscript intactos', () => {
  assert.equal(A.radiologicSignsSectionHtml({}), '');
  assert.equal(A.classificationSchemesSectionHtml({ radiologicSigns: null }), '');
  assert.equal(A.lesionDidacticQuizHtml({}), '');
  assert.equal(A.countDidacticItems(undefined), 0);
  assert.match(A.clinicalCasesSectionHtml({ clinicalCases: [IMPORTED] }), /Casos clínicos exemplo \(1\)/, 'caso antigo sem id aparece igual');
  // importação Radiopaedia: mesmo builder, nenhum campo novo inventado
  const r = A.addClinicalCaseToLesion({ id: 'seed_1', clinicalCases: [] }, { source: 'Radiopaedia', title: 'T', sourceUrl: 'https://radiopaedia.org/cases/t-1' });
  assert.deepEqual(Object.keys(r.case).sort(), ['addedAt', 'source', 'sourceUrl', 'title']);
  // lesão nova: só o que o usuário adicionou; nada inventado
  assert.deepEqual(plain(A.applyDidacticDraftsToNewEntry({ id: 'u1' }, [], [], [])), { id: 'u1' });
  // userscript intacto (botão e @match)
  assert.match(userscript, /btn\.textContent = '📥 Enviar ao Atlas';/);
  assert.match(userscript, /@match\s+https:\/\/www\.radiopaedia\.org\/cases\/\*/);
  assert.doesNotMatch(userscript, /radiologicSigns|classificationSchemes/);
});

test('093 integração: detalhe na ordem exata; formulário com as 3 áreas; save grava; merge/fusão levam os campos', () => {
  const detail = extractFunction(html, 'openDetail');
  const iCases = detail.indexOf('${clinicalCasesSectionHtml(e)}');
  const iSigns = detail.indexOf('${radiologicSignsSectionHtml(e)}');
  const iSchemes = detail.indexOf('${classificationSchemesSectionHtml(e)}');
  const iNotes = detail.indexOf('detail-notes');
  assert.ok(iNotes > 0 && iNotes < iCases && iCases < iSigns && iSigns < iSchemes, 'conteúdo principal -> casos -> sinais -> classificações');
  assert.match(detail, /wireDidacticImages\(ov\);/);
  const form = A.didacticFormSectionHtml();
  for (const t of ['Casos clínicos exemplo', 'Sinais radiológicos', 'Classificações e esquemas', '+ Adicionar caso clínico manual', '+ Adicionar sinal radiológico', '+ Adicionar classificação/esquema']) assert.ok(form.includes(t), t);
  const of = extractFunction(html, 'openForm');
  assert.match(of, /\$\{didacticFormSectionHtml\(\)\}/);
  assert.match(of, /if\(radiologicSignsDraft\.length\) existing\.radiologicSigns = JSON\.parse\(JSON\.stringify\(radiologicSignsDraft\)\); else delete existing\.radiologicSigns;/);
  assert.match(of, /if\(classificationSchemesDraft\.length\) existing\.classificationSchemes = JSON\.parse\(JSON\.stringify\(classificationSchemesDraft\)\); else delete existing\.classificationSchemes;/);
  assert.match(of, /applyDidacticDraftsToNewEntry\(newEntry, clinicalCasesDraft, radiologicSignsDraft, classificationSchemesDraft\)/);
  const merge = extractFunction(html, 'mergeEntryNonDestructive');
  assert.match(merge, /for\(const f of \['radiologicSigns', 'classificationSchemes'\]\)\{\s*const m = mergeDidacticItems\(local\[f\], remote\[f\]\);/);
  assert.match(extractFunction(html, 'foldLesionMergesIntoState'), /k\[f\] = mergeDidacticItems\(k\[f\], d\[f\]\)/, 'fusão clínica (091c) preserva o conteúdo didático');
  // upload: o MESMO backend do Atlas; imagens didáticas nunca em entry.images
  const editor = extractFunction(html, 'openDidacticItemEditor');
  assert.match(editor, /await uploadToCloudinary\(f, /);
  assert.doesNotMatch(editor, /entry\.images|\.images\.push\(|lesionId/);
});
