'use strict';

// PROTEÇÃO 091c — fusão clínica CONTROLADA dos 4 grupos de duplicatas
// aprovados pelo usuário. Usa as funções REAIS do index.html (mapa
// LESION_MERGES, fold, plano, conteúdo final, auditoria e o fluxo manual
// runApprovedClinicalMerges091c) sobre os registros REAIS do SEED com ids
// posicionais (mesmo SEED.forEach((e,i)=> e.id='seed_'+i) do boot).
// Nenhum dado real do usuário é alterado aqui: é simulação em memória.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(source);
  assert.ok(m, 'função ' + name + ' não encontrada no index.html');
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(m.index, i + 1);
}
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho não encontrado: ' + start);
  return html.slice(a, b);
}

const seedLine = html.split('\n').find((l) => l.startsWith('const SEED = '));
const SEED_RAW = JSON.parse(seedLine.slice('const SEED = '.length).replace(/;\s*$/, ''));
const plain = (v) => JSON.parse(JSON.stringify(v));
function seedRuntime() {
  const s = plain(SEED_RAW);
  s.forEach((e, i) => { e.id = 'seed_' + i; }); // ids POSICIONAIS, como no boot
  return s;
}

const deps = ['normalizeExternalTitle', 'exactLesionIdentityKey', 'clinicalCaseIdentityKey', 'imageIdentityKeys', 'radiopaediaSearchUrl',
  'reviewPromotionReached', 'reviewDemotionTriggered', 'replayAutoReview', 'normalizeReviewAttempts', 'foldReviewProgress',
  'normalizeReviewProgressEntry', 'normalizeReviewProgress', 'normalizeReviewOverrides', 'mergeReviewProgress',
  'mergeReviewOverrides', 'materializeReviewState'].map((n) => extractFunction(html, n)).join('\n');
const quarantine091c = sliceBetween('// PROTEÇÃO 091c — id fundido pelo mapa LESION_MERGES', '/* ============================================================\n   PROTEÇÃO 091c — FUSÃO CLÍNICA');
const module091c = sliceBetween("const LESION_MERGES_KEY = 'atlas:lesionMerges';", '/* ============================================================\n   SNAPSHOTS LOCAIS LEVES');

function makeApp(data, opts) {
  const o = opts || {};
  const backing = {};
  const calls = { snapshots: [], saves: [], confirmed: 0, pendingMarks: [] };
  const ctx = vm.createContext({
    console, JSON, Math, Object, Array, String, Number, Set, Map, Promise,
    Date: o.Date || Date,
    SEED: seedRuntime(),
    DATA: data, REVIEW: o.review || {}, REVIEW_STAMPS: o.stamps || {}, REVIEW_PROGRESS: o.progress || {},
    REVIEW_OVERRIDE: o.override || {}, SRS: o.srs || {}, LESION_REVISIONS: o.revisions || {},
    canonicalRestoreInProgress: false, deviceBootstrapPending: false, appStateReady: true, fbSyncing: false,
    storage: {
      async get(k) { if (!(k in backing)) throw new Error('not found'); return { value: backing[k] }; },
      async set(k, v) { backing[k] = v; }, async delete(k) { delete backing[k]; }
    },
    createSafetySnapshot: (reason) => { calls.snapshots.push(reason); return o.snapshotFails ? null : { id: 'snap' }; },
    saveReview: async () => { calls.saves.push('review'); }, saveSRS: async () => { calls.saves.push('srs'); },
    saveLesionRevisions: async () => { calls.saves.push('revisions'); }, saveData: async () => { calls.saves.push('data'); },
    savePendingLocalImageAdds: async () => { calls.saves.push('pendingAdds'); },
    markPendingLocalImageAdds: (id, prev, next) => { calls.pendingMarks.push({ id, prev: prev.length, next: next.length }); },
    renderAll: () => {}
  });
  vm.runInContext(
    'const SUPPRESSED_DUPLICATE_IDS_V172 = new Set(); const QUARANTINED_HIGH_IDS_20260924 = new Set(); let PENDING_LOCAL_IMAGE_ADDS = {};\n' +
    'const REVIEW_ATTEMPTS_MAX = 8;\n' + deps + '\n' + quarantine091c + '\n' + module091c + '\n' +
    'function __getMerges(){ return LESION_MERGES; } function __setMerges(v){ LESION_MERGES = v; }',
    ctx, { filename: 'merge091c.js' });
  if (o.merges) ctx.__setMerges(o.merges);
  if (o.backupAt !== null) backing['atlas:lastBackupExportAt'] = String(o.backupAt || Date.now());
  return { ctx, calls, backing };
}
const confirmAll = () => true;
const byName = (data, name) => data.filter((e) => e && e.name === name);
const ids = (data) => data.map((e) => e.id);
const GROUP_NAMES = {
  hep: ['Metástase hepática', 'Metástases hepáticas', 'Metástases hepáticas hipervasculares'],
  vert: ['Metástase óssea vertebral', 'Metástases ósseas vertebrais'],
  linf: ['Linfoma mediastinal', 'Linfoma do mediastino'],
  mand: ['Osteomielite mandibular', 'Osteomielite da mandíbula']
};
const ALL_MEMBER_NAMES = Object.values(GROUP_NAMES).flat();
function idOf(data, name) { const f = byName(data, name); assert.equal(f.length, 1, name); return f[0].id; }
function cimg(id, over) {
  return Object.assign({
    data: 'https://res.cloudinary.com/soegtip6/image/upload/v1/atlas-radiologico/' + id + '.jpg',
    publicId: 'atlas-radiologico/' + id, assetId: 'A_' + id, source: 'cloudinary', label: 'TC fase arterial', sourcePage: 'https://radiopaedia.org/cases/x-' + id,
    panels: [{ url: 'https://res.cloudinary.com/p/' + id + '.png', seq: 'TC' }],
    clinicalContext: { presentation: 'Paciente oncológico em estadiamento', patientAge: '61', patientSex: 'Feminino' }
  }, over || {});
}

