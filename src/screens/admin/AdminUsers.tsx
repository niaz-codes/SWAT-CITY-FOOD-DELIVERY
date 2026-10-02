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
import type { AdminUser } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';

export function AdminUsers() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getUsers(), []);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((u) => (role === 'all' ? true : u.role === role))
      .filter((u) => (statusFilter === 'all' ? true : u.status === statusFilter))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.phone.includes(q) || u.email.toLowerCase().includes(q));
  }, [data.data, query, role, statusFilter]);

  const setStatus = async (s: AdminUser['status']) => {
    if (!selected) return;
    setBusy(true);
    await adminApi.setUserStatus(selected.id, s);
    await data.refetch();
    setBusy(false);
    setSelected((cur) => (cur ? { ...cur, status: s } : cur));
    setConfirmSuspend(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Users & Accounts" elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search name, phone or email" />
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.filters}>
            <FilterRow options={['all', 'customer', 'rider', 'admin']} value={role} onChange={setRole} />
            <FilterRow options={['all', 'active', 'suspended', 'deactivated']} value={statusFilter} onChange={setStatusFilter} />
          </View>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="people-outline" title="No users" message="No accounts match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Avatar name={item.name} gradient={item.avatarGradient ?? [colors.primary, colors.ride]} size={46} />
            <View style={styles.rowText}>
              <View style={styles.rowName}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.name}</AppText>
                <Badge label={item.role} tone="neutral" />
              </View>
              <AppText variant="micro" color={colors.textMuted}>{item.phone} · joined {timeAgo(item.joinedAt)}</AppText>
            </View>
            <StatusBadge status={item.status} />
          </Pressable>
        )}
      />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name} subtitle={selected?.phone} height={360}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetMeta}>
              <Avatar name={selected.name} gradient={selected.avatarGradient ?? [colors.primary, colors.ride]} size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium" weight="bold" color={colors.textPrimary}>{selected.name}</AppText>
                <AppText variant="small" color={colors.textMuted}>{selected.email}</AppText>
              </View>
              <StatusBadge status={selected.status} />
            </View>
            <View style={styles.sheetRows}>
              <MetaRow label="Role" value={<Badge label={selected.role} tone="neutral" />} />
              <MetaRow label="Orders" valueText={String(selected.orders)} />
              <MetaRow label="Rides" valueText={String(selected.rides)} />
              <MetaRow label="Wallet" valueText={formatCurrency(selected.walletBalance ?? 0)} />
              <MetaRow label="Joined" valueText={timeAgo(selected.joinedAt)} />
              <MetaRow label="Verified" value={<Badge label={selected.verified ? 'Verified' : 'Unverified'} tone={selected.verified ? 'success' : 'warning'} />} />
            </View>
            {selected.status !== 'active' ? (
              <AppButton label="Re-activate account" onPress={() => setStatus('active')} loading={busy} icon="shield-checkmark-outline" />
            ) : (
              <AppButton label="Suspend account" onPress={() => setConfirmSuspend(true)} variant="danger" loading={busy} icon="remove-circle-outline" />
            )}
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmSuspend}
        title="Suspend this account?"
        message={`${selected?.name ?? ''} will no longer be able to place orders or take rides.`}
        confirmLabel="Suspend"
        tone="danger"
        onConfirm={() => setStatus('suspended')}
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
  filters: { gap: 2 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sheet: { gap: spacing.sm },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetRows: { gap: spacing.xs, paddingVertical: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});