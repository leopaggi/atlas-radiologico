'use strict';

// Executa renderMedia/handler de teclado do Quiz e openImageLightbox reais,
// extraídos do HTML, com DOM mínimo em memória (sem rede nem dados reais).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function extract(name){
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(html);
  assert.ok(m, name + ' não encontrada');
  const open = html.indexOf('{', m.index + m[0].length);
  let depth = 0, quote = '', escape = false, line = false, block = false;
  for(let i=open;i<html.length;i++){
    const c=html[i], n=html[i+1];
    if(line){ if(c==='\n') line=false; continue; }
    if(block){ if(c==='*' && n==='/'){ block=false; i++; } continue; }
    if(quote){ if(escape) escape=false; else if(c==='\\') escape=true; else if(c===quote) quote=''; continue; }
    if(c==='/' && n==='/'){ line=true; i++; continue; }
    if(c==='/' && n==='*'){ block=true; i++; continue; }
    if(c==='"' || c==="'" || c==='`'){ quote=c; continue; }
    if(c==='{') depth++;
    else if(c==='}' && --depth===0) return html.slice(m.index,i+1);
  }
  throw new Error('Função incompleta: ' + name);
}
const quizSource = extract('renderQuizCardIntegrated');
const handlerStart = quizSource.indexOf('if(quizCarouselKeyHandler) document.removeEventListener');
const handlerEnd = quizSource.indexOf("document.addEventListener('keydown', quizCarouselKeyHandler);", handlerStart);
assert.ok(handlerStart>=0 && handlerEnd>handlerStart);
const keyboard = quizSource.slice(handlerStart, handlerEnd) + "document.addEventListener('keydown', quizCarouselKeyHandler);";

function createHarness(count=3, answered=false){
  const listeners=new Set(), elements={};
  const makeElement=()=>({style:{}, hidden:false, textContent:'', src:'', onclick:null,
    addEventListener(){}, getBoundingClientRect(){return {left:0,top:0,width:100,height:100}}});
  const document={activeElement:{tagName:'DIV'},
    createElement(){
      const ov={isConnected:false,className:'',elements:{},
        set innerHTML(markup){
          this.markup=markup;
          this.elements={'.lightbox-img':makeElement(),'.lightbox-desc':makeElement(),'.lightbox-close':makeElement(),
            '.lightbox-stage':makeElement(),'[data-lb="pct"]':makeElement(),
            '[data-lb="minus"]':makeElement(),'[data-lb="plus"]':makeElement(),'[data-lb="reset"]':makeElement()};
          if(markup.includes('class="lightbox-nav-prev"')){
            this.elements['.lightbox-nav-prev']=makeElement();
            this.elements['.lightbox-nav-next']=makeElement();
            this.elements['.lightbox-nav-counter']=makeElement();
          }
          this.elements['.lightbox-img'].src=/<img src="([^"]*)" class="lightbox-img"/.exec(markup)[1];
        },
        querySelector(sel){return this.elements[sel]||null;},remove(){this.isConnected=false;}
      };
      elements.overlay=ov; return ov;
    },
    body:{appendChild(ov){ov.isConnected=true;}},
    querySelector(selector){return selector.includes('.lightbox-overlay') && elements.overlay?.isConnected ? elements.overlay : null;},
    addEventListener(type,handler){if(type==='keydown')listeners.add(handler);},
    removeEventListener(type,handler){if(type==='keydown')listeners.delete(handler);}
  };
  const media={_html:'',controls:{},
    set innerHTML(markup){
      this._html=markup;
      this.image=makeElement();
      for(const cls of ['quiz-carousel-prev','quiz-carousel-next','quiz-carousel-ov-prev','quiz-carousel-ov-next'])
        this.controls['.'+cls]=makeElement();
    },
    get innerHTML(){return this._html;},
    querySelector(sel){return sel==='img' ? this.image : this.controls[sel];}
  };
  const imgs=Array.from({length:count},(_,i)=>({data:'https://example.org/'+i+'.jpg',label:'legenda '+i,
    ...(i===2 ? {panels:[{seq:'STIR'},{seq:'T1'}]} : {})}));
  const cases=imgs.map((im,i)=>({imageId:im.data,presentation:'caso '+i}));
  const ctx=vm.createContext({document,media,console,
    pasteTargetIsText:target=>!!target?.closest?.('input, textarea, [contenteditable]'),
    esc:v=>String(v), quizTheoryPrompt:()=>({clues:[]}),
    quizImageDescHtml:(label,isAnswered)=>isAnswered ? '<div>'+label+'</div>' : '',
    quizClinicalContextBlockHtml:(e,img)=>'<section>Contexto clínico: '+e.clinicalCases.find(c=>c.imageId===img.data).presentation+'</section>',
    zoomStateInit:()=>({s:1,tx:0,ty:0}),zoomAtPoint:v=>v,clampZoomPan:v=>v,
    LIGHTBOX_ZOOM_STEP:1.2,LIGHTBOX_ZOOM_WHEEL:1.1
  });
  vm.runInContext('let quizImgs = []; let quizImgIdx=0; let quizCarouselKeyHandler=null;\n'+
    'const st={imgIdx:0,answered:'+answered+'}; const e={clinicalCases:[]};\n'+
    ['lightboxNavList','lightboxNextIndex','lightboxPrevIndex','openImageLightbox'].map(extract).join('\n')+'\n'+
    extract('renderMedia')+'\n'+keyboard+'\n'+
    'this.setImages=(items,cases)=>{quizImgs=items;e.clinicalCases=cases;renderMedia();};\n'+
    'this.setIndex=(i)=>{quizImgIdx=i;renderMedia();};this.getIndex=()=>quizImgIdx;this.getState=()=>st;',ctx);
  ctx.setImages(imgs,cases);
  const el=sel=>elements.overlay?.querySelector(sel);
  const click=sel=>el(sel).onclick({stopPropagation(){}});
  const key=k=>{let prevented=0;for(const listener of [...listeners])listener({key:k,target:{closest:()=>null},preventDefault(){prevented++;}});return prevented;};
  return {ctx,media,imgs,el,click,key,document,listeners};
}

