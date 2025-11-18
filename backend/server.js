// server.js - temporary permissive CORS to unblock frontend quickly
require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(cookieParser());

// dynamic CORS middleware (permits any origin but sends appropriate headers)
// NOTE: This is permissive to unblock quickly — you can set FRONTEND_ORIGIN
// to lock down later (see instructions after deploy).
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  // Allow credentials if origin present
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
  // handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }
  next();
});

// root
app.get("/", (req, res) => res.send("Rupayana backend (CORS-unblock)"));

/* ------------------ Simple DB fallback: sqlite / postgres ------------------ */
let usePostgres = false;
let db = null;

if (process.env.DATABASE_URL) {
  usePostgres = true;
  console.log(">>> USING POSTGRES:", process.env.DATABASE_URL);
  const { Pool } = require("pg");
  db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});
} else {
  console.log(">>> USING SQLITE fallback");
  const sqlite3 = require("sqlite3").verbose();
  const DB_FILE = process.env.DB_FILE || "./database.sqlite";
  db = new sqlite3.Database(DB_FILE);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    password TEXT,
    balance INTEGER DEFAULT 0
  )`);
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (usePostgres) db.query(sql, params).then(r => resolve(r.rows)).catch(reject);
    else db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function runExec(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (usePostgres) db.query(sql + " RETURNING *", params).then(r => resolve(r.rows[0] || null)).catch(reject);
    else db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  });
}

/* ------------------ AUTH ROUTES ------------------ */

// register
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const exists = await runQuery("SELECT id FROM users WHERE email = $1", [email]).catch(()=>[]);
    if (exists && exists.length) return res.status(409).json({ error: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await runExec("INSERT INTO users (name,email,phone,password,balance) VALUES ($1,$2,$3,$4,0)", [name||"", email, phone||"", hashed]);

    const userRow = await runQuery("SELECT id,name,email,phone,balance FROM users WHERE email = $1", [email]);
    const user = userRow && userRow[0] ? userRow[0] : null;
    return res.json({ message: "Registered", user });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const rows = await runQuery("SELECT id,name,email,phone,password,balance FROM users WHERE email = $1", [email]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    delete user.password;
    return res.json({ message: "Logged in", user });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/logout", (req, res) => res.json({ success: true }));
app.get("/api/ping", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log("Backend running on port", PORT));