// Cenário base: dados = SEED real; a lesão hipervascular tem 1 imagem (regra 1),
// progresso de estudo espalhado pelos membros.
async function runScenario(mut) {
  const data = seedRuntime();
  const hyper = byName(data, 'Metástases hepáticas hipervasculares')[0];
  const single = byName(data, 'Metástase hepática')[0];
  const plural = byName(data, 'Metástases hepáticas')[0];
  const mandPt = byName(data, 'Osteomielite da mandíbula')[0];
  hyper.images = [cimg('h1', { lesionId: hyper.id, lesionName: hyper.name })];
  const opts = {
    review: { [single.id]: 2, [plural.id]: 1 },
    stamps: { [single.id]: 2000, [plural.id]: 1000 },
    progress: { [single.id]: { b: 0, f: 0, a: [[100, 1, 1], [200, 1, 1]] }, [hyper.id]: { b: 0, f: 0, a: [[300, 1, 1]] } },
    override: { [single.id]: { m: 1, s: 2, at: 2000 } },
    srs: { [single.id]: { ef: 2.3, updatedAt: 50 }, [plural.id]: { ef: 2.6, updatedAt: 10 }, [mandPt.id]: { ef: 2.5, updatedAt: 7 } },
    revisions: {
      R1: { id: 'R1', lesionId: single.id, status: 'pending', createdAt: 1, updatedAt: 1, history: [] },
      G1: { id: 'G1', scope: 'global', lesionId: null, status: 'pending', createdAt: 1, updatedAt: 1, history: [] }
    }
  };
  if (mut) mut(data, opts);
  const before = plain(data);
  const app = makeApp(data, opts);
  const res = await app.ctx.runApprovedClinicalMerges091c({ confirmFn: () => { app.calls.confirmed++; return true; } });
  return { app, res, before, data: app.ctx.DATA, idsBefore: { single: single.id, plural: plural.id, hyper: hyper.id, mandPt: mandPt.id } };
}

