import { getSupabase } from './auth';
import { addBookmark, getBookmarks, getMemories, getSetting, remember, setSetting } from './db';
import type { ThemeName } from './theme';

async function currentUser() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error('سجّل الدخول أولًا للمزامنة.');
  return { supabase, user };
}

export async function pushMemoriesToCloud() {
  const { supabase, user } = await currentUser();
  const memories = await getMemories(200);
  if (!memories.length) return 0;
  const rows = memories.map((m) => ({
    user_id: user.id,
    local_id: m.id,
    kind: m.kind,
    value: m.value,
    created_at_ms: m.created_at,
  }));
  const { error } = await supabase.from('raid_browser_memory').upsert(rows, { onConflict: 'user_id,local_id' });
  if (error) throw error;
  return rows.length;
}

export async function pullMemoriesFromCloud() {
  const { supabase, user } = await currentUser();
  const { data, error } = await supabase
    .from('raid_browser_memory')
    .select('kind,value,created_at_ms')
    .eq('user_id', user.id)
    .order('created_at_ms', { ascending: false })
    .limit(200);
  if (error) throw error;

  const existing = await getMemories(200);
  const known = new Set(existing.map((m) => `${m.kind}\u0000${m.value}`));
  let imported = 0;
  for (const item of data ?? []) {
    if (typeof item.kind !== 'string' || typeof item.value !== 'string') continue;
    const key = `${item.kind}\u0000${item.value}`;
    if (known.has(key)) continue;
    await remember(item.kind, item.value);
    known.add(key);
    imported += 1;
  }
  return imported;
}

export async function pushBookmarksToCloud() {
  const { supabase, user } = await currentUser();
  const bookmarks = await getBookmarks();
  if (!bookmarks.length) return 0;
  const rows = bookmarks.map((b) => ({
    user_id: user.id,
    url: b.url,
    title: b.title ?? '',
    created_at_ms: b.created_at,
  }));
  const { error } = await supabase.from('raid_bookmarks').upsert(rows, { onConflict: 'user_id,url' });
  if (error) throw error;
  return rows.length;
}

export async function pullBookmarksFromCloud() {
  const { supabase, user } = await currentUser();
  const { data, error } = await supabase
    .from('raid_bookmarks')
    .select('url,title,created_at_ms')
    .eq('user_id', user.id)
    .order('created_at_ms', { ascending: false })
    .limit(500);
  if (error) throw error;
  let imported = 0;
  for (const item of data ?? []) {
    if (typeof item.url === 'string' && item.url.startsWith('http')) {
      await addBookmark(item.url, typeof item.title === 'string' ? item.title : '');
      imported += 1;
    }
  }
  return imported;
}

export async function pushPreferencesToCloud() {
  const { supabase, user } = await currentUser();
  const theme = await getSetting<ThemeName>('theme', 'cinematic');
  const rows = [
    { user_id: user.id, key: 'theme', value: theme, updated_at: new Date().toISOString() },
  ];
  const { error } = await supabase.from('raid_user_settings').upsert(rows, { onConflict: 'user_id,key' });
  if (error) throw error;
  return rows.length;
}

export async function pullPreferencesFromCloud() {
  const { supabase, user } = await currentUser();
  const { data, error } = await supabase
    .from('raid_user_settings')
    .select('key,value')
    .eq('user_id', user.id)
    .in('key', ['theme']);
  if (error) throw error;
  let imported = 0;
  for (const item of data ?? []) {
    if (item.key === 'theme' && typeof item.value === 'string') {
      await setSetting('theme', item.value);
      imported += 1;
    }
  }
  return imported;
}

export async function syncAccountData() {
  const startedAt = Date.now();
  const [memoryUp, bookmarksUp, settingsUp] = await Promise.all([
    pushMemoriesToCloud(),
    pushBookmarksToCloud(),
    pushPreferencesToCloud(),
  ]);
  const [memoryDown, bookmarksDown, settingsDown] = await Promise.all([
    pullMemoriesFromCloud(),
    pullBookmarksFromCloud(),
    pullPreferencesFromCloud(),
  ]);
  return {
    uploaded: memoryUp + bookmarksUp + settingsUp,
    downloaded: memoryDown + bookmarksDown + settingsDown,
    durationMs: Date.now() - startedAt,
  };
}
