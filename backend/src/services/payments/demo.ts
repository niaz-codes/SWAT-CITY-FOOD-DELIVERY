import { demoPaymentsEnabled } from '../../config/env';
import { UserModel, WalletTransactionModel, type WalletTransaction } from '../../models';
import { creditWallet } from '../wallet.service';
import type {
  GatewayInitiateResult,
  GatewayVerifyResult,
  InitiateInput,
  PaymentProvider,
  VerifyInput,
} from './types';

/**
 * DEMO payment provider — for testing the whole checkout → payment → admin
 * pipeline WITHOUT real money.
 *
 * Rules baked in by design:
 *  - the provider exists only when the server env sets DEMO_PAYMENTS_ENABLED="true";
 *    nothing a client sends can switch it on;
 *  - it never contacts any bank/wallet gateway, so no real money can ever move;
 *  - every payment row, ledger row and UI badge is labelled "DEMO — NOT REAL MONEY";
 *  - settled demo money is recorded against the ADMIN's wallet ledger with the
 *    `demo_<transactionRef>` reference so a retry can never double-credit.
 */
export const DEMO_METHOD = 'demo' as const;
export const DEMO_LABEL = 'DEMO — NOT REAL MONEY';

export const demoProvider: PaymentProvider = {
  name: DEMO_METHOD,
  displayName: 'Demo Pay (DEMO — NOT REAL MONEY)',

  isConfigured(): boolean {
    return demoPaymentsEnabled;
  },

  configurationHint(): string {
    return 'Demo payments are disabled. Set DEMO_PAYMENTS_ENABLED="true" in the backend environment to switch them on.';
  },

  /**
   * Demo "initiation": no external page and no payer credential — the handoff
   * is null and the app goes straight to server verification. `gatewayRef`
   * mirrors the transactionRef so the record keeps the real gateways' shape.
   */
  async initiate(input: InitiateInput): Promise<GatewayInitiateResult> {
    if (!demoPaymentsEnabled) {
      return { ok: false, reason: demoProvider.configurationHint() };
    }
    return { ok: true, handoff: null, gatewayRef: `demo-${input.transactionRef}` };
  },

  /**
   * The backend is its own verifier for demo: the transaction "settled" the
   * moment we issued it. The amount contract mirrors real gateways — the
   * expected amount is echoed back and payment rows whose totals drifted are
   * never treated as paid.
   */
  async verify(input: VerifyInput): Promise<GatewayVerifyResult> {
    if (!demoPaymentsEnabled) {
      return { status: 'failed', reason: demoProvider.configurationHint(), code: 'DEMO_DISABLED' };
    }
    return {
      status: 'paid',
      amount: input.expectedAmountPkr,
      currency: 'PKR',
      gatewayRef: `demo-${input.transactionRef}`,
      raw: {
        demo: true,
        simulated: true,
        note: `${DEMO_LABEL} (no gateway was contacted; no real money moved)`,
      },
    };
  },
};

export interface DemoLedgerResult {
  credited: boolean;
  duplicate?: boolean;
  reason?: string;
  adminUserId?: string;
  transactionId?: string;
}

/**
 * Record a settled demo payment against the ADMIN's wallet: a `commission`
 * ledger row naming the unique transactionRef. The row IS the accounting entry
 * (wallet balance moves with it), and idempotency is checked manually here and
 * backstopped by the `wallet_transactions_demo_ref_key` unique index, so a
 * re-verify or double settle can never credit the admin twice.
 */
export async function recordDemoAdminLedger(
  order: {
    orderNumber?: string | null;
    total: number;
    _id: string | unknown;
    customer?: string | unknown;
  },
  payment: {
    _id: string | unknown;
    amount: number;
    transactionRef?: string | null;
    user?: string | unknown;
  },
): Promise<DemoLedgerResult> {
  const transactionRef = String(payment.transactionRef ?? '');
  if (!transactionRef) {
    return { credited: false, reason: 'Demo payment has no transactionRef' };
  }

  const admin = (await UserModel.find({ role: 'admin' }))[0];
  if (!admin) {
    return { credited: false, reason: 'No admin account exists to record the demo payment against' };
  }
  const adminId = String(admin._id);

  // Manual reuse-check + the unique-partial index make this idempotent.
  const reference = `demo_${transactionRef}`;
  const existing: WalletTransaction | null = await WalletTransactionModel.findOne({
    reference,
    user: adminId,
  });
  if (existing) {
    return { credited: false, duplicate: true, adminUserId: adminId };
  }

  const amount = Number(payment.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Demo payment has an invalid amount');
  }

  const { transaction } = await creditWallet(adminId, Math.round(amount), 'commission', {
    reference,
    description: `${DEMO_LABEL} — demo payment for order ${order.orderNumber ?? String(order._id)}`,
    byUser: payment.user ? String(payment.user) : undefined,
    metadata: {
      demo: true,
      orderId: String(order._id),
      orderNumber: order.orderNumber ?? null,
      transactionRef,
      paymentId: String(payment._id),
      customer: order.customer ? String(order.customer) : null,
    },
  });

  return { credited: true, adminUserId: adminId, transactionId: String(transaction._id) };
}
