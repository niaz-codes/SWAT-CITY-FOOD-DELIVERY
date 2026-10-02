import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { riderApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, formatDuration } from '../../utils/format';
import { RideRequest } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const VEHICLE_ICON: Record<RideRequest['vehicle'], keyof typeof Ionicons.glyphMap> = {
  bike: 'bicycle-outline',
  rickshaw: 'car-sport-outline',
  sedan: 'car-outline',
  van: 'bus-outline',
};

export function RiderRequestsScreen({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const requests = useAsyncData(() => riderApi.getRequests(), []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Requests"
        onBack={embedded ? undefined : () => navigation.goBack()}
        hideBack={embedded}
        right={<Badge label="Live" tone="success" icon="radio-button-on" />}
      />
      <FlatList
        data={requests.data ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <RequestCard item={item} onAccept={() => navigation.navigate('RiderActiveDelivery', { primaryRequest: true })} />
        )}
        refreshControl={<RefreshControl refreshing={requests.refreshing} onRefresh={requests.onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          requests.loading && requests.data == null ? (
            <EmptyState icon="pulse-outline" title="Fetching requests…" message="Polling riders nearby." />
          ) : (
            <EmptyState icon="map-outline" title="No requests right now" message="Pull to refresh. New jobs appear automatically." />
          )
        }
      />
    </View>
  );
}

function RequestCard({ item, onAccept }: { item: RideRequest; onAccept: () => void }) {
  const { colors } = useThemeColors();
  const isFood = item.type === 'food';
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onAccept();
      }}
      style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
    >
      <View style={styles.cardTop}>
        <Badge label={isFood ? 'Food delivery' : 'Ride'} tone={isFood ? 'primary' : 'ride'} icon={isFood ? 'restaurant-outline' : 'bicycle-outline'} />
        <AppText variant="small" color={colors.textMuted}>
          {formatDuration(item.durationMin)} away
        </AppText>
      </View>

      <View style={styles.route}>
        <View style={styles.routeLine}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={[styles.line, { backgroundColor: colors.borderStrong }]} />
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
        </View>
        <View style={styles.routeText}>
          <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
            {item.pickup}
          </AppText>
          <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
            {item.dropoff}
          </AppText>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.metaRow}>
          <View style={[styles.vehicleIcon, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name={VEHICLE_ICON[item.vehicle]} size={14} color={colors.textSecondary} />
          </View>
          <AppText variant="small" color={colors.textSecondary}>
            {item.vehicle} · {item.distanceKm.toFixed(1)} km
          </AppText>
        </View>
        <View style={styles.acceptRight}>
          <AppText variant="title" weight="extraBold" color={colors.success}>
            {formatCurrency(rp(item.fare))}
          </AppText>
          <AppText variant="micro" color={colors.textMuted}>payout</AppText>
        </View>
      </View>
    </Pressable>
  );
}

function rp(fare: number): number {
  return Math.round(fare * 0.76);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: spacing.m },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  route: { flexDirection: 'row', gap: spacing.sm },
  routeLine: { alignItems: 'center', width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 22 },
  routeText: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  vehicleIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  acceptRight: { alignItems: 'flex-end' },
});