import * as SQLite from 'expo-sqlite';
import type { DownloadItem, DownloadState } from './types';

let promise: Promise<SQLite.SQLiteDatabase> | null = null;
let migrated = false;

async function migrate(d: SQLite.SQLiteDatabase) {
  if (migrated) return;
  const columns = await d.getAllAsync<{ name: string }>('PRAGMA table_info(downloads)');
  const names = new Set(columns.map(column => column.name));
  if (!names.has('speed_bps')) await d.execAsync('ALTER TABLE downloads ADD COLUMN speed_bps REAL NOT NULL DEFAULT 0;');
  if (!names.has('eta_seconds')) await d.execAsync('ALTER TABLE downloads ADD COLUMN eta_seconds INTEGER;');
  if (!names.has('resume_data')) await d.execAsync('ALTER TABLE downloads ADD COLUMN resume_data TEXT;');
  if (!names.has('referer')) await d.execAsync('ALTER TABLE downloads ADD COLUMN referer TEXT;');
  migrated = true;
}

async function db() {
  if (!promise) promise = SQLite.openDatabaseAsync('raid-downloads.db');
  const value = await promise;
  await value.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      local_uri TEXT,
      referer TEXT,
      state TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      total_bytes INTEGER,
      written_bytes INTEGER NOT NULL DEFAULT 0,
      speed_bps REAL NOT NULL DEFAULT 0,
      eta_seconds INTEGER,
      resume_data TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_updated_at ON downloads(updated_at DESC);
  `);
  await migrate(value);
  return value;
}

export async function createDownload(url: string, fileName: string, localUri: string, referer: string | null = null) {
  const d = await db();
  const now = Date.now();
  const result = await d.runAsync(
    'INSERT INTO downloads (url,file_name,local_uri,referer,state,progress,total_bytes,written_bytes,speed_bps,eta_seconds,resume_data,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    url, fileName, localUri, referer, 'queued', 0, null, 0, 0, null, null, null, now, now,
  );
  return Number(result.lastInsertRowId);
}

export async function updateDownload(id: number, patch: Partial<Pick<DownloadItem, 'state'|'progress'|'total_bytes'|'written_bytes'|'speed_bps'|'eta_seconds'|'resume_data'|'error'|'local_uri'>>) {
  const d = await db();
  const current = await d.getFirstAsync<DownloadItem>('SELECT * FROM downloads WHERE id=?', id);
  if (!current) return;
  await d.runAsync(
    'UPDATE downloads SET state=?,progress=?,total_bytes=?,written_bytes=?,speed_bps=?,eta_seconds=?,resume_data=?,error=?,local_uri=?,updated_at=? WHERE id=?',
    patch.state ?? current.state,
    patch.progress ?? current.progress,
    patch.total_bytes === undefined ? current.total_bytes : patch.total_bytes,
    patch.written_bytes ?? current.written_bytes,
    patch.speed_bps ?? current.speed_bps ?? 0,
    patch.eta_seconds === undefined ? current.eta_seconds : patch.eta_seconds,
    patch.resume_data === undefined ? current.resume_data : patch.resume_data,
    patch.error === undefined ? current.error : patch.error,
    patch.local_uri === undefined ? current.local_uri : patch.local_uri,
    Date.now(), id,
  );
}

export async function listDownloads(limit = 100) {
  const d = await db();
  return d.getAllAsync<DownloadItem>('SELECT * FROM downloads ORDER BY updated_at DESC LIMIT ?', limit);
}

export async function getDownload(id: number) {
  const d = await db();
  return d.getFirstAsync<DownloadItem>('SELECT * FROM downloads WHERE id=?', id);
}

export async function setDownloadState(id: number, state: DownloadState, error: string | null = null) {
  await updateDownload(id, { state, error });
}

export async function deleteDownloadRecord(id: number) {
  const d = await db();
  await d.runAsync('DELETE FROM downloads WHERE id=?', id);
}
