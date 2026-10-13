import { PublicError, validateDonation, sha256, hmac, verifyStripeSignature, stripeForm, objectId, invoiceSubscription, invoiceMetadata, invoicePaymentIntent,constantTimeEqual } from '../_shared/core.mjs';

const env = (name: string) => Deno.env.get(name) || '';
const databaseUrl = env('SUPABASE_URL');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || Object.values(JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'))[0] as string;
const stripeKey = env('STRIPE_SECRET_KEY');
const webhookSecret = env('STRIPE_WEBHOOK_SECRET');
const stripeVersion = env('STRIPE_API_VERSION') || '2026-09-30.endive';
const siteUrl = env('SITE_URL').replace(/\/$/, '');
const allowedOrigins = new Set([siteUrl, ...env('ALLOWED_ORIGINS').split(',').map(value => value.trim())].filter(Boolean));
const encoder = new TextEncoder();

async function db(path: string, method = 'GET', body?: unknown) {
  if (!databaseUrl || !serviceKey) throw new PublicError('backend_not_configured', 503);
  const response = await fetch(`${databaseUrl}/rest/v1/${path}`, {
    method, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: method === 'POST' ? `return=representation${path.includes('on_conflict=') ? ',resolution=ignore-duplicates' : ''}` : 'return=minimal' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) {
    // Codes are sufficient for operational logs; donor data and secrets are never logged.
    console.error('Database operation failed', response.status, path.split('?')[0]);
    throw new PublicError('database_unavailable', 503);
  }
  return text ? JSON.parse(text) : null;
}

async function stripe(path: string, method = 'GET', data?: Record<string, unknown>, idempotency?: string) {
  if (!stripeKey) throw new PublicError('stripe_not_configured', 503);
  const headers: Record<string, string> = { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': stripeVersion };
  if (idempotency) headers['Idempotency-Key'] = idempotency;
  if (data) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers, body: data ? stripeForm(data) : undefined, signal: AbortSignal.timeout(20000) });
  const value = await response.json();
  if (!response.ok) { console.error('Stripe operation failed', response.status, value.error?.code || 'unknown'); throw new PublicError('payment_service_unavailable', 502); }
  return value;
}

async function settings() {
  const rows = await db('campaign_settings?id=eq.true&select=*');
  if (!rows?.[0]) throw new PublicError('campaign_not_found', 503);
  return rows[0];
}

function ensureOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins.has(origin)) throw new PublicError('origin_not_allowed', 403);
  return origin;
}

async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new PublicError('invalid_content_type', 415);
  if (Number(request.headers.get('content-length') || 0) > 16000) throw new PublicError('request_too_large', 413);
  const text = await request.text();
  if (encoder.encode(text).length > 16000) throw new PublicError('request_too_large', 413);
  try { return JSON.parse(text); } catch { throw new PublicError('invalid_json'); }
}

async function limit(request: Request) {
  const salt = env('RATE_LIMIT_SALT');
  if (!salt) throw new PublicError('backend_not_configured', 503);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
  // Only a salted hash and a ten-minute bucket are persisted, never the raw IP.
  const bucket = await sha256(`${salt}:checkout:${ip}`);
  if (!await db('rpc/allow_checkout_attempt', 'POST', { p_bucket: bucket })) throw new PublicError('rate_limited', 429);
}

