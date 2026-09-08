import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { addBookmark, addHistory, createBrowserTab, isBookmarked, removeBookmark, setPageContext, updateBrowserTab } from '@/lib/db';
import { normalizeInput, safeExternalUrl } from '@/lib/url';
import { parseReaderMessage, READER_EXTRACT_JS, ReaderPayload } from '@/lib/reader';
import { PAGE_CONTEXT_JS, parsePageContext } from '@/lib/context';
import { connectVpn, disconnectVpn, isVpnConnected } from '@/lib/vpn';

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

export default function BrowserScreen() {
  const params = useLocalSearchParams<{ url?: string; privateMode?: string; tabId?: string }>();
  const privateMode = params.privateMode === '1';
  const startUrl = useMemo(() => {
    try { return normalizeInput(params.url || 'https://www.google.com'); } catch { return 'https://www.google.com'; }
  }, [params.url]);
  const [activeTabId, setActiveTabId] = useState<number | null>(() => {
    const id = Number(params.tabId);
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  const web = useRef<WebView>(null);
  const [url, setUrl] = useState(startUrl);
  const [loadedUrl, setLoadedUrl] = useState(startUrl);
  const [input, setInput] = useState(startUrl);
  const [title, setTitle] = useState('RAID Browser');
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reader, setReader] = useState<ReaderPayload | null>(null);
  const [fontSize, setFontSize] = useState(19);
  const [readerDark, setReaderDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteInfoOpen, setSiteInfoOpen] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnBusy, setVpnBusy] = useState(false);

  useEffect(() => {
    isVpnConnected().then(setVpnConnected).catch(() => setVpnConnected(false));
  }, []);

  const go = () => {
    try {
      const next = normalizeInput(input);
      setLoadError('');
      setUrl(next);
    } catch {
      Alert.alert('RAID', 'تعذر فهم العنوان أو عبارة البحث.');
    }
  };

  const changed = async (nav: WebViewNavigation) => {
    setCanBack(nav.canGoBack);
    setCanForward(nav.canGoForward);
    setTitle(nav.title || nav.url);
    setLoadedUrl(nav.url);
    setInput(nav.url);
    try { setBookmarked(await isBookmarked(nav.url)); } catch { setBookmarked(false); }
    if (!privateMode && safeExternalUrl(nav.url) && !nav.loading) {
      try { await addHistory(nav.url, nav.title); } catch {}
      try {
        if (activeTabId) await updateBrowserTab(activeTabId, nav.url, nav.title);
        else {
          const id = await createBrowserTab(nav.url, nav.title || 'علامة تبويب جديدة');
          setActiveTabId(id);
        }
      } catch {}
    }
  };

  const toggleBookmark = async () => {
    if (!safeExternalUrl(loadedUrl)) return;
    try {
      if (bookmarked) {
        await removeBookmark(loadedUrl);
        setBookmarked(false);
      } else {
        await addBookmark(loadedUrl, title);
        setBookmarked(true);
      }
    } catch {}
  };

  const reloadOrStop = () => {
    if (loading) {
      web.current?.stopLoading();
      setLoading(false);
      return;
    }
    setLoadError('');
    web.current?.reload();
  };

  const toggleVpn = async () => {
    if (vpnBusy) return;
    setVpnBusy(true);
    try {
      if (vpnConnected) {
        await disconnectVpn();
        setVpnConnected(false);
      } else {
        await connectVpn();
        setVpnConnected(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تشغيل VPN الآن.';
      Alert.alert('RAID VPN', message, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'فتح VPN', onPress: () => router.push('/vpn') },
      ]);
    } finally {
      setVpnBusy(false);
    }
  };

  const toggleDesktop = () => {
    setDesktopMode((value) => !value);
    setMenuOpen(false);
    setTimeout(() => web.current?.reload(), 80);
  };

  const openReader = () => {
    setMenuOpen(false);
    web.current?.injectJavaScript(READER_EXTRACT_JS);
  };
  const captureContext = () => {
    if (!privateMode) web.current?.injectJavaScript(PAGE_CONTEXT_JS);
  };
  const onMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    const page = parsePageContext(raw);
    if (page && !privateMode) {
      setPageContext(page.url, page.title, page.text).catch(() => {});
      return;
    }
    const payload = parseReaderMessage(raw);
    if (payload) setReader(payload);
  };
  const speakReader = () => {
    if (!reader?.text) return;
    Speech.stop();
    Speech.speak(reader.text.slice(0, 12000), { language: 'ar', rate: 0.92, pitch: 1 });
  };
  const stopSpeech = () => Speech.stop();
  const shareCurrent = () => {
    setMenuOpen(false);
    Share.share({ title, message: `${title}\n${loadedUrl}`, url: loadedUrl }).catch(() => {});
  };
  const openAI = () => {
    if (privateMode) return;
    setMenuOpen(false);
    captureContext();
    router.push({ pathname: '/ai', params: { url: loadedUrl, title } });
  };
  const openExternal = () => {
    setMenuOpen(false);
    Linking.openURL(loadedUrl).catch(() => {});
  };
  const goHome = () => router.replace('/');

  const shouldLoad = (requestUrl: string) => {
    if (safeExternalUrl(requestUrl)) return true;
    if (/^(mailto:|tel:|sms:)/i.test(requestUrl)) Linking.openURL(requestUrl).catch(() => {});
    return false;
  };

  const secure = loadedUrl.startsWith('https://');
  const insecureHttp = loadedUrl.startsWith('http://');
  const host = hostOf(loadedUrl);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={goHome} style={styles.icon} accessibilityRole="button" accessibilityLabel="الصفحة الرئيسية"><Text style={styles.iconGlyph}>⌂</Text></Pressable>
        <View style={styles.omni}>
          <Pressable onPress={() => setSiteInfoOpen(true)} accessibilityRole="button" accessibilityLabel="معلومات الموقع" style={styles.securityButton}>
            <Text style={[styles.security, insecureHttp && styles.insecure]}>{secure ? '●' : insecureHttp ? '!' : '○'}</Text>
          </Pressable>
          <TextInput value={input} onChangeText={setInput} onSubmitEditing={go} autoCapitalize="none" autoCorrect={false} style={styles.input} selectTextOnFocus accessibilityLabel="شريط العنوان والبحث" returnKeyType="go" placeholder="ابحث أو اكتب عنوان موقع" placeholderTextColor="#64748B" />
        </View>
        <Pressable onPress={() => router.push('/tabs')} style={styles.icon} accessibilityRole="button" accessibilityLabel="التبويبات"><Text style={styles.tabGlyph}>▣</Text></Pressable>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.icon} accessibilityRole="button" accessibilityLabel="قائمة المتصفح"><Text style={styles.menuDots}>⋮</Text></Pressable>
      </View>

      {privateMode && <View style={styles.private}><Text style={styles.privateText}>وضع خاص • لا سجل • لا سياق للذكاء الاصطناعي</Text></View>}
      {loading && <View style={styles.progress} accessibilityLabel="جار تحميل الصفحة" />}

      <View style={styles.webWrap}>
        <WebView
          ref={web}
          source={{ uri: url }}
          style={styles.web}
          javaScriptEnabled
          domStorageEnabled={!privateMode}
          cacheEnabled={!privateMode}
          incognito={privateMode}
          sharedCookiesEnabled={!privateMode}
          thirdPartyCookiesEnabled={!privateMode}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          userAgent={desktopMode ? DESKTOP_UA : undefined}
          originWhitelist={['http://*', 'https://*']}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          onNavigationStateChange={changed}
          onLoadStart={() => { setLoading(true); setLoadError(''); }}
          onLoadEnd={() => { setLoading(false); captureContext(); }}
          onError={(event) => {
            setLoading(false);
            setLoadError(event.nativeEvent.description || 'تعذر تحميل الصفحة');
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 400) setLoadError(`خطأ HTTP ${event.nativeEvent.statusCode}`);
          }}
          onShouldStartLoadWithRequest={(request) => shouldLoad(request.url)}
          onMessage={onMessage}
        />
        {loadError ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Text style={styles.errorTitle}>تعذر فتح الصفحة</Text>
            <Text style={styles.errorHost}>{host}</Text>
            <Text style={styles.errorText} numberOfLines={3}>{loadError}</Text>
            <View style={styles.errorActions}>
              <Pressable onPress={() => { setLoadError(''); web.current?.reload(); }} style={styles.retryBtn} accessibilityRole="button"><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>
              <Pressable onPress={goHome} style={styles.errorSecondary}><Text style={styles.errorSecondaryText}>الرئيسية</Text></Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        <Pressable disabled={!canBack} onPress={() => web.current?.goBack()} style={styles.nav} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={[styles.navText,!canBack&&styles.disabled]}>‹</Text></Pressable>
        <Pressable disabled={!canForward} onPress={() => web.current?.goForward()} style={styles.nav} accessibilityRole="button" accessibilityLabel="تقدم"><Text style={[styles.navText,!canForward&&styles.disabled]}>›</Text></Pressable>
        <Pressable onPress={reloadOrStop} style={styles.navPrimary} accessibilityRole="button" accessibilityLabel={loading ? 'إيقاف التحميل' : 'تحديث'}><Text style={styles.navPrimaryText}>{loading ? '×' : '↻'}</Text></Pressable>
        <Pressable onPress={toggleBookmark} style={styles.nav} accessibilityRole="button" accessibilityLabel={bookmarked ? 'إزالة المفضلة' : 'إضافة للمفضلة'}><Text style={[styles.star, bookmarked && styles.starOn]}>{bookmarked ? '★' : '☆'}</Text></Pressable>
        <Pressable onPress={toggleVpn} disabled={vpnBusy} style={[styles.vpn, vpnConnected && styles.vpnOn, vpnBusy && styles.controlBusy]} accessibilityRole="button" accessibilityLabel={vpnConnected ? 'إيقاف VPN' : 'تشغيل VPN'}><Text style={styles.vpnText}>{vpnBusy ? '…' : 'VPN'}</Text></Pressable>
        <Pressable disabled={privateMode} onPress={openAI} style={[styles.ai, privateMode && styles.aiDisabled]} accessibilityRole="button" accessibilityLabel="RAID AI"><Text style={styles.aiText}>AI</Text></Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Text numberOfLines={1} style={styles.menuHost}>{host}</Text>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/tabs'); }}><Text style={styles.menuItemText}>التبويبات</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={toggleDesktop}><Text style={styles.menuItemText}>{desktopMode ? '✓ موقع سطح المكتب' : 'موقع سطح المكتب'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openReader}><Text style={styles.menuItemText}>وضع القراءة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={shareCurrent}><Text style={styles.menuItemText}>مشاركة الصفحة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openExternal}><Text style={styles.menuItemText}>فتح في تطبيق خارجي</Text></Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); toggleVpn(); }}><Text style={styles.menuItemText}>{vpnConnected ? 'إيقاف RAID VPN' : 'تشغيل RAID VPN'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/privacy'); }}><Text style={styles.menuItemText}>الخصوصية</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/settings'); }}><Text style={styles.menuItemText}>الإعدادات</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={siteInfoOpen} transparent animationType="fade" onRequestClose={() => setSiteInfoOpen(false)}>
        <Pressable style={styles.overlayCentered} onPress={() => setSiteInfoOpen(false)}>
          <Pressable style={styles.siteCard} onPress={() => {}}>
            <View style={[styles.siteBadge, secure ? styles.siteBadgeSecure : styles.siteBadgeWarn]}><Text style={styles.siteBadgeText}>{secure ? 'HTTPS' : insecureHttp ? 'HTTP' : 'WEB'}</Text></View>
            <Text numberOfLines={1} style={styles.siteHost}>{host}</Text>
            <Text style={styles.siteStatus}>{secure ? 'الاتصال بهذا الموقع مشفّر.' : insecureHttp ? 'الاتصال غير مشفّر. لا تدخل بيانات حساسة.' : 'تعذر تحديد حالة التشفير.'}</Text>
            <Text numberOfLines={2} style={styles.siteUrl}>{loadedUrl}</Text>
            <Pressable style={styles.siteClose} onPress={() => setSiteInfoOpen(false)}><Text style={styles.siteCloseText}>تم</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(reader)} animationType="slide" onRequestClose={() => { stopSpeech(); setReader(null); }}>
        <SafeAreaView style={[styles.readerRoot, !readerDark && styles.readerLight]}>
          <View style={styles.readerHead}>
            <Pressable onPress={() => { stopSpeech(); setReader(null); }} style={styles.readerBtn}><Text style={styles.readerBtnText}>إغلاق</Text></Pressable>
            <Text style={[styles.readerTitle, !readerDark && styles.readerTextLight]} numberOfLines={1}>{reader?.title}</Text>
          </View>
          <View style={styles.readerTools}>
            <Pressable onPress={() => setFontSize((v) => Math.max(15, v - 1))} style={styles.readerTool}><Text style={styles.readerBtnText}>A−</Text></Pressable>
            <Pressable onPress={() => setFontSize((v) => Math.min(30, v + 1))} style={styles.readerTool}><Text style={styles.readerBtnText}>A+</Text></Pressable>
            <Pressable onPress={() => setReaderDark((v) => !v)} style={styles.readerTool}><Text style={styles.readerBtnText}>{readerDark ? '☀' : '☾'}</Text></Pressable>
            <Pressable onPress={speakReader} style={styles.readerTool}><Text style={styles.readerBtnText}>🔊</Text></Pressable>
            <Pressable onPress={stopSpeech} style={styles.readerTool}><Text style={styles.readerBtnText}>■</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.readerContent}>
            <Text style={[styles.readerArticle, { fontSize, lineHeight: Math.round(fontSize * 1.8) }, !readerDark && styles.readerTextLight]}>{reader?.text}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},
  top:{height:66,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:8,backgroundColor:'#0A101C',borderBottomWidth:1,borderBottomColor:'#172033'},
  icon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827',borderWidth:1,borderColor:'#1F2937'},iconGlyph:{color:'#E5E7EB',fontSize:21,fontWeight:'800'},tabGlyph:{color:'#E5E7EB',fontSize:18,fontWeight:'900'},menuDots:{color:'#E5E7EB',fontSize:25,fontWeight:'900',marginTop:-4},
  omni:{flex:1,height:44,borderRadius:18,backgroundColor:'#111827',alignItems:'center',flexDirection:'row',paddingHorizontal:5,borderWidth:1,borderColor:'#1F2937'},securityButton:{width:32,height:32,borderRadius:11,alignItems:'center',justifyContent:'center'},security:{fontSize:12,color:'#22C55E',fontWeight:'900'},insecure:{color:'#F59E0B'},input:{flex:1,color:'#F8FAFC',paddingHorizontal:7,fontSize:14,textAlign:'left'},
  private:{backgroundColor:'#2E1065',paddingVertical:5,alignItems:'center'},privateText:{color:'#DDD6FE',fontSize:11,fontWeight:'800',letterSpacing:.2},progress:{height:2,backgroundColor:'#8B5CF6'},
  webWrap:{flex:1,position:'relative'},web:{flex:1,backgroundColor:'#fff'},errorCard:{position:'absolute',left:18,right:18,top:24,padding:20,borderRadius:22,backgroundColor:'#0F172A',borderWidth:1,borderColor:'#334155'},errorTitle:{color:'#F8FAFC',fontSize:19,fontWeight:'900',textAlign:'right'},errorHost:{marginTop:5,color:'#C4B5FD',fontWeight:'800',textAlign:'right'},errorText:{marginTop:8,color:'#94A3B8',lineHeight:20,textAlign:'right'},errorActions:{flexDirection:'row-reverse',gap:9,marginTop:15},retryBtn:{flex:1,height:44,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},retryText:{color:'#fff',fontWeight:'900'},errorSecondary:{flex:1,height:44,borderRadius:14,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},errorSecondaryText:{color:'#E2E8F0',fontWeight:'800'},
  bottom:{height:66,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:5,backgroundColor:'#0A101C',borderTopWidth:1,borderTopColor:'#172033'},nav:{width:40,height:42,alignItems:'center',justifyContent:'center',borderRadius:13},navPrimary:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:'#172033',borderWidth:1,borderColor:'#27324A'},navText:{fontSize:28,color:'#F8FAFC'},navPrimaryText:{fontSize:24,color:'#F8FAFC',fontWeight:'700'},star:{fontSize:23,color:'#E2E8F0'},starOn:{color:'#FDE68A'},disabled:{color:'#475569'},
  vpn:{height:40,minWidth:48,paddingHorizontal:9,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#172033',borderWidth:1,borderColor:'#334155'},vpnOn:{backgroundColor:'#052E1A',borderColor:'#166534'},vpnText:{color:'#E2E8F0',fontSize:11,fontWeight:'900'},controlBusy:{opacity:.55},
  ai:{height:40,minWidth:46,paddingHorizontal:10,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},aiDisabled:{opacity:0.32},aiText:{color:'#fff',fontWeight:'900'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.48)',alignItems:'flex-end',paddingTop:70,paddingRight:12},overlayCentered:{flex:1,backgroundColor:'rgba(0,0,0,.55)',justifyContent:'center',padding:24},menuCard:{width:260,borderRadius:22,padding:10,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},menuHost:{color:'#94A3B8',fontSize:11,paddingHorizontal:12,paddingVertical:8},menuItem:{minHeight:46,borderRadius:13,justifyContent:'center',paddingHorizontal:12},menuItemText:{color:'#F8FAFC',fontSize:14,fontWeight:'700',textAlign:'right'},menuDivider:{height:1,backgroundColor:'#27324A',marginVertical:5},
  siteCard:{borderRadius:24,padding:20,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},siteBadge:{alignSelf:'flex-end',paddingHorizontal:10,paddingVertical:5,borderRadius:999},siteBadgeSecure:{backgroundColor:'#052E1A'},siteBadgeWarn:{backgroundColor:'#422006'},siteBadgeText:{color:'#F8FAFC',fontSize:11,fontWeight:'900'},siteHost:{marginTop:14,color:'#F8FAFC',fontSize:21,fontWeight:'900',textAlign:'right'},siteStatus:{marginTop:8,color:'#CBD5E1',lineHeight:21,textAlign:'right'},siteUrl:{marginTop:10,color:'#64748B',fontSize:11,textAlign:'right'},siteClose:{marginTop:18,height:46,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},siteCloseText:{color:'#fff',fontWeight:'900'},
  readerRoot:{flex:1,backgroundColor:'#090D14'},readerLight:{backgroundColor:'#F8F5EE'},readerHead:{height:60,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#27324A'},readerTitle:{flex:1,color:'#F8FAFC',fontWeight:'900',textAlign:'right'},readerTextLight:{color:'#1F2937'},readerBtn:{paddingHorizontal:12,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerBtnText:{color:'#F8FAFC',fontWeight:'900'},readerTools:{flexDirection:'row',justifyContent:'center',gap:8,padding:10,borderBottomWidth:1,borderBottomColor:'#27324A'},readerTool:{minWidth:48,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerContent:{paddingHorizontal:22,paddingVertical:24},readerArticle:{color:'#E5E7EB',textAlign:'right'}
});
