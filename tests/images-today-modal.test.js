'use strict';

// KPI "imagens hoje" clicável + modal "Imagens adicionadas hoje" agrupado
// por lesão (22/09/2026). Fonte única de verdade: assignedAt das imagens,
// mesma regra/dedup do KPI já existente (countImagesAssignedOnDate) — a
// soma do modal precisa bater com o número do card. Só visualização/atalho
// sobre dados já existentes: nenhuma mutação em DATA/assignedAt/SRS/
// ownership/Cloudinary. Mesmo padrão dos demais testes: extrai as funções
// REAIS do index.html e roda num `vm` isolado.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function lineNumberAt(source, index) { return source.slice(0, index).split('\n').length; }

function extractBlock(source, openingBrace) {
  assert.equal(source[openingBrace], '{');
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) return source.slice(openingBrace, index + 1); }
  }
  throw new Error('Bloco sem fechamento');
}

function extractFunction(source, name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return {
    source: source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace),
    line: lineNumberAt(source, declaration.index)
  };
}

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/g, '$1');
}

function loadPure() {
  const src = [
    extractFunction(html, 'escAttr').source,
    extractFunction(html, 'esc').source,
    extractFunction(html, 'stableImageKeyV208').source,
    extractFunction(html, 'isValidAssignedAt').source,
    extractFunction(html, 'localDayKeyFromDate').source,
    extractFunction(html, 'imageAssignedDayLocal').source,
    extractFunction(html, 'countImagesAssignedOnDate').source,
    extractFunction(html, 'imagesAssignedTodayByLesion').source,
    extractFunction(html, 'imagesTodayRowHtml').source,
    extractFunction(html, 'imagesTodayModalHtml').source
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { countImagesAssignedOnDate, imagesAssignedTodayByLesion, imagesTodayModalHtml, localDayKeyFromDate };', ctx);
  return ctx.__api;
}

function img(over) {
  return Object.assign({
    publicId: 'atlas-radiologico/x' + Math.random().toString(36).slice(2, 8),
    data: 'https://res.cloudinary.com/x/image/upload/v1/atlas-radiologico/x.jpg',
    source: 'cloudinary'
  }, over || {});
}

function lesion(over) {
  return Object.assign({
    id: 'seed_1',
    name: 'Astrocitoma pilocítico',
    s: 'Neurorradiologia',
    site: 'Fossa posterior / cerebelo',
    images: []
  }, over || {});
}

const TODAY = '2026-09-22';
const YESTERDAY = '2026-09-21';
const TODAY_ISO_1 = '2026-09-22T09:00:00.000Z';
const TODAY_ISO_2 = '2026-09-22T14:30:00.000Z';
const TODAY_ISO_3 = '2026-09-22T18:00:00.000Z';
const YESTERDAY_ISO = '2026-09-21T20:00:00.000Z';

// ===========================================================================
// 1. KPI CLICÁVEL
// ===========================================================================

test('1. o card do KPI "imagens hoje" tem id próprio, cursor pointer e está wireado ao modal', () => {
  assert.match(html, /id="kpi-images-today-card"[^>]*style="cursor:pointer;"/);
  const src = stripJsComments(extractFunction(html, 'openProgressDashboard').source);
  assert.match(src, /imgsTodayCard\.onclick = openImagesTodayModal;/);
});

test('1. affordance discreta (hover de borda), não vira botão chamativo (sem .btn-primary/.btn)', () => {
  assert.match(html, /id="kpi-images-today-card"[^>]*>/);
  const cardTag = html.match(/<div class="study-kpi" id="kpi-images-today-card"[^>]*>/)[0];
  assert.doesNotMatch(cardTag, /class="[^"]*\bbtn\b/);
  const src = stripJsComments(extractFunction(html, 'openProgressDashboard').source);
  assert.match(src, /imgsTodayCard\.onmouseenter/);
  assert.match(src, /imgsTodayCard\.onmouseleave/);
});

// ===========================================================================
// 2/3/4/5. LISTA USA assignedAt; HOJE ENTRA; ONTEM NÃO; SEM assignedAt NÃO
// ===========================================================================

test('2/3. imagem com assignedAt de HOJE entra na lista e no total', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: TODAY_ISO_1 })] })];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
});

test('4. imagem com assignedAt de ONTEM não entra na lista de hoje', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: YESTERDAY_ISO })] })];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups.length, 0);
});

