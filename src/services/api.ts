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
  Restaurant,
  RideRequest,
  Rider,
  RiderEarningsPeriod,
  RiderStats,
  RideFare,
  User,
  WalletTx,
  RideType,
} from '../types/domain';
import { API_BASE_URL, httpGet, httpPost, setApiTokens, isNetworkError } from './client';

export { API_BASE_URL };

const SESSION_KEY = '@swat/session';

const delay = (ms = 700) => new Promise<void>((resolve) => setTimeout(resolve, ms + Math.random() * 500));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const CURRENT_USER: User = {
  id: 'u_001',
  name: 'Ahmad Khan',
  email: 'ahmad@example.com',
  phone: '0345 1234567',
  role: 'customer',
  avatarGradient: ['#0E9488', '#0E3F3A'],
  verified: true,
};

export const RIDER_PROFILE: User = {
  id: 'r_001',
  name: 'Shahid Rehman',
  email: 'shahid@example.com',
  phone: '0340 5551122',
  role: 'rider',
  avatarGradient: ['#1B84B5', '#0E3F3A'],
  verified: true,
};

export const ADMIN_PHONE = '03001112222';

export const ADMIN_USER: User = {
  id: 'adm_001',
  name: 'Swat Admin',
  email: 'admin@swatcity.pk',
  phone: ADMIN_PHONE,
  role: 'admin',
  avatarGradient: ['#0E9488', '#7B2CBF'],
  verified: true,
};

// ---------------------------------------------------------------------------
// Reference locations (Swat Valley)
// ---------------------------------------------------------------------------

export const PLACES: Address[] = [
  {
    id: 'p_home',
    label: 'Home',
    full: 'House 42, Green View Colony, Main Mingora Road',
    area: 'Mingora',
    lat: 34.7802,
    lng: 72.3625,
    tagged: 'home',
  },
  {
    id: 'p_work',
    label: 'Saidu Teaching Hospital',
    full: 'Hospital Road, Saidu Sharif',
    area: 'Saidu Sharif',
    lat: 34.7362,
    lng: 72.3567,
    tagged: 'work',
  },
  {
    id: 'p_fizagat',
    label: 'Fizagat Park',
    full: 'Fizagat Public Park, Swat River Banks',
    area: 'Mingora',
    lat: 34.793,
    lng: 72.369,
    tagged: 'frequent',
  },
  {
    id: 'p_bahrain',
    label: 'Bahrain Bridge',
    full: 'Bahrain Bazaar, Kalam Road',
    area: 'Bahrain',
    lat: 35.2077,
    lng: 72.5477,
    tagged: 'frequent',
  },
  {
    id: 'p_school',
    label: 'Swat Public School',
    full: 'Gulshan Colony, Saidu Sharif Road',
    area: 'Mingora',
    lat: 34.7651,
    lng: 72.3633,
  },
];

export const SAVED_ADDRESSES: Address[] = [PLACES[0]!, PLACES[1]!, PLACES[2]!, PLACES[3]!];

// ---------------------------------------------------------------------------
// Restaurants & menu (reference data + offline fallback)
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  'All',
  'BBQ',
  'Karahi',
  'Biryani & Pulao',
  'Fast Food',
  'Pizza',
  'Trout & Grill',
  'Desserts',
  'Drinks',
] as const;

export const RESTAURANTS: Restaurant[] = [
  {
    id: 'rest_01',
    name: 'Swat Grill House',
    cuisine: 'BBQ • Charcoal',
    rating: 4.8,
    reviews: 1214,
    deliveryTimeMin: 32,
    deliveryFee: 60,
    minOrder: 300,
    deliveryKM: 2.1,
    freeDelivery: true,
    promo: 'Free delivery over Rs 800',
    category: 'BBQ',
    gradient: ['#C73E3E', '#5E1212'],
    emoji: '🔥',
    featured: true,
    tags: ['Seekh Kabab', 'Chapli', 'Desi'],
  },
  {
    id: 'rest_02',
    name: 'Swati Karahi Khana',
    cuisine: 'Karahi • Traditional',
    rating: 4.7,
    reviews: 876,
    deliveryTimeMin: 38,
    deliveryFee: 80,
    minOrder: 400,
    deliveryKM: 1.4,
    freeDelivery: false,
    promo: '10% off first order',
    category: 'Karahi',
    gradient: ['#8C3D2F', '#3C120C'],
    emoji: '🍲',
    featured: true,
    tags: ['Chicken Karahi', 'Desi Ghee'],
  },
  {
    id: 'rest_03',
    name: 'Chowkara Chapli House',
    cuisine: 'Chapli Kabab • Swat Special',
    rating: 4.9,
    reviews: 2043,
    deliveryTimeMin: 30,
    deliveryFee: 50,
    minOrder: 250,
    deliveryKM: 0.9,
    freeDelivery: true,
    promo: '2nd Chapli at half price',
    category: 'BBQ',
    gradient: ['#B05E1F', '#54250A'],
    emoji: '🥩',
    featured: true,
    tags: ['Chapli Kabab', 'Mutton'],
  },
  {
    id: 'rest_04',
    name: 'Trout Point Cafe',
    cuisine: 'Trout • Continental',
    rating: 4.6,
    reviews: 654,
    deliveryTimeMin: 44,
    deliveryFee: 90,
    minOrder: 500,
    deliveryKM: 5.2,
    freeDelivery: false,
    category: 'Trout & Grill',
    gradient: ['#2B7A78', '#0B3B39'],
    emoji: '🐟',
    tags: ['Grilled Trout', 'Cafe'],
  },
  {
    id: 'rest_05',
    name: 'Malaman Zinger Hut',
    cuisine: 'Fast Food • Snacks',
    rating: 4.4,
    reviews: 938,
    deliveryTimeMin: 26,
    deliveryFee: 40,
    minOrder: 200,
    deliveryKM: 1.1,
    freeDelivery: true,
    promo: 'Zinger + Drink combo',
    category: 'Fast Food',
    gradient: ['#C0560F', '#572C05'],
    emoji: '🍗',
    tags: ['Zinger Burger', 'Combo'],
  },
  {
    id: 'rest_06',
    name: 'Dastarkhwan Biryani',
    cuisine: 'Biryani • Pulao',
    rating: 4.5,
    reviews: 1502,
    deliveryTimeMin: 34,
    deliveryFee: 50,
    minOrder: 350,
    deliveryKM: 1.8,
    freeDelivery: true,
    promo: 'Family deal · serves 4',
    category: 'Biryani & Pulao',
    gradient: ['#7A3B10', '#351603'],
    emoji: '🍛',
    featured: true,
    tags: ['Chicken Biryani', 'Pulao'],
  },
  {
    id: 'rest_07',
    name: 'Kalam Valley Pizza Co.',
    cuisine: 'Pizza • Wings',
    rating: 4.3,
    reviews: 512,
    deliveryTimeMin: 28,
    deliveryFee: 60,
    minOrder: 400,
    deliveryKM: 2.6,
    freeDelivery: false,
    category: 'Pizza',
    gradient: ['#955B1D', '#422707'],
    emoji: '🍕',
    tags: ['Chicken Tikka', 'Ranch'],
  },
  {
    id: 'rest_08',
    name: 'Shringar Sweets & Desserts',
    cuisine: 'Desserts • Halwai',
    rating: 4.7,
    reviews: 421,
    deliveryTimeMin: 22,
    deliveryFee: 30,
    minOrder: 150,
    deliveryKM: 1.0,
    freeDelivery: true,
    category: 'Desserts',
    gradient: ['#8B3A63', '#300F28'],
    emoji: '🍮',
    tags: ['Gajar Halwa', 'Kheer'],
  },
];

