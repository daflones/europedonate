import { config } from './config.js';
import { initialiseConsent } from './tracking.js';
import{renderBlocks,applyRuntime}from'./site-runtime.js';
const slug=location.pathname.includes('shop-terms')?'purchase-terms':location.pathname.includes('privacy')?'privacy':'donation-terms';
try{const response=await fetch(`${config.apiBase}/page?slug=${slug}`);if(response.ok){const page=await response.json();const language=new URLSearchParams(location.search).get('lang')||'en';const main=document.querySelector('main');const title=main.querySelector('h1');main.replaceChildren(title);const parent=document.createElement('div');renderBlocks(parent,page.blocks,language);main.append(parent);}}catch{}
try {
  const response = await fetch(`${config.apiBase}/config`, {signal:AbortSignal.timeout(12000)});
  if (response.ok) {
    const s=await response.json();
    applyRuntime(s);
    const identity=[s.legal_name,s.registration_number,s.address,s.country].filter(Boolean).join(' · ');
    document.querySelectorAll('[data-organisation]').forEach(el=>{if(identity)el.textContent=identity;});
    const email=s.privacy_contact_email||s.contact_email;
    document.querySelectorAll('[data-contact]').forEach(el=>{if(email){el.textContent=email;el.href=`mailto:${email}`;}});
    if(s.privacy_retention_text)document.querySelectorAll('[data-retention]').forEach(el=>{el.textContent=s.privacy_retention_text;});
    if(s.privacy_transfer_text)document.querySelectorAll('[data-transfers]').forEach(el=>{el.textContent=s.privacy_transfer_text;});
    if(s.shop_policy&&document.getElementById('shop-additional-policy'))document.getElementById('shop-additional-policy').textContent=s.shop_policy;
    document.querySelectorAll('[data-draft-notice]').forEach(el=>{if(s.donations_enabled&&s.checkout_ready)el.hidden=true;});
  }
} catch { /* The draft notice remains visible if configuration is unavailable. */ }
initialiseConsent();
