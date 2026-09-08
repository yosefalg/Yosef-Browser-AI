import { safeExternalUrl } from './url';

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
    if (
      value.type !== 'RAID_PAGE_CONTEXT' ||
      typeof value.url !== 'string' ||
      typeof value.text !== 'string'
    ) return null;

    const url = value.url.trim();
    const text = value.text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!safeExternalUrl(url) || !text) return null;

    const rawTitle = typeof value.title === 'string' ? value.title : url;
    const title = rawTitle.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      type: 'RAID_PAGE_CONTEXT',
      url: url.slice(0, 4096),
      title: title.slice(0, 300) || url.slice(0, 300),
      text: text.slice(0, 16000),
    };
  } catch {
    return null;
  }
}
