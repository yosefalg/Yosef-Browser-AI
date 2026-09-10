import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentSite[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(18)).current;

  const menuItems = useMemo(() => [
    ['الحساب', '/account'],
    ['RAID AI', '/ai'],
    ['RAID VPN', '/vpn'],
    ['المكتبة والسجل', '/library'],
    ['الخصوصية', '/privacy'],
    ['الإعدادات', '/settings'],
  ] as const, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 330, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 390, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [enter, lift]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getRecentSites(6)
      .then((items) => { if (active) setRecent(items); })
      .catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, []));

  const openUrl = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    try {
      const url = normalizeInput(clean);
      Keyboard.dismiss();
      router.push({ pathname: '/browser', params: { url } });
    } catch {}
  };

  const askAI = () => {
    const prompt = query.trim();
    Keyboard.dismiss();
    router.push(prompt ? { pathname: '/ai', params: { prompt } } : '/ai');
  };
  const submit = () => looksLikeAIQuery(query) ? askAI() : openUrl(query);
  const navigate = (path: string) => { setMenuOpen(false); router.push(path as never); };

  return (
    <LinearGradient colors={['#05070C', '#0A0F19', '#0D1220']} style={styles.fill}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <View style={styles.topbar}>
          <View style={styles.brandMini}><View style={styles.brandDot} /><Text style={styles.brandMiniText}>RAID</Text></View>
          <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="قائمة المتصفح" hitSlop={8}>
            <Text style={styles.menuGlyph}>☰</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, searchFocused && styles.contentFocused]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {!searchFocused && (
            <Animated.View style={[styles.hero, { opacity: enter, transform: [{ translateY: lift }] }]}>
              <LinearGradient colors={['#7C3AED', '#4F46E5']} style={styles.logoOrb}>
                <Text style={styles.logoLetter}>R</Text>
              </LinearGradient>
              <Text style={styles.brand}>RAID Browser</Text>
              <Text style={styles.sub}>سريع، هادئ، ومصمم للتركيز</Text>
            </Animated.View>
          )}

          <Animated.View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused, { opacity: enter, transform: [{ translateY: lift }] }]}>
            {searchFocused && <Text style={styles.focusHint}>اكتب عنوان الموقع أو عبارة البحث</Text>}
            <View style={[styles.omni, searchFocused && styles.omniFocused]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                returnKeyType="go"
                blurOnSubmit
                placeholder="ابحث أو اكتب عنوان موقع"
                placeholderTextColor="#67738A"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                accessibilityLabel="شريط البحث والعنوان"
              />
              <Pressable onPress={submit} style={styles.go} accessibilityRole="button" accessibilityLabel="فتح أو بحث"><Text style={styles.goText}>←</Text></Pressable>
            </View>
            <View style={styles.quickRow}>
              <Pressable onPress={askAI} style={styles.quick}><Text style={styles.quickText}>AI</Text></Pressable>
              <Pressable onPress={() => { Keyboard.dismiss(); router.push('/browser?privateMode=1' as never); }} style={styles.quick}><Text style={styles.quickText}>خاص</Text></Pressable>
              <Pressable onPress={() => { Keyboard.dismiss(); router.push('/tabs'); }} style={styles.quick}><Text style={styles.quickText}>التبويبات</Text></Pressable>
            </View>
          </Animated.View>

          {!searchFocused && recent.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>الأخيرة</Text>
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
        </ScrollView>

        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={[styles.overlay, { paddingTop: insets.top + 58 }]} onPress={() => setMenuOpen(false)}>
            <Pressable style={styles.menuCard} onPress={() => {}}>
              <View style={styles.menuHeader}><Text style={styles.menuTitle}>RAID</Text><Text style={styles.menuCaption}>المتصفح والإعدادات</Text></View>
              {menuItems.map(([label, path]) => (
                <Pressable key={label} style={styles.menuItem} onPress={() => navigate(path)}>
                  <Text style={styles.menuItemText}>{label}</Text><Text style={styles.chev}>‹</Text>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill:{flex:1},safe:{flex:1},topbar:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18},brandMini:{flexDirection:'row',alignItems:'center',gap:8},brandDot:{width:9,height:9,borderRadius:5,backgroundColor:'#8B5CF6'},brandMiniText:{color:'#E5E7EB',fontSize:14,fontWeight:'900',letterSpacing:2},menuButton:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(15,23,42,.78)',borderWidth:1,borderColor:'#263247'},menuGlyph:{color:'#F8FAFC',fontSize:21,fontWeight:'800',lineHeight:23},
  content:{paddingHorizontal:18,paddingTop:28,paddingBottom:34},contentFocused:{paddingTop:10},hero:{alignItems:'center',marginBottom:34},logoOrb:{width:76,height:76,borderRadius:24,alignItems:'center',justifyContent:'center',shadowColor:'#7C3AED',shadowOpacity:.32,shadowRadius:22,shadowOffset:{width:0,height:8},elevation:8},logoLetter:{fontSize:36,fontWeight:'900',color:'#fff'},brand:{marginTop:18,fontSize:31,fontWeight:'900',color:'#F8FAFC',letterSpacing:.3},sub:{marginTop:7,fontSize:13,color:'#8B98AD'},
  searchWrap:{gap:12},searchWrapFocused:{paddingTop:2},focusHint:{color:'#94A3B8',fontSize:12,fontWeight:'700',textAlign:'right',paddingHorizontal:4},omni:{height:58,borderRadius:21,backgroundColor:'rgba(15,23,42,.92)',borderWidth:1,borderColor:'#263247',flexDirection:'row',alignItems:'center',padding:6},omniFocused:{borderColor:'#7C3AED',backgroundColor:'rgba(15,23,42,.98)'},input:{flex:1,color:'#fff',paddingHorizontal:14,fontSize:16,textAlign:'right'},go:{width:46,height:46,borderRadius:16,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},goText:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:-2},quickRow:{flexDirection:'row-reverse',gap:8},quick:{height:39,paddingHorizontal:16,borderRadius:14,backgroundColor:'rgba(17,24,39,.82)',borderWidth:1,borderColor:'#222D3E',alignItems:'center',justifyContent:'center'},quickText:{color:'#CBD5E1',fontSize:12,fontWeight:'800'},
  section:{marginTop:30},sectionTitle:{color:'#E5E7EB',fontSize:14,fontWeight:'900',textAlign:'right',marginBottom:12},recentRow:{gap:10,paddingRight:2},recentCard:{width:142,minHeight:112,borderRadius:18,padding:13,backgroundColor:'rgba(15,23,42,.76)',borderWidth:1,borderColor:'#202A3A'},faviconFallback:{width:34,height:34,borderRadius:11,backgroundColor:'#252B46',alignItems:'center',justifyContent:'center',marginBottom:11},faviconText:{color:'#DDD6FE',fontSize:15,fontWeight:'900'},recentTitle:{color:'#F8FAFC',fontSize:13,fontWeight:'800',textAlign:'right'},recentHost:{marginTop:4,color:'#64748B',fontSize:10,textAlign:'right'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.58)',alignItems:'flex-end',paddingRight:12},menuCard:{width:282,borderRadius:24,padding:10,backgroundColor:'#0D1421',borderWidth:1,borderColor:'#253044'},menuHeader:{paddingHorizontal:12,paddingTop:8,paddingBottom:12},menuTitle:{color:'#fff',fontSize:20,fontWeight:'900',textAlign:'right'},menuCaption:{marginTop:3,color:'#64748B',fontSize:11,textAlign:'right'},menuItem:{minHeight:50,borderRadius:14,paddingHorizontal:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},menuItemText:{color:'#F8FAFC',fontSize:14,fontWeight:'800'},chev:{color:'#64748B',fontSize:25}
});
