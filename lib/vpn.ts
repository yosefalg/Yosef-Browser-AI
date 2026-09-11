import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getSupabase } from '@/lib/auth';

const LEGACY_CONFIG_KEY = 'raid_wireguard_config_v2';
const OWNER_KEY = 'raid_wireguard_owner_v3';
const configKeyFor = (userId: string) => `raid_wireguard_config_v3_${userId}`;
const localMarkerFor = (userId: string) => `raid_wireguard_local_v4_${userId}`;
const PROVISION_RETRY_DELAYS = [0, 700, 1500] as const;

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
type NativeVpnErrorLike = Error & { code?: string };

class VpnSyncError extends Error {
  readonly allowCachedFallback: boolean;

  constructor(message: string, allowCachedFallback: boolean) {
    super(message);
    this.name = 'VpnSyncError';
    this.allowCachedFallback = allowCachedFallback;
  }
}

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

function normalizeWireGuardConfig(configText: string) {
  return configText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
}

function validateConfig(configText: string) {
  const value = normalizeWireGuardConfig(configText);
  if (!value) throw new Error('ملف WireGuard فارغ.');
  if (value.length > 32_768) throw new Error('ملف WireGuard أكبر من الحد المسموح.');
  if (value.includes('\0')) throw new Error('ملف WireGuard يحتوي على بيانات غير صالحة.');
  if (/^\s*</.test(value) || /^\s*\{/.test(value)) throw new Error('إعداد WireGuard المستلم من الخدمة ليس نصًا صالحًا.');

  let section: 'interface' | 'peer' | null = null;
  const interfaceFields = new Map<string, string>();
  const peers: Array<Map<string, string>> = [];
  let currentPeer: Map<string, string> | null = null;

  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (/^\[Interface\]$/i.test(line)) {
      section = 'interface';
      currentPeer = null;
      continue;
    }
    if (/^\[Peer\]$/i.test(line)) {
      section = 'peer';
      currentPeer = new Map<string, string>();
      peers.push(currentPeer);
      continue;
    }
    const equalAt = line.indexOf('=');
    if (equalAt <= 0 || !section) continue;
    const key = line.slice(0, equalAt).trim().toLowerCase();
    const fieldValue = line.slice(equalAt + 1).trim();
    if (!fieldValue) continue;
    if (section === 'interface') interfaceFields.set(key, fieldValue);
    else currentPeer?.set(key, fieldValue);
  }

  const privateKey = interfaceFields.get('privatekey');
  const validPeer = peers.some((peer) =>
    Boolean(peer.get('publickey')?.trim()) &&
    Boolean(peer.get('endpoint')?.trim()) &&
    Boolean(peer.get('allowedips')?.trim())
  );

  if (!privateKey || !validPeer) throw new Error('إعداد WireGuard المرتبط بالحساب غير صالح أو غير مكتمل.');
  return value;
}

function nativeVpnError(error: unknown, fallback: string) {
  const vpnError = error as NativeVpnErrorLike | null;
  switch (vpnError?.code) {
    case 'VPN_PERMISSION_DENIED': return new Error('تم رفض إذن VPN من Android. اسمح بالاتصال ثم حاول مجددًا.');
    case 'VPN_NO_ACTIVITY': return new Error('تعذر فتح إذن VPN الآن. أعد فتح شاشة RAID VPN وحاول مجددًا.');
    case 'VPN_CONFIG_EMPTY': return new Error('إعداد WireGuard فارغ أو غير صالح.');
    case 'VPN_CONNECT_FAILED': return new Error('تعذر تشغيل نفق WireGuard. تحقق من إعداد VPN المحفوظ ثم حاول مجددًا.');
    case 'VPN_DISCONNECT_FAILED': return new Error('تعذر قطع اتصال RAID VPN بشكل صحيح.');
    case 'VPN_STATUS_FAILED': return new Error('تعذر قراءة حالة RAID VPN من Android.');
    default: return new Error(vpnError?.message || fallback);
  }
}

