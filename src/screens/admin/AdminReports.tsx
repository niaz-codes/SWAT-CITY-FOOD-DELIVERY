import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { SectionLabel, StatCard, BarChartSimple, FilterRow } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { adminApi } from '../../services/admin';
import type { ReportRange } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';

const RANGES: { label: string; value: ReportRange }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'This year', value: 'year' },
  { label: 'All time', value: 'all' },
];

const SCALE: Record<ReportRange, number> = { today: 1, '7d': 7, '30d': 30, month: 90, year: 360, all: 720, custom: 1 };

export function AdminReports() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<ReportRange>('7d');
  const data = useAsyncData(() => adminApi.report(range), [range]);

  const report = data.data;
  const scale = SCALE[range];

  const summary = useMemo(() => {
    if (!report) return [];
    return [
      { icon: 'cart-outline' as const, label: 'Gross sales', value: formatCurrency(report.salesTotal * scale), accent: 'primary' as const },
      { icon: 'receipt-outline' as const, label: 'Orders', value: String(Math.round(report.orders * scale)), accent: 'success' as const },
      { icon: 'car-outline' as const, label: 'Rides', value: String(Math.round(report.rides * scale)), accent: 'ride' as const },
      { icon: 'trending-up-outline' as const, label: 'Platform revenue', value: formatCurrency(report.revenue * scale), accent: 'warning' as const },
      { icon: 'bicycle-outline' as const, label: 'Rider earnings', value: formatCurrency(report.riderEarnings * scale), accent: 'ride' as const },
      { icon: 'pie-chart-outline' as const, label: 'Commission', value: formatCurrency(report.commission * scale), accent: 'info' as const },
      { icon: 'people-outline' as const, label: 'Total customers', value: String(Math.round(report.customers * (range === 'today' ? 0.12 : range === '7d' ? 0.55 : Math.min(1.2, scale / 10))) ), accent: 'success' as const },
      { icon: 'bicycle-outline' as const, label: 'Active riders', value: String(Math.round(report.riders * (range === 'today' ? 0.2 : range === '7d' ? 0.7 : Math.min(1.2, scale / 10)) )), accent: 'primary' as const },
    ];
  }, [report, scale, range]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Reports" hideBack elevated />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <FilterRow options={RANGES.map((r) => ({ label: r.label, value: r.value }))} value={range} onChange={(v) => setRange(v as ReportRange)} />

        {data.loading && !report ? (
          <View style={styles.loadBlock}>
            <Skeleton height={110} rounded={20} />
            <View style={styles.loadRow}>
              <Skeleton height={86} rounded={16} style={styles.loadCol} />
              <Skeleton height={86} rounded={16} style={styles.loadCol} />
            </View>
            <Skeleton height={180} rounded={18} />
            <Skeleton height={220} rounded={18} />
          </View>
        ) : report ? (
          <>
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.hero, { backgroundColor: colors.primary }]}>
              <AppText variant="caption" color="rgba(255,255,255,0.9)" uppercase>Net revenue · {RANGES.find((r) => r.value === range)?.label}</AppText>
              <AppText variant="display" weight="extraBold" color="#FFFFFF">{formatCurrency(report.revenue * scale)}</AppText>
              <AppText variant="small" color="rgba(255,255,255,0.85)">Updated {report.generatedAt.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })}</AppText>
            </Animated.View>

            <SectionLabel label="Summary" />
            <View style={styles.statGrid}>
              {summary.map((s, i) => <StatCard key={i} icon={s.icon} label={s.label} value={s.value} accent={s.accent} style={styles.statCell} />)}
            </View>

            <SectionLabel label="Daily sales" />
            <View style={[styles.chartCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <BarChartSimple data={report.daily.map((d) => ({ label: d.label, value: d.sales * scale }))} height={120} />
            </View>

            <SectionLabel label="Top restaurants" right={<AppText variant="micro" color={colors.textMuted}>by sales</AppText>} />
            <View style={[styles.topCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              {report.topRestaurants.map((r, i) => (
                <Animated.View key={r.name} entering={FadeInDown.delay(i * 40).duration(260)} style={[styles.topRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.12)' }]}>
                  <View style={styles.rankWrap}><AppText variant="title" weight="extraBold" color={i < 3 ? colors.primary : colors.textMuted}>{i + 1}</AppText></View>
                  <View style={styles.topEmoji}><AppText variant="title">{r.emoji}</AppText></View>
                  <View style={styles.topText}>
                    <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{r.name}</AppText>
                    <AppText variant="micro" color={colors.textMuted}>{r.orders} orders</AppText>
                  </View>
                  <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>{formatCurrency(r.revenue * Math.min(scale, 1))}</AppText>
                </Animated.View>
              ))}
            </View>

            <AppButton label="Share report" variant="secondary" icon="share-social-outline" onPress={() => {}} style={styles.share} />
          </>
        ) : (
          <AppText variant="body" color={colors.textMuted} center>Report unavailable.</AppText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m },
  loadBlock: { gap: spacing.sm },
  loadRow: { flexDirection: 'row', gap: spacing.sm },
  loadCol: { flex: 1 },
  hero: { borderRadius: 22, padding: spacing.l, gap: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCell: { flexBasis: '46%', flexGrow: 1 },
  chartCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.m },
  topCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.m },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rankWrap: { width: 22 },
  topEmoji: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,127,127,0.1)' },
  topText: { flex: 1, gap: 2 },
  share: { marginTop: spacing.l },
});