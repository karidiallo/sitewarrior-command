// Simulation of the actual cloud persistence module, including a Supabase RPC CAS response.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const data={tasks:[{id:'task-1',name:'Test',status:'Backlog',owner:'Kari'}]};
const database=new Map([['tasks/task-1',{collection:'tasks',record_id:'task-1',payload:{...data.tasks[0]},revision:1,deleted:false}]]);
const local=new Map();let calls=0, fail=false;const statusEvents=[];
const rpc=async(name,args)=>{
 assert.strictEqual(name,'sw_apply_changes');calls++;
 if(fail)return {data:null,error:{message:'Simulated Supabase timeout'}};
 const replies=[];
 for(const x of args.p_changes){const key=x.collection+'/'+x.id,old=database.get(key);if((old?.revision||0)!==x.expected)return {data:null,error:{message:'Version conflict'}};const revision=x.expected+1;database.set(key,{collection:x.collection,record_id:x.id,payload:structuredClone(x.payload),revision,deleted:x.deleted});replies.push({collection:x.collection,id:x.id,revision})}
 return {data:replies,error:null}
};
const auth={getUser:async()=>({data:{user:{id:'user-kari'}},error:null})};
const query={filters:{},select(){this.filters={};return this},order(){return this},eq(key,value){this.filters[key]=value;return this},range:async()=>({data:[...database.values()].map(x=>structuredClone(x)),error:null}),maybeSingle:async function(){const match=[...database.values()].find(x=>Object.entries(this.filters).every(([k,v])=>x[k]===v));return {data:match?structuredClone(match):null,error:null}}};
const nodes={};const body={append(el){nodes[el.id]=el},appendChild(el){nodes[el.id]=el}};
const doc={body,getElementById(id){return nodes[id]||null},createElement(){return {id:'',style:{},dataset:{},addEventListener(){},setAttribute(){},remove(){},querySelector(){return {textContent:''}}}}};
const window={addEventListener(){}};
const ctx={window,document:doc,console,setInterval:()=>1,setTimeout:()=>1,queueMicrotask,structuredClone,Date,JSON,Map,Promise,Blob,URL,db:{...data},client:{auth,from:()=>query,rpc,channel:()=>({on(){return this},subscribe(){return this}})},cloudActive:true,cloudConfigured:true,cloudReady:true,OFFER_DEFAULTS:[],REFERENCE_PRICES:{},KEY:'test',user:'Kari',loadCloud:async()=>{},save:()=>{},logout:async()=>{},render:()=>{},notify:()=>{},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},location:{reload(){}},confirm:()=>false};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/cloud.js','utf8'),ctx);
(async()=>{
 await ctx.loadCloud();
 ctx.db.tasks[0].status='W trakcie';
 await ctx.save();
 assert.equal(database.get('tasks/task-1').payload.status,'W trakcie');
 assert.equal(nodes.cloudStatus.dataset.status,'saved');
 // A second save must remain distinct from an earlier revision.
 ctx.db.tasks[0].status='Do zrobienia';
 await ctx.save();
 assert.equal(database.get('tasks/task-1').payload.status,'Do zrobienia');
 fail=true;
 ctx.db.tasks[0].status='Gotowe';
 await assert.rejects(ctx.save(),/Simulated Supabase timeout/);
 assert.equal(nodes.cloudStatus.dataset.status,'error');
 assert.equal(database.get('tasks/task-1').payload.status,'Do zrobienia','Failed save must not be falsely acknowledged');
 assert.ok([...local.keys()].some(k=>k.includes('recovery')),'Recovery snapshot required');
 console.log('PASS: confirmed cloud save, repeat status, rejected failure, recovery snapshot');
})().catch(e=>{console.error(e);process.exitCode=1});
