import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppInput } from '../../components/AppInput';
import { AppButton } from '../../components/AppButton';
import { Chip } from '../../components/Chip';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderRegistration'>;

const VEHICLES = ['bike', 'rickshaw', 'sedan', 'van'] as const;

export function RiderRegistrationScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { error, info } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [city, setCity] = useState('Mingora');
  const [vehicle, setVehicle] = useState<(typeof VEHICLES)[number]>('bike');
  const [experience, setExperience] = useState('');

  const valid =
    name.trim().length >= 3 &&
    phone.replace(/\D/g, '').length >= 10 &&
    cnic.trim().length >= 13 &&
    experience.trim().length > 0;

  const submit = () => {
    if (!valid) {
      haptics.warning();
      error('Please complete all required fields');
      return;
    }
    haptics.success();
    info(`Registration received for ${vehicle} partner`);
    navigation.navigate('RiderVerification');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Become a partner" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: colors.rideSoft }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.ride }]}>
            <Ionicons name="bicycle-outline" size={24} color="#FFFFFF" />
          </View>
          <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
            Earn on your own time
          </AppText>
          <AppText variant="small" color={colors.textSecondary} style={styles.introText}>
            Deliver food and ride customers across Swat Valley. Keep 76% of every fare plus tips.
          </AppText>
        </View>

        <AppText variant="captionBold" color={colors.textMuted} uppercase>Your details</AppText>
        <AppInput label="Full name" icon="person-outline" placeholder="e.g. Shahid Rehman" value={name} onChangeText={setName} autoCapitalize="words" />
        <AppInput label="Mobile number" icon="call-outline" placeholder="03XX XXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={11} />
        <AppInput label="CNIC number" icon="card-outline" placeholder="xxxxx-xxxxxxx-x" keyboardType="number-pad" value={cnic} onChangeText={setCnic} maxLength={15} />
        <AppInput label="Base city" icon="location-outline" placeholder="Mingora" value={city} onChangeText={setCity} />

        <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.blockTitle}>Vehicle</AppText>
        <View style={styles.chips}>
          {VEHICLES.map((v) => (
            <Chip
              key={v}
              label={v.charAt(0).toUpperCase() + v.slice(1)}
              leadingEmoji={v === 'bike' ? '🛵' : v === 'rickshaw' ? '🛺' : v === 'sedan' ? '🚗' : '🚐'}
              selected={vehicle === v}
              onPress={() => {
                haptics.light();
                setVehicle(v);
              }}
            />
          ))}
        </View>

        <AppInput
          label="Years of riding experience"
          icon="school-outline"
          placeholder="e.g. 2 years"
          keyboardType="number-pad"
          value={experience}
          onChangeText={setExperience}
          maxLength={2}
          hint="Minimum 1 year required"
        />

        <AppButton label="Continue" icon="arrow-forward" size="lg" onPress={submit} disabled={!valid} style={styles.submit} />
        <AppText variant="micro" color={colors.textMuted} style={styles.legal}>
          By continuing you agree to the Swat City partner terms. Your documents will be verified in 24-48 hours.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  intro: { borderRadius: 22, padding: spacing.l, gap: spacing.xs, alignItems: 'center' },
  introIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  introText: { textAlign: 'center' },
  blockTitle: { marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  submit: { marginTop: spacing.sm },
  legal: { textAlign: 'center' },
});