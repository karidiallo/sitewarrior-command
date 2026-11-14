// v13 regression: multi-region sessions, verified vs unknown views, A/B, time, CSV, legacy safety.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const old={id:'old',type:'outreach_batch',count:6,region:'APAC',channel:'WhatsApp',occurredOn:'2026-11-12',owner:'Adi',at:'2026-11-12T12:00:00'};
const db={leadActivities:[old],leads:[],tasks:[],projects:[],payments:[],expenses:[],activity:[],xp:{Kari:0,Adi:0}};
const doc={addEventListener(){},getElementById(){return {innerHTML:''}},querySelectorAll(){return[]}};
const notifications=[];let saves=0;
const ctx={db,window:{SWLite:{qualified:()=>true,stageOf:()=>''}},document:doc,user:'Kari',view:'outreach',
 cloudConfigured:false,cloudActive:false,activity:()=>{},save:()=>{saves++;return Promise.resolve(true)},render:()=>{},
 notify:m=>notifications.push(m),esc:String,crypto:require('crypto').webcrypto,console,Date,Map,Set,Intl,URL,Math,Number,String,Array,Promise,globalThis:{crypto:require('crypto').webcrypto}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/growth.js','utf8'),ctx);
const G=ctx.window.SWGrowth;
const d=new Date();const today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const batch=G.createBatch({occurredOn:today,startedAt:'20:15',endedAt:'21:10',timeZone:'Europe/Warsaw',campaign:'Trainer experiment',
 segments:[
  {count:3,region:'North America',country:'USA',channel:'WhatsApp',variant:'A',viewed:1,notViewed:0},
  {count:2,region:'Asia',country:'India',channel:'Instagram',variant:'B',viewed:0,notViewed:1},
  {count:5,region:'Europa',country:'Polska',channel:'WhatsApp',variant:'A',viewed:2,notViewed:1}
 ]},d);
assert.ok(batch);assert.equal(batch.count,10);assert.equal(batch.segments.length,3);
assert.equal(batch.startedAt,'20:15');assert.equal(batch.timeZone,'Europe/Warsaw');
assert.equal(db.leads.length,0,'Recording outreach must never create CRM leads');
assert.equal(batch.xpAwarded,10);
const s=G.summary(db,'all',d);
assert.equal(s.outreach,16);assert.equal(s.byRegion.Asia,8,'legacy APAC + new Asia');
assert.equal(s.byRegion['North America'],3);assert.equal(s.byRegion.Europa,5);
assert.equal(s.byChannel.WhatsApp,14);assert.equal(s.byChannel.Instagram,2);
assert.equal(s.viewed,3);assert.equal(s.notViewed,2);assert.equal(s.unknown,11,'legacy unknown + new unknown');
assert.equal(s.byVariant.A.count,8);assert.equal(s.byVariant.B.count,2);
assert.equal(s.byVariant['Bez oznaczenia'].count,6,'old batch must not be falsely labelled as A/B');
assert.equal(s.byHour['20:00'].count,10,'legacy fake noon must not be used for hour analytics');
const beforeXp=db.xp.Kari;
assert.equal(G.updateBatch(batch.id,{occurredOn:today,startedAt:'20:15',endedAt:'21:10',timeZone:'Europe/Warsaw',segments:[
 {count:3,region:'North America',channel:'WhatsApp',variant:'A',viewed:2,notViewed:0},
 {count:2,region:'Asia',channel:'Instagram',variant:'B',viewed:1,notViewed:1},
 {count:5,region:'Europa',channel:'WhatsApp',variant:'A',viewed:3,notViewed:1}]}),true);
assert.equal(G.summary(db,'all',d).viewed,6);assert.equal(db.xp.Kari,beforeXp,'edit does not mint XP');
assert.equal(G.updateBatch(batch.id,{occurredOn:today,segments:[{count:2,region:'Asia',channel:'WhatsApp',variant:'A',viewed:2,notViewed:1}]}),false,'invalid totals rejected');
assert.equal(G.updateBatch(batch.id,{occurredOn:today,segments:[{count:2,region:'Atlantis',channel:'WhatsApp',variant:'A',viewed:0,notViewed:0}]}),false);
const csv=G.outreachCsv(db,'all');assert.ok(csv.startsWith('\uFEFF'));
for(const value of ['start_time','time_zone','region','country','channel','variant','confirmed_not_viewed','unknown','campaign'])assert.ok(csv.includes(value),value);
assert.ok(csv.includes('North America'));assert.ok(csv.includes('20:15'));assert.ok(csv.includes('Europe/Warsaw'));
assert.equal(csv.split('\r\n').length,5,'header plus 3 new segments plus one legacy');
assert.ok(saves>=2);assert.ok(notifications.length>=2);
console.log('PASS v13: multi-region total 10; legacy safe; view/unknown tracking; A/B; hourly; CSV; XP; no phantom leads');
