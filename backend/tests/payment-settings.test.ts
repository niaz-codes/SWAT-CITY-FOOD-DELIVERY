import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TRANSFER_CHANNELS,
  TRANSFERS_ENABLED_KEY,
  METHOD_BY_CHANNEL,
  envPaymentMethodDefaults,
  mergePaymentMethodConfig,
  paymentMethodSettingKey,
} from '../src/services/paymentSettings.service';

/**
 * PAYMENT METHOD SETTINGS — unit rules.
 *
 * The receiving accounts customers transfer into come from the database
 * (admin panel) with ENV defaults as the out-of-the-box fallback. These tests
 * pin the merge behaviour the admin panel and every checkout read depend on:
 * a saved row wins in full, display-only blanks cannot blank the checkout,
 * and an unknown channel can never slip a setting write through.
 */
describe('payment method settings', () => {
  it('serves exactly the three manual-transfer channels', () => {
    assert.deepEqual([...TRANSFER_CHANNELS].sort(), ['easypaisa', 'jazzcash', 'ubl']);
  });

  it('keys settings per channel and rejects unknown channels', () => {
    assert.equal(paymentMethodSettingKey('jazzcash'), 'payment_method_jazzcash');
    assert.equal(paymentMethodSettingKey('ubl'), 'payment_method_ubl');
    assert.equal(paymentMethodSettingKey('easypaisa'), 'payment_method_easypaisa');
    assert.throws(() => paymentMethodSettingKey('gateway' as never));
  });

  it('falls back to env defaults when nothing was saved (env values are the real numbers)', () => {
    for (const channel of TRANSFER_CHANNELS) {
      const { config, source } = mergePaymentMethodConfig(channel, undefined);
      assert.equal(source, 'env-default');
      const d = envPaymentMethodDefaults(channel);
      assert.deepEqual(config, d);
      // No invented values: a default account number/title MUST be present for
      // every enabled channel, otherwise the checkout would render an account
      // nobody can pay into.
      if (config.enabled) {
        assert.ok(config.accountTitle.length >= 3, `${channel} title`);
        assert.ok(config.accountNumber.length >= 5, `${channel} number`);
      }
    }
  });

  it('a database save replaces the env defaults wholesale', () => {
    const { config: saved, source } = mergePaymentMethodConfig('ubl', {
      enabled: true,
      bankName: 'UBL — renamed',
      accountTitle: 'Real Title',
      accountNumber: '1234567890',
      iban: 'PK36SCBL0000001123456702',
      branch: 'Mingora',
    });
    assert.equal(source, 'database');
    assert.equal(saved.enabled, true);
    assert.equal(saved.bankName, 'UBL — renamed');
    assert.equal(saved.accountTitle, 'Real Title');
    assert.equal(saved.accountNumber, '1234567890');
    assert.equal(saved.iban, 'PK36SCBL0000001123456702');
    assert.equal(saved.branch, 'Mingora');

    // A disabled save DISABLES the channel — the checkout must not offer it.
    const off = mergePaymentMethodConfig('ubl', { enabled: false }).config;
    assert.equal(off.enabled, false);
  });

  it('display-only blanks in a saved row fall back to book defaults (no empty checkout)', () => {
    const { config } = mergePaymentMethodConfig('easypaisa', {
      enabled: true,
      accountTitle: '',
      accountNumber: undefined,
    });
    const d = envPaymentMethodDefaults('easypaisa');
    assert.equal(config.accountTitle, d.accountTitle);
    assert.equal(config.accountNumber, d.accountNumber);
  });

  it('ignores junk values instead of crashing the checkout', () => {
    const { config, source } = mergePaymentMethodConfig('jazzcash', 'garbage' as unknown);
    assert.equal(source, 'env-default');
    assert.deepEqual(config, envPaymentMethodDefaults('jazzcash'));
    const nullCase = mergePaymentMethodConfig('jazzcash', null);
    assert.equal(nullCase.source, 'env-default');
  });

  it('maps storage channels onto the checkout method keys the order validation accepts', () => {
    assert.deepEqual(METHOD_BY_CHANNEL, {
      ubl: 'ubl',
      easypaisa: 'easypaisa_transfer',
      jazzcash: 'jazzcash_transfer',
    });
  });

  it('master switch has one fixed key the admin UI writes', () => {
    assert.equal(TRANSFERS_ENABLED_KEY, 'payment_transfers_enabled');
  });
});
