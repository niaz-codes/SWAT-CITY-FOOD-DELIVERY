import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { SearchField, FilterRow, statusLabel } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminPromo, PromoAudience } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';

type PromoType = 'percent' | 'fixed';
type PromoForm = { code: string; type: PromoType; value: string; minOrder: string; maxDiscount: string; audience: PromoAudience; usageLimit: string; active: boolean };

const EMPTY_FORM: PromoForm = { code: '', type: 'percent', value: '', minOrder: '0', maxDiscount: '', audience: 'customers', usageLimit: '100', active: true };

export function AdminPromotions() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getPromotions(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminPromo | null>(null);
  const [form, setForm] = useState<PromoForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const promos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((p) => {
        if (filter === 'all') return true;
        if (filter === 'everyone') return p.audience === 'all';
        return p.audience === filter;
      })
      .filter((p) => !q || p.code.toLowerCase().includes(q));
  }, [data.data, query, filter]);

  const toggle = async (p: AdminPromo) => {
    await adminApi.togglePromo(p.id);
    await data.refetch();
    setSelected((cur) => (cur && cur.id === p.id ? { ...cur, active: !cur.active } : cur));
  };

  const saveForm = async () => {
    if (!form || !form.code.trim() || !form.value) return;
    setBusy(true);
    const days = 30;
    await adminApi.addPromo({
      code: form.code.toUpperCase(),
      type: form.type,
      value: Number(form.value) || 0,
      minOrder: Number(form.minOrder) || 0,
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + days * 24 * 3600 * 1000),
      usageLimit: Number(form.usageLimit) || 0,
      active: form.active,
      audience: form.audience,
    });
    await data.refetch();
    setBusy(false);
    setForm(null);
    setSelected(null);
  };

  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    setConfirmDelete(false);
    await adminApi.deletePromo(selected.id);
    await data.refetch();
    setBusy(false);
    setSelected(null);
  };

  const openAdd = () => {
    setSelected(null);
    setForm({ ...EMPTY_FORM });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Promotions" elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search promo code" />
      <FlatList
        data={promos}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <FilterRow options={['all', 'customers', 'riders', 'everyone']} value={filter} onChange={setFilter} />
            <Pressable onPress={openAdd} style={[styles.addCard, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="add" size={20} color={colors.primaryStrong} />
              <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>Create promo code</AppText>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={74} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="pricetag-outline" title="No promotions" message="Create a promo code to get started." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={styles.promoLeft}>
              <View style={[styles.promoCode, { backgroundColor: colors.primarySoft }]}>
                <AppText variant="title" weight="extraBold" color={colors.primaryStrong}>{item.code}</AppText>
              </View>
            </View>
            <View style={styles.rowText}>
              <View style={styles.rowMeta}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
                  {item.type === 'percent' ? `${item.value}% off` : `Rs ${item.value} off`}
                </AppText>
                <Badge label={statusLabel(item.audience)} tone={item.audience === 'all' ? 'primary' : 'neutral'} />
              </View>
              <AppText variant="micro" color={colors.textMuted}>
                Min order {item.minOrder > 0 ? `Rs ${item.minOrder}` : 'None'} · {Math.max(0, Math.round((item.expiresOn.getTime() - Date.now()) / (24 * 3600 * 1000)))} days left · {item.used}/{item.usageLimit || '∞'} used
              </AppText>
            </View>
            <Badge label={item.active ? 'Active' : 'Paused'} tone={item.active ? 'success' : 'neutral'} />
          </Pressable>
        )}
      />

      <BottomSheet visible={!!selected && !form} onClose={() => setSelected(null)} title={selected?.code} subtitle={selected ? statusLabel(selected.audience) : undefined} height={340}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
                {selected.type === 'percent' ? `${selected.value}% off` : `Rs ${selected.value} off`}
              </AppText>
              <Badge label={selected.active ? 'Active' : 'Paused'} tone={selected.active ? 'success' : 'neutral'} />
            </View>
            <View style={styles.metaBox}>
              <MetaRow label="Minimum order" valueText={selected.minOrder > 0 ? `Rs ${selected.minOrder}` : 'None'} />
              <MetaRow label="Max discount" valueText={selected.maxDiscount ? `Rs ${selected.maxDiscount}` : '—'} />
              <MetaRow label="Audience" valueText={statusLabel(selected.audience)} />
              <MetaRow label="Usage" valueText={`${selected.used} / ${selected.usageLimit || '∞'}`} />
              <MetaRow label="Valid until" valueText={selected.expiresOn.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />
            </View>
            {selected.usageLimit > 0 && (
              <View style={[styles.progress, { backgroundColor: colors.surfaceMuted }]}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (selected.used / selected.usageLimit) * 100)}%`, backgroundColor: selected.used / selected.usageLimit > 0.8 ? colors.warning : colors.primary }]} />
              </View>
            )}
            <View style={styles.actions}>
              <AppButton label={selected.active ? 'Pause promo' : 'Activate promo'} onPress={() => toggle(selected)} variant={selected.active ? 'secondary' : 'primary'} icon={selected.active ? 'pause' : 'play'} loading={busy} />
              <AppButton label="Delete promo" onPress={() => setConfirmDelete(true)} variant="danger" icon="trash-outline" disabled={busy} />
            </View>
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={!!form} onClose={() => { setForm(null); setSelected(null); }} title="Create promo code" height={560}>
        {form && (
          <View style={styles.sheet}>
            <AppInput label="Code (auto-uppercase)" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} placeholder="FRESH20" />
            <View style={styles.formRow}>
              <AppInput label="Value" value={form.value} onChangeText={(v) => setForm({ ...form, value: v })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              <AppInput label="Type" value={form.type === 'percent' ? '% off' : 'Rs off'} onChangeText={() => {}} editable={false} containerStyle={{ flex: 1 }} />
            </View>
            <Pressable onPress={() => setForm({ ...form, type: form.type === 'percent' ? 'fixed' : 'percent' })} style={[styles.typeToggle, { backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="small" color={colors.textSecondary}>Discount type</AppText>
              <Badge label={form.type === 'percent' ? 'Percentage' : 'Fixed amount'} tone="primary" />
            </Pressable>
            <View style={styles.formRow}>
              <AppInput label="Min order (Rs)" value={form.minOrder} onChangeText={(v) => setForm({ ...form, minOrder: v })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              <AppInput label="Max discount (Rs)" value={form.maxDiscount} onChangeText={(v) => setForm({ ...form, maxDiscount: v })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
            </View>
            <View style={styles.formRow}>
              <AppInput label="Usage limit" value={form.usageLimit} onChangeText={(v) => setForm({ ...form, usageLimit: v })} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              <Pressable onPress={() => setForm({ ...form, audience: form.audience === 'all' ? 'customers' : form.audience === 'customers' ? 'riders' : 'all' })} style={[styles.typeToggle, { backgroundColor: colors.surfaceMuted, flex: 1 }]}>
                <AppText variant="small" color={colors.textSecondary}>Audience</AppText>
                <Badge label={statusLabel(form.audience)} tone="neutral" />
              </Pressable>
            </View>
            <View style={styles.availRow}>
              <View>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>Active immediately</AppText>
                <AppText variant="micro" color={colors.textMuted}>30-day expiry from creation</AppText>
              </View>
              <Switch value={form.active} onValueChange={(v) => setForm({ ...form, active: v })} trackColor={{ false: colors.surfaceMuted, true: colors.successSoft }} thumbColor={form.active ? colors.success : colors.textMuted} />
            </View>
            <AppButton label="Create promo" onPress={saveForm} loading={busy} icon="checkmark" />
          </View>
        )}
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this promo?"
        message={`Promo code ${selected?.code ?? ''} will be removed and can no longer be used.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

function MetaRow({ label, valueText }: { label: string; valueText: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <AppText variant="small" color={colors.textMuted}>{label}</AppText>
      <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{valueText}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  addCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.lg, padding: spacing.sm, marginTop: spacing.s },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  promoLeft: {},
  promoCode: { paddingHorizontal: spacing.sm, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  sheet: { gap: spacing.s },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaBox: { gap: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  actions: { gap: spacing.s, marginTop: spacing.xs },
  formRow: { flexDirection: 'row', gap: spacing.s },
  typeToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.md, paddingHorizontal: spacing.m, paddingVertical: spacing.sm },
  availRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
});