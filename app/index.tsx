import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput } from '@/lib/url';
import { getRecentSites, getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

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
  const [themeName, setThemeName] = useState<ThemeName>('cinematic');
  const enter = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(18)).current;
  const theme = useMemo(() => getTheme(themeName), [themeName]);

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
    Promise.all([
      getRecentSites(6).catch(() => [] as RecentSite[]),
      getSetting<ThemeName>('theme', 'cinematic').catch(() => 'cinematic' as ThemeName),
    ]).then(([items, savedTheme]) => {
      if (!active) return;
      setRecent(items);
      setThemeName(savedTheme);
    });
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
    <LinearGradient colors={[...theme.gradient]} style={styles.fill}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <View style={styles.topbar}>
          <View style={styles.brandMini}><View style={[styles.brandDot, { backgroundColor: theme.accent }]} /><Text style={[styles.brandMiniText, { color: theme.text }]}>RAID</Text></View>
          <Pressable onPress={() => setMenuOpen(true)} style={[styles.menuButton, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel="قائمة المتصفح" hitSlop={8}>
            <Text style={[styles.menuGlyph, { color: theme.text }]}>☰</Text>
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
              <LinearGradient colors={[...theme.accentGradient]} style={[styles.logoOrb, { shadowColor: theme.accent }]}>
                <Text style={styles.logoLetter}>R</Text>
              </LinearGradient>
              <Text style={[styles.brand, { color: theme.text }]}>RAID Browser</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>سريع، هادئ، ومصمم للتركيز</Text>
            </Animated.View>
          )}

          <Animated.View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused, { opacity: enter, transform: [{ translateY: lift }] }]}>
            {searchFocused && <Text style={[styles.focusHint, { color: theme.muted }]}>اكتب عنوان الموقع أو عبارة البحث</Text>}
            <View style={[styles.omni, { backgroundColor: theme.surface, borderColor: searchFocused ? theme.accent : theme.border }]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                returnKeyType="go"
                blurOnSubmit
                placeholder="ابحث أو اكتب عنوان موقع"
                placeholderTextColor={theme.muted}
                style={[styles.input, { color: theme.text }]}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                accessibilityLabel="شريط البحث والعنوان"
              />
              <Pressable onPress={submit} style={[styles.go, { backgroundColor: theme.accent }]} accessibilityRole="button" accessibilityLabel="فتح أو بحث"><Text style={styles.goText}>←</Text></Pressable>
            </View>
            <View style={styles.quickRow}>
              <Pressable onPress={askAI} style={[styles.quick, { backgroundColor: theme.surface2, borderColor: theme.border }]}><Text style={[styles.quickText, { color: theme.text }]}>AI</Text></Pressable>
              <Pressable onPress={() => { Keyboard.dismiss(); router.push('/browser?privateMode=1' as never); }} style={[styles.quick, { backgroundColor: theme.surface2, borderColor: theme.border }]}><Text style={[styles.quickText, { color: theme.text }]}>خاص</Text></Pressable>
              <Pressable onPress={() => { Keyboard.dismiss(); router.push('/tabs'); }} style={[styles.quick, { backgroundColor: theme.surface2, borderColor: theme.border }]}><Text style={[styles.quickText, { color: theme.text }]}>التبويبات</Text></Pressable>
            </View>
          </Animated.View>

          {!searchFocused && recent.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>الأخيرة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
                {recent.map((site) => (
                  <Pressable key={site.url} onPress={() => openUrl(site.url)} style={[styles.recentCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[styles.faviconFallback, { backgroundColor: theme.surface2 }]}><Text style={[styles.faviconText, { color: theme.accent }]}>{hostname(site.url).slice(0, 1).toUpperCase()}</Text></View>
                    <Text numberOfLines={1} style={[styles.recentTitle, { color: theme.text }]}>{site.title?.trim() || hostname(site.url)}</Text>
                    <Text numberOfLines={1} style={[styles.recentHost, { color: theme.muted }]}>{hostname(site.url)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>

        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={[styles.overlay, { paddingTop: insets.top + 58 }]} onPress={() => setMenuOpen(false)}>
            <Pressable style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => {}}>
              <View style={styles.menuHeader}><Text style={[styles.menuTitle, { color: theme.text }]}>RAID</Text><Text style={[styles.menuCaption, { color: theme.muted }]}>المتصفح والإعدادات</Text></View>
              {menuItems.map(([label, path]) => (
                <Pressable key={label} style={styles.menuItem} onPress={() => navigate(path)}>
                  <Text style={[styles.menuItemText, { color: theme.text }]}>{label}</Text><Text style={[styles.chev, { color: theme.muted }]}>‹</Text>
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
  fill:{flex:1},safe:{flex:1},topbar:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18},brandMini:{flexDirection:'row',alignItems:'center',gap:8},brandDot:{width:9,height:9,borderRadius:5},brandMiniText:{fontSize:14,fontWeight:'900',letterSpacing:2},menuButton:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},menuGlyph:{fontSize:21,fontWeight:'800',lineHeight:23},
  content:{paddingHorizontal:18,paddingTop:28,paddingBottom:34},contentFocused:{paddingTop:10},hero:{alignItems:'center',marginBottom:34},logoOrb:{width:76,height:76,borderRadius:24,alignItems:'center',justifyContent:'center',shadowOpacity:.32,shadowRadius:22,shadowOffset:{width:0,height:8},elevation:8},logoLetter:{fontSize:36,fontWeight:'900',color:'#fff'},brand:{marginTop:18,fontSize:31,fontWeight:'900',letterSpacing:.3},sub:{marginTop:7,fontSize:13},
  searchWrap:{gap:12},searchWrapFocused:{paddingTop:2},focusHint:{fontSize:12,fontWeight:'700',textAlign:'right',paddingHorizontal:4},omni:{height:58,borderRadius:21,borderWidth:1,flexDirection:'row',alignItems:'center',padding:6},input:{flex:1,paddingHorizontal:14,fontSize:16,textAlign:'right'},go:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center'},goText:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:-2},quickRow:{flexDirection:'row-reverse',gap:8},quick:{height:39,paddingHorizontal:16,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},quickText:{fontSize:12,fontWeight:'800'},
  section:{marginTop:30},sectionTitle:{fontSize:14,fontWeight:'900',textAlign:'right',marginBottom:12},recentRow:{gap:10,paddingRight:2},recentCard:{width:142,minHeight:112,borderRadius:18,padding:13,borderWidth:1},faviconFallback:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',marginBottom:11},faviconText:{fontSize:15,fontWeight:'900'},recentTitle:{fontSize:13,fontWeight:'800',textAlign:'right'},recentHost:{marginTop:4,fontSize:10,textAlign:'right'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.58)',alignItems:'flex-end',paddingRight:12},menuCard:{width:282,borderRadius:24,padding:10,borderWidth:1},menuHeader:{paddingHorizontal:12,paddingTop:8,paddingBottom:12},menuTitle:{fontSize:20,fontWeight:'900',textAlign:'right'},menuCaption:{marginTop:3,fontSize:11,textAlign:'right'},menuItem:{minHeight:50,borderRadius:14,paddingHorizontal:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},menuItemText:{fontSize:14,fontWeight:'800'},chev:{fontSize:25}
});
