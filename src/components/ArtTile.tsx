import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
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
}: Props) {
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
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.16)', top: -8, right: -14 },
  label: { marginTop: spacing.xs, paddingHorizontal: spacing.xs },
});
