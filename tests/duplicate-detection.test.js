'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const EXPECTED_SEED_COUNT = 1197;

let html = null;
let inlineScripts = [];
let seedSource = null;
let seed = null;
let duplicatePairsSource = null;

function declarations(source, name) {
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`, 'g');
  return [...source.matchAll(pattern)];
}

function extractDelimited(source, start) {
  const closing = { '[': ']', '{': '}', '(': ')' };
  const first = source[start];
  assert.ok(closing[first], `Delimitador inicial invalido na posicao ${start}`);

  const stack = [closing[first]];
  let quote = null;
  let escaped = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (closing[char]) stack.push(closing[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`Bloco iniciado na posicao ${start} nao foi fechado`);
}

function extractAssignedArray(source, match) {
  const equals = source.indexOf('=', match.index);
  const start = source.indexOf('[', equals + 1);
  assert.ok(start > equals, `Array nao encontrado depois de ${match[0]}`);
  return extractDelimited(source, start);
}

function splitTopLevelArray(arraySource) {
  const body = arraySource.slice(1, -1);
  const entries = [];
  const stack = [];
  const closing = { '[': ']', '{': '}', '(': ')' };
  let quote = null;
  let escaped = false;
  let entryStart = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (closing[char]) stack.push(closing[char]);
    else if (char === stack[stack.length - 1]) stack.pop();
    else if (char === ',' && stack.length === 0) {
      entries.push(body.slice(entryStart, index).trim());
      entryStart = index + 1;
    }
  }

  const last = body.slice(entryStart).trim();
  if (last) entries.push(last);
  return entries;
}

test('index.html existe e pode ser lido', () => {
  assert.equal(fs.existsSync(INDEX_PATH), true, `Arquivo ausente: ${INDEX_PATH}`);
  html = fs.readFileSync(INDEX_PATH, 'utf8');
  assert.ok(html.length > 0, 'index.html esta vazio');
});

test('SEED tem uma unica localizacao segura no script inline', () => {
  assert.ok(html, 'index.html nao foi carregado');
  inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]));
  assert.equal(inlineScripts.length, 1, 'Esperado exatamente um script inline');

  const seedDeclarations = declarations(html, 'SEED');
  assert.equal(seedDeclarations.length, 1, 'SEED deve possuir uma unica declaracao');

  const script = inlineScripts[0];
  const scriptStart = script.index + script[0].indexOf(script[2]);
  const scriptEnd = scriptStart + script[2].length;
  assert.ok(
    seedDeclarations[0].index >= scriptStart && seedDeclarations[0].index < scriptEnd,
    'SEED deve estar contido no script inline'
  );

  seedSource = extractAssignedArray(html, seedDeclarations[0]);
  seed = JSON.parse(seedSource);
  assert.ok(Array.isArray(seed), 'SEED deve ser um array JSON estatico');
});

test('SEED possui a quantidade esperada de registros', () => {
  assert.ok(Array.isArray(seed), 'SEED nao foi extraido');
  assert.equal(seed.length, EXPECTED_SEED_COUNT);
  console.log(`SEED: ${seed.length} registros`);
});

test('todos os registros possuem IDs unicos no padrao seed_<N>', () => {
  assert.ok(Array.isArray(seed), 'SEED nao foi extraido');
  const missing = [];
  const invalid = [];
  const seen = new Map();
  const repeated = [];

  seed.forEach((entry, index) => {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      missing.push(index);
      return;
    }
    if (!/^seed_\d+$/.test(entry.id)) invalid.push(entry.id);
    if (seen.has(entry.id)) repeated.push(`${entry.id} (indices ${seen.get(entry.id)} e ${index})`);
    else seen.set(entry.id, index);
  });

  assert.deepEqual(missing, [], `Registros sem ID nos indices: ${missing.join(', ')}`);
  assert.deepEqual(invalid, [], `IDs invalidos: ${invalid.join(', ')}`);
  assert.deepEqual(repeated, [], `IDs repetidos: ${repeated.join(', ')}`);
});

test('SEED nao possui duplicatas exatas por s + site + name', () => {
  assert.ok(Array.isArray(seed), 'SEED nao foi extraido');
  const groups = new Map();
  for (const entry of seed) {
    const key = JSON.stringify([entry && entry.s, entry && entry.site, entry && entry.name]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry && entry.id);
  }
  const duplicates = [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => `${key}: ${ids.join(', ')}`);

  assert.deepEqual(
    duplicates,
    [],
    `${duplicates.length} grupo(s) duplicado(s):\n${duplicates.join('\n')}`
  );
});

test('DUPLICATE_PAIRS_V171 (lista fixa de IDs, sempre no-op) foi removida', () => {
  assert.ok(html, 'index.html nao foi carregado');
  // ALTERAÇÃO 2026-11-06: a lista fixa de pares de IDs seed_N (posicionais,
  // portanto instaveis entre execucoes) foi substituida por deteccao
  // dinamica de identidade. Este teste passa a confirmar a remocao
  // completa, nao mais a forma da lista antiga.
  assert.equal(declarations(html, 'DUPLICATE_PAIRS_V171').length, 0,
    'DUPLICATE_PAIRS_V171 nao deveria mais existir no codigo');
  assert.equal(/function\s+mergeDuplicateEntryV171\s*\(/.test(html), false,
    'mergeDuplicateEntryV171 nao deveria mais existir no codigo');
  assert.equal(/function\s+deduplicateV171\s*\(/.test(html), false,
    'deduplicateV171 nao deveria mais existir no codigo');
});

function functionDeclarations(source, name) {
  const pattern = new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'g');
  return [...source.matchAll(pattern)];
}

test('autoDeduplicateByIdentity existe e usa exactLesionIdentityKey (s+site+name), nunca lista fixa de IDs', () => {
  assert.ok(html, 'index.html nao foi carregado');
  const fnDeclarations = functionDeclarations(html, 'autoDeduplicateByIdentity');
  assert.equal(fnDeclarations.length, 1, 'autoDeduplicateByIdentity deve possuir uma unica declaracao');

  const planDeclarations = functionDeclarations(html, 'planAutoDeduplicateByIdentity');
  assert.equal(planDeclarations.length, 1, 'planAutoDeduplicateByIdentity deve possuir uma unica declaracao');
  const planStart = html.indexOf('{', planDeclarations[0].index);
  const planBody = extractDelimited(html, planStart);
  assert.ok(planBody.includes('exactLesionIdentityKey'),
    'planAutoDeduplicateByIdentity deve agrupar por exactLesionIdentityKey (s+site+name), nao por lista fixa de IDs');
  assert.ok(planBody.includes('lesionRealImagesForMerge'),
    'planAutoDeduplicateByIdentity deve escolher o keeper por imagens reais, igual a fusao clinica controlada 091c');

  const fnStart = html.indexOf('{', fnDeclarations[0].index);
  const fnBody = extractDelimited(html, fnStart);
  assert.ok(fnBody.includes('foldLesionMergesIntoGlobals'),
    'autoDeduplicateByIdentity deve reaproveitar o motor de fusao ja testado (LESION_MERGES/foldLesionMergesIntoGlobals)');
  assert.ok(fnBody.includes("createSafetySnapshot('antes de forçar fusão de duplicatas')"),
    'autoDeduplicateByIdentity deve criar snapshot de seguranca antes de aplicar a fusao automatica');
});

test('JavaScript inline possui sintaxe valida sem ser executado', () => {
  assert.ok(inlineScripts.length > 0, 'Script inline nao foi localizado');
  for (const script of inlineScripts) {
    new vm.Script(script[2], { filename: 'index.html:inline-script' });
  }
});
