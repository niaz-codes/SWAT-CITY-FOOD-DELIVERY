import React, { useEffect, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createNavigationContainerRef } from '@react-navigation/native';
import { AppState, type AppStateStatus } from 'react-native';
import { RootStackParamList } from './types';

import { SplashScreen } from '../screens/Splash';
import { LoginScreen } from '../screens/auth/Login';
import { RegisterScreen } from '../screens/auth/Register';
import { EmailOtpScreen } from '../screens/auth/EmailOtp';
import { ResetPasswordScreen } from '../screens/auth/ResetPassword';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPassword';

import { useAuth } from '../state/AuthContext';
import type { Role } from '../types/domain';
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
import { LegalScreen } from '../screens/customer/Legal';

import { RiderMainShellScreen } from '../screens/rider/RiderMainShell';
import { RiderRegistrationScreen } from '../screens/rider/RiderRegistration';
import { RiderVerificationScreen } from '../screens/rider/RiderVerification';
import { RiderActiveDeliveryScreen } from '../screens/rider/RiderActiveDelivery';
import { RiderFoodDeliveryScreen } from '../screens/rider/RiderFoodDelivery';
import { RiderNavigationScreen } from '../screens/rider/RiderNavigation';
import { RiderDocumentsScreen } from '../screens/rider/RiderDocuments';
import { RiderBaseLocationScreen } from '../screens/rider/RiderBaseLocation';
import { RiderVehicleScreen } from '../screens/rider/RiderVehicle';

// The admin panel lives in its own web app (admin-web). Admin screens, guards
// and admin API services are deliberately absent from this mobile bundle.

import { PartnerPortalScreen } from '../screens/PartnerPortal';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigation is driven from module scope (and from deep links / push taps that
 * can fire before this component mounts), so the ref lives outside React.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Routes a push payload to the screen that owns it. Notification `kind` strings
 * come from the backend (backend/src/services/notification.service.ts) and are
 * now the fine-grained `event` value, so every order event - not just the
 * `order_*` ones - must resolve to order tracking.
 */
function handleNotificationPayload(payload: AppNotificationPayload, role?: Role): void {
  if (!navigationRef.isReady()) return;

  const target = payload.targetId;
  const kind = payload.kind ?? '';

  const isOrderEvent =
    kind === 'order' ||
    kind.startsWith('order_') ||
    // Rider-side order events (rider_assigned / rider_picked_up / ...) still
    // point at an order.
    kind.startsWith('rider_');
  const isRideEvent = kind === 'ride' || kind.startsWith('ride_');

  // A rider's pushes are dispatch messages: the rider shell owns the live feed
  // and the active delivery, and the customer OrderTracking screen would 403.
  if (role === 'rider') {
    navigationRef.navigate(target || isOrderEvent || isRideEvent ? 'RiderMain' : 'Notifications');
    return;
  }

  // Admins manage the platform on the web app only (no admin screens ship in
  // this APK), so their pushes land on the notification list like any other
  // unread activity.
  if (role === 'admin') {
    navigationRef.navigate('Notifications');
    return;
  }

  if (target && isOrderEvent) {
    navigationRef.navigate('OrderTracking', { orderId: target });
    return;
  }
  if (target && isRideEvent) {
    // For customers the ride id is all RiderTracking needs — it fetches the
    // live ride (and its cancellation) itself. Riders were handled above.
    navigationRef.navigate('RiderTracking', { rideId: target });
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
    void getInitialNotification((payload) => handleNotificationPayload(payload, user?.role));
  }, [user?.role]);

  // Background tap.
  useEffect(
    () => onNotificationOpenedApp((payload) => handleNotificationPayload(payload, user?.role)),
    [user?.role],
  );

  // Foreground delivery. The Android tray channel is created on launch, and
  // expo-notifications shows the banner itself via the handler in
  // services/notifications, so nothing is rendered in-app here.
  useEffect(() => {
    void initPush();
    return registerPushHandlers(() => {
      // NotificationsScreen refetches on focus, so the list is already current.
    });
  }, []);

  // Register this device's Expo push token once signed in.
  useEffect(() => {
    if (!user) return;
    void ensurePushTokenRegistered((token) => authApi.registerDeviceToken(token));
  }, [user]);

  // Re-register on foreground: catches tokens rotated while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      // appState.current is nullable (AppState.currentState can be null before
      // the first change event), so the match is guarded rather than assumed.
      if (appState.current?.match(/inactive|background/) && next === 'active' && user) {
        void ensurePushTokenRegistered((token) => authApi.registerDeviceToken(token));
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [user]);
}

/**
 * Sends the user back to Login when the session ends.
 *
 * The tab shells only redirect on explicit logout, so when the session was
 * cleared (e.g. a 401 on an expired token) the UI would stay stranded on
 * whatever screen the session was dropped from. Watching the session here
 * covers every role in one place.
 *
 * `navigationRef` is used rather than `useNavigation` because this hook runs
 * above the Navigator, and `reset` (not `navigate`) is required to drop the
 * authenticated stack so a back gesture cannot walk back into it.
 */
function useSessionRedirect(): void {
  const { user, hydrated } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    if (user) {
      wasSignedIn.current = true;
      return;
    }

    // A cold start with no stored session must not fight Splash's own routing,
    // so only redirect when a live session was actually torn down.
    if (!wasSignedIn.current) return;
    wasSignedIn.current = false;

    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [hydrated, user]);
}

export function RootNavigator() {
  usePushAndDeepLinks();
  useSessionRedirect();

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
      <Stack.Screen name="EmailOtp" component={EmailOtpScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />

      <Stack.Screen name="Main" component={MainShellScreen} options={{ animation: 'fade' }} />
      <Stack.Screen
        name="RiderMain"
        component={RiderMainShellScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="PartnerPortal"
        component={PartnerPortalScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen name="FoodSearch" component={FoodSearchScreen} />
      <Stack.Screen name="Restaurant" component={RestaurantScreen} />
      <Stack.Screen
        name="FoodDetails"
        component={FoodDetailsScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />

      <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
      <Stack.Screen
        name="RideSearching"
        component={RideSearchingScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="RiderTracking"
        component={RiderTrackingScreen}
        options={{ gestureEnabled: false }}
      />

      <Stack.Screen name="Activities" component={ActivitiesScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />

      <Stack.Screen name="RiderRegistration" component={RiderRegistrationScreen} />
      <Stack.Screen name="RiderVerification" component={RiderVerificationScreen} />
      <Stack.Screen
        name="RiderActiveDelivery"
        component={RiderActiveDeliveryScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="RiderFoodDelivery"
        component={RiderFoodDeliveryScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="RiderNavigation" component={RiderNavigationScreen} />
      <Stack.Screen name="RiderDocuments" component={RiderDocumentsScreen} />
      <Stack.Screen name="RiderBaseLocation" component={RiderBaseLocationScreen} />
      <Stack.Screen name="RiderVehicle" component={RiderVehicleScreen} />
    </Stack.Navigator>
  );
}
