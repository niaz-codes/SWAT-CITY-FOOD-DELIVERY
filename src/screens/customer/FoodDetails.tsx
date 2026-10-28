import React, { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { AppText } from '../../components/AppText';
import { AppHeader } from '../../components/AppHeader';
import { RatingStars } from '../../components/RatingStars';
import { Chip } from '../../components/Chip';
import { QuantityStepper } from '../../components/QuantityStepper';
import { Divider } from '../../components/Divider';
import { SectionHeader } from '../../components/SectionHeader';
import { FoodCard } from '../../components/FoodCard';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { WhatsAppContactDialog } from '../../components/WhatsAppContactDialog';
import { buildSingleItemMessage } from '../../utils/whatsapp';
import { useCart } from '../../state/CartContext';
import { useToast } from '../../state/ToastProvider';
import { useThemeColors } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatCurrency } from '../../utils/format';
import { haptics } from '../../hooks/useHaptics';
import { foodApi } from '../../services/api';
import { useAsyncData } from '../../hooks/useAsyncData';

type Props = NativeStackScreenProps<RootStackParamList, 'FoodDetails'>;

export function FoodDetailsScreen({ navigation, route }: Props) {
  const { item, restaurantName } = route.params;
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { add, count, restaurantId } = useCart();
  const { success } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [whatsOpen, setWhatsOpen] = useState(false);
  const { data: popular } = useAsyncData(() => foodApi.getPopular(), []);

  const sameRestaurant = restaurantId === null || restaurantId === item.restaurantId;

  const handleAdd = () => {
    haptics.success();
    add(item, quantity);
    success(`${quantity} × ${item.name} added to cart`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={[]}
        keyExtractor={() => 'fd'}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            <Animated.View entering={FadeInDown.duration(300)}>
              <LinearGradient
                colors={item.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1.2 }}
                style={styles.hero}
              >
                <View style={styles.heroRing} />
                <View style={[styles.disc, item.imageUrl ? styles.discOverflow : null]}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      resizeMode="cover"
                      style={styles.discImage}
                    />
                  ) : (
                    <AppText style={styles.discEmoji}>{item.emoji}</AppText>
                  )}
                </View>
                {item.popular && (
                  <View style={styles.popularBadge}>
                    <Ionicons name="flame" size={13} color="#FFFFFF" />
                    <AppText variant="microBold" color="#FFFFFF">
                      BESTSELLER
                    </AppText>
                  </View>
                )}
              </LinearGradient>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(80).duration(320)}
              style={[
                styles.body,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <AppText variant="h3" weight="extraBold" color={colors.textPrimary}>
                {item.name}
              </AppText>
              <View style={styles.metaRow}>
                <AppText variant="title" weight="extraBold" color={colors.primary}>
                  {formatCurrency(item.price)}
                </AppText>
                <Chip label={`${item.calories} kcal`} icon="flame-outline" />
                <Chip label={`${item.prepMin} min`} icon="time-outline" />
              </View>
              <RatingStars rating={item.rating} size={15} reviews={0} />
              <AppText variant="body" color={colors.textSecondary} style={styles.desc}>
                {item.description}
              </AppText>
              <View style={styles.kitchen}>
                <Ionicons name="restaurant-outline" size={15} color={colors.textMuted} />
                <AppText variant="smallMedium" weight="semiBold" color={colors.textSecondary}>
                  From {restaurantName}
                </AppText>
              </View>
            </Animated.View>

            {!sameRestaurant && count > 0 && (
              <View style={[styles.switchNote, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="swap-horizontal" size={15} color={colors.warning} />
                <AppText variant="small" color={colors.warning} style={styles.switchText}>
                  Adding this clears your item from another restaurant.
                </AppText>
              </View>
            )}

            <SectionHeader title="You may also like" />
            {(popular?.slice(0, 6) ?? [])
              .filter((s) => s.id !== item.id)
              .map((s) => (
                <FoodCard
                  key={s.id}
                  item={s}
                  variant="row"
                  onPress={() => navigation.replace('FoodDetails', { item: s, restaurantName })}
                />
              ))}
            <Divider spacing={spacing.l} />
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <Animated.View
        entering={FadeInUp.duration(280)}
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.m), backgroundColor: colors.surface },
        ]}
      >
        <View style={[styles.footerInner, { backgroundColor: colors.surface }]}>
          <QuantityStepper quantity={quantity} onChange={setQuantity} min={1} />
          <WhatsAppButton
            compact
            label="Order on WhatsApp"
            onPress={() => setWhatsOpen(true)}
          />
          <Pressable
            onPress={handleAdd}
            disabled={!sameRestaurant && count > 0}
            style={[
              styles.addBtn,
              { backgroundColor: colors.primary },
              !sameRestaurant && count > 0 && { opacity: 0.7 },
            ]}
          >
            <View style={styles.addCartRow}>
              <Ionicons name="cart" size={20} color={colors.onPrimary} />
              {!sameRestaurant && count > 0 ? (
                <AppText
                  variant="title"
                  weight="bold"
                  color={colors.onPrimary}
                  style={styles.addText}
                >
                  Clear cart first
                </AppText>
              ) : (
                <AppText
                  variant="title"
                  weight="bold"
                  color={colors.onPrimary}
                  style={styles.addText}
                >
                  Add {quantity > 1 ? `${quantity} · ` : ''}
                  {formatCurrency(item.price * quantity)}
                </AppText>
              )}
            </View>
          </Pressable>
        </View>
      </Animated.View>

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <AppHeader
          transparent
          onBack={() => navigation.goBack()}
          backColor={colors.onPrimary}
          containerStyle={{ backgroundColor: 'transparent' }}
        />
      </View>

      {/* Chat-to-order channel: pre-filled message, never an app order. */}
      <WhatsAppContactDialog
        visible={whatsOpen}
        title="Order this on WhatsApp"
        message={buildSingleItemMessage({
          restaurantName,
          itemName: item.name,
          quantity,
          itemPrice: item.price,
        })}
        onClose={() => setWhatsOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: spacing.m, paddingBottom: 140 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  hero: {
    marginTop: spacing.m,
    height: 220,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroRing: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -120,
    right: -100,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  disc: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discEmoji: {
    fontSize: 52,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  /**
   * A real photo slightly overflows the disc so the dish reads as the hero
   * object rather than a tiny stamp inside the ring.
   */
  discOverflow: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'transparent',
  },
  discImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  popularBadge: {
    position: 'absolute',
    top: spacing.m,
    left: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: spacing.sm,
    height: 28,
    borderRadius: 14,
  },
  body: {
    marginTop: spacing.m,
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.s },
  desc: { lineHeight: 21, marginTop: spacing.xs },
  kitchen: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  switchNote: {
    marginTop: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 14,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.sm,
  },
  switchText: { flex: 1 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm + 4,
    paddingHorizontal: spacing.m,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  footerInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addBtn: { flex: 1, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addCartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  addText: { flex: 1 },
});
