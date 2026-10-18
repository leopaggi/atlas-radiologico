'use strict';

/*
 * migrate-vascular.js  (script TEMPORARIO de migracao pontual)
 *
 * Objetivo: eliminar a secao "Vascular" do array SEED do index.html,
 * redistribuindo as lesoes para as secoes anatomicas corretas e
 * renomeando o campo `site` de cada uma para "Vascular".
 *
 * v2 (2026-10-18): o SEED foi re-embutido a partir do backup atual, que
 * usa OUTRA numeracao de ids (ids posicionais mudam a cada re-embed).
 * Por isso o mapeamento passou a ser por NOME NORMALIZADO (nao por id),
 * preservando exatamente as mesmas decisoes clinicas da v1:
 *   NAME_TO_DEST  -> decisao explicita por lesao (grupos ambiguos: Aorta,
 *                    Veias, Sistema linfatico, Carotidas/vertebrais, excecoes)
 *   SITE_RULE     -> fallback por `site` para os grupos nao-ambiguos
 *
 * Uso:
 *   node scripts/migrate-vascular.js            -> dry-run (nao altera nada)
 *   node scripts/migrate-vascular.js --apply    -> reescreve o SEED no index.html
 *
 * O script NAO usa API/IndexedDB; opera somente no arquivo-fonte index.html.
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.resolve(__dirname, '..', 'index.html');
const APPLY = process.argv.includes('--apply');

const SEC = {
  NEURO: 'Neurorradiologia',
  CABECA: 'Cabeça e Pescoço',
  TORAX: 'Tórax',
  ABDOMEN: 'Abdômen Superior',
  MSK: 'Musculoesquelético'
};
const VALID_DESTINATIONS = new Set(Object.values(SEC));

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Decisao explicita por lesao (nome normalizado -> secao destino).
const NAME_TO_DEST = {
  "adenopatia inguinal reacional": SEC.MSK,
  "aneurisma de aorta abdominal": SEC.ABDOMEN,
  "aneurisma de aorta toracica": SEC.TORAX,
  "aneurisma de arteria esplenica": SEC.ABDOMEN,
  "aneurisma de arteria hepatica": SEC.ABDOMEN,
  "aneurisma de arteria poplitea": SEC.MSK,
  "aneurisma de arteria renal": SEC.ABDOMEN,
  "aneurisma intracraniano sacular": SEC.NEURO,
  "aortite takayasu celulas gigantes": SEC.TORAX,
  "aterosclerose carotidea extracraniana": SEC.CABECA,
  "coarctacao da aorta": SEC.TORAX,
  "compressao de veia cava inferior": SEC.ABDOMEN,
  "compressao extrinseca de arteria pulmonar": SEC.TORAX,
  "displasia fibromuscular arterial": SEC.MSK,
  "displasia fibromuscular de arteria renal": SEC.ABDOMEN,
  "disseccao aortica": SEC.TORAX,
  "disseccao arterial iatrogenica": SEC.MSK,
  "disseccao de arteria carotida interna cervical": SEC.CABECA,
  "disseccao de arteria periferica": SEC.MSK,
  "disseccao de arteria vertebral": SEC.CABECA,
  "disseccao espontanea da arteria celiaca": SEC.ABDOMEN,
  "disseccao espontanea de arteria mesenterica superior": SEC.ABDOMEN,
  "doenca arterial periferica estenose aterosclerotica": SEC.MSK,
  "doenca de buerger tromboangeite obliterante": SEC.MSK,
  "doenca de moyamoya": SEC.NEURO,
  "embolia arterial aguda": SEC.MSK,
  "embolia gasosa iatrogenica": SEC.TORAX,
  "embolizacao nao alvo": SEC.ABDOMEN,
  "endoleak pos evar": SEC.ABDOMEN,
  "estenose carotidea aterosclerotica": SEC.CABECA,
  "estenose de arteria pulmonar periferica": SEC.TORAX,
  "estenose de arteria renal aterosclerotica": SEC.ABDOMEN,
  "fenomeno de raynaud": SEC.MSK,
  "fistula arteriovenosa adquirida": SEC.MSK,
  "fistula arteriovenosa dural": SEC.NEURO,
  "fistula linfatica pos operatoria": SEC.MSK,
  "flebite superficial tromboflebite": SEC.MSK,
  "fratura de cateter com embolizacao de fragmento": SEC.TORAX,
  "hematoma intramural aortico": SEC.TORAX,
  "insuficiencia venosa cronica refluxo safeno": SEC.MSK,
  "isquemia arterial cronica de membro doenca arterial obstrutiva periferica avancada": SEC.MSK,
  "isquemia mesenterica cronica": SEC.ABDOMEN,
  "linfangiossarcoma sindrome de stewart treves": SEC.MSK,
  "linfedema primario ou secundario": SEC.MSK,
  "linfocele pos operatoria": SEC.MSK,
  "malformacao arteriovenosa cerebral": SEC.NEURO,
  "malformacao linfatica de partes moles": SEC.MSK,
  "malformacao venosa": SEC.MSK,
  "malposicionamento de cateter venoso central": SEC.TORAX,
  "migracao de stent dispositivo endovascular": SEC.MSK,
  "pseudoaneurisma aortico": SEC.TORAX,
  "pseudoaneurisma de arteria esplenica": SEC.ABDOMEN,
  "pseudoaneurisma de sitio de puncao arterial": SEC.MSK,
  "pseudoaneurisma pos cateterismo": SEC.MSK,
  "pseudoaneurisma traumatico de carotida cervical": SEC.CABECA,
  "quilotorax": SEC.TORAX,
  "ruptura de aneurisma de aorta abdominal": SEC.ABDOMEN,
  "ruptura traumatica da aorta": SEC.TORAX,
  "sindrome da unha amarela": SEC.MSK,
  "sindrome da veia cava superior": SEC.TORAX,
  "sindrome de budd chiari": SEC.ABDOMEN,
  "sindrome de may thurner": SEC.ABDOMEN,
  "sindrome de vasoconstricao cerebral reversivel": SEC.NEURO,
  "sindrome do aprisionamento da arteria poplitea": SEC.MSK,
  "sindrome do ligamento arqueado mediano": SEC.ABDOMEN,
  "sindrome do quebra nozes nutcracker": SEC.ABDOMEN,
  "tromboembolismo pulmonar agudo": SEC.TORAX,
  "trombose arterial aguda de membro": SEC.MSK,
  "trombose da veia renal": SEC.ABDOMEN,
  "trombose de acesso vascular para hemodialise": SEC.MSK,
  "trombose de arteria mesenterica superior": SEC.ABDOMEN,
  "trombose de seio venoso cerebral": SEC.NEURO,
  "trombose de veia mesenterica superior": SEC.ABDOMEN,
  "trombose de veia porta": SEC.ABDOMEN,
  "trombose venosa profunda": SEC.MSK,
  "ulcera aterosclerotica penetrante": SEC.TORAX,
  "vasculite pulmonar granulomatose com poliangiite": SEC.TORAX,
  "vasoespasmo cerebral pos hemorragia subaracnoidea": SEC.NEURO
};

// Fallback por `site` (grupos nao-ambiguos).
const SITE_RULE = {
  'Artérias pulmonares': SEC.TORAX,
  'Artérias viscerais abdominais': SEC.ABDOMEN,
  'Artérias periféricas': SEC.MSK
};

function findArrayBounds(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('declaracao nao encontrada: ' + marker);
  const jsonStart = start + marker.length;
  if (html[jsonStart] !== '[') throw new Error('esperado "[" em ' + jsonStart);
  let depth = 0, inString = false, esc = false;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return { jsonStart, jsonEnd: i }; }
  }
  throw new Error('fim do array nao encontrado');
}

function destFor(lesion) {
  const byName = NAME_TO_DEST[norm(lesion.name)];
  if (byName) return byName;
  return SITE_RULE[lesion.site] || null;
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const { jsonStart, jsonEnd } = findArrayBounds(html, 'const SEED = ');
  const raw = html.slice(jsonStart, jsonEnd + 1);
  const seed = JSON.parse(raw);
  const beforeCount = seed.length;

  const targets = seed.filter(l => l.s === 'Vascular');
  const results = [];
  const unmapped = [];

  for (const l of targets) {
    const dest = destFor(l);
    if (!dest || !VALID_DESTINATIONS.has(dest)) { unmapped.push(l); continue; }
    results.push({ id: l.id, name: l.name, fromSite: l.site, dest });
  }

  if (unmapped.length) {
    console.error('ABORTADO: lesoes sem destino definido:');
    for (const l of unmapped) console.error(`  ${l.id}  site="${l.site}"  ${l.name}`);
    process.exit(2);
  }

  let altUpdated = 0;
  for (const l of seed) {
    if (l.s === 'Vascular') {
      const dest = destFor(l);
      l.s = dest;
      l.site = 'Vascular';
    }
    if (Array.isArray(l.altPlacements)) {
      for (const p of l.altPlacements) {
        if (p && p.s === 'Vascular') {
          const dest = (l.s !== 'Vascular') ? l.s : destFor(l);
          if (dest) { p.s = dest; p.site = 'Vascular'; altUpdated += 1; }
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // VALIDACAO
  // ---------------------------------------------------------------
  const errors = [];
  if (seed.length !== beforeCount) errors.push(`contagem mudou: ${beforeCount} -> ${seed.length}`);
  const orphan = seed.filter(l => l.s === 'Vascular');
  if (orphan.length) errors.push(`${orphan.length} lesao(oes) ainda com s="Vascular"`);
  const vascSiteOutside = seed.filter(l => l.site === 'Vascular' && !VALID_DESTINATIONS.has(l.s));
  if (vascSiteOutside.length) errors.push(`${vascSiteOutside.length} lesao(oes) com site="Vascular" fora das secoes de destino`);
  const emptySite = seed.filter(l => !l.site || !String(l.site).trim());
  if (emptySite.length) errors.push(`${emptySite.length} lesao(oes) sem site`);
  const idsBefore = new Set(JSON.parse(raw).map(l => l.id));
  const idsAfter = new Set(seed.map(l => l.id));
  if (idsBefore.size !== idsAfter.size) errors.push('conjunto de IDs mudou');
  for (const id of idsBefore) if (!idsAfter.has(id)) errors.push(`ID perdido: ${id}`);

  const targetIds = new Set(targets.map(l => l.id));
  for (const l of seed) {
    if (!targetIds.has(l.id)) {
      const same = JSON.stringify(l) === JSON.stringify(JSON.parse(raw).find(x => x.id === l.id));
      if (!same) errors.push(`lesao nao-alvo alterada: ${l.id}`);
    }
  }

  const byDest = {};
  for (const r of results) byDest[r.dest] = (byDest[r.dest] || 0) + 1;

  console.log('== MIGRACAO VASCULAR ==');
  console.log(`Lesoes com s="Vascular": ${targets.length}`);
  console.log(`altPlacements com s="Vascular": ${altUpdated}`);
  console.log('Destinos:');
  for (const dest of VALID_DESTINATIONS) console.log(`  ${dest}: ${byDest[dest] || 0}`);
  console.log('\nMapeamento (id -> destino | site antigo):');
  for (const r of results) console.log(`  ${r.id}\t${r.dest}\t(${r.fromSite})\t${r.name}`);

  const newVascularSite = seed.filter(l => l.site === 'Vascular').length;
  console.log(`\nLesoes com site="Vascular" apos migracao: ${newVascularSite} (novo site, distribuido nas secoes de destino)`);
  console.log(`Lesoes com s="Vascular" apos migracao: ${orphan.length} (esperado 0)`);

  if (errors.length) {
    console.error('\nFALHAS DE VALIDACAO:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(3);
  }
  console.log('\nValidacao: OK (contagem preservada, nenhuma orfa, IDs intactos, somente s/site alterados).');

  if (!APPLY) {
    console.log('\n[DRY-RUN] index.html NAO foi alterado. Rode com --apply para gravar.');
    return;
  }

  const newRaw = JSON.stringify(seed);
  if (!newRaw.startsWith('[') || !newRaw.endsWith(']')) throw new Error('serializacao invalida');
  const newHtml = html.slice(0, jsonStart) + newRaw + html.slice(jsonEnd + 1);
  fs.writeFileSync(HTML_PATH, newHtml, 'utf8');
  console.log(`\n[APPLY] index.html gravado. SEED: ${raw.length} -> ${newRaw.length} chars.`);
}

main();
