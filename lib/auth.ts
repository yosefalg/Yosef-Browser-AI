import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://aoftmiajhujveahjqlct.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WRrrrMpgaFmM3ikNJxYHtA_l9-RO0cP';

let client: SupabaseClient | null = null;

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

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
