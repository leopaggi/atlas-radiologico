'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {createLocalServer,HOST,PORT,allowedOrigin,logProviderErrorLocally}=require('../server');
const review=(id='r1')=>({reviewId:id,scope:'lesion',requestText:'teste',currentFields:{name:'Entidade sintética',enTerm:'term'},allowedFields:['enTerm'],forbiddenFields:['id','images']});
const item=(id='r1')=>({reviewId:id,result:'no_change',summary:'sem lacuna',reasoning:'teste',proposedChanges:null,manualAction:null});
async function fixture(t,options={}){
  const calls=[];
  const server=createLocalServer({getApiKey:()=>options.noKey?'':'mock-only',createClient:()=>({responses:{create:async r=>{calls.push(r);return{status:'completed',output_text:options.text??JSON.stringify(options.output||{results:[item()]})};}}})});
  await new Promise(r=>server.listen(0,HOST,r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const url='http://'+HOST+':'+server.address().port;
  const post=(packet={reviews:[review()]},extra={})=>fetch(url+'/analyze-review-batch',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://leopaggi.github.io'},body:JSON.stringify(packet),...extra});
  return{server,url,post,calls};
}
test('bind obrigatório 127.0.0.1:8787; listener de teste também loopback',async t=>{
  assert.equal(HOST,'127.0.0.1');assert.equal(PORT,8787);const f=await fixture(t);assert.equal(f.server.address().address,'127.0.0.1');
  assert.match(fs.readFileSync(require.resolve('../server'),'utf8'),/server.listen\(PORT, HOST/);
});
test('health OK não chama OpenAI e não exige key',async t=>{const f=await fixture(t,{noKey:true});assert.deepEqual(await(await fetch(f.url+'/health')).json(),{ok:true});assert.equal(f.calls.length,0);});
test('CORS apenas Atlas/localhost; rejeita origem estranha/null e host rebinding',async t=>{
  assert.equal(allowedOrigin('https://leopaggi.github.io'),true);assert.equal(allowedOrigin('http://localhost:8000'),true);assert.equal(allowedOrigin('http://127.0.0.1:8000'),true);assert.equal(allowedOrigin('https://evil.test'),false);assert.equal(allowedOrigin('null'),false);
  const f=await fixture(t);const deny=await fetch(f.url+'/health',{headers:{Origin:'https://evil.test'}});assert.equal(deny.status,403);
  const hostStatus=await new Promise((resolve,reject)=>{require('node:http').get(f.url+'/health',{headers:{Host:'evil.test'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(hostStatus,403);
  const pre=await fetch(f.url+'/analyze-review-batch',{method:'OPTIONS',headers:{Origin:'https://leopaggi.github.io','Access-Control-Request-Private-Network':'true'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://leopaggi.github.io');assert.equal(pre.headers.get('access-control-allow-private-network'),'true');
});
test('21 e JSON malformed bloqueados antes de OpenAI',async t=>{
  const f=await fixture(t);assert.equal((await f.post({reviews:Array.from({length:21},(_v,i)=>review('r'+i))})).status,400);assert.equal((await f.post(undefined,{body:'{'})).status,400);assert.equal(f.calls.length,0);
});
test('IDs duplicados/global e payload excessivo bloqueados',async t=>{
  const f=await fixture(t);assert.equal((await f.post({reviews:[review(),review()]})).status,400);
  assert.equal((await f.post({reviews:[{...review(),scope:'global'}]})).status,400);
  assert.equal((await f.post(undefined,{body:'x'.repeat(512*1024+1)})).status,413);assert.equal(f.calls.length,0);
});
test('válido reutiliza Responses/Structured Outputs/store:false sem ferramentas',async t=>{
  const f=await fixture(t);const res=await f.post();assert.equal(res.status,200);assert.deepEqual(await res.json(),{results:[item()]});assert.equal(f.calls[0].model,'gpt-6.1-sol');assert.equal(f.calls[0].store,false);assert.deepEqual(f.calls[0].tools,[]);assert.equal(f.calls[0].text.format.strict,true);
});
test('OpenAI com ID estranho ou malformed não gera resultados inventados',async t=>{
  const f=await fixture(t,{output:{results:[item('strange')]}});assert.equal((await f.post()).status,502);
  const g=await fixture(t,{text:'{'});assert.equal((await g.post()).status,502);
});
test('sem key análise falha com mensagem segura e sem OpenAI',async t=>{
  const f=await fixture(t,{noKey:true});const res=await f.post();assert.equal(res.status,503);assert.equal(f.calls.length,0);assert.doesNotMatch(JSON.stringify(await res.json()),/mock-only|stack/);
});

// ===========================================================================
// DIAGNÓSTICO LOCAL (onProviderError/logProviderErrorLocally) — Etapa de
// diagnóstico do 502: o terminal local recebe metadados sanitizados do erro
// real do SDK; o CLIENTE HTTP continua recebendo só a mensagem genérica de
// sempre (nenhuma mudança de comportamento/contrato).
// ===========================================================================
test('erro real do SDK (como o 502 investigado): cliente HTTP recebe só a mensagem genérica; onProviderError recebe metadados sanitizados',async t=>{
  const received=[];
  const sdkError=Object.assign(new Error('Bad gateway upstream, Authorization: Bearer sk-SEGREDOREAL123456'),{name:'APIError',status:502,code:'bad_gateway',type:'server_error',param:null});
  const server=createLocalServer({getApiKey:()=>'mock-only',createClient:()=>({responses:{create:async()=>{throw sdkError;}}}),onProviderError:(meta)=>received.push(meta)});
  await new Promise(r=>server.listen(0,HOST,r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const url='http://'+HOST+':'+server.address().port;
  const res=await fetch(url+'/analyze-review-batch',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://leopaggi.github.io'},body:JSON.stringify({reviews:[review()]})});
  assert.equal(res.status,502);
  const body=await res.json();
  assert.deepEqual(body,{error:'Não foi possível concluir a análise. Tente novamente.'});
  assert.doesNotMatch(JSON.stringify(body),/sk-SEGREDOREAL123456|Bearer|Authorization|status|bad_gateway/i);
  assert.equal(received.length,1);
  assert.deepEqual(Object.keys(received[0]).sort(),['code','message','name','status','type']);
  assert.equal(received[0].status,502);assert.equal(received[0].code,'bad_gateway');assert.equal(received[0].type,'server_error');
  assert.doesNotMatch(JSON.stringify(received[0]),/sk-SEGREDOREAL123456/,'chave nunca sobrevive mesmo dentro de message — redação defensiva');
});
test('logProviderErrorLocally: imprime SOMENTE os campos sanitizados presentes, formato "[Atlas IA/OpenAI]" + "campo: valor"; nunca stack/headers/key',()=>{
  const printed=[];
  const origError=console.error;console.error=(...args)=>printed.push(args.join(' '));
  try{
    logProviderErrorLocally({status:400,code:'invalid_request_error',type:'invalid_request_error',param:'model',message:'The model is invalid.'});
  }finally{console.error=origError;}
  assert.deepEqual(printed,['[Atlas IA/OpenAI]','status: 400','code: invalid_request_error','type: invalid_request_error','param: model','message: The model is invalid.']);
});
test('logProviderErrorLocally: campos ausentes simplesmente não aparecem (nunca imprime undefined/null/stack/headers)',()=>{
  const printed=[];
  const origError=console.error;console.error=(...args)=>printed.push(args.join(' '));
  try{ logProviderErrorLocally({status:500,message:'Internal error.'}); }
  finally{console.error=origError;}
  assert.deepEqual(printed,['[Atlas IA/OpenAI]','status: 500','message: Internal error.']);
  assert.ok(printed.every(l=>!/undefined|null|stack|header|authorization/i.test(l)));
});
test('ESTÁTICO: createLocalServer nunca loga a API key/headers/request/response/packet — só onProviderError sanitizado',()=>{
  const src=fs.readFileSync(require.resolve('../server'),'utf8');
  assert.doesNotMatch(src,/console\.(log|error|warn|info)\([^)]*apiKey/i);
  assert.doesNotMatch(src,/console\.(log|error|warn|info)\([^)]*headers/i);
  assert.doesNotMatch(src,/console\.(log|error|warn|info)\([^)]*\bpacket\b/i);
  assert.doesNotMatch(src,/console\.(log|error|warn|info)\([^)]*\.stack/i);
});
