'use strict';

// PROTEÇÃO 087 — sequência/protocolo de RM com texto LIVRE, mantendo as
// opções rápidas. Campos reais reaproveitados (sem schema novo):
//   - editor da lesão: a sequência é uma parte de `img.label` (" · "), igual
//     aos chips "Sequências / modalidade";
//   - construtor de quadro: `panels[].seq` (select + "Outra / personalizada…").
// Funções reais extraídas do index.html.

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

const ctx = vm.createContext({});
vm.runInContext("const CUSTOM_SEQUENCE_OPTION = '__custom__';\n" +
  ['escAttr', 'esc', 'normalizeCustomSequence', 'addSequenceToImageLabel', 'collageSeqSelectHtml', 'resolveCollageLabel', 'collageInitialDesc']
    .map((n) => extractFunction(html, n)).join('\n'), ctx);

const PRESETS = JSON.parse(/const seqs=(\[[^\]]*\]);/.exec(html)[1].replace(/'/g, '"'));
const EXAMPLES = ['T2 FAT SAT', 'PD FAT SAT', 'STIR', 'T1 pós-contraste FAT SAT', 'PD axial com supressão de gordura', 'DWI b1000', 'T2 Dixon'];

// Parse mínimo do HTML do seletor do quadro.
function parseSelect(markup) {
  const selected = /<option value="([^"]*)" selected>/.exec(markup);
  const input = /<input class="collage-seq-custom"[^>]*value="([^"]*)"([^>]*)>/.exec(markup);
  assert.ok(input, 'campo livre presente');
  return { selected: selected ? selected[1] : '', inputValue: input[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), inputHidden: /\bhidden\b/.test(input[2]) };
}

test('087: campo real — opções rápidas originais intactas (editor e quadro)', () => {
  assert.match(html, /\{ title: 'RM', items: \["RM T1","RM T2","RM T1 c\/ contraste","RM T2 FLAIR","RM Difusão \(DWI\)","RM ADC","AngioRM"\] \}/);
  assert.deepEqual(PRESETS, ['RX', 'MMG', 'U.S', 'TC C-', 'TC C+', 'RM T1', 'RM T2', 'RM T1 +', 'RM FLAIR', 'RM DIFUSAO', 'RM ADC', 'RM SWI', 'ANGIORM']);
});

test('087 QUADRO: opção pré-definida continua funcionando (selecionada, campo livre oculto)', () => {
  const p = parseSelect(ctx.collageSeqSelectHtml('RM T2', PRESETS));
  assert.deepEqual(p, { selected: 'RM T2', inputValue: '', inputHidden: true });
  const empty = parseSelect(ctx.collageSeqSelectHtml('', PRESETS));
  assert.deepEqual(empty, { selected: '', inputValue: '', inputHidden: true });
});

test('087 QUADRO: "Outra / personalizada…" existe e valor livre reabre selecionado nela, com o texto exato', () => {
  const markup = ctx.collageSeqSelectHtml('', PRESETS);
  assert.match(markup, /<option value="__custom__" >Outra \/ personalizada…<\/option>/);
  for (const v of EXAMPLES) {
    const p = parseSelect(ctx.collageSeqSelectHtml(v, PRESETS));
    assert.deepEqual(p, { selected: '__custom__', inputValue: v, inputHidden: false }, v);
  }
});

test('087 QUADRO: texto com aspas/< > é escapado no HTML e volta idêntico', () => {
  const v = 'T2 "FS" <axial> & sag';
  const markup = ctx.collageSeqSelectHtml(v, PRESETS);
  assert.doesNotMatch(markup, /<axial>/);
  assert.equal(parseSelect(markup).inputValue, v);
});

