import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useThemeColors();
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 18, stiffness: 260 });
      opacity.value = withSpring(1, { damping: 18, stiffness: 260 });
    } else {
      scale.value = withSpring(0.92, { damping: 18, stiffness: 260 });
      opacity.value = withSpring(0, { damping: 18, stiffness: 260 });
    }
  }, [visible, scale, opacity]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View style={[styles.backdrop, { backgroundColor: colors.overlay }, anim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View
          entering={FadeIn.duration(180)}
          style={[
            styles.dialog,
            { backgroundColor: colors.surfaceRaised, borderRadius: radius.xxl },
          ]}
        >
          <View style={[styles.iconLine, { backgroundColor: colors.borderStrong }]} />
          <AppText variant="h4" weight="bold" color={colors.textPrimary} center>
            {title}
          </AppText>
          <AppText variant="body" color={colors.textMuted} center style={styles.message}>
            {message}
          </AppText>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={loading} style={styles.cancel}>
              <AppText variant="smallMedium" weight="semiBold" color={colors.textSecondary}>
                {cancelLabel}
              </AppText>
            </Pressable>
            <View style={styles.confirm}>
              <AppButton
                label={confirmLabel}
                onPress={onConfirm}
                variant={tone === 'danger' ? 'danger' : 'primary'}
                size="sm"
                loading={loading}
                fullWidth={false}
              />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconLine: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  message: { lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.m,
  },
  cancel: { paddingHorizontal: spacing.l, height: 48, justifyContent: 'center' },
  confirm: { flex: 1 },
});