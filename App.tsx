import React from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ThemeProvider, useAppTheme, ColorScheme } from './src/theme';
import { AuthProvider } from './src/state/AuthContext';
import { CartProvider } from './src/state/CartContext';
import { ToastProvider } from './src/state/ToastProvider';
import { RootNavigator, navigationRef } from './src/navigation/RootNavigator';

function makeNavTheme(dark: boolean, colors: ColorScheme) {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surfaceRaised,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

function AppNavigator() {
  const { dark, colors } = useAppTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* ref is required: password-reset deep links and push taps navigate
          from outside React (see RootNavigator.usePushAndDeepLinks). */}
      <NavigationContainer ref={navigationRef} theme={makeNavTheme(dark, colors)}>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <ToastProvider>
                <AppNavigator />
              </ToastProvider>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});