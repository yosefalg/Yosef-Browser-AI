import { getSupabase } from './auth';
import { addBookmark, getBookmarks, getMemories, getSettingStrict, remember, setSettings } from './db';
import { isThemeName, type ThemeName } from './theme';

const THEME_KEY = 'theme';
const THEME_UPDATED_AT_KEY = 'theme_updated_at';

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

function validTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cloudTimestamp(value: unknown) {
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncPreferencesWithCloud() {
  const { supabase, user } = await currentUser();
  const [savedTheme, savedUpdatedAt] = await Promise.all([
    getSettingStrict<unknown>(THEME_KEY, 'cinematic'),
    getSettingStrict<unknown>(THEME_UPDATED_AT_KEY, 0),
  ]);
  const hasValidLocalTheme = isThemeName(savedTheme);
  const localTheme: ThemeName = hasValidLocalTheme ? savedTheme : 'cinematic';
  let localUpdatedAt = hasValidLocalTheme ? validTimestamp(savedUpdatedAt) : 0;
  const { data, error } = await supabase
    .from('raid_user_settings')
    .select('key,value,updated_at')
    .eq('user_id', user.id)
    .eq('key', THEME_KEY)
    .limit(1);
  if (error) throw error;

  const cloud = data?.[0];
  const cloudTheme = isThemeName(cloud?.value) ? cloud.value : null;
  const cloudUpdatedAt = cloudTimestamp(cloud?.updated_at);

  if (cloudTheme && (localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt)) {
    const appliedAt = cloudUpdatedAt || Date.now();
    await setSettings([
      [THEME_KEY, cloudTheme],
      [THEME_UPDATED_AT_KEY, appliedAt],
    ]);
    return { uploaded: 0, downloaded: 1 };
  }

  if (!cloudTheme || cloudTheme !== localTheme || localUpdatedAt > cloudUpdatedAt) {
    if (localUpdatedAt === 0) {
      localUpdatedAt = Date.now();
      await setSettings([
        [THEME_KEY, localTheme],
        [THEME_UPDATED_AT_KEY, localUpdatedAt],
      ]);
    }
    const { error: uploadError } = await supabase.from('raid_user_settings').upsert([
      { user_id: user.id, key: THEME_KEY, value: localTheme, updated_at: new Date(localUpdatedAt).toISOString() },
    ], { onConflict: 'user_id,key' });
    if (uploadError) throw uploadError;
    return { uploaded: 1, downloaded: 0 };
  }

  return { uploaded: 0, downloaded: 0 };
}

export async function syncAccountData() {
  const startedAt = Date.now();
  const [memoryUp, bookmarksUp, settings] = await Promise.all([
    pushMemoriesToCloud(),
    pushBookmarksToCloud(),
    syncPreferencesWithCloud(),
  ]);
  const [memoryDown, bookmarksDown] = await Promise.all([
    pullMemoriesFromCloud(),
    pullBookmarksFromCloud(),
  ]);
  return {
    uploaded: memoryUp + bookmarksUp + settings.uploaded,
    downloaded: memoryDown + bookmarksDown + settings.downloaded,
    durationMs: Date.now() - startedAt,
  };
}
