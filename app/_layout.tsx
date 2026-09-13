import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockGate } from '@/components/AppLockGate';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppLockGate>
          <StatusBar style="light" backgroundColor="#070B14" />
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        </AppLockGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
