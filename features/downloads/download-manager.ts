import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { createDownload, deleteDownloadRecord, getDownload, listDownloads, updateDownload } from './store';

const active = new Map<number, FileSystem.DownloadResumable>();
const paused = new Map<number, FileSystem.DownloadPauseState>();
const progressStats = new Map<number, { at: number; written: number; speed: number; persistedAt: number }>();

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

    const fileInfo = await FileSystem.getInfoAsync(result.uri, { size: true });
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

export async function startDownload(url: string) {
  if (!/^https:\/\//i.test(url)) throw new Error('RAID يسمح بالتنزيل الآمن عبر HTTPS فقط.');
  const root = await ensureDirectory();
  const fileName = safeFileName(url);
  let destination = `${root}${fileName}`;
  const exists = await FileSystem.getInfoAsync(destination);
  if (exists.exists) destination = `${root}${Date.now()}-${fileName}`;

  const id = await createDownload(url, fileName, destination);
  const task = FileSystem.createDownloadResumable(url, destination, {}, progressHandler(id));
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
  const resumeData = memoryState?.resumeData || item?.resume_data || undefined;
  if (!item?.local_uri || !resumeData) throw new Error('لا توجد جلسة تنزيل قابلة للاستكمال. أعد التنزيل إذا كان Android قد حذف بيانات الاستئناف.');
  const partial = await FileSystem.getInfoAsync(item.local_uri);
  if (!partial.exists) {
    paused.delete(id);
    await updateDownload(id, { state: 'failed', resume_data: null, speed_bps: 0, eta_seconds: null, error: 'ملف التنزيل الجزئي لم يعد موجودًا. اضغط إعادة لبدء التنزيل من جديد.' });
    throw new Error('ملف التنزيل الجزئي غير موجود على الجهاز. استخدم إعادة التنزيل.');
  }
  const task = new FileSystem.DownloadResumable(item.url, item.local_uri, {}, progressHandler(id), resumeData);
  void runTask(id, task);
}

export async function reconcileInterruptedDownloads() {
  const items = await listDownloads(200);
  let reconciled = 0;

  await Promise.all(items.map(async (item) => {
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
      const info = await FileSystem.getInfoAsync(item.local_uri, { size: true }).catch(() => ({ exists: false }));
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

  const task = FileSystem.createDownloadResumable(item.url, item.local_uri, {}, progressHandler(id));
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
