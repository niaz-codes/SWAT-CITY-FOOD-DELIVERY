import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Address,
  ActivityItem,
  AppNotification,
  CartItem,
  DeliveryFeedItem,
  Favorite,
  MenuItem,
  Order,
  OrderStatus,
  Restaurant,
  RideRequest,
  Rider,
  RiderEarningsPeriod,
  RiderStats,
  User,
  WalletTx,
  RideType,
  VehicleType,
} from '../types/domain';
import {
  API_BASE_URL,
  AUTH_TIMEOUT_MS,
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpUploadWithProgress,
  setApiTokens,
} from './client';

export { API_BASE_URL };

const SESSION_KEY = '@swat/session';

const DAY = 24 * 3_600_000;

const ID_RE = /^[0-9a-f]{24}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ride fare defaults, used only to estimate a fare before the trip is booked.
 * These mirror the backend's base/per-km rates so the preview shown to the
 * customer matches what the server will charge.
 */
const FARE_DEFAULTS: Record<RideType, { base: number; perKm: number }> = {
  swat_moto: { base: 60, perKm: 22 },
  swat_city: { base: 90, perKm: 28 },
  swat_van: { base: 140, perKm: 36 },
};

// ---------------------------------------------------------------------------
// Response shape mappers (backend JSON → app domain types)
// ---------------------------------------------------------------------------

type BackUser = {
  id?: unknown;
  name?: string;
  email?: string;
  phone?: string;
  role?: 'customer' | 'rider' | 'admin' | string;
  verified?: boolean;
};

type BackRestaurant = {
  _id?: unknown;
  name?: string;
  cuisine?: string;
  category?: string;
  tags?: string[];
  featured?: boolean;
  rating?: number;
  reviewCount?: number;
  deliveryTimeMin?: number;
  deliveryFee?: number;
  minOrder?: number;
  deliveryKM?: number;
  freeDelivery?: boolean;
  promo?: string;
  emoji?: string;
  gradient?: string[];
};

type BackFoodItem = {
  _id?: unknown;
  restaurant?: unknown;
  name?: string;
  description?: string;
  category?: string;
  price?: number;
  emoji?: string;
  gradient?: string[];
  rating?: number;
  calories?: number;
  prepMin?: number;
  popular?: boolean;
};

type BackAddress = {
  _id?: unknown;
  label?: string;
  full?: string;
  area?: string;
  lat?: number;
  lng?: number;
  tag?: string;
};

type BackOrderItem = {
  foodItem?: unknown;
  name?: string;
  quantity?: number;
  price?: number;
  emoji?: string;
  note?: string;
};

type BackOrder = {
  _id?: unknown;
  orderNumber?: string;
  restaurant?: unknown;
  rider?: unknown;
  items?: BackOrderItem[];
  status?: string;
  total?: number;
  deliveryFee?: number;
  distanceKm?: number;
  createdAt?: string | Date;
  estimatedMinutes?: number;
  addressSnapshot?: { full?: string };
};

type BackFavorite = {
  id?: unknown;
  kind?: 'restaurant' | 'food' | string;
  refId?: unknown;
  name?: string;
  subtitle?: string;
  rating?: number;
  price?: number;
  gradient?: string[];
  emoji?: string;
  savedAt?: string | Date;
};

type BackWalletTx = {
  _id?: unknown;
  type?: string;
  amount?: number;
  description?: string;
  reference?: string;
  referenceModel?: string;
  createdAt?: string | Date;
};

type BackNotification = {
  _id?: unknown;
  type?: string;
  title?: string;
  body?: string;
  read?: boolean;
  createdAt?: string | Date;
};

type BackActivity = {
  id?: string;
  kind?: 'food' | 'ride' | 'payment' | string;
  title?: string;
  subtitle?: string;
  amount?: number;
  at?: string | Date;
  status?: string;
};

type BackFeedItem = {
  id?: string;
  kind?: 'ride' | 'food' | string;
  pickup?: string;
  dropoff?: string;
  distanceKm?: number;
  durationMin?: number;
  payout?: number;
  restaurantEmoji?: string;
  restaurantGradient?: string[];
  createdAt?: string | Date;
};

/** Raw ride document as returned by /rides/:id (customer may be populated). */
type BackRideCustomer = { _id?: unknown; name?: string; phone?: string };

type BackRide = {
  _id?: unknown;
  rideNumber?: string;
  customer?: BackRideCustomer;
  rider?: { _id?: string; name?: string; phone?: string; avatarUrl?: string | null } | null;
  type?: 'swat_moto' | 'swat_city' | 'swat_van';
  vehicle?: string;
  status?: 'searching' | 'accepted' | 'arriving' | 'started' | 'completed' | 'cancelled' | string;
  pickup?: { address?: string; area?: string | null; lat?: number; lng?: number } | null;
  dropoff?: { address?: string; area?: string | null; lat?: number; lng?: number } | null;
  distanceKm?: number;
  durationMin?: number;
  fare?: number;
  riderPayout?: number;
  paymentMethod?: string;
  cancelReason?: string | null;
  createdAt?: string | Date;
};

export const asGradient = (g?: string[]): [string, string] => {
  const source = Array.isArray(g) && g.length >= 2 ? g : ['#0E9488', '#0E3F3A'];
  return [source[0] ?? '#0E9488', source[1] ?? '#0E3F3A'];
};

export const objId = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const o = v as { _id?: unknown; id?: unknown };
  return String(o._id ?? o.id ?? '');
};

export const prop = <T>(v: unknown, key: string): T | undefined => {
  if (v && typeof v === 'object' && key in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>)[key] as T;
  }
  return undefined;
};

const normalizePhone = (raw: string): string => {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('92')) d = d.slice(2);
  return d.startsWith('0') ? d : `0${d}`;
};

export const roleGradient = (role?: string): [string, string] =>
  role === 'admin'
    ? ['#0E9488', '#7B2CBF']
    : role === 'rider'
      ? ['#1B84B5', '#0E3F3A']
      : ['#0E9488', '#0E3F3A'];

const mapUser = (u: BackUser): User => ({
  id: String(u.id ?? ''),
  name: u.name ?? '',
  email: u.email ?? '',
  phone: u.phone ?? '',
  role: u.role === 'rider' || u.role === 'admin' ? u.role : 'customer',
  avatarGradient: roleGradient(u.role),
  verified: Boolean(u.verified),
});

const mapRestaurant = (r: BackRestaurant): Restaurant => ({
  id: String(r._id ?? ''),
  name: r.name ?? '',
  cuisine: r.cuisine ?? r.category ?? '',
  rating: Number(r.rating ?? 0),
  reviews: Number(r.reviewCount ?? 0),
  deliveryTimeMin: Number(r.deliveryTimeMin ?? 30),
  deliveryFee: Number(r.deliveryFee ?? 0),
  minOrder: Number(r.minOrder ?? 0),
  deliveryKM: Number(r.deliveryKM ?? 0),
  freeDelivery: Boolean(r.freeDelivery ?? false),
  promo: r.promo || undefined,
  category: r.category ?? 'Other',
  gradient: asGradient(r.gradient),
  emoji: r.emoji ?? '🍽️',
  featured: Boolean(r.featured),
  tags: Array.isArray(r.tags) ? r.tags : [],
});

