import { authApi, ADMIN_PHONE } from './api';
import { httpGet, httpPost, httpPatch, httpDelete } from './client';
import type { VehicleType } from '../types/domain';
import {
  AccountStatus,
  AdminDashboardData,
  AdminMenuItem,
  AdminNotification,
  AdminOrder,
  AdminOrderStatus,
  AdminPayment,
  AdminPromo,
  AdminReport,
  AdminRestaurant,
  AdminRide,
  AdminRider,
  AdminSettings,
  AdminTicket,
  AdminUser,
  AdminWalletOverview,
  AdminWalletTx,
  DashboardCharts,
  NotificationAudience,
  PromoAudience,
  ReportRange,
  RestaurantStatus,
  TicketMessage,
  TicketStatus,
} from '../types/admin';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

// ---------------------------------------------------------------------------
// Session guard — every admin API verifies auth + active + role=admin.
// The role always comes from the persisted backend session, never the client.
// ---------------------------------------------------------------------------
async function requireAdmin(): Promise<void> {
  const session = await authApi.getSession();
  if (!session) throw new Error('Authentication required');
  if (!session.verified) throw new Error('Account is not verified');
  if (session.role !== 'admin') throw new Error('Forbidden: admin access only');
}

const sleep = (ms = 450) => new Promise<void>((resolve) => setTimeout(resolve, ms + Math.random() * 400));

// ---------------------------------------------------------------------------
// Connectivity helpers (live backend first, mock data as graceful fallback)
// ---------------------------------------------------------------------------

