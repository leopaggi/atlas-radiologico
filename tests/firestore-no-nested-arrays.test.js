'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function fn(name) {
  const match = new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{').exec(html);
  assert.ok(match, name + ' não encontrada');
  let depth = 0, end = match.index + match[0].length - 1;
  for(; end < html.length; end++) {
    if(html[end] === '{') depth++;
    else if(html[end] === '}' && --depth === 0) break;
  }
  return html.slice(match.index, end + 1);
}
const ctx = vm.createContext({ Map, Set, Number });
vm.runInContext('const REVIEW_ATTEMPTS_MAX = 8;\n' + [
  'findNestedArrayPaths', 'reviewPromotionReached', 'reviewDemotionTriggered',
  'replayAutoReview', 'autoReviewBase', 'normalizeReviewAttempts', 'foldReviewProgress',
  'normalizeReviewProgressEntry', 'normalizeReviewProgress', 'reviewProgressToFirestore',
  'reviewProgressFromFirestore', 'mergeReviewProgress'
].map(fn).join('\n'), ctx);
const plain = value => JSON.parse(JSON.stringify(value));

// Estado com os campos da 093/093b/093c/093d e 092, além da 090b. Nenhum
// metadado real ou URL de paciente é necessário para reproduzir o problema.
const entry = {
  id:'seed_42', s:'Tórax', site:'Pulmão', name:'Exemplo',
  links:[{url:'https://example.org/reference', title:'Referência'}],
  images:[{data:'https://example.org/image.jpg', label:'Quadro', source:'cloudinary',
    assetId:'asset42', lesionId:'seed_42', panels:[{seq:'T2', x:0}],
    clinicalContext:{presentation:'Sintoma'}, clinicalContextUpdatedAt:{presentation:50},
    metaUpdatedAt:{label:60}}],
  clinicalCases:[{id:'case1', title:'Caso', patientAge:'40', patientSex:'F', modality:'MRI',
    presentation:'História', imageRefs:[{imageId:'asset:asset42', order:0, quizPick:'on', quizPickAt:70}]}],
  radiologicSigns:[{id:'sign1', title:'Sinal', imageRefs:[{imageId:'asset:asset42', order:0}]}],
  classificationSchemes:[{id:'scheme1', title:'Esquema', links:[{url:'https://example.org/scheme'}],
    imageRefs:[{imageId:'asset:asset42', order:0}]}]
};
const progress = {seed_42:{b:0, f:0, a:[[100,1,0],[101,1,1]]}};

test('diagnóstico aponta o caminho exato antes da codificação (meta, não imagens/chunks)', () => {
  const oldMeta = {reviewProgress:progress, review:{seed_42:1}};
  assert.deepEqual(plain(ctx.findNestedArrayPaths(oldMeta, 'atlas_state/main')),
    ['atlas_state/main.reviewProgress.seed_42.a[0]', 'atlas_state/main.reviewProgress.seed_42.a[1]']);
  assert.deepEqual(plain(ctx.findNestedArrayPaths([entry], 'DATA')), []);
});

test('payload final representativo não contém array diretamente dentro de array', () => {
  const meta = {reviewProgress:ctx.reviewProgressToFirestore(progress), review:{seed_42:1},
    reviewOverride:{}, lesionRevisions:{}, orderUpdatedAt:{}, tombstones:{},
    sectionOrder:['Tórax'], siteOrder:{Tórax:['Pulmão']}, chunkCount:1, revision:10};
  const chunk = {items:[entry]};
  assert.deepEqual(plain(ctx.findNestedArrayPaths(meta, 'atlas_state/main')), []);
  assert.deepEqual(plain(ctx.findNestedArrayPaths(chunk, 'atlas_state/chunk_0')), []);
  assert.deepEqual(plain(ctx.reviewProgressFromFirestore(meta.reviewProgress)), progress,
    'a leitura restaura as tuplas completas, sem mudar o Quiz/backup/IndexedDB');
  assert.deepEqual(plain(ctx.mergeReviewProgress(progress, ctx.reviewProgressFromFirestore(meta.reviewProgress))), progress,
    'o merge transacional preserva as tentativas');
});

test('guarda o caminho de erro sem limpar, achatar ou publicar parcialmente', () => {
  const nested = ctx.findNestedArrayPaths({items:[{images:[[1,2]]}]}, 'chunk');
  assert.deepEqual(plain(nested), ['chunk.items[0].images[0]']);
  const write = fn('writeShardedState');
  assert.match(write, /const firestoreMeta = \{\.\.\.metaPayload, reviewProgress: reviewProgressToFirestore\(writeProgress\)/);
  assert.match(write, /findNestedArrayPaths\(firestoreMeta, 'atlas_state\/main'\)/);
  assert.match(write, /findNestedArrayPaths\(gated\.data, 'DATA'\)/);
  assert.ok(write.indexOf('if(nested.length)') < write.indexOf('tx.set(FB_META_REF(), firestoreMeta)'));
  assert.match(write, /reviewProgressFromFirestore\(remoteMeta\.reviewProgress\)/);
  assert.match(fn('readShardedState'), /reviewProgress: reviewProgressFromFirestore\(meta\.reviewProgress\)/);
});

test('documento anterior sem progresso e cópia local antiga continuam legíveis', () => {
  assert.deepEqual(plain(ctx.reviewProgressFromFirestore(undefined)), {});
  assert.deepEqual(plain(ctx.reviewProgressFromFirestore(progress)), progress);
});
