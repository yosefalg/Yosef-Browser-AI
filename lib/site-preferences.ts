import { getSetting, setSetting } from './db';

export type SitePreferences = {
  desktopMode: boolean;
  thirdPartyCookies: boolean;
  autoplayMedia: boolean;
};

export const DEFAULT_SITE_PREFERENCES: SitePreferences = {
  desktopMode: false,
  thirdPartyCookies: true,
  autoplayMedia: true,
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
  };
}

async function readStore() {
  return getSetting<SitePreferenceStore>(STORE_KEY, {});
}

export async function getSitePreferences(url: string): Promise<SitePreferences> {
  const host = sitePreferenceHost(url);
  if (!host) return { ...DEFAULT_SITE_PREFERENCES };
  const store = await readStore();
  return sanitize(store[host]);
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
