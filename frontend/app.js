// ---------- VERY SIMPLE, SAFE frontend/app.js ----------
const API = "https://<rypayana>.onrender.com/api";

// helper to get element safely
function el(id){ return document.getElementById(id) || null; }

// store / retrieve user safely
function saveUser(user){
  try { sessionStorage.setItem("user", JSON.stringify(user)); localStorage.setItem("rupayana_user", JSON.stringify(user)); } catch(e){}
}
function getUser(){
  try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("rupayana_user") || "null"); } catch(e){ return null; }
}
function restoreUser(){ if(!sessionStorage.getItem("user") && localStorage.getItem("rupayana_user")) sessionStorage.setItem("user", localStorage.getItem("rupayana_user")); }
restoreUser();

// show/hide helpers
function showAuth(){ if(el("auth")) el("auth").style.display = "block"; if(el("dashboard")) el("dashboard").style.display = "none"; }
function showDashboard(user){
  if(!user) return showAuth();
  if(el("auth")) el("auth").style.display = "none";
  if(el("dashboard")) { el("dashboard").style.display = "block"; }
  if(el("user-name")) el("user-name").innerText = user.name || user.email || "";
  saveUser(user);
}

// wait for DOM ready and attach handlers safely
document.addEventListener("DOMContentLoaded", function(){

  // --- LOGIN ---
  const btnLogin = el("btn-login");
  if(btnLogin){
    btnLogin.addEventListener("click", async function(){
      const email = (el("login-email") && el("login-email").value) || "";
      const password = (el("login-password") && el("login-password").value) || "";
      if(!email || !password){ if(el("login-msg")) el("login-msg").innerText = "Enter email & password"; return; }
      try {
        const res = await fetch(API + "/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email, password }) });
        const j = await res.json();
        if(!res.ok){ if(el("login-msg")) el("login-msg").innerText = j.error || "Invalid credentials"; return; }
        // success
        saveUser(j.user);
        showDashboard(j.user);
        // =================== ADD ADMIN BUTTON AFTER LOGIN ===================
try {
  const u = j.user;
  if (u && u.email === 'admin@rupayana.com') {
    if (!document.getElementById('btn-admin')) {
      const container = document.getElementById('dashboard-buttons');
      if (container) {
        const btn = document.createElement('button');
        btn.id = 'btn-admin';
        btn.innerText = 'Admin Controls';
        btn.onclick = () => {
          try { showAdminPanel(); }
          catch (e) { console.error(e); alert("Admin Error"); }
        };
        container.appendChild(btn);
      }
    }
  }
} catch (e) {
  console.warn("Failed to add admin button:", e);
}
      } catch(e){ if(el("login-msg")) el("login-msg").innerText = "Network error"; console.error(e); }
    });
  }

  // --- REGISTER ---
  const btnReg = el("btn-register");
  if(btnReg){
    btnReg.addEventListener("click", async function(){
      const name = (el("reg-name") && el("reg-name").value) || "";
      const email = (el("reg-email") && el("reg-email").value) || "";
      const phone = (el("reg-phone") && el("reg-phone").value) || "";
      const password = (el("reg-password") && el("reg-password").value) || "";
      if(!email || !password){ if(el("reg-msg")) el("reg-msg").innerText = "Enter email & password"; return; }
      try {
        const res = await fetch(API + "/register", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, email, phone, password }) });
        const j = await res.json();
        if(el("reg-msg")) el("reg-msg").innerText = j.error || j.message || "Registered";
      } catch(e){ if(el("reg-msg")) el("reg-msg").innerText = "Network error"; console.error(e); }
    });
  }

  // --- simple panel rendering functions (safe guards) ---
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
    document.getElementById("btn-save").onclick = async () => {
      const name = el("p-name").value; const phone = el("p-phone").value;
      try {
        const res = await fetch(API + "/update-profile", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: user.email, name, phone }) });
        const j = await res.json();
        if(j.user) saveUser(j.user);
        el("p-msg").innerText = j.message || j.error || "Updated";
      } catch(e){ el("p-msg").innerText = "Network error"; }
    };
  };

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
    document.getElementById("btn-send").onclick = async () => {
      const to = el("t-to").value; const amt = parseFloat(el("t-amt").value); const mode = el("t-mode").value;
      if(!to || !amt){ el("t-msg").innerText = "Enter valid inputs"; return; }
      try {
        const res = await fetch(API + "/transfer", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ fromEmail: user.email, toEmail: to, amount: amt, mode }) });
        const j = await res.json();
        el("t-msg").innerText = j.message || j.error || "Done";
        saveUser(user); // keep session safe
      } catch(e){ el("t-msg").innerText = "Network error"; }
    };
  };

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
    document.getElementById("btn-pay").onclick = async () => {
      const biller = el("b-biller").value; const amt = parseFloat(el("b-amt").value);
      if(!biller || !amt){ el("b-msg").innerText = "Enter valid inputs"; return; }
      try {
        const res = await fetch(API + "/billpay", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: user.email, biller, amount: amt }) });
        const j = await res.json();
        el("b-msg").innerText = j.message || j.error || "Done";
        saveUser(user);
      } catch(e){ el("b-msg").innerText = "Network error"; }
    };
  };

  window.showTx = async function(){
    const user = getUser(); if(!user) return showAuth();
    const panel = el("panel"); if(!panel) return;
    try {
      const res = await fetch(API + "/transactions?email=" + encodeURIComponent(user.email));
      const j = await res.json();
      if(j.transactions) {
        panel.innerHTML = '<h3>Transactions</h3>' + j.transactions.map(t => `<div>${t.created_at} | ${t.type} | ${t.amount} | ${t.details}</div>`).join('');
      } else panel.innerHTML = '<p>No transactions</p>';
    } catch(e){ panel.innerHTML = '<p>Network error</p>'; }
  };

  // Admin panel helper (if present server-side)
  window.showAdminPanel = async function(){
    const user = getUser(); if(!user || user.email !== "admin@rupayana.com") { el("panel") && (el("panel").innerHTML = "<p>Not authorized</p>"); return; }
    const panel = el("panel"); if(!panel) return;
    panel.innerHTML = `<h3>Admin</h3><button id="btn-users">Users</button><button id="btn-reports">Reports</button><div id="admin-box"></div>`;
    document.getElementById("btn-users").onclick = async () => {
      try { const res = await fetch(API + "/admin/users"); const j = await res.json(); document.getElementById("admin-box").innerHTML = j.users.map(u=>`<div>${u.name}|${u.email}</div>`).join(""); } catch(e){ document.getElementById("admin-box").innerText = "Err"; }
    };
    document.getElementById("btn-reports").onclick = async () => {
      try { const res = await fetch(API + "/admin/reports"); const j = await res.json(); document.getElementById("admin-box").innerText = JSON.stringify(j); } catch(e){ document.getElementById("admin-box").innerText = "Err"; }
    };
  };

  // logout
  window.logout = function(){ sessionStorage.removeItem("user"); localStorage.removeItem("rupayana_user"); showAuth(); };

  // on load: if user exists show dashboard
  const u = getUser();
  if(u) showDashboard(u);
}); // DOMContentLoaded end





