const BLOCKED = /^(javascript|data|file|intent|vbscript):/i;

export function normalizeInput(input: string) {
  const value = input.trim();
  if (!value) return 'https://www.google.com';
  if (BLOCKED.test(value)) throw new Error('Unsafe URL scheme');
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function safeExternalUrl(url: string) {
  if (BLOCKED.test(url)) return false;
  return /^https?:\/\//i.test(url);
}
