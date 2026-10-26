import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { Avatar } from '../../components/Avatar';
import { MapComponent } from '../../components/MapComponent';
import { EmptyState } from '../../components/EmptyState';
import { rideApi, type RideDetail } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, formatDuration } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderActiveDelivery'>;

/** While the trip is live the screen polls for side-effects it did not cause. */
const POLL_MS = 10_000;

const STATUS_BADGE: Record<string, { label: string; tone: 'danger' | 'success' | 'primary' }> = {
  accepted: { label: 'Live', tone: 'danger' },
  arriving: { label: 'At pickup', tone: 'danger' },
  started: { label: 'On trip', tone: 'danger' },
  completed: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export function RiderActiveDeliveryScreen({ route, navigation }: Props) {
  const { rideId } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, error: toastError } = useToast();

  const [ride, setRide] = useState<RideDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rideRef = useRef<RideDetail | null>(null);
  rideRef.current = ride;

  const refresh = useCallback(async () => {
    try {
      const next = await rideApi.detail(rideId);
      const prev = rideRef.current;
      rideRef.current = next;
      setRide(next);
      setLoadFailed(false);
      // The customer can cancel at any moment; surface it the first time the
      // status flips to cancelled.
      if (next.status === 'cancelled' && prev?.status !== 'cancelled') {
        toastError(
          `Ride cancelled by the customer${next.cancelReason ? `: ${next.cancelReason}` : ''}`,
        );
      }
    } catch {
      // A poll failure is not fatal — the last known ride stays on screen.
      if (!rideRef.current) setLoadFailed(true);
    }
  }, [rideId, toastError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const status = rideRef.current?.status;
    if (!status || status === 'completed' || status === 'cancelled') return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [ride, refresh]);

  const advance = useCallback(
    async (status: 'arriving' | 'started' | 'completed', message: string) => {
      if (busy) return;
      setBusy(status);
      try {
        const next = await rideApi.advance(rideId, status);
        if (status === 'completed') haptics.success();
        success(message);
        setRide(next);
      } catch (err) {
        toastError(apiErrorMessage(err, 'Could not update the ride status. Refresh and try again.'));
      } finally {
        setBusy(null);
      }
    },
    [busy, rideId, success, toastError],
  );

  const dropRide = useCallback(async () => {
    if (busy) return;
    setBusy('cancel');
    try {
      await rideApi.cancelRider(rideId, 'Rider dropped the ride before pickup');
      success('Ride dropped. It is back in the pool.');
      navigation.goBack();
    } catch (err) {
      toastError(apiErrorMessage(err, 'Could not cancel this ride.'));
    } finally {
      setBusy(null);
    }
  }, [busy, rideId, navigation, success, toastError]);

  const callCustomer = (phone: string) => {
    haptics.light();
    Linking.openURL(`tel:${phone}`).catch(() => toastError('Could not open the dialer.'));
  };

  const openNavigation = (destination: { lat: number; lng: number; label?: string }) => {
    haptics.light();
    navigation.navigate('RiderNavigation', { destination });
  };

  if (loadFailed || (ride && ride.status === 'searching')) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Active delivery" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="car-outline"
          title="Ride not found"
          message="This ride is no longer assigned to you, or it was cancelled."
          onAction={() => navigation.navigate('RiderMain')}
          actionLabel="Back to dashboard"
        />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Active delivery" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <AppText variant="body" color={colors.textMuted}>
            Loading ride…
          </AppText>
        </View>
      </View>
    );
  }

  const badge = STATUS_BADGE[ride.status] ?? { label: ride.status, tone: 'danger' as const };
  const atPickup = ride.status === 'arriving';
  const onTrip = ride.status === 'started';
  const done = ride.status === 'completed';
  const cancelled = ride.status === 'cancelled';
  const driving = ride.status === 'accepted';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title={done ? 'Trip complete' : cancelled ? 'Ride cancelled' : 'Active delivery'}
        onBack={() => navigation.goBack()}
        right={<Badge label={badge.label} tone={badge.tone} icon={done ? 'checkmark-circle' : 'radio-button-on'} />}
      />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {cancelled && (
          <View style={[styles.arriveBanner, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
            <AppText variant="smallMedium" weight="bold" color={colors.textSecondary}>
              The customer{ride.cancelReason ? ` cancelled: ${ride.cancelReason}` : ' cancelled this ride'}
            </AppText>
          </View>
        )}

        {!done && !cancelled && (
          <MapComponent pickup={{ x: 0.3, y: 0.45 }} dropoff={onTrip ? { x: 0.72, y: 0.62 } : undefined} height={180} rounded={24} />
        )}

        <View style={[styles.steps, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Step icon="storefront-outline" label="Pickup" value={ride.pickup.address} active={driving || atPickup} done={!driving && !atPickup} />
          <View style={[styles.stepLine, { backgroundColor: colors.borderStrong }]} />
          <Step icon="location-outline" label="Drop off" value={ride.dropoff.address} active={onTrip} done={done} />
        </View>

        <View style={[styles.customerCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Avatar name={ride.customer.name} gradient={['#0E9488', '#0E3F3A']} size={46} />
          <View style={styles.customerInfo}>
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              {ride.customer.name}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {ride.vehicle} · {formatDuration(ride.durationMin)} trip
            </AppText>
          </View>
          {ride.customer.phone ? (
            <Pressable
              onPress={() => callCustomer(ride.customer.phone)}
              style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}
              hitSlop={6}
            >
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.fareCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View>
            <AppText variant="small" color={colors.textMuted}>
              Trip fare
            </AppText>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              {formatCurrency(ride.fare)}
            </AppText>
          </View>
          <View style={styles.fareDivider} />
          <View>
            <AppText variant="small" color={colors.textMuted}>
              You earn
            </AppText>
            <AppText variant="h4" weight="extraBold" color={colors.success}>
              {formatCurrency(ride.riderPayout)}
            </AppText>
          </View>
          <View style={styles.fareDivider} />
          <View>
            <AppText variant="small" color={colors.textMuted}>
              Distance
            </AppText>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              {ride.distanceKm.toFixed(1)} km
            </AppText>
          </View>
        </View>

        {cancelled && <AppButton label="Back" variant="secondary" onPress={() => navigation.goBack()} />}

        {done && (
          <View style={[styles.doneCard, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={30} color={colors.success} />
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              Delivered!
            </AppText>
            <AppText variant="small" color={colors.textSecondary}>
              {formatCurrency(ride.riderPayout)} added to your earnings.
            </AppText>
            <AppButton label="Done" onPress={() => navigation.navigate('RiderMain')} style={styles.doneBtn} />
          </View>
        )}

        {driving && (
          <>
            <AppButton
              label="Start navigation to pickup"
              icon="navigate"
              size="lg"
              onPress={() => openNavigation({ lat: ride.pickup.lat, lng: ride.pickup.lng, label: ride.pickup.address })}
            />
            <AppButton
              label="I've reached the pickup point"
              variant="secondary"
              disabled={busy === 'arriving'}
              onPress={() => {
                haptics.success();
                void advance('arriving', 'The customer was notified that you have arrived');
              }}
            />
            <AppButton label="Drop ride" variant="ghost" onPress={() => void dropRide()} />
          </>
        )}

        {atPickup && !done && !cancelled && (
          <>
            <AppButton
              label="Customer aboard — start trip"
              icon="checkmark"
              size="lg"
              disabled={busy === 'started'}
              onPress={() => {
                haptics.success();
                void advance('started', 'Trip started');
              }}
            />
            <AppButton label="Drop ride" variant="ghost" onPress={() => void dropRide()} />
          </>
        )}

        {onTrip && (
          <AppButton
            label="Mark delivered"
            icon="checkmark-done"
            size="lg"
            disabled={busy === 'completed'}
            onPress={() => void advance('completed', 'Ride completed — payout is on the way')}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Step({
  icon,
  label,
  value,
  active,
  done,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  active: boolean;
  done: boolean;
}) {
  const { colors } = useThemeColors();
  const occupied = active || done;
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.stepIcon,
          {
            backgroundColor: done ? colors.successSoft : occupied ? colors.rideSoft : colors.surfaceMuted,
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={done ? colors.success : occupied ? colors.ride : colors.textSecondary} />
      </View>
      <View style={styles.stepText}>
        <AppText variant="small" color={colors.textMuted}>
          {label}
        </AppText>
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={2}>
          {value}
        </AppText>
      </View>
      {done && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  arriveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: 16,
    padding: spacing.m,
  },
  steps: { borderRadius: 20, borderWidth: 1, padding: spacing.m },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepLine: { width: 2, height: 18, marginLeft: 22 },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, gap: 1 },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.m,
  },
  customerInfo: { flex: 1, gap: 1 },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.sm,
  },
  fareDivider: { width: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.1)' },
  doneCard: {
    borderRadius: 22,
    padding: spacing.l,
    alignItems: 'center',
    gap: spacing.xs,
  },
  doneBtn: { marginTop: spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
