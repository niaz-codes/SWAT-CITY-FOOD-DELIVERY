import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useTimer } from '../../hooks/useAsyncData';
import { haptics } from '../../hooks/useHaptics';
import { rideApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { onSocketEvent } from '../../services/socket';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RideSearching'>;

const POLL_MS = 3_000;

const REFUSAL = 'Could not cancel the search. Try again.';

/**
 * Waits for a real rider to claim the ride that was just booked. The ride's
 * status is polled (riders claim via POST /rides/accept) and the
 * `ride:status` socket event shortcuts the poll as soon as broadcast.
 */
export function RideSearchingScreen({ navigation, route }: Props) {
  const { rideId, pickup, dropoff } = route.params;
  const { colors } = useThemeColors();
  const { error: toastError } = useToast();
  const seconds = useTimer(1000);
  const [found, setFound] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const settled = React.useRef(false);

  const pulse = useSharedValue(1);
  const ringOpacity = useSharedValue(0.5);
  const sweep = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.5, { duration: 1600 }), withTiming(1, { duration: 1600 })),
      -1,
      false,
    );
    ringOpacity.value = withRepeat(
      withSequence(withTiming(0.05, { duration: 1600 }), withTiming(0.5, { duration: 1600 })),
      -1,
      false,
    );
    sweep.value = withRepeat(withTiming(1, { duration: 2200 }), -1, false);
  }, [pulse, ringOpacity, sweep]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: ringOpacity.value,
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value * 360}deg` }],
  }));

  const settle = React.useCallback(
    async (status: string) => {
      if (settled.current) return;
      settled.current = true;
      haptics.success();
      if (status === 'cancelled') {
        setCancelled(true);
        return;
      }
      setFound(true);
      // A rider claiming the ride lands on tracking; a bailed-out ride goes
      // home instead.
      setTimeout(() => navigation.replace('RiderTracking', { rideId }), 1600);
    },
    [navigation, rideId],
  );

  // Status check on mount + every poll; ride:status shortcuts it.
  const check = React.useCallback(
    async (silent: boolean) => {
      if (settled.current) return;
      try {
        const detail = await rideApi.detail(rideId);
        if (detail.status !== 'searching') await settle(detail.status);
      } catch (err) {
        if (!silent) {
          // The ride disappearing (network drop) must stay visible; the poll
          // keeps trying quietly.
          toastError(apiErrorMessage(err, 'Lost contact with the search. Check your connection.'));
        }
      }
    },
    [rideId, settle, toastError],
  );

  useEffect(() => {
    void check(false);
    const id = setInterval(() => void check(true), POLL_MS);
    let unsubscribe: (() => void) | undefined;
    let alive = true;
    onSocketEvent<{ rideId?: string; status?: string }>('ride:status', (payload) => {
      if (payload?.rideId === rideId && payload.status && payload.status !== 'searching') {
        void settle(payload.status);
      }
    }).then((fn) => {
      if (alive) unsubscribe = fn;
    });
    return () => {
      alive = false;
      clearInterval(id);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  const cancelSearch = async () => {
    if (cancelling || settled.current) return;
    setCancelling(true);
    try {
      await rideApi.cancelCustomer(rideId, 'Customer cancelled before a rider was found');
      settled.current = true;
      haptics.medium();
      navigation.popToTop();
    } catch (err) {
      toastError(apiErrorMessage(err, REFUSAL));
    } finally {
      setCancelling(false);
    }
  };

  const searchMs = Math.min(seconds * 1000, POLL_MS * 2);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Finding your ride" onBack={() => navigation.goBack()} elevated />

      <View style={styles.content}>
        {cancelled ? (
          <Animated.View entering={FadeInUp.duration(400)} style={styles.foundWrap}>
            <View style={[styles.foundBadge, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="close-circle" size={46} color={colors.textSecondary} />
            </View>
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary} center>
              Ride cancelled
            </AppText>
            <AppText variant="body" color={colors.textMuted} center>
              You will not be charged — the search was called off before a rider arrived.
            </AppText>
            <AppButton label="Back home" onPress={() => navigation.popToTop()} style={styles.cancelBtn} />
          </Animated.View>
        ) : !found ? (
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

            <View
              style={[
                styles.searchBar,
                {
                  width: `${Math.round((searchMs / (POLL_MS * 2)) * 100)}%` as `${number}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
            <AppButton
              label={cancelling ? 'Cancelling…' : 'Cancel search'}
              variant="ghost"
              onPress={() => void cancelSearch()}
              style={styles.cancelBtn}
            />
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
              Your rider is heading to {pickup}.
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
          Rs {route.params.fare}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          · {route.params.distanceKm.toFixed(1)} km
        </AppText>
      </View>
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0.35, { duration: 500 })), 4, false),
    );
  }, [delay, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.l,
    position: 'relative',
  },
  radarWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    position: 'relative',
  },
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
  radarRingTwo: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
  },
  sweep: {
    position: 'absolute',
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepHand: { position: 'absolute', top: 24, width: 3, height: 76, borderRadius: 2 },
  subText: { marginTop: spacing.xs, paddingHorizontal: spacing.l, textAlign: 'center' },
  searchBar: { height: 6, borderRadius: 3, marginTop: spacing.xl, alignSelf: 'flex-start' },
  cancelBtn: { marginTop: spacing.l, alignSelf: 'stretch' },
  foundWrap: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  foundBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
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
