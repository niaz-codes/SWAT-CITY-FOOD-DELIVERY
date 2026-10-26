import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'ride';

type Props = {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Badge({ label, tone = 'neutral', icon }: Props) {
  const { colors } = useThemeColors();
  const map: Record<Tone, { fg: string; bg: string }> = {
    primary: { fg: colors.primaryStrong, bg: colors.primarySoft },
    success: { fg: colors.success, bg: colors.successSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    info: { fg: colors.info, bg: colors.rideSoft },
    ride: { fg: colors.ride, bg: colors.rideSoft },
    neutral: { fg: colors.textSecondary, bg: colors.surfaceMuted },
  };
  const palette = map[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      {icon && <Ionicons name={icon} size={12} color={palette.fg} />}
      <AppText
        variant="microBold"
        color={palette.fg}
        uppercase
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={styles.text}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    // minHeight rather than a fixed height: with the OS font scale turned up the
    // label grows and the pill must grow with it, otherwise the second line was
    // clipped by the old fixed 24px box. At the default scale the label is 15px
    // so the pill still measures exactly 24px — no visual change.
    minHeight: 24,
    borderRadius: radius.pill,
    // Lets the pill compress inside a tight row (e.g. the dashboard header, where
    // it sits beside the log-out button) instead of pushing the title out.
    flexShrink: 1,
    maxWidth: '100%',
  },
  text: { includeFontPadding: false, flexShrink: 1 },
});
