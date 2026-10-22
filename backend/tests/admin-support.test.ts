import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { supportStatusSchema } from '../src/validations/admin';

/**
 * Admin ticket updates used to lose the reply.
 *
 * The route validates `req.body` with this schema and the validated payload
 * replaces the body, so any field the schema does not declare is stripped
 * before the controller can append it. The controller then saw no `reply` and
 * silently saved only the status change.
 */
describe('admin support ticket updates', () => {
  it('keeps and trims the admin reply', () => {
    const parsed = supportStatusSchema.parse({
      status: 'in_progress',
      priority: 'high',
      reply: '  We are checking with the kitchen.  ',
    });
    assert.equal(parsed.reply, 'We are checking with the kitchen.');
  });

  it('can move the status without a reply', () => {
    const parsed = supportStatusSchema.parse({ status: 'resolved' });
    assert.equal(parsed.reply, undefined);
  });

  it('rejects a whitespace-only reply', () => {
    const result = supportStatusSchema.safeParse({ status: 'open', reply: '   ' });
    assert.equal(result.success, false);
  });

  it('drops fields the controller has no business receiving', () => {
    const parsed = supportStatusSchema.parse({
      status: 'open',
      reply: 'ok',
      adminNote: 'should not reach the controller',
    } as never);
    assert.equal('adminNote' in parsed, false);
  });
});
