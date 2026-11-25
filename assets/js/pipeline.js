/* SiteWarrior v14 — five-stage lightweight CRM. Uses existing leads and payments records.
   Financial truth comes from a signed contract milestone AND a received deposit; never from dragging a card. */
(function(){
 'use strict';
 const STAGES=['Potential Lead','Lead','Final','To Follow Up','Failed'];
 const INTRO={
  'Potential Lead':'Zainteresowany kontakt. Prototyp może być gotowy, call jeszcze nie zakończony.',
  'Lead':'Discovery call odbyty, warunki zaakceptowane i dokumentacja wysłana.',
  'Final':'Podpisana umowa oraz faktycznie zaksięgowana zaliczka lub uzgodniona płatność.',
  'To Follow Up':'Wymaga reaktywacji, follow-upu lub odpowiedzi.',
  'Failed':'Zamknięta szansa. Zachowujemy powód i historię.'
 };
 const $=id=>document.getElementById(id);
 const E=v=>esc(String(v??''));
 const now=()=>new Date().toISOString();
 const uid=()=>globalThis.crypto?.randomUUID?.()||'crm-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
 const leads=()=>Array.isArray(db.leads)?db.leads:[];
 const activities=()=>Array.isArray(db.leadActivities)?db.leadActivities:(db.leadActivities=[]);
 const payments=()=>Array.isArray(db.payments)?db.payments:[];
 const find=id=>leads().find(l=>String(l.id)===String(id));
 const isPaid=l=>payments().some(p=>!p.archivedAt&&String(p.leadId)===String(l.id)&&p.kind==='deposit'&&p.status==='Otrzymana'&&Number(p.amount)>0&&Number(p.receivedAmount??p.amount)>=Number(p.amount));
 const isFinal=l=>Boolean(l.journey?.contract_signed)&&isPaid(l);
 const live=()=>leads().filter(l=>!l.archivedAt&&(l.crmStage||window.SWJourney?.qualified?.(l)));
 function stage(l){
  if(isFinal(l))return 'Final';
  if(l.crmStage&&STAGES.includes(l.crmStage))return l.crmStage==='Final'?'Lead':l.crmStage;
  if(['Zamknięty','Przegrany','Nie kontaktować','Odłożony'].includes(l.status))return 'Failed';
  if(l.journey?.contract_sent||l.journey?.call_attended||['Umowa + płatność','Onboarding wysłany','Call odbyty'].includes(l.status))return 'Lead';
  return 'Potential Lead';
 }
 function writable(){
  if(cloudConfigured&&!cloudActive){notify('Zaloguj się do Supabase przed zapisem.');return false}
  if(window.swCloudDebug?.().blocked){notify('Zapis jest wstrzymany — kliknij CLOUD / SAVE FAILED.');return false}
  if(pending){notify('Trwa zapis poprzedniej zmiany.');return false}
  return true;
 }
 let owner='team',query='',pending=false,dragId='';
 function log(l,from,to,note){
  activities().push({id:uid(),leadId:l.id,type:'crm_stage_change',owner:user||l.owner,at:now(),from,to,note:note||''});
  activity('sales',`Pipeline CRM: ${l.name} / ${from} → ${to}${note?' · '+note:''}`);
 }
 function dialog(title,description,fields,onSubmit){
  $('swPipelineDialog')?.remove();const d=document.createElement('div');d.id='swPipelineDialog';d.className='j-overlay';
  d.innerHTML=`<div class="j-modal sw-crm-dialog" role="dialog" aria-modal="true"><header class="j-modalhead"><div><small>SITEWARRIOR / CRM</small><h2>${E(title)}</h2></div><button type="button" class="j-x" data-crm="close-dialog" aria-label="Zamknij">×</button></header><p class="sw-crm-help">${E(description)}</p><form class="j-form">${fields}<footer><button type="button" class="j-btn" data-crm="close-dialog">Anuluj</button><button type="submit" class="j-btn primary">Potwierdź i zapisz</button></footer><p class="sw-crm-error" role="alert" hidden></p></form></div>`;
  document.body.append(d);
  d.addEventListener('click',e=>{if(e.target===d)d.remove()});
  d.querySelector('form').addEventListener('submit',async e=>{
   e.preventDefault();if(!writable())return;
   const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),error=form.querySelector('.sw-crm-error');
   error.hidden=true;button.disabled=true;
   try{const accepted=await onSubmit(new FormData(form));if(accepted)d.remove()}
   catch(ex){error.hidden=false;error.textContent='Nie zapisano zmiany: '+ex.message}
   finally{button.disabled=false}
  });
  d.querySelector('input,textarea,button')?.focus();
 }
 function applyChange(l,to,note='',meta={}){
  if(!writable())return Promise.resolve(false);
  const from=stage(l);
  if(to===from)return Promise.resolve(false);
  const previous={crmStage:l.crmStage,crmReason:l.crmReason,crmUpdatedAt:l.crmUpdatedAt,crmUpdatedBy:l.crmUpdatedBy,crmCallCompletedAt:l.crmCallCompletedAt,crmDocsSentAt:l.crmDocsSentAt,next:l.next,nextAction:l.nextAction};
  l.crmStage=to;l.crmReason=note;l.crmUpdatedAt=now();l.crmUpdatedBy=user;
  if(to==='Lead'){
   if(meta.confirmed){l.crmCallCompletedAt=l.crmCallCompletedAt||now();l.crmDocsSentAt=l.crmDocsSentAt||now()}
   l.nextAction=l.nextAction||'Doprowadź do podpisu i zaliczki';
  }
  if(to==='To Follow Up'){
   l.next=meta.next;
   l.nextAction=meta.nextAction||'Skontaktuj się ponownie';
  }
  if(to==='Failed'){
   l.crmFailedReason=note;
   l.next='';l.nextAction='Szansa zamknięta';
   l.status='Zamknięty';
  }else if(from==='Failed'&&l.status==='Zamknięty'){
   l.status='Zainteresowany';
  }
  const event={id:uid(),leadId:l.id,type:'crm_stage_change',owner:user||l.owner,at:now(),from,to,note};
  activities().push(event);
  const activityEntry={id:uid(),type:'sales',description:`CRM ${l.name}: ${from} → ${to}`,owner:user||l.owner,at:now()};
  (db.activity??=[]).unshift(activityEntry);
  pending=true;renderBoard();
  let promise;
  try{promise=save()}
  catch(err){promise=Promise.reject(err)}
  return Promise.resolve(promise).then(()=>{
   notify('Zapis potwierdzony · '+l.name+' → '+to);return true;
  }).catch(err=>{
   // Do not silently roll back data after a failed cloud write. The recovery
   // snapshot and explicit conflict flow preserve the user's pending changes.
   notify('Zapis NIEPOTWIERDZONY: '+err.message);
   throw err;
  }).finally(()=>{pending=false;renderBoard()});
 }
 function requestMove(id,to){
  const l=find(id);if(!l||!STAGES.includes(to)||!writable())return;
  const from=stage(l);
  if(from===to)return;
  if(isFinal(l)){
   notify('Final jest potwierdzony podpisem i wpłatą. Zmiany rozliczeń wykonaj w karcie klienta.');renderBoard();return;
  }
  if(to==='Final'){
   notify('Final wymaga potwierdzonego podpisu i zaksięgowanej zaliczki. Otwieram kartę.');
   window.SWJourney?.openLead?.(id);renderBoard();return;
  }
  if(to==='Lead'&&!(l.crmCallCompletedAt&&l.crmDocsSentAt)&&!l.journey?.contract_sent){
   dialog('Zakwalifikuj jako Lead',`Potwierdź realnie wykonane kroki dla ${l.name}. Przesunięcie nie rejestruje automatycznie calla ani wysłania dokumentów w szczegółowym workflow.`,
    `<label class="sw-crm-check"><input type="checkbox" name="call" required> Call faktycznie się odbył</label><label class="sw-crm-check"><input type="checkbox" name="docs" required> Klient zaakceptował warunki i wysłaliśmy dokumentację</label><label>Notatka (opcjonalna)<textarea name="note" rows="3" maxlength="1500"></textarea></label>`,
    async d=>applyChange(l,to,String(d.get('note')||''),{confirmed:true}));return;
  }
  if(to==='To Follow Up'){
   dialog('Zaplanuj follow-up',`Wpisz następny konkretny krok dla ${l.name}. Termin pozwoli wyświetlić kontakt w kolejce na dziś.`,
    `<label>Data kontaktu *<input type="date" name="next" required value="${E(l.next||new Date().toLocaleDateString('en-CA'))}"></label><label>Co zrobić? *<input name="nextAction" maxlength="240" required value="${E(l.nextAction||'Wyślij follow-up')}"></label><label>Notatka<textarea name="note" rows="3" maxlength="1500"></textarea></label>`,
    async d=>applyChange(l,to,String(d.get('note')||''),{next:String(d.get('next')),nextAction:String(d.get('nextAction'))}));return;
  }
  if(to==='Failed'){
   dialog('Zamknij szansę',`Podaj powód zamknięcia dla ${l.name}. Historia pozostanie w systemie.`,
    `<label>Powód *<textarea name="reason" rows="4" required maxlength="1500" placeholder="np. klient zrezygnował"></textarea></label>`,
    async d=>applyChange(l,to,String(d.get('reason')||'')));return;
  }
  dialog('Zmień etap',`Przeniesienie ${l.name}: ${from} → ${to}. Historia sprzedażowa i płatności pozostaną bez zmian.`,
   `<label>Powód / następny krok (opcjonalnie)<textarea name="note" rows="3" maxlength="1500"></textarea></label>`,
   async d=>applyChange(l,to,String(d.get('note')||'')));
 }
 function card(l){const s=stage(l),n=l.next||'',meta=[l.country||l.region||l.market||'',l.channel||'',l.owner||''].filter(Boolean).join(' · ');
  return `<article class="sw-crm-card" draggable="${pending?'false':'true'}" data-crm-lead="${E(l.id)}" aria-label="${E(l.name)}">
   <div class="sw-crm-card-top"><span>${E(l.owner||'—')}</span>${l.prototypeUrl?'<span class="sw-crm-prototype">PROTOTYPE</span>':''}</div>
   <h3>${E(l.name)}</h3><p>${E(meta)}</p>${l.nextAction?`<div class="sw-crm-next">${E(l.nextAction)}</div>`:''}
   ${n?`<small class="sw-crm-date">Follow-up · ${E(n)}</small>`:''}
   <div class="sw-crm-card-actions"><button class="sw-crm-link" type="button" data-crm="detail" data-id="${E(l.id)}">Karta klienta</button><button class="sw-crm-link" type="button" data-crm="edit" data-id="${E(l.id)}">Edytuj</button></div>
   <label class="sw-crm-select-label">Przenieś do<select data-crm-stage="${E(l.id)}" aria-label="Przenieś ${E(l.name)}">${STAGES.map(v=>`<option value="${E(v)}" ${v===s?'selected':''}>${E(v)}</option>`).join('')}</select></label>
  </article>`}
 function renderBoard(){if(view!=='pipeline')return;
  const filtered=live().filter(l=>(owner==='team'||l.owner===owner)&&(!query||[l.name,l.country,l.channel,l.note,l.nextAction].join(' ').toLowerCase().includes(query.toLowerCase())));
  $('content').innerHTML=`<div id="swPipeline" class="sw-crm">
  <div class="sw-crm-hero"><div><div class="eyebrow">SALES / CLIENT PIPELINE</div><h1>Pipeline CRM<span class="sw-crm-accent">.</span></h1><p>Pięć etapów. Jeden następny krok. Przeciągnij kartę lub użyj pola „Przenieś do”.</p></div><div class="sw-crm-hero-actions"><button class="btn" type="button" data-crm="new">+ DODAJ LEADA</button></div></div>
  <div class="sw-crm-toolbar"><div class="sw-crm-stats"><strong>${filtered.length}</strong><span>kontaktów w pipeline</span></div><label>Szukaj<input id="swCrmSearch" type="search" placeholder="Klient, kraj, notatka…" value="${E(query)}"></label><label>Opiekun<select id="swCrmOwner"><option value="team" ${owner==='team'?'selected':''}>Kari + Adi</option>${['Kari','Adi'].map(n=>`<option value="${n}" ${owner===n?'selected':''}>${n}</option>`).join('')}</select></label></div>
  <div class="sw-crm-scroll"><div class="sw-crm-board" role="region" aria-label="Pięciokolumnowy pipeline">
  ${STAGES.map(s=>{const group=filtered.filter(l=>stage(l)===s);return `<section class="sw-crm-col" data-crm-drop="${E(s)}"><header><div class="sw-crm-col-head"><span class="sw-crm-stage-dot"></span><h2>${E(s)}</h2><strong>${group.length}</strong></div><p>${E(INTRO[s])}</p></header><div class="sw-crm-col-content">${group.map(card).join('')||'<div class="sw-crm-empty">Brak kontaktów w tym etapie</div>'}</div></section>`}).join('')}</div></div>
  <div class="sw-crm-footer">Final wymaga podpisanej umowy i wpłaty. Status CRM nie generuje automatycznie przychodu ani fikcyjnych zdarzeń.</div>
  </div>`;
 }
 const originalRender=render;
 render=function(){if(view==='pipeline')return renderBoard();return originalRender()};
 const originalNavigate=navigate;
 navigate=function(target){if(target==='pipeline'){
  view='pipeline';document.querySelectorAll('.sidebar .nav').forEach(n=>n.classList.toggle('active',n.dataset.view==='pipeline'));
  const su=$('sideUser');if(su)su.textContent='◉ '+(user||'Operator')+' / OPERATOR';renderBoard();return;
 }return originalNavigate(target)};
 document.addEventListener('click',e=>{const t=e.target.closest?.('[data-crm]');if(!t)return;e.preventDefault();const id=t.dataset.id;
  if(t.dataset.crm==='close-dialog')$('swPipelineDialog')?.remove();
  if(t.dataset.crm==='new')window.SWJourney?.newLead?.();
  if(t.dataset.crm==='detail')window.SWJourney?.openLead?.(id);
  if(t.dataset.crm==='edit')window.swEdit?.('leads',id);
 });
 document.addEventListener('change',e=>{
  if(e.target.id==='swCrmOwner'){owner=e.target.value;renderBoard()}
  if(e.target.matches?.('[data-crm-stage]')){const {crmStage:id}=e.target.dataset;requestMove(id,e.target.value);if(view==='pipeline')renderBoard()}
 });
 document.addEventListener('input',e=>{if(e.target.id!=='swCrmSearch')return;const start=e.target.selectionStart;query=e.target.value;renderBoard();const search=$('swCrmSearch');search?.focus();try{search?.setSelectionRange(start,start)}catch{}});
 document.addEventListener('dragstart',e=>{const el=e.target.closest?.('.sw-crm-card[data-crm-lead]');if(!el||pending)return;dragId=el.dataset.crmLead;el.classList.add('sw-crm-dragging');e.dataTransfer?.setData('text/plain',dragId)});
 document.addEventListener('dragover',e=>{const col=e.target.closest?.('[data-crm-drop]');if(!col||!dragId)return;e.preventDefault();col.classList.add('sw-crm-over')});
 document.addEventListener('dragleave',e=>{const col=e.target.closest?.('[data-crm-drop]');if(col&&!col.contains(e.relatedTarget))col.classList.remove('sw-crm-over')});
 document.addEventListener('drop',e=>{const col=e.target.closest?.('[data-crm-drop]');if(!col||!dragId)return;e.preventDefault();e.stopPropagation();const id=dragId;dragId='';document.querySelectorAll('.sw-crm-col').forEach(x=>x.classList.remove('sw-crm-over'));requestMove(id,col.dataset.crmDrop)});
 document.addEventListener('dragend',()=>{dragId='';document.querySelectorAll('.sw-crm-col,.sw-crm-card').forEach(x=>x.classList.remove('sw-crm-over','sw-crm-dragging'))});
 window.SWPipeline={STAGES,stage,isFinal,isPaid,requestMove,render:renderBoard};
})();
