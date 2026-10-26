import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemeColors } from '../theme';

export function Divider({ color, spacing = 12 }: { color?: string; spacing?: number }) {
  const { colors } = useThemeColors();
  return (
    <View
      style={[
        styles.divider,
        { backgroundColor: color ?? colors.divider, marginVertical: spacing },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, width: '100%' },
});
