import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { haptics } from '../hooks/useHaptics';

// Single source for the WhatsApp brand icon: every button in the app reuses
// this one asset — there must never be a second copy of the image.
const WHATSAPP_ICON = require('../../assets/whatsapp.png');

/** WhatsApp brand green — used as-is on both app themes for recognisability. */
const WHATSAPP_GREEN = '#25D366';

type Props = {
  label: string;
  /** Smaller supporting line under the label (e.g. which order line answers). */
  sublabel?: string;
  onPress: () => void;
  /** Compact variant for tight footers (single-dish screen). */
  compact?: boolean;
  /** Solid = filled green, ghost = white/green outline. */
  variant?: 'solid' | 'ghost';
  disabled?: boolean;
};

/**
 * The reusable WhatsApp CTA. Pressing it opens (via the contact chooser) a
 * wa.me chat pre-filled with whichever summary the calling screen provides —
 * the button itself never places or pays for an app order.
 */
export function WhatsAppButton({
  label,
  sublabel,
  onPress,
  compact = false,
  variant = 'solid',
  disabled = false,
}: Props) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.hit,
        compact ? styles.compact : styles.full,
        variant === 'solid' ? styles.solid : styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Image source={WHATSAPP_ICON} style={compact ? styles.iconCompact : styles.icon} resizeMode="contain" />
      <View style={styles.textLabel}>
        {!compact ? (
          <AppText
            variant="title"
            weight="bold"
            color={variant === 'solid' ? '#FFFFFF' : WHATSAPP_GREEN}
            numberOfLines={1}
            style={styles.text}
          >
            {label}
          </AppText>
        ) : null}
        {sublabel && !compact ? (
          <AppText variant="micro" style={styles.text} numberOfLines={1}>
            {sublabel}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  full: { minHeight: 52, borderRadius: 18, paddingHorizontal: 18 },
  compact: { width: 54, height: 54, borderRadius: 18 },
  solid: { backgroundColor: WHATSAPP_GREEN, shadowColor: WHATSAPP_GREEN, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: WHATSAPP_GREEN,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
  icon: { width: 24, height: 24 },
  iconCompact: { width: 30, height: 30 },
  textLabel: { flexShrink: 1, alignItems: 'center', gap: 1 },
  text: { textAlign: 'center' },
});
