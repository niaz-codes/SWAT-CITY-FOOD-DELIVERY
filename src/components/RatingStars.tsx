import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { spacing } from '../theme/spacing';

type Props = {
  rating: number;
  size?: number;
  showValue?: boolean;
  reviews?: number;
};

export function RatingStars({ rating, size = 14, showValue = true, reviews }: Props) {
  const { colors } = useThemeColors();
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.row}>
      <View style={styles.stars}>
        {stars.map((s) => {
          const filled = rating >= s;
          const half = !filled && rating >= s - 0.5;
          return (
            <View key={s}>
              <Ionicons
                name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
                size={size}
                color={filled || half ? colors.warning : colors.textMuted}
              />
            </View>
          );
        })}
      </View>
      {showValue && (
        <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} style={styles.value}>
          {rating.toFixed(1)}
        </AppText>
      )}
      {reviews != null && (
        <AppText variant="small" color={colors.textMuted}>
          ({reviews.toLocaleString('en-US')})
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  value: { marginLeft: 2 },
});