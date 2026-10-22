// ============================================================
// Swat City Backend - READ-ONLY production database audit
//
// `npm run db:audit` prints a PII-safe inventory of the live database:
//   * a row count per table
//   * every admin account (masked)
//   * candidate demo/seed records left over from the initial seed
//
// It performs NO writes and never prints full emails/phones for regular
// (non-admin) users. Use its output to decide what cleanup is safe.
// ============================================================

import { connectDB, disconnectDB } from '../config/db';
import {
  UserModel,
  CustomerProfileModel,
  RiderProfileModel,
  RiderDocumentModel,
  RestaurantModel,
  FoodCategoryModel,
  FoodItemModel,
  CartModel,
  AddressModel,
  OrderModel,
  OrderItemModel,
  RideModel,
  WalletModel,
  WalletTransactionModel,
  WithdrawalModel,
  PaymentModel,
  PromotionModel,
  NotificationModel,
  NotificationBroadcastModel,
  EmailOtpModel,
  FavoriteModel,
  SupportTicketModel,
  ReviewModel,
  AppSettingModel,
} from '../models';

/** Names created by the original demo seed (git 9eabb67). */
const DEMO_RESTAURANTS = ['Swat Grill House', 'Swati Karahi Khana', 'Chowkara Chapli House'];

/** Emails used by the mock/demo fixtures anywhere in the app. */
const DEMO_EMAILS = ['admin@swatcity.pk'];

const maskEmail = (v?: string | null): string => {
  const s = String(v ?? '');
  if (!s.includes('@')) return s ? `${s.slice(0, 2)}***` : '(none)';
  const [local, domain] = s.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};

const maskPhone = (v?: string | null): string => {
  const s = String(v ?? '');
  if (s.length < 4) return s || '(none)';
  return `${s.slice(0, 2)}*****${s.slice(-2)}`;
};

async function count(model: { countDocuments: (f?: any) => any }): Promise<number> {
  try {
    return Number(await model.countDocuments({}));
  } catch {
    return -1;
  }
}

async function main(): Promise<void> {
  await connectDB();

  const tables: [string, { countDocuments: (f?: any) => any }][] = [
    ['users', UserModel],
    ['customer_profiles', CustomerProfileModel],
    ['rider_profiles', RiderProfileModel],
    ['rider_documents', RiderDocumentModel],
    ['restaurants', RestaurantModel],
    ['food_categories', FoodCategoryModel],
    ['food_items', FoodItemModel],
    ['carts', CartModel],
    ['addresses', AddressModel],
    ['orders', OrderModel],
    ['order_items', OrderItemModel],
    ['rides', RideModel],
    ['wallets', WalletModel],
    ['wallet_transactions', WalletTransactionModel],
    ['withdrawals', WithdrawalModel],
    ['payments', PaymentModel],
    ['promotions', PromotionModel],
    ['notifications', NotificationModel],
    ['notification_broadcasts', NotificationBroadcastModel],
    ['email_otps', EmailOtpModel],
    ['favorites', FavoriteModel],
    ['support_tickets', SupportTicketModel],
    ['reviews', ReviewModel],
    ['app_settings', AppSettingModel],
  ];

  /* eslint-disable no-console */
  console.log('\n=== ROW COUNTS ===');
  for (const [name, model] of tables) {
    console.log(`  ${name.padEnd(26)} ${await count(model)}`);
  }

  console.log('\n=== ADMINS (masked) ===');
  const admins = await UserModel.find({ role: 'admin' })
    .select('_id email phone status verified createdAt')
    .lean();
  if (!admins.length) console.log('  (none — the bootstrap will create one)');
  for (const a of admins) {
    console.log(
      `  ${a._id}  ${maskEmail(a.email)}  ${maskPhone(a.phone)}  status=${a.status} verified=${a.verified} created=${a.createdAt}`,
    );
  }

  console.log('\n=== USER ROLE BREAKDOWN ===');
  for (const role of ['customer', 'rider', 'admin']) {
    console.log(`  ${role.padEnd(10)} ${await UserModel.countDocuments({ role })}`);
  }

  console.log('\n=== ALL USERS (masked) ===');
  const users = await UserModel.find({})
    .select('_id role email phone status verified createdAt deletedAt')
    .sort({ createdAt: 1 })
    .lean();
  for (const u of users) {
    console.log(
      `  ${u.role.padEnd(9)} ${u._id}  ${maskEmail(u.email)}  ${maskPhone(u.phone)}  status=${u.status} verified=${u.verified} created=${u.createdAt}`,
    );
  }

  console.log('\n=== DEMO-CANDIDATE RECORDS (evidence-based) ===');
  const demoRestaurants = await RestaurantModel.find({ name: { $in: DEMO_RESTAURANTS } })
    .select('_id name createdAt')
    .lean();
  if (!demoRestaurants.length) {
    console.log('  restaurants: none matched the original demo seed names');
  } else {
    for (const r of demoRestaurants)
      console.log(`  restaurant  ${r._id}  ${r.name}  created=${r.createdAt}`);
  }

  const demoIds = demoRestaurants.map((r) => String(r._id));
  if (demoIds.length) {
    const demoFood = await FoodItemModel.countDocuments({ restaurant: { $in: demoIds } });
    console.log(`  food_items  linked to the demo restaurants: ${demoFood}`);
  }

  const demoAdmins = await UserModel.find({ email: { $in: DEMO_EMAILS } })
    .select('_id email role')
    .lean();
  for (const u of demoAdmins)
    console.log(`  user  ${u._id}  ${maskEmail(u.email)}  role=${u.role}`);

  console.log('\nAudit complete — no data was modified.\n');
  /* eslint-enable no-console */

  await disconnectDB();
}

void main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('[db-audit] failed:', (err as Error).message);
  await disconnectDB();
  process.exit(1);
});
