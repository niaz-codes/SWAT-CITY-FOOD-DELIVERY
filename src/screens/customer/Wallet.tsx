import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { Divider } from '../../components/Divider';
import { ErrorState } from '../../components/EmptyState';
import {
  walletApi,
  walletTransfer,
  walletTopupCreate,
  walletTopupStatus,
  walletTopupVerify,
  topupIdempotencyKey,
  type WalletTopup,
} from '../../services/api';
import { apiErrorMessage } from '../../services/client';
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
  const navigation = useNavigation<Nav>();
  const { success, error, info } = useToast();
  const wallet = useAsyncData(() => walletApi(), []);

  const [transferOpen, setTransferOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupPhone, setTopupPhone] = useState('');
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupNotice, setTopupNotice] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState(false);
  const [activeTopup, setActiveTopup] = useState<WalletTopup | null>(null);

  // Resume an in-flight top-up so a user who left during payment can confirm it.
  useEffect(() => {
    let mounted = true;
    walletTopupStatus()
      .then((s) => {
        if (!mounted || !s.payment) return;
        const st = s.payment.status;
        if (st === 'processing' || st === 'pending') {
          setActiveTopup(s.payment);
          setTopupNotice('A top-up is awaiting confirmation in the Easypaisa app.');
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const balance = wallet.data?.balance ?? 0;
  const transactions = wallet.data?.transactions ?? [];

  const submitTransfer = async () => {
    const amountNum = Number(transferAmount);
    const recipientPhone = phone.trim();
    if (!recipientPhone || !Number.isFinite(amountNum) || amountNum <= 0) {
      setSendError('Enter the recipient phone number and an amount above 0.');
      return;
    }
    if (amountNum > balance) {
      setSendError(`Insufficient balance. You have ${formatCurrency(balance)}.`);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await walletTransfer(recipientPhone, amountNum);
      success(`Rs ${amountNum} sent to ${recipientPhone}`);
      setPhone('');
      setTransferAmount('');
      setTransferOpen(false);
      await wallet.refetch();
    } catch (err) {
      error(apiErrorMessage(err, 'Transfer failed. Check the number and your balance.'));
    } finally {
      setSending(false);
    }
  };

  const submitTopup = async () => {
    const amountNum = Number(topupAmount);
    const easypaisaPhone = topupPhone.trim();
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setTopupError('Enter an amount above 0.');
      return;
    }
    if (!easypaisaPhone) {
      setTopupError('Enter the Easypaisa mobile number you will pay from.');
      return;
    }
    setTopupBusy(true);
    setTopupError(null);
    setTopupNotice(null);
    try {
      const res = await walletTopupCreate(amountNum, easypaisaPhone, topupIdempotencyKey());
      if (!res.configured) {
        setTopupError(
          'Online top-up needs a payment gateway and is not set up yet. You can still transfer funds from another wallet.',
        );
        info('Online top-up needs a payment gateway — coming soon.');
        return;
      }
      if (!res.payment) {
        setTopupError('Could not start the payment. Try again.');
        return;
      }
      setActiveTopup(res.payment);
      setTopupNotice(
        `Payment of ${formatCurrency(amountNum)} initiated. Complete it in the Easypaisa app using ${easypaisaPhone}, then confirm here.`,
      );
    } catch (err) {
      setTopupError(apiErrorMessage(err, 'Could not start the top-up. Try again.'));
    } finally {
      setTopupBusy(false);
    }
  };

  const confirmTopup = async () => {
    if (!activeTopup) return;
    setTopupBusy(true);
    setTopupError(null);
    setTopupNotice(null);
    try {
      const { payment, result } = await walletTopupVerify(activeTopup.id);
      setActiveTopup(payment ?? activeTopup);
      if (result.status === 'paid') {
        success('Top-up confirmed. Balance updated.');
        setTopupAmount('');
        setTopupPhone('');
        setTopupOpen(false);
        setTopupNotice(null);
        await wallet.refetch();
      } else if (result.status === 'failed') {
        setTopupError(result.reason || 'This top-up failed. Please try again.');
      } else {
        setTopupNotice(
          result.reason && result.reason !== result.status
            ? result.reason
            : 'Not confirmed yet — finish the payment in the Easypaisa app, then tap Confirm again.',
        );
      }
    } catch (err) {
      setTopupError(apiErrorMessage(err, 'Could not confirm the payment. Try again.'));
    } finally {
      setTopupBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Swat Wallet"
        onBack={embedded ? undefined : () => navigation.goBack()}
        hideBack={embedded}
        elevated
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={wallet.refreshing}
            onRefresh={wallet.onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <LinearGradient
          colors={['#0E9488', '#0B7A71']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceCircleOne} />
          <View style={styles.balanceCircleTwo} />
          <View style={styles.balanceHeader}>
            <AppText variant="caption" color="rgba(255,255,255,0.85)" uppercase>
              Available balance
            </AppText>
            <Ionicons name="wallet" size={22} color="rgba(255,255,255,0.9)" />
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
          <View style={styles.cardFooter}>
            <AppText variant="small" color="rgba(255,255,255,0.85)">
              Customer · Ahmad Khan
            </AppText>
            <View style={styles.cardBadge}>
              <AppText variant="microBold" color="#FFFFFF">
                SWAT PAY
              </AppText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.quickRow}>
          <QuickAction
            icon="add-circle-outline"
            label="Add money"
            onPress={() => {
              setTopupOpen((v) => !v);
              setTopupError(null);
              setTopupNotice(null);
            }}
          />
          <QuickAction
            icon="swap-horizontal-outline"
            label="Transfer"
            onPress={() => {
              setSendError(null);
              setTransferOpen((v) => !v);
            }}
          />
          <QuickAction icon="receipt-outline" label="History" onPress={() => {}} />
        </View>

        {transferOpen && (
          <View
            style={[
              styles.panel,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              Send money
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Transfer balance to another Swat City Food Delivery account by phone number.
            </AppText>
            <AppInput
              label="Recipient phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="03xxxxxxxxx"
              icon="call-outline"
              keyboardType="phone-pad"
              maxLength={15}
            />
            <AppInput
              label="Amount (Rs)"
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="e.g. 500"
              icon="cash-outline"
              keyboardType="numeric"
            />
            {sendError && (
              <AppText variant="small" color={colors.danger}>
                {sendError}
              </AppText>
            )}
            <AppButton
              label="Transfer"
              icon="swap-horizontal-outline"
              loading={sending}
              disabled={sending}
              onPress={submitTransfer}
            />
          </View>
        )}

        {topupOpen && (
          <View
            style={[
              styles.panel,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              Add money via Easypaisa
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Top up your wallet by paying through the Easypaisa app. Funds land after the payment
              is confirmed.
            </AppText>
            {!activeTopup ? (
              <>
                <AppInput
                  label="Amount (Rs)"
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  placeholder="e.g. 1000"
                  icon="cash-outline"
                  keyboardType="numeric"
                />
                <AppInput
                  label="Your Easypaisa number"
                  value={topupPhone}
                  onChangeText={setTopupPhone}
                  placeholder="03xxxxxxxxx"
                  icon="call-outline"
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                {topupError && (
                  <AppText variant="small" color={colors.danger}>
                    {topupError}
                  </AppText>
                )}
                <AppButton
                  label="Start payment"
                  icon="card-outline"
                  loading={topupBusy}
                  disabled={topupBusy}
                  onPress={submitTopup}
                />
              </>
            ) : (
              <>
                <View style={[styles.topupSummary, { backgroundColor: colors.surfaceMuted }]}>
                  <AppText variant="body" weight="bold" color={colors.textPrimary}>
                    {formatCurrency(activeTopup.amount)}
                  </AppText>
                  <AppText variant="micro" color={colors.textMuted}>
                    Ref {(activeTopup.transactionRef ?? activeTopup.id).slice(0, 16)} ·{' '}
                    {activeTopup.status}
                  </AppText>
                </View>
                {topupNotice && (
                  <AppText variant="small" color={colors.textSecondary}>
                    {topupNotice}
                  </AppText>
                )}
                {topupError && (
                  <AppText variant="small" color={colors.danger}>
                    {topupError}
                  </AppText>
                )}
                <AppButton
                  label="I have paid — confirm"
                  icon="checkmark-circle-outline"
                  loading={topupBusy}
                  disabled={topupBusy}
                  onPress={confirmTopup}
                />
                <AppButton
                  label="Cancel payment"
                  icon="close-circle-outline"
                  variant="ghost"
                  disabled={topupBusy}
                  onPress={() => {
                    setActiveTopup(null);
                    setTopupNotice(null);
                    setTopupError(null);
                  }}
                />
              </>
            )}
          </View>
        )}

        <SectionHeader label="Recent transactions" />

        {wallet.error && !wallet.data ? (
          <ErrorState onRetry={wallet.refetch} compact />
        ) : transactions.length === 0 ? (
          <AppText variant="body" color={colors.textMuted}>
            No transactions yet.
          </AppText>
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

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
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
      <View
        style={[
          styles.txIcon,
          { backgroundColor: credit ? colors.successSoft : colors.dangerSoft },
        ]}
      >
        <Ionicons
          name={credit ? 'arrow-down' : 'arrow-up'}
          size={18}
          color={credit ? colors.success : colors.danger}
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
  flex: { flex: 1 },
  body: { padding: spacing.m, paddingBottom: spacing.xxl, gap: spacing.sm },
  balanceCard: { borderRadius: 26, padding: spacing.l, overflow: 'hidden', gap: spacing.xs },
  balanceCircleOne: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    top: -70,
    right: -40,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  balanceCircleTwo: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    bottom: -34,
    left: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.l,
  },
  cardBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.s,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quick: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: spacing.m,
    alignItems: 'center',
    gap: spacing.xs,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: { marginTop: spacing.m, marginBottom: spacing.xs },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  txIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: { flex: 1 },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 16,
    padding: spacing.m,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1 },
  topupSummary: { borderRadius: 14, padding: spacing.m, gap: 2, alignItems: 'center' },
});
