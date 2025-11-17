// frontend/app.js (complete)
const API = (typeof window !== 'undefined' && window.API) ? window.API : (location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : ''));
console.log('[app] Using API base:', API);

function el(id){ return document.getElementById(id) || null; }
function saveUser(user){ try { sessionStorage.setItem("user", JSON.stringify(user)); localStorage.setItem("rupayana_user", JSON.stringify(user)); } catch(e){ console.warn('saveUser error', e); } }
function getUser(){ try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("rupayana_user") || "null"); } catch(e){ return null; } }
function restoreUser(){ if(!sessionStorage.getItem("user") && localStorage.getItem("rupayana_user")){ sessionStorage.setItem("user", localStorage.getItem("rupayana_user")); } }

async function safeFetch(url, opts = {}) {
  const fetchUrl = (url.startsWith('http') ? url : (API + url));
  const defaultOpts = { credentials: 'include', headers: { 'Accept': 'application/json' } };
  const finalOpts = Object.assign({}, defaultOpts, opts);
  finalOpts.headers = Object.assign({}, defaultOpts.headers, opts.headers || {});
  console.log('[safeFetch] =>', finalOpts.method || 'GET', fetchUrl, 'body:', finalOpts.body ? finalOpts.body : null);
  try {
    const res = await fetch(fetchUrl, finalOpts);
    const bodyText = await res.text().catch(()=> '');
    let json = null;
    try { json = bodyText ? JSON.parse(bodyText) : null; } catch(e) { json = null; }
    if (!res.ok) {
      console.error('[safeFetch] HTTP error', res.status, json || bodyText);
      if (res.status === 401) {
        sessionStorage.removeItem('user');
        localStorage.removeItem('rupayana_user');
        try { if (typeof showAuth === 'function') showAuth(); } catch(e){}
        const errMsg = (json && (json.error || json.message)) || bodyText || 'Invalid credentials';
        const err = new Error(errMsg);
        err.raw = json || bodyText;
        throw err;
      }
      const errMsg = (json && (json.error || json.message)) || bodyText || `HTTP ${res.status}`;
      const err = new Error(errMsg);
      err.raw = json || bodyText;
      throw err;
    }
    return json;
  } catch (err) {
    console.error('[safeFetch] Network or fetch error', err);
    throw err;
  }
}

/* UI show/hide */
function showAuth(){ if(el("auth")) el("auth").style.display = "block"; if(el("dashboard")) el("dashboard").style.display = "none"; if(el('logout-btn')) el('logout-btn').style.display = 'none'; }
function showDashboard(user){
  if(!user) return showAuth();
  if(el("auth")) el("auth").style.display = "none";
  if(el("dashboard")) el("dashboard").style.display = "block";
  if(el("user-name")) el("user-name").innerText = user.name || user.email || "";
  if(el("user-name-display")) el("user-name-display").innerText = user.name || user.email || "";
  if(el("acct-email")) el("acct-email").innerText = user.email || "";
  if(el("balance")) el("balance").innerText = user.balance || '0';
  if (el('logout-btn')) el('logout-btn').style.display = 'inline-block';
  saveUser(user);
  loadTransactionsForCurrentUser().catch(e => console.warn('load tx after showDash', e));
}

/* Auth handlers */
async function loginHandler(e){
  try {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const emailRaw = (el("login-email") && el("login-email").value) || "";
    const passwordRaw = (el("login-password") && el("login-password").value) || "";
    const email = String(emailRaw).trim().toLowerCase();
    const password = String(passwordRaw).trim();
    if (!email || !password) { if (el("login-msg")) el("login-msg").innerText = "Enter email & password"; return; }
    const payload = { email, password };
    const fetchUrl = API + "/api/login";
    try {
      const data = await safeFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (data && data.user) {
        saveUser(data.user);
        showDashboard(data.user);
        if (el("login-msg")) el("login-msg").innerText = "";
      } else {
        if (el("login-msg")) el("login-msg").innerText = "Login failed";
      }
    } catch (err) {
      const detail = err && err.raw ? (typeof err.raw === 'string' ? err.raw : JSON.stringify(err.raw)) : err.message;
      if (el("login-msg")) el("login-msg").innerText = `Login error (url: ${fetchUrl}): ${detail || 'Unknown'}`;
      console.warn('login fail detail:', detail);
    }
  } catch(ex){ console.error('loginHandler unexpected', ex); if (el("login-msg")) el("login-msg").innerText = 'Login error'; }
}

