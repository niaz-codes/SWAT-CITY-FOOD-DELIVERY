import React from 'react';
import { Pressable, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { sizes, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type Props = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  hideBack?: boolean;
  right?: React.ReactNode;
  left?: React.ReactNode;
  elevated?: boolean;
  transparent?: boolean;
  titleAlign?: 'left' | 'center';
  backColor?: string;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

export function AppHeader({
  title,
  subtitle,
  onBack,
  hideBack,
  right,
  left,
  elevated,
  transparent,
  titleAlign = 'left',
  backColor,
  style,
  containerStyle,
}: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleBack = () => {
    haptics.light();
    if (onBack) onBack();
    else if (navigation.canGoBack()) navigation.goBack();
  };

  const showLeft = !hideBack || left || (titleAlign === 'left' && title);

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingTop: insets.top,
          backgroundColor: transparent ? 'transparent' : elevated ? colors.surface : colors.background,
          borderBottomWidth: elevated ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: colors.border,
        },
        containerStyle,
      ]}
    >
      <View style={[styles.row, style]}>
        <View style={styles.side}>
          {!hideBack && (
            <HeaderBackButton onPress={handleBack} color={backColor ?? colors.textPrimary} />
          )}
          {left}
        </View>

        <View style={[styles.center, titleAlign === 'center' && styles.centerAlign]}>
          {title && (
            <AppText
              variant={titleAlign === 'center' ? 'h4' : 'h3'}
              weight="extraBold"
              numberOfLines={1}
              color={colors.textPrimary}
              style={styles.title}
            >
              {title}
            </AppText>
          )}
          {subtitle && (
            <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
              {subtitle}
            </AppText>
          )}
        </View>

        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
    </View>
  );
}

function HeaderBackButton({ onPress, color }: { onPress: () => void; color: string }) {
  const { colors } = useThemeColors();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.9, { damping: 16, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 300 });
        }}
        onPress={onPress}
        hitSlop={10}
        accessibilityRole="button"
        style={[
          styles.backBtn,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <Ionicons name="chevron-back" size={22} color={color} />
      </Pressable>
    </Animated.View>
  );
}

export const backButtonSize = sizes.iconButton;

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  row: {
    height: sizes.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    gap: spacing.s,
  },
  side: {
    width: sizes.iconButton,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: { flex: 1 },
  centerAlign: { alignItems: 'center' },
  title: { textAlignVertical: 'center' },
  backBtn: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});