async function withFallback<T>(
  live: () => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> {
  try {
    return await live();
  } catch {
    return fallback();
  }
}

const safe = async <T,>(p: Promise<T>): Promise<T | null> => p.then((v) => v).catch(() => null);

const toDate = (v?: string | Date, dflt = new Date()): Date => (v ? new Date(v) : new Date(dflt));

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

const roleGradient = (role?: string): [string, string] =>
  role === 'admin' ? ['#0E9488', '#7B2CBF'] : role === 'rider' ? ['#1B84B5', '#0E3F3A'] : ['#0E9488', '#0E3F3A'];

const last4 = (v?: string): string => String(v ?? '').replace(/[^0-9a-fA-F]/g, '').slice(-4).toUpperCase();

// ---------------------------------------------------------------------------
// Backend shape interfaces (admin endpoints)
// ---------------------------------------------------------------------------

type Meta = { page?: number; limit?: number; pages?: number; total?: number };

type BackUser = {
  _id?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: string;
  verified?: boolean;
  createdAt?: string | Date;
};

type BackRiderProfile = {
  _id?: string;
  name?: string;
  phone?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  approvalStatus?: string;
  status?: string;
  suspendedAt?: string | null;
  rating?: number;
  totalTrips?: number;
  createdAt?: string | Date;
  user?: BackUser & { verified?: boolean };
};

type BackOrder = {
  _id?: string;
  orderNumber?: string;
  customer?: BackUser;
  restaurant?: { _id?: string; name?: string; emoji?: string; gradient?: string[] };
  rider?: BackUser;
  items?: { name?: string; quantity?: number; price?: number }[];
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  addressSnapshot?: { full?: string; area?: string };
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackRide = {
  _id?: string;
  rideNumber?: string;
  customer?: BackUser;
  rider?: BackUser;
  type?: string;
  status?: string;
  pickup?: { address?: string };
  dropoff?: { address?: string };
  distanceKm?: number;
  fare?: number;
  createdAt?: string | Date;
};

type BackPayment = {
  _id?: string;
  kind?: string;
  gatewayRef?: string;
  method?: string;
  status?: string;
  amount?: number;
  user?: BackUser;
  createdAt?: string | Date;
};

type BackWallet = {
  _id?: string;
  balance?: number;
  user?: BackUser;
};

type BackWalletTx = {
  _id?: string;
  type?: string;
  amount?: number;
  description?: string;
  reference?: string;
  user?: BackUser;
  createdAt?: string | Date;
};

type BackPromotion = {
  _id?: string;
  code?: string;
  type?: string;
  value?: number;
  maxDiscount?: number;
  minOrder?: number;
  audience?: { type?: string };
  startsAt?: string | Date;
  expiresAt?: string | Date;
  maxUses?: number;
  usedCount?: number;
  active?: boolean;
};

type BackTicket = {
  _id?: string;
  subject?: string;
  category?: string;
  status?: string;
  priority?: string;
  user?: BackUser;
  messages?: { from?: string; text?: string; at?: string | Date }[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackRestaurantDoc = {
  _id?: string;
  name?: string;
  ownerName?: string;
  phone?: string;
  addressLine?: string;
  area?: string;
  category?: string;
  status?: string;
  rating?: number;
  deliveryKM?: number;
  emoji?: string;
  gradient?: string[];
  createdAt?: string | Date;
};

type BackFoodDoc = {
  _id?: string;
  restaurant?: string | { _id?: string; name?: string };
  name?: string;
  category?: string;
  price?: number;
  emoji?: string;
  gradient?: string[];
  rating?: number;
  available?: boolean;
};

type BackDashboard = {
  totals?: {
    revenue?: number;
    orders?: number;
    rides?: number;
    riders?: number;
    customers?: number;
    restaurants?: number;
    pendingRiderApprovals?: number;
    openTickets?: number;
  };
  statusCounts?: Record<string, number>;
  charts?: {
    dailyOrders?: { label: string; count: number }[];
    weeklyRevenue?: { label: string; value: number }[];
    serviceSplit?: { label: string; count: number }[];
    customerGrowth?: { label: string; count: number }[];
    riderGrowth?: { label: string; count: number }[];
  };
};

type BackReport = {
  range?: string;
  summary?: { revenue?: number; orders?: number; rides?: number };
  topRestaurants?: { name?: string; revenue?: number; orders?: number }[];
};

type BackSetting = { key: string; value: unknown };

// ---------------------------------------------------------------------------
// ID registry (display id <-> backend Mongo id) + overlay patches
// ---------------------------------------------------------------------------

const BACKEND_IDS = new Map<string, string>();

function registerId(display: string, backend?: string): string {
  if (display && backend) BACKEND_IDS.set(display, backend);
  return display;
}

function resolveId(id: string): string {
  const known = BACKEND_IDS.get(id);
  if (known) return known;
  return /^[0-9a-fA-F]{24}$/.test(id) ? id : id;
}

// Exact backend lifecycle — ready can only advance via rider_assigned.
const ORDER_GRAPH: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['rider_assigned', 'cancelled'],
  rider_assigned: ['picked_up', 'cancelled'],
  picked_up: ['on_the_way'],
  on_the_way: ['delivered'],
  delivered: [],
  cancelled: [],
};

const statusBackend = (s: AdminOrderStatus): string => (s === 'placed' ? 'pending' : s);

const statusDisplay = (s?: string): AdminOrderStatus =>
  s === 'pending' ? 'placed' : ((s ?? 'pending') as AdminOrderStatus);

function orderSteps(from: string, to: string): string[] {
  if (from === to) return [];
  const queue: { status: string; path: string[] }[] = [{ status: from, path: [] }];
  const visited = new Set<string>([from]);
  while (queue.length) {
    const { status, path } = queue.shift()!;
    for (const next of ORDER_GRAPH[status] ?? []) {
      if (next === to) return [...path, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ status: next, path: [...path, next] });
      }
    }
  }
  return [];
}

const orderBackendStatus = new Map<string, string>();
const restaurantByName = new Map<string, string>();

const patches = {
  restaurant: new Map<string, Partial<AdminRestaurant>>(),
  menu: new Map<string, Partial<AdminMenuItem>>(),
  ride: new Map<string, Partial<AdminRide>>(),
  user: new Map<string, Partial<AdminUser>>(),
  promoActive: new Map<string, boolean>(),
  promoDeleted: new Set<string>(),
  ticketReplies: new Map<string, TicketMessage[]>(),
  ticketStatus: new Map<string, TicketStatus>(),
};

// ---------------------------------------------------------------------------
// Mock datasets (in-memory so admin actions persist for the session)
// ---------------------------------------------------------------------------
const adminUser: AdminUser = {
  id: 'adm_001',
  name: 'Swat Admin',
  phone: ADMIN_PHONE,
  email: 'admin@swatcity.pk',
  role: 'admin',
  status: 'active',
  verified: true,
  joinedAt: ago(420 * DAY),
  orders: 0,
  rides: 0,
  rating: 5,
  walletBalance: 0,
  avatarGradient: ['#0E9488', '#7B2CBF'],
};

export const adminUsers: AdminUser[] = [
  adminUser,
  { id: 'u_002', name: 'Ahmad Khan', phone: '03451234567', email: 'ahmad@example.com', role: 'customer', status: 'active', verified: true, joinedAt: ago(90 * DAY), orders: 34, rides: 18, rating: 4.8, walletBalance: 1480, avatarGradient: ['#0E9488', '#0E3F3A'] },
  { id: 'u_003', name: 'Zara Bibi', phone: '03339876542', email: 'zara@example.com', role: 'customer', status: 'active', verified: true, joinedAt: ago(70 * DAY), orders: 22, rides: 9, rating: 4.9, walletBalance: 860, avatarGradient: ['#2EC4B6', '#0B5A4E'] },
  { id: 'u_004', name: 'Bilal Khan', phone: '03219112233', email: 'bilal@example.com', role: 'customer', status: 'suspended', verified: true, joinedAt: ago(200 * DAY), orders: 11, rides: 4, rating: 3.2, walletBalance: 0, avatarGradient: ['#1B84B5', '#0E3F3A'] },
  { id: 'u_005', name: 'Mahnoor Zahid', phone: '03150998811', email: 'mahnoor@example.com', role: 'customer', status: 'active', verified: true, joinedAt: ago(30 * DAY), orders: 8, rides: 3, rating: 4.7, walletBalance: 250, avatarGradient: ['#93341D', '#3C0F05'] },
  { id: 'u_006', name: 'Usman Arshad', phone: '03464445566', email: 'usman@example.com', role: 'customer', status: 'active', verified: false, joinedAt: ago(6 * DAY), orders: 2, rides: 0, rating: 4.4, walletBalance: 0, avatarGradient: ['#7A3B10', '#351603'] },
  { id: 'u_007', name: 'Sana Gul', phone: '03321118899', email: 'sana@example.com', role: 'customer', status: 'active', verified: true, joinedAt: ago(120 * DAY), orders: 41, rides: 12, rating: 4.9, walletBalance: 2120, avatarGradient: ['#2B7A78', '#0B3B39'] },
  { id: 'u_008', name: 'Hamza Yousaf', phone: '03159998877', email: 'hamza@example.com', role: 'customer', status: 'deactivated', verified: true, joinedAt: ago(150 * DAY), orders: 5, rides: 2, rating: 3.6, walletBalance: 0, avatarGradient: ['#B05E1F', '#54250A'] },
];

export const adminRiders: AdminRider[] = [
  { id: 'r_002', name: 'Shahid Rehman', phone: '03405551122', email: 'shahid@example.com', role: 'rider', status: 'active', verified: true, joinedAt: ago(260 * DAY), orders: 0, rides: 0, rating: 4.9, walletBalance: 4860, avatarGradient: ['#1B84B5', '#0E3F3A'], vehicle: 'bike', plateNumber: 'ABC-8542', riderStatus: 'online', applicationStatus: 'approved', docStatus: 'verified', earnings: 214500, deliveries: 1286 },
  { id: 'r_003', name: 'Junaid Ali', phone: '03448889900', email: 'junaid@example.com', role: 'rider', status: 'active', verified: true, joinedAt: ago(180 * DAY), orders: 0, rides: 0, rating: 4.8, walletBalance: 3120, avatarGradient: ['#0E9488', '#0E3F3A'], vehicle: 'rickshaw', plateNumber: 'SWT-2211', riderStatus: 'online', applicationStatus: 'approved', docStatus: 'verified', earnings: 156300, deliveries: 902 },
  { id: 'r_004', name: 'Farman Ullah', phone: '03056667788', email: 'farman@example.com', role: 'rider', status: 'active', verified: true, joinedAt: ago(95 * DAY), orders: 0, rides: 0, rating: 4.7, walletBalance: 1450, avatarGradient: ['#7A3B10', '#351603'], vehicle: 'bike', plateNumber: 'MNG-3456', riderStatus: 'online', applicationStatus: 'approved', docStatus: 'verified', earnings: 84200, deliveries: 511 },
  { id: 'r_005', name: 'Irshad Mehmood', phone: '03412332211', email: 'irshad@example.com', role: 'rider', status: 'active', verified: true, joinedAt: ago(60 * DAY), orders: 0, rides: 0, rating: 4.5, walletBalance: 0, avatarGradient: ['#B05E1F', '#54250A'], vehicle: 'van', plateNumber: 'KAL-7788', riderStatus: 'offline', applicationStatus: 'approved', docStatus: 'pending', earnings: 51200, deliveries: 289 },
  { id: 'r_006', name: 'Naveed Khan', phone: '03314443322', email: 'naveed@example.com', role: 'rider', status: 'active', verified: false, joinedAt: ago(10 * DAY), orders: 0, rides: 0, rating: 4.2, walletBalance: 0, avatarGradient: ['#2B7A78', '#0B3B39'], vehicle: 'bike', plateNumber: 'NEW-9090', riderStatus: 'offline', applicationStatus: 'pending', docStatus: 'pending', earnings: 0, deliveries: 0 },
  { id: 'r_007', name: 'Kamran Saeed', phone: '03009998844', email: 'kamran@example.com', role: 'rider', status: 'active', verified: false, joinedAt: ago(5 * DAY), orders: 0, rides: 0, rating: 0, walletBalance: 0, avatarGradient: ['#93341D', '#3C0F05'], vehicle: 'rickshaw', plateNumber: 'SAI-2323', riderStatus: 'offline', applicationStatus: 'pending', docStatus: 'pending', earnings: 0, deliveries: 0 },
];

export const adminRestaurants: AdminRestaurant[] = [
  { id: 'rest_01', name: 'Chowkara Chapli House', owner: 'Haji Bahadar', ownerPhone: '03459001122', category: 'Swat Traditional', location: 'Chowkara Road, Mingora', status: 'approved', rating: 4.9, menuCount: 18, deliveryKM: 2.1, joinedAt: ago(320 * DAY), gradient: ['#B05E1F', '#54250A'], emoji: '🥙' },
  { id: 'rest_02', name: 'Dastarkhwan Biryani', owner: 'Aftab Ahmad', ownerPhone: '03017778899', category: 'Biryani & Rice', location: 'College Chowk, Saidu Sharif', status: 'approved', rating: 4.7, menuCount: 22, deliveryKM: 3.4, joinedAt: ago(240 * DAY), gradient: ['#7A3B10', '#351603'], emoji: '🍛' },
  { id: 'rest_03', name: 'Swat Grill House', owner: 'Rizwan Gul', ownerPhone: '03326665544', category: 'BBQ & Karahi', location: 'Main Mingora Road, Mingora', status: 'approved', rating: 4.8, menuCount: 15, deliveryKM: 2.8, joinedAt: ago(200 * DAY), gradient: ['#93341D', '#3C0F05'], emoji: '🍗' },
  { id: 'rest_04', name: 'Trout Point Cafe', owner: 'Waseem Shah', ownerPhone: '03454443322', category: 'Trout & Continental', location: 'Fizagat Park Road, Mingora', status: 'approved', rating: 4.6, menuCount: 26, deliveryKM: 4.2, joinedAt: ago(150 * DAY), gradient: ['#2B7A78', '#0B3B39'], emoji: '🐟' },
  { id: 'rest_05', name: 'Shringar Sweets & Desserts', owner: 'Irfan Malik', ownerPhone: '03019887766', category: 'Sweets & Desserts', location: 'Saidu Sharif Bazaar', status: 'approved', rating: 4.9, menuCount: 30, deliveryKM: 3.0, joinedAt: ago(110 * DAY), gradient: ['#B3543A', '#52160C'], emoji: '🍬' },
  { id: 'rest_06', name: 'Kalam Valley Pizza Co.', owner: 'Adnan Feroz', ownerPhone: '03112221100', category: 'Pizza & Fast Food', location: 'Kalam Road, Bahrain', status: 'approved', rating: 4.4, menuCount: 24, deliveryKM: 6.5, joinedAt: ago(80 * DAY), gradient: ['#2B7A78', '#144018'], emoji: '🍕' },
  { id: 'rest_07', name: 'Kashmiri Chai Point', owner: 'Shaukat Baig', ownerPhone: '03227778899', category: 'Chai & Snacks', location: 'Swat Museum Road, Saidu Sharif', status: 'pending', rating: 4.3, menuCount: 12, deliveryKM: 1.8, joinedAt: ago(4 * DAY), gradient: ['#7A3B10', '#351603'], emoji: '🍵' },
  { id: 'rest_08', name: 'Green Valley Bakery', owner: 'Tariq Jan', ownerPhone: '03369998855', category: 'Bakery', location: 'Green View Colony, Mingora', status: 'pending', rating: 4.2, menuCount: 0, deliveryKM: 2.2, joinedAt: ago(2 * DAY), gradient: ['#B05E1F', '#54250A'], emoji: '🥐' },
  { id: 'rest_09', name: 'Old Bustag Kebab', owner: 'Murad Swati', ownerPhone: '03459994411', category: 'Kebab & BBQ', location: 'Mingora Bazaar', status: 'rejected', rating: 3.8, menuCount: 2, deliveryKM: 2.0, joinedAt: ago(12 * DAY), gradient: ['#93341D', '#3C0F05'], emoji: '🍢' },
  { id: 'rest_10', name: 'Saidu Fried Fish', owner: 'Rashid Ali', ownerPhone: '03025556677', category: 'Fish & Fry', location: 'River View, Saidu Sharif', status: 'suspended', rating: 4.1, menuCount: 14, deliveryKM: 3.1, joinedAt: ago(70 * DAY), gradient: ['#2EC4B6', '#0B5A4E'], emoji: '🐠' },
];

export const adminMenuItems: AdminMenuItem[] = [
  { id: 'm_001', name: 'Chapli Kabab (2 pcs)', restaurant: 'Chowkara Chapli House', category: 'Kabab', price: 420, discount: 0, available: true, active: true, rating: 4.9, gradient: ['#B05E1F', '#54250A'], emoji: '🥩' },
  { id: 'm_002', name: 'Chicken Karahi (Half)', restaurant: 'Swat Grill House', category: 'Karahi', price: 850, discount: 10, available: true, active: true, rating: 4.8, gradient: ['#93341D', '#3C0F05'], emoji: '🍲' },
  { id: 'm_003', name: 'Fresh Trout Charsi', restaurant: 'Trout Point Cafe', category: 'Fish', price: 1100, discount: 0, available: true, active: true, rating: 4.7, gradient: ['#2B7A78', '#0B3B39'], emoji: '🐟' },
  { id: 'm_004', name: 'Chicken Biryani (Full)', restaurant: 'Dastarkhwan Biryani', category: 'Biryani', price: 620, discount: 15, available: true, active: true, rating: 4.7, gradient: ['#7A3B10', '#351603'], emoji: '🍛' },
  { id: 'm_005', name: 'Gajar ka Halwa', restaurant: 'Shringar Sweets & Desserts', category: 'Dessert', price: 220, discount: 0, available: true, active: true, rating: 4.9, gradient: ['#B3543A', '#52160C'], emoji: '🥕' },
  { id: 'm_006', name: 'Turkey Pepperoni Pizza (Large)', restaurant: 'Kalam Valley Pizza Co.', category: 'Pizza', price: 1450, discount: 20, available: true, active: true, rating: 4.6, gradient: ['#2B7A78', '#144018'], emoji: '🍕' },
  { id: 'm_007', name: 'Mah Chai (Kashmiri)', restaurant: 'Kashmiri Chai Point', category: 'Chai', price: 180, discount: 0, available: true, active: true, rating: 4.3, gradient: ['#7A3B10', '#351603'], emoji: '🍵' },
  { id: 'm_008', name: 'Mix Grill Platter', restaurant: 'Old Bustag Kebab', category: 'Kabab', price: 980, discount: 0, available: false, active: false, rating: 4.0, gradient: ['#93341D', '#3C0F05'], emoji: '🍢' },
  { id: 'm_009', name: 'Chicken Cheese Sandwich', restaurant: 'Green Valley Bakery', category: 'Sandwich', price: 350, discount: 5, available: true, active: true, rating: 4.2, gradient: ['#B05E1F', '#54250A'], emoji: '🥪' },
  { id: 'm_010', name: 'Fried River Fish', restaurant: 'Saidu Fried Fish', category: 'Fish', price: 720, discount: 0, available: false, active: false, rating: 4.1, gradient: ['#2EC4B6', '#0B5A4E'], emoji: '🐠' },
];

export const adminOrders: AdminOrder[] = [
  { id: 'SWT-4850', customer: 'Ahmad Khan', customerPhone: '03451234567', restaurant: 'Swat Grill House', items: [{ name: 'Chicken Karahi (Half)', quantity: 1, price: 850 }, { name: 'Roghni Naan', quantity: 4, price: 60 }], subtotal: 1090, deliveryFee: 99, total: 1189, paymentMethod: 'wallet', paymentStatus: 'paid', status: 'on_the_way', rider: 'Junaid Ali', address: 'House 42, Green View Colony, Mingora', placedAt: ago(40 * 60_000), updatedAt: ago(18 * 60_000) },
  { id: 'SWT-4849', customer: 'Mahnoor Zahid', customerPhone: '03150998811', restaurant: 'Dastarkhwan Biryani', items: [{ name: 'Chicken Biryani (Full)', quantity: 2, price: 620 }], subtotal: 1240, deliveryFee: 49, total: 1289, paymentMethod: 'cash', paymentStatus: 'paid', status: 'preparing', rider: 'Shahid Rehman', address: 'Flat 3B, Saidu Heights, Saidu Sharif', placedAt: ago(75 * 60_000), updatedAt: ago(30 * 60_000) },
  { id: 'SWT-4848', customer: 'Sana Gul', customerPhone: '03321118899', restaurant: 'Trout Point Cafe', items: [{ name: 'Fresh Trout Charsi', quantity: 1, price: 1100 }, { name: 'Rice (Boiled)', quantity: 1, price: 120 }], subtotal: 1220, deliveryFee: 0, total: 1220, paymentMethod: 'card', paymentStatus: 'paid', status: 'delivered', rider: 'Farman Ullah', address: 'Village Jambatai, Mingora Road', placedAt: ago(3 * HOUR), updatedAt: ago(2 * HOUR) },
  { id: 'SWT-4847', customer: 'Zara Bibi', customerPhone: '03339876542', restaurant: 'Chowkara Chapli House', items: [{ name: 'Chapli Kabab (2 pcs)', quantity: 2, price: 420 }, { name: 'Kabuli Pulao', quantity: 1, price: 380 }], subtotal: 1220, deliveryFee: 99, total: 1319, paymentMethod: 'wallet', paymentStatus: 'paid', status: 'delivered', rider: 'Junaid Ali', address: 'Muhallah Bagh, Mingora', placedAt: ago(5 * HOUR), updatedAt: ago(4 * HOUR) },
  { id: 'SWT-4846', customer: 'Usman Arshad', customerPhone: '03464445566', restaurant: 'Kalam Valley Pizza Co.', items: [{ name: 'Turkey Pepperoni Pizza (Large)', quantity: 1, price: 1450 }], subtotal: 1450, deliveryFee: 149, total: 1599, paymentMethod: 'jazzcash', paymentStatus: 'pending', status: 'placed', address: 'Bahrain Bridge Road, Bahrain', placedAt: ago(20 * 60_000), updatedAt: ago(20 * 60_000) },
  { id: 'SWT-4845', customer: 'Bilal Khan', customerPhone: '03219112233', restaurant: 'Shringar Sweets & Desserts', items: [{ name: 'Gajar ka Halwa', quantity: 3, price: 220 }], subtotal: 660, deliveryFee: 99, total: 759, paymentMethod: 'cash', paymentStatus: 'paid', status: 'cancelled', rider: 'Farman Ullah', address: 'Saidu Sharif Bazaar', placedAt: ago(7 * HOUR), updatedAt: ago(6 * HOUR) },
  { id: 'SWT-4844', customer: 'Hamza Yousaf', customerPhone: '03159998877', restaurant: 'Chowkara Chapli House', items: [{ name: 'Kabuli Pulao', quantity: 1, price: 380 }, { name: 'Kashmiri Chai', quantity: 2, price: 180 }], subtotal: 740, deliveryFee: 99, total: 839, paymentMethod: 'wallet', paymentStatus: 'refunded', status: 'cancelled', rider: 'Irshad Mehmood', address: 'Green View Colony, Mingora', placedAt: ago(1 * DAY), updatedAt: ago(23 * HOUR) },
  { id: 'SWT-4843', customer: 'Ahmad Khan', customerPhone: '03451234567', restaurant: 'Dastarkhwan Biryani', items: [{ name: 'Beef Pulao (Full)', quantity: 1, price: 480 }], subtotal: 480, deliveryFee: 99, total: 579, paymentMethod: 'card', paymentStatus: 'paid', status: 'delivered', rider: 'Farman Ullah', address: 'House 42, Green View Colony, Mingora', placedAt: ago(1 * DAY), updatedAt: ago(22 * HOUR) },
  { id: 'SWT-4842', customer: 'Sana Gul', customerPhone: '03321118899', restaurant: 'Swat Grill House', items: [{ name: 'Mutton Karahi (Full)', quantity: 1, price: 1750 }], subtotal: 1750, deliveryFee: 0, total: 1750, paymentMethod: 'wallet', paymentStatus: 'paid', status: 'ready', rider: 'Shahid Rehman', address: 'Village Jambatai, Mingora Road', placedAt: ago(2 * DAY), updatedAt: ago(2 * DAY) },
];

export const adminRides: AdminRide[] = [
  { id: 'RIDE-3120', customer: 'Ahmad Khan', rider: 'Shahid Rehman', pickup: 'Mingora Bus Stand', dropoff: 'Fizagat Park', distanceKm: 3.4, fare: 210, rideType: 'swat_city', status: 'completed', bookedAt: ago(6 * HOUR), completedAt: ago(5 * HOUR) },
  { id: 'RIDE-3119', customer: 'Sana Gul', rider: 'Junaid Ali', pickup: 'Saidu Sharif Chowk', dropoff: 'Green Valley Mall', distanceKm: 2.2, fare: 150, rideType: 'swat_city', status: 'completed', bookedAt: ago(1 * DAY), completedAt: ago(23 * HOUR) },
  { id: 'RIDE-3118', customer: 'Zara Bibi', rider: 'Farman Ullah', pickup: 'Mingora Bazaar', dropoff: 'Swat Museum', distanceKm: 1.1, fare: 180, rideType: 'swat_moto', status: 'started', bookedAt: ago(25 * 60_000), completedAt: undefined },
  { id: 'RIDE-3117', customer: 'Bilal Khan', rider: undefined, pickup: 'Bahrain Bridge', dropoff: 'Kalam Bazaar', distanceKm: 22.0, fare: 1060, rideType: 'swat_van', status: 'searching', bookedAt: ago(9 * 60_000), completedAt: undefined },
  { id: 'RIDE-3116', customer: 'Mahnoor Zahid', rider: 'Irshad Mehmood', pickup: 'Saidu Teaching Hospital', dropoff: 'Fizagat Park', distanceKm: 2.6, fare: 180, rideType: 'swat_moto', status: 'cancelled', bookedAt: ago(2 * DAY), completedAt: undefined },
  { id: 'RIDE-3115', customer: 'Usman Arshad', rider: 'Shahid Rehman', pickup: 'Green Valley Mall', dropoff: 'Mingora Bus Stand', distanceKm: 1.8, fare: 140, rideType: 'swat_moto', status: 'arriving', bookedAt: ago(30 * 60_000), completedAt: undefined },
];

export const adminPayments: AdminPayment[] = [
  { id: 'PAY-9551', user: 'Ahmad Khan', role: 'customer', ref: 'SWT-4850', amount: 1189, method: 'wallet', status: 'paid', at: ago(38 * 60_000) },
  { id: 'PAY-9550', user: 'Usman Arshad', role: 'customer', ref: 'SWT-4846', amount: 1599, method: 'jazzcash', status: 'pending', at: ago(18 * 60_000) },
  { id: 'PAY-9549', user: 'Sana Gul', role: 'customer', ref: 'SWT-4848', amount: 1220, method: 'card', status: 'paid', at: ago(3 * HOUR) },
  { id: 'PAY-9548', user: 'Bilal Khan', role: 'customer', ref: 'SWT-4845', amount: 759, method: 'cash', status: 'refunded', at: ago(7 * HOUR) },
  { id: 'PAY-9547', user: 'Zara Bibi', role: 'customer', ref: 'SWT-4847', amount: 1319, method: 'wallet', status: 'paid', at: ago(5 * HOUR) },
  { id: 'PAY-9546', user: 'Shahid Rehman', role: 'rider', ref: 'RIDE-3120 payout', amount: 160, method: 'wallet', status: 'paid', at: ago(5 * HOUR) },
  { id: 'PAY-9545', user: 'Hamza Yousaf', role: 'customer', ref: 'SWT-4844', amount: 839, method: 'wallet', status: 'failed', at: ago(1 * DAY) },
  { id: 'PAY-9544', user: 'Ahmad Khan', role: 'customer', ref: 'RIDE-3120', amount: 210, method: 'card', status: 'paid', at: ago(5 * HOUR) },
];

export const adminWalletTxs: AdminWalletTx[] = [
  { id: 'wtx_01', user: 'Ahmad Khan', role: 'customer', kind: 'debit', amount: 1189, title: 'Swat Grill House · SWT-4850', at: ago(38 * 60_000) },
  { id: 'wtx_02', user: 'Sana Gul', role: 'customer', kind: 'credit', amount: 500, title: 'Wallet top-up · JazzCash', at: ago(1 * DAY) },
  { id: 'wtx_03', user: 'Shahid Rehman', role: 'rider', kind: 'earning', amount: 160, title: 'Ride payout · RIDE-3120', at: ago(5 * HOUR) },
  { id: 'wtx_04', user: 'Junaid Ali', role: 'rider', kind: 'earning', amount: 140, title: 'Delivery payout · SWT-4847', at: ago(4 * HOUR) },
  { id: 'wtx_05', user: 'Bilal Khan', role: 'customer', kind: 'refund', amount: 759, title: 'Refund · SWT-4845', at: ago(6 * HOUR) },
  { id: 'wtx_06', user: 'Platform', role: 'admin', kind: 'commission', amount: 1718, title: 'Platform commission · daily', at: ago(1 * DAY) },
  { id: 'wtx_07', user: 'Farman Ullah', role: 'rider', kind: 'earning', amount: 220, title: 'Two deliveries · today', at: ago(2 * HOUR) },
];

export const adminPromos: AdminPromo[] = [
  { id: 'prm_01', code: 'SWAT10', type: 'percent', value: 10, minOrder: 500, maxDiscount: 200, startsOn: ago(30 * DAY), expiresOn: ago(-30 * DAY), usageLimit: 500, used: 481, active: true, audience: 'customers' },
  { id: 'prm_02', code: 'SWAT30', type: 'fixed', value: 30, minOrder: 800, startsOn: ago(10 * DAY), expiresOn: ago(-5 * DAY), usageLimit: 300, used: 212, active: true, audience: 'customers' },
  { id: 'prm_03', code: 'FREERIDE', type: 'percent', value: 100, minOrder: 150, maxDiscount: 150, startsOn: ago(5 * DAY), expiresOn: ago(-2 * DAY), usageLimit: 100, used: 42, active: true, audience: 'all' },
  { id: 'prm_04', code: 'RIDERBONUS', type: 'percent', value: 5, minOrder: 0, startsOn: ago(20 * DAY), expiresOn: ago(-10 * DAY), usageLimit: 0, used: 0, active: true, audience: 'riders' },
  { id: 'prm_05', code: 'EIDFEAST', type: 'fixed', value: 100, minOrder: 1000, startsOn: ago(1 * DAY), expiresOn: ago(-45 * DAY), usageLimit: 1000, used: 0, active: false, audience: 'customers' },
];

export const adminNotifications: AdminNotification[] = [
  { id: 'n_admin_01', title: 'Weekend free delivery', body: 'Rs 0 delivery fee on orders above Rs 800 this weekend.', audience: 'all', status: 'sent', at: ago(22 * HOUR) },
  { id: 'n_admin_02', title: 'Rider bonus week', body: 'Earn 5% extra on every delivery through Sunday.', audience: 'riders', status: 'sent', at: ago(40 * HOUR) },
  { id: 'n_admin_03', title: 'Welcome reward', body: 'Use code SWAT10 for 10% off your first order.', audience: 'customers', status: 'sent', at: ago(6 * DAY) },
];

export const adminTickets: AdminTicket[] = [
  { id: 'TKT-1101', user: 'Ahmad Khan', subject: 'Order item missing', category: 'Order issue', priority: 'high', status: 'in_progress', createdAt: ago(5 * HOUR), updatedAt: ago(2 * HOUR), messages: [
    { id: 'm1', from: 'user', text: 'My order SWT-4843 arrived without the naan bread.', at: ago(5 * HOUR) },
    { id: 'm2', from: 'admin', text: 'We are sorry! A refund of the naan has been processed to your wallet.', at: ago(2 * HOUR) },
  ] },
  { id: 'TKT-1100', user: 'Zara Bibi', subject: 'Rider behaviour', category: 'Riding experience', priority: 'medium', status: 'open', createdAt: ago(8 * HOUR), updatedAt: ago(8 * HOUR), messages: [{ id: 'm1', from: 'user', text: 'The rider was driving too fast on Malam Jabba road.', at: ago(8 * HOUR) }] },
  { id: 'TKT-1099', user: 'Naveed Khan', subject: 'Document rejection help', category: 'Rider application', priority: 'urgent', status: 'open', createdAt: ago(1 * DAY), updatedAt: ago(1 * DAY), messages: [{ id: 'm1', from: 'user', text: 'My license photo was rejected. What should I upload?', at: ago(1 * DAY) }] },
  { id: 'TKT-1098', user: 'Hamza Yousaf', subject: 'Refund not received', category: 'Payment', priority: 'high', status: 'resolved', createdAt: ago(2 * DAY), updatedAt: ago(1 * DAY), messages: [
    { id: 'm1', from: 'user', text: 'Refund for cancelled order has not arrived.', at: ago(2 * DAY) },
    { id: 'm2', from: 'admin', text: 'Refund confirmed to your JazzCash account.', at: ago(1 * DAY) },
  ] },
  { id: 'TKT-1097', user: 'Sana Gul', subject: 'App not showing offer', category: 'Promo issue', priority: 'low', status: 'closed', createdAt: ago(4 * DAY), updatedAt: ago(3 * DAY), messages: [{ id: 'm1', from: 'user', text: 'Code FRIEND20 does not work.', at: ago(4 * DAY) }] },
];

export const adminSettingsData: AdminSettings = {
  deliveryFee: 99,
  rideBaseFare: 90,
  ridePerKm: 28,
  commissionPct: 24,
  minOrder: 350,
  currency: 'PKR',
  supportPhone: '0345 678 9012',
  supportEmail: 'support@swatcity.pk',
  maintenanceMode: false,
  sendOrderUpdates: true,
  sendRideUpdates: true,
  sendPromotions: true,
  termsUrl: 'https://swatcity.pk/terms',
  privacyUrl: 'https://swatcity.pk/privacy',
};

// ---------------------------------------------------------------------------
// Dashboard + reports computation (mock fallback)
// ---------------------------------------------------------------------------
function dashboardTotals() {
  const riders = adminRiders;
  return {
    users: adminUsers.length + riders.length,
    customers: adminUsers.filter((u) => u.role === 'customer').length,
    riders: riders.length,
    restaurants: adminRestaurants.length,
    foodItems: adminMenuItems.length,
    activeOrders: adminOrders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length,
    completedOrders: adminOrders.filter((o) => o.status === 'delivered').length,
    cancelledOrders: adminOrders.filter((o) => o.status === 'cancelled').length,
    activeRides: adminRides.filter((r) => !['completed', 'cancelled'].includes(r.status)).length,
    revenue: adminOrders.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0),
    riderEarnings: riders.reduce((s, r) => s + r.earnings, 0),
    pendingRiderApplications: riders.filter((r) => r.applicationStatus === 'pending').length,
    pendingRestaurants: adminRestaurants.filter((r) => r.status === 'pending').length,
    pendingOrders: adminOrders.filter((o) => ['placed', 'confirmed'].includes(o.status)).length,
    supportTickets: adminTickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
  };
}