async function registerHandler(e){
  try {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const name = (el("reg-name") && el("reg-name").value) || "";
    const emailRaw = (el("reg-email") && el("reg-email").value) || "";
    const phone = (el("reg-phone") && el("reg-phone").value) || "";
    const passwordRaw = (el("reg-password") && el("reg-password").value) || "";
    const email = String(emailRaw).trim().toLowerCase();
    const password = String(passwordRaw).trim();
    if (!email || !password) { if (el("reg-msg")) el("reg-msg").innerText = "Enter email & password"; return; }
    const payload = { name, email, phone, password };
    try {
      const data = await safeFetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const msg = (data && (data.message || (data.user ? 'Registered' : null))) || 'Registered';
      if (el("reg-msg")) el("reg-msg").innerText = msg;
    } catch (err) {
      const detail = err && err.raw ? (typeof err.raw === 'string' ? err.raw : JSON.stringify(err.raw)) : err.message;
      if (el("reg-msg")) el("reg-msg").innerText = detail || "Registration error";
    }
  } catch(ex){ console.error('registerHandler unexpected', ex); if (el("reg-msg")) el("reg-msg").innerText = 'Registration error'; }
}

function logout() {
  safeFetch("/api/logout", { method: "POST" }).catch(()=>{});
  sessionStorage.removeItem('user');
  localStorage.removeItem('rupayana_user');
  showAuth();
}
window.logout = logout;

/* Profile / bill / transfer / txs */
async function updateProfileHandler() {
  const user = getUser();
  if (!user || !user.email) { alert('Not logged in'); return; }
  const name = (el('profile-name') && el('profile-name').value) || user.name || '';
  const phone = (el('profile-phone') && el('profile-phone').value) || user.phone || '';
  try {
    const res = await safeFetch('/api/update-profile', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: user.email, name, phone })
    });
    if (res && res.user) {
      saveUser(res.user);
      showDashboard(res.user);
    }
    alert(res && res.message ? res.message : 'Profile updated');
  } catch (err) {
    alert(err.message || 'Profile update failed');
  }
}

async function billPayHandler() {
  const user = getUser();
  if (!user || !user.email) { alert('Please login'); return; }
  const biller = (el('biller') && el('biller').value) || '';
  const amount = (el('bamount') && el('bamount').value) || '';
  if (!biller || !amount) { alert('Enter biller and amount'); return; }
  try {
    const res = await safeFetch('/api/billpay', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: user.email, biller, amount })
    });
    alert(res && res.message ? res.message : 'Bill paid');
    loadTransactionsForCurrentUser().catch(e => console.warn('reload tx after bill', e));
  } catch (err) {
    alert(err.message || 'Bill pay failed');
  }
}

async function transferHandler() {
  const user = getUser();
  if (!user || !user.email) { alert('Please login'); return; }
  const toEmailRaw = (el('to-email') && el('to-email').value) || '';
  const amount = (el('tamount') && el('tamount').value) || '';
  const toEmail = String(toEmailRaw).trim().toLowerCase();
  if (!toEmail || !amount) { alert('Enter recipient and amount'); return; }
  try {
    const res = await safeFetch('/api/transfer', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ fromEmail: user.email, toEmail, amount })
    });
    alert(res && (res.message || 'Transfer complete') || 'Transfer complete');
    loadTransactionsForCurrentUser().catch(e => console.warn('reload tx after transfer', e));
  } catch (err) {
    alert(err.message || 'Transfer failed');
  }
}

