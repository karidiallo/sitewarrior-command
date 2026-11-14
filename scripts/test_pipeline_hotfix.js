// v12.1 regression: legacy status must not impersonate verified events;
// confirming a booking must advance the stage and unlock attendance.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const lead={id:'legacy',name:'Old studio',status:'Call umówiony',owner:'Kari',callAt:'2026-11-20T15:30',journey:{},currency:'EUR'};
const db={leads:[lead],leadActivities:[],tasks:[],projects:[],payments:[],expenses:[],activity:[],xp:{Kari:0,Adi:0}};
const fakeEl={innerHTML:'',remove(){},querySelector(){return null}};
const document={addEventListener(){},getElementById(){return fakeEl},querySelectorAll(){return []},createElement(){return {classList:{add(){},remove(){}},addEventListener(){},innerHTML:'',querySelector(){return null}}},body:{append(){}}};
const window={SWLite:{},swNew(){},swEdit(){},swOpenEntity(){}};
const ctx={db,window,document,user:'Kari',view:'sales',cloudConfigured:false,cloudActive:false,
 esc:String,activity:()=>{},save:()=>Promise.resolve(true),render:()=>{},navigate:()=>{},notify:()=>{},confirm:()=>true,
 crypto:require('crypto').webcrypto,console,Date,Map,Set,Intl,URL,Math,Number,String,Array,Promise,
 globalThis:{crypto:require('crypto').webcrypto}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/journey.js','utf8'),ctx);
const J=window.SWJourney;
assert.equal(J.leadStatus(lead),'Zainteresowany','A naked legacy label must not certify booking');
assert.equal(J.stepAllowed(lead,'call_attended'),false);
assert.equal(J.markLead(lead,'call_booked'),true);
assert.equal(J.leadStatus(lead),'Call umówiony');
assert.equal(J.stepAllowed(lead,'call_attended'),true);
assert.ok(lead.journey.call_booked);
assert.equal(J.markLead(lead,'call_attended'),true);
assert.equal(J.leadStatus(lead),'Call odbyty');
assert.equal(J.markLead(lead,'prototype_shown'),true);
const rewarded=db.xp.Kari;
delete lead.journey.call_attended;delete lead.journey.prototype_shown;
lead.status='Call umówiony';
assert.equal(J.markLead(lead,'call_attended'),true);
assert.equal(db.xp.Kari,rewarded,'Reconfirming after correction cannot grant XP twice');
console.log('PASS v12.1: legacy stage not fabricated; booking unlocks attendance; complete stages follow events; no duplicate XP');
