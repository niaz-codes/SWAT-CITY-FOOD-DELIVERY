import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  View,
  KeyboardTypeOptions,
  StyleProp,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useThemeColors } from '../theme';
import { fonts } from '../theme/typography';
import { radius, sizes, spacing } from '../theme/spacing';

type Props = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  secure?: boolean;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoFocus?: boolean;
  editable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  hint?: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
};

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  rightIcon,
  onRightPress,
  secure = false,
  error,
  keyboardType = 'default',
  multiline = false,
  maxLength,
  autoCapitalize = 'none',
  autoFocus,
  editable = true,
  containerStyle,
  hint,
  returnKeyType,
  onSubmitEditing,
}: Props) {
  const { colors } = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);
  const focusAnim = useSharedValue(0);

  const animateFocus = (value: number) => {
    focusAnim.value = withTiming(value, { duration: 180 });
  };

  const focusStyle = useAnimatedStyle(() => ({
    borderColor: focused ? colors.primary : colors.border,
  }));

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <AppText variant="caption" weight="semiBold" color={colors.textSecondary} style={styles.label}>
          {label}
        </AppText>
      )}
      <Animated.View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderRadius: radius['lg'],
            borderColor,
            borderWidth: 1.5,
            minHeight: multiline ? 104 : sizes.input,
          },
          focusStyle,
        ]}
      >
        {icon && (
          <Ionicons name={icon} size={20} color={focused ? colors.primary : colors.textMuted} style={styles.prefix} />
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            animateFocus(1);
          }}
          onBlur={() => {
            setFocused(false);
            animateFocus(0);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoFocus={autoFocus}
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          style={[
            styles.input,
            {
              color: editable ? colors.textPrimary : colors.textMuted,
              fontFamily: fonts.medium,
              paddingTop: multiline ? spacing.m + 4 : undefined,
              minHeight: multiline ? 100 : undefined,
            },
            icon && styles.inputWithIcon,
            rightIcon && styles.inputWithRight,
          ]}
        />
        {rightIcon && (
          <Pressable hitSlop={12} onPress={onRightPress} style={styles.suffix} accessibilityRole="button">
            <Ionicons name={rightIcon} size={20} color={colors.primary} />
          </Pressable>
        )}
        {secure && (
          <Pressable hitSlop={12} onPress={() => setHidden((h) => !h)} style={styles.suffix} accessibilityRole="button">
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </Animated.View>
      {error ? (
        <AppText variant="small" color={colors.danger} style={styles.helper}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color={colors.textMuted} style={styles.helper}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { marginBottom: spacing.s, marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefix: { marginLeft: spacing.m, marginRight: spacing.xs },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: spacing.m,
    paddingVertical: 0,
  },
  inputWithIcon: { paddingLeft: spacing.s },
  inputWithRight: { paddingRight: spacing.xs },
  suffix: { marginRight: spacing.s, padding: spacing.xs },
  helper: { marginTop: spacing.xs, marginLeft: 2 },
});