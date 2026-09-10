import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { addBookmark, addHistory, createBrowserTab, isBookmarked, removeBookmark, setPageContext, updateBrowserTab } from '@/lib/db';
import { normalizeInput, safeExternalUrl } from '@/lib/url';
import { parseReaderMessage, READER_EXTRACT_JS, ReaderPayload } from '@/lib/reader';
import { PAGE_CONTEXT_JS, parsePageContext } from '@/lib/context';
import { isVpnConnected } from '@/lib/vpn';

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const RENDERER_RECOVERY_WINDOW_MS = 30_000;
const MAX_RENDERER_RECOVERIES = 2;
const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const MEDIA_SCAN_JS = `(() => {
  try {
    const urls = [];
    const push = (value) => {
      if (!value || typeof value !== 'string') return;
      try {
        const absolute = new URL(value, location.href).href;
        if (/^https?:/i.test(absolute) && !urls.includes(absolute)) urls.push(absolute);
      } catch {}
    };
    document.querySelectorAll('video').forEach((video) => {
      push(video.currentSrc);
      push(video.src);
      video.querySelectorAll('source').forEach((source) => push(source.src));
    });
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.href || '';
      if (/\.(mp4|m4v|webm|m3u8)(?:$|[?#])/i.test(href)) push(href);
    });
    window.ReactNativeWebView?.postMessage('RAID_MEDIA:' + JSON.stringify(urls.slice(0, 12)));
  } catch {}
  true;
})();`;
const PLAY_PAGE_VIDEO_JS = `(() => {
  try {
    const videos = Array.from(document.querySelectorAll('video'));
    const video = videos.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 80 && rect.height > 45;
    }) || videos[0];
    if (!video) {
      window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:NO_VIDEO');
      return true;
    }
    video.setAttribute('playsinline', '');
    const result = video.play();
    if (result && typeof result.catch === 'function') result.catch(() => {});
    const fullscreen = video.requestFullscreen || video.webkitRequestFullscreen;
    if (typeof fullscreen === 'function') {
      try { fullscreen.call(video); } catch {}
    }
    window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:PLAYING');
  } catch {
    window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:FAILED');
  }
  true;
})();`;

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function isDirectMediaUrl(value: string) {
  return /^https?:\/\//i.test(value) && DIRECT_MEDIA_RE.test(value);
}

function mediaPlayerHtml(mediaUrl: string) {
  const source = JSON.stringify(mediaUrl).replace(/</g, '\\u003c');
  return `<!doctype html>
<html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
html,body{margin:0;width:100%;height:100%;background:#05070c;color:#fff;font-family:sans-serif}body{display:flex;align-items:center;justify-content:center}video{width:100%;height:100%;background:#000;object-fit:contain}.msg{position:fixed;left:16px;right:16px;bottom:18px;background:rgba(15,23,42,.88);padding:10px 14px;border-radius:12px;text-align:center;font-size:12px;color:#cbd5e1}
</style></head><body><video id="raidVideo" controls autoplay playsinline webkit-playsinline></video><div id="msg" class="msg">RAID Media Player</div><script>
const video=document.getElementById('raidVideo'); const msg=document.getElementById('msg'); const src=${source}; video.src=src;
video.addEventListener('playing',()=>{msg.style.display='none'}); video.addEventListener('error',()=>{msg.textContent='تعذر تشغيل المصدر داخل المشغل. جرّب فتحه بتطبيق فيديو خارجي.'});
</script></body></html>`;
}

