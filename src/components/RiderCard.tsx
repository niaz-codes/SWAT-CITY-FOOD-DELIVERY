import React from 'react';
import { Pressable, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { RatingStars } from './RatingStars';
import { Badge } from './Badge';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { Rider } from '../types/domain';
import { haptics } from '../hooks/useHaptics';

type Props = {
  rider: Rider;
  onCall?: () => void;
  onSMS?: () => void;
  onPress?: () => void;
  showTripMeta?: boolean;
  selection?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RiderCard({ rider, onCall, onSMS, onPress, showTripMeta, selection, style }: Props) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress?.();
      }}
      style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, style]}
    >
      <Avatar name={rider.name} gradient={rider.avatarGradient} size={48} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
            {rider.name}
          </AppText>
          <Badge label="Online" tone="success" icon="radio-button-on" />
        </View>
        <View style={styles.ratingRow}>
          <RatingStars rating={rider.rating} size={12} showValue={false} />
          <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
            {rider.rating.toFixed(1)}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            · {rider.trips.toLocaleString('en-US')} trips
          </AppText>
        </View>
        {showTripMeta && (
          <View style={styles.vehicleRow}>
            <Ionicons name="bicycle" size={14} color={colors.textMuted} />
            <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
              {rider.vehicle} · {rider.plateNumber}
            </AppText>
            <View style={[styles.etaPill, { backgroundColor: colors.rideSoft }]}>
              <Ionicons name="timer-outline" size={12} color={colors.ride} />
              <AppText variant="microBold" color={colors.ride}>
                {rider.etaMin} min
              </AppText>
            </View>
          </View>
        )}
      </View>
      {(onCall || onSMS) && (
        <View style={styles.actions}>
          {onCall && (
            <IconAction icon="call" onPress={onCall} primary />
          )}
          {onSMS && <IconAction icon="chatbubble-ellipses" onPress={onSMS} />}
        </View>
      )}
      {selection && (
        <View style={[styles.selection, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
          <Ionicons name="checkmark" size={16} color={colors.primaryStrong} />
        </View>
      )}
    </Pressable>
  );
}

function IconAction({ icon, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean }) {
  const { colors } = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      hitSlop={6}
      style={[
        styles.iconAction,
        {
          backgroundColor: primary ? colors.primary : colors.surfaceMuted,
          width: primary ? 44 : 40,
          height: primary ? 44 : 40,
          borderRadius: primary ? 22 : 14,
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={primary ? colors.onPrimary : colors.textSecondary} />
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
    borderWidth: 1,
  },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, flexWrap: 'wrap' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.s,
    height: 22,
    borderRadius: 11,
  },
  actions: { flexDirection: 'row', gap: spacing.s },
  iconAction: { alignItems: 'center', justifyContent: 'center' },
  selection: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});