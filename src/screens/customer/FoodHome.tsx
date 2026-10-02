import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { RestaurantCard } from '../../components/RestaurantCard';
import { FoodCard } from '../../components/FoodCard';
import { Chip } from '../../components/Chip';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonBanner, SkeletonRestaurantList, SkeletonFoodGrid } from '../../components/LoadingSkeleton';
import { ErrorState, EmptyState } from '../../components/EmptyState';
import { foodApi, CATEGORIES } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { useCart } from '../../state/CartContext';
import { formatCurrency } from '../../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FoodHomeScreen() {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { count, subtotal } = useCart();

  const [category, setCategory] = useState('All');

  const restaurants = useAsyncData(() => foodApi.getRestaurants(), []);
  const featured = useAsyncData(() => foodApi.getFeaturedRestaurants(), []);
  const popular = useAsyncData(() => foodApi.getPopular(), []);

  const filtered = useMemo(() => {
    const all = restaurants.data ?? [];
    if (category === 'All') return all;
    return all.filter((r) => r.category === category);
  }, [restaurants.data, category]);

  const renderSections = () =>
    restaurants.loading && restaurants.data == null ? (
      <>
        <SkeletonBanner />
        <SkeletonRestaurantList count={3} />
        <View style={styles.gridSkeleton}>
          <SkeletonFoodGrid count={4} />
        </View>
      </>
    ) : restaurants.error && !restaurants.data ? (
      <ErrorState onRetry={restaurants.refetch} />
    ) : (
      <>
        <Banner onPress={() => navigation.navigate('FoodSearch')} />
        <SectionHeader title="Popular right now" subtitle="Loved across Mingora" actionLabel="See all" />
        <View style={styles.popularWrap}>
          {popular.data && popular.data.slice(0, 4).map((item) => (
            <FoodCard
              key={item.id}
              item={item}
              variant="grid"
              onPress={() => navigation.navigate('FoodDetails', { item, restaurantName: 'Top picks' })}
            />
          ))}
        </View>
        <SectionHeader title="Featured restaurants" actionLabel="Explore" onAction={() => {}} />
        <FlatList
          horizontal
          data={featured.data ?? []}
          keyExtractor={(r) => r.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => (
            <RestaurantCard restaurant={item} variant="featured" onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} />
          )}
        />
        <CategoryRow active={category} onChange={setCategory} />
        <SectionHeader title={category === 'All' ? 'All restaurants' : category} />
        {filtered.length === 0 ? (
          <EmptyState icon="restaurant-outline" title="Nothing in this category yet" compact message="Try another category from the row above." />
        ) : (
          filtered.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} variant="row" onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} />
          ))
        )}
      </>
    );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={[]}
        ListHeaderComponent={renderSections}
        renderItem={() => null}
        keyExtractor={() => 'h'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl onRefresh={restaurants.onRefresh} refreshing={restaurants.refreshing} />}
        ListHeaderComponentStyle={styles.headerWrap}
      />
      <View
        style={[
          styles.top,
          { backgroundColor: colors.background, paddingTop: insets.top + spacing.s },
        ]}
      >
        <Header navigation={navigation} />
        <SearchPill onPress={() => navigation.navigate('FoodSearch')} />
      </View>
      {count > 0 && <CartBar count={count} subtotal={subtotal} onPress={() => navigation.navigate('Cart')} />}
    </View>
  );
}

function Header({ navigation }: { navigation: Nav }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.headerRow}>
      <View style={styles.identity}>
        <AppText variant="caption" color={colors.textMuted}>
          Assalam o Alaikum
        </AppText>
        <AppText variant="h3" weight="extraBold" color={colors.textPrimary}>
          Ahmad Khan
        </AppText>
      </View>
      <View style={styles.iconRow}>
        <HeaderIcon name="heart-outline" onPress={() => navigation.navigate('Favorites')} />
        <HeaderIcon name="notifications-outline" onPress={() => navigation.navigate('Notifications')} badge={2} />
      </View>
    </View>
  );
}

