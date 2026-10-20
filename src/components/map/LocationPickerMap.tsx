import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { SearchBar } from '../SearchBar';
import { AppButton } from '../AppButton';
import { LeafletMap, type LeafletMapHandle, type MapMarker } from './LeafletMap';
import { addressApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { getCurrentFix, requestLocationPermission } from '../../services/riderLocation';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import type { Address } from '../../types/domain';

export type PickedLocation = { lat: number; lng: number; label?: string };

type Props = {
  /** Starting pin (e.g. the rider's saved base location). */
  value?: PickedLocation | null;
  /** Centre before anything is picked. */
  initialCenter?: { lat: number; lng: number };
  height?: number;
  /** Label for the confirm button, e.g. "Confirm location". */
  confirmLabel?: string;
  /** Called when the rider confirms the pin. May be async to show saving. */
  onConfirm: (location: PickedLocation) => Promise<void> | void;
  /** Optional extra copy under the search bar. */
  hint?: string;
};

const SWAT_CENTER = { lat: 34.9118, lng: 72.3211 };

/**
 * A searchable map picker for choosing a single location.
 *
 * Combines three ways to set the pin, all landing on the same `selected` state:
 *   * search an area / landmark / restaurant (backend `/places/search`)
 *   * tap the map to move the pin
 *   * "Use my current location" via GPS
 *
 * The map is only ever moved imperatively (`flyTo`), so search suggestions can
 * scroll above it without re-mounting the WebView document — the same pattern
 * the live-tracking maps use.
 */
export function LocationPickerMap({
  value,
  initialCenter,
  height = 250,
  confirmLabel = 'Confirm location',
  onConfirm,
  hint,
}: Props) {
  const { colors } = useThemeColors();
  const { error, success } = useToast();
  const mapRef = useRef<LeafletMapHandle>(null);

  const [selected, setSelected] = useState<PickedLocation | null>(value ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const trimmed = query.trim();

  // Clear stale suggestions the moment the query empties (adjust-on-change
  // pattern rather than an effect, matching LocationPicker).
  const [prevTrimmed, setPrevTrimmed] = useState(trimmed);
  if (trimmed !== prevTrimmed) {
    setPrevTrimmed(trimmed);
    if (!trimmed) setResults([]);
  }

  // Debounced search. Same 350ms cadence as the customer address picker.
  useEffect(() => {
    if (!trimmed) return;
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await addressApi.searchPlaces(trimmed);
        if (active) setResults(found);
      } catch (err) {
        if (active) {
          setResults([]);
          error(apiErrorMessage(err, 'Could not search for places'));
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed, error]);

  const dropPin = useCallback((lat: number, lng: number, label?: string) => {
    setSelected({ lat, lng, label });
    mapRef.current?.flyTo(lat, lng, 16);
  }, []);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const permission = await requestLocationPermission();
      if (permission === 'denied') {
        error('Location permission is off. Enable it in Settings to use your current location.');
        return;
      }
      if (permission !== 'granted') {
        error('Location permission is needed to use your current location.');
        return;
      }
      const fix = await getCurrentFix();
      if (!fix) {
        error('Could not get your location. Make sure GPS is on and try again.');
        return;
      }
      haptics.medium();
      dropPin(fix.latitude, fix.longitude, 'My current location');
    } finally {
      setLocating(false);
    }
  }, [dropPin, error]);

  const confirm = useCallback(async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onConfirm({ lat: selected.lat, lng: selected.lng, label: selected.label });
    } catch (err) {
      error(apiErrorMessage(err, 'Could not save this location'));
    } finally {
      setSaving(false);
    }
  }, [selected, saving, onConfirm, error]);

  const markers = useMemo<MapMarker[]>(
    () =>
      selected
        ? [
            {
              id: 'selected',
              lat: selected.lat,
              lng: selected.lng,
              kind: 'destination',
              label: selected.label ?? 'Selected location',
              selected: true,
            },
          ]
        : [],
    [selected],
  );

  const showResults = trimmed.length > 0;

  return (
    <View style={styles.wrap}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search area, street or landmark…"
      />
      {hint ? (
        <AppText variant="micro" color={colors.textMuted} style={styles.hint}>
          {hint}
        </AppText>
      ) : null}

      {showResults ? (
        <View
          style={[
            styles.results,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          {searching ? (
            <View style={styles.resultsState}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText variant="small" color={colors.textMuted}>
                Searching…
              </AppText>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.resultsState}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <AppText variant="small" color={colors.textMuted} center>
                No places found. Try another area like Mingora, Saidu Sharif or Bahrain.
              </AppText>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.resultList}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => {
                    haptics.light();
                    dropPin(item.lat, item.lng, item.label);
                    // Collapse the sheet back to the map so the rider sees the
                    // pin they just picked.
                    setQuery('');
                  }}
                  style={[
                    styles.resultRow,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="location" size={17} color={colors.primary} />
                  </View>
                  <View style={styles.resultInfo}>
                    <AppText
                      variant="title"
                      weight="semiBold"
                      color={colors.textPrimary}
                      numberOfLines={1}
                    >
                      {item.label}
                    </AppText>
                    <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                      {item.full}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            />
          )}
        </View>
      ) : null}

      <LeafletMap
        ref={mapRef}
        markers={markers}
        initialCenter={selected ?? initialCenter ?? SWAT_CENTER}
        initialZoom={14}
        height={height}
        onPick={(lat, lng) => {
          haptics.light();
          setSelected({ lat, lng });
        }}
        onMapError={(message) => setMapError(message)}
      />

      {mapError ? (
        <View style={[styles.errorRow, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} />
          <AppText variant="small" color={colors.danger} style={styles.errorText}>
            {mapError}
          </AppText>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={useMyLocation}
          disabled={locating}
          style={[
            styles.gpsButton,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={18} color={colors.primary} />
          )}
          <AppText variant="smallMedium" weight="semiBold" color={colors.textPrimary}>
            Use my current location
          </AppText>
        </Pressable>
      </View>

      <View
        style={[
          styles.selectedRow,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <Ionicons
          name={selected ? 'location' : 'location-outline'}
          size={17}
          color={selected ? colors.primary : colors.textMuted}
        />
        <AppText
          variant="small"
          color={selected ? colors.textSecondary : colors.textMuted}
          style={styles.selectedText}
          numberOfLines={2}
        >
          {selected
            ? `${selected.label ? `${selected.label} · ` : ''}${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`
            : 'Search, tap the map or use GPS to drop a pin'}
        </AppText>
      </View>

      <AppButton
        label={confirmLabel}
        icon="checkmark"
        size="lg"
        onPress={confirm}
        loading={saving}
        disabled={!selected || saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.s },
  hint: { marginTop: -spacing.xs },
  results: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 240,
  },
  resultList: { maxHeight: 240 },
  resultsState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    minHeight: 56,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: { flex: 1, gap: 2 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: radius.md,
  },
  errorText: { flex: 1 },
  actions: { flexDirection: 'row' },
  gpsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.s,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  selectedText: { flex: 1 },
});
