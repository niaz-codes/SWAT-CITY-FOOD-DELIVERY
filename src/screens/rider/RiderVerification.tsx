import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { riderApi } from '../../services/riderApi';
import { apiErrorMessage } from '../../services/client';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderVerification'>;

type DocStatus = 'missing' | 'pending' | 'approved' | 'rejected';

/** The four document slots the backend's rider approval flow requires. */
const DOCS: {
  key: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'cnic_front', label: 'CNIC front', hint: 'Clear photo showing details', icon: 'person-outline' },
  { key: 'cnic_back', label: 'CNIC back', hint: 'Clear photo of the reverse side', icon: 'card-outline' },
  { key: 'license', label: 'Driving license', hint: 'Valid, in your name', icon: 'shield-checkmark-outline' },
  { key: 'vehicle_reg', label: 'Vehicle registration', hint: 'Blue book or registration card', icon: 'car-outline' },
];

const MAX_DOC_BYTES = 5 * 1024 * 1024;

export function RiderVerificationScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, error: toastError } = useToast();

  const documents = useAsyncData(() => riderApi.documents(), []);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const statusFor = useCallback(
    (doc: (typeof DOCS)[number]): { status: DocStatus; note?: string } => {
      const rows = documents.data?.filter((d) => d.type === doc.key) ?? [];
      if (!rows.length) return { status: 'missing' };
      const latest = rows.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a));
      // The label column accepts any of the four types; map it defensively.
      if (latest.status === 'approved') return { status: 'approved' };
      if (latest.status === 'rejected')
        return { status: 'rejected', note: latest.reviewNote ?? undefined };
      return { status: 'pending' };
    },
    [documents.data],
  );

  useEffect(() => {
    documents.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (doc: (typeof DOCS)[number]) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera access needed',
          'Allow camera access to photograph your documents. You can enable it in Settings.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;
      if (asset.fileSize && asset.fileSize > MAX_DOC_BYTES) {
        Alert.alert(
          'Image is too large',
          'That photo is bigger than 5 MB and cannot be uploaded. Please retake it in a lower resolution.',
        );
        return;
      }

      haptics.medium();
      setUploadingKey(doc.key);
      await riderApi.uploadDocument(asset.uri, doc.key, /\.png(\?|$)/i.test(asset.uri) ? 'document.png' : 'document.jpg');
      success(`${doc.label} submitted for review`);
      await documents.refetch();
    } catch (err) {
      toastError(apiErrorMessage(err, `Could not upload ${doc.label.toLowerCase()}. Try again.`));
    } finally {
      setUploadingKey(null);
    }
  };

  const rows = documents.data ?? [];
  const decided = DOCS.map((d) => statusFor(d));
  const filled = decided.filter((s) => s.status !== 'missing').length;
  const approved = decided.filter((s) => s.status === 'approved').length;
  const rejected = decided.filter((s) => s.status === 'rejected').length;
  const pending = decided.filter((s) => s.status === 'pending').length;

  const headline =
    rejected > 0
      ? 'A document needs another look'
      : pending > 0 || (filled > 0 && filled < DOCS.length)
        ? 'Verification in progress'
        : approved === DOCS.length
          ? 'Verification approved'
          : 'Upload your documents';
  const subline =
    rejected > 0
      ? 'A rejected document has a note below — tap it to upload a better copy.'
      : approved === DOCS.length
        ? 'All documents are approved. You are ready to take deliveries.'
        : filled === 0
          ? 'Photograph all four documents below. Review takes 24–48 hours once every one is in.'
          : `${filled}/${DOCS.length} uploaded. You will be notified as each one is reviewed.`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Verify documents" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.progressCard, { backgroundColor: rejected > 0 ? colors.dangerSoft : colors.rideSoft }]}>
          <View style={styles.progressTop}>
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              {headline}
            </AppText>
            <View style={[styles.progressPill, { backgroundColor: rejected > 0 ? colors.danger : colors.ride }]}>
              <AppText variant="microBold" color="#FFFFFF">
                {Math.round((filled / DOCS.length) * 100)}%
              </AppText>
            </View>
          </View>
          <AppText variant="small" color={colors.textSecondary}>
            {subline}
          </AppText>
        </View>

        {rows.length === 0 && documents.loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {DOCS.map((doc, i) => {
          const state = decided[i]!;
          const uploading = uploadingKey === doc.key;
          const borderColor =
            state.status === 'approved'
              ? colors.success
              : state.status === 'rejected'
                ? colors.danger
                : colors.border;
          return (
            <Pressable
              key={doc.key}
              onPress={() => void upload(doc)}
              disabled={uploading}
              style={[styles.doc, { backgroundColor: colors.surfaceRaised, borderColor }]}
            >
              <View
                style={[
                  styles.docIcon,
                  {
                    backgroundColor:
                      state.status === 'approved'
                        ? colors.successSoft
                        : state.status === 'rejected'
                          ? colors.dangerSoft
                          : colors.surfaceMuted,
                  },
                ]}
              >
                <Ionicons
                  name={doc.icon}
                  size={22}
                  color={
                    state.status === 'approved'
                      ? colors.success
                      : state.status === 'rejected'
                        ? colors.danger
                        : colors.textSecondary
                  }
                />
              </View>
              <View style={styles.docInfo}>
                <AppText variant="title" weight="bold" color={colors.textPrimary}>
                  {doc.label}
                </AppText>
                <AppText variant="small" color={colors.textMuted} numberOfLines={state.note ? 2 : 1}>
                  {state.status === 'approved'
                    ? 'Approved by the review team'
                    : state.status === 'rejected'
                      ? `Rejected${state.note && typeof state.note === 'string' ? `: ${state.note}` : ''}`
                      : state.status === 'pending'
                        ? 'Submitted · being reviewed'
                        : `To upload · ${doc.hint}`}
                </AppText>
              </View>
              {uploading ? (
                <ActivityIndicator color={colors.ride} />
              ) : state.status === 'approved' ? (
                <View style={[styles.checkCircle, { backgroundColor: colors.success }]}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.uploadBtn, { backgroundColor: colors.rideSoft }]}>
                  <Ionicons
                    name={state.status === 'missing' ? 'cloud-upload-outline' : 'refresh-outline'}
                    size={18}
                    color={colors.ride}
                  />
                </View>
              )}
            </Pressable>
          );
        })}

        <AppButton
          label="Refresh status"
          variant="secondary"
          onPress={() => {
            haptics.light();
            void documents.refetch();
          }}
          style={styles.submit}
        />

        <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Booking assignments unlock once the Swat trust & safety team approves your profile —
            re-uploading only the rejected spot is enough.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  progressCard: { borderRadius: 22, padding: spacing.l, gap: spacing.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressPill: {
    paddingHorizontal: spacing.s,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: spacing.m,
  },
  docIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: { alignItems: 'center', padding: spacing.m },
  submit: { marginTop: spacing.sm },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 16,
    padding: spacing.m,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1 },
});
