import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'leads.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT UNIQUE,
    source TEXT NOT NULL,
    text TEXT NOT NULL,
    url TEXT DEFAULT '',
    found_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS groups_joined (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT UNIQUE,
    title TEXT,
    joined_at INTEGER
  );
`);

const insertLead = db.prepare(
  'INSERT OR IGNORE INTO leads (hash, source, text, url, found_at) VALUES (?, ?, ?, ?, ?)'
);
const insertGroup = db.prepare(
  'INSERT OR IGNORE INTO groups_joined (group_id, title, joined_at) VALUES (?, ?, ?)'
);

export function saveLead(source, text, url = '') {
  const hash = Buffer.from(`${source}:${text.slice(0, 120)}`).toString('base64');
  const result = insertLead.run(hash, source, text.slice(0, 2000), url, Date.now());
  return result.changes > 0;
}

export function saveGroup(groupId, title) {
  insertGroup.run(String(groupId), title || '', Date.now());
}

export function getStats() {
  const total = db.prepare('SELECT COUNT(*) as c FROM leads').get();
  const today = db.prepare(
    'SELECT COUNT(*) as c FROM leads WHERE found_at > ?'
  ).get(Date.now() - 86400000);
  const groups = db.prepare('SELECT COUNT(*) as c FROM groups_joined').get();
  return { total: total.c, today: today.c, groups: groups.c };
}
