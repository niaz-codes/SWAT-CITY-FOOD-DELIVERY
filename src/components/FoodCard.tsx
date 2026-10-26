import React from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { ArtTile } from './ArtTile';
import { RatingStars } from './RatingStars';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { MenuItem } from '../types/domain';
import { useCart } from '../state/CartContext';
import { haptics } from '../hooks/useHaptics';
import { usePressScale } from '../hooks/usePressScale';

type Variant = 'grid' | 'row';

type Props = {
  item: MenuItem;
  variant?: Variant;
  onPress: () => void;
  onAdd?: (item: MenuItem) => void;
  quantity?: number;
};

export function FoodCard({ item, variant = 'grid', onPress, onAdd, quantity = 0 }: Props) {
  const { colors } = useThemeColors();
  const grid = usePressScale(0.97, 18, 300);
  const row = usePressScale(0.98, 18, 300);
  const { add } = useCart();

  const handleAdd = (e: GestureResponderEvent) => {
    e.stopPropagation();
    haptics.success();
    if (onAdd) onAdd(item);
    else add(item);
  };

  if (variant === 'grid') {
    return (
      <Animated.View style={[styles.gridWrap, grid.animStyle]}>
        <Pressable
          onPressIn={grid.pressIn}
          onPressOut={grid.pressOut}
          onPress={onPress}
          style={[
            styles.gridCard,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <ArtTile gradient={item.gradient} emoji={item.emoji} size={56} rounded={14} />
          {item.popular && (
            <View style={[styles.popular, { backgroundColor: colors.accentSoft }]}>
              <AppText variant="microBold" color={colors.warning} uppercase>
                Popular
              </AppText>
            </View>
          )}
          <AppText
            variant="title"
            weight="bold"
            numberOfLines={1}
            color={colors.textPrimary}
            style={styles.gridName}
          >
            {item.name}
          </AppText>
          <AppText variant="small" numberOfLines={1} color={colors.textMuted}>
            {item.description}
          </AppText>
          <View style={styles.gridBottom}>
            <View>
              <AppText variant="captionBold" color={colors.textMuted}>
                From
              </AppText>
              <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
                Rs {item.price}
              </AppText>
            </View>
            {quantity > 0 ? (
              <View style={[styles.qtyChip, { backgroundColor: colors.primarySoft }]}>
                <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>
                  {quantity} in cart
                </AppText>
              </View>
            ) : (
              <Pressable
                onPress={handleAdd}
                hitSlop={8}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="add" size={20} color={colors.onPrimary} />
              </Pressable>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={row.animStyle}>
      <Pressable
        onPressIn={row.pressIn}
        onPressOut={row.pressOut}
        onPress={onPress}
        style={[
          styles.rowCard,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <ArtTile gradient={item.gradient} emoji={item.emoji} size={72} />
        <View style={styles.rowInfo}>
          <AppText variant="title" weight="bold" numberOfLines={1} color={colors.textPrimary}>
            {item.name}
          </AppText>
          <AppText variant="small" numberOfLines={2} color={colors.textMuted}>
            {item.description}
          </AppText>
          <View style={styles.footerRow}>
            <RatingStars rating={item.rating} size={12} showValue />
            <AppText variant="small" color={colors.textMuted}>
              {item.calories} kcal
            </AppText>
          </View>
          <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
            Rs {item.price}
          </AppText>
        </View>
        <View style={styles.addCol}>
          {item.popular && (
            <View style={[styles.popular, { backgroundColor: colors.accentSoft, marginTop: 0 }]}>
              <AppText variant="microBold" color={colors.warning} uppercase>
                Popular
              </AppText>
            </View>
          )}
          {quantity > 0 ? (
            <View style={[styles.qtyChip, { backgroundColor: colors.primarySoft }]}>
              <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>
                {quantity}
              </AppText>
            </View>
          ) : (
            <Pressable
              onPress={handleAdd}
              hitSlop={8}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add" size={18} color={colors.onPrimary} />
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gridWrap: { flex: 1, minWidth: 0 },
  gridCard: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.xs,
    marginBottom: spacing.m,
    position: 'relative',
  },
  gridName: { marginTop: spacing.s },
  gridBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  popular: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.s,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  qtyChip: {
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCard: {
    flexDirection: 'row',
    gap: spacing.m,
    padding: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  rowInfo: { flex: 1, gap: 2, justifyContent: 'center', paddingRight: spacing.xs },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: 2 },
  addCol: { alignItems: 'flex-end', justifyContent: 'space-between', paddingVertical: 2 },
});
