import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useThemeColors } from '../theme';
import { radius, spacing } from '../theme/spacing';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function EmptyState({ icon, title, message, actionLabel, onAction, style, compact }: Props) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={compact ? 30 : 38} color={colors.primary} />
      </View>
      <AppText variant={compact ? 'title' : 'h4'} weight="bold" color={colors.textPrimary} center>
        {title}
      </AppText>
      {message && (
        <AppText variant="body" color={colors.textMuted} center style={styles.message}>
          {message}
        </AppText>
      )}
      {actionLabel && onAction && (
        <AppButton label={actionLabel} onPress={onAction} size="sm" style={styles.action} />
      )}
    </View>
  );
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  compact,
  style,
}: {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={compact ? 30 : 38} color={colors.danger} />
      </View>
      <AppText variant={compact ? 'title' : 'h4'} weight="bold" color={colors.textPrimary} center>
        Unable to connect
      </AppText>
      <AppText variant="body" color={colors.textMuted} center style={styles.message}>
        {message}
      </AppText>
      {onRetry && <AppButton label="Try again" onPress={onRetry} size="sm" variant="secondary" style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  compact: { paddingVertical: spacing.xl },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  message: { maxWidth: 300 },
  action: { marginTop: spacing.sm },
});