const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'leads.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    text TEXT NOT NULL,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS telegram_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    title TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function isDuplicate(hash) {
  return !!db.prepare('SELECT id FROM leads WHERE hash = ?').get(hash);
}

function saveLead(hash, source, text, link) {
  try {
    db.prepare('INSERT INTO leads (hash, source, text, link) VALUES (?, ?, ?, ?)').run(hash, source, text, link || null);
    return true;
  } catch (e) {
    return false;
  }
}

function saveGroup(username, title) {
  try {
    db.prepare('INSERT OR IGNORE INTO telegram_groups (username, title) VALUES (?, ?)').run(username, title || '');
  } catch (e) {}
}

function getGroups() {
  return db.prepare('SELECT username, title FROM telegram_groups').all();
}

module.exports = { isDuplicate, saveLead, saveGroup, getGroups };
