const AD_HOST_PARTS = [
  'doubleclick.net','googlesyndication.com','googleadservices.com','adservice.google.com',
  'amazon-adsystem.com','adsrvr.org','adnxs.com','criteo.com','criteo.net','taboola.com',
  'outbrain.com','popads.net','popcash.net','propellerads.com','exoclick.com','trafficjunky.net',
];

const TRACKER_HOST_PARTS = [
  'google-analytics.com','googletagmanager.com','facebook.net','hotjar.com','scorecardresearch.com',
];

export function shouldBlockWebRequest(requestUrl: string, pageUrl: string, enabled: boolean) {
  if (!enabled) return false;
  try {
    const request = new URL(requestUrl);
    const page = new URL(pageUrl);
    if (!/^https?:$/.test(request.protocol)) return false;
    if (request.hostname === page.hostname) return false;
    const host = request.hostname.toLowerCase();
    return [...AD_HOST_PARTS, ...TRACKER_HOST_PARTS].some((part) => host === part || host.endsWith(`.${part}`));
  } catch {
    return false;
  }
}

export const RAID_COSMETIC_ADBLOCK_JS = `(() => {
  try {
    if (window.__raidAdBlockInstalled) {
      window.__raidAdBlockClean?.();
      return true;
    }
    window.__raidAdBlockInstalled = true;

    const report = (adsRemoved, popupsBlocked) => {
      if (!adsRemoved && !popupsBlocked) return;
      window.ReactNativeWebView?.postMessage('RAID_PROTECTION:' + JSON.stringify({ adsRemoved, popupsBlocked }));
    };
    const selectors = [
      '[id^="google_ads_"]','[id*="google_ads"]','[class*="google-ad"]',
      '[class*="adsbygoogle"]','ins.adsbygoogle','iframe[id^="google_ads_iframe"]',
      'iframe[src*="doubleclick.net"]','iframe[src*="googlesyndication.com"]',
      'iframe[src*="adservice.google"]','[data-ad-slot]','[data-ad-client]',
      '[data-ad-unit]','[aria-label="Advertisement"]','[aria-label="إعلان"]',
      '.ad-banner','.ad-container','.ad-wrapper','.ad-slot','.advertisement',
      '.popup-ad','.popunder'
    ];

    const clean = () => {
      if (!window.__raidAdBlockInstalled) return;
      const removed = new Set();
      selectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((node) => {
            if (!removed.has(node) && node.isConnected) {
              removed.add(node);
              node.remove();
            }
          });
        } catch {}
      });
      report(removed.size, 0);
    };
    window.__raidAdBlockClean = clean;

    const observe = () => {
      if (!window.__raidAdBlockInstalled || window.__raidAdBlockObserver) return;
      const root = document.documentElement || document.body;
      if (!root) return;
      clean();
      window.__raidAdBlockObserver = new MutationObserver(() => {
        clearTimeout(window.__raidAdBlockTimer);
        window.__raidAdBlockTimer = setTimeout(clean, 140);
      });
      window.__raidAdBlockObserver.observe(root, { childList: true, subtree: true });
    };
    if (document.documentElement || document.body) observe();
    else document.addEventListener('DOMContentLoaded', observe, { once: true });

    window.__raidLastGesture = 0;
    window.__raidAdBlockGestureHandler = () => { window.__raidLastGesture = Date.now(); };
    document.addEventListener('pointerdown', window.__raidAdBlockGestureHandler, true);
    document.addEventListener('keydown', window.__raidAdBlockGestureHandler, true);

    if (typeof window.open === 'function' && !window.__raidOriginalOpen) {
      window.__raidOriginalOpen = window.open;
      window.open = function(url, ...args) {
        if (Date.now() - (window.__raidLastGesture || 0) > 1500) {
          report(0, 1);
          return null;
        }
        return window.__raidOriginalOpen.call(this, url, ...args);
      };
    }
  } catch {}
  true;
})();`;

export const RAID_ADBLOCK_OFF_JS = `(() => {
  try {
    window.__raidAdBlockInstalled = false;
    window.__raidAdBlockObserver?.disconnect();
    window.__raidAdBlockObserver = null;
    clearTimeout(window.__raidAdBlockTimer);
    window.__raidAdBlockTimer = 0;
    if (window.__raidAdBlockGestureHandler) {
      document.removeEventListener('pointerdown', window.__raidAdBlockGestureHandler, true);
      document.removeEventListener('keydown', window.__raidAdBlockGestureHandler, true);
      window.__raidAdBlockGestureHandler = null;
    }
    window.__raidAdBlockClean = null;
    if (window.__raidOriginalOpen) {
      window.open = window.__raidOriginalOpen;
      window.__raidOriginalOpen = null;
    }
  } catch {}
  true;
})();`;