test('087 QUADRO: fiação — personalizada abre o campo e grava o texto (trim) em items[i].seq; opção padrão fecha e grava a opção', () => {
  const builder = extractFunction(html, 'openCollageBuilder');
  assert.match(builder, /\$\{collageSeqSelectHtml\(it\.seq, seqs\)\}/);
  assert.match(builder, /if\(e\.target\.value===CUSTOM_SEQUENCE_OPTION\)\{ customSeq\.hidden=false; items\[i\]\.seq=normalizeCustomSequence\(customSeq\.value\); customSeq\.focus\(\); \}/);
  assert.match(builder, /else \{ customSeq\.hidden=true; items\[i\]\.seq=e\.target\.value; \}/);
  assert.match(builder, /customSeq\.oninput=e=>\{items\[i\]\.seq=normalizeCustomSequence\(e\.target\.value\);\};/);
  assert.match(builder, /const panels=items\.map\(x=>\(\{url:x\.durableUrl\|\|x\.url, seq:x\.seq\|\|''\}\)\);/, 'persistido em panels[].seq como antes');
  assert.match(builder, /existingPanels\.map\(p=>\(\{file:null, url:p\.url, durableUrl:p\.url, seq:p\.seq\|\|''\}\)\)/, 'reabrir o quadro recarrega o seq exato');
});

test('087 QUADRO: sequência longa não é truncada no canvas — fonte reduz até caber (mín. 14px)', () => {
  const builder = extractFunction(html, 'openCollageBuilder');
  assert.match(builder, /let fs=28; ctx\.font='600 '\+fs\+'px Arial'; while\(fs>14 && ctx\.measureText\(lab\)\.width>cellW-16\)\{ fs-=2; ctx\.font='600 '\+fs\+'px Arial'; \}/);
});

test('087 QUADRO: legenda do quadro usa o texto real das sequências (sem descrição geral)', () => {
  assert.equal(ctx.resolveCollageLabel('', ['T2 FAT SAT', 'PD FAT SAT', 'STIR']), 'T2 FAT SAT · PD FAT SAT · STIR');
  assert.equal(ctx.collageInitialDesc('T2 FAT SAT · PD FAT SAT', ['T2 FAT SAT', 'PD FAT SAT']), '', 'join automático não vira descrição');
});

test('087: "T2 FAT SAT", "PD FAT SAT", "STIR" etc. são salvos EXATAMENTE (nunca viram opção pré-definida)', () => {
  for (const v of EXAMPLES) {
    assert.equal(ctx.addSequenceToImageLabel('', v), v);
    assert.equal(ctx.normalizeCustomSequence(v), v);
  }
  assert.notEqual(ctx.addSequenceToImageLabel('', 'PD FAT SAT'), 'PD');
  assert.equal(ctx.addSequenceToImageLabel('', 't2 fat sat'), 't2 fat sat', 'sem mudar caixa');
});

test('087: trim só externo; espaços internos preservados', () => {
  assert.equal(ctx.normalizeCustomSequence('   PD FAT SAT  \n'), 'PD FAT SAT');
  assert.equal(ctx.normalizeCustomSequence('T2  FAT   SAT'), 'T2  FAT   SAT');
  assert.equal(ctx.addSequenceToImageLabel('RM T1', '  STIR  '), 'RM T1 · STIR');
});

test('087: vazio/só espaços é seguro — não altera a legenda nem grava lixo', () => {
  assert.equal(ctx.addSequenceToImageLabel('RM T2', '   '), 'RM T2');
  assert.equal(ctx.addSequenceToImageLabel('RM T2', null), 'RM T2');
  assert.equal(ctx.addSequenceToImageLabel(undefined, ''), '');
  assert.equal(ctx.normalizeCustomSequence(undefined), '');
  const p = parseSelect(ctx.collageSeqSelectHtml('   ', PRESETS));
  assert.equal(p.selected, '__custom__', 'valor só com espaços continua visível para correção, nunca vira opção');
  assert.equal(ctx.resolveCollageLabel('', ['', 'STIR']), 'STIR', 'painel vazio não entra na legenda');
});

