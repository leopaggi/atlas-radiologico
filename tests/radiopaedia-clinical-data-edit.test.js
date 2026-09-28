'use strict';

// DADOS CLÍNICOS IMPORTADOS DO RADIOPAEDIA (reviewId lrev_mulclk3s_7le9tj).
// Bug real: um caso clínico recém-importado (idade, modalidade, história
// clínica) nascia em buildClinicalCaseFromDraft() SEM `id` e SEM `origin`.
// Fluxo REAL rastreado: Radiopaedia -> importação (buildClinicalCaseFromDraft)
// -> persistência (addClinicalCaseToLesion/linkClinicalCaseToLesion) ->
// formulário de edição da lesão (wireDidacticFormSection, botão "✏") ->
// openDidacticItemEditor -> Salvar (de-save, normalizeManualClinicalCase +
// upsertDidacticItem). upsertDidacticItem casa o item por `id`; sem id, o
// Salvar nunca encontrava o item importado e criava um NOVO item vazio/
// duplicado em vez de atualizar o original — e a validação do Salvar
// (`origin: it.origin || 'manual'`) exigia "apresentação clínica" mesmo
// quando o caso importado legitimamente não trouxe história clínica do
// Radiopaedia, bloqueando o Salvar. Root cause: mapeamento incompleto no
// PONTO DE IMPORTAÇÃO (faltava identidade estável), não schema/ownership/
// chave divergente/persistência em si.

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
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1'); }

// Extração função a função (não recorte por marcador de bloco: os
// marcadores de comentário do módulo 093 têm `\n` literal que não bate com
// o CRLF real do arquivo neste ambiente Windows — mesmo motivo documentado
// no checkpoint para didactic-image-links/didactic-pending-images/
// lesion-didactic-content.test.js; aqui evitamos o problema extraindo cada
// função individualmente, como o restante da suíte já faz com sucesso).
function api() {
  const names = ['buildClinicalCaseFromDraft', 'addClinicalCaseToLesion', 'lesionHasClinicalCaseUrl', 'sameExternalUrl', 'normalizeExternalTitle',
    'genDidacticId', 'didacticStr', 'didacticUrl', 'ensureClinicalCaseIdentity', 'upsertDidacticItem', 'normalizeManualClinicalCase',
    'sortDidacticItems', 'isDidacticItemVisible', 'didacticItemTime', 'clinicalCaseIdentityKey', 'didacticRefsField'];
  const deps = names.map((n) => extractFunction(html, n)).join('\n');
  const constDecl = /const DIDACTIC_LIMITS = \{[^}]*\};/.exec(html);
  assert.ok(constDecl, 'DIDACTIC_LIMITS não encontrado');
  const ctx = vm.createContext({ console: { warn(){}, log(){}, error(){} }, Date, Math, JSON });
  vm.runInContext(constDecl[0] + '\n' + deps + '\nthis.__a = { ' + names.join(', ') + ' };', ctx);
  return ctx.__a;
}
const A = api();
const plain = (v) => JSON.parse(JSON.stringify(v));

const DRAFT = {
  source: 'Radiopaedia',
  title: 'Polyethene wear',
  sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-1',
  patientAge: '55',
  patientSex: 'Female',
  modality: 'x-ray',
  presentation: 'Worsening left hip pain seven years following total hip arthroplasty.'
};

// ===========================================================================
// 1. IMPORTAÇÃO — o caso já nasce com identidade estável
// ===========================================================================

test('1. buildClinicalCaseFromDraft: caso importado nasce com id estável e origin=imported', () => {
  const c = A.buildClinicalCaseFromDraft(DRAFT);
  assert.ok(c.id && typeof c.id === 'string' && c.id.length > 0, 'precisa ter id');
  assert.equal(c.origin, 'imported');
});

test('2. buildClinicalCaseFromDraft: todos os dados clínicos do draft chegam ao caso (idade, sexo, modalidade, apresentação)', () => {
  const c = A.buildClinicalCaseFromDraft(DRAFT);
  assert.equal(c.patientAge, '55');
  assert.equal(c.patientSex, 'Female');
  assert.equal(c.modality, 'x-ray');
  assert.equal(c.presentation, DRAFT.presentation);
  assert.equal(c.source, 'Radiopaedia');
  assert.equal(c.sourceUrl, DRAFT.sourceUrl);
});

