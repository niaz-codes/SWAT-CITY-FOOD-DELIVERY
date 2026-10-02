import { withSpring } from 'react-native-reanimated';

export const springs = {
  snappy: { damping: 18, stiffness: 260, mass: 0.8 },
  soft: { damping: 22, stiffness: 180, mass: 1 },
  bouncy: { damping: 14, stiffness: 200, mass: 0.9 },
};

export const timing = {
  fast: 180,
  normal: 260,
  slow: 420,
};

export function spring(sv: { value: number }, to: number, config?: Partial<typeof springs.snappy>) {
  'worklet';
  return withSpring(to, { ...springs.snappy, ...config });
}

export const layoutSpring = { damping: 20, stiffness: 220, mass: 1 } as const;

export const enterFade = { entering: undefined };