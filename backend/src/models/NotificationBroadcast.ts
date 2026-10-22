import { defineModel } from '../db/model';
import { UserModel } from './User';

/** Audiences an admin can broadcast to. Mirrors the compose sheet in the app. */
export const BROADCAST_AUDIENCES = ['all', 'customers', 'riders'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/**
 * One row per admin broadcast, so the Notifications screen shows a real send
 * history (the per-user `notifications` table has no sender/audience column).
 */
export interface NotificationBroadcast {
  _id: string;

  title: string;
  body: string;
  audience: BroadcastAudience;
  /** Admin user id that sent the broadcast. */
  sentBy?: string | null;

  status: 'sent' | 'failed';
  /** Users that received an in-app notification row. */
  recipients: number;
  /** Device tokens targeted for the remote push. */
  pushed: number;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationBroadcastModel = defineModel<NotificationBroadcast>({
  table: 'notification_broadcasts',
  columns: [
    'title',
    'body',
    'audience',
    'sentBy',
    'status',
    'recipients',
    'pushed',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    sentBy: () => UserModel,
  },
});
