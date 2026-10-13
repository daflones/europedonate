import {readFile,readdir,stat,access} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {dictionaries} from '../dist/copy.js';
const root=fileURLToPath(new URL('..',import.meta.url));
let count=0;
async function walk(directory){for(const item of await readdir(directory)){const path=resolve(directory,item);const info=await stat(path);if(info.isDirectory())await walk(path);else{
  if(['.js','.mjs','.ts'].includes(extname(path))){const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);count++;}
  if(['.js','.mjs','.html','.sql','.md','.toml','.json','.example'].includes(extname(path))){const text=await readFile(path,'utf8');if(/sb_secret_[A-Za-z0-9]|sbp_[a-f0-9]{20}|sk_live_[A-Za-z0-9]{12}|whsec_[A-Za-z0-9]{20}|"role"\s*:\s*"service_role"/.test(text))throw new Error('Private credential found in '+path);}
}}}
await walk(resolve(root,'dist'));await walk(resolve(root,'supabase'));await walk(resolve(root,'scripts'));await walk(resolve(root,'docs'));
for(const filename of ['index.html','privacy.html','terms.html','thank-you.html','admin.html'])await access(resolve(root,'dist',filename));
const html=await readFile(resolve(root,'dist/index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)){if(match[1]==='/'||match[1].startsWith('/#'))continue;await access(resolve(root,'dist',match[1].slice(1)));}
for(const language of ['en','de','fr','es','pt'])for(const match of html.matchAll(/data-i18n="([^"]+)"/g))if(!dictionaries[language]?.[match[1]])throw new Error('Missing translation '+language+':'+match[1]);
console.log(`Syntax checked: ${count} modules. Links, local assets, translations and credential scan passed.`);
