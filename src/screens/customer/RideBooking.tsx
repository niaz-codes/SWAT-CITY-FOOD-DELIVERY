import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { MapComponent } from '../../components/MapComponent';
import { RideCard } from '../../components/RideCard';
import { AppButton } from '../../components/AppButton';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { RIDE_FARES, estimateFare } from '../../services/api';
import { rideLocationStore } from '../../state/rideLocationStore';
import { Address, RideType } from '../../types/domain';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function haversineKm(a: Address, b: Address): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function RideBookingScreen() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [pickup, setPickup] = useState<Address | null>(rideLocationStore.pickup);
  const [dropoff, setDropoff] = useState<Address | null>(rideLocationStore.dropoff);
  const [rideType, setRideType] = useState<RideType>('swat_city');

  useFocusEffect(
    React.useCallback(() => {
      setPickup(rideLocationStore.pickup);
      setDropoff(rideLocationStore.dropoff);
    }, []),
  );

  const routeReady = pickup != null && dropoff != null;
  const distanceKm = useMemo(() => (routeReady ? haversineKm(pickup!, dropoff!) : 0), [routeReady, pickup, dropoff]);

  const fares = useMemo(() => RIDE_FARES.map((f) => ({ ...f, fare: estimateFare(distanceKm, f.rideType) })), [distanceKm]);

  const selected = fares.find((f) => f.rideType === rideType) ?? fares[1]!;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.s }]}>
          <View>
            <AppText variant="caption" color={colors.textMuted}>SWAT CITY</AppText>
            <AppText variant="h3" weight="extraBold" color={colors.textPrimary}>
              Where to, {pickup?.label.split(' ')[0] ?? 'Ahmad'}?
            </AppText>
          </View>
        </View>

        <View style={styles.mapWrap}>
          <MapComponent
            pickup={pickup ? { x: 0.26, y: 0.34 } : undefined}
            dropoff={dropoff ? { x: 0.74, y: 0.68 } : undefined}
            height={216}
            rounded={26}
          />
          {!routeReady && (
            <View style={[styles.mapHint, { backgroundColor: colors.overlay }]}>
              <Ionicons name="map-outline" size={18} color="#FFFFFF" />
              <AppText variant="smallMedium" weight="semiBold" color="#FFFFFF">
                Choose pickup and dropoff to see the route
              </AppText>
            </View>
          )}
        </View>

        <View style={[styles.locations, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <PlaceRow
            icon="ellipse"
            iconColor={colors.primary}
            top
            label="Pickup"
            value={pickup?.full ?? 'Current location'}
            onPress={() => navigation.navigate('LocationPicker', { mode: 'pickup' })}
            valueColor={pickup ? colors.textPrimary : colors.textMuted}
          />
          <PlaceRow
            icon="location"
            iconColor={colors.danger}
            label="Dropoff"
            value={dropoff?.full ?? 'Choose destination'}
            onPress={() => navigation.navigate('LocationPicker', { mode: 'dropoff' })}
            valueColor={dropoff ? colors.textPrimary : colors.textMuted}
          />
        </View>

        {routeReady && (
          <>
            <View style={styles.tripMetaRow}>
              <TripMeta icon="navigate-outline" label={`${distanceKm.toFixed(1)} km`} />
              <TripMeta icon="time-outline" label={`${Math.round(distanceKm * 4 + 6)} min`} />
              <TripMeta icon="cash-outline" label={`Rs ${estimateFare(distanceKm, rideType)}`} />
            </View>

            <View style={styles.ridesSection}>
              <View style={styles.sectionTitleRow}>
                <AppText variant="captionBold" color={colors.textMuted} uppercase>
                  Choose a ride
                </AppText>
              </View>
              {fares.map((f) => (
                <RideCard key={f.rideType} ride={f} fare={f.fare} selected={rideType === f.rideType} onSelect={() => setRideType(f.rideType)} />
              ))}
            </View>

            <View style={[styles.estimate, { backgroundColor: colors.rideSoft }]}>
              <AppText variant="small" color={colors.ride}>
                Estimated fare includes all tolls and taxes.
              </AppText>
            </View>
          </>
        )}
      </ScrollView>

      <LinearGradient
        colors={['transparent', colors.background]}
        style={[styles.footerGradient, { paddingBottom: Math.max(insets.bottom, spacing.m) }]}
        pointerEvents="box-none"
      >
        <AppButton
          disabled={!routeReady}
          label={routeReady ? `Book ${selected.label} · Rs ${fares.find((f) => f.rideType === rideType)?.fare ?? 0}` : 'Set your trip first'}
          onPress={() =>
            navigation.navigate('RideSearching', {
              pickup: pickup!.label,
              dropoff: dropoff!.label,
              distanceKm,
              rideType,
              fare: fares.find((f) => f.rideType === rideType)?.fare ?? 0,
            })
          }
          size="lg"
        />
      </LinearGradient>
    </View>
  );
}

function PlaceRow({
  icon,
  iconColor,
  label,
  value,
  valueColor,
  onPress,
  top,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
  onPress: () => void;
  top?: boolean;
}) {
  const { colors } = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.placeRow, top && styles.placeRowTop]}>
      <View style={styles.placeIcon}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <View style={styles.placeText}>
        <AppText variant="microBold" color={colors.textMuted} uppercase>
          {label}
        </AppText>
        <AppText variant="bodyMedium" weight="semiBold" color={valueColor} numberOfLines={1}>
          {value}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function TripMeta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.tripMeta, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingBottom: 120 },
  header: { paddingHorizontal: spacing.m, paddingBottom: spacing.m, gap: 2 },
  mapWrap: { marginHorizontal: spacing.m, marginBottom: spacing.m, position: 'relative' },
  mapHint: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    bottom: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: spacing.m,
  },
  locations: { marginHorizontal: spacing.m, borderRadius: 20, borderWidth: 1, marginBottom: spacing.m },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingHorizontal: spacing.m, paddingVertical: spacing.sm },
  placeRowTop: {},
  placeIcon: { width: 24, alignItems: 'center' },
  placeText: { flex: 1, gap: 1 },
  tripMetaRow: { flexDirection: 'row', gap: spacing.s, paddingHorizontal: spacing.m, marginBottom: spacing.m },
  tripMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, height: 42, borderRadius: 16, borderWidth: 1 },
  ridesSection: { paddingHorizontal: spacing.m },
  sectionTitleRow: { marginBottom: spacing.sm },
  estimate: { marginHorizontal: spacing.m, marginTop: spacing.m, borderRadius: 14, paddingVertical: spacing.sm, alignItems: 'center' },
  footerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.xl,
  },
});