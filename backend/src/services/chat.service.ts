import { ChatMessageModel, OrderModel, RestaurantModel, UserModel } from '../models';
import type { Order } from '../models';
import { AppError, FORBIDDEN, NOT_FOUND } from '../utils/AppError';
import { getIO, isSocketReady, SOCKET_EVENTS } from '../sockets';
import { notifyUser } from './notification.service';

/**
 * Per-order chat (customer ↔ rider ↔ restaurant owner).
 *
 * A thread exists for every order; there is no "start chat" step. Similar to
 * food-delivery apps: the customer can talk to the restaurant while food is
 * being cooked and to the rider once one is assigned; the rider and the
 * restaurant owner can likewise message the customer. Admins are never
 * participants — they read orders/payments, not chats.
 *
 * Participation is derived from the ORDER row, never from the request body:
 * the sender must be the customer, the assigned rider, or the restaurant's
 * ownerUser, and the recipient is auto-resolved:
 *   customer → assigned rider, falling back to the restaurant owner
 *   rider    → customer
 *   restaurant → customer
 */

export interface ChatAccess {
  role: 'customer' | 'rider' | 'restaurant';
  /** The user id this participant's messages are delivered to. */
  counterpartId: string | null;
  /** Opposite-side label for prompt/UI copy. */
  counterpartRole: 'customer' | 'rider' | 'restaurant' | null;
}

export interface ChatOrderShape {
  _id: unknown;
  customer: unknown;
  rider?: string | null;
  restaurant: unknown;
  status?: Order['status'] | string;
}

/**
 * Pure: does this user participate in this order's chat, and who is their
 * counterpart? Customers always participate (the thread is theirs). Riders only
 * once assigned. Restaurant owners only when the order is theirs. Used by both
 * the routes guard and unit tests.
 */
export function describeChatAccess(
  order: ChatOrderShape,
  userId: string,
  ownerUserId: string | null,
): ChatAccess | null {
  const isCustomer = String(order.customer) === userId;
  const isRider = order.rider != null && String(order.rider) === userId;
  const isOwner = ownerUserId != null && ownerUserId === userId;

  if (isCustomer) {
    if (order.rider != null) {
      return { role: 'customer', counterpartId: String(order.rider), counterpartRole: 'rider' };
    }
    if (ownerUserId != null) {
      return { role: 'customer', counterpartId: ownerUserId, counterpartRole: 'restaurant' };
    }
    return null; // nobody to talk to yet (restaurant link missing)
  }
  if (isRider) {
    return { role: 'rider', counterpartId: String(order.customer), counterpartRole: 'customer' };
  }
  if (isOwner) {
    return { role: 'restaurant', counterpartId: String(order.customer), counterpartRole: 'customer' };
  }
  return null;
}

/** Pure: is chatting open for this order right now? */
export function chatOpenForStatus(status: string): boolean {
  // Cancelled orders: extracting an address/refund becomes support, not chat.
  // Delivered orders: allow a grace window (handled by the DB caller) to keep
  // the simple status enum together — evaluated in isChatOpen().
  return status !== 'cancelled';
}

const CHAT_GRACE_AFTER_DELIVERY_MS = 24 * 60 * 60 * 1000;

/** DB-backed guard: permission + open-check for both POST and GET. */
export async function assertChatAccess(
  orderId: string,
  userId: string,
): Promise<{ access: ChatAccess; order: Order }> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw NOT_FOUND('Order');

  const restaurant = (await RestaurantModel.findById(order.restaurant)
    .select('ownerUser')
    .lean()) as unknown as { ownerUser?: string | null } | null;
  const access = describeChatAccess(
    { _id: order._id, customer: order.customer, rider: order.rider ?? null, restaurant: order.restaurant, status: order.status },
    userId,
    restaurant?.ownerUser ? String(restaurant.ownerUser) : null,
  );
  if (!access) throw FORBIDDEN('You are not part of this order conversation');

  if (order.status === 'cancelled') {
    throw new AppError('Chat is closed for cancelled orders', 403);
  }
  if (order.status === 'delivered') {
    // Prefer the recorded delivery timestamp from the status history; fall
    // back to updatedAt for legacy orders that lack one.
    const deliveredEvent = Array.isArray(order.statusHistory)
      ? [...order.statusHistory].reverse().find((e) => e?.status === 'delivered')
      : null;
    const deliveredAt = deliveredEvent?.at
      ? new Date(deliveredEvent.at as unknown as string).getTime()
      : new Date(order.updatedAt as unknown as string).getTime();
    const age = Date.now() - (Number.isFinite(deliveredAt) ? deliveredAt : Date.now());
    if (age > CHAT_GRACE_AFTER_DELIVERY_MS) {
      throw new AppError('Chat closes 24 hours after delivery — please use support instead', 403);
    }
  }
  if (!access.counterpartId) {
    throw new AppError('There is no counterpart to chat with yet', 409);
  }
  return { access, order };
}

