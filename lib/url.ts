const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_SCHEME = /^https?:\/\//i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function looksLikeHost(value: string) {
  return (
    /^[\w-]+(\.[\w-]+)+(?::\d{1,5})?([/?#].*)?$/i.test(value) ||
    /^localhost(?::\d{1,5})?([/?#].*)?$/i.test(value) ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?([/?#].*)?$/.test(value) ||
    /^\[[0-9a-f:]+\](?::\d{1,5})?([/?#].*)?$/i.test(value)
  );
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

export function safeExternalUrl(url: string) {
  const value = url.trim();
  if (!value || CONTROL_CHARS.test(value) || !HTTP_SCHEME.test(value)) return false;

  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizeInput(input: string) {
  const value = input.trim();
  if (!value) return 'https://www.google.com';
  if (CONTROL_CHARS.test(value)) throw new Error('Unsafe URL characters');

  if (HTTP_SCHEME.test(value)) {
    if (!safeExternalUrl(value)) throw new Error('Invalid URL');
    return value;
  }

  // Never pass non-web schemes (javascript:, data:, file:, intent:, custom apps, etc.)
  // into the WebView. This also protects future schemes without maintaining a blocklist.
  if (EXPLICIT_SCHEME.test(value)) throw new Error('Unsupported URL scheme');

  if (looksLikeHost(value)) {
    // Local/private development services commonly do not provide TLS. Public hosts
    // still default to HTTPS, while loopback/RFC1918/link-local addresses use HTTP.
    const scheme = isLocalDevelopmentHost(value) ? 'http' : 'https';
    const candidate = `${scheme}://${value}`;
    if (safeExternalUrl(candidate)) return candidate;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
