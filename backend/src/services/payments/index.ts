import type { GatewayName, PaymentProvider } from './types';
import { easypaisaProvider } from './easypaisa';
import { jazzcashProvider } from './jazzcash';
import { DEMO_LABEL, demoProvider } from './demo';

const providers: Record<GatewayName, PaymentProvider> = {
  easypaisa: easypaisaProvider,
  jazzcash: jazzcashProvider,
  demo: demoProvider,
};

export function getProvider(name: GatewayName): PaymentProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`No payment provider registered for '${name}'`);
  return provider;
}

/**
 * Which gateways can actually accept money right now. The checkout screen uses
 * this so an unconfigured gateway is disabled rather than failing at the worst
 * possible moment (after the payer has entered their wallet credentials).
 */
export function availableGateways(): Array<{
  method: GatewayName;
  displayName: string;
  enabled: boolean;
  reason?: string;
  /** Present on the demo row: the exact safety label every UI must show. */
  demoLabel?: string;
}> {
  return (Object.keys(providers) as GatewayName[]).map((method) => {
    const provider = providers[method];
    const enabled = provider.isConfigured();
    return {
      method,
      displayName: provider.displayName,
      enabled,
      // The demo row carries the safety label through every list so a client
      // can never render it as if real money moved.
      ...(method === 'demo' ? { demoLabel: DEMO_LABEL } : {}),
      reason: enabled ? undefined : provider.configurationHint(),
    };
  });
}

export * from './types';
export { easypaisaProvider, normalizeMsisdn } from './easypaisa';
export { DEMO_LABEL, DEMO_METHOD, demoProvider, recordDemoAdminLedger } from './demo';
export {
  jazzcashProvider,
  jazzCashSecureHash,
  verifyJazzCashReturnSignature,
  toPaisa,
} from './jazzcash';
