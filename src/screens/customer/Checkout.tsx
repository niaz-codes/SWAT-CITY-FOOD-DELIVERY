import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AddressCard } from '../../components/AddressCard';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { useCart } from '../../state/CartContext';
import { useToast } from '../../state/ToastProvider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import {
  addressApi,
  orderApi,
  paymentApi,
  type CheckoutPaymentMethod,
  type GatewayMethodInfo,
  type OrderQuote,
} from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { Address } from '../../types/domain';
import { useAsyncData } from '../../hooks/useAsyncData';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

type MethodKey = CheckoutPaymentMethod;

const METHODS: Array<{
  key: MethodKey;
  label: string;
  note: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Field name used to match the backend's `methods` availability list. */
  gateway: 'easypaisa' | 'jazzcash' | null;
}> = [
  { key: 'cash', label: 'Cash on delivery', note: 'Pay the rider at your door', icon: 'cash-outline', gateway: null },
  {
    key: 'easypaisa',
    label: 'Easypaisa',
    note: 'Pay from your Easypaisa mobile account',
    icon: 'phone-portrait-outline',
    gateway: 'easypaisa',
  },
  {
    key: 'jazzcash',
    label: 'JazzCash',
    note: 'Pay securely on the JazzCash page',
    icon: 'flash-outline',
    gateway: 'jazzcash',
  },
];

