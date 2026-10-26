import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { sizes, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';
import { usePressScale } from '../hooks/usePressScale';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
  border?: boolean;
  disabled?: boolean;
  badge?: number;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  name,
  onPress,
  size = 22,
  color,
  backgroundColor,
  border,
  disabled,
  badge,
  style,
}: Props) {
  const { colors } = useThemeColors();
  const { animStyle, pressIn, pressOut } = usePressScale(0.88, 15, 320);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => {
          haptics.light();
          onPress?.();
        }}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        style={[
          styles.button,
          {
            width: sizes.iconButton,
            height: sizes.iconButton,
            borderRadius: 14,
            backgroundColor: backgroundColor ?? colors.surfaceRaised,
            borderWidth: border ? 1 : 0,
            borderColor: colors.border,
            opacity: disabled ? 0.4 : 1,
          },
          style,
        ]}
      >
        <Ionicons name={name} size={size} color={color ?? colors.textSecondary} />
        {badge != null && badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.danger }]}>
            <AppText variant="microBold" color="#FFFFFF" style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </AppText>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: spacing.xxs,
  },
  badgeText: { includeFontPadding: false },
});
