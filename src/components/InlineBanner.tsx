import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';

type Kind = 'error' | 'success' | 'info';

type Props = {
  kind: Kind;
  message: string;
  style?: StyleProp<ViewStyle>;
};

const ICON: Record<Kind, keyof typeof Ionicons.glyphMap> = {
  error: 'alert-circle',
  success: 'checkmark-circle',
  info: 'information-circle',
};

/**
 * A message that stays on screen.
 *
 * Toasts are easy to miss - they vanish while the user is still reading and
 * they disappear behind the keyboard. A form that can fail (sign-in, sign-up,
 * code verification) needs its error to stay put until the next attempt, so
 * the message lives in the layout next to the fields it belongs to.
 */
export function InlineBanner({ kind, message, style }: Props) {
  const { colors } = useThemeColors();

  const tint =
    kind === 'error' ? colors.danger : kind === 'success' ? colors.success : colors.info;
  const background =
    kind === 'error'
      ? colors.dangerSoft
      : kind === 'success'
        ? colors.successSoft
        : colors.primarySoft;

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: background }, style]}
    >
      <Ionicons name={ICON[kind]} size={18} color={tint} style={styles.icon} />
      <AppText variant="small" weight="medium" color={tint} style={styles.text}>
        {message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});

export default InlineBanner;
