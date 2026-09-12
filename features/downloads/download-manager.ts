import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { createDownload, deleteDownloadRecord, getDownload, listDownloads, updateDownload } from './store';
import type { DownloadItem, DownloadState } from './types';

const active = new Map<number, FileSystem.DownloadResumable>();
const paused = new Map<number, FileSystem.DownloadPauseState>();
const progressStats = new Map<number, { at: number; written: number; speed: number; persistedAt: number }>();
const systemStats = new Map<number, { at: number; written: number; speed: number }>();
const SYSTEM_PREFIX = 'android:';
const RaidDownload = NativeModules.RaidDownload as undefined | {
  enqueue(url: string, fileName: string, referer: string | null): Promise<number>;
  query(id: number): Promise<{
    id: number;
    status: number;
    reason: number;
    totalBytes: number;
    downloadedBytes: number;
    localUri?: string | null;
    mediaType?: string | null;
    title?: string | null;
  } | null>;
  remove(id: number): Promise<boolean>;
  open(id: number): Promise<boolean>;
  share(id: number): Promise<boolean>;
  openDownloads(): Promise<boolean>;
};

let systemMonitor: ReturnType<typeof setTimeout> | null = null;

function safeFileName(url: string) {
  try {
    const raw = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'download.bin');
    const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim().slice(0, 120);
    return cleaned || `download-${Date.now()}.bin`;
  } catch {
    return `download-${Date.now()}.bin`;
  }
}

async function ensureDirectory() {
  const root = `${FileSystem.documentDirectory}RAID-Downloads/`;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return root;
}

function safeReferer(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return null;
  }
}

function requestOptions(referer?: string | null) {
  const safe = safeReferer(referer);
  return safe ? { headers: { Referer: safe } } : {};
}

