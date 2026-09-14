import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { createDownload, deleteDownloadRecord, getDownload, listDownloads, updateDownload } from './store';
import type { DownloadItem } from './types';

const active = new Map<number, FileSystem.DownloadResumable>();
const paused = new Map<number, FileSystem.DownloadPauseState>();
const progressStats = new Map<number, { at: number; written: number; speed: number; persistedAt: number }>();
const LEGACY_SYSTEM_PREFIX = 'android:';
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/json': '.json',
  'application/vnd.android.package-archive': '.apk',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'text/plain': '.txt',
};

function sanitizeFileName(value: string, fallback = `download-${Date.now()}.bin`) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim().replace(/^\.+/, '').slice(0, 120);
  return cleaned || fallback;
}

function safeFileName(url: string) {
  try {
    const raw = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'download.bin');
    return sanitizeFileName(raw);
  } catch {
    return `download-${Date.now()}.bin`;
  }
}

function headerValue(headers: Record<string, string> | undefined, name: string) {
  if (!headers) return null;
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function decodeDispositionFilename(value: string) {
  const utf8 = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.trim().replace(/^"|"$/g, '')); } catch {}
  }
  const quoted = value.match(/filename\s*=\s*"([^"]+)"/i)?.[1];
  if (quoted) return quoted;
  return value.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, '') || '';
}

function preferredFileName(current: string, headers?: Record<string, string>) {
  const disposition = headerValue(headers, 'content-disposition');
  const fromHeader = disposition ? sanitizeFileName(decodeDispositionFilename(disposition), '') : '';
  let candidate = fromHeader || current;
  const contentType = headerValue(headers, 'content-type')?.split(';')[0]?.trim().toLowerCase() || '';
  const extension = MIME_EXTENSIONS[contentType];
  if (extension && !/\.[a-z0-9]{1,8}$/i.test(candidate)) candidate = `${candidate}${extension}`;
  return sanitizeFileName(candidate, current);
}

async function ensureDirectory() {
  const root = `${FileSystem.documentDirectory}RAID-Downloads/`;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return root;
}

async function uniqueDestination(fileName: string) {
  const root = await ensureDirectory();
  let destination = `${root}${fileName}`;
  const exists = await FileSystem.getInfoAsync(destination);
  if (exists.exists) destination = `${root}${Date.now()}-${fileName}`;
  return destination;
}

function safeReferer(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function requestOptions(referer?: string | null) {
  const safe = safeReferer(referer);
  return safe ? { headers: { Referer: safe } } : {};
}

function downloadHttpError(status: number) {
  if (status === 401) return 'رفض الخادم التنزيل لأن الجلسة تحتاج تسجيل دخول صالحًا (HTTP 401).';
  if (status === 403) return 'رفض الخادم رابط التنزيل أو انتهت صلاحيته (HTTP 403). أعد فتح صفحة الملف وابدأ التنزيل من جديد.';
  if (status === 404) return 'ملف التنزيل لم يعد موجودًا على الخادم (HTTP 404).';
  if (status === 416) return 'تعذر استكمال الجزء السابق لأن الخادم رفض نطاق الاستئناف (HTTP 416). اضغط إعادة لبدء تنزيل جديد.';
  if (status >= 500) return `الخادم واجه مشكلة أثناء التنزيل (HTTP ${status}). حاول لاحقًا أو أعد المحاولة.`;
  return `الخادم أعاد استجابة غير ناجحة أثناء التنزيل (HTTP ${status}).`;
}

function isLegacySystemDownload(item: Pick<DownloadItem, 'resume_data'>) {
  return Boolean(item.resume_data?.startsWith(LEGACY_SYSTEM_PREFIX));
}

function progressHandler(id: number) {
  return async (progress: FileSystem.DownloadProgressData) => {
    const now = Date.now();
    const total = progress.totalBytesExpectedToWrite || 0;
    const written = progress.totalBytesWritten || 0;
    const previous = progressStats.get(id);
    const elapsed = previous ? Math.max(0.05, (now - previous.at) / 1000) : 0;
    const instant = previous && written >= previous.written ? (written - previous.written) / elapsed : 0;
    const smoothed = instant > 0 ? (previous?.speed ? previous.speed * 0.65 + instant * 0.35 : instant) : (previous?.speed || 0);
    const speed = smoothed;
    const eta = total > written && speed > 1 ? Math.ceil((total - written) / speed) : null;
    const shouldPersist = !previous || now - previous.persistedAt >= 500 || (total > 0 && written >= total);

    progressStats.set(id, {
      at: now,
      written,
      speed,
      persistedAt: shouldPersist ? now : (previous?.persistedAt || 0),
    });

    if (!shouldPersist) return;
    await updateDownload(id, {
      state: 'downloading',
      progress: total > 0 ? Math.min(1, written / total) : 0,
      total_bytes: total || null,
      written_bytes: written,
      speed_bps: speed,
      eta_seconds: eta,
      error: null,
    }).catch(() => {});
  };
}

async function runTask(id: number, task: FileSystem.DownloadResumable) {
  active.set(id, task);
  paused.delete(id);
  await updateDownload(id, { state: 'downloading', error: null });
  try {
    const result = await task.downloadAsync();
    active.delete(id);
    paused.delete(id);
    progressStats.delete(id);
    if (!result?.uri) throw new Error('لم يرجع Android ملفًا بعد اكتمال التنزيل.');

    if (typeof result.status === 'number' && (result.status < 200 || result.status >= 300)) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
      throw new Error(downloadHttpError(result.status));
    }

    const current = await getDownload(id);
    const responseHeaders = (result as { headers?: Record<string, string> }).headers;
    const resolvedName = preferredFileName(current?.file_name || safeFileName(current?.url || result.uri), responseHeaders);
    let finalUri = result.uri;
    if (current && resolvedName !== current.file_name) {
      const renamed = await uniqueDestination(resolvedName);
      if (renamed !== result.uri) {
        await FileSystem.moveAsync({ from: result.uri, to: renamed });
        finalUri = renamed;
      }
    }

    const fileInfo = await FileSystem.getInfoAsync(finalUri);
    if (!fileInfo.exists) throw new Error('اكتمل الطلب لكن ملف التنزيل غير موجود على الجهاز.');
    const finalSize = typeof fileInfo.size === 'number' && fileInfo.size > 0 ? fileInfo.size : null;

    await updateDownload(id, {
      state: 'completed',
      progress: 1,
      file_name: resolvedName,
      local_uri: finalUri,
      total_bytes: finalSize,
      written_bytes: finalSize || undefined,
      speed_bps: 0,
      eta_seconds: 0,
      resume_data: null,
      error: null,
    });
  } catch (error) {
    active.delete(id);
    progressStats.delete(id);
    if (paused.has(id)) return;
    await updateDownload(id, {
      state: 'failed',
      speed_bps: 0,
      eta_seconds: null,
      error: error instanceof Error ? error.message : 'فشل التنزيل.',
    });
  }
}

