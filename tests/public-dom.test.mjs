import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{Window}from'happy-dom';
test('mobile menu, donor values, CMS text and cookie refusal work together',async()=>{
  const window=new Window({url:'https://kindora.example/?lang=de',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
  window.document.write(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'));
  for(const key of['window','document','HTMLElement','CustomEvent','location','history','localStorage'])globalThis[key]=key==='window'?window:window[key];
  Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
  globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback([{isIntersecting:false}]);}};
  const s={brand:'Kindora Paws',legal_name:null,donations_enabled:false,checkout_ready:true,donation_min_cents:500,donation_max_cents:1000000,quick_amounts_cents:[1000,2500,5000],content_overrides:{de:{heroTitle:'Ein Titel aus dem Panel'}},media_settings:{},visual_settings:{},section_settings:{},tracking_settings:{google_tag_id:'AW-123456789',meta_pixel_id:'123456789012345'}};
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/config')?s:String(url).endsWith('/catalog')?{products:[]}:{pages:[]}),{status:200,headers:{'content-type':'application/json'}});
  try{
    await import('../dist/app.js?dom-test');await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(document.documentElement.lang,'de');assert.equal(document.querySelector('[data-i18n="heroTitle"]').textContent,'Ein Titel aus dem Panel');
    document.getElementById('menu-button').click();assert.equal(document.getElementById('mobile-nav').hidden,false);assert.equal(document.getElementById('menu-button').getAttribute('aria-expanded'),'true');
    document.querySelector('#mobile-nav a').click();assert.equal(document.getElementById('mobile-nav').hidden,true);
    document.querySelector('[data-value="custom"]').click();const custom=document.getElementById('custom-amount');custom.value='12,50';custom.dispatchEvent(new window.Event('input'));
    assert.ok(document.getElementById('donation-button-label').textContent.includes('12,50'));
    document.getElementById('donation-form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.ok(document.getElementById('notice-title').textContent.length>10);
    document.querySelector('[data-consent="essential"]').click();assert.equal(JSON.parse(localStorage.getItem('kindora-consent')).marketing,false);assert.equal(document.querySelectorAll('script[src*="googletagmanager"],script[src*="facebook.net"]').length,0);
  }finally{await window.happyDOM.close();}
});
