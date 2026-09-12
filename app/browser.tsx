import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { addBookmark, addHistory, createBrowserTab, isBookmarked, removeBookmark, setPageContext, updateBrowserTab } from '@/lib/db';
import { normalizeInput, safeExternalUrl } from '@/lib/url';
import { parseReaderMessage, READER_EXTRACT_JS, ReaderPayload } from '@/lib/reader';
import { PAGE_CONTEXT_JS, parsePageContext } from '@/lib/context';
import { isVpnConnected } from '@/lib/vpn';
import { DEFAULT_SITE_PREFERENCES, getSitePreferences, resetSitePreferences, saveSitePreferences, type SitePreferences } from '@/lib/site-preferences';
import { routeBrowserDownload } from '@/features/downloads/browser-download';

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const RENDERER_RECOVERY_WINDOW_MS = 30_000;
const MAX_RENDERER_RECOVERIES = 2;
const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;
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
const SILENT_STREAM_ASSIST_JS = `(() => {
  try {
    const report = () => {
      const videos = Array.from(document.querySelectorAll('video'));
      const urls = [];
      const push = (value) => {
        if (!value || typeof value !== 'string') return;
        try {
          const absolute = new URL(value, location.href).href;
          if (/^https?:/i.test(absolute) && !urls.includes(absolute)) urls.push(absolute);
        } catch {}
      };
      videos.forEach((video) => {
        video.setAttribute('playsinline', '');
        push(video.currentSrc);
        push(video.src);
        video.querySelectorAll('source').forEach((source) => push(source.src));
        if (video.paused) {
          const result = video.play();
          if (result && typeof result.catch === 'function') result.catch(() => {});
        }
      });
      if (urls.length) window.ReactNativeWebView?.postMessage('RAID_MEDIA:' + JSON.stringify(urls.slice(0, 12)));
    };
    report();
    if (!window.__raidMediaObserver) {
      let timer = 0;
      window.__raidMediaObserver = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(report, 180);
      });
      window.__raidMediaObserver.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
  } catch {}
  true;
})();`;
const DOWNLOAD_CAPTURE_JS = `(() => {
  try {
    if (window.__raidDownloadCaptureInstalled) return true;
    window.__raidDownloadCaptureInstalled = true;
    const fileRe = /\.(?:apk|aab|zip|rar|7z|pdf|docx?|xlsx?|pptx?|csv|txt|exe|msi|dmg|deb|rpm|iso|tar|gz|tgz|bz2|xz|mp3|wav|flac|ogg)(?:$|[?#])/i;
    const mediaRe = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
    document.addEventListener('click', (event) => {
      try {
        const target = event.target;
        const anchor = target && target.closest ? target.closest('a[href]') : null;
        if (!anchor) return;
        const raw = anchor.href || anchor.getAttribute('href') || '';
        if (!raw) return;
        const absolute = new URL(raw, location.href).href;
        if (!/^https:\/\//i.test(absolute) || mediaRe.test(absolute)) return;
        const explicit = anchor.hasAttribute('download');
        if (!explicit && !fileRe.test(absolute)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        window.ReactNativeWebView?.postMessage('RAID_DOWNLOAD:' + absolute);
      } catch {}
    }, true);
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

function isLikelyStreamPage(value: string) {
  try {
    const parsed = new URL(value);
    return /^https?:$/i.test(parsed.protocol) && STREAM_PAGE_RE.test(parsed.pathname + parsed.search + parsed.hash);
  } catch { return false; }
}

function mediaPlayerHtml(mediaUrl: string) {
  const source = JSON.stringify(mediaUrl).replace(/</g, '\\u003c');
  return `<!doctype html>
