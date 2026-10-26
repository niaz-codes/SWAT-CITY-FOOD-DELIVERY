import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppInput } from '../../components/AppInput';
import { AppButton } from '../../components/AppButton';
import { Chip } from '../../components/Chip';
import { Divider } from '../../components/Divider';
import { riderApi } from '../../services/riderApi';
import { apiErrorMessage } from '../../services/client';
import { useRiderLocation } from '../../state/RiderLocationProvider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { VEHICLES, vehicleLabel, vehicleEmoji, type VehicleKey } from '../../constants/vehicles';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderVehicle'>;

/** Pakistani plate grammar, shared with the backend validation. */
const PLATE_RE = /^[A-Z]{1,4}[\s-]?\d{1,4}$/;

/**
 * Rider vehicle management.
 *
 * The rider picks a type (Bike → Rickshaw → …) and enters the matching
 * registration number. Any change is submitted as a *request*: the backend
 * validates the plate for format and uniqueness and parks it for admin
 * approval, because the live vehicle fields drive dispatch. The screen shows
 * the live details, the queued proposal, and blocks the "Submit" button when
 * nothing has changed.
 */
export function RiderVehicleScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useRiderLocation();
  const { error, success, info } = useToast();

  const liveType = (profile?.vehicleType as VehicleKey) ?? 'bike';
  const livePlate = profile?.vehiclePlate ?? '';
  const liveBrand = profile?.vehicleBrand ?? '';

  /**
   * The fields are only held locally once the rider actually edits them.
   * Before that they simply follow the profile, so an admin decision (or the
   * refresh that follows a submission) shows up without copying it into
   * separate state - and the rider's own typing is never clobbered.
   */
  const [draft, setDraft] = useState<{
    type: VehicleKey;
    plate: string;
    brand: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const type = draft?.type ?? liveType;
  const plate = draft?.plate ?? livePlate;
  const brand = draft?.brand ?? liveBrand;

  const pending = profile?.pendingVehicle;
  const hasPending = Boolean(pending?.requestedAt);

  const normalizedPlate = plate.trim().toUpperCase();
  const plateValid = PLATE_RE.test(normalizedPlate);

  const dirty =
    type !== liveType ||
    normalizedPlate !== (profile?.vehiclePlate ?? '') ||
    brand.trim() !== (profile?.vehicleBrand ?? '');

  const selectedVehicle = useMemo(() => VEHICLES.find((v) => v.key === type), [type]);

  const submit = useCallback(async () => {
    if (!plateValid) {
      haptics.warning();
      error('Enter a valid registration number (e.g. SWAT-1234)');
      return;
    }
    if (!dirty) {
      info('Change something before submitting');
      return;
    }
    setSubmitting(true);
    try {
      const result = await riderApi.requestVehicleChange({
        vehicleType: type,
        vehicleBrand: brand.trim() || undefined,
        vehiclePlate: normalizedPlate,
      });
      haptics.success();
      if (result.pending) {
        success('Sent to admin. Your vehicle updates once approved.');
      } else {
        success('That matches your approved details — nothing to review.');
      }
      // Drop the draft so the fields fall back to the (refreshed) profile.
      setDraft(null);
      await refreshProfile();
    } catch (err) {
      haptics.warning();
      error(apiErrorMessage(err, 'Could not submit your vehicle details'));
    } finally {
      setSubmitting(false);
    }
  }, [plateValid, dirty, type, brand, normalizedPlate, refreshProfile, success, info, error]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="My vehicle" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Current approved details */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.vehicleIcon, { backgroundColor: colors.rideSoft }]}>
                <AppText variant="h4">{vehicleEmoji(profile?.vehicleType)}</AppText>
              </View>
              <View style={styles.cardInfo}>
                <AppText variant="title" weight="bold" color={colors.textPrimary}>
                  {vehicleLabel(profile?.vehicleType)} · {profile?.vehiclePlate || 'No plate'}
                </AppText>
                <AppText variant="small" color={colors.textMuted}>
                  Your approved vehicle. Admin confirms any change.
                </AppText>
              </View>
            </View>
          </View>

          {/* Pending proposal banner */}
          {hasPending ? (
            <View
              style={[
                styles.notice,
                { backgroundColor: colors.warningSoft, borderColor: colors.warning },
              ]}
            >
              <Ionicons name="time-outline" size={20} color={colors.warning} />
              <View style={styles.noticeBody}>
                <AppText variant="title" weight="bold" color={colors.textPrimary}>
                  Change waiting for approval
                </AppText>
                <AppText variant="small" color={colors.textSecondary}>
                  {pending?.note ?? 'Your requested details are with admin.'} Your current vehicle
                  stays active until it is approved.
                </AppText>
              </View>
            </View>
          ) : null}

          <AppText
            variant="captionBold"
            color={colors.textMuted}
            uppercase
            style={styles.blockTitle}
          >
            Vehicle type
          </AppText>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Chip
                key={v.key}
                label={v.label}
                leadingEmoji={v.emoji}
                selected={type === v.key}
                onPress={() => {
                  haptics.light();
                  setDraft({ type: v.key, plate, brand });
                }}
              />
            ))}
          </View>

          <Divider spacing={spacing.s} />

          <AppInput
            label={selectedVehicle?.plateLabel ?? 'Registration number'}
            icon="pricetag-outline"
            placeholder="e.g. SWAT-1234"
            value={plate}
            onChangeText={(t) => {
              setDraft({ type, plate: t.toUpperCase().slice(0, 20), brand });
            }}
            autoCapitalize="characters"
            error={
              plate.length > 0 && !plateValid ? 'Enter a valid number (e.g. SWAT-1234)' : undefined
            }
            hint="Letters then digits, e.g. SWAT-1234. Must be unique among riders."
          />

          <AppInput
            label={`${selectedVehicle?.label ?? 'Vehicle'} brand (optional)`}
            icon="car-outline"
            placeholder="e.g. Honda, Suzuki"
            value={brand}
            onChangeText={(t) => {
              setDraft({ type, plate, brand: t.slice(0, 60) });
            }}
            autoCapitalize="words"
          />

          <AppButton
            label={hasPending ? 'Update my request' : 'Submit for approval'}
            icon="send"
            size="lg"
            onPress={submit}
            loading={submitting}
            disabled={submitting || !plateValid || !dirty}
            style={styles.submit}
          />
          {!dirty ? (
            <AppText variant="micro" color={colors.textMuted} center>
              Change your vehicle type or number to submit an update.
            </AppText>
          ) : (
            <AppText variant="micro" color={colors.textMuted} center>
              Admin reviews vehicle changes before they take effect. You can keep riding with your
              current vehicle meanwhile.
            </AppText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.s },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.m },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  vehicleIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, gap: 2 },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.m,
  },
  noticeBody: { flex: 1, gap: 2 },
  blockTitle: { marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  submit: { marginTop: spacing.sm },
});
