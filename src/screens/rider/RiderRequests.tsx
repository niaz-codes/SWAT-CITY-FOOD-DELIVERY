import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { riderFeedApi, acceptRide, rideRequestFromSocket } from '../../services/api';
import { onSocketEvent } from '../../services/socket';
import { apiErrorMessage } from '../../services/client';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, formatDuration } from '../../utils/format';
import { RideRequest } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RIDE_REQUEST_EVENT = 'ride:request';

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
  const { error: toastError } = useToast();
  const requests = useAsyncData(() => riderFeedApi.getRequests(), []);
  const [live, setLive] = useState<RideRequest[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Push freshly-broadcast ride:request events onto the top of the list as they
  // arrive over the socket, so riders see new jobs instantly (no polling wait).
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    onSocketEvent<unknown>(RIDE_REQUEST_EVENT, (payload) => {
      const item = rideRequestFromSocket(payload);
      if (!item) return;
      setLive((prev) => [item, ...prev.filter((r) => r.id !== item.id)].slice(0, 24));
    }).then((fn) => {
      if (mounted) unsubscribe = fn;
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  // Keep the pool fresh in the background; the pull-to-refresh is the manual route.
  useEffect(() => {
    const id = setInterval(() => requests.refetch(), 30_000);
    return () => clearInterval(id);
  }, [requests]);

  // Live (socket) items win; fetched data fills the rest, deduped by id.
  const items = useMemo(() => {
    const seen = new Set(live.map((r) => r.id));
    return [...live, ...(requests.data ?? []).filter((r) => !seen.has(r.id))];
  }, [live, requests.data]);

  const onAccept = async (item: RideRequest) => {
    if (acceptingId) return;
    setAcceptingId(item.id);
    try {
      const claimed = await acceptRide(item.id);
      haptics.success();
      setLive((prev) => prev.filter((r) => r.id !== item.id));
      navigation.navigate('RiderActiveDelivery', { rideId: claimed.id });
    } catch (err) {
      toastError(apiErrorMessage(err, 'Could not accept. The request may already be taken.'));
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Requests"
        onBack={embedded ? undefined : () => navigation.goBack()}
        hideBack={embedded}
        right={<Badge label="Live" tone="success" icon="radio-button-on" />}
      />
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            accepting={acceptingId === item.id}
            onAccept={() => onAccept(item)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={requests.refreshing}
            onRefresh={requests.onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          requests.error && !requests.data ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Couldn't load requests"
              message="Check your connection and try again."
              onAction={requests.refetch}
            />
          ) : requests.loading && requests.data == null ? (
            <EmptyState
              icon="pulse-outline"
              title="Fetching requests…"
              message="Polling riders nearby."
            />
          ) : (
            <EmptyState
              icon="map-outline"
              title="No requests right now"
              message="Pull to refresh. New jobs appear automatically."
            />
          )
        }
      />
    </View>
  );
}

function RequestCard({
  item,
  onAccept,
  accepting,
}: {
  item: RideRequest;
  onAccept: () => void;
  accepting: boolean;
}) {
  const { colors } = useThemeColors();
  const isFood = item.type === 'food';
  return (
    <Pressable
      onPress={
        accepting
          ? undefined
          : () => {
              haptics.light();
              onAccept();
            }
      }
      disabled={accepting}
      style={[
        styles.card,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        accepting && styles.cardAccepting,
      ]}
    >
      <View style={styles.cardTop}>
        <Badge
          label={isFood ? 'Food delivery' : 'Ride'}
          tone={isFood ? 'primary' : 'ride'}
          icon={isFood ? 'restaurant-outline' : 'bicycle-outline'}
        />
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
          {accepting ? (
            <ActivityIndicator size="small" color={colors.success} />
          ) : (
            <>
              <AppText variant="title" weight="extraBold" color={colors.success}>
                {formatCurrency(item.payout)}
              </AppText>
              <AppText variant="micro" color={colors.textMuted}>
                payout
              </AppText>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: spacing.m },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  cardAccepting: { opacity: 0.65 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  route: { flexDirection: 'row', gap: spacing.sm },
  routeLine: { alignItems: 'center', width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 22 },
  routeText: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  vehicleIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptRight: { alignItems: 'flex-end' },
});