test('5. imagem SEM assignedAt não entra na lista (histórica; nunca ganha timestamp aqui)', () => {
  const api = loadPure();
  const before = JSON.stringify([{ ...img(), assignedAt: undefined }]);
  const catalog = [lesion({ images: [img({ assignedAt: null }), img()] })];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups.length, 0);
  // a função é pura: nada foi escrito de volta nas imagens (sem invenção de timestamp)
  assert.equal(catalog[0].images[0].assignedAt, null);
  assert.equal('assignedAt' in catalog[0].images[1] ? catalog[0].images[1].assignedAt : undefined, undefined);
});

// ===========================================================================
// 6/7. VÁRIAS IMAGENS DA MESMA LESÃO AGRUPAM; QUANTIDADE CORRETA
// ===========================================================================

test('6/7. 3 imagens de hoje na MESMA lesão agrupam numa única linha, com count=3', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [
    img({ assignedAt: TODAY_ISO_1 }),
    img({ assignedAt: TODAY_ISO_2 }),
    img({ assignedAt: TODAY_ISO_3 })
  ] })];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups.length, 1, 'uma linha só, não uma por imagem');
  assert.equal(groups[0].count, 3);
});

test('7. lesões diferentes ficam em linhas separadas, cada uma com sua própria contagem', () => {
  const api = loadPure();
  const catalog = [
    lesion({ id: 'seed_1', name: 'A', images: [img({ assignedAt: TODAY_ISO_1 }), img({ assignedAt: TODAY_ISO_2 })] }),
    lesion({ id: 'seed_2', name: 'B', images: [img({ assignedAt: TODAY_ISO_3 })] })
  ];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups.length, 2);
  const a = groups.find(g => g.id === 'seed_1');
  const b = groups.find(g => g.id === 'seed_2');
  assert.equal(a.count, 2);
  assert.equal(b.count, 1);
});

// ===========================================================================
// 8/9. DEDUP RESPEITADO; SOMA DO MODAL == KPI
// ===========================================================================

test('8. a mesma imagem (mesma identidade estável) não infla o contador, igual ao KPI', () => {
  const api = loadPure();
  const same = img({ publicId: 'atlas-radiologico/dup', assignedAt: TODAY_ISO_1 });
  const catalog = [lesion({ images: [same, { ...same }] })]; // "duplicata" (mesmo publicId)
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups[0].count, 1, 'mesma identidade estável não duplica');
});

test('9. soma dos counts do modal == countImagesAssignedOnDate (o mesmo número do KPI)', () => {
  const api = loadPure();
  const catalog = [
    lesion({ id: 'seed_1', name: 'A', images: [img({ assignedAt: TODAY_ISO_1 }), img({ assignedAt: TODAY_ISO_2 }), img({ assignedAt: YESTERDAY_ISO })] }),
    lesion({ id: 'seed_2', name: 'B', images: [img({ assignedAt: TODAY_ISO_3 })] }),
    lesion({ id: 'seed_3', name: 'C', images: [] })
  ];
  const kpi = api.countImagesAssignedOnDate(catalog, TODAY);
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  const modalSum = groups.reduce((acc, g) => acc + g.count, 0);
  assert.equal(modalSum, kpi, 'soma do modal precisa bater com o KPI');
  assert.equal(kpi, 3);
});

// ===========================================================================
// 10. SEÇÃO/SÍTIO EXIBIDOS
// ===========================================================================

test('10. cada grupo carrega seção (s) e sítio (site) da lesão', () => {
  const api = loadPure();
  const catalog = [lesion({ s: 'Abdômen Superior', site: 'Intestino / cólon', images: [img({ assignedAt: TODAY_ISO_1 })] })];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups[0].s, 'Abdômen Superior');
  assert.equal(groups[0].site, 'Intestino / cólon');
});

test('10. o HTML do modal mostra nome, contagem e seção › sítio de cada lesão', () => {
  const api = loadPure();
  const catalog = [lesion({ name: 'Astrocitoma pilocítico', s: 'Neurorradiologia', site: 'Fossa posterior / cerebelo', images: [img({ assignedAt: TODAY_ISO_1 })] })];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  const out = api.imagesTodayModalHtml(groups, groups.reduce((a, g) => a + g.count, 0));
  assert.match(out, /Astrocitoma pilocítico/);
  assert.match(out, /Neurorradiologia.*Fossa posterior \/ cerebelo/);
  assert.match(out, /1 imagem/);
  assert.match(out, /Abrir lesão/);
});

// ===========================================================================
// 11. ORDENAÇÃO PELA IMAGEM MAIS RECENTE
// ===========================================================================

