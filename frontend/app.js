// =========================
//  FRONTEND APP.JS (ENHANCED)
// =========================

// API base — preserved and explicit
const API = (typeof window !== 'undefined' && window.API)
  ? window.API
  : "https://rupayana.onrender.com";

console.log("[app] Using API base:", API);

// ---------- Helpers ----------
function el(id){ return document.getElementById(id) || null; }
function showSpinner(show){
  const s = el('global-spinner');
  if (!s) return;
  if (show) s.classList.add('active'); else s.classList.remove('active');
}
function saveUser(user){
  try {
    sessionStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("rupayana_user", JSON.stringify(user));
  } catch(e){ console.warn("saveUser error", e); }
}
function getUser(){
  try {
    return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("rupayana_user") || "null");
  } catch(e){ return null; }
}
function restoreUser(){
  if(!sessionStorage.getItem("user") && localStorage.getItem("rupayana_user")){
    sessionStorage.setItem("user", localStorage.getItem("rupayana_user"));
  }
}

// ---------- safeFetch with spinner ----------
async function safeFetch(url, opts = {}){
  const full = url.startsWith('http') ? url : API + url;
  const defaults = { credentials:'include', headers:{ 'Accept':'application/json' } };
  const final = Object.assign({}, defaults, opts); final.headers = Object.assign({}, defaults.headers, opts.headers || {});
  console.log('[safeFetch] ->', final.method || 'GET', full);
  showSpinner(true);
  try {
    const res = await fetch(full, final);
    const text = await res.text().catch(()=> '');
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch(e){ json = null; }
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.removeItem('user'); localStorage.removeItem('rupayana_user');
        renderApp();
        throw new Error(json?.message || json?.error || 'Invalid credentials');
      }
      throw new Error(json?.message || json?.error || text || `HTTP ${res.status}`);
    }
    return json;
  } catch(err){
    console.error('[safeFetch] error', err);
    throw err;
  } finally { showSpinner(false); }
}

// ---------- UI rendering ----------
function showAuth(){
  if (el('auth')) el('auth').style.display = 'block';
  if (el('dashboard')) el('dashboard').style.display = 'none';
  if (el('logout-btn')) el('logout-btn').style.display = 'none';
  if (el('user-chip')) el('user-chip').style.display = 'none';
}
function animateBalanceElm(amount){
  const elBal = el('balance');
  if (!elBal) return;
  const start = Number(elBal.dataset.current || 0);
  const end = Number(amount || 0);
  elBal.dataset.current = end;
  const dur = 700; const t0 = performance.now();
  function step(now){
    const t = Math.min(1, (now - t0)/dur);
    const eased = (--t)*t*t+1;
    const val = Math.round(start + (end - start)*eased);
    elBal.innerText = '₹ ' + val.toLocaleString();
    if (now - t0 < dur) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- Profile picture handling ----------
const PROFILE_PIC_KEY = 'rupayana_profile_pic';
function loadProfilePic(){
  const data = localStorage.getItem(PROFILE_PIC_KEY);
  if (data) {
    const imgs = document.querySelectorAll('#profile-pic-display, #sidebar-avatar, #user-avatar');
    imgs.forEach(i => { if (i) i.src = data; });
  } else {
    // set placeholders (gradient background handled by CSS)
    const imgs = document.querySelectorAll('#profile-pic-display, #sidebar-avatar, #user-avatar');
    imgs.forEach(i => { if (i) i.src = ''; });
  }
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

// ---------- Chart (vanilla canvas sparkline) ----------
function drawChart(values){
  const canvas = el('balance-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  if (!values || !values.length) {
    // draw placeholder
    ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.font = '12px sans-serif'; ctx.fillText('No data', 8, 20);
    return;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = 12;
  ctx.lineWidth = 2;
  // gradient stroke
  const g = ctx.createLinearGradient(0,0,w,0);
  g.addColorStop(0, 'rgba(110,140,255,0.9)');
  g.addColorStop(1, 'rgba(126,211,255,0.9)');
  ctx.strokeStyle = g;
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x = pad + (i/(values.length-1))*(w-2*pad || 0);
    const y = h - pad - ((v - min) / (max - min || 1))*(h - 2*pad);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // fill under curve
  ctx.lineTo(w-pad, h-pad);
  ctx.lineTo(pad, h-pad);
  ctx.closePath();
  const gradFill = ctx.createLinearGradient(0,0,0,h);
  gradFill.addColorStop(0, 'rgba(110,140,255,0.12)');
  gradFill.addColorStop(1, 'rgba(110,140,255,0.02)');
  ctx.fillStyle = gradFill;
  ctx.fill();
}

// ---------- show / update dashboard ----------
async function showDashboard(user){
  if (!user) return showAuth();
  if (el('auth')) el('auth').style.display = 'none';
  if (el('dashboard')) el('dashboard').style.display = 'block';
  if (el('user-chip')) el('user-chip').style.display = 'flex';
  if (el('logout-btn')) el('logout-btn').style.display = 'inline-block';
  if (el('user-name')) el('user-name').innerText = user.name || user.email;
  if (el('acct-name-right')) el('acct-name-right').innerText = user.name || user.email;
  if (el('acct-email-right')) el('acct-email-right').innerText = user.email || '';
  if (el('acct-email')) el('acct-email').innerText = user.email || 'not signed in';
  animateBalanceElm(user.balance || 0);
  loadTransactionsForCurrentUser().catch(console.warn);
  saveUser(user);
}

// ---------- Auth handlers ----------
async function loginHandler(e){
  if (e && e.preventDefault) e.preventDefault();
  const email = (el('login-email') && el('login-email').value.trim().toLowerCase()) || '';
  const password = (el('login-password') && el('login-password').value) || '';
  if (!email || !password){ if (el('login-msg')) el('login-msg').innerText = 'Enter email & password'; return; }
  try {
    const data = await safeFetch('/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password })
    });
    if (data && data.user){
      saveUser(data.user);
      showDashboard(data.user);
      if (el('login-msg')) el('login-msg').innerText = '';
      loadProfilePic();
    } else {
      if (el('login-msg')) el('login-msg').innerText = 'Login failed';
    }
  } catch(err){
    if (el('login-msg')) el('login-msg').innerText = err.message || 'Login error';
  }
}

async function registerHandler(e){
  if (e && e.preventDefault) e.preventDefault();
  const name = (el('reg-name') && el('reg-name').value) || '';
  const email = (el('reg-email') && el('reg-email').value.trim().toLowerCase()) || '';
  const phone = (el('reg-phone') && el('reg-phone').value) || '';
  const password = (el('reg-password') && el('reg-password').value) || '';
  if (!email || !password) { if (el('reg-msg')) el('reg-msg').innerText = 'Enter email & password'; return; }
  try {
    const data = await safeFetch('/api/register', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, phone, password })
    });
    if (el('reg-msg')) el('reg-msg').innerText = data?.message || 'Registered';
    if (data && data.user) { saveUser(data.user); showDashboard(data.user); loadProfilePic(); }
  } catch(err){
    if (el('reg-msg')) el('reg-msg').innerText = err.message || 'Register error';
  }
}

