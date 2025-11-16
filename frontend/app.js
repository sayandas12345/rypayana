// app.js — final patched version (no auto-restore on load)
const API = (typeof window !== 'undefined' && window.API) ? window.API : "https://rupayana.onrender.com";
console.log('Using API base:', API);

function el(id){ return document.getElementById(id) || null; }
function saveUser(user){ try { sessionStorage.setItem("user", JSON.stringify(user)); localStorage.setItem("rupayana_user", JSON.stringify(user)); } catch(e){} }
function getUser(){ try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("rupayana_user") || "null"); } catch(e){ return null; } }
// NOTE: we intentionally DO NOT auto-restore a session on page load.
// If you want auto-restore later, call restoreUser() explicitly from a "Resume session" button.
function restoreUser(){ if(!sessionStorage.getItem("user") && localStorage.getItem("rupayana_user")) sessionStorage.setItem("user", localStorage.getItem("rupayana_user")); }

// safe fetch wrapper
async function safeFetch(url, opts){
  try {
    const res = await fetch(url, opts);
    let bodyText = null;
    try { bodyText = await res.text(); } catch(e){ bodyText = ''; }
    let json = null;
    try { json = bodyText ? JSON.parse(bodyText) : null; } catch(e){ json = null; }
    if (!res.ok) {
      console.error('HTTP error', res.status, json || bodyText);
      const err = (json && (json.error || json.message)) || bodyText || `HTTP ${res.status}`;
      throw new Error(err);
    }
    return json;
  } catch(e){
    console.error('Network or fetch error', e);
    throw e;
  }
}

function showAuth(){ if(el("auth")) el("auth").style.display = "block"; if(el("dashboard")) el("dashboard").style.display = "none"; }
function showDashboard(user){
  if(!user) return showAuth();
  if(el("auth")) el("auth").style.display = "none";
  if(el("dashboard")) el("dashboard").style.display = "block";
  if(el("user-name")) el("user-name").innerText = user.name || user.email || "";
  if(el("acct-email")) el("acct-email").innerText = user.email || "";
  if(el("balance")) el("balance").innerText = user.balance || '0';
  saveUser(user);
}

