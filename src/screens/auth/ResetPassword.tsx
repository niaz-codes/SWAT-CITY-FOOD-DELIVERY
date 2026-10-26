import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { BrandLogo } from '../../components/BrandLogo';
import { InlineBanner } from '../../components/InlineBanner';
import { authApi } from '../../services/api';
import { useThemeColors } from '../../theme';
import { fonts } from '../../theme/typography';
import { radius, sizes, spacing } from '../../theme/spacing';
import { useToast } from '../../state/ToastProvider';
import { apiErrorMessage } from '../../services/client';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

type Stage = 'form' | 'submitting' | 'done';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Step 2 of the reset flow: confirm the 6-digit code mailed by the
 * forgot-password endpoint and choose a new password. Both are sent together —
 * the code proves mailbox ownership, the password is the new credential.
 */
export function ResetPasswordScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const { colors } = useThemeColors();
  const { success } = useToast();

  const [challengeToken, setChallengeToken] = useState(route.params.challengeToken);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focused, setFocused] = useState(0);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<Stage>('form');
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const inputs = useRef<(TextInputInstance | null)[]>([]);
  const otp = digits.join('');

  // Kept in refs so the submit handler always sees the latest values without
  // being re-created on every keystroke. Refs are only written from effects
  // (never during render); events fire after effects, so handlers always see
  // the current values.
  const tokenRef = useRef(challengeToken);
  const otpRef = useRef(otp);
  useEffect(() => {
    tokenRef.current = challengeToken;
    otpRef.current = otp;
  });

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const handleChange = (value: string, index: number) => {
    const clean = value.replace(/\D/g, '');
    if (banner) setBanner(null);
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      if (index > 0) inputs.current[index - 1]?.focus();
      return;
    }
    const chars = clean.split('');
    const next = [...digits];
    let cursor = index;
    for (const ch of chars) {
      if (cursor < OTP_LENGTH) {
        next[cursor] = ch;
        cursor++;
      }
    }
    setDigits(next);
    if (cursor < OTP_LENGTH) inputs.current[cursor]?.focus();
  };

  const validate = useCallback((): string | null => {
    if (otpRef.current.length < OTP_LENGTH) return 'Enter the 6-digit code';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }, [password, confirm]);

  const handleSubmit = useCallback(async () => {
    const problem = validate();
    if (problem) {
      setBanner(problem);
      return;
    }

    setStage('submitting');
    try {
      const result = await authApi.resetPassword(tokenRef.current.trim(), otpRef.current, password);
      setStage('done');
      success(result.message);
    } catch (err) {
      setStage('form');
      setBanner(apiErrorMessage(err, 'Could not update your password. Please try again.'));
    }
  }, [validate, password, success]);

  const handleResend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    try {
      const fresh = await authApi.resendEmailOtp(tokenRef.current);
      setChallengeToken(fresh.challengeToken);
      setDigits(Array(OTP_LENGTH).fill(''));
      setSeconds(RESEND_COOLDOWN_SECONDS);
      inputs.current[0]?.focus();
      success('A new code is on its way');
    } catch (err) {
      setBanner(apiErrorMessage(err, 'Could not resend the code. Please try again.'));
    } finally {
      setResending(false);
    }
  }, [resending, success]);

  const handleBackToLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  const canSubmit = useMemo(
    () => otp.length === OTP_LENGTH && password.length >= 8,
    [otp, password],
  );

  if (stage === 'done') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Animated.View entering={FadeInUp.duration(450)} style={styles.brand}>
            <BrandLogo size={64} />
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(100).duration(450)} style={styles.doneCard}>
            <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
              <AppText variant="h3" center>
                ✓
              </AppText>
            </View>
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary} center>
              Password updated
            </AppText>
            <AppText variant="body" color={colors.textMuted} center style={styles.mutedText}>
              Your password has been changed. Sign in with your new password to continue.
            </AppText>
            <AppButton
              label="Back to login"
              onPress={handleBackToLogin}
              size="lg"
              style={styles.fullWidth}
            />
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
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
            <AppText
              variant="h3"
              weight="extraBold"
              color={colors.textPrimary}
              center
              style={styles.title}
            >
              Choose a new password
            </AppText>
            <AppText variant="body" color={colors.textMuted} center>
              Enter the 6-digit code we emailed to
            </AppText>
            <AppText variant="bodyMedium" weight="bold" color={colors.textPrimary}>
              {email}
            </AppText>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(120).duration(450)} style={styles.card}>
            <View
              style={[
                styles.cardInner,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <AppText variant="smallMedium" weight="bold" color={colors.textSecondary}>
                Verification code
              </AppText>
              <View style={styles.boxes}>
                {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                  const active = focused === i;
                  return (
                    <TextInput
                      key={i}
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      value={digits[i]}
                      onChangeText={(v) => handleChange(v, i)}
                      onFocus={() => setFocused(i)}
                      onBlur={() => setFocused(-1)}
                      keyboardType="number-pad"
                      maxLength={OTP_LENGTH}
                      selectTextOnFocus
                      caretHidden
                      style={[
                        styles.box,
                        {
                          backgroundColor: colors.surfaceMuted,
                          color: colors.textPrimary,
                          fontFamily: fonts.extraBold,
                          borderColor: active ? colors.primary : colors.border,
                          borderWidth: active ? 2 : 1,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              <View style={styles.resendRow}>
                <AppText variant="small" color={colors.textMuted}>
                  Didn&apos;t receive the code?{' '}
                </AppText>
                {seconds > 0 ? (
                  <AppText variant="smallMedium" weight="bold" color={colors.textSecondary}>
                    Resend in {seconds}s
                  </AppText>
                ) : (
                  <Pressable onPress={() => void handleResend()} disabled={resending}>
                    <AppText variant="smallMedium" weight="bold" color={colors.primary}>
                      {resending ? 'Sending…' : 'Resend code'}
                    </AppText>
                  </Pressable>
                )}
              </View>

              {banner ? <InlineBanner kind="error" message={banner} /> : null}

              <AppText
                variant="h4"
                weight="bold"
                color={colors.textPrimary}
                style={styles.newPassTitle}
              >
                New password
              </AppText>

              <PasswordField
                label="Password"
                value={password}
                onChangeText={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoComplete="new-password"
              />

              <PasswordField
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoComplete="new-password"
                onSubmitEditing={() => void handleSubmit()}
              />

              <AppText variant="caption" color={colors.textMuted}>
                Use at least 8 characters with a mix of letters and numbers.
              </AppText>

              <AppButton
                label="Update password"
                onPress={handleSubmit}
                loading={stage === 'submitting'}
                disabled={!canSubmit}
                size="lg"
                style={styles.cta}
              />
              <Pressable
                onPress={handleBackToLogin}
                style={styles.link}
                disabled={stage === 'submitting'}
              >
                <AppText variant="smallMedium" color={colors.primary}>
                  Back to login
                </AppText>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type PasswordFieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete?: 'new-password';
  onSubmitEditing?: () => void;
};

function PasswordField({
  label,
  value,
  onChangeText,
  visible,
  onToggle,
  autoComplete,
  onSubmitEditing,
}: PasswordFieldProps) {
  const { colors } = useThemeColors();

  return (
    <View style={styles.field}>
      <AppText
        variant="smallMedium"
        weight="bold"
        color={colors.textSecondary}
        style={styles.fieldLabel}
      >
        {label}
      </AppText>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          onSubmitEditing={onSubmitEditing}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.textPrimary, fontFamily: fonts.medium }]}
        />
        <Pressable onPress={onToggle} hitSlop={10} style={styles.toggle}>
          <AppText variant="smallMedium" color={colors.primary}>
            {visible ? 'Hide' : 'Show'}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.l },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.l },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  title: { marginTop: spacing.m },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  cardInner: { borderRadius: 26, borderWidth: 1, padding: spacing.l, gap: spacing.sm },
  boxes: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.xs },
  box: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    fontSize: 22,
    textAlign: 'center',
  },
  resendRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  newPassTitle: { marginTop: spacing.m },
  field: { gap: 6 },
  fieldLabel: { marginBottom: 2 },
  inputWrap: {
    height: sizes.input,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
  },
  input: { flex: 1, fontSize: 16 },
  toggle: { paddingLeft: spacing.sm },
  cta: { marginTop: spacing.m },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  fullWidth: { width: '100%', maxWidth: 400, marginTop: spacing.l },
  doneCard: { width: '100%', maxWidth: 400, alignItems: 'center' },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  mutedText: { marginTop: spacing.s },
});

export default ResetPasswordScreen;
