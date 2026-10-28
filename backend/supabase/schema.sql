-- SWAT CITY FOOD DELIVERY — Supabase (Postgres) schema
--
-- Design notes:
--  * Column names are camelCase (quoted) so they match the Mongo field names
--    1:1 — the application data layer in backend/src/db/model.ts needs no key mapping.
--  * Primary key is `_id uuid DEFAULT gen_random_uuid()`; API responses expose it as `id`/`_id`.
--  * Enum-like fields are `text` + CHECK constraints (same tolerance as Mongoose enums:
--    unknown values only fail on write, never on read).
--  * Nested objects / mixed values are `jsonb`; top-level string arrays are `text[]`.
--  * All numeric fields are `double precision` to mirror Mongoose's Number type.
--  * No foreign keys: Mongoose had no referential integrity and the code creates /
--    reassigns references freely (e.g. order.payment <-> payment.order cycles).
--  * RLS is ENABLED with no policies: only the service-role key (backend) is used,
--    which bypasses RLS. Browser/anon access is intentionally impossible for these tables.
--
-- Apply with: supabase db push  (or psql -f schema.sql)

begin;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  _id             uuid primary key default gen_random_uuid(),
  role            text not null check (role in ('customer', 'rider', 'admin')),
  status          text not null default 'active' check (status in ('active', 'suspended')),
  name            text,
  email           text,
  phone           text,
  password        text,
  verified        boolean not null default false,
  isApproved      boolean not null default false,
  pendingApproval boolean not null default false,
  avatarUrl       text,
  deviceTokens    text[] not null default '{}',
  lastLoginAt     timestamptz,
  deletedAt       timestamptz,
  createdAt       timestamptz not null default now(),
  updatedAt       timestamptz not null default now()
);
create unique index if not exists users_email_key on public.users (email) where email is not null;
create unique index if not exists users_phone_key on public.users (phone) where phone is not null;
create index if not exists users_createdAt_idx on public.users (createdat);
create index if not exists users_role_idx on public.users (role);

-- ---------------------------------------------------------------------------
-- customer_profiles  (1:1 extension of users)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_profiles (
  _id            uuid primary key default gen_random_uuid(),
  "user"         uuid not null,
  name           text not null,
  avatarUrl      text,
  defaultAddress uuid,
  location       jsonb not null default '{"type":"Point","coordinates":[0,0]}',
  createdAt      timestamptz not null default now(),
  updatedAt      timestamptz not null default now()
);
create unique index if not exists customer_profiles_user_key on public.customer_profiles ("user");

-- ---------------------------------------------------------------------------
-- rider_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.rider_profiles (
  _id                  uuid primary key default gen_random_uuid(),
  "user"               uuid not null,
  name                 text not null,
  avatarUrl            text,
  avatarPublicId       text,
  avatarUpdatedBy      uuid,
  avatarUpdatedAt      timestamptz,
  photoUrl             text,
  photoPublicId        text,
  photoUploadedAt      timestamptz,
  phone                text,
  cnic                 text,
  cnicIssueDate        timestamptz,
  lastLocation         jsonb not null default '{"lat":0,"lng":0,"heading":0,"speed":0,"updatedAt":null}',
  baseLocation         jsonb not null default '{"lat":null,"lng":null,"label":null,"setAt":null}',
  experienceYears      double precision,
  baseCity             text,
  vehicleType          text not null default 'bike' check (vehicleType in ('bike', 'rickshaw', 'van', 'car')),
  vehicleBrand         text,
  vehiclePlate         text,
  vehiclePlateUpdatedBy uuid,
  pendingVehicle       jsonb not null default '{"vehicleType":null,"vehicleBrand":null,"vehiclePlate":null,"requestedAt":null,"note":null}',
  approvalStatus       text not null default 'pending' check (approvalStatus in ('pending', 'approved', 'rejected')),
  rejectionReason      text,
  reviewedBy           uuid,
  reviewedAt           timestamptz,
  status               text not null default 'offline' check (status in ('offline', 'online', 'busy')),
  isOnline             boolean not null default false,
  suspendedAt          timestamptz,
  verificationId       uuid,
  rating               double precision not null default 0,
  totalTrips           double precision not null default 0,
  createdAt            timestamptz not null default now(),
  updatedAt            timestamptz not null default now()
);
create unique index if not exists rider_profiles_user_key on public.rider_profiles ("user");
create index if not exists rider_profiles_status_approval_idx on public.rider_profiles (status, approvalstatus);
create index if not exists rider_profiles_lastLocation_idx on public.rider_profiles using gin (lastlocation);
-- Idempotent migration for databases created before pending vehicle changes
-- existed: the rider's proposed vehicle type/brand/plate awaiting admin review.
alter table public.rider_profiles
  add column if not exists pendingVehicle jsonb not null default '{"vehicleType":null,"vehicleBrand":null,"vehiclePlate":null,"requestedAt":null,"note":null}';

