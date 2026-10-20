import { authApi, asGradient, objId, prop, roleGradient } from './api';
import { httpGet, httpPost, httpPatch, httpDelete, httpUpload } from './client';
import type { VehicleType, LiveRider } from '../types/domain';
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
  AdminWithdrawal,
  DashboardCharts,
  NotificationAudience,
  PromoAudience,
  ReportRange,
  RestaurantStatus,
  TicketMessage,
  TicketStatus,
  WithdrawalStatus,
} from '../types/admin';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Optional call: returns null instead of throwing when a secondary fetch fails. */
const safe = async <T>(p: Promise<T>): Promise<T | null> => p.then((v) => v).catch(() => null);

const toDate = (v?: string | Date, dflt = new Date()): Date => (v ? new Date(v) : new Date(dflt));

const last4 = (v?: string): string =>
  String(v ?? '')
    .replace(/[^0-9a-fA-F]/g, '')
    .slice(-4)
    .toUpperCase();

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
  avatarUrl?: string | null;
  avatarPublicId?: string | null;
  rejectionReason?: string | null;
  cnic?: string | null;
  cnicIssueDate?: string | null;
  lastLocation?: { lat?: number; lng?: number; heading?: number; updatedAt?: string | Date } | null;
  pendingVehicle?: {
    vehicleType?: string | null;
    vehicleBrand?: string | null;
    vehiclePlate?: string | null;
    requestedAt?: string | Date | null;
    note?: string | null;
  } | null;
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

