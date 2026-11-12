#!/usr/bin/env node
/* Szybki test przed wypchnięciem na produkcję: stary zapis danych musi się wczytać bez strat i bez błędów w konsoli.
   node tools/smoke.mjs   (wymaga Playwrighta i Chrome; dane w teście są zmyślone) */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import('playwright').catch(()=>import('/opt/npm-tools/node_modules/playwright/index.mjs'));
const TYPES={'.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=createServer(async(q,r)=>{try{const f=join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html'));if(!f.startsWith(ROOT))throw 0;r.writeHead(200,{'content-type':TYPES[extname(f)]||'text/plain'});r.end(await readFile(f))}catch(e){r.writeHead(404);r.end()}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL=`http://localhost:${srv.address().port}/`;
/* zapis w formacie sprzed karty i synchronizacji */
const OLD={v:2,updatedAt:1700000000000,createdYM:'2026-01',settings:{theme:'light',phase:1,incomes:[{id:'a',name:'Pensja',amount:5000,day:10,from:''}],surplusSources:['Inne'],monthCost:4000,avgSurplus:500,simRoll:true,simFuture:false,lastExport:null,lastCat:'zycie'},
  debts:[{id:'d1',name:'Karta',sub:'',balance:1000,original:2000,rate:10,payment:200,fees:0,day:5,end:'',phase:1,mode:'lawina',mortgage:false,confirm:[],note:''}],
  categories:[{id:'zycie',name:'Życie'},{id:'dom',name:'Dom'}],
  items:[{id:'i1',cat:'zycie',name:'Jedzenie',amount:1500,type:'var',day:null,note:''},{id:'i2',cat:'dom',name:'Czynsz',amount:900,type:'fix',day:10,note:''},{id:'i3',cat:'dom',name:'Woda',amount:50,type:'res',day:null,note:'',period:12,bill:600,nextDue:'2027-01',startBalance:0,startYM:'2026-01'}],
  expenses:[{id:'e1',ts:1,date:'2026-01-05',amount:12.5,cat:'zycie',note:'test'}],months:{'2026-01':{extras:[{id:'x1',amount:100,src:'Inne',date:'2026-01-03',note:''}],fixed:{},paid:{},inc:{}}},
  debtEvents:[],goalEvents:[],reservePays:[],history:{},goals:{cushion:{cash:100,account:200},jar:{name:'Cel',target:1000,balance:10,monthly:50,day:null},assets:[{id:'as1',name:'Złoto',qty:1,unit:'g',value:null}]}};
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{channel:'chrome'}).catch(()=>chromium.launch());
const page=await b.newPage({viewport:{width:390,height:844}});const errs=[];let fail=0;
page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const ok=(c,m)=>{if(!c)fail++;console.log((c?'ok    ':'BŁĄD  ')+m)},S=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('finanse-domowe-v1')));
await page.goto(URL);await page.evaluate(d=>localStorage.setItem('finanse-domowe-v1',d),JSON.stringify(OLD));await page.reload();
let s=await S();
ok(s.debts.length===1&&s.items.length===3&&s.expenses.length===1&&s.months['2026-01'].extras.length===1&&s.goals.assets.length===1,'stary zapis wczytany bez strat');
ok(s.updatedAt===OLD.updatedAt,'samo otwarcie nie zmienia znacznika danych');
ok(s.card&&s.card.on===false&&Array.isArray(s.cardPays)&&s.sync&&s.sync.last==='','nowe pola dodane z wartościami domyślnymi');
for(const t of['budzet','dlugi','cele','ustawienia','start']){await page.click(`nav [data-tab=${t}]`);await page.waitForTimeout(60)}
await page.click('nav [data-tab=ustawienia]');await page.click('[data-act=setCard]');await page.check('#f_on');await page.fill('#f_target','3000');await page.fill('#f_due','14');await page.click('#sheet button[type=submit]');
await page.click('nav [data-tab=start]');await page.fill('#qAmt','20');await page.click('.chip[data-cat=zycie]');
s=await S();ok(s.card.on&&s.expenses.length===2&&s.expenses[1].card===true,'tryb karty: wydatek oznaczony „kartą”');
ok((await page.innerText('#view')).includes('Do odłożenia na spłatę'),'widget karty widoczny na Starcie');
for(const t of['budzet','dlugi','cele','ustawienia','start']){await page.click(`nav [data-tab=${t}]`);await page.waitForTimeout(60)}
await page.evaluate(()=>localStorage.clear());await page.reload();
ok(/pierwsze kroki/i.test(await page.innerText('#view')),'pusta aplikacja startuje');
ok(!errs.length,'konsola bez błędów'+(errs.length?': '+errs.join(' | '):''));
await b.close();srv.close();process.exit(fail?1:0);
