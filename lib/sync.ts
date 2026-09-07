import { getSupabase } from './auth';
import { getMemories, remember } from './db';

export async function pushMemoriesToCloud() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error('User is not signed in');

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
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error('User is not signed in');

  const { data, error } = await supabase
    .from('raid_browser_memory')
    .select('kind,value,created_at_ms')
    .eq('user_id', user.id)
    .order('created_at_ms', { ascending: false })
    .limit(200);
  if (error) throw error;
  for (const item of data ?? []) {
    if (typeof item.kind === 'string' && typeof item.value === 'string') {
      await remember(item.kind, item.value);
    }
  }
  return data?.length ?? 0;
}