export async function startDownload(url: string, referer?: string | null) {
  if (!/^https:\/\//i.test(url)) throw new Error('RAID يسمح بالتنزيل الآمن عبر HTTPS فقط.');
  const fileName = safeFileName(url);
  const storedReferer = safeReferer(referer);
  const destination = await uniqueDestination(fileName);
  const id = await createDownload(url, fileName, destination, storedReferer);
  const task = FileSystem.createDownloadResumable(url, destination, requestOptions(storedReferer), progressHandler(id));
  void runTask(id, task);
  return id;
}

export async function pauseDownload(id: number) {
  const task = active.get(id);
  if (!task) throw new Error('هذا التنزيل غير نشط الآن.');
  const state = await task.pauseAsync();
  active.delete(id);
  paused.set(id, state);
  progressStats.delete(id);
  await updateDownload(id, {
    state: 'paused',
    speed_bps: 0,
    eta_seconds: null,
    resume_data: state.resumeData || null,
    error: null,
  });
}

export async function resumeDownload(id: number) {
  const memoryState = paused.get(id);
  const item = await getDownload(id);
  if (item && isLegacySystemDownload(item)) throw new Error('هذا تنزيل قديم من مدير Android. اضغط إعادة لنقله إلى مدير RAID الداخلي.');
  const resumeData = memoryState?.resumeData || item?.resume_data || undefined;
  if (!item?.local_uri || !resumeData) throw new Error('لا توجد جلسة تنزيل قابلة للاستكمال. أعد التنزيل إذا تم حذف بيانات الاستئناف.');
  const partial = await FileSystem.getInfoAsync(item.local_uri);
  if (!partial.exists) {
    paused.delete(id);
    await updateDownload(id, { state: 'failed', resume_data: null, speed_bps: 0, eta_seconds: null, error: 'ملف التنزيل الجزئي لم يعد موجودًا. اضغط إعادة لبدء التنزيل من جديد.' });
    throw new Error('ملف التنزيل الجزئي غير موجود على الجهاز. استخدم إعادة التنزيل.');
  }
  const task = new FileSystem.DownloadResumable(item.url, item.local_uri, requestOptions(item.referer), progressHandler(id), resumeData);
  void runTask(id, task);
}

export async function reconcileInterruptedDownloads() {
  const items = await listDownloads(200);
  let reconciled = 0;

  await Promise.all(items.map(async (item) => {
    if (isLegacySystemDownload(item)) {
      if (item.state !== 'cancelled') {
        reconciled += 1;
        await updateDownload(item.id, {
          state: 'failed',
          speed_bps: 0,
          eta_seconds: null,
          resume_data: null,
          error: 'هذا تنزيل من مدير Android القديم. اضغط إعادة ليبدأ من داخل RAID ويظهر تقدمه هنا بالكامل.',
        });
      }
      return;
    }

    if (item.state === 'downloading' && !active.has(item.id)) {
      reconciled += 1;
      const partialExists = item.local_uri ? (await FileSystem.getInfoAsync(item.local_uri).catch(() => ({ exists: false }))).exists : false;
      const resumable = Boolean(item.resume_data && partialExists);
      await updateDownload(item.id, {
        state: resumable ? 'paused' : 'failed',
        speed_bps: 0,
        eta_seconds: null,
        resume_data: resumable ? item.resume_data : null,
        error: resumable
          ? 'توقف التنزيل عند إغلاق التطبيق ويمكن استكماله.'
          : 'توقف التنزيل ولم تعد نقطة الاستئناف قابلة للاستخدام. اضغط إعادة لبدء تنزيل جديد.',
      });
      return;
    }

    if (item.state === 'paused' && item.local_uri) {
      const partial = await FileSystem.getInfoAsync(item.local_uri).catch(() => ({ exists: false }));
      if (!partial.exists) {
        reconciled += 1;
        paused.delete(item.id);
        await updateDownload(item.id, {
          state: 'failed',
          resume_data: null,
          speed_bps: 0,
          eta_seconds: null,
          error: 'ملف التنزيل الجزئي حُذف من الجهاز. اضغط إعادة لبدء تنزيل جديد.',
        });
      }
      return;
    }

    if (item.state === 'completed' && item.local_uri) {
      const info = await FileSystem.getInfoAsync(item.local_uri).catch(() => ({ exists: false }));
      if (!info.exists) {
        reconciled += 1;
        await updateDownload(item.id, {
          state: 'failed',
          progress: 0,
          speed_bps: 0,
          eta_seconds: null,
          error: 'الملف المكتمل لم يعد موجودًا على الجهاز. يمكنك إعادة تنزيله.',
        });
        return;
      }
      const actualSize = 'size' in info && typeof info.size === 'number' && info.size > 0 ? info.size : null;
      if (actualSize && (item.total_bytes !== actualSize || item.written_bytes !== actualSize)) {
        await updateDownload(item.id, { total_bytes: actualSize, written_bytes: actualSize, progress: 1 });
      }
    }
  }));

  return reconciled;
}

export async function cancelDownload(id: number) {
  const task = active.get(id);
  if (task) await task.pauseAsync().catch(() => {});
  active.delete(id);
  paused.delete(id);
  progressStats.delete(id);
  await updateDownload(id, { state: 'cancelled', speed_bps: 0, eta_seconds: null, resume_data: null });
}

export async function retryDownload(id: number) {
  const item = await getDownload(id);
  if (!item) throw new Error('التنزيل غير موجود.');
  if (!/^https:\/\//i.test(item.url)) throw new Error('RAID يسمح بالتنزيل الآمن عبر HTTPS فقط.');

  const running = active.get(id);
  if (running) await running.pauseAsync().catch(() => {});
  active.delete(id);
  paused.delete(id);
  progressStats.delete(id);

  let destination = item.local_uri;
  if (!destination || isLegacySystemDownload(item)) {
    destination = await uniqueDestination(item.file_name || safeFileName(item.url));
  } else {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
  }

  await updateDownload(id, {
    state: 'queued',
    progress: 0,
    total_bytes: null,
    written_bytes: 0,
    speed_bps: 0,
    eta_seconds: null,
    resume_data: null,
    local_uri: destination,
    error: null,
  });

  const task = FileSystem.createDownloadResumable(item.url, destination, requestOptions(item.referer), progressHandler(id));
  void runTask(id, task);
  return id;
}

export async function openDownload(id: number) {
  const item = await getDownload(id);
  if (!item?.local_uri || item.state !== 'completed') throw new Error('الملف غير جاهز للفتح.');
  const info = await FileSystem.getInfoAsync(item.local_uri);
  if (!info.exists) {
    await updateDownload(id, { state: 'failed', progress: 0, error: 'ملف التنزيل غير موجود على الجهاز. يمكنك إعادة تنزيله.' });
    throw new Error('ملف التنزيل لم يعد موجودًا على الجهاز.');
  }
  const uri = await FileSystem.getContentUriAsync(item.local_uri);
  const supported = await Linking.canOpenURL(uri);
  if (!supported) throw new Error('لا يوجد تطبيق مناسب لفتح هذا الملف.');
  await Linking.openURL(uri);
}

export async function shareDownload(id: number) {
  const item = await getDownload(id);
  if (!item?.local_uri || item.state !== 'completed') throw new Error('الملف غير جاهز للمشاركة.');
  const info = await FileSystem.getInfoAsync(item.local_uri);
  if (!info.exists) {
    await updateDownload(id, { state: 'failed', progress: 0, error: 'ملف التنزيل غير موجود على الجهاز. يمكنك إعادة تنزيله.' });
    throw new Error('ملف التنزيل غير موجود على الجهاز.');
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('المشاركة غير متاحة على هذا الجهاز.');
  await Sharing.shareAsync(item.local_uri, { dialogTitle: `مشاركة ${item.file_name}` });
}

export async function removeDownload(id: number, deleteFile = false) {
  const item = await getDownload(id);
  if (active.has(id)) await cancelDownload(id);
  paused.delete(id);
  progressStats.delete(id);
  if (deleteFile && item?.local_uri) await FileSystem.deleteAsync(item.local_uri, { idempotent: true }).catch(() => {});
  await deleteDownloadRecord(id);
}
