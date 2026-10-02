import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Skeleton } from '../../components/LoadingSkeleton';
import { adminApi } from '../../services/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Tile = { key: keyof RootStackParamList; icon: keyof typeof Ionicons.glyphMap; label: string; soft: string; fg: string; badge?: number };

export function AdminManagement() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const t = useAsyncData(() => adminApi.dashboard(), []);

  const totals = t.data?.totals;
  const tiles: Tile[] = [
    { key: 'AdminUsers', icon: 'people-outline', label: 'Users & Accounts', soft: colors.primarySoft, fg: colors.primary, badge: totals?.pendingRestaurants },
    { key: 'AdminRiders', icon: 'bicycle-outline', label: 'Riders', soft: colors.rideSoft, fg: colors.ride, badge: totals?.pendingRiderApplications },
    { key: 'AdminRestaurants', icon: 'restaurant-outline', label: 'Restaurants', soft: colors.primarySoft, fg: colors.primary, badge: totals?.pendingRestaurants },
    { key: 'AdminMenu', icon: 'fast-food-outline', label: 'Food / Menu', soft: colors.accentSoft, fg: colors.accent },
    { key: 'AdminRides', icon: 'car-outline', label: 'Ride Bookings', soft: colors.rideSoft, fg: colors.ride, badge: totals?.activeRides },
    { key: 'AdminPayments', icon: 'card-outline', label: 'Payments', soft: colors.successSoft, fg: colors.success },
    { key: 'AdminWallet', icon: 'wallet-outline', label: 'Wallets', soft: colors.primarySoft, fg: colors.primary },
    { key: 'AdminPromotions', icon: 'pricetag-outline', label: 'Promotions', soft: colors.warningSoft, fg: colors.warning },
    { key: 'AdminNotifications', icon: 'notifications-outline', label: 'Notifications', soft: colors.rideSoft, fg: colors.info },
    { key: 'AdminSupport', icon: 'chatbubbles-outline', label: 'Support Tickets', soft: colors.dangerSoft, fg: colors.danger, badge: totals?.supportTickets },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Management" hideBack elevated />
      {t.loading && !totals ? (
        <View style={styles.grid}>
          <Skeleton height={104} rounded={18} />
          <Skeleton height={104} rounded={18} />
          <Skeleton height={104} rounded={18} />
          <Skeleton height={104} rounded={18} />
        </View>
      ) : (
        <Animated.ScrollView contentContainerStyle={[styles.gridBody, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
          {tiles.map((tile, i) => (
            <Animated.View key={tile.key} entering={FadeInDown.delay(i * 30).duration(280)} style={styles.tileWrap}>
              <Pressable onPress={() => navigation.navigate(tile.key as never)} style={[styles.tile, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={[styles.tileIcon, { backgroundColor: tile.soft }]}>
                  <Ionicons name={tile.icon} size={24} color={tile.fg} />
                </View>
                <View style={styles.tileText}>
                  <AppText variant="title" weight="bold" color={colors.textPrimary}>{tile.label}</AppText>
                  {!tile.badge || tile.badge === 0 ? (
                    <AppText variant="small" color={colors.textMuted}>Manage & review</AppText>
                  ) : (
                    <AppText variant="small" color={colors.danger}>{tile.badge} needs attention</AppText>
                  )}
                </View>
                <View style={styles.chevron}>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grid: { padding: spacing.m, gap: spacing.sm },
  gridBody: { padding: spacing.m, gap: spacing.sm },
  tileWrap: { width: '100%' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, borderRadius: 18, borderWidth: 1, padding: spacing.m },
  tileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, gap: 2 },
  chevron: { justifyContent: 'center' },
});