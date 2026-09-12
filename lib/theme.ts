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
    bg: '#0B1118', surface: 'rgba(22,31,41,.72)', surface2: 'rgba(37,49,61,.76)', text: '#F4F8FB', muted: '#9EABB7', accent: '#76D8C8', border: 'rgba(255,255,255,.13)',
    gradient: ['#071018', '#0D1822', '#17162A'], accentGradient: ['#76D8C8', '#7767D8'],
  },
  amoled: {
    bg: '#000000', surface: 'rgba(10,13,17,.80)', surface2: 'rgba(19,24,31,.84)', text: '#FFFFFF', muted: '#909AA5', accent: '#82E1D0', border: 'rgba(255,255,255,.105)',
    gradient: ['#000000', '#030608', '#080712'], accentGradient: ['#82E1D0', '#6F5DD2'],
  },
  light: {
    bg: '#ECEFF1', surface: 'rgba(255,255,255,.72)', surface2: 'rgba(242,245,247,.82)', text: '#17212A', muted: '#687580', accent: '#237E77', border: 'rgba(30,52,67,.13)',
    gradient: ['#F7F9FA', '#E8EEF0', '#E5E1EC'], accentGradient: ['#55BDB0', '#7169C7'],
  },
};

export function getTheme(name: ThemeName): ThemePalette {
  return themes[name] ?? themes.cinematic;
}
