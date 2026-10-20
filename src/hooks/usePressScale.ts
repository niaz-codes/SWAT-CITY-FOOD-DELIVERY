import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

type SpringConfig = { damping: number; stiffness: number; mass?: number };

/**
 * Starts a spring animation on a Reanimated shared value.
 *
 * Shared values are mutable by design and their mutations are executed on the
 * UI thread. Keeping the assignment inside this module-level worklet means the
 * React Compiler lint rules do not misreport the standard Reanimated pattern
 * as a frozen render-value mutation.
 *
 * `onFinished` runs on the UI runtime (that is where `withSpring` invokes its
 * completion callback), so callers MUST pass a worklet — use `runOnJS` inside it
 * to reach the JS thread. A plain JS closure here gets serialized as a remote
 * function and Reanimated 4.5.x throws
 * "[Worklets] Tried to synchronously call a Remote Function" when it fires
 * (software-mansion/react-native-reanimated#9750).
 */
export function springTo(
  sv: SharedValue<number>,
  to: number,
  config: SpringConfig,
  onFinished?: (finished?: boolean) => void,
): void {
  'worklet';
  sv.value = withSpring(to, config, onFinished);
}

/** Instantly sets a shared value (worklet-safe). */
export function setShared(sv: SharedValue<number>, to: number): void {
  'worklet';
  sv.value = to;
}

/**
 * Shared press-scale animation used by every tappable card and button.
 *
 * Returns the animated style plus stable press-in/press-out handlers.
 */
export function usePressScale(from: number, damping: number, stiffness: number) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pressIn = useCallback(
    () => springTo(scale, from, { damping, stiffness }),
    [scale, from, damping, stiffness],
  );
  const pressOut = useCallback(
    () => springTo(scale, 1, { damping, stiffness }),
    [scale, damping, stiffness],
  );
  return { animStyle, pressIn, pressOut };
}
