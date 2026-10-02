import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { AppHeader } from '../../components/AppHeader';
import { BrandLogo } from '../../components/BrandLogo';
import { authApi } from '../../services/api';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useToast } from '../../state/ToastProvider';
import { haptics } from '../../hooks/useHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const { error } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  const valid =
    name.trim().length >= 3 && phone.replace(/\D/g, '').length >= 10 && email.includes('@') && agree;

  const handleRegister = async () => {
    if (!valid) {
      error('Please fill all fields and accept the terms.');
      return;
    }
    setLoading(true);
    try {
      await authApi.register(name.trim(), phone.trim(), email.trim());
      navigation.navigate('OTP', { phone: phone.trim(), name: name.trim() });
    } catch {
      error('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <AppHeader title="Create account" onBack={() => navigation.goBack()} elevated />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInUp.duration(450)} style={styles.brand}>
            <BrandLogo size={64} />
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(450)} style={styles.card}>
            <View style={[styles.cardInner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <AppText variant="h4" weight="bold" color={colors.textPrimary}>
                Let&apos;s get you started
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                Your details are safe with us.
              </AppText>

              <AppInput label="Full name" value={name} onChangeText={setName} placeholder="Ahmad Khan" icon="person-outline" autoCapitalize="words" />
              <AppInput
                label="Mobile number"
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="3XXXXXXXXXX"
                keyboardType="phone-pad"
                icon="phone-portrait-outline"
                maxLength={11}
              />
              <AppInput label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" icon="mail-outline" />

              <View style={styles.termsRow}>
                <Pressable hitSlop={8} style={styles.checkWrap} onPress={() => setAgree((a) => !a)}>
                  <View style={[styles.check, { borderColor: colors.primary, backgroundColor: agree ? colors.primary : 'transparent' }]}>
                    {agree && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
                  </View>
                  <AppText variant="small" color={colors.textMuted} style={styles.termsText}>
                    I agree to the <AppText variant="smallMedium" color={colors.primary}>Terms</AppText> and{' '}
                    <AppText variant="smallMedium" color={colors.primary}>Privacy Policy</AppText>
                  </AppText>
                </Pressable>
              </View>

              <AppButton
                label="Create account"
                onPress={handleRegister}
                loading={loading}
                icon="arrow-forward"
                iconPosition="right"
                style={styles.cta}
              />
              <Pressable onPress={() => navigation.goBack()} style={styles.loginLink}>
                <AppText variant="smallMedium" color={colors.textSecondary}>
                  Already have an account?{' '}
                  <AppText variant="smallMedium" weight="bold" color={colors.primary}>
                    Login
                  </AppText>
                </AppText>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.l, paddingTop: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.l },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  cardInner: { borderRadius: 26, borderWidth: 1, padding: spacing.l, gap: spacing.m },
  termsRow: { marginTop: spacing.xs },
  checkWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  check: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginTop: 1 },
  termsText: { flex: 1 },
  cta: { marginTop: spacing.s },
  loginLink: { alignItems: 'center', paddingVertical: spacing.sm },
});