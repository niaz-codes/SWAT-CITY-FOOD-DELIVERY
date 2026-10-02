import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { Badge } from '../../components/Badge';
import { SearchField, FilterRow } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminMenuItem } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';

type ItemForm = { name: string; restaurant: string; category: string; price: string; discount: string; emoji: string; available: boolean };

const EMPTY_FORM: ItemForm = { name: '', restaurant: '', category: '', price: '', discount: '0', emoji: '🍴', available: true };

export function AdminMenu() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getMenu(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminMenuItem | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((m) => (filter === 'all' ? true : filter === 'available' ? m.available : !m.available))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.restaurant.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [data.data, query, filter]);

  const toggleAvailable = async (m: AdminMenuItem) => {
    setBusy(true);
    await adminApi.setMenuItem(m.id, { available: !m.available });
    await data.refetch();
    setBusy(false);
    setSelected((cur) => (cur && cur.id === m.id ? { ...cur, available: !cur.available } : cur));
  };

  const saveForm = async () => {
    if (!form || !form.name.trim() || !form.price) return;
    const payload = { name: form.name, restaurant: form.restaurant || 'General', category: form.category || 'Other', price: Number(form.price) || 0, discount: Number(form.discount) || 0, available: form.available, active: form.available, emoji: form.emoji || '🍴' };
    // keep gradient from selected for edits
    setBusy(true);
    if (selected) await adminApi.setMenuItem(selected.id, payload as Partial<AdminMenuItem>);
    else await adminApi.addMenuItem(payload as Omit<AdminMenuItem, 'id' | 'rating'>);
    await data.refetch();
    setBusy(false);
    setForm(null);
    setSelected(null);
    if (selected) setSelected({ ...selected, ...payload });
  };

  const deleteItem = async () => {
    if (!selected) return;
    setBusy(true);
    setConfirmDelete(false);
    await adminApi.deleteMenuItem(selected.id);
    await data.refetch();
    setBusy(false);
    setSelected(null);
  };

  const openForm = (m: AdminMenuItem | null) => {
    setSelected(m);
    setForm(m ? { name: m.name, restaurant: m.restaurant, category: m.category, price: String(m.price), discount: String(m.discount), emoji: m.emoji, available: m.available } : { ...EMPTY_FORM });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Food / Menu" elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search item, restaurant or category" />
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <FilterRow options={['all', 'available', 'hidden']} value={filter} onChange={setFilter} />
            <Pressable onPress={() => openForm(null)} style={[styles.addCard, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="add" size={20} color={colors.primaryStrong} />
              <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>Add menu item</AppText>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={76} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="fast-food-outline" title="No items" message="No menu items match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openForm(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={[styles.emojiWrap, { backgroundColor: 'rgba(127,127,127,0.12)' }]}><AppText variant="title">{item.emoji}</AppText></View>
            <View style={styles.rowText}>
              <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.name}</AppText>
              <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>{item.restaurant} · {item.category}</AppText>
              <View style={styles.priceRow}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(item.price)}</AppText>
                {item.discount > 0 && <Badge label={`${item.discount}% off`} tone="success" />}
                {!item.available && <Badge label="Hidden" tone="neutral" icon="eye-off-outline" />}
              </View>
            </View>
            <Switch
              value={item.available}
              onValueChange={() => toggleAvailable(item)}
              disabled={busy}
              trackColor={{ false: colors.surfaceMuted, true: colors.successSoft }}
              thumbColor={item.available ? colors.success : colors.textMuted}
            />
          </Pressable>
        )}
      />

      <BottomSheet visible={!!form} onClose={() => { setForm(null); setSelected(null); }} title={selected ? 'Edit item' : 'Add menu item'} height={470}>
        {form && (
          <View style={styles.sheet}>
            <AppInput label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Chicken Karahi (Half)" />
            <AppInput label="Restaurant" value={form.restaurant} onChangeText={(v) => setForm({ ...form, restaurant: v })} placeholder="Swat Grill House" />
            <View style={styles.formRow}>
              <AppInput label="Category" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="Karahi" containerStyle={{ flex: 1 }} />
              <AppInput label="Emoji" value={form.emoji} onChangeText={(v) => setForm({ ...form, emoji: v || '🍴' })} containerStyle={{ flex: 1 }} />
            </View>
            <View style={styles.formRow}>
              <AppInput label="Price (Rs)" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              <AppInput label="Discount %" value={form.discount} onChangeText={(v) => setForm({ ...form, discount: v })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
            </View>
            <View style={styles.availRow}>
              <View>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>Available</AppText>
                <AppText variant="micro" color={colors.textMuted}>Visible to customers</AppText>
              </View>
              <Switch value={form.available} onValueChange={(v) => setForm({ ...form, available: v })} trackColor={{ false: colors.surfaceMuted, true: colors.successSoft }} thumbColor={form.available ? colors.success : colors.textMuted} />
            </View>
            <View style={styles.actionRow}>
              <AppButton label={selected ? 'Save changes' : 'Add item'} onPress={saveForm} loading={busy} icon="checkmark" style={{ flex: 1 }} />
              {selected && <AppButton label="" onPress={() => setConfirmDelete(true)} variant="danger" icon="trash-outline" disabled={busy} style={styles.deleteBtn} />}
            </View>
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this item?"
        message={`"${selected?.name ?? ''}" will be permanently removed from the menu.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={deleteItem}
        onCancel={() => setConfirmDelete(false)}
      />
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
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  sheet: { gap: spacing.s },
  formRow: { flexDirection: 'row', gap: spacing.s },
  availRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.xs },
  deleteBtn: { width: 54 },
});