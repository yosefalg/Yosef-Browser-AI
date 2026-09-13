import * as SecureStore from 'expo-secure-store';
import { getSetting, setSetting } from './db';

export type AppLockSettings = {
  enabled: boolean;
  lockOnBackground: boolean;
  gracePeriodMs: number;
};

export const APP_LOCK_GRACE_OPTIONS = [0, 15_000, 60_000, 300_000] as const;
export const DEFAULT_APP_LOCK_SETTINGS: AppLockSettings = {
  enabled: false,
  lockOnBackground: true,
  gracePeriodMs: 15_000,
};

const KEY = 'raid_app_lock_v1';
const SECURE_KEY = 'raid_app_lock_secure_v2';

export function sanitizeAppLockSettings(value: Partial<AppLockSettings> | null | undefined): AppLockSettings {
  const gracePeriodMs = APP_LOCK_GRACE_OPTIONS.includes(value?.gracePeriodMs as (typeof APP_LOCK_GRACE_OPTIONS)[number])
    ? Number(value?.gracePeriodMs)
    : DEFAULT_APP_LOCK_SETTINGS.gracePeriodMs;
  return {
    enabled: value?.enabled === true,
    lockOnBackground: value?.lockOnBackground !== false,
    gracePeriodMs,
  };
}

function parseStored(raw: string | null) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AppLockSettings>;
    return sanitizeAppLockSettings(value);
  } catch {
    return null;
  }
}

export async function getAppLockSettings() {
  const secure = await SecureStore.getItemAsync(SECURE_KEY).catch(() => null);
  const secureSettings = parseStored(secure);
  if (secureSettings) return secureSettings;

  const legacy = await getSetting<AppLockSettings>(KEY, DEFAULT_APP_LOCK_SETTINGS).catch(() => DEFAULT_APP_LOCK_SETTINGS);
  const safe = sanitizeAppLockSettings(legacy);
  await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(safe)).catch(() => {});
  return safe;
}

export async function saveAppLockSettings(value: AppLockSettings) {
  const safe = sanitizeAppLockSettings(value);
  await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(safe));
  await setSetting(KEY, safe).catch(() => {});
  return safe;
}

export function appLockGraceLabel(ms: number) {
  if (ms <= 0) return 'مباشرة';
  if (ms < 60_000) return 'بعد 15 ثانية';
  if (ms < 300_000) return 'بعد دقيقة';
  return 'بعد 5 دقائق';
}
