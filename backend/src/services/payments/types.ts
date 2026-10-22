import type { GatewayPaymentMethod } from '../../models';

export type GatewayName = GatewayPaymentMethod;

/**
 * How the payer must be sent to the gateway.
 *
 * JazzCash and Easypaisa both use hosted checkout: we render/POST to their page,
 * the payer logs in with their own wallet credentials, then they bounce back to
 * our return URL. We never see or handle the payer's wallet password.
 */
export type GatewayHandoff =
  | { type: 'redirect'; url: string }
  | {
      type: 'form';
      /** Gateway endpoint that receives the signed POST. */
      url: string;
      /** Exact field names + values to post. Contains no secrets. */
      fields: Record<string, string>;
    };

export type GatewayInitiateResult =
  | { ok: true; handoff: GatewayHandoff | null; gatewayRef?: string }
  | { ok: false; code?: string; reason: string };

export type GatewayVerifyResult =
  | {
      status: 'paid';
      amount: number;
      currency: string;
      gatewayRef?: string;
      raw?: Record<string, unknown>;
    }
  | { status: 'failed'; reason: string; code?: string; raw?: Record<string, unknown> }
  | { status: 'pending'; reason: string; code?: string; raw?: Record<string, unknown> };

export interface InitiateInput {
  /** Reference we generated; the gateway uses this to identify the transaction. */
  transactionRef: string;
  /** Total to charge in whole PKR. Providers convert to their own units. */
  amountPkr: number;
  orderNumber: string;
  description: string;
  returnUrl: string;
  /** 03xxxxxxxxx — required by Easypaisa, used by JazzCash as a mobile field. */
  customerPhone: string;
  customerEmail: string;
}

export interface VerifyInput {
  transactionRef: string;
  /** Expected amount in whole PKR; a mismatch must never be treated as paid. */
  expectedAmountPkr: number;
  /** Gateway transaction reference captured at initiation, when we have one. */
  gatewayRef?: string;
}

export interface PaymentProvider {
  readonly name: GatewayName;
  readonly displayName: string;
  isConfigured(): boolean;
  /** Human-readable reason when credentials are missing, for admin diagnostics. */
  configurationHint(): string;
  initiate(input: InitiateInput): Promise<GatewayInitiateResult>;
  /** Server-to-server inquiry. This — never a browser redirect — is the truth. */
  verify(input: VerifyInput): Promise<GatewayVerifyResult>;
}

/** Response code Jazz returns for a successful transaction. */
export const JAZZCASH_SUCCESS_CODE = '000';
/** Easypaisa's documented success code. */
export const EASYPAISA_SUCCESS_CODE = '0000';

/** Terminal Easypaisa `transactionStatus` values that mean "money did not move". */
export const EASYPAISA_TERMINAL_FAILURES = ['FAILED', 'EXPIRED', 'BLOCKED', 'REVERSED'] as const;
