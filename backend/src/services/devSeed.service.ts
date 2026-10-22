// ============================================================
// Swat City Backend - Development-only demo data
//
// Creates a known customer, a known approved rider, a couple of restaurants
// with menus, and a few sample orders so the app can be exercised without
// hand-building data. This module must NEVER run against production:
//
//   - `seedDevData()` refuses when NODE_ENV === 'production'
//   - the `seed:dev` script additionally requires SEED_DEV_DATA=true
//
// Every write is keyed on a stable identifier, so running it twice repairs the
// demo records instead of duplicating them.
// ============================================================

import { isProduction } from '../config/env';
import {
  AddressModel,
  CustomerProfileModel,
  FoodItemModel,
  OrderItemModel,
  OrderModel,
  PaymentModel,
  RestaurantModel,
  RiderProfileModel,
  UserModel,
  type OrderStatus,
} from '../models';
import { hashPassword, verifyPassword } from '../utils/helpers';
import { humanId } from '../utils/tokens';
import { getOrCreateWallet } from './wallet.service';

/** Known accounts. The password is dev-only and printed at the end. */
export const DEV_CUSTOMER_EMAIL = 'dev.customer@swatcity.local';
export const DEV_CUSTOMER_PASSWORD = 'DevCustomer123';
export const DEV_RIDER_EMAIL = 'dev.rider@swatcity.local';
export const DEV_RIDER_PASSWORD = 'DevRider123';

const DEV_CUSTOMER_PHONE = '03001234567';
const DEV_RIDER_PHONE = '03007654321';

const DEV_RESTAURANTS = [
  {
    slug: 'dev-swat-grill',
    name: 'Swat Grill (Dev)',
    description: 'Demo restaurant seeded for local testing only.',
    cuisine: 'Pakistani',
    category: 'bbq',
    tags: ['bbq', 'desi'],
    emoji: '🍢',
    gradient: ['#F97316', '#DC2626'],
    deliveryTimeMin: 30,
    deliveryFee: 60,
    minOrder: 200,
    deliveryKM: 4,
    addressLine: 'Mingora Bazaar, opposite Green Chowk',
    area: 'Mingora',
    location: { lat: 34.7717, lng: 72.36 },
    menu: [
      { name: 'Chicken Tikka', price: 320, emoji: '🍗', category: 'bbq' },
      { name: 'Seekh Kabab (4 pcs)', price: 280, emoji: '🍢', category: 'bbq' },
      { name: 'Garlic Naan', price: 60, emoji: '🫓', category: 'bread' },
      { name: 'Raita', price: 80, emoji: '🥣', category: 'side' },
    ],
  },
  {
    slug: 'dev-mingora-bites',
    name: 'Mingora Bites (Dev)',
    description: 'Demo fast-food restaurant seeded for local testing only.',
    cuisine: 'Fast Food',
    category: 'fastfood',
    tags: ['burger', 'fastfood'],
    emoji: '🍔',
    gradient: ['#0EA5E9', '#0369A1'],
    deliveryTimeMin: 25,
    deliveryFee: 50,
    minOrder: 150,
    deliveryKM: 3,
    addressLine: 'Saidu Sharif Road, near City Hospital',
    area: 'Saidu Sharif',
    location: { lat: 34.7503, lng: 72.3575 },
    menu: [
      { name: 'Zinger Burger', price: 350, emoji: '🍔', category: 'burger' },
      { name: 'Chicken Wrap', price: 260, emoji: '🌯', category: 'wrap' },
      { name: 'Loaded Fries', price: 220, emoji: '🍟', category: 'side' },
      { name: 'Cold Drink', price: 90, emoji: '🥤', category: 'drink' },
    ],
  },
] as const;

interface DevOrderSpec {
  status: OrderStatus;
  paymentStatus: 'pending' | 'paid';
  lines: Array<{ name: string; quantity: number; price: number; emoji?: string }>;
  daysAgo: number;
}

const DEV_ORDERS: DevOrderSpec[] = [
  {
    status: 'delivered',
    paymentStatus: 'paid',
    daysAgo: 3,
    lines: [
      { name: 'Chicken Tikka', quantity: 1, price: 320, emoji: '🍗' },
      { name: 'Garlic Naan', quantity: 2, price: 60, emoji: '🫓' },
    ],
  },
  {
    status: 'pending',
    paymentStatus: 'pending',
    daysAgo: 0,
    lines: [{ name: 'Zinger Burger', quantity: 1, price: 350, emoji: '🍔' }],
  },
  {
    status: 'ready',
    paymentStatus: 'paid',
    daysAgo: 0,
    lines: [
      { name: 'Seekh Kabab (4 pcs)', quantity: 1, price: 280, emoji: '🍢' },
      { name: 'Raita', quantity: 1, price: 80, emoji: '🥣' },
    ],
  },
];

