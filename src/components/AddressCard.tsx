import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { Address } from '../types/domain';
import { haptics } from '../hooks/useHaptics';

type Props = {
  address: Address;
  selected?: boolean;
  onPress?: () => void;
  onMore?: () => void;
  distanceKm?: number;
};

const TAG_ICON = {
  home: 'home',
  work: 'briefcase',
  frequent: 'star',
} as const;

export function AddressCard({ address, selected, onPress, onMore, distanceKm }: Props) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress?.();
      }}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted },
        ]}
      >
        <Ionicons
          name={address.tagged ? TAG_ICON[address.tagged] : 'location'}
          size={20}
          color={selected ? colors.primaryStrong : colors.textSecondary}
        />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
            {address.label}
          </AppText>
          {address.tagged === 'home' && <Badge label="Home" tone="primary" />}
          {address.tagged === 'work' && <Badge label="Work" tone="ride" />}
          {address.tagged === 'frequent' && <Badge label="Frequent" tone="warning" />}
        </View>
        <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
          {address.full}
        </AppText>
      </View>
      <View style={styles.meta}>
        {distanceKm != null && (
          <View style={[styles.distPill, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="navigate-outline" size={12} color={colors.textSecondary} />
            <AppText variant="micro" weight="semiBold" color={colors.textSecondary}>
              {distanceKm.toFixed(1)} km
            </AppText>
          </View>
        )}
        {onMore && (
          <Pressable hitSlop={10} onPress={onMore} style={styles.more}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        {selected && (
          <View style={[styles.radio, { borderColor: colors.primary }]}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: radius.card,
    marginBottom: spacing.s,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  meta: { alignItems: 'flex-end', gap: spacing.s },
  distPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.s,
    height: 22,
    borderRadius: 11,
  },
  more: { padding: spacing.xs },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 11, height: 11, borderRadius: 6 },
});
