import React from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { activityApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors, ColorScheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';
import { ActivityItem } from '../../types/domain';

type Props = { embedded?: boolean };

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Tint = 'primary' | 'ride' | 'success';

const KIND: Record<ActivityItem['kind'], { icon: keyof typeof Ionicons.glyphMap; tint: Tint }> = {
  food: { icon: 'restaurant-outline', tint: 'primary' },
  ride: { icon: 'bicycle-outline', tint: 'ride' },
  payment: { icon: 'wallet-outline', tint: 'success' },
};

const SOFT: Record<Tint, keyof ColorScheme> = {
  primary: 'primarySoft',
  ride: 'rideSoft',
  success: 'successSoft',
};

/**
 * Resolves the screen that already owns an activity row.
 *
 * The backend namespaces every activity id by kind — `o_<orderId>`,
 * `r_<rideId>`, `w_<txId>` (see `getActivities` in
 * `backend/src/controllers/customer.controller.ts`) — so the prefix has to come
 * off before the raw id is handed to a route that expects a bare id.
 *
 * Ride rows open `RiderTracking` with just the ride id: the screen fetches the
 * live ride itself and reflects cancellations/completions honestly, so a stale
 * summary can never lead the user astray.
 */
function pressHandlerFor(item: ActivityItem, navigation: Nav): (() => void) | undefined {
  const id = item.id.replace(/^[a-z]_/, '');
  if (!id) return undefined;

  if (item.kind === 'food') {
    return () => navigation.navigate('OrderTracking', { orderId: id });
  }
  if (item.kind === 'ride') {
    return () => navigation.navigate('RiderTracking', { rideId: id });
  }
  if (item.kind === 'payment') {
    return () => navigation.navigate('Wallet');
  }
  return undefined;
}

export function ActivitiesScreen({ embedded }: Props) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const activity = useAsyncData(async () => {
    const items = await activityApi.get();
    // Snapshot "now" at fetch time so the section grouping below is a pure
    // function of the loaded data (no Date.now during render).
    return { items, fetchedAt: Date.now() };
  }, []);

  const sections = React.useMemo(() => {
    const feed = activity.data;
    if (!feed) return [];
    const fetched = new Date(feed.fetchedAt);
    const today = new Date(fetched.getFullYear(), fetched.getMonth(), fetched.getDate()).getTime();
    const yesterday = today - 24 * 3600 * 1000;
    const data = feed.items;
    const todayItems = data.filter((a) => a.at.getTime() >= today);
    const earlierItems = data.filter((a) => a.at.getTime() < today && a.at.getTime() >= yesterday);
    const older = data.filter((a) => a.at.getTime() < yesterday);
    const out: { title: string; data: ActivityItem[] }[] = [];
    if (todayItems.length) out.push({ title: 'Today', data: todayItems });
    if (earlierItems.length) out.push({ title: 'Yesterday', data: earlierItems });
    if (older.length) out.push({ title: 'Earlier', data: older });
    return out;
  }, [activity.data]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Activity"
        onBack={embedded ? undefined : () => navigation.goBack()}
        hideBack={embedded}
        elevated
      />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <ActivityRow item={item} onPress={pressHandlerFor(item, navigation)} />
        )}
        renderSectionHeader={({ section }) => (
          <AppText
            variant="captionBold"
            color={colors.textMuted}
            uppercase
            style={styles.sectionTitle}
          >
            {section.title}
          </AppText>
        )}
        ItemSeparatorComponent={() => <Divider spacing={spacing.sm} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ListEmptyComponent={
          activity.loading ? (
            <EmptyState
              icon="time-outline"
              title="Loading…"
              message="Fetching your latest activity."
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No activity yet"
              message="Your orders and rides will show up here."
            />
          )
        }
      />
    </View>
  );
}

function ActivityRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const { colors } = useThemeColors();
  const meta = KIND[item.kind];
  const tintKey = SOFT[meta.tint];

  // Built once and rendered through either a View or a Pressable so the row
  // keeps byte-identical markup and styling in both cases — only the wrapper
  // differs, which keeps the layout, colors and icons untouched.
  const body = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: colors[tintKey] }]}>
        <Ionicons name={meta.icon} size={20} color={colors[meta.tint]} />
      </View>
      <View style={styles.info}>
        <AppText variant="title" weight="bold" color={colors.textPrimary}>
          {item.title}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {item.subtitle}
        </AppText>
      </View>
      <View style={styles.meta}>
        {item.amount != null && (
          <AppText variant="title" weight="extraBold" color={colors.textPrimary}>
            {formatCurrency(item.amount)}
          </AppText>
        )}
        <AppText variant="micro" color={colors.textMuted}>
          {timeAgo(item.at)}
        </AppText>
      </View>
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;

  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: spacing.m },
  sectionTitle: { marginVertical: spacing.sm, marginTop: spacing.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingVertical: spacing.sm },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  meta: { alignItems: 'flex-end', gap: 2 },
});
