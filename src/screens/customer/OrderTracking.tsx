import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { AppHeader } from '../../components/AppHeader';
import { MapComponent } from '../../components/MapComponent';
import { LeafletMap, type MapMarker } from '../../components/map/LeafletMap';
import { Avatar } from '../../components/Avatar';
import { ErrorState } from '../../components/EmptyState';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import {
  orderApi,
  paymentApi,
  reviewApi,
  transferApi,
  isManualTransferMethod,
  type OrderLiveTracking,
  type PaymentState,
} from '../../services/api';
import { ApiError } from '../../services/client';
import { onSocketEvent } from '../../services/socket';
import { useAsyncData } from '../../hooks/useAsyncData';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { buildOrderFollowUpMessage } from '../../utils/whatsapp';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { WhatsAppContactDialog } from '../../components/WhatsAppContactDialog';
import { OrderStatus, type RiderLocationEvent } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;

/**
 * The customer's own uploaded payment screenshot, loaded through the
 * owner-checked signed URL endpoint (`transferApi.receiptUrl`) — never a
 * public storage link. Fetched only for direct-transfer orders waiting on /
 * rejected by verification; renders nothing when no proof is on file yet
 * (404) so brand-new manual orders stay clean.
 */
function PaymentProofPreview({ orderId }: { orderId: string }) {
  const { colors } = useThemeColors();
  const proof = useAsyncData(() => transferApi.receiptUrl(orderId), [orderId]);
  if (!proof.data) return null;
  return (
    <View style={styles.proofWrap}>
      <Image
        source={{ uri: proof.data }}
        style={[styles.proofImage, { backgroundColor: colors.surfaceMuted }]}
        resizeMode="contain"
      />
      <AppText variant="micro" color={colors.textMuted}>
        Your uploaded payment screenshot
      </AppText>
    </View>
  );
}

const STEPS: { key: OrderStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' },
  { key: 'preparing', label: 'Preparing', icon: 'restaurant-outline' },
  { key: 'rider_assigned', label: 'Rider assigned', icon: 'navigate-outline' },
  { key: 'picked_up', label: 'Picked up', icon: 'bicycle-outline' },
  { key: 'delivered', label: 'Delivered', icon: 'home-outline' },
];

