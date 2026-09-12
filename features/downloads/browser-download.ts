import { startDownload } from '@/features/downloads/download-manager';

const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;

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

/**
 * Routes WebView download events without hijacking inline video playback.
 * Ordinary files are handed to RAID Download Manager; direct media remains
 * in the in-app player, while insecure/non-web URLs are rejected.
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

  const id = await startDownload(candidate);
  return { kind: 'download', url: candidate, id };
}
