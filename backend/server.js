// backend/server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const FRONTEND_BASE = process.env.FRONTEND_BASE || 'https://rupayana.vercel.app';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin === FRONTEND_BASE) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_BASE);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(bodyParser.json());
app.use((req, res, next) => { console.log(new Date().toISOString(), req.method, req.url); next(); });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('>>> USING DATABASE_URL host:', (() => {
  try { const u = new URL(process.env.DATABASE_URL); return `${u.protocol}//${u.host}${u.pathname}`; }
  catch (e) { return '(invalid DATABASE_URL)'; }
})());

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      phone TEXT,
      role TEXT,
      isadmin BOOLEAN DEFAULT false,
      resetToken TEXT,
      resetExpires BIGINT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      from_email TEXT,
      to_email TEXT,
      amount NUMERIC,
      type TEXT,
      details TEXT,
      created_at BIGINT DEFAULT (extract(epoch from now())::bigint)
    );
  `);
  console.log('Postgres OK - tables ensured');
}
initDB().catch(err => { console.error('initDB error', err); process.exit(1); });

function genToken(){ return crypto.randomBytes(24).toString('hex'); }
function safeJSON(res, status, obj){ res.status(status).json(obj); }

/* -----------------------
   ROUTES
   ----------------------- */

// Register
app.post(['/api/register','/register'], async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    if (!email || !password) return safeJSON(res,400,{ error:'Missing email or password' });
    const normEmail = String(email).trim().toLowerCase();
    const q = 'INSERT INTO users (name,email,password,phone) VALUES ($1,$2,$3,$4) RETURNING id';
    try {
      const r = await pool.query(q, [name||'', normEmail, password, phone||'']);
      return safeJSON(res,201,{ user: { id: r.rows[0].id, name: name||'', email: normEmail, phone: phone||'' } });
    } catch (err) {
      if (err.code === '23505') return safeJSON(res,409,{ error:'Email already exists' });
      console.error('register err', err);
      return safeJSON(res,500,{ error:'DB error' });
    }
  } catch(e){ console.error('register unexpected', e); safeJSON(res,500,{error:'Server error'}); }
});

// Login
app.post(['/api/login','/login'], async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return safeJSON(res,400,{ error:'Missing email or password' });

    const normEmail = String(email).trim().toLowerCase();
    console.log(`[login] attempt for email="${normEmail}"`);
    const q = 'SELECT id,name,email,password,phone,isadmin FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1';
    const r = await pool.query(q, [normEmail]);

    if (!r.rows.length) {
      console.warn('[login] user not found for', normEmail);
      return safeJSON(res,401,{ error:'Invalid credentials' });
    }
    const row = r.rows[0];

    console.log('[login] found user id=%s; stored-password-length=%d; provided-password-length=%d', row.id, (row.password||'').length, (password||'').length);

    if (!row.password || String(row.password) !== String(password)) {
      console.warn('[login] password mismatch for', normEmail);
      return safeJSON(res,401,{ error:'Invalid credentials' });
    }

    const user = { id: row.id, name: row.name, email: row.email, phone: row.phone, isAdmin: row.isadmin };
    console.log('[login] success for', normEmail);
    return safeJSON(res,200,{ user });
  } catch(e){ console.error('login err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Logout - simple endpoint to avoid frontend 404
app.post('/api/logout', (req, res) => safeJSON(res,200,{ success:true, message:'Logged out' }));

// Update profile
app.post(['/api/update-profile','/update-profile'], async (req,res) => {
  try {
    const { email, name, phone } = req.body || {};
    if (!email) return safeJSON(res,400,{ error:'Missing email' });
    const normEmail = String(email).trim().toLowerCase();
    await pool.query('UPDATE users SET name=$1, phone=$2 WHERE LOWER(email)=LOWER($3)', [name||'', phone||'', normEmail]);
    const r = await pool.query('SELECT id,name,email,phone FROM users WHERE LOWER(email)=LOWER($1)', [normEmail]);
    return safeJSON(res,200,{ user: r.rows[0], message:'Profile updated' });
  } catch(e){ console.error('update-profile err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Transfer / Transaction insert
app.post(['/api/transfer','/transfer','/api/transaction','/transaction'], async (req,res) => {
  try {
    const { fromEmail, toEmail, amount, mode, type, details } = req.body || {};
    const from = fromEmail || req.body.from;
    const to = toEmail || req.body.to;
    const amt = (amount !== undefined) ? amount : req.body.amount;
    if (!from || !to || !amt) return safeJSON(res,400,{ error:'Missing fields' });
    const ttype = type || (mode ? mode : 'transfer');
    const q = 'INSERT INTO transactions (from_email,to_email,amount,type,details) VALUES ($1,$2,$3,$4,$5) RETURNING id';
    const r = await pool.query(q, [from, to, amt, ttype, details||'']);
    return safeJSON(res,200,{ id: r.rows[0].id, from, to, amount:amt, type:ttype });
  } catch(e){ console.error('transfer err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Billpay
app.post(['/api/billpay','/billpay'], async (req,res) => {
  try {
    const { email, biller, amount } = req.body || {};
    if (!email || !biller || amount === undefined) return safeJSON(res,400,{ error:'Missing fields' });
    const q = 'INSERT INTO transactions (from_email,to_email,amount,type,details) VALUES ($1,$2,$3,$4,$5) RETURNING id';
    const r = await pool.query(q, [email, biller, amount, 'bill', `biller:${biller}`]);
    return safeJSON(res,200,{ id: r.rows[0].id, message:'Bill paid' });
  } catch(e){ console.error('billpay err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Transactions (GET by email query param)
app.get(['/api/transactions','/transactions'], async (req,res) => {
  try {
    const email = req.query.email;
    if (!email) return safeJSON(res,400,{ error:'Missing email query param' });
    const norm = String(email).trim().toLowerCase();
    const q = `SELECT id, from_email, to_email, amount, type, details, created_at FROM transactions
               WHERE LOWER(from_email)=LOWER($1) OR LOWER(to_email)=LOWER($1)
               ORDER BY created_at DESC`;
    const r = await pool.query(q, [norm]);
    return safeJSON(res,200,{ transactions: r.rows || [] });
  } catch(e){ console.error('transactions err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Admin users
app.get(['/api/admin/users','/admin/users'], async (req,res) => {
  try {
    const r = await pool.query('SELECT id,name,email,phone,isadmin AS "isAdmin" FROM users ORDER BY id DESC');
    return safeJSON(res,200,{ users: r.rows || [] });
  } catch(e){ console.error('admin users err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Request reset
app.post(['/api/request-reset','/request-reset'], async (req,res) => {
  try {
    const { email } = req.body || {};
    if (!email) return safeJSON(res,400,{ error:'Missing' });
    const norm = String(email).trim().toLowerCase();
    const r = await pool.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [norm]);
    if (!r.rows.length) return safeJSON(res,404,{ error:'No user with that email' });
    const token = genToken();
    const expires = Date.now() + 1000*60*60;
    await pool.query('UPDATE users SET resetToken=$1, resetExpires=$2 WHERE LOWER(email)=LOWER($3)', [token, expires, norm]);
    const resetLink = `${FRONTEND_BASE}/reset.html?token=${token}&email=${encodeURIComponent(norm)}`;
    return safeJSON(res,200,{ message:'Reset link created', resetLink });
  } catch(e){ console.error('request-reset err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Reset password
app.post(['/api/reset-password','/reset-password'], async (req,res) => {
  try {
    const { email, token, newPassword } = req.body || {};
    if (!email || !token || !newPassword) return safeJSON(res,400,{ error:'Missing' });
    const norm = String(email).trim().toLowerCase();
    const r = await pool.query('SELECT resetToken, resetExpires FROM users WHERE LOWER(email)=LOWER($1)', [norm]);
    if (!r.rows.length) return safeJSON(res,404,{ error:'User not found' });
    const row = r.rows[0];
    if (!row.resettoken || String(row.resettoken) !== token || !row.resetexpires || Date.now() > Number(row.resetexpires)) {
      return safeJSON(res,400,{ error:'Invalid or expired token' });
    }
    await pool.query('UPDATE users SET password=$1, resetToken=NULL, resetExpires=NULL WHERE LOWER(email)=LOWER($2)', [newPassword, norm]);
    return safeJSON(res,200,{ message:'Password updated' });
  } catch(e){ console.error('reset-password err', e); safeJSON(res,500,{error:'Server error'}); }
});

// Debug: list users
app.get('/api/debug-users', async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,phone,isadmin AS "isAdmin" FROM users ORDER BY id DESC LIMIT 200');
    return res.json({ users: r.rows });
  } catch (e) { console.error('debug-users err', e); return res.status(500).json({ error: 'Server error' }); }
});

// health
app.get('/health', (req, res) => res.send('ok'));

// global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err));
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));








