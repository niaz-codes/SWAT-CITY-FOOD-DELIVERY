import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { AppHeader } from '../../components/AppHeader';
import { Divider } from '../../components/Divider';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { useThemeColors, useAppTheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastProvider';
import { formatPhone } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';

type Props = { embedded?: boolean };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen({ embedded }: Props) {
  const { colors } = useThemeColors();
  const { dark, toggle, hydrated } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, logout, switchToRider } = useAuth();
  const { success } = useToast();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const initialsName = user?.name ?? 'Swat User';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Profile"
        elevated
        hideBack={embedded}
        onBack={embedded ? undefined : () => navigation.goBack()}
        right={
          <Pressable onPress={() => navigation.navigate('Support')} hitSlop={8}>
            <Ionicons name="help-circle-outline" size={24} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => haptics.light()}
          style={[styles.userCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <Avatar size={72} name={initialsName} gradient={user?.avatarGradient ?? ['#2EC4B6', '#0E9488']} />
          <View style={styles.userInfo}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              {initialsName}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {formatPhone(user?.phone ?? '')} · {user?.email}
            </AppText>
            <View style={styles.verifiedRow}>
              <Ionicons name="shield-checkmark" size={14} color={colors.success} />
              <AppText variant="microBold" color={colors.success}>VERIFIED CUSTOMER</AppText>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem icon="wallet-outline" label="Swat Wallet" onPress={() => navigation.navigate('Wallet')} />
          <Divider spacing={0} />
          <MenuItem icon="heart-outline" label="Favorites" onPress={() => navigation.navigate('Favorites')} />
          <Divider spacing={0} />
          <MenuItem icon="time-outline" label="Activity & orders" onPress={() => navigation.navigate('Activities')} />
        </View>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem icon="location-outline" label="Saved addresses" onPress={() => navigation.navigate('LocationPicker', { mode: 'pickup' })} />
          <Divider spacing={0} />
          <MenuItem icon="card-outline" label="Payment methods" onPress={() => success('2 payment methods saved')} />
          <Divider spacing={0} />
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} badge="2" />
        </View>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem
            icon={dark ? 'moon' : 'moon-outline'}
            label="Dark mode"
            onPress={() => !hydrated && haptics.light()}
            trailing={
              <Switch
                value={dark}
                onValueChange={() => {
                  haptics.medium();
                  toggle();
                }}
                trackColor={{ false: colors.borderStrong, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Divider spacing={0} />
          <MenuItem icon="language-outline" label="Language & region" onPress={() => success('English · Pakistan')} trailing={<AppText variant="small" color={colors.textMuted}>English (PK)</AppText>} />
        </View>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem icon="bicycle-outline" label="Deliver with Swat City" onPress={() => switchToRider().then(() => navigation.navigate('RiderMain'))} tint="ride" />
          <Divider spacing={0} />
          <MenuItem icon="help-circle-outline" label="Help & support" onPress={() => navigation.navigate('Support')} />
          <Divider spacing={0} />
          <MenuItem icon="information-circle-outline" label="About Swat City" onPress={() => success('Swat City v1.0.0')} />
        </View>

        <Pressable onPress={() => setConfirmLogout(true)} style={styles.logout}>
          <AppText variant="title" weight="semiBold" color={colors.danger}>
            Log out
          </AppText>
        </Pressable>
      </ScrollView>

      <ConfirmationDialog
        visible={confirmLogout}
        title="Log out?"
        message="You will need to sign in again to place orders or book rides."
        confirmLabel="Log out"
        cancelLabel="Stay"
        tone="danger"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
      />
    </View>
  );
}

type MenuTint = 'text' | 'ride' | 'danger';

function MenuItem({
  icon,
  label,
  onPress,
  badge,
  trailing,
  tint = 'text',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: string;
  trailing?: React.ReactNode;
  tint?: MenuTint;
}) {
  const { colors } = useThemeColors();
  const iconColor = tint === 'ride' ? colors.ride : tint === 'danger' ? colors.danger : colors.primary;
  const iconBg = tint === 'ride' ? colors.rideSoft : tint === 'danger' ? colors.dangerSoft : colors.primarySoft;
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={styles.menuRow}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <AppText variant="title" weight="semiBold" color={colors.textPrimary} style={styles.menuLabel}>
        {label}
      </AppText>
      {badge && (
        <View style={[styles.menuBadge, { backgroundColor: colors.danger }]}>
          <AppText variant="microBold" color="#FFFFFF">{badge}</AppText>
        </View>
      )}
      {trailing ?? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, borderRadius: 22, borderWidth: 1, padding: spacing.m },
  userInfo: { flex: 1, gap: 2 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingHorizontal: spacing.m, paddingVertical: spacing.sm, minHeight: 60 },
  menuIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1 },
  menuBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  logout: { alignSelf: 'center', padding: spacing.m, marginTop: spacing.xs },
});