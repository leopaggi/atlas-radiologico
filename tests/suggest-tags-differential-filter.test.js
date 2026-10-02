'use strict';

// CORREÇÃO DE QUALIDADE — SUGESTÃO DE TAGS COM DIFERENCIAIS: o piloto de
// revisão de 5 lesões (padrão típico + diferenciais principais + pontos-
// chave) revelou que suggestTagsForLesion/suggestClinicalTagsForLesion
// tokenizavam as notas INTEIRAS, inclusive termos citados só pra dizer
// "isso NÃO é esta lesão, é o diferencial X" (ex.: "Colecistite aguda"
// sugeria "crônico"/"focal" só porque apareciam na frase do diferencial
// "vesícula em porcelana"/"adenomiomatose"). Este arquivo testa:
//   1) extractPrimaryLesionText/stripNegatedClauses isoladas (puras);
//   2) os 5 rascunhos REAIS do piloto, ponta a ponta, contra
//      suggestTagsForLesion/suggestClinicalTagsForLesion reais — confirmando
//      que os falsos positivos específicos reportados desaparecem e que os
//      candidatos legítimos (do padrão típico/pontos-chave) continuam;
//   3) que os CONTRATOS das duas funções (assinatura/tipo de retorno) não
//      mudaram, e que notas SEM nenhum rótulo reconhecido continuam
//      exatamente como antes (compatibilidade).
// Mesmo padrão de extração de código-fonte real + vm das demais suítes do
// projeto; nenhuma reimplementação, DATA/TAXONOMY.json/Firestore intocados.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const TAXONOMY_PATH = path.resolve(__dirname, '..', 'TAXONOMY.json');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const REAL_TAXONOMY = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));

