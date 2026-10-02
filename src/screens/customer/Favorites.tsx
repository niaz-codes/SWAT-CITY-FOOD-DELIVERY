import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { ArtTile } from '../../components/ArtTile';
import { RatingStars } from '../../components/RatingStars';
import { EmptyState } from '../../components/EmptyState';
import { favoriteApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';
import { Favorite, FavoriteKind } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

export function FavoritesScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const data = useAsyncData(() => favoriteApi.get(), []);

  const items = (data.data ?? []).filter((f) => !removed.has(f.id));

  const open = (f: Favorite) => {
    haptics.light();
    if (f.kind === 'restaurant') navigation.navigate('Restaurant', { restaurantId: f.refId });
    else navigation.navigate('FoodSearch');
  };

  const remove = (f: Favorite) => {
    haptics.medium();
    setRemoved((prev) => new Set(prev).add(f.id));
    success(`${f.name} removed from favorites`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Favorites" onBack={() => navigation.goBack()} elevated />
      <FlatList
        data={items}
        keyExtractor={(f) => f.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => <FavoriteTile favorite={item} onOpen={() => open(item)} onRemove={() => remove(item)} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ListEmptyComponent={
          data.loading ? (
            <EmptyState icon="heart-outline" title="Loading…" message="Fetching your favorites." />
          ) : (
            <EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on a kitchen or dish to save it here." actionLabel="Browse food" onAction={() => navigation.navigate('Main')} />
          )
        }
      />
    </View>
  );
}

function FavoriteTile({ favorite, onOpen, onRemove }: { favorite: Favorite; onOpen: () => void; onRemove: () => void }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Pressable onPress={onOpen} style={styles.tileBody}>
        <ArtTile gradient={favorite.gradient} emoji={favorite.emoji} size={54} rounded={16} />
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
          {favorite.name}
        </AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
          {favorite.subtitle}
        </AppText>
        <View style={styles.tileMeta}>
          <RatingStars rating={favorite.rating} size={11} showValue />
          {favorite.price != null && (
            <AppText variant="smallMedium" weight="bold" color={colors.primary}>
              {formatCurrency(favorite.price)}
            </AppText>
          )}
        </View>
        <AppText variant="micro" color={colors.textMuted}>
          Saved {timeAgo(favorite.savedAt)}
        </AppText>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.heart}>
        <Ionicons name="heart" size={20} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: spacing.m },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    maxWidth: '48.5%',
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.sm,
    position: 'relative',
  },
  tileBody: { gap: 3 },
  tileMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: 2 },
  heart: { position: 'absolute', top: 10, right: 10 },
});