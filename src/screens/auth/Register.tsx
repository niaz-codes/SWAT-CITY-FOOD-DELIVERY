import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
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
import { InlineBanner } from '../../components/InlineBanner';
import { authApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useToast } from '../../state/ToastProvider';
import { isValidEmail } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const { success } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const emailOk = isValidEmail(email);

  /**
   * Email + password sign-up. The account is created unverified and a 6-digit
   * code is emailed, so the new customer confirms it on the EmailOtp screen
   * before a session is issued.
   */
  const handleRegister = async () => {
    if (loading) return;
    if (!name.trim() || name.trim().length < 3) {
      setBanner('Enter your full name');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setBanner('Enter a valid mobile number');
      return;
    }
    if (!emailOk) {
      setBanner('Enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setBanner('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setBanner('Password must contain a letter and a number');
      return;
    }
    if (!agree) {
      setBanner('Please accept the Terms and Privacy Policy');
      return;
    }

    setLoading(true);
    setBanner(null);
    try {
      const challenge = await authApi.register({
        name: name.trim(),
        phone,
        email: email.trim(),
        password,
      });
      success('We emailed you a 6-digit code');
      navigation.navigate('EmailOtp', {
        challengeToken: challenge.challengeToken,
        email: challenge.email,
        purpose: 'register',
        ttlSeconds: challenge.ttlSeconds,
      });
    } catch (err) {
      setBanner(apiErrorMessage(err, 'Could not create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <AppHeader title="Create account" onBack={() => navigation.goBack()} elevated />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(450)} style={styles.brand}>
            <BrandLogo size={64} />
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(450)} style={styles.card}>
            <View
              style={[
                styles.cardInner,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <AppText variant="h4" weight="bold" color={colors.textPrimary}>
                Let&apos;s get you started
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                Your details are safe with us.
              </AppText>

              <AppInput
                label="Full name"
                value={name}
                onChangeText={setName}
                placeholder="Ahmad Khan"
                icon="person-outline"
                autoCapitalize="words"
              />
              <AppInput
                label="Mobile number"
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="3XXXXXXXXXX"
                keyboardType="phone-pad"
                icon="phone-portrait-outline"
                maxLength={11}
              />
              <AppInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                icon="mail-outline"
                autoCapitalize="none"
              />
              <AppInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="8+ characters, letters and numbers"
                icon="lock-closed-outline"
                secure={!showPassword}
                autoCapitalize="none"
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightPress={() => setShowPassword((s) => !s)}
                hint="Use 8 or more characters."
              />

              <View style={styles.termsRow}>
                <Pressable hitSlop={8} style={styles.checkWrap} onPress={() => setAgree((a) => !a)}>
                  <View
                    style={[
                      styles.check,
                      {
                        borderColor: colors.primary,
                        backgroundColor: agree ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {agree && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
                  </View>
                </Pressable>
                {/* Tapping the sentence ticks the box; the nested links below
                    capture their own touches first and open the documents. */}
                <Pressable onPress={() => setAgree((a) => !a)} style={styles.termsText}>
                  <AppText variant="small" color={colors.textMuted}>
                    I agree to the{' '}
                    <AppText
                      variant="smallMedium"
                      color={colors.primary}
                      onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
                    >
                      Terms
                    </AppText>{' '}
                    and{' '}
                    <AppText
                      variant="smallMedium"
                      color={colors.primary}
                      onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
                    >
                      Privacy Policy
                    </AppText>
                  </AppText>
                </Pressable>
              </View>

              <AppButton
                label={loading ? 'Creating your account…' : 'Create account'}
                onPress={handleRegister}
                loading={loading}
                icon="arrow-forward"
                iconPosition="right"
                style={styles.cta}
              />
              {banner ? (
                <InlineBanner kind="error" message={banner} style={styles.banner} />
              ) : null}
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  checkWrap: { paddingTop: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginTop: 1,
  },
  termsText: { flex: 1 },
  cta: { marginTop: spacing.s },
  banner: { marginTop: spacing.s },
  loginLink: { alignItems: 'center', paddingVertical: spacing.sm },
});
