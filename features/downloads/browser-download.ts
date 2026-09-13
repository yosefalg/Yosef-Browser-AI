import { startDownload } from '@/features/downloads/download-manager';

const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;
const recentDownloads = new Map<string, { id: number; at: number }>();
const DEDUPE_WINDOW_MS = 3000;

export type BrowserDownloadResult =
  | { kind: 'media'; url: string }
  | { kind: 'download'; url: string; id: number }
  | { kind: 'blocked'; reason: string };

function isDirectMediaUrl(value: string) {
  return /^https?:\/\//i.test(value) && DIRECT_MEDIA_RE.test(value);
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

function dedupeKey(value: string) {
  try {
    const parsed = new URL(value);
    // Fragments are never part of the HTTP request, so callbacks that differ
    // only by #fragment are still the same download.
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value;
  }
}

function recentDownload(url: string) {
  const key = dedupeKey(url);
  const entry = recentDownloads.get(key);
  if (!entry) return null;

  if (Date.now() - entry.at > DEDUPE_WINDOW_MS) {
    recentDownloads.delete(key);
    return null;
  }

  return entry.id;
}

function rememberDownload(url: string, id: number) {
  recentDownloads.set(dedupeKey(url), { id, at: Date.now() });
}

/**
 * Routes WebView download events without hijacking ordinary inline playback.
 *
 * Important distinction: `onFileDownload` is an explicit download signal from
 * Android/WebView. A direct MP4/WebM received through this callback must remain
 * a real download. The only media exception is a known stream page where the
 * same URL can be emitted as part of its playback hand-off.
 *
 * Ordinary files are handed to RAID Download Manager, insecure/non-web URLs
 * are rejected, and duplicate callbacks are collapsed so one tap creates one
 * download.
 */
export async function routeBrowserDownload(downloadUrl: string, pageUrl: string): Promise<BrowserDownloadResult> {
  const candidate = downloadUrl.trim();
  if (!candidate) return { kind: 'blocked', reason: 'لم يرجع الموقع رابط تنزيل صالحًا.' };

  if (!/^https:\/\//i.test(candidate)) {
    return { kind: 'blocked', reason: 'RAID يسمح بتنزيل الملفات عبر HTTPS فقط لحماية الجهاز.' };
  }

  // Stream pages can expose their current video URL through a download-like
  // callback. Keep that narrow case in the in-app player. Everywhere else an
  // explicit WebView download event means the user asked to save the file —
  // including MP4/WebM files.
  if (isLikelyStreamPage(pageUrl) && isDirectMediaUrl(candidate)) {
    return { kind: 'media', url: candidate };
  }

  const duplicateId = recentDownload(candidate);
  if (duplicateId) return { kind: 'download', url: candidate, id: duplicateId };

  const id = await startDownload(candidate, safePageReferer(pageUrl));
  rememberDownload(candidate, id);
  return { kind: 'download', url: candidate, id };
}
