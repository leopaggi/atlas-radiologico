'use strict';

// CLINICAL TAGS V1 — entry.clinicalTags = [] (opcional, array de strings,
// mesmo formato/mecânica de entry.tags, mas separado e nunca persistido
// automaticamente). Vocabulário do browser vem EXCLUSIVAMENTE dos conceitos
// domain==='clinical' de TAXONOMY.json (13 grupos / 99 conceitos já
// existentes/aprovados, nunca expostos em UI antes). suggestClinicalTagsForLesion
// é uma função NOVA e SEPARADA — suggestTagsForLesion (radiológica) mantém o
// próprio contrato intacto. Mesmo padrão de extração de código-fonte real +
// vm das demais suítes do projeto — nenhuma reimplementação.

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
function extractFunction(name, src) {
  const source = src || html;
  const declaration = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `Funcao ${name} nao encontrada`);
  const openingBrace = source.indexOf('{', declaration.index + declaration[0].length);
  return source.slice(declaration.index, openingBrace) + extractBlock(source, openingBrace);
}
function extractConst(name) {
  const decl = new RegExp('\\bconst\\s+' + name + '\\s*=').exec(html);
  assert.ok(decl, `const ${name} nao encontrada`);
  const semi = html.indexOf(';', decl.index);
  return html.slice(decl.index, semi + 1);
}
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\n])\/\/[^\n]*/gm, '$1');
}

/* ===================== suggestClinicalTagsForLesion — puro ===================== */

const DEPS = ['normalizeExternalTitle', 'tokenizeExternalTitle'];
const depsSrc = DEPS.map(n => extractFunction(n)).join('\n');
const stopwordsSrc = extractConst('EXTERNAL_IMPORT_STOPWORDS');
const genderVariantSrc = extractFunction('clinicalAdjectiveGenderVariant');
const aliasesSrc = (() => { const m = /const CLINICAL_CONCEPT_ALIASES = \{[\s\S]*?\n\};/.exec(html); assert.ok(m); return m[0]; })();
const sugSrc = extractFunction('suggestClinicalTagsForLesion');
const radSrc = extractFunction('suggestTagsForLesion');
const canonVocabSrc = extractFunction('canonicalTagVocabulary');
const maxConstSrc = (() => {
  const decl = /const SUGGEST_CLINICAL_TAGS_MAX\s*=\s*\d+;/.exec(html);
  assert.ok(decl);
  return decl[0];
})();
const radMaxConstSrc = (() => {
  const decl = /const SUGGEST_TAGS_MAX\s*=\s*\d+;/.exec(html);
  assert.ok(decl);
  return decl[0];
})();

function loadApi() {
  const ctx = vm.createContext({ console });
  vm.runInContext(
    stopwordsSrc + '\n' + depsSrc + '\n' + genderVariantSrc + '\n' + aliasesSrc + '\n' + maxConstSrc + '\n' + sugSrc + '\n' +
    radMaxConstSrc + '\n' + canonVocabSrc + '\n' + radSrc + '\n' +
    'this.__api = { suggestClinicalTagsForLesion, suggestTagsForLesion };',
    ctx
  );
  return ctx.__api;
}

function mockTaxonomy() {
  return {
    groups: [
      { id: 'clinical.symptoms', label: 'Sintomas', domain: 'clinical', exclusive: false, sortOrder: 10 },
      { id: 'clinical.abdominalPainLocation', label: 'Localização da dor abdominal', domain: 'clinical', exclusive: false, sortOrder: 30 },
      { id: 'radiologic.composition', label: 'Composição', domain: 'radiologic', exclusive: false, sortOrder: 10 }
    ],
    concepts: [
      { id: 'clin_symptom_fever', label: 'Febre', domain: 'clinical', group: 'clinical.symptoms', synonyms: [] },
      { id: 'clin_symptom_abd_pain', label: 'Dor abdominal', domain: 'clinical', group: 'clinical.symptoms', synonyms: ['dor na barriga'] },
      { id: 'clin_abd_loc_fid', label: 'FID', domain: 'clinical', group: 'clinical.abdominalPainLocation', synonyms: ['fossa ilíaca direita'] },
      { id: 'rad_composition_cystic', label: 'Cística', domain: 'radiologic', group: 'radiologic.composition', synonyms: [] }
    ]
  };
}