const mapMenuItem = (f: BackFoodItem): MenuItem => ({
  id: String(f._id ?? ''),
  restaurantId: objId(f.restaurant),
  name: f.name ?? '',
  description: f.description ?? '',
  price: Number(f.price ?? 0),
  category: f.category ?? 'Other',
  rating: Number(f.rating ?? 0),
  calories: Number(f.calories ?? 0),
  prepMin: Number(f.prepMin ?? 0),
  popular: Boolean(f.popular),
  gradient: asGradient(f.gradient),
  emoji: f.emoji ?? '🍽️',
});

const mapAddress = (a: BackAddress): Address => ({
  id: String(a._id ?? ''),
  label: a.label || (a.tag === 'home' ? 'Home' : a.tag === 'work' ? 'Work' : 'Saved'),
  full: a.full ?? '',
  area: a.area ?? '',
  lat: Number(a.lat ?? 0),
  lng: Number(a.lng ?? 0),
  tagged: a.tag === 'home' || a.tag === 'work' || a.tag === 'frequent' ? a.tag : undefined,
});

const mapOrderStatus = (s?: string): Order['status'] => {
  switch (s) {
    case 'confirmed':
      return 'confirmed';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'picked_up':
      return 'picked_up';
    case 'on_the_way':
      return 'on_the_way';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    case 'rider_assigned':
      return 'ready';
    default:
      return 'placed';
  }
};

const mapOrderRider = (o: BackOrder): Rider | undefined => {
  const rider = o.rider;
  if (!rider || typeof rider !== 'object') return undefined;
  return {
    id: objId(rider),
    name: prop<string>(rider, 'name') ?? 'Rider',
    phone: prop<string>(rider, 'phone') ?? '',
    rating: Number(prop<number>(rider, 'rating') ?? 0),
    trips: 0,
    vehicle: 'bike',
    plateNumber: '',
    status: 'busy',
    avatarGradient: ['#1B84B5', '#0E3F3A'],
    etaMin: Number(o.estimatedMinutes ?? 30),
    lat: 0,
    lng: 0,
  };
};

const mapOrder = (o: BackOrder): Order => {
  const restaurant = o.restaurant;
  const restaurantId = objId(restaurant);
  const restaurantName =
    typeof restaurant === 'object' && restaurant ? (prop<string>(restaurant, 'name') ?? '') : '';
  const restaurantEmoji =
    typeof restaurant === 'object' && restaurant ? (prop<string>(restaurant, 'emoji') ?? '') : '';
  const gradient =
    typeof restaurant === 'object' && restaurant
      ? prop<string[]>(restaurant, 'gradient')
      : undefined;
  return {
    id: String(o._id ?? ''),
    type: 'food',
    restaurantName,
    restaurantEmoji: restaurantEmoji || '🍽️',
    restaurantGradient: gradient ? asGradient(gradient) : ['#0E9488', '#0E3F3A'],
    items: (o.items ?? []).map((i) => ({
      menuItem: {
        id: objId(i.foodItem) || restaurantId,
        restaurantId,
        name: i.name ?? '',
        description: '',
        price: Number(i.price ?? 0),
        category: '',
        rating: 0,
        calories: 0,
        prepMin: 0,
        gradient: ['#0E9488', '#0E3F3A'],
        emoji: i.emoji ?? '🍽️',
      },
      restaurantId,
      quantity: Number(i.quantity ?? 1),
      specialInstructions: i.note,
    })),
    status: mapOrderStatus(o.status),
    total: Number(o.total ?? 0),
    deliveryFee: Number(o.deliveryFee ?? 0),
    distanceKm: Number(o.distanceKm ?? 0),
    placedAt: new Date(o.createdAt ?? Date.now()),
    estimatedMinutes: Number(o.estimatedMinutes ?? 30),
    rider: mapOrderRider(o),
    address: o.addressSnapshot?.full ?? '',
  };
};

const mapFavorite = (f: BackFavorite): Favorite => ({
  id: String(f.id ?? ''),
  kind: f.kind === 'food' ? 'food' : 'restaurant',
  refId: String(f.refId ?? ''),
  name: f.name ?? '',
  subtitle: f.subtitle ?? '',
  rating: Number(f.rating ?? 0),
  price: f.price != null ? Number(f.price) : undefined,
  gradient: asGradient(f.gradient),
  emoji: f.emoji ?? '⭐',
  savedAt: new Date(f.savedAt ?? Date.now()),
});

const mapWalletTx = (t: BackWalletTx): WalletTx => ({
  id: String(t._id ?? ''),
  kind: t.type === 'debit' || t.type === 'commission' ? 'debit' : 'credit',
  title: t.description ?? `Wallet ${t.type ?? 'transaction'}`,
  subtitle: t.reference
    ? t.referenceModel
      ? `${t.reference} · ${t.referenceModel}`
      : t.reference
    : (t.type ?? ''),
  amount: Number(t.amount ?? 0),
  at: new Date(t.createdAt ?? Date.now()),
});

const mapNotification = (n: BackNotification): AppNotification => {
  const raw = n.type ?? 'system';
  const kind: AppNotification['kind'] =
    raw === 'order' || raw === 'ride' || raw === 'promo' ? raw : 'system';
  return {
    id: String(n._id ?? ''),
    title: n.title ?? '',
    body: n.body ?? '',
    at: new Date(n.createdAt ?? Date.now()),
    read: Boolean(n.read),
    kind,
  };
};

const mapActivity = (a: BackActivity): ActivityItem => ({
  id: a.id ?? '',
  kind: a.kind === 'ride' || a.kind === 'payment' ? a.kind : 'food',
  title: a.title ?? '',
  subtitle: a.subtitle ?? '',
  amount: a.amount,
  at: new Date(a.at ?? Date.now()),
  status: a.status ?? '',
});

const mapFeedItem = (f: BackFeedItem): DeliveryFeedItem => ({
  id: f.id ?? '',
  kind: f.kind === 'ride' ? 'ride' : 'food',
  pickup: f.pickup ?? '',
  dropoff: f.dropoff ?? '',
  distanceKm: Number(f.distanceKm ?? 0),
  durationMin: Number(f.durationMin ?? 0),
  payout: Number(f.payout ?? 0),
  restaurantEmoji: f.restaurantEmoji || undefined,
  restaurantGradient: f.restaurantGradient ? asGradient(f.restaurantGradient) : undefined,
  createdAt: new Date(f.createdAt ?? Date.now()),
});

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

