import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLockGate } from '@/components/AppLockGate';
import { DownloadShelf } from '@/components/DownloadShelf';
import { deriveBrowserPerformancePolicy, getPerformanceSettings, profileLabel, type BrowsingProfile } from '@/lib/performance';
import { isOnboardingComplete } from '@/lib/onboarding';

function profileHint(profile: BrowsingProfile) {
  switch (profile) {
    case 'boost': return { bg: 'rgba(34,197,94,.90)', fg: '#052E16', text: 'Boost' };
    case 'video': return { bg: 'rgba(124,58,237,.92)', fg: '#F5F3FF', text: 'Video' };
    case 'reading': return { bg: 'rgba(14,116,144,.92)', fg: '#ECFEFF', text: 'Reading' };
    case 'downloads': return { bg: 'rgba(180,83,9,.92)', fg: '#FFFBEB', text: 'Downloads' };
    case 'low-data': return { bg: 'rgba(2,132,199,.92)', fg: '#F0F9FF', text: 'Low Data' };
    default: return { bg: 'rgba(30,41,59,.90)', fg: '#E2E8F0', text: profileLabel(profile) };
  }
}

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ url?: string | string[] }>();
  // Memory protection is a safe baseline: inactive screens are frozen from the
  // first frame instead of briefly running until settings finish loading.
  const [freezeInactiveScreens, setFreezeInactiveScreens] = useState(true);
  const [lightweightNavigation, setLightweightNavigation] = useState(false);
  const [activeProfile, setActiveProfile] = useState<BrowsingProfile>('balanced');
  const lastExternalUrl = useRef('');

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
        setActiveProfile(policy.profile);
      })
      .catch(() => {
        if (!cancelled) {
          setFreezeInactiveScreens(true);
          setLightweightNavigation(false);
          setActiveProfile('balanced');
        }
      });
    return () => { cancelled = true; };
  }, [browserContextUrl]);

  const openExternalWebUrl = useCallback((candidate?: string | null) => {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (!/^https?:\/\//i.test(value)) return;
    if (lastExternalUrl.current === value) return;
    lastExternalUrl.current = value;
    void isOnboardingComplete()
      .then((complete) => {
        if (!complete) {
          router.replace('/onboarding');
          return;
        }
        router.replace({ pathname: '/browser', params: { url: value } });
      })
      .catch(() => {
        router.replace({ pathname: '/browser', params: { url: value } });
      });
  }, []);

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
    let active = true;
    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (active) openExternalWebUrl(initialUrl);
      })
      .catch(() => {});
    const subscription = Linking.addEventListener('url', (event) => openExternalWebUrl(event.url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [openExternalWebUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPerformancePolicy();
    });
    return () => subscription.remove();
  }, [refreshPerformancePolicy]);

  const hint = profileHint(activeProfile);
  const showProfileHint = pathname === '/browser' && activeProfile !== 'balanced';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#070B14" />
        <AppErrorBoundary>
          <AppLockGate>
            <View style={{ flex: 1 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: lightweightNavigation ? 'none' : 'fade',
                  freezeOnBlur: freezeInactiveScreens,
                }}
              />
              {showProfileHint && (
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    position: 'absolute',
                    top: 66,
                    left: 12,
                    minHeight: 25,
                    maxWidth: 116,
                    paddingHorizontal: 9,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: hint.bg,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,.16)',
                    elevation: 5,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: hint.fg, fontSize: 9.5, fontWeight: '900' }}>{hint.text}</Text>
                </View>
              )}
              <DownloadShelf visible={pathname === '/browser'} />
            </View>
          </AppLockGate>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
