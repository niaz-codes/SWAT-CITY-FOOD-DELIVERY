import { OrderStatus, RideType, VehicleType } from './domain';

export type AdminUserRole = 'customer' | 'rider' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'deactivated';
export type DocStatus = 'verified' | 'pending' | 'rejected';

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: AdminUserRole;
  status: AccountStatus;
  verified: boolean;
  joinedAt: Date;
  orders: number;
  rides: number;
  rating: number;
  walletBalance: number;
  avatarGradient: [string, string];
};

export type AdminRider = AdminUser & {
  vehicle: VehicleType;
  plateNumber: string;
  riderStatus: 'online' | 'offline' | 'busy';
  applicationStatus: 'pending' | 'approved' | 'rejected';
  docStatus: DocStatus;
  earnings: number;
  deliveries: number;
};

export type RestaurantStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type AdminRestaurant = {
  id: string;
  name: string;
  owner: string;
  ownerPhone: string;
  category: string;
  location: string;
  status: RestaurantStatus;
  rating: number;
  menuCount: number;
  deliveryKM: number;
  joinedAt: Date;
  gradient: [string, string];
  emoji: string;
};

export type AdminMenuItem = {
  id: string;
  name: string;
  restaurant: string;
  category: string;
  price: number;
  discount: number;
  available: boolean;
  active: boolean;
  rating: number;
  gradient: [string, string];
  emoji: string;
};

export type AdminOrderStatus = OrderStatus | 'rider_assigned';

export type AdminOrderLine = { name: string; quantity: number; price: number };

export type AdminOrder = {
  id: string;
  customer: string;
  customerPhone: string;
  restaurant: string;
  items: AdminOrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  status: AdminOrderStatus;
  rider?: string;
  address: string;
  placedAt: Date;
  updatedAt: Date;
};

export type RideBookingStatus = 'searching' | 'accepted' | 'arriving' | 'started' | 'completed' | 'cancelled';

export type AdminRide = {
  id: string;
  customer: string;
  rider?: string;
  pickup: string;
  dropoff: string;
  distanceKm: number;
  fare: number;
  rideType: RideType;
  status: RideBookingStatus;
  bookedAt: Date;
  completedAt?: Date;
};

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type AdminPayment = {
  id: string;
  user: string;
  role: AdminUserRole;
  ref: string;
  amount: number;
  method: 'card' | 'jazzcash' | 'cash' | 'wallet';
  status: PaymentStatus;
  at: Date;
};

export type WalletTxKind = 'credit' | 'debit' | 'refund' | 'earning' | 'commission';

export type AdminWalletTx = {
  id: string;
  user: string;
  role: AdminUserRole;
  kind: WalletTxKind;
  amount: number;
  title: string;
  at: Date;
};

export type AdminWalletOverview = {
  customerBalance: number;
  riderBalance: number;
  platformCommission: number;
  transactions: AdminWalletTx[];
};

export type PromoAudience = 'all' | 'customers' | 'riders';

export type AdminPromo = {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder: number;
  maxDiscount?: number;
  startsOn: Date;
  expiresOn: Date;
  usageLimit: number;
  used: number;
  active: boolean;
  audience: PromoAudience;
};

export type NotificationAudience = 'all' | 'customers' | 'riders' | 'specific';

export type AdminNotification = {
  id: string;
  title: string;
  body: string;
  audience: NotificationAudience;
  toName?: string;
  status: 'sent' | 'scheduled' | 'failed';
  at: Date;
};

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketMessage = { id: string; from: 'user' | 'admin'; text: string; at: Date };

export type AdminTicket = {
  id: string;
  user: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  messages: TicketMessage[];
};

export type ReportRange = 'today' | '7d' | '30d' | 'month' | 'year' | 'all' | 'custom';

export type AdminReport = {
  range: ReportRange;
  generatedAt: Date;
  salesTotal: number;
  orders: number;
  rides: number;
  revenue: number;
  riderEarnings: number;
  commission: number;
  customers: number;
  riders: number;
  topRestaurants: { name: string; orders: number; revenue: number; emoji: string; gradient: [string, string] }[];
  daily: { label: string; sales: number; orders: number }[];
};

export type AdminSettings = {
  deliveryFee: number;
  rideBaseFare: number;
  ridePerKm: number;
  commissionPct: number;
  minOrder: number;
  currency: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  sendOrderUpdates: boolean;
  sendRideUpdates: boolean;
  sendPromotions: boolean;
  termsUrl: string;
  privacyUrl: string;
};

export type DashboardTotals = {
  users: number;
  customers: number;
  riders: number;
  restaurants: number;
  foodItems: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeRides: number;
  revenue: number;
  riderEarnings: number;
  pendingRiderApplications: number;
  pendingRestaurants: number;
  pendingOrders: number;
  supportTickets: number;
};

export type DashboardCharts = {
  dailyOrders: { label: string; count: number }[];
  weeklyRevenue: { label: string; amount: number }[];
  monthlyRevenue: { label: string; amount: number }[];
  customerGrowth: { label: string; count: number }[];
  riderGrowth: { label: string; count: number }[];
  orderStatus: { label: string; count: number }[];
  serviceSplit: { label: 'Food' | 'Rides'; count: number }[];
};

export type AdminDashboardData = { totals: DashboardTotals; charts: DashboardCharts };