test('Quiz com uma imagem abre lightbox sem controles de navegação; Escape fecha',()=>{
  const h=createHarness(1);
  h.media.image.onclick();
  assert.equal(h.el('.lightbox-nav-prev'),null);
  assert.equal(h.el('.lightbox-nav-next'),null);
  assert.equal(h.key('ArrowRight'),0);
  h.key('Escape');
  assert.equal(h.document.querySelector('.lightbox-overlay'),null);
  assert.equal(h.ctx.getIndex(),0);
});

test('três imagens: começa no índice do Quiz, setas/contador circular e zoom resetam; quadro é uma imagem',()=>{
  const h=createHarness();
  h.ctx.setIndex(1);
  h.media.image.onclick();
  assert.equal(h.el('.lightbox-nav-counter').textContent,''); // o texto inicial está no markup
  assert.match(h.document.querySelector('.lightbox-overlay').markup, />2 \/ 3<\/div>/);
  h.click('.lightbox-nav-next');
  assert.equal(h.ctx.getIndex(),2);
  assert.equal(h.el('.lightbox-nav-counter').textContent,'3 / 3');
  assert.equal(h.el('[data-lb="pct"]').textContent,'100%');
  h.click('.lightbox-nav-next');
  assert.equal(h.ctx.getIndex(),0,'mesmo wrap circular do Quiz');
  h.click('.lightbox-nav-prev');
  assert.equal(h.ctx.getIndex(),2,'quadro inteiro é 1 item, não seus 2 painéis');
});

test('teclado não dispara duas vezes; fechar/reabrir preserva imagem B e contexto da 093d',()=>{
  const h=createHarness(3);
  assert.match(h.media.innerHTML,/caso 0/);
  h.media.image.onclick();
  assert.equal(h.key('ArrowRight'),1);
  assert.equal(h.ctx.getIndex(),1,'handler externo não pode avançar de novo');
  assert.match(h.media.innerHTML,/Contexto clínico: caso 1/);
  assert.doesNotMatch(h.media.innerHTML,/caso 0/);
  assert.equal(h.key('ArrowLeft'),1);
  assert.equal(h.ctx.getIndex(),0);
  h.key('ArrowRight');
  h.key('Escape');
  assert.equal(h.ctx.getIndex(),1);
  assert.equal(h.ctx.getState().imgIdx,1);
  assert.match(h.media.innerHTML,/caso 1/);
  h.media.image.onclick();
  assert.match(h.document.querySelector('.lightbox-overlay').markup,/>2 \/ 3<\/div>/);
  h.key('Escape');
  assert.equal(h.key('ArrowRight'),0,'fora do lightbox, o Quiz continua navegável');
  assert.equal(h.ctx.getIndex(),2);
});

test('antes da resposta a descrição segue oculta inclusive após navegar no lightbox',()=>{
  const h=createHarness();
  h.media.image.onclick();
  h.click('.lightbox-nav-next');
  assert.equal(h.el('.lightbox-desc').hidden,true);
  assert.equal(h.el('.lightbox-desc').textContent,'');
  assert.match(h.media.innerHTML,/caso 1/);
  assert.doesNotMatch(h.media.innerHTML,/legenda 1/);
});

test('galeria genérica sem callback continua navegando e não altera o Quiz',()=>{
  const h=createHarness();
  h.ctx.openImageLightbox(h.imgs[0].data,'legenda 0',h.imgs,0);
  h.click('.lightbox-nav-next');
  assert.equal(h.el('.lightbox-nav-counter').textContent,'2 / 3');
  assert.equal(h.ctx.getIndex(),0);
  h.key('Escape');
  const source=extract('openDetail');
  assert.match(source,/openImageLightbox\(it\.data, it\.label, all, idx\)/);
  assert.match(extract('openForm'),/openImageLightbox\(img\.data, img\.label, pendingImgs, idx\)/);
});

test('fiação real: carrossel mantém mesmo array/índice; contexto só é renderizado pelo Quiz',()=>{
  assert.match(quizSource,/st\.answered \? quizImgs : quizImgs\.map\(img=>\(\{\.\.\.img, label:''\}\)\), quizImgIdx,/);
  assert.match(quizSource,/idx=>\{ quizImgIdx=idx; renderMedia\(\); \}/);
  assert.match(quizSource,/quizClinicalContextBlockHtml\(e, cur, st\.answered\)/);
  assert.match(keyboard,/document\.querySelector\('\.quiz-img-modal-overlay, \.quiz-review-modal-overlay, \.lightbox-overlay, \.lesion-form-overlay'\)/);
  assert.doesNotMatch(extract('openImageLightbox'),/quizClinicalContextBlockHtml|quizImgIdx|clinicalCases/);
});