async function publicConfiguration() {
  const s = await settings();
  return {
    brand: s.brand, legal_name: s.legal_name, registration_number: s.registration_number, shelter_name: s.shelter_name,
    country: s.country, address: s.address, contact_email: s.contact_email, privacy_contact_email: s.privacy_contact_email,
    responsible_name:s.responsible_name,tagline:s.tagline,content_overrides:s.content_overrides,visual_settings:s.visual_settings,media_settings:s.media_settings,tracking_settings:s.tracking_settings,section_settings:s.section_settings,
    donation_min_cents:s.donation_min_cents,donation_max_cents:s.donation_max_cents,quick_amounts_cents:s.quick_amounts_cents,terms_version:s.terms_version,canonical_url:s.canonical_url,
    shop_enabled:s.shop_enabled,shipping_cents:s.shipping_cents,shipping_countries:s.shipping_countries,automatic_tax_enabled:s.automatic_tax_enabled,shop_policy:s.shop_policy,
    privacy_retention_text: s.privacy_retention_text, privacy_transfer_text: s.privacy_transfer_text,
    donations_enabled: s.donations_enabled, monthly_enabled: s.monthly_enabled,
    checkout_ready: !!stripeKey && !!webhookSecret && !!siteUrl && !!env('RATE_LIMIT_SALT'),
    images_are_illustrative: s.images_are_illustrative, mission_text: s.mission_text,
    adoption_url: s.adoption_url, volunteer_url: s.volunteer_url, reports: s.reports
  };
}

async function checkout(request: Request) {
  ensureOrigin(request);
  const raw = await readJson(request);
  const s = await settings();
  if (!s.donations_enabled || !s.fundraising_authorised || !s.policies_reviewed) throw new PublicError('campaign_closed', 409);
  let plan = null;
  if(raw.plan_id){
    if(!/^[a-f0-9-]{36}$/i.test(raw.plan_id))throw new PublicError('invalid_plan');
    plan=(await db(`catalog_products?id=eq.${raw.plan_id}&published=eq.true&select=*`))?.[0];
    if(!plan||!['support_once','support_monthly'].includes(plan.kind))throw new PublicError('invalid_plan');
    raw.amount_cents=plan.price_cents;raw.frequency=plan.kind==='support_monthly'?'monthly':'once';
  }
  const input = validateDonation(raw,{min:s.donation_min_cents||500,max:s.donation_max_cents||1000000,terms:s.terms_version||'2026-10-13-v1'});
  if (!stripeKey || !webhookSecret || !siteUrl) throw new PublicError('stripe_not_configured', 503);
  if (input.frequency === 'monthly' && !s.monthly_enabled) throw new PublicError('monthly_unavailable', 409);
  await limit(request);
  const receiptToken = await hmac(`receipt:${input.request_id}`, env('RATE_LIMIT_SALT'));
  const receiptHash = await sha256(receiptToken);
  const existing = await db(`donations?request_id=eq.${input.request_id}&select=*`);
  let donation = existing?.[0];
  if (donation) {
    if (donation.amount_cents !== input.amount_cents || donation.frequency !== input.frequency || donation.locale !== input.locale || donation.updates_opt_in !== input.updates_opt_in) throw new PublicError('request_conflict', 409);
    if (donation.receipt_token_hash !== receiptHash) throw new PublicError('request_conflict', 409);
    if (donation.checkout_session_id) {
      const session = await stripe(`checkout/sessions/${donation.checkout_session_id}`);
      if (session.status !== 'open') throw new PublicError('checkout_already_completed', 409);
      return { url: session.url };
    }
  } else {
    const rows = await db('donations?on_conflict=request_id', 'POST', {
      ...input, receipt_token_hash: receiptHash, livemode: stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_'),
      support_product_id:plan?.id||null,
      updates_opt_in_at: input.updates_opt_in ? new Date().toISOString() : null
    });
    donation = rows?.[0] || (await db(`donations?request_id=eq.${input.request_id}&select=*`))?.[0];
    if (!donation || donation.amount_cents !== input.amount_cents || donation.frequency !== input.frequency || donation.locale !== input.locale || donation.updates_opt_in !== input.updates_opt_in || donation.receipt_token_hash !== receiptHash) throw new PublicError('request_conflict', 409);
  }
  const metadata = { application: 'kindora-paws', donation_id: donation.id };
  const requestData: Record<string, unknown> = {
    mode: input.frequency === 'monthly' ? 'subscription' : 'payment',
    locale: input.locale, client_reference_id: donation.id, metadata,
    success_url: `${siteUrl}/thank-you.html?session_id={CHECKOUT_SESSION_ID}&receipt=${receiptToken}&lang=${input.locale}`,
    cancel_url: `${siteUrl}/?cancelled=1&lang=${input.locale}#donate`,
    billing_address_collection: 'auto',
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: input.amount_cents,
      product_data: { name: plan? (plan.title[input.locale]||plan.title.en):`${s.brand} — shelter care`, description: plan? (plan.description[input.locale]||plan.description.en||'Support for shelter care.'):'Food, necessary medicines and everyday care for shelter dogs.' },
      ...(input.frequency === 'monthly' ? { recurring: { interval: 'month' } } : {})
    }}]
  };
  // Leave payment_method_types unset so Stripe selects eligible methods dynamically.
  if (input.frequency === 'monthly') requestData.subscription_data = { metadata };
  else { requestData.submit_type = 'donate'; requestData.customer_creation = 'always'; requestData.payment_intent_data = { metadata }; }
  const session = await stripe('checkout/sessions', 'POST', requestData, `kindora-checkout-${input.request_id}`);
  await db(`donations?id=eq.${donation.id}`, 'PATCH', { checkout_session_id: session.id, checkout_url: session.url, updated_at: new Date().toISOString() });
  return { url: session.url };
}

