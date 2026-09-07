import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('raid-browser.db');
  const d = await dbPromise;
  await d.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      visited_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at DESC);
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  return d;
}

export async function addHistory(url: string, title?: string) {
  const d = await db();
  await d.runAsync('INSERT INTO history (url,title,visited_at) VALUES (?,?,?)', url, title ?? '', Date.now());
  await d.runAsync(`DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY visited_at DESC LIMIT 2000)`);
}

export async function clearHistory() {
  const d = await db();
  await d.execAsync('DELETE FROM history');
}

export async function getHistory(limit = 100) {
  const d = await db();
  return d.getAllAsync<{ id:number; url:string; title:string; visited_at:number }>('SELECT * FROM history ORDER BY visited_at DESC LIMIT ?', limit);
}

export async function addBookmark(url: string, title?: string) {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO bookmarks (url,title,created_at) VALUES (?,?,?)', url, title ?? '', Date.now());
}

export async function getBookmarks() {
  const d = await db();
  return d.getAllAsync<{ id:number; url:string; title:string; created_at:number }>('SELECT * FROM bookmarks ORDER BY created_at DESC');
}

export async function setSetting(key: string, value: unknown) {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', key, JSON.stringify(value));
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value:string }>('SELECT value FROM settings WHERE key=?', key);
    return row ? JSON.parse(row.value) as T : fallback;
  } catch {
    return fallback;
  }
}
