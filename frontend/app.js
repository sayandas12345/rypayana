// FRONTEND APP.JS — updated with avatar generator & extra content

const API = (typeof window !== 'undefined' && window.API)
  ? window.API
  : "https://rupayana.onrender.com";

console.log("[app] Using API base:", API);

// ---------- helpers ----------
function el(id){ return document.getElementById(id) || null; }
function showSpinner(show){ const s = el('global-spinner'); if (!s) return; if (show) s.classList.add('active'); else s.classList.remove('active'); }
function saveUser(user){ try { sessionStorage.setItem("user", JSON.stringify(user)); localStorage.setItem("rupayana_user", JSON.stringify(user)); } catch(e){ console.warn("saveUser", e); } }
function getUser(){ try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("rupayana_user") || "null"); } catch(e){ return null; } }
function restoreUser(){ if(!sessionStorage.getItem("user") && localStorage.getItem("rupayana_user")) sessionStorage.setItem("user", localStorage.getItem("rupayana_user")); }

// ---------- avatar SVG generator (data URI) ----------
function svgAvatarDataUri(name = "R", size = 128) {
  const initial = (name && String(name).trim().charAt(0).toUpperCase()) || "R";
  // choose a background gradient based on char code
  const code = initial.charCodeAt(0);
  const a1 = ['#6e8cff','#7ed3ff','#ffd36e','#ff9f6e','#b388ff'][code % 5];
  const a2 = ['#7ed3ff','#6e8cff','#ff9f6e','#b388ff','#ffd36e'][(code+2) % 5];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
      <defs>
        <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
          <stop offset='0' stop-color='${a1}' />
          <stop offset='1' stop-color='${a2}' />
        </linearGradient>
      </defs>
      <rect rx="${Math.round(size*0.18)}" width='100%' height='100%' fill='url(#g)' />
      <text x='50%' y='58%' text-anchor='middle' font-family='Inter,Arial' font-size='${Math.round(size*0.5)}' fill='white' font-weight='700'>${initial}</text>
    </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ---------- profile pic logic ----------
const PROFILE_PIC_KEY = 'rupayana_profile_pic';
function loadProfilePic() {
  const stored = localStorage.getItem(PROFILE_PIC_KEY);
  const user = getUser();
  const name = user ? (user.name || user.email || 'R') : 'R';
  const fallback = svgAvatarDataUri(name, 128);

  const sel = ['profile-pic-display','sidebar-avatar','user-avatar'];
  sel.forEach(id => {
    const img = el(id);
    if (!img) return;
    if (stored) img.src = stored;
    else img.src = fallback;
  });
}

function handleProfilePicFile(file){
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    const data = e.target.result;
    localStorage.setItem(PROFILE_PIC_KEY, data);
    loadProfilePic();
  };
  reader.readAsDataURL(file);
}

// ---------- safeFetch with spinner ----------
async function safeFetch(url, opts = {}) {
  const full = url.startsWith('http') ? url : API + url;
  const defaults = { credentials: 'include', headers: { 'Accept': 'application/json' } };
  const final = Object.assign({}, defaults, opts);
  final.headers = Object.assign({}, defaults.headers, opts.headers || {});
  console.log('[safeFetch]', final.method || 'GET', full);
  showSpinner(true);
  try {
    const res = await fetch(full, final);
    const txt = await res.text().catch(()=>'');
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = null; }
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.removeItem('user'); localStorage.removeItem('rupayana_user'); renderApp();
        throw new Error(json?.message || 'Invalid credentials');
      }
      throw new Error(json?.message || txt || `HTTP ${res.status}`);
    }
    return json;
  } catch(err){
    console.error('[safeFetch] error', err);
    throw err;
  } finally { showSpinner(false); }
}