test('091c PLANO: membros resolvidos pela IDENTIDADE nos dados (ids posicionais ≠ ids da auditoria)', () => {
  const data = seedRuntime();
  const app = makeApp(data);
  const plan = plain(app.ctx.planApprovedClinicalMerges091c(app.ctx.lesionMergeGlobalState(), app.ctx.APPROVED_CLINICAL_MERGES_091C, {}));
  assert.equal(plan.length, 4);
  assert.deepEqual(plan.map((g) => g.status), ['ready', 'ready', 'ready', 'ready']);
  assert.equal(idOf(data, 'Metástase hepática') === 'seed_155', false, 'id da auditoria NÃO é o id de execução');
  assert.ok(plan.every((g) => g.notesAllSeed), 'notas ainda são as do SEED nos 4 grupos');
  // Nenhum com imagem no SEED -> regra 3 com desempate pelo registro aprovado
  const keeperNames = plan.map((g) => data.find((e) => e.id === g.keeperId).name);
  assert.deepEqual(keeperNames, ['Metástases hepáticas', 'Metástases ósseas vertebrais', 'Linfoma do mediastino', 'Osteomielite da mandíbula']);
  assert.ok(plan.every((g) => /regra 3/.test(g.keeperReason)));
});

test('091c REGRA 1: se só um membro tem imagem, ele permanece (mesmo não sendo o preferido)', () => {
  const data = seedRuntime();
  const hyper = byName(data, 'Metástases hepáticas hipervasculares')[0];
  hyper.images = [cimg('h1')];
  const app = makeApp(data);
  const g = plain(app.ctx.planApprovedClinicalMerges091c(app.ctx.lesionMergeGlobalState(), app.ctx.APPROVED_CLINICAL_MERGES_091C, {}))[0];
  assert.equal(g.status, 'ready');
  assert.equal(g.keeperId, hyper.id);
  assert.match(g.keeperReason, /regra 1/);
});

test('091c REGRA 2: mais de um com imagem -> grupo PAUSADO com ids, imagens, source, label, clinicalContext e ownership; os outros seguem', async () => {
  const data = seedRuntime();
  const a = byName(data, 'Linfoma mediastinal')[0], b = byName(data, 'Linfoma do mediastino')[0];
  a.images = [cimg('la', { lesionId: a.id, lesionName: a.name })];
  b.images = [cimg('lb', { lesionId: b.id, lesionName: b.name })];
  const app = makeApp(data);
  const plan = plain(app.ctx.planApprovedClinicalMerges091c(app.ctx.lesionMergeGlobalState(), app.ctx.APPROVED_CLINICAL_MERGES_091C, {}));
  const g = plan.find((x) => x.group === 'linfoma-mediastinal');
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, 'mais_de_um_com_imagem');
  assert.deepEqual(g.imageOwners.map((x) => x.id), [a.id, b.id]);
  const im = g.imageOwners[0].images[0];
  assert.deepEqual([im.label, im.source, im.lesionId, im.clinicalContext, im.panels], ['TC fase arterial', 'cloudinary', a.id, true, 1]);
  assert.ok(im.sourcePage);
  const res = await app.ctx.runApprovedClinicalMerges091c({ confirmFn: confirmAll });
  assert.deepEqual(plain(res.executed).map((x) => x.group), ['metastases-hepaticas', 'metastases-osseas-vertebrais', 'osteomielite-mandibular']);
  assert.equal(byName(app.ctx.DATA, 'Linfoma mediastinal').length, 1, 'grupo pausado intacto');
  assert.equal(byName(app.ctx.DATA, 'Linfoma do mediastino').length, 1);
  assert.equal(res.countBefore - res.countAfter, 4);
});

test('091c GRUPO 1: 155+590+722 viram UM registro "Metástases hepáticas"; 722 deixa de existir; conteúdo hipervascular incorporado; LIRADS removido', async () => {
  const { res, data, idsBefore } = await runScenario();
  assert.equal(res.ok, true, JSON.stringify(res.executed));
  const hep = data.filter((e) => e.s === 'Abdômen Superior' && e.site === 'Fígado' && /Metást/.test(e.name));
  assert.deepEqual(hep.map((e) => e.name), ['Metástases hepáticas'], 'um único registro com o nome final');
  const k = hep[0];
  assert.equal(k.id, idsBefore.hyper, 'keeper = único com imagem (regra 1)');
  assert.equal(byName(data, 'Metástases hepáticas hipervasculares').length, 0, 'hipervascular não é mais lesão separada');
  assert.equal(byName(data, 'Metástase hepática').length, 0);
  assert.equal(data.some((e) => e.id === idsBefore.single || e.id === idsBefore.plural), false);
  assert.match(k.notes, /Padrão hipervascular: realce predominante na fase arterial/);
  assert.match(k.notes, /tumores neuroendócrinos, melanoma, carcinoma renal/);
  assert.doesNotMatch(k.notes, /Diferenciais-chave: Metástase hepática/, 'sem diferencial autorreferente');
  assert.doesNotMatch(k.notes, /Metástases hepáticas hipervasculares/);
  assert.notEqual(k.classification, 'LIRADS', 'LIRADS removido do registro final');
  assert.equal(k.enTerm, 'liver metastases');
});

