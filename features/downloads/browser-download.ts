import { startDownload } from '@/features/downloads/download-manager';

const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const STREAM_MANIFEST_RE = /(?:\.m3u8(?:$|[?#])|[?&](?:format|type)=(?:hls|m3u8)(?:&|$))/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;
const recentDownloads = new Map<string, { id: number; at: number }>();
const inFlightDownloads = new Map<string, Promise<number>>();
const DEDUPE_WINDOW_MS = 8000;
const TRACKING_QUERY_RE = /^(?:utm_(?:source|medium|campaign|term|content|id)|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;

export type BrowserDownloadResult =
  | { kind: 'media'; url: string }
  | { kind: 'download'; url: string; id: number }
  | { kind: 'blocked'; reason: string };

function isDirectMediaUrl(value: string) {
  return /^https?:\/\//i.test(value) && DIRECT_MEDIA_RE.test(value);
}

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

/**
 * Mirrors the privacy shape of modern browser referrer policies without
 * inventing a fake source page. Same-origin downloads keep the real page URL
 * because some authenticated endpoints depend on it. Cross-origin downloads
 * receive only the source origin, preventing search terms, IDs and signed
 * query parameters from leaking to an unrelated download host/CDN.
 */
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

function canonicalDownloadUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

/**
 * Used only for duplicate detection. Tracking parameters are ignored because
 * WebView pages can append them differently to the same file on consecutive
 * callbacks. Authentication, expiry, signature and CDN parameters are kept.
 */
function downloadIdentity(value: string) {
  try {
    const parsed = new URL(canonicalDownloadUrl(value));
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_QUERY_RE.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return canonicalDownloadUrl(value);
  }
}

function recentDownload(url: string) {
  const key = downloadIdentity(url);
  const entry = recentDownloads.get(key);
  if (!entry) return null;

  if (Date.now() - entry.at > DEDUPE_WINDOW_MS) {
    recentDownloads.delete(key);
    return null;
  }

  return entry.id;
}

function rememberDownload(url: string, id: number) {
  const now = Date.now();
  for (const [key, entry] of recentDownloads) {
    if (now - entry.at > DEDUPE_WINDOW_MS) recentDownloads.delete(key);
  }
  recentDownloads.set(downloadIdentity(url), { id, at: now });
}

async function startDownloadOnce(url: string, pageUrl: string) {
  const requestUrl = canonicalDownloadUrl(url);
  const identity = downloadIdentity(requestUrl);
  const duplicateId = recentDownload(requestUrl);
  if (duplicateId) return duplicateId;

  // Some Android WebView builds can fire injected click capture and
  // onFileDownload almost simultaneously. Collapse those callbacks onto one
  // promise. The identity ignores only known tracking parameters; signed and
  // authenticated query parameters remain distinct and are never rewritten.
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

/**
 * Routes WebView download events without hijacking inline video playback.
 * Ordinary files are handed to RAID Download Manager; direct media remains
 * in the in-app player, while insecure/non-web URLs are rejected.
 * Duplicate WebView callbacks are collapsed so one user action creates one
 * RAID download even when the page mutates harmless tracking parameters.
 */
export async function routeBrowserDownload(downloadUrl: string, pageUrl: string): Promise<BrowserDownloadResult> {
  const candidate = canonicalDownloadUrl(downloadUrl);
  if (!candidate) return { kind: 'blocked', reason: 'لم يرجع الموقع رابط تنزيل صالحًا.' };

  if (/^blob:/i.test(candidate)) {
    return { kind: 'blocked', reason: 'هذا الموقع أنشأ ملفًا مؤقتًا داخل الصفحة. افتح رابط التنزيل المباشر من الموقع حتى يستطيع RAID حفظه ومتابعة تقدمه.' };
  }

  // Do not treat every HTTPS request on a streaming page as media. Some hosts
  // serve subtitles, archives or APK files from the same page; only explicit
  // media files/manifests should enter RAID Media Player.
  if (isDirectMediaUrl(candidate) || (isLikelyStreamPage(pageUrl) && isStreamManifest(candidate))) {
    return { kind: 'media', url: candidate };
  }

  if (!/^https:\/\//i.test(candidate)) {
    return { kind: 'blocked', reason: 'RAID يسمح بتنزيل الملفات عبر HTTPS فقط لحماية الجهاز.' };
  }

  const id = await startDownloadOnce(candidate, pageUrl);
  return { kind: 'download', url: candidate, id };
}
