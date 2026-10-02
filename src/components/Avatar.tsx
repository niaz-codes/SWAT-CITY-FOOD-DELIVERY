import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './AppText';
import { initials } from '../utils/format';
import { spacing } from '../theme/spacing';

type Props = {
  name: string;
  gradient: [string, string];
  size?: number;
  style?: ViewStyle;
};

export function Avatar({ name, gradient, size = 46, style }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.36 }, style]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <AppText
          variant="title"
          weight="bold"
          color="#FFFFFF"
          style={[styles.text, { fontSize: size * 0.38 }]}
        >
          {initials(name)}
        </AppText>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xs },
  text: { includeFontPadding: false },
});