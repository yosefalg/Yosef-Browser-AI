import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CONFIG_KEY = 'raid_wireguard_config_v1';

type RaidVpnNative = {
  connect(configText: string): Promise<boolean>;
  disconnect(): Promise<boolean>;
  getStatus(): Promise<boolean>;
};

function native(): RaidVpnNative {
  if (Platform.OS !== 'android') throw new Error('RAID VPN is currently available on Android only.');
  const module = NativeModules.RaidVpn as RaidVpnNative | undefined;
  if (!module) throw new Error('RAID VPN native module is not available in this build. Rebuild the APK.');
  return module;
}

export async function saveWireGuardConfig(configText: string) {
  const value = configText.trim();
  if (!value.includes('[Interface]') || !value.includes('[Peer]')) {
    throw new Error('ملف WireGuard غير صالح: يجب أن يحتوي [Interface] و [Peer].');
  }
  await SecureStore.setItemAsync(CONFIG_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadWireGuardConfig() {
  return SecureStore.getItemAsync(CONFIG_KEY);
}

export async function clearWireGuardConfig() {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
}

export async function connectVpn(configText?: string) {
  const config = (configText ?? await loadWireGuardConfig())?.trim();
  if (!config) throw new Error('لا يوجد إعداد WireGuard محفوظ.');
  return native().connect(config);
}

export async function disconnectVpn() {
  return native().disconnect();
}

export async function isVpnConnected() {
  return native().getStatus();
}
