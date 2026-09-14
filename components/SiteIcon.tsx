import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function faviconSources(url: string, host: string) {
  const sources: string[] = [];
  try {
    const parsed = new URL(url);
    if (/^https?:$/i.test(parsed.protocol) && parsed.hostname) {
      const origin = `${parsed.protocol}//${parsed.host}`;
      // Keep favicon discovery on the visited origin first. This avoids leaking paths,
      // queries, fragments, or full URLs to third-party icon providers.
      sources.push(`${origin}/favicon.ico`);
      sources.push(`${origin}/apple-touch-icon.png`);
      sources.push(`${origin}/favicon.png`);
    }
  } catch {}

  if (host) {
    // Last-resort provider receives the hostname only. A second third-party fallback
    // was intentionally removed to reduce duplicate network requests and browsing-metadata exposure.
    sources.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`);
  }

  return Array.from(new Set(sources));
}

export function SiteIcon({ url, size = 44, radius = 14 }: { url: string; size?: number; radius?: number }) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const host = useMemo(() => hostOf(url), [url]);
  const sources = useMemo(() => faviconSources(url, host), [url, host]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const letter = (host || '?').slice(0, 1).toUpperCase();

  useEffect(() => setSourceIndex(0), [url]);
  const source = sources[sourceIndex];
  const imageSize = Math.round(size * 0.64);
  const shell = dark
    ? { backgroundColor: '#182028', borderColor: 'rgba(255,255,255,.10)' }
    : { backgroundColor: '#F8F4EF', borderColor: 'rgba(74,66,59,.16)' };
  const letterColor = dark ? '#D9B493' : '#8C684F';

  return (
    <View style={[s.wrap, shell, { width: size, height: size, borderRadius: radius }]}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ width: imageSize, height: imageSize, borderRadius: Math.max(6, radius - 6) }}
          resizeMode="contain"
          fadeDuration={90}
          onError={() => setSourceIndex(index => index + 1)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[s.fallback, { color: letterColor, fontSize: Math.max(15, Math.round(size * 0.38)) }]}>{letter}</Text>
      )}
    </View>
  );
}

export function RaidServiceIcon({ kind, size = 44 }: { kind: 'ai' | 'vpn'; size?: number }) {
  const isAi = kind === 'ai';
  const iconSize = Math.max(20, Math.round(size * 0.45));
  return (
    <View style={[s.service, { width: size, height: size, borderRadius: Math.round(size * 0.31) }, isAi ? s.ai : s.vpn]}>
      <Ionicons name={isAi ? 'sparkles' : 'shield-checkmark'} size={iconSize} color={isAi ? '#C99C78' : '#72B88C'} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  fallback: { fontWeight: '900' },
  service: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ai: { backgroundColor: '#F5ECE4', borderColor: '#D7B89E' },
  vpn: { backgroundColor: '#E8F2EB', borderColor: '#BFD6C6' },
});
