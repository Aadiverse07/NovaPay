import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const data = require('../../src/dashboard-data.js');
const loader = await readFile(new URL('../../src/dashboard-live-data.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');

test('dashboard metric amounts use currency exponent and never combine currencies', () => {
  assert.equal(data.formatMajor('137.50', 'INR'), '₹137.50');
  assert.equal(data.formatMajor('13440.00', 'INR'), '₹13,440.00');
  assert.equal(data.formatMajor('1200', 'JPY'), '¥1,200');
  const metric = data.metrics([
    { currency: 'INR', account_type: 'revenue', amount_minor: '13750' },
    { currency: 'USD', account_type: 'revenue', amount_minor: '10000' },
    { currency: 'INR', account_type: 'contra_revenue', amount_minor: '500' },
    { currency: 'INR', account_type: 'expense', amount_minor: '250' }
  ], [{ currency: 'INR', fee_minor: '125' }], [{ currency: 'INR', refund_minor: '500' }]);
  assert.equal(metric.revenue, '₹137.50 · $100.00');
  assert.equal(metric.fees, '₹1.25');
  assert.equal(metric.refunds, '₹5.00');
  assert.equal(metric.net, '₹130.00 · $100.00');
});

test('empty organization metrics show no fabricated amount and empty cash movement', () => {
  const metric = data.metrics([], [], []);
  assert.equal(metric.revenue, '—');
  assert.equal(metric.fees, '—');
  assert.deepEqual(data.cashMovement([]), { multiCurrency: false, currency: null, points: [] });
});

test('cash movement refuses to sum different currencies', () => {
  const result = data.cashMovement([{ currency: 'INR', period: '2026-10-01', cash_movement_minor: '100' }, { currency: 'USD', period: '2026-10-01', cash_movement_minor: '100' }]);
  assert.equal(result.multiCurrency, true);
  assert.deepEqual(result.currencies, ['INR', 'USD']);
  assert.deepEqual(result.points, []);
});

test('authenticated dashboard loads tenant-scoped reports after auth and has retryable errors', () => {
  assert.match(loader, /Promise\.resolve\(auth\.ready\)/);
  assert.match(loader, /auth\.mode !== "supabase" \|\| !auth\.isAuthenticated\(\)/);
  for (const route of ['/api/reports/profit-and-loss', '/api/reports/fees', '/api/reports/refunds', '/api/reports/cash-flow-series', '/api/transactions']) assert.ok(loader.includes(route));
  assert.match(loader, /Couldn't load dashboard data\./);
  assert.match(loader, /button\.textContent = "Retry"/);
  assert.match(dashboard, /mode!=="demo"\|\|!window\.NovaPayAuth\.isAuthenticated\(\)\)return/);
  assert.match(html, /src="src\/dashboard-data\.js"/);
  assert.match(html, /src="src\/dashboard-live-data\.js"/);
});


test('cash flow uses currency separated cash series, live failures, and supports the currency selector', () => {
  assert.match(loader, /cash-flow-series/);
  assert.match(loader, /periodOverride \|\|/);
  assert.match(loader, /cashflow-currency/);
  assert.match(loader, /data\.cashCurrencies\(rows\)/);
  assert.match(loader, /cashText\(totals\.net,currency\)/);
});


test('cash flow summaries keep currencies separate, choose the busiest currency, and handle empty periods', () => {
  const rows=[
    {period:'2026-11',currency:'USD',money_in_minor:'15000',money_out_minor:'2500',net_minor:'12500'},
    {period:'2026-11',currency:'EUR',money_in_minor:'20000',money_out_minor:'1000',net_minor:'19000'},
    {period:'2026-12',currency:'USD',money_in_minor:'5',money_out_minor:'0',net_minor:'5'}
  ];
  assert.deepEqual(data.cashCurrencies(rows),{currencies:['EUR','USD'],defaultCurrency:'EUR'});
  assert.deepEqual(data.cashTotals(rows,'USD'),{moneyIn:'15005',moneyOut:'2500',net:'12505',count:2});
  assert.deepEqual(data.cashTotals([], 'USD'),{moneyIn:'0',moneyOut:'0',net:'0',count:0});
  assert.equal(data.formatMinor(data.cashTotals(rows,'USD').net,'USD'),'$125.05');
});
