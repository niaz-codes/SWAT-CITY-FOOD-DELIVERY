import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { ErrorState } from '../../components/EmptyState';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { useAsyncData } from '../../hooks/useAsyncData';
import { transferApi, type TransferInstructions } from '../../services/api';
import { apiErrorMessage } from '../../services/client';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualTransfer'>;

/** Same cap the server enforces on the receipt upload (multer 5MB). */
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/**
 * The same shape the transaction-reference validation runs on the server
 * (4–60 chars, starting alphanumeric). Spaces are accepted here — the server
 * normalises them to hyphens before storing.
 */
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_/\s]{3,59}$/;

/** One label/value line of the receiving account. Value is selectable so a
 * customer without a clipboard button can still long-press-copy it. */
function AccountRow({ label, value }: { label: string; value: string }) {
  const { colors } = useThemeColors();
  const { success } = useToast();
  const copy = () => {
    haptics.light();
    Clipboard.setStringAsync(value).catch(() =>
      // Rare on Android builds; the selectable text stays as the manual path.
      success(`${label} — long-press the value to copy it`),
    );
    success(`${label} copied`);
  };
  return (
    <View style={styles.accountRow}>
      <AppText variant="small" color={colors.textMuted}>
        {label}
      </AppText>
      <View style={styles.accountValueRow}>
        <AppText variant="body" weight="semiBold" color={colors.textPrimary} selectable>
          {value}
        </AppText>
        <Pressable onPress={copy} hitSlop={8} style={styles.copyBtn}>
          <Ionicons name="copy-outline" size={14} color={colors.primary} />
          <AppText variant="micro" color={colors.primary} weight="semiBold">
            Copy
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

export function PaymentProofScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, error: toastError } = useToast();

  const details = useAsyncData(() => transferApi.details(orderId), [orderId]);

  const [ref, setRef] = useState('');
  const [prefilledFrom, setPrefilledFrom] = useState('');

  const [receipt, setReceipt] = useState<{
    uri: string;
    mimeType?: string;
    fileSize?: number;
    /**
     * The compressed bytes as base64, read by the picker itself. The upload
     * sends THIS as the file part — a `content://` stream part is exactly the
     * thing some Android builds cannot open inside multipart, which used to
     * kill the Submit button with "Network unreachable" before a single byte
     * left the phone.
     */
    base64?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Upload percent while the receipt is on the wire (XHR progress). */
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  const data: TransferInstructions | null = details.data;

  // A rejected proof is resubmitted pre-filled with the previous reference —
  // the admin's failure reason explains what to correct, and re-typing the
  // same reference is the common case (only the receipt changed). Adjusted
  // during render (React's "you might not need an effect" pattern, as used in
  // Checkout) so the pre-fill lands with the data instead of an effect tick.
  const rejectedRef =
    data?.payment?.status === 'rejected' ? (data.payment.transactionRef ?? '') : '';
  if (rejectedRef && rejectedRef !== prefilledFrom) {
    setPrefilledFrom(rejectedRef);
    setRef(rejectedRef);
  }

  const pickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toastError('Allow photo access to attach your transfer receipt.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        // Base64 comes free with the compression pass: the submit uses these
        // bytes directly instead of reopening a content:// stream.
        base64: true,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;
      if (asset.fileSize && asset.fileSize > MAX_RECEIPT_BYTES) {
        toastError('That image is bigger than 5 MB. Please pick a smaller screenshot.');
        return;
      }
      haptics.light();
      setReceipt({
        uri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
        fileSize: asset.fileSize,
        base64: asset.base64 ?? undefined,
      });
    } catch (e) {
      toastError(apiErrorMessage(e, 'Could not open the picker. Please try again.'));
    }
  };

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        toastError('Allow camera access to photograph your transfer receipt.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        exif: false,
        // Same reason as the gallery picker: bytes travel via base64.
        base64: true,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;
      if (asset.fileSize && asset.fileSize > MAX_RECEIPT_BYTES) {
        toastError('That photo is bigger than 5 MB. Please retake it in a smaller size.');
        return;
      }
      haptics.light();
      setReceipt({
        uri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
        fileSize: asset.fileSize,
        base64: asset.base64 ?? undefined,
      });
    } catch (e) {
      toastError(apiErrorMessage(e, 'Could not open the camera. Please try again.'));
    }
  };

  /** The customer chooses the source: their saved screenshot or the camera. */
  const chooseReceiptSource = () => {
    haptics.light();
    Alert.alert(
      'Payment proof',
      'Upload the screenshot of your transfer receipt.',
      [
        { text: 'Choose from gallery', onPress: () => void pickFromGallery() },
        { text: 'Take a photo', onPress: () => void takePhoto() },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const paymentStatus = data?.payment?.status ?? null;
  const alreadySubmitted = paymentStatus === 'pending_verification';
  const verified = paymentStatus === 'paid';
  // The form only makes sense while the server still accepts a (re)submission
  // — see manualProofSubmissionError on the backend. paid/pending_verification/
  // cancelled/refunded are states the server refuses, so they render as
  // status cards instead of a form.
  const showForm =
    paymentStatus === null ||
    paymentStatus === 'pending' ||
    paymentStatus === 'processing' ||
    paymentStatus === 'rejected' ||
    paymentStatus === 'failed';

  const refTrimmed = ref.trim();
  const refValid = REF_PATTERN.test(refTrimmed.replace(/\s+/g, '-')) || REF_PATTERN.test(refTrimmed);
  const canSubmit = refValid && Boolean(receipt) && !submitting;

  const submit = async () => {
    if (!receipt || !refValid || submitting) return;
    haptics.medium();
    setSubmitting(true);
    setUploadPct(null);
    try {
      const res = await transferApi.submit(orderId, {
        transactionRef: refTrimmed,
        imageUri: receipt.uri,
        mimeType: receipt.mimeType,
        base64: receipt.base64,
        onProgress: (percent) => setUploadPct(percent),
      });
      success(res.message);
      navigation.replace('OrderTracking', { orderId });
    } catch (e) {
      // 409/400 messages from the server are customer-facing copy and shown
      // verbatim (duplicate proof, reference already used, attempts exhausted…).
      toastError(apiErrorMessage(e, 'Could not submit your payment. Please try again.'));
      setSubmitting(false);
      setUploadPct(null);
    }
  };

  if (details.loading && !data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Payment instructions" onBack={() => navigation.goBack()} elevated />
        <View style={styles.center}>
          <AppText variant="body" color={colors.textMuted}>
            Loading transfer details…
          </AppText>
        </View>
      </View>
    );
  }

  if (details.error && !data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Payment instructions" onBack={() => navigation.goBack()} elevated />
        <ErrorState onRetry={details.refetch} />
      </View>
    );
  }

  const account = data?.account;
  if (!data || !account) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader title="Payment instructions" onBack={() => navigation.goBack()} elevated />
        <ErrorState onRetry={details.refetch} />
      </View>
    );
  }

  const attemptsLeft = data.attemptsLeft;
  const attemptsLow = !verified && !alreadySubmitted && attemptsLeft <= 2;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Payment instructions" onBack={() => navigation.goBack()} elevated />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Order + exact amount ------------------------------------------------ */}
        <View
          style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <View style={styles.orderRow}>
            <View style={[styles.orderIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            </View>
            <AppText variant="body" weight="semiBold" color={colors.textPrimary} selectable>
              {data.order.orderNumber}
            </AppText>
          </View>
          <View style={[styles.amountTile, { backgroundColor: colors.primarySoft }]}>
            <AppText variant="small" weight="semiBold" color={colors.primaryStrong}>
              Transfer exactly this amount
            </AppText>
            <AppText variant="h4" weight="extraBold" color={colors.primaryStrong}>
              {formatCurrency(data.order.total)}
            </AppText>
          </View>
        </View>

        {/* Receiving account ---------------------------------------------------- */}
        <View
          style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <AppText variant="captionBold" color={colors.textPrimary} uppercase>
            {account.label}
          </AppText>
          {account.bankName ? <AccountRow label="Bank" value={account.bankName} /> : null}
          {account.accountTitle ? (
            <AccountRow label="Account title" value={account.accountTitle} />
          ) : null}
          {account.accountNumber ? (
            <AccountRow label="Account number" value={account.accountNumber} />
          ) : null}
          {account.iban ? <AccountRow label="IBAN" value={account.iban} /> : null}
          {account.branch ? <AccountRow label="Branch" value={account.branch} /> : null}
          <AppText variant="micro" color={colors.textMuted} style={styles.copyHint}>
            Long-press any value to copy it.
          </AppText>
        </View>

        {/* Server-provided how-to ---------------------------------------------- */}
        {account.instructions ? (
          <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <AppText variant="captionBold" color={colors.textPrimary} uppercase>
              How to pay
            </AppText>
            <AppText variant="small" color={colors.textSecondary} style={styles.instructions}>
              {account.instructions}
            </AppText>
          </View>
        ) : null}

        {/* The honesty rule ---------------------------------------------------- */}
        <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.warning} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Payment is confirmed only after an admin verifies your transfer against the bank
            statement. A screenshot alone is not payment.
          </AppText>
        </View>

        {attemptsLow && (
          <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
              {attemptsLeft} submission attempt{attemptsLeft === 1 ? '' : 's'} left for this order.
            </AppText>
          </View>
        )}

        {/* Already verified ----------------------------------------------------- */}
        {verified && (
          <View style={[styles.stateCard, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              Payment verified
            </AppText>
            <AppText variant="small" color={colors.textSecondary} style={styles.stateSub}>
              Your transfer was confirmed by an admin. Thank you!
            </AppText>
            <View style={styles.stateAction}>
              <AppButton
                label="Go to order tracking"
                onPress={() => navigation.replace('OrderTracking', { orderId })}
              />
            </View>
          </View>
        )}

        {/* Waiting for the admin ------------------------------------------------ */}
        {alreadySubmitted && data.payment && (
          <View style={[styles.stateCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="hourglass-outline" size={40} color={colors.warning} />
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              Waiting for admin verification
            </AppText>
            <AppText variant="small" color={colors.textSecondary} style={styles.stateSub}>
              Your payment proof is with our team. The order is confirmed once the transfer is
              verified against the bank statement.
            </AppText>
            {data.payment.transactionRef ? (
              <AppText variant="small" color={colors.textMuted} selectable>
                Reference {data.payment.transactionRef}
              </AppText>
            ) : null}
            {data.payment.submittedAt ? (
              <AppText variant="micro" color={colors.textMuted}>
                Submitted {new Date(data.payment.submittedAt).toLocaleString()}
              </AppText>
            ) : null}
            <View style={styles.stateAction}>
              <AppButton
                label="Go to order tracking"
                variant="secondary"
                onPress={() => navigation.replace('OrderTracking', { orderId })}
              />
            </View>
          </View>
        )}

        {/* Rejected: warn, then let the customer resubmit ------------------------ */}
        {paymentStatus === 'rejected' && data.payment && (
          <View style={[styles.note, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
            <View style={styles.noteText}>
              <AppText variant="small" weight="semiBold" color={colors.danger}>
                Your proof was not verified
              </AppText>
              <AppText variant="small" color={colors.textSecondary}>
                {data.payment.failureReason ?? 'Please resubmit corrected payment proof.'}
              </AppText>
            </View>
          </View>
        )}

        {/* Proof form ------------------------------------------------------------ */}
        {showForm && (
          <View
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <AppText variant="captionBold" color={colors.textPrimary} uppercase>
              {paymentStatus === 'rejected' ? 'Resubmit corrected proof' : 'Submit your proof'}
            </AppText>

            <AppText variant="small" color={colors.textMuted} style={styles.fieldLabel}>
              Transaction / reference ID
            </AppText>
            <TextInput
              value={ref}
              onChangeText={setRef}
              placeholder="e.g. TXN-123456789"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!submitting}
              style={[
                styles.refInput,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: ref.length > 0 && !refValid ? colors.danger : colors.border,
                  color: colors.textPrimary,
                },
              ]}
            />
            {ref.length > 0 && !refValid && (
              <AppText variant="micro" color={colors.danger}>
                Enter the reference from your receipt (4–60 characters).
              </AppText>
            )}

            <AppText variant="small" color={colors.textMuted} style={styles.fieldLabel}>
              Receipt screenshot
            </AppText>
            <Pressable
              onPress={chooseReceiptSource}
              disabled={submitting}
              style={[
                styles.receiptRow,
                { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
              ]}
            >
              {receipt ? (
                <Image source={{ uri: receipt.uri }} style={styles.receiptThumb} />
              ) : (
                <View
                  style={[styles.receiptThumb, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.receiptInfo}>
                <AppText variant="small" weight="semiBold" color={colors.textPrimary}>
                  {receipt ? 'Receipt attached' : 'Attach payment screenshot'}
                </AppText>
                <AppText variant="micro" color={colors.textMuted}>
                  {receipt
                    ? 'Tap to choose a different image'
                    : 'Gallery or camera · up to 5 MB · tap to choose'}
                </AppText>
              </View>
              <Ionicons
                name={receipt ? 'checkmark-circle' : 'add-circle-outline'}
                size={22}
                color={receipt ? colors.success : colors.primary}
              />
            </Pressable>

            <View style={styles.submitWrap}>
              <AppButton
                label={paymentStatus === 'rejected' ? 'Submit corrected payment proof' : 'Submit payment for verification'}
                onPress={() => void submit()}
                loading={submitting}
                disabled={!canSubmit}
              />
              {/* Upload progress (XHR onprogress) — on slow mobile links a
                  silent spinner reads as a dead button. Showing the percent
                  tells the customer the bytes ARE moving. */}
              {submitting && uploadPct !== null && uploadPct < 100 && (
                <AppText variant="micro" color={colors.textMuted} style={styles.uploadHint}>
                  Uploading receipt… {uploadPct}%
                </AppText>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.m, gap: spacing.sm },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  orderIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountTile: {
    borderRadius: 16,
    padding: spacing.m,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  accountRow: { gap: 2, marginTop: spacing.xxs },
  accountValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(14,148,136,0.35)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  copyHint: { marginTop: spacing.xxs },
  instructions: { marginTop: spacing.xxs },
  note: {
    flexDirection: 'row',
    gap: spacing.s,
    borderRadius: 16,
    padding: spacing.m,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1 },
  stateCard: {
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  stateSub: { textAlign: 'center' },
  stateAction: { alignSelf: 'stretch', marginTop: spacing.s },
  fieldLabel: { marginTop: spacing.xs },
  refInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.sm,
  },
  receiptThumb: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  receiptInfo: { flex: 1, gap: 2 },
  submitWrap: { marginTop: spacing.sm },
  uploadHint: { marginTop: spacing.xxs, textAlign: 'center' },
});
