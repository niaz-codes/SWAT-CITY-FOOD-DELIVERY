import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Brand artwork from `assets/` (generated from the supplied `Images/logo.png`
 * by `scripts/build-assets.ps1` - the background is keyed to alpha so the mark
 * sits correctly on both light and dark brand surfaces).
 */
const LOGO = require('../../assets/logo-ui.png');

/** Source artwork is 593x503; height is derived from that aspect. */
const LOGO_ASPECT = 503 / 593;

type BrandLogoProps = {
  /** Width of the logo artwork in points. Height follows the source aspect. */
  size?: number;
  /**
   * Draw a light plate behind the mark. The supplied artwork is dark
   * (near-black) so it disappears against the deep-teal gradients used by the
   * splash and login screens; on light surfaces turn this off.
   */
  surface?: boolean;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function BrandLogo({
  size = 96,
  surface = true,
  style,
  containerStyle,
  accessibilityLabel = 'Swat City Food Delivery',
}: BrandLogoProps) {
  const height = Math.round(size * LOGO_ASPECT);
  const plate = Math.round(size * 1.42);

  const mark = (
    <Image
      source={LOGO}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      resizeMode="contain"
      style={[{ width: size, height }, style]}
    />
  );

  if (!surface) return mark;

  return (
    <View
      style={[
        styles.plate,
        { width: plate, height: plate, borderRadius: Math.round(plate / 2.6) },
        containerStyle,
      ]}
    >
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#04120F',
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
});

export default BrandLogo;