<html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
html,body{margin:0;width:100%;height:100%;background:#05070c;color:#fff;font-family:sans-serif}body{display:flex;align-items:center;justify-content:center}video{width:100%;height:100%;background:#000;object-fit:contain}.msg{position:fixed;left:16px;right:16px;bottom:18px;background:rgba(15,23,42,.88);padding:10px 14px;border-radius:12px;text-align:center;font-size:12px;color:#cbd5e1}
</style></head><body><video id="raidVideo" controls autoplay playsinline webkit-playsinline></video><div id="msg" class="msg">RAID Media Player</div><script>
const video=document.getElementById('raidVideo'); const msg=document.getElementById('msg'); const src=${source}; video.src=src;
video.addEventListener('playing',()=>{msg.style.display='none'}); video.addEventListener('error',()=>{msg.textContent='تعذر تشغيل هذا المصدر مباشرة داخل RAID. ارجع إلى صفحة المشاهدة وحاول تشغيل المشغل الموجود فيها.'});
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
  const [sitePrefs, setSitePrefs] = useState<SitePreferences>({ ...DEFAULT_SITE_PREFERENCES });
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

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (reader) { setReader(null); return true; }
      if (mediaOpen) { setMediaOpen(false); return true; }
      if (siteInfoOpen) { setSiteInfoOpen(false); return true; }
      if (menuOpen) { setMenuOpen(false); return true; }
      if (canBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [canBack, mediaOpen, menuOpen, reader, siteInfoOpen]));

  useEffect(() => {
    let alive = true;
    void getSitePreferences(loadedUrl)
      .then((prefs) => { if (alive) setSitePrefs(prefs); })
      .catch(() => { if (alive) setSitePrefs({ ...DEFAULT_SITE_PREFERENCES }); });
    return () => { alive = false; };
  }, [loadedUrl]);

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

  const openDownloads = () => {
    setMenuOpen(false);
    router.push('/downloads');
  };

  const updateSitePreference = async (patch: Partial<SitePreferences>, reload = false) => {
    const next = { ...sitePrefs, ...patch };
    setSitePrefs(next);
    if (!privateMode) await saveSitePreferences(loadedUrl, next).catch(() => {});
    if (reload) setWebKey((value) => value + 1);
  };

  const toggleDesktop = () => {
    setMenuOpen(false);
    void updateSitePreference({ desktopMode: !sitePrefs.desktopMode }, true);
  };

  const resetCurrentSite = async () => {
    if (!privateMode) await resetSitePreferences(loadedUrl).catch(() => {});
    setSitePrefs({ ...DEFAULT_SITE_PREFERENCES });
    setWebKey((value) => value + 1);
  };

  const openReader = () => {
    setMenuOpen(false);
    web.current?.injectJavaScript(READER_EXTRACT_JS);
  };

  const captureContext = () => {
    if (!privateMode) web.current?.injectJavaScript(PAGE_CONTEXT_JS);
  };

  const scanMedia = () => web.current?.injectJavaScript(MEDIA_SCAN_JS);

  const openInlineMedia = (candidate: string) => {
    if (!/^https?:\/\//i.test(candidate)) return;
    setMediaUrl(candidate);
    setMediaUrls((current) => current.includes(candidate) ? current : [candidate, ...current].slice(0, 12));
    setMediaOpen(true);
  };

  const handleFileDownload = (downloadUrl: string) => {
    void routeBrowserDownload(downloadUrl, loadedUrl)
      .then((result) => {
        if (result.kind === 'media') {
          openInlineMedia(result.url);
          return;
        }
        if (result.kind === 'blocked') {
          Alert.alert('RAID Downloads', result.reason);
          return;
        }
        Alert.alert(
          'بدأ التنزيل داخل RAID',
          'يمكنك متابعة التصفح ومراقبة السرعة والحجم والوقت المتبقي من مدير تنزيلات RAID.',
          [
            { text: 'متابعة', style: 'cancel' },
            { text: 'فتح التنزيلات', onPress: openDownloads },
          ],
        );
      })
      .catch((error) => Alert.alert('RAID Downloads', error instanceof Error ? error.message : 'تعذر بدء التنزيل.'));
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    if (raw.startsWith('RAID_DOWNLOAD:')) {
      const candidate = raw.slice('RAID_DOWNLOAD:'.length).trim();
      if (/^https:\/\//i.test(candidate)) handleFileDownload(candidate);
      return;
    }
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
      Alert.alert('RAID Media Player', 'لم يعثر RAID على عنصر فيديو مباشر بعد. أبقِ صفحة المشاهدة مفتوحة وشغّل مشغل الموقع من داخل المتصفح.');
      return;
    }
    if (raw === 'RAID_MEDIA_STATUS:FAILED') {
      Alert.alert('RAID Media Player', 'تعذر تشغيل فيديو الصفحة مباشرة داخل RAID.');
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

  const goHome = () => router.replace('/');

  const shouldLoad = (requestUrl: string) => {
    if (isDirectMediaUrl(requestUrl)) {
      setMediaUrl(requestUrl);
      setMediaUrls((current) => current.includes(requestUrl) ? current : [requestUrl, ...current].slice(0, 12));
      setMediaOpen(true);
      return false;
    }
    if (safeExternalUrl(requestUrl)) return true;
    if (/^(mailto:|tel:|sms:)/i.test(requestUrl)) Linking.openURL(requestUrl).catch(() => {});
    return false;
  };

  const secure = loadedUrl.startsWith('https://');
  const insecureHttp = loadedUrl.startsWith('http://');
  const host = hostOf(loadedUrl);
  const addressValue = addressFocused ? input : host;
  const playerHtml = useMemo(() => mediaUrl ? mediaPlayerHtml(mediaUrl) : '', [mediaUrl]);
  const hasCustomSitePrefs = sitePrefs.desktopMode || !sitePrefs.thirdPartyCookies || !sitePrefs.autoplayMedia;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.top}>
        <Pressable onPress={goHome} style={styles.icon} accessibilityRole="button" accessibilityLabel="الصفحة الرئيسية"><Ionicons name="home-outline" size={20} color="#E5E7EB" /></Pressable>
        <View style={styles.omni}>
          <Pressable onPress={() => setSiteInfoOpen(true)} accessibilityRole="button" accessibilityLabel="معلومات الموقع" style={styles.securityButton}>
            <Ionicons name={secure ? 'lock-closed' : insecureHttp ? 'warning' : 'information-circle'} size={16} color={insecureHttp ? '#F59E0B' : '#34D399'} />
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
          {hasCustomSitePrefs && <View style={styles.siteBadge}><Ionicons name="options" size={12} color="#D5AA88" /></View>}
        </View>
        <Pressable onPress={() => router.push('/tabs')} style={styles.icon} accessibilityRole="button" accessibilityLabel="التبويبات"><Ionicons name="albums-outline" size={20} color="#CBD5E1" /></Pressable>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.icon} accessibilityRole="button" accessibilityLabel="قائمة وإعدادات المتصفح"><Ionicons name="menu" size={22} color="#CBD5E1" /></Pressable>
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
          thirdPartyCookiesEnabled={!privateMode && sitePrefs.thirdPartyCookies}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={!sitePrefs.autoplayMedia}
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          userAgent={sitePrefs.desktopMode ? DESKTOP_UA : undefined}
          originWhitelist={['http://*', 'https://*']}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          injectedJavaScriptBeforeContentLoaded={DOWNLOAD_CAPTURE_JS}
          onNavigationStateChange={changed}
          onLoadStart={() => { setLoading(true); setLoadProgress(0.05); setLoadError(''); setMediaUrls([]); }}
          onLoadProgress={(event) => setLoadProgress(event.nativeEvent.progress)}
          onLoadEnd={(event) => {
            setLoading(false);
            setLoadProgress(1);
            captureContext();
            scanMedia();
            web.current?.injectJavaScript(DOWNLOAD_CAPTURE_JS);
            if (isLikelyStreamPage(event.nativeEvent.url)) {
              web.current?.injectJavaScript(SILENT_STREAM_ASSIST_JS);
              setTimeout(() => web.current?.injectJavaScript(SILENT_STREAM_ASSIST_JS), 900);
              setTimeout(() => web.current?.injectJavaScript(MEDIA_SCAN_JS), 1800);
            }
          }}
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
          onFileDownload={(event) => handleFileDownload(event.nativeEvent.downloadUrl || '')}
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
        <Pressable disabled={!canBack} onPress={() => web.current?.goBack()} style={styles.nav} accessibilityRole="button" accessibilityLabel="رجوع"><Ionicons name="chevron-back" size={28} color="#E2E8F0" style={!canBack && styles.disabled} /></Pressable>
        <Pressable disabled={!canForward} onPress={() => web.current?.goForward()} style={styles.nav} accessibilityRole="button" accessibilityLabel="تقدم"><Ionicons name="chevron-forward" size={28} color="#E2E8F0" style={!canForward && styles.disabled} /></Pressable>
        <Pressable onPress={reloadOrStop} style={styles.navPrimary} accessibilityRole="button" accessibilityLabel={loading ? 'إيقاف التحميل' : 'تحديث'}><Ionicons name={loading ? 'close' : 'refresh'} size={22} color="#fff" /></Pressable>
        <Pressable onPress={toggleBookmark} style={styles.nav} accessibilityRole="button" accessibilityLabel={bookmarked ? 'إزالة المفضلة' : 'إضافة للمفضلة'}><Ionicons name={bookmarked ? 'star' : 'star-outline'} size={24} color={bookmarked ? '#FBBF24' : '#CBD5E1'} /></Pressable>
        <Pressable onPress={openVpn} style={[styles.vpn, vpnConnected && styles.vpnOn]} accessibilityRole="button" accessibilityLabel={vpnConnected ? 'RAID VPN متصل، فتح الحالة' : 'RAID VPN غير متصل، فتح الإعداد'}><Ionicons name={vpnConnected ? 'shield-checkmark' : 'shield-outline'} size={14} color="#D1FAE5" /><Text style={styles.vpnText}>VPN</Text></Pressable>
        <Pressable disabled={privateMode} onPress={openAI} style={[styles.ai, privateMode && styles.aiDisabled]} accessibilityRole="button" accessibilityLabel="RAID AI"><Text style={styles.aiText}>AI</Text></Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.overlay, { paddingTop: insets.top + 62 }]} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>RAID Browser</Text>
              <Text numberOfLines={1} style={styles.menuHost}>{host}</Text>
            </View>
            <Pressable style={styles.menuItem} onPress={toggleBookmark}><Ionicons name={bookmarked ? 'star' : 'star-outline'} size={19} color="#D5AA88" /><Text style={styles.menuText}>{bookmarked ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openMediaPlayer}><Ionicons name="play-circle-outline" size={20} color="#D5AA88" /><Text style={styles.menuText}>{mediaUrls.length ? `RAID Media Player • ${mediaUrls.length}` : 'تشغيل فيديو الصفحة'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openReader}><Ionicons name="reader-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>وضع القراءة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={toggleDesktop}><Ionicons name={sitePrefs.desktopMode ? 'phone-portrait-outline' : 'desktop-outline'} size={19} color="#D5AA88" /><Text style={styles.menuText}>{sitePrefs.desktopMode ? 'عرض الهاتف لهذا الموقع' : 'عرض سطح المكتب لهذا الموقع'}</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openDownloads}><Ionicons name="download-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>التنزيلات</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={shareCurrent}><Ionicons name="share-social-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>مشاركة الصفحة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setSiteInfoOpen(true); }}><Ionicons name="options-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>أمان وإعدادات الموقع</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={openVpn}><Ionicons name={vpnConnected ? 'shield-checkmark' : 'shield-outline'} size={19} color="#D5AA88" /><Text style={styles.menuText}>{vpnConnected ? 'RAID VPN • متصل' : 'RAID VPN'}</Text></Pressable>
            {!privateMode && <Pressable style={styles.menuItem} onPress={openAI}><Ionicons name="sparkles-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>اسأل RAID AI عن الصفحة</Text></Pressable>}
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/history'); }}><Ionicons name="time-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>السجل</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/bookmarks'); }}><Ionicons name="bookmark-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>المفضلة</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/settings'); }}><Ionicons name="settings-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>الإعدادات</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={siteInfoOpen} transparent animationType="fade" onRequestClose={() => setSiteInfoOpen(false)}>
        <Pressable style={styles.centerOverlay} onPress={() => setSiteInfoOpen(false)}>
          <Pressable style={styles.siteCard} onPress={() => {}}>
            <View style={styles.siteHeaderIcon}><Ionicons name={secure ? 'lock-closed' : 'warning-outline'} size={22} color={secure ? '#7FB890' : '#D8A56F'} /></View>
            <Text style={styles.siteTitle}>أمان وإعدادات الموقع</Text>
            <Text style={[styles.siteState, insecureHttp && styles.siteWarn]}>{secure ? 'اتصال HTTPS مشفّر' : insecureHttp ? 'اتصال HTTP غير مشفّر' : 'صفحة خاصة'}</Text>
            <Text numberOfLines={2} style={styles.siteHost}>{host}</Text>
            <Text style={styles.siteBody}>{secure ? 'الاتصال بين المتصفح والموقع يستخدم HTTPS. إعدادات هذا النطاق محفوظة محليًا على جهازك.' : insecureHttp ? 'لا ترسل كلمات مرور أو بيانات حساسة عبر هذا الاتصال.' : 'لا تتوفر معلومات HTTPS لهذه الصفحة.'}</Text>

            <View style={styles.siteControls}>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>عرض سطح المكتب</Text><Text style={styles.siteControlHint}>يتذكر RAID هذا الاختيار لهذا الموقع</Text></View><Switch value={sitePrefs.desktopMode} onValueChange={(value) => void updateSitePreference({ desktopMode: value }, true)} trackColor={{false:'#3B4247',true:'#8C6D58'}} thumbColor="#F4EEE8" /></View>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>كوكيز الطرف الثالث</Text><Text style={styles.siteControlHint}>عطّلها لهذا الموقع لخصوصية أعلى</Text></View><Switch value={!privateMode && sitePrefs.thirdPartyCookies} disabled={privateMode} onValueChange={(value) => void updateSitePreference({ thirdPartyCookies: value }, true)} trackColor={{false:'#3B4247',true:'#8C6D58'}} thumbColor="#F4EEE8" /></View>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>تشغيل الوسائط تلقائيًا</Text><Text style={styles.siteControlHint}>تحكم مستقل بكل موقع</Text></View><Switch value={sitePrefs.autoplayMedia} onValueChange={(value) => void updateSitePreference({ autoplayMedia: value })} trackColor={{false:'#3B4247',true:'#8C6D58'}} thumbColor="#F4EEE8" /></View>
            </View>

            {privateMode && <Text style={styles.privateSiteNote}>الوضع الخاص لا يحفظ تغييرات إعدادات الموقع بعد إغلاق الجلسة.</Text>}
            {hasCustomSitePrefs && <Pressable onPress={() => void resetCurrentSite()} style={styles.siteReset}><Ionicons name="refresh-outline" size={17} color="#D5AA88" /><Text style={styles.siteResetText}>إعادة إعدادات هذا الموقع</Text></Pressable>}
            <Pressable onPress={() => setSiteInfoOpen(false)} style={styles.siteClose}><Text style={styles.siteCloseText}>تم</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={mediaOpen} animationType="slide" onRequestClose={() => setMediaOpen(false)}>
        <SafeAreaView style={styles.mediaRoot} edges={['top','bottom','left','right']}>
          <View style={styles.mediaTop}>
            <Pressable onPress={() => setMediaOpen(false)} style={styles.mediaClose}><Text style={styles.mediaCloseText}>×</Text></Pressable>
            <View style={styles.mediaHeading}><Text style={styles.mediaTitle}>RAID Media Player</Text><Text numberOfLines={1} style={styles.mediaHost}>{hostOf(mediaUrl)}</Text></View>
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
            <Pressable onPress={() => setReaderDark(v => !v)} style={styles.readerBtn}><Ionicons name={readerDark ? 'sunny-outline' : 'moon-outline'} size={20} color="#fff" /></Pressable>
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
  root:{flex:1,backgroundColor:'#1D201F'},
  top:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:6,backgroundColor:'#242725',borderBottomWidth:1,borderBottomColor:'#3D403D'},
  icon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#303330'},
  omni:{flex:1,height:42,borderRadius:16,backgroundColor:'#303330',flexDirection:'row',alignItems:'center',paddingHorizontal:9,borderWidth:1,borderColor:'#484B47'},securityButton:{width:28,height:38,alignItems:'center',justifyContent:'center'},input:{flex:1,color:'#F8F3EE',fontSize:14,paddingVertical:0,textAlign:'left'},siteBadge:{width:24,height:24,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#41443F'},
  private:{paddingVertical:6,paddingHorizontal:12,backgroundColor:'#3A302E'},privateText:{color:'#E7C9B6',fontSize:11,textAlign:'center',fontWeight:'700'},rendererNotice:{paddingVertical:7,paddingHorizontal:12,backgroundColor:'#343735',borderBottomWidth:1,borderBottomColor:'#555A55'},rendererNoticeText:{color:'#E7DED5',fontSize:11,textAlign:'center',fontWeight:'800'},
  progressTrack:{height:3,backgroundColor:'#282B29',overflow:'hidden'},progress:{height:3,backgroundColor:'#D5AA88'},webWrap:{flex:1,backgroundColor:'#fff'},web:{flex:1},
  errorCard:{position:'absolute',left:20,right:20,top:26,padding:22,borderRadius:22,backgroundColor:'#2B2E2C',borderWidth:1,borderColor:'#4B4F4B',shadowColor:'#000',shadowOpacity:.22,shadowRadius:14,elevation:8},errorTitle:{color:'#fff',fontSize:20,fontWeight:'900',textAlign:'center'},errorHost:{color:'#D5AA88',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:6},errorText:{color:'#D9D2CB',fontSize:13,lineHeight:19,textAlign:'center',marginTop:10},errorActions:{flexDirection:'row-reverse',gap:10,marginTop:18},retryBtn:{flex:1,minHeight:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#B88766'},retryText:{color:'#fff',fontWeight:'900'},errorSecondary:{flex:1,minHeight:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#3B3E3B'},errorSecondaryText:{color:'#D9D2CB',fontWeight:'800'},
  bottom:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:7,backgroundColor:'#242725',borderTopWidth:1,borderTopColor:'#3D403D'},nav:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},disabled:{opacity:.25},navPrimary:{width:44,height:44,borderRadius:16,backgroundColor:'#3A3D3A',alignItems:'center',justifyContent:'center'},vpn:{minWidth:52,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:4,backgroundColor:'#343A36',paddingHorizontal:7},vpnOn:{backgroundColor:'#315044'},vpnText:{fontSize:10,fontWeight:'900',color:'#D1FAE5'},ai:{width:42,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#8B654E'},aiDisabled:{opacity:.3},aiText:{fontSize:11,fontWeight:'900',color:'#fff'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.48)',alignItems:'flex-end',paddingHorizontal:12},menuCard:{width:292,maxWidth:'90%',borderRadius:22,backgroundColor:'#2D302E',borderWidth:1,borderColor:'#4C504C',overflow:'hidden'},menuHeader:{paddingHorizontal:17,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#4C504C'},menuTitle:{color:'#FFF9F2',fontSize:16,fontWeight:'900'},menuHost:{color:'#B9B1A9',fontSize:11,marginTop:3},menuItem:{minHeight:48,flexDirection:'row',alignItems:'center',paddingHorizontal:15,gap:12},menuText:{flex:1,color:'#EEE8E2',fontSize:14,fontWeight:'700'},menuDivider:{height:1,backgroundColor:'#4C504C',marginVertical:3},
  centerOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.60)',alignItems:'center',justifyContent:'center',padding:22},siteCard:{width:'100%',maxWidth:420,borderRadius:27,padding:22,backgroundColor:'#2D302E',borderWidth:1,borderColor:'#4C504C'},siteHeaderIcon:{width:46,height:46,borderRadius:16,alignSelf:'center',alignItems:'center',justifyContent:'center',backgroundColor:'#3A3D3A',marginBottom:10},siteTitle:{color:'#FFF9F2',fontSize:20,fontWeight:'900',textAlign:'center'},siteState:{color:'#7FB890',fontSize:13,fontWeight:'900',textAlign:'center',marginTop:10},siteWarn:{color:'#D8A56F'},siteHost:{color:'#D5AA88',fontSize:12,textAlign:'center',marginTop:7},siteBody:{color:'#CFC7BF',fontSize:12,lineHeight:19,textAlign:'center',marginTop:12},siteControls:{marginTop:18,borderTopWidth:1,borderBottomWidth:1,borderColor:'#474B47'},siteControlRow:{minHeight:68,flexDirection:'row-reverse',alignItems:'center',gap:12,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#474B47'},siteControlCopy:{flex:1},siteControlTitle:{color:'#F7F1EA',fontWeight:'900',fontSize:13,textAlign:'right'},siteControlHint:{color:'#AFA79F',fontSize:10,lineHeight:15,textAlign:'right',marginTop:3},privateSiteNote:{color:'#CDAF9B',fontSize:10,lineHeight:15,textAlign:'center',marginTop:12},siteReset:{height:44,borderRadius:14,borderWidth:1,borderColor:'#5B514A',backgroundColor:'#373A37',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7,marginTop:14},siteResetText:{color:'#E7DED5',fontSize:11,fontWeight:'800'},siteClose:{height:48,borderRadius:15,backgroundColor:'#B88766',alignItems:'center',justifyContent:'center',marginTop:14},siteCloseText:{color:'#fff',fontWeight:'900'},
  mediaRoot:{flex:1,backgroundColor:'#05070C'},mediaTop:{height:62,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,backgroundColor:'#0A1020',borderBottomWidth:1,borderBottomColor:'#1E293B'},mediaClose:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},mediaCloseText:{color:'#fff',fontSize:25,fontWeight:'900'},mediaHeading:{flex:1},mediaTitle:{color:'#fff',fontSize:15,fontWeight:'900'},mediaHost:{color:'#94A3B8',fontSize:11,marginTop:2},mediaWeb:{flex:1,backgroundColor:'#000'},mediaSources:{paddingHorizontal:10,paddingVertical:8,gap:7,backgroundColor:'#0A1020'},mediaSource:{height:36,paddingHorizontal:13,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},mediaSourceOn:{backgroundColor:'#8B654E'},mediaSourceText:{color:'#fff',fontSize:11,fontWeight:'800'},
  readerRoot:{flex:1},readerDark:{backgroundColor:'#0C1018'},readerLight:{backgroundColor:'#F6F1E7'},readerTop:{height:62,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10,borderBottomWidth:1,borderBottomColor:'#334155'},readerBtn:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerBtnText:{color:'#fff',fontSize:22,fontWeight:'800'},readerTitle:{flex:1,color:'#fff',fontSize:15,fontWeight:'800'},readerInk:{color:'#241F1A'},readerContent:{paddingHorizontal:24,paddingTop:26,paddingBottom:80,maxWidth:760,width:'100%',alignSelf:'center'},readerHeadline:{fontSize:28,lineHeight:38,color:'#F8FAFC',fontWeight:'900',marginBottom:22,textAlign:'right'},readerBody:{color:'#E2E8F0',textAlign:'right'},readerTools:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderTopWidth:1,borderTopColor:'#334155'},readerTool:{minWidth:58,height:42,borderRadius:13,backgroundColor:'#1E293B',alignItems:'center',justifyContent:'center',paddingHorizontal:9},readerToolText:{color:'#fff',fontWeight:'800',fontSize:12}
});