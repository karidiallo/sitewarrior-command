/* SiteWarrior v7 workflow layer: shared task entity, distinct project/delivery views, deep links and review queue. */
(function(){
'use strict';
const $=id=>document.getElementById(id), enc=v=>esc(String(v??''));
const iso=()=>new Date().toISOString(), today=()=>new Date().toLocaleDateString('en-CA');
const taskStages=['Backlog','Do zrobienia','W trakcie','Do sprawdzenia','Gotowe'];
const projectStages=['Brief','W realizacji','Do akceptacji','Wdrożony','Zamknięty'];
let teamFilter='mine', previousView='dashboard';
const all=(kind)=>Array.isArray(db[kind])?db[kind]:[];
const tasks=()=>all('tasks'), projects=()=>all('projects'), leads=()=>all('leads');
const taskStatus=t=>t.status==='W toku'?'W trakcie':(t.status||(t.done?'Gotowe':'Do zrobienia'));
const isDone=t=>taskStatus(t)==='Gotowe';
const isMine=x=>teamFilter==='team'||(x.owner===user)||(x.reviewer===user&&taskStatus(x)==='Do sprawdzenia');
const selectPerson=(value)=>['Kari','Adi'].map(x=>`<option value="${x}" ${x===value?'selected':''}>${x}</option>`).join('');
const dateLabel=d=>d?enc(d):'Bez terminu';
const projFor=t=>projects().find(p=>String(p.id)===String(t.projectId));
function projectProgress(id){const arr=tasks().filter(t=>String(t.projectId)===String(id));return {total:arr.length,done:arr.filter(isDone).length,percent:arr.length?Math.round(100*arr.filter(isDone).length/arr.length):0}}
function button(label,action,primary=false){return `<button class="mini-btn ${primary?'sw-prime':''}" onclick="${action}">${label}</button>`}
function flash(message,kind,id){let el=$('swResultToast');if(!el){el=document.createElement('div');el.id='swResultToast';el.className='sw-result-toast';document.body.appendChild(el)}const saved=cloudActive?'ZMIANA LOKALNA · Oczekuje na CLOUD / SAVED. Przy CLOUD / ERROR nie odświeżaj strony.':'Zapisano lokalnie';el.innerHTML=`<strong>${enc(message)}</strong><small>${enc(saved)}</small><div class="command-actions">${kind?button('Otwórz element',`swOpenEntity('${kind}','${id}')`):''}${button('Zamknij',`document.getElementById('swResultToast')?.remove()`)}</div>`}
function addHistory(t,from,to,comment){t.reviewNotes??=[];t.reviewNotes.push({id:crypto.randomUUID(),at:iso(),by:user,from,to,comment:comment||''});if(t.reviewNotes.length>300)t.reviewNotes=t.reviewNotes.slice(-300);}
function commitTask(t,to,comment=''){
 if(cloudConfigured&&!cloudActive){notify('Brak aktywnej sesji Supabase — zmiana nie została wykonana');return false;}
 const from=taskStatus(t);
 if(from===to&&!comment)return false;
 t.status=to;t.done=to==='Gotowe';t.updatedAt=iso();t.updatedBy=user;
 addHistory(t,from,to,comment);
 if(to==='Gotowe'&&!t.rewarded){t.rewarded=true;db.xp[t.owner]=(db.xp[t.owner]||0)+(t.priority==='Wysoki'?70:40)}
 activity('workflow',`${user}: ${t.name} · ${from} → ${to}${comment?' · '+comment:''}`);
 // Save exactly this record change through the existing per-record cloud pipeline.
 // Never report a server confirmation before the cloud status actually says SAVED.
 const saved=save();
 render();
 flash(`Przeniesiono: ${from} → ${to}`,'tasks',t.id);
 Promise.resolve(saved).then(()=>{
  const el=document.getElementById('swResultToast');
  if(el)el.querySelector('small').textContent=cloudActive?'ZWERYFIKOWANO W BAZIE · '+to:'ZAPISANO LOKALNIE · '+to;
 }).catch(e=>{
  const el=document.getElementById('swResultToast');
  if(el){el.querySelector('strong').textContent='BŁĄD ZAPISU · '+to;el.querySelector('small').textContent=e.message+' — zmiany zachowane lokalnie. Kliknij CLOUD / ERROR.'}
  console.error('SiteWarrior task status was NOT saved:',e);
 });
 return true;
}
window.swWorkflowStatus=(id,to)=>{
 const t=tasks().find(x=>String(x.id)===String(id));
 if(!t){notify('Nie znaleziono zadania — nie zapisano zmiany');return false}
 if(!taskStages.includes(to)){notify('Nieznany etap — nie zapisano zmiany');return false}
 if(taskStatus(t)===to)return true;
 if(to==='Do sprawdzenia'){
  const reviewer=prompt('Kto ma zatwierdzić zadanie? Kari lub Adi',t.reviewer||(t.owner==='Kari'?'Adi':'Kari'));
  if(reviewer===null){render();return false}
  if(!['Kari','Adi'].includes(reviewer)){notify('Wybierz Kari lub Adi');render();return false}
  t.reviewer=reviewer;
 }
 if(to==='W trakcie'&&taskStatus(t)==='Do sprawdzenia'){
  const reason=prompt('Co wymaga poprawy? Podaj konkretny komentarz.');
  if(reason===null){render();return false}
  if(!reason.trim()){notify('Wpisz komentarz do poprawek');render();return false}
  return commitTask(t,to,reason.trim());
 }
 return commitTask(t,to);
};
window.swWorkflowReturn=()=>navigate(previousView||'dashboard');
window.swOpenEntity=(kind,id)=>{
previousView=view;const x=all(kind).find(x=>String(x.id)===String(id));if(!x){notify('Element nie jest już dostępny');return}
if(kind==='leads'&&window.swLeadCard){window.swLeadCard(id);return}
if(kind==='tasks')openTask(id);
else if(kind==='projects')openProject(id);
else window.swEdit?.(kind,id);
};
function openPanel(title,body){$('swWorkflowPanel')?.remove();let wrap=document.createElement('div');wrap.id='swWorkflowPanel';wrap.className='modalwrap';wrap.style.display='flex';wrap.style.zIndex='90';wrap.innerHTML=`<div class="modal sw-workflow-panel"><div class="modalhead"><div class="eyebrow">SITEWARRIOR / ${enc(title)}</div><button class="close" onclick="swCloseWorkflow()">×</button></div>${body}</div>`;document.body.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()})}
window.swCloseWorkflow=()=>$('swWorkflowPanel')?.remove();
function openTask(id){let t=tasks().find(t=>String(t.id)===String(id));if(!t)return;let p=projFor(t),status=taskStatus(t);openPanel('TASK INTELLIGENCE',`<h2>${enc(t.name)}</h2><div class="sw-facts"><span>${enc(status)}</span><span>Owner: ${enc(t.owner||'—')}</span><span>Reviewer: ${enc(t.reviewer||'—')}</span><span>${dateLabel(t.due)}</span></div><p class="muted">${enc(t.note||'Brak opisu lub definicji ukończenia')}</p>${t.blockedReason?`<p class="sw-warning">Blokada: ${enc(t.blockedReason)}</p>`:''}${p?`<div class="sw-related"><strong>Projekt nadrzędny</strong> ${button(enc(p.name),`swOpenEntity('projects','${p.id}')`)}</div>`:''}<div class="command-actions">${button('Edytuj zadanie',`swCloseWorkflow();swEdit('tasks','${t.id}')`)}${status==='Backlog'?button('Do zrobienia',`swWorkflowStatus('${t.id}','Do zrobienia');swOpenEntity('tasks','${t.id}')`):''}${status==='Do zrobienia'?button('Rozpocznij',`swWorkflowStatus('${t.id}','W trakcie');swOpenEntity('tasks','${t.id}')`):''}${status==='W trakcie'?button('Przekaż do sprawdzenia',`swWorkflowStatus('${t.id}','Do sprawdzenia');swOpenEntity('tasks','${t.id}')`):''}${status==='Do sprawdzenia'?button('Zatwierdź',`swWorkflowStatus('${t.id}','Gotowe');swOpenEntity('tasks','${t.id}')`):''}${status==='Do sprawdzenia'?button('Wymaga poprawek',`swWorkflowStatus('${t.id}','W trakcie');swOpenEntity('tasks','${t.id}')`):''}</div><h3>Historia zadania</h3>${(t.reviewNotes||[]).slice().reverse().map(n=>`<div class="sw-history"><strong>${enc(n.by)} · ${enc(n.from)} → ${enc(n.to)}</strong><small>${enc(n.at?.replace('T',' ').slice(0,16))}</small>${n.comment?`<p>${enc(n.comment)}</p>`:''}</div>`).join('')||'<p class="muted">Brak historii zmian statusu w tym zadaniu.</p>'}<div class="command-actions">${button('Wróć do poprzedniego widoku','swCloseWorkflow();swWorkflowReturn()')}</div>`)}
function openProject(id){let p=projects().find(x=>String(x.id)===String(id));if(!p)return;const prog=projectProgress(id),related=tasks().filter(t=>String(t.projectId)===String(id));openPanel('PROJECT INTELLIGENCE',`<h2>${enc(p.name)}</h2><div class="sw-facts"><span>${enc(p.status||'Brief')}</span><span>${enc(p.owner||'—')}</span><span>Deadline: ${dateLabel(p.due)}</span><span>${enc(p.amount||0)} ${enc(p.currency||'EUR')}</span></div><p class="muted">${enc(p.note||'Brak opisu zakresu')}</p><div class="sw-progress"><div style="width:${prog.percent}%"></div></div><p>${prog.done}/${prog.total} zadań gotowych (${prog.percent}%)</p><div class="command-actions">${button('Edytuj projekt',`swCloseWorkflow();swEdit('projects','${p.id}')`)}${button('Dodaj zadanie',`swCloseWorkflow();swProjectTask('${p.id}')`)}${p.leadId?button('Otwórz leada',`swOpenEntity('leads','${p.leadId}')`):''}</div><h3>Zadania projektu</h3>${related.map(t=>`<div class="sw-related"><div><strong>${enc(t.name)}</strong><small>${enc(taskStatus(t))} · ${enc(t.owner)}</small></div>${button('Otwórz zadanie',`swOpenEntity('tasks','${t.id}')`)}</div>`).join('')||'<p class="muted">Nie ma jeszcze powiązanych zadań.</p>'}<div class="command-actions">${button('Wróć','swCloseWorkflow();swWorkflowReturn()')}</div>`)}
window.swWorkflowFilter=v=>{teamFilter=v;render()};
function filterBar(){return `<div class="sw-filter"><label for="swOperatorFilter">Widok operatora</label><select id="swOperatorFilter" onchange="swWorkflowFilter(this.value)"><option value="mine" ${teamFilter==='mine'?'selected':''}>Moje / do zatwierdzenia</option><option value="team" ${teamFilter==='team'?'selected':''}>Cały zespół</option></select></div>`}
function taskCard(t){
 const st=taskStatus(t),p=projFor(t),id=enc(t.id);
 const stageOptions=taskStages.map(x=>`<option value="${enc(x)}" ${x===st?'selected':''}>${enc(x)}</option>`).join('');
 return `<div class="sw-ticket" draggable="true" data-task-id="${id}" tabindex="0" role="button" aria-label="Zadanie ${enc(t.name)}. Przeciągnij do innej kolumny lub zmień status na liście." onclick="swOpenEntity('tasks','${id}')" onkeydown="if(event.key==='Enter')swOpenEntity('tasks','${id}')"><div class="sw-drag-handle" aria-hidden="true">⠿</div><strong>${enc(t.name)}</strong><small>${enc(t.owner||'—')} · ${dateLabel(t.due)} ${t.priority==='Wysoki'?'· HIGH':''}</small>${p?`<small>Projekt: ${enc(p.name)}</small>`:''}${t.blockedReason?`<small class="sw-warning">ZABLOKOWANE: ${enc(t.blockedReason)}</small>`:''}<div class="command-actions" onclick="event.stopPropagation()"><label class="sw-move-label">Status <select class="sw-stage-select" aria-label="Status zadania ${enc(t.name)}" onchange="swWorkflowStatus('${id}',this.value)">${stageOptions}</select></label>${button('Szczegóły',`swOpenEntity('tasks','${id}')`)}</div></div>`;
}
function board(arr){return `<div class="sw-board" aria-label="Tablica zadań. Przeciągnij zadanie do wybranej kolumny.">${taskStages.map(st=>`<section class="sw-board-col" data-stage="${enc(st)}" aria-label="Kolumna ${enc(st)}"><h3>${st.toUpperCase()} <span>${arr.filter(t=>taskStatus(t)===st).length}</span></h3>${arr.filter(t=>taskStatus(t)===st).map(taskCard).join('')||'<p class="muted">Brak zadań</p>'}</section>`).join('')}</div>`}
// One canonical transition handler for drag & drop, the select and detail actions.
// A highlighted destination is *not* a completed move. Only a successful drop
// may mutate the task; the server then independently confirms persistence.
let draggingTaskId=null;
let dropCompleted=false;
function clearDragState(){
 document.querySelectorAll('.sw-drop-target,.sw-dragging').forEach(x=>x.classList.remove('sw-drop-target','sw-dragging'));
}
document.addEventListener('dragstart',event=>{
 const ticket=event.target.closest?.('.sw-ticket[data-task-id]');if(!ticket)return;
 draggingTaskId=ticket.dataset.taskId;dropCompleted=false;
 if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggingTaskId)}
 ticket.classList.add('sw-dragging');
});
document.addEventListener('dragover',event=>{
 const col=event.target.closest?.('.sw-board-col[data-stage]');if(!col||!draggingTaskId)return;
 event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';
 document.querySelectorAll('.sw-board-col.sw-drop-target').forEach(x=>{if(x!==col)x.classList.remove('sw-drop-target')});
 col.classList.add('sw-drop-target');
});
document.addEventListener('drop',event=>{
 const col=event.target.closest?.('.sw-board-col[data-stage]');
 if(!col||!draggingTaskId)return;
 event.preventDefault();event.stopPropagation();
 const id=draggingTaskId,to=col.dataset.stage;
 draggingTaskId=null;clearDragState();
 // The transition function owns validation, UI rerender and cloud persistence.
 dropCompleted=window.swWorkflowStatus(id,to)===true;
 if(!dropCompleted)notify('Przenoszenie anulowane — status zadania nie został zmieniony');
});
document.addEventListener('dragend',()=>{
 const wasDragging=!!draggingTaskId;
 draggingTaskId=null;clearDragState();
 if(wasDragging&&!dropCompleted)notify('Nie upuszczono zadania w kolumnie. Użyj listy „Status” na karcie.');
 dropCompleted=false;
});
function renderTasks(){ $('content').innerHTML=heading('MISSIONS','Zadania','Jeden status zadania w każdym widoku. Przekaż, zatwierdź lub odeślij do poprawek.')+filterBar()+`<div class="command-actions"><button class="btn" onclick="swNew('tasks')">+ NOWE ZADANIE</button></div>`+board(tasks().filter(t=>!t.archivedAt).filter(isMine)) }
function renderDelivery(){let arr=tasks().filter(t=>!t.archivedAt).filter(t=>t.projectId&&projects().some(p=>String(p.id)===String(t.projectId))).filter(isMine);$('content').innerHTML=heading('PRODUCTION','Delivery Board','Wyłącznie praca produkcyjna powiązana z projektami — zatwierdzenia, poprawki, blokady i deadline’y.')+filterBar()+board(arr)}
function renderProjects(){let arr=projects().filter(p=>!p.archivedAt).filter(p=>teamFilter==='team'||p.owner===user);$('content').innerHTML=heading('PROJECT MANAGEMENT','Projekty','Zarządzaj zakresem, budżetem i terminami. Procent postępu wynika z zadań, nie ze statusu projektu.')+filterBar()+`<div class="command-actions"><button class="btn" onclick="swNew('projects')">+ NOWY PROJEKT</button></div><div class="item-grid">${arr.map(p=>{let prog=projectProgress(p.id),lead=leads().find(l=>String(l.id)===String(p.leadId));return `<article class="card sw-project" role="button" tabindex="0" onclick="swOpenEntity('projects','${p.id}')" onkeydown="if(event.key==='Enter')swOpenEntity('projects','${p.id}')"><div class="eyebrow">${enc(p.status||'Brief')} / ${enc(p.market||'PL')}</div><h2>${enc(p.name)}</h2><p class="muted">${enc(lead?.name||p.client||'Bez przypisanego klienta')}</p><div class="sw-progress"><div style="width:${prog.percent}%"></div></div><div class="sw-facts"><span>${prog.done}/${prog.total} zadań</span><span>${prog.percent}%</span><span>${enc(p.owner||'—')}</span><span>${dateLabel(p.due)}</span></div><p>${enc(p.amount||0)} ${enc(p.currency||'EUR')}</p>${button('Otwórz projekt',`event.stopPropagation();swOpenEntity('projects','${p.id}')`)}</article>`}).join('')||'<p class="muted">Nie ma projektów przypisanych do tego widoku.</p>'}</div>`}
function renderDashboard(){const open=tasks().filter(t=>!t.archivedAt&&!isDone(t)),mine=open.filter(isMine),review=open.filter(t=>taskStatus(t)==='Do sprawdzenia'&&t.reviewer===user),overdue=mine.filter(t=>t.due&&t.due<today()),now=mine.filter(t=>t.due===today()),followups=leads().filter(l=>!l.archivedAt).filter(l=>(teamFilter==='team'||l.owner===user)&&l.next&&l.next<=today()&&!['Wygrany','Przegrany','Nie kontaktować'].includes(l.status)),near=projects().filter(p=>!p.archivedAt).filter(p=>(teamFilter==='team'||p.owner===user)&&p.due&&p.due>=today()).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,5);$('content').innerHTML=heading('MISSION CONTROL',`Witaj, ${enc(user)}.`,'Co wymaga działania i gdzie kontynuować?')+filterBar()+`<div class="command-actions"><button class="btn" onclick="swNew('tasks')">+ ZADANIE</button><button class="btn secondary" onclick="swNew('leads')">+ LEAD</button><button class="btn secondary" onclick="swNew('journal')">+ NOTATKA</button></div><div class="grid sw-kpis"><div class="card metric sw-clickable" onclick="navigate('tasks')"><small>MOJE OTWARTE</small><b>${mine.length}</b><em>Otwórz zadania</em></div><div class="card metric sw-clickable" onclick="navigate('tasks')"><small>DO ZATWIERDZENIA</small><b>${review.length}</b><em>Otwórz kolejkę</em></div><div class="card metric sw-clickable" onclick="navigate('tasks')"><small>ZALEGŁE ZADANIA</small><b>${overdue.length}</b><em>Sprawdź deadline’y</em></div><div class="card metric sw-clickable" onclick="navigate('sales')"><small>FOLLOW-UPY</small><b>${followups.length}</b><em>Przejdź do Sales</em></div></div><div class="sw-dashboard-grid"><section class="card"><h2>01 / Dziś i zaległe</h2>${[...overdue,...now.filter(x=>!overdue.includes(x))].slice(0,8).map(t=>`<div class="sw-related"><div><strong>${enc(t.name)}</strong><small>${enc(taskStatus(t))} · ${dateLabel(t.due)}</small></div>${button('Otwórz',`swOpenEntity('tasks','${t.id}')`)}</div>`).join('')||'<p class="muted">Nie ma pilnych zadań.</p>'}</section><section class="card"><h2>02 / Zatwierdzenia</h2>${review.map(t=>`<div class="sw-related"><div><strong>${enc(t.name)}</strong><small>Od ${enc(t.owner)}</small></div>${button('Sprawdź',`swOpenEntity('tasks','${t.id}')`)}</div>`).join('')||'<p class="muted">Nic nie czeka na zatwierdzenie.</p>'}</section><section class="card"><h2>03 / Sales — następny krok</h2>${followups.slice(0,8).map(l=>`<div class="sw-related"><div><strong>${enc(l.name)}</strong><small>${enc(l.nextAction||'Brak opisu czynności')} · ${dateLabel(l.next)}</small></div>${button('Klient',`swOpenEntity('leads','${l.id}')`)}</div>`).join('')||'<p class="muted">Brak zaległych follow-upów.</p>'}</section><section class="card"><h2>04 / Projekty i terminy</h2>${near.map(p=>`<div class="sw-related"><div><strong>${enc(p.name)}</strong><small>${dateLabel(p.due)} · ${projectProgress(p.id).percent}%</small></div>${button('Projekt',`swOpenEntity('projects','${p.id}')`)}</div>`).join('')||'<p class="muted">Brak nadchodzących terminów.</p>'}</section></div><section class="card section"><h2>05 / Ostatnia aktywność</h2>${all('activity').slice(-12).reverse().map(a=>`<div class="activity">${enc(a.text||a.label||a.name||a.type||'Zmiana')} <small>${enc(a.at||a.date||'')}</small></div>`).join('')||'<p class="muted">Brak aktywności</p>'}</section>`}
const renderPrevious=render;render=function(){if(view==='dashboard')return renderDashboard();if(view==='tasks')return renderTasks();if(view==='projects')return renderProjects();if(view==='delivery')return renderDelivery();return renderPrevious()};
// Existing editor always stores the same task record; after any edit, normalize completion state and show a direct link.
const originalEdit=window.swEdit;
window.swEdit=(kind,id)=>{originalEdit(kind,id);const form=$('swEditForm');if(!form)return;form.addEventListener('submit',()=>{queueMicrotask(()=>{if(kind==='tasks'){const t=tasks().find(x=>String(x.id)===String(id));if(t){t.done=isDone(t);if(t.status==='W toku')t.status='W trakcie';save()}}if(kind==='projects'||kind==='tasks'||kind==='leads'){flash('Zapisano zmiany w interfejsie',kind,id)}})})};
// Legacy quick-complete checkbox and dropdowns now follow exactly the same workflow transition logic.
window.swTaskStatus=(id,value)=>window.swWorkflowStatus(id,value==='W toku'?'W trakcie':value);
const originalToggle=toggleTask;toggleTask=function(id){let t=tasks().find(x=>String(x.id)===String(id));if(t)window.swWorkflowStatus(id,isDone(t)?'Do zrobienia':'Gotowe');else originalToggle(id)};
// Ensure newly-created project tasks retain their project relationship via v7 extension adjustment.
})();