async function receiptDonation(request: Request) {
  ensureOrigin(request);
  const input = await readJson(request);
  if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(input.session_id || '') || !/^[a-f0-9]{64}$/.test(input.receipt || '')) throw new PublicError('invalid_receipt', 404);
  const hash = await sha256(input.receipt);
  const rows = await db(`donations?checkout_session_id=eq.${encodeURIComponent(input.session_id)}&receipt_token_hash=eq.${hash}&select=*`);
  if (!rows?.[0]) throw new PublicError('invalid_receipt', 404);
  return rows[0];
}

async function donationStatus(request: Request) {
  const donation = await receiptDonation(request);
  // Never mark paid based on the redirect or a client-supplied flag.
  return { reference: donation.id, status: donation.status, amount_cents: donation.amount_cents, currency: 'EUR',
    frequency: donation.frequency, livemode: donation.livemode, paid_at: donation.paid_at,
    subscription_status: donation.subscription_status, can_manage: !!donation.stripe_customer_id && donation.frequency === 'monthly' };
}

async function portal(request: Request) {
  const donation = await receiptDonation(request);
  if (donation.frequency !== 'monthly' || !donation.stripe_customer_id) throw new PublicError('portal_unavailable', 409);
  const data: Record<string, unknown> = { customer: donation.stripe_customer_id, return_url: `${siteUrl}/` };
  if (env('STRIPE_PORTAL_CONFIGURATION')) data.configuration = env('STRIPE_PORTAL_CONFIGURATION');
  const session = await stripe('billing_portal/sessions', 'POST', data);
  return { url: session.url };
}

