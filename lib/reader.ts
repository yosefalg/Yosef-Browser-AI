import { safeExternalUrl } from './url';

export type ReaderPayload = {
  title: string;
  text: string;
  url: string;
};

export const READER_EXTRACT_JS = `
(() => {
  try {
    const MIN_CONTENT = 220;
    const MAX_CONTENT = 120000;
    const clone = document.body.cloneNode(true);
    const noiseSelectors = [
      'script','style','noscript','svg','canvas','nav','footer','header','aside','form','button','iframe',
      'dialog','template','object','embed','video','audio','picture','source','input','textarea','select',
      '[aria-hidden="true"]','[hidden]','[role="navigation"]','[role="banner"]','[role="complementary"]',
      '[role="contentinfo"]','.advertisement','.advert','.ads','.ad-slot','.promo','.promotion','.cookie',
      '.newsletter','.subscribe','.social-share','.share-buttons','.comments','.comment-list','.related',
      '.recommended','.recommendations','.sidebar','.menu','.breadcrumb','.breadcrumbs','.pagination'
    ];
    noiseSelectors.forEach((selector) => {
      try { clone.querySelectorAll(selector).forEach((node) => node.remove()); } catch {}
    });

    const normalize = (value) => String(value || '')
      .replace(/\\u00a0/g, ' ')
      .replace(/[ \\t]+/g, ' ')
      .replace(/ *\\n */g, '\\n')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();

    const compact = (value) => normalize(value).replace(/\\s+/g, ' ');
    const classHint = (node) => (String(node.id || '') + ' ' + String(node.className || '')).toLowerCase();
    const positiveHint = /(article|story|content|entry|post|main|body|text|read|news)/i;
    const negativeHint = /(nav|menu|footer|header|aside|sidebar|share|social|comment|related|recommend|promo|advert|cookie|subscribe|newsletter|toolbar|widget)/i;

    const scoreNode = (node) => {
      const text = compact(node.innerText || node.textContent || '');
      if (text.length < MIN_CONTENT) return -Infinity;
      const links = Array.from(node.querySelectorAll('a'));
      const linkText = links.reduce((sum, link) => sum + compact(link.innerText || link.textContent || '').length, 0);
      const linkDensity = text.length ? Math.min(1, linkText / text.length) : 1;
      const paragraphs = node.querySelectorAll('p').length;
      const headings = node.querySelectorAll('h1,h2,h3').length;
      const lists = node.querySelectorAll('ul,ol').length;
      const punctuation = (text.match(/[.!?؟،,:؛]/g) || []).length;
      const hint = classHint(node);
      const semantic = node.matches('article,main,[role="main"]') ? 900 : node.matches('section') ? 180 : 0;
      const positive = positiveHint.test(hint) ? 320 : 0;
      const negative = negativeHint.test(hint) ? 650 : 0;
      const densityPenalty = Math.round(linkDensity * text.length * 1.3);
      const hugePenalty = text.length > 90000 ? Math.round((text.length - 90000) * 0.18) : 0;
      return text.length + paragraphs * 150 + headings * 70 + lists * 20 + Math.min(900, punctuation * 8) + semantic + positive - densityPenalty - negative - hugePenalty;
    };

    const candidates = Array.from(clone.querySelectorAll('article, main, [role="main"], section, div'));
    let best = clone;
    let bestScore = scoreNode(clone);
    for (const candidate of candidates) {
      const score = scoreNode(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    const extractBlocks = (root) => {
      const blocks = Array.from(root.querySelectorAll('h1,h2,h3,p,blockquote,pre,li'));
      const seen = new Set();
      const lines = [];
      for (const block of blocks) {
        const value = normalize(block.innerText || block.textContent || '');
        if (!value || value.length < 2) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (block.tagName === 'LI' && value.length < 18 && !/[.!?؟،,:؛]/.test(value)) continue;
        lines.push(value);
      }
      return normalize(lines.join('\\n\\n'));
    };

    let text = extractBlocks(best);
    if (text.length < MIN_CONTENT) text = normalize(best.innerText || best.textContent || '');
    if (text.length < MIN_CONTENT) text = extractBlocks(clone);
    if (text.length < MIN_CONTENT) text = normalize(clone.innerText || clone.textContent || '');

    const h1 = document.querySelector('article h1, main h1, [role="main"] h1, h1');
    const title = normalize((h1 && (h1.innerText || h1.textContent)) || document.title || location.hostname).slice(0, 300);

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'RAID_READER',
      payload: { title: title || location.hostname, text: text.slice(0, MAX_CONTENT), url: location.href }
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

    const text = payload.text
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const url = payload.url.trim();
    if (text.length < 40 || !safeExternalUrl(url)) return null;

    return {
      title: payload.title.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || 'وضع القراءة',
      text: text.slice(0, 120000),
      url: url.slice(0, 4096),
    };
  } catch {
    return null;
  }
}
