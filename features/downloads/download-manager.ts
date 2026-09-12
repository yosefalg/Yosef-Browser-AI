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
    await updateDownload(id, {
      state: 'completed',
      progress: 1,
      local_uri: result.uri,
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
  const task = new FileSystem.DownloadResumable(item.url, item.local_uri, {}, progressHandler(id), resumeData);
  void runTask(id, task);
}

export async function reconcileInterruptedDownloads() {
  const items = await listDownloads(200);
  const interrupted = items.filter(item => item.state === 'downloading' && !active.has(item.id));
  await Promise.all(interrupted.map(item => updateDownload(item.id, {
    state: item.resume_data ? 'paused' : 'failed',
    speed_bps: 0,
    eta_seconds: null,
    error: item.resume_data
      ? 'توقف التنزيل عند إغلاق التطبيق ويمكن استكماله.'
      : 'توقف التنزيل قبل حفظ نقطة استئناف. اضغط إعادة لبدء تنزيل جديد.',
  })));
  return interrupted.length;
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
  return startDownload(item.url);
}

export async function openDownload(id: number) {
  const item = await getDownload(id);
  if (!item?.local_uri || item.state !== 'completed') throw new Error('الملف غير جاهز للفتح.');
  const uri = await FileSystem.getContentUriAsync(item.local_uri);
  const supported = await Linking.canOpenURL(uri);
  if (!supported) throw new Error('لا يوجد تطبيق مناسب لفتح هذا الملف.');
  await Linking.openURL(uri);
}

export async function shareDownload(id: number) {
  const item = await getDownload(id);
  if (!item?.local_uri || item.state !== 'completed') throw new Error('الملف غير جاهز للمشاركة.');
  const info = await FileSystem.getInfoAsync(item.local_uri);
  if (!info.exists) throw new Error('ملف التنزيل غير موجود على الجهاز.');
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
