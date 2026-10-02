import { PaymentModel, OrderModel } from '../models';
import { notifyUser } from './notification.service';
import { verifyOnlinePayment } from './payment.service';

/**
 * Expires online payments that were never completed.
 *
 * An abandoned wallet payment leaves an order in `pending` forever. The
 * restaurant and rider queues would then show an order nobody is paying for, and
 * the customer would have no way to recover it. This sweeps those orders out.
 *
 * Before giving up we ask the gateway once more: some payers close the browser
 * but the money still settles, and cancelling a genuinely paid order would be
 * far worse than waiting.
 */

const DEFAULT_INTERVAL_MS = 5 * 60_000;

function isGatewayMethod(method: string): method is 'easypaisa' | 'jazzcash' {
  return method === 'easypaisa' || method === 'jazzcash';
}

export async function sweepExpiredPayments(): Promise<{ expired: number; recovered: number }> {
  const cutoff = new Date();

  // Only online payments are swept; COD/wallet orders have nothing to expire.
  const stale = await PaymentModel.find({
    method: { $in: ['easypaisa', 'jazzcash'] },
    status: { $in: ['pending', 'processing'] },
    expiresAt: { $ne: null, $lt: cutoff },
  }).limit(200);

  let expired = 0;
  let recovered = 0;

  for (const payment of stale) {
    if (!isGatewayMethod(payment.method)) continue;

    // Last-chance check with the gateway: if it actually succeeded, we must
    // settle it rather than cancel it.
    try {
      const { result } = await verifyOnlinePayment({
        transactionRef: payment.transactionRef as string,
        method: payment.method,
      });
      if (result.status === 'paid') {
        recovered += 1;
        continue;
      }
      // Still genuinely in flight at the gateway — leave it alone and try again
      // on the next sweep rather than cancelling a possibly-live transaction.
      if (result.status === 'pending') continue;
    } catch {
      // A gateway outage must not cause us to cancel paid orders. Skip instead.
      continue;
    }

    payment.status = 'cancelled';
    payment.failureReason = 'Payment window expired before it was completed';
    await payment.save();

    const order = payment.order ? await OrderModel.findById(payment.order) : null;
    if (order && order.paymentStatus !== 'paid') {
      order.paymentStatus = 'failed';
      order.paymentFailureReason = 'Payment window expired before it was completed';
      if (order.status === 'pending') {
        order.previousStatus = order.status;
        order.status = 'cancelled';
        order.cancelReason = 'Payment was not completed in time';
        order.cancelledBy = 'system';
        order.statusHistory.push({ status: 'cancelled', note: 'Payment expired' });
      }
      await order.save();

      await notifyUser(String(order.customer), {
        type: 'order',
        event: 'order_cancelled',
        refId: String(order._id),
        title: 'Payment not completed',
        body: `Order ${order.orderNumber} was cancelled because payment was not completed in time.`,
        data: { orderId: String(order._id), orderNumber: order.orderNumber, status: 'cancelled' },
      }).catch(() => undefined);

      expired += 1;
    }
  }

  return { expired, recovered };
}

/**
 * Starts the periodic sweep. Returns a stop function so tests and shutdown can
 * clear the timer.
 */
export function startPaymentExpirySweeper(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  const tick = () => {
    void sweepExpiredPayments()
      .then(({ expired, recovered }) => {
        if (expired > 0 || recovered > 0) {
          // eslint-disable-next-line no-console
          console.log(`[payments] sweep: ${expired} expired, ${recovered} recovered late payments`);
        }
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[payments] sweep failed:', error);
      });
  };

  const timer = setInterval(tick, intervalMs);
  // Do not hold the event loop open on shutdown.
  timer.unref?.();
  return () => clearInterval(timer);
}