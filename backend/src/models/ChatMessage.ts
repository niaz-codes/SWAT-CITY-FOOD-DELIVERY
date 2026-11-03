import { defineModel, type ModelApi } from '../db/model';
import { OrderModel } from './Order';
import { RideModel } from './Ride';
import { UserModel } from './User';

/**
 * A single message inside a per-order chat thread.
 *
 * Participation is always exactly the order's customer + the (assigned rider or
 * restaurant owner) pair — the sender/recipient pair is resolved by the chat
 * service and validated against the order, never taken from the client.
 *
 * `ride` may carry the linked ride thread of the same delivery job (a rider and
 * customer that handled an order together may also ride-chat about it); it is
 * informational for analytics and not used for participation.
 */
export interface ChatMessage {
  _id: string;

  order: string;
  ride?: string | null;

  /** Author of the message (never an admin — admins read, not chat). */
  sender: string;
  /** Coarse role of the author; used by clients to color/badge the bubble. */
  senderRole: 'customer' | 'rider' | 'restaurant';
  /** The other party in this thread pair. */
  recipient: string;

  /** Non-empty, ≤1000 chars, trimmed on write. */
  body: string;

  /** Set when the recipient opens the thread (bulk marked). */
  readAt?: Date | null;

  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ChatMessageModel: ModelApi<ChatMessage> = defineModel<ChatMessage>({
  table: 'chat_messages',
  columns: [
    'order',
    'ride',
    'sender',
    'senderRole',
    'recipient',
    'body',
    'readAt',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    order: () => OrderModel,
    ride: () => RideModel,
    sender: () => UserModel,
    recipient: () => UserModel,
  },
});
