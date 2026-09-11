import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

export function SiteIcon({ url, size = 44, radius = 14 }: { url: string; size?: number; radius?: number }) {
  const [failed, setFailed] = useState(false);
  const host = useMemo(() => hostOf(url), [url]);
  const source = useMemo(() => ({ uri: `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128` }), [url]);
  const letter = (host || '?').slice(0, 1).toUpperCase();

  return (
    <View style={[s.wrap, { width: size, height: size, borderRadius: radius }]}>
      {!failed ? (
        <Image
          source={source}
          style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62), borderRadius: Math.max(6, radius - 5) }}
          resizeMode="contain"
          onError={() => setFailed(true)}
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
  return (
    <View style={[s.service, { width: size, height: size, borderRadius: Math.round(size * 0.31) }, isAi ? s.ai : s.vpn]}>
      <Text style={[s.serviceText, { fontSize: Math.max(11, Math.round(size * 0.28)) }]}>{isAi ? 'AI' : '✓'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(15,23,42,.10)', overflow: 'hidden' },
  fallback: { color: '#5B4FD6', fontWeight: '900' },
  service: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ai: { backgroundColor: '#FFFFFF', borderColor: '#D9D2FF' },
  vpn: { backgroundColor: '#EEEAFE', borderColor: '#D8D0FF' },
  serviceText: { color: '#6656D9', fontWeight: '900', letterSpacing: .4 },
});
