import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { AppInput } from '../AppInput';
import { Chip } from '../Chip';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { usePresence } from '../../state/PresenceProvider';

// ---------------------------------------------------------------------------
// StatusBadge — maps domain status strings to badge tones
// ---------------------------------------------------------------------------
const TONE_MAP: Record<
  string,
  'primary' | 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'ride'
> = {
  active: 'success',
  approved: 'success',
  verified: 'success',
  paid: 'success',
  delivered: 'success',
  completed: 'success',
  resolved: 'success',
  sent: 'success',
  online: 'success',
  open: 'info',
  in_progress: 'info',
  placed: 'info',
  confirmed: 'info',
  preparing: 'warning',
  ready: 'warning',
  arriving: 'info',
  assigned: 'info',
  rider_assigned: 'info',
  pending: 'warning',
  suspended: 'warning',
  cancelled: 'danger',
  failed: 'danger',
  rejected: 'danger',
  closed: 'neutral',
  deactivated: 'neutral',
  offline: 'neutral',
  scheduled: 'neutral',
  searching: 'warning',
  started: 'info',
  accepted: 'success',
  refunded: 'info',
  on_the_way: 'primary',
  picked_up: 'primary',
};

export function statusTone(status: string) {
  return TONE_MAP[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge label={statusLabel(status)} tone={statusTone(status)} />;
}

// ---------------------------------------------------------------------------
// PresenceBadge / PresenceDot — live connection state, not a stored status
// ---------------------------------------------------------------------------
// These read from PresenceProvider, which the backend keeps in sync from the
// socket layer. Tones are chosen explicitly rather than through `statusTone`
// because presence must be unambiguous: green for online, red for offline.

export function PresenceBadge({
  userId,
  onlineLabel = 'Online',
  offlineLabel = 'Offline',
}: {
  userId?: string | null;
  onlineLabel?: string;
  offlineLabel?: string;
}) {
  const online = usePresence().isOnline(userId);
  return <Badge label={online ? onlineLabel : offlineLabel} tone={online ? 'success' : 'danger'} />;
}

/** Compact dot for list rows, where a badge would crowd the cell. */
export function PresenceDot({ userId, size = 10 }: { userId?: string | null; size?: number }) {
  const { colors } = useThemeColors();
  const online = usePresence().isOnline(userId);
  return (
    <View
      style={[
        styles.presenceDot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: online ? colors.success : colors.danger,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
export function StatCard({
  icon,
  label,
  value,
  accent = 'primary',
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: 'primary' | 'ride' | 'success' | 'warning' | 'danger' | 'info';
  style?: object;
}) {
  const { colors } = useThemeColors();
  const soft: Record<string, string> = {
    primary: colors.primarySoft,
    ride: colors.rideSoft,
    success: colors.successSoft,
    warning: colors.warningSoft,
    danger: colors.dangerSoft,
    info: colors.rideSoft,
  };
  const fg: Record<string, string> = {
    primary: colors.primary,
    ride: colors.ride,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  };
  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      style={[
        styles.statCard,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        style,
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: soft[accent] }]}>
        <Ionicons name={icon} size={18} color={fg[accent]} />
      </View>
      <AppText variant="micro" color={colors.textMuted} style={styles.statLabel} numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="h4" weight="extraBold" color={colors.textPrimary} numberOfLines={1}>
        {value}
      </AppText>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// FilterChips
// ---------------------------------------------------------------------------
export function FilterRow({
  options,
  value,
  onChange,
}: {
  options: (string | { label: string; value: string })[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((o) => {
        const label = typeof o === 'string' ? o : o.label;
        const key = typeof o === 'string' ? o : o.value;
        return (
          <Chip key={key} label={label} selected={value === key} onPress={() => onChange(key)} />
        );
      })}
    </ScrollView>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <AppInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Search…'}
        icon="search"
      />
    </View>
  );
}

export function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.sectionLabelRow}>
      <AppText variant="captionBold" color={colors.textMuted} uppercase>
        {label}
      </AppText>
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Charts (dependency-free)
// ---------------------------------------------------------------------------
export function BarChartSimple({
  data,
  height = 120,
  accent,
  valueFormat,
}: {
  data: { label: string; value: number }[];
  height?: number;
  accent?: string;
  valueFormat?: (v: number) => string;
}) {
  const { colors } = useThemeColors();
  const max = Math.max(1, ...data.map((d) => d.value));
  const barColor = accent ?? colors.primary;
  return (
    <View style={styles.chartRow}>
      {data.map((d, i) => (
        <View key={i} style={styles.barCol}>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted, height }]}>
            <View
              style={[
                styles.barFill,
                { height: `${Math.max(6, (d.value / max) * 100)}%`, backgroundColor: barColor },
              ]}
            />
          </View>
          <AppText
            variant="micro"
            color={colors.textMuted}
            numberOfLines={1}
            style={styles.chartTick}
          >
            {d.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function LineChartSvg({
  data,
  height = 140,
  color,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  const { colors } = useThemeColors();
  const width = 320;
  const pad = 12;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const stepX = (width - pad * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (d.value - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lineColor = color ?? colors.ride;
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Polyline
          points={pts.join(' ')}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => {
          const [x, y] = p.split(',').map(Number);
          return (
            <Circle
              key={i}
              cx={x}
              cy={y}
              r={3}
              fill={colors.surfaceRaised}
              stroke={lineColor}
              strokeWidth={2}
            />
          );
        })}
      </Svg>
      <View style={styles.chartRow}>
        {data.map((d, i) => (
          <AppText
            key={i}
            variant="micro"
            color={colors.textMuted}
            numberOfLines={1}
            style={styles.chartTick}
          >
            {d.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const CHART_COLORS = ['#0E9488', '#1B84B5', '#F19A1B', '#E5484D', '#7B2CBF', '#3FB08C'];

export function DonutChartSvg({
  data,
  size = 150,
  thickness = 20,
}: {
  data: { label: string; count: number }[];
  size?: number;
  thickness?: number;
}) {
  const { colors } = useThemeColors();
  const total = Math.max(
    1,
    data.reduce((s, d) => s + d.count, 0),
  );
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const lengths = data.map((d) => (d.count / total) * circ);
  const segments = data.map((d, i) => {
    const len = lengths[i]!;
    // Each segment's dash offset is the negative sum of all preceding
    // segments' lengths (computed purely, no render-time mutation).
    const rotate = -lengths.slice(0, i).reduce((s, l) => s + l, 0);
    return {
      dash: `${len} ${circ - len}`,
      rotate,
      color: CHART_COLORS[i % CHART_COLORS.length]!,
    };
  });
  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        {segments.map((seg, i) => (
          <Circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={seg.dash}
            strokeDashoffset={seg.rotate}
            strokeLinecap="butt"
          />
        ))}
        <Circle
          cx={cx}
          cy={cy}
          r={r * 0.66}
          fill="none"
          stroke={colors.surfaceMuted}
          strokeWidth={thickness * 0.7}
        />
      </Svg>
      <View
        style={[styles.donutCenter, { width: size - thickness * 2, height: size - thickness * 2 }]}
      >
        <AppText variant="h3" weight="extraBold" color={colors.textPrimary}>
          {total}
        </AppText>
        <AppText variant="micro" color={colors.textMuted}>
          total
        </AppText>
      </View>
    </View>
  );
}

export function LegendList({ data }: { data: { label: string; count: number }[] }) {
  const { colors } = useThemeColors();
  const total = Math.max(
    1,
    data.reduce((s, d) => s + d.count, 0),
  );
  return (
    <View style={styles.legend}>
      {data.map((d, i) => (
        <View key={d.label} style={styles.legendRow}>
          <View
            style={[styles.legendDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]}
          />
          <AppText variant="small" color={colors.textSecondary} style={styles.legendLabel}>
            {d.label}
          </AppText>
          <AppText variant="smallMedium" weight="bold" color={colors.textPrimary}>
            {d.count}
          </AppText>
          <AppText variant="micro" color={colors.textMuted} style={styles.legendPct}>
            {Math.round((d.count / total) * 100)}%
          </AppText>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Generic list scaffolding for admin screens
// ---------------------------------------------------------------------------
export function ListNotice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <AppText variant="small" color={colors.textSecondary} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  );
}

export function formatPk(value: number): string {
  return formatCurrency(value);
}

const styles = StyleSheet.create({
  statCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm, gap: 2 },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  statLabel: { marginTop: 2 },
  chipRow: { gap: spacing.s, paddingHorizontal: spacing.m, paddingVertical: spacing.s },
  presenceDot: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  searchWrap: { paddingHorizontal: spacing.m, marginBottom: spacing.xs },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { width: '72%', borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 8 },
  chartTick: { maxWidth: '100%', textAlign: 'center' },
  donutWrap: { alignItems: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  legend: { gap: spacing.s },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1 },
  legendPct: { minWidth: 34, textAlign: 'right' },
  notice: {
    flexDirection: 'row',
    gap: spacing.s,
    borderRadius: radius.md,
    padding: spacing.m,
    alignItems: 'flex-start',
  },
  noticeText: { flex: 1 },
});
