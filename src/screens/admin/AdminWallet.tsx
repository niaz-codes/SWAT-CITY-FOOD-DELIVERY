import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Badge } from '../../components/Badge';
import { SearchField, FilterRow, StatCard, statusLabel } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminWalletTx } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';

const KIND_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'danger' | 'warning' | 'info' | 'primary' }> = {
  credit: { icon: 'add-circle-outline', tone: 'success' },
  debit: { icon: 'remove-circle-outline', tone: 'danger' },
  earning: { icon: 'trending-up-outline', tone: 'success' },
  refund: { icon: 'arrow-undo-outline', tone: 'info' },
  commission: { icon: 'pie-chart-outline', tone: 'warning' },
};

export function AdminWallet() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getWalletOverview(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const txs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data?.transactions ?? [])
      .filter((t) => (filter === 'all' ? true : t.kind === filter))
      .filter((t) => !q || t.user.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
  }, [data.data, filter, query]);

  const overview = data.data;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Wallets" elevated />
      <View style={styles.summary}>
        <StatCard icon="people-outline" label="Customer balance" value={formatCurrency(overview?.customerBalance ?? 0)} accent="success" />
        <StatCard icon="bicycle-outline" label="Rider balance" value={formatCurrency(overview?.riderBalance ?? 0)} accent="ride" />
        <StatCard icon="pie-chart-outline" label="Platform commission" value={formatCurrency(overview?.platformCommission ?? 0)} accent="warning" />
      </View>
      <SearchField value={query} onChange={setQuery} placeholder="Search user or description" />
      <FlatList
        data={txs}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<FilterRow options={['all', 'credit', 'debit', 'earning', 'refund', 'commission']} value={filter} onChange={setFilter} />}
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={66} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="wallet-outline" title="No transactions" message="No wallet transactions match your filters." />
          )
        }
        renderItem={({ item }) => <TxRow item={item} />}
      />
    </View>
  );
}

function TxRow({ item }: { item: AdminWalletTx }) {
  const { colors } = useThemeColors();
  const meta = KIND_ICON[item.kind] ?? KIND_ICON.credit!;
  const credit = item.kind === 'credit' || item.kind === 'earning' || item.kind === 'refund';
  const soft = { primary: colors.primarySoft, success: colors.successSoft, danger: colors.dangerSoft, warning: colors.warningSoft, info: colors.rideSoft }[meta.tone];
  const fg = { primary: colors.primary, success: colors.success, danger: colors.danger, warning: colors.warning, info: colors.info }[meta.tone];
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={[styles.txIcon, { backgroundColor: soft }]}>
        <Ionicons name={meta.icon} size={18} color={fg} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.title}</AppText>
        <AppText variant="micro" color={colors.textMuted}>{item.user} · {timeAgo(item.at)}</AppText>
      </View>
      <View style={styles.rowRight}>
        <AppText variant="smallMedium" weight="bold" color={credit ? colors.success : colors.textPrimary}>
          {credit ? '+' : '−'}{formatCurrency(item.amount)}
        </AppText>
        <Badge label={statusLabel(item.kind)} tone={meta.tone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.m, paddingTop: spacing.s },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  txIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
});