import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentCheck } from '../src/services/paymentCheck.js';

const rules = ['duplicate_amount_payer', 'fee_rate_spike', 'refund_rate_spike', 'large_payout', 'stale_webhook', 'dead_letter_webhook'];

test('completed capture with no anomaly and missing optional signals is confirmed only as a PayPal status', () => {
  assert.deepEqual(paymentCheck({ status: 'COMPLETED', transactionId: 'row-1', captureId: 'CAP-1' }), { state: 'confirmed', reasons: [] });
});

for (const rule of rules) test(`open ${rule} anomaly flags only the matching capture for human review`, () => {
  const result = paymentCheck({ status: 'COMPLETED', transactionId: 'row-1', captureId: 'CAP-1', anomalies: [{ rule, status: 'open', evidence_ids: ['row-1'] }] });
  assert.equal(result.state, 'needs_review');
  assert.match(result.reasons.join(' '), new RegExp(rule));
  assert.doesNotMatch(result.reasons.join(' '), /fraud-free|safe|verified payer/i);
});

test('failed or unverified webhook is unconfirmed and verified receipt is separate', () => {
  const failed = paymentCheck({ status: 'COMPLETED', transactionId: 'row-1', captureId: 'CAP-1', webhookEvents: [{ event_id: 'evt-1', verification_status: 'failed', processing_status: 'unverified' }] });
  assert.equal(failed.state, 'unconfirmed');
  assert.match(failed.reasons.join(' '), /webhook_signature/);
  assert.equal('verifiedWebhookReceived' in failed, false);
  const verified = paymentCheck({ status: 'COMPLETED', transactionId: 'row-1', captureId: 'CAP-1', webhookEvents: [{ event_id: 'evt-2', verification_status: 'verified', processing_status: 'processed' }] });
  assert.equal(verified.state, 'confirmed');
  assert.equal(verified.verifiedWebhookReceived, true);
});

test('non-completed or missing capture status needs review; seller protection is used only when present', () => {
  assert.equal(paymentCheck({ status: 'PENDING' }).state, 'needs_review');
  assert.match(paymentCheck({}).reasons.join(' '), /status is unavailable/);
  assert.equal(paymentCheck({ status: 'COMPLETED' }).state, 'confirmed');
  assert.equal(paymentCheck({ status: 'COMPLETED', sellerProtection: { status: 'NOT_ELIGIBLE' } }).state, 'needs_review');
  assert.equal(paymentCheck({ status: 'COMPLETED', sellerProtection: { status: 'ELIGIBLE' } }).state, 'confirmed');
});

test('anomalies without this transaction in evidence ids do not affect its signal', () => {
  assert.equal(paymentCheck({ status: 'COMPLETED', transactionId: 'row-a', captureId: 'CAP-a', anomalies: [{ rule: 'large_payout', status: 'open', evidence_ids: ['row-b', 'CAP-b'] }] }).state, 'confirmed');
});
