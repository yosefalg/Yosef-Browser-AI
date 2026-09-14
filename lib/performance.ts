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
  lightweightNavigation: boolean;
};

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  enabled: true,
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
  'shafaq.com', 'alsumaria.tv', 'ina.iq', '964media.com', 'nbanews.net',
  'uobaghdad.edu.iq', 'uokufa.edu.iq', 'uomustansiriyah.edu.iq',
  'uobabylon.edu.iq', 'uokerbala.edu.iq', 'uomisan.edu.iq', 'uowa.edu.iq',
  'mohesr.gov.iq', 'gov.iq',
];
const DOWNLOAD_HOSTS = [
  'githubusercontent.com', 'objects.githubusercontent.com', 'sourceforge.net', 'fosshub.com',
  'apkpure.com', 'archive.org', 'cdn.discordapp.com', 'download.microsoft.com',
  'dl.google.com', 'releases.ubuntu.com', 'drive.usercontent.google.com',
];
const LOW_DATA_FRIENDLY_HOSTS = [
  'lite.cnn.com', 'text.npr.org', 'mbasic.facebook.com',
];
const IRAQI_ROUTE_HOSTS = [
  'earthlink.iq', 'earthlinktele.com', 'iq.zain.com', 'asiacell.com', 'korek.com',
];
const DOWNLOAD_EXT_RE = /\.(?:apk|aab|zip|rar|7z|pdf|epub|mobi|azw3?|fb2|docx?|xlsx?|pptx?|iso|tar|gz|tgz|deb|rpm|exe|msi)(?:$|[?#])/i;
const VIDEO_EXT_RE = /\.(?:mp4|m4v|webm|m3u8|mpd|ts)(?:$|[?#])/i;
const DOWNLOAD_PATH_RE = /(?:^|\/)(?:download|downloads|releases?|assets?|files?|attachments?|packages?|artifacts?|dist|builds?|uploads?)(?:\/|$)/i;
const VIDEO_PATH_RE = /(?:^|\/)(?:watch|video|videos|live|stream|player|shorts|reels?|episodes?|movies?|clips?)(?:\/|$)/i;
const READING_PATH_RE = /(?:^|\/)(?:article|articles|news|blog|docs|documentation|guide|guides|wiki|read|story|stories|amp|post|posts)(?:\/|$)/i;
const DOWNLOAD_QUERY_KEYS = ['download', 'attachment', 'filename', 'file', 'artifact', 'asset', 'export'];
const VIDEO_QUERY_KEYS = ['video', 'stream', 'watch', 'play', 'episode', 'live'];
const LOW_DATA_QUERY_KEYS = ['lite', 'lowdata', 'low-data', 'basic', 'save-data'];

export function isBrowsingProfile(value: unknown): value is BrowsingProfile {
  return value === 'balanced' || value === 'boost' || value === 'video' || value === 'reading' || value === 'downloads' || value === 'low-data';
}

export function sanitizePerformanceSettings(value: Partial<PerformanceSettings> | null | undefined): PerformanceSettings {
  const profile = isBrowsingProfile(value?.profile) ? value.profile : 'balanced';
  return {
    enabled: value?.enabled !== false,
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

function looksLikeReadingVariant(parsed: URL) {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const output = parsed.searchParams.get('output')?.toLowerCase();
  const format = parsed.searchParams.get('format')?.toLowerCase();
  return host.startsWith('m.')
    || host.startsWith('mobile.')
    || path.startsWith('/amp/')
    || path.endsWith('/amp')
    || output === '1'
    || output === 'amp'
    || format === 'amp';
}

function looksLikeLowDataVariant(parsed: URL) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase();
  const mode = parsed.searchParams.get('mode')?.toLowerCase();
  const view = parsed.searchParams.get('view')?.toLowerCase();
  const saveData = parsed.searchParams.get('save-data')?.toLowerCase();
  return hostMatches(host, LOW_DATA_FRIENDLY_HOSTS)
    || path.startsWith('/lite/')
    || path.includes('/low-data/')
    || path.includes('/basic/')
    || queryHasAny(parsed.searchParams, LOW_DATA_QUERY_KEYS)
    || mode === 'lite'
    || mode === 'basic'
    || view === 'lite'
    || view === 'basic'
    || saveData === '1'
    || saveData === 'true';
}

export function inferBrowsingProfileForUrl(url: string): BrowsingProfile {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const query = parsed.searchParams;

    if (looksLikeLowDataVariant(parsed)) return 'low-data';
    if (VIDEO_EXT_RE.test(path)) return 'video';
    if (DOWNLOAD_EXT_RE.test(path) || DOWNLOAD_PATH_RE.test(parsed.pathname) || queryHasAny(query, DOWNLOAD_QUERY_KEYS)) return 'downloads';
    if (isGithubReleaseAsset(host, parsed.pathname) || hostMatches(host, DOWNLOAD_HOSTS)) return 'downloads';
    if (hostMatches(host, VIDEO_HOSTS) || VIDEO_PATH_RE.test(parsed.pathname) || queryHasAny(query, VIDEO_QUERY_KEYS)) return 'video';
    if (hostMatches(host, READING_HOSTS) || READING_PATH_RE.test(parsed.pathname) || looksLikeReadingVariant(parsed)) return 'reading';
    if (hostMatches(host, IRAQI_ROUTE_HOSTS)) return 'boost';
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

function retryScheduleForProfile(profile: BrowsingProfile, aggressiveRetry: boolean): readonly number[] {
  if (!aggressiveRetry) return [2800] as const;

  // Stagger retries for variable Iraqi/mobile last-mile routes. This changes RAID's
  // own request pressure only; it does not increase or modify ISP bandwidth.
  switch (profile) {
    case 'boost':
      return [700, 1900, 4600] as const;
    case 'video':
      return [1200, 3400, 8200] as const;
    case 'downloads':
      return [1500, 4300, 10400] as const;
    case 'low-data':
      return [2000, 5800, 14000] as const;
    case 'reading':
      return [900, 2700, 6600] as const;
    default:
      return [850, 2450, 6100] as const;
  }
}

export function deriveBrowserPerformancePolicy(input: PerformanceSettings, contextUrl?: string): BrowserPerformancePolicy {
  const value = sanitizePerformanceSettings(input);
  if (!value.enabled) {
    return {
      profile: 'balanced', activeTabPriority: false, suspendBackgroundTabs: true,
      reduceBackgroundWork: false, preferCache: true, deferNonCriticalWork: false,
      lowBandwidthImages: false, retryDelaysMs: [1800], visualDensity: 'full',
      mediaBias: 'normal', lightweightNavigation: false,
    };
  }

  const profile = contextUrl ? resolveBrowsingProfile(contextUrl, value) : value.profile;
  const retryDelaysMs = retryScheduleForProfile(profile, value.aggressiveRetry);

  switch (profile) {
    case 'boost': return { profile:'boost', activeTabPriority:value.prioritizeActiveTab, suspendBackgroundTabs:value.suspendBackgroundTabs, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'reduced', mediaBias:'normal', lightweightNavigation:true };
    case 'video': return { profile:'video', activeTabPriority:true, suspendBackgroundTabs:true, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:false, retryDelaysMs, visualDensity:'reduced', mediaBias:'video', lightweightNavigation:true };
    case 'reading': return { profile:'reading', activeTabPriority:value.prioritizeActiveTab, suspendBackgroundTabs:true, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'minimal', mediaBias:'normal', lightweightNavigation:true };
    case 'downloads': return { profile:'downloads', activeTabPriority:true, suspendBackgroundTabs:true, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'minimal', mediaBias:'downloads', lightweightNavigation:true };
    case 'low-data': return { profile:'low-data', activeTabPriority:true, suspendBackgroundTabs:true, reduceBackgroundWork:true, preferCache:true, deferNonCriticalWork:true, lowBandwidthImages:true, retryDelaysMs, visualDensity:'minimal', mediaBias:'normal', lightweightNavigation:true };
    default: return { profile:'balanced', activeTabPriority:value.prioritizeActiveTab, suspendBackgroundTabs:value.suspendBackgroundTabs, reduceBackgroundWork:value.reduceBackgroundWork, preferCache:true, deferNonCriticalWork:value.reduceBackgroundWork, lowBandwidthImages:value.lowBandwidthImages, retryDelaysMs, visualDensity:'full', mediaBias:'normal', lightweightNavigation:false };
  }
}

export function policySummary(policy: BrowserPerformancePolicy) {
  const parts: string[] = [];
  if (policy.activeTabPriority) parts.push('أولوية للصفحة الحالية');
  if (policy.suspendBackgroundTabs) parts.push('تعليق الخلفية');
  if (policy.reduceBackgroundWork) parts.push('مهام خلفية أقل');
  if (policy.lightweightNavigation) parts.push('تنقل أخف');
  if (policy.preferCache) parts.push('استفادة من الكاش');
  if (policy.retryDelaysMs.length > 1) parts.push('Retry متدرج');
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
    case 'boost': return 'يركّز موارد RAID على الصفحة الحالية ويخفف الشغل الخلفي، ومهيأ أكثر للمسارات العراقية المتذبذبة بدون ادعاء زيادة سرعة الاشتراك.';
    case 'video': return 'يثبت أولوية الصفحة الحالية ويخفف الخلفية مع Retry متدرج أهدأ حتى لا تنافس الطلبات تدفق الفيديو.';
    case 'reading': return 'واجهة هادئة وتحميل أخف للقراءة الطويلة مع تعليق الخلفية، ويشمل صفحات AMP والموبايل تلقائيًا.';
    case 'downloads': return 'يعطي أولوية للجلسة الحالية ويجمّد الخلفية ويباعد إعادة المحاولة حتى تبقى تنزيلات RAID أكثر استقرارًا.';
    case 'low-data': return 'للشبكات الضعيفة أو المتذبذبة: يخفف الصور والعمل غير الضروري ويستخدم Backoff أكثر تحفظًا لتقليل الطلبات المتكررة واستهلاك البيانات.';
    default: return 'الوضع الافتراضي السلس: يجمّد الشاشات غير النشطة ويوازن السرعة والذاكرة مع Retry متدرج للشبكات غير المستقرة.';
  }
}