function systemDownloadId(item: Pick<DownloadItem, 'resume_data'>) {
  const value = item.resume_data;
  if (!value?.startsWith(SYSTEM_PREFIX)) return null;
  const id = Number(value.slice(SYSTEM_PREFIX.length));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function androidSystemDownloadsAvailable() {
  return Platform.OS === 'android' && !!RaidDownload;
}

function mapSystemState(status: number): DownloadState {
  if (status === 1) return 'queued';
  if (status === 2) return 'downloading';
  if (status === 4) return 'paused';
  if (status === 8) return 'completed';
  if (status === 16) return 'failed';
  return 'queued';
}

async function syncSystemDownload(item: DownloadItem) {
  if (!RaidDownload) return false;
  const nativeId = systemDownloadId(item);
  if (!nativeId) return false;

  const status = await RaidDownload.query(nativeId).catch(() => null);
  if (!status) {
    if (item.state !== 'completed' && item.state !== 'cancelled') {
      await updateDownload(item.id, {
        state: 'failed',
        speed_bps: 0,
        eta_seconds: null,
        error: 'لم يعد تنزيل Android موجودًا. يمكنك إعادة التنزيل.',
      });
    }
    systemStats.delete(item.id);
    return false;
  }

  const now = Date.now();
  const written = Math.max(0, Number(status.downloadedBytes) || 0);
  const total = Math.max(0, Number(status.totalBytes) || 0);
  const previous = systemStats.get(item.id);
  const elapsed = previous ? Math.max(0.05, (now - previous.at) / 1000) : 0;
  const instant = previous && written >= previous.written ? (written - previous.written) / elapsed : 0;
  const speed = status.status === 2
    ? (instant > 0 ? (previous?.speed ? previous.speed * 0.65 + instant * 0.35 : instant) : (previous?.speed || 0))
    : 0;
  const state = mapSystemState(status.status);
  const eta = state === 'downloading' && total > written && speed > 1 ? Math.ceil((total - written) / speed) : null;
  const progress = total > 0 ? Math.min(1, written / total) : (state === 'completed' ? 1 : item.progress);
  const error = state === 'failed' ? `فشل تنزيل Android (السبب ${status.reason || 'غير معروف'}).` : null;

  systemStats.set(item.id, { at: now, written, speed });
  await updateDownload(item.id, {
    state,
    progress,
    total_bytes: total > 0 ? total : null,
    written_bytes: written,
    speed_bps: speed,
    eta_seconds: eta,
    local_uri: status.localUri || item.local_uri,
    error,
  });

  if (state === 'completed' || state === 'failed' || state === 'cancelled') systemStats.delete(item.id);
  return state === 'queued' || state === 'downloading' || state === 'paused';
}

async function syncSystemDownloads() {
  if (!androidSystemDownloadsAvailable()) return 0;
  const items = await listDownloads(200);
  const systemItems = items.filter(item => systemDownloadId(item));
  const results = await Promise.all(systemItems.map(item => syncSystemDownload(item).catch(() => false)));
  return results.filter(Boolean).length;
}

function scheduleSystemMonitor(delay = 250) {
  if (!androidSystemDownloadsAvailable()) return;
  if (systemMonitor) clearTimeout(systemMonitor);
  systemMonitor = setTimeout(async () => {
    systemMonitor = null;
    const activeCount = await syncSystemDownloads().catch(() => 0);
    scheduleSystemMonitor(activeCount > 0 ? 900 : 5000);
  }, delay);
}

function progressHandler(id: number) {
  return async (progress: FileSystem.DownloadProgressData) => {
    const now = Date.now();
    const total = progress.totalBytesExpectedToWrite || 0;
    const written = progress.totalBytesWritten || 0;
    const previous = progressStats.get(id);
    const elapsed = previous ? Math.max(0.05, (now - previous.at) / 1000) : 0;
    const instant = previous && written >= previous.written ? (written - previous.written) / elapsed : 0;
    const speed = instant > 0 ? (previous?.speed ? previous.speed * 0.65 + instant * 0.35 : instant) : (previous?.speed || 0);
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

    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    if (!fileInfo.exists) throw new Error('اكتمل الطلب لكن ملف التنزيل غير موجود على الجهاز.');
    const finalSize = typeof fileInfo.size === 'number' && fileInfo.size > 0 ? fileInfo.size : null;

    await updateDownload(id, {
      state: 'completed',
      progress: 1,
      local_uri: result.uri,
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

  if (androidSystemDownloadsAvailable() && RaidDownload) {
    const id = await createDownload(url, fileName, '', storedReferer);
    try {
      const nativeId = await RaidDownload.enqueue(url, fileName, storedReferer);
      await updateDownload(id, {
        state: 'downloading',
        resume_data: `${SYSTEM_PREFIX}${nativeId}`,
        error: null,
      });
      scheduleSystemMonitor(50);
      return id;
    } catch (error) {
      await updateDownload(id, {
        state: 'failed',
        error: error instanceof Error ? error.message : 'تعذر تسليم الملف إلى مدير تنزيل Android.',
      });
      throw error;
    }
  }

  const root = await ensureDirectory();
  let destination = `${root}${fileName}`;
  const exists = await FileSystem.getInfoAsync(destination);
  if (exists.exists) destination = `${root}${Date.now()}-${fileName}`;

  const id = await createDownload(url, fileName, destination, storedReferer);
  const task = FileSystem.createDownloadResumable(url, destination, requestOptions(storedReferer), progressHandler(id));
  void runTask(id, task);
  return id;
}

export async function pauseDownload(id: number) {
  const item = await getDownload(id);
  if (item && systemDownloadId(item) && RaidDownload) {
    await RaidDownload.openDownloads();
    return;
  }
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
  const item = await getDownload(id);
  if (item && systemDownloadId(item) && RaidDownload) {
    await RaidDownload.openDownloads();
    return;
  }
  const memoryState = paused.get(id);
  const resumeData = memoryState?.resumeData || item?.resume_data || undefined;
  if (!item?.local_uri || !resumeData) throw new Error('لا توجد جلسة تنزيل قابلة للاستكمال. أعد التنزيل إذا كان Android قد حذف بيانات الاستئناف.');
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
  await syncSystemDownloads().catch(() => 0);
  const items = await listDownloads(200);
  let reconciled = 0;

  await Promise.all(items.map(async (item) => {
    if (systemDownloadId(item)) return;

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

  scheduleSystemMonitor();
  return reconciled;
}

export async function cancelDownload(id: number) {
  const item = await getDownload(id);
  const nativeId = item ? systemDownloadId(item) : null;
  if (nativeId && RaidDownload) {
    await RaidDownload.remove(nativeId).catch(() => false);
    systemStats.delete(id);
    await updateDownload(id, { state: 'cancelled', speed_bps: 0, eta_seconds: null, error: null });
    return;
  }

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

  const nativeId = systemDownloadId(item);
  if (nativeId && RaidDownload) {
    await RaidDownload.remove(nativeId).catch(() => false);
    const nextNativeId = await RaidDownload.enqueue(item.url, item.file_name, safeReferer(item.referer));
    systemStats.delete(id);
    await updateDownload(id, {
      state: 'downloading',
      progress: 0,
      total_bytes: null,
      written_bytes: 0,
      speed_bps: 0,
      eta_seconds: null,
      resume_data: `${SYSTEM_PREFIX}${nextNativeId}`,
      local_uri: '',
      error: null,
    });
    scheduleSystemMonitor(50);
    return id;
  }

  if (!item.local_uri) throw new Error('مسار ملف التنزيل غير متاح. احذف العنصر وابدأ التنزيل من جديد.');
  const running = active.get(id);
  if (running) await running.pauseAsync().catch(() => {});
  active.delete(id);
  paused.delete(id);
  progressStats.delete(id);

  await FileSystem.deleteAsync(item.local_uri, { idempotent: true }).catch(() => {});
  await updateDownload(id, {
    state: 'queued',
    progress: 0,
    total_bytes: null,
    written_bytes: 0,
    speed_bps: 0,
    eta_seconds: null,
    resume_data: null,
    error: null,
  });

  const task = FileSystem.createDownloadResumable(item.url, item.local_uri, requestOptions(item.referer), progressHandler(id));
  void runTask(id, task);
  return id;
}

export async function openDownload(id: number) {
  const item = await getDownload(id);
  const nativeId = item ? systemDownloadId(item) : null;
  if (nativeId && RaidDownload) {
    if (item?.state !== 'completed') throw new Error('الملف غير جاهز للفتح.');
    await RaidDownload.open(nativeId);
    return;
  }

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
  const nativeId = item ? systemDownloadId(item) : null;
  if (nativeId && RaidDownload) {
    if (item?.state !== 'completed') throw new Error('الملف غير جاهز للمشاركة.');
    await RaidDownload.share(nativeId);
    return;
  }

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
  const nativeId = item ? systemDownloadId(item) : null;
  if (nativeId && RaidDownload) {
    await RaidDownload.remove(nativeId).catch(() => false);
    systemStats.delete(id);
    await deleteDownloadRecord(id);
    return;
  }

  if (active.has(id)) await cancelDownload(id);
  paused.delete(id);
  progressStats.delete(id);
  if (deleteFile && item?.local_uri) await FileSystem.deleteAsync(item.local_uri, { idempotent: true }).catch(() => {});
  await deleteDownloadRecord(id);
}

scheduleSystemMonitor(1200);
