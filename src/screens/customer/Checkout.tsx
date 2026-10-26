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
import { useAsyncData } from '../../hooks/useAsyncData';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

type MethodKey = CheckoutPaymentMethod;

/**
 * Official brand colours for each wallet. Used to render the gateway's own
 * identity in the payment list. Drop the press kit logo into
 * `src/assets/payments/` and swap `short` for an <Image> when you have licensed
 * artwork — the colours below keep the row on-brand until then.
 */
const BRAND: Record<'easypaisa' | 'jazzcash', { bg: string; fg: string; short: string }> = {
  easypaisa: { bg: '#3BAE49', fg: '#FFFFFF', short: 'EP' },
  jazzcash: { bg: '#EE1C25', fg: '#FFFFFF', short: 'JC' },
};

const METHODS: {
  key: MethodKey;
  label: string;
  note: string;
  /** Field name used to match the backend's `methods` availability list. */
  gateway: 'easypaisa' | 'jazzcash';
  brand: (typeof BRAND)['easypaisa'];
}[] = [
  {
    key: 'easypaisa',
    label: 'Easypaisa',
    note: 'Pay from your Easypaisa mobile account',
    gateway: 'easypaisa',
    brand: BRAND.easypaisa,
  },
  {
    key: 'jazzcash',
    label: 'JazzCash',
    note: 'Pay securely on the JazzCash page',
    gateway: 'jazzcash',
    brand: BRAND.jazzcash,
  },
];

type VerificationResult = Awaited<ReturnType<typeof paymentApi.verify>>;

/**
 * Easypaisa MA debits the wallet on the payer's own handset, so the debit can
 * legitimately still be in flight when we come back to the app — there is no
 * browser round-trip to wait on. Poll the gateway a few times before saying
 * anything. Only `paid` or `failed` ends the wait; anything else is still
 * pending and must not be reported as a success.
 */
async function verifyWithRetries(
  orderId: string,
  attempts = 4,
  delayMs = 2500,
): Promise<VerificationResult> {
  let result = await paymentApi.verify(orderId);
  for (let i = 1; i < attempts && result.status === 'pending'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await paymentApi.verify(orderId);
  }
  return result;
}

export function CheckoutScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, restaurantId, count, clear } = useCart();
  const { error, success } = useToast();
  const [placing, setPlacing] = useState(false);

  const addresses = useAsyncData(() => addressApi.getSaved(), []);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<MethodKey>('easypaisa');
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
      const meta = METHODS.find((m) => m.key === candidate);
      if (!meta) return false;
      const entry = gateways.find((g) => g.method === meta.gateway);
      // While availability is still unknown, leave the option enabled and let
      // the server be the authority on submit.
      if (!entry) return true;
      return entry.enabled;
    },
    [gateways],
  );

  /**
   * Only methods the backend reports as fully configured are offered.
   *
   * Until `/payments/methods` answers we show nothing rather than guess: a wallet
   * that turns out to be unconfigured would otherwise draw the customer through
   * the whole checkout and then fail at submit.
   */
  const availabilityLoaded = gateways.length > 0;
  const visibleMethods = availabilityLoaded ? METHODS.filter((m) => enabled(m.key)) : [];
  const noGatewayAvailable = availabilityLoaded && visibleMethods.length === 0;

  /** Why the section is empty, shown in place of the method rows. */
  const emptyMessage = noGatewayAvailable
    ? 'No payment method is available right now. Please try again later.'
    : 'Loading payment methods…';

  /**
   * Keep a valid selection as availability arrives. Adjusted during render
   * (React's "adjust state when props change" pattern) so the default never
   * stays on a wallet the server reports as unconfigured.
   */
  if (!enabled(method)) {
    const first = METHODS.find((m) => enabled(m.key));
    if (first && first.key !== method) setMethod(first.key);
  }

  const restaurant = quote?.restaurant;
  const total = quote?.total ?? 0;
  // Both integrated gateways settle against a mobile wallet account, so the
  // payer must always supply the number the debit will be taken from. Easypaisa
  // MA uses it as `mobileAccountNo`, JazzCash MPAY as the billed MSISDN.
  const needsPhone = true;
  const phoneValid = /^(\+?92|0)?3\d{9}$/.test(phone.replace(/[\s-]/g, ''));
  const canSubmit =
    Boolean(deliveryAddress) &&
    Boolean(quote) &&
    !quoteError &&
    !noGatewayAvailable &&
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

      // JazzCash is a hosted MPAY checkout, so the payer leaves the app and we
      // wait for them to come back. Easypaisa MA has no redirect at all, so
      // `handoff` is null and there is simply nothing to open.
      if (result.handoff?.url) {
        await WebBrowser.openBrowserAsync(result.handoff.url);
      }

      // Nothing above proves money moved — not the handoff, not the redirect.
      // Only the server, asking the gateway, may clear the cart. This also covers
      // Easypaisa, whose null handoff used to be mistaken for a cash order and
      // reported as placed without ever checking the wallet.
      const verification = await verifyWithRetries(orderId);

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
          {visibleMethods.length === 0 && (
            <AppText variant="small" color={colors.textMuted} style={styles.emptyMessage}>
              {emptyMessage}
            </AppText>
          )}
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
          label={quote ? `Pay · ${formatCurrency(total)}` : 'Preparing your bill…'}
          onPress={placeOrder}
          size="lg"
          loading={placing}
          disabled={!canSubmit}
        />
        <AppText variant="micro" color={colors.textMuted} center style={styles.footerNote}>
          {noGatewayAvailable
            ? 'No payment method is available right now. Please try again later.'
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
  emptyMessage: { paddingVertical: spacing.s },
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