export function CheckoutScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, restaurantId, count, clear } = useCart();
  const { error, success } = useToast();
  const [placing, setPlacing] = useState(false);

  const addresses = useAsyncData(() => addressApi.getSaved(), []);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<MethodKey>('cash');
  const [phone, setPhone] = useState('');

  /**
   * Money is always taken from the server. `quote` returns exactly the figures
   * `placeOrder` will charge, so the bill the customer approves is the bill they
   * are charged — even if prices changed while they were on this screen.
   */
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [gateways, setGateways] = useState<GatewayMethodInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;
    paymentApi
      .quote()
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setQuoteError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setQuoteError(apiErrorMessage(e, 'Could not load your bill'));
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    paymentApi
      .methods()
      .then((list) => !cancelled && setGateways(list))
      .catch(() => {
        // Availability is advisory here; the server still enforces it. If the list
        // cannot load we simply do not disable anything ourselves.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deliveryAddress = useMemo(
    () => (addresses.data ?? []).find((a) => a.id === selectedAddressId) ?? null,
    [addresses.data, selectedAddressId],
  );

  const enabled = useCallback(
    (candidate: MethodKey) => {
      if (candidate === 'cash') return true;
      const meta = METHODS.find((m) => m.key === candidate);
      if (!meta?.gateway) return true;
      const entry = gateways.find((g) => g.method === meta.gateway);
      // While availability is unknown, leave the option enabled and let the
      // server be the authority.
      if (!entry) return true;
      return entry.enabled;
    },
    [gateways],
  );

  const unavailableReason = useCallback(
    (candidate: MethodKey) => {
      const meta = METHODS.find((m) => m.key === candidate);
      if (!meta?.gateway) return undefined;
      return gateways.find((g) => g.method === meta.gateway && !g.enabled)?.reason;
    },
    [gateways],
  );

  const restaurant = quote?.restaurant;
  const total = quote?.total ?? 0;
  const needsPhone = method === 'easypaisa';
  const phoneValid = /^(\+?92|0)?3\d{9}$/.test(phone.replace(/[\s-]/g, ''));
  const canSubmit =
    Boolean(deliveryAddress) &&
    Boolean(quote) &&
    !quoteError &&
    enabled(method) &&
    (!needsPhone || phoneValid);

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Checkout" onBack={() => navigation.goBack()} elevated />
        <EmptyState
          icon="receipt-outline"
          title="Nothing to checkout"
          message="Your cart is empty."
          actionLabel="Back to menu"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  /**
   * One tap = one charge. The idempotency key is generated per attempt and reused
   * for retries of the *same* attempt, so a double tap or a dropped response can
   * never create two payments.
   */
  const placeOrder = async () => {
    if (!deliveryAddress || !canSubmit) return;
    haptics.medium();
    setPlacing(true);

    const idempotencyKey = `checkout-${restaurantId ?? 'cart'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const result = await orderApi.placeOrder(
        items,
        deliveryAddress,
        total,
        quote?.deliveryFee ?? 0,
        0,
        method,
        {
          customerPhone: needsPhone ? phone.replace(/[\s-]/g, '') : undefined,
          idempotencyKey,
        },
      );

      const orderId = result.order.id;

      // Cash on delivery needs no gateway round-trip.
      if (!result.handoff) {
        clear();
        success('Order placed');
        navigation.replace('OrderTracking', { orderId });
        return;
      }

      // Online wallet: hand the payer to the gateway in a browser session.
      // `redirect` goes straight to the gateway; `form` is our own page that
      // auto-submits the signed POST on the gateway's behalf.
      await WebBrowser.openBrowserAsync(result.handoff.url);

      // The gateway redirect comes back through the app; verification below is
      // the authoritative check, so the order is only cleared once money moved.
      const verification = await paymentApi.verify(orderId);

      if (verification.status === 'paid') {
        clear();
        success('Payment successful');
      } else if (verification.status === 'failed') {
        error(verification.reason ?? 'Payment failed. Your order was not charged.');
      } else {
        error('Payment is still processing. We will confirm shortly.');
      }

      navigation.replace('OrderTracking', { orderId });
    } catch (e: unknown) {
      error(apiErrorMessage(e, 'Could not place your order. Please try again.'));
      setPlacing(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Checkout" onBack={() => navigation.goBack()} elevated />

      <ScrollView style={styles.flex} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <SectionLabel icon="location-outline" label="Deliver to" />
        {addresses.loading ? (
          <AppText variant="body" color={colors.textMuted}>
            Loading saved addresses…
          </AppText>
        ) : (
          (addresses.data ?? []).map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              selected={selectedAddressId === a.id}
              onPress={() => setSelectedAddressId(a.id)}
            />
          ))
        )}

        <SectionLabel icon="time-outline" label="Delivery now" />
        <View style={[styles.etaRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={[styles.etaIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="bicycle" size={22} color={colors.primary} />
          </View>
          <View style={styles.etaInfo}>
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              {restaurant?.name ?? 'Your order'}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {quote ? `${quote.estimatedMinutes} min · Standard delivery` : 'Calculating…'}
            </AppText>
          </View>
        </View>

        <SectionLabel icon="wallet-outline" label="Payment method" />
        <View style={[styles.paymentCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {METHODS.map((p, i) => {
            const active = method === p.key;
            const isEnabled = enabled(p.key);
            const reason = unavailableReason(p.key);
            return (
              <View key={p.key}>
                <Pressable
                  disabled={!isEnabled}
                  onPress={() => {
                    haptics.light();
                    setMethod(p.key);
                  }}
                  style={[styles.paymentRow, !isEnabled && styles.paymentRowDisabled]}
                >
                  <View
                    style={[styles.payIcon, { backgroundColor: active ? colors.primarySoft : colors.surfaceMuted }]}
                  >
                    <Ionicons
                      name={p.icon}
                      size={20}
                      color={active ? colors.primary : isEnabled ? colors.textSecondary : colors.textMuted}
                    />
                  </View>
                  <View style={styles.payInfo}>
                    <AppText variant="title" weight="bold" color={isEnabled ? colors.textPrimary : colors.textMuted}>
                      {p.label}
                    </AppText>
                    <AppText variant="small" color={colors.textMuted}>
                      {isEnabled ? p.note : (reason ?? 'Unavailable right now')}
                    </AppText>
                  </View>
                  <View style={[styles.radio, { borderColor: active ? colors.primary : colors.borderStrong }]}>
                    {active && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                </Pressable>
                {i < METHODS.length - 1 && <Divider spacing={spacing.s} />}
              </View>
            );
          })}
        </View>

        {needsPhone && (
          <Animated.View entering={FadeInUp.duration(220)} style={styles.phoneBlock}>
            <AppText variant="captionBold" color={colors.textPrimary}>
              Easypaisa mobile number
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              We debit the amount from this Easypaisa account. 03XX XXXXXXX
            </AppText>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="0300 1234567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              style={[
                styles.phoneInput,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: phone.length > 0 && !phoneValid ? colors.danger : colors.border,
                  color: colors.textPrimary,
                },
              ]}
            />
            {phone.length > 0 && !phoneValid && (
              <AppText variant="micro" color={colors.danger}>
                Enter a valid 11-digit Pakistani mobile number
              </AppText>
            )}
          </Animated.View>
        )}

        <SectionLabel icon="receipt-outline" label="Bill summary" />
        <View style={[styles.summary, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {quoteError ? (
            <AppText variant="small" color={colors.danger}>
              {quoteError}
            </AppText>
          ) : !quote ? (
            <AppText variant="small" color={colors.textMuted}>
              Calculating your total…
            </AppText>
          ) : (
            <>
              <Row label={`Items (${quote.itemCount || count})`} value={formatCurrency(quote.subtotal)} />
              <Row
                label="Delivery fee"
                value={quote.deliveryFee === 0 ? 'FREE' : formatCurrency(quote.deliveryFee)}
                valueColor={quote.deliveryFee === 0 ? colors.success : undefined}
              />
              {quote.discount > 0 && (
                <Row label="Discount" value={`- ${formatCurrency(quote.discount)}`} valueColor={colors.success} />
              )}
              <Row label="Service fee" value={formatCurrency(quote.platformFee)} />
              <Divider spacing={spacing.sm} />
              <View style={styles.total}>
                <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
                  To pay
                </AppText>
                <AppText variant="h4" weight="extraBold" color={colors.primary}>
                  {formatCurrency(total)}
                </AppText>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <Animated.View
        entering={FadeInUp.duration(280)}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.m), backgroundColor: colors.surface }]}
      >
        <AppButton
          label={
            quote
              ? `${method === 'cash' ? 'Place order' : 'Pay'} · ${formatCurrency(total)}`
              : 'Preparing your bill…'
          }
          onPress={placeOrder}
          size="lg"
          loading={placing}
          disabled={!canSubmit}
        />
        <AppText variant="micro" color={colors.textMuted} center style={styles.footerNote}>
          {method === 'cash'
            ? 'Pay in cash when your order arrives. By placing this order you agree to Swat City’s delivery terms.'
            : 'You will be taken to the payment page. Your order is confirmed once payment succeeds.'}
        </AppText>
      </Animated.View>
    </View>
  );
}

function SectionLabel({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.sectionLabel}>
      <Ionicons name={icon} size={15} color={colors.primary} />
      <AppText variant="captionBold" color={colors.textPrimary} uppercase>
        {label}
      </AppText>
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.row}>
      <AppText variant="body" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" weight="semiBold" color={valueColor ?? colors.textPrimary}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  body: { padding: spacing.m, paddingBottom: spacing.xxl },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.l,
    marginBottom: spacing.sm,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.m,
  },
  etaIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  etaInfo: { flex: 1 },
  paymentCard: { borderRadius: 18, borderWidth: 1, padding: spacing.sm },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, padding: spacing.sm },
  paymentRowDisabled: { opacity: 0.55 },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payInfo: { flex: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  phoneBlock: { marginTop: spacing.m, gap: spacing.xs },
  phoneInput: {
    marginTop: spacing.xs,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  summary: { borderRadius: 18, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  footerNote: { marginTop: spacing.sm },
});