import { env } from '../config/env';
import { UserModel } from '../models';
import { hashPassword } from '../utils/helpers';
import { ensureDefaultSettings } from './settings.service';
import { getOrCreateWallet } from './wallet.service';

/**
 * Ensure the seed admin exists. Runs automatically on boot. The admin is
 * identified by phone, so re-running is idempotent.
 * Returns false when an admin already existed.
 */
export async function ensureAdmin(): Promise<boolean> {
  const existing = await UserModel.findOne({ role: 'admin' });
  if (existing) return false;

  const admin = await UserModel.create({
    role: 'admin',
    name: 'Swat Admin',
    email: env.ADMIN_EMAIL,
    phone: env.ADMIN_PHONE,
    password: await hashPassword(env.ADMIN_PASSWORD),
    verified: true,
    isApproved: true,
    pendingApproval: false,
  });
  await getOrCreateWallet(String(admin._id), false);
  // eslint-disable-next-line no-console
  console.log(`[seed] Admin created: ${env.ADMIN_EMAIL} (${env.ADMIN_PHONE})`);
  return true;
}

/**
 * Full demo bootstrap (explicit: `npm run seed`). Seeds the admin (already
 * done on boot), default settings and a small set of restaurants + food so the
 * app has real data to browse when the backend is live.
 */
export async function seedDemoData(): Promise<void> {
  await ensureAdmin();
  await ensureDefaultSettings();
  // Classic Swat restaurants mirroring the app's offline fixtures.
  const { RestaurantModel, FoodItemModel } = await import('../models');

  const count = await RestaurantModel.countDocuments();
  if (count > 0) {
    // eslint-disable-next-line no-console
    console.log('[seed] Restaurants already exist — skipping demo data.');
    return;
  }

  const restaurants = [
    {
      name: 'Swat Grill House',
      cuisine: 'BBQ • Charcoal',
      category: 'BBQ',
      tags: ['Seekh Kabab', 'Chapli', 'Desi'],
      status: 'open',
      featured: true,
      deliveryTimeMin: 32,
      deliveryFee: 60,
      minOrder: 300,
      deliveryKM: 2.1,
      freeDelivery: true,
      promo: 'Free delivery over Rs 800',
      emoji: '🔥',
      gradient: ['#C73E3E', '#5E1212'],
      area: 'Mingora',
      location: { type: 'Point', coordinates: [72.3625, 34.7802] },
      hours: { open: '09:00', close: '23:00' },
    },
    {
      name: 'Swati Karahi Khana',
      cuisine: 'Karahi • Traditional',
      category: 'Karahi',
      tags: ['Chicken Karahi', 'Desi Ghee'],
      status: 'open',
      featured: true,
      deliveryTimeMin: 38,
      deliveryFee: 80,
      minOrder: 400,
      deliveryKM: 1.4,
      freeDelivery: false,
      promo: '10% off first order',
      emoji: '🍲',
      gradient: ['#8C3D2F', '#3C120C'],
      area: 'Mingora',
      location: { type: 'Point', coordinates: [72.36, 34.775] },
      hours: { open: '11:00', close: '23:30' },
    },
    {
      name: 'Chowkara Chapli House',
      cuisine: 'Chapli Kabab • Swat Special',
      category: 'BBQ',
      tags: ['Chapli Kabab', 'Mutton'],
      status: 'open',
      featured: true,
      deliveryTimeMin: 30,
      deliveryFee: 50,
      minOrder: 250,
      deliveryKM: 0.9,
      freeDelivery: true,
      promo: '2nd Chapli at half price',
      emoji: '🥩',
      gradient: ['#B05E1F', '#54250A'],
      area: 'Mingora',
      location: { type: 'Point', coordinates: [72.361, 34.7815] },
      hours: { open: '10:00', close: '23:00' },
    },
  ] as const;

  const created = await RestaurantModel.insertMany(restaurants);
  // eslint-disable-next-line no-console
  console.log(`[seed] Created ${created.length} restaurants`);

  const foodSeed: Record<string, Array<Record<string, unknown>>> = {
    [String(created[0]?._id)]: [
      { name: 'Seekh Kabab (Half Dozen)', price: 480, category: 'BBQ', popular: true, emoji: '🍢', calories: 610, prepMin: 18, rating: 4.8 },
      { name: 'Chapli Kabab (Single)', price: 240, category: 'BBQ', popular: true, emoji: '🥙', calories: 540, prepMin: 15, rating: 4.9 },
      { name: 'Malai Boti (8 pcs)', price: 520, category: 'BBQ', emoji: '🍗', calories: 580, prepMin: 20, rating: 4.7 },
      { name: 'Special Handi', price: 980, category: 'Handi', emoji: '🍲', calories: 720, prepMin: 28, rating: 4.8 },
    ],
    [String(created[1]?._id)]: [
      { name: 'Chicken Karahi (Half)', price: 850, category: 'Karahi', popular: true, emoji: '🍲', calories: 680, prepMin: 25, rating: 4.8 },
      { name: 'Namkeen Gosht', price: 1050, category: 'Karahi', emoji: '🍖', calories: 740, prepMin: 30, rating: 4.9 },
      { name: 'Daal Chawal (Plate)', price: 320, category: 'Thali', emoji: '🍚', calories: 520, prepMin: 12, rating: 4.5 },
      { name: 'Roghni Naan', price: 90, category: 'Bakery', emoji: '🫓', calories: 240, prepMin: 8, rating: 4.6 },
    ],
    [String(created[2]?._id)]: [
      { name: 'Swat Chapli Kabab', price: 380, category: 'BBQ', popular: true, emoji: '🥙', calories: 590, prepMin: 16, rating: 4.9 },
      { name: 'Mutton Chapli (With Naan)', price: 320, category: 'BBQ', emoji: '🍖', calories: 650, prepMin: 18, rating: 4.8 },
      { name: 'Chapli Burger', price: 290, category: 'Fast Food', emoji: '🍔', calories: 620, prepMin: 12, rating: 4.7 },
      { name: 'Peshawar Nalli Soup', price: 260, category: 'Soup', emoji: '🍜', calories: 380, prepMin: 14, rating: 4.6 },
    ],
  };

  const foodDocs: Array<Record<string, unknown>> = [];
  for (const [restaurantId, items] of Object.entries(foodSeed)) {
    for (const item of items) {
      foodDocs.push({
        restaurant: restaurantId,
        name: item.name as string,
        price: item.price as number,
        category: item.category as string,
        popular: (item.popular as boolean) ?? false,
        emoji: item.emoji as string,
        calories: item.calories as number,
        prepMin: item.prepMin as number,
        rating: item.rating as number,
        available: true,
        gradient: created.find((r) => String(r._id) === restaurantId)?.gradient,
      });
    }
  }

  await FoodItemModel.insertMany(foodDocs);
  // eslint-disable-next-line no-console
  console.log(`[seed] Created ${foodDocs.length} food items`);
}