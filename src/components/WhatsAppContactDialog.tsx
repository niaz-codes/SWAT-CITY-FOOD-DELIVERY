import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useThemeColors } from '../theme';
import { spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';
import { useToast } from '../state/ToastProvider';
import {
  WHATSAPP_CONTACTS,
  normalizePkMobile,
  waMeLink,
  type WhatsAppContact,
} from '../utils/whatsapp';

type Props = {
  visible: boolean;
  /** Any text change on reopen; '' keeps it hidden. */
  title: string;
  /** The pre-filled chat message for the outgoing link. */
  message: string;
  onClose: () => void;
};

/**
 * Chooser between the configured WhatsApp order lines (primary first).
 *
 * The chooser is the one place that actually opens the link, so every screen
 * gets the same behaviour: wa.me link with the message pre-filled, a friendly
 * toast when WhatsApp (or a browser) is not available, and nothing is ever
 * created or confirmed in the app by this chat.
 */
export function WhatsAppContactDialog({ visible, title, message, onClose }: Props) {
  const { colors } = useThemeColors();
  const { error } = useToast();
  const [busyNumber, setBusyNumber] = useState('');

  const openChat = async (contact: WhatsAppContact) => {
    const intl = normalizePkMobile(contact.local);
    if (!intl) {
      error('That contact number is not configured correctly yet.');
      return;
    }
    setBusyNumber(contact.local);
    haptics.light();
    try {
      await Linking.openURL(waMeLink(intl, message));
      onClose();
    } catch {
      error('Could not open WhatsApp. Is it installed?');
    } finally {
      setBusyNumber('');
    }
  };

  const close = () => {
    if (busyNumber) return; // never close the sheet over an in-flight openURL
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={close}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: colors.surfaceRaised, borderRadius: 24 }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <AppText variant="h4" weight="bold" color={colors.textPrimary} center>
            {title || 'Order on WhatsApp'}
          </AppText>
          <AppText variant="small" color={colors.textMuted} center style={styles.sub}>
            {'Choose which order line to chat with. Your order summary is already typed for you.'}
          </AppText>

          <View style={styles.options}>
            {WHATSAPP_CONTACTS.map((contact, index) => {
              const primary = index === 0;
              const intl = normalizePkMobile(contact.local);
              return (
                <Pressable
                  key={contact.local}
                  onPress={() => {
                    void openChat(contact);
                  }}
                  disabled={Boolean(busyNumber)}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: colors.surfaceMuted, borderColor: primary ? colors.primary : colors.border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={styles.rowText}>
                    <View style={styles.rowTitleRow}>
                      <AppText variant="title" weight="bold" color={colors.textPrimary}>
                        {contact.label}
                      </AppText>
                      {primary && (
                        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                          <AppText variant="microBold" color={colors.primaryStrong}>
                            PRIMARY
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText variant="small" weight="semiBold" color={colors.textSecondary}>
                      {intl ? `+${intl.replace(/^92/, '92 ')}` : contact.local}
                    </AppText>
                    <AppText variant="micro" color={colors.textMuted}>
                      {contact.description}
                    </AppText>
                  </View>
                  {busyNumber === contact.local ? (
                    <AppText variant="small" color={colors.textMuted}>
                      Opening…
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <AppButton label="Not now" variant="secondary" size="sm" disabled={Boolean(busyNumber)} onPress={close} fullWidth />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    padding: spacing.l,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    alignItems: 'center',
    gap: spacing.sm,
  },
  grabber: { width: 44, height: 4, borderRadius: 2, marginBottom: 2 },
  sub: { textAlign: 'center' },
  options: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: spacing.m,
    gap: spacing.sm,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
});
