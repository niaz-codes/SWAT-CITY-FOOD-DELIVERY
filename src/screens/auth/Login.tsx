import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { BrandLogo } from '../../components/BrandLogo';
import { authApi } from '../../services/api';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const { error } = useToast();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    setLoading(true);
    const result = await authApi.login(phone);
    setLoading(false);
    if (!result.ok) {
      error(result.message);
      return;
    }
    navigation.navigate('OTP', { phone, name: undefined });
  };

  return (
    <LinearGradient colors={[colors.primary, colors.background]} style={styles.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.32 }}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeInUp.duration(500)} style={styles.brand}>
              <BrandLogo size={84} />
              <AppText variant="h2" weight="extraBold" color={colors.textPrimary} style={styles.brandTitle}>
                Welcome to Swat City
              </AppText>
              <AppText variant="body" color={colors.textMuted} center style={styles.tagline}>
                Order delicious food from Swat&apos;s best kitchens and book rides across the valley.
              </AppText>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.card}>
              <View style={[styles.cardInner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <AppText variant="h4" weight="bold" color={colors.textPrimary}>
                  Login with mobile number
                </AppText>
                <AppText variant="small" color={colors.textMuted}>
                  We&apos;ll send a one-time passcode to verify.
                </AppText>

                <View style={styles.phoneRow}>
                  <View style={[styles.codeChip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                    <AppText variant="title" weight="bold" color={colors.textPrimary}>
                      +92
                    </AppText>
                  </View>
                  <AppInput
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 11))}
                    placeholder="3XXXXXXXXXX"
                    keyboardType="phone-pad"
                    icon="phone-portrait-outline"
                    containerStyle={styles.inputWrap}
                    maxLength={11}
                    autoFocus
                  />
                </View>

                <AppButton label="Continue" onPress={handleNext} loading={loading} icon="arrow-forward" iconPosition="right" style={styles.cta} />

                </View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(220).duration(500)} style={styles.footer}>
              <View style={styles.dividerRow}>
                <View style={[styles.line, { backgroundColor: colors.border }]} />
                <AppText variant="caption" color={colors.textMuted}>
                  NEW HERE?
                </AppText>
                <View style={[styles.line, { backgroundColor: colors.border }]} />
              </View>
              <AppButton label="Create an account" variant="soft" size="md" onPress={() => navigation.navigate('Register')} />
              <AppButton label="Become a rider" variant="ghost" size="sm" onPress={() => navigation.navigate('RiderRegistration')} />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.l, paddingTop: spacing.xxl },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  brandTitle: { marginTop: spacing.l },
  tagline: { maxWidth: 300, marginTop: spacing.s },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  cardInner: {
    borderRadius: 26,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.sm,
  },
  phoneRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.s },
  codeChip: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  inputWrap: { flex: 1 },
  cta: { marginTop: spacing.l },
  footer: { marginTop: spacing.xl, gap: spacing.sm, width: '100%', maxWidth: 440, alignSelf: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});