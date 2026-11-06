'use strict';

// Testa os helpers REAIS do HTML; nenhuma lesão, imagem ou backup é gravado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function extract(name){
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(html);
  assert.ok(m, name + ' ausente');
  const open = html.indexOf('{', m.index + m[0].length);
  let depth=0, quote='', escaped=false, line=false, block=false;
  for(let i=open;i<html.length;i++){
    const c=html[i], n=html[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return html.slice(m.index,i+1);
  }
  throw new Error('Função incompleta: '+name);
}
const ctx=vm.createContext({
  linkedImageViews:(c,e)=>e.images.map(img=>({data:img.data, caption:img.label, credit:img.credit})),
  sortDidacticItems:list=>list||[],
  didacticImageViews:()=>[]
});
vm.runInContext('const CLINICAL_CASE_PRESENTATION_CLAMP = 140;\nconst DIDACTIC_TEXT_CLAMP = 220;\nconst DIDACTIC_SIGN_STRENGTHS = { suggestive:"Sugestivo", specific:"Específico", pathognomonic:"Patognomônico" };\n'+[
  'escAttr','esc','clinicalCasePresentationHtml',
  // lrev_mulfu0x2_didclamp — wireClinicalCasePresentations passou a delegar
  // o toggle pra wireClampToggles (reaproveitado também por
  // wireDidacticTextClamps, ver tests/didactic-text-collapse.test.js);
  // precisa estar no mesmo contexto vm, senão ReferenceError ao chamar.
  'wireClampToggles','wireClinicalCasePresentations',
  'didacticViewsHtml','clinicalCaseRowHtml','clinicalCasesSectionHtml',
  'renderDidacticRichText','didacticTextHtml','radiologicSignHtml'
].map(extract).join('\n'),ctx);
const long='TC: Massa pancreática com atenuação muito baixa e discreta heterogeneidade. '.repeat(4);
const short='TC: achado focal.';
const image=(label,credit='Fonte curta')=>({data:'https://example.org/image.jpg',label,credit});
const kase=(over={})=>({title:'Título preservado',source:'Radiopaedia',patientAge:'40',patientSex:'Feminino',modality:'TC',
  sourceUrl:'https://radiopaedia.org/cases/example',presentation:'História breve.', ...over});
const card=(c,images=[])=>ctx.clinicalCaseRowHtml(c,{images});
function fakeEl(){
  const classes=new Set(['clinical-case-presentation','is-clampable','is-clamped']);
  const attrs={'aria-expanded':'false'};
  return {classes,attrs,focused:true,classList:{toggle(name){if(classes.has(name)){classes.delete(name);return false;}classes.add(name);return true;}},
    setAttribute(name,value){attrs[name]=value;}};
}

test('campos reais: presentation já usa 093d; notes e legenda vinculada reutilizam o mesmo helper só no card',()=>{
  const src=extract('clinicalCaseRowHtml');
  assert.match(src,/clinicalCasePresentationHtml\(c\.presentation\)/);
  assert.match(src,/clinicalCasePresentationHtml\(c\.notes\)/);
  assert.match(src,/didacticViewsHtml\(linkedImageViews\(c, entry\), true\)/);
  const views=extract('didacticViewsHtml');
  // 2026-11-06: legenda de imagem (sinais/classificações) passou a usar
  // didacticTextHtml (clamp de ~3 linhas) em vez de esc() sem limite nenhum
  // — ver testes "sinais/classificações: legenda de imagem longa..." abaixo.
  assert.match(views,/collapseCaseCaptions \? clinicalCasePresentationHtml\(im\.caption\) : didacticTextHtml\(im\.caption\)/);
  assert.match(extract('wireClinicalCasesToggle'),/wireClinicalCasePresentations\(ov\)/);
});

