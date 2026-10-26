import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppHeader } from '../../components/AppHeader';
import { AppText } from '../../components/AppText';
import { RestaurantCard } from '../../components/RestaurantCard';
import { FoodCard } from '../../components/FoodCard';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { SearchBar } from '../../components/SearchBar';
import { foodApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { SkeletonRestaurantList } from '../../components/LoadingSkeleton';
import { Restaurant, MenuItem } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'FoodSearch'>;

type SortKey = 'relevance' | 'rating' | 'fastest' | 'cheapest';

const SORTS: { key: SortKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'relevance', label: 'Relevance', icon: 'sparkles-outline' },
  { key: 'rating', label: 'Top rated', icon: 'star-outline' },
  { key: 'fastest', label: 'Fastest', icon: 'flash-outline' },
  { key: 'cheapest', label: 'Cheapest', icon: 'pricetag-outline' },
];

/**
 * Sorts the result lists client-side. The search endpoint returns matches in
 * relevance order only, so every other order is applied here over the same
 * response — switching sorts never costs another round-trip.
 */
function sortResults(
  results: { restaurants: Restaurant[]; dishes: MenuItem[] },
  sort: SortKey,
): { restaurants: Restaurant[]; dishes: MenuItem[] } {
  if (sort === 'relevance') return results;

  const restaurants = [...results.restaurants];
  const dishes = [...results.dishes];

  if (sort === 'rating') {
    restaurants.sort((a, b) => b.rating - a.rating);
    dishes.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'fastest') {
    restaurants.sort((a, b) => a.deliveryTimeMin - b.deliveryTimeMin);
    dishes.sort((a, b) => a.prepMin - b.prepMin);
  } else if (sort === 'cheapest') {
    restaurants.sort((a, b) => a.minOrder - b.minOrder);
    dishes.sort((a, b) => a.price - b.price);
  }

  return { restaurants, dishes };
}

export function FoodSearchScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [results, setResults] = useState<{ restaurants: Restaurant[]; dishes: MenuItem[] }>({
    restaurants: [],
    dishes: [],
  });

  const trimmed = query.trim();

  // Reset to the default (no-results) state the moment the query is emptied,
  // adjusted during render rather than in an effect.
  const [prevTrimmed, setPrevTrimmed] = useState(trimmed);
  if (trimmed !== prevTrimmed) {
    setPrevTrimmed(trimmed);
    if (!trimmed) {
      setResults({ restaurants: [], dishes: [] });
      setSearched(false);
    }
  }

  useEffect(() => {
    if (!trimmed) return;
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await foodApi.search(query);
        if (active) setResults(res);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, trimmed]);

  const { data: categoriesData } = useAsyncData(() => foodApi.getCategories(), []);
  const { data: popularData } = useAsyncData(() => foodApi.getPopular(), []);
  const categories = categoriesData ?? [];
  const popular = popularData ?? [];
  const sorted = useMemo(() => sortResults(results, sort), [results, sort]);
  const resultCount = sorted.restaurants.length + sorted.dishes.length;
  const showDefaults = !query.trim() && !searched;
  const showSort = searched && !loading && resultCount > 1;
  const popularShown = popular.slice(0, 6);
  const catsShown = categories.filter((c) => c !== 'All').slice(0, 8);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Search" onBack={() => navigation.goBack()} elevated />
      <View style={styles.searchWrap}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search for dishes, kitchens…"
          autoFocus
        />
      </View>

      <FlatList
        data={[]}
        keyExtractor={() => 'h'}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            {showDefaults && (
              <>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  TRENDING NOW
                </AppText>
                <View style={styles.chips}>
                  {popularShown.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      leadingEmoji={p.emoji}
                      onPress={() => setQuery(p.name)}
                    />
                  ))}
                </View>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  CATEGORIES
                </AppText>
                <View style={styles.chips}>
                  {catsShown.map((c) => (
                    <Chip key={c} label={c} onPress={() => setQuery(c)} />
                  ))}
                </View>
              </>
            )}

            {loading && searched && (
              <View style={{ marginTop: spacing.m }}>
                <SkeletonRestaurantList count={3} />
              </View>
            )}

            {!loading &&
              searched &&
              sorted.restaurants.length === 0 &&
              sorted.dishes.length === 0 && (
                <EmptyState
                  icon="search-outline"
                  title={`No results for "${query}"`}
                  message="Try a different dish, kitchen, or cuisine name."
                />
              )}

            {showSort && (
              <View style={styles.sortBlock}>
                <View style={styles.sortLabelRow}>
                  <Ionicons name="funnel-outline" size={13} color={colors.textMuted} />
                  <AppText variant="captionBold" color={colors.textMuted} uppercase>
                    {resultCount} results · sort by
                  </AppText>
                </View>
                <View style={styles.chips}>
                  {SORTS.map((s) => (
                    <Chip
                      key={s.key}
                      label={s.label}
                      icon={s.icon}
                      selected={sort === s.key}
                      onPress={() => setSort(s.key)}
                    />
                  ))}
                </View>
              </View>
            )}

            {!loading && searched && sorted.restaurants.length > 0 && (
              <>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  KITCHENS
                </AppText>
                {sorted.restaurants.map((r) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    variant="row"
                    onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })}
                  />
                ))}
              </>
            )}

            {!loading && searched && sorted.dishes.length > 0 && (
              <>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  DISHES
                </AppText>
                {sorted.dishes.map((d) => (
                  <FoodCard
                    key={d.id}
                    item={d}
                    variant="row"
                    onPress={() =>
                      navigation.navigate('FoodDetails', { item: d, restaurantName: 'Search' })
                    }
                  />
                ))}
              </>
            )}
          </View>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.m, paddingBottom: spacing.m },
  listContent: { paddingHorizontal: spacing.m },
  sectionTitle: { marginBottom: spacing.sm, marginTop: spacing.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  sortBlock: { marginTop: spacing.m },
  sortLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
});