-- ---------------------------------------------------------------------------
-- rider_documents
-- ---------------------------------------------------------------------------
create table if not exists public.rider_documents (
  _id         uuid primary key default gen_random_uuid(),
  rider       uuid not null,
  type        text not null check (type in ('cnic_front', 'cnic_back', 'license', 'vehicle_reg')),
  url         text not null,
  publicId    text,
  status      text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewNote  text,
  reviewedBy  uuid,
  reviewedAt  timestamptz,
  createdAt   timestamptz not null default now(),
  updatedAt   timestamptz not null default now()
);
create index if not exists rider_documents_rider_type_idx on public.rider_documents (rider, type);

-- ---------------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------------
create table if not exists public.restaurants (
  _id             uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text,
  description     text,
  cuisine         text,
  category        text,
  tags            text[] not null default '{}',
  status          text not null default 'open' check (status in ('closed', 'open', 'busy')),
  featured        boolean not null default false,
  rating          double precision not null default 0,
  reviewCount     double precision not null default 0,
  deliveryTimeMin double precision not null default 30,
  deliveryFee     double precision not null default 0,
  minOrder        double precision not null default 0,
  deliveryKM      double precision not null default 0,
  freeDelivery    boolean not null default false,
  promo           text,
  imageUrl        text,
  imagePublicId   text,
  emoji           text,
  gradient        text[] not null default '{#0E9488,#0E3F3A}',
  ownerName       text,
  phone           text,
  addressLine     text,
  area            text,
  location        jsonb not null default '{"type":"Point","coordinates":[0,0]}',
  hours           jsonb not null default '{"open":"09:00","close":"23:00"}',
  deletedAt       timestamptz,
  createdAt       timestamptz not null default now(),
  updatedAt       timestamptz not null default now()
);
-- Generated search column: lets `$regex` on the text[] `tags` column map to ILIKE
-- (PostgREST cannot apply ILIKE/IMATCH directly to array columns).
-- array_to_string is only STABLE, so wrap it in an IMMUTABLE helper for the generated column.
create or replace function public.array_to_text_immutable(text[], text)
returns text language sql immutable as $$ select array_to_string($1, $2) $$;
alter table public.restaurants
  add column if not exists tags_text text generated always as (public.array_to_text_immutable(tags, ' ')) stored;
create unique index if not exists restaurants_slug_key on public.restaurants (slug) where slug is not null;
create index if not exists restaurants_name_idx on public.restaurants (name);
create index if not exists restaurants_category_idx on public.restaurants (category);
create index if not exists restaurants_area_idx on public.restaurants (area);
create index if not exists restaurants_status_idx on public.restaurants (status);
create index if not exists restaurants_status_featured_created_idx on public.restaurants (status, featured, createdat desc);
create index if not exists restaurants_location_idx on public.restaurants using gin (location);

-- ---------------------------------------------------------------------------
-- food_categories
-- ---------------------------------------------------------------------------
create table if not exists public.food_categories (
  _id        uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text,
  emoji      text,
  sortOrder  double precision not null default 0,
  active     boolean not null default true,
  createdAt  timestamptz not null default now(),
  updatedAt  timestamptz not null default now()
);
create unique index if not exists food_categories_name_key on public.food_categories (name);

