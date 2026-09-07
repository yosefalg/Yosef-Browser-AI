export type PageContextPayload = {
  type: 'RAID_PAGE_CONTEXT';
  url: string;
  title: string;
  text: string;
};

export const PAGE_CONTEXT_JS = `
(() => {
  try {
    const root = document.querySelector('main, article, [role="main"]') || document.body;
    const text = (root?.innerText || document.body?.innerText || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 16000);
    window.ReactNativeWebView?.postMessage(JSON.stringify({
      type: 'RAID_PAGE_CONTEXT',
      url: location.href,
      title: document.title || location.href,
      text
    }));
  } catch (_) {}
  true;
})();
`;

export function parsePageContext(raw: string): PageContextPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<PageContextPayload>;
    if (value.type !== 'RAID_PAGE_CONTEXT' || typeof value.url !== 'string' || typeof value.text !== 'string') return null;
    return {
      type: 'RAID_PAGE_CONTEXT',
      url: value.url,
      title: typeof value.title === 'string' ? value.title : value.url,
      text: value.text.slice(0, 16000),
    };
  } catch {
    return null;
  }
}
