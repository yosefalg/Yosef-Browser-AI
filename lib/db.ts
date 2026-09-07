import * as SQLite from 'expo-sqlite';

export type StoredPageContext = {
  url: string;
  title: string;
  text: string;
  captured_at: number;
};

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
    CREATE TABLE IF NOT EXISTS page_context (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      url TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      captured_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS browser_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_browser_memory_created_at ON browser_memory(created_at DESC);
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

export async function setPageContext(url: string, title: string, text: string) {
  const d = await db();
  await d.runAsync(
    'INSERT OR REPLACE INTO page_context (id,url,title,text,captured_at) VALUES (1,?,?,?,?)',
    url,
    title,
    text.slice(0, 16000),
    Date.now(),
  );
}

export async function getLatestPageContext(): Promise<StoredPageContext | null> {
  const d = await db();
  return d.getFirstAsync<StoredPageContext>('SELECT url,title,text,captured_at FROM page_context WHERE id=1');
}

export async function remember(kind: string, value: string) {
  const cleanKind = kind.trim().slice(0, 40) || 'note';
  const cleanValue = value.trim().slice(0, 1000);
  if (!cleanValue) return;
  const d = await db();
  await d.runAsync('INSERT INTO browser_memory (kind,value,created_at) VALUES (?,?,?)', cleanKind, cleanValue, Date.now());
  await d.runAsync('DELETE FROM browser_memory WHERE id NOT IN (SELECT id FROM browser_memory ORDER BY created_at DESC LIMIT 200)');
}

export async function getMemories(limit = 12) {
  const d = await db();
  return d.getAllAsync<{ id:number; kind:string; value:string; created_at:number }>('SELECT * FROM browser_memory ORDER BY created_at DESC LIMIT ?', limit);
}