export async function sendOrderMessage(input: {
  orderId: string;
  senderId: string;
  body: string;
}): Promise<{ message: unknown; recipientId: string }> {
  // The sender's role/participation is re-derived from the order itself in
  // assertChatAccess — never taken from the request.
  const { access, order } = await assertChatAccess(input.orderId, input.senderId);
  const body = String(input.body ?? '').trim();
  if (!body) throw new AppError('Message cannot be empty', 422);
  if (body.length > 1000) throw new AppError('Message is too long (max 1000 chars)', 422);
  const recipientId = String(access.counterpartId);

  const message = await ChatMessageModel.create({
    order: String(order._id),
    ride: null,
    sender: String(input.senderId),
    senderRole: access.role,
    recipient: recipientId,
    body,
  });

  // Live delivery: the counterpart's open thread picks this up instantly.
  if (isSocketReady()) {
    getIO()
      .to(`user:${recipientId}`)
      .emit(SOCKET_EVENTS.chatMessage, {
        orderId: String(order._id),
        message,
      });
  }

  // Push (persisted row + Expo) so an app in the background still learns about it.
  await notifyUser(recipientId, {
    type: 'order',
    event: 'chat_message',
    refId: String(order._id),
    title: `New message — order ${order.orderNumber ?? ''}`.trim(),
    body: body.length > 90 ? `${body.slice(0, 90)}…` : body,
    data: {
      orderId: String(order._id),
      orderNumber: order.orderNumber ?? '',
      chatSenderRole: access.role,
    },
  }).catch(() => undefined);

  return { message, recipientId };
}

/** Lists a thread (oldest → newest) and marks the caller's unread as read. */
export async function listOrderMessages(
  orderId: string,
  userId: string,
  opts: { page?: number; limit?: number } = {},
) {
  const { access, order } = await assertChatAccess(orderId, userId);
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));

  const [messages, unread] = await Promise.all([
    ChatMessageModel.find({ order: orderId, deletedAt: null })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as unknown as unknown[],
    ChatMessageModel.countDocuments({
      order: orderId,
      recipient: userId,
      readAt: null,
      deletedAt: null,
    }).catch(() => 0),
  ]);

  // Opening the thread is the delivery receipt: everything addressed to me is
  // now read, so the badge can fall back to zero.
  if (Number(unread) > 0) {
    await markThreadRead(orderId, userId);
  }

  return {
    messages,
    page,
    limit,
    total: (messages as unknown[]).length,
    unreadBefore: unread,
    role: access.role,
    counterpartRole: access.counterpartRole,
    orderNumber: order.orderNumber,
  };
}

/** Lightweight unread badge count across every thread the user participates in. */
export async function unreadCountFor(userId: string): Promise<number> {
  const model = ChatMessageModel as unknown as {
    countDocuments: (filter: Record<string, unknown>) => Promise<number>;
  };
  try {
    return await model.countDocuments({ recipient: userId, readAt: null, deletedAt: null });
  } catch {
    return 0;
  }
}

/** Marks every unread message addressed to the user as read (thread scope). */
export async function markThreadRead(orderId: string, userId: string): Promise<void> {
  await ChatMessageModel.updateOne(
    { order: orderId, recipient: userId, readAt: { $eq: null } },
    { $set: { readAt: new Date() } },
  ).catch(() => undefined);
}

/** Pure: copy used for the chat header (who am I talking to). */
export function chatHeaderForRole(role: 'customer' | 'rider' | 'restaurant'): string {
  return role === 'customer' ? 'Support / Restaurant or Rider' : role === 'rider' ? 'Customer' : 'Customer';
}
