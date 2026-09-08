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

type VpnProfileRow = {
  config_text: string;
  enabled: boolean;
  updated_at: string;
};

export type VpnProvisioningState = {
  configured: boolean;
  source: 'account' | 'cache' | 'none';
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

async function currentUserId() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

export async function clearWireGuardConfig() {
  const userId = await currentUserId().catch(() => null);
  await clearConfigForUser(userId ?? undefined);
}

export async function syncVpnProfileFromAccount(): Promise<VpnProvisioningState> {
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) {
    await clearConfigForUser();
    return { configured: false, source: 'none' };
  }

  const owner = await SecureStore.getItemAsync(OWNER_KEY);
  if (owner && owner !== user.id) await clearConfigForUser(owner);

  const { data, error } = await supabase
    .from('raid_vpn_profiles')
    .select('config_text,enabled,updated_at')
    .eq('user_id', user.id)
    .maybeSingle<VpnProfileRow>();

  if (error) throw error;
  if (!data || !data.enabled) {
    await clearConfigForUser(user.id);
    return { configured: false, source: 'none' };
  }

  await cacheConfigForUser(user.id, data.config_text);
  return { configured: true, source: 'account' };
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
  } catch {
    const cached = await loadConfigForUser(userId);
    if (!cached) throw new Error('تعذر مزامنة إعداد VPN لهذا الحساب. تحقق من الاتصال وحاول مجددًا.');
  }

  const config = await loadConfigForUser(userId);
  if (!config) throw new Error('لا يوجد ملف RAID VPN مرتبط بهذا الحساب.');
  return native().connect(validateConfig(config));
}

export async function disconnectVpn() {
  return native().disconnect();
}

export async function isVpnConnected() {
  return native().getStatus();
}