test('087 EDITOR: combinado com opções rápidas — sem duplicar, sem apagar as outras; troca padrão <-> personalizada', () => {
  let label = ctx.addSequenceToImageLabel('', 'RM T2');                 // padrão
  label = ctx.addSequenceToImageLabel(label, 'PD FAT SAT');              // + personalizada
  assert.equal(label, 'RM T2 · PD FAT SAT');
  assert.equal(ctx.addSequenceToImageLabel(label, 'PD FAT SAT'), label, 'não duplica');
  // o chip padrão remove só a opção dele (mesma lógica de parts do chip)
  const parts = label.split('·').map((s) => s.trim()).filter(Boolean);
  parts.splice(parts.indexOf('RM T2'), 1);
  assert.equal(parts.join(' · '), 'PD FAT SAT', 'personalizada sobrevive à remoção do chip padrão');
  // quadro: trocar de personalizada para padrão e de volta
  assert.deepEqual(parseSelect(ctx.collageSeqSelectHtml('RM SWI', PRESETS)).selected, 'RM SWI');
  assert.deepEqual(parseSelect(ctx.collageSeqSelectHtml('SWI minIP', PRESETS)).selected, '__custom__');
});

test('087 EDITOR: fiação — linha "Outra / personalizada" com campo + botão; Enter não submete o formulário', () => {
  const src = html.slice(html.indexOf('function renderImgGallery(){'), html.indexOf("item.querySelector('.img-gallery-remove')"));
  assert.match(src, /Outra \/ personalizada/);
  assert.match(src, /class="img-gallery-custom-seq-input"/);
  assert.match(src, /const next = addSequenceToImageLabel\(pendingImgs\[idx\]\.label, v\);/);
  assert.match(src, /if\(ev\.key==='Enter'\)\{ ev\.preventDefault\(\); addCustomSeq\(\); \}/);
  assert.match(src, /if\(!v\)\{ toast\(/, 'vazio avisa e não grava');
  // o chip padrão continua exatamente como antes
  assert.match(src, /if\(at>=0\) parts\.splice\(at,1\); else parts\.push\(preset\);/);
});

test('087: reabrir a edição mostra o valor (a legenda é carregada como está do registro)', () => {
  assert.match(html, /pendingImgs = imgs\.map\(i=>\(\{\.\.\.i, label:\[i\.modality,i\.label\]\.filter\(Boolean\)\.join\(' '\)\.trim\(\), source:i\.source\|\|'local'\}\)\);/);
  assert.match(html, /<textarea class="img-gallery-label"[^>]*>\$\{esc\(img\.label\|\|''\)\}<\/textarea>/, 'textarea exibe o texto real');
});

test('087: F5 / backup (serialize-deserialize JSON) preserva o texto exato em label e panels[].seq', () => {
  const entry = { id: 'seed_1', images: [{ data: 'https://x/1.jpg', label: ctx.addSequenceToImageLabel('RM T1', ' PD FAT SAT '), panels: [{ url: 'u1', seq: 'T2 FAT SAT' }, { url: 'u2', seq: 'STIR' }] }] };
  const back = JSON.parse(JSON.stringify({ format: 'atlas-radiologico-backup', data: [entry] })).data[0];
  assert.equal(back.images[0].label, 'RM T1 · PD FAT SAT');
  assert.deepEqual(back.images[0].panels.map((p) => p.seq), ['T2 FAT SAT', 'STIR']);
});

test('087: registro antigo (presets) continua válido e sem migração — nenhuma rotina reescreve label/seq', () => {
  assert.equal(ctx.addSequenceToImageLabel('RM T2 · RM ADC', 'RM ADC'), 'RM T2 · RM ADC');
  assert.deepEqual(parseSelect(ctx.collageSeqSelectHtml('RM FLAIR', PRESETS)).selected, 'RM FLAIR');
  assert.doesNotMatch(html, /\.seq\s*=\s*(?!normalizeCustomSequence|e\.target\.value)[^=]/, 'seq só é gravado pela UI do quadro');
});
