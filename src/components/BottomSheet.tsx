import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions, StyleProp, ViewStyle } from 'react-native';
import {
  Gesture,
  GestureDetector,
  PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';

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

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, springCfg);
      backdropOpacity.value = withSpring(1, springCfg);
    } else {
      translateY.value = withSpring(sheetHeight + 40, springCfg);
      backdropOpacity.value = withSpring(0, springCfg);
    }
  }, [visible, sheetHeight, translateY, backdropOpacity]);

  useAnimatedReaction(
    () => translateY.value,
    (value) => {
      if (value > sheetHeight) {
        runOnJS(onClose)();
      }
    },
  );

  const closeSheet = () => {
    translateY.value = withSpring(sheetHeight + 40, springCfg);
    backdropOpacity.value = withSpring(0, springCfg);
  };

  const pan = Gesture.Pan()
    .onUpdate((e: PanGestureHandlerEventPayload) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd(() => {
      const threshold = sheetHeight * 0.18;
      if (drag.value > threshold) {
        closeSheet();
      } else {
        drag.value = withSpring(0, springCfg);
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
              {closeOnBackdrop && (
                <IconButton name="close" size={20} onPress={closeSheet} />
              )}
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