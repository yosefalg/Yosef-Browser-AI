import { getSetting, setSetting } from './db';
import { getPerformanceSettings, type BrowsingProfile } from './performance';

export type SitePreferences = {
  desktopMode: boolean;
  thirdPartyCookies: boolean;
  autoplayMedia: boolean;
  adBlock: boolean;
};

export const DEFAULT_SITE_PREFERENCES: SitePreferences = {
  desktopMode: false,
  thirdPartyCookies: true,
  autoplayMedia: true,
  adBlock: true,
};

const STORE_KEY = 'browser_site_preferences_v1';
const MAX_SITES = 250;

type SitePreferenceRecord = SitePreferences & { updatedAt: number };
type SitePreferenceStore = Record<string, SitePreferenceRecord>;

export function sitePreferenceHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sanitize(value: Partial<SitePreferences> | null | undefined): SitePreferences {
  return {
    desktopMode: value?.desktopMode === true,
    thirdPartyCookies: value?.thirdPartyCookies !== false,
    autoplayMedia: value?.autoplayMedia !== false,
    adBlock: value?.adBlock !== false,
  };
}

function applyProfileDefaults(base: SitePreferences, profile: BrowsingProfile, enabled: boolean): SitePreferences {
  if (!enabled) return base;

  switch (profile) {
    case 'video':
      return { ...base, autoplayMedia: true };
    case 'reading':
      return { ...base, autoplayMedia: false, adBlock: true };
    case 'downloads':
      return { ...base, autoplayMedia: false, adBlock: true };
    case 'low-data':
      return { ...base, autoplayMedia: false, thirdPartyCookies: false, adBlock: true };
    case 'boost':
      return { ...base, autoplayMedia: false, adBlock: true };
    default:
      return base;
  }
}

async function readStore() {
  return getSetting<SitePreferenceStore>(STORE_KEY, {});
}

export async function getSitePreferences(url: string): Promise<SitePreferences> {
  const host = sitePreferenceHost(url);
  if (!host) return { ...DEFAULT_SITE_PREFERENCES };
  const store = await readStore();
  const saved = store[host];
  if (saved) return sanitize(saved);

  const base = { ...DEFAULT_SITE_PREFERENCES };
  const performance = await getPerformanceSettings().catch(() => null);
  if (!performance) return base;
  return applyProfileDefaults(base, performance.profile, performance.enabled);
}

export async function saveSitePreferences(url: string, value: SitePreferences) {
  const host = sitePreferenceHost(url);
  if (!host) return;
  const store = await readStore();
  store[host] = { ...sanitize(value), updatedAt: Date.now() };
  const entries = Object.entries(store).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_SITES);
  await setSetting(STORE_KEY, Object.fromEntries(entries));
}

export async function resetSitePreferences(url: string) {
  const host = sitePreferenceHost(url);
  if (!host) return;
  const store = await readStore();
  if (!(host in store)) return;
  delete store[host];
  await setSetting(STORE_KEY, store);
}
