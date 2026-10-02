// ============================================================
// Swat City Backend - Notification service
//
// One call does all three delivery channels:
//   1. persists an in-app notification in MongoDB
//   2. emits it live over Socket.IO (foreground, app open)
//   3. pushes it remotely (background + terminated states)
//
// Remote delivery is routed per token: Expo Push tokens (what the Expo Go app
// registers) go through the Expo Push Service, anything else is treated as an
// FCM token and sent with firebase-admin. Tokens the transport reports as
// permanently invalid are pruned so the array does not grow forever.
// ============================================================

import {
  UserModel,
  NotificationModel,
  NOTIFICATION_KINDS,
  NOTIFICATION_EVENTS,
  type Notification,
  type NotificationEvent,
} from '../models';
import { sendMulticastNotification, sendPushNotification } from '../config/firebase';
import {
  isExpoPushToken,
  sendExpoMulticastNotification,
  sendExpoPushNotification,
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
    // The device list can legitimately mix Expo and FCM tokens, so each
    // transport gets exactly the tokens it understands.
    const expoTokens = tokens.filter(isExpoPushToken);
    const fcmTokens = tokens.filter((t) => !isExpoPushToken(t));

    const jobs: Array<Promise<{ invalidTokens: string[] }>> = [];

    if (expoTokens.length > 0) {
      jobs.push(
        expoTokens.length === 1
          ? sendExpoPushNotification(expoTokens[0]!, payload).then(() => ({
              invalidTokens: [] as string[],
            }))
          : sendExpoMulticastNotification(expoTokens, payload),
      );
    }

    if (fcmTokens.length > 0) {
      jobs.push(
        fcmTokens.length === 1
          ? sendPushNotification(fcmTokens[0]!, payload).then(() => ({
              invalidTokens: [] as string[],
            }))
          : sendMulticastNotification(fcmTokens, payload),
      );
    }

    const outcomes = await Promise.all(jobs);
    const invalid = outcomes.flatMap((o) => o.invalidTokens);
    if (invalid.length > 0) {
      await removeDeviceTokens(userId, invalid);
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
export async function removeDeviceTokens(userId: string, tokens: string[]): Promise<void> {
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

/** Fan-out helper for announcements to every account holding a given role. */
export async function notifyRole(
  role: 'customer' | 'rider' | 'admin',
  input: NotificationInput,
): Promise<number> {
  const recipients = await UserModel.find({ role, status: 'active' }).select('_id').lean();
  if (recipients.length === 0) return 0;

  await Promise.all(recipients.map((r) => notifyUser(String(r._id), input).catch(() => undefined)));
  return recipients.length;
}

export { NOTIFICATION_EVENTS, NOTIFICATION_KINDS };
export type { Notification };