test('1. suggestClinicalTagsForLesion: sugere a partir do texto (nome/seção/sítio/notas), usando só domain==="clinical"', () => {
  const api = loadApi();
  const entry = { name: 'Apendicite', s: 'Abdômen', site: 'Apêndice', notes: 'dor abdominal e febre há 2 dias', clinicalTags: [] };
  const out = api.suggestClinicalTagsForLesion(entry, mockTaxonomy());
  assert.ok(out.includes('Febre'));
  assert.ok(out.includes('Dor abdominal'));
  assert.ok(!out.includes('Cística'), 'nunca sugere conceito radiológico');
});

test('2. suggestClinicalTagsForLesion: considera sinônimos, não só o rótulo', () => {
  const api = loadApi();
  const entry = { name: '', s: '', site: '', notes: 'paciente com dor na fossa ilíaca direita', clinicalTags: [] };
  const out = api.suggestClinicalTagsForLesion(entry, mockTaxonomy());
  assert.ok(out.includes('FID'));
});

test('3. suggestClinicalTagsForLesion: nunca sugere um clinicalTag já presente na lesão', () => {
  const api = loadApi();
  const entry = { name: 'Apendicite', s: '', site: '', notes: 'dor abdominal e febre', clinicalTags: ['Febre'] };
  const out = api.suggestClinicalTagsForLesion(entry, mockTaxonomy());
  assert.ok(!out.includes('Febre'));
  assert.ok(out.includes('Dor abdominal'));
});

test('4. suggestClinicalTagsForLesion: nunca duplica a mesma sugestão (rótulo normalizado único)', () => {
  const api = loadApi();
  const entry = { name: '', s: '', site: '', notes: 'febre febre febre', clinicalTags: [] };
  const out = api.suggestClinicalTagsForLesion(entry, mockTaxonomy());
  const count = out.filter(t => t === 'Febre').length;
  assert.equal(count, 1);
});

test('5. suggestClinicalTagsForLesion: nunca muta entry nem taxonomy (pura)', () => {
  const api = loadApi();
  const entry = { name: 'Apendicite', s: 'Abdômen', site: 'Apêndice', notes: 'febre', clinicalTags: [] };
  const taxonomy = mockTaxonomy();
  const entrySnapshot = JSON.parse(JSON.stringify(entry));
  const taxonomySnapshot = JSON.parse(JSON.stringify(taxonomy));
  api.suggestClinicalTagsForLesion(entry, taxonomy);
  assert.deepEqual(entry, entrySnapshot);
  assert.deepEqual(taxonomy, taxonomySnapshot);
});

test('6. suggestClinicalTagsForLesion: sem texto nenhum -> nenhuma sugestão (nunca "inventa")', () => {
  const api = loadApi();
  const out = api.suggestClinicalTagsForLesion({ name: '', s: '', site: '', notes: '', clinicalTags: [] }, mockTaxonomy());
  assert.equal(out.length, 0);
});

test('7. suggestClinicalTagsForLesion: sem taxonomy (TAXONOMY indisponível) -> [] sem lançar erro', () => {
  const api = loadApi();
  assert.doesNotThrow(() => {
    const out = api.suggestClinicalTagsForLesion({ name: 'Febre e dor abdominal', s: '', site: '', notes: '', clinicalTags: [] }, null);
    assert.equal(out.length, 0);
  });
});

test('8. suggestClinicalTagsForLesion: nunca persiste (região sem saveData/Firestore/localStorage/DATA)', () => {
  const region = stripJsComments(sugSrc);
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
  assert.ok(!/\bDATA\b/.test(region));
});

test('9. suggestTagsForLesion (radiológica) mantém o contrato: vocabulário continua vindo do catálogo (tags), não da taxonomia clínica', () => {
  const api = loadApi();
  const catalog = [{ id: '1', tags: ['Cística', 'Sólida'] }];
  const out = api.suggestTagsForLesion({ name: 'Lesão cística do fígado', s: '', site: '', notes: '', tags: [] }, catalog);
  assert.ok(out.includes('Cística'));
  assert.ok(!out.includes('Febre'));
});