export const MENU: Record<string, MenuItem[]> = {
  rest_01: [
    { id: 'm_011', restaurantId: 'rest_01', name: 'Seekh Kabab (Half Dozen)', description: 'Charcoal-grilled beef seekh kababs with mint chutney, naan and onions.', price: 480, category: 'BBQ', rating: 4.8, calories: 610, prepMin: 18, popular: true, gradient: ['#B8402E', '#4E1008'], emoji: '🍢' },
    { id: 'm_012', restaurantId: 'rest_01', name: 'Chapli Kabab (Single)', description: 'Flat minced mutton kabab cooked in desi ghee, tamarind chutney.', price: 240, category: 'BBQ', rating: 4.9, calories: 540, prepMin: 15, popular: true, gradient: ['#A8441D', '#4A1403'], emoji: '🥙' },
    { id: 'm_013', restaurantId: 'rest_01', name: 'Malai Boti (8 pcs)', description: 'Cream-marinated chicken thighs, charred on slow fire.', price: 520, category: 'BBQ', rating: 4.7, calories: 580, prepMin: 20, gradient: ['#C53F3F', '#4E0F0F'], emoji: '🍗' },
    { id: 'm_014', restaurantId: 'rest_01', name: 'Special Handi', description: 'Bone-in mutton cooked on dum, butter and green chilli.', price: 980, category: 'Handi', rating: 4.8, calories: 720, prepMin: 28, gradient: ['#8C3B1F', '#391006'], emoji: '🍲' },
  ],
  rest_02: [
    { id: 'm_021', restaurantId: 'rest_02', name: 'Chicken Karahi (Half)', description: 'Fresh tomatoes, ginger and green chillies, desi ghee.', price: 850, category: 'Karahi', rating: 4.8, calories: 680, prepMin: 25, popular: true, gradient: ['#93341D', '#3C0F05'], emoji: '🍲' },
    { id: 'm_022', restaurantId: 'rest_02', name: 'Namkeen Gosht', description: 'Slow-cooked mutton with makhana and brown onions.', price: 1050, category: 'Karahi', rating: 4.9, calories: 740, prepMin: 30, gradient: ['#6E3A17', '#2B0E03'], emoji: '🍖' },
    { id: 'm_023', restaurantId: 'rest_02', name: 'Daal Chawal (Plate)', description: 'Sada daal, steamed rice, onion and lemon wedge.', price: 320, category: 'Thali', rating: 4.5, calories: 520, prepMin: 12, gradient: ['#B57A22', '#4E2B05'], emoji: '🍚' },
    { id: 'm_024', restaurantId: 'rest_02', name: 'Roghni Naan', description: 'Buttered naan baked in tandoor, sesame crust.', price: 90, category: 'Bakery', rating: 4.6, calories: 240, prepMin: 8, gradient: ['#C08A2A', '#5C3406'], emoji: '🫓' },
  ],
  rest_03: [
    { id: 'm_031', restaurantId: 'rest_03', name: 'Swat Chapli Kabab', description: '2 flat kababs, pomegranate seeds, tomatoes, onion rings.', price: 380, category: 'BBQ', rating: 4.9, calories: 590, prepMin: 16, popular: true, gradient: ['#B8601E', '#542007'], emoji: '🥙' },
    { id: 'm_032', restaurantId: 'rest_03', name: 'Mutton Chapli (With Naan)', description: '1 jumbo chapli with roghni naan and chutney.', price: 320, category: 'BBQ', rating: 4.8, calories: 650, prepMin: 18, gradient: ['#A3481C', '#451503'], emoji: '🍖' },
    { id: 'm_033', restaurantId: 'rest_03', name: 'Chapli Burger', description: 'Chapli patty, spicy mayo, fresh slaw in a toasted bun.', price: 290, category: 'Fast Food', rating: 4.7, calories: 620, prepMin: 12, gradient: ['#C0660E', '#5A2A03'], emoji: '🍔' },
    { id: 'm_034', restaurantId: 'rest_03', name: 'Peshawar Nalli Soup', description: 'Bone marrow broth with coriander and lemon.', price: 260, category: 'Soup', rating: 4.6, calories: 380, prepMin: 14, gradient: ['#7A5C14', '#2F1F03'], emoji: '🍜' },
  ],
  rest_04: [
    { id: 'm_041', restaurantId: 'rest_04', name: 'Grilled Trout (Whole)', description: 'Swat river trout, herbs and lemon butter, served with fries.', price: 950, category: 'Trout & Grill', rating: 4.9, calories: 590, prepMin: 26, popular: true, gradient: ['#1F6F68', '#0A2E2B'], emoji: '🐟' },
    { id: 'm_042', restaurantId: 'rest_04', name: 'Trout Tikka', description: 'Smoky river trout pieces with garlic mayo.', price: 720, category: 'Trout & Grill', rating: 4.7, calories: 520, prepMin: 22, gradient: ['#2D7A6B', '#0C332A'], emoji: '🐠' },
    { id: 'm_043', restaurantId: 'rest_04', name: 'Grape-Juice Chicken', description: 'Chicken in kata-turs banana grape glaze.', price: 680, category: 'Grill', rating: 4.6, calories: 610, prepMin: 24, gradient: ['#7A3B6B', '#320E2B'], emoji: '🍗' },
  ],
  rest_05: [
    { id: 'm_051', restaurantId: 'rest_05', name: 'Zinger Burger Meal', description: 'Crispy zinger, fries and a cold drink.', price: 420, category: 'Fast Food', rating: 4.6, calories: 780, prepMin: 14, popular: true, gradient: ['#C2570F', '#59270A'], emoji: '🍔' },
    { id: 'm_052', restaurantId: 'rest_05', name: 'Crispy Fries (Large)', description: 'Sea-salted fries with chilli flakes.', price: 180, category: 'Snacks', rating: 4.4, calories: 420, prepMin: 8, gradient: ['#C08A2A', '#5C3406'], emoji: '🍟' },
    { id: 'm_053', restaurantId: 'rest_05', name: 'Chicken Nuggets (10)', description: 'Crispy tender bites with BBQ dip.', price: 320, category: 'Fast Food', rating: 4.5, calories: 540, prepMin: 10, gradient: ['#B87717', '#55310A'], emoji: '🍗' },
    { id: 'm_054', restaurantId: 'rest_05', name: 'Cold Drink (500ml)', description: 'Chilled cola or lemon-lime.', price: 120, category: 'Drinks', rating: 4.2, calories: 210, prepMin: 2, gradient: ['#2B7FA8', '#0D2F42'], emoji: '🥤' },
  ],
  rest_06: [
    { id: 'm_061', restaurantId: 'rest_06', name: 'Chicken Biryani (Single)', description: 'Roasted-chicken biryani with raita and salad.', price: 340, category: 'Biryani', rating: 4.7, calories: 690, prepMin: 18, popular: true, gradient: ['#8C4B10', '#3A1D02'], emoji: '🍛' },
    { id: 'm_062', restaurantId: 'rest_06', name: 'Family Biryani (Serves 4)', description: 'Jumbo portion with extra chicken, two raitas.', price: 1100, category: 'Biryani', rating: 4.8, calories: 690, prepMin: 30, gradient: ['#7A3B10', '#301702'], emoji: '🥘' },
    { id: 'm_063', restaurantId: 'rest_06', name: 'Mutton Pulao (Single)', description: 'Fragrant basmati with tender mutton chunks.', price: 450, category: 'Pulao', rating: 4.6, calories: 720, prepMin: 22, gradient: ['#8A6A1F', '#3A2C04'], emoji: '🍚' },
    { id: 'm_064', restaurantId: 'rest_06', name: 'Shahi Raita', description: 'Cream raita with cucumber and boondi.', price: 150, category: 'Sides', rating: 4.5, calories: 220, prepMin: 5, gradient: ['#3E9489', '#123F3A'], emoji: '🥣' },
  ],
  rest_07: [
    { id: 'm_071', restaurantId: 'rest_07', name: 'Chicken Tikka Pizza (Medium)', description: '14", tandoori chicken, onion, green capsicum, mozzarella.', price: 780, category: 'Pizza', rating: 4.5, calories: 980, prepMin: 24, popular: true, gradient: ['#9A5A1D', '#422505'], emoji: '🍕' },
    { id: 'm_072', restaurantId: 'rest_07', name: 'Fajita Ranch Pizza', description: 'Grilled chicken fajita, jalapenos, ranch drizzle.', price: 830, category: 'Pizza', rating: 4.6, calories: 1020, prepMin: 26, gradient: ['#8A4A1C', '#381D04'], emoji: '🍕' },
    { id: 'm_073', restaurantId: 'rest_07', name: 'Crispy Wings (8 pcs)', description: 'Spicy peri-peri glaze with cooling dip.', price: 460, category: 'Wings', rating: 4.4, calories: 540, prepMin: 16, gradient: ['#A8471C', '#461404'], emoji: '🍗' },
    { id: 'm_074', restaurantId: 'rest_07', name: 'Garlic Bread', description: 'Buttered garlic herb bread with cheese pull.', price: 260, category: 'Sides', rating: 4.5, calories: 410, prepMin: 12, gradient: ['#B8831B', '#5C3404'], emoji: '🍞' },
  ],
  rest_08: [
    { id: 'm_081', restaurantId: 'rest_08', name: 'Gajar ka Halwa', description: 'Slow-cooked carrot halwa with desi ghee and nuts.', price: 220, category: 'Desserts', rating: 4.9, calories: 480, prepMin: 10, popular: true, gradient: ['#B3543A', '#52160C'], emoji: '🥕' },
    { id: 'm_082', restaurantId: 'rest_08', name: 'Kheer (Half Kg)', description: 'Rice kheer with khoya and pistachio.', price: 350, category: 'Desserts', rating: 4.7, calories: 450, prepMin: 8, gradient: ['#8A7A15', '#3D3405'], emoji: '🍮' },
    { id: 'm_083', restaurantId: 'rest_08', name: 'Jalebi (Half Dozen)', description: 'Fresh, crunchy orange spirals in syrup.', price: 160, category: 'Desserts', rating: 4.6, calories: 380, prepMin: 6, gradient: ['#C07A12', '#633703'], emoji: '🥮' },
    { id: 'm_084', restaurantId: 'rest_08', name: 'Kashmiri Chai (2 Cups)', description: 'Pink tea with cardamom and crushed nuts.', price: 240, category: 'Drinks', rating: 4.8, calories: 260, prepMin: 12, gradient: ['#C2547B', '#5E0F2C'], emoji: '🫖' },
  ],
};

