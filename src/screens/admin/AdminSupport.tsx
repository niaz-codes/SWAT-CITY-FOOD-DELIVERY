import React, { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { StatusBadge, SearchField, FilterRow, statusLabel } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { adminApi } from '../../services/admin';
import type { AdminTicket } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import type { ColorScheme } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { timeAgo } from '../../utils/format';

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = { urgent: 'danger', high: 'warning', medium: 'info', low: 'neutral' };

export function AdminSupport() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const data = useAsyncData(() => adminApi.getTickets(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [priority, setPriority] = useState('all');
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const tickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((t) => (filter === 'all' ? true : t.status === filter))
      .filter((t) => (priority === 'all' ? true : t.priority === priority))
      .filter((t) => !q || t.subject.toLowerCase().includes(q) || t.user.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
      .sort((a, b) => {
        const rank: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 };
        const pr: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (rank[a.status]! - rank[b.status]!) || (pr[a.priority]! - pr[b.priority]!);
      });
  }, [data.data, query, filter, priority]);

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;

  const sendReply = async (markResolved = false) => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    await adminApi.replyToTicket(selected.id, reply.trim(), markResolved);
    await data.refetch();
    setBusy(false);
    setReply('');
    setSelected((cur) => {
      if (!cur) return cur;
      const updated = data.data?.find((t) => t.id === cur.id);
      return updated ?? { ...cur, status: markResolved ? 'resolved' : 'in_progress' };
    });
  };

  const closeTicket = async () => {
    if (!selected) return;
    setBusy(true);
    await adminApi.setTicketStatus(selected.id, 'closed');
    await data.refetch();
    setBusy(false);
    setSelected((cur) => (cur ? { ...cur, status: 'closed' } : cur));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Support${openCount ? ` · ${openCount} open` : ''}`} elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search tickets" />
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <FilterRow options={['all', 'open', 'in_progress', 'resolved', 'closed']} value={filter} onChange={setFilter} />
            <FilterRow options={['all', 'urgent', 'high', 'medium', 'low']} value={priority} onChange={setPriority} />
          </View>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>{[0, 1, 2].map((i) => <Skeleton key={i} height={70} rounded={16} />)}</View>
          ) : (
            <EmptyState icon="chatbubbles-outline" title="No tickets" message="No support tickets match your filters." />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.rowCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={[styles.severityBar, { backgroundColor: PRIORITY_TONE_PRIORITY(item.priority, colors) }]} />
            <View style={styles.rowText}>
              <View style={styles.rowMeta}>
                <AppText variant="smallMedium" weight="bold" color={colors.textPrimary} numberOfLines={1}>{item.subject}</AppText>
              </View>
              <AppText variant="micro" color={colors.textMuted}>{item.id} · {item.user} · {item.category}</AppText>
              <View style={styles.rowFooter}>
                <Badge label={item.priority} tone={PRIORITY_TONE[item.priority] ?? 'neutral'} />
                <StatusBadge status={item.status} />
              </View>
            </View>
            <AppText variant="micro" color={colors.textMuted}>{timeAgo(item.updatedAt)}</AppText>
          </Pressable>
        )}
      />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.subject} subtitle={selected ? `${selected.id} · ${selected.user}` : undefined} height={520}>
        {selected && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <ScrollView style={styles.thread} showsVerticalScrollIndicator={false}>
                {selected.messages.map((m) => (
                  <View key={m.id} style={[styles.bubbleRow, m.from === 'admin' && styles.bubbleRowAdmin]}>
                    <View style={[styles.bubble, m.from === 'admin' ? { backgroundColor: colors.primarySoft } : { backgroundColor: colors.surfaceMuted }]}>
                      <AppText variant="small" color={colors.textPrimary}>{m.text}</AppText>
                      <AppText variant="micro" color={colors.textMuted}>{m.from === 'admin' ? 'Support · ' : `${selected.user} · `}{timeAgo(m.at)}</AppText>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.replyBox}>
                <AppInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Type a reply…"
                  multiline
                />
                <View style={styles.replyActions}>
                  <AppButton label="Reply" onPress={() => sendReply(false)} disabled={!reply.trim()} loading={busy} icon="send" size="sm" style={{ flex: 1 }} />
                  <AppButton label="Mark resolved" onPress={() => sendReply(true)} variant="soft" disabled={!reply.trim()} size="sm" style={{ flex: 1 }} icon="checkmark" />
                  {selected.status === 'open' && <AppButton label="" onPress={closeTicket} variant="ghost" icon="lock-closed-outline" size="sm" disabled={busy} />}
                </View>
                {busy && <AppText variant="micro" color={colors.textMuted} center>Sending…</AppText>}
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </BottomSheet>
    </View>
  );
}

function PRIORITY_TONE_PRIORITY(p: string, colors: ColorScheme): string {
  return { urgent: colors.danger, high: colors.warning, medium: colors.ride, low: colors.textMuted }[p] ?? colors.textMuted;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  severityBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 40 },
  rowText: { flex: 1, gap: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center' },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  sheet: { gap: spacing.sm },
  thread: { maxHeight: 220 },
  bubbleRow: { alignItems: 'flex-start', marginBottom: spacing.xs },
  bubbleRowAdmin: { alignItems: 'flex-end' },
  bubble: { maxWidth: '86%', borderRadius: radius.md, paddingHorizontal: spacing.m, paddingVertical: spacing.sm, gap: 2 },
  replyBox: { gap: spacing.s },
  replyActions: { flexDirection: 'row', gap: spacing.s },
});