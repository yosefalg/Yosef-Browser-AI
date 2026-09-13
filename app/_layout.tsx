import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLockGate } from '@/components/AppLockGate';
import { deriveBrowserPerformancePolicy, getPerformanceSettings } from '@/lib/performance';

export default function RootLayout() {
  const pathname = usePathname();
  const [freezeInactiveScreens, setFreezeInactiveScreens] = useState(false);

  const refreshPerformancePolicy = useCallback(() => {
    let cancelled = false;
    void getPerformanceSettings()
      .then((settings) => {
        if (cancelled) return;
        const policy = deriveBrowserPerformancePolicy(settings);
        setFreezeInactiveScreens(policy.suspendBackgroundTabs);
      })
      .catch(() => {
        if (!cancelled) setFreezeInactiveScreens(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => refreshPerformancePolicy(), [pathname, refreshPerformancePolicy]);

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
                animation: 'fade',
                freezeOnBlur: freezeInactiveScreens,
              }}
            />
          </AppLockGate>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
