import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { ArtTile } from './ArtTile';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { RideFare } from '../types/domain';
import { haptics } from '../hooks/useHaptics';
import { usePressScale } from '../hooks/usePressScale';

type Props = {
  ride: RideFare;
  fare: number;
  selected: boolean;
  onSelect: () => void;
};

export function RideCard({ ride, fare, selected, onSelect }: Props) {
  const { colors } = useThemeColors();
  const { animStyle, pressIn, pressOut } = usePressScale(0.975, 18, 300);

  const gradient = selected
    ? (['#0E9488', '#0B7A71'] as [string, string])
    : (['#1B84B5', '#0E3F3A'] as [string, string]);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => {
          haptics.light();
          onSelect();
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
        <View style={styles.tileWrap}>
          <ArtTile gradient={gradient} emoji={undefined} size={54} rounded={16} />
          <View style={styles.rideIcon}>
            <Ionicons
              name={
                (ride.icon === 'bicycle'
                  ? 'bicycle'
                  : ride.icon === 'bus'
                    ? 'bus'
                    : 'car') as keyof typeof Ionicons.glyphMap
              }
              size={22}
              color="#FFFFFF"
            />
          </View>
        </View>
        <View style={styles.info}>
          <AppText variant="title" weight="bold" color={colors.textPrimary}>
            {ride.label}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            {ride.capacity} · {ride.etaMin} min away
          </AppText>
        </View>
        <View style={styles.fare}>
          <AppText variant="caption" color={colors.textMuted} style={styles.strike}>
            Rs {Math.round(fare * 1.18)}
          </AppText>
          <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
            Rs {fare}
          </AppText>
          <View
            style={[styles.radio, { borderColor: selected ? colors.primary : colors.borderStrong }]}
          >
            {selected && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.sm,
    borderRadius: radius.card,
    position: 'relative',
    marginBottom: spacing.sm,
  },
  tileWrap: { position: 'relative' },
  rideIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  fare: { alignItems: 'flex-end', gap: 2 },
  strike: { textDecorationLine: 'line-through' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dot: { width: 11, height: 11, borderRadius: 6 },
});