type BackWithdrawal = {
  _id?: string;
  reference?: string;
  amount?: number;
  availableBalance?: number;
  destinationType?: string;
  destination?: string;
  destinationHolder?: string;
  status?: string;
  note?: string | null;
  rejectReason?: string | null;
  payoutReference?: string | null;
  rider?: BackUser | string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
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
    pendingWithdrawals?: number;
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
// Display id ↔ backend id registry
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

/** Latest known backend status per order id, so the UI can compute a safe step chain. */
const orderBackendStatus = new Map<string, string>();
const restaurantByName = new Map<string, string>();

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const mapAdminUser = (u: BackUser): AdminUser => ({
  id: String(u._id ?? ''),
  name: u.name ?? '',
  phone: u.phone ?? '',
  email: u.email ?? '',
  role: u.role === 'rider' || u.role === 'admin' ? (u.role as AdminUser['role']) : 'customer',
  status:
    u.status === 'suspended' ? 'suspended' : u.status === 'deactivated' ? 'deactivated' : 'active',
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
  const vehicle =
    p.vehicleType === 'car'
      ? 'sedan'
      : p.vehicleType === 'bike' || p.vehicleType === 'rickshaw' || p.vehicleType === 'van'
        ? p.vehicleType
        : 'bike';
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
    applicationStatus:
      p.approvalStatus === 'approved' || p.approvalStatus === 'rejected'
        ? p.approvalStatus
        : 'pending',
    docStatus:
      p.approvalStatus === 'approved'
        ? 'verified'
        : p.approvalStatus === 'rejected'
          ? 'rejected'
          : 'pending',
    earnings: 0,
    deliveries: Number(p.totalTrips ?? 0),
    avatarUrl: p.avatarUrl ?? null,
    rejectionReason: p.rejectionReason ?? null,
    hasApprovedPhoto: Boolean(p.avatarUrl),
    cnic: p.cnic ?? null,
    cnicIssueDate: p.cnicIssueDate ?? null,
    pendingVehicle: p.pendingVehicle?.requestedAt
      ? {
          vehicleType: p.pendingVehicle.vehicleType ?? null,
          vehicleBrand: p.pendingVehicle.vehicleBrand ?? null,
          vehiclePlate: p.pendingVehicle.vehiclePlate ?? null,
          requestedAt: toDate(p.pendingVehicle.requestedAt).toISOString(),
          note: p.pendingVehicle.note ?? null,
        }
      : null,
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
    typeof f.restaurant === 'object' && f.restaurant
      ? (prop<string>(f.restaurant, 'name') ?? '')
      : String(f.restaurant ?? '');
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
  const status = [
    'searching',
    'accepted',
    'arriving',
    'started',
    'completed',
    'cancelled',
  ].includes(r.status ?? '')
    ? (r.status as AdminRide['status'])
    : 'searching';
  const rideType =
    r.type === 'swat_moto' || r.type === 'swat_city' || r.type === 'swat_van'
      ? r.type
      : 'swat_city';
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

const mapAdminWithdrawal = (w: BackWithdrawal): AdminWithdrawal => {
  const rawId = String(w._id ?? '');
  const id = registerId(`WD-${last4(rawId)}`, rawId);
  const rider = typeof w.rider === 'object' && w.rider ? w.rider : undefined;
  const status = (
    ['pending', 'approved', 'processing', 'paid', 'rejected', 'cancelled'].includes(w.status ?? '')
      ? w.status
      : 'pending'
  ) as WithdrawalStatus;
  return {
    id,
    reference: w.reference || id,
    rider: rider?.name ?? 'Rider',
    riderPhone: rider?.phone ?? '',
    amount: Number(w.amount ?? 0),
    availableBalance: Number(w.availableBalance ?? 0),
    destinationType: w.destinationType === 'bank' ? 'bank' : 'easypaisa',
    destination: w.destination ?? '',
    destinationHolder: w.destinationHolder ?? '',
    status,
    note: w.note ?? undefined,
    rejectReason: w.rejectReason ?? undefined,
    payoutReference: w.payoutReference ?? undefined,
    requestNote: w.note ?? undefined,
    createdAt: toDate(w.createdAt),
    updatedAt: toDate(w.updatedAt, toDate(w.createdAt)),
  };
};

const mapAdminPayment = (p: BackPayment): AdminPayment => {
  const rawId = String(p._id ?? '');
  const id = p.gatewayRef || `PAY-${last4(rawId)}`;
  const user = typeof p.user === 'object' && p.user ? p.user : undefined;
  // Payments can only be Easypaisa or JazzCash. Legacy `card`/`cash`/`wallet`
  // rows may still exist in the database, so they are shown under the gateway
  // that actually settled them rather than inventing a method the UI no longer
  // supports.
  const method = p.method === 'jazzcash' ? 'jazzcash' : 'easypaisa';
  const status =
    p.status === 'paid' || p.status === 'failed' || p.status === 'refunded' ? p.status : 'pending';
  return {
    id,
    user: user?.name ?? 'User',
    role:
      user?.role === 'rider' || user?.role === 'admin'
        ? (user.role as AdminPayment['role'])
        : 'customer',
    ref:
      p.kind === 'topup'
        ? 'Wallet top-up'
        : p.kind === 'refund'
          ? 'Refund'
          : p.kind === 'ride'
            ? 'Ride'
            : 'Order',
    amount: Number(p.amount ?? 0),
    method,
    status,
    at: toDate(p.createdAt),
  };
};

const mapWalletTx = (t: BackWalletTx, idx: number): AdminWalletTx => {
  const rawId = String(t._id ?? '');
  const user = typeof t.user === 'object' && t.user ? t.user : undefined;
  const kind =
    t.type === 'credit' ||
    t.type === 'debit' ||
    t.type === 'refund' ||
    t.type === 'earning' ||
    t.type === 'commission'
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
    ads === 'specific_riders'
      ? 'riders'
      : ads === 'new_customers' || ads === 'specific_users'
        ? 'customers'
        : 'all';
  return {
    id,
    code: p.code ?? '',
    type: p.type === 'flat' ? 'fixed' : 'percent',
    value: Number(p.value ?? 0),
    minOrder: Number(p.minOrder ?? 0),
    maxDiscount: p.maxDiscount != null ? Number(p.maxDiscount) : undefined,
    startsOn: toDate(p.startsAt),
    expiresOn: toDate(p.expiresAt, toDate(p.startsAt)),
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
  const messages: TicketMessage[] = (t.messages ?? []).map((m) => ({
    id: `${id}_m${Math.random().toString(36).slice(2, 8)}`,
    from: (m.from === userId ? 'user' : 'admin') as TicketMessage['from'],
    text: m.text ?? '',
    at: toDate(m.at),
  }));
  return {
    id,
    user: user?.name ?? 'User',
    subject: t.subject ?? 'Support ticket',
    category: t.category ?? 'general',
    priority:
      t.priority === 'low' || t.priority === 'high' || t.priority === 'urgent'
        ? (t.priority as AdminTicket['priority'])
        : 'medium',
    status: (t.status ?? 'open') as TicketStatus,
    createdAt: toDate(t.createdAt),
    updatedAt: toDate(t.updatedAt, toDate(t.createdAt)),
    messages,
  };
};

// ---------------------------------------------------------------------------
// Dashboard + reports (live only — no fabricated fallback)
// ---------------------------------------------------------------------------

function buildDailySeries(
  charts: BackDashboard['charts'],
  range: ReportRange,
): { label: string; sales: number; orders: number }[] {
  if (!charts) return [];
  const weekly = charts.weeklyRevenue ?? [];
  const daily = charts.dailyOrders ?? [];
  const count = range === 'today' ? 1 : 7;
  const labels = weekly.length
    ? weekly.slice(-count).map((w) => w.label)
    : daily.slice(-count).map((d) => d.label);
  const salesByLabel = new Map(weekly.map((w) => [w.label, w.value ?? 0]));
  const ordersByLabel = new Map(daily.map((d) => [d.label, d.count ?? 0]));
  return labels.map((label) => ({
    label,
    sales: salesByLabel.get(label) ?? 0,
    orders: ordersByLabel.get(label) ?? 0,
  }));
}

const RESTAURANT_EMOJIS = ['🍽️', '🍽️', '🍽️', '🍽️', '🍽️'];
const RESTAURANT_GRADIENTS: [string, string][] = [
  ['#B05E1F', '#54250A'],
  ['#7A3B10', '#351603'],
  ['#93341D', '#3C0F05'],
  ['#2B7A78', '#0B3B39'],
  ['#B3543A', '#52160C'],
];

export function adminDashboard(): Promise<AdminDashboardData> {
  return _guard(async () => {
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
    const activeRides = rides.filter(
      (r) => r.status !== 'completed' && r.status !== 'cancelled',
    ).length;
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
      pendingWithdrawals: totals.pendingWithdrawals ?? 0,
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
        weeklyRevenue: (charts.weeklyRevenue ?? []).map((w) => ({
          label: w.label,
          amount: w.value ?? 0,
        })),
        monthlyRevenue: [] as DashboardCharts['monthlyRevenue'],
        customerGrowth: charts.customerGrowth ?? [],
        riderGrowth: charts.riderGrowth ?? [],
        orderStatus,
        serviceSplit: serviceSplit.length ? serviceSplit : [{ label: 'Food', count: 0 }],
      },
    };
  });
}

export function adminReport(range: ReportRange): Promise<AdminReport> {
  return _guard(async () => {
    const backendRange = range === 'custom' ? '30d' : range;
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
  });
}

function _guard<T>(fn: () => Promise<T>): Promise<T> {
  return (async () => {
    await requireAdmin();
    return fn();
  })();
}

// ---------------------------------------------------------------------------
// Settings defaults (used only to fill gaps the backend has no value for)
// ---------------------------------------------------------------------------

const adminSettingsDefaults: AdminSettings = {
  deliveryFee: 99,
  rideBaseFare: 90,
  ridePerKm: 28,
  commissionPct: 24,
  minOrder: 350,
  currency: 'PKR',
  supportPhone: '',
  supportEmail: '',
  maintenanceMode: false,
  sendOrderUpdates: true,
  sendRideUpdates: true,
  sendPromotions: true,
  termsUrl: '',
  privacyUrl: '',
};

// ---------------------------------------------------------------------------
// Public admin API — every method is guarded and talks to the live backend.
// ---------------------------------------------------------------------------
export const adminApi = {
  dashboard: adminDashboard,
  report: adminReport,

  async getUsers(): Promise<AdminUser[]> {
    await requireAdmin();
    const res = await httpGet<{ users?: BackUser[] }>('/admin/users?limit=200');
    return (res.data.users ?? []).map(mapAdminUser);
  },

  async setUserStatus(id: string, status: AccountStatus): Promise<void> {
    await requireAdmin();
    const backend = status === 'active' ? 'active' : 'suspended';
    await httpPatch(`/admin/users/${id}/status`, { status: backend });
  },

  async getRiders(): Promise<AdminRider[]> {
    await requireAdmin();
    const res = await httpGet<{ riders?: BackRiderProfile[] }>('/admin/riders?limit=100');
    return (res.data.riders ?? []).map(mapRiderProfile);
  },

  /**
   * Approve or reject a rider.
   *
   * Rejection requires a reason: the backend rejects an empty body with 422 and
   * the reason is what the rider sees in their profile, so it is a required
   * argument on the rejecting branch rather than an optional extra.
   */
  async verifyRider(id: string, approve: boolean, reason?: string): Promise<void> {
    await requireAdmin();
    if (!approve && !reason?.trim()) {
      throw new Error('A rejection reason is required');
    }
    await httpPost(
      `/admin/riders/${id}/${approve ? 'approve' : 'reject'}`,
      approve ? {} : { reason: reason!.trim() },
    );
  },

  /**
   * Set the rider's approved profile photo. Admin-only by design: this is the
   * only path that writes `avatarUrl`, and the rider app has no equivalent.
   */
  async uploadRiderAvatar(id: string, localUri: string, fileName = 'avatar.jpg'): Promise<string> {
    await requireAdmin();
    const form = new FormData();
    form.append('photo', { uri: localUri, name: fileName, type: 'image/jpeg' } as unknown as Blob);
    const res = await httpUpload<{ avatarUrl: string }>(`/admin/riders/${id}/avatar`, form);
    return res.data.avatarUrl;
  },

  /** Confirm or correct the rider's bike registration number. */
  async setRiderPlate(id: string, plateNumber: string): Promise<void> {
    await requireAdmin();
    await httpPatch(`/admin/riders/${id}/vehicle`, { vehiclePlate: plateNumber.trim() });
  },

  /**
   * Approve the vehicle change a rider proposed. Copies the proposal onto the
   * live vehicle fields, so this is the only path a rider-chosen vehicle takes
   * to reach dispatch.
   */
  async approveRiderVehicle(id: string): Promise<void> {
    await requireAdmin();
    await httpPost(`/admin/riders/${id}/vehicle/approve`, {});
  },

  /** Reject a queued vehicle change; the rider's current details stay active. */
  async rejectRiderVehicle(id: string, reason?: string): Promise<void> {
    await requireAdmin();
    await httpPost(`/admin/riders/${id}/vehicle/reject`, reason?.trim() ? { reason } : {});
  },

  /** Approved riders with a reported position, for the admin live map. */
  async liveRiders(status?: 'online' | 'offline' | 'busy' | 'all'): Promise<LiveRider[]> {
    await requireAdmin();
    const res = await httpGet<{ riders?: LiveRider[] }>(
      `/admin/riders-live${status && status !== 'all' ? `?status=${status}` : ''}`,
    );
    return res.data.riders ?? [];
  },

  async getRestaurants(): Promise<AdminRestaurant[]> {
    await requireAdmin();
    const [restRes, foodRes] = await Promise.all([
      httpGet<{ restaurants?: BackRestaurantDoc[] }>('/admin/restaurants?limit=100'),
      httpGet<{ items?: BackFoodDoc[] }>('/admin/food?limit=100'),
    ]);
    const menuCounts = new Map<string, number>();
    for (const f of foodRes.data.items ?? []) {
      const rid =
        typeof f.restaurant === 'object' && f.restaurant
          ? objId(f.restaurant)
          : String(f.restaurant ?? '');
      if (rid) menuCounts.set(rid, (menuCounts.get(rid) ?? 0) + 1);
    }
    return (restRes.data.restaurants ?? []).map((r) => {
      const named = r.name ?? '';
      if (named) restaurantByName.set(named, String(r._id ?? ''));
      return mapRestaurantDoc(r, menuCounts.get(String(r._id ?? '')) ?? 0);
    });
  },

  async setRestaurantStatus(id: string, status: RestaurantStatus): Promise<void> {
    await requireAdmin();
    await httpPatch(`/admin/restaurants/${resolveId(id)}`, {
      status: status === 'approved' ? 'open' : 'closed',
    });
  },

  async addRestaurant(
    input: Omit<AdminRestaurant, 'id' | 'rating' | 'menuCount' | 'joinedAt'>,
  ): Promise<void> {
    await requireAdmin();
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

  async updateRestaurant(id: string, patch: Partial<AdminRestaurant>): Promise<void> {
    await requireAdmin();
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

  async getMenu(): Promise<AdminMenuItem[]> {
    await requireAdmin();
    const res = await httpGet<{ items?: BackFoodDoc[] }>('/admin/food?limit=100');
    return (res.data.items ?? []).map(mapFoodDoc);
  },

  async setMenuItem(id: string, patch: Partial<AdminMenuItem>): Promise<void> {
    await requireAdmin();
    const payload: Record<string, unknown> = {};
    if (patch.price != null) payload.price = patch.price;
    if (patch.available != null) payload.available = patch.available;
    if (patch.category != null) payload.category = patch.category;
    if (patch.emoji != null) payload.emoji = patch.emoji;
    if (Object.keys(payload).length > 0) {
      await httpPatch(`/admin/food/${resolveId(id)}`, payload);
    }
  },

  async addMenuItem(input: Omit<AdminMenuItem, 'id' | 'rating'>): Promise<void> {
    await requireAdmin();
    const restaurantId = await resolveRestaurantId(input.restaurant);
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

  async deleteMenuItem(id: string): Promise<void> {
    await requireAdmin();
    await httpDelete(`/admin/food/${resolveId(id)}`);
  },

  async getOrders(): Promise<AdminOrder[]> {
    await requireAdmin();
    const res = await httpGet<{ orders?: BackOrder[] }>('/admin/orders?limit=100');
    return (res.data.orders ?? []).map(mapAdminOrder);
  },

  async setOrderStatus(id: string, status: AdminOrderStatus): Promise<void> {
    await requireAdmin();
    const bid = resolveId(id);
    const target = statusBackend(status);
    const current = orderBackendStatus.get(id) ?? 'pending';
    const chain =
      status === 'cancelled'
        ? current === 'cancelled'
          ? []
          : ['cancelled']
        : orderSteps(current, target);
    for (const step of chain) {
      if (step === 'cancelled') {
        await httpPost(`/admin/orders/${bid}/cancel`, { reason: 'Cancelled by admin' });
      } else {
        await httpPatch(`/admin/orders/${bid}/status`, { status: step });
      }
    }
    orderBackendStatus.set(id, target);
  },

  async getRides(): Promise<AdminRide[]> {
    await requireAdmin();
    const res = await httpGet<{ rides?: BackRide[] }>('/admin/rides?limit=100');
    return (res.data.rides ?? []).map(mapAdminRide);
  },

  async setRideStatus(id: string, status: AdminRide['status']): Promise<void> {
    await requireAdmin();
    if (status === 'cancelled') {
      await httpPost(`/admin/rides/${resolveId(id)}/cancel`, { reason: 'Cancelled by admin' });
    }
  },

  async getPayments(): Promise<AdminPayment[]> {
    await requireAdmin();
    const res = await httpGet<{ payments?: BackPayment[] }>('/admin/payments?limit=100');
    return (res.data.payments ?? []).map(mapAdminPayment);
  },

  async getWithdrawals(filter?: { status?: string; search?: string }): Promise<AdminWithdrawal[]> {
    await requireAdmin();
    const params = new URLSearchParams({ limit: '100' });
    if (filter?.status && filter.status !== 'all') params.set('status', filter.status);
    if (filter?.search) params.set('search', filter.search);
    const res = await httpGet<{ withdrawals?: BackWithdrawal[] }>(
      `/admin/withdrawals?${params.toString()}`,
    );
    return (res.data.withdrawals ?? []).map(mapAdminWithdrawal);
  },

  async approveWithdrawal(id: string): Promise<void> {
    await requireAdmin();
    await httpPost(`/admin/withdrawals/${resolveId(id)}/approve`);
  },

  async processWithdrawal(id: string): Promise<void> {
    await requireAdmin();
    await httpPost(`/admin/withdrawals/${resolveId(id)}/process`);
  },

  async rejectWithdrawal(id: string, reason: string): Promise<void> {
    await requireAdmin();
    if (!reason.trim()) throw new Error('A rejection reason is required');
    await httpPost(`/admin/withdrawals/${resolveId(id)}/reject`, { reason: reason.trim() });
  },

  /** Record the external transfer. Only valid while the request is processing. */
  async payWithdrawal(id: string, payoutReference: string): Promise<void> {
    await requireAdmin();
    if (!payoutReference.trim()) throw new Error('payoutReference is required');
    await httpPost(`/admin/withdrawals/${resolveId(id)}/pay`, {
      payoutReference: payoutReference.trim(),
    });
  },

  async getWalletOverview(): Promise<AdminWalletOverview> {
    await requireAdmin();
    const [walres, txres] = await Promise.all([
      httpGet<{ wallets?: BackWallet[] }>('/admin/wallets?limit=100'),
      httpGet<{ transactions?: BackWalletTx[] }>('/admin/transactions?limit=100'),
    ]);
    const wallets = walres.data.wallets ?? [];
    const transactions = (txres.data.transactions ?? []).map((t, i) => mapWalletTx(t, i));
    return {
      customerBalance: wallets
        .filter((w) => w.user?.role === 'customer')
        .reduce((s, w) => s + Number(w.balance ?? 0), 0),
      riderBalance: wallets
        .filter((w) => w.user?.role === 'rider')
        .reduce((s, w) => s + Number(w.balance ?? 0), 0),
      platformCommission: transactions
        .filter((t) => t.kind === 'commission')
        .reduce((s, t) => s + t.amount, 0),
      transactions,
    };
  },

  async getPromotions(): Promise<AdminPromo[]> {
    await requireAdmin();
    const res = await httpGet<{ promotions?: BackPromotion[] }>('/admin/promotions?limit=100');
    return (res.data.promotions ?? []).map(mapPromo);
  },

  async togglePromo(id: string): Promise<void> {
    await requireAdmin();
    const res = await httpGet<{ promotions?: BackPromotion[] }>('/admin/promotions?limit=100');
    const current = (res.data.promotions ?? []).map(mapPromo).find((p) => p.id === id);
    await httpPatch(`/admin/promotions/${resolveId(id)}`, { active: !(current?.active ?? true) });
  },

  async deletePromo(id: string): Promise<void> {
    await requireAdmin();
    await httpDelete(`/admin/promotions/${resolveId(id)}`);
  },

  async addPromo(input: Omit<AdminPromo, 'id' | 'used'>): Promise<void> {
    await requireAdmin();
    const res = await httpPost<{ promotion?: BackPromotion }>('/admin/promotions', {
      code: input.code,
      title: `Promo ${input.code}`,
      type: input.type === 'fixed' ? 'flat' : 'percent',
      value: input.value,
      minOrder: input.minOrder,
      ...(input.maxDiscount != null ? { maxDiscount: input.maxDiscount } : {}),
      audience: {
        type:
          input.audience === 'riders'
            ? 'specific_riders'
            : input.audience === 'customers'
              ? 'new_customers'
              : 'all',
      },
      startsAt: input.startsOn.toISOString(),
      expiresAt: input.expiresOn.toISOString(),
      ...(input.usageLimit > 0 ? { maxUses: input.usageLimit } : {}),
      active: input.active,
    });
    const created = res.data.promotion;
    if (created?._id) registerId(`prm_${last4(String(created._id))}`, String(created._id));
  },

  async getNotifications(): Promise<AdminNotification[]> {
    await requireAdmin();
    const res = await httpGet<{ notifications?: any[] }>('/admin/notifications');
    return (res.data.notifications ?? []).map(
      (n: any) =>
        ({
          id: String(n._id ?? n.id ?? ''),
          title: String(n.title ?? ''),
          body: String(n.body ?? ''),
          audience: (n.audience ?? 'all') as NotificationAudience,
          at: new Date(n.createdAt ?? n.sentAt ?? Date.now()),
          status: n.status ? String(n.status) : undefined,
        }) as AdminNotification,
    );
  },

  async sendNotification(input: {
    title: string;
    body: string;
    audience: NotificationAudience;
    toName?: string;
  }): Promise<void> {
    await requireAdmin();
    await httpPost('/admin/notifications', {
      title: input.title,
      body: input.body,
      audience: input.audience,
    });
  },

  async getTickets(): Promise<AdminTicket[]> {
    await requireAdmin();
    const res = await httpGet<{ tickets?: BackTicket[] }>('/admin/support?limit=100');
    return (res.data.tickets ?? [])
      .map(mapTicket)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  async replyToTicket(id: string, text: string, markResolved: boolean): Promise<void> {
    await requireAdmin();
    const status = markResolved ? 'resolved' : 'in_progress';
    await httpPatch(`/admin/support/${resolveId(id)}`, { status });
  },

  async setTicketStatus(id: string, status: TicketStatus): Promise<void> {
    await requireAdmin();
    await httpPatch(`/admin/support/${resolveId(id)}`, { status });
  },

  async getSettings(): Promise<AdminSettings> {
    await requireAdmin();
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
      ...adminSettingsDefaults,
      minOrder: num('min_order_amount', adminSettingsDefaults.minOrder),
      supportPhone: str('support_phone', adminSettingsDefaults.supportPhone),
      supportEmail: str('support_email', adminSettingsDefaults.supportEmail),
      currency: str('currency', adminSettingsDefaults.currency),
    };
  },

  async updateSettings(patch: Partial<AdminSettings>): Promise<AdminSettings> {
    await requireAdmin();
    const current = { ...adminSettingsDefaults };
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
    await Promise.all(
      Object.entries(synced).map(([key, value]) => httpPatch(`/admin/settings/${key}`, { value })),
    );
    return { ...current, ...patch };
  },
};

async function resolveRestaurantId(name?: string): Promise<string | undefined> {
  if (!name) return undefined;
  if (restaurantByName.has(name)) return restaurantByName.get(name);
  const res = await httpGet<{ restaurants?: BackRestaurantDoc[] }>('/admin/restaurants?limit=100');
  for (const r of res.data.restaurants ?? []) {
    if (r.name) restaurantByName.set(r.name, String(r._id ?? ''));
  }
  return restaurantByName.get(name);
}
