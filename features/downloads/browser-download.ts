import { startDownload } from '@/features/downloads/download-manager';

const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const STREAM_MANIFEST_RE = /(?:\.m3u8(?:$|[?#])|[?&](?:format|type)=(?:hls|m3u8)(?:&|$))/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;
const recentDownloads = new Map<string, { id: number; at: number }>();
const DEDUPE_WINDOW_MS = 5000;

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

function safePageReferer(value: string) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    // Keep the real page path/query for hosts that validate hotlink/download
    // referers, while never forwarding credentials or fragment data.
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function canonicalDownloadUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function recentDownload(url: string) {
  const key = canonicalDownloadUrl(url);
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
  recentDownloads.set(canonicalDownloadUrl(url), { id, at: now });
}

/**
 * Routes WebView download events without hijacking inline video playback.
 * Ordinary files are handed to RAID Download Manager; direct media remains
 * in the in-app player, while insecure/non-web URLs are rejected.
 * Duplicate WebView callbacks are collapsed so one tap creates one download.
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

  const duplicateId = recentDownload(candidate);
  if (duplicateId) return { kind: 'download', url: candidate, id: duplicateId };

  const id = await startDownload(candidate, safePageReferer(pageUrl));
  rememberDownload(candidate, id);
  return { kind: 'download', url: candidate, id };
}
