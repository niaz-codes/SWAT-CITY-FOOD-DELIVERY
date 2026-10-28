import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { ArtTile } from '../../components/ArtTile';
import { QuantityStepper } from '../../components/QuantityStepper';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { useCart } from '../../state/CartContext';
import { useToast } from '../../state/ToastProvider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { foodApi } from '../../services/api';
import { buildCartMessage } from '../../utils/whatsapp';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { WhatsAppContactDialog } from '../../components/WhatsAppContactDialog';
import { Restaurant } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

export function CartScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, restaurantId, count, subtotal, setQuantity, remove } = useCart();
  const { success } = useToast();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  // Clear the stale restaurant while the new one loads, adjusted during
  // render (React's "adjust state when props change" pattern).
  const [prevRestaurantId, setPrevRestaurantId] = useState(restaurantId);
  if (restaurantId !== prevRestaurantId) {
    setPrevRestaurantId(restaurantId);
    setRestaurant(null);
  }

  React.useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    foodApi
      .getRestaurant(restaurantId)
      .then((r) => {
        if (active) setRestaurant(r);
      })
      .catch(() => {
        if (active) setRestaurant(null);
      });
    return () => {
      active = false;
    };
  }, [restaurantId]);

  // The restaurant record is the price authority for the leg the cart only
  // previews: its own delivery fee and free-delivery flag. Totals are
  // recalculated server-side at checkout, so nothing here can be gamed.
  const deliveryFee = restaurant?.freeDelivery ? 0 : Number(restaurant?.deliveryFee ?? 0);
  const total = subtotal + deliveryFee;
  const minOrder = Number(restaurant?.minOrder ?? 0);
  const belowMin = minOrder > 0 && subtotal < minOrder;
  const shortBy = Math.max(0, minOrder - subtotal);
  // The chat channel carries the same basket the checkout would, so the
  // restaurant reads one identical summary either way.
  const [whatsOpen, setWhatsOpen] = useState(false);
  const whatsMessage = buildCartMessage({
    restaurantName: restaurant?.name ?? 'the restaurant',
    items: items.map((ci) => ({
      name: ci.menuItem.name,
      quantity: ci.quantity,
      unitPrice: ci.menuItem.price,
    })),
    subtotal,
    deliveryFee,
    total,
  });

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="My Cart" onBack={() => navigation.goBack()} elevated />
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          message="Hungry? Add some delicious Swat food first."
          actionLabel="Browse restaurants"
          onAction={() => navigation.navigate('Main')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="My Cart" onBack={() => navigation.goBack()} elevated />

      <View style={styles.body}>
        {restaurant && (
          <View style={[styles.kitchenStrip, { backgroundColor: colors.primarySoft }]}>
            <View>
              <AppText variant="small" color={colors.primaryStrong}>
                ORDERING FROM
              </AppText>
              <AppText variant="title" weight="extraBold" color={colors.primaryStrong}>
                {restaurant.name}
              </AppText>
            </View>
            <Pressable
              onPress={() => {
                haptics.light();
                navigation.navigate('Restaurant', { restaurantId: restaurant.id });
              }}
              hitSlop={8}
              style={[styles.kitchenCta, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add" size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        )}

        {items.map((ci) => (
          <View
            key={ci.menuItem.id}
            style={[
              styles.itemCard,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <ArtTile
              gradient={ci.menuItem.gradient}
              emoji={ci.menuItem.emoji}
              size={58}
              rounded={14}
              imageUrl={ci.menuItem.imageUrl}
            />
            <View style={styles.itemInfo}>
              <View style={styles.itemTitleRow}>
                <AppText
                  variant="title"
                  weight="bold"
                  color={colors.textPrimary}
                  numberOfLines={1}
                  style={styles.itemName}
                >
                  {ci.menuItem.name}
                </AppText>
                <Pressable
                  onPress={() => {
                    haptics.light();
                    remove(ci.menuItem.id);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                </Pressable>
              </View>
              <AppText variant="small" color={colors.textMuted}>
                {ci.menuItem.category}
              </AppText>
              <View style={styles.itemBottom}>
                <QuantityStepper
                  quantity={ci.quantity}
                  onChange={(q) => setQuantity(ci.menuItem.id, q)}
                  size="sm"
                />
                <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
                  {formatCurrency(ci.menuItem.price * ci.quantity)}
                </AppText>
              </View>
            </View>
          </View>
        ))}

        <View
          style={[
            styles.promoNote,
            { backgroundColor: colors.rideSoft },
          ]}
        >
          <Ionicons name="pricetag-outline" size={16} color={colors.ride} />
          <AppText variant="small" color={colors.ride}>
            Have a promo code? It is validated and applied on checkout, where the server prices your
            order — the total shown here is a preview, not the final charge.
          </AppText>
        </View>

        <View
          style={[
            styles.summary,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <SummaryRow label={`Items (${count})`} value={formatCurrency(subtotal)} />
          <SummaryRow
            label="Delivery fee"
            value={deliveryFee === 0 ? 'FREE' : formatCurrency(deliveryFee)}
            valueColor={deliveryFee === 0 ? colors.success : undefined}
          />
          {restaurant?.freeDelivery && (
            <SummaryRow label="Free delivery program" value="Active" valueColor={colors.success} />
          )}
          <Divider spacing={spacing.sm} />
          <View style={styles.totalRow}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              Total
            </AppText>
            <AppText variant="h4" weight="extraBold" color={colors.primary}>
              {formatCurrency(total)}
            </AppText>
          </View>
          {belowMin && (
            <AppText variant="small" color={colors.danger} center>
              {restaurant?.name ?? 'This kitchen'} requires a minimum order of{' '}
              {formatCurrency(minOrder)} — add {formatCurrency(shortBy)} more.
            </AppText>
          )}
        </View>
      </View>

      <Animated.View
        entering={FadeInDown.duration(280)}
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.m), backgroundColor: colors.surface },
        ]}
      >
        <Pressable
          onPress={() => {
            haptics.medium();
            navigation.navigate('Checkout');
          }}
          disabled={!restaurant || belowMin}
          style={[
            styles.checkoutBtn,
            { backgroundColor: !restaurant || belowMin ? colors.borderStrong : colors.primary },
          ]}
        >
          <AppText variant="title" weight="extraBold" color={colors.onPrimary}>
            {belowMin
              ? `Minimum order ${formatCurrency(minOrder)}`
              : `Checkout · ${formatCurrency(total)}`}
          </AppText>
          {!belowMin && <Ionicons name="arrow-forward" size={20} color={colors.onPrimary} />}
        </Pressable>

        {/* Chat-to-order channel: same basket over WhatsApp, nothing charged. */}
        <WhatsAppButton
          variant="ghost"
          label="Order via WhatsApp"
          sublabel={`Chat the full basket to ${restaurant?.name ?? 'the restaurant'}`}
          onPress={() => setWhatsOpen(true)}
        />
      </Animated.View>

      <WhatsAppContactDialog
        visible={whatsOpen}
        title="Order this basket on WhatsApp"
        message={whatsMessage}
        onClose={() => setWhatsOpen(false)}
      />
    </View>
  );
}

function SummaryRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.summaryRow}>
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
  body: { flex: 1, paddingHorizontal: spacing.m, gap: spacing.sm },
  kitchenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: spacing.m,
    marginBottom: spacing.xs,
  },
  kitchenCta: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCard: {
    flexDirection: 'row',
    gap: spacing.m,
    padding: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
  },
  itemInfo: { flex: 1, gap: 2 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  itemName: { flex: 1 },
  itemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  promoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: 16,
    padding: spacing.m,
  },
  summary: { borderRadius: 18, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  checkoutBtn: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
  },
});
