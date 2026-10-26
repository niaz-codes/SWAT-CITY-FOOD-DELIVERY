import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppInput } from '../../components/AppInput';
import { AppButton } from '../../components/AppButton';
import { Chip } from '../../components/Chip';
import { InlineBanner } from '../../components/InlineBanner';
import { LocationPickerMap, type PickedLocation } from '../../components/map/LocationPickerMap';
import { authApi } from '../../services/api';
import { apiErrorMessage } from '../../services/client';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';
import { VEHICLES, type VehicleKey } from '../../constants/vehicles';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderRegistration'>;

const SWAT_CENTER = { lat: 34.9118, lng: 72.3211 };

/** The upload endpoint stops at 5 MB; the check happens a little earlier. */
const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024;

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');

export function RiderRegistrationScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { error, info, success } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cnic, setCnic] = useState('');
  const [city, setCity] = useState('Mingora');
  const [vehicle, setVehicle] = useState<VehicleKey>('bike');
  const [plate, setPlate] = useState('');
  const [experience, setExperience] = useState('');

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // The type the picker reported for the photo. Android's editor can hand back
  // a PNG even though the camera produced a JPEG, and the server stores the
  // file under the name the declared type implies.
  const [photoMime, setPhotoMime] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // null = not uploading yet; 0-100 while the multipart body is in flight.
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const phoneDigits = digitsOnly(phone);
  const cnicDigits = digitsOnly(cnic);
  const cnicValid = /^\d{5}-?\d{7}-?\d$/.test(cnicDigits);
  const plateValid = plate.trim().length >= 2;
  const years = Number.parseInt(experience, 10);
  const yearsValid = Number.isFinite(years) && years >= 0 && years <= 60;
  const passwordValid = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  const emailValid = email.trim().includes('@');

  const uploading = submitting && uploadPercent !== null && uploadPercent < 100;
  const creatingAccount = submitting && uploadPercent !== null && uploadPercent >= 100;
  const submitLabel = !submitting
    ? 'Submit registration'
    : uploading
      ? `Uploading photo… ${uploadPercent}%`
      : creatingAccount
        ? 'Creating your account…'
        : 'Sending your photo…';

  /**
   * Photo capture. Only the camera is offered - there is deliberately no
   * gallery path, because the photo has to be a live shot of the applicant for
   * admin verification to mean anything.
   */
  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera access needed',
          'Allow camera access to take your partner photo. You can enable it in Settings.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      // The upload endpoint stops at 5 MB. A photo above that limit would only
      // fail after the whole file was pushed over the mobile network, so it is
      // caught here instead.
      const fileSize = result.assets[0].fileSize;
      if (fileSize && fileSize > MAX_PHOTO_BYTES) {
        Alert.alert(
          'Photo is too large',
          'That photo is bigger than 5 MB and cannot be uploaded. Please retake it in a lower resolution.',
        );
        return;
      }

      haptics.medium();
      setPhotoUri(result.assets[0].uri);
      setPhotoMime(result.assets[0].mimeType ?? undefined);
      setUploadPercent(null);
    } catch {
      // A missing camera (simulator) or a denied permission both land here.
      error('Could not open the camera. Please check camera permission in Settings.');
    }
  };

  const valid =
    name.trim().length >= 3 &&
    phoneDigits.length >= 10 &&
    passwordValid &&
    emailValid &&
    cnicValid &&
    plateValid &&
    yearsValid &&
    Boolean(photoUri) &&
    Boolean(location);

  const firstMissing = (): string | null => {
    if (name.trim().length < 3) return 'Enter your full name';
    if (phoneDigits.length < 10) return 'Enter a valid mobile number';
    if (!passwordValid) return 'Password needs 8+ characters with a letter and a number';
    if (!emailValid) return 'Enter a valid email address';
    if (!cnicValid) return 'Enter a valid CNIC (xxxxx-xxxxxxx-x)';
    if (!plateValid) return 'Enter your bike registration number';
    if (!yearsValid) return 'Enter your years of riding experience';
    if (!photoUri) return 'Take your photo with the camera';
    if (!location) return 'Search or tap the map to set your base location';
    return null;
  };

  /** Live checklist so the form always says what is still missing. */
  const CHECKLIST = [
    { label: 'Photo taken', done: () => Boolean(photoUri) },
    { label: 'Full name', done: () => name.trim().length >= 3 },
    { label: 'Mobile number', done: () => phoneDigits.length >= 10 },
    { label: 'Email address', done: () => emailValid },
    { label: 'Secure password', done: () => passwordValid },
    { label: 'CNIC number', done: () => cnicValid },
    { label: 'Vehicle number', done: () => plateValid },
    { label: 'Experience', done: () => yearsValid },
    { label: 'Base location', done: () => Boolean(location) },
  ];

  const submit = async () => {
    // A second tap must never start a second registration: the first one may
    // already be creating the account on the server.
    if (submitting) return;
    const missing = firstMissing();
    if (missing || !photoUri || !location) {
      haptics.warning();
      setBanner(missing ?? 'Please complete all required fields');
      error(missing ?? 'Please complete all required fields');
      return;
    }

    setSubmitting(true);
    setUploadPercent(0);
    setBanner(null);
    try {
      const challenge = await authApi.registerRider({
        name: name.trim(),
        phone: phoneDigits,
        email: email.trim(),
        password,
        cnic: cnicDigits,
        baseCity: city.trim() || undefined,
        vehicleType: vehicle,
        vehiclePlate: plate.trim().toUpperCase(),
        experienceYears: years,
        location,
        photoUri,
        photoMimeType: photoMime,
        onProgress: (percent) => setUploadPercent(percent),
      });
      haptics.success();
      success('Almost done — confirm the code we emailed you');
      navigation.navigate('EmailOtp', {
        challengeToken: challenge.challengeToken,
        email: challenge.email,
        purpose: 'register',
        ttlSeconds: challenge.ttlSeconds,
      });
    } catch (err) {
      haptics.warning();
      // The server's own wording is kept: it knows whether the clash was the
      // phone number or the email, and it explains a photo that was too large.
      const raw = apiErrorMessage(err, 'Registration failed. Please try again.');
      const message = /too large/i.test(raw)
        ? 'Your photo is larger than 5 MB. Please retake it in a lower resolution.'
        : raw;
      setBanner(message);
      error(message);
    } finally {
      setSubmitting(false);
      setUploadPercent(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Become a partner" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.intro, { backgroundColor: colors.rideSoft }]}>
            <View style={[styles.introIcon, { backgroundColor: colors.ride }]}>
              <Ionicons name="bicycle-outline" size={24} color="#FFFFFF" />
            </View>
            <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
              Earn on your own time
            </AppText>
            <AppText variant="small" color={colors.textSecondary} style={styles.introText}>
              Deliver food and ride customers across Swat Valley. Keep 76% of every fare plus tips.
            </AppText>
          </View>

          {/* --- Photo: camera only ---------------------------------------- */}
          <AppText
            variant="captionBold"
            color={colors.textMuted}
            uppercase
            style={styles.blockTitle}
          >
            Your photo
          </AppText>
          <Pressable
            onPress={takePhoto}
            style={[
              styles.photoBox,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: photoUri ? colors.primary : colors.border,
              },
            ]}
          >
            {photoUri ? (
              <>
                <Image source={{ uri: photoUri }} style={styles.photo} />
                <View style={styles.photoOverlay}>
                  <Ionicons name="camera" size={18} color="#FFFFFF" />
                  <AppText variant="smallMedium" color="#FFFFFF">
                    Retake / crop
                  </AppText>
                </View>
              </>
            ) : (
              <View style={styles.photoPlaceholder}>
                <View style={[styles.photoIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="camera-outline" size={26} color={colors.primary} />
                </View>
                <AppText variant="title" weight="bold" color={colors.textPrimary}>
                  Take your photo
                </AppText>
                <AppText variant="small" color={colors.textMuted} center style={styles.photoHint}>
                  Use the camera so admin can verify you. Uploads from the gallery are not accepted.
                </AppText>
              </View>
            )}
          </Pressable>

          {/* Upload state: the camera editor already crops to a square preview,
              so "retake / crop" re-enters that editor. Progress is shown here
              because the photo is the largest part of the request and the
              account is only created after it has fully arrived. */}
          {photoUri ? (
            <View style={styles.uploadStatus}>
              {uploading ? (
                <>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: colors.primary,
                          width: `${Math.max(4, uploadPercent ?? 0)}%` as `${number}%`,
                        },
                      ]}
                    />
                  </View>
                  <AppText variant="caption" color={colors.textSecondary}>
                    Uploading your photo… {uploadPercent ?? 0}%
                  </AppText>
                </>
              ) : creatingAccount ? (
                <View style={styles.uploadRow}>
                  <Ionicons name="cloud-done-outline" size={16} color={colors.success} />
                  <AppText variant="caption" color={colors.textSecondary}>
                    Photo uploaded — creating your account…
                  </AppText>
                </View>
              ) : (
                <View style={styles.uploadRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <AppText variant="caption" color={colors.textSecondary}>
                    Photo ready. Retake or crop it if needed before submitting.
                  </AppText>
                </View>
              )}
            </View>
          ) : null}

          {/* --- Details ---------------------------------------------------- */}
          <AppText
            variant="captionBold"
            color={colors.textMuted}
            uppercase
            style={styles.blockTitle}
          >
            Your details
          </AppText>
          <AppInput
            label="Full name"
            icon="person-outline"
            placeholder="e.g. Shahid Rehman"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <AppInput
            label="Mobile number"
            icon="call-outline"
            placeholder="03XX XXXXXXX"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(t) => setPhone(digitsOnly(t).slice(0, 11))}
            maxLength={11}
          />
          <AppInput
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            hint="Riders sign in with this email and password."
          />
          <AppInput
            label="Create a password"
            icon="lock-closed-outline"
            placeholder="8+ characters, letter and number"
            secure
            value={password}
            onChangeText={setPassword}
            hint={
              password && !passwordValid
                ? 'Needs 8+ characters with a letter and a number'
                : 'This is how you will sign in'
            }
          />
          <AppInput
            label="CNIC number"
            icon="card-outline"
            placeholder="xxxxx-xxxxxxx-x"
            keyboardType="number-pad"
            value={cnic}
            onChangeText={(t) => setCnic(digitsOnly(t).slice(0, 13))}
            maxLength={13}
            error={cnic && !cnicValid ? 'Enter a valid CNIC (xxxxx-xxxxxxx-x)' : undefined}
          />
          <AppInput
            label="Base city"
            icon="location-outline"
            placeholder="Mingora"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
          />

          {/* --- Vehicle ---------------------------------------------------- */}
          <AppText
            variant="captionBold"
            color={colors.textMuted}
            uppercase
            style={styles.blockTitle}
          >
            Vehicle
          </AppText>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Chip
                key={v.key}
                label={v.label}
                leadingEmoji={v.emoji}
                selected={vehicle === v.key}
                onPress={() => {
                  haptics.light();
                  setVehicle(v.key);
                }}
              />
            ))}
          </View>
          <AppInput
            label={VEHICLES.find((v) => v.key === vehicle)?.plateLabel ?? 'Registration number'}
            icon="pricetag-outline"
            placeholder="e.g. SWAT-1234"
            value={plate}
            onChangeText={(t) => setPlate(t.toUpperCase().slice(0, 20))}
            autoCapitalize="characters"
            hint="Mandatory. Admin confirms this before you are approved."
          />
          <AppInput
            label="Years of riding experience"
            icon="school-outline"
            placeholder="e.g. 2"
            keyboardType="number-pad"
            value={experience}
            onChangeText={(t) => setExperience(digitsOnly(t).slice(0, 2))}
            maxLength={2}
            hint="Enter the number of years you have been riding"
          />

          {/* --- Base location: search, tap or GPS -------------------------- */}
          <AppText
            variant="captionBold"
            color={colors.textMuted}
            uppercase
            style={styles.blockTitle}
          >
            Base location
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            Search your area, tap the map, or use your current location to mark where you usually
            start your shift.
          </AppText>
          <LocationPickerMap
            value={location}
            initialCenter={SWAT_CENTER}
            height={230}
            confirmLabel="Set base location"
            hint="Tip: search “Saidu Sharif”, “Kabal” or tap the exact spot."
            onConfirm={(picked) => {
              haptics.success();
              setLocation(picked);
            }}
          />

          {banner ? <InlineBanner kind="error" message={banner} style={styles.banner} /> : null}

          <AppButton
            label={submitLabel}
            icon="checkmark"
            size="lg"
            onPress={submit}
            loading={submitting}
            disabled={!valid || submitting}
            style={styles.submit}
          />
          {!valid ? (
            <>
              <Pressable
                onPress={() => {
                  const message = firstMissing() ?? '';
                  setBanner(message);
                  error(message);
                }}
                hitSlop={6}
              >
                <AppText variant="small" color={colors.primary} center>
                  See what is still missing
                </AppText>
              </Pressable>

              <View
                style={[
                  styles.checklist,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                ]}
              >
                {CHECKLIST.map((item) => {
                  const done = item.done();
                  return (
                    <View key={item.label} style={styles.checkItem}>
                      <Ionicons
                        name={done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={done ? colors.success : colors.textMuted}
                      />
                      <AppText
                        variant="caption"
                        color={done ? colors.textSecondary : colors.textMuted}
                        style={styles.checkLabel}
                      >
                        {item.label}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
          <AppText variant="micro" color={colors.textMuted} style={styles.legal}>
            By continuing you agree to the Swat City Food Delivery partner terms. Your documents will be verified
            in 24-48 hours.
          </AppText>

          <Pressable
            onPress={() => info('Use “Login with email and password” on the login screen.')}
            hitSlop={6}
            style={styles.haveAccount}
          >
            <AppText variant="small" color={colors.textSecondary} center>
              Already a partner?{' '}
              <AppText variant="smallMedium" weight="bold" color={colors.primary}>
                Sign in
              </AppText>
            </AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  intro: { borderRadius: 22, padding: spacing.l, gap: spacing.xs, alignItems: 'center' },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  introText: { textAlign: 'center' },
  blockTitle: { marginTop: spacing.xs },

  photoBox: {
    height: 190,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.l },
  photoIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: { maxWidth: 260 },
  photoOverlay: {
    position: 'absolute',
    left: spacing.s,
    bottom: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(14,63,58,0.85)',
    paddingHorizontal: spacing.s,
    paddingVertical: 6,
    borderRadius: 12,
  },

  uploadStatus: { gap: 6, marginTop: spacing.xs },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },

  submit: { marginTop: spacing.sm },
  banner: { marginTop: spacing.sm },
  checklist: {
    marginTop: spacing.sm,
    padding: spacing.m,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
  },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  checkLabel: { flex: 1 },
  legal: { textAlign: 'center' },
  haveAccount: { alignItems: 'center', paddingVertical: spacing.sm },
});
