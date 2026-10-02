import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderVerification'>;

const DOCS: { key: string; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'cnic', label: 'CNIC front', hint: 'Clear photo showing details', icon: 'person-outline' },
  { key: 'cnicBack', label: 'CNIC back', hint: 'Clear photo of the reverse side', icon: 'card-outline' },
  { key: 'license', label: 'Driving license', hint: 'Valid, in your name', icon: 'shield-checkmark-outline' },
  { key: 'vehicle', label: 'Vehicle registration', hint: 'Blue book or registration card', icon: 'car-outline' },
];

export function RiderVerificationScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());

  const allDone = uploaded.size >= DOCS.length;
  const toggle = (key: string) => {
    haptics.medium();
    setUploaded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Verify documents" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.progressCard, { backgroundColor: colors.rideSoft }]}>
          <View style={styles.progressTop}>
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              {uploaded.size}/{DOCS.length} uploaded
            </AppText>
            <View style={[styles.progressPill, { backgroundColor: colors.ride }]}>
              <AppText variant="microBold" color="#FFFFFF">{Math.round((uploaded.size / DOCS.length) * 100)}%</AppText>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
            <View style={[styles.progressFill, { width: `${(uploaded.size / DOCS.length) * 100}%` }]} />
          </View>
          <AppText variant="small" color={colors.textSecondary}>
            Upload clear copies below. Review takes 24-48 hours.
          </AppText>
        </View>

        {DOCS.map((doc) => {
          const done = uploaded.has(doc.key);
          return (
            <Pressable
              key={doc.key}
              onPress={() => toggle(doc.key)}
              style={[styles.doc, { backgroundColor: colors.surfaceRaised, borderColor: done ? colors.ride : colors.border }]}
            >
              <View style={[styles.docIcon, { backgroundColor: done ? colors.rideSoft : colors.surfaceMuted }]}>
                <Ionicons name={doc.icon} size={22} color={done ? colors.ride : colors.textSecondary} />
              </View>
              <View style={styles.docInfo}>
                <AppText variant="title" weight="bold" color={colors.textPrimary}>{doc.label}</AppText>
                <AppText variant="small" color={colors.textMuted}>{doc.hint}</AppText>
              </View>
              {done ? (
                <View style={[styles.checkCircle, { backgroundColor: colors.success }]}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.uploadBtn, { backgroundColor: colors.rideSoft }]}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.ride} />
                </View>
              )}
            </Pressable>
          );
        })}

        <AppButton
          label={allDone ? 'Submit for review' : 'Complete uploads to continue'}
          icon="arrow-forward"
          size="lg"
          disabled={!allDone}
          onPress={() => {
            haptics.success();
            success('Documents submitted for review');
            navigation.navigate('RiderMain');
          }}
          style={styles.submit}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  progressCard: { borderRadius: 22, padding: spacing.l, gap: spacing.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressPill: { paddingHorizontal: spacing.s, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#1B84B5' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, borderRadius: 18, borderWidth: 1.5, padding: spacing.m },
  docIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  docInfo: { flex: 1 },
  checkCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  uploadBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  submit: { marginTop: spacing.sm },
});