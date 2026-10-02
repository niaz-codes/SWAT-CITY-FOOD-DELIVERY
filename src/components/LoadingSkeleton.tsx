import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';

type SkeletonProps = {
  width?: number | `${number}%`;
  height: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
};

function Shimmer({ children }: { children: React.ReactNode }) {
  const { colors } = useThemeColors();
  const translate = useSharedValue(-200);

  useEffect(() => {
    translate.value = withRepeat(withTiming(400, { duration: 1400 }), -1, false);
  }, [translate]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  return (
    <View style={styles.shimmerRoot}>
      {children}
      <Animated.View style={[styles.highlight, animStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.highlightFill}
        />
      </Animated.View>
    </View>
  );
}

export function Skeleton({ width = '100%', height, rounded, style }: SkeletonProps) {
  const { colors } = useThemeColors();
  return (
    <Shimmer>
      <View
        style={[
          { width, height, borderRadius: rounded ?? height * 0.35, backgroundColor: colors.skeleton },
          style,
        ]}
      />
    </Shimmer>
  );
}

export function SkeletonCircle({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useThemeColors();
  return (
    <Shimmer>
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.skeleton }, style]} />
    </Shimmer>
  );
}

export function SkeletonRestaurantList({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRestaurantRow key={i} />
      ))}
    </View>
  );
}

function SkeletonRestaurantRow() {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }]}>
      <Skeleton width={76} height={76} rounded={radius.card} />
      <View style={styles.rowBody}>
        <Skeleton width="80%" height={18} />
        <Skeleton width="55%" height={13} />
        <Skeleton width="62%" height={13} />
      </View>
    </View>
  );
}

export function SkeletonFoodGrid({ count = 4 }: { count?: number }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.gridCard, { backgroundColor: colors.surfaceRaised, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }]}>
          <Skeleton height={90} rounded={radius.md} />
          <Skeleton width="88%" height={16} style={styles.mt} />
          <Skeleton width="70%" height={12} style={styles.mt} />
          <Skeleton width="45%" height={18} style={styles.mt} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonBanner() {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.banner, { backgroundColor: colors.surfaceRaised, borderRadius: radius.xl }]}>
      <Skeleton height={170} rounded={radius.xl} />
    </View>
  );
}

export function SkeletonChatRow({ count = 3 }: { count?: number }) {
  const { colors } = useThemeColors();
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }]}>
          <SkeletonCircle size={46} />
          <View style={styles.rowBody}>
            <Skeleton width="70%" height={15} />
            <Skeleton width="50%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shimmerRoot: { overflow: 'hidden', position: 'relative', borderRadius: radius.sm },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  highlightFill: { flex: 1, width: 220 },
  list: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { width: '48%', padding: spacing.m, marginBottom: spacing.m },
  rowCard: { flexDirection: 'row', gap: spacing.m, padding: spacing.sm, marginBottom: spacing.sm, alignItems: 'center' },
  rowBody: { flex: 1, gap: spacing.s },
  banner: { marginBottom: spacing.l, padding: spacing.s },
  mt: { marginTop: spacing.s },
});