async function loadTransactionsForCurrentUser() {
  const user = getUser();
  const container = el('tx-list');
  if (!user || !user.email) {
    if (container) container.innerHTML = '<div>Please login to view transactions</div>';
    return;
  }
  try {
    const url = `/api/transactions?email=${encodeURIComponent(user.email)}`;
    const res = await safeFetch(url, { method: 'GET' });
    const list = (res && res.transactions) ? res.transactions : [];
    if (!container) return;
    if (!list.length) { container.innerHTML = '<div>No transactions</div>'; return; }
    container.innerHTML = list.map(t => {
      const created = t.created_at ? (Number(t.created_at) > 1000000000 ? new Date(t.created_at * 1000) : new Date(t.created_at)) : null;
      const timeStr = created ? created.toLocaleString() : '';
      const amount = t.amount !== undefined ? `₹ ${t.amount}` : '';
      return `<div style="display:flex;justify-content:space-between;padding:12px 16px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.02);">
        <div><div style="font-weight:600">${t.type || ''}</div><div style="font-size:13px;color:#9aa6bd">${t.details || (t.to_email ? 'To: '+t.to_email : '')}</div></div>
        <div style="text-align:right"><div style="font-weight:700">${amount}</div><div style="font-size:12px;color:#9aa6bd">${timeStr}</div></div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('loadTransactions error', err);
    if (container) container.innerHTML = `<div>Error loading transactions: ${err.message || ''}</div>`;
  }
}

/* UI helper panels */
function setPanel(html) { const panelBody = el('panel-body'); if (!panelBody) return; panelBody.innerHTML = html; }

function showTransfer() {
  setPanel(`
    <h5>Send Money</h5>
    <label>To (email)</label><input id="to-email" class="form-control" placeholder="recipient@domain">
    <label>Amount</label><input id="tamount" class="form-control" placeholder="Amount">
    <div style="margin-top:8px"><button id="transfer-btn">Send</button> <button onclick="showDashboard(getUser())">Cancel</button></div>
  `);
  const btn = el('transfer-btn'); if (btn) btn.addEventListener('click', transferHandler);
}

function showBill() {
  setPanel(`
    <h5>Bill Payment</h5>
    <label>Biller</label><input id="biller" class="form-control" placeholder="Electricity/Vendor">
    <label>Amount</label><input id="bamount" class="form-control" placeholder="Amount">
    <div style="margin-top:8px"><button id="billpay-btn">Pay</button> <button onclick="showDashboard(getUser())">Cancel</button></div>
  `);
  const btn = el('billpay-btn'); if (btn) btn.addEventListener('click', billPayHandler);
}

function showProfile() {
  const user = getUser() || { name:'', email:'', phone:'' };
  setPanel(`
    <h5>Account</h5>
    <label>Name</label><input id="profile-name" value="${(user.name||'')}" />
    <label>Phone</label><input id="profile-phone" value="${(user.phone||'')}" />
    <div style="margin-top:8px"><button id="profile-save-btn">Save</button> <button onclick="showDashboard(getUser())">Cancel</button></div>
  `);
  const btn = el('profile-save-btn'); if (btn) btn.addEventListener('click', updateProfileHandler);
}

function showTx() {
  setPanel('<h5>Transactions</h5><div id="tx-list" style="margin-top:12px"></div>');
  loadTransactionsForCurrentUser();
}

function showForgot() {
  setPanel(`
    <h5>Forgot password</h5>
    <label>Email</label><input id="forgot-email" />
    <div style="margin-top:8px"><button id="forgot-btn">Request reset</button> <button onclick="showAuth()">Cancel</button></div>
  `);
  const btn = el('forgot-btn');
  if (btn) btn.addEventListener('click', async () => {
    const email = (el('forgot-email')||{}).value;
    if (!email) return alert('Enter email');
    try {
      const res = await safeFetch('/api/request-reset', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email })
      });
      alert(res && (res.message || 'Reset requested'));
      showAuth();
    } catch (err) {
      alert(err.message || 'Request failed');
    }
  });
}

/* DOM wiring */
document.addEventListener('DOMContentLoaded', function(){
  restoreUser();
  const btnLogin = el("btn-login"); if (btnLogin) btnLogin.addEventListener('click', loginHandler);
  const btnReg = el("btn-register"); if (btnReg) btnReg.addEventListener('click', registerHandler);
  const logoutBtn = el('logout-btn'); if (logoutBtn) logoutBtn.addEventListener('click', logout);
  const profileBtn = el('profile-save-btn'); if (profileBtn) profileBtn.addEventListener('click', updateProfileHandler);
  const billBtn = el('billpay-btn'); if (billBtn) billBtn.addEventListener('click', billPayHandler);
  const transferBtn = el('transfer-btn'); if (transferBtn) transferBtn.addEventListener('click', transferHandler);

  const user = getUser();
  if (user) showDashboard(user); else showAuth();
});