test('091c GRUPO 1: tags unidas, links deduplicados, imagem/ownership/clinicalContext/panels/source preservados', async () => {
  const { data, before, idsBefore } = await runScenario();
  const k = data.find((e) => e.id === idsBefore.hyper);
  const tagsBefore = new Set(before.filter((e) => GROUP_NAMES.hep.includes(e.name)).flatMap((e) => e.tags || []));
  assert.deepEqual(new Set(k.tags), tagsBefore, 'união de tags, nenhuma perdida');
  assert.equal(new Set(k.tags).size, k.tags.length, 'sem tag repetida');
  const urls = k.links.map((l) => l.url);
  assert.equal(new Set(urls).size, urls.length, 'links deduplicados');
  assert.ok(urls.includes('https://radiopaedia.org/search?lang=us&q=liver%20metastases'));
  assert.equal(k.images.length, 1);
  const im = k.images[0];
  assert.deepEqual([im.assetId, im.lesionId, im.lesionName, im.label, im.source, im.panels.length], ['A_h1', k.id, 'Metástases hepáticas', 'TC fase arterial', 'cloudinary', 1]);
  assert.deepEqual(im.clinicalContext, { presentation: 'Paciente oncológico em estadiamento', patientAge: '61', patientSex: 'Feminino' });
  assert.ok(im.sourcePage);
});

test('091c GRUPO 1: REVIEW / REVIEW_PROGRESS / REVIEW_OVERRIDE / REVIEW_STAMPS / SRS preservados no keeper; LESION_REVISIONS redirecionada com histórico', async () => {
  const { app, idsBefore } = await runScenario();
  const c = app.ctx, K = idsBefore.hyper, S = idsBefore.single, P = idsBefore.plural;
  assert.equal(c.REVIEW[K], 2, 'estado manual Dominado do membro fundido chega ao keeper');
  assert.deepEqual(plain(c.REVIEW_OVERRIDE[K]), { m: 1, s: 2, at: 2000 }, 'override manual preservado');
  assert.equal(c.REVIEW_STAMPS[K], 2000, 'carimbo mais recente');
  assert.deepEqual(plain(c.REVIEW_PROGRESS[K].a).map((x) => x[0]).sort((a, b) => a - b), [100, 200, 300], 'histórico do Quiz unido');
  assert.equal(c.SRS[K].ef, 2.3, 'SRS mais recente (updatedAt) vence');
  for (const id of [S, P]) {
    for (const m of [c.REVIEW, c.REVIEW_STAMPS, c.REVIEW_PROGRESS, c.REVIEW_OVERRIDE, c.SRS]) assert.equal(Object.prototype.hasOwnProperty.call(m, id), false);
  }
  assert.equal(c.LESION_REVISIONS.R1.lesionId, K);
  assert.equal(c.LESION_REVISIONS.R1.history.at(-1).action, 'lesion_merged');
  assert.equal(c.LESION_REVISIONS.G1.lesionId, null, 'pendência geral intocada');
});

