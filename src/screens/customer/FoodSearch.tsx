import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
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
import { foodApi, CATEGORIES, POPULAR_ITEMS } from '../../services/api';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { SkeletonRestaurantList } from '../../components/LoadingSkeleton';
import { Restaurant, MenuItem } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'FoodSearch'>;

export function FoodSearchScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ restaurants: Restaurant[]; dishes: MenuItem[] }>({
    restaurants: [],
    dishes: [],
  });

  useEffect(() => {
    if (!query.trim()) {
      setResults({ restaurants: [], dishes: [] });
      setSearched(false);
      setLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await foodApi.search(query);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const showDefaults = !query.trim() && !searched;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Search" onBack={() => navigation.goBack()} elevated />
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search for dishes, kitchens…" autoFocus />
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
                  {POPULAR_ITEMS.slice(0, 6).map((p) => (
                    <Chip key={p.id} label={p.name} leadingEmoji={p.emoji} onPress={() => setQuery(p.name)} />
                  ))}
                </View>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  CATEGORIES
                </AppText>
                <View style={styles.chips}>
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
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

            {!loading && searched && results.restaurants.length === 0 && results.dishes.length === 0 && (
              <EmptyState
                icon="search-outline"
                title={`No results for "${query}"`}
                message="Try a different dish, kitchen, or cuisine name."
              />
            )}

            {!loading && searched && results.restaurants.length > 0 && (
              <>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  KITCHENS
                </AppText>
                {results.restaurants.map((r) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    variant="row"
                    onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })}
                  />
                ))}
              </>
            )}

            {!loading && searched && results.dishes.length > 0 && (
              <>
                <AppText variant="captionBold" color={colors.textMuted} style={styles.sectionTitle}>
                  DISHES
                </AppText>
                {results.dishes.map((d) => (
                  <FoodCard
                    key={d.id}
                    item={d}
                    variant="row"
                    onPress={() => navigation.navigate('FoodDetails', { item: d, restaurantName: 'Search' })}
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
});