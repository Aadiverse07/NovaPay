import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateAssistantActions } from '../src/ai/actions.js';

const require = createRequire(import.meta.url);
const core = require('../../src/transactions-grid-core.js');
function row(id, type, currency, gross, fee, net, date = '2026-10-20T10:00:00Z') {
  const values = [date, type, 'Buyer', `${currency} ${gross}`, fee == null ? 'Unavailable' : `${currency} ${fee}`, net == null ? 'Unavailable' : `${currency} ${net}`, 'Completed', id];
  return { dataset: { txId: id, type, status: 'Completed', currency, amount: gross.replaceAll(',', ''), date, source: 'paypal-sandbox', buyer: 'Buyer' }, cells: values.map((textContent) => ({ textContent })) };
}

test('transaction grid maps displayed gross, fee and net amounts without changing major-unit values', () => {
  const mapped = core.rowFromDom(row('CAP-1', 'Payment', 'INR', '10,000.00', '300.00', '9,700.00'));
  assert.deepEqual([mapped.id, mapped.type, mapped.gross, mapped.fee, mapped.net, mapped.currency], ['CAP-1', 'Payment', 10000, 300, 9700, 'INR']);
  assert.equal(core.parseMoney('-INR 2,000.00'), -2000);
  assert.equal(core.parseMoney('Unavailable'), null);
});

test('transaction grid external and quick filters compose on type, dates, amount, and search', () => {
  const mapped = core.rowFromDom(row('REF-7', 'Refund', 'INR', '2,500.00', null, '-2,500.00'));
  assert.equal(core.matchesFilters(mapped, { type: 'Refund', from: '2026-10-01', to: '2026-10-31', min: '2000', search: 'ref-7' }), true);
  assert.equal(core.matchesFilters(mapped, { type: 'Payment' }), false);
  assert.equal(core.matchesFilters(mapped, { max: '2000' }), false);
});

test('Payment check state maps from live row metadata and Needs review filters only flagged rows', () => {
  const input = row('CAP-REVIEW', 'Payment', 'USD', '10.00', null, '10.00');
  input.dataset.paymentCheck = 'needs_review';
  input.dataset.paymentReasons = '["duplicate_amount_payer: Possible duplicate amount and payer."]';
  const mapped = core.rowFromDom(input);
  assert.deepEqual(mapped.paymentCheck, { state: 'needs_review', reasons: ['duplicate_amount_payer: Possible duplicate amount and payer.'], verifiedWebhookReceived: false });
  assert.equal(core.matchesExternalFilters(mapped, { paymentCheck: 'needs_review' }), true);
  assert.equal(core.matchesExternalFilters(core.rowFromDom(row('CAP-OK', 'Payment', 'USD', '10.00', null, '10.00')), { paymentCheck: 'needs_review' }), false);
  assert.equal(core.rowFromDom(row('DEMO-1', 'Payment', 'USD', '10.00', null, '10.00')).paymentCheck, null);
});

test('transaction totals are grouped by currency and never sum mixed currencies', () => {
  const totals = core.totalsByCurrency([
    { id: 'a', currency: 'INR', gross: 100, fee: 2, net: 98 },
    { id: 'b', currency: 'INR', gross: 50, fee: 1, net: 49 },
    { id: 'c', currency: 'JPY', gross: 200, fee: 0, net: 200 },
  ]);
  assert.equal(totals.length, 2);
  assert.deepEqual(totals.map((entry) => [entry.currency, entry.gross, entry.fee, entry.net]), [['INR', 150, 3, 147], ['JPY', 200, 0, 200]]);
  assert.match(core.formatMoney(10000, 'INR'), /10,000/);
});

test('transactions.applyView is a strict tier-zero action and rejects raw AG Grid models', () => {
  const args = { type: 'Refund', dateFrom: '2026-10-12', dateTo: '2026-10-18', minAmount: 2000 };
  const valid = validateAssistantActions([{ id: 'transactions.applyView', args }], 'show refunds above 2000 from last week', 'viewer');
  assert.equal(valid.length, 1);
  assert.equal(valid[0].tier, 0);
  assert.equal(validateAssistantActions([{ id: 'transactions.applyView', args: { ...args, filterModel: { status: { filter: 'Refund' } } } }], 'show refunds above 2000 from last week', 'viewer').length, 0);
  assert.equal(validateAssistantActions([{ id: 'transactions.applyView', args: { sortBy: 'amount', sortDir: 'desc' } }], 'sort transactions by amount', 'viewer').length, 1);
  assert.equal(validateAssistantActions([{ id: 'transactions.applyView', args: { sortBy: 'amount', sortDir: 'desc', type: 'Refund' } }], 'sort transactions by amount', 'viewer').length, 0);
  assert.equal(validateAssistantActions([{ id: 'transactions.applyView', args: { sortBy: 'internalColumn', sortDir: 'asc' } }], 'sort transactions by amount', 'viewer').length, 0);
  assert.equal(validateAssistantActions([{ id: 'transactions.applyView', args: { minAmount: 1 } }], 'show transactions', 'viewer').length, 0);
});
