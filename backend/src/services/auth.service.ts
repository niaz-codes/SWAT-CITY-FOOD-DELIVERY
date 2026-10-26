import {
  CustomerProfileModel,
  RiderProfileModel,
  RestaurantModel,
  UserModel,
  WalletModel,
  type UserRole,
} from '../models';
import { hashPassword } from '../utils/helpers';
import { signAccessToken, signRefreshToken, verifyEmailOtpChallenge } from '../utils/tokens';
import { AppError, CONFLICT, FORBIDDEN, UNAUTHORIZED } from '../utils/AppError';
import { normalizePhone } from '../utils/helpers';
import { verifyPassword } from '../utils/helpers';
import { getOrCreateWallet } from './wallet.service';
import { notifyUser } from './notification.service';
import {
  issueEmailOtp,
  consumeEmailOtp,
  buildOtpChallenge,
  OTP_TTL_SECONDS,
  type OtpChallengeResponse,
} from './otp.service';

export interface AuthResult {
  user: Record<string, unknown>;
  accessToken: string;
  refreshToken: string;
}

/** Sanitized public user representation. NEVER leaks password hashes. */
export function publicUser(user: {
  _id: unknown;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  verified?: boolean;
  status?: string;
  isApproved?: boolean;
  pendingApproval?: boolean;
}): Record<string, unknown> {
  return {
    id: String(user._id),
    name: user.name ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    role: user.role,
    avatarUrl: user.avatarUrl ?? '',
    verified: Boolean(user.verified),
    status: user.status ?? 'active',
    isApproved: Boolean(user.isApproved),
    pendingApproval: Boolean(user.pendingApproval),
  };
}

export async function buildAuthResult(user: {
  _id: unknown;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  verified?: boolean;
  status?: string;
  isApproved?: boolean;
  pendingApproval?: boolean;
}): Promise<AuthResult> {
  const userId = String(user._id);
  const accessToken = signAccessToken(userId, user.role);
  const refreshToken = signRefreshToken(userId);
  return { user: publicUser(user), accessToken, refreshToken };
}

/**
 * What login / register answer with when a 6-digit email code still has to be
 * confirmed. No access token is issued until that code is verified.
 */
export type { OtpChallengeResponse };

/**
 * Undo a just-created, still-unverified registration when the verification
 * email could not be sent.
 *
 * Without this the account exists but can never be verified, and the user's
 * retry is rejected with "this email already exists" - a dead end. Deletion is
 * guarded on `verified: false` so a concurrent successful verification wins.
 */
async function rollbackUnverifiedRegistration(userId: string): Promise<void> {
  await Promise.all([
    CustomerProfileModel.deleteOne({ user: userId }).catch(() => undefined),
    RiderProfileModel.deleteOne({ user: userId }).catch(() => undefined),
    WalletModel.deleteOne({ user: userId }).catch(() => undefined),
    // A restaurant-owner registration also created the restaurant record; it
    // must not survive a rolled-back (failed verification) attempt.
    RestaurantModel.deleteOne({ ownerUser: userId }).catch(() => undefined),
  ]);
  await UserModel.deleteOne({ _id: userId, verified: false }).catch(() => undefined);
}

/**
 * Register a customer or rider account. Admin role is never accepted here —
 * admins are seeded by the system only. Every new user gets a wallet.
 *
 * The account is created UNVERIFIED: no session is issued until the 6-digit
 * code emailed to `input.email` is confirmed (see `verifyEmailOtp`). This is the
 * only registration path, so an unverified email can never hold a session.
 */
