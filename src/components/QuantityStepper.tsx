import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type Props = {
  quantity: number;
  onChange: (qty: number) => void;
  size?: 'sm' | 'md';
  min?: number;
};

export function QuantityStepper({ quantity, onChange, size = 'md', min = 0 }: Props) {
  const { colors } = useThemeColors();
  const dim = size === 'sm' ? 30 : 38;

  const dec = () => {
    haptics.light();
    if (quantity > min) onChange(quantity - 1);
  };
  const inc = () => {
    haptics.light();
    onChange(quantity + 1);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: radius.pill,
        },
      ]}
    >
      <Pressable
        onPress={dec}
        disabled={quantity <= min}
        hitSlop={6}
        style={[styles.btn, { width: dim, height: dim }, quantity <= min && { opacity: 0.35 }]}
      >
        <Ionicons name={quantity <= min ? 'trash-outline' : 'remove'} size={size === 'sm' ? 14 : 17} color={colors.textPrimary} />
      </Pressable>
      <AppText variant={size === 'sm' ? 'smallMedium' : 'title'} weight="bold" color={colors.textPrimary} style={styles.count}>
        {quantity}
      </AppText>
      <Pressable onPress={inc} hitSlop={6} style={[styles.btn, { width: dim, height: dim, backgroundColor: colors.primary, borderRadius: radius.pill }]}>
        <Ionicons name="add" size={size === 'sm' ? 14 : 17} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 3 },
  btn: { alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 26, textAlign: 'center', paddingHorizontal: spacing.xs, includeFontPadding: false },
});