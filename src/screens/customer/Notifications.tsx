import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { EmptyState } from '../../components/EmptyState';
import { notificationApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors, ColorScheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { timeAgo } from '../../utils/format';
import { AppNotification } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const KIND_META = {
  order: { icon: 'bag-check-outline', soft: 'primarySoft', color: 'primary' },
  ride: { icon: 'bicycle-outline', soft: 'rideSoft', color: 'ride' },
  promo: { icon: 'pricetag-outline', soft: 'accentSoft', color: 'accent' },
  system: { icon: 'settings-outline', soft: 'surfaceMuted', color: 'info' },
} as const;

export function NotificationsScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  const data = useAsyncData(() => notificationApi.get(), []);

  useEffect(() => {
    if (data.data) setItems((prev) => (prev === null ? data.data : prev));
  }, [data.data]);

  const unread = (items ?? []).filter((n) => !n.read).length;

  const markAllRead = async () => {
    haptics.medium();
    setItems((prev) => (prev ?? []).map((n) => ({ ...n, read: true })));
    await notificationApi.markAllRead();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        elevated
        right={
          unread > 0 ? (
            <Pressable onPress={markAllRead} hitSlop={8}>
              <AppText variant="smallMedium" weight="bold" color={colors.primary}>
                Mark all read
              </AppText>
            </Pressable>
          ) : undefined
        }
      />
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            onPress={() =>
              !item.read &&
              setItems((prev) => (prev ?? []).map((n) => (n.id === item.id ? { ...n, read: true } : n)))
            }
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.s }} />}
        ListEmptyComponent={
          data.loading ? (
            <EmptyState icon="notifications-outline" title="Loading…" message="Fetching your notifications." />
          ) : (
            <EmptyState icon="notifications-off-outline" title="All caught up" message="You have no notifications right now." />
          )
        }
      />
    </View>
  );
}

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const { colors } = useThemeColors();
  const meta = KIND_META[item.kind];
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: item.read ? colors.surfaceAlt : colors.surfaceRaised, borderColor: colors.border },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors[meta.soft as keyof ColorScheme] }]}>
        <Ionicons name={meta.icon} size={20} color={colors[meta.color as keyof ColorScheme]} />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <AppText variant="title" weight={item.read ? 'semiBold' : 'bold'} color={colors.textPrimary} numberOfLines={1} style={styles.title}>
            {item.title}
          </AppText>
          {!item.read && <View style={[styles.dot, { backgroundColor: colors.danger }]} />}
        </View>
        <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
          {item.body}
        </AppText>
        <AppText variant="micro" color={colors.textMuted}>
          {timeAgo(item.at)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, padding: spacing.m, borderRadius: 18, borderWidth: 1 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});