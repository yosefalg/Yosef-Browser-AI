import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput } from '@/lib/url';
import { getRecentSites } from '@/lib/db';

type RecentSite = { url: string; title: string; visited_at: number };

function looksLikeAIQuery(value: string) {
  const q = value.trim();
  return /[؟?]$/.test(q) || /^(يا\s+raid|اسأل|اشرح|لخص|قارن|ما |ماذا |كيف |لماذا |هل )/i.test(q);
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentSite[]>([]);
  const quick = useMemo(() => [
    ['التبويبات', '/tabs'],
    ['AI Agent', '/ai'],
    ['VPN', '/vpn'],
    ['المكتبة', '/library'],
    ['Private', '/browser?privateMode=1'],
    ['Privacy', '/privacy'],
    ['Settings', '/settings'],
  ] as const, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    getRecentSites(6)
      .then((items) => { if (active) setRecent(items); })
      .catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, []));

  const openUrl = (value: string) => {
    try {
      const url = normalizeInput(value);
      router.push({ pathname: '/browser', params: { url } });
    } catch {}
  };

  const openWeb = () => openUrl(query);

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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

          {recent.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionMeta}>{recent.length}</Text>
                <Text style={styles.sectionTitle}>المواقع الأخيرة</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
                {recent.map((site) => (
                  <Pressable key={site.url} onPress={() => openUrl(site.url)} style={styles.recentCard}>
                    <View style={styles.faviconFallback}><Text style={styles.faviconText}>{hostname(site.url).slice(0, 1).toUpperCase()}</Text></View>
                    <Text numberOfLines={1} style={styles.recentTitle}>{site.title?.trim() || hostname(site.url)}</Text>
                    <Text numberOfLines={1} style={styles.recentHost}>{hostname(site.url)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

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
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill:{flex:1},safe:{flex:1},content:{padding:20,paddingBottom:38},hero:{marginTop:20,marginBottom:28},brand:{fontSize:52,fontWeight:'900',letterSpacing:7,color:'#fff'},sub:{fontSize:23,fontWeight:'700',color:'#A78BFA'},tag:{marginTop:8,color:'#94A3B8'},omni:{flexDirection:'row',backgroundColor:'rgba(17,24,39,.92)',borderRadius:22,padding:7,borderWidth:1,borderColor:'#27324A',gap:6},input:{flex:1,color:'#fff',paddingHorizontal:14,fontSize:16,textAlign:'right'},aiBtn:{width:48,backgroundColor:'#312E81',borderRadius:16,alignItems:'center',justifyContent:'center'},aiBtnText:{color:'#EDE9FE',fontWeight:'900'},go:{backgroundColor:'#7C3AED',borderRadius:16,paddingHorizontal:18,justifyContent:'center'},goText:{color:'#fff',fontWeight:'800'},omniHint:{marginTop:8,color:'#64748B',fontSize:11,textAlign:'right'},section:{marginTop:22},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},sectionTitle:{color:'#F8FAFC',fontSize:16,fontWeight:'900'},sectionMeta:{color:'#7C3AED',fontWeight:'900'},recentRow:{gap:10,paddingRight:2},recentCard:{width:142,minHeight:118,borderRadius:20,padding:13,backgroundColor:'rgba(17,24,39,.88)',borderWidth:1,borderColor:'#27324A'},faviconFallback:{width:36,height:36,borderRadius:12,backgroundColor:'#312E81',alignItems:'center',justifyContent:'center',marginBottom:12},faviconText:{color:'#EDE9FE',fontSize:17,fontWeight:'900'},recentTitle:{color:'#F8FAFC',fontSize:13,fontWeight:'800',textAlign:'right'},recentHost:{marginTop:4,color:'#64748B',fontSize:10,textAlign:'right'},grid:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:24},card:{width:'48%',minHeight:96,borderRadius:22,padding:18,justifyContent:'flex-end',backgroundColor:'rgba(23,32,51,.88)',borderWidth:1,borderColor:'#27324A'},cardTitle:{color:'#F8FAFC',fontSize:17,fontWeight:'800'},statusCard:{marginTop:18,padding:18,borderRadius:22,backgroundColor:'rgba(17,24,39,.7)',borderWidth:1,borderColor:'#27324A'},statusTitle:{color:'#fff',fontWeight:'800',marginBottom:6},statusText:{color:'#94A3B8',lineHeight:20}
});
