const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

(async () => {
  const db = await sqlite.open({ filename: './database.sqlite', driver: sqlite3.Database });
  
  // Make admin here — change email if needed
  await db.run("UPDATE users SET role='admin' WHERE email='admin@rupayana.com'");
  
  console.log("Admin account activated!");
})();
