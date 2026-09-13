import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockGate } from '@/components/AppLockGate';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#070B14" />
        <AppLockGate>
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        </AppLockGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
