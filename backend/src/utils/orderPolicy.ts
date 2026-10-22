import type { OrderStatus } from '../models/Order';

/**
 * Which order states a rider may be assigned in.
 *
 * A rider self-accepting from the feed may only take an order the kitchen has
 * already packed (`ready`); dispatching them earlier leaves food waiting on a
 * rider. Admin dispatch is allowed to assign a pending/confirmed order because
 * an admin can see the live queue and make that call deliberately.
 */
export const RIDER_SELF_ASSIGNABLE: readonly OrderStatus[] = ['ready'];

export const ADMIN_ASSIGNABLE: readonly OrderStatus[] = ['ready', 'pending', 'confirmed'];

export function canAssignRider(status: OrderStatus, allowEarly = false): boolean {
  return (allowEarly ? ADMIN_ASSIGNABLE : RIDER_SELF_ASSIGNABLE).includes(status);
}
