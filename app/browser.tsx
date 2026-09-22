import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { addBookmark, addHistory, createBrowserTab, getBrowserTabs, getRecentSites, getSetting, incrementProtectionStats, isBookmarked, removeBookmark, setPageContext, setSetting, updateBrowserTab } from '@/lib/db';
import { normalizeInput, safeExternalUrl } from '@/lib/url';
import { parseReaderMessage, READER_EXTRACT_JS, ReaderPayload } from '@/lib/reader';
import { PAGE_CONTEXT_JS, parsePageContext } from '@/lib/context';
import { isVpnConnected } from '@/lib/vpn';
import { DEFAULT_SITE_PREFERENCES, getSitePreferences, resetSitePreferences, saveSitePreferences, type SitePreferences } from '@/lib/site-preferences';
import { DEFAULT_PERFORMANCE_SETTINGS, deriveBrowserPerformancePolicy, getPerformanceSettings, type PerformanceSettings } from '@/lib/performance';
import { routeBrowserDownload } from '@/features/downloads/browser-download';
import { RAID_ADBLOCK_OFF_JS, RAID_COSMETIC_ADBLOCK_JS } from '@/lib/adblock';

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const RENDERER_RECOVERY_WINDOW_MS = 30_000;
const MAX_RENDERER_RECOVERIES = 2;
const DIRECT_MEDIA_RE = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
const STREAM_PAGE_RE = /\/s\/[A-Za-z0-9_-]{6,}(?:$|[/?#])/i;
const DOWNLOAD_URL_HINT_RE = /(?:^|[\/?&#=_-])(?:download|downloads|attachment|attachments|export|file|files|getfile|get-file|dl|save)(?:$|[\/?&#=_-])/i;
const SPEECH_CHUNK_LIMIT = 3500;

function splitSpeechText(text: string, platformLimit: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const limit = Math.max(256, Math.min(platformLimit, SPEECH_CHUNK_LIMIT));
  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const boundary = Math.max(
      window.lastIndexOf('؟'),
      window.lastIndexOf('!'),
      window.lastIndexOf('.'),
      window.lastIndexOf('؛'),
      window.lastIndexOf('،'),
      window.lastIndexOf(' '),
    );
    const cut = boundary >= Math.floor(limit * 0.55) ? boundary + 1 : limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

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
const MEDIA_PROBE_JS = `(() => {
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
    if (urls.length) window.ReactNativeWebView?.postMessage('RAID_MEDIA:' + JSON.stringify(urls.slice(0, 12)));
  } catch {}
  true;
})();`;
const SILENT_STREAM_ASSIST_JS = `(() => {
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
      video.setAttribute('playsinline', '');
      push(video.currentSrc);
      push(video.src);
      video.querySelectorAll('source').forEach((source) => push(source.src));
    });
    if (urls.length) window.ReactNativeWebView?.postMessage('RAID_MEDIA:' + JSON.stringify(urls.slice(0, 12)));
  } catch {}
  true;
})();`;
const DOWNLOAD_CAPTURE_JS = `(() => {
  try {
    if (window.__raidDownloadCaptureInstalled) return true;
    window.__raidDownloadCaptureInstalled = true;
    const fileRe = /\.(?:apk|aab|zip|rar|7z|pdf|epub|mobi|azw3?|fb2|docx?|xlsx?|pptx?|csv|txt|exe|msi|dmg|deb|rpm|iso|tar|gz|tgz|bz2|xz|mp3|wav|flac|ogg)(?:$|[?#])/i;
    const mediaRe = /\.(?:mp4|m4v|webm|m3u8)(?:$|[?#])/i;
    const intentRe = /(?:^|[\\/?&#=_-])(?:download|downloads|attachment|attachments|export|file|files|getfile|get-file|dl|save)(?:$|[\\/?&#=_-])/i;
    const textRe = /(?:تنزيل|تحميل|احفظ|حفظ|download|save|export|get file)/i;
    const report = (value) => {
      try {
        const absolute = new URL(value, location.href).href;
        if (!/^https:\/\//i.test(absolute) || mediaRe.test(absolute)) return false;
        window.ReactNativeWebView?.postMessage('RAID_DOWNLOAD:' + absolute);
        return true;
      } catch {
        return false;
      }
    };
    const likelyDownload = (absolute, element) => {
      if (!absolute || !/^https:\/\//i.test(absolute) || mediaRe.test(absolute)) return false;
      if (fileRe.test(absolute) || intentRe.test(absolute)) return true;
      if (!element) return false;
      const label = [element.textContent, element.getAttribute?.('aria-label'), element.getAttribute?.('title'), element.getAttribute?.('class'), element.getAttribute?.('id')].filter(Boolean).join(' ');
      if (textRe.test(label)) return true;
      return Boolean(element.hasAttribute?.('download') || element.getAttribute?.('data-download') || element.getAttribute?.('data-file') || element.getAttribute?.('data-url'));
    };
    document.addEventListener('click', (event) => {
      try {
        const target = event.target;
        const element = target && target.closest ? target.closest('a[href],button,[role="button"],[data-url],[data-href],[data-download]') : null;
        if (!element) return;
        const raw = element.href || element.getAttribute?.('href') || element.getAttribute?.('data-url') || element.getAttribute?.('data-href') || element.getAttribute?.('data-download') || '';
        if (!raw) return;
        const absolute = new URL(raw, location.href).href;
        if (!likelyDownload(absolute, element)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        report(absolute);
      } catch {}
    }, true);
    const originalOpen = window.open;
    if (typeof originalOpen === 'function') {
      window.open = function(url, ...args) {
        try {
          if (typeof url === 'string') {
            const absolute = new URL(url, location.href).href;
            if (likelyDownload(absolute, null) && report(absolute)) return null;
          }
        } catch {}
        return originalOpen.call(this, url, ...args);
      };
    }
  } catch {}
  true;
})();`;

const PLAY_PAGE_VIDEO_JS = `(() => {
  try {
    const STYLE_ID = 'raid-inline-player-style';
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = '.raid-player-host{position:absolute!important;inset:0!important;z-index:2147483000!important;pointer-events:none!important;font-family:system-ui,-apple-system,sans-serif!important;color:#fff!important}.raid-player-controls{position:absolute!important;inset:0!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;padding:10px!important;background:linear-gradient(180deg,rgba(0,0,0,.56),transparent 35%,transparent 55%,rgba(0,0,0,.78))!important;opacity:1!important;transition:opacity .2s!important;pointer-events:none!important}.raid-player-host.raid-hidden .raid-player-controls{opacity:0!important}.raid-player-top,.raid-player-bottom,.raid-player-center{display:flex!important;align-items:center!important;gap:8px!important;pointer-events:auto!important}.raid-player-top{justify-content:space-between!important}.raid-player-center{position:absolute!important;inset:0!important;justify-content:center!important;pointer-events:none!important}.raid-player-bottom{flex-wrap:wrap!important}.raid-player-btn{width:40px!important;height:40px!important;min-width:40px!important;border:1px solid rgba(255,255,255,.24)!important;border-radius:14px!important;background:rgba(8,12,20,.72)!important;color:#fff!important;font:800 14px system-ui!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;pointer-events:auto!important}.raid-player-main{width:62px!important;height:62px!important;border-radius:50%!important;font-size:24px!important;background:rgba(8,12,20,.78)!important}.raid-player-time{font:700 11px system-ui!important;color:#fff!important;direction:ltr!important;white-space:nowrap!important;text-shadow:0 1px 3px #000!important}.raid-player-seek{flex:1 1 120px!important;height:28px!important;min-width:90px!important;margin:0!important;accent-color:#d5aa88!important;pointer-events:auto!important}.raid-player-badge{padding:6px 9px!important;border-radius:10px!important;background:rgba(8,12,20,.72)!important;font:800 10px system-ui!important;white-space:nowrap!important}.raid-player-toast{position:absolute!important;left:50%!important;bottom:58px!important;transform:translateX(-50%)!important;padding:7px 12px!important;border-radius:12px!important;background:rgba(8,12,20,.86)!important;font:800 11px system-ui!important;opacity:0!important;transition:opacity .15s!important;white-space:nowrap!important}.raid-player-toast.raid-show{opacity:1!important}@media(max-width:360px){.raid-player-controls{padding:6px!important}.raid-player-btn{width:34px!important;height:34px!important;min-width:34px!important;border-radius:11px!important;font-size:11px!important}.raid-player-main{width:54px!important;height:54px!important;font-size:20px!important}.raid-player-time{font-size:9px!important}}';
      (document.head || document.documentElement).appendChild(style);
    }
    const fmt = (seconds) => { if (!Number.isFinite(seconds)) return '--:--'; const value=Math.max(0,Math.floor(seconds)); const h=Math.floor(value/3600),m=Math.floor((value%3600)/60),s=value%60; return h ? String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') : String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); };
    const attach = (video) => {
      if (!video || video.dataset.raidInlinePlayer === '1') return false;
      const rect = video.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 68) return false;
      video.dataset.raidInlinePlayer = '1'; video.setAttribute('playsinline',''); video.setAttribute('webkit-playsinline',''); video.controls = false;
      let container = video.parentElement; if (!container) return false;
      const position = getComputedStyle(container).position; if (position === 'static') container.style.position='relative';
      const host=document.createElement('div'); host.className='raid-player-host'; host.setAttribute('dir','ltr');
      host.innerHTML='<div class="raid-player-controls"><div class="raid-player-top"><span class="raid-player-badge">RAID • داخل الصفحة</span><button class="raid-player-btn raid-speed" aria-label="سرعة التشغيل">1×</button></div><div class="raid-player-center"><button class="raid-player-btn raid-player-main raid-play" aria-label="تشغيل الفيديو">▶</button></div><div class="raid-player-bottom"><button class="raid-player-btn raid-back" aria-label="رجوع عشر ثوان">−10</button><span class="raid-player-time">00:00 / --:--</span><input class="raid-player-seek" type="range" min="0" max="1000" value="0" aria-label="موضع الفيديو"><button class="raid-player-btn raid-forward" aria-label="تقديم عشر ثوان">+10</button><button class="raid-player-btn raid-pip" aria-label="صورة داخل صورة">PiP</button><button class="raid-player-btn raid-download" aria-label="تنزيل الفيديو">↓</button><button class="raid-player-btn raid-full" aria-label="ملء الشاشة">⛶</button></div></div><div class="raid-player-toast"></div>';
      container.appendChild(host);
      const controls=host.querySelector('.raid-player-controls'), play=host.querySelector('.raid-play'), seek=host.querySelector('.raid-player-seek'), time=host.querySelector('.raid-player-time'), speed=host.querySelector('.raid-speed'), toast=host.querySelector('.raid-player-toast');
      let seeking=false, hideTimer=0, toastTimer=0, speedIndex=2; const speeds=[.5,.75,1,1.25,1.5,1.75,2];
      const flash=(message)=>{toast.textContent=message;toast.classList.add('raid-show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('raid-show'),1200)};
      const reveal=()=>{host.classList.remove('raid-hidden');clearTimeout(hideTimer);if(!video.paused)hideTimer=setTimeout(()=>host.classList.add('raid-hidden'),2800)};
      const sync=()=>{play.textContent=video.paused?'▶':'❚❚';time.textContent=fmt(video.currentTime)+' / '+fmt(video.duration);if(!seeking&&Number.isFinite(video.duration)&&video.duration>0)seek.value=String(Math.round(video.currentTime/video.duration*1000));};
      const toggle=()=>{if(video.paused)video.play().catch(()=>flash('اضغط تشغيل مرة أخرى'));else video.pause();reveal();};
      play.onclick=(event)=>{event.stopPropagation();toggle()}; host.addEventListener('pointerdown',reveal,{passive:true}); video.addEventListener('click',reveal);
      host.querySelector('.raid-back').onclick=()=>{video.currentTime=Math.max(0,video.currentTime-10);flash('رجوع 10 ثوانٍ');reveal()};
      host.querySelector('.raid-forward').onclick=()=>{video.currentTime=Math.min(video.duration||Infinity,video.currentTime+10);flash('تقديم 10 ثوانٍ');reveal()};
      seek.onpointerdown=()=>{seeking=true}; seek.onpointerup=()=>{seeking=false}; seek.oninput=()=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Number(seek.value)/1000*video.duration};
      speed.onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;video.playbackRate=speeds[speedIndex];speed.textContent=speeds[speedIndex]+'×';flash('السرعة '+speeds[speedIndex]+'×');reveal()};
      host.querySelector('.raid-full').onclick=()=>{const target=container;const fn=target.requestFullscreen||target.webkitRequestFullscreen||video.requestFullscreen||video.webkitRequestFullscreen;if(fn)try{fn.call(target.requestFullscreen||target.webkitRequestFullscreen?target:video)}catch{}reveal()};
      host.querySelector('.raid-pip').onclick=async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(video.requestPictureInPicture)await video.requestPictureInPicture();else flash('PiP غير مدعوم')}catch{flash('تعذر تشغيل PiP')}reveal()};
      host.querySelector('.raid-download').onclick=()=>{const source=video.currentSrc||video.src||video.querySelector('source')?.src||'';if(source)window.ReactNativeWebView?.postMessage('RAID_MEDIA_DOWNLOAD:'+source);else flash('لم يظهر رابط مباشر بعد');reveal()};
      ['loadedmetadata','durationchange','timeupdate','play','pause','ended','ratechange'].forEach((name)=>video.addEventListener(name,sync)); video.addEventListener('play',reveal); video.addEventListener('pause',reveal); sync(); reveal(); return true;
    };
    const install=()=>{let count=0;document.querySelectorAll('video').forEach((video)=>{if(attach(video))count++});return count};
    const count=install();
    if(!window.__raidInlinePlayerObserver){window.__raidInlinePlayerObserver=new MutationObserver(()=>install());window.__raidInlinePlayerObserver.observe(document.documentElement,{childList:true,subtree:true});}
    const videos=Array.from(document.querySelectorAll('video')); const target=videos.find((video)=>{const r=video.getBoundingClientRect();return r.width>120&&r.height>68})||videos[0];
    if(target){attach(target);target.scrollIntoView({block:'center',behavior:'smooth'});const result=target.play();if(result&&typeof result.catch==='function')result.catch(()=>{});window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:PLAYING');}
    else if(!count) window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:NO_VIDEO');
  } catch { window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:FAILED'); }
  true;
})();`;

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function isDirectMediaUrl(value: string) {
  return /^https?:\/\//i.test(value) && DIRECT_MEDIA_RE.test(value);
}

function isLikelyDownloadRequest(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || isDirectMediaUrl(value)) return false;
    return DOWNLOAD_URL_HINT_RE.test(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return false;
  }
}

function isLikelyStreamPage(value: string) {
  try {
    const parsed = new URL(value);
    return /^https?:$/i.test(parsed.protocol) && STREAM_PAGE_RE.test(parsed.pathname + parsed.search + parsed.hash);
  } catch { return false; }
}

function urlsReferToSameDocument(first: string, second: string) {
  try {
    const left = new URL(first);
    const right = new URL(second);
    left.hash = '';
    right.hash = '';
    return left.href === right.href;
  } catch {
    return false;
  }
}

function mediaPlayerHtml(mediaUrl: string) {
  const source = JSON.stringify(mediaUrl).replace(/</g, '\u003c');
  return `<!doctype html>
<html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;height:100%;background:#03060a;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}body{display:flex;flex-direction:column}.player{width:100%;height:100%;display:flex;flex-direction:column;background:#03060a}.stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden}video{width:100%;height:100%;background:#000;object-fit:contain}.center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}.big{pointer-events:auto;width:68px;height:68px;border-radius:50%;border:1px solid rgba(255,255,255,.24);background:rgba(2,6,23,.72);color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center}.status{position:absolute;top:12px;left:12px;max-width:72%;padding:7px 10px;border-radius:999px;background:rgba(15,23,42,.78);font-size:11px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.controls{flex:0 0 auto;background:#0a1020;border-top:1px solid #1e293b;padding:10px 12px calc(10px + env(safe-area-inset-bottom))}.timeline{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.seekWrap{position:relative;height:22px;display:flex;align-items:center}.buffer{position:absolute;left:0;right:0;height:4px;border-radius:999px;background:#263348;overflow:hidden;pointer-events:none}.bufferFill{height:100%;width:0;background:#52657d}.seek{position:relative;width:100%;margin:0;accent-color:#d5aa88;background:transparent}.time{font-size:11px;color:#cbd5e1;direction:ltr;min-width:92px;text-align:left;font-variant-numeric:tabular-nums}.primaryRow{display:grid;grid-template-columns:48px 1fr 48px;gap:10px;align-items:center;margin-top:8px}.utilityRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}.btn{border:1px solid rgba(255,255,255,.13);background:#172033;color:#fff;border-radius:13px;height:44px;padding:0 8px;font-weight:800;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.btn.primary{background:#8b654e;border-color:#b88766;font-size:13px}.toast{position:absolute;left:14px;right:14px;bottom:14px;background:rgba(15,23,42,.94);border:1px solid rgba(255,255,255,.12);padding:10px 14px;border-radius:14px;text-align:center;font-size:11px;color:#e2e8f0;display:none;z-index:5}.errorActions{position:absolute;left:16px;right:16px;bottom:16px;display:none;gap:8px}.errorActions.show{display:grid;grid-template-columns:1fr 1fr}.errorBtn{height:44px;border-radius:13px;border:1px solid #334155;background:#172033;color:#fff;font-weight:800}@media (max-width:360px){.controls{padding-left:8px;padding-right:8px}.utilityRow{grid-template-columns:repeat(2,minmax(0,1fr))}.time{font-size:10px;min-width:84px}.btn{font-size:11px}.big{width:60px;height:60px}}@media (orientation:landscape){.controls{padding-top:7px;padding-bottom:calc(7px + env(safe-area-inset-bottom))}.utilityRow{margin-top:6px}.primaryRow{margin-top:6px}.btn{height:40px}.stage{min-height:180px}}
</style></head><body><div class="player"><div class="stage" id="stage"><video id="raidVideo" playsinline webkit-playsinline preload="metadata"></video><div id="status" class="status">جاري تجهيز الفيديو…</div><div class="center"><button id="big" class="big" aria-label="تشغيل">▶</button></div><div id="errorActions" class="errorActions"><button id="retry" class="errorBtn">إعادة المحاولة</button><button id="native" class="errorBtn">العودة للموقع</button></div><div id="toast" class="toast"></div></div><div class="controls"><div class="timeline"><div class="seekWrap"><div class="buffer"><div id="bufferFill" class="bufferFill"></div></div><input id="seek" class="seek" type="range" min="0" max="1000" value="0" aria-label="موضع الفيديو"></div><span id="time" class="time">00:00 / --:--</span></div><div class="primaryRow"><button id="back" class="btn">−10</button><button id="play" class="btn primary">تشغيل</button><button id="fwd" class="btn">+10</button></div><div class="utilityRow"><button id="speed" class="btn">1×</button><button id="pip" class="btn">PiP</button><button id="full" class="btn">ملء الشاشة</button><button id="download" class="btn">تنزيل</button></div></div></div><script>
const video=document.getElementById('raidVideo');const stage=document.getElementById('stage');const play=document.getElementById('play');const big=document.getElementById('big');const seek=document.getElementById('seek');const time=document.getElementById('time');const speed=document.getElementById('speed');const pip=document.getElementById('pip');const status=document.getElementById('status');const toast=document.getElementById('toast');const bufferFill=document.getElementById('bufferFill');const errorActions=document.getElementById('errorActions');const src=${source};video.src=src;
let seeking=false;const speeds=[.5,.75,1,1.25,1.5,1.75,2];let speedIndex=2;const fmt=(s)=>{if(!Number.isFinite(s))return'--:--';s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(x).padStart(2,'0')};const flash=(m)=>{toast.textContent=m;toast.style.display='block';clearTimeout(window.__raidToast);window.__raidToast=setTimeout(()=>toast.style.display='none',1500)};const buffered=()=>{try{if(!video.buffered.length||!Number.isFinite(video.duration)||video.duration<=0)return 0;return Math.min(1,video.buffered.end(video.buffered.length-1)/video.duration)}catch{return 0}};const sync=()=>{const paused=video.paused;play.textContent=paused?'تشغيل':'إيقاف';big.textContent=paused?'▶':'❚❚';time.textContent=fmt(video.currentTime)+' / '+fmt(video.duration);if(!seeking&&Number.isFinite(video.duration)&&video.duration>0)seek.value=String(Math.round((video.currentTime/video.duration)*1000));bufferFill.style.width=(buffered()*100).toFixed(1)+'%'};const setState=(m)=>{status.textContent=m};const toggle=()=>{if(video.paused){video.play().catch(()=>setState('اضغط تشغيل مرة أخرى'))}else video.pause()};
video.addEventListener('loadedmetadata',()=>{errorActions.classList.remove('show');setState('جاهز • '+(video.videoWidth||'?')+'×'+(video.videoHeight||'?'));sync()});video.addEventListener('durationchange',sync);video.addEventListener('timeupdate',sync);video.addEventListener('progress',sync);video.addEventListener('play',()=>{setState('تشغيل');sync()});video.addEventListener('pause',()=>{setState('متوقف مؤقتًا');sync()});video.addEventListener('waiting',()=>setState('تخزين مؤقت…'));video.addEventListener('stalled',()=>setState('الشبكة بطيئة • بانتظار البيانات…'));video.addEventListener('playing',()=>{setState('يعمل داخل RAID');errorActions.classList.remove('show');sync()});video.addEventListener('error',()=>{setState('تعذر تشغيل هذا المصدر مباشرة');errorActions.classList.add('show');window.ReactNativeWebView?.postMessage('RAID_MEDIA_STATUS:SOURCE_ERROR')});
play.onclick=toggle;big.onclick=toggle;document.getElementById('back').onclick=()=>{video.currentTime=Math.max(0,video.currentTime-10);flash('رجوع 10 ثوانٍ')};document.getElementById('fwd').onclick=()=>{video.currentTime=Math.min(video.duration||Infinity,video.currentTime+10);flash('تقديم 10 ثوانٍ')};seek.onpointerdown=()=>{seeking=true};seek.onpointerup=()=>{seeking=false};seek.oninput=()=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=(Number(seek.value)/1000)*video.duration};speed.onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;video.playbackRate=speeds[speedIndex];speed.textContent=speeds[speedIndex]+'×';flash('السرعة '+speeds[speedIndex]+'×')};document.getElementById('full').onclick=()=>{const fn=video.requestFullscreen||video.webkitRequestFullscreen||stage.requestFullscreen||stage.webkitRequestFullscreen;if(fn){try{fn.call(video.requestFullscreen||video.webkitRequestFullscreen?video:stage)}catch{}}};pip.onclick=async()=>{try{if(document.pictureInPictureElement){await document.exitPictureInPicture();return}if(video.requestPictureInPicture){await video.requestPictureInPicture()}else flash('PiP غير مدعوم بهذا WebView')}catch{flash('تعذر تشغيل PiP لهذا المصدر')}};document.getElementById('download').onclick=()=>window.ReactNativeWebView?.postMessage('RAID_MEDIA_DOWNLOAD:'+src);document.getElementById('retry').onclick=()=>{errorActions.classList.remove('show');setState('إعادة الاتصال بالمصدر…');try{video.load();video.play().catch(()=>{})}catch{}};document.getElementById('native').onclick=()=>window.ReactNativeWebView?.postMessage('RAID_MEDIA_CLOSE');
let lastTap=0;stage.addEventListener('pointerup',(event)=>{if(event.target.closest&&event.target.closest('button,input'))return;const now=Date.now();if(now-lastTap<320){const rect=stage.getBoundingClientRect();if(event.clientX<rect.left+rect.width*.42){video.currentTime=Math.max(0,video.currentTime-10);flash('−10 ثوانٍ')}else if(event.clientX>rect.left+rect.width*.58){video.currentTime=Math.min(video.duration||Infinity,video.currentTime+10);flash('+10 ثوانٍ')}else toggle();lastTap=0}else{lastTap=now}});sync();
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
  const postLoadWorkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualMediaRequest = useRef(false);
  const pendingPageDownload = useRef('');
  const lastPersistedNavigation = useRef('');
  const mainDocumentUrl = useRef(startUrl);
  const canBackRef = useRef(false);
  const intentionalStop = useRef<{ url: string; expiresAt: number } | null>(null);
  const lastProgressRef = useRef(0);
  const [webKey, setWebKey] = useState(0);
  const [url, setUrl] = useState(startUrl);
  const [loadedUrl, setLoadedUrl] = useState(startUrl);
  const [input, setInput] = useState(startUrl);
  const [addressFocused, setAddressFocused] = useState(false);
  const [historySuggestions, setHistorySuggestions] = useState<Array<{url:string;title:string;visited_at:number}>>([]);
  const [pageProtection, setPageProtection] = useState({ adsRemoved: 0, popupsBlocked: 0 });
  const [title, setTitle] = useState('RAID Browser');
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rendererNotice, setRendererNotice] = useState('');
  const [reader, setReader] = useState<ReaderPayload | null>(null);
  const [fontSize, setFontSize] = useState(19);
  const [readerDark, setReaderDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteInfoOpen, setSiteInfoOpen] = useState(false);
  const [sitePrefs, setSitePrefs] = useState<SitePreferences>({ ...DEFAULT_SITE_PREFERENCES });
  const [sitePreferencesBusy, setSitePreferencesBusy] = useState(false);
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({ ...DEFAULT_PERFORMANCE_SETTINGS });
  const [vpnConnected, setVpnConnected] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [tabCount, setTabCount] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getSetting<number>('reader_font_size', 19),
      getSetting<boolean>('reader_dark', true),
    ]).then(([savedFontSize, savedDark]) => {
      if (!alive) return;
      if (Number.isFinite(savedFontSize)) setFontSize(Math.min(30, Math.max(15, savedFontSize)));
      setReaderDark(typeof savedDark === 'boolean' ? savedDark : true);
    });
    return () => { alive = false; };
  }, []);

  const refreshVpnStatus = useCallback(() => {
    void isVpnConnected().then(setVpnConnected).catch(() => setVpnConnected(false));
  }, []);

  const refreshPerformance = useCallback(() => {
    void getPerformanceSettings()
      .then(setPerformanceSettings)
      .catch(() => setPerformanceSettings({ ...DEFAULT_PERFORMANCE_SETTINGS }));
  }, []);

  const refreshTabCount = useCallback(() => {
    void getBrowserTabs()
      .then((tabs) => setTabCount(tabs.length))
      .catch(() => setTabCount(0));
  }, []);

  const closeReader = useCallback(() => {
    void Speech.stop();
    setReader(null);
  }, []);

  useFocusEffect(useCallback(() => {
    refreshVpnStatus();
    refreshPerformance();
    refreshTabCount();
    return () => {};
  }, [refreshPerformance, refreshTabCount, refreshVpnStatus]));

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (reader) { closeReader(); return true; }
      if (mediaOpen) { setMediaOpen(false); return true; }
      if (siteInfoOpen) { setSiteInfoOpen(false); return true; }
      if (menuOpen) { setMenuOpen(false); return true; }
      if (canBackRef.current) { web.current?.goBack(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [closeReader, mediaOpen, menuOpen, reader, siteInfoOpen]));

  useEffect(() => {
    let alive = true;
    void getSitePreferences(loadedUrl)
      .then((prefs) => { if (alive) setSitePrefs(prefs); })
      .catch(() => { if (alive) setSitePrefs({ ...DEFAULT_SITE_PREFERENCES }); });
    return () => { alive = false; };
  }, [loadedUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      web.current?.injectJavaScript(sitePrefs.adBlock ? RAID_COSMETIC_ADBLOCK_JS : RAID_ADBLOCK_OFF_JS);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadedUrl, sitePrefs.adBlock, webKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshVpnStatus();
    });
    return () => {
      subscription.remove();
      if (rendererNoticeTimer.current) clearTimeout(rendererNoticeTimer.current);
      if (postLoadWorkTimer.current) clearTimeout(postLoadWorkTimer.current);
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
    canBackRef.current = false;
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
      intentionalStop.current = null;
      setLoadError('');
      setMediaUrls([]);
      setUrl(next);
      setAddressFocused(false);
    } catch {
      Alert.alert('RAID', 'تعذر فهم العنوان أو عبارة البحث.');
    }
  };

  const changed = async (nav: WebViewNavigation) => {
    mainDocumentUrl.current = nav.url;
    canBackRef.current = nav.canGoBack;
    setCanBack(nav.canGoBack);
    setCanForward(nav.canGoForward);
    setTitle(nav.title || nav.url);
    setLoadedUrl(nav.url);
    if (isDirectMediaUrl(nav.url)) setMediaUrls([nav.url]);
    if (!addressFocused) setInput(nav.url);
    if (!nav.loading) {
      try { setBookmarked(await isBookmarked(nav.url)); } catch { setBookmarked(false); }
    }
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
          refreshTabCount();
        }
      } catch {}
    }
  };

  const toggleBookmark = async () => {
    if (bookmarkBusy || !safeExternalUrl(loadedUrl)) return;
    const targetUrl = loadedUrl;
    const wasBookmarked = bookmarked;
    setBookmarkBusy(true);
    try {
      if (wasBookmarked) {
        await removeBookmark(targetUrl);
      } else {
        await addBookmark(targetUrl, title);
      }
      if (loadedUrl === targetUrl) setBookmarked(!wasBookmarked);
    } catch {
      Alert.alert('المفضلة', wasBookmarked
        ? 'تعذرت إزالة الصفحة من المفضلة. بقيت محفوظة.'
        : 'تعذر حفظ الصفحة في المفضلة. حاول مرة أخرى.');
    } finally {
      setBookmarkBusy(false);
    }
  };

  const reloadOrStop = () => {
    if (loading) {
      intentionalStop.current = { url: mainDocumentUrl.current, expiresAt: Date.now() + 1500 };
      web.current?.stopLoading();
      setLoading(false);
      setLoadProgress(0);
      return;
    }
    intentionalStop.current = null;
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
    if (sitePreferencesBusy) return;
    const previous = sitePrefs;
    const next = { ...sitePrefs, ...patch };
    setSitePrefs(next);
    if (privateMode) {
      if (reload) setWebKey((value) => value + 1);
      return;
    }
    setSitePreferencesBusy(true);
    try {
      await saveSitePreferences(loadedUrl, next);
      if (reload) setWebKey((value) => value + 1);
    } catch {
      setSitePrefs(previous);
      Alert.alert('إعدادات الموقع', 'تعذر حفظ التغيير. بقي الإعداد السابق فعالًا.');
    } finally {
      setSitePreferencesBusy(false);
    }
  };

  const toggleDesktop = () => {
    setMenuOpen(false);
    void updateSitePreference({ desktopMode: !sitePrefs.desktopMode }, true);
  };

  const resetCurrentSite = async () => {
    if (sitePreferencesBusy) return;
    const previous = sitePrefs;
    const defaults = { ...DEFAULT_SITE_PREFERENCES };
    setSitePrefs(defaults);
    if (privateMode) {
      setWebKey((value) => value + 1);
      return;
    }
    setSitePreferencesBusy(true);
    try {
      await resetSitePreferences(loadedUrl);
      setWebKey((value) => value + 1);
    } catch {
      setSitePrefs(previous);
      Alert.alert('إعدادات الموقع', 'تعذرت إعادة الإعدادات. بقيت إعدادات الموقع الحالية فعالة.');
    } finally {
      setSitePreferencesBusy(false);
    }
  };

  const openReader = () => {
    setMenuOpen(false);
    web.current?.injectJavaScript(READER_EXTRACT_JS);
  };

  const captureContext = () => {
    if (!privateMode) web.current?.injectJavaScript(PAGE_CONTEXT_JS);
  };

  const scanMedia = () => web.current?.injectJavaScript(MEDIA_SCAN_JS);
  const probeMedia = () => web.current?.injectJavaScript(MEDIA_PROBE_JS);

  const schedulePostLoadWork = (pageUrl: string) => {
    if (postLoadWorkTimer.current) {
      clearTimeout(postLoadWorkTimer.current);
      postLoadWorkTimer.current = null;
    }

    const policy = deriveBrowserPerformancePolicy(performanceSettings, pageUrl);
    const videoFastPath = policy.profile === 'video' || isLikelyStreamPage(pageUrl);
    web.current?.injectJavaScript(DOWNLOAD_CAPTURE_JS);

    if (videoFastPath) {
      // Keep streaming pages close to stock WebView behavior: no persistent DOM
      // observer, no forced autoplay loop, no automatic full-page AI extraction.
      web.current?.injectJavaScript(SILENT_STREAM_ASSIST_JS);
      web.current?.injectJavaScript(PLAY_PAGE_VIDEO_JS);
      probeMedia();
      return;
    }

    // When VPN or adaptive performance mode is active, let the page settle first.
    // This prevents RAID's own helper work from competing with navigation/network IO.
    const delay = vpnConnected ? 1400 : policy.deferNonCriticalWork ? 900 : 350;
    postLoadWorkTimer.current = setTimeout(() => {
      postLoadWorkTimer.current = null;
      captureContext();
      web.current?.injectJavaScript(PLAY_PAGE_VIDEO_JS);
      if (!policy.reduceBackgroundWork) scanMedia();
    }, delay);
  };

  const updateLoadProgress = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    if (next >= 0.995 || next - lastProgressRef.current >= 0.08) {
      lastProgressRef.current = next;
      setLoadProgress(next);
    }
  };

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

  const confirmPageDownload = (candidate: string, sourceUrl: string) => {
    if (!safeExternalUrl(candidate) || !urlsReferToSameDocument(sourceUrl, mainDocumentUrl.current) || pendingPageDownload.current) return;
    pendingPageDownload.current = candidate;
    const clearPending = () => {
      if (pendingPageDownload.current === candidate) pendingPageDownload.current = '';
    };
    Alert.alert(
      'تأكيد تنزيل الملف',
      `طلب ${hostOf(sourceUrl)} تنزيل ملف من ${hostOf(candidate)}. ابدأ التنزيل فقط إذا كنت تثق بالمصدر.`,
      [
        { text: 'إلغاء', style: 'cancel', onPress: clearPending },
        { text: 'تنزيل', onPress: () => {
          clearPending();
          if (!urlsReferToSameDocument(sourceUrl, mainDocumentUrl.current)) {
            Alert.alert('RAID Downloads', 'انتهى طلب التنزيل لأن الصفحة تغيّرت. اضغط رابط الملف من الصفحة الحالية للمحاولة مجددًا.');
            return;
          }
          handleFileDownload(candidate);
        } },
      ],
      { cancelable: true, onDismiss: clearPending },
    );
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    if (raw.startsWith('RAID_PROTECTION:')) {
      try {
        const value = JSON.parse(raw.slice('RAID_PROTECTION:'.length));
        const boundedCount = (candidate:unknown) => {
          const count = Number(candidate);
          return Number.isFinite(count) ? Math.min(250, Math.max(0, Math.trunc(count))) : 0;
        };
        const adsRemoved = boundedCount(value?.adsRemoved);
        const popupsBlocked = boundedCount(value?.popupsBlocked);
        if (sitePrefs.adBlock && (adsRemoved || popupsBlocked)) {
          setPageProtection((current) => ({
            adsRemoved: current.adsRemoved + adsRemoved,
            popupsBlocked: current.popupsBlocked + popupsBlocked,
          }));
          void incrementProtectionStats(adsRemoved, popupsBlocked);
        }
      } catch {}
      return;
    }
    if (raw.startsWith('RAID_DOWNLOAD:')) {
      const candidate = raw.slice('RAID_DOWNLOAD:'.length).trim();
      confirmPageDownload(candidate, event.nativeEvent.url);
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
    if (raw === 'RAID_MEDIA_STATUS:PLAYING') {
      manualMediaRequest.current = false;
      return;
    }
    if (raw === 'RAID_MEDIA_STATUS:NO_VIDEO') {
      if (manualMediaRequest.current) {
        Alert.alert('RAID Media Player', 'لم يعثر RAID على فيديو في هذه الصفحة. افتح صفحة مشاهدة تحتوي على فيديو ثم جرّب مرة أخرى.');
      }
      manualMediaRequest.current = false;
      return;
    }
    if (raw === 'RAID_MEDIA_STATUS:FAILED') {
      if (manualMediaRequest.current) {
        Alert.alert('RAID Media Player', 'تعذر تشغيل فيديو الصفحة مباشرة داخل RAID.');
      }
      manualMediaRequest.current = false;
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

  const onMediaMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    if (raw.startsWith('RAID_MEDIA_DOWNLOAD:')) {
      const candidate = raw.slice('RAID_MEDIA_DOWNLOAD:'.length).trim();
      if (/^https:\/\//i.test(candidate)) handleFileDownload(candidate);
      return;
    }
    if (raw === 'RAID_MEDIA_CLOSE') {
      setMediaOpen(false);
      return;
    }
    if (raw === 'RAID_MEDIA_STATUS:SOURCE_ERROR') return;
  };

  const openMediaPlayer = () => {
    setMenuOpen(false);
    manualMediaRequest.current = true;
    scanMedia();
    web.current?.injectJavaScript(PLAY_PAGE_VIDEO_JS);
  };

  const speakReader = () => {
    if (!reader?.text) return;
    const chunks = splitSpeechText(reader.text.slice(0, 12000), Speech.maxSpeechInputLength);
    void Speech.stop().then(() => {
      chunks.forEach((chunk) => {
        Speech.speak(chunk, { language: 'ar', rate: 0.92, pitch: 1 });
      });
    });
  };
  const stopSpeech = () => Speech.stop();
  const changeReaderFont = (delta: number) => setFontSize((current) => {
    const next = Math.min(30, Math.max(15, current + delta));
    void setSetting('reader_font_size', next);
    return next;
  });
  const toggleReaderTheme = () => setReaderDark((current) => {
    const next = !current;
    void setSetting('reader_dark', next);
    return next;
  });

  const shareCurrent = () => {
    setMenuOpen(false);
    void Share.share({ title, message: `${title}\n${loadedUrl}`, url: loadedUrl }).catch(() => {
      Alert.alert('RAID Browser', 'تعذرت مشاركة الصفحة. حاول مرة أخرى.');
    });
  };

  const shareMedia = () => {
    if (!mediaUrl) return;
    void Share.share({ title: 'RAID Media', message: mediaUrl, url: mediaUrl }).catch(() => {
      Alert.alert('RAID Media', 'تعذرت مشاركة رابط الفيديو. حاول مرة أخرى.');
    });
  };

  const openAI = () => {
    if (privateMode) return;
    setMenuOpen(false);
    captureContext();
    setTimeout(() => router.push({ pathname: '/ai', params: { url: loadedUrl, title } }), 120);
  };

  const goHome = () => router.replace('/');

  const shouldLoad = (requestUrl: string) => {
    if (isDirectMediaUrl(requestUrl)) {
      // Let the direct media document load in the main WebView; RAID then places
      // its controls over that page's video instead of opening a separate modal.
      return true;
    }
    if (isLikelyDownloadRequest(requestUrl)) {
      handleFileDownload(requestUrl);
      return false;
    }
    if (safeExternalUrl(requestUrl)) return true;
    if (/^(mailto:|tel:|sms:)/i.test(requestUrl)) {
      void Linking.openURL(requestUrl).catch(() => {
        Alert.alert('RAID Browser', 'لا يوجد تطبيق مناسب لفتح هذا الرابط.');
      });
    }
    return false;
  };

  const secure = loadedUrl.startsWith('https://');
  const insecureHttp = loadedUrl.startsWith('http://');
  const host = hostOf(loadedUrl);
  const addressValue = addressFocused ? input : host;
  const visibleSuggestions = addressFocused && !privateMode ? historySuggestions.filter((item) => { const value=input.trim().toLowerCase(); return !value || `${item.title} ${item.url}`.toLowerCase().includes(value); }).slice(0,5) : [];
  const openHistorySuggestion = (item:{url:string}) => { Keyboard.dismiss(); setAddressFocused(false); setHistorySuggestions([]); setInput(item.url); setUrl(item.url); };
  const playerHtml = useMemo(() => mediaUrl ? mediaPlayerHtml(mediaUrl) : '', [mediaUrl]);
  const hasCustomSitePrefs = sitePrefs.desktopMode || !sitePrefs.thirdPartyCookies || !sitePrefs.autoplayMedia || !sitePrefs.adBlock;

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
            onFocus={() => { setAddressFocused(true); setInput(loadedUrl); if (!privateMode) void getRecentSites(40).then(setHistorySuggestions).catch(() => setHistorySuggestions([])); }}
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
          {addressFocused && input.length > 0 ? (
            <Pressable
              onPress={() => setInput('')}
              hitSlop={6}
              style={styles.clearAddress}
              accessibilityRole="button"
              accessibilityLabel="مسح شريط العنوان"
              accessibilityHint="يمسح الرابط أو عبارة البحث الحالية"
            >
              <Ionicons name="close-circle" size={19} color="#AFA79F" />
            </Pressable>
          ) : hasCustomSitePrefs && !addressFocused ? <View style={styles.siteBadge}><Ionicons name="options" size={12} color="#D5AA88" /></View> : null}
        </View>
        <Pressable onPress={() => router.push('/tabs')} style={[styles.icon, styles.tabsButton]} accessibilityRole="button" accessibilityLabel={`التبويبات، ${tabCount} مفتوحة`}>
          <Ionicons name="albums-outline" size={20} color="#CBD5E1" />
          {tabCount > 0 && <View pointerEvents="none" style={styles.tabCountBadge}><Text numberOfLines={1} style={styles.tabCountText}>{tabCount > 99 ? '99+' : tabCount}</Text></View>}
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.icon} accessibilityRole="button" accessibilityLabel="قائمة وإعدادات المتصفح"><Ionicons name="menu" size={22} color="#CBD5E1" /></Pressable>
      </View>

      {visibleSuggestions.length>0 && <View style={styles.suggestionPanel}>
        {visibleSuggestions.map((item,index)=><Pressable
          key={item.url}
          onPressIn={()=>openHistorySuggestion(item)}
          accessibilityRole="button"
          accessibilityLabel={`فتح ${item.title||hostOf(item.url)} من سجل التصفح`}
          style={[styles.suggestionRow,index<visibleSuggestions.length-1&&styles.suggestionDivider]}>
          <Ionicons name="time-outline" size={17} color="#D5AA88"/>
          <View style={styles.suggestionCopy}><Text numberOfLines={1} style={styles.suggestionTitle}>{item.title||hostOf(item.url)}</Text><Text numberOfLines={1} style={styles.suggestionUrl}>{item.url}</Text></View>
          <Ionicons name="arrow-back-outline" size={16} color="#8E969F"/>
        </Pressable>)}
      </View>}

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
          onLoadStart={(event) => {
            const stopped = intentionalStop.current;
            if (stopped && (Date.now() > stopped.expiresAt || !urlsReferToSameDocument(event.nativeEvent.url, stopped.url))) {
              intentionalStop.current = null;
            }
            mainDocumentUrl.current = event.nativeEvent.url;
            if (postLoadWorkTimer.current) {
              clearTimeout(postLoadWorkTimer.current);
              postLoadWorkTimer.current = null;
            }
            lastProgressRef.current = 0.05;
            setLoading(true);
            setLoadProgress(0.05);
            setLoadError('');
            setMediaUrls([]);
            manualMediaRequest.current = false;
            setPageProtection({ adsRemoved: 0, popupsBlocked: 0 });
          }}
          onLoadProgress={(event) => updateLoadProgress(event.nativeEvent.progress)}
          onLoadEnd={(event) => {
            const stopped = intentionalStop.current;
            if (stopped && Date.now() <= stopped.expiresAt && urlsReferToSameDocument(event.nativeEvent.url, stopped.url)) {
              lastProgressRef.current = 0;
              setLoading(false);
              setLoadProgress(0);
              return;
            }
            // react-native-webview calls onLoadEnd after onError as well. Do not
            // treat a failed navigation as a loaded page or inject post-load work.
            if ('code' in event.nativeEvent) {
              lastProgressRef.current = 0;
              setLoading(false);
              setLoadProgress(0);
              return;
            }
            lastProgressRef.current = 1;
            setLoading(false);
            setLoadProgress(1);
            schedulePostLoadWork(event.nativeEvent.url);
          }}
          onError={(event) => {
            const stopped = intentionalStop.current;
            if (stopped && Date.now() <= stopped.expiresAt && urlsReferToSameDocument(event.nativeEvent.url, stopped.url)) {
              intentionalStop.current = null;
              setLoading(false);
              setLoadProgress(0);
              setLoadError('');
              return;
            }
            intentionalStop.current = null;
            setLoading(false);
            setLoadProgress(0);
            setLoadError(event.nativeEvent.description || 'تعذر تحميل الصفحة');
          }}
          onHttpError={(event) => {
            const { statusCode, url: failedUrl } = event.nativeEvent;
            // Android reports HTTP failures for page resources too (images,
            // scripts, favicons and frames). Only a failure of the main document
            // should replace an otherwise usable page with RAID's error card.
            if (statusCode >= 400 && urlsReferToSameDocument(failedUrl, mainDocumentUrl.current)) {
              setLoadError(`خطأ HTTP ${statusCode}`);
            }
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
        <Pressable disabled={bookmarkBusy} onPress={toggleBookmark} style={[styles.nav, bookmarkBusy && styles.disabled]} accessibilityRole="button" accessibilityLabel={bookmarked ? 'إزالة المفضلة' : 'إضافة للمفضلة'} accessibilityState={{ disabled: bookmarkBusy, busy: bookmarkBusy }}><Ionicons name={bookmarked ? 'star' : 'star-outline'} size={24} color={bookmarked ? '#FBBF24' : '#CBD5E1'} /></Pressable>
        <Pressable onPress={openVpn} style={[styles.vpn, vpnConnected && styles.vpnOn]} accessibilityRole="button" accessibilityLabel={vpnConnected ? 'RAID VPN متصل، فتح الحالة' : 'RAID VPN غير متصل، فتح الإعداد'}><Ionicons name={vpnConnected ? 'shield-checkmark' : 'shield-outline'} size={14} color="#D1FAE5" /><Text style={styles.vpnText}>VPN</Text></Pressable>
        <Pressable disabled={privateMode} onPress={openAI} style={[styles.ai, privateMode && styles.aiDisabled]} accessibilityRole="button" accessibilityLabel="RAID AI"><Text style={styles.aiText}>AI</Text></Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.overlay, { paddingTop: insets.top + 62, paddingBottom: Math.max(insets.bottom, 10) }]} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.menuContent}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>RAID Browser</Text>
                <Text numberOfLines={1} style={styles.menuHost}>{host}</Text>
              </View>
              <Pressable disabled={bookmarkBusy} style={[styles.menuItem, bookmarkBusy && styles.disabled]} onPress={toggleBookmark} accessibilityRole="button" accessibilityState={{ disabled: bookmarkBusy, busy: bookmarkBusy }}><Ionicons name={bookmarked ? 'star' : 'star-outline'} size={19} color="#D5AA88" /><Text style={styles.menuText}>{bookmarked ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={openMediaPlayer}><Ionicons name="play-circle-outline" size={20} color="#D5AA88" /><Text style={styles.menuText}>{mediaUrls.length ? `RAID Media Player • ${mediaUrls.length}` : 'تشغيل فيديو الصفحة'}</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={openReader}><Ionicons name="reader-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>وضع القراءة</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={toggleDesktop}><Ionicons name={sitePrefs.desktopMode ? 'phone-portrait-outline' : 'desktop-outline'} size={19} color="#D5AA88" /><Text style={styles.menuText}>{sitePrefs.desktopMode ? 'عرض الهاتف لهذا الموقع' : 'عرض سطح المكتب لهذا الموقع'}</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={openDownloads}><Ionicons name="download-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>التنزيلات</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={shareCurrent}><Ionicons name="share-social-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>مشاركة الصفحة</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setSiteInfoOpen(true); }}><Ionicons name="options-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>أمان وإعدادات الموقع</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={openVpn}><Ionicons name={vpnConnected ? 'shield-checkmark' : 'shield-outline'} size={19} color="#D5AA88" /><Text style={styles.menuText}>{vpnConnected ? 'RAID VPN • متصل' : 'RAID VPN'}</Text></Pressable>
              {!privateMode && <Pressable style={styles.menuItem} onPress={openAI}><Ionicons name="sparkles-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>اسأل RAID AI عن الصفحة</Text></Pressable>}
              <View style={styles.menuDivider} />
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push({ pathname: '/library', params: { tab: 'history' } }); }}><Ionicons name="time-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>السجل</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push({ pathname: '/library', params: { tab: 'bookmarks' } }); }}><Ionicons name="bookmark-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>المفضلة</Text></Pressable>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/settings'); }}><Ionicons name="settings-outline" size={19} color="#D5AA88" /><Text style={styles.menuText}>الإعدادات</Text></Pressable>
            </ScrollView>
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

            <View style={[styles.pageShield, !sitePrefs.adBlock && styles.pageShieldOff]}>
              <View style={styles.pageShieldIcon}><Ionicons name={sitePrefs.adBlock ? 'shield-checkmark' : 'shield-outline'} size={20} color={sitePrefs.adBlock ? '#72C5A9' : '#8E969F'} /></View>
              <View style={styles.pageShieldCopy}>
                <Text style={styles.pageShieldTitle}>حماية الصفحة الحالية</Text>
                <Text style={styles.pageShieldText}>{sitePrefs.adBlock ? `${pageProtection.adsRemoved} إعلان • ${pageProtection.popupsBlocked} نافذة تلقائية` : 'الحماية متوقفة لهذا الموقع'}</Text>
              </View>
            </View>

            <View style={styles.siteControls}>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>عرض سطح المكتب</Text><Text style={styles.siteControlHint}>يتذكر RAID هذا الاختيار لهذا الموقع</Text></View><Switch value={sitePrefs.desktopMode} disabled={sitePreferencesBusy} onValueChange={(value) => void updateSitePreference({ desktopMode: value }, true)} trackColor={{false:'#3B4247',true:'#8C6D58'}} thumbColor="#F4EEE8" /></View>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>كوكيز الطرف الثالث</Text><Text style={styles.siteControlHint}>عطّلها لهذا الموقع لخصوصية أعلى</Text></View><Switch value={!privateMode && sitePrefs.thirdPartyCookies} disabled={privateMode || sitePreferencesBusy} onValueChange={(value) => void updateSitePreference({ thirdPartyCookies: value }, true)} trackColor={{false:'#3B4247',true:'#8C6D58'}} thumbColor="#F4EEE8" /></View>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>حجب الإعلانات والنوافذ التلقائية</Text><Text style={styles.siteControlHint}>يعمل فعليًا داخل هذا الموقع وتُسجّل النتائج محليًا</Text></View><Switch value={sitePrefs.adBlock} disabled={sitePreferencesBusy} onValueChange={(value) => void updateSitePreference({ adBlock: value })} trackColor={{false:'#3B4247',true:'#4F8C78'}} thumbColor="#F4EEE8" /></View>
              <View style={styles.siteControlRow}><View style={styles.siteControlCopy}><Text style={styles.siteControlTitle}>تشغيل الوسائط تلقائيًا</Text><Text style={styles.siteControlHint}>تحكم مستقل بكل موقع</Text></View><Switch value={sitePrefs.autoplayMedia} disabled={sitePreferencesBusy} onValueChange={(value) => void updateSitePreference({ autoplayMedia: value })} trackColor={{false:'#3B4247',true:'#8C6D58'}} thumbColor="#F4EEE8" /></View>
            </View>

            {privateMode && <Text style={styles.privateSiteNote}>الوضع الخاص لا يحفظ تغييرات إعدادات الموقع بعد إغلاق الجلسة.</Text>}
            {hasCustomSitePrefs && <Pressable disabled={sitePreferencesBusy} onPress={() => void resetCurrentSite()} style={[styles.siteReset, sitePreferencesBusy && styles.disabled]} accessibilityRole="button" accessibilityState={{disabled:sitePreferencesBusy}}><Ionicons name="refresh-outline" size={17} color="#D5AA88" /><Text style={styles.siteResetText}>إعادة إعدادات هذا الموقع</Text></Pressable>}
            <Pressable onPress={() => setSiteInfoOpen(false)} style={styles.siteClose}><Text style={styles.siteCloseText}>تم</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={mediaOpen} animationType="slide" onRequestClose={() => setMediaOpen(false)}>
        <SafeAreaView style={styles.mediaRoot} edges={['top','bottom','left','right']}>
          <View style={styles.mediaTop}>
            <Pressable onPress={() => setMediaOpen(false)} style={styles.mediaClose} accessibilityRole="button" accessibilityLabel="إغلاق مشغل الفيديو"><Text style={styles.mediaCloseText}>×</Text></Pressable>
            <View style={styles.mediaHeading}><Text style={styles.mediaTitle}>RAID Media Player</Text><Text numberOfLines={1} style={styles.mediaHost}>{hostOf(mediaUrl)}</Text></View>
            <Pressable onPress={shareMedia} style={styles.mediaAction} accessibilityRole="button" accessibilityLabel="مشاركة رابط الفيديو"><Ionicons name="share-social-outline" size={19} color="#E2E8F0" /></Pressable>
          </View>
          {!!mediaUrl && <WebView
            key={mediaUrl}
            source={{ html: playerHtml, baseUrl: loadedUrl }}
            style={styles.mediaWeb}
            javaScriptEnabled
            domStorageEnabled={false}
            cacheEnabled
            sharedCookiesEnabled={!privateMode}
            thirdPartyCookiesEnabled={!privateMode && sitePrefs.thirdPartyCookies}
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            originWhitelist={['http://*','https://*','about:blank']}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            onMessage={onMediaMessage}
          />}
          {mediaUrls.length > 1 && <View style={styles.mediaSourceBar}><Text style={styles.mediaSourceLabel}>المصادر المتاحة</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaSources}>
            {mediaUrls.map((candidate, index) => <Pressable key={`${candidate}-${index}`} onPress={() => setMediaUrl(candidate)} accessibilityRole="button" accessibilityLabel={`تشغيل المصدر ${index + 1}`} style={[styles.mediaSource, candidate === mediaUrl && styles.mediaSourceOn]}><Text style={styles.mediaSourceText}>مصدر {index + 1}</Text></Pressable>)}
          </ScrollView></View>}
        </SafeAreaView>
      </Modal>

      <Modal visible={!!reader} animationType="slide" onRequestClose={closeReader}>
        <SafeAreaView style={[styles.readerRoot, readerDark ? styles.readerDark : styles.readerLight]} edges={['top','bottom']}>
          <View style={styles.readerTop}>
            <Pressable onPress={closeReader} style={styles.readerBtn} accessibilityRole="button" accessibilityLabel="إغلاق وضع القراءة وإيقاف الاستماع"><Text style={styles.readerBtnText}>×</Text></Pressable>
            <Text style={[styles.readerTitle, !readerDark && styles.readerInk]} numberOfLines={1}>{reader?.title || 'وضع القراءة'}</Text>
            <Pressable onPress={toggleReaderTheme} style={styles.readerBtn} accessibilityRole="button" accessibilityLabel={readerDark ? 'استخدام خلفية فاتحة للقراءة' : 'استخدام خلفية داكنة للقراءة'}><Ionicons name={readerDark ? 'sunny-outline' : 'moon-outline'} size={20} color="#fff" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.readerContent}>
            <Text style={[styles.readerHeadline, !readerDark && styles.readerInk]}>{reader?.title}</Text>
            <Text selectable style={[styles.readerBody, {fontSize, lineHeight: fontSize * 1.75}, !readerDark && styles.readerInk]}>{reader?.text}</Text>
          </ScrollView>
          <View style={styles.readerTools}>
            <Pressable onPress={() => changeReaderFont(-2)} style={styles.readerTool} accessibilityRole="button" accessibilityLabel="تصغير خط القراءة"><Text style={styles.readerToolText}>A−</Text></Pressable>
            <Pressable onPress={() => changeReaderFont(2)} style={styles.readerTool} accessibilityRole="button" accessibilityLabel="تكبير خط القراءة"><Text style={styles.readerToolText}>A+</Text></Pressable>
            <Pressable onPress={speakReader} style={styles.readerTool} accessibilityRole="button" accessibilityLabel="الاستماع إلى النص"><Text style={styles.readerToolText}>استماع</Text></Pressable>
            <Pressable onPress={stopSpeech} style={styles.readerTool} accessibilityRole="button" accessibilityLabel="إيقاف الاستماع"><Text style={styles.readerToolText}>إيقاف</Text></Pressable>
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
  tabsButton:{position:'relative'},tabCountBadge:{position:'absolute',top:-4,right:-4,minWidth:20,height:20,paddingHorizontal:4,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#B88766',borderWidth:2,borderColor:'#242725'},tabCountText:{color:'#fff',fontSize:9,fontWeight:'900',fontVariant:['tabular-nums']},
  omni:{flex:1,height:42,borderRadius:16,backgroundColor:'#303330',flexDirection:'row',alignItems:'center',paddingHorizontal:9,borderWidth:1,borderColor:'#484B47'},securityButton:{width:28,height:38,alignItems:'center',justifyContent:'center'},input:{flex:1,color:'#F8F3EE',fontSize:14,paddingVertical:0,textAlign:'left'},clearAddress:{width:30,height:38,alignItems:'center',justifyContent:'center'},siteBadge:{width:24,height:24,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#41443F'},
  suggestionPanel:{backgroundColor:'#252927',borderBottomWidth:1,borderBottomColor:'#454A46',paddingHorizontal:10},suggestionRow:{minHeight:52,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:8},suggestionDivider:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#454A46'},suggestionCopy:{flex:1},suggestionTitle:{color:'#F2EEE9',fontSize:12,fontWeight:'800',textAlign:'right'},suggestionUrl:{color:'#8E969F',fontSize:9,marginTop:3,textAlign:'right'},
  private:{paddingVertical:6,paddingHorizontal:12,backgroundColor:'#3A302E'},privateText:{color:'#E7C9B6',fontSize:11,textAlign:'center',fontWeight:'700'},rendererNotice:{paddingVertical:7,paddingHorizontal:12,backgroundColor:'#343735',borderBottomWidth:1,borderBottomColor:'#555A55'},rendererNoticeText:{color:'#E7DED5',fontSize:11,textAlign:'center',fontWeight:'800'},
  progressTrack:{height:3,backgroundColor:'#282B29',overflow:'hidden'},progress:{height:3,backgroundColor:'#D5AA88'},webWrap:{flex:1,backgroundColor:'#fff'},web:{flex:1},
  errorCard:{position:'absolute',left:20,right:20,top:26,padding:22,borderRadius:22,backgroundColor:'#2B2E2C',borderWidth:1,borderColor:'#4B4F4B',shadowColor:'#000',shadowOpacity:.22,shadowRadius:14,elevation:8},errorTitle:{color:'#fff',fontSize:20,fontWeight:'900',textAlign:'center'},errorHost:{color:'#D5AA88',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:6},errorText:{color:'#D9D2CB',fontSize:13,lineHeight:19,textAlign:'center',marginTop:10},errorActions:{flexDirection:'row-reverse',gap:10,marginTop:18},retryBtn:{flex:1,minHeight:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#B88766'},retryText:{color:'#fff',fontWeight:'900'},errorSecondary:{flex:1,minHeight:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#3B3E3B'},errorSecondaryText:{color:'#D9D2CB',fontWeight:'800'},
  bottom:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:7,backgroundColor:'#242725',borderTopWidth:1,borderTopColor:'#3D403D'},nav:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},disabled:{opacity:.25},navPrimary:{width:44,height:44,borderRadius:16,backgroundColor:'#3A3D3A',alignItems:'center',justifyContent:'center'},vpn:{minWidth:52,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:4,backgroundColor:'#343A36',paddingHorizontal:7},vpnOn:{backgroundColor:'#315044'},vpnText:{fontSize:10,fontWeight:'900',color:'#D1FAE5'},ai:{width:42,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#8B654E'},aiDisabled:{opacity:.3},aiText:{fontSize:11,fontWeight:'900',color:'#fff'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.48)',alignItems:'flex-end',paddingHorizontal:12},menuCard:{width:292,maxWidth:'90%',maxHeight:'100%',borderRadius:22,backgroundColor:'#2D302E',borderWidth:1,borderColor:'#4C504C',overflow:'hidden'},menuContent:{paddingBottom:5},menuHeader:{paddingHorizontal:17,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#4C504C'},menuTitle:{color:'#FFF9F2',fontSize:16,fontWeight:'900'},menuHost:{color:'#B9B1A9',fontSize:11,marginTop:3},menuItem:{minHeight:48,flexDirection:'row',alignItems:'center',paddingHorizontal:15,gap:12},menuText:{flex:1,color:'#EEE8E2',fontSize:14,fontWeight:'700'},menuDivider:{height:1,backgroundColor:'#4C504C',marginVertical:3},
  centerOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.60)',alignItems:'center',justifyContent:'center',padding:22},siteCard:{width:'100%',maxWidth:420,borderRadius:27,padding:22,backgroundColor:'#2D302E',borderWidth:1,borderColor:'#4C504C'},siteHeaderIcon:{width:46,height:46,borderRadius:16,alignSelf:'center',alignItems:'center',justifyContent:'center',backgroundColor:'#3A3D3A',marginBottom:10},siteTitle:{color:'#FFF9F2',fontSize:20,fontWeight:'900',textAlign:'center'},siteState:{color:'#7FB890',fontSize:13,fontWeight:'900',textAlign:'center',marginTop:10},siteWarn:{color:'#D8A56F'},siteHost:{color:'#D5AA88',fontSize:12,textAlign:'center',marginTop:7},siteBody:{color:'#CFC7BF',fontSize:12,lineHeight:19,textAlign:'center',marginTop:12},siteControls:{marginTop:18,borderTopWidth:1,borderBottomWidth:1,borderColor:'#474B47'},siteControlRow:{minHeight:68,flexDirection:'row-reverse',alignItems:'center',gap:12,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#474B47'},siteControlCopy:{flex:1},siteControlTitle:{color:'#F7F1EA',fontWeight:'900',fontSize:13,textAlign:'right'},siteControlHint:{color:'#AFA79F',fontSize:10,lineHeight:15,textAlign:'right',marginTop:3},privateSiteNote:{color:'#CDAF9B',fontSize:10,lineHeight:15,textAlign:'center',marginTop:12},siteReset:{height:44,borderRadius:14,borderWidth:1,borderColor:'#5B514A',backgroundColor:'#373A37',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7,marginTop:14},siteResetText:{color:'#E7DED5',fontSize:11,fontWeight:'800'},siteClose:{height:48,borderRadius:15,backgroundColor:'#B88766',alignItems:'center',justifyContent:'center',marginTop:14},siteCloseText:{color:'#fff',fontWeight:'900'},
  mediaRoot:{flex:1,backgroundColor:'#03060A'},mediaTop:{height:62,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,backgroundColor:'#0A1020',borderBottomWidth:1,borderBottomColor:'#1E293B'},mediaClose:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},mediaCloseText:{color:'#fff',fontSize:25,fontWeight:'900'},mediaHeading:{flex:1},mediaTitle:{color:'#fff',fontSize:15,fontWeight:'900'},mediaHost:{color:'#94A3B8',fontSize:11,marginTop:2},mediaAction:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},mediaWeb:{flex:1,backgroundColor:'#000'},mediaSourceBar:{backgroundColor:'#0A1020',borderTopWidth:1,borderTopColor:'#1E293B',paddingTop:6,maxHeight:82},mediaSourceLabel:{color:'#94A3B8',fontSize:10,fontWeight:'800',textAlign:'right',paddingHorizontal:12},mediaSources:{paddingHorizontal:10,paddingVertical:8,gap:7},mediaSource:{height:36,paddingHorizontal:13,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033',borderWidth:1,borderColor:'#263348'},mediaSourceOn:{backgroundColor:'#8B654E',borderColor:'#B88766'},mediaSourceText:{color:'#fff',fontSize:11,fontWeight:'800'},
  readerRoot:{flex:1},readerDark:{backgroundColor:'#0C1018'},readerLight:{backgroundColor:'#F6F1E7'},readerTop:{height:62,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10,borderBottomWidth:1,borderBottomColor:'#334155'},readerBtn:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},readerBtnText:{color:'#fff',fontSize:22,fontWeight:'800'},readerTitle:{flex:1,color:'#fff',fontSize:15,fontWeight:'800'},readerInk:{color:'#241F1A'},readerContent:{paddingHorizontal:24,paddingTop:26,paddingBottom:80,maxWidth:760,width:'100%',alignSelf:'center'},readerHeadline:{fontSize:28,lineHeight:38,color:'#F8FAFC',fontWeight:'900',marginBottom:22,textAlign:'right'},readerBody:{color:'#E2E8F0',textAlign:'right'},readerTools:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderTopWidth:1,borderTopColor:'#334155'},readerTool:{minWidth:58,height:42,borderRadius:13,backgroundColor:'#1E293B',alignItems:'center',justifyContent:'center',paddingHorizontal:9},readerToolText:{color:'#fff',fontWeight:'800',fontSize:12},
  pageShield:{width:'100%',marginTop:14,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:11,borderRadius:16,backgroundColor:'#233831',borderWidth:1,borderColor:'#365D50'},
  pageShieldOff:{backgroundColor:'#292C2A',borderColor:'#414542'},
  pageShieldIcon:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#1B2925'},
  pageShieldCopy:{flex:1,gap:2},
  pageShieldTitle:{color:'#F4EEE8',fontSize:13,fontWeight:'900',textAlign:'right'},
  pageShieldText:{color:'#AEB8B2',fontSize:11,fontWeight:'700',textAlign:'right',fontVariant:['tabular-nums']}
});
