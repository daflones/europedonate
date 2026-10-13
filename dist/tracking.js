import { config } from './config.js';
import{dictionaries}from'./copy.js';

export const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage can be disabled by the visitor. */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* Optional persistence. */ } }
};
function consent() { try { return JSON.parse(safeStorage.get('kindora-consent') || 'null'); } catch { return null; } }
export function marketingConsent() { const value = consent(); return value?.marketing === true && Date.now() - value.at < 180 * 86400000; }
let loaded = false;

function loadMarketing() {
  if (!marketingConsent() || loaded) return;
  const settings=window.kindoraRuntime?.tracking_settings||{};
  const google=settings.google_tag_id||settings.ga4_id||config.googleTagId;
  const meta=settings.meta_pixel_id||config.metaPixelId;
  if(!google&&!meta&&!settings.gtm_id&&!settings.extra_scripts?.length)return;
  loaded = true;
  if (/^(G|AW)-[\w-]+$/.test(google)) {
    window.dataLayer ||= [];
    window.gtag = (...args) => window.dataLayer.push(args);
    window.gtag('consent', 'default', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', google);
    if(settings.ga4_id&&settings.ga4_id!==google)window.gtag('config',settings.ga4_id);
    const script = document.createElement('script'); script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(google)}`; document.head.append(script);
  }
  if(/^GTM-[A-Z0-9]+$/.test(settings.gtm_id||'')){
    window.dataLayer||=[];window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});const script=document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(settings.gtm_id)}`;document.head.append(script);
  }
  if (/^\d{5,20}$/.test(meta)) {
    const queue = function (...args) { if (queue.callMethod) queue.callMethod(...args); else queue.queue.push(args); };
    queue.queue = []; queue.push = queue; queue.loaded = true; queue.version = '2.0';
    window.fbq = queue; window._fbq = queue;
    const script = document.createElement('script'); script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.append(script);
    window.fbq('consent', 'grant'); window.fbq('init', meta); window.fbq('track', 'PageView');
  }
  for(const item of (settings.extra_scripts||[]).slice(0,8)){try{const url=new URL(item.src);if(url.protocol!=='https:')continue;const script=document.createElement('script');script.async=true;script.src=url.href;script.dataset.kindoraMarketing='true';document.head.append(script);}catch{}}
}

function deleteMarketingCookies() {
  document.cookie.split(';').forEach(cookie => {
    const name = cookie.trim().split('=')[0];
    if (!/^(_ga|_gid|_gat|_gcl|_fbp|_fbc)/.test(name)) return;
    const domains = [null, location.hostname, `.${location.hostname}`];
    const pieces = location.hostname.split('.');
    if (pieces.length > 2) domains.push(`.${pieces.slice(-2).join('.')}`);
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/;${domain ? ` domain=${domain};` : ''} SameSite=Lax; Secure`;
  });
}

export function initialiseConsent() {
  if(!document.getElementById('cookie-banner')){
    const language=document.documentElement.lang||'en',copy=dictionaries[language]||dictionaries.en;
    const banner=document.createElement('aside');banner.id='cookie-banner';banner.className='cookie-banner';banner.hidden=true;
    const title=document.createElement('strong');title.textContent=copy.cookieTitle;const p=document.createElement('p');p.textContent=copy.cookieDescription;const actions=document.createElement('div');actions.className='cookie-actions';
    for(const[key,label,style]of[['essential',copy.cookieReject,'button-outline'],['all',copy.cookieAccept,'']]){const button=document.createElement('button');button.type='button';button.dataset.consent=key;button.className=`button button-small ${style}`;button.textContent=label;actions.append(button);}
    banner.append(title,p,actions);document.body.append(banner);
  }
  if(!document.getElementById('cookie-settings')){const button=document.createElement('button');button.id='cookie-settings';button.type='button';button.textContent=(dictionaries[document.documentElement.lang]||dictionaries.en).cookiesSettings;document.querySelector('footer .footer-bottom>div')?.append(button);}
  const banner = document.getElementById('cookie-banner');
  const value = consent();
  if (banner) banner.hidden = !!value && Date.now() - value.at < 180 * 86400000;
  document.querySelectorAll('[data-consent]').forEach(button => button.addEventListener('click', () => {
    const marketing = button.dataset.consent === 'all';
    safeStorage.set('kindora-consent', JSON.stringify({ essential: true, marketing, at: Date.now(), version: 1 }));
    if (banner) banner.hidden = true;
    if (marketing) loadMarketing();
    else {
      window.gtag?.('consent', 'update', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      window.fbq?.('consent', 'revoke'); deleteMarketingCookies();
      if (loaded) location.reload();
    }
  }));
  document.getElementById('cookie-settings')?.addEventListener('click', () => { if (banner) banner.hidden = false; });
  loadMarketing();
  window.addEventListener('kindora-config',loadMarketing);
}

export function trackCheckout(value, frequency) {
  if (!marketingConsent()) return;
  window.gtag?.('event', 'begin_checkout', { currency: 'EUR', value, items: [{ item_id: 'shelter-care', item_name: `Donation ${frequency}` }] });
  window.fbq?.('track', 'InitiateCheckout', { currency: 'EUR', value });
}

export function trackConfirmedDonation(receipt,purchase=false) {
  if (!marketingConsent() || receipt.status !== 'paid' || !receipt.livemode) return;
  const key = `kindora-conversion-${receipt.reference}`;
  if (safeStorage.get(key)) return;
  const value = receipt.amount_cents / 100;
  window.gtag?.('event', 'purchase', { transaction_id: receipt.reference, currency: 'EUR', value, items: [{ item_id: 'shelter-care', item_name: 'Donation' }] });
  const settings=window.kindoraRuntime?.tracking_settings||{};
  const google=settings.google_tag_id||config.googleTagId,label=settings.google_ads_conversion_label||config.googleAdsConversionLabel;
  if(label&&google.startsWith('AW-'))window.gtag?.('event','conversion',{send_to:`${google}/${label}`,transaction_id:receipt.reference,currency:'EUR',value});
  window.fbq?.('track',purchase?'Purchase':'Donate', { currency: 'EUR', value }, { eventID: receipt.reference });
  safeStorage.set(key, '1');
}