test('texto longo começa recolhido (~1,5 linha), íntegro no DOM, sem resumo nem botão extra',()=>{
  const markup=card(kase({presentation:long,notes:long}),[image(long)]);
  assert.equal((markup.match(/class="clinical-case-presentation is-clampable is-clamped"/g)||[]).length,3);
  assert.equal((markup.match(/role="button" tabindex="0" aria-expanded="false"/g)||[]).length,3);
  const narratives=markup.match(/class="clinical-case-presentation is-clampable is-clamped"[^>]*>[^<]+/g)||[];
  assert.equal(narratives.length,3);
  narratives.forEach(block=>assert.ok(block.endsWith(long),'texto integral no DOM, sem truncar'));
  // lrev_mulfu0x2_didclamp — cursor/foco do .is-clampable generalizaram (sem
  // o prefixo .clinical-case-presentation) pra serem reaproveitados por
  // .didactic-text; o teto (max-height) continua por componente.
  assert.match(html,/\.is-clampable\{cursor:pointer;/);
  assert.match(html,/\.clinical-case-presentation\.is-clamped\{max-height:2\.1em;line-height:1\.4;overflow:hidden;/);
  assert.doesNotMatch(markup,/ver mais/i);
});

test('textos curtos não recebem clamp, papel de botão ou tabindex desnecessários',()=>{
  const markup=card(kase({presentation:short,notes:'Sem outras observações.'}),[image(short)]);
  assert.equal((markup.match(/class="clinical-case-presentation"/g)||[]).length,3);
  assert.doesNotMatch(markup,/is-clamped|is-clampable|aria-expanded="false"|tabindex="0"/);
});

test('clique expande e novo clique recolhe sem perda de foco; Enter/Espaço usam o mesmo toggle',()=>{
  const el=fakeEl(), root={querySelectorAll:()=>[el]};
  ctx.wireClinicalCasePresentations(root);
  el.onclick(); assert.equal(el.classes.has('is-clamped'),false); assert.equal(el.attrs['aria-expanded'],'true');
  el.onclick(); assert.equal(el.classes.has('is-clamped'),true); assert.equal(el.attrs['aria-expanded'],'false');
  let prevented=0;
  el.onkeydown({key:'Enter',preventDefault(){prevented++;}});
  assert.equal(el.attrs['aria-expanded'],'true');
  el.onkeydown({key:'Enter',preventDefault(){prevented++;}});
  assert.equal(el.attrs['aria-expanded'],'false');
  el.onkeydown({key:' ',preventDefault(){prevented++;}});
  assert.equal(el.attrs['aria-expanded'],'true');
  el.onkeydown({key:' ',preventDefault(){prevented++;}});
  assert.equal(el.attrs['aria-expanded'],'false');
  assert.equal(prevented,4);assert.equal(el.focused,true);
  assert.doesNotMatch(extract('wireClinicalCasePresentations'),/\.blur\(|remove\(|innerHTML/);
});

test('blocos longos no mesmo card alternam independentemente',()=>{
  const markup=card(kase({presentation:long,notes:long}),[image(long),image(long)]);
  assert.equal((markup.match(/class="clinical-case-presentation is-clampable is-clamped"/g)||[]).length,4);
  const els=Array.from({length:4},fakeEl);
  ctx.wireClinicalCasePresentations({querySelectorAll:()=>els});
  els[2].onclick();
  assert.deepEqual(els.map(x=>x.attrs['aria-expanded']),['false','false','true','false']);
  els[3].onkeydown({key:' ',preventDefault(){}});
  assert.deepEqual(els.map(x=>x.attrs['aria-expanded']),['false','false','true','true']);
  els[2].onclick();
  assert.deepEqual(els.map(x=>x.attrs['aria-expanded']),['false','false','false','true']);
});

test('título, fonte, idade/sexo, modalidade, crédito, imagem e Abrir caso não entram no clamp',()=>{
  const markup=card(kase({presentation:long,notes:long}),[image(long,'Fonte curta')]);
  const first=markup.indexOf('clinical-case-presentation');
  for(const s of ['Título preservado','Radiopaedia','40 anos','Feminino','Modalidade: TC'])
    assert.ok(markup.indexOf(s)>=0 && markup.indexOf(s)<first,s);
  assert.match(markup,/<img class="didactic-img"/);
  assert.match(markup,/<span class="didactic-credit">— Fonte curta<\/span>/);
  assert.match(markup,/<a class="detail-link"[^>]*>↗ Abrir caso<\/a>/);
  assert.ok(markup.indexOf('↗ Abrir caso')<markup.indexOf('didactic-images'));
  assert.equal((markup.match(/class="clinical-case-presentation is-clampable is-clamped"/g)||[]).length,3);
});

test('2026-11-06 — sinais/classificações: legenda de imagem longa agora usa o clamp de ~3 linhas (didactic-text), não mais sem limite nenhum',()=>{
  // Achado real do usuário: "Lesão de Pellegrini-Stieda" tinha description E
  // notes vazios — o texto gigante vinha da LEGENDA da imagem vinculada ao
  // sinal radiológico (im.caption), que nunca passava por nenhum clamp aqui
  // (nem o teto curto de clinical-case-presentation, nem o de didactic-text).
  const generic=ctx.didacticViewsHtml([{data:'https://example.org/img.jpg',caption:long,credit:'Fonte curta'}]);
  assert.doesNotMatch(generic,/clinical-case-presentation/);
  assert.match(generic,/<figcaption><div class="didactic-text is-clampable is-clamped"/);
  assert.match(generic,/<span class="didactic-credit">— Fonte curta<\/span>/);
  assert.match(extract('radiologicSignHtml'),/didacticViewsHtml\(views\)/);
  assert.match(extract('classificationSchemeHtml'),/didacticViewsHtml\(didacticImageViews\(c, entry\)\)/);
});

test('2026-11-06 — sinais/classificações: legenda curta de imagem não ganha clamp nem botão',()=>{
  const generic=ctx.didacticViewsHtml([{data:'https://example.org/img.jpg',caption:short,credit:'Fonte curta'}]);
  assert.doesNotMatch(generic,/is-clamped|is-clampable|clinical-case-presentation/);
  assert.match(generic,/<figcaption><div class="didactic-text"><p>TC: achado focal\./);
});

test('2026-11-06 — sinal radiológico: texto longo em "notes" também recebe o clamp de ~3 linhas (antes escapava sem limite nenhum)',()=>{
  const sign={id:'s1',title:'Sinal de Pellegrini-Stieda',strength:'suggestive',description:short,modality:'RX',notes:long,referenceUrl:''};
  const markup=ctx.radiologicSignHtml(sign,{images:[]});
  // o "notes" longo precisa estar dentro do mesmo wrapper clicável/clampável
  // usado pelo "description" — nunca mais num <div class="didactic-meta">
  // solto, que renderizava o texto inteiro sem nenhum limite.
  assert.doesNotMatch(markup,/<div class="didactic-meta">TC: Massa pancreática/);
  assert.match(markup,/class="didactic-text is-clampable is-clamped"[^>]*>[\s\S]*TC: Massa pancreática/);
  assert.equal((markup.match(/is-clampable is-clamped/g)||[]).length,1,'só o notes longo deveria clampar aqui (description é curto)');
});

test('2026-11-06 — sinal radiológico: "notes" curto continua sem clamp (comportamento preservado)',()=>{
  const sign={id:'s2',title:'Sinal curto',strength:'specific',description:short,modality:'TC',notes:'Achado incidental.',referenceUrl:''};
  const markup=ctx.radiologicSignHtml(sign,{images:[]});
  assert.doesNotMatch(markup,/is-clampable|is-clamped/);
  assert.match(markup,/class="didactic-text"><p>Achado incidental\./);
});
