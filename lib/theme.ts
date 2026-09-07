export type ThemeName = 'cinematic' | 'amoled' | 'light' | 'cyber';

export const themes = {
  cinematic: { bg: '#070B14', surface: '#111827', surface2: '#172033', text: '#F8FAFC', muted: '#94A3B8', accent: '#7C3AED', border: '#27324A' },
  amoled: { bg: '#000000', surface: '#090909', surface2: '#121212', text: '#FFFFFF', muted: '#A3A3A3', accent: '#8B5CF6', border: '#202020' },
  light: { bg: '#F4F7FB', surface: '#FFFFFF', surface2: '#EEF2F7', text: '#101828', muted: '#667085', accent: '#6D28D9', border: '#D0D5DD' },
  cyber: { bg: '#041018', surface: '#071A26', surface2: '#0B2433', text: '#E6FBFF', muted: '#78A7B8', accent: '#00D4FF', border: '#134052' }
} as const;

export function getTheme(name: ThemeName) {
  return themes[name];
}
