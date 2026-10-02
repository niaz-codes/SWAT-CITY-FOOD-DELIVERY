import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { SearchField, FilterRow, statusLabel } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminNotification, NotificationAudience } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { timeAgo } from '../../utils/format';

const AUDIENCES: { label: string; value: NotificationAudience }[] = [
  { label: 'All users', value: 'all' },
  { label: 'Customers', value: 'customers' },
  { label: 'Riders', value: 'riders' },
];

export function AdminNotifications() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getNotifications(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<NotificationAudience>('all');

  const notifs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((n) => (filter === 'all' ? true : n.audience === filter))
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [data.data, query, filter]);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    await adminApi.sendNotification({ title: title.trim(), body: body.trim(), audience });
    await data.refetch();
    setCompose(false);
    setTitle('');
    setBody('');
    setAudience('all');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Notifications" elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search notification" />
      <FlatList
        data={notifs}
        keyExtractor={(n) => n.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <FilterRow options={['all', 'customers', 'riders', 'everyone']} value={filter} onChange={setFilter} />
            <Pressable onPress={() => setCompose(true)} style={[styles.addCard, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="send" size={18} color={colors.primaryStrong} />
              <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>Compose push notification</AppText>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={78} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="notifications-outline" title="No notifications" message="Sent messages will appear here." />
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={[styles.notifIcon, { backgroundColor: colors.rideSoft }]}>
              <Ionicons name="notifications" size={18} color={colors.ride} />
            </View>
            <View style={styles.rowText}>
              <View style={styles.rowMeta}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.title}</AppText>
              </View>
              <AppText variant="small" color={colors.textSecondary} numberOfLines={2}>{item.body}</AppText>
              <View style={styles.rowFooter}>
                <Badge label={statusLabel(item.audience)} tone={item.audience === 'all' ? 'primary' : 'neutral'} />
                <AppText variant="micro" color={colors.textMuted}>{timeAgo(item.at)}</AppText>
              </View>
            </View>
          </View>
        )}
      />

      <BottomSheet visible={compose} onClose={() => setCompose(false)} title="Compose notification" subtitle="Broadcast to the Swat City community" height={520}>
        <View style={styles.sheet}>
          <AppInput label="Title" value={title} onChangeText={setTitle} placeholder="Weekend free delivery" maxLength={60} />
          <AppInput label="Message" value={body} onChangeText={setBody} placeholder="Rs 0 delivery fee on orders above Rs 800 this weekend." multiline />
          <View style={styles.audienceWrap}>
            {AUDIENCES.map((a) => (
              <Pressable key={a.value} onPress={() => setAudience(a.value)} style={[styles.audienceChip, { backgroundColor: audience === a.value ? colors.primary : colors.surfaceMuted, borderColor: audience === a.value ? colors.primary : colors.border }]}>
                <AppText variant="smallMedium" weight="bold" color={audience === a.value ? colors.onPrimary : colors.textSecondary}>{a.label}</AppText>
              </Pressable>
            ))}
          </View>
          <AppButton
            label="Send notification"
            onPress={send}
            disabled={!title.trim() || !body.trim()}
            icon="send"
            iconPosition="right"
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  addCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.lg, padding: spacing.sm, marginTop: spacing.s },
  rowCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  notifIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center' },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'space-between' },
  sheet: { gap: spacing.s },
  audienceWrap: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.xs },
  audienceChip: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: radius.md, borderWidth: 1 },
});