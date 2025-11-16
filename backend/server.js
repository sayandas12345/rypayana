// server.js — updated (includes safe migration for missing transaction columns)
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();

/*
  CORS + Preflight handler
  - During testing we allow all origins ('*') so Vercel can call the API.
  - Later replace '*' with a strict allowlist (allowedOrigins) for production.
*/
app.use((req, res, next) => {
  // Replace '*' with specific origin like 'https://rupayana.vercel.app' after testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// JSON body parsing
app.use(bodyParser.json());

// Request logger (helpful in Render logs)
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// Health check
app.get('/', (req, res) => res.send('OK'));

// DB
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) console.error('Failed to open DB:', err);
  else console.log('SQLite DB opened:', DB_FILE);
});

// Ensure tables exist (safe to run every start)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    phone TEXT,
    role TEXT,
    isAdmin INTEGER DEFAULT 0,
    resetToken TEXT,
    resetExpires INTEGER
  );`, e => { if (e) console.error('users table error:', e); });

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- older DBs might have different columns; migration below will add missing ones
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );`, e => { if (e) console.error('transactions table error:', e); });
});

/*
  SAFE MIGRATION: ensure transactions table has the expected columns.
  This will add missing columns without destroying existing data.
  Place after the DB is opened and tables created above.
*/
(function ensureTransactionColumns() {
  db.serialize(() => {
    db.all("PRAGMA table_info(transactions);", (err, cols) => {
      if (err) {
        console.error('PRAGMA table_info error (transactions):', err);
        return;
      }
      const existing = (cols || []).map(c => c.name);
      const needed = [
        { name: 'from_email', sql: "ALTER TABLE transactions ADD COLUMN from_email TEXT;" },
        { name: 'to_email',   sql: "ALTER TABLE transactions ADD COLUMN to_email TEXT;" },
        { name: 'amount',     sql: "ALTER TABLE transactions ADD COLUMN amount REAL;" },
        { name: 'type',       sql: "ALTER TABLE transactions ADD COLUMN type TEXT;" },
        { name: 'details',    sql: "ALTER TABLE transactions ADD COLUMN details TEXT;" },
        // created_at column was defined above with default; keep here for safety if missing
        { name: 'created_at', sql: "ALTER TABLE transactions ADD COLUMN created_at INTEGER DEFAULT (strftime('%s','now'));" }
      ];
      needed.forEach(col => {
        if (!existing.includes(col.name)) {
          db.run(col.sql, (e) => {
            if (e) {
              // Log but don't crash (some hosts may return "duplicate column" if concurrent)
              console.error(`Could not add column ${col.name}:`, e && (e.message || e));
            } else {
              console.log(`Added missing column to transactions: ${col.name}`);
            }
          });
        }
      });
    });
  });
})();

function genToken(){ return crypto.randomBytes(24).toString('hex'); }
function safeJSON(res, status, obj){ res.status(status).json(obj); }

/* -----------------------
   ROUTES
   ----------------------- */

