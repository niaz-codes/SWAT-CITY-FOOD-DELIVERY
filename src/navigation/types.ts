import type { RideType, MenuItem } from '../types/domain';

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
  /**
   * "Finding your rider" interstitial, reached right after a real booking.
   * `rideId` is polled until a rider claims the ride (or the search is
   * cancelled); the display fields are only for the summary card.
   */
  RideSearching: {
    rideId: string;
    pickup: string;
    dropoff: string;
    distanceKm: number;
    rideType: RideType;
    fare: number;
  };
  /**
   * The live ride-tracking screen. The full ride object is fetched by id on
   * mount (rides change under you: assignment, status, completion), so only the
   * id travels through navigation.
   */
  RiderTracking: { rideId: string };

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

  /** The ride the rider accepted; everything else is fetched by id. */
  RiderActiveDelivery: { rideId: string };

  /** A food order the rider accepted; data comes from GET /rider/jobs. */
  RiderFoodDelivery: { orderId: string };

  /** Turn-by-turn hand-off to the phone's real navigation app. */
  RiderNavigation: { destination: { lat?: number; lng?: number; label?: string } };
  RiderDocuments: undefined;
  /** Rider sets the base location pin they start their shift from. */
  RiderBaseLocation: undefined;
  /** Rider proposes a vehicle type / registration change (admin-approved). */
  RiderVehicle: undefined;

  /**
   * Landing screen for restaurant-owner accounts on mobile. The owner
   * dashboard itself is web-based (same keep-admin-off-the-APK policy), so this
   * screen explains that and signs the account out cleanly.
   */
  PartnerPortal: undefined;
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
