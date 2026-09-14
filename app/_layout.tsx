import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLockGate } from '@/components/AppLockGate';
import { DownloadShelf } from '@/components/DownloadShelf';
import { deriveBrowserPerformancePolicy, getPerformanceSettings, profileLabel, type BrowsingProfile } from '@/lib/performance';
import { isOnboardingComplete } from '@/lib/onboarding';

function profileHint(profile: BrowsingProfile) {
  switch (profile) {
    case 'boost': return { bg: 'rgba(34,197,94,.90)', fg: '#052E16', text: 'Boost', icon: 'flash-outline' as const };
    case 'video': return { bg: 'rgba(124,58,237,.92)', fg: '#F5F3FF', text: 'Video', icon: 'play-outline' as const };
    case 'reading': return { bg: 'rgba(14,116,144,.92)', fg: '#ECFEFF', text: 'Reading', icon: 'reader-outline' as const };
    case 'downloads': return { bg: 'rgba(180,83,9,.92)', fg: '#FFFBEB', text: 'Downloads', icon: 'download-outline' as const };
    case 'low-data': return { bg: 'rgba(2,132,199,.92)', fg: '#F0F9FF', text: 'Low Data', icon: 'leaf-outline' as const };
    default: return { bg: 'rgba(30,41,59,.90)', fg: '#E2E8F0', text: profileLabel(profile), icon: 'speedometer-outline' as const };
  }
}

function RootChrome() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ url?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [freezeInactiveScreens, setFreezeInactiveScreens] = useState(true);
  const [lightweightNavigation, setLightweightNavigation] = useState(false);
  const [activeProfile, setActiveProfile] = useState<BrowsingProfile>('balanced');
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
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

        // Performance off must be a true opt-out. In particular, do not keep
        // freezing inactive screens or forcing lightweight transitions after
        // the user disables RAID's performance controls.
        if (!settings.enabled) {
          setFreezeInactiveScreens(false);
          setLightweightNavigation(false);
          setActiveProfile('balanced');
          return;
        }

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
      const isActive = state === 'active';
      setAppActive(isActive);

      // Keep the user's current tab/background policy intact while RAID is in
      // the background. Re-read it when the app returns instead of silently
      // overriding suspend-background-tabs or navigation preferences.
      if (isActive) refreshPerformancePolicy();
    });
    return () => subscription.remove();
  }, [refreshPerformancePolicy]);

  const hint = profileHint(activeProfile);
  const showProfileHint = appActive && pathname === '/browser' && activeProfile !== 'balanced';
  const compactHint = width < 360;

  return (
    <>
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
                  top: insets.top + 60,
                  left: 12,
                  minHeight: 26,
                  maxWidth: compactHint ? 42 : 128,
                  paddingHorizontal: compactHint ? 8 : 10,
                  borderRadius: 999,
                  flexDirection: 'row',
                  gap: compactHint ? 0 : 5,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hint.bg,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,.16)',
                  elevation: 5,
                }}
              >
                <Ionicons name={hint.icon} size={12} color={hint.fg} />
                {!compactHint && <Text numberOfLines={1} style={{ color: hint.fg, fontSize: 9.5, fontWeight: '900' }}>{hint.text}</Text>}
              </View>
            )}
            {appActive && pathname === '/browser' && <DownloadShelf visible />}
          </View>
        </AppLockGate>
      </AppErrorBoundary>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootChrome />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
