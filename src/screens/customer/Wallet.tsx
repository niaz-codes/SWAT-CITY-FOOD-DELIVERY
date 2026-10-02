import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Divider } from '../../components/Divider';
import { ErrorState } from '../../components/EmptyState';
import { walletApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { WalletTx } from '../../types/domain';

type Props = { embedded?: boolean };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function WalletScreen({ embedded }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { success } = useToast();
  const wallet = useAsyncData(() => walletApi(), []);
  const [amount] = useState('500');

  const balance = wallet.data?.balance ?? 0;
  const transactions = wallet.data?.transactions ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Swat Wallet" onBack={embedded ? undefined : () => navigation.goBack()} hideBack={embedded} elevated />

      <ScrollView style={styles.flex} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#0E9488', '#0B7A71']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
          <View style={styles.balanceCircleOne} />
          <View style={styles.balanceCircleTwo} />
          <View style={styles.balanceHeader}>
            <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>
              Available balance
            </AppText>
            <Ionicons name="wallet" size={22} color="rgba(255,255,255,0.9)" />
          </View>
          {wallet.loading && transactions.length === 0 ? (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">Rs …</AppText>
          ) : (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">
              {formatCurrency(balance)}
            </AppText>
          )}
          <View style={styles.cardFooter}>
            <AppText variant="small" color="rgba(255,255,255,0.85)">
              Customer · Ahmad Khan
            </AppText>
            <View style={styles.cardBadge}>
              <AppText variant="microBold" color="#FFFFFF">SWAT PAY</AppText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.quickRow}>
          <QuickAction icon="add-circle-outline" label="Add money" onPress={() => success(`Rs ${amount} added to wallet`)} />
          <QuickAction icon="swap-horizontal-outline" label="Transfer" onPress={() => success('Transfer is coming soon')} />
          <QuickAction icon="receipt-outline" label="History" onPress={() => {}} />
        </View>

        <SectionHeader label="Recent transactions" />

        {wallet.error && !wallet.data ? (
          <ErrorState onRetry={wallet.refetch} compact />
        ) : transactions.length === 0 ? (
          <AppText variant="body" color={colors.textMuted}>No transactions yet.</AppText>
        ) : (
          transactions.map((tx) => <TxRow key={tx.id} tx={tx} />)
        )}

        <Divider spacing={spacing.l} />

        <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Wallet balances are held securely and can be used for food and ride payments anytime.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        haptics.medium();
        onPress();
      }}
      style={[styles.quick, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
    >
      <View style={[styles.quickIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SectionHeader({ label }: { label: string }) {
  const { colors } = useThemeColors();
  return (
    <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.sectionTitle}>
      {label}
    </AppText>
  );
}

function TxRow({ tx }: { tx: WalletTx }) {
  const { colors } = useThemeColors();
  const credit = tx.kind === 'credit';
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: credit ? colors.successSoft : colors.dangerSoft }]}>
        <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={18} color={credit ? colors.success : colors.danger} />
      </View>
      <View style={styles.txInfo}>
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
          {tx.title}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {tx.subtitle} · {timeAgo(tx.at)}
        </AppText>
      </View>
      <AppText variant="title" weight="extraBold" color={credit ? colors.success : colors.textPrimary}>
        {credit ? '+' : '-'} {formatCurrency(tx.amount)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  body: { padding: spacing.m, paddingBottom: spacing.xxl, gap: spacing.sm },
  balanceCard: { borderRadius: 26, padding: spacing.l, overflow: 'hidden', gap: spacing.xs },
  balanceCircleOne: { position: 'absolute', width: 170, height: 170, borderRadius: 85, top: -70, right: -40, backgroundColor: 'rgba(255,255,255,0.12)' },
  balanceCircleTwo: { position: 'absolute', width: 90, height: 90, borderRadius: 45, bottom: -34, left: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.l },
  cardBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.s, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quick: { flex: 1, borderRadius: 18, borderWidth: 1, paddingVertical: spacing.m, alignItems: 'center', gap: spacing.xs },
  quickIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginTop: spacing.m, marginBottom: spacing.xs },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  txIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  note: { flexDirection: 'row', gap: spacing.sm, borderRadius: 16, padding: spacing.m, alignItems: 'flex-start' },
  noteText: { flex: 1 },
});