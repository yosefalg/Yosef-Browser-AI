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

export async function getAppLockSettings() {
  const value = await getSetting<AppLockSettings>(KEY, DEFAULT_APP_LOCK_SETTINGS);
  return sanitizeAppLockSettings(value);
}

export async function saveAppLockSettings(value: AppLockSettings) {
  const safe = sanitizeAppLockSettings(value);
  await setSetting(KEY, safe);
  return safe;
}

export function appLockGraceLabel(ms: number) {
  if (ms <= 0) return 'مباشرة';
  if (ms < 60_000) return 'بعد 15 ثانية';
  if (ms < 300_000) return 'بعد دقيقة';
  return 'بعد 5 دقائق';
}
