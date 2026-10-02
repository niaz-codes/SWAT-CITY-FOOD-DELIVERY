export type Role = 'customer' | 'rider' | 'admin';

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  avatarGradient: [string, string];
  verified: boolean;
};

export type Address = {
  id: string;
  label: string;
  full: string;
  area: string;
  lat: number;
  lng: number;
  tagged?: 'home' | 'work' | 'frequent';
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviews: number;
  deliveryTimeMin: number;
  deliveryFee: number;
  minOrder: number;
  deliveryKM: number;
  freeDelivery: boolean;
  promo?: string;
  category: string;
  gradient: [string, string];
  emoji: string;
  featured?: boolean;
  tags: string[];
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  rating: number;
  calories: number;
  prepMin: number;
  popular?: boolean;
  gradient: [string, string];
  emoji: string;
};

export type CartItem = {
  menuItem: MenuItem;
  restaurantId: string;
  quantity: number;
  specialInstructions?: string;
};

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export type Order = {
  id: string;
  type: 'food' | 'ride';
  restaurantName: string;
  restaurantEmoji: string;
  restaurantGradient: [string, string];
  items: CartItem[];
  status: OrderStatus;
  total: number;
  deliveryFee: number;
  distanceKm: number;
  placedAt: Date;
  estimatedMinutes: number;
  rider?: Rider;
  address: string;
};

export type RiderStatus = 'online' | 'offline' | 'busy';

export type Rider = {
  id: string;
  name: string;
  phone: string;
  rating: number;
  trips: number;
  vehicle: string;
  plateNumber: string;
  status: RiderStatus;
  avatarGradient: [string, string];
  etaMin: number;
  lat: number;
  lng: number;
};

export type VehicleType = 'bike' | 'rickshaw' | 'sedan' | 'van';

export type RideType = 'swat_moto' | 'swat_city' | 'swat_van';

export type RideFare = {
  rideType: RideType;
  vehicle: VehicleType;
  label: string;
  capacity: string;
  etaMin: number;
  base: number;
  perKm: number;
  icon: string;
};

export type RideRequest = {
  id: string;
  type: 'ride' | 'food';
  pickup: string;
  dropoff: string;
  distanceKm: number;
  durationMin: number;
  fare: number;
  customerName: string;
  customerRating: number;
  vehicle: VehicleType;
  createdAt: Date;
};

export type RideFlow = {
  id: string;
  status: 'searching' | 'assigned' | 'arriving' | 'in_progress' | 'completed';
  rideType: RideType;
  fare: number;
  distanceKm: number;
  durationMin: number;
  pickup: string;
  dropoff: string;
};

export type ActivityItem = {
  id: string;
  kind: 'food' | 'ride' | 'payment';
  title: string;
  subtitle: string;
  amount?: number;
  at: Date;
  status: string;
};

export type WalletTx = {
  id: string;
  kind: 'credit' | 'debit';
  title: string;
  subtitle: string;
  amount: number;
  at: Date;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  at: Date;
  read: boolean;
  kind: 'order' | 'ride' | 'promo' | 'system';
};

export type FavoriteKind = 'restaurant' | 'food';

export type Favorite = {
  id: string;
  kind: FavoriteKind;
  refId: string;
  name: string;
  subtitle: string;
  rating: number;
  price?: number;
  gradient: [string, string];
  emoji: string;
  savedAt: Date;
};

export type RiderEarningsPeriod = {
  label: string;
  amount: number;
  trips: number;
  hoursOnline: number;
  onTime: number;
};

export type RiderStats = {
  rating: number;
  completed: number;
  acceptance: number;
  satisfaction: number;
  totalKm: number;
};

export type DeliveryFeedItem = {
  id: string;
  kind: 'ride' | 'food';
  pickup: string;
  dropoff: string;
  distanceKm: number;
  durationMin: number;
  payout: number;
  restaurantEmoji?: string;
  restaurantGradient?: [string, string];
  createdAt: Date;
};