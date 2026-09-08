import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getSupabase } from '@/lib/auth';

const CONFIG_KEY = 'raid_wireguard_config_v2';

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

async function cacheConfig(configText: string) {
  const value = validateConfig(configText);
  await SecureStore.setItemAsync(CONFIG_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return value;
}

export async function saveWireGuardConfig(configText: string) {
  return cacheConfig(configText);
}

export async function loadWireGuardConfig() {
  return SecureStore.getItemAsync(CONFIG_KEY);
}

export async function clearWireGuardConfig() {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
}

export async function syncVpnProfileFromAccount(): Promise<VpnProvisioningState> {
  const supabase = getSupabase();
  if (!supabase) {
    const cached = await loadWireGuardConfig();
    return { configured: !!cached, source: cached ? 'cache' : 'none' };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) {
    const cached = await loadWireGuardConfig();
    return { configured: !!cached, source: cached ? 'cache' : 'none' };
  }

  const { data, error } = await supabase
    .from('raid_vpn_profiles')
    .select('config_text,enabled,updated_at')
    .eq('user_id', user.id)
    .maybeSingle<VpnProfileRow>();

  if (error) throw error;
  if (!data || !data.enabled) {
    await clearWireGuardConfig();
    return { configured: false, source: 'none' };
  }

  await cacheConfig(data.config_text);
  return { configured: true, source: 'account' };
}

export async function getVpnProvisioningState(): Promise<VpnProvisioningState> {
  try {
    return await syncVpnProfileFromAccount();
  } catch {
    const cached = await loadWireGuardConfig();
    return { configured: !!cached, source: cached ? 'cache' : 'none' };
  }
}

export async function connectVpn(configText?: string) {
  if (configText?.trim()) await cacheConfig(configText);
  try {
    await syncVpnProfileFromAccount();
  } catch {}
  const config = await loadWireGuardConfig();
  if (!config) throw new Error('لا يوجد ملف RAID VPN مرتبط بهذا الحساب.');
  return native().connect(validateConfig(config));
}

export async function disconnectVpn() {
  return native().disconnect();
}

export async function isVpnConnected() {
  return native().getStatus();
}
