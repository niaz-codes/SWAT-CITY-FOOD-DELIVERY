import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { MapComponent } from '../../components/MapComponent';
import { rideApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { onSocketEvent } from '../../services/socket';
import { haptics } from '../../hooks/useHaptics';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderTracking'>;

const POLL_MS = 8_000;

/**
 * Live ride tracking for the customer. Everything on screen comes from
 * GET /rides/:id, polled and shortcut by the backend's `ride:status` socket
 * event — the trip's progress is the ride's real statusHistory, never a
 * client-side timer.
 */
export function RiderTrackingScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { colors } = useThemeColors();
  const { success, error: toastError } = useToast();
  const [blocked, setBlocked] = useState<string | null>(null);

  const [ride, setRide] = useState<Awaited<ReturnType<typeof rideApi.detail>> | null>(null);
  const rideRef = useRef(ride);
  rideRef.current = ride;

  const refresh = useCallback(async () => {
    try {
      const next = await rideApi.detail(rideId);
      const prev = rideRef.current;
      rideRef.current = next;
      setRide(next);
      setBlocked(null);
      if (next.status !== prev?.status) {
        if (next.status === 'cancelled') {
          toastError(`Ride cancelled${next.cancelReason ? `: ${next.cancelReason}` : ''}`);
        }
        if (next.status === 'completed') {
          success('Trip completed. Thank you!');
        }
      }
    } catch (err) {
      if (!rideRef.current) setBlocked(apiErrorMessage(err, 'Could not load this ride.'));
    }
  }, [rideId, success, toastError]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    let unsubscribe: (() => void) | undefined;
    let alive = true;
    onSocketEvent<{ rideId?: string; status?: string }>('ride:status', (payload) => {
      if (payload?.rideId === rideId) void refresh();
    }).then((fn) => {
      if (alive) unsubscribe = fn;
    });
    return () => {
      alive = false;
      clearInterval(id);
      unsubscribe?.();
    };
  }, [refresh, rideId]);

  const status = ride?.status ?? 'searching';
  const done = status === 'completed';
  const cancelled = status === 'cancelled';
  const progress = useSharedValue(0);

  useEffect(() => {
    if (status === 'started') {
      progress.value = withRepeat(withTiming(1, { duration: 8000 }), -1, false);
    } else if (done) {
      progress.value = 1;
    } else {
      progress.value = 0.3;
    }
  }, [status, done, progress]);

  const liveChipText = done
    ? 'Trip completed'
    : cancelled
      ? 'Ride cancelled'
      : status === 'started'
        ? 'On the way'
        : status === 'arriving'
          ? 'Rider arrived'
          : status === 'accepted'
            ? 'Rider assigned'
            : 'Finding a rider';

  const callRider = (phone: string) => {
    haptics.light();
    Linking.openURL(`tel:${phone}`).catch(() => toastError('Could not open the dialer.'));
  };

  const cancelRide = async () => {
    if (!ride) return;
    try {
      haptics.medium();
      await rideApi.cancelCustomer(rideId, 'Customer cancelled the ride');
      toastError('Ride cancelled');
      void refresh();
    } catch (err) {
      toastError(apiErrorMessage(err, 'Could not cancel this ride.'));
    }
  };

  if (blocked) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Trip tracking" onBack={() => navigation.goBack()} elevated />
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
          <AppText variant="body" color={colors.textSecondary} style={styles.blockedText} center>
            {blocked}
          </AppText>
          <AppButton label="Try again" variant="secondary" onPress={() => void refresh()} />
        </View>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Trip tracking" onBack={() => navigation.goBack()} elevated />
        <View style={styles.center}>
          <AppText variant="body" color={colors.textMuted}>
            Loading trip…
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Trip to ${ride.dropoff.address}`} onBack={() => navigation.goBack()} elevated />

      <View style={styles.mapWrap}>
        <MapComponent
          pickup={{ x: 0.24, y: 0.34 }}
          dropoff={{ x: 0.76, y: 0.68 }}
          height={280}
          rounded={26}
          progress={progress}
          animateRouteDash={status === 'started'}
        />
        <View
          style={[
            styles.liveChip,
            {
              backgroundColor: done ? colors.successSoft : cancelled ? colors.surfaceMuted : colors.surfaceRaised,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.liveDot, { backgroundColor: done ? colors.success : cancelled ? colors.textSecondary : colors.danger }]}
          />
          <AppText
            variant="microBold"
            color={done ? colors.success : cancelled ? colors.textSecondary : colors.textPrimary}
          >
            {liveChipText}
          </AppText>
        </View>
      </View>

      <Animated.View entering={FadeInUp.duration(300)} style={styles.body}>
        <View style={[styles.routeCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={styles.routeItem}>
            <Ionicons name="ellipse" size={13} color={colors.primary} />
            <AppText variant="bodyMedium" weight="semiBold" color={colors.textPrimary} style={styles.routeText} numberOfLines={1}>
              {ride.pickup.address}
            </AppText>
          </View>
          <View style={[styles.routeDash, { borderColor: colors.borderStrong }]} />
          <View style={styles.routeItem}>
            <Ionicons name="location" size={14} color={colors.danger} />
            <AppText variant="bodyMedium" weight="semiBold" color={colors.textPrimary} style={styles.routeText} numberOfLines={1}>
              {ride.dropoff.address}
            </AppText>
          </View>
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MetaRow icon="navigate-outline" label="Distance" value={`${ride.distanceKm.toFixed(1)} km`} />
          <MetaRow icon="time-outline" label="Duration" value={`${ride.durationMin} min`} />
          <MetaRow icon="card-outline" label="Fare" value={formatCurrency(ride.fare)} strong />
        </View>

        {ride.rider ? (
          <View style={[styles.riderRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Avatar name={ride.rider.name} gradient={['#1B84B5', '#0E3F3A']} size={46} />
            <View style={styles.riderInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
                {ride.rider.name}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {ride.vehicle} · your rider
              </AppText>
            </View>
            {ride.rider.phone ? (
              <View style={styles.riderActions}>
                <Pressable
                  onPress={() => callRider(ride.rider!.phone)}
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  hitSlop={6}
                >
                  <Ionicons name="call" size={20} color={colors.onPrimary} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.riderRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="locate-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.riderInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                Looking for a rider
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                Nearby riders have been notified
              </AppText>
            </View>
          </View>
        )}

        {!done && !cancelled && (
          <AppButton
            label={status === 'searching' ? 'Cancel search' : 'Cancel ride'}
            variant="ghost"
            onPress={() => void cancelRide()}
          />
        )}

        {cancelled && (
          <View style={[styles.doneCard, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="close-circle" size={26} color={colors.textSecondary} />
            <AppText variant="body" color={colors.textSecondary}>
              This ride was cancelled. You are not charged.
            </AppText>
          </View>
        )}

        {done && (
          <View style={[styles.doneCard, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={30} color={colors.success} />
            <AppText variant="body" color={colors.textSecondary}>
              Trip completed — {formatCurrency(ride.fare)} · {ride.paymentMethod === 'cash' ? 'paid in cash' : 'paid by wallet'}.
            </AppText>
            <AppButton label="Back home" onPress={() => navigation.navigate('Main')} style={styles.doneBtn} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function MetaRow({
  icon,
  label,
  value,
  strong,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  strong?: boolean;
}) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaStart}>
        <Ionicons name={icon} size={17} color={colors.primary} />
        <AppText variant="body" color={colors.textSecondary}>
          {label}
        </AppText>
      </View>
      <AppText
        variant={strong ? 'h4' : 'bodyMedium'}
        weight={strong ? 'extraBold' : 'semiBold'}
        color={colors.textPrimary}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m, padding: spacing.xl },
  blockedText: { marginTop: spacing.s },
  mapWrap: { margin: spacing.m, position: 'relative' },
  liveChip: {
    position: 'absolute',
    top: spacing.s + 4,
    left: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  body: { paddingHorizontal: spacing.m },
  routeCard: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.xs },
  routeItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeText: { flex: 1 },
  routeDash: { borderLeftWidth: 2, height: 14, marginLeft: 5.5 },
  metaCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    marginVertical: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  metaStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.m,
  },
  riderInfo: { flex: 1, gap: 1 },
  riderActions: { flexDirection: 'row' },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCard: {
    borderRadius: 20,
    padding: spacing.l,
    alignItems: 'center',
    gap: spacing.s,
    marginVertical: spacing.s,
  },
  doneBtn: { alignSelf: 'stretch', marginTop: spacing.s },
});
