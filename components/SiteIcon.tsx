import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function faviconSources(url: string, host: string) {
  return [
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
  ];
}

export function SiteIcon({ url, size = 44, radius = 14 }: { url: string; size?: number; radius?: number }) {
  const host = useMemo(() => hostOf(url), [url]);
  const sources = useMemo(() => faviconSources(url, host), [url, host]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const letter = (host || '?').slice(0, 1).toUpperCase();

  useEffect(() => setSourceIndex(0), [url]);
  const source = sources[sourceIndex];
  const imageSize = Math.round(size * 0.64);

  return (
    <View style={[s.wrap, { width: size, height: size, borderRadius: radius }]}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ width: imageSize, height: imageSize, borderRadius: Math.max(6, radius - 6) }}
          resizeMode="contain"
          onError={() => setSourceIndex(index => index + 1)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[s.fallback, { fontSize: Math.max(15, Math.round(size * 0.38)) }]}>{letter}</Text>
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
  wrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F4EF', borderWidth: 1, borderColor: 'rgba(74,66,59,.16)', overflow: 'hidden' },
  fallback: { color: '#8C684F', fontWeight: '900' },
  service: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ai: { backgroundColor: '#F5ECE4', borderColor: '#D7B89E' },
  vpn: { backgroundColor: '#E8F2EB', borderColor: '#BFD6C6' },
});
