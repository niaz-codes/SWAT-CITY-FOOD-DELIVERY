import { lightColors, darkColors, ColorScheme } from './colors';

export { palette, lightColors, darkColors } from './colors';
export type { ColorScheme } from './colors';
export { spacing, radius, sizes } from './spacing';
export type { Spacing, Radius } from './spacing';
export { fonts, typography, shadowPresets, textStyle } from './typography';
export type { TypographyVariant } from './typography';
export { ThemeProvider, useAppTheme, useThemeColors } from './ThemeContext';

export type Theme = {
  dark: boolean;
  colors: ColorScheme;
};

export const defaultTheme: Theme = { dark: false, colors: lightColors };

export const themes: Record<'light' | 'dark', Theme> = {
  light: { dark: false, colors: lightColors },
  dark: { dark: true, colors: darkColors },
};
