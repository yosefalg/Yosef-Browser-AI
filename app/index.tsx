import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { normalizeInput } from '@/lib/url';

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const quick = useMemo(() => [
    ['AI Agent', '/ai'],
    ['Private', '/browser?privateMode=1'],
    ['Privacy', '/privacy'],
    ['Settings', '/settings'],
  ] as const, []);

  const open = () => {
    try {
      const url = normalizeInput(query);
      router.push({ pathname: '/browser', params: { url } });
    } catch {}
  };

  return (
    <LinearGradient colors={['#070B14', '#111827', '#140B2D']} style={styles.fill}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <Text style={styles.brand}>RAID</Text>
          <Text style={styles.sub}>Browser AI</Text>
          <Text style={styles.tag}>Private • Intelligent • Cinematic</Text>
        </View>

        <View style={styles.omni}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={open}
            returnKeyType="go"
            placeholder="ابحث أو اكتب عنوان الموقع"
            placeholderTextColor="#718096"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={open} style={styles.go}><Text style={styles.goText}>فتح</Text></Pressable>
        </View>

        <View style={styles.grid}>
          {quick.map(([label, path]) => (
            <Pressable key={label} onPress={() => router.push(path as never)} style={styles.card}>
              <Text style={styles.cardTitle}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Privacy status</Text>
          <Text style={styles.statusText}>Local history uses SQLite. Secrets use SecureStore. VPN is never shown as connected unless a real native provider is configured.</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill:{flex:1}, safe:{flex:1,padding:20}, hero:{marginTop:36,marginBottom:28}, brand:{fontSize:52,fontWeight:'900',letterSpacing:7,color:'#fff'}, sub:{fontSize:23,fontWeight:'700',color:'#A78BFA'}, tag:{marginTop:8,color:'#94A3B8'}, omni:{flexDirection:'row',backgroundColor:'rgba(17,24,39,.92)',borderRadius:22,padding:7,borderWidth:1,borderColor:'#27324A'}, input:{flex:1,color:'#fff',paddingHorizontal:14,fontSize:16,textAlign:'right'}, go:{backgroundColor:'#7C3AED',borderRadius:16,paddingHorizontal:18,justifyContent:'center'},goText:{color:'#fff',fontWeight:'800'}, grid:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:24},card:{width:'48%',minHeight:96,borderRadius:22,padding:18,justifyContent:'flex-end',backgroundColor:'rgba(23,32,51,.88)',borderWidth:1,borderColor:'#27324A'},cardTitle:{color:'#F8FAFC',fontSize:17,fontWeight:'800'},statusCard:{marginTop:18,padding:18,borderRadius:22,backgroundColor:'rgba(17,24,39,.7)',borderWidth:1,borderColor:'#27324A'},statusTitle:{color:'#fff',fontWeight:'800',marginBottom:6},statusText:{color:'#94A3B8',lineHeight:20}
});
