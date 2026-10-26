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
import { jobApi, type RiderJobOrder } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderFoodDelivery'>;

const POLL_MS = 10_000;

const BADGE: Record<string, { label: string; tone: 'danger' | 'primary' | 'success' }> = {
  rider_assigned: { label: 'Live', tone: 'danger' },
  picked_up: { label: 'Carrying', tone: 'danger' },
  on_the_way: { label: 'On the way', tone: 'danger' },
  delivered: { label: 'Done', tone: 'success' },
};

/**
 * The food-delivery leg for an order the rider accepted via the jobs pool.
 * State and permissions live on the order itself — the leg can only be
 * advanced along rider_assigned → picked_up → on_the_way → delivered.
 */
export function RiderFoodDeliveryScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, error: toastError } = useToast();
  const [order, setOrder] = useState<RiderJobOrder | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const orderRef = useRef<RiderJobOrder | null>(null);
  orderRef.current = order;

  const refresh = useCallback(async () => {
    try {
      const jobs = await jobApi.jobs();
      const next = jobs.orders.find((o) => o.id === orderId) ?? null;
      const prev = orderRef.current;
      orderRef.current = next;
      setOrder(next);
      setGone(!next);
      if (prev && next && next.status !== prev.status && next.status === 'delivered') {
        success('Delivered — payout added to your wallet');
      }
    } catch {
      // Poll failures keep the last known order visible.
      if (!orderRef.current) setGone(true);
    }
  }, [orderId, success]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!order || order.status === 'delivered') return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [order, refresh]);

  const advance = async (status: 'picked_up' | 'on_the_way' | 'delivered', message: string) => {
    if (busy) return;
    setBusy(status);
    try {
      await jobApi.updateDelivery(orderId, status);
      haptics.success();
      success(message);
      await refresh();
    } catch (err) {
      toastError(apiErrorMessage(err, 'Could not update the delivery. Refresh and try again.'));
    } finally {
      setBusy(null);
    }
  };

  const navigateTo = (dest: { lat?: number; lng?: number; label?: string }) => {
    haptics.light();
    navigation.navigate('RiderNavigation', { destination: dest });
  };

  if (gone) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Delivery" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="receipt-outline"
          title="Order not active"
          message="This order is no longer assigned to you, or it was just delivered."
          onAction={() => navigation.navigate('RiderMain')}
          actionLabel="Back to dashboard"
        />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Delivery" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <AppText variant="body" color={colors.textMuted}>
            Loading order…
          </AppText>
        </View>
      </View>
    );
  }

  const badge = BADGE[order.status] ?? { label: order.status, tone: 'danger' as const };
  const carrying = order.status === 'picked_up' || order.status === 'on_the_way';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title={order.status === 'delivered' ? 'Delivery complete' : 'Active delivery'}
        onBack={() => navigation.goBack()}
        right={
          <Badge
            label={badge.label}
            tone={badge.tone}
            icon={order.status === 'delivered' ? 'checkmark-circle' : 'radio-button-on'}
          />
        }
      />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {order.status === 'delivered' && (
          <View style={[styles.doneCard, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={30} color={colors.success} />
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              Delivered!
            </AppText>
            <AppText variant="small" color={colors.textSecondary}>
              {formatCurrency(order.payout)} added to your earnings.
            </AppText>
            <AppButton label="Done" onPress={() => navigation.navigate('RiderMain')} style={styles.doneBtn} />
          </View>
        )}

        {order.status !== 'delivered' && (
          <MapComponent pickup={{ x: 0.3, y: 0.45 }} dropoff={carrying ? { x: 0.72, y: 0.62 } : undefined} height={180} rounded={24} />
        )}

        <View
          style={[
            styles.orderCard,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <View style={styles.orderTop}>
            <View style={styles.orderEmoji}>
              <AppText variant="title" color={colors.textPrimary}>{order.restaurant.emoji ?? '🍽️'}</AppText>
            </View>
            <View style={styles.orderInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
                {order.restaurant.name}
              </AppText>
              <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                {order.orderNumber} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
              </AppText>
            </View>
            <AppText variant="title" weight="extraBold" color={colors.success}>
              {formatCurrency(order.payout)}
            </AppText>
          </View>
          {order.itemNames.length > 0 && (
            <AppText variant="small" color={colors.textSecondary} numberOfLines={2}>
              {order.itemNames.join(', ')}
            </AppText>
          )}
        </View>

        <View style={[styles.steps, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Step
            icon="storefront-outline"
            label="Pickup"
            value={order.restaurant.address || order.restaurant.name}
            active={order.status === 'rider_assigned'}
            done={order.status !== 'rider_assigned'}
          />
          <View style={[styles.stepLine, { backgroundColor: colors.borderStrong }]} />
          <Step
            icon="location-outline"
            label="Deliver to"
            value={order.dropoff}
            active={carrying}
            done={order.status === 'delivered'}
          />
        </View>

        <View style={[styles.customerCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Avatar name={order.customer.name} gradient={['#0E9488', '#0E3F3A']} size={46} />
          <View style={styles.customerInfo}>
            <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
              {order.customer.name}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Cash on delivery · {formatCurrency(order.total)}
            </AppText>
          </View>
          {order.customer.phone ? (
            <Pressable
              onPress={() => {
                haptics.light();
                Linking.openURL(`tel:${order.customer.phone}`).catch(() =>
                  toastError('Could not open the dialer.'),
                );
              }}
              style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}
              hitSlop={6}
            >
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {order.status !== 'delivered' && (
          <>
            <AppButton
              label="Start navigation"
              icon="navigate"
              size="lg"
              onPress={() =>
                navigateTo(
                  order.status === 'rider_assigned'
                    ? { label: order.restaurant.address || order.restaurant.name }
                    : {
                        lat: order.dropoffLat || undefined,
                        lng: order.dropoffLng || undefined,
                        label: order.dropoff,
                      },
                )
              }
            />

            {order.status === 'rider_assigned' && (
              <AppButton
                label="Picked up from restaurant"
                variant="secondary"
                disabled={busy === 'picked_up'}
                onPress={() => void advance('picked_up', 'Marked as picked up')}
              />
            )}

            {order.status === 'picked_up' && (
              <AppButton
                label="On the way to the customer"
                variant="secondary"
                disabled={busy === 'on_the_way'}
                onPress={() => void advance('on_the_way', 'Customer notified — on the way')}
              />
            )}

            {carrying && (
              <AppButton
                label="Mark delivered"
                icon="checkmark-done"
                size="lg"
                disabled={busy === 'delivered'}
                onPress={() => void advance('delivered', 'Delivered — payout added to your wallet')}
              />
            )}
          </>
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
            backgroundColor: done
              ? colors.successSoft
              : occupied
                ? colors.primarySoft
                : colors.surfaceMuted,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={done ? colors.success : occupied ? colors.primary : colors.textSecondary}
        />
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
  orderCard: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.xs },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderEmoji: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderInfo: { flex: 1, gap: 1 },
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
  doneCard: {
    borderRadius: 22,
    padding: spacing.l,
    alignItems: 'center',
    gap: spacing.xs,
  },
  doneBtn: { marginTop: spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
