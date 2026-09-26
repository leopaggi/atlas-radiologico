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
  sortDidacticItems:list=>list||[]
});
vm.runInContext('const CLINICAL_CASE_PRESENTATION_CLAMP = 140;\n'+[
  'escAttr','esc','clinicalCasePresentationHtml','wireClinicalCasePresentations',
  'didacticViewsHtml','clinicalCaseRowHtml','clinicalCasesSectionHtml'
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
  assert.match(views,/collapseCaseCaptions && im\.caption \? clinicalCasePresentationHtml\(im\.caption\) : esc\(im\.caption \|\| ''\)/);
  assert.match(extract('wireClinicalCasesToggle'),/wireClinicalCasePresentations\(ov\)/);
});

test('texto longo começa recolhido (~1,5 linha), íntegro no DOM, sem resumo nem botão extra',()=>{
  const markup=card(kase({presentation:long,notes:long}),[image(long)]);
  assert.equal((markup.match(/class="clinical-case-presentation is-clampable is-clamped"/g)||[]).length,3);
  assert.equal((markup.match(/role="button" tabindex="0" aria-expanded="false"/g)||[]).length,3);
  const narratives=markup.match(/class="clinical-case-presentation is-clampable is-clamped"[^>]*>[^<]+/g)||[];
  assert.equal(narratives.length,3);
  narratives.forEach(block=>assert.ok(block.endsWith(long),'texto integral no DOM, sem truncar'));
  assert.match(html,/\.clinical-case-presentation\.is-clampable\{cursor:pointer;/);
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

test('sinais/classificações usam a apresentação original da legenda (sem clamp novo)',()=>{
  const generic=ctx.didacticViewsHtml([{data:'https://example.org/img.jpg',caption:long,credit:'Fonte curta'}]);
  assert.doesNotMatch(generic,/clinical-case-presentation|is-clamped/);
  assert.match(generic,/<figcaption>TC: Massa pancreática/);
  assert.match(extract('radiologicSignHtml'),/didacticViewsHtml\(views\)/);
  assert.match(extract('classificationSchemeHtml'),/didacticViewsHtml\(didacticImageViews\(c, entry\)\)/);
});