export async function registerUser(input: {
  name: string;
  phone: string;
  email?: string;
  role: 'customer' | 'rider';
  password: string;
  vehicleType?: 'bike' | 'rickshaw' | 'van' | 'car';
  vehicleBrand?: string;
  vehiclePlate?: string;
  cnic?: string;
}): Promise<OtpChallengeResponse> {
  const email = input.email?.trim().toLowerCase();
  if (!email) throw new AppError('An email address is required', 422);

  const normalized = normalizePhone(input.phone);
  const existing = await UserModel.findOne({
    $or: [{ phone: normalized }, { email }],
  });
  if (existing) {
    throw CONFLICT(
      existing.phone === normalized
        ? 'An account with this phone already exists'
        : 'An account with this email already exists',
    );
  }

  const password = await hashPassword(input.password);
  const user = await UserModel.create({
    name: input.name,
    phone: normalized,
    email,
    role: input.role,
    password,
    verified: false,
    isApproved: input.role === 'customer',
    pendingApproval: input.role === 'rider',
  });

  if (input.role === 'customer') {
    await CustomerProfileModel.create({ user: user._id, name: input.name });
  } else if (input.role === 'rider') {
    await RiderProfileModel.create({
      user: user._id,
      name: input.name,
      phone: normalized,
      cnic: input.cnic,
      vehicleType: input.vehicleType ?? 'bike',
      vehicleBrand: input.vehicleBrand,
      vehiclePlate: input.vehiclePlate,
      approvalStatus: 'pending',
    });
  }

  await getOrCreateWallet(String(user._id), input.role === 'rider');

  const issued = await issueEmailOtp({ email, purpose: 'register', name: input.name }).catch(
    async (error) => {
      await rollbackUnverifiedRegistration(String(user._id));
      throw error;
    },
  );
  // The client is about to show "enter the code we emailed you". If the
  // provider refused the mail, answering with a challenge anyway would strand
  // the new account on a screen waiting for an email that never arrives - so a
  // refused send becomes a visible, retryable error instead.
  try {
    assertEmailSent(issued);
  } catch (error) {
    await rollbackUnverifiedRegistration(String(user._id));
    throw error;
  }
  return buildOtpChallenge({ userId: String(user._id), email, purpose: 'register', issued });
}

/**
 * Register a restaurant owner together with the restaurant they will manage.
 *
 * Mirrors `registerUser` (unverified account → emailed OTP → session on
 * verification) with two extras:
 *  - the account holds role `restaurant` and is never session-usable before the
 *    email code is confirmed;
 *  - the companion restaurant is created unapproved (`isApproved: false`,
 *    `status: 'closed'`) so nothing shows up in the customer app until an
 *    admin approves it in the admin panel.
 */
export async function registerRestaurantOwner(input: {
  name: string;
  phone: string;
  email?: string;
  password: string;
  restaurantName: string;
  cuisine?: string;
  category?: string;
  description?: string;
  emoji?: string;
  phoneRestaurant?: string;
  addressLine?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
}): Promise<OtpChallengeResponse> {
  const email = input.email?.trim().toLowerCase();
  if (!email) throw new AppError('An email address is required', 422);

  const normalized = normalizePhone(input.phone);
  const existing = await UserModel.findOne({
    $or: [{ phone: normalized }, { email }],
  });
  if (existing) {
    throw CONFLICT(
      existing.phone === normalized
        ? 'An account with this phone already exists'
        : 'An account with this email already exists',
    );
  }

  const password = await hashPassword(input.password);
  const user = await UserModel.create({
    name: input.name,
    phone: normalized,
    email,
    role: 'restaurant',
    password,
    verified: false,
    isApproved: false,
    pendingApproval: true,
  });

  await RestaurantModel.create({
    name: input.restaurantName,
    description: input.description,
    cuisine: input.cuisine,
    category: input.category,
    emoji: input.emoji,
    ownerName: input.name,
    phone: input.phoneRestaurant,
    addressLine: input.addressLine,
    area: input.area,
    ownerUser: user._id,
    isApproved: false,
    status: 'closed',
    location:
      typeof input.latitude === 'number' && typeof input.longitude === 'number'
        ? { type: 'Point', coordinates: [input.longitude, input.latitude] }
        : undefined,
  });

  // Wallets are for customers/riders; an owner account does not hold one.
  const issued = await issueEmailOtp({ email, purpose: 'register', name: input.name }).catch(
    async (error) => {
      await rollbackUnverifiedRegistration(String(user._id));
      throw error;
    },
  );
  try {
    assertEmailSent(issued);
  } catch (error) {
    await rollbackUnverifiedRegistration(String(user._id));
    throw error;
  }
  return buildOtpChallenge({ userId: String(user._id), email, purpose: 'register', issued });
}

