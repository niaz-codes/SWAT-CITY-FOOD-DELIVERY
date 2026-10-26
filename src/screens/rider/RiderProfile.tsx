import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
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
import { LeafletMap, type MapMarker } from '../../components/map/LeafletMap';
import { riderApi } from '../../services/riderApi';
import { apiErrorMessage } from '../../services/client';
import { shouldShareLocation } from '../../services/riderLocation';
import { useRiderLocation } from '../../state/RiderLocationProvider';
import type { RiderProfile } from '../../types/domain';
import { useThemeColors, useAppTheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastProvider';
import { formatPhone } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { vehicleLabel } from '../../constants/vehicles';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RIDER_GRADIENT: [string, string] = ['#1B84B5', '#0E3F3A'];

function statusLabel(status: RiderProfile['status']): string {
  // `busy` is surfaced to riders as "On Delivery" rather than a raw state name.
  if (status === 'busy') return 'On Delivery';
  if (status === 'online') return 'Online';
  return 'Offline';
}

function relativeTime(iso?: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function RiderProfileScreen({ embedded }: { embedded?: boolean }) {
  const { colors } = useThemeColors();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { dark: darkMode, toggle: toggleTheme, hydrated: hydratedTheme } = useAppTheme();
  const { success, error } = useToast();
  // The provider is the single source of truth for the profile so the GPS
  // watcher and this screen can never disagree about online state.
  const { profile, sharing, permissionDenied, refreshProfile } = useRiderLocation();

  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Tracks the first read only. It used to be seeded from `!profile`, which
  // snapshotted mount-time state and could never be cleared, so a failed or
  // slow first fetch left the screen spinning forever.
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await refreshProfile();
  }, [refreshProfile]);

  // Drive a fetch from this screen as well as from the provider, so reopening
  // the tab always retries even if the provider's earlier read failed. The
  // spinner is tied to this first attempt settling — success, failure, or a
  // provider that still reports null — so a failed read falls through to the
  // retry state below instead of spinning forever.
  useEffect(() => {
    let mounted = true;
    void refreshProfile().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [refreshProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setLoading(false);
  }, [load]);

  const approved = profile?.approvalStatus === 'approved';
  const isOnline = profile?.status === 'online' || profile?.status === 'busy';
  const canToggle = approved && !toggling && profile?.status !== 'busy';

  const toggleOnline = useCallback(async () => {
    if (!profile || !canToggle) return;
    setToggling(true);
    haptics.medium();
    const next = !(profile.status === 'online' || profile.status === 'busy');
    try {
      await riderApi.setOnline(next);
      // Refreshing is what starts or stops location sharing, so it must run
      // after the server has accepted the new status.
      await refreshProfile();
      success(next ? 'You are online. Sharing your live location.' : 'You are offline.');
    } catch (err) {
      error(apiErrorMessage(err, 'Could not change your status'));
    } finally {
      setToggling(false);
    }
  }, [profile, canToggle, refreshProfile, success, error]);

  const lastLocation = profile?.lastLocation;
  const showMap = shouldShareLocation(profile?.status) && !!lastLocation;
  const markers: MapMarker[] = showMap
    ? [
        {
          id: `rider:${profile!._id}`,
          lat: lastLocation!.lat,
          lng: lastLocation!.lng,
          kind: 'rider',
          heading: lastLocation!.heading ?? 0,
          avatarUrl: profile!.avatarUrl ?? null,
          selected: true,
          popupLines: [
            { label: 'Status', value: statusLabel(profile!.status) },
            { label: 'Fix age', value: relativeTime(lastLocation!.updatedAt) },
          ],
        },
      ]
    : [];

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // The first read finished without a profile. Say so and offer a retry instead
  // of rendering an empty shell or spinning forever.
  if (!profile) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppHeader
          title="Partner profile"
          onBack={embedded ? undefined : () => navigation.goBack()}
          hideBack={embedded}
        />
        <View style={[styles.center, styles.errorBody, { paddingHorizontal: spacing.l }]}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
          <AppText variant="h4" weight="bold" color={colors.textPrimary} center>
            Could not load your profile
          </AppText>
          <AppText variant="small" color={colors.textSecondary} center>
            Check your connection and try again. If this keeps happening your session may have
            expired.
          </AppText>
          <Pressable
            onPress={() => {
              setLoading(true);
              void load().finally(() => setLoading(false));
            }}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
          >
            <AppText variant="small" weight="bold" color={colors.onPrimary}>
              Try again
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Partner profile"
        onBack={embedded ? undefined : () => navigation.goBack()}
        hideBack={embedded}
      />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View
          style={[
            styles.userCard,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <Avatar
            name={profile?.name ?? 'Rider'}
            gradient={RIDER_GRADIENT}
            uri={profile?.avatarUrl}
            size={72}
          />
          <View style={styles.userInfo}>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary} numberOfLines={1}>
              {profile?.name ?? 'Rider'}
            </AppText>
            <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
              {formatPhone(profile?.phone ?? '')}
            </AppText>
            <View style={styles.verifiedRow}>
              <Ionicons
                name={approved ? 'shield-checkmark' : 'time-outline'}
                size={14}
                color={approved ? colors.success : colors.warning}
              />
              <AppText variant="microBold" color={approved ? colors.success : colors.warning}>
                {approved
                  ? 'VERIFIED PARTNER'
                  : `STATUS: ${profile?.approvalStatus?.toUpperCase() ?? 'PENDING'}`}
              </AppText>
            </View>
          </View>
          <Badge
            label={statusLabel(profile?.status ?? 'offline')}
            tone={profile?.status === 'busy' ? 'info' : isOnline ? 'success' : 'neutral'}
            icon={profile?.status === 'busy' ? 'bicycle' : 'radio-button-on'}
          />
        </View>

        {!approved ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: colors.warningSoft, borderColor: colors.warning },
            ]}
          >
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
            <View style={styles.noticeBody}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                {profile?.approvalStatus === 'rejected'
                  ? 'Application rejected'
                  : 'Approval pending'}
              </AppText>
              <AppText variant="small" color={colors.textSecondary}>
                {profile?.approvalStatus === 'rejected'
                  ? profile?.rejectionReason || 'Contact support to resubmit your documents.'
                  : 'An admin is reviewing your documents. You will get a notification once approved.'}
              </AppText>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={toggleOnline}
          disabled={!canToggle}
          style={[
            styles.onlineCard,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              opacity: canToggle ? 1 : 0.6,
            },
          ]}
        >
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: isOnline ? colors.success : colors.textMuted },
            ]}
          />
          <View style={styles.onlineInfo}>
            <AppText variant="title" weight="bold" color={colors.textPrimary}>
              {profile?.status === 'busy'
                ? 'On Delivery'
                : isOnline
                  ? 'You are online'
                  : approved
                    ? 'Currently offline'
                    : 'Go online after approval'}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {profile?.status === 'busy'
                ? 'Finish your active delivery before going offline'
                : isOnline
                  ? 'Your location is shared with admin and your customer'
                  : approved
                    ? 'Tap to start receiving requests'
                    : 'You cannot go online until an admin approves you'}
            </AppText>
          </View>
          {toggling ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </Pressable>

        {permissionDenied && isOnline ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
            ]}
          >
            <Ionicons name="navigate-outline" size={20} color={colors.danger} />
            <View style={styles.noticeBody}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                Location permission needed
              </AppText>
              <AppText variant="small" color={colors.textSecondary}>
                Enable location access in your phone settings so customers and admin can see you
                while you are on a delivery.
              </AppText>
            </View>
          </View>
        ) : null}

        {showMap ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                My live location
              </AppText>
              <Badge
                label={sharing ? 'Sharing' : 'Idle'}
                tone={sharing ? 'success' : 'neutral'}
                icon={sharing ? 'radio-button-on' : 'pause'}
              />
            </View>
            <LeafletMap markers={markers} height={220} followMarkers interactive={false} />
            <AppText variant="micro" color={colors.textMuted}>
              Last fix {relativeTime(lastLocation?.updatedAt)} · sharing stops automatically when
              you go offline or finish your delivery.
            </AppText>
          </View>
        ) : null}

        <View
          style={[
            styles.group,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <MenuItem
            icon="document-text-outline"
            label="Documents & verification"
            onPress={() => navigation.navigate('RiderDocuments')}
          />
          <Divider spacing={0} />
          <MenuItem
            icon="car-outline"
            label={`Vehicle: ${vehicleLabel(profile?.vehicleType)}${profile?.vehiclePlate ? ` · ${profile.vehiclePlate}` : ''}`}
            trailing={
              profile?.pendingVehicle?.requestedAt ? (
                <Badge label="Pending" tone="warning" icon="time-outline" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )
            }
            onPress={() => navigation.navigate('RiderVehicle')}
          />
          <Divider spacing={0} />
          <MenuItem
            icon="map-outline"
            label={`Base location: ${profile?.baseLocation?.label ?? (profile?.baseLocation?.lat != null ? 'Saved pin' : 'not set')}`}
            onPress={() => navigation.navigate('RiderBaseLocation')}
          />
          <Divider spacing={0} />
          <MenuItem
            icon="card-outline"
            label="Payout account"
            onPress={() => success('JazzCash on file')}
          />
        </View>

        <View
          style={[
            styles.group,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <MenuItem
            icon={darkMode ? 'moon' : 'moon-outline'}
            label="Dark mode"
            onPress={() => !hydratedTheme && haptics.light()}
            trailing={
              <Switch
                value={darkMode}
                onValueChange={() => {
                  haptics.medium();
                  void toggleTheme();
                }}
                trackColor={{ false: colors.borderStrong, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Divider spacing={0} />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => success('Rider notifications enabled')}
          />
          <Divider spacing={0} />
          <MenuItem
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => navigation.navigate('Support')}
          />
        </View>

        <View
          style={[
            styles.group,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <MenuItem
            icon="swap-horizontal-outline"
            label="Switch to customer mode"
            onPress={() => {
              // Opens the customer shell. The account keeps its rider role on
              // the server, so this is a view change only - there is no
              // backend "switch role" endpoint to call here.
              haptics.light();
              navigation.navigate('Main');
            }}
          />
          <Divider spacing={0} />
          <MenuItem
            icon="log-out-outline"
            label="Log out"
            tint="danger"
            onPress={() => setConfirmLogout(true)}
          />
        </View>

        <AppText variant="micro" color={colors.textMuted} style={styles.version}>
          Swat City Food Delivery Partner · v1.0.0
        </AppText>
      </ScrollView>

      <ConfirmationDialog
        visible={confirmLogout}
        title="Log out?"
        message="You will stop sharing your location and stop receiving requests until you sign in again."
        confirmLabel="Log out"
        cancelLabel="Stay"
        tone="danger"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void logout();
        }}
      />
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  tint = 'text',
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tint?: 'text' | 'danger';
  trailing?: React.ReactNode;
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
      <AppText
        variant="title"
        weight="semiBold"
        color={tint === 'danger' ? colors.danger : colors.textPrimary}
        style={styles.menuLabel}
        numberOfLines={1}
      >
        {label}
      </AppText>
      {trailing ??
        (tint !== 'danger' && (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  errorBody: { flex: 1, gap: spacing.sm },
  retryButton: {
    marginTop: spacing.sm,
    borderRadius: 14,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.l,
  },
  body: { padding: spacing.m, gap: spacing.sm },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 22,
    borderWidth: 1,
    padding: spacing.m,
  },
  userInfo: { flex: 1, gap: 2 },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  noticeCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.m,
  },
  noticeBody: { flex: 1, gap: 2 },
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.m,
  },
  onlineDot: { width: 12, height: 12, borderRadius: 6 },
  onlineInfo: { flex: 1, gap: 1 },
  section: { gap: spacing.xs, marginTop: spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.sm,
    minHeight: 58,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1 },
  version: { textAlign: 'center', marginTop: spacing.m },
});