/**
 * A half-finished email-OTP flow.
 *
 * Login, registration and password reset all answer with this instead of a
 * session: the account has been created (or the credentials checked), and a
 * 6-digit code has been emailed. `challengeToken` is the short-lived proof the
 * client echoes back to the verify / resend endpoints — it is not an access
 * token and cannot authenticate a request on its own.
 */
export type EmailOtpPurpose = 'login' | 'register' | 'reset';

export type EmailOtpChallenge = {
  otpRequired: true;
  purpose: EmailOtpPurpose;
  email: string;
  challengeToken: string;
  ttlSeconds: number;
};

/** Forgot-password answer: the challenge plus an enumeration-safe message. */
export type ForgotPasswordResult = EmailOtpChallenge & { message: string };

export const authApi = {
  /**
   * Email + password sign-in, step 1.
   *
   * Checks the credentials server-side and emails a 6-digit code. No session is
   * created here: the caller continues on the EmailOtp screen, which exchanges
   * the code for a session. The caller routes on the returned `purpose`.
   */
  async login(email: string, password: string): Promise<EmailOtpChallenge> {
    const res = await httpPost<EmailOtpChallenge>(
      '/auth/login/email',
      { email: email.trim().toLowerCase(), password },
      false,
      AUTH_TIMEOUT_MS,
    );
    return res.data;
  },

  /** Step 2: confirm the emailed code and open the session. */
  async verifyEmailOtp(challengeToken: string, otp: string): Promise<User> {
    const res = await httpPost<{ user?: BackUser; accessToken?: string; refreshToken?: string }>(
      '/auth/otp/email/verify',
      { challengeToken, otp },
      false,
      AUTH_TIMEOUT_MS,
    );
    const auth = res.data;
    if (!auth?.user || !auth.accessToken || !auth.refreshToken) {
      throw new Error('Verification failed. Please try again.');
    }
    await setApiTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
    const user = mapUser(auth.user);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  },

  /** Re-send the code for a flow that already has a challenge token. */
  async resendEmailOtp(challengeToken: string): Promise<EmailOtpChallenge> {
    const res = await httpPost<EmailOtpChallenge>(
      '/auth/otp/email/resend',
      { challengeToken },
      false,
      AUTH_TIMEOUT_MS,
    );
    return res.data;
  },

  /**
   * Customer sign-in / sign-up with Google.
   *
   * Sends only the Google ID token — never a name, email or photo — and stores
   * the session exactly like an email-OTP login. Google has already verified the
   * email, so an existing customer signs straight in and a new email is
   * registered immediately: there is no phone step and no second code. There is
   * deliberately no demo fallback — fabricating a local session would show an
   * authenticated customer the backend never issued a token for.
   *
   * `created` is true when a brand new account was registered, so the caller can
   * tailor the welcome copy.
   */
  async googleLogin(idToken: string): Promise<{ user: User; created: boolean }> {
    const res = await httpPost<{ user?: BackUser; accessToken?: string; refreshToken?: string }>(
      '/auth/google',
      { idToken },
      false,
      AUTH_TIMEOUT_MS,
    );
    const auth = res.data;
    if (!auth?.user || !auth.accessToken || !auth.refreshToken) {
      throw new Error('Google sign-in failed. Please try again.');
    }
    await setApiTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
    const user = mapUser(auth.user);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
    const created = Boolean((res.meta as { created?: boolean } | undefined)?.created);
    return { user, created };
  },

  /**
   * Rider onboarding.
   *
   * Multipart because the photo has to travel with the form: the backend
   * creates the account, the profile and the photo in one operation, so a
   * rider can never end up registered without the mandatory photo. `photoUri`
   * is always a fresh camera capture — this screen offers no gallery option.
   *
   * Returns an email-OTP challenge like every other sign-up: the rider confirms
   * the code before a session is issued.
   */
  async registerRider(input: {
    name: string;
    phone: string;
    email: string;
    password: string;
    cnic: string;
    baseCity?: string;
    vehicleType: 'bike' | 'rickshaw' | 'van' | 'car';
    vehiclePlate: string;
    experienceYears: number;
    location: { lat: number; lng: number; label?: string };
    photoUri: string;
    /** The type the picker reported, when it could work one out. */
    photoMimeType?: string;
    /** Upload progress, 0-100. Fires until the server has the whole body. */
    onProgress?: (percent: number) => void;
  }): Promise<EmailOtpChallenge> {
    const form = new FormData();
    form.append('name', input.name);
    form.append('phone', normalizePhone(input.phone));
    if (input.email) form.append('email', input.email);
    form.append('password', input.password);
    form.append('cnic', input.cnic);
    if (input.baseCity) form.append('baseCity', input.baseCity);
    form.append('vehicleType', input.vehicleType);
    form.append('vehiclePlate', input.vehiclePlate);
    form.append('experienceYears', String(input.experienceYears));
    form.append('latitude', String(input.location.lat));
    form.append('longitude', String(input.location.lng));
    if (input.location.label) form.append('locationLabel', input.location.label);
    // The camera normally hands back a JPEG, but Android's own editor can save
    // a PNG. The declared type has to match the bytes, otherwise the server
    // stores a PNG under a .jpg name and some viewers refuse to show it.
    // The picker's own answer is used when it has one; the file name is the
    // fallback for the captures that carry no type at all.
    const mimeType =
      input.photoMimeType ?? (/\.png(\?|$)/i.test(input.photoUri) ? 'image/png' : 'image/jpeg');
    const isPng = mimeType.toLowerCase().includes('png');
    form.append('photo', {
      uri: input.photoUri,
      name: isPng ? 'photo.png' : 'photo.jpg',
      type: mimeType,
    } as unknown as Blob);

    const res = await httpUploadWithProgress<EmailOtpChallenge>(
      '/auth/register/rider',
      form,
      input.onProgress,
      'POST',
      false,
    );
    return res.data;
  },

  async saveUser(user: User): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
  },

  /**
   * Customer sign-up with email + password.
   *
   * Calls the real `/auth/register` endpoint, which hashes the password and
   * emails a 6-digit code. No session is issued until that code is confirmed on
   * the EmailOtp screen — there is no demo guest fallback (a silently fake
   * account would be worse than a visible failure).
   */
  async register(input: {
    name: string;
    phone: string;
    email: string;
    password: string;
  }): Promise<EmailOtpChallenge> {
    const res = await httpPost<EmailOtpChallenge>(
      '/auth/register',
      {
        name: input.name.trim(),
        phone: normalizePhone(input.phone),
        email: input.email.trim().toLowerCase(),
        password: input.password,
        role: 'customer',
      },
      false,
      AUTH_TIMEOUT_MS,
    );
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Password reset (email OTP via Supabase Auth). Unlike the read endpoints above these
  // have NO demo fallback - a fake "code sent" confirmation would be actively
  // harmful.
  // -------------------------------------------------------------------------

  /**
   * Start a reset. Always resolves 200, even for unknown addresses, so the
   * endpoint cannot be used to discover which emails have accounts. Returns the
   * OTP challenge the reset screen needs for step 2.
   */
  async requestPasswordReset(email: string): Promise<ForgotPasswordResult> {
    const res = await httpPost<ForgotPasswordResult>(
      '/auth/forgot-password',
      { email: email.trim().toLowerCase() },
      false,
      AUTH_TIMEOUT_MS,
    );
    return res.data;
  },

  /** Step 2: confirm the emailed code and set the new password. */
  async resetPassword(
    challengeToken: string,
    otp: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const res = await httpPost<{ message?: string }>(
      '/auth/reset-password',
      { challengeToken, otp, newPassword },
      false,
      AUTH_TIMEOUT_MS,
    );
    return { message: res.data.message ?? 'Password updated. You can sign in now.' };
  },

  /** Push the Expo push token for this install so the backend can target it. */
  async registerDeviceToken(deviceToken: string): Promise<void> {
    await httpPost('/auth/device-token', { deviceToken });
  },

  async getSession(): Promise<User | null> {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
    await setApiTokens(null);
  },
};

