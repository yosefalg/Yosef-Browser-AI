import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { getSupabase } from '@/lib/auth';

const LEGACY_CONFIG_KEY = 'raid_wireguard_config_v2';
const OWNER_KEY = 'raid_wireguard_owner_v3';
const configKeyFor = (userId: string) => `raid_wireguard_config_v3_${userId}`;
const localMarkerFor = (userId: string) => `raid_wireguard_local_v4_${userId}`;

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
  source: 'service' | 'local' | 'cache' | 'none';
};

function native(): RaidVpnNative {
  if (Platform.OS !== 'android') throw new Error('RAID VPN متاح حاليًا على Android فقط.');
  const module = NativeModules.RaidVpn as RaidVpnNative | undefined;
  if (!module) throw new Error('وحدة RAID VPN غير موجودة في هذا الإصدار. أعد بناء APK.');
  return module;
}

function validateConfig(configText: string) {
  const value = configText.trim();
  const required = ['[Interface]', 'PrivateKey', '[Peer]', 'PublicKey', 'Endpoint', 'AllowedIPs'];
  if (!required.every((part) => value.includes(part))) {
    throw new Error('إعداد WireGuard غير صالح أو غير مكتمل.');
  }
  if (value.length > 32_768) throw new Error('ملف WireGuard أكبر من الحد المسموح.');
  return value;
}

async function cacheConfigForUser(userId: string, configText: string, source: 'service' | 'local' = 'service') {
  const value = validateConfig(configText);
  await SecureStore.setItemAsync(configKeyFor(userId), value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(OWNER_KEY, userId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (source === 'local') {
    await SecureStore.setItemAsync(localMarkerFor(userId), '1', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(localMarkerFor(userId)).catch(() => {});
  }
  await SecureStore.deleteItemAsync(LEGACY_CONFIG_KEY).catch(() => {});
  return value;
}

async function loadConfigForUser(userId: string) {
  const owner = await SecureStore.getItemAsync(OWNER_KEY);
  if (owner !== userId) return null;
  return SecureStore.getItemAsync(configKeyFor(userId));
}

async function isLocalConfigForUser(userId: string) {
  return (await SecureStore.getItemAsync(localMarkerFor(userId))) === '1';
}

async function clearConfigForUser(userId?: string) {
  const resolvedUserId = userId ?? await SecureStore.getItemAsync(OWNER_KEY);
  if (resolvedUserId) {
    await SecureStore.deleteItemAsync(configKeyFor(resolvedUserId)).catch(() => {});
    await SecureStore.deleteItemAsync(localMarkerFor(resolvedUserId)).catch(() => {});
  }
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

export async function importLocalWireGuardConfig(): Promise<VpnProvisioningState> {
  const userId = await currentUserId();
  if (!userId) throw new Error('سجّل الدخول أولًا لربط ملف VPN بحساب RAID.');
  if (Platform.OS !== 'android') throw new Error('استيراد WireGuard متاح حاليًا على Android فقط.');

  const picked = await File.pickFileAsync();
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) throw new Error('لم يتم اختيار ملف WireGuard.');
  if (typeof file.size === 'number' && file.size > 32_768) throw new Error('ملف WireGuard أكبر من الحد المسموح.');

  const configText = await file.text();
  await cacheConfigForUser(userId, configText, 'local');
  return { configured: true, source: 'local' };
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
    const cached = await loadConfigForUser(user.id);
    if (cached && await isLocalConfigForUser(user.id)) {
      return { configured: true, source: 'local' };
    }
    await clearConfigForUser(user.id);
    return { configured: false, source: 'none' };
  }

  await cacheConfigForUser(user.id, payload.configText, 'service');
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
    if (!cached) return { configured: false, source: 'none' };
    const local = await isLocalConfigForUser(userId);
    return { configured: true, source: local ? 'local' : 'cache' };
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
  if (!config) throw new Error('لا يوجد إعداد WireGuard. استورد ملف VPN مجاني أو اربط خادم RAID VPN.');
  return native().connect(validateConfig(config));
}

export async function disconnectVpn() {
  return native().disconnect();
}

export async function isVpnConnected() {
  return native().getStatus();
}
