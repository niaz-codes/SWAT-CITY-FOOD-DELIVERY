import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  type TextInputInstance,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { userHome } from '../../navigation/roleHome';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { BrandLogo } from '../../components/BrandLogo';
import { InlineBanner } from '../../components/InlineBanner';
import { authApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useThemeColors } from '../../theme';
import { fonts } from '../../theme/typography';
import { radius, spacing } from '../../theme/spacing';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastProvider';
import { haptics } from '../../hooks/useHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailOtp'>;

const OTP_LENGTH = 6;

/**
 * How long the "resend" action stays locked.
 *
 * The code is produced by Supabase Auth, which refuses a second code for the
 * same address inside its own 60 second window. Offering a resend earlier only
 * produced a confusing error, so the countdown matches what the provider
 * actually allows.
 */
const RESEND_COOLDOWN_SECONDS = 60;

type Banner = { kind: 'error' | 'success'; text: string } | null;

/**
 * Step 2 of every email-OTP flow (login + registration).
 *
 * The 6-digit code mailed by the login / register endpoint is confirmed here.
 * Only on success does the backend mint a session, so a password (or a
 * registration form) alone is never enough to sign in.
 */
export function EmailOtpScreen({ navigation, route }: Props) {
  const { email, purpose } = route.params;
  const { colors } = useThemeColors();
  const { setUser } = useAuth();
  const { success } = useToast();
  const { width } = useWindowDimensions();

  // The challenge token can change on resend, so it lives in state.
  const [challengeToken, setChallengeToken] = useState(route.params.challengeToken);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  // The digits are also kept in a ref so two quick keystrokes can never read a
  // stale copy - on Android a delete and a type can arrive in the same tick,
  // and a dropped digit is a code the user cannot see.
  const digitsRef = useRef<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const [banner, setBanner] = useState<Banner>(null);
  const inputs = useRef<(TextInputInstance | null)[]>([]);
  const [focused, setFocused] = useState(0);

  // The boxes must fit every Android phone, from a 320dp budget to a tablet.
  const box = useMemo(() => {
    const horizontalPadding = spacing.l * 2;
    const cardPadding = spacing.l * 2;
    const usable = Math.min(width, 460) - horizontalPadding - cardPadding;
    const gap = spacing.s;
    const size = Math.floor((usable - gap * (OTP_LENGTH - 1)) / OTP_LENGTH);
    const boxWidth = Math.max(34, Math.min(52, size));
    return { width: boxWidth, height: Math.round(boxWidth * 1.32), gap };
  }, [width]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  // A rejected code shakes the boxes. The animation is driven by a tick that
  // the animated style re-reads, which keeps the shake off the render path.
  const [shakeTick, setShakeTick] = useState(0);

  const handleVerify = useCallback(
    async (code?: string) => {
      const otp = code ?? digits.join('');
      if (otp.length < OTP_LENGTH) {
        setBanner({ kind: 'error', text: 'Enter the 6-digit code from your email.' });
        return;
      }
      if (loading) return;
      setLoading(true);
      setBanner(null);
      try {
        const user = await authApi.verifyEmailOtp(challengeToken, otp);
        await setUser(user);
        haptics.success();
        success('Verified. Welcome to Swat City Food Delivery!');
        navigation.reset({ index: 0, routes: [{ name: userHome(user.role) }] });
      } catch (err) {
        setShakeTick((tick) => tick + 1);
        const cleared = Array(OTP_LENGTH).fill('');
        digitsRef.current = cleared;
        setDigits(cleared);
        inputs.current[0]?.focus();
        haptics.warning();
        setBanner({ kind: 'error', text: apiErrorMessage(err, 'Invalid code. Please try again.') });
      } finally {
        setLoading(false);
      }
    },
    [challengeToken, digits, loading, navigation, setUser, success],
  );

  const handleChange = useCallback(
    (value: string, index: number) => {
      const clean = value.replace(/\D/g, '');
      // Backspace on an empty box: move to the previous one so the user can
      // keep correcting without lifting a finger.
      if (!clean) {
        const next = [...digitsRef.current];
        next[index] = '';
        digitsRef.current = next;
        setDigits(next);
        setBanner(null);
        if (index > 0) inputs.current[index - 1]?.focus();
        return;
      }
      // A paste arrives as several characters at once - fill the boxes from
      // the current one onwards so "123456" lands in the right place.
      const chars = clean.split('');
      const next = [...digitsRef.current];
      let cursor = index;
      for (const ch of chars) {
        if (cursor < OTP_LENGTH) {
          next[cursor] = ch;
          cursor += 1;
        }
      }
      digitsRef.current = next;
      setDigits(next);
      setBanner(null);
      if (cursor < OTP_LENGTH) {
        inputs.current[cursor]?.focus();
        return;
      }
      // The last box is filled - verify straight away so the user does not
      // have to press the button as well.
      inputs.current[OTP_LENGTH - 1]?.blur();
      void handleVerify(next.join(''));
    },
    [handleVerify],
  );

  const handleResend = useCallback(async () => {
    if (resending || seconds > 0) return;
    setResending(true);
    setBanner(null);
    try {
      const fresh = await authApi.resendEmailOtp(challengeToken);
      setChallengeToken(fresh.challengeToken);
      const cleared = Array(OTP_LENGTH).fill('');
      digitsRef.current = cleared;
      setDigits(cleared);
      setSeconds(RESEND_COOLDOWN_SECONDS);
      inputs.current[0]?.focus();
      haptics.light();
      setBanner({ kind: 'success', text: 'A new code is on its way. Check your inbox.' });
    } catch (err) {
      haptics.warning();
      setBanner({
        kind: 'error',
        text: apiErrorMessage(err, 'Could not resend the code. Please try again.'),
      });
    } finally {
      setResending(false);
    }
  }, [challengeToken, resending, seconds]);

  // A rejected code shakes the boxes. The animation is driven by a tick the
  // animated style re-reads, so the shake never touches a shared value from
  // the render path.
  const shakeStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateX:
            shakeTick > 0
              ? withSequence(
                  withTiming(-9, { duration: 60 }),
                  withTiming(9, { duration: 60 }),
                  withTiming(-6, { duration: 60 }),
                  withTiming(6, { duration: 60 }),
                  withTiming(0, { duration: 60 }),
                )
              : 0,
        },
      ],
    }),
    [shakeTick],
  );

  const isRegister = purpose === 'register';

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
          <Animated.View entering={FadeInUp.duration(450)} style={styles.header}>
            <BrandLogo size={72} />
            <AppText
              variant="h3"
              weight="extraBold"
              color={colors.textPrimary}
              center
              style={styles.title}
            >
              {isRegister ? 'Verify your email' : 'Enter your security code'}
            </AppText>
            <AppText variant="body" color={colors.textMuted} center style={styles.subtitle}>
              {isRegister
                ? 'We sent a 6-digit code to your email. Enter it below to finish signing up.'
                : 'We sent a 6-digit code to your email. Enter it below to sign in.'}
            </AppText>
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.emailChip, { backgroundColor: colors.primarySoft }]}
              accessibilityRole="button"
            >
              <Ionicons name="mail-outline" size={14} color={colors.primaryStrong} />
              <AppText variant="smallMedium" weight="bold" color={colors.primaryStrong}>
                {email}
              </AppText>
            </Pressable>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(120).duration(450)}
            style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            {/* Layout animation and the shake transform must live on separate
                animated views: on one view Reanimated warns the entering
                animation may overwrite the transform. */}
            <Animated.View style={[styles.boxes, { gap: box.gap }, shakeStyle]}>
              {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                const active = focused === i;
                const filled = Boolean(digits[i]);
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
                    inputMode="numeric"
                    maxLength={OTP_LENGTH}
                    selectTextOnFocus
                    caretHidden
                    autoCorrect={false}
                    textContentType="oneTimeCode"
                    accessibilityLabel={`Digit ${i + 1}`}
                    style={[
                      styles.box,
                      {
                        width: box.width,
                        height: box.height,
                        backgroundColor: filled ? colors.primarySoft : colors.surface,
                        color: colors.textPrimary,
                        fontFamily: fonts.extraBold,
                        borderColor: active ? colors.primary : filled ? colors.primaryMuted : colors.border,
                        borderWidth: active ? 2 : 1.5,
                      },
                    ]}
                  />
                );
              })}
            </Animated.View>

            {banner ? (
              <InlineBanner kind={banner.kind} message={banner.text} style={styles.banner} />
            ) : null}

            <AppButton
              label={loading ? 'Verifying…' : 'Verify & continue'}
              onPress={() => void handleVerify()}
              loading={loading}
              size="lg"
              style={styles.cta}
              disabled={digits.join('').length < OTP_LENGTH}
            />

            <View style={styles.resend}>
              <AppText variant="small" color={colors.textMuted}>
                Didn&apos;t receive the code?{' '}
              </AppText>
              {seconds > 0 ? (
                <AppText variant="smallMedium" weight="bold" color={colors.textSecondary}>
                  Resend in {seconds}s
                </AppText>
              ) : (
                <Pressable onPress={() => void handleResend()} disabled={resending} hitSlop={8}>
                  <AppText variant="smallMedium" weight="bold" color={colors.primary}>
                    {resending ? 'Sending…' : 'Resend code'}
                  </AppText>
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.back}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
              <AppText variant="smallMedium" color={colors.textMuted} style={styles.backLabel}>
                Use a different email
              </AppText>
            </Pressable>
          </Animated.View>

          <AppText variant="micro" color={colors.textMuted} center style={styles.legal}>
            The code expires in 5 minutes and can only be used once.
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    paddingBottom: spacing.xxl,
  },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.l },
  title: { marginTop: spacing.m },
  subtitle: { maxWidth: 320 },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.pill,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: radius.xxl,
    borderWidth: 1,
    padding: spacing.l,
    alignItems: 'center',
  },
  boxes: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.l },
  box: {
    borderRadius: radius.md,
    fontSize: 22,
    textAlign: 'center',
    paddingVertical: 0,
  },
  banner: {
    alignSelf: 'stretch',
    marginBottom: spacing.m,
  },
  cta: { width: '100%' },
  resend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.l,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.l,
    paddingVertical: spacing.xs,
  },
  backLabel: { marginLeft: 2 },
  legal: { marginTop: spacing.l },
});

export default EmailOtpScreen;
