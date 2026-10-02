import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { userHome } from '../../navigation/AdminGuard';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { BrandLogo } from '../../components/BrandLogo';
import { authApi, getOtpHint } from '../../services/api';
import { useThemeColors } from '../../theme';
import { fonts } from '../../theme/typography';
import { radius, spacing } from '../../theme/spacing';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastProvider';
import { formatPhone } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'OTP'>;

const OTP_LENGTH = 6;

export function OtpScreen({ navigation, route }: Props) {
  const { phone, name } = route.params;
  const { colors } = useThemeColors();
  const { setUser } = useAuth();
  const { error, success } = useToast();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);
  const [focused, setFocused] = useState(0);

  useEffect(() => {
    inputs.current[0]?.focus();
    let cancelled = false;
    (async () => {
      const hint = await getOtpHint();
      if (cancelled || !hint) return;
      const chars = hint.replace(/\D/g, '').split('').slice(0, OTP_LENGTH);
      if (chars.length !== OTP_LENGTH) return;
      setDigits([...chars.slice(0, OTP_LENGTH), ...Array(Math.max(0, OTP_LENGTH - chars.length)).fill('')]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const shake = useSharedValue(0);

  const handleChange = (value: string, index: number) => {
    const clean = value.replace(/\D/g, '');
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
    if (cursor < OTP_LENGTH) {
      inputs.current[cursor]?.focus();
    } else {
      inputs.current[OTP_LENGTH - 1]?.blur();
      handleVerify(next.join(''));
    }
  };

  const handleVerify = async (code?: string) => {
    const otp = code ?? digits.join('');
    if (otp.length < OTP_LENGTH) {
      error('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const user = await authApi.verifyOtp(otp, name, phone);
      await setUser(user);
      success('Account verified. Welcome!');
      navigation.replace(userHome(user.role));
    } catch {
      shake.value = withRepeat(withTiming(1, { duration: 130 }), 10, false);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputs.current[0]?.focus();
      error('Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (shake.value * 10) / 2 }],
  }));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.content}>
          <Animated.View entering={FadeInUp.duration(450)} style={styles.header}>
            <BrandLogo size={64} />
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary} center style={styles.title}>
              Verification code
            </AppText>
            <AppText variant="body" color={colors.textMuted} center>
              Enter the 6-digit code sent to
            </AppText>
            <AppText variant="bodyMedium" weight="bold" color={colors.textPrimary}>
              {formatPhone(phone)}
            </AppText>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(120).duration(450)} style={[styles.boxes, shakeStyle]}>
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
                      backgroundColor: colors.surfaceRaised,
                      color: colors.textPrimary,
                      fontFamily: fonts.extraBold,
                      borderColor: active ? colors.primary : colors.border,
                      borderWidth: active ? 2 : 1.5,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

          <AppButton label="Verify & continue" onPress={() => handleVerify()} loading={loading} style={styles.cta} disabled={digits.join('').length < OTP_LENGTH} />

          <View style={styles.resend}>
            <AppText variant="small" color={colors.textMuted}>
              Didn&apos;t receive the code?{' '}
            </AppText>
            {seconds > 0 ? (
              <AppText variant="smallMedium" weight="bold" color={colors.textSecondary}>
                Resend in {seconds}s
              </AppText>
            ) : (
              <Pressable
                onPress={() => {
                  setSeconds(30);
                  setDigits(Array(OTP_LENGTH).fill(''));
                  success('Code resent');
                  inputs.current[0]?.focus();
                }}
              >
                <AppText variant="smallMedium" weight="bold" color={colors.primary}>
                  Resend code
                </AppText>
              </Pressable>
            )}
          </View>

          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <AppText variant="smallMedium" color={colors.textMuted}>
              Use a different number
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.l, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: 4, marginBottom: spacing.xl },
  title: { marginTop: spacing.m },
  boxes: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.xl },
  box: {
    width: 44,
    height: 60,
    borderRadius: radius.lg,
    fontSize: 24,
    textAlign: 'center',
  },
  cta: { width: '100%', maxWidth: 400 },
  resend: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.l },
  back: { marginTop: spacing.xl },
});