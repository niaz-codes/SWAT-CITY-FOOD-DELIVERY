import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { RootStackParamList } from '../../navigation/types';
import { jobApi } from '../../services/api';
import { onSocketEvent } from '../../services/socket';
import { apiErrorMessage } from '../../services/client';
import { useToast } from '../../state/ToastProvider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, formatDuration } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Shape of the backend's dispatch offer (Socket.IO `order:request`, one round
 * per order, re-broadcast on expiry with an incremented `attempt`).
 */
export type RiderOrderOfferData = {
  orderId: string;
  orderNumber?: string | null;
  attempt: number;
  ttlMs: number;
  restaurant: { name: string; area: string };
  pickupAddress: string;
  dropoff: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  distanceKm: number;
  durationMin: number;
  payout: number;
  total: number;
  itemCount: number;
  itemNames: string[];
  paymentMethod: string;
  broadcastAt: string;
};

const OFFER_EVENT = 'order:request';
const OFFER_RESOLVED_EVENT = 'order:request:resolved';

/** A dismissed offer is ignored until the SAME order comes back as a NEW round. */
const offerKey = (offer: Pick<RiderOrderOfferData, 'orderId' | 'attempt'>) =>
  `${offer.orderId}:${offer.attempt}`;

const cashLabel = (method: string) =>
  method === 'cash' ? 'Cash on delivery' : 'Prepaid & verified';

/**
 * The live "new delivery" offer the rider accepts or lets expire.
 *
 * Backend fan-out reaches every available online rider at once; the FIRST
 * Accept claims the order atomically in Postgres (losers get 409), so this
 * modal is purely a countdown UI: it suppresses a dismissed offer until the
 * next attempt round arrives, and disappears the moment the order leaves the
 * pool (`order:request:resolved`).
 */
