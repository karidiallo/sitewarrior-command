// Isolated regression test for Kanban transition and drag/drop wiring.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const handlers={};let saves=0,renders=0;
const task={id:'t-1',name:'Outreach follow-up',status:'Backlog',owner:'Kari',priority:'Normalny',done:false};
const db={tasks:[task],projects:[],leads:[],activity:[],xp:{Kari:0,Adi:0}};
const classList={add(){},remove(){}};
function col(stage){return {dataset:{stage},classList,closest(selector){return selector.includes('sw-board-col')?this:null}}}
const ticket={dataset:{taskId:'t-1'},classList,closest(selector){return selector.includes('sw-ticket')?this:null}};
const ctx={
 db,user:'Kari',view:'tasks',cloudActive:false,cloudConfigured:false,/* intentionally no crypto.randomUUID: insecure-preview regression */
 document:{addEventListener:(name,fn)=>{handlers[name]=fn},getElementById:()=>null,querySelectorAll:()=>[],body:{appendChild(){}}},
 window:{}, render:()=>{renders++},save:()=>{saves++;return Promise.resolve(true)},
 esc:s=>s,heading:()=>'',navigate:()=>{},notify:()=>{},activity:(type,text)=>db.activity.push({type,text}),
 prompt:()=> 'Adi', toggleTask:()=>{},console,Date,structuredClone,
};
ctx.window.swEdit=()=>{};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/workflow.js','utf8'),ctx);
// Mock flash - only commit triggers DOM creation; provide its necessary mini DOM.
const fakeToast={innerHTML:'',className:'',style:{},querySelector:()=>({textContent:''})};const fakeContent={innerHTML:''};
ctx.document.getElementById=id=>id==='swResultToast'?fakeToast:id==='content'?fakeContent:null;
ctx.document.createElement=()=>fakeToast;
ctx.document.querySelectorAll=()=>[];
let transfer={effectAllowed:'',setData(){},dropEffect:''};
handlers.dragstart({target:ticket,dataTransfer:transfer});
let prevented=false;
handlers.dragover({target:col('W trakcie'),dataTransfer:transfer,preventDefault(){prevented=true}});
handlers.drop({target:col('W trakcie'),preventDefault(){},stopPropagation(){}});
assert(prevented,'Drop target must allow dropping');
assert.strictEqual(task.status,'W trakcie');
assert.strictEqual(task.done,false);
assert.strictEqual(saves,1,'Exactly one save must occur for a valid move');
assert.strictEqual(db.activity.length,1);
assert.strictEqual(task.reviewNotes[0].from,'Backlog');
assert.strictEqual(task.reviewNotes[0].to,'W trakcie');
handlers.dragend();
ctx.window.swWorkflowStatus('t-1','Gotowe');
assert.strictEqual(task.done,true);
assert.strictEqual(db.xp.Kari,40);
ctx.window.swWorkflowStatus('t-1','Gotowe');
assert.strictEqual(db.xp.Kari,40,'Completing twice must not double-award XP');
assert.strictEqual(saves,2,'No duplicate save for an unchanged status');
console.log('PASS: drag/drop updates status; save once; history; completion XP idempotent');
