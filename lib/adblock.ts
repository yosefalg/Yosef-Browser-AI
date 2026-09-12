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
    if (window.__raidAdBlockInstalled) return true;
    window.__raidAdBlockInstalled = true;
    const selectors = [
      '[id^="google_ads_"]','[id*="google_ads"]','[class*="google-ad"]',
      '[class*="adsbygoogle"]','ins.adsbygoogle','iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication.com"]','iframe[src*="adservice.google"]',
      '[data-ad-slot]','[data-ad-client]','[aria-label="Advertisement"]',
      '.ad-banner','.ad-container','.advertisement','.popup-ad','.popunder'
    ];
    const clean = () => {
      selectors.forEach((selector) => {
        try { document.querySelectorAll(selector).forEach((node) => node.remove()); } catch {}
      });
    };
    clean();
    let timer = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(clean, 120);
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch {}
  true;
})();`;

export const RAID_ADBLOCK_OFF_JS = `(() => {
  try { window.__raidAdBlockInstalled = false; } catch {}
  true;
})();`;
