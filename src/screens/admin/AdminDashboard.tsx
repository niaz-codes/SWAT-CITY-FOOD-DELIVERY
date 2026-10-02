import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { SectionLabel, StatCard, StatusBadge, BarChartSimple, LineChartSvg, DonutChartSvg, LegendList } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { ErrorState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { ADMIN_USER } from '../../services/api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const QUICK: { key: keyof RootStackParamList; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'AdminUsers', icon: 'people-outline', label: 'Users' },
  { key: 'AdminRiders', icon: 'bicycle-outline', label: 'Riders' },
  { key: 'AdminRestaurants', icon: 'restaurant-outline', label: 'Restaurants' },
  { key: 'AdminMenu', icon: 'fast-food-outline', label: 'Food / Menu' },
  { key: 'AdminRides', icon: 'car-outline', label: 'Rides' },
  { key: 'AdminPayments', icon: 'card-outline', label: 'Payments' },
  { key: 'AdminWallet', icon: 'wallet-outline', label: 'Wallet' },
  { key: 'AdminPromotions', icon: 'pricetag-outline', label: 'Promotions' },
  { key: 'AdminNotifications', icon: 'notifications-outline', label: 'Notifications' },
  { key: 'AdminSupport', icon: 'chatbubbles-outline', label: 'Support' },
];

