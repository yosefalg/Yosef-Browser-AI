export type ThemeName = 'cinematic' | 'amoled' | 'light' | 'cyber';

export type ThemePalette = {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  gradient: readonly [string, string, string];
  accentGradient: readonly [string, string];
};

export const themes: Record<ThemeName, ThemePalette> = {
  cinematic: {
    bg: '#070B14', surface: '#111827', surface2: '#172033', text: '#F8FAFC', muted: '#94A3B8', accent: '#7C3AED', border: '#27324A',
    gradient: ['#05070C', '#0A0F19', '#0D1220'], accentGradient: ['#7C3AED', '#4F46E5'],
  },
  amoled: {
    bg: '#000000', surface: '#090909', surface2: '#121212', text: '#FFFFFF', muted: '#A3A3A3', accent: '#8B5CF6', border: '#202020',
    gradient: ['#000000', '#030303', '#080808'], accentGradient: ['#8B5CF6', '#6D28D9'],
  },
  light: {
    bg: '#F4F7FB', surface: '#FFFFFF', surface2: '#EEF2F7', text: '#101828', muted: '#667085', accent: '#6D28D9', border: '#D0D5DD',
    gradient: ['#F8FAFC', '#F4F7FB', '#EEF2F7'], accentGradient: ['#7C3AED', '#6D28D9'],
  },
  cyber: {
    bg: '#041018', surface: '#071A26', surface2: '#0B2433', text: '#E6FBFF', muted: '#78A7B8', accent: '#00D4FF', border: '#134052',
    gradient: ['#031016', '#061924', '#082532'], accentGradient: ['#00D4FF', '#0284C7'],
  },
};

export function getTheme(name: ThemeName): ThemePalette {
  return themes[name] ?? themes.cinematic;
}