-- ---------------------------------------------------------------------------
-- food_items
-- ---------------------------------------------------------------------------
create table if not exists public.food_items (
  _id            uuid primary key default gen_random_uuid(),
  restaurant     uuid not null,
  name           text not null,
  description    text,
  category       text,
  price          double precision not null,
  emoji          text,
  imageUrl       text,
  imagePublicId  text,
  gradient       text[] not null default '{#0E9488,#0E3F3A}',
  rating         double precision not null default 0,
  reviewCount    double precision not null default 0,
  calories       double precision,
  prepMin        double precision,
  popular        boolean not null default false,
  available      boolean not null default true,
  isVeg          boolean not null default false,
  deletedAt      timestamptz,
  createdAt      timestamptz not null default now(),
  updatedAt      timestamptz not null default now(),
  constraint food_items_price_check check (price >= 0)
);
create index if not exists food_items_restaurant_idx on public.food_items (restaurant);
create index if not exists food_items_name_idx on public.food_items (name);
create index if not exists food_items_category_idx on public.food_items (category);
create index if not exists food_items_available_idx on public.food_items (available);
create index if not exists food_items_restaurant_available_idx on public.food_items (restaurant, available);
create index if not exists food_items_popular_available_idx on public.food_items (popular, available);

-- ---------------------------------------------------------------------------
-- carts  (items is a jsonb array of embedded cart items)
-- ---------------------------------------------------------------------------
create table if not exists public.carts (
  _id         uuid primary key default gen_random_uuid(),
  "user"      uuid not null,
  restaurant  uuid,
  items       jsonb not null default '[]',
  subtotal    double precision not null default 0,
  createdAt   timestamptz not null default now(),
  updatedAt   timestamptz not null default now()
);
create unique index if not exists carts_user_key on public.carts ("user");

-- ---------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------
create table if not exists public.addresses (
  _id        uuid primary key default gen_random_uuid(),
  "user"     uuid not null,
  label      text,
  "full"     text not null,
  area       text,
  tag        text not null default 'other' check (tag in ('home', 'work', 'other', 'frequent')),
  lat        double precision not null,
  lng        double precision not null,
  isDefault  boolean not null default false,
  deletedAt  timestamptz,
  createdAt  timestamptz not null default now(),
  updatedAt  timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses ("user");
create index if not exists addresses_area_idx on public.addresses (area);
create index if not exists addresses_user_isDefault_idx on public.addresses ("user", isdefault);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  _id                     uuid primary key default gen_random_uuid(),
  orderNumber             text,
  customer                uuid not null,
  restaurant              uuid not null,
  rider                   uuid,
  items                   jsonb not null default '[]',
  status                  text not null default 'pending'
      check (status in ('pending','confirmed','preparing','ready','rider_assigned',
                        'picked_up','on_the_way','delivered','cancelled')),
  previousStatus          text,
  statusHistory           jsonb not null default '[]',
  addressSnapshot         jsonb,
  subtotal                double precision not null,
  deliveryFee             double precision not null default 0,
  discount                double precision not null default 0,
  platformFee             double precision not null default 0,
  total                   double precision not null,
  distanceKm              double precision not null default 0,
  estimatedMinutes        double precision not null default 30,
  paymentMethod           text not null default 'cash'
      check (paymentMethod in ('cash','card','wallet','easypaisa','jazzcash','demo')),
  paymentStatus           text not null default 'pending'
      check (paymentStatus in ('pending','processing','paid','failed','cancelled','refunded')),
  payment                 uuid,
  paymentGateway          text,
  paymentTransactionRef   text,
  paymentVerifiedAt       timestamptz,
  paymentFailureReason    text,
  paymentVerifyAttempts   double precision not null default 0,
  riderPayout             double precision not null default 0,
  cancelReason            text,
  cancelledBy             text check (cancelledBy in ('customer','rider','admin','system')),
  deletedAt               timestamptz,
  createdAt               timestamptz not null default now(),
  updatedAt               timestamptz not null default now(),
  constraint orders_totals_check check (subtotal >= 0 and total >= 0)
);
create unique index if not exists orders_orderNumber_key on public.orders (orderNumber) where orderNumber is not null;
create index if not exists orders_customer_created_idx on public.orders (customer, createdat desc);
create index if not exists orders_restaurant_status_idx on public.orders (restaurant, status);
create index if not exists orders_rider_status_idx on public.orders (rider, status);
create index if not exists orders_status_created_idx on public.orders (status, createdat desc);

