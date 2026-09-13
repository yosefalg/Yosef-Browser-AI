import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLockGate } from '@/components/AppLockGate';
import { deriveBrowserPerformancePolicy, getPerformanceSettings } from '@/lib/performance';
import { isOnboardingComplete } from '@/lib/onboarding';
import { listDownloads, subscribeDownloadChanges } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';

function formatSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(bytesPerSecond >= 10 * 1024 * 1024 ? 0 : 1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

function formatEta(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}ث`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes}د` : `${Math.floor(minutes / 60)}س ${minutes % 60}د`;
}

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ url?: string | string[] }>();
  const [freezeInactiveScreens, setFreezeInactiveScreens] = useState(false);
  const [lightweightNavigation, setLightweightNavigation] = useState(false);
  const [activeDownload, setActiveDownload] = useState<DownloadItem | null>(null);

  const browserContextUrl = useMemo(() => {
    if (pathname !== '/browser') return undefined;
    const value = Array.isArray(params.url) ? params.url[0] : params.url;
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined;
  }, [params.url, pathname]);

  const refreshPerformancePolicy = useCallback(() => {
    let cancelled = false;
    void getPerformanceSettings()
      .then((settings) => {
        if (cancelled) return;
        const policy = deriveBrowserPerformancePolicy(settings, browserContextUrl);
        setFreezeInactiveScreens(policy.suspendBackgroundTabs);
        setLightweightNavigation(policy.lightweightNavigation);
      })
      .catch(() => {
        if (!cancelled) {
          setFreezeInactiveScreens(false);
          setLightweightNavigation(false);
        }
      });
    return () => { cancelled = true; };
  }, [browserContextUrl]);

  const refreshDownloadShelf = useCallback(() => {
    if (pathname !== '/browser') {
      setActiveDownload(null);
      return;
    }
    void listDownloads(8)
      .then((items) => {
        const current = items.find((item) => item.state === 'downloading' || item.state === 'queued' || item.state === 'paused') || null;
        setActiveDownload(current);
      })
      .catch(() => setActiveDownload(null));
  }, [pathname]);

  useEffect(() => refreshPerformancePolicy(), [pathname, browserContextUrl, refreshPerformancePolicy]);

  useEffect(() => {
    let cancelled = false;
    void isOnboardingComplete()
      .then((complete) => {
        if (!cancelled && !complete && pathname !== '/onboarding') router.replace('/onboarding');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    refreshDownloadShelf();
    return subscribeDownloadChanges(refreshDownloadShelf);
  }, [refreshDownloadShelf]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshPerformancePolicy();
        refreshDownloadShelf();
      }
    });
    return () => subscription.remove();
  }, [refreshDownloadShelf, refreshPerformancePolicy]);

  const progress = activeDownload ? Math.max(0, Math.min(100, Math.round(activeDownload.progress * 100))) : 0;
  const downloadState = activeDownload?.state === 'paused' ? 'متوقف مؤقتًا' : activeDownload?.state === 'queued' ? 'جارٍ التجهيز' : 'جارٍ التنزيل';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#070B14" />
        <AppErrorBoundary>
          <AppLockGate>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: lightweightNavigation ? 'none' : 'fade',
                freezeOnBlur: freezeInactiveScreens,
              }}
            />
            {pathname === '/browser' && activeDownload ? (
              <Pressable
                onPress={() => router.push('/downloads')}
                style={styles.downloadShelf}
                accessibilityRole="button"
                accessibilityLabel={`تنزيل ${activeDownload.file_name}، ${progress} بالمئة`}
              >
                <View style={styles.downloadIcon}><Text style={styles.downloadArrow}>↓</Text></View>
                <View style={styles.downloadCopy}>
                  <View style={styles.downloadRow}>
                    <Text numberOfLines={1} style={styles.downloadName}>{activeDownload.file_name}</Text>
                    <Text style={styles.downloadPercent}>{progress}%</Text>
                  </View>
                  <View style={styles.downloadMetaRow}>
                    <Text style={styles.downloadMeta}>{downloadState}</Text>
                    {activeDownload.state === 'downloading' ? (
                      <Text style={styles.downloadMeta}>{formatSpeed(activeDownload.speed_bps)} • متبقي {formatEta(activeDownload.eta_seconds)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.downloadTrack}><View style={[styles.downloadProgress, { width: `${progress}%` }]} /></View>
                </View>
                <Text style={styles.downloadChevron}>‹</Text>
              </Pressable>
            ) : null}
          </AppLockGate>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  downloadShelf: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 70,
    minHeight: 62,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(20,24,22,0.96)',
    borderWidth: 1,
    borderColor: '#4A4F4A',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    zIndex: 200,
  },
  downloadIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B654E' },
  downloadArrow: { color: '#fff', fontSize: 22, fontWeight: '900' },
  downloadCopy: { flex: 1, minWidth: 0 },
  downloadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  downloadName: { flex: 1, color: '#FFF9F2', fontSize: 12, fontWeight: '900' },
  downloadPercent: { color: '#D5AA88', fontSize: 11, fontWeight: '900' },
  downloadMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  downloadMeta: { color: '#AEB7B0', fontSize: 9, fontWeight: '700' },
  downloadTrack: { height: 3, borderRadius: 3, overflow: 'hidden', backgroundColor: '#343936', marginTop: 7 },
  downloadProgress: { height: 3, borderRadius: 3, backgroundColor: '#D5AA88' },
  downloadChevron: { color: '#BFC7C1', fontSize: 24, fontWeight: '700', paddingHorizontal: 2 },
});
