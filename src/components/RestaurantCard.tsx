import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { ArtTile } from './ArtTile';
import { RatingStars } from './RatingStars';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { Restaurant } from '../types/domain';
import { haptics } from '../hooks/useHaptics';

type Variant = 'featured' | 'row';

type Props = {
  restaurant: Restaurant;
  variant?: Variant;
  onPress: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
};

export function RestaurantCard({ restaurant, variant = 'row', onPress, onToggleFavorite, isFavorite }: Props) {
  const { colors } = useThemeColors();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    haptics.light();
    onPress();
  };

  if (variant === 'featured') {
    return (
      <Animated.View style={[styles.featWrap, animStyle]}>
        <Pressable
          onPressIn={() => {
            scale.value = withSpring(0.97, { damping: 18, stiffness: 280 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 18, stiffness: 280 });
          }}
          onPress={handlePress}
          style={[styles.featCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <View style={styles.featMain}>
            <ArtTile gradient={restaurant.gradient} emoji={restaurant.emoji} size={64} />
            <View style={styles.featInfo}>
              <AppText variant="title" weight="bold" numberOfLines={1} color={colors.textPrimary}>
                {restaurant.name}
              </AppText>
              <AppText variant="small" numberOfLines={1} color={colors.textMuted}>
                {restaurant.cuisine} · {restaurant.deliveryKM.toFixed(1)} km
              </AppText>
              <View style={styles.metaRow}>
                <View style={[styles.metaPill, { backgroundColor: colors.surfaceMuted }]}>
                  <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                  <AppText variant="micro" weight="semiBold" color={colors.textSecondary}>
                    {restaurant.deliveryTimeMin} min
                  </AppText>
                </View>
                <View style={[styles.metaPill, { backgroundColor: colors.surfaceMuted }]}>
                  <Ionicons name="bicycle-outline" size={12} color={colors.textSecondary} />
                  <AppText variant="micro" weight="semiBold" color={colors.textSecondary}>
                    {restaurant.freeDelivery ? 'Free delivery' : `Rs ${restaurant.deliveryFee}`}
                  </AppText>
                </View>
              </View>
            </View>
          </View>
          <RatingStars rating={restaurant.rating} showValue reviews={restaurant.reviews} />
          {restaurant.promo && (
            <View style={[styles.promo, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="pricetag" size={13} color={colors.primaryStrong} />
              <AppText variant="microBold" color={colors.primaryStrong} uppercase>
                {restaurant.promo}
              </AppText>
            </View>
          )}
          {onToggleFavorite && (
            <FavoriteFab isFavorite={!!isFavorite} onPress={onToggleFavorite} />
          )}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 18, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 300 });
        }}
        onPress={handlePress}
        style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        <ArtTile gradient={restaurant.gradient} emoji={restaurant.emoji} size={76} />
        <View style={styles.rowInfo}>
          <AppText variant="title" weight="bold" numberOfLines={1} color={colors.textPrimary}>
            {restaurant.name}
          </AppText>
          <AppText variant="small" numberOfLines={1} color={colors.textMuted}>
            {restaurant.cuisine}
          </AppText>
          <View style={[styles.rowMeta, { marginTop: 4 }]}>
            <RatingStars rating={restaurant.rating} size={12} showValue={false} />
            <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
              {restaurant.rating.toFixed(1)}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              ·
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {restaurant.deliveryTimeMin} min
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              ·
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Rs {restaurant.deliveryFee}
            </AppText>
          </View>
          {restaurant.promo && (
            <View style={styles.promoRow}>
              <Ionicons name="pricetag" size={12} color={colors.accent} />
              <AppText variant="microBold" color={colors.accent} numberOfLines={1}>
                {restaurant.promo}
              </AppText>
            </View>
          )}
        </View>
        {onToggleFavorite && (
          <FavoriteFab isFavorite={!!isFavorite} onPress={onToggleFavorite} small />
        )}
      </Pressable>
    </Animated.View>
  );
}

function FavoriteFab({ isFavorite, onPress, small }: { isFavorite: boolean; onPress: () => void; small?: boolean }) {
  const { colors } = useThemeColors();
  return (
    <Animated.View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm }}>
      <Pressable
        hitSlop={10}
        onPress={() => {
          haptics.medium();
          onPress();
        }}
        style={[
          styles.fav,
          {
            backgroundColor: 'rgba(255,255,255,0.92)',
            width: small ? 34 : 38,
            height: small ? 34 : 38,
            borderRadius: small ? 17 : 19,
          },
        ]}
      >
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={small ? 17 : 19}
          color={isFavorite ? '#E5484D' : '#7C918E'}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  featWrap: { marginRight: spacing.m },
  featCard: {
    width: 300,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.sm,
    position: 'relative',
  },
  featMain: { flexDirection: 'row', gap: spacing.m },
  featInfo: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.xs, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
    height: 24,
    borderRadius: radius.pill,
  },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  rowCard: {
    flexDirection: 'row',
    gap: spacing.m,
    padding: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    position: 'relative',
  },
  rowInfo: { flex: 1, justifyContent: 'center', gap: 2, paddingRight: spacing.md },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  fav: { alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
});