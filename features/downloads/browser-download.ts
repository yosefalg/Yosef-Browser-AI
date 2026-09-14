import { startDownload } from '@/features/downloads/download-manager';

const STREAM_MANIFEST_RE = /(?:\.(?:m3u8|mpd)(?:$|[?#])|[?&](?:format|type)=(?:hls|m3u8|dash|mpd)(?:&|$))/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;
const recentDownloads = new Map<string, { id: number; at: number }>();
const inFlightDownloads = new Map<string, Promise<number>>();
const DEDUPE_WINDOW_MS = 20_000;
const MAX_RECENT_DOWNLOADS = 64;
const TRACKING_QUERY_RE = /^(?:utm_(?:source|medium|campaign|term|content|id)|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;

export type BrowserDownloadResult =
  | { kind: 'media'; url: string }
  | { kind: 'download'; url: string; id: number }
  | { kind: 'blocked'; reason: string };

function isStreamManifest(value: string) {
  return /^https?:\/\//i.test(value) && STREAM_MANIFEST_RE.test(value);
}

function isLikelyStreamPage(value: string) {
  try {
    const parsed = new URL(value);
    return /^https?:$/i.test(parsed.protocol) && STREAM_PAGE_RE.test(parsed.pathname + parsed.search + parsed.hash);
  } catch {
    return false;
  }
}

function safePageReferer(value: string, targetUrl: string) {
  try {
    const page = new URL(value);
    const target = new URL(targetUrl);
    if (!/^https?:$/.test(page.protocol) || !/^https:$/.test(target.protocol)) return null;

    page.username = '';
    page.password = '';
    page.hash = '';

    if (page.origin === target.origin) return page.toString();
    return `${page.origin}/`;
  } catch {
    return null;
  }
}

function normalizeKnownDownloadUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Dropbox share pages commonly expose the real file when dl=1. This rewrite
    // runs only after the browser has already classified the navigation as a
    // download, so normal browsing links are not affected.
    if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
      parsed.searchParams.set('dl', '1');
      parsed.searchParams.delete('raw');
    }

    // Google Drive direct-download endpoints sometimes arrive with export=view
    // even though the user pressed Download. Keep the same endpoint and ID while
    // making the requested operation explicit; authenticated cookies remain in use.
    if ((host === 'drive.google.com' || host === 'drive.usercontent.google.com') && parsed.searchParams.has('id')) {
      const exportMode = parsed.searchParams.get('export')?.toLowerCase();
      if (!exportMode || exportMode === 'view') parsed.searchParams.set('export', 'download');
    }

    // OneDrive's classic download endpoint is most reliable when download=1 is
    // explicit. Only rewrite URLs that already carry a stable file identifier so
    // ordinary OneDrive browsing links are left untouched.
    if (host === 'onedrive.live.com' && (parsed.searchParams.has('resid') || parsed.searchParams.has('id'))) {
      parsed.searchParams.set('download', '1');
    }

    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function canonicalDownloadUrl(value: string) {
  try {
    const parsed = new URL(normalizeKnownDownloadUrl(value));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function downloadIdentity(value: string) {
  try {
    const parsed = new URL(canonicalDownloadUrl(value));
    const trackingKeys: string[] = [];
    parsed.searchParams.forEach((_value: string, key: string) => {
      if (TRACKING_QUERY_RE.test(key)) trackingKeys.push(key);
    });
    for (const key of trackingKeys) parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return canonicalDownloadUrl(value);
  }
}

function pruneRecentDownloads(now: number) {
  for (const [key, entry] of recentDownloads) {
    if (now - entry.at > DEDUPE_WINDOW_MS) recentDownloads.delete(key);
  }

  if (recentDownloads.size <= MAX_RECENT_DOWNLOADS) return;
  const oldest = [...recentDownloads.entries()]
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, recentDownloads.size - MAX_RECENT_DOWNLOADS);
  for (const [key] of oldest) recentDownloads.delete(key);
}

function recentDownload(url: string) {
  const now = Date.now();
  pruneRecentDownloads(now);

  const key = downloadIdentity(url);
  const entry = recentDownloads.get(key);
  if (!entry) return null;

  if (now - entry.at > DEDUPE_WINDOW_MS) {
    recentDownloads.delete(key);
    return null;
  }

  return entry.id;
}

function rememberDownload(url: string, id: number) {
  const now = Date.now();
  pruneRecentDownloads(now);
  recentDownloads.set(downloadIdentity(url), { id, at: now });
  pruneRecentDownloads(now);
}

async function startDownloadOnce(url: string, pageUrl: string) {
  const requestUrl = canonicalDownloadUrl(url);
  const identity = downloadIdentity(requestUrl);
  const duplicateId = recentDownload(requestUrl);
  if (duplicateId) return duplicateId;

  const existing = inFlightDownloads.get(identity);
  if (existing) return existing;

  const pending = startDownload(requestUrl, safePageReferer(pageUrl, requestUrl))
    .then((id) => {
      rememberDownload(requestUrl, id);
      return id;
    })
    .finally(() => {
      if (inFlightDownloads.get(identity) === pending) inFlightDownloads.delete(identity);
    });

  inFlightDownloads.set(identity, pending);
  return pending;
}

export async function routeBrowserDownload(downloadUrl: string, pageUrl: string): Promise<BrowserDownloadResult> {
  const raw = downloadUrl.trim();
  if (!raw) return { kind: 'blocked', reason: 'لم يرجع الموقع رابط تنزيل صالحًا.' };

  if (/^(?:blob|data):/i.test(raw)) {
    return { kind: 'blocked', reason: 'هذا الموقع أنشأ ملفًا مؤقتًا داخل الصفحة. افتح رابط التنزيل المباشر من الموقع حتى يستطيع RAID حفظه ومتابعة تقدمه.' };
  }

  const candidate = canonicalDownloadUrl(raw);

  // This function is entered only after WebView or RAID's capture layer has
  // identified an explicit download action. Direct MP4/WebM links must therefore
  // stay downloads instead of being redirected back into the media player. The
  // only media exception is an HLS/DASH manifest emitted by a known stream page.
  if (isLikelyStreamPage(pageUrl) && isStreamManifest(candidate)) {
    return { kind: 'media', url: candidate };
  }

  if (!/^https:\/\//i.test(candidate)) {
    return { kind: 'blocked', reason: 'RAID يسمح بتنزيل الملفات عبر HTTPS فقط لحماية الجهاز.' };
  }

  const id = await startDownloadOnce(candidate, pageUrl);
  return { kind: 'download', url: candidate, id };
}
