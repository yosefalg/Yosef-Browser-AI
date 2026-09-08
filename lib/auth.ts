import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://aoftmiajhujveahjqlct.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WRrrrMpgaFmM3ikNJxYHtA_l9-RO0cP';

let client: SupabaseClient | null = null;

export type RaidUserProfile = {
  user_id: string;
  display_name: string;
  locale: string;
  created_at: string;
  updated_at: string;
};

export function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        storage: {
          getItem: (key) => SecureStore.getItemAsync(key),
          setItem: (key, value) => SecureStore.setItemAsync(key, value),
          removeItem: (key) => SecureStore.deleteItemAsync(key),
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export async function getCurrentSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

async function ensureProfile(userId: string, displayName?: string) {
  const supabase = getSupabase();
  const { data: existing, error: readError } = await supabase
    .from('raid_user_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>();
  if (readError) throw readError;
  if (existing) return;

  const cleanName = (displayName || '').trim().slice(0, 80);
  const { error } = await supabase.from('raid_user_profiles').insert({
    user_id: userId,
    display_name: cleanName,
    locale: 'ar-IQ',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getCurrentProfile(): Promise<RaidUserProfile | null> {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  const { data, error } = await getSupabase()
    .from('raid_user_profiles')
    .select('user_id,display_name,locale,created_at,updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle<RaidUserProfile>();
  if (error) throw error;
  return data;
}

export async function updateCurrentProfile(displayName: string) {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error('يجب تسجيل الدخول أولًا.');
  await ensureProfile(session.user.id, displayName);
  const { error } = await getSupabase()
    .from('raid_user_profiles')
    .update({ display_name: displayName.trim().slice(0, 80), locale: 'ar-IQ', updated_at: new Date().toISOString() })
    .eq('user_id', session.user.id);
  if (error) throw error;
  return getCurrentProfile();
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) {
    const name = String(data.user.user_metadata?.display_name || '').trim();
    await ensureProfile(data.user.id, name);
  }
  return data;
}

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName.trim().slice(0, 80), locale: 'ar-IQ' } },
  });
  if (error) throw error;
  if (data.user && data.session) await ensureProfile(data.user.id, displayName);
  return data;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
