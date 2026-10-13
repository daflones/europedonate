import { config } from './config.js';
import { dictionaries, messages } from './copy.js';
import { initialiseConsent, marketingConsent, trackCheckout, safeStorage } from './tracking.js';
import {applyRuntime,navigation,translate,safeAsset} from './site-runtime.js';

const supported = ['en', 'de', 'fr', 'es', 'pt'];
const queryLang = new URLSearchParams(location.search).get('lang');
const savedLang = safeStorage.get('kindora-language');
let language = [queryLang, savedLang, config.defaultLanguage].find(x => supported.includes(x)) || 'en';
let campaign = null;
let amount = 2500;
let frequency = 'once';
let submitting = false;
let requestId = null;
let selectedPlan=null;
let toastTimeout;
const $ = selector => document.querySelector(selector);
export const t = key => campaign?.content_overrides?.[language]?.[key] || dictionaries[language]?.[key] || messages[language]?.[key] || dictionaries.en[key] || messages.en[key] || key;
const money = cents => new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

function setLanguage(value) {
  language = supported.includes(value) ? value : 'en';
  document.documentElement.lang = language;
  safeStorage.set('kindora-language', language);
  $('#language').value = language;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-alt]').forEach(el => { el.alt = messages[language]?.[el.dataset.alt] || messages.en[el.dataset.alt]; });
  $('#menu-button').setAttribute('aria-label', t('menuOpen'));
  document.querySelector('.dialog-close').setAttribute('aria-label', t('close'));
  const next = new URL(location.href);
  next.searchParams.set('lang', language);
  history.replaceState({}, '', next);
  document.querySelectorAll('a[href="/privacy.html"],a[href="/terms.html"]').forEach(link => { link.href = `${link.pathname}?lang=${language}`; });
  updateButton();
  renderCampaign();
  if(campaign){applyRuntime(campaign);loadPlans();}
  navigation();
}

function updateButton() {
  const label = submitting ? t('redirecting') : `${t('donate')} ${money(amount || 2500)}${frequency === 'monthly' ? t('perMonth') : ''}`;
  $('#donation-button-label').textContent = label;
  $('#donation-submit').disabled = submitting;
  $('#monthly-terms').hidden = frequency !== 'monthly';
}

