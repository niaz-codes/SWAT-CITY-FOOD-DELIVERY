import { defineModel, type ModelApi } from '../db/model';
import { UserModel } from './User';

/**
 * Append-only audit trail for admin money/trust actions that are NOT already
 * covered by their own audit record:
 *
 *   payment approve/reject  -> payment_verifications (dedicated audit table)
 *   withdrawal payouts      -> withdrawal.metadata.audit rows
 *   everything below        -> THIS table
 *     rider_approve / rider_reject / rider_suspend / rider_activate
 *     order_cancel (admin-initiated cancel of a paid/refunded order)
 *     user_status (banning/activating an account)
 *     vehicle_decision (plate override / proposed vehicle approve-reject)
 *
 * One row per action: who did it, to what, when, and any free-text detail.
 * Never updated, never deleted — support and disputes read it verbatim.
 */
export type AdminAuditAction =
  | 'rider_approve'
  | 'rider_reject'
  | 'rider_suspend'
  | 'rider_activate'
  | 'rider_vehicle_plate'
  | 'rider_vehicle_decision'
  | 'order_cancel'
  | 'order_status_override'
  | 'user_status';

export interface AdminAudit {
  _id: string;

  /** The admin who performed the action. */
  admin: string;

  action: AdminAuditAction;

  /** 'rider' | 'order' | 'user' | 'withdrawal' — target domain. */
  targetType: string;

  /** The acted-on id (user id for riders, order/payment id, ...). */
  targetId: string;

  /** Short human-readable context; free text, never credentials. */
  detail?: string | null;

  createdAt: Date;
}

export const AdminAuditModel: ModelApi<AdminAudit> = defineModel<AdminAudit>({
  table: 'admin_audit',
  columns: ['admin', 'action', 'targetType', 'targetId', 'detail', 'createdAt'],
  refs: {
    admin: () => UserModel,
  },
});
