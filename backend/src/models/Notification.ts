import { defineModel } from '../db/model';
import { UserModel } from './User';

export const NOTIFICATION_KINDS = ['order', 'ride', 'promo', 'system', 'wallet'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Fine-grained event used for push routing. When a user taps a notification the
 * app reads `event` + `refId` and jumps straight to the right screen.
 * `kind` stays coarse so the in-app list can still group by category.
 */
export const NOTIFICATION_EVENTS = [
  'order_placed',
  'order_accepted',
  'order_rejected',
  'order_preparing',
  'order_ready',
  'rider_assigned',
  'rider_picked_up',
  'rider_on_the_way',
  'order_delivered',
  'order_cancelled',
  'ride_requested',
  'ride_accepted',
  'ride_arrived',
  'ride_completed',
  'ride_cancelled',
  'payment_settled',
  'announcement',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export interface Notification {
  _id: string;

  user: string;
  type: NotificationKind;
  /** Routing hint for push-tap navigation. */
  event: NotificationEvent;
  /** The entity the notification points at (order / ride / ticket _id). */
  refId: string;

  title: string;
  body: string;
  data: any;

  read: boolean;
  readAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationModel = defineModel<Notification>({
  table: 'notifications',
  columns: [
    'user',
    'type',
    'event',
    'refId',
    'title',
    'body',
    'data',
    'read',
    'readAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    user: () => UserModel,
  },
});
