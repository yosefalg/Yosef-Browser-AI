import { getSetting, setSetting } from './db';

export type BrowsingProfile = 'balanced' | 'boost' | 'video' | 'reading' | 'downloads' | 'low-data';

export type PerformanceSettings = {
  enabled: boolean;
  profile: BrowsingProfile;
  adaptiveMode: boolean;
  suspendBackgroundTabs: boolean;
  prioritizeActiveTab: boolean;
  reduceBackgroundWork: boolean;
  lowBandwidthImages: boolean;
  aggressiveRetry: boolean;
};

export type BrowserPerformancePolicy = {
  profile: BrowsingProfile;
  activeTabPriority: boolean;
  suspendBackgroundTabs: boolean;
  reduceBackgroundWork: boolean;
  preferCache: boolean;
  deferNonCriticalWork: boolean;
  lowBandwidthImages: boolean;
  retryDelaysMs: readonly number[];
  visualDensity: 'full' | 'reduced' | 'minimal';
  mediaBias: 'normal' | 'video' | 'downloads';
};

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  enabled: false,
  profile: 'balanced',
  adaptiveMode: true,
  suspendBackgroundTabs: true,
  prioritizeActiveTab: true,
  reduceBackgroundWork: true,
  lowBandwidthImages: false,
  aggressiveRetry: true,
};

const KEY = 'raid_performance_settings_v1';