async function publicCatalog() {
  const s=await settings();
  await db('rpc/release_stale_shop_reservations','POST',{});
  const products=await db('catalog_products?published=eq.true&select=id,kind,title,description,price_cents,image_url,category,stock,sort_order&order=sort_order.asc,created_at.desc');
  return {products,shop_enabled:s.shop_enabled,shipping_cents:s.shipping_cents};
}
async function publicPages(slug?: string) {
  if(slug){if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))throw new PublicError('not_found',404);
    const page=(await db(`site_pages?slug=eq.${slug}&published=eq.true&select=slug,title,blocks`))?.[0];if(!page)throw new PublicError('not_found',404);return page;}
  return {pages:await db('site_pages?published=eq.true&show_in_navigation=eq.true&select=slug,title&order=sort_order.asc')};
}
async function shopCheckout(request: Request) {
  ensureOrigin(request);
  const raw=await readJson(request);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.request_id||''))throw new PublicError('invalid_request_id');
  if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>20)throw new PublicError('invalid_cart');
  const grouped=new Map<string,number>();
  for(const item of raw.items){if(!/^[a-f0-9-]{36}$/i.test(item.product_id||'')||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)throw new PublicError('invalid_cart');grouped.set(item.product_id,(grouped.get(item.product_id)||0)+item.quantity);}
  const items=[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([product_id,quantity])=>({product_id,quantity}));
  if(items.some(item=>item.quantity>99))throw new PublicError('invalid_cart');
  const s=await settings();
  if(!s.shop_enabled)throw new PublicError('shop_closed',409);
  if(!stripeKey||!webhookSecret||!siteUrl)throw new PublicError('stripe_not_configured',503);
  await limit(request);
  const locale=['en','de','fr','es','pt'].includes(raw.locale)?raw.locale:'en';
  const receipt=await hmac(`shop:${raw.request_id}`,env('RATE_LIMIT_SALT'));
  const order=await db('rpc/reserve_shop_order','POST',{p_request_id:raw.request_id,p_receipt_hash:await sha256(receipt),p_cart_fingerprint:await sha256(JSON.stringify({items,locale})),p_locale:locale,p_items:items,p_livemode:stripeKey.startsWith('sk_live_')||stripeKey.startsWith('rk_live_')});
  if(order.checkout_session_id){const session=await stripe(`checkout/sessions/${order.checkout_session_id}`);if(session.status!=='open')throw new PublicError('checkout_already_completed',409);return {url:session.url};}
  const lines=await db(`shop_order_items?order_id=eq.${order.id}&select=kind,title,unit_price_cents,quantity`);
  const physical=lines.some((item:any)=>item.kind==='physical');
  const metadata={application:'kindora-shop',order_id:order.id};
  const data:Record<string,unknown>={mode:'payment',locale,metadata,client_reference_id:order.id,payment_intent_data:{metadata},
    success_url:`${siteUrl}/order.html?session_id={CHECKOUT_SESSION_ID}&receipt=${receipt}&lang=${locale}`,
    cancel_url:`${siteUrl}/shop.html?cancelled=1&lang=${locale}`,expires_at:Math.floor(new Date(order.created_at).getTime()/1000)+3600,
    line_items:lines.map((item:any)=>({quantity:item.quantity,price_data:{currency:'eur',unit_amount:item.unit_price_cents,product_data:{name:item.title},tax_behavior:'inclusive'}})),
    billing_address_collection:'auto',customer_creation:'always'};
  if(physical){
    data.shipping_address_collection={allowed_countries:s.shipping_countries};
    data.shipping_options=[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:order.shipping_cents,currency:'eur'},display_name:'Standard delivery',tax_behavior:'inclusive'}}];
  }
  if(s.automatic_tax_enabled)data.automatic_tax={enabled:true};
  const session=await stripe('checkout/sessions','POST',data,`kindora-shop-${raw.request_id}`);
  await db(`shop_orders?id=eq.${order.id}`,'PATCH',{checkout_session_id:session.id,updated_at:new Date().toISOString()});
  return {url:session.url};
}
async function orderStatus(request: Request) {
  ensureOrigin(request);const raw=await readJson(request);
  if(!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(raw.session_id||'')||!/^[a-f0-9]{64}$/.test(raw.receipt||''))throw new PublicError('invalid_receipt',404);
  const order=(await db(`shop_orders?checkout_session_id=eq.${encodeURIComponent(raw.session_id)}&receipt_token_hash=eq.${await sha256(raw.receipt)}&select=*`))?.[0];
  if(!order)throw new PublicError('invalid_receipt',404);
  const paid=['paid','partially_refunded'].includes(order.status);
  const items=await db(`shop_order_items?order_id=eq.${order.id}&select=title,quantity,unit_price_cents,kind${paid?',download_url':''}`);
  return {reference:order.id,status:order.status,amount_cents:order.amount_cents,shipping_cents:order.shipping_cents,frequency:'once',livemode:order.livemode,fulfillment_status:order.fulfillment_status,tracking_number:order.tracking_number,items};
}
async function bootstrapAdmin(request:Request){
  ensureOrigin(request);const raw=await readJson(request),secret=env('ADMIN_BOOTSTRAP_SECRET');
  if(!secret||typeof raw.code!=='string'||!constantTimeEqual(await sha256(raw.code),await sha256(secret)))throw new PublicError('setup_not_allowed',403);
  await limit(request);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email||'')||typeof raw.password!=='string'||raw.password.length<12||raw.password.length>128)throw new PublicError('invalid_credentials');
  if((await db('admin_members?select=user_id&limit=1'))?.length)throw new PublicError('setup_complete',409);
  const response=await fetch(`${databaseUrl}/auth/v1/admin/users`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({email:raw.email,password:raw.password,email_confirm:true}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new PublicError('account_creation_failed',409);
  const data=await response.json(),id=data.id||data.user?.id;
  if(!id||!await db('rpc/claim_first_admin','POST',{p_user_id:id}))throw new PublicError('setup_complete',409);
  return {created:true};
}

async function normalizedEvent(event: any) {
  const obj = event.data.object;
  const prefix = event.type.split('.')[0];
  const ownMetadata = obj.metadata || {};
  if (event.type.startsWith('checkout.session.')) {
    if (!['kindora-paws','kindora-shop'].includes(ownMetadata.application)) return { kind: 'ignored' };
    const map: Record<string, string> = {
      'checkout.session.completed': obj.payment_status === 'paid' ? 'paid' : 'processing',
      'checkout.session.async_payment_succeeded': 'paid', 'checkout.session.async_payment_failed': 'failed', 'checkout.session.expired': 'expired'
    };
    if (!map[event.type]) return { kind: 'ignored' };
    if(ownMetadata.application==='kindora-shop')return {kind:'shop_checkout',order_id:ownMetadata.order_id,session_id:obj.id,currency:obj.currency,amount_cents:obj.amount_total,status:map[event.type],payment_intent_id:objectId(obj.payment_intent),email:obj.customer_details?.email,name:obj.customer_details?.name,shipping_details:obj.collected_information?.shipping_details||obj.shipping_details||null};
    return { kind: 'checkout', donation_id: ownMetadata.donation_id, session_id: obj.id, currency: obj.currency,
      amount_cents: obj.amount_total, frequency: obj.mode === 'subscription' ? 'monthly' : 'once', status: map[event.type],
      customer_id: objectId(obj.customer), subscription_id: objectId(obj.subscription), payment_intent_id: objectId(obj.payment_intent),
      email: obj.customer_details?.email, name: obj.customer_details?.name };
  }
  if (prefix === 'invoice' && ['invoice.paid', 'invoice.payment_failed'].includes(event.type)) {
    const subscriptionId = invoiceSubscription(obj);
    if (!subscriptionId) return { kind: 'ignored' };
    let metadata = invoiceMetadata(obj);
    let subscription;
    if (metadata.application !== 'kindora-paws') {
      subscription = await stripe(`subscriptions/${subscriptionId}`);
      metadata = subscription.metadata || {};
    }
    if (metadata.application !== 'kindora-paws') return { kind: 'ignored' };
    if (event.type === 'invoice.payment_failed') {
      subscription ||= await stripe(`subscriptions/${subscriptionId}`);
      return { kind: 'subscription', donation_id: metadata.donation_id, subscription_id: subscriptionId, customer_id: objectId(obj.customer), subscription_status: subscription.status };
    }
    // Current invoice APIs expose PaymentIntents inside the invoice payments list.
    const invoice = await stripe(`invoices/${obj.id}`);
    if (invoice.amount_paid <= 0 || invoice.paid_out_of_band) return { kind: 'ignored' };
    if (!invoicePaymentIntent(invoice)) invoice.payments = await stripe(`invoice_payments?invoice=${encodeURIComponent(invoice.id)}&status=paid&limit=100`);
    return { kind: 'payment', donation_id: metadata.donation_id, payment_key: invoice.id,
      payment_intent_id: invoicePaymentIntent(invoice), amount_cents: invoice.amount_paid, currency: invoice.currency,
      subscription_id: subscriptionId, customer_id: objectId(invoice.customer), email: invoice.customer_email, name: invoice.customer_name,
      paid_at: invoice.status_transitions?.paid_at || event.created };
  }
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    if (ownMetadata.application !== 'kindora-paws') return { kind: 'ignored' };
    return { kind: 'subscription', donation_id: ownMetadata.donation_id, subscription_id: obj.id, customer_id: objectId(obj.customer), subscription_status: obj.status };
  }
  if (event.type === 'charge.refunded') {
    const paymentIntent = objectId(obj.payment_intent);
    if (!paymentIntent) return { kind: 'ignored' };
    // Minimal refund state also covers an invoice event delivered later.
    // It affects the donation ledger only if the PaymentIntent matches a donation.
    const currentCharge = await stripe(`charges/${obj.id}`);
    const order=(await db(`shop_orders?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntent)}&select=id`))?.[0];
    if(order)return {kind:'shop_refund',payment_intent_id:paymentIntent,refunded_cents:currentCharge.amount_refunded};
    return { kind: 'refund', payment_intent_id: paymentIntent, refunded_cents: currentCharge.amount_refunded };
  }
  return { kind: 'ignored' };
}

