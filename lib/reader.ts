import { safeExternalUrl } from './url';

export type ReaderPayload = {
  title: string;
  text: string;
  url: string;
};

export const READER_EXTRACT_JS = `
(() => {
  try {
    const selectors = ['script','style','noscript','svg','canvas','nav','footer','header','aside','form','button','iframe'];
    const clone = document.body.cloneNode(true);
    selectors.forEach((s) => clone.querySelectorAll(s).forEach((n) => n.remove()));
    const candidates = Array.from(clone.querySelectorAll('article, main, [role="main"], section, div'));
    let best = clone;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const text = (candidate.innerText || '').replace(/\\s+/g, ' ').trim();
      if (text.length < 240) continue;
      const paragraphs = candidate.querySelectorAll('p').length;
      const links = candidate.querySelectorAll('a').length;
      const candidateScore = text.length + paragraphs * 120 - links * 20;
      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    let text = (best.innerText || '').replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+/g, ' ').trim();
    if (text.length < 240) text = (clone.innerText || '').replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+/g, ' ').trim();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'RAID_READER',
      payload: { title: document.title || location.hostname, text: text.slice(0, 120000), url: location.href }
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RAID_READER_ERROR', message: String(e) }));
  }
})(); true;
`;

export function parseReaderMessage(raw: string): ReaderPayload | null {
  try {
    const msg = JSON.parse(raw);
    const payload = msg?.payload;
    if (
      msg?.type !== 'RAID_READER' ||
      typeof payload?.title !== 'string' ||
      typeof payload?.text !== 'string' ||
      typeof payload?.url !== 'string'
    ) return null;

    const text = payload.text.trim();
    const url = payload.url.trim();
    if (!text || !safeExternalUrl(url)) return null;

    return {
      title: payload.title.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300) || 'وضع القراءة',
      text: text.slice(0, 120000),
      url: url.slice(0, 4096),
    };
  } catch {
    return null;
  }
}
