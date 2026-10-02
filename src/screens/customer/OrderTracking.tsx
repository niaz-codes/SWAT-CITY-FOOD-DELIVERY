import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { MapComponent } from '../../components/MapComponent';
import { Avatar } from '../../components/Avatar';
import { ErrorState } from '../../components/EmptyState';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { orderApi, paymentApi, type PaymentState } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { OrderStatus } from '../../types/domain';

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
  const insets = useSafeAreaInsets();
  const { error, success } = useToast();

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Cash on delivery',
    easypaisa: 'Easypaisa',
    jazzcash: 'JazzCash',
    wallet: 'Swat City wallet',
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
   * Payment state is polled rather than inferred from the browser redirect — a
   * redirect proves nothing, only the server's gateway check does. We stop
   * polling once the payment reaches a terminal state.
   */
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const paymentStatus = paymentState?.payment?.status ?? 'pending';
  const paymentSettled = paymentStatus === 'paid' || paymentStatus === 'failed' || paymentStatus === 'cancelled';

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

  const statusInfo = useMemo(() => {
    const map: Record<OrderStatus, { text: string; sub: string }> = {
      placed: { text: 'Order placed', sub: 'Waiting for restaurant to accept' },
      confirmed: { text: 'Order confirmed', sub: 'The restaurant accepted your order' },
      preparing: { text: 'Being prepared', sub: 'Your food is being cooked fresh' },
      ready: { text: 'Ready for pickup', sub: 'A rider is on the way' },
      picked_up: { text: 'On the way', sub: 'Rider picked up your order' },
      on_the_way: { text: 'Rider in transit', sub: 'Heading to your address' },
      delivered: { text: 'Delivered', sub: 'Enjoy your meal from Swat City!' },
      cancelled: { text: 'Order cancelled', sub: 'We are sorry about that' },
    };
    return map[status];
  }, [status]);

  const handleCancel = () => {
    haptics.warning();
    success('Order cancelled');
    navigation.goBack();
  };

  if (order.loading && !order.data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Track order" onBack={() => navigation.goBack()} elevated />
        <View style={styles.center}>
          <AppText variant="body" color={colors.textMuted}>Loading your order…</AppText>
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
        <MapComponent
          pickup={{ x: 0.24, y: 0.36 }}
          dropoff={{ x: 0.74, y: 0.66 }}
          height={190}
          rounded={24}
          progress={mapProgress}
        />
        <Animated.View style={[styles.liveChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, riderBubble]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <AppText variant="microBold" color={colors.textPrimary}>LIVE</AppText>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInUp.duration(300)} style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.statusRow}>
          <View style={styles.statusText}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>{statusInfo.text}</AppText>
            <AppText variant="small" color={colors.textMuted}>{statusInfo.sub}</AppText>
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
                  <View style={[styles.stepDot, { borderColor: state === 'todo' ? colors.borderStrong : colors.primary, backgroundColor: state === 'done' ? colors.primary : state === 'active' ? colors.primarySoft : colors.surfaceMuted }]}>
                    <Ionicons name={state === 'done' ? 'checkmark' : s.icon} size={14} color={state === 'done' ? colors.onPrimary : state === 'active' ? colors.primary : colors.textMuted} />
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.stepLine, { backgroundColor: i < activeStep ? colors.primary : colors.border }]} />}
                </View>
                <AppText variant="micro" weight={state === 'active' ? 'bold' : 'semiBold'} color={state === 'todo' ? colors.textMuted : colors.textPrimary} style={styles.stepLabel}>
                  {s.label}
                </AppText>
              </View>
            );
          })}
        </View>
      </Animated.View>

      {current.rider && (
        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={styles.riderRow}>
            <Avatar size={54} name={current.rider.name} gradient={current.rider.avatarGradient} />
            <View style={styles.riderInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>{current.rider.name}</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {current.rider.vehicle} · {current.rider.plateNumber} · ⭐ {current.rider.rating}
              </AppText>
            </View>
            <View style={styles.riderActions}>
              <Pressable onPress={() => haptics.light()} style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]}>
                <Ionicons name="call-outline" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      <Animated.View entering={FadeInUp.delay(140).duration(300)} style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.summaryRow}>
          <AppText variant="small" color={colors.textMuted}>{current.items.length} items</AppText>
          <AppText variant="title" weight="extraBold" color={colors.textPrimary}>{formatCurrency(current.total)}</AppText>
        </View>
        <Pressable onPress={() => navigation.goBack()} hitSlop={6} style={styles.addressRow}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <AppText variant="small" color={colors.textSecondary} numberOfLines={1} style={styles.addressText}>
            {current.address}
          </AppText>
        </Pressable>
      </Animated.View>

      {paymentState && (
        <Animated.View entering={FadeInUp.delay(180).duration(300)} style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
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

          {/* An online payment that never completed still lets the customer pay
              in cash rather than lose the order. */}
          {paymentStatus !== 'paid' && status !== 'cancelled' && (
            <Pressable
              onPress={async () => {
                try {
                  await paymentApi.switchToCash(orderId);
                  setPaymentState(await paymentApi.status(orderId));
                  success('Switched to cash on delivery');
                } catch {
                  error('Could not switch to cash. Please contact support.');
                }
              }}
              hitSlop={6}
              style={styles.switchRow}
            >
              <AppText variant="micro" color={colors.primary} weight="semiBold">
                Switch to cash on delivery
              </AppText>
            </Pressable>
          )}
        </Animated.View>
      )}

      {!delivered && status !== 'cancelled' && (
        <Pressable
          onPress={handleCancel}
          hitSlop={8}
          style={styles.cancelBtn}
        >
          <AppText variant="smallMedium" weight="semiBold" color={colors.danger}>
            Cancel order
          </AppText>
        </Pressable>
      )}

      {delivered && (
        <Pressable onPress={() => navigation.goBack()} style={[styles.doneBtn, { backgroundColor: colors.primary }]}>
          <AppText variant="title" weight="bold" color={colors.onPrimary}>Back to home</AppText>
        </Pressable>
      )}
    </View>
  );
}

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
  card: { borderRadius: 20, borderWidth: 1, marginHorizontal: spacing.m, marginBottom: spacing.sm, padding: spacing.m },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1, gap: 2 },
  etaChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, height: 32, borderRadius: 16 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.l },
  step: { width: '23%' },
  stepHead: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepLine: { flex: 1, height: 2, marginHorizontal: spacing.xs },
  stepLabel: { marginTop: spacing.xs, textAlign: 'center' },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  riderInfo: { flex: 1 },
  riderActions: { flexDirection: 'row' },
  actionBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payMethodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  refText: { marginTop: spacing.xs },
  switchRow: { marginTop: spacing.xs },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  addressText: { flex: 1 },
  cancelBtn: { alignSelf: 'center', marginTop: spacing.xs, padding: spacing.s },
  doneBtn: { marginHorizontal: spacing.m, marginTop: spacing.xs, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});