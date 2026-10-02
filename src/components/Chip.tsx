import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  leadingEmoji?: string;
};

export function Chip({ label, selected, onPress, icon, leadingEmoji }: Props) {
  const { colors } = useThemeColors();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pop = useAnimatedStyle(() => ({
    transform: [{ scale: selected ? 1.035 : 1 }],
  }));

  const bg = selected ? colors.primary : colors.surfaceRaised;
  const text = selected ? colors.onPrimary : colors.textSecondary;
  const border = selected ? colors.primary : colors.border;

  return (
    <Animated.View style={[animStyle, pop]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.94, { damping: 16, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 300 });
        }}
        onPress={() => {
          haptics.light();
          onPress?.();
        }}
        style={[styles.chip, { backgroundColor: bg, borderColor: border }]}
      >
        {icon && <Ionicons name={icon} size={16} color={text} />}
        {leadingEmoji && <AppText variant="caption">{leadingEmoji}</AppText>}
        <AppText variant="caption" weight="semiBold" color={text}>
          {label}
        </AppText>
        {selected && <Ionicons name="checkmark" size={16} color={text} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.m,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});