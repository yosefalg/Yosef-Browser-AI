import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLockGate } from '@/components/AppLockGate';
import { deriveBrowserPerformancePolicy, getPerformanceSettings } from '@/lib/performance';
import { isOnboardingComplete } from '@/lib/onboarding';

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ url?: string | string[] }>();
  // Memory protection is a safe baseline: inactive screens are frozen from the
  // first frame instead of briefly running until settings finish loading.
  const [freezeInactiveScreens, setFreezeInactiveScreens] = useState(true);
  const [lightweightNavigation, setLightweightNavigation] = useState(false);
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
      })
      .catch(() => {
        if (!cancelled) {
          setFreezeInactiveScreens(true);
          setLightweightNavigation(false);
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
          </AppLockGate>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