test('091c GRUPOS 2, 3 e 4: pares fundidos com nome final, enTerm e link corretos', async () => {
  const { data } = await runScenario();
  const vert = data.filter((e) => e.site === 'Corpo vertebral' && /Metást/.test(e.name));
  assert.deepEqual(vert.map((e) => e.name), ['Metástases ósseas vertebrais']);
  assert.match(vert[0].notes, /Avaliar extensão epidural e fratura patológica/);
  assert.doesNotMatch(vert[0].notes, /Diferenciais-chave: Metástase óssea vertebral/);
  const linf = data.filter((e) => e.site === 'Massa mediastinal' && /Linfoma/.test(e.name));
  assert.deepEqual(linf.map((e) => e.name), ['Linfoma mediastinal']);
  assert.match(linf[0].notes, /engloba estruturas vasculares sem obstruí-las/);
  const mand = data.filter((e) => e.site === 'Mandíbula e maxila' && /Osteomielite/.test(e.name));
  assert.deepEqual(mand.map((e) => e.name), ['Osteomielite mandibular']);
  assert.equal(mand[0].enTerm, 'mandibular osteomyelitis', 'keeper 1158 recebe enTerm em inglês');
  const urls = mand[0].links.map((l) => l.url);
  assert.ok(urls.includes('https://radiopaedia.org/search?lang=us&q=mandibular%20osteomyelitis'));
  assert.equal(urls.some((u) => /Osteomielite/.test(decodeURIComponent(u))), false, 'link em português removido');
  assert.equal(new Set(urls).size, urls.length);
});

test('091c CONTAGEM: exatamente −5 registros; nada fora dos 9 membros muda; auditoria pós-fusão com ZERO órfãos', async () => {
  const { res, data, before, app } = await runScenario();
  assert.equal(res.countBefore - res.countAfter, 5);
  assert.equal(before.length - data.length, 5);
  const others = (arr) => arr.filter((e) => !ALL_MEMBER_NAMES.includes(e.name) && !['Metástases hepáticas', 'Metástases ósseas vertebrais', 'Linfoma mediastinal', 'Osteomielite mandibular'].includes(e.name));
  assert.deepEqual(plain(others(data)), plain(others(before)), 'nenhuma outra lesão alterada');
  assert.equal(res.audit.total, 0, JSON.stringify(res.audit));
  assert.ok(res.executed.every((x) => x.lostImages === 0 && x.audit.total === 0));
  assert.equal(Object.keys(app.ctx.__getMerges()).length, 5);
});

test('091c SEGURANÇA: snapshot com o motivo aprovado, backup recente obrigatório, confirmação e persistência (saves reais chamados)', async () => {
  const { app } = await runScenario();
  assert.deepEqual(app.calls.snapshots, ['antes da fusão clínica controlada de duplicatas aprovadas']);
  assert.equal(app.calls.confirmed, 1);
  for (const s of ['review', 'srs', 'revisions', 'pendingAdds', 'data']) assert.ok(app.calls.saves.includes(s), s);
  assert.ok(app.backing['atlas:lesionMerges'], 'mapa persistido no IndexedDB');
  assert.match(sliceBetween('const SAFETY_SNAPSHOT_RISK_REASONS = [', '];'), /'antes da fusão clínica controlada de duplicatas aprovadas'/);
  // sem backup recente: nada acontece
  const d2 = seedRuntime();
  const noBackup = makeApp(d2, { backupAt: null });
  assert.equal((await noBackup.ctx.runApprovedClinicalMerges091c({ confirmFn: confirmAll })).reason, 'backup_required');
  const old = makeApp(seedRuntime(), { backupAt: Date.now() - 3 * 60 * 60 * 1000 });
  assert.equal((await old.ctx.runApprovedClinicalMerges091c({ confirmFn: confirmAll })).reason, 'backup_required');
  // snapshot falhou: aborta sem tocar
  const snapFail = makeApp(seedRuntime(), { snapshotFails: true });
  const r = await snapFail.ctx.runApprovedClinicalMerges091c({ confirmFn: confirmAll });
  assert.equal(r.reason, 'snapshot_failed');
  assert.equal(snapFail.ctx.DATA.length, 1213);
  assert.deepEqual(plain(snapFail.ctx.__getMerges()), {});
  // cancelado: aborta sem snapshot
  const cancel = makeApp(seedRuntime());
  assert.equal((await cancel.ctx.runApprovedClinicalMerges091c({ confirmFn: () => false })).reason, 'cancelled');
  assert.deepEqual(cancel.calls.snapshots, []);
});

