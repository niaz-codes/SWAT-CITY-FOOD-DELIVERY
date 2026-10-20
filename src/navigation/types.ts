import type { RideFlow, RideType, MenuItem } from '../types/domain';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;

  /**
   * Step 2 of every email-OTP flow (login + registration). Reached with the
   * challenge the login / register endpoint returned; the 6-digit code confirms
   * it and opens the session.
   */
  EmailOtp: {
    challengeToken: string;
    email: string;
    purpose: 'login' | 'register';
    /** Seconds the current code stays valid, so the resend timer matches. */
    ttlSeconds?: number;
  };

  /**
   * Step 1 of the reset flow: collects the account email so the backend can
   * mail a 6-digit code. Opened from "Forgot password?" on Login.
   */
  ForgotPassword: undefined;

  /**
   * Step 2 of the reset flow: confirm the emailed code and choose a new
   * password. Reached from ForgotPassword with the challenge it returned.
   */
  ResetPassword: {
    challengeToken: string;
    email: string;
  };

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

  /**
   * In-app Privacy Policy / Terms of Service reader. `doc` picks which document
   * opens first; omitted it defaults to the privacy policy.
   */
  Legal: { doc?: 'privacy' | 'terms' } | undefined;

  RiderActiveDelivery: { primaryRequest: boolean };
  RiderNavigation: undefined;
  RiderDocuments: undefined;
  /** Rider sets the base location pin they start their shift from. */
  RiderBaseLocation: undefined;
  /** Rider proposes a vehicle type / registration change (admin-approved). */
  RiderVehicle: undefined;

  AdminMain: undefined;
  AdminUsers: undefined;
  AdminRiders: undefined;
  AdminRestaurants: undefined;
  AdminMenu: undefined;
  AdminRides: undefined;
  AdminPayments: undefined;
  AdminWithdrawals: undefined;
  AdminWallet: undefined;
  AdminPromotions: undefined;
  AdminNotifications: undefined;
  AdminSupport: undefined;
};

declare global {
  namespace ReactNavigation {
    // React Navigation's own types already declare an empty `RootParamList`
    // interface in this global namespace, so this must be an interface (type
    // aliases cannot declaration-merge). The empty body is intentional and is
    // the pattern the React Navigation docs prescribe.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
