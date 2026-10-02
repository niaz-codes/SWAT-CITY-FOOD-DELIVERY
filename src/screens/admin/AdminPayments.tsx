import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { StatusBadge, SearchField, FilterRow, StatCard } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminPayment } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';

export function AdminPayments() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getPayments(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminPayment | null>(null);

  const payments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((p) => (filter === 'all' ? true : p.status === filter))
      .filter((p) => !q || p.user.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }, [data.data, query, filter]);

  const totals = useMemo(() => {
    const list = data.data ?? [];
    return {
      collected: list.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      pending: list.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
      refunded: list.filter((p) => p.status === 'refunded').reduce((s, p) => s + p.amount, 0),
      failed: list.filter((p) => p.status === 'failed').reduce((s, p) => s + p.amount, 0),
    };
  }, [data.data]);

  const methodTone = (m: string) => ({ wallet: 'primary', card: 'ride', cash: 'success', jazzcash: 'warning' } as Record<string, 'primary' | 'ride' | 'success' | 'warning'>)[m] ?? 'neutral';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Payments" elevated />
      <View style={styles.summary}>
        <StatCard icon="cash-outline" label="Collected" value={formatCurrency(totals.collected)} accent="success" />
        <StatCard icon="time-outline" label="Pending" value={formatCurrency(totals.pending)} accent="warning" />
        <StatCard icon="arrow-undo-outline" label="Refunded" value={formatCurrency(totals.refunded)} accent="info" />
        <StatCard icon="alert-circle-outline" label="Failed" value={formatCurrency(totals.failed)} accent="danger" />
      </View>
      <SearchField value={query} onChange={setQuery} placeholder="Search user or reference" />
      <FlatList
        data={payments}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<FilterRow options={['all', 'paid', 'pending', 'refunded', 'failed']} value={filter} onChange={setFilter} />}
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={66} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="card-outline" title="No payments" message="No payments match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={styles.rowText}>
              <View style={styles.rowName}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.user}</AppText>
                <Badge label={item.method} tone={methodTone(item.method)} />
              </View>
              <AppText variant="micro" color={colors.textMuted}>{item.id} · {item.ref} · {timeAgo(item.at)}</AppText>
            </View>
            <View style={styles.rowRight}>
              <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(item.amount)}</AppText>
              <StatusBadge status={item.status} />
            </View>
          </Pressable>
        )}
      />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.id} subtitle={selected?.user} height={300}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <StatusBadge status={selected.status} />
              <AppText variant="title" weight="extraBold" color={colors.textPrimary}>{formatCurrency(selected.amount)}</AppText>
            </View>
            <View style={styles.metaBox}>
              <MetaRow label="Reference" valueText={selected.ref} />
              <MetaRow label="Method" value={<Badge label={selected.method} tone={methodTone(selected.method)} />} />
              <MetaRow label="Role" value={<Badge label={selected.role} tone="neutral" />} />
              <MetaRow label="Time" valueText={timeAgo(selected.at)} />
            </View>
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <AppText variant="small" color={colors.textSecondary} style={{ flex: 1 }}>Auto-reconciliation is enabled for wallet and card transactions.</AppText>
            </View>
          </View>
        )}
      </BottomSheet>
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
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.m, paddingTop: spacing.s },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  sheet: { gap: spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaBox: { gap: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  note: { flexDirection: 'row', gap: spacing.s, alignItems: 'flex-start', padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(127,127,127,0.08)' },
});