// Bind handlers on DOM ready
document.addEventListener("DOMContentLoaded", function(){

  // LOGIN
  const btnLogin = el("btn-login");
  if (btnLogin){
    btnLogin.addEventListener("click", async function(){
      const email = (el("login-email") && el("login-email").value) || "";
      const password = (el("login-password") && el("login-password").value) || "";
      if(!email || !password){ if(el("login-msg")) el("login-msg").innerText = "Enter email & password"; return; }
      try {
        const data = await safeFetch(API + "/api/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email, password }) });
        if (data && data.user) {
          saveUser(data.user);
          showDashboard(data.user);
          try {
            const u = data.user;
            if (u && u.isAdmin) {
              if (!el('btn-admin')) {
                const container = el('dashboard-buttons');
                if (container) {
                  const btn = document.createElement('button');
                  btn.id = 'btn-admin';
                  btn.innerText = 'Admin Controls';
                  btn.onclick = () => { try { showAdminPanel(); } catch(e){ console.error(e); alert('Admin Error'); } };
                  container.appendChild(btn);
                }
              }
            }
          } catch(e){ console.warn('admin button', e); }
        } else {
          if(el("login-msg")) el("login-msg").innerText = "Login failed";
        }
      } catch(e){
        if(el("login-msg")) el("login-msg").innerText = e.message || "Network error";
      }
    });
  }

  // REGISTER
  const btnReg = el("btn-register");
  if (btnReg){
    btnReg.addEventListener("click", async function(){
      const name = (el("reg-name") && el("reg-name").value) || "";
      const email = (el("reg-email") && el("reg-email").value) || "";
      const phone = (el("reg-phone") && el("reg-phone").value) || "";
      const password = (el("reg-password") && el("reg-password").value) || "";
      if(!email || !password){ if(el("reg-msg")) el("reg-msg").innerText = "Enter email & password"; return; }
      try {
        const data = await safeFetch(API + "/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, email, phone, password }) });
        if(el("reg-msg")) el("reg-msg").innerText = data && (data.message || 'Registered') || 'Registered';
      } catch(e){ if(el("reg-msg")) el("reg-msg").innerText = e.message || "Network error"; }
    });
  }

  // Profile
  window.showProfile = function(){
    const user = getUser(); if(!user) return showAuth();
    const panel = el("panel"); if(!panel) return;
    panel.innerHTML = `
      <h3>Profile</h3>
      <input id="p-name" value="${user.name||''}" />
      <input id="p-email" value="${user.email||''}" disabled />
      <input id="p-phone" value="${user.phone||''}" />
      <button id="btn-save">Save</button>
      <p id="p-msg"></p>
    `;
    const btnSave = el("btn-save");
    if (btnSave) btnSave.onclick = async () => {
      const name = el("p-name").value; const phone = el("p-phone").value;
      try {
        const data = await safeFetch(API + "/api/update-profile", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: user.email, name, phone }) });
        if (data && data.user) { saveUser(data.user); }
        if (el("p-msg")) el("p-msg").innerText = data && (data.message||'Updated') || 'Updated';
      } catch(e){ if (el("p-msg")) el("p-msg").innerText = e.message || "Network error"; }
    };
  };

  // Transfer
  window.showTransfer = function(){
    const user = getUser(); if(!user) return showAuth();
    const panel = el("panel"); if(!panel) return;
    panel.innerHTML = `
      <h3>Fund Transfer</h3>
      <input id="t-to" placeholder="Recipient Email/UPI" />
      <input id="t-amt" placeholder="Amount" />
      <select id="t-mode"><option value="upi">UPI</option><option value="bank">Bank</option></select>
      <button id="btn-send" type="button">Send</button>
      <p id="t-msg"></p>
    `;
    const btnSend = el("btn-send");
    if (btnSend) btnSend.onclick = async () => {
      const to = el("t-to").value; const amt = parseFloat(el("t-amt").value); const mode = el("t-mode").value;
      if(!to || !amt){ if(el("t-msg")) el("t-msg").innerText = "Enter valid inputs"; return; }
      try {
        const user = getUser();
        const data = await safeFetch(API + "/api/transfer", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ fromEmail: user.email, toEmail: to, amount: amt, mode }) });
        if(el("t-msg")) el("t-msg").innerText = data && (data.message || 'Done') || 'Done';
        saveUser(user);
      } catch(e){ if(el("t-msg")) el("t-msg").innerText = e.message || "Network error"; }
    };
  };

  // Billpay
  window.showBill = function(){
    const user = getUser(); if(!user) return showAuth();
    const panel = el("panel"); if(!panel) return;
    panel.innerHTML = `
      <h3>Bill Payment</h3>
      <input id="b-biller" placeholder="Biller name" />
      <input id="b-amt" placeholder="Amount" />
      <button id="btn-pay" type="button">Pay</button>
      <p id="b-msg"></p>
    `;
    const btnPay = el("btn-pay");
    if (btnPay) btnPay.onclick = async () => {
      const biller = el("b-biller").value; const amt = parseFloat(el("b-amt").value);
      if(!biller || !amt){ if(el("b-msg")) el("b-msg").innerText = "Enter valid inputs"; return; }
      try {
        const user = getUser();
        const data = await safeFetch(API + "/api/billpay", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: user.email, biller, amount: amt }) });
        if(el("b-msg")) el("b-msg").innerText = data && (data.message || 'Done') || 'Done';
        saveUser(user);
      } catch(e){ if(el("b-msg")) el("b-msg").innerText = e.message || "Network error"; }
    };
  };

  // Transactions
  window.showTx = async function(){
    const user = getUser(); if(!user) return showAuth();
    const panel = el("panel"); if(!panel) return;
    try {
      const data = await safeFetch(API + "/api/transactions?email=" + encodeURIComponent(user.email));
      if (data && Array.isArray(data.transactions)) {
        if (data.transactions.length === 0) panel.innerHTML = '<h3>Transactions</h3><p>No transactions</p>';
        else panel.innerHTML = '<h3>Transactions</h3>' + data.transactions.map(t => `<div>${new Date(t.created_at*1000).toLocaleString()} | ${t.type||''} | ₹ ${t.amount} | ${t.details||''}</div>`).join('');
      } else {
        panel.innerHTML = '<p>No transactions</p>';
      }
    } catch(e){
      panel.innerHTML = '<p>Network error</p>';
    }
  };

  // Admin panel
  window.showAdminPanel = async function(){
    const user = getUser(); if(!user || !user.isAdmin) { if(el("panel")) el("panel").innerHTML = "<p>Not authorized</p>"; return; }
    const panel = el("panel"); if(!panel) return;
    panel.innerHTML = `<h3>Admin</h3><button id="btn-users">Users</button><button id="btn-reports">Reports</button><div id="admin-box"></div>`;
    const bUsers = el("btn-users");
    if (bUsers) bUsers.onclick = async () => {
      try {
        const data = await safeFetch(API + "/api/admin/users");
        if (el("admin-box")) el("admin-box").innerHTML = (data && data.users) ? data.users.map(u=>`<div>${u.id} • ${u.name} • ${u.email}</div>`).join('') : 'No users';
      } catch(e){ if(el("admin-box")) el("admin-box").innerText = 'Err'; }
    };
    const bReports = el("btn-reports");
    if (bReports) bReports.onclick = async () => {
      try { const data = await safeFetch(API + "/api/admin/reports"); if(el("admin-box")) el("admin-box").innerText = JSON.stringify(data); } catch(e){ if(el("admin-box")) el("admin-box").innerText = 'Err'; }
    };
  };

  // Logout (clears both storages)
  window.logout = function(){ sessionStorage.removeItem("user"); localStorage.removeItem("rupayana_user"); showAuth(); };

  // IMPORTANT: do NOT auto-restore or auto-show dashboard on page load.
  // User must explicitly login to be shown the dashboard.
});








