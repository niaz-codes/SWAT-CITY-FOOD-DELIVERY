import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppInput } from '../../components/AppInput';
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
import { RESTAURANTS } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

const DELIVERY_FEE = 60;
const EXTRA_DISTANCE_FEE = 40;
const FREE_DELIVERY_THRESHOLD = 800;

export function CartScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, restaurantId, count, subtotal, setQuantity, remove } = useCart();
  const { success } = useToast();
  const [promo, setPromo] = useState('');

  const restaurant = RESTAURANTS.find((r) => r.id === restaurantId);

  const applied = promo.trim().toUpperCase();
  const isFreeDelivery = applied === 'SWAT30' || subtotal >= FREE_DELIVERY_THRESHOLD;
  const deliveryFee = restaurant?.freeDelivery || isFreeDelivery ? 0 : subtotal < 500 ? DELIVERY_FEE + EXTRA_DISTANCE_FEE : DELIVERY_FEE;
  const discount = applied === 'SWAT10' ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + deliveryFee - discount;

  const savings = useMemo(
    () => (restaurant?.freeDelivery ? deliveryFee : 0) + discount,
    [restaurant?.freeDelivery, deliveryFee, discount],
  );

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
          <View key={ci.menuItem.id} style={[styles.itemCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <ArtTile gradient={ci.menuItem.gradient} emoji={ci.menuItem.emoji} size={58} rounded={14} />
            <View style={styles.itemInfo}>
              <View style={styles.itemTitleRow}>
                <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1} style={styles.itemName}>
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
                <QuantityStepper quantity={ci.quantity} onChange={(q) => setQuantity(ci.menuItem.id, q)} size="sm" />
                <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
                  {formatCurrency(ci.menuItem.price * ci.quantity)}
                </AppText>
              </View>
            </View>
          </View>
        ))}

        <View style={[styles.promoCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <AppText variant="title" weight="bold" color={colors.textPrimary}>
            Promo code
          </AppText>
          <View style={styles.promoRow}>
            <View style={styles.promoInput}>
              <AppInput
                value={promo}
                onChangeText={setPromo}
                placeholder="SWAT10, SWAT30…"
                autoCapitalize="characters"
                containerStyle={styles.promoField}
              />
            </View>
            <Pressable
              onPress={() => {
                haptics.medium();
                if (applied === 'SWAT10' || applied === 'SWAT30') success(`Code ${applied} applied`);
                else success('Promo added');
              }}
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            >
              <AppText variant="smallMedium" weight="bold" color={colors.onPrimary}>
                Apply
              </AppText>
            </Pressable>
          </View>
        </View>

        <View style={[styles.summary, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <SummaryRow label={`Items (${count})`} value={formatCurrency(subtotal)} />
          <SummaryRow
            label="Delivery fee"
            value={deliveryFee === 0 ? 'FREE' : formatCurrency(deliveryFee)}
            valueColor={deliveryFee === 0 ? colors.success : undefined}
          />
          {discount > 0 && <SummaryRow label="Discount" value={`- ${formatCurrency(discount)}`} valueColor={colors.success} />}
          <Divider spacing={spacing.sm} />
          <View style={styles.totalRow}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              Total
            </AppText>
            <AppText variant="h4" weight="extraBold" color={colors.primary}>
              {formatCurrency(total)}
            </AppText>
          </View>
          {savings > 0 && (
            <AppText variant="small" color={colors.success} center>
              You saved {formatCurrency(savings)} 🎉
            </AppText>
          )}
        </View>
      </View>

      <Animated.View
        entering={FadeInDown.duration(280)}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.m), backgroundColor: colors.surface }]}
      >
        <Pressable
          onPress={() => {
            haptics.medium();
            navigation.navigate('Checkout');
          }}
          style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
        >
          <AppText variant="title" weight="extraBold" color={colors.onPrimary}>
            Checkout · {formatCurrency(total)}
          </AppText>
          <Ionicons name="arrow-forward" size={20} color={colors.onPrimary} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
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
  kitchenStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: spacing.m, marginBottom: spacing.xs },
  kitchenCta: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemCard: { flexDirection: 'row', gap: spacing.m, padding: spacing.sm, borderRadius: 18, borderWidth: 1 },
  itemInfo: { flex: 1, gap: 2 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  itemName: { flex: 1 },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  promoCard: { borderRadius: 18, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  promoInput: { flex: 1 },
  promoField: { marginBottom: 0 },
  applyBtn: { height: 44, paddingHorizontal: spacing.m, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summary: { borderRadius: 18, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.sm,
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