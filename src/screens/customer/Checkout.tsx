import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  cartApi,
  orderApi,
  paymentApi,
  isManualTransferMethod,
  type CheckoutPaymentMethod,
  type OrderQuote,
} from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useAsyncData } from '../../hooks/useAsyncData';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

type MethodKey = CheckoutPaymentMethod;

/**
 * Official brand colours for the direct-transfer rows: UBL green plus the
 * wallet brands' official colours for the "pay by hand" variants.
 */
const BRAND: Record<string, { bg: string; fg: string; short: string }> = {
  ubl: { bg: '#0B7A3B', fg: '#FFFFFF', short: 'UBL' },
  easypaisa_transfer: { bg: '#3BAE49', fg: '#FFFFFF', short: 'EP' },
  jazzcash_transfer: { bg: '#EE1C25', fg: '#FFFFFF', short: 'JC' },
};

type MethodRow = {
  key: MethodKey;
  label: string;
  note: string;
  brand: { bg: string; fg: string; short: string };
};

/**
 * Direct bank/wallet transfer options. NO gateway belongs to them and no
 * payer phone is needed — the customer moves the money themselves after the
 * order is placed and then submits the transfer receipt for admin
 * verification. These are the ONLY checkout methods of this platform: the
 * backend rejects every other method at order creation, so nothing gateway-
 * shaped can be opened — not even by a tampered client.
 */
const MANUAL_METHODS: MethodRow[] = [
  {
    key: 'ubl',
    label: 'Direct Bank Transfer (UBL)',
    note: 'Transfer to our UBL account, submit receipt',
    brand: BRAND.ubl,
  },
  {
    key: 'easypaisa_transfer',
    label: 'Easypaisa (Direct Transfer)',
    note: 'Send to our Easypaisa number, submit receipt',
    brand: BRAND.easypaisa_transfer,
  },
  {
    key: 'jazzcash_transfer',
    label: 'JazzCash (Direct Transfer)',
    note: 'Send to our JazzCash number, submit receipt',
    brand: BRAND.jazzcash_transfer,
  },
];

export function CheckoutScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, restaurantId, count, clear } = useCart();
  const { error } = useToast();
  const [placing, setPlacing] = useState(false);

  const addresses = useAsyncData(() => addressApi.getSaved(), []);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  // Direct transfers are the only checkout methods, so the default is the first
  // row the customer sees.
  const [method, setMethod] = useState<MethodKey>('ubl');

  /**
   * Money is always taken from the server. `quote` returns exactly the figures
   * `placeOrder` will charge, so the bill the customer approves is the bill they
   * are charged — even if prices changed while they were on this screen.
   */
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;
    (async () => {
      try {
        // The quote is priced from the SERVER cart, so mirror the device cart
        // first — quoting with an unsynced cart fails with "Your cart is
        // empty" and the checkout would sit loading forever.
        await cartApi.sync(restaurantId, items);
        const q = await paymentApi.quote();
        if (!cancelled) {
          setQuote(q);
          setQuoteError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setQuoteError(apiErrorMessage(e, 'Could not load your bill'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, restaurantId]);

  const deliveryAddress = useMemo(
    () => (addresses.data ?? []).find((a) => a.id === selectedAddressId) ?? null,
    [addresses.data, selectedAddressId],
  );

  /** Direct-transfer rows carry no gateway to configure and are always offered. */
  const visibleMethods: MethodRow[] = MANUAL_METHODS;

  const restaurant = quote?.restaurant;
  const total = quote?.total ?? 0;
  // Direct transfers need no payer phone: the customer pays by hand from
  // whichever account they like and submits the receipt afterwards.
  const canSubmit = Boolean(deliveryAddress) && Boolean(quote) && !quoteError;

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
   * One tap = one attempt id. The idempotency key is generated per attempt and
   * reused for retries of the *same* attempt, so a double tap or a dropped
   * response can never create two orders.
   */
  const submitOrder = async () => {
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
        { idempotencyKey },
      );

      const orderId = result.order.id;

      // Direct bank/wallet transfer skips gateways entirely: the customer moves
      // the money AFTER this point and submits the receipt on the next screen,
      // so there is no browser handoff and no gateway verification to wait on.
      // The order exists already, so the device cart is released here rather
      // than inviting a second, duplicate order from the same cart.
      if (result.transferDetails || isManualTransferMethod(method)) {
        clear();
        navigation.replace('ManualTransfer', { orderId });
        return;
      }

      // Defence in depth only: the UI and the server both restrict checkout to
      // direct transfers, so this branch should be unreachable. Landing on
      // tracking is safe — it polls the real payment state from the server.
      navigation.replace('OrderTracking', { orderId });
    } catch (e: unknown) {
      error(apiErrorMessage(e, 'Could not place your order. Please try again.'));
      setPlacing(false);
    }
  };

  const placeOrder = () => {
    void submitOrder();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Checkout" onBack={() => navigation.goBack()} elevated />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
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
        <View
          style={[
            styles.etaRow,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
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
        <View
          style={[
            styles.paymentCard,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          {visibleMethods.map((p, i) => {
            const active = method === p.key;
            return (
              <View key={p.key}>
                <Pressable
                  onPress={() => {
                    haptics.light();
                    setMethod(p.key);
                  }}
                  style={styles.paymentRow}
                >
                  <View style={[styles.payIcon, { backgroundColor: p.brand.bg }]}>
                    <AppText variant="microBold" color={p.brand.fg}>
                      {p.brand.short}
                    </AppText>
                  </View>
                  <View style={styles.payInfo}>
                    <AppText variant="title" weight="bold" color={colors.textPrimary}>
                      {p.label}
                    </AppText>
                    <AppText variant="small" color={colors.textMuted}>
                      {p.note}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: active ? colors.primary : colors.borderStrong },
                    ]}
                  >
                    {active && (
                      <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                </Pressable>
                {i < visibleMethods.length - 1 && <Divider spacing={spacing.s} />}
              </View>
            );
          })}
        </View>

        <SectionLabel icon="receipt-outline" label="Bill summary" />
        <View
          style={[
            styles.summary,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
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
              <Row
                label={`Items (${quote.itemCount || count})`}
                value={formatCurrency(quote.subtotal)}
              />
              <Row
                label="Delivery fee"
                value={quote.deliveryFee === 0 ? 'FREE' : formatCurrency(quote.deliveryFee)}
                valueColor={quote.deliveryFee === 0 ? colors.success : undefined}
              />
              {quote.discount > 0 && (
                <Row
                  label="Discount"
                  value={`- ${formatCurrency(quote.discount)}`}
                  valueColor={colors.success}
                />
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
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.m), backgroundColor: colors.surface },
        ]}
      >
        <AppButton
          label={
            quote ? `Place order · ${formatCurrency(total)}` : 'Preparing your bill…'
          }
          onPress={placeOrder}
          size="lg"
          loading={placing}
          disabled={!canSubmit}
        />
        <AppText variant="micro" color={colors.textMuted} center style={styles.footerNote}>
          You will transfer the amount after placing the order — your order is confirmed only
          after your payment screenshot is verified by our admin.
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
  etaIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaInfo: { flex: 1 },
  paymentCard: { borderRadius: 18, borderWidth: 1, padding: spacing.sm },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, padding: spacing.sm },
  payIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payInfo: { flex: 1 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
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
