import * as SQLite from 'expo-sqlite';

export type StoredPageContext = { url:string; title:string; text:string; captured_at:number };
export type AgentTask = { id:number; title:string; payload:string; due_at:number|null; status:'pending'|'done'|'cancelled'; created_at:number };
export type Workspace = { id:number; name:string; created_at:number };
export type TabContext = { id:number; workspace_id:number|null; url:string; title:string; text:string; updated_at:number };
export type BrowserTab = { id:number; url:string; title:string; private_mode:number; created_at:number; updated_at:number };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function db() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('raid-browser.db');
  const d = await dbPromise;
  await d.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,title TEXT,visited_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at DESC);
    CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL UNIQUE,title TEXT,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS page_context (id INTEGER PRIMARY KEY CHECK (id = 1),url TEXT NOT NULL,title TEXT,text TEXT NOT NULL,captured_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS browser_memory (id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,value TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_browser_memory_created_at ON browser_memory(created_at DESC);
    CREATE TABLE IF NOT EXISTS agent_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,payload TEXT NOT NULL,due_at INTEGER,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_due_at ON agent_tasks(status,due_at);
    CREATE TABLE IF NOT EXISTS workspaces (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tab_contexts (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER,url TEXT NOT NULL UNIQUE,title TEXT,text TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL);
    CREATE INDEX IF NOT EXISTS idx_tab_contexts_workspace ON tab_contexts(workspace_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS browser_tabs (id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',private_mode INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_browser_tabs_updated_at ON browser_tabs(updated_at DESC);
  `);
  return d;
}

export async function addHistory(url:string,title?:string){const d=await db();await d.runAsync('INSERT INTO history (url,title,visited_at) VALUES (?,?,?)',url,title??'',Date.now());await d.runAsync('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY visited_at DESC LIMIT 2000)');}
export async function clearHistory(){const d=await db();await d.execAsync('DELETE FROM history');}
export async function getHistory(limit=100){const d=await db();return d.getAllAsync<{id:number;url:string;title:string;visited_at:number}>('SELECT * FROM history ORDER BY visited_at DESC LIMIT ?',limit);}
export async function getRecentSites(limit=8){const d=await db();return d.getAllAsync<{url:string;title:string;visited_at:number}>('SELECT url,MAX(title) AS title,MAX(visited_at) AS visited_at FROM history GROUP BY url ORDER BY visited_at DESC LIMIT ?',limit);}
export async function addBookmark(url:string,title?:string){const d=await db();await d.runAsync('INSERT OR REPLACE INTO bookmarks (url,title,created_at) VALUES (?,?,?)',url,title??'',Date.now());}
export async function removeBookmark(url:string){const d=await db();await d.runAsync('DELETE FROM bookmarks WHERE url=?',url);}
export async function isBookmarked(url:string){const d=await db();return Boolean(await d.getFirstAsync('SELECT 1 FROM bookmarks WHERE url=? LIMIT 1',url));}
export async function getBookmarks(){const d=await db();return d.getAllAsync<{id:number;url:string;title:string;created_at:number}>('SELECT * FROM bookmarks ORDER BY created_at DESC');}
export async function setSetting(key:string,value:unknown){const d=await db();await d.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',key,JSON.stringify(value));}
export async function getSetting<T>(key:string,fallback:T):Promise<T>{try{const d=await db();const row=await d.getFirstAsync<{value:string}>('SELECT value FROM settings WHERE key=?',key);return row?JSON.parse(row.value) as T:fallback;}catch{return fallback;}}
export async function setPageContext(url:string,title:string,text:string){const cleanText=text.slice(0,16000);const now=Date.now();const d=await db();await d.runAsync('INSERT OR REPLACE INTO page_context (id,url,title,text,captured_at) VALUES (1,?,?,?,?)',url,title,cleanText,now);await upsertTabContext(url,title,cleanText,null);}
export async function getLatestPageContext():Promise<StoredPageContext|null>{const d=await db();return d.getFirstAsync<StoredPageContext>('SELECT url,title,text,captured_at FROM page_context WHERE id=1');}
export async function remember(kind:string,value:string){const cleanKind=kind.trim().slice(0,40)||'note';const cleanValue=value.trim().slice(0,1000);if(!cleanValue)return;const d=await db();await d.runAsync('INSERT INTO browser_memory (kind,value,created_at) VALUES (?,?,?)',cleanKind,cleanValue,Date.now());await d.runAsync('DELETE FROM browser_memory WHERE id NOT IN (SELECT id FROM browser_memory ORDER BY created_at DESC LIMIT 200)');}
export async function getMemories(limit=12){const d=await db();return d.getAllAsync<{id:number;kind:string;value:string;created_at:number}>('SELECT * FROM browser_memory ORDER BY created_at DESC LIMIT ?',limit);}
export async function createAgentTask(title:string,payload:string,dueAt?:number|null){const d=await db();const result=await d.runAsync('INSERT INTO agent_tasks (title,payload,due_at,status,created_at) VALUES (?,?,?,?,?)',title.trim().slice(0,160),payload.trim().slice(0,4000),dueAt??null,'pending',Date.now());return result.lastInsertRowId;}
export async function getPendingAgentTasks(limit=50){const d=await db();return d.getAllAsync<AgentTask>('SELECT * FROM agent_tasks WHERE status=? ORDER BY COALESCE(due_at,created_at) ASC LIMIT ?','pending',limit);}
export async function completeAgentTask(id:number){const d=await db();await d.runAsync('UPDATE agent_tasks SET status=? WHERE id=?','done',id);}
export async function createWorkspace(name:string){const d=await db();const result=await d.runAsync('INSERT INTO workspaces (name,created_at) VALUES (?,?)',name.trim().slice(0,120),Date.now());return result.lastInsertRowId;}
export async function getWorkspaces(){const d=await db();return d.getAllAsync<Workspace>('SELECT * FROM workspaces ORDER BY created_at DESC');}
export async function upsertTabContext(url:string,title:string,text:string,workspaceId:number|null){const d=await db();await d.runAsync(`INSERT INTO tab_contexts (workspace_id,url,title,text,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET workspace_id=COALESCE(excluded.workspace_id,tab_contexts.workspace_id),title=excluded.title,text=excluded.text,updated_at=excluded.updated_at`,workspaceId,url,title,text.slice(0,16000),Date.now());}
export async function assignTabToWorkspace(url:string,workspaceId:number){const d=await db();await d.runAsync('UPDATE tab_contexts SET workspace_id=? WHERE url=?',workspaceId,url);}
export async function getTabContexts(workspaceId?:number|null,limit=12){const d=await db();if(workspaceId==null)return d.getAllAsync<TabContext>('SELECT * FROM tab_contexts ORDER BY updated_at DESC LIMIT ?',limit);return d.getAllAsync<TabContext>('SELECT * FROM tab_contexts WHERE workspace_id=? ORDER BY updated_at DESC LIMIT ?',workspaceId,limit);}

export async function createBrowserTab(url:string,title='علامة تبويب جديدة',privateMode=false){const d=await db();const now=Date.now();const result=await d.runAsync('INSERT INTO browser_tabs (url,title,private_mode,created_at,updated_at) VALUES (?,?,?,?,?)',url,title.trim().slice(0,300)||'علامة تبويب جديدة',privateMode?1:0,now,now);await d.runAsync('DELETE FROM browser_tabs WHERE id NOT IN (SELECT id FROM browser_tabs ORDER BY updated_at DESC LIMIT 50)');return result.lastInsertRowId;}
export async function updateBrowserTab(id:number,url:string,title?:string){if(!Number.isFinite(id)||id<=0)return;const d=await db();await d.runAsync('UPDATE browser_tabs SET url=?,title=?,updated_at=? WHERE id=?',url,(title||url).trim().slice(0,300),Date.now(),id);}
export async function getBrowserTabs(limit=50){const d=await db();return d.getAllAsync<BrowserTab>('SELECT * FROM browser_tabs WHERE private_mode=0 ORDER BY updated_at DESC LIMIT ?',limit);}
export async function closeBrowserTab(id:number){const d=await db();await d.runAsync('DELETE FROM browser_tabs WHERE id=?',id);}
export async function closeAllBrowserTabs(){const d=await db();await d.runAsync('DELETE FROM browser_tabs WHERE private_mode=0');}
