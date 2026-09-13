import * as LocalAuthentication from 'expo-local-authentication';
import { getSetting, setSetting } from './db';

export type AppLockSettings = {
  enabled: boolean;
  lockOnBackground: boolean;
  graceSeconds: number;
};

export const DEFAULT_APP_LOCK_SETTINGS: AppLockSettings = {
  enabled: false,
  lockOnBackground: true,
  graceSeconds: 15,
};

const KEY = 'raid_app_lock_v1';
const ALLOWED_GRACE = [0, 15, 60, 300] as const;

export function sanitizeAppLockSettings(value: Partial<AppLockSettings> | null | undefined): AppLockSettings {
  const grace = ALLOWED_GRACE.includes(Number(value?.graceSeconds) as (typeof ALLOWED_GRACE)[number])
    ? Number(value?.graceSeconds)
    : DEFAULT_APP_LOCK_SETTINGS.graceSeconds;
  return {
    enabled: value?.enabled === true,
    lockOnBackground: value?.lockOnBackground !== false,
    graceSeconds: grace,
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

export async function getAppLockCapability() {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync().catch(() => false),
    LocalAuthentication.isEnrolledAsync().catch(() => false),
    LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
  ]);
  return { hardware, enrolled, types };
}

export async function authenticateAppLock(reason = 'افتح RAID Browser') {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'إلغاء',
    fallbackLabel: 'استخدم قفل الجهاز',
    disableDeviceFallback: false,
  });
  return result.success;
}

export function graceLabel(seconds: number) {
  if (seconds <= 0) return 'فورًا';
  if (seconds < 60) return `${seconds} ثانية`;
  if (seconds === 60) return 'دقيقة';
  return `${Math.round(seconds / 60)} دقائق`;
}
