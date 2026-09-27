import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://aoftmiajhujveahjqlct.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WRrrrMpgaFmM3ikNJxYHtA_l9-RO0cP';
const AUTH_CHUNK_SIZE = 1800;
const AUTH_CHUNK_MARKER = 'raid-auth-chunks:';
const AUTH_CHUNK_MARKER_V2 = 'raid-auth-chunks-v2:';
const AUTH_MAX_CHUNKS = 64;

let client: SupabaseClient | null = null;
let authChunkGeneration = 0;
let authStorageWriteQueue = Promise.resolve();

export type RaidUserProfile = {
  user_id: string;
  display_name: string;
  locale: string;
  created_at: string;
  updated_at: string;
};

type AuthChunkDescriptor = { count: number; generation: string | null };

function authChunkKey(key: string, index: number, generation: string | null) {
  return generation ? `${key}.raid.${generation}.${index}` : `${key}.raid.${index}`;
}

function chunkDescriptor(value: string | null): AuthChunkDescriptor | null {
  if (!value) return null;
  if (value.startsWith(AUTH_CHUNK_MARKER_V2)) {
    const [generation, rawCount] = value.slice(AUTH_CHUNK_MARKER_V2.length).split(':');
    const count = Number(rawCount);
    if (/^[a-z0-9-]{1,48}$/i.test(generation || '') && Number.isInteger(count) && count > 0 && count <= AUTH_MAX_CHUNKS) {
      return { generation, count };
    }
    return null;
  }
  if (!value.startsWith(AUTH_CHUNK_MARKER)) return null;
  const count = Number(value.slice(AUTH_CHUNK_MARKER.length));
  return Number.isInteger(count) && count > 0 && count <= AUTH_MAX_CHUNKS
    ? { generation: null, count }
    : null;
}

async function clearAuthChunks(key: string, marker?: string | null) {
  const storedMarker = marker === undefined ? await SecureStore.getItemAsync(key) : marker;
  const descriptor = chunkDescriptor(storedMarker);
  if (!descriptor) return;
  await Promise.all(Array.from({ length: descriptor.count }, (_, index) =>
    SecureStore.deleteItemAsync(authChunkKey(key, index, descriptor.generation)).catch(() => {})
  ));
}

function queueAuthStorageWrite<T>(operation: () => Promise<T>) {
  const result = authStorageWriteQueue.catch(() => {}).then(operation);
  authStorageWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

const secureAuthStorage = {
  async getItem(key: string) {
    const stored = await SecureStore.getItemAsync(key);
    const descriptor = chunkDescriptor(stored);
    if (!descriptor) return stored;

    const chunks = await Promise.all(Array.from({ length: descriptor.count }, (_, index) =>
      SecureStore.getItemAsync(authChunkKey(key, index, descriptor.generation))
    ));
    if (chunks.some((part) => part == null)) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      await clearAuthChunks(key, stored);
      return null;
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    return queueAuthStorageWrite(async () => {
      const previous = await SecureStore.getItemAsync(key);
      if (value.length <= AUTH_CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await clearAuthChunks(key, previous);
        return;
      }

      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += AUTH_CHUNK_SIZE) {
        chunks.push(value.slice(offset, offset + AUTH_CHUNK_SIZE));
      }
      if (chunks.length > AUTH_MAX_CHUNKS) throw new Error('جلسة الحساب أكبر من حد التخزين الآمن.');

      authChunkGeneration = (authChunkGeneration + 1) % 1_000_000;
      const generation = `${Date.now().toString(36)}-${authChunkGeneration.toString(36)}`;
      const marker = `${AUTH_CHUNK_MARKER_V2}${generation}:${chunks.length}`;
      try {
        await Promise.all(chunks.map((part, index) =>
          SecureStore.setItemAsync(authChunkKey(key, index, generation), part)
        ));
        await SecureStore.setItemAsync(key, marker);
      } catch (error) {
        await clearAuthChunks(key, marker);
        throw error;
      }
      await clearAuthChunks(key, previous);
    });
  },

  async removeItem(key: string) {
    return queueAuthStorageWrite(async () => {
      const stored = await SecureStore.getItemAsync(key);
      await SecureStore.deleteItemAsync(key);
      await clearAuthChunks(key, stored);
    });
  },
};

export function getSupabasePublicRuntimeConfig() {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getSupabase() {
  const { url, publishableKey } = getSupabasePublicRuntimeConfig();
  if (!client) {
    client = createClient(url, publishableKey, {
      auth: {
        storage: secureAuthStorage,
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export async function getCurrentSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data.session;
  const expiresSoon = session?.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (session && expiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) session = refreshed.session;
  }
  return session;
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

async function syncProfileBestEffort(userId: string, displayName?: string) {
  try {
    await ensureProfile(userId, displayName);
  } catch (error) {
    console.warn('RAID profile sync deferred', error);
  }
}

export async function syncCurrentUserProfileBestEffort() {
  const session = await getCurrentSession();
  if (!session?.user) return;
  const name = String(session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || '').trim();
  await syncProfileBestEffort(session.user.id, name);
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
    await syncProfileBestEffort(data.user.id, name);
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
  if (data.user && data.session) await syncProfileBestEffort(data.user.id, displayName);
  return data;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
