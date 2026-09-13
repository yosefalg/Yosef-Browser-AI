const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_SCHEME = /^https?:\/\//i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const DECEPTIVE_FORMAT_CHARS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;
const MAX_OMNIBOX_INPUT_LENGTH = 8192;

type SearchShortcut = {
  prefix: string;
  label: string;
  aliases: readonly string[];
  home: string;
  build: (query: string) => string;
};

export const SEARCH_SHORTCUTS: readonly SearchShortcut[] = [
  {
    prefix: '!g',
    label: 'Google',
    aliases: ['!g', '!google'],
    home: 'https://www.google.com',
    build: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!yt',
    label: 'YouTube',
    aliases: ['!yt', '!youtube', '!يوتيوب'],
    home: 'https://www.youtube.com',
    build: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!maps',
    label: 'Google Maps',
    aliases: ['!maps', '!map', '!خرائط'],
    home: 'https://www.google.com/maps',
    build: (query) => `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
  },
  {
    prefix: '!img',
    label: 'Google Images',
    aliases: ['!img', '!images', '!image', '!صور'],
    home: 'https://images.google.com',
    build: (query) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!news',
    label: 'Google News',
    aliases: ['!news', '!اخبار', '!أخبار'],
    home: 'https://news.google.com',
    build: (query) => `https://news.google.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!gh',
    label: 'GitHub',
    aliases: ['!gh', '!github', '!جتهاب'],
    home: 'https://github.com',
    build: (query) => `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`,
  },
  {
    prefix: '!so',
    label: 'Stack Overflow',
    aliases: ['!so', '!stackoverflow', '!ستاك'],
    home: 'https://stackoverflow.com',
    build: (query) => `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!npm',
    label: 'npm',
    aliases: ['!npm'],
    home: 'https://www.npmjs.com',
    build: (query) => `https://www.npmjs.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!mdn',
    label: 'MDN Web Docs',
    aliases: ['!mdn'],
    home: 'https://developer.mozilla.org',
    build: (query) => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!reddit',
    label: 'Reddit',
    aliases: ['!reddit', '!r', '!ريديت'],
    home: 'https://www.reddit.com',
    build: (query) => `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!tr',
    label: 'Google Translate',
    aliases: ['!tr', '!translate', '!ترجمة'],
    home: 'https://translate.google.com',
    build: (query) => `https://translate.google.com/?sl=auto&tl=ar&text=${encodeURIComponent(query)}&op=translate`,
  },
  {
    prefix: '!ddg',
    label: 'DuckDuckGo',
    aliases: ['!d', '!ddg', '!duck', '!duckduckgo'],
    home: 'https://duckduckgo.com',
    build: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!b',
    label: 'Bing',
    aliases: ['!b', '!bing'],
    home: 'https://www.bing.com',
    build: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!brave',
    label: 'Brave',
    aliases: ['!brave'],
    home: 'https://search.brave.com',
    build: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    prefix: '!wiki',
    label: 'Wikipedia',
    aliases: ['!w', '!wiki', '!wikipedia', '!ويكي'],
    home: 'https://ar.wikipedia.org',
    build: (query) => `https://ar.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`,
  },
] as const;

const COLON_SHORTCUTS: Readonly<Record<string, string>> = {
  'yt:': '!yt',
  'youtube:': '!yt',
  'يوتيوب:': '!yt',
  'maps:': '!maps',
  'map:': '!maps',
  'خرائط:': '!maps',
  'img:': '!img',
  'images:': '!img',
  'صور:': '!img',
  'news:': '!news',
  'اخبار:': '!news',
  'أخبار:': '!news',
  'gh:': '!gh',
  'github:': '!gh',
  'جتهاب:': '!gh',
  'so:': '!so',
  'stackoverflow:': '!so',
  'ستاك:': '!so',
  'npm:': '!npm',
  'mdn:': '!mdn',
  'reddit:': '!reddit',
  'ريديت:': '!reddit',
  'tr:': '!tr',
  'translate:': '!tr',
  'ترجمة:': '!tr',
  'wiki:': '!wiki',
  'ويكي:': '!wiki',
};

