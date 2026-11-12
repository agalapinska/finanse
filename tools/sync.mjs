#!/usr/bin/env node
/* Kanał „Claude → aplikacja”: szyfruje paczki zmian dla sparowanych urządzeń.

   node tools/sync.mjs device <kod> [nazwa]   dodaje urządzenie (kod z aplikacji: Ustawienia → Zmiany od Claude)
   node tools/sync.mjs push <plik.json>       szyfruje paczkę {"note": "...", "ops": [...]} i dopisuje ją do sync/
   node tools/sync.mjs list                   pokazuje urządzenia i liczbę paczek

   Plik z paczką zawiera jawne dane finansowe — musi leżeć POZA repozytorium (narzędzie odmawia innego).
   Do repozytorium trafia wyłącznie szyfrogram: AES-256-GCM, klucz owinięty RSA-OAEP kluczem każdego urządzenia. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {webcrypto as wc} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),DIR=join(ROOT,'sync'),IDX=join(DIR,'index.json');
const b64=b=>Buffer.from(b).toString('base64'),die=m=>{console.error('Błąd: '+m);process.exit(1)};
const load=()=>existsSync(IDX)?JSON.parse(readFileSync(IDX,'utf8')):{v:1,devices:{},updates:[]};
const store=ix=>writeFileSync(IDX,JSON.stringify(ix,null,2)+'\n');
const OPS=['set','upsert','remove','debtEvent','goalEvent'];
const [cmd,arg,name]=process.argv.slice(2);

if(cmd==='device'){
  const m=/^finanse-klucz:([a-z0-9]{4,16}):([A-Za-z0-9+/=]+)$/.exec((arg||'').trim());
  if(!m)die('kod powinien wyglądać tak: finanse-klucz:<id>:<klucz>');
  await wc.subtle.importKey('spki',Buffer.from(m[2],'base64'),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']).catch(()=>die('klucz nie jest poprawnym kluczem RSA'));
  const ix=load();ix.devices[m[1]]={name:name||'urządzenie',pub:m[2],added:new Date().toISOString().slice(0,10)};store(ix);
  console.log(`Dodano urządzenie ${m[1]}. Sparowanych: ${Object.keys(ix.devices).length}.`);
}else if(cmd==='push'){
  if(!arg)die('podaj plik z paczką');
  const file=resolve(arg);
  if(file===ROOT||file.startsWith(ROOT+sep))die('plik z jawnymi danymi musi leżeć poza repozytorium');
  const body=JSON.parse(readFileSync(file,'utf8'));
  if(!Array.isArray(body.ops)||!body.ops.length)die('paczka potrzebuje niepustej listy "ops"');
  for(const o of body.ops)if(!OPS.includes(o.op))die('nieznana operacja: '+o.op);
  const ix=load(),devs=Object.entries(ix.devices);
  if(!devs.length)die('brak sparowanych urządzeń — najpierw: device <kod>');
  const key=await wc.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),raw=await wc.subtle.exportKey('raw',key);
  const iv=wc.getRandomValues(new Uint8Array(12));
  const ct=await wc.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(body)));
  const keys={};
  for(const [id,d] of devs){
    const pub=await wc.subtle.importKey('spki',Buffer.from(d.pub,'base64'),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
    keys[id]=b64(await wc.subtle.encrypt({name:'RSA-OAEP'},pub,raw));
  }
  const id=String(Math.max(0,...ix.updates.map(Number))+1).padStart(6,'0');
  writeFileSync(join(DIR,id+'.json'),JSON.stringify({v:1,id,ts:new Date().toISOString(),iv:b64(iv),ct:b64(ct),keys})+'\n');
  ix.updates.push(id);store(ix);
  console.log(`Paczka ${id}: ${body.ops.length} operacji dla ${devs.length} urządzeń. Teraz commit i push katalogu sync/.`);
}else if(cmd==='list'){
  const ix=load();
  for(const [id,d] of Object.entries(ix.devices))console.log(`${id}  ${d.name}  (od ${d.added})`);
  console.log(`Paczek: ${ix.updates.length}${ix.updates.length?', ostatnia '+ix.updates.at(-1):''}`);
}else die('użycie: device <kod> [nazwa] | push <plik.json> | list');
