import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type Props = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * Official four-colour Google "G" mark.
 *
 * Drawn as vector paths rather than shipped as a PNG so it stays sharp at every
 * density and picks up no extra asset. Brand guideline requires the standard
 * colours in this order.
 */
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}

/**
 * "Continue with Google" button.
 *
 * Rendered as a standalone outlined button rather than an AppButton variant
 * because Google's brand guidelines require a white surface with a grey
 * outline and near-black label, which does not match the app's filled primary
 * button styling.
 */
export function GoogleSignInButton({ onPress, loading, disabled }: Props) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: '#FFFFFF',
          borderColor: disabled ? colors.border : '#DADCE0',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <GoogleMark />
      <AppText variant="smallMedium" weight="semiBold" color="#1F1F1F" style={styles.label}>
        {loading ? 'Connecting to Google…' : 'Continue with Google'}
      </AppText>
    </Pressable>
  );
}

/** "OR" rule used between the phone login and the Google option. */
export function OrDivider({ label = 'OR' }: { label?: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <AppText variant="caption" weight="semiBold" color={colors.textMuted} uppercase>
        {label}
      </AppText>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  label: { includeFontPadding: false },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