test('3. dois imports seguidos geram ids DIFERENTES (nunca colidem, nunca reaproveitam by acidente)', () => {
  const c1 = A.buildClinicalCaseFromDraft(DRAFT);
  const c2 = A.buildClinicalCaseFromDraft(Object.assign({}, DRAFT, { sourceUrl: 'https://radiopaedia.org/cases/polyethene-wear-2' }));
  assert.notEqual(c1.id, c2.id);
});

// ===========================================================================
// 4/5/6. EDITAR → SALVAR → REABRIR — o Salvar ATUALIZA o mesmo item (upsert
// por id), nunca cria um duplicado vazio ao lado do importado
// ===========================================================================

test('4. editar um caso importado e salvar ATUALIZA o mesmo item (upsert por id, sem duplicar)', () => {
  const imported = A.buildClinicalCaseFromDraft(DRAFT);
  let list = [imported];
  // Simula exatamente o que openDidacticItemEditor monta no de-save para
  // kind==='cases': normalizeManualClinicalCase(...) + upsertDidacticItem.
  const edited = A.normalizeManualClinicalCase({
    title: imported.title, presentation: 'Apresentação clínica editada pelo usuário.',
    patientAge: imported.patientAge, patientSex: imported.patientSex, modality: imported.modality,
    source: imported.source, sourceUrl: imported.sourceUrl, notes: 'nota adicional',
    origin: imported.origin || 'manual' // mesma expressão real do de-save
  });
  assert.equal(edited.ok, true);
  const out = Object.assign({}, edited.item); delete out.id;
  list = A.upsertDidacticItem(list, Object.assign({}, out, { id: imported.id }));
  assert.equal(list.length, 1, 'não duplicou — atualizou o mesmo item');
  assert.equal(list[0].id, imported.id, 'id preservado');
  assert.equal(list[0].presentation, 'Apresentação clínica editada pelo usuário.');
  assert.equal(list[0].notes, 'nota adicional');
});

test('5. reabrir a edição depois de salvar mostra os valores SALVOS (não os originais do import)', () => {
  const imported = A.buildClinicalCaseFromDraft(DRAFT);
  let list = [imported];
  const edited = A.normalizeManualClinicalCase({
    title: 'Título corrigido', presentation: imported.presentation, patientAge: '60', patientSex: imported.patientSex,
    modality: 'MRI', source: imported.source, sourceUrl: imported.sourceUrl, notes: '', origin: imported.origin || 'manual'
  });
  const out = Object.assign({}, edited.item); delete out.id;
  list = A.upsertDidacticItem(list, Object.assign({}, out, { id: imported.id }));
  // "reabrir" = ler de novo o item da lista pelo id (é exatamente isso que
  // wireDidacticFormSection faz: sortDidacticItems(drafts.cases) e itera).
  const reopened = A.sortDidacticItems(list).find((c) => c.id === imported.id);
  assert.equal(reopened.title, 'Título corrigido');
  assert.equal(reopened.patientAge, '60');
  assert.equal(reopened.modality, 'MRI');
});

test('6. dados antigos NÃO são apagados por formulário vazio: campo não tocado continua com o valor importado', () => {
  const imported = A.buildClinicalCaseFromDraft(DRAFT);
  let list = [imported];
  // Usuário só mexe no título; os demais campos vêm PRÉ-PREENCHIDOS do
  // próprio formulário (nunca vazios) — aqui simula reenviando os mesmos
  // valores que openDidacticItemEditor teria posto no `set()` de cada campo.
  const edited = A.normalizeManualClinicalCase({
    title: 'Só o título mudou', presentation: imported.presentation, patientAge: imported.patientAge,
    patientSex: imported.patientSex, modality: imported.modality, source: imported.source, sourceUrl: imported.sourceUrl,
    notes: '', origin: imported.origin || 'manual'
  });
  const out = Object.assign({}, edited.item); delete out.id;
  list = A.upsertDidacticItem(list, Object.assign({}, out, { id: imported.id }));
  const saved = list.find((c) => c.id === imported.id);
  assert.equal(saved.patientAge, '55', 'idade importada preservada');
  assert.equal(saved.modality, 'x-ray', 'modalidade importada preservada');
  assert.equal(saved.presentation, DRAFT.presentation, 'apresentação importada preservada');
});

// ===========================================================================
// 7. VALIDAÇÃO — caso importado sem "história clínica" não é mais bloqueado
// ===========================================================================

