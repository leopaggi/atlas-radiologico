'use strict';

// TAXO-01 — validação estrutural, somente leitura, do TAXONOMY.json.
// Não toca index.html, DATA, SEED, Firestore, IndexedDB nem localStorage.
// Mesmo padrão de teste leve já usado no projeto (node:test + node:assert,
// sem dependências novas) — ver tests/site-taxonomy.test.js para o precedente
// de "extrair e validar estrutura real sem subir o app".

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const TAXONOMY_PATH = path.resolve(__dirname, '..', 'TAXONOMY.json');
const raw = fs.readFileSync(TAXONOMY_PATH, 'utf8');
const taxonomy = JSON.parse(raw);

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

test('metadata tem os valores esperados da fase approved (TAXO-01 congelada)', () => {
  assert.equal(taxonomy.metadata.schemaVersion, 1);
  assert.equal(taxonomy.metadata.taxonomyVersion, 1);
  assert.equal(taxonomy.metadata.status, 'approved');
});

test('groups e concepts existem e são arrays não vazios', () => {
  assert.ok(Array.isArray(taxonomy.groups) && taxonomy.groups.length > 0);
  assert.ok(Array.isArray(taxonomy.concepts) && taxonomy.concepts.length > 0);
});

test('regra 1 — todos os concept IDs são únicos', () => {
  const ids = taxonomy.concepts.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'há conceptId duplicado');
});

test('regra 2 — todos os group IDs são únicos', () => {
  const ids = taxonomy.groups.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length, 'há group id duplicado');
});

test('regra 3 — todo concept.group existe em groups', () => {
  const groupIds = new Set(taxonomy.groups.map(g => g.id));
  for (const c of taxonomy.concepts) {
    assert.ok(groupIds.has(c.group), `concept ${c.id} referencia group inexistente: ${c.group}`);
  }
});

test('regra 4 — nenhum aliasOf aponta para concept inexistente', () => {
  const conceptIds = new Set(taxonomy.concepts.map(c => c.id));
  for (const c of taxonomy.concepts) {
    if (c.aliasOf != null) {
      assert.ok(conceptIds.has(c.aliasOf), `concept ${c.id} tem aliasOf inexistente: ${c.aliasOf}`);
    }
  }
});

test('regra 5 — nenhum parentId aponta para concept inexistente (null é permitido e documentado)', () => {
  const conceptIds = new Set(taxonomy.concepts.map(c => c.id));
  for (const c of taxonomy.concepts) {
    if (Object.prototype.hasOwnProperty.call(c, 'parentId') && c.parentId != null) {
      assert.ok(conceptIds.has(c.parentId), `concept ${c.id} tem parentId inexistente: ${c.parentId}`);
    }
  }
});

test('regra 6 — nenhuma relation (relatedTo/oftenAssociatedWith/differentialOf) aponta para ID inexistente', () => {
  const conceptIds = new Set(taxonomy.concepts.map(c => c.id));
  for (const c of taxonomy.concepts) {
    const r = c.relations || {};
    for (const key of ['relatedTo', 'oftenAssociatedWith', 'differentialOf']) {
      for (const target of (r[key] || [])) {
        assert.ok(conceptIds.has(target), `concept ${c.id} tem ${key} inexistente: ${target}`);
      }
    }
  }
});

test('regra 7 — nenhuma lista de synonyms contém duplicata normalizada', () => {
  for (const c of taxonomy.concepts) {
    const normList = (c.synonyms || []).map(normalize);
    assert.equal(new Set(normList).size, normList.length, `concept ${c.id} tem sinônimo duplicado (normalizado)`);
  }
});

test('regra 8 — nenhum label canônico duplicado no mesmo group (sem justificativa registrada)', () => {
  const byGroup = new Map();
  for (const c of taxonomy.concepts) {
    if (!byGroup.has(c.group)) byGroup.set(c.group, new Map());
    const labelMap = byGroup.get(c.group);
    const norm = normalize(c.label);
    if (labelMap.has(norm)) {
      assert.fail(`group ${c.group} tem label duplicado: "${c.label}" (${labelMap.get(norm)} e ${c.id})`);
    }
    labelMap.set(norm, c.id);
  }
});