function HeaderIcon({ name, onPress, badge }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void; badge?: number }) {
  const { colors } = useThemeColors();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.headerIcon, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Ionicons name={name} size={21} color={colors.textPrimary} />
      {badge != null && badge > 0 && (
        <View style={[styles.headerBadge, { backgroundColor: colors.danger }]}>
          <AppText variant="microBold" color="#FFFFFF" style={styles.badgeText}>
            {badge}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

function SearchPill({ onPress }: { onPress: () => void }) {
  const { colors } = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.searchPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <AppText variant="body" color={colors.textMuted} style={styles.searchText}>
        Search for dishes, kitchens…
      </AppText>
      <View style={styles.searchTag}>
        <AppText variant="micro" color={colors.primary}>
          Voucher
        </AppText>
      </View>
    </Pressable>
  );
}

function Banner({ onPress }: { onPress: () => void }) {
  const { colors } = useThemeColors();
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={['#0E9488', '#0B6B63', '#0E3F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <View style={[styles.bannerCircle, styles.bannerCircleA]} />
        <View style={[styles.bannerCircle, styles.bannerCircleB]} />
        <View style={styles.bannerBody}>
          <AppText variant="captionBold" color="rgba(255,255,255,0.85)" uppercase>
            First order offer
          </AppText>
          <AppText variant="h3" weight="extraBold" color="#FFFFFF">
            30% OFF
          </AppText>
          <AppText variant="small" color="rgba(255,255,255,0.9)" numberOfLines={1}>
            Code <AppText variant="smallMedium" weight="bold" color="#FFFFFF">SWAT30</AppText> · Min Rs 400 order
          </AppText>
        </View>
        <View style={styles.bannerArt}>
          <AppText variant="h1" weight="extraBold" color="#FFFFFF">
            %
          </AppText>
        </View>
        <View style={[styles.bannerCta, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function CategoryRow({ active, onChange }: { active: string; onChange: (c: string) => void }) {
  return (
    <View style={styles.catRow}>
      {CATEGORIES.map((c) => (
        <Chip key={c} label={c} selected={active === c} onPress={() => onChange(c)} />
      ))}
    </View>
  );
}

function CartBar({ count, subtotal, onPress }: { count: number; subtotal: number; onPress: () => void }) {
  const { colors } = useThemeColors();
  return (
    <Animated.View entering={FadeInUp.duration(320)} style={[styles.cartBar, { paddingBottom: 8 }]}>
      <Pressable onPress={onPress} style={[styles.cartBarBtn, { backgroundColor: colors.primary }]}>
        <View style={styles.cartIcon}>
          <Ionicons name="cart" size={20} color="#FFFFFF" />
          <View style={[styles.cartDot, { backgroundColor: colors.danger }]}>
            <AppText variant="microBold" color="#FFFFFF" style={styles.badgeText}>
              {count}
            </AppText>
          </View>
        </View>
        <AppText variant="title" weight="bold" color="#FFFFFF" style={styles.cartText}>
          View cart · {formatCurrency(subtotal)}
        </AppText>
        <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.9)" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.m,
    gap: spacing.sm,
    zIndex: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { gap: 2 },
  iconRow: { flexDirection: 'row', gap: spacing.sm },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: 3,
  },
  badgeText: { includeFontPadding: false },
  searchPill: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    gap: spacing.sm,
  },
  searchText: { flex: 1 },
  searchTag: {
    backgroundColor: 'rgba(14,148,136,0.12)',
    paddingHorizontal: spacing.s,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingTop: 150 },
  headerWrap: { paddingHorizontal: spacing.m },
  banner: {
    borderRadius: radius.xl,
    padding: spacing.l,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
    gap: spacing.m,
    minHeight: 132,
  },
  bannerCircle: { position: 'absolute', borderRadius: 999 },
  bannerCircleA: { width: 180, height: 180, top: -70, right: -40, backgroundColor: 'rgba(255,255,255,0.08)' },
  bannerCircleB: { width: 90, height: 90, bottom: -40, left: 120, backgroundColor: 'rgba(255,255,255,0.07)' },
  bannerBody: { flex: 1, gap: 2 },
  bannerArt: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCta: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  catRow: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.m, flexWrap: 'wrap' },
  carousel: { paddingRight: spacing.m, paddingBottom: spacing.s },
  popularWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridSkeleton: { marginTop: spacing.s },
  cartBar: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    bottom: 6,
    zIndex: 20,
  },
  cartBarBtn: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  cartIcon: { position: 'relative', flexDirection: 'row' },
  cartDot: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartText: { flex: 1, marginLeft: spacing.m },
});