export default function BrowserScreen() {
  const insets = useSafeAreaInsets();
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
  const rendererFailures = useRef<number[]>([]);
  const rendererNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedNavigation = useRef('');
  const [webKey, setWebKey] = useState(0);
  const [url, setUrl] = useState(startUrl);
  const [loadedUrl, setLoadedUrl] = useState(startUrl);
  const [input, setInput] = useState(startUrl);
  const [addressFocused, setAddressFocused] = useState(false);
  const [title, setTitle] = useState('RAID Browser');
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rendererNotice, setRendererNotice] = useState('');
  const [reader, setReader] = useState<ReaderPayload | null>(null);
  const [fontSize, setFontSize] = useState(19);
  const [readerDark, setReaderDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteInfoOpen, setSiteInfoOpen] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');

  const refreshVpnStatus = useCallback(() => {
    void isVpnConnected().then(setVpnConnected).catch(() => setVpnConnected(false));
  }, []);

  useFocusEffect(useCallback(() => {
    refreshVpnStatus();
    return () => {};
  }, [refreshVpnStatus]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshVpnStatus();
    });
    return () => {
      subscription.remove();
      if (rendererNoticeTimer.current) clearTimeout(rendererNoticeTimer.current);
      Speech.stop();
    };
  }, [refreshVpnStatus]);

  const showRendererNotice = (message: string) => {
    if (rendererNoticeTimer.current) clearTimeout(rendererNoticeTimer.current);
    setRendererNotice(message);
    rendererNoticeTimer.current = setTimeout(() => {
      rendererNoticeTimer.current = null;
      setRendererNotice('');
    }, 5000);
  };

  const recoverRenderer = (didCrash: boolean) => {
    const now = Date.now();
    const recent = rendererFailures.current.filter((time) => now - time < RENDERER_RECOVERY_WINDOW_MS);
    if (recent.length >= MAX_RENDERER_RECOVERIES) {
      rendererFailures.current = recent;
      setLoading(false);
      setLoadProgress(0);
      setLoadError('توقف محرك عرض الصفحة عدة مرات. أعد المحاولة أو افتح صفحة أخرى.');
      showRendererNotice('تم إيقاف الاستعادة التلقائية مؤقتًا لحماية استقرار المتصفح.');
      return;
    }

    rendererFailures.current = [...recent, now];
    setLoading(false);
    setLoadProgress(0);
    setLoadError('');
    setCanBack(false);
    setCanForward(false);
    setReader(null);
    setMediaOpen(false);
    Speech.stop();
    showRendererNotice(didCrash
      ? 'تعطّل محرك عرض الصفحة وتمت استعادته تلقائيًا.'
      : 'أوقف Android محرك عرض الصفحة وتمت استعادته تلقائيًا.');
    setWebKey((value) => value + 1);
  };

  const go = () => {
    try {
      const next = normalizeInput(input);
      setLoadError('');
      setMediaUrls([]);
      setUrl(next);
      setAddressFocused(false);
    } catch {
      Alert.alert('RAID', 'تعذر فهم العنوان أو عبارة البحث.');
    }
  };

  const changed = async (nav: WebViewNavigation) => {
    setCanBack(nav.canGoBack);
    setCanForward(nav.canGoForward);
    setTitle(nav.title || nav.url);
    setLoadedUrl(nav.url);
    if (isDirectMediaUrl(nav.url)) setMediaUrls([nav.url]);
    if (!addressFocused) setInput(nav.url);
    try { setBookmarked(await isBookmarked(nav.url)); } catch { setBookmarked(false); }
    if (!privateMode && safeExternalUrl(nav.url) && !nav.loading) {
      const persistKey = `${nav.url}\n${nav.title || ''}`;
      if (lastPersistedNavigation.current === persistKey) return;
      lastPersistedNavigation.current = persistKey;
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
      setLoadProgress(0);
      return;
    }
    setLoadError('');
    web.current?.reload();
  };

  const openVpn = () => {
    setMenuOpen(false);
    router.push('/vpn');
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

  const scanMedia = () => web.current?.injectJavaScript(MEDIA_SCAN_JS);

  const onMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    if (raw.startsWith('RAID_MEDIA:')) {
      try {
        const parsed = JSON.parse(raw.slice('RAID_MEDIA:'.length));
        if (Array.isArray(parsed)) {
          const safe = parsed.filter((item): item is string => typeof item === 'string' && /^https?:\/\//i.test(item));
          setMediaUrls(Array.from(new Set(safe)).slice(0, 12));
        }
      } catch {}
      return;
    }
    if (raw === 'RAID_MEDIA_STATUS:NO_VIDEO') {
      Alert.alert('RAID Media Player', 'لم يعثر المتصفح على عنصر فيديو مباشر في هذه الصفحة. إذا كان المشغل داخل إطار خارجي مثل MEGA أو TeraBox فشغّله من الصفحة أو استخدم خيار الفتح الخارجي.');
      return;
    }
    if (raw === 'RAID_MEDIA_STATUS:FAILED') {
      Alert.alert('RAID Media Player', 'تعذر تشغيل فيديو الصفحة مباشرة.');
      return;
    }
    const page = parsePageContext(raw);
    if (page && !privateMode) {
      setPageContext(page.url, page.title, page.text).catch(() => {});
      return;
    }
    const payload = parseReaderMessage(raw);
    if (payload) setReader(payload);
  };

  const openMediaPlayer = () => {
    setMenuOpen(false);
    const candidate = mediaUrls.find(isDirectMediaUrl) || (isDirectMediaUrl(loadedUrl) ? loadedUrl : '');
    if (candidate) {
      setMediaUrl(candidate);
      setMediaOpen(true);
      return;
    }
    scanMedia();
    web.current?.injectJavaScript(PLAY_PAGE_VIDEO_JS);
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
  const addressValue = addressFocused ? input : host;
  const playerHtml = useMemo(() => mediaUrl ? mediaPlayerHtml(mediaUrl) : '', [mediaUrl]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.top}>
        <Pressable onPress={goHome} style={styles.icon} accessibilityRole="button" accessibilityLabel="الصفحة الرئيسية"><Text style={styles.iconGlyph}>⌂</Text></Pressable>
        <View style={styles.omni}>
          <Pressable onPress={() => setSiteInfoOpen(true)} accessibilityRole="button" accessibilityLabel="معلومات الموقع" style={styles.securityButton}>
            <Text style={[styles.security, insecureHttp && styles.insecure]}>{secure ? '●' : insecureHttp ? '!' : '○'}</Text>
          </Pressable>
          <TextInput
            value={addressValue}
            onFocus={() => { setAddressFocused(true); setInput(loadedUrl); }}
            onBlur={() => setAddressFocused(false)}
            onChangeText={setInput}
            onSubmitEditing={go}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            selectTextOnFocus
            accessibilityLabel="شريط العنوان والبحث"
            returnKeyType="go"
            placeholder="ابحث أو اكتب عنوان موقع"
            placeholderTextColor="#64748B"
          />
        </View>
        <Pressable onPress={() => router.push('/tabs')} style={styles.icon} accessibilityRole="button" accessibilityLabel="التبويبات"><Text style={styles.tabGlyph}>▣</Text></Pressable>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.icon} accessibilityRole="button" accessibilityLabel="قائمة وإعدادات المتصفح"><Text style={styles.menuGlyph}>☰</Text></Pressable>
      </View>

      {privateMode && <View style={styles.private}><Text style={styles.privateText}>وضع خاص • لا سجل • لا سياق للذكاء الاصطناعي</Text></View>}
      {!!rendererNotice && <View style={styles.rendererNotice} accessibilityRole="alert"><Text style={styles.rendererNoticeText}>{rendererNotice}</Text></View>}
      {loading && <View style={styles.progressTrack} accessibilityLabel={`جار تحميل الصفحة ${Math.round(loadProgress * 100)} بالمئة`}><View style={[styles.progress, { width: `${Math.max(4, Math.round(loadProgress * 100))}%` }]} /></View>}

      <View style={styles.webWrap}>
        <WebView
          key={webKey}
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
          onLoadStart={() => { setLoading(true); setLoadProgress(0.05); setLoadError(''); setMediaUrls([]); }}
          onLoadProgress={(event) => setLoadProgress(event.nativeEvent.progress)}
          onLoadEnd={() => { setLoading(false); setLoadProgress(1); captureContext(); scanMedia(); }}
          onError={(event) => {
            setLoading(false);
            setLoadProgress(0);
            setLoadError(event.nativeEvent.description || 'تعذر تحميل الصفحة');
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 400) setLoadError(`خطأ HTTP ${event.nativeEvent.statusCode}`);
          }}
          onRenderProcessGone={(event) => recoverRenderer(Boolean(event.nativeEvent.didCrash))}
          onShouldStartLoadWithRequest={(request) => shouldLoad(request.url)}
          onMessage={onMessage}
        />
        {loadError ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Text style={styles.errorTitle}>تعذر فتح الصفحة</Text>
            <Text style={styles.errorHost}>{host}</Text>
            <Text style={styles.errorText} numberOfLines={3}>{loadError}</Text>
            <View style={styles.errorActions}>
              <Pressable onPress={() => { rendererFailures.current = []; setLoadError(''); setWebKey((value) => value + 1); }} style={styles.retryBtn} accessibilityRole="button"><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>
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
        <Pressable onPress={openVpn} style={[styles.vpn, vpnConnected && styles.vpnOn]} accessibilityRole="button" accessibilityLabel={vpnConnected ? 'RAID VPN متصل، فتح الحالة' : 'RAID VPN غير متصل، فتح الإعداد'}><Text style={styles.vpnText}>{vpnConnected ? 'VPN ✓' : 'VPN'}</Text></Pressable>
        <Pressable disabled={privateMode} onPress={openAI} style={[styles.ai, privateMode && styles.aiDisabled]} accessibilityRole="button" accessibilityLabel="RAID AI"><Text style={styles.aiText}>AI</Text></Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.overlay, { paddingTop: insets.top + 62 }]} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>RAID Browser</Text>
              <Text numberOfLines={1} style={styles.menuHost}>{host}</Text>
            </View>
            <Pressable style={styles.menuItem} onPress={toggleBookmark}><Text style={styles.menuIcon}>{bookmarked ? '★' : '☆'}</Text><Text style={styles.menuText}>{bookmarked ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openMediaPlayer}><Text style={styles.menuIcon}>▶</Text><Text style={styles.menuText}>{mediaUrls.length ? `RAID Media Player • ${mediaUrls.length}` : 'تشغيل فيديو الصفحة'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openReader}><Text style={styles.menuIcon}>Aa</Text><Text style={styles.menuText}>وضع القراءة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={toggleDesktop}><Text style={styles.menuIcon}>▣</Text><Text style={styles.menuText}>{desktopMode ? 'عرض الهاتف' : 'عرض سطح المكتب'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={shareCurrent}><Text style={styles.menuIcon}>↗</Text><Text style={styles.menuText}>مشاركة الصفحة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openExternal}><Text style={styles.menuIcon}>◇</Text><Text style={styles.menuText}>فتح خارج RAID</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setSiteInfoOpen(true); }}><Text style={styles.menuIcon}>i</Text><Text style={styles.menuText}>معلومات وأمان الموقع</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openVpn}><Text style={styles.menuIcon}>V</Text><Text style={styles.menuText}>{vpnConnected ? 'RAID VPN • متصل' : 'RAID VPN'}</Text></Pressable>
            {!privateMode && <Pressable style={styles.menuItem} onPress={openAI}><Text style={styles.menuIcon}>AI</Text><Text style={styles.menuText}>اسأل RAID AI عن الصفحة</Text></Pressable>}
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/history'); }}><Text style={styles.menuIcon}>↶</Text><Text style={styles.menuText}>السجل</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/bookmarks'); }}><Text style={styles.menuIcon}>◆</Text><Text style={styles.menuText}>المفضلة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/settings'); }}><Text style={styles.menuIcon}>⚙</Text><Text style={styles.menuText}>الإعدادات</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={siteInfoOpen} transparent animationType="fade" onRequestClose={() => setSiteInfoOpen(false)}>
        <Pressable style={styles.centerOverlay} onPress={() => setSiteInfoOpen(false)}>
          <Pressable style={styles.siteCard} onPress={() => {}}>
            <Text style={styles.siteTitle}>أمان الموقع</Text>
            <Text style={[styles.siteState, insecureHttp && styles.siteWarn]}>{secure ? 'اتصال HTTPS مشفّر' : insecureHttp ? 'اتصال HTTP غير مشفّر' : 'صفحة خاصة'}</Text>
            <Text numberOfLines={2} style={styles.siteHost}>{host}</Text>
            <Text style={styles.siteBody}>{secure ? 'الاتصال بين المتصفح والموقع يستخدم HTTPS. هذا لا يعني أن محتوى الموقع موثوق تلقائيًا.' : insecureHttp ? 'لا ترسل كلمات مرور أو بيانات حساسة عبر هذا الاتصال.' : 'لا تتوفر معلومات HTTPS لهذه الصفحة.'}</Text>
            <Pressable onPress={() => setSiteInfoOpen(false)} style={styles.siteClose}><Text style={styles.siteCloseText}>تم</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={mediaOpen} animationType="slide" onRequestClose={() => setMediaOpen(false)}>
        <SafeAreaView style={styles.mediaRoot} edges={['top','bottom','left','right']}>
          <View style={styles.mediaTop}>
            <Pressable onPress={() => setMediaOpen(false)} style={styles.mediaClose}><Text style={styles.mediaCloseText}>×</Text></Pressable>
            <View style={styles.mediaHeading}><Text style={styles.mediaTitle}>RAID Media Player</Text><Text numberOfLines={1} style={styles.mediaHost}>{hostOf(mediaUrl)}</Text></View>
            <Pressable onPress={() => Linking.openURL(mediaUrl).catch(() => {})} style={styles.mediaExternal}><Text style={styles.mediaExternalText}>خارجي</Text></Pressable>
          </View>
          {!!mediaUrl && <WebView
            source={{ html: playerHtml, baseUrl: loadedUrl }}
            style={styles.mediaWeb}
            javaScriptEnabled
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['http://*','https://*','about:blank']}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
          />}
          {mediaUrls.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaSources}>
            {mediaUrls.map((candidate, index) => <Pressable key={`${candidate}-${index}`} onPress={() => setMediaUrl(candidate)} style={[styles.mediaSource, candidate === mediaUrl && styles.mediaSourceOn]}><Text style={styles.mediaSourceText}>مصدر {index + 1}</Text></Pressable>)}
          </ScrollView>}
        </SafeAreaView>
      </Modal>

      <Modal visible={!!reader} animationType="slide" onRequestClose={() => setReader(null)}>
        <SafeAreaView style={[styles.readerRoot, readerDark ? styles.readerDark : styles.readerLight]} edges={['top','bottom']}>
          <View style={styles.readerTop}>
            <Pressable onPress={() => setReader(null)} style={styles.readerBtn}><Text style={styles.readerBtnText}>×</Text></Pressable>
            <Text style={[styles.readerTitle, !readerDark && styles.readerInk]} numberOfLines={1}>{reader?.title || 'وضع القراءة'}</Text>
            <Pressable onPress={() => setReaderDark(v => !v)} style={styles.readerBtn}><Text style={styles.readerBtnText}>{readerDark ? '☀' : '☾'}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.readerContent}>
            <Text style={[styles.readerHeadline, !readerDark && styles.readerInk]}>{reader?.title}</Text>
            <Text style={[styles.readerBody, {fontSize, lineHeight: fontSize * 1.75}, !readerDark && styles.readerInk]}>{reader?.text}</Text>
          </ScrollView>
          <View style={styles.readerTools}>
            <Pressable onPress={() => setFontSize(v => Math.max(15, v-2))} style={styles.readerTool}><Text style={styles.readerToolText}>A−</Text></Pressable>
            <Pressable onPress={() => setFontSize(v => Math.min(30, v+2))} style={styles.readerTool}><Text style={styles.readerToolText}>A+</Text></Pressable>
            <Pressable onPress={speakReader} style={styles.readerTool}><Text style={styles.readerToolText}>استماع</Text></Pressable>
            <Pressable onPress={stopSpeech} style={styles.readerTool}><Text style={styles.readerToolText}>إيقاف</Text></Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},
  top:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:6,backgroundColor:'#0A1020',borderBottomWidth:1,borderBottomColor:'#162033'},
  icon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#101827'},iconGlyph:{fontSize:21,color:'#E5E7EB'},tabGlyph:{fontSize:19,color:'#CBD5E1'},menuGlyph:{fontSize:18,color:'#CBD5E1'},
  omni:{flex:1,height:42,borderRadius:16,backgroundColor:'#111827',flexDirection:'row',alignItems:'center',paddingHorizontal:9,borderWidth:1,borderColor:'#202A3B'},securityButton:{width:28,height:38,alignItems:'center',justifyContent:'center'},security:{fontSize:15,color:'#34D399'},insecure:{color:'#F59E0B'},input:{flex:1,color:'#F8FAFC',fontSize:14,paddingVertical:0,textAlign:'left'},
  private:{paddingVertical:6,paddingHorizontal:12,backgroundColor:'#281A3A'},privateText:{color:'#D8B4FE',fontSize:11,textAlign:'center',fontWeight:'700'},rendererNotice:{paddingVertical:7,paddingHorizontal:12,backgroundColor:'#172554',borderBottomWidth:1,borderBottomColor:'#1E3A8A'},rendererNoticeText:{color:'#BFDBFE',fontSize:11,textAlign:'center',fontWeight:'800'},
  progressTrack:{height:3,backgroundColor:'#111827',overflow:'hidden'},progress:{height:3,backgroundColor:'#8B5CF6'},webWrap:{flex:1,backgroundColor:'#fff'},web:{flex:1},
  errorCard:{position:'absolute',left:20,right:20,top:26,padding:22,borderRadius:22,backgroundColor:'#0F172A',borderWidth:1,borderColor:'#273449',shadowColor:'#000',shadowOpacity:.22,shadowRadius:14,elevation:8},errorTitle:{color:'#fff',fontSize:20,fontWeight:'900',textAlign:'center'},errorHost:{color:'#A78BFA',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:6},errorText:{color:'#CBD5E1',fontSize:13,lineHeight:19,textAlign:'center',marginTop:10},errorActions:{flexDirection:'row-reverse',gap:10,marginTop:18},retryBtn:{flex:1,minHeight:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},retryText:{color:'#fff',fontWeight:'900'},errorSecondary:{flex:1,minHeight:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},errorSecondaryText:{color:'#CBD5E1',fontWeight:'800'},
  bottom:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:7,backgroundColor:'#0A1020',borderTopWidth:1,borderTopColor:'#162033'},nav:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},navText:{fontSize:34,color:'#E2E8F0',marginTop:-5},disabled:{opacity:.25},navPrimary:{width:44,height:44,borderRadius:16,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},navPrimaryText:{color:'#fff',fontSize:24},star:{fontSize:26,color:'#CBD5E1'},starOn:{color:'#FBBF24'},vpn:{minWidth:48,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#182033',paddingHorizontal:7},vpnOn:{backgroundColor:'#0F513F'},vpnText:{fontSize:10,fontWeight:'900',color:'#D1FAE5'},ai:{width:42,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#5B21B6'},aiDisabled:{opacity:.3},aiText:{fontSize:11,fontWeight:'900',color:'#fff'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.42)',alignItems:'flex-end',paddingHorizontal:12},menuCard:{width:285,maxWidth:'88%',borderRadius:22,backgroundColor:'#101827',borderWidth:1,borderColor:'#263247',overflow:'hidden'},menuHeader:{paddingHorizontal:17,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#263247'},menuTitle:{color:'#fff',fontSize:16,fontWeight:'900'},menuHost:{color:'#94A3B8',fontSize:11,marginTop:3},menuItem:{minHeight:48,flexDirection:'row',alignItems:'center',paddingHorizontal:15,gap:12},menuIcon:{width:30,textAlign:'center',color:'#A78BFA',fontWeight:'900'},menuText:{flex:1,color:'#E5E7EB',fontSize:14,fontWeight:'700'},menuDivider:{height:1,backgroundColor:'#263247',marginVertical:3},
  centerOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.55)',alignItems:'center',justifyContent:'center',padding:22},siteCard:{width:'100%',maxWidth:420,borderRadius:25,padding:24,backgroundColor:'#111827',borderWidth:1,borderColor:'#273449'},siteTitle:{color:'#fff',fontSize:21,fontWeight:'900',textAlign:'center'},siteState:{color:'#34D399',fontSize:14,fontWeight:'900',textAlign:'center',marginTop:12},siteWarn:{color:'#F59E0B'},siteHost:{color:'#C4B5FD',fontSize:12,textAlign:'center',marginTop:7},siteBody:{color:'#CBD5E1',fontSize:13,lineHeight:20,textAlign:'center',marginTop:14},siteClose:{height:48,borderRadius:15,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center',marginTop:20},siteCloseText:{color:'#fff',fontWeight:'900'},
  mediaRoot:{flex:1,backgroundColor:'#05070C'},mediaTop:{height:62,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,backgroundColor:'#0A1020',borderBottomWidth:1,borderBottomColor:'#1E293B'},mediaClose:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},mediaCloseText:{color:'#fff',fontSize:25,fontWeight:'900'},mediaHeading:{flex:1},mediaTitle:{color:'#fff',fontSize:15,fontWeight:'900'},mediaHost:{color:'#94A3B8',fontSize:11,marginTop:2},mediaExternal:{height:38,minWidth:58,paddingHorizontal:11,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#5B21B6'},mediaExternalText:{color:'#fff',fontSize:11,fontWeight:'900'},mediaWeb:{flex:1,backgroundColor:'#000'},mediaSources:{paddingHorizontal:10,paddingVertical:8,gap:7,backgroundColor:'#0A1020'},mediaSource:{height:36,paddingHorizontal:13,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},mediaSourceOn:{backgroundColor:'#5B21B6'},mediaSourceText:{color:'#fff',fontSize:11,fontWeight:'800'},
  readerRoot:{flex:1},readerDark:{backgroundColor:'#0C1018'},readerLight:{backgroundColor:'#F6F1E7'},readerTop:{height:62,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10,borderBottomWidth:1,borderBottomColor:'#334155'},readerBtn:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerBtnText:{color:'#fff',fontSize:22,fontWeight:'800'},readerTitle:{flex:1,color:'#fff',fontSize:15,fontWeight:'800'},readerInk:{color:'#241F1A'},readerContent:{paddingHorizontal:24,paddingTop:26,paddingBottom:80,maxWidth:760,width:'100%',alignSelf:'center'},readerHeadline:{fontSize:28,lineHeight:38,color:'#F8FAFC',fontWeight:'900',marginBottom:22,textAlign:'right'},readerBody:{color:'#E2E8F0',textAlign:'right'},readerTools:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderTopWidth:1,borderTopColor:'#334155'},readerTool:{minWidth:58,height:42,borderRadius:13,backgroundColor:'#1E293B',alignItems:'center',justifyContent:'center',paddingHorizontal:9},readerToolText:{color:'#fff',fontWeight:'800',fontSize:12}
});