/**
 * Step 1 of email + password sign-in.
 *
 * The credentials are checked exactly as before, but instead of a session the
 * caller receives an email-OTP challenge. The access token is only minted once
 * the emailed code is confirmed, so a stolen password alone is not enough.
 */
export async function beginEmailLogin(
  email: string,
  password: string,
): Promise<OtpChallengeResponse> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail }).select('+password');
  // Same message whether the account is missing, passwordless, or wrong - the
  // response must never reveal which emails are registered.
  if (!user) throw UNAUTHORIZED('Invalid email or password');

  const valid = user.password ? await verifyPassword(password, String(user.password)) : false;
  if (!valid) throw UNAUTHORIZED('Invalid email or password');
  if (user.status === 'suspended') throw new AppError('Account is suspended', 403);

  const issued = await issueEmailOtp({
    email: normalizedEmail,
    purpose: 'login',
    name: user.name ?? undefined,
  });
  // The user is about to be shown a "enter the code we emailed you" screen.
  // If SMTP rejected the send, returning a challenge anyway would strand them
  // on that screen waiting for an email that never arrives — fail loudly so
  // the client shows a retryable error instead.
  assertEmailSent(issued);
  return buildOtpChallenge({
    userId: String(user._id),
    email: normalizedEmail,
    purpose: 'login',
    issued,
  });
}

/**
 * The error a refused email send turns into.
 *
 * Supabase knows exactly how long this address has to wait before another
 * code may be requested; repeating that number saves the user from guessing.
 */
export function emailSendFailure(issued: { retryAfterSeconds?: number }): AppError {
  if (issued.retryAfterSeconds) {
    return new AppError(
      `We could not send the verification email. Please try again in ${issued.retryAfterSeconds} seconds.`,
      502,
    );
  }
  return new AppError(
    'We could not send the verification email. Please try again in a moment.',
    502,
  );
}

/**
 * Fail loudly when the provider refused to send the code.
 *
 * Every flow that shows a "we emailed you a code" screen calls this. When the
 * mail never left, answering with a challenge anyway would strand the user in
 * front of an inbox that stays empty, so the failure becomes a visible,
 * retryable error instead of a silent wait.
 */
export function assertEmailSent(issued: {
  emailSent: boolean;
  retryAfterSeconds?: number;
}): void {
  if (issued.emailSent) return;
  throw emailSendFailure(issued);
}

/**
 * Verify welcome note per role, so a pending owner/rider is not told their
 * account is fully ready when the admin review step is still pending.
 */
function welcomeBody(role: UserRole): string {
  if (role === 'rider') {
    return 'Your profile is under review. You can browse until you are approved to take orders.';
  }
  if (role === 'restaurant') {
    return 'Your restaurant is under review. You can set up your menu now; it goes live once an admin approves it.';
  }
  return 'Your account is ready. Enjoy your first order!';
}

/**
 * Step 2 of email-OTP: verify the emailed code and, on success, mint the
 * session. Shared by the `login` and `register` purposes — the only difference
 * is that a registration also flips `verified` on and sends the welcome note.
 */
