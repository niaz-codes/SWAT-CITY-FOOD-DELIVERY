import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Divider } from '../../components/Divider';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { RIDER_PROFILE } from '../../services/api';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastProvider';
import { formatPhone } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RiderProfileScreen({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { switchToCustomer } = useAuth();
  const { success } = useToast();
  const [online, setOnline] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Partner profile" onBack={embedded ? undefined : () => navigation.goBack()} hideBack={embedded} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.userCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Avatar name={RIDER_PROFILE.name} gradient={RIDER_PROFILE.avatarGradient} size={72} />
          <View style={styles.userInfo}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>{RIDER_PROFILE.name}</AppText>
            <AppText variant="small" color={colors.textMuted}>{formatPhone(RIDER_PROFILE.phone)} · {RIDER_PROFILE.email}</AppText>
            <View style={styles.verifiedRow}>
              <Ionicons name="shield-checkmark" size={14} color={colors.success} />
              <AppText variant="microBold" color={colors.success}>VERIFIED PARTNER</AppText>
            </View>
          </View>
          <Badge label={online ? 'Online' : 'Offline'} tone={online ? 'success' : 'neutral'} icon="radio-button-on" />
        </View>

        <Pressable
          onPress={() => {
            haptics.medium();
            setOnline((v) => !v);
          }}
          style={[styles.onlineCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <View style={[styles.onlineDot, { backgroundColor: online ? colors.success : colors.textMuted }]} />
          <View style={styles.onlineInfo}>
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              {online ? 'You are online' : 'Currently offline'}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {online ? 'You will receive nearby requests' : 'Tap to start receiving requests'}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem icon="document-text-outline" label="Documents & verification" onPress={() => navigation.navigate('RiderDocuments')} />
          <Divider spacing={0} />
          <MenuItem icon="car-outline" label="Vehicle: Bike · ABC-8542" onPress={() => success('Vehicle on file')} />
          <Divider spacing={0} />
          <MenuItem icon="card-outline" label="Payout account" onPress={() => success('JazzCash · 0340 5551122')} />
        </View>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => success('Rider notifications enabled')} badge="2" />
          <Divider spacing={0} />
          <MenuItem icon="help-circle-outline" label="Help & support" onPress={() => navigation.navigate('Support')} />
        </View>

        <View style={[styles.group, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <MenuItem
            icon="swap-horizontal-outline"
            label="Switch to customer mode"
            onPress={() => switchToCustomer().then(() => navigation.navigate('Main'))}
          />
          <Divider spacing={0} />
          <MenuItem icon="log-out-outline" label="Log out" tint="danger" onPress={() => setConfirmLogout(true)} />
        </View>

        <AppText variant="micro" color={colors.textMuted} style={styles.version}>
          Swat City Partner · v1.0.0
        </AppText>
      </ScrollView>

      <ConfirmationDialog
        visible={confirmLogout}
        title="Log out?"
        message="You will stop receiving requests until you sign in again."
        confirmLabel="Log out"
        cancelLabel="Stay"
        tone="danger"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          setOnline(false);
        }}
      />
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  badge,
  tint = 'text',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: string;
  tint?: 'text' | 'danger';
}) {
  const { colors } = useThemeColors();
  const iconBg = tint === 'danger' ? colors.dangerSoft : colors.rideSoft;
  const iconColor = tint === 'danger' ? colors.danger : colors.ride;
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
      <AppText variant="title" weight="semiBold" color={tint === 'danger' ? colors.danger : colors.textPrimary} style={styles.menuLabel}>
        {label}
      </AppText>
      {badge && (
        <View style={[styles.menuBadge, { backgroundColor: colors.danger }]}>
          <AppText variant="microBold" color="#FFFFFF">{badge}</AppText>
        </View>
      )}
      {tint !== 'danger' && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, borderRadius: 22, borderWidth: 1, padding: spacing.m },
  userInfo: { flex: 1, gap: 2 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  onlineCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: 18, borderWidth: 1, padding: spacing.m },
  onlineDot: { width: 12, height: 12, borderRadius: 6 },
  onlineInfo: { flex: 1, gap: 1 },
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingHorizontal: spacing.m, paddingVertical: spacing.sm, minHeight: 58 },
  menuIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1 },
  menuBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  version: { textAlign: 'center', marginTop: spacing.m },
});