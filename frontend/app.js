// frontend/app.js (patched full file)
// Uses window.API or fallback
const API = (typeof window !== 'undefined' && window.API) ? window.API : "https://rupayana.onrender.com";
console.log('[app] Using API base:', API);

/* -----------------------
   Utility helpers
   ----------------------- */
function el(id){ return document.getElementById(id) || null; }
function saveUser(user){
  try {
    sessionStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("rupayana_user", JSON.stringify(user));
  } catch(e) { console.warn('saveUser error', e); }
}
function getUser(){
  try {
    return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("rupayana_user") || "null");
  } catch(e){ return null; }
}
function restoreUser(){
  if(!sessionStorage.getItem("user") && localStorage.getItem("rupayana_user")) {
    sessionStorage.setItem("user", localStorage.getItem("rupayana_user"));
  }
}

/* -----------------------
   safeFetch (with credentials + 401 handling)
   ----------------------- */
async function safeFetch(url, opts = {}) {
  const fetchUrl = (url.startsWith('http') ? url : (API + url));
  const defaultOpts = { credentials: 'include', headers: {} };
  const finalOpts = Object.assign({}, defaultOpts, opts);
  finalOpts.headers = Object.assign({}, defaultOpts.headers, opts.headers || {});

  try {
    const res = await fetch(fetchUrl, finalOpts);
    const bodyText = await res.text().catch(()=>'');
    let json = null;
    try { json = bodyText ? JSON.parse(bodyText) : null; } catch(e) { json = null; }

    if (!res.ok) {
      console.error('[safeFetch] HTTP error', res.status, json || bodyText);
      if (res.status === 401) {
        // global logout/cleanup
        sessionStorage.removeItem('user');
        localStorage.removeItem('rupayana_user');
        try { showAuth(); } catch(e) {}
        const errMsg = (json && (json.error || json.message)) || bodyText || 'Invalid credentials';
        throw new Error(errMsg);
      }
      const errMsg = (json && (json.error || json.message)) || bodyText || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    return json;
  } catch (err) {
    console.error('[safeFetch] Network or fetch error', err);
    throw err;
  }
}

/* -----------------------
   UI helper functions
   ----------------------- */
function showAuth(){
  if(el("auth")) el("auth").style.display = "block";
  if(el("dashboard")) el("dashboard").style.display = "none";
}
function showDashboard(user){
  if(!user) return showAuth();
  if(el("auth")) el("auth").style.display = "none";
  if(el("dashboard")) el("dashboard").style.display = "block";
  if(el("user-name")) el("user-name").innerText = user.name || user.email || "";
  if(el("acct-email")) el("acct-email").innerText = user.email || "";
  if(el("balance")) el("balance").innerText = user.balance || '0';
  saveUser(user);

  // Load transactions for this user when dashboard shows
  loadTransactionsForCurrentUser().catch(e => console.warn('load tx after showDash', e));
}

/* -----------------------
   Auth: Login / Register / Logout
   ----------------------- */
async function loginHandler() {
  const email = (el("login-email") && el("login-email").value) || "";
  const password = (el("login-password") && el("login-password").value) || "";
  if (!email || !password) {
    if (el("login-msg")) el("login-msg").innerText = "Enter email & password";
    return;
  }
  try {
    const data = await safeFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (data && data.user) {
      saveUser(data.user);
      showDashboard(data.user);
      if (el("login-msg")) el("login-msg").innerText = "";
      if (data.user && data.user.isAdmin) {
        // optionally create admin button if needed
        try {
          if (!el('btn-admin')) {
            const container = el('dashboard-buttons');
            if (container) {
              const btn = document.createElement('button');
              btn.id = 'btn-admin';
              btn.innerText = 'Admin Controls';
              btn.onclick = () => { alert('Admin panel'); };
              container.appendChild(btn);
            }
          }
        } catch(e){ console.warn('admin btn create', e); }
      }
    } else {
      if (el("login-msg")) el("login-msg").innerText = "Login failed";
    }
  } catch (err) {
    if (el("login-msg")) el("login-msg").innerText = err.message || "Login error";
  }
}

async function registerHandler() {
  const name = (el("reg-name") && el("reg-name").value) || "";
  const email = (el("reg-email") && el("reg-email").value) || "";
  const phone = (el("reg-phone") && el("reg-phone").value) || "";
  const password = (el("reg-password") && el("reg-password").value) || "";
  if (!email || !password) {
    if (el("reg-msg")) el("reg-msg").innerText = "Enter email & password";
    return;
  }
  try {
    const data = await safeFetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password })
    });
    if (el("reg-msg")) el("reg-msg").innerText = (data && (data.message || 'Registered')) || 'Registered';
  } catch (err) {
    if (el("reg-msg")) el("reg-msg").innerText = err.message || "Registration error";
  }
}

