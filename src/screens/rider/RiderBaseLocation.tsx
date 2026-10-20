import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { LocationPickerMap, type PickedLocation } from '../../components/map/LocationPickerMap';
import { riderApi } from '../../services/riderApi';
import { useRiderLocation } from '../../state/RiderLocationProvider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderBaseLocation'>;

/**
 * Lets a rider set the base location they start their shift from.
 *
 * The pin is chosen on the shared `LocationPickerMap` (search + tap + GPS) and
 * saved to the rider's own profile. Reopening the screen shows the saved pin,
 * because the initial value comes from the profile the provider keeps in sync.
 */
export function RiderBaseLocationScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useRiderLocation();
  const { success } = useToast();

  const initial: PickedLocation | null =
    profile?.baseLocation?.lat != null
      ? {
          lat: profile.baseLocation.lat,
          lng: profile.baseLocation.lng ?? 0,
          label: profile.baseLocation.label ?? undefined,
        }
      : null;

  const confirm = useCallback(
    async (location: PickedLocation) => {
      await riderApi.setBaseLocation({
        lat: location.lat,
        lng: location.lng,
        label: location.label,
      });
      haptics.success();
      success('Base location saved');
      // Refresh the provider so the profile (and other screens) see the new pin.
      await refreshProfile();
      navigation.goBack();
    },
    [refreshProfile, success, navigation],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Base location" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="h4" weight="bold" color={colors.textPrimary}>
          Where do you start your shift?
        </AppText>
        <AppText variant="small" color={colors.textSecondary}>
          Search for your area, tap the map, or use your current location. Admin and dispatch use
          this to show which zone you cover before you go online.
        </AppText>

        <LocationPickerMap
          value={initial}
          confirmLabel="Confirm base location"
          hint="Tip: search “Saidu Sharif” or tap the exact spot on the map."
          onConfirm={confirm}
        />

        {profile?.baseLocation?.setAt ? (
          <AppText variant="micro" color={colors.textMuted} center>
            Current base: {profile.baseLocation.label ?? 'Saved pin'}
          </AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.s },
});
