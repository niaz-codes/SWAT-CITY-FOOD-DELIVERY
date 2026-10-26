import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { Divider } from '../../components/Divider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useToast } from '../../state/ToastProvider';
import { haptics } from '../../hooks/useHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Support'>;

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I track my order?',
    a: 'Open Activity, tap your order, and you will see live tracking with the rider\u2019s location and estimated arrival.',
  },
  {
    q: 'Which payment methods can I use?',
    a: 'Orders are paid online with Easypaisa or JazzCash mobile wallets. We confirm the payment with the wallet before your order goes to the restaurant, so if the app does not show a success message the amount has not been charged.',
  },
  {
    q: 'How do I book a ride?',
    a: 'Open the Ride tab, set pickup and drop-off, choose a ride type, and confirm. A rider nearby will be assigned automatically.',
  },
  {
    q: 'What is the refund policy?',
    a: 'If your order or ride is cancelled, the full amount is refunded to Swat Wallet instantly or to your original payment method within 3-5 days.',
  },
  {
    q: 'How do I become a delivery partner?',
    a: 'Open Profile > Deliver with Swat City Food Delivery and complete the registration and verification steps.',
  },
];

const CHANNELS: { icon: keyof typeof Ionicons.glyphMap; label: string; detail: string }[] = [
  { icon: 'call-outline', label: 'Call support', detail: '0345 678 9012 · 9am \u2013 11pm' },
  { icon: 'chatbubble-ellipses-outline', label: 'Live chat', detail: 'Average reply in 2 minutes' },
  { icon: 'mail-outline', label: 'Email us', detail: 'support@swatcity.pk' },
];

export function SupportScreen({ navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { success } = useToast();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title="Help & support" onBack={() => navigation.goBack()} elevated />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.primarySoft }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="headset-outline" size={26} color="#FFFFFF" />
          </View>
          <AppText variant="h4" weight="extraBold" color={colors.textPrimary}>
            How can we help?
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.heroText}>
            Browse common questions or reach our support team directly.
          </AppText>
        </View>

        {CHANNELS.map((ch, i) => (
          <Pressable
            key={ch.label}
            onPress={() => {
              haptics.medium();
              success(ch.label);
            }}
            style={[
              styles.channel,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <View style={[styles.channelIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name={ch.icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.channelInfo}>
              <AppText variant="title" weight="bold" color={colors.textPrimary}>
                {ch.label}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {ch.detail}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}

        <AppText
          variant="captionBold"
          color={colors.textMuted}
          uppercase
          style={styles.sectionTitle}
        >
          Frequently asked questions
        </AppText>

        <View
          style={[
            styles.group,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          {FAQS.map((faq, i) => (
            <React.Fragment key={faq.q}>
              <Pressable onPress={() => setOpen(open === i ? null : i)} style={styles.faqRow}>
                <AppText
                  variant="title"
                  weight="semiBold"
                  color={colors.textPrimary}
                  style={styles.faqQ}
                >
                  {faq.q}
                </AppText>
                <Ionicons
                  name={open === i ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
              {open === i && (
                <View style={styles.faqAnswer}>
                  <AppText variant="small" color={colors.textSecondary}>
                    {faq.a}
                  </AppText>
                </View>
              )}
              {i < FAQS.length - 1 && <Divider spacing={0} />}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.legalRow}>
          <Pressable
            onPress={() => {
              haptics.light();
              navigation.navigate('Legal', { doc: 'privacy' });
            }}
            hitSlop={6}
          >
            <AppText variant="smallMedium" weight="semiBold" color={colors.primary}>
              Privacy Policy
            </AppText>
          </Pressable>
          <AppText variant="small" color={colors.textMuted}>
            ·
          </AppText>
          <Pressable
            onPress={() => {
              haptics.light();
              navigation.navigate('Legal', { doc: 'terms' });
            }}
            hitSlop={6}
          >
            <AppText variant="smallMedium" weight="semiBold" color={colors.primary}>
              Terms of Service
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.m, gap: spacing.sm },
  hero: { borderRadius: 22, padding: spacing.l, gap: spacing.xs, alignItems: 'center' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroText: { textAlign: 'center' },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.m,
  },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelInfo: { flex: 1 },
  sectionTitle: { marginTop: spacing.sm, marginBottom: spacing.xs },
  group: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, padding: spacing.m },
  faqQ: { flex: 1 },
  faqAnswer: { paddingHorizontal: spacing.m, paddingBottom: spacing.m },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.m,
    paddingVertical: spacing.sm,
  },
});
