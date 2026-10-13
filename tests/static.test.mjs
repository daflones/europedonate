import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHandler} from '../scripts/serve.mjs';
import {dictionaries,messages} from '../dist/copy.js';

test('all visible page strings and error messages have five complete translations',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const keys=[...html.matchAll(/data-i18n="([^"]+)"/g)].map(x=>x[1]);
  for(const language of ['en','de','fr','es','pt']){
    for(const key of keys)assert.ok(dictionaries[language][key],`${language}: ${key}`);
    for(const key of Object.keys(messages.en))assert.ok(messages[language][key],`${language}: ${key}`);
  }
});
test('page links, assets and radio selections have valid targets',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(match[1]),match[1]);
  for(const asset of ['hero','food','vet','care'])await access(new URL(`../dist/assets/${asset}.webp`,import.meta.url));
  assert.equal((html.match(/aria-checked="true"/g)||[]).length,2);
  assert.ok(html.includes('viewport-fit=cover'));assert.ok(html.includes('id="mobile-donate-bar"'));assert.ok(html.includes('id="cookie-banner"'));assert.ok(html.includes('role="alert"'));
});
test('static serving returns proper routes, content types and refuses private files',async()=>{
  const handler=createHandler(fileURLToPath(new URL('../dist/',import.meta.url)));
  async function serve(url,method='GET'){
    const result={};await handler({url,method},{writeHead(status,headers){result.status=status;result.headers=headers;},end(body){result.body=body;}});return result;
  }
  assert.equal((await serve('/')).status,200);assert.equal((await serve('/admin')).status,200);assert.equal((await serve('/healthz')).status,200);
  assert.equal((await serve('/.env')).status,404);assert.equal((await serve('/%2e%2e/%2e%2e/etc/passwd')).status,404);assert.equal((await serve('/missing')).status,404);assert.equal((await serve('/','POST')).status,405);
  const css=await serve('/styles.css','HEAD');assert.equal(css.status,200);assert.equal(css.body,undefined);assert.equal(css.headers['X-Content-Type-Options'],'nosniff');assert.ok(css.headers['Content-Type'].startsWith('text/css'));
});
