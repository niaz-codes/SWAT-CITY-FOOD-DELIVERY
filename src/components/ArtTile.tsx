import React, { useState } from 'react';
import { Image, ImageErrorEvent, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './AppText';
import { spacing } from '../theme/spacing';

type Props = {
  gradient: [string, string];
  emoji?: string;
  label?: string;
  size?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
  emojiSize?: number;
  subtle?: boolean;
  /**
   * Real photo (Supabase Storage). When present it is drawn over the gradient;
   * if the image fails to load we fall back to the original emoji tile, so a
   * dead URL can never leave a broken tile in the UI.
   */
  imageUrl?: string | null;
};

export function ArtTile({
  gradient,
  emoji,
  label,
  size = 84,
  rounded,
  style,
  emojiSize,
  subtle,
  imageUrl,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  const tile = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <View
        style={[
          styles.glow,
          { width: size * 0.9, height: size * 0.9, borderRadius: size * 0.45 },
        ]}
      />
      <AppText
        style={{
          fontSize: emojiSize ?? size * 0.44,
          textShadowColor: 'rgba(0,0,0,0.28)',
          textShadowOffset: { width: 0, height: 3 },
          textShadowRadius: 6,
        }}
      >
        {emoji}
      </AppText>
      {label && !subtle && (
        <AppText variant="microBold" color="#FFFFFF" style={styles.label} numberOfLines={1}>
          {label}
        </AppText>
      )}
    </LinearGradient>
  );

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: rounded ?? size * 0.32,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {tile}
      {showImage && (
        <Image
          source={typeof imageUrl === 'string' ? { uri: imageUrl } : undefined}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={(e: ImageErrorEvent) => setImageFailed(true)}
          style={styles.fill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  fill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.16)', top: -8, right: -14 },
  label: { marginTop: spacing.xs, paddingHorizontal: spacing.xs },
});