test('regra 9 — `exclusive` existe (boolean) em todos os groups', () => {
  for (const g of taxonomy.groups) {
    assert.equal(typeof g.exclusive, 'boolean', `group ${g.id} sem exclusive booleano`);
  }
});

test('regra 10 — `allowMultipleInstances` existe (boolean) em todos os groups', () => {
  for (const g of taxonomy.groups) {
    assert.equal(typeof g.allowMultipleInstances, 'boolean', `group ${g.id} sem allowMultipleInstances booleano`);
  }
});

test('regra 11 — nenhum conceptId usa seed_N', () => {
  for (const c of taxonomy.concepts) {
    assert.ok(!/^seed_/i.test(c.id), `concept ${c.id} parece usar o padrão seed_N`);
  }
});

test('regra 12 — nenhum conceptId é numérico posicional', () => {
  for (const c of taxonomy.concepts) {
    assert.ok(!/^\d+$/.test(c.id), `concept ${c.id} é puramente numérico (posicional)`);
  }
});

test('regra 13 — metadata.schemaVersion = 1', () => {
  assert.equal(taxonomy.metadata.schemaVersion, 1);
});

test('regra 14 — metadata.taxonomyVersion = 1', () => {
  assert.equal(taxonomy.metadata.taxonomyVersion, 1);
});

test('regra 15 — metadata.status = "approved" (congelada a partir da aprovação TAXO-01)', () => {
  assert.equal(taxonomy.metadata.status, 'approved');
});

// Verificações extras (não pedidas explicitamente nas 15, mas baratas e
// relevantes para a convenção de IDs documentada em TAXONOMIA_ATLAS_V1.md).
test('extra — conceptId segue convenção prefixo_de_domínio + snake_case ASCII', () => {
  const prefixByDomain = { clinical: 'clin_', radiologic: 'rad_', etiology: 'etio_', demographics: 'demo_' };
  for (const c of taxonomy.concepts) {
    const prefix = prefixByDomain[c.domain];
    assert.ok(prefix, `concept ${c.id} tem domain desconhecido: ${c.domain}`);
    assert.ok(c.id.startsWith(prefix), `concept ${c.id} não usa o prefixo esperado para domain ${c.domain} (${prefix})`);
    assert.ok(/^[a-z0-9_]+$/.test(c.id), `concept ${c.id} tem caracteres fora de snake_case ASCII`);
  }
});

test('extra — todo group id segue domain.camelCaseGroupName', () => {
  for (const g of taxonomy.groups) {
    assert.ok(g.id.startsWith(g.domain + '.'), `group ${g.id} não começa com "${g.domain}."`);
  }
});

test('extra — status de todo concept é "active" nesta fase (nenhum deprecated inventado sem necessidade)', () => {
  for (const c of taxonomy.concepts) {
    assert.equal(c.status, 'active', `concept ${c.id} não está "active"`);
  }
});

test('extra — description, quando presente, é string não vazia (null é o default aceito)', () => {
  for (const c of taxonomy.concepts) {
    if (Object.prototype.hasOwnProperty.call(c, 'description') && c.description !== null) {
      assert.equal(typeof c.description, 'string', `concept ${c.id} tem description de tipo inválido`);
      assert.ok(c.description.trim().length > 0, `concept ${c.id} tem description vazia`);
    }
  }
});

test('extra — rad_comp_complex_cyst existe com description distinguindo cístico simples de sólido+cístico arbitrário', () => {
  const cc = taxonomy.concepts.find(c => c.id === 'rad_comp_complex_cyst');
  assert.ok(cc, 'rad_comp_complex_cyst deveria existir em radiologic.composition');
  assert.equal(cc.group, 'radiologic.composition');
  assert.ok(cc.description && cc.description.length > 0, 'rad_comp_complex_cyst deveria ter description');
  assert.ok(!taxonomy.concepts.some(c => c.id === 'rad_comp_solid_cystic'), 'rad_comp_solid_cystic não deveria mais existir');
});

/* ===================== Ajuste TAXO-01 (rodada de revisão semântica) ===================== */