-- ---------------------------------------------------------------------------
-- order_items  (standalone lookupable rows for admin analytics)
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  _id         uuid primary key default gen_random_uuid(),
  "order"     uuid not null,
  foodItem    uuid,
  restaurant  uuid,
  name        text not null,
  quantity    double precision not null,
  price       double precision not null,
  emoji       text,
  note        text,
  createdAt   timestamptz not null default now(),
  updatedAt   timestamptz not null default now(),
  constraint order_items_quantity_check check (quantity >= 1)
);
create index if not exists order_items_order_idx on public.order_items ("order");
create index if not exists order_items_restaurant_idx on public.order_items (restaurant);
create index if not exists order_items_foodItem_created_idx on public.order_items (foodItem, createdat desc);

-- ---------------------------------------------------------------------------
-- rides
-- ---------------------------------------------------------------------------
create table if not exists public.rides (
  _id              uuid primary key default gen_random_uuid(),
  rideNumber       text,
  customer         uuid not null,
  rider            uuid,
  type             text not null check (type in ('swat_moto', 'swat_city', 'swat_van')),
  vehicle          text not null default 'bike' check (vehicle in ('bike','rickshaw','van','car')),
  status           text not null default 'searching'
      check (status in ('searching','accepted','arriving','started','completed','cancelled')),
  statusHistory    jsonb not null default '[]',
  pickup           jsonb not null,
  dropoff          jsonb not null,
  distanceKm       double precision not null,
  durationMin      double precision not null default 0,
  baseFare         double precision not null default 0,
  distanceFare     double precision not null default 0,
  surgeMultiplier  double precision not null default 1,
  fare             double precision not null,
  riderPayout      double precision not null default 0,
  paymentMethod    text not null default 'cash' check (paymentMethod in ('cash','wallet')),
  cancelReason     text,
  cancelledBy      text check (cancelledBy in ('customer','rider','admin','system')),
  deletedAt        timestamptz,
  createdAt        timestamptz not null default now(),
  updatedAt        timestamptz not null default now(),
  constraint rides_distance_check check (distanceKm >= 0 and fare >= 0)
);
create unique index if not exists rides_rideNumber_key on public.rides (rideNumber) where rideNumber is not null;
create index if not exists rides_status_created_idx on public.rides (status, createdat desc);
create index if not exists rides_rider_status_idx on public.rides (rider, status);
create index if not exists rides_customer_created_idx on public.rides (customer, createdat desc);

-- ---------------------------------------------------------------------------
-- wallets  (balance must NEVER move without a wallet_transactions row)
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  _id              uuid primary key default gen_random_uuid(),
  "user"           uuid not null,
  balance          double precision not null default 0,
  holdsEarnings    boolean not null default false,
  lastTransactionAt timestamptz,
  createdAt        timestamptz not null default now(),
  updatedAt        timestamptz not null default now(),
  constraint wallets_balance_check check (balance >= 0)
);
create unique index if not exists wallets_user_key on public.wallets ("user");

