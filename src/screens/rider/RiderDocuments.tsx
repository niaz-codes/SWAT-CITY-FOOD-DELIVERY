import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Badge } from '../../components/Badge';
import { Divider } from '../../components/Divider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderDocuments'>;

type DocStatus = 'approved' | 'pending' | 'action';

const DOCS: { label: string; detail: string; status: DocStatus }[] = [
  { label: 'CNIC', detail: 'CNIC · 17301-4829112-3', status: 'approved' },
  { label: 'Driving license', detail: 'HTV license · valid to 2028', status: 'approved' },
  { label: 'Vehicle registration', detail: 'Suzuki Rickshaw · ABC-8542', status: 'approved' },
  { label: 'Police character certificate', detail: 'Submitted 12 Sep', status: 'pending' },
  { label: 'Bank / JazzCash account', detail: 'JazzCash · 0340 5551122', status: 'action' },
];

export function RiderDocumentsScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Documents & verification" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={[styles.badgeIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="shield-checkmark" size={26} color={colors.success} />
          </View>
          <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>Verification on track</AppText>
          <AppText variant="small" color={colors.textSecondary} style={styles.statusText}>
            Your profile is 90% complete. One action item and one pending review remain.
          </AppText>
        </View>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {DOCS.map((doc, i) => (
            <React.Fragment key={doc.label}>
              <DocRow doc={doc} onUpload={() => success(`${doc.label} updated`)} />
              {i < DOCS.length - 1 && <Divider spacing={0} />}
            </React.Fragment>
          ))}
        </View>

        <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Documents are reviewed by our Swat trust & safety team. You will be notified once verification completes.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function DocRow({ doc, onUpload }: { doc: { label: string; detail: string; status: DocStatus }; onUpload: () => void }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.docRow, { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.docInfo}>
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={1}>{doc.label}</AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>{doc.detail}</AppText>
      </View>
      {doc.status === 'approved' && <Badge label="Approved" tone="success" icon="checkmark-circle" />}
      {doc.status === 'pending' && <Badge label="In review" tone="warning" icon="time" />}
      {doc.status === 'action' && (
        <Pressable
          style={[styles.actionPill, { backgroundColor: colors.primary }]}
          onPress={() => {
            haptics.light();
            onUpload();
          }}
        >
          <AppText variant="microBold" color="#FFFFFF">UPDATE</AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  statusCard: { borderRadius: 22, borderWidth: 1, padding: spacing.l, alignItems: 'center', gap: spacing.xs, overflow: 'hidden' },
  badgeIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  statusText: { textAlign: 'center' },
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.m, paddingVertical: spacing.sm, minHeight: 64 },
  docInfo: { flex: 1 },
  actionPill: { paddingHorizontal: spacing.sm, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: spacing.sm, borderRadius: 16, padding: spacing.m, alignItems: 'flex-start' },
  noteText: { flex: 1 },
});