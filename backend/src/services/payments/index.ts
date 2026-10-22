import type { GatewayName, PaymentProvider } from './types';
import { easypaisaProvider } from './easypaisa';
import { jazzcashProvider } from './jazzcash';

const providers: Record<GatewayName, PaymentProvider> = {
  easypaisa: easypaisaProvider,
  jazzcash: jazzcashProvider,
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
}> {
  return (Object.keys(providers) as GatewayName[]).map((method) => {
    const provider = providers[method];
    const enabled = provider.isConfigured();
    return {
      method,
      displayName: provider.displayName,
      enabled,
      reason: enabled ? undefined : provider.configurationHint(),
    };
  });
}

export * from './types';
export { easypaisaProvider, normalizeMsisdn } from './easypaisa';
export {
  jazzcashProvider,
  jazzCashSecureHash,
  verifyJazzCashReturnSignature,
  toPaisa,
} from './jazzcash';
