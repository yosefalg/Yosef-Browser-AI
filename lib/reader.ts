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
    const score = (el) => {
      const text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
      const p = el.querySelectorAll('p').length;
      const links = el.querySelectorAll('a').length;
      return text.length + p * 120 - links * 20;
    };
    let best = candidates.sort((a,b) => score(b) - score(a))[0] || clone;
    let text = (best.innerText || '').replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+/g, ' ').trim();
    if (text.length < 240) text = (clone.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim();
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
    if (msg?.type !== 'RAID_READER' || !msg?.payload?.text) return null;
    return msg.payload as ReaderPayload;
  } catch {
    return null;
  }
}
