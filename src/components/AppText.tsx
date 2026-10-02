import { StyleProp, TextStyle, Text, ViewStyle } from 'react-native';
import React, { useMemo } from 'react';
import { TypographyVariant, fonts, textStyle } from '../theme/typography';
import { useThemeColors } from '../theme';

type Weight = 'regular' | 'medium' | 'semiBold' | 'bold' | 'extraBold';

type Props = {
  variant?: TypographyVariant;
  weight?: Weight;
  color?: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  center?: boolean;
  uppercase?: boolean;
  children: React.ReactNode;
  selectable?: boolean;
};

const WEIGHT_FAMILY: Record<Weight, string> = {
  regular: fonts.regular,
  medium: fonts.medium,
  semiBold: fonts.semiBold,
  bold: fonts.bold,
  extraBold: fonts.extraBold,
};

export function AppText({
  variant = 'body',
  weight,
  color,
  numberOfLines,
  style,
  center,
  uppercase,
  children,
  selectable,
}: Props) {
  const { colors } = useThemeColors();

  const resolvedStyle = useMemo(() => {
    const base = textStyle(variant) as TextStyle;
    const overrides: TextStyle = {};
    if (weight) overrides.fontFamily = WEIGHT_FAMILY[weight];
    if (color) overrides.color = color;
    if (center) overrides.textAlign = 'center';
    if (uppercase) overrides.textTransform = 'uppercase';
    return [base, overrides, style];
  }, [variant, weight, color, center, uppercase, style]);

  return (
    <Text
      selectable={selectable}
      allowFontScaling
      style={resolvedStyle}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function screenPaddingStyle(): ViewStyle {
  return { paddingHorizontal: 20 };
}