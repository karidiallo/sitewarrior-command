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
  const regionFromMarket = market => ({PL:'Europa',NO:'Europa',FR:'Europa',DE:'Europa',UK:'Europa',USCA:'North America',AF:'Africa',APAC:'Asia'})[market] || '';
  const activeBatches = data => (data.leadActivities || []).filter(a => a.type === 'outreach_batch' && !a.archivedAt);
  const allBatches = data => (data.leadActivities || []).filter(a => a.type === 'outreach_batch');
  const batchDate = a => a.occurredOn || String(a.at || '').slice(0,10);
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T12:00:00Z').getTime()) && new Date(v + 'T12:00:00Z').toISOString().slice(0,10) === v;
  const validCount = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 10000;
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
    let outreach = 0;
    for (const a of batches) {
      const n = Number(a.count || 0);
      if (!Number.isFinite(n) || n < 1) continue;
      outreach += n;
      const regionKey = normalizeRegion(a.region); byRegion[regionKey] = (byRegion[regionKey] || 0) + n;
      byChannel[a.channel] = (byChannel[a.channel] || 0) + n;
      byOperator[a.owner] = (byOperator[a.owner] || 0) + n;
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
    return {range,batches,outreach,byRegion,byChannel,byOperator,newLeads,leads,won,finished,calls,proposals,received,receivedAll,expenses,pending,pipeline,wonValues,open,pendingFollowups,noNext,proposalsAtRisk};
  }
  let periodFilter = 'week';
  const canWrite = () => {if (cloudConfigured && !cloudActive) {notify('Zaloguj się do Supabase przed zapisem');return false}return true};
  function saveGrowth(message) {activity('sales', message);const p = save();if(p?.catch)p.catch(()=>{});render()}
  function alreadyEarned(owner, day) {
    return allBatches(db).filter(a => a.owner === owner && a.createdAt?.slice(0,10) === day)
      .reduce((sum,a) => sum + Number(a.xpAwarded || 0),0);
  }
  function createBatch(input, date = new Date()) {
    if (!canWrite()) return false;
    const count = Number(input.count), occurredOn = String(input.occurredOn || today(date));
    const region = String(input.region || ''), channel = String(input.channel || '');
    if (!validCount(count)) {notify('Podaj liczbę od 1 do 10 000');return false}
    if (!regions.includes(region) || !channels.includes(channel) || !validDate(occurredOn) || occurredOn > today(date)) {notify('Sprawdź region, kanał i datę');return false}
    const owner = user || 'Kari';
    const day = today(date);
    const xpAwarded = occurredOn === day ? Math.max(0,Math.min(count, 100 - alreadyEarned(owner,day))) : 0;
    const batch = {id:uid(),type:'outreach_batch',count,region,channel,
      country:String(input.country || '').trim().slice(0,100),occurredOn,
      at:occurredOn+'T12:00:00',createdAt:now(),owner,xpAwarded};
    db.leadActivities ??= []; db.xp ??= {Kari:0,Adi:0};
    db.leadActivities.push(batch);db.xp[owner] = Number(db.xp[owner] || 0) + xpAwarded;
    saveGrowth(`Zalogowano ${count} outreach / ${region} / ${channel}`);
    notify(`Outreach +${num(count)}${xpAwarded ? ` · +${xpAwarded} XP` : ''}`);
    return batch;
  }
  function updateBatch(batchId,input) {
    if (!canWrite()) return false;
    const b = allBatches(db).find(a => String(a.id) === String(batchId)); if (!b || b.archivedAt) return false;
    const count = Number(input.count), occurredOn = String(input.occurredOn || '');
    const region = String(input.region || ''),channel = String(input.channel || '');
    if (!validCount(count) || !regions.includes(region) || !channels.includes(channel) || !validDate(occurredOn) || occurredOn > today()) {notify('Sprawdź dane sesji');return false}
    Object.assign(b,{count,region,channel,country:String(input.country||'').trim().slice(0,100),occurredOn,at:occurredOn+'T12:00:00',editedAt:now(),editedBy:user});
    saveGrowth('Poprawiono sesję outreach'); notify('Zmieniono wpis; XP pozostaje bez zmian');return true;
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
  function form(batch=null) {
    if(!canWrite())return;
    const editing = !!batch;
    window.SWLite.openDialog(editing?'Popraw sesję outreach':'Zapisz wykonany outreach',`<p class="lite-modal-intro">Jeden wpis = liczba rzeczywiście wysłanych pierwszych wiadomości. Bez listy firm i bez tworzenia leadów.</p>
      <form class="fields">
        <label>Ile wiadomości wysłaliście?<input type="number" min="1" max="10000" step="1" name="count" required value="${editing?safe(batch.count):''}" placeholder="np. 40"></label>
        <label>Region<select name="region">${opt(regions,normalizeRegion(batch?.region)||'Europa')}</select></label>
        <label>Kanał<select name="channel">${opt(channels,batch?.channel||'WhatsApp')}</select></label>
        <label>Data wysyłki<input type="date" name="occurredOn" required max="${today()}" value="${safe(batch?.occurredOn||today())}"></label>
        <details class="lite-advanced"><summary>Doprecyzuj kraj (opcjonalnie)</summary><label>Kraj<input maxlength="100" name="country" placeholder="np. Norwegia" value="${safe(batch?.country||'')}"></label></details>
        <div class="lite-form-footer"><span>${editing?'Poprawka nie przyznaje nowego XP.':`Operator: <strong>${safe(user||'—')}</strong> · max 100 XP/dzień za outreach`}</span><button class="btn" type="submit">${editing?'Zapisz korektę':'Zapisz outreach'}</button></div>
      </form>`,data=>{const value=Object.fromEntries(data.entries());const result=editing?updateBatch(batch.id,value):createBatch(value);if(result)window.SWLite.closeDialog()});
  }
  function toggle(period) {periodFilter = ['week','month','all'].includes(period)?period:'week';render()}
  const selector = () => `<div class="growth-period">${[['week','Tydzień'],['month','30 dni'],['all','Całość']].map(([p,l])=>`<button type="button" class="${periodFilter===p?'active':''}" data-growth="period" data-period="${p}">${l}</button>`).join('')}</div>`;
  const card = (label,value,note) => `<div class="lite-kpi"><span>${safe(label)}</span><strong>${value}</strong><small>${safe(note)}</small></div>`;
  const barList = (data,denominator) => Object.entries(data).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([label,n])=>`<div class="growth-bar-row"><div><span>${safe(label)}</span><strong>${num(n)}</strong></div><div class="growth-bar-track"><span style="width:${denominator?Math.min(100,n/denominator*100):0}%"></span></div></div>`).join('') || '<p class="lite-footnote">Brak zapisanych sesji w tym okresie.</p>';
  function renderOutreach() {
    const s=summary(), last=s.batches.slice().sort((a,b)=>batchDate(b).localeCompare(batchDate(a)) || String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    $('content').innerHTML = `<section class="lite-head"><div><div class="lite-overline">OUTBOUND / ACTIVITY COUNTER</div><h1>Outreach Log</h1><p>Zapisuj ilość wysłanych pierwszych wiadomości, region i kanał. Nie musisz wpisywać firm. Kiedy ktoś odpowie „sure” i jest zainteresowany, dodaj go w Sales.</p></div><div class="lite-head-action">${action('add','+ Zapisz outreach')}</div></section>
      <div class="growth-toolbar">${selector()}<button class="lite-action" data-growth="go-sales">+ Zainteresowany lead → Sales</button></div>
      <div class="lite-kpis growth-summary">${card('Wysłane wiadomości',num(s.outreach),'Łącznie w wybranym okresie')}${card('Kari',num(s.byOperator.Kari),'Zaliczony outreach')}${card('Adi',num(s.byOperator.Adi),'Zaliczony outreach')}${card('Sesje outreach',num(s.batches.length),'Zapisane zbiorczo')}</div>
      <div class="growth-two-cols"><section class="lite-surface"><div class="lite-section-heading"><h2>Regiony</h2><span class="lite-overline">WOLUMEN</span></div>${barList(s.byRegion,s.outreach)}</section>
      <section class="lite-surface"><div class="lite-section-heading"><h2>Kanały</h2><span class="lite-overline">IG / WA / EMAIL</span></div>${barList(s.byChannel,s.outreach)}</section></div>
      <section class="lite-surface"><div class="lite-section-heading"><div><span class="lite-overline">RECENT ACTIVITY</span><h2>Zapisane sesje</h2></div><span class="lite-footnote">Najpierw najnowsze</span></div>
      ${last.slice(0,100).map(a=>`<div class="growth-log-row"><div class="growth-count">${num(a.count)}</div><div class="growth-entry"><strong>${safe(normalizeRegion(a.region))} · ${safe(a.channel)}${a.country?' · '+safe(a.country):''}</strong><small>${safe(batchDate(a))} · ${safe(a.owner||'—')}${a.xpAwarded?' · +'+num(a.xpAwarded)+' XP':''}</small></div><div class="growth-log-actions">${action('edit','Edytuj',a.id)}${action('archive','Usuń',a.id)}</div></div>`).join('')||'<div class="lite-empty"><strong>Nie ma jeszcze logów.</strong><p>Po wysłaniu wiadomości zapisz liczbę, region i kanał w jednym wpisie.</p></div>'}
      ${last.length>100?`<p class="lite-footnote">Pokazano 100 z ${last.length} sesji. Statystyki obejmują wszystkie.</p>`:''}
      <p class="lite-footnote">Wpisy typu „outreach batch” są niezależne od CRM. Historyczne pojedyncze aktywności zostały zachowane, ale nie są automatycznie doliczane do nowego licznika — unikamy podwójnego liczenia.</p></section>`;
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
    const el=event.target.closest?.('[data-growth]');if(!el)return;
    event.preventDefault();
    switch(el.dataset.growth){
      case 'add':form();break;
      case 'edit':form(allBatches(db).find(x=>String(x.id)===el.dataset.id));break;
      case 'archive':archiveBatch(el.dataset.id);break;
      case 'period':toggle(el.dataset.period);break;
      case 'go-sales':navigate('sales');break;
      case 'go-outreach':navigate('outreach');break;
      case 'go-finance':navigate('finance');break;
      case 'go-today':navigate('dashboard');break;
    }
  });
  window.SWGrowth={regions,normalizeRegion,channels,dates,summary,createBatch,updateBatch,archiveBatch,renderOutreach,renderRadar,rewardSalesEvent,rewardWin,openForm:form};
})();
