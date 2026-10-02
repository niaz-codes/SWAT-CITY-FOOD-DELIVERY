import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { spacing, sizes } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

export type TabItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  badge?: number;
};

type Props = {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  elevated?: boolean;
};

export function TabBar({ items, activeKey, onChange, elevated }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const index = Math.max(0, items.findIndex((i) => i.key === activeKey));
  const indicator = useSharedValue(index);

  useEffect(() => {
    indicator.value = withSpring(index, { damping: 20, stiffness: 240 });
  }, [index, indicator]);

  const tabWidth = width / items.length;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicator.value * tabWidth }],
    width: tabWidth,
  }));

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surfaceRaised,
          paddingBottom: insets.bottom,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        elevated && styles.elevated,
      ]}
    >
      <Animated.View
        style={[styles.indicator, indicatorStyle, { height: 3, backgroundColor: colors.primary }]}
      >
        <View
          style={[styles.indicatorInner, { backgroundColor: colors.primary }]}
        />
      </Animated.View>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              haptics.light();
              if (item.key !== activeKey) onChange(item.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.item, { width: tabWidth }]}
          >
            <View style={styles.iconSlot}>
              <View
                style={[
                  styles.iconBubble,
                  { backgroundColor: active ? colors.primarySoft : 'transparent' },
                ]}
              >
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={22}
                  color={active ? colors.primaryStrong : colors.tabBarInactive}
                />
              </View>
              {item.badge != null && item.badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                  <AppText variant="microBold" color="#FFFFFF" style={styles.badgeText}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </AppText>
                </View>
              )}
            </View>
            <AppText
              variant="microBold"
              color={active ? colors.primaryStrong : colors.tabBarInactive}
              style={styles.label}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
    minHeight: sizes.tabBar,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 16,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  indicatorInner: { flex: 1 },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.s + 2,
    gap: 3,
  },
  iconSlot: { position: 'relative' },
  iconBubble: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: 4,
  },
  badgeText: { includeFontPadding: false },
  label: { includeFontPadding: false, marginBottom: 6 },
});