import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Dimensions, StyleProp, ViewStyle } from 'react-native';
import {
  Gesture,
  GestureDetector,
  PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';
import { setShared, springTo } from '../hooks/usePressScale';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
  showHandle?: boolean;
  closeOnBackdrop?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SCREEN = Dimensions.get('window');
const springCfg = { damping: 24, stiffness: 300, mass: 0.9 };

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  height,
  showHandle = true,
  closeOnBackdrop = true,
  style,
}: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();

  const sheetHeight = useMemo(() => {
    const max = SCREEN.height * 0.92;
    const h = height ?? Math.min(SCREEN.height * 0.62, max);
    return Math.min(h, max);
  }, [height]);

  const translateY = useSharedValue(sheetHeight + 40);
  const backdropOpacity = useSharedValue(0);
  const drag = useSharedValue(0);

  /**
   * `onClose` is captured in a ref, not directly, so the reaction worklet below
   * can call the newest callback without listing it as a dependency.
   *
   * The parent passes a fresh inline arrow on every render. When the callback
   * was read straight from the closure, Reanimated treated every parent render
   * as a dependency change and restarted the reaction mapper, whose first frame
   * runs immediately — while `translateY` was still parked at the closed offset
   * (`sheetHeight + 40`, i.e. `> sheetHeight`) — so `onClose()` fired the instant
   * the sheet opened and the sheet (and its form) vanished about a second later.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const notifyClosed = useCallback(() => {
    onCloseRef.current();
  }, []);

  /**
   * A hidden sheet is unmounted once its close animation has finished.
   *
   * `styles.wrapper` is a full-screen `position: absolute` layer at zIndex 50.
   * While it stayed mounted with `visible === false` that layer sat over the
   * pane permanently, so the admin Orders tab — the only admin screen that
   * renders a BottomSheet — painted over the bottom tab bar and its labels went
   * invisible. Every other admin tab mounts no sheet, which is exactly why only
   * Orders showed the symptom.
   *
   * Unmounting is deferred until the slide-down finishes rather than done
   * immediately, so the open/close animation still plays exactly as before; the
   * overlay simply no longer lingers in the tree once there is nothing to show.
   */
  const [mounted, setMounted] = useState(visible);
  const [prevVisible, setPrevVisible] = useState(visible);

  // Re-mount the sheet during render (the React-endorsed "adjust state when
  // props change" pattern) so the open animation starts in the same frame
  // `visible` flips to true, without a synchronous setState inside an effect.
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) setMounted(true);
  }

  // The completion callback passed to `withSpring` runs on the UI runtime, so it
  // must be a worklet. An inline non-worklet arrow here is serialized as a
  // remote function, and Reanimated 4.5.x then throws
  // "[Worklets] Tried to synchronously call a Remote Function" when the spring
  // settles (see software-mansion/react-native-reanimated#9750). Declaring it as
  // a worklet keeps the call on the UI runtime and `runOnJS` hops back safely.
  const unmountAfterClose = useCallback((finished?: boolean) => {
    'worklet';
    if (finished) runOnJS(setMounted)(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      springTo(translateY, sheetHeight + 40, springCfg, unmountAfterClose);
    }
  }, [visible, sheetHeight, translateY, unmountAfterClose]);

  useEffect(() => {
    if (visible) {
      // Clear any leftover drag offset from a previous swipe-close so the sheet
      // always reopens at its true resting position.
      setShared(drag, 0);
      springTo(translateY, 0, springCfg);
      springTo(backdropOpacity, 1, springCfg);
    } else {
      springTo(backdropOpacity, 0, springCfg);
      // translateY is driven by the unmount effect above so it can unmount the
      // sheet once the slide-down has settled.
    }
  }, [visible, sheetHeight, translateY, backdropOpacity, drag]);

  /**
   * Tells the parent a close gesture actually completed.
   *
   * Only a downward crossing counts: the sheet must have been at or above the
   * closed edge and then move past it. `previous` is `null` on the mapper's
   * first run (mount), and on open the value travels from the closed offset
   * towards `0`, so neither case can trigger this. Without the guard the
   * initial closed position looked like a close and dismissed the sheet
   * immediately after it opened.
   */
  useAnimatedReaction(
    () => translateY.value,
    (value, previous) => {
      if (previous !== null && previous <= sheetHeight && value > sheetHeight) {
        runOnJS(notifyClosed)();
      }
    },
  );

  const closeSheet = () => {
    springTo(translateY, sheetHeight + 40, springCfg);
    springTo(backdropOpacity, 0, springCfg);
  };

  const pan = Gesture.Pan()
    .onUpdate((e: PanGestureHandlerEventPayload) => {
      setShared(drag, Math.max(0, e.translationY));
    })
    .onEnd(() => {
      const threshold = sheetHeight * 0.18;
      if (drag.value > threshold) {
        closeSheet();
      } else {
        springTo(drag, 0, springCfg);
      }
    })
    .activeOffsetY(8)
    .failOffsetY(-20);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + drag.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!mounted) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrapper, style]} collapsable={false}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceRaised,
              height: sheetHeight,
              paddingBottom: insets.bottom + spacing.m,
              width: '100%',
            },
            sheetStyle,
          ]}
        >
          {showHandle && <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />}
          {(title || subtitle) && (
            <View style={styles.header}>
              <View style={styles.headerText}>
                {title && (
                  <AppText variant="h4" weight="bold" color={colors.textPrimary} numberOfLines={1}>
                    {title}
                  </AppText>
                )}
                {subtitle && (
                  <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                    {subtitle}
                  </AppText>
                )}
              </View>
              {closeOnBackdrop && <IconButton name="close" size={20} onPress={closeSheet} />}
            </View>
          )}
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </GestureDetector>

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        onTouchStart={() => {
          if (visible && closeOnBackdrop) closeSheet();
        }}
        style={[styles.backdrop, { backgroundColor: colors.overlay }, backdropStyle]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.s,
    zIndex: 51,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: spacing.m,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    marginBottom: spacing.s,
  },
  headerText: { flex: 1, gap: 2 },
  body: { flex: 1 },
});
