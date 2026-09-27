'use strict';

// PONTE ESTRUTURAL — FASE 2: importação e PRÉVIA de plano da IA, SEM execução.
// Parser + schema fechado + snapshot/stale + aceite/rejeição humana do plano.
// Nada aqui toca DATA, imagens, ownership, altPlacements ou tombstones.

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
  'structuralReviewRecord','findStructuralReviewCandidates','canonicalJsonString',
  'stableImageKeyV208','imageIdentityKeys','pushLesionReviewHistory',
  'structuralPlanError','structuralPlanString','structuralPlanStringArray','structuralPlanLesion','structuralPlanResolveImage','structuralPlanKnownIds',
  'validateStructuralResolution','buildStructuralPlanSnapshot','isStructuralPlanStale',
  'validateStructuralResolutionBatch','importStructuralResolutionBatch','acceptStructuralPlan','rejectStructuralPlan',
  'structuralPlanPreviewHtml'];
const consts=html.slice(html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = '),html.indexOf('// Tokens relevantes:',html.indexOf('const EXTERNAL_IMPORT_STOPWORDS = ')));
const mapping=html.slice(html.indexOf('const STRUCTURAL_REVIEW_CANDIDATE_NAMES = '),html.indexOf('function structuralReviewPick('));
const planTypes=html.slice(html.indexOf('const STRUCTURAL_PLAN_TYPES = '),html.indexOf('function structuralPlanError('));
function lesion(id,over){
  return Object.assign({id,name:'Lesão '+id,s:'Pelve Feminina',site:'Ovário',notes:'',classification:null,tags:[],enTerm:'',
    images:[],altPlacements:[],links:[],clinicalCases:[],radiologicSigns:[],classificationSchemes:[],_userUpdatedAt:100},over||{});
}
function ctxFixture(){
  const DATA=[
    lesion('seed_206',{name:'Teratoma maduro (cisto dermoide)',images:[{assetId:'A206',data:'https://res.cloudinary.com/x/A206.jpg',source:'cloudinary',label:'TC'}]}),
    lesion('seed_575',{name:'Teratoma cístico maduro'}),
    lesion('seed_208',{name:'Cistoadenoma mucinoso',classification:'O-RADS',tags:['mucinoso']}),
    lesion('seed_698',{name:'Cistadenoma mucinoso ovariano',classification:'O-RADS'}),
    lesion('seed_207',{name:'Cistoadenoma seroso',classification:'ORADS',images:[{assetId:'A207',data:'https://res.cloudinary.com/x/A207.jpg',source:'cloudinary'}]}),
    lesion('seed_697',{name:'Cistadenoma seroso ovariano'}),
    lesion('seed_156',{name:'Cistoadenoma seroso',s:'Abdômen Superior',site:'Pâncreas',enTerm:'serous cystadenoma pancreas',classification:'LIRADS'}),
    lesion('seed_574',{name:'Carcinoma endometrial',s:'Pelve Feminina',site:'Endométrio',images:[{assetId:'A574',data:'https://res.cloudinary.com/x/A574.jpg',source:'cloudinary'}]}),
    lesion('seed_195',{name:'Carcinoma de endométrio',s:'Pelve Feminina',site:'Endométrio'}),
    lesion('seed_413',{name:'Gravidez ectópica',s:'Pelve Feminina',site:'Tuba uterina',images:[{assetId:'A413',data:'https://res.cloudinary.com/x/A413.jpg',source:'cloudinary'}]}),
    lesion('seed_601',{name:'Gestação ectópica tubária',s:'Pelve Feminina',site:'Tuba uterina'}),
    lesion('seed_200',{name:'Hematometra',s:'Pelve Feminina',site:'Útero'}),
    lesion('seed_233',{name:'Cisto paratubário (cisto de Morgagni)',s:'Pelve Feminina',site:'Tuba uterina'}),
    lesion('u_1790392957220_rudcag',{name:'Paraovarian cyst',s:'Pelve Feminina',site:'Ovário',images:[{assetId:'AP',data:'https://res.cloudinary.com/x/AP.jpg',source:'cloudinary'}]}),
    lesion('seed_930',{name:'Tireoidite de Riedel',s:'Cabeça e Pescoço',site:'Tireoide',altPlacements:[{s:'Abdômen Superior',site:'Rim'}]})
  ];
  const manual=(id,lesionId,extra)=>Object.assign({id,lesionId,status:'manual_action_required',requestText:'duplicada — fundir clone',
    manualAction:{type:'duplicate_merge',description:'Localizar clone'},history:[],createdAt:1,updatedAt:2},extra||{});
  const LESION_REVISIONS={
    R206:manual('R206','seed_575'), R208:manual('R208','seed_698'), R207:manual('R207','seed_697'),
    R574:manual('R574','seed_195'), R413:manual('R413','seed_601'), R200:manual('R200','seed_200'),
    R233:manual('R233','u_1790392957220_rudcag',{requestText:'Lesão duplicada — transferir imagens'}),
    R930:manual('R930','seed_930',{requestText:'remover localização adicional renal',manualAction:{type:'remove_additional_section_placement',description:'Remover Rim'}}),
    R600:manual('R600','seed_200',{requestText:'sem candidato seguro'}),
    R930B:manual('R930B','seed_930',{requestText:'falta enviar casos clínicos'})
  };
  const calls={saves:0,dirty:0,push:0};
  const ctx=vm.createContext({DATA,LESION_REVISIONS,REVIEW:{},SRS:{},
    APPROVED_CLINICAL_MERGES_091C:[],LESION_MERGES:{},
    storage:{set:async()=>{calls.saves++;},get:async()=>{throw new Error('nf');}},
    markSyncDirty:async()=>{calls.dirty++;},pushToFirebase:()=>{calls.push++;},
    saveLesionRevisions:async()=>{calls.saves++;},
    toast:()=>{},console,__calls:calls});
  vm.runInContext(consts+'\n'+mapping+'\n'+planTypes+'\n'+names.map(fn).join('\n')+ '\nthis.__api={validateStructuralResolutionBatch,importStructuralResolutionBatch,acceptStructuralPlan,rejectStructuralPlan,isStructuralPlanStale,buildStructuralPlanSnapshot,findStructuralReviewCandidates};',ctx);
  return ctx;
}
const plain=o=>JSON.parse(JSON.stringify(o));
const batch=(resolutions)=>({type:'atlas_structural_resolution_batch',version:1,generatedAt:'2026-09-27T00:00:00.000Z',resolutions});
const merge=(reviewId,keeperId,removeId,over)=>Object.assign({reviewId,resolutionType:'merge_duplicates',keeperId,removeId,
  merge:{name:'Final',transferImages:true},reasoning:'Análise da IA'},over||{});

test('1. JSON válido importa (prévia, sem executar)',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  assert.equal(res.ok,true);
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan.status,'imported');
});
test('2. JSON inválido rejeita sem tocar nada',async()=>{
  const c=ctxFixture(),before=plain(c.DATA);
  const res=await c.importStructuralResolutionBatch('{nao json');
  assert.equal(res.ok,false);assert.equal(res.reason,'json_invalid');
  assert.deepEqual(plain(c.DATA),before);
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan,undefined);
});
test('3. envelope errado rejeita',async()=>{
  const c=ctxFixture();
  for(const bad of [{type:'x',version:1,resolutions:[]},{type:'atlas_structural_resolution_batch',version:2,resolutions:[]},
    {type:'atlas_structural_resolution_batch',version:1},{type:'atlas_structural_resolution_batch',version:1,resolutions:[]},
    {type:'atlas_structural_resolution_batch',version:1,resolutions:'x'},null,[]]){
    const res=await c.importStructuralResolutionBatch(bad);
    assert.equal(res.ok,false);
  }
});
test('4. version != 1 rejeita',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]).constructor===Object
    ? {type:'atlas_structural_resolution_batch',version:99,resolutions:[merge('R206','seed_206','seed_575')]} : null);
  assert.equal(res.ok,false);assert.equal(res.reason,'envelope_version');
});
test('5. reviewId desconhecido rejeita o lote inteiro (tudo-ou-nada)',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575'),merge('NOPE','seed_206','seed_575')]));
  assert.equal(res.ok,false);assert.equal(res.reason,'review_not_found');
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan,undefined,'nada foi importado');
});
test('6. lesionId inexistente no plano rejeita (remove_additional_section_placement)',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([{reviewId:'R930',resolutionType:'remove_additional_section_placement',
    lesionId:'seed_404',placement:{section:'Abdômen Superior',site:'Rim'},reasoning:'x'}]));
  assert.equal(res.ok,false);assert.equal(res.reason,'lesion_not_found');
});
test('7. keeperId == removeId rejeita',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_206')]));
  assert.equal(res.ok,false);assert.equal(res.reason,'keeper_equals_remove');
});
test('8. seed_156 como keeper do ovariano é rejeitado por conflito anatômico',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([merge('R207','seed_156','seed_697')]));
  assert.equal(res.ok,false);assert.equal(res.reason,'anatomic_conflict');
  assert.equal(c.LESION_REVISIONS.R207.structuralPlan,undefined);
});
test('9. placement inexistente rejeita (não inventa localização)',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([{reviewId:'R930',resolutionType:'remove_additional_section_placement',
    lesionId:'seed_930',placement:{section:'Tórax',site:'Pulmão'},reasoning:'x'}]));
  assert.equal(res.ok,false);assert.equal(res.reason,'placement_not_found');
});
test('10. imageId inexistente rejeita (transfer_images só como plano)',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([{reviewId:'R233',resolutionType:'transfer_images',
    fromLesionId:'u_1790392957220_rudcag',toLesionId:'seed_233',imageIds:['asset:INEXISTENTE'],reasoning:'levar foto'}]));
  assert.equal(res.ok,false);assert.equal(res.reason,'image_not_found');
  assert.deepEqual(plain(c.DATA.find(e=>e.id==='seed_233').images),[],'nada foi transferido');
});
test('11. unresolved é aceito sem execução (espinocelular/placenta/isquemia)',async()=>{
  const c=ctxFixture();
  const mk=(id,reason)=>({reviewId:id,resolutionType:'unresolved',reason,reasoning:'Sem candidato seguro no DATA atual'});
  const res=await c.importStructuralResolutionBatch(batch([mk('R600','no_safe_candidate'),mk('R930B','missing_clinical_case_content')]));
  assert.equal(res.ok,true);
  assert.equal(c.LESION_REVISIONS.R600.structuralPlan.status,'imported');
  assert.deepEqual(plain(c.DATA.find(e=>e.id==='seed_200').images),[],'sem execução');
});
test('12. importar não altera DATA',async()=>{
  const c=ctxFixture(),before=plain(c.DATA);
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575'),
    {reviewId:'R930',resolutionType:'remove_additional_section_placement',lesionId:'seed_930',placement:{section:'Abdômen Superior',site:'Rim'},reasoning:'x'},
    {reviewId:'R233',resolutionType:'transfer_images',fromLesionId:'u_1790392957220_rudcag',toLesionId:'seed_233',imageIds:['AP'],reasoning:'x'}]));
  assert.deepEqual(plain(c.DATA),before);
});
test('13. importar não altera imagens (metadados intactos)',async()=>{
  const c=ctxFixture(),before=plain(c.DATA.find(e=>e.id==='seed_206').images);
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  assert.deepEqual(plain(c.DATA.find(e=>e.id==='seed_206').images),before);
});
test('14. importar não altera ownership (lesionId das imagens intacto)',async()=>{
  const c=ctxFixture();
  c.DATA.find(e=>e.id==='seed_206').images[0].lesionId='seed_206';
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  assert.equal(c.DATA.find(e=>e.id==='seed_206').images[0].lesionId,'seed_206');
});
test('15. importar não remove altPlacements',async()=>{
  const c=ctxFixture(),before=plain(c.DATA.find(e=>e.id==='seed_930').altPlacements);
  await c.importStructuralResolutionBatch(batch([{reviewId:'R930',resolutionType:'remove_additional_section_placement',
    lesionId:'seed_930',placement:{section:'Abdômen Superior',site:'Rim'},reasoning:'x'}]));
  assert.deepEqual(plain(c.DATA.find(e=>e.id==='seed_930').altPlacements),before);
});
test('16. importar não resolve revisão (status continua manual)',async()=>{
  const c=ctxFixture();
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  assert.equal(c.LESION_REVISIONS.R206.status,'manual_action_required');
});
test('17. aceitar plano não executa (só marca aprovado)',async()=>{
  const c=ctxFixture(),before=plain(c.DATA);
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  const res=await c.acceptStructuralPlan('R206');
  assert.equal(res.ok,true);
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan.status,'accepted');
  assert.deepEqual(plain(c.DATA),before,'DATA intacto após aceite');
  assert.equal(c.LESION_REVISIONS.R206.status,'manual_action_required','revisão continua manual');
});
test('18. rejeitar plano não executa (só descarta)',async()=>{
  const c=ctxFixture(),before=plain(c.DATA);
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  const res=await c.rejectStructuralPlan('R206');
  assert.equal(res.ok,true);
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan.status,'rejected');
  assert.deepEqual(plain(c.DATA),before);
});
test('19. snapshot é criado no import com cópias das lesões',async()=>{
  const c=ctxFixture();
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  const snap=c.LESION_REVISIONS.R206.structuralPlan.snapshot;
  assert.ok(snap.createdAt);
  assert.deepEqual(Object.keys(snap.lesions).sort(),['seed_206','seed_575']);
  assert.equal(snap.lesions.seed_206.name,'Teratoma maduro (cisto dermoide)');
  snap.lesions.seed_206.name='MUTADO';
  assert.equal(c.DATA.find(e=>e.id==='seed_206').name,'Teratoma maduro (cisto dermoide)','snapshot é cópia, não referência');
});
test('20. stale plan é detectado e bloqueia aceite silencioso',async()=>{
  const c=ctxFixture();
  await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575')]));
  c.DATA.find(e=>e.id==='seed_575').notes='mudou depois do plano';
  const res=await c.acceptStructuralPlan('R206');
  assert.equal(res.ok,false);assert.equal(res.reason,'stale_plan');
  assert.deepEqual(plain(res.detail.changedIds),['seed_575']);
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan.status,'imported','continua importado, não aceito');
});
test('21. caracteres acentuados e quebras funcionam',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([merge('R206','seed_206','seed_575',
    {merge:{name:'Teratoma — final “cisto”\ncom quebra'},reasoning:'Acentuação: ovário, cistoadenoma'})]));
  assert.equal(res.ok,true);
  assert.equal(c.LESION_REVISIONS.R206.structuralPlan.resolution.merge.name,'Teratoma — final “cisto”\ncom quebra');
});
test('22. lote parcial funciona (subconjunto das 12 ações)',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([
    merge('R206','seed_206','seed_575'),
    {reviewId:'R930',resolutionType:'remove_additional_section_placement',lesionId:'seed_930',placement:{section:'Abdômen Superior',site:'Rim'},reasoning:'x'},
    {reviewId:'R600',resolutionType:'unresolved',reason:'no_safe_candidate',reasoning:'x'}]));
  assert.equal(res.ok,true);
  assert.deepEqual(plain(res.imported),['R206','R930','R600']);
  assert.equal(c.LESION_REVISIONS.R208.structuralPlan,undefined,'fora do lote fica sem plano');
});
test('23. lote com 12 ações funciona',async()=>{
  const c=ctxFixture();
  const ids=['R206','R208','R207','R574','R413','R200','R233','R930','R600','R930B'];
  for(let i=0;i<2;i++) c.LESION_REVISIONS['RX'+i]={id:'RX'+i,lesionId:'seed_200',status:'manual_action_required',requestText:'x'+i,history:[],createdAt:1,updatedAt:2};
  const all=ids.concat(['RX0','RX1']);
  const res=await c.importStructuralResolutionBatch(batch(all.map(id=>({reviewId:id,resolutionType:'no_action',reasoning:'nada a fazer'}))));
  assert.equal(res.ok,true);
  assert.equal(res.imported.length,12);
});
test('24. campos desconhecidos perigosos são rejeitados; sem eval no código',async()=>{
  const c=ctxFixture();
  const evil=merge('R206','seed_206','seed_575'); evil.__proto__={x:1}; evil.eval='1';
  const res=await c.importStructuralResolutionBatch(batch([evil]));
  assert.equal(res.ok,false);
  for(const name of ['validateStructuralResolutionBatch','importStructuralResolutionBatch','acceptStructuralPlan','rejectStructuralPlan',
    'validateStructuralResolution','buildStructuralPlanSnapshot','isStructuralPlanStale','structuralPlanPreviewHtml']){
    assert.doesNotMatch(fn(name),/\beval\s*\(|\bnew\s+Function\s*\(|setTimeout\s*\(\s*["'`]/);
  }
  // Modais: fn() ingênuo quebra em regex literal; checagem direta no HTML.
  for(const snippet of ['function openStructuralPlanImportModal(','function openStructuralPlanPreviewModal(']){
    assert.ok(html.includes(snippet),snippet);
  }
  const tail=html.slice(html.indexOf('function openStructuralPlanImportModal('));
  assert.doesNotMatch(tail,/\beval\s*\(|\bnew\s+Function\s*\(/);
});
test('25. nenhum eval/dynamic code path existe nas novas funções',()=>{
  for(const name of ['validateStructuralResolution','isStructuralPlanStale']){
    assert.doesNotMatch(fn(name),/saveData\(|pushToFirebaseNow\(|uploadToCloudinary\(|createSafetySnapshot\(|recordImageTombstone\(|delete\s+\w|DATA\.splice|DATA\.push/);
  }
});
test('UI: botão importador na aba manual + badge de plano no card',()=>{
  const src=fn('openReadySolutionsModal');
  assert.match(src,/review-manual-import-plan/);
  assert.match(src,/Importar plano estrutural da IA/);
  assert.match(src,/openStructuralPlanImportModal/);
  assert.match(src,/r\.structuralPlan \?/);
  assert.match(src,/aguardando execução \(Fase 3\)/);
});
test('primeiro lote de exemplo do escopo: teratoma/mucinoso/seroso/endometrial/ectopica/paraovarian/riedel',async()=>{
  const c=ctxFixture();
  const res=await c.importStructuralResolutionBatch(batch([
    merge('R206','seed_206','seed_575',{merge:{name:'Teratoma maduro (cisto dermoide)',transferImages:true}}),
    merge('R208','seed_208','seed_698'),
    merge('R207','seed_207','seed_697',{reasoning:'OVÁRIO: seed_207; pâncreas seed_156 fora'}),
    merge('R574','seed_574','seed_195'),
    merge('R413','seed_413','seed_601'),
    {reviewId:'R233',resolutionType:'transfer_images',fromLesionId:'u_1790392957220_rudcag',toLesionId:'seed_233',imageIds:['AP'],reasoning:'levar foto'},
    {reviewId:'R930',resolutionType:'remove_additional_section_placement',lesionId:'seed_930',placement:{section:'Abdômen Superior',site:'Rim'},reasoning:'Riedel sem rim'}
  ]));
  assert.equal(res.ok,true);
  assert.equal(c.LESION_REVISIONS.R207.structuralPlan.status,'imported');
  assert.deepEqual(plain(c.DATA.find(e=>e.id==='seed_697').images),[],'seed_697 intacta');
});
