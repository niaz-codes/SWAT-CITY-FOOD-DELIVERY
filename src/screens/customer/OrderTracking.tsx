import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { AppHeader } from '../../components/AppHeader';
import { MapComponent } from '../../components/MapComponent';
import { LeafletMap } from '../../components/map/LeafletMap';
import { Avatar } from '../../components/Avatar';
import { ErrorState } from '../../components/EmptyState';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import {
  orderApi,
  paymentApi,
  reviewApi,
  type OrderLiveTracking,
  type PaymentState,
} from '../../services/api';
import { ApiError } from '../../services/client';
import { onSocketEvent } from '../../services/socket';
import { useAsyncData } from '../../hooks/useAsyncData';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { OrderStatus, type RiderLocationEvent } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;

const STEPS: { key: OrderStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' },
  { key: 'preparing', label: 'Preparing', icon: 'restaurant-outline' },
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
  };

  const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending: 'Awaiting payment',
    processing: 'Processing',
    paid: 'Paid',
    failed: 'Failed',
    cancelled: 'Cancelled',
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
  const paymentSettled =
    paymentStatus === 'paid' || paymentStatus === 'failed' || paymentStatus === 'cancelled';

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
    picked_up: 3,
    on_the_way: 3,
    delivered: 4,
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
    mapProgress.value = withRepeat(withTiming(activeStep / 4, { duration: 6000 }), -1, false);
  }, [delivered, activeStep, mapProgress]);

  const riderBubble = useAnimatedStyle(() => ({ opacity: delivered ? 0 : 1 }));

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
      ready: { text: 'Ready for pickup', sub: 'A rider is on the way' },
      picked_up: { text: 'On the way', sub: 'Rider picked up your order' },
      on_the_way: { text: 'Rider in transit', sub: 'Heading to your address' },
      delivered: { text: 'Delivered', sub: 'Enjoy your meal from Swat City Food Delivery!' },
      cancelled: { text: 'Order cancelled', sub: 'We are sorry about that' },
    };
    return map[status];
  }, [status]);

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

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Order ${current.id}`} onBack={() => navigation.goBack()} elevated />

      <View style={styles.mapWrap}>
        {tracking?.trackingActive && tracking.rider?.location && tracking.rider ? (
          <>
            <LeafletMap
              markers={[
                {
                  id: `rider:${tracking.rider.id}`,
                  lat: tracking.rider.location.lat,
                  lng: tracking.rider.location.lng,
                  kind: 'rider',
                  avatarUrl: tracking.rider.avatarUrl,
                  heading: tracking.rider.location.heading,
                  selected: true,
                  popupLines: [{ label: 'Rider', value: tracking.rider.name }],
                },
              ]}
              height={220}
              borderRadius={24}
              followMarkers
            />
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
              {current.estimatedMinutes} min
            </AppText>
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

      {current.rider && (
        <Animated.View
          entering={FadeInUp.delay(80).duration(300)}
          style={[
            styles.card,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <View style={styles.riderRow}>
            <Avatar size={54} name={current.rider.name} gradient={current.rider.avatarGradient} />
            <View style={styles.riderInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                {current.rider.name}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {current.rider.vehicle} · {current.rider.plateNumber} · ⭐ {current.rider.rating}
              </AppText>
            </View>
            <View style={styles.riderActions}>
              <Pressable
                onPress={() => haptics.light()}
                style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]}
              >
                <Ionicons name="call-outline" size={20} color={colors.primary} />
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
                  : paymentStatus === 'failed' || paymentStatus === 'cancelled'
                    ? colors.danger
                    : colors.warning
              }
            >
              {PAYMENT_STATUS_LABELS[paymentStatus] ?? 'Processing'}
            </AppText>
          </View>

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

          {/* An unpaid order can be retried through the same wallet rather than
              abandoned. There is deliberately no cash fallback any more. */}
          {paymentStatus === 'failed' && status !== 'cancelled' && (
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

      {!delivered && status !== 'cancelled' && cancellable && (
        <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancelBtn}>
          <AppText variant="smallMedium" weight="semiBold" color={colors.danger}>
            Cancel order
          </AppText>
        </Pressable>
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

      {delivered && (
        <Pressable onPress={() => navigation.goBack()} hitSlop={6} style={styles.cancelBtn}>
          <AppText variant="smallMedium" weight="semiBold" color={colors.textSecondary}>
            Back to home
          </AppText>
        </Pressable>
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
  onConfirm,
  onClose,
}: {
  visible: boolean
  busy: boolean
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
            How was your meal?
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
              label="Send rating"
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
  switchRow: { marginTop: spacing.xs },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  addressText: { flex: 1 },
  cancelBtn: { alignSelf: 'center', marginTop: spacing.xs, padding: spacing.s },
  doneBtn: {
    marginHorizontal: spacing.m,
    marginTop: spacing.xs,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