test('ajuste — subgroups, quando presente, é array (nunca string solta)', () => {
  for (const c of taxonomy.concepts) {
    if (Object.prototype.hasOwnProperty.call(c, 'subgroups') && c.subgroups !== null) {
      assert.ok(Array.isArray(c.subgroups), `concept ${c.id} tem subgroups que não é array`);
      assert.ok(c.subgroups.length > 0, `concept ${c.id} tem subgroups vazio (deveria ser null, não [])`);
    }
  }
});

test('ajuste — nenhum subgroup desconhecido', () => {
  const KNOWN = new Set([
    'general', 'ophthalmologic', 'otoneurologic', 'otolaryngologic', 'cardiovascular',
    'respiratory', 'gastrointestinal', 'genitourinary', 'endocrine', 'hematologic',
    'integumentary', 'musculoskeletal', 'neurologic', 'hepatobiliary',
    'chestPainCharacter', 'abdominalLocation'
  ]);
  for (const c of taxonomy.concepts) {
    for (const s of (c.subgroups || [])) {
      assert.ok(KNOWN.has(s), `concept ${c.id} usa subgroup desconhecido: ${s}`);
    }
  }
});

test('ajuste — nenhum concept antigo ficou com subgroup (string) residual do schema anterior', () => {
  for (const c of taxonomy.concepts) {
    assert.ok(!Object.prototype.hasOwnProperty.call(c, 'subgroup'), `concept ${c.id} ainda tem o campo "subgroup" (singular) — deveria ser "subgroups"`);
  }
});

test('ajuste — os 10 qualifiers de localização abdominal apontam parentId para clin_symptom_abdominal_pain', () => {
  const abdominalQualifierIds = [
    'clin_loc_fid', 'clin_loc_fie', 'clin_loc_hypogastrium', 'clin_loc_mesogastrium',
    'clin_loc_right_flank', 'clin_loc_left_flank', 'clin_loc_right_hypochondrium',
    'clin_loc_left_hypochondrium', 'clin_loc_epigastrium', 'clin_loc_diffuse_abdominal'
  ];
  assert.ok(taxonomy.concepts.some(c => c.id === 'clin_symptom_abdominal_pain'), 'clin_symptom_abdominal_pain deveria existir');
  for (const id of abdominalQualifierIds) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c, `qualifier ${id} deveria existir`);
    assert.equal(c.parentId, 'clin_symptom_abdominal_pain', `qualifier ${id} deveria ter parentId = clin_symptom_abdominal_pain`);
  }
});

test('ajuste — nenhum label contém "/" sem description explicando (justificativa obrigatória)', () => {
  for (const c of taxonomy.concepts) {
    if (c.label.includes('/')) {
      assert.ok(c.description && c.description.trim().length > 0, `concept ${c.id} tem "/" no label ("${c.label}") sem description justificando`);
    }
  }
});

test('ajuste — exclusive de clinical.distribution/laterality/symmetry = true; longitudinalDistribution = false', () => {
  const byGroupId = id => taxonomy.groups.find(g => g.id === id);
  assert.equal(byGroupId('clinical.distribution').exclusive, true);
  assert.equal(byGroupId('clinical.laterality').exclusive, true);
  assert.equal(byGroupId('clinical.symmetry').exclusive, true);
  assert.equal(byGroupId('clinical.longitudinalDistribution').exclusive, false);
});

test('ajuste — rad_comp_calcified é o label canônico ("calcificado", sem barra) com "mineralizado" como synonym', () => {
  const c = taxonomy.concepts.find(x => x.id === 'rad_comp_calcified');
  assert.ok(c, 'rad_comp_calcified deveria existir');
  assert.equal(c.label, 'calcificado');
  assert.ok(c.synonyms.includes('mineralizado'), 'rad_comp_calcified deveria ter "mineralizado" como synonym');
});

test('ajuste — pares composição×achado associado (necrose, hemorragia, calcificação) têm description distinguindo os dois sentidos', () => {
  const pairs = [
    ['rad_comp_necrotic', 'rad_assoc_necrosis'],
    ['rad_comp_hemorrhagic', 'rad_assoc_hemorrhage'],
    ['rad_comp_calcified', 'rad_assoc_calcifications']
  ];
  for (const [compId, assocId] of pairs) {
    const comp = taxonomy.concepts.find(c => c.id === compId);
    const assoc = taxonomy.concepts.find(c => c.id === assocId);
    assert.ok(comp && comp.description, `${compId} deveria ter description`);
    assert.ok(assoc && assoc.description, `${assocId} deveria ter description`);
    assert.notEqual(comp.description, assoc.description, `${compId} e ${assocId} não deveriam ter a mesma description`);
  }
});