export function AdminDashboardScreen() {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.dashboard(), []);

  const totals = data.data?.totals;
  const charts = data.data?.charts;

  const statGrid = useMemo(() => {
    if (!totals) return [];
    return [
      { icon: 'people-outline' as const, label: 'Total users', value: String(totals.users), accent: 'primary' as const },
      { icon: 'person-outline' as const, label: 'Customers', value: String(totals.customers), accent: 'success' as const },
      { icon: 'bicycle-outline' as const, label: 'Riders', value: String(totals.riders), accent: 'ride' as const },
      { icon: 'restaurant-outline' as const, label: 'Restaurants', value: String(totals.restaurants), accent: 'warning' as const },
      { icon: 'fast-food-outline' as const, label: 'Food items', value: String(totals.foodItems), accent: 'primary' as const },
      { icon: 'time-outline' as const, label: 'Active orders', value: String(totals.activeOrders), accent: 'info' as const },
      { icon: 'checkmark-done-outline' as const, label: 'Completed orders', value: String(totals.completedOrders), accent: 'success' as const },
      { icon: 'close-circle-outline' as const, label: 'Cancelled orders', value: String(totals.cancelledOrders), accent: 'danger' as const },
      { icon: 'car-outline' as const, label: 'Active rides', value: String(totals.activeRides), accent: 'ride' as const },
      { icon: 'wallet-outline' as const, label: 'Rider earnings', value: formatCurrency(totals.riderEarnings), accent: 'warning' as const },
      { icon: 'hourglass-outline' as const, label: 'Pending rider apps', value: String(totals.pendingRiderApplications), accent: 'info' as const },
      { icon: 'storefront-outline' as const, label: 'Pending restaurants', value: String(totals.pendingRestaurants), accent: 'warning' as const },
      { icon: 'clipboard-outline' as const, label: 'Pending orders', value: String(totals.pendingOrders), accent: 'info' as const },
      { icon: 'chatbubbles-outline' as const, label: 'Support tickets', value: String(totals.supportTickets), accent: 'danger' as const },
    ];
  }, [totals]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Dashboard" elevated hideBack right={<StatusBadge status="live" />} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        {data.loading && data.data == null ? (
          <View style={styles.loadBlock}>
            <Skeleton height={120} rounded={22} />
            <View style={styles.loadRow}>
              <Skeleton height={92} rounded={16} style={styles.loadCol} />
              <Skeleton height={92} rounded={16} style={styles.loadCol} />
            </View>
            <Skeleton height={180} rounded={20} />
          </View>
        ) : data.error && (!totals || !charts) ? (
          <ErrorState onRetry={data.refetch} />
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(320)}>
              <LinearGradient colors={['#7B2CBF', '#0E3F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.revenueHero}>
                <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>Total revenue · all time</AppText>
                <AppText variant="display" weight="extraBold" color="#FFFFFF">{formatCurrency(totals?.revenue ?? 0)}</AppText>
                <View style={styles.heroRow}>
                  <View style={styles.heroBadge}>
                    <AppText variant="microBold" color="#FFFFFF">{ADMIN_USER.email}</AppText>
                  </View>
                  <AppText variant="small" color="rgba(255,255,255,0.85)">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</AppText>
                </View>
              </LinearGradient>
            </Animated.View>

            <SectionLabel label="Key metrics" />
            <View style={styles.statGrid}>
              {statGrid.map((s, i) => (
                <StatCard key={i} icon={s.icon} label={s.label} value={s.value} accent={s.accent} style={styles.statCell} />
              ))}
              <StatCard icon="trending-up-outline" label="Total revenue" value={formatCurrency(totals?.revenue ?? 0)} accent="primary" style={styles.statCell} />
            </View>

            {charts && (
              <>
                <SectionLabel label="Daily orders" />
                <ChartCard>
                  <BarChartSimple data={charts.dailyOrders.map((d) => ({ label: d.label, value: d.count }))} height={110} />
                </ChartCard>

                <SectionLabel label="Weekly revenue" />
                <ChartCard>
                  <LineChartSvg data={charts.weeklyRevenue.map((w) => ({ label: w.label, value: w.amount }))} height={120} color={colors.ride} />
                </ChartCard>

                <SectionLabel label="Order status" />
                <ChartCard full>
                  <View style={styles.donutRow}>
                    <DonutChartSvg data={charts.orderStatus} size={150} thickness={18} />
                    <View style={styles.donutLegend}>
                      <LegendList data={charts.orderStatus} />
                    </View>
                  </View>
                </ChartCard>

                <SectionLabel label="Food delivery vs ride booking" />
                <ChartCard>
                  <BarChartSimple data={charts.serviceSplit.map((d) => ({ label: d.label, value: d.count }))} height={90} accent={colors.success} />
                </ChartCard>

                <SectionLabel label="Customer growth" />
                <ChartCard>
                  <LineChartSvg data={charts.customerGrowth.map((d) => ({ label: d.label, value: d.count }))} height={100} color={colors.primary} />
                </ChartCard>

                <SectionLabel label="Rider growth" />
                <ChartCard>
                  <BarChartSimple data={charts.riderGrowth.map((d) => ({ label: d.label, value: d.count }))} height={90} accent={colors.warning} />
                </ChartCard>
              </>
            )}

            <SectionLabel label="Management" />
            <View style={styles.quickGrid}>
              {QUICK.map((q) => (
                <Pressable key={q.key} onPress={() => navigation.navigate(q.key as never)} style={[styles.quickCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <View style={[styles.quickIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name={q.icon} size={20} color={colors.primary} />
                  </View>
                  <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{q.label}</AppText>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ChartCard({ children, full }: { children: React.ReactNode; full?: boolean }) {
  const { colors } = useThemeColors();
  return <View style={[styles.chartCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, full && { paddingVertical: spacing.l }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m },
  loadBlock: { gap: spacing.sm },
  loadRow: { flexDirection: 'row', gap: spacing.sm },
  loadCol: { flex: 1 },
  revenueHero: { borderRadius: 22, padding: spacing.l, gap: 4, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.l },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.s, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCell: { flexBasis: '46%', flexGrow: 1 },
  chartCard: { borderRadius: 18, borderWidth: 1, padding: spacing.m },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.l },
  donutLegend: { flex: 1 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickCard: { flexBasis: '30%', flexGrow: 1, borderRadius: 16, borderWidth: 1, padding: spacing.sm, alignItems: 'center', gap: spacing.xs },
  quickIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});