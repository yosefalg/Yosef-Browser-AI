import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { addBookmark, addHistory, isBookmarked, removeBookmark, setPageContext } from '@/lib/db';
import { normalizeInput, safeExternalUrl } from '@/lib/url';
import { parseReaderMessage, READER_EXTRACT_JS, ReaderPayload } from '@/lib/reader';
import { PAGE_CONTEXT_JS, parsePageContext } from '@/lib/context';

export default function BrowserScreen() {
  const params = useLocalSearchParams<{ url?: string; privateMode?: string }>();
  const privateMode = params.privateMode === '1';
  const startUrl = useMemo(() => {
    try { return normalizeInput(params.url || 'https://www.google.com'); } catch { return 'https://www.google.com'; }
  }, [params.url]);

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

  const go = () => {
    try {
      const next = normalizeInput(input);
      setLoadError('');
      setUrl(next);
    } catch {}
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

  const openReader = () => web.current?.injectJavaScript(READER_EXTRACT_JS);
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
  const shareCurrent = () => Share.share({ title, message: `${title}\n${loadedUrl}`, url: loadedUrl }).catch(() => {});
  const openAI = () => {
    if (privateMode) return;
    captureContext();
    router.push({ pathname: '/ai', params: { url: loadedUrl, title } });
  };

  const secure = loadedUrl.startsWith('https://');
  const insecureHttp = loadedUrl.startsWith('http://');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.icon} accessibilityRole="button" accessibilityLabel="إغلاق المتصفح"><Text style={styles.iconText}>×</Text></Pressable>
        <View style={styles.omni}>
          <Text
            style={[styles.security, insecureHttp && styles.insecure]}
            accessibilityLabel={secure ? 'اتصال HTTPS آمن' : insecureHttp ? 'اتصال HTTP غير مشفر' : 'حالة الاتصال غير معروفة'}
          >{secure ? '🔒' : insecureHttp ? '⚠' : '◌'}</Text>
          <TextInput value={input} onChangeText={setInput} onSubmitEditing={go} autoCapitalize="none" autoCorrect={false} style={styles.input} selectTextOnFocus accessibilityLabel="شريط العنوان والبحث" returnKeyType="go" />
        </View>
        <Pressable onPress={toggleBookmark} style={[styles.icon, bookmarked && styles.bookmarkedIcon]} accessibilityRole="button" accessibilityLabel={bookmarked ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'} accessibilityState={{ selected: bookmarked }}>
          <Text style={[styles.iconText, bookmarked && styles.bookmarkedText]}>{bookmarked ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      {privateMode && <View style={styles.private}><Text style={styles.privateText}>الوضع الخاص — لا يتم حفظ السجل أو سياق AI، وAI معطّل</Text></View>}
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
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
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
          onShouldStartLoadWithRequest={(request) => safeExternalUrl(request.url)}
          onMessage={onMessage}
        />
        {loadError ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Text style={styles.errorTitle}>تعذر فتح الصفحة</Text>
            <Text style={styles.errorText} numberOfLines={3}>{loadError}</Text>
            <Pressable onPress={() => { setLoadError(''); web.current?.reload(); }} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="إعادة محاولة تحميل الصفحة"><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        <Pressable disabled={!canBack} onPress={() => web.current?.goBack()} style={styles.nav} accessibilityRole="button" accessibilityLabel="رجوع" accessibilityState={{ disabled: !canBack }}><Text style={[styles.navText,!canBack&&styles.disabled]}>‹</Text></Pressable>
        <Pressable disabled={!canForward} onPress={() => web.current?.goForward()} style={styles.nav} accessibilityRole="button" accessibilityLabel="تقدم" accessibilityState={{ disabled: !canForward }}><Text style={[styles.navText,!canForward&&styles.disabled]}>›</Text></Pressable>
        <Pressable onPress={reloadOrStop} style={styles.nav} accessibilityRole="button" accessibilityLabel={loading ? 'إيقاف تحميل الصفحة' : 'تحديث الصفحة'}><Text style={loading ? styles.stopText : styles.navText}>{loading ? '×' : '↻'}</Text></Pressable>
        <Pressable onPress={openReader} style={styles.nav} accessibilityRole="button" accessibilityLabel="وضع القراءة"><Text style={styles.smallNav}>Aa</Text></Pressable>
        <Pressable onPress={shareCurrent} style={styles.nav} accessibilityRole="button" accessibilityLabel="مشاركة الصفحة"><Text style={styles.smallNav}>↗</Text></Pressable>
        <Pressable disabled={privateMode} onPress={openAI} style={[styles.ai, privateMode && styles.aiDisabled]} accessibilityRole="button" accessibilityLabel={privateMode ? 'مساعد RAID AI معطّل في الوضع الخاص' : 'فتح مساعد RAID AI'} accessibilityState={{ disabled: privateMode }}><Text style={styles.aiText}>AI</Text></Pressable>
      </View>

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
  top:{height:62,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,backgroundColor:'#0B1220',borderBottomWidth:1,borderBottomColor:'#1E293B'},
  icon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},iconText:{color:'#fff',fontSize:22,fontWeight:'700'},bookmarkedIcon:{backgroundColor:'#3B2F12'},bookmarkedText:{color:'#FDE68A'},
  omni:{flex:1,height:42,borderRadius:16,backgroundColor:'#111827',alignItems:'center',flexDirection:'row',paddingLeft:10},security:{fontSize:12,color:'#94A3B8'},insecure:{color:'#F59E0B'},input:{flex:1,color:'#F8FAFC',paddingHorizontal:10,fontSize:14},
  private:{backgroundColor:'#3B0764',paddingVertical:6,alignItems:'center'},privateText:{color:'#E9D5FF',fontSize:12,fontWeight:'700'},progress:{height:2,backgroundColor:'#8B5CF6'},
  webWrap:{flex:1,position:'relative'},web:{flex:1,backgroundColor:'#fff'},errorCard:{position:'absolute',left:18,right:18,top:24,padding:18,borderRadius:18,backgroundColor:'#111827',borderWidth:1,borderColor:'#334155'},errorTitle:{color:'#F8FAFC',fontSize:18,fontWeight:'900',textAlign:'right'},errorText:{marginTop:7,color:'#94A3B8',lineHeight:20,textAlign:'right'},retryBtn:{marginTop:14,height:42,borderRadius:13,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},retryText:{color:'#fff',fontWeight:'900'},
  bottom:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-around',backgroundColor:'#0B1220',borderTopWidth:1,borderTopColor:'#1E293B'},nav:{width:42,height:44,alignItems:'center',justifyContent:'center'},navText:{fontSize:30,color:'#F8FAFC'},stopText:{fontSize:28,color:'#F8FAFC',fontWeight:'400'},smallNav:{fontSize:18,color:'#F8FAFC',fontWeight:'900'},disabled:{color:'#475569'},ai:{height:40,minWidth:50,paddingHorizontal:12,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},aiDisabled:{opacity:0.38},aiText:{color:'#fff',fontWeight:'900'},
  readerRoot:{flex:1,backgroundColor:'#090D14'},readerLight:{backgroundColor:'#F8F5EE'},readerHead:{height:60,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#27324A'},readerTitle:{flex:1,color:'#F8FAFC',fontWeight:'900',textAlign:'right'},readerTextLight:{color:'#1F2937'},readerBtn:{paddingHorizontal:12,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerBtnText:{color:'#F8FAFC',fontWeight:'900'},readerTools:{flexDirection:'row',justifyContent:'center',gap:8,padding:10,borderBottomWidth:1,borderBottomColor:'#27324A'},readerTool:{minWidth:48,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerContent:{paddingHorizontal:22,paddingVertical:24},readerArticle:{color:'#E5E7EB',textAlign:'right'}
});