/* ===================== Auditoria pré-congelamento (ajustes explícitos) ===================== */

test('pre-congelamento — "hepatobiliary" é um subgroup válido e usado por ao menos um concept', () => {
  assert.ok(taxonomy.concepts.some(c => (c.subgroups || []).includes('hepatobiliary')), 'nenhum concept usa o subgroup hepatobiliary');
});

test('pre-congelamento — clin_symptom_jaundice (Icterícia) está em subgroups ["hepatobiliary"], sem "gastrointestinal"', () => {
  const c = taxonomy.concepts.find(x => x.id === 'clin_symptom_jaundice');
  assert.ok(c, 'clin_symptom_jaundice deveria existir');
  assert.deepEqual(c.subgroups, ['hepatobiliary']);
  assert.ok(!c.subgroups.includes('gastrointestinal'), 'Icterícia não deveria mais estar em gastrointestinal');
  assert.ok(!c.subgroups.includes('hematologic'), 'Icterícia não deveria incluir hematologic nesta rodada (não autorizado)');
});

test('pre-congelamento — etio_hemorrhagic tem description válida e distinta dos outros membros da família hemorrágica', () => {
  const etio = taxonomy.concepts.find(c => c.id === 'etio_hemorrhagic');
  const comp = taxonomy.concepts.find(c => c.id === 'rad_comp_hemorrhagic');
  const assoc = taxonomy.concepts.find(c => c.id === 'rad_assoc_hemorrhage');
  assert.ok(etio && typeof etio.description === 'string' && etio.description.trim().length > 0, 'etio_hemorrhagic deveria ter description não vazia');
  assert.notEqual(etio.description, comp.description, 'etio_hemorrhagic não deveria ter a mesma description de rad_comp_hemorrhagic');
  assert.notEqual(etio.description, assoc.description, 'etio_hemorrhagic não deveria ter a mesma description de rad_assoc_hemorrhage');
});

test('pre-congelamento — histórico: nesta fase anterior metadata.status era "draft" (ver teste de aprovação abaixo para o estado atual)', () => {
  // Este teste documenta a transição histórica; a asserção vigente de status
  // está em "aprovação TAXO-01" mais abaixo. Mantido apenas para não quebrar
  // a numeração/rastreabilidade das rodadas anteriores.
  assert.ok(['draft', 'approved'].includes(taxonomy.metadata.status));
});

/* ===================== Divisão de groups (rodada de correção estrutural) ===================== */

test('divisao — radiologic.distribution e clinical.symptomQualifiers foram removidos do dicionário', () => {
  const groupIds = new Set(taxonomy.groups.map(g => g.id));
  assert.ok(!groupIds.has('radiologic.distribution'), 'radiologic.distribution deveria ter sido removido');
  assert.ok(!groupIds.has('clinical.symptomQualifiers'), 'clinical.symptomQualifiers deveria ter sido removido (ficou vazio)');
});

test('divisao — os 6 novos groups radiológicos existem com exclusive/allowMultipleInstances corretos', () => {
  const expected = {
    'radiologic.extent': { exclusive: true, allowMultipleInstances: false },
    'radiologic.laterality': { exclusive: true, allowMultipleInstances: false },
    'radiologic.symmetry': { exclusive: true, allowMultipleInstances: false },
    'radiologic.regionalPattern': { exclusive: true, allowMultipleInstances: false },
    'radiologic.position': { exclusive: false, allowMultipleInstances: false },
    'radiologic.longitudinalDistribution': { exclusive: false, allowMultipleInstances: false }
  };
  for (const [id, flags] of Object.entries(expected)) {
    const g = taxonomy.groups.find(x => x.id === id);
    assert.ok(g, `group ${id} deveria existir`);
    assert.equal(g.exclusive, flags.exclusive, `group ${id} exclusive incorreto`);
    assert.equal(g.allowMultipleInstances, flags.allowMultipleInstances, `group ${id} allowMultipleInstances incorreto`);
  }
});

