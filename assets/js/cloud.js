/* SiteWarrior cloud persistence v6 — per-record CAS, recoverable conflicts and explicit write acknowledgements. */
(function () {
'use strict';
const collections=['leads','leadActivities','tasks','projects','marketing','payments','expenses','subscriptions','events','journal','decisions','quotes','offers','activity','deleted','weeklyReviews'];
const meta=['xp','marketNotes','prices','goals','settings'];
const sep='\u001f';
let baseline=new Map(), versions=new Map(), changed=false, saving=false, blocked=false, refreshTimer=null;
let accountId=null, lastError='';
let saveGeneration=0;
let saveWaiters=[];
function settleSaves(error){const batch=saveWaiters.splice(0);for(const w of batch){if(error)w.reject(error);else w.resolve(true)}}
let realtimeChannel=null;
const key=(collection,id)=>collection+sep+id;
const copy=o=>structuredClone(o);
const identity=(x,i)=>String(x.id||('legacy-'+i+'-'+String(x.at||x.date||x.name||'').replace(/[^a-zA-Z0-9]/g,'')));
const localKey=()=>`sitewarrior_recovery_v6_${accountId||'unverified'}`;
function indexState(data){let out=new Map();for(const col of collections){(Array.isArray(data[col])?data[col]:[]).forEach((v,i)=>{if(!v||typeof v!=='object')return;let id=identity(v,i);out.set(key(col,id),{collection:col,id,payload:copy({...v,id})})})}for(const id of meta)out.set(key('__meta',id),{collection:'__meta',id,payload:{value:copy(data[id]??{})}});return out}
function stateFromRows(rows){let state={};for(const col of collections)state[col]=[];for(const row of rows){let k=key(row.collection,row.record_id);versions.set(k,row.revision);if(row.deleted)continue;baseline.set(k,JSON.stringify(row.payload));if(row.collection==='__meta')state[row.record_id]=row.payload.value;else if(Array.isArray(state[row.collection]))state[row.collection].push(row.payload)}return state}
function defaults(){return {tasks:[],leads:[],projects:[],marketing:[],payments:[],expenses:[],subscriptions:[],journal:[],events:[],decisions:[],quotes:[],leadActivities:[],activity:[],deleted:[],weeklyReviews:[],xp:{Kari:0,Adi:0},marketNotes:{},prices:{},goals:{},settings:{},offers:OFFER_DEFAULTS.map(x=>({...x}))}}
function status(message,type='pending'){let el=document.getElementById('cloudStatus');if(!el){el=document.createElement('button');el.id='cloudStatus';el.type='button';el.className='cloud-status';el.style.zIndex='98';el.setAttribute('aria-live','polite');el.addEventListener('click',()=>{if(blocked)showConflict();else if(changed)void flush()});document.body.append(el)}el.dataset.status=type;el.textContent=message;el.title=type==='error'?'Kliknij, by zobaczyć opcje odzyskania':'Status synchronizacji z Supabase'}
function recovery(){if(!cloudActive||!accountId)return;try{localStorage.setItem(localKey(),JSON.stringify({at:new Date().toISOString(),user:accountId,db:copy(db)}))}catch(e){status('BŁĄD KOPII LOKALNEJ','error')}}
function clearRecovery(){if(accountId)try{localStorage.removeItem(localKey())}catch{}}
function downloadRecovery(){const data=localStorage.getItem(localKey())||JSON.stringify({at:new Date().toISOString(),db});const blob=new Blob([data],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sitewarrior-recovery-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
function showConflict(){let old=document.getElementById('swRecoveryDialog');if(old)old.remove();const el=document.createElement('div');el.id='swRecoveryDialog';el.className='modalwrap';el.style.display='flex';el.style.zIndex='120';el.innerHTML=`<div class="modal" style="max-width:580px;width:100%"><h2 style="margin-top:0">SYNCHRONIZACJA WSTRZYMANA</h2><p>Zmiany nie zostały potwierdzone w bazie. Mogło dojść do konfliktu z drugą osobą lub błędu połączenia. Lokalna kopia została zachowana.</p><p class="muted" id="swRecoveryReason" style="word-break:break-word"></p><div class="command-actions"><button class="btn" id="swRetrySave">SPRÓBUJ PONOWNIE</button><button class="btn secondary" id="swDownloadChanges">POBIERZ KOPIĘ</button><button class="btn secondary" id="swLoadServer">ODRZUĆ LOKALNE ZMIANY I WCZYTAJ CHMURĘ</button></div><p class="muted" style="font-size:12px">Nie wybieraj „odrzuć”, jeśli nie pobrałaś wcześniej kopii zmian, które chcesz zachować.</p><button class="switch" id="swCloseRecovery">Zamknij okno</button></div>`;document.body.append(el);el.querySelector('#swRecoveryReason').textContent=lastError||'Wystąpił nieznany błąd.';el.querySelector('#swDownloadChanges').onclick=downloadRecovery;el.querySelector('#swCloseRecovery').onclick=()=>el.remove();el.querySelector('#swRetrySave').onclick=async()=>{el.remove();blocked=false;changed=true;await flush()};el.querySelector('#swLoadServer').onclick=async()=>{if(!confirm('Utracisz wszystkie NIEZAPISANE zmiany w tej przeglądarce. Czy na pewno?'))return;downloadRecovery();blocked=false;changed=false;el.remove();await refreshRemote(true);if(!blocked){clearRecovery();location.reload()}}}
async function fetchAll(){const result=[];for(let from=0;from<100000;from+=1000){let {data,error}=await client.from('sw_records').select('collection,record_id,payload,revision,deleted').order('collection').order('record_id').range(from,from+999);if(error)throw error;result.push(...(data||[]));if((data||[]).length<1000)return result}throw Error('Zbyt wiele rekordów; wymagany eksport i zmiana paginacji.')}
function loadSnapshot(rows){baseline=new Map();versions=new Map();const state=stateFromRows(rows);const combined={...defaults(),...state};if(!rows.some(r=>r.collection==='__meta'&&r.record_id==='prices')){for(const [id,value] of Object.entries(REFERENCE_PRICES))combined.prices[id+'_FR']={amount:String(value),currency:'EUR'}}db=combined}
loadCloud=async function(){const {data:{user:authUser},error:authError}=await client.auth.getUser();if(authError||!authUser)throw Error('Brak ważnej sesji');accountId=authUser.id;const pending=localStorage.getItem(localKey());if(pending){blocked=true;lastError='Znaleziono niezapisane zmiany z wcześniejszej sesji. Pobierz kopię i zdecyduj, jak je odzyskać.';status('CLOUD / RECOVERY REQUIRED','error');showConflict();throw Error('Wykryto niezapisane zmiany z wcześniejszej sesji. Najpierw zabezpiecz kopię.')}const rows=await fetchAll();loadSnapshot(rows);changed=false;blocked=false;status('CLOUD / SYNCHRONIZED','saved');if(!refreshTimer)refreshTimer=setInterval(()=>{if(cloudActive&&!changed&&!saving&&!blocked)void refreshRemote(false)},12000);if(!realtimeChannel){realtimeChannel=client.channel('sw-record-events').on('postgres_changes',{event:'*',schema:'public',table:'sw_records'},()=>{if(cloudActive&&!changed&&!saving&&!blocked)void refreshRemote(false)}).subscribe()}};
async function refreshRemote(force){if((saving||changed||blocked)&&!force)return;try{const rows=await fetchAll();if((saving||changed||blocked)&&!force)return;loadSnapshot(rows);status('CLOUD / SYNCHRONIZED','saved');try{render()}catch(e){console.error('Render failed',e)}}catch(e){lastError=e.message;status('CLOUD / READ ERROR','error')}}
function changesSince(){const current=indexState(db),changes=[];for(const [k,v] of current){const encoded=JSON.stringify(v.payload);if(baseline.get(k)!==encoded)changes.push({...v,expected:versions.get(k)||0,deleted:false})}for(const [k,encoded] of baseline){if(!current.has(k)){const [collection,id]=k.split(sep);changes.push({collection,id,payload:JSON.parse(encoded),expected:versions.get(k)||0,deleted:true})}}return changes}
// Canonical values: JSONB may reorder keys after the DB writes a payload.
function canon(value){
 if(Array.isArray(value))return value.map(canon);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canon(value[k])]));
 return value;
}
function samePayload(a,b){return JSON.stringify(canon(a))===JSON.stringify(canon(b))}
async function verifyPersisted(change,expectedRevision){
 const {data,error}=await client.from('sw_records')
  .select('collection,record_id,payload,revision,deleted')
  .eq('collection',change.collection).eq('record_id',change.id).maybeSingle();
 if(error)throw Error('Odczyt kontrolny Supabase: '+error.message);
 if(!data||Number(data.revision)!==Number(expectedRevision)||Boolean(data.deleted)!==Boolean(change.deleted)
   ||!samePayload(data.payload,change.payload)){
  throw Error('Zapis niezgodny z odczytem Supabase: '+change.collection+'/'+change.id+' (oczekiwano rev '+expectedRevision+', odczyt '+(data?.revision??'brak')+')');
 }
 return data;
}
async function flush(){
 if(!cloudActive||saving||blocked)return;
 saving=true;status('CLOUD / SAVING…','pending');
 try{
  // The task itself is committed first, independently of analytics or activity
  // records that might be malformed in an older installation.
  while(true){
   changed=false;
   const pending=changesSince().sort((a,b)=>(a.collection==='tasks'? -1:0)-(b.collection==='tasks'? -1:0));
   if(!pending.length){
    clearRecovery();lastError='';status('CLOUD / VERIFIED ✓','saved');settleSaves(null);break;
   }
   for(const submitted of pending){
    const {data,error}=await client.rpc('sw_apply_changes',{p_changes:[submitted]});
    if(error)throw Error(submitted.collection+'/'+submitted.id+': '+error.message);
    const ack=Array.isArray(data)?data.find(x=>x.collection===submitted.collection&&String(x.id)===String(submitted.id)):null;
    if(!ack||!Number.isInteger(Number(ack.revision)))throw Error('Brak odpowiedzi RPC dla '+submitted.collection+'/'+submitted.id);
    // Do not claim SAVED just because RPC returned an acknowledgement.
    await verifyPersisted(submitted,Number(ack.revision));
    const k=key(submitted.collection,submitted.id);
    versions.set(k,Number(ack.revision));
    if(submitted.deleted)baseline.delete(k);
    else baseline.set(k,JSON.stringify(submitted.payload));
    recovery();
   }
   if(!changesSince().length){
    clearRecovery();lastError='';status('CLOUD / VERIFIED ✓','saved');settleSaves(null);break;
   }
  }
 }catch(e){
  changed=true;
  // A failed write must never silently refresh the stale server snapshot.
  blocked=true;
  lastError=e.message||'Nieznany błąd';recovery();
  status('CLOUD / SAVE FAILED','error');
  settleSaves(new Error(lastError));
  console.error('[SiteWarrior CLOUD] Niepotwierdzony zapis:',lastError);
  showConflict();
 }finally{saving=false;}
}
save=function(){
 if(!cloudActive){
  if(cloudConfigured){status('CLOUD / NOT LOGGED IN','error');return Promise.reject(new Error('Brak sesji Supabase'))}
  try{localStorage.setItem(KEY,JSON.stringify(db));status('LOCAL / SAVED','local');return Promise.resolve(true)}
  catch(e){status('LOCAL / STORAGE ERROR','error');return Promise.reject(e)}
 }
 ++saveGeneration;changed=true;recovery();status('CLOUD / PENDING','pending');
 const promise=new Promise((resolve,reject)=>saveWaiters.push({generation:saveGeneration,resolve,reject}));
 // Existing callers often do not await save(). Attach a rejection handler
 // without consuming errors for callers that *do* await confirmation.
 promise.catch(()=>{});
 queueMicrotask(()=>void flush());
 return promise;
};
window.swCloudLastError=()=>lastError;
window.swCloudBuild='8.4.0';
window.swCloudDebug=()=>({active:cloudActive,saving,changed,blocked,lastError,pending:changesSince().map(x=>({collection:x.collection,id:x.id,expected:x.expected})),taskRows:db.tasks?.length||0});
window.swCloudPending=()=>saving||changed||blocked;
window.swRetryCloud=()=>{blocked=false;void flush()};
window.swRemoteRefresh=()=>refreshRemote(false);
window.swCloudIsBusy=()=>saving||changed||blocked;
window.swDownloadRecovery=downloadRecovery;
window.addEventListener('online',()=>{if(cloudActive&&changed&&!blocked)void flush()});
window.addEventListener('beforeunload',e=>{if(cloudActive&&(changed||saving||blocked)){recovery();e.preventDefault();e.returnValue=''}});
// Preserve the cloud session on page refresh while forcing the member role (no free local fallback).
window.addEventListener('load',async()=>{if(!cloudReady)return;try{const {data:{user:authUser}}=await client.auth.getUser();if(!authUser)return;const {data:member,error}=await client.from('members').select('display_name').eq('user_id',authUser.id).single();if(error||!['Kari','Adi'].includes(member?.display_name)){await client.auth.signOut();return}user=member.display_name;cloudActive=true;try{await loadCloud();document.getElementById('landing').style.display='none';document.getElementById('app').style.display='block';navigate('dashboard')}catch(e){cloudActive=false;status('CLOUD / RECOVERY REQUIRED','error');console.warn(e.message)}}catch(e){console.warn('Session restore:',e)}});
const originalLogout=logout;
logout=async function(){if(cloudActive&&(changed||saving||blocked)){showConflict();notify('Najpierw rozwiąż niezapisane zmiany');return}if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null}if(realtimeChannel){await client.removeChannel(realtimeChannel);realtimeChannel=null}accountId=null;await originalLogout();baseline.clear();versions.clear()};
})();
