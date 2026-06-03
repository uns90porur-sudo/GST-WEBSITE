'use strict';
// ═══════════════════════════════════════════════
//  NexCA — CA Practice Suite
//  app.js — All features, fully functional
// ═══════════════════════════════════════════════

const DB_KEY   = 'nexca_clients';
const ACT_KEY  = 'nexca_activity';
const CRED_KEY = 'nexca_credentials';
const PROF_KEY = 'nexca_profile';

let customers    = JSON.parse(localStorage.getItem(DB_KEY)  || '[]');
let activity     = JSON.parse(localStorage.getItem(ACT_KEY) || '[]');
let profile      = JSON.parse(localStorage.getItem(PROF_KEY)|| '{}');
let selectedIds  = new Set();
let currentView  = 'dashboard';

window.API = 'http://127.0.0.1:3000';

// ── Save ──
function save() {
  localStorage.setItem(DB_KEY,  JSON.stringify(customers));
  localStorage.setItem(ACT_KEY, JSON.stringify(activity));
}
function saveCreds(creds) { localStorage.setItem(CRED_KEY, JSON.stringify(creds)); }

// ── Utility ──
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':'&quot;'}[c]));
}
function fmt(n, digits=2) { return Number(n||0).toLocaleString('en-IN', {minimumFractionDigits:digits, maximumFractionDigits:digits}); }
function fmtINR(n) { return '₹' + fmt(n); }
const COLORS = ['#0f2044','#059669','#d97706','#2563eb','#e11d48','#7c3aed','#0891b2','#c9922e'];
function avColor(name) { let h=0; for(const c of (name||'?')) h=(h*31+c.charCodeAt(0))&0xffff; return COLORS[h%COLORS.length]; }
function avInitial(name) { return (name||'?').trim()[0].toUpperCase(); }
function formatType(t) { return t==='gst'?'GST Only':t==='it'?'IT Only':'GST & IT'; }
function badgeType(t) { return `<span class="badge b-${t}">${formatType(t)}</span>`; }
function log(client, type, action, status='completed') {
  activity.unshift({client, type, action, status, date: new Date().toLocaleString('en-IN')});
  if (activity.length > 20) activity.pop();
  save();
}

// ═══════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════
const BREADCRUMBS = { dashboard:'Dashboard', clients:'All Clients', gst:'GST Filings', it:'IT Returns', fees:'Fee Tracker', calculator:'Tax Calculators', folders:'Network Folders', settings:'Settings' };

function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link[data-view]').forEach(l => l.classList.remove('active'));
  const sec = document.getElementById('view-' + view);
  if (sec) sec.classList.add('active');
  const lnk = document.querySelector(`.nav-link[data-view="${view}"]`);
  if (lnk) lnk.classList.add('active');
  document.getElementById('breadcrumb').textContent = BREADCRUMBS[view] || view;
  currentView = view;
  if (view === 'dashboard')   initDashboard();
  if (view === 'clients')     renderClientsView();
  if (view === 'gst')         renderGstView();
  if (view === 'it')          renderItView();
  if (view === 'fees')        renderFeeView();
  if (view === 'calculator')  { calcGST(); calcTDS(); }
  if (view === 'settings')    loadSettings();
}

document.querySelectorAll('.nav-link[data-view]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); navigateTo(l.dataset.view); });
});

// ═══════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'k') { e.preventDefault(); document.getElementById('global-search').focus(); }
  if (ctrl && e.key === 'n') { e.preventDefault(); openAddClient(); }
  if (ctrl && e.key === 'd') { e.preventDefault(); navigateTo('dashboard'); }
  if (ctrl && e.key === 'g') { e.preventDefault(); navigateTo('gst'); }
  if (ctrl && e.key === 't') { e.preventDefault(); navigateTo('it'); }
  if (ctrl && e.key === 'm') { e.preventDefault(); openCalendar(); }
  if (ctrl && e.key === 'b') { e.preventDefault(); openBulkWa(); }
  if (ctrl && e.key === 'e') { e.preventDefault(); exportExcel(); }
  if (ctrl && e.key === '/')  { e.preventDefault(); openOverlay('shortcuts-overlay'); }
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay:not(.hidden)').forEach(o => o.classList.add('hidden'));
    document.getElementById('notif-panel')?.classList.add('hidden');
  }
});

// ── Search ──
document.getElementById('global-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  if (!q) return;
  if (currentView !== 'clients') navigateTo('clients');
  renderClientsView();
});

// ═══════════════════════════════════════════════
//  OVERLAYS
// ═══════════════════════════════════════════════
window.openOverlay  = id => document.getElementById(id)?.classList.remove('hidden');
window.closeOverlay = id => document.getElementById(id)?.classList.add('hidden');

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden'); });
});

