import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { StatusBadge, SearchField, FilterRow, statusLabel } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminOrder, AdminOrderStatus } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';

const FILTERS = ['all', 'placed', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'];

const NEXT: Partial<Record<AdminOrderStatus, AdminOrderStatus>> = {
  placed: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'on_the_way',
  on_the_way: 'delivered',
};

const CANCELABLE: AdminOrderStatus[] = ['placed', 'confirmed', 'preparing', 'ready'];

export function AdminOrders({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getOrders(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const orders = useMemo(() => {
    const list = data.data ?? [];
    return list
      .filter((o) => (filter === 'all' ? true : o.status === filter))
      .filter((o) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.restaurant.toLowerCase().includes(q);
      })
      .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
  }, [data.data, filter, query]);

  const advance = async (o: AdminOrder) => {
    const next = NEXT[o.status];
    if (!next) return;
    setBusyId(o.id);
    await adminApi.setOrderStatus(o.id, next);
    await data.refetch();
    setBusyId(null);
  };

  const cancel = async () => {
    if (!selected) return;
    setBusyId(selected.id);
    setConfirmCancel(false);
    await adminApi.setOrderStatus(selected.id, 'cancelled');
    await data.refetch();
    setBusyId(null);
    setSelected((s) => (s ? { ...s, status: 'cancelled' } : s));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Orders" hideBack={embedded} elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search order, customer or restaurant" />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<FilterRow options={FILTERS} value={filter} onChange={setFilter} />}
        ListEmptyComponent={data.loading ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={86} rounded={16} />
            ))}
          </View>
        ) : (
          <EmptyState icon="receipt-outline" title="No orders" message="No orders match your filters yet." />
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>{item.id}</AppText>
              <StatusBadge status={item.status} />
            </View>
            <AppText variant="small" color={colors.textSecondary} numberOfLines={1}>{item.customer} · {item.restaurant}</AppText>
            <View style={styles.rowBottom}>
              <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(item.total)}</AppText>
              <AppText variant="micro" color={colors.textMuted}>{item.items.length} item{item.items.length === 1 ? '' : 's'} · {timeAgo(item.placedAt)}</AppText>
            </View>
          </Pressable>
        )}
      />

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.id}
        subtitle={selected ? `${selected.customer} · ${selected.restaurant}` : undefined}
        height={440}
      >
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <StatusBadge status={selected.status} />
              <AppText variant="small" color={colors.textMuted}>{selected.paymentMethod.toUpperCase()} · {statusLabel(selected.paymentStatus)}</AppText>
            </View>
            <View style={styles.sheetCard}>
              {selected.items.map((it, i) => (
                <View key={i} style={styles.itemRow}>
                  <AppText variant="small" color={colors.textSecondary} style={styles.itemName} numberOfLines={1}>{it.quantity}× {it.name}</AppText>
                  <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(it.price * it.quantity)}</AppText>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.itemRow}>
                <AppText variant="small" color={colors.textMuted}>Delivery fee</AppText>
                <AppText variant="small" color={colors.textMuted}>{selected.deliveryFee === 0 ? 'Free' : formatCurrency(selected.deliveryFee)}</AppText>
              </View>
              <View style={styles.itemRow}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>Total</AppText>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(selected.total)}</AppText>
              </View>
            </View>
            <AppText variant="small" color={colors.textSecondary}>{selected.address}</AppText>
            {selected.rider ? (
              <AppText variant="small" color={colors.textMuted}>Rider: {selected.rider}</AppText>
            ) : (
              <AppText variant="small" color={colors.warning}>No rider assigned yet</AppText>
            )}

            <View style={styles.sheetActions}>
              {NEXT[selected.status] && (
                <AppButton
                  label={`Mark ${statusLabel(NEXT[selected.status]!)}`}
                  onPress={() => advance(selected)}
                  loading={busyId === selected.id}
                  icon="arrow-forward"
                  iconPosition="right"
                  style={styles.actionBtn}
                />
              )}
              {CANCELABLE.includes(selected.status) && (
                <AppButton
                  label="Cancel order"
                  onPress={() => setConfirmCancel(true)}
                  variant="danger"
                  disabled={busyId === selected.id}
                  style={CANCELABLE.includes(selected.status) && NEXT[selected.status] ? styles.actionBtnHalf : styles.actionBtn}
                />
              )}
              {selected.status === 'delivered' && (
                <View style={styles.doneRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <AppText variant="smallMedium" weight="bold" color={colors.success}>Order delivered</AppText>
                </View>
              )}
              {selected.status === 'cancelled' && (
                <View style={styles.doneRow}>
                  <Ionicons name="close-circle" size={18} color={colors.danger} />
                  <AppText variant="smallMedium" weight="bold" color={colors.danger}>Order cancelled</AppText>
                </View>
              )}
            </View>
            {busyId === selected.id && <ActivityIndicator color={colors.primary} style={styles.sheetSpinner} />}
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmCancel}
        title="Cancel this order?"
        message={`Order ${selected?.id ?? ''} will be cancelled${selected?.paymentMethod === 'wallet' || selected?.paymentStatus === 'paid' ? ' and the payment refunded to the customer' : ''}.`}
        confirmLabel="Cancel order"
        tone="danger"
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
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
  sheet: { gap: spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetCard: { backgroundColor: 'transparent', gap: spacing.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.m },
  itemName: { flex: 1 },
  divider: { height: 1, backgroundColor: 'rgba(127,127,127,0.14)', marginVertical: spacing.xs },
  sheetActions: { gap: spacing.s, marginTop: spacing.xs },
  actionBtn: { width: '100%' },
  actionBtnHalf: { flex: 1 },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.s },
  sheetSpinner: { marginTop: spacing.s },
});