import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { StatusBadge, SearchField, FilterRow, PresenceDot } from '../../components/admin/AdminUI';
import { Skeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { LeafletMap, type MapMarker } from '../../components/map/LeafletMap';
import { adminApi } from '../../services/admin';
import { onSocketEvent } from '../../services/socket';
import { apiErrorMessage } from '../../services/client';
import type { LiveRider, RiderLocationEvent } from '../../types/domain';
import type { AdminRider } from '../../types/admin';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency, timeAgo } from '../../utils/format';
import { useToast } from '../../state/ToastProvider';
import { haptics } from '../../hooks/useHaptics';

export function AdminRiders() {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success, error } = useToast();
  const data = useAsyncData(() => adminApi.getRiders(), []);
  const [query, setQuery] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<AdminRider | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [plateDraft, setPlateDraft] = useState('');
  const [liveMapOpen, setLiveMapOpen] = useState(false);
  const [live, setLive] = useState<LiveRider[]>([]);

  // Live map rows are kept in a ref-free state so socket updates re-render only
  // the map, not the rider list.
  const liveRef = useRef<Map<string, LiveRider>>(new Map());

  const riders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.data ?? [])
      .filter((r) => (appFilter === 'all' ? true : r.applicationStatus === appFilter))
      .filter((r) => (statusFilter === 'all' ? true : r.riderStatus === statusFilter))
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          r.plateNumber.toLowerCase().includes(q),
      );
  }, [data.data, query, appFilter, statusFilter]);

  // Load the live snapshot when the map opens, then keep it current.
  useEffect(() => {
    if (!liveMapOpen) return;
    let cancelled = false;

    adminApi
      .liveRiders()
      .then((rows) => {
        if (cancelled) return;
        liveRef.current = new Map(rows.map((r) => [r.id, r]));
        setLive(rows);
      })
      .catch(() => undefined);

    const unsubscribe = onSocketEvent<RiderLocationEvent>('rider:location', (event) => {
      const row = liveRef.current.get(event.riderId);
      if (!row) return;
      const next: LiveRider = {
        ...row,
        latitude: event.latitude,
        longitude: event.longitude,
        heading: event.heading,
        status: event.status,
        lastLocationAt: event.timestamp,
      };
      liveRef.current = { ...liveRef.current, [event.riderId]: next };
      setLive((prev) => prev.map((r) => (r.id === event.riderId ? next : r)));
    });

    return () => {
      cancelled = true;
      void unsubscribe.then((off) => off());
    };
  }, [liveMapOpen]);

  const markers: MapMarker[] = live
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      lat: r.latitude as number,
      lng: r.longitude as number,
      kind: 'rider' as const,
      avatarUrl: r.avatarUrl,
      heading: r.heading,
      popupLines: [
        { label: 'Status', value: r.status === 'busy' ? 'On Delivery' : r.status },
        { label: 'Bike', value: r.vehiclePlate || r.vehicleType },
        { label: 'Fix', value: r.lastLocationAt ? timeAgo(new Date(r.lastLocationAt)) : 'never' },
      ],
    }));

  const pickAndUploadPhoto = useCallback(async () => {
    if (!selected) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      error('Photo access is needed to set an approved profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setBusy(true);
    try {
      await adminApi.uploadRiderAvatar(selected.id, result.assets[0].uri);
      await data.refetch();
      success('Approved photo updated.');
    } catch (err) {
      error(apiErrorMessage(err, 'Could not upload the photo'));
    } finally {
      setBusy(false);
    }
  }, [selected, data, success, error]);

  const verify = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await adminApi.verifyRider(selected.id, approve, rejectReason);
      await data.refetch();
      setSelected((cur) =>
        cur
          ? {
              ...cur,
              applicationStatus: approve ? 'approved' : 'rejected',
              rejectionReason: approve ? null : rejectReason,
            }
          : cur,
      );
      setRejectOpen(false);
      setRejectReason('');
      success(
        approve ? 'Rider approved. They can now go online.' : 'Rider rejected with a reason.',
      );
    } catch (err) {
      error(apiErrorMessage(err, 'Could not update the rider'));
    } finally {
      setBusy(false);
    }
  };

  const savePlate = async () => {
    if (!selected || !plateDraft.trim()) return;
    setBusy(true);
    try {
      await adminApi.setRiderPlate(selected.id, plateDraft);
      setSelected((cur) => (cur ? { ...cur, plateNumber: plateDraft.trim() } : cur));
      setPlateDraft('');
      success('Bike number updated.');
    } catch (err) {
      error(apiErrorMessage(err, 'Could not update the bike number'));
    } finally {
      setBusy(false);
    }
  };

  const reviewVehicle = async (approve: boolean) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (approve) {
        await adminApi.approveRiderVehicle(selected.id);
        const p = selected.pendingVehicle;
        setSelected((cur) =>
          cur
            ? {
                ...cur,
                vehicle: (p?.vehicleType as typeof cur.vehicle) ?? cur.vehicle,
                plateNumber: p?.vehiclePlate ?? cur.plateNumber,
                pendingVehicle: null,
              }
            : cur,
        );
        success('Vehicle change approved. The rider’s details are updated.');
      } else {
        await adminApi.rejectRiderVehicle(selected.id);
        setSelected((cur) => (cur ? { ...cur, pendingVehicle: null } : cur));
        success('Vehicle change rejected. Current details stay active.');
      }
    } catch (err) {
      error(apiErrorMessage(err, 'Could not review the vehicle change'));
    } finally {
      setBusy(false);
    }
  };

  const toggleSuspend = async () => {
    if (busy || !selected) return;
    setBusy(true);
    const next = selected.status === 'active' ? 'suspended' : 'active';
    try {
      await adminApi.setUserStatus(selected.id, next);
      await data.refetch();
      setSelected((cur) => (cur ? { ...cur, status: next } : cur));
      success(next === 'active' ? 'Rider re-activated.' : 'Rider suspended.');
    } catch (err) {
      error(apiErrorMessage(err, 'Could not update the rider'));
    } finally {
      setBusy(false);
      setConfirmSuspend(false);
    }
  };

  const pendingCount = riders.filter((r) => r.applicationStatus === 'pending').length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={`Riders${pendingCount ? ` · ${pendingCount} pending` : ''}`} elevated />
      <SearchField value={query} onChange={setQuery} placeholder="Search rider, phone or plate" />

      <View style={styles.filterBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <FilterRow
            options={['all', 'pending', 'approved', 'rejected']}
            value={appFilter}
            onChange={setAppFilter}
          />
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <FilterRow
            options={['all', 'online', 'offline', 'busy']}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </ScrollView>
      </View>

      <FlatList
        data={riders}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        // Pull down at the top to re-read the rider list. Live locations keep
        // streaming over the socket independently of this refresh.
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={data.onRefresh}
            tintColor={colors.ride}
          />
        }
        ListHeaderComponent={
          <Pressable
            onPress={() => {
              haptics.light();
              setLiveMapOpen(true);
            }}
            style={[
              styles.liveCard,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <Ionicons name="map-outline" size={18} color={colors.primary} />
            <AppText
              variant="smallMedium"
              weight="bold"
              color={colors.textPrimary}
              style={styles.liveLabel}
            >
              Live rider map
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        }
        ListEmptyComponent={
          data.loading ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={84} rounded={16} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="bicycle-outline"
              title="No riders"
              message="No riders match your filters."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setPlateDraft(item.plateNumber);
              setSelected(item);
            }}
            style={[
              styles.rowCard,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <View style={styles.avatarWrap}>
              <Avatar
                name={item.name}
                gradient={item.avatarGradient ?? [colors.ride, colors.primary]}
                uri={item.avatarUrl}
                size={48}
              />
              {/* Socket-level presence: whether the rider's app is connected,
                  independent of the DB working status shown in the badges. */}
              <View style={[styles.dotWrap, { borderColor: colors.surfaceRaised }]}>
                <PresenceDot userId={item.id} />
              </View>
            </View>
            <View style={styles.rowText}>
              <View style={styles.rowName}>
                <AppText
                  variant="smallMedium"
                  weight="bold"
                  color={colors.textPrimary}
                  numberOfLines={1}
                >
                  {item.name}
                </AppText>
                {item.applicationStatus === 'pending' && (
                  <Badge label="Pending" tone="warning" icon="hourglass-outline" />
                )}
                {!item.hasApprovedPhoto && (
                  <Badge label="No photo" tone="neutral" icon="camera-outline" />
                )}
              </View>
              <AppText variant="micro" color={colors.textMuted}>
                {item.vehicle} · {item.plateNumber || 'no plate'}
              </AppText>
              <AppText variant="micro" color={colors.textSecondary}>
                {item.deliveries} deliveries · {formatCurrency(item.earnings)} earned
              </AppText>
            </View>
            <View style={styles.rowRight}>
              <StatusBadge status={item.applicationStatus} />
              {item.pendingVehicle ? (
                <Badge label="Vehicle" tone="warning" icon="time-outline" />
              ) : null}
              <Badge
                label={
                  item.riderStatus === 'busy'
                    ? 'On Delivery'
                    : item.riderStatus === 'online'
                      ? 'Online'
                      : 'Offline'
                }
                tone={
                  item.riderStatus === 'online'
                    ? 'success'
                    : item.riderStatus === 'busy'
                      ? 'info'
                      : 'neutral'
                }
              />
            </View>
          </Pressable>
        )}
      />

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={selected ? `${selected.vehicle} · ${selected.plateNumber}` : undefined}
        height={520}
      >
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetMeta}>
              <Avatar
                name={selected.name}
                gradient={selected.avatarGradient ?? [colors.ride, colors.primary]}
                uri={selected.avatarUrl}
                size={64}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium" weight="bold" color={colors.textPrimary}>
                  {selected.name}
                </AppText>
                <AppText variant="small" color={colors.textMuted}>
                  {selected.phone}
                </AppText>
              </View>
              <StatusBadge status={selected.applicationStatus} />
            </View>

            <View style={[styles.photoRow, { borderColor: colors.border }]}>
              <Ionicons
                name={selected.hasApprovedPhoto ? 'checkmark-circle' : 'camera-outline'}
                size={16}
                color={selected.hasApprovedPhoto ? colors.success : colors.warning}
              />
              <AppText variant="micro" color={colors.textSecondary} style={styles.photoLabel}>
                {selected.hasApprovedPhoto ? 'Approved photo on file' : 'No approved photo yet'}
              </AppText>
              <AppButton
                label="Upload"
                onPress={pickAndUploadPhoto}
                loading={busy}
                variant="secondary"
              />
            </View>

            <View style={styles.sheetRows}>
              <MetaRow
                label="Account"
                value={
                  <Badge
                    label={selected.status}
                    tone={selected.status === 'active' ? 'success' : 'danger'}
                  />
                }
              />
              <MetaRow
                label="Rider status"
                value={
                  <Badge
                    label={
                      selected.riderStatus === 'busy'
                        ? 'On Delivery'
                        : selected.riderStatus === 'online'
                          ? 'Online'
                          : 'Offline'
                    }
                    tone={
                      selected.riderStatus === 'online'
                        ? 'success'
                        : selected.riderStatus === 'busy'
                          ? 'info'
                          : 'neutral'
                    }
                  />
                }
              />
              <MetaRow label="CNIC" valueText={selected.cnic || 'not provided'} />
              <MetaRow
                label="Documents"
                value={
                  <Badge
                    label={selected.docStatus}
                    tone={
                      selected.docStatus === 'verified'
                        ? 'success'
                        : selected.docStatus === 'pending'
                          ? 'warning'
                          : 'danger'
                    }
                  />
                }
              />
              <MetaRow label="Rating" valueText={`★ ${selected.rating || '—'}`} />
              <MetaRow label="Deliveries" valueText={String(selected.deliveries)} />
              <MetaRow label="Earnings" valueText={formatCurrency(selected.earnings)} />
              <MetaRow label="Joined" valueText={timeAgo(selected.joinedAt)} />
            </View>

            {selected.rejectionReason ? (
              <View style={[styles.reasonBox, { backgroundColor: colors.dangerSoft }]}>
                <AppText variant="microBold" color={colors.danger}>
                  REJECTION REASON
                </AppText>
                <AppText variant="small" color={colors.textSecondary}>
                  {selected.rejectionReason}
                </AppText>
              </View>
            ) : null}

            {selected.pendingVehicle ? (
              <View style={[styles.pendingBox, { borderColor: colors.warning }]}>
                <View style={styles.pendingHeader}>
                  <Ionicons name="time-outline" size={16} color={colors.warning} />
                  <AppText variant="microBold" color={colors.warning}>
                    VEHICLE CHANGE REQUESTED
                  </AppText>
                </View>
                <AppText variant="small" color={colors.textSecondary}>
                  {selected.pendingVehicle.note ?? 'The rider proposed new vehicle details.'}
                </AppText>
                <AppText variant="micro" color={colors.textMuted}>
                  Current: {selected.vehicle} · {selected.plateNumber || 'no plate'}
                </AppText>
                <View style={styles.actionRow}>
                  <AppButton
                    label="Approve"
                    onPress={() => reviewVehicle(true)}
                    icon="checkmark"
                    loading={busy}
                    size="sm"
                    style={{ flex: 1 }}
                  />
                  <AppButton
                    label="Reject"
                    onPress={() => reviewVehicle(false)}
                    variant="danger"
                    icon="close"
                    loading={busy}
                    size="sm"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}

            <View style={[styles.plateRow, { borderColor: colors.border }]}>
              <AppInput
                label="Bike number"
                value={plateDraft}
                onChangeText={setPlateDraft}
                placeholder="e.g. ABC-8542"
                autoCapitalize="characters"
                containerStyle={styles.plateInput}
              />
              <AppButton label="Save" onPress={savePlate} loading={busy} variant="secondary" />
            </View>

            <View style={styles.actions}>
              {selected.applicationStatus === 'pending' && (
                <View style={styles.actionRow}>
                  <AppButton
                    label="Approve"
                    onPress={() => verify(true)}
                    loading={busy}
                    icon="checkmark"
                    style={{ flex: 1 }}
                  />
                  <AppButton
                    label="Reject"
                    onPress={() => setRejectOpen(true)}
                    variant="danger"
                    icon="close"
                    style={{ flex: 1 }}
                  />
                </View>
              )}
              {selected.applicationStatus === 'approved' && (
                <AppButton
                  label={selected.status === 'active' ? 'Suspend rider' : 'Re-activate rider'}
                  onPress={() => setConfirmSuspend(true)}
                  variant={selected.status === 'active' ? 'danger' : 'primary'}
                  loading={busy}
                />
              )}
              {selected.applicationStatus === 'rejected' && (
                <AppButton
                  label="Reconsider application"
                  onPress={() => verify(true)}
                  variant="secondary"
                  icon="refresh-outline"
                  loading={busy}
                />
              )}
            </View>
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject rider"
        subtitle="A reason is required and the rider will see it."
        height={340}
      >
        <View style={styles.sheet}>
          <AppInput
            label="Reason"
            value={rejectReason}
            onChangeText={setRejectReason}
            placeholder="e.g. CNIC image is blurry, please resubmit"
            multiline
            maxLength={240}
          />
          <View style={styles.actionRow}>
            <AppButton
              label="Cancel"
              onPress={() => setRejectOpen(false)}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <AppButton
              label="Reject rider"
              onPress={() => verify(false)}
              variant="danger"
              loading={busy}
              disabled={!rejectReason.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={liveMapOpen}
        onClose={() => setLiveMapOpen(false)}
        title="Live rider map"
        subtitle={`${markers.length} approved rider${markers.length === 1 ? '' : 's'} reporting a position`}
        height={520}
      >
        <View style={styles.sheet}>
          {markers.length ? (
            <>
              <LeafletMap markers={markers} height={280} followMarkers />
              <AppText variant="micro" color={colors.textMuted}>
                Only approved riders who are online or on a delivery appear here. Offline riders
                stop reporting, so a missing marker means offline, not a fault.
              </AppText>
            </>
          ) : (
            <EmptyState
              icon="location-outline"
              title="No riders reporting"
              message="Once an approved rider goes online or starts a delivery, their marker appears here."
            />
          )}
        </View>
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmSuspend}
        title={selected?.status === 'active' ? 'Suspend this rider?' : 'Re-activate this rider?'}
        message={
          selected?.status === 'active'
            ? 'The rider will not be able to go online or accept deliveries.'
            : 'The rider will regain access to accept deliveries.'
        }
        confirmLabel={selected?.status === 'active' ? 'Suspend' : 'Re-activate'}
        tone={selected?.status === 'active' ? 'danger' : 'primary'}
        onConfirm={toggleSuspend}
        onCancel={() => setConfirmSuspend(false)}
      />
    </View>
  );
}

function MetaRow({
  label,
  value,
  valueText,
}: {
  label: string;
  value?: React.ReactNode;
  valueText?: string;
}) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.metaRow}>
      <AppText variant="small" color={colors.textMuted}>
        {label}
      </AppText>
      {value ?? (
        <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
          {valueText}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  filterBlock: { gap: spacing.xs },
  filterScroll: { paddingHorizontal: spacing.m },
  list: { paddingHorizontal: spacing.m, paddingTop: spacing.xs, gap: spacing.sm },
  skeletonList: { gap: spacing.sm, paddingTop: spacing.sm },
  liveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  liveLabel: { flex: 1 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
  },
  avatarWrap: { position: 'relative' },
  dotWrap: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderRadius: 9,
    borderWidth: 2,
    padding: 1,
  },
  rowText: { flex: 1, gap: 2 },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  sheet: { gap: spacing.sm },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  photoLabel: { flex: 1 },
  sheetRows: { gap: spacing.xs, paddingVertical: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reasonBox: { gap: 2, borderRadius: radius.md, padding: spacing.sm },
  pendingBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  plateInput: { flex: 1 },
  actions: { gap: spacing.s, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.s },
});