export const POPULAR_ITEMS: MenuItem[] = [
  MENU.rest_03![0]!,
  MENU.rest_01![0]!,
  MENU.rest_06![0]!,
  MENU.rest_02![0]!,
  MENU.rest_05![0]!,
  MENU.rest_04![0]!,
];

export const RIDERS: Rider[] = [
  {
    id: 'rider_01',
    name: 'Shahid Rehman',
    phone: '0340 5551122',
    rating: 4.9,
    trips: 1286,
    vehicle: 'Honda CG 125',
    plateNumber: 'SWT-8321',
    status: 'online',
    avatarGradient: ['#1B84B5', '#0E3F3A'],
    etaMin: 5,
    lat: PLACES[0]!.lat + 0.004,
    lng: PLACES[0]!.lng + 0.003,
  },
  {
    id: 'rider_02',
    name: 'Bilal Wazir',
    phone: '0341 9048211',
    rating: 4.8,
    trips: 942,
    vehicle: 'Skygo 150',
    plateNumber: 'SWT-5510',
    status: 'online',
    avatarGradient: ['#7A3B8C', '#2B0E35'],
    etaMin: 7,
    lat: PLACES[1]!.lat + 0.005,
    lng: PLACES[1]!.lng - 0.004,
  },
  {
    id: 'rider_03',
    name: 'Imran Afridi',
    phone: '0345 4021930',
    rating: 4.7,
    trips: 762,
    vehicle: 'United US150',
    plateNumber: 'MGL-2214',
    status: 'online',
    avatarGradient: ['#B05E1F', '#54250A'],
    etaMin: 9,
    lat: PLACES[4]!.lat - 0.006,
    lng: PLACES[4]!.lng + 0.006,
  },
];

