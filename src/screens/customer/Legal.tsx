import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { useThemeColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';
import { haptics } from '../../hooks/useHaptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

type DocKey = 'privacy' | 'terms';

type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'note'; text: string };

/**
 * Legal copy lives in the app rather than behind a WebView so the documents are
 * readable offline and never flash a blank page on a slow connection. Both docs
 * share one renderer; only the active doc is mounted so the scroll offset can be
 * reset per document when the customer switches tabs.
 */
const DOCS: Record<DocKey, { title: string; updated: string; summary: string; blocks: Block[] }> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated 7 October 2026',
    summary:
      'This policy explains what information Swat City Food Delivery collects, why it is collected, and how you can control it.',
    blocks: [
      { kind: 'h', text: '1. Information we collect' },
      {
        kind: 'p',
        text: 'To run the app we collect the details you give us and the details the app needs to work:',
      },
      {
        kind: 'li',
        text: 'Account details: name, email address, mobile number and password (stored encrypted).',
      },
      { kind: 'li', text: 'Delivery details: saved addresses, delivery notes and order history.' },
      {
        kind: 'li',
        text: 'Order and ride details: what you ordered or booked, when, and where it was delivered.',
      },
      {
        kind: 'li',
        text: 'Payment references: wallet name and mobile number used for Easypaisa or JazzCash. We never see or store your wallet PIN, password or full card number.',
      },
      {
        kind: 'li',
        text: 'Location: your current location while you use the food and ride features, so we can find kitchens near you and assign a nearby rider.',
      },
      {
        kind: 'li',
        text: 'Device and usage details: device type, app version, crash logs and push notification token, used to keep the app stable and send you order updates.',
      },
      {
        kind: 'li',
        text: 'Communications: messages you send to support, ratings and reviews you leave.',
      },

      { kind: 'h', text: '2. How we use your information' },
      { kind: 'li', text: 'To create and secure your account, and to sign you in.' },
      { kind: 'li', text: 'To process orders and rides, take payment, and give refunds.' },
      {
        kind: 'li',
        text: 'To show your order in real time and share the rider\u2019s location with you during a delivery or ride.',
      },
      {
        kind: 'li',
        text: 'To send order, ride and promotional notifications. You can turn these off at any time from your device settings.',
      },
      { kind: 'li', text: 'To provide customer support and resolve disputes.' },
      {
        kind: 'li',
        text: 'To detect fraud, abuse and security incidents, and to comply with legal obligations.',
      },
      {
        kind: 'p',
        text: 'We do not sell your personal information to anyone.',
      },

      { kind: 'h', text: '3. Location data' },
      {
        kind: 'p',
        text: 'When you use food ordering or ride booking, we ask for your device location so the app can suggest nearby kitchens, calculate delivery distance and match you with the closest rider. Location is only requested while the relevant feature is in use, and riders share their live location with you and with our dispatch team only while a delivery or ride is active.',
      },

      { kind: 'h', text: '4. Payments' },
      {
        kind: 'p',
        text: 'Payments are handled by trusted payment partners (Easypaisa and JazzCash). We receive only the confirmation that a payment succeeded or failed, plus the mobile number it was taken from. Your wallet credentials stay with your payment provider and are never sent to Swat City Food Delivery.',
      },

      { kind: 'h', text: '5. Who we share information with' },
      {
        kind: 'li',
        text: 'The restaurant or kitchen fulfilling your order, so it can prepare and deliver it.',
      },
      {
        kind: 'li',
        text: 'The rider handling your delivery or ride, who sees only what is needed for that trip.',
      },
      { kind: 'li', text: 'Our payment partners, for payment processing and refunds.' },
      {
        kind: 'li',
        text: 'Service providers who help us run the app (hosting, analytics, push notifications), under confidentiality agreements.',
      },
      { kind: 'li', text: 'Law enforcement or regulators, when we are legally required to do so.' },

      { kind: 'h', text: '6. Data retention' },
      {
        kind: 'p',
        text: 'We keep your account details for as long as your account is open. Order and payment records are kept for the period required by Pakistani tax and accounting rules. You can ask us to delete your account and personal data at any time, except where we must keep a record by law.',
      },

      { kind: 'h', text: '7. Security' },
      {
        kind: 'p',
        text: 'Passwords are stored hashed, traffic is encrypted in transit, and access to customer data inside Swat City Food Delivery is limited to the staff and systems that need it to do their job. If we ever learn of a breach that affects your data, we will tell you and the relevant authorities promptly.',
      },

      { kind: 'h', text: '8. Your choices and rights' },
      { kind: 'li', text: 'Review and correct your profile details from the Profile screen.' },
      { kind: 'li', text: 'Turn off notifications from your device settings.' },
      {
        kind: 'li',
        text: 'Turn off location permission from your device settings (ordering and rides will not work without it).',
      },
      {
        kind: 'li',
        text: 'Ask us for a copy of your data, or ask us to delete your account, by contacting support.',
      },

      { kind: 'h', text: '9. Children' },
      {
        kind: 'p',
        text: 'Swat City Food Delivery is not directed at children under 18, and we do not knowingly collect information from them.',
      },

      { kind: 'h', text: '10. Changes to this policy' },
      {
        kind: 'p',
        text: 'We may update this policy as the app grows. When we make material changes we will notify you in the app. The date at the top always shows when this policy was last updated.',
      },

      { kind: 'h', text: '11. Contact us' },
      {
        kind: 'p',
        text: 'Questions about your privacy can be sent to our support team: support@swatcity.pk, or call 0345 678 9012 between 9am and 11pm, seven days a week.',
      },
      {
        kind: 'note',
        text: 'Swat City Food Delivery operates in Mingora, Swat, Khyber Pakhtunkhwa, Pakistan.',
      },
    ],
  },

  terms: {
    title: 'Terms of Service',
    updated: 'Last updated 7 October 2026',
    summary:
      'These terms govern your use of the Swat City Food Delivery app for ordering food and booking rides. By creating an account you accept them.',
    blocks: [
      { kind: 'h', text: '1. Your account' },
      { kind: 'li', text: 'You must be at least 18 years old to use Swat City Food Delivery.' },
      {
        kind: 'li',
        text: 'You are responsible for keeping your password and email secure, and for everything that happens under your account.',
      },
      {
        kind: 'li',
        text: 'The information you give us (name, email, mobile number) must be accurate and kept up to date.',
      },
      {
        kind: 'li',
        text: 'One person may not hold multiple accounts used to abuse promotions or circumvent suspensions.',
      },

      { kind: 'h', text: '2. Food orders' },
      {
        kind: 'li',
        text: 'An order is an offer to the kitchen. It is confirmed once the kitchen accepts and payment is verified.',
      },
      {
        kind: 'li',
        text: 'Prices, delivery fees and offers shown in the app may change. The total you confirm at checkout is the total you are charged.',
      },
      {
        kind: 'li',
        text: 'Kitchens set their own preparation times; the estimated delivery time is indicative and may vary with traffic, weather and demand.',
      },
      { kind: 'li', text: 'If an item is unavailable we will notify you and refund that item.' },

      { kind: 'h', text: '3. Payments, cancellations and refunds' },
      {
        kind: 'li',
        text: 'Orders are paid through Easypaisa or JazzCash at checkout. Cash on delivery is not available for prepaid orders.',
      },
      {
        kind: 'li',
        text: 'You can cancel an order free of charge while it is still being prepared. Once the rider has picked it up, the order can no longer be cancelled.',
      },
      {
        kind: 'li',
        text: 'Refunds go to Swat Wallet instantly, or to the original payment method within 3-5 working days.',
      },
      {
        kind: 'li',
        text: 'Promo codes are single-use per customer unless stated otherwise, cannot be exchanged for cash, and may be withdrawn at any time.',
      },

      { kind: 'h', text: '4. Rides' },
      {
        kind: 'li',
        text: 'Fares shown before you confirm are based on the distance and ride type selected. Changes to the route may change the final fare.',
      },
      {
        kind: 'li',
        text: 'A rider may cancel if you are not at the pickup point or if the trip is unsafe. You can cancel before a rider is assigned without charge.',
      },
      {
        kind: 'li',
        text: 'Share only accurate pickup and drop-off details. We may charge a small fee for repeated no-show cancellations.',
      },

      { kind: 'h', text: '5. Acceptable use' },
      {
        kind: 'p',
        text: 'You agree not to:',
      },
      { kind: 'li', text: 'Use the app for any unlawful, fraudulent or abusive purpose.' },
      {
        kind: 'li',
        text: 'Interfere with the app, its security, or other customers\u2019 accounts.',
      },
      {
        kind: 'li',
        text: 'Post reviews that contain spam, hate speech, or content you do not have the right to share.',
      },
      {
        kind: 'li',
        text: 'Resell orders, scrape app content, or reverse engineer any part of the service.',
      },

      { kind: 'h', text: '6. Partner (rider) terms' },
      {
        kind: 'p',
        text: 'Riders joining Swat City Food Delivery must provide accurate identity and vehicle documents, keep them valid, and follow traffic laws at all times. Verification usually takes 24-48 hours. We may suspend or end a partnership for late deliveries, unsafe conduct, document fraud or customer abuse. Earnings and payouts are governed by the partner schedule shown in the rider app.',
      },

      { kind: 'h', text: '7. Content and intellectual property' },
      {
        kind: 'p',
        text: 'The Swat City Food Delivery name, logo, app design and content belong to Swat City Food Delivery or its licensors. You keep ownership of reviews and photos you upload, but you give us a licence to display them inside the app.',
      },

      { kind: 'h', text: '8. Liability' },
      {
        kind: 'p',
        text: 'The app is provided "as is". To the maximum extent allowed by law, Swat City Food Delivery is not liable for indirect or consequential losses, or for delays caused by circumstances outside our control (weather, road closures, strikes, restaurant closures). Nothing in these terms limits liability that cannot be limited by law.',
      },

      { kind: 'h', text: '9. Ending your account' },
      {
        kind: 'p',
        text: 'You may close your account at any time from Profile. We may suspend or close accounts that break these terms, create risk for others, or are required to be closed by law. You will be told when this happens, except where the law prevents it.',
      },

      { kind: 'h', text: '10. Governing law' },
      {
        kind: 'p',
        text: 'These terms are governed by the laws of Pakistan, and disputes are subject to the courts of Swat, Khyber Pakhtunkhwa.',
      },

      { kind: 'h', text: '11. Contact us' },
      {
        kind: 'p',
        text: 'For questions about these terms: support@swatcity.pk or 0345 678 9012, 9am-11pm daily.',
      },
    ],
  },
};

