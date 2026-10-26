import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { RatingStars } from '../../components/RatingStars';
import { FoodCard } from '../../components/FoodCard';
import { Divider } from '../../components/Divider';
import { ErrorState } from '../../components/EmptyState';
import { SkeletonRestaurantList } from '../../components/LoadingSkeleton';
import { foodApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useCart } from '../../state/CartContext';
import { useToast } from '../../state/ToastProvider';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { buildBrowseMessage } from '../../utils/whatsapp';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { WhatsAppContactDialog } from '../../components/WhatsAppContactDialog';
import { MenuItem } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'Restaurant'>;

export function RestaurantScreen({ navigation, route }: Props) {
  const { restaurantId } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const { count, restaurantId: cartRestaurantId, subtotal } = useCart();

  const restaurant = useAsyncData(() => foodApi.getRestaurant(restaurantId), [restaurantId]);
  const menu = useAsyncData(() => foodApi.getMenu(restaurantId), [restaurantId]);
  const [whatsOpen, setWhatsOpen] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const item of menu.data ?? []) {
      const key = item.category;
      (map[key] ??= []).push(item);
    }
    return map;
  }, [menu.data]);

  const cartMatches = cartRestaurantId === restaurantId && count > 0;
  const current = restaurant.data;

  const renderContent = () => {
    if (restaurant.loading && !restaurant.data) return <SkeletonRestaurantList count={3} />;
    if (restaurant.error && !restaurant.data) return <ErrorState onRetry={restaurant.refetch} />;
    if (!current) return null;

    return (
      <>
        <Hero
          name={current.name}
          cuisine={current.cuisine}
          gradient={current.gradient}
          emoji={current.emoji}
          rating={current.rating}
          reviews={current.reviews}
          deliveryTimeMin={current.deliveryTimeMin}
          deliveryFee={current.deliveryFee}
          deliveryKM={current.deliveryKM}
          freeDelivery={current.freeDelivery}
          promo={current.promo}
          onFavorite={() => {
            haptics.medium();
            success(`${current.name} added to favorites`);
          }}
        />
        {cartMatches && (
          <CartStrip
            count={count}
            subtotal={subtotal}
            onPress={() => navigation.navigate('Cart')}
          />
        )}
        {current && (
          <View style={styles.whatsappWrap}>
            <WhatsAppButton
              label="Order on WhatsApp"
              sublabel={`Chat with ${current.name} to order or ask about the menu.`}
              onPress={() => setWhatsOpen(true)}
            />
          </View>
        )}
        {Object.entries(grouped).map(([category, items], idx) => (
          <Animated.View key={category} entering={FadeInDown.delay(idx * 60).duration(300)}>
            <AppText
              variant="h4"
              weight="extraBold"
              color={colors.textPrimary}
              style={styles.catTitle}
            >
              {category}
            </AppText>
            {items.map((item) => (
              <FoodCard
                key={item.id}
                item={item}
                variant="row"
                onPress={() =>
                  navigation.navigate('FoodDetails', { item, restaurantName: current.name })
                }
              />
            ))}
            <Divider spacing={spacing.l} />
          </Animated.View>
        ))}
      </>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={[]}
        keyExtractor={() => 'r'}
        renderItem={() => null}
        // Passed as the render function rather than the call result: the
        // component may return null while loading, which is a valid element but
        // not a valid ListHeaderComponent value, and calling it inline would
        // also remount the header on every render.
        ListHeaderComponent={renderContent}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
      />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <AppHeader
          transparent
          onBack={() => navigation.goBack()}
          right={
            <Pressable
              onPress={() => {
                haptics.medium();
                success(current ? `${current.name} added to favorites` : 'Saved');
              }}
              hitSlop={8}
              style={[
                styles.fab,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <Ionicons name="heart-outline" size={20} color={colors.danger} />
            </Pressable>
          }
          containerStyle={{ backgroundColor: 'transparent' }}
        />
      </View>

      {/* Chat-to-order channel: pre-filled message, never an app order. */}
      {current && (
        <WhatsAppContactDialog
          visible={whatsOpen}
          title="Chat to order"
          message={buildBrowseMessage(current.name)}
          onClose={() => setWhatsOpen(false)}
        />
      )}
    </View>
  );
}

function CartStrip({
  count,
  subtotal,
  onPress,
}: {
  count: number;
  subtotal: number;
  onPress: () => void;
}) {
  const { colors } = useThemeColors();
  return (
    <Animated.View entering={FadeInDown.duration(320)}>
      <Pressable onPress={onPress} style={[styles.cartStrip, { backgroundColor: colors.primary }]}>
        <View style={styles.cartBadge}>
          <AppText variant="microBold" color={colors.onPrimary}>
            {count}
          </AppText>
        </View>
        <AppText
          variant="title"
          weight="bold"
          color={colors.onPrimary}
          style={styles.cartStripText}
        >
          View cart · {formatCurrency(subtotal)}
        </AppText>
        <Ionicons name="chevron-forward-circle" size={22} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

type HeroProps = {
  name: string;
  cuisine: string;
  gradient: [string, string];
  emoji: string;
  rating: number;
  reviews: number;
  deliveryTimeMin: number;
  deliveryFee: number;
  deliveryKM: number;
  freeDelivery: boolean;
  promo?: string;
  onFavorite: () => void;
};

function Hero({
  name,
  cuisine,
  gradient,
  emoji,
  rating,
  reviews,
  deliveryTimeMin,
  deliveryFee,
  deliveryKM,
  freeDelivery,
  promo,
  onFavorite,
}: HeroProps) {
  const { colors } = useThemeColors();

  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBand}
      >
        <View style={styles.heroRing} />
        <View style={styles.heroRingTwo} />
        <View style={styles.heroArtWrap}>
          <AppText style={styles.heroEmoji}>{emoji}</AppText>
        </View>
      </LinearGradient>
      <View
        style={[
          styles.heroBody,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <View style={styles.heroTitleRow}>
          <View style={styles.heroTitles}>
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary}>
              {name}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {cuisine} · {deliveryKM.toFixed(1)} km away
            </AppText>
          </View>
          <Pressable
            onPress={onFavorite}
            hitSlop={8}
            style={[styles.favBtn, { backgroundColor: colors.dangerSoft }]}
          >
            <Ionicons name="heart-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
        <RatingStars rating={rating} showValue reviews={reviews} />
        <View style={styles.metaGrid}>
          <Meta icon="time-outline" label={`${deliveryTimeMin} min`} />
          <Meta
            icon="bicycle-outline"
            label={freeDelivery ? 'Free delivery' : `Rs ${deliveryFee}`}
          />
          <Meta icon="receipt-outline" label="No contact delivery" />
        </View>
        {promo && (
          <View style={[styles.promo, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="pricetag" size={14} color={colors.primaryStrong} />
            <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>
              {promo}
            </AppText>
          </View>
        )}
      </View>
      <View style={styles.infoNote}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
        <AppText variant="small" color={colors.textMuted}>
          Delivery charges apply outside Swat City limits
        </AppText>
      </View>
    </View>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.meta, { backgroundColor: colors.surfaceMuted }]}>
      <Ionicons name={icon} size={15} color={colors.primary} />
      <AppText
        variant="smallMedium"
        weight="semiBold"
        color={colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: spacing.m },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  hero: { marginTop: spacing.m },
  whatsappWrap: { marginTop: spacing.sm },
  heroBand: {
    height: 150,
    borderRadius: 26,
    marginBottom: -40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroRingTwo: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -50,
    left: 30,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  heroArtWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 38,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  heroBody: {
    borderRadius: 22,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroTitles: { flex: 1, gap: 2 },
  favBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaGrid: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: 15,
  },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 34,
    borderRadius: 12,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  catTitle: { marginTop: spacing.xl, marginBottom: spacing.sm },
  cartStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 54,
    borderRadius: 18,
    paddingHorizontal: spacing.m,
    marginTop: spacing.m,
    alignSelf: 'stretch',
  },
  cartBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStripText: { flex: 1, marginLeft: spacing.sm },
});