-- ---------------------------------------------------------------------------
-- wallet_transactions
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  _id             uuid primary key default gen_random_uuid(),
  wallet          uuid not null,
  "user"          uuid not null,
  type            text not null check (type in ('credit','debit','refund','earning','commission')),
  amount          double precision not null,
  balanceAfter    double precision not null,
  reference       text,
  referenceModel  text,
  description     text,
  byUser          uuid,
  metadata        jsonb,
  createdAt       timestamptz not null default now(),
  updatedAt       timestamptz not null default now(),
  constraint wallet_transactions_amount_check check (amount >= 0)
);
create index if not exists wallet_transactions_wallet_idx on public.wallet_transactions (wallet);
create index if not exists wallet_transactions_user_idx on public.wallet_transactions ("user");
create index if not exists wallet_transactions_type_idx on public.wallet_transactions (type);
create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions ("user", createdat desc);
create index if not exists wallet_transactions_type_created_idx on public.wallet_transactions (type, createdat desc);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  _id                 uuid primary key default gen_random_uuid(),
  "user"              uuid not null,
  kind                text not null check (kind in ('order','ride','topup','refund')),
  "order"             uuid,
  ride                uuid,
  method              text not null check (method in ('easypaisa','jazzcash','cash','card','wallet','demo')),
  status              text not null default 'pending'
      check (status in ('pending','processing','paid','failed','cancelled','refunded')),
  amount              double precision not null,
  currency            text not null default 'PKR',
  idempotencyKey      text,
  gateway             text not null,
  transactionRef      text,
  gatewayRef          text,
  gatewayResponseCode text,
  initiatedAt         timestamptz,
  paidAt              timestamptz,
  failedAt            timestamptz,
  refundedAt          timestamptz,
  expiresAt           timestamptz,
  verifyAttempts      double precision not null default 0,
  verifiedAt          timestamptz,
  failureReason       text,
  metadata            jsonb,
  createdAt           timestamptz not null default now(),
  updatedAt           timestamptz not null default now(),
  constraint payments_amount_check check (amount >= 0)
);
-- One live payment per idempotency key (double-tap / retry protection).
create unique index if not exists payments_idempotencyKey_key
  on public.payments (idempotencyKey) where idempotencyKey is not null;
-- A gateway transaction reference must never be reused across gateways.
create unique index if not exists payments_gateway_transactionRef_key
  on public.payments (gateway, transactionRef) where transactionRef is not null;
create index if not exists payments_user_kind_created_idx on public.payments ("user", kind, createdat desc);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_order_method_created_idx on public.payments ("order", method, createdat desc);

-- ---------------------------------------------------------------------------
-- promotions
-- ---------------------------------------------------------------------------
create table if not exists public.promotions (
  _id           uuid primary key default gen_random_uuid(),
  code          text not null,
  title         text not null,
  description   text,
  type          text not null default 'percent' check (type in ('percent','flat')),
  value         double precision not null,
  maxDiscount   double precision,
  minOrder      double precision not null default 0,
  audience      jsonb not null default '{"type":"all","userIds":[]}',
  startsAt      timestamptz not null default now(),
  expiresAt     timestamptz,
  maxUses       double precision,
  usedCount     double precision not null default 0,
  active        boolean not null default true,
  createdAt     timestamptz not null default now(),
  updatedAt     timestamptz not null default now(),
  constraint promotions_value_check check (value >= 0)
);
create unique index if not exists promotions_code_key on public.promotions (code);
create index if not exists promotions_active_idx on public.promotions (active);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  _id        uuid primary key default gen_random_uuid(),
  "user"     uuid not null,
  type       text not null default 'system'
      check (type in ('order','ride','promo','system','wallet')),
  event      text not null default 'announcement'
      check (event in ('order_placed','order_accepted','order_rejected','order_preparing','order_ready',
                       'rider_assigned','rider_picked_up','rider_on_the_way','order_delivered',
                       'order_cancelled','ride_requested','ride_accepted','ride_arrived',
                       'ride_completed','ride_cancelled','payment_settled','announcement')),
  refId      text not null default '',
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}',
  read       boolean not null default false,
  readAt     timestamptz,
  createdAt  timestamptz not null default now(),
  updatedAt  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications ("user");
create index if not exists notifications_read_idx on public.notifications (read);
create index if not exists notifications_user_read_created_idx on public.notifications ("user", read, createdat desc);

-- ---------------------------------------------------------------------------
-- notification_broadcasts  (admin push history: one row per sent broadcast)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_broadcasts (
  _id         uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null default '',
  audience    text not null default 'all' check (audience in ('all', 'customers', 'riders')),
  "sentBy"    uuid,
  status      text not null default 'sent' check (status in ('sent', 'failed')),
  recipients  double precision not null default 0,
  pushed      double precision not null default 0,
  createdAt   timestamptz not null default now(),
  updatedAt   timestamptz not null default now()
);
create index if not exists notification_broadcasts_created_idx on public.notification_broadcasts (createdat desc);

