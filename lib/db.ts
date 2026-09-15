import * as SQLite from 'expo-sqlite';

export type StoredPageContext = { url:string; title:string; text:string; captured_at:number };
export type AgentTask = { id:number; title:string; payload:string; due_at:number|null; status:'pending'|'done'|'cancelled'; created_at:number };
export type Workspace = { id:number; name:string; created_at:number };
export type TabContext = { id:number; workspace_id:number|null; url:string; title:string; text:string; updated_at:number };
export type BrowserTab = { id:number; url:string; title:string; private_mode:number; created_at:number; updated_at:number };
export type ClosedBrowserTab = { id:number; url:string; title:string; closed_at:number };
export type ProtectionStats = { ads_removed:number; popups_blocked:number; updated_at:number };

const MAX_OPEN_TABS = 50;
const MAX_RECENTLY_CLOSED = 30;

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
    CREATE TABLE IF NOT EXISTS protection_stats (id INTEGER PRIMARY KEY CHECK (id = 1),ads_removed INTEGER NOT NULL DEFAULT 0,popups_blocked INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO protection_stats (id,ads_removed,popups_blocked,updated_at) VALUES (1,0,0,0);
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
    CREATE TABLE IF NOT EXISTS closed_browser_tabs (id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',closed_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_closed_browser_tabs_closed_at ON closed_browser_tabs(closed_at DESC);
    DELETE FROM browser_tabs WHERE private_mode != 0;
  `);
  return d;
}

async function trimRecentlyClosed(d: SQLite.SQLiteDatabase) {
  await d.runAsync('DELETE FROM closed_browser_tabs WHERE id NOT IN (SELECT id FROM closed_browser_tabs ORDER BY closed_at DESC LIMIT ?)', MAX_RECENTLY_CLOSED);
}

async function archiveClosedTab(d: SQLite.SQLiteDatabase, tab: Pick<BrowserTab,'url'|'title'|'private_mode'>, closedAt = Date.now()) {
  if (tab.private_mode !== 0 || !/^https?:\/\//i.test(tab.url)) return;
  await d.runAsync('INSERT INTO closed_browser_tabs (url,title,closed_at) VALUES (?,?,?)',tab.url,tab.title||tab.url,closedAt);
}

async function trimOpenTabs(d: SQLite.SQLiteDatabase, closedAt = Date.now()) {
  const overflow=await d.getAllAsync<BrowserTab>('SELECT * FROM browser_tabs WHERE private_mode=0 ORDER BY updated_at DESC LIMIT -1 OFFSET ?',MAX_OPEN_TABS);
  if(!overflow.length)return;
  for(const tab of overflow)await archiveClosedTab(d,tab,closedAt);
  const placeholders=overflow.map(()=>'?').join(',');
  await d.runAsync(`DELETE FROM browser_tabs WHERE private_mode=0 AND id IN (${placeholders})`,...overflow.map(tab=>tab.id));
  await trimRecentlyClosed(d);
}

export async function addHistory(url:string,title?:string){const d=await db();await d.runAsync('INSERT INTO history (url,title,visited_at) VALUES (?,?,?)',url,title??'',Date.now());await d.runAsync('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY visited_at DESC LIMIT 2000)');}
export async function removeHistoryEntry(id:number){if(!Number.isInteger(id)||id<=0)return;const d=await db();await d.runAsync('DELETE FROM history WHERE id=?',id);}
export async function clearHistory(){const d=await db();await d.execAsync('DELETE FROM history');}
export async function getHistory(limit=100){const d=await db();return d.getAllAsync<{id:number;url:string;title:string;visited_at:number}>('SELECT * FROM history ORDER BY visited_at DESC LIMIT ?',limit);}
export async function getRecentSites(limit=8){const d=await db();return d.getAllAsync<{url:string;title:string;visited_at:number}>('SELECT url,MAX(title) AS title,MAX(visited_at) AS visited_at FROM history GROUP BY url ORDER BY visited_at DESC LIMIT ?',limit);}
export async function addBookmark(url:string,title?:string){const d=await db();await d.runAsync('INSERT OR REPLACE INTO bookmarks (url,title,created_at) VALUES (?,?,?)',url,title??'',Date.now());}
export async function removeBookmark(url:string){const d=await db();await d.runAsync('DELETE FROM bookmarks WHERE url=?',url);}
export async function isBookmarked(url:string){const d=await db();return Boolean(await d.getFirstAsync('SELECT 1 FROM bookmarks WHERE url=? LIMIT 1',url));}
export async function getBookmarks(){const d=await db();return d.getAllAsync<{id:number;url:string;title:string;created_at:number}>('SELECT * FROM bookmarks ORDER BY created_at DESC');}
export async function getProtectionStats(){const d=await db();return (await d.getFirstAsync<ProtectionStats>('SELECT ads_removed,popups_blocked,updated_at FROM protection_stats WHERE id=1'))||{ads_removed:0,popups_blocked:0,updated_at:0};}
export async function incrementProtectionStats(adsRemoved=0,popupsBlocked=0){const ads=Math.max(0,Math.min(10000,Math.floor(adsRemoved)));const popups=Math.max(0,Math.min(1000,Math.floor(popupsBlocked)));if(!ads&&!popups)return;const d=await db();await d.runAsync('UPDATE protection_stats SET ads_removed=ads_removed+?,popups_blocked=popups_blocked+?,updated_at=? WHERE id=1',ads,popups,Date.now());}
export async function resetProtectionStats(){const d=await db();await d.runAsync('UPDATE protection_stats SET ads_removed=0,popups_blocked=0,updated_at=? WHERE id=1',Date.now());}
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

export async function createBrowserTab(url:string,title='علامة تبويب جديدة',privateMode=false){
  // Private browsing must remain memory-only. Never create a SQLite row for it.
  if(privateMode)return 0;
  const d=await db();const now=Date.now();
  await d.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try{
    const result=await d.runAsync('INSERT INTO browser_tabs (url,title,private_mode,created_at,updated_at) VALUES (?,?,?,?,?)',url,title.trim().slice(0,300)||'علامة تبويب جديدة',0,now,now);
    await trimOpenTabs(d,now);
    await d.execAsync('COMMIT');
    return result.lastInsertRowId;
  }catch(error){
    await d.execAsync('ROLLBACK').catch(()=>{});
    throw error;
  }
}
export async function updateBrowserTab(id:number,url:string,title?:string){if(!Number.isFinite(id)||id<=0||!/^https?:\/\//i.test(url))return;const d=await db();await d.runAsync('UPDATE browser_tabs SET url=?,title=?,updated_at=? WHERE id=? AND private_mode=0',url,(title||url).trim().slice(0,300),Date.now(),id);}
export async function getBrowserTabs(limit=50){const d=await db();return d.getAllAsync<BrowserTab>('SELECT * FROM browser_tabs WHERE private_mode=0 ORDER BY updated_at DESC LIMIT ?',Math.min(Math.max(1,limit),MAX_OPEN_TABS));}
export async function getRecentlyClosedTabs(limit=12){const d=await db();return d.getAllAsync<ClosedBrowserTab>('SELECT * FROM closed_browser_tabs ORDER BY closed_at DESC LIMIT ?',Math.min(Math.max(1,limit),MAX_RECENTLY_CLOSED));}
export async function clearRecentlyClosedTabs(){const d=await db();await d.execAsync('DELETE FROM closed_browser_tabs');}
export async function closeBrowserTabs(ids:number[]){
  const cleanIds=Array.from(new Set(ids.filter(id=>Number.isInteger(id)&&id>0)));
  if(!cleanIds.length)return 0;
  const d=await db();
  const placeholders=cleanIds.map(()=>'?').join(',');
  await d.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try{
    const tabs=await d.getAllAsync<BrowserTab>(`SELECT * FROM browser_tabs WHERE private_mode=0 AND id IN (${placeholders}) ORDER BY updated_at DESC`,...cleanIds);
    const closedAt=Date.now();
    for(const tab of tabs)await archiveClosedTab(d,tab,closedAt);
    if(tabs.length)await d.runAsync(`DELETE FROM browser_tabs WHERE private_mode=0 AND id IN (${placeholders})`,...cleanIds);
    await trimRecentlyClosed(d);
    await d.execAsync('COMMIT');
    return tabs.length;
  }catch(error){
    await d.execAsync('ROLLBACK').catch(()=>{});
    throw error;
  }
}
export async function closeBrowserTab(id:number){await closeBrowserTabs([id]);}
export async function restoreClosedBrowserTab(id:number){
  if(!Number.isInteger(id)||id<=0)return null;
  const d=await db();
  await d.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try{
    const tab=await d.getFirstAsync<ClosedBrowserTab>('SELECT * FROM closed_browser_tabs WHERE id=?',id);
    if(!tab||!/^https?:\/\//i.test(tab.url)){
      await d.execAsync('COMMIT');
      return null;
    }
    const now=Date.now();
    const result=await d.runAsync('INSERT INTO browser_tabs (url,title,private_mode,created_at,updated_at) VALUES (?,?,?,?,?)',tab.url,(tab.title||tab.url).trim().slice(0,300),0,now,now);
    await d.runAsync('DELETE FROM closed_browser_tabs WHERE id=?',id);
    await trimOpenTabs(d,now);
    await d.execAsync('COMMIT');
    return {id:result.lastInsertRowId,url:tab.url,title:tab.title};
  }catch(error){
    await d.execAsync('ROLLBACK').catch(()=>{});
    throw error;
  }
}
export async function closeAllBrowserTabs(){const d=await db();const tabs=await d.getAllAsync<BrowserTab>('SELECT * FROM browser_tabs WHERE private_mode=0 ORDER BY updated_at DESC');return closeBrowserTabs(tabs.map(tab=>tab.id));}
