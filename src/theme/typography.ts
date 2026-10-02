import { Platform, TextStyle } from 'react-native';

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

type TypeVariant = {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  letterSpacing?: number;
};

const type = (fontSize: number, lineHeight: number, fontFamily: string, letterSpacing = 0): TypeVariant => ({
  fontSize,
  lineHeight,
  fontFamily,
  letterSpacing,
});

export const typography: Record<string, TypeVariant> = {
  display: type(40, 46, fonts.extraBold, -1),
  h1: type(30, 37, fonts.extraBold, -0.6),
  h2: type(25, 32, fonts.extraBold, -0.4),
  h3: type(21, 28, fonts.bold, -0.2),
  h4: type(18, 25, fonts.bold, -0.1),
  title: type(16, 23, fonts.semiBold),
  body: type(15, 23, fonts.regular),
  bodyMedium: type(15, 23, fonts.medium),
  small: type(13, 19, fonts.regular),
  smallMedium: type(13, 19, fonts.medium),
  caption: type(12, 17, fonts.medium),
  captionBold: type(12, 17, fonts.bold),
  micro: type(10.5, 15, fonts.medium),
  microBold: type(10.5, 15, fonts.bold),
  overline: type(11, 15, fonts.bold, 1.1),
};

export type TypographyVariant = keyof typeof typography;

export const shadowPresets = Platform.select({
  android: {
    card: { elevation: 3 },
    raised: { elevation: 6 },
    floating: { elevation: 10 },
    soft: { elevation: 1 },
  },
  default: {
    card: {
      shadowColor: '#0E3F3A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
    },
    raised: {
      shadowColor: '#0E3F3A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 24,
    },
    floating: {
      shadowColor: '#0E3F3A',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.18,
      shadowRadius: 32,
    },
    soft: {
      shadowColor: '#0E3F3A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
    },
  },
}) as { card: object; raised: object; floating: object; soft: object };

export const textStyle = (variant: TypographyVariant): TextStyle =>
  typography[variant] as TextStyle;