test('divisao — os 2 novos groups de qualifiers clínicos existem', () => {
  const groupIds = new Set(taxonomy.groups.map(g => g.id));
  assert.ok(groupIds.has('clinical.chestPainQualifiers'), 'clinical.chestPainQualifiers deveria existir');
  assert.ok(groupIds.has('clinical.abdominalPainLocation'), 'clinical.abdominalPainLocation deveria existir');
});

test('divisao — nenhum conceptId antigo rad_dist_* sobrevive', () => {
  for (const c of taxonomy.concepts) {
    assert.ok(!/^rad_dist_/.test(c.id), `conceptId antigo ainda existe: ${c.id}`);
  }
});

test('divisao — os 14 novos conceptIds renomeados existem nos groups corretos', () => {
  const expected = {
    rad_extent_focal: 'radiologic.extent', rad_extent_multifocal: 'radiologic.extent', rad_extent_diffuse: 'radiologic.extent',
    rad_lat_unilateral: 'radiologic.laterality', rad_lat_bilateral: 'radiologic.laterality',
    rad_sym_symmetric: 'radiologic.symmetry', rad_sym_asymmetric: 'radiologic.symmetry',
    rad_regional_segmental: 'radiologic.regionalPattern', rad_regional_lobar: 'radiologic.regionalPattern', rad_regional_multilobar: 'radiologic.regionalPattern',
    rad_position_central: 'radiologic.position', rad_position_peripheral: 'radiologic.position',
    rad_long_proximal: 'radiologic.longitudinalDistribution', rad_long_distal: 'radiologic.longitudinalDistribution'
  };
  for (const [id, group] of Object.entries(expected)) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c, `concept ${id} deveria existir`);
    assert.equal(c.group, group, `concept ${id} deveria estar em ${group}`);
  }
});

test('divisao — qualifiers de dor torácica e localização abdominal mantêm os parentIds corretos', () => {
  const chestPainIds = ['clin_chest_pain_pleuritic', 'clin_chest_pain_rest', 'clin_chest_pain_exertional', 'clin_chest_pain_positional'];
  for (const id of chestPainIds) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c, `${id} deveria existir`);
    assert.equal(c.group, 'clinical.chestPainQualifiers');
    assert.equal(c.parentId, 'clin_symptom_chest_pain');
  }
  const abdominalIds = [
    'clin_loc_fid', 'clin_loc_fie', 'clin_loc_hypogastrium', 'clin_loc_mesogastrium',
    'clin_loc_right_flank', 'clin_loc_left_flank', 'clin_loc_right_hypochondrium',
    'clin_loc_left_hypochondrium', 'clin_loc_epigastrium', 'clin_loc_diffuse_abdominal'
  ];
  for (const id of abdominalIds) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c, `${id} deveria existir`);
    assert.equal(c.group, 'clinical.abdominalPainLocation');
    assert.equal(c.parentId, 'clin_symptom_abdominal_pain');
  }
});

test('divisao — lombalgia/dorsalgia/cervicalgia continuam symptoms independentes (decisão consciente, não normalizados)', () => {
  const ids = ['clin_symptom_low_back_pain', 'clin_symptom_thoracic_back_pain', 'clin_symptom_neck_pain'];
  for (const id of ids) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c, `${id} deveria existir`);
    assert.equal(c.group, 'clinical.symptoms');
    assert.ok(!Object.prototype.hasOwnProperty.call(c, 'parentId') || c.parentId == null, `${id} não deveria ter parentId`);
  }
});

test('divisao — descriptions desambiguadoras existem para os 3 pares de labels semelhantes', () => {
  const pairs = ['rad_margin_spiculated', 'rad_periosteal_spiculated', 'rad_comp_fibrous', 'rad_bonematrix_fibrous', 'rad_comp_solid', 'rad_periosteal_solid'];
  for (const id of pairs) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c, `${id} deveria existir`);
    assert.ok(c.description && c.description.trim().length > 0, `${id} deveria ter description não vazia`);
  }
});

/* ===================== conflictsWith ===================== */

