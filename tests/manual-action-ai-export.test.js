'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');

function fn(name){
  const re=new RegExp('\\b(?:async\\s+)?function\\s+'+name+'\\s*\\(');
  const m=re.exec(html); assert.ok(m,name+' ausente');
  const open=html.indexOf('{',m.index+m[0].length);
  let depth=0,quote='',esc=false,line=false,block=false;
  for(let i=open;i<html.length;i++){
    const c=html[i],n=html[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(m.index,i+1);
  }
  throw new Error('função não fechada '+name);
}
const names=['normalizeExternalTitle','normalizeRadiopaediaCaseTitle','tokenizeExternalTitle','externalTokenOverlap','levNormSimilarity','externalMatchBand',
  'reviewScope','isGlobalReview','buildReviewAiAttempts','resolveLatestHumanFeedback',
  'structuralReviewPick','structuralReviewImageMeta','structuralSectionOf','structuralSiteOf','hasStrongAnatomicConflict',
  'structuralReviewRecord','findStructuralReviewCandidates',
  'buildManualActionAiBatch','openManualActionCopyFallback','copyManualActionAiBatch'];
const consts=html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '),html.indexOf('// Tokens relevantes:',html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping=html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '),html.indexOf('function structuralReviewPick('));
function ctxFixture(){
  const source={id:'seed_698',name:'Cistadenoma mucinoso ovariano',s:'Ginecologia',site:'Ovário',notes:'Linha 1\nLinha 2',classification:'O-RADS',
    tags:['O-RADS'],enTerm:'ovarian mucinous cystadenoma',images:[{label:'TC',source:'cloudinary',assetId:'A1',publicId:'p1',data:'https://res.cloudinary.com/x/A1.jpg',_file:'BINARIO',secret:'NAO COPIAR',clinicalContext:{presentation:'dor'}}],
    altPlacements:[{s:'Outra',site:'Ovário',extra:'omitido'}],links:[{label:'Referência',url:'https://example.org/ok'}],
    clinicalCases:[{id:'c1',title:'Caso',imageRefs:[{imageId:'asset:A1',quizPick:'on',quizPickAt:42}],presentation:'dor'}],
    radiologicSigns:[{id:'s1',title:'Sinal'}],classificationSchemes:[{id:'k1',title:'O-RADS',content:'Esquema'}]};
  const clone={id:'seed_208',name:'Cistoadenoma mucinoso',s:'Ginecologia',site:'Ovário',notes:'Clone',classification:'O-RADS',tags:['mucinoso'],enTerm:'mucinous cystadenoma'};
  const other={id:'u_other',name:'Carcinoma seroso de alto grau do ovário',s:'Ginecologia',site:'Ovário',tags:['seroso']};
  const DATA=[source,clone,other];
  const LESION_REVISIONS={
    R1:{id:'R1',lesionId:'seed_698',status:'manual_action_required',requestText:'LESÃO DUPLICADA — fundir clone',
      manualAction:{type:'duplicate_merge',description:'Localizar clone'},solution:{text:'Análise',summary:'Resumo',reasoning:'Razão'},
      history:[{timestamp:10,action:'solution_proposed',details:{solution:{text:'texto antigo',summary:'s',reasoning:'r',createdAt:10}}}],lastHumanFeedback:'Corrigir',rejectionReason:'não',rollbackReason:'voltar'},
    R2:{id:'R2',lesionId:'seed_698',status:'manual_action_required',requestText:'remover localização adicional renal',
      manualAction:{type:'additional_section_placement',description:'localização'}},
    G:{id:'G',scope:'global',lesionId:null,status:'manual_action_required',requestText:'auditar catálogo',category:'audit'},
    P:{id:'P',lesionId:'seed_698',status:'pending',requestText:'pendente'}
  };
  const ctx=vm.createContext({DATA,LESION_REVISIONS,REVIEW:{seed_698:1},SRS:{seed_698:{due:123}},
    APPROVED_CLINICAL_MERGES_091C:[],LESION_MERGES:{},toast:()=>{},navigator:{clipboard:{writeText:async()=>{}}},console,document:{}});
  vm.runInContext(consts+'\n'+mapping+'\n'+names.map(fn).join('\n'),ctx);
  return ctx;
}
const plain=o=>JSON.parse(JSON.stringify(o));

test('botões individual/lote só na aba manual e preservam ações atuais',()=>{
  const src=fn('openReadySolutionsModal');
  assert.match(src,/review-manual-copy-all/);
  assert.match(src,/review-manual-copy-one/);
  assert.match(src,/getManualActionSolutions\(\)\.map\(r=>r\.id\)/);
  for(const cls of ['review-manual-open','review-open-history','review-edit-request','reviewResolveButtonHtml(r)',
    'review-manual-reopen','review-cancel-request']) assert.ok(src.includes(cls),cls);
});
test('um envelope para individual e lote; JSON válido com acentos/quebras; ids estáveis',()=>{
  const c=ctxFixture();
  const one=plain(c.buildManualActionAiBatch(['R1']));
  assert.equal(one.type,'atlas_manual_action_batch');assert.equal(one.version,1);
  assert.equal(one.count,1);assert.equal(one.actions[0].reviewId,'R1');
  const many=plain(c.buildManualActionAiBatch(['R1','R2','G']));
  assert.equal(many.count,3);assert.deepEqual(many.actions.map(x=>x.reviewId),['R1','R2','G']);
  assert.equal(JSON.parse(JSON.stringify(many)).actions[0].source.notes,'Linha 1\nLinha 2');
  assert.equal(many.actions[1].candidateRecords.length,0,'ação não duplicata sem candidatos inventados');
  assert.equal(many.actions[2].source,null,'global sem lesão');
  assert.equal(many.actions[2].scope,'global');
});
test('DATA atual prevalece; candidato declarado inclui classification/tags/notes e reason explicável',()=>{
  const c=ctxFixture();
  c.DATA[0].notes='Atual no DATA';
  const action=plain(c.buildManualActionAiBatch(['R1'])).actions[0];
  assert.equal(action.source.notes,'Atual no DATA');
  assert.equal(action.candidateRecords.length,1);
  assert.equal(action.candidateRecords[0].id,'seed_208');
  assert.ok(action.candidateRecords[0].candidateReason.includes('declared_candidate_name'));
  assert.equal(action.candidateRecords[0].classification,'O-RADS');
  assert.deepEqual(action.candidateRecords[0].tags,['mucinoso']);
});
test('candidato declarado via enTerm: Paraovarian cyst aponta ao cisto paratubário sem virar diagnóstico',()=>{
  const c=ctxFixture();
  c.DATA[0].name='Cisto paraovariano';c.DATA[0].enTerm='Paraovarian cyst';
  c.DATA[0].s='Ginecologia';c.DATA[0].site='Ovário';
  c.DATA.push({id:'seed_9',name:'Cisto paratubário (cisto de Morgagni)',s:'Ginecologia',site:'Ovário'});
  const candidates=plain(c.findStructuralReviewCandidates(c.LESION_REVISIONS.R1,c.DATA[0]));
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].id,'seed_9');
  assert.ok(candidates[0].candidateReason.includes('declared_candidate_name'));
});
test('nomes parecidos com histologia oposta não viram candidatos técnicos',()=>{
  const c=ctxFixture();
  c.DATA.push({id:'seed_7',name:'Cistadenoma seroso ovariano',s:'Ginecologia',site:'Ovário'});
  const candidates=plain(c.findStructuralReviewCandidates(c.LESION_REVISIONS.R1,c.DATA[0]));
  assert.ok(candidates.some(x=>x.id==='seed_208'));
  assert.ok(!candidates.some(x=>x.id==='seed_7'),'seroso ≠ mucinoso mesmo na mesma seção/site');
});
test('real: seroso ovariano inclui seed_207 mas exclui seed_156 de pâncreas; enTerm legado fica sinalizado',()=>{
  const c=ctxFixture(), s=c.DATA[0];
  s.id='seed_697';s.name='Cistadenoma seroso ovariano';s.s='Pelve Feminina';s.site='Ovário';s.enTerm='serous ovarian cystadenoma';
  c.LESION_REVISIONS.R1.lesionId=s.id;
  c.DATA.splice(1,2,
    {id:'seed_156',name:'Cistoadenoma seroso',s:'Abdômen Superior',site:'Pâncreas',enTerm:'serous cystadenoma pancreas',classification:'LIRADS'},
    {id:'seed_207',name:'Cistoadenoma seroso',s:'Pelve Feminina',site:'Ovário',enTerm:'serous cystadenoma pancreas',classification:'ORADS'});
  const out=plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords;
  assert.deepEqual(out.map(x=>x.id),['seed_207']);
  assert.equal(out[0].classification,'ORADS');
  assert.ok(out[0].candidateReason.includes('same_section'));
  assert.ok(out[0].candidateReason.includes('same_site'));
  assert.ok(out[0].candidateReason.includes('different_enTerm_anatomy'),'enTerm legado é aviso, não elimina ovário real');
  assert.ok(Number.isFinite(out[0].candidateScore));
});
test('real: carcinoma cervical genérico citado em pedido/descrição aparece, histologia/anatomia alheia não',()=>{
  const c=ctxFixture(), s=c.DATA[0];
  s.id='seed_600';s.name='Carcinoma espinocelular do colo uterino';s.s='Pelve Feminina';s.site='Colo uterino';s.enTerm='cervical squamous cell carcinoma';
  c.LESION_REVISIONS.R1.lesionId=s.id;
  c.LESION_REVISIONS.R1.requestText='Localizar clone';
  c.LESION_REVISIONS.R1.manualAction.description='Localizar registro equivalente: Carcinoma do colo uterino';
  c.DATA.splice(1,2,
    {id:'seed_218',name:'Carcinoma do colo uterino',s:'Pelve Feminina',site:'Colo uterino'},
    {id:'u_end',name:'Carcinoma de endométrio',s:'Pelve Feminina',site:'Endométrio'});
  const out=plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords;
  assert.deepEqual(out.map(x=>x.id),['seed_218']);
  assert.ok(out[0].candidateReason.includes('explicit_name_in_review'));
});
test('real: placenta declarada sem enTerm igual acha clone existente, não inventa ausente',()=>{
  const c=ctxFixture(),s=c.DATA[0];
  s.id='seed_530';s.name='Placenta acreta spectrum';s.s='Medicina Fetal';s.site='Placenta';s.enTerm='placenta accreta spectrum';
  c.LESION_REVISIONS.R1.lesionId=s.id;c.LESION_REVISIONS.R1.requestText='LESÃO DUPLICADA - localizar clone';
  c.DATA.splice(1,2,{id:'seed_42',name:'Placenta acreta',s:'Medicina Fetal',site:'Placenta'});
  const out=plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords;
  assert.deepEqual(out.map(x=>x.id),['seed_42']);
  assert.ok(out[0].candidateReason.includes('declared_candidate_name'));
  c.DATA.pop();
  assert.deepEqual(plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords,[]);
});
test('real: Paraovarian cyst com branding encontra nome citado sem precisar de palavra "duplicata"',()=>{
  const c=ctxFixture(),s=c.DATA[0];
  s.name='Paraovarian cyst | Radiology Case | Radiopaedia.org';s.enTerm='';s.s='Pelve Feminina';s.site='Ovário';
  c.LESION_REVISIONS.R1.requestText='Corrigir título externo';
  c.LESION_REVISIONS.R1.manualAction={type:'title_review',description:'Registro correspondente: Cisto paratubário (cisto de Morgagni)'};
  c.DATA.splice(1,2,{id:'seed_33',name:'Cisto paratubário (cisto de Morgagni)',s:'Pelve Feminina',site:'Tuba uterina'});
  const out=plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords;
  assert.deepEqual(out.map(x=>x.id),['seed_33']);
  assert.ok(out[0].candidateReason.includes('explicit_name_in_review'));
});
test('real: teratoma/endométrio/ectópica/hematometra continuam candidatos se existirem',()=>{
  const cases=[
    ['seed_575','Teratoma cístico maduro','seed_206','Teratoma maduro (cisto dermoide)','Ovário'],
    ['seed_195','Carcinoma de endométrio','seed_574','Carcinoma endometrial','Endométrio'],
    ['seed_601','Gestação ectópica tubária','seed_413','Gravidez ectópica','Tuba uterina'],
    ['seed_693','Hematometra','seed_200','Hematometra','Útero']
  ];
  for(const [id,name,targetId,target,site] of cases){
    const c=ctxFixture(),s=c.DATA[0];s.id=id;s.name=name;s.s='Pelve Feminina';s.site=site;s.enTerm='';
    c.LESION_REVISIONS.R1.lesionId=id;
    c.DATA.splice(1,2,{id:targetId,name:target,s:'Pelve Feminina',site});
    const out=plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords;
    assert.ok(out.some(x=>x.id===targetId),name+' → '+target);
  }
});
test('REGRESSÃO seed_156: ovário ≠ pâncreas mesmo com nome idêntico; seed_207 permanece',()=>{
  const c=ctxFixture();
  c.DATA.length=0;
  c.DATA.push(
    {id:'seed_697',name:'Cistadenoma seroso ovariano',section:'Pelve Feminina',site:'Ovário',enTerm:'serous cystadenoma ovary'},
    {id:'seed_207',name:'Cistoadenoma seroso',section:'Pelve Feminina',site:'Ovário',classification:'ORADS'},
    {id:'seed_156',name:'Cistoadenoma seroso',section:'Abdômen Superior',site:'Pâncreas',enTerm:'serous cystadenoma pancreas',classification:'LIRADS'}
  );
  c.LESION_REVISIONS.R1.lesionId='seed_697';
  c.LESION_REVISIONS.R1.requestText='LESÃO DUPLICADA - fundir clone ovariano';
  const out=plain(c.buildManualActionAiBatch(['R1'])).actions[0].candidateRecords;
  assert.ok(out.some(x=>x.id==='seed_207'),'seed_207 (mesma anatomia) presente');
  assert.ok(!out.some(x=>x.id==='seed_156'),'seed_156 (pâncreas) NUNCA como candidato de ovário');
  assert.deepEqual(out.map(x=>x.id),['seed_207']);
});
test('metadados de imagem sem binário/base64, clinicalCases e altPlacements preservados',()=>{
  const c=ctxFixture();const s=plain(c.buildManualActionAiBatch(['R1'])).actions[0].source;
  assert.equal(s.images[0].assetId,'A1');assert.equal(s.images[0].clinicalContext.presentation,'dor');
  assert.ok(!('_file' in s.images[0])&&!('secret' in s.images[0]));
  assert.equal(s.altPlacements[0].site,'Ovário');assert.ok(!('extra' in s.altPlacements[0]));
  assert.equal(s.clinicalCases[0].imageRefs[0].quizPick,'on');
  assert.equal(s.radiologicSigns[0].title,'Sinal');
  assert.equal(s.classificationSchemes[0].title,'O-RADS');
});
test('imagem base64/blob nunca exportada; contexto manual preservado',()=>{
  const c=ctxFixture();c.DATA[0].images.push({data:'data:image/png;base64,ABC',_file:'SEGREDO',label:'local'});
  const arr=plain(c.buildManualActionAiBatch(['R1'])).actions[0].source.images;
  assert.equal(arr.length,2);assert.ok(!('data' in arr[1]));
  assert.ok(!JSON.stringify(arr).includes('base64,ABC'));
});
test('read-only: não muda DATA, revisions, REVIEW ou SRS e só exporta status manual',()=>{
  const c=ctxFixture(),before=plain({data:c.DATA,revs:c.LESION_REVISIONS,review:c.REVIEW,srs:c.SRS});
  c.buildManualActionAiBatch(['R1','R2','G']);
  assert.deepEqual(plain({data:c.DATA,revs:c.LESION_REVISIONS,review:c.REVIEW,srs:c.SRS}),before);
  assert.throws(()=>c.buildManualActionAiBatch(['P']),/não está mais disponível/);
  assert.throws(()=>c.buildManualActionAiBatch(['R1','R1']),/repetidas/);
  for(const name of ['buildManualActionAiBatch','findStructuralReviewCandidates','copyManualActionAiBatch']){
    assert.doesNotMatch(fn(name),/saveData\(|pushToFirebaseNow\(|uploadToCloudinary\(|createSafetySnapshot\(|recordImageTombstone\(|LESION_REVISIONS\[.*\]\s*=/);
  }
});
test('clipboard aguardado: sucesso mostra feedback; falha chama fallback sem mutar',async()=>{
  const c=ctxFixture(),msgs=[],manual=[];
  c.toast=s=>msgs.push(s);c.openManualActionCopyFallback=s=>manual.push(s);
  c.navigator.clipboard.writeText=async s=>{assert.equal(JSON.parse(s).count,1);};
  await c.copyManualActionAiBatch(['R1']);
  assert.deepEqual(msgs,['Pacote copiado para a área de transferência.']);
  c.navigator.clipboard.writeText=async()=>{throw new Error('denied');};
  await c.copyManualActionAiBatch(['R2']);
  assert.equal(JSON.parse(manual[0]).count,1);
  assert.match(fn('openManualActionCopyFallback'),/textarea'\)\.value=json/);
  assert.match(fn('openManualActionCopyFallback'),/\.select\(\)/);
});
test('fallback real: textarea recebe JSON completo, focado/selecionado, fecha sem tocar solução',()=>{
  const c=ctxFixture();
  let selected=false,focused=false,attached=false,removed=false;
  const ta={value:'',focus(){focused=true;},select(){selected=true;}};
  const btn={};
  c.document={createElement:()=>({className:'',innerHTML:'',isConnected:true,
    querySelector(sel){return sel==='textarea'?ta:btn;},remove(){removed=true;}}),
    body:{appendChild(){attached=true;}},addEventListener(){},removeEventListener(){}};
  c.openManualActionCopyFallback('{"type":"atlas_manual_action_batch"}');
  assert.equal(attached,true);assert.equal(ta.value,'{"type":"atlas_manual_action_batch"}');
  assert.equal(focused,true);assert.equal(selected,true);
  btn.onclick();assert.equal(removed,true);
  assert.equal(c.LESION_REVISIONS.R1.status,'manual_action_required');
});
