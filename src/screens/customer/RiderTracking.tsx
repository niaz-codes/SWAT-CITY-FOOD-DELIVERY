import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { MapComponent } from '../../components/MapComponent';
import { RiderCard } from '../../components/RiderCard';
import { Divider } from '../../components/Divider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { RIDERS } from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { RideFlow } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderTracking'>;

export function RiderTrackingScreen({ navigation, route }: Props) {
  const { ride } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const rider = RIDERS[0]!;

  const [state, setState] = useState<'arriving' | 'onway' | 'done'>('arriving');

  const progress = useSharedValue(0);

  useEffect(() => {
    if (state === 'onway') {
      progress.value = withRepeat(withTiming(1, { duration: 12000 }), -1, false);
    } else if (state === 'done') {
      progress.value = 1;
    } else {
      progress.value = 0.15;
    }
  }, [state, progress]);

  const liveChipText = state === 'done' ? 'Trip completed' : state === 'onway' ? 'On the way' : 'Rider arriving';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Trip to ${ride.dropoff}`} onBack={() => navigation.goBack()} elevated />

      <View style={styles.mapWrap}>
        <MapComponent pickup={{ x: 0.24, y: 0.34 }} dropoff={{ x: 0.76, y: 0.68 }} height={300} rounded={26} progress={progress} animateRouteDash={state === 'onway'} />
        <View style={[styles.liveChip, { backgroundColor: state === 'done' ? colors.successSoft : colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={[styles.liveDot, { backgroundColor: state === 'done' ? colors.success : colors.danger }]} />
          <AppText variant="microBold" color={state === 'done' ? colors.success : colors.textPrimary}>{liveChipText}</AppText>
        </View>
      </View>

      <Animated.View entering={FadeInUp.duration(300)} style={styles.body}>
        <View style={[styles.routeCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={styles.routeItem}>
            <Ionicons name="ellipse" size={13} color={colors.primary} />
            <AppText variant="bodyMedium" weight="semiBold" color={colors.textPrimary} style={styles.routeText} numberOfLines={1}>
              {ride.pickup}
            </AppText>
          </View>
          <View style={[styles.routeDash, { borderColor: colors.borderStrong }]} />
          <View style={styles.routeItem}>
            <Ionicons name="location" size={14} color={colors.danger} />
            <AppText variant="bodyMedium" weight="semiBold" color={colors.textPrimary} style={styles.routeText} numberOfLines={1}>
              {ride.dropoff}
            </AppText>
          </View>
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MetaRow icon="navigate-outline" label="Distance" value={`${ride.distanceKm.toFixed(1)} km`} />
          <MetaRow icon="time-outline" label="Duration" value={`${ride.durationMin} min`} />
          <MetaRow icon="card-outline" label="Fare" value={formatCurrency(ride.fare)} strong />
        </View>

        <RiderCard
          rider={rider}
          showTripMeta
          onCall={() => haptics.medium()}
          onSMS={() => haptics.medium()}
        />

        {state !== 'done' && (
          <Pressable
            onPress={() => {
              haptics.medium();
              if (state === 'arriving') setState('onway');
              else {
                success('Trip completed. Thank you!');
                setState('done');
                setTimeout(() => navigation.navigate('Main'), 1400);
              }
            }}
            style={[styles.primaryBtn, { backgroundColor: state === 'arriving' ? colors.primary : colors.ride }]}
          >
            <AppText variant="title" weight="bold" color={colors.onPrimary}>
              {state === 'arriving' ? 'Start trip' : 'Complete trip'}
            </AppText>
          </Pressable>
        )}

        {state === 'done' && (
          <Pressable onPress={() => navigation.navigate('Main')} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
            <AppText variant="title" weight="bold" color={colors.onPrimary}>Back home</AppText>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

function MetaRow({ icon, label, value, strong }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; strong?: boolean }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaStart}>
        <Ionicons name={icon} size={17} color={colors.primary} />
        <AppText variant="body" color={colors.textSecondary}>{label}</AppText>
      </View>
      <AppText variant={strong ? 'h4' : 'bodyMedium'} weight={strong ? 'extraBold' : 'semiBold'} color={strong ? colors.textPrimary : colors.textPrimary}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapWrap: { margin: spacing.m, position: 'relative' },
  liveChip: {
    position: 'absolute',
    top: spacing.s + 4,
    left: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  body: { paddingHorizontal: spacing.m },
  routeCard: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.xs },
  routeItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeText: { flex: 1 },
  routeDash: { borderLeftWidth: 2, height: 14, marginLeft: 5.5 },
  metaCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: spacing.m, paddingVertical: spacing.xs, marginVertical: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  metaStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  primaryBtn: { marginVertical: spacing.sm, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});