import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { Badge } from '../../components/Badge';
import {
  walletApi,
  walletCashIn,
  withdrawalRequest,
  withdrawalsMine,
  cancelWithdrawal,
  type WalletWithdrawal,
} from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';
import { WalletTx } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WD_ICON: Record<WalletWithdrawal['status'], keyof typeof Ionicons.glyphMap> = {
  pending: 'time-outline',
  approved: 'checkmark-done-outline',
  processing: 'sync-outline',
  paid: 'checkmark-circle-outline',
  rejected: 'close-circle-outline',
  cancelled: 'close-circle-outline',
};

const WD_TONE: Record<WalletWithdrawal['status'], 'warning' | 'success' | 'info' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  processing: 'info',
  paid: 'success',
  rejected: 'danger',
  cancelled: 'danger',
};

export function RiderWalletScreen({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { success, error } = useToast();
  const wallet = useAsyncData(() => walletApi(), []);
  const withdrawals = useAsyncData(() => withdrawalsMine(), []);

  const [cashOpen, setCashOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashError, setCashError] = useState<string | null>(null);
  const [cashSending, setCashSending] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [wdAmount, setWdAmount] = useState('');
  const [wdType, setWdType] = useState<'easypaisa' | 'bank'>('easypaisa');
  const [wdAccount, setWdAccount] = useState('');
  const [wdHolder, setWdHolder] = useState('');
  const [wdError, setWdError] = useState<string | null>(null);
  const [wdBusy, setWdBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const balance = wallet.data?.balance ?? 0;
  const transactions = wallet.data?.transactions ?? [];
  const wdList = withdrawals.data?.withdrawals ?? [];

  const submitCashIn = async () => {
    const amountNum = Number(cashAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setCashError('Enter an amount above 0.');
      return;
    }
    setCashSending(true);
    setCashError(null);
    try {
      await walletCashIn(amountNum);
      success(`Rs ${amountNum} added to your earnings`);
      setCashAmount('');
      setCashOpen(false);
      await wallet.refetch();
    } catch (err) {
      error(apiErrorMessage(err, 'Could not deposit cash. Try again.'));
    } finally {
      setCashSending(false);
    }
  };

  const submitWithdrawal = async () => {
    const amountNum = Number(wdAmount);
    const account = wdAccount.trim();
    const holder = wdHolder.trim();
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setWdError('Enter an amount above 0.');
      return;
    }
    if (amountNum > balance) {
      setWdError(`Insufficient balance. You have ${formatCurrency(balance)}.`);
      return;
    }
    if (!account) {
      setWdError(
        wdType === 'easypaisa'
          ? 'Enter the Easypaisa number to receive payment.'
          : 'Enter the bank account number.',
      );
      return;
    }
    if (!holder) {
      setWdError('Enter the account holder name.');
      return;
    }
    setWdBusy(true);
    setWdError(null);
    try {
      await withdrawalRequest({
        amount: amountNum,
        destinationType: wdType,
        destination: account,
        destinationHolder: holder,
      });
      success('Withdrawal requested. Admins will review it.');
      setWdAmount('');
      setWdAccount('');
      setWdHolder('');
      setWithdrawOpen(false);
      await Promise.all([wallet.refetch(), withdrawals.refetch()]);
    } catch (err) {
      setWdError(apiErrorMessage(err, 'Could not request the withdrawal.'));
    } finally {
      setWdBusy(false);
    }
  };

  const cancelRequest = async (id: string) => {
    setCancelId(id);
    try {
      await cancelWithdrawal(id);
      success('Withdrawal request cancelled — funds returned to your wallet.');
      await Promise.all([wallet.refetch(), withdrawals.refetch()]);
    } catch (err) {
      error(apiErrorMessage(err, 'Could not cancel the request.'));
    } finally {
      setCancelId(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Rider Wallet"
        onBack={embedded ? undefined : () => navigation.goBack()}
        hideBack={embedded}
      />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={wallet.refreshing}
            onRefresh={() => {
              wallet.onRefresh();
              withdrawals.refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <LinearGradient
          colors={['#1B84B5', '#0E3F3A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceTop}>
            <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>
              Available balance
            </AppText>
            <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.9)" />
          </View>
          {wallet.loading && transactions.length === 0 ? (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">
              Rs …
            </AppText>
          ) : (
            <AppText variant="display" weight="extraBold" color="#FFFFFF">
              {formatCurrency(balance)}
            </AppText>
          )}
          <View style={styles.settlementRow}>
            <AppText variant="small" color="rgba(255,255,255,0.85)">
              Total withdrawn · {formatCurrency(withdrawals.data?.totalWithdrawn ?? 0)}
            </AppText>
            <View style={styles.settlementBadge}>
              <AppText variant="microBold" color="#FFFFFF">
                SWAT PAY
              </AppText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.actions}>
          <AppButton
            label="Withdraw earnings"
            icon="arrow-down-circle-outline"
            onPress={() => {
              haptics.medium();
              setWdError(null);
              setWithdrawOpen((v) => !v);
              setCashOpen(false);
            }}
          />
          <AppButton
            label="Add cash"
            icon="add-circle-outline"
            variant="ghost"
            onPress={() => {
              setCashError(null);
              setCashOpen((v) => !v);
              setWithdrawOpen(false);
            }}
          />
        </View>

        {withdrawOpen && (
          <View
            style={[
              styles.panel,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              Withdraw earnings
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              The amount is reserved from your balance and paid out after admin approval.
            </AppText>
            <View style={styles.typeRow}>
              <Pressable
                onPress={() => setWdType('easypaisa')}
                style={[
                  styles.typePill,
                  {
                    borderColor: colors.border,
                    backgroundColor: wdType === 'easypaisa' ? colors.primarySoft : 'transparent',
                  },
                ]}
              >
                <AppText
                  variant="smallMedium"
                  weight="bold"
                  color={wdType === 'easypaisa' ? colors.primary : colors.textSecondary}
                >
                  Easypaisa
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => setWdType('bank')}
                style={[
                  styles.typePill,
                  {
                    borderColor: colors.border,
                    backgroundColor: wdType === 'bank' ? colors.primarySoft : 'transparent',
                  },
                ]}
              >
                <AppText
                  variant="smallMedium"
                  weight="bold"
                  color={wdType === 'bank' ? colors.primary : colors.textSecondary}
                >
                  Bank
                </AppText>
              </Pressable>
            </View>
            <AppInput
              label={wdType === 'easypaisa' ? 'Easypaisa number' : 'Bank account number'}
              value={wdAccount}
              onChangeText={setWdAccount}
              placeholder={wdType === 'easypaisa' ? '03xxxxxxxxx' : 'e.g. 4500123456'}
              icon={wdType === 'easypaisa' ? 'call-outline' : 'business-outline'}
              keyboardType={wdType === 'easypaisa' ? 'phone-pad' : 'numeric'}
            />
            <AppInput
              label="Account holder name"
              value={wdHolder}
              onChangeText={setWdHolder}
              placeholder="Full name"
              icon="person-outline"
            />
            <AppInput
              label="Amount (Rs)"
              value={wdAmount}
              onChangeText={setWdAmount}
              placeholder="e.g. 3000"
              icon="cash-outline"
              keyboardType="numeric"
            />
            {wdError && (
              <AppText variant="small" color={colors.danger}>
                {wdError}
              </AppText>
            )}
            <AppButton
              label="Request withdrawal"
              icon="arrow-down-circle-outline"
              loading={wdBusy}
              disabled={wdBusy}
              onPress={submitWithdrawal}
            />
          </View>
        )}

        {cashOpen && (
          <View
            style={[
              styles.panel,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              Log cash collected
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Records cash you collected for COD deliveries into your earnings wallet.
            </AppText>
            <AppInput
              label="Amount (Rs)"
              value={cashAmount}
              onChangeText={setCashAmount}
              placeholder="e.g. 1500"
              icon="cash-outline"
              keyboardType="numeric"
            />
            {cashError && (
              <AppText variant="small" color={colors.danger}>
                {cashError}
              </AppText>
            )}
            <AppButton
              label="Deposit cash"
              icon="add-circle-outline"
              loading={cashSending}
              disabled={cashSending}
              onPress={submitCashIn}
            />
          </View>
        )}

        {withdrawals.data && withdrawals.data.pendingAmount > 0 && (
          <View style={[styles.pendingNote, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <AppText variant="small" color={colors.textSecondary}>
              {formatCurrency(withdrawals.data.pendingAmount)} is reserved in pending withdrawals.
            </AppText>
          </View>
        )}

        <AppText
          variant="captionBold"
          color={colors.textMuted}
          uppercase
          style={styles.sectionTitle}
        >
          Withdrawal requests
        </AppText>

        {withdrawals.error && !withdrawals.data ? (
          <AppText variant="small" color={colors.textMuted}>
            Couldn&#39;t load withdrawal requests.
          </AppText>
        ) : wdList.length === 0 ? (
          <AppText variant="body" color={colors.textMuted}>
            No withdrawal requests yet.
          </AppText>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            {wdList.map((wd, i) => (
              <React.Fragment key={wd.id}>
                {i > 0 && <Divider spacing={0} />}
                <View style={styles.wdRow}>
                  <View style={[styles.wdIcon, { backgroundColor: colors.surfaceMuted }]}>
                    <Ionicons name={WD_ICON[wd.status]} size={16} color={colors.textSecondary} />
                  </View>
                  <View style={styles.wdInfo}>
                    <AppText
                      variant="title"
                      weight="bold"
                      color={colors.textPrimary}
                      numberOfLines={1}
                    >
                      {formatCurrency(wd.amount)} to{' '}
                      {wd.destinationType === 'easypaisa' ? 'Easypaisa' : 'bank'}
                    </AppText>
                    <AppText variant="small" color={colors.textMuted}>
                      {wd.reference} · {timeAgo(wd.createdAt)}
                    </AppText>
                    {wd.status === 'rejected' && wd.rejectReason && (
                      <AppText variant="small" color={colors.danger}>
                        {wd.rejectReason}
                      </AppText>
                    )}
                    {wd.status === 'paid' && wd.payoutReference && (
                      <AppText variant="small" color={colors.textSecondary}>
                        Tx {wd.payoutReference}
                      </AppText>
                    )}
                  </View>
                  <View style={styles.wdRight}>
                    <Badge label={wd.status} tone={WD_TONE[wd.status]} />
                    {wd.status === 'pending' && (
                      <Pressable
                        onPress={() => cancelRequest(wd.id)}
                        disabled={cancelId === wd.id}
                        hitSlop={8}
                      >
                        <AppText variant="micro" color={colors.danger}>
                          {cancelId === wd.id ? 'Cancelling…' : 'Cancel'}
                        </AppText>
                      </Pressable>
                    )}
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <AppText
          variant="captionBold"
          color={colors.textMuted}
          uppercase
          style={styles.sectionTitle}
        >
          Transactions
        </AppText>

        {wallet.error && !wallet.data ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Couldn't load wallet"
            message="Pull to retry."
            onAction={() => wallet.refetch()}
            compact
          />
        ) : transactions.length === 0 ? (
          <AppText variant="body" color={colors.textMuted}>
            No transactions yet.
          </AppText>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
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
      <View
        style={[
          styles.txIcon,
          { backgroundColor: credit ? colors.successSoft : colors.surfaceMuted },
        ]}
      >
        <Ionicons
          name={credit ? 'arrow-down' : 'arrow-up'}
          size={16}
          color={credit ? colors.success : colors.textSecondary}
        />
      </View>
      <View style={styles.txInfo}>
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
          {tx.title}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {tx.subtitle} · {timeAgo(tx.at)}
        </AppText>
      </View>
      <AppText
        variant="title"
        weight="extraBold"
        color={credit ? colors.success : colors.textPrimary}
      >
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
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.l,
  },
  settlementBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.s,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: spacing.sm },
  panel: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typePill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: spacing.s,
    alignItems: 'center',
  },
  pendingNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 14,
    padding: spacing.m,
    alignItems: 'center',
  },
  sectionTitle: { marginTop: spacing.xs, marginBottom: spacing.xs },
  card: { borderRadius: 20, borderWidth: 1, paddingHorizontal: spacing.m },
  wdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  wdIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wdInfo: { flex: 1, gap: 2 },
  wdRight: { alignItems: 'flex-end', gap: 4 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: { flex: 1 },
});
