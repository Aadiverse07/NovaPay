import test from 'node:test';
import assert from 'node:assert/strict';
import { approveUrl, isValidOrderAmount, paypalRequestId, remainingRefundable } from '../src/services/paypal.js';

test('order amount accepts 0.01 through 10,000.00 with at most two decimals', () => {
  for (const value of ['0.01', '1', '1.2', '1.23', '10000', '10000.00']) assert.equal(isValidOrderAmount(value), true, value);
  for (const value of ['0', '0.001', '10000.01', '-1', '1.', '1.234', '1e2', ' 1']) assert.equal(isValidOrderAmount(value), false, value);
});

test('PayPal request ID is deterministic sha256(scope:id)', () => {
  assert.equal(paypalRequestId('order', 'abc'), 'np-5a65d01c227b73c76b84bd10b0c02411');
  assert.equal(paypalRequestId('order', 'abc'), paypalRequestId('order', 'abc'));
  assert.notEqual(paypalRequestId('capture', 'abc'), paypalRequestId('order', 'abc'));
});

test('approve URL requires https and a paypal.com hostname boundary', () => {
  assert.equal(approveUrl('https://www.paypal.com/checkoutnow'), 'https://www.paypal.com/checkoutnow');
  assert.equal(approveUrl('https://paypal.com/checkoutnow'), 'https://paypal.com/checkoutnow');
  for (const value of ['http://paypal.com/', 'https://evilpaypal.com/', 'https://paypal.com.evil.test/', 'javascript:alert(1)', '']) assert.equal(approveUrl(value), '');
});

test('refund remaining amount subtracts completed and reserved refunds', () => {
  assert.equal(remainingRefundable({ value: '50.00', refunded: 12.25, reserved: 7.75 }), 30);
  assert.equal(remainingRefundable({ value: '50.00' }), 50);
});
