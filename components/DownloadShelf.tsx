import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listDownloads, subscribeDownloads } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';

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

export function DownloadShelf({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<DownloadItem | null>(null);

  const refresh = useCallback(async () => {
    if (!visible) {
      setItem(null);
      return;
    }
    const items = await listDownloads(20).catch(() => [] as DownloadItem[]);
    setItem(chooseActive(items));
  }, [visible]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeDownloads(() => { void refresh(); });
    return unsubscribe;
  }, [refresh]);

  if (!visible || !item) return null;

  const progress = item.total_bytes && item.total_bytes > 0
    ? Math.max(0, Math.min(1, item.progress || 0))
    : null;
  const speed = item.state === 'downloading' ? bytes(item.speed_bps) : '';
  const remaining = item.state === 'downloading' ? eta(item.eta_seconds) : '';
  const status = item.state === 'paused'
    ? 'متوقف مؤقتًا'
    : item.state === 'queued'
      ? 'بانتظار البدء'
      : `${speed ? `${speed}/ث` : 'جاري التنزيل'}${remaining ? ` • ${remaining} متبقٍ` : ''}`;

  return (
    <Pressable
      onPress={() => router.push('/downloads')}
      accessibilityRole="button"
      accessibilityLabel={`تنزيل ${item.file_name}. ${status}`}
      style={[styles.shell, { bottom: insets.bottom + 72 }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={item.state === 'paused' ? 'pause' : 'arrow-down'} size={18} color="#F8FAFC" />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{item.file_name}</Text>
        <Text numberOfLines={1} style={styles.meta}>{status}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, progress === null ? styles.indeterminate : { width: `${Math.max(3, Math.round(progress * 100))}%` }]} />
        </View>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.percent}>{progress === null ? '•••' : `${Math.round(progress * 100)}%`}</Text>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
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
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B654E',
  },
  copy: { flex: 1, minWidth: 0 },
  name: { color: '#F8FAFC', fontSize: 12, fontWeight: '900' },
  meta: { color: '#CBD5E1', fontSize: 10, marginTop: 3 },
  track: { height: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: '#334155', marginTop: 7 },
  fill: { height: 3, borderRadius: 999, backgroundColor: '#D5AA88' },
  indeterminate: { width: '24%' },
  trailing: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2 },
  percent: { color: '#E2E8F0', fontSize: 10, fontWeight: '900' },
});
