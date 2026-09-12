export type ThemeName = 'cinematic' | 'amoled' | 'light' | 'graphite' | 'teal' | 'ivory';

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
    bg: '#0B1118', surface: 'rgba(22,31,41,.72)', surface2: 'rgba(37,49,61,.76)', text: '#F4F8FB', muted: '#9EABB7', accent: '#76D8C8', border: 'rgba(255,255,255,.13)',
    gradient: ['#071018', '#0D1822', '#17162A'], accentGradient: ['#76D8C8', '#7767D8'],
  },
  graphite: {
    bg: '#0A0D11', surface: 'rgba(22,25,31,.78)', surface2: 'rgba(34,39,47,.82)', text: '#F7F8FA', muted: '#9CA5B1', accent: '#8DA7FF', border: 'rgba(255,255,255,.12)',
    gradient: ['#080B10', '#111722', '#171C29'], accentGradient: ['#8DA7FF', '#9A7CF7'],
  },
  teal: {
    bg: '#061413', surface: 'rgba(12,37,35,.76)', surface2: 'rgba(20,55,51,.82)', text: '#F1FFFC', muted: '#9CC7C0', accent: '#68E1C8', border: 'rgba(128,238,218,.16)',
    gradient: ['#051110', '#08201D', '#102B29'], accentGradient: ['#68E1C8', '#4EB6D8'],
  },
  amoled: {
    bg: '#000000', surface: 'rgba(10,13,17,.80)', surface2: 'rgba(19,24,31,.84)', text: '#FFFFFF', muted: '#909AA5', accent: '#82E1D0', border: 'rgba(255,255,255,.105)',
    gradient: ['#000000', '#030608', '#080712'], accentGradient: ['#82E1D0', '#6F5DD2'],
  },
  light: {
    bg: '#ECEFF1', surface: 'rgba(255,255,255,.72)', surface2: 'rgba(242,245,247,.82)', text: '#17212A', muted: '#687580', accent: '#237E77', border: 'rgba(30,52,67,.13)',
    gradient: ['#F7F9FA', '#E8EEF0', '#E5E1EC'], accentGradient: ['#55BDB0', '#7169C7'],
  },
  ivory: {
    bg: '#F1EEE8', surface: 'rgba(255,252,247,.82)', surface2: 'rgba(236,231,223,.86)', text: '#292A2D', muted: '#746F68', accent: '#8B6D56', border: 'rgba(76,66,58,.12)',
    gradient: ['#FAF7F2', '#EEE8DF', '#E3E0E4'], accentGradient: ['#B88C6A', '#8176B6'],
  },
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in themes;
}

export function getTheme(name: ThemeName): ThemePalette {
  return themes[name] ?? themes.cinematic;
}
