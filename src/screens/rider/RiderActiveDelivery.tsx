import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { Avatar } from '../../components/Avatar';
import { MapComponent } from '../../components/MapComponent';
import { rideApiSearch } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency, formatDuration } from '../../utils/format';
import { RideRequest } from '../../types/domain';
import { haptics } from '../../hooks/useHaptics';
import { useToast } from '../../state/ToastProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'RiderActiveDelivery'>;

type Stage = 'pending' | 'toPickup' | 'toDropoff' | 'delivered';

export function RiderActiveDeliveryScreen({ route, navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, info } = useToast();
  const [stage, setStage] = useState<Stage>('pending');
  const [declined, setDeclined] = useState(false);

  const data = useAsyncData(() => rideApiSearch(), []);
  const request = (data.data ?? []).find((r) => (!route.params.primaryRequest ? r.type === 'ride' : true)) ?? data.data?.[0] ?? null;

  const accept = () => {
    haptics.success();
    success('Request accepted');
    setStage('toPickup');
  };

  const decline = () => {
    haptics.medium();
    setDeclined(true);
    info('Request declined');
  };

  const pickedUp = () => {
    haptics.success();
    success('Items picked up');
    setStage('toDropoff');
  };

  const complete = () => {
    haptics.success();
    setStage('delivered');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader
        title={stage === 'pending' ? 'New request' : stage === 'delivered' ? 'Trip complete' : 'Active delivery'}
        onBack={
          stage === 'pending'
            ? () => navigation.goBack()
            : stage === 'delivered'
              ? () => navigation.goBack()
              : undefined
        }
        right={<Badge label={stage === 'pending' ? 'New' : stage === 'delivered' ? 'Done' : 'Live'} tone={stage === 'delivered' ? 'success' : 'danger'} icon={stage === 'delivered' ? 'checkmark-circle' : 'radio-button-on'} />}
      />

      {request ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          {stage === 'pending' && !declined && (
            <View style={[styles.arriveBanner, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="flash-outline" size={18} color={colors.danger} />
              <AppText variant="smallMedium" weight="bold" color={colors.danger}>
                New request · respond within 60s
              </AppText>
            </View>
          )}

          {declined && stage === 'pending' && (
            <View style={[styles.arriveBanner, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.textSecondary} />
              <AppText variant="smallMedium" weight="bold" color={colors.textSecondary}>
                Declined · waiting for the next request
              </AppText>
            </View>
          )}

          {stage !== 'pending' && (
            <MapComponent
              pickup={{ x: 0.3, y: 0.45 }}
              dropoff={stage === 'toDropoff' ? { x: 0.72, y: 0.62 } : undefined}
              height={180}
              rounded={24}
            />
          )}

          <View style={[styles.steps, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Step icon="storefront-outline" label="Pickup" value={request.pickup} active={stage === 'toPickup'} done={stage === 'toDropoff' || stage === 'delivered'} />
            <View style={[styles.stepLine, { backgroundColor: colors.borderStrong }]} />
            <Step icon="location-outline" label="Drop off" value={request.dropoff} active={stage === 'toDropoff'} done={stage === 'delivered'} />
          </View>

          <View style={[styles.customerCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Avatar name={request.customerName} gradient={['#0E9488', '#0E3F3A']} size={46} />
            <View style={styles.customerInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>{request.customerName}</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {request.customerRating.toFixed(1)} ★ · {request.vehicle} · {formatDuration(request.durationMin)}
              </AppText>
            </View>
            <View style={styles.customerActions}>
              <Pressable onPress={() => info('Calling customer (simulated)')} style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]} hitSlop={6}>
                <Ionicons name="call-outline" size={20} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => info('SMS sent (simulated)')} style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]} hitSlop={6}>
                <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.fareCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View>
              <AppText variant="small" color={colors.textMuted}>Trip fare</AppText>
              <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>{formatCurrency(request.fare)}</AppText>
            </View>
            <View style={styles.fareDivider} />
            <View>
              <AppText variant="small" color={colors.textMuted}>You earn</AppText>
              <AppText variant="h4" weight="extraBold" color={colors.success}>{formatCurrency(Math.round(request.fare * 0.76))}</AppText>
            </View>
            <View style={styles.fareDivider} />
            <View>
              <AppText variant="small" color={colors.textMuted}>Distance</AppText>
              <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>{request.distanceKm.toFixed(1)} km</AppText>
            </View>
          </View>

          {stage === 'pending' &&
            (declined ? (
              <AppButton label="Back to requests" variant="secondary" onPress={() => navigation.goBack()} />
            ) : (
              <View style={styles.decisionRow}>
                <AppButton label="Decline" variant="outline" onPress={decline} fullWidth={false} style={styles.decisionBtn} />
                <AppButton label="Accept" icon="checkmark" onPress={accept} fullWidth={false} style={styles.decisionBtn} />
              </View>
            ))}

          {stage === 'toPickup' && (
            <AppButton label="Start navigation" icon="navigate" size="lg" onPress={() => navigation.navigate('RiderNavigation')} />
          )}

          {stage === 'toPickup' && (
            <AppButton label="I've reached pickup" variant="secondary" onPress={pickedUp} />
          )}

          {stage === 'toDropoff' && (
            <>
              <AppButton label="Start navigation" icon="navigate" size="lg" onPress={() => navigation.navigate('RiderNavigation')} />
              <AppButton label="Mark delivered" icon="checkmark-done" onPress={complete} />
            </>
          )}

          {stage === 'delivered' && (
            <View style={[styles.doneCard, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="checkmark-circle" size={30} color={colors.success} />
              <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>Delivered!</AppText>
              <AppText variant="small" color={colors.textSecondary}>
                {formatCurrency(Math.round(request.fare * 0.76))} added to your earnings.
              </AppText>
              <AppButton label="Done" onPress={() => navigation.goBack()} style={styles.doneBtn} />
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.loading}>
          <AppText variant="body" color={colors.textMuted}>Loading request…</AppText>
        </View>
      )}
    </View>
  );
}

function Step({ icon, label, value, active, done }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; active: boolean; done: boolean }) {
  const { colors } = useThemeColors();
  const occupied = active || done;
  return (
    <View style={styles.step}>
      <View style={[styles.stepIcon, { backgroundColor: done ? colors.successSoft : occupied ? colors.rideSoft : colors.surfaceMuted }]}>
        <Ionicons name={icon} size={18} color={done ? colors.success : occupied ? colors.ride : colors.textSecondary} />
      </View>
      <View style={styles.stepText}>
        <AppText variant="small" color={colors.textMuted}>{label}</AppText>
        <AppText variant="title" weight="bold" color={colors.textPrimary} numberOfLines={2}>{value}</AppText>
      </View>
      {done && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  arriveBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, borderRadius: 16, padding: spacing.m },
  steps: { borderRadius: 20, borderWidth: 1, padding: spacing.m },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepLine: { width: 2, height: 18, marginLeft: 22 },
  stepIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, gap: 1 },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, borderRadius: 20, borderWidth: 1, padding: spacing.m },
  customerInfo: { flex: 1, gap: 1 },
  customerActions: { flexDirection: 'row', gap: spacing.s },
  actionBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fareCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  fareDivider: { width: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.1)' },
  decisionRow: { flexDirection: 'row', gap: spacing.sm },
  decisionBtn: { flex: 1 },
  doneCard: { borderRadius: 22, padding: spacing.l, alignItems: 'center', gap: spacing.xs },
  doneBtn: { marginTop: spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});