test('10. assinaturas: suggestClinicalTagsForLesion é função separada de suggestTagsForLesion (não reaproveita o mesmo corpo)', () => {
  assert.notEqual(sugSrc.trim(), radSrc.trim());
  assert.match(sugSrc, /function suggestClinicalTagsForLesion\(entry,\s*taxonomy\)/);
  assert.match(radSrc, /function suggestTagsForLesion\(entry,\s*catalog\)/);
});

/* ===================== vocabulário real (TAXONOMY.json) ===================== */

test('11. TAXONOMY.json real: domain "clinical" tem 13 grupos / 99 conceitos, nenhum conceito radiológico se mistura', () => {
  const clinicalGroups = REAL_TAXONOMY.groups.filter(g => g.domain === 'clinical');
  const clinicalConcepts = REAL_TAXONOMY.concepts.filter(c => c.domain === 'clinical');
  assert.equal(clinicalGroups.length, 13);
  assert.equal(clinicalConcepts.length, 99);
  assert.ok(clinicalConcepts.every(c => c.group.startsWith('clinical.')));
});

test('12. 3 exemplos reais (dor abdominal / dor torácica / apresentação neurológica) — sugestão + grupo/conceito de origem', () => {
  const api = loadApi();
  const examples = [
    { label: 'A) dor abdominal', entry: { name: 'Apendicite aguda', s: 'Abdômen', site: 'Apêndice', notes: 'dor abdominal há 2 dias, febre, localizada em FID', clinicalTags: [] } },
    { label: 'B) dor torácica', entry: { name: 'Embolia pulmonar', s: 'Tórax', site: 'Artéria pulmonar', notes: 'dor torácica pleurítica, início súbito, dispneia', clinicalTags: [] } },
    { label: 'C) apresentação neurológica', entry: { name: 'AVC isquêmico', s: 'Neurorradiologia', site: 'Encéfalo', notes: 'cefaleia, parestesia e disartria de início súbito', clinicalTags: [] } }
  ];
  examples.forEach(({ label, entry }) => {
    const out = api.suggestClinicalTagsForLesion(entry, REAL_TAXONOMY);
    assert.ok(out.length > 0, label + ': deveria sugerir ao menos uma tag clínica real');
    out.forEach(labelSug => {
      const concept = REAL_TAXONOMY.concepts.find(c => c.domain === 'clinical' && c.label === labelSug);
      assert.ok(concept, label + ': "' + labelSug + '" deveria existir em TAXONOMY.json (domain clinical)');
    });
  });
});

/* ===================== openForm — wiring do formulário ===================== */

const openFormSrc = extractFunction('openForm');

test('13. openForm: clinicalTags inicia a partir de existing.clinicalTags (array vazio se ausente/novo)', () => {
  assert.match(openFormSrc, /let clinicalTags = existing && Array\.isArray\(existing\.clinicalTags\) \? \[\.\.\.existing\.clinicalTags\] : \[\];/);
});

test('14. openForm: seção "Apresentação clínica" existe, colapsável e separada das tags radiológicas', () => {
  assert.match(openFormSrc, /id="clinical-toggle"/);
  assert.match(openFormSrc, /Apresentação clínica/);
  assert.match(openFormSrc, /id="chip-wrap-clinical"/);
  assert.match(openFormSrc, /id="f-clinical-tag-input"/);
  // a seção clínica vem DEPOIS do bloco de tags radiológicas (chip-wrap)
  const radIdx = openFormSrc.indexOf('id="chip-wrap"');
  const clinIdx = openFormSrc.indexOf('id="clinical-toggle"');
  assert.ok(radIdx > 0 && clinIdx > radIdx);
});