async function cacheConfigForUser(userId: string, configText: string, source: 'service' | 'local' = 'service') {
  const value = validateConfig(configText);
  await SecureStore.setItemAsync(configKeyFor(userId), value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync(OWNER_KEY, userId, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  if (source === 'local') {
    await SecureStore.setItemAsync(localMarkerFor(userId), '1', { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
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

async function getLocalProfile(userId: string): Promise<VpnProvisioningState | null> {
  const config = await loadConfigForUser(userId);
  if (!config) return null;
  if (!(await isLocalConfigForUser(userId))) return null;
  try {
    validateConfig(config);
    return { configured: true, source: 'local' };
  } catch {
    await SecureStore.deleteItemAsync(configKeyFor(userId)).catch(() => {});
    await SecureStore.deleteItemAsync(localMarkerFor(userId)).catch(() => {});
    return null;
  }
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
  return getSupabase().functions.invoke('raid-vpn-config', { body: {}, headers: { Authorization: `Bearer ${accessToken}` } });
}

function functionStatus(error: unknown) {
  return (error as FunctionErrorLike | null)?.context?.status;
}

async function mapFunctionError(error: unknown): Promise<VpnSyncError> {
  const response = (error as FunctionErrorLike | null)?.context;
  if (!response) {
    const message = error instanceof Error ? error.message : 'تعذر الاتصال بخدمة RAID VPN.';
    return new VpnSyncError(message, true);
  }
  try {
    const payload = await response.clone().json() as VpnFunctionPayload;
    if (payload.error === 'UNAUTHORIZED' || response.status === 401 || response.status === 403) return new VpnSyncError('انتهت جلسة الحساب. سجّل الدخول مجددًا.', false);
    if (payload.error === 'VPN_SERVICE_NOT_CONFIGURED') return new VpnSyncError('خدمة RAID VPN غير مهيأة على الخادم.', false);
    if (payload.error === 'VPN_PROFILE_INVALID') return new VpnSyncError('إعداد VPN المرتبط بالحساب غير صالح.', false);
    return new VpnSyncError('تعذر مزامنة إعداد VPN من الخادم.', response.status >= 500);
  } catch {
    return new VpnSyncError('تعذر مزامنة إعداد VPN من الخادم.', response.status >= 500);
  }
}

function canUseCachedServiceConfig(error: unknown) {
  return !(error instanceof VpnSyncError) || error.allowCachedFallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // Local WireGuard is authoritative on this device. Never wait for the RAID
  // provisioning service when the user already has a valid tunnel saved.
  const localProfile = await getLocalProfile(user.id);
  if (localProfile) return localProfile;

  let { data, error } = await invokeVpnConfig(session.access_token);
  if (error && functionStatus(error) === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (!refreshError && token) ({ data, error } = await invokeVpnConfig(token));
  }

  if (error) throw await mapFunctionError(error);
  const payload = data as VpnFunctionPayload | null;
  if (payload?.error) {
    if (payload.error === 'UNAUTHORIZED') throw new VpnSyncError('انتهت جلسة الحساب. سجّل الدخول مجددًا.', false);
    if (payload.error === 'VPN_SERVICE_NOT_CONFIGURED') throw new VpnSyncError('خدمة RAID VPN غير مهيأة على الخادم.', false);
    if (payload.error === 'VPN_PROFILE_INVALID') throw new VpnSyncError('إعداد VPN المرتبط بالحساب غير صالح.', false);
    throw new VpnSyncError('تعذر مزامنة إعداد VPN من الخادم.', false);
  }

  if (!payload?.configured || !payload.configText) {
    if (payload?.reason === 'NO_VPN_SERVER') throw new VpnSyncError('خادم RAID VPN غير مربوط بخدمة التزويد التلقائي بعد.', false);
    if (payload?.reason === 'PROVISIONING_UNAVAILABLE') throw new VpnSyncError('خدمة تجهيز RAID VPN غير متاحة مؤقتًا.', true);
    return { configured: false, source: 'none' };
  }

  await cacheConfigForUser(user.id, payload.configText, 'service');
  return { configured: true, source: 'service' };
}

async function prepareVpnProfileForConnect(userId: string) {
  const localProfile = await getLocalProfile(userId);
  if (localProfile) return localProfile;

  let lastError: unknown = null;
  for (let index = 0; index < PROVISION_RETRY_DELAYS.length; index += 1) {
    const delay = PROVISION_RETRY_DELAYS[index];
    if (delay > 0) await sleep(delay);
    try {
      const state = await syncVpnProfileFromAccount();
      if (state.configured) return state;
    } catch (error) {
      lastError = error;
      const cached = await loadConfigForUser(userId);
      if (cached) {
        const local = await isLocalConfigForUser(userId);
        if (local || canUseCachedServiceConfig(error)) return { configured: true, source: local ? 'local' : 'cache' } as VpnProvisioningState;
      }
      if (!(error instanceof VpnSyncError) || !error.allowCachedFallback) throw error;
    }
  }
  if (lastError) throw lastError;
  throw new Error('لم يتم تجهيز RAID VPN لهذا الحساب حتى الآن.');
}

export async function getVpnProvisioningState(): Promise<VpnProvisioningState> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    await clearConfigForUser();
    return { configured: false, source: 'none' };
  }

  const localProfile = await getLocalProfile(userId);
  if (localProfile) return localProfile;

  try {
    return await syncVpnProfileFromAccount();
  } catch (error) {
    const cached = await loadConfigForUser(userId);
    if (!cached) return { configured: false, source: 'none' };
    if (!canUseCachedServiceConfig(error)) {
      await clearConfigForUser(userId);
      throw error;
    }
    return { configured: true, source: 'cache' };
  }
}

export async function connectVpn() {
  const userId = await currentUserId();
  if (!userId) throw new Error('سجّل الدخول أولًا لتشغيل RAID VPN.');

  await prepareVpnProfileForConnect(userId);
  const config = await loadConfigForUser(userId);
  if (!config) throw new Error('لا يوجد إعداد VPN صالح محفوظ على هذا الجهاز حتى الآن.');
  try {
    return await native().connect(validateConfig(config));
  } catch (error) {
    throw nativeVpnError(error, 'تعذر تشغيل RAID VPN.');
  }
}

export async function disconnectVpn() {
  try {
    return await native().disconnect();
  } catch (error) {
    throw nativeVpnError(error, 'تعذر قطع اتصال RAID VPN بشكل صحيح.');
  }
}

export async function isVpnConnected() {
  try {
    return await native().getStatus();
  } catch (error) {
    throw nativeVpnError(error, 'تعذر قراءة حالة RAID VPN.');
  }
}
