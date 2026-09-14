import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pauseDownload, resumeDownload } from '@/features/downloads/download-manager';
import { listDownloads, subscribeDownloads } from '@/features/downloads/store';
import type { DownloadItem, DownloadState } from '@/features/downloads/types';

function bytes(value: number | null) {
  if (!value || value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

function eta(value: number | null) {
  if (!value || value <= 0) return '';
  if (value < 60) return `${value}ث`;
  const minutes = Math.ceil(value / 60);
  if (minutes < 60) return `${minutes}د`;
  return `${Math.floor(minutes / 60)}س ${minutes % 60}د`;
}

function chooseActive(items: DownloadItem[]) {
  return items.find((item) => item.state === 'downloading')
    || items.find((item) => item.state === 'queued')
    || items.find((item) => item.state === 'paused')
    || null;
}

function isActive(item: DownloadItem) {
  return item.state === 'downloading' || item.state === 'queued' || item.state === 'paused';
}

function isTerminal(state: DownloadState) {
  return state === 'completed' || state === 'failed';
}

export function DownloadShelf({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const previousStates = useRef(new Map<number, DownloadState>());
  const terminalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [recentTerminal, setRecentTerminal] = useState<DownloadItem | null>(null);
  const [busy, setBusy] = useState(false);

  const showTerminal = useCallback((item: DownloadItem) => {
    if (terminalTimer.current) clearTimeout(terminalTimer.current);
    setRecentTerminal(item);
    terminalTimer.current = setTimeout(() => {
      terminalTimer.current = null;
      setRecentTerminal(null);
    }, 7000);
  }, []);

  const refresh = useCallback(async () => {
    if (!visible) {
      setItems([]);
      setRecentTerminal(null);
      previousStates.current.clear();
      if (terminalTimer.current) {
        clearTimeout(terminalTimer.current);
        terminalTimer.current = null;
      }
      return;
    }

    const nextItems = await listDownloads(20).catch(() => [] as DownloadItem[]);
    const transitioned = nextItems
      .filter((item) => {
        const previous = previousStates.current.get(item.id);
        return previous !== undefined && previous !== item.state && isTerminal(item.state);
      })
      .sort((a, b) => b.updated_at - a.updated_at)[0];

    previousStates.current = new Map(nextItems.map((item) => [item.id, item.state]));
    setItems(nextItems);
    if (transitioned) showTerminal(transitioned);
  }, [showTerminal, visible]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeDownloads(() => { void refresh(); });
    return () => {
      unsubscribe();
      if (terminalTimer.current) clearTimeout(terminalTimer.current);
    };
  }, [refresh]);

  const activeItems = useMemo(() => items.filter(isActive), [items]);
  const activeItem = useMemo(() => chooseActive(items), [items]);
  const item = activeItem || recentTerminal;
  const activeCount = activeItems.length;
  const aggregateSpeed = useMemo(
    () => activeItems.filter((value) => value.state === 'downloading').reduce((sum, value) => sum + (value.speed_bps || 0), 0),
    [activeItems],
  );
  const aggregateProgress = useMemo(() => {
    const measurable = activeItems.filter((value) => (value.total_bytes || 0) > 0);
    if (!measurable.length) return null;
    const total = measurable.reduce((sum, value) => sum + (value.total_bytes || 0), 0);
    if (total <= 0) return null;
    const written = measurable.reduce((sum, value) => sum + Math.min(value.written_bytes || 0, value.total_bytes || 0), 0);
    return Math.max(0, Math.min(1, written / total));
  }, [activeItems]);

  if (!visible || !item) return null;

  const terminalOnly = !activeItem && isTerminal(item.state);
  const itemProgress = item.state === 'completed'
    ? 1
    : item.total_bytes && item.total_bytes > 0
      ? Math.max(0, Math.min(1, item.progress || 0))
      : null;
  const displayProgress = activeCount > 1 ? aggregateProgress : itemProgress;
  const speed = item.state === 'downloading' ? bytes(item.speed_bps) : '';
  const remaining = item.state === 'downloading' ? eta(item.eta_seconds) : '';
  const itemStatus = item.state === 'completed'
    ? 'اكتمل التنزيل • اضغط لعرض الملف'
    : item.state === 'failed'
      ? `فشل التنزيل${item.error ? ' • اضغط للتفاصيل' : ''}`
      : item.state === 'paused'
        ? 'متوقف مؤقتًا'
        : item.state === 'queued'
          ? 'بانتظار البدء'
          : `${speed ? `${speed}/ث` : 'جاري التنزيل'}${remaining ? ` • ${remaining} متبقٍ` : ''}`;
  const status = activeCount > 1
    ? `${activeCount} تنزيلات نشطة${aggregateSpeed > 0 ? ` • ${bytes(aggregateSpeed)}/ث` : ''}`
    : itemStatus;

  const togglePause = async () => {
    if (busy || item.state === 'queued' || terminalOnly) return;
    setBusy(true);
    try {
      if (item.state === 'downloading') await pauseDownload(item.id);
      else if (item.state === 'paused') await resumeDownload(item.id);
      await refresh();
    } catch (error) {
      Alert.alert('RAID Downloads', error instanceof Error ? error.message : 'تعذر التحكم بالتنزيل.');
    } finally {
      setBusy(false);
    }
  };

  const canControl = !terminalOnly && (item.state === 'downloading' || item.state === 'paused');
  const percentText = terminalOnly
    ? item.state === 'completed' ? 'تم' : 'خطأ'
    : displayProgress === null ? '•••' : `${Math.round(displayProgress * 100)}%`;
  const iconName = item.state === 'completed'
    ? 'checkmark-circle'
    : item.state === 'failed'
      ? 'alert-circle'
      : item.state === 'paused'
        ? 'pause'
        : 'arrow-down';

  return (
    <Pressable
      onPress={() => router.push('/downloads')}
      accessibilityRole="button"
      accessibilityLabel={`${activeCount > 1 ? `${activeCount} تنزيلات نشطة` : `تنزيل ${item.file_name}`}. ${status}`}
      style={({ pressed }) => [styles.shell, terminalOnly && styles.terminalShell, compact && styles.shellCompact, { bottom: insets.bottom + 72 }, pressed && styles.pressed]}
    >
      {!compact && (
        <View style={[styles.iconWrap, item.state === 'completed' && styles.iconSuccess, item.state === 'failed' && styles.iconError]}>
          <Ionicons name={iconName} size={18} color="#F8FAFC" />
        </View>
      )}
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.name}>{item.file_name}</Text>
          {activeCount > 1 && <View style={styles.countBadge}><Text style={styles.countText}>{activeCount}</Text></View>}
        </View>
        <Text numberOfLines={1} style={styles.meta}>{status}</Text>
        {!terminalOnly && (
          <View style={styles.track}>
            <View style={[styles.fill, displayProgress === null ? styles.indeterminate : { width: `${Math.max(3, Math.round(displayProgress * 100))}%` }]} />
          </View>
        )}
      </View>
      {canControl && (
        <Pressable
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={item.state === 'paused' ? 'استكمال التنزيل' : 'إيقاف التنزيل مؤقتًا'}
          onPress={(event) => { event.stopPropagation(); void togglePause(); }}
          style={({ pressed }) => [styles.control, compact && styles.controlCompact, busy && styles.disabled, pressed && styles.controlPressed]}
        >
          <Ionicons name={item.state === 'paused' ? 'play' : 'pause'} size={16} color="#F8FAFC" />
        </Pressable>
      )}
      <View style={styles.trailing}>
        <Text style={[styles.percent, item.state === 'completed' && styles.percentSuccess, item.state === 'failed' && styles.percentError]}>{percentText}</Text>
        {!compact && <Ionicons name="chevron-forward" size={16} color="#94A3B8" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15,23,42,.96)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,.22)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  terminalShell: { minHeight: 58 },
  shellCompact: { left: 8, right: 8, minHeight: 60, paddingHorizontal: 9, gap: 7 },
  pressed: { opacity: 0.96 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B654E',
  },
  iconSuccess: { backgroundColor: '#256B55' },
  iconError: { backgroundColor: '#8A3F45' },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: '#F8FAFC', fontSize: 12, fontWeight: '900' },
  countBadge: { minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#263244' },
  countText: { color: '#D5AA88', fontSize: 9, fontWeight: '900' },
  meta: { color: '#CBD5E1', fontSize: 10, marginTop: 3 },
  track: { height: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: '#334155', marginTop: 7 },
  fill: { height: 3, borderRadius: 999, backgroundColor: '#D5AA88' },
  indeterminate: { width: '24%' },
  control: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#283548', borderWidth: 1, borderColor: 'rgba(148,163,184,.22)' },
  controlCompact: { width: 32, height: 32 },
  controlPressed: { transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.45 },
  trailing: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2, minWidth: 34 },
  percent: { color: '#E2E8F0', fontSize: 10, fontWeight: '900' },
  percentSuccess: { color: '#86EFAC' },
  percentError: { color: '#FDA4AF' },
});