test('091c IDEMPOTENTE: rodar duas vezes não altera nada na segunda (grupos já fundidos, sem snapshot novo)', async () => {
  const { app } = await runScenario();
  const snap1 = plain({ d: app.ctx.DATA, r: app.ctx.REVIEW, s: app.ctx.SRS, m: app.ctx.__getMerges() });
  const again = await app.ctx.runApprovedClinicalMerges091c({ confirmFn: confirmAll });
  assert.deepEqual(plain(again.executed), []);
  assert.deepEqual(plain(again.plan).map((g) => g.status), ['already_merged', 'already_merged', 'already_merged', 'already_merged']);
  assert.deepEqual(plain({ d: app.ctx.DATA, r: app.ctx.REVIEW, s: app.ctx.SRS, m: app.ctx.__getMerges() }), snap1);
  assert.equal(app.calls.snapshots.length, 1);
  assert.equal(app.ctx.foldLesionMergesIntoGlobals().changed, false, 'fold repetido = no-op');
});

test('091c SEM RESSURREIÇÃO: id fundido sai do catálogo ativo (SEED) e da quarentena; PC ANTIGO converge só pelo mapa (sem texto novo)', async () => {
  const { app, idsBefore } = await runScenario();
  const merges = plain(app.ctx.__getMerges());
  assert.equal(app.ctx.isQuarantinedSeedId(idsBefore.single), true);
  assert.equal(app.ctx.isQuarantinedSeedId(idsBefore.hyper), false, 'keeper segue ativo');
  const active = app.ctx.getActiveCanonicalSeed().map((e) => e.id);
  for (const id of Object.keys(merges)) assert.equal(active.includes(id), false, id + ' não volta pelo SEED');
  // PC antigo: dados pré-fusão + progresso local; recebe só o mapa
  const oldData = seedRuntime();
  const old = makeApp(oldData, { review: { [idsBefore.plural]: 1 }, srs: { [idsBefore.plural]: { ef: 2, updatedAt: 1 } }, merges });
  const f = old.ctx.foldLesionMergesIntoGlobals();
  assert.equal(f.changed, true);
  assert.equal(old.ctx.DATA.length, 1208);
  for (const id of Object.keys(merges)) assert.equal(old.ctx.DATA.some((e) => e.id === id), false);
  assert.equal(old.ctx.REVIEW[idsBefore.hyper], 1);
  assert.ok(old.ctx.SRS[idsBefore.hyper]);
  assert.equal(old.ctx.foldLesionMergesIntoGlobals().changed, false, 'segunda convergência = no-op');
  assert.equal(old.ctx.auditLesionMergeOrphans(old.ctx.lesionMergeGlobalState(), merges).total, 0);
});

test('091c OWNERSHIP: só o fluxo de fusão move imagens (exceção restrita); sem mapa nada muda e não há outra atribuição de mergedFromLesionId', () => {
  const data = seedRuntime();
  data[0].images = (data[0].images || []).map((im) => ({ ...im, lesionId: 'seed_999' }));
  const before = plain(data);
  const app = makeApp(data);
  assert.equal(app.ctx.foldLesionMergesIntoGlobals().changed, false);
  assert.deepEqual(plain(app.ctx.DATA), before, 'sem mapa: nenhuma imagem trocada de dono');
  assert.equal((html.match(/mergedFromLesionId: drop/g) || []).length, 1, 'única atribuição (fold do mapa)');
  const canChange = extractFunction(html, 'canChangeImageOwnership');
  assert.match(canChange, /manual === true|manual===true/, 'regra geral de ownership continua exigindo ação manual');
  assert.doesNotMatch(canChange, /LESION_MERGES|merge091c/i);
});

test('091c NOTAS EDITADAS: se alguma nota não for mais a do SEED, não sobrescreve — preserva a nota do keeper + texto inédito do fundido', async () => {
  const { data } = await runScenario((d) => {
    byName(d, 'Linfoma mediastinal')[0].notes = 'Nota pessoal do usuário sobre linfoma.';
  });
  const k = byName(data, 'Linfoma mediastinal')[0];
  assert.match(k.notes, /Nota pessoal do usuário sobre linfoma\./);
  assert.match(k.notes, /massa\/adenopatia mediastinal volumosa/);
});