const VIDEO_HOSTS = [
  'youtube.com', 'youtu.be', 'twitch.tv', 'vimeo.com', 'dailymotion.com',
  'shahid.net', 'tiktok.com', 'kick.com', 'rumble.com', 'odysee.com',
  'watch.plex.tv', 'crunchyroll.com',
];
const READING_HOSTS = [
  'wikipedia.org', 'wikimedia.org', 'developer.mozilla.org', 'medium.com',
  'substack.com', 'arxiv.org', 'github.com', 'stackoverflow.com',
  'bbc.com', 'reuters.com', 'apnews.com', 'aljazeera.net', 'rudaw.net',
];
const DOWNLOAD_HOSTS = [
  'githubusercontent.com', 'sourceforge.net', 'fosshub.com', 'apkpure.com',
  'archive.org', 'cdn.discordapp.com',
];
const DOWNLOAD_EXT_RE = /\.(?:apk|aab|zip|rar|7z|pdf|docx?|xlsx?|pptx?|iso|tar|gz|tgz|deb|rpm|exe|msi)(?:$|[?#])/i;
const DOWNLOAD_PATH_RE = /(?:^|\/)(?:download|downloads|releases?|assets?|files?|attachments?|packages?|artifacts?)(?:\/|$)/i;
const VIDEO_PATH_RE = /(?:^|\/)(?:watch|video|videos|live|stream|player|shorts|reels?|episodes?|movies?)(?:\/|$)/i;
const READING_PATH_RE = /(?:^|\/)(?:article|articles|news|blog|docs|documentation|guide|guides|wiki|read|story|stories)(?:\/|$)/i;
const DOWNLOAD_QUERY_KEYS = ['download', 'attachment', 'filename', 'file', 'artifact'];
const VIDEO_QUERY_KEYS = ['video', 'stream', 'watch', 'play', 'episode'];

export function isBrowsingProfile(value: unknown): value is BrowsingProfile {
  return value === 'balanced' || value === 'boost' || value === 'video' || value === 'reading' || value === 'downloads' || value === 'low-data';
}

export function sanitizePerformanceSettings(value: Partial<PerformanceSettings> | null | undefined): PerformanceSettings {
  const profile = isBrowsingProfile(value?.profile) ? value.profile : 'balanced';
  return {
    enabled: value?.enabled === true,
    profile,
    adaptiveMode: value?.adaptiveMode !== false,
    suspendBackgroundTabs: value?.suspendBackgroundTabs !== false,
    prioritizeActiveTab: value?.prioritizeActiveTab !== false,
    reduceBackgroundWork: value?.reduceBackgroundWork !== false,
    lowBandwidthImages: value?.lowBandwidthImages === true || profile === 'low-data',
    aggressiveRetry: value?.aggressiveRetry !== false,
  };
}

export async function getPerformanceSettings() {
  const value = await getSetting<PerformanceSettings>(KEY, DEFAULT_PERFORMANCE_SETTINGS);
  return sanitizePerformanceSettings(value);
}

export async function savePerformanceSettings(value: PerformanceSettings) {
  const safe = sanitizePerformanceSettings(value);
  await setSetting(KEY, safe);
  return safe;
}

function hostMatches(host: string, candidates: readonly string[]) {
  return candidates.some((item) => host === item || host.endsWith(`.${item}`));
}

function queryHasAny(params: URLSearchParams, keys: readonly string[]) {
  return keys.some((key) => params.has(key) || params.get('action')?.toLowerCase() === key || params.get('type')?.toLowerCase() === key);
}

export function inferBrowsingProfileForUrl(url: string): BrowsingProfile {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const query = parsed.searchParams;

    // Direct files and explicit download routes win over broad host classification.
    if (DOWNLOAD_EXT_RE.test(path) || DOWNLOAD_PATH_RE.test(parsed.pathname) || queryHasAny(query, DOWNLOAD_QUERY_KEYS)) return 'downloads';
    if (isGithubReleaseAsset(host, parsed.pathname) || hostMatches(host, DOWNLOAD_HOSTS)) return 'downloads';

    if (hostMatches(host, VIDEO_HOSTS) || VIDEO_PATH_RE.test(parsed.pathname) || queryHasAny(query, VIDEO_QUERY_KEYS)) return 'video';
    if (hostMatches(host, READING_HOSTS) || READING_PATH_RE.test(parsed.pathname)) return 'reading';
  } catch {}
  return 'balanced';
}

function isGithubReleaseAsset(host: string, pathname: string) {
  return (host === 'github.com' || host.endsWith('.github.com')) && /\/(?:releases\/download|archive\/refs)\//i.test(pathname);
}

export function resolveBrowsingProfile(url: string, settings: PerformanceSettings): BrowsingProfile {
  const value = sanitizePerformanceSettings(settings);
  if (!value.enabled) return 'balanced';
  if (value.profile !== 'balanced' || !value.adaptiveMode) return value.profile;
  return inferBrowsingProfileForUrl(url);
}

export function deriveBrowserPerformancePolicy(input: PerformanceSettings, contextUrl?: string): BrowserPerformancePolicy {
  const value = sanitizePerformanceSettings(input);
  if (!value.enabled) {
    return {
      profile: 'balanced',
      activeTabPriority: false,
      suspendBackgroundTabs: false,
      reduceBackgroundWork: false,
      preferCache: true,
      deferNonCriticalWork: false,
      lowBandwidthImages: false,
      retryDelaysMs: [1200],
      visualDensity: 'full',
      mediaBias: 'normal',
    };
  }

  const profile = contextUrl ? resolveBrowsingProfile(contextUrl, value) : value.profile;
  // Backoff is intentionally bounded: retry quickly for brief mobile-network stalls,
  // then slow down to avoid hammering a weak or congested connection.
  const retryDelaysMs = value.aggressiveRetry ? [500, 1400, 3600] as const : [1600] as const;
  switch (profile) {
    case 'boost':
      return { profile:'boost', activeTabPriority:value.prioritizeActiveTab, suspendBackgroundTabs:value.suspendBackgroundTabs, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'reduced', mediaBias:'normal' };
    case 'video':
      return { profile:'video', activeTabPriority:true, suspendBackgroundTabs:value.suspendBackgroundTabs, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:false, retryDelaysMs, visualDensity:'reduced', mediaBias:'video' };
    case 'reading':
      return { profile:'reading', activeTabPriority:value.prioritizeActiveTab, suspendBackgroundTabs:value.suspendBackgroundTabs, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'minimal', mediaBias:'normal' };
    case 'downloads':
      return { profile:'downloads', activeTabPriority:false, suspendBackgroundTabs:true, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'minimal', mediaBias:'downloads' };
    case 'low-data':
      return { profile:'low-data', activeTabPriority:true, suspendBackgroundTabs:true, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:true, retryDelaysMs, visualDensity:'minimal', mediaBias:'normal' };
    default:
      return { profile:'balanced', activeTabPriority:value.prioritizeActiveTab, suspendBackgroundTabs:value.suspendBackgroundTabs, reduceBackgroundWork:value.reduceBackgroundWork, preferCache:true, deferNonCriticalWork:value.reduceBackgroundWork, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'full', mediaBias:'normal' };
  }
}

export function policySummary(policy: BrowserPerformancePolicy) {
  const parts: string[] = [];
  if (policy.activeTabPriority) parts.push('أولوية للصفحة الحالية');
  if (policy.suspendBackgroundTabs) parts.push('تعليق الخلفية');
  if (policy.reduceBackgroundWork) parts.push('مهام خلفية أقل');
  if (policy.lowBandwidthImages) parts.push('صور أخف');
  if (policy.mediaBias === 'video') parts.push('مهيأ للفيديو');
  if (policy.mediaBias === 'downloads') parts.push('مهيأ للتنزيل');
  return parts.length ? parts.join(' • ') : 'وضع متوازن';
}

export function profileLabel(profile: BrowsingProfile) {
  switch (profile) {
    case 'boost': return 'Boost';
    case 'video': return 'Video';
    case 'reading': return 'Reading';
    case 'downloads': return 'Downloads';
    case 'low-data': return 'Low Data';
    default: return 'Balanced';
  }
}

export function profileDescription(profile: BrowsingProfile) {
  switch (profile) {
    case 'boost': return 'يركّز موارد RAID على الصفحة الحالية ويخفف الشغل الخلفي.';
    case 'video': return 'يقلل المؤثرات ويعطي أولوية للاستقرار أثناء الفيديو.';
    case 'reading': return 'واجهة هادئة وتحميل أخف للقراءة الطويلة.';
    case 'downloads': return 'يقلل نشاط التصفح الخلفي حتى تبقى التنزيلات مستقرة.';
    case 'low-data': return 'للشبكات المتذبذبة: يقلل الصور الثقيلة والعمل غير الضروري.';
    default: return 'توازن بين السرعة، البطارية، الذاكرة وجودة الصفحات.';
  }
}
