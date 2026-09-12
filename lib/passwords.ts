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
const MAX_ORIGIN_LENGTH = 300;
const MAX_USERNAME_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 4096;
const SECURE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;
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

function normalizeOrigin(value: string) {
  const raw = value.trim();
  if (!raw) throw new Error('أدخل موقعًا صالحًا.');
  if (raw.length > MAX_ORIGIN_LENGTH) throw new Error('عنوان الموقع أطول من الحد المسموح.');
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error('invalid');
    return parsed.port ? `${parsed.hostname.toLowerCase()}:${parsed.port}` : parsed.hostname.toLowerCase();
  } catch {
    throw new Error('أدخل نطاق موقع صالحًا مثل example.com.');
  }
}

function normalizeUsername(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error('أدخل اسم المستخدم أو البريد.');
  if (normalized.length > MAX_USERNAME_LENGTH) throw new Error('اسم المستخدم أطول من الحد المسموح.');
  return normalized;
}

function validatePassword(value: string) {
  if (!value) throw new Error('أدخل كلمة المرور.');
  if (value.length > MAX_PASSWORD_LENGTH) throw new Error('كلمة المرور أطول من الحد المسموح.');
  return value;
}

async function createEntryId() {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((value): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(value))))
      : [];
  } catch {
    return [];
  }
}

async function setIndex(ids: string[]) {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))), SECURE_OPTIONS);
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
  const id = input.id ?? await createEntryId();
  const existingRaw = await SecureStore.getItemAsync(PREFIX + id);
  let createdAt = now;
  if (existingRaw) {
    try { createdAt = (JSON.parse(existingRaw) as VaultEntry).createdAt ?? now; } catch {}
  }
  const entry: VaultEntry = {
    id,
    origin: normalizeOrigin(input.origin),
    username: normalizeUsername(input.username),
    password: validatePassword(input.password),
    createdAt,
    updatedAt: now,
  };
  await SecureStore.setItemAsync(PREFIX + id, JSON.stringify(entry), SECURE_OPTIONS);
  const ids = await getIndex();
  if (!ids.includes(id)) await setIndex([...ids, id]);
  return entry;
}

export async function listVaultEntries() {
  await ensureBiometric();
  const ids = await getIndex();
  const validIds: string[] = [];
  const entries = await Promise.all(ids.map(async (id) => {
    const raw = await SecureStore.getItemAsync(PREFIX + id);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as VaultEntry;
      if (!parsed || parsed.id !== id || typeof parsed.origin !== 'string' || typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null;
      const entry: VaultEntry = {
        ...parsed,
        origin: normalizeOrigin(parsed.origin),
        username: normalizeUsername(parsed.username),
        password: validatePassword(parsed.password),
      };
      validIds.push(id);
      await SecureStore.setItemAsync(PREFIX + id, JSON.stringify(entry), SECURE_OPTIONS);
      return entry;
    } catch {
      return null;
    }
  }));
  if (validIds.length !== ids.length) await setIndex(validIds);
  else if (ids.length > 0) await setIndex(ids);
  return entries.filter((x): x is VaultEntry => Boolean(x)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteVaultEntry(id: string) {
  await ensureBiometric();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(id)) throw new Error('معرّف عنصر الخزنة غير صالح.');
  await SecureStore.deleteItemAsync(PREFIX + id);
  const ids = await getIndex();
  await setIndex(ids.filter((x) => x !== id));
}
