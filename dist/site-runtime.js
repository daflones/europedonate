import {config} from './config.js';
export let runtime=null;
export const locale=()=>document.documentElement.lang||'en';
export const translate=(value,language=locale())=>typeof value==='string'?value:value?.[language]||value?.en||'';
export function safeAsset(value){try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)&&(url.protocol==='https:'||url.origin===location.origin)?url.href:null;}catch{return null;}}
export function applyRuntime(s){
  runtime=s;window.kindoraRuntime=s;
  const root=document.documentElement;
  const vars={primary:'--green',background:'--cream',text:'--ink',accent:'--peach'};
  for(const[key,variable]of Object.entries(vars))if(/^#[a-f0-9]{6}$/i.test(s.visual_settings?.[key]||''))root.style.setProperty(variable,s.visual_settings[key]);
  if(s.visual_settings?.heading_font==='sans')document.querySelectorAll('h1,h2').forEach(el=>{el.style.fontFamily='inherit';});
  document.querySelectorAll('[data-i18n]').forEach(el=>{const value=s.content_overrides?.[locale()]?.[el.dataset.i18n];if(typeof value==='string')el.textContent=value;});
  document.querySelectorAll('[data-section]').forEach(el=>{el.hidden=s.section_settings?.[el.dataset.section]===false;});
  for(const key of ['hero','food','vet','care']){
    const media=s.media_settings?.[key];const url=safeAsset(typeof media==='string'?media:media?.url);
    if(!url)continue;
    document.querySelectorAll(`img[src="/assets/${key}.webp"],img[data-media="${key}"]`).forEach(img=>{img.src=url;img.dataset.media=key;if(media?.alt)img.alt=translate(media.alt);});
  }
  const logo=safeAsset(s.media_settings?.logo);
  if(logo)document.querySelectorAll('.brand img').forEach(img=>{img.src=logo;});
  if(s.brand)document.querySelectorAll('.brand>span').forEach(el=>{el.replaceChildren(document.createTextNode(s.brand));});
  if(s.tagline)document.querySelectorAll('[data-i18n="footerTagline"]').forEach(el=>{el.textContent=s.tagline;});
  if(s.canonical_url){const url=safeAsset(s.canonical_url);if(url){let tag=document.querySelector('link[rel="canonical"]');if(!tag){tag=document.createElement('link');tag.rel='canonical';document.head.append(tag);}tag.href=url;}}
  window.dispatchEvent(new CustomEvent('kindora-config',{detail:s}));
}
export async function loadRuntime(){const response=await fetch(`${config.apiBase}/config`,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Configuration unavailable');const s=await response.json();applyRuntime(s);return s;}
export async function navigation(){try{const response=await fetch(`${config.apiBase}/pages`);if(!response.ok)return;const{pages}=await response.json();for(const parent of document.querySelectorAll('[data-page-links],.desktop-nav,#mobile-nav')){parent.querySelectorAll('[data-custom-page]').forEach(el=>el.remove());for(const page of pages||[]){const a=document.createElement('a');a.href=`/page.html?slug=${encodeURIComponent(page.slug)}&lang=${locale()}`;a.textContent=translate(page.title);a.dataset.customPage='true';parent.append(a);}}}catch{}}
export function renderBlocks(parent,blocks,language=locale()){
  parent.replaceChildren();
  for(const block of Array.isArray(blocks)?blocks:[]){
    let el;
    if(block.type==='heading'){el=document.createElement('h2');el.textContent=translate(block.text,language);}
    else if(block.type==='image'){const url=safeAsset(block.url);if(!url)continue;el=document.createElement('img');el.src=url;el.alt=translate(block.alt,language);el.loading='lazy';el.style.borderRadius='15px';el.style.marginBlock='24px';}
    else if(block.type==='button'){const url=safeAsset(block.url);if(!url)continue;el=document.createElement('a');el.href=url;el.className='button';el.textContent=translate(block.text,language);}
    else{el=document.createElement('p');el.textContent=translate(block.text,language);el.style.whiteSpace='pre-line';}
    parent.append(el);
  }
}
