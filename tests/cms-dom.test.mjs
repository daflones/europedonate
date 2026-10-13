import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{Window}from'happy-dom';

test('admin login loads every control panel and saves a marketing change',async()=>{
  const window=new Window({url:'https://kindora.example/admin.html',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
  window.document.write(await readFile(new URL('../dist/admin.html',import.meta.url),'utf8'));
  for(const key of ['window','document','HTMLElement','CustomEvent','location'])globalThis[key]=key==='window'?window:window[key];
  let savedMarketing=null;
  const settings={brand:'Kindora Paws',tagline:'Kindness',donations_enabled:false,shop_enabled:false,monthly_enabled:true,donation_min_cents:500,donation_max_cents:1000000,quick_amounts_cents:[1000,2500],shipping_cents:990,shipping_countries:['PT','DE'],terms_version:'2026-10-13-v1',content_overrides:{},visual_settings:{},media_settings:{},section_settings:{},tracking_settings:{},reports:[]};
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(url),path=parsed.pathname;
    const value=path.includes('/auth/v1/token')?{access_token:'fixture-token',refresh_token:'fixture-refresh',expires_in:3600,user:{id:'f1344ff4-5172-4dfd-b0ec-16d592391cec',email:'admin@example.test'}}:
      path.endsWith('/admin_members')?[{user_id:'f1344ff4-5172-4dfd-b0ec-16d592391cec'}]:
      path.endsWith('/campaign_settings')?[settings]:
      path.endsWith('/admin_donation_summary')?{net_received_cents:0,confirmed_gifts:0,active_monthly:0}:
      path.endsWith('/admin_order_summary')?{net_sales_cents:0,paid_orders:0}:[];
    if(options.method==='PATCH'&&path.endsWith('/campaign_settings'))savedMarketing=JSON.parse(options.body);
    return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json','content-range':'0-0/0'}});
  };
  const timers=[],realTimers=[];const originalTimer=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  globalThis.setTimeout=(callback,ms)=>{if(ms>5000){timers.push(callback);return timers.length;}const id=originalTimer(callback,ms);realTimers.push(id);return id;};globalThis.clearTimeout=id=>{if(realTimers.includes(id))originalClear(id);};
  try{
    await import('../dist/admin.js?dom-test');
    document.getElementById('admin-email').value='admin@example.test';document.getElementById('admin-password').value='fixture-only-password';document.getElementById('admin-login').dispatchEvent(new window.Event('submit',{cancelable:true}));
    await new Promise(resolve=>originalTimer(resolve,40));
    assert.equal(document.getElementById('admin-dashboard').hidden,false);
    assert.equal(document.getElementById('admin-error').hidden,true,document.getElementById('admin-error').textContent);
    assert.ok(document.querySelectorAll('.content-field').length>=121);
    assert.equal(document.querySelectorAll('#media-fields input[type=file]').length,5);
    document.querySelector('[data-panel="marketing"]').click();
    assert.equal(document.querySelector('[data-admin-panel="marketing"]').hidden,false);
    document.getElementById('marketing-form').elements.google_tag_id.value='AW-123456789';
    document.getElementById('marketing-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    await new Promise(resolve=>originalTimer(resolve,30));
    assert.equal(savedMarketing.tracking_settings.google_tag_id,'AW-123456789');
    document.getElementById('new-page').click();assert.equal(document.querySelectorAll('.page-block-card').length,1);
    document.getElementById('add-page-block').click();assert.equal(document.querySelectorAll('.page-block-card').length,2);
    document.getElementById('new-product').click();assert.equal(document.getElementById('product-form').elements.kind.value,'support_once');
  }finally{realTimers.forEach(originalClear);globalThis.setTimeout=originalTimer;globalThis.clearTimeout=originalClear;await window.happyDOM.close();}
});