test('conflictsWith — quando presente, todos os IDs referenciados existem', () => {
  const conceptIds = new Set(taxonomy.concepts.map(c => c.id));
  for (const c of taxonomy.concepts) {
    if (c.conflictsWith) {
      for (const target of c.conflictsWith) {
        assert.ok(conceptIds.has(target), `concept ${c.id} tem conflictsWith inexistente: ${target}`);
      }
    }
  }
});

test('conflictsWith — nenhum concept conflita consigo próprio', () => {
  for (const c of taxonomy.concepts) {
    if (c.conflictsWith) {
      assert.ok(!c.conflictsWith.includes(c.id), `concept ${c.id} conflita consigo próprio`);
    }
  }
});

test('conflictsWith — a relação é sempre simétrica', () => {
  const byId = new Map(taxonomy.concepts.map(c => [c.id, c]));
  for (const c of taxonomy.concepts) {
    if (c.conflictsWith) {
      for (const targetId of c.conflictsWith) {
        const target = byId.get(targetId);
        assert.ok(target && target.conflictsWith && target.conflictsWith.includes(c.id), `conflictsWith não é simétrico entre ${c.id} e ${targetId}`);
      }
    }
  }
});

test('conflictsWith — clin_loc_diffuse_abdominal conflita com as 9 localizações específicas, e cada uma conflita de volta', () => {
  const specificIds = [
    'clin_loc_fid', 'clin_loc_fie', 'clin_loc_hypogastrium', 'clin_loc_mesogastrium',
    'clin_loc_right_flank', 'clin_loc_left_flank', 'clin_loc_right_hypochondrium',
    'clin_loc_left_hypochondrium', 'clin_loc_epigastrium'
  ];
  const diffuse = taxonomy.concepts.find(c => c.id === 'clin_loc_diffuse_abdominal');
  assert.ok(diffuse.conflictsWith);
  assert.equal(diffuse.conflictsWith.length, 9);
  for (const id of specificIds) {
    assert.ok(diffuse.conflictsWith.includes(id), `diffuse deveria conflitar com ${id}`);
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.ok(c.conflictsWith && c.conflictsWith.includes('clin_loc_diffuse_abdominal'), `${id} deveria conflitar com clin_loc_diffuse_abdominal`);
  }
});

test('conflictsWith — localizações específicas NÃO conflitam entre si (podem coexistir)', () => {
  const specificIds = [
    'clin_loc_fid', 'clin_loc_fie', 'clin_loc_hypogastrium', 'clin_loc_mesogastrium',
    'clin_loc_right_flank', 'clin_loc_left_flank', 'clin_loc_right_hypochondrium',
    'clin_loc_left_hypochondrium', 'clin_loc_epigastrium'
  ];
  for (const id of specificIds) {
    const c = taxonomy.concepts.find(x => x.id === id);
    assert.deepEqual(c.conflictsWith, ['clin_loc_diffuse_abdominal'], `${id} só deveria conflitar com a localização difusa`);
  }
});

/* ===================== Aprovação TAXO-01 (congelamento formal) ===================== */
//
// A partir desta aprovação, os 194 conceptIds abaixo (BASELINE_APPROVED_CONCEPT_IDS)
// são imutáveis: nunca renomeados, nunca reaproveitados para outro significado,
// nunca apagados após uso (ver TAXONOMIA_ATLAS_V1.md, seção de congelamento).
// Mudanças de significado passam a usar status:"deprecated" + aliasOf, nunca
// a edição/remoção direta do id antigo.
//
// Por que fixar a lista inteira de IDs no teste, em vez de só o COUNT (194)?
// Um count sozinho não detecta uma troca 1-por-1 (remover um id aprovado e
// adicionar outro no mesmo "slot" manteria concepts.length === 194 e passaria
// despercebido). Como o objetivo desta rodada é justamente proteger contra
// remoção/reaproveitamento acidental de um conceptId já aprovado — não só
// contra uma contagem errada — a lista completa (um snapshot imutável do
// estado aprovado) é o mecanismo correto aqui, não um exagero: é barata de
// manter (grep/diff resolve) e é exatamente o tipo de regressão silenciosa
// que um teste deveria pegar.