export function LegalScreen({ route, navigation }: Props) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<DocKey>(route.params?.doc ?? 'privacy');
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Start at the top whenever the customer flips between documents.
  const selectDoc = useCallback(
    (next: DocKey) => {
      if (next === doc) return;
      haptics.light();
      setDoc(next);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    },
    [doc],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: DOCS[doc].title });
  }, [navigation, doc]);

  const active = DOCS[doc];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader title={active.title} onBack={() => navigation.goBack()} elevated />

      <View
        style={[styles.tabs, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        {(['privacy', 'terms'] as DocKey[]).map((key) => {
          const selected = doc === key;
          return (
            <Pressable
              key={key}
              onPress={() => selectDoc(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[
                styles.tab,
                selected && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Ionicons
                name={key === 'privacy' ? 'lock-closed-outline' : 'document-text-outline'}
                size={15}
                color={selected ? colors.onPrimary : colors.textMuted}
              />
              <AppText
                variant="smallMedium"
                weight={selected ? 'bold' : undefined}
                color={selected ? colors.onPrimary : colors.textSecondary}
              >
                {DOCS[key].title}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.primarySoft }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Ionicons
              name={doc === 'privacy' ? 'shield-checkmark-outline' : 'ribbon-outline'}
              size={24}
              color="#FFFFFF"
            />
          </View>
          <AppText variant="h4" weight="extraBold" color={colors.textPrimary} center>
            {active.title}
          </AppText>
          <AppText variant="small" color={colors.textMuted} center>
            {active.updated}
          </AppText>
          <AppText variant="small" color={colors.textSecondary} center style={styles.summary}>
            {active.summary}
          </AppText>
        </View>

        <View
          style={[
            styles.doc,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          {active.blocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </View>

        <AppText variant="micro" color={colors.textMuted} center style={styles.footNote}>
          By continuing to use Swat City Food Delivery you confirm that you have read and accepted this document.
        </AppText>
      </ScrollView>
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  const { colors } = useThemeColors();

  if (block.kind === 'h') {
    return (
      <AppText variant="title" weight="extraBold" color={colors.textPrimary} style={styles.h}>
        {block.text}
      </AppText>
    );
  }

  if (block.kind === 'li') {
    return (
      <View style={styles.liRow}>
        <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
        <AppText variant="small" color={colors.textSecondary} style={styles.liText}>
          {block.text}
        </AppText>
      </View>
    );
  }

  if (block.kind === 'note') {
    return (
      <View style={[styles.note, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
        <AppText variant="small" color={colors.textSecondary} style={styles.noteText}>
          {block.text}
        </AppText>
      </View>
    );
  }

  return (
    <AppText variant="small" color={colors.textSecondary} style={styles.p}>
      {block.text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.s,
    margin: spacing.m,
    marginBottom: 0,
    padding: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  body: { padding: spacing.m, gap: spacing.sm },
  hero: { borderRadius: 22, padding: spacing.l, gap: spacing.xs },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  summary: { marginTop: spacing.xs },
  doc: { borderRadius: 20, borderWidth: 1, padding: spacing.m, gap: spacing.sm },
  h: { marginTop: spacing.sm },
  p: {},
  liRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  liText: { flex: 1 },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  noteText: { flex: 1 },
  footNote: { marginTop: spacing.s, paddingHorizontal: spacing.m },
});