function logout() {
  // attempt server logout (best-effort), then clear UI
  safeFetch("/api/logout", { method: "POST" }).catch(()=>{});
  sessionStorage.removeItem('user');
  localStorage.removeItem('rupayana_user');
  showAuth();
}
window.logout = logout;

/* -----------------------
   NEW: Profile / Billpay / Transfer / Transactions handlers
   ----------------------- */

// 1) Update profile
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

// 2) Bill pay
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
    // reload tx
    loadTransactionsForCurrentUser().catch(e => console.warn('reload tx after bill', e));
  } catch (err) {
    alert(err.message || 'Bill pay failed');
  }
}

// 3) Transfer
async function transferHandler() {
  const user = getUser();
  if (!user || !user.email) { alert('Please login'); return; }

  const toEmail = (el('to-email') && el('to-email').value) || '';
  const amount = (el('tamount') && el('tamount').value) || '';
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

// 4) Load transactions for current user
async function loadTransactionsForCurrentUser() {
  const user = getUser();
  if (!user || !user.email) {
    // clear tx list
    const container0 = el('tx-list');
    if (container0) container0.innerHTML = '<div>Please login to view transactions</div>';
    return;
  }

  try {
    const url = `/api/transactions?email=${encodeURIComponent(user.email)}`;
    const res = await safeFetch(url, { method: 'GET' });
    const list = (res && res.transactions) ? res.transactions : [];
    const container = el('tx-list');
    if (container) {
      if (!list.length) {
        container.innerHTML = '<div>No transactions</div>';
        return;
      }
      container.innerHTML = list.map(t => {
        const created = t.created_at ? (Number(t.created_at) > 1000000000 ? new Date(t.created_at * 1000) : new Date(t.created_at)) : null;
        const timeStr = created ? created.toLocaleString() : '';
        const amount = t.amount !== undefined ? `₹ ${t.amount}` : '';
        return `<div class="tx-row" style="display:flex;justify-content:space-between;padding:12px 16px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.02);">
          <div>
            <div style="font-weight:600">${t.type || ''}</div>
            <div style="font-size:13px;color:var(--muted)">${t.details || (t.to_email ? 'To: '+t.to_email : '')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700">${amount}</div>
            <div style="font-size:12px;color:var(--muted)">${timeStr}</div>
          </div>
        </div>`;
      }).join('');
    }
  } catch (err) {
    console.error('loadTransactions error', err);
    const container = el('tx-list');
    if (container) container.innerHTML = `<div>Error loading transactions: ${err.message || ''}</div>`;
  }
}

/* -----------------------
   DOM wiring on load
   ----------------------- */
document.addEventListener('DOMContentLoaded', function(){
  restoreUser();

  // login button
  const btnLogin = el("btn-login");
  if (btnLogin) btnLogin.addEventListener('click', loginHandler);

  // register button
  const btnReg = el("btn-register");
  if (btnReg) btnReg.addEventListener('click', registerHandler);

  // profile save
  const profileBtn = el('profile-save-btn');
  if (profileBtn) profileBtn.addEventListener('click', updateProfileHandler);

  // billpay
  const billBtn = el('billpay-btn');
  if (billBtn) billBtn.addEventListener('click', billPayHandler);

  // transfer
  const transferBtn = el('transfer-btn');
  if (transferBtn) transferBtn.addEventListener('click', transferHandler);

  // logout (if a logout element exists)
  const logoutBtn = el('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // If the user is already stored, show dashboard and load transactions
  const user = getUser();
  if (user) {
    showDashboard(user);
  } else {
    showAuth();
  }
});









