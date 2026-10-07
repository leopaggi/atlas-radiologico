'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBatchAnalyzer } = require('../functions/review-analysis');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const moduleSource = html.slice(html.indexOf("const LESION_REVISIONS_KEY = 'atlas:lesionRevisions';"), html.indexOf('/* termos de busca em inglês para as lesões da base padrão'));
const providerSource = html.slice(html.indexOf("const REVIEW_AI_LOCAL_ENDPOINT = 'http://127.0.0.1:8787';"), html.indexOf('function showApp(){'));
function fixture(opts = {}) {
  const button = { disabled: false }, calls = [], disk = {};
  const ctx = { console, Date, Math, JSON, Object, Array, Promise, AbortController, setTimeout, clearTimeout,
    DATA: [{ id:'seed_test', name:'Entidade sintética', s:'S', site:'T', notes:'Descrição sintética', tags:['x'], enTerm:'term', clinicalTags:[], classification:null }],
    document: { querySelectorAll: s => s==='#ai-pipeline-run' ? [button] : [], getElementById: () => null },
    storage: { get: async k => ({ value:disk[k] }), set: async (k,v) => { disk[k]=v; } },
    saveDataCalls:0, markSyncDirty:async()=>{}, pushToFirebase:()=>{},
    fetch: async (url, init) => {
      calls.push({ url, init });
      if(opts.offline || opts.failHealth && url.endsWith('/health')) throw new Error('offline');
      if(url.endsWith('/health')) return { ok:true, json:async()=>({ok:true}) };
      if(opts.error) return { ok:false, json:async()=>({ error:'private secret' }) };
      const packet=JSON.parse(init.body);
      const results = opts.analyze ? await opts.analyze(packet) : { results:packet.reviews.map(r=>({ reviewId:r.reviewId,result:'no_change',summary:'adequado',reasoning:'nenhuma lacuna',proposedChanges:null,manualAction:null })) };
      return { ok:true,json:async()=>results };
    }
  };
  ctx.saveData=()=>{ctx.saveDataCalls++;}; vm.createContext(ctx);
  vm.runInContext(moduleSource+'\n'+providerSource,ctx);
  return { ctx,button,calls };
}
const revs = ctx=>vm.runInContext('LESION_REVISIONS',ctx);
function createReviews(ctx,n){return Array.from({length:n},(_v,i)=>ctx.createLesionReview('seed_test','pedido '+i).review);}

test('servidor ausente: provider null, botão disabled, sem mock',async()=>{
  const f=fixture({offline:true}); assert.equal(await f.ctx.refreshReviewAiLocalProvider(true),false);
  assert.equal(vm.runInContext('REVIEW_AI_PIPELINE_PROVIDER',f.ctx),null); assert.equal(f.button.disabled,true);
  assert.match(f.button.title,/Servidor IA local não iniciado/);
});
test('health OK habilita provider local sem Firebase Functions/Auth no backend',async()=>{
  const f=fixture(); assert.equal(await f.ctx.refreshReviewAiLocalProvider(true),true); assert.equal(f.button.disabled,false);
  assert.equal(vm.runInContext('REVIEW_AI_PIPELINE_PROVIDER===REVIEW_AI_LOCAL_PROVIDER',f.ctx),true);
  assert.equal(f.calls[0].url,'http://127.0.0.1:8787/health');
});
test('erro backend vira ai_error sem chave/stack; DATA intocado',async()=>{
  const f=fixture({error:true});await f.ctx.refreshReviewAiLocalProvider(true);const[r]=createReviews(f.ctx,1);const before=JSON.stringify(f.ctx.DATA);
  const res=await f.ctx.runAiSolutionPipeline();assert.equal(res.reason,'provider_error');assert.equal(revs(f.ctx)[r.id].aiPipeline.state,'ai_error');
  assert.doesNotMatch(revs(f.ctx)[r.id].aiPipeline.error,/private secret/);assert.equal(JSON.stringify(f.ctx.DATA),before);assert.equal(f.ctx.saveDataCalls,0);
});
test('pipeline → provider local → núcleo real → OpenAI mock: 20, só propostas',async()=>{
  let openAiCalls=0;
  const analyze=createBatchAnalyzer({getApiKey:()=> 'mock-only',createClient:()=>({responses:{create:async req=>{
    openAiCalls++; const packet=JSON.parse(req.input);
    return {status:'completed',output_text:JSON.stringify({results:packet.reviews.map((r,i)=>({reviewId:r.reviewId,result:['apply','no_change','manual_action_required'][i%3],summary:'proposta',reasoning:'teste isolado',proposedChanges:i%3===0?{enTerm:'new term'}:null,manualAction:i%3===2?{type:'other',description:'decisão humana',suggestedPlacement:null}:null}))})};
  }}})});
  const f=fixture({analyze});await f.ctx.refreshReviewAiLocalProvider(true);createReviews(f.ctx,25);const before=JSON.stringify(f.ctx.DATA);
  const res=await f.ctx.runAiSolutionPipeline();assert.equal(res.total,20);assert.equal(res.errors,0);assert.equal(openAiCalls,1);
  assert.ok(res.proposed>0&&res.noChange>0&&res.needsHumanReview>0);
  assert.equal(Object.values(revs(f.ctx)).filter(r=>r.status==='pending').length,5);
  assert.ok(Object.values(revs(f.ctx)).every(r=>['pending','proposed','manual_action_required'].includes(r.status)));
  assert.equal(JSON.stringify(f.ctx.DATA),before);assert.equal(f.ctx.saveDataCalls,0);
  assert.equal(f.calls.find(c=>c.url.endsWith('/analyze-review-batch')).init.method,'POST');
});
test('servidor desligado entre health e análise é rechecado; nunca fallback',async()=>{
  const options={};const f=fixture(options);await f.ctx.refreshReviewAiLocalProvider(true);options.offline=true;
  await assert.rejects(vm.runInContext('REVIEW_AI_LOCAL_PROVIDER.analyzeBatch({reviews:[]})',f.ctx),/não iniciado/);
  assert.equal(f.button.disabled,true);assert.ok(f.calls.every(c=>c.url.endsWith('/health')));
});
test('backend local nunca chama execução, DATA, save nem Functions; saúde não processa lote',()=>{
  assert.doesNotMatch(providerSource,/authorizeAndApplyReviewSolution\(|executeStructuralPlan\(|saveData\(|\bDATA\b|httpsCallable/);
  assert.doesNotMatch(html,/firebase-functions-compat/);
});