export async function verifyEmailOtp(challengeToken: string, otp: string): Promise<AuthResult> {
  const claims = verifyEmailOtpChallenge(challengeToken);
  if (claims.purpose !== 'login' && claims.purpose !== 'register') {
    throw UNAUTHORIZED('Invalid verification session');
  }

  await consumeEmailOtp({ email: claims.email, purpose: claims.purpose, code: otp });

  const user = await UserModel.findById(claims.sub).lean();
  if (!user) throw UNAUTHORIZED('Account no longer exists');
  if (user.status === 'suspended') throw new AppError('Account is suspended', 403);

  if (!user.verified) {
    await UserModel.updateOne({ _id: user._id }, { $set: { verified: true } });
    await notifyUser(String(user._id), {
      type: 'system',
      title: 'Welcome to Swat City Food Delivery',
      body: welcomeBody(user.role),
    });
  }

  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return buildAuthResult({ ...user, verified: true });
}

/**
 * Re-issue the 6-digit code for a half-finished flow.
 *
 * Takes the same challenge token the verify step uses, so a resend can only
 * ever target the email + purpose the flow already proved. The account is looked
 * up again rather than trusted from the request body.
 *
 * An unknown / removed account (only reachable on the reset path) mirrors the
 * enumeration-safe forgot-password response: a challenge is returned but nothing
 * is emailed, so a resend cannot reveal whether an address is registered.
 */
export async function resendEmailOtp(challengeToken: string): Promise<OtpChallengeResponse> {
  const claims = verifyEmailOtpChallenge(challengeToken);
  const user = claims.sub ? await UserModel.findById(claims.sub).select('name email').lean() : null;

  if (!user) {
    return buildOtpChallenge({
      userId: '',
      email: claims.email,
      purpose: claims.purpose,
      issued: { email: claims.email, ttlSeconds: OTP_TTL_SECONDS },
    });
  }

  const issued = await issueEmailOtp({
    email: claims.email,
    purpose: claims.purpose,
    name: user.name ?? undefined,
  });
  // Same rule as the login step: a "we sent a new code" answer that no email
  // follows strands the user on the code screen, so a refused send is a
  // visible, retryable error instead.
  assertEmailSent(issued);
  return buildOtpChallenge({
    userId: String(user._id),
    email: claims.email,
    purpose: claims.purpose,
    issued,
  });
}

// ---------------------------------------------------------------------------
// NOTE: phone / SMS OTP has been removed. Every account verifies its email with
// a 6-digit code issued by `otp.service` and confirmed through `verifyEmailOtp`.
// ---------------------------------------------------------------------------

/**
 * Register a rider from the full onboarding form.
 *
 * Differs from `registerUser` because rider onboarding carries three things the
 * generic path cannot express:
 *   - the self-taken photo (already uploaded to Cloudinary by the controller)
 *   - the picked base location from the live map
 *   - bike registration number and experience, both mandatory
 *
 * The photo is written to `photoUrl`, never to the admin-owned `avatarUrl`: a
 * rider's camera shot is an application attachment awaiting approval, not a
 * published profile picture.
 */
export async function registerRiderWithPhoto(
  input: {
    name: string;
    phone: string;
    email?: string;
    password: string;
    cnic: string;
    baseCity?: string;
    vehicleType: 'bike' | 'rickshaw' | 'van' | 'car';
    vehiclePlate: string;
    experienceYears: number;
    location: { lat: number; lng: number; label?: string };
  },
  photo: { url: string; publicId: string },
): Promise<OtpChallengeResponse> {
  const normalized = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase();
  if (!email) throw new AppError('An email address is required', 422);

  const clash = await UserModel.findOne({
    $or: [{ phone: normalized }, { email }],
  });
  if (clash) {
    throw CONFLICT(
      clash.phone === normalized
        ? 'An account with this phone already exists'
        : 'An account with this email already exists',
    );
  }

  const hashed = await hashPassword(input.password);
  const user = await UserModel.create({
    name: input.name,
    phone: normalized,
    email,
    role: 'rider',
    password: hashed,
    verified: false,
    isApproved: false,
    pendingApproval: true,
  });

  await RiderProfileModel.create({
    user: user._id,
    name: input.name,
    phone: normalized,
    cnic: input.cnic,
    baseCity: input.baseCity,
    vehicleType: input.vehicleType,
    vehiclePlate: input.vehiclePlate,
    experienceYears: input.experienceYears,
    photoUrl: photo.url,
    photoPublicId: photo.publicId,
    photoUploadedAt: new Date(),
    baseLocation: {
      lat: input.location.lat,
      lng: input.location.lng,
      label: input.location.label ?? null,
      setAt: new Date(),
    },
    approvalStatus: 'pending',
  });

  await getOrCreateWallet(String(user._id), true);

  const issued = await issueEmailOtp({ email, purpose: 'register', name: input.name }).catch(
    async (error) => {
      await rollbackUnverifiedRegistration(String(user._id));
      throw error;
    },
  );
  // Same rule as the login step: a "we sent a code" answer that no email
  // follows would leave the new rider staring at a code screen with nothing in
  // their inbox, so a refused send is reported instead of hidden.
  try {
    assertEmailSent(issued);
  } catch (error) {
    // The account/profile/wallet are rolled back so the rider can retry; the
    // controller also removes the already-uploaded photo.
    await rollbackUnverifiedRegistration(String(user._id));
    throw error;
  }
  return buildOtpChallenge({ userId: String(user._id), email, purpose: 'register', issued });
}

