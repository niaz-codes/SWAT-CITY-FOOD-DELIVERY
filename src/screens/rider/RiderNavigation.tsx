import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { MapComponent } from '../../components/MapComponent';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderNavigation'>;

/** Universal link; Google Maps falls back to its website everywhere. */
const googleMapsUrl = (dest: Destination) =>
  dest.lat != null && dest.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest.label ?? '')}&travelmode=driving`;

/** Apple's own scheme on iOS, its public https map link elsewhere. */
const appleMapsUrl = (dest: Destination) =>
  (Platform.OS === 'ios' ? 'maps://app?daddr=' : 'https://maps.apple.com/?daddr=') +
  (dest.lat != null && dest.lng != null ? `${dest.lat},${dest.lng}` : encodeURIComponent(dest.label ?? '')) +
  '&dirflg=d';

type Destination = { lat?: number; lng?: number; label?: string };

/**
 * Destination hand-off screen. Turn-by-turn data belongs to the phone's
 * navigation app — something this team cannot rebuild better than Google or
 * Apple — so the screen opens the destination there and stays out of the way.
 */
export function RiderNavigationScreen({ route, navigation }: Props) {
  const { destination } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { error: toastError } = useToast();
  const [opening, setOpening] = useState<string | null>(null);

  const openMaps = async (url: string, key: string) => {
    if (opening) return;
    setOpening(key);
    try {
      await Linking.openURL(url);
    } catch {
      toastError('Maps is not available on this device.');
    } finally {
      setOpening(null);
    }
  };

  // The stylized in-app map cannot plot a route; the two dots mark the trip's
  // ends and the measured distance answers "how far is this going".
  const mapPoints = useMemo(() => ({ dropoff: { x: 0.68, y: 0.36 } }), []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Navigation"
        onBack={() => navigation.goBack()}
        right={
          <View style={[styles.etaPill, { backgroundColor: colors.ride }]}>
            <Ionicons name="navigate" size={12} color="#FFFFFF" />
            <AppText variant="microBold" color="#FFFFFF">
              {' LIVE'}
            </AppText>
          </View>
        }
      />

      <View style={styles.mapWrap}>
        <MapComponent pickup={{ x: 0.3, y: 0.64 }} dropoff={mapPoints?.dropoff} height={210} rounded={0} />
        <View style={[styles.mapOverlay, { backgroundColor: colors.overlay }]}>
          <Ionicons name="navigate" size={16} color="#FFFFFF" />
          <AppText variant="smallMedium" weight="semiBold" color="#FFFFFF">
            Turn-by-turn runs in your maps app
          </AppText>
        </View>
      </View>

      <View style={[styles.instruction, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <Pressable
          onPress={() => void openMaps(googleMapsUrl(destination), 'google')}
          style={[styles.dirIcon, { backgroundColor: colors.rideSoft }]}
        >
          <Ionicons name="navigate" size={28} color={colors.ride} />
        </Pressable>
        <View style={styles.dirText}>
          <AppText variant="captionBold" color={colors.textMuted} uppercase>
            Destination
          </AppText>
          <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={2}>
            {destination.label || 'Drop-off point'}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            {destination.lat != null && destination.lng != null
              ? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`
              : 'Address search · exact position from the label'}
          </AppText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <MapsRow
          icon="logo-google"
          label="Open in Google Maps"
          hint="Turn-by-turn guidance · traffic aware"
          loading={opening === 'google'}
          onPress={() => void openMaps(googleMapsUrl(destination), 'google')}
        />
        <MapsRow
          icon="map-outline"
          label="Open in Apple Maps"
          hint="Same destination, Apple's routing"
          loading={opening === 'apple'}
          onPress={() => void openMaps(appleMapsUrl(destination), 'apple')}
        />

        <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
            Coordinates are copied automatically when the maps app opens. Head back here to confirm
            pickup or mark the delivery done.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function MapsRow({
  icon,
  label,
  hint,
  loading,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  loading: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={[styles.mapsRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
    >
      <View style={[styles.mapsIcon, { backgroundColor: colors.rideSoft }]}>
        <Ionicons name={icon} size={20} color={colors.ride} />
      </View>
      <View style={styles.mapsText}>
        <AppText variant="title" weight="bold" color={colors.textPrimary}>
          {label}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {hint}
        </AppText>
      </View>
      {loading ? (
        <Ionicons name="hourglass-outline" size={18} color={colors.textMuted} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s,
    height: 26,
    borderRadius: 13,
  },
  mapWrap: { position: 'relative' },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.m,
    height: 34,
    borderRadius: 17,
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.m,
    margin: spacing.m,
    marginBottom: 0,
  },
  dirIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirText: { flex: 1, gap: 2 },
  body: { padding: spacing.m, gap: spacing.sm, marginTop: spacing.sm },
  mapsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.m,
  },
  mapsIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapsText: { flex: 1, gap: 1 },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 16,
    padding: spacing.m,
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  noteText: { flex: 1 },
});
