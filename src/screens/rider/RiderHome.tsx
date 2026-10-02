import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { SectionHeader } from '../../components/SectionHeader';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { riderApi, RIDER_PROFILE } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, formatDuration } from '../../utils/format';
import { DeliveryFeedItem } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RiderHomeScreen({ onGoToRequests, onGoToProfile }: { onGoToRequests?: () => void; onGoToProfile?: () => void }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  const earnings = useAsyncData(() => riderApi.getEarnings(), []);
  const feed = useAsyncData(() => riderApi.getFeed(), []);

  const period = earnings.data?.period;
  const days = earnings.data?.days ?? [];
  const maxDay = Math.max(1, ...days.map((d) => d.amount));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
          <View style={styles.headerRow}>
            <View style={styles.greeting}>
              <AppText variant="caption" color={colors.textMuted}>SWAT CITY · PARTNER</AppText>
              <AppText variant="h3" weight="extraBold" color={colors.textPrimary}>
                {online ? `On the road, ${RIDER_PROFILE.name.split(' ')[0]}` : `Hello, ${RIDER_PROFILE.name.split(' ')[0]}`}
              </AppText>
            </View>
            <Pressable onPress={() => (onGoToProfile ? onGoToProfile() : haptics.light())} hitSlop={8}>
              <Avatar name={RIDER_PROFILE.name} gradient={RIDER_PROFILE.avatarGradient} size={46} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              haptics.medium();
              setOnline((v) => !v);
            }}
            style={[styles.onlinePill, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
          >
            <View style={[styles.onlineDot, { backgroundColor: online ? colors.success : colors.textMuted }]} />
            <AppText variant="smallMedium" weight="bold" color={online ? colors.success : colors.textMuted}>
              {online ? 'Online · getting requests' : 'Offline · tap to go online'}
            </AppText>
            <SwitchGlyph on={online} />
          </Pressable>
        </View>

        <LinearGradient
          colors={online ? ['#1B84B5', '#0E3F3A'] : ['#374151', '#111827']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.earningsCard}
        >
          <View style={styles.earningsTop}>
            <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>Latest earnings</AppText>
            <Badge label={period?.label ?? 'This week'} tone="primary" />
          </View>
          {earnings.loading && earnings.data == null ? (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">Rs …</AppText>
          ) : (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">
              {formatCurrency(period?.amount ?? 0)}
            </AppText>
          )}
          <View style={styles.earningsMeta}>
            <Meta label="Trips" value={`${period?.trips ?? 0}`} />
            <Meta label="Hours online" value={`${period?.hoursOnline ?? 0}h`} />
            <Meta label="On-time" value={`${period?.onTime ?? 0}%`} />
          </View>

          <View style={styles.bars}>
            {days.map((d) => (
              <View key={d.day} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${Math.max(10, (d.amount / maxDay) * 100)}%` }]} />
                </View>
                <AppText variant="micro" color="rgba(255,255,255,0.85)">{d.day}</AppText>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <Stat icon="star" value="4.9" label="Rating" tint={colors.warning} />
          <Stat icon="people" value="1,286" label="Trips" tint={colors.ride} />
          <Stat icon="checkmark-circle" value="96%" label="Acceptance" tint={colors.success} />
          <Stat icon="flame" value="98%" label="Satisfaction" tint={colors.danger} />
        </View>

        {online ? (
          <>
            <SectionHeader title="Requests near you" subtitle="Fresh jobs in Mingora & Saidu" actionLabel={onGoToRequests ? 'View all' : undefined} onAction={onGoToRequests} />
            <View style={styles.feed}>
              {feed.loading && feed.data == null ? (
                <EmptyState icon="pulse-outline" title="Scanning…" message="Looking for deliveries nearby." compact />
              ) : (feed.data ?? []).length === 0 ? (
                <EmptyState icon="map-outline" title="No requests right now" message="New jobs appear when customers order." compact />
              ) : (
                (feed.data ?? []).slice(0, 3).map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && <Divider spacing={0} />}
                    <FeedRow item={item} onAccept={() => navigation.navigate('RiderActiveDelivery', { primaryRequest: true })} />
                  </React.Fragment>
                ))
              )}
            </View>
          </>
        ) : (
          <View style={[styles.offlineCard, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="moon-outline" size={22} color={colors.textSecondary} />
            <AppText variant="title" weight="semiBold" color={colors.textPrimary}>You're offline</AppText>
            <AppText variant="small" color={colors.textSecondary} style={styles.offlineText}>
              Go online to receive food deliveries and ride requests from customers nearby.
            </AppText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SwitchGlyph({ on }: { on: boolean }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.switchTrack, { backgroundColor: on ? colors.success : colors.borderStrong }]}>
      <View style={[styles.switchThumb, { alignSelf: on ? 'flex-end' : 'flex-start' }]} />
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <AppText variant="smallMedium" weight="bold" color="#FFFFFF">{value}</AppText>
      <AppText variant="micro" color="rgba(255,255,255,0.8)">{label}</AppText>
    </View>
  );
}

function Stat({ icon, value, label, tint }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; tint: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={tint} />
      <AppText variant="title" weight="extraBold" color={colors.textPrimary}>{value}</AppText>
      <AppText variant="micro" color={colors.textMuted}>{label}</AppText>
    </View>
  );
}

function FeedRow({ item, onAccept }: { item: DeliveryFeedItem; onAccept: () => void }) {
  const { colors } = useThemeColors();
  return (
    <Pressable onPress={onAccept} style={styles.feedRow}>
      <View style={[styles.feedIcon, { backgroundColor: item.kind === 'food' ? colors.primarySoft : colors.rideSoft }]}>
        <Ionicons name={item.kind === 'food' ? 'restaurant-outline' : 'bicycle-outline'} size={22} color={item.kind === 'food' ? colors.primary : colors.ride} />
      </View>
      <View style={styles.feedInfo}>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>{item.pickup} → {item.dropoff}</AppText>
        <AppText variant="micro" color={colors.textMuted}>
          {item.distanceKm.toFixed(1)} km · {formatDuration(item.durationMin)}
        </AppText>
      </View>
      <View style={styles.feedRight}>
        <AppText variant="title" weight="extraBold" color={colors.success}>{formatCurrency(item.payout)}</AppText>
        <AppText variant="microBold" color={colors.primary}>ACCEPT</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { gap: 1 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.m, paddingVertical: spacing.s },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  switchTrack: { width: 40, height: 24, borderRadius: 12, padding: 2, marginLeft: 'auto' },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  earningsCard: { borderRadius: 26, padding: spacing.l, gap: spacing.xs, overflow: 'hidden' },
  earningsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earningsMeta: { flexDirection: 'row', gap: spacing.l, marginTop: spacing.xs },
  meta: { gap: 1 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.xs, marginTop: spacing.l, height: 64 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { width: 14, height: 44, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.85)' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stat: { flex: 1, borderRadius: 16, borderWidth: 1, padding: spacing.sm, alignItems: 'center', gap: 2 },
  feed: { backgroundColor: 'transparent', borderRadius: 0 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  feedIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  feedInfo: { flex: 1, gap: 2 },
  feedRight: { alignItems: 'flex-end', gap: 2 },
  offlineCard: { borderRadius: 20, padding: spacing.l, alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  offlineText: { textAlign: 'center' },
});