function chooseAmount(value) {
  selectedPlan=null;
  document.querySelectorAll('.amount-options button').forEach(button => {
    const selected = button.dataset.value === String(value);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('#custom-amount-wrap').hidden = value !== 'custom';
  if (value === 'custom') { amount = parseAmount($('#custom-amount').value); $('#custom-amount').focus(); }
  else { amount = Number(value) * 100; }
  requestId = null;
  $('#amount-error').hidden = true;
  updateButton();
}

export function parseAmount(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) return null;
  const [euros, cents = ''] = text.split('.');
  const total = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
  return total >= (campaign?.donation_min_cents||500) && total <= (campaign?.donation_max_cents||1000000) ? total : null;
}

function chooseFrequency(value) {
  selectedPlan=null;
  frequency = value === 'monthly' ? 'monthly' : 'once';
  document.querySelectorAll('[data-frequency]').forEach(button => {
    const selected = button.dataset.frequency === frequency;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  requestId = null;
  updateButton();
}

function radioKeys(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const group = event.target.closest('[role="radiogroup"]');
  if (!group) return;
  const buttons = [...group.querySelectorAll('[role="radio"]')];
  const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
  const next = buttons[(buttons.indexOf(event.target) + direction + buttons.length) % buttons.length];
  event.preventDefault(); next.click(); next.focus();
}

function notice(title, body) {
  $('#notice-title').textContent = title;
  $('#notice-body').textContent = body;
  $('#notice-dialog').showModal();
}

function toast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}

function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

function renderCampaign() {
  const live = campaign?.donations_enabled === true && campaign?.checkout_ready === true;
  $('#preview-notice').hidden = live;
  if (!campaign?.legal_name) return;
  $('#organisation-name').textContent = campaign.legal_name;
  const details = [campaign.shelter_name,campaign.responsible_name,campaign.registration_number ? `${t('registration')}: ${campaign.registration_number}` : '', campaign.address, campaign.country, campaign.contact_email].filter(Boolean);
  $('#organisation-details').textContent = details.join(' · ');
  if (campaign.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campaign.contact_email)) $('#organisation-contact').href = `mailto:${campaign.contact_email}`;
  if (campaign.mission_text?.[language]) document.querySelector('[data-i18n="missionDescription"]').textContent = campaign.mission_text[language];
  const adoption = safeUrl(campaign.adoption_url || config.adoptionUrl);
  const volunteering = safeUrl(campaign.volunteer_url || config.volunteerUrl);
  if (adoption) { $('#adoption-link').href = adoption; $('#adoption-link').target = '_blank'; $('#adoption-link').rel = 'noopener noreferrer'; }
  if (volunteering) { $('#volunteer-link').href = volunteering; $('#volunteer-link').target = '_blank'; $('#volunteer-link').rel = 'noopener noreferrer'; }
  if (live) document.querySelector('[data-i18n="footerDisclosure"]').textContent = t(campaign.images_are_illustrative ? 'footerLiveIllustrative' : 'footerLiveOriginal');
  $('#report-list').replaceChildren();
  for (const report of campaign.reports || []) {
    const url = safeUrl(report.url);
    if (!url) continue;
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = report.title;
    li.append(link); $('#report-list').append(li);
  }
  $('#report-panel').hidden = !$('#report-list').children.length;
}

async function loadCampaign() {
  try {
    const response = await fetch(`${config.apiBase}/config`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Configuration unavailable');
    campaign = await response.json();
    applyRuntime(campaign);
    const presets=campaign.quick_amounts_cents;
    if(Array.isArray(presets)&&presets.length){
      const group=document.querySelector('.amount-options');group.replaceChildren();
      for(const cents of presets.filter(x=>Number.isInteger(x)&&x>=(campaign.donation_min_cents||500)&&x<=(campaign.donation_max_cents||1000000)).slice(0,8)){
        const b=document.createElement('button');b.type='button';b.dataset.value=String(cents/100);b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.tabIndex=-1;b.textContent=money(cents);b.addEventListener('click',()=>chooseAmount(b.dataset.value));group.append(b);
      }
      const other=document.createElement('button');other.type='button';other.dataset.value='custom';other.setAttribute('role','radio');other.setAttribute('aria-checked','false');other.tabIndex=-1;other.textContent=t('other');other.addEventListener('click',()=>chooseAmount('custom'));group.append(other);
      const first=group.querySelector('[data-value="25"]')||group.firstElementChild;if(first)chooseAmount(first.dataset.value);
    }
    const range=document.querySelector('[data-i18n="amountRange"]');if(range)range.textContent=`${money(campaign.donation_min_cents||500)} — ${money(campaign.donation_max_cents||1000000)}`;
    renderCampaign();
    await loadPlans();
  } catch { campaign = null; }
}

async function checkout(event) {
  event.preventDefault();
  if (submitting) return;
  if (!amount || amount < (campaign?.donation_min_cents||500) || amount > (campaign?.donation_max_cents||1000000)) {
    $('#amount-error').textContent = t('invalidAmount'); $('#amount-error').hidden = false; $('#custom-amount').focus(); return;
  }
  if (!campaign?.donations_enabled || !campaign?.checkout_ready) {
    notice(t('openingTitle'), t('openingDescription')); return;
  }
  if (frequency === 'monthly' && !campaign.monthly_enabled) {
    notice(t('monthlyUnavailableTitle'), t('monthlyUnavailableDescription')); return;
  }
  submitting = true; updateButton();
  requestId ||= crypto.randomUUID();
  try {
    const attribution = marketingConsent() ? Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map(key => [key, new URLSearchParams(location.search).get(key)?.slice(0, 120)]).filter(([, value]) => value)) : {};
    const response = await fetch(`${config.apiBase}/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: amount, frequency,plan_id:selectedPlan,locale: language, request_id: requestId, updates_opt_in: $('#updates-opt-in').checked, attribution, terms_version: campaign?.terms_version||'2026-10-13-v1' }),
      signal: AbortSignal.timeout(25000)
    });
    const data = await response.json();
    if (!response.ok) {
      const key = { rate_limited: 'rateLimited', campaign_closed: 'openingDescription', stripe_not_configured: 'openingDescription', monthly_unavailable: 'monthlyUnavailableDescription', invalid_amount: 'invalidAmount' }[data.error] || 'checkoutError';
      throw new Error(t(key));
    }
    const url = new URL(data.url);
    if (url.hostname !== 'checkout.stripe.com' || url.protocol !== 'https:') throw new Error(t('checkoutError'));
    trackCheckout(amount / 100, frequency);
    location.assign(url.href);
  } catch (error) {
    $('#amount-error').textContent = error.name === 'TimeoutError' ? t('checkoutTimeout') : error.message || t('checkoutError');
    $('#amount-error').hidden = false;
  } finally { submitting = false; updateButton(); }
}

async function loadPlans(){
  const parent=$('#support-plans');if(!parent)return;
  try{
    const response=await fetch(`${config.apiBase}/catalog`);if(!response.ok)return;const{products}=await response.json();parent.replaceChildren();
    for(const product of products.filter(p=>p.kind.startsWith('support_'))){const card=document.createElement('article');card.className='support-plan';const title=document.createElement('h3');title.textContent=translate(product.title,language);const description=document.createElement('p');description.textContent=translate(product.description,language);const price=document.createElement('strong');price.textContent=money(product.price_cents)+(product.kind==='support_monthly'?t('perMonth'):'');const button=document.createElement('button');button.type='button';button.className='button button-small';button.textContent=t('donate');button.dataset.plan=product.id;button.addEventListener('click',()=>{if(document.querySelector('.amount-options [data-value="'+String(product.price_cents/100)+'"]'))chooseAmount(String(product.price_cents/100));else{$('#custom-amount').value=(product.price_cents/100).toFixed(2);chooseAmount('custom');}chooseFrequency(product.kind==='support_monthly'?'monthly':'once');selectedPlan=product.id;requestId=null;updateButton();$('#donation-form').scrollIntoView({behavior:'smooth',block:'center'});});card.append(title,description,price,button);parent.append(card);}
    const requested=new URLSearchParams(location.search).get('plan');if(requested){parent.querySelector(`[data-plan="${requested.replace(/[^a-f0-9-]/gi,'')}"]`)?.click();}
  }catch{}
}

$('#language').addEventListener('change', event => setLanguage(event.target.value));
document.querySelectorAll('[data-value]').forEach(button => button.addEventListener('click', () => chooseAmount(button.dataset.value)));
document.querySelectorAll('[data-amount]').forEach(link => link.addEventListener('click', () => chooseAmount(link.dataset.amount)));
document.querySelectorAll('[data-frequency]').forEach(button => button.addEventListener('click', () => chooseFrequency(button.dataset.frequency)));
document.querySelectorAll('[role="radiogroup"]').forEach(group => group.addEventListener('keydown', radioKeys));
$('#custom-amount').addEventListener('input', event => { amount = parseAmount(event.target.value); requestId = null; updateButton(); });
$('#updates-opt-in').addEventListener('change', () => { requestId = null; });
$('#donation-form').addEventListener('submit', checkout);
$('#menu-button').addEventListener('click', () => {
  const open = $('#mobile-nav').hidden;
  $('#mobile-nav').hidden = !open;
  $('#menu-button').setAttribute('aria-expanded', String(open));
  $('#menu-button').setAttribute('aria-label', t(open ? 'menuClose' : 'menuOpen'));
  $('#menu-button use').setAttribute('href', open ? '#i-close' : '#i-menu');
});
$('#mobile-nav').addEventListener('click', event => { if (event.target.closest('a')) { $('#mobile-nav').hidden = true; $('#menu-button').setAttribute('aria-expanded', 'false'); $('#menu-button use').setAttribute('href', '#i-menu'); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('#mobile-nav').hidden = true; $('#menu-button').setAttribute('aria-expanded', 'false'); $('#menu-button use').setAttribute('href', '#i-menu'); } });
document.querySelectorAll('.dialog-close,.dialog-ok').forEach(button => button.addEventListener('click', () => $('#notice-dialog').close()));
$('#share-button').addEventListener('click', async () => {
  const url = new URL(config.canonicalUrl || location.origin); url.searchParams.set('lang', language);
  try { if (navigator.share) await navigator.share({ title: 'Kindora Paws', text: t('footerTagline'), url: url.href }); else { await navigator.clipboard.writeText(url.href); toast(t('copied')); } }
  catch (error) { if (error.name !== 'AbortError') toast(url.href); }
});
const donationObserver = new IntersectionObserver(entries => { $('#mobile-donate-bar').hidden = entries[0].isIntersecting; }, { threshold: 0.05 });
donationObserver.observe($('#donation-form'));
$('#year').textContent = new Date().getFullYear();
setLanguage(language);
initialiseConsent();
loadCampaign();
if (new URLSearchParams(location.search).get('cancelled') === '1') notice(t('cancelledTitle'), t('cancelledDescription'));
