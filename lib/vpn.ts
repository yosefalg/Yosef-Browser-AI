import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getSupabase } from '@/lib/auth';

const LEGACY_CONFIG_KEY = 'raid_wireguard_config_v2';
const OWNER_KEY = 'raid_wireguard_owner_v3';
const configKeyFor = (userId: string) => `raid_wireguard_config_v3_${userId}`;

type RaidVpnNative = {
  connect(configText: string): Promise<boolean>;
  disconnect(): Promise<boolean>;
  getStatus(): Promise<boolean>;
};

type VpnFunctionPayload = {
  configured?: boolean;
  configText?: string;
  updatedAt?: string | null;
  reason?: string;
  error?: string;
};

type FunctionErrorLike = Error & { context?: Response };

export type VpnProvisioningState = {
  configured: boolean;
  source: 'service' | 'cache' | 'none';
};

function native(): RaidVpnNative {
  if (Platform.OS !== 'android') throw new Error('RAID VPN متاح حاليًا على Android فقط.');
  const module = NativeModules.RaidVpn as RaidVpnNative | undefined;
  if (!module) throw new Error('وحدة RAID VPN غير موجودة في هذا الإصدار. أعد بناء APK.');
  return module;
}

function validateConfig(configText: string) {
  const value = configText.trim();
  if (!value.includes('[Interface]') || !value.includes('[Peer]') || !value.includes('Endpoint')) {
    throw new Error('إعداد WireGuard غير صالح أو غير مكتمل.');
  }
  return value;
}

async function cacheConfigForUser(userId: string, configText: string) {
  const value = validateConfig(configText);
  await SecureStore.setItemAsync(configKeyFor(userId), value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(OWNER_KEY, userId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.deleteItemAsync(LEGACY_CONFIG_KEY).catch(() => {});
  return value;
}

async function loadConfigForUser(userId: string) {
  const owner = await SecureStore.getItemAsync(OWNER_KEY);
  if (owner !== userId) return null;
  return SecureStore.getItemAsync(configKeyFor(userId));
}

async function clearConfigForUser(userId?: string) {
  if (userId) await SecureStore.deleteItemAsync(configKeyFor(userId)).catch(() => {});
  await SecureStore.deleteItemAsync(OWNER_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(LEGACY_CONFIG_KEY).catch(() => {});
}

async function getValidSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let session = data.session;
  if (!session) return null;

  const expiresSoon = session.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (expiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) session = refreshed.session;
  }
  return session;
}

async function currentUserId() {
  const session = await getValidSession();
  return session?.user.id ?? null;
}

async function invokeVpnConfig(accessToken: string) {
  return getSupabase().functions.invoke('raid-vpn-config', {
    body: {},
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function functionStatus(error: unknown) {
  return (error as FunctionErrorLike | null)?.context?.status;
}

async function readFunctionError(error: unknown) {
  const response = (error as FunctionErrorLike | null)?.context;
  if (!response) return error instanceof Error ? error.message : 'تعذر الاتصال بخدمة RAID VPN.';
  try {
    const payload = await response.clone().json() as VpnFunctionPayload;
    if (payload.error === 'UNAUTHORIZED') return 'انتهت جلسة الحساب. سجّل الدخول مجددًا.';
    if (payload.error === 'VPN_SERVICE_NOT_CONFIGURED') return 'خدمة RAID VPN غير مهيأة على الخادم.';
    if (payload.error === 'VPN_PROFILE_INVALID') return 'ملف VPN المرتبط بالحساب غير صالح.';
    return 'تعذر مزامنة إعداد VPN من الخادم.';
  } catch {
    return 'تعذر مزامنة إعداد VPN من الخادم.';
  }
}

export async function clearWireGuardConfig() {
  const userId = await currentUserId().catch(() => null);
  await clearConfigForUser(userId ?? undefined);
}

export async function syncVpnProfileFromAccount(): Promise<VpnProvisioningState> {
  const supabase = getSupabase();
  const session = await getValidSession();
  const user = session?.user;
  if (!session?.access_token || !user) {
    await clearConfigForUser();
    return { configured: false, source: 'none' };
  }

  const owner = await SecureStore.getItemAsync(OWNER_KEY);
  if (owner && owner !== user.id) await clearConfigForUser(owner);

  let { data, error } = await invokeVpnConfig(session.access_token);
  if (error && functionStatus(error) === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (!refreshError && token) ({ data, error } = await invokeVpnConfig(token));
  }

  if (error) throw new Error(await readFunctionError(error));
  const payload = data as VpnFunctionPayload | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.configured || !payload.configText) {
    await clearConfigForUser(user.id);
    return { configured: false, source: 'none' };
  }

  await cacheConfigForUser(user.id, payload.configText);
  return { configured: true, source: 'service' };
}

export async function getVpnProvisioningState(): Promise<VpnProvisioningState> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    await clearConfigForUser();
    return { configured: false, source: 'none' };
  }

  try {
    return await syncVpnProfileFromAccount();
  } catch {
    const cached = await loadConfigForUser(userId);
    return { configured: !!cached, source: cached ? 'cache' : 'none' };
  }
}

export async function connectVpn() {
  const userId = await currentUserId();
  if (!userId) throw new Error('سجّل الدخول أولًا لتشغيل RAID VPN.');

  try {
    await syncVpnProfileFromAccount();
  } catch (error) {
    const cached = await loadConfigForUser(userId);
    if (!cached) throw error;
  }

  const config = await loadConfigForUser(userId);
  if (!config) throw new Error('لا يوجد خادم RAID VPN مخصص لهذا الحساب حتى الآن.');
  return native().connect(validateConfig(config));
}

export async function disconnectVpn() {
  return native().disconnect();
}

export async function isVpnConnected() {
  return native().getStatus();
}
