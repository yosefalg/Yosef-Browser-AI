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
const VAULT_SESSION_MS = 90_000;
let unlockedUntil = 0;
let pendingAuthentication: Promise<void> | null = null;

async function performAuthentication() {
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !enrolled) throw new Error('لا توجد مصادقة حيوية مهيأة على هذا الجهاز.');

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'فتح خزنة RAID',
    cancelLabel: 'إلغاء',
    disableDeviceFallback: false,
  });
  if (!result.success) throw new Error('تم إلغاء التحقق أو تعذر تأكيد الهوية.');
  unlockedUntil = Date.now() + VAULT_SESSION_MS;
}

async function ensureBiometric() {
  if (Date.now() < unlockedUntil) return;
  if (!pendingAuthentication) {
    pendingAuthentication = performAuthentication().finally(() => {
      pendingAuthentication = null;
    });
  }
  await pendingAuthentication;
}

export function lockVault() {
  unlockedUntil = 0;
}

export function isVaultUnlocked() {
  return Date.now() < unlockedUntil;
}

async function getIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
  } catch {
    return [];
  }
}

async function setIndex(ids: string[]) {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export async function generateStrongPassword(length = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
  const safeLength = Math.max(12, Math.min(128, Math.trunc(length)));
  const limit = 256 - (256 % alphabet.length);
  let output = '';

  while (output.length < safeLength) {
    const bytes = await Crypto.getRandomBytesAsync(Math.max(32, (safeLength - output.length) * 2));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      output += alphabet[byte % alphabet.length];
      if (output.length >= safeLength) break;
    }
  }
  return output;
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
  const entry: VaultEntry = {
    id,
    origin: input.origin.trim(),
    username: input.username.trim(),
    password: input.password,
    createdAt,
    updatedAt: now,
  };
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