/** Article for a role name, so error messages read naturally. */
const aOrAn = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/**
 * Refuse any email that already belongs to a rider or admin.
 *
 * A Google sign-in must never be able to reach or mint a privileged account,
 * and must not silently hand a rider's account to the customer app.
 */
async function assertCustomerEmailAvailable(email: string): Promise<void> {
  const existing = await UserModel.findOne({ email });
  if (!existing) return;
  if (existing.role !== 'customer') {
    throw FORBIDDEN(
      `This Google account is registered as ${aOrAn(existing.role)} ${existing.role}. Please sign in with your mobile number instead.`,
    );
  }
  if (existing.status === 'suspended') throw new AppError('Account is suspended', 403);
}

/**
 * Customer sign-in / sign-up with Google.
 *
 * Google has already verified the email, so an existing customer gets a session
 * immediately and a brand new email is registered on the spot — no phone number
 * and no second OTP step. The verified Google email is itself the proof of
 * ownership that the email-OTP flow provides for password sign-ups.
 *
 * A Google email that belongs to a rider or admin is refused: it must never be
 * able to reach or mint a privileged account.
 */
export type GoogleAuthOutcome = { kind: 'session'; result: AuthResult; created: boolean };

export async function loginOrRegisterGoogleCustomer(identity: {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}): Promise<GoogleAuthOutcome> {
  const email = identity.email.trim().toLowerCase();
  const existing = await UserModel.findOne({ email });

  if (existing) {
    await assertCustomerEmailAvailable(email);

    // Backfill details that Google knows but the account was created without.
    const patch: Record<string, unknown> = {};
    if (!existing.name) patch.name = identity.name;
    if (!existing.avatarUrl && identity.picture) patch.avatarUrl = identity.picture;
    if (Object.keys(patch).length > 0) {
      await UserModel.updateOne({ _id: existing._id }, { $set: patch }).exec();
      Object.assign(existing, patch);
    }
    await UserModel.updateOne({ _id: existing._id }, { $set: { lastLoginAt: new Date() } }).exec();
    return { kind: 'session', result: await buildAuthResult(existing), created: false };
  }

  const user = await UserModel.create({
    name: identity.name,
    email,
    avatarUrl: identity.picture ?? undefined,
    role: 'customer',
    verified: true,
    isApproved: true,
  });

  await CustomerProfileModel.create({
    user: user._id,
    name: user.name ?? undefined,
    avatarUrl: identity.picture ?? undefined,
  });
  await getOrCreateWallet(String(user._id), false);
  await notifyUser(String(user._id), {
    type: 'system',
    title: 'Welcome to Swat City Food Delivery',
    body: 'Your account is ready. Enjoy your first order!',
  });
  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).exec();

  return { kind: 'session', result: await buildAuthResult(user), created: true };
}
