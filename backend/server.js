/**
 * Rupayana - demo backend (clean version)
 * Node/Express + SQLite demo server for the Rupayana project.
 *
 * Save this file as backend/server.js (UTF-8, no BOM) and run:
 *   cd backend
 *   npm install
 *   node server.js
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;
const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://localhost:5500';

let db;

/** Initialize SQLite database and tables */
async function initDb() {
  db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  // Create users table
  await db.exec(
    "CREATE TABLE IF NOT EXISTS users (" +
    "id TEXT PRIMARY KEY," +
    "name TEXT," +
    "email TEXT UNIQUE," +
    "phone TEXT," +
    "password_hash TEXT," +
    "role TEXT DEFAULT 'user'," +
    "created_at TEXT," +
    "reset_token TEXT," +
    "reset_expires INTEGER" +
    ");"
  );

  // Create transactions table
  await db.exec(
    "CREATE TABLE IF NOT EXISTS transactions (" +
    "id TEXT PRIMARY KEY," +
    "user_id TEXT," +
    "type TEXT," +
    "amount REAL," +
    "details TEXT," +
    "created_at TEXT" +
    ");"
  );
}

function now() {
  return new Date().toISOString();
}

function makeTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/** Register */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await db.run(
      'INSERT INTO users (id,name,email,phone,password_hash,created_at) VALUES (?,?,?,?,?,?)',
      [id, name || '', email, phone || '', password_hash, now()]
    );
    res.json({ success: true, user: { id, name, email, phone } });
  } catch (e) {
    if (e && e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'email already registered' });
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

/** Login */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

/** Forgot password */
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    // Always respond success to avoid account enumeration
    if (!user) return res.status(200).json({ success: true, message: 'If the email exists, a reset link will be sent' });

    const token = uuidv4();
    const expires = Date.now() + 1000 * 60 * 60; // 1 hour
    await db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);

    const resetLink = `${FRONTEND_BASE}/frontend/reset.html?token=${token}&email=${encodeURIComponent(email)}`;
    const transporter = makeTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: process.env.FROM_EMAIL || 'no-reply@rupayana.test',
        to: email,
        subject: 'Rupayana Password Reset',
        text: 'Reset your password: ' + resetLink,
        html: '<p>Reset your password: <a href="' + resetLink + '">' + resetLink + '</a></p>'
      });
      return res.json({ success: true, message: 'Reset link sent if email exists' });
    } else {
      // For demo/testing, return the link in response
      return res.json({ success: true, message: 'No SMTP configured — use this link for testing', resetLink });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

/** Reset password */
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || user.reset_token !== token || !user.reset_expires || Date.now() > user.reset_expires) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hash, user.id]);
    res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

/** Profile view */
app.get('/api/profile', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = await db.get('SELECT id,name,email,phone,role,created_at FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Update profile */
app.post('/api/update-profile', async (req, res) => {
  try {
    const { email, name, phone } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    await db.run('UPDATE users SET name = ?, phone = ? WHERE email = ?', [name || '', phone || '', email]);
    const user = await db.get('SELECT id,name,email,phone,role FROM users WHERE email = ?', [email]);
    res.json({ success: true, user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Transfer (demo: just record transactions) */
app.post('/api/transfer', async (req, res) => {
  try {
    const { fromEmail, toEmail, amount, mode } = req.body;
    if (!fromEmail || !toEmail || !amount) return res.status(400).json({ error: 'missing fields' });
    const fromUser = await db.get('SELECT * FROM users WHERE email = ?', [fromEmail]);
    const toUser = await db.get('SELECT * FROM users WHERE email = ?', [toEmail]);
    if (!fromUser || !toUser) return res.status(400).json({ error: 'invalid users' });

    const t1 = uuidv4(), t2 = uuidv4();
    await db.run('INSERT INTO transactions (id,user_id,type,amount,details,created_at) VALUES (?,?,?,?,?,?)',
      [t1, fromUser.id, 'debit', amount, JSON.stringify({ to: toEmail, mode }), now()]);
    await db.run('INSERT INTO transactions (id,user_id,type,amount,details,created_at) VALUES (?,?,?,?,?,?)',
      [t2, toUser.id, 'credit', amount, JSON.stringify({ from: fromEmail, mode }), now()]);
    res.json({ success: true, message: 'Transfer recorded' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Bill payment */
app.post('/api/billpay', async (req, res) => {
  try {
    const { email, biller, amount } = req.body;
    if (!email || !biller || !amount) return res.status(400).json({ error: 'missing fields' });
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(400).json({ error: 'invalid user' });
    const tid = uuidv4();
    await db.run('INSERT INTO transactions (id,user_id,type,amount,details,created_at) VALUES (?,?,?,?,?,?)',
      [tid, user.id, 'bill', amount, JSON.stringify({ biller }), now()]);
    res.json({ success: true, message: 'Bill payment recorded' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Transactions */
app.get('/api/transactions', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const tx = await db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
    res.json({ transactions: tx });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Admin: list users */
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.all('SELECT id,name,email,phone,role,created_at FROM users ORDER BY created_at DESC');
    res.json({ users });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Admin: simple reports */
app.get('/api/admin/reports', async (req, res) => {
  try {
    const totalUsers = await db.get('SELECT COUNT(*) as c FROM users');
    const totalTx = await db.get('SELECT COUNT(*) as c FROM transactions');
    const sumAmount = await db.get('SELECT SUM(amount) as s FROM transactions');
    res.json({ totalUsers: totalUsers.c, totalTransactions: totalTx.c, totalAmount: sumAmount.s || 0 });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

/** Start */
initDb().then(() => {
  app.listen(PORT, () => console.log('Server listening on', PORT));
}).catch(err => { console.error(err); process.exit(1); });
