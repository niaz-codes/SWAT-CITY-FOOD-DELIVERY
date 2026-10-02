import React, { useEffect, useMemo } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import {
  Svg,
  Rect,
  Path,
  Circle,
  Polyline,
  Defs,
  LinearGradient as SvgLinear,
  Stop,
} from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  SharedValue,
} from 'react-native-reanimated';
import { useThemeColors } from '../theme';

export type MapPoint = { x: number; y: number };

type Props = {
  pickup?: MapPoint;
  dropoff?: MapPoint;
  progress?: SharedValue<number> | number;
  animateRouteDash?: boolean;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
};

const W = 400;
const H = 340;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CityLayout = { horizontals: number[]; verticals: number[]; parks: number[][] };

function generateCity(rng: () => number): CityLayout {
  const horizontals: number[] = [];
  for (let i = 0; i < 6; i++) {
    horizontals.push(H * (0.07 + i * 0.17) + rng() * 14 - 7);
  }
  const verticals: number[] = [];
  for (let i = 0; i < 7; i++) {
    verticals.push(W * (0.04 + i * 0.15) + rng() * 10 - 5);
  }
  const parks: number[][] = [];
  for (let i = 0; i < 5; i++) {
    parks.push([rng() * W * 0.55 + W * 0.08, rng() * H * 0.45 + H * 0.1, 30 + rng() * 40, 24 + rng() * 26]);
  }
  return { horizontals, verticals, parks };
}

const CITY = generateCity(mulberry32(20240926));

function pointDistance(a: MapPoint, b: MapPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildRoute(pickup: MapPoint, dropoff: MapPoint): MapPoint[] {
  const midX = pickup.x + (dropoff.x - pickup.x) * 0.4;
  const midY = pickup.y + (dropoff.y - pickup.y) * 0.5;
  return [
    pickup,
    { x: midX, y: pickup.y },
    { x: midX, y: midY },
    { x: dropoff.x, y: midY },
    dropoff,
  ];
}

function polylineLength(points: MapPoint[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += pointDistance(points[i - 1]!, points[i]!);
  return total;
}

function pointAt(points: MapPoint[], length: number, dist: number): MapPoint {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = pointDistance(points[i - 1]!, points[i]!);
    if (acc + seg >= dist) {
      const t = (dist - acc) / seg;
      return {
        x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * t,
        y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * t,
      };
    }
    acc += seg;
  }
  return points[points.length - 1]!;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

export function MapComponent({
  pickup = { x: 0.28, y: 0.32 },
  dropoff = { x: 0.72, y: 0.7 },
  progress,
  animateRouteDash,
  height = 260,
  rounded = 24,
  style,
}: Props) {
  const { colors } = useThemeColors();

  const layout = useMemo(() => CITY, []);
  const route = useMemo(() => buildRoute(pickup, dropoff), [pickup, dropoff]);
  const routeLength = useMemo(() => polylineLength(route), [route]);

  const dashOffset = useSharedValue(0);
  const pickupPulseProg = useSharedValue(0);
  const riderPulseProg = useSharedValue(0);

  useEffect(() => {
    if (animateRouteDash) {
      dashOffset.value = withRepeat(withTiming(-64, { duration: 900 }), -1, false);
    } else {
      dashOffset.value = 0;
    }
    pickupPulseProg.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
    riderPulseProg.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
  }, [animateRouteDash, dashOffset, pickupPulseProg, riderPulseProg]);

  const isShared = typeof progress === 'object' && progress !== null;

  const animatedDashProps = useAnimatedProps(() => ({ strokeDashoffset: dashOffset.value }));

  const riderProps = useAnimatedProps(() => {
    const p = isShared ? (progress as SharedValue<number>).value : (progress as number | undefined) ?? 0;
    const clamped = Math.min(1, Math.max(0, p));
    const pos = pointAt(route, routeLength, clamped * routeLength);
    return { cx: pos.x, cy: pos.y };
  });

  const pickupPulseProps = useAnimatedProps(() => ({
    r: 7 + pickupPulseProg.value * 10,
    opacity: 0.6 - pickupPulseProg.value * 0.42,
  }));

  const riderPulseProps = useAnimatedProps(() => ({
    r: 8 + riderPulseProg.value * 9,
    opacity: 0.5 - riderPulseProg.value * 0.38,
  }));

  const routePoints = route.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={[{ height, borderRadius: rounded, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgLinear id="mapGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.mapBackground} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.mapBackground} stopOpacity="1" />
          </SvgLinear>
        </Defs>

        <Rect width={W} height={H} fill="url(#mapGrad)" />
        <Rect width={W} height={H} fill={colors.mapBuilding} />

        {layout.parks.map(([x, y, pw, ph], i) => (
          <Rect key={`park_${i}`} x={x} y={y} width={pw} height={ph} rx={8} fill={colors.primarySoft} opacity={0.55} />
        ))}

        {/* river */}
        <Path
          d={`M ${W * 0.82} -10 C ${W * 0.74} ${H * 0.22}, ${W * 0.42} ${H * 0.3}, ${W * 0.3} ${H * 0.55} C ${W * 0.22} ${H * 0.72}, ${W * 0.26} ${H * 0.88}, ${W * 0.12} ${H + 14}`}
          stroke={colors.rideSoft}
          strokeWidth={16}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />

        {/* roads */}
        {layout.horizontals.map((y, i) => (
          <Rect key={`h_${i}`} x={-10} y={y - 3} width={W + 20} height={6} fill={colors.mapRoad} rx={3} />
        ))}
        {layout.verticals.map((x, i) => (
          <Rect key={`v_${i}`} x={x - 3} y={-10} width={6} height={H + 20} fill={colors.mapRoad} rx={3} />
        ))}

        {/* route */}
        <Polyline points={routePoints} stroke={colors.mapRoute} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" fill="none" opacity={0.95} />
        {animateRouteDash && (
          <AnimatedPolyline
            points={routePoints}
            stroke="#FFFFFF"
            strokeWidth={2.4}
            strokeDasharray={[10, 8]}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
            animatedProps={animatedDashProps}
          />
        )}

        {/* pickup marker */}
        <AnimatedCircle animatedProps={pickupPulseProps} cx={pickup.x} cy={pickup.y} fill={colors.primary} />
        <Circle cx={pickup.x} cy={pickup.y} r={8} fill={colors.primary} stroke="#FFFFFF" strokeWidth={2.5} />
        <Circle cx={pickup.x} cy={pickup.y} r={2.6} fill="#FFFFFF" />

        {/* dropoff marker */}
        <Circle cx={dropoff.x} cy={dropoff.y} r={8} fill={colors.danger} stroke="#FFFFFF" strokeWidth={2.5} />
        <Circle cx={dropoff.x} cy={dropoff.y} r={2.6} fill="#FFFFFF" />

        {/* rider marker */}
        {progress != null && (
          <>
            <AnimatedCircle animatedProps={riderPulseProps} fill={colors.ride} />
            <AnimatedCircle animatedProps={riderProps} r={9} fill={colors.ride} stroke="#FFFFFF" strokeWidth={2.5} />
            <AnimatedCircle animatedProps={riderProps} r={3} fill="#FFFFFF" />
          </>
        )}
      </Svg>
    </View>
  );
}