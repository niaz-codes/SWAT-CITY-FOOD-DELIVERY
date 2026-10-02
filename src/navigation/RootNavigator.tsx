import React, { useCallback, useEffect, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createNavigationContainerRef } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { AppState, type AppStateStatus } from 'react-native';
import { RootStackParamList } from './types';

import { SplashScreen } from '../screens/Splash';
import { LoginScreen } from '../screens/auth/Login';
import { RegisterScreen } from '../screens/auth/Register';
import { OtpScreen } from '../screens/auth/Otp';
import { ResetPasswordScreen } from '../screens/auth/ResetPassword';

import { useAuth } from '../state/AuthContext';
import { authApi } from '../services/api';
import {
  ensurePushTokenRegistered,
  getInitialNotification,
  initPush,
  onNotificationOpenedApp,
  registerPushHandlers,
  type AppNotificationPayload,
} from '../services/notifications';

import { MainShellScreen } from '../screens/customer/MainShell';
import { FoodSearchScreen } from '../screens/customer/FoodSearch';
import { RestaurantScreen } from '../screens/customer/Restaurant';
import { FoodDetailsScreen } from '../screens/customer/FoodDetails';
import { CartScreen } from '../screens/customer/Cart';
import { CheckoutScreen } from '../screens/customer/Checkout';
import { OrderTrackingScreen } from '../screens/customer/OrderTracking';
import { LocationPickerScreen } from '../screens/customer/LocationPicker';
import { RideSearchingScreen } from '../screens/customer/RideSearching';
import { RiderTrackingScreen } from '../screens/customer/RiderTracking';
import { ActivitiesScreen } from '../screens/customer/Activities';
import { FavoritesScreen } from '../screens/customer/Favorites';
import { NotificationsScreen } from '../screens/customer/Notifications';
import { ProfileScreen } from '../screens/customer/Profile';
import { WalletScreen } from '../screens/customer/Wallet';
import { SupportScreen } from '../screens/customer/Support';

import { RiderMainShellScreen } from '../screens/rider/RiderMainShell';
import { RiderRegistrationScreen } from '../screens/rider/RiderRegistration';
import { RiderVerificationScreen } from '../screens/rider/RiderVerification';
import { RiderActiveDeliveryScreen } from '../screens/rider/RiderActiveDelivery';
import { RiderNavigationScreen } from '../screens/rider/RiderNavigation';
import { RiderDocumentsScreen } from '../screens/rider/RiderDocuments';

import { withAdminGuard } from './AdminGuard';
import { AdminMainScreen } from '../screens/admin/AdminMain';
import { AdminUsers } from '../screens/admin/AdminUsers';
import { AdminRiders } from '../screens/admin/AdminRiders';
import { AdminRestaurants } from '../screens/admin/AdminRestaurants';
import { AdminMenu } from '../screens/admin/AdminMenu';
import { AdminRides } from '../screens/admin/AdminRides';
import { AdminPayments } from '../screens/admin/AdminPayments';
import { AdminWallet } from '../screens/admin/AdminWallet';
import { AdminPromotions } from '../screens/admin/AdminPromotions';
import { AdminNotifications } from '../screens/admin/AdminNotifications';
import { AdminSupport } from '../screens/admin/AdminSupport';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigation is driven from module scope (and from deep links / push taps that
 * can fire before this component mounts), so the ref lives outside React.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Reads the reset token out of a `swatcity://reset-password` URL. */
function resetTokenFromUrl(url: string): string | undefined {
  if (!url || !url.includes('reset-password')) return undefined;

  // Query form (used when the app is already running).
  const query = url.split('?')[1];
  if (query) {
    const match = query.split('&').find((p) => p.startsWith('token='));
    if (match) return decodeURIComponent(match.slice('token='.length)) || undefined;
  }

  // Fragment form (canonical; browsers never transmit it).
  const hash = url.split('#')[1];
  if (hash) {
    const match = hash.split('&').find((p) => p.startsWith('token='));
    if (match) return decodeURIComponent(match.slice('token='.length)) || undefined;
  }

  return undefined;
}

/**
 * Routes a push payload to the screen that owns it. Notification `kind` strings
 * come from the backend (backend/src/services/notification.service.ts).
 */
function handleNotificationPayload(payload: AppNotificationPayload): void {
  if (!navigationRef.isReady()) return;

  const target = payload.targetId;
  const kind = payload.kind ?? '';

  if (target && (kind.startsWith('order_') || kind === 'order')) {
    navigationRef.navigate('OrderTracking', { orderId: target });
    return;
  }
  if (target && kind.startsWith('ride_')) {
    navigationRef.navigate('Notifications');
    return;
  }
  navigationRef.navigate('Notifications');
}

/**
 * Wires the three push entry points (cold start, background tap, foreground
 * delivery) plus deep links, and keeps the backend's device-token record
 * current.
 */
function usePushAndDeepLinks(): void {
  const { user } = useAuth();
  const appState = useRef(AppState.currentState);

  // Cold start: a tap that launched the app.
  useEffect(() => {
    void getInitialNotification(handleNotificationPayload);
  }, []);

  // Background tap.
  useEffect(() => onNotificationOpenedApp(handleNotificationPayload), []);

  // Foreground delivery. The Android tray channel is created on launch, and
  // expo-notifications shows the banner itself via the handler in
  // services/notifications, so nothing is rendered in-app here.
  useEffect(() => {
    void initPush();
    return registerPushHandlers(() => {
      // NotificationsScreen refetches on focus, so the list is already current.
    });
  }, []);

  // Deep links, both while running and from a cold start.
  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      const token = resetTokenFromUrl(url);
      if (!token) return;
      if (!navigationRef.isReady()) return;
      navigationRef.navigate('ResetPassword', { token });
    };

    void Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', (event: { url: string }) => open(event.url));
    return () => sub.remove();
  }, []);

  // Register this device's Expo push token once signed in.
  useEffect(() => {
    if (!user) return;
    void ensurePushTokenRegistered((token) => authApi.registerDeviceToken(token));
  }, [user]);

  // Re-register on foreground: catches tokens rotated while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && user) {
        void ensurePushTokenRegistered((token) => authApi.registerDeviceToken(token));
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [user]);
}

export function RootNavigator() {
  usePushAndDeepLinks();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="OTP" component={OtpScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />

      <Stack.Screen name="Main" component={MainShellScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="RiderMain" component={RiderMainShellScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="AdminMain" component={withAdminGuard(AdminMainScreen)} options={{ animation: 'fade' }} />

      <Stack.Screen name="FoodSearch" component={FoodSearchScreen} />
      <Stack.Screen name="Restaurant" component={RestaurantScreen} />
      <Stack.Screen name="FoodDetails" component={FoodDetailsScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />

      <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
      <Stack.Screen name="RideSearching" component={RideSearchingScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="RiderTracking" component={RiderTrackingScreen} options={{ gestureEnabled: false }} />

      <Stack.Screen name="Activities" component={ActivitiesScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />

      <Stack.Screen name="RiderRegistration" component={RiderRegistrationScreen} />
      <Stack.Screen name="RiderVerification" component={RiderVerificationScreen} />
      <Stack.Screen name="RiderActiveDelivery" component={RiderActiveDeliveryScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="RiderNavigation" component={RiderNavigationScreen} />
      <Stack.Screen name="RiderDocuments" component={RiderDocumentsScreen} />

      <Stack.Screen name="AdminUsers" component={withAdminGuard(AdminUsers)} />
      <Stack.Screen name="AdminRiders" component={withAdminGuard(AdminRiders)} />
      <Stack.Screen name="AdminRestaurants" component={withAdminGuard(AdminRestaurants)} />
      <Stack.Screen name="AdminMenu" component={withAdminGuard(AdminMenu)} />
      <Stack.Screen name="AdminRides" component={withAdminGuard(AdminRides)} />
      <Stack.Screen name="AdminPayments" component={withAdminGuard(AdminPayments)} />
      <Stack.Screen name="AdminWallet" component={withAdminGuard(AdminWallet)} />
      <Stack.Screen name="AdminPromotions" component={withAdminGuard(AdminPromotions)} />
      <Stack.Screen name="AdminNotifications" component={withAdminGuard(AdminNotifications)} />
      <Stack.Screen name="AdminSupport" component={withAdminGuard(AdminSupport)} />
    </Stack.Navigator>
  );
}