// ---------------------------------------------------------------------------
// Rides
// ---------------------------------------------------------------------------

export const RIDE_FARES: RideFare[] = [
  { rideType: 'swat_moto', vehicle: 'bike', label: 'Swat Moto', capacity: '1 rider', etaMin: 3, base: 60, perKm: 22, icon: 'bicycle' },
  { rideType: 'swat_city', vehicle: 'rickshaw', label: 'Swat City', capacity: 'Up to 4', etaMin: 6, base: 90, perKm: 28, icon: 'car-sport' },
  { rideType: 'swat_van', vehicle: 'van', label: 'Swat Van', capacity: 'Up to 7', etaMin: 12, base: 140, perKm: 36, icon: 'bus' },
];

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

const asGradient = (g?: string[]): [string, string] => {
  const source = Array.isArray(g) && g.length >= 2 ? g : ['#0E9488', '#0E3F3A'];
  return [source[0] ?? '#0E9488', source[1] ?? '#0E3F3A'];
};

const objId = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const o = v as { _id?: unknown; id?: unknown };
  return String(o._id ?? o.id ?? '');
};

const prop = <T,>(v: unknown, key: string): T | undefined => {
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

const roleGradient = (role?: string): [string, string] =>
  role === 'admin' ? ['#0E9488', '#7B2CBF'] : role === 'rider' ? ['#1B84B5', '#0E3F3A'] : ['#0E9488', '#0E3F3A'];

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
  const restaurantName = typeof restaurant === 'object' && restaurant ? (prop<string>(restaurant, 'name') ?? '') : '';
  const restaurantEmoji =
    typeof restaurant === 'object' && restaurant ? (prop<string>(restaurant, 'emoji') ?? '') : '';
  const gradient = typeof restaurant === 'object' && restaurant ? prop<string[]>(restaurant, 'gradient') : undefined;
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
  subtitle: t.reference ? (t.referenceModel ? `${t.reference} · ${t.referenceModel}` : t.reference) : (t.type ?? ''),
  amount: Number(t.amount ?? 0),
  at: new Date(t.createdAt ?? Date.now()),
});

