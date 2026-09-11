import * as SQLite from 'expo-sqlite';
import type { DownloadItem, DownloadState } from './types';

let promise: Promise<SQLite.SQLiteDatabase> | null = null;

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
      state TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      total_bytes INTEGER,
      written_bytes INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_updated_at ON downloads(updated_at DESC);
  `);
  return value;
}

export async function createDownload(url: string, fileName: string, localUri: string) {
  const d = await db();
  const now = Date.now();
  const result = await d.runAsync(
    'INSERT INTO downloads (url,file_name,local_uri,state,progress,total_bytes,written_bytes,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    url, fileName, localUri, 'queued', 0, null, 0, null, now, now,
  );
  return Number(result.lastInsertRowId);
}

export async function updateDownload(id: number, patch: Partial<Pick<DownloadItem, 'state'|'progress'|'total_bytes'|'written_bytes'|'error'|'local_uri'>>) {
  const d = await db();
  const current = await d.getFirstAsync<DownloadItem>('SELECT * FROM downloads WHERE id=?', id);
  if (!current) return;
  await d.runAsync(
    'UPDATE downloads SET state=?,progress=?,total_bytes=?,written_bytes=?,error=?,local_uri=?,updated_at=? WHERE id=?',
    patch.state ?? current.state,
    patch.progress ?? current.progress,
    patch.total_bytes === undefined ? current.total_bytes : patch.total_bytes,
    patch.written_bytes ?? current.written_bytes,
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
