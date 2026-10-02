import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Divider } from '../../components/Divider';
import { riderApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RiderEarningsScreen({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const earnings = useAsyncData(() => riderApi.getEarnings(), []);

  const period = earnings.data?.period;
  const stats = earnings.data?.stats;
  const days = earnings.data?.days ?? [];
  const maxDay = Math.max(1, ...days.map((d) => d.amount));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Earnings" onBack={embedded ? undefined : () => navigation.goBack()} hideBack={embedded} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#1B84B5', '#0E3F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
          <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>{period?.label ?? 'This week'}</AppText>
          {earnings.loading && earnings.data == null ? (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">Rs …</AppText>
          ) : (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">
              {formatCurrency(period?.amount ?? 0)}
            </AppText>
          )}
          <View style={styles.summaryMeta}>
            <View style={styles.metaBlock}>
              <AppText variant="title" weight="bold" color="#FFFFFF">{period?.trips ?? 0}</AppText>
              <AppText variant="micro" color="rgba(255,255,255,0.8)">Trips</AppText>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaBlock}>
              <AppText variant="title" weight="bold" color="#FFFFFF">{period?.hoursOnline ?? 0}h</AppText>
              <AppText variant="micro" color="rgba(255,255,255,0.8)">Online</AppText>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaBlock}>
              <AppText variant="title" weight="bold" color="#FFFFFF">{period?.onTime ?? 0}%</AppText>
              <AppText variant="micro" color="rgba(255,255,255,0.8)">On time</AppText>
            </View>
          </View>
        </LinearGradient>

        <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.sectionTitle}>
          This week
        </AppText>
        <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={styles.bars}>
            {days.map((d) => (
              <View key={d.day} style={styles.barCol}>
                <AppText variant="microBold" color={colors.textSecondary} style={styles.barValue}>
                  {(d.amount / 1000).toFixed(1)}k
                </AppText>
                <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
                  <View
                    style={[
                      styles.barFill,
                      { height: `${Math.max(8, (d.amount / maxDay) * 100)}%`, backgroundColor: d.day === 'Sat' ? colors.ride : colors.primary },
                    ]}
                  />
                </View>
                <AppText variant="micro" color={colors.textMuted}>{d.day}</AppText>
              </View>
            ))}
          </View>
        </View>

        <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.sectionTitle}>
          Performance
        </AppText>
        <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <PerfRow icon="star" label="Average rating" value={`${stats?.rating ?? 4.9} ★`} />
          <Divider spacing={0} />
          <PerfRow icon="checkmark-done" label="Trips completed" value={`${stats?.completed.toLocaleString('en-US') ?? 0}`} />
          <Divider spacing={0} />
          <PerfRow icon="hand-left" label="Acceptance rate" value={`${stats?.acceptance ?? 0}%`} />
          <Divider spacing={0} />
          <PerfRow icon="navigate" label="Distance covered" value={`${stats?.totalKm.toLocaleString('en-US') ?? 0} km`} />
        </View>

        <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Earnings are settled to your Swat Wallet every Sunday. You keep 76% of every fare plus 100% tips.
          </AppText>
        </View>

        <AppButton
          label="Withdraw to bank"
          icon="arrow-down-circle-outline"
          size="lg"
          onPress={() => {
            haptics.medium();
            success('Withdrawal request sent to your bank');
          }}
        />
      </ScrollView>
    </View>
  );
}

function PerfRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.perfRow}>
      <View style={[styles.perfIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <AppText variant="title" weight="semiBold" color={colors.textPrimary} style={styles.perfLabel}>{label}</AppText>
      <AppText variant="title" weight="bold" color={colors.textPrimary}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  summaryCard: { borderRadius: 26, padding: spacing.l, gap: spacing.xs },
  summaryMeta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.l },
  metaBlock: { alignItems: 'center', gap: 1 },
  metaDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
  sectionTitle: { marginTop: spacing.xs },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.m },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.xs, height: 132 },
  barCol: { flex: 1, alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 9 },
  barTrack: { width: 18, flex: 1, borderRadius: 9, overflow: 'hidden', justifyContent: 'flex-end', minHeight: 20 },
  barFill: { width: '100%', borderRadius: 9, minHeight: 4 },
  perfRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  perfIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  perfLabel: { flex: 1 },
  note: { flexDirection: 'row', gap: spacing.sm, borderRadius: 16, padding: spacing.m, alignItems: 'flex-start' },
  noteText: { flex: 1 },
});