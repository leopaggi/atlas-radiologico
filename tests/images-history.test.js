'use strict';

// Histórico/auditoria de imagens em "Ferramentas avançadas" (22/09/2026).
// Só leitura, sob demanda: nenhum log novo persistido, nenhum write extra,
// nenhum backfill de assignedAt ausente. Fonte única: img.assignedAt, mesma
// regra de dia local e MESMA dedup (stableImageKeyV208) do KPI "imagens
// hoje"/gráfico semanal já existentes — os números precisam ser coerentes
// entre si. Mesmo padrão dos demais testes: extrai as funções REAIS do
// index.html e roda num `vm` isolado.

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

function extractConst(source, name) {
  const declaration = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=`).exec(source);
  assert.ok(declaration, `Constante ${name} nao encontrada`);
  // Suporta array/objeto multi-linha: casa colchetes/chaves balanceados.
  const eqEnd = declaration.index + declaration[0].length;
  let i = eqEnd;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] === '[' || source[i] === '{') {
    const open = source[i], close = open === '[' ? ']' : '}';
    let depth = 0;
    for (; i < source.length; i++) {
      if (source[i] === open) depth++;
      else if (source[i] === close) { depth--; if (depth === 0) { i++; break; } }
    }
    const semi = source.indexOf(';', i);
    return source.slice(declaration.index, semi + 1);
  }
  const semi = source.indexOf(';', declaration.index);
  return source.slice(declaration.index, semi + 1);
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
    extractConst(html, 'IMAGES_HISTORY_FILTERS'),
    extractConst(html, 'IMAGES_HISTORY_DEFAULT_FILTER'),
    extractConst(html, 'IMAGES_HISTORY_PAGE_SIZE'),
    extractFunction(html, 'buildImagesHistory').source,
    extractFunction(html, 'imagesHistorySummaryHtml').source,
    extractFunction(html, 'imagesHistoryFilterTabsHtml').source,
    extractFunction(html, 'imagesHistoryTimeLabel').source,
    extractFunction(html, 'imagesHistoryDateLabel').source,
    extractFunction(html, 'imagesHistoryLesionRowHtml').source,
    extractFunction(html, 'imagesHistoryDayGroupHtml').source,
    extractFunction(html, 'imagesHistoryListHtml').source
  ].join('\n');
  const ctx = vm.createContext({ console: { warn: () => {}, log: () => {}, error: () => {} } });
  vm.runInContext(src + '\nthis.__api = { buildImagesHistory, imagesHistorySummaryHtml, imagesHistoryFilterTabsHtml, imagesHistoryTimeLabel, imagesHistoryDateLabel, imagesHistoryLesionRowHtml, imagesHistoryDayGroupHtml, imagesHistoryListHtml, countImagesAssignedOnDate, localDayKeyFromDate, IMAGES_HISTORY_FILTERS, IMAGES_HISTORY_DEFAULT_FILTER };', ctx);
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
    id: 'seed_1', name: 'Diverticulite de Meckel', s: 'Abdômen Superior', site: 'Intestino / cólon', images: []
  }, over || {});
}

const NOW = new Date('2026-09-22T20:00:00.000Z'); // dia local UTC = 22/09/2026 nesta máquina de teste
const T0 = '2026-09-22T14:32:00.000Z';
const T1 = '2026-09-22T14:35:00.000Z';
const T2 = '2026-09-22T11:08:00.000Z';
const YDAY = '2026-09-21T10:00:00.000Z';
const D8 = '2026-09-14T10:00:00.000Z';  // 8 dias atrás (fora de 7d, dentro de 30d)
const D31 = '2026-08-22T10:00:00.000Z'; // 31 dias atrás (fora de 30d)

// ===========================================================================
// PAINEL RECOLHIDO NÃO CALCULA / EXPANDIR CALCULA
// ===========================================================================

test('PAINEL: recolhido por padrão (hidden), só calcula ao clicar (renderPanel só dentro de handlers de clique)', () => {
  assert.match(html, /id="images-history-panel" hidden/);
  const src = stripJsComments(extractFunction(html, 'initImagesHistoryPanel').source);
  assert.match(src, /toggleBtn\.onclick[\s\S]*?if\(willOpen\) renderPanel\(\);/, 'abrir o expansor: só calcula quando willOpen===true');
  assert.match(src, /fbtn\.onclick[\s\S]{0,120}renderPanel\(\);/, 'trocar o filtro recalcula');
  assert.match(src, /moreBtn\.onclick[\s\S]{0,80}renderPanel\(\);/, '"mostrar mais" recalcula (paginação)');
  // Só existem essas 3 CHAMADAS (os 3 gatilhos permitidos) + a própria
  // declaração da função — nenhuma chamada solta/incondicional fora de um
  // handler de clique.
  const calls = (src.match(/\brenderPanel\(\)/g) || []).length;
  assert.equal(calls, 4, '1 declaração ("function renderPanel(){") + 3 chamadas nos gatilhos permitidos (abrir, trocar filtro, mostrar mais)');
});

test('PAINEL: nunca chamado a partir de renderAll()/refreshStudyDashboardLive() (sem recálculo automático)', () => {
  const renderAllSrc = stripJsComments(extractFunction(html, 'renderAll').source);
  assert.doesNotMatch(renderAllSrc, /buildImagesHistory|renderPanel\(\)|initImagesHistoryPanel/);
  const liveSrc = stripJsComments(extractFunction(html, 'refreshStudyDashboardLive').source);
  assert.doesNotMatch(liveSrc, /buildImagesHistory/);
});

test('PAINEL: sem polling/observer (setInterval/setTimeout/MutationObserver ausentes na fiação)', () => {
  const src = extractFunction(html, 'initImagesHistoryPanel').source;
  assert.doesNotMatch(src, /setInterval|setTimeout|MutationObserver|IntersectionObserver/);
});

// ===========================================================================
// FILTROS: Hoje / 7 dias / 30 dias / Tudo
// ===========================================================================

test('FILTRO Hoje: rangeDays=1 mostra só o dia de hoje no agrupamento', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: YDAY })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: 1 });
  assert.equal(hist.days.length, 1);
  assert.equal(hist.days[0].dateKey, api.localDayKeyFromDate(NOW));
});

test('FILTRO 7 dias: imagem de 8 dias atrás fica de fora do agrupamento', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: D8 })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: 7 });
  assert.equal(hist.days.length, 1, 'só o dia de hoje (D8 é 8 dias atrás, fora da janela de 7)');
});

test('FILTRO 30 dias (padrão): imagem de 8 dias atrás ENTRA; 31 dias atrás fica de fora', () => {
  const api = loadPure();
  assert.equal(api.IMAGES_HISTORY_DEFAULT_FILTER, '30d');
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: D8 }), img({ assignedAt: D31 })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: 30 });
  assert.equal(hist.days.length, 2, 'hoje + D8, mas não D31');
});

test('FILTRO Tudo: rangeDays=null não corta nenhum dia (D31 aparece)', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: D31 })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.days.length, 2);
});

test('FILTRO: os 4 botões existem com os rótulos pedidos, padrão 30 dias ativo', () => {
  const api = loadPure();
  const out = api.imagesHistoryFilterTabsHtml('30d');
  // JSON, não deepEqual: array vem de outro "realm" (vm isolado).
  assert.equal(JSON.stringify(api.IMAGES_HISTORY_FILTERS.map(f => f.key)), JSON.stringify(['today', '7d', '30d', 'all']));
  assert.match(out, />Hoje</);
  assert.match(out, />7 dias</);
  assert.match(out, />30 dias</);
  assert.match(out, />Tudo</);
  assert.match(out, /data-filter="30d"[^>]*aria-selected="true"/);
});

// ===========================================================================
// AGRUPAMENTO POR DIA / POR LESÃO
// ===========================================================================

test('AGRUPAMENTO: primeiro por dia (dateKey), dias mais recentes primeiro', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: YDAY })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.days.length, 2);
  assert.ok(hist.days[0].dateKey > hist.days[1].dateKey, 'dia mais recente vem primeiro');
});

test('AGRUPAMENTO: dentro do dia, uma linha por lesão (não uma por imagem)', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: T1 })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.days[0].lesions.length, 1, 'uma linha só pra essa lesão');
  assert.equal(hist.days[0].lesions[0].count, 2);
});

// ===========================================================================
// HORÁRIOS CORRETOS
// ===========================================================================

test('HORÁRIOS: cada lesão do dia guarda os assignedAt (ISO) de cada imagem daquele dia, ordenados', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T1 }), img({ assignedAt: T0 })] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.days[0].lesions[0].times.length, 2);
  assert.equal(JSON.stringify(hist.days[0].lesions[0].times), JSON.stringify([T0, T1].slice().sort()));
});

test('HORÁRIOS: imagesHistoryTimeLabel formata um ISO para HH:MM local', () => {
  const api = loadPure();
  const out = api.imagesHistoryTimeLabel('2026-09-22T14:32:00.000Z');
  assert.match(out, /^\d{2}:\d{2}$/, 'formato HH:MM');
});

test('HORÁRIOS: o HTML da linha da lesão lista os horários separados por " · "', () => {
  const api = loadPure();
  const out = api.imagesHistoryLesionRowHtml({ id: 'x', name: 'N', s: 'S', site: 'Y', count: 2, times: [T0, T1] });
  const t0 = api.imagesHistoryTimeLabel(T0), t1 = api.imagesHistoryTimeLabel(T1);
  assert.match(out, new RegExp(t0 + ' · ' + t1));
});

// ===========================================================================
// ORDENAÇÃO CORRETA (lesão com imagem mais recente primeiro)
// ===========================================================================

test('ORDENAÇÃO: dentro do dia, lesão com a imagem mais recente aparece primeiro', () => {
  const api = loadPure();
  const catalog = [
    lesion({ id: 'seed_1', name: 'Mais cedo', images: [img({ assignedAt: T2 })] }),
    lesion({ id: 'seed_2', name: 'Mais tarde', images: [img({ assignedAt: T1 })] })
  ];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(JSON.stringify(hist.days[0].lesions.map(l => l.id)), JSON.stringify(['seed_2', 'seed_1']));
});

// ===========================================================================
// DEDUP
// ===========================================================================

test('DEDUP: a mesma imagem (mesma identidade estável) não é contada duas vezes', () => {
  const api = loadPure();
  const shared = img({ publicId: 'atlas-radiologico/dup', assignedAt: T0 });
  const catalog = [lesion({ images: [shared, { ...shared }] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.days[0].lesions[0].count, 1);
  assert.equal(hist.totalWithAssignedAt, 1);
});

// ===========================================================================
// SEM DATA NÃO ENTRA / CONTADOR SEM DATA CORRETO
// ===========================================================================

test('SEM DATA: imagem sem assignedAt não entra em nenhum dia, mas soma em historicalNoDateCount', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: null }), img()] })];
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.days.length, 1);
  assert.equal(hist.days[0].lesions[0].count, 1, 'só a imagem com assignedAt entra');
  assert.equal(hist.historicalNoDateCount, 2, 'as 2 sem data contam no resumo, não no agrupamento');
});

test('SEM DATA: função pura não gera/atribui assignedAt a imagens históricas (sem backfill)', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: null }), img()] })];
  const before = JSON.stringify(catalog);
  api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(JSON.stringify(catalog), before, 'catálogo intocado — nenhum timestamp inventado');
});

// ===========================================================================
// RESUMO COERENTE COM OS KPIs (Total/Hoje/7d/30d/sem data)
// ===========================================================================

test('RESUMO: todayCount do histórico bate com countImagesAssignedOnDate (mesmo KPI "imagens hoje")', () => {
  const api = loadPure();
  const catalog = [
    lesion({ id: 'seed_1', images: [img({ assignedAt: T0 }), img({ assignedAt: T1 })] }),
    lesion({ id: 'seed_2', images: [img({ assignedAt: YDAY })] })
  ];
  const kpi = api.countImagesAssignedOnDate(catalog, api.localDayKeyFromDate(NOW));
  const hist = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(hist.todayCount, kpi);
  assert.equal(kpi, 2);
});

test('RESUMO: o resumo (todayCount/last7/last30/totalWithAssignedAt) é o MESMO independente do filtro do agrupamento', () => {
  const api = loadPure();
  const catalog = [lesion({ images: [img({ assignedAt: T0 }), img({ assignedAt: D8 }), img({ assignedAt: D31 })] })];
  const histToday = api.buildImagesHistory(catalog, { now: NOW, rangeDays: 1 });
  const histAll = api.buildImagesHistory(catalog, { now: NOW, rangeDays: null });
  assert.equal(histToday.totalWithAssignedAt, histAll.totalWithAssignedAt);
  assert.equal(histToday.todayCount, histAll.todayCount);
  assert.equal(histToday.last7Count, histAll.last7Count);
  assert.equal(histToday.last30Count, histAll.last30Count);
});

test('RESUMO: HTML mostra as 5 métricas pedidas', () => {
  const api = loadPure();
  const hist = { totalWithAssignedAt: 10, todayCount: 3, last7Count: 5, last30Count: 8, historicalNoDateCount: 4 };
  const out = api.imagesHistorySummaryHtml(hist);
  assert.match(out, />10<\/b> com data/);
  assert.match(out, />3<\/b> hoje/);
  assert.match(out, />5<\/b> últimos 7 dias/);
  assert.match(out, />8<\/b> últimos 30 dias/);
  assert.match(out, />4<\/b> históricas sem data/);
});

// ===========================================================================
// CLICAR ABRE openDetail(id)
// ===========================================================================

test('ABRIR LESÃO: cada linha de lesão tem data-lesion-id e o wiring chama openDetail direto (sem fechar nada antes — não é overlay empilhada)', () => {
  const api = loadPure();
  const out = api.imagesHistoryLesionRowHtml({ id: 'seed_9', name: 'X', s: 'S', site: 'Y', count: 1, times: [T0] });
  assert.match(out, /data-lesion-id="seed_9"/);
  const src = stripJsComments(extractFunction(html, 'initImagesHistoryPanel').source);
  assert.match(src, /row\.onclick = \(\)=> openDetail\(row\.getAttribute\('data-lesion-id'\)\);/);
});

test('ABRIR LESÃO: nunca navega para outra página', () => {
  const src = extractFunction(html, 'initImagesHistoryPanel').source;
  assert.doesNotMatch(src, /location\.href|window\.open/);
});

// ===========================================================================
// ESTADO VAZIO
// ===========================================================================

test('ESTADO VAZIO: sem imagens no período, mostra mensagem simples e não quebra', () => {
  const api = loadPure();
  const out = api.imagesHistoryListHtml([]);
  assert.match(out, /Nenhuma imagem neste período\./);
});

// ===========================================================================
// ZERO MUTAÇÃO / ZERO WRITE
// ===========================================================================

test('ZERO MUTAÇÃO: nenhuma das funções novas chama saveData/pushToFirebaseNow/DATA=/storage.set', () => {
  for (const name of ['buildImagesHistory', 'imagesHistorySummaryHtml', 'imagesHistoryFilterTabsHtml', 'imagesHistoryLesionRowHtml', 'imagesHistoryDayGroupHtml', 'imagesHistoryListHtml', 'initImagesHistoryPanel']) {
    const src = stripJsComments(extractFunction(html, name).source);
    assert.doesNotMatch(src, /\bsaveData\s*\(/, name);
    assert.doesNotMatch(src, /\bpushToFirebaseNow\s*\(/, name);
    assert.doesNotMatch(src, /\bstorage\.set\s*\(/, name);
    assert.doesNotMatch(src, /\bDATA\s*=(?!=)/, name);
    assert.doesNotMatch(src, /\.assignedAt\s*=/, name + ' nunca escreve assignedAt (sem backfill)');
  }
});

test('ZERO MUTAÇÃO: não referencia Cloudinary/sync/bootstrap/ownership/SRS/Quiz/clinicalCases (só leitura sobre dados existentes)', () => {
  const src = extractFunction(html, 'buildImagesHistory').source + extractFunction(html, 'initImagesHistoryPanel').source;
  assert.doesNotMatch(src, /uploadToCloudinary|cloudinary\.com\/.*upload/);
  assert.doesNotMatch(src, /pushToFirebase|syncFromFirebase|deviceBootstrapPending/);
  assert.doesNotMatch(src, /canChangeImageOwnership|assertManualImageOwnershipChange/);
  assert.doesNotMatch(src, /\bSRS\b|\bLESION_REVISIONS\b|\bclinicalCases\b|quizImgIdx|quiz-carousel/);
});

test('ZERO WRITE: buildImagesHistory não persiste nenhum log novo (nenhuma chave de storage própria)', () => {
  assert.doesNotMatch(html, /IMAGES_HISTORY_KEY|imagesHistoryLog|atlas:imagesHistory/);
});

// ===========================================================================
// PAINEL — markup/wiring geral
// ===========================================================================

test('PAINEL: botão começa com "▸" e vira "▾" ao abrir, na sidebar (fora de Ferramentas avançadas)', () => {
  assert.match(html, /id="btn-images-history"[^>]*>▸ Histórico de imagens</);
  const src = extractFunction(html, 'initImagesHistoryPanel').source;
  assert.match(src, /const label = open => \(open \? '▾' : '▸'\) \+ ' Histórico de imagens';/);
});

test('PAINEL: fica na #sidebar-foot, acima de "configurar Cloudinary" (fora de #advanced-tools)', () => {
  const btnIdx = html.indexOf('id="btn-images-history"');
  const cloudIdx = html.indexOf('id="btn-cloudinary"');
  const treeIdx = html.indexOf('id="tree"');
  const advToolsIdx = html.indexOf('id="advanced-tools"');
  assert.ok(btnIdx !== -1 && cloudIdx !== -1, 'botão e Cloudinary existem');
  assert.ok(btnIdx > treeIdx, 'botão fica depois da árvore do acervo');
  assert.ok(btnIdx < cloudIdx, 'botão fica acima de "configurar Cloudinary"');
  assert.ok(btnIdx < advToolsIdx, 'botão NÃO fica dentro de #advanced-tools');
});

test('PAINEL: sem IDs duplicados (uma única ocorrência de cada id no markup)', () => {
  for (const id of ['id="btn-images-history"', 'id="images-history-panel"', 'id="images-history-content"']) {
    const count = html.split(id).length - 1;
    assert.equal(count, 1, id + ' aparece exatamente 1x no markup');
  }
});

// ===========================================================================
// BOOT / ORDEM DE INICIALIZAÇÃO (regressão do bug real de TDZ, 22/09/2026)
// ------------------------------------------------------------
// initImagesHistoryPanel() é uma IIFE — roda IMEDIATAMENTE (síncrona) na
// carga do script, não só dentro de um clique futuro. `let activeFilter =
// IMAGES_HISTORY_DEFAULT_FILTER` e `let visibleDays = IMAGES_HISTORY_PAGE_SIZE`
// executam nessa hora. const/let não são hoisted com valor (TDZ): se essas
// constantes estivessem declaradas DEPOIS da IIFE no arquivo (como
// aconteceu antes desta correção — no fim do script, junto das funções
// puras), o boot inteiro travava com "Cannot access ... before
// initialization" antes da tela de login aparecer. Funções (buildImagesHistory
// etc.) não têm esse problema porque só são chamadas de dentro de handlers
// de clique — nunca durante a execução síncrona da IIFE — e porque
// function declarations SÃO hoisted com valor.
// ===========================================================================

test('BOOT: IMAGES_HISTORY_FILTERS/DEFAULT_FILTER/PAGE_SIZE são declaradas ANTES da IIFE initImagesHistoryPanel no texto do arquivo (mesma ordem de execução)', () => {
  const iifeStart = html.indexOf('(function initImagesHistoryPanel(){');
  assert.notEqual(iifeStart, -1, 'IIFE não encontrada');
  const filtersIdx = html.indexOf('const IMAGES_HISTORY_FILTERS');
  const defaultIdx = html.indexOf('const IMAGES_HISTORY_DEFAULT_FILTER');
  const pageSizeIdx = html.indexOf('const IMAGES_HISTORY_PAGE_SIZE');
  assert.ok(filtersIdx !== -1 && filtersIdx < iifeStart, 'IMAGES_HISTORY_FILTERS precisa vir antes da IIFE');
  assert.ok(defaultIdx !== -1 && defaultIdx < iifeStart, 'IMAGES_HISTORY_DEFAULT_FILTER precisa vir antes da IIFE');
  assert.ok(pageSizeIdx !== -1 && pageSizeIdx < iifeStart, 'IMAGES_HISTORY_PAGE_SIZE precisa vir antes da IIFE');
});

test('BOOT (dinâmico): rodar a IIFE de verdade, na ordem REAL do arquivo, não lança TDZ (reproduz o bug real se a ordem regredir)', () => {
  const iifeStart = html.indexOf('(function initImagesHistoryPanel(){');
  const constStart = html.indexOf('const IMAGES_HISTORY_FILTERS');
  assert.ok(constStart !== -1 && constStart < iifeStart, 'pré-condição: constantes antes da IIFE');
  const iifeEnd = html.indexOf('})();', iifeStart) + 5;
  assert.ok(iifeEnd > iifeStart + 5, 'fechamento da IIFE não encontrado');
  // Fatia o texto REAL do arquivo, da declaração das constantes até o fim
  // da IIFE — preserva exatamente a ordem/formatação de execução real
  // (diferente de remontar via extractFunction/extractConst, que sempre
  // "acertaria" a ordem independente de onde cada trecho está no arquivo).
  const realOrderSrc = html.slice(constStart, iifeEnd);
  const ctx = {
    document: { getElementById: () => null }, // simula os elementos ausentes (guard `if(!toggleBtn...) return;`)
    console: { warn: () => {}, log: () => {}, error: () => {} }
  };
  vm.createContext(ctx);
  assert.doesNotThrow(() => {
    vm.runInContext(realOrderSrc, ctx, { filename: 'images-history-boot.js' });
  }, 'a IIFE, na ordem real do arquivo, não pode lançar ReferenceError de TDZ');
});
