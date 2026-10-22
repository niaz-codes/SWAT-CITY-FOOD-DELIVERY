// ============================================================
// Swat City Backend - Notification service
//
// One call does all three delivery channels:
//   1. persists an in-app notification in Supabase
//   2. emits it live over Socket.IO (foreground, app open)
//   3. pushes it remotely (background + terminated states)
//
// Remote delivery is routed per token: only Expo Push tokens (what the app
// registers) can be delivered, because the backend talks to the Expo Push
// Service and no other provider. Tokens the transport reports as permanently
// invalid are pruned so the array does not grow forever.
// ============================================================

import {
  UserModel,
  NotificationModel,
  NOTIFICATION_KINDS,
  NOTIFICATION_EVENTS,
  type BroadcastAudience,
  type Notification,
  type NotificationEvent,
  type UserRole,
} from '../models';
import {
  isExpoPushToken,
  sendExpoMulticastNotification,
} from '../config/expoPush';
import { emitToUser, isSocketReady } from '../sockets';
import { AppError } from '../utils/AppError';

type NotifKind = (typeof NOTIFICATION_KINDS)[number];

interface NotificationInput {
  type?: NotifKind;
  /** Routing hint; defaults to a generic announcement. */
  event?: NotificationEvent;
  /** Order / ride / ticket id the tap should open. */
  refId?: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

/** Create, emit and push a notification. Never throws on push failure. */
export async function notifyUser(userId: string, input: NotificationInput): Promise<Notification> {
  const user = await UserModel.findById(userId).select('deviceTokens').lean();
  if (!user) throw new AppError('Target user not found', 404);

  const event = input.event ?? 'announcement';

  const notification = await NotificationModel.create({
    user: userId,
    type: input.type ?? 'system',
    event,
    refId: input.refId ?? '',
    title: input.title,
    body: input.body ?? '',
    data: input.data ?? {},
  });

  if (isSocketReady()) {
    emitToUser(userId, 'notification:new', notification.toObject());
  }

  const tokens = (user.deviceTokens ?? []).filter(Boolean);
  if (tokens.length > 0) {
    // Fire-and-forget: the API response must never wait on the push transport.
    void pushToTokens(userId, tokens, {
      event,
      kind: input.type ?? 'system',
      refId: input.refId ?? '',
      notificationId: String(notification._id),
      title: input.title,
      body: input.body ?? '',
    });
  }

  return notification;
}

/**
 * Push to a token list and delete the ones the transport reports as permanently
 * invalid. Never rejects - callers fire-and-forget it.
 */
async function pushToTokens(
  userId: string,
  tokens: string[],
  payload: {
    event: NotificationEvent;
    kind: NotifKind;
    refId: string;
    notificationId: string;
    title: string;
    body: string;
  },
): Promise<void> {
  try {
    // Only Expo tokens are deliverable. Silently posting an FCM token to the
    // Expo API produced a rejected ticket and, worse, looked like a successful
    // send in the logs, so drop non-Expo tokens explicitly.
    const expoTokens = [...new Set(tokens.filter(isExpoPushToken))];
    if (expoTokens.length === 0) {
      if (tokens.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[push] ${tokens.length} device token(s) for user ${userId} are not Expo push tokens; skipping`,
        );
      }
      return;
    }

    // Always use the multicast path: it returns per-ticket errors, so a dead
    // token is pruned even when the user only has one device. The single-send
    // helper cannot report DeviceNotRegistered.
    const result = await sendExpoMulticastNotification(expoTokens, payload);
    if (result.invalidTokens.length > 0) {
      await removeDeviceTokens(userId, result.invalidTokens);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[push] delivery attempt failed:', (error as Error).message);
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await NotificationModel.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } },
  );
}

export async function markRead(userId: string, notificationId: string): Promise<Notification> {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { read: true, readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw new AppError('Notification not found', 404);
  return notification;
}

export async function listNotifications(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ notifications: Notification[]; unread: number; total: number }> {
  const [notifications, unread, total] = await Promise.all([
    NotificationModel.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments({ user: userId, read: false }),
    NotificationModel.countDocuments({ user: userId }),
  ]);
  return { notifications, unread, total };
}

/**
 * Persist a push registration token.
 * `$addToSet` makes re-registering the same device a no-op, and the token is
 * first removed from any other account so a shared device cannot keep pushing
 * to the previous user.
 */
export async function registerDeviceToken(userId: string, token: string): Promise<void> {
  const clean = token.trim();
  if (!clean) throw new AppError('Device token is required', 422);

  await UserModel.updateMany(
    { deviceTokens: clean, _id: { $ne: userId } },
    { $pull: { deviceTokens: clean } },
  );
  await UserModel.updateOne({ _id: userId }, { $addToSet: { deviceTokens: clean } });
}

export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $pull: { deviceTokens: token } });
}

/** Bulk prune used after a failed multicast send. */
async function removeDeviceTokens(userId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const result = await UserModel.updateOne(
    { _id: userId },
    { $pull: { deviceTokens: { $in: tokens } } },
  );
  if (result.modifiedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`[push] pruned ${result.modifiedCount} invalid device token(s)`);
  }
}

// ---------------------------------------------------------------------------
// Admin broadcasts
// ---------------------------------------------------------------------------

export interface BroadcastInput {
  title: string;
  body: string;
  audience: BroadcastAudience;
}

export interface BroadcastResult {
  audience: BroadcastAudience;
  /** Users that received an in-app notification row. */
  recipients: number;
  /** Device tokens targeted for the remote push. */
  pushed: number;
}

/** Role set each audience maps to. Admins are never broadcast targets. */
const BROADCAST_AUDIENCE_ROLES: Record<BroadcastAudience, UserRole[]> = {
  all: ['customer', 'rider'],
  customers: ['customer'],
  riders: ['rider'],
};

/**
 * Fan one admin announcement out to every active user in the audience:
 *   - one persisted in-app notification per recipient (bulk insert)
 *   - a live Socket.IO emit per recipient
 *   - a batched Expo push to every registered device token
 *
 * Invalid tokens the transport reports are pruned per owning user. Push
 * delivery is fire-and-forget and never throws - the API response only reports
 * how many recipients and tokens the fan-out targeted.
 */
export async function broadcastNotification(input: BroadcastInput): Promise<BroadcastResult> {
  const roles = BROADCAST_AUDIENCE_ROLES[input.audience] ?? BROADCAST_AUDIENCE_ROLES.all;

  const users = await UserModel.find({ role: { $in: roles }, status: 'active', deletedAt: null })
    .select('deviceTokens')
    .lean();

  if (users.length === 0) {
    return { audience: input.audience, recipients: 0, pushed: 0 };
  }

  const created = await NotificationModel.insertMany(
    users.map((user) => ({
      user: String(user._id),
      type: 'system',
      event: 'announcement',
      refId: '',
      title: input.title,
      body: input.body,
      data: { broadcast: true, audience: input.audience },
    })),
  );

  if (isSocketReady()) {
    for (const notification of created) {
      const plain = notification.toObject();
      emitToUser(String(plain.user), 'notification:new', plain);
    }
  }

  // token -> owning user ids, so a token reported invalid can be pruned from
  // every account that still holds it (a device can be shared between logins).
  const tokenOwners = new Map<string, Set<string>>();
  for (const user of users) {
    const userId = String(user._id);
    for (const raw of user.deviceTokens ?? []) {
      const token = raw?.trim();
      if (!token) continue;
      const owners = tokenOwners.get(token) ?? new Set<string>();
      owners.add(userId);
      tokenOwners.set(token, owners);
    }
  }

  const tokens = [...tokenOwners.keys()];
  if (tokens.length > 0) {
    void pushBroadcast(tokens, tokenOwners, input);
  }

  return { audience: input.audience, recipients: users.length, pushed: tokens.length };
}

/** Batched multicast + per-owner pruning of tokens Expo reports as dead. */
async function pushBroadcast(
  tokens: string[],
  tokenOwners: Map<string, Set<string>>,
  input: BroadcastInput,
): Promise<void> {
  const payload = {
    event: 'announcement' as NotificationEvent,
    kind: 'system' as NotifKind,
    refId: '',
    notificationId: '',
    title: input.title,
    body: input.body,
  };

  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    try {
      const result = await sendExpoMulticastNotification(batch, payload);
      for (const token of result.invalidTokens ?? []) {
        const owners = tokenOwners.get(token);
        if (!owners) continue;
        for (const userId of owners) await removeDeviceToken(userId, token);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[push] broadcast batch failed:', (error as Error).message);
    }
  }
}

export { NOTIFICATION_EVENTS, NOTIFICATION_KINDS };
export type { Notification };
