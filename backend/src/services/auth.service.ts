import { CustomerProfileModel, RiderProfileModel, UserModel, WalletModel, type UserRole } from '../models';
import { hashPassword } from '../utils/helpers';
import { signAccessToken, signRefreshToken } from '../utils/tokens';
import { AppError, CONFLICT, UNAUTHORIZED } from '../utils/AppError';
import { normalizePhone } from '../utils/helpers';
import { verifyPassword } from '../utils/helpers';
import { getOrCreateWallet } from './wallet.service';
import { notifyUser } from './notification.service';

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

export async function findUserByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return UserModel.findOne({ phone: normalized });
}

/**
 * Register a customer or rider account. Admin role is never accepted here —
 * admins are seeded by the system only. Every new user gets a wallet.
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
}): Promise<AuthResult> {
  const normalized = normalizePhone(input.phone);
  const existing = await UserModel.findOne({
    $or: [{ phone: normalized }, input.email ? { email: input.email.toLowerCase() } : null].filter(
      Boolean,
    ) as object[],
  });
  if (existing) {
    throw CONFLICT(existing.phone === normalized ? 'An account with this phone already exists' : 'An account with this email already exists');
  }

  const password = await hashPassword(input.password);
  const user = await UserModel.create({
    name: input.name,
    phone: normalized,
    email: input.email?.toLowerCase() || undefined,
    role: input.role,
    password,
    verified: true,
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
  await notifyUser(String(user._id), {
    type: 'system',
    title: 'Welcome to Swat City',
    body:
      input.role === 'rider'
        ? 'Your profile is under review. You can browse until you are approved to take orders.'
        : 'Your account is ready. Enjoy your first order!',
  });

  UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).exec();
  return buildAuthResult(user);
}

export async function loginWithPassword(phone: string, password: string): Promise<AuthResult> {
  const normalized = normalizePhone(phone);
  const user = await UserModel.findOne({ phone: normalized }).select('+password');
  if (!user) throw UNAUTHORIZED('Invalid phone or password');

  const valid = await verifyPassword(password, user.password ? String(user.password) : '');
  if (!valid) throw UNAUTHORIZED('Invalid phone or password');
  if (user.status === 'suspended') throw new AppError('Account is suspended', 403);

  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).exec();
  return buildAuthResult(user);
}

// ---------------------------------------------------------------------------
// OTP - short lived; SMS gateway is a plug point. In development the OTP is
// echoed in the response (meta.debugOtp) so manual flows are testable.
// ---------------------------------------------------------------------------

const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function requestOtp(phone: string): { otp: string | null; debugOtp: string | undefined } {
  const normalized = normalizePhone(phone);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(normalized, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  // NOTE: In production this is where an SMS/OTP gateway is called.
  // eslint-disable-next-line no-console
  console.log(`[otp] OTP for ${normalized}: ${otp}`);
  return { otp, debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined };
}

export function verifyOtp(phone: string, otp: string, name?: string, email?: string): boolean {
  const normalized = normalizePhone(phone);
  const entry = otpStore.get(normalized);
  if (!entry) throw UNAUTHORIZED('No OTP requested for this number. Request one first.');
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalized);
    throw UNAUTHORIZED('OTP has expired. Request a new one.');
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(normalized);
    throw UNAUTHORIZED('Too many incorrect attempts. Request a new OTP.');
  }
  if (entry.otp !== otp) {
    throw UNAUTHORIZED('Invalid OTP');
  }
  otpStore.delete(normalized);
  return true;
}

/** Create a session for a phone that verified an OTP (used by OTP login). */
export async function upsertOtpUser(input: {
  phone: string;
  name?: string;
  email?: string;
}): Promise<AuthResult> {
  const normalized = normalizePhone(input.phone);
  let user = await UserModel.findOne({ phone: normalized });
  if (!user) {
    user = await UserModel.create({
      name: input.name?.trim() || 'Swat Customer',
      phone: normalized,
      email: input.email?.toLowerCase() || undefined,
      role: 'customer',
      verified: true,
      isApproved: true,
    });
    await CustomerProfileModel.create({ user: user._id, name: user.name });
    await getOrCreateWallet(String(user._id), false);
  }
  if (user.status === 'suspended') throw new AppError('Account is suspended', 403);
  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).exec();
  return buildAuthResult(user);
}