// ---------- chart drawing ----------
function drawChart(values){
  const canvas = el('balance-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  if (!values || !values.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.font = '12px Arial'; ctx.fillText('No transaction data', 12, 20);
    return;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = 10;
  ctx.lineWidth = 2;
  const grad = ctx.createLinearGradient(0,0,w,0);
  grad.addColorStop(0, 'rgba(110,140,255,0.95)');
  grad.addColorStop(1, 'rgba(126,211,255,0.95)');
  ctx.strokeStyle = grad;
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x = pad + (i/(values.length-1))*(w-2*pad||0);
    const y = h - pad - ((v - min)/(max - min || 1))*(h-2*pad);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.lineTo(w-pad,h-pad); ctx.lineTo(pad,h-pad); ctx.closePath();
  const fill = ctx.createLinearGradient(0,0,0,h);
  fill.addColorStop(0, 'rgba(110,140,255,0.12)'); fill.addColorStop(1,'rgba(110,140,255,0.02)');
  ctx.fillStyle = fill; ctx.fill();
}

// ---------- UI population helpers ----------
function populateVendorsIfEmpty(){
  const ul = el('vendor-list');
  if (!ul) return;
  if (ul.children.length) return;
  const vendors = [
    {name:'Electricity Co.', note:'Due 20 Nov'},
    {name:'Water Supply', note:'Auto-pay available'},
    {name:'Mobile Carrier', note:'₹ 249 / month'},
    {name:'Internet Provider', note:'Next bill 02 Dec'}
  ];
  ul.innerHTML = vendors.map(v=>`<li><div>${v.name}</div><div class="muted small">${v.note}</div></li>`).join('');
}

function populateActivityIfEmpty(){
  const feed = el('activity-feed');
  if (!feed) return;
  if (feed.children.length) return;
  const items = [
    {t:'Paid Electricity', a:'₹ 1,200', time:'2 days ago'},
    {t:'Sent money to shop@upi', a:'₹ 450', time:'3 days ago'},
    {t:'Recharge mobile', a:'₹ 199', time:'5 days ago'}
  ];
  feed.innerHTML = items.map(i=>{
    return `<div class="tx-item"><div style="display:flex;justify-content:space-between"><div><strong>${i.t}</strong><div class="muted small">${i.time}</div></div><div style="text-align:right"><div style="font-weight:700">${i.a}</div></div></div></div>`;
  }).join('');
}

function populateNotificationsIfEmpty(){
  const n = el('notifications');
  if (!n) return;
  if (n.dataset.loaded) return;
  n.innerHTML = `<div class="muted small">No critical notifications. Tip: upload a profile picture for personalization.</div>`;
  n.dataset.loaded = '1';
}

// ---------- transactions loading & stats ----------
async function loadTransactionsForCurrentUser(){
  const user = getUser();
  const listContainer = el('tx-list');
  if (!user){
    if (listContainer) listContainer.innerHTML = '<div class="muted">Please login to view transactions</div>';
    // also draw empty chart and populate sample feed
    drawChart([]);
    populateActivityIfEmpty();
    populateVendorsIfEmpty();
    populateNotificationsIfEmpty();
    return;
  }
  try {
    const res = await safeFetch(`/api/transactions?email=${encodeURIComponent(user.email)}`);
    const list = (res && res.transactions) ? res.transactions : [];
    // render list in panel (if panel present)
    if (listContainer) {
      if (!list.length) listContainer.innerHTML = '<div class="muted">No transactions</div>';
      else listContainer.innerHTML = list.map(t=>{
        const ts = t.created_at ? new Date(Number(t.created_at) * (String(t.created_at).length>10?1:1000)).toLocaleString() : '';
        return `<div class="tx-item"><div style="display:flex;justify-content:space-between"><div><strong>${t.type}</strong><div class="muted small">${t.details || t.to_email || ''}</div></div><div style="text-align:right"><div style="font-weight:700">₹ ${t.amount}</div><div class="muted small">${ts}</div></div></div></div>`;
      }).join('');
    }
    // stats & chart
    const amounts = list.slice(0,12).map(x=>Number(x.amount)||0).reverse();
    if (el('stat-tx')) el('stat-tx').innerText = list.length;
    if (el('stat-recent')) el('stat-recent').innerText = list[0] ? (list[0].details || list[0].to_email || '—') : '—';
    drawChart(amounts);
  } catch(err){
    if (listContainer) listContainer.innerHTML = `<div class="muted">Error: ${err.message}</div>`;
    drawChart([]);
  }
}

// ---------- panels (transfer, bill, profile, tx) ----------
function setPanel(html){ if (el('panel-body')) el('panel-body').innerHTML = html; }

function showTransfer(){
  setPanel(`
    <h4>Transfer</h4>
    <label>To (email)</label><input id="to-email" class="input" placeholder="recipient@domain">
    <label>Amount</label><input id="tamount" class="input" placeholder="Amount">
    <div style="margin-top:10px" class="row gap"><button id="do-transfer" class="btn-primary">Send</button> <button class="btn-ghost" onclick="renderApp()">Cancel</button></div>
  `);
  const btn = el('do-transfer'); if (btn) btn.addEventListener('click', async ()=>{
    // re-use transfer handler logic to keep endpoints unchanged
    const user = getUser(); if (!user) return alert('Login first');
    const toEmail = (el('to-email') && el('to-email').value.trim().toLowerCase()) || '';
    const amount = (el('tamount') && el('tamount').value) || '';
    if (!toEmail || !amount) return alert('Enter recipient & amount');
    try {
      const r = await safeFetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fromEmail: user.email, toEmail, amount })});
      alert(r?.message || 'Transfer complete'); loadTransactionsForCurrentUser();
    } catch(e){ alert(e.message || 'Transfer failed'); }
  });
}

function showBill(){
  setPanel(`
    <h4>Bill Pay</h4>
    <label>Biller</label><input id="biller" class="input" placeholder="Electricity">
    <label>Amount</label><input id="bamount" class="input" placeholder="Amount">
    <div style="margin-top:10px" class="row gap"><button id="do-bill" class="btn-primary">Pay</button> <button class="btn-ghost" onclick="renderApp()">Cancel</button></div>
  `);
  const btn = el('do-bill'); if (btn) btn.addEventListener('click', async ()=>{
    const user = getUser(); if (!user) return alert('Login first');
    const biller = (el('biller') && el('biller').value) || '';
    const amount = (el('bamount') && el('bamount').value) || '';
    if (!biller || !amount) return alert('Enter biller & amount');
    try {
      const r = await safeFetch('/api/billpay', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email:user.email, biller, amount })});
      alert(r?.message || 'Bill paid'); loadTransactionsForCurrentUser();
    } catch(e){ alert(e.message || 'Bill failed'); }
  });
}

function showProfile(){
  const user = getUser() || { name:'', phone:'' };
  setPanel(`
    <h4>Profile</h4>
    <label>Name</label><input id="profile-name" class="input" value="${user.name||''}">
    <label>Phone</label><input id="profile-phone" class="input" value="${user.phone||''}">
    <div style="margin-top:10px" class="row gap"><button id="profile-save" class="btn-primary">Save</button> <button class="btn-ghost" onclick="renderApp()">Cancel</button></div>
  `);
  const btn = el('profile-save'); if (btn) btn.addEventListener('click', async ()=>{
    const user = getUser(); if (!user) return alert('Login first');
    const name = (el('profile-name') && el('profile-name').value) || '';
    const phone = (el('profile-phone') && el('profile-phone').value) || '';
    try {
      const res = await safeFetch('/api/update-profile', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: user.email, name, phone })});
      if (res?.user) { saveUser(res.user); showDashboard(res.user); }
      alert(res?.message || 'Profile updated');
    } catch(e){ alert(e.message || 'Profile update failed'); }
  });
}

function showTx(){
  setPanel('<h4>Transactions</h4><div id="tx-list" style="margin-top:12px"></div>');
  loadTransactionsForCurrentUser();
}

// ---------- auth: login/register/logout ----------
async function loginHandler(e){
  if (e && e.preventDefault) e.preventDefault();
  const email = (el('login-email') && el('login-email').value.trim().toLowerCase()) || '';
  const password = (el('login-password') && el('login-password').value) || '';
  if (!email || !password){ if (el('login-msg')) el('login-msg').innerText = 'Enter email & password'; return; }
  try {
    const data = await safeFetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password })});
    if (data && data.user){ saveUser(data.user); showDashboard(data.user); loadProfilePic(); }
    else { if (el('login-msg')) el('login-msg').innerText = 'Login failed'; }
  } catch(err){ if (el('login-msg')) el('login-msg').innerText = err.message || 'Login error'; }
}

async function registerHandler(e){
  if (e && e.preventDefault) e.preventDefault();
  const name = (el('reg-name') && el('reg-name').value) || '';
  const email = (el('reg-email') && el('reg-email').value.trim().toLowerCase()) || '';
  const phone = (el('reg-phone') && el('reg-phone').value) || '';
  const password = (el('reg-password') && el('reg-password').value) || '';
  if (!email || !password){ if (el('reg-msg')) el('reg-msg').innerText = 'Enter email & password'; return; }
  try {
    const data = await safeFetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, phone, password })});
    if (el('reg-msg')) el('reg-msg').innerText = data?.message || 'Registered';
    if (data && data.user){ saveUser(data.user); showDashboard(data.user); loadProfilePic(); }
  } catch(err){ if (el('reg-msg')) el('reg-msg').innerText = err.message || 'Register error'; }
}

function logout(){
  safeFetch('/api/logout', { method:'POST' }).catch(()=>{});
  sessionStorage.removeItem('user'); localStorage.removeItem('rupayana_user');
  renderApp();
}
window.logout = logout;

// ---------- sidebar toggle & profile pic wiring ----------
function toggleSidebar(){ const sb = el('sidebar'); if (!sb) return; sb.classList.toggle('collapsed'); }
function attachSidebarToggle(){ const t = el('sidebar-toggle'); if (t) t.addEventListener('click', toggleSidebar); }
function attachProfilePicUI(){
  const fileInput = el('profile-pic-input');
  const changeBtn = el('btn-change-pic');
  if (changeBtn) changeBtn.addEventListener('click', ()=> fileInput && fileInput.click());
  if (fileInput) fileInput.addEventListener('change', (ev)=> { const f = ev.target.files && ev.target.files[0]; if (f) handleProfilePicFile(f); });
}

// ---------- show dashboard ----------
async function showDashboard(user){
  if (!user) return renderApp();
  if (el('auth')) el('auth').style.display = 'none';
  if (el('dashboard')) el('dashboard').style.display = 'block';
  if (el('user-chip')) el('user-chip').style.display = 'flex';
  if (el('logout-btn')) el('logout-btn').style.display = 'inline-block';
  if (el('user-name')) el('user-name').innerText = user.name || user.email;
  if (el('acct-name-right')) el('acct-name-right').innerText = user.name || user.email;
  if (el('acct-email-right')) el('acct-email-right').innerText = user.email || '';
  if (el('acct-email')) el('acct-email').innerText = user.email || 'not signed in';
  if (el('balance')) animateBalanceElm(user.balance || 0);
  await loadTransactionsForCurrentUser();
  loadProfilePic();
  populateActivityIfEmpty();
  populateVendorsIfEmpty();
  populateNotificationsIfEmpty();
}

function animateBalanceElm(amount){
  const elb = el('balance');
  if (!elb) return;
  const start = Number(elb.dataset.current || 0);
  const end = Number(amount || 0);
  elb.dataset.current = end;
  const dur = 700; const t0 = performance.now();
  function step(now){
    const t = Math.min(1,(now-t0)/dur); const eased = (--t)*t*t+1;
    const val = Math.round(start + (end - start)*eased);
    elb.innerText = '₹ ' + val.toLocaleString();
    if (now - t0 < dur) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- render app ----------
function renderApp(){
  restoreUser();
  const user = getUser();
  if (user) showDashboard(user);
  else {
    if (el('auth')) el('auth').style.display = 'block';
    if (el('dashboard')) el('dashboard').style.display = 'none';
    if (el('user-chip')) el('user-chip').style.display = 'none';
    if (el('logout-btn')) el('logout-btn').style.display = 'none';
    // default content fill
    populateActivityIfEmpty();
    populateVendorsIfEmpty();
    populateNotificationsIfEmpty();
    drawChart([]);
    loadProfilePic();
  }
}

// ---------- DOM wiring ----------
document.addEventListener('DOMContentLoaded', function(){
  attachSidebarToggle();
  attachProfilePicUI();

  const loginBtn = el('btn-login'); if (loginBtn) loginBtn.addEventListener('click', loginHandler);
  const registerBtn = el('btn-register'); if (registerBtn) registerBtn.addEventListener('click', registerHandler);
  const logoutBtn = el('logout-btn'); if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const qt = el('quick-transfer'); if (qt) qt.addEventListener('click', ()=>{ showTransfer(); });
  const qb = el('quick-bill'); if (qb) qb.addEventListener('click', ()=>{ showBill(); });
  const qh = el('quick-history'); if (qh) qh.addEventListener('click', ()=>{ showTx(); });

  document.querySelectorAll('.menu-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.menu-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      if (b.id === 'menu-overview') renderApp();
      if (b.id === 'menu-transfer') showTransfer();
      if (b.id === 'menu-bill') showBill();
      if (b.id === 'menu-history') showTx();
      if (b.id === 'menu-profile') showProfile();
    });
  });

  const sReg = el('show-register'); if (sReg) sReg.addEventListener('click', ()=> el('reg-email') && el('reg-email').focus());
  const sLogin = el('show-login'); if (sLogin) sLogin.addEventListener('click', ()=> el('login-email') && el('login-email').focus());

  // ensure spinner is hidden
  showSpinner(false);

  // initial app render
  renderApp();
});










