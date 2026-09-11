import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { createDownload, deleteDownloadRecord, getDownload, setDownloadState, updateDownload } from './store';

const active = new Map<number, FileSystem.DownloadResumable>();
const paused = new Map<number, FileSystem.DownloadPauseState>();

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
    const total = progress.totalBytesExpectedToWrite || 0;
    const written = progress.totalBytesWritten || 0;
    await updateDownload(id, {
      state: 'downloading',
      progress: total > 0 ? Math.min(1, written / total) : 0,
      total_bytes: total || null,
      written_bytes: written,
      error: null,
    }).catch(() => {});
  };
}

async function runTask(id: number, task: FileSystem.DownloadResumable) {
  active.set(id, task);
  paused.delete(id);
  await setDownloadState(id, 'downloading');
  try {
    const result = await task.downloadAsync();
    active.delete(id);
    if (!result?.uri) throw new Error('لم يرجع Android ملفًا بعد اكتمال التنزيل.');
    await updateDownload(id, { state: 'completed', progress: 1, local_uri: result.uri, error: null });
  } catch (error) {
    active.delete(id);
    if (paused.has(id)) return;
    await updateDownload(id, { state: 'failed', error: error instanceof Error ? error.message : 'فشل التنزيل.' });
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
  await setDownloadState(id, 'queued');
}

export async function resumeDownload(id: number) {
  const state = paused.get(id);
  const item = await getDownload(id);
  if (!state || !item?.local_uri) throw new Error('لا توجد جلسة تنزيل قابلة للاستكمال.');
  const task = new FileSystem.DownloadResumable(item.url, item.local_uri, {}, progressHandler(id), state.resumeData);
  void runTask(id, task);
}

export async function cancelDownload(id: number) {
  const task = active.get(id);
  if (task) await task.pauseAsync().catch(() => {});
  active.delete(id);
  paused.delete(id);
  await setDownloadState(id, 'cancelled');
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

export async function removeDownload(id: number, deleteFile = false) {
  const item = await getDownload(id);
  if (active.has(id)) await cancelDownload(id);
  paused.delete(id);
  if (deleteFile && item?.local_uri) await FileSystem.deleteAsync(item.local_uri, { idempotent: true }).catch(() => {});
  await deleteDownloadRecord(id);
}