-- ---------------------------------------------------------------------------
-- email_otps  (only the HMAC-SHA256 of the emailed code is stored)
-- ---------------------------------------------------------------------------
create table if not exists public.email_otps (
  _id          uuid primary key default gen_random_uuid(),
  email        text not null,
  purpose      text not null check (purpose in ('login', 'register', 'reset')),
  codeHash     text not null,
  attempts     double precision not null default 0,
  usedAt       timestamptz,
  expiresAt    timestamptz not null,
  requestedIp  text not null default '',
  createdAt    timestamptz not null default now(),
  updatedAt    timestamptz not null default now()
);
create index if not exists email_otps_email_purpose_created_idx on public.email_otps (email, purpose, createdat desc);
create index if not exists email_otps_codeHash_idx on public.email_otps (codeHash);
-- Postgres does not auto-expire rows; the OTP service always filters on
-- expiresAt > now() and marks spent rows via usedAt.

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  _id        uuid primary key default gen_random_uuid(),
  "user"     uuid not null,
  kind       text not null check (kind in ('restaurant','food')),
  refId      uuid not null,
  createdAt  timestamptz not null default now(),
  updatedAt  timestamptz not null default now()
);
create unique index if not exists favorites_user_kind_refId_key on public.favorites ("user", kind, refId);

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  _id          uuid primary key default gen_random_uuid(),
  "user"       uuid not null,
  subject      text not null,
  description  text not null,
  category     text not null default 'general',
  status       text not null default 'open'
      check (status in ('open','in_progress','resolved','closed')),
  priority     text not null default 'medium'
      check (priority in ('low','medium','high','urgent')),
  messages     jsonb not null default '[]',
  assignedTo   uuid,
  resolvedAt   timestamptz,
  createdAt    timestamptz not null default now(),
  updatedAt    timestamptz not null default now()
);
create index if not exists support_tickets_user_status_created_idx on public.support_tickets ("user", status, createdat desc);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  _id                uuid primary key default gen_random_uuid(),
  "user"             uuid not null,
  targetType         text not null check (targetType in ('restaurant','food','rider','ride')),
  targetId           uuid not null,
  restaurant         uuid,
  "order"            uuid,
  ride               uuid,
  rider              uuid,
  rating             double precision not null,
  title              text,
  comment            text,
  verifiedPurchase   boolean not null default false,
  createdAt          timestamptz not null default now(),
  updatedAt          timestamptz not null default now(),
  constraint reviews_rating_check check (rating >= 1 and rating <= 5)
);
create unique index if not exists reviews_user_target_key on public.reviews ("user", targetType, targetId);
create index if not exists reviews_target_created_idx on public.reviews (targetType, targetId, createdat desc);

-- ---------------------------------------------------------------------------
-- app_settings  (key/value settings edited from the admin panel)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  _id          uuid primary key default gen_random_uuid(),
  key          text not null,
  value        jsonb not null,
  label        text,
  description  text,
  createdAt    timestamptz not null default now(),
  updatedAt    timestamptz not null default now()
);
create unique index if not exists app_settings_key_key on public.app_settings (key);

-- ---------------------------------------------------------------------------
-- withdrawals (rider payouts)
-- ---------------------------------------------------------------------------
-- A withdrawal reserves the amount at request time (as a wallet `debit` row) and
-- releases it (a `refund` row) only when rejected/cancelled. `paid` records a
-- real external payout against already-reserved funds, so no balance moves then.
create table if not exists public.withdrawals (
  _id               uuid primary key default gen_random_uuid(),
  rider             uuid not null,
  reference         text not null,
  amount            double precision not null,
  availableBalance  double precision not null,
  destinationType   text not null check (destinationType in ('easypaisa','bank')),
  destination       text not null,
  destinationHolder text not null default '',
  status            text not null default 'pending'
      check (status in ('pending','approved','processing','paid','rejected','cancelled')),
  reserveTx         uuid,
  releaseTx         uuid,
  payoutReference   text,
  rejectReason      text,
  "note"            text,
  metadata          jsonb,
  createdAt         timestamptz not null default now(),
  updatedAt         timestamptz not null default now(),
  constraint withdrawals_amount_check check (amount >= 0)
);
create unique index if not exists withdrawals_reference_key on public.withdrawals (reference);
create index if not exists withdrawals_rider_created_idx on public.withdrawals (rider, createdat desc);
create index if not exists withdrawals_status_idx on public.withdrawals (status);

