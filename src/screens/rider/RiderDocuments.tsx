import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Badge } from '../../components/Badge';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { riderApi } from '../../services/riderApi';
import { apiErrorMessage } from '../../services/client';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderDocuments'>;

const DOCS: { key: string; label: string; hint: string }[] = [
  { key: 'cnic_front', label: 'CNIC front', hint: 'Front of your CNIC card' },
  { key: 'cnic_back', label: 'CNIC back', hint: 'Reverse side of your CNIC' },
  { key: 'license', label: 'Driving license', hint: 'Valid license in your name' },
  { key: 'vehicle_reg', label: 'Vehicle registration', hint: 'Blue book / registration card' },
];

const MAX_DOC_BYTES = 5 * 1024 * 1024;

function latestOf<T extends { createdAt: string }>(rows: T[]): T | undefined {
  if (!rows.length) return undefined;
  return rows.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a));
}

export function RiderDocumentsScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, error: toastError } = useToast();
  const documents = useAsyncData(() => riderApi.documents(), []);
  const [uploadingKey, setUploadingKey] = React.useState<string | null>(null);

  const statusOf = (key: string): 'missing' | 'pending' | 'approved' | 'rejected' => {
    const latest = latestOf((documents.data ?? []).filter((d) => d.type === key));
    if (!latest) return 'missing';
    if (latest.status === 'approved') return 'approved';
    if (latest.status === 'rejected') return 'rejected';
    return 'pending';
  };

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
      await riderApi.uploadDocument(asset.uri, doc.key, /\.png(\?|$)/i.test(asset.uri) ? 'doc.png' : 'doc.jpg');
      success(`${doc.label} submitted for review`);
      await documents.refetch();
    } catch (err) {
      toastError(apiErrorMessage(err, `Could not upload ${doc.label.toLowerCase()}. Try again.`));
    } finally {
      setUploadingKey(null);
    }
  };

  const rows = documents.data ?? [];
  const statuses = DOCS.map((d) => statusOf(d.key));
  const approvedCount = statuses.filter((s) => s === 'approved').length;
  const items = DOCS.map((doc, i) => ({ doc, status: statuses[i]! }));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Documents & verification" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={[styles.badgeIcon, { backgroundColor: approvedCount === DOCS.length ? colors.successSoft : colors.primarySoft }]}>
            <Ionicons
              name={approvedCount === DOCS.length ? 'shield-checkmark' : 'shield-outline'}
              size={26}
              color={approvedCount === DOCS.length ? colors.success : colors.primary}
            />
          </View>
          <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
            {approvedCount}/{DOCS.length} documents approved
          </AppText>
          <AppText variant="small" color={colors.textSecondary} style={styles.statusText}>
            {rows.length
              ? 'Tap any document photo below to open it, or re-upload a rejected one.'
              : 'Nothing uploaded yet. Photograph each document to start the review.'}
          </AppText>
        </View>

        {documents.loading && !rows.length ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            {items.map(({ doc, status }, i) => {
              const latest = latestOf(rows.filter((d) => d.type === doc.key));
              const uploading = uploadingKey === doc.key;
              return (
                <React.Fragment key={doc.key}>
                  <View style={[styles.docRow, { backgroundColor: colors.surfaceRaised }]}>
                    <Pressable style={styles.docInfo} onPress={() => latest && haptics.light()}>
                      <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>
                        {doc.label}
                      </AppText>
                      <AppText
                        variant="small"
                        color={status === 'rejected' ? colors.danger : colors.textMuted}
                        numberOfLines={2}
                      >
                        {status === 'missing'
                          ? `No upload yet · ${doc.hint}`
                          : status === 'rejected'
                            ? `${latest?.reviewNote ?? 'Rejected'} · tap to re-upload`
                            : status === 'approved'
                              ? `Approved${latest ? ` · ${new Date(latest.createdAt).toLocaleDateString()}` : ''}`
                              : 'In review by trust & safety'}
                      </AppText>
                    </Pressable>
                    {status === 'approved' && <Badge label="Approved" tone="success" icon="checkmark-circle" />}
                    {status === 'pending' && <Badge label="In review" tone="warning" icon="time" />}
                    {status === 'missing' && <Badge label="Missing" tone="danger" icon="alert-circle" />}
                    {status === 'rejected' && <Badge label="Rejected" tone="danger" icon="close-circle" />}
                    {uploading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      (status === 'missing' || status === 'rejected') && (
                        <Pressable
                          style={[styles.actionPill, { backgroundColor: colors.primary }]}
                          onPress={() => void upload(doc)}
                        >
                          <AppText variant="microBold" color="#FFFFFF">
                            UPLOAD
                          </AppText>
                        </Pressable>
                      )
                    )}
                  </View>
                  {i < items.length - 1 && <Divider spacing={0} />}
                </React.Fragment>
              );
            })}
          </View>
        )}

        <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Documents are reviewed by our Swat trust & safety team. You will be notified once
            verification completes. A rejection note always explains what to fix.
          </AppText>
        </View>

        <AppButton
          label="Refresh status"
          variant="secondary"
          onPress={() => {
            haptics.light();
            void documents.refetch();
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  statusCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: spacing.l,
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
  },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statusText: { textAlign: 'center' },
  loadingRow: { alignItems: 'center', padding: spacing.l },
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  docInfo: { flex: 1 },
  actionPill: {
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 16,
    padding: spacing.m,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1 },
});