test('091c CASOS CLÍNICOS: deduplicados e preservados; keeper sem imagem escolhido por casos clínicos (regra 3)', async () => {
  const caseA = { title: 'Caso 1', sourceUrl: 'https://radiopaedia.org/cases/1' };
  const { data } = await runScenario((d) => {
    byName(d, 'Osteomielite mandibular')[0].clinicalCases = [caseA, { title: 'Caso 2', sourceUrl: 'https://radiopaedia.org/cases/2' }];
    byName(d, 'Osteomielite da mandíbula')[0].clinicalCases = [{ ...caseA }];
  });
  const k = byName(data, 'Osteomielite mandibular')[0];
  assert.deepEqual(k.clinicalCases.map((c) => c.sourceUrl), ['https://radiopaedia.org/cases/1', 'https://radiopaedia.org/cases/2']);
});

test('091c UI/PIPELINE: botão manual, modal de relatório, mapa em write/read/reconcile/adoção/snapshot/backup e fold no boot', () => {
  assert.match(html, /id="btn-clinical-merges-091c"/);
  assert.match(html, /getElementById\('btn-clinical-merges-091c'\)\.onclick = openClinicalMergesModal091c;/);
  assert.match(extractFunction(html, 'writeShardedState'), /lesionMerges: writeMerges/);
  assert.match(extractFunction(html, 'readShardedState'), /lesionMerges: normalizeLesionMerges\(meta\.lesionMerges\)/);
  assert.match(extractFunction(html, 'reconcileStateWithRemote'), /LESION_MERGES = mergeLesionMergeMaps\(LESION_MERGES, remote && remote\.lesionMerges\)/);
  assert.match(extractFunction(html, 'adoptRemoteStateForNewDevice'), /LESION_MERGES = normalizeLesionMerges\(remote\.lesionMerges\)/);
  assert.match(extractFunction(html, 'loadData'), /await loadLesionMerges\(\);/);
  assert.match(html, /lesionMerges: LESION_MERGES, \/\/ PROTEÇÃO 091c/, 'export do backup');
  assert.match(html, /LESION_MERGES = mergeLesionMergeMaps\(LESION_MERGES, parsed\.lesionMerges\)/, 'import nunca encolhe o mapa');
  assert.doesNotMatch(extractFunction(html, 'loadData'), /runApprovedClinicalMerges091c/, 'fusão NUNCA roda sozinha no boot');
});

test('091c RÓTULOS LEGADOS: imagem de OUTRA lesão com lesionId histórico igual a um id fundido não é tocada nem aborta a fusão', async () => {
  const { res, data, before } = await runScenario();
  const vertDrop = plain(res.executed).find((x) => x.group === 'metastases-osseas-vertebrais').dropIds[0];
  const holder = before.find((e) => !ALL_MEMBER_NAMES.includes(e.name) && (e.images || []).some((im) => im.lesionId === vertDrop));
  assert.ok(holder, 'o SEED real tem rótulo legado coincidente (' + vertDrop + ')');
  assert.deepEqual(plain(data.find((e) => e.id === holder.id)), plain(holder), 'ownership protegido: nada muda na outra lesão');
  assert.equal(res.ok, true);
});

test('091c ENSAIO: se a cópia de ensaio acusar órfão/imagem perdida, NADA é alterado (sem mapa, sem snapshot, sem save)', async () => {
  const data = seedRuntime();
  const keep = byName(data, 'Metástases ósseas vertebrais')[0];
  const drop = byName(data, 'Metástase óssea vertebral')[0];
  keep.images = [cimg('v1', { lesionId: drop.id, lesionName: drop.name })]; // imagem no keeper rotulada com o id que sairia
  const before = plain(data);
  const app = makeApp(data);
  const r = await app.ctx.runApprovedClinicalMerges091c({ confirmFn: confirmAll });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rehearsal_failed');
  assert.ok(plain(r.rehearsal).find((x) => x.group === 'metastases-osseas-vertebrais').audit.imageOwnerToMerged === 1);
  assert.deepEqual(plain(app.ctx.DATA), before);
  assert.deepEqual(plain(app.ctx.__getMerges()), {});
  assert.deepEqual(app.calls.snapshots, []);
  assert.deepEqual(app.calls.saves, []);
});