const mapNotification = (n: BackNotification): AppNotification => {
  const raw = n.type ?? 'system';
  const kind: AppNotification['kind'] = raw === 'order' || raw === 'ride' || raw === 'promo' ? raw : 'system';
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
// Demo-data policy
//
// Every read endpoint in this file is written as `withFallback(live, demo)`.
// That is convenient while building screens, but it is exactly the "mock data
// standing in for real backend functionality" failure mode: in a production
// build a failed API call silently renders fake restaurants, orders, earnings
// and wallet balances, and the user has no idea the data is not real.
//
// So demo fallback is DEV-ONLY. In release builds it is disabled by default and
// the real error propagates to the screen, which surfaces a proper error state.
// Set EXPO_PUBLIC_ALLOW_DEMO_DATA=true to re-enable it for offline demos or
// screenshots.
// ---------------------------------------------------------------------------

export const DEMO_DATA_ENABLED =
  process.env.EXPO_PUBLIC_ALLOW_DEMO_DATA === 'true' || (typeof __DEV__ !== 'undefined' && __DEV__);

const demo = <T>(value: T, ms = 350): Promise<T> => {
  if (!DEMO_DATA_ENABLED) {
    return Promise.reject(new Error('Demo data is disabled in release builds.'));
  }
  return delay(ms).then(() => value);
};

async function withFallback<T>(
  live: () => Promise<T>,
  fallback: () => Promise<T> | T,
  opts: { networkOnly?: boolean } = {},
): Promise<T> {
  try {
    return await live();
  } catch (error) {
    // Release builds must never mask a backend failure behind fake data.
    if (!DEMO_DATA_ENABLED) throw error;
    if (opts.networkOnly && !isNetworkError(error)) throw error;
    return fallback();
  }
}

// ---------------------------------------------------------------------------
// OTP hint — lets the OTP screen auto-fill the development code
// ---------------------------------------------------------------------------

const OTP_HINT_KEY = '@swat/otp-hint';

async function persistOtpHint(hint: string | null): Promise<void> {
  if (hint) await AsyncStorage.setItem(OTP_HINT_KEY, hint);
  else await AsyncStorage.removeItem(OTP_HINT_KEY);
}

export async function getOtpHint(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OTP_HINT_KEY);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const authApi = {
  async login(phone: string): Promise<{ ok: boolean; message: string }> {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      return { ok: false, message: 'Enter a valid 11-digit mobile number' };
    }
    return withFallback(
      async () => {
        const res = await httpPost<{ sent?: boolean }>('/auth/otp/request', { phone: digits }, false);
        const hint = res.meta ? (res.meta as { debugOtp?: string }).debugOtp : undefined;
        await persistOtpHint(hint ?? null);
        return { ok: Boolean(res.data.sent) || true, message: 'OTP sent to your number' };
      },
      async () => ({ ok: true, message: 'OTP sent to your number' }),
      { networkOnly: true },
    );
  },

  async verifyOtp(otp: string, name?: string, phone?: string): Promise<User> {
    const digits = normalizePhone(phone ?? '');
    const demoOtp = DEMO_DATA_ENABLED && normalizePhone(otp) === '0000';
    const target = digits || (demoOtp ? normalizePhone(CURRENT_USER.phone) : '');
    if (!target) throw new Error('Invalid OTP');

    try {
      return await verifyAgainstBackend(target, otp, name);
    } catch (error) {
      // Signing in with fabricated user data would be worse than an error: the
      // app would show an authenticated session that the backend has never seen.
      if (DEMO_DATA_ENABLED && isNetworkError(error)) {
        return mockVerify(otp, name, phone);
      }
      // Demo quick-logins send 0000 without a prior request — ask for a fresh
      // OTP on the live backend and verify with the echoed dev code instead.
      if (demoOtp && target) {
        try {
          const req = await httpPost<{ sent?: boolean }>('/auth/otp/request', { phone: target }, false);
          const hint = req.meta ? (req.meta as { debugOtp?: string }).debugOtp : undefined;
          if (hint) return await verifyAgainstBackend(target, hint, name);
        } catch {
          // keep the original error
        }
      }
      throw error;
    }
  },

  async saveUser(user: User): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
  },

  async register(name: string, phone: string, email: string): Promise<User> {
    const digits = normalizePhone(phone);
    return withFallback(
      async () => {
        const res = await httpPost<{ sent?: boolean }>('/auth/otp/request', { phone: digits }, false);
        const hint = res.meta ? (res.meta as { debugOtp?: string }).debugOtp : undefined;
        await persistOtpHint(hint ?? null);
        return buildGuestUser(name, digits, email);
      },
      () => buildGuestUser(name, digits, email),
      { networkOnly: true },
    );
  },

  // -------------------------------------------------------------------------
  // Password reset (Brevo). Unlike the read endpoints above these have NO demo
  // fallback - a fake "reset email sent" confirmation would be actively harmful.
  // -------------------------------------------------------------------------

  /** Always resolves; the endpoint answers 200 for unknown addresses too. */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const res = await httpPost<{ message?: string }>('/auth/forgot-password', { email: email.trim() }, false);
    return {
      message: res.data.message ?? 'If that email is registered, a reset link is on its way.',
    };
  },

  async verifyResetToken(token: string): Promise<{ valid: boolean; message: string }> {
    const res = await httpPost<{ valid?: boolean; message?: string }>(
      '/auth/reset-password/verify',
      { token },
      false,
    );
    return {
      valid: Boolean(res.data.valid),
      message: res.data.message ?? 'This reset link is invalid or has expired.',
    };
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const res = await httpPost<{ message?: string }>(
      '/auth/reset-password',
      { token, newPassword },
      false,
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
    await persistOtpHint(null);
  },
};

async function verifyAgainstBackend(phone: string, otp: string, name?: string): Promise<User> {
  const res = await httpPost<{ user?: BackUser; accessToken?: string; refreshToken?: string }>('/auth/otp/verify', {
    phone,
    otp,
    name: name && name.trim() ? name.trim() : undefined,
  });
  const auth = res.data;
  if (!auth?.user || !auth.accessToken || !auth.refreshToken) throw new Error('Verification failed');
  await setApiTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
  await persistOtpHint(null);
  const user = mapUser(auth.user);
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

async function mockVerify(otp: string, name?: string, phone?: string): Promise<User> {
  const clean = normalizePhone(otp);
  if (clean.length !== 4 && clean.length !== 6) throw new Error('Invalid OTP');
  const digits = normalizePhone(phone ?? '');
  const user: User =
    digits === normalizePhone(ADMIN_PHONE)
      ? ADMIN_USER
      : {
          ...CURRENT_USER,
          name: name && name.trim() ? name.trim() : CURRENT_USER.name,
          phone: phone ?? CURRENT_USER.phone,
        };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

function buildGuestUser(name: string, phone: string, email: string): User {
  return {
    ...CURRENT_USER,
    name: name.trim() || CURRENT_USER.name,
    phone,
    email,
  };
}

export const addressApi = {
  async getSaved(): Promise<Address[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ addresses?: BackAddress[] }>('/customer/addresses');
        return (res.data.addresses ?? []).map(mapAddress);
      },
      () => demo(SAVED_ADDRESSES),
    );
  },

  async searchPlaces(q: string): Promise<Address[]> {
    await delay(400);
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return PLACES.filter(
      (p) =>
        p.full.toLowerCase().includes(query) ||
        p.area.toLowerCase().includes(query) ||
        p.label.toLowerCase().includes(query),
    );
  },
};

function localSearch(q: string): { restaurants: Restaurant[]; dishes: MenuItem[] } {
  const query = q.trim().toLowerCase();
  if (!query) return { restaurants: [], dishes: [] };
  const restaurants = RESTAURANTS.filter(
    (r) =>
      r.name.toLowerCase().includes(query) ||
      r.cuisine.toLowerCase().includes(query) ||
      r.tags.some((t) => t.toLowerCase().includes(query)),
  );
  const dishes = Object.values(MENU)
    .flat()
    .filter((m) => m.name.toLowerCase().includes(query) || m.description.toLowerCase().includes(query));
  return { restaurants, dishes };
}