// REGISTER
app.post(['/api/register','/register'], (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    if (!email || !password) return safeJSON(res,400,{ error:'Missing email or password' });
    const stmt = db.prepare('INSERT INTO users (name,email,password,phone) VALUES (?,?,?,?)');
    stmt.run(name||'', email, password, phone||'', function(err){
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') return safeJSON(res,409,{ error:'Email already exists' });
        console.error('register err', err); return safeJSON(res,500,{ error:'DB error' });
      }
      return safeJSON(res,200,{ user: { id:this.lastID, name, email, phone } });
    });
    stmt.finalize();
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// LOGIN
app.post(['/api/login','/login'], (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return safeJSON(res,400,{ error:'Missing email or password' });
    db.get('SELECT id,name,email,password,phone,isAdmin FROM users WHERE LOWER(email) = LOWER(?)', [email], (err,row) => {
      if (err){ console.error('login db err', err); return safeJSON(res,500,{error:'DB error'}); }
      if (!row || row.password !== password) return safeJSON(res,401,{ error:'Invalid credentials' });
      const user = { id: row.id, name: row.name, email: row.email, phone: row.phone, isAdmin: row.isAdmin };
      return safeJSON(res,200,{ user });
    });
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// UPDATE PROFILE
app.post(['/api/update-profile','/update-profile'], (req,res) => {
  try {
    const { email, name, phone } = req.body || {};
    if (!email) return safeJSON(res,400,{ error:'Missing email' });
    db.run('UPDATE users SET name=?, phone=? WHERE LOWER(email)=LOWER(?)', [name||'', phone||'', email], function(err){
      if (err){ console.error('update-profile err', err); return safeJSON(res,500,{error:'DB error'}); }
      db.get('SELECT id,name,email,phone FROM users WHERE LOWER(email)=LOWER(?)', [email], (e,row) => {
        if (e){ console.error(e); return safeJSON(res,500,{error:'DB error'}); }
        return safeJSON(res,200,{ user: row, message:'Profile updated' });
      });
    });
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// TRANSFER / TRANSACTION
app.post(['/api/transfer','/transfer','/api/transaction','/transaction'], (req,res) => {
  try {
    const { fromEmail, toEmail, amount, mode, type, details } = req.body || {};
    const from = fromEmail || req.body.from;
    const to = toEmail || req.body.to;
    const amt = (amount !== undefined) ? amount : req.body.amount;
    if (!from || !to || !amt) return safeJSON(res,400,{ error:'Missing fields' });
    const ttype = type || (mode ? mode : 'transfer');
    const stmt = db.prepare('INSERT INTO transactions (from_email,to_email,amount,type,details) VALUES (?,?,?,?,?)');
    stmt.run(from, to, amt, ttype, details||'', function(err){
      if (err){ console.error('insert tx err', err); return safeJSON(res,500,{error:'DB error'}); }
      return safeJSON(res,200,{ id:this.lastID, from, to, amount:amt, type:ttype });
    });
    stmt.finalize();
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// BILLPAY
app.post(['/api/billpay','/billpay'], (req,res) => {
  try {
    const { email, biller, amount } = req.body || {};
    if (!email || !biller || !amount) return safeJSON(res,400,{ error:'Missing fields' });
    const stmt = db.prepare('INSERT INTO transactions (from_email,to_email,amount,type,details) VALUES (?,?,?,?,?)');
    stmt.run(email, biller, amount, 'bill', `biller:${biller}`, function(err){
      if (err){ console.error('billpay insert err', err); return safeJSON(res,500,{error:'DB error'}); }
      return safeJSON(res,200,{ id:this.lastID, message:'Bill paid' });
    });
    stmt.finalize();
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// GET TRANSACTIONS
app.get(['/api/transactions','/transactions'], (req,res) => {
  try {
    const email = req.query.email;
    if (!email) return safeJSON(res,400,{ error:'Missing email query param' });
    db.all('SELECT id,from_email,to_email,amount,type,details,created_at FROM transactions WHERE LOWER(from_email)=LOWER(?) OR LOWER(to_email)=LOWER(?) ORDER BY created_at DESC', [email,email], (err, rows) => {
      if (err){ console.error('select tx err', err); return safeJSON(res,500,{error:'DB error'}); }
      return safeJSON(res,200,{ transactions: rows || [] });
    });
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// ADMIN: list users
app.get(['/api/admin/users','/admin/users'], (req,res) => {
  try {
    db.all('SELECT id,name,email,phone,isAdmin FROM users ORDER BY id DESC', [], (err, rows) => {
      if (err){ console.error('admin users err', err); return safeJSON(res,500,{error:'DB error'}); }
      return safeJSON(res,200,{ users: rows || [] });
    });
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// PASSWORD RESET
app.post(['/api/request-reset','/request-reset'], (req,res) => {
  try {
    const { email } = req.body || {};
    if (!email) return safeJSON(res,400,{ error:'Missing' });
    db.get('SELECT id FROM users WHERE LOWER(email)=LOWER(?)', [email], (err,user) => {
      if (err){ console.error(err); return safeJSON(res,500,{error:'DB error'}); }
      if (!user) return safeJSON(res,404,{ error:'No user with that email' });
      const token = genToken();
      const expires = Date.now() + 1000*60*60;
      db.run('UPDATE users SET resetToken=?, resetExpires=? WHERE LOWER(email)=LOWER(?)', [token,expires,email], (uErr) => {
        if (uErr){ console.error(uErr); return safeJSON(res,500,{error:'DB error'}); }
        const FRONTEND_BASE = process.env.FRONTEND_BASE || 'https://rupayana.vercel.app';
        const resetLink = `${FRONTEND_BASE}/reset.html?token=${token}&email=${encodeURIComponent(email)}`;
        return safeJSON(res,200,{ message:'Reset link created', resetLink });
      });
    });
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

app.post(['/api/reset-password','/reset-password'], (req,res) => {
  try {
    const { email, token, newPassword } = req.body || {};
    if (!email || !token || !newPassword) return safeJSON(res,400,{ error:'Missing' });
    db.get('SELECT resetToken,resetExpires FROM users WHERE LOWER(email)=LOWER(?)', [email], (err,row) => {
      if (err){ console.error(err); return safeJSON(res,500,{error:'DB error'}); }
      if (!row) return safeJSON(res,404,{ error:'User not found' });
      if (row.resetToken !== token || Date.now() > row.resetExpires) return safeJSON(res,400,{ error:'Invalid or expired token' });
      db.run('UPDATE users SET password=?, resetToken=NULL, resetExpires=NULL WHERE LOWER(email)=LOWER(?)', [newPassword,email], (uerr) => {
        if (uerr){ console.error(uerr); return safeJSON(res,500,{error:'DB error'}); }
        return safeJSON(res,200,{ message:'Password updated' });
      });
    });
  } catch(e){ console.error(e); safeJSON(res,500,{error:'Server error'}); }
});

// global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err));
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));