export const addressApi = {
  async getSaved(): Promise<Address[]> {
    const res = await httpGet<{ addresses?: BackAddress[] }>('/customer/addresses');
    return (res.data.addresses ?? []).map(mapAddress);
  },

  async searchPlaces(q: string): Promise<Address[]> {
    const query = q.trim();
    if (!query) return [];
    const res = await httpGet<{ places?: BackAddress[] }>(
      `/places/search?q=${encodeURIComponent(query)}`,
      false,
    );
    return (res.data.places ?? []).map(mapAddress);
  },
};

export const foodApi = {
  async getRestaurants(): Promise<Restaurant[]> {
    const res = await httpGet<{ restaurants?: BackRestaurant[] }>('/restaurants', false);
    return (res.data.restaurants ?? []).map(mapRestaurant);
  },

  async getFeaturedRestaurants(): Promise<Restaurant[]> {
    const res = await httpGet<{ restaurants?: BackRestaurant[] }>('/restaurants/featured', false);
    return (res.data.restaurants ?? []).map(mapRestaurant);
  },

  async getRestaurant(id: string): Promise<Restaurant> {
    const res = await httpGet<{ restaurant?: BackRestaurant }>(`/restaurants/${id}`, false);
    if (!res.data.restaurant) throw new Error('Restaurant not found');
    return mapRestaurant(res.data.restaurant);
  },

  async getMenu(restaurantId: string): Promise<MenuItem[]> {
    const res = await httpGet<{ items?: BackFoodItem[] }>(
      `/restaurants/${restaurantId}/menu`,
      false,
    );
    return (res.data.items ?? []).map(mapMenuItem);
  },

  async getPopular(): Promise<MenuItem[]> {
    const res = await httpGet<{ items?: BackFoodItem[] }>('/restaurants/popular', false);
    return (res.data.items ?? []).map(mapMenuItem);
  },

  async getCategories(): Promise<string[]> {
    const res = await httpGet<{ categories?: ({ name?: string } | string)[] }>(
      '/restaurants/categories',
      false,
    );
    return (res.data.categories ?? [])
      .map((c) => (typeof c === 'string' ? c : (c.name ?? '')))
      .filter((name): name is string => Boolean(name));
  },

  async search(q: string): Promise<{ restaurants: Restaurant[]; dishes: MenuItem[] }> {
    const res = await httpGet<{ restaurants?: BackRestaurant[]; dishes?: BackFoodItem[] }>(
      `/restaurants/search?q=${encodeURIComponent(q)}`,
      false,
    );
    return {
      restaurants: (res.data.restaurants ?? []).map(mapRestaurant),
      dishes: (res.data.dishes ?? []).map(mapMenuItem),
    };
  },
};

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type CheckoutPaymentMethod = 'easypaisa' | 'jazzcash';

export type GatewayMethodInfo = {
  method: string;
  displayName: string;
  enabled: boolean;
  reason?: string;
};

export type OrderQuote = {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  platformFee: number;
  tip: number;
  total: number;
  currency: string;
  itemCount: number;
  estimatedMinutes: number;
  restaurant: {
    id?: unknown;
    name?: string;
    emoji?: string;
    gradient?: string[];
    cuisine?: string;
  };
  methods: GatewayMethodInfo[];
};

export type PaymentHandoff = { type: 'form'; url: string } | { type: 'redirect'; url: string };

export type PlaceOrderResult = {
  order: Order;
  payment: {
    id: unknown;
    status: string;
    method: string;
    amount: number;
    currency: string;
  };
  /** Present only for online wallets: how to send the payer to the gateway. */
  handoff: PaymentHandoff | null;
};

export type PaymentState = {
  orderPaymentStatus: string;
  paymentMethod: string;
  total: number;
  payment: {
    id: unknown;
    status: string;
    method: string;
    amount: number;
    transactionRef?: string;
    gatewayRef?: string;
    failureReason?: string;
  } | null;
};

