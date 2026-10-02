import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { radius, sizes, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: object;
  testID?: string;
};

const HEIGHT: Record<Size, number> = {
  sm: sizes.buttonSm,
  md: sizes.button,
  lg: sizes.buttonLg,
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  fullWidth = true,
  style,
  testID,
}: Props) {
  const { colors } = useThemeColors();
  const scale = useSharedValue(1);

  const palette = usePalette(variant);

  const pressed = () => {
    haptics.light();
    scale.value = 0.97;
  };
  const released = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 300 });
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[styles.wrap, animStyle, !fullWidth && styles.inline, { opacity: isDisabled ? 0.55 : 1 }, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={isDisabled ? undefined : onPress}
        onPressIn={isDisabled ? undefined : pressed}
        onPressOut={isDisabled ? undefined : released}
        android_ripple={{ color: palette.ripple, foreground: true }}
        style={({ pressed: p }) => [
          styles.base,
          { height: HEIGHT[size], borderRadius: radius[size === 'lg' ? 'lg' : 'sm'] + 4 },
          { backgroundColor: palette.bg, borderColor: palette.border, borderWidth: palette.border ? 1 : 0 },
          p && !isDisabled && { backgroundColor: palette.pressedBg },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.text} size="small" />
        ) : (
          <View style={styles.content}>
            {icon && iconPosition === 'left' && (
              <Ionicons name={icon} size={size === 'lg' ? 22 : 19} color={palette.text} />
            )}
            <AppText variant={size === 'lg' ? 'title' : 'smallMedium'} weight="semiBold" color={palette.text}>
              {label}
            </AppText>
            {icon && iconPosition === 'right' && (
              <Ionicons name={icon} size={size === 'lg' ? 22 : 19} color={palette.text} />
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function usePalette(variant: Variant) {
  const { colors } = useThemeColors();
  switch (variant) {
    case 'secondary':
      return {
        bg: colors.primarySoft,
        pressedBg: colors.primaryMuted,
        text: colors.primaryStrong,
        border: undefined as string | undefined,
        ripple: colors.primary,
      };
    case 'outline':
      return {
        bg: 'transparent',
        pressedBg: colors.surfaceMuted,
        text: colors.primaryStrong,
        border: colors.borderStrong,
        ripple: colors.primary,
      };
    case 'ghost':
      return {
        bg: 'transparent',
        pressedBg: colors.surfaceMuted,
        text: colors.primaryStrong,
        border: undefined as string | undefined,
        ripple: colors.surfaceMuted,
      };
    case 'danger':
      return {
        bg: colors.danger,
        pressedBg: colors.danger,
        text: '#FFFFFF',
        border: undefined as string | undefined,
        ripple: '#FFFFFF',
      };
    case 'soft':
      return {
        bg: colors.surfaceMuted,
        pressedBg: colors.border,
        text: colors.textPrimary,
        border: undefined as string | undefined,
        ripple: colors.border,
      };
    default:
      return {
        bg: colors.primary,
        pressedBg: colors.primaryStrong,
        text: colors.onPrimary,
        border: undefined as string | undefined,
        ripple: colors.onPrimary,
      };
  }
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18 },
  inline: { alignSelf: 'flex-start' },
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
});