// ═══════════════════════════════════════════════
//  SIDEBAR COLLAPSE
// ═══════════════════════════════════════════════
document.getElementById('sb-collapse-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// ═══════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════
window.toggleTheme = function(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('theme-toggle').checked = dark;
  const st = document.getElementById('s-dark-toggle');
  if (st) st.checked = dark;
  localStorage.setItem('nexca_theme', dark ? 'dark' : 'light');
};
(function() {
  const saved = localStorage.getItem('nexca_theme');
  if (saved === 'dark') toggleTheme(true);
})();

// ═══════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════
let pieInst, barInst;

function initDashboard() {
  // Greeting
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning! 🌅' : hr < 17 ? 'Good afternoon! ☀️' : 'Good evening! 🌙';
  document.getElementById('greeting-text').textContent = greet;
  document.getElementById('today-str').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // KPIs
  const total  = customers.length;
  const gstC   = customers.filter(c => c.type==='gst'||c.type==='both').length;
  const itC    = customers.filter(c => c.type==='it'||c.type==='both').length;
  const pendC  = customers.filter(c => c.status==='pending').length;
  const rev    = customers.reduce((s,c) => s + (Number(c.feeCollected)||0), 0);

  const kpiData = [
    { label:'Total Clients', val:total, icon:'ph-users-three', color:'#0f2044', bg:'rgba(15,32,68,.08)', sub:`${gstC} GST · ${itC} IT`, view:'clients' },
    { label:'GST Clients',   val:gstC,  icon:'ph-receipt',     color:'#059669', bg:'rgba(5,150,105,.1)', sub:'Active registrations', view:'gst' },
    { label:'IT Clients',    val:itC,   icon:'ph-file-text',   color:'#d97706', bg:'rgba(217,119,6,.1)', sub:'Returns to file', view:'it' },
    { label:'Pending',       val:pendC, icon:'ph-warning-circle', color:'#dc2626', bg:'rgba(220,38,38,.1)', sub:'Need attention', view:'clients' },
    { label:'Fees Collected',val:'₹'+fmt(rev,0), icon:'ph-currency-inr', color:'#c9922e', bg:'rgba(201,146,46,.1)', sub:'FY 2025–26', view:'fees' },
  ];
  document.getElementById('kpi-row').innerHTML = kpiData.map(k => `
    <div class="kpi-tile" style="--kpi-color:${k.color}" onclick="navigateTo('${k.view}')">
      <div class="kpi-ico" style="background:${k.bg};color:${k.color}"><i class="ph ${k.icon}"></i></div>
      <div>
        <div class="kpi-lbl">${k.label}</div>
        <div class="kpi-val">${k.val}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    </div>`).join('');

  // Charts
  const gstOnly = customers.filter(c=>c.type==='gst').length;
  const itOnly  = customers.filter(c=>c.type==='it').length;
  const both    = customers.filter(c=>c.type==='both').length;

  const pieCtx = document.getElementById('pie-chart');
  if (pieCtx) {
    if (pieInst) pieInst.destroy();
    pieInst = new Chart(pieCtx, {
      type:'doughnut',
      data:{ labels:['GST Only','IT Only','Both'], datasets:[{data:[gstOnly,itOnly,both], backgroundColor:['#059669','#d97706','#0f2044'], borderWidth:0, hoverOffset:5}] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%',
        plugins:{legend:{position:'bottom', labels:{color:'#64748b',font:{size:11},boxWidth:12,padding:14}}} }
    });
  }

  const barCtx = document.getElementById('bar-chart');
  if (barCtx) {
    if (barInst) barInst.destroy();
    const isDark = document.documentElement.getAttribute('data-theme')==='dark';
    barInst = new Chart(barCtx, {
      type:'bar',
      data:{
        labels:['GSTR-1','GSTR-3B','ITR'],
        datasets:[
          { label:'Filed',   data:[customers.filter(c=>c.gstr1Status==='filed').length, customers.filter(c=>c.gstr3bStatus==='filed').length, customers.filter(c=>c.itrStatus==='filed').length], backgroundColor:'#059669', borderRadius:5 },
          { label:'Pending', data:[customers.filter(c=>(c.type==='gst'||c.type==='both')&&c.gstr1Status!=='filed').length, customers.filter(c=>(c.type==='gst'||c.type==='both')&&c.gstr3bStatus!=='filed').length, customers.filter(c=>(c.type==='it'||c.type==='both')&&c.itrStatus!=='filed').length], backgroundColor:'#e2e8f0', borderRadius:5 }
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ x:{stacked:true, grid:{display:false}, ticks:{color:'#94a3b8'}}, y:{stacked:true, grid:{color:isDark?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}, ticks:{color:'#94a3b8',stepSize:1}} },
        plugins:{legend:{labels:{color:'#94a3b8',font:{size:11},boxWidth:12}}}
      }
    });
  }

  // Urgent alerts
  buildUrgentAlerts();
  renderDueDates();
  renderAdvTax();
  renderActivity();
  buildNotifications();
}

function buildUrgentAlerts() {
  const el = document.getElementById('urgent-alerts'); if (!el) return;
  const alerts = [];
  const today = new Date().getDate();
  const month = new Date().toLocaleString('default',{month:'long'});

  if (20 - today <= 5 && 20 - today >= 0) {
    const pending3b = customers.filter(c=>(c.type==='gst'||c.type==='both')&&c.gstr3bStatus!=='filed').length;
    if (pending3b > 0) alerts.push({ type:'danger', icon:'ph-clock-countdown', title:`GSTR-3B Due in ${20-today} days`, desc:`${pending3b} client${pending3b>1?'s':''} yet to file` });
  }
  if (11 - today <= 3 && 11 - today >= 0) {
    const pending1 = customers.filter(c=>(c.type==='gst'||c.type==='both')&&c.gstr1Status!=='filed').length;
    if (pending1 > 0) alerts.push({ type:'danger', icon:'ph-receipt', title:`GSTR-1 Due on 11th ${month}`, desc:`${pending1} pending` });
  }
  const pendingIT = customers.filter(c=>(c.type==='it'||c.type==='both')&&c.itrStatus!=='filed').length;
  if (pendingIT > 0) alerts.push({ icon:'ph-file-text', title:`${pendingIT} IT Returns Pending`, desc:'Ensure timely filing before deadline', type:'amber' });
  const noCreds = customers.filter(c => {
    const cr = JSON.parse(localStorage.getItem(CRED_KEY)||'{}')[c.id];
    return !cr || (!cr.gstUser && !cr.itUser);
  }).length;
  if (noCreds > 0) alerts.push({ icon:'ph-lock-key', title:`${noCreds} clients missing credentials`, desc:'Add portal login details', type:'default' });

  if (!alerts.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--txt-muted);font-size:.8rem"><i class="ph ph-check-circle" style="font-size:26px;color:var(--emerald);display:block;margin-bottom:6px"></i>No urgent alerts!</div>`;
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.type==='danger'?'danger':a.type==='success'?'success':''}">
      <i class="ph ${a.icon} alert-ico"></i>
      <div><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div>
    </div>`).join('');
}

function renderDueDates() {
  const el = document.getElementById('due-dates-list'); if (!el) return;
  const today = new Date().getDate();
  const mon = new Date().toLocaleString('default',{month:'short'});
  const dues = [
    {title:'GSTR-1 Monthly', day:11, desc:'Outward supplies', type:'GST'},
    {title:'GSTR-1 IFF (QRMP)', day:13, desc:'Invoice furnishing', type:'GST'},
    {title:'GSTR-3B Monthly', day:20, desc:'Summary + payment', type:'GST', urgent:true},
    {title:'TDS Challan 281', day:7,  desc:'Monthly TDS deposit', type:'TDS'},
    {title:'ITR (Non-Audit)', day:31, desc:'July 31 deadline', type:'IT', urgent:true},
  ];
  el.innerHTML = dues.map(d => {
    const left = d.day - today;
    let cls = 'chip-blue', txt = `${left}d left`;
    if (left < 0) { cls='chip-grey'; txt='Passed'; }
    else if (left === 0) { cls='chip-today'; txt='TODAY'; }
    else if (left <= 3 || d.urgent) { cls='chip-red'; }
    else if (left <= 7) { cls='chip-amber'; }
    return `<div class="due-row"><div><div class="due-title">${d.title} <span style="font-size:.65rem;color:var(--txt-muted)">[${d.type}]</span></div><div class="due-desc">${d.desc} — ${d.day} ${mon}</div></div><span class="due-chip ${cls}">${txt}</span></div>`;
  }).join('');
}

function renderAdvTax() {
  const el = document.getElementById('adv-tax-list'); if (!el) return;
  const now = new Date(), yr = now.getFullYear();
  const ins = [
    {t:'1st Instalment (15%)', m:5, d:15, desc:'Jun'},
    {t:'2nd Instalment (45%)', m:8, d:15, desc:'Sep'},
    {t:'3rd Instalment (75%)', m:11, d:15, desc:'Dec'},
    {t:'4th Instalment (100%)', m:2, d:15, desc:'Mar'},
  ];
  el.innerHTML = ins.map(i => {
    let y = yr; if (i.m===2 && now.getMonth()>2) y=yr+1;
    const target = new Date(y,i.m,i.d);
    const days = Math.ceil((target-now)/86400000);
    let cls='chip-blue', txt=`${days}d`;
    if(days<0){cls='chip-grey';txt='Passed';}
    else if(days===0){cls='chip-today';txt='TODAY';}
    else if(days<=7){cls='chip-red';}
    else if(days<=21){cls='chip-amber';}
    return `<div class="due-row"><div><div class="due-title">${i.t}</div><div class="due-desc">Due 15th ${i.desc} ${y}</div></div><span class="due-chip ${cls}">${txt}</span></div>`;
  }).join('');
}

function renderActivity() {
  const el = document.getElementById('recent-activity'); if (!el) return;
  if (!activity.length) { el.innerHTML='<div class="empty-state" style="padding:20px"><i class="ph ph-activity"></i><p>No activity yet</p></div>'; return; }
  el.innerHTML = activity.slice(0,8).map(a => `
    <div class="act-row">
      <div class="act-avatar" style="background:${avColor(a.client)}">${avInitial(a.client)}</div>
      <div class="act-info">
        <div class="act-name">${esc(a.client)}</div>
        <div class="act-desc">${esc(a.action)}</div>
      </div>
      <span class="act-time">${esc(a.date)}</span>
    </div>`).join('');
}

function buildNotifications() {
  const today = new Date().getDate();
  const notifs = [];
  const pending3b = customers.filter(c=>(c.type==='gst'||c.type==='both')&&c.gstr3bStatus!=='filed').length;
  if (pending3b > 0) notifs.push({icon:'ph-receipt',color:'var(--danger)',title:'GSTR-3B Pending',sub:`${pending3b} clients not filed`,time:'Today'});
  const pendingIT = customers.filter(c=>(c.type==='it'||c.type==='both')&&c.itrStatus!=='filed').length;
  if (pendingIT > 0) notifs.push({icon:'ph-file-text',color:'var(--amber)',title:'ITR Pending',sub:`${pendingIT} returns due`,time:'Jul 31'});
  if (20-today>=0 && 20-today<=3) notifs.push({icon:'ph-clock-countdown',color:'var(--danger)',title:'GSTR-3B due in '+(20-today)+' days!',sub:'File before 20th',time:'Urgent'});

  const badge = document.getElementById('notif-badge');
  if (badge) badge.textContent = notifs.length;
  const list = document.getElementById('notif-list');
  if (list) list.innerHTML = notifs.length
    ? notifs.map(n=>`<div class="notif-item"><i class="ph ${n.icon} notif-ico" style="color:${n.color}"></i><div><div class="notif-title">${n.title}</div><div class="notif-sub">${n.sub}</div></div><span class="notif-time">${n.time}</span></div>`).join('')
    : '<div style="padding:20px;text-align:center;color:var(--txt-muted);font-size:.8rem">All clear! ✅</div>';
}

window.toggleNotifPanel = function() {
  document.getElementById('notif-panel').classList.toggle('hidden');
};

// ═══════════════════════════════════════════════
//  CLIENTS VIEW
// ═══════════════════════════════════════════════
window.renderClientsView = function() {
  const type   = document.getElementById('clients-type-filter')?.value||'all';
  const status = document.getElementById('clients-status-filter')?.value||'all';
  const q      = (document.getElementById('clients-search')?.value||document.getElementById('global-search')?.value||'').toLowerCase();

  let data = customers.filter(c => {
    const mt = type==='all'||c.type===type;
    const ms = status==='all'||c.status===status;
    const mq = !q||c.name.toLowerCase().includes(q)||(c.pan||'').toLowerCase().includes(q)||(c.gstin||'').toLowerCase().includes(q)||(c.phone||'').includes(q);
    return mt && ms && mq;
  });

  const tbody = document.getElementById('clients-tbody'); if (!tbody) return;
  tbody.innerHTML = data.length ? data.map(c => {
    const steps = c.gstSteps || {};
    const done  = Object.values(steps).filter(Boolean).length;
    const max   = (c.type==='gst'||c.type==='both') ? 4 : 2;
    const pct   = Math.round((done/max)*100);
    const hColor = pct===100?'#059669':pct>=50?'#d97706':'#dc2626';
    const waNum = (c.phone||'').replace(/\D/g,'');
    const phoneDisplay = c.phone ? `<span style="font-family:'JetBrains Mono',monospace;font-size:.8rem">${esc(c.phone)}</span>` : '<span style="color:var(--txt-light)">—</span>';
    const waIcon= waNum.length>=10?`<a href="https://wa.me/91${waNum.slice(-10)}" target="_blank" onclick="event.stopPropagation()" class="wa-ico" title="WhatsApp ${c.phone}"><i class="ph ph-whatsapp-logo"></i></a>`:'';
    const fee   = Number(c.fee||0); const col = Number(c.feeCollected||0);
    return `<tr onclick="openClientDetail(${c.id})">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="row-chk" data-id="${c.id}" onchange="toggleRowSelect(this)" ${selectedIds.has(c.id)?'checked':''}></td>
      <td><div class="cl-cell"><div class="cl-av" style="background:${avColor(c.name)}">${avInitial(c.name)}</div><div><div class="cl-name">${esc(c.name)}</div><div class="cl-email">${esc(c.email||'')}</div>${c.partners&&c.partners.length?`<span class="partner-chip"><i class="ph ph-users" style="font-size:10px"></i>${c.partners.length} partner${c.partners.length>1?'s':''}</span>`:''}</div></div></td>
      <td style="white-space:nowrap">${phoneDisplay}${waIcon}</td>
      <td onclick="event.stopPropagation()">
        ${c.pan?`<div class="mono-txt copy-cell" onclick="copyToClipboard('${esc(c.pan)}','PAN')" title="Click to copy PAN">${esc(c.pan)} <i class="ph ph-copy" style="font-size:11px;opacity:.4"></i></div>`:'<span style="color:var(--txt-light)">—</span>'}
        ${c.gstin?`<div class="mono-txt copy-cell" style="color:var(--txt-muted);font-size:.72rem;margin-top:2px" onclick="copyToClipboard('${esc(c.gstin)}','GSTIN')" title="Click to copy GSTIN">${esc(c.gstin)} <i class="ph ph-copy" style="font-size:11px;opacity:.4"></i></div>`:''}
      </td>
      <td>${badgeType(c.type)}</td>
      <td><div class="health-bar-wrap"><div class="health-bar"><div class="health-fill" style="width:${pct}%;background:${hColor}"></div></div><span class="health-score" style="color:${hColor}">${pct}%</span></div></td>
      <td style="font-size:.76rem">${fee?`<span style="color:var(--emerald);font-weight:700">₹${fmt(col,0)}</span><span style="color:var(--txt-muted)"> / ₹${fmt(fee,0)}</span>`:'—'}</td>
      <td onclick="event.stopPropagation()"><div class="act-btns">
        <button class="act-btn" onclick="openClientDetail(${c.id})" title="View"><i class="ph ph-eye"></i></button>
        <button class="act-btn" onclick="openEditClient(${c.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
        <button class="act-btn del" onclick="deleteClient(${c.id})" title="Delete"><i class="ph ph-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-users-three"></i><p>No clients found.</p></div></td></tr>`;

  document.getElementById('clients-footer').textContent = `${data.length} of ${customers.length} clients`;
};

window.toggleRowSelect = function(cb) {
  const id = parseInt(cb.dataset.id);
  if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
  updateBulkBar();
};
window.toggleSelectAll = function(cb) {
  document.querySelectorAll('.row-chk').forEach(c => {
    c.checked = cb.checked;
    const id = parseInt(c.dataset.id);
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
  });
  updateBulkBar();
};
function updateBulkBar() {
  const bar = document.getElementById('bulk-action-bar');
  const n = selectedIds.size;
  if (n > 0) { bar.classList.remove('hidden'); document.getElementById('bulk-count').textContent = `${n} selected`; }
  else bar.classList.add('hidden');
}
window.bulkWaFromSelection = function() {
  const sel = customers.filter(c => selectedIds.has(c.id));
  sel.forEach(c => {
    const num = (c.phone||'').replace(/\D/g,'');
    if (num.length>=10) window.open(`https://wa.me/91${num.slice(-10)}`,'_blank');
  });
};
window.bulkDeleteSelected = function() {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} clients?`)) return;
  customers = customers.filter(c => !selectedIds.has(c.id));
  selectedIds.clear(); save(); initDashboard(); renderClientsView();
};

// ═══════════════════════════════════════════════
//  GST VIEW
// ═══════════════════════════════════════════════
(function populateMonths() {
  const sel = document.getElementById('gst-month-sel'); if (!sel) return;
  const now = new Date();
  for (let i=0; i<12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const opt = document.createElement('option');
    opt.value = d.toISOString().slice(0,7);
    opt.textContent = d.toLocaleString('default',{month:'long', year:'numeric'});
    sel.appendChild(opt);
  }
})();

window.renderGstView = function() {
  const q     = (document.getElementById('gst-search')?.value||'').toLowerCase();
  const month = document.getElementById('gst-month-sel')?.value || new Date().toISOString().slice(0,7);
  const data  = customers.filter(c => (c.type==='gst'||c.type==='both') &&
    (c.name.toLowerCase().includes(q)||(c.gstin||'').toLowerCase().includes(q)));

  const tbody = document.getElementById('gst-tbody'); if (!tbody) return;
  tbody.innerHTML = data.length ? data.map((c,i) => {
    if (!c.monthlyGST) c.monthlyGST = {};
    if (!c.monthlyGST[month]) c.monthlyGST[month] = {gstr1:c.gstr1Status||'pending', gstr3b:c.gstr3bStatus||'pending'};
    const s1  = c.monthlyGST[month].gstr1;
    const s3b = c.monthlyGST[month].gstr3b;
    const docs= c.monthlyGST[month].docsReceived||false;
    const waNum = (c.phone||'').replace(/\D/g,'');
    const waIcon = waNum.length>=10 ? `<a href="https://wa.me/91${waNum.slice(-10)}?text=GST+reminder" target="_blank" onclick="event.stopPropagation()" class="wa-ico"><i class="ph ph-whatsapp-logo"></i></a>` : '';
    const phoneShow = c.phone ? `<span style="font-family:'JetBrains Mono',monospace;font-size:.78rem">${esc(c.phone)}</span>` : '<span style="color:var(--txt-light)">—</span>';
    return `<tr onclick="openClientDetail(${c.id})">
      <td class="row-num">${i+1}</td>
      <td class="cl-name">${esc(c.name)}</td>
      <td class="mono-txt copy-cell" onclick="event.stopPropagation();copyToClipboard('${esc(c.gstin||'')}','GSTIN')" title="Click to copy">${esc(c.gstin||'N/A')}</td>
      <td style="white-space:nowrap">${phoneShow}${waIcon}</td>
      <td onclick="event.stopPropagation()">
        <select class="inline-sel gst-sel" data-id="${c.id}" data-type="gstr1">
          <option value="pending"${s1==='pending'?' selected':''}>⏳ Pending</option>
          <option value="filed"${s1==='filed'?' selected':''}>✅ Filed</option>
        </select>
      </td>
      <td onclick="event.stopPropagation()">
        <select class="inline-sel gst-sel" data-id="${c.id}" data-type="gstr3b">
          <option value="pending"${s3b==='pending'?' selected':''}>⏳ Pending</option>
          <option value="filed"${s3b==='filed'?' selected':''}>✅ Filed</option>
        </select>
      </td>
      <td onclick="event.stopPropagation()">
        <select class="inline-sel gst-sel" data-id="${c.id}" data-type="docsReceived">
          <option value="false"${!docs?' selected':''}>❌ No</option>
          <option value="true"${docs?' selected':''}>✅ Yes</option>
        </select>
      </td>
      <td onclick="event.stopPropagation()">
        <div class="act-btns">
          <button class="act-btn" onclick="openClientDetail(${c.id})" title="View"><i class="ph ph-eye"></i></button>
          <button class="act-btn" onclick="sendGstWa(${c.id})" title="WhatsApp"><i class="ph ph-whatsapp-logo" style="color:#25d366"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-receipt"></i><p>No GST clients found.</p></div></td></tr>`;

  document.querySelectorAll('.gst-sel').forEach(sel => {
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const c = customers.find(x=>x.id==sel.dataset.id); if (!c) return;
      if (!c.monthlyGST) c.monthlyGST = {};
      if (!c.monthlyGST[month]) c.monthlyGST[month] = {gstr1:'pending',gstr3b:'pending'};
      const val = sel.dataset.type === 'docsReceived' ? (sel.value==='true') : sel.value;
      c.monthlyGST[month][sel.dataset.type] = val;
      if (sel.dataset.type==='gstr1') c.gstr1Status = sel.value;
      if (sel.dataset.type==='gstr3b') c.gstr3bStatus = sel.value;
      save(); initDashboard();
    });
  });
};

