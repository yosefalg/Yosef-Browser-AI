import { useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import WebView, { WebViewNavigation } from 'react-native-webview';
import { addBookmark, addHistory } from '@/lib/db';
import { normalizeInput, safeExternalUrl } from '@/lib/url';

export default function BrowserScreen() {
  const params = useLocalSearchParams<{ url?: string; privateMode?: string }>();
  const privateMode = params.privateMode === '1';
  const startUrl = useMemo(() => {
    try { return normalizeInput(params.url || 'https://www.google.com'); } catch { return 'https://www.google.com'; }
  }, [params.url]);

  const web = useRef<WebView>(null);
  const [url, setUrl] = useState(startUrl);
  const [input, setInput] = useState(startUrl);
  const [title, setTitle] = useState('RAID Browser');
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [loading, setLoading] = useState(false);

  const go = () => {
    try { const next = normalizeInput(input); setUrl(next); } catch {}
  };

  const changed = async (nav: WebViewNavigation) => {
    setCanBack(nav.canGoBack); setCanForward(nav.canGoForward); setTitle(nav.title || nav.url); setInput(nav.url);
    if (!privateMode && safeExternalUrl(nav.url) && !nav.loading) {
      try { await addHistory(nav.url, nav.title); } catch {}
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.icon}><Text style={styles.iconText}>×</Text></Pressable>
        <View style={styles.omni}>
          <TextInput value={input} onChangeText={setInput} onSubmitEditing={go} autoCapitalize="none" autoCorrect={false} style={styles.input} selectTextOnFocus />
        </View>
        <Pressable onPress={() => addBookmark(input, title).catch(()=>{})} style={styles.icon}><Text style={styles.iconText}>★</Text></Pressable>
      </View>

      {privateMode && <View style={styles.private}><Text style={styles.privateText}>PRIVATE MODE — history is not persisted</Text></View>}
      {loading && <View style={styles.progress} />}

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
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onShouldStartLoadWithRequest={(request) => safeExternalUrl(request.url)}
      />

      <View style={styles.bottom}>
        <Pressable disabled={!canBack} onPress={() => web.current?.goBack()} style={styles.nav}><Text style={[styles.navText,!canBack&&styles.disabled]}>‹</Text></Pressable>
        <Pressable disabled={!canForward} onPress={() => web.current?.goForward()} style={styles.nav}><Text style={[styles.navText,!canForward&&styles.disabled]}>›</Text></Pressable>
        <Pressable onPress={() => web.current?.reload()} style={styles.nav}><Text style={styles.navText}>↻</Text></Pressable>
        <Pressable onPress={() => router.replace('/')} style={styles.nav}><Text style={styles.navText}>⌂</Text></Pressable>
        <Pressable onPress={() => router.push('/ai')} style={styles.ai}><Text style={styles.aiText}>AI</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},top:{height:62,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,backgroundColor:'#0B1220',borderBottomWidth:1,borderBottomColor:'#1E293B'},icon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},iconText:{color:'#fff',fontSize:22,fontWeight:'700'},omni:{flex:1,height:42,borderRadius:16,backgroundColor:'#111827',justifyContent:'center'},input:{color:'#F8FAFC',paddingHorizontal:14,fontSize:14},private:{backgroundColor:'#3B0764',paddingVertical:6,alignItems:'center'},privateText:{color:'#E9D5FF',fontSize:12,fontWeight:'700'},progress:{height:2,backgroundColor:'#8B5CF6'},web:{flex:1,backgroundColor:'#fff'},bottom:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-around',backgroundColor:'#0B1220',borderTopWidth:1,borderTopColor:'#1E293B'},nav:{width:48,height:44,alignItems:'center',justifyContent:'center'},navText:{fontSize:30,color:'#F8FAFC'},disabled:{color:'#475569'},ai:{height:40,minWidth:54,paddingHorizontal:14,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},aiText:{color:'#fff',fontWeight:'900'}
});
