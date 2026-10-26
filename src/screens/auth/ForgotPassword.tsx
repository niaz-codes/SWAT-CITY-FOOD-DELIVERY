import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { AppHeader } from '../../components/AppHeader';
import { InlineBanner } from '../../components/InlineBanner';
import { authApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { isValidEmail } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

/**
 * Step 1 of the password reset flow: collect the account email and ask the
 * backend to mail a 6-digit code.
 *
 * The endpoint answers the same way whether or not the address is registered, so
 * this screen must not reveal which emails exist. On success it moves to
 * `ResetPassword`, where the code is confirmed and the new password set.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const emailOk = isValidEmail(email);

  const handleSubmit = async () => {
    if (loading) return;
    if (!emailOk) {
      setBanner('Enter a valid email address');
      haptics.warning();
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.requestPasswordReset(email.trim());
      haptics.success();
      navigation.navigate('ResetPassword', {
        challengeToken: res.challengeToken,
        email: res.email,
      });
    } catch (err) {
      setBanner(apiErrorMessage(err, 'Could not send the reset code. Please try again.'));
      haptics.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <AppHeader title="Reset password" onBack={() => navigation.goBack()} elevated />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(450)} style={styles.card}>
            <View
              style={[
                styles.cardInner,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="mail-open-outline" size={24} color={colors.primary} />
              </View>

              <AppText variant="h4" weight="bold" color={colors.textPrimary} center>
                Forgot your password?
              </AppText>
              <AppText variant="small" color={colors.textMuted} center>
                Enter the email address on your account and we&apos;ll send you a 6-digit code to
                choose a new password.
              </AppText>

              <AppInput
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (banner) setBanner(null);
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                icon="mail-outline"
                autoCapitalize="none"
                autoFocus
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />

              {banner ? <InlineBanner kind="error" message={banner} /> : null}

              <AppButton
                label="Send reset code"
                onPress={handleSubmit}
                loading={loading}
                icon="paper-plane-outline"
                iconPosition="right"
                style={styles.cta}
              />

              <AppText variant="micro" color={colors.textMuted} center style={styles.legal}>
                The code expires in a few minutes and can only be used once. Check your spam folder
                if it does not arrive.
              </AppText>
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
  content: { padding: spacing.l, paddingTop: spacing.xl, flexGrow: 1 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  cardInner: { borderRadius: 26, borderWidth: 1, padding: spacing.l, gap: spacing.m },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  cta: { marginTop: spacing.xs },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  noticeText: { flex: 1 },
  legal: { marginTop: spacing.xxs },
});

export default ForgotPasswordScreen;
