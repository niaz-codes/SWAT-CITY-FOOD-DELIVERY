import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { BrandLogo } from '../../components/BrandLogo';
import { authApi } from '../../services/api';
import { useThemeColors } from '../../theme';
import { fonts } from '../../theme/typography';
import { radius, sizes, spacing } from '../../theme/spacing';
import { useToast } from '../../state/ToastProvider';
import { apiErrorMessage } from '../../services/client';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

type Stage = 'form' | 'submitting' | 'done';

/**
 * Password reset, opened from the `swatcity://reset-password#token=...` link in
 * the Brevo email. The token arrives in the URL fragment, which browsers and
 * mail clients do not send to the server, and which Expo Linking strips off the
 * `path` - so the link carries it twice:
 *
 *   swatcity://reset-password?token=abc123        <- used when the app is
 *                                                    already running (URL handler)
 *   swatcity://reset-password#token=abc123        <- canonical, used on cold
 *                                                    start and by the web page
 *
 * `token` from the route param wins; the fragment is re-read from the raw URL
 * as a fallback.
 */
export function ResetPasswordScreen({ navigation, route }: Props) {
  const { colors } = useThemeColors();
  const { success, error } = useToast();

  const [token, setToken] = useState<string>(route.params?.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<Stage>('form');
  const [checking, setChecking] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Kept in a ref so the submit handler always sees the latest value without
  // being re-created on every keystroke.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Validate the token as soon as we have one so the user learns about an
  // expired link before typing a new password.
  useEffect(() => {
    const value = tokenRef.current.trim();
    if (!value || checking) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await authApi.verifyResetToken(value);
        if (cancelled) return;
        if (!result.valid) {
          setTokenError(result.message);
        } else {
          setTokenError(null);
        }
      } catch {
        if (!cancelled) {
          setTokenError('Could not verify this link. Request a new one.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, checking]);

  const validate = useCallback((): string | null => {
    if (!tokenRef.current.trim()) return 'This reset link is missing its token.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }, [password, confirm]);

  const handleSubmit = useCallback(async () => {
    const problem = validate();
    if (problem) {
      error(problem);
      return;
    }

    setStage('submitting');
    try {
      const result = await authApi.resetPassword(tokenRef.current.trim(), password);
      setStage('done');
      success(result.message);
    } catch (err) {
      setStage('form');
      error(apiErrorMessage(err, 'Could not update your password. Please try again.'));
    }
  }, [validate, password, success, error]);

  const handleResend = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

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
              onPress={handleResend}
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
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary} center style={styles.title}>
              Choose a new password
            </AppText>
            <AppText variant="body" color={colors.textMuted} center>
              This link is single-use and expires shortly.
            </AppText>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(120).duration(450)} style={styles.card}>
            <View style={[styles.cardInner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              {tokenError ? (
                <View style={[styles.alert, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
                  <AppText variant="small" color={colors.danger}>
                    {tokenError}
                  </AppText>
                </View>
              ) : null}

              <AppText variant="h4" weight="bold" color={colors.textPrimary}>
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
                disabled={Boolean(tokenError)}
                size="lg"
                style={styles.cta}
              />
              <Pressable onPress={handleResend} style={styles.link} disabled={stage === 'submitting'}>
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
      <AppText variant="smallMedium" weight="bold" color={colors.textSecondary} style={styles.fieldLabel}>
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
  alert: { borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, marginBottom: spacing.xs },
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