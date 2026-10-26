import test from 'node:test';
import assert from 'node:assert/strict';
import { captureJournalLines, fundContributionJournalLines, isJournalBalanced, refundJournalLines } from '../src/services/ledger.js';

test('capture posting uses PayPal gross, fee and net values as balanced minor units', () => {
  const lines = captureJournalLines({ amount: { value: '125.00', currency_code: 'USD' }, seller_receivable_breakdown: { gross_amount: { value: '125.00' }, paypal_fee: { value: '3.25' }, net_amount: { value: '121.75' } } });
  assert.deepEqual(lines, [
    { accountCode: '1000', debitMinor: 12175, creditMinor: 0, currency: 'USD' },
    { accountCode: '5000', debitMinor: 325, creditMinor: 0, currency: 'USD' },
    { accountCode: '4000', debitMinor: 0, creditMinor: 12500, currency: 'USD' },
  ]);
  assert.equal(isJournalBalanced(lines), true);
});

test('capture without a complete reported breakdown posts to clearing without inventing a fee', () => {
  const lines = captureJournalLines({ amount: { value: '10.01', currency_code: 'USD' }, seller_receivable_breakdown: { paypal_fee: { value: '0.42' } } });
  assert.deepEqual(lines.map(({ accountCode, debitMinor, creditMinor }) => ({ accountCode, debitMinor, creditMinor })), [
    { accountCode: '1010', debitMinor: 1001, creditMinor: 0 },
    { accountCode: '4000', debitMinor: 0, creditMinor: 1001 },
  ]);
});

test('fund contribution captures credit Donations instead of Sales Revenue', () => {
  const capture = { amount: { value: '10.00', currency_code: 'USD' }, seller_receivable_breakdown: { gross_amount: { value: '10.00' }, paypal_fee: { value: '0.59' }, net_amount: { value: '9.41' } } };
  const lines = fundContributionJournalLines(capture);
  assert.deepEqual(lines.map(({ accountCode, debitMinor, creditMinor }) => ({ accountCode, debitMinor, creditMinor })), [
    { accountCode: '1000', debitMinor: 941, creditMinor: 0 },
    { accountCode: '5000', debitMinor: 59, creditMinor: 0 },
    { accountCode: '4100', debitMinor: 0, creditMinor: 1000 },
  ]);
  assert.equal(isJournalBalanced(lines), true);
});

test('refund posting uses the returned refund fee breakdown and does not presume fee reversal', () => {
  const noFeeReturned = refundJournalLines({ amount: { value: '10.00', currency_code: 'USD' }, seller_payable_breakdown: { gross_amount: { value: '10.00' }, paypal_fee: { value: '0.00' }, net_amount: { value: '10.00' } } });
  assert.equal(isJournalBalanced(noFeeReturned), true);
  assert.deepEqual(noFeeReturned.map(({ accountCode, debitMinor, creditMinor }) => ({ accountCode, debitMinor, creditMinor })), [
    { accountCode: '4050', debitMinor: 1000, creditMinor: 0 },
    { accountCode: '1000', debitMinor: 0, creditMinor: 1000 },
  ]);

  const feeReturned = refundJournalLines({ amount: { value: '10.00', currency_code: 'USD' }, seller_payable_breakdown: { gross_amount: { value: '10.00' }, paypal_fee: { value: '-0.25' }, net_amount: { value: '10.25' } } });
  assert.equal(isJournalBalanced(feeReturned), true);
  assert.deepEqual(feeReturned.map(({ accountCode, debitMinor, creditMinor }) => ({ accountCode, debitMinor, creditMinor })), [
    { accountCode: '4050', debitMinor: 1000, creditMinor: 0 },
    { accountCode: '1000', debitMinor: 0, creditMinor: 1025 },
    { accountCode: '5000', debitMinor: 25, creditMinor: 0 },
  ]);
});

test('ledger mapping rejects malformed or inconsistent provider amounts', () => {
  assert.throws(() => captureJournalLines({ amount: { value: '10.00', currency_code: 'USD' }, seller_receivable_breakdown: { gross_amount: { value: '10.00' }, paypal_fee: { value: '0.25' }, net_amount: { value: '9.00' } } }), /does not balance/);
  assert.throws(() => refundJournalLines({ amount: { value: '1.001', currency_code: 'USD' } }), /Invalid PayPal/);
  assert.equal(isJournalBalanced([{ debitMinor: 1, creditMinor: 0 }, { debitMinor: 0, creditMinor: 2 }]), false);
});