interface SeedResult {
  customerId: string;
  riderId: string;
  restaurants: number;
  menuItems: number;
  ordersCreated: number;
}

/**
 * Idempotently create the dev dataset. Returns what was ensured/created.
 * Throws when called with NODE_ENV=production.
 */
export async function seedDevData(): Promise<SeedResult> {
  if (isProduction) {
    throw new Error('Refusing to seed demo data in production (NODE_ENV=production).');
  }

  const customer = await ensureDevUser({
    email: DEV_CUSTOMER_EMAIL,
    phone: DEV_CUSTOMER_PHONE,
    name: 'Dev Customer',
    role: 'customer',
    password: DEV_CUSTOMER_PASSWORD,
  });
  const rider = await ensureDevUser({
    email: DEV_RIDER_EMAIL,
    phone: DEV_RIDER_PHONE,
    name: 'Dev Rider',
    role: 'rider',
    password: DEV_RIDER_PASSWORD,
  });

  const address = await ensureDevAddress(String(customer._id));

  // Customer profile + wallet, so the account behaves like a real signup.
  const existingCustomerProfile = await CustomerProfileModel.findOne({ user: customer._id });
  if (!existingCustomerProfile) {
    await CustomerProfileModel.create({
      user: customer._id,
      name: customer.name,
      defaultAddress: address._id,
      location: { type: 'Point', coordinates: [address.lng, address.lat] },
    });
  }
  await getOrCreateWallet(String(customer._id), false);

  // Approved + online rider, so the rider feed and dispatch accept the account.
  const riderProfile = await RiderProfileModel.findOne({ user: rider._id });
  if (riderProfile) {
    let changed = false;
    if (riderProfile.approvalStatus !== 'approved') {
      riderProfile.approvalStatus = 'approved';
      changed = true;
    }
    if (!riderProfile.isOnline) {
      riderProfile.isOnline = true;
      riderProfile.status = 'online';
      changed = true;
    }
    if (changed) await riderProfile.save();
  } else {
    await RiderProfileModel.create({
      user: rider._id,
      name: rider.name,
      phone: rider.phone,
      cnic: '17301-1234567-1',
      baseCity: 'Mingora',
      vehicleType: 'bike',
      vehicleBrand: 'Honda',
      vehiclePlate: 'DEV-1234',
      experienceYears: 2,
      approvalStatus: 'approved',
      status: 'online',
      isOnline: true,
      baseLocation: { lat: 34.7717, lng: 72.36, label: 'Mingora', setAt: new Date() },
    });
  }
  await getOrCreateWallet(String(rider._id), true);

  let menuItems = 0;
  const restaurants = new Map<string, string>();
  for (const spec of DEV_RESTAURANTS) {
    const restaurant = await ensureRestaurant(spec);
    restaurants.set(spec.slug, String(restaurant._id));
    for (const item of spec.menu) {
      await ensureFoodItem(String(restaurant._id), item);
      menuItems += 1;
    }
  }

  // Sample orders only on the first run; the order number is derived from the
  // row id, so existence is keyed on the dev customer instead.
  let ordersCreated = 0;
  const existingOrders = await OrderModel.countDocuments({ customer: customer._id });
  if (existingOrders === 0) {
    const grillId = restaurants.get('dev-swat-grill');
    const bitesId = restaurants.get('dev-mingora-bites');
    for (const spec of DEV_ORDERS) {
      const restaurantId = spec.status === 'ready' ? grillId : bitesId;
      if (!restaurantId) continue;
      await createDevOrder({
        customerId: String(customer._id),
        restaurantId,
        addressId: String(address._id),
        spec,
      });
      ordersCreated += 1;
    }
  }

  return {
    customerId: String(customer._id),
    riderId: String(rider._id),
    restaurants: DEV_RESTAURANTS.length,
    menuItems,
    ordersCreated,
  };
}

async function ensureDevUser(input: {
  email: string;
  phone: string;
  name: string;
  role: 'customer' | 'rider';
  password: string;
}) {
  const existing = await UserModel.findOne({
    $or: [{ email: input.email }, { phone: input.phone }],
  }).select('+password');

  if (existing) {
    // Dev accounts are disposable and must stay loginable, so the known dev
    // password is reapplied. Production is blocked above.
    let changed = false;
    if (existing.email !== input.email) {
      existing.email = input.email;
      changed = true;
    }
    if (existing.role !== input.role) {
      existing.role = input.role;
      changed = true;
    }
    if (existing.phone !== input.phone) {
      existing.phone = input.phone;
      changed = true;
    }
    if (!existing.verified) {
      existing.verified = true;
      changed = true;
    }
    if (!existing.isApproved) {
      existing.isApproved = true;
      changed = true;
    }
    if (existing.pendingApproval) {
      existing.pendingApproval = false;
      changed = true;
    }
    if (existing.status !== 'active') {
      existing.status = 'active';
      changed = true;
    }
    const validPassword = existing.password
      ? await verifyPassword(input.password, String(existing.password))
      : false;
    if (!validPassword) {
      existing.password = await hashPassword(input.password);
      changed = true;
    }
    if (changed) await existing.save();
    return existing;
  }

  return UserModel.create({
    role: input.role,
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: await hashPassword(input.password),
    verified: true,
    isApproved: true,
    pendingApproval: false,
  });
}

