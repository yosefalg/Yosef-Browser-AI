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
    bg: '#232625', surface: '#343735', surface2: '#41443F', text: '#F5EFE8', muted: '#C4BBB1', accent: '#D5AA88', border: '#5A5B55',
    gradient: ['#1D201F', '#2A2D2B', '#393A36'], accentGradient: ['#D8B292', '#B98465'],
  },
  amoled: {
    bg: '#000000', surface: '#090A0C', surface2: '#111317', text: '#FFFFFF', muted: '#9CA3AF', accent: '#B99579', border: '#24262B',
    gradient: ['#000000', '#020203', '#08080A'], accentGradient: ['#C5A083', '#8B6A55'],
  },
  light: {
    bg: '#E7DDD4', surface: '#F7F2EC', surface2: '#DDD5CD', text: '#2C2C2A', muted: '#756E68', accent: '#B88766', border: '#C8BFB6',
    gradient: ['#EDE4DB', '#D8D3CD', '#B9B9B4'], accentGradient: ['#D8B292', '#B88766'],
  },
};

export function getTheme(name: ThemeName): ThemePalette {
  return themes[name] ?? themes.cinematic;
}
