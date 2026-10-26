import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';

import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { BrandLogo } from '../components/BrandLogo';
import { useThemeColors } from '../theme';
import { spacing } from '../theme/spacing';
import { useAuth } from '../state/AuthContext';
import { haptics } from '../hooks/useHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerPortal'>;

/**
 * Landing screen for restaurant-owner accounts on mobile.
 *
 * Owner dashboards are managed from the web portal (the same policy that keeps
 * the admin panel off the APK), so mobile does not carry partner screens. This
 * screen explains that and gives the account a clean way out.
 */
export function PartnerPortalScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    haptics.light();
    await logout();
    // AuthContext clearing the user routes back to Login.
    navigation.replace('Login');
  };

  return (
    <LinearGradient
      colors={[colors.primary, colors.background]}
      style={[styles.gradient, { paddingTop: insets.top + spacing.huge }]}
    >
      <View style={styles.content}>
        <BrandLogo size={84} />

        <View style={[styles.card, { backgroundColor: colors.surfaceRaised }]}>
          <AppText variant="h4" weight="bold" color={colors.textPrimary} center>
            Swat Partner
          </AppText>
          {user?.name ? (
            <AppText variant="small" color={colors.textMuted} center style={styles.muted}>
              Signed in as {user.name}
            </AppText>
          ) : null}

          <AppText variant="bodyMedium" color={colors.textMuted} center style={styles.copy}>
            Restaurant management lives on the Swat City partner portal on the web. Sign in with
            this same account in your browser to manage your restaurant, menu, prices, images,
            availability and incoming orders.
          </AppText>

          <AppButton
            label="Sign out"
            variant="outline"
            onPress={handleLogout}
            style={styles.button}
          />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: spacing.l, gap: spacing.xl },
  card: {
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.s,
  },
  muted: { marginTop: -spacing.s },
  copy: { marginTop: spacing.s },
  button: { alignSelf: 'stretch', marginTop: spacing.m },
});