export const foodApi = {
  async getRestaurants(): Promise<Restaurant[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ restaurants?: BackRestaurant[] }>('/restaurants', false);
        return (res.data.restaurants ?? []).map(mapRestaurant);
      },
      () => demo(RESTAURANTS),
    );
  },

  async getFeaturedRestaurants(): Promise<Restaurant[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ restaurants?: BackRestaurant[] }>('/restaurants/featured', false);
        return (res.data.restaurants ?? []).map(mapRestaurant);
      },
      () => demo(RESTAURANTS.filter((r) => r.featured)),
    );
  },

  async getRestaurant(id: string): Promise<Restaurant> {
    return withFallback(
      async () => {
        const res = await httpGet<{ restaurant?: BackRestaurant }>(`/restaurants/${id}`, false);
        if (!res.data.restaurant) throw new Error('Restaurant not found');
        return mapRestaurant(res.data.restaurant);
      },
      () => {
        const found = RESTAURANTS.find((r) => r.id === id);
        if (!found) throw new Error('Restaurant not found');
        return found;
      },
    );
  },

  async getMenu(restaurantId: string): Promise<MenuItem[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ items?: BackFoodItem[] }>(`/restaurants/${restaurantId}/menu`, false);
        return (res.data.items ?? []).map(mapMenuItem);
      },
      () => demo(MENU[restaurantId] ?? []),
    );
  },

  async getPopular(): Promise<MenuItem[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ items?: BackFoodItem[] }>('/restaurants/popular', false);
        return (res.data.items ?? []).map(mapMenuItem);
      },
      () => demo(POPULAR_ITEMS),
    );
  },

  async search(q: string): Promise<{ restaurants: Restaurant[]; dishes: MenuItem[] }> {
    return withFallback(
      async () => {
        const res = await httpGet<{ restaurants?: BackRestaurant[]; dishes?: BackFoodItem[] }>(
          `/restaurants/search?q=${encodeURIComponent(q)}`,
          false,
        );
        return {
          restaurants: (res.data.restaurants ?? []).map(mapRestaurant),
          dishes: (res.data.dishes ?? []).map(mapMenuItem),
        };
      },
      () => demo(localSearch(q)),
    );
  },
};

function mockOrders(): Order[] {
  const now = new Date();
  const first: Order = {
    id: 'SWT-4821',
    type: 'food',
    restaurantName: 'Swat Grill House',
    restaurantEmoji: '🔥',
    restaurantGradient: ['#C73E3E', '#5E1212'],
    items: [{ menuItem: POPULAR_ITEMS[0]!, restaurantId: POPULAR_ITEMS[0]!.restaurantId, quantity: 1 }],
    status: 'delivered',
    total: 640,
    deliveryFee: 60,
    distanceKm: 2.1,
    placedAt: new Date(now.getTime() - 3 * HOUR),
    estimatedMinutes: 32,
    rider: RIDERS[0],
    address: 'House 42, Green View Colony, Mingora',
  };
  const second: Order = {
    id: 'SWT-4764',
    type: 'ride',
    restaurantName: 'Ride to Fizagat Park',
    restaurantEmoji: '🛺',
    restaurantGradient: ['#1B84B5', '#0E3F3A'],
    items: [],
    status: 'on_the_way',
    total: 210,
    deliveryFee: 0,
    distanceKm: 3.4,
    placedAt: new Date(now.getTime() - 2 * HOUR),
    estimatedMinutes: 24,
    rider: RIDERS[1],
    address: 'Mingora → Fizagat Park',
  };
  return [first, second];
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type CheckoutPaymentMethod = 'cash' | 'easypaisa' | 'jazzcash';

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
  restaurant: { id?: unknown; name?: string; emoji?: string; gradient?: string[]; cuisine?: string };
  methods: GatewayMethodInfo[];
};

export type PaymentHandoff =
  | { type: 'form'; url: string }
  | { type: 'redirect'; url: string };

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

  /** Switches an unpaid order to cash on delivery. */
  async switchToCash(orderId: string): Promise<void> {
    await httpPost(`/payments/orders/${orderId}/payment/cash`, {});
  },
};

export const orderApi = {
  async placeOrder(
    items: CartItem[],
    address: Address,
    total: number,
    deliveryFee: number,
    distanceKm: number,
    paymentMethod: CheckoutPaymentMethod = 'cash',
    extra: { customerPhone?: string; customerEmail?: string; idempotencyKey?: string } = {},
  ): Promise<PlaceOrderResult> {
    return withFallback(
      async () => {
        const restaurantId = items[0]?.restaurantId;
        if (!restaurantId) throw new Error('Unknown restaurant');

        await httpPost('/cart', {
          restaurantId,
          items: items.map((i) => ({ foodItem: i.menuItem.id, quantity: i.quantity, note: i.specialInstructions })),
        });

        // Reuse an existing backend address when the selected one is real,
        // otherwise persist the (otherwise local) delivery location first.
        let addressId = /^[0-9a-f]{24}$/i.test(address.id) ? address.id : '';
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
          payment?: { id?: unknown; status?: string; method?: string; amount?: number; currency?: string };
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
      () => {
        const restaurant = RESTAURANTS.find((r) => r.id === items[0]?.restaurantId) ?? RESTAURANTS[0]!;
        return {
          order: {
            id: `SWT-${Math.floor(1000 + Math.random() * 9000)}`,
            type: 'food' as const,
            restaurantName: restaurant.name,
            restaurantEmoji: restaurant.emoji,
            restaurantGradient: restaurant.gradient,
            items,
            status: 'placed',
            total,
            deliveryFee,
            distanceKm,
            placedAt: new Date(),
            estimatedMinutes: restaurant.deliveryTimeMin,
            rider: RIDERS[0],
            address: address.full,
          },
          payment: {
            id: 'demo',
            status: paymentMethod === 'cash' ? 'pending' : 'processing',
            method: paymentMethod,
            amount: total,
            currency: 'PKR',
          },
          handoff: null,
        };
      },
    );
  },

  async getOrders(): Promise<Order[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ orders?: BackOrder[] }>('/orders');
        return (res.data.orders ?? []).map(mapOrder);
      },
      () => demo(mockOrders()),
    );
  },

  async trackOrder(id: string): Promise<Order> {
    return withFallback(
      async () => {
        const res = await httpGet<{ order?: BackOrder }>(`/orders/${id}`);
        if (!res.data.order) throw new Error('Order not found');
        return mapOrder(res.data.order);
      },
      async () => {
        const orders = await orderApi.getOrders();
        return orders.find((o) => o.id === id) ?? orders[0]!;
      },
    );
  },
};