export function OrderTrackingScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { colors } = useThemeColors();
  const { success, error: toastError } = useToast();

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    // Display labels only. `cash` and `wallet` stay here so historical orders
    // created before these methods were retired still render their real method.
    // Nothing can create a new order with either — see ORDER_CHECKOUT_METHODS.
    cash: 'Cash on delivery',
    easypaisa: 'Easypaisa',
    jazzcash: 'JazzCash',
    wallet: 'Swat City Food Delivery wallet',
    // Direct bank/wallet transfer orders: payment happens by hand, then the
    // receipt is verified by an admin.
    ubl: 'Direct Bank Transfer (UBL)',
    easypaisa_transfer: 'Easypaisa – Direct Transfer',
    jazzcash_transfer: 'JazzCash – Direct Transfer',
  };

  const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending: 'Awaiting payment',
    processing: 'Processing',
    paid: 'Paid',
    failed: 'Failed',
    cancelled: 'Cancelled',
    // Manual transfer lifecycle: the proof sits with an admin until the bank
    // statement is checked, and a rejection always comes with a reason.
    pending_verification: 'Awaiting verification',
    rejected: 'Not verified - proof rejected',
  };

  const order = useAsyncData(() => orderApi.trackOrder(orderId), [orderId]);

  /**
   * Live tracking state.
   *
   * The server is the authority on whether a position may be shown: it returns
   * `trackingActive: false` and a null location once the delivery ends. Polling
   * provides the baseline and the socket updates the marker in between, so the
   * map keeps moving without a request per second. The rider position lives in
   * `tracking.rider.location` (rendered directly) — no separate ref mirror.
   */
  const [tracking, setTracking] = useState<OrderLiveTracking | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await orderApi.trackLive(orderId);
        if (!cancelled) setTracking(next);
      } catch {
        // Tracking is supplementary; the order card still renders without it.
      }
    };
    void load();
    // 15s is a safety net: if the socket is blocked, the marker still advances
    // as the rider moves instead of freezing at the assigned point.
    const timer = setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void onSocketEvent<RiderLocationEvent>('rider:location', (event) => {
      // Only the assigned rider for THIS order may be shown.
      if (event.orderId && event.orderId !== orderId) return;
      setTracking((cur) =>
        cur?.rider && (!cur.rider.id || event.riderId === cur.rider.id)
          ? {
              ...cur,
              rider: {
                ...cur.rider,
                location: {
                  lat: event.latitude,
                  lng: event.longitude,
                  heading: event.heading,
                  updatedAt: event.timestamp,
                },
              },
            }
          : cur,
      );
    }).then((off) => {
      if (cancelled) off();
      else cleanup = off;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [orderId]);

  /**
   * Payment state is polled rather than inferred from the browser redirect — a
   * redirect proves nothing, only the server's gateway check does. We stop
   * polling once the payment reaches a terminal state.
   */
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const paymentStatus = paymentState?.payment?.status ?? 'pending';
  /**
   * Terminal payment states stop the poll. The manual-transfer states are
   * deliberately NOT terminal here — `pending_verification` flips to paid or
   * rejected when an admin decides, and `rejected` expects the customer to
   * resubmit — so both must keep polling. The order itself being cancelled
   * always ends the poll: no payment decision is coming either way.
   */
  const paymentSettled =
    paymentStatus === 'paid' ||
    paymentStatus === 'failed' ||
    paymentStatus === 'cancelled' ||
    (order.data?.status ?? 'placed') === 'cancelled';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const state = await paymentApi.status(orderId);
        if (!cancelled) setPaymentState(state);
      } catch {
        // Payment details are supplementary; the order itself still renders.
      }
    };
    void load();
    if (paymentSettled) return;
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId, paymentSettled]);

  const status = order.data?.status ?? 'placed';
  const delivered = status === 'delivered';

  const stepsAt: Record<OrderStatus, number> = {
    placed: 0,
    confirmed: 1,
    preparing: 2,
    ready: 2,
    rider_assigned: 3,
    picked_up: 4,
    on_the_way: 4,
    delivered: 5,
    cancelled: 0,
  };

  const activeStep = stepsAt[status] ?? 0;

  const mapProgress = useSharedValue(0);
  useEffect(() => {
    if (delivered) {
      mapProgress.value = 1;
      return;
    }
    mapProgress.value = 0;
    mapProgress.value = withRepeat(withTiming(activeStep / 5, { duration: 6000 }), -1, false);
  }, [delivered, activeStep, mapProgress]);

  // Reanimated 4 + the 19.x style types disagree on the returned handle, so the
  // shared opacity style is narrowed to the shape Animated.View consumes.
  const riderBubble = useAnimatedStyle(
    () => ({ opacity: delivered ? 0 : 1 }),
  ) as unknown as ViewStyle;

  /**
   * Customer cancel + rating flows. The backend decides both: cancel is legal
   * only until the kitchen hands the order to a rider (pending → ready), and
   * every cancel needs a reason. Rating posts a restaurant review tied to this
   * delivered order, so the server verifies the purchase — duplicates answer
   * 409 and we surface that as "already rated" instead of a hostile error.
   */
  const cancellableStatuses: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'ready'];
  const cancellable = cancellableStatuses.includes(status);
  const reviewRestaurantId = order.data?.items[0]?.restaurantId ?? '';
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rated, setRated] = useState(false);
  const [riderRateOpen, setRiderRateOpen] = useState(false);
  const [riderRated, setRiderRated] = useState(false);
  // Chat channel for follow-up questions on an order that already exists in
  // the app — it never creates or changes this order.
  const [whatsOpen, setWhatsOpen] = useState(false);

  // Rider-rating step: resolves the target from the live-tracking payload /
  // order snapshot. Both carry the rider USER id, which is what a `rider`
  // review is verified against server-side (it must equal order.rider on the
  // delivered order). Duplicates answer 409 and surface as "already rated".
  const riderRatingTargetId = tracking?.rider?.id ?? order.data?.rider?.id ?? '';
  const submitRiderRating = useCallback(
    async (rating: number, comment: string) => {
      if (!riderRatingTargetId) return;
      setBusy(true);
      try {
        await reviewApi.create({
          targetType: 'rider',
          targetId: riderRatingTargetId,
          rating,
          comment: comment.trim() ? comment.trim() : undefined,
          orderId,
        });
        setRiderRated(true);
        setRiderRateOpen(false);
        success('Thanks for rating your rider!');
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setRiderRated(true);
          setRiderRateOpen(false);
          success('You already rated this rider');
        } else {
          toastError(e instanceof Error ? e.message : 'Could not submit the rating.');
        }
      } finally {
        setBusy(false);
      }
    },
    [riderRatingTargetId, orderId, success, toastError],
  );

  const submitCancel = useCallback(
    async (reason: string) => {
      setBusy(true);
      try {
        await orderApi.cancelOrder(orderId, reason);
        setCancelOpen(false);
        success('Order cancelled');
        navigation.goBack();
      } catch (e) {
        toastError(
          e instanceof ApiError && e.status === 409
            ? 'Too late to cancel - the kitchen already moved on.'
            : e instanceof Error
              ? e.message
              : 'Could not cancel the order.',
        );
      } finally {
        setBusy(false);
      }
    },
    [orderId, navigation, success, toastError],
  );

  const submitRating = useCallback(
    async (rating: number, comment: string) => {
      if (!reviewRestaurantId) return;
      setBusy(true);
      try {
        await reviewApi.create({
          targetType: 'restaurant',
          targetId: reviewRestaurantId,
          rating,
          comment: comment.trim() ? comment.trim() : undefined,
          orderId,
        });
        setRated(true);
        setRateOpen(false);
        success('Thanks for the rating!');
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setRated(true);
          setRateOpen(false);
          success('You already rated this order');
        } else {
          toastError(e instanceof Error ? e.message : 'Could not submit the rating.');
        }
      } finally {
        setBusy(false);
      }
    },
    [reviewRestaurantId, orderId, success, toastError],
  );

  const statusInfo = useMemo(() => {
    const map: Record<OrderStatus, { text: string; sub: string }> = {
      placed: { text: 'Order placed', sub: 'Waiting for restaurant to accept' },
      confirmed: { text: 'Order confirmed', sub: 'The restaurant accepted your order' },
      preparing: { text: 'Being prepared', sub: 'Your food is being cooked fresh' },
      ready: { text: 'Ready for pickup', sub: 'Finding a rider for your order' },
      rider_assigned: { text: 'Rider assigned', sub: 'Your rider is heading to the restaurant' },
      picked_up: { text: 'On the way', sub: 'Rider picked up your order' },
      on_the_way: { text: 'Rider in transit', sub: 'Heading to your address' },
      delivered: { text: 'Delivered', sub: 'Enjoy your meal from Swat City Food Delivery!' },
      cancelled: { text: 'Order cancelled', sub: 'We are sorry about that' },
    };
    const base = map[status];
    // Direct-transfer orders: the real milestone BEFORE admin verification is
    // the payment, not the kitchen. The generic "waiting for the restaurant"
    // line would be nonsense while the order cannot even be confirmed yet.
    if (
      isManualTransferMethod(paymentState?.paymentMethod ?? '') &&
      status !== 'cancelled' &&
      status !== 'delivered' &&
      paymentStatus !== 'paid'
    ) {
      if (paymentStatus === 'pending_verification') {
        return {
          text: 'Waiting for approval',
          sub: 'Admin is verifying your transfer against the bank statement',
        };
      }
      if (paymentStatus === 'rejected') {
        return {
          text: 'Payment not verified',
          sub: 'Submit corrected proof to get your order approved',
        };
      }
      return {
        text: 'Waiting for payment',
        sub: 'Transfer the amount and upload your receipt to finish checkout',
      };
    }
    return base;
  }, [status, paymentState, paymentStatus]);

  const handleCancel = () => {
    haptics.warning();
    setCancelOpen(true);
  };

  if (order.loading && !order.data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Track order" onBack={() => navigation.goBack()} elevated />
        <View style={styles.center}>
          <AppText variant="body" color={colors.textMuted}>
            Loading your order…
          </AppText>
        </View>
      </View>
    );
  }

  if (order.error && !order.data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Track order" onBack={() => navigation.goBack()} elevated />
        <ErrorState onRetry={order.refetch} />
      </View>
    );
  }

  const current = order.data!;

  // Rider identity for the card and the dialer: the live tracking payload is
  // authoritative (it carries the real phone number); the order snapshot fills
  // any hole (older payload / tracking request still in flight).
  const liveRider = tracking?.rider ?? null;
  const riderName = liveRider?.name || current.rider?.name || 'Your rider';
  const riderPhone = liveRider?.phone || current.rider?.phone || '';
  // Rating target: both payloads carry the rider USER id, which is exactly what
  // a `rider` review is verified against server-side (it must equal order.rider).
  const riderId = liveRider?.id || current.rider?.id || '';
  const callRider = () => {
    haptics.light();
    if (!riderPhone) {
      toastError('No phone number available yet.');
      return;
    }
    Linking.openURL(`tel:${riderPhone}`).catch(() => toastError('Could not open the dialer.'));
  };

  // Live ETA: while a rider is moving, the server's hop-to-next-stop estimate
  // beats the kitchen's whole-journey guess; otherwise keep the order's ETA.
  const etaMinutes =
    tracking?.trackingActive && tracking.etaMinutes != null
      ? tracking.etaMinutes
      : current.estimatedMinutes;
  const distanceText =
    tracking?.trackingActive && tracking.riderDistanceKm != null
      ? `${tracking.riderDistanceKm.toFixed(1)} km away`
      : '';

  // Real map: restaurant pickup point + delivery destination + (while live)
  // the moving rider, with the pickup→destination polyline behind them. All of
  // the coordinates come from the server payload — nothing is synthesized.
  const stopMarkers: MapMarker[] = [
    ...(tracking?.pickup
      ? [
          {
            id: 'pickup',
            lat: tracking.pickup.lat,
            lng: tracking.pickup.lng,
            kind: 'restaurant' as const,
            label: 'Pickup',
            popupLines: [{ label: 'Pickup', value: tracking.pickup.name }],
          },
        ]
      : []),
    ...(tracking?.destination
      ? [
          {
            id: 'destination',
            lat: tracking.destination.lat,
            lng: tracking.destination.lng,
            kind: 'destination' as const,
            label: 'Your address',
          },
        ]
      : []),
  ];
  const liveMarker: MapMarker | null =
    tracking?.trackingActive && tracking.rider?.location
      ? {
          id: `rider:${tracking.rider.id}`,
          lat: tracking.rider.location.lat,
          lng: tracking.rider.location.lng,
          kind: 'rider',
          avatarUrl: tracking.rider.avatarUrl,
          heading: tracking.rider.location.heading,
          selected: true,
          popupLines: [{ label: 'Rider', value: riderName }],
        }
      : null;
  const mapMarkers: MapMarker[] = [...stopMarkers, ...(liveMarker ? [liveMarker] : [])];
  const routePoints =
    tracking?.pickup && tracking?.destination
      ? [
          { lat: tracking.pickup.lat, lng: tracking.pickup.lng },
          { lat: tracking.destination.lat, lng: tracking.destination.lng },
        ]
      : [];
  const hasRealMap = mapMarkers.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Order ${current.id}`} onBack={() => navigation.goBack()} elevated />

      <View style={styles.mapWrap}>
        {hasRealMap ? (
          <>
            <LeafletMap
              markers={mapMarkers}
              route={routePoints}
              height={220}
              borderRadius={24}
              followMarkers
            />
            {tracking?.trackingActive ? (
              <>
                <Animated.View
                  style={[
                    styles.liveChip,
                    { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                    riderBubble,
                  ]}
                >
                  <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                  <AppText variant="microBold" color={colors.textPrimary}>
                    LIVE
                  </AppText>
                </Animated.View>
                {distanceText ? (
                  <View
                    style={[
                      styles.liveChip,
                      styles.distanceChip,
                      { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                      riderBubble,
                    ]}
                  >
                    <Ionicons name="navigate" size={12} color={colors.primary} />
                    <AppText variant="microBold" color={colors.textPrimary}>
                      {distanceText}
                    </AppText>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <MapComponent
            pickup={{ x: 0.24, y: 0.36 }}
            dropoff={{ x: 0.74, y: 0.66 }}
            height={190}
            rounded={24}
            progress={mapProgress}
          />
        )}
      </View>

      <Animated.View
        entering={FadeInUp.duration(300)}
        style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        <View style={styles.statusRow}>
          <View style={styles.statusText}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              {statusInfo.text}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {statusInfo.sub}
            </AppText>
          </View>
          <View style={[styles.etaChip, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>
              {etaMinutes} min
            </AppText>
            {distanceText ? (
              <AppText variant="micro" color={colors.primaryStrong}>
                · {distanceText}
              </AppText>
            ) : null}
          </View>
        </View>

        <View style={styles.steps}>
          {STEPS.map((s, i) => {
            const state = i < activeStep ? 'done' : i === activeStep ? 'active' : 'todo';
            return (
              <View key={s.key} style={styles.step}>
                <View style={styles.stepHead}>
                  <View
                    style={[
                      styles.stepDot,
                      {
                        borderColor: state === 'todo' ? colors.borderStrong : colors.primary,
                        backgroundColor:
                          state === 'done'
                            ? colors.primary
                            : state === 'active'
                              ? colors.primarySoft
                              : colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Ionicons
                      name={state === 'done' ? 'checkmark' : s.icon}
                      size={14}
                      color={
                        state === 'done'
                          ? colors.onPrimary
                          : state === 'active'
                            ? colors.primary
                            : colors.textMuted
                      }
                    />
                  </View>
                  {i < STEPS.length - 1 && (
                    <View
                      style={[
                        styles.stepLine,
                        { backgroundColor: i < activeStep ? colors.primary : colors.border },
                      ]}
                    />
                  )}
                </View>
                <AppText
                  variant="micro"
                  weight={state === 'active' ? 'bold' : 'semiBold'}
                  color={state === 'todo' ? colors.textMuted : colors.textPrimary}
                  style={styles.stepLabel}
                >
                  {s.label}
                </AppText>
              </View>
            );
          })}
        </View>
      </Animated.View>

      {(current.rider || liveRider) && (
        <Animated.View
          entering={FadeInUp.delay(80).duration(300)}
          style={[
            styles.card,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <View style={styles.riderRow}>
            <Avatar
              size={54}
              name={riderName}
              gradient={current.rider?.avatarGradient ?? ['#1B84B5', '#0E3F3A']}
            />
            <View style={styles.riderInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                {riderName}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {tracking?.trackingActive
                  ? distanceText
                    ? `Heading to you · ${distanceText}`
                    : 'Heading to your address'
                  : current.rider
                    ? `${current.rider.vehicle} · ${current.rider.plateNumber} · ⭐ ${current.rider.rating}`
                    : 'Delivering your order'}
              </AppText>
            </View>
            <View style={styles.riderActions}>
              <Pressable
                onPress={callRider}
                style={[
                  styles.actionBtn,
                  { backgroundColor: riderPhone ? colors.primary : colors.surfaceMuted },
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={riderPhone ? colors.onPrimary : colors.textMuted}
                />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      <Animated.View
        entering={FadeInUp.delay(140).duration(300)}
        style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        <View style={styles.summaryRow}>
          <AppText variant="small" color={colors.textMuted}>
            {current.items.length} items
          </AppText>
          <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
            {formatCurrency(current.total)}
          </AppText>
        </View>
        <Pressable onPress={() => navigation.goBack()} hitSlop={6} style={styles.addressRow}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <AppText
            variant="small"
            color={colors.textSecondary}
            numberOfLines={1}
            style={styles.addressText}
          >
            {current.address}
          </AppText>
        </Pressable>
      </Animated.View>

      {paymentState && (
        <Animated.View
          entering={FadeInUp.delay(180).duration(300)}
          style={[
            styles.card,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <View style={styles.summaryRow}>
            <View style={styles.payMethodRow}>
              <Ionicons name="wallet-outline" size={16} color={colors.primary} />
              <AppText variant="smallMedium" weight="semiBold" color={colors.textPrimary}>
                {PAYMENT_METHOD_LABELS[paymentState.paymentMethod] ?? 'Payment'}
              </AppText>
            </View>
            <AppText
              variant="smallMedium"
              weight="bold"
              color={
                paymentStatus === 'paid'
                  ? colors.success
                  : paymentStatus === 'failed' ||
                      paymentStatus === 'cancelled' ||
                      paymentStatus === 'rejected'
                    ? colors.danger
                    : colors.warning
              }
            >
              {PAYMENT_STATUS_LABELS[paymentStatus] ?? 'Processing'}
            </AppText>
          </View>

          {paymentStatus === 'pending_verification' &&
            isManualTransferMethod(paymentState.paymentMethod) && (
              <AppText variant="micro" color={colors.textMuted} style={styles.refText}>
                Your transfer is being verified against the bank statement.
              </AppText>
            )}

          {/* The uploaded proof itself, for waiting + rejected states: the
              customer can always see exactly which screenshot is on file. */}
          {isManualTransferMethod(paymentState.paymentMethod) &&
            (paymentStatus === 'pending_verification' || paymentStatus === 'rejected') && (
              <PaymentProofPreview orderId={orderId} />
            )}

          {paymentState.payment?.transactionRef ? (
            <AppText variant="micro" color={colors.textMuted} style={styles.refText}>
              Reference {paymentState.payment.transactionRef}
            </AppText>
          ) : null}

          {paymentState.payment?.failureReason ? (
            <AppText variant="micro" color={colors.danger} style={styles.refText}>
              {paymentState.payment.failureReason}
            </AppText>
          ) : null}

          {/* No proof on file yet (customer left the instructions screen, or
              a failed attempt used up nothing): the checkout can still be
              finished by submitting the transfer receipt now. */}
          {(paymentStatus === 'pending' ||
            paymentStatus === 'processing' ||
            paymentStatus === 'failed') &&
            isManualTransferMethod(paymentState.paymentMethod) &&
            status !== 'cancelled' && (
              <Pressable
                onPress={() => navigation.navigate('ManualTransfer', { orderId })}
                hitSlop={6}
                style={styles.switchRow}
              >
                <AppText variant="micro" color={colors.primary} weight="semiBold">
                  Transfer now &amp; upload payment screenshot
                </AppText>
              </Pressable>
            )}

          {/* A rejected manual-transfer proof is fixed by submitting corrected
              proof on the instructions screen — no gateway to retry. */}
          {paymentStatus === 'rejected' &&
            isManualTransferMethod(paymentState.paymentMethod) &&
            status !== 'cancelled' && (
              <Pressable
                onPress={() => navigation.navigate('ManualTransfer', { orderId })}
                hitSlop={6}
                style={styles.switchRow}
              >
                <AppText variant="micro" color={colors.primary} weight="semiBold">
                  Submit corrected payment proof
                </AppText>
              </Pressable>
            )}

          {/* An unpaid NON-manual order (legacy gateway rows only) can be
              retried through the checkout. Direct-transfer orders use the
              instructions screen above instead. There is no cash fallback. */}
          {paymentStatus === 'failed' && status !== 'cancelled' && !isManualTransferMethod(paymentState.paymentMethod) && (
            <Pressable
              onPress={() => {
                success('Opening checkout to retry payment…');
                navigation.navigate('Checkout');
              }}
              hitSlop={6}
              style={styles.switchRow}
            >
              <AppText variant="micro" color={colors.primary} weight="semiBold">
                Retry payment
              </AppText>
            </Pressable>
          )}
        </Animated.View>
      )}

      {!delivered && status !== 'cancelled' && (
        <View style={styles.ctaRow}>
          <WhatsAppButton
            compact
            label="Chat about this order on WhatsApp"
            onPress={() => setWhatsOpen(true)}
          />
          {cancellable && (
            <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancelBtn}>
              <AppText variant="smallMedium" weight="semiBold" color={colors.danger}>
                Cancel order
              </AppText>
            </Pressable>
          )}
        </View>
      )}

      {delivered && Boolean(reviewRestaurantId) && (
        <Pressable
          onPress={() => {
            haptics.light();
            setRateOpen(true);
          }}
          disabled={rated}
          style={[styles.doneBtn, { backgroundColor: rated ? colors.surfaceMuted : colors.primary }]}
        >
          <AppText variant="title" weight="bold" color={rated ? colors.textMuted : colors.onPrimary}>
            {rated ? 'Rating received - thank you' : 'Rate your order'}
          </AppText>
        </Pressable>
      )}

      {delivered && Boolean(riderId) && (
        <Pressable
          onPress={() => {
            haptics.light();
            setRiderRateOpen(true);
          }}
          disabled={riderRated}
          style={[
            styles.doneBtn,
            { backgroundColor: riderRated ? colors.surfaceMuted : colors.primary },
          ]}
        >
          <AppText
            variant="title"
            weight="bold"
            color={riderRated ? colors.textMuted : colors.onPrimary}
          >
            {riderRated ? 'Rider rating received - thank you' : 'Rate your rider'}
          </AppText>
        </Pressable>
      )}

      {delivered && Boolean(reviewRestaurantId) && (
        <View style={styles.ctaRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={6} style={styles.cancelBtn}>
            <AppText variant="smallMedium" weight="semiBold" color={colors.textSecondary}>
              Back to home
            </AppText>
          </Pressable>
          <WhatsAppButton
            compact
            label="Chat about this order on WhatsApp"
            onPress={() => setWhatsOpen(true)}
          />
        </View>
      )}

      {delivered && !reviewRestaurantId && (
        <View style={styles.ctaRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={6} style={styles.cancelBtn}>
            <AppText variant="smallMedium" weight="semiBold" color={colors.textSecondary}>
              Back to home
            </AppText>
          </Pressable>
          <WhatsAppButton
            compact
            label="Chat about this order on WhatsApp"
            onPress={() => setWhatsOpen(true)}
          />
        </View>
      )}

      <OrderCancelDialog
        visible={cancelOpen}
        busy={busy}
        onConfirm={(reason) => void submitCancel(reason)}
        onClose={() => !busy && setCancelOpen(false)}
      />
      <RateOrderDialog
        visible={rateOpen}
        busy={busy}
        onConfirm={(rating, comment) => void submitRating(rating, comment)}
        onClose={() => !busy && setRateOpen(false)}
      />
      <RateOrderDialog
        visible={riderRateOpen}
        busy={busy}
        title="How was your rider?"
        submitLabel="Send rider rating"
        onConfirm={(rating, comment) => void submitRiderRating(rating, comment)}
        onClose={() => !busy && setRiderRateOpen(false)}
      />
      <WhatsAppContactDialog
        visible={whatsOpen}
        title="Chat about this order"
        message={buildOrderFollowUpMessage({
          restaurantName: current.restaurantName,
          items: current.items.map((ci) => ({
            name: ci.menuItem.name,
            quantity: ci.quantity,
            unitPrice: ci.menuItem.price,
          })),
          total: current.total,
          statusLabel: statusInfo.text,
          placedAt: current.placedAt,
        })}
        onClose={() => setWhatsOpen(false)}
      />
    </View>
  );
}

/**
 * Cancel dialog. The backend requires a reason (min 3 chars), so the presets
 * are tap-friendly shortcuts and "Other" opens a text field — the combined
 * value is what gets sent.
 */
const CANCEL_REASON_PRESETS = [
  'Changed my mind',
  'Ordered by mistake',
  'The delivery address is wrong',
  'Taking too long to arrive',
];

export function OrderCancelDialog({
  visible,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const { colors } = useThemeColors();
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');

  const reason = custom ? text.trim() : '';
  const ready = custom ? reason.length >= 3 : true;

  const close = () => {
    setCustom(false);
    setText('');
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={dialogStyles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : close} />
        <View
          style={[
            dialogStyles.sheet,
            { backgroundColor: colors.surfaceRaised, borderRadius: radius.xxl },
          ]}
        >
          <View style={[dialogStyles.iconLine, { backgroundColor: colors.danger }]} />
          <AppText variant="h4" weight="bold" color={colors.textPrimary}>
            Cancel this order?
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            Tell us why - the kitchen reads it and it keeps the refund rules honest.
          </AppText>

          {!custom ? (
            <View style={dialogStyles.options}>
              {CANCEL_REASON_PRESETS.map((preset) => (
                <AppButton
                  key={preset}
                  label={preset}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() => {
                    setText(preset);
                    onConfirm(preset);
                  }}
                  fullWidth
                />
              ))}
              <Pressable onPress={() => setCustom(true)} hitSlop={6} style={dialogStyles.link}>
                <AppText variant="small" weight="semiBold" color={colors.primary}>
                  Other reason…
                </AppText>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                style={[
                  dialogStyles.input,
                  { borderColor: colors.borderStrong, color: colors.textPrimary },
                ]}
                placeholder="Tell us what happened…"
                placeholderTextColor={colors.textMuted}
                value={text}
                editable={!busy}
                multiline
                onChangeText={setText}
                autoFocus
              />
              {!ready && text.length > 0 && (
                <AppText variant="micro" color={colors.danger}>
                  At least 3 characters, please.
                </AppText>
              )}
              <View style={dialogStyles.actions}>
                <AppButton
                  label="Back"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() => {
                    setCustom(false);
                  }}
                  fullWidth={false}
                />
                <AppButton
                  label="Cancel order"
                  variant="danger"
                  size="sm"
                  loading={busy}
                  disabled={!ready}
                  onPress={() => onConfirm(reason)}
                  fullWidth={false}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const RATE_LABELS = ['', 'Bad', 'Meh', 'Good', 'Great', 'Excellent'] as const;

/** Delivered-order rating screen: 1-5 stars + an optional note. */
export function RateOrderDialog({
  visible,
  busy,
  title = 'How was your meal?',
  submitLabel = 'Send rating',
  onConfirm,
  onClose,
}: {
  visible: boolean
  busy: boolean
  /** The stars UI is shared between the restaurant and the rider rating step. */
  title?: string
  submitLabel?: string
  onConfirm: (rating: number, comment: string) => void
  onClose: () => void
}) {
  const { colors } = useThemeColors();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const close = () => {
    setRating(0);
    setComment('');
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={dialogStyles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : close} />
        <View
          style={[
            dialogStyles.sheet,
            { backgroundColor: colors.surfaceRaised, borderRadius: radius.xxl },
          ]}
        >
          <View style={[dialogStyles.iconLine, { backgroundColor: colors.primary }]} />
          <AppText variant="h4" weight="bold" color={colors.textPrimary}>
            {title}
          </AppText>
          <View style={dialogStyles.stars}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  haptics.light();
                  setRating(value);
                }}
                hitSlop={6}
                disabled={busy}
                aria-label={`Rate ${value} star${value === 1 ? '' : 's'}`}
              >
                <Ionicons
                  name={value <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={value <= rating ? colors.warning : colors.borderStrong}
                />
              </Pressable>
            ))}
          </View>
          {rating > 0 && (
            <AppText variant="small" weight="semiBold" color={colors.textSecondary}>
              {RATE_LABELS[rating]}
            </AppText>
          )}
          <TextInput
            style={[dialogStyles.input, { borderColor: colors.borderStrong, color: colors.textPrimary }]}
            placeholder="Anything to add? (optional)"
            placeholderTextColor={colors.textMuted}
            value={comment}
            editable={!busy}
            multiline
            onChangeText={setComment}
          />
          <View style={dialogStyles.actions}>
            <AppButton
              label="Skip"
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={close}
              fullWidth={false}
            />
            <AppButton
              label={submitLabel}
              variant="primary"
              size="sm"
              loading={busy}
              disabled={rating < 1}
              onPress={() => onConfirm(rating, comment)}
              fullWidth={false}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const dialogStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    backgroundColor: 'rgba(8, 15, 20, 0.55)',
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconLine: { width: 40, height: 4, borderRadius: 2 },
  options: { width: '100%', gap: spacing.xs, marginTop: spacing.xs },
  link: { alignSelf: 'center', padding: spacing.s },
  input: {
    width: '100%',
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.sm,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  stars: { flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.xs },
  actions: { flexDirection: 'row', alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xs },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapWrap: { margin: spacing.m, marginBottom: spacing.s, position: 'relative' },
  liveChip: {
    position: 'absolute',
    top: spacing.s + 4,
    right: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  distanceChip: { top: 8, left: 'auto', right: 12, position: 'absolute' },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: spacing.m,
    marginBottom: spacing.sm,
    padding: spacing.m,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1, gap: 2 },
  etaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 32,
    borderRadius: 16,
  },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.l },
  step: { width: '23%' },
  stepHead: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepLine: { flex: 1, height: 2, marginHorizontal: spacing.xs },
  stepLabel: { marginTop: spacing.xs, textAlign: 'center' },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  riderInfo: { flex: 1 },
  riderActions: { flexDirection: 'row' },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payMethodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  refText: { marginTop: spacing.xs },
  proofWrap: { marginTop: spacing.xs, gap: spacing.xxs },
  proofImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.image,
  },
  switchRow: { marginTop: spacing.xs },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  addressText: { flex: 1 },
  cancelBtn: { alignSelf: 'center', marginTop: spacing.xs, padding: spacing.s },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s, marginTop: spacing.xs },
  doneBtn: {
    marginHorizontal: spacing.m,
    marginTop: spacing.xs,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