async function webhook(request: Request) {
  if (!webhookSecret) throw new PublicError('stripe_not_configured', 503);
  if (Number(request.headers.get('content-length') || 0) > 1000000) throw new PublicError('request_too_large', 413);
  const body = await request.text();
  if (encoder.encode(body).length > 1000000) throw new PublicError('request_too_large', 413);
  const event = await verifyStripeSignature(body, request.headers.get('stripe-signature'), webhookSecret);
  if (event.livemode !== (stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_'))) throw new PublicError('mode_mismatch', 400);
  const data = await normalizedEvent(event);
  const result = await db(data.kind?.startsWith('shop_')?'rpc/apply_shop_event':'rpc/apply_stripe_event', 'POST', { p_event_id: event.id, p_event_type: event.type, p_event_created: event.created, p_livemode: event.livemode, p_data: data });
  return { received: true, duplicate: result?.duplicate === true };
}

function headers(request: Request, publicRead = false) {
  const origin = request.headers.get('origin') || '';
  const result: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (publicRead) result['Access-Control-Allow-Origin'] = '*';
  else if (allowedOrigins.has(origin)) result['Access-Control-Allow-Origin'] = origin;
  result['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
  result['Access-Control-Allow-Headers'] = 'content-type,apikey,authorization,x-client-info';
  return result;
}

export async function handleRequest(request: Request) {
  const route = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  const publicRead = ['config', 'health','catalog','pages','page'].includes(route || '');
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request, publicRead) });
    let result;
    if (request.method === 'GET' && route === 'config') result = await publicConfiguration();
    else if(request.method==='GET'&&route==='catalog')result=await publicCatalog();
    else if(request.method==='GET'&&route==='pages')result=await publicPages();
    else if(request.method==='GET'&&route==='page')result=await publicPages(new URL(request.url).searchParams.get('slug')||'');
    else if (request.method === 'GET' && route === 'health') result = { ok: true, application: 'kindora-paws', payment_configuration_present: !!stripeKey && !!webhookSecret };
    else if (request.method === 'POST' && route === 'checkout') result = await checkout(request);
    else if (request.method === 'POST' && route === 'status') result = await donationStatus(request);
    else if (request.method === 'POST' && route === 'portal') result = await portal(request);
    else if(request.method==='POST'&&route==='shop-checkout')result=await shopCheckout(request);
    else if(request.method==='POST'&&route==='order-status')result=await orderStatus(request);
    else if(request.method==='POST'&&route==='bootstrap-admin')result=await bootstrapAdmin(request);
    else if (request.method === 'POST' && route === 'webhook') result = await webhook(request);
    else throw new PublicError('not_found', 404);
    return new Response(JSON.stringify(result), { status: 200, headers: headers(request, publicRead) });
  } catch (error) {
    const known = error instanceof PublicError;
    if (!known) console.error('Donation handler failed', error instanceof Error ? error.name : 'UnknownError');
    return new Response(JSON.stringify({ error: known ? error.code : 'internal_error' }), { status: known ? error.status : 500, headers: headers(request, publicRead) });
  }
}

Deno.serve(handleRequest);