export function RiderOrderOffer() {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const { error: toastError } = useToast();
  const [offer, setOffer] = useState<RiderOrderOfferData | null>(null);
  // Countdown seconds in state: the interval callback (an external-system
  // event) computes them from the deadline, so render stays pure.
  const [deadline, setDeadline] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const suppressed = useRef<Set<string>>(new Set());
  const offerRef = useRef<RiderOrderOfferData | null>(null);
  useEffect(() => {
    offerRef.current = offer;
  }, [offer]);

  const dismiss = useCallback(() => {
    const current = offerRef.current;
    if (current) suppressed.current.add(offerKey(current));
    setOffer(null);
  }, []);

  // Incoming offer rounds. A rider who rejected round N is shown round N+1.
  useEffect(() => {
    let disposed = false;
    const unsubs: (() => void)[] = [];

    onSocketEvent<RiderOrderOfferData | null>(OFFER_EVENT, (payload) => {
      if (!payload || typeof payload !== 'object') return;
      if (!payload.orderId || typeof payload.orderId !== 'string') return;
      if (suppressed.current.has(offerKey(payload))) return;
      // Only the newest round of an order is interesting.
      if (offerRef.current?.orderId === payload.orderId) {
        if (Number(payload.attempt) <= Number(offerRef.current.attempt)) return;
      }
      suppressed.current.delete(offerKey(payload));
      haptics.warning();
      const ttl = Math.max(5, Number(payload.ttlMs) || 40_000);
      setDeadline(Date.now() + ttl);
      setRemainingSec(Math.ceil(ttl / 1000));
      setOffer(payload);
    }).then((fn) => {
      if (disposed) fn?.();
      else unsubs.push(fn);
    });

    // The order left the pool (someone claimed it / it was cancelled): remove
    // it even if the modal is already counting down. The accept path already
    // clears its own state, so no acceptance guard is needed here.
    onSocketEvent<{ orderId?: string; reason?: string }>(OFFER_RESOLVED_EVENT, (payload) => {
      if (!payload?.orderId) return;
      const current = offerRef.current;
      if (current && current.orderId === payload.orderId) {
        if (payload.reason === 'cancelled') suppressed.current.add(offerKey(current));
        setOffer(null);
      }
    }).then((fn) => {
      if (disposed) fn?.();
      else unsubs.push(fn);
    });

    return () => {
      disposed = true;
      unsubs.forEach((fn) => fn?.());
    };
  }, []);

  // The Accept countdown, driven by the server's ttlMs. Expiry behaves like a
  // Reject: suppressed until the same order comes back as a retry round.
  useEffect(() => {
    if (!offer) return;
    const id = setInterval(() => {
      const current = offerRef.current;
      if (!current) {
        setOffer(null);
        return;
      }
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) {
        suppressed.current.add(offerKey(current));
        setOffer(null);
        setDeadline(0);
        setRemainingSec(0);
        return;
      }
      setRemainingSec(left);
    }, 500);
    return () => clearInterval(id);
  }, [offer, deadline]);

  const seconds = remainingSec;

  const accept = async () => {
    const current = offer;
    if (!current || accepting) return;
    setAccepting(true);
    try {
      haptics.success();
      const claimed = await jobApi.acceptFood(current.orderId);
      // offerRef state cleanup: don't keep a claimed order queued.
      suppressed.current.add(offerKey(current));
      setOffer(null);
      if (claimed) navigation.navigate('RiderFoodDelivery', { orderId: claimed.id });
    } catch (err) {
      // 409 = another rider won the race, rider_busy = finish your delivery.
      toastError(apiErrorMessage(err, 'Too late — someone else took this order.'));
      suppressed.current.add(offerKey(current));
      setOffer(null);
    } finally {
      setAccepting(false);
    }
  };

  const visible = Boolean(offer) && seconds > 0;
  const expiring = seconds <= 10;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          onPress={() => {}}
        >
          <View style={styles.topRow}>
            <View
              style={[styles.timerChip, { backgroundColor: expiring ? colors.dangerSoft ?? colors.danger : colors.primarySoft }]}
            >
              <Ionicons
                name="timer-outline"
                size={14}
                color={expiring ? colors.danger : colors.primary}
              />
              <AppText variant="smallMedium" weight="bold" color={expiring ? colors.danger : colors.primary}>
                {seconds}s
              </AppText>
            </View>
            <Badge label="New delivery request" tone="primary" icon="megaphone" />
          </View>

          <AppText variant="h3" weight="extraBold" color={colors.textPrimary} numberOfLines={1}>
            {offer?.restaurant.name ?? 'Restaurant'}
            {offer?.restaurant.area ? ` · ${offer.restaurant.area}` : ''}
          </AppText>

          <View style={styles.route}>
            <View style={styles.routeLine}>
              <Ionicons name="ellipse" size={10} color={colors.primary} />
              <View style={[styles.routeDash, { backgroundColor: colors.borderStrong }]} />
              <Ionicons name="location" size={12} color={colors.ride} />
            </View>
            <View style={styles.routeStops}>
              <AppText variant="small" color={colors.textSecondary} numberOfLines={1}>
                {offer?.pickupAddress || offer?.restaurant.name}
              </AppText>
              <AppText variant="small" color={colors.textPrimary} numberOfLines={2}>
                {offer?.dropoff}
              </AppText>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Meta
              label="Earnings"
              value={formatCurrency(offer?.payout ?? 0)}
              tint={colors.success}
            />
            <Meta
              label="Trip"
              value={`${(offer?.distanceKm ?? 0).toFixed(1)} km · ${formatDuration(offer?.durationMin ?? 0)}`}
              tint={colors.textPrimary}
            />
            <Meta label="Order" value={cashLabel(offer?.paymentMethod ?? '')} tint={colors.textSecondary} />
          </View>

          {offer?.itemNames && offer.itemNames.length > 0 ? (
            <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>
              {offer.itemCount} items · {offer.itemNames.join(', ')}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={dismiss}
              disabled={accepting}
              style={[styles.actionBtn, styles.rejectBtn, { borderColor: colors.border }]}
            >
              <AppText variant="small" weight="semiBold" color={colors.textSecondary}>
                Reject
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => void accept()}
              disabled={accepting}
              style={[styles.actionBtn, styles.acceptBtn, { backgroundColor: colors.primary, opacity: accepting ? 0.7 : 1 }]}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <AppText variant="small" weight="bold" color="#FFFFFF">
                {accepting ? 'CLAIMING…' : 'ACCEPT'}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Meta({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.meta}>
      <AppText variant="micro" color="rgba(0,0,0,0.45)">
        {label}
      </AppText>
      <AppText variant="smallMedium" weight="bold" color={tint} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,20,18,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.sm,
    marginBottom: spacing.l,
    marginHorizontal: spacing.m,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  route: { flexDirection: 'row', gap: spacing.sm },
  routeLine: { alignItems: 'center', paddingTop: 4, gap: 2 },
  routeDash: { width: 2, flex: 1, borderRadius: 1 },
  routeStops: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.l, marginTop: spacing.xs },
  meta: { gap: 1, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 14,
    paddingVertical: spacing.m,
  },
  rejectBtn: { borderWidth: 1, backgroundColor: 'transparent' },
  acceptBtn: {},
});