// Ride requests are delivered live over Socket.IO on the backend. The search
// below is the simulated in-app version used until the socket feed is wired up.
export const rideApiSearch: () => Promise<RideRequest[]> = async () => {
  await delay(900);
  return [
    {
      id: 'req_01',
      type: 'ride',
      pickup: 'Mingora Bus Stand',
      dropoff: 'Fizagat Park',
      distanceKm: 3.4,
      durationMin: 14,
      fare: 210,
      customerName: 'Ahmad Khan',
      customerRating: 4.8,
      vehicle: 'bike',
      createdAt: new Date(),
    },
    {
      id: 'req_02',
      type: 'ride',
      pickup: 'Saidu Sharif Chowk',
      dropoff: 'Green Valley Mall',
      distanceKm: 2.2,
      durationMin: 9,
      fare: 150,
      customerName: 'Zara Bibi',
      customerRating: 4.9,
      vehicle: 'rickshaw',
      createdAt: new Date(Date.now() - 2 * 60_000),
    },
    {
      id: 'req_03',
      type: 'food',
      pickup: 'Chowkara Chapli House',
      dropoff: 'Green View Colony, Mingora',
      distanceKm: 1.6,
      durationMin: 7,
      fare: 90,
      customerName: 'Bilal Khan',
      customerRating: 4.7,
      vehicle: 'bike',
      createdAt: new Date(Date.now() - 1 * 60_000),
    },
    {
      id: 'req_04',
      type: 'food',
      pickup: 'Dastarkhwan Biryani',
      dropoff: 'Saidu Teaching Hospital',
      distanceKm: 2.8,
      durationMin: 12,
      fare: 130,
      customerName: 'Mahnoor Zahid',
      customerRating: 4.6,
      vehicle: 'bike',
      createdAt: new Date(Date.now() - 4 * 60_000),
    },
  ];
};

const FALLBACK_FEED: DeliveryFeedItem[] = [
  {
    id: 'feed_01',
    kind: 'ride',
    pickup: 'Mingora Bus Stand',
    dropoff: 'Fizagat Park',
    distanceKm: 3.4,
    durationMin: 14,
    payout: 170,
    createdAt: new Date(),
  },
  {
    id: 'feed_02',
    kind: 'food',
    pickup: 'Chowkara Chapli House',
    dropoff: 'Green View Colony, Mingora',
    distanceKm: 1.6,
    durationMin: 9,
    payout: 90,
    restaurantEmoji: '🥙',
    restaurantGradient: ['#B05E1F', '#54250A'],
    createdAt: new Date(Date.now() - 3 * 60_000),
  },
  {
    id: 'feed_03',
    kind: 'food',
    pickup: 'Dastarkhwan Biryani',
    dropoff: 'Saidu Teaching Hospital',
    distanceKm: 2.8,
    durationMin: 13,
    payout: 130,
    restaurantEmoji: '🍛',
    restaurantGradient: ['#7A3B10', '#351603'],
    createdAt: new Date(Date.now() - 6 * 60_000),
  },
  {
    id: 'feed_04',
    kind: 'ride',
    pickup: 'Saidu Sharif Chowk',
    dropoff: 'Green Valley Mall',
    distanceKm: 2.2,
    durationMin: 10,
    payout: 120,
    createdAt: new Date(Date.now() - 12 * 60_000),
  },
];

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

const FALLBACK_EARNINGS: {
  stats: RiderStats;
  period: RiderEarningsPeriod;
  days: { day: string; amount: number }[];
} = {
  stats: { rating: 4.9, completed: 1286, acceptance: 96, satisfaction: 98, totalKm: 4120 },
  period: { label: 'This week', amount: 21450, trips: 42, hoursOnline: 38, onTime: 97 },
  days: [
    { day: 'Mon', amount: 3200 },
    { day: 'Tue', amount: 2850 },
    { day: 'Wed', amount: 4100 },
    { day: 'Thu', amount: 2600 },
    { day: 'Fri', amount: 3500 },
    { day: 'Sat', amount: 3000 },
    { day: 'Sun', amount: 2200 },
  ],
};