window.sendGstWa = function(id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  const num = (c.phone||'').replace(/\D/g,''); if (num.length<10) { alert('No valid phone.'); return; }
  const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth()-1,1);
  const msg = `Sir,\nKindly send GST bills for ${prev.toLocaleString('en-IN',{month:'long'})} ${prev.getFullYear()} today.\n\nGSTR-1 due: 10th ${now.toLocaleString('en-IN',{month:'long'})}\nGSTR-3B due: 19th ${now.toLocaleString('en-IN',{month:'long'})}`;
  window.open(`https://wa.me/91${num.slice(-10)}?text=${encodeURIComponent(msg)}`,'_blank');
};

// ═══════════════════════════════════════════════
//  IT RETURNS VIEW
// ═══════════════════════════════════════════════
window.renderItView = function() {
  const q   = (document.getElementById('it-search')?.value||'').toLowerCase();
  const st  = document.getElementById('it-status-filter')?.value||'all';
  const data = customers.filter(c => (c.type==='it'||c.type==='both') &&
    (st==='all'||c.itrStatus===st) &&
    (c.name.toLowerCase().includes(q)||(c.pan||'').toLowerCase().includes(q)));

  const tbody = document.getElementById('it-tbody'); if (!tbody) return;
  tbody.innerHTML = data.length ? data.map((c,i) => {
    if (!c.itrStatus) c.itrStatus='pending';
    const yd = c.yearlyData; let refund='—', demand='—', filedOn='—';
    if (yd) {
      const latest = Object.keys(yd).sort().reverse()[0];
      if (latest) {
        const d = yd[latest];
        const rv = d['IT REFUND IF ANY']||d['REFUND RECEIVED']||'';
        const dv = d['OUTSTANDING DEMAND']||'';
        const fo = d['IT ONLINE FILED ON']||d['E-FILED DATE']||'';
        if (rv && rv!=='NIL' && rv!=='0') refund=`<span style="color:var(--emerald);font-weight:700">₹${fmt(Number(rv),0)}</span>`;
        else if (rv) refund='NIL';
        if (dv && dv!=='0') demand=`<span style="color:var(--danger);font-weight:700">₹${fmt(Number(dv),0)}</span>`;
        if (fo) filedOn = fo.includes('T')?fo.split('T')[0]:fo;
      }
    }
    const waNum = (c.phone||'').replace(/\D/g,'');
    const phoneShowIT = c.phone ? `<span style="font-family:'JetBrains Mono',monospace;font-size:.78rem">${esc(c.phone)}</span>` : '';
    return `<tr onclick="openClientDetail(${c.id})">
      <td class="row-num">${i+1}</td>
      <td class="cl-name">${esc(c.name)}</td>
      <td class="mono-txt copy-cell" onclick="event.stopPropagation();copyToClipboard('${esc(c.pan||'')}','PAN')" title="Click to copy PAN">${esc(c.pan||'N/A')}</td>
      <td><span class="badge b-both" style="font-size:.68rem">${esc(c.itrType||'—')}</span></td>
      <td onclick="event.stopPropagation()"><input class="inline-inp it-ack" data-id="${c.id}" value="${esc(c.itrAckNo||'')}" placeholder="Ack No."></td>
      <td style="font-size:.76rem;color:var(--txt-muted)">${esc(filedOn)}</td>
      <td>${refund}</td>
      <td>${demand}</td>
      <td onclick="event.stopPropagation()">
        <select class="inline-sel it-status-sel" data-id="${c.id}">
          <option value="pending"${c.itrStatus==='pending'?' selected':''}>⏳ Pending</option>
          <option value="filed"${c.itrStatus==='filed'?' selected':''}>✅ Filed</option>
        </select>
      </td>
      <td onclick="event.stopPropagation()"><div class="act-btns" style="align-items:center;">
        <button class="act-btn" onclick="openClientDetail(${c.id})" title="View"><i class="ph ph-eye"></i></button>
        ${waNum.length>=10?`<a href="https://wa.me/91${waNum.slice(-10)}" target="_blank" style="text-decoration:none; display:flex; align-items:center; gap:6px; margin-left:8px;" title="WhatsApp ${c.phone}">${phoneShowIT}<div class="act-btn"><i class="ph ph-whatsapp-logo" style="color:#25d366;font-size:16px"></i></div></a>`:''}
      </div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="10"><div class="empty-state"><i class="ph ph-file-text"></i><p>No IT clients found.</p></div></td></tr>`;

  document.querySelectorAll('.it-status-sel').forEach(sel => {
    sel.addEventListener('change', e => { e.stopPropagation(); const c = customers.find(x=>x.id==sel.dataset.id); if(c){c.itrStatus=sel.value; save(); initDashboard();} });
  });
  document.querySelectorAll('.it-ack').forEach(inp => {
    inp.addEventListener('change', e => { e.stopPropagation(); const c = customers.find(x=>x.id==inp.dataset.id); if(c){c.itrAckNo=inp.value; save();} });
  });
};

// ═══════════════════════════════════════════════
//  FEE TRACKER
// ═══════════════════════════════════════════════
window.renderFeeView = function() {
  const total    = customers.reduce((s,c)=>s+Number(c.fee||0),0);
  const collected= customers.reduce((s,c)=>s+Number(c.feeCollected||0),0);
  const pending  = total - collected;

  document.getElementById('fee-kpi-row').innerHTML = [
    {label:'Total Billed',   val:fmtINR(total),     color:'#0f2044', bg:'rgba(15,32,68,.08)', icon:'ph-currency-inr'},
    {label:'Collected',      val:fmtINR(collected), color:'#059669', bg:'rgba(5,150,105,.1)', icon:'ph-check-circle'},
    {label:'Pending',        val:fmtINR(pending),   color:'#dc2626', bg:'rgba(220,38,38,.1)', icon:'ph-warning-circle'},
    {label:'Clients w/ Fee', val:customers.filter(c=>c.fee>0).length, color:'#d97706', bg:'rgba(217,119,6,.1)', icon:'ph-users-three'},
  ].map(k=>`<div class="kpi-tile" style="--kpi-color:${k.color}"><div class="kpi-ico" style="background:${k.bg};color:${k.color}"><i class="ph ${k.icon}"></i></div><div><div class="kpi-lbl">${k.label}</div><div class="kpi-val">${k.val}</div></div></div>`).join('');

  const tbody = document.getElementById('fee-tbody'); if (!tbody) return;
  tbody.innerHTML = customers.filter(c=>true).map((c,i) => {
    const fee=Number(c.fee||0), col=Number(c.feeCollected||0), pen=fee-col;
    const pct = fee>0 ? Math.round((col/fee)*100) : 0;
    const stBadge = pct===100?'b-filed':pct>0?'b-partial':'b-pending';
    const stTxt   = pct===100?'Paid':pct>0?'Partial':'Unpaid';
    return `<tr>
      <td class="row-num">${i+1}</td>
      <td><div class="cl-cell"><div class="cl-av" style="background:${avColor(c.name)};width:28px;height:28px;font-size:.74rem">${avInitial(c.name)}</div><span class="cl-name">${esc(c.name)}</span></div></td>
      <td>${badgeType(c.type)}</td>
      <td><input class="inline-inp fee-inp" data-id="${c.id}" data-field="fee" value="${c.fee||''}" placeholder="0" style="width:90px" oninput="updateFee(this)"></td>
      <td><input class="inline-inp fee-inp" data-id="${c.id}" data-field="feeCollected" value="${c.feeCollected||''}" placeholder="0" style="width:90px" oninput="updateFee(this)"></td>
      <td style="color:${pen>0?'var(--danger)':'var(--emerald)'};font-weight:700;font-family:'JetBrains Mono',monospace">${fee>0?fmtINR(pen):'—'}</td>
      <td><span class="badge ${stBadge}">${stTxt}</span></td>
      <td><button class="act-btn" onclick="openClientDetail(${c.id})" title="View"><i class="ph ph-eye"></i></button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-currency-inr"></i><p>No clients yet.</p></div></td></tr>`;
};

window.updateFee = function(inp) {
  const c = customers.find(x=>x.id==inp.dataset.id); if (!c) return;
  c[inp.dataset.field] = Number(inp.value)||0;
  save();
};

// ═══════════════════════════════════════════════
//  CLIENT DETAIL PANEL
// ═══════════════════════════════════════════════
window.openClientDetail = function(id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  window.activeClientId = id;

  const isGst = c.type==='gst'||c.type==='both';
  const isIt  = c.type==='it'||c.type==='both';

  // Build doc checklist items
  const gstDocs = ['Bills / Invoices received','Purchase register','Sales register','Bank statement','Cash register','E-way bills (if any)'];
  const itDocs  = ['Form 16 / 16A','Bank statement (all)','Interest certificates','Investment proofs (80C)','Rent receipts','Capital gain statements','Other income docs'];

  const storedCreds = JSON.parse(localStorage.getItem(CRED_KEY)||'{}');
  const creds = storedCreds[c.id] || {};
  const dec = s => s ? atob(s) : '';

  // Build FY data sections
  let fyHtml = '';
  const yd = c.yearlyData; 
  if (!yd && c.fullData) c.yearlyData = {'2025-2026':c.fullData};
  if (c.yearlyData && Object.keys(c.yearlyData).length) {
    const excl = ['sno','slno','serialno','name','partyname','clientname'];
    Object.keys(c.yearlyData).sort().reverse().forEach(yr => {
      const data = c.yearlyData[yr];
      let fields = '';
      Object.entries(data).forEach(([k,v]) => {
        const nk = k.toLowerCase().replace(/[^a-z0-9]/g,'');
        if (v && String(v).trim() && !excl.includes(nk)) {
          fields += `<div class="data-cell"><div class="data-cell-label">${esc(k)}</div><div class="data-cell-value">${esc(v)}</div></div>`;
        }
      });
      if (fields) fyHtml += `<div style="margin-bottom:16px"><div style="font-size:.78rem;font-weight:700;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px"><i class="ph ph-calendar-blank"></i> FY ${yr}</div><div class="data-grid">${fields}</div></div>`;
    });
  }
  if (!fyHtml) fyHtml = `<div class="empty-state"><i class="ph ph-database"></i><p>No data imported yet.</p></div>`;

  const checklistHtml = (docs, type) => docs.map((d,i) => {
    const checked = c[`${type}Docs`]?.[i] || false;
    return `<div class="doc-check-item"><input type="checkbox" ${checked?'checked':''} onchange="saveDocCheck(${c.id},'${type}',${i},this.checked)"><span>${d}</span></div>`;
  }).join('');

  const waMsg = buildWaMsg('gstr3b_due', c, true);

  document.getElementById('client-detail-inner').innerHTML = `
    <div class="cd-header">
      <div class="cd-client-info">
        <div class="cd-av" style="background:${avColor(c.name)}">${avInitial(c.name)}</div>
        <div>
          <div class="cd-name">${esc(c.name)}</div>
          <div class="cd-meta">
            ${badgeType(c.type)}
            ${c.pan?`<span class="mono-txt" style="font-size:.75rem;color:var(--txt-muted)">PAN: ${esc(c.pan)}</span>`:''}
            ${c.gstin?`<span class="mono-txt" style="font-size:.75rem;color:var(--txt-muted)">GSTIN: ${esc(c.gstin)}</span>`:''}
            ${c.gstin?`<button class="btn-outline-sm" style="padding:3px 9px;font-size:.7rem" onclick="verifyGSTIN('${esc(c.gstin)}')"><i class="ph ph-broadcast"></i> Verify Live</button>`:''}
            ${c.localPath?`<a href="file:///${esc(c.localPath.replace(/\\/g,'/'))} " target="_blank" class="btn-outline-sm" style="padding:3px 9px;font-size:.7rem;text-decoration:none"><i class="ph ph-folder-open"></i> Open Folder</a>`:''}
          </div>
        </div>
      </div>
      <div class="cd-header-actions">
        <button class="btn-outline-sm" onclick="window.print()"><i class="ph ph-printer"></i> Print</button>
        <button class="ov-close" onclick="closeOverlay('client-detail-overlay')"><i class="ph ph-x"></i></button>
      </div>
    </div>

    <div id="client-live-gst" style="display:none" class="live-gst" style="margin:0 24px">
      <div class="live-gst-header"><div class="live-dot"></div> GST PORTAL — LIVE DATA <span id="clive-ts" class="live-ts"></span></div>
      <div id="clive-body" class="live-gst-body"></div>
    </div>

    <div class="cd-tabs">
      <button class="cd-tab active" onclick="switchCdTab(this,'cdt-details')"><i class="ph ph-info"></i> Details</button>
      <button class="cd-tab" onclick="switchCdTab(this,'cdt-progress')"><i class="ph ph-clipboard-text"></i> Progress</button>
      <button class="cd-tab" onclick="switchCdTab(this,'cdt-docs')"><i class="ph ph-folder"></i> Doc Checklist</button>
      <button class="cd-tab" onclick="switchCdTab(this,'cdt-creds')"><i class="ph ph-lock-key"></i> Vault</button>
      <button class="cd-tab no-print" onclick="switchCdTab(this,'cdt-whatsapp')"><i class="ph ph-whatsapp-logo"></i> WhatsApp</button>
      <button class="cd-tab" onclick="switchCdTab(this,'cdt-notes')"><i class="ph ph-note-pencil"></i> Notes</button>
    </div>

    <!-- Details -->
    <div class="cd-tab-content active" id="cdt-details">${renderPartnersPanel(c)}${fyHtml}</div>

    <!-- Progress / Checklist + Ledger -->
    <div class="cd-tab-content" id="cdt-progress">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        ${isGst?`<div>
          <h5 style="font-size:.82rem;font-weight:700;margin-bottom:10px;color:var(--emerald)"><i class="ph ph-clipboard-text"></i> GST Filing Steps</h5>
          <div class="doc-checklist">
            ${['Bills received / collected','GSTR-1 Filed','B2B Downloaded','GSTR-3B Filed'].map((step,i)=>{
              const key=['bills','reconciliation','draft','challan'][i];
              const chk = c.gstSteps?.[key]||false;
              return `<div class="doc-check-item"><input type="checkbox" ${chk?'checked':''} onchange="saveGstStep(${c.id},'${key}',this.checked)"><span>${step}</span></div>`;
            }).join('')}
          </div>
        </div>`:''} 
        <div>
          <h5 style="font-size:.82rem;font-weight:700;margin-bottom:10px;color:var(--amber)"><i class="ph ph-wallet"></i> Tax Ledger Balances</h5>
          ${isGst?`<div class="cred-row"><label>GST Cash Ledger (₹)</label><input class="txt-inp ledger-inp" id="led-gst-cash" data-field="gstCash" value="${c.ledger?.gstCash||''}" placeholder="0.00" oninput="saveLedger(${c.id},this)"></div>
          <div class="cred-row"><label>GST Credit Ledger (₹)</label><input class="txt-inp ledger-inp" id="led-gst-cred" data-field="gstCredit" value="${c.ledger?.gstCredit||''}" placeholder="0.00" oninput="saveLedger(${c.id},this)"></div>`:''}
          ${isIt?`<div class="cred-row"><label>TDS Receivable (₹)</label><input class="txt-inp ledger-inp" id="led-tds" data-field="tdsReceivable" value="${c.ledger?.tdsReceivable||''}" placeholder="0.00" oninput="saveLedger(${c.id},this)"></div>`:''}
        </div>
      </div>
    </div>

    <!-- Doc Checklist -->
    <div class="cd-tab-content" id="cdt-docs">
      <div style="display:grid;grid-template-columns:${isGst&&isIt?'1fr 1fr':'1fr'};gap:16px">
        ${isGst?`<div><h5 style="font-size:.82rem;font-weight:700;margin-bottom:10px;color:var(--emerald)"><i class="ph ph-receipt"></i> GST Documents</h5><div class="doc-checklist">${checklistHtml(gstDocs,'gst')}</div></div>`:''}
        ${isIt?`<div><h5 style="font-size:.82rem;font-weight:700;margin-bottom:10px;color:var(--amber)"><i class="ph ph-file-text"></i> IT Return Documents</h5><div class="doc-checklist">${checklistHtml(itDocs,'it')}</div></div>`:''}
      </div>
    </div>

    <!-- Credentials Vault -->
    <div class="cd-tab-content no-print" id="cdt-creds">
      <div class="creds-2col">
        ${isGst?`<div class="creds-block"><h5><i class="ph ph-lock-key" style="color:var(--danger)"></i> GST Portal</h5>
          <div class="cred-row"><label>Username</label><input class="txt-inp cred-val" id="cv-gst-user" placeholder="GST Username" value="${esc(dec(creds.gstUser||''))}"></div>
          <div class="cred-row"><label>Password</label><div class="cred-pass-wrap"><input class="txt-inp cred-val" id="cv-gst-pass" type="password" placeholder="••••••••" value="${esc(dec(creds.gstPass||''))}"><div class="cred-pass-btns"><button class="cred-ico-btn" onclick="togglePass('cv-gst-pass',this)" tabindex="-1"><i class="ph ph-eye"></i></button><button class="cred-ico-btn" onclick="copyPass('cv-gst-pass')" tabindex="-1"><i class="ph ph-copy"></i></button></div></div></div>
        </div>`:''}
        ${isIt?`<div class="creds-block"><h5><i class="ph ph-lock-key" style="color:var(--danger)"></i> IT Portal</h5>
          <div class="cred-row"><label>PAN / Username</label><input class="txt-inp cred-val" id="cv-it-user" placeholder="PAN Number" value="${esc(dec(creds.itUser||''))}"></div>
          <div class="cred-row"><label>Password</label><div class="cred-pass-wrap"><input class="txt-inp cred-val" id="cv-it-pass" type="password" placeholder="••••••••" value="${esc(dec(creds.itPass||''))}"><div class="cred-pass-btns"><button class="cred-ico-btn" onclick="togglePass('cv-it-pass',this)" tabindex="-1"><i class="ph ph-eye"></i></button><button class="cred-ico-btn" onclick="copyPass('cv-it-pass')" tabindex="-1"><i class="ph ph-copy"></i></button></div></div></div>
        </div>`:''}
      </div>
      <button class="btn-primary" style="margin-top:14px" onclick="saveVault(${c.id})"><i class="ph ph-floppy-disk"></i> Save Credentials</button>
    </div>

    <!-- WhatsApp -->
    <div class="cd-tab-content no-print" id="cdt-whatsapp">
      <div class="bwa-templates" style="margin-bottom:12px">
        ${isGst?`<button class="tpl-btn" onclick="setCdWa('gstr3b_due',${c.id})"><i class="ph ph-clock"></i> GST Due</button>`:''}
        ${isIt?`<button class="tpl-btn" onclick="setCdWa('itr_due',${c.id})"><i class="ph ph-file-text"></i> ITR Due</button>`:''}
        <button class="tpl-btn" onclick="setCdWa('filing_done',${c.id})"><i class="ph ph-check-circle"></i> Filed!</button>
        <button class="tpl-btn" onclick="setCdWa('docs_req',${c.id})"><i class="ph ph-folder"></i> Docs Req</button>
        <button class="tpl-btn" onclick="setCdWa('custom',${c.id})"><i class="ph ph-pencil"></i> Custom</button>
      </div>
      <textarea id="cd-wa-preview" class="bwa-msg" rows="6">${waMsg}</textarea>
      <button class="btn-wa-send" style="margin-top:10px" onclick="sendCdWa(${c.id})"><i class="ph ph-paper-plane-tilt"></i> Send via WhatsApp</button>
    </div>

    <!-- Notes -->
    <div class="cd-tab-content" id="cdt-notes">
      <div class="notes-add">
        <textarea class="notes-textarea" id="cd-note-inp" rows="3" placeholder="Write a note, follow-up, or remark…"></textarea>
        <button class="btn-primary" onclick="addNote(${c.id})"><i class="ph ph-plus"></i></button>
      </div>
      <div class="notes-list" id="cd-notes-list"></div>
    </div>
  `;

  renderClientNotes(c);
  openOverlay('client-detail-overlay');
};

window.switchCdTab = function(btn, tabId) {
  btn.closest('.cd-tabs').querySelectorAll('.cd-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.cd-tab-content').forEach(p=>p.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
};

window.saveGstStep = function(id, key, val) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  if (!c.gstSteps) c.gstSteps = {};
  c.gstSteps[key] = val;
  c.status = Object.values(c.gstSteps).filter(Boolean).length >= 4 ? 'completed' : 'pending';
  save(); renderClientsView();
};
window.saveLedger = function(id, inp) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  if (!c.ledger) c.ledger = {};
  c.ledger[inp.dataset.field] = inp.value;
  save();
};
window.saveDocCheck = function(id, type, idx, val) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  if (!c[`${type}Docs`]) c[`${type}Docs`] = {};
  c[`${type}Docs`][idx] = val;
  save();
};
window.saveVault = function(id) {
  const all = JSON.parse(localStorage.getItem(CRED_KEY)||'{}');
  if (!all[id]) all[id] = {};
  const enc = s => s ? btoa(s) : '';
  all[id].gstUser = enc(document.getElementById('cv-gst-user')?.value||'');
  all[id].gstPass = enc(document.getElementById('cv-gst-pass')?.value||'');
  all[id].itUser  = enc(document.getElementById('cv-it-user')?.value||'');
  all[id].itPass  = enc(document.getElementById('cv-it-pass')?.value||'');
  saveCreds(all);
  alert('Credentials saved securely!');
};
window.togglePass = function(id, btn) {
  const inp = document.getElementById(id); if (!inp) return;
  const i = btn.querySelector('i');
  if (inp.type==='password') { inp.type='text'; i.className='ph ph-eye-slash'; }
  else { inp.type='password'; i.className='ph ph-eye'; }
};
window.copyPass = function(id) {
  const inp = document.getElementById(id); if (!inp?.value) return;
  navigator.clipboard.writeText(inp.value).then(()=>{
    inp.style.borderColor='var(--emerald)'; setTimeout(()=>inp.style.borderColor='',700);
  });
};

window.setCdWa = function(tpl, id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  document.getElementById('cd-wa-preview').value = buildWaMsg(tpl, c, true);
};
window.sendCdWa = function(id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  const msg = document.getElementById('cd-wa-preview')?.value?.trim();
  if (!msg) { alert('Write a message first.'); return; }
  const num = (c.phone||'').replace(/\D/g,'');
  if (num.length<10) { alert('No valid phone number.'); return; }
  window.open(`https://wa.me/91${num.slice(-10)}?text=${encodeURIComponent(msg)}`,'_blank');
};

function renderClientNotes(c) {
  const el = document.getElementById('cd-notes-list'); if (!el) return;
  const notes = c.notes||[];
  el.innerHTML = notes.length ? notes.map((n,i)=>`
    <div class="note-card">
      <div><div class="note-txt">${esc(n.text)}</div><div class="note-date">${esc(n.date)}</div></div>
      <button class="note-del" onclick="deleteNote(${c.id},${i})"><i class="ph ph-trash"></i></button>
    </div>`).join('') : `<div class="empty-state" style="padding:20px"><i class="ph ph-note"></i><p>No notes yet.</p></div>`;
}
window.addNote = function(id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  const txt = document.getElementById('cd-note-inp')?.value?.trim(); if (!txt) return;
  if (!c.notes) c.notes = [];
  c.notes.unshift({text:txt, date:new Date().toLocaleString('en-IN')});
  document.getElementById('cd-note-inp').value = '';
  save(); renderClientNotes(c);
};
window.deleteNote = function(id, i) {
  const c = customers.find(x=>x.id==id); if (!c||!c.notes) return;
  c.notes.splice(i,1); save(); renderClientNotes(c);
};

// ── GSTIN Verify ──
window.verifyGSTIN = function(gstin) {
  const panel = document.getElementById('client-live-gst');
  const body  = document.getElementById('clive-body');
  const ts    = document.getElementById('clive-ts');
  panel.style.display = 'block';
  navigator.clipboard?.writeText(gstin).catch(()=>{});
  body.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font-size:.8rem;color:var(--txt-muted)"><div style="width:14px;height:14px;border:2px solid rgba(5,150,105,.3);border-top-color:var(--emerald);border-radius:50%;animation:spin .7s linear infinite"></div> Verifying ${esc(gstin)}…</div>`;
  fetch(`${window.API}/api/verify-gst?gstin=${encodeURIComponent(gstin)}`)
    .then(r=>r.json()).then(res=>{
      if (!res.success) throw new Error();
      const d=res.data; ts.textContent='Verified '+new Date().toLocaleTimeString('en-IN');
      const sc=d.status==='Active'?'var(--emerald)':'var(--danger)';
      body.innerHTML=`<div style="margin-bottom:10px;padding:8px 12px;background:rgba(5,150,105,.07);border-radius:7px;font-size:.76rem;color:var(--emerald)"><i class="ph ph-copy"></i> GSTIN copied — <a href="https://services.gst.gov.in/services/searchtp" target="_blank" style="color:var(--emerald)">Open GST Portal →</a></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><strong style="font-size:.95rem">${esc(d.legalName||'—')}</strong><span style="padding:2px 9px;border-radius:99px;font-size:.68rem;font-weight:700;background:${sc}22;color:${sc};border:1px solid ${sc}44">${esc(d.status)}</span></div>
      <div class="data-grid">${[['Trade Name',d.tradeName],['GSTIN',d.gstin],['Reg. Date',d.registrationDate],['Taxpayer',d.taxpayerType],['Constitution',d.constitution],['Last Return',d.lastReturnFiled]].map(([l,v])=>`<div class="data-cell"><div class="data-cell-label">${l}</div><div class="data-cell-value">${esc(v||'—')}</div></div>`).join('')}</div>`;
    }).catch(()=>{ body.innerHTML=`<div style="color:var(--amber);font-size:.8rem"><i class="ph ph-plug-charging"></i> Server not running. Start <strong>Start_Server.bat</strong> and retry.</div>`; });
};

// ═══════════════════════════════════════════════
//  ADD / EDIT CLIENT
// ═══════════════════════════════════════════════
window.openAddClient = function() {
  document.getElementById('client-modal-title').innerHTML = '<i class="ph ph-user-plus"></i> Add New Client';
  document.getElementById('client-form').reset();
  document.getElementById('cf-id').value = '';
  clearPartnerRows();
  openOverlay('client-modal');
};
window.openEditClient = function(id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  document.getElementById('client-modal-title').innerHTML = '<i class="ph ph-pencil-simple"></i> Edit Client';
  document.getElementById('cf-id').value    = c.id;
  document.getElementById('cf-name').value  = c.name;
  document.getElementById('cf-phone').value = c.phone||'';
  document.getElementById('cf-email').value = c.email||'';
  document.getElementById('cf-pan').value   = c.pan||'';
  document.getElementById('cf-gstin').value = c.gstin||'';
  document.getElementById('cf-type').value  = c.type;
  document.getElementById('cf-itr').value   = c.itrType||'';
  document.getElementById('cf-fee').value   = c.fee||'';
  document.getElementById('cf-path').value  = c.localPath||'';
  document.getElementById('cf-remarks').value = c.remarks||'';
  // Load partners
  clearPartnerRows();
  (c.partners||[]).forEach(p => addPartnerRow(p));
  openOverlay('client-modal');
};
window.submitClientForm = function(e) {
  e.preventDefault();
  const id = document.getElementById('cf-id').value;
  // Collect partners from form rows
  const partnerRows = document.querySelectorAll('.partner-row');
  const partners = [];
  partnerRows.forEach(row => {
    const name  = row.querySelector('.p-name')?.value?.trim();
    const pan   = row.querySelector('.p-pan')?.value?.trim().toUpperCase();
    const share = row.querySelector('.p-share')?.value?.trim();
    const role  = row.querySelector('.p-role')?.value;
    const phone = row.querySelector('.p-phone')?.value?.trim();
    if (name) partners.push({ name, pan: pan||'', share: share||'', role: role||'Partner', phone: phone||'' });
  });
  const obj = {
    name:     document.getElementById('cf-name').value.trim(),
    phone:    document.getElementById('cf-phone').value.trim(),
    email:    document.getElementById('cf-email').value.trim(),
    pan:      document.getElementById('cf-pan').value.trim().toUpperCase(),
    gstin:    document.getElementById('cf-gstin').value.trim().toUpperCase(),
    type:     document.getElementById('cf-type').value,
    itrType:  document.getElementById('cf-itr').value,
    fee:      Number(document.getElementById('cf-fee').value)||0,
    localPath:document.getElementById('cf-path').value.trim(),
    remarks:  document.getElementById('cf-remarks').value.trim(),
    partners,
  };
  if (id) {
    const idx = customers.findIndex(c=>c.id==id);
    if (idx!==-1) customers[idx] = {...customers[idx], ...obj};
    log(obj.name, obj.type, 'Client Updated');
  } else {
    customers.push({id:Date.now(), ...obj, status:'pending'});
    log(obj.name, obj.type, 'Client Added', 'pending');
  }
  save(); closeOverlay('client-modal');
  initDashboard(); renderClientsView();
};
window.deleteClient = function(id) {
  const c = customers.find(x=>x.id==id); if (!c) return;
  if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
  customers = customers.filter(x=>x.id!=id);
  log(c.name, c.type, 'Client Deleted', 'pending');
  save(); initDashboard(); renderClientsView();
};

// ═══════════════════════════════════════════════
//  PARTNER MANAGEMENT
// ═══════════════════════════════════════════════

// Clears all partner rows in the form
function clearPartnerRows() {
  const container = document.getElementById('partner-rows'); if (!container) return;
  container.innerHTML = '';
  syncNoPartnerNote();
}

// Adds a blank or pre-filled partner row to the form
window.addPartnerRow = function(p = {}) {
  const container = document.getElementById('partner-rows'); if (!container) return;

  // Add column headers once (before first row)
  if (!container.querySelector('.partner-col-hdrs') && container.children.length === 0) {
    const hdrs = document.createElement('div');
    hdrs.className = 'partner-col-hdrs';
    hdrs.innerHTML = `<span>Full Name *</span><span>PAN</span><span>Role</span><span>Share %</span><span>Phone</span><span></span>`;
    container.appendChild(hdrs);
  }

  const row = document.createElement('div');
  row.className = 'partner-row';
  row.innerHTML = `
    <input class="p-name" placeholder="Partner name *" value="${esc(p.name||'')}" required>
    <input class="p-pan mono-inp" placeholder="PAN (optional)" value="${esc(p.pan||'')}" style="text-transform:uppercase" maxlength="10">
    <select class="p-role">
      <option value="Partner"${(p.role||'Partner')==='Partner'?' selected':''}>Partner</option>
      <option value="Director"${p.role==='Director'?' selected':''}>Director</option>
      <option value="Proprietor"${p.role==='Proprietor'?' selected':''}>Proprietor</option>
      <option value="Trustee"${p.role==='Trustee'?' selected':''}>Trustee</option>
      <option value="Member"${p.role==='Member'?' selected':''}>Member</option>
      <option value="Karta"${p.role==='Karta'?' selected':''}>Karta (HUF)</option>
      <option value="Authorised Signatory"${p.role==='Authorised Signatory'?' selected':''}>Auth. Signatory</option>
    </select>
    <input class="p-share" type="number" placeholder="e.g. 50" min="0" max="100" value="${esc(p.share||'')}" oninput="validateTotalShare()">
    <input class="p-phone" placeholder="Phone" value="${esc(p.phone||'')}" maxlength="15">
    <button type="button" class="partner-del-btn" onclick="removePartnerRow(this)" title="Remove">
      <i class="ph ph-trash"></i>
    </button>
  `;
  container.appendChild(row);
  syncNoPartnerNote();
  validateTotalShare();
};

// Removes a partner row
window.removePartnerRow = function(btn) {
  btn.closest('.partner-row').remove();
  // Remove headers if no rows left
  const container = document.getElementById('partner-rows');
  if (container && !container.querySelector('.partner-row')) {
    container.innerHTML = '';
  }
  syncNoPartnerNote();
  validateTotalShare();
};

// Shows/hides the "no partner" note
function syncNoPartnerNote() {
  const note = document.getElementById('no-partner-note'); if (!note) return;
  const hasRows = !!document.querySelector('.partner-row');
  note.style.display = hasRows ? 'none' : 'flex';
}

// Validates that share % sum ≤ 100
window.validateTotalShare = function() {
  const shares = [...document.querySelectorAll('.p-share')].map(i => parseFloat(i.value)||0);
  const total = shares.reduce((a,b) => a+b, 0);
  let warn = document.getElementById('share-total-warn');
  if (!warn) {
    warn = document.createElement('div');
    warn.id = 'share-total-warn';
    const container = document.getElementById('partner-rows');
    if (container) container.after(warn);
  }
  if (shares.length === 0) { warn.innerHTML=''; return; }
  if (total > 100) {
    warn.innerHTML=`<div class="share-warning"><i class="ph ph-warning"></i> Total share is ${total}% — exceeds 100%!</div>`;
  } else if (total === 100) {
    warn.innerHTML=`<div class="share-ok"><i class="ph ph-check-circle"></i> Total share is 100% ✓</div>`;
  } else if (total > 0) {
    warn.innerHTML=`<div class="share-warning"><i class="ph ph-info"></i> Total share is ${total}% — remaining ${100-total}% unassigned.</div>`;
  } else {
    warn.innerHTML='';
  }
};

// Renders the partner panel inside client detail
function renderPartnersPanel(c) {
  const partners = c.partners || [];
  if (partners.length === 0) {
    return `
      <div class="partners-panel">
        <div class="partners-panel-head">
          <h5><i class="ph ph-user-circle"></i> Partners / Directors</h5>
          <button class="btn-outline-sm" onclick="openEditClient(${c.id});closeOverlay('client-detail-overlay')">
            <i class="ph ph-pencil-simple"></i> Add Partners
          </button>
        </div>
        <div class="sole-prop-badge">
          <i class="ph ph-user"></i> Sole Proprietor / Individual — no partners registered
        </div>
      </div>`;
  }

  const totalShare = partners.reduce((s, p) => s + (parseFloat(p.share)||0), 0);
  const shareBar = partners.map(p => {
    const pct = parseFloat(p.share)||0;
    return `<div title="${esc(p.name)}: ${pct}%" style="width:${pct}%;background:${avColor(p.name)};height:100%;display:inline-block;"></div>`;
  }).join('');

  const cards = partners.map(p => `
    <div class="partner-card">
      <div class="partner-av" style="background:${avColor(p.name)}">${avInitial(p.name)}</div>
      <div class="partner-info">
        <div class="partner-name">${esc(p.name)}</div>
        <div class="partner-meta">
          ${p.pan?`<div class="partner-meta-item"><i class="ph ph-identification-badge"></i><span class="mono-txt">${esc(p.pan)}</span></div>`:''}
          ${p.phone?`<div class="partner-meta-item"><i class="ph ph-phone"></i><a href="https://wa.me/91${p.phone.replace(/\D/g,'').slice(-10)}" target="_blank" style="color:inherit;text-decoration:none">${esc(p.phone)} <i class="ph ph-whatsapp-logo" style="color:#25d366;font-size:12px"></i></a></div>`:''}
          <div class="partner-meta-item"><i class="ph ph-briefcase"></i>${esc(p.role||'Partner')}</div>
        </div>
      </div>
      ${p.share?`<span class="partner-share-badge">${p.share}%</span>`:''}
    </div>`).join('');

  return `
    <div class="partners-panel">
      <div class="partners-panel-head">
        <h5><i class="ph ph-users"></i> Partners / Directors <span style="font-size:.72rem;color:var(--txt-muted);font-weight:400;margin-left:4px">${partners.length} member${partners.length>1?'s':''}</span></h5>
        <button class="btn-outline-sm" onclick="openEditClient(${c.id});closeOverlay('client-detail-overlay')">
          <i class="ph ph-pencil-simple"></i> Edit
        </button>
      </div>
      ${totalShare>0?`
        <div style="margin-bottom:12px">
          <div style="font-size:.7rem;color:var(--txt-muted);margin-bottom:5px;font-weight:600">Share Distribution</div>
          <div style="height:8px;border-radius:99px;overflow:hidden;background:var(--bg-3);display:flex">${shareBar}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
            ${partners.map(p=>`<span style="font-size:.68rem;color:var(--txt-muted);display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:${avColor(p.name)};display:inline-block"></span>${esc(p.name)}${p.share?' ('+p.share+'%)':''}</span>`).join('')}
          </div>
        </div>
      `:''}
      <div class="partner-cards">${cards}</div>
    </div>`;
}

// ═══════════════════════════════════════════════
//  WHATSAPP TEMPLATES
// ═══════════════════════════════════════════════
function buildWaMsg(tpl, c, ret=false) {
  const now=new Date(), prev=new Date(now.getFullYear(),now.getMonth()-1,1);
  const pm=prev.toLocaleString('en-IN',{month:'long'}), py=prev.getFullYear();
  const cm=now.toLocaleString('en-IN',{month:'long'}), cy=now.getFullYear();
  let msg='';
  switch(tpl) {
    case 'gstr3b_due': msg=`Sir,\nKindly send GST bills for ${pm} ${py} today.\n\nGSTR-1 due: 10th ${cm} ${cy}\nGSTR-3B due: 19th ${cm} ${cy}`; break;
    case 'itr_due':    msg=`Sir,\nPlease send IT documents (Form 16, Bank Statements, Interest Certificates) for FY ${py-1}-${String(py).slice(-2)}.\n\nITR deadline: 31st July ${cy}.`; break;
    case 'filing_done':msg=`Sir,\nYour return has been filed successfully. ✅\n\nAcknowledgement details will be shared shortly.`; break;
    case 'docs_req':   msg=`Sir,\nKindly provide the following documents at the earliest:\n• Bank statements\n• Invoices / Bills\n• Other income documents\n\nPlease share them on WhatsApp or visit our office.`; break;
    case 'adv_tax':    msg=`Sir,\nGentle reminder that your Advance Tax instalment is due.\n\nKindly arrange payment before the due date to avoid interest u/s 234B/234C.`; break;
    default: msg=`Sir,\n\n`;
  }
  if (ret) return msg;
  const el=document.getElementById('bwa-message'); if (el) el.value=msg;
}

// ═══════════════════════════════════════════════
//  BULK WHATSAPP
// ═══════════════════════════════════════════════
window.openBulkWa = function() {
  renderBwaList(); openOverlay('bulk-wa-overlay');
};
window.renderBwaList = function() {
  const filter = document.getElementById('bwa-type-filter')?.value||'all';
  let list = customers;
  if (filter==='gst') list=customers.filter(c=>c.type==='gst'||c.type==='both');
  else if (filter==='it') list=customers.filter(c=>c.type==='it'||c.type==='both');
  else if (filter==='both') list=customers.filter(c=>c.type==='both');
  else if (filter==='pending-gst') list=customers.filter(c=>(c.type==='gst'||c.type==='both')&&c.gstr3bStatus!=='filed');
  else if (filter==='pending-it') list=customers.filter(c=>(c.type==='it'||c.type==='both')&&c.itrStatus!=='filed');

  const el=document.getElementById('bwa-client-list'); if (!el) return;
  el.innerHTML = list.map(c=>`
    <div class="bwa-client-row" data-id="${c.id}" onclick="this.classList.toggle('selected');updateBwaCount()">
      <input type="checkbox" class="bwa-chk" data-id="${c.id}" onclick="event.stopPropagation();this.closest('.bwa-client-row').classList.toggle('selected');updateBwaCount()" ${''}>
      <div class="cl-av" style="background:${avColor(c.name)};width:28px;height:28px;font-size:.72rem">${avInitial(c.name)}</div>
      <div><div class="bwa-client-name">${esc(c.name)}</div><div class="bwa-client-phone">${esc(c.phone||'—')}</div></div>
    </div>`).join('');
  updateBwaCount();
};
window.updateBwaCount = function() {
  const n = document.querySelectorAll('.bwa-client-row.selected').length;
  document.getElementById('bwa-count').textContent = n+' selected';
};
window.toggleAllBwa = function(checked) {
  document.querySelectorAll('.bwa-client-row').forEach(r=>{
    r.classList.toggle('selected',checked);
    const cb=r.querySelector('.bwa-chk'); if(cb) cb.checked=checked;
  });
  updateBwaCount();
};
window.setBwaTemplate = function(tpl) { buildWaMsg(tpl, {}, false); };
window.sendBulkWa = function() {
  const msg = document.getElementById('bwa-message')?.value?.trim();
  if (!msg) { alert('Write a message first.'); return; }
  const rows = document.querySelectorAll('.bwa-client-row.selected');
  if (!rows.length) { alert('Select at least one client.'); return; }
  let sent=0;
  rows.forEach(r=>{
    const id=parseInt(r.dataset.id);
    const c=customers.find(x=>x.id==id); if(!c) return;
    const num=(c.phone||'').replace(/\D/g,''); if(num.length<10) return;
    setTimeout(()=>window.open(`https://wa.me/91${num.slice(-10)}?text=${encodeURIComponent(msg)}`,'_blank'), sent*800);
    sent++;
  });
  if(!sent) alert('No selected clients have valid phone numbers.');
};

// ═══════════════════════════════════════════════
//  TAX CALENDAR
// ═══════════════════════════════════════════════
window.openCalendar = function() {
  renderCalendar(new Date().getFullYear(), new Date().getMonth());
  openOverlay('calendar-overlay');
};
function renderCalendar(year, month) {
  const events = getCalendarEvents(year, month);
  const first = new Date(year, month, 1).getDay();
  const days  = new Date(year, month+1, 0).getDate();
  const mn    = new Date(year, month).toLocaleString('default',{month:'long',year:'numeric'});
  const today = new Date();
  let html = `<div class="cal-body">
    <div class="cal-month-nav">
      <button class="btn-ghost" onclick="renderCalendar(${month===0?year-1:year},${month===0?11:month-1})"><i class="ph ph-caret-left"></i></button>
      <h3>${mn}</h3>
      <button class="btn-ghost" onclick="renderCalendar(${month===11?year+1:year},${month===11?0:month+1})"><i class="ph ph-caret-right"></i></button>
    </div>
    <div class="cal-grid">`;
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>{ html+=`<div class="cal-day-hdr">${d}</div>`; });
  for(let i=0;i<first;i++) html+=`<div class="cal-day other-month"></div>`;
  for(let d=1;d<=days;d++){
    const isToday = year===today.getFullYear()&&month===today.getMonth()&&d===today.getDate();
    const dayEvents = events.filter(e=>e.day===d);
    html+=`<div class="cal-day${isToday?' today':''}"><div class="cal-day-num">${d}</div>`;
    dayEvents.forEach(ev=>{ html+=`<div class="cal-event ev-${ev.type}" title="${ev.label}">${ev.label}</div>`; });
    html+=`</div>`;
  }
  html+=`</div></div>`;
  document.getElementById('cal-render').innerHTML = html;
}
function getCalendarEvents(year, month) {
  const evs = [];
  const mn = month+1;
  // GST events
  evs.push({day:11,type:'gst',label:'GSTR-1'});
  evs.push({day:13,type:'gst',label:'IFF'});
  evs.push({day:20,type:'gst',label:'GSTR-3B'});
  // TDS
  evs.push({day:7,type:'tds',label:'TDS Challan'});
  evs.push({day:30,type:'tds',label:'TDS Return'});
  // Advance tax quarters
  if (mn===6)  evs.push({day:15,type:'adv',label:'Adv Tax 15%'});
  if (mn===9)  evs.push({day:15,type:'adv',label:'Adv Tax 45%'});
  if (mn===12) evs.push({day:15,type:'adv',label:'Adv Tax 75%'});
  if (mn===3)  evs.push({day:15,type:'adv',label:'Adv Tax 100%'});
  // IT returns
  if (mn===7) { evs.push({day:31,type:'it',label:'ITR Non-Audit'}); }
  if (mn===10){ evs.push({day:31,type:'it',label:'ITR Audit'}); }
  return evs;
}

// ═══════════════════════════════════════════════
//  NETWORK FOLDER BROWSER
// ═══════════════════════════════════════════════
window.browseFolder = function() {
  const path = document.getElementById('folder-path-inp')?.value?.trim();
  if (!path) { alert('Enter a folder path.'); return; }
  const status = document.getElementById('folder-status');
  const content= document.getElementById('folder-content');
  status.style.display='flex'; status.innerHTML=`<div style="display:flex;gap:8px;align-items:center"><div style="width:12px;height:12px;border:2px solid rgba(37,99,235,.3);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div> Loading…</div>`;
  content.innerHTML='';
  fetch(`${window.API}/api/list?path=${encodeURIComponent(path)}`)
    .then(r=>r.json()).then(data=>{
      status.style.display='none';
      if(!data.files) { content.innerHTML=`<div class="empty-state"><i class="ph ph-folder-open"></i><p>${esc(data.message||'No files found.')}</p></div>`; return; }
      if(!data.files.length){ content.innerHTML=`<div class="empty-state"><i class="ph ph-folder-open"></i><p>Empty folder.</p></div>`; return; }
      const grid=document.createElement('div'); grid.className='folder-grid';
      data.files.forEach(f=>{
        const ext=(f.name.split('.').pop()||'').toLowerCase();
        const icon=f.isDirectory?'ph-folder-fill':ext==='pdf'?'ph-file-pdf':ext==='xlsx'||ext==='xls'?'ph-microsoft-excel-logo':ext==='docx'||ext==='doc'?'ph-file-doc':'ph-file';
        const size=f.size?`${(f.size/1024).toFixed(1)} KB`:'';
        const div=document.createElement('div'); div.className=`folder-item ${f.isDirectory?'dir':'file'}`;
        div.innerHTML=`<i class="ph ${icon}"></i><div class="folder-item-name">${esc(f.name)}</div>${size?`<div class="folder-item-size">${size}</div>`:''}`;
        if(f.isDirectory){ div.onclick=()=>{ document.getElementById('folder-path-inp').value=decodeURIComponent(f.path); browseFolder(); }; }
        else { div.onclick=()=>window.open(`${window.API}/api/download?path=${f.path}`,'_blank'); }
        grid.appendChild(div);
      });
      content.appendChild(grid);
    }).catch(()=>{
      status.innerHTML=`<span style="color:var(--danger)"><i class="ph ph-warning"></i> Server not running. Please start <strong>Start_Server.bat</strong>.</span>`;
    });
};

// ═══════════════════════════════════════════════
//  IMPORT EXCEL
// ═══════════════════════════════════════════════
window.importExcel = function(inp) {
  const file = inp.files[0]; if (!file) return;
  if (!/\.(xlsx|xls|csv)/i.test(file.name)) { alert('Please select an Excel or CSV file.'); return; }
  const selectedYear = document.getElementById('active-year').value;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result),{type:'array'});
      let added=0, updated=0;
      let isFirst=true;
      wb.SheetNames.forEach(sn=>{
        const ws=wb.Sheets[sn];
        // raw:true keeps numbers as numbers (fixes phone number float issue)
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
        if(!rows.length) return;
        let hRow=-1, hMap={name:-1,email:-1,phone:-1,gstin:-1,pan:-1,type:-1};
        let hNames=[];
        for(let i=0;i<Math.min(20,rows.length);i++){
          const row=rows[i]; if(!row) continue;
          let found=false;
          row.forEach((cell,ci)=>{
            if(typeof cell!=='string') return;
            const v=cell.toLowerCase().trim();
            if((v.includes('name')||v.includes('client')||v.includes('customer')||v.includes('party')) && !v.includes('type') && !v.includes('status')) {
              if (hMap.name === -1 || v.includes('name')) hMap.name=ci;
              found=true;
            }
            else if(v.includes('mail')) hMap.email=ci;
            else if(v.includes('phone')||v.includes('mobile')||v.includes('ph.')||v.includes('ph no')||v.includes('phno')||v.includes('contact')||v.includes('cell')||v.includes('whatsapp')) hMap.phone=ci;
            else if(v.includes('gst')&&!v.includes('turnover')&&!v.includes('type')){hMap.gstin=ci;found=true;}
            else if(v.includes('pan')){hMap.pan=ci;found=true;}
          });
          if(found&&(hMap.name!==-1||hMap.pan!==-1||hMap.gstin!==-1)){hRow=i;hNames=row.map(c=>String(c||'').trim());break;}
        }
        if(hRow===-1) return;
        for(let i=hRow+1;i<rows.length;i++){
          const row=rows[i]; if(!row||!row.length) continue;
          const name=(hMap.name!==-1?String(row[hMap.name]||''):'').trim();
          const pan=(hMap.pan!==-1?String(row[hMap.pan]||''):'').trim();
          if(!name&&!pan) continue;
          if(['nil','name',''].includes(name.toLowerCase())) continue;
          const email=(hMap.email!==-1?String(row[hMap.email]||''):'').trim();
          // Phone fix: Excel stores as number → parse float → remove decimals → take last 10 digits
          let rawPhone = hMap.phone!==-1 ? row[hMap.phone] : '';
          let phone = '';
          if (rawPhone !== '' && rawPhone !== null && rawPhone !== undefined) {
            // Handle numeric type (Excel number cell)
            if (typeof rawPhone === 'number') {
              phone = String(Math.round(rawPhone)); // remove .0
            } else {
              phone = String(rawPhone).trim();
              // Remove any .0 suffix from string conversion
              phone = phone.replace(/\.0+$/, '');
            }
            // Keep only digits
            phone = phone.replace(/\D/g, '');
            // Take last 10 digits if longer (handles +91 prefix stored as number)
            if (phone.length > 10) phone = phone.slice(-10);
          }
          const gstin=(hMap.gstin!==-1?String(row[hMap.gstin]||''):'').trim();
          let type='it';
          if(gstin) type='both';
          let fd={};
          hNames.forEach((h,ci)=>{ if(h) fd[h]=String(row[ci]||'').trim(); });
          const nPan=pan.toUpperCase().replace(/[^A-Z0-9]/g,'');
          const nName=name.toLowerCase().replace(/[^a-z0-9]/g,'');
          let ex=customers.find(c=>{
            const cp=(c.pan||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
            const cn=(c.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
            
            const validPan1 = nPan && nPan.length >= 10;
            const validPan2 = cp && cp.length >= 10;
            
            if (validPan1 && validPan2) {
                return nPan === cp; // If both have PANs, they MUST match
            }
            if (nPan && cp === nPan) return true; // Match by PAN
            
            return nName && cn === nName; // Fallback to Name
          });
          if(ex){
            ex.email=ex.email||email;
            // Always update phone if we found a cleaner one
            if (!ex.phone && phone) ex.phone = phone;
            else if (phone && phone.length >= 10 && (!ex.phone || ex.phone.replace(/\D/g,'').length < 10)) ex.phone = phone;
            ex.gstin=ex.gstin||gstin; ex.pan=ex.pan||pan;
            if(type!=='it') ex.type=type;
            if(!ex.yearlyData){ex.yearlyData={};if(ex.fullData) ex.yearlyData['2025-2026']=ex.fullData;}
            if(!ex.yearlyData[selectedYear]) ex.yearlyData[selectedYear]={};
            ex.yearlyData[selectedYear]={...ex.yearlyData[selectedYear],...fd};
            updated++;
          } else if(isFirst){
            customers.push({id:Date.now()+Math.random(),name,email,phone,gstin,pan,type,status:'pending',yearlyData:{[selectedYear]:fd}});
            added++;
          }
        }
        isFirst=false;
      });
      if(added||updated){
        log(`${added} added, ${updated} updated`,'both','Excel Imported');
        save(); initDashboard(); renderClientsView();
        setTimeout(() => {
          alert(`✅ Import complete!\nAdded: ${added}\nUpdated: ${updated}`);
        }, 50);
      } else alert('No valid client data found.');
    } catch(err) { console.error(err); alert('Error reading file. Check format.'); }
  };
  reader.readAsArrayBuffer(file);
  inp.value='';
};

