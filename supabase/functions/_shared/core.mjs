export class PublicError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export function validateDonation(input, limits = {min:500,max:1000000,terms:'2026-10-13-v1'}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PublicError('invalid_request');
  if (!Number.isInteger(input.amount_cents) || input.amount_cents < limits.min || input.amount_cents > limits.max) throw new PublicError('invalid_amount');
  if (!['once', 'monthly'].includes(input.frequency)) throw new PublicError('invalid_frequency');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.request_id || '')) throw new PublicError('invalid_request_id');
  if (input.terms_version !== limits.terms) throw new PublicError('invalid_terms_version');
  const attribution = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (typeof input.attribution?.[key] === 'string') attribution[key] = input.attribution[key].slice(0, 120);
  return {
    amount_cents: input.amount_cents, frequency: input.frequency, request_id: input.request_id,
    locale: ['en', 'de', 'fr', 'es', 'pt'].includes(input.locale) ? input.locale : 'en',
    updates_opt_in: input.updates_opt_in === true, terms_version: input.terms_version, attribution
  };
}

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

export async function hmac(text, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return Array.from(new Uint8Array(signed), value => value.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyStripeSignature(body, header, secret, now = Date.now() / 1000) {
  if (!header || !secret) throw new PublicError('invalid_signature', 400);
  const parts = header.split(',').map(value => value.trim().split('='));
  const timestamps = parts.filter(([key]) => key === 't');
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1])) throw new PublicError('invalid_signature', 400);
  const timestamp = Number(timestamps[0][1]);
  if (Math.abs(now - timestamp) > 300) throw new PublicError('invalid_signature', 400);
  const expected = await hmac(`${timestamp}.${body}`, secret);
  if (!signatures.some(signature => /^[a-f0-9]{64}$/.test(signature) && constantTimeEqual(signature, expected))) throw new PublicError('invalid_signature', 400);
  let event;
  try { event = JSON.parse(body); } catch { throw new PublicError('invalid_event', 400); }
  if (!event.id?.startsWith('evt_') || !event.type || !event.data?.object || !Number.isInteger(event.created) || typeof event.livemode !== 'boolean') throw new PublicError('invalid_event', 400);
  return event;
}

export function stripeForm(input, prefix = '', output = new URLSearchParams()) {
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') stripeForm(value, path, output);
    else output.append(path, String(value));
  }
  return output;
}

export const objectId = object => typeof object === 'string' ? object : object?.id || null;
export function invoiceSubscription(invoice) { return objectId(invoice.parent?.subscription_details?.subscription || invoice.subscription); }
export function invoiceMetadata(invoice) { return invoice.parent?.subscription_details?.metadata || invoice.subscription_details?.metadata || {}; }
export function invoicePaymentIntent(invoice) {
  return objectId(invoice.payment_intent) || objectId(invoice.payments?.data?.find(item => item.payment?.type === 'payment_intent')?.payment?.payment_intent);
}