test('15. openForm: browser de vocabulário filtra EXCLUSIVAMENTE domain==="clinical" (nenhuma taxonomia paralela)', () => {
  assert.match(openFormSrc, /g\.domain===['"]clinical['"]/);
  assert.match(openFormSrc, /taxoBuildIndices\(taxonomy\)/);
});

test('16. openForm: addClinicalTag nunca adiciona duplicado (mesma guarda de addTag)', () => {
  assert.match(openFormSrc, /function addClinicalTag\(t\)\{[\s\S]{0,200}?if\(t && !clinicalTags\.includes\(t\)\)/);
});

test('17. openForm: Sugestões clínicas funcionam tanto em lesão NOVA quanto em EDIÇÃO (correção de UX — sem restrição "só nova")', () => {
  const start = openFormSrc.indexOf('function renderClinicalSmartSuggestions(){');
  assert.ok(start >= 0);
  const fn = extractBlock(openFormSrc, openFormSrc.indexOf('{', start));
  assert.doesNotMatch(fn, /if\(existing/, 'não deveria mais checar `existing` pra decidir se mostra sugestões');
  assert.match(fn, /if\(!clinicalTaxonomyData\)/);
});

test('17b. openForm: quando não há nenhuma sugestão, mostra mensagem (nunca esconde a seção em silêncio)', () => {
  assert.match(openFormSrc, /Nenhuma sugestão clínica detectada na descrição atual\./);
  const start = openFormSrc.indexOf('function renderClinicalSmartSuggestions(){');
  const fn = extractBlock(openFormSrc, openFormSrc.indexOf('{', start));
  assert.match(fn, /emptyEl\.hidden = false/);
});

test('17c. openForm: digitar (input) reagenda a análise com debounce curto; blur e o botão "Analisar descrição" recalculam na hora', () => {
  assert.match(openFormSrc, /function scheduleClinicalAnalyze\(\)\{[\s\S]{0,200}?setTimeout\([\s\S]{0,100}?,\s*300\)/);
  assert.match(openFormSrc, /el\.addEventListener\('input', scheduleClinicalAnalyze\)/);
  assert.match(openFormSrc, /el\.addEventListener\('blur', renderClinicalSmartSuggestions\)/);
  assert.match(openFormSrc, /id="clinical-analyze-btn"/);
  assert.match(openFormSrc, /clinicalAnalyzeBtn\.onclick = \(\)=>\{[\s\S]{0,150}?renderClinicalSmartSuggestions\(\);/);
});

test('18. openForm: clique em sugestão clínica chama addClinicalTag (nunca grava direto)', () => {
  const start = openFormSrc.indexOf('function renderClinicalVocabulary(){');
  assert.ok(start >= 0);
  const fn = extractBlock(openFormSrc, openFormSrc.indexOf('{', start));
  assert.match(fn, /addClinicalTag\(c\.label\)/);
});

test('19. openForm: a região clínica nunca chama saveData/Firestore/localStorage (adiciona só ao estado local do form)', () => {
  const start = openFormSrc.indexOf("const chipWrapClinical = document.getElementById('chip-wrap-clinical');");
  const end = openFormSrc.indexOf('/* --- imagens: Cloudinary por padrão', start);
  assert.ok(start >= 0 && end > start);
  const region = stripJsComments(openFormSrc.slice(start, end));
  assert.ok(!/saveData\s*\(/.test(region));
  assert.ok(!/\.collection\(|firebase\.firestore|fbDb\./.test(region));
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(region));
});

test('20. openForm: carregamento da taxonomia é best-effort (catch) — TAXONOMY indisponível não quebra o formulário', () => {
  assert.match(openFormSrc, /loadTaxonomy\(\)\.then\([\s\S]{0,200}?\)\.catch\(/);
});

/* ===================== persistência (handler de Salvar) ===================== */

test('21. Salvar (lesão existente): clinicalTags segue o padrão "se tiver length grava, senão delete" (igual altPlacements/clinicalCases)', () => {
  assert.match(html, /if\(clinicalTags\.length\) t\.clinicalTags = JSON\.parse\(JSON\.stringify\(clinicalTags\)\); else delete t\.clinicalTags;/);
});

test('22. Salvar (rede de segurança anti-duplicata): clinicalTags também é gravado/removido no registro existente', () => {
  assert.match(html, /if\(clinicalTags\.length\) target\.clinicalTags = JSON\.parse\(JSON\.stringify\(clinicalTags\)\); else delete target\.clinicalTags;/);
});

test('23. Salvar (lesão nova): newEntry só ganha clinicalTags quando o usuário adicionou algo (ausência continua válida)', () => {
  assert.match(html, /if\(clinicalTags\.length\) newEntry\.clinicalTags = JSON\.parse\(JSON\.stringify\(clinicalTags\)\);/);
  // garante que NÃO existe um "else" criando clinicalTags:[] vazio em newEntry
  const m = /if\(clinicalTags\.length\) newEntry\.clinicalTags = JSON\.parse\(JSON\.stringify\(clinicalTags\)\);(?!\s*else)/.exec(html);
  assert.ok(m, 'newEntry não deveria ganhar clinicalTags:[] quando a lesão nova não tem nenhuma tag clínica');
});

test('24. Salvar: clinicalTags nunca é persistido fora dos 3 pontos esperados (sem saveData extra/segunda escrita)', () => {
  const start = html.indexOf("document.getElementById('f-save').onclick = async ()=>{");
  const end = html.indexOf('// A partir daqui, a tela SEMPRE fecha ao final', start);
  assert.ok(start >= 0 && end > start);
  const region = html.slice(start, end);
  const linesWithClinicalTags = region.split(/\r?\n/).filter(l => /\bclinicalTags\b/.test(l));
  // exatamente 3 linhas: existing-edit (t.), rede de segurança anti-duplicata (target.), lesão nova (newEntry.)
  assert.equal(linesWithClinicalTags.length, 3, 'clinicalTags só deveria ser escrito nos 3 pontos esperados do handler de Salvar');
  assert.ok(linesWithClinicalTags.some(l => /\bt\.clinicalTags\b/.test(l)));
  assert.ok(linesWithClinicalTags.some(l => /\btarget\.clinicalTags\b/.test(l)));
  assert.ok(linesWithClinicalTags.some(l => /\bnewEntry\.clinicalTags\b/.test(l)));
});

/* ===================== detalhe da lesão (chips próximos, sem bloco novo) ===================== */

const DETAIL_START = '<div class="detail-tags">';
const detailTagsIdx = html.indexOf(DETAIL_START);
assert.ok(detailTagsIdx >= 0, 'detail-tags não encontrado');
const detailTagsCloseIdx = html.indexOf('</div>', detailTagsIdx);
const detailTagsLineFull = html.slice(detailTagsIdx, detailTagsCloseIdx + '</div>'.length);
// expressão dentro do template (entre o <div class="detail-tags"> e o </div> final)
const detailExprInner = detailTagsLineFull.slice(DETAIL_START.length, detailTagsLineFull.length - '</div>'.length);

function renderDetailTagsHtml(e) {
  // avalia a EXPRESSÃO REAL extraída de index.html (não uma reimplementação).
  const fn = new Function('e', 'return `' + detailExprInner + '`;');
  return fn(e);
}

test('25. Detalhe: entry sem clinicalTags (ausente) -> renderiza normalmente, sem erro, sem chip clínico', () => {
  const html2 = renderDetailTagsHtml({ tags: ['Cística'] });
  assert.ok(html2.includes('mini-tag match'));
  assert.ok(!html2.includes('mini-tag clinical'));
});

test('26. Detalhe: entry.clinicalTags = [] -> nenhum chip clínico renderizado', () => {
  const html2 = renderDetailTagsHtml({ tags: ['Cística'], clinicalTags: [] });
  assert.ok(!html2.includes('mini-tag clinical'));
});

test('27. Detalhe: entry.clinicalTags com valores -> chips clínicos aparecem, próximos das tags radiológicas (mesma div/linha)', () => {
  const html2 = renderDetailTagsHtml({ tags: ['Cística'], clinicalTags: ['Febre', 'Dor abdominal'] });
  assert.ok(html2.includes('<span class="mini-tag match">Cística</span>'));
  assert.ok(html2.includes('<span class="mini-tag clinical">Febre</span>'));
  assert.ok(html2.includes('<span class="mini-tag clinical">Dor abdominal</span>'));
});

test('28. Detalhe: chips clínicos ficam na MESMA div (.detail-tags) — nenhum card/bloco vertical novo', () => {
  assert.equal((detailTagsLineFull.match(/<div/g) || []).length, 1, 'não deveria haver uma segunda <div> aninhada pra tags clínicas');
});

/* ===================== CSS ===================== */

test('29. CSS: .mini-tag.clinical existe (chip da lesão), reaproveitando --amber (sem cor nova)', () => {
  assert.match(html, /\.mini-tag\.clinical\{[^}]*var\(--amber/);
});

test('30. CSS: .removable-tag.clinical-chip existe (chip removível do formulário), reaproveitando --amber', () => {
  assert.match(html, /\.removable-tag\.clinical-chip\{[^}]*var\(--amber/);
});

/* ===================== zero impacto em outras áreas (compatibilidade) ===================== */

test('31. zero impacto: attributes/clinicalCases continuam com a própria lógica, sem nenhuma referência cruzada a clinicalTags', () => {
  const attrFn = html.match(/function\s+applyDidacticDraftsToNewEntry\s*\([^)]*\)\s*\{/);
  assert.ok(attrFn);
  const fnSrc = extractFunction('applyDidacticDraftsToNewEntry');
  assert.ok(!/clinicalTags/.test(fnSrc), 'applyDidacticDraftsToNewEntry (clinicalCases/signs/schemes) não deveria tocar em clinicalTags');
});

test('32. zero impacto: TAXONOMY.json não foi alterado (ainda 13 grupos clinical / 99 conceitos, igual à auditoria aprovada)', () => {
  const clinicalGroups = REAL_TAXONOMY.groups.filter(g => g.domain === 'clinical');
  const clinicalConcepts = REAL_TAXONOMY.concepts.filter(c => c.domain === 'clinical');
  assert.equal(clinicalGroups.length, 13);
  assert.equal(clinicalConcepts.length, 99);
});

/* =========================================================================
   CORREÇÃO DE UX — "SUGESTÕES CLÍNICAS DETECTADAS" funciona em nova E em
   edição, com debounce de input + botão manual "Analisar descrição".
   Harness de DOM fake mínimo (mesmo padrão de outras suítes do projeto:
   extrai e executa o bloco REAL de wiring da seção clínica dentro de
   openForm, não uma reimplementação) + a função real suggestClinicalTagsForLesion.
   ========================================================================= */

const CLINICAL_WIRING_START = "const chipWrapClinical = document.getElementById('chip-wrap-clinical');";
const CLINICAL_WIRING_END = '/* --- imagens: Cloudinary por padrão';
const clinicalWiringBlock = (() => {
  const s = html.indexOf(CLINICAL_WIRING_START);
  const e = html.indexOf(CLINICAL_WIRING_END, s);
  assert.ok(s >= 0 && e > s, 'bloco de wiring clínico não encontrado');
  return html.slice(s, e);
})();

function makeFakeEl(tag) {
  const el = {
    tag, className: '', _html: '', textContent: '', hidden: false, _removed: false,
    _children: [], value: '', _onclick: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._children = []; },
    appendChild(c) { this._children.push(c); },
    insertBefore(c) { this._children.push(c); },
    remove() { this._removed = true; },
    setAttribute() {},
    querySelectorAll(sel) { return this._children.filter(c => !c._removed && (sel !== '.removable-tag' || c.className.includes('removable-tag'))); },
    querySelector(sel) { if (sel === 'button') { if (!this._btn) this._btn = makeFakeEl('button'); return this._btn; } return null; },
    addEventListener(type, fn) { this['_on' + type] = this['_on' + type] || []; this['_on' + type].push(fn); },
    set onclick(fn) { this._onclick = fn; }, get onclick() { return this._onclick; }
  };
  return el;
}

// Monta e "roda" o formulário clínico real (extraído de index.html) com um
// `existing` (lesão em edição) OU null (lesão nova) — devolve handles para
// disputar o cenário real do usuário: digitar na descrição, clicar no botão
// "Analisar descrição", ler as sugestões renderizadas e os chips adicionados.
function driveClinicalForm({ existing, name, notes } = {}) {
  const byId = new Map();
  const elFor = (id) => { if (!byId.has(id)) byId.set(id, makeFakeEl('div')); return byId.get(id); };
  ['chip-wrap-clinical', 'clinical-suggest-row', 'suggest-clinical-smart-wrap', 'suggest-clinical-smart-row',
    'suggest-clinical-smart-empty', 'f-name', 'f-section', 'f-site', 'f-notes', 'clinical-toggle', 'clinical-body',
    'clinical-analyze-btn'].forEach(elFor);
  byId.set('f-clinical-tag-input', makeFakeEl('input'));
  elFor('f-name').value = name || '';
  elFor('f-notes').value = notes || '';

  let clinicalTags = (existing && Array.isArray(existing.clinicalTags)) ? [...existing.clinicalTags] : [];
  const timers = [];
  const sandbox = {
    document: { getElementById: (id) => byId.has(id) ? byId.get(id) : elFor(id), createElement: (tag) => makeFakeEl(tag) },
    console,
    existing: existing || null,
    get clinicalTags() { return clinicalTags; }, set clinicalTags(v) { clinicalTags = v; },
    taxoBuildIndices,
    loadTaxonomy: () => Promise.resolve(REAL_TAXONOMY),
    suggestClinicalTagsForLesion: realSuggestClinicalTagsForLesion,
    clinicalToggleLabel: (n, open) => (open ? 'open' : 'closed') + ':' + n,
    setTimeout: (fn) => { const id = timers.length; timers.push(fn); return id; },
    clearTimeout: (id) => { if (timers[id]) timers[id] = null; }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(clinicalWiringBlock + "\nthis.__done = true;", ctx);
  return {
    byId,
    getClinicalTags: () => clinicalTags,
    typeNotes: (text) => {
      elFor('f-notes').value = text;
      (elFor('f-notes')._oninput || []).forEach(fn => fn());
    },
    flushDebounce: () => { timers.forEach(fn => { if (fn) fn(); }); },
    clickAnalyze: () => { byId.get('clinical-analyze-btn')._onclick(); },
    clickSuggestionChip: (label) => {
      const row = byId.get('suggest-clinical-smart-row');
      const chip = row._children.find(c => c.textContent === '+ ' + label);
      assert.ok(chip, 'chip de sugestão "' + label + '" não foi renderizado');
      chip.onclick();
    },
    suggestedLabels: () => byId.get('suggest-clinical-smart-row')._children.map(c => c.textContent.replace(/^\+ /, '')),
    emptyMessageVisible: () => byId.get('suggest-clinical-smart-empty').hidden === false,
    waitTaxonomyLoaded: () => new Promise(r => setImmediate(r))
  };
}

// Dependências reais extraídas pra montar suggestClinicalTagsForLesion fora
// do próprio bloco de wiring (ele é chamado DE DENTRO do bloco via sandbox).
// genderVariantSrc/aliasesSrc já foram extraídos mais acima (loadApi()).
const taxoBuildIndicesSrc = extractFunction('taxoBuildIndices');
const taxoNormalizeTextSrc = extractFunction('taxoNormalizeText');
const standaloneCtx = vm.createContext({ console });
vm.runInContext(
  stopwordsSrc + '\n' + depsSrc + '\n' + genderVariantSrc + '\n' + aliasesSrc + '\n' + maxConstSrc + '\n' + sugSrc + '\n' +
  taxoNormalizeTextSrc + '\n' + taxoBuildIndicesSrc + '\n' +
  'this.__api2 = { suggestClinicalTagsForLesion, taxoBuildIndices };',
  standaloneCtx
);
const realSuggestClinicalTagsForLesion = standaloneCtx.__api2.suggestClinicalTagsForLesion;
const taxoBuildIndices = standaloneCtx.__api2.taxoBuildIndices;

test('33. Sugestões clínicas aparecem em lesão NOVA (existing = null)', async () => {
  const form = driveClinicalForm({ existing: null, name: 'Apendicite', notes: 'febre e dor abdominal' });
  await form.waitTaxonomyLoaded();
  form.clickAnalyze();
  const labels = form.suggestedLabels();
  assert.ok(labels.includes('Febre'));
  assert.ok(labels.includes('Dor abdominal'));
});

test('34. Sugestões clínicas também aparecem em lesão EXISTENTE sendo editada (correção de UX — sem restrição "só nova")', async () => {
  const form = driveClinicalForm({ existing: { id: 'lesion_1', clinicalTags: [] }, name: 'Apendicite', notes: 'febre e dor abdominal' });
  await form.waitTaxonomyLoaded();
  form.clickAnalyze();
  const labels = form.suggestedLabels();
  assert.ok(labels.includes('Febre'));
  assert.ok(labels.includes('Dor abdominal'));
});

test('35. Mudar a descrição recalcula as sugestões após o debounce (input, sem precisar de blur)', async () => {
  const form = driveClinicalForm({ existing: null, name: '', notes: '' });
  await form.waitTaxonomyLoaded();
  form.typeNotes('cefaleia e parestesia');
  form.flushDebounce();
  const labels = form.suggestedLabels();
  assert.ok(labels.includes('Cefaleia'));
  assert.ok(labels.includes('Parestesia'));
});

test('36. Botão "Analisar descrição" recalcula imediatamente (sem esperar o debounce)', async () => {
  const form = driveClinicalForm({ existing: null, name: '', notes: '' });
  await form.waitTaxonomyLoaded();
  form.byId.get('f-notes').value = 'tosse seca e sibilância';
  form.clickAnalyze();
  const labels = form.suggestedLabels();
  assert.ok(labels.includes('Tosse seca'));
  assert.ok(labels.includes('Sibilância'));
});

test('37. clinicalTag já adicionada nunca é sugerida de novo', async () => {
  const form = driveClinicalForm({ existing: { id: 'lesion_1', clinicalTags: ['Febre'] }, name: '', notes: 'febre e dor abdominal' });
  await form.waitTaxonomyLoaded();
  form.clickAnalyze();
  const labels = form.suggestedLabels();
  assert.ok(!labels.includes('Febre'));
  assert.ok(labels.includes('Dor abdominal'));
});

test('38. Clicar num chip de sugestão adiciona a clinicalTag ao estado local do form (nunca sozinho, nenhum auto-save)', async () => {
  const form = driveClinicalForm({ existing: null, name: '', notes: 'febre' });
  await form.waitTaxonomyLoaded();
  form.clickAnalyze();
  assert.deepEqual(form.getClinicalTags(), []); // nada foi adicionado só por detectar
  form.clickSuggestionChip('Febre');
  assert.deepEqual(form.getClinicalTags(), ['Febre']); // só após o clique explícito
});

test('39. Sem nenhuma sugestão, mostra a mensagem de vazio (nunca esconde a seção em silêncio)', async () => {
  const form = driveClinicalForm({ existing: null, name: 'xyz', notes: 'texto sem nenhum termo clínico' });
  await form.waitTaxonomyLoaded();
  form.clickAnalyze();
  assert.equal(form.suggestedLabels().length, 0);
  assert.ok(form.emptyMessageVisible());
});

test('40. EXEMPLO REAL (apendicite): nome "Apendicite" + descrição "Paciente com dor abdominal aguda em fossa ilíaca direita, febre e náuseas." — concepts detectados contra TAXONOMY.json real', async () => {
  const form = driveClinicalForm({
    existing: null,
    name: 'Apendicite',
    notes: 'Paciente com dor abdominal aguda em fossa ilíaca direita, febre e náuseas.'
  });
  await form.waitTaxonomyLoaded();
  form.clickAnalyze();
  const labels = form.suggestedLabels();

  // Detectados (existem na TAXONOMY real; "aguda"->"agudo" via variante de
  // gênero controlada; "fossa ilíaca direita"->"FID" via alias controlado):
  assert.ok(labels.includes('Dor abdominal'), 'Dor abdominal deveria ser detectada (clin_symptom_abdominal_pain)');
  assert.ok(labels.includes('Febre'), 'Febre deveria ser detectada (clin_symptom_fever)');
  assert.ok(labels.includes('FID'), 'FID deveria ser detectada via alias "fossa ilíaca direita" (clin_loc_fid)');
  assert.ok(labels.includes('agudo'), '"aguda" deveria mapear pro conceito "agudo" (clin_tc_acute) via variante de gênero');

  // "Náuseas" NÃO existe no vocabulário aprovado (só "Vômitos" existe) — não
  // deveria ser inventada/sugerida, mesmo estando no texto.
  assert.ok(!REAL_TAXONOMY.concepts.some(c => c.domain === 'clinical' && /n[áa]use/i.test(c.label)), 'pré-condição: TAXONOMY realmente não tem "náusea/náuseas"');
  assert.ok(!labels.includes('Náuseas') && !labels.includes('Náusea'));

  // cada rótulo sugerido precisa corresponder a um concept REAL de domain clinical
  labels.forEach(label => {
    const concept = REAL_TAXONOMY.concepts.find(c => c.domain === 'clinical' && c.label === label);
    assert.ok(concept, '"' + label + '" deveria existir em TAXONOMY.json (domain clinical)');
  });
});