async function ensureDevAddress(userId: string) {
  const existing = await AddressModel.findOne({ user: userId, deletedAt: null });
  if (existing) return existing;
  return AddressModel.create({
    user: userId,
    label: 'Home',
    full: 'House 12, Green Chowk, Mingora, Swat',
    area: 'Mingora',
    tag: 'home',
    lat: 34.7735,
    lng: 72.362,
    isDefault: true,
  });
}

async function ensureRestaurant(spec: (typeof DEV_RESTAURANTS)[number]) {
  const existing = await RestaurantModel.findOne({ slug: spec.slug });
  if (existing) return existing;
  return RestaurantModel.create({
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    cuisine: spec.cuisine,
    category: spec.category,
    tags: [...spec.tags],
    status: 'open',
    featured: false,
    rating: 4.5,
    reviewCount: 12,
    deliveryTimeMin: spec.deliveryTimeMin,
    deliveryFee: spec.deliveryFee,
    minOrder: spec.minOrder,
    deliveryKM: spec.deliveryKM,
    freeDelivery: false,
    emoji: spec.emoji,
    gradient: [...spec.gradient],
    ownerName: 'Dev Owner',
    phone: '03009999999',
    addressLine: spec.addressLine,
    area: spec.area,
    location: { type: 'Point', coordinates: [spec.location.lng, spec.location.lat] },
    hours: { open: '10:00', close: '23:00' },
  });
}

async function ensureFoodItem(
  restaurantId: string,
  item: { name: string; price: number; emoji: string; category: string },
) {
  const existing = await FoodItemModel.findOne({
    restaurant: restaurantId,
    name: item.name,
    deletedAt: null,
  });
  if (existing) return existing;
  return FoodItemModel.create({
    restaurant: restaurantId,
    name: item.name,
    description: `Demo item: ${item.name}`,
    category: item.category,
    price: item.price,
    emoji: item.emoji,
    gradient: ['#F59E0B', '#EA580C'],
    rating: 4.4,
    reviewCount: 5,
    calories: 350,
    prepMin: 15,
    popular: true,
    available: true,
    isVeg: false,
  });
}

async function createDevOrder(input: {
  customerId: string;
  restaurantId: string;
  addressId: string;
  spec: DevOrderSpec;
}): Promise<void> {
  const { spec } = input;
  const subtotal = spec.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryFee = 60;
  const platformFee = 15;
  const total = subtotal + deliveryFee + platformFee;

  const payment = await PaymentModel.create({
    user: input.customerId,
    kind: 'order',
    method: 'cash',
    status: spec.paymentStatus,
    amount: total,
    currency: 'PKR',
    gateway: 'cash',
    initiatedAt: null,
    paidAt: spec.paymentStatus === 'paid' ? new Date() : null,
  });

  const createdAt = new Date(Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000);
  const order = await OrderModel.create({
    customer: input.customerId,
    restaurant: input.restaurantId,
    items: spec.lines.map((line) => ({
      foodItem: null,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      emoji: line.emoji,
    })),
    status: spec.status,
    statusHistory: [{ status: spec.status, note: 'Seeded dev order', at: createdAt }],
    addressSnapshot: {
      full: 'House 12, Green Chowk, Mingora, Swat',
      area: 'Mingora',
      lat: 34.7735,
      lng: 72.362,
      tag: 'home',
    },
    subtotal,
    deliveryFee,
    discount: 0,
    platformFee,
    total,
    distanceKm: 4,
    estimatedMinutes: 30,
    paymentMethod: 'cash',
    paymentStatus: spec.paymentStatus,
    payment: payment._id,
    paymentGateway: null,
    paymentVerifyAttempts: 0,
    riderPayout: Math.round((deliveryFee + platformFee) * 0.75),
    createdAt,
  });

  order.orderNumber = humanId('SWT', String(order._id));
  await order.save();

  await OrderItemModel.insertMany(
    spec.lines.map((line) => ({
      order: order._id,
      foodItem: null,
      restaurant: input.restaurantId,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      emoji: line.emoji,
      note: 'Demo order',
    })),
  );
}
