import { StyleProp, TextStyle, Text, ViewStyle } from 'react-native';
import React, { useMemo } from 'react';
import { TypographyVariant, fonts, textStyle } from '../theme/typography';

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
  /**
   * Makes the whole text (or a nested span of it) tappable. Used for inline
   * links — Terms, Privacy Policy — where a nested <AppText onPress> inside a
   * parent <AppText> renders as one flowing line, the same way RN's own Text
   * nesting works.
   */
  onPress?: () => void;
  /**
   * Caps how far the OS font scale can grow this text. Used for compact chips and
   * pills, where an uncapped 2x system font would wrap or squeeze the row it
   * lives in. Defaults to the platform behaviour when omitted.
   */
  maxFontSizeMultiplier?: number;
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
  onPress,
  maxFontSizeMultiplier,
}: Props) {
  const resolvedStyle = useMemo(() => {
    const base = textStyle(variant) as TextStyle;
    // Built as one literal rather than mutated field-by-field: RN 0.88 types
    // TextStyle properties as read-only, so assignment on a `TextStyle` object
    // no longer type-checks.
    const overrides: TextStyle = {
      ...(weight ? { fontFamily: WEIGHT_FAMILY[weight] } : null),
      ...(color ? { color } : null),
      ...(center ? { textAlign: 'center' } : null),
      ...(uppercase ? { textTransform: 'uppercase' } : null),
    };
    return [base, overrides, style];
  }, [variant, weight, color, center, uppercase, style]);

  return (
    <Text
      selectable={selectable}
      onPress={onPress}
      suppressHighlighting={onPress ? true : undefined}
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
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