export const riderApi = {
  async getFeed(): Promise<DeliveryFeedItem[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ feed?: BackFeedItem[] }>('/rider/feed');
        return (res.data.feed ?? []).map(mapFeedItem);
      },
      () => demo(FALLBACK_FEED),
    );
  },

  async getRequests(): Promise<RideRequest[]> {
    return rideApiSearch();
  },

  async getEarnings(): Promise<{
    stats: RiderStats;
    period: RiderEarningsPeriod;
    days: { day: string; amount: number }[];
  }> {
    return withFallback(
      async () => {
        const res = await httpGet<{
          stats?: { rating?: number; completed?: number; acceptance?: number; satisfaction?: number; totalKm?: number };
          period?: { label?: string; amount?: number; trips?: number; hoursOnline?: number; onTime?: number };
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
      () => demo(FALLBACK_EARNINGS),
    );
  },
};

const FALLBACK_WALLET: { balance: number; transactions: WalletTx[] } = {
  balance: 4860,
  transactions: [
    { id: 'w_1', kind: 'debit', title: 'Swat Grill House', subtitle: 'Food order · SWT-4821', amount: 640, at: new Date(Date.now() - 3 * HOUR) },
    { id: 'w_2', kind: 'debit', title: 'Swat City Ride', subtitle: 'Trip to Fizagat Park', amount: 210, at: new Date(Date.now() - 1 * DAY) },
    { id: 'w_3', kind: 'credit', title: 'Cash back reward', subtitle: 'Referral bonus', amount: 200, at: new Date(Date.now() - 2 * DAY) },
    { id: 'w_4', kind: 'debit', title: 'Kalam Valley Pizza', subtitle: 'Food order · SWT-4710', amount: 830, at: new Date(Date.now() - 3 * DAY) },
    { id: 'w_5', kind: 'credit', title: 'Wallet top-up', subtitle: 'JazzCash transfer', amount: 1500, at: new Date(Date.now() - 4 * DAY) },
    { id: 'w_6', kind: 'debit', title: 'Kashmiri Chai', subtitle: 'Food order · SWT-4688', amount: 240, at: new Date(Date.now() - 5 * DAY) },
  ],
};

export const walletApi = async (): Promise<{ balance: number; transactions: WalletTx[] }> =>
  withFallback(
    async () => {
      const res = await httpGet<{ wallet?: { balance?: number }; transactions?: BackWalletTx[] }>(
        '/wallet/transactions',
      );
      return {
        balance: Number(res.data.wallet?.balance ?? 0),
        transactions: (res.data.transactions ?? []).map(mapWalletTx),
      };
    },
    () => demo(FALLBACK_WALLET),
  );

const FALLBACK_FAVORITES: Favorite[] = [
  { id: 'fav_1', kind: 'restaurant', refId: 'rest_03', name: 'Chowkara Chapli House', subtitle: 'Chapli Kabab • Swat Special', rating: 4.9, gradient: ['#B05E1F', '#54250A'], emoji: '🥩', savedAt: new Date(Date.now() - 6 * DAY) },
  { id: 'fav_2', kind: 'food', refId: 'm_021', name: 'Chicken Karahi (Half)', subtitle: 'Swati Karahi Khana', rating: 4.8, price: 850, gradient: ['#93341D', '#3C0F05'], emoji: '🍲', savedAt: new Date(Date.now() - 10 * DAY) },
  { id: 'fav_3', kind: 'restaurant', refId: 'rest_04', name: 'Trout Point Cafe', subtitle: 'Trout • Continental', rating: 4.6, gradient: ['#2B7A78', '#0B3B39'], emoji: '🐟', savedAt: new Date(Date.now() - 15 * DAY) },
  { id: 'fav_4', kind: 'food', refId: 'm_081', name: 'Gajar ka Halwa', subtitle: 'Shringar Sweets & Desserts', rating: 4.9, price: 220, gradient: ['#B3543A', '#52160C'], emoji: '🥕', savedAt: new Date(Date.now() - 20 * DAY) },
];

export const favoriteApi = {
  async get(): Promise<Favorite[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ favorites?: BackFavorite[] }>('/customer/favorites');
        return (res.data.favorites ?? []).map(mapFavorite);
      },
      () => demo(FALLBACK_FAVORITES),
    );
  },
};

const FALLBACK_NOTIFICATIONS: AppNotification[] = [
  { id: 'n_1', kind: 'order', title: 'Order delivered!', body: 'Your Swat Grill House order was delivered by Shahid.', at: new Date(Date.now() - 2 * HOUR), read: false },
  { id: 'n_2', kind: 'ride', title: 'Ride completed', body: 'Trip to Fizagat Park completed. Rate Bilal 5 stars.', at: new Date(Date.now() - 6 * HOUR), read: false },
  { id: 'n_3', kind: 'promo', title: 'Free delivery weekend', body: 'Rs 0 delivery fee on orders above Rs 800 this weekend.', at: new Date(Date.now() - 22 * HOUR), read: true },
  { id: 'n_4', kind: 'system', title: 'Wallet updated', body: 'Rs 200 cashback credited to your Swat Wallet.', at: new Date(Date.now() - 2 * DAY), read: true },
  { id: 'n_5', kind: 'promo', title: 'Welcome to Swat City', body: 'Use code SWAT10 for 10% off your first order.', at: new Date(Date.now() - 6 * DAY), read: true },
];

export const notificationApi = {
  async get(): Promise<AppNotification[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ notifications?: BackNotification[] }>('/notifications');
        return (res.data.notifications ?? []).map(mapNotification);
      },
      () => demo(FALLBACK_NOTIFICATIONS),
    );
  },

  async markAllRead(): Promise<void> {
    try {
      await httpPost('/notifications/mark-all-read', {});
    } catch {
      await delay(200);
    }
  },
};

const FALLBACK_ACTIVITIES: ActivityItem[] = [
  { id: 'a_1', kind: 'food', title: 'Swat Grill House', subtitle: 'Order #SWT-4821 · Delivered', amount: 640, at: new Date(Date.now() - 3 * HOUR), status: 'Delivered' },
  { id: 'a_2', kind: 'ride', title: 'Swat City Ride', subtitle: 'Mingora → Fizagat Park · Completed', amount: 210, at: new Date(Date.now() - 5 * HOUR), status: 'Completed' },
  { id: 'a_3', kind: 'payment', title: 'Cashback reward', subtitle: 'Referred a friend · Credited', amount: 200, at: new Date(Date.now() - 1 * DAY), status: 'Credited' },
  { id: 'a_4', kind: 'food', title: 'Kalam Valley Pizza Co.', subtitle: 'Order #SWT-4710 · Delivered', amount: 830, at: new Date(Date.now() - 3 * DAY), status: 'Delivered' },
  { id: 'a_5', kind: 'food', title: 'Kashmiri Chai', subtitle: 'Order #SWT-4688 · Cancelled', amount: 240, at: new Date(Date.now() - 5 * DAY), status: 'Cancelled' },
  { id: 'a_6', kind: 'ride', title: 'Swat Van', subtitle: 'Mingora → Kalam · Completed', amount: 720, at: new Date(Date.now() - 8 * DAY), status: 'Completed' },
];

export const activityApi = {
  async get(): Promise<ActivityItem[]> {
    return withFallback(
      async () => {
        const res = await httpGet<{ activities?: BackActivity[] }>('/customer/activities');
        return (res.data.activities ?? []).map(mapActivity);
      },
      () => demo(FALLBACK_ACTIVITIES),
    );
  },
};

export function estimateFare(km: number, rideType: RideType = 'swat_city'): number {
  const fare = RIDE_FARES.find((f) => f.rideType === rideType) ?? RIDE_FARES[1]!;
  return Math.round((fare.base + fare.perKm * km) / 10) * 10;
}

export function riderPayout(fare: number): number {
  return Math.round(fare * 0.76);
}