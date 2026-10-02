import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { MapComponent } from '../../components/MapComponent';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderNavigation'>;

const TURNS = [
  { icon: 'navigate-outline', label: 'Head east on Mingora Road towards Fizagat Chowk', distance: '350 m' },
  { icon: 'return-down-forward-outline', label: 'Turn right onto Sawat Road', distance: '1.2 km' },
  { icon: 'arrow-forward-circle-outline', label: 'Continue straight through Saidu Sharif Chowk', distance: '900 m' },
  { icon: 'navigate-outline', label: 'Keep left onto Green View Colony road', distance: '700 m' },
  { icon: 'flag-outline', label: 'Arrive at drop-off · the destination is on your right', distance: 'Arrive' },
] as const;

export function RiderNavigationScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const [step, setStep] = useState(0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Navigation"
        onBack={() => navigation.goBack()}
        right={
          <View style={[styles.etaPill, { backgroundColor: colors.success }]}>
            <AppText variant="microBold" color="#FFFFFF">ETA 8 MIN</AppText>
          </View>
        }
      />

      <View style={styles.mapWrap}>
        <MapComponent pickup={{ x: 0.28, y: 0.72 }} dropoff={{ x: 0.72, y: 0.3 }} height={200} rounded={0} />
        <View style={[styles.mapOverlay, { backgroundColor: colors.overlay }]}>
          <Ionicons name="navigate" size={16} color="#FFFFFF" />
          <AppText variant="smallMedium" weight="semiBold" color="#FFFFFF">Follow voice guidance</AppText>
        </View>
      </View>

      <View style={[styles.instruction, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={[styles.dirIcon, { backgroundColor: colors.rideSoft }]}>
          <Ionicons name={TURNS[step]?.icon ?? 'navigate-outline'} size={28} color={colors.ride} />
        </View>
        <View style={styles.dirText}>
          <AppText variant="title" weight="bold" color={colors.textPrimary}>
            {TURNS[step]?.label ?? ''}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>{TURNS[step]?.distance ?? ''}</AppText>
        </View>
      </View>

      <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.listTitle}>
        Trip steps
      </AppText>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        {TURNS.map((turn, i) => (
          <Pressable
            key={i}
            onPress={() => {
              haptics.light();
              setStep(i);
            }}
            style={[styles.turn, { backgroundColor: i === step ? colors.rideSoft : 'transparent', borderRadius: 14 }]}
          >
            <Ionicons name={i === step ? 'radio-button-on' : 'ellipse-outline'} size={16} color={i === step ? colors.ride : colors.textMuted} />
            <View style={styles.turnInfo}>
              <AppText variant="small" weight={i === step ? 'bold' : 'regular'} color={colors.textPrimary} numberOfLines={2}>
                {turn.label}
              </AppText>
              <AppText variant="micro" color={colors.textMuted}>{turn.distance}</AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.m, backgroundColor: colors.surfaceRaised }]}>
        <AppButton
          label={step < TURNS.length - 1 ? 'Next step' : 'I have arrived'}
          icon={step < TURNS.length - 1 ? 'arrow-down-outline' : 'flag-outline'}
          size="lg"
          onPress={() => {
            if (step < TURNS.length - 1) {
              haptics.light();
              setStep((s) => s + 1);
            } else {
              haptics.success();
              success('Arrived at destination');
              navigation.goBack();
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  etaPill: { paddingHorizontal: spacing.s, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mapWrap: { position: 'relative' },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.m,
    height: 34,
    borderRadius: 17,
  },
  instruction: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, borderRadius: 20, borderWidth: 1, padding: spacing.m, margin: spacing.m, marginBottom: 0 },
  dirIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dirText: { flex: 1, gap: 2 },
  listTitle: { paddingHorizontal: spacing.m, marginTop: spacing.sm },
  body: { padding: spacing.m },
  turn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  turnInfo: { flex: 1, gap: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)', padding: spacing.m, paddingTop: spacing.sm },
});