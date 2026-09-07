import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { normalizeInput } from '@/lib/url';

function looksLikeAIQuery(value: string) {
  const q = value.trim();
  return /[؟?]$/.test(q) || /^(يا\s+raid|اسأل|اشرح|لخص|قارن|ما |ماذا |كيف |لماذا |هل )/i.test(q);
}

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const quick = useMemo(() => [
    ['AI Agent', '/ai'],
    ['Private', '/browser?privateMode=1'],
    ['Privacy', '/privacy'],
    ['Settings', '/settings'],
  ] as const, []);

  const openWeb = () => {
    try {
      const url = normalizeInput(query);
      router.push({ pathname: '/browser', params: { url } });
    } catch {}
  };

  const askAI = () => {
    const prompt = query.trim();
    router.push(prompt ? { pathname: '/ai', params: { prompt } } : '/ai');
  };

  const submit = () => {
    if (looksLikeAIQuery(query)) askAI();
    else openWeb();
  };

  return (
    <LinearGradient colors={['#070B14', '#111827', '#140B2D']} style={styles.fill}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <Text style={styles.brand}>RAID</Text>
          <Text style={styles.sub}>Agentic Browser AI</Text>
          <Text style={styles.tag}>Browse • Ask • Act • Remember</Text>
        </View>

        <View style={styles.omni}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            returnKeyType="go"
            placeholder="ابحث، افتح موقعاً، أو اسأل RAID"
            placeholderTextColor="#718096"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={askAI} style={styles.aiBtn}><Text style={styles.aiBtnText}>AI</Text></Pressable>
          <Pressable onPress={openWeb} style={styles.go}><Text style={styles.goText}>فتح</Text></Pressable>
        </View>
        <Text style={styles.omniHint}>الأسئلة الطبيعية تُرسل إلى RAID AI، والروابط وعبارات البحث تُفتح على الويب.</Text>

        <View style={styles.grid}>
          {quick.map(([label, path]) => (
            <Pressable key={label} onPress={() => router.push(path as never)} style={styles.card}>
              <Text style={styles.cardTitle}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Agentic foundation</Text>
          <Text style={styles.statusText}>RAID can keep local browsing context, use explicit local memory, and execute bounded safe commands. Private mode does not persist page context. Cloud AI only works when a real backend endpoint is configured.</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill:{flex:1}, safe:{flex:1,padding:20}, hero:{marginTop:36,marginBottom:28}, brand:{fontSize:52,fontWeight:'900',letterSpacing:7,color:'#fff'}, sub:{fontSize:23,fontWeight:'700',color:'#A78BFA'}, tag:{marginTop:8,color:'#94A3B8'}, omni:{flexDirection:'row',backgroundColor:'rgba(17,24,39,.92)',borderRadius:22,padding:7,borderWidth:1,borderColor:'#27324A',gap:6}, input:{flex:1,color:'#fff',paddingHorizontal:14,fontSize:16,textAlign:'right'}, aiBtn:{width:48,backgroundColor:'#312E81',borderRadius:16,alignItems:'center',justifyContent:'center'},aiBtnText:{color:'#EDE9FE',fontWeight:'900'},go:{backgroundColor:'#7C3AED',borderRadius:16,paddingHorizontal:18,justifyContent:'center'},goText:{color:'#fff',fontWeight:'800'},omniHint:{marginTop:8,color:'#64748B',fontSize:11,textAlign:'right'}, grid:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:24},card:{width:'48%',minHeight:96,borderRadius:22,padding:18,justifyContent:'flex-end',backgroundColor:'rgba(23,32,51,.88)',borderWidth:1,borderColor:'#27324A'},cardTitle:{color:'#F8FAFC',fontSize:17,fontWeight:'800'},statusCard:{marginTop:18,padding:18,borderRadius:22,backgroundColor:'rgba(17,24,39,.7)',borderWidth:1,borderColor:'#27324A'},statusTitle:{color:'#fff',fontWeight:'800',marginBottom:6},statusText:{color:'#94A3B8',lineHeight:20}
});
