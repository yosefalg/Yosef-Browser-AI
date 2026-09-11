import * as SecureStore from 'expo-secure-store';
import { getCurrentSession } from '@/lib/auth';

const OWNER_KEY = 'raid_wireguard_owner_v3';
const LEGACY_CONFIG_KEY = 'raid_wireguard_config_v2';
const configKeyFor = (userId: string) => `raid_wireguard_config_v3_${userId}`;
const localMarkerFor = (userId: string) => `raid_wireguard_local_v4_${userId}`;

function normalize(configText: string) {
  return configText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
}

function validate(configText: string) {
  const value = normalize(configText);
  if (!value) throw new Error('ألصق إعداد WireGuard أولًا.');
  if (value.length > 32768) throw new Error('ملف WireGuard أكبر من الحد المسموح.');
  if (value.includes('\0')) throw new Error('ملف WireGuard يحتوي بيانات غير صالحة.');
  const required = [
    /^\s*\[Interface\]/im,
    /^\s*PrivateKey\s*=\s*\S+/im,
    /^\s*\[Peer\]/im,
    /^\s*PublicKey\s*=\s*\S+/im,
    /^\s*Endpoint\s*=\s*\S+/im,
    /^\s*AllowedIPs\s*=\s*\S+/im,
  ];
  if (!required.every((pattern) => pattern.test(value))) {
    throw new Error('إعداد WireGuard غير مكتمل. تأكد أن الملف يحتوي Interface وPeer والمفاتيح وEndpoint وAllowedIPs.');
  }
  return value;
}

export async function saveLocalWireGuardConfig(configText: string) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('سجّل الدخول أولًا قبل ربط مزود VPN.');
  const value = validate(configText);
  const secure = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;
  await SecureStore.setItemAsync(configKeyFor(userId), value, secure);
  await SecureStore.setItemAsync(OWNER_KEY, userId, secure);
  await SecureStore.setItemAsync(localMarkerFor(userId), '1', secure);
  await SecureStore.deleteItemAsync(LEGACY_CONFIG_KEY).catch(() => {});
  return true;
}