// ---------- Logout ----------
function logout(){
  safeFetch('/api/logout', { method:'POST' }).catch(()=>{});
  sessionStorage.removeItem('user'); localStorage.removeItem('rupayana_user');
  renderApp();
}
window.logout = logout;

// ---------- Profile update ----------
async function updateProfileHandler(){
  const user = getUser();
  if (!user) return alert('Please login');
  const name = (el('profile-name') && el('profile-name').value) || user.name || '';
  const phone = (el('profile-phone') && el('profile-phone').value) || user.phone || '';
  try {
    const res = await safeFetch('/api/update-profile', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: user.email, name, phone })
    });
    if (res && res.user) { saveUser(res.user); showDashboard(res.user); }
    alert(res?.message || 'Profile saved');
  } catch(err){ alert(err.message || 'Profile save error'); }
}

// ---------- Bill / Transfer ----------
async function billPayHandler(){
  const user = getUser(); if (!user) return alert('Login first');
  const biller = (el('biller') && el('biller').value) || '';
  const amount = (el('bamount') && el('bamount').value) || '';
  if (!biller || !amount) return alert('Enter biller & amount');
  try {
    const res = await safeFetch('/api/billpay', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: user.email, biller, amount })
    });
    alert(res?.message || 'Bill paid');
    loadTransactionsForCurrentUser();
  } catch(err){ alert(err.message || 'Bill pay failed'); }
}

async function transferHandler(){
  const user = getUser(); if (!user) return alert('Login first');
  const toEmail = (el('to-email') && el('to-email').value.trim().toLowerCase()) || '';
  const amount = (el('tamount') && el('tamount').value) || '';
  if (!toEmail || !amount) return alert('Enter recipient & amount');
  try {
    const res = await safeFetch('/api/transfer', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fromEmail: user.email, toEmail, amount })
    });
    alert(res?.message || 'Transfer complete');
    loadTransactionsForCurrentUser();
  } catch(err){ alert(err.message || 'Transfer failed'); }
}

// ---------- Transactions ----------
async function loadTransactionsForCurrentUser(){
  const user = getUser();
  const listContainer = el('tx-list');
  if (!user) {
    if (listContainer) listContainer.innerHTML = '<div class="muted">Please login to view transactions</div>';
    return;
  }
  try {
    const res = await safeFetch(`/api/transactions?email=${encodeURIComponent(user.email)}`);
    const list = (res && res.transactions) ? res.transactions : [];
    if (listContainer) {
      if (!list.length) listContainer.innerHTML = '<div class="muted">No transactions</div>';
      else {
        listContainer.innerHTML = list.map(t => {
          const ts = t.created_at ? new Date(Number(t.created_at) * (String(t.created_at).length > 10 ? 1 : 1000)).toLocaleString() : '';
          return `<div class="tx-item" style="display:flex;justify-content:space-between;padding:10px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.01)">
            <div><strong>${t.type}</strong><div class="muted small">${t.details || t.to_email || ''}</div></div>
            <div style="text-align:right"><div style="font-weight:700">₹ ${t.amount}</div><div class="muted small">${ts}</div></div>
          </div>`;
        }).join('');
      }
    }
    // update stats and chart
    const amounts = list.slice(0, 12).map(x => Number(x.amount) || 0).reverse();
    const txCount = list.length;
    if (el('stat-tx')) el('stat-tx').innerText = txCount;
    if (el('stat-recent')) el('stat-recent').innerText = list[0] ? list[0].details || list[0].to_email || '—' : '—';
    drawChart(amounts);
  } catch(err){ if (listContainer) listContainer.innerHTML = `<div class="muted">Error: ${err.message}</div>`; }
}