export const paymentApi = {
  /** Which gateways are usable right now, so the UI can disable unavailable ones. */
  async methods(): Promise<GatewayMethodInfo[]> {
    const res = await httpGet<{ methods?: GatewayMethodInfo[] }>('/payments/methods');
    return res.data.methods ?? [];
  },

  /**
   * Server-authoritative price preview. The checkout screen renders these figures
   * rather than computing money on the device.
   */
  async quote(params: { promoCode?: string; tip?: number } = {}): Promise<OrderQuote> {
    const query = new URLSearchParams();
    if (params.promoCode) query.set('promoCode', params.promoCode);
    if (params.tip !== undefined) query.set('tip', String(params.tip));
    const qs = query.toString();
    const res = await httpGet<OrderQuote>(`/orders/quote${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  /**
   * Asks the server to confirm the payment with the gateway. This is the only
   * trustworthy status source — a browser redirect is never treated as proof.
   */
  async verify(orderId: string): Promise<{
    status: 'paid' | 'failed' | 'pending';
    reason?: string;
    orderPaymentStatus?: string;
  }> {
    const res = await httpPost<{
      status: 'paid' | 'failed' | 'pending';
      reason?: string;
      order?: { paymentStatus?: string };
    }>(`/payments/orders/${orderId}/payment/verify`);
    return {
      status: res.data.status,
      reason: res.data.reason,
      orderPaymentStatus: res.data.order?.paymentStatus,
    };
  },

  async status(orderId: string): Promise<PaymentState> {
    const res = await httpGet<PaymentState>(`/payments/orders/${orderId}/payment`);
    return res.data;
  },

  /** Cancels an in-flight wallet payment when the payer backs out. */
  async abandon(orderId: string): Promise<void> {
    await httpPost(`/payments/orders/${orderId}/payment/abandon`, {});
  },
};

/** Live tracking payload from `/orders/:id/track`. */
export type OrderLiveTracking = {
  orderId: string;
  status: OrderStatus;
  trackingActive: boolean;
  estimatedMinutes: number | null;
  rider: {
    id: string;
    name: string;
    phone: string;
    avatarUrl: string | null;
    location: { lat: number; lng: number; heading: number; updatedAt: string | null } | null;
  } | null;
};

export const orderApi = {
  async placeOrder(
    items: CartItem[],
    address: Address,
    total: number,
    deliveryFee: number,
    distanceKm: number,
    paymentMethod: CheckoutPaymentMethod = 'easypaisa',
    extra: { customerPhone?: string; customerEmail?: string; idempotencyKey?: string } = {},
  ): Promise<PlaceOrderResult> {
    // No fallback: a fabricated order would report a checkout success that no
    // gateway ever confirmed.
    const restaurantId = items[0]?.restaurantId;
    if (!restaurantId) throw new Error('Unknown restaurant');

    await httpPost('/cart', {
      restaurantId,
      items: items.map((i) => ({
        foodItem: i.menuItem.id,
        quantity: i.quantity,
        note: i.specialInstructions,
      })),
    });

    // Reuse an existing backend address when the selected one is real,
    // otherwise persist the (otherwise local) delivery location first.
    let addressId = ID_RE.test(address.id) ? address.id : '';
    if (!addressId) {
      const created = await httpPost<{ address?: { _id?: unknown } }>('/customer/addresses', {
        full: address.full,
        area: address.area || address.full,
        label: address.label || 'Saved',
        tag: address.tagged ?? 'other',
        lat: address.lat,
        lng: address.lng,
        isDefault: false,
      });
      addressId = String(created.data.address?._id ?? '');
      if (!addressId) throw new Error('Could not save the delivery address');
    }

    const placed = await httpPost<{
      order?: BackOrder;
      payment?: {
        id?: unknown;
        status?: string;
        method?: string;
        amount?: number;
        currency?: string;
      };
      handoff?: PaymentHandoff | null;
    }>('/orders', {
      addressId,
      // `card` is no longer offered: no card gateway is integrated.
      paymentMethod,
      note: '',
      customerPhone: extra.customerPhone,
      customerEmail: extra.customerEmail,
      idempotencyKey: extra.idempotencyKey,
    });
    const orderId = String(placed.data.order?._id ?? '');
    if (!orderId) throw new Error('Order was not created');

    const detail = await httpGet<{ order?: BackOrder }>(`/orders/${orderId}`);
    const raw = placed.data.payment;
    return {
      order: mapOrder(detail.data.order ?? ({} as BackOrder)),
      payment: {
        id: raw?.id ?? '',
        status: raw?.status ?? 'pending',
        method: raw?.method ?? paymentMethod,
        amount: raw?.amount ?? total,
        currency: raw?.currency ?? 'PKR',
      },
      // The server decides whether a redirect/form handoff is needed.
      handoff: placed.data.handoff ?? null,
    };
  },

  async getOrders(): Promise<Order[]> {
    const res = await httpGet<{ orders?: BackOrder[] }>('/orders');
    return (res.data.orders ?? []).map(mapOrder);
  },

  async trackOrder(id: string): Promise<Order> {
    const res = await httpGet<{ order?: BackOrder }>(`/orders/${id}`);
    if (!res.data.order) throw new Error('Order not found');
    return mapOrder(res.data.order);
  },

  /**
   * Customer cancel. The backend rejects anything past the cooking stage and
   * requires a reason (min 3 chars) — the same rules the panel enforces.
   */
  async cancelOrder(orderId: string, reason: string): Promise<void> {
    await httpPost(`/orders/${encodeURIComponent(orderId)}/cancel`, { reason });
  },

  /**
   * Live delivery tracking.
   *
   * The server decides whether a position may be returned: `trackingActive`
   * is false and `rider.location` is null once the order is delivered or
   * cancelled, so there is nothing for the client to accidentally leak.
   */
  async trackLive(id: string): Promise<OrderLiveTracking> {
    const res = await httpGet<{
      orderId?: string;
      orderNumber?: string;
      status?: string;
      trackingActive?: boolean;
      estimatedMinutes?: number;
      rider?: {
        id?: string;
        name?: string;
        phone?: string;
        avatarUrl?: string | null;
        location?: { lat?: number; lng?: number; heading?: number; updatedAt?: string } | null;
      } | null;
    }>(`/orders/${id}/track`);
    const d = res.data;
    return {
      orderId: d.orderId ?? id,
      status: (d.status ?? 'placed') as OrderStatus,
      trackingActive: Boolean(d.trackingActive),
      estimatedMinutes: d.estimatedMinutes ?? null,
      rider: d.rider
        ? {
            id: String(d.rider.id ?? ''),
            name: d.rider.name ?? 'Your rider',
            phone: d.rider.phone ?? '',
            avatarUrl: d.rider.avatarUrl ?? null,
            location:
              d.rider.location &&
              typeof d.rider.location.lat === 'number' &&
              typeof d.rider.location.lng === 'number'
                ? {
                    lat: d.rider.location.lat,
                    lng: d.rider.location.lng,
                    heading: d.rider.location.heading ?? 0,
                    updatedAt: d.rider.location.updatedAt ?? null,
                  }
                : null,
          }
        : null,
    };
  },
};

/**
 * Order-backed reviews. The backend verifies the purchase server-side (the
 * delivered order must belong to the caller), so passing `orderId` is what
 * marks the review verified; a duplicate submission answers 409 and the UI
 * treats that as "already rated".
 */
export const reviewApi = {
  async create(input: {
    targetType: 'restaurant' | 'food' | 'rider' | 'ride';
    targetId: string;
    rating: number;
    comment?: string;
    orderId?: string;
  }): Promise<void> {
    await httpPost('/reviews', input);
  },
};

// Ride requests: delivered live over Socket.IO on the backend (ride:request)
// and mirrored by GET /rides/available so riders who open the feed late still
// see the current pool.
type BackPopulatedUser = { _id?: string; name?: string } | string | null | undefined;

type BackAvailableRide = {
  _id: string;
  rideNumber?: string | null;
  customer?: BackPopulatedUser;
  type?: 'swat_moto' | 'swat_city' | 'swat_van';
  pickup?: { address?: string; area?: string | null } | null;
  dropoff?: { address?: string; area?: string | null } | null;
  distanceKm?: number;
  durationMin?: number;
  fare?: number;
  riderPayout?: number;
  createdAt?: string;
};

const RIDE_VEHICLE: Record<string, VehicleType> = {
  swat_moto: 'bike',
  swat_city: 'rickshaw',
  swat_van: 'van',
};

// Maps a backend ride document (GET /rides/available) into the feed item. The
// payout is whatever the server says (`riderPayout`); the 76% split here is
// only the fallback for responses created before that column existed.
const mapRideRequest = (r: BackAvailableRide): RideRequest => {
  const customer = typeof r.customer === 'string' ? undefined : r.customer;
  return {
    id: r._id,
    type: 'ride',
    pickup: r.pickup?.address ?? 'Pickup point',
    dropoff: r.dropoff?.address ?? 'Destination',
    distanceKm: Number(r.distanceKm ?? 0),
    durationMin: Number(r.durationMin ?? 0),
    fare: Number(r.fare ?? 0),
    payout: Number(r.riderPayout ?? Math.round(Number(r.fare ?? 0) * 0.76)),
    customerName: customer?.name ?? 'Customer',
    customerRating: 5,
    vehicle: RIDE_VEHICLE[r.type ?? 'swat_moto'] ?? 'bike',
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
  };
};

// Maps the ride:request socket payload broadcast when a customer books a ride.
type SocketRideRequest = {
  rideId: string;
  type?: 'swat_moto' | 'swat_city' | 'swat_van';
  pickup?: { address?: string; area?: string | null } | null;
  dropoff?: { address?: string; area?: string | null } | null;
  distanceKm?: number;
  durationMin?: number;
  fare?: number;
  createdAt?: string;
};

const mapSocketRideRequest = (r: SocketRideRequest): RideRequest => ({
  id: r.rideId,
  type: 'ride',
  pickup: r.pickup?.address ?? 'Pickup point',
  dropoff: r.dropoff?.address ?? 'Destination',
  distanceKm: Number(r.distanceKm ?? 0),
  durationMin: Number(r.durationMin ?? 0),
  fare: Number(r.fare ?? 0),
  payout: Number(Math.round(Number(r.fare ?? 0) * 0.76)),
  customerName: 'New request',
  customerRating: 5,
  vehicle: RIDE_VEHICLE[r.type ?? 'swat_moto'] ?? 'bike',
  createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
});

// Turns a ride:request socket payload into a feed item, or null when the
// payload is not a well-formed ride request (so a mis-fire never crashes the
// list renderer).
export const rideRequestFromSocket = (payload: unknown): RideRequest | null => {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as SocketRideRequest;
  if (typeof p.rideId !== 'string' || !p.rideId) return null;
  return mapSocketRideRequest(p);
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function buildEarningsDays(transactions: BackWalletTx[]): { day: string; amount: number }[] {
  const buckets = DAY_LABELS.map(() => 0);
  const now = Date.now();
  for (const tx of transactions) {
    const at = new Date(tx.createdAt ?? Date.now()).getTime();
    const daysAgo = Math.floor((now - at) / DAY);
    if (daysAgo >= 0 && daysAgo < 7 && (tx.type === 'earning' || tx.type === 'credit')) {
      const dow = new Date(at).getDay();
      const index = (dow + 6) % 7;
      buckets[index] += Number(tx.amount ?? 0);
    }
  }
  return DAY_LABELS.map((day, i) => ({ day, amount: buckets[i]! }));
}

export const riderFeedApi = {
  async getFeed(): Promise<DeliveryFeedItem[]> {
    const res = await httpGet<{ feed?: BackFeedItem[] }>('/rider/feed');
    return (res.data.feed ?? []).map(mapFeedItem);
  },

  async getRequests(): Promise<RideRequest[]> {
    const res = await httpGet<{ rides?: BackAvailableRide[] }>('/rides/available');
    return (res.data.rides ?? []).map(mapRideRequest);
  },

  async getEarnings(): Promise<{
    stats: RiderStats;
    period: RiderEarningsPeriod;
    days: { day: string; amount: number }[];
  }> {
    const res = await httpGet<{
      stats?: {
        rating?: number;
        completed?: number;
        acceptance?: number;
        satisfaction?: number;
        totalKm?: number;
      };
      period?: {
        label?: string;
        amount?: number;
        trips?: number;
        hoursOnline?: number;
        onTime?: number;
      };
      transactions?: BackWalletTx[];
    }>('/rider/earnings');
    return {
      stats: {
        rating: Number(res.data.stats?.rating ?? 0),
        completed: Number(res.data.stats?.completed ?? 0),
        acceptance: Number(res.data.stats?.acceptance ?? 0),
        satisfaction: Number(res.data.stats?.satisfaction ?? 0),
        totalKm: Number(res.data.stats?.totalKm ?? 0),
      },
      period: {
        label: res.data.period?.label ?? 'This week',
        amount: Number(res.data.period?.amount ?? 0),
        trips: Number(res.data.period?.trips ?? 0),
        hoursOnline: Number(res.data.period?.hoursOnline ?? 0),
        onTime: Number(res.data.period?.onTime ?? 0),
      },
      days: buildEarningsDays(res.data.transactions ?? []),
    };
  },
};

// ---------------------------------------------------------------------------
// Ride lifecycle (the trip a customer books or a rider accepts)
// ---------------------------------------------------------------------------

export type RideDetail = {
  id: string;
  rideNumber: string;
  status: string;
  type: RideType;
  vehicle: VehicleType;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  distanceKm: number;
  durationMin: number;
  /** Server-computed fare the customer pays. */
  fare: number;
  /** Server-computed share that lands in the rider's wallet on completion. */
  riderPayout: number;
  paymentMethod: string;
  cancelReason?: string;
  customer: { id: string; name: string; phone: string };
  rider: { id: string; name: string; phone: string; avatarUrl?: string | null } | null;
  createdAt: Date;
};

const mapRideDetail = (r: BackRide): RideDetail => {
  const customer = typeof r.customer === 'string' ? undefined : r.customer;
  return {
    id: String(r._id ?? ''),
    rideNumber: r.rideNumber ?? '',
    status: r.status ?? 'searching',
    type: (r.type ?? 'swat_city') as RideType,
    vehicle: RIDE_VEHICLE[r.vehicle ?? r.type ?? 'swat_city'] ?? 'bike',
    pickup: {
      address: r.pickup?.address ?? '',
      lat: Number(r.pickup?.lat ?? 0),
      lng: Number(r.pickup?.lng ?? 0),
    },
    dropoff: {
      address: r.dropoff?.address ?? '',
      lat: Number(r.dropoff?.lat ?? 0),
      lng: Number(r.dropoff?.lng ?? 0),
    },
    distanceKm: Number(r.distanceKm ?? 0),
    durationMin: Number(r.durationMin ?? 0),
    fare: Number(r.fare ?? 0),
    riderPayout: Number(r.riderPayout ?? 0),
    paymentMethod: r.paymentMethod ?? 'cash',
    cancelReason: r.cancelReason ?? undefined,
    customer: {
      id: customer?._id !== undefined ? String(customer._id) : String(r.customer ?? ''),
      name: customer?.name ?? 'Customer',
      phone: customer?.phone ?? '',
    },
    rider: r.rider && typeof r.rider === 'object'
      ? {
          id: String(r.rider._id ?? ''),
          name: r.rider.name ?? 'Your rider',
          phone: r.rider.phone ?? '',
          avatarUrl: r.rider.avatarUrl ?? null,
        }
      : null,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
  };
};

/**
 * The full ride lifecycle, driven by `RIDE_STATUSES` on the backend:
 * searching → accepted → arriving → started → completed (or cancelled).
 *
 * - `book` turns a confirmed route into a real ride and broadcasts it to riders.
 * - `detail` is the polling source for both customer and rider screens.
 * - `advance` is rider-only; the same endpoint also notifies the other side.
 * - `cancelCustomer` / `cancelRider` are role-gated by the server.
 */
export const rideApi = {
  /** Server-authoritative fare preview for a route (auth required). */
  async estimate(input: {
    type: RideType;
    pickup: { lat: number; lng: number };
    dropoff: { lat: number; lng: number };
  }) {
    const res = await httpPost<{
      type?: string;
      vehicle?: string;
      distanceKm?: number;
      durationMin?: number;
      baseFare?: number;
      distanceFare?: number;
      fare?: number;
    }>('/rides/estimate', input);
    return {
      distanceKm: Number(res.data.distanceKm ?? 0),
      durationMin: Number(res.data.durationMin ?? 0),
      fare: Number(res.data.fare ?? 0),
    };
  },

  /** Creates the ride (fare computed server-side) and broadcasts ride:request. */
  async book(input: {
    type: RideType;
    pickup: { address: string; lat: number; lng: number };
    dropoff: { address: string; lat: number; lng: number };
    paymentMethod?: 'cash' | 'wallet';
  }): Promise<RideDetail> {
    const res = await httpPost<{ ride?: BackRide }>('/rides', input);
    if (!res.data.ride) throw new Error('Ride was not created');
    return mapRideDetail(res.data.ride);
  },

  /** Poll-friendly ride detail (also carries fresh rider/customer data). */
  async detail(id: string): Promise<RideDetail> {
    const res = await httpGet<{ ride?: BackRide }>(`/rides/${id}`);
    if (!res.data.ride) throw new Error('Ride not found');
    return mapRideDetail(res.data.ride);
  },

  /** Rider-only: move the ride along (arriving → started → completed). */
  async advance(id: string, status: 'arriving' | 'started' | 'completed'): Promise<RideDetail> {
    const res = await httpPatch<{ ride?: BackRide }>(`/rides/${id}/status`, { status });
    if (!res.data.ride) throw new Error('Ride status could not be updated');
    return mapRideDetail(res.data.ride);
  },

  /** Customer cancels their own ride before it completes. */
  async cancelCustomer(id: string, reason: string): Promise<void> {
    await httpPost(`/rides/${id}/cancel`, { reason });
  },

  /** Rider drops an accepted ride (before starting it). */
  async cancelRider(id: string, reason: string): Promise<void> {
    await httpPost(`/rides/${id}/cancel-rider`, { reason });
  },
};

// ---------------------------------------------------------------------------
// Rider delivery jobs (the food leg, served by /rider/jobs)
// ---------------------------------------------------------------------------

export type RiderJobOrder = {
  id: string;
  orderNumber: string;
  status: string;
  restaurant: { name: string; emoji?: string; area?: string; address?: string };
  dropoff: string;
  dropoffLat: number;
  dropoffLng: number;
  customer: { name: string; phone: string };
  itemNames: string[];
  itemCount: number;
  distanceKm: number;
  durationMin: number;
  payout: number;
  total: number;
  createdAt: Date;
};

type BackRiderJobOrder = {
  _id?: unknown;
  orderNumber?: string;
  status?: string;
  items?: { name?: string; quantity?: number }[];
  distanceKm?: number;
  estimatedMinutes?: number;
  riderPayout?: number;
  total?: number;
  addressSnapshot?: { full?: string; lat?: number | null; lng?: number | null };
  customer?: { name?: string; phone?: string } | string | null;
  restaurant?:
    | { name?: string; emoji?: string; area?: string; addressLine?: string }
    | string
    | null;
  createdAt?: string | Date;
};

const mapRiderJobOrder = (o: BackRiderJobOrder): RiderJobOrder => {
  const restaurant = typeof o.restaurant === 'object' && o.restaurant ? o.restaurant : undefined;
  const customer = typeof o.customer === 'object' && o.customer ? o.customer : undefined;
  return {
    id: String(o._id ?? ''),
    orderNumber: o.orderNumber ?? '',
    status: o.status ?? 'rider_assigned',
    restaurant: {
      name: restaurant?.name ?? 'Restaurant',
      emoji: restaurant?.emoji,
      area: restaurant?.area,
      address: restaurant?.addressLine,
    },
    dropoff: o.addressSnapshot?.full ?? '',
    dropoffLat: Number(o.addressSnapshot?.lat ?? 0),
    dropoffLng: Number(o.addressSnapshot?.lng ?? 0),
    customer: { name: customer?.name ?? 'Customer', phone: customer?.phone ?? '' },
    itemNames: (o.items ?? []).map((i) => i.name ?? ''),
    itemCount: (o.items ?? []).reduce((s, i) => s + Number(i.quantity ?? 1), 0),
    distanceKm: Number(o.distanceKm ?? 0),
    durationMin: Number(o.estimatedMinutes ?? 0),
    payout: Number(o.riderPayout ?? 0),
    total: Number(o.total ?? 0),
    createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
  };
};

/** Active delivery jobs: orders assigned to this rider + rides in progress. */
export const jobApi = {
  /** Poll-friendly snapshot of everything the rider currently owns. */
  async jobs(): Promise<{ orders: RiderJobOrder[]; rides: RideDetail[] }> {
    const res = await httpGet<{ orders?: BackRiderJobOrder[]; rides?: BackRide[] }>('/rider/jobs');
    return {
      orders: (res.data.orders ?? []).map(mapRiderJobOrder),
      rides: (res.data.rides ?? []).map(mapRideDetail),
    };
  },

  /** Accepts a ready food order from the pickup pool. */
  async acceptFood(orderId: string): Promise<void> {
    await httpPost('/rider/jobs/accept', { orderId });
  },

  /** Advances the delivery leg: picked_up → on_the_way → delivered. */
  async updateDelivery(
    orderId: string,
    status: 'picked_up' | 'on_the_way' | 'delivered',
  ): Promise<void> {
    await httpPost('/rider/jobs/delivery', { orderId, status });
  },
};

// Real ride acceptance (rider side). An accept must actually claim the ride on
// the server, so there is no fallback. The claimed ride comes back so the
// caller can hand its id to the active-delivery screen.
export const acceptRide = async (rideId: string): Promise<RideDetail> => {
  const res = await httpPost<{ ride?: BackRide }>('/rides/accept', { rideId });
  if (!res.data.ride) throw new Error('Ride could not be accepted');
  return mapRideDetail(res.data.ride);
};

export const walletApi = async (): Promise<{ balance: number; transactions: WalletTx[] }> => {
  const res = await httpGet<{ wallet?: { balance?: number }; transactions?: BackWalletTx[] }>(
    '/wallet/transactions',
  );
  return {
    balance: Number(res.data.wallet?.balance ?? 0),
    transactions: (res.data.transactions ?? []).map(mapWalletTx),
  };
};

// Wallet-to-wallet transfer by recipient phone. No fallback — a fake success
// here would silently pretend funds moved.
export const walletTransfer = async (phone: string, amount: number): Promise<number> => {
  const res = await httpPost<{ wallet?: { balance?: number } }>('/wallet/transfer', {
    phone,
    amount,
  });
  return Number(res.data.wallet?.balance ?? 0);
};

// Rider cash deposit: logs COD cash collected on deliveries into earnings.
export const walletCashIn = async (amount: number): Promise<number> => {
  const res = await httpPost<{ wallet?: { balance?: number } }>('/wallet/cash-in', { amount });
  return Number(res.data.wallet?.balance ?? 0);
};

// ---------------------------------------------------------------------------
// Wallet top-up (Easypaisa MA) + rider withdrawals
// ---------------------------------------------------------------------------

export type WalletTopup = {
  id: string;
  status: string;
  method?: string;
  amount: number;
  currency?: string;
  transactionRef?: string;
  gatewayRef?: string | null;
  failureReason?: string | null;
};

type BackWithdrawal = {
  _id?: unknown;
  reference?: string;
  amount?: number;
  status?: string;
  destinationType?: string;
  destination?: string;
  destinationHolder?: string;
  rejectReason?: string | null;
  payoutReference?: string | null;
  createdAt?: string | Date;
};

export type WalletWithdrawal = {
  id: string;
  reference: string;
  amount: number;
  status: 'pending' | 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled';
  destinationType: 'easypaisa' | 'bank';
  destination: string;
  destinationHolder: string;
  rejectReason?: string;
  payoutReference?: string;
  createdAt: Date;
};

const mapTopup = (p: unknown): WalletTopup => {
  const raw = (p ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? raw._id ?? ''),
    status: String(raw.status ?? 'pending'),
    method: raw.method ? String(raw.method) : undefined,
    amount: Number(raw.amount ?? 0),
    currency: raw.currency ? String(raw.currency) : undefined,
    transactionRef: raw.transactionRef ? String(raw.transactionRef) : undefined,
    gatewayRef: raw.gatewayRef != null ? String(raw.gatewayRef) : null,
    failureReason: raw.failureReason != null ? String(raw.failureReason) : null,
  };
};

const mapWithdrawal = (w: BackWithdrawal): WalletWithdrawal => ({
  id: String(w._id ?? ''),
  reference: w.reference ?? '',
  amount: Number(w.amount ?? 0),
  status: (w.status ?? 'pending') as WalletWithdrawal['status'],
  destinationType: w.destinationType === 'bank' ? 'bank' : 'easypaisa',
  destination: w.destination ?? '',
  destinationHolder: w.destinationHolder ?? '',
  rejectReason: w.rejectReason ?? undefined,
  payoutReference: w.payoutReference ?? undefined,
  createdAt: new Date(w.createdAt ?? Date.now()),
});

export const topupIdempotencyKey = (): string =>
  `topup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Creates the top-up payment + gateway initiation. Money paths never use demo
// fallback — a fake "paid" here would pretend real funds landed.
export const walletTopupCreate = async (
  amount: number,
  customerPhone?: string,
  idempotencyKey?: string,
): Promise<{ configured: boolean; message?: string; payment: WalletTopup | null }> => {
  const res = await httpPost<{ configured?: boolean; message?: string; payment?: unknown }>(
    '/wallet/topup',
    {
      amount,
      customerPhone,
      idempotencyKey,
    },
  );
  return {
    configured: Boolean(res.data.configured ?? true),
    message: res.data.message,
    payment: res.data.payment ? mapTopup(res.data.payment) : null,
  };
};

export const walletTopupVerify = async (
  paymentId?: string,
): Promise<{ payment: WalletTopup | null; result: { status: string; reason?: string } }> => {
  const res = await httpPost<{ payment?: unknown; result?: { status?: string; reason?: string } }>(
    '/wallet/topup/verify',
    { paymentId },
  );
  return {
    payment: res.data.payment ? mapTopup(res.data.payment) : null,
    result: { status: res.data.result?.status ?? 'pending', reason: res.data.result?.reason },
  };
};

export const walletTopupStatus = async (): Promise<{
  payment: WalletTopup | null;
  balance: number;
}> => {
  const res = await httpGet<{ payment?: unknown; wallet?: { balance?: number } }>(
    '/wallet/topup/status',
  );
  return {
    payment: res.data.payment ? mapTopup(res.data.payment) : null,
    balance: Number(res.data.wallet?.balance ?? 0),
  };
};

// Rider withdrawal request — reserves the amount server-side.
export const withdrawalRequest = async (input: {
  amount: number;
  destinationType: 'easypaisa' | 'bank';
  destination: string;
  destinationHolder: string;
  note?: string;
}): Promise<void> => {
  await httpPost('/wallet/withdraw', input);
};

export const withdrawalsMine = async (): Promise<{
  withdrawals: WalletWithdrawal[];
  pendingAmount: number;
  totalWithdrawn: number;
}> => {
  const res = await httpGet<{
    withdrawals?: BackWithdrawal[];
    pendingAmount?: number;
    totalWithdrawn?: number;
  }>('/wallet/withdrawals');
  return {
    withdrawals: (res.data.withdrawals ?? []).map(mapWithdrawal),
    pendingAmount: Number(res.data.pendingAmount ?? 0),
    totalWithdrawn: Number(res.data.totalWithdrawn ?? 0),
  };
};

export const cancelWithdrawal = async (id: string): Promise<void> => {
  await httpPost(`/wallet/withdrawals/${encodeURIComponent(id)}/cancel`);
};

export const favoriteApi = {
  async get(): Promise<Favorite[]> {
    const res = await httpGet<{ favorites?: BackFavorite[] }>('/customer/favorites');
    return (res.data.favorites ?? []).map(mapFavorite);
  },

  /** Removes a saved favorite. The backend fixture id is the favorite row id. */
  async remove(id: string): Promise<void> {
    await httpDelete(`/customer/favorites/${encodeURIComponent(id)}`);
  },
};

export const notificationApi = {
  async get(): Promise<AppNotification[]> {
    const res = await httpGet<{ notifications?: BackNotification[] }>('/notifications');
    return (res.data.notifications ?? []).map(mapNotification);
  },

  async markAllRead(): Promise<void> {
    await httpPost('/notifications/mark-all-read', {});
  },
};

export const activityApi = {
  async get(): Promise<ActivityItem[]> {
    const res = await httpGet<{ activities?: BackActivity[] }>('/customer/activities');
    return (res.data.activities ?? []).map(mapActivity);
  },
};

export function estimateFare(km: number, rideType: RideType = 'swat_city'): number {
  const fare = FARE_DEFAULTS[rideType] ?? FARE_DEFAULTS.swat_city;
  return Math.round((fare.base + fare.perKm * km) / 10) * 10;
}

export function riderPayout(fare: number): number {
  return Math.round(fare * 0.76);
}
