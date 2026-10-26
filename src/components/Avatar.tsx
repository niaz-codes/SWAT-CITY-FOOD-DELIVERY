import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './AppText';
import { initials } from '../utils/format';
import { spacing } from '../theme/spacing';

type Props = {
  name: string;
  gradient: [string, string];
  size?: number;
  style?: ViewStyle;
  /**
   * Remote photo (Cloudinary) to show instead of the initials fallback.
   * Rider profile photos are admin-approved, so callers pass the stored URL.
   */
  uri?: string | null;
};

export function Avatar({ name, gradient, size = 46, style, uri }: Props) {
  const radius = size * 0.36;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          // Avatars are decorative next to the user's name in every usage.
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          <AppText
            variant="title"
            weight="bold"
            color="#FFFFFF"
            style={[styles.text, { fontSize: size * 0.38 }]}
          >
            {initials(name)}
          </AppText>
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xs },
  text: { includeFontPadding: false },
});
