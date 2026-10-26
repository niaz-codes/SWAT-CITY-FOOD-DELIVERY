import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  subtitle?: string;
};

export function SectionHeader({ title, actionLabel, onAction, subtitle }: Props) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
          {title}
        </AppText>
        {subtitle && (
          <AppText variant="small" color={colors.textMuted}>
            {subtitle}
          </AppText>
        )}
      </View>
      {actionLabel && (
        <Pressable
          onPress={() => {
            haptics.light();
            onAction?.();
          }}
          hitSlop={8}
          style={styles.action}
        >
          <AppText variant="smallMedium" weight="semiBold" color={colors.primary}>
            {actionLabel}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.m,
  },
  titles: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
