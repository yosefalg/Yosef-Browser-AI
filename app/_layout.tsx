import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
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
  const [freezeInactiveScreens, setFreezeInactiveScreens] = useState(false);
  const [lightweightNavigation, setLightweightNavigation] = useState(false);

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