function looksLikeHost(value: string) {
  return (
    /^[\w-]+(\.[\w-]+)+(?::\d{1,5})?([/?#].*)?$/i.test(value) ||
    /^localhost(?::\d{1,5})?([/?#].*)?$/i.test(value) ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?([/?#].*)?$/.test(value) ||
    /^\[[0-9a-f:]+\](?::\d{1,5})?([/?#].*)?$/i.test(value)
  );
}

function looksLikeInternationalHost(value: string) {
  if (/\s/.test(value)) return false;

  const slash = value.search(/[/?#]/);
  const authority = slash >= 0 ? value.slice(0, slash) : value;
  if (!authority.includes('.')) return false;

  try {
    const parsed = new URL(`https://${value}`);
    return Boolean(parsed.hostname && parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

function hostOnly(value: string) {
  const slash = value.search(/[/?#]/);
  const authority = slash >= 0 ? value.slice(0, slash) : value;
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    return end >= 0 ? authority.slice(1, end).toLowerCase() : authority.toLowerCase();
  }
  return authority.split(':')[0].toLowerCase();
}

function validIpv4(host: string) {
  if (!/^\d+(?:\.\d+){3}$/.test(host)) return true;
  const parts = host.split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function isLocalDevelopmentHost(value: string) {
  const host = hostOnly(value);
  if (host === 'localhost' || host === '::1') return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isReasonableInputLength(value: string) {
  return value.length <= MAX_OMNIBOX_INPUT_LENGTH;
}

function shortcutTarget(value: string) {
  if (!value.startsWith('!')) return null;
  const match = value.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const alias = match[1].toLowerCase();
  const shortcut = SEARCH_SHORTCUTS.find((item) => item.aliases.some((candidate) => candidate.toLowerCase() === alias));
  if (!shortcut) return null;
  const query = (match[2] || '').trim();
  return query ? shortcut.build(query) : shortcut.home;
}

function colonShortcutTarget(value: string) {
  const lower = value.toLowerCase();
  const alias = Object.keys(COLON_SHORTCUTS).find((candidate) => lower.startsWith(candidate));
  if (!alias) return null;
  const shortcutPrefix = COLON_SHORTCUTS[alias];
  const shortcut = SEARCH_SHORTCUTS.find((item) => item.prefix === shortcutPrefix);
  if (!shortcut) return null;
  const query = value.slice(alias.length).trim();
  return query ? shortcut.build(query) : shortcut.home;
}

export function safeExternalUrl(url: string) {
  const value = url.trim();
  if (
    !value ||
    !isReasonableInputLength(value) ||
    CONTROL_CHARS.test(value) ||
    DECEPTIVE_FORMAT_CHARS.test(value) ||
    !HTTP_SCHEME.test(value)
  ) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (!parsed.hostname || !validIpv4(parsed.hostname)) return false;
    if (DECEPTIVE_FORMAT_CHARS.test(parsed.hostname)) return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeInput(input: string) {
  const value = input.trim();
  if (!value) return 'https://www.google.com';
  if (!isReasonableInputLength(value)) throw new Error('Input too long');
  if (CONTROL_CHARS.test(value) || DECEPTIVE_FORMAT_CHARS.test(value)) throw new Error('Unsafe URL characters');

  const shortcut = shortcutTarget(value) || colonShortcutTarget(value);
  if (shortcut) return shortcut;

  if (HTTP_SCHEME.test(value)) {
    if (!safeExternalUrl(value)) throw new Error('Invalid URL');
    return value;
  }

  if (looksLikeHost(value) || looksLikeInternationalHost(value)) {
    const rawHost = hostOnly(value);
    if (!validIpv4(rawHost)) throw new Error('Invalid IP address');
    const scheme = isLocalDevelopmentHost(value) ? 'http' : 'https';
    const candidate = `${scheme}://${value}`;
    if (safeExternalUrl(candidate)) return candidate;
  }

  if (EXPLICIT_SCHEME.test(value)) throw new Error('Unsupported URL scheme');

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