const LABELS_7D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dashboardCharts(): DashboardCharts {
  return {
    dailyOrders: LABELS_7D.map((label, i) => ({ label, count: [28, 41, 35, 52, 68, 74, 46][i]! })),
    weeklyRevenue: ['W1', 'W2', 'W3', 'W4'].map((label, i) => ({ label, amount: [81200, 96800, 88400, 106500][i]! })),
    monthlyRevenue: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, i) => ({ label, amount: [310, 288, 342, 356, 401, 388, 424, 452, 470, 498, 512, 545][i]! * 1000 })),
    customerGrowth: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'].map((label, i) => ({ label, count: [420, 520, 640, 780, 920, 1120][i]! })),
    riderGrowth: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'].map((label, i) => ({ label, count: [34, 46, 58, 72, 88, 104][i]! })),
    orderStatus: [
      { label: 'Pending', count: 3 },
      { label: 'Active', count: 9 },
      { label: 'Delivered', count: 54 },
      { label: 'Cancelled', count: 12 },
    ],
    serviceSplit: [
      { label: 'Food', count: 71 },
      { label: 'Rides', count: 29 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const mapAdminUser = (u: BackUser): AdminUser => ({
  id: String(u._id ?? ''),
  name: u.name ?? '',
  phone: u.phone ?? '',
  email: u.email ?? '',
  role: u.role === 'rider' || u.role === 'admin' ? (u.role as AdminUser['role']) : 'customer',
  status: u.status === 'suspended' ? 'suspended' : u.status === 'deactivated' ? 'deactivated' : 'active',
  verified: Boolean(u.verified),
  joinedAt: toDate(u.createdAt),
  orders: 0,
  rides: 0,
  rating: 0,
  walletBalance: 0,
  avatarGradient: roleGradient(u.role),
});

const mapRiderProfile = (p: BackRiderProfile): AdminRider => {
  const user = p.user && typeof p.user === 'object' ? p.user : undefined;
  const userId = String(p.user?._id ?? '');
  const vehicle = p.vehicleType === 'car' ? 'sedan' : (p.vehicleType === 'bike' || p.vehicleType === 'rickshaw' || p.vehicleType === 'van' ? p.vehicleType : 'bike');
  return {
    id: userId,
    name: p.name ?? user?.name ?? '',
    phone: p.phone ?? user?.phone ?? '',
    email: user?.email ?? '',
    role: 'rider',
    status: p.suspendedAt ? 'suspended' : 'active',
    verified: Boolean(user?.verified),
    joinedAt: toDate(p.createdAt),
    orders: 0,
    rides: 0,
    rating: Number(p.rating ?? 0),
    walletBalance: 0,
    avatarGradient: roleGradient('rider'),
    vehicle: vehicle as VehicleType,
    plateNumber: p.vehiclePlate ?? '',
    riderStatus: p.status === 'online' || p.status === 'busy' ? p.status : 'offline',
    applicationStatus: p.approvalStatus === 'approved' || p.approvalStatus === 'rejected' ? p.approvalStatus : 'pending',
    docStatus: p.approvalStatus === 'approved' ? 'verified' : p.approvalStatus === 'rejected' ? 'rejected' : 'pending',
    earnings: 0,
    deliveries: Number(p.totalTrips ?? 0),
  };
};

const mapRestaurantDoc = (r: BackRestaurantDoc, menuCount: number): AdminRestaurant => {
  const rawId = String(r._id ?? '');
  const id = registerId(`rest_${last4(rawId)}`, rawId);
  return {
    id,
    name: r.name ?? 'Unnamed restaurant',
    owner: r.ownerName ?? '',
    ownerPhone: r.phone ?? '',
    category: r.category ?? 'Other',
    location: r.addressLine ?? r.area ?? '',
    status: r.status === 'open' || r.status === 'busy' ? 'approved' : 'suspended',
    rating: Number(r.rating ?? 0),
    menuCount,
    deliveryKM: Number(r.deliveryKM ?? 0),
    joinedAt: toDate(r.createdAt),
    gradient: asGradient(r.gradient),
    emoji: r.emoji ?? '🍽️',
  };
};

const mapFoodDoc = (f: BackFoodDoc): AdminMenuItem => {
  const rawId = String(f._id ?? '');
  const id = registerId(`m_${last4(rawId)}`, rawId);
  const restaurantName =
    typeof f.restaurant === 'object' && f.restaurant ? (prop<string>(f.restaurant, 'name') ?? '') : String(f.restaurant ?? '');
  return {
    id,
    name: f.name ?? '',
    restaurant: restaurantName || 'General',
    category: f.category ?? 'Other',
    price: Number(f.price ?? 0),
    discount: 0,
    available: f.available ?? true,
    active: f.available ?? true,
    rating: Number(f.rating ?? 0),
    gradient: asGradient(f.gradient),
    emoji: f.emoji ?? '🍴',
  };
};

const mapAdminOrder = (o: BackOrder): AdminOrder => {
  const rawId = String(o._id ?? '');
  const id = registerId(o.orderNumber || `SWT-${last4(rawId)}`, rawId);
  const customer = typeof o.customer === 'object' && o.customer ? o.customer : undefined;
  const restaurant = typeof o.restaurant === 'object' && o.restaurant ? o.restaurant : undefined;
  const rider = typeof o.rider === 'object' && o.rider ? o.rider : undefined;
  const status = statusDisplay(o.status);
  orderBackendStatus.set(id, o.status ?? 'pending');
  return {
    id,
    customer: customer?.name ?? 'Customer',
    customerPhone: customer?.phone ?? '',
    restaurant: restaurant?.name ?? 'Restaurant',
    items: (o.items ?? []).map((i) => ({
      name: i.name ?? '',
      quantity: Number(i.quantity ?? 1),
      price: Number(i.price ?? 0),
    })),
    subtotal: Number(o.subtotal ?? 0),
    deliveryFee: Number(o.deliveryFee ?? 0),
    total: Number(o.total ?? 0),
    paymentMethod: o.paymentMethod ?? 'cash',
    paymentStatus: (o.paymentStatus ?? 'pending') as AdminOrder['paymentStatus'],
    status,
    rider: rider?.name,
    address: o.addressSnapshot?.full ?? o.addressSnapshot?.area ?? '',
    placedAt: toDate(o.createdAt),
    updatedAt: toDate(o.updatedAt, toDate(o.createdAt)),
  };
};

const mapAdminRide = (r: BackRide): AdminRide => {
  const rawId = String(r._id ?? '');
  const id = registerId(r.rideNumber || `RIDE-${last4(rawId)}`, rawId);
  const customer = typeof r.customer === 'object' && r.customer ? r.customer : undefined;
  const rider = typeof r.rider === 'object' && r.rider ? r.rider : undefined;
  const status = ['searching', 'accepted', 'arriving', 'started', 'completed', 'cancelled'].includes(r.status ?? '')
    ? (r.status as AdminRide['status'])
    : 'searching';
  const rideType = r.type === 'swat_moto' || r.type === 'swat_city' || r.type === 'swat_van' ? r.type : 'swat_city';
  return {
    id,
    customer: customer?.name ?? 'Customer',
    rider: rider?.name,
    pickup: r.pickup?.address ?? 'Pickup',
    dropoff: r.dropoff?.address ?? 'Drop-off',
    distanceKm: Number(r.distanceKm ?? 0),
    fare: Number(r.fare ?? 0),
    rideType,
    status,
    bookedAt: toDate(r.createdAt),
  };
};

const mapAdminPayment = (p: BackPayment): AdminPayment => {
  const rawId = String(p._id ?? '');
  const id = p.gatewayRef || `PAY-${last4(rawId)}`;
  const user = typeof p.user === 'object' && p.user ? p.user : undefined;
  const method = p.method === 'card' || p.method === 'jazzcash' || p.method === 'cash' || p.method === 'wallet' ? p.method : 'wallet';
  const status = p.status === 'paid' || p.status === 'failed' || p.status === 'refunded' ? p.status : 'pending';
  return {
    id,
    user: user?.name ?? 'User',
    role: user?.role === 'rider' || user?.role === 'admin' ? (user.role as AdminPayment['role']) : 'customer',
    ref: p.kind === 'topup' ? 'Wallet top-up' : p.kind === 'refund' ? 'Refund' : p.kind === 'ride' ? 'Ride' : 'Order',
    amount: Number(p.amount ?? 0),
    method,
    status,
    at: toDate(p.createdAt),
  };
};

const mapWalletTx = (t: BackWalletTx, idx: number): AdminWalletTx => {
  const rawId = String(t._id ?? '');
  const user = typeof t.user === 'object' && t.user ? t.user : undefined;
  const kind = t.type === 'credit' || t.type === 'debit' || t.type === 'refund' || t.type === 'earning' || t.type === 'commission'
    ? t.type
    : 'credit';
  return {
    id: rawId ? rawId : `wtx_${Date.now()}_${idx}`,
    user: user?.name ?? 'User',
    role: user?.role === 'rider' ? 'rider' : user?.role === 'admin' ? 'admin' : 'customer',
    kind,
    amount: Number(t.amount ?? 0),
    title: t.description || t.reference || 'Wallet transaction',
    at: toDate(t.createdAt),
  };
};

const mapPromo = (p: BackPromotion): AdminPromo => {
  const rawId = String(p._id ?? '');
  const id = registerId(`prm_${last4(rawId)}`, rawId);
  const ads = p.audience?.type;
  const audience: PromoAudience =
    ads === 'specific_riders' ? 'riders' : ads === 'new_customers' || ads === 'specific_users' ? 'customers' : 'all';
  patches.promoActive.set(id, Boolean(p.active ?? true));
  return {
    id,
    code: p.code ?? '',
    type: p.type === 'flat' ? 'fixed' : 'percent',
    value: Number(p.value ?? 0),
    minOrder: Number(p.minOrder ?? 0),
    maxDiscount: p.maxDiscount != null ? Number(p.maxDiscount) : undefined,
    startsOn: toDate(p.startsAt, ago(1 * DAY)),
    expiresOn: p.expiresAt ? new Date(p.expiresAt) : ago(-30 * DAY),
    usageLimit: Number(p.maxUses ?? 0),
    used: Number(p.usedCount ?? 0),
    active: Boolean(p.active ?? true),
    audience,
  };
};

const mapTicket = (t: BackTicket): AdminTicket => {
  const rawId = String(t._id ?? '');
  const id = registerId(`TKT-${last4(rawId)}`, rawId);
  const user = typeof t.user === 'object' && t.user ? t.user : undefined;
  const userId = user ? String(user?._id ?? '') : '';
  const status = patches.ticketStatus.get(id) ?? ((t.status ?? 'open') as TicketStatus);
  const replies = patches.ticketReplies.get(id) ?? [];
  const messages: TicketMessage[] = [
    ...(t.messages ?? []).map((m) => ({
      id: `${id}_m${Math.random().toString(36).slice(2, 8)}`,
      from: (m.from === userId ? 'user' : 'admin') as TicketMessage['from'],
      text: m.text ?? '',
      at: toDate(m.at),
    })),
    ...replies,
  ];
  return {
    id,
    user: user?.name ?? 'User',
    subject: t.subject ?? 'Support ticket',
    category: t.category ?? 'general',
    priority: t.priority === 'low' || t.priority === 'high' || t.priority === 'urgent' ? (t.priority as AdminTicket['priority']) : 'medium',
    status,
    createdAt: toDate(t.createdAt),
    updatedAt: toDate(t.updatedAt, toDate(t.createdAt)),
    messages,
  };
};

// ---------------------------------------------------------------------------
// Dashboard + reports (live preferred)
// ---------------------------------------------------------------------------

function buildDailySeries(charts: BackDashboard['charts'], range: ReportRange): { label: string; sales: number; orders: number }[] {
  if (!charts) return [];
  const weekly = charts.weeklyRevenue ?? [];
  const daily = charts.dailyOrders ?? [];
  const count = range === 'today' ? 1 : 7;
  const labels = weekly.length ? weekly.slice(-count).map((w) => w.label) : daily.slice(-count).map((d) => d.label);
  const salesByLabel = new Map(weekly.map((w) => [w.label, w.value ?? 0]));
  const ordersByLabel = new Map(daily.map((d) => [d.label, d.count ?? 0]));
  return labels.map((label) => ({ label, sales: salesByLabel.get(label) ?? 0, orders: ordersByLabel.get(label) ?? 0 }));
}

const RESTAURANT_EMOJIS = ['🥙', '🍛', '🍗', '🐟', '🍕'];
const RESTAURANT_GRADIENTS: [string, string][] = [
  ['#B05E1F', '#54250A'],
  ['#7A3B10', '#351603'],
  ['#93341D', '#3C0F05'],
  ['#2B7A78', '#0B3B39'],
  ['#B3543A', '#52160C'],
];

export function adminDashboard(): Promise<AdminDashboardData> {
  return _guard(async () => {
    return withFallback(
      async () => {
        const main = await httpGet<BackDashboard>('/admin/dashboard');
        const totals = main.data.totals ?? {};
        const statusCounts = main.data.statusCounts ?? {};
        const charts = main.data.charts ?? {};

        const [foodRes, rideRes, walletRes, restaurantRes] = await Promise.all([
          safe(httpGet<{ items?: unknown[] }>('/admin/food?limit=1')),
          safe(httpGet<{ rides?: BackRide[] }>('/admin/rides?limit=100')),
          safe(httpGet<{ wallets?: BackWallet[] }>('/admin/wallets?limit=100')),
          safe(httpGet<{ restaurants?: unknown[] }>('/admin/restaurants?limit=1')),
        ]);

        const foodItems = (foodRes?.meta as Meta | undefined)?.total ?? 0;
        const restaurants = (restaurantRes?.meta as Meta | undefined)?.total ?? totals.restaurants ?? 0;
        const rides = rideRes?.data?.rides ?? [];
        const activeRides = rides.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').length;
        const wallets = walletRes?.data?.wallets ?? [];
        const riderEarnings = wallets
          .filter((w) => w.user?.role === 'rider')
          .reduce((s, w) => s + Number(w.balance ?? 0), 0);

        const delivered = statusCounts.delivered ?? 0;
        const cancelled = statusCounts.cancelled ?? 0;
        const orders = totals.orders ?? 0;
        const customers = totals.customers ?? 0;
        const riders = totals.riders ?? 0;

        const summary = {
          users: customers + riders,
          customers,
          riders,
          restaurants,
          foodItems,
          activeOrders: Math.max(0, orders - delivered - cancelled),
          completedOrders: delivered,
          cancelledOrders: cancelled,
          activeRides,
          revenue: totals.revenue ?? 0,
          riderEarnings,
          pendingRiderApplications: totals.pendingRiderApprovals ?? 0,
          pendingRestaurants: 0,
          pendingOrders: statusCounts.pending ?? 0,
          supportTickets: totals.openTickets ?? 0,
        };

        const STATUS_LABELS: Record<string, string> = {
          pending: 'Pending',
          delivered: 'Delivered',
          cancelled: 'Cancelled',
          ready: 'Ready',
        };
        const statusSum = new Map<string, number>();
        for (const [raw, count] of Object.entries(statusCounts)) {
          if (typeof count !== 'number') continue;
          const label = STATUS_LABELS[raw] ?? 'Active';
          statusSum.set(label, (statusSum.get(label) ?? 0) + count);
        }
        const orderStatus = statusSum.size
          ? [...statusSum.entries()].map(([label, count]) => ({ label, count }))
          : [{ label: 'No orders', count: 1 }];

        const serviceSplit = (charts.serviceSplit ?? []).map((s) => ({
          label: (s.label === 'Ride' ? 'Rides' : 'Food') as 'Food' | 'Rides',
          count: s.count ?? 0,
        }));

        return {
          totals: summary,
          charts: {
            dailyOrders: charts.dailyOrders ?? [],
            weeklyRevenue: (charts.weeklyRevenue ?? []).map((w) => ({ label: w.label, amount: w.value ?? 0 })),
            monthlyRevenue: [],
            customerGrowth: charts.customerGrowth ?? [],
            riderGrowth: charts.riderGrowth ?? [],
            orderStatus,
            serviceSplit: serviceSplit.length ? serviceSplit : [{ label: 'Food', count: 0 }],
          },
        };
      },
      async () => ({ totals: dashboardTotals(), charts: dashboardCharts() }),
    );
  });
}

export function adminReport(range: ReportRange): Promise<AdminReport> {
  return _guard(async () => {
    const backendRange = range === 'custom' ? '30d' : range;
    return withFallback(
      async () => {
        const [rep, dash] = await Promise.all([
          httpGet<BackReport>(`/admin/reports?range=${backendRange}`),
          httpGet<BackDashboard>('/admin/dashboard'),
        ]);
        const revenue = rep.data.summary?.revenue ?? 0;
        const [custRes, riderRes] = await Promise.all([
          safe(httpGet<{ users?: unknown[] }>('/admin/users?limit=1&role=customer')),
          safe(httpGet<{ users?: unknown[] }>('/admin/users?limit=1&role=rider')),
        ]);
        return {
          range: backendRange as ReportRange,
          generatedAt: new Date(),
          salesTotal: revenue,
          orders: rep.data.summary?.orders ?? 0,
          rides: rep.data.summary?.rides ?? 0,
          revenue,
          riderEarnings: Math.round(revenue * 0.55),
          commission: Math.round(revenue * 0.24),
          customers: (custRes?.meta as Meta | undefined)?.total ?? 0,
          riders: (riderRes?.meta as Meta | undefined)?.total ?? 0,
          topRestaurants: (rep.data.topRestaurants ?? []).map((r, i) => ({
            name: r.name ?? `Restaurant ${i + 1}`,
            orders: r.orders ?? 0,
            revenue: r.revenue ?? 0,
            emoji: RESTAURANT_EMOJIS[i % RESTAURANT_EMOJIS.length] ?? '🍽️',
            gradient: RESTAURANT_GRADIENTS[i % RESTAURANT_GRADIENTS.length] ?? RESTAURANT_GRADIENTS[0],
          })),
          daily: buildDailySeries(dash.data.charts ?? {}, range),
        };
      },
      async () => {
        const daily = LABELS_7D.map((label, i) => ({ label, sales: [18, 24, 21, 29, 38, 44, 27][i % 7]! * 1000, orders: [24, 31, 28, 42, 55, 61, 38][i % 7]! }));
        return {
          range: range as ReportRange,
          generatedAt: new Date(),
          salesTotal: 462800,
          orders: 342,
          rides: 96,
          revenue: 351728,
          riderEarnings: 214500,
          commission: 84384,
          customers: 1120,
          riders: 104,
          topRestaurants: [
            { name: 'Chowkara Chapli House', orders: 128, revenue: 94120, emoji: '🥙', gradient: ['#B05E1F', '#54250A'] },
            { name: 'Swat Grill House', orders: 112, revenue: 102400, emoji: '🍗', gradient: ['#93341D', '#3C0F05'] },
            { name: 'Trout Point Cafe', orders: 89, revenue: 88650, emoji: '🐟', gradient: ['#2B7A78', '#0B3B39'] },
            { name: 'Dastarkhwan Biryani', orders: 76, revenue: 55120, emoji: '🍛', gradient: ['#7A3B10', '#351603'] },
          ],
          daily,
        };
      },
    );
  });
}

function _guard<T>(fn: () => Promise<T>): Promise<T> {
  return (async () => {
    await requireAdmin();
    await sleep(350);
    return fn();
  })();
}

// ---------------------------------------------------------------------------
// Public admin API — every method is guarded
// ---------------------------------------------------------------------------
export const adminApi = {
  dashboard: adminDashboard,
  report: adminReport,

  async getUsers(): Promise<AdminUser[]> {
    await requireAdmin();
    const list = await withFallback(
      async () => {
        const res = await httpGet<{ users?: BackUser[] }>('/admin/users?limit=200');
        return (res.data.users ?? []).map(mapAdminUser);
      },
      async () => [...adminUsers, ...adminRiders],
    );
    return patches.user.size === 0 ? list : list.map((u) => (patches.user.has(u.id) ? { ...u, ...patches.user.get(u.id) } : u));
  },

  async setUserStatus(id: string, status: AccountStatus): Promise<void> {
    await requireAdmin();
    const backend = status === 'active' ? 'active' : 'suspended';
    await withFallback(
      async () => {
        await httpPatch(`/admin/users/${id}/status`, { status: backend });
      },
      async () => undefined,
    );
    patches.user.set(id, { status });
    const u = adminUsers.find((x) => x.id === id) ?? adminRiders.find((x) => x.id === id);
    if (u) u.status = status;
  },

  async getRiders(): Promise<AdminRider[]> {
    await requireAdmin();
    const list = await withFallback(
      async () => {
        const res = await httpGet<{ riders?: BackRiderProfile[] }>('/admin/riders?limit=100');
        return (res.data.riders ?? []).map(mapRiderProfile);
      },
      async () => [...adminRiders],
    );
    return patches.user.size === 0 ? list : list.map((r) => (patches.user.has(r.id) ? { ...r, ...patches.user.get(r.id) } : r));
  },

  async verifyRider(id: string, approve: boolean): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        await httpPost(`/admin/riders/${id}/${approve ? 'approve' : 'reject'}`, {});
      },
      async () => undefined,
    );
    const r = adminRiders.find((x) => x.id === id);
    if (r) {
      r.applicationStatus = approve ? 'approved' : 'rejected';
      r.docStatus = approve ? 'verified' : 'rejected';
    }
  },

  async getRestaurants(): Promise<AdminRestaurant[]> {
    await requireAdmin();
    return withFallback(
      async () => {
        const [restRes, foodRes] = await Promise.all([
          httpGet<{ restaurants?: BackRestaurantDoc[] }>('/admin/restaurants?limit=100'),
          httpGet<{ items?: BackFoodDoc[] }>('/admin/food?limit=100'),
        ]);
        const menuCounts = new Map<string, number>();
        for (const f of foodRes.data.items ?? []) {
          const rid =
            typeof f.restaurant === 'object' && f.restaurant ? objId(f.restaurant) : String(f.restaurant ?? '');
          if (rid) menuCounts.set(rid, (menuCounts.get(rid) ?? 0) + 1);
        }
        const list = (restRes.data.restaurants ?? []).map((r) => {
          const named = r.name ?? '';
          if (named) restaurantByName.set(named, String(r._id ?? ''));
          return mapRestaurantDoc(r, menuCounts.get(String(r._id ?? '')) ?? 0);
        });
        return list.map((r) => (patches.restaurant.has(r.id) ? { ...r, ...patches.restaurant.get(r.id) } : r));
      },
      async () => [...adminRestaurants],
    );
  },

  async setRestaurantStatus(id: string, status: RestaurantStatus): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        await httpPatch(`/admin/restaurants/${resolveId(id)}`, { status: status === 'approved' ? 'open' : 'closed' });
      },
      async () => undefined,
    );
    patches.restaurant.set(id, { status });
    const r = adminRestaurants.find((x) => x.id === id);
    if (r) r.status = status;
  },

  async addRestaurant(input: Omit<AdminRestaurant, 'id' | 'rating' | 'menuCount' | 'joinedAt'>): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        const res = await httpPost<{ restaurant?: BackRestaurantDoc }>('/admin/restaurants', {
          name: input.name,
          category: input.category,
          status: input.status === 'approved' ? 'open' : 'closed',
          emoji: input.emoji,
          gradient: input.gradient,
          phone: input.ownerPhone,
          addressLine: input.location,
          area: input.location,
        });
        const created = res.data.restaurant;
        if (created?._id) {
          registerId(`rest_${last4(String(created._id))}`, String(created._id));
          if (created.name) restaurantByName.set(created.name, String(created._id));
        }
      },
      async () => undefined,
    );
    adminRestaurants.unshift({ ...input, id: `rest_${Date.now()}`, rating: 0, menuCount: 0, joinedAt: new Date() });
  },

  async updateRestaurant(id: string, patch: Partial<AdminRestaurant>): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        await httpPatch(`/admin/restaurants/${resolveId(id)}`, {
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.category ? { category: patch.category } : {}),
          ...(patch.status ? { status: patch.status === 'approved' ? 'open' : 'closed' } : {}),
          ...(patch.emoji ? { emoji: patch.emoji } : {}),
          ...(patch.gradient ? { gradient: patch.gradient } : {}),
          ...(patch.ownerPhone ? { phone: patch.ownerPhone } : {}),
          ...(patch.location ? { addressLine: patch.location, area: patch.location } : {}),
        });
      },
      async () => undefined,
    );
    patches.restaurant.set(id, { ...patch });
    const r = adminRestaurants.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  },

  async getMenu(): Promise<AdminMenuItem[]> {
    await requireAdmin();
    const list = await withFallback(
      async () => {
        const res = await httpGet<{ items?: BackFoodDoc[] }>('/admin/food?limit=100');
        return (res.data.items ?? []).map(mapFoodDoc);
      },
      async () => [...adminMenuItems],
    );
    return patches.menu.size === 0 ? list : list.map((m) => (patches.menu.has(m.id) ? { ...m, ...patches.menu.get(m.id) } : m));
  },

  async setMenuItem(id: string, patch: Partial<AdminMenuItem>): Promise<void> {
    await requireAdmin();
    const payload: Record<string, unknown> = {};
    if (patch.price != null) payload.price = patch.price;
    if (patch.available != null) payload.available = patch.available;
    if (patch.category != null) payload.category = patch.category;
    if (patch.emoji != null) payload.emoji = patch.emoji;
    if (Object.keys(payload).length > 0) {
      await withFallback(
        async () => {
          await httpPatch(`/admin/food/${resolveId(id)}`, payload);
        },
        async () => undefined,
      );
    }
    patches.menu.set(id, { ...patch });
    const m = adminMenuItems.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  },

  async addMenuItem(input: Omit<AdminMenuItem, 'id' | 'rating'>): Promise<void> {
    await requireAdmin();
    const restaurantId = await resolveRestaurantId(input.restaurant);
    await withFallback(
      async () => {
        if (!restaurantId) throw new Error('Restaurant not resolved');
        const res = await httpPost<{ item?: BackFoodDoc }>('/admin/food', {
          restaurantId,
          name: input.name,
          category: input.category,
          price: input.price,
          emoji: input.emoji,
          available: input.available ?? true,
        });
        const created = res.data.item;
        if (created?._id) registerId(`m_${last4(String(created._id))}`, String(created._id));
      },
      async () => undefined,
    );
    adminMenuItems.unshift({ ...input, id: `m_${Date.now()}`, rating: 0 });
  },

  async deleteMenuItem(id: string): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        await httpDelete(`/admin/food/${resolveId(id)}`);
      },
      async () => undefined,
    );
    const i = adminMenuItems.findIndex((x) => x.id === id);
    if (i >= 0) adminMenuItems.splice(i, 1);
  },

  async getOrders(): Promise<AdminOrder[]> {
    await requireAdmin();
    return withFallback(
      async () => {
        const res = await httpGet<{ orders?: BackOrder[] }>('/admin/orders?limit=100');
        return (res.data.orders ?? []).map(mapAdminOrder);
      },
      async () => [...adminOrders],
    );
  },

  async setOrderStatus(id: string, status: AdminOrderStatus): Promise<void> {
    await requireAdmin();
    const bid = resolveId(id);
    const target = statusBackend(status);
    const current = orderBackendStatus.get(id) ?? 'pending';
    const chain = status === 'cancelled' ? (current === 'cancelled' ? [] : ['cancelled']) : orderSteps(current, target);
    if (chain.length > 0) {
      await withFallback(
        async () => {
          for (const step of chain) {
            if (step === 'cancelled') {
              await httpPost(`/admin/orders/${bid}/cancel`, { reason: 'Cancelled by admin' });
            } else {
              await httpPatch(`/admin/orders/${bid}/status`, { status: step });
            }
          }
        },
        async () => undefined,
      );
    }
    orderBackendStatus.set(id, target);
    const o = adminOrders.find((x) => x.id === id);
    if (o) {
      o.status = status;
      o.updatedAt = new Date();
    }
  },

  async getRides(): Promise<AdminRide[]> {
    await requireAdmin();
    const list = await withFallback(
      async () => {
        const res = await httpGet<{ rides?: BackRide[] }>('/admin/rides?limit=100');
        return (res.data.rides ?? []).map(mapAdminRide);
      },
      async () => [...adminRides],
    );
    return patches.ride.size === 0 ? list : list.map((r) => (patches.ride.has(r.id) ? { ...r, ...patches.ride.get(r.id) } : r));
  },

  async setRideStatus(id: string, status: AdminRide['status']): Promise<void> {
    await requireAdmin();
    if (status === 'cancelled') {
      await withFallback(
        async () => {
          await httpPost(`/admin/rides/${resolveId(id)}/cancel`, { reason: 'Cancelled by admin' });
        },
        async () => undefined,
      );
    }
    const patch: Partial<AdminRide> = { status };
    if (status === 'completed') patch.completedAt = new Date();
    patches.ride.set(id, patch);
    const r = adminRides.find((x) => x.id === id);
    if (r) {
      r.status = status;
      if (status === 'completed') r.completedAt = new Date();
    }
  },

  async getPayments(): Promise<AdminPayment[]> {
    await requireAdmin();
    return withFallback(
      async () => {
        const res = await httpGet<{ payments?: BackPayment[] }>('/admin/payments?limit=100');
        return (res.data.payments ?? []).map(mapAdminPayment);
      },
      async () => [...adminPayments],
    );
  },

  async getWalletOverview(): Promise<AdminWalletOverview> {
    await requireAdmin();
    return withFallback(
      async () => {
        const [walres, txres] = await Promise.all([
          httpGet<{ wallets?: BackWallet[] }>('/admin/wallets?limit=100'),
          httpGet<{ transactions?: BackWalletTx[] }>('/admin/transactions?limit=100'),
        ]);
        const wallets = walres.data.wallets ?? [];
        const transactions = (txres.data.transactions ?? []).map((t, i) => mapWalletTx(t, i));
        return {
          customerBalance: wallets.filter((w) => w.user?.role === 'customer').reduce((s, w) => s + Number(w.balance ?? 0), 0),
          riderBalance: wallets.filter((w) => w.user?.role === 'rider').reduce((s, w) => s + Number(w.balance ?? 0), 0),
          platformCommission: transactions.filter((t) => t.kind === 'commission').reduce((s, t) => s + t.amount, 0),
          transactions,
        };
      },
      async () => ({
        customerBalance: adminUsers.filter((u) => u.role === 'customer').reduce((s, u) => s + u.walletBalance, 0),
        riderBalance: adminRiders.reduce((s, r) => s + r.walletBalance, 0),
        platformCommission: adminWalletTxs.filter((t) => t.kind === 'commission').reduce((s, t) => s + t.amount, 0),
        transactions: [...adminWalletTxs],
      }),
    );
  },

  async getPromotions(): Promise<AdminPromo[]> {
    await requireAdmin();
    return withFallback(
      async () => {
        const res = await httpGet<{ promotions?: BackPromotion[] }>('/admin/promotions?limit=100');
        return (res.data.promotions ?? [])
          .map(mapPromo)
          .filter((p) => !patches.promoDeleted.has(p.id))
          .map((p) => (patches.promoActive.has(p.id) ? { ...p, active: patches.promoActive.get(p.id)! } : p));
      },
      async () => [...adminPromos],
    );
  },

  async togglePromo(id: string): Promise<void> {
    await requireAdmin();
    const current = patches.promoActive.get(id) ?? adminPromos.find((p) => p.id === id)?.active ?? true;
    const next = !current;
    await withFallback(
      async () => {
        await httpPatch(`/admin/promotions/${resolveId(id)}`, { active: next });
      },
      async () => undefined,
    );
    patches.promoActive.set(id, next);
    const p = adminPromos.find((x) => x.id === id);
    if (p) p.active = next;
  },

  async deletePromo(id: string): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        await httpDelete(`/admin/promotions/${resolveId(id)}`);
      },
      async () => undefined,
    );
    patches.promoDeleted.add(id);
    const i = adminPromos.findIndex((x) => x.id === id);
    if (i >= 0) adminPromos.splice(i, 1);
  },

  async addPromo(input: Omit<AdminPromo, 'id' | 'used'>): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        const res = await httpPost<{ promotion?: BackPromotion }>('/admin/promotions', {
          code: input.code,
          title: `Promo ${input.code}`,
          type: input.type === 'fixed' ? 'flat' : 'percent',
          value: input.value,
          minOrder: input.minOrder,
          ...(input.maxDiscount != null ? { maxDiscount: input.maxDiscount } : {}),
          audience: { type: input.audience === 'riders' ? 'specific_riders' : input.audience === 'customers' ? 'new_customers' : 'all' },
          startsAt: input.startsOn.toISOString(),
          expiresAt: input.expiresOn.toISOString(),
          ...(input.usageLimit > 0 ? { maxUses: input.usageLimit } : {}),
          active: input.active,
        });
        const created = res.data.promotion;
        if (created?._id) registerId(`prm_${last4(String(created._id))}`, String(created._id));
      },
      async () => undefined,
    );
    adminPromos.unshift({ ...input, id: `prm_${Date.now()}`, used: 0 });
  },

  async getNotifications(): Promise<AdminNotification[]> {
    await requireAdmin();
    await sleep();
    return [...adminNotifications];
  },

  async sendNotification(input: { title: string; body: string; audience: NotificationAudience; toName?: string }): Promise<void> {
    await requireAdmin();
    await sleep(250);
    adminNotifications.unshift({ ...input, id: `n_admin_${Date.now()}`, status: 'sent', at: new Date() });
  },

  async getTickets(): Promise<AdminTicket[]> {
    await requireAdmin();
    const list = await withFallback(
      async () => {
        const res = await httpGet<{ tickets?: BackTicket[] }>('/admin/support?limit=100');
        return (res.data.tickets ?? []).map(mapTicket);
      },
      async () => {
        return [...adminTickets].map((t) => {
          const status = patches.ticketStatus.get(t.id) ?? t.status;
          const replies = patches.ticketReplies.get(t.id) ?? [];
          return status === t.status && replies.length === 0 ? t : { ...t, status, messages: [...t.messages, ...replies], updatedAt: new Date() };
        });
      },
    );
    return [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  async replyToTicket(id: string, text: string, markResolved: boolean): Promise<void> {
    await requireAdmin();
    const status = markResolved ? 'resolved' : 'in_progress';
    await withFallback(
      async () => {
        await httpPatch(`/admin/support/${resolveId(id)}`, { status });
      },
      async () => undefined,
    );
    const reply: TicketMessage = { id: `a_${Date.now()}`, from: 'admin', text, at: new Date() };
    patches.ticketStatus.set(id, status);
    patches.ticketReplies.set(id, [...(patches.ticketReplies.get(id) ?? []), reply]);
    const t = adminTickets.find((x) => x.id === id);
    if (t) {
      t.messages.push(reply);
      t.status = status;
      t.updatedAt = new Date();
    }
  },

  async setTicketStatus(id: string, status: TicketStatus): Promise<void> {
    await requireAdmin();
    await withFallback(
      async () => {
        await httpPatch(`/admin/support/${resolveId(id)}`, { status });
      },
      async () => undefined,
    );
    patches.ticketStatus.set(id, status);
    const t = adminTickets.find((x) => x.id === id);
    if (t) {
      t.status = status;
      t.updatedAt = new Date();
    }
  },

  async getSettings(): Promise<AdminSettings> {
    await requireAdmin();
    return withFallback(
      async () => {
        const res = await httpGet<{ settings?: BackSetting[] }>('/admin/settings');
        const map = new Map<string, unknown>();
        for (const s of res.data.settings ?? []) map.set(s.key, s.value);
        const num = (key: string, dflt: number) => {
          const v = Number(map.get(key));
          return Number.isFinite(v) && v > 0 ? v : dflt;
        };
        const str = (key: string, dflt: string) => {
          const v = map.get(key);
          return typeof v === 'string' && v ? v : dflt;
        };
        return {
          ...adminSettingsData,
          minOrder: num('min_order_amount', adminSettingsData.minOrder),
          supportPhone: str('support_phone', adminSettingsData.supportPhone),
          supportEmail: str('support_email', adminSettingsData.supportEmail),
          currency: str('currency', adminSettingsData.currency),
        };
      },
      async () => ({ ...adminSettingsData }),
    );
  },

  async updateSettings(patch: Partial<AdminSettings>): Promise<AdminSettings> {
    await requireAdmin();
    Object.assign(adminSettingsData, patch);
    const KEY_MAP: Record<string, string> = {
      deliveryFee: 'platform_fee',
      minOrder: 'min_order_amount',
      supportPhone: 'support_phone',
      supportEmail: 'support_email',
      currency: 'currency',
    };
    const synced: Record<string, unknown> = {};
    for (const [k, key] of Object.entries(KEY_MAP)) {
      if (k in patch) synced[key] = (patch as Record<string, unknown>)[k];
    }
    const jobs = Object.entries(synced).map(([key, value]) =>
      httpPatch(`/admin/settings/${key}`, { value })
        .then(() => true)
        .catch(() => false),
    );
    await Promise.all(jobs);
    return { ...adminSettingsData };
  },
};

async function resolveRestaurantId(name?: string): Promise<string | undefined> {
  if (!name) return undefined;
  if (restaurantByName.has(name)) return restaurantByName.get(name);
  try {
    const res = await httpGet<{ restaurants?: BackRestaurantDoc[] }>('/admin/restaurants?limit=100');
    for (const r of res.data.restaurants ?? []) {
      if (r.name) restaurantByName.set(r.name, String(r._id ?? ''));
    }
  } catch {
    /* ignore — best effort */
  }
  return restaurantByName.get(name);
}