test('11. lesão com a imagem de HOJE mais recente aparece primeiro', () => {
  const api = loadPure();
  const catalog = [
    lesion({ id: 'seed_1', name: 'Mais antiga hoje', images: [img({ assignedAt: TODAY_ISO_1 })] }),
    lesion({ id: 'seed_2', name: 'Mais recente hoje', images: [img({ assignedAt: TODAY_ISO_3 })] }),
    lesion({ id: 'seed_3', name: 'Meio-termo', images: [img({ assignedAt: TODAY_ISO_2 })] })
  ];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  // Compara por JSON, não deepEqual: array devolvido pelo vm isolado
  // pertence a outro "realm" — estruturalmente igual a um literal do teste,
  // mas deepStrictEqual rejeita por reference-equality de protótipo.
  assert.equal(JSON.stringify(groups.map(g => g.id)), JSON.stringify(['seed_2', 'seed_3', 'seed_1']));
});

test('11. dentro de uma lesão com várias imagens, usa a MAIS recente para desempatar a posição', () => {
  const api = loadPure();
  const catalog = [
    lesion({ id: 'seed_1', name: 'Tem uma imagem tardia', images: [img({ assignedAt: TODAY_ISO_1 }), img({ assignedAt: TODAY_ISO_3 })] }),
    lesion({ id: 'seed_2', name: 'Só uma imagem no meio', images: [img({ assignedAt: TODAY_ISO_2 })] })
  ];
  const groups = api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(groups[0].id, 'seed_1', 'a imagem mais tardia (TODAY_ISO_3) da lesão 1 vence');
});

// ===========================================================================
// 12/13. CLICAR ABRE openDetail; MODAL FECHA ANTES
// ===========================================================================

test('12. clicar na linha ou no link "Abrir lesão" chama openLesion(id) -> closeThis() + openDetail(id, returnTo)', () => {
  const src = stripJsComments(extractFunction(html, 'openImagesTodayModal').source);
  assert.match(src, /const openLesion = \(id\) => \{ closeThis\(\); openDetail\(id, \{ returnTo: 'images-today' \}\); \};/, 'fecha o modal ANTES e passa o contexto de retorno');
  assert.match(src, /row\.onclick = \(\) => openLesion\(row\.getAttribute\('data-lesion-id'\)\);/);
  assert.match(src, /a\.onclick = \(ev\) => \{ ev\.preventDefault\(\); ev\.stopPropagation\(\); openLesion\(a\.getAttribute\('data-lesion-id'\)\); \};/);
});

test('13. não navega para outra página (sem location.href/window.open)', () => {
  const src = extractFunction(html, 'openImagesTodayModal').source;
  assert.doesNotMatch(src, /location\.href|window\.open/);
});

// ===========================================================================
// 14. ESTADO VAZIO
// ===========================================================================

test('14. hoje=0 -> modal mostra "Nenhuma imagem adicionada hoje." sem erro', () => {
  const api = loadPure();
  const out = api.imagesTodayModalHtml([], 0);
  assert.match(out, /Nenhuma imagem adicionada hoje\./);
  assert.match(out, /0 imagens · 0 lesões/);
});

test('14. o card continua clicável mesmo com 0 imagens hoje (wiring incondicional)', () => {
  const src = stripJsComments(extractFunction(html, 'openProgressDashboard').source);
  const idx = src.indexOf('imgsTodayCard');
  assert.ok(idx >= 0);
  const nearby = src.slice(Math.max(0, idx - 200), idx + 50);
  assert.doesNotMatch(nearby, /if\s*\(\s*imgsToday\s*>\s*0\s*\)/, 'não deve haver condição de "só se > 0" no wiring');
});

// ===========================================================================
// 15. ESC FECHA
// ===========================================================================

test('15. ESC fecha o modal (listener dedicado, removido ao fechar)', () => {
  const src = extractFunction(html, 'openImagesTodayModal').source;
  assert.match(src, /ev\.key === 'Escape'/);
  assert.match(src, /document\.addEventListener\('keydown', escHandler\)/);
  assert.match(src, /document\.removeEventListener\('keydown', escHandler\)/);
});

test('clique fora (no overlay, fora do modal) também fecha', () => {
  const src = extractFunction(html, 'openImagesTodayModal').source;
  assert.match(src, /ov\.onclick = \(ev\) => \{ if \(ev\.target === ov\) closeThis\(\); \};/);
});

// ===========================================================================
// 16. NENHUMA MUTAÇÃO EM DATA/assignedAt
// ===========================================================================

test('16. imagesAssignedTodayByLesion é pura: não muta o catálogo nem gera assignedAt', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: TODAY_ISO_1 }), img({ assignedAt: null })] })];
  const before = JSON.stringify(catalog);
  api.imagesAssignedTodayByLesion(catalog, TODAY);
  assert.equal(JSON.stringify(catalog), before);
});

test('16 (estático): openImagesTodayModal/imagesAssignedTodayByLesion nunca chamam saveData/pushToFirebaseNow/DATA=', () => {
  for (const name of ['openImagesTodayModal', 'imagesAssignedTodayByLesion', 'imagesTodayRowHtml', 'imagesTodayModalHtml']) {
    const src = stripJsComments(extractFunction(html, name).source);
    assert.doesNotMatch(src, /\bsaveData\s*\(/, name);
    assert.doesNotMatch(src, /\bpushToFirebaseNow\s*\(/, name);
    assert.doesNotMatch(src, /\bDATA\s*=(?!=)/, name);
    assert.doesNotMatch(src, /\.assignedAt\s*=/, name + ' nunca escreve assignedAt');
  }
});

test('16 (estático): não referencia Cloudinary/SRS/ownership (só visualização sobre dados existentes)', () => {
  const src = extractFunction(html, 'openImagesTodayModal').source + extractFunction(html, 'imagesAssignedTodayByLesion').source;
  assert.doesNotMatch(src, /uploadToCloudinary|cloudinary\.com\/.*upload/);
  assert.doesNotMatch(src, /\bSRS\b/);
  assert.doesNotMatch(src, /canChangeImageOwnership|assertManualImageOwnershipChange/);
});

// ===========================================================================
// FONTE ÚNICA DE VERDADE (regra 1) — mesma função/regra do KPI atual
// ===========================================================================

test('FONTE DE VERDADE: o KPI e o modal usam a MESMA data (localDayKeyFromDate) e a mesma regra de dia', () => {
  const dashSrc = stripJsComments(extractFunction(html, 'openProgressDashboard').source);
  assert.match(dashSrc, /const imgsToday=countImagesAssignedOnDate\(DATA, localDayKeyFromDate\(new Date\(\)\)\);/);
  const modalSrc = extractFunction(html, 'openImagesTodayModal').source;
  assert.match(modalSrc, /const dateStr = localDayKeyFromDate\(new Date\(\)\);/);
  assert.match(modalSrc, /imagesAssignedTodayByLesion\(DATA, dateStr\)/);
});

test('FONTE DE VERDADE: imagesAssignedTodayByLesion nunca infere pela lesão nem pelo Cloudinary — só img.assignedAt', () => {
  const src = extractFunction(html, 'imagesAssignedTodayByLesion').source;
  assert.doesNotMatch(src, /e\.createdAt|e\._userUpdatedAt|\.uploadedAt|\.createdAt\b/);
  assert.match(src, /imageAssignedDayLocal\(img\.assignedAt\)/);
});

// ===========================================================================
// VOLTAR PARA IMAGENS DE HOJE (22/09/2026) — contexto returnTo em openDetail
// ===========================================================================

function loadDetail() {
  const src = extractFunction(html, 'openDetail').source;
  const els = {};
  let anonSeq = 0;
  function mkEl(id) {
    if (!els[id]) {
      els[id] = {
        id, innerHTML: '', textContent: '', onclick: null, style: {},
        dataset: {}, className: '',
        querySelector() { return null; },
        querySelectorAll() { return []; },
        appendChild() {},
        remove() { this.removed = true; },
        addEventListener() {},
        getAttribute() { return null; },
        setAttribute() {},
        removed: false
      };
    }
    return els[id];
  }
  function mkAnon() {
    anonSeq += 1;
    return mkEl('anon-' + anonSeq);
  }
  let appendedOv = null;
  const calls = { openImagesTodayModal: 0, closeOverlay: 0, openForm: 0 };
  const lesion = { id: 'L1', name: 'Lesão Teste', s: 'S', site: 'T', tags: [], notes: '', links: [], classification: null, images: [] };
  const ctx = vm.createContext({
    DATA: [lesion],
    document: {
      createElement: () => mkAnon(),
      getElementById: (id) => mkEl(id),
      body: { appendChild: (el) => { appendedOv = el; } },
      querySelector: () => null
    },
    ensureLinks: () => [],
    filterReferenceLinksForDisplay: (l) => l,
    hasEntryImgs: () => false,
    incColor: () => '',
    incLabel: () => '',
    CLASSIFICATION_SYSTEMS: {},
    renderClassificationBox: () => '',
    clinicalCasesSectionHtml: () => '',
    getEntryImgs: async () => [],
    getReview: () => 0,
    REVIEW_COLORS: {},
    REVIEW_ICONS: {},
    REVIEW_LABELS: {},
    setReview: () => {},
    renderReviewBar: () => {},
    renderResults: () => {},
    wireClinicalCasesToggle: () => {},
    closeOverlay: () => { calls.closeOverlay++; },
    openForm: () => { calls.openForm++; },
    openImagesTodayModal: () => { calls.openImagesTodayModal++; },
    esc: (v) => v,
    console: { warn: () => {}, log: () => {}, error: () => {} }
  });
  vm.runInContext(src + '\nthis.__d = { openDetail };', ctx);
  return { openDetail: ctx.__d.openDetail, els, getOv: () => appendedOv, calls, lesion };
}

test('VOLTAR: detalhe recebe contexto de retorno (returnTo allowlist)', () => {
  const src = stripJsComments(extractFunction(html, 'openDetail').source);
  assert.match(src, /function openDetail\(id, opts\)/);
  assert.match(src, /opts && opts\.returnTo === 'images-today'/, 'só o valor conhecido ativa');
});

test('VOLTAR: botão "Voltar para imagens de hoje" aparece SÓ nesse fluxo', () => {
  const { openDetail, els, getOv } = loadDetail();
  openDetail('L1');
  assert.doesNotMatch(getOv().innerHTML, /btn-back-today/, 'fluxo normal: sem botão Voltar');
  assert.match(getOv().innerHTML, /id="btn-close"/);
  const { openDetail: open2, els: els2, getOv: getOv2 } = loadDetail();
  open2('L1', { returnTo: 'images-today' });
  assert.match(getOv2().innerHTML, /id="btn-back-today"/);
  assert.match(getOv2().innerHTML, /Voltar para imagens de hoje/);
  assert.ok(els2['btn-back-today'], 'botão fia via getElementById');
});

test('VOLTAR: clicar fecha SÓ o detalhe e reabre a lista (sem closeOverlay)', () => {
  const { openDetail, els, getOv, calls } = loadDetail();
  openDetail('L1', { returnTo: 'images-today' });
  const ov = getOv();
  assert.equal(typeof els['btn-back-today'].onclick, 'function');
  els['btn-back-today'].onclick();
  assert.equal(ov.removed, true, 'detalhe removido');
  assert.equal(calls.openImagesTodayModal, 1, 'lista reaberta');
  assert.equal(calls.closeOverlay, 0, 'Dashboard/Quiz de fundo intactos (sem closeOverlay)');
});

test('VOLTAR: fechar normal continua funcionando (btn-close -> closeOverlay)', () => {
  const { openDetail, els, calls } = loadDetail();
  openDetail('L1', { returnTo: 'images-today' });
  els['btn-close'].onclick();
  assert.equal(calls.closeOverlay, 1);
  assert.equal(calls.openImagesTodayModal, 0, 'fechar não reabre nada');
});

test('VOLTAR: ESC e overlays intactos (sem body/scroll hacks, sem stack global)', () => {
  const src = stripJsComments(extractFunction(html, 'openDetail').source);
  assert.doesNotMatch(src, /addEventListener\('keydown'/, 'ESC mantém comportamento atual (sem handler novo)');
  assert.doesNotMatch(src, /style\.overflow|modal-open|history\.back|location\.reload/, 'sem trava de scroll nem navegação');
  const backIdx = src.indexOf('btn-back-today');
  assert.ok(backIdx !== -1);
  assert.doesNotMatch(src.slice(backIdx, backIdx + 400), /closeOverlay/, 'volta nunca chama closeOverlay');
});

test('VOLTAR: contagens vêm do DATA ao reabrir (sem cache) + ciclo repetível', () => {
  const { openDetail, els, calls, lesion } = loadDetail();
  for (let i = 0; i < 3; i++) {
    openDetail('L1', { returnTo: 'images-today' });
    els['btn-back-today'].onclick();
  }
  assert.equal(calls.openImagesTodayModal, 3, 'lista → detalhe → voltar repete sem acumular');
  assert.equal(calls.closeOverlay, 0);
  assert.equal(JSON.stringify(lesion), JSON.stringify({ id: 'L1', name: 'Lesão Teste', s: 'S', site: 'T', tags: [], notes: '', links: [], classification: null, images: [] }), 'lesão intacta');
});

test('VOLTAR: outros fluxos não ganham botão (só o modal do KPI passa returnTo)', () => {
  const hits = [];
  const re = /openDetail\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const before = html.slice(Math.max(0, m.index - 60), m.index);
    if (/function openDetail/.test(before)) continue;
    if (/openDetail\(id, \{ returnTo: 'images-today' \}\)/.test(m[0])) continue;
    if (/returnTo/.test(m[0])) hits.push(m[0].slice(0, 60));
  }
  assert.deepEqual(hits, [], 'nenhum outro call site passa contexto');
});
