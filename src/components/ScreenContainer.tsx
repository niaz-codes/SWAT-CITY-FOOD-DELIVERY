import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  RefreshControlProps,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { useThemeColors } from '../theme';
import { spacing } from '../theme/spacing';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  bg?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  keyboard?: boolean;
  keyboardVerticalOffset?: number;
  safeBottom?: boolean | number;
};

export function ScreenContainer({
  children,
  scroll,
  edges = ['top'],
  bg,
  contentContainerStyle,
  style,
  refreshControl,
  keyboard,
  keyboardVerticalOffset = 0,
  safeBottom,
}: Props) {
  const { colors } = useThemeColors();
  const { width } = useWindowDimensions();
  const isTablet = width >= 640;
  const maxContent = isTablet ? { width: '100%' as const, maxWidth: 560, alignSelf: 'center' as const } : null;

  const background = bg ?? colors.background;

  const inner = (
    <>
      <View style={[styles.content, maxContent, contentContainerStyle]}>{children}</View>
      {typeof safeBottom === 'number' && <View style={{ height: safeBottom }} />}
    </>
  );

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        safeBottom === true && { paddingBottom: spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {inner}
    </ScrollView>
  ) : (
    <View style={styles.flex}>{inner}</View>
  );

  const wrapped = keyboard ? (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex} keyboardVerticalOffset={keyboardVerticalOffset}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: background }, style]}>
      {wrapped}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.m, paddingTop: spacing.s },
  scrollContent: { flexGrow: 1 },
});