function extractBlock(source, openingBrace) {
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
function extractFunction(name) {
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = html.indexOf('{', declaration.index + declaration[0].length);
  return html.slice(declaration.index, openingBrace) + extractBlock(html, openingBrace);
}
function extractConstLine(name) {
  const decl = new RegExp('\\bconst\\s+' + name + '\\s*=').exec(html);
  assert.ok(decl, `const ${name} nao encontrada`);
  const semi = html.indexOf(';', decl.index);
  return html.slice(decl.index, semi + 1);
}
function extractConstSingleLine(name) {
  const m = new RegExp('^const ' + name + ' = .*;$', 'm').exec(html);
  assert.ok(m, `const ${name} (single-line) nao encontrada`);
  return m[0];
}

const DEPS = ['normalizeExternalTitle', 'tokenizeExternalTitle'];
const depsSrc = DEPS.map(n => extractFunction(n)).join('\n');
const stopwordsSrc = extractConstLine('EXTERNAL_IMPORT_STOPWORDS');
const canonVocabSrc = extractFunction('canonicalTagVocabulary');
const diffBlockSrc = extractConstSingleLine('DIFFERENTIAL_BLOCK_HEADING');
const diffSentenceSrc = extractConstSingleLine('DIFFERENTIAL_LABEL_SENTENCE');
const diffInlineSrc = extractConstSingleLine('DIFFERENTIAL_INLINE_MARKER');
const extractPrimarySrc = extractFunction('extractPrimaryLesionText');
const negationMarkerSrc = extractConstSingleLine('NEGATION_MARKER');
const stripNegatedSrc = extractFunction('stripNegatedClauses');
const primaryForSuggestionsSrc = extractFunction('primaryLesionTextForSuggestions');
const radMaxSrc = extractConstLine('SUGGEST_TAGS_MAX');
const radSuggestSrc = extractFunction('suggestTagsForLesion');
const genderVariantSrc = extractFunction('clinicalAdjectiveGenderVariant');
const aliasesSrc = (() => { const m = /const CLINICAL_CONCEPT_ALIASES = \{[\s\S]*?\n\};/.exec(html); assert.ok(m); return m[0]; })();
const clinMaxSrc = extractConstLine('SUGGEST_CLINICAL_TAGS_MAX');
const clinSuggestSrc = extractFunction('suggestClinicalTagsForLesion');

function loadApi() {
  const ctx = vm.createContext({ console });
  vm.runInContext(
    [stopwordsSrc, depsSrc, canonVocabSrc, diffBlockSrc, diffSentenceSrc, diffInlineSrc, extractPrimarySrc,
      negationMarkerSrc, stripNegatedSrc, primaryForSuggestionsSrc, radMaxSrc, radSuggestSrc,
      genderVariantSrc, aliasesSrc, clinMaxSrc, clinSuggestSrc].join('\n') +
    '\nthis.__api = { suggestTagsForLesion, suggestClinicalTagsForLesion, extractPrimaryLesionText, stripNegatedClauses, primaryLesionTextForSuggestions };',
    ctx
  );
  return ctx.__api;
}

/* ===================== 1. extractPrimaryLesionText — puro ===================== */

test('1. sem nenhum rótulo reconhecido: devolve as notas EXATAMENTE como vieram (compatibilidade)', () => {
  const api = loadApi();
  const notes = 'Lesão cística simples, sem septações, sem realce ao contraste.';
  assert.equal(api.extractPrimaryLesionText(notes), notes);
});

test('2. formato já usado no catálogo ("Diferenciais-chave: ...") remove a frase do rótulo até o fim', () => {
  const api = loadApi();
  const notes = 'Padrão: edema vasogênico bilateral.\nDiferenciais-chave: Encefalite aguda, Cavernoma e Leucomalácia periventricular.';
  const out = api.extractPrimaryLesionText(notes);
  assert.ok(!/Diferenciais-chave/.test(out));
  assert.ok(!/Encefalite|Cavernoma|Leucomalácia/.test(out));
  assert.ok(/edema vasogênico bilateral/.test(out));
});

test('3. heading isolada "Diferenciais principais" (bloco até a próxima heading) é removida', () => {
  const api = loadApi();
  const notes = 'Achados típicos aqui.\nDiferenciais principais\nFoo vs bar, baz vs qux.\nPontos-chave\nPonto 1 relevante.';
  const out = api.extractPrimaryLesionText(notes);
  assert.ok(!/Foo vs bar|baz vs qux/.test(out));
  assert.ok(/Achados típicos aqui/.test(out));
  assert.ok(/Ponto 1 relevante/.test(out));
});

test('4. marcador inline "Diferencial com X: ..." (estilo do piloto, sem heading em linha própria) é removido frase a frase', () => {
  const api = loadApi();
  const notes = 'Achado A do padrão típico. Diferencial com X: isso descreve X, não a lesão. Achado B também do padrão típico.';
  const out = api.extractPrimaryLesionText(notes);
  assert.ok(!/isso descreve X/.test(out));
  assert.ok(/Achado A do padrão típico/.test(out));
  assert.ok(/Achado B também do padrão típico/.test(out), 'texto primário APÓS o diferencial inline deve ser preservado');
});

test('5. marcador comparativo inline "o que diferencia de X" remove só até o fim da frase', () => {
  const api = loadApi();
  const notes = 'Difusão sem restrição verdadeira, o que diferencia de isquemia aguda. Contexto típico: hipertensão.';
  const out = api.extractPrimaryLesionText(notes);
  assert.ok(!/isquemia/.test(out));
  assert.ok(/Contexto típico: hipertensão/.test(out));
});

/* ===================== 2. stripNegatedClauses — puro ===================== */

test('6. "sem X" remove o trecho até a próxima pontuação', () => {
  const api = loadApi();
  assert.equal(api.stripNegatedClauses('parede espessada, sem cálculo visível, em paciente grave.'), 'parede espessada, , em paciente grave.');
});

test('7. cobre sem/não/nao/nem/ausência de/ausencia de/negativo para', () => {
  const api = loadApi();
  const cases = [
    ['sem febre.', ''],
    ['não cursa com febre.', ''],
    ['nao cursa com febre.', ''],
    ['nem febre nem calafrio.', ''],
  ];
  cases.forEach(([input, mustNotContain]) => {
    const out = api.stripNegatedClauses(input);
    assert.ok(!/febre/.test(out), 'falhou para: ' + input + ' -> ' + out);
  });
  assert.ok(!/febre/.test(api.stripNegatedClauses('ausência de febre.')));
  assert.ok(!/febre/.test(api.stripNegatedClauses('ausencia de febre.')));
  assert.ok(!/febre/.test(api.stripNegatedClauses('negativo para febre.')));
});

test('8. não remove nada de um texto sem nenhum marcador de negação', () => {
  const api = loadApi();
  const notes = 'Febre, sudorese e perda de peso.';
  assert.equal(api.stripNegatedClauses(notes), notes);
});

/* ===================== 3. CONTRATOS preservados ===================== */

test('9. suggestTagsForLesion mantém assinatura (entry, catalog) e retorna array', () => {
  const api = loadApi();
  assert.match(radSuggestSrc, /function suggestTagsForLesion\(entry,\s*catalog\)/);
  const out = api.suggestTagsForLesion({ name: '', s: '', site: '', notes: '', tags: [] }, []);
  assert.ok(Array.isArray(out));
});

test('10. suggestClinicalTagsForLesion mantém assinatura (entry, taxonomy) e retorna array', () => {
  const api = loadApi();
  assert.match(clinSuggestSrc, /function suggestClinicalTagsForLesion\(entry,\s*taxonomy\)/);
  const out = api.suggestClinicalTagsForLesion({ name: '', s: '', site: '', notes: '', clinicalTags: [] }, REAL_TAXONOMY);
  assert.ok(Array.isArray(out));
});

test('11. nenhuma das duas funções muta entry/catalog/taxonomy (pura, como antes)', () => {
  const api = loadApi();
  const entry = { name: 'X', s: 'Y', site: 'Z', notes: 'Diferencial com W: foo.', tags: ['a'], clinicalTags: [] };
  const catalog = [{ id: '1', tags: ['foo'] }];
  const entrySnap = JSON.parse(JSON.stringify(entry));
  const catalogSnap = JSON.parse(JSON.stringify(catalog));
  const taxoSnap = JSON.parse(JSON.stringify(REAL_TAXONOMY));
  api.suggestTagsForLesion(entry, catalog);
  api.suggestClinicalTagsForLesion(entry, REAL_TAXONOMY);
  assert.deepEqual(entry, entrySnap);
  assert.deepEqual(catalog, catalogSnap);
  assert.deepEqual(REAL_TAXONOMY, taxoSnap);
});

/* ===================== 4. OS 5 RASCUNHOS REAIS DO PILOTO ===================== */

const PILOT_DRAFTS = {
  seed_466: {
    name: 'PRES (síndrome de encefalopatia posterior reversível)',
    s: 'Neurorradiologia',
    site: 'Intra-axial (parênquima)',
    tags: ['edema', 'bilateral', 'hipersinal T2', 'hemorrágico', 'emergência'],
    notes: 'Edema vasogênico cortical/subcortical, tipicamente parieto-occipital, geralmente bilateral e relativamente simétrico. Pode se estender para frontal, cerebelo e tronco em padrões atípicos; focos hemorrágicos ocorrem numa minoria. Na RM, hipersinal em T2/FLAIR com difusão geralmente sem restrição verdadeira (ADC elevado), o que diferencia de isquemia aguda. Contexto típico: crise hipertensiva aguda, eclâmpsia/pré-eclâmpsia, uso de imunossupressores (tacrolimo, ciclosporina) ou quimioterápicos. Tende a ser reversível em dias a semanas com controle da causa. Diferencial com AVC isquêmico bilateral de território posterior: PRES tem difusão facilitada/normal, enquanto o AVC mostra difusão restrita na fase aguda. Diferencial com encefalite: PRES tipicamente poupa os lobos temporais mediais e não cursa com contexto infeccioso/febril. Diferencial com trombose de seio venoso dural: considerar quando o edema não respeita território arterial, especialmente no puerpério ou com hipercoagulabilidade. Clinicamente, cursa com cefaleia, crise convulsiva, alteração visual (podendo incluir cegueira cortical) e, em casos graves, alteração do nível de consciência.'
  },
  seed_595: {
    name: 'Linfoma mediastinal',
    s: 'Tórax',
    site: 'Massa mediastinal',
    tags: ['sólido', 'homogêneo', 'necrótico', 'realce homogêneo', 'multifocal', 'engloba vasos', 'Linfoma do mediastino'],
    notes: 'Massa mediastinal anterior volumosa e lobulada, que engloba vasos mediastinais sem obstruí-los. Densidade/sinal relativamente homogêneos antes do tratamento; necrose e calcificação são raras no linfoma não tratado. Pode haver derrame pleural/pericárdico associado e adenopatias à distância. Contexto: adultos jovens (Hodgkin) ou qualquer idade (não-Hodgkin), frequentemente com sintomas B (febre, sudorese noturna, perda de peso). Diferencial com timoma: massa anterior também, porém mais ovoide/bem delimitada, pode invadir estruturas adjacentes e associa-se a miastenia gravis. Diferencial com timo normal proeminente (pseudotumor tímico): comum em crianças/jovens, mantém formato triangular preservado sem englobamento vascular. Diferencial com sarcoidose: tipicamente linfonodos separados e simétricos em padrão bilateral hilar e paratraqueal em vez de massa conglomerada única.'
  },
  seed_391: {
    name: 'Colecistite aguda',
    s: 'Abdômen Superior',
    site: 'Vesícula biliar / vias biliares',
    tags: ['parede espessa', 'edema', 'aumento de volume', 'cístico', 'emergência'],
    notes: 'Vesícula biliar distendida, parede espessada e edemaciada com aspecto em sanduíche, líquido pericolecístico e cálculo frequentemente impactado no infundíbulo. Sinal de Murphy ultrassonográfico positivo. Contexto: dor em hipocôndrio direito pós-prandial, náuseas e vômitos, podendo haver febre e leucocitose. Diferencial com colecistite alitiásica: mesmo quadro de parede espessada e distensão, porém sem cálculo visível, em paciente grave ou em jejum prolongado. Diferencial com adenomiomatose da vesícula biliar: espessamento parietal focal com pequenos cistos intramurais, sem quadro agudo doloroso nem sinal de Murphy. Diferencial com vesícula em porcelana: parede calcificada difusa, quadro crônico e geralmente achado incidental, sem dor aguda associada.'
  },
  seed_552: {
    name: 'Bursite trocantérica',
    s: 'Musculoesquelético',
    site: 'Quadril',
    tags: ['cístico', 'edema', 'hipersinal T2/STIR', 'hiperemia ao Doppler', 'síndrome dolorosa trocantérica maior', 'conteúdo líquido', 'espessamento parietal', 'inflamatório'],
    notes: 'Distensão da bursa trocantérica maior por conteúdo líquido, com hipersinal em sequências sensíveis a líquido na RM; pode haver espessamento parietal e hiperemia ao Doppler quando há inflamação ativa. Localiza-se superficial ao grande trocânter, profunda ao trato iliotibial e glúteo máximo. Contexto: síndrome dolorosa trocantérica maior, com dor lateral do quadril, pior ao deitar sobre o lado afetado. Diferencial com tendinopatia ou rotura do glúteo médio/mínimo: alteração predominantemente intratendínea, com espessamento e sinal intermediário a alto no próprio tendão, frequentemente coexistente com a bursite. Diferencial com síndrome do trato iliotibial: dor relacionada à atividade, com espessamento e edema na banda iliotibial distal, sem a coleção bursal característica. Diferencial com osteoartrose do quadril ou radiculopatia lombar: dor referida pode mimetizar o quadro, mas a bursa e os tendões permanecem normais à imagem.'
  },
  seed_1043: {
    name: 'Malrotação intestinal com volvo',
    s: 'Abdômen Superior',
    site: 'Intestino / cólon',
    tags: ['idade pediátrica', 'emergência', 'sinal do saca-rolhas'],
    notes: 'Inversão da relação normal entre a artéria mesentérica superior e a veia mesentérica superior, com sinal do saca-rolhas do mesentério torcido ao redor do pedículo vascular ao Doppler. No estudo contrastado, posição anômala da junção duodenojejunal, sem o C duodenal normal. Contexto: emergência cirúrgica em recém-nascido ou lactente com vômitos biliosos, idade pediátrica. Diferencial com atresia duodenal: também causa vômitos biliosos no neonato, porém com padrão de dupla bolha ao raio-X simples, sem o sinal do saca-rolhas nem inversão vascular. Diferencial com enterocolite necrosante: ocorre em prematuros, com pneumatose intestinal e gás porta, em contexto de sepse e instabilidade, sem a inversão arteriovenosa característica da malrotação. Diferencial com doença de Hirschsprung: apresenta-se com distensão abdominal progressiva e atraso na eliminação de mecônio, sem vômito bilioso agudo nem sinal do saca-rolhas.'
  }
};

// Vocabulário radiológico mínimo (mesma lógica da produção: o vocabulário de
// suggestTagsForLesion é a UNIÃO das tags já usadas em outras lesões do
// catálogo). Inclui tanto as tags que DEVEM continuar elegíveis (padrão
// típico) quanto as que DEVEM ser filtradas (só aparecem nos diferenciais) —
// de propósito, pra provar que a ausência destas últimas é efeito do filtro,
// não apenas de não estarem no vocabulário. Equivalente ao que viria do
// catálogo real de 1210 lesões, sem precisar carregá-lo como fixture aqui.
const MOCK_CATALOG = [
  { id: 'm1', tags: ['lobulada', 'volumosa', 'derrame pleural', 'pedículo vascular', 'trato iliotibial', 'hipersinal T2/FLAIR'] },
  { id: 'm2', tags: ['restrição à difusão', 'restrição de difusão', 'infeccioso', 'trombose', 'isquemia', 'isquemia aguda', 'território arterial'] },
  { id: 'm3', tags: ['bilateral', 'vascular', 'focal', 'crônico', 'incidental', 'espessamento focal', 'difusa'] },
  { id: 'm4', tags: ['pneumatose', 'gás', 'instabilidade', 'progressiva'] }
];

function suggestFor(api, id, over) {
  const d = Object.assign({}, PILOT_DRAFTS[id], over);
  const entry = { name: d.name, s: d.s, site: d.site, notes: d.notes, tags: d.tags, clinicalTags: [] };
  return {
    rad: api.suggestTagsForLesion(entry, MOCK_CATALOG),
    clin: api.suggestClinicalTagsForLesion(entry, REAL_TAXONOMY)
  };
}

test('12. PRES: não sugere nenhum termo oriundo só dos diferenciais (restrição à/de difusão, infeccioso, trombose, isquemia, território arterial)', () => {
  const api = loadApi();
  const { rad, clin } = suggestFor(api, 'seed_466');
  const forbidden = ['restrição à difusão', 'restrição de difusão', 'infeccioso', 'trombose', 'isquemia', 'isquemia aguda', 'território arterial'];
  forbidden.forEach(t => {
    assert.ok(!rad.includes(t), 'não deveria sugerir (radiológica): ' + t + ' | obtidas: ' + rad.join(', '));
    assert.ok(!clin.includes(t), 'não deveria sugerir (clínica): ' + t + ' | obtidas: ' + clin.join(', '));
  });
});

test('13. PRES: candidatos legítimos do padrão típico/contexto clínico continuam aparecendo (Cefaleia, Alteração visual)', () => {
  const api = loadApi();
  const { clin } = suggestFor(api, 'seed_466');
  assert.ok(clin.includes('Cefaleia'));
  assert.ok(clin.includes('Alteração visual'));
});

test('14. Linfoma mediastinal: não sugere bilateral/vascular (só aparecem nos diferenciais de sarcoidose/pseudotumor tímico)', () => {
  const api = loadApi();
  const { rad, clin } = suggestFor(api, 'seed_595');
  assert.ok(!rad.includes('bilateral'));
  assert.ok(!rad.includes('vascular'));
  assert.ok(!clin.includes('bilateral'));
});

test('15. Linfoma mediastinal: candidatos legítimos do padrão típico continuam (lobulada, volumosa, derrame pleural) e sintomas B (Febre, Sudorese, Perda de peso)', () => {
  const api = loadApi();
  const { rad, clin } = suggestFor(api, 'seed_595');
  assert.ok(rad.includes('lobulada'));
  assert.ok(rad.includes('volumosa'));
  assert.ok(rad.includes('derrame pleural'));
  assert.ok(clin.includes('Febre'));
  assert.ok(clin.includes('Sudorese'));
  assert.ok(clin.includes('Perda de peso'));
});

test('16. Colecistite aguda: não sugere focal/crônico/incidental (só descrevem os diferenciais de adenomiomatose/vesícula em porcelana)', () => {
  const api = loadApi();
  const { rad, clin } = suggestFor(api, 'seed_391');
  ['focal', 'crônico', 'incidental', 'espessamento focal', 'difusa'].forEach(t => {
    assert.ok(!rad.includes(t), t + ' não deveria ser sugerida (radiológica)');
    assert.ok(!clin.includes(t), t + ' não deveria ser sugerida (clínica)');
  });
});

test('17. Colecistite aguda: candidatos legítimos do contexto clínico continuam (Febre, Vômitos, hipocôndrio direito)', () => {
  const api = loadApi();
  const { clin } = suggestFor(api, 'seed_391');
  assert.ok(clin.includes('Febre'));
  assert.ok(clin.includes('Vômitos'));
  assert.ok(clin.includes('hipocôndrio direito'));
});

test('18. Malrotação com volvo: não sugere progressiva/pneumatose/gás/instabilidade (só descrevem Hirschsprung/ECN nos diferenciais)', () => {
  const api = loadApi();
  const { rad, clin } = suggestFor(api, 'seed_1043');
  ['pneumatose', 'gás', 'instabilidade'].forEach(t => assert.ok(!rad.includes(t), t + ' não deveria ser sugerida (radiológica)'));
  assert.ok(!clin.includes('progressiva'));
});

test('19. Malrotação com volvo: candidato legítimo do padrão típico continua (pedículo vascular) e Vômitos (contexto clínico próprio)', () => {
  const api = loadApi();
  const { rad, clin } = suggestFor(api, 'seed_1043');
  assert.ok(rad.includes('pedículo vascular'));
  assert.ok(clin.includes('Vômitos'));
});

test('20. Bursite trocantérica: não sugere clinicalTags vindas só do diferencial de ITB/radiculopatia (ex.: "distal")', () => {
  const api = loadApi();
  const { clin } = suggestFor(api, 'seed_552');
  assert.ok(!clin.includes('distal'));
});

test('21. Bursite trocantérica: termos que também aparecem no padrão típico (não só no diferencial) continuam elegíveis, ex. "trato iliotibial" (anatomia da própria bursite)', () => {
  const api = loadApi();
  const { rad } = suggestFor(api, 'seed_552');
  // "trato iliotibial" aparece tanto na anatomia da bursite (padrão típico)
  // quanto no diferencial do ITB — não é "vindo APENAS do diferencial", então
  // continuar elegível está correto (não é o caso proibido pela regra).
  assert.ok(rad.includes('trato iliotibial'));
});

/* ===================== 5. zero persistência / zero efeito colateral ===================== */

test('22. extractPrimaryLesionText/stripNegatedClauses/primaryLesionTextForSuggestions nunca chamam saveData/Firestore/localStorage', () => {
  [extractPrimarySrc, stripNegatedSrc, primaryForSuggestionsSrc].forEach(region => {
    assert.ok(!/saveData\s*\(/.test(region));
    assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
  });
});

test('23. nada aqui toca DATA/TAXONOMY.json/clinicalCases/attributes', () => {
  [extractPrimarySrc, stripNegatedSrc, primaryForSuggestionsSrc, radSuggestSrc, clinSuggestSrc].forEach(region => {
    assert.ok(!/\bDATA\s*=(?!=)/.test(region));
    assert.ok(!/\.clinicalCases\s*=/.test(region));
    assert.ok(!/\.attributes\s*=/.test(region));
  });
});
