import dotenv from 'dotenv';
dotenv.config();
import { PaymentModel } from './src/models/Payment';
import { OrderModel } from './src/models/Order';

const CUSTOMER_ID = process.env.E2E_CUSTOMER_ID ?? '2f56ce0d-1436-43b4-b179-93ec3ce8817b';
const KEY = process.env.PROBE_KEY ?? 'probe-idem-1793754911870';

const byKey = await PaymentModel.findOne({ idempotencyKey: KEY, user: CUSTOMER_ID } as any);
console.log('findOne by key+user:', JSON.stringify(byKey, null, 2).slice(0, 500));

const byUser = await PaymentModel.find({ user: CUSTOMER_ID } as any)
  .sort('-createdAt')
  .limit(3)
  .lean();
console.log(
  'latest payments:',
  byUser.map((p) => ({
    id: p._id,
    method: p.method,
    status: p.status,
    idem: p.idempotencyKey,
    order: p.order,
  })),
);

const order = byKey?.order ? await OrderModel.findById(byKey.order as string).lean() : null;
console.log(
  'order via payment.order:',
  order ? { id: order._id, status: order.status, paymentStatus: order.paymentStatus } : null,
);
process.exit(0);
