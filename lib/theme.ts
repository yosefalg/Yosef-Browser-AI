export type ThemeName = 'cinematic' | 'amoled' | 'light';

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
    bg: '#070B14', surface: '#101725', surface2: '#151E30', text: '#F8FAFC', muted: '#8E9AAE', accent: '#7C3AED', border: '#27324A',
    gradient: ['#060910', '#0A1020', '#0D1424'], accentGradient: ['#8B5CF6', '#4F46E5'],
  },
  amoled: {
    bg: '#000000', surface: '#090A0C', surface2: '#111317', text: '#FFFFFF', muted: '#9CA3AF', accent: '#8B5CF6', border: '#24262B',
    gradient: ['#000000', '#020203', '#08080A'], accentGradient: ['#8B5CF6', '#5B21B6'],
  },
  light: {
    bg: '#F2F1EF', surface: '#FFFFFF', surface2: '#EAE8E4', text: '#24201D', muted: '#716B65', accent: '#6D5BD0', border: '#D8D4CE',
    gradient: ['#F8F7F5', '#F1EFEC', '#E8E5E1'], accentGradient: ['#7C6BE8', '#5E50C8'],
  },
};

export function getTheme(name: ThemeName): ThemePalette {
  return themes[name] ?? themes.cinematic;
}
