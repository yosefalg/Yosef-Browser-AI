import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export type VaultEntry = {
  id: string;
  origin: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
};

const INDEX_KEY = 'raid.vault.index.v1';
const PREFIX = 'raid.vault.entry.';

async function ensureBiometric() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) throw new Error('Biometric authentication is not available on this device');
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'فتح مدير كلمات المرور',
    cancelLabel: 'إلغاء',
    disableDeviceFallback: false,
  });
  if (!result.success) throw new Error('Authentication cancelled');
}

async function getIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

async function setIndex(ids: string[]) {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export async function generateStrongPassword(length = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
  const bytes = await Crypto.getRandomBytesAsync(Math.max(16, length));
  return Array.from(bytes.slice(0, length), (b) => alphabet[b % alphabet.length]).join('');
}

export async function saveVaultEntry(input: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  await ensureBiometric();
  const now = Date.now();
  const id = input.id ?? `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const existingRaw = await SecureStore.getItemAsync(PREFIX + id);
  let createdAt = now;
  if (existingRaw) {
    try { createdAt = (JSON.parse(existingRaw) as VaultEntry).createdAt ?? now; } catch {}
  }
  const entry: VaultEntry = { id, origin: input.origin, username: input.username, password: input.password, createdAt, updatedAt: now };
  await SecureStore.setItemAsync(PREFIX + id, JSON.stringify(entry), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  const ids = await getIndex();
  if (!ids.includes(id)) await setIndex([...ids, id]);
  return entry;
}

export async function listVaultEntries() {
  await ensureBiometric();
  const ids = await getIndex();
  const entries = await Promise.all(ids.map(async (id) => {
    const raw = await SecureStore.getItemAsync(PREFIX + id);
    if (!raw) return null;
    try { return JSON.parse(raw) as VaultEntry; } catch { return null; }
  }));
  return entries.filter((x): x is VaultEntry => Boolean(x)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteVaultEntry(id: string) {
  await ensureBiometric();
  await SecureStore.deleteItemAsync(PREFIX + id);
  const ids = await getIndex();
  await setIndex(ids.filter((x) => x !== id));
}
