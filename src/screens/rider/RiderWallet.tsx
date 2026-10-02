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
import { EmptyState } from '../../components/EmptyState';
import { walletApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';
import { WalletTx } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RiderWalletScreen({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const wallet = useAsyncData(() => walletApi(), []);

  const balance = wallet.data?.balance ?? 0;
  const transactions = wallet.data?.transactions ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Rider Wallet" onBack={embedded ? undefined : () => navigation.goBack()} hideBack={embedded} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#1B84B5', '#0E3F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>Available balance</AppText>
            <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.9)" />
          </View>
          {wallet.loading && transactions.length === 0 ? (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">Rs …</AppText>
          ) : (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">{formatCurrency(balance)}</AppText>
          )}
          <View style={styles.settlementRow}>
            <AppText variant="small" color="rgba(255,255,255,0.85)">Last settlement · Sunday</AppText>
            <View style={styles.settlementBadge}>
              <AppText variant="microBold" color="#FFFFFF">SWAT PAY</AppText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.actions}>
          <AppButton label="Withdraw to bank" icon="arrow-down-circle-outline" variant="secondary" onPress={() => { haptics.medium(); success('Withdrawal requested'); }} />
          <AppButton label="Add cash" icon="add-circle-outline" variant="ghost" onPress={() => success('Add cash is coming soon')} />
        </View>

        <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.sectionTitle}>
          Transactions
        </AppText>

        {wallet.error && !wallet.data ? (
          <EmptyState icon="alert-circle-outline" title="Couldn't load wallet" message="Pull to retry." onAction={() => wallet.refetch()} compact />
        ) : transactions.length === 0 ? (
          <AppText variant="body" color={colors.textMuted}>No transactions yet.</AppText>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            {transactions.map((tx, i) => (
              <React.Fragment key={tx.id}>
                {i > 0 && <Divider spacing={0} />}
                <TxRow tx={tx} />
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TxRow({ tx }: { tx: WalletTx }) {
  const { colors } = useThemeColors();
  const credit = tx.kind === 'credit';
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: credit ? colors.successSoft : colors.surfaceMuted }]}>
        <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={16} color={credit ? colors.success : colors.textSecondary} />
      </View>
      <View style={styles.txInfo}>
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>{tx.title}</AppText>
        <AppText variant="small" color={colors.textMuted}>{tx.subtitle} · {timeAgo(tx.at)}</AppText>
      </View>
      <AppText variant="title" weight="extraBold" color={credit ? colors.success : colors.textPrimary}>
        {credit ? '+' : '-'} {formatCurrency(tx.amount)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  balanceCard: { borderRadius: 26, padding: spacing.l, gap: spacing.xs, overflow: 'hidden' },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settlementRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.l },
  settlementBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.s, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm },
  sectionTitle: { marginTop: spacing.xs, marginBottom: spacing.xs },
  card: { borderRadius: 20, borderWidth: 1, paddingHorizontal: spacing.m },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  txIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
});