import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDonation, verifyStripeSignature, hmac, stripeForm, invoiceSubscription, invoicePaymentIntent } from '../supabase/functions/_shared/core.mjs';

const valid={amount_cents:2500,frequency:'once',request_id:'876f6536-5fd7-4d38-9f2e-180cf072c291',terms_version:'2026-10-13-v1',locale:'en'};
test('EUR amounts are integers with enforced donation limits',()=>{
  for(const amount of ['2500',null,NaN,0,499,-500,1000001,2500.1])assert.throws(()=>validateDonation({...valid,amount_cents:amount}));
  assert.equal(validateDonation({...valid,amount_cents:500}).amount_cents,500);
  assert.equal(validateDonation({...valid,amount_cents:1000000}).amount_cents,1000000);
});
test('request IDs, frequency and terms cannot be altered',()=>{
  for(const change of [{frequency:'daily'},{request_id:'guessable'},{terms_version:'unreviewed'}])assert.throws(()=>validateDonation({...valid,...change}));
  const result=validateDonation({...valid,locale:'invalid',updates_opt_in:'yes',currency:'usd',success_url:'https://attacker.example',attribution:{utm_source:'x'.repeat(300),email:'secret'}});
  assert.equal(result.locale,'en');assert.equal(result.updates_opt_in,false);assert.equal(result.currency,undefined);assert.equal(result.success_url,undefined);assert.equal(result.attribution.utm_source.length,120);assert.equal(result.attribution.email,undefined);
});
test('Stripe signatures use raw bodies and enforce replay tolerance',async()=>{
  const body=JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',created:1000,livemode:false,data:{object:{id:'cs_fixture'}}});
  const signature=await hmac('1000.'+body,'whsec_fixture');
  const header='t=1000,v1='+signature;
  assert.equal((await verifyStripeSignature(body,header,'whsec_fixture',1000)).id,'evt_fixture');
  await assert.rejects(()=>verifyStripeSignature(body+' ',header,'whsec_fixture',1000));
  await assert.rejects(()=>verifyStripeSignature(body,header,'whsec_fixture',1301));
  await assert.rejects(()=>verifyStripeSignature(body,header,'wrong_secret',1000));
  await assert.rejects(()=>verifyStripeSignature(body,'t=1000,t=1001,v1='+signature,'whsec_fixture',1000));
  assert.equal((await verifyStripeSignature(body,'t=1000,v1='+'0'.repeat(64)+',v1='+signature,'whsec_fixture',1000)).id,'evt_fixture');
});
test('Stripe form encoding preserves nested recurring prices',()=>{
  const form=stripeForm({line_items:[{price_data:{currency:'eur',unit_amount:2500,recurring:{interval:'month'}},quantity:1}],metadata:{application:'kindora-paws'}});
  assert.equal(form.get('line_items[0][price_data][recurring][interval]'),'month');assert.equal(form.get('line_items[0][price_data][unit_amount]'),'2500');assert.equal(form.get('metadata[application]'),'kindora-paws');
});
test('Recurring invoice adapters support current and legacy invoice shapes',()=>{
  assert.equal(invoiceSubscription({parent:{subscription_details:{subscription:'sub_current'}}}),'sub_current');
  assert.equal(invoicePaymentIntent({payments:{data:[{payment:{type:'payment_intent',payment_intent:'pi_current'}}]}}),'pi_current');
  assert.equal(invoiceSubscription({subscription:{id:'sub_legacy'}}),'sub_legacy');assert.equal(invoicePaymentIntent({payment_intent:'pi_legacy'}),'pi_legacy');
});