// ═══════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════
window.exportExcel = function() {
  const rows = [['Name','PAN','GSTIN','Phone','Email','Type','Fee','Collected','GST Status','ITR Status','Ack No','Partners']];
  customers.forEach(c => {
    const partnerStr = (c.partners||[]).map(p=>`${p.name}${p.role?' ('+p.role+')':''}${p.share?' '+p.share+'%':''}`).join(' | ');
    rows.push([c.name,c.pan||'',c.gstin||'',c.phone||'',c.email||'',formatType(c.type),c.fee||0,c.feeCollected||0,c.gstr3bStatus||'pending',c.itrStatus||'pending',c.itrAckNo||'',partnerStr]);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Clients');
  XLSX.writeFile(wb,`NexCA_Clients_${new Date().toISOString().slice(0,10)}.xlsx`);
};
window.exportGstReport = function() {
  const month = document.getElementById('gst-month-sel')?.value || new Date().toISOString().slice(0,7);
  const rows=[['Name','GSTIN','Phone','GSTR-1','GSTR-3B','Docs Received']];
  customers.filter(c=>c.type==='gst'||c.type==='both').forEach(c=>{
    const m=c.monthlyGST?.[month]||{};
    rows.push([c.name,c.gstin||'',c.phone||'',m.gstr1||'pending',m.gstr3b||'pending',m.docsReceived?'Yes':'No']);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'GST Report');
  XLSX.writeFile(wb,`NexCA_GST_${month}.xlsx`);
};
window.exportItReport = function() {
  const rows=[['Name','PAN','Phone','ITR Type','Ack No','Status','Refund','Demand']];
  customers.filter(c=>c.type==='it'||c.type==='both').forEach(c=>{
    const yd=c.yearlyData; let refund='',demand='';
    if(yd){const latest=Object.keys(yd).sort().reverse()[0];if(latest){const d=yd[latest];refund=d['IT REFUND IF ANY']||d['REFUND RECEIVED']||'';demand=d['OUTSTANDING DEMAND']||'';}}
    rows.push([c.name,c.pan||'',c.phone||'',c.itrType||'',c.itrAckNo||'',c.itrStatus||'pending',refund,demand]);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'IT Report');
  XLSX.writeFile(wb,`NexCA_IT_Returns.xlsx`);
};
window.exportFeeReport = function() {
  const rows=[['Name','Type','Annual Fee','Collected','Pending']];
  customers.forEach(c=>{
    const fee=Number(c.fee||0),col=Number(c.feeCollected||0);
    rows.push([c.name,formatType(c.type),fee,col,fee-col]);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Fee Tracker');
  XLSX.writeFile(wb,`NexCA_Fees.xlsx`);
};

// ═══════════════════════════════════════════════
//  CALCULATORS
// ═══════════════════════════════════════════════
window.calcGST = function() {
  const amt=parseFloat(document.getElementById('gst-amt')?.value)||0;
  const rate=parseFloat(document.getElementById('gst-rate')?.value)||0;
  const mode=document.getElementById('gst-mode')?.value;
  let base,gst,total;
  if(mode==='add'){base=amt;gst=amt*rate/100;total=base+gst;}
  else{total=amt;base=amt*100/(100+rate);gst=total-base;}
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=fmtINR(v); };
  set('gr-base',base); set('gr-cgst',gst/2); set('gr-sgst',gst/2); set('gr-igst',gst); set('gr-total',total);
};
window.calcIT = function() {
  const gross=parseFloat(document.getElementById('it-income')?.value)||0;
  const ded=parseFloat(document.getElementById('it-ded')?.value)||0;
  const nTax=(g=>{
    let t=0, x=Math.max(0,g-75000);
    if(x<=700000) return 0;
    let r=x; if(r>1500000){t+=(r-1500000)*.30;r=1500000;} if(r>1200000){t+=(r-1200000)*.20;r=1200000;} if(r>1000000){t+=(r-1000000)*.15;r=1000000;} if(r>700000){t+=(r-700000)*.10;r=700000;} if(r>300000){t+=(r-300000)*.05;} return t;
  })(gross);
  const nTaxable=Math.max(0,gross-75000), nCess=nTax*.04, nTotal=nTax+nCess;
  const oTax=(g=>{
    let t=0,x=Math.max(0,g-50000-ded);
    if(x<=500000) return 0;
    let r=x; if(r>1000000){t+=(r-1000000)*.30;r=1000000;} if(r>500000){t+=(r-500000)*.20;r=500000;} if(r>250000){t+=(r-250000)*.05;} return t;
  })(gross);
  const oTaxable=Math.max(0,gross-50000-ded), oCess=oTax*.04, oTotal=oTax+oCess;
  [['itn-tax',nTaxable],['itn-slab',nTax],['itn-cess',nCess],['itn-total',nTotal],['ito-tax',oTaxable],['ito-slab',oTax],['ito-cess',oCess],['ito-total',oTotal]].forEach(([id,v])=>{const el=document.getElementById(id);if(el) el.textContent=fmtINR(v);});
  const rec=document.getElementById('it-rec');
  if(rec){
    const diff=Math.abs(nTotal-oTotal);
    if(nTotal<oTotal){rec.textContent=`✅ New Regime saves ${fmtINR(diff)}!`;rec.style.cssText='background:rgba(5,150,105,.08);border-color:rgba(5,150,105,.25);color:var(--emerald)';}
    else if(oTotal<nTotal){rec.textContent=`✅ Old Regime saves ${fmtINR(diff)}!`;rec.style.cssText='background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.25);color:var(--accent)';}
    else{rec.textContent='Both regimes equal tax.';rec.style.cssText='background:var(--bg-3);border-color:var(--border);color:var(--txt-muted)';}
  }
};
window.calcLate = function() {
  const liab=parseFloat(document.getElementById('lf-liab')?.value)||0;
  const due=document.getElementById('lf-due')?.value;
  const filed=document.getElementById('lf-filed')?.value;
  const nil=document.getElementById('lf-nil')?.checked;
  let days=0,fee=0,interest=0;
  if(due&&filed){ const d=Math.floor((new Date(filed)-new Date(due))/86400000); if(d>0) days=d; }
  fee=Math.min(days*(nil?20:50),nil?500:5000);
  if(days>0&&liab>0&&!nil) interest=liab*.18*(days/365);
  [['lf-days',days+' Days'],['lf-fee',fmtINR(fee)],['lf-int',fmtINR(interest)],['lf-total',fmtINR(fee+interest)]].forEach(([id,v])=>{const el=document.getElementById(id);if(el) el.textContent=v;});
};
window.calcTDS = function() {
  const sel=document.getElementById('tds-nature'); if(!sel) return;
  const panAvail=document.getElementById('tds-pan')?.value==='yes';
  const amt=parseFloat(document.getElementById('tds-amount')?.value)||0;
  let rate=parseFloat(sel.options[sel.selectedIndex]?.dataset?.rate||10);
  if(!panAvail) rate=Math.max(rate,20);
  const tds=amt*rate/100;
  document.getElementById('tds-rate-show').textContent=rate+'%';
  document.getElementById('tds-amt-show').textContent=fmtINR(tds);
  document.getElementById('tds-net-show').textContent=fmtINR(amt-tds);
};

// ═══════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════
function loadSettings() {
  document.getElementById('s-firm').value=profile.firm||'';
  document.getElementById('s-owner').value=profile.owner||'';
  document.getElementById('s-memno').value=profile.memno||'';
  document.getElementById('s-phone').value=profile.phone||'';
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  document.getElementById('s-dark-toggle').checked=isDark;
}
window.saveProfile = function() {
  profile.firm=document.getElementById('s-firm').value;
  profile.owner=document.getElementById('s-owner').value;
  profile.memno=document.getElementById('s-memno').value;
  profile.phone=document.getElementById('s-phone').value;
  localStorage.setItem(PROF_KEY,JSON.stringify(profile));
  alert('Profile saved!');
};
window.deleteAllData = function() {
  if(!confirm('Permanently delete ALL data? This cannot be undone!')) return;
  if(!confirm('Final confirmation — wipe everything?')) return;
  localStorage.removeItem(DB_KEY); localStorage.removeItem(ACT_KEY);
  localStorage.removeItem(CRED_KEY);
  customers=[]; activity=[];
  save(); initDashboard(); renderClientsView();
  alert('All data wiped.');
};

// ── Fix existing phone numbers (strip .0, keep 10 digits) ──
window.fixAllPhones = function() {
  let fixed = 0;
  customers.forEach(c => {
    if (!c.phone) return;
    const raw = String(c.phone).replace(/\.0+$/,'').replace(/\D/g,'');
    const clean = raw.length > 10 ? raw.slice(-10) : raw;
    if (clean !== c.phone) { c.phone = clean; fixed++; }
  });
  save(); renderClientsView(); renderGstView(); renderItView();
  alert(`Fixed ${fixed} phone number${fixed!==1?'s':''}!`);
};

// ── Copy to clipboard utility ──
window.copyToClipboard = function(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label||'Copied'} ✓`, 'success');
  }).catch(() => {
    showToast('Copy failed', 'error');
  });
};

// ── Toast notification ──
window.showToast = function(msg, type='success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const bg = type==='success'?'var(--emerald)':type==='error'?'var(--danger)':'var(--navy)';
  toast.style.cssText = `background:${bg};color:#fff;padding:9px 20px;border-radius:8px;font-size:.82rem;font-weight:600;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);animation:fadeUp .2s ease;pointer-events:none`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
};
window.onYearChange = function() { if(currentView==='gst') renderGstView(); };

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
initDashboard();
renderClientsView();
calcGST();
calcTDS();