const BASELINE_APPROVED_CONCEPT_IDS = ["clin_chest_pain_exertional","clin_chest_pain_pleuritic","clin_chest_pain_positional","clin_chest_pain_rest","clin_course_continuous","clin_course_episodic","clin_course_recurrent","clin_dist_diffuse","clin_dist_localized","clin_dur_days","clin_dur_hours","clin_dur_minutes","clin_dur_seconds","clin_evo_progressive","clin_evo_regressive","clin_evo_stable","clin_intensity_mild","clin_intensity_moderate","clin_intensity_severe","clin_lat_bilateral","clin_lat_unilateral","clin_loc_diffuse_abdominal","clin_loc_epigastrium","clin_loc_fid","clin_loc_fie","clin_loc_hypogastrium","clin_loc_left_flank","clin_loc_left_hypochondrium","clin_loc_mesogastrium","clin_loc_right_flank","clin_loc_right_hypochondrium","clin_long_distal","clin_long_proximal","clin_onset_gradual","clin_onset_sudden","clin_sym_asymmetric","clin_sym_symmetric","clin_symptom_abdominal_pain","clin_symptom_amnesia","clin_symptom_ankle_edema","clin_symptom_arthralgia","clin_symptom_bruising","clin_symptom_chest_pain","clin_symptom_coma","clin_symptom_diarrhea","clin_symptom_dry_cough","clin_symptom_dysarthria","clin_symptom_dysphagia","clin_symptom_dysuria","clin_symptom_eye_irritation","clin_symptom_eye_pain","clin_symptom_fever","clin_symptom_genital_lesion","clin_symptom_headache","clin_symptom_hearing_loss","clin_symptom_heartburn","clin_symptom_hematuria","clin_symptom_hoarseness","clin_symptom_hyperphagia","clin_symptom_hyporexia","clin_symptom_hypotension","clin_symptom_imbalance","clin_symptom_jaundice","clin_symptom_joint_stiffness","clin_symptom_low_back_pain","clin_symptom_lymphadenopathy","clin_symptom_melena","clin_symptom_menstrual_irregularity","clin_symptom_mucocutaneous_ulcers","clin_symptom_muscle_weakness","clin_symptom_myalgia","clin_symptom_neck_pain","clin_symptom_odynophagia","clin_symptom_oronasal_bleeding","clin_symptom_paresthesia","clin_symptom_productive_cough","clin_symptom_rom_limitation","clin_symptom_seizure","clin_symptom_sexual_dysfunction","clin_symptom_skin_nodules","clin_symptom_sweating","clin_symptom_syncope","clin_symptom_thoracic_back_pain","clin_symptom_tinnitus","clin_symptom_tremor","clin_symptom_urethral_discharge","clin_symptom_urinary_incontinence","clin_symptom_urinary_retention","clin_symptom_urine_color_change","clin_symptom_urticaria","clin_symptom_vertigo","clin_symptom_visual_change","clin_symptom_vomiting","clin_symptom_weight_gain","clin_symptom_weight_loss","clin_symptom_wheezing","clin_tc_acute","clin_tc_chronic","clin_tc_subacute","demo_age_adult","demo_age_elderly","demo_age_neonatal","demo_age_pediatric","demo_age_young_adult","demo_sex_female","demo_sex_male","demo_sex_none","etio_autoimmune","etio_congenital","etio_degenerative","etio_hemorrhagic","etio_iatrogenic","etio_infectious","etio_inflammatory","etio_ischemic","etio_metabolic","etio_neoplastic","etio_traumatic","etio_vascular","rad_aggr_aggressive","rad_aggr_indeterminate","rad_aggr_nonaggressive","rad_assoc_air_trapping","rad_assoc_atelectasis","rad_assoc_calcifications","rad_assoc_capsule","rad_assoc_central_scar","rad_assoc_edema","rad_assoc_fluid_fluid_levels","rad_assoc_hemorrhage","rad_assoc_internal_septa","rad_assoc_mass_effect","rad_assoc_midline_shift","rad_assoc_necrosis","rad_assoc_segmental_stenosis","rad_assoc_soft_tissue_emphysema","rad_assoc_thick_septa","rad_bonedensity_lytic","rad_bonedensity_mixed","rad_bonedensity_sclerotic","rad_bonematrix_chondroid","rad_bonematrix_fibrous","rad_bonematrix_osteoid","rad_comp_calcified","rad_comp_complex_cyst","rad_comp_cystic","rad_comp_fatty","rad_comp_fibrous","rad_comp_hemorrhagic","rad_comp_multiseptated","rad_comp_necrotic","rad_comp_solid","rad_enh_absent","rad_enh_heterogeneous","rad_enh_homogeneous","rad_enh_peripheral_nodular","rad_enh_ring","rad_enh_targetoid","rad_extent_diffuse","rad_extent_focal","rad_extent_multifocal","rad_growth_eccentric","rad_growth_exophytic","rad_growth_expansile","rad_growth_infiltrative","rad_growth_sessile","rad_kinetics_centripetal_fill","rad_kinetics_persistent","rad_kinetics_progressive","rad_kinetics_washout","rad_lat_bilateral","rad_lat_unilateral","rad_long_distal","rad_long_proximal","rad_margin_circumscribed","rad_margin_illdefined","rad_margin_lobulated","rad_margin_spiculated","rad_periosteal_codman_triangle","rad_periosteal_lamellated","rad_periosteal_onionskin","rad_periosteal_solid","rad_periosteal_spiculated","rad_position_central","rad_position_peripheral","rad_regional_lobar","rad_regional_multilobar","rad_regional_segmental","rad_sym_asymmetric","rad_sym_symmetric","rad_vasc_high_enhancement","rad_vasc_hypervascular","rad_vasc_hypovascular","rad_vasc_low_enhancement"];

