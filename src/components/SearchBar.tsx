import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { fonts } from '../theme/typography';
import { radius, sizes, spacing } from '../theme/spacing';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  leftIcon?: keyof typeof Ionicons.glyphMap;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search', autoFocus, onFocus, onBlur, leftIcon = 'search' }: Props) {
  const { colors } = useThemeColors();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.985, { damping: 20, stiffness: 300 });
          onFocus?.();
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 300 });
        }}
        style={[
          styles.bar,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <Ionicons name={leftIcon} size={20} color={colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          style={[styles.input, { color: colors.textPrimary, fontFamily: fonts.medium }]}
        />
        {value.length > 0 && (
          <Pressable hitSlop={10} onPress={() => onChangeText('')}>
            <View style={[styles.clear, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="close" size={15} color={colors.textMuted} />
            </View>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function SearchBarLabel({ placeholder }: { placeholder: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <AppText variant="body" color={colors.textMuted}>
        {placeholder}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: sizes.input,
    paddingHorizontal: spacing.m,
    borderRadius: radius['lg'],
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  clear: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});