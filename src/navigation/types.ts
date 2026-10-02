import type { RideFlow, RideType, MenuItem } from '../types/domain';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  OTP: { phone: string; name?: string };

  /**
   * Password reset, reached from the `swatcity://reset-password#token=...` deep
   * link in the Brevo email (see backend/src/routes/web.routes.ts).
   * `token` is optional because the app can also be opened cold with no link.
   */
  ResetPassword: { token?: string } | undefined;

  Main: undefined;
  RiderMain: undefined;
  RiderRegistration: undefined;
  RiderVerification: undefined;

  FoodSearch: undefined;
  Restaurant: { restaurantId: string };
  FoodDetails: { item: MenuItem; restaurantName: string };
  Cart: undefined;
  Checkout: undefined;
  OrderTracking: { orderId: string };

  LocationPicker: { mode: 'pickup' | 'dropoff' };
  RideSearching: {
    pickup: string;
    dropoff: string;
    distanceKm: number;
    rideType: RideType;
    fare: number;
  };
  RiderTracking: { ride: RideFlow };

  Activities: undefined;
  Favorites: undefined;
  Notifications: undefined;
  Profile: undefined;
  Wallet: undefined;
  Support: undefined;

  RiderActiveDelivery: { primaryRequest: boolean };
  RiderNavigation: undefined;
  RiderDocuments: undefined;

  AdminMain: undefined;
  AdminUsers: undefined;
  AdminRiders: undefined;
  AdminRestaurants: undefined;
  AdminMenu: undefined;
  AdminRides: undefined;
  AdminPayments: undefined;
  AdminWallet: undefined;
  AdminPromotions: undefined;
  AdminNotifications: undefined;
  AdminSupport: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}