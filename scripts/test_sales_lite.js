// Regression tests for SiteWarrior v10 — sales only for interested leads.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const makeLead=(id,status,createdAt='2026-11-11T10:00:00Z',owner='Kari')=>({id,name:id,status,owner,createdAt});
const data={leads:[makeLead('cold','Nowy'),makeLead('replied','Odpowiedź'),makeLead('offer','Oferta wysłana'),makeLead('blocked','Nie kontaktować'),makeLead('new','Zainteresowany')],
 leadActivities:[
  {id:'first-old',type:'first_contact',at:'2026-11-09T11:00:00',companyName:'UNLINKED'},
  {id:'b1',type:'outreach_batch',region:'Europa',channel:'Instagram',count:40,occurredOn:'2026-11-12',at:'2026-11-12T12:00:00',owner:'Kari'},
  {id:'b2',type:'outreach_batch',region:'APAC',channel:'WhatsApp',count:20,occurredOn:'2026-11-13',at:'2026-11-13T12:00:00',owner:'Adi'},
  {id:'b3',type:'outreach_batch',region:'Afryka',channel:'WhatsApp',count:15,occurredOn:'2026-11-13',at:'2026-11-13T13:00:00',owner:'Kari'},
 ],payments:[{id:'p1',status:'Otrzymana',amount:600,currency:'EUR',paidAt:'2026-11-12'}],activity:[],xp:{Kari:0,Adi:0},expenses:[]};
let saved=0,rendered=0,notifications=[];
const content={innerHTML:''};
const doc={addEventListener(){},getElementById(id){return id==='content'?content:null},querySelectorAll(){return[]},createElement(){return {className:'',style:{},id:'',innerHTML:'',addEventListener(){}}},body:{append(){}}};
const ctx={
 db:data,user:'Kari',view:'dashboard',cloudConfigured:false,cloudActive:false,
 document:doc,window:{swNew:()=>{},swEdit:()=>{},swOpenEntity:()=>{}},
 render:()=>{rendered++},navigate:()=>{},activity:(t,x)=>data.activity.push({t,x}),
 save:()=>{saved++;return Promise.resolve()},notify:x=>notifications.push(x),esc:x=>String(x),
 crypto:require('crypto').webcrypto,console,Date,Map,Set,Intl,URL,Math,Number,String,Array,Promise,
};
vm.createContext(ctx);
const read=p=>fs.readFileSync(__dirname+'/../assets/js/'+p,'utf8');
vm.runInContext(read('lite.js'),ctx);
vm.runInContext(read('growth.js'),ctx);
const lite=ctx.window.SWLite,growth=ctx.window.SWGrowth;
assert.equal(lite.stageOf(data.leads[0]),'Przed kwalifikacją');
assert.equal(lite.stageOf(data.leads[1]),'Zainteresowany');
assert.equal(lite.stageOf(data.leads[2]),'Oferta');
assert.equal(lite.qualified(data.leads[0]),false);
assert.equal(lite.qualified(data.leads[1]),true);
assert.equal(lite.qualified(data.leads[3]),false,'Do-not-contact is not a qualified lead');
assert.ok(lite.queue(data,'2026-11-13').every(x=>x.lead.id!=='cold'&&x.lead.id!=='blocked'));
assert.equal(lite.unlinked().length,1,'Old standalone activities remain; batch events excluded from link migration');
const weekly=growth.summary(data,'week',new Date('2026-11-13T12:00:00'));
assert.equal(weekly.outreach,75);
assert.equal(weekly.byRegion.Europa,40);
assert.equal(weekly.byRegion.APAC,20);
assert.equal(weekly.byRegion.Afryka,15);
assert.equal(weekly.byChannel.WhatsApp,35);
assert.equal(weekly.leads.length,3);
assert.equal(weekly.received.length,1);
assert.equal(weekly.received[0].amount,600);
const n0=data.leads.length;
const present=new Date();const day=[present.getFullYear(),String(present.getMonth()+1).padStart(2,'0'),String(present.getDate()).padStart(2,'0')].join('-');
const first=growth.createBatch({count:70,region:'Europa',channel:'Instagram',occurredOn:day,country:'Polska'},present);
assert.ok(first);
assert.equal(first.xpAwarded,70);
const second=growth.createBatch({count:80,region:'APAC',channel:'WhatsApp',occurredOn:day,country:''},present);
assert.equal(second.xpAwarded,30,'XP capped at 100/day for operator');
assert.equal(data.xp.Kari,100);
assert.equal(data.leads.length,n0,'Logging outbound volume does NOT create a CRM lead');
assert.equal(growth.createBatch({count:-1,region:'Europa',channel:'Instagram',occurredOn:day},present),false);
assert.equal(growth.createBatch({count:2,region:'Atlantyda',channel:'Instagram',occurredOn:day},present),false);
assert.equal(growth.createBatch({count:3,region:'Europa',channel:'Instagram',occurredOn:'2025-11-13'},present).xpAwarded,0,'Backfill does not grant XP');
assert.equal(growth.updateBatch(first.id,{count:55,region:'Afryka',channel:'Email',occurredOn:day,country:'RPA'}),true);
assert.equal(data.xp.Kari,100,'Corrections do not mint new XP');
assert.equal(lite.writeEvent('new','prototype'),true);
assert.equal(data.leads.find(l=>l.id==='new').status,'Zainteresowany','Prototype is an activity, not a new stage');
assert.equal(lite.writeEvent('new','call'),true);
assert.equal(data.leads.find(l=>l.id==='new').status,'Discovery');
assert.equal(data.xp.Kari,140,'First discovery gives XP');
assert.equal(lite.writeEvent('new','call'),true);
assert.equal(data.xp.Kari,140,'Repeat discovery does not award more XP');
assert.equal(lite.writeEvent('new','proposal'),true);
assert.equal(data.leads.find(l=>l.id==='new').status,'Oferta');
assert.equal(data.xp.Kari,200);
lite.quickStage('new','Finalizacja');
lite.quickStage('new','Wygrany');
assert.equal(data.xp.Kari,350);
lite.quickStage('new','Oferta');lite.quickStage('new','Wygrany');
assert.equal(data.xp.Kari,350,'Cannot repeatedly gain XP by moving won lead stages');
assert.equal(lite.writeEvent('missing','proposal'),false);
assert.ok(saved>=11);
const parsed=lite.parseCsv('\uFEFFfirma;link;notatka\n"Studio, Yoga";https://example.com;"Note; quoted"\n');
assert.equal(parsed[0].firma,'Studio, Yoga');
console.log('PASS: qualified-only CRM, legacy safety, outreach batches by region/channel, no duplicate leads, XP, cash separation, stage idempotence, CSV');
