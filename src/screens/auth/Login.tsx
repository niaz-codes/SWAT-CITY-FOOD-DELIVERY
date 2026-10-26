import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { userHome } from '../../navigation/roleHome';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { BrandLogo } from '../../components/BrandLogo';
import { InlineBanner } from '../../components/InlineBanner';
import { GoogleSignInButton, OrDivider } from '../../components/GoogleSignInButton';
import { authApi } from '../../services/api';
import { googleAuthConfigured, signInWithGoogle } from '../../services/googleAuth';
import { apiErrorMessage } from '../../services/client';
import { useAuth } from '../../state/AuthContext';

import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { isValidEmail } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type Banner = { kind: 'error' | 'info'; text: string } | null;

export function LoginScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const { setUser } = useAuth();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const emailOk = isValidEmail(email);
  const passwordOk = password.length > 0;

  /**
   * Email + password sign-in, step 1.
   *
   * The backend verifies the credentials and emails a 6-digit code; the session
   * is only created once that code is confirmed on the EmailOtp screen.
   */
  const handlePasswordLogin = async () => {
    if (loading) return;
    if (!emailOk) {
      setBanner({ kind: 'error', text: 'Enter a valid email address.' });
      haptics.warning();
      return;
    }
    if (!passwordOk) {
      setBanner({ kind: 'error', text: 'Enter your password.' });
      haptics.warning();
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const challenge = await authApi.login(email, password);
      haptics.success();
      navigation.navigate('EmailOtp', {
        challengeToken: challenge.challengeToken,
        email: challenge.email,
        purpose: 'login',
        ttlSeconds: challenge.ttlSeconds,
      });
    } catch (err) {
      haptics.warning();
      setBanner({
        kind: 'error',
        text: apiErrorMessage(err, 'Sign in failed. Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Google sign-in, customer accounts only.
   *
   * The account chooser runs first, then the resulting ID token is exchanged
   * for a session on the backend, which verifies the token and signs in an
   * existing customer or registers a new one on the spot (Google has already
   * verified the email, so there is no phone step). A cancelled picker is not
   * an error and stays silent.
   */
  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setBanner(null);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'cancelled') return;
      if (result.status === 'error') {
        setBanner({ kind: 'error', text: result.message });
        return;
      }

      const outcome = await authApi.googleLogin(result.idToken);
      await setUser(outcome.user);
      if (outcome.created) haptics.success();
      // Google sign-in can only ever yield a customer, so this lands on Main.
      // userHome is still used so the routing rule stays in one place.
      navigation.replace(userHome(outcome.user.role));
    } catch (err) {
      haptics.warning();
      setBanner({
        kind: 'error',
        text: apiErrorMessage(err, 'Google sign-in failed. Please try again.'),
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const cardWidth = Math.min(width - spacing.l * 2, 440);

  return (
    <LinearGradient
      colors={[colors.primary, colors.background]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.32 }}
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeInUp.duration(500)} style={styles.brand}>
              <BrandLogo size={84} />
              <AppText
                variant="h2"
                weight="extraBold"
                color={colors.textPrimary}
                center
                style={styles.brandTitle}
              >
                Swat City Food Delivery
              </AppText>
              <AppText variant="body" color={colors.textMuted} center style={styles.tagline}>
                Order delicious food from Swat&apos;s best kitchens and book rides across the
                valley.
              </AppText>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.card}>
              <View
                style={[
                  styles.cardInner,
                  {
                    width: cardWidth,
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                  },
                ]}
              >
                <AppText variant="h4" weight="bold" color={colors.textPrimary}>
                  Welcome back
                </AppText>
                <AppText variant="small" color={colors.textMuted}>
                  Sign in with the email and password on your account.
                </AppText>

                <AppInput
                  label="Email address"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (banner) setBanner(null);
                  }}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  icon="mail-outline"
                  containerStyle={styles.field}
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
                <AppInput
                  label="Password"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (banner) setBanner(null);
                  }}
                  placeholder="Your password"
                  icon="lock-closed-outline"
                  secure={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onRightPress={() => setShowPassword((s) => !s)}
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordLogin}
                  hint="At least 8 characters with a letter and a number."
                />

                <Pressable
                  onPress={() => {
                    haptics.light();
                    navigation.navigate('ForgotPassword');
                  }}
                  hitSlop={6}
                  style={styles.forgotLink}
                >
                  <AppText
                    variant="small"
                    weight="semiBold"
                    color={colors.primary}
                    style={styles.forgotLabel}
                  >
                    Forgot password?
                  </AppText>
                </Pressable>

                {banner ? <InlineBanner kind={banner.kind} message={banner.text} /> : null}

                <AppButton
                  label={loading ? 'Sending your code…' : 'Login'}
                  onPress={handlePasswordLogin}
                  loading={loading}
                  icon="arrow-forward"
                  iconPosition="right"
                  size="lg"
                  style={styles.cta}
                />

                <View style={styles.otpHint}>
                  <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                  <AppText variant="caption" color={colors.textMuted} style={styles.otpHintText}>
                    We email a 6-digit code to confirm it&apos;s you.
                  </AppText>
                </View>

                {googleAuthConfigured && (
                  <View style={styles.googleBlock}>
                    <OrDivider />
                    <GoogleSignInButton onPress={handleGoogle} loading={googleLoading} />
                  </View>
                )}
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
              <AppButton
                label="Create an account"
                variant="soft"
                size="md"
                onPress={() => navigation.navigate('Register')}
              />
              <AppButton
                label="Become a rider"
                variant="ghost"
                size="sm"
                onPress={() => navigation.navigate('RiderRegistration')}
              />
              <AppText variant="micro" color={colors.textMuted} center style={styles.legal}>
                By continuing you agree to our{' '}
                <AppText
                  variant="micro"
                  weight="bold"
                  color={colors.primary}
                  onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
                >
                  Terms of Service
                </AppText>{' '}
                and{' '}
                <AppText
                  variant="micro"
                  weight="bold"
                  color={colors.primary}
                  onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
                >
                  Privacy Policy
                </AppText>
              </AppText>
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
  card: { width: '100%', alignItems: 'center' },
  cardInner: {
    borderRadius: 26,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.sm,
  },
  field: { marginTop: spacing.xs },
  forgotLink: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  forgotLabel: { textAlign: 'right' },
  cta: { marginTop: spacing.sm },
  otpHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  otpHintText: { flex: 1 },
  googleBlock: { marginTop: spacing.l, gap: spacing.m },
  footer: {
    marginTop: spacing.xl,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  legal: { marginTop: spacing.xs, paddingHorizontal: spacing.s },
});
