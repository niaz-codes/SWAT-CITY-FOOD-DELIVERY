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
      <AppText variant="microBold" color={palette.fg} uppercase style={styles.text}>
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
    height: 24,
    borderRadius: radius.pill,
  },
  text: { includeFontPadding: false },
});