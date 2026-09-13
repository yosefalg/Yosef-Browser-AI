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

function recentDownload(url: string) {
  const entry = recentDownloads.get(url);
  if (!entry) return null;

  if (Date.now() - entry.at > DEDUPE_WINDOW_MS) {
    recentDownloads.delete(url);
    return null;
  }

  return entry.id;
}

/**
 * Routes WebView download events without hijacking inline video playback.
 * Ordinary files are handed to RAID Download Manager; direct media remains
 * in the in-app player, while insecure/non-web URLs are rejected.
 * Duplicate WebView callbacks are collapsed so one tap creates one download.
 */
export async function routeBrowserDownload(downloadUrl: string, pageUrl: string): Promise<BrowserDownloadResult> {
  const candidate = downloadUrl.trim();
  if (!candidate) return { kind: 'blocked', reason: 'لم يرجع الموقع رابط تنزيل صالحًا.' };

  if (isDirectMediaUrl(candidate) || (isLikelyStreamPage(pageUrl) && /^https?:\/\//i.test(candidate))) {
    return { kind: 'media', url: candidate };
  }

  if (!/^https:\/\//i.test(candidate)) {
    return { kind: 'blocked', reason: 'RAID يسمح بتنزيل الملفات عبر HTTPS فقط لحماية الجهاز.' };
  }

  const duplicateId = recentDownload(candidate);
  if (duplicateId) return { kind: 'download', url: candidate, id: duplicateId };

  const id = await startDownload(candidate, safePageReferer(pageUrl));
  recentDownloads.set(candidate, { id, at: Date.now() });
  return { kind: 'download', url: candidate, id };
}
