import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { StatusBadge, SearchField, FilterRow } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminRider } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';

export function AdminRiders() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getRiders(), []);
  const [query, setQuery] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const [selected, setSelected] = useState<AdminRider | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const riders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((r) => (appFilter === 'all' ? true : r.applicationStatus === appFilter))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.plateNumber.toLowerCase().includes(q));
  }, [data.data, query, appFilter]);

  const verify = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    await adminApi.verifyRider(selected.id, approve);
    await data.refetch();
    setBusy(false);
    const next: 'approved' | 'rejected' = approve ? 'approved' : 'rejected';
    setSelected((cur) => (cur ? { ...cur, applicationStatus: next } : cur));
  };

  const toggleSuspend = async () => {
    if (!selected) return;
    setBusy(true);
    const next = selected.status === 'active' ? 'suspended' : 'active';
    await adminApi.setUserStatus(selected.id, next);
    await data.refetch();
    setBusy(false);
    setSelected((cur) => (cur ? { ...cur, status: next } : cur));
    setConfirmSuspend(false);
  };

  const pendingCount = riders.filter((r) => r.applicationStatus === 'pending').length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Riders${pendingCount ? ` · ${pendingCount} pending` : ''}`} elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search rider, phone or plate" />
      <FlatList
        data={riders}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<FilterRow options={['all', 'pending', 'approved', 'rejected']} value={appFilter} onChange={setAppFilter} />}
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={84} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="bicycle-outline" title="No riders" message="No riders match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Avatar name={item.name} gradient={item.avatarGradient ?? [colors.ride, colors.primary]} size={48} />
            <View style={styles.rowText}>
              <View style={styles.rowName}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.name}</AppText>
                {item.applicationStatus === 'pending' && <Badge label="Pending" tone="warning" icon="hourglass-outline" />}
              </View>
              <AppText variant="micro" color={colors.textMuted}>{item.vehicle} · {item.plateNumber}</AppText>
              <AppText variant="micro" color={colors.textSecondary}>{item.deliveries} deliveries · {formatCurrency(item.earnings)} earned</AppText>
            </View>
            <StatusBadge status={item.applicationStatus} />
          </Pressable>
        )}
      />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name} subtitle={selected ? `${selected.vehicle} · ${selected.plateNumber}` : undefined} height={420}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetMeta}>
              <Avatar name={selected.name} gradient={selected.avatarGradient ?? [colors.ride, colors.primary]} size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium" weight="bold" color={colors.textPrimary}>{selected.name}</AppText>
                <AppText variant="small" color={colors.textMuted}>{selected.phone}</AppText>
              </View>
              <StatusBadge status={selected.applicationStatus} />
            </View>

            <View style={styles.sheetRows}>
              <MetaRow label="Account" value={<Badge label={selected.status} tone={selected.status === 'active' ? 'success' : 'danger'} />} />
              <MetaRow label="Online" value={<Badge label={selected.riderStatus} tone={selected.riderStatus === 'online' ? 'success' : 'neutral'} />} />
              <MetaRow label="Documents" value={<Badge label={selected.docStatus} tone={selected.docStatus === 'verified' ? 'success' : selected.docStatus === 'pending' ? 'warning' : 'danger'} />} />
              <MetaRow label="Rating" valueText={`★ ${selected.rating || '—'}`} />
              <MetaRow label="Deliveries" valueText={String(selected.deliveries)} />
              <MetaRow label="Earnings" valueText={formatCurrency(selected.earnings)} />
              <MetaRow label="Wallet" valueText={formatCurrency(selected.walletBalance ?? 0)} />
              <MetaRow label="Joined" valueText={timeAgo(selected.joinedAt)} />
            </View>

            <View style={styles.actions}>
              {selected.applicationStatus === 'pending' && (
                <View style={styles.actionRow}>
                  <AppButton label="Approve" onPress={() => verify(true)} loading={busy} icon="checkmark" style={{ flex: 1 }} />
                  <AppButton label="Reject" onPress={() => verify(false)} variant="danger" icon="close" style={{ flex: 1 }} />
                </View>
              )}
              {selected.applicationStatus === 'approved' && (
                <AppButton label={selected.status === 'active' ? 'Suspend rider' : 'Re-activate rider'} onPress={() => setConfirmSuspend(true)} variant={selected.status === 'active' ? 'danger' : 'primary'} loading={busy} />
              )}
              {selected.applicationStatus === 'rejected' && (
                <AppButton label="Reconsider application" onPress={() => verify(true)} variant="secondary" icon="refresh-outline" loading={busy} />
              )}
            </View>
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmSuspend}
        title={selected?.status === 'active' ? 'Suspend this rider?' : 'Re-activate this rider?'}
        message={selected?.status === 'active' ? 'The rider will not be able to go online or accept deliveries.' : 'The rider will regain access to accept deliveries.'}
        confirmLabel={selected?.status === 'active' ? 'Suspend' : 'Re-activate'}
        tone={selected?.status === 'active' ? 'danger' : 'primary'}
        onConfirm={toggleSuspend}
        onCancel={() => setConfirmSuspend(false)}
      />
    </View>
  );
}

function MetaRow({ label, value, valueText }: { label: string; value?: React.ReactNode; valueText?: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <AppText variant="small" color={colors.textMuted}>{label}</AppText>
      {value ?? <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{valueText}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sheet: { gap: spacing.sm },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetRows: { gap: spacing.xs, paddingVertical: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: spacing.s, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.s },
});