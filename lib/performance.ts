import { getSetting, setSetting } from './db';

export type BrowsingProfile = 'balanced' | 'boost' | 'video' | 'reading' | 'downloads' | 'low-data';

export type PerformanceSettings = {
  enabled: boolean;
  profile: BrowsingProfile;
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
  suspendBackgroundTabs: true,
  prioritizeActiveTab: true,
  reduceBackgroundWork: true,
  lowBandwidthImages: false,
  aggressiveRetry: true,
};

const KEY = 'raid_performance_settings_v1';

export function isBrowsingProfile(value: unknown): value is BrowsingProfile {
  return value === 'balanced' || value === 'boost' || value === 'video' || value === 'reading' || value === 'downloads' || value === 'low-data';
}

export function sanitizePerformanceSettings(value: Partial<PerformanceSettings> | null | undefined): PerformanceSettings {
  const profile = isBrowsingProfile(value?.profile) ? value.profile : 'balanced';
  return {
    enabled: value?.enabled === true,
    profile,
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

export function deriveBrowserPerformancePolicy(input: PerformanceSettings): BrowserPerformancePolicy {
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

  const retryDelaysMs = value.aggressiveRetry ? [450, 1200, 2800] as const : [1400] as const;
  switch (value.profile) {
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
