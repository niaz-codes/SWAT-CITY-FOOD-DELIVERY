import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { SearchBar } from '../../components/SearchBar';
import { AddressCard } from '../../components/AddressCard';
import { Divider } from '../../components/Divider';
import { EmptyState } from '../../components/EmptyState';
import { addressApi } from '../../services/api';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { rideLocationStore } from '../../state/rideLocationStore';
import { Address } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationPicker'>;

export function LocationPickerScreen({ navigation, route }: Props) {
  const { mode } = route.params;
  const { colors } = useThemeColors();
  const { success } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<Address[]>([]);

  useEffect(() => {
    addressApi.getSaved().then(setSaved);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await addressApi.searchPlaces(query);
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const select = (address: Address) => {
    haptics.medium();
    if (mode === 'pickup') rideLocationStore.pickup = address;
    else rideLocationStore.dropoff = address;
    success(`${address.label} set as ${mode}`);
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={mode === 'pickup' ? 'Choose pickup' : 'Choose dropoff'} onBack={() => navigation.goBack()} elevated />
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search Swat City…" autoFocus />
      </View>

      <FlatList
        data={[]}
        keyExtractor={() => 'l'}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.list}>
            {query.trim() === '' && (
              <>
                <View style={styles.currentRow}>
                  <View style={[styles.currentIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="locate" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.currentText}>
                    <AppText variant="title" weight="bold" color={colors.textPrimary}>
                      Current location
                    </AppText>
                    <AppText variant="small" color={colors.textMuted}>
                      Green View Colony, Mingora
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
                <Divider spacing={spacing.m} />
                <AppText variant="captionBold" color={colors.textMuted} uppercase style={styles.sectionLabel}>
                  SAVED PLACES
                </AppText>
                {saved.map((a) => (
                  <AddressCard key={a.id} address={a} onPress={() => select(a)} />
                ))}
              </>
            )}

            {query.trim() !== '' && searching && (
              <AppText variant="body" color={colors.textMuted} style={styles.searching}>
                Searching…
              </AppText>
            )}

            {query.trim() !== '' && !searching && results.length === 0 && (
              <EmptyState icon="location-outline" title="No places found" message="Try another area like Mingora, Saidu Sharif or Bahrain." />
            )}

            {query.trim() !== '' && !searching && results.map((a) => (
              <AddressCard key={a.id} address={a} onPress={() => select(a)} />
            ))}
          </View>
        }
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.m, paddingBottom: spacing.sm },
  listContent: { paddingHorizontal: spacing.m },
  list: { paddingBottom: spacing.xl },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  currentIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  currentText: { flex: 1 },
  sectionLabel: { marginBottom: spacing.sm },
  searching: { paddingVertical: spacing.l },
});