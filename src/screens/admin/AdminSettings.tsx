import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { SectionLabel } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { adminApi } from '../../services/admin';
import type { AdminSettings } from '../../types/admin';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';

export function AdminSettingsScreen() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    adminApi.getSettings().then((s) => mounted && setSettings(s));
    return () => {
      mounted = false;
    };
  }, []);

  const patch = (p: Partial<AdminSettings>) => setSettings((s) => (s ? { ...s, ...p } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const updated = await adminApi.updateSettings({ ...settings });
    setSettings(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Settings" hideBack elevated />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        {!settings ? (
          <View style={styles.loadBlock}>
            <Skeleton height={140} rounded={18} />
            <Skeleton height={140} rounded={18} />
          </View>
        ) : (
          <>
            <SectionLabel label="Fares & fees" />
            <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <AppInput label="Delivery fee (Rs)" value={String(settings.deliveryFee)} onChangeText={(v) => patch({ deliveryFee: Number(v) || 0 })} keyboardType="numeric" />
              <AppInput label="Ride base fare (Rs)" value={String(settings.rideBaseFare)} onChangeText={(v) => patch({ rideBaseFare: Number(v) || 0 })} keyboardType="numeric" />
              <AppInput label="Ride per km (Rs)" value={String(settings.ridePerKm)} onChangeText={(v) => patch({ ridePerKm: Number(v) || 0 })} keyboardType="numeric" />
              <AppInput label="Platform commission (%)" value={String(settings.commissionPct)} onChangeText={(v) => patch({ commissionPct: Number(v) || 0 })} keyboardType="numeric" />
              <AppInput label="Minimum order (Rs)" value={String(settings.minOrder)} onChangeText={(v) => patch({ minOrder: Number(v) || 0 })} keyboardType="numeric" />
            </View>

            <SectionLabel label="Support" />
            <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <AppInput label="Support phone" value={settings.supportPhone} onChangeText={(v) => patch({ supportPhone: v })} keyboardType="phone-pad" />
              <AppInput label="Support email" value={settings.supportEmail} onChangeText={(v) => patch({ supportEmail: v })} keyboardType="email-address" />
            </View>

            <SectionLabel label="Platform controls" />
            <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <ToggleRow icon="construct-outline" title="Maintenance mode" subtitle="Customers see a maintenance notice" value={settings.maintenanceMode} onValueChange={(v) => patch({ maintenanceMode: v })} />
              <ToggleRow icon="notifications-outline" title="Order status updates" subtitle="Notify customers about order changes" value={settings.sendOrderUpdates} onValueChange={(v) => patch({ sendOrderUpdates: v })} />
              <ToggleRow icon="car-outline" title="Ride status updates" subtitle="Notify riders about ride changes" value={settings.sendRideUpdates} onValueChange={(v) => patch({ sendRideUpdates: v })} />
              <ToggleRow icon="megaphone-outline" title="Promotion notifications" subtitle="Allow promotional push messages" value={settings.sendPromotions} onValueChange={(v) => patch({ sendPromotions: v })} />
            </View>

            <SectionLabel label="Legal" />
            <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <LinkRow icon="document-text-outline" title="Terms of service" value={settings.termsUrl} />
              <LinkRow icon="lock-closed-outline" title="Privacy policy" value={settings.privacyUrl} />
            </View>

            <AppButton
              label={saved ? 'Saved' : 'Save settings'}
              onPress={save}
              loading={saving}
              disabled={saved}
              variant={saved ? 'soft' : 'primary'}
              icon={saved ? 'checkmark' : 'save-outline'}
              style={styles.saveBtn}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ToggleRow({ icon, title, subtitle, value, onValueChange }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{title}</AppText>
        <AppText variant="micro" color={colors.textMuted}>{subtitle}</AppText>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.surfaceMuted, true: colors.primarySoft }} thumbColor={value ? colors.primary : colors.textMuted} />
    </View>
  );
}

function LinkRow({ icon, title, value }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.rowIcon, { backgroundColor: colors.rideSoft }]}>
        <Ionicons name={icon} size={18} color={colors.ride} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{title}</AppText>
        <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>{value}</AppText>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m },
  loadBlock: { gap: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.m, gap: spacing.s },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  saveBtn: { marginTop: spacing.l },
});