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

export function safeExternalUrl(url: string) {
  const value = url.trim();
  if (!value || CONTROL_CHARS.test(value) || !HTTP_SCHEME.test(value)) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (!parsed.hostname || !validIpv4(parsed.hostname)) return false;
    // Credentials embedded in URLs are easy to disguise in the omnibox and can
    // make a malicious destination look trusted. RAID never navigates to them.
    if (parsed.username || parsed.password) return false;
    return true;
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

  // Host:port input (for example localhost:3000 or example.com:8443) is
  // syntactically similar to a URI scheme. Resolve valid web hosts first so
  // development servers and explicit web ports are not rejected as schemes.
  // URL parsing also recognizes internationalized domains (IDN), including
  // Arabic domains, and converts them to their canonical ASCII representation.
  if (looksLikeHost(value) || looksLikeInternationalHost(value)) {
    const rawHost = hostOnly(value);
    if (!validIpv4(rawHost)) throw new Error('Invalid IP address');
    // Local/private development services commonly do not provide TLS. Public hosts
    // still default to HTTPS, while loopback/RFC1918/link-local addresses use HTTP.
    const scheme = isLocalDevelopmentHost(value) ? 'http' : 'https';
    const candidate = `${scheme}://${value}`;
    if (safeExternalUrl(candidate)) return candidate;
  }

  // Never pass non-web schemes (javascript:, data:, file:, intent:, custom apps, etc.)
  // into the WebView. This also protects future schemes without maintaining a blocklist.
  if (EXPLICIT_SCHEME.test(value)) throw new Error('Unsupported URL scheme');

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
