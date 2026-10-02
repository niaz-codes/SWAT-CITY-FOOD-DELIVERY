import mongoose, { type InferSchemaType, Schema } from 'mongoose';

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

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_KINDS, default: 'system' },
    /** Routing hint for push-tap navigation. */
    event: { type: String, enum: NOTIFICATION_EVENTS, default: 'announcement' },
    /** The entity the notification points at (order / ride / ticket _id). */
    refId: { type: String, default: '' },

    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} },

    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof notificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationModel = mongoose.model('Notification', notificationSchema);