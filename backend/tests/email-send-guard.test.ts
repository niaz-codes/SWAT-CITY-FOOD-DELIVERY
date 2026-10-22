import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertEmailSent, emailSendFailure } from '../src/services/auth.service';
import { AppError } from '../src/utils/AppError';

/**
 * The guard every "we emailed you a code" flow calls.
 *
 * When the mail provider refuses the send, answering with a challenge anyway
 * would strand the user in front of an inbox that stays empty - the app would
 * show a code screen and wait forever. The failure has to become a visible,
 * retryable error instead.
 */
describe('verification email guard', () => {
  it('passes when the code really was emailed', () => {
    assert.doesNotThrow(() => assertEmailSent({ emailSent: true }));
  });

  it('turns a refused send into a retryable 502', () => {
    assert.throws(
      () => assertEmailSent({ emailSent: false }),
      (error: unknown) => {
        assert.ok(error instanceof AppError, 'the guard must throw an AppError');
        assert.equal(error.statusCode, 502);
        assert.match(error.message, /could not send/i);
        return true;
      },
    );
  });

  it('passes the provider cooldown on to the user', () => {
    const error = emailSendFailure({ retryAfterSeconds: 42 });
    assert.equal(error.statusCode, 502);
    assert.match(error.message, /42 seconds/);
  });

  it('still fails without a cooldown number', () => {
    const error = emailSendFailure({});
    assert.equal(error.statusCode, 502);
    assert.match(error.message, /try again/i);
  });
});