-- ---------------------------------------------------------------------------
-- Exactly-once ledger guards
-- ---------------------------------------------------------------------------
-- Wallet top-ups: one `topup_<transactionRef>` credit row per user.
create unique index if not exists wallet_transactions_topup_ref_key
  on public.wallet_transactions ("user", reference) where reference like 'topup\_%';

-- Rider earnings: a delivery can be paid exactly once per rider. The in-code
-- pre-check is the fast path; this index is the backstop when two completers race.
create unique index if not exists wallet_transactions_earning_order_key
  on public.wallet_transactions ("user", (metadata->>'orderId'))
  where type = 'earning' and metadata ? 'orderId';

-- Withdrawal releases: the refund that returns a reserved amount can only be
-- created once (makes reject/cancel exactly-once under concurrent calls).
create unique index if not exists wallet_transactions_withdrawal_release_key
  on public.wallet_transactions (reference) where reference like 'wd_release\_%';

-- ---------------------------------------------------------------------------
-- Schema migrations (additive; applied after every CREATE TABLE so this file
-- stays runnable on both fresh and existing databases)
-- ---------------------------------------------------------------------------

-- users.role: widen the allowed roles with `restaurant` (owner accounts).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.users'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role in%s%'
  loop
    execute format('alter table public.users drop constraint %I', c);
  end loop;
end $$;
alter table public.users
  add check (role in ('customer', 'rider', 'restaurant', 'admin'));

-- orders.note: free-text delivery instructions captured at checkout.
alter table public.orders add column if not exists note text;

-- orders.cancelledBy: restaurants may reject/cancel their own orders.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%cancelledby in%s%'
  loop
    execute format('alter table public.orders drop constraint %I', c);
  end loop;
end $$;
alter table public.orders
  add check (cancelledBy in ('customer', 'rider', 'restaurant', 'admin', 'system'));

-- restaurants: owner link + admin approval.
alter table public.restaurants add column if not exists ownerUser uuid;
create index if not exists restaurants_ownerUser_idx on public.restaurants (ownerUser);
alter table public.restaurants add column if not exists isApproved boolean not null default true;
create index if not exists restaurants_status_isapproved_idx on public.restaurants (status, isApproved);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, zero policies.
-- The backend uses the service role key (bypasses RLS). The anon key gets
-- read/write on none of these tables — everything goes through the API.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'users','customer_profiles','rider_profiles','rider_documents','restaurants',
        'food_categories','food_items','carts','addresses','orders','order_items',
        'rides','wallets','wallet_transactions','payments','promotions','notifications',
        'favorites','support_tickets','reviews','app_settings','withdrawals',
        'notification_broadcasts','email_otps'
      )
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- DEMO PAYMENTS (TESTING ONLY — never real money)
-- allowing method 'demo' + exactly-once admin ledger guard. The code paths that
-- write 'demo' rows are gated behind DEMO_PAYMENTS_ENABLED on the server.
-- ---------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%paymentmethod%'
      and pg_get_constraintdef(oid) not ilike '%demo%'
  loop
    execute format('alter table public.orders drop constraint %I', c);
  end loop;
end $$;
alter table public.orders
  add check (paymentMethod in ('cash','card','wallet','easypaisa','jazzcash','demo'));

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.payments'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%method%'
      and pg_get_constraintdef(oid) not ilike '%demo%'
  loop
    execute format('alter table public.payments drop constraint %I', c);
  end loop;
end $$;
alter table public.payments
  add check (method in ('easypaisa','jazzcash','cash','card','wallet','demo'));

-- One `demo_<transactionRef>` commission credit per (admin) user, exactly like
-- the topup guard, so a re-verified demo payment can never credit twice.
create unique index if not exists wallet_transactions_demo_ref_key
  on public.wallet_transactions ("user", reference) where reference like 'demo\_%';

-- ---------------------------------------------------------------------------
-- Storage bucket for food/rider imagery (replaces Cloudinary).
-- Public read; all writes go through the service-role key from the backend.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('swat-city', 'swat-city', true)
on conflict (id) do nothing;

commit;
