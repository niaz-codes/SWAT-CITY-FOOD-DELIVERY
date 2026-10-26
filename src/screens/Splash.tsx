import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { userHome } from '../navigation/roleHome';

import { BrandLogo } from '../components/BrandLogo';
import { AppText } from '../components/AppText';
import { useAuth } from '../state/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, hydrated } = useAuth();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      if (!user) {
        navigation.replace('Login');
      } else {
        navigation.replace(userHome(user.role));
      }
    }, 2300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user]);

  const logoScale = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.6 + progress.value * 0.4 },
      { rotate: `${(1 - progress.value) * -8}deg` },
    ],
    opacity: progress.value,
  }));

  const textAnim = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 18 - progress.value * 18 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.85,
    transform: [{ scale: 0.7 + progress.value * 1.5 }],
  }));

  return (
    <LinearGradient colors={['#0B554E', '#0E3F3A', '#07100F']} style={styles.fill}>
      <View style={[styles.ring, { borderColor: 'rgba(255,255,255,0.25)' }]}>
        <Animated.View style={ringStyle}>
          <View style={[styles.ringInner, { borderColor: 'rgba(255,255,255,0.18)' }]} />
        </Animated.View>
      </View>

      <Animated.View style={[styles.logoWrap, logoScale]}>
        <BrandLogo size={110} />
      </Animated.View>

      <Animated.View style={[styles.textWrap, textAnim, { bottom: insets.bottom + 56 }]}>
        <Animated.View entering={FadeInUp.delay(900).duration(500)}>
          <AppText variant="h2" weight="extraBold" color="#FFFFFF" center>
            Swat City Food Delivery
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(1100).duration(500)}>
          <AppText variant="bodyMedium" color="rgba(255,255,255,0.75)" center>
            Food • Rides • Delivered with care
          </AppText>
        </Animated.View>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1,
  },
  logoWrap: { alignItems: 'center' },
  textWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 6,
  },
});
