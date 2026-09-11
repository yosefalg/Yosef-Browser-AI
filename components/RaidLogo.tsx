import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

export function RaidLogo({ size = 72 }: { size?: number }) {
  const radius = Math.round(size * 0.28);
  return (
    <LinearGradient colors={['#7C3AED', '#4F46E5']} style={[s.box, { width: size, height: size, borderRadius: radius }]}>
      <View style={s.cut} />
      <Text style={[s.r, { fontSize: Math.round(size * 0.46) }]}>R</Text>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#7C3AED', shadowOpacity: 0.24, shadowRadius: 18, elevation: 6 },
  cut: { position: 'absolute', width: '66%', height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,.22)', transform: [{ rotate: '-42deg' }] },
  r: { color: '#fff', fontWeight: '900', letterSpacing: -2 },
});
