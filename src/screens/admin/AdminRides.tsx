import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { StatusBadge, SearchField, FilterRow } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminRide } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, formatDistance, timeAgo } from '../../utils/format';

export function AdminRides() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getRides(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminRide | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const rides = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((r) => (filter === 'all' ? true : r.status === filter))
      .filter((r) => !q || r.id.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q) || r.rider?.toLowerCase().includes(q) || r.pickup.toLowerCase().includes(q));
  }, [data.data, query, filter]);

  const setStatus = async (id: string, status: AdminRide['status']) => {
    setBusy(true);
    await adminApi.setRideStatus(id, status);
    await data.refetch();
    setBusy(false);
    setSelected((cur) => (cur && cur.id === id ? { ...cur, status } : cur));
    setConfirmCancel(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Ride Bookings" elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search ride, customer or rider" />
      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<FilterRow options={['all', 'searching', 'arriving', 'started', 'completed', 'cancelled']} value={filter} onChange={setFilter} />}
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={82} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="car-outline" title="No rides" message="No ride bookings match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>{item.id}</AppText>
              <StatusBadge status={item.status} />
            </View>
            <AppText variant="small" color={colors.textSecondary} numberOfLines={1}>{item.pickup} → {item.dropoff}</AppText>
            <View style={styles.rowBottom}>
              <View style={styles.typeRow}>
                <Badge label={item.rideType} tone="primary" />
                <AppText variant="micro" color={colors.textMuted}>{formatDistance(item.distanceKm)} · {timeAgo(item.bookedAt)}</AppText>
              </View>
              <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(item.fare)}</AppText>
            </View>
          </Pressable>
        )}
      />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.id} subtitle={selected ? `${selected.customer} · ${selected.rideType}` : undefined} height={380}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <StatusBadge status={selected.status} />
              <AppText variant="small" color={colors.textMuted}>{selected.rider ? `Rider: ${selected.rider}` : 'No rider assigned'}</AppText>
            </View>
            <View style={styles.metaBox}>
              <MetaRow label="Pickup" valueText={selected.pickup} />
              <MetaRow label="Dropoff" valueText={selected.dropoff} />
              <MetaRow label="Distance" valueText={formatDistance(selected.distanceKm)} />
              <MetaRow label="Fare" valueText={formatCurrency(selected.fare)} />
              <MetaRow label="Booked" valueText={timeAgo(selected.bookedAt)} />
              {selected.completedAt && <MetaRow label="Completed" valueText={timeAgo(selected.completedAt)} />}
            </View>
            <View style={styles.actions}>
              {['completed', 'cancelled'].includes(selected.status) ? (
                <View style={styles.doneRow}>
                  <Ionicons name={selected.status === 'completed' ? 'checkmark-circle' : 'close-circle'} size={18} color={selected.status === 'completed' ? colors.success : colors.danger} />
                  <AppText variant="smallMedium" weight="bold" color={selected.status === 'completed' ? colors.success : colors.danger}>
                    Ride {selected.status}
                  </AppText>
                </View>
              ) : (
                <>
                  {selected.status === 'searching' && <AppButton label="Cancel ride" onPress={() => setConfirmCancel(true)} variant="danger" icon="close" />}
                  <View style={styles.actionRow}>
                    <AppButton label="Mark arrived" onPress={() => setStatus(selected.id, 'arriving')} variant="soft" icon="navigate-outline" style={{ flex: 1 }} />
                    <AppButton label="Complete" onPress={() => setStatus(selected.id, 'completed')} icon="checkmark" style={{ flex: 1 }} />
                  </View>
                </>
              )}
            </View>
            {busy && <AppText variant="micro" color={colors.textMuted} center>Updating…</AppText>}
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmCancel}
        title="Cancel this ride?"
        message={`Ride ${selected?.id ?? ''} will be cancelled.`}
        confirmLabel="Cancel ride"
        tone="danger"
        onConfirm={() => selected && setStatus(selected.id, 'cancelled')}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  );
}

function MetaRow({ label, valueText }: { label: string; valueText: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <AppText variant="small" color={colors.textMuted} style={{ minWidth: 76 }}>{label}</AppText>
      <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} style={{ flex: 1 }} numberOfLines={2}>{valueText}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  rowCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.m, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sheet: { gap: spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaBox: { gap: spacing.xs, paddingVertical: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { gap: spacing.s, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.s },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.s },
});