// ---------- Panels (dynamic) ----------
function setPanel(html){ if (el('panel-body')) el('panel-body').innerHTML = html; }

function showTransfer(){
  setPanel(`
    <h4>Transfer</h4>
    <label>To (email)</label><input id="to-email" class="input" placeholder="recipient@domain">
    <label>Amount</label><input id="tamount" class="input" placeholder="Amount">
    <div style="margin-top:10px" class="row gap"><button id="do-transfer" class="btn-primary">Send</button> <button class="btn-ghost" onclick="renderApp()">Cancel</button></div>
  `);
  const btn = el('do-transfer'); if (btn) btn.addEventListener('click', transferHandler);
}

function showBill(){
  setPanel(`
    <h4>Bill Pay</h4>
    <label>Biller</label><input id="biller" class="input" placeholder="Electricity">
    <label>Amount</label><input id="bamount" class="input" placeholder="Amount">
    <div style="margin-top:10px" class="row gap"><button id="do-bill" class="btn-primary">Pay</button> <button class="btn-ghost" onclick="renderApp()">Cancel</button></div>
  `);
  const btn = el('do-bill'); if (btn) btn.addEventListener('click', billPayHandler);
}

function showProfile(){
  const user = getUser() || { name:'', phone:'' };
  setPanel(`
    <h4>Profile</h4>
    <label>Name</label><input id="profile-name" class="input" value="${user.name || ''}">
    <label>Phone</label><input id="profile-phone" class="input" value="${user.phone || ''}">
    <div style="margin-top:10px" class="row gap"><button id="profile-save" class="btn-primary">Save</button> <button class="btn-ghost" onclick="renderApp()">Cancel</button></div>
  `);
  const btn = el('profile-save'); if (btn) btn.addEventListener('click', updateProfileHandler);
}

function showTx(){
  setPanel('<h4>Transactions</h4><div id="tx-list" style="margin-top:12px"></div>');
  loadTransactionsForCurrentUser();
}

// ---------- sidebar collapse ----------
function toggleSidebar(){
  const sb = el('sidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
}
function attachSidebarToggle(){
  const t = el('sidebar-toggle');
  if (t) t.addEventListener('click', toggleSidebar);
}

// ---------- profile picture UI wiring ----------
function attachProfilePicUI(){
  const fileInput = el('profile-pic-input');
  const changeBtn = el('btn-change-pic');
  if (changeBtn) changeBtn.addEventListener('click', ()=> fileInput && fileInput.click());
  if (fileInput){
    fileInput.addEventListener('change', (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if (f) handleProfilePicFile(f);
    });
  }
  loadProfilePic();
}

// ---------- render app based on session ----------
function renderApp(){
  restoreUser();
  const user = getUser();
  if (user) showDashboard(user);
  else showAuth();
}

// ---------- wiring DOM after load ----------
document.addEventListener('DOMContentLoaded', function(){
  // attach handlers
  attachSidebarToggle();
  attachProfilePicUI();

  const loginBtn = el('btn-login'); if (loginBtn) loginBtn.addEventListener('click', loginHandler);
  const registerBtn = el('btn-register'); if (registerBtn) registerBtn.addEventListener('click', registerHandler);
  const logoutBtn = el('logout-btn'); if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // quick action buttons
  const qt = el('quick-transfer'); if (qt) qt.addEventListener('click', ()=>{ showTransfer(); document.querySelectorAll('.menu-btn').forEach(b=>b.classList.remove('active')); });
  const qb = el('quick-bill'); if (qb) qb.addEventListener('click', ()=>{ showBill(); });
  const qh = el('quick-history'); if (qh) qh.addEventListener('click', ()=>{ showTx(); });

  // menu buttons: preserve data-index usage
  document.querySelectorAll('.menu-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.menu-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const id = b.id;
      if (id === 'menu-overview') renderApp();
      if (id === 'menu-transfer') showTransfer();
      if (id === 'menu-bill') showBill();
      if (id === 'menu-history') showTx();
      if (id === 'menu-profile') showProfile();
    });
  });

  // toggles inside auth (back-to-login)
  const sReg = el('show-register'); if (sReg) sReg.addEventListener('click', ()=>{ el('reg-email') && el('reg-email').focus(); });
  const sLogin = el('show-login'); if (sLogin) sLogin.addEventListener('click', ()=>{ el('login-email') && el('login-email').focus(); });

  // profile picture load
  loadProfilePic();

  // spinner element exists in DOM; ensure hidden
  showSpinner(false);

  // initial render
  renderApp();
});










