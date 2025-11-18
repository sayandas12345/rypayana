// app.js — minimalist wiring for UI and sample user data
const API = (typeof window !== 'undefined' && window.API) ? window.API : "https://rupayana.onrender.com";

/* Small helper */
const $ = id => document.getElementById(id);

/* Demo: load stored user or guest */
function loadUser() {
  try {
    const s = localStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

/* Demo: set UI values */
function renderUserUI() {
  const user = loadUser();
  const name = user && (user.name || user.email) ? (user.name || user.email) : "guest";
  const email = user && user.email ? user.email : "guest@example.com";
  const balance = user && (typeof user.balance !== 'undefined') ? user.balance : 0;

  if ($('user-name')) $('user-name').innerText = name;
  if ($('account-email')) $('account-email').innerText = email;
  if ($('wallet-amount')) $('wallet-amount').innerText = '₹ ' + balance;
}

/* Show feature placeholder */
function showFeature(name) {
  alert('Open: ' + name + ' (This is a UI demo; backend flows still available)');
}

/* Startup */
window.addEventListener('load', () => {
  renderUserUI();
});