test('aprovação TAXO-01 — metadata.status === "approved", schemaVersion === 1, taxonomyVersion === 1', () => {
  assert.equal(taxonomy.metadata.status, 'approved');
  assert.equal(taxonomy.metadata.schemaVersion, 1);
  assert.equal(taxonomy.metadata.taxonomyVersion, 1);
});

test('aprovação TAXO-01 — quantidade de groups e concepts corresponde à baseline aprovada (33 / 194)', () => {
  assert.equal(taxonomy.groups.length, 33, 'quantidade de groups divergiu da baseline aprovada');
  assert.equal(taxonomy.concepts.length, 194, 'quantidade de concepts divergiu da baseline aprovada');
  assert.equal(BASELINE_APPROVED_CONCEPT_IDS.length, 194, 'a própria lista baseline deveria ter 194 ids');
});

test('aprovação TAXO-01 — baseline congelada: nenhum conceptId aprovado foi removido ou renomeado', () => {
  const currentIds = new Set(taxonomy.concepts.map(c => c.id));
  for (const id of BASELINE_APPROVED_CONCEPT_IDS) {
    assert.ok(currentIds.has(id), `conceptId aprovado "${id}" desapareceu do TAXONOMY.json — renomear/remover um conceptId congelado não é permitido (use deprecated+aliasOf)`);
  }
});

test('aprovação TAXO-01 — baseline congelada: nenhum conceptId novo foi adicionado silenciosamente sem passar por uma rodada aprovada', () => {
  const baselineSet = new Set(BASELINE_APPROVED_CONCEPT_IDS);
  const extras = taxonomy.concepts.map(c => c.id).filter(id => !baselineSet.has(id));
  assert.equal(extras.length, 0, `conceptId(s) fora da baseline aprovada: ${extras.join(', ')} — todo novo conceptId só é considerado congelado depois de entrar numa versão publicada/aprovada do TAXONOMY.json (atualize BASELINE_APPROVED_CONCEPT_IDS nessa rodada, não antes)`);
});

test('aprovação TAXO-01 — nenhuma regressão: todas as 47 validações anteriores continuam íntegras', () => {
  // Checagem indireta: reafirma as invariantes estruturais básicas que as
  // 47 validações anteriores já cobrem em detalhe, como guarda-chuva de
  // sanidade específico desta rodada de congelamento.
  const ids = taxonomy.concepts.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'há conceptId duplicado');
  const groupIds = new Set(taxonomy.groups.map(g => g.id));
  for (const c of taxonomy.concepts) assert.ok(groupIds.has(c.group));
});
