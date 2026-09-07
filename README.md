# RAID Browser / YOSEF Browser AI

Professional Android browser built with Expo SDK 54, React Native 0.81, Expo Router and react-native-webview.

## Included now
- Multi-tab browser core with safe URL normalization
- Private-session mode with non-persistent history
- Local SQLite persistence for history/bookmarks/tabs/settings
- SecureStore for secrets/session tokens
- Supabase-ready authentication layer
- AI Agent screen wired to a configurable backend endpoint (no client-side secret keys)
- Theme system with cinematic dark/light/AMOLED/cyber presets
- Privacy Center and storage cleanup controls
- Android biometric app-lock support
- GitHub Actions pipeline for arm64 APK builds

## Intentionally not faked
VPN, system-wide ad blocking, full Chrome-extension compatibility, and proxy interception require native Android code/provider infrastructure. The UI reports these capabilities as unavailable until a real native/provider implementation is configured.

## Local setup
```bash
pnpm install
pnpm typecheck
npx expo-doctor
npx expo start
```

## Optional environment
```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_AI_API_URL=
```

`EXPO_PUBLIC_AI_API_URL` must point to your own server/Edge Function. Keep Groq/OpenAI/provider API keys server-side.

## Build APK
Push to `main` or run the `Android APK` workflow manually. The workflow prebuilds Android and assembles a release APK, then uploads it as `RAID-BROWSER-APK`.
