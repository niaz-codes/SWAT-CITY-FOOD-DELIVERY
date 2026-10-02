import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { StatusBadge, SearchField, FilterRow } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminRestaurant, RestaurantStatus } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { timeAgo } from '../../utils/format';

type Form = Omit<AdminRestaurant, 'id' | 'rating' | 'menuCount' | 'joinedAt'>;

const EMPTY_FORM: Form = {
  name: '',
  owner: '',
  ownerPhone: '',
  category: '',
  location: '',
  status: 'pending',
  deliveryKM: 1.5,
  gradient: ['#B05E1F', '#54250A'],
  emoji: '🍽️',
};

export function AdminRestaurants() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getRestaurants(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminRestaurant | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const restaurants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((r) => (filter === 'all' ? true : r.status === filter))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.location.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  }, [data.data, query, filter]);

  const pendingCount = restaurants.filter((r) => r.status === 'pending').length;

  const setStatus = async (id: string, status: RestaurantStatus) => {
    setBusy(true);
    await adminApi.setRestaurantStatus(id, status);
    await data.refetch();
    setBusy(false);
    setSelected((cur) => (cur && cur.id === id ? { ...cur, status } : cur));
  };

  const saveForm = async () => {
    if (!form || !form.name.trim()) return;
    setBusy(true);
    if (selected) await adminApi.updateRestaurant(selected.id, form);
    else await adminApi.addRestaurant(form);
    await data.refetch();
    setBusy(false);
    setForm(null);
    setSelected(null);
    setConfirmReject(false);
    setConfirmSuspend(false);
  };

  const openEdit = (r: AdminRestaurant) => {
    setSelected(r);
    setForm({
      name: r.name,
      owner: r.owner,
      ownerPhone: r.ownerPhone,
      category: r.category,
      location: r.location,
      status: r.status,
      deliveryKM: r.deliveryKM,
      gradient: r.gradient,
      emoji: r.emoji,
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Restaurants${pendingCount ? ` · ${pendingCount} pending` : ''}`} elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search restaurant or owner" />
      <FlatList
        data={restaurants}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <FilterRow options={['all', 'approved', 'pending', 'suspended', 'rejected']} value={filter} onChange={setFilter} />
            <Pressable onPress={() => { setSelected(null); setForm({ ...EMPTY_FORM }); }} style={[styles.addCard, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="add" size={20} color={colors.primaryStrong} />
              <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>Add restaurant</AppText>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={84} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="restaurant-outline" title="No restaurants" message="No restaurants match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openEdit(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={[styles.emojiWrap, { backgroundColor: 'rgba(127,127,127,0.12)' }]}><AppText variant="title">{item.emoji}</AppText></View>
            <View style={styles.rowText}>
              <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.name}</AppText>
              <AppText variant="micro" color={colors.textMuted}>{item.category} · {item.location}</AppText>
              <AppText variant="micro" color={colors.textSecondary}>★ {item.rating || '—'} · {item.menuCount} items · {item.deliveryKM} km</AppText>
            </View>
            <StatusBadge status={item.status} />
          </Pressable>
        )}
      />

      <BottomSheet visible={!!form} onClose={() => { setForm(null); setSelected(null); }} title={selected ? 'Edit restaurant' : 'Add restaurant'} height={520}>
        {form && (
          <View style={styles.sheet}>
            <AppText variant="title">{form.emoji}</AppText>
            <AppInput label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Swat Cafe" />
            <AppInput label="Owner" value={form.owner} onChangeText={(v) => setForm({ ...form, owner: v })} placeholder="Owner name" />
            <AppInput label="Owner phone" value={form.ownerPhone} onChangeText={(v) => setForm({ ...form, ownerPhone: v })} keyboardType="phone-pad" />
            <AppInput label="Category" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="BBQ & Karahi" />
            <AppInput label="Location" value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} placeholder="Main Mingora Road" />
            <View style={styles.formRow}>
              <AppInput label="Delivery km" value={String(form.deliveryKM)} onChangeText={(v) => setForm({ ...form, deliveryKM: Number(v) || 0 })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              <AppInput label="Emoji" value={form.emoji} onChangeText={(v) => setForm({ ...form, emoji: v || '🍽️' })} containerStyle={{ flex: 1 }} />
            </View>
            <AppButton label={selected ? 'Save changes' : 'Add restaurant'} onPress={saveForm} loading={busy} icon="checkmark" />
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={!!selected && !form} onClose={() => setSelected(null)} title={selected?.name} subtitle={selected?.category} height={330}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <StatusBadge status={selected.status} />
              <AppText variant="small" color={colors.textMuted}>joined {timeAgo(selected.joinedAt)}</AppText>
            </View>
            <View style={styles.metaBox}>
              <MetaRow label="Owner" valueText={selected.owner} />
              <MetaRow label="Phone" valueText={selected.ownerPhone} />
              <MetaRow label="Location" valueText={selected.location} />
              <MetaRow label="Delivery km" valueText={`${selected.deliveryKM} km`} />
              <MetaRow label="Menu items" valueText={String(selected.menuCount)} />
              <MetaRow label="Rating" valueText={`★ ${selected.rating || '—'}`} />
            </View>
            <View style={styles.actions}>
              {(selected.status === 'pending' || selected.status === 'rejected') && (
                <View style={styles.actionRow}>
                  <AppButton label="Approve" onPress={() => setStatus(selected.id, 'approved')} icon="checkmark" style={{ flex: 1 }} />
                  <AppButton label="Reject" onPress={() => setConfirmReject(true)} variant="danger" icon="close" style={{ flex: 1 }} />
                </View>
              )}
              {selected.status === 'approved' && (
                <AppButton label="Suspend restaurant" onPress={() => setConfirmSuspend(true)} variant="danger" icon="remove-circle-outline" />
              )}
              {selected.status === 'suspended' && (
                <AppButton label="Re-activate" onPress={() => setStatus(selected.id, 'approved')} variant="primary" icon="refresh-outline" />
              )}
              <AppButton label="Edit details" onPress={() => openEdit(selected)} variant="secondary" icon="create-outline" />
            </View>
            {busy && <ActivityDots />}
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmReject}
        title="Reject this restaurant?"
        message={`${selected?.name ?? ''} will be marked as rejected and won't appear in the app.`}
        confirmLabel="Reject"
        tone="danger"
        onConfirm={() => selected && setStatus(selected.id, 'rejected')}
        onCancel={() => setConfirmReject(false)}
      />
      <ConfirmationDialog
        visible={confirmSuspend}
        title="Suspend this restaurant?"
        message="The restaurant will be hidden from customers until re-activated."
        confirmLabel="Suspend"
        tone="danger"
        onConfirm={() => selected && setStatus(selected.id, 'suspended')}
        onCancel={() => setConfirmSuspend(false)}
      />
    </View>
  );
}

function ActivityDots() {
  const { colors } = useThemeColors();
  return <AppText variant="micro" color={colors.textMuted} center>Updating…</AppText>;
}

function MetaRow({ label, valueText }: { label: string; valueText: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <AppText variant="small" color={colors.textMuted}>{label}</AppText>
      <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{valueText}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  addCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.lg, padding: spacing.sm, marginTop: spacing.s },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  emojiWrap: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  sheet: { gap: spacing.s },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formRow: { flexDirection: 'row', gap: spacing.s },
  metaBox: { gap: spacing.xs, paddingVertical: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.m },
  actions: { gap: spacing.s, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.s },
});