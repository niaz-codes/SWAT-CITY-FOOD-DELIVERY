import {
  MANUAL_TRANSFER_METHODS,
  UserModel,
  OrderModel,
  PaymentModel,
} from '../models';
import { notifyUser } from './notification.service';
import { env } from '../config/env';

// ============================================================
// Swat City Backend - Payment reminder sweeper
//
// A manual-transfer order sits in `pending_verification` until an admin
// compares the submitted proof with the real bank statement. If the admin
// team has no free hands, the customer believes the order is silently lost.
// Every PAYMENT_REMINDER_HOURS the sweeper finds such stale submissions and
// sends ONE reminder to the customer (and a nudge to the admins) — a marker
// on the payment record makes the reminder strictly once per submission
// state, so nobody gets a push per sweep.
// ============================================================

const DEFAULT_INTERVAL_MS = 30 * 60_000;

/** Hours after submission before the first reminder is sent. */
function reminderHours(): number {
  return Number.isFinite(env.PAYMENT_REMINDER_HOURS) && env.PAYMENT_REMINDER_HOURS > 0
    ? env.PAYMENT_REMINDER_HOURS
    : 2;
}

/**
 * One reminder per pending manual-transfer submission. Re-submitting fresh
 * proof creates a fresh pending payment record, which will be reminded on its
 * own schedule — nothing here needs to track more than the marker.
 */
export async function sweepPendingVerificationReminders(): Promise<{ reminded: number }> {
  const cutoff = new Date(Date.now() - reminderHours() * 60 * 60_000);

  const stale = await PaymentModel.find({
    kind: 'order',
    method: { $in: [...MANUAL_TRANSFER_METHODS] },
    status: 'pending_verification',
    createdAt: { $lt: cutoff },
  })
    .limit(100)
    .lean();

  let reminded = 0;

  for (const payment of stale) {
    const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
    // Marker key is lowercase on purpose: the data layer lowercases both the
    // `metadata.remindersentat` filter path and jsonb key lookups, so a
    // camelCase key here would never match its own existence filter.
    if (metadata.remindersentat) continue;
    if (!payment.order) continue;

    const order = await OrderModel.findById(String(payment.order)).lean();
    if (!order || String(order.paymentStatus) !== 'pending_verification') continue;

    // The order must still be open for payment: a cancelled/expired order has
    // nothing to remind the customer about.
    if (String(order.status) === 'cancelled') continue;

    const claimed = await PaymentModel.findOneAndUpdate(
      // CAS on the un-reminded state so two racing sweeps cannot double-remind.
      { _id: String(payment._id), 'metadata.remindersentat': { $exists: false } },
      {
        // Dotted $set paths are not supported by the facade; the metadata
        // column is replaced whole (metadata itself never carries secrets —
        // credentials are stripped at write time in the gateway services).
        $set: {
          metadata: { ...metadata, remindersentat: new Date().toISOString() },
        },
      },
    );
    if (!claimed) continue;

    const hours = reminderHours();

    await notifyUser(String(order.customer), {
      type: 'order',
      // The notification CHECK constraint has no generic "reminder" event;
      // `order_placed` keeps manual-payment lifecycle pushes consistent —
      // proof-submitted and rejection alerts already use it.
      event: 'order_placed',
      refId: String(order._id),
      title: 'Payment still under verification',
      body: `Your payment proof for order ${order.orderNumber} has been waiting ${hours === 1 ? 'an hour' : `${hours} hours`} for manual verification. We will confirm it as soon as an admin checks the transfer.`,
      data: {
        orderId: String(order._id),
        orderNumber: order.orderNumber ?? '',
        paymentStatus: 'pending_verification',
        reminder: 'payment',
      },
    }).catch(() => undefined);

    reminded += 1;
  }

  // A single admin nudge per sweep at most: personally pinging every admin for
  // every stale payment would spam, and the panel already lists them flagged.
  if (reminded > 0) {
    const sample = stale[0];
    const order = sample?.order ? await OrderModel.findById(String(sample.order)).lean() : null;
    if (order) {
      const admins = await UserModel.find({
        role: 'admin',
        status: 'active',
        deletedAt: null,
      })
        .select('_id')
        .lean();
      await Promise.all(
        admins.map((admin) =>
          notifyUser(String(admin._id), {
            type: 'order',
            event: 'payment_settled',
            refId: String(order._id),
            title: 'Transfer verifications piling up',
            body: `${reminded} manual payment${reminded === 1 ? ' is' : 's are'} awaiting verification for over ${reminderHours()}h.`,
            data: { orderId: String(order._id), pendingCount: reminded },
          }).catch(() => undefined),
        ),
      );
    }
  }

  return { reminded };
}

/** Starts the periodic reminder sweep. Returns a stop function. */
export function startPaymentReminderSweeper(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  const tick = () => {
    void sweepPendingVerificationReminders()
      .then(({ reminded }) => {
        if (reminded > 0) {
          // eslint-disable-next-line no-console
          console.log(`[payments] reminders: ${reminded} pending-verification reminder(s) sent`);
        }
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[payments] reminder sweep failed:', error);
      });
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
