import { getSetting, setSetting } from './db';
import { getPerformanceSettings, resolveBrowsingProfile, type BrowsingProfile } from './performance';

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

// Authentication, checkout and payment flows are unusually sensitive to blocked
// third-party resources. RAID keeps protection enabled everywhere else, while
// these narrowly-scoped hosts default to compatibility mode. A user's explicit
// per-site preference still wins because saved preferences are returned first.
const COMPATIBILITY_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
  'paypal.com',
  'checkout.stripe.com',
] as const;

const COMPATIBILITY_PATH_RE = /(?:^|\/)(?:auth|authorize|authorization|login|log-in|signin|sign-in|sso|oauth|oauth2|callback|checkout|payment|payments|billing)(?:\/|$)/i;

type SitePreferenceRecord = SitePreferences & { updatedAt: number };
type SitePreferenceStore = Record<string, SitePreferenceRecord>;

export function sitePreferenceHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatches(host: string, candidate: string) {
  return host === candidate || host.endsWith(`.${candidate}`);
}

export function isCompatibilitySensitiveHost(value: string) {
  const host = sitePreferenceHost(value);
  return !!host && COMPATIBILITY_HOSTS.some((candidate) => hostMatches(host, candidate));
}

export function isCompatibilitySensitiveUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    return isCompatibilitySensitiveHost(value) || COMPATIBILITY_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
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
      // Video sites often rely on cross-site auth/CDN flows, so keep cookie compatibility.
      return { ...base, autoplayMedia: true, thirdPartyCookies: true, adBlock: true };
    case 'reading':
      return { ...base, autoplayMedia: false, thirdPartyCookies: false, adBlock: true };
    case 'downloads':
      // Release/download hosts commonly redirect through authenticated mirrors; avoid breaking them.
      return { ...base, autoplayMedia: false, thirdPartyCookies: true, adBlock: true };
    case 'low-data':
      return { ...base, autoplayMedia: false, thirdPartyCookies: false, adBlock: true };
    case 'boost':
      return { ...base, autoplayMedia: false, thirdPartyCookies: true, adBlock: true };
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

  // Compatibility mode is applied only to an unsaved site and only when the URL
  // clearly looks like an identity/payment flow. This keeps normal browsing strict
  // while preventing adaptive defaults from breaking common SSO and checkout paths.
  const compatibilitySensitive = isCompatibilitySensitiveUrl(url);
  const base = compatibilitySensitive
    ? { ...DEFAULT_SITE_PREFERENCES, thirdPartyCookies: true, adBlock: false }
    : { ...DEFAULT_SITE_PREFERENCES };
  const performance = await getPerformanceSettings().catch(() => null);
  if (!performance) return base;
  const effectiveProfile = resolveBrowsingProfile(url, performance);
  const profiled = applyProfileDefaults(base, effectiveProfile, performance.enabled);

  // Performance profiles must never silently re-enable blocking or disable cookies
  // in authentication/payment flows; explicit saved site preferences still win above.
  if (compatibilitySensitive) {
    return { ...profiled, thirdPartyCookies: true, adBlock: false };
  }
  return profiled;
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
