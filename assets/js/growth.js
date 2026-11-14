/* SiteWarrior v10 / Outreach batches, cash-first Money Radar, earned XP.
 * Loaded after lite.js. This module owns no router; it exports two views.
 * Uses existing leadActivities + payments + xp so no SQL migration is needed.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const safe = v => esc(String(v ?? ''));
  const now = () => new Date().toISOString();
  const today = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const uid = () => globalThis.crypto?.randomUUID?.() || 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  const regions = ['Europa', 'Asia', 'North America', 'Africa'];
  const normalizeRegion = value => ({'APAC':'Asia','Azja':'Asia','Afryka':'Africa','Ameryka Północna':'North America','Europe':'Europa','Bliski Wschód':'Asia'})[value] || value || 'Europa';
  const channels = ['WhatsApp', 'Instagram', 'Email', 'LinkedIn', 'Inne'];
  const variants = ['A', 'B', 'Bez oznaczenia'];
  const dayTarget = 50;
  const regionFromMarket = market => ({PL:'Europa',NO:'Europa',FR:'Europa',DE:'Europa',UK:'Europa',USCA:'North America',AF:'Africa',APAC:'Asia'})[market] || '';
  const activeBatches = data => (data.leadActivities || []).filter(a => a.type === 'outreach_batch' && !a.archivedAt);
  const allBatches = data => (data.leadActivities || []).filter(a => a.type === 'outreach_batch');
  const batchDate = a => a.occurredOn || String(a.at || '').slice(0,10);
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T12:00:00Z').getTime()) && new Date(v + 'T12:00:00Z').toISOString().slice(0,10) === v;
  const validCount = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 10000;
  const integer = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0;
  const validClock = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));
  const clock = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const tz = () => {try{return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'}catch{return 'Europe/Warsaw'}};
  // v10-v12.1 records are single-region, with no verified view data.
  // Missing view fields must NOT be interpreted as "not viewed".
  function segmentsOf(batch) {
    const raw = Array.isArray(batch.segments) && batch.segments.length ? batch.segments : [{
      region:batch.region, country:batch.country, channel:batch.channel, variant:batch.variant,
      count:batch.count, viewed:batch.viewed, notViewed:batch.notViewed
    }];
    return raw.map(x => {
      const count=Math.max(0,Number(x.count)||0);
      const viewed=Math.min(count,Math.max(0,Number(x.viewed)||0));
      const notViewed=Math.min(count-viewed,Math.max(0,Number(x.notViewed)||0));
      return {region:normalizeRegion(x.region),country:String(x.country||''),channel:String(x.channel||'Inne'),
        variant:variants.includes(x.variant)?x.variant:'Bez oznaczenia',count,viewed,notViewed,
        unknown:count-viewed-notViewed};
    });
  }
  function normalizedInput(input, date=new Date()) {
    const occurredOn=String(input.occurredOn||today(date));
    const startedAt=String(input.startedAt||'').trim(),endedAt=String(input.endedAt||'').trim();
    if(!validDate(occurredOn)||occurredOn>today(date)|| (startedAt&&!validClock(startedAt)) || (endedAt&&!validClock(endedAt)) || (endedAt&&!startedAt)){
      notify('Sprawdź datę i godziny. Czas zakończenia wymaga godziny rozpoczęcia.');return null;
    }
    const raw=Array.isArray(input.segments)&&input.segments.length?input.segments:[input];
    if(raw.length>100){notify('Jedna sesja może zawierać maksymalnie 100 grup.');return null}
    const segments=[];
    for(const r of raw){
      const count=Number(r.count),viewed=Number(r.viewed??0),notViewed=Number(r.notViewed??0);
      const region=normalizeRegion(r.region),channel=String(r.channel||''),variant=String(r.variant||'Bez oznaczenia');
      if(!validCount(count)||!integer(viewed)||!integer(notViewed)||viewed+notViewed>count||
        !regions.includes(region)||!channels.includes(channel)||!variants.includes(variant)){
          notify('Sprawdź podziały: liczby muszą być całkowite, a wyświetlone + niewyświetlone nie mogą przekroczyć wysłanych.');return null;
      }
      segments.push({region,country:String(r.country||'').trim().slice(0,100),channel,variant,count,viewed,notViewed});
    }
    const count=segments.reduce((n,r)=>n+r.count,0);
    if(!validCount(count)){notify('W jednej sesji możesz zapisać od 1 do 10 000 wiadomości.');return null}
    const same=k=>segments.every(r=>r[k]===segments[0][k])?segments[0][k]:'';
    const timeZone=String(input.timeZone||tz()).trim().slice(0,100);
    if(timeZone && !/^[A-Za-z0-9_+\/-]{1,100}$/.test(timeZone)){notify('Nieprawidłowa strefa czasowa.');return null}
    return {count,segments,occurredOn,startedAt,endedAt,timeZone,
      region:same('region')||'Wiele regionów',channel:same('channel')||'Wiele kanałów',
      country:same('country'),variant:same('variant')||'Mix A/B',
      campaign:String(input.campaign||'').trim().slice(0,120),notes:String(input.notes||'').trim().slice(0,500),
      at:`${occurredOn}T${startedAt||'12:00'}:00`};
  }

  function dates(period, date = new Date()) {
    if (period === 'all') return {start:'0000-01-01', end:'9999-12-31', label:'Cała historia'};
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (period === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    else d.setDate(d.getDate() - 29);
    return {start:today(d), end:today(date), label:period === 'week' ? 'Ten tydzień' : 'Ostatnie 30 dni'};
  }
  const inside = (v,r) => !!v && String(v).slice(0,10) >= r.start && String(v).slice(0,10) <= r.end;
  const num = n => new Intl.NumberFormat('pl-PL',{maximumFractionDigits:0}).format(n);
  const percent = (n, d) => d ? (n / d * 100).toFixed(1).replace('.',',') + '%' : '—';
  const money = (n, currency) => `${new Intl.NumberFormat('pl-PL',{maximumFractionDigits:2}).format(n)} ${safe(currency)}`;
  const groups = items => {
    const out = new Map();
    for (const {currency, amount} of items) {
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const code = String(currency || 'PLN').toUpperCase();
      out.set(code, (out.get(code) || 0) + amount);
    }
    return Array.from(out, ([currency,amount]) => ({currency, amount}));
  };
  const amounts = items => groups(items).map(v => money(v.amount, v.currency)).join(' · ') || '—';
  const viewDays = period => dates(period || periodFilter);
  function summary(data = db, period = periodFilter, date = new Date()) {
    const range = dates(period, date);
    const batches = activeBatches(data).filter(a => inside(batchDate(a), range));
    const byRegion = Object.fromEntries(regions.map(r => [r,0]));
    const byChannel = Object.fromEntries(channels.map(c => [c,0]));
    const byOperator = {Kari:0, Adi:0};
    let outreach=0,viewed=0,notViewed=0,unknown=0;
    const byVariant=Object.fromEntries(variants.map(v=>[v,{count:0,viewed:0,notViewed:0,unknown:0}]));
    const byHour={}; const byDay={};
    for(const a of batches){
      for(const seg of segmentsOf(a)){
        if(!seg.count)continue;
        outreach+=seg.count;viewed+=seg.viewed;notViewed+=seg.notViewed;unknown+=seg.unknown;
        byRegion[seg.region]=(byRegion[seg.region]||0)+seg.count;
        byChannel[seg.channel]=(byChannel[seg.channel]||0)+seg.count;
        byOperator[a.owner]=(byOperator[a.owner]||0)+seg.count;
        const v=byVariant[seg.variant] || (byVariant[seg.variant]={count:0,viewed:0,notViewed:0,unknown:0});
        for(const k of ['count','viewed','notViewed','unknown'])v[k]+=seg[k];
        const day=batchDate(a);byDay[day]=(byDay[day]||0)+seg.count;
        if(validClock(a.startedAt)){
          const hour=a.startedAt.slice(0,2),key=`${hour}:00`;
          const h=byHour[key]||(byHour[key]={count:0,viewed:0,notViewed:0,unknown:0});
          for(const k of ['count','viewed','notViewed','unknown'])h[k]+=seg[k];
        }
      }
    }
    const leads = (data.leads || []).filter(l => !l.archivedAt && window.SWLite?.qualified(l));
    const newLeads = leads.filter(l => inside(l.interestedAt || l.createdAt,range));
    const won = leads.filter(l => window.SWLite.stageOf(l) === 'Wygrany');
    const finished = leads.filter(l => ['Wygrany','Zamknięty'].includes(window.SWLite.stageOf(l)));
    const calls = new Set((data.leadActivities || []).filter(a => a.type === 'call' && a.leadId && !a.archivedAt && inside(a.at || a.occurredOn,range)).map(a => String(a.leadId)));
    const proposals = new Set((data.leadActivities || []).filter(a => a.type === 'proposal' && a.leadId && !a.archivedAt && inside(a.at || a.occurredOn,range)).map(a => String(a.leadId)));
    const payments = (data.payments || []).filter(p => !p.archivedAt);
    const received = [], pending = [];
    for (const p of payments) {
      const full = Math.max(0,Number(p.amount || 0));
      const already = Math.max(0,Number(p.receivedAmount || 0));
      const paid = p.status === 'Otrzymana' ? (already || full) : already;
      // receivedAmount is a lifetime partial amount; only date-bound when a payment date exists.
      const cashDate = p.paidAt || p.receivedAt || p.updatedAt || p.date || '';
      if (paid > 0 && (inside(cashDate,range) || (period === 'all' && !cashDate))) received.push({currency:p.currency,amount:paid});
      // pending is a CURRENT position, not date-bounded earnings.
      if (p.status !== 'Otrzymana' && full > already) pending.push({currency:p.currency,amount:full-already});
    }
    const receivedAll=[]; const expenses=[];
    for(const p of payments) {const full=Math.max(0,Number(p.amount||0)),partial=Math.max(0,Number(p.receivedAmount||0)),paid=p.status==='Otrzymana'?(partial||full):partial; if(paid>0)receivedAll.push({currency:p.currency,amount:paid})}
    for(const e of (data.expenses||[]).filter(x=>!x.archivedAt&&inside(x.date||x.createdAt||'',range)))expenses.push({currency:e.currency,amount:Math.max(0,Number(e.amount||0))});
    const open = leads.filter(l => !['Wygrany','Zamknięty'].includes(window.SWLite.stageOf(l)));
    const pipeline = open.map(l => ({currency:l.currency || 'PLN',amount:Math.max(0, Number(l.amount || 0))}));
    const wonValues = won.map(l=>({currency:l.currency || 'PLN',amount:Math.max(0,Number(l.amount || 0))}));
    const pendingFollowups = open.filter(l => (l.next || l.nextDate || '') && (l.next || l.nextDate || '') <= today(date));
    const noNext = open.filter(l => !l.next && !l.nextDate);
    const proposalsAtRisk = open.filter(l => ['Oferta','Finalizacja'].includes(window.SWLite.stageOf(l)) && (!(l.next || l.nextDate) || (l.next || l.nextDate) <= today(date)));
    return {range,batches,outreach,viewed,notViewed,unknown,byVariant,byHour,byDay,byRegion,byChannel,byOperator,newLeads,leads,won,finished,calls,proposals,received,receivedAll,expenses,pending,pipeline,wonValues,open,pendingFollowups,noNext,proposalsAtRisk};
  }
  let periodFilter = 'week';
  const canWrite = () => {if (cloudConfigured && !cloudActive) {notify('Zaloguj się do Supabase przed zapisem');return false}return true};
  function saveGrowth(message) {activity('sales', message);const p = save();if(p?.catch)p.catch(()=>{});render()}
  function alreadyEarned(owner, day) {
    return allBatches(db).filter(a => a.owner === owner && a.createdAt?.slice(0,10) === day)
      .reduce((sum,a) => sum + Number(a.xpAwarded || 0),0);
  }
  function createBatch(input,date=new Date()) {
    if(!canWrite())return false;
    const payload=normalizedInput(input,date);if(!payload)return false;
    const owner=user||'Kari',day=today(date);
    const xpAwarded=payload.occurredOn===day?Math.max(0,Math.min(payload.count,100-alreadyEarned(owner,day))):0;
    const batch={id:uid(),type:'outreach_batch',...payload,createdAt:now(),owner,xpAwarded};
    db.leadActivities??=[];db.xp??={Kari:0,Adi:0};
    db.leadActivities.push(batch);db.xp[owner]=Number(db.xp[owner]||0)+xpAwarded;
    saveGrowth(`Zalogowano ${payload.count} outreach / ${payload.segments.length} grup / ${payload.channel}`);
    notify(`Outreach +${num(payload.count)}${xpAwarded?` · +${xpAwarded} XP`:''}`);
    return batch;
  }
  function updateBatch(batchId,input) {
    if(!canWrite())return false;
    const b=allBatches(db).find(a=>String(a.id)===String(batchId));if(!b||b.archivedAt)return false;
    // Legacy edit API also accepts the old single-region shape.
    const payload=normalizedInput(input);if(!payload)return false;
    Object.assign(b,payload,{editedAt:now(),editedBy:user});
    saveGrowth('Poprawiono sesję outreach');notify('Zapisano korektę. XP bez zmian.');return true;
  }
  function archiveBatch(id) {
    if (!canWrite())return false;
    const b = allBatches(db).find(a=>String(a.id)===String(id));if(!b || b.archivedAt)return false;
    if (!confirm('Archiwizować tę sesję outreach? Liczby znikną ze statystyk, ale historia zostanie zachowana.'))return false;
    b.archivedAt = now();b.archivedBy = user;
    saveGrowth('Archiwizowano sesję outreach');notify('Przeniesiono do archiwum');return true;
  }
  function action(action,label,id='') {return `<button type="button" class="lite-action" data-growth="${safe(action)}" data-id="${safe(id)}">${safe(label)}</button>`}
  const opt = (items,value) => items.map(x => `<option value="${safe(x)}" ${x===value?'selected':''}>${safe(x)}</option>`).join('');
  const segmentHtml=(seg={},index=0)=>`<div class="growth-segment" data-growth-segment>
    <div class="growth-segment-heading"><span>GRUPA <b data-segment-number>${index+1}</b></span><button type="button" class="lite-action" data-growth-row="remove">Usuń grupę</button></div>
    <div class="growth-segment-fields"><label>Wysłane<input name="segmentCount" aria-label="Liczba wysłanych" type="number" min="1" max="10000" step="1" required value="${seg.count??''}" placeholder="np. 3"></label>
    <label>Region<select name="segmentRegion">${opt(regions,normalizeRegion(seg.region)||'Europa')}</select></label>
    <label>Kraj · opcjonalnie<input name="segmentCountry" maxlength="100" value="${safe(seg.country||'')}" placeholder="np. USA"></label>
    <label>Kanał<select name="segmentChannel">${opt(channels,seg.channel||'WhatsApp')}</select></label>
    <label>Wiadomość<select name="segmentVariant">${opt(variants,seg.variant||'A')}</select></label>
    <label>Wyświetlone<input name="segmentViewed" type="number" min="0" step="1" required value="${seg.viewed??0}"></label>
    <label>Niewyświetlone · potwierdzone<input name="segmentNotViewed" type="number" min="0" step="1" required value="${seg.notViewed??0}"></label></div>
    <small class="growth-segment-status" data-growth-segment-status>Reszta to status nieznany — nie liczymy jej jako niewyświetlonych.</small>
  </div>`;
  function updateFormTotals(){
    const wrap=$('liteDialog');if(!wrap)return;
    let count=0,viewed=0,notViewed=0;
    const rows=[...wrap.querySelectorAll('[data-growth-segment]')];
    rows.forEach((row,i)=>{
      row.querySelector('[data-segment-number]').textContent=String(i+1);
      const n=Number(row.querySelector('[name="segmentCount"]').value||0);
      const v=Number(row.querySelector('[name="segmentViewed"]').value||0);
      const u=Number(row.querySelector('[name="segmentNotViewed"]').value||0);
      count+=n;viewed+=v;notViewed+=u;
      const good=Number.isInteger(n)&&n>0&&Number.isInteger(v)&&v>=0&&Number.isInteger(u)&&u>=0&&v+u<=n;
      row.classList.toggle('growth-invalid',!good);
      row.querySelector('[data-growth-segment-status]').textContent=good?`${n-v-u} ze statusem nieznanym`:'Sprawdź liczbę wiadomości i wyniki';
      row.querySelector('[data-growth-row="remove"]').disabled=rows.length===1;
    });
    const total=$('growthFormTotals');if(total){const unknown=count-viewed-notViewed;total.innerHTML=`<strong>${num(count)}</strong> wysłanych <span>· ${num(viewed)} wyświetlonych · ${num(notViewed)} niewyświetlonych · ${num(Math.max(0,unknown))} nieznanych</span>`;}
  }
  function form(batch=null,focusResults=false){
    if(!canWrite())return;
    const editing=!!batch;
    const segments=editing?segmentsOf(batch):[{region:'Europa',channel:'WhatsApp',variant:'A',count:'',viewed:0,notViewed:0}];
    window.SWLite.openDialog(editing?'Edytuj sesję outreach':'Zapisz sesję outreach',`<p class="lite-modal-intro">Podziel jedną sesję na grupy według regionu, kanału i wersji wiadomości. Statusy wyświetlenia aktualizujesz ręcznie — nie mamy automatycznego dostępu do potwierdzeń WhatsApp/Instagram.</p>
      <form class="fields" id="growthForm"><div class="growth-form-top"><label>Data wysyłki<input type="date" name="occurredOn" required max="${today()}" value="${safe(batch?.occurredOn||today())}"></label>
      <label>Od godziny<input type="time" name="startedAt" value="${safe(batch?.startedAt||(editing?'':clock(new Date())))}"></label>
      <label>Do godziny · opcjonalnie<input type="time" name="endedAt" value="${safe(batch?.endedAt||'')}"></label></div>
      <div class="growth-partition-head"><div><strong>Podział wiadomości</strong><small>Przykład: 3 North America + 2 Asia + 5 Europa</small></div><button class="lite-action" data-growth-row="add" type="button">+ Dodaj region / wariant</button></div>
      <div id="growthSegments">${segments.map((v,i)=>segmentHtml(v,i)).join('')}</div>
      <div class="growth-form-total" id="growthFormTotals" role="status"></div>
      <details class="lite-advanced"><summary>Dane do analizy (opcjonalne)</summary><label>Kampania / nazwa testu<input maxlength="120" name="campaign" value="${safe(batch?.campaign||'')}" placeholder="np. Personal Trainers November"></label>
      <label>Strefa czasowa wysyłki<input maxlength="100" name="timeZone" value="${safe(batch?.timeZone||(editing?'':tz()))}" placeholder="np. Europe/Warsaw"></label>
      <label>Notatki do eksperymentu<textarea name="notes" rows="2" maxlength="500" placeholder="np. Wersja A z personalizacją, B bez…">${safe(batch?.notes||'')}</textarea></label></details>
      <div class="lite-form-footer"><span>${editing?'Edycja nie nalicza dodatkowego XP.':`Operator: <strong>${safe(user||'—')}</strong> · max 100 XP dziennie`}</span><button class="btn" type="submit">${editing?'Zapisz zmiany':'Zapisz sesję'}</button></div>
      </form>`,(data,formEl)=>{
        const value=Object.fromEntries(data.entries());
        value.segments=[...formEl.querySelectorAll('[data-growth-segment]')].map(row=>({
          count:row.querySelector('[name="segmentCount"]').value,region:row.querySelector('[name="segmentRegion"]').value,
          country:row.querySelector('[name="segmentCountry"]').value,channel:row.querySelector('[name="segmentChannel"]').value,
          variant:row.querySelector('[name="segmentVariant"]').value,viewed:row.querySelector('[name="segmentViewed"]').value,
          notViewed:row.querySelector('[name="segmentNotViewed"]').value
        }));
        const result=editing?updateBatch(batch.id,value):createBatch(value);
        if(result)window.SWLite.closeDialog();
      });
    $('liteDialog')?.classList.add('growth-dialog');
    updateFormTotals();
    if(focusResults)$('growthSegments')?.querySelector('[name="segmentViewed"]')?.focus();
  }
  const csvCell=v=>{
    let t=String(v??'');
    if(/^[\s]*[=+@-]/.test(t))t="'"+t; // spreadsheet formula injection protection
    return '"'+t.replace(/"/g,'""')+'"';
  };
  function outreachCsv(data=db,period=periodFilter){
    const range=dates(period);
    const fields=['session_id','operator','date','start_time','end_time','time_zone','region','country','channel','variant','sent','viewed','confirmed_not_viewed','unknown','viewed_of_sent_pct','statuses_checked_pct','campaign','notes','created_at','edited_at'];
    const rows=activeBatches(data).filter(a=>inside(batchDate(a),range)).sort((a,b)=>batchDate(a).localeCompare(batchDate(b))).flatMap(batch=>segmentsOf(batch).map(seg=>[
      batch.id,batch.owner,batchDate(batch),batch.startedAt||'',batch.endedAt||'',batch.timeZone||'',seg.region,seg.country,seg.channel,seg.variant,
      seg.count,seg.viewed,seg.notViewed,seg.unknown,seg.count?(100*seg.viewed/seg.count).toFixed(2):'',
      seg.count?(100*(seg.viewed+seg.notViewed)/seg.count).toFixed(2):'',batch.campaign||'',batch.notes||'',batch.createdAt||'',batch.editedAt||''
    ]));
    return '\uFEFF'+[fields,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n');
  }
  function downloadCsv(){
    const s=outreachCsv();const blob=new Blob([s],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`sitewarrior-outreach-${periodFilter}-${today()}.csv`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Wyeksportowano dane do CSV');
  }
  function toggle(period) {periodFilter = ['week','month','all'].includes(period)?period:'week';render()}
  const selector = () => `<div class="growth-period">${[['week','Tydzień'],['month','30 dni'],['all','Całość']].map(([p,l])=>`<button type="button" class="${periodFilter===p?'active':''}" data-growth="period" data-period="${p}">${l}</button>`).join('')}</div>`;
  const card = (label,value,note) => `<div class="lite-kpi"><span>${safe(label)}</span><strong>${value}</strong><small>${safe(note)}</small></div>`;
  const barList = (data,denominator) => Object.entries(data).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([label,n])=>`<div class="growth-bar-row"><div><span>${safe(label)}</span><strong>${num(n)}</strong></div><div class="growth-bar-track"><span style="width:${denominator?Math.min(100,n/denominator*100):0}%"></span></div></div>`).join('') || '<p class="lite-footnote">Brak zapisanych sesji w tym okresie.</p>';
  const readRate=(v,total)=>total?percent(v,total):'—';
  const variantTable=s=>Object.entries(s.byVariant).filter(([,d])=>d.count>0).map(([v,d])=>`<div class="growth-test-row"><div class="growth-test-title"><strong>Wiadomość ${safe(v)}</strong><span>${num(d.count)} wysłanych</span></div><div class="growth-test-metrics"><div><strong>${num(d.viewed)}</strong><small>Wyświetlone</small></div><div><strong>${readRate(d.viewed,d.count)}</strong><small>Min. view rate</small></div><div><strong>${readRate(d.viewed+d.notViewed,d.count)}</strong><small>Zweryfikowane</small></div></div><div class="growth-bar-track"><span style="width:${d.count?100*d.viewed/d.count:0}%"></span></div></div>`).join('');
  function renderOutreach(){
    const s=summary(),last=s.batches.slice().sort((a,b)=>batchDate(b).localeCompare(batchDate(a))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const todayValue=activeBatches(db).filter(a=>batchDate(a)===today()).reduce((n,a)=>n+segmentsOf(a).reduce((m,x)=>m+x.count,0),0);
    const targetProgress=Math.min(100,todayValue/dayTarget*100);
    const todayOperators={Kari:0,Adi:0};for(const a of activeBatches(db).filter(a=>batchDate(a)===today()))todayOperators[a.owner]=(todayOperators[a.owner]||0)+segmentsOf(a).reduce((n,x)=>n+x.count,0);
    const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const day=today(d);return {day,value:activeBatches(db).filter(a=>batchDate(a)===day).reduce((n,a)=>n+segmentsOf(a).reduce((m,x)=>m+x.count,0),0)};});
    const hours=Object.entries(s.byHour).sort((a,b)=>a[0].localeCompare(b[0]));
    $('content').innerHTML=`<section class="lite-head"><div><div class="lite-overline">OUTBOUND / EXPERIMENT TRACKING</div><h1>Outreach Log</h1><p>Jedna sesja, wiele regionów. Mierz wyświetlenia, kanały, godzinę wysyłki oraz testy wiadomości A/B. Tylko zainteresowane odpowiedzi dodawaj jako leady do Sales.</p></div><div class="lite-head-action">${action('add','+ Nowa sesja')}</div></section>
      <div class="growth-toolbar">${selector()}<div class="growth-tool-actions">${action('export','Eksport CSV')}${action('go-sales','+ Zainteresowany lead → Sales')}</div></div>
      <section class="growth-target"><div class="growth-target-copy"><span class="lite-overline">DAILY OUTREACH TARGET</span><strong>${num(todayValue)} <span>/ ${num(dayTarget)} wiadomości dzisiaj</span></strong><small>${todayValue>=dayTarget?'Cel osiągnięty.':'Do celu pozostało '+num(dayTarget-todayValue)+'.'} Cel dotyczy łącznie Kari i Adiego. Kari: ${num(todayOperators.Kari||0)} · Adi: ${num(todayOperators.Adi||0)}.</small></div><div class="growth-target-meter"><div class="growth-bar-track"><span style="width:${targetProgress}%"></span></div><b>${readRate(Math.min(todayValue,dayTarget),dayTarget)} celu</b></div></section>
      <div class="lite-kpis growth-summary">${card('Wysłane wiadomości',num(s.outreach),'Wybrany okres')}${card('Wyświetlone',num(s.viewed),`Minimum ${readRate(s.viewed,s.outreach)} wysłanych`)}${card('Potwierdzone niewyświetlone',num(s.notViewed),'Nie mylić ze statusem nieznanym')}${card('Status nieznany',num(s.unknown),`${readRate(s.viewed+s.notViewed,s.outreach)} wyników sprawdzonych`)}</div>
      <div class="growth-two-cols"><section class="lite-surface"><div class="lite-section-heading"><div><span class="lite-overline">MESSAGE EXPERIMENTS</span><h2>A / B — porównanie wiadomości</h2></div></div>${variantTable(s)}<p class="lite-footnote">View rate to wyświetlone / wszystkie wysłane w danym wariancie, a nie odsetek odpowiedzi. Wyniki wpisuj ręcznie; porównuj warianty po podobnym czasie od wysyłki i przy podobnej liczbie zweryfikowanych statusów.</p></section>
      <section class="lite-surface"><div class="lite-section-heading"><div><span class="lite-overline">DAILY CONSISTENCY</span><h2>Ostatnie 7 dni / cel 50</h2></div></div>${days.map(d=>`<div class="growth-daily-row"><span>${safe(d.day.slice(5))}</span><div class="growth-bar-track"><span style="width:${Math.min(100,d.value/dayTarget*100)}%"></span></div><strong>${num(d.value)}</strong></div>`).join('')}<p class="lite-footnote">Plan dzienny = 50 wysłanych pierwszych wiadomości, niezależnie od liczby sesji i regionów.</p></section></div>
      <div class="growth-two-cols"><section class="lite-surface"><div class="lite-section-heading"><h2>Regiony</h2><span class="lite-overline">WOLUMEN</span></div>${barList(s.byRegion,s.outreach)}<div class="growth-split-foot">Kari: <strong>${num(s.byOperator.Kari||0)}</strong> · Adi: <strong>${num(s.byOperator.Adi||0)}</strong></div></section>
      <section class="lite-surface"><div class="lite-section-heading"><h2>Kanały</h2><span class="lite-overline">WHATSAPP / IG / EMAIL</span></div>${barList(s.byChannel,s.outreach)}</section></div>
      <section class="lite-surface"><div class="lite-section-heading"><div><span class="lite-overline">SEND TIME</span><h2>O jakich godzinach piszecie?</h2></div><span class="lite-footnote">Godziny zapisane lokalnie dla danej sesji</span></div>${hours.length?`<div class="growth-hours">${hours.map(([hour,d])=>`<div class="growth-hour"><strong>${safe(hour)}</strong><div class="growth-bar-track"><span style="width:${100*d.count/Math.max(...hours.map(x=>x[1].count),1)}%"></span></div><span>${num(d.count)} wys. · ${num(d.viewed)} wyśw.</span></div>`).join('')}</div>`:'<p class="lite-footnote">Starsze sesje nie miały zapisanej prawdziwej godziny. Pojawi się tu tylko outreach z wprowadzoną godziną wysyłki.</p>'}<p class="lite-footnote">Godziny różnych stref czasowych nie są tu przeliczane. Eksport zawiera strefę każdej sesji do prawidłowej analizy w arkuszu.</p></section>
      <section class="lite-surface"><div class="lite-section-heading"><div><span class="lite-overline">RECENT ACTIVITY</span><h2>Sesje i korekty wyników</h2></div><span class="lite-footnote">${num(s.batches.length)} sesji · kliknij Edytuj, żeby dopisać późniejsze wyświetlenia</span></div>
      ${last.slice(0,100).map(a=>{const segs=segmentsOf(a);const n=segs.reduce((v,x)=>v+x.count,0),v=segs.reduce((v,x)=>v+x.viewed,0),nv=segs.reduce((v,x)=>v+x.notViewed,0);
        return `<div class="growth-log-row"><div class="growth-count">${num(n)}</div><div class="growth-entry"><strong>${segs.map(x=>`${num(x.count)} ${safe(x.region)} / ${safe(x.channel)} / ${safe(x.variant)}`).join(' · ')}</strong><small>${safe(batchDate(a))}${a.startedAt?' · '+safe(a.startedAt):''}${a.endedAt?'–'+safe(a.endedAt):''} · ${safe(a.owner||'—')}${a.xpAwarded?' · +'+num(a.xpAwarded)+' XP':''}</small><small class="growth-outcomes">${num(v)} wyświetlonych · ${num(nv)} niewyświetlonych · ${num(Math.max(0,n-v-nv))} bez danych</small></div><div class="growth-log-actions">${action('results','Wyniki',a.id)}${action('edit','Edytuj',a.id)}${action('archive','Usuń',a.id)}</div></div>`}).join('')||'<div class="lite-empty"><strong>Brak sesji.</strong><p>Zacznij od dodania wysłanych wiadomości i podziału na regiony.</p></div>'}
      ${last.length>100?`<p class="lite-footnote">Pokazano 100 z ${last.length} sesji, podsumowanie obejmuje wszystkie.</p>`:''}
      <p class="lite-footnote">Starsze sesje zostały zachowane. Ich wyświetlenia, wariant wiadomości i prawdziwa godzina pozostają nieznane, dopóki nie uzupełnisz ich ręcznie. Żadnych leadów nie tworzymy automatycznie.</p></section>`;
  }
  function renderRadar() {
    const s=summary(), xp=db.xp||{}, current=Number(xp[user]||0), level=Math.floor(current/250)+1, progress=current%250/250*100;
    const confirmed=amounts(s.received), confirmedTotal=amounts(s.receivedAll), costs=amounts(s.expenses), pipeline=amounts(s.pipeline), outstanding=amounts(s.pending), wonAmounts=amounts(s.wonValues);
    const prepared = s.open.filter(l=>['Oferta','Finalizacja'].includes(window.SWLite.stageOf(l))).length;
    const conversions = s.outreach>0 ? (s.newLeads.length/s.outreach*100).toFixed(1).replace('.',',') : null;
    const byRegionLeads={};for(const l of s.newLeads){let r=l.region||regionFromMarket(l.market)||'Nieznany';byRegionLeads[r]=(byRegionLeads[r]||0)+1}
    $('content').innerHTML=`<section class="lite-head"><div><div class="lite-overline">REVENUE CONTROL / MONEY RADAR</div><h1>Make the money move.</h1><p>Zamieniaj outreach w zainteresowanych klientów, discovery w oferty, a oferty w realne wpłaty. XP za działania, pieniądze tylko po potwierdzeniu.</p></div><div class="lite-head-action">${action('go-outreach','+ Loguj outreach')}</div></section>
      <div class="growth-toolbar">${selector()}<span class="lite-footnote">${safe(s.range.label)} · ${safe(s.range.start)} – ${safe(s.range.end)}</span></div>
      <div class="lite-kpis growth-summary">${card('Wysłany outreach',num(s.outreach),'Zapisane zbiorczo')}${card('Nowi zainteresowani',num(s.newLeads.length),'Leady zarejestrowane w okresie')}${card('Discovery wykonane',num(s.calls.size),'Unikalne firmy / zdarzenia')}${card('Oferty wysłane',num(s.proposals.size),'Unikalne firmy / zdarzenia')}</div>
      <div class="growth-two-cols">
        <section class="lite-surface growth-hero-metric"><span class="lite-overline">CASH COLLECTED / ${safe(s.range.label)}</span><h2>Potwierdzone wpływy</h2><div class="growth-money">${confirmed}</div><p class="lite-footnote">Wpływy zaksięgowane w wybranym okresie. Łącznie od początku: <strong>${confirmedTotal}</strong>. Walut nie przeliczamy ani nie sumujemy.</p><div class="growth-divider"></div><div class="growth-metric-pair"><div><span>Oczekujące płatności (stan obecny)</span><strong>${outstanding}</strong></div><div><span>Wartość aktywnego pipeline'u (szacunki ofert)</span><strong>${pipeline}</strong></div></div><p class="lite-footnote">Zarejestrowane wydatki w tym okresie: ${costs}. To nie jest wyliczenie pełnego zysku.</p>${action('go-finance','Przejdź do płatności')}</section>
        <section class="lite-surface growth-xp-surface"><div class="lite-section-heading"><div><span class="lite-overline">OPERATOR PROGRESSION</span><h2>${safe(user||'Operator')} / LEVEL ${num(level)}</h2></div><strong>${num(current)} XP</strong></div><div class="growth-xp-track"><span style="width:${progress}%"></span></div><p class="lite-footnote">${num(250-current%250)} XP do następnego poziomu. Za bieżący outreach: 1 XP/wiadomość, maks. 100 XP dziennie. Za discovery +40, ofertę +60, wygraną +150 (jednorazowo na klienta). Zadania zachowują własne XP.</p><div class="growth-xp-people"><span>Kari <strong>${num(Number(xp.Kari||0))} XP</strong></span><span>Adi <strong>${num(Number(xp.Adi||0))} XP</strong></span></div></section>
      </div>
      <div class="growth-two-cols"><section class="lite-surface"><div class="lite-section-heading"><div><span class="lite-overline">SALES ENGINE</span><h2>Przepływ do przychodu</h2></div>${action('go-sales','Otwórz pipeline')}</div>
      <div class="growth-funnel"><div><strong>${num(s.outreach)}</strong><span>Wysłane wiadomości</span></div><div><strong>${num(s.newLeads.length)}</strong><span>Nowi zainteresowani</span></div><div><strong>${num(prepared)}</strong><span>Oferty / finalizacje (stan obecny)</span></div><div><strong>${num(s.won.length)}</strong><span>Wygrani (stan obecny)</span></div></div>
      <p class="lite-footnote">${conversions!==null?`Wskaźnik orientacyjny: ${conversions} nowo dodanych leadów na 100 zapisanych outreachów w tym samym okresie.`:'Wskaźnik leadów na 100 wiadomości pojawi się po zalogowaniu outreachu.'} To NIE jest rzeczywista konwersja kampanii: odpowiedzi mogą nadejść później, a pozyskanie leada może pochodzić z innego źródła.</p></section>
      <section class="lite-surface"><span class="lite-overline">PRIORITY / MONEY ON THE TABLE</span><h2>Co odblokuje przychód?</h2><div class="growth-signal"><strong>${num(s.proposalsAtRisk.length)}</strong><div>Oferty lub finalizacje wymagają reakcji<small>Bez kolejnego terminu albo termin minął</small></div></div><div class="growth-signal"><strong>${num(s.pendingFollowups.length)}</strong><div>Zaległe / dzisiejsze follow-upy<small>W aktywnym pipeline</small></div></div><div class="growth-signal"><strong>${num(s.noNext.length)}</strong><div>Aktywne leady bez next step<small>Uzupełnij termin i konkretną czynność</small></div></div><div class="growth-signal"><strong>${num(s.won.length)}</strong><div>Wygrane kontrakty<small>Wartość: ${wonAmounts}</small></div></div>${action('go-today','Zobacz kolejkę działań')}</section></div>
      <div class="growth-two-cols"><section class="lite-surface"><span class="lite-overline">MARKETS / WHERE WE WORK</span><h2>Gdzie robimy outreach?</h2>${barList(s.byRegion,s.outreach)}<div class="growth-region-compare"><strong>Nowi zainteresowani według regionu</strong>${Object.entries(byRegionLeads).map(([r,c])=>`<div><span>${safe(r)}</span><b>${num(c)}</b></div>`).join('')||'<p class="lite-footnote">Brak danych o regionie leadów.</p>'}</div><p class="lite-footnote">Te leady nie są automatycznie powiązane z konkretnymi sesjami outreach.</p></section><section class="lite-surface"><span class="lite-overline">CHANNELS / DISTRIBUTION</span><h2>Który kanał testujemy?</h2>${barList(s.byChannel,s.outreach)}<p class="lite-footnote">Porównaj wolumen, ale skuteczność kanału oceń dopiero po przypisaniu źródła w karcie zainteresowanego klienta i odpowiednim czasie na odpowiedź.</p></section></div>`;
  }
  function rewardSalesEvent(lead,type) {
    const reward={call:40,proposal:60}; if(!reward[type])return 0;
    const already=(db.leadActivities||[]).some(a=>a.leadId===lead.id && a.type===type && a.xpAwarded>0);
    if(already)return 0;
    // Legacy events may already exist: don't grant XP again for doing the same milestone twice.
    const historical=(db.leadActivities||[]).filter(a=>a.leadId===lead.id&&a.type===type);
    if(historical.length>1)return 0;
    db.xp ??= {Kari:0,Adi:0};db.xp[user||lead.owner||'Kari']=(Number(db.xp[user||lead.owner||'Kari']||0)+reward[type]);
    return reward[type];
  }
  function rewardWin(lead) {
    if(lead.xpWinAwarded)return 0;
    lead.xpWinAwarded=150;db.xp ??= {Kari:0,Adi:0};const owner=user||lead.owner||'Kari';db.xp[owner]=Number(db.xp[owner]||0)+150;return 150;
  }
  document.addEventListener('click',event=>{
    const rowBtn=event.target.closest?.('[data-growth-row]');if(!rowBtn)return;
    event.preventDefault();
    const container=$('growthSegments');if(!container)return;
    if(rowBtn.dataset.growthRow==='add')container.insertAdjacentHTML('beforeend',segmentHtml({},container.querySelectorAll('[data-growth-segment]').length));
    else if(container.querySelectorAll('[data-growth-segment]').length>1)rowBtn.closest('[data-growth-segment]')?.remove();
    updateFormTotals();
  });
  document.addEventListener('input',event=>{if(event.target.closest?.('#growthForm'))updateFormTotals()});
  document.addEventListener('change',event=>{if(event.target.closest?.('#growthForm'))updateFormTotals()});
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-growth]');if(!el)return;
    event.preventDefault();
    switch(el.dataset.growth){
      case 'add':form();break;
      case 'edit':form(allBatches(db).find(x=>String(x.id)===el.dataset.id));break;
      case 'results':form(allBatches(db).find(x=>String(x.id)===el.dataset.id),true);break;
      case 'archive':archiveBatch(el.dataset.id);break;
      case 'period':toggle(el.dataset.period);break;
      case 'export':downloadCsv();break;
      case 'go-sales':navigate('sales');break;
      case 'go-outreach':navigate('outreach');break;
      case 'go-finance':navigate('finance');break;
      case 'go-today':navigate('dashboard');break;
    }
  });
  window.SWGrowth={regions,normalizeRegion,channels,variants,dates,summary,segmentsOf,outreachCsv,createBatch,updateBatch,archiveBatch,renderOutreach,renderRadar,rewardSalesEvent,rewardWin,openForm:form};
})();
