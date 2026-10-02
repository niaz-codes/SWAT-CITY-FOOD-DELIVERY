import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { MapComponent } from '../../components/MapComponent';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useTimer } from '../../hooks/useAsyncData';
import { haptics } from '../../hooks/useHaptics';
import { RIDERS } from '../../services/api';
import { RideFlow, RideType } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'RideSearching'>;

export function RideSearchingScreen({ navigation, route }: Props) {
  const { pickup, dropoff, distanceKm, rideType, fare } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [found, setFound] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const seconds = useTimer(1000);

  const pulse = useSharedValue(1);
  const ringOpacity = useSharedValue(0.5);
  const sweep = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.5, { duration: 1600 }), withTiming(1, { duration: 1600 })), -1, false);
    ringOpacity.value = withRepeat(withSequence(withTiming(0.05, { duration: 1600 }), withTiming(0.5, { duration: 1600 })), -1, false);
    sweep.value = withRepeat(withTiming(1, { duration: 2200 }), -1, false);
  }, [pulse, ringOpacity, sweep]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: ringOpacity.value }));
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value * 360}deg` }] }));

  // Auto-assign after ~4.5s
  useEffect(() => {
    const t = setTimeout(() => {
      haptics.success();
      setFound(true);
      const flow: RideFlow = {
        id: `ride_${Date.now()}`,
        status: 'assigned',
        rideType,
        fare,
        distanceKm,
        durationMin: Math.round(distanceKm * 4 + 6),
        pickup,
        dropoff,
      };
      setTimeout(() => navigation.replace('RiderTracking', { ride: flow }), 1600);
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchMs = Math.min(seconds * 1000, 4500);

  const handleCancel = () => {
    setCancelled(true);
    navigation.goBack();
  };

  if (cancelled) return null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Finding your ride" onBack={() => navigation.goBack()} elevated />

      <View style={styles.content}>
        {!found ? (
          <>
            <View style={styles.radarWrap}>
              <Animated.View style={[styles.radarRing, { borderColor: colors.primary }, pulseStyle]} />
              <Animated.View style={[styles.radarRingTwo, { borderColor: colors.ride }, pulseStyle]} />
              <Animated.View style={styles.radarCore}>
                <Ionicons name="bicycle" size={34} color={colors.onPrimary} />
              </Animated.View>
              <Animated.View style={[styles.sweep, sweepStyle]}>
                <View style={[styles.sweepHand, { backgroundColor: colors.primarySoft }]} />
              </Animated.View>
            </View>

            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <AppText variant="h3" weight="extraBold" color={colors.textPrimary} center>
                Searching for nearby riders
              </AppText>
              <AppText variant="body" color={colors.textMuted} center style={styles.subText}>
                {pickup} → {dropoff}
              </AppText>
            </Animated.View>

            <View style={[styles.searchBar, { width: `${Math.round((searchMs / 4500) * 100)}%` as `${number}%`, backgroundColor: colors.primary }]} />
          </>
        ) : (
          <Animated.View entering={FadeInUp.duration(500)} style={styles.foundWrap}>
            <View style={[styles.foundBadge, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="checkmark-circle" size={46} color={colors.success} />
            </View>
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary} center>
              Rider found!
            </AppText>
            <AppText variant="body" color={colors.textMuted} center>
              {RIDERS[0]!.name} is heading to {pickup}. Vehicle: {RIDERS[0]!.vehicle}.
            </AppText>
            <View style={[styles.loadingDots]}>
              {[0, 1, 2].map((i) => (
                <Dot key={i} delay={i * 180} color={colors.primary} />
              ))}
            </View>
          </Animated.View>
        )}
      </View>

      <View style={styles.summaryCard}>
        <Ionicons name="card-outline" size={20} color={colors.primary} />
        <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
          Rs {fare}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          · {distanceKm.toFixed(1)} km
        </AppText>
      </View>
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0.35, { duration: 500 })), 4, false));
  }, [delay, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.l, position: 'relative' },
  radarWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl, position: 'relative' },
  radarCore: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#0E9488',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    elevation: 8,
  },
  radarRing: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 2 },
  radarRingTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1.5 },
  sweep: { position: 'absolute', width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  sweepHand: { position: 'absolute', top: 24, width: 3, height: 76, borderRadius: 2 },
  subText: { marginTop: spacing.xs, paddingHorizontal: spacing.l },
  searchBar: { height: 6, borderRadius: 3, marginTop: spacing.xl, alignSelf: 'flex-start' },
  foundWrap: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  foundBadge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  loadingDots: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.l },
  dot: { width: 10, height: 10, borderRadius: 5 },
  summaryCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
});