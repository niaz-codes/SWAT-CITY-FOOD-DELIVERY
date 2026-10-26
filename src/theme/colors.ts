export const palette = {
  teal50: '#EAF7F4',
  teal100: '#D3F0EA',
  teal200: '#A9E2D7',
  teal300: '#77D0C2',
  teal400: '#3CB8AA',
  teal500: '#0E9488',
  teal600: '#0B7A71',
  teal700: '#0A645D',
  teal800: '#0C4F4A',
  teal900: '#0E3F3A',

  amber50: '#FFF6E6',
  amber100: '#FFE9C2',
  amber300: '#FFD07A',
  amber400: '#FCB43C',
  amber500: '#F19A1B',
  amber600: '#D97F0B',

  coral500: '#FF6B5B',
  berry500: '#B44B7C',

  sky500: '#2AA0D6',
  sky600: '#1B84B5',

  green500: '#2FB574',
  green600: '#1E9A61',
  red500: '#E5484D',
  red600: '#CE3B40',
};

export type ColorScheme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  divider: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryMuted: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  ride: string;
  rideSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
  tabBarInactive: string;
  cardShadow: string;
  mapRoad: string;
  mapBuilding: string;
  mapRoute: string;
  mapBackground: string;
};

export const lightColors: ColorScheme = {
  background: '#F4F8F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FBFB',
  surfaceMuted: '#EDF3F2',
  surfaceRaised: '#FFFFFF',
  textPrimary: '#0E2422',
  textSecondary: '#425956',
  textMuted: '#7C918E',
  textInverse: '#FFFFFF',
  border: '#E3ECEA',
  borderStrong: '#CFDDD9',
  divider: '#EDF3F2',
  primary: '#0E9488',
  primaryStrong: '#0B7A71',
  primarySoft: '#DFF4F0',
  primaryMuted: '#EDF9F7',
  onPrimary: '#FFFFFF',
  accent: '#F19A1B',
  accentSoft: '#FFF1D9',
  ride: '#1B84B5',
  rideSoft: '#E0F1FA',
  success: '#1E9A61',
  successSoft: '#DDF4E9',
  danger: '#E5484D',
  dangerSoft: '#FDE7E7',
  warning: '#D97F0B',
  warningSoft: '#FFF0D6',
  info: '#2AA0D6',
  skeleton: '#E6EFED',
  skeletonHighlight: '#F4F9F8',
  overlay: 'rgba(10, 26, 24, 0.55)',
  tabBarInactive: '#92A5A2',
  cardShadow: '#0E3F3A',
  mapRoad: '#FFFFFF',
  mapBuilding: '#E3EDEA',
  mapRoute: '#0E9488',
  mapBackground: '#E9F2F0',
};

export const darkColors: ColorScheme = {
  background: '#07100F',
  surface: '#0E1918',
  surfaceAlt: '#111F1D',
  surfaceMuted: '#162422',
  surfaceRaised: '#13201F',
  textPrimary: '#ECF5F3',
  textSecondary: '#9CB0AD',
  textMuted: '#6F8582',
  textInverse: '#07100F',
  border: '#1D2E2C',
  borderStrong: '#29413E',
  divider: '#162422',
  primary: '#2FC2B2',
  primaryStrong: '#45D6C6',
  primarySoft: '#10332F',
  primaryMuted: '#0C2825',
  onPrimary: '#04120F',
  accent: '#FCB43C',
  accentSoft: '#33260E',
  ride: '#37A9DC',
  rideSoft: '#0E2A38',
  success: '#32C77F',
  successSoft: '#0F2E21',
  danger: '#F0646A',
  dangerSoft: '#321417',
  warning: '#FCB43C',
  warningSoft: '#33260E',
  info: '#37A9DC',
  skeleton: '#152422',
  skeletonHighlight: '#1D302D',
  overlay: 'rgba(0, 0, 0, 0.68)',
  tabBarInactive: '#5E7370',
  cardShadow: '#000000',
  mapRoad: '#162422',
  mapBuilding: '#101D1C',
  mapRoute: '#2FC2B2',
  mapBackground: '#0B1514',
};
