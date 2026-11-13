// Offline isolated regression tests for the new business logic and compatibility layer.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const d=(name,status,owner='Kari')=>({id:name,name,status,owner,createdAt:'2026-11-02T00:00:00Z'});
const data={leads:[d('a','Nowy'),d('b','Odpowiedź','Adi'),d('c','Oferta wysłana'),d('d','Nie kontaktować')],leadActivities:[
 {id:'e1',leadId:'a',type:'first_contact',at:'2026-11-09T11:00:00Z'},
 {id:'e2',leadId:'a',type:'reply',at:'2026-11-10T11:00:00Z'},
 {id:'e3',leadId:'a',type:'reply',at:'2026-11-11T11:00:00Z'},
 {id:'e4',leadId:'b',type:'first_contact',at:'2026-11-10T11:00:00Z'},
 {id:'e5',leadId:'c',type:'proposal',at:'2026-11-12T12:00:00Z'},
 {id:'e6',companyName:'UNLINKED',type:'reply',at:'2026-11-12T13:00:00Z'},
],payments:[{id:'p1',leadId:'c',status:'Otrzymana',paidAt:'2026-11-12',amount:600,currency:'EUR'}],activity:[]};
let saved=0,rendered=0;
const ctx={
 db:data,user:'Kari',view:'dashboard',cloudConfigured:false,cloudActive:false,
 document:{addEventListener(){},getElementById(id){return id==='content'?{innerHTML:''}:null},querySelectorAll(){return[]},createElement(){return {className:'',style:{},id:'',innerHTML:'',addEventListener(){}}},body:{append(){}}},
 window:{swNew:()=>{},swEdit:()=>{},swOpenEntity:()=>{}},
 render:()=>{rendered++},navigate:()=>{},activity:(t,x)=>data.activity.push({t,x}),
 save:()=>{saved++;return Promise.resolve()},notify:()=>{},esc:s=>String(s),
 crypto:require('crypto').webcrypto,console,Date,Map,Set,Intl,URL,Math,Number,String,Array,Promise,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/lite.js','utf8'),ctx);
const lite=ctx.window.SWLite;
assert.equal(lite.stageOf(data.leads[0]),'Do kontaktu');
assert.equal(lite.stageOf(data.leads[1]),'Zainteresowany');
assert.equal(lite.stageOf(data.leads[2]),'Finalizacja');
assert.equal(lite.stageOf(data.leads[3]),'Zamknięty');
const p=lite.pulse(data,new Date('2026-11-13T12:00:00Z'));
assert.equal(p.first,2);
assert.equal(p.replies,1,'Count unique lead replies, not messages or unlinked entries');
assert.equal(p.offers,1);
assert.equal(p.paidLabel,'600 EUR');
assert.equal(lite.unlinked().length,1,'Unlinked historic activities remain visible for review');
assert.equal(lite.queue(data,'2026-11-13').some(x=>x.lead.id==='d'),false,'Terminal leads never appear in queue');
assert.equal(lite.writeEvent('a','first_contact'),false,'Reject a duplicate first contact');
assert.equal(lite.writeEvent('a','followup'),true);
assert.equal(lite.writeEvent('b','prototype'),true);
assert.equal(data.leads[1].status,'Odpowiedź','Prototype is an event, not a forced sales stage');
assert.equal(lite.writeEvent('a','proposal',{occurredOn:'2026-11-05'}),true);
assert.equal(data.leads[0].status,'Finalizacja');
const a=data.leadActivities.at(-1);
assert.equal(a.at.slice(0,10),'2026-11-05','Historical occurrence must not masquerade as import time');
assert.ok(a.createdAt.startsWith(new Date().toISOString().slice(0,10)),'Creation timestamp is separate');
assert.equal(lite.writeEvent('x','reply'),false);
assert.equal(saved,3);
lite.quickStage('b','Discovery');
assert.equal(data.leads[1].status,'Discovery');
assert.equal(data.leadActivities.at(-1).type,'stage_change','Manual stage change must not fake a reply');
const parsed=lite.parseCsv('\uFEFFfirma;link;notatka\n"Studio, Yoga";https://example.com;"Note; second field"\n');
assert.equal(parsed[0].firma,'Studio, Yoga');
assert.equal(parsed[0].notatka,'Note; second field');
console.log('PASS: legacy aliases, unique KPIs, historical dates, events, stage changes, CSV, unlinked outreach');