test('7. caso importado SEM apresentação clínica (Radiopaedia não trouxe) pode ser salvo (origin=imported não exige presentation)', () => {
  const draftSemPresentation = Object.assign({}, DRAFT, { presentation: undefined });
  delete draftSemPresentation.presentation;
  const imported = A.buildClinicalCaseFromDraft(draftSemPresentation);
  assert.equal('presentation' in imported, false);
  const res = A.normalizeManualClinicalCase({
    title: imported.title, presentation: '', patientAge: imported.patientAge, patientSex: imported.patientSex,
    modality: imported.modality, source: imported.source, sourceUrl: imported.sourceUrl, notes: '',
    origin: imported.origin || 'manual' // agora resolve para 'imported'
  });
  assert.equal(res.ok, true, 'não deveria bloquear: ' + (res.error || ''));
});

test('8. caso MANUAL (não importado) sem apresentação clínica continua exigindo o campo (regra preservada)', () => {
  const res = A.normalizeManualClinicalCase({ title: 'Caso manual', presentation: '', origin: 'manual' });
  assert.equal(res.ok, false);
  assert.equal(res.field, 'presentation');
});

// ===========================================================================
// 9. LEGADO — caso importado ANTES desta correção (sem id/origin) ganha
// identidade ao ser gerenciado, sem migração destrutiva nem perda de dados
// ===========================================================================

test('9. ensureClinicalCaseIdentity: caso legado (sem id) ganha id + origin=imported preservando todos os dados', () => {
  const legacy = { source: 'Radiopaedia', title: 'Caso legado', sourceUrl: 'https://radiopaedia.org/cases/legado-1', patientAge: '30', modality: 'CT', presentation: 'quadro antigo', addedAt: new Date(2026, 0, 1).toISOString() };
  const withId = A.ensureClinicalCaseIdentity(legacy);
  assert.ok(withId.id);
  assert.equal(withId.origin, 'imported');
  assert.equal(withId.patientAge, '30');
  assert.equal(withId.modality, 'CT');
  assert.equal(withId.presentation, 'quadro antigo');
  assert.equal(withId.title, 'Caso legado');
});

test('10. ensureClinicalCaseIdentity: item que JÁ tem id não é tocado (idempotente)', () => {
  const already = { id: 'case_x', title: 'X', origin: 'imported' };
  const out = A.ensureClinicalCaseIdentity(already);
  assert.equal(out, already, 'mesma referência — não recria');
});

// ===========================================================================
// 11. FLUXO REAL DA UI — wireDidacticFormSection aplica a mesma conversão
// no botão "✏ editar" que já aplicava em ↑/↓/✕ (rastreado no código real,
// não só no helper isolado)
// ===========================================================================

test('11. wireDidacticFormSection: botão "editar" (.didactic-edit) converte identidade de caso legado ANTES de abrir o editor', () => {
  const src = stripComments(extractFunction(html, 'wireDidacticFormSection'));
  const idx = src.indexOf("querySelector('.didactic-edit').onclick");
  assert.notEqual(idx, -1, 'wiring do botão editar não encontrado');
  const nearby = src.slice(idx, idx + 700);
  assert.match(nearby, /if \(kind === 'cases' && !it\.id\) \{/, 'mesma guarda usada por ↑\\/↓\\/✕ (act)');
  assert.match(nearby, /ensureClinicalCaseIdentity\(it\)/);
  assert.match(nearby, /openDidacticItemEditor\(kind, it, getLesionMeta,/, 'o editor é aberto com o item JÁ com identidade');
});

test('12. wireDidacticFormSection: a conversão do botão "editar" é a MESMA função usada por ↑/↓/✕ (não uma cópia divergente)', () => {
  const src = stripComments(extractFunction(html, 'wireDidacticFormSection'));
  const occurrences = (src.match(/ensureClinicalCaseIdentity\(it\)/g) || []).length;
  assert.ok(occurrences >= 2, 'esperado em act() (↑/↓/✕) e no wiring de editar');
});

// ===========================================================================
// 13. seed_390 — confirma que a mudança NÃO tem relação com a pendência
// manual (add_clinical_cases do plano estrutural é uma função separada,
// intocada)
// ===========================================================================

test('13. structuralApplyAddCases (usado pela pendência de seed_390) não foi alterado por esta correção — já gerava id/origin corretamente antes', () => {
  const src = extractFunction(html, 'structuralApplyAddCases');
  assert.match(src, /item\.origin = 'structural-plan';/, 'função do plano estrutural continua com sua própria origin, intacta');
  assert.doesNotMatch(src, /buildClinicalCaseFromDraft/, 'não usa a função que